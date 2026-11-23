import { beforeEach, describe, expect, it, vi } from "vitest";

/* ---------------------------------------------------------------- tiny in-memory Supabase fake */

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
const rpcCalls: Array<{ fn: string; args: Row }> = [];
let rpcImpl: (fn: string, args: Row) => { data: unknown; error: { code: string; message: string } | null } = () => ({ data: null, error: null });

function query(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let op: { kind: "select" | "insert" | "update"; values?: Row; head?: boolean } = { kind: "select" };
  const rows = () => (db[table] ??= []).filter((r) => filters.every((f) => f(r)));
  const run = () => {
    if (op.kind === "insert") {
      const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...op.values };
      db[table].push(row);
      return { data: [row], error: null, count: 1 };
    }
    if (op.kind === "update") {
      for (const r of rows()) Object.assign(r, op.values);
      return { data: null, error: null, count: null };
    }
    const list = rows();
    return { data: op.head ? null : list, error: null, count: list.length };
  };
  const b = {
    select: (_c?: string, o?: { head?: boolean }) => {
      if (op.kind === "select") op = { kind: "select", head: o?.head };
      return b;
    },
    insert: (values: Row) => {
      db[table] ??= [];
      op = { kind: "insert", values };
      return b;
    },
    update: (values: Row) => {
      op = { kind: "update", values };
      return b;
    },
    eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), b),
    neq: (k: string, v: unknown) => (filters.push((r) => r[k] !== v), b),
    lt: () => b,
    in: () => b,
    order: () => b,
    limit: () => b,
    maybeSingle: async () => ({ data: (run().data as Row[] | null)?.[0] ?? null, error: null }),
    single: async () => ({ data: (run().data as Row[] | null)?.[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => void) => resolve(run()),
  };
  return b;
}

const uploads: string[] = [];
vi.mock("@/lib/supabase/admin", () => ({
  LANTERN_BUCKET: "lantern-assets",
  getAdminSupabase: () => ({
    from: query,
    rpc: async (fn: string, args: Row) => {
      rpcCalls.push({ fn, args });
      return rpcImpl(fn, args);
    },
    storage: { from: () => ({ upload: async (path: string) => (uploads.push(path), { error: null }), createSignedUrl: async () => ({ data: null }) }) },
  }),
}));
vi.mock("@/lib/storage/r2", () => ({ isR2Configured: () => false, presignGet: async () => "", putObject: async () => undefined }));
vi.mock("@/services/logger", () => ({ log: async () => undefined, logError: async () => undefined }));
vi.mock("@/services/lantern-service", () => ({ createPendingLantern: async () => "lantern-1", findLanternByRequest: async () => null }));

const { submitSlip, SLIP_METHOD } = await import("@/services/slip-payment-service");

/* ---------------------------------------------------------------- fixtures */

const USER = "11111111-2222-4333-8444-555555555555";
const PAY = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const SLIP_QR = "004000060000010103002021900021231231212000115102TH91049C30";
const TRANS_REF = "0002123123121200011";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 2, 3]);

function easySlipResponse(amount = 99) {
  return new Response(
    JSON.stringify({
      success: true,
      data: {
        isDuplicate: false,
        matchedAccount: null,
        amountInSlip: amount,
        rawSlip: {
          transRef: TRANS_REF,
          date: new Date().toISOString(),
          amount: { amount, local: { amount: 0, currency: "" } },
          sender: { bank: { short: "KBANK" }, account: { name: { th: "นาย ผู้โอน" } } },
          receiver: { bank: { short: "SCB" }, account: { name: { th: "นาย สมชาย ใ" }, proxy: { type: "MSISDN", account: "xxx-xxx-5678" } } },
        },
      },
    }),
    { status: 200 },
  );
}

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  rpcCalls.length = 0;
  uploads.length = 0;
  rpcImpl = () => ({ data: [{ lantern_id: "lantern-1", payment_id: PAY, already_processed: false }], error: null });
  Object.assign(process.env, { SLIP_PROVIDER: "easyslip", SLIP_API_KEY: "test-key", PROMPTPAY_ID: "0812345678" });
  db.payments = [
    {
      id: PAY,
      user_id: USER,
      lantern_id: "lantern-1",
      amount: "99.00",
      payment_status: "pending",
      payment_method: SLIP_METHOD,
      created_at: new Date(Date.now() - 60_000).toISOString(),
      expires_at: null,
      lanterns: { status: "pending_payment", content_purged_at: null },
    },
  ];
  db.slip_transactions = [];
  db.payment_slips = [];
});

