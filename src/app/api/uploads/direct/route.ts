import { z } from "zod";
import { ApiError, assertSameOrigin, getClientIp, handleError, noStore, readJson, requireUser } from "@/lib/api";
import { ALLOWED_UPLOAD_MIME, MAX_SOURCE_IMAGE_BYTES } from "@/lib/security/image";
import { isR2Configured } from "@/lib/storage/r2";
import { rateLimit } from "@/services/rate-limit";
import { createDirectUpload } from "@/services/storage-service";

export const runtime = "nodejs";

const schema = z.object({
  kind: z.enum(["image", "drawing"]),
  contentType: z.enum(ALLOWED_UPLOAD_MIME),
  size: z.number().int().min(1).max(MAX_SOURCE_IMAGE_BYTES),
});

/**
 * POST { kind, contentType, size } → presigned PUT to Cloudflare R2 (photos ≤ 50 MB go browser → R2 directly).
 * 503 direct_upload_unavailable when R2 is not configured – the client then uses POST /api/uploads.
 */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    if (!isR2Configured()) throw new ApiError(503, "direct_upload_unavailable", "ระบบอัปโหลดไฟล์ใหญ่ยังไม่ได้ตั้งค่า");
    await rateLimit(`upload:ip:${getClientIp(req)}`, 40, 600);
    await rateLimit(`upload:user:${user.id}`, 20, 600, "อัปโหลดถี่เกินไป กรุณารอสักครู่");
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) {
      const tooBig = parsed.error.issues.some((i) => i.path[0] === "size" && i.code === "too_big");
      throw tooBig
        ? new ApiError(413, "file_too_large", "ไฟล์ต้องมีขนาดไม่เกิน 50 MB")
        : new ApiError(400, "invalid_upload", "รองรับเฉพาะไฟล์ JPG, PNG และ WEBP");
    }
    const { kind, contentType, size } = parsed.data;
    return noStore(await createDirectUpload(user.id, kind, contentType, size), 201);
  } catch (err) {
    return handleError(err, "POST /api/uploads/direct");
  }
}
