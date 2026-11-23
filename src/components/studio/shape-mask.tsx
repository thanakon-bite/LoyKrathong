"use client";

import { useId } from "react";
import { silhouetteTexturePath } from "@/lib/lantern/shapes";
import { TEX_H, TEX_W } from "@/lib/lantern/texture";
import type { LanternShapeId } from "@/types/lantern";

const PAD = 4000;

/**
 * Dims the part of a flat face editor that falls outside the krathong silhouette (heart / moon / rabbit),
 * so people see exactly where their photo / drawing lands. Same mapping as the 3D panels. Box: nothing.
 */
export function SilhouetteMask({ shape }: { shape: LanternShapeId }) {
  if (shape === "box") return null;
  const { d } = silhouetteTexturePath(shape);
  return (
    <svg viewBox={`0 0 ${TEX_W} ${TEX_H}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
      <path d={`M${-PAD} ${-PAD}H${TEX_W + PAD}V${TEX_H + PAD}H${-PAD}Z${d}`} fill="rgba(5,9,19,0.66)" fillRule="evenodd" />
      <path d={d} fill="none" stroke="rgba(245,185,66,0.9)" strokeWidth={2} strokeDasharray="8 6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Small lit-paper swatch in the shape of the chosen krathong (design cards) */
export function ShapedPaperSwatch({ shape, inner, mid, outer, className }: { shape: LanternShapeId; inner: string; mid: string; outer: string; className?: string }) {
  const id = useId().replace(/:/g, "");
  const grad = (
    <defs>
      <radialGradient id={`pg${id}`} cx="50%" cy="100%" r="100%">
        <stop offset="0%" stopColor={inner} />
        <stop offset="45%" stopColor={mid} />
        <stop offset="100%" stopColor={outer} />
      </radialGradient>
    </defs>
  );
  if (shape === "box") {
    return (
      <svg viewBox={`0 0 ${TEX_W} ${TEX_H}`} className={className} aria-hidden>
        {grad}
        <rect x={TEX_W * 0.06} y={0} width={TEX_W * 0.88} height={TEX_H} rx={44} fill={`url(#pg${id})`} />
      </svg>
    );
  }
  const { d, box } = silhouetteTexturePath(shape);
  const m = 6;
  return (
    <svg viewBox={`${box.x - m} ${box.y - m} ${box.w + 2 * m} ${box.h + 2 * m}`} className={className} aria-hidden>
      {grad}
      <path d={d} fill={`url(#pg${id})`} stroke="rgba(122,74,18,0.6)" strokeWidth={6} />
    </svg>
  );
}
