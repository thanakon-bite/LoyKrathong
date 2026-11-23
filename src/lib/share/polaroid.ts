import type { LanternVisual } from "@/types/lantern";
import { drawHalo, drawLantern, drawReflection } from "@/lib/lantern/render";
import { buildFaceTextures, ensureLanternFonts, loadImage, wrapText } from "@/lib/lantern/texture";
import { LANTERN_DESIGNS } from "@/lib/lantern/designs";
import { hashString, seededRandom } from "@/lib/utils";

/** Instagram / Facebook story size */
export const STORY_W = 1080;
export const STORY_H = 1920;

interface PolaroidOptions {
  /** Host shown under the card, e.g. loykrathong.app */
  host: string;
  /** Date line on the card */
  dateLabel?: string;
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

function heart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.35);
  ctx.bezierCurveTo(x - s * 1.1, y - s * 0.45, x - s * 0.45, y - s * 1.15, x, y - s * 0.45);
  ctx.bezierCurveTo(x + s * 0.45, y - s * 1.15, x + s * 1.1, y - s * 0.45, x, y + s * 0.35);
  ctx.fill();
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.quadraticCurveTo(x, y, x + s, y);
  ctx.quadraticCurveTo(x, y, x, y + s);
  ctx.quadraticCurveTo(x, y, x - s, y);
  ctx.quadraticCurveTo(x, y, x, y - s);
  ctx.fill();
}

/** The "photo" inside the polaroid: the user's lantern floating on night water among other lanterns */
async function drawPhoto(ctx: CanvasRenderingContext2D, visual: LanternVisual, w: number, h: number, seed: number) {
  const horizon = h * 0.36;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, "#060a18");
  sky.addColorStop(1, "#18224a");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizon);
  const water = ctx.createLinearGradient(0, horizon, 0, h);
  water.addColorStop(0, "#101a3c");
  water.addColorStop(1, "#03050d");
  ctx.fillStyle = water;
  ctx.fillRect(0, horizon, w, h - horizon);

  // full moon
  const mx = w * 0.8;
  const my = horizon * 0.42;
  const halo = ctx.createRadialGradient(mx, my, 10, mx, my, 160);
  halo.addColorStop(0, "rgba(255,236,200,0.35)");
  halo.addColorStop(1, "rgba(255,236,200,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, horizon);
  ctx.fillStyle = "#fff4dc";
  ctx.beginPath();
  ctx.arc(mx, my, 34, 0, Math.PI * 2);
  ctx.fill();

  // distant lanterns
  const r = seededRandom(seed);
  const others: Array<{ x: number; y: number; s: number; yaw: number }> = [];
  for (let i = 0; i < 14; i++) {
    const depth = r();
    others.push({ x: r() * w, y: horizon + 14 + depth * h * 0.32, s: 14 + depth * 46, yaw: -0.6 + r() * 0.5 });
  }
  others.sort((a, b) => a.y - b.y);
  for (const o of others) {
    drawReflection(ctx, o.x, o.y, o.s, "#F5B942", 1, 0.8, 1, o.x);
    drawHalo(ctx, o.x, o.y - o.s * 0.6, o.s, "#F5B942", 1, 0.8, 0.8);
  }
  for (const o of others) {
    drawLantern(ctx, { x: o.x, y: o.y, size: o.s, yaw: o.yaw, pitch: 0.25, glow: 1, alpha: 0.9, design: "classic-golden", light: "#F5B942", time: 1, halo: false });
  }

  // the user's lantern
  await ensureLanternFonts([visual.textConfig.font]);
  const [image, drawing] = await Promise.all([
    visual.imageSrc ? loadImage(visual.imageSrc).catch(() => null) : null,
    visual.drawingSrc ? loadImage(visual.drawingSrc).catch(() => null) : null,
  ]);
  const textures = buildFaceTextures(visual, { image, drawing });
  const size = w * 0.34;
  const lx = w * 0.5;
  const ly = h * 0.84;
  drawReflection(ctx, lx, ly + size * 0.05, size, visual.color, 1, 1, 2, seed);
  drawHalo(ctx, lx, ly - size * 0.6, size, visual.color, 1, 1, 1.1);
  drawLantern(ctx, {
    x: lx,
    y: ly,
    size,
    yaw: -0.42,
    pitch: 0.34,
    glow: 1,
    alpha: 1,
    design: visual.design,
    shape: visual.shape,
    light: visual.color,
    effects: visual.effects,
    offering: visual.offering,
    textures,
    time: 1.3,
    halo: false,
    seed,
  });

  // soft film vignette
  const vg = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.78);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
}

/**
 * Renders a cute polaroid postcard (1080×1920, story format) of a lantern.
 * Everything is drawn on a canvas so it can be shared as an image file.
 */
