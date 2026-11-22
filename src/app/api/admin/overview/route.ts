import { handleError, noStore } from "@/lib/api";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { requirePermission } from "@/services/admin-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const staff = await requirePermission("dashboard");
    const db = getAdminSupabase();
    const nowIso = new Date().toISOString();
    const dayAgo = new Date(Date.now() - 864e5).toISOString();
    const [stats, active, users, registered, openReports, paid, lantern24h] = await Promise.all([
      db.from("festival_statistics").select("*").eq("id", 1).single(),
      db.from("lanterns").select("id", { count: "exact", head: true }).eq("status", "active").gt("expires_at", nowIso),
      db.from("users").select("id", { count: "exact", head: true }),
      db.from("users").select("id", { count: "exact", head: true }).eq("is_anonymous", false),
      db.from("lantern_reports").select("id", { count: "exact", head: true }).eq("status", "open"),
      db.from("payments").select("amount").eq("payment_status", "paid").limit(10000),
      db.from("lanterns").select("id", { count: "exact", head: true }).gte("released_at", dayAgo),
    ]);
    const revenue = (paid.data ?? []).reduce((s, p) => s + Number(p.amount), 0);
    return noStore({
      role: staff.role,
      totals: {
        lanterns: Number(stats.data?.total_lanterns ?? 0),
        participants: Number(stats.data?.total_participants ?? 0),
        wishes: Number(stats.data?.total_wishes ?? 0),
        activeLanterns: active.count ?? 0,
        users: users.count ?? 0,
        registeredUsers: registered.count ?? 0,
        openReports: openReports.count ?? 0,
        paidPayments: paid.data?.length ?? 0,
        revenue,
        lanternsLast24h: lantern24h.count ?? 0,
      },
    });
  } catch (err) {
    return handleError(err, "GET /api/admin/overview");
  }
}