describe("submitSlip", () => {
  it("verified slip → activate_slip_payment with the bank's transRef + amount", async () => {
    const fetchMock = vi.fn(async () => easySlipResponse(99));
    const res = await submitSlip(USER, PAY, { bytes: JPEG, payload: SLIP_QR }, fetchMock as unknown as typeof fetch);
    expect(res).toEqual({ status: "paid", lanternId: "lantern-1", alreadyProcessed: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).payload).toBe(SLIP_QR);
    expect(rpcCalls[0]).toMatchObject({ fn: "activate_slip_payment", args: { p_payment_id: PAY, p_trans_ref: TRANS_REF, p_amount: 99 } });
    expect(uploads[0]).toMatch(new RegExp(`^slips/${USER}/${PAY}-[0-9a-f-]{36}\\.jpg$`));
    expect(db.payment_slips[0]).toMatchObject({ trans_ref: TRANS_REF, amount: 99, receiver_bank: "SCB" });
  });

  it("an already used slip is refused before the paid API call", async () => {
    db.slip_transactions.push({ trans_ref: TRANS_REF, payment_id: "another-payment" });
    const fetchMock = vi.fn(async () => easySlipResponse());
    await expect(submitSlip(USER, PAY, { bytes: JPEG, payload: SLIP_QR }, fetchMock as unknown as typeof fetch)).rejects.toMatchObject({ status: 409, code: "slip_used" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rpcCalls).toHaveLength(0);
  });

  it("the unique constraint wins a race (23505 → slip_used)", async () => {
    rpcImpl = () => ({ data: null, error: { code: "23505", message: "duplicate key" } });
    await expect(submitSlip(USER, PAY, { bytes: JPEG, payload: SLIP_QR }, (async () => easySlipResponse()) as unknown as typeof fetch)).rejects.toMatchObject({
      code: "slip_used",
    });
    expect(db.payment_slips[0]).toMatchObject({ status: "rejected", reason: "slip_used" });
  });

  it("too little money → rejected, lantern not released", async () => {
    await expect(submitSlip(USER, PAY, { bytes: JPEG, payload: SLIP_QR }, (async () => easySlipResponse(50)) as unknown as typeof fetch)).rejects.toMatchObject({
      status: 422,
      code: "amount_too_low",
    });
    expect(rpcCalls).toHaveLength(0);
  });

  it("not configured → 503, slip kept for the admin, nothing approved", async () => {
    delete process.env.SLIP_API_KEY;
    const fetchMock = vi.fn();
    await expect(submitSlip(USER, PAY, { bytes: JPEG, payload: SLIP_QR }, fetchMock as unknown as typeof fetch)).rejects.toMatchObject({ status: 503, code: "slip_not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rpcCalls).toHaveLength(0);
    expect(db.payment_slips[0]).toMatchObject({ status: "pending_review", reason: "not_configured" });
  });

  it("not an image / someone else's order", async () => {
    await expect(submitSlip(USER, PAY, { bytes: new TextEncoder().encode("<svg>not an image</svg>") })).rejects.toMatchObject({ status: 415 });
    await expect(submitSlip("99999999-2222-4333-8444-555555555555", PAY, { bytes: JPEG })).rejects.toMatchObject({ status: 404 });
  });

  it("no slip QR in the image → refused before any paid call (slip kept for the admin)", async () => {
    const fetchMock = vi.fn(async () => easySlipResponse());
    for (const payload of [null, "garbage", "00020101021229370016A000000677010111011300668123456785802TH530376454049.006304ABCD"]) {
      await expect(submitSlip(USER, PAY, { bytes: JPEG, payload }, fetchMock as unknown as typeof fetch)).rejects.toMatchObject({ status: 422, code: "no_slip_qr" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.payment_slips.every((r) => r.status === "rejected" && r.reason === "no_slip_qr")).toBe(true);
  });

  it("SlipOK (default provider) end to end", async () => {
    Object.assign(process.env, { SLIP_PROVIDER: "slipok", SLIPOK_BRANCH_ID: "81666" });
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: {
              success: true,
              transRef: TRANS_REF,
              sendingBank: "004",
              receivingBank: "014",
              transTimestamp: new Date().toISOString(),
              sender: { displayName: "นาย ผู้โอน ก" },
              receiver: { displayName: "นาย สมชาย ใ", proxy: { type: "MSISDN", value: "081xxx5678" }, account: { type: "BANKAC", value: "xxx-x-x3109-x" } },
              amount: 99,
            },
          }),
          { status: 200 },
        ),
    );
    expect(await submitSlip(USER, PAY, { bytes: JPEG, payload: SLIP_QR }, fetchMock as unknown as typeof fetch)).toMatchObject({ status: "paid" });
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("https://api.slipok.com/api/line/apikey/81666");
    expect(db.payment_slips[0]).toMatchObject({ provider: "slipok", status: "processing", trans_ref: TRANS_REF });
  });

  it("paid order → idempotent success without another API call", async () => {
    db.payments[0].payment_status = "paid";
    const fetchMock = vi.fn();
    expect(await submitSlip(USER, PAY, { bytes: JPEG, payload: SLIP_QR }, fetchMock as unknown as typeof fetch)).toMatchObject({ status: "paid", alreadyProcessed: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
