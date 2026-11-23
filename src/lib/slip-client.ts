import { isPaymentQr, parseSlipQr, type SlipQr } from "@/lib/promptpay";

/** EasySlip's image limit is 4 MB – stay a bit below it */
const MAX_SLIP_BYTES = 3_800_000;

export type SlipScan = { kind: "slip"; qr: SlipQr } | { kind: "payment_qr" } | { kind: "none" };

interface Detector {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
}

function barcodeDetector(): Detector | null {
  const BD = (globalThis as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
  try {
    return BD ? new BD({ formats: ["qr_code"] }) : null;
  } catch {
    return null;
  }
}

/** Draws (a region of) the bitmap scaled so its longest side is ≤ maxSide. `crop` is in 0–1 fractions. */
function drawScaled(bitmap: ImageBitmap, maxSide: number, crop = { x: 0, y: 0, w: 1, h: 1 }) {
  const sx = Math.round(bitmap.width * crop.x);
  const sy = Math.round(bitmap.height * crop.y);
  const sw = Math.max(1, Math.round(bitmap.width * crop.w));
  const sh = Math.max(1, Math.round(bitmap.height * crop.h));
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas unavailable");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, w, h);
  return { canvas, ctx, w, h };
}

function classify(values: string[]): SlipScan | null {
  for (const v of values) {
    const qr = parseSlipQr(v);
    if (qr) return { kind: "slip", qr };
  }
  if (values.some(isPaymentQr)) return { kind: "payment_qr" };
  return null;
}

/**
 * Reads the verification QR printed on a bank slip, in the browser (free first-line check – no API call).
 * BarcodeDetector where available (Chrome/Android), jsQR otherwise (iOS Safari).
 */
export async function scanSlip(file: Blob): Promise<SlipScan> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { kind: "none" };
  }
  try {
    const detector = barcodeDetector();
    if (detector) {
      try {
        const found = classify((await detector.detect(bitmap)).map((b) => b.rawValue));
        if (found) return found;
      } catch {
        /* fall through to jsQR */
      }
    }
    const { default: jsQR } = await import("jsqr");
    // slips are clean digital images; the QR is small and usually bottom-right: whole image (large, then
    // small), then the bottom half and the bottom-right quarter at a higher zoom
    const attempts: Array<[number, { x: number; y: number; w: number; h: number }?]> = [
      [1600],
      [900],
      [1400, { x: 0, y: 0.45, w: 1, h: 0.55 }],
      [1000, { x: 0.4, y: 0.5, w: 0.6, h: 0.5 }],
    ];
    for (const [side, crop] of attempts) {
      const { ctx, w, h } = drawScaled(bitmap, side, crop);
      const img = ctx.getImageData(0, 0, w, h);
      const res = jsQR(img.data, w, h, { inversionAttempts: "attemptBoth" });
      const found = res ? classify([res.data]) : null;
      if (found) return found;
    }
    return { kind: "none" };
  } finally {
    bitmap.close();
  }
}

/** Keeps JPG/PNG/WEBP slips ≤ 4 MB (re-encodes large photos / other formats to JPEG) */
export async function prepareSlipFile(file: File): Promise<Blob> {
  const okType = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
  if (okType && file.size <= MAX_SLIP_BYTES) return file;
  const bitmap = await createImageBitmap(file);
  try {
    for (const [side, quality] of [
      [2400, 0.92],
      [1800, 0.85],
      [1400, 0.8],
    ] as const) {
      const { canvas } = drawScaled(bitmap, side);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
      if (blob && blob.size <= MAX_SLIP_BYTES) return blob;
    }
  } finally {
    bitmap.close();
  }
  throw new Error("slip too large");
}
