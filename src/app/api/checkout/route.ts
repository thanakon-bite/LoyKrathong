import { ApiError, assertSameOrigin, getClientIp, handleError, noStore, readJson, requireUser } from "@/lib/api";
import { releaseRequestSchema } from "@/lib/security/validation";
import { rateLimit } from "@/services/rate-limit";
import { getActivePackage } from "@/services/package-service";
import { assertAssets, assertPackageAllows } from "@/services/lantern-service";
import { createCheckoutSession } from "@/services/payment-service";

/** Creates a Stripe Checkout Session for a paid package. Price comes from the database, never from the client. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    await rateLimit(`checkout:ip:${getClientIp(req)}`, 20, 600);
    await rateLimit(`checkout:user:${user.id}`, 8, 600, "สร้างรายการชำระเงินถี่เกินไป กรุณารอสักครู่");

    const body = releaseRequestSchema.parse(await readJson(req));
    const pkg = await getActivePackage(body.packageSlug);
    if (!pkg) throw new ApiError(404, "package_not_found", "ไม่พบแพ็กเกจที่เลือก");
    assertPackageAllows(body.lantern, pkg);
    await assertAssets(user.id, body.lantern);

    const { url, paymentId } = await createCheckoutSession(user.id, body.lantern, pkg, body.requestId);
    return noStore({ url, paymentId }, 201);
  } catch (err) {
    return handleError(err, "POST /api/checkout");
  }
}
