import { ALLOWED_UPLOAD_MIME, MAX_SOURCE_IMAGE_BYTES } from "@/lib/security/image";

export function validateImageFile(file: File): string | null {
  if (!(ALLOWED_UPLOAD_MIME as readonly string[]).includes(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
    return "รองรับเฉพาะไฟล์ JPG, JPEG, PNG และ WEBP";
  }
  if (file.size > MAX_SOURCE_IMAGE_BYTES) return "ไฟล์ต้องมีขนาดไม่เกิน 50 MB";
  if (file.size === 0) return "ไฟล์ว่างเปล่า";
  return null;
}

export function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("อ่านไฟล์ไม่สำเร็จ"));
    r.readAsDataURL(file);
  });
}

function loadImg(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("ไม่สามารถเปิดรูปภาพนี้ได้"));
    img.src = src;
  });
}

/** Longest side kept for the crop editor – huge camera photos are scaled down first so phones stay responsive */
const SOURCE_MAX_SIDE = 4096;

/**
 * Opens a picked photo (up to 50 MB) for the crop editor as a blob: URL.
 * Very large photos are scaled down to SOURCE_MAX_SIDE first (decoding a 50 MP image inside the
 * cropper would exhaust memory on phones). The caller must URL.revokeObjectURL() the result.
 */
export async function prepareImageSource(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  let img: HTMLImageElement;
  try {
    img = await loadImg(url);
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
  const side = Math.max(img.naturalWidth, img.naturalHeight);
  if (side <= SOURCE_MAX_SIDE && file.size <= 12 * 1024 * 1024) return url;
  try {
    const scale = Math.min(1, SOURCE_MAX_SIDE / side);
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * scale));
    c.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) return url; // canvas too large for this device – let the cropper try the original
    URL.revokeObjectURL(url);
    return URL.createObjectURL(blob);
  } catch {
    return url;
  }
}

/** Crops + downsizes + compresses to WEBP before upload (keeps uploads small on mobile) */
export async function cropAndCompress(
  src: string,
  crop: { x: number; y: number; width: number; height: number },
  maxSide = 1600,
  quality = 0.86,
): Promise<string> {
  const img = await loadImg(src);
  const scale = Math.min(1, maxSide / Math.max(crop.width, crop.height));
  const w = Math.max(1, Math.round(crop.width * scale));
  const h = Math.max(1, Math.round(crop.height * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, w, h);
  const webp = c.toDataURL("image/webp", quality);
  return webp.startsWith("data:image/webp") ? webp : c.toDataURL("image/jpeg", quality);
}

/**
 * Decodes a data: URL into a Blob without fetch() – fetching data: URLs is blocked by
 * the Content-Security-Policy (connect-src), and decoding locally is faster anyway.
 */
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error("รูปแบบไฟล์รูปไม่ถูกต้อง");
  const mime = match[1] || "application/octet-stream";
  const payload = match[3];
  if (!match[2]) return new Blob([decodeURIComponent(payload)], { type: mime });
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
