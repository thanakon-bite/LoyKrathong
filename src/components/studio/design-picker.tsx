"use client";

import { Check } from "lucide-react";
import { LANTERN_DESIGNS, LANTERN_SHAPES, LIGHT_COLORS } from "@/lib/lantern/designs";
import { LANTERN_DESIGN_IDS, LANTERN_SHAPE_IDS, type LanternDesignId, type LanternShapeId } from "@/types/lantern";
import { Label } from "@/components/ui/label";
import { cn, mixHex } from "@/lib/utils";
import { priceLabel } from "@/hooks/use-catalog";
import type { CatalogItem } from "@/types/catalog";

interface Props {
  design: LanternDesignId;
  shape: LanternShapeId;
  color: string;
  onDesign: (d: LanternDesignId) => void;
  onShape: (s: LanternShapeId) => void;
  onColor: (c: string) => void;
  /** prices from the catalog (null while loading) */
  prices: CatalogItem[] | null;
  /** shape prices (empty = only the classic box is offered) */
  shapePrices: CatalogItem[] | null;
}

/** Small silhouette icon for each krathong shape */
function ShapeIcon({ shape, glow }: { shape: LanternShapeId; glow: string }) {
  const fill = `url(#shape-grad-${shape})`;
  return (
    <svg viewBox="0 0 48 48" className="mx-auto mb-2 size-12 drop-shadow-[0_0_10px_rgba(245,185,66,0.55)] transition group-hover:-translate-y-0.5 sm:size-14" aria-hidden>
      <defs>
        <radialGradient id={`shape-grad-${shape}`} cx="50%" cy="70%" r="75%">
          <stop offset="0%" stopColor="#fffbe8" />
          <stop offset="45%" stopColor={glow} />
          <stop offset="100%" stopColor="#8a4d12" />
        </radialGradient>
      </defs>
      {/* banana-leaf krathong base */}
      <path d="M6 40 Q10 34 14 38 Q18 33 22 38 Q24 33 26 38 Q30 33 34 38 Q38 34 42 40 Q24 46 6 40Z" fill="#3f7d3a" />
      {shape === "box" && <path d="M13 14 L35 14 L35 38 L13 38Z" fill={fill} stroke="#7a4a12" strokeWidth="1" />}
      {shape === "heart" && <path d="M24 38 C10 29 9 21 11 17 C13 12 20 11 24 17 C28 11 35 12 37 17 C39 21 38 29 24 38Z" fill={fill} stroke="#7a4a12" strokeWidth="1" />}
      {shape === "moon" && (
        <>
          <circle cx="24" cy="25" r="13" fill={fill} stroke="#7a4a12" strokeWidth="1" />
          <circle cx="19" cy="21" r="2.2" fill="#000" opacity="0.08" />
          <circle cx="28" cy="29" r="3" fill="#000" opacity="0.07" />
        </>
      )}
      {shape === "rabbit" && (
        <path
          d="M18 38 C12 38 11 31 14 27 C13 23 15 20 18 19 C16 12 16 6 19 6 C22 6 22 13 22 18 C23 13 25 7 28 8 C31 9 28 16 26 20 C30 21 33 25 33 30 C36 31 37 35 34 37 C32 38 26 38 18 38Z"
          fill={fill}
          stroke="#7a4a12"
          strokeWidth="1"
        />
      )}
    </svg>
  );
}

const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v);

