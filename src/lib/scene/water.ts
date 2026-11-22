import { seededRandom } from "@/lib/utils";
import { glowSprite } from "@/lib/lantern/render";
import type { View } from "./view";

interface Shimmer {
  /** 0 … 1 depth (0 = horizon) */
  d: number;
  x: number;
  len: number;
  speed: number;
  phase: number;
  warm: boolean;
}

/**
 * Night water background: static layer (sky, moon, distant shore lights) rendered once per resize,
 * plus animated shimmer lines and the moon reflection drawn every frame.
 */
export class WaterBackground {
  private staticLayer: HTMLCanvasElement | null = null;
  private shimmers: Shimmer[] = [];
  private view: View | null = null;
  private dpr = 1;

  constructor(private shimmerCount = 90) {}

  setQuality(shimmerCount: number) {
    this.shimmerCount = shimmerCount;
    this.seedShimmers();
  }

  resize(view: View, dpr: number) {
    this.view = view;
    this.dpr = dpr;
    this.renderStatic();
    this.seedShimmers();
  }

  get moonX() {
    return this.view ? this.view.w * 0.76 : 0;
  }

  private seedShimmers() {
    const r = seededRandom(42);
    this.shimmers = Array.from({ length: this.shimmerCount }, () => ({
      d: Math.pow(r(), 1.6),
      x: r(),
      len: 0.4 + r() * 0.9,
      speed: 0.2 + r() * 0.6,
      phase: r() * Math.PI * 2,
      warm: r() < 0.35,
    }));
  }

  private renderStatic() {
    const v = this.view;
    if (!v) return;
    const c = this.staticLayer ?? document.createElement("canvas");
    c.width = Math.round(v.w * this.dpr);
    c.height = Math.round(v.h * this.dpr);
    const g = c.getContext("2d")!;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // sky
    const sky = g.createLinearGradient(0, 0, 0, v.horizon);
    sky.addColorStop(0, "#03050d");
    sky.addColorStop(0.55, "#070c1d");
    sky.addColorStop(1, "#12193a");
    g.fillStyle = sky;
    g.fillRect(0, 0, v.w, v.horizon + 1);

    // stars
    const r = seededRandom(7);
    for (let i = 0; i < Math.round((v.w * v.horizon) / 5000); i++) {
      const x = r() * v.w;
      const y = r() * v.horizon * 0.92;
      g.fillStyle = `rgba(255, 245, 225, ${0.15 + r() * 0.5})`;
      g.fillRect(x, y, r() < 0.1 ? 1.6 : 1, r() < 0.1 ? 1.6 : 1);
    }

    // full moon (Loy Krathong is on the full moon of the 12th lunar month)
    const mr = Math.max(14, Math.min(v.w, v.h) * 0.038);
    const mx = this.moonX;
    const my = v.horizon * 0.36;
    const halo = g.createRadialGradient(mx, my, mr * 0.8, mx, my, mr * 7);
    halo.addColorStop(0, "rgba(255, 236, 200, 0.28)");
    halo.addColorStop(0.4, "rgba(255, 220, 170, 0.07)");
    halo.addColorStop(1, "rgba(255, 220, 170, 0)");
    g.fillStyle = halo;
    g.fillRect(0, 0, v.w, v.horizon);
    const moon = g.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
    moon.addColorStop(0, "#fffaf0");
    moon.addColorStop(1, "#f3dcb0");
    g.fillStyle = moon;
    g.beginPath();
    g.arc(mx, my, mr, 0, Math.PI * 2);
    g.fill();

    // distant shore glow + tiny far lanterns on the horizon
    const shore = g.createLinearGradient(0, v.horizon - 40, 0, v.horizon + 30);
    shore.addColorStop(0, "rgba(245, 185, 66, 0)");
    shore.addColorStop(0.6, "rgba(245, 185, 66, 0.10)");
    shore.addColorStop(1, "rgba(245, 185, 66, 0)");
    g.fillStyle = shore;
    g.fillRect(0, v.horizon - 40, v.w, 70);

    // water
    const water = g.createLinearGradient(0, v.horizon, 0, v.h);
    water.addColorStop(0, "#0c1430");
    water.addColorStop(0.25, "#070d20");
    water.addColorStop(1, "#010309");
    g.fillStyle = water;
    g.fillRect(0, v.horizon, v.w, v.h - v.horizon);

    const dotSprite = glowSprite("#F5B942");
    const r2 = seededRandom(99);
    for (let i = 0; i < Math.round(v.w / 9); i++) {
      const x = r2() * v.w;
      const y = v.horizon + 1 + r2() * 5;
      const s = 2 + r2() * 5;
      g.globalAlpha = 0.25 + r2() * 0.5;
      g.drawImage(dotSprite, x - s, y - s, s * 2, s * 2);
    }
    g.globalAlpha = 1;
    g.fillStyle = "rgba(255, 214, 140, 0.18)";
    g.fillRect(0, v.horizon, v.w, 1);

    this.staticLayer = c;
  }

  draw(ctx: CanvasRenderingContext2D, time: number) {
    const v = this.view;
    if (!v || !this.staticLayer) return;
    ctx.drawImage(this.staticLayer, 0, 0, v.w, v.h);

    const waterH = v.h - v.horizon;
    // moon reflection – broken golden-white column
    const mx = this.moonX;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 26; i++) {
      const d = i / 26;
      const y = v.horizon + 3 + Math.pow(d, 1.5) * waterH * 0.8;
      const w = (6 + d * 60) * (0.55 + 0.45 * Math.sin(time * 1.2 + i * 1.9));
      const x = mx + Math.sin(time * 0.9 + i * 2.3) * (4 + d * 16);
      ctx.fillStyle = `rgba(255, 232, 190, ${0.16 * (1 - d * 0.8)})`;
      ctx.beginPath();
      ctx.ellipse(x, y, Math.max(1, w), 1 + d * 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // gentle ripples
    for (const s of this.shimmers) {
      const y = v.horizon + 2 + s.d * waterH;
      const persp = 0.15 + s.d * 1.2;
      const x = ((s.x + time * 0.004 * s.speed) % 1) * v.w;
      const len = s.len * 40 * persp;
      const a = (0.03 + 0.07 * (0.5 + 0.5 * Math.sin(time * s.speed * 1.4 + s.phase))) * (0.4 + s.d);
      ctx.fillStyle = s.warm ? `rgba(245, 185, 66, ${a})` : `rgba(150, 175, 230, ${a})`;
      ctx.beginPath();
      ctx.ellipse(x, y + Math.sin(time * s.speed + s.phase) * 1.5 * persp, len, Math.max(0.5, 0.9 * persp), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
