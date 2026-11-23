import { describe, expect, it, vi } from "vitest";
import {
  checkSlip,
  EASYSLIP_VERIFY_URL,
  getSlipConfig,
  maskedNumberMatches,
  namesMatch,
  SlipProviderError,
  verifySlipWithProvider,
  type VerifiedSlip,
} from "@/services/slip-verify";

const ENV = { SLIP_PROVIDER: "easyslip", SLIP_API_KEY: "test-key", PROMPTPAY_ID: "081-234-5678", PROMPTPAY_NAME: "นาย สมชาย ใจดี|SOMCHAI JAIDEE" };
const cfg = getSlipConfig(ENV);

/** Response shape from https://document.easyslip.com/en/v2/verify/bank */
function easySlipOk(over: { amount?: number; date?: string; proxy?: string; proxyType?: string; account?: string; name?: string; isDuplicate?: boolean } = {}) {
  return {
    success: true,
    message: "Slip verified successfully",
    data: {
      isDuplicate: over.isDuplicate ?? false,
      matchedAccount: null,
      amountInSlip: over.amount ?? 99,
      rawSlip: {
        payload: "004000060000010103002021900021231231212000115102TH91049C30",
        transRef: "0002123123121200011",
        date: over.date ?? "2026-11-23T20:05:00+07:00",
        countryCode: "TH",
        amount: { amount: over.amount ?? 99, local: { amount: 0, currency: "" } },
        fee: 0,
        ref1: "",
        ref2: "",
        ref3: "",
        sender: { bank: { id: "004", name: "กสิกรไทย", short: "KBANK" }, account: { name: { th: "นาย ผู้โอน ท", en: "MR. PHUON T" }, bank: { type: "BANKAC", account: "xxx-x-x1234-x" } } },
        receiver: {
          bank: { id: "014", name: "ไทยพาณิชย์", short: "SCB" },
          account: {
            name: { th: over.name ?? "นาย สมชาย ใ" },
            bank: over.account ? { type: "BANKAC", account: over.account } : undefined,
            proxy: over.proxy === "" ? undefined : { type: over.proxyType ?? "MSISDN", account: over.proxy ?? "xxx-xxx-5678" },
          },
        },
      },
    },
  };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("slip provider config", () => {
  it("is 503 not configured without key or PromptPay ID (never approves)", () => {
    for (const env of [{}, { SLIP_API_KEY: "k" }, { PROMPTPAY_ID: "0812345678" }, { SLIP_API_KEY: "k", PROMPTPAY_ID: "123" }, { ...ENV, SLIP_PROVIDER: "other" }]) {
      expect(() => getSlipConfig(env), JSON.stringify(env)).toThrowError(expect.objectContaining({ status: 503, code: "slip_not_configured" }));
    }
  });
  it("defaults to SlipOK, which needs the numeric branch id", () => {
    const base = { SLIP_API_KEY: "k", PROMPTPAY_ID: "0812345678" };
    expect(() => getSlipConfig(base)).toThrowError(expect.objectContaining({ status: 503 }));
    expect(() => getSlipConfig({ ...base, SLIPOK_BRANCH_ID: "abc" })).toThrowError(expect.objectContaining({ status: 503 }));
    expect(getSlipConfig({ ...base, SLIPOK_BRANCH_ID: "81666" })).toMatchObject({ provider: "slipok", branchId: "81666" });
    expect(getSlipConfig({ ...base, SLIP_PROVIDER: "slipok", SLIPOK_BRANCH_ID: "81666" }).provider).toBe("slipok");
  });
  it("parses names and options", () => {
    expect(cfg.promptPay.digits).toBe("0812345678");
    expect(cfg.names).toEqual(["นาย สมชาย ใจดี", "SOMCHAI JAIDEE"]);
    expect(cfg.matchAccount).toBe(false);
  });
});

describe("EasySlip v2 call", () => {
  it("verifies by payload with Bearer auth and duplicate check", async () => {
    const fetchMock = vi.fn(async () => json(easySlipOk()));
    const { slip, names } = await verifySlipWithProvider({ payload: "PAYLOAD123", remark: "order-1" }, cfg, fetchMock as unknown as typeof fetch);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(EASYSLIP_VERIFY_URL);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    expect(JSON.parse(init.body as string)).toEqual({ payload: "PAYLOAD123", checkDuplicate: true, remark: "order-1" });
    expect(slip).toMatchObject({ transRef: "0002123123121200011", amount: 99, isDuplicate: false, date: "2026-11-23T13:05:00.000Z" });
    expect(slip.receiver).toMatchObject({ proxyType: "MSISDN", proxyAccount: "xxx-xxx-5678", bank: "SCB" });
    expect(names).toEqual(["นาย สมชาย ใ"]);
  });

  it("sends the image as multipart field `image`", async () => {
    const fetchMock = vi.fn(async () => json(easySlipOk()));
    await verifySlipWithProvider({ image: { bytes: new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]), contentType: "image/jpeg" } }, cfg, fetchMock as unknown as typeof fetch);
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    const form = init.body as FormData;
    expect(form.get("image")).toBeInstanceOf(Blob);
    expect(form.get("checkDuplicate")).toBe("true");
  });

  it.each([
    [404, "SLIP_NOT_FOUND", "slip_not_found"],
    [404, "SLIP_PENDING", "slip_pending"],
    [400, "IMAGE_SIZE_TOO_LARGE", "invalid_image"],
    [401, "INVALID_API_KEY", "provider_unavailable"],
    [403, "QUOTA_EXCEEDED", "provider_unavailable"],
    [500, "API_SERVER_ERROR", "provider_unavailable"],
  ])("maps HTTP %i %s → %s", async (status, code, mapped) => {
    const fetchMock = vi.fn(async () => json({ success: false, error: { code, message: "x" } }, status));
    await expect(verifySlipWithProvider({ payload: "P" }, cfg, fetchMock as unknown as typeof fetch)).rejects.toMatchObject({ code: mapped });
  });

  it("network failure / malformed response is 'unavailable', never a pass", async () => {
    const boom = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(verifySlipWithProvider({ payload: "P" }, cfg, boom as unknown as typeof fetch)).rejects.toBeInstanceOf(SlipProviderError);
    const weird = vi.fn(async () => json({ success: true, data: {} }));
    await expect(verifySlipWithProvider({ payload: "P" }, cfg, weird as unknown as typeof fetch)).rejects.toMatchObject({ code: "provider_unavailable" });
  });
});

