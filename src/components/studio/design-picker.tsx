"use client";

import { Check } from "lucide-react";
import { LANTERN_DESIGNS, LIGHT_COLORS } from "@/lib/lantern/designs";
import { LANTERN_DESIGN_IDS, type LanternDesignId } from "@/types/lantern";
import { Label } from "@/components/ui/label";
import { cn, mixHex } from "@/lib/utils";
import { priceLabel } from "@/hooks/use-catalog";
import type { CatalogItem } from "@/types/catalog";

interface Props {
  design: LanternDesignId;
  color: string;
  onDesign: (d: LanternDesignId) => void;
  onColor: (c: string) => void;
  /** prices from the catalog (null while loading) */
  prices: CatalogItem[] | null;
}

export function DesignPicker({ design, color, onDesign, onColor, prices }: Props) {
  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="mb-3 text-sm font-medium text-warm/85">รูปแบบโคม</legend>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
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
        <Label className="mb-3 block">สีแสงไฟ</Label>
        <div className="flex flex-wrap gap-3">
          {LIGHT_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => onColor(c.value)}
              aria-label={c.label}
              aria-pressed={color.toUpperCase() === c.value.toUpperCase()}
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition",
                color.toUpperCase() === c.value.toUpperCase() ? "border-gold bg-gold/10 text-warm" : "border-white/10 text-warm/70 hover:border-gold/40",
              )}
            >
              <span className="size-4 rounded-full" style={{ background: c.value, boxShadow: `0 0 10px ${c.value}` }} />
              {c.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
