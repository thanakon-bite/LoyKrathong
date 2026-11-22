import { handleError, ok } from "@/lib/api";
import { getFestivalStats } from "@/services/lantern-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const stats = await getFestivalStats();
    return ok({ stats }, { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30" } });
  } catch (err) {
    return handleError(err, "GET /api/stats");
  }
}
