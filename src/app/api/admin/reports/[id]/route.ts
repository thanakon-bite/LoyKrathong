import { z } from "zod";
import { assertSameOrigin, handleError, noStore, readJson } from "@/lib/api";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { uuidSchema } from "@/lib/security/validation";
import { requirePermission } from "@/services/admin-service";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    await requirePermission("reports");
    const id = uuidSchema.parse((await ctx.params).id);
    const { status } = z.object({ status: z.enum(["resolved", "dismissed"]) }).parse(await readJson(req, 1024));
    const { error } = await getAdminSupabase().from("lantern_reports").update({ status }).eq("id", id);
    if (error) throw new Error(error.message);
    return noStore({ ok: true });
  } catch (err) {
    return handleError(err, "PATCH /api/admin/reports/[id]");
  }
}
