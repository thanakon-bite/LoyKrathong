import { ApiError, assertSameOrigin, handleError, noStore, readJson } from "@/lib/api";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { catalogItemUpdateSchema, uuidSchema } from "@/lib/security/validation";
import { MIN_PAID_TOTAL } from "@/lib/pricing";
import { requirePermission } from "@/services/admin-service";
import { log } from "@/services/logger";

/** Change the name / price / visibility / order of a lantern colour or effect */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const staff = await requirePermission("packages");
    const id = uuidSchema.parse((await ctx.params).id);
    const p = catalogItemUpdateSchema.parse(await readJson(req));
    const db = getAdminSupabase();
    const { data: current } = await db.from("catalog_items").select("kind, code").eq("id", id).maybeSingle();
    if (!current) throw new ApiError(404, "not_found", "ไม่พบรายการ");
    // the classic lantern must stay free & visible so everybody can always release a lantern
    if (current.kind === "design" && current.code === "classic-golden" && (p.price > 0 || !p.isActive)) {
      throw new ApiError(400, "keep_free", "โคมทองคลาสสิกต้องเปิดใช้และฟรีเสมอ เพื่อให้ทุกคนปล่อยโคมได้");
    }
    if (current.kind === "shape" && current.code === "box" && (p.price > 0 || !p.isActive)) {
      throw new ApiError(400, "keep_free", "ทรงกล่องสี่เหลี่ยมต้องเปิดใช้และฟรีเสมอ เพื่อให้ทุกคนปล่อยโคมได้");
    }
    const { error } = await db
      .from("catalog_items")
      .update({ name: p.name, description: p.description, price: p.price, is_active: p.isActive, sort_order: p.sortOrder })
      .eq("id", id);
    if (error) throw new Error(error.message);
    await log("info", "admin", `catalog ${current.kind}:${current.code} price=${p.price} active=${p.isActive}`, { by: staff.email });
    return noStore({ ok: true, note: p.price > 0 && p.price < MIN_PAID_TOTAL ? `ราคาต่ำกว่า ${MIN_PAID_TOTAL} บาท ลูกค้าต้องซื้อรวมให้ถึงขั้นต่ำของ Stripe` : null });
  } catch (err) {
    return handleError(err, "PATCH /api/admin/catalog/[id]");
  }
}
