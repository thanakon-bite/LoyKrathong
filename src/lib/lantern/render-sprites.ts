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