describe("slip business checks", () => {
  const order = { amountDue: 99, createdAt: "2026-11-23T13:00:00.000Z" };
  const now = Date.parse("2026-11-23T13:10:00.000Z");
  const slipFrom = async (over: Parameters<typeof easySlipOk>[0] = {}) =>
    verifySlipWithProvider({ payload: "P" }, cfg, (async () => json(easySlipOk(over))) as unknown as typeof fetch);
  const run = async (over: Parameters<typeof easySlipOk>[0] = {}, c = cfg) => {
    const { slip, names } = await slipFrom(over);
    return checkSlip(slip, names, order, c, now);
  };

  it("passes a correct slip", async () => {
    expect(await run()).toEqual({ ok: true });
    expect(await run({ amount: 150 })).toEqual({ ok: true }); // paying more is fine
  });

  it("amount below the amount due", async () => {
    expect(await run({ amount: 98.99 })).toMatchObject({ ok: false, code: "amount_too_low" });
  });

  it("receiver must be our PromptPay", async () => {
    expect(await run({ proxy: "xxx-xxx-9999" })).toMatchObject({ ok: false, code: "receiver_mismatch" });
    expect(await run({ proxyType: "NATID", proxy: "x-xxxx-xxxx5-67-8" })).toMatchObject({ ok: false, code: "receiver_mismatch" });
    expect(await run({ name: "นางสาว สมหญิง ร" })).toMatchObject({ ok: false, code: "receiver_mismatch" });
    // no proxy printed: a configured bank account decides …
    expect(await run({ proxy: "", account: "xxx-x-x4321-x" }, { ...cfg, bankAccount: "1234543210" })).toEqual({ ok: true });
    expect(await run({ proxy: "", account: "xxx-x-x9999-x" }, { ...cfg, bankAccount: "1234543210" })).toMatchObject({ ok: false, code: "receiver_mismatch" });
    // … otherwise first name + surname initial must match PROMPTPAY_NAME
    expect(await run({ proxy: "", account: "xxx-x-x4321-x" })).toEqual({ ok: true });
    expect(await run({ proxy: "", account: "xxx-x-x4321-x", name: "นาย สมชาย ก" })).toMatchObject({ ok: false, code: "receiver_mismatch" });
    expect(await run({ proxy: "", account: "xxx-x-x4321-x" }, { ...cfg, names: [] })).toMatchObject({ ok: false, code: "receiver_mismatch" });
  });

  it("slip must be made around this order", async () => {
    expect(await run({ date: "2026-11-21T20:00:00+07:00" })).toMatchObject({ ok: false, code: "slip_too_old" });
    expect(await run({ date: "2026-11-24T21:00:00+07:00" })).toMatchObject({ ok: false, code: "slip_in_future" });
  });

  it("EasySlip account matching (SLIP_MATCH_ACCOUNT) accepts a masked receiver", async () => {
    const strict = getSlipConfig({ ...ENV, SLIP_MATCH_ACCOUNT: "true" });
    const body = easySlipOk({ proxy: "xxx-xxx-xxxx" });
    (body.data as { matchedAccount: unknown }).matchedAccount = { bankNumber: "xxx", type: "PERSONAL" };
    const { slip, names } = await verifySlipWithProvider({ payload: "P" }, strict, (async () => json(body)) as unknown as typeof fetch);
    expect(slip.matchedAccount).toBe(true);
    expect(checkSlip(slip as VerifiedSlip, names, order, strict, now)).toEqual({ ok: true });
    // without matching, a fully masked receiver can only be confirmed by name (first name + surname initial)
    expect(checkSlip({ ...slip, matchedAccount: null }, names, order, cfg, now)).toEqual({ ok: true });
    expect(checkSlip({ ...slip, matchedAccount: null }, names, order, { ...cfg, names: [] }, now)).toMatchObject({ ok: false, code: "receiver_mismatch" });
  });
});

describe("helpers", () => {
  it("masked numbers", () => {
    expect(maskedNumberMatches("xxx-xxx-5678", "0812345678")).toBe(true);
    expect(maskedNumberMatches("081-xxx-5678", "0812345678")).toBe(true);
    expect(maskedNumberMatches("xxx-xxx-5679", "0812345678")).toBe(false);
    expect(maskedNumberMatches("xxx-xxx-xxxx", "0812345678")).toBe(false);
    expect(maskedNumberMatches("xxx-x-x1234-x", "1231123412")).toBe(false);
    expect(maskedNumberMatches("xxx-x-x4321-x", "1234543210")).toBe(true);
  });
  it("names (titles, truncation, language)", () => {
    expect(namesMatch("นาย สมชาย ใ", ["สมชาย ใจดี"])).toBe(true);
    expect(namesMatch("นายสมชาย ใจ", ["นาย สมชาย ใจดี"])).toBe(true);
    expect(namesMatch("MR. SOMCHAI J", ["SOMCHAI JAIDEE"])).toBe(true);
    expect(namesMatch("น.ส. สมหญิง", ["สมชาย ใจดี"])).toBe(false);
  });
});
