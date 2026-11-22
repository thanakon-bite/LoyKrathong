import { z } from "zod";
import { handleError, noStore } from "@/lib/api";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { requirePermission } from "@/services/admin-service";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  filter: z.enum(["all", "active", "reported", "removed"]).default("all"),
  page: z.coerce.number().int().min(0).max(1000).default(0),
});

export async function GET(req: Request) {
  try {
    await requirePermission("lanterns");
    const q = querySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
    const size = 30;
    let query = getAdminSupabase()
      .from("lanterns")
      .select(
        "id, user_id, display_name, wish_message, blessing_message, extra_message, lantern_type, status, report_count, moderation_note, created_at, released_at, expires_at, content_purged_at, image_url, drawing_data",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(q.page * size, q.page * size + size - 1);
    if (q.filter === "active") query = query.eq("status", "active").gt("expires_at", new Date().toISOString());
    if (q.filter === "reported") query = query.gt("report_count", 0).order("report_count", { ascending: false });
    if (q.filter === "removed") query = query.eq("status", "removed");
    const { data, count, error } = await query;
    if (error) throw new Error(error.message);
    return noStore({ lanterns: data, total: count ?? 0, pageSize: size });
  } catch (err) {
    return handleError(err, "GET /api/admin/lanterns");
  }
}
