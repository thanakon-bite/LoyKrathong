import { handleError, noStore, requireUser } from "@/lib/api";
import { uuidSchema } from "@/lib/security/validation";
import { rateLimit } from "@/services/rate-limit";
import { getPromptPayOrder } from "@/services/slip-payment-service";

export const dynamic = "force-dynamic";

/** GET → the caller's PromptPay order (QR payload with the server-side amount, status, last slip result) */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const id = uuidSchema.parse((await ctx.params).id);
    await rateLimit(`payment-view:${user.id}`, 60, 60);
    return noStore({ order: await getPromptPayOrder(user.id, id) });
  } catch (err) {
    return handleError(err, "GET /api/payments/[id]");
  }
}
