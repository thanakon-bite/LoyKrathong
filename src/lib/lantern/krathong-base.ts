import { mixHex } from "@/lib/utils";
import { cacheGet, cachePut, glowSprite, pixelScale } from "./render-sprites";

/**
 * Traditional krathong under every lantern: a banana-trunk disc floating on the water, two tiers
 * of folded banana-leaf petals around it, marigolds / orchids / jasmine on the rim and a few
 * incense sticks.
 *
 * Same projection as the lantern (object units, y up, water line at y = 0, lantern half width 1).
 * The petal rings are static geometry, so for small and medium lanterns they are pre-rendered
 * into sprites (back half + front half) keyed by size / pitch / yaw-phase / pixel-ratio bucket.
 * Because the rings are rotationally symmetric, yaw only matters modulo one petal step.
 * Big lanterns (studio preview, detail view) are painted directly with exact yaw.
 * Flowers and incense are cheap sprite blits positioned every frame.
 */

export interface BaseView {
  cosY: number;
  sinY: number;
  cosP: number;
  sinP: number;
  /** px per object unit */
  u: number;
  ox: number;
  oy: number;
}

export interface KrathongParams {
  x: number;
  y: number;
  /** px per object unit (size / 2) */
  u: number;
  yaw: number;
  pitch: number;
  light: string;
  glow: number;
  alpha: number;
  time: number;
  seed: number;
  /** add the inner ring of small leaves (slim lanterns leave the middle of the disc visible) */
  inner?: boolean;
}

/** outer radius of the petal ring (object units) – used for bounding boxes */
export const KRATHONG_RADIUS = 2.08;
/** highest point of the petal ring */
export const KRATHONG_TOP = 0.6;

const TAU = Math.PI * 2;

function proj(v: BaseView, x: number, y: number, z: number, out: number[], i: number) {
  const xr = x * v.cosY + z * v.sinY;
  const zr = -x * v.sinY + z * v.cosY;
  const ys = y * v.cosP - zr * v.sinP;
  out[i] = v.ox + xr * v.u;
  out[i + 1] = v.oy - ys * v.u;
}

// ---------------------------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------------------------

type RGB = [number, number, number];
const LEAF_DARK: RGB = [22, 58, 28];
const LEAF_MID: RGB = [52, 112, 48];
const LEAF_LIGHT: RGB = [104, 158, 66];
const LEAF_INNER: RGB = [178, 196, 92];
const WARM: RGB = [255, 206, 120];

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c: RGB) => `rgb(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0})`;

// moonlight from the upper left, in view space (x right, y up, z towards the camera)
const LX = -0.48;
const LY = 0.72;
const LZ = 0.5;

// ---------------------------------------------------------------------------------------------
// Petal rings
// ---------------------------------------------------------------------------------------------

interface Tier {
  r0: number;
  y0: number;
  r1: number;
  y1: number;
  /** half width of the leaf at its base */
  hw: number;
  /** angular offset in petal steps */
  off: number;
  /** how far the fold ridge sticks out */
  fold: number;
  /** brightness tweak */
  tone: number;
}

const TIERS: Tier[] = [
  { r0: 1.5, y0: -0.05, r1: 2.08, y1: 0.24, hw: 0.37, off: 0, fold: 0.08, tone: -0.08 },
  { r0: 1.47, y0: 0.0, r1: 1.84, y1: 0.5, hw: 0.31, off: 0.5, fold: 0.07, tone: 0.06 },
];
const INNER_TIER: Tier = { r0: 0.8, y0: 0.0, r1: 1.12, y1: 0.34, hw: 0.21, off: 0.25, fold: 0.05, tone: 0.12 };

export type BaseLod = 0 | 1 | 2;
const petalCount = (lod: BaseLod) => (lod === 0 ? 11 : 15);
/** yaw period of the (symmetric) petal rings */
const period = (lod: BaseLod) => TAU / petalCount(lod);

