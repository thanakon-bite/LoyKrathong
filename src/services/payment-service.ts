import "server-only";
import type Stripe from "stripe";
import { ApiError } from "@/lib/api";
import { publicEnv, stripePaymentMethods } from "@/lib/env";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { fromMinorUnit, getStripe, toMinorUnit } from "@/lib/stripe/server";
import type { LanternInput } from "@/lib/security/validation";
import type { CheckoutStatus, PaymentRecord, PaymentStatus } from "@/types/payment";
import type { Quote, Selection } from "@/types/catalog";
import { createPendingLantern, findLanternByRequest } from "./lantern-service";
import { log } from "./logger";

/** Stripe Checkout sessions must live at least 30 minutes */
const CHECKOUT_TTL_SECONDS = 30 * 60;

/** Short human summary stored with the payment, e.g. "โคม + พลุ, หัวใจ + ใส่เงิน ฿99" */
function summarize(q: Quote) {
  const parts = q.lines.map((l) => (l.kind === "offering" ? `ใส่เงิน ฿${l.amount}` : l.name.replace(/^(สีโคม|เอฟเฟกต์) /, "")));
  return `โคมอธิษฐาน${parts.length ? ` + ${parts.join(", ")}` : ""}`.slice(0, 200);
}

export async function createCheckoutSession(
  userId: string,
  input: LanternInput,
  selection: Selection,
  q: Quote,
  requestId: string,
): Promise<{ url: string; paymentId: string }> {
  if (q.total <= 0) throw new ApiError(400, "free", "รายการนี้ไม่ต้องชำระเงิน");

  const db = getAdminSupabase();
  const stripe = getStripe();

  // Same request submitted again (double click / refresh) → reuse the open session
  const existing = await findLanternByRequest(userId, requestId);
  if (existing) {
    if (existing.status !== "pending_payment" || !existing.payment_id) {
      throw new ApiError(409, "already_processed", "คำขอนี้ถูกดำเนินการไปแล้ว");
    }
    const { data: pay } = await db.from("payments").select("id, stripe_session_id, payment_status").eq("id", existing.payment_id).single();
    if (pay?.stripe_session_id && pay.payment_status === "pending") {
      const session = await stripe.checkout.sessions.retrieve(pay.stripe_session_id);
      if (session.status === "open" && session.url) return { url: session.url, paymentId: pay.id };
    }
    throw new ApiError(409, "session_closed", "รายการชำระเงินเดิมปิดไปแล้ว กรุณาเริ่มสร้างรายการใหม่");
  }

  const lanternId = await createPendingLantern(userId, input, selection, requestId);
  if (!lanternId) throw new ApiError(409, "duplicate_request", "คำขอซ้ำ กรุณาลองใหม่");

  const { data: payment, error: payErr } = await db
    .from("payments")
    .insert({
      user_id: userId,
      lantern_id: lanternId,
      package_id: null,
      package_name: summarize(q),
      amount: q.total,
      currency: "thb",
      line_items: q.lines,
      payment_status: "pending",
    })
    .select("id")
    .single();
  if (payErr) throw new Error(payErr.message);

  await db.from("lanterns").update({ payment_id: payment.id }).eq("id", lanternId);

  const appUrl = publicEnv.appUrl;
  const offering = q.lines.find((l) => l.kind === "offering")?.amount ?? 0;
  const metadata = {
    payment_id: payment.id,
    lantern_id: lanternId,
    user_id: userId,
    effects: selection.effects.join(",").slice(0, 400),
    offering: String(offering),
  };
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        locale: "th",
        currency: "thb",
        // Filter on payment methods enabled in the Stripe Dashboard
        allowed_payment_method_types: stripePaymentMethods(),
        // one Stripe line per item, so the receipt shows exactly what was bought
        line_items: q.lines.map((l) => ({
          quantity: 1,
          price_data: {
            currency: "thb",
            unit_amount: toMinorUnit(l.amount),
            product_data: {
              name: l.kind === "offering" ? "ใส่เงินลงกระทง" : l.name,
              description: l.kind === "offering" ? "ยอดที่ใส่ลงในโคม แสดงบนโคมในเทศกาล" : undefined,
            },
          },
        })),
        client_reference_id: payment.id,
        metadata,
        payment_intent_data: { metadata, description: `Loy Krathong lantern ${lanternId}` },
        success_url: `${appUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/payment/cancel?payment_id=${payment.id}`,
        expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_TTL_SECONDS + 60,
      },
      { idempotencyKey: `checkout-${payment.id}` },
    );
  } catch (err) {
    await db.from("payments").update({ payment_status: "failed", failure_reason: "checkout session creation failed" }).eq("id", payment.id);
    await db.from("lanterns").update({ status: "cancelled" }).eq("id", lanternId);
    throw err;
  }

  await db.from("payments").update({ stripe_session_id: session.id }).eq("id", payment.id);
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return { url: session.url, paymentId: payment.id };
}

function paymentMethodOf(session: Stripe.Checkout.Session): string | null {
  const pi = session.payment_intent;
  if (pi && typeof pi === "object") {
    const charge = pi.latest_charge;
    if (charge && typeof charge === "object" && charge.payment_method_details?.type) return charge.payment_method_details.type;
    if (pi.payment_method_types?.length) return pi.payment_method_types[0];
  }
  return null;
}

/**
 * Re-reads the session from Stripe (never trusts the webhook payload or the browser alone)
 * and activates the lantern exactly once.
 */
