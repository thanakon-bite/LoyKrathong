import { seededRandom } from "@/lib/utils";
import { TEX_H, TEX_W, type FaceTextures } from "@/lib/lantern/texture";

/**
 * Hand-drawn style scribbles (hearts, stars, flowers, handwriting-like strokes)
 * used ONLY for the decorative background lanterns on the landing page.
 * These are artwork, not user data.
 */
export function buildDoodleTextures(seed: number, resolution = 0.5): FaceTextures {
  const make = (s: number) => {
    const c = document.createElement("canvas");
    c.width = Math.round(TEX_W * resolution);
    c.height = Math.round(TEX_H * resolution);
    const g = c.getContext("2d")!;
    g.setTransform(resolution, 0, 0, resolution, 0, 0);
    const r = seededRandom(s);
    const inks = ["rgba(70,35,10,0.8)", "rgba(150,30,30,0.75)", "rgba(30,40,90,0.7)", "rgba(200,60,40,0.7)"];
    g.lineCap = "round";
    g.lineJoin = "round";

    // handwriting-like lines
    const lines = 2 + Math.floor(r() * 4);
    const top = TEX_H * (0.18 + r() * 0.2);
    g.strokeStyle = inks[Math.floor(r() * inks.length)];
    g.lineWidth = 6;
    for (let i = 0; i < lines; i++) {
      const y = top + i * 62;
      let x = TEX_W * (0.16 + r() * 0.1);
      const end = TEX_W * (0.7 + r() * 0.15);
      g.beginPath();
      g.moveTo(x, y);
      while (x < end) {
        const step = 14 + r() * 10;
        g.quadraticCurveTo(x + step / 2, y - 14 - r() * 12, x + step, y + (r() - 0.5) * 6);
        x += step;
        if (r() < 0.12) {
          x += 14;
          g.moveTo(x, y);
        }
      }
      g.stroke();
    }

    // a symbol: heart / star / flower
    const kind = Math.floor(r() * 3);
    const cx = TEX_W * (0.3 + r() * 0.4);
    const cy = TEX_H * (0.66 + r() * 0.12);
    const size = 40 + r() * 30;
    g.strokeStyle = inks[1 + Math.floor(r() * 3)];
    g.fillStyle = g.strokeStyle;
    g.lineWidth = 7;
    g.beginPath();
    if (kind === 0) {
      g.moveTo(cx, cy + size * 0.8);
      g.bezierCurveTo(cx - size * 1.6, cy - size * 0.2, cx - size * 0.6, cy - size * 1.3, cx, cy - size * 0.4);
      g.bezierCurveTo(cx + size * 0.6, cy - size * 1.3, cx + size * 1.6, cy - size * 0.2, cx, cy + size * 0.8);
      g.globalAlpha = r() < 0.5 ? 0.85 : 0.4;
      g.fill();
      g.globalAlpha = 1;
    } else if (kind === 1) {
      for (let i = 0; i < 11; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rad = i % 2 === 0 ? size : size * 0.45;
        g.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
      }
      g.stroke();
    } else {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        g.moveTo(cx, cy);
        g.ellipse(cx + Math.cos(a) * size * 0.5, cy + Math.sin(a) * size * 0.5, size * 0.42, size * 0.22, a, 0, Math.PI * 2);
      }
      g.stroke();
    }
    return c;
  };
  return { front: make(seed), side: make(seed * 7 + 3) };
}
