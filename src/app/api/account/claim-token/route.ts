import { ApiError, assertSameOrigin, handleError, noStore, requireUser } from "@/lib/api";
import { createClaimToken } from "@/lib/security/claim-token";

/** Issued to a guest before signing in to an existing account, so their lanterns can be moved afterwards */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    if (!user.is_anonymous) throw new ApiError(400, "not_guest", "บัญชีนี้ไม่ใช่บัญชีผู้เยี่ยมชม");
    return noStore({ token: createClaimToken(user.id) });
  } catch (err) {
    return handleError(err, "POST /api/account/claim-token");
  }
}
