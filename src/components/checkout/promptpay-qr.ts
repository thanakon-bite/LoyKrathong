import qrcode from "qrcode-generator";
import { dataUrlToBlob } from "@/lib/image-client";

/**
 * Renders a PromptPay payload to PNG data URLs (browser only):
 *  - `qr`: just the code (shown on screen; long-press to save on iOS)
 *  - `card`: the code with the amount underneath – what "บันทึก QR" saves, so the photo in the
 *    gallery still says how much to pay
 */
export function renderPromptPayQr(payload: string, opts: { amountLabel: string; receiver?: string | null }) {
  const qr = qrcode(0, "M");
  qr.addData(payload, "Byte");
  qr.make();
  const modules = qr.getModuleCount();
  const cell = 10;
  const quiet = 4 * cell;
  const size = modules * cell + quiet * 2;

  const draw = (ctx: CanvasRenderingContext2D, x0: number, y0: number) => {
    ctx.fillStyle = "#fff";
    ctx.fillRect(x0, y0, size, size);
    ctx.fillStyle = "#000";
    for (let r = 0; r < modules; r++) for (let c = 0; c < modules; c++) if (qr.isDark(r, c)) ctx.fillRect(x0 + quiet + c * cell, y0 + quiet + r * cell, cell, cell);
  };

  const plain = document.createElement("canvas");
  plain.width = plain.height = size;
  draw(plain.getContext("2d")!, 0, 0);

  const pad = 40;
  const header = 90;
  const footer = opts.receiver ? 170 : 120;
  const card = document.createElement("canvas");
  card.width = size + pad * 2;
  card.height = size + header + footer;
  const ctx = card.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, card.width, card.height);
  ctx.fillStyle = "#0e3a66";
  ctx.fillRect(0, 0, card.width, 70);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 34px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.fillText("THAI QR PAYMENT · PromptPay", card.width / 2, 36);
  draw(ctx, pad, header);
  ctx.fillStyle = "#111";
  ctx.font = "bold 56px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.fillText(opts.amountLabel, card.width / 2, header + size + 50);
  if (opts.receiver) {
    ctx.fillStyle = "#555";
    ctx.font = "32px system-ui, -apple-system, 'Segoe UI', sans-serif";
    ctx.fillText(opts.receiver, card.width / 2, header + size + 115);
  }
  return { qr: plain.toDataURL("image/png"), card: card.toDataURL("image/png") };
}

/** Saves the QR image: share sheet on phones (→ "บันทึกรูปภาพ" puts it in Photos), download elsewhere */
export async function saveQrImage(dataUrl: string, fileName: string) {
  try {
    const blob = await dataUrlToBlob(dataUrl); // not fetch(): CSP connect-src blocks data: URLs
    const file = new File([blob], fileName, { type: "image/png" });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    const touch = navigator.maxTouchPoints > 0;
    if (touch && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file] });
      return "shared" as const;
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") return "cancelled" as const;
    /* fall back to a download */
  }
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return "downloaded" as const;
}
