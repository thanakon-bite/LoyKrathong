import { EXTRA_FACE_IDS, facesForShape, type ExtraFaceId, type FaceArt, type ImageConfig, type LanternDesignId, type LanternFaceId, type LanternVisual, type PhotoFrame, type TextPosition } from "@/types/lantern";
import { mixHex, rgba, seededRandom } from "@/lib/utils";
import { LANTERN_DESIGNS, LANTERN_FONTS, type LanternPattern } from "./designs";

/** Faces are slightly taller than wide, like the reference lanterns */
export const FACE_ASPECT = 1.1;
export const TEX_W = 512;
export const TEX_H = Math.round(TEX_W * FACE_ASPECT);

export interface FaceTextures {
  front: HTMLCanvasElement;
  /** blessing / extra text – every side wall without art of its own */
  side: HTMLCanvasElement;
  /** walls with their own photo / drawing (see artFaces) */
  faces?: Partial<Record<ExtraFaceId, HTMLCanvasElement>>;
}

export interface FaceAssets {
  /** front photo / drawing */
  image?: CanvasImageSource | null;
  drawing?: CanvasImageSource | null;
  /** already loaded art of the other walls – left out, it comes from (or is fetched into) the image cache */
  faces?: Partial<Record<ExtraFaceId, { image?: CanvasImageSource | null; drawing?: CanvasImageSource | null }>>;
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

// ============================================================================
// Paper artwork ("patterns")
// Premium designs get lavish gold-foil ornament; free designs get a quiet hand-made
// paper. Everything is seeded (deterministic) and rendered once per
// (design pattern, face, size) into an offscreen layer that buildFaceTextures reuses.
// Layout rule: dense ornament lives in the border bands and corners, the centre stays
// calm so the wish (front) and blessing (side, top-left) remain readable.
// ============================================================================

type ArtFace = "front" | "side";
type Pt = [number, number];
type Ctx = CanvasRenderingContext2D;

/** Maps a motif's local unit coordinates into texture space: origin, scale, rotation, mirror */
function local(x: number, y: number, s: number, ang = 0, flip = false) {
  const c = Math.cos(ang) * s;
  const n = Math.sin(ang) * s;
  const f = flip ? -1 : 1;
  return (px: number, py: number): Pt => [x + px * f * c - py * n, y + px * f * n + py * c];
}

/** Path builder in a motif's local coordinates */
class Pen {
  readonly path = new Path2D();
  private readonly m: (x: number, y: number) => Pt;
  constructor(m: (x: number, y: number) => Pt) {
    this.m = m;
  }
  M(x: number, y: number) {
    this.path.moveTo(...this.m(x, y));
    return this;
  }
  L(x: number, y: number) {
    this.path.lineTo(...this.m(x, y));
    return this;
  }
  Q(a: number, b: number, x: number, y: number) {
    this.path.quadraticCurveTo(...this.m(a, b), ...this.m(x, y));
    return this;
  }
  C(a: number, b: number, c: number, d: number, x: number, y: number) {
    this.path.bezierCurveTo(...this.m(a, b), ...this.m(c, d), ...this.m(x, y));
    return this;
  }
  Z() {
    this.path.closePath();
    return this;
  }
}

interface Metal {
  stops: readonly string[];
  edge: string;
  shine: string;
  shadow: string;
}

const GOLD: Metal = {
  stops: ["#6b400c", "#a9711d", "#e0ae48", "#fde58f", "#fffbe3", "#f1c95e", "#b27c1f", "#704510"],
  edge: "rgba(72, 36, 4, 0.9)",
  shine: "rgba(255, 251, 222, 0.95)",
  shadow: "rgba(30, 12, 0, 0.55)",
};
/** Brighter, warmer gold for dark grounds (lacquer red, night indigo, peacock teal) */
const BRIGHT_GOLD: Metal = {
  stops: ["#8a5512", "#c98f26", "#f3c859", "#fff0a8", "#fffdf0", "#f8d673", "#d29a2c", "#8f5a14"],
  edge: "rgba(60, 24, 0, 0.85)",
  shine: "rgba(255, 253, 235, 1)",
  shadow: "rgba(0, 0, 0, 0.6)",
};

/** Palindromic metallic stops repeated along a diagonal – one gradient gives every element its own sheen */
function sheen(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, metal: Metal = GOLD, bands = 6) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  const s = metal.stops;
  const cycle = [...s, ...s.slice(1, -1).reverse()];
  const n = cycle.length * bands;
  for (let i = 0; i <= n; i++) g.addColorStop(i / n, cycle[i % cycle.length]);
  return g;
}

function foil(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, metal: Metal = GOLD) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  metal.stops.forEach((c, i) => g.addColorStop(i / (metal.stops.length - 1), c));
  return g;
}

/** Embossed gold leaf: metallic fill + soft drop shadow + top-left bevel highlight + fine dark edge */
function gild(
  ctx: Ctx,
  path: Path2D,
  fill: string | CanvasGradient,
  metal: Metal = GOLD,
  opts: { shadow?: number; edge?: number; bevel?: number } = {},
) {
  ctx.save();
  ctx.fillStyle = fill;
  const blur = opts.shadow ?? 2.5;
  if (blur > 0) {
    ctx.shadowColor = metal.shadow;
    ctx.shadowBlur = blur;
    ctx.shadowOffsetX = blur * 0.35;
    ctx.shadowOffsetY = blur * 0.55;
  }
  ctx.fill(path);
  ctx.restore();
  const bevel = opts.bevel ?? 1.1;
  if (bevel > 0) {
    ctx.save();
    ctx.clip(path);
    ctx.translate(bevel, bevel * 1.2);
    ctx.strokeStyle = metal.shine;
    ctx.lineWidth = bevel * 1.2;
    ctx.globalAlpha = 0.8;
    ctx.stroke(path);
    ctx.restore();
  }
  const edge = opts.edge ?? 0.8;
  if (edge > 0) {
    ctx.strokeStyle = metal.edge;
    ctx.lineWidth = edge;
    ctx.stroke(path);
  }
}

function roundRectInto(p: Path2D, x: number, y: number, w: number, h: number, r: number) {
  p.moveTo(x + r, y);
  p.arcTo(x + w, y, x + w, y + h, r);
  p.arcTo(x + w, y + h, x, y + h, r);
  p.arcTo(x, y + h, x, y, r);
  p.arcTo(x, y, x + w, y, r);
  p.closePath();
}

// ---------- motifs ----------

/** Kanok flame (ลายกนก) – unit height, base at origin, tip curling to the right */
function kanokPath(pen: Pen) {
  // smooth convex back on the left, a slender tip sweeping right, three flame tongues
  // licking up the right edge and a round curled lobe at the base
  return pen
    .M(-0.16, 0.02)
    .C(-0.4, -0.22, -0.36, -0.58, -0.08, -0.8)
    .C(0.06, -0.92, 0.24, -1.0, 0.46, -1.04)
    .C(0.3, -0.94, 0.16, -0.86, 0.1, -0.74)
    .Q(0.22, -0.8, 0.36, -0.82)
    .C(0.24, -0.72, 0.15, -0.64, 0.13, -0.53)
    .Q(0.25, -0.6, 0.4, -0.6)
    .C(0.27, -0.5, 0.18, -0.42, 0.17, -0.32)
    .Q(0.29, -0.38, 0.42, -0.36)
    .C(0.3, -0.28, 0.24, -0.2, 0.25, -0.12)
    .C(0.34, -0.1, 0.38, 0.0, 0.3, 0.06)
    .C(0.18, 0.12, 0.0, 0.1, -0.16, 0.02)
    .Z();
}

function kanok(ctx: Ctx, x: number, y: number, s: number, ang: number, flip: boolean, metal: Metal, fill?: string | CanvasGradient) {
  const m = local(x, y, s, ang, flip);
  const pen = kanokPath(new Pen(m));
  const [ax, ay] = m(-0.4, -1);
  const [bx, by] = m(0.4, 0.1);
  gild(ctx, pen.path, fill ?? foil(ctx, ax, ay, bx, by, metal), metal, { shadow: Math.min(3, s * 0.06), bevel: Math.min(1.2, s * 0.03) });
  if (s < 9) return;
  // engraved inner contour + spiral eye at the base
  const vein = new Pen(m).M(0.16, 0.0).C(-0.16, -0.06, -0.22, -0.46, 0.04, -0.72).Q(0.2, -0.86, 0.36, -0.95);
  ctx.strokeStyle = metal.edge;
  ctx.lineWidth = Math.max(0.6, s * 0.022);
  ctx.stroke(vein.path);
  const [ex, ey] = m(0.17, 0.0);
  ctx.beginPath();
  ctx.arc(ex, ey, s * 0.055, 0, Math.PI * 2);
  ctx.stroke();
}

/** กนกสามตัว – a tall flame with two smaller ones leaning out at its base */
function kanokTrio(ctx: Ctx, x: number, y: number, s: number, ang: number, metal: Metal, fill?: string | CanvasGradient) {
  const [lx, ly] = local(x, y, s, ang)(-0.1, -0.02);
  const [rx, ry] = local(x, y, s, ang)(0.1, -0.02);
  kanok(ctx, lx, ly, s * 0.62, ang - 0.72, true, metal, fill);
  kanok(ctx, rx, ry, s * 0.62, ang + 0.72, false, metal, fill);
  kanok(ctx, x, y, s, ang, false, metal, fill);
}

/** Pointed ogee petal, base at origin, unit length pointing up */
function petalPath(pen: Pen, wd: number) {
  return pen.M(0, 0).C(-wd, -0.18, -wd * 0.85, -0.66, 0, -1).C(wd * 0.85, -0.66, wd, -0.18, 0, 0).Z();
}

/** ประจำยาม – four-petal Thai rosette */
function prajamYam(ctx: Ctx, x: number, y: number, r: number, metal: Metal, fill?: string | CanvasGradient) {
  const f = fill ?? foil(ctx, x - r, y - r, x + r, y + r, metal);
  const small = new Path2D();
  for (let i = 0; i < 4; i++) small.addPath(petalPath(new Pen(local(x, y, r * 0.72, Math.PI / 4 + (i * Math.PI) / 2)), 0.34).path);
  gild(ctx, small, f, metal, { shadow: 2, bevel: 0.8 });
  const big = new Path2D();
  for (let i = 0; i < 4; i++) big.addPath(petalPath(new Pen(local(x, y, r, (i * Math.PI) / 2)), 0.42).path);
  gild(ctx, big, f, metal, { shadow: 2.5 });
  // inner vein of each big petal
  ctx.strokeStyle = metal.edge;
  ctx.lineWidth = Math.max(0.6, r * 0.04);
  for (let i = 0; i < 4; i++) ctx.stroke(petalPath(new Pen(local(x, y, r * 0.62, (i * Math.PI) / 2)), 0.22).path);
  const c = new Path2D();
  c.arc(x, y, r * 0.24, 0, Math.PI * 2);
  gild(ctx, c, foil(ctx, x - r * 0.3, y - r * 0.3, x + r * 0.3, y + r * 0.3, metal), metal, { shadow: 2 });
  const d = new Path2D();
  d.arc(x, y, r * 0.1, 0, Math.PI * 2);
  ctx.fillStyle = metal.edge;
  ctx.fill(d);
}

/** Four-point glint with a soft halo */
function glint(ctx: Ctx, x: number, y: number, r: number, color = "255, 249, 225", alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 1.5);
  halo.addColorStop(0, `rgba(${color}, 0.55)`);
  halo.addColorStop(1, `rgba(${color}, 0)`);
  ctx.fillStyle = halo;
  ctx.fillRect(x - r * 1.5, y - r * 1.5, r * 3, r * 3);
  ctx.fillStyle = `rgba(${color}, 1)`;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r * 0.7, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r * 0.7, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
  ctx.restore();
}

