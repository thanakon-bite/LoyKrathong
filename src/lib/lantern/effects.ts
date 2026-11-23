import type { EffectId } from "@/types/lantern";
import { mixHex, rgba } from "@/lib/utils";
import { glowSprite } from "./render-sprites";
import { FACE_ASPECT } from "./texture";

/**
 * Animated add-on effects drawn around a lantern (Canvas 2D).
 * Every effect may paint a "back" part (before the lantern body) and a "front" part (after it),
 * which lets particles orbit *around* the lantern in depth.
 * All motion is a pure function of time + seed, so every client sees the same thing and a
 * still frame (share postcard) is just as complete as a moving one.
 *
 * Performance notes (festival scene draws up to ~50 lanterns):
 * - level of detail by on-screen size: LOD 0 (u < 22px), 1 (u < 48px), 2 (u ≥ 48px)
 * - every soft / gradient shape is a cached sprite (canvas) drawn with drawImage;
 *   no gradients or shadowBlur are created per frame
 * - firework streaks are batched into one path per colour
 */

export interface EffectFrame {
  /** lantern centre (screen px) */
  cx: number;
  cy: number;
  /** top edge of the lantern and the water line under it */
  top: number;
  base: number;
  /** half face width in px */
  u: number;
  time: number;
  seed: number;
  alpha: number;
}

type Lod = 0 | 1 | 2;
interface Kit {
  lod: Lod;
  /** vertical squash of circles lying on the water (≈ sin(camera pitch)) */
  tilt: number;
}
type Paint = (ctx: CanvasRenderingContext2D, f: EffectFrame, k: Kit) => void;

const TAU = Math.PI * 2;
const frac = (v: number) => v - Math.floor(v);
/** deterministic hash → [0, 1) */
const hash = (a: number, b = 0) => frac(Math.sin(a * 127.1 + b * 311.7 + 0.5) * 43758.5453);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOutBack = (t: number) => {
  const c = 1.9;
  const x = t - 1;
  return 1 + (c + 1) * x * x * x + c * x * x;
};
/** smooth on/off window: 0 at p=0 and p=1, 1 in the middle */
const life = (p: number, fadeIn: number, fadeOut: number) => Math.min(clamp01(p / fadeIn), clamp01((1 - p) / fadeOut));

function lodFor(u: number): Lod {
  return u < 22 ? 0 : u < 48 ? 1 : 2;
}

/** Recover the camera pitch from the frame (cy sits FACE_ASPECT·u·cos(pitch) above the water line) */
function waterTilt(f: EffectFrame) {
  const c = clamp01((f.base - f.cy) / (FACE_ASPECT * f.u));
  return Math.max(0.16, Math.min(0.7, Math.sqrt(1 - c * c)));
}

// ---------------------------------------------------------------------------------------------
// Sprite cache
// ---------------------------------------------------------------------------------------------

type SpriteCache = Map<string, HTMLCanvasElement>;
/** one cache per sprite kind, keyed by a plain colour / literal so lookups never allocate */
function sprite(cache: SpriteCache, key: string, w: number, h: number, paint: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
  let c = cache.get(key);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (g) paint(g, w, h);
  cache.set(key, c);
  return c;
}

/** draw a square sprite centred on (x, y) */
function blit(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, x: number, y: number, size: number) {
  ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
}

function starPath(g: CanvasRenderingContext2D, c: number, len: number, waist: number, diagonal: boolean) {
  g.save();
  g.translate(c, c);
  if (diagonal) g.rotate(Math.PI / 4);
  g.beginPath();
  g.moveTo(0, -len);
  g.quadraticCurveTo(waist, -waist, len, 0);
  g.quadraticCurveTo(waist, waist, 0, len);
  g.quadraticCurveTo(-waist, waist, -len, 0);
  g.quadraticCurveTo(-waist, -waist, 0, -len);
  g.closePath();
  g.restore();
}

/** Glinting star: soft bloom + long tapered cross flare + short diagonal flare */
const sparkCache: SpriteCache = new Map();
function sparkleSprite(color: string) {
  return sprite(sparkCache, color, 96, 96, (g, w) => {
    const c = w / 2;
    const bloom = g.createRadialGradient(c, c, 0, c, c, c * 0.6);
    bloom.addColorStop(0, "rgba(255,255,255,1)");
    bloom.addColorStop(0.12, rgba(mixHex(color, "#ffffff", 0.6), 0.9));
    bloom.addColorStop(0.4, rgba(color, 0.3));
    bloom.addColorStop(1, rgba(color, 0));
    g.fillStyle = bloom;
    g.fillRect(0, 0, w, w);
    const flare = g.createRadialGradient(c, c, 0, c, c, c);
    flare.addColorStop(0, "rgba(255,255,255,1)");
    flare.addColorStop(0.3, rgba(mixHex(color, "#ffffff", 0.5), 0.75));
    flare.addColorStop(1, rgba(color, 0));
    g.fillStyle = flare;
    starPath(g, c, c, w * 0.035, false);
    g.fill();
    g.globalAlpha = 0.55;
    starPath(g, c, c * 0.5, w * 0.03, true);
    g.fill();
  });
}

function heartPath(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.beginPath();
  g.moveTo(x, y + s * 0.95);
  g.bezierCurveTo(x - s * 0.3, y + s * 0.62, x - s * 1.05, y + s * 0.2, x - s, y - s * 0.35);
  g.bezierCurveTo(x - s * 0.95, y - s * 0.95, x - s * 0.15, y - s * 1.05, x, y - s * 0.45);
  g.bezierCurveTo(x + s * 0.15, y - s * 1.05, x + s * 0.95, y - s * 0.95, x + s, y - s * 0.35);
  g.bezierCurveTo(x + s * 1.05, y + s * 0.2, x + s * 0.3, y + s * 0.62, x, y + s * 0.95);
  g.closePath();
}

/** Glossy heart with baked glow (half width = 0.3 of the sprite) */
const HEART_SPRITE_HALF = 0.3;
const heartCache: SpriteCache = new Map();
function heartSprite(color: string) {
  return sprite(heartCache, color, 96, 96, (g, w) => {
    const s = w * HEART_SPRITE_HALF;
    const x = w / 2;
    const y = w / 2;
    g.save();
    g.shadowColor = rgba(color, 0.95);
    g.shadowBlur = w * 0.12;
    heartPath(g, x, y, s);
    const fill = g.createRadialGradient(x - s * 0.4, y - s * 0.5, s * 0.05, x, y, s * 1.25);
    fill.addColorStop(0, mixHex(color, "#ffffff", 0.75));
    fill.addColorStop(0.35, color);
    fill.addColorStop(1, mixHex(color, "#4a0020", 0.4));
    g.fillStyle = fill;
    g.fill();
    g.restore();
    g.lineWidth = w * 0.014;
    g.strokeStyle = rgba(mixHex(color, "#ffffff", 0.65), 0.7);
    heartPath(g, x, y, s);
    g.stroke();
    g.fillStyle = "rgba(255,255,255,0.7)";
    g.beginPath();
    g.ellipse(x - s * 0.48, y - s * 0.48, s * 0.2, s * 0.1, -0.7, 0, TAU);
    g.fill();
  });
}

/** Petal with soft base→tip gradient; lotus petals are pointed, rose petals rounded */
const petalCache: SpriteCache = new Map();
/** cached by base colour – every petal kind has its own base colour */
function petalSprite(base: string, tip: string, pointed: boolean) {
  return sprite(petalCache, base, 64, 96, (g, w, h) => {
    const x = w / 2;
    g.beginPath();
    g.moveTo(x, h * 0.97);
    if (pointed) {
      g.bezierCurveTo(x - w * 0.55, h * 0.72, x - w * 0.42, h * 0.2, x, h * 0.03);
      g.bezierCurveTo(x + w * 0.42, h * 0.2, x + w * 0.55, h * 0.72, x, h * 0.97);
    } else {
      g.bezierCurveTo(x - w * 0.6, h * 0.75, x - w * 0.62, h * 0.05, x - w * 0.12, h * 0.06);
      g.quadraticCurveTo(x, h * 0.13, x + w * 0.12, h * 0.06);
      g.bezierCurveTo(x + w * 0.62, h * 0.05, x + w * 0.6, h * 0.75, x, h * 0.97);
    }
    g.closePath();
    const lg = g.createLinearGradient(0, h, 0, 0);
    lg.addColorStop(0, base);
    lg.addColorStop(0.55, mixHex(base, tip, 0.55));
    lg.addColorStop(1, tip);
    g.fillStyle = lg;
    g.fill();
    g.save();
    g.clip();
    const sheen = g.createRadialGradient(x - w * 0.12, h * 0.42, 0, x - w * 0.12, h * 0.42, w * 0.55);
    sheen.addColorStop(0, "rgba(255,255,255,0.45)");
    sheen.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = sheen;
    g.fillRect(0, 0, w, h);
    g.restore();
    g.lineWidth = 1.2;
    g.strokeStyle = rgba(tip, 0.7);
    g.stroke();
    g.strokeStyle = rgba(mixHex(base, "#5a0a24", 0.3), 0.35);
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, h * 0.92);
    g.quadraticCurveTo(x + w * 0.05, h * 0.5, x, h * 0.2);
    g.stroke();
  });
}

