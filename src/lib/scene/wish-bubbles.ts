import { wrapText } from "@/lib/lantern/texture";

/**
 * Speech bubbles that float up above other people's lanterns in the festival, showing what they
 * wished for. Each bubble is rendered once into a small sprite (text layout is the costly part),
 * then drawn with drawImage every frame.
 */

const SPRITE_SCALE = 2; // sprites are drawn at up to ~1x CSS size on 2x canvases
const MAX_TEXT_W = 168; // CSS px
const FONT_PX = 13;
const PAD_X = 11;
const PAD_Y = 7;
const TAIL = 7;
const LINE_H = FONT_PX * 1.45;

export interface BubbleSprite {
  canvas: HTMLCanvasElement;
  /** CSS size */
  w: number;
  h: number;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function buildWishBubble(text: string): BubbleSprite | null {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean || typeof document === "undefined") return null;
  const measure = document.createElement("canvas").getContext("2d")!;
  const font = `400 ${FONT_PX}px "Sriracha", "Noto Sans Thai", sans-serif`;
  measure.font = font;
  let lines = wrapText(measure, clean, MAX_TEXT_W);
  if (lines.length > 2) {
    lines = lines.slice(0, 2);
    lines[1] = `${lines[1].replace(/.{0,2}$/u, "")}…`;
  }
  const textW = Math.min(MAX_TEXT_W, Math.max(...lines.map((l) => measure.measureText(l).width)));
  const w = Math.ceil(textW + PAD_X * 2);
  const bodyH = Math.ceil(lines.length * LINE_H + PAD_Y * 2);
  const h = bodyH + TAIL;

  const c = document.createElement("canvas");
  c.width = Math.ceil((w + 4) * SPRITE_SCALE);
  c.height = Math.ceil((h + 4) * SPRITE_SCALE);
  const ctx = c.getContext("2d")!;
  ctx.scale(SPRITE_SCALE, SPRITE_SCALE);
  ctx.translate(2, 2);

  // body + tail
  roundRect(ctx, 0, 0, w, bodyH, 11);
  ctx.moveTo(w / 2 - TAIL, bodyH - 0.5);
  ctx.lineTo(w / 2, bodyH + TAIL);
  ctx.lineTo(w / 2 + TAIL, bodyH - 0.5);
  const fill = ctx.createLinearGradient(0, 0, 0, bodyH);
  fill.addColorStop(0, "rgba(22, 28, 58, 0.9)");
  fill.addColorStop(1, "rgba(10, 14, 32, 0.9)");
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = "rgba(245, 185, 66, 0.6)";
  ctx.lineWidth = 1;
  roundRect(ctx, 0.5, 0.5, w - 1, bodyH - 1, 10.5);
  ctx.stroke();

  ctx.font = font;
  ctx.fillStyle = "#fff1cc";
  ctx.textBaseline = "top";
  lines.forEach((line, i) => {
    const lw = measure.measureText(line).width;
    const x = (w - Math.min(lw, MAX_TEXT_W)) / 2;
    if (lw > MAX_TEXT_W) {
      ctx.save();
      ctx.translate(PAD_X, PAD_Y + i * LINE_H + 1);
      ctx.scale(MAX_TEXT_W / lw, 1);
      ctx.fillText(line, 0, 0);
      ctx.restore();
    } else ctx.fillText(line, x, PAD_Y + i * LINE_H + 1);
  });
  return { canvas: c, w: w + 4, h: h + 4 };
}

/**
 * Bubbles stay visible all the time (owner's request) and just bob gently above their lantern.
 * `rise` is in CSS px; the per-lantern seed keeps neighbours out of sync.
 */
export function bubblePhase(time: number, seed: number): { alpha: number; rise: number } {
  return { alpha: 1, rise: 4 + Math.sin(time * 0.9 + (seed % 997) * 0.731) * 3 };
}
