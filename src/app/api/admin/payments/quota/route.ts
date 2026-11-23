import { handleError, noStore } from "@/lib/api";
import { requirePermission } from "@/services/admin-service";
import { getSlipConfig, getSlipQuota, SlipProviderError } from "@/services/slip-verify";

export const dynamic = "force-dynamic";

/** GET → remaining slip-verification quota (SlipOK) for the admin payments page */
export async function GET() {
  try {
    await requirePermission("payments");
    const cfg = getSlipConfig();
    try {
      return noStore({ provider: cfg.provider, quota: await getSlipQuota(cfg), error: null });
    } catch (e) {
      if (!(e instanceof SlipProviderError)) throw e;
      return noStore({ provider: cfg.provider, quota: null, error: `${e.message} (${e.providerCode})` });
    }
  } catch (err) {
    return handleError(err, "GET /api/admin/payments/quota");
  }
}
