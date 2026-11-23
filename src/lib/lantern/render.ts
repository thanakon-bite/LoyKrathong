import type { EffectId, LanternDesignId, LanternShapeId } from "@/types/lantern";
import { fiberCanvas, glowSprite } from "./render-sprites";
import { drawEffects, drawOfferingBadge } from "./effects";

export { glowSprite };
import { mixHex, rgba } from "@/lib/utils";
import { LANTERN_DESIGNS } from "./designs";
import { FACE_ASPECT, TEX_H, TEX_W, type FaceTextures } from "./texture";
import { drawKrathongBack, drawKrathongFront, KRATHONG_RADIUS, KRATHONG_TOP, type KrathongParams } from "./krathong-base";
import { insidePoly, panelToTexture, SHAPES, shapePanel, traceShape, type ShapeDef } from "./shapes";

/**
 * Paper lantern renderer (Canvas 2D).
 * The lantern is projected orthographically (rotation + camera pitch). The classic cube has
 * parallelogram faces, so face textures are mapped exactly with an affine transform; the
 * silhouette lanterns (heart / moon / rabbit, see shapes.ts) are flat extrusions whose front and
 * back panels are planes as well, so the same affine mapping applies to them.
 * Every lantern stands on a traditional banana-leaf krathong (krathong-base.ts).
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
  /** krathong silhouette – default "box" (the classic cube) */
  shape?: LanternShapeId;
  light: string;
  /** paid add-on effects */
  effects?: EffectId[];
  /** money put into the lantern – shown as a coin badge above it */
  offering?: number;
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

const BAKE_RES = 0.5;
const plainFaces = new Map<string, HTMLCanvasElement>();
const bakedFaces = new WeakMap<HTMLCanvasElement, { key: string; canvas: HTMLCanvasElement }>();

/** Paper face fully lit (glow = 1): gradient + fibres + ink + fold shading, rendered once */
function bakeFace(design: LanternDesignId, light: string, ink: HTMLCanvasElement | null) {
  const d = LANTERN_DESIGNS[design];
  const c = document.createElement("canvas");
  c.width = Math.round(TEX_W * BAKE_RES);
  c.height = Math.round(TEX_H * BAKE_RES);
  const g = c.getContext("2d")!;
  g.scale(BAKE_RES, BAKE_RES);
  const lit = mixHex(d.paperLit, light, 0.5);
  const mid = mixHex(d.paper, light, 0.45);
  const edge = mixHex(mixHex(d.paper, light, 0.3), "#3a1c06", 0.45);
  const grad = g.createRadialGradient(TEX_W * 0.5, TEX_H * 1.02, TEX_W * 0.05, TEX_W * 0.5, TEX_H * 0.85, TEX_H * 1.15);
  grad.addColorStop(0, mixHex(lit, "#fff7e2", 0.45));
  grad.addColorStop(0.3, lit);
  grad.addColorStop(0.68, mid);
  grad.addColorStop(1, mixHex(edge, "#000000", 0.08));
  g.fillStyle = grad;
  g.fillRect(0, 0, TEX_W, TEX_H);
  g.globalAlpha = 0.6;
  g.drawImage(fiberCanvas(), 0, 0, TEX_W, TEX_H);
  g.globalAlpha = 0.95;
  if (ink) g.drawImage(ink, 0, 0, TEX_W, TEX_H);
  g.globalAlpha = 1;
  const eg = g.createLinearGradient(0, 0, TEX_W, 0);
  eg.addColorStop(0, "rgba(60, 30, 5, 0.22)");
  eg.addColorStop(0.08, "rgba(60, 30, 5, 0)");
  eg.addColorStop(0.92, "rgba(60, 30, 5, 0)");
  eg.addColorStop(1, "rgba(60, 30, 5, 0.22)");
  g.fillStyle = eg;
  g.fillRect(0, 0, TEX_W, TEX_H);
  return c;
}

