import { z } from "zod";
import { assertSameOrigin, getClientIp, handleError, noStore, readJson, requireUser, ApiError } from "@/lib/api";
import { releaseRequestSchema } from "@/lib/security/validation";
import { rateLimit } from "@/services/rate-limit";
import { getActivePackage } from "@/services/package-service";
import {
  assertAssets,
  assertPackageAllows,
  getActiveLantern,
  getActiveLanternsByIds,
  listActiveLanterns,
  releaseFreeLantern,
} from "@/services/lantern-service";

export const dynamic = "force-dynamic";

const idsSchema = z.array(z.uuid()).max(50);

/** GET /api/lanterns            → active lanterns (newest first)
 *  GET /api/lanterns?ids=a,b,c  → specific active lanterns (used after a realtime "lantern:new" event) */
export async function GET(req: Request) {
  try {
    await rateLimit(`lanterns:get:${getClientIp(req)}`, 120, 60);
    const idsParam = new URL(req.url).searchParams.get("ids");
    const lanterns = idsParam ? await getActiveLanternsByIds(idsSchema.parse(idsParam.split(",").filter(Boolean))) : await listActiveLanterns();
    return noStore({ serverTime: new Date().toISOString(), lanterns });
  } catch (err) {
    return handleError(err, "GET /api/lanterns");
  }
}

/** POST /api/lanterns → release a lantern with a FREE package (paid packages go through /api/checkout) */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    const ip = getClientIp(req);
    await rateLimit(`lanterns:post:ip:${ip}`, 20, 600, "ปล่อยโคมถี่เกินไป กรุณารอสักครู่");
    await rateLimit(`lanterns:post:user:${user.id}`, 5, 600, "คุณปล่อยโคมครบจำนวนแล้ว กรุณารอ 10 นาทีแล้วลองใหม่");

    const body = releaseRequestSchema.parse(await readJson(req));
    const pkg = await getActivePackage(body.packageSlug);
    if (!pkg) throw new ApiError(404, "package_not_found", "ไม่พบแพ็กเกจที่เลือก");
    if (pkg.price > 0) throw new ApiError(402, "payment_required", "แพ็กเกจนี้ต้องชำระเงินก่อนปล่อยโคม");
    assertPackageAllows(body.lantern, pkg);
    await assertAssets(user.id, body.lantern);

    const { id, duplicate } = await releaseFreeLantern(user.id, body.lantern, pkg, body.requestId);
    const lantern = await getActiveLantern(id);
    return noStore({ lantern, duplicate, serverTime: new Date().toISOString() }, duplicate ? 200 : 201);
  } catch (err) {
    return handleError(err, "POST /api/lanterns");
  }
}
