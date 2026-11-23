"use client";

import { useState } from "react";
import { AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart, ChevronDown, Plus, Type } from "lucide-react";
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

/** Character counter – only shown once the user starts typing */
function Counter({ value, max }: { value: string; max: number }) {
  if (!value) return null;
  return (
    <span className={cn("text-xs tabular-nums", value.length > max * 0.9 ? "text-amber" : "text-warm/40")}>
      {value.length}/{max}
    </span>
  );
}

/**
 * Desktop: a collapsible card. Phones: one of the sub-pages picked with the chips at the top
 * (`shown`), so the text tab always fits the panel without scrolling.
 */
function Collapsible({
  open,
  onToggle,
  shown,
  icon: Icon,
  label,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  shown: boolean;
  icon: typeof Plus;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("lg:rounded-2xl lg:border lg:border-white/10", !shown && "max-lg:hidden")}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="hidden w-full items-center gap-2 px-4 py-3 text-left text-sm text-warm/80 transition hover:text-warm lg:flex"
      >
        <Icon className="size-4 text-gold" />
        <span className="flex-1">{label}</span>
        <ChevronDown className={cn("size-4 text-warm/50 transition-transform", open && "rotate-180")} />
      </button>
      <div className={cn("space-y-3 lg:space-y-4 lg:border-t lg:border-white/5 lg:px-4 lg:pb-4 lg:pt-3", !open && "lg:hidden")}>{children}</div>
    </div>
  );
}

const SUBPAGES = [
  { id: "main", label: "ชื่อ & คำอธิษฐาน" },
  { id: "side", label: "ข้อความด้านข้าง" },
  { id: "style", label: "ตัวอักษร" },
] as const;
type SubPage = (typeof SUBPAGES)[number]["id"];

const POSITIONS: Array<{ id: TextPosition; label: string; icon: typeof AlignVerticalJustifyStart }> = [
  { id: "top", label: "บน", icon: AlignVerticalJustifyStart },
  { id: "center", label: "กลาง", icon: AlignVerticalJustifyCenter },
  { id: "bottom", label: "ล่าง", icon: AlignVerticalJustifyEnd },
];

export function TextPanel({ draft, errors, onChange }: Props) {
  const tc = draft.textConfig;
  const setTc = (p: Partial<TextConfig>) => onChange({ textConfig: { ...tc, ...p } });
  // optional sections start open only if they already have content
  const [sideOpen, setSideOpen] = useState(Boolean(draft.blessingMessage || draft.extraMessage));
  const [styleOpen, setStyleOpen] = useState(false);
  const [sub, setSub] = useState<SubPage>("main");
  // a (new) validation error is always on the first sub-page – adjust while rendering, not in an effect
  const errorKey = `${errors.displayName ?? ""}|${errors.content ?? ""}`;
  const [seenErrors, setSeenErrors] = useState(errorKey);
  if (errorKey !== seenErrors) {
    setSeenErrors(errorKey);
    if (errors.displayName || errors.content) setSub("main");
  }

  return (
    <div className="space-y-3 lg:space-y-4">
      <div role="tablist" aria-label="ส่วนของข้อความ" className="no-scrollbar -mx-3 flex gap-1.5 overflow-x-auto px-3 lg:hidden">
        {SUBPAGES.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={sub === p.id}
            onClick={() => setSub(p.id)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-xs transition",
              sub === p.id ? "border-gold bg-gold/15 text-warm" : "border-white/10 text-warm/60 hover:text-warm",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className={cn("space-y-3 lg:space-y-4", sub !== "main" && "max-lg:hidden")}>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="displayName">ชื่อของคุณ *</Label>
          <Counter value={draft.displayName} max={LIMITS.displayName} />
        </div>
        <Input
          id="displayName"
          value={draft.displayName}
          maxLength={LIMITS.displayName}
          placeholder="เช่น บี"
          aria-invalid={!!errors.displayName}
          autoComplete="nickname"
          onChange={(e) => onChange({ displayName: e.target.value })}
        />
        {errors.displayName && <p className="text-xs text-red-300">{errors.displayName}</p>}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="wish">คำอธิษฐาน</Label>
          <Counter value={draft.wishMessage} max={LIMITS.wishMessage} />
        </div>
        <Textarea
          id="wish"
          rows={3}
          value={draft.wishMessage}
          maxLength={LIMITS.wishMessage}
          placeholder="ขอให้ครอบครัวมีความสุข…"
          onChange={(e) => onChange({ wishMessage: e.target.value })}
        />
        {errors.content && <p className="text-xs text-red-300">{errors.content}</p>}
      </div>
      </div>

      <Collapsible open={sideOpen} onToggle={() => setSideOpen((o) => !o)} shown={sub === "side"} icon={Plus} label="เพิ่มข้อความด้านข้างโคม (ไม่บังคับ)">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="blessing">คำอวยพร</Label>
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
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="extra">ข้อความสั้น ๆ</Label>
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
      </Collapsible>

      <Collapsible open={styleOpen} onToggle={() => setStyleOpen((o) => !o)} shown={sub === "style"} icon={Type} label="ปรับแต่งตัวอักษร">
        <div className="space-y-2">
          <Label>ฟอนต์</Label>
          <div className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3 lg:mx-0 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0">
            {LANTERN_FONT_IDS.map((id) => {
              const f = LANTERN_FONTS[id];
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTc({ font: id })}
                  aria-pressed={tc.font === id}
                  aria-label={f.label}
                  title={f.label}
                  className={cn(
                    "shrink-0 rounded-xl border px-3 py-1.5 text-center text-lg leading-tight text-warm transition lg:px-2 lg:py-2",
                    tc.font === id ? "border-gold bg-gold/10" : "border-white/10 hover:border-gold/40",
                  )}
                  style={{ fontFamily: `"${f.family}"`, fontWeight: f.weight }}
                >
                  สุขสันต์
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <Label>สีตัวอักษร</Label>
          <div className="no-scrollbar -mx-3 flex items-center gap-2 overflow-x-auto px-3 py-1 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 lg:py-0">
            {INK_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`สี ${c}`}
                aria-pressed={tc.color.toLowerCase() === c.toLowerCase()}
                onClick={() => setTc({ color: c })}
                className={cn(
                  "size-7 shrink-0 rounded-full border-2 transition",
                  tc.color.toLowerCase() === c.toLowerCase() ? "scale-110 border-gold" : "border-white/20 hover:border-white/50",
                )}
                style={{ background: c }}
              />
            ))}
            <label className="relative grid size-7 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-full border-2 border-dashed border-white/30 text-xs text-warm/60">
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

        <div className="grid grid-cols-2 gap-3 lg:gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>ขนาด</Label>
              <span className="text-xs text-warm/50">{Math.round(tc.size * 100)}%</span>
            </div>
            <Slider min={0.7} max={1.5} step={0.05} value={[tc.size]} onValueChange={([v]) => setTc({ size: v })} aria-label="ขนาดตัวอักษร" />
          </div>
          <div className="space-y-2">
            <Label>ตำแหน่ง</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {POSITIONS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={tc.position === id}
                  aria-label={`ข้อความ${label}`}
                  onClick={() => setTc({ position: id })}
                  className={cn(
                    "flex items-center justify-center gap-1 rounded-lg border py-1.5 text-xs transition",
                    tc.position === id ? "border-gold bg-gold/10 text-warm" : "border-white/10 text-warm/60 hover:border-gold/40",
                  )}
                >
                  <Icon className="size-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Collapsible>
    </div>
  );
}
