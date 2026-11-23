import { ApiError, assertSameOrigin, getClientIp, handleError, noStore, requireUser } from "@/lib/api";
import { MAX_UPLOAD_BYTES } from "@/lib/security/image";
import { rateLimit } from "@/services/rate-limit";
import { processAndStoreAsset, signedUrl } from "@/services/storage-service";

export const runtime = "nodejs";

/** POST multipart/form-data { kind: "image" | "drawing", file } */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    await rateLimit(`upload:ip:${getClientIp(req)}`, 40, 600);
    await rateLimit(`upload:user:${user.id}`, 20, 600, "อัปโหลดถี่เกินไป กรุณารอสักครู่");

    const length = Number(req.headers.get("content-length") ?? 0);
    if (length > MAX_UPLOAD_BYTES + 64 * 1024) throw new ApiError(413, "file_too_large", "ไฟล์ที่ส่งขึ้นใหญ่เกินไป กรุณาเลือกรูปใหม่อีกครั้ง");

    const form = await req.formData();
    const kind = form.get("kind");
    const file = form.get("file");
    if (kind !== "image" && kind !== "drawing") throw new ApiError(400, "invalid_kind", "ประเภทไฟล์ไม่ถูกต้อง");
    if (!(file instanceof File)) throw new ApiError(400, "missing_file", "ไม่พบไฟล์");
    if (file.size > MAX_UPLOAD_BYTES) throw new ApiError(413, "file_too_large", "ไฟล์ที่ส่งขึ้นใหญ่เกินไป กรุณาเลือกรูปใหม่อีกครั้ง");

    const bytes = new Uint8Array(await file.arrayBuffer());
    const { path } = await processAndStoreAsset(user.id, kind, bytes);
    return noStore({ path, previewUrl: await signedUrl(path, 3600) }, 201);
  } catch (err) {
    return handleError(err, "POST /api/uploads");
  }
}
