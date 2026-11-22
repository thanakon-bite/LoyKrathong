import type { Decoration, LanternDesignId } from "@/types/lantern";
import { mixHex, rgba } from "@/lib/utils";
import { LANTERN_DESIGNS } from "./designs";
import { FACE_ASPECT, TEX_H, TEX_W, type FaceTextures } from "./texture";

/**
 * Cube paper lantern renderer (Canvas 2D).
 * The cube is projected orthographically (rotation + camera pitch); every face is
 * a parallelogram, so face textures are mapped exactly with an affine transform.
 */

export interface DrawLanternParams {
  /** Screen x of the lantern centre at the water line */
  x: number;
  /** Screen y of the water line under the lantern */
  y: number;
  /** Screen width of one face (px) */
  size: number;
  /** Rotation around the vertical axis (rad) */
  yaw: number;
  /** Camera pitch: how much we look down on the lantern (rad) */
  pitch: number;
  roll?: number;
  /** Inner light 0 … 1 */
  glow: number;
  alpha: number;
  design: LanternDesignId;
  light: string;
  decoration?: Decoration | null;
  textures?: FaceTextures | null;
  time: number;
  highlight?: number;
  /** Draw the soft halo around the lantern */
  halo?: boolean;
  /** Seed for per-lantern decoration motion */
  seed?: number;
}

export interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type V3 = [number, number, number];
type V2 = [number, number];

const HALF = 1;
const HEIGHT = 2 * FACE_ASPECT;

const glowSprites = new Map<string, HTMLCanvasElement>();
const SPRITE = 128;

