import type { LanternDesignId, LanternShapeId } from "@/types/lantern";
import { mixHex } from "@/lib/utils";
import { LANTERN_DESIGNS } from "./designs";
import { fiberCanvas } from "./render-sprites";
import { TEX_H, TEX_W } from "./texture";

/**
 * Silhouette lanterns (heart / full moon / moon rabbit).
 * Each one is a thick paper lantern: a flat silhouette extruded along z (front panel at +depth,
 * back panel at −depth, a paper band joining them). Object units match the cube renderer:
 * x right, y up (0 = water line / krathong top), the cube is 2 wide and 2.2 tall.
 * All silhouettes are mirror-symmetric around x = 0, so the back panel uses the same outline.
 */

export type ShapedId = Exclude<LanternShapeId, "box">;

/** cubic segment: control 1, control 2, end point */
type Seg = [number, number, number, number, number, number];

export interface ShapeDef {
  id: ShapedId;
  /** contour start on the axis (bottom) */
  start: [number, number];
  /** right half from `start` to the top point on the axis (x = 0) */
  right: Seg[];
  /** half thickness (z) */
  depth: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  /** where the TEX_W × TEX_H face texture is placed on the panel (object units, centre + width) */
  rect: { cx: number; cy: number; w: number; h: number };
  /** candle height inside the lantern */
  candleY: number;
  /** closed polygon (CCW, x/y pairs) – fine and coarse */
  fine: Float32Array;
  coarse: Float32Array;
}

function makeShape(id: ShapedId, start: [number, number], right: Seg[], depth: number, rect: { cx: number; cy: number; w: number }, candleY: number): ShapeDef {
  const fine = flatten(start, right, 10);
  const coarse = flatten(start, right, 3);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < fine.length; i += 2) {
    x0 = Math.min(x0, fine[i]);
    x1 = Math.max(x1, fine[i]);
    y0 = Math.min(y0, fine[i + 1]);
    y1 = Math.max(y1, fine[i + 1]);
  }
  return {
    id,
    start,
    right,
    depth,
    bbox: { x0, y0, x1, y1 },
    rect: { ...rect, h: (rect.w * TEX_H) / TEX_W },
    candleY,
    fine,
    coarse,
  };
}

function cubicAt(a: number, b: number, c: number, d: number, t: number) {
  const m = 1 - t;
  return m * m * m * a + 3 * m * m * t * b + 3 * m * t * t * c + t * t * t * d;
}

/** full closed contour (right half up, mirrored left half down) as a CCW polygon */
function flatten(start: [number, number], right: Seg[], steps: number): Float32Array {
  const half: number[] = [start[0], start[1]];
  let px = start[0];
  let py = start[1];
  for (const s of right) {
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      half.push(cubicAt(px, s[0], s[2], s[4], t), cubicAt(py, s[1], s[3], s[5], t));
    }
    px = s[4];
    py = s[5];
  }
  const out = half.slice();
  // mirrored left half, walking back down (skip the shared axis points)
  for (let i = half.length - 4; i >= 2; i -= 2) out.push(-half[i], half[i + 1]);
  return new Float32Array(out);
}

/** Adds the silhouette contour to the current path (object units; caller sets the transform) */
export function traceShape(g: CanvasRenderingContext2D, s: ShapeDef) {
  g.moveTo(s.start[0], s.start[1]);
  for (const c of s.right) g.bezierCurveTo(c[0], c[1], c[2], c[3], c[4], c[5]);
  for (let i = s.right.length - 1; i >= 0; i--) {
    const c = s.right[i];
    const prev = i > 0 ? s.right[i - 1] : null;
    const ex = prev ? prev[4] : s.start[0];
    const ey = prev ? prev[5] : s.start[1];
    g.bezierCurveTo(-c[2], c[3], -c[0], c[1], -ex, ey);
  }
  g.closePath();
}

// ---------------------------------------------------------------------------------------------
// Silhouettes
// ---------------------------------------------------------------------------------------------

const K = 0.5523;
const MOON_R = 1.14;
const MOON_CY = 1.2;