/** Raised gold molding along a path (dark under-line, metallic body, bright crest) */
function molding(ctx: Ctx, path: Path2D, width: number, fill: CanvasGradient, metal: Metal) {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.strokeStyle = metal.shadow;
  ctx.lineWidth = width + 2;
  ctx.stroke(path);
  ctx.strokeStyle = fill;
  ctx.lineWidth = width;
  ctx.stroke(path);
  ctx.strokeStyle = metal.shine;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = Math.max(0.6, width * 0.22);
  ctx.stroke(path);
  ctx.restore();
}

interface FrameSpec {
  inset: number;
  top: number;
  bottom: number;
  r: number;
  ground: readonly string[];
  alpha: number;
}

function panelPath(w: number, h: number, f: FrameSpec, grow = 0) {
  const p = new Path2D();
  roundRectInto(p, f.inset - grow, f.top - grow, w - 2 * (f.inset - grow), h - f.top - f.bottom + 2 * grow, Math.max(0, f.r + grow));
  return p;
}

/** Coloured border band around a calm panel, finished with gold mouldings and a bead chain */
function drawFrame(ctx: Ctx, w: number, h: number, f: FrameSpec, metal: Metal) {
  const band = new Path2D();
  band.rect(0, 0, w, h);
  band.addPath(panelPath(w, h, f));
  const g = ctx.createLinearGradient(0, 0, 0, h);
  f.ground.forEach((c, i) => g.addColorStop(i / (f.ground.length - 1), c));
  ctx.save();
  ctx.globalAlpha = f.alpha;
  ctx.fillStyle = g;
  ctx.fill(band, "evenodd");
  ctx.restore();
  // soft shadow the band casts onto the panel
  ctx.save();
  ctx.clip(panelPath(w, h, f));
  ctx.shadowColor = "rgba(20, 8, 0, 0.45)";
  ctx.shadowBlur = 10;
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(20, 8, 0, 0.35)";
  ctx.stroke(panelPath(w, h, f, 3));
  ctx.restore();

  const s = sheen(ctx, 0, 0, w * 0.7, h, metal, 7);
  const outer = new Path2D();
  roundRectInto(outer, 5, 5, w - 10, h - 10, 4);
  molding(ctx, outer, 2.6, s, metal);
  molding(ctx, panelPath(w, h, f, 2), 4.2, s, metal);
  ctx.save();
  ctx.globalAlpha = 0.75;
  ctx.strokeStyle = s;
  ctx.lineWidth = 1.1;
  ctx.stroke(panelPath(w, h, f, -5));
  ctx.restore();
}

/** Bead chain (ลูกประคำ) along a straight line */
function beads(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, step: number, r: number, fill: CanvasGradient, metal: Metal) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.round(len / step));
  const p = new Path2D();
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    const y = y0 + ((y1 - y0) * i) / n;
    p.moveTo(x + r, y);
    p.arc(x, y, r, 0, Math.PI * 2);
  }
  gild(ctx, p, fill, metal, { shadow: 1.2, bevel: 0.5, edge: 0.5 });
}

/** Wavy vine with kanok leaves alternating left / right (ลายก้านต่อดอก), running from (x, y0) to (x, y1) */
function kanokVine(ctx: Ctx, x: number, y0: number, y1: number, amp: number, period: number, leaf: number, metal: Metal, fill: CanvasGradient) {
  const stem = new Path2D();
  const dir = Math.sign(y1 - y0) || 1;
  const len = Math.abs(y1 - y0);
  for (let t = 0; t <= len; t += 2) {
    const yy = y0 + dir * t;
    const xx = x + Math.sin((t / period) * Math.PI * 2) * amp;
    if (t === 0) stem.moveTo(xx, yy);
    else stem.lineTo(xx, yy);
  }
  const tendrils = new Path2D();
  const dots = new Path2D();
  const crests: Array<[number, number, number]> = [];
  for (let t = period * 0.25, i = 0; t < len - leaf * 0.4; t += period * 0.5, i++) {
    const yy = y0 + dir * t;
    const side = i % 2 === 0 ? 1 : -1;
    const xx = x + side * amp;
    crests.push([xx, yy, side]);
    // a spiral tendril (ก้านขด) curls from each crest into the opposite bay of the wave
    const cx = x - side * amp * 0.35;
    const cy = yy + dir * period * 0.2;
    const r0 = Math.hypot(xx - cx, yy - cy);
    const a0 = Math.atan2(yy - cy, xx - cx);
    const turn = -side * dir;
    tendrils.moveTo(xx, yy);
    for (let k = 1; k <= 40; k++) {
      const u = k / 40;
      const r = r0 * (1 - u * 0.82);
      const a = a0 + turn * u * Math.PI * 2.1;
      tendrils.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    const ae = a0 + turn * Math.PI * 2.1;
    const ex = cx + Math.cos(ae) * r0 * 0.18;
    const ey = cy + Math.sin(ae) * r0 * 0.18;
    dots.moveTo(ex + 1.8, ey);
    dots.arc(ex, ey, 1.8, 0, Math.PI * 2);
  }
  ctx.save();
  ctx.lineCap = "round";
  molding(ctx, tendrils, 1.3, fill, metal);
  ctx.restore();
  molding(ctx, stem, 2.2, fill, metal);
  gild(ctx, dots, fill, metal, { shadow: 1, bevel: 0, edge: 0.5 });
  // flame leaves spring from each crest, leaning back against the flow and out to the side
  for (const [xx, yy, side] of crests) kanok(ctx, xx, yy, leaf, side * 0.75 + (dir > 0 ? 0 : Math.PI), dir > 0 ? side < 0 : side > 0, metal, fill);
}

// ---------- lotus ----------

const LOTUS_PETAL = {
  back: ["#a8661a", "#f0b96a", "#e5728a"],
  mid: ["#c07f22", "#f9d690", "#ec8a9c"],
  front: ["#cf8f28", "#ffeec0", "#f39fab"],
};

function lotusPetal(ctx: Ctx, x: number, y: number, len: number, wd: number, ang: number, tones: readonly string[]) {
  const m = local(x, y, len, ang);
  const pen = petalPath(new Pen(m), wd);
  const [ax, ay] = m(0, 0);
  const [bx, by] = m(0, -1);
  const g = ctx.createLinearGradient(ax, ay, bx, by);
  g.addColorStop(0, tones[0]);
  g.addColorStop(0.55, tones[1]);
  g.addColorStop(1, tones[2]);
  gild(ctx, pen.path, g, GOLD, { shadow: 2.2, bevel: 0.9, edge: 0.9 });
  ctx.save();
  ctx.strokeStyle = "rgba(150, 90, 20, 0.55)";
  ctx.lineWidth = 0.8;
  ctx.stroke(new Pen(m).M(0, -0.1).Q(-wd * 0.15, -0.5, 0, -0.86).path);
  ctx.restore();
}

/** Side-view lotus in full bloom: three layers of gilded, blush-tipped petals */
function lotusBloom(ctx: Ctx, x: number, y: number, s: number) {
  // sepals
  for (const a of [-1, 1]) {
    const m = local(x, y + s * 0.02, s * 0.36, a * 2.05);
    gild(ctx, petalPath(new Pen(m), 0.4).path, foil(ctx, ...m(-0.4, 0), ...m(0.4, -1), GOLD), GOLD, { shadow: 1.5 });
  }
  const layers = [
    { n: 7, spread: 1.32, len: 0.92, wd: 0.32, tones: LOTUS_PETAL.back },
    { n: 5, spread: 0.92, len: 0.96, wd: 0.36, tones: LOTUS_PETAL.mid },
    { n: 3, spread: 0.4, len: 0.84, wd: 0.42, tones: LOTUS_PETAL.front },
  ];
  for (const l of layers) {
    // outermost first so the centre petal sits on top
    const order = Array.from({ length: l.n }, (_, i) => i).sort((a, b) => Math.abs(b - (l.n - 1) / 2) - Math.abs(a - (l.n - 1) / 2));
    for (const i of order) {
      const a = -l.spread + (2 * l.spread * i) / (l.n - 1);
      lotusPetal(ctx, x, y, s * l.len * (1 - Math.abs(a) * 0.12), l.wd, a, l.tones);
    }
  }
  // glowing heart of the flower
  glint(ctx, x, y - s * 0.55, s * 0.14, "255, 246, 210", 0.7);
}

function lotusBud(ctx: Ctx, x: number, y: number, s: number, ang: number) {
  lotusPetal(ctx, x, y, s * 0.85, 0.34, ang - 0.32, LOTUS_PETAL.back);
  lotusPetal(ctx, x, y, s * 0.85, 0.34, ang + 0.32, LOTUS_PETAL.back);
  lotusPetal(ctx, x, y, s, 0.44, ang, LOTUS_PETAL.front);
}

function stem(ctx: Ctx, pts: readonly Pt[], width: number, color: string) {
  const p = new Path2D();
  p.moveTo(pts[0][0], pts[0][1]);
  if (pts.length === 3) p.quadraticCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1]);
  else p.bezierCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1], pts[3][0], pts[3][1]);
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(60, 30, 0, 0.45)";
  ctx.lineWidth = width + 1.6;
  ctx.stroke(p);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke(p);
  ctx.restore();
}

/** Floating lotus leaf seen at a low angle */
function lotusPad(ctx: Ctx, x: number, y: number, rx: number, flip: boolean) {
  const ry = rx * 0.3;
  const notch = flip ? Math.PI * 0.62 : Math.PI * 0.38;
  const p = new Path2D();
  p.moveTo(x, y);
  p.ellipse(x, y, rx, ry, 0, notch + 0.22, notch - 0.22 + Math.PI * 2);
  p.closePath();
  const g = ctx.createLinearGradient(x - rx, y - ry, x + rx, y + ry);
  g.addColorStop(0, "#8a6a1c");
  g.addColorStop(0.4, "#d8b452");
  g.addColorStop(0.6, "#f4dc8a");
  g.addColorStop(1, "#7d5a12");
  gild(ctx, p, g, GOLD, { shadow: 2, bevel: 0.8 });
  ctx.save();
  ctx.clip(p);
  ctx.strokeStyle = "rgba(90, 55, 8, 0.6)";
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * rx, y + Math.sin(a) * ry);
    ctx.stroke();
  }
  ctx.restore();
}

