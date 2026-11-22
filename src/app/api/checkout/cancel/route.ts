import { z } from "zod";
import { assertSameOrigin, handleError, noStore, readJson, requireUser } from "@/lib/api";
import { cancelCheckout } from "@/services/payment-service";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    const { paymentId } = z.object({ paymentId: z.uuid() }).parse(await readJson(req, 1024));
    return noStore(await cancelCheckout(user.id, paymentId));
  } catch (err) {
    return handleError(err, "POST /api/checkout/cancel");
  }
}
