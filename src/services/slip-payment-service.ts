import "server-only";
import { ApiError } from "@/lib/api";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { deleteObjects, isR2Configured, presignGet, putObject } from "@/lib/storage/r2";
import { sniffImageType } from "@/lib/security/image";
import { parseSlipQr, promptPayPayload } from "@/lib/promptpay";
import type { LanternInput } from "@/lib/security/validation";
import type { Quote, Selection } from "@/types/catalog";
import type { PaymentStatus, PromptPayOrder, SlipResult, SlipStatus } from "@/types/payment";
import { createPendingLantern, findLanternByRequest } from "./lantern-service";
import { log } from "./logger";
import {
  checkSlip,
  getSlipConfig,
  SLIP_MAX_BYTES,
  SlipProviderError,
  verifySlipWithProvider,
  type SlipConfig,
  type VerifiedSlip,
} from "./slip-verify";

/**
 * PromptPay QR + transfer slip payments:
 *   checkout → pending lantern + pending payment (amount from the server-side quote) + QR payload
 *   slip upload → free checks (image type, slip QR, transRef never used) → slip API (bank-verified)
 *   → amount / receiver / date checks → activate_slip_payment() (paid + lantern released, one transaction)
 */

export const SLIP_METHOD = "promptpay_slip";
/** QR countdown shown to the payer. Slips are still accepted after it (until the order is cleaned up). */
export const QR_TTL_MS = 30 * 60 * 1000;
/** Pending QR orders older than this are closed by the cleanup job (same as abandoned Stripe checkouts) */
export const SLIP_ORDER_ABANDON_MS = 2 * 60 * 60 * 1000;
export const SLIP_BUCKET = "payment-slips";

const usedSlip = () => new ApiError(409, "slip_used", "สลิปนี้ถูกใช้ไปแล้ว ไม่สามารถใช้ซ้ำได้ กรุณาแนบสลิปของการโอนครั้งนี้");
const orderGone = () =>
  new ApiError(409, "order_unavailable", "รายการนี้หมดอายุแล้ว หากคุณโอนเงินแล้ว สลิปถูกบันทึกไว้ให้ผู้ดูแลตรวจสอบ กรุณาติดต่อผู้ดูแล");

function summarize(q: Quote) {
  const parts = q.lines.map((l) => (l.kind === "offering" ? `ใส่เงิน ฿${l.amount}` : l.name.replace(/^(สีโคม|เอฟเฟกต์) /, "")));
  return `โคมอธิษฐาน${parts.length ? ` + ${parts.join(", ")}` : ""}`.slice(0, 200);
}

interface PaymentRow {
  id: string;
  user_id: string;
  lantern_id: string | null;
  amount: number | string;
  payment_status: PaymentStatus;
  payment_method: string | null;
  created_at: string;
  expires_at: string | null;
  lanterns: { status: string; content_purged_at: string | null } | null;
}