/** One side of a butterfly (fore + hind wing); the wing root is at the left-middle of the sprite */
const wingCache: SpriteCache = new Map();
function wingSprite(color: string) {
  return sprite(wingCache, color, 112, 112, (g) => {
    g.translate(0, 8);
    const fill = g.createRadialGradient(0, 48, 2, 0, 48, 96);
    fill.addColorStop(0, mixHex(color, "#ffffff", 0.75));
    fill.addColorStop(0.45, color);
    fill.addColorStop(0.85, mixHex(color, "#1a0b3a", 0.45));
    fill.addColorStop(1, mixHex(color, "#ffffff", 0.3));
    const hind = () => {
      g.beginPath();
      g.moveTo(3, 50);
      g.bezierCurveTo(30, 50, 64, 56, 66, 72);
      g.bezierCurveTo(66, 88, 40, 94, 22, 84);
      g.bezierCurveTo(10, 76, 4, 62, 3, 52);
      g.closePath();
    };
    const fore = () => {
      g.beginPath();
      g.moveTo(3, 46);
      g.bezierCurveTo(18, 14, 60, 2, 90, 10);
      g.bezierCurveTo(95, 26, 82, 44, 58, 48);
      g.bezierCurveTo(34, 50, 14, 50, 3, 48);
      g.closePath();
    };
    for (const path of [hind, fore]) {
      path();
      g.fillStyle = fill;
      g.fill();
      g.save();
      g.shadowColor = color;
      g.shadowBlur = 7;
      g.strokeStyle = mixHex(color, "#ffffff", 0.55);
      g.lineWidth = 2.2;
      g.stroke();
      g.restore();
    }
    // wing veins + eye spots
    g.strokeStyle = rgba("#1a0b3a", 0.25);
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(4, 47);
    g.quadraticCurveTo(40, 30, 84, 14);
    g.moveTo(4, 48);
    g.quadraticCurveTo(44, 42, 74, 36);
    g.moveTo(4, 52);
    g.quadraticCurveTo(34, 64, 50, 82);
    g.stroke();
    g.fillStyle = "rgba(255,255,255,0.85)";
    for (const [x, y, r] of [
      [78, 20, 3.2],
      [68, 30, 2.2],
      [48, 76, 2.8],
    ] as const) {
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }
  });
}

/** Gold Thai "kanok" flame petal, base at the bottom centre */
const kanokCache: SpriteCache = new Map();
function kanokSprite(glint: boolean) {
  return sprite(kanokCache, glint ? "glint" : "gold", 64, 112, (g, w, h) => {
    const path = (s: number) => {
      const ox = w * 0.5;
      const oy = h * 0.98;
      const X = (v: number) => ox + (v * w - ox) * s;
      const Y = (v: number) => oy + (v * h - oy) * s;
      g.beginPath();
      g.moveTo(X(0.5), Y(0.98));
      g.bezierCurveTo(X(0.04), Y(0.8), X(0.06), Y(0.42), X(0.4), Y(0.24));
      g.bezierCurveTo(X(0.52), Y(0.16), X(0.48), Y(0.07), X(0.64), Y(0.02));
      g.bezierCurveTo(X(0.6), Y(0.12), X(0.7), Y(0.2), X(0.8), Y(0.34));
      g.bezierCurveTo(X(0.98), Y(0.6), X(0.92), Y(0.86), X(0.5), Y(0.98));
      g.closePath();
    };
    if (glint) {
      // white-gold copy used for the shimmering highlight sweep
      path(1);
      const lg = g.createLinearGradient(0, h, 0, 0);
      lg.addColorStop(0, "rgba(255,240,190,0.2)");
      lg.addColorStop(0.5, "rgba(255,248,220,0.9)");
      lg.addColorStop(1, "rgba(255,255,255,1)");
      g.fillStyle = lg;
      g.fill();
      return;
    }
    path(1);
    const lg = g.createLinearGradient(0, 0, w, 0);
    lg.addColorStop(0, "#7a4a0c");
    lg.addColorStop(0.3, "#e3a93a");
    lg.addColorStop(0.5, "#fff0b0");
    lg.addColorStop(0.72, "#d9992c");
    lg.addColorStop(1, "#6b3f0a");
    g.fillStyle = lg;
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = "#5c3507";
    g.stroke();
    path(0.66);
    g.lineWidth = 1.6;
    g.strokeStyle = "rgba(255, 236, 170, 0.85)";
    g.stroke();
    path(0.36);
    g.fillStyle = "#a8661a";
    g.fill();
    g.strokeStyle = "rgba(255, 236, 170, 0.8)";
    g.lineWidth = 1.2;
    g.stroke();
    // base curl
    g.beginPath();
    g.arc(w * 0.5, h * 0.84, w * 0.09, 0, TAU);
    g.fillStyle = "#fff0b0";
    g.fill();
    g.strokeStyle = "#5c3507";
    g.lineWidth = 1.2;
    g.stroke();
  });
}

/** Soft rainbow arc, centre of the circle at the bottom centre of the sprite */
const RB_W = 640;
const RB_R = 310;
const rainbowCache: SpriteCache = new Map();
function rainbowSprite(reversed: boolean) {
  return sprite(rainbowCache, reversed ? "secondary" : "primary", RB_W, RB_W / 2, (g, w, h) => {
    const cx = w / 2;
    const cy = h;
    const bands = ["#9a6bff", "#4d8bff", "#4fd6ff", "#5fe07a", "#ffe45c", "#ffa24a", "#ff5a6a"];
    if (reversed) bands.reverse();
    // brighter sky inside the bow
    const inner = g.createRadialGradient(cx, cy, RB_R * 0.25, cx, cy, RB_R * 0.7);
    inner.addColorStop(0, "rgba(255,255,255,0)");
    inner.addColorStop(0.85, "rgba(255,250,235,0.1)");
    inner.addColorStop(1, "rgba(255,250,235,0)");
    g.fillStyle = inner;
    g.fillRect(0, 0, w, h);
    const r0 = RB_R * 0.68;
    const grad = g.createRadialGradient(cx, cy, r0, cx, cy, RB_R);
    grad.addColorStop(0, rgba(bands[0], 0));
    bands.forEach((c, i) => grad.addColorStop(0.08 + (i / (bands.length - 1)) * 0.82, rgba(c, 0.95)));
    grad.addColorStop(1, rgba(bands[bands.length - 1], 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    // feet dissolve into mist over the water
    g.globalCompositeOperation = "destination-in";
    const fade = g.createLinearGradient(0, 0, 0, h);
    fade.addColorStop(0, "rgba(0,0,0,1)");
    fade.addColorStop(0.62, "rgba(0,0,0,0.95)");
    fade.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = fade;
    g.fillRect(0, 0, w, h);
  });
}

/** Tapered god ray pointing up, its origin at the bottom centre */
const rayCache: SpriteCache = new Map();
function raySprite(color: string) {
  return sprite(rayCache, color, 48, 256, (g, w, h) => {
    g.beginPath();
    g.moveTo(w * 0.44, h);
    g.lineTo(w * 0.56, h);
    g.lineTo(w, 0);
    g.lineTo(0, 0);
    g.closePath();
    const lg = g.createLinearGradient(0, h, 0, 0);
    lg.addColorStop(0, rgba(color, 0));
    lg.addColorStop(0.14, rgba(color, 0.9));
    lg.addColorStop(0.45, rgba(color, 0.4));
    lg.addColorStop(1, rgba(color, 0));
    g.fillStyle = lg;
    g.fill();
    g.globalCompositeOperation = "destination-in";
    const hg = g.createLinearGradient(0, 0, w, 0);
    hg.addColorStop(0, "rgba(0,0,0,0)");
    hg.addColorStop(0.5, "rgba(0,0,0,1)");
    hg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = hg;
    g.fillRect(0, 0, w, h);
  });
}

/** A whole fan of god rays baked into one sprite, so each ray set is a single rotated drawImage */
const FAN = 512;
const fanCache: SpriteCache = new Map();
function fanSprite(color: string, rays: number, width: number, minLen: number, salt: number) {
  return sprite(fanCache, color, FAN, FAN, (g, w) => {
    const c = w / 2;
    const ray = raySprite(color);
    g.translate(c, c);
    for (let i = 0; i < rays; i++) {
      g.rotate(TAU / rays);
      const h = hash(i, salt);
      const len = c * (minLen + (1 - minLen) * h);
      g.globalAlpha = 0.55 + 0.45 * hash(i + 0.5, salt);
      g.drawImage(ray, (-width * c) / 2, -len, width * c, len);
    }
  });
}

/** Thin luminous ring (aureole) */
const ringCache: SpriteCache = new Map();
function ringSprite(color: string) {
  return sprite(ringCache, color, 160, 160, (g, w) => {
    const c = w / 2;
    const rg = g.createRadialGradient(c, c, 0, c, c, c);
    rg.addColorStop(0, rgba(color, 0));
    rg.addColorStop(0.68, rgba(color, 0));
    rg.addColorStop(0.8, rgba(color, 0.55));
    rg.addColorStop(0.86, "rgba(255,248,225,0.95)");
    rg.addColorStop(0.92, rgba(color, 0.45));
    rg.addColorStop(1, rgba(color, 0));
    g.fillStyle = rg;
    g.fillRect(0, 0, w, w);
  });
}

/** Half of an ellipse lying on the water: the near (front) or far (back) half */
function waterArc(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, front: boolean) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, front ? 0 : Math.PI, front ? Math.PI : TAU);
}