export function DesignPicker({ design, shape, color, onDesign, onShape, onColor, prices, shapePrices }: Props) {
  const preset = LIGHT_COLORS.find((c) => c.value.toUpperCase() === color.toUpperCase());
  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="mb-3 text-sm font-medium text-warm/85">รูปทรงกระทง</legend>
        <div className="grid grid-cols-4 gap-2 sm:gap-3">
          {LANTERN_SHAPE_IDS.map((id) => {
            const meta = LANTERN_SHAPES[id];
            const item = shapePrices?.find((p) => p.code === id);
            // only the box until the shapes exist in the catalog; afterwards hidden when the admin switches one off
            if (shapePrices && (shapePrices.length ? !item : id !== "box")) return null;
            const price = item?.price ?? 0;
            const active = id === shape;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onShape(id)}
                aria-pressed={active}
                title={meta.description}
                className={cn(
                  "group relative overflow-hidden rounded-2xl border p-2 text-center transition sm:p-3",
                  active ? "border-gold bg-gold/10 shadow-[0_0_24px_-8px_rgba(245,185,66,0.8)]" : "border-white/10 bg-white/[0.03] hover:border-gold/40",
                )}
              >
                <ShapeIcon shape={id} glow={color} />
                <p className="text-xs font-medium leading-tight text-warm sm:text-sm">{meta.nameTh}</p>
                {shapePrices && (
                  <span className={cn("absolute left-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold", price > 0 ? "bg-gold/90 text-night" : "bg-white/10 text-warm/70")}>
                    {priceLabel(price)}
                  </span>
                )}
                {active && <Check className="absolute right-1.5 top-1.5 size-4 text-gold" />}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-3 text-sm font-medium text-warm/85">ลายกระดาษ</legend>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3">
          {LANTERN_DESIGN_IDS.map((id) => {
            const d = LANTERN_DESIGNS[id];
            const item = prices?.find((p) => p.code === id);
            // hidden by the admin
            if (prices && !item) return null;
            const price = item?.price ?? 0;
            const active = id === design;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onDesign(id)}
                aria-pressed={active}
                className={cn(
                  "group relative overflow-hidden rounded-2xl border p-2.5 text-center transition sm:p-3 sm:text-left",
                  active ? "border-gold bg-gold/10 shadow-[0_0_24px_-8px_rgba(245,185,66,0.8)]" : "border-white/10 bg-white/[0.03] hover:border-gold/40",
                )}
              >
                <div
                  className="mx-auto mb-2 h-12 w-10 rounded-[6px] sm:mb-3 sm:h-16 sm:w-14 shadow-[0_0_24px_-4px_rgba(245,185,66,0.6)] transition group-hover:-translate-y-0.5"
                  style={{
                    background: `radial-gradient(ellipse at 50% 100%, ${mixHex(d.paperLit, "#ffffff", 0.3)} 0%, ${mixHex(d.paperLit, d.defaultLight, 0.45)} 45%, ${mixHex(d.paper, "#3a1c06", 0.25)} 100%)`,
                  }}
                />
                <p className="text-sm font-medium text-warm">{d.nameTh}</p>
                <p className="hidden text-xs text-warm/50 sm:block">{d.name}</p>
                {prices && (
                  <span
                    className={cn(
                      "absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      price > 0 ? "bg-gold/90 text-night" : "bg-white/10 text-warm/70",
                    )}
                  >
                    {priceLabel(price)}
                  </span>
                )}
                {active && <Check className="absolute right-2 top-2 size-4 text-gold" />}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div>
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <Label>สีแสงไฟ</Label>
          <span className="text-xs text-warm/55">{preset?.label ?? `สีที่เลือกเอง ${color.toUpperCase()}`}</span>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {LIGHT_COLORS.map((c) => {
            const on = color.toUpperCase() === c.value.toUpperCase();
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => onColor(c.value)}
                aria-label={c.label}
                title={c.label}
                aria-pressed={on}
                className={cn("grid size-9 place-items-center rounded-full border-2 transition hover:scale-110", on ? "border-warm" : "border-transparent")}
              >
                <span className="size-6 rounded-full" style={{ background: c.value, boxShadow: `0 0 ${on ? 18 : 10}px ${c.value}` }} />
              </button>
            );
          })}
          {/* any colour */}
          <label
            title="เลือกสีเอง"
            className={cn("relative grid size-9 cursor-pointer place-items-center rounded-full border-2 transition hover:scale-110", !preset ? "border-warm" : "border-transparent")}
          >
            <span className="size-6 rounded-full bg-[conic-gradient(#ff4d6d,#ffb36b,#fff27a,#7dffc8,#6fe3ff,#9f8cff,#ff7eb6,#ff4d6d)]" />
            <input
              type="color"
              aria-label="เลือกสีแสงไฟเอง"
              value={isHex(color) ? color : "#F5B942"}
              onChange={(e) => isHex(e.target.value) && onColor(e.target.value.toUpperCase())}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
            />
          </label>
        </div>
      </div>
    </div>
  );
}
