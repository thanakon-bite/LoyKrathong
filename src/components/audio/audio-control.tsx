"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Music, Volume1, Volume2, VolumeX, X } from "lucide-react";
import { useAudio } from "@/components/providers/audio-provider";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

/** Floating sound control + first-visit "เปิดเสียงบรรยากาศ" prompt */
export function AudioControl({ className }: { className?: string }) {
  const { playing, enabled, volume, decided, toggle, play, setVolume, dismiss } = useAudio();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // keep clear of the bottom action bars on mobile
  const lift = pathname === "/create" ? "bottom-24 lg:bottom-6" : pathname === "/festival" ? "bottom-24 md:bottom-6" : "bottom-4 sm:bottom-6";
  const Icon = !playing ? VolumeX : volume < 0.4 ? Volume1 : Volume2;
  const showPrompt = !playing && (!decided || enabled);

  return (
    <div className={cn("fixed right-4 z-40 flex flex-col items-end gap-2 sm:right-6", lift, className)}>
      <AnimatePresence>
        {showPrompt && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="glass flex items-center gap-1 rounded-full py-1 pl-1 pr-1 shadow-[0_0_40px_-10px_rgba(245,185,66,0.6)]"
          >
            <button
              type="button"
              onClick={() => void play()}
              className="flex items-center gap-2 rounded-full bg-gold/15 px-4 py-2 text-sm text-amber transition hover:bg-gold/25"
            >
              <Music className="size-4 animate-glow" />
              {enabled ? "เล่นเสียงบรรยากาศต่อ" : "เปิดเสียงบรรยากาศ"}
            </button>
            <button
              type="button"
              aria-label="ไม่เปิดเสียง"
              onClick={dismiss}
              className="rounded-full p-2 text-warm/50 transition hover:bg-white/10 hover:text-warm"
            >
              <X className="size-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-2">
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="glass flex w-40 items-center gap-2 rounded-full px-4 py-2"
            >
              <Slider
                aria-label="ระดับเสียง"
                min={0}
                max={1}
                step={0.05}
                value={[volume]}
                onValueChange={([v]) => setVolume(v)}
              />
            </motion.div>
          )}
        </AnimatePresence>
        <button
          type="button"
          onClick={() => void toggle()}
          onContextMenu={(e) => {
            e.preventDefault();
            setOpen((o) => !o);
          }}
          aria-label={playing ? "ปิดเสียงเพลง" : "เปิดเสียงเพลง"}
          aria-pressed={playing}
          className={cn(
            "glass relative grid size-11 place-items-center rounded-full transition hover:border-gold/50",
            playing && "text-gold shadow-[0_0_24px_-4px_rgba(245,185,66,0.8)]",
          )}
        >
          <Icon className="size-5" />
          {playing && <span className="absolute -right-0.5 -top-0.5 size-2.5 animate-pulse rounded-full bg-gold" />}
        </button>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="ปรับระดับเสียง"
          aria-expanded={open}
          className="glass grid size-11 place-items-center rounded-full text-xs text-warm/70 transition hover:border-gold/50"
        >
          {Math.round(volume * 100)}
        </button>
      </div>
    </div>
  );
}