interface Petal {
  depth: number;
  /** screen points: BL, BR, ridge base, tip, ctrl left, ctrl right, ctrl ridge  (x,y pairs) */
  pts: number[];
  colL: string;
  colR: string;
  innerL: boolean;
  innerR: boolean;
}

function buildPetals(v: BaseView, lod: BaseLod, inner: boolean): Petal[] {
  const n = petalCount(lod);
  const petals: Petal[] = [];
  for (const t of inner ? [...TIERS, INNER_TIER] : TIERS) {
    for (let i = 0; i < n; i++) {
      const th = ((i + t.off) / n) * TAU;
      const s = Math.sin(th);
      const c = Math.cos(th);
      // radial (s, 0, c), tangent (c, 0, -s)
      const bx = t.r0 * s;
      const bz = t.r0 * c;
      const tx = t.r1 * s;
      const tz = t.r1 * c;
      // leaf direction & outward normal (in the radial / up plane)
      const dr = t.r1 - t.r0;
      const dy = t.y1 - t.y0;
      const len = Math.hypot(dr, dy);
      const nr = dy / len; // outward radial component
      const ny = -dr / len;
      const mx = (bx + tx) / 2;
      const mz = (bz + tz) / 2;
      const my = (t.y0 + t.y1) / 2;
      const pts = new Array<number>(14);
      proj(v, bx - t.hw * c, t.y0, bz + t.hw * s, pts, 0);
      proj(v, bx + t.hw * c, t.y0, bz - t.hw * s, pts, 2);
      proj(v, bx + nr * t.fold * s, t.y0 + ny * t.fold, bz + nr * t.fold * c, pts, 4);
      proj(v, tx, t.y1, tz, pts, 6);
      proj(v, mx - t.hw * 0.95 * c, my, mz + t.hw * 0.95 * s, pts, 8);
      proj(v, mx + t.hw * 0.95 * c, my, mz - t.hw * 0.95 * s, pts, 10);
      proj(v, mx + nr * t.fold * 1.6 * s, my + ny * t.fold * 1.6, mz + nr * t.fold * 1.6 * c, pts, 12);

      // view-space depth of the leaf middle
      const zr = -mx * v.sinY + mz * v.cosY;
      const depth = my * v.sinP + zr * v.cosP;

      // the two halves of the fold lean sideways
      const shadeHalf = (side: number) => {
        const k = 0.55 * side;
        // object normal = outward + k * tangent
        let ox = nr * s + k * c;
        let oy = ny;
        let oz = nr * c - k * s;
        const l = Math.hypot(ox, oy, oz);
        ox /= l;
        oy /= l;
        oz /= l;
        const vx = ox * v.cosY + oz * v.sinY;
        const vzr = -ox * v.sinY + oz * v.cosY;
        const vy = oy * v.cosP - vzr * v.sinP;
        const vz = oy * v.sinP + vzr * v.cosP;
        const inner = vz < 0;
        const sgn = inner ? -1 : 1;
        const diff = Math.max(0, sgn * (vx * LX + vy * LY + vz * LZ));
        let col: RGB;
        if (inner) {
          // inside of the leaf, facing the lantern
          col = mix(mix(LEAF_MID, LEAF_INNER, 0.2 + 0.3 * diff), WARM, 0.1);
        } else {
          col = mix(LEAF_DARK, LEAF_LIGHT, Math.min(1, 0.18 + diff * 0.85 + t.tone));
        }
        return { col: css(col), inner };
      };
      const L = shadeHalf(-1);
      const R = shadeHalf(1);
      petals.push({ depth, pts, colL: L.col, colR: R.col, innerL: L.inner, innerR: R.inner });
    }
  }
  petals.sort((a, b) => a.depth - b.depth);
  return petals;
}

