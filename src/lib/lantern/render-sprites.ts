import { rgba } from "@/lib/utils";

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
/** Subtle paper fibre texture (shared by the cube walls and the shaped panels) */
export function fiberCanvas(): HTMLCanvasElement {
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

/** Device-pixel scale of the current canvas transform, bucketed so sprite caches stay small */
export function pixelScale(ctx: CanvasRenderingContext2D): number {
  const m = ctx.getTransform();
  const s = Math.hypot(m.a, m.b);
  return s <= 1.1 ? 1 : s <= 1.6 ? 1.5 : s <= 2.2 ? 2 : 3;
}

/** Bounded LRU lookup: a hit moves the entry to the back (Map keeps insertion order) */
export function cacheGet<V>(map: Map<string, V>, key: string): V | undefined {
  const v = map.get(key);
  if (v !== undefined) {
    map.delete(key);
    map.set(key, v);
  }
  return v;
}

/** Bounded LRU insert: drops the least recently used entry once full */
export function cachePut<V>(map: Map<string, V>, key: string, value: V, max: number) {
  if (map.size >= max) {
    const first = map.keys().next().value;
    if (first !== undefined) map.delete(first);
  }
  map.set(key, value);
}
