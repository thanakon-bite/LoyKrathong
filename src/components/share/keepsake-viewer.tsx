"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Heart, X } from "lucide-react";
import { FACE_LABEL_TH, facesForShape, type LanternFaceId, type LanternVisual } from "@/types/lantern";
import { cn, hashString } from "@/lib/utils";

/** Drawings are not popped out any more – they are already readable on the lantern itself */
export type KeepsakeKind = "image" | "message";

export interface Keepsake {
  kind: KeepsakeKind;
  /** unique per item (a lantern can carry a photo on several walls) */
  key: string;
  label: string;
  /** photo URL (kind "image") */
  src?: string;
  face?: LanternFaceId;
}

/** What a lantern carries, in the order a visitor browses it: the photo of every wall, then the text */
export function lanternKeepsakes(v: LanternVisual): Keepsake[] {
  const photos: Array<{ face: LanternFaceId; src: string }> = [];
  for (const face of facesForShape(v.shape)) {
    const src = face === "front" ? v.imageSrc : v.faces?.[face]?.imageSrc;
    if (src) photos.push({ face, src });
  }
  const list: Keepsake[] = photos.map((p) => ({
    kind: "image",
    key: `image-${p.face}`,
    label: photos.length > 1 ? `รูป${FACE_LABEL_TH[p.face]}` : "รูปภาพ",
    src: p.src,
    face: p.face,
  }));
  if (v.wishMessage || v.blessingMessage || v.extraMessage) list.push({ kind: "message", key: "message", label: "ข้อความ" });
  return list;
}

const tilt = (seed: string, spread = 5) => ((hashString(seed) % (spread * 20)) / 10 - spread) * 0.9;

/* ---------------------------------------------------------------- polaroid */

export function PolaroidPhoto({ src, alt, caption, className, rotate = 0, size = "lg" }: { src: string; alt: string; caption?: string; className?: string; rotate?: number; size?: "sm" | "lg" }) {
  const lg = size === "lg";
  return (
    <figure
      className={cn("relative bg-[#fbf7ee] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.75)]", lg ? "p-3.5 pb-16 sm:p-4 sm:pb-20" : "p-1.5 pb-6", className)}
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      {/* washi tape */}
      <span aria-hidden className={cn("absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 -rotate-3 bg-[repeating-linear-gradient(90deg,rgba(255,179,199,0.85)_0_10px,rgba(255,214,225,0.85)_10px_16px)]", lg ? "h-7 w-28" : "h-3 w-12")} />
      <div className="overflow-hidden bg-black/80 ring-1 ring-black/10">
        {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed / blob URL */}
        <img src={src} alt={alt} draggable={false} crossOrigin="anonymous" className={cn("block object-cover", lg ? "max-h-[58dvh] w-[min(78vw,420px)]" : "aspect-square w-full")} />
      </div>
      {caption && (
        <figcaption className={cn("absolute inset-x-0 truncate px-4 text-center font-hand text-[#3b2a1c]", lg ? "bottom-4 text-2xl sm:bottom-6" : "bottom-1 text-[11px]")}>{caption}</figcaption>
      )}
    </figure>
  );
}

/* ---------------------------------------------------------------- note */

export function WishNote({ visual, className, rotate = 0 }: { visual: LanternVisual; className?: string; rotate?: number }) {
  return (
    <article
      className={cn(
        "relative w-[min(86vw,440px)] rounded-sm bg-[#fbf1d9] px-7 pb-8 pt-9 text-[#3b2a1c] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.75)]",
        "bg-[repeating-linear-gradient(180deg,transparent_0_33px,rgba(140,100,50,0.16)_33px_34px)] bg-[length:100%_34px] bg-[position:0_22px]",
        className,
      )}
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      <span aria-hidden className="absolute left-1/2 top-0 h-7 w-24 -translate-x-1/2 -translate-y-1/2 rotate-2 bg-[repeating-linear-gradient(90deg,rgba(255,210,122,0.9)_0_10px,rgba(255,232,180,0.9)_10px_16px)]" />
      <div className="max-h-[56dvh] space-y-4 overflow-y-auto pr-1">
        {visual.wishMessage && <p className="whitespace-pre-line break-words font-hand text-[26px] leading-[34px]">{visual.wishMessage}</p>}
        {visual.blessingMessage && (
          <p className="flex gap-2 whitespace-pre-line break-words font-hand text-xl leading-[34px] text-[#5b2d0c]">
            <Heart className="mt-2.5 size-4 shrink-0 fill-[#c0283a] text-[#c0283a]" />
            <span>{visual.blessingMessage}</span>
          </p>
        )}
        {visual.extraMessage && <p className="whitespace-pre-line break-words font-hand text-lg leading-[34px] text-[#6b4a2b]">{visual.extraMessage}</p>}
      </div>
      <p className="mt-4 text-right font-hand text-xl text-[#7a5233]">— {visual.displayName}</p>
    </article>
  );
}