function paintPetal(g: CanvasRenderingContext2D, p: Petal, lod: BaseLod, lw: number) {
  const q = p.pts;
  // left half: BL → (ctrl L) → tip → (ridge ctrl) → ridge base
  g.beginPath();
  g.moveTo(q[0], q[1]);
  g.quadraticCurveTo(q[8], q[9], q[6], q[7]);
  g.quadraticCurveTo(q[12], q[13], q[4], q[5]);
  g.closePath();
  g.fillStyle = p.colL;
  g.fill();
  // right half
  g.beginPath();
  g.moveTo(q[2], q[3]);
  g.quadraticCurveTo(q[10], q[11], q[6], q[7]);
  g.quadraticCurveTo(q[12], q[13], q[4], q[5]);
  g.closePath();
  g.fillStyle = p.colR;
  g.fill();
  if (lod === 0) return;

  if (lod === 2) {
    // parallel veins on both halves
    g.beginPath();
    for (let k = 1; k <= 4; k++) {
      const a = k / 5;
      // point on the ridge (quadratic ridge-base → ctrl → tip)
      const rx = (1 - a) * (1 - a) * q[4] + 2 * a * (1 - a) * q[12] + a * a * q[6];
      const ry = (1 - a) * (1 - a) * q[5] + 2 * a * (1 - a) * q[13] + a * a * q[7];
      const b = Math.min(1, a + 0.22);
      for (const [e0, e1, base] of [
        [8, 9, 0],
        [10, 11, 2],
      ] as const) {
        const ex = (1 - b) * (1 - b) * q[base] + 2 * b * (1 - b) * q[e0] + b * b * q[6];
        const ey = (1 - b) * (1 - b) * q[base + 1] + 2 * b * (1 - b) * q[e1] + b * b * q[7];
        g.moveTo(rx, ry);
        g.lineTo(rx + (ex - rx) * 0.85, ry + (ey - ry) * 0.85);
      }
    }
    g.strokeStyle = "rgba(14, 40, 12, 0.22)";
    g.lineWidth = lw * 0.7;
    g.stroke();
  }

  // outline + light fold ridge
  g.beginPath();
  g.moveTo(q[0], q[1]);
  g.quadraticCurveTo(q[8], q[9], q[6], q[7]);
  g.quadraticCurveTo(q[10], q[11], q[2], q[3]);
  g.strokeStyle = "rgba(8, 28, 10, 0.6)";
  g.lineWidth = lw;
  g.stroke();
  g.beginPath();
  g.moveTo(q[4], q[5]);
  g.quadraticCurveTo(q[12], q[13], q[6], q[7]);
  g.strokeStyle = p.innerL || p.innerR ? "rgba(255, 236, 170, 0.5)" : "rgba(170, 220, 120, 0.45)";
  g.lineWidth = lw * 0.9;
  g.stroke();
}

/** water contact shadow, banana-trunk disc and the back half of the petals */
function paintBack(g: CanvasRenderingContext2D, v: BaseView, petals: Petal[], lod: BaseLod) {
  const { u, ox, oy, sinP, cosP } = v;
  // contact shadow on the water
  const sr = 2.35 * u;
  g.save();
  g.globalAlpha = 0.55;
  g.drawImage(glowSprite("#000006"), ox - sr, oy - sr * sinP * 1.2, sr * 2, sr * 2 * sinP * 1.2 + u * 0.3);
  g.restore();

  // disc side (front half visible) + top
  const R = 1.52;
  const rx = R * u;
  const ry = Math.max(0.5, R * sinP * u);
  const topY = oy;
  const botY = oy + 0.12 * cosP * u;
  g.beginPath();
  g.ellipse(ox, topY, rx, ry, 0, 0, Math.PI);
  g.lineTo(ox - rx, botY);
  g.ellipse(ox, botY, rx, ry, 0, Math.PI, 0, true);
  g.closePath();
  g.fillStyle = "rgb(30, 62, 30)";
  g.fill();
  const tg = g.createRadialGradient(ox, topY, 0, ox, topY, rx);
  tg.addColorStop(0, "rgb(150, 156, 86)");
  tg.addColorStop(0.5, "rgb(64, 108, 50)");
  tg.addColorStop(1, "rgb(32, 70, 32)");
  g.fillStyle = tg;
  g.beginPath();
  g.ellipse(ox, topY, rx, ry, 0, 0, TAU);
  g.fill();
  if (lod > 0) {
    // concentric banana-trunk rings
    g.strokeStyle = "rgba(240, 236, 190, 0.18)";
    g.lineWidth = Math.max(0.5, u * 0.015);
    for (const k of [0.45, 0.72]) {
      g.beginPath();
      g.ellipse(ox, topY, rx * k, ry * k, 0, 0, TAU);
      g.stroke();
    }
  }
  const lw = Math.max(0.5, u * 0.018);
  for (const p of petals) if (p.depth < 0) paintPetal(g, p, lod, lw);
}

