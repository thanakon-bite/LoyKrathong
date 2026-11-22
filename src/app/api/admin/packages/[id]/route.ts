import { assertSameOrigin, handleError, noStore, readJson } from "@/lib/api";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { packageUpsertSchema, uuidSchema } from "@/lib/security/validation";
import { requirePermission } from "@/services/admin-service";
import { log } from "@/services/logger";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const staff = await requirePermission("packages");
    const id = uuidSchema.parse((await ctx.params).id);
    const p = packageUpsertSchema.parse(await readJson(req));
    const { error } = await getAdminSupabase()
      .from("packages")
      .update({ slug: p.slug, name: p.name, description: p.description, price: p.price, currency: p.currency, features: p.features, sort_order: p.sortOrder, is_active: p.isActive })
      .eq("id", id);
    if (error) throw new Error(error.message);
    await log("info", "admin", `package updated: ${p.slug} price=${p.price} active=${p.isActive}`, { by: staff.email });
    return noStore({ ok: true });
  } catch (err) {
    return handleError(err, "PATCH /api/admin/packages/[id]");
  }
}
