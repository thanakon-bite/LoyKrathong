import { z } from "zod";
import { handleError, noStore, requireUser } from "@/lib/api";
import { getCheckoutStatus } from "@/services/payment-service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const sessionId = z.string().regex(/^cs_[A-Za-z0-9_]+$/).max(255).parse(new URL(req.url).searchParams.get("session_id"));
    return noStore({ status: await getCheckoutStatus(user.id, sessionId) });
  } catch (err) {
    return handleError(err, "GET /api/checkout/status");
  }
}
