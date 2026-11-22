import { LANTERN_DESIGNS } from "@/lib/lantern/designs";
import { TEX_H, TEX_W } from "@/lib/lantern/texture";
import { mixHex } from "@/lib/utils";
import type { LanternDesignId } from "@/types/lantern";

/** Lit paper background for the flat face editors (matches the 3D renderer colours) */
export function paintPaper(ctx: CanvasRenderingContext2D, design: LanternDesignId, light: string) {
  const d = LANTERN_DESIGNS[design];
  const lit = mixHex(d.paperLit, light, 0.5);
  const g = ctx.createRadialGradient(TEX_W / 2, TEX_H * 1.02, TEX_W * 0.05, TEX_W / 2, TEX_H * 0.85, TEX_H * 1.15);
  g.addColorStop(0, mixHex(lit, "#fff7e2", 0.45));
  g.addColorStop(0.35, lit);
  g.addColorStop(1, mixHex(mixHex(d.paper, light, 0.35), "#3a1c06", 0.25));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, TEX_W, TEX_H);
}
