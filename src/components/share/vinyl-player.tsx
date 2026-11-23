"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, Loader2, Music2, Pause, Play } from "lucide-react";
import { useYouTubeSegment } from "@/hooks/use-youtube-segment";
import { CLIP_SECONDS, formatClock, type ClipMusic } from "@/lib/share/clip-music";
import { cn } from "@/lib/utils";

export interface VinylPlayerHandle {
  play: () => void;
}

interface Props {
  music: ClipMusic;
  /** label colour of the record (the lantern's light colour) */
  accent?: string;
  /** imperative play() – call it straight from a tap handler (iOS only allows sound inside the gesture) */
  ref?: Ref<VinylPlayerHandle>;
  /** the clip started, failed or was paused by the visitor – the page may hand music back to the theme song */
  onSettled?: () => void;
  className?: string;
}

/** Spinning vinyl disc (pure CSS) */
export function VinylDisc({ spinning, accent = "#F5B942", className }: { spinning: boolean; accent?: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("relative block aspect-square animate-spin rounded-full shadow-[0_10px_30px_-8px_rgba(0,0,0,0.8)] [animation-duration:2.6s]", className)}
      style={{
        animationPlayState: spinning ? "running" : "paused",
        background:
          "radial-gradient(circle, transparent 0 31%, rgba(255,255,255,0.06) 31.5% 32%, transparent 32.5%), repeating-radial-gradient(circle, #121212 0 1.2%, #1d1d1f 1.6% 2.4%), #111",
      }}
    >
      {/* sheen */}
      <span className="absolute inset-0 rounded-full bg-[conic-gradient(from_30deg,transparent_0_10%,rgba(255,255,255,0.16)_15%,transparent_22%_55%,rgba(255,255,255,0.12)_62%,transparent_70%)]" />
      {/* label */}
      <span className="absolute inset-[31%] grid place-items-center rounded-full" style={{ background: `radial-gradient(circle at 35% 30%, #fff8e6, ${accent} 60%, #7a4a0c)` }}>
        <span className="size-[14%] rounded-full bg-[#0b1122]" />
      </span>
    </span>
  );
}

/**
 * The song a lantern owner attached to a shared link, shown as a record sleeve + spinning vinyl.
 * The sleeve IS the official YouTube player (YouTube requires it to stay visible, ≥ 200×200 px,
 * while it plays), so pausing folds everything back into a small vinyl icon.
 */
export function VinylPlayer({ music, accent, ref, onSettled, className }: Props) {
  const [open, setOpen] = useState(false);
  const wantPlay = useRef(false);
  const { host, status, meta, error, playSegment, stop, setStart } = useYouTubeSegment(music.videoId, { loop: true });
  const playing = status === "playing";
  const settled = useRef(onSettled);
  useEffect(() => {
    settled.current = onSettled;
  });

  useEffect(() => {
    setStart(music.start);
  }, [music.start, setStart]);

  useEffect(() => {
    if (wantPlay.current && open && status === "ready") {
      wantPlay.current = false;
      playSegment(music.start);
    }
    if (status === "playing" || status === "error") settled.current?.();
  }, [status, open, music.start, playSegment]);

  /** open the sleeve and play – immediately when the player is ready, otherwise as soon as it is */
  const playNow = () => {
    setOpen(true);
    if (status === "ready") playSegment(music.start);
    else wantPlay.current = true;
  };
  useImperativeHandle(ref, () => ({ play: playNow }));

  const pause = () => {
    wantPlay.current = false;
    stop();
    setOpen(false);
    settled.current?.();
  };

  const range = `${formatClock(music.start)} – ${formatClock(music.start + CLIP_SECONDS)}`;

  return (
    <div className={cn("pointer-events-auto", className)}>
      {/* the player stays mounted so it is ready the moment the visitor taps play */}
      <motion.div
        initial={false}
        animate={open ? { opacity: 1, scale: 1, height: "auto" } : { opacity: 0, scale: 0.9, height: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 24 }}
        className={cn("origin-top-left overflow-hidden", !open && "pointer-events-none")}
        aria-hidden={!open}
      >
        <div className="relative flex items-center pb-2 pr-16">
          {/* vinyl sliding out of the sleeve */}
          <motion.div
            className="absolute right-0 top-1/2 z-0 w-[184px] -translate-y-1/2"
            animate={{ x: playing ? 0 : -64 }}
            transition={{ type: "spring", stiffness: 120, damping: 16 }}
          >
            <VinylDisc spinning={playing} accent={accent} className="w-full" />
          </motion.div>
          {/* sleeve = official YouTube player */}
          <div className="relative z-10 size-[200px] shrink-0 overflow-hidden rounded-xl bg-black shadow-[0_20px_40px_-12px_rgba(0,0,0,0.85)] ring-1 ring-white/15">
            <div ref={host} className="absolute inset-0 [&_iframe]:h-full [&_iframe]:w-full" />
            {(status === "loading" || status === "idle") && (
              <div className="absolute inset-0 grid place-items-center">
                <Loader2 className="size-6 animate-spin text-gold" />
              </div>
            )}
          </div>
        </div>
        <div className="glass flex w-[264px] items-center gap-2 rounded-2xl p-2">
          <button
            type="button"
            onClick={() => (playing ? pause() : playNow())}
            disabled={status === "error"}
            aria-label={playing ? "หยุดเพลง" : "เล่นเพลง"}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-gold text-night shadow-[0_0_20px_-4px_rgba(245,185,66,0.9)] disabled:opacity-40"
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-warm" title={meta?.title}>
              {error ? "เล่นเพลงนี้ไม่ได้" : meta?.title || "เพลงจากเจ้าของโคม"}
            </p>
            <p className="truncate text-[11px] text-warm/55">{error ?? `${meta?.author ? `${meta.author} · ` : ""}${range} · วนซ้ำ`}</p>
          </div>
          <a
            href={`https://www.youtube.com/watch?v=${music.videoId}&t=${music.start}s`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="เปิดบน YouTube"
            className="grid size-8 shrink-0 place-items-center rounded-full text-warm/50 hover:bg-white/10 hover:text-warm"
          >
            <ExternalLink className="size-3.5" />
          </a>
        </div>
      </motion.div>

      {/* folded: a vinyl icon – tap to play again */}
      <AnimatePresence>
        {!open && (
          <motion.button
            type="button"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            onClick={playNow}
            aria-label="เล่นเพลงที่เจ้าของโคมแนบมา"
            className="group glass flex items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-4 text-left shadow-[0_0_30px_-10px_rgba(245,185,66,0.9)]"
          >
            <span className="relative size-11">
              <VinylDisc spinning={false} accent={accent} className="size-11" />
              <span className="absolute inset-0 grid place-items-center">
                <span className="grid size-5 place-items-center rounded-full bg-gold text-night transition group-hover:scale-110">
                  <Play className="size-3 translate-x-px" />
                </span>
              </span>
            </span>
            <span className="leading-tight">
              <span className="flex items-center gap-1 text-xs font-medium text-warm">
                <Music2 className="size-3 text-gold" /> เพลงจากเจ้าของโคม
              </span>
              <span className="block text-[11px] text-warm/55">แตะเพื่อฟัง</span>
            </span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