export const SHAPES: Record<ShapedId, ShapeDef> = {
  heart: makeShape(
    "heart",
    [0, 0.02],
    [
      [0.5, 0.42, 1.34, 0.95, 1.3, 1.62],
      [1.27, 2.05, 1.02, 2.29, 0.72, 2.28],
      [0.38, 2.27, 0.1, 2.08, 0, 1.8],
    ],
    0.34,
    { cx: 0, cy: 1.06, w: 1.32 },
    0.55,
  ),
  moon: makeShape(
    "moon",
    [0, MOON_CY - MOON_R],
    [
      [K * MOON_R, MOON_CY - MOON_R, MOON_R, MOON_CY - K * MOON_R, MOON_R, MOON_CY],
      [MOON_R, MOON_CY + K * MOON_R, K * MOON_R, MOON_CY + MOON_R, 0, MOON_CY + MOON_R],
    ],
    0.3,
    { cx: 0, cy: MOON_CY, w: 1.5 },
    0.45,
  ),
  rabbit: makeShape(
    "rabbit",
    [0, 0.04],
    [
      [0.42, 0.02, 0.78, 0.03, 0.98, 0.09],
      [1.14, 0.15, 1.2, 0.42, 1.18, 0.74],
      [1.16, 1.1, 1.02, 1.36, 0.93, 1.5],
      [0.86, 1.6, 1.06, 1.74, 1.03, 1.96],
      [1.0, 2.16, 0.84, 2.27, 0.66, 2.3],
      [0.86, 2.6, 0.8, 3.03, 0.56, 3.06],
      [0.33, 3.09, 0.2, 2.76, 0.24, 2.4],
      [0.18, 2.37, 0.08, 2.36, 0, 2.36],
    ],
    0.36,
    { cx: 0, cy: 0.88, w: 1.3 },
    0.5,
  ),
};

