import { assertSameOrigin, getClientIp, handleError, noStore, readJson, requireUser } from "@/lib/api";
import { reportSchema, uuidSchema } from "@/lib/security/validation";
import { rateLimit } from "@/services/rate-limit";
import { reportLantern } from "@/services/lantern-service";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    await rateLimit(`report:${user.id}`, 10, 3600, "คุณรายงานบ่อยเกินไป กรุณาลองใหม่ภายหลัง");
    const { id } = await ctx.params;
    // one network may report a given lantern once per day, and 6 lanterns per hour overall
    await rateLimit(`report:ip:${getClientIp(req)}`, 6, 3600, "คุณรายงานบ่อยเกินไป กรุณาลองใหม่ภายหลัง");
    await rateLimit(`report:ip:${getClientIp(req)}:${id}`, 1, 86400, "รายงานโคมนี้ไปแล้ว ทีมงานกำลังตรวจสอบ");
    const body = reportSchema.parse(await readJson(req, 4096));
    await reportLantern(uuidSchema.parse(id), user.id, body.reason, body.details);
    return noStore({ ok: true }, 201);
  } catch (err) {
    return handleError(err, "POST /api/lanterns/[id]/report");
  }
}
