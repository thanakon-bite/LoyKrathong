import { describe, expect, it } from "vitest";
import { crc16ccitt, formatQrAmount, hasValidEmvCrc, isPaymentQr, parsePromptPayId, parseSlipQr, parseTlv, promptPayPayload } from "@/lib/promptpay";

// Known-good payloads from the reference implementation's test-suite (github.com/dtinth/promptpay-qr, index.test.js)
describe("PromptPay QR payload", () => {
  it("phone number (static)", () => {
    expect(promptPayPayload("0801234567")).toBe("00020101021129370016A000000677010111011300668012345675802TH530376463046197");
    expect(promptPayPayload("080-123-4567")).toBe("00020101021129370016A000000677010111011300668012345675802TH530376463046197");
    expect(promptPayPayload("+66-89-123-4567")).toBe("00020101021129370016A000000677010111011300668912345675802TH5303764630429C1");
  });

  it("national ID / tax ID", () => {
    expect(promptPayPayload("1111111111111")).toBe("00020101021129370016A000000677010111021311111111111115802TH530376463047B5A");
    expect(promptPayPayload("1-1111-11111-11-1")).toBe("00020101021129370016A000000677010111021311111111111115802TH530376463047B5A");
    expect(promptPayPayload("0123456789012")).toBe("00020101021129370016A000000677010111021301234567890125802TH530376463040CBD");
  });

  it("e-wallet ID", () => {
    expect(promptPayPayload("012345678901234")).toBe("00020101021129390016A00000067701011103150123456789012345802TH530376463049781");
  });

  it("with amount → dynamic QR carrying the exact amount", () => {
    expect(promptPayPayload("000-000-0000", 4.22)).toBe("00020101021229370016A000000677010111011300660000000005802TH530376454044.226304E469");
    const p = promptPayPayload("0812345678", 99);
    expect(p).toContain("540599.00");
    expect(hasValidEmvCrc(p)).toBe(true);
    expect(isPaymentQr(p)).toBe(true);
  });

  it("amount formatting and validation", () => {
    expect(formatQrAmount(10)).toBe("10.00");
    expect(formatQrAmount(1234.5)).toBe("1234.50");
    expect(formatQrAmount(0.1 + 0.2)).toBe("0.30");
    expect(() => formatQrAmount(0)).toThrow();
    expect(() => formatQrAmount(Number.NaN)).toThrow();
  });

  it("rejects malformed PromptPay IDs instead of paying someone else", () => {
    for (const bad of ["", "12345", "08123456789", "abc", "1234567890"]) expect(() => parsePromptPayId(bad), bad).toThrow();
    expect(parsePromptPayId("0066812345678")).toMatchObject({ type: "phone", digits: "0812345678", qrValue: "0066812345678" });
  });

  it("CRC16-CCITT-FALSE check value", () => {
    expect(crc16ccitt("123456789")).toBe("29B1");
  });
});

describe("slip mini-QR", () => {
  // example from the thai-qr-payment docs (slip-verify guide)
  const SLIP = "004000060000010103002021900021231231212000115102TH91049C30";

  it("parses sending bank + transRef and verifies the CRC", () => {
    expect(parseSlipQr(SLIP)).toEqual({ sendingBank: "002", transRef: "0002123123121200011", payload: SLIP });
  });

  it("rejects corrupted / non-slip codes", () => {
    expect(parseSlipQr(SLIP.slice(0, -1) + "1")).toBeNull(); // CRC
    expect(parseSlipQr(SLIP.replace("5102TH", "5102US"))).toBeNull();
    expect(parseSlipQr(promptPayPayload("0812345678", 50))).toBeNull(); // a payment QR is not a slip
    expect(parseSlipQr("https://example.com")).toBeNull();
    expect(parseSlipQr("")).toBeNull();
  });

  it("TLV parser", () => {
    expect(parseTlv("0002AB0103XYZ")).toEqual([
      { tag: "00", value: "AB" },
      { tag: "01", value: "XYZ" },
    ]);
    expect(parseTlv("0005AB")).toBeNull();
  });
});
