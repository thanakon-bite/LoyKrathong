import { z } from "zod";
import { ApiError, assertSameOrigin, handleError, noStore, readJson, requireUser } from "@/lib/api";
import { verifyClaimToken } from "@/lib/security/claim-token";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { rateLimit } from "@/services/rate-limit";

/** Moves a guest's lanterns and payment history into the signed-in (registered) account */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    if (user.is_anonymous) throw new ApiError(400, "guest", "กรุณาเข้าสู่ระบบบัญชีก่อน");
    await rateLimit(`claim:${user.id}`, 10, 3600);
    const { token } = z.object({ token: z.string().max(600) }).parse(await readJson(req, 2048));
    const guestId = verifyClaimToken(token);
    if (!guestId) throw new ApiError(400, "invalid_token", "ลิงก์ย้ายโคมหมดอายุหรือไม่ถูกต้อง");
    const { data, error } = await getAdminSupabase().rpc("claim_guest_data", { p_from: guestId, p_to: user.id });
    if (error) throw new ApiError(400, "claim_failed", "ไม่สามารถย้ายโคมได้");
    return noStore({ moved: data ?? 0 });
  } catch (err) {
    return handleError(err, "POST /api/account/claim");
  }
}