function paintFront(g: CanvasRenderingContext2D, petals: Petal[], lod: BaseLod, u: number) {
  const lw = Math.max(0.5, u * 0.018);
  for (const p of petals) if (p.depth >= 0) paintPetal(g, p, lod, lw);
}

// ---------------------------------------------------------------------------------------------
// Sprite cache for small / medium sizes
// ---------------------------------------------------------------------------------------------

interface BaseSprite {
  back: HTMLCanvasElement;
  front: HTMLCanvasElement;
  /** anchor (water-line centre) inside the sprite, CSS px at the bucket size */
  ax: number;
  ay: number;
  /** sprite size in CSS px at the bucket size */
  w: number;
  h: number;
  u: number;
}

const sprites = new Map<string, BaseSprite>();
const SPRITE_MAX = 120;
const PHASES = 6;
const SIZE_STEP = Math.log(1.1);

function buildSprite(u: number, pitch: number, yaw: number, lod: BaseLod, scale: number, inner: boolean): BaseSprite {
  const sinP = Math.sin(pitch);
  const cosP = Math.cos(pitch);
  const left = (KRATHONG_RADIUS + 0.12) * u;
  const up = (KRATHONG_TOP * cosP + KRATHONG_RADIUS * sinP + 0.15) * u;
  const down = (2.35 * sinP * 1.2 + 0.4) * u;
  const w = Math.ceil(left * 2);
  const h = Math.ceil(up + down);
  const v: BaseView = { cosY: Math.cos(yaw), sinY: Math.sin(yaw), cosP, sinP, u, ox: left, oy: up };
  const petals = buildPetals(v, lod, inner);
  const mk = () => {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.ceil(w * scale));
    c.height = Math.max(1, Math.ceil(h * scale));
    const g = c.getContext("2d")!;
    g.scale(scale, scale);
    return { c, g };
  };
  const b = mk();
  paintBack(b.g, v, petals, lod);
  const f = mk();
  paintFront(f.g, petals, lod, u);
  return { back: b.c, front: f.c, ax: left, ay: up, w, h, u };
}

function spriteFor(ctx: CanvasRenderingContext2D, p: KrathongParams, lod: BaseLod): BaseSprite {
  const scale = pixelScale(ctx);
  const sb = Math.round(Math.log(Math.max(2, p.u)) / SIZE_STEP);
  const pb = Math.round(p.pitch / 0.05);
  const per = period(lod);
  const ph = ((p.yaw % per) + per) % per;
  const phb = Math.round((ph / per) * PHASES) % PHASES;
  const key = `${sb}|${pb}|${phb}|${lod}|${scale}|${p.inner ? 1 : 0}`;
  let s = cacheGet(sprites, key);
  if (!s) {
    s = buildSprite(Math.exp(sb * SIZE_STEP), pb * 0.05, (phb / PHASES) * per, lod, scale, !!p.inner);
    cachePut(sprites, key, s, SPRITE_MAX);
  }
  return s;
}

function blitSprite(ctx: CanvasRenderingContext2D, s: BaseSprite, img: HTMLCanvasElement, p: KrathongParams) {
  const k = p.u / s.u;
  ctx.drawImage(img, p.x - s.ax * k, p.y - s.ay * k, s.w * k, s.h * k);
}

