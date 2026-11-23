import { describe, expect, it, vi } from "vitest";
import { checkSlip, getSlipConfig, getSlipQuota, SLIPOK_API_BASE, verifySlipWithProvider } from "@/services/slip-verify";

const cfg = getSlipConfig({
  SLIP_PROVIDER: "slipok",
  SLIP_API_KEY: "branch-key",
  SLIPOK_BRANCH_ID: "81666",
  PROMPTPAY_ID: "0861230000",
  PROMPTPAY_NAME: "นาย ธนกร รักดี",
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** shape of the success example in the SlipOK Guide v1.12 (Check Slip) */
function slipOkData(over: { amount?: number; ts?: string; proxy?: { type: string; value: string }; account?: string; displayName?: string } = {}) {
  return {
    success: true,
    message: "✅",
    rqUID: "740_20230601_xxx",
    language: "TH",
    transRef: "016152114519BPM04009",
    sendingBank: "004",
    receivingBank: "014",
    transDate: "20261123",
    transTime: "20:05:07",
    transTimestamp: over.ts ?? "2026-11-23T13:05:07.000Z",
    sender: { displayName: "นาย ผู้โอน ก", name: "Mr. Phuon K", proxy: { type: null, value: null }, account: { type: "BANKAC", value: "xxx-x-x0209-x" } },
    receiver: {
      displayName: over.displayName ?? "นาย ธนกร ร",
      name: "THANAKORN R",
      proxy: over.proxy ?? { type: "MSISDN", value: "086xxx0000" },
      account: { type: "BANKAC", value: over.account ?? "xxx-x-x3109-x" },
    },
    amount: over.amount ?? 99,
    paidLocalAmount: over.amount ?? 99,
    paidLocalCurrency: "764",
    countryCode: "TH",
    transFeeAmount: 0,
    ref1: "",
    ref2: "",
    ref3: "",
    toMerchantId: "",
  };
}

const order = { amountDue: 99, createdAt: "2026-11-23T13:00:00.000Z" };
const now = Date.parse("2026-11-23T13:10:00.000Z");

describe("SlipOK check slip", () => {
  it("posts the slip QR as `data` with log: true to the branch URL", async () => {
    const fetchMock = vi.fn(async () => json({ success: true, data: slipOkData() }));
    const { slip, names } = await verifySlipWithProvider({ payload: "0041000600000101030040220...", remark: "x" }, cfg, fetchMock as unknown as typeof fetch);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${SLIPOK_API_BASE}/81666`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["x-authorization"]).toBe("branch-key");
    expect(JSON.parse(init.body as string)).toEqual({ data: "0041000600000101030040220...", log: true });
    expect(slip).toMatchObject({
      provider: "slipok",
      transRef: "016152114519BPM04009",
      amount: 99,
      date: "2026-11-23T13:05:07.000Z",
      isDuplicate: false,
      receiver: { name: "นาย ธนกร ร", proxyType: "MSISDN", proxyAccount: "086xxx0000", account: "xxx-x-x3109-x", bank: "014" },
    });
    expect(names).toEqual(["นาย ธนกร ร", "THANAKORN R"]);
    expect(checkSlip(slip, names, order, cfg, now)).toEqual({ ok: true });
  });

  it("image fallback uses multipart `files`", async () => {
    const fetchMock = vi.fn(async () => json({ success: true, data: slipOkData() }));
    await verifySlipWithProvider({ image: { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0]), contentType: "image/jpeg" } }, cfg, fetchMock as unknown as typeof fetch);
    const form = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData;
    expect(form.get("files")).toBeInstanceOf(Blob);
    expect(form.get("log")).toBe("true");
  });

  it("falls back to transDate + transTime (Thai time) without transTimestamp", async () => {
    const d = { ...slipOkData(), transTimestamp: undefined };
    const { slip } = await verifySlipWithProvider({ payload: "P" }, cfg, (async () => json({ success: true, data: d })) as unknown as typeof fetch);
    expect(slip.date).toBe("2026-11-23T13:05:07.000Z");
  });

  it("our checks: amount, receiver proxy digits, masked name", async () => {
    const run = async (over: Parameters<typeof slipOkData>[0]) => {
      const { slip, names } = await verifySlipWithProvider({ payload: "P" }, cfg, (async () => json({ success: true, data: slipOkData(over) })) as unknown as typeof fetch);
      return checkSlip(slip, names, order, cfg, now);
    };
    expect(await run({ amount: 98 })).toMatchObject({ code: "amount_too_low" });
    expect(await run({ proxy: { type: "MSISDN", value: "086xxx1111" } })).toMatchObject({ code: "receiver_mismatch" });
    expect(await run({ displayName: "นางสาว สมศรี ม" })).toMatchObject({ code: "receiver_mismatch" });
    // receiver proxy empty (only a bank account printed) → name with surname initial
    expect(await run({ proxy: { type: "", value: "" } })).toEqual({ ok: true });
    expect(await run({ ts: "2026-11-20T13:00:00.000Z" })).toMatchObject({ code: "slip_too_old" });
  });

  it("1012 duplicate returns the original slip flagged as duplicate", async () => {
    const fetchMock = vi.fn(async () => json({ code: 1012, message: "สลิปซ้ำ", data: slipOkData() }, 400));
    const { slip } = await verifySlipWithProvider({ payload: "P" }, cfg, fetchMock as unknown as typeof fetch);
    expect(slip.isDuplicate).toBe(true);
    const bare = vi.fn(async () => json({ code: 1012, message: "สลิปซ้ำ" }, 400));
    await expect(verifySlipWithProvider({ payload: "P" }, cfg, bare as unknown as typeof fetch)).rejects.toMatchObject({ code: "slip_used", status: 409 });
  });

  it.each([
    [1000, "invalid_image"],
    [1006, "invalid_image"],
    [1007, "slip_not_found"],
    [1008, "slip_not_found"],
    [1011, "slip_not_found"],
    [1010, "slip_pending"],
    [1014, "receiver_mismatch"],
    [1002, "provider_unavailable"],
    [1004, "provider_unavailable"],
    [1009, "provider_unavailable"],
  ])("maps error %i → %s", async (code, mapped) => {
    const fetchMock = vi.fn(async () => json({ code, message: "x", data: code === 1010 ? { delay: 5, bankCode: "002" } : undefined }, 400));
    await expect(verifySlipWithProvider({ payload: "P" }, cfg, fetchMock as unknown as typeof fetch)).rejects.toMatchObject({ code: mapped });
  });

  it("1010 tells the payer how long to wait", async () => {
    const fetchMock = vi.fn(async () => json({ code: 1010, message: "delay", data: { delay: 5 } }, 400));
    await expect(verifySlipWithProvider({ payload: "P" }, cfg, fetchMock as unknown as typeof fetch)).rejects.toThrow(/5 นาที/);
  });
});

describe("SlipOK quota", () => {
  it("GET …/<branch>/quota", async () => {
    const fetchMock = vi.fn(async () => json({ success: true, data: { quota: 87, overQuota: 0, specialQuota: 0, endDate: "2026-12-31", specialEndDate: null } }));
    const q = await getSlipQuota(cfg, fetchMock as unknown as typeof fetch);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${SLIPOK_API_BASE}/81666/quota`);
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>)["x-authorization"]).toBe("branch-key");
    expect(q).toEqual({ provider: "slipok", quota: 87, overQuota: 0, specialQuota: 0, endDate: "2026-12-31", specialEndDate: null });
  });
  it("EasySlip has no quota call", async () => {
    expect(await getSlipQuota({ ...cfg, provider: "easyslip" })).toBeNull();
  });
});
