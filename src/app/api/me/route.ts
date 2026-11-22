import { handleError, noStore, requireUser } from "@/lib/api";
import { listMyLanterns } from "@/services/lantern-service";
import { listPaymentHistory } from "@/services/payment-service";

export const dynamic = "force-dynamic";

/** My lanterns + payment history */
export async function GET() {
  try {
    const user = await requireUser();
    const [lanterns, payments] = await Promise.all([listMyLanterns(user.id), listPaymentHistory(user.id)]);
    return noStore({
      user: { id: user.id, email: user.email ?? null, isAnonymous: Boolean(user.is_anonymous) },
      lanterns,
      payments,
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    return handleError(err, "GET /api/me");
  }
}
