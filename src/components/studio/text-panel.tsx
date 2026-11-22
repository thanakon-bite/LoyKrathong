"use client";

import { AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart } from "lucide-react";
import { INK_COLORS, LANTERN_FONTS, LIMITS } from "@/lib/lantern/designs";
import { LANTERN_FONT_IDS, type TextConfig, type TextPosition } from "@/types/lantern";
import type { LanternDraft } from "@/hooks/use-lantern-draft";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface Props {
  draft: LanternDraft;
  errors: Partial<Record<"displayName" | "content", string>>;
  onChange: (patch: Partial<LanternDraft>) => void;
}

function Counter({ value, max }: { value: string; max: number }) {
  return (
    <span className={cn("text-xs tabular-nums", value.length > max * 0.9 ? "text-amber" : "text-warm/40")}>
      {value.length}/{max}
    </span>
  );
}

const POSITIONS: Array<{ id: TextPosition; label: string; icon: typeof AlignVerticalJustifyStart }> = [
  { id: "top", label: "ด้านบน", icon: AlignVerticalJustifyStart },
  { id: "center", label: "กึ่งกลาง", icon: AlignVerticalJustifyCenter },
  { id: "bottom", label: "ด้านล่าง", icon: AlignVerticalJustifyEnd },
];

export function TextPanel({ draft, errors, onChange }: Props) {
  const tc = draft.textConfig;
  const setTc = (p: Partial<TextConfig>) => onChange({ textConfig: { ...tc, ...p } });

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="displayName">ชื่อผู้ปล่อยโคม *</Label>
          <Counter value={draft.displayName} max={LIMITS.displayName} />
        </div>
        <Input
          id="displayName"
          value={draft.displayName}
          maxLength={LIMITS.displayName}
          placeholder="เช่น บี, ครอบครัวสุขใจ"
          aria-invalid={!!errors.displayName}
          autoComplete="nickname"
          onChange={(e) => onChange({ displayName: e.target.value })}
        />
        {errors.displayName && <p className="text-xs text-red-300">{errors.displayName}</p>}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="wish">คำอธิษฐาน (ด้านหน้าโคม)</Label>
          <Counter value={draft.wishMessage} max={LIMITS.wishMessage} />
        </div>
        <Textarea
          id="wish"
          rows={3}
          value={draft.wishMessage}
          maxLength={LIMITS.wishMessage}
          placeholder="ขอให้ครอบครัวมีความสุข สุขภาพแข็งแรง…"
          onChange={(e) => onChange({ wishMessage: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="blessing">คำอวยพร (ด้านข้างโคม)</Label>
          <Counter value={draft.blessingMessage} max={LIMITS.blessingMessage} />
        </div>
        <Textarea
          id="blessing"
          rows={3}
          value={draft.blessingMessage}
          maxLength={LIMITS.blessingMessage}
          placeholder={"ขอบคุณสำหรับทุกสิ่ง\nโชคดีตลอดปี"}
          onChange={(e) => onChange({ blessingMessage: e.target.value })}
        />
        <p className="text-xs text-warm/40">ขึ้นบรรทัดใหม่เพื่อแยกแต่ละคำอวยพร</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="extra">ข้อความเพิ่มเติม</Label>
          <Counter value={draft.extraMessage} max={LIMITS.extraMessage} />
        </div>
        <Input
          id="extra"
          value={draft.extraMessage}
          maxLength={LIMITS.extraMessage}
          placeholder="เช่น ลอยกระทง 2569"
          onChange={(e) => onChange({ extraMessage: e.target.value })}
        />
      </div>
      {errors.content && <p className="text-xs text-red-300">{errors.content}</p>}

      <div className="space-y-2 border-t border-white/5 pt-5">
        <Label>ฟอนต์</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {LANTERN_FONT_IDS.map((id) => {
            const f = LANTERN_FONTS[id];
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTc({ font: id })}
                aria-pressed={tc.font === id}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-left transition",
                  tc.font === id ? "border-gold bg-gold/10" : "border-white/10 hover:border-gold/40",
                )}
              >
                <span className="block text-lg leading-tight text-warm" style={{ fontFamily: `"${f.family}"`, fontWeight: f.weight }}>
                  สุขสันต์
                </span>
                <span className="text-[11px] text-warm/50">{f.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <Label>สีตัวอักษร</Label>
        <div className="flex flex-wrap items-center gap-2">
          {INK_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`สี ${c}`}
              aria-pressed={tc.color.toLowerCase() === c.toLowerCase()}
              onClick={() => setTc({ color: c })}
              className={cn(
                "size-8 rounded-full border-2 transition",
                tc.color.toLowerCase() === c.toLowerCase() ? "scale-110 border-gold" : "border-white/20 hover:border-white/50",
              )}
              style={{ background: c }}
            />
          ))}
          <label className="relative grid size-8 cursor-pointer place-items-center overflow-hidden rounded-full border-2 border-dashed border-white/30 text-xs text-warm/60">
            +
            <input
              type="color"
              aria-label="เลือกสีเอง"
              value={tc.color}
              onChange={(e) => setTc({ color: e.target.value })}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>ขนาดตัวอักษร</Label>
          <span className="text-xs text-warm/50">{Math.round(tc.size * 100)}%</span>
        </div>
        <Slider min={0.7} max={1.5} step={0.05} value={[tc.size]} onValueChange={([v]) => setTc({ size: v })} aria-label="ขนาดตัวอักษร" />
      </div>

      <div className="space-y-2">
        <Label>ตำแหน่งข้อความบนโคม</Label>
        <div className="grid grid-cols-3 gap-2">
          {POSITIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={tc.position === id}
              onClick={() => setTc({ position: id })}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl border py-2.5 text-xs transition",
                tc.position === id ? "border-gold bg-gold/10 text-warm" : "border-white/10 text-warm/60 hover:border-gold/40",
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
