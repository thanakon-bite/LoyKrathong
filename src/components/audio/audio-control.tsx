"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Volume1, Volume2, VolumeX } from "lucide-react";
import { useAudio } from "@/components/providers/audio-provider";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

/** Floating sound button (mute / unmute) + volume – the theme song plays automatically, audio only */
export function AudioControl({ className }: { className?: string }) {
  const { playing, enabled, waitingForGesture, volume, toggle, play, setVolume, suspended } = useAudio();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // keep clear of the bottom action bars on mobile
  const lift = pathname === "/create" ? "md:bottom-24 lg:bottom-6" : "md:bottom-6";
  const audible = playing && enabled;
  const Icon = !audible ? VolumeX : volume < 0.4 ? Volume1 : Volume2;
  // a shared song is playing (or about to) – show only that song's controls
  if (suspended) return null;

  return (
    // bottom-LEFT: Netlify's free plan injects a "Powered by Netlify" badge at bottom-right that cannot be turned off
    <div data-audio-control className={cn(
        // phones: top-right under the header (the bottom holds the main buttons + Netlify badge)
        "fixed right-3 top-[calc(7.25rem+env(safe-area-inset-top))] z-40 flex flex-row-reverse items-center gap-2",
        "md:left-6 md:right-auto md:top-auto",
        lift,
        className,
      )}>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            className="glass flex w-40 items-center gap-2 rounded-full px-4 py-2"
          >
            <Slider aria-label="ระดับเสียง" min={0} max={1} step={0.05} value={[volume]} onValueChange={([v]) => setVolume(v)} />
          </motion.div>
        )}
      </AnimatePresence>
      <button
        type="button"
        onClick={() => void (waitingForGesture && enabled ? play() : toggle())}
        onContextMenu={(e) => {
          e.preventDefault();
          setOpen((o) => !o);
        }}
        aria-label={audible ? "ปิดเสียงเพลง" : "เปิดเสียงเพลง"}
        aria-pressed={audible}
        className={cn("glass relative grid size-11 place-items-center rounded-full transition hover:border-gold/50", audible && "text-gold shadow-[0_0_24px_-4px_rgba(245,185,66,0.8)]")}
      >
        <Icon className="size-5" />
        {audible && <span className="absolute -right-0.5 -top-0.5 size-2.5 animate-pulse rounded-full bg-gold" />}
      </button>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="ปรับระดับเสียง"
        aria-expanded={open}
        className="glass hidden size-11 place-items-center rounded-full text-xs text-warm/70 transition hover:border-gold/50 md:grid"
      >
        {Math.round(volume * 100)}
      </button>
    </div>
  );
}