// ---------------------------------------------------------------------------------------------
// Fireworks
// ---------------------------------------------------------------------------------------------

const SHELLS: ReadonlyArray<readonly [string, string]> = [
  ["#ffd27a", "#fff4d6"],
  ["#ff4f8b", "#ffd1e3"],
  ["#7fe3ff", "#ffffff"],
  ["#b18cff", "#ffd27a"],
  ["#ff8a3d", "#ffe27a"],
  ["#7dffb0", "#e6fff3"],
  ["#ff5a5a", "#ffd27a"],
];
const FW_PERIOD = 3.3;
const FW_LAUNCH = 0.2;
const EXP_K = 4.5;
const EXP_N = 1 - Math.exp(-EXP_K);
const expand = (t: number) => (1 - Math.exp(-EXP_K * t)) / EXP_N;

interface Shell {
  bx: number;
  by: number;
  x0: number;
  y0: number;
  p: number;
  id: number;
  kind: number; // 0 peony, 1 willow, 2 double, 3 crackle
  pal: readonly [string, string];
  pal2: readonly [string, string];
  radius: number;
}
const shell: Shell = { bx: 0, by: 0, x0: 0, y0: 0, p: 0, id: 0, kind: 0, pal: SHELLS[0], pal2: SHELLS[1], radius: 0 };

function computeShell(f: EffectFrame, b: number, count: number) {
  const cyc = f.time / FW_PERIOD + b / count + f.seed * 0.37;
  const n = Math.floor(cyc);
  const id = n * 7.13 + b * 1.91 + f.seed;
  const r1 = hash(id, 1);
  const r2 = hash(id, 2);
  shell.p = cyc - n;
  shell.id = id;
  shell.bx = f.cx + (r1 - 0.5) * f.u * 2.8;
  shell.by = f.top - f.u * (1.25 + r2 * 1.0);
  shell.x0 = f.cx + (r1 - 0.5) * f.u * 0.7;
  shell.y0 = f.top + f.u * 0.3;
  const r4 = hash(id, 4);
  shell.kind = r4 < 0.26 ? 1 : r4 < 0.52 ? 2 : r4 < 0.76 ? 3 : 0;
  const pi = Math.floor(hash(id, 3) * SHELLS.length);
  shell.pal = shell.kind === 1 ? SHELLS[0] : SHELLS[pi];
  shell.pal2 = SHELLS[(pi + 2 + Math.floor(hash(id, 5) * 3)) % SHELLS.length];
  shell.radius = f.u * (1.3 + hash(id, 6) * 0.4);
}

/** one ring of stars: streaks batched in one stroke, heads in one fill */
function burstRing(
  ctx: CanvasRenderingContext2D,
  f: EffectFrame,
  k: Kit,
  s: Shell,
  t: number,
  count: number,
  radius: number,
  color: string,
  head: string,
  willow: boolean,
  salt: number,
) {
  if (t <= 0 || t >= 1) return;
  const grav = f.u * (willow ? 1.5 : 0.85);
  const fade = Math.pow(1 - t, willow ? 0.8 : 1.4);
  const tail = willow ? 0.28 : 0.11;
  const tp = Math.max(0, t - tail);
  const e = expand(t);
  const ep = expand(tp);
  const drop = grav * t * t;
  const dropP = grav * tp * tp;
  const spin = hash(s.id, 7 + salt) * TAU;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + spin + (hash(i, s.id + salt) - 0.5) * 0.25;
    const sp = radius * (0.8 + 0.2 * hash(i + 0.37, s.id + salt));
    const ca = Math.cos(a) * sp;
    const sa = Math.sin(a) * sp * 0.92;
    ctx.moveTo(s.bx + ca * ep, s.by + sa * ep + dropP);
    ctx.lineTo(s.bx + ca * e, s.by + sa * e + drop);
  }
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  const lw = Math.max(1, f.u * (willow ? 0.035 : 0.05) * (1 - t * 0.5));
  if (k.lod === 2) {
    // wide faint pass = bloom around every streak
    ctx.lineWidth = lw * 3.2;
    ctx.globalAlpha = f.alpha * fade * 0.2;
    ctx.stroke();
  }
  ctx.lineWidth = lw;
  ctx.globalAlpha = f.alpha * fade * (willow ? 0.75 : 0.9);
  ctx.stroke();
  if (k.lod < 2) return;
  // bright heads (large lanterns only – arcs are the priciest part of a burst)
  const hr = Math.max(0.8, f.u * 0.045 * (1 - t * 0.6));
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + spin + (hash(i, s.id + salt) - 0.5) * 0.25;
    const sp = radius * (0.8 + 0.2 * hash(i + 0.37, s.id + salt));
    const x = s.bx + Math.cos(a) * sp * e;
    const y = s.by + Math.sin(a) * sp * 0.92 * e + drop;
    ctx.moveTo(x + hr, y);
    ctx.arc(x, y, hr, 0, TAU);
  }
  ctx.fillStyle = head;
  ctx.globalAlpha = f.alpha * fade;
  ctx.fill();
}

