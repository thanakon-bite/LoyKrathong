import { assertSameOrigin, handleError, noStore, readJson } from "@/lib/api";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { offeringSettingsSchema } from "@/lib/security/validation";
import { requirePermission } from "@/services/admin-service";
import { log } from "@/services/logger";

/** Preset buttons / min / max / on-off for "put money into the lantern" */
export async function PATCH(req: Request) {
  try {
    assertSameOrigin(req);
    const staff = await requirePermission("packages");
    const o = offeringSettingsSchema.parse(await readJson(req));
    const value = { ...o, presets: [...new Set(o.presets)].sort((a, b) => a - b) };
    const { error } = await getAdminSupabase()
      .from("app_settings")
      .upsert({ key: "public.offering", value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw new Error(error.message);
    await log("info", "admin", `offering settings updated`, { by: staff.email, ...value });
    return noStore({ ok: true, offering: value });
  } catch (err) {
    return handleError(err, "PATCH /api/admin/settings/offering");
  }
}