/** point-in-polygon (even-odd) on a flat x/y array */
export function insidePoly(poly: Float32Array, x: number, y: number) {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const xi = poly[i];
    const yi = poly[i + 1];
    const xj = poly[j];
    const yj = poly[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** panel-local point (x right as seen on that panel, y up) → face texture coordinates */
export function panelToTexture(s: ShapeDef, lx: number, y: number): [number, number] {
  const r = s.rect;
  return [((lx - (r.cx - r.w / 2)) / r.w) * TEX_W, ((r.cy + r.h / 2 - y) / r.h) * TEX_H];
}

// ---------------------------------------------------------------------------------------------
// Baked panels (paper + ink + decoration, fully lit) – same idea as the cube's bakedFace
// ---------------------------------------------------------------------------------------------

const BAKE_RES = 0.5;
/** canvas pixels per object unit for a shape (ink keeps the cube's bake density) */
export const panelScale = (s: ShapeDef) => (TEX_W * BAKE_RES) / s.rect.w;
/** small plain panels for distant lanterns */
const SMALL_SCALE = 40;

const plainPanels = new Map<string, HTMLCanvasElement>();
const inkPanels = new WeakMap<HTMLCanvasElement, { key: string; canvas: HTMLCanvasElement }>();

export interface BakedPanel {
  canvas: HTMLCanvasElement;
  /** canvas pixels per object unit */
  scale: number;
}

export function shapePanel(
  s: ShapeDef,
  design: LanternDesignId,
  light: string,
  ink: HTMLCanvasElement | null,
  side: "front" | "back",
  small: boolean,
): BakedPanel {
  const scale = small ? SMALL_SCALE : panelScale(s);
  const key = `${s.id}|${design}|${light}|${side}|${small ? 1 : 0}`;
  if (!ink) {
    let c = plainPanels.get(key);
    if (!c) {
      c = bakePanel(s, design, light, null, side, scale);
      plainPanels.set(key, c);
    }
    return { canvas: c, scale };
  }
  const version = (ink as HTMLCanvasElement & { __v?: number }).__v ?? 0;
  const fullKey = `${key}|${version}`;
  const hit = inkPanels.get(ink);
  if (hit && hit.key === fullKey) return { canvas: hit.canvas, scale };
  const canvas = bakePanel(s, design, light, ink, side, scale);
  inkPanels.set(ink, { key: fullKey, canvas });
  return { canvas, scale };
}

function bakePanel(s: ShapeDef, designId: LanternDesignId, light: string, ink: HTMLCanvasElement | null, side: "front" | "back", S: number) {
  const d = LANTERN_DESIGNS[designId];
  const { x0, y0, x1, y1 } = s.bbox;
  const c = document.createElement("canvas");
  c.width = Math.ceil((x1 - x0) * S) + 2;
  c.height = Math.ceil((y1 - y0) * S) + 2;
  const g = c.getContext("2d")!;
  // object units, y up
  g.setTransform(S, 0, 0, -S, -x0 * S + 1, y1 * S + 1);
  g.beginPath();
  traceShape(g, s);
  g.save();
  g.clip();

  const lit = mixHex(d.paperLit, light, 0.5);
  const mid = mixHex(d.paper, light, 0.45);
  const edge = mixHex(mixHex(d.paper, light, 0.3), "#3a1c06", 0.45);
  const h = y1 - y0;
  const grad = g.createRadialGradient(0, y0 + h * 0.05, h * 0.05, 0, y0 + h * 0.2, h * 1.05);
  grad.addColorStop(0, mixHex(lit, "#fff7e2", 0.45));
  grad.addColorStop(0.3, lit);
  grad.addColorStop(0.68, mid);
  grad.addColorStop(1, mixHex(edge, "#000000", 0.08));
  g.fillStyle = grad;
  g.fillRect(x0 - 0.1, y0 - 0.1, x1 - x0 + 0.2, h + 0.2);

  decorate(g, s, d.paper, side, "under");

  g.globalAlpha = 0.6;
  g.drawImage(fiberCanvas(), x0, y0, x1 - x0, h);
  g.globalAlpha = 1;

  if (ink) {
    const r = s.rect;
    g.save();
    g.translate(r.cx - r.w / 2, r.cy + r.h / 2);
    g.scale(r.w / TEX_W, -r.h / TEX_H);
    g.globalAlpha = 0.95;
    g.drawImage(featheredInk(ink, Math.round(r.w * S)), 0, 0, TEX_W, TEX_H);
    g.restore();
  }

  decorate(g, s, d.paper, side, "over");

  // paper darkens towards the folded edge (inner vignette along the outline)
  g.beginPath();
  traceShape(g, s);
  g.strokeStyle = "rgba(60, 30, 5, 0.16)";
  g.lineWidth = 0.22;
  g.stroke();
  g.strokeStyle = "rgba(60, 30, 5, 0.14)";
  g.lineWidth = 0.09;
  g.stroke();
  g.restore();
  return c;
}

/**
 * The face artwork is laid out for a rectangular wall (border bands, deckled corners). Inside a
 * curved silhouette a hard rectangle would read as a pasted label, so its outer margin is faded.
 */
function featheredInk(ink: HTMLCanvasElement, width: number) {
  const w = Math.max(32, width);
  const h = Math.round((w * TEX_H) / TEX_W);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.drawImage(ink, 0, 0, w, h);
  g.globalCompositeOperation = "destination-in";
  const ramp = (x0: number, y0: number, x1: number, y1: number) => {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, "rgba(0,0,0,0)");
    gr.addColorStop(0.025, "rgba(0,0,0,0.15)");
    gr.addColorStop(0.1, "rgba(0,0,0,1)");
    gr.addColorStop(0.9, "rgba(0,0,0,1)");
    gr.addColorStop(0.975, "rgba(0,0,0,0.15)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  };
  ramp(0, 0, w, 0);
  ramp(0, 0, 0, h);
  return c;
}

function ellipse(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}

/** shape specific artwork printed on the paper: moon craters, rabbit face / ears / tail */
function decorate(g: CanvasRenderingContext2D, s: ShapeDef, paper: string, side: "front" | "back", layer: "under" | "over") {
  const shade = mixHex(paper, "#5a3a1a", 0.5);
  if (s.id === "moon" && layer === "under") {
    // limb darkening + soft maria and a few craters
    const lg = g.createRadialGradient(0, MOON_CY, MOON_R * 0.55, 0, MOON_CY, MOON_R);
    lg.addColorStop(0, "rgba(90, 55, 20, 0)");
    lg.addColorStop(1, "rgba(90, 55, 20, 0.2)");
    g.fillStyle = lg;
    g.fillRect(-MOON_R, MOON_CY - MOON_R, MOON_R * 2, MOON_R * 2);
    const mirror = side === "back" ? -1 : 1;
    const maria: Array<[number, number, number, number, number]> = [
      [-0.38, 1.62, 0.36, 0.26, 0.11],
      [0.1, 1.78, 0.24, 0.16, 0.09],
      [0.42, 1.32, 0.3, 0.38, 0.1],
      [-0.55, 0.95, 0.22, 0.3, 0.08],
      [0.12, 0.62, 0.34, 0.2, 0.07],
    ];
    for (const [x, y, rx, ry, a] of maria) {
      g.fillStyle = `rgba(110, 70, 30, ${a})`;
      ellipse(g, x * mirror, y, rx, ry, 0.4);
      g.fill();
    }
    const craters: Array<[number, number, number]> = [
      [0.62, 1.88, 0.09],
      [-0.78, 1.3, 0.07],
      [0.78, 0.82, 0.08],
      [-0.2, 0.4, 0.06],
      [-0.02, 2.06, 0.05],
      [0.5, 0.42, 0.05],
    ];
    for (const [x, y, r] of craters) {
      const cx = x * mirror;
      g.fillStyle = "rgba(110, 70, 30, 0.13)";
      ellipse(g, cx, y, r, r);
      g.fill();
      g.strokeStyle = "rgba(255, 248, 225, 0.22)";
      g.lineWidth = r * 0.3;
      g.beginPath();
      g.arc(cx, y, r, Math.PI * 1.1, Math.PI * 1.9, true);
      g.stroke();
    }
  }
  if (s.id === "rabbit") {
    if (layer === "under") {
      // inner ears
      for (const m of [1, -1]) {
        g.fillStyle = "rgba(255, 140, 160, 0.35)";
        g.beginPath();
        g.moveTo(0.36 * m, 2.42);
        g.bezierCurveTo(0.3 * m, 2.75, 0.4 * m, 2.98, 0.54 * m, 2.97);
        g.bezierCurveTo(0.7 * m, 2.95, 0.72 * m, 2.62, 0.6 * m, 2.36);
        g.closePath();
        g.fill();
      }
      return;
    }
    if (side === "front") {
      // sleepy happy face
      g.strokeStyle = mixHex(shade, "#2a1408", 0.6);
      g.lineCap = "round";
      g.lineWidth = 0.055;
      for (const m of [1, -1]) {
        g.beginPath();
        g.arc(0.4 * m, 1.95, 0.1, Math.PI * 1.15, Math.PI * 1.85, true);
        g.stroke();
        g.fillStyle = "rgba(255, 120, 140, 0.4)";
        ellipse(g, 0.68 * m, 1.8, 0.15, 0.08);
        g.fill();
      }
      g.fillStyle = "rgba(220, 90, 110, 0.85)";
      g.beginPath();
      g.moveTo(-0.07, 1.88);
      g.lineTo(0.07, 1.88);
      g.lineTo(0, 1.8);
      g.closePath();
      g.fill();
      g.lineWidth = 0.035;
      g.beginPath();
      g.moveTo(0, 1.8);
      g.quadraticCurveTo(-0.02, 1.72, -0.1, 1.73);
      g.moveTo(0, 1.8);
      g.quadraticCurveTo(0.02, 1.72, 0.1, 1.73);
      g.stroke();
    } else {
      // fluffy tail on the back
      g.fillStyle = "rgba(255, 252, 240, 0.45)";
      ellipse(g, 0, 0.42, 0.24, 0.22);
      g.fill();
      g.strokeStyle = "rgba(90, 55, 20, 0.18)";
      g.lineWidth = 0.03;
      g.stroke();
    }
  }
  if (s.id === "heart" && layer === "under") {
    // soft inner heart outline like a stitched paper edge
    g.save();
    g.translate(0, 1.2);
    g.scale(0.86, 0.86);
    g.translate(0, -1.2);
    g.beginPath();
    traceShape(g, s);
    g.restore();
    g.setLineDash([0.06, 0.07]);
    g.strokeStyle = "rgba(255, 245, 225, 0.35)";
    g.lineWidth = 0.025;
    g.stroke();
    g.setLineDash([]);
  }
}