const fireworksBack: Paint = (ctx, f, k) => {
  const count = k.lod === 0 ? 1 : k.lod === 1 ? 2 : 3;
  const stars = k.lod === 0 ? 14 : k.lod === 1 ? 20 : 40;
  ctx.globalCompositeOperation = "lighter";
  for (let b = 0; b < count; b++) {
    computeShell(f, b, count);
    const s = shell;
    if (s.p < FW_LAUNCH) {
      // rising comet with a spark tail
      const q = s.p / FW_LAUNCH;
      const steps = k.lod === 0 ? 2 : 6;
      for (let j = steps; j >= 0; j--) {
        const qq = Math.max(0, q - j * 0.045);
        const e = 1 - (1 - qq) * (1 - qq);
        const x = s.x0 + (s.bx - s.x0) * e + Math.sin(qq * 9 + s.id) * f.u * 0.04;
        const y = s.y0 + (s.by - s.y0) * e;
        const fall = 1 - j / (steps + 1);
        ctx.globalAlpha = f.alpha * fall * clamp01(q * 6);
        if (j === 0) blit(ctx, sparkleSprite("#ffe7b0"), x, y, f.u * 0.55);
        else blit(ctx, glowSprite("#ffb35a"), x, y, f.u * 0.18 * fall);
      }
      continue;
    }
    const t = (s.p - FW_LAUNCH) / (1 - FW_LAUNCH);
    // burst flash
    if (t < 0.16) {
      const q = 1 - t / 0.16;
      ctx.globalAlpha = f.alpha * q * 0.8;
      blit(ctx, glowSprite(s.pal[0]), s.bx, s.by, f.u * 2.6 * (1.2 - q * 0.4));
      ctx.globalAlpha = f.alpha * q;
      blit(ctx, sparkleSprite(s.pal[1]), s.bx, s.by, f.u * 1.5);
    }
    const willow = s.kind === 1;
    // coloured smoke-glow filling the shell
    if (t < 0.7) {
      ctx.globalAlpha = f.alpha * 0.22 * (1 - t / 0.7);
      blit(ctx, glowSprite(s.pal[0]), s.bx, s.by + f.u * 0.3 * t * t, s.radius * expand(t) * 2.6);
    }
    burstRing(ctx, f, k, s, t, stars, s.radius, s.pal[0], s.pal[1], willow, 0);
    if (k.lod > 0) burstRing(ctx, f, k, s, t, Math.round(stars * 0.5), s.radius * 0.5, s.pal2[0], s.pal2[1], willow, 1);
    if (s.kind === 2) {
      // double burst: a second, delayed shell of another colour
      const t2 = (t - 0.3) / 0.7;
      if (t2 > 0 && t2 < 0.12) {
        ctx.globalAlpha = f.alpha * (1 - t2 / 0.12) * 0.7;
        blit(ctx, glowSprite(s.pal2[0]), s.bx, s.by, f.u * 1.8);
      }
      burstRing(ctx, f, k, s, t2, Math.round(stars * 0.7), s.radius * 0.75, s.pal2[0], "#ffffff", false, 2);
    }
    // glitter crackle as the stars burn out
    const crackle = s.kind === 3 ? 0.35 : 0.6;
    if (k.lod > 0 && t > crackle) {
      const spk = sparkleSprite(s.kind === 3 ? "#ffffff" : s.pal[1]);
      const tick = Math.floor(f.time * 20);
      const e = expand(t);
      const drop = f.u * (willow ? 1.5 : 0.85) * t * t;
      const fade = Math.pow(1 - t, 0.9);
      const m = Math.round(stars * (s.kind === 3 ? (k.lod === 2 ? 0.8 : 0.5) : k.lod === 2 ? 0.4 : 0.2));
      for (let i = 0; i < m; i++) {
        if (hash(i + tick * 0.17, s.id) < 0.45) continue;
        const a = hash(i, s.id + 9) * TAU;
        const rr = s.radius * (0.35 + 0.75 * hash(i, s.id + 10)) * e;
        ctx.globalAlpha = f.alpha * fade;
        blit(ctx, spk, s.bx + Math.cos(a) * rr, s.by + Math.sin(a) * rr + drop, f.u * (k.lod === 2 ? 0.32 : 0.2));
      }
    }
  }
};

/** the bursts briefly light up the lantern itself */
const fireworksFront: Paint = (ctx, f, k) => {
  if (k.lod === 0) return;
  const count = k.lod === 1 ? 2 : 3;
  ctx.globalCompositeOperation = "lighter";
  for (let b = 0; b < count; b++) {
    computeShell(f, b, count);
    const t = (shell.p - FW_LAUNCH) / (1 - FW_LAUNCH);
    if (t <= 0 || t > 0.4) continue;
    ctx.globalAlpha = f.alpha * 0.22 * (1 - t / 0.4);
    blit(ctx, glowSprite(shell.pal[0]), f.cx, f.cy - f.u * 0.4, f.u * 3.2);
  }
};

// ---------------------------------------------------------------------------------------------
// Hearts
// ---------------------------------------------------------------------------------------------

const HEART_COLORS = ["#ff4f8b", "#ff7eb6", "#ff9ec4", "#e8366f", "#ffb3d1", "#ff6f91"];

const heartsFront: Paint = (ctx, f, k) => {
  const n = k.lod === 0 ? 4 : k.lod === 1 ? 6 : 9;
  const POP = 0.8;
  for (let i = 0; i < n; i++) {
    const h1 = hash(i, f.seed + 11);
    const h2 = hash(i, f.seed + 12);
    const h3 = hash(i, f.seed + 13);
    const dur = 3.6 + h1 * 1.4;
    const cyc = f.time / dur + i / n + h2;
    const gen = Math.floor(cyc);
    const p = cyc - gen;
    const g1 = hash(gen + i * 3.1, f.seed);
    const color = HEART_COLORS[Math.floor(hash(gen, i + f.seed) * HEART_COLORS.length)];
    const x0 = f.cx + (g1 - 0.5) * f.u * 1.8;
    const sway = Math.sin(f.time * (1.3 + h1) + i * 2.1) * f.u * 0.3 * (0.25 + p);
    const x = x0 + sway;
    const y = f.top + f.u * 0.3 - p * f.u * (2.5 + h3 * 0.6);
    const beat = 1 + 0.07 * Math.max(0, Math.sin(f.time * 7 + i * 1.3));
    const size = f.u * 0.27 * (0.7 + h3 * 0.5) * easeOutBack(clamp01(p / 0.16)) * beat;
    const tilt = Math.sin(f.time * (1.8 + h2) + i) * 0.28;
    if (p < POP) {
      const a = f.alpha * clamp01(p / 0.06);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = a * 0.45;
      blit(ctx, glowSprite(color), x, y, size * 4.2);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = a;
      const d = size / HEART_SPRITE_HALF;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(tilt);
      ctx.drawImage(heartSprite(color), -d / 2, -d / 2, d, d);
      ctx.restore();
      // twinkle riding on the heart
      if (k.lod === 2) {
        const tw = Math.pow(Math.max(0, Math.sin(f.time * 3.1 + i * 2.3)), 6);
        if (tw > 0.05) {
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = f.alpha * tw;
          blit(ctx, sparkleSprite("#ffe0ee"), x + size * 0.45, y - size * 0.45, size * 1.3);
        }
      }
      continue;
    }
    // pop: the heart swells, fades, and bursts into tiny sparkles
    const q = (p - POP) / (1 - POP);
    const fade = 1 - q;
    ctx.globalCompositeOperation = "lighter";
    if (q < 0.35) {
      const qq = q / 0.35;
      ctx.globalAlpha = f.alpha * (1 - qq) * 0.9;
      blit(ctx, glowSprite(color), x, y, size * (3 + qq * 3));
      // additive while it dissolves, so the fading heart turns to light instead of going muddy
      ctx.globalAlpha = f.alpha * (1 - qq) * (1 - qq);
      const d = (size * (1 + qq * 0.45)) / HEART_SPRITE_HALF;
      ctx.drawImage(heartSprite(color), x - d / 2, y - d / 2, d, d);
    }
    const sparks = k.lod === 0 ? 5 : 8;
    const spk = sparkleSprite(mixHex(color, "#ffffff", 0.4));
    const rr = size * (0.5 + 2.2 * (1 - Math.pow(1 - q, 2)));
    for (let j = 0; j < sparks; j++) {
      const a = (j / sparks) * TAU + h1 * TAU;
      ctx.globalAlpha = f.alpha * fade * (0.6 + 0.4 * hash(j, gen + i));
      blit(ctx, spk, x + Math.cos(a) * rr, y + Math.sin(a) * rr + q * q * size, size * (0.9 - q * 0.4));
    }
  }
};

// ---------------------------------------------------------------------------------------------
// Stars
// ---------------------------------------------------------------------------------------------

const STAR_TINTS = ["#fff3c4", "#ffffff", "#cfe6ff", "#ffe0a8"];

