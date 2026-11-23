import { assertSameOrigin, handleError, noStore, readJson } from "@/lib/api";
import { adminPaymentActionSchema, uuidSchema } from "@/lib/security/validation";
import { requirePermission } from "@/services/admin-service";
import { adminApproveSlipPayment } from "@/services/slip-payment-service";

/** POST { action: "approve" } → admin checked the slip by hand → paid + lantern released */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const staff = await requirePermission("payments");
    const id = uuidSchema.parse((await ctx.params).id);
    adminPaymentActionSchema.parse(await readJson(req, 512));
    return noStore(await adminApproveSlipPayment(id, staff.id));
  } catch (err) {
    return handleError(err, "POST /api/admin/payments/[id]");
  }
}
