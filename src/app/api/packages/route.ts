import { handleError, ok } from "@/lib/api";
import { listActivePackages } from "@/services/package-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const packages = await listActivePackages();
    return ok({ packages }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } });
  } catch (err) {
    return handleError(err, "GET /api/packages");
  }
}
