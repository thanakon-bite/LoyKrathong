import type { LanternVisual, TextPosition } from "@/types/lantern";
import { LANTERN_DESIGNS, LANTERN_FONTS } from "./designs";

/** Faces are slightly taller than wide, like the reference lanterns */
export const FACE_ASPECT = 1.1;
export const TEX_W = 512;
export const TEX_H = Math.round(TEX_W * FACE_ASPECT);

export interface FaceTextures {
  front: HTMLCanvasElement;
  side: HTMLCanvasElement;
}

export interface FaceAssets {
  image?: CanvasImageSource | null;
  drawing?: CanvasImageSource | null;
}

function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

const segmenter: Intl.Segmenter | null =
  typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter("th", { granularity: "word" }) : null;
const graphemes: Intl.Segmenter | null =
  typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter("th", { granularity: "grapheme" }) : null;

function splitWords(text: string): string[] {
  if (segmenter) return Array.from(segmenter.segment(text), (s) => s.segment);
  return text.split(/(\s+)/);
}

function splitGraphemes(text: string): string[] {
  if (graphemes) return Array.from(graphemes.segment(text), (s) => s.segment);
  return Array.from(text);
}

/** Word-wraps Thai/English text (Thai has no spaces – uses Intl.Segmenter). */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of splitWords(paragraph)) {
      const candidate = line + word;
      if (ctx.measureText(candidate).width <= maxWidth || line === "") {
        if (ctx.measureText(candidate).width > maxWidth) {
          // a single segment wider than the line: break by grapheme
          for (const g of splitGraphemes(word)) {
            if (ctx.measureText(line + g).width > maxWidth && line) {
              lines.push(line);
              line = g;
            } else line += g;
          }
        } else line = candidate;
      } else {
        lines.push(line.trimEnd());
        line = word.trimStart();
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

function fontString(fontId: keyof typeof LANTERN_FONTS, px: number) {
  const f = LANTERN_FONTS[fontId];
  return `${f.weight} ${Math.round(px)}px "${f.family}", "Noto Sans Thai", sans-serif`;
}

/** Layout text block that fits inside a box, shrinking the font if needed. */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontId: keyof typeof LANTERN_FONTS,
  basePx: number,
  maxW: number,
  maxH: number,
) {
  let px = basePx;
  let lines: string[] = [];
  for (let i = 0; i < 12; i++) {
    ctx.font = fontString(fontId, px);
    lines = wrapText(ctx, text, maxW);
    if (lines.length * px * 1.35 <= maxH) break;
    px *= 0.9;
  }
  const maxLines = Math.max(1, Math.floor(maxH / (px * 1.35)));
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,2}$/u, "…");
  }
  return { px, lines };
}

function drawThaiFrame(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save();
  ctx.strokeStyle = "rgba(160, 105, 20, 0.85)";
  ctx.lineWidth = 6;
  ctx.strokeRect(18, 18, w - 36, h - 36);
  ctx.lineWidth = 2;
  ctx.strokeRect(30, 30, w - 60, h - 60);
  ctx.fillStyle = "rgba(170, 112, 18, 0.9)";
  const step = 34;
  const diamond = (x: number, y: number, s: number) => {
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s, y);
    ctx.lineTo(x, y + s);
    ctx.lineTo(x - s, y);
    ctx.closePath();
    ctx.fill();
  };
  for (let x = 30 + step / 2; x < w - 30; x += step) {
    diamond(x, 24, 5);
    diamond(x, h - 24, 5);
  }
  for (let y = 30 + step / 2; y < h - 30; y += step) {
    diamond(24, y, 5);
    diamond(w - 24, y, 5);
  }
  // corner "kanok" flourishes
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(160, 105, 20, 0.9)";
  for (const [cx, cy, sx, sy] of [
    [30, 30, 1, 1],
    [w - 30, 30, -1, 1],
    [30, h - 30, 1, -1],
    [w - 30, h - 30, -1, -1],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + sy * 40);
    ctx.quadraticCurveTo(cx + sx * 6, cy + sy * 6, cx + sx * 40, cy);
    ctx.moveTo(cx + sx * 10, cy + sy * 30);
    ctx.quadraticCurveTo(cx + sx * 22, cy + sy * 22, cx + sx * 30, cy + sy * 10);
    ctx.stroke();
  }
  ctx.restore();
}

