import "server-only";
import { ApiError } from "@/lib/api";
import { parsePromptPayId, type PromptPayTarget } from "@/lib/promptpay";

/**
 * Bank-slip verification through a Thai slip-verification API (fetch only – runs on Node and
 * Cloudflare Workers).
 *
 * Providers:
 *   slipok   (default) SlipOK Guide v1.12 – POST https://api.slipok.com/api/line/apikey/<branch>
 *   easyslip EasySlip API v2 – https://document.easyslip.com/en/v2/verify/bank
 *
 * Env:
 *   SLIP_PROVIDER           "slipok" (default) | "easyslip"
 *   SLIP_API_KEY            SlipOK branch API key (x-authorization) / EasySlip API key (Bearer)
 *   SLIPOK_BRANCH_ID        SlipOK branch id (numeric) – required for slipok
 *   PROMPTPAY_ID            our PromptPay phone number or 13-digit national/tax ID (receives the money)
 *   PROMPTPAY_NAME          optional – account name; compared loosely with the slip's (masked) receiver name.
 *                           Several spellings may be given separated by "|" (e.g. "สมชาย ใจดี|SOMCHAI JAIDEE")
 *   PROMPTPAY_BANK_ACCOUNT  optional – bank account number behind the PromptPay ID (some banks only
 *                           print the receiver's masked bank account, not the PromptPay ID)
 *   SLIP_MATCH_ACCOUNT      optional "true" – trust the provider's own receiver check
 *                           (SlipOK: receiving account registered in SlipOK's LINE LIFF → error 1014 otherwise;
 *                            EasySlip: matchAccount against accounts registered in its dashboard)
 *
 * Nothing is ever approved when the provider is not configured or unreachable.
 */

export const EASYSLIP_VERIFY_URL = "https://api.easyslip.com/v2/verify/bank";
export const SLIPOK_API_BASE = "https://api.slipok.com/api/line/apikey";
/** Image limit (EasySlip: 4 MB; SlipOK checks the size too) */
export const SLIP_MAX_BYTES = 4 * 1024 * 1024;
const PROVIDER_TIMEOUT_MS = 20_000;
/** slip must be made at most this long after the order … */
export const SLIP_MAX_AGE_MS = 24 * 3600 * 1000;
/** … and not (much) before it – tolerance for clock skew / paying a QR re-shown after a reload */
export const SLIP_EARLY_TOLERANCE_MS = 60 * 60 * 1000;
const FUTURE_TOLERANCE_MS = 10 * 60 * 1000;

export type SlipProviderName = "slipok" | "easyslip";

export interface SlipConfig {
  provider: SlipProviderName;
  apiKey: string;
  /** SlipOK branch id */
  branchId: string | null;
  promptPay: PromptPayTarget;
  names: string[];
  bankAccount: string | null;
  matchAccount: boolean;
}

export const SLIP_NOT_CONFIGURED_MESSAGE = "ระบบตรวจสลิปอัตโนมัติยังไม่ได้ตั้งค่า กรุณาติดต่อผู้ดูแล";
const notConfigured = () => new ApiError(503, "slip_not_configured", SLIP_NOT_CONFIGURED_MESSAGE);

/** Throws a 503 "slip_not_configured" when anything required is missing or invalid */
export function getSlipConfig(env: Record<string, string | undefined> = process.env): SlipConfig {
  const provider = env.SLIP_PROVIDER?.trim().toLowerCase() || "slipok";
  const apiKey = env.SLIP_API_KEY?.trim();
  const id = env.PROMPTPAY_ID?.trim();
  if ((provider !== "slipok" && provider !== "easyslip") || !apiKey || !id) throw notConfigured();
  const branchId = env.SLIPOK_BRANCH_ID?.trim() || null;
  if (provider === "slipok" && !(branchId && /^\d{1,12}$/.test(branchId))) throw notConfigured();
  let promptPay: PromptPayTarget;
  try {
    promptPay = parsePromptPayId(id);
  } catch {
    throw notConfigured();
  }
  const names = (env.PROMPTPAY_NAME ?? "")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
  const bankAccount = (env.PROMPTPAY_BANK_ACCOUNT ?? "").replace(/[^0-9]/g, "") || null;
  return { provider, apiKey, branchId, promptPay, names, bankAccount, matchAccount: env.SLIP_MATCH_ACCOUNT?.trim() === "true" };
}

