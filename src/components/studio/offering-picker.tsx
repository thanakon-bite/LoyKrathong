"use client";

import { useState } from "react";
import { Coins } from "lucide-react";
import type { OfferingSettings } from "@/types/catalog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Props {
  /** catalog offering settings (null while loading) */
  settings: OfferingSettings | null | undefined;
  value: number;
  onChange: (amount: number) => void;
  disabled?: boolean;
  className?: string;
}

const thb = (v: number) => v.toLocaleString("th-TH", { maximumFractionDigits: 2 });

/** Problem with an offering amount (outside the admin's range), else null */
export function offeringProblem(settings: OfferingSettings | null | undefined, v: number): string | null {
  if (!settings || !v) return null;
  if (!settings.enabled) return "ปิดการใส่เงินลงกระทงชั่วคราว";
  if (v < settings.min || v > settings.max) return `ใส่เงินได้ตั้งแต่ ฿${thb(settings.min)} ถึง ฿${thb(settings.max)}`;
  return null;
}

/** "ใส่เงินลงกระทง" – gold coin presets from the catalog + any amount */
export function OfferingPicker({ settings, value, onChange, disabled, className }: Props) {
  const [typed, setCustom] = useState("");
  if (!settings) return <Skeleton className={cn("h-24 rounded-2xl", className)} />;
  // an amount that is not one of the coins shows in the input (e.g. typed earlier in the studio)
  const custom = typed || (value > 0 && !settings.presets.includes(value) ? String(value) : "");
  const set = (v: number) => onChange(Math.max(0, Math.round(v * 100) / 100));
  const problem = offeringProblem(settings, value);
  const coin = (on: boolean) =>
    cn(
      "relative grid aspect-square place-items-center rounded-full border-2 text-sm font-bold tabular-nums transition active:scale-95 disabled:opacity-50",
      on
        ? "border-[#fff1b8] bg-[radial-gradient(circle_at_35%_30%,#fff6c9_0%,#f5c842_38%,#c98a12_80%,#8a5a0a_100%)] text-[#4a2c02] shadow-[0_0_22px_-2px_rgba(245,185,66,0.9),inset_0_-3px_6px_rgba(90,50,0,0.45)]"
        : "border-gold/35 bg-[radial-gradient(circle_at_35%_30%,rgba(255,236,170,0.22)_0%,rgba(245,185,66,0.1)_55%,rgba(120,70,10,0.12)_100%)] text-gold hover:border-gold/70",
    );
  return (
    <div className={cn("space-y-3", className)}>
      <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-5">
        <button
          type="button"
          disabled={disabled}
          aria-pressed={value === 0}
          onClick={() => {
            setCustom("");
            set(0);
          }}
          className={cn(
            "grid aspect-square place-items-center rounded-full border-2 border-dashed text-xs transition active:scale-95",
            value === 0 ? "border-warm/70 bg-white/10 text-warm" : "border-white/15 text-warm/55 hover:border-white/30",
          )}
        >
          ไม่ใส่
        </button>
        {settings.presets.map((v) => {
          const on = value === v && !custom;
          return (
            <button
              key={v}
              type="button"
              disabled={disabled}
              aria-pressed={on}
              aria-label={`ใส่เงิน ${thb(v)} บาท`}
              onClick={() => {
                setCustom("");
                set(v);
              }}
              className={coin(on)}
            >
              {/* embossed inner ring */}
              <span className={cn("pointer-events-none absolute inset-[11%] rounded-full border", on ? "border-[#8a5a0a]/35" : "border-gold/15")} aria-hidden />
              <span className="relative leading-none">
                <span className="text-[0.7em] font-semibold opacity-75">฿</span>
                {thb(v)}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Coins className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gold" />
          <Input
            inputMode="decimal"
            aria-label="ใส่จำนวนเงินเอง (บาท)"
            placeholder="ใส่จำนวนเอง"
            className={cn("h-10 rounded-full pl-9 pr-10 text-base", custom && "border-gold/60")}
            disabled={disabled}
            value={custom}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^0-9.]/g, "").slice(0, 8);
              setCustom(raw);
              set(Number(raw) || 0);
            }}
          />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-warm/50">บาท</span>
        </div>
      </div>
      <p className={cn("text-xs", problem ? "text-red-300" : "text-warm/50")}>
        {problem ?? `ใส่ได้ ฿${thb(settings.min)} – ฿${thb(settings.max)} · ยอดเงินจะแสดงเป็นเหรียญทองบนหัวโคมในเทศกาล`}
      </p>
    </div>
  );
}
