/** Detects the real image type from magic bytes (never trust file extension / mime from client). */
export type SniffedImage = "jpeg" | "png" | "webp" | null;

export function sniffImageType(bytes: Uint8Array): SniffedImage {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  )
    return "png";
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  )
    return "webp";
  return null;
}

export const ALLOWED_UPLOAD_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
/** Largest photo a visitor may pick (it is cropped + compressed in the browser before upload) */
export const MAX_SOURCE_IMAGE_BYTES = 50 * 1024 * 1024;
/**
 * Largest file the upload API accepts. Uploads are the browser-compressed result (≤ 1200 px WEBP,
 * usually < 1 MB); serverless request bodies are capped around 6 MB on Netlify, so keep this below that.
 */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
