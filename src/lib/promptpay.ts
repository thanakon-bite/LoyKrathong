/**
 * PromptPay (Thai QR Payment) payloads – EMVCo merchant-presented QR with the Bank of Thailand
 * PromptPay template (tag 29, AID A000000677010111) – and the bank "slip verification" mini-QR
 * printed on every Thai transfer slip. Pure functions: safe in the browser, on Node and on Workers.
 */

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) over the UTF-8 bytes, as 4 upper-case hex digits */
export function crc16ccitt(input: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(input)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** EMV "ID + 2-digit length + value" field */
function field(id: string, value: string) {
  if (value.length > 99) throw new Error(`EMV field ${id} too long`);
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

export interface TlvField {
  tag: string;
  value: string;
}

/** Parses EMV TLV ("IDLLVALUE…"); returns null when the string is not well-formed */
export function parseTlv(input: string): TlvField[] | null {
  const out: TlvField[] = [];
  let i = 0;
  while (i < input.length) {
    if (i + 4 > input.length) return null;
    const tag = input.slice(i, i + 2);
    const lenStr = input.slice(i + 2, i + 4);
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(lenStr)) return null;
    const len = Number(lenStr);
    if (i + 4 + len > input.length) return null;
    out.push({ tag, value: input.slice(i + 4, i + 4 + len) });
    i += 4 + len;
  }
  return out;
}

export type PromptPayTargetType = "phone" | "national_id" | "ewallet";

export interface PromptPayTarget {
  type: PromptPayTargetType;
  /** digits only, as entered (e.g. 0812345678 / 1234567890123) */
  digits: string;
  /** value inside the QR (phone → 0066XXXXXXXXX) */
  qrValue: string;
}

/**
 * Phone number (10 digits, or +66…), 13-digit national ID / tax ID, or 15-digit e-wallet ID.
 * Throws on anything else so a typo in PROMPTPAY_ID never produces a QR that pays someone else.
 */
export function parsePromptPayId(id: string): PromptPayTarget {
  const digits = id.replace(/[^0-9]/g, "");
  if (digits.length === 15) return { type: "ewallet", digits, qrValue: digits };
  if (digits.length === 13 && !digits.startsWith("00")) return { type: "national_id", digits, qrValue: digits };
  // local phone 0XXXXXXXXX, or international 66XXXXXXXXX / 0066XXXXXXXXX
  const local = digits.startsWith("0066") ? `0${digits.slice(4)}` : digits.startsWith("66") && digits.length === 11 ? `0${digits.slice(2)}` : digits;
  if (/^0\d{9}$/.test(local)) return { type: "phone", digits: local, qrValue: `0066${local.slice(1)}` };
  throw new Error("invalid PromptPay ID (use a 10-digit phone number or a 13-digit national/tax ID)");
}

/** Amount as it appears in the QR: 2 decimals, no grouping */
export function formatQrAmount(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0 || amount > 9_999_999) throw new Error("invalid amount");
  return (Math.round(amount * 100) / 100).toFixed(2);
}

/**
 * PromptPay QR payload. With an amount the QR is "dynamic" (POI 12) so the bank app pre-fills the
 * exact amount; without it, static (POI 11).
 */
export function promptPayPayload(id: string, amount?: number): string {
  const target = parsePromptPayId(id);
  const subTag = target.type === "phone" ? "01" : target.type === "national_id" ? "02" : "03";
  const data = [
    field("00", "01"),
    field("01", amount ? "12" : "11"),
    field("29", field("00", "A000000677010111") + field(subTag, target.qrValue)),
    field("58", "TH"),
    field("53", "764"),
    amount ? field("54", formatQrAmount(amount)) : "",
  ].join("");
  const withCrcTag = `${data}6304`;
  return withCrcTag + crc16ccitt(withCrcTag);
}

/** True when the trailing "6304XXXX" CRC of an EMV payload is correct */
export function hasValidEmvCrc(payload: string) {
  if (payload.length < 8 || payload.slice(-8, -4) !== "6304") return false;
  return crc16ccitt(payload.slice(0, -4)) === payload.slice(-4).toUpperCase();
}

/* ------------------------------------------------------------------ slip mini-QR */

export interface SlipQr {
  /** Bank of Thailand bank code of the sender's bank, e.g. "004" = KBank, "014" = SCB */
  sendingBank: string;
  /** transaction reference – unique per transfer */
  transRef: string;
  payload: string;
}

/**
 * Parses the verification QR on a Thai bank transfer slip:
 *   00 [ 00 "000001" | 01 <sending bank> | 02 <transRef> ] 51 "TH" 91 <CRC16>
 * Returns null for anything else (a PromptPay payment QR, a random QR, a corrupted read…).
 */
export function parseSlipQr(raw: string): SlipQr | null {
  const payload = raw.trim();
  if (payload.length < 20 || payload.length > 128 || !/^[0-9A-Za-z]+$/.test(payload)) return null;
  const top = parseTlv(payload);
  if (!top) return null;
  const get = (list: TlvField[], tag: string) => list.find((f) => f.tag === tag)?.value;
  const root = get(top, "00");
  const crc = get(top, "91");
  if (!root || get(top, "51") !== "TH" || !crc || crc.length !== 4) return null;
  if (top[top.length - 1].tag !== "91") return null;
  if (crc16ccitt(payload.slice(0, -4)).toUpperCase() !== crc.toUpperCase()) return null;
  const inner = parseTlv(root);
  if (!inner || get(inner, "00") !== "000001") return null;
  const sendingBank = get(inner, "01") ?? "";
  const transRef = get(inner, "02") ?? "";
  if (!/^\d{3}$/.test(sendingBank) || !/^[0-9A-Za-z]{6,40}$/.test(transRef)) return null;
  return { sendingBank, transRef, payload };
}

/** A PromptPay / Thai QR *payment* code (someone uploaded the QR to pay instead of the slip) */
export function isPaymentQr(raw: string) {
  return /^000201/.test(raw.trim()) && hasValidEmvCrc(raw.trim());
}