function bakedFace(design: LanternDesignId, light: string, ink: HTMLCanvasElement | null): HTMLCanvasElement {
  const key = `${design}|${light}`;
  if (!ink) {
    let c = plainFaces.get(key);
    if (!c) {
      c = bakeFace(design, light, null);
      plainFaces.set(key, c);
    }
    return c;
  }
  // ink canvases are reused/pooled – the version counter invalidates the bake when content changes
  const version = (ink as HTMLCanvasElement & { __v?: number }).__v ?? 0;
  const fullKey = `${key}|${version}`;
  const hit = bakedFaces.get(ink);
  if (hit && hit.key === fullKey) return hit.canvas;
  const canvas = bakeFace(design, light, ink);
  bakedFaces.set(ink, { key: fullKey, canvas });
  return canvas;
}

type Proj = (v: V3) => V2;

interface BodyCtx {
  p: DrawLanternParams;
  u: number;
  cosY: number;
  sinY: number;
  cosP: number;
  sinP: number;
  glow: number;
  simple: boolean;
  P: Proj;
}

/**
 * Draws one lantern on its krathong. Returns its screen bounding box (for hit testing).
 */
export function drawLantern(ctx: CanvasRenderingContext2D, p: DrawLanternParams): ScreenRect {
  const u = p.size / 2;
  const cosY = Math.cos(p.yaw);
  const sinY = Math.sin(p.yaw);
  const cosP = Math.cos(p.pitch);
  const sinP = Math.sin(p.pitch);
  const glow = p.glow;
  const highlight = p.highlight ?? 0;
  const simple = p.size < 26;
  const shape = p.shape && p.shape !== "box" ? SHAPES[p.shape] : null;

  ctx.save();
  ctx.globalAlpha = p.alpha;
  if (p.roll) {
    ctx.translate(p.x, p.y);
    ctx.rotate(p.roll);
    ctx.translate(-p.x, -p.y);
  }
  const P: Proj = (v: V3) => project(v, cosY, sinY, cosP, sinP, u, p.x, p.y);
  const b: BodyCtx = { p, u, cosY, sinY, cosP, sinP, glow, simple, P };

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

  // top of the lantern on screen (for effects and the offering badge)
  let topY: number;
  if (shape) {
    const t = shape.depth;
    topY = Math.min(P([0, shape.bbox.y1, t])[1], P([0, shape.bbox.y1, -t])[1]);
  } else {
    topY = P([0, HEIGHT, -HALF])[1];
  }
  // cy stays FACE_ASPECT above the water for every shape: effects derive the camera tilt from it
  const fxFrame = () => {
    const [cx, cy] = P([0, HEIGHT * 0.5, 0]);
    return { cx, cy, top: topY, base: p.y, u, time: p.time, seed: p.seed ?? 0, alpha: p.alpha };
  };
  if (p.effects?.length && !simple) drawEffects(ctx, p.effects, fxFrame(), "back");

  // ---------- krathong (back half) ----------
  const kp: KrathongParams = { x: p.x, y: p.y, u, yaw: p.yaw, pitch: p.pitch, light: p.light, glow, alpha: p.alpha, time: p.time, seed: p.seed ?? 0, inner: !!shape };
  drawKrathongBack(ctx, kp);

  if (shape) drawShapeBody(ctx, b, shape);
  else drawBoxBody(ctx, b);

  // ---------- krathong (front petals + flowers) ----------
  drawKrathongFront(ctx, kp);

  if (p.effects?.length && !simple) {
    drawEffects(ctx, p.effects, fxFrame(), "front");
  }

  ctx.restore();

  if (p.offering && p.offering > 0 && p.size >= 16) {
    const [bx] = P([0, HEIGHT, 0]);
    drawOfferingBadge(ctx, p.offering, bx, topY, u, p.alpha, p.time);
  }

  // bounding box: lantern body + the petal ring on the water
  const pts: V2[] = [];
  if (shape) {
    const { x0, x1, y0, y1 } = shape.bbox;
    const t = shape.depth;
    for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [t, -t]) pts.push(P([x, y, z]));
  } else {
    for (const x of [-HALF, HALF]) for (const y of [0, HEIGHT]) for (const z of [-HALF, HALF]) pts.push(P([x, y, z]));
  }
  let minX = p.x - KRATHONG_RADIUS * u;
  let maxX = p.x + KRATHONG_RADIUS * u;
  let minY = p.y - (KRATHONG_TOP * cosP + KRATHONG_RADIUS * sinP) * u;
  let maxY = p.y + KRATHONG_RADIUS * sinP * u;
  for (const [px, py] of pts) {
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
  }
  if (p.roll) {
    // rotate the box corners around the anchor and take their bounds
    const c = Math.cos(p.roll);
    const s = Math.sin(p.roll);
    const xs: number[] = [];
    const ys: number[] = [];
    for (const [qx, qy] of [
      [minX, minY],
      [maxX, minY],
      [minX, maxY],
      [maxX, maxY],
    ]) {
      const dx = qx - p.x;
      const dy = qy - p.y;
      xs.push(p.x + dx * c - dy * s);
      ys.push(p.y + dx * s + dy * c);
    }
    minX = Math.min(...xs);
    maxX = Math.max(...xs);
    minY = Math.min(...ys);
    maxY = Math.max(...ys);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** The classic open-top cube */
function drawBoxBody(ctx: CanvasRenderingContext2D, b: BodyCtx) {
  const { p, u, cosY, sinY, glow, simple, P } = b;
  const design = LANTERN_DESIGNS[p.design];
  const dimPaper = mixHex(design.paper, "#20160c", 0.55);

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

    // back face mirrors the side writing so a full 360° spin never shows an empty wall
    const tex = p.textures ? (f.key === "front" ? p.textures.front : p.textures.side) : null;
    const baked = bakedFace(p.design, p.light, simple ? null : tex);
    ctx.save();
    faceTransform(ctx, tl, tr, bl);
    ctx.drawImage(baked, 0, 0, TEX_W, TEX_H);
    // side shading + dimming while the candle ignites / fades – one cheap overlay
    const dark = (1 - (0.72 + 0.28 * nzr)) * 0.9 + (1 - glow) * 0.62;
    if (dark > 0.01) {
      ctx.fillStyle = `rgba(28, 18, 8, ${Math.min(0.85, dark)})`;
      ctx.fillRect(0, 0, TEX_W, TEX_H);
    }
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
}

/** screen-space basis of the object axes (x, y, z) for the current view */
function axes(u: number, cosY: number, sinY: number, cosP: number, sinP: number) {
  return {
    ex: [u * cosY, -u * sinY * sinP] as V2,
    ey: [0, -u * cosP] as V2,
    ez: [u * sinY, u * cosY * sinP] as V2,
  };
}

/** Silhouette lantern: back/side paper band, then the panel facing the camera */
function drawShapeBody(ctx: CanvasRenderingContext2D, b: BodyCtx, s: ShapeDef) {
  const { p, u, cosY, sinY, cosP, sinP, glow, simple, P } = b;
  const design = LANTERN_DESIGNS[p.design];
  const t = s.depth;
  const frontSide = cosY >= 0;
  const zn = frontSide ? t : -t;
  const facing = Math.abs(cosY);
  const { ex, ey, ez } = axes(u, cosY, sinY, cosP, sinP);
  const ox = p.x;
  const oy = p.y;
  const dim = (c: string) => (glow < 0.99 ? mixHex(c, "#1c120a", (1 - glow) * 0.62) : c);

  // ---------- paper band joining the two panels ----------
  const poly = p.size < 80 ? s.coarse : s.fine;
  const n = poly.length / 2;
  const fx = ez[0] * t;
  const fy = ez[1] * t;
  const all = new Path2D();
  const lit1 = new Path2D();
  const lit2 = new Path2D();
  const rib = simple ? null : new Path2D();
  let ribOpen = false;
  let any = false;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x0 = poly[i * 2];
    const y0 = poly[i * 2 + 1];
    const x1 = poly[j * 2];
    const y1 = poly[j * 2 + 1];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = dy / len;
    const ny = -dx / len;
    const dz = ny * sinP - nx * sinY * cosP;
    if (dz <= 0) {
      ribOpen = false;
      continue;
    }
    any = true;
    const ax = ox + x0 * ex[0] + y0 * ey[0];
    const ay = oy + x0 * ex[1] + y0 * ey[1];
    const bx = ox + x1 * ex[0] + y1 * ey[0];
    const by = oy + x1 * ex[1] + y1 * ey[1];
    for (const path of dz > 0.8 ? [all, lit1, lit2] : dz > 0.45 ? [all, lit1] : [all]) {
      path.moveTo(ax + fx, ay + fy);
      path.lineTo(bx + fx, by + fy);
      path.lineTo(bx - fx, by - fy);
      path.lineTo(ax - fx, ay - fy);
      path.closePath();
    }
    if (rib) {
      if (!ribOpen) rib.moveTo(ax, ay);
      rib.lineTo(bx, by);
      ribOpen = true;
    }
  }
  if (any) {
    const lit = mixHex(design.paperLit, p.light, 0.5);
    const mid = mixHex(design.paper, p.light, 0.45);
    ctx.fillStyle = dim(mixHex(mid, "#3a1c06", 0.2));
    ctx.fill(all);
    ctx.globalAlpha = p.alpha * 0.75;
    ctx.fillStyle = dim(mixHex(mid, lit, 0.35));
    ctx.fill(lit1);
    ctx.fillStyle = dim(mixHex(mid, lit, 0.8));
    ctx.fill(lit2);
    ctx.globalAlpha = p.alpha;
    if (rib) {
      ctx.strokeStyle = rgba(mixHex(design.paper, "#3a2410", 0.55), 0.35);
      ctx.lineWidth = Math.max(0.5, u * 0.014);
      ctx.stroke(rib);
    }
  }

  // ---------- panel facing the camera ----------
  const tex = !simple && p.textures ? (frontSide ? p.textures.front : p.textures.side) : null;
  const baked = shapePanel(s, p.design, p.light, tex, frontSide ? "front" : "back", simple);
  const sgn = frontSide ? 1 : -1;
  ctx.save();
  // panel-local coordinates: x as seen on that panel, y up
  ctx.transform(ex[0] * sgn, ex[1] * sgn, ey[0], ey[1], ox + zn * ez[0], oy + zn * ez[1]);
  ctx.save();
  const S = baked.scale;
  ctx.transform(1 / S, 0, 0, -1 / S, s.bbox.x0 - 1 / S, s.bbox.y1 + 1 / S);
  ctx.drawImage(baked.canvas, 0, 0);
  ctx.restore();
  ctx.beginPath();
  traceShape(ctx, s);
  ctx.restore();
  const dark = (1 - (0.72 + 0.28 * facing)) * 0.9 + (1 - glow) * 0.62;
  if (dark > 0.01) {
    ctx.fillStyle = `rgba(28, 18, 8, ${Math.min(0.85, dark)})`;
    ctx.fill();
  }
  // rim highlight where the paper folds over the frame
  ctx.strokeStyle = rgba(mixHex(design.paperLit, p.light, 0.4), (0.45 + 0.4 * glow) * (0.4 + 0.6 * facing));
  ctx.lineWidth = Math.max(0.6, u * (simple ? 0.03 : 0.028));
  ctx.lineJoin = "round";
  ctx.stroke();

  if (glow > 0.05) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    // light bleeding through the paper around the candle
    const flick = 1 + Math.sin(p.time * 9 + (p.seed ?? 0)) * 0.04 + Math.sin(p.time * 5.3) * 0.03;
    const [sx, sy] = P([0, s.candleY, zn * 0.6]);
    const sr = u * 1.2 * flick;
    ctx.globalAlpha = p.alpha * glow * 0.34;
    ctx.drawImage(glowSprite(p.light), sx - sr, sy - sr * 0.9, sr * 2, sr * 1.8);
    if (s.id === "moon" && !simple) {
      // faint lunar halo ring in the panel plane
      const cy = (s.bbox.y0 + s.bbox.y1) / 2;
      const r = s.bbox.x1 * 1.16;
      ctx.save();
      ctx.transform(ex[0], ex[1], ey[0], ey[1], ox, oy);
      ctx.beginPath();
      ctx.arc(0, cy, r, 0, Math.PI * 2);
      ctx.restore();
      ctx.globalAlpha = p.alpha * glow * 0.14;
      ctx.strokeStyle = mixHex(p.light, "#fff6dc", 0.5);
      ctx.lineWidth = Math.max(0.8, u * 0.035);
      ctx.stroke();
      ctx.globalAlpha = p.alpha * glow * 0.07;
      ctx.lineWidth = Math.max(1.5, u * 0.14);
      ctx.stroke();
    }
    ctx.restore();
  }
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

