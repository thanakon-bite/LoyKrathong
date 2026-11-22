import { ALLOWED_UPLOAD_MIME, MAX_UPLOAD_BYTES } from "@/lib/security/image";

export function validateImageFile(file: File): string | null {
  if (!(ALLOWED_UPLOAD_MIME as readonly string[]).includes(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
    return "รองรับเฉพาะไฟล์ JPG, JPEG, PNG และ WEBP";
  }
  if (file.size > MAX_UPLOAD_BYTES) return "ไฟล์ต้องมีขนาดไม่เกิน 5 MB";
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

/** Crops + downsizes + compresses to WEBP before upload (keeps uploads small on mobile) */
export async function cropAndCompress(
  src: string,
  crop: { x: number; y: number; width: number; height: number },
  maxSide = 1200,
  quality = 0.85,
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