export const baseLod = (u: number): BaseLod => (u < 13 ? 0 : u < 40 ? 1 : 2);
/** above this the rings are painted directly every frame (single big lantern: studio / detail) */
const DIRECT_U = 95;

// ---------------------------------------------------------------------------------------------
// Flowers (small cached sprites)
// ---------------------------------------------------------------------------------------------

type FlowerKind = "marigold" | "orchid" | "jasmine";
const FL = 96;
const flowerSprites = new Map<string, HTMLCanvasElement>();

function flowerSprite(kind: FlowerKind, shaded: boolean): HTMLCanvasElement {
  const key = `${kind}|${shaded ? 1 : 0}`;
  let c = flowerSprites.get(key);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = c.height = FL;
  const g = c.getContext("2d")!;
  let seed = kind === "marigold" ? 7 : kind === "orchid" ? 11 : 19;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const m = FL / 2;
  if (kind === "marigold") {
    const rings: Array<[number, number, number, string]> = [
      [36, 22, 9.5, "#b8430a"],
      [29, 19, 9, "#dc5f0c"],
      [21, 15, 8.5, "#f07d12"],
      [13, 10, 7.5, "#ff9a1f"],
      [5, 6, 6.5, "#ffb83a"],
    ];
    g.fillStyle = "#8a2f06";
    g.beginPath();
    g.arc(m, m + 2, 40, 0, TAU);
    g.fill();
    for (const [r, n, pr, col] of rings) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + rnd() * 0.3;
        const x = m + Math.cos(a) * r;
        const y = m + Math.sin(a) * r * 0.92;
        g.fillStyle = col;
        g.beginPath();
        g.arc(x, y, pr * (0.85 + rnd() * 0.3), 0, TAU);
        g.fill();
        g.strokeStyle = "rgba(120, 40, 0, 0.35)";
        g.lineWidth = 1.2;
        g.beginPath();
        g.arc(x, y, pr * 0.8, a + 0.4, a + 2.2);
        g.stroke();
      }
    }
    const hl = g.createRadialGradient(m - 12, m - 14, 2, m - 12, m - 14, 30);
    hl.addColorStop(0, "rgba(255, 236, 150, 0.55)");
    hl.addColorStop(1, "rgba(255, 236, 150, 0)");
    g.fillStyle = hl;
    g.beginPath();
    g.arc(m, m, 42, 0, TAU);
    g.fill();
  } else if (kind === "orchid") {
    const petal = (a: number, len: number, wid: number, inner: string, outer: string) => {
      g.save();
      g.translate(m, m);
      g.rotate(a);
      const pg = g.createLinearGradient(0, 0, 0, -len);
      pg.addColorStop(0, inner);
      pg.addColorStop(1, outer);
      g.fillStyle = pg;
      g.beginPath();
      g.moveTo(0, 0);
      g.bezierCurveTo(wid, -len * 0.3, wid * 0.8, -len * 0.9, 0, -len);
      g.bezierCurveTo(-wid * 0.8, -len * 0.9, -wid, -len * 0.3, 0, 0);
      g.fill();
      g.restore();
    };
    // sepals and petals (Dendrobium: white heart, violet tips)
    for (const a of [0, 2.15, -2.15]) petal(a, 40, 13, "#f6e8f8", "#b04ac9");
    for (const a of [1.15, -1.15]) petal(a, 38, 17, "#fbf0fb", "#c25ad6");
    // lip
    g.fillStyle = "#6d1580";
    g.beginPath();
    g.ellipse(m, m + 10, 9, 13, 0, 0, TAU);
    g.fill();
    g.fillStyle = "#9b2bb0";
    g.beginPath();
    g.ellipse(m, m + 6, 6, 8, 0, 0, TAU);
    g.fill();
    g.fillStyle = "#ffe27a";
    g.beginPath();
    g.arc(m, m - 1, 4, 0, TAU);
    g.fill();
  } else {
    // jasmine sprig: two leaves, three buds and an open star flower
    g.fillStyle = "#2f6b2a";
    for (const [a, l] of [
      [-0.5, 34],
      [2.6, 30],
    ] as const) {
      g.save();
      g.translate(m, m + 6);
      g.rotate(a);
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(l * 0.5, -10, l, 0);
      g.quadraticCurveTo(l * 0.5, 10, 0, 0);
      g.fill();
      g.restore();
    }
    for (const [x, y, a] of [
      [m - 20, m - 6, -0.6],
      [m + 20, m - 10, 0.5],
      [m + 4, m - 24, 0.1],
    ] as const) {
      g.save();
      g.translate(x, y);
      g.rotate(a);
      g.fillStyle = "#fffaf0";
      g.beginPath();
      g.ellipse(0, 0, 6, 12, 0, 0, TAU);
      g.fill();
      g.fillStyle = "rgba(255, 170, 190, 0.6)";
      g.beginPath();
      g.ellipse(0, -8, 3.5, 4.5, 0, 0, TAU);
      g.fill();
      g.restore();
    }
    g.fillStyle = "#ffffff";
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU - Math.PI / 2;
      g.beginPath();
      g.ellipse(m + Math.cos(a) * 13, m + 8 + Math.sin(a) * 12, 7.5, 12, a + Math.PI / 2, 0, TAU);
      g.fill();
    }
    g.fillStyle = "#ffd75a";
    g.beginPath();
    g.arc(m, m + 8, 4.5, 0, TAU);
    g.fill();
  }
  if (shaded) {
    g.globalCompositeOperation = "source-atop";
    g.fillStyle = "rgba(14, 22, 48, 0.42)";
    g.fillRect(0, 0, FL, FL);
  } else {
    g.globalCompositeOperation = "source-atop";
    g.fillStyle = "rgba(255, 210, 130, 0.12)";
    g.fillRect(0, 0, FL, FL);
  }
  flowerSprites.set(key, c);
  return c;
}

