import { ApiError, getClientIp, handleError, noStore } from "@/lib/api";
import { uuidSchema } from "@/lib/security/validation";
import { rateLimit } from "@/services/rate-limit";
import { getActiveLantern } from "@/services/lantern-service";

export const dynamic = "force-dynamic";

/** Lantern detail – only while it is still floating (expired lanterns cannot be opened) */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await rateLimit(`lantern:detail:${getClientIp(req)}`, 120, 60);
    const { id } = await ctx.params;
    const lantern = await getActiveLantern(uuidSchema.parse(id));
    if (!lantern) throw new ApiError(404, "not_found", "โคมนี้ลอยหายไปแล้ว หรือไม่มีอยู่");
    return noStore({ lantern, serverTime: new Date().toISOString() });
  } catch (err) {
    return handleError(err, "GET /api/lanterns/[id]");
  }
}