function starsLayer(ctx: CanvasRenderingContext2D, f: EffectFrame, k: Kit, front: boolean) {
  ctx.globalCompositeOperation = "lighter";
  const n = k.lod === 0 ? 10 : k.lod === 1 ? 20 : 44;
  const rx = f.u * 2.15;
  const ry = rx * (0.16 + k.tilt * 0.4);
  const rcx = f.cx;
  const rcy = f.cy - f.u * 0.1;
  const rot = -0.14;
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  // faint orbit band
  if (k.lod > 0) {
    ctx.beginPath();
    ctx.ellipse(rcx, rcy, rx, ry, rot, front ? 0 : Math.PI, front ? Math.PI : TAU);
    ctx.strokeStyle = "#ffe7b0";
    ctx.lineWidth = Math.max(1, f.u * 0.05);
    ctx.globalAlpha = f.alpha * (front ? 0.16 : 0.09);
    ctx.stroke();
    ctx.lineWidth = Math.max(0.6, f.u * 0.012);
    ctx.globalAlpha = f.alpha * (front ? 0.35 : 0.2);
    ctx.stroke();
  }
  const dust = glowSprite("#fff6d8");
  for (let i = 0; i < n; i++) {
    const h = hash(i, f.seed + 31);
    const a = (i / n) * TAU + f.time * 0.32 + h * 0.35;
    const s = Math.sin(a);
    if (s >= 0 !== front) continue;
    const rr = 1 + (hash(i + 0.7, f.seed) - 0.5) * 0.16;
    const ex = Math.cos(a) * rx * rr;
    const ey = s * ry * rr;
    const x = rcx + ex * cr - ey * sr;
    const y = rcy + ex * sr + ey * cr;
    const depth = 0.7 + 0.3 * s;
    const tw = 0.5 + 0.5 * Math.sin(f.time * (2 + h * 3) + h * TAU);
    const dim = front ? 1 : 0.6;
    if (i % 6 === 0) {
      ctx.globalAlpha = f.alpha * (0.55 + 0.45 * tw) * dim;
      blit(ctx, sparkleSprite(STAR_TINTS[i % STAR_TINTS.length]), x, y, f.u * (0.4 + 0.35 * tw) * depth);
    } else {
      ctx.globalAlpha = f.alpha * (0.35 + 0.55 * tw) * dim;
      blit(ctx, dust, x, y, f.u * (0.1 + 0.06 * tw) * depth);
    }
  }
  if (!front) return;
  // big twinkling stars hovering around the lantern with cross flares
  const m = k.lod === 0 ? 4 : k.lod === 1 ? 7 : 11;
  for (let j = 0; j < m; j++) {
    const h1 = hash(j, f.seed + 41);
    const h2 = hash(j, f.seed + 42);
    const h3 = hash(j, f.seed + 43);
    const x = f.cx + (h1 - 0.5) * f.u * 4.8;
    let y = f.cy - f.u * (0.4 + h2 * 2.6);
    if (Math.abs(x - f.cx) < f.u * 1.3) y = Math.min(y, f.top - f.u * 0.35);
    const tw = Math.pow(0.5 + 0.5 * Math.sin(f.time * (1.2 + h3 * 1.8) + h1 * TAU), 3);
    const size = f.u * (0.3 + 0.75 * tw) * (0.6 + h3 * 0.6);
    ctx.globalAlpha = f.alpha * (0.4 + 0.6 * tw);
    blit(ctx, sparkleSprite(STAR_TINTS[j % STAR_TINTS.length]), x, y + Math.sin(f.time * 0.7 + j) * f.u * 0.06, size);
  }
  // an occasional shooting star
  if (k.lod > 0) {
    const cyc = f.time / 5.5 + f.seed * 0.21;
    const gen = Math.floor(cyc);
    const p = cyc - gen;
    if (p < 0.16) {
      const q = p / 0.16;
      const dir = hash(gen, f.seed) < 0.5 ? -1 : 1;
      const sx = f.cx - dir * f.u * (2.2 - q * 3.6);
      const sy = f.top - f.u * (2.4 + hash(gen + 1, f.seed) * 0.6) + q * f.u * 1.1;
      const a = f.alpha * Math.sin(q * Math.PI);
      const head = sparkleSprite("#ffffff");
      const trail = glowSprite("#dfe9ff");
      for (let j = 7; j >= 1; j--) {
        const back = j * 0.03;
        ctx.globalAlpha = a * (1 - j / 8) * 0.8;
        blit(ctx, trail, sx + dir * back * f.u * 3.6, sy - back * f.u * 1.1, f.u * 0.22 * (1 - j / 9));
      }
      ctx.globalAlpha = a;
      blit(ctx, head, sx, sy, f.u * 0.6);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Petals
// ---------------------------------------------------------------------------------------------

const PETAL_KINDS: ReadonlyArray<readonly [string, string, boolean]> = [
  ["#e0527f", "#fff0f5", true],
  ["#c9184a", "#ff8fab", false],
  ["#ff8fab", "#fff7fa", false],
  ["#f2c46d", "#fffaf0", true],
  ["#f06292", "#ffe4ee", true],
];

function petalsLayer(ctx: CanvasRenderingContext2D, f: EffectFrame, k: Kit, front: boolean) {
  const n = k.lod === 0 ? 6 : k.lod === 1 ? 11 : 18;
  const pw = f.u * 0.3;
  for (let i = 0; i < n; i++) {
    const h1 = hash(i, f.seed + 21);
    const h2 = hash(i, f.seed + 22);
    const h3 = hash(i, f.seed + 23);
    const h4 = hash(i, f.seed + 24);
    const dur = 5.5 + h1 * 2.5;
    const cyc = f.time / dur + h2;
    const p = frac(cyc);
    const a = h3 * TAU + cyc * TAU * 0.85;
    const s = Math.sin(a);
    if (s >= 0 !== front) continue;
    const r = f.u * (1.45 + h4 * 0.8) * (1 - p * 0.15);
    const yTop = f.top - f.u * (0.8 + h1 * 1.4);
    const yWater = f.base + s * r * k.tilt;
    const x = f.cx + Math.cos(a) * r + Math.sin(f.time * 1.3 + i) * f.u * 0.12;
    const y = yTop + (yWater - yTop) * Math.pow(p, 1.15);
    const flip = Math.cos(f.time * (1.6 + h3 * 1.4) + h4 * TAU);
    const spin = f.time * (0.7 + h1) * (i % 2 ? 1 : -1) + h2 * TAU;
    const depth = 0.8 + 0.2 * s;
    const kind = PETAL_KINDS[i % PETAL_KINDS.length];
    const vis = f.alpha * life(p, 0.08, 0.1);
    if (k.lod === 2) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = vis * 0.25;
      blit(ctx, glowSprite(kind[1]), x, y, pw * 3);
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = vis * (0.55 + 0.45 * Math.abs(flip)) * (front ? 1 : 0.85);
    const w = pw * depth;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin);
    ctx.scale(flip, 1);
    ctx.drawImage(petalSprite(kind[0], kind[1], kind[2]), -w / 2, -w * 0.75, w, w * 1.5);
    ctx.restore();
    // ripple where it lands on the water
    if (k.lod > 0 && p > 0.86) {
      const q = (p - 0.86) / 0.14;
      ctx.beginPath();
      ctx.ellipse(x, yWater, f.u * (0.1 + q * 0.45), f.u * (0.1 + q * 0.45) * k.tilt, 0, 0, TAU);
      ctx.strokeStyle = "#ffd6e4";
      ctx.lineWidth = Math.max(0.6, f.u * 0.02);
      ctx.globalAlpha = f.alpha * (1 - q) * 0.6;
      ctx.stroke();
    }
  }
  // petals already floating on the water around the krathong
  const m = k.lod === 0 ? 0 : k.lod === 1 ? 4 : 7;
  for (let j = 0; j < m; j++) {
    const b = (j / m) * TAU + f.time * 0.06 + f.seed;
    const s = Math.sin(b);
    if (s >= 0 !== front) continue;
    const r = f.u * (1.95 + hash(j, f.seed + 25) * 0.3);
    const x = f.cx + Math.cos(b) * r;
    const y = f.base + s * r * k.tilt + Math.sin(f.time * 1.4 + j) * f.u * 0.02;
    const kind = PETAL_KINDS[(j + 2) % PETAL_KINDS.length];
    const w = pw * (0.85 + 0.2 * s);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = f.alpha * 0.9;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, k.tilt * 1.4);
    ctx.rotate(b * 2 + j);
    ctx.drawImage(petalSprite(kind[0], kind[1], kind[2]), -w / 2, -w * 0.75, w, w * 1.5);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------------------------
// Butterflies
// ---------------------------------------------------------------------------------------------

const BUTTERFLY_COLORS = ["#7fe3ff", "#c8a6ff", "#ffd27a", "#ff9ec4"];
const bpos = { x: 0, y: 0, z: 0, vx: 0 };

function butterflyPos(f: EffectFrame, i: number, t: number) {
  const ph = i * 2.1 + f.seed;
  const a = t * (0.55 + (i % 3) * 0.08) + ph;
  bpos.x = f.cx + Math.cos(a) * f.u * 2.1 + Math.sin(t * 1.7 + ph) * f.u * 0.3;
  bpos.y = f.cy - f.u * 0.5 + Math.sin(t * 0.9 + ph * 1.3) * f.u * 1.0;
  bpos.z = Math.sin(a);
  bpos.vx = -Math.sin(a) + Math.cos(t * 1.7 + ph) * 0.25;
}

function butterfliesLayer(ctx: CanvasRenderingContext2D, f: EffectFrame, k: Kit, front: boolean) {
  const n = k.lod === 0 ? 2 : k.lod === 1 ? 3 : 4;
  const trail = k.lod === 0 ? 0 : k.lod === 1 ? 4 : 8;
  for (let i = 0; i < n; i++) {
    butterflyPos(f, i, f.time);
    if (bpos.z >= 0 !== front) continue;
    const { x, y, z, vx } = bpos;
    const color = BUTTERFLY_COLORS[(i + Math.floor(f.seed)) % BUTTERFLY_COLORS.length];
    const depth = 0.8 + 0.2 * z;
    const s = f.u * 0.72 * depth;
    const dim = front ? 1 : 0.8;
    // sparkle trail along the recent flight path
    ctx.globalCompositeOperation = "lighter";
    if (trail) {
      const spk = sparkleSprite(color);
      for (let j = trail; j >= 1; j--) {
        butterflyPos(f, i, f.time - j * 0.07);
        const fall = 1 - j / (trail + 1);
        const tw = 0.6 + 0.4 * Math.sin(f.time * 9 + j * 1.7 + i);
        ctx.globalAlpha = f.alpha * fall * 0.55 * tw * dim;
        blit(ctx, spk, bpos.x, bpos.y + j * f.u * 0.015, s * 0.7 * fall);
      }
    }
    const flapPhase = f.time * 9 + i * 1.3;
    const open = 0.22 + 0.78 * Math.abs(Math.sin(flapPhase));
    const bob = Math.cos(flapPhase * 2) * f.u * 0.03;
    ctx.globalAlpha = f.alpha * 0.4 * dim * (0.6 + 0.4 * open);
    blit(ctx, glowSprite(color), x, y + bob, s * 2.8);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = f.alpha * 0.95 * dim;
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.rotate(Math.max(-0.45, Math.min(0.45, vx * 0.35)) + Math.sin(f.time * 2 + i) * 0.08);
    const wing = wingSprite(color);
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.scale(side * open, 1);
      ctx.drawImage(wing, 0, -s / 2, s, s);
      ctx.restore();
    }
    // body + antennae
    ctx.fillStyle = "#2a1838";
    ctx.beginPath();
    ctx.ellipse(0, s * 0.02, s * 0.045, s * 0.24, 0, 0, TAU);
    ctx.fill();
    if (k.lod === 2) {
      ctx.strokeStyle = "rgba(42, 24, 56, 0.85)";
      ctx.lineWidth = Math.max(0.6, s * 0.02);
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.2);
      ctx.quadraticCurveTo(-s * 0.05, -s * 0.36, -s * 0.13, -s * 0.42);
      ctx.moveTo(0, -s * 0.2);
      ctx.quadraticCurveTo(s * 0.05, -s * 0.36, s * 0.13, -s * 0.42);
      ctx.stroke();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = mixHex(color, "#ffffff", 0.6);
      ctx.beginPath();
      ctx.arc(-s * 0.13, -s * 0.42, s * 0.025, 0, TAU);
      ctx.arc(s * 0.13, -s * 0.42, s * 0.025, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------------------------
// Fireflies
// ---------------------------------------------------------------------------------------------

const FIREFLY_COLORS = ["#d9ff7a", "#f2ff8a", "#b6ff8f", "#ffe27a"];

function firefliesLayer(ctx: CanvasRenderingContext2D, f: EffectFrame, k: Kit, front: boolean) {
  const n = k.lod === 0 ? 7 : k.lod === 1 ? 12 : 22;
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < n; i++) {
    const r1 = hash(i, f.seed + 51);
    const r2 = hash(i, f.seed + 52);
    const r3 = hash(i, f.seed + 53);
    const r4 = hash(i, f.seed + 54);
    const k1 = 0.22 + r1 * 0.22;
    const a = f.time * k1 + r1 * TAU;
    const z = Math.cos(a);
    if (z >= 0 !== front) continue;
    const x = f.cx + (Math.sin(a) * 0.78 + Math.sin(f.time * (0.6 + r2 * 0.5) + r3 * TAU) * 0.22) * f.u * 2.6;
    const y =
      f.cy - f.u * 0.25 + (Math.cos(f.time * (0.3 + r3 * 0.3) + r2 * TAU) * 0.7 + Math.sin(f.time * (0.9 + r4 * 0.6) + r4 * TAU) * 0.3) * f.u * 1.55;
    // bioluminescent pulse: short bright flash over a faint ember
    const ph = frac(f.time * (0.35 + r4 * 0.35) + r2);
    const flash = ph < 0.45 ? Math.pow(Math.sin((ph / 0.45) * Math.PI), 1.5) : 0;
    const depth = 0.75 + 0.25 * z;
    const dim = front ? 1 : 0.65;
    const color = FIREFLY_COLORS[i % FIREFLY_COLORS.length];
    const s = f.u * (0.32 + 0.5 * flash) * depth;
    ctx.globalAlpha = f.alpha * (0.3 + 0.65 * flash) * dim;
    blit(ctx, glowSprite(color), x, y, s * 2);
    ctx.globalAlpha = f.alpha * (0.45 + 0.55 * flash) * dim;
    if (k.lod === 2 && flash > 0.55) blit(ctx, sparkleSprite(color), x, y, f.u * 0.55 * flash * depth);
    else blit(ctx, glowSprite("#fbffe0"), x, y, f.u * (0.14 + 0.1 * flash) * depth);
  }
}

// ---------------------------------------------------------------------------------------------
// Thai frame: gold kanok petals ring the krathong (the pattern on the paper lives in texture.ts)
// ---------------------------------------------------------------------------------------------

const order: number[] = [];

function thaiLayer(ctx: CanvasRenderingContext2D, f: EffectFrame, k: Kit, front: boolean) {
  const n = k.lod === 0 ? 12 : k.lod === 1 ? 16 : 24;
  const R = f.u * 1.95;
  const ry = R * k.tilt;
  const off = f.seed + f.time * 0.04;
  const sweep = f.time * 1.1 + f.seed;
  order.length = 0;
  for (let i = 0; i < n; i++) {
    const s = Math.sin((i / n) * TAU + off);
    if (s >= 0 === front) order.push(i);
  }
  order.sort((a, b) => Math.sin((a / n) * TAU + off) - Math.sin((b / n) * TAU + off));
  const petal = kanokSprite(false);
  const glint = kanokSprite(true);
  if (!front && k.lod > 0) {
    // warm gold light pooled inside the crown
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = f.alpha * (0.3 + 0.08 * Math.sin(f.time * 1.5 + f.seed));
    const gs = glowSprite("#ffc847");
    ctx.drawImage(gs, f.cx - R * 1.25, f.base - ry * 1.6, R * 2.5, ry * 3.2);
  }
  for (const i of order) {
    const a = (i / n) * TAU + off;
    const s = Math.sin(a);
    const c = Math.cos(a);
    const x = f.cx + c * R;
    const y = f.base + s * ry;
    const depth = 0.8 + 0.2 * s;
    const hgt = f.u * 0.6 * depth;
    const wid = hgt * 0.72;
    // highlight sweeping around the ring
    let d = (((a - sweep) % TAU) + TAU) % TAU;
    if (d > Math.PI) d -= TAU;
    const hl = Math.exp(-d * d * 5);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(c * 0.3);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = f.alpha * (front ? 1 : 0.8);
    ctx.drawImage(petal, -wid / 2, -hgt, wid, hgt);
    if (hl > 0.04) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = f.alpha * hl * 0.7;
      ctx.drawImage(glint, -wid / 2, -hgt, wid, hgt);
      if (k.lod > 0) {
        ctx.globalAlpha = f.alpha * hl;
        blit(ctx, sparkleSprite("#ffe7a3"), wid * 0.14, -hgt * 0.97, hgt * 0.9);
      }
    }
    ctx.restore();
  }
  // gold band tying the petals together
  ctx.globalCompositeOperation = "source-over";
  waterArc(ctx, f.cx, f.base, R, ry, front);
  ctx.strokeStyle = "#8a5a12";
  ctx.lineWidth = Math.max(1.2, f.u * 0.1);
  ctx.globalAlpha = f.alpha * (front ? 1 : 0.8);
  ctx.stroke();
  ctx.strokeStyle = "#ffd77a";
  ctx.lineWidth = Math.max(0.8, f.u * 0.035);
  ctx.stroke();
  if (front && k.lod > 0) {
    // beads + glow along the near side of the band
    const beads = k.lod === 2 ? 18 : 10;
    ctx.fillStyle = "#fff0b0";
    ctx.beginPath();
    const br = Math.max(0.8, f.u * 0.035);
    for (let j = 0; j < beads; j++) {
      const b = ((j + 0.5) / beads) * Math.PI;
      const bx = f.cx + Math.cos(b) * R;
      const by = f.base + Math.sin(b) * ry;
      ctx.moveTo(bx + br, by);
      ctx.arc(bx, by, br, 0, TAU);
    }
    ctx.fill();
    // the sweep's light pooling on the band while it passes the near side
    const near = Math.sin(sweep);
    if (near > 0) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = f.alpha * 0.3 * near;
      blit(ctx, glowSprite("#ffd27a"), f.cx + Math.cos(sweep) * R, f.base + near * ry, f.u * 1.2);
    }
  }
  if (!front) return;
  // gold leaf on the paper catching the candle light
  ctx.globalCompositeOperation = "lighter";
  const glints = k.lod === 0 ? 2 : k.lod === 1 ? 4 : 7;
  const spk = sparkleSprite("#ffe7a3");
  for (let j = 0; j < glints; j++) {
    const h1 = hash(j, f.seed + 61);
    const h2 = hash(j, f.seed + 62);
    const tw = Math.pow(Math.max(0, Math.sin(f.time * (1.1 + h2 * 0.9) + h1 * TAU)), 10);
    if (tw < 0.03) continue;
    const edge = j % 2 === 0;
    const gx = f.cx + (edge ? (h1 < 0.5 ? -0.78 : 0.78) : h1 * 1.56 - 0.78) * f.u;
    const gy = f.cy - f.u * 0.7 + (edge ? h2 : j % 4 === 1 ? 0 : 1) * (f.base - f.u * 0.2 - (f.cy - f.u * 0.7));
    ctx.globalAlpha = f.alpha * tw;
    blit(ctx, spk, gx, gy, f.u * 0.5 * (0.6 + 0.4 * tw));
  }
}

// ---------------------------------------------------------------------------------------------
// Rainbow
// ---------------------------------------------------------------------------------------------

const RAINBOW_MOTES = ["#b18cff", "#6aa8ff", "#7dffb0", "#ffe66b", "#ffb46b", "#ff7a8a"];

const rainbowBack: Paint = (ctx, f, k) => {
  ctx.globalCompositeOperation = "lighter";
  const Ro = f.u * 3.1;
  const breathe = 0.82 + 0.18 * Math.sin(f.time * 0.8 + f.seed);
  const spr = rainbowSprite(false);
  const sc = Ro / RB_R;
  const dx = f.cx - (RB_W / 2) * sc;
  const dy = f.base - (RB_W / 2) * sc;
  const dw = RB_W * sc;
  const dh = (RB_W / 2) * sc;
  ctx.globalAlpha = f.alpha * 0.5 * breathe;
  ctx.drawImage(spr, dx, dy, dw, dh);
  // faint secondary bow with reversed colours
  if (k.lod === 2) {
    const sc2 = (f.u * 3.75) / RB_R;
    ctx.globalAlpha = f.alpha * 0.13 * breathe;
    ctx.drawImage(rainbowSprite(true), f.cx - (RB_W / 2) * sc2, f.base - (RB_W / 2) * sc2, RB_W * sc2, (RB_W / 2) * sc2);
    // mirrored in the water
    ctx.save();
    ctx.translate(0, f.base);
    ctx.scale(1, -0.32);
    ctx.globalAlpha = f.alpha * 0.14 * breathe;
    ctx.drawImage(spr, dx, -dh, dw, dh);
    ctx.restore();
  }
  // shimmer travelling along the arc
  if (k.lod > 0) {
    const q = frac(f.time * 0.11 + f.seed * 0.3);
    const ang = Math.PI * (1.08 + q * 0.84);
    // nested wedges build a soft-edged band of extra light
    const env = Math.sin(q * Math.PI);
    const wedges = k.lod === 2 ? 4 : 1;
    for (let j = 1; j <= wedges; j++) {
      const half = (0.26 * j) / wedges;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(f.cx, f.base);
      ctx.arc(f.cx, f.base, Ro * 1.05, ang - half, ang + half);
      ctx.closePath();
      ctx.clip();
      ctx.globalAlpha = (f.alpha * 0.5 * env) / wedges;
      ctx.drawImage(spr, dx, dy, dw, dh);
      ctx.restore();
    }
    ctx.globalAlpha = f.alpha * 0.7 * Math.sin(q * Math.PI);
    blit(ctx, sparkleSprite("#ffffff"), f.cx + Math.cos(ang) * Ro * 0.84, f.base + Math.sin(ang) * Ro * 0.84, f.u * 0.7);
  }
  // mist where the bow touches the water
  const mist = glowSprite("#e8f0ff");
  ctx.globalAlpha = f.alpha * 0.22 * breathe;
  for (const side of [-1, 1]) ctx.drawImage(mist, f.cx + side * Ro * 0.84 - f.u * 0.9, f.base - f.u * 0.35, f.u * 1.8, f.u * 0.6);
  // light motes drifting along the bands
  const n = k.lod === 0 ? 5 : k.lod === 1 ? 10 : 16;
  for (let i = 0; i < n; i++) {
    const h1 = hash(i, f.seed + 71);
    const h2 = hash(i, f.seed + 72);
    const h3 = hash(i, f.seed + 73);
    const th = Math.PI * (1.06 + frac(h1 + f.time * 0.025 * (0.5 + h2)) * 0.88);
    const r = Ro * (0.72 + h3 * 0.26);
    const x = f.cx + Math.cos(th) * r;
    const y = f.base + Math.sin(th) * r + Math.sin(f.time * 1.2 + i) * f.u * 0.06;
    const tw = 0.5 + 0.5 * Math.sin(f.time * (2 + h2 * 2) + h1 * TAU);
    const color = RAINBOW_MOTES[Math.min(RAINBOW_MOTES.length - 1, Math.floor(h3 * RAINBOW_MOTES.length))];
    ctx.globalAlpha = f.alpha * (0.3 + 0.6 * tw);
    if (k.lod === 2 && i % 3 === 0) blit(ctx, sparkleSprite(color), x, y, f.u * (0.3 + 0.25 * tw));
    else blit(ctx, glowSprite(color), x, y, f.u * (0.14 + 0.08 * tw));
  }
};

// ---------------------------------------------------------------------------------------------
// Golden aura
// ---------------------------------------------------------------------------------------------

function auraRings(ctx: CanvasRenderingContext2D, f: EffectFrame, k: Kit, front: boolean) {
  const pulse = 0.5 + 0.5 * Math.sin(f.time * 1.8 + f.seed);
  const R = f.u * 2;
  const ry = R * k.tilt;
  ctx.globalCompositeOperation = "lighter";
  waterArc(ctx, f.cx, f.base, R, ry, front);
  ctx.strokeStyle = "#ffcf5a";
  ctx.lineWidth = Math.max(1.5, f.u * 0.16);
  ctx.globalAlpha = f.alpha * (0.18 + 0.1 * pulse);
  ctx.stroke();
  ctx.strokeStyle = "#fff1c1";
  ctx.lineWidth = Math.max(0.8, f.u * 0.04);
  ctx.globalAlpha = f.alpha * (0.55 + 0.3 * pulse);
  ctx.stroke();
  if (k.lod === 0) return;
  // ripples of light spreading over the water
  ctx.strokeStyle = "#ffd27a";
  ctx.lineWidth = Math.max(0.8, f.u * 0.035);
  for (let j = 0; j < 2; j++) {
    const q = frac(f.time * 0.3 + j / 2 + f.seed * 0.1);
    const rr = f.u * (1.4 + q * 1.5);
    waterArc(ctx, f.cx, f.base, rr, rr * k.tilt, front);
    ctx.globalAlpha = f.alpha * (1 - q) * 0.45;
    ctx.stroke();
  }
}

const auraBack: Paint = (ctx, f, k) => {
  ctx.globalCompositeOperation = "lighter";
  const pulse = 0.5 + 0.5 * Math.sin(f.time * 1.8 + f.seed);
  const hy = f.cy - f.u * 0.1;
  // pulsing halo
  ctx.globalAlpha = f.alpha * (0.3 + 0.15 * pulse);
  blit(ctx, glowSprite("#ffc847"), f.cx, hy, f.u * (k.lod === 2 ? 4.8 + pulse * 0.6 : 3.8 + pulse * 0.4));
  // god rays: two pre-baked fans turning in opposite directions, breathing out of step
  // small lanterns get one fan: these sprites are large, keep overdraw down in the crowded scene
  const sets = k.lod === 2 ? 2 : 1;
  for (let set = 0; set < sets; set++) {
    const fan = set === 0 ? fanSprite("#ffd27a", 16, 0.2, 0.68, 81) : fanSprite("#fff1c1", 11, 0.12, 0.6, 97);
    const reach = f.u * (set === 0 ? (k.lod === 2 ? 3.4 : 2.9) : 2.8) * (0.95 + 0.05 * Math.sin(f.time * 1.3 + set * 2));
    ctx.save();
    ctx.translate(f.cx, hy);
    ctx.rotate(f.seed + (set === 0 ? f.time * 0.12 : -f.time * 0.08 + 0.3));
    ctx.globalAlpha = f.alpha * (set === 0 ? 0.6 : 0.5) * (0.75 + 0.25 * Math.sin(f.time * (set === 0 ? 1.1 : 1.7) + set * 2.4));
    ctx.drawImage(fan, -reach, -reach, reach * 2, reach * 2);
    ctx.restore();
  }
  // aureole ring behind the lantern
  if (k.lod === 2) {
    ctx.globalAlpha = f.alpha * (0.35 + 0.3 * pulse);
    blit(ctx, ringSprite("#ffcf5a"), f.cx, f.cy - f.u * 0.25, f.u * (4.3 + pulse * 0.25));
  }
  auraRings(ctx, f, k, false);
};

const auraFront: Paint = (ctx, f, k) => {
  auraRings(ctx, f, k, true);
  // gold dust rising from the water
  ctx.globalCompositeOperation = "lighter";
  const n = k.lod === 0 ? 8 : k.lod === 1 ? 16 : 28;
  const dust = glowSprite("#ffd27a");
  const spk = sparkleSprite("#ffe7a3");
  for (let i = 0; i < n; i++) {
    const h1 = hash(i, f.seed + 91);
    const h2 = hash(i, f.seed + 92);
    const h3 = hash(i, f.seed + 93);
    const p = frac(f.time / (3 + h1 * 2) + h2);
    const x = f.cx + (h3 - 0.5) * f.u * 3.4 + Math.sin(f.time * 1.2 + i) * f.u * 0.15;
    const y = f.base - p * f.u * 3.6;
    const a = f.alpha * Math.sin(p * Math.PI);
    if (k.lod > 0 && i % 4 === 0) {
      const tw = 0.5 + 0.5 * Math.sin(f.time * 4 + i);
      ctx.globalAlpha = a * (0.5 + 0.5 * tw);
      blit(ctx, spk, x, y, f.u * (0.25 + 0.2 * tw));
    } else {
      ctx.globalAlpha = a * 0.8;
      blit(ctx, dust, x, y, f.u * 0.13);
    }
  }
};

// ---------------------------------------------------------------------------------------------

const FX: Partial<Record<EffectId, { back?: Paint; front?: Paint }>> = {
  fireworks: { back: fireworksBack, front: fireworksFront },
  hearts: { front: heartsFront },
  stars: { back: (c, f, k) => starsLayer(c, f, k, false), front: (c, f, k) => starsLayer(c, f, k, true) },
  petals: { back: (c, f, k) => petalsLayer(c, f, k, false), front: (c, f, k) => petalsLayer(c, f, k, true) },
  butterflies: { back: (c, f, k) => butterfliesLayer(c, f, k, false), front: (c, f, k) => butterfliesLayer(c, f, k, true) },
  fireflies: { back: (c, f, k) => firefliesLayer(c, f, k, false), front: (c, f, k) => firefliesLayer(c, f, k, true) },
  "thai-frame": { back: (c, f, k) => thaiLayer(c, f, k, false), front: (c, f, k) => thaiLayer(c, f, k, true) },
  rainbow: { back: rainbowBack },
  "golden-aura": { back: auraBack, front: auraFront },
};

const kit: Kit = { lod: 0, tilt: 0.3 };

export function drawEffects(ctx: CanvasRenderingContext2D, effects: readonly EffectId[] | undefined, f: EffectFrame, layer: "back" | "front") {
  if (!effects?.length || f.alpha < 0.02) return;
  kit.lod = lodFor(f.u);
  kit.tilt = waterTilt(f);
  ctx.save();
  for (const fx of effects) {
    const paint = FX[fx]?.[layer];
    if (!paint) continue;
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = f.alpha;
    paint(ctx, f, kit);
  }
  ctx.restore();
}

function star4(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - s * 2);
  ctx.quadraticCurveTo(x, y, x + s * 2, y);
  ctx.quadraticCurveTo(x, y, x, y + s * 2);
  ctx.quadraticCurveTo(x, y, x - s * 2, y);
  ctx.quadraticCurveTo(x, y, x, y - s * 2);
  ctx.fill();
}

/** Prominent gold coin badge showing how much money was put into the lantern */
export function drawOfferingBadge(ctx: CanvasRenderingContext2D, amount: number, x: number, top: number, u: number, alpha: number, time: number) {
  if (!amount || amount <= 0 || alpha < 0.05) return;
  const font = Math.max(13, Math.min(30, u * 0.62));
  const label = `฿${amount.toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `600 ${font}px "Kanit", "Noto Sans Thai", sans-serif`;
  const textW = ctx.measureText(label).width;
  const coinR = font * 0.62;
  const padX = font * 0.45;
  const h = font * 1.55;
  const w = coinR * 2 + padX * 3 + textW;
  const y = top - h - u * 0.35 + Math.sin(time * 1.6) * font * 0.08;
  const bx = x - w / 2;

  // glow
  ctx.globalCompositeOperation = "lighter";
  const g = glowSprite("#F5B942");
  ctx.globalAlpha = alpha * 0.6;
  ctx.drawImage(g, x - w, y - h * 0.6, w * 2, h * 2.2);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = alpha;

  // pill
  ctx.beginPath();
  const r = h / 2;
  ctx.moveTo(bx + r, y);
  ctx.arcTo(bx + w, y, bx + w, y + h, r);
  ctx.arcTo(bx + w, y + h, bx, y + h, r);
  ctx.arcTo(bx, y + h, bx, y, r);
  ctx.arcTo(bx, y, bx + w, y, r);
  ctx.closePath();
  ctx.fillStyle = "rgba(14, 18, 40, 0.88)";
  ctx.fill();
  ctx.lineWidth = Math.max(1, font * 0.09);
  ctx.strokeStyle = "#ffd27a";
  ctx.stroke();

  // coin
  const cx = bx + padX + coinR;
  const cy = y + h / 2;
  const cg = ctx.createRadialGradient(cx - coinR * 0.35, cy - coinR * 0.35, coinR * 0.1, cx, cy, coinR);
  cg.addColorStop(0, "#fff3c4");
  cg.addColorStop(0.55, "#f5b942");
  cg.addColorStop(1, "#b9781c");
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.arc(cx, cy, coinR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#7a4a0c";
  ctx.font = `700 ${coinR * 1.25}px "Kanit", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("฿", cx, cy + coinR * 0.05);
  // coin sparkle
  const sp = (Math.sin(time * 3) + 1) / 2;
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = alpha * sp;
  ctx.fillStyle = "#ffffff";
  star4(ctx, cx + coinR * 0.6, cy - coinR * 0.6, coinR * 0.18);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = alpha;

  // amount
  ctx.fillStyle = "#ffe7a3";
  ctx.font = `600 ${font}px "Kanit", "Noto Sans Thai", sans-serif`;
  ctx.textAlign = "left";
  ctx.fillText(label, cx + coinR + padX, cy + font * 0.04);
  ctx.restore();
}
