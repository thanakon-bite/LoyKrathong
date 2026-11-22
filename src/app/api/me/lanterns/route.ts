import { handleError, noStore, requireUser } from "@/lib/api";
import { listOwnerLanterns } from "@/services/lantern-service";

export const dynamic = "force-dynamic";

/** Owner-only: all of my released lanterns with content, even after they left the public festival */
export async function GET() {
  try {
    const user = await requireUser();
    return noStore({ lanterns: await listOwnerLanterns(user.id), serverTime: new Date().toISOString() });
  } catch (err) {
    return handleError(err, "GET /api/me/lanterns");
  }
}
