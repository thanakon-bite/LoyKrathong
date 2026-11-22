import { seededRandom } from "@/lib/utils";
import { glowSprite } from "@/lib/lantern/render";

interface Mote {
  x: number;
  y: number;
  r: number;
  speed: number;
  sway: number;
  phase: number;
}

/** Floating golden light motes */
export class Particles {
  private motes: Mote[] = [];

  constructor(count: number) {
    this.setCount(count);
  }

  setCount(count: number) {
    const r = seededRandom(1234);
    this.motes = Array.from({ length: count }, () => ({
      x: r(),
      y: r(),
      r: 1.2 + r() * 2.8,
      speed: 0.004 + r() * 0.01,
      sway: 6 + r() * 20,
      phase: r() * Math.PI * 2,
    }));
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, time: number) {
    const sprite = glowSprite("#FFD27A");
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const m of this.motes) {
      const y = (((m.y - time * m.speed) % 1) + 1) % 1;
      const x = m.x * w + Math.sin(time * 0.5 + m.phase) * m.sway;
      const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * 1.7 + m.phase * 3));
      const s = m.r * 4;
      ctx.globalAlpha = twinkle * 0.55 * Math.min(1, y * 4);
      ctx.drawImage(sprite, x - s, y * h - s, s * 2, s * 2);
    }
    ctx.restore();
  }
}
