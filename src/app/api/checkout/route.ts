import { ApiError, assertSameOrigin, getClientIp, handleError, noStore, readJson, requireUser } from "@/lib/api";
import { releaseRequestSchema } from "@/lib/security/validation";
import { rateLimit } from "@/services/rate-limit";
import { quoteRequest } from "@/services/quote-service";
import { assertAssets, assertHasContent } from "@/services/lantern-service";
import { createPromptPayOrder } from "@/services/slip-payment-service";

/**
 * Creates a PromptPay QR order: pending lantern + pending payment. Every price comes from the database,
 * never from the client. (Stripe Checkout – createCheckoutSession – is no longer used for new orders.)
 */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    await rateLimit(`checkout:ip:${getClientIp(req)}`, 20, 600);
    await rateLimit(`checkout:user:${user.id}`, 8, 600, "สร้างรายการชำระเงินถี่เกินไป กรุณารอสักครู่");

    const body = releaseRequestSchema.parse(await readJson(req));
    assertHasContent(body.lantern);
    const { selection, quote } = await quoteRequest(body);
    if (quote.total <= 0) throw new ApiError(400, "free", "รายการนี้ไม่ต้องชำระเงิน");
    await assertAssets(user.id, body.lantern);

    const order = await createPromptPayOrder(user.id, body.lantern, selection, quote, body.requestId);
    return noStore({ paymentId: order.paymentId, order }, 201);
  } catch (err) {
    return handleError(err, "POST /api/checkout");
  }
}
