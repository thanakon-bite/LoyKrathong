import "server-only";
import sharp from "sharp";
import { ApiError } from "@/lib/api";
import { getAdminSupabase, LANTERN_BUCKET } from "@/lib/supabase/admin";
import { MAX_UPLOAD_BYTES, sniffImageType } from "@/lib/security/image";
import { TEX_H, TEX_W } from "@/lib/lantern/texture";

export type AssetKind = "image" | "drawing";

/**
 * Validates and re-encodes an uploaded image server-side.
 * Re-encoding with sharp strips metadata (EXIF/GPS) and neutralises any payload hidden in the file.
 */
export async function processAndStoreAsset(userId: string, kind: AssetKind, bytes: Uint8Array) {
  if (bytes.byteLength === 0) throw new ApiError(400, "empty_file", "ไฟล์ว่างเปล่า");
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new ApiError(413, "file_too_large", "ไฟล์ต้องมีขนาดไม่เกิน 5 MB");
  const type = sniffImageType(bytes);
  if (!type) throw new ApiError(415, "unsupported_type", "รองรับเฉพาะไฟล์ JPG, PNG และ WEBP");

  let output: Buffer;
  let ext: "webp" | "png";
  try {
    const img = sharp(bytes, { limitInputPixels: 40_000_000, failOn: "error" }).rotate();
    const meta = await img.metadata();
    if (!meta.width || !meta.height) throw new Error("no dimensions");
    if (kind === "drawing") {
      output = await img.resize(TEX_W, TEX_H, { fit: "fill" }).png({ compressionLevel: 9, palette: true }).toBuffer();
      ext = "png";
    } else {
      output = await img.resize(1200, 1200, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
      ext = "webp";
    }
  } catch {
    throw new ApiError(415, "invalid_image", "ไม่สามารถอ่านไฟล์รูปภาพได้ หรือไฟล์เสียหาย");
  }

  const path = `${userId}/${kind}-${crypto.randomUUID()}.${ext}`;
  const { error } = await getAdminSupabase()
    .storage.from(LANTERN_BUCKET)
    .upload(path, output, { contentType: ext === "png" ? "image/png" : "image/webp", upsert: false, cacheControl: "3600" });
  if (error) throw new Error(`storage upload failed: ${error.message}`);
  return { path, bytes: output.byteLength };
}

/** Asset must live in the caller's own folder and exist */
export async function assertOwnedAsset(userId: string, path: string | null) {
  if (!path) return;
  if (!path.startsWith(`${userId}/`)) throw new ApiError(403, "asset_forbidden", "ไม่สามารถใช้ไฟล์นี้ได้");
  const { data, error } = await getAdminSupabase().storage.from(LANTERN_BUCKET).exists(path);
  if (error || !data) throw new ApiError(400, "asset_missing", "ไม่พบไฟล์ที่อัปโหลด กรุณาอัปโหลดใหม่");
}

export async function signedUrl(path: string, expiresInSeconds: number) {
  const { data, error } = await getAdminSupabase()
    .storage.from(LANTERN_BUCKET)
    .createSignedUrl(path, Math.max(60, Math.ceil(expiresInSeconds)));
  if (error) return null;
  return data.signedUrl;
}

/** Signed URLs never outlive their lantern and are re-issued on every fetch (clients resync often) */
const MAX_SIGNED_SECONDS = 6 * 3600;

/**
 * Signs many paths. Paths are grouped by expiry bucket so each URL stops working when its
 * lantern expires (or after MAX_SIGNED_SECONDS, whichever is sooner).
 */
export async function signMany(items: Array<{ path: string; expiresInSeconds: number }>) {
  const result = new Map<string, string>();
  const groups = new Map<number, string[]>();
  for (const it of items) {
    const capped = Math.min(it.expiresInSeconds, MAX_SIGNED_SECONDS);
    const bucket = Math.max(60, Math.ceil(capped / 600) * 600);
    const list = groups.get(bucket) ?? [];
    list.push(it.path);
    groups.set(bucket, list);
  }
  await Promise.all(
    [...groups.entries()].map(async ([expiresIn, paths]) => {
      const { data } = await getAdminSupabase().storage.from(LANTERN_BUCKET).createSignedUrls(paths, expiresIn);
      for (const row of data ?? []) if (row.path && row.signedUrl) result.set(row.path, row.signedUrl);
    }),
  );
  return result;
}

export async function removeAssets(paths: string[]) {
  if (!paths.length) return;
  const { error } = await getAdminSupabase().storage.from(LANTERN_BUCKET).remove(paths);
  if (error) throw new Error(`storage remove failed: ${error.message}`);
}