export function isSlipVerificationConfigured(env: Record<string, string | undefined> = process.env) {
  try {
    getSlipConfig(env);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ normalized slip */

export interface SlipParty {
  name: string | null;
  bank: string | null;
  /** masked bank account as printed, e.g. "xxx-x-x1234-x" */
  account: string | null;
  proxyType: string | null;
  /** masked PromptPay proxy, e.g. "086xxx7894" */
  proxyAccount: string | null;
}

export interface VerifiedSlip {
  provider: SlipProviderName;
  transRef: string;
  amount: number;
  /** ISO 8601 */
  date: string;
  sender: SlipParty;
  receiver: SlipParty;
  /** the provider confirmed the receiver against a registered account (null = not requested) */
  matchedAccount: boolean | null;
  /** the provider has seen this slip before (EasySlip isDuplicate / SlipOK error 1012) */
  isDuplicate: boolean;
}

export type SlipErrorCode = "slip_not_found" | "slip_pending" | "invalid_image" | "provider_unavailable" | "slip_used" | "receiver_mismatch";

export class SlipProviderError extends Error {
  constructor(public code: SlipErrorCode, public providerCode: string, message: string, public status: number) {
    super(message);
    this.name = "SlipProviderError";
  }
}

const THAI_MESSAGE: Record<SlipErrorCode, string> = {
  slip_not_found: "ตรวจสอบสลิปกับธนาคารไม่ผ่าน: ไม่พบรายการนี้ หรือภาพไม่มี QR ของสลิป กรุณาแนบสลิปจริงจากแอปธนาคาร",
  slip_pending: "ธนาคารยังไม่ยืนยันรายการนี้ (บางธนาคารใช้เวลาสักครู่) กรุณาลองแนบสลิปอีกครั้งในอีกไม่กี่นาที",
  invalid_image: "อ่านไฟล์สลิปไม่ได้ กรุณาแนบภาพสลิป (JPG/PNG) ขนาดไม่เกิน 4 MB",
  provider_unavailable: "ระบบตรวจสลิปขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง",
  slip_used: "สลิปนี้ถูกใช้ไปแล้ว ไม่สามารถใช้ซ้ำได้ กรุณาแนบสลิปของการโอนครั้งนี้",
  receiver_mismatch: "บัญชีผู้รับในสลิปไม่ใช่บัญชีพร้อมเพย์ของเรา กรุณาโอนผ่าน QR ในหน้านี้",
};

export const slipErrorMessage = (code: SlipErrorCode) => THAI_MESSAGE[code];

const STATUS: Record<SlipErrorCode, number> = {
  slip_not_found: 422,
  slip_pending: 409,
  invalid_image: 422,
  provider_unavailable: 503,
  slip_used: 409,
  receiver_mismatch: 422,
};

const providerError = (code: SlipErrorCode, providerCode: string, message = THAI_MESSAGE[code]) =>
  new SlipProviderError(code, providerCode, message, STATUS[code]);

const clip = (s: unknown, n: number) => (typeof s === "string" && s.trim() ? s.trim().slice(0, n) : null);

export interface SlipInput {
  /** slip mini-QR read in the browser (fastest; no image processing at the provider) */
  payload?: string | null;
  /** the slip image (only used when no payload is given) */
  image?: { bytes: Uint8Array; contentType: string } | null;
  /** our order id – shown in the provider dashboard (EasySlip) */
  remark?: string;
}

export interface ProviderResult {
  slip: VerifiedSlip;
  /** every receiver name the slip carries (Thai / English, possibly masked) */
  names: string[];
}

async function send(fetchImpl: typeof fetch, url: string, init: RequestInit) {
  try {
    return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS), cache: "no-store" });
  } catch {
    throw providerError("provider_unavailable", "NETWORK_ERROR");
  }
}

