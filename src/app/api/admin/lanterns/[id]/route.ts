import { z } from "zod";
import { ApiError, assertSameOrigin, handleError, noStore, readJson } from "@/lib/api";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { uuidSchema } from "@/lib/security/validation";
import { sanitizeText } from "@/lib/security/sanitize";
import { requirePermission } from "@/services/admin-service";
import { log } from "@/services/logger";

const bodySchema = z.object({
  action: z.enum(["remove", "restore"]),
  note: z.string().max(300).optional(),
});

/** remove → hide immediately (broadcasts lantern:removed); restore → back to the scene if not yet expired */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const staff = await requirePermission("lanterns");
    const id = uuidSchema.parse((await ctx.params).id);
    const body = bodySchema.parse(await readJson(req, 2048));
    const db = getAdminSupabase();
    const { data: lantern } = await db.from("lanterns").select("status, expires_at").eq("id", id).maybeSingle();
    if (!lantern) throw new ApiError(404, "not_found", "ไม่พบโคม");

    if (body.action === "remove") {
      await db.from("lanterns").update({ status: "removed", moderation_note: sanitizeText(body.note ?? "removed by moderator") }).eq("id", id);
      await db.from("lantern_reports").update({ status: "resolved" }).eq("lantern_id", id).eq("status", "open");
    } else {
      if (lantern.status !== "removed" || !lantern.expires_at || Date.parse(lantern.expires_at) <= Date.now()) {
        throw new ApiError(400, "cannot_restore", "กู้คืนได้เฉพาะโคมที่ถูกซ่อนและยังไม่หมดอายุ");
      }
      await db.from("lanterns").update({ status: "active", moderation_note: sanitizeText(body.note ?? "restored by moderator") }).eq("id", id);
      await db.from("lantern_reports").update({ status: "dismissed" }).eq("lantern_id", id).eq("status", "open");
    }
    await log("info", "moderation", `lantern ${body.action}: ${id}`, { by: staff.email });
    return noStore({ ok: true });
  } catch (err) {
    return handleError(err, "PATCH /api/admin/lanterns/[id]");
  }
}