/** flowers around the rim: angle from the front (+z) towards +x, radius, height, size */
const FLOWERS: Array<[FlowerKind, number, number, number, number]> = [
  ["marigold", 0.78, 1.72, 0.34, 0.22],
  ["orchid", -0.8, 1.74, 0.36, 0.22],
  ["jasmine", 1.75, 1.72, 0.36, 0.25],
  ["marigold", -1.78, 1.72, 0.34, 0.22],
  ["orchid", 2.5, 1.7, 0.38, 0.21],
  ["jasmine", -2.5, 1.7, 0.36, 0.24],
  ["marigold", Math.PI, 1.7, 0.36, 0.22],
];

function drawFlowers(ctx: CanvasRenderingContext2D, v: BaseView, part: "back" | "front", lod: BaseLod) {
  const tmp = [0, 0];
  for (let i = 0; i < FLOWERS.length; i++) {
    if (lod === 0 && i % 2 === 1) continue;
    const [kind, th, r, y, sz] = FLOWERS[i];
    const x = r * Math.sin(th);
    const z = r * Math.cos(th);
    const zr = -x * v.sinY + z * v.cosY;
    if ((zr < 0) !== (part === "back")) continue;
    proj(v, x, y, z, tmp, 0);
    const s = sz * v.u * 2;
    // the side we see faces the lantern when the flower is behind it
    const lit = Math.max(0, Math.min(1, 0.5 - zr / r));
    ctx.drawImage(flowerSprite(kind, true), tmp[0] - s / 2, tmp[1] - s / 2, s, s);
    if (lit > 0.02) {
      const a = ctx.globalAlpha;
      ctx.globalAlpha = a * lit;
      ctx.drawImage(flowerSprite(kind, false), tmp[0] - s / 2, tmp[1] - s / 2, s, s);
      ctx.globalAlpha = a;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Incense
// ---------------------------------------------------------------------------------------------

const INCENSE_TH = 2.3;
const INCENSE_R = 1.28;

/** always drawn behind the lantern body, so the sticks can never hide the wish written on it */
function drawIncense(ctx: CanvasRenderingContext2D, v: BaseView, p: KrathongParams, lod: BaseLod) {
  const a = [0, 0];
  const b = [0, 0];
  ctx.save();
  ctx.lineCap = "round";
  for (let i = 0; i < 3; i++) {
    const th = INCENSE_TH + (i - 1) * 0.12;
    const lean = 0.1 + i * 0.05;
    const sx = Math.sin(th);
    const cz = Math.cos(th);
    const top = 1.25 + (i === 1 ? 0.18 : 0);
    proj(v, INCENSE_R * sx, 0.15, INCENSE_R * cz, a, 0);
    proj(v, (INCENSE_R + lean) * sx, top, (INCENSE_R + lean) * cz, b, 0);
    ctx.strokeStyle = "#7c3a1c";
    ctx.lineWidth = Math.max(0.6, v.u * 0.032);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
    // ember
    const flick = 0.8 + 0.2 * Math.sin(p.time * 5 + i * 2 + p.seed);
    ctx.globalCompositeOperation = "lighter";
    const er = v.u * 0.16 * flick;
    ctx.drawImage(glowSprite("#ff5a1f"), b[0] - er, b[1] - er, er * 2, er * 2);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#ffb070";
    ctx.beginPath();
    ctx.arc(b[0], b[1], Math.max(0.6, v.u * 0.028), 0, TAU);
    ctx.fill();
    if (lod === 2) {
      // thin smoke ribbon
      ctx.strokeStyle = "rgba(230, 225, 240, 0.13)";
      ctx.lineWidth = Math.max(0.6, v.u * 0.025);
      ctx.beginPath();
      ctx.moveTo(b[0], b[1]);
      const h = v.u * 0.9;
      for (let k = 1; k <= 6; k++) {
        const q = k / 6;
        const wob = Math.sin(p.time * 1.3 + q * 5 + i * 1.7) * v.u * 0.08 * q;
        ctx.lineTo(b[0] + wob + q * v.u * 0.1, b[1] - h * q);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

function viewOf(p: KrathongParams): BaseView {
  return { cosY: Math.cos(p.yaw), sinY: Math.sin(p.yaw), cosP: Math.cos(p.pitch), sinP: Math.sin(p.pitch), u: p.u, ox: p.x, oy: p.y };
}

/** everything of the krathong that lies behind the lantern body */
export function drawKrathongBack(ctx: CanvasRenderingContext2D, p: KrathongParams) {
  const lod = baseLod(p.u);
  const v = viewOf(p);
  if (p.u >= DIRECT_U) {
    paintBack(ctx, v, buildPetals(v, lod, !!p.inner), lod);
  } else {
    const s = spriteFor(ctx, p, lod);
    blitSprite(ctx, s, s.back, p);
  }
  drawFlowers(ctx, v, "back", lod);
  if (lod > 0) drawIncense(ctx, v, p, lod);
}

/** front petals, flowers and the warm light the lantern throws on them */
export function drawKrathongFront(ctx: CanvasRenderingContext2D, p: KrathongParams) {
  const lod = baseLod(p.u);
  const v = viewOf(p);
  if (p.u >= DIRECT_U) {
    paintFront(ctx, buildPetals(v, lod, !!p.inner), lod, p.u);
  } else {
    const s = spriteFor(ctx, p, lod);
    blitSprite(ctx, s, s.front, p);
  }
  drawFlowers(ctx, v, "front", lod);
  if (p.glow > 0.03) {
    // lantern light pooling over the leaves
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = ctx.globalAlpha * p.glow * 0.32;
    const w = p.u * 4.2;
    const h = p.u * (0.9 + 2.2 * v.sinP);
    ctx.drawImage(glowSprite(mixHex(p.light, "#ffd9a0", 0.4)), p.x - w / 2, p.y - p.u * 0.55 * v.cosP - h / 2, w, h);
    ctx.restore();
  }
}