/* ---------------------------------------------------------------- viewer */

interface ViewerProps {
  visual: LanternVisual;
  items: Keepsake[];
  /** index of the open item, null = closed */
  index: number | null;
  onIndex: (i: number | null) => void;
  /** absolute (inside a dialog) instead of fixed full screen */
  contained?: boolean;
}

/**
 * Full-screen keepsake view: the tapped photo pops up as a polaroid and the text as a hand-written note – floating gently above the dimmed scene. Not a modal dialog:
 * tap anywhere to put it back, swipe or use the arrows to browse.
 */
export function KeepsakeViewer({ visual, items, index, onIndex, contained }: ViewerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const item = index !== null ? items[index] : null;
  const many = items.length > 1;
  const go = (d: number) => index !== null && onIndex((index + d + items.length) % items.length);

  useEffect(() => {
    if (index === null) return;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onIndex(null);
      else if (e.key === "ArrowRight" && many) onIndex((index + 1) % items.length);
      else if (e.key === "ArrowLeft" && many) onIndex((index - 1 + items.length) % items.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, items.length, many, onIndex]);

  const seed = `${visual.displayName}${item?.key ?? ""}`;

  return (
    <AnimatePresence>
      {item && (
        <motion.div
          key="keepsake"
          role="dialog"
          aria-label={item.label}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={cn("z-50 grid place-items-center overflow-hidden bg-[#03050d]/80 px-4 backdrop-blur-md", contained ? "absolute inset-0" : "fixed inset-0")}
          onClick={() => onIndex(null)}
        >
          {/* warm light behind the card */}
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 size-[80vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(245,185,66,0.28),transparent_65%)]" />

          <AnimatePresence mode="popLayout" initial>
            <motion.div
              key={item.key}
              initial={{ opacity: 0, scale: 0.4, y: 160, rotate: -12 }}
              animate={{ opacity: 1, scale: 1, y: 0, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.6, y: 80 }}
              transition={{ type: "spring", stiffness: 160, damping: 18 }}
              drag={many ? "x" : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.6}
              onDragEnd={(_, info) => {
                if (info.offset.x < -70) go(1);
                else if (info.offset.x > 70) go(-1);
              }}
              onClick={(e) => e.stopPropagation()}
              className="relative cursor-default"
            >
              {/* idle float, like it is still drifting on the water */}
              <motion.div animate={{ y: [0, -10, 0], rotate: [0, 0.8, 0] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}>
                {item.kind === "image" && item.src && (
                  <PolaroidPhoto src={item.src} alt={`${item.label}จาก ${visual.displayName}`} caption={visual.displayName} rotate={tilt(seed, 3)} />
                )}
                {item.kind === "message" && <WishNote visual={visual} rotate={tilt(seed, 2)} />}
              </motion.div>
            </motion.div>
          </AnimatePresence>

          <button
            ref={closeRef}
            type="button"
            aria-label="ปิด"
            onClick={() => onIndex(null)}
            className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] grid size-10 place-items-center rounded-full bg-white/10 text-warm backdrop-blur hover:bg-white/20"
          >
            <X className="size-5" />
          </button>

          {many && (
            <div className="absolute inset-x-0 bottom-[max(1.5rem,env(safe-area-inset-bottom))] flex items-center justify-center gap-3" onClick={(e) => e.stopPropagation()}>
              <button type="button" aria-label="ก่อนหน้า" onClick={() => go(-1)} className="grid size-10 place-items-center rounded-full bg-white/10 text-warm hover:bg-white/20">
                <ChevronLeft className="size-5" />
              </button>
              {items.map((it, i) => (
                <button
                  key={it.key}
                  type="button"
                  onClick={() => onIndex(i)}
                  aria-current={i === index}
                  className={cn("rounded-full px-3 py-1 text-xs transition", i === index ? "bg-gold text-night" : "bg-white/10 text-warm/70 hover:text-warm")}
                >
                  {it.label}
                </button>
              ))}
              <button type="button" aria-label="ถัดไป" onClick={() => go(1)} className="grid size-10 place-items-center rounded-full bg-white/10 text-warm hover:bg-white/20">
                <ChevronRight className="size-5" />
              </button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