async function loadPayment(paymentId: string): Promise<PaymentRow | null> {
  const { data, error } = await getAdminSupabase()
    .from("payments")
    .select("id, user_id, lantern_id, amount, payment_status, payment_method, created_at, expires_at, lanterns!payments_lantern_id_fkey(status, content_purged_at)")
    .eq("id", paymentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as unknown as PaymentRow | null;
}

async function loadOwnSlipPayment(userId: string, paymentId: string) {
  const pay = await loadPayment(paymentId);
  if (!pay || pay.user_id !== userId || pay.payment_method !== SLIP_METHOD) throw new ApiError(404, "not_found", "ไม่พบรายการชำระเงิน");
  return pay;
}

const lanternAvailable = (p: PaymentRow) => !!p.lanterns && !p.lanterns.content_purged_at && ["pending_payment", "cancelled", "active"].includes(p.lanterns.status);

async function toOrder(pay: PaymentRow, cfg: SlipConfig): Promise<PromptPayOrder> {
  const { data: last } = await getAdminSupabase()
    .from("payment_slips")
    .select("status, reason, message")
    .eq("payment_id", pay.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const amount = Number(pay.amount);
  return {
    paymentId: pay.id,
    lanternId: pay.lantern_id,
    amount,
    qrPayload: promptPayPayload(cfg.promptPay.digits, amount),
    receiverName: cfg.names[0] ?? null,
    createdAt: pay.created_at,
    expiresAt: pay.expires_at ?? new Date(Date.parse(pay.created_at) + QR_TTL_MS).toISOString(),
    paymentStatus: pay.payment_status,
    lanternStatus: pay.lanterns?.status ?? null,
    lastSlip: last ? { status: last.status as SlipStatus, reason: last.reason, message: last.message } : null,
  };
}

/* ------------------------------------------------------------------ checkout */

export async function createPromptPayOrder(userId: string, input: LanternInput, selection: Selection, q: Quote, requestId: string): Promise<PromptPayOrder> {
  if (q.total <= 0) throw new ApiError(400, "free", "รายการนี้ไม่ต้องชำระเงิน");
  // never let anyone pay before slips can be verified
  const cfg = getSlipConfig();
  const db = getAdminSupabase();

  // same request again (double tap / reload) → the same open order
  const existing = await findLanternByRequest(userId, requestId);
  if (existing) {
    if (existing.status !== "pending_payment" || !existing.payment_id) throw new ApiError(409, "already_processed", "คำขอนี้ถูกดำเนินการไปแล้ว");
    const pay = await loadPayment(existing.payment_id);
    if (pay && pay.user_id === userId && pay.payment_method === SLIP_METHOD && pay.payment_status === "pending") return toOrder(pay, cfg);
    throw new ApiError(409, "session_closed", "รายการชำระเงินเดิมปิดไปแล้ว กรุณาเริ่มสร้างรายการใหม่");
  }

  const lanternId = await createPendingLantern(userId, input, selection, requestId);
  if (!lanternId) throw new ApiError(409, "duplicate_request", "คำขอซ้ำ กรุณาลองใหม่");

  const { data: payment, error } = await db
    .from("payments")
    .insert({
      user_id: userId,
      lantern_id: lanternId,
      package_id: null,
      package_name: summarize(q),
      amount: q.total,
      currency: "thb",
      line_items: q.lines,
      payment_method: SLIP_METHOD,
      payment_status: "pending",
      expires_at: new Date(Date.now() + QR_TTL_MS).toISOString(),
    })
    .select("id")
    .single();
  if (error) {
    await db.from("lanterns").update({ status: "cancelled" }).eq("id", lanternId);
    throw new Error(error.message);
  }
  await db.from("lanterns").update({ payment_id: payment.id }).eq("id", lanternId);

  const pay = await loadPayment(payment.id);
  if (!pay) throw new Error("payment vanished");
  return toOrder(pay, cfg);
}

export async function getPromptPayOrder(userId: string, paymentId: string) {
  const pay = await loadOwnSlipPayment(userId, paymentId);
  return toOrder(pay, getSlipConfig());
}

export async function cancelPromptPayOrder(userId: string, paymentId: string) {
  const pay = await loadOwnSlipPayment(userId, paymentId);
  if (pay.payment_status !== "pending") return { status: pay.payment_status };
  const { error } = await getAdminSupabase().rpc("close_unpaid_payment_by_id", { p_payment_id: pay.id, p_status: "cancelled", p_reason: "cancelled by user" });
  if (error) throw new Error(`close_unpaid_payment_by_id: ${error.message}`);
  return { status: "cancelled" as PaymentStatus };
}

/* ------------------------------------------------------------------ slip storage */

type SlipImageType = "image/jpeg" | "image/png" | "image/webp";
const EXT: Record<SlipImageType, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

async function storeSlipImage(userId: string, paymentId: string, bytes: Uint8Array, type: SlipImageType) {
  const path = `slips/${userId}/${paymentId}-${crypto.randomUUID()}.${EXT[type]}`;
  if (isR2Configured()) {
    await putObject(path, bytes, type, "private, no-store");
    return { path, store: "r2" as const };
  }
  const { error } = await getAdminSupabase().storage.from(SLIP_BUCKET).upload(path, bytes, { contentType: type, upsert: false });
  if (error) throw new Error(`slip upload failed: ${error.message}`);
  return { path, store: "supabase" as const };
}

/** Short-lived URL for the admin thumbnail */
export async function signSlipImage(path: string | null, store: string | null, expiresInSeconds = 900): Promise<string | null> {
  if (!path) return null;
  try {
    if (store === "r2") return isR2Configured() ? await presignGet(path, expiresInSeconds) : null;
    const { data } = await getAdminSupabase().storage.from(SLIP_BUCKET).createSignedUrl(path, expiresInSeconds);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ slip verification */

type SlipRowUpdate = Partial<{
  status: SlipStatus;
  reason: string | null;
  message: string | null;
  trans_ref: string | null;
  amount: number | null;
  slip_date: string | null;
  sender_name: string | null;
  sender_bank: string | null;
  receiver_name: string | null;
  receiver_account: string | null;
  receiver_proxy: string | null;
  receiver_bank: string | null;
  is_duplicate: boolean | null;
}>;

async function updateSlip(id: string, patch: SlipRowUpdate) {
  const { error } = await getAdminSupabase().from("payment_slips").update(patch).eq("id", id);
  if (error) await log("warn", "slip-payment", "could not update slip row", { id, error: error.message });
}

async function reject(slipId: string, code: string, message: string, status = 422, slipStatus: SlipStatus = "rejected"): Promise<never> {
  await updateSlip(slipId, { status: slipStatus, reason: code, message });
  throw new ApiError(status, code, message);
}

function slipDetails(slip: VerifiedSlip): SlipRowUpdate {
  return {
    trans_ref: slip.transRef,
    amount: slip.amount,
    slip_date: slip.date,
    sender_name: slip.sender.name,
    sender_bank: slip.sender.bank,
    receiver_name: slip.receiver.name,
    receiver_account: slip.receiver.account,
    receiver_proxy: slip.receiver.proxyAccount ? `${slip.receiver.proxyType ?? ""} ${slip.receiver.proxyAccount}`.trim().slice(0, 60) : null,
    receiver_bank: slip.receiver.bank,
    is_duplicate: slip.isDuplicate,
  };
}

async function usedByPayment(transRef: string): Promise<string | null | undefined> {
  const { data, error } = await getAdminSupabase().from("slip_transactions").select("payment_id").eq("trans_ref", transRef).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? (data.payment_id as string | null) : undefined;
}

export interface SlipUpload {
  bytes: Uint8Array;
  /** slip mini-QR decoded in the browser, if it could read it */
  payload?: string | null;
}

export async function submitSlip(userId: string, paymentId: string, upload: SlipUpload, fetchImpl?: typeof fetch): Promise<SlipResult> {
  const db = getAdminSupabase();
  const pay = await loadOwnSlipPayment(userId, paymentId);
  if (pay.payment_status === "paid") return { status: "paid", lanternId: pay.lantern_id, alreadyProcessed: true };
  if (!["pending", "expired", "cancelled"].includes(pay.payment_status)) throw new ApiError(409, "payment_closed", "รายการชำระเงินนี้ปิดไปแล้ว");

  // ---- free checks (no paid API call)
  const { bytes } = upload;
  if (!bytes.byteLength) throw new ApiError(400, "empty_file", "ไฟล์ว่างเปล่า");
  if (bytes.byteLength > SLIP_MAX_BYTES) throw new ApiError(413, "file_too_large", "ไฟล์สลิปต้องมีขนาดไม่เกิน 4 MB");
  const sniffed = sniffImageType(bytes);
  if (!sniffed) throw new ApiError(415, "unsupported_type", "รองรับเฉพาะภาพสลิป JPG, PNG หรือ WEBP");
  const type = `image/${sniffed}` as SlipImageType;
  const qr = upload.payload ? parseSlipQr(upload.payload) : null;
  if (qr) {
    const owner = await usedByPayment(qr.transRef);
    // already paid this very order (the payment row just committed in a parallel request)
    if (owner === pay.id) return { status: "paid", lanternId: pay.lantern_id, alreadyProcessed: true };
    if (owner !== undefined) throw usedSlip();
  }

  let cfg: SlipConfig | null = null;
  let cfgError: unknown = null;
  try {
    cfg = getSlipConfig();
  } catch (e) {
    cfgError = e;
  }

  // ---- keep the slip for the admin before anything else can fail
  const stored = await storeSlipImage(userId, pay.id, bytes, type);
  const { data: slipRow, error: slipErr } = await db
    .from("payment_slips")
    .insert({
      payment_id: pay.id,
      user_id: userId,
      image_path: stored.path,
      image_store: stored.store,
      image_type: type,
      qr_payload: qr?.payload ?? null,
      trans_ref: qr?.transRef ?? null,
      status: "processing",
      provider: cfg?.provider ?? null,
    })
    .select("id")
    .single();
  if (slipErr) throw new Error(slipErr.message);
  const slipId = slipRow.id as string;

  // an image without a readable Thai slip QR never reaches the paid API (kept for the admin)
  if (!qr) {
    return reject(
      slipId,
      "no_slip_qr",
      "ไม่พบ QR ของสลิปในภาพนี้ กรุณาแนบภาพสลิปต้นฉบับที่บันทึกจากแอปธนาคาร (ไม่ครอปส่วน QR มุมขวาล่างออก) หรือติดต่อผู้ดูแล",
    );
  }
  if (!cfg) {
    await updateSlip(slipId, { status: "pending_review", reason: "not_configured", message: "slip API not configured" });
    throw cfgError;
  }
  if (!lanternAvailable(pay)) await reject(slipId, "order_unavailable", orderGone().message, 409, "pending_review");

  // ---- bank verification (paid API call)
  let slip: VerifiedSlip;
  let names: string[];
  try {
    ({ slip, names } = await verifySlipWithProvider(
      { payload: qr.payload, remark: pay.id },
      cfg,
      fetchImpl,
    ));
  } catch (e) {
    if (!(e instanceof SlipProviderError)) throw e;
    if (e.code === "provider_unavailable") {
      await log("error", "slip-verify", "slip provider unavailable", { paymentId: pay.id, providerCode: e.providerCode });
      return reject(slipId, e.code, e.message, 503, "error");
    }
    return reject(slipId, e.code, e.message, e.status);
  }
  await updateSlip(slipId, slipDetails(slip));

  // ---- never twice
  const owner = await usedByPayment(slip.transRef);
  if (owner === pay.id) return { status: "paid", lanternId: pay.lantern_id, alreadyProcessed: true };
  if (owner !== undefined) return reject(slipId, "slip_used", usedSlip().message, 409);
  if (slip.isDuplicate) {
    // the provider has seen this slip before (SlipOK 1012 / EasySlip isDuplicate) – fine only when it was
    // this visitor retrying the same slip here (e.g. after a timeout); same QR payload = same slip
    const { count } = await db
      .from("payment_slips")
      .select("id", { count: "exact", head: true })
      .eq("qr_payload", qr.payload)
      .eq("user_id", userId)
      .neq("id", slipId);
    if (!count) return reject(slipId, "slip_used", usedSlip().message, 409);
  }

  // ---- amount ≥ due, receiver = our PromptPay, made around the order time
  const check = checkSlip(slip, names, { amountDue: Number(pay.amount), createdAt: pay.created_at }, cfg);
  if (!check.ok) return reject(slipId, check.code, check.message);

  return activate(pay, slipId, slip.transRef, slip.amount);
}

async function activate(pay: PaymentRow, slipId: string | null, transRef: string, amount: number, source: "auto" | "admin" = "auto"): Promise<SlipResult> {
  const { data, error } = await getAdminSupabase().rpc("activate_slip_payment", {
    p_payment_id: pay.id,
    p_slip_id: slipId,
    p_trans_ref: transRef,
    p_amount: amount,
    p_source: source,
  });
  if (error) {
    const fail = (code: string, msg: string, status = 409) => (slipId ? reject(slipId, code, msg, status) : Promise.reject(new ApiError(status, code, msg)));
    if (error.code === "23505") return fail("slip_used", usedSlip().message);
    if (error.code === "P0001") return fail("amount_too_low", "ยอดโอนในสลิปน้อยกว่ายอดที่ต้องชำระ", 422);
    if (error.code === "P0004") return slipId ? reject(slipId, "order_unavailable", orderGone().message, 409, "pending_review") : Promise.reject(orderGone());
    if (error.code === "P0003") return fail("payment_closed", "รายการชำระเงินนี้ปิดไปแล้ว");
    throw new Error(`activate_slip_payment: ${error.message}`);
  }
  const row = (Array.isArray(data) ? data[0] : data) as { lantern_id: string | null; already_processed: boolean } | null;
  await log("info", "slip-payment", row?.already_processed ? "slip payment already processed" : "lantern released after slip verification", {
    paymentId: pay.id,
    lanternId: row?.lantern_id,
    source,
  });
  return { status: "paid", lanternId: row?.lantern_id ?? pay.lantern_id, alreadyProcessed: !!row?.already_processed };
}

/* ------------------------------------------------------------------ admin */

/** Manual approval after the admin checked the slip in the bank app (e.g. provider down, masked receiver) */
export async function adminApproveSlipPayment(paymentId: string, staffId: string): Promise<SlipResult> {
  const pay = await loadPayment(paymentId);
  if (!pay || pay.payment_method !== SLIP_METHOD) throw new ApiError(404, "not_found", "ไม่พบรายการชำระเงินแบบสลิป");
  if (pay.payment_status === "paid") return { status: "paid", lanternId: pay.lantern_id, alreadyProcessed: true };
  const { data: slip } = await getAdminSupabase()
    .from("payment_slips")
    .select("id, trans_ref, amount")
    .eq("payment_id", pay.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!slip) throw new ApiError(400, "no_slip", "รายการนี้ยังไม่มีสลิปแนบมา");
  const transRef = (slip.trans_ref as string | null) ?? `manual-${pay.id}`;
  const amount = Math.max(Number(pay.amount), Number(slip.amount ?? 0));
  await log("info", "slip-payment", "admin approved slip payment", { paymentId: pay.id, staffId, slipId: slip.id });
  return activate(pay, slip.id as string, transRef, amount, "admin");
}

/** Abandoned QR orders → expired (lantern cancelled). Called by the cleanup job. */
export async function expireAbandonedSlipOrders(limit = 200) {
  const db = getAdminSupabase();
  const { data, error } = await db
    .from("payments")
    .select("id")
    .eq("payment_status", "pending")
    .eq("payment_method", SLIP_METHOD)
    .lt("created_at", new Date(Date.now() - SLIP_ORDER_ABANDON_MS).toISOString())
    .limit(limit);
  if (error) throw new Error(error.message);
  let closed = 0;
  for (const p of data ?? []) {
    const { error: e } = await db.rpc("close_unpaid_payment_by_id", { p_payment_id: p.id, p_status: "expired", p_reason: "abandoned QR order" });
    if (e) await log("warn", "cleanup", "close_unpaid_payment_by_id failed", { paymentId: p.id, error: e.message });
    else closed++;
  }
  return closed;
}

/** Slip images (names, masked account numbers) are kept this long for disputes, then deleted */
export const SLIP_IMAGE_RETENTION_MS = 90 * 24 * 3600 * 1000;

/** Deletes slip images older than 90 days (the verification result / transRef row stays). Called by the cleanup job. */
export async function purgeOldSlipImages(limit = 500) {
  const db = getAdminSupabase();
  const { data, error } = await db
    .from("payment_slips")
    .select("id, image_path, image_store")
    .not("image_path", "is", null)
    .lt("created_at", new Date(Date.now() - SLIP_IMAGE_RETENTION_MS).toISOString())
    .limit(limit);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{ id: string; image_path: string; image_store: string | null }>;
  if (!rows.length) return 0;
  const r2 = rows.filter((r) => r.image_store === "r2").map((r) => r.image_path);
  const supa = rows.filter((r) => r.image_store !== "r2").map((r) => r.image_path);
  if (r2.length) {
    if (!isR2Configured()) throw new Error("R2 is not configured – cannot delete old slip images");
    await deleteObjects(r2);
  }
  if (supa.length) {
    const { error: rmErr } = await db.storage.from(SLIP_BUCKET).remove(supa);
    if (rmErr) throw new Error(`slip image remove failed: ${rmErr.message}`);
  }
  const { error: updErr } = await db
    .from("payment_slips")
    .update({ image_path: null, image_store: null, sender_name: null })
    .in(
      "id",
      rows.map((r) => r.id),
    );
  if (updErr) throw new Error(updErr.message);
  return rows.length;
}