function drawLotus(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  for (let i = -2; i <= 2; i++) {
    ctx.save();
    ctx.rotate(i * 0.38);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(s * 0.32, -s * 0.55, 0, -s);
    ctx.quadraticCurveTo(-s * 0.32, -s * 0.55, 0, 0);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function drawPattern(ctx: CanvasRenderingContext2D, pattern: "none" | "lotus" | "stars", w: number, h: number) {
  if (pattern === "lotus") {
    drawLotus(ctx, w * 0.14, h * 0.95, 70, "rgba(176, 110, 20, 0.28)");
    drawLotus(ctx, w * 0.86, h * 0.95, 70, "rgba(176, 110, 20, 0.28)");
    drawLotus(ctx, w * 0.5, h * 0.985, 46, "rgba(176, 110, 20, 0.22)");
  } else if (pattern === "stars") {
    ctx.fillStyle = "rgba(255, 236, 170, 0.55)";
    const pts = [
      [0.12, 0.1], [0.3, 0.06], [0.82, 0.12], [0.9, 0.3], [0.08, 0.42], [0.92, 0.66], [0.15, 0.85], [0.7, 0.92], [0.5, 0.05],
    ];
    for (const [px, py] of pts) {
      const x = px * w;
      const y = py * h;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const r = i % 2 === 0 ? 9 : 3;
        const a = (i * Math.PI) / 4;
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function sourceSize(src: CanvasImageSource): [number, number] {
  if (src instanceof HTMLImageElement) return [src.naturalWidth || src.width, src.naturalHeight || src.height];
  if (src instanceof HTMLCanvasElement) return [src.width, src.height];
  if (typeof ImageBitmap !== "undefined" && src instanceof ImageBitmap) return [src.width, src.height];
  return [1, 1];
}

/** Places an image rectangle on the front face (used by both texture and editor hit-testing). */
export function imageRect(cfg: { x: number; y: number; scale: number }, src: CanvasImageSource, w: number, h: number) {
  const [iw, ih] = sourceSize(src);
  const dw = w * cfg.scale;
  const dh = dw * (ih / Math.max(1, iw));
  const cx = w / 2 + cfg.x * w;
  const cy = h / 2 + cfg.y * h;
  return { x: cx - dw / 2, y: cy - dh / 2, w: dw, h: dh };
}

function textBox(position: TextPosition, w: number, h: number) {
  const marginX = w * 0.11;
  const usableW = w - marginX * 2;
  switch (position) {
    case "top":
      return { x: w / 2, top: h * 0.1, height: h * 0.36, width: usableW };
    case "bottom":
      return { x: w / 2, top: h * 0.5, height: h * 0.36, width: usableW };
    default:
      return { x: w / 2, top: h * 0.26, height: h * 0.48, width: usableW };
  }
}

/** Renders the ink layer (everything printed on the paper) for the front and side faces. */
export function buildFaceTextures(
  visual: LanternVisual,
  assets: FaceAssets,
  options: { target?: FaceTextures | null; resolution?: number } = {},
): FaceTextures {
  const w = TEX_W;
  const h = TEX_H;
  const res = options.resolution ?? 1;
  const pw = Math.round(w * res);
  const ph = Math.round(h * res);
  const front = options.target?.front ?? makeCanvas(pw, ph);
  const side = options.target?.side ?? makeCanvas(pw, ph);
  for (const c of [front, side]) {
    if (c.width !== pw || c.height !== ph) {
      c.width = pw;
      c.height = ph;
    }
  }
  const design = LANTERN_DESIGNS[visual.design];
  const tc = visual.textConfig;

  // ---------- FRONT ----------
  let ctx = front.getContext("2d")!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, pw, ph);
  ctx.setTransform(res, 0, 0, res, 0, 0);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  drawPattern(ctx, design.pattern, w, h);
  const thaiFrame = visual.effects?.includes("thai-frame");
  if (thaiFrame) drawThaiFrame(ctx, w, h);

  if (assets.image && visual.imageConfig) {
    const r = imageRect(visual.imageConfig, assets.image, w, h);
    ctx.save();
    roundRectPath(ctx, r.x, r.y, r.w, r.h, 10);
    ctx.clip();
    ctx.globalAlpha = 0.93;
    ctx.drawImage(assets.image, r.x, r.y, r.w, r.h);
    ctx.restore();
    ctx.save();
    roundRectPath(ctx, r.x, r.y, r.w, r.h, 10);
    ctx.strokeStyle = "rgba(90, 50, 15, 0.35)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }

  if (assets.drawing) ctx.drawImage(assets.drawing, 0, 0, w, h);

  if (visual.wishMessage) {
    const box = textBox(tc.position, w, h);
    const { px, lines } = fitText(ctx, visual.wishMessage, tc.font, 46 * tc.size, box.width, box.height);
    ctx.font = fontString(tc.font, px);
    ctx.fillStyle = tc.color;
    const blockH = lines.length * px * 1.35;
    const startY = box.top + (box.height - blockH) / 2;
    lines.forEach((line, i) => ctx.fillText(line, box.x, startY + i * px * 1.35));
  }

  if (visual.displayName) {
    ctx.font = fontString(tc.font, 26 * Math.min(1.2, tc.size));
    ctx.fillStyle = tc.color;
    ctx.globalAlpha = 0.85;
    ctx.textAlign = "right";
    const nameY = tc.position === "bottom" ? h * 0.07 : h * 0.88;
    ctx.fillText(`— ${visual.displayName}`, w * 0.88, nameY);
    ctx.globalAlpha = 1;
    ctx.textAlign = "center";
  }

  // ---------- SIDE ----------
  ctx = side.getContext("2d")!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, pw, ph);
  ctx.setTransform(res, 0, 0, res, 0, 0);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  drawPattern(ctx, design.pattern, w, h);
  if (thaiFrame) drawThaiFrame(ctx, w, h);

  const sideTop = h * 0.1;
  let sideBottom = h * 0.9;
  if (visual.extraMessage) {
    const { px, lines } = fitText(ctx, visual.extraMessage, tc.font, 30 * tc.size, w * 0.76, h * 0.2);
    ctx.font = fontString(tc.font, px);
    ctx.fillStyle = tc.color;
    ctx.textAlign = "center";
    const blockH = lines.length * px * 1.35;
    lines.forEach((line, i) => ctx.fillText(line, w / 2, h * 0.88 - blockH + i * px * 1.35));
    sideBottom = h * 0.88 - blockH - 16;
    ctx.textAlign = "left";
  }
  if (visual.blessingMessage) {
    const { px, lines } = fitText(ctx, visual.blessingMessage, tc.font, 34 * tc.size, w * 0.74, sideBottom - sideTop);
    ctx.font = fontString(tc.font, px);
    ctx.fillStyle = tc.color;
    lines.forEach((line, i) => {
      const y = sideTop + i * px * 1.45;
      // small heart bullet like hand-written lanterns
      ctx.save();
      ctx.fillStyle = "rgba(180, 35, 44, 0.75)";
      const hx = w * 0.1;
      const hy = y + px * 0.55;
      const s = px * 0.16;
      ctx.beginPath();
      ctx.moveTo(hx, hy + s);
      ctx.bezierCurveTo(hx - s * 2, hy - s * 0.5, hx - s * 0.6, hy - s * 2, hx, hy - s * 0.6);
      ctx.bezierCurveTo(hx + s * 0.6, hy - s * 2, hx + s * 2, hy - s * 0.5, hx, hy + s);
      ctx.fill();
      ctx.restore();
      ctx.fillText(line, w * 0.15, y);
    });
  }

  // version stamp lets the renderer know its baked copy is stale (canvases are pooled & reused)
  for (const c of [front, side] as Array<HTMLCanvasElement & { __v?: number }>) c.__v = (c.__v ?? 0) + 1;
  return { front, side };
}

/** Make sure the web fonts are ready before rasterising text onto a canvas. */
export async function ensureLanternFonts(fontIds: Iterable<keyof typeof LANTERN_FONTS>) {
  if (typeof document === "undefined" || !document.fonts) return;
  const loads: Promise<unknown>[] = [];
  for (const id of new Set(fontIds)) {
    const f = LANTERN_FONTS[id];
    loads.push(document.fonts.load(`${f.weight} 32px "${f.family}"`, "กขค abc"));
  }
  try {
    await Promise.all(loads);
  } catch {
    // fall back to system fonts
  }
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();

/** Loads (and caches) an image for canvas use. Works with signed URLs, data: and blob: URLs. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached) return cached;
  const p = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => {
      imageCache.delete(src);
      reject(new Error("image load failed"));
    };
    img.src = src;
  });
  if (imageCache.size > 300) imageCache.clear();
  imageCache.set(src, p);
  return p;
}

export type FaceContentHit = "image" | "drawing" | "message";

const drawingAlpha = new WeakMap<object, { data: Uint8ClampedArray } | null>();

/** Alpha of the drawing layer around (u, v) in texture space – null when pixels cannot be read */
function drawingInkNear(drawing: CanvasImageSource, u: number, v: number): boolean | null {
  let cached = drawingAlpha.get(drawing as object);
  if (cached === undefined) {
    try {
      const c = makeCanvas(TEX_W / 4, Math.round(TEX_H / 4));
      const g = c.getContext("2d", { willReadFrequently: true })!;
      g.drawImage(drawing, 0, 0, c.width, c.height);
      cached = { data: g.getImageData(0, 0, c.width, c.height).data };
    } catch {
      cached = null; // tainted canvas (no CORS) – caller falls back to a coarse guess
    }
    drawingAlpha.set(drawing as object, cached);
  }
  if (!cached) return null;
  const cw = TEX_W / 4;
  const ch = Math.round(TEX_H / 4);
  const cx = Math.round(u / 4);
  const cy = Math.round(v / 4);
  const r = 5; // ≈ 20 texture px – fingers are not precise
  for (let y = Math.max(0, cy - r); y <= Math.min(ch - 1, cy + r); y++)
    for (let x = Math.max(0, cx - r); x <= Math.min(cw - 1, cx + r); x++) if (cached.data[(y * cw + x) * 4 + 3] > 40) return true;
  return false;
}

/** What the visitor tapped on a paper wall: the photo, the hand-drawn sticker or the written text */
export function hitFaceContent(
  visual: LanternVisual,
  assets: FaceAssets,
  face: "front" | "right" | "back" | "left",
  u: number,
  v: number,
): FaceContentHit | null {
  const hasText = !!(visual.wishMessage || visual.blessingMessage || visual.extraMessage);
  if (face !== "front") return hasText ? "message" : null;
  if (assets.drawing && drawingInkNear(assets.drawing, u, v)) return "drawing";
  if (assets.image && visual.imageConfig) {
    const r = imageRect(visual.imageConfig, assets.image, TEX_W, TEX_H);
    if (u >= r.x && u <= r.x + r.w && v >= r.y && v <= r.y + r.h) return "image";
  }
  if (visual.wishMessage) {
    const box = textBox(visual.textConfig.position, TEX_W, TEX_H);
    if (v >= box.top && v <= box.top + box.height && Math.abs(u - box.x) <= box.width / 2) return "message";
  }
  // unreadable drawing pixels → any tap that is not on the photo / text opens the sticker
  if (assets.drawing && drawingInkNear(assets.drawing, u, v) === null) return "drawing";
  return hasText ? "message" : null;
}