export interface FacePick {
  face: "front" | "right" | "back" | "left";
  /** point in face-texture space (0…TEX_W, 0…TEX_H) */
  u: number;
  v: number;
}

/**
 * Inverse of drawLantern's face mapping: which paper wall (and which point on its texture)
 * is under the screen point (sx, sy). Used to open a preview of the photo / sticker / text a visitor taps.
 */
export function pickLanternFace(
  p: Pick<DrawLanternParams, "x" | "y" | "size" | "yaw" | "pitch" | "roll" | "shape">,
  sx: number,
  sy: number,
): FacePick | null {
  const u = p.size / 2;
  const cosY = Math.cos(p.yaw);
  const sinY = Math.sin(p.yaw);
  const cosP = Math.cos(p.pitch);
  const sinP = Math.sin(p.pitch);
  // undo the roll around the water-line anchor
  if (p.roll) {
    const c = Math.cos(-p.roll);
    const s = Math.sin(-p.roll);
    const dx = sx - p.x;
    const dy = sy - p.y;
    sx = p.x + dx * c - dy * s;
    sy = p.y + dx * s + dy * c;
  }
  if (p.shape && p.shape !== "box") return pickShape(SHAPES[p.shape], p, u, cosY, sinY, cosP, sinP, sx, sy);
  const P = (v: V3) => project(v, cosY, sinY, cosP, sinP, u, p.x, p.y);
  // nearest visible wall first
  const visible = FACES.map((f) => ({ f, nzr: -f.n[0] * sinY + f.n[1] * cosY }))
    .filter((x) => x.nzr > 0)
    .sort((a, b) => b.nzr - a.nzr);
  for (const { f } of visible) {
    const tl = P(f.tl);
    const tr = P(f.tr);
    const bl = P(f.bl);
    const ax = tr[0] - tl[0];
    const ay = tr[1] - tl[1];
    const bx = bl[0] - tl[0];
    const by = bl[1] - tl[1];
    const det = ax * by - ay * bx;
    if (Math.abs(det) < 1e-6) continue;
    const px = sx - tl[0];
    const py = sy - tl[1];
    const a = (px * by - py * bx) / det;
    const b = (ax * py - ay * px) / det;
    if (a >= 0 && a <= 1 && b >= 0 && b <= 1) return { face: f.key, u: a * TEX_W, v: b * TEX_H };
  }
  return null;
}