function ripples(ctx: Ctx, x: number, y: number, r0: number, n: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  for (let i = 0; i < n; i++) {
    const rx = r0 * (1 + i * 0.42);
    ctx.globalAlpha = 0.85 - i * (0.6 / n);
    ctx.lineWidth = 1.4 - i * 0.15;
    for (const [a0, a1] of [
      [Math.PI * 0.02, Math.PI * 0.4],
      [Math.PI * 0.6, Math.PI * 0.98],
    ]) {
      ctx.beginPath();
      ctx.ellipse(x, y, rx, rx * 0.18, 0, a0, a1);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Faint radiating lotus mandala – a watermark behind the text */
function lotusMandala(ctx: Ctx, x: number, y: number, r: number, color: string, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.6;
  const ring = (n: number, rr: number, len: number, wd: number, off: number) => {
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * Math.PI * 2;
      const [px, py] = [x + Math.cos(a - Math.PI / 2) * rr, y + Math.sin(a - Math.PI / 2) * rr];
      ctx.stroke(petalPath(new Pen(local(px, py, len, a)), wd).path);
    }
  };
  ring(24, r * 0.78, r * 0.24, 0.38, 0);
  ring(16, r * 0.5, r * 0.3, 0.42, Math.PI / 16);
  ring(8, r * 0.18, r * 0.34, 0.46, 0);
  for (const rr of [r * 0.18, r * 0.5, r * 0.78, r * 1.04]) {
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * r * 1.1, y + Math.sin(a) * r * 1.1, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** กรวยเชิง – row of triangular kanok points hanging from / rising off a band */
function kruayChoeng(ctx: Ctx, x0: number, x1: number, y: number, size: number, dir: 1 | -1, metal: Metal, fill: CanvasGradient) {
  const n = Math.max(1, Math.round((x1 - x0) / size));
  const step = (x1 - x0) / n;
  const tri = new Path2D();
  const inner = new Path2D();
  for (let i = 0; i < n; i++) {
    const cx = x0 + step * (i + 0.5);
    const hw = step * 0.48;
    const hh = size * 1.05 * dir;
    // flame-edged triangle: concave sides meeting in a curled tip
    tri.moveTo(cx - hw, y);
    tri.quadraticCurveTo(cx - hw * 0.25, y + hh * 0.35, cx - hw * 0.12, y + hh * 0.8);
    tri.quadraticCurveTo(cx - hw * 0.08, y + hh * 0.95, cx, y + hh);
    tri.quadraticCurveTo(cx + hw * 0.08, y + hh * 0.95, cx + hw * 0.12, y + hh * 0.8);
    tri.quadraticCurveTo(cx + hw * 0.25, y + hh * 0.35, cx + hw, y);
    tri.closePath();
    inner.moveTo(cx + 2.4, y + hh * 0.3);
    inner.arc(cx, y + hh * 0.3, 2.4, 0, Math.PI * 2);
  }
  gild(ctx, tri, fill, metal, { shadow: 2, bevel: 0.8 });
  ctx.fillStyle = metal.edge;
  ctx.fill(inner);
}

function drawLotusArt(ctx: Ctx, w: number, h: number, face: ArtFace) {
  const f: FrameSpec = { inset: 32, top: 44, bottom: 44, r: 14, ground: ["#3e1804", "#6e3510", "#7a3c12", "#4a1f05"], alpha: 0.95 };
  // amber veil gathering at the edges of the panel
  const veil = ctx.createRadialGradient(w / 2, h * 0.5, h * 0.25, w / 2, h * 0.5, h * 0.72);
  veil.addColorStop(0, "rgba(190, 110, 20, 0)");
  veil.addColorStop(1, "rgba(170, 90, 10, 0.3)");
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, w, h);
  lotusMandala(ctx, w / 2, face === "front" ? h * 0.5 : h * 0.6, w * 0.34, "#9a5a10", 0.13);
  drawFrame(ctx, w, h, f, GOLD);
  const s = sheen(ctx, 0, 0, w * 0.7, h, BRIGHT_GOLD, 7);
  // bands: rosettes + beads on top, rows of lotus petals (บัวหงาย) on the bottom
  beads(ctx, 40, 13, w - 40, 13, 9, 2, s, GOLD);
  for (let i = 0; i < 7; i++) prajamYam(ctx, 44 + ((w - 88) * i) / 6, 29, 11, BRIGHT_GOLD, s);
  for (let i = 0; i < 6; i++) {
    const x = 44 + ((w - 88) * (i + 0.5)) / 6;
    kanok(ctx, x - 6, 36, 17, -1.25, true, BRIGHT_GOLD, s);
    kanok(ctx, x + 6, 36, 17, 1.25, false, BRIGHT_GOLD, s);
    const dia = new Path2D();
    dia.moveTo(x, 21);
    dia.lineTo(x + 6, 28);
    dia.lineTo(x, 35);
    dia.lineTo(x - 6, 28);
    dia.closePath();
    gild(ctx, dia, s, BRIGHT_GOLD, { shadow: 1.5, bevel: 0.6 });
  }
  const bottomPetals = new Path2D();
  const nb = 22;
  for (let i = 0; i < nb; i++) {
    const x = 14 + ((w - 28) * (i + 0.5)) / nb;
    bottomPetals.addPath(petalPath(new Pen(local(x, h - 8, 30, 0)), 0.42).path);
  }
  gild(ctx, bottomPetals, s, BRIGHT_GOLD, { shadow: 2 });
  // side vines
  kanokVine(ctx, 16, 54, h - 50, 5.5, 58, 16, BRIGHT_GOLD, s);
  kanokVine(ctx, w - 16, h - 50, 54, 5.5, 58, 16, BRIGHT_GOLD, s);
  // gold fringe hanging into the panel
  if (face === "front") {
    kruayChoeng(ctx, f.inset + 10, w - f.inset - 10, f.top + 1, 14, 1, GOLD, s);
    // อุบะ – gilded bead strings with lotus-bud tassels hanging in the top corners
    for (const x of [f.inset + 16, w - f.inset - 16]) {
      beads(ctx, x, f.top + 6, x, f.top + 66, 7, 2, s, BRIGHT_GOLD);
      prajamYam(ctx, x, f.top + 74, 7, BRIGHT_GOLD, s);
      lotusBud(ctx, x, f.top + 78, 30, Math.PI);
      glint(ctx, x, f.top + 74, 5);
    }
  }

  // ---- the lotus pond along the bottom ----
  const water = h - f.bottom + 4;
  ripples(ctx, 70, water, 40, 4, "rgba(150, 95, 20, 1)");
  ripples(ctx, w - 70, water, 40, 4, "rgba(150, 95, 20, 1)");
  ripples(ctx, w / 2, water + 6, 34, 3, "rgba(150, 95, 20, 1)");
  const sides: Array<[number, boolean]> = [
    [1, false],
    [-1, true],
  ];
  for (const [x, r] of [[70, 120], [w - 70, 120], [w / 2, 90]] as const) moonGlow(ctx, x, water - 40, r, "255, 226, 150", 0.55);
  for (const [dir, flip] of sides) {
    const bx = dir > 0 ? 66 : w - 66;
    stem(ctx, [[bx + dir * 6, water], [bx - dir * 26, water - 60], [bx - dir * 14, water - 120]], 2.6, "#b98a2e");
    lotusBud(ctx, bx - dir * 14, water - 118, 34, -dir * 0.18);
    stem(ctx, [[bx + dir * 30, water], [bx + dir * 40, water - 30], [bx + dir * 52, water - 52]], 2.2, "#b98a2e");
    lotusBud(ctx, bx + dir * 52, water - 50, 22, dir * 0.45);
    lotusPad(ctx, bx + dir * 40, water + 2, 34, flip);
    lotusBloom(ctx, bx, water - 4, 82);
  }
  lotusPad(ctx, w / 2 - 44, water + 4, 26, false);
  lotusPad(ctx, w / 2 + 44, water + 4, 26, true);
  lotusBloom(ctx, w / 2, water + 2, 50);
  // gilded corner rosettes
  for (const [x, y] of [
    [f.inset, f.top],
    [w - f.inset, f.top],
  ] as const) {
    prajamYam(ctx, x, y, 17, BRIGHT_GOLD, s);
  }
  // sparkles on the gold
  const rnd = seededRandom(1101);
  for (let i = 0; i < 18; i++) {
    const edge = rnd() < 0.5;
    const x = edge ? (rnd() < 0.5 ? rnd() * 30 : w - rnd() * 30) : 20 + rnd() * (w - 40);
    const y = edge ? 40 + rnd() * (h - 80) : rnd() < 0.5 ? rnd() * 38 : h - rnd() * 38;
    glint(ctx, x, y, 3 + rnd() * 4, "255, 250, 225", 0.9);
  }
}

// ---------- night sky ----------

function arcPasses(start: number, end: number, ccw: boolean, target: number) {
  const tau = Math.PI * 2;
  const mod = (v: number) => ((v % tau) + tau) % tau;
  return ccw ? mod(start - target) < mod(start - end) : mod(target - start) < mod(end - start);
}

/** Crescent = big circle minus an offset circle, built from the two intersection arcs */
function crescentPath(cx: number, cy: number, r: number, ox: number, oy: number, r2: number) {
  const d = Math.hypot(ox, oy);
  const a = (r * r - r2 * r2 + d * d) / (2 * d);
  const hh = Math.sqrt(Math.max(0, r * r - a * a));
  const px = (a * ox) / d;
  const py = (a * oy) / d;
  const i1: Pt = [px - (hh * oy) / d, py + (hh * ox) / d];
  const i2: Pt = [px + (hh * oy) / d, py - (hh * ox) / d];
  const dirIn = Math.atan2(oy, ox);
  const t1 = Math.atan2(i1[1], i1[0]);
  const t2 = Math.atan2(i2[1], i2[0]);
  const ccw1 = arcPasses(t1, t2, false, dirIn);
  const p = new Path2D();
  p.arc(cx, cy, r, t1, t2, ccw1);
  const s1 = Math.atan2(i2[1] - oy, i2[0] - ox);
  const s2 = Math.atan2(i1[1] - oy, i1[0] - ox);
  const toCentre = dirIn + Math.PI;
  p.arc(cx + ox, cy + oy, r2, s1, s2, !arcPasses(s1, s2, false, toCentre));
  p.closePath();
  return p;
}

function moonGlow(ctx: Ctx, x: number, y: number, r: number, color: string, alpha: number) {
  const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
  g.addColorStop(0, `rgba(${color}, ${alpha})`);
  g.addColorStop(0.45, `rgba(${color}, ${alpha * 0.35})`);
  g.addColorStop(1, `rgba(${color}, 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/** Thai cloud scroll (ลายเมฆ) */
function thaiCloud(ctx: Ctx, x: number, y: number, s: number, flip: boolean, metal: Metal, fill: CanvasGradient, rim?: CanvasGradient) {
  const m = local(x, y, s, 0, flip);
  const lobes: Array<[number, number, number]> = [
    [-0.62, 0.02, 0.3],
    [-0.22, -0.2, 0.4],
    [0.25, -0.12, 0.36],
    [0.62, 0.06, 0.24],
  ];
  const p = new Path2D();
  for (const [lx, ly, lr] of lobes) {
    const [cx, cy] = m(lx, ly);
    p.moveTo(cx + lr * s, cy);
    p.arc(cx, cy, lr * s, 0, Math.PI * 2);
  }
  const base = new Pen(m).M(-0.88, 0.14).Q(0, 0.34, 0.86, 0.14).L(0.8, 0.02).L(-0.8, 0.02).Z();
  p.addPath(base.path);
  if (rim) {
    // a wide stroke under the fill leaves only the outer contour as a gold rim
    ctx.save();
    ctx.strokeStyle = rim;
    ctx.lineWidth = 3.2;
    ctx.lineJoin = "round";
    ctx.stroke(p);
    ctx.restore();
  }
  gild(ctx, p, fill, metal, { shadow: rim ? 0 : 2, bevel: rim ? 0 : 0.8, edge: 0 });
  // curls inside each lobe
  ctx.save();
  ctx.strokeStyle = metal.edge;
  ctx.lineWidth = 1;
  for (const [lx, ly, lr] of lobes) {
    const [cx, cy] = m(lx, ly);
    ctx.beginPath();
    for (let t = 0; t < 9; t += 0.25) {
      const rr = lr * s * 0.72 * (1 - t / 10);
      const a = (flip ? -1 : 1) * t + Math.PI;
      const px = cx + Math.cos(a) * rr;
      const py = cy + Math.sin(a) * rr;
      if (t === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function constellation(ctx: Ctx, pts: ReadonlyArray<Pt>, links: ReadonlyArray<[number, number]>, scale: number) {
  ctx.save();
  ctx.strokeStyle = "rgba(176, 124, 36, 0.8)";
  ctx.lineWidth = 1.3;
  ctx.setLineDash([3, 3]);
  for (const [a, b] of links) {
    ctx.beginPath();
    ctx.moveTo(pts[a][0], pts[a][1]);
    ctx.lineTo(pts[b][0], pts[b][1]);
    ctx.stroke();
  }
  ctx.restore();
  pts.forEach(([x, y], i) => {
    glint(ctx, x, y, scale * (i % 3 === 0 ? 1.7 : 1.2), "196, 140, 40", 1);
    glint(ctx, x, y, scale * 0.6, "255, 250, 230", 1);
  });
}

function drawStarsArt(ctx: Ctx, w: number, h: number, face: ArtFace) {
  const f: FrameSpec = { inset: 30, top: 48, bottom: 48, r: 16, ground: ["#050824", "#121a5e", "#1b2778", "#0c1244"], alpha: 0.96 };
  const rnd = seededRandom(face === "front" ? 2203 : 2207);
  // twilight veil fading into the calm centre
  const veil = ctx.createRadialGradient(w / 2, h * 0.52, h * 0.26, w / 2, h * 0.52, h * 0.72);
  veil.addColorStop(0, "rgba(40, 50, 140, 0)");
  veil.addColorStop(1, "rgba(30, 40, 120, 0.42)");
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, w, h);
  // the Milky Way: a soft diagonal river of nebula and star dust
  const mw = (t: number): Pt => (face === "front" ? [w * (0.05 + t * 0.9), h * (0.95 - t * 0.85)] : [w * (0.95 - t * 0.9), h * (0.92 - t * 0.6)]);
  for (let i = 0; i < 9; i++) {
    const [x, y] = mw(i / 8);
    const r = 50 + rnd() * 40;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, i % 3 === 1 ? "rgba(170, 120, 210, 0.16)" : "rgba(110, 130, 230, 0.16)");
    g.addColorStop(1, "rgba(110, 130, 230, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 260; i++) {
    const [x, y] = mw(rnd());
    const spread = (rnd() + rnd() + rnd() - 1.5) * 46;
    ctx.fillStyle = rnd() < 0.6 ? "rgba(255, 255, 255, 0.75)" : "rgba(255, 222, 150, 0.85)";
    ctx.globalAlpha = 0.3 + rnd() * 0.5;
    ctx.beginPath();
    ctx.arc(x + spread * 0.7, y + spread * 0.7, 0.5 + rnd() * rnd() * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // faint stardust inside the panel
  for (let i = 0; i < 70; i++) {
    const x = f.inset + rnd() * (w - 2 * f.inset);
    const y = f.top + rnd() * (h - f.top - f.bottom);
    ctx.fillStyle = `rgba(${rnd() < 0.5 ? "170, 130, 40" : "90, 100, 190"}, ${0.25 + rnd() * 0.3})`;
    ctx.beginPath();
    ctx.arc(x, y, 0.6 + rnd() * 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  // constellations in the corners of the panel
  const sx = face === "front" ? 1 : -1;
  const cx0 = face === "front" ? 46 : w - 46;
  const dipper: Pt[] = [
    [0, 0],
    [22, 14],
    [44, 20],
    [66, 34],
    [70, 62],
    [100, 66],
    [98, 38],
  ].map(([x, y]) => [cx0 + sx * x, h - f.bottom - 150 + y] as Pt);
  constellation(ctx, dipper, [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]], 3.2);
  const cass: Pt[] = [
    [0, 0],
    [16, 18],
    [34, 6],
    [50, 24],
    [68, 10],
  ].map(([x, y]) => [w / 2 - 34 + x, h - f.bottom - 40 + y] as Pt);
  if (face === "front") constellation(ctx, cass.map(([x, y]) => [x - 150, y - 300] as Pt), [[0, 1], [1, 2], [2, 3], [3, 4]], 2.8);
  else constellation(ctx, cass.map(([x, y]) => [x - 120, y - 40] as Pt), [[0, 1], [1, 2], [2, 3], [3, 4]], 2.8);

  drawFrame(ctx, w, h, f, BRIGHT_GOLD);
  const s = sheen(ctx, 0, 0, w * 0.7, h, BRIGHT_GOLD, 7);
  // starfield inside the night border
  const band = new Path2D();
  band.rect(0, 0, w, h);
  band.addPath(panelPath(w, h, f, 4));
  ctx.save();
  ctx.clip(band, "evenodd");
  for (let i = 0; i < 260; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const tone = rnd();
    ctx.fillStyle = tone < 0.55 ? "rgba(255, 255, 255, 0.9)" : tone < 0.85 ? "rgba(255, 224, 150, 0.95)" : "rgba(170, 200, 255, 0.95)";
    ctx.globalAlpha = 0.35 + rnd() * 0.65;
    ctx.beginPath();
    ctx.arc(x, y, 0.45 + rnd() * rnd() * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // shooting star across the top band
  const sg = ctx.createLinearGradient(60, 34, 170, 12);
  sg.addColorStop(0, "rgba(255, 240, 200, 0)");
  sg.addColorStop(1, "rgba(255, 250, 230, 0.95)");
  ctx.strokeStyle = sg;
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(60, 34);
  ctx.lineTo(170, 14);
  ctx.stroke();
  glint(ctx, 170, 14, 6);
  ctx.restore();
  // gold stars set along the bands
  for (let i = 0; i < 9; i++) {
    const x = 56 + ((w - 112) * i) / 8;
    if (face === "front" && x > w - 140) continue;
    const star = new Path2D();
    const r = i % 2 === 0 ? 9 : 5.5;
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const rr = k % 2 === 0 ? r : r * 0.45;
      if (k === 0) star.moveTo(x + Math.cos(a) * rr, 25 + Math.sin(a) * rr);
      else star.lineTo(x + Math.cos(a) * rr, 25 + Math.sin(a) * rr);
    }
    star.closePath();
    gild(ctx, star, s, BRIGHT_GOLD, { shadow: 1.5, bevel: 0.6 });
  }
  beads(ctx, 15, 60, 15, h - 56, 10, 1.6, s, BRIGHT_GOLD);
  beads(ctx, w - 15, 60, w - 15, h - 56, 10, 1.6, s, BRIGHT_GOLD);
  // clouds rolling along the bottom band
  for (let i = 0; i < 5; i++) thaiCloud(ctx, 56 + ((w - 112) * i) / 4, h - 20, 34, i % 2 === 1, BRIGHT_GOLD, s);
  // eight-point compass stars on the corners of the panel
  for (const [x, y] of [
    [f.inset, f.top],
    [w - f.inset, f.top],
    [f.inset, h - f.bottom],
    [w - f.inset, h - f.bottom],
  ] as const) {
    if (face === "front" && x > w / 2 && y < h / 2) continue;
    const star = new Path2D();
    for (let k = 0; k < 16; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 8;
      const rr = k % 4 === 0 ? 17 : k % 2 === 0 ? 10 : 4.5;
      if (k === 0) star.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      else star.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    star.closePath();
    gild(ctx, star, foil(ctx, x - 17, y - 17, x + 17, y + 17, BRIGHT_GOLD), BRIGHT_GOLD, { shadow: 2.5, bevel: 0.8 });
    glint(ctx, x, y, 5);
  }
  // crescent moon hanging in the corner, its light spilling into the panel
  // (side face: the moon sits low on the left – the blessing text keeps the top)
  const mx = face === "front" ? w - 82 : 96;
  const my = face === "front" ? 84 : h - 124;
  moonGlow(ctx, mx, my, 110, "255, 226, 150", 0.55);
  const moon = crescentPath(mx, my, 46, 20 * (face === "front" ? -1 : 1), -13, 40);
  ctx.save();
  ctx.shadowColor = "rgba(255, 220, 140, 0.9)";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "rgba(255, 230, 160, 1)";
  ctx.fill(moon);
  ctx.restore();
  gild(ctx, moon, foil(ctx, mx - 46, my - 46, mx + 46, my + 46, BRIGHT_GOLD), BRIGHT_GOLD, { shadow: 0, bevel: 1.6, edge: 1 });
  // glittering stars around the moon and on the frame
  const big: Pt[] = face === "front" ? [[w - 150, 58], [w - 40, 140], [w - 120, 150], [40, 70], [70, h - 70]] : [[150, h - 70], [40, h - 180], [w - 50, 90], [w - 60, h - 64], [40, 60]];
  for (const [x, y] of big) glint(ctx, x, y, 7 + rnd() * 4);
  for (let i = 0; i < 20; i++) {
    const t = rnd();
    const x = t < 0.5 ? (rnd() < 0.5 ? 6 + rnd() * 16 : w - 6 - rnd() * 16) : 20 + rnd() * (w - 40);
    const y = t < 0.5 ? 50 + rnd() * (h - 100) : rnd() < 0.5 ? 6 + rnd() * 34 : h - 6 - rnd() * 30;
    glint(ctx, x, y, 2.5 + rnd() * 3.5, rnd() < 0.5 ? "255, 250, 230" : "255, 220, 140");
  }
}

// ---------- royal kanok ----------

function drawKanokArt(ctx: Ctx, w: number, h: number, face: ArtFace) {
  const f: FrameSpec = { inset: 38, top: 50, bottom: 52, r: 10, ground: ["#3e0306", "#740a11", "#8e1018", "#6a0810", "#3c0306"], alpha: 0.97 };
  // lacquer-red glow gathering at the panel edges, warm light in the middle
  const veil = ctx.createRadialGradient(w / 2, h * 0.55, h * 0.22, w / 2, h * 0.55, h * 0.7);
  veil.addColorStop(0, "rgba(170, 30, 20, 0)");
  veil.addColorStop(1, "rgba(150, 18, 18, 0.42)");
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, w, h);
  // watermark: radiating kanok flames engraved in faint gold-red line work
  const wy = face === "front" ? h * 0.5 : h * 0.62;
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = "#a3361c";
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const [px, py] = [w / 2 + Math.sin(a) * 52, wy - Math.cos(a) * 52];
    ctx.stroke(kanokPath(new Pen(local(px, py, 96, a, i % 2 === 1))).path);
  }
  for (const r of [44, 158, 166]) {
    ctx.beginPath();
    ctx.arc(w / 2, wy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < 4; i++) ctx.stroke(petalPath(new Pen(local(w / 2, wy, 40, (i * Math.PI) / 2)), 0.42).path);
  ctx.restore();

  drawFrame(ctx, w, h, f, BRIGHT_GOLD);
  const s = sheen(ctx, 0, 0, w * 0.7, h, BRIGHT_GOLD, 8);
  // lacquer highlight across the band
  const shine = ctx.createLinearGradient(0, 0, w, h);
  shine.addColorStop(0, "rgba(255, 120, 100, 0.16)");
  shine.addColorStop(0.5, "rgba(255, 120, 100, 0)");
  shine.addColorStop(1, "rgba(255, 120, 100, 0.12)");
  ctx.fillStyle = shine;
  const band = new Path2D();
  band.rect(0, 0, w, h);
  band.addPath(panelPath(w, h, f, 2));
  ctx.fill(band, "evenodd");

  // side bands: scrolling kanok vine
  kanokVine(ctx, 20, 66, h - 58, 6.5, 62, 19, BRIGHT_GOLD, s);
  kanokVine(ctx, w - 20, h - 58, 66, 6.5, 62, 19, BRIGHT_GOLD, s);
  // top band: crowned rosette with kanok flames flowing outward on both sides
  beads(ctx, 30, 11, w - 30, 11, 8, 1.7, s, BRIGHT_GOLD);
  for (let i = 0; i < 4; i++) {
    const d = 58 + i * 44;
    kanok(ctx, w / 2 - d + 14, 41, 27, -1.32, true, BRIGHT_GOLD, s);
    kanok(ctx, w / 2 + d - 14, 41, 27, 1.32, false, BRIGHT_GOLD, s);
    if (i > 0) {
      prajamYam(ctx, w / 2 - d + 22, 24, 7, BRIGHT_GOLD, s);
      prajamYam(ctx, w / 2 + d - 22, 24, 7, BRIGHT_GOLD, s);
    }
  }
  if (face === "front") {
    kanokTrio(ctx, w / 2 - 20, 50, 28, -0.9, BRIGHT_GOLD, s);
    kanokTrio(ctx, w / 2 + 20, 50, 28, 0.9, BRIGHT_GOLD, s);
    // gold fringe hanging into the panel
    kruayChoeng(ctx, f.inset + 14, w / 2 - 46, f.top + 1, 11, 1, BRIGHT_GOLD, s);
    kruayChoeng(ctx, w / 2 + 46, w - f.inset - 14, f.top + 1, 11, 1, BRIGHT_GOLD, s);
  }
  prajamYam(ctx, w / 2, 29, 22, BRIGHT_GOLD, s);
  // bottom band: rising kranok points, beads and a central rosette
  kruayChoeng(ctx, 30, w - 30, h - 9, 30, -1, BRIGHT_GOLD, s);
  beads(ctx, 30, h - 46, w - 30, h - 46, 8, 1.6, s, BRIGHT_GOLD);
  prajamYam(ctx, w / 2, h - 28, 17, BRIGHT_GOLD, s);
  // corner flame clusters reaching into the panel
  const corners: Array<[number, number, number, boolean]> = [
    [f.inset + 2, f.top + 2, Math.PI * 0.75, face === "side"],
    [w - f.inset - 2, f.top + 2, -Math.PI * 0.75, false],
    [f.inset + 2, h - f.bottom - 2, Math.PI * 0.25, false],
    [w - f.inset - 2, h - f.bottom - 2, -Math.PI * 0.25, false],
  ];
  for (const [x, y, a, small] of corners) {
    kanokTrio(ctx, x, y, small ? 26 : 46, a, BRIGHT_GOLD, s);
    prajamYam(ctx, x, y, 14, BRIGHT_GOLD, s);
  }
  const rnd = seededRandom(3301);
  for (let i = 0; i < 30; i++) {
    const side = rnd();
    const x = side < 0.5 ? (rnd() < 0.5 ? 4 + rnd() * 30 : w - 4 - rnd() * 30) : 30 + rnd() * (w - 60);
    const y = side < 0.5 ? 60 + rnd() * (h - 120) : rnd() < 0.5 ? 4 + rnd() * 50 : h - 4 - rnd() * 44;
    glint(ctx, x, y, 2.5 + rnd() * 4.5);
  }
}

// ---------- moonlit sakura ----------

function blossom(ctx: Ctx, x: number, y: number, r: number, rot: number, open = 1) {
  const petals = new Path2D();
  for (let i = 0; i < 5; i++) {
    const pen = new Pen(local(x, y, r * (0.85 + open * 0.15), rot + (i * Math.PI * 2) / 5));
    pen.M(0, 0).C(-0.62 * open, -0.25, -0.55, -0.88, -0.16, -1).L(0, -0.86).L(0.16, -1).C(0.55, -0.88, 0.62 * open, -0.25, 0, 0).Z();
    petals.addPath(pen.path);
  }
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, "#c2306a");
  g.addColorStop(0.3, "#f38fb6");
  g.addColorStop(0.7, "#ffd5e4");
  g.addColorStop(1, "#fff6fa");
  ctx.save();
  ctx.shadowColor = "rgba(120, 30, 70, 0.35)";
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = g;
  ctx.fill(petals);
  ctx.restore();
  ctx.strokeStyle = "rgba(205, 150, 60, 0.95)";
  ctx.lineWidth = 0.9;
  ctx.stroke(petals);
  // gold stamens
  ctx.save();
  ctx.strokeStyle = "rgba(190, 120, 30, 0.9)";
  ctx.fillStyle = "#f5cf63";
  ctx.lineWidth = 0.7;
  for (let i = 0; i < 9; i++) {
    const a = rot + (i / 9) * Math.PI * 2 + 0.2;
    const ex = x + Math.cos(a) * r * 0.42;
    const ey = y + Math.sin(a) * r * 0.42;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ex, ey, Math.max(0.8, r * 0.07), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#9e1f52";
  ctx.beginPath();
  ctx.arc(x, y, r * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function sakuraPetal(ctx: Ctx, x: number, y: number, s: number, rot: number, alpha: number) {
  const pen = new Pen(local(x, y, s, rot)).M(0, 0.5).C(-0.6, 0.2, -0.5, -0.45, -0.14, -0.5).L(0, -0.38).L(0.14, -0.5).C(0.5, -0.45, 0.6, 0.2, 0, 0.5).Z();
  const g = ctx.createLinearGradient(x, y + s * 0.5, x, y - s * 0.5);
  g.addColorStop(0, "#ef7fa9");
  g.addColorStop(1, "#ffe3ee");
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.fill(pen.path);
  ctx.strokeStyle = "rgba(210, 150, 70, 0.8)";
  ctx.lineWidth = 0.6;
  ctx.stroke(pen.path);
  ctx.restore();
}

interface Twig {
  pts: Pt[];
  width: number;
}

/** Grows a gnarled branch: a list of polyline segments with tapering width */
function growBranch(rnd: () => number, x: number, y: number, ang: number, len: number, width: number, depth: number, out: Twig[], tips: Pt[]) {
  const pts: Pt[] = [[x, y]];
  const n = 6;
  let a = ang;
  let px = x;
  let py = y;
  for (let i = 0; i < n; i++) {
    a += (rnd() - 0.5) * 0.5;
    px += Math.cos(a) * (len / n);
    py += Math.sin(a) * (len / n);
    pts.push([px, py]);
    if (depth > 0 && i >= 1 && i < n - 1 && rnd() < 0.42) {
      const side = rnd() < 0.5 ? -1 : 1;
      growBranch(rnd, px, py, a + side * (0.55 + rnd() * 0.5), len * (0.38 + rnd() * 0.2), width * 0.5, depth - 1, out, tips);
    }
  }
  out.push({ pts, width });
  tips.push(...pts.slice(2));
}

function drawBranch(ctx: Ctx, t: Twig) {
  const n = t.pts.length - 1;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      const wdt = t.width * (1 - (i / n) * 0.75);
      ctx.beginPath();
      ctx.moveTo(t.pts[i][0], t.pts[i][1]);
      ctx.lineTo(t.pts[i + 1][0], t.pts[i + 1][1]);
      if (pass === 0) {
        ctx.strokeStyle = "#3a1a2a";
        ctx.lineWidth = wdt;
      } else {
        // moonlit gold rim on the upper edge
        ctx.save();
        ctx.translate(-wdt * 0.18, -wdt * 0.28);
        ctx.strokeStyle = "rgba(232, 182, 92, 0.85)";
        ctx.lineWidth = Math.max(0.7, wdt * 0.22);
        ctx.stroke();
        ctx.restore();
        continue;
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Auspicious gold-rimmed clouds drifting by, sprinkled with cut gold-leaf flakes (kirigane) */
function goldCloud(ctx: Ctx, x: number, y: number, s: number, flip: boolean, rnd: () => number, fill: CanvasGradient) {
  moonGlow(ctx, x, y, s * 2.2, "255, 236, 190", 0.35);
  const g = ctx.createLinearGradient(0, y - s * 0.6, 0, y + s * 0.3);
  g.addColorStop(0, "#fffaec");
  g.addColorStop(1, "#fad6e2");
  const metal: Metal = { ...GOLD, edge: "rgba(200, 142, 48, 0.95)" };
  thaiCloud(ctx, x + (flip ? -1 : 1) * s * 0.95, y + s * 0.28, s * 0.62, !flip, metal, g, fill);
  thaiCloud(ctx, x, y, s, flip, metal, g, fill);
  ctx.save();
  for (let i = 0; i < 22; i++) {
    ctx.fillStyle = rnd() < 0.5 ? "#f6d36b" : "#fff3c4";
    const fx = x + (rnd() - 0.5) * s * 4;
    const fy = y + (rnd() - 0.5) * s * 1.8;
    const sz = 1.2 + rnd() * 2.6;
    ctx.save();
    ctx.translate(fx, fy);
    ctx.rotate(rnd() * Math.PI);
    ctx.globalAlpha = 0.55 + rnd() * 0.45;
    ctx.fillRect(-sz / 2, -sz / 2, sz, sz * (0.4 + rnd() * 0.8));
    ctx.restore();
  }
  ctx.restore();
}

function drawSakuraArt(ctx: Ctx, w: number, h: number, face: ArtFace) {
  const rnd = seededRandom(face === "front" ? 4401 : 4409);
  // dusk-pink veil around the edges + lilac mist at the bottom
  const veil = ctx.createRadialGradient(w / 2, h * 0.5, h * 0.3, w / 2, h * 0.5, h * 0.75);
  veil.addColorStop(0, "rgba(150, 60, 110, 0)");
  veil.addColorStop(1, "rgba(150, 60, 110, 0.32)");
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, w, h);
  const mist = ctx.createLinearGradient(0, h * 0.8, 0, h);
  mist.addColorStop(0, "rgba(160, 110, 200, 0)");
  mist.addColorStop(1, "rgba(150, 100, 190, 0.35)");
  ctx.fillStyle = mist;
  ctx.fillRect(0, h * 0.8, w, h * 0.2);
  const dusk = ctx.createLinearGradient(0, 0, 0, h * 0.32);
  dusk.addColorStop(0, "rgba(110, 60, 150, 0.34)");
  dusk.addColorStop(1, "rgba(110, 60, 150, 0)");
  ctx.fillStyle = dusk;
  ctx.fillRect(0, 0, w, h * 0.32);

  // the moon
  const mx = face === "front" ? w * 0.72 : w * 0.74;
  const my = face === "front" ? h * 0.2 : h * 0.7;
  const mr = face === "front" ? 70 : 56;
  moonGlow(ctx, mx, my, mr * 2.4, "255, 244, 215", 0.65);
  const mg = ctx.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
  mg.addColorStop(0, "rgba(255, 253, 240, 0.95)");
  mg.addColorStop(0.7, "rgba(255, 240, 210, 0.9)");
  mg.addColorStop(1, "rgba(246, 214, 170, 0.85)");
  ctx.save();
  ctx.shadowColor = "rgba(255, 236, 190, 0.9)";
  ctx.shadowBlur = 22;
  ctx.fillStyle = mg;
  ctx.beginPath();
  ctx.arc(mx, my, mr, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // soft maria
  ctx.save();
  ctx.fillStyle = "rgba(220, 180, 150, 0.22)";
  for (const [dx, dy, rr] of [
    [-0.3, -0.15, 0.22],
    [0.2, 0.25, 0.18],
    [0.28, -0.3, 0.12],
    [-0.1, 0.35, 0.1],
  ]) {
    ctx.beginPath();
    ctx.arc(mx + dx * mr, my + dy * mr, rr * mr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "rgba(214, 164, 80, 0.8)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(mx, my, mr + 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // gold double border with rounded corners + blossom medallions
  const s = sheen(ctx, 0, 0, w * 0.7, h, GOLD, 7);
  // gold-rimmed clouds drifting past the moon (behind the branches)
  if (face === "front") {
    goldCloud(ctx, mx - mr * 0.5, my + mr * 0.82, 42, false, rnd, s);
    goldCloud(ctx, 70, h - 96, 34, true, rnd, s);
  } else {
    goldCloud(ctx, mx + mr * 0.3, my + mr * 0.85, 38, true, rnd, s);
    goldCloud(ctx, 70, h - 100, 32, false, rnd, s);
  }
  const outer = new Path2D();
  roundRectInto(outer, 10, 10, w - 20, h - 20, 18);
  molding(ctx, outer, 3, s, GOLD);
  const inner = new Path2D();
  roundRectInto(inner, 18, 18, w - 36, h - 36, 12);
  ctx.save();
  ctx.strokeStyle = s;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([10, 4, 2, 4]);
  ctx.stroke(inner);
  ctx.restore();

  // branches: from the top corner sweeping across the top, and from the bottom corner
  const twigs: Twig[] = [];
  const tips: Pt[] = [];
  if (face === "front") {
    growBranch(rnd, -6, 30, 0.18, w * 0.62, 11, 2, twigs, tips);
    growBranch(rnd, w + 6, h - 70, Math.PI + 0.38, w * 0.42, 10, 2, twigs, tips);
  } else {
    growBranch(rnd, w + 6, 36, Math.PI - 0.14, w * 0.5, 11, 2, twigs, tips);
    growBranch(rnd, -6, h - 60, -0.42, w * 0.38, 9, 2, twigs, tips);
  }
  // keep the twigs out of the text area: a branch stops where it would enter it
  const calm = face === "front" ? [w * 0.2, w * 0.8, h * 0.3, h * 0.72] : [w * 0.06, w * 0.94, h * 0.16, h * 0.62];
  const inCalm = ([x, y]: Pt) => x > calm[0] && x < calm[1] && y > calm[2] && y < calm[3];
  const kept = new Set<Pt>();
  for (const t of twigs) {
    const k = t.pts.findIndex(inCalm);
    if (k >= 0) t.pts = t.pts.slice(0, k);
    if (t.pts.length < 2) continue;
    drawBranch(ctx, t);
    for (const p of t.pts) kept.add(p);
  }
  for (let i = 0; i < tips.length; i++) {
    if (!kept.has(tips[i])) continue;
    const [x, y] = tips[i];
    const off = 5 + rnd() * 6;
    const a = rnd() * Math.PI * 2;
    const bx = x + Math.cos(a) * off;
    const by = y + Math.sin(a) * off;
    if (rnd() < 0.25) {
      // bud
      ctx.fillStyle = "#d4477e";
      ctx.beginPath();
      ctx.ellipse(bx, by, 3.6, 5, a, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(200, 140, 60, 0.9)";
      ctx.lineWidth = 0.7;
      ctx.stroke();
    } else blossom(ctx, bx, by, 9 + rnd() * 7, rnd() * Math.PI, 0.8 + rnd() * 0.2);
    if (rnd() < 0.55) blossom(ctx, x - Math.cos(a) * off, y - Math.sin(a) * off, 7 + rnd() * 5, rnd() * Math.PI, 0.85);
  }
  // falling petals – dense at the edges, a sparse few over the text
  for (let i = 0; i < 70; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const cxn = Math.abs(x / w - 0.5) * 2;
    const cyn = Math.abs(y / h - 0.5) * 2;
    const edge = Math.max(cxn, cyn);
    if (edge < 0.72 && rnd() < 0.7) continue;
    sakuraPetal(ctx, x, y, 6 + rnd() * 6, rnd() * Math.PI * 2, edge < 0.72 ? 0.45 : 0.9);
  }
  // corner blossoms on the frame
  for (const [x, y] of [
    [14, 14],
    [w - 14, 14],
    [14, h - 14],
    [w - 14, h - 14],
  ] as const) {
    blossom(ctx, x, y, 13, 0.3, 1);
  }
  for (let i = 0; i < 12; i++) glint(ctx, rnd() * w, rnd() < 0.5 ? rnd() * 60 : h - rnd() * 60, 2.5 + rnd() * 3, "255, 246, 220", 0.9);
}

// ---------- peacock ----------

/** Peacock feather: wispy barbs along a curved shaft, ending in the iridescent eye */
function peacockFeather(ctx: Ctx, x: number, y: number, ang: number, len: number, eye: number, rnd: () => number) {
  const m = local(x, y, len, ang);
  const bend = (rnd() - 0.5) * 0.12;
  const shaftAt = (t: number): Pt => m(Math.sin(t * Math.PI) * bend, -t);
  // barbs
  ctx.save();
  ctx.lineCap = "round";
  const barbs = new Path2D();
  const barbsGold = new Path2D();
  for (let t = 0.06; t < 0.86; t += 0.012) {
    const [sx, sy] = shaftAt(t);
    const env = Math.sin(Math.min(1, t / 0.8) * Math.PI * 0.5) * (0.08 + t * 0.1);
    for (const side of [-1, 1]) {
      const [ex, ey] = m(Math.sin(t * Math.PI) * bend + side * env * (0.8 + rnd() * 0.4), -t - 0.05 - rnd() * 0.03);
      const p = rnd() < 0.3 ? barbsGold : barbs;
      p.moveTo(sx, sy);
      p.quadraticCurveTo((sx + ex) / 2 + side * 1.5, (sy + ey) / 2, ex, ey);
    }
  }
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = "rgba(16, 112, 76, 0.8)";
  ctx.stroke(barbs);
  ctx.strokeStyle = "rgba(196, 146, 40, 0.85)";
  ctx.stroke(barbsGold);
  // shaft
  ctx.beginPath();
  for (let t = 0; t <= 0.92; t += 0.04) {
    const [sx, sy] = shaftAt(t);
    if (t === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  }
  ctx.strokeStyle = "rgba(240, 210, 130, 0.95)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
  // eye: fringe, bronze, green, turquoise, sapphire heart
  const [ex, ey] = shaftAt(0.88);
  const ea = ang;
  ctx.save();
  ctx.translate(ex, ey);
  ctx.rotate(ea);
  const fr = new Path2D();
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const r1 = 0.7;
    const r2 = 1.5 + rnd() * 0.35;
    fr.moveTo(Math.cos(a) * eye * r1 * 0.8, Math.sin(a) * eye * r1);
    fr.lineTo(Math.cos(a) * eye * r2 * 0.8, Math.sin(a) * eye * r2 - eye * 0.15);
  }
  ctx.strokeStyle = "rgba(24, 128, 70, 0.85)";
  ctx.lineWidth = 1;
  ctx.stroke(fr);
  ctx.strokeStyle = "rgba(214, 170, 60, 0.6)";
  ctx.lineWidth = 0.6;
  ctx.stroke(fr);
  const ring = (rx: number, ry: number, oy: number, fill: string | CanvasGradient) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(0, oy * eye, rx * eye, ry * eye, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  ctx.shadowColor = "rgba(0, 20, 15, 0.5)";
  ctx.shadowBlur = 3;
  const bronze = ctx.createLinearGradient(-eye, -eye, eye, eye);
  bronze.addColorStop(0, "#f7dc84");
  bronze.addColorStop(0.5, "#c08a2c");
  bronze.addColorStop(1, "#7a5212");
  ring(0.82, 1.02, 0, bronze);
  ctx.shadowBlur = 0;
  ring(0.68, 0.86, 0.06, "#1e9a52");
  const turq = ctx.createRadialGradient(0, 0.1 * eye, 0, 0, 0.1 * eye, 0.7 * eye);
  turq.addColorStop(0, "#5ef2e6");
  turq.addColorStop(1, "#0f9fb4");
  ring(0.52, 0.66, 0.12, turq);
  const sapph = ctx.createRadialGradient(0, 0.18 * eye, 0, 0, 0.2 * eye, 0.42 * eye);
  sapph.addColorStop(0, "#3d6fe8");
  sapph.addColorStop(0.6, "#173a9c");
  sapph.addColorStop(1, "#0b1c58");
  ring(0.32, 0.42, 0.2, sapph);
  ctx.strokeStyle = "rgba(255, 236, 160, 0.9)";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.82 * eye, 1.02 * eye, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
  ctx.beginPath();
  ctx.ellipse(-0.12 * eye, 0.05 * eye, 0.07 * eye, 0.12 * eye, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPeacockArt(ctx: Ctx, w: number, h: number, face: ArtFace) {
  const rnd = seededRandom(face === "front" ? 5501 : 5503);
  const f: FrameSpec = { inset: 30, top: 48, bottom: 44, r: 14, ground: ["#032622", "#06423b", "#0a5248", "#053630"], alpha: 0.95 };
  // faint feather-eye watermark
  ctx.save();
  ctx.globalAlpha = 0.09;
  ctx.strokeStyle = "#0b5a50";
  ctx.lineWidth = 2;
  const wy = face === "front" ? h * 0.5 : h * 0.62;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.ellipse(w / 2, wy, 60 + i * 26, 76 + i * 32, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  drawFrame(ctx, w, h, f, BRIGHT_GOLD);
  const s = sheen(ctx, 0, 0, w * 0.7, h, BRIGHT_GOLD, 7);
  // side bands: gold vine
  kanokVine(ctx, 15, 58, h - 50, 5, 58, 15, BRIGHT_GOLD, s);
  kanokVine(ctx, w - 15, h - 50, 58, 5, 58, 15, BRIGHT_GOLD, s);
  // top band: a crown of small eyes between gold scrolls
  for (let i = 0; i < 9; i++) {
    const x = 52 + ((w - 104) * i) / 8;
    peacockFeather(ctx, x, 50, 0, 40, 8, rnd);
  }
  beads(ctx, 30, 9, w - 30, 9, 8, 1.6, s, BRIGHT_GOLD);
  // bottom band: gold scallops + beads
  const scallop = new Path2D();
  const ns = 16;
  for (let i = 0; i < ns; i++) {
    const x = 30 + ((w - 60) * (i + 0.5)) / ns;
    const r = (w - 60) / ns / 2;
    scallop.moveTo(x + r, h - 22);
    scallop.arc(x, h - 22, r, 0, Math.PI, true);
    scallop.lineTo(x + r * 0.55, h - 22);
    scallop.arc(x, h - 22, r * 0.55, Math.PI, 0, false);
  }
  gild(ctx, scallop, s, BRIGHT_GOLD, { shadow: 1.5, bevel: 0.6 });
  beads(ctx, 30, h - 12, w - 30, h - 12, 8, 1.6, s, BRIGHT_GOLD);
  // plumes sweeping up from the bottom corners
  const plume = (x: number, y: number, a0: number, a1: number, n: number, len: number) => {
    for (let i = 0; i < n; i++) {
      const a = a0 + ((a1 - a0) * i) / Math.max(1, n - 1);
      peacockFeather(ctx, x, y, a, len * (0.82 + rnd() * 0.25), 15 + rnd() * 3, rnd);
    }
  };
  if (face === "front") {
    plume(14, h - 10, -0.04, 0.98, 6, 222);
    plume(w - 14, h - 10, 0.0, -0.62, 4, 250);
  } else {
    plume(14, h - 10, 0.0, 0.8, 5, 245);
    plume(w - 14, h - 10, 0.0, -1.1, 6, 250);
  }
  // top corners: gilded rosettes
  prajamYam(ctx, f.inset, f.top, 15, BRIGHT_GOLD, s);
  prajamYam(ctx, w - f.inset, f.top, 15, BRIGHT_GOLD, s);
  for (let i = 0; i < 18; i++) {
    const x = rnd() < 0.5 ? rnd() * 30 : w - rnd() * 30;
    glint(ctx, x, 60 + rnd() * (h - 120), 2.5 + rnd() * 3.5);
  }
}

// ---------- free designs: hand-made mulberry (saa) paper ----------

function drawSaaPaper(ctx: Ctx, w: number, h: number, paper: string, face: ArtFace) {
  const rnd = seededRandom(face === "front" ? 6601 : 6607);
  const tint = mixHex(paper, "#5a3412", 0.55);
  const light = mixHex(paper, "#ffffff", 0.6);
  // long floating fibres
  ctx.save();
  ctx.lineCap = "round";
  for (let i = 0; i < 90; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const a = rnd() * Math.PI;
    const l = 10 + rnd() * 34;
    ctx.strokeStyle = rgba(rnd() < 0.7 ? tint : light, 0.08 + rnd() * 0.1);
    ctx.lineWidth = 0.5 + rnd() * 0.9;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(
      x + Math.cos(a) * l * 0.3 + (rnd() - 0.5) * 8,
      y + Math.sin(a) * l * 0.3 + (rnd() - 0.5) * 8,
      x + Math.cos(a) * l * 0.7 + (rnd() - 0.5) * 8,
      y + Math.sin(a) * l * 0.7 + (rnd() - 0.5) * 8,
      x + Math.cos(a) * l,
      y + Math.sin(a) * l,
    );
    ctx.stroke();
  }
  // a few pressed petals near the edges
  for (let i = 0; i < 9; i++) {
    const edgeX = rnd() < 0.5;
    const x = edgeX ? (rnd() < 0.5 ? 14 + rnd() * 40 : w - 14 - rnd() * 40) : 20 + rnd() * (w - 40);
    const y = edgeX ? 20 + rnd() * (h - 40) : rnd() < 0.5 ? 12 + rnd() * 36 : h - 12 - rnd() * 36;
    const pen = new Pen(local(x, y, 5 + rnd() * 5, rnd() * Math.PI * 2));
    petalPath(pen, 0.5);
    ctx.fillStyle = rgba(tint, 0.14);
    ctx.fill(pen.path);
  }
  // soft deckled edge
  const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.4, w / 2, h / 2, h * 0.78);
  g.addColorStop(0, rgba(tint, 0));
  g.addColorStop(1, rgba(tint, 0.16));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // thin hand-ruled border
  ctx.strokeStyle = rgba(tint, 0.28);
  ctx.lineWidth = 1.2;
  const p = new Path2D();
  roundRectInto(p, 16, 16, w - 32, h - 32, 10);
  ctx.stroke(p);
  ctx.restore();
}

const ART: Record<Exclude<LanternPattern, "none">, (ctx: Ctx, w: number, h: number, face: ArtFace) => void> = {
  lotus: drawLotusArt,
  stars: drawStarsArt,
  kanok: drawKanokArt,
  sakura: drawSakuraArt,
  peacock: drawPeacockArt,
};

const artLayers = new Map<string, HTMLCanvasElement>();

/**
 * The pattern artwork for one face, rendered once per (pattern, face, pixel size) into an offscreen
 * canvas. Smaller sizes (scene lanterns) are downsampled once from the full-size master, so every
 * later texture build only pays for a 1:1 blit.
 */
function artLayer(designId: LanternDesignId, face: ArtFace, w: number, h: number, pw: number, ph: number): HTMLCanvasElement {
  const d = LANTERN_DESIGNS[designId];
  const key = `${d.pattern === "none" ? `none:${d.paper}` : d.pattern}|${face}|${w}x${h}|${pw}x${ph}`;
  const hit = artLayers.get(key);
  if (hit) return hit;
  const c = makeCanvas(pw, ph);
  const ctx = c.getContext("2d")!;
  if (pw < w || ph < h) {
    const master = artLayer(designId, face, w, h, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(master, 0, 0, pw, ph);
  } else {
    ctx.scale(pw / w, ph / h);
    if (d.pattern === "none") drawSaaPaper(ctx, w, h, d.paper, face);
    else ART[d.pattern](ctx, w, h, face);
  }
  if (artLayers.size >= 64) artLayers.clear();
  artLayers.set(key, c);
  return c;
}

/** inner part of the artwork used on shaped krathongs (their silhouette replaces the square border) */
const BARE_INSET = 0.14;

/**
 * Blits the cached artwork onto a face canvas (the context is scaled by res = pw / w).
 * `bare`: heart / moon / rabbit – skip the square border band by stretching the artwork's inner area.
 */
function drawPattern(ctx: CanvasRenderingContext2D, designId: LanternDesignId, face: ArtFace, w: number, h: number, pw: number, ph: number, bare = false) {
  const layer = artLayer(designId, face, w, h, pw, ph);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (bare) {
    const sx = layer.width * BARE_INSET;
    const sy = layer.height * BARE_INSET;
    ctx.drawImage(layer, sx, sy, layer.width - sx * 2, layer.height - sy * 2, 0, 0, pw, ph);
  } else ctx.drawImage(layer, 0, 0);
  ctx.restore();
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

/**
 * Outline of a photo frame inside the photo rectangle r (as a Path2D in texture units).
 * circle / heart / star / flower use the centred square of the shorter side (the photo is cut, not squashed).
 */
export function photoFramePath(frame: PhotoFrame | undefined, r: { x: number; y: number; w: number; h: number }): Path2D {
  const p = new Path2D();
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const s = Math.min(r.w, r.h);
  switch (frame) {
    case "circle":
      p.arc(cx, cy, s / 2, 0, Math.PI * 2);
      break;
    case "heart": {
      // unit heart (0…1), slightly wider than tall – centred in the square
      const x0 = cx - s / 2;
      const y0 = cy - s / 2 + s * 0.04;
      const X = (u: number) => x0 + u * s;
      const Y = (v: number) => y0 + v * s;
      p.moveTo(X(0.5), Y(0.27));
      p.bezierCurveTo(X(0.5), Y(0.22), X(0.43), Y(0.08), X(0.26), Y(0.08));
      p.bezierCurveTo(X(0.03), Y(0.08), X(0.0), Y(0.32), X(0.0), Y(0.36));
      p.bezierCurveTo(X(0.0), Y(0.56), X(0.2), Y(0.74), X(0.5), Y(0.94));
      p.bezierCurveTo(X(0.8), Y(0.74), X(1.0), Y(0.56), X(1.0), Y(0.36));
      p.bezierCurveTo(X(1.0), Y(0.32), X(0.97), Y(0.08), X(0.74), Y(0.08));
      p.bezierCurveTo(X(0.57), Y(0.08), X(0.5), Y(0.22), X(0.5), Y(0.27));
      p.closePath();
      break;
    }
    case "star": {
      // five points with rounded tips (arcTo at every corner)
      const R = s / 2;
      const ir = R * 0.5;
      const oy = cy + R * 0.06; // optical centre
      const pts: Array<[number, number]> = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? ir : R;
        pts.push([cx + Math.cos(a) * rr, oy + Math.sin(a) * rr]);
      }
      const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const start = mid(pts[9], pts[0]);
      p.moveTo(start[0], start[1]);
      for (let i = 0; i < 10; i++) {
        const cur = pts[i];
        const nxt = mid(cur, pts[(i + 1) % 10]);
        p.arcTo(cur[0], cur[1], nxt[0], nxt[1], i % 2 ? R * 0.06 : R * 0.12);
      }
      p.closePath();
      break;
    }
    case "arch": {
      const rad = Math.min(r.w / 2, r.h);
      const br = Math.min(10, rad);
      p.moveTo(r.x, r.y + rad);
      p.arc(cx, r.y + rad, rad, Math.PI, 0);
      p.lineTo(r.x + r.w, r.y + r.h - br);
      p.arcTo(r.x + r.w, r.y + r.h, r.x + r.w - br, r.y + r.h, br);
      p.lineTo(r.x + br, r.y + r.h);
      p.arcTo(r.x, r.y + r.h, r.x, r.y + r.h - br, br);
      p.closePath();
      break;
    }
    case "flower": {
      // scalloped edge – ten round petals
      const R = s / 2;
      const n = 10;
      for (let i = 0; i <= 160; i++) {
        const a = (i / 160) * Math.PI * 2 - Math.PI / 2;
        const rr = R * (0.8 + 0.2 * Math.abs(Math.cos((a * n) / 2)));
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr;
        if (i) p.lineTo(x, y);
        else p.moveTo(x, y);
      }
      p.closePath();
      break;
    }
    default: {
      const rr = Math.min(10, r.w / 2, r.h / 2);
      p.moveTo(r.x + rr, r.y);
      p.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, rr);
      p.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, rr);
      p.arcTo(r.x, r.y + r.h, r.x, r.y, rr);
      p.arcTo(r.x, r.y, r.x + r.w, r.y, rr);
      p.closePath();
    }
  }
  return p;
}

function drawPhoto(ctx: CanvasRenderingContext2D, image: CanvasImageSource, cfg: ImageConfig, w: number, h: number) {
  const r = imageRect(cfg, image, w, h);
  const frame = photoFramePath(cfg.frame, r);
  ctx.save();
  ctx.clip(frame);
  ctx.globalAlpha = 0.93;
  ctx.drawImage(image, r.x, r.y, r.w, r.h);
  ctx.restore();
  ctx.save();
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(90, 50, 15, 0.35)";
  ctx.lineWidth = 3;
  ctx.stroke(frame);
  if (cfg.frame && cfg.frame !== "rounded") {
    // a thin gold rim makes the cut-out shape read on any paper
    ctx.strokeStyle = "rgba(255, 214, 120, 0.55)";
    ctx.lineWidth = 1.5;
    ctx.stroke(frame);
  }
  ctx.restore();
}

/** Clears a face canvas and returns its context scaled to texture units */
function beginFace(canvas: HTMLCanvasElement, res: number, pw: number, ph: number) {
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, pw, ph);
  ctx.setTransform(res, 0, 0, res, 0, 0);
  ctx.globalAlpha = 1;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  return ctx;
}

type Stamped = HTMLCanvasElement & { __v?: number; __build?: number };
/** version stamp lets the renderer know its baked copy is stale (canvases are pooled & reused) */
const stamp = (c: HTMLCanvasElement) => {
  (c as Stamped).__v = ((c as Stamped).__v ?? 0) + 1;
};

function paintFront(ctx: CanvasRenderingContext2D, visual: LanternVisual, assets: FaceAssets, w: number, h: number, pw: number, ph: number) {
  const tc = visual.textConfig;
  drawPattern(ctx, visual.design, "front", w, h, pw, ph, !!visual.shape && visual.shape !== "box");
  if (visual.effects?.includes("thai-frame")) drawThaiFrame(ctx, w, h);

  if (assets.image && visual.imageConfig) drawPhoto(ctx, assets.image, visual.imageConfig, w, h);
  if (assets.drawing) ctx.drawImage(assets.drawing, 0, 0, w, h);

  if (visual.wishMessage) {
    const box = textBox(tc.position, w, h);
    const { px, lines } = fitText(ctx, visual.wishMessage, tc.font, 46 * tc.size, box.width, box.height);
    ctx.font = fontString(tc.font, px);
    ctx.fillStyle = tc.color;
    const blockH = lines.length * px * 1.35;
    const startY = box.top + (box.height - blockH) / 2;
    // centre each line by measuring it (not textAlign) and never let a line run past the box –
    // some mobile browsers mis-wrap Thai (no word segmenter) or ignore textAlign on canvases
    ctx.save();
    ctx.textAlign = "left";
    lines.forEach((line, i) => {
      const lw = ctx.measureText(line).width;
      const y = startY + i * px * 1.35;
      if (lw > box.width) {
        ctx.save();
        ctx.translate(box.x - box.width / 2, y);
        ctx.scale(box.width / lw, 1);
        ctx.fillText(line, 0, 0);
        ctx.restore();
      } else ctx.fillText(line, box.x - lw / 2, y);
    });
    ctx.restore();
  }

  if (visual.displayName) {
    ctx.font = fontString(tc.font, 26 * Math.min(1.2, tc.size));
    ctx.fillStyle = tc.color;
    ctx.globalAlpha = 0.85;
    ctx.textAlign = "right";
    const nameY = tc.position === "bottom" ? h * 0.07 : h * 0.88;
    const label = `— ${visual.displayName}`;
    // a long name must not run past the left edge of the paper: squeeze it into 76% of the width
    const maxW = w * 0.76;
    const lw = ctx.measureText(label).width;
    if (lw > maxW) {
      ctx.save();
      ctx.translate(w * 0.88, nameY);
      ctx.scale(maxW / lw, 1);
      ctx.fillText(label, 0, 0);
      ctx.restore();
    } else ctx.fillText(label, w * 0.88, nameY);
    ctx.globalAlpha = 1;
    ctx.textAlign = "center";
  }
}

/** Blessing (with heart bullets) + short extra line – the writing on the side walls */
function paintSideText(ctx: CanvasRenderingContext2D, visual: LanternVisual, w: number, h: number) {
  const tc = visual.textConfig;
  ctx.textAlign = "left";
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
}

function paintSide(ctx: CanvasRenderingContext2D, visual: LanternVisual, w: number, h: number, pw: number, ph: number) {
  ctx.textAlign = "left";
  drawPattern(ctx, visual.design, "side", w, h, pw, ph, !!visual.shape && visual.shape !== "box");
  if (visual.effects?.includes("thai-frame")) drawThaiFrame(ctx, w, h);
  paintSideText(ctx, visual, w, h);
}

/**
 * A wall with its own photo / drawing. The blessing text is printed underneath only when no other
 * side wall is left to carry it (see textUnderArt) – otherwise the art gets the whole paper.
 */
function paintArtFace(
  ctx: CanvasRenderingContext2D,
  visual: LanternVisual,
  art: FaceArt,
  assets: { image?: CanvasImageSource | null; drawing?: CanvasImageSource | null },
  withText: boolean,
  w: number,
  h: number,
  pw: number,
  ph: number,
) {
  drawPattern(ctx, visual.design, withText ? "side" : "front", w, h, pw, ph, !!visual.shape && visual.shape !== "box");
  if (visual.effects?.includes("thai-frame")) drawThaiFrame(ctx, w, h);
  if (withText) paintSideText(ctx, visual, w, h);
  if (assets.image && art.imageConfig) drawPhoto(ctx, assets.image, art.imageConfig, w, h);
  if (assets.drawing) ctx.drawImage(assets.drawing, 0, 0, w, h);
}

/* ------------------------------------------------------------------ face ↔ texture mapping */

export const hasFaceArt = (a: FaceArt | null | undefined): a is FaceArt => !!a && !!(a.imageSrc || a.drawingSrc);

/** Side walls of this lantern that carry their own photo / drawing (only walls its shape has) */
export function artFaces(visual: Pick<LanternVisual, "shape" | "faces">): ExtraFaceId[] {
  const walls = facesForShape(visual.shape);
  return EXTRA_FACE_IDS.filter((f) => walls.includes(f) && hasFaceArt(visual.faces?.[f]));
}

/** True when every side wall carries art – the blessing text is then printed under the art so it never disappears */
export function textUnderArt(visual: Pick<LanternVisual, "shape" | "faces">): boolean {
  const sides = facesForShape(visual.shape).filter((f): f is ExtraFaceId => f !== "front");
  return sides.length > 0 && sides.every((f) => hasFaceArt(visual.faces?.[f]));
}

/** Which texture a wall shows: the front texture, its own art texture, or the shared side (blessing) texture */
export function faceTextureKey(visual: Pick<LanternVisual, "shape" | "faces">, face: LanternFaceId): "front" | "side" | ExtraFaceId {
  if (face === "front") return "front";
  return artFaces(visual).includes(face) ? face : "side";
}

/** The canvas drawLantern maps onto a wall */
export function textureForFace(textures: FaceTextures, face: LanternFaceId): HTMLCanvasElement {
  if (face === "front") return textures.front;
  return textures.faces?.[face] ?? textures.side;
}

let buildSeq = 0;

/** Renders the ink layer (everything printed on the paper) for the front, side and per-wall art faces. */
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

  paintFront(beginFace(front, res, pw, ph), visual, assets, w, h, pw, ph);
  paintSide(beginFace(side, res, pw, ph), visual, w, h, pw, ph);
  stamp(front);
  stamp(side);

  // ---------- walls with their own art ----------
  // Callers only load the front assets; the other walls' images come from the image cache, and the
  // ones not loaded yet are fetched here and painted into the same canvas once they arrive.
  const token = ++buildSeq;
  const withText = textUnderArt(visual);
  const faces: Partial<Record<ExtraFaceId, HTMLCanvasElement>> = {};
  for (const face of artFaces(visual)) {
    const art = visual.faces![face]!;
    const canvas = options.target?.faces?.[face] ?? makeCanvas(pw, ph);
    const given = assets.faces?.[face];
    const wait: Promise<unknown>[] = [];
    const pick = (src: string | null, explicit: CanvasImageSource | null | undefined) => {
      if (given) return explicit ?? null;
      if (!src) return null;
      const img = peekImage(src);
      if (!img) wait.push(loadImage(src).catch(() => null));
      return img;
    };
    const paint = (image: CanvasImageSource | null, drawing: CanvasImageSource | null) => {
      paintArtFace(beginFace(canvas, res, pw, ph), visual, art, { image, drawing }, withText, w, h, pw, ph);
      stamp(canvas);
    };
    paint(pick(art.imageSrc, given?.image), pick(art.drawingSrc, given?.drawing));
    (canvas as Stamped).__build = token;
    faces[face] = canvas;
    if (wait.length) {
      void Promise.all(wait).then(() => {
        // rebuilt (or handed to another lantern by a texture pool) in the meantime
        if ((canvas as Stamped).__build !== token) return;
        paint(art.imageSrc ? peekImage(art.imageSrc) : null, art.drawingSrc ? peekImage(art.drawingSrc) : null);
      });
    }
  }
  return { front, side, faces };
}

/**
 * One wall's ink layer for the flat studio editors, rendered exactly as it will look on the lantern.
 * A side wall is drawn as an art face even before it has art (the editor is about to give it some).
 */
export function buildFaceLayer(
  visual: LanternVisual,
  face: LanternFaceId,
  assets: { image?: CanvasImageSource | null; drawing?: CanvasImageSource | null },
  target?: HTMLCanvasElement | null,
): HTMLCanvasElement {
  const canvas = target ?? makeCanvas(TEX_W, TEX_H);
  const ctx = beginFace(canvas, 1, TEX_W, TEX_H);
  if (face === "front") {
    paintFront(ctx, visual, assets, TEX_W, TEX_H, TEX_W, TEX_H);
  } else {
    const art: FaceArt = visual.faces?.[face] ?? { imageSrc: null, imageConfig: null, drawingSrc: null };
    // as if this wall already had art – decides whether the blessing stays under it
    const withText = textUnderArt({ shape: visual.shape, faces: { ...visual.faces, [face]: { ...art, drawingSrc: "x" } } });
    paintArtFace(ctx, visual, art, assets, withText, TEX_W, TEX_H, TEX_W, TEX_H);
  }
  stamp(canvas);
  return canvas;
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
/** the same images once decoded – lets buildFaceTextures pick up already loaded wall art synchronously */
const loadedImages = new Map<string, HTMLImageElement>();

/** An image loadImage() already finished loading (null while pending / never requested) */
export function peekImage(src: string): HTMLImageElement | null {
  return loadedImages.get(src) ?? null;
}

/** Loads (and caches) an image for canvas use. Works with signed URLs, data: and blob: URLs. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached) return cached;
  const p = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      if (imageCache.get(src) === p) loadedImages.set(src, img);
      resolve(img);
    };
    img.onerror = () => {
      imageCache.delete(src);
      reject(new Error("image load failed"));
    };
    img.src = src;
  });
  if (imageCache.size > 300) {
    imageCache.clear();
    loadedImages.clear();
  }
  imageCache.set(src, p);
  return p;
}

export type FaceContentHit = "image" | "drawing" | "message";

let hitCtx: CanvasRenderingContext2D | null = null;
/** is (u, v) inside the photo's frame shape (rounded / circle / heart …) */
export function insideFrame(cfg: ImageConfig, r: { x: number; y: number; w: number; h: number }, u: number, v: number): boolean {
  if (!cfg.frame || cfg.frame === "rounded") return true;
  try {
    hitCtx ??= makeCanvas(1, 1).getContext("2d");
    return hitCtx ? hitCtx.isPointInPath(photoFramePath(cfg.frame, r), u, v) : true;
  } catch {
    return true;
  }
}

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

/**
 * What the visitor tapped on a paper wall: the photo, the hand-drawn layer or the written text.
 * Walls with their own art are hit-tested against that art; assets.faces (or the image cache) supplies it.
 */
export function hitFaceContent(
  visual: LanternVisual,
  assets: FaceAssets,
  face: LanternFaceId,
  u: number,
  v: number,
): FaceContentHit | null {
  const hasText = !!(visual.wishMessage || visual.blessingMessage || visual.extraMessage);
  let image: CanvasImageSource | null | undefined;
  let drawing: CanvasImageSource | null | undefined;
  let imageConfig: ImageConfig | null;
  if (face === "front") {
    image = assets.image;
    drawing = assets.drawing;
    imageConfig = visual.imageConfig;
  } else {
    if (faceTextureKey(visual, face) === "side") return hasText ? "message" : null;
    const art = visual.faces![face]!;
    const given = assets.faces?.[face];
    image = given ? given.image : art.imageSrc ? peekImage(art.imageSrc) : null;
    drawing = given ? given.drawing : art.drawingSrc ? peekImage(art.drawingSrc) : null;
    imageConfig = art.imageConfig;
  }
  if (drawing && drawingInkNear(drawing, u, v)) return "drawing";
  if (image && imageConfig) {
    const r = imageRect(imageConfig, image, TEX_W, TEX_H);
    if (u >= r.x && u <= r.x + r.w && v >= r.y && v <= r.y + r.h && insideFrame(imageConfig, r, u, v)) return "image";
  }
  if (face === "front" && visual.wishMessage) {
    const box = textBox(visual.textConfig.position, TEX_W, TEX_H);
    if (v >= box.top && v <= box.top + box.height && Math.abs(u - box.x) <= box.width / 2) return "message";
  }
  // unreadable drawing pixels → any tap that is not on the photo / text counts as the drawing
  if (drawing && drawingInkNear(drawing, u, v) === null) return "drawing";
  // blank paper of a wall whose art replaced the writing
  if (face !== "front" && !textUnderArt(visual) && (image || drawing)) return null;
  return hasText ? "message" : null;
}
