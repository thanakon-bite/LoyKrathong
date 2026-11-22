import { z } from "zod";
import { handleError, noStore } from "@/lib/api";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { requirePermission } from "@/services/admin-service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requirePermission("logs");
    const level = z.enum(["all", "info", "warn", "error"]).default("all").parse(new URL(req.url).searchParams.get("level") ?? undefined);
    let query = getAdminSupabase().from("error_logs").select("id, level, source, message, context, created_at").order("created_at", { ascending: false }).limit(200);
    if (level !== "all") query = query.eq("level", level);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return noStore({ logs: data });
  } catch (err) {
    return handleError(err, "GET /api/admin/logs");
  }
}
