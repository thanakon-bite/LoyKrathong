import { z } from "zod";
import { assertSameOrigin, getClientIp, handleError, noStore, readJson, requireUser, ApiError } from "@/lib/api";
import { releaseRequestSchema } from "@/lib/security/validation";
import { rateLimit } from "@/services/rate-limit";
import { quoteRequest } from "@/services/quote-service";
import {
  assertAssets,
  assertHasContent,
  getActiveLantern,
  getActiveLanternsByIds,
  listActiveLanterns,
  listActiveLanternsSince,
  releaseFreeLantern,
} from "@/services/lantern-service";

export const dynamic = "force-dynamic";

const idsSchema = z.array(z.uuid()).max(50);

const sinceSchema = z.iso.datetime({ offset: true });

/** GET /api/lanterns              → active lanterns (newest first)
 *  GET /api/lanterns?ids=a,b,c    → specific active lanterns (after a realtime "lantern:new" event)
 *  GET /api/lanterns?since=<iso>  → lanterns released after <iso> (incremental polling fallback) */
export async function GET(req: Request) {
  try {
    await rateLimit(`lanterns:get:${getClientIp(req)}`, 240, 60);
    const params = new URL(req.url).searchParams;
    const idsParam = params.get("ids");
    const sinceParam = params.get("since");
    const lanterns = idsParam
      ? await getActiveLanternsByIds(idsSchema.parse(idsParam.split(",").filter(Boolean)))
      : sinceParam
        ? await listActiveLanternsSince(sinceSchema.parse(sinceParam))
        : await listActiveLanterns();
    return noStore({ serverTime: new Date().toISOString(), lanterns });
  } catch (err) {
    return handleError(err, "GET /api/lanterns");
  }
}

/** POST /api/lanterns → release a FREE lantern (anything with a price goes through /api/checkout) */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    const ip = getClientIp(req);
    await rateLimit(`lanterns:post:ip:${ip}`, 20, 600, "ปล่อยโคมถี่เกินไป กรุณารอสักครู่");
    await rateLimit(`lanterns:post:user:${user.id}`, 5, 600, "คุณปล่อยโคมครบจำนวนแล้ว กรุณารอ 10 นาทีแล้วลองใหม่");

    const body = releaseRequestSchema.parse(await readJson(req));
    assertHasContent(body.lantern);
    const { selection, quote } = await quoteRequest(body);
    if (quote.total > 0) throw new ApiError(402, "payment_required", "รายการนี้มีของเสริม/ใส่เงิน ต้องชำระเงินก่อนปล่อยโคม");
    await assertAssets(user.id, body.lantern);

    const { id, duplicate } = await releaseFreeLantern(user.id, body.lantern, selection, body.requestId);
    const lantern = await getActiveLantern(id);
    return noStore({ lantern, duplicate, serverTime: new Date().toISOString() }, duplicate ? 200 : 201);
  } catch (err) {
    return handleError(err, "POST /api/lanterns");
  }
}