async function fulfillSession(sessionId: string) {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["payment_intent.latest_charge"] });
  if (session.payment_status !== "paid") {
    await log("info", "stripe-webhook", "session not paid yet", { sessionId, payment_status: session.payment_status });
    return;
  }
  if ((session.currency ?? "").toLowerCase() !== "thb" || session.amount_total == null) {
    throw new Error(`unexpected currency/amount for session ${sessionId}`);
  }
  const pi = session.payment_intent;
  const { data, error } = await getAdminSupabase().rpc("activate_paid_lantern", {
    p_session_id: session.id,
    p_payment_intent_id: typeof pi === "string" ? pi : (pi?.id ?? null),
    p_payment_method: paymentMethodOf(session),
    p_amount_total: fromMinorUnit(session.amount_total),
  });
  if (error) throw new Error(`activate_paid_lantern: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  await log("info", "stripe-webhook", row?.already_processed ? "payment already processed" : "lantern released after payment", {
    sessionId,
    lanternId: row?.lantern_id,
  });
}

async function closeSession(sessionId: string, status: "failed" | "expired" | "cancelled", reason: string) {
  const { error } = await getAdminSupabase().rpc("close_unpaid_payment", { p_session_id: sessionId, p_status: status, p_reason: reason });
  if (error) throw new Error(`close_unpaid_payment: ${error.message}`);
}

/** Returns false when the event was already processed (duplicate delivery) */
export async function handleStripeEvent(event: Stripe.Event): Promise<boolean> {
  const db = getAdminSupabase();
  const { error: insertErr } = await db.from("stripe_events").insert({ id: event.id, type: event.type });
  if (insertErr) {
    if (insertErr.code !== "23505") throw new Error(insertErr.message);
    const { data: prev } = await db.from("stripe_events").select("processed_at").eq("id", event.id).single();
    if (prev?.processed_at) return false; // duplicate → ignore
    // previous attempt failed half-way → retry (handlers are idempotent)
  }

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await fulfillSession(event.data.object.id);
      break;
    case "checkout.session.async_payment_failed":
      await closeSession(event.data.object.id, "failed", "async payment failed");
      break;
    case "checkout.session.expired":
      await closeSession(event.data.object.id, "expired", "checkout session expired");
      break;
    case "charge.refunded": {
      const charge = event.data.object;
      const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
      if (pi && charge.refunded) {
        await db.from("payments").update({ payment_status: "refunded" }).eq("stripe_payment_intent_id", pi);
      }
      break;
    }
    default:
      break;
  }

  await db.from("stripe_events").update({ processed_at: new Date().toISOString() }).eq("id", event.id);
  return true;
}

/** Status for the success page – read from our database (written by the webhook), not from the URL */
async function readCheckoutStatus(userId: string, sessionId: string) {
  const { data, error } = await getAdminSupabase()
    .from("payments")
    .select("payment_status, lantern_id, user_id, lanterns!payments_lantern_id_fkey(status)")
    .eq("stripe_session_id", sessionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.user_id !== userId) throw new ApiError(404, "not_found", "ไม่พบรายการชำระเงิน");
  const lantern = data.lanterns as unknown as { status: string } | null;
  return { paymentStatus: data.payment_status as PaymentStatus, lanternId: data.lantern_id, lanternStatus: lantern?.status ?? null };
}

/**
 * Polled by the success page. While the record is still pending, ask Stripe directly and fulfil the
 * session ourselves (idempotent – same path as the webhook), so a late or failed webhook never leaves
 * a paying visitor stuck on "verifying".
 */
export async function getCheckoutStatus(userId: string, sessionId: string): Promise<CheckoutStatus> {
  const status = await readCheckoutStatus(userId, sessionId);
  if (status.paymentStatus !== "pending") return status;
  try {
    await fulfillSession(sessionId);
  } catch (e) {
    await log("warn", "checkout-status", "direct fulfilment failed", { sessionId, error: String(e) });
    return status;
  }
  return readCheckoutStatus(userId, sessionId);
}

/** User cancelled at Stripe – expire the session so it can't be paid later, then close the record */
export async function cancelCheckout(userId: string, paymentId: string) {
  const db = getAdminSupabase();
  const { data: pay } = await db.from("payments").select("id, user_id, stripe_session_id, payment_status").eq("id", paymentId).maybeSingle();
  if (!pay || pay.user_id !== userId) throw new ApiError(404, "not_found", "ไม่พบรายการชำระเงิน");
  if (pay.payment_status !== "pending" || !pay.stripe_session_id) return { status: pay.payment_status as PaymentStatus };

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(pay.stripe_session_id);
  if (session.status === "open") {
    await stripe.checkout.sessions.expire(session.id);
  } else if (session.status === "complete") {
    // paid after all – let the webhook (or this call) fulfil it
    if (session.payment_status === "paid") await fulfillSession(session.id);
    return { status: "paid" as PaymentStatus };
  }
  await closeSession(session.id, "cancelled", "cancelled by user");
  return { status: "cancelled" as PaymentStatus };
}

export async function listPaymentHistory(userId: string): Promise<PaymentRecord[]> {
  const { data, error } = await getAdminSupabase()
    .from("payments")
    .select("id, lantern_id, package_name, amount, currency, payment_method, payment_status, created_at, paid_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => ({
    id: p.id,
    lanternId: p.lantern_id,
    packageName: p.package_name,
    amount: Number(p.amount),
    currency: p.currency,
    paymentMethod: p.payment_method,
    paymentStatus: p.payment_status,
    createdAt: p.created_at,
    paidAt: p.paid_at,
  }));
}