/** Pre-rendered radial glow per light colour – much cheaper than per-frame gradients */
export function glowSprite(color: string): HTMLCanvasElement {
  let c = glowSprites.get(color);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = c.height = SPRITE;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(SPRITE / 2, SPRITE / 2, 0, SPRITE / 2, SPRITE / 2, SPRITE / 2);
  grad.addColorStop(0, rgba(color, 0.9));
  grad.addColorStop(0.25, rgba(color, 0.45));
  grad.addColorStop(0.6, rgba(color, 0.12));
  grad.addColorStop(1, rgba(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, SPRITE, SPRITE);
  glowSprites.set(color, c);
  return c;
}

let fiberPattern: HTMLCanvasElement | null = null;
/** Subtle paper fibre texture */
function fiberCanvas() {
  if (fiberPattern) return fiberPattern;
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 140;
  const g = c.getContext("2d")!;
  let s = 1337;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 260; i++) {
    g.strokeStyle = `rgba(120, 80, 30, ${0.05 + rnd() * 0.08})`;
    g.lineWidth = 0.6 + rnd();
    const x = rnd() * 128;
    const y = rnd() * 140;
    const a = rnd() * Math.PI;
    const l = 4 + rnd() * 14;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + rnd() * 3, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  fiberPattern = c;
  return c;
}

function project(p: V3, cosY: number, sinY: number, cosP: number, sinP: number, u: number, ox: number, oy: number): V2 {
  const xr = p[0] * cosY + p[2] * sinY;
  const zr = -p[0] * sinY + p[2] * cosY;
  const ys = p[1] * cosP - zr * sinP;
  return [ox + xr * u, oy - ys * u];
}

interface Face {
  key: "front" | "right" | "back" | "left";
  /** outward normal in object space (x, z) */
  n: [number, number];
  tl: V3;
  tr: V3;
  bl: V3;
}

const FACES: Face[] = [
  { key: "front", n: [0, 1], tl: [-HALF, HEIGHT, HALF], tr: [HALF, HEIGHT, HALF], bl: [-HALF, 0, HALF] },
  { key: "right", n: [1, 0], tl: [HALF, HEIGHT, HALF], tr: [HALF, HEIGHT, -HALF], bl: [HALF, 0, HALF] },
  { key: "back", n: [0, -1], tl: [HALF, HEIGHT, -HALF], tr: [-HALF, HEIGHT, -HALF], bl: [HALF, 0, -HALF] },
  { key: "left", n: [-1, 0], tl: [-HALF, HEIGHT, -HALF], tr: [-HALF, HEIGHT, HALF], bl: [-HALF, 0, -HALF] },
];

function quad(ctx: CanvasRenderingContext2D, a: V2, b: V2, c: V2, d: V2) {
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.lineTo(c[0], c[1]);
  ctx.lineTo(d[0], d[1]);
  ctx.closePath();
}

/** Map texture space (0..TEX_W, 0..TEX_H) onto the parallelogram tl/tr/bl */
function faceTransform(ctx: CanvasRenderingContext2D, tl: V2, tr: V2, bl: V2) {
  ctx.transform(
    (tr[0] - tl[0]) / TEX_W,
    (tr[1] - tl[1]) / TEX_W,
    (bl[0] - tl[0]) / TEX_H,
    (bl[1] - tl[1]) / TEX_H,
    tl[0],
    tl[1],
  );
}

function drawSparkles(ctx: CanvasRenderingContext2D, cx: number, cy: number, u: number, time: number, seed: number, light: string, alpha: number) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 7; i++) {
    const a = time * 0.5 + (i / 7) * Math.PI * 2 + seed;
    const r = u * (2.3 + Math.sin(time * 1.3 + i) * 0.25);
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r * 0.45 - u * 0.4;
    const s = u * (0.06 + 0.035 * Math.sin(time * 3 + i * 2));
    ctx.globalAlpha = alpha * (0.55 + 0.45 * Math.sin(time * 2.4 + i));
    ctx.fillStyle = "#fff6d8";
    ctx.beginPath();
    ctx.moveTo(x, y - s * 2);
    ctx.quadraticCurveTo(x, y, x + s * 2, y);
    ctx.quadraticCurveTo(x, y, x, y + s * 2);
    ctx.quadraticCurveTo(x, y, x - s * 2, y);
    ctx.quadraticCurveTo(x, y, x, y - s * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
  for (let i = 0; i < 4; i++) {
    const a = -time * 0.3 + (i / 4) * Math.PI * 2 + seed * 2;
    const r = u * 1.9;
    const x = cx + Math.cos(a) * r;
    const y = cy + u * 0.35 + Math.sin(a) * r * 0.3;
    ctx.globalAlpha = alpha * 0.85;
    ctx.fillStyle = i % 2 ? "#ffb3c7" : "#ffd1dc";
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a * 2);
    ctx.beginPath();
    ctx.ellipse(0, 0, u * 0.14, u * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  void light;
}

/**
 * Draws one cube lantern. Returns its screen bounding box (for hit testing).
 */
export function drawLantern(ctx: CanvasRenderingContext2D, p: DrawLanternParams): ScreenRect {
  const design = LANTERN_DESIGNS[p.design];
  const u = p.size / 2;
  const cosY = Math.cos(p.yaw);
  const sinY = Math.sin(p.yaw);
  const cosP = Math.cos(p.pitch);
  const sinP = Math.sin(p.pitch);
  const glow = p.glow;
  const highlight = p.highlight ?? 0;
  const simple = p.size < 26;

  ctx.save();
  ctx.globalAlpha = p.alpha;
  if (p.roll) {
    ctx.translate(p.x, p.y);
    ctx.rotate(p.roll);
    ctx.translate(-p.x, -p.y);
  }
  const P = (v: V3) => project(v, cosY, sinY, cosP, sinP, u, p.x, p.y);

  const lit = mixHex(design.paperLit, p.light, 0.5);
  const dimPaper = mixHex(design.paper, "#20160c", 0.55);
  const paperLit = mixHex(dimPaper, lit, glow);
  const paperMid = mixHex(dimPaper, mixHex(design.paper, p.light, 0.45), glow);
  const paperEdge = mixHex(dimPaper, mixHex(mixHex(design.paper, p.light, 0.3), "#3a1c06", 0.45), glow);

  // ---------- halo ----------
  if (p.halo !== false && glow > 0.02) {
    const sprite = glowSprite(p.light);
    const r = u * (6.5 + highlight * 2.5) * (0.6 + 0.4 * glow);
    const [hx, hy] = P([0, HEIGHT * 0.45, 0]);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = p.alpha * glow * (0.5 + highlight * 0.35);
    ctx.drawImage(sprite, hx - r, hy - r, r * 2, r * 2);
    ctx.restore();
  }

  // ---------- wooden base ----------
  if (!simple) {
    const b = 1.28;
    const bh = -0.16;
    const top: V3[] = [[-b, 0, b], [b, 0, b], [b, 0, -b], [-b, 0, -b]];
    const bottom: V3[] = top.map((v) => [v[0], bh, v[2]] as V3);
    const sides: Array<[number, number, [number, number]]> = [
      [0, 1, [0, 1]],
      [1, 2, [1, 0]],
      [2, 3, [0, -1]],
      [3, 0, [-1, 0]],
    ];
    for (const [i, j, n] of sides) {
      const nzr = -n[0] * sinY + n[1] * cosY;
      if (nzr <= 0) continue;
      ctx.fillStyle = mixHex(design.base, "#000000", 0.35 - nzr * 0.15);
      quad(ctx, P(top[i]), P(top[j]), P(bottom[j]), P(bottom[i]));
      ctx.fill();
    }
    ctx.fillStyle = mixHex(design.base, p.light, 0.18 * glow);
    quad(ctx, P(top[0]), P(top[1]), P(top[2]), P(top[3]));
    ctx.fill();
  }

  // classify faces
  const faces = FACES.map((f) => {
    const nzr = -f.n[0] * sinY + f.n[1] * cosY;
    return { f, nzr };
  });

  // ---------- inner walls (seen through the open top) ----------
  for (const { f, nzr } of faces) {
    if (nzr > 0) continue;
    const tl = P(f.tl);
    const tr = P(f.tr);
    const bl = P(f.bl);
    const br: V2 = [tr[0] + bl[0] - tl[0], tr[1] + bl[1] - tl[1]];
    const g = ctx.createLinearGradient(0, tl[1], 0, bl[1]);
    g.addColorStop(0, mixHex(dimPaper, design.inner, glow * 0.85));
    g.addColorStop(1, mixHex(dimPaper, mixHex(design.inner, "#ffffff", 0.5), glow));
    ctx.fillStyle = g;
    quad(ctx, tl, tr, br, bl);
    ctx.fill();
  }

  // candle flame inside
  if (glow > 0.05 && !simple) {
    const [fx, fy] = P([0, 0.32, 0]);
    const flick = 1 + Math.sin(p.time * 13 + (p.seed ?? 0)) * 0.08 + Math.sin(p.time * 7.3) * 0.05;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const fr = u * 0.6 * flick;
    const sprite = glowSprite("#ffd27a");
    ctx.globalAlpha = p.alpha * glow;
    ctx.drawImage(sprite, fx - fr, fy - fr * 1.2, fr * 2, fr * 2);
    ctx.fillStyle = "#fff4d6";
    ctx.beginPath();
    ctx.ellipse(fx, fy - u * 0.08, u * 0.06, u * 0.14 * flick, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ---------- outer paper walls ----------
  const visible = faces.filter((x) => x.nzr > 0).sort((a, b) => a.nzr - b.nzr);
  for (const { f, nzr } of visible) {
    const tl = P(f.tl);
    const tr = P(f.tr);
    const bl = P(f.bl);
    const br: V2 = [tr[0] + bl[0] - tl[0], tr[1] + bl[1] - tl[1]];

    ctx.save();
    quad(ctx, tl, tr, br, bl);
    ctx.clip();
    ctx.save();
    faceTransform(ctx, tl, tr, bl);
    const shade = 0.72 + 0.28 * nzr;
    const g = ctx.createRadialGradient(TEX_W * 0.5, TEX_H * 1.02, TEX_W * 0.05, TEX_W * 0.5, TEX_H * 0.85, TEX_H * 1.15);
    g.addColorStop(0, mixHex(paperLit, "#fff7e2", 0.45 * glow));
    g.addColorStop(0.3, paperLit);
    g.addColorStop(0.68, mixHex(paperMid, "#000000", 1 - shade));
    g.addColorStop(1, mixHex(paperEdge, "#000000", (1 - shade) + 0.08));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, TEX_W, TEX_H);

    if (!simple) {
      ctx.globalAlpha = p.alpha * 0.6;
      ctx.drawImage(fiberCanvas(), 0, 0, TEX_W, TEX_H);
      ctx.globalAlpha = p.alpha;
      const tex = p.textures ? (f.key === "front" ? p.textures.front : f.key === "back" ? null : p.textures.side) : null;
      if (tex) {
        ctx.globalAlpha = p.alpha * (0.55 + 0.4 * glow);
        ctx.drawImage(tex, 0, 0, TEX_W, TEX_H);
        ctx.globalAlpha = p.alpha;
      }
      // darker edges where the paper folds
      const eg = ctx.createLinearGradient(0, 0, TEX_W, 0);
      eg.addColorStop(0, "rgba(60, 30, 5, 0.22)");
      eg.addColorStop(0.08, "rgba(60, 30, 5, 0)");
      eg.addColorStop(0.92, "rgba(60, 30, 5, 0)");
      eg.addColorStop(1, "rgba(60, 30, 5, 0.22)");
      ctx.fillStyle = eg;
      ctx.fillRect(0, 0, TEX_W, TEX_H);
    }
    ctx.restore();
    ctx.restore();

    // outline
    if (!simple) {
      ctx.strokeStyle = rgba(mixHex(design.paper, "#3a2410", 0.5), 0.35);
      ctx.lineWidth = Math.max(0.5, u * 0.018);
      quad(ctx, tl, tr, br, bl);
      ctx.stroke();
    }
  }

  // ---------- top rim ----------
  const topCorners = [P([-HALF, HEIGHT, HALF]), P([HALF, HEIGHT, HALF]), P([HALF, HEIGHT, -HALF]), P([-HALF, HEIGHT, -HALF])];
  ctx.strokeStyle = rgba(mixHex(design.paperLit, p.light, 0.4), 0.55 + 0.4 * glow);
  ctx.lineWidth = Math.max(0.6, u * 0.035);
  ctx.lineJoin = "round";
  quad(ctx, topCorners[0], topCorners[1], topCorners[2], topCorners[3]);
  ctx.stroke();

  // light shining through the paper near the candle
  if (glow > 0.05) {
    const [sx, sy] = P([0, 0.35, HALF * 0.7]);
    const sr = u * 1.15;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = p.alpha * glow * 0.32;
    ctx.drawImage(glowSprite(p.light), sx - sr, sy - sr * 0.9, sr * 2, sr * 1.8);
    ctx.restore();
  }

  if (p.decoration === "sparkle-petals" && !simple) {
    const [cx, cy] = P([0, HEIGHT * 0.5, 0]);
    drawSparkles(ctx, cx, cy, u, p.time, p.seed ?? 0, p.light, p.alpha);
  }

  ctx.restore();

  // bounding box
  const pts = [
    ...topCorners,
    P([-HALF, 0, HALF]),
    P([HALF, 0, HALF]),
    P([HALF, 0, -HALF]),
    P([-HALF, 0, -HALF]),
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [px, py] of pts) {
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Soft light halo around a lantern – drawn in its own pass so it never washes over other lanterns */
export function drawHalo(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, light: string, glow: number, alpha: number, strength = 1) {
  if (glow < 0.02 || alpha < 0.02) return;
  const r = size * 3.2 * (0.6 + 0.4 * glow);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = Math.min(1, alpha * glow * 0.5 * strength);
  ctx.drawImage(glowSprite(light), x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

/** Broken, wobbling reflection of the lantern light on the water */
export function drawReflection(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  light: string,
  glow: number,
  alpha: number,
  time: number,
  seed: number,
) {
  if (glow < 0.03 || alpha < 0.02) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const sprite = glowSprite(light);
  const a = alpha * glow;
  // long vertical glow streak
  ctx.globalAlpha = a * 0.42;
  const rw = size * 1.25;
  const rh = size * 3.2;
  ctx.drawImage(sprite, x - rw / 2, y - size * 0.25, rw, rh);
  ctx.globalAlpha = a * 0.25;
  ctx.drawImage(sprite, x - size * 1.4, y - size * 0.3, size * 2.8, size * 1.2);

  ctx.fillStyle = rgba(mixHex(light, "#ffffff", 0.3), 1);
  const bars = size < 30 ? 3 : 7;
  for (let i = 0; i < bars; i++) {
    const t = time * (1.1 + i * 0.13) + seed + i * 1.7;
    const by = y + size * (0.1 + i * 0.17 + i * i * 0.012);
    const bw = size * (1.05 - i * 0.1) * (0.6 + 0.4 * Math.sin(t));
    const bx = x + Math.sin(t * 0.8) * size * 0.12;
    const bh = Math.max(0.6, size * (0.022 - i * 0.002));
    ctx.globalAlpha = a * (0.3 - i * 0.035);
    ctx.beginPath();
    ctx.ellipse(bx, by, Math.max(1, bw / 2), bh, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