export async function renderPolaroid(visual: LanternVisual, opts: PolaroidOptions): Promise<HTMLCanvasElement> {
  await Promise.all([
    ensureLanternFonts(["sriracha", "kanit"]),
    document.fonts?.load('500 40px "Kanit"').catch(() => undefined),
  ]);
  const seed = hashString(visual.displayName + visual.wishMessage);
  const rnd = seededRandom(seed);
  const c = document.createElement("canvas");
  c.width = STORY_W;
  c.height = STORY_H;
  const ctx = c.getContext("2d")!;

  // ---------- background: warm night bokeh ----------
  const bg = ctx.createLinearGradient(0, 0, 0, STORY_H);
  bg.addColorStop(0, "#0b1230");
  bg.addColorStop(0.55, "#1a1838");
  bg.addColorStop(1, "#2a1a2a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, STORY_W, STORY_H);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 46; i++) {
    const x = rnd() * STORY_W;
    const y = rnd() * STORY_H;
    const r = 18 + rnd() * 70;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const warm = rnd() < 0.75;
    g.addColorStop(0, warm ? "rgba(255,200,110,0.22)" : "rgba(255,170,200,0.16)");
    g.addColorStop(1, "rgba(255,200,110,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.restore();

  // header
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffd27a";
  ctx.font = '500 40px "Kanit", "Noto Sans Thai", sans-serif';
  ctx.fillText("✦ ลอยกระทงออนไลน์ 2569 ✦", STORY_W / 2, 200);
  ctx.fillStyle = "rgba(255,246,230,0.85)";
  ctx.font = '400 54px "Sriracha", "Noto Sans Thai", cursive';
  ctx.fillText("ส่งคำอธิษฐานลอยไปกับสายน้ำ", STORY_W / 2, 280);

  // ---------- polaroid card ----------
  const cardW = 880;
  const pad = 46;
  const photo = cardW - pad * 2;
  const captionH = 330;
  const cardH = pad + photo + captionH;
  const cx = STORY_W / 2;
  const cy = 360 + cardH / 2;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.035);
  ctx.translate(-cardW / 2, -cardH / 2);

  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 28;
  ctx.fillStyle = "#fbf7ee";
  roundRect(ctx, 0, 0, cardW, cardH, 14);
  ctx.fill();
  ctx.shadowColor = "transparent";

  // paper texture
  const r2 = seededRandom(seed + 7);
  ctx.fillStyle = "rgba(120, 90, 50, 0.035)";
  for (let i = 0; i < 900; i++) ctx.fillRect(r2() * cardW, r2() * cardH, 2, 2);

  // photo
  const pc = document.createElement("canvas");
  pc.width = photo;
  pc.height = photo;
  await drawPhoto(pc.getContext("2d")!, visual, photo, photo, seed);
  ctx.drawImage(pc, pad, pad);
  ctx.strokeStyle = "rgba(0,0,0,0.08)";
  ctx.lineWidth = 2;
  ctx.strokeRect(pad, pad, photo, photo);

  // caption (handwriting)
  const ink = "#3b2a1c";
  ctx.textAlign = "center";
  ctx.fillStyle = ink;
  const wish = visual.wishMessage || visual.blessingMessage || visual.extraMessage || "ขอให้ทุกคำอธิษฐานเป็นจริง";
  let px = 58;
  let lines: string[] = [];
  for (let i = 0; i < 6; i++) {
    ctx.font = `400 ${px}px "Sriracha", "Noto Sans Thai", cursive`;
    lines = wrapText(ctx, wish, cardW - 120);
    if (lines.length <= 3) break;
    px *= 0.88;
  }
  if (lines.length > 3) {
    lines = lines.slice(0, 3);
    lines[2] = lines[2].replace(/.{0,2}$/u, "…");
  }
  const capTop = pad + photo + 34;
  const lineH = px * 1.3;
  const blockTop = capTop + (190 - lines.length * lineH) / 2;
  lines.forEach((line, i) => ctx.fillText(line, cardW / 2, blockTop + (i + 0.8) * lineH));

  ctx.textAlign = "right";
  ctx.font = '400 40px "Sriracha", "Noto Sans Thai", cursive';
  ctx.fillStyle = "#7a5233";
  ctx.fillText(`— ${visual.displayName}`, cardW - 60, capTop + 238);
  ctx.textAlign = "left";
  ctx.font = '400 28px "Kanit", "Noto Sans Thai", sans-serif';
  ctx.fillStyle = "rgba(90, 60, 30, 0.55)";
  ctx.fillText(opts.dateLabel ?? "ลอยกระทง · 24 พ.ย. 2569", 60, capTop + 238);

  // doodles on the card
  ctx.fillStyle = "#e0457b";
  heart(ctx, 70, capTop + 30, 18);
  ctx.fillStyle = "#f5b942";
  star(ctx, cardW - 66, capTop + 26, 16);

  ctx.restore();

  // ---------- washi tape ----------
  const tape = (x: number, y: number, rot: number, color: string) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.78;
    ctx.fillRect(-95, -26, 190, 52);
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "#ffffff";
    for (let i = -90; i < 95; i += 22) ctx.fillRect(i, -26, 9, 52);
    ctx.restore();
  };
  tape(cx - cardW / 2 + 70, 380, -0.62, "#ffb3c7");
  tape(cx + cardW / 2 - 60, 372, 0.55, "#ffd27a");

  // ---------- stickers around ----------
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = "#ffe6a6";
  for (const [x, y, s] of [
    [120, 1560, 22],
    [960, 1500, 28],
    [80, 640, 16],
    [1000, 860, 18],
    [930, 300, 14],
  ] as const)
    star(ctx, x, y, s);
  ctx.restore();
  ctx.fillStyle = "#ff8fb1";
  heart(ctx, 990, 1620, 24);
  heart(ctx, 96, 1380, 18);

  // ---------- footer ----------
  const footY = 360 + cardH + 150;
  const design = LANTERN_DESIGNS[visual.design];
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,246,230,0.9)";
  ctx.font = '400 40px "Kanit", "Noto Sans Thai", sans-serif';
  ctx.fillText("แตะลิงก์เพื่อดูโคมของฉันลอยอยู่บนสายน้ำ", STORY_W / 2, footY);
  ctx.fillStyle = "#ffd27a";
  ctx.font = '500 44px "Kanit", "Noto Sans Thai", sans-serif';
  ctx.fillText(opts.host, STORY_W / 2, footY + 70);
  ctx.fillStyle = "rgba(255,246,230,0.45)";
  ctx.font = '400 28px "Kanit", "Noto Sans Thai", sans-serif';
  ctx.fillText(`โคม${design.nameTh}`, STORY_W / 2, footY + 122);

  return c;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png", quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), type, quality));
}