const imageBlob = (image: NonNullable<SlipInput["image"]>) => {
  if (image.bytes.byteLength > SLIP_MAX_BYTES) throw providerError("invalid_image", "IMAGE_SIZE_TOO_LARGE");
  const ext = image.contentType === "image/png" ? "png" : image.contentType === "image/webp" ? "webp" : "jpg";
  return { blob: new Blob([image.bytes as BlobPart], { type: image.contentType }), name: `slip.${ext}` };
};

/** Calls the configured provider. Returns the normalized slip, or throws SlipProviderError. `fetchImpl` is injectable for tests. */
export function verifySlipWithProvider(input: SlipInput, cfg: SlipConfig, fetchImpl: typeof fetch = fetch): Promise<ProviderResult> {
  return cfg.provider === "slipok" ? verifyWithSlipOk(input, cfg, fetchImpl) : verifyWithEasySlip(input, cfg, fetchImpl);
}

/* ------------------------------------------------------------------ SlipOK */

interface SlipOkParty {
  displayName?: string;
  name?: string;
  proxy?: { type?: string | null; value?: string | null };
  account?: { type?: string | null; value?: string | null };
}

interface SlipOkSlip {
  success?: boolean;
  transRef?: string;
  sendingBank?: string;
  receivingBank?: string;
  transDate?: string;
  transTime?: string;
  transTimestamp?: string;
  sender?: SlipOkParty;
  receiver?: SlipOkParty;
  amount?: number | string;
  delay?: number;
}

interface SlipOkResponse {
  success?: boolean;
  code?: number | string;
  message?: string;
  data?: SlipOkSlip;
}

function slipOkParty(p: SlipOkParty | undefined, bank: string | undefined): SlipParty {
  return {
    name: clip(p?.displayName || p?.name, 120),
    bank: clip(bank, 60),
    account: clip(p?.account?.value, 60),
    proxyType: clip(p?.proxy?.type, 20),
    proxyAccount: clip(p?.proxy?.value, 60),
  };
}

