import { handleError, noStore } from "@/lib/api";
import { requirePermission } from "@/services/admin-service";
import { getCatalog } from "@/services/catalog-service";

export const dynamic = "force-dynamic";

/** All catalog items (including hidden ones) + offering settings */
export async function GET() {
  try {
    await requirePermission("packages");
    return noStore({ catalog: await getCatalog({ includeInactive: true }) });
  } catch (err) {
    return handleError(err, "GET /api/admin/catalog");
  }
}
