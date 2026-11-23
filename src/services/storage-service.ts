import "server-only";
import { ApiError } from "@/lib/api";
import { getAdminSupabase, LANTERN_BUCKET } from "@/lib/supabase/admin";
import { MAX_SOURCE_IMAGE_BYTES, sniffImageType } from "@/lib/security/image";
import { InvalidImageError, reencodeImage } from "./image-processing";
import { deleteObjects, getObject, headObject, isR2Configured, presignGet, presignPut, putObject } from "@/lib/storage/r2";

export type { AssetKind } from "./image-processing";
import type { AssetKind } from "./image-processing";

/**
 * Where an asset lives is encoded in its file name (the DB constraint on image_url only allows
 * "<uuid>/<name>.webp|png", so no folder prefix):
 *   <userId>/r2-image-<uuid>.webp  → Cloudflare R2
 *   <userId>/image-<uuid>.webp     → Supabase Storage (older lanterns)
 */
export const isR2Path = (path: string) => /^[^/]+\/r2-/.test(path);

/**
 * Validates and re-encodes an uploaded image server-side.
 * Re-encoding with sharp strips metadata (EXIF/GPS) and neutralises any payload hidden in the file.
 */
export async function processAndStoreAsset(userId: string, kind: AssetKind, bytes: Uint8Array) {
  if (bytes.byteLength === 0) throw new ApiError(400, "empty_file", "ไฟล์ว่างเปล่า");
  if (bytes.byteLength > MAX_SOURCE_IMAGE_BYTES) throw new ApiError(413, "file_too_large", "ไฟล์ต้องมีขนาดไม่เกิน 50 MB");
  const type = sniffImageType(bytes);
  if (!type) throw new ApiError(415, "unsupported_type", "รองรับเฉพาะไฟล์ JPG, PNG และ WEBP");

  let output: Uint8Array;
  let ext: "webp" | "png";
  try {
    ({ output, ext } = await reencodeImage(kind, bytes));
  } catch (e) {
    if (e instanceof InvalidImageError) throw new ApiError(415, "invalid_image", "ไม่สามารถอ่านไฟล์รูปภาพได้ หรือไฟล์เสียหาย");
    throw e;
  }

  const contentType = ext === "png" ? "image/png" : "image/webp";
  if (isR2Configured()) {
    const path = `${userId}/r2-${kind}-${crypto.randomUUID()}.${ext}`;
    await putObject(path, output, contentType);
    return { path, bytes: output.byteLength };
  }
  const path = `${userId}/${kind}-${crypto.randomUUID()}.${ext}`;
  const { error } = await getAdminSupabase()
    .storage.from(LANTERN_BUCKET)
    .upload(path, output, { contentType, upsert: false, cacheControl: "3600" });
  if (error) throw new Error(`storage upload failed: ${error.message}`);
  return { path, bytes: output.byteLength };
}

/* ---------------------------------------------------------------- direct (browser → R2) uploads */

/** raw originals live under raw/ so one R2 lifecycle rule ("raw/" → delete after 1 day) cleans abandoned uploads */
const rawKey = (userId: string, kind: AssetKind, id: string) => `raw/${userId}/${kind}-${id}`;
const RAW_RE = /^raw\/([0-9a-f-]{36})\/(image|drawing)-[0-9a-f-]{36}$/;

/** Step 1: a presigned PUT for the original file (≤ 50 MB). The raw object is processed by finishDirectUpload. */
export async function createDirectUpload(userId: string, kind: AssetKind, contentType: string, size: number) {
  const key = rawKey(userId, kind, crypto.randomUUID());
  return { key, uploadUrl: await presignPut(key, contentType, size), headers: { "content-type": contentType } };
}

/** Step 2: validate + re-encode the raw upload, store the final asset, delete the raw original */
export async function finishDirectUpload(userId: string, key: string) {
  const m = RAW_RE.exec(key);
  if (!m || m[1] !== userId) throw new ApiError(403, "asset_forbidden", "ไม่สามารถใช้ไฟล์นี้ได้");
  const bytes = await getObject(key, MAX_SOURCE_IMAGE_BYTES).catch((e: Error) => {
    if (/too large/.test(e.message)) throw new ApiError(413, "file_too_large", "ไฟล์ต้องมีขนาดไม่เกิน 50 MB");
    throw e;
  });
  if (!bytes) throw new ApiError(400, "asset_missing", "ไม่พบไฟล์ที่อัปโหลด กรุณาอัปโหลดใหม่");
  try {
    return await processAndStoreAsset(userId, m[2] as AssetKind, bytes);
  } finally {
    await deleteObjects([key]).catch(() => undefined); // a bucket lifecycle rule on raw/ is the safety net
  }
}

/* ---------------------------------------------------------------- read / delete */

/** Asset must live in the caller's own folder and exist */
export async function assertOwnedAsset(userId: string, path: string | null) {
  if (!path) return;
  if (!path.startsWith(`${userId}/`)) throw new ApiError(403, "asset_forbidden", "ไม่สามารถใช้ไฟล์นี้ได้");
  let exists: boolean;
  if (isR2Path(path)) exists = isR2Configured() && (await headObject(path).catch(() => null)) !== null;
  else {
    const { data, error } = await getAdminSupabase().storage.from(LANTERN_BUCKET).exists(path);
    exists = !error && !!data;
  }
  if (!exists) throw new ApiError(400, "asset_missing", "ไม่พบไฟล์ที่อัปโหลด กรุณาอัปโหลดใหม่");
}

export async function signedUrl(path: string, expiresInSeconds: number) {
  if (isR2Path(path)) return isR2Configured() ? presignGet(path, expiresInSeconds) : null;
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
 * lantern expires (or after MAX_SIGNED_SECONDS, whichever is sooner). R2 URLs are signed locally (no request).
 */
export async function signMany(items: Array<{ path: string; expiresInSeconds: number }>) {
  const result = new Map<string, string>();
  const groups = new Map<number, string[]>();
  const r2: Array<{ path: string; expiresIn: number }> = [];
  for (const it of items) {
    const capped = Math.min(it.expiresInSeconds, MAX_SIGNED_SECONDS);
    const bucket = Math.max(60, Math.ceil(capped / 600) * 600);
    if (isR2Path(it.path)) {
      r2.push({ path: it.path, expiresIn: bucket });
      continue;
    }
    const list = groups.get(bucket) ?? [];
    list.push(it.path);
    groups.set(bucket, list);
  }
  await Promise.all([
    ...(isR2Configured() ? r2.map(async (it) => result.set(it.path, await presignGet(it.path, it.expiresIn))) : []),
    ...[...groups.entries()].map(async ([expiresIn, paths]) => {
      const { data } = await getAdminSupabase().storage.from(LANTERN_BUCKET).createSignedUrls(paths, expiresIn);
      for (const row of data ?? []) if (row.path && row.signedUrl) result.set(row.path, row.signedUrl);
    }),
  ]);
  return result;
}

export async function removeAssets(paths: string[]) {
  if (!paths.length) return;
  const r2 = paths.filter(isR2Path);
  const legacy = paths.filter((p) => !isR2Path(p));
  if (r2.length) {
    if (!isR2Configured()) throw new Error("storage remove failed: R2 is not configured");
    await deleteObjects(r2);
  }
  if (legacy.length) {
    const { error } = await getAdminSupabase().storage.from(LANTERN_BUCKET).remove(legacy);
    if (error) throw new Error(`storage remove failed: ${error.message}`);
  }
}
