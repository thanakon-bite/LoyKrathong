import { ApiError, assertSameOrigin, getClientIp, handleError, noStore, requireUser } from "@/lib/api";
import { slipPayloadSchema, uuidSchema } from "@/lib/security/validation";
import { rateLimit } from "@/services/rate-limit";
import { SLIP_MAX_BYTES } from "@/services/slip-verify";
import { submitSlip } from "@/services/slip-payment-service";

export const dynamic = "force-dynamic";
// the slip API answers in 1–5 s; allow for a slow bank
export const maxDuration = 30;

/**
 * POST multipart/form-data { file: slip image (≤ 4 MB), payload: slip QR read in the browser }
 * → verified against the bank via the slip API → payment paid + lantern released.
 * Without a valid slip QR the image is kept for the admin and refused before any paid API call.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    const id = uuidSchema.parse((await ctx.params).id);
    const msg = "แนบสลิปถี่เกินไป กรุณารอสักครู่แล้วลองใหม่";
    await rateLimit(`slip:ip:${getClientIp(req)}`, 20, 600, msg);
    await rateLimit(`slip:user:${user.id}`, 10, 600, msg);
    await rateLimit(`slip:payment:${id}`, 6, 600, msg);

    const length = Number(req.headers.get("content-length") ?? 0);
    if (length > SLIP_MAX_BYTES + 64 * 1024) throw new ApiError(413, "file_too_large", "ไฟล์สลิปต้องมีขนาดไม่เกิน 4 MB");
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new ApiError(400, "invalid_upload", "ข้อมูลการอัปโหลดไม่ถูกต้อง");
    }
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "missing_file", "กรุณาแนบภาพสลิป");
    if (file.size > SLIP_MAX_BYTES) throw new ApiError(413, "file_too_large", "ไฟล์สลิปต้องมีขนาดไม่เกิน 4 MB");
    const rawPayload = form.get("payload");
    const payload = typeof rawPayload === "string" && rawPayload ? slipPayloadSchema.safeParse(rawPayload) : null;

    const result = await submitSlip(user.id, id, {
      bytes: new Uint8Array(await file.arrayBuffer()),
      payload: payload?.success ? payload.data : null,
    });
    return noStore(result);
  } catch (err) {
    return handleError(err, "POST /api/payments/[id]/slip");
  }
}
