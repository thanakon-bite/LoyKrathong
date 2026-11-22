import { handleError, ok } from "@/lib/api";
import { getCatalog } from "@/services/catalog-service";

export const dynamic = "force-dynamic";

/** Prices of lantern colours, effects and offering settings (display only – the server re-prices at checkout) */
export async function GET() {
  try {
    return ok({ catalog: await getCatalog() }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } });
  } catch (err) {
    return handleError(err, "GET /api/catalog");
  }
}
