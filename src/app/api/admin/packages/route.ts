import { assertSameOrigin, handleError, noStore, readJson } from "@/lib/api";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { packageUpsertSchema } from "@/lib/security/validation";
import { requirePermission } from "@/services/admin-service";
import { listAllPackages } from "@/services/package-service";
import { log } from "@/services/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requirePermission("packages");
    return noStore({ packages: await listAllPackages() });
  } catch (err) {
    return handleError(err, "GET /api/admin/packages");
  }
}

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const staff = await requirePermission("packages");
    const p = packageUpsertSchema.parse(await readJson(req));
    const { data, error } = await getAdminSupabase()
      .from("packages")
      .insert({ slug: p.slug, name: p.name, description: p.description, price: p.price, currency: p.currency, features: p.features, sort_order: p.sortOrder, is_active: p.isActive })
      .select("id")
      .single();
    if (error) throw new Error(error.code === "23505" ? "slug นี้ถูกใช้แล้ว" : error.message);
    await log("info", "admin", `package created: ${p.slug}`, { by: staff.email });
    return noStore({ id: data.id }, 201);
  } catch (err) {
    return handleError(err, "POST /api/admin/packages");
  }
}
