import { z } from "zod";
import { handleError, noStore } from "@/lib/api";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { requirePermission } from "@/services/admin-service";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  status: z.enum(["all", "pending", "paid", "failed", "cancelled", "expired", "refunded"]).default("all"),
  page: z.coerce.number().int().min(0).max(1000).default(0),
});

export async function GET(req: Request) {
  try {
    await requirePermission("payments");
    const q = querySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
    const size = 30;
    let query = getAdminSupabase()
      .from("payments")
      .select("id, user_id, lantern_id, package_name, stripe_session_id, stripe_payment_intent_id, amount, currency, payment_method, payment_status, failure_reason, created_at, paid_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(q.page * size, q.page * size + size - 1);
    if (q.status !== "all") query = query.eq("payment_status", q.status);
    const { data, count, error } = await query;
    if (error) throw new Error(error.message);
    return noStore({ payments: data, total: count ?? 0, pageSize: size });
  } catch (err) {
    return handleError(err, "GET /api/admin/payments");
  }
}
