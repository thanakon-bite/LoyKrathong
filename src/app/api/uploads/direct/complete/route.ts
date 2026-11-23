import { z } from "zod";
import { ApiError, assertSameOrigin, handleError, noStore, readJson, requireUser } from "@/lib/api";
import { finishDirectUpload, signedUrl } from "@/services/storage-service";

export const runtime = "nodejs";
// re-encoding a 50 MB photo takes a few seconds
export const maxDuration = 26;

const schema = z.object({ key: z.string().max(200) });

/** POST { key } → validates + re-encodes the raw R2 upload (strips EXIF/GPS), returns the stored asset path */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) throw new ApiError(400, "invalid_upload", "ข้อมูลการอัปโหลดไม่ถูกต้อง");
    const { path } = await finishDirectUpload(user.id, parsed.data.key);
    return noStore({ path, previewUrl: await signedUrl(path, 3600) }, 201);
  } catch (err) {
    return handleError(err, "POST /api/uploads/direct/complete");
  }
}
