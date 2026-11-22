import { z } from "zod";
import { handleError, noStore } from "@/lib/api";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { requirePermission } from "@/services/admin-service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requirePermission("reports");
    const status = z.enum(["open", "resolved", "dismissed"]).default("open").parse(new URL(req.url).searchParams.get("status") ?? undefined);
    const { data, error } = await getAdminSupabase()
      .from("lantern_reports")
      .select("id, lantern_id, reason, details, status, created_at, lanterns(display_name, wish_message, blessing_message, status, report_count)")
      .eq("status", status)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return noStore({ reports: data });
  } catch (err) {
    return handleError(err, "GET /api/admin/reports");
  }
}
