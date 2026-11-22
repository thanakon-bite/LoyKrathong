import type { EffectId } from "@/types/lantern";
import { glowSprite } from "./render-sprites";

/**
 * Animated add-on effects drawn around a lantern (Canvas 2D).
 * "back" effects are painted before the lantern body, "front" effects after it.
 * All motion is a pure function of time + seed, so every client sees the same thing.
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

const BACK: ReadonlySet<EffectId> = new Set(["rainbow", "golden-aura"]);
const FIREWORK_COLORS = ["#ffd27a", "#ff7eb6", "#7fe3ff", "#ffffff", "#ff9f4a", "#c8a6ff"];

function star4(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - s * 2);
  ctx.quadraticCurveTo(x, y, x + s * 2, y);
  ctx.quadraticCurveTo(x, y, x, y + s * 2);
  ctx.quadraticCurveTo(x, y, x - s * 2, y);
  ctx.quadraticCurveTo(x, y, x, y - s * 2);
  ctx.fill();
}

function heart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.35);
  ctx.bezierCurveTo(x - s * 1.1, y - s * 0.45, x - s * 0.45, y - s * 1.15, x, y - s * 0.45);
  ctx.bezierCurveTo(x + s * 0.45, y - s * 1.15, x + s * 1.1, y - s * 0.45, x, y + s * 0.35);
  ctx.fill();
}

const frac = (v: number) => v - Math.floor(v);

function fireworks(ctx: CanvasRenderingContext2D, f: EffectFrame) {
  const period = 2.8;
  ctx.globalCompositeOperation = "lighter";
  for (let b = 0; b < 2; b++) {
    const cycle = (f.time + b * 1.4 + f.seed) / period;
    const n = Math.floor(cycle);
    const p = frac(cycle);
    // each burst gets its own position and colour
    const r1 = frac(Math.sin((n + b * 7 + f.seed) * 12.9898) * 43758.5453);
    const r2 = frac(Math.sin((n + b * 3 + f.seed) * 78.233) * 12543.123);
    const bx = f.cx + (r1 - 0.5) * f.u * 2.6;
    const by = f.top - f.u * (1.4 + r2 * 1.2);
    const color = FIREWORK_COLORS[Math.floor(r1 * FIREWORK_COLORS.length)];
    if (p < 0.12) {
      // rising trail
      const t = p / 0.12;
      ctx.globalAlpha = f.alpha * 0.9;
      ctx.fillStyle = "#fff4d6";
      const y = f.top + (by - f.top) * t;
      ctx.beginPath();
      ctx.arc(bx, y, Math.max(1, f.u * 0.05), 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    const t = (p - 0.12) / 0.88;
    const ease = 1 - Math.pow(1 - t, 3);
    const radius = f.u * 1.5 * ease;
    const fade = Math.pow(1 - t, 1.6);
    ctx.fillStyle = color;
    const sparks = 18;
    for (let i = 0; i < sparks; i++) {
      const a = (i / sparks) * Math.PI * 2 + r2;
      const x = bx + Math.cos(a) * radius;
      const y = by + Math.sin(a) * radius + t * t * f.u * 0.5; // a little gravity
      ctx.globalAlpha = f.alpha * fade;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.8, f.u * 0.045 * (1 - t * 0.5)), 0, Math.PI * 2);
      ctx.fill();
      // short trail
      ctx.globalAlpha = f.alpha * fade * 0.35;
      ctx.beginPath();
      ctx.arc(bx + Math.cos(a) * radius * 0.82, by + Math.sin(a) * radius * 0.82, Math.max(0.6, f.u * 0.03), 0, Math.PI * 2);
      ctx.fill();
    }
    if (t < 0.25) {
      const g = glowSprite(color);
      const s = f.u * 1.6 * (1 - t * 3);
      ctx.globalAlpha = f.alpha * 0.5 * (1 - t * 4);
      ctx.drawImage(g, bx - s, by - s, s * 2, s * 2);
    }
  }
}

function hearts(ctx: CanvasRenderingContext2D, f: EffectFrame) {
  ctx.globalCompositeOperation = "source-over";
  for (let i = 0; i < 5; i++) {
    const p = frac(f.time * 0.28 + i / 5 + f.seed * 0.1);
    const x = f.cx + Math.sin(p * 6 + i * 1.7) * f.u * 0.9;
    const y = f.top - p * f.u * 3;
    const s = f.u * 0.2 * (0.6 + p * 0.5);
    ctx.globalAlpha = f.alpha * Math.sin(p * Math.PI) * 0.9;
    ctx.fillStyle = i % 2 ? "#ff7eb6" : "#ff4f8b";
    heart(ctx, x, y, s);
  }
}

function stars(ctx: CanvasRenderingContext2D, f: EffectFrame) {
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = "#fff6d8";
  for (let i = 0; i < 7; i++) {
    const a = f.time * 0.5 + (i / 7) * Math.PI * 2 + f.seed;
    const r = f.u * (2.3 + Math.sin(f.time * 1.3 + i) * 0.25);
    const x = f.cx + Math.cos(a) * r;
    const y = f.cy + Math.sin(a) * r * 0.45 - f.u * 0.4;
    ctx.globalAlpha = f.alpha * (0.55 + 0.45 * Math.sin(f.time * 2.4 + i));
    star4(ctx, x, y, f.u * (0.06 + 0.035 * Math.sin(f.time * 3 + i * 2)));
  }
}

function petals(ctx: CanvasRenderingContext2D, f: EffectFrame) {
  ctx.globalCompositeOperation = "source-over";
  for (let i = 0; i < 6; i++) {
    const a = -f.time * 0.3 + (i / 6) * Math.PI * 2 + f.seed * 2;
    const r = f.u * 1.9;
    const x = f.cx + Math.cos(a) * r;
    const y = f.base - f.u * 0.2 + Math.sin(a) * r * 0.3;
    ctx.globalAlpha = f.alpha * 0.85;
    ctx.fillStyle = i % 2 ? "#ffb3c7" : "#ffd1dc";
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a * 2);
    ctx.beginPath();
    ctx.ellipse(0, 0, f.u * 0.15, f.u * 0.065, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function butterflies(ctx: CanvasRenderingContext2D, f: EffectFrame) {
  const colors = ["#a6f0ff", "#d8b4ff", "#ffe08a"];
  for (let i = 0; i < 3; i++) {
    const t = f.time * 0.8 + i * 2.1 + f.seed;
    const x = f.cx + Math.cos(t * 0.7) * f.u * 2 + Math.sin(t * 1.9) * f.u * 0.3;
    const y = f.cy - f.u * 0.6 + Math.sin(t * 1.1) * f.u * 1.1;
    const flap = 0.35 + 0.65 * Math.abs(Math.sin(f.time * 11 + i * 1.3));
    const s = f.u * 0.22;
    const dir = Math.cos(t * 0.7 + Math.PI / 2) > 0 ? 1 : -1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(dir, 1);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = f.alpha * 0.35;
    const g = glowSprite(colors[i]);
    ctx.drawImage(g, -s * 2.2, -s * 2.2, s * 4.4, s * 4.4);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = f.alpha * 0.9;
    ctx.fillStyle = colors[i];
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * s * 0.55 * flap, -s * 0.15, s * 0.6 * flap, s * 0.45, side * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(side * s * 0.4 * flap, s * 0.35, s * 0.38 * flap, s * 0.3, side * -0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#3a2a1c";
    ctx.fillRect(-s * 0.06, -s * 0.5, s * 0.12, s * 1.05);
    ctx.restore();
  }
}

function fireflies(ctx: CanvasRenderingContext2D, f: EffectFrame) {
  const g = glowSprite("#d9ff7a");
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 10; i++) {
    const k = 0.6 + (i % 4) * 0.25;
    const x = f.cx + Math.sin(f.time * 0.3 * k + i * 2.4 + f.seed) * f.u * 2.6;
    const y = f.cy + Math.cos(f.time * 0.4 * k + i * 1.3) * f.u * 1.5 - f.u * 0.3;
    const blink = Math.pow((Math.sin(f.time * 2.6 + i * 1.7) + 1) / 2, 2);
    const s = f.u * 0.32;
    ctx.globalAlpha = f.alpha * blink;
    ctx.drawImage(g, x - s, y - s, s * 2, s * 2);
    ctx.fillStyle = "#f4ffcc";
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.8, f.u * 0.04), 0, Math.PI * 2);
    ctx.fill();
  }
}

function rainbow(ctx: CanvasRenderingContext2D, f: EffectFrame) {
  const bands = ["#ff6b6b", "#ffa94d", "#ffe066", "#69db7c", "#4dabf7", "#9775fa"];
  ctx.globalCompositeOperation = "source-over";
  ctx.lineWidth = Math.max(1, f.u * 0.13);
  const shimmer = 0.75 + 0.25 * Math.sin(f.time * 0.8 + f.seed);
  bands.forEach((c, i) => {
    ctx.strokeStyle = c;
    ctx.globalAlpha = f.alpha * 0.22 * shimmer;
    ctx.beginPath();
    ctx.arc(f.cx, f.base, f.u * (3.3 - i * 0.13), Math.PI, Math.PI * 2);
    ctx.stroke();
  });
}

function goldenAura(ctx: CanvasRenderingContext2D, f: EffectFrame) {
  ctx.globalCompositeOperation = "lighter";
  // slow rotating rays
  ctx.save();
  ctx.translate(f.cx, f.cy);
  ctx.rotate(f.time * 0.15 + f.seed);
  ctx.fillStyle = "#ffd27a";
  for (let i = 0; i < 12; i++) {
    ctx.rotate((Math.PI * 2) / 12);
    ctx.globalAlpha = f.alpha * (0.08 + 0.05 * Math.sin(f.time * 2 + i));
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-f.u * 0.18, -f.u * 3);
    ctx.lineTo(f.u * 0.18, -f.u * 3);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  // glowing ring on the water
  ctx.globalAlpha = f.alpha * (0.55 + 0.2 * Math.sin(f.time * 1.6));
  ctx.strokeStyle = "#ffd27a";
  ctx.lineWidth = Math.max(1, f.u * 0.06);
  ctx.beginPath();
  ctx.ellipse(f.cx, f.base, f.u * 2, f.u * 0.55, 0, 0, Math.PI * 2);
  ctx.stroke();
}

const DRAW: Partial<Record<EffectId, (ctx: CanvasRenderingContext2D, f: EffectFrame) => void>> = {
  fireworks,
  hearts,
  stars,
  petals,
  butterflies,
  fireflies,
  rainbow,
  "golden-aura": goldenAura,
  // "thai-frame" is printed on the paper (see texture.ts)
};

export function drawEffects(ctx: CanvasRenderingContext2D, effects: readonly EffectId[] | undefined, f: EffectFrame, layer: "back" | "front") {
  if (!effects?.length || f.alpha < 0.02) return;
  ctx.save();
  for (const fx of effects) {
    if (BACK.has(fx) !== (layer === "back")) continue;
    DRAW[fx]?.(ctx, f);
  }
  ctx.restore();
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