/** SlipOK dates: transTimestamp (ISO) or transDate yyyyMMdd + transTime HH:mm:ss in Thai time */
function slipOkDate(d: SlipOkSlip): string | null {
  if (d.transTimestamp && !Number.isNaN(Date.parse(d.transTimestamp))) return new Date(Date.parse(d.transTimestamp)).toISOString();
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(d.transDate ?? "");
  if (m && /^\d{2}:\d{2}(:\d{2})?$/.test(d.transTime ?? "")) {
    const t = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${d.transTime!.length === 5 ? `${d.transTime}:00` : d.transTime}+07:00`);
    if (!Number.isNaN(t)) return new Date(t).toISOString();
  }
  return null;
}

function normalizeSlipOk(d: SlipOkSlip | undefined, cfg: SlipConfig, isDuplicate: boolean): ProviderResult | null {
  if (!d) return null;
  const transRef = clip(d.transRef, 64);
  const amount = Number(d.amount);
  const date = slipOkDate(d);
  if (!transRef || !Number.isFinite(amount) || !date) return null;
  const names = [d.receiver?.displayName, d.receiver?.name].filter((s): s is string => typeof s === "string" && !!s.trim());
  return {
    slip: {
      provider: "slipok",
      transRef,
      amount,
      date,
      sender: slipOkParty(d.sender, d.sendingBank),
      receiver: slipOkParty(d.receiver, d.receivingBank),
      // with log: true SlipOK checks the receiver against the account registered in LINE LIFF (1014 otherwise)
      matchedAccount: cfg.matchAccount ? true : null,
      isDuplicate,
    },
    names,
  };
}

function mapSlipOkError(httpStatus: number, json: SlipOkResponse | null): SlipProviderError {
  const code = Number(json?.code);
  const tag = Number.isFinite(code) ? `SLIPOK_${code}` : `HTTP_${httpStatus}`;
  switch (code) {
    case 1000:
    case 1005:
    case 1006:
      return providerError("invalid_image", tag);
    case 1007:
    case 1008:
    case 1011:
      return providerError("slip_not_found", tag);
    case 1010: {
      const delay = Number(json?.data?.delay);
      return providerError(
        "slip_pending",
        tag,
        Number.isFinite(delay) && delay > 0 ? `ธนาคารยังไม่ยืนยันรายการนี้ กรุณาลองแนบสลิปอีกครั้งในอีกประมาณ ${delay} นาที` : THAI_MESSAGE.slip_pending,
      );
    }
    case 1014:
      return providerError("receiver_mismatch", tag);
    case 1013: // only when we send `amount` (we don't – paying more than due is allowed)
      return providerError("slip_not_found", tag, "ยอดโอนในสลิปไม่ตรงกับยอดที่ต้องชำระ");
    default:
      // 1001 branch, 1002 auth, 1003 expired package, 1004 quota, 1009 bank outage, 1015 package, 5xx
      return providerError("provider_unavailable", tag);
  }
}

function slipOkRequest(input: SlipInput, cfg: SlipConfig, log: boolean): { headers: Record<string, string>; body: BodyInit } {
  const headers: Record<string, string> = { "x-authorization": cfg.apiKey };
  if (input.payload) {
    headers["Content-Type"] = "application/json";
    // log: true → SlipOK stores the slip, flags duplicates (1012) and checks the registered receiver (1014)
    return { headers, body: JSON.stringify({ data: input.payload, log }) };
  }
  if (input.image) {
    const { blob, name } = imageBlob(input.image);
    const form = new FormData();
    form.append("files", blob, name);
    form.append("log", String(log));
    return { headers, body: form };
  }
  throw providerError("invalid_image", "SLIPOK_1000");
}

async function verifyWithSlipOk(input: SlipInput, cfg: SlipConfig, fetchImpl: typeof fetch): Promise<ProviderResult> {
  const url = `${SLIPOK_API_BASE}/${encodeURIComponent(cfg.branchId ?? "")}`;
  const first = slipOkRequest(input, cfg, true);
  const res = await send(fetchImpl, url, { method: "POST", ...first });
  let json = (await res.json().catch(() => null)) as SlipOkResponse | null;

  // 1014 = SlipOK's receiver check against the account registered in its LINE LIFF failed – which is always
  // the case when no account is registered there. The money may still have reached OUR PromptPay, so use the
  // slip data (returned with the error, or by asking once more without `log`) and let OUR receiver check decide.
  if (Number(json?.code) === 1014) {
    const fromError = normalizeSlipOk(json?.data, cfg, false);
    if (fromError) return { ...fromError, slip: { ...fromError.slip, matchedAccount: null } };
    const again = slipOkRequest(input, cfg, false);
    const res2 = await send(fetchImpl, url, { method: "POST", ...again });
    json = (await res2.json().catch(() => null)) as SlipOkResponse | null;
    if (res2.ok && json?.success) {
      const result = normalizeSlipOk(json.data, cfg, false);
      if (result) return { ...result, slip: { ...result.slip, matchedAccount: null } };
    }
    throw mapSlipOkError(res2.status, json);
  }
  if (res.ok && json?.success) {
    const result = normalizeSlipOk(json.data, cfg, false);
    if (!result) throw providerError("provider_unavailable", "MALFORMED_RESPONSE");
    return result;
  }
  if (Number(json?.code) === 1012) {
    // duplicate: SlipOK returns the original slip – the caller decides (our own retry vs. reuse)
    const result = normalizeSlipOk(json?.data, cfg, true);
    if (result) return result;
    throw providerError("slip_used", "SLIPOK_1012");
  }
  throw mapSlipOkError(res.status, json);
}

export interface SlipQuota {
  provider: SlipProviderName;
  /** remaining slips */
  quota: number | null;
  overQuota: number | null;
  specialQuota: number | null;
  endDate: string | null;
  specialEndDate: string | null;
}

/** Remaining slip quota (SlipOK only – EasySlip returns null) */
export async function getSlipQuota(cfg: SlipConfig, fetchImpl: typeof fetch = fetch): Promise<SlipQuota | null> {
  if (cfg.provider !== "slipok") return null;
  const res = await send(fetchImpl, `${SLIPOK_API_BASE}/${encodeURIComponent(cfg.branchId ?? "")}/quota`, {
    method: "GET",
    headers: { "x-authorization": cfg.apiKey },
  });
  const json = (await res.json().catch(() => null)) as { success?: boolean; code?: number; data?: Record<string, unknown> } | null;
  if (!res.ok || !json?.success || !json.data) throw mapSlipOkError(res.status, json as SlipOkResponse | null);
  const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  return {
    provider: "slipok",
    quota: num(json.data.quota),
    overQuota: num(json.data.overQuota),
    specialQuota: num(json.data.specialQuota),
    endDate: str(json.data.endDate),
    specialEndDate: str(json.data.specialEndDate),
  };
}

/* ------------------------------------------------------------------ EasySlip v2 */

interface EasySlipParty {
  bank?: { id?: string; name?: string; short?: string };
  account?: {
    name?: { th?: string; en?: string };
    bank?: { type?: string; account?: string };
    proxy?: { type?: string; account?: string };
  };
}

interface EasySlipResponse {
  success?: boolean;
  message?: string;
  error?: { code?: string; message?: string };
  data?: {
    isDuplicate?: boolean;
    matchedAccount?: unknown;
    amountInSlip?: number;
    rawSlip?: {
      transRef?: string;
      date?: string;
      amount?: { amount?: number; local?: { amount?: number; currency?: string } };
      sender?: EasySlipParty;
      receiver?: EasySlipParty;
    };
  };
}

function easySlipParty(p: EasySlipParty | undefined): SlipParty {
  return {
    name: clip(p?.account?.name?.th || p?.account?.name?.en, 120),
    bank: clip(p?.bank?.short || p?.bank?.name, 60),
    account: clip(p?.account?.bank?.account, 60),
    proxyType: clip(p?.account?.proxy?.type, 20),
    proxyAccount: clip(p?.account?.proxy?.account, 60),
  };
}

function mapEasySlipError(httpStatus: number, code: string): SlipProviderError {
  const c = code.toUpperCase();
  if (c === "SLIP_NOT_FOUND") return providerError("slip_not_found", c);
  if (c === "SLIP_PENDING") return providerError("slip_pending", c);
  if (["IMAGE_SIZE_TOO_LARGE", "INVALID_IMAGE_FORMAT", "INVALID_IMAGE_TYPE", "VALIDATION_ERROR"].includes(c)) return providerError("invalid_image", c);
  return providerError("provider_unavailable", c || `HTTP_${httpStatus}`);
}

async function verifyWithEasySlip(input: SlipInput, cfg: SlipConfig, fetchImpl: typeof fetch): Promise<ProviderResult> {
  let body: BodyInit;
  const headers: Record<string, string> = { Authorization: `Bearer ${cfg.apiKey}` };
  const remark = input.remark?.slice(0, 255);
  if (input.payload) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify({ payload: input.payload, checkDuplicate: true, ...(cfg.matchAccount ? { matchAccount: true } : {}), ...(remark ? { remark } : {}) });
  } else if (input.image) {
    const { blob, name } = imageBlob(input.image);
    const form = new FormData();
    form.append("image", blob, name);
    form.append("checkDuplicate", "true");
    if (cfg.matchAccount) form.append("matchAccount", "true");
    if (remark) form.append("remark", remark);
    body = form; // fetch sets the multipart boundary
  } else {
    throw mapEasySlipError(400, "VALIDATION_ERROR");
  }

  const res = await send(fetchImpl, EASYSLIP_VERIFY_URL, { method: "POST", headers, body });
  const json = (await res.json().catch(() => null)) as EasySlipResponse | null;
  if (!res.ok || !json?.success) throw mapEasySlipError(res.status, json?.error?.code ?? "");

  const raw = json.data?.rawSlip;
  // rawSlip.amount.amount (= data.amountInSlip) is the transferred amount; amount.local is informational
  const amount = Number(raw?.amount?.amount ?? json.data?.amountInSlip);
  const transRef = raw?.transRef?.trim();
  if (!raw || !transRef || !Number.isFinite(amount) || !raw.date || Number.isNaN(Date.parse(raw.date))) {
    throw mapEasySlipError(res.status, "MALFORMED_RESPONSE");
  }
  const n = raw.receiver?.account?.name;
  return {
    slip: {
      provider: "easyslip",
      transRef: transRef.slice(0, 64),
      amount,
      date: new Date(Date.parse(raw.date)).toISOString(),
      sender: easySlipParty(raw.sender),
      receiver: easySlipParty(raw.receiver),
      matchedAccount: cfg.matchAccount ? json.data?.matchedAccount != null : null,
      isDuplicate: json.data?.isDuplicate === true,
    },
    names: [n?.th, n?.en].filter((s): s is string => !!s && !!s.trim()),
  };
}

/* ------------------------------------------------------------------ business checks */

/**
 * Compares a masked number printed on a slip ("xxx-xxx-5678", "086xxx7894", "xxx-x-x1234-x") with the
 * real one, right-aligned. Every visible digit must match and at least `minVisible` digits must be visible.
 */
export function maskedNumberMatches(masked: string | null | undefined, actual: string, minVisible = 4): boolean {
  if (!masked) return false;
  const m = masked.toLowerCase().replace(/[^0-9x*•]/g, "");
  const a = actual.replace(/[^0-9]/g, "");
  if (!m || !a) return false;
  let visible = 0;
  for (let i = 1; i <= m.length; i++) {
    const c = m[m.length - i];
    if (c < "0" || c > "9") continue;
    const ac = a[a.length - i];
    if (ac === undefined || ac !== c) return false;
    visible++;
  }
  return visible >= minVisible;
}

const PROXY_TYPE: Record<PromptPayTarget["type"], string[]> = {
  phone: ["MSISDN", "MOBILE", "PHONE"],
  national_id: ["NATID", "TAXID", "NATIONAL_ID"],
  ewallet: ["EWALLETID", "EWALLET"],
};

const TITLES = [
  "นางสาว", "น.ส.", "นาง", "นาย", "ด.ช.", "ด.ญ.", "บริษัท", "บจก.", "หจก.", "ห้างหุ้นส่วนจำกัด",
  "miss", "mrs.", "mrs", "mr.", "mr", "ms.", "ms", "company", "co.,", "co.",
];

/** Words of a name without titles, punctuation and case ("นาย ธนกร ร" → ["ธนกร", "ร"]) */
export function nameTokens(name: string): string[] {
  let s = name.trim().toLowerCase();
  for (let changed = true; changed; ) {
    changed = false;
    for (const t of TITLES) {
      if (s.startsWith(t)) {
        s = s.slice(t.length).trim();
        changed = true;
      }
    }
  }
  return s
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{M}\p{N}]/gu, ""))
    .filter(Boolean);
}

/** First word of a name without titles ("นาย สมชาย ใ" → "สมชาย") */
export const nameKey = (name: string) => nameTokens(name)[0] ?? "";

/**
 * Slip names are masked/truncated ("นาย ธนกร ร", "SOMCHAI J"): the first name must match (prefix of
 * ≥ 2 characters); `strict` also requires the visible start of the surname to match.
 */
export function namesMatch(slipName: string, ourNames: string[], strict = false): boolean {
  const [first, last] = nameTokens(slipName);
  if (!first || first.length < 2) return !strict; // fully masked – nothing to compare
  return ourNames.some((n) => {
    const [oFirst, oLast] = nameTokens(n);
    if (!oFirst || oFirst.length < 2 || !(oFirst.startsWith(first) || first.startsWith(oFirst))) return false;
    if (!strict) return true;
    return !!last && !!oLast && (oLast.startsWith(last) || last.startsWith(oLast));
  });
}

export type SlipCheck =
  | { ok: true }
  | { ok: false; code: "amount_too_low" | "receiver_mismatch" | "slip_too_old" | "slip_in_future"; message: string };

function idForms(t: PromptPayTarget): string[] {
  if (t.type !== "phone") return [t.digits];
  const n = t.digits.slice(1);
  return [t.digits, `66${n}`, `0066${n}`];
}

const hasDigits = (s: string | null) => !!s && /\d/.test(s);

/**
 * Money went to us:
 *  - a receiver name on the slip that clearly isn't ours → no
 *  - provider-side account match (SLIP_MATCH_ACCOUNT) → yes
 *  - a visible PromptPay proxy decides (type + masked digits vs PROMPTPAY_ID)
 *  - else a visible bank account vs PROMPTPAY_BANK_ACCOUNT, when configured
 *  - else (no usable number printed) first name + surname initial vs PROMPTPAY_NAME
 */
export function receiverMatches(receiver: SlipParty, names: string[], matchedAccount: boolean | null, cfg: SlipConfig): boolean {
  if (cfg.names.length && names.length && !names.some((n) => namesMatch(n, cfg.names))) return false;
  if (cfg.matchAccount && matchedAccount) return true;
  if (hasDigits(receiver.proxyAccount)) {
    const typeOk = !receiver.proxyType || PROXY_TYPE[cfg.promptPay.type].includes(receiver.proxyType.toUpperCase());
    return typeOk && idForms(cfg.promptPay).some((f) => maskedNumberMatches(receiver.proxyAccount, f));
  }
  if (cfg.bankAccount && hasDigits(receiver.account)) return maskedNumberMatches(receiver.account, cfg.bankAccount);
  return cfg.names.length > 0 && names.some((n) => namesMatch(n, cfg.names, true));
}

/** Amount ≥ amount due, money went to us, made around the time of this order */
export function checkSlip(
  slip: VerifiedSlip,
  names: string[],
  order: { amountDue: number; createdAt: string | Date },
  cfg: SlipConfig,
  now = Date.now(),
): SlipCheck {
  if (!(slip.amount + 0.001 >= order.amountDue)) {
    return { ok: false, code: "amount_too_low", message: `ยอดโอนในสลิป ${slip.amount.toLocaleString("th-TH")} บาท น้อยกว่ายอดที่ต้องชำระ ${order.amountDue.toLocaleString("th-TH")} บาท` };
  }
  if (!receiverMatches(slip.receiver, names, slip.matchedAccount, cfg)) {
    return { ok: false, code: "receiver_mismatch", message: THAI_MESSAGE.receiver_mismatch };
  }
  const slipAt = Date.parse(slip.date);
  const createdAt = new Date(order.createdAt).getTime();
  if (slipAt > now + FUTURE_TOLERANCE_MS) return { ok: false, code: "slip_in_future", message: "วันเวลาในสลิปไม่ถูกต้อง" };
  if (slipAt < createdAt - SLIP_EARLY_TOLERANCE_MS || slipAt > createdAt + SLIP_MAX_AGE_MS) {
    return { ok: false, code: "slip_too_old", message: "สลิปนี้ไม่ได้โอนสำหรับรายการนี้ (วันเวลาโอนไม่ตรงกับรายการ) กรุณาแนบสลิปของการโอนครั้งนี้" };
  }
  return { ok: true };
}
