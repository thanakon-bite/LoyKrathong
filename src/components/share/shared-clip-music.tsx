"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Music2, Pause, Play, X } from "lucide-react";
import { useYouTubeSegment } from "@/hooks/use-youtube-segment";
import { CLIP_SECONDS, formatClock, type ClipMusic } from "@/lib/share/clip-music";
import { cn } from "@/lib/utils";

/**
 * Music chosen by the lantern owner when sharing: a 15-second loop played
 * through the official (visible) YouTube player.
 *  - inline   → card inside the lantern detail view (what a friend sees first)
 *  - floating → pill over the festival scene after the detail view is closed
 */
export function SharedClipMusic({ music, variant = "floating" }: { music: ClipMusic; variant?: "inline" | "floating" }) {
  const [open, setOpen] = useState(false);
  const { host, status, meta, error, playSegment, stop, setStart } = useYouTubeSegment(open ? music.videoId : null, { loop: true, controls: true });
  const autoplayed = useRef(false);
  const inline = variant === "inline";

  // the tap that opened the card counts as the user gesture – start the segment as soon as the player is ready
  useEffect(() => {
    if (open && status === "ready" && !autoplayed.current) {
      autoplayed.current = true;
      setStart(music.start);
      playSegment(music.start);
    }
  }, [open, status, music.start, playSegment, setStart]);

  const range = `${formatClock(music.start)} – ${formatClock(music.start + CLIP_SECONDS)}`;

  if (!open) {
    return inline ? (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex w-full items-center gap-3 rounded-2xl border border-gold/30 bg-gradient-to-r from-gold/15 via-gold/5 to-transparent p-3 text-left transition hover:border-gold/60"
      >
        <span className="relative grid size-11 shrink-0 place-items-center rounded-full bg-gold text-night shadow-[0_0_24px_-4px_rgba(245,185,66,0.9)]">
          <span className="absolute inset-0 animate-ping rounded-full bg-gold/40" />
          <Play className="relative size-5 translate-x-px" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium text-warm">เจ้าของโคมใส่เพลงไว้ให้ 🎵</span>
          <span className="block text-xs text-warm/55">แตะเพื่อฟัง · ท่อน {range} จาก YouTube</span>
        </span>
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="glass absolute left-4 top-28 z-20 flex items-center gap-2 rounded-full py-2 pl-2 pr-4 text-sm text-warm shadow-[0_0_30px_-8px_rgba(245,185,66,0.8)] sm:left-6 sm:top-24"
      >
        <span className="grid size-8 animate-pulse place-items-center rounded-full bg-gold text-night">
          <Play className="size-4 translate-x-px" />
        </span>
        ฟังเพลงที่เจ้าของโคมเลือก
      </button>
    );
  }

  const playing = status === "playing";
  return (
    <div
      className={cn(
        "space-y-2 rounded-2xl p-2.5",
        inline ? "border border-gold/25 bg-white/[0.03]" : "glass absolute left-4 top-28 z-20 w-[min(92vw,360px)] sm:left-6 sm:top-24",
      )}
    >
      <div className="flex items-center gap-2 px-1">
        <Music2 className="size-4 shrink-0 text-gold" />
        <p className="min-w-0 flex-1 truncate text-xs text-warm/80" title={meta?.title}>
          {meta?.title || "เพลงจาก YouTube"}
        </p>
        <button type="button" aria-label="ปิดเพลง" className="rounded-full p-1 text-warm/50 hover:bg-white/10 hover:text-warm" onClick={() => setOpen(false)}>
          <X className="size-4" />
        </button>
      </div>
      {/* the official player must stay visible while it plays (YouTube policy) */}
      <div className="relative aspect-video min-h-[200px] w-full overflow-hidden rounded-xl bg-black">
        <div ref={host} className="absolute inset-0 [&_iframe]:h-full [&_iframe]:w-full" />
      </div>
      {error ? (
        <p className="px-1 text-xs text-red-200">{error}</p>
      ) : (
        <div className="flex items-center gap-2 px-1">
          <button
            type="button"
            disabled={status === "loading" || status === "idle"}
            onClick={() => (playing ? stop() : playSegment(music.start))}
            className="grid size-8 shrink-0 place-items-center rounded-full bg-gold text-night disabled:opacity-50"
            aria-label={playing ? "หยุด" : "เล่น"}
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
          </button>
          <span className={cn("flex-1 text-xs", playing ? "text-gold" : "text-warm/55")}>{range} · วนซ้ำ</span>
          <a
            href={`https://www.youtube.com/watch?v=${music.videoId}&t=${music.start}s`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] text-warm/50 hover:text-warm"
          >
            YouTube <ExternalLink className="size-3" />
          </a>
        </div>
      )}
    </div>
  );
}