const clampTex = (v: number, max: number) => (v < 0 ? 0 : v > max ? max : v);

/** pick on a silhouette lantern: the panel facing the camera, else the paper band (→ side message) */
function pickShape(s: ShapeDef, p: { x: number; y: number }, u: number, cosY: number, sinY: number, cosP: number, sinP: number, sx: number, sy: number): FacePick | null {
  const { ex, ey, ez } = axes(u, cosY, sinY, cosP, sinP);
  const frontSide = cosY >= 0;
  const t = s.depth;
  const zn = frontSide ? t : -t;
  const bandHit = (x: number, y: number): FacePick => ({
    face: x >= 0 ? "right" : "left",
    u: TEX_W / 2,
    v: clampTex(panelToTexture(s, 0, y)[1], TEX_H),
  });
  if (Math.abs(cosY) < 0.03) {
    // edge-on: only the band is visible
    const z = (sx - p.x) / (u * sinY);
    const y = (p.y - sy) / (u * cosP);
    if (Math.abs(z) <= t * 1.05 && y >= s.bbox.y0 && y <= s.bbox.y1) return bandHit(sinY > 0 ? 1 : -1, y);
    return null;
  }
  // nearest plane first (the panel), then slices through the band
  for (const k of [1, 0.5, 0, -0.5, -1]) {
    const z = zn * k;
    const dx = sx - p.x - z * ez[0];
    const dy = sy - p.y - z * ez[1];
    const x = dx / ex[0];
    const y = (dy - x * ex[1]) / ey[1];
    if (!insidePoly(s.fine, x, y)) continue;
    if (k === 1) {
      const [tu, tv] = panelToTexture(s, frontSide ? x : -x, y);
      return { face: frontSide ? "front" : "back", u: clampTex(tu, TEX_W), v: clampTex(tv, TEX_H) };
    }
    return bandHit(x, y);
  }
  return null;
}
