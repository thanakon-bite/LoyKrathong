import { z } from "zod";
import { handleError, noStore } from "@/lib/api";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { requirePermission } from "@/services/admin-service";
import { signSlipImage } from "@/services/slip-payment-service";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  status: z.enum(["all", "pending", "paid", "failed", "cancelled", "expired", "refunded"]).default("all"),
  page: z.coerce.number().int().min(0).max(1000).default(0),
});

const SLIP_COLUMNS =
  "id, payment_id, image_path, image_store, trans_ref, status, reason, message, amount, slip_date, sender_name, sender_bank, receiver_name, receiver_account, receiver_proxy, receiver_bank, is_duplicate, created_at";

export async function GET(req: Request) {
  try {
    await requirePermission("payments");
    const q = querySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
    const size = 30;
    const db = getAdminSupabase();
    let query = db
      .from("payments")
      .select("id, user_id, lantern_id, package_name, stripe_session_id, stripe_payment_intent_id, amount, currency, payment_method, payment_status, failure_reason, created_at, paid_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(q.page * size, q.page * size + size - 1);
    if (q.status !== "all") query = query.eq("payment_status", q.status);
    const { data, count, error } = await query;
    if (error) throw new Error(error.message);

    // slips of this page (table added by migration 20261123000002 – the list still works without it)
    const ids = (data ?? []).map((p) => p.id as string);
    const slipsByPayment = new Map<string, unknown[]>();
    if (ids.length) {
      const { data: slips } = await db.from("payment_slips").select(SLIP_COLUMNS).in("payment_id", ids).order("created_at", { ascending: false }).limit(200);
      const signed = await Promise.all(
        (slips ?? []).map(async (s) => {
          const { image_path, image_store, ...rest } = s as Record<string, unknown> & { image_path: string | null; image_store: string | null; payment_id: string };
          return { ...rest, image_url: await signSlipImage(image_path, image_store) };
        }),
      );
      for (const s of signed) slipsByPayment.set(s.payment_id, [...(slipsByPayment.get(s.payment_id) ?? []), s]);
    }
    const payments = (data ?? []).map((p) => ({ ...p, slips: slipsByPayment.get(p.id as string) ?? [] }));
    return noStore({ payments, total: count ?? 0, pageSize: size });
  } catch (err) {
    return handleError(err, "GET /api/admin/payments");
  }
}
