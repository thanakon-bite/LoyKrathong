"use client";

import { FACE_LABEL_TH, facesForShape, type LanternFaceId, type LanternShapeId } from "@/types/lantern";
import { cn } from "@/lib/utils";

const SHORT: Record<LanternFaceId, string> = { front: "หน้า", right: "ขวา", back: "หลัง", left: "ซ้าย" };

interface Props {
  shape: LanternShapeId;
  value: LanternFaceId;
  onChange: (face: LanternFaceId) => void;
  /** walls that already carry something (small dot) */
  marks?: Partial<Record<LanternFaceId, boolean>>;
  className?: string;
}

/** Which wall of the lantern the photo / drawing goes on (box: 4 walls, heart / moon / rabbit: front + back) */
export function FacePicker({ shape, value, onChange, marks, className }: Props) {
  const faces = facesForShape(shape);
  return (
    <div role="radiogroup" aria-label="เลือกด้านของโคม" className={cn("flex items-center gap-2", className)}>
      <span className="shrink-0 text-xs text-warm/60">ด้าน</span>
      <div className="flex flex-1 rounded-full border border-white/10 bg-white/5 p-0.5">
        {faces.map((f) => {
          const on = f === value;
          return (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={FACE_LABEL_TH[f]}
              onClick={() => onChange(f)}
              className={cn(
                "relative flex h-8 flex-1 items-center justify-center rounded-full text-xs font-medium transition",
                on ? "bg-gold text-night" : "text-warm/70 hover:text-warm",
              )}
            >
              {SHORT[f]}
              {marks?.[f] && <span aria-hidden className={cn("ml-1 size-1.5 rounded-full", on ? "bg-night/70" : "bg-gold")} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
