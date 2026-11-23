"use client";

import { Check } from "lucide-react";
import { EFFECT_META } from "@/lib/lantern/effects-meta";
import { priceLabel } from "@/hooks/use-catalog";
import { cn } from "@/lib/utils";
import { isEffectId, type EffectId } from "@/types/lantern";
import type { CatalogItem } from "@/types/catalog";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  items: CatalogItem[] | null;
  value: EffectId[];
  onChange: (v: EffectId[]) => void;
}

export function EffectsPicker({ items, value, onChange }: Props) {
  const toggle = (id: EffectId) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  const total = (items ?? []).filter((i) => value.includes(i.code as EffectId)).reduce((s, i) => s + i.price, 0);

  return (
    <div className="space-y-2 lg:space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-warm/85 lg:text-sm">
          เอฟเฟกต์ (เลือกได้หลายอัน)
          {value.length > 0 && (
            <span className="ml-1.5 font-normal text-warm/60 lg:hidden">
              · {value.length} อย่าง <span className="text-gold">฿{total.toLocaleString("th-TH")}</span>
            </span>
          )}
        </p>
        {value.length > 0 && (
          <button type="button" className="text-xs text-warm/50 underline" onClick={() => onChange([])}>
            ล้าง
          </button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {!items && [...Array(9)].map((_, i) => <Skeleton key={i} className="h-[4.5rem] rounded-2xl lg:h-24" />)}
        {items?.map((it) => {
          if (!isEffectId(it.code)) return null;
          const id = it.code;
          const meta = EFFECT_META[id];
          const on = value.includes(id);
          return (
            <button
              key={it.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(id)}
              title={meta.hint}
              className={cn(
                "relative flex flex-col items-center gap-0.5 rounded-2xl border px-1.5 py-2 text-center transition lg:gap-1 lg:py-3",
                on ? "border-gold bg-gold/12 shadow-[0_0_24px_-8px_rgba(245,185,66,0.8)]" : "border-white/10 bg-white/[0.03] hover:border-gold/40",
              )}
            >
              <span className="text-xl leading-none lg:text-2xl" aria-hidden>
                {meta.emoji}
              </span>
              <span className="line-clamp-1 text-xs font-medium text-warm lg:text-sm">{it.name || meta.nameTh}</span>
              <span className={cn("text-[11px] font-semibold", on ? "text-gold" : "text-warm/55")}>{priceLabel(it.price)}</span>
              {on && <Check className="absolute right-1.5 top-1.5 size-3.5 text-gold" />}
            </button>
          );
        })}
      </div>
      {value.length > 0 && (
        <p className="hidden text-right text-xs text-warm/60 lg:block">
          เลือกแล้ว {value.length} อย่าง · <span className="text-gold">฿{total.toLocaleString("th-TH")}</span>
        </p>
      )}
    </div>
  );
}
