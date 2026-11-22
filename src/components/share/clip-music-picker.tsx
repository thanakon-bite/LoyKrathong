"use client";

import { useState } from "react";
import { Loader2, Music2, Pause, Play, X } from "lucide-react";
import { parseYouTubeId } from "@/lib/audio/youtube";
import { CLIP_SECONDS, formatClock, type ClipMusic } from "@/lib/share/clip-music";
import { useYouTubeSegment } from "@/hooks/use-youtube-segment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";

interface Props {
  value: ClipMusic | null;
  onChange: (v: ClipMusic | null) => void;
}

/** Paste a YouTube link → pick which 15 seconds play when a friend opens the shared lantern */
export function ClipMusicPicker({ value, onChange }: Props) {
  const [link, setLink] = useState(value ? `https://youtu.be/${value.videoId}` : "");
  const [linkError, setLinkError] = useState<string | null>(null);
  const videoId = value?.videoId ?? null;
  const start = value?.start ?? 0;
  const { host: ytHost, status: ytStatus, meta: ytMeta, error: ytError, position: ytPosition, playSegment, stop: stopClip, setStart: setClipStart } = useYouTubeSegment(videoId);
  const maxStart = ytMeta ? Math.max(0, Math.floor(ytMeta.duration - CLIP_SECONDS)) : 0;

  const submit = (raw: string) => {
    setLink(raw);
    if (!raw.trim()) {
      setLinkError(null);
      return;
    }
    const id = parseYouTubeId(raw);
    if (!id) {
      setLinkError("ลิงก์นี้ไม่ใช่ลิงก์ YouTube");
      return;
    }
    setLinkError(null);
    if (id !== videoId) onChange({ videoId: id, start: 0 });
  };

  const setStart = (s: number) => {
    if (!value) return;
    const next = Math.min(maxStart, Math.max(0, Math.round(s)));
    onChange({ ...value, start: next });
    setClipStart(next);
    if (ytStatus === "playing") playSegment(next);
  };

  const progress = ytStatus === "playing" ? Math.min(1, Math.max(0, (ytPosition - start) / CLIP_SECONDS)) : 0;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Music2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-warm/45" />
        <Input
          inputMode="url"
          placeholder="วางลิงก์เพลงจาก YouTube"
          aria-label="ลิงก์ YouTube"
          value={link}
          onChange={(e) => submit(e.target.value)}
          className="pl-9 pr-9"
        />
        {value && (
          <button
            type="button"
            aria-label="เอาเพลงออก"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-warm/50 hover:bg-white/10 hover:text-warm"
            onClick={() => {
              setLink("");
              setLinkError(null);
              onChange(null);
            }}
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      {linkError && <p className="text-xs text-red-300">{linkError}</p>}

      {videoId && (
        <>
          {/* official YouTube player – must stay visible (min. 200×200 by YouTube policy) */}
          <div className="relative aspect-video min-h-[200px] w-full overflow-hidden rounded-xl bg-black">
            <div ref={ytHost} className="absolute inset-0 [&_iframe]:h-full [&_iframe]:w-full" />
            {ytStatus === "loading" && (
              <div className="absolute inset-0 grid place-items-center">
                <Loader2 className="size-6 animate-spin text-gold" />
              </div>
            )}
          </div>

          {ytError ? (
            <p className="rounded-xl border border-red-400/30 bg-red-500/10 p-2.5 text-xs text-red-200">{ytError}</p>
          ) : (
            ytMeta && (
              <div className="space-y-2.5">
                <p className="truncate text-xs text-warm/60" title={ytMeta.title}>
                  {ytMeta.title || "YouTube"} {ytMeta.author && <span className="text-warm/40">· {ytMeta.author}</span>} ·{" "}
                  {formatClock(ytMeta.duration)}
                </p>
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    size="icon"
                    className="shrink-0 rounded-full"
                    aria-label={ytStatus === "playing" ? "หยุดฟัง" : "ฟังท่อนที่เลือก"}
                    onClick={() => (ytStatus === "playing" ? stopClip() : playSegment(start))}
                  >
                    {ytStatus === "playing" ? <Pause /> : <Play />}
                  </Button>
                  <div className="flex-1 space-y-1.5">
                    <Slider min={0} max={Math.max(1, maxStart)} step={1} value={[start]} disabled={maxStart === 0} onValueChange={([v]) => setStart(v)} aria-label="จุดเริ่มท่อนเพลง" />
                    <div className="relative h-1 overflow-hidden rounded-full bg-white/10">
                      <div className="absolute inset-y-0 left-0 bg-gold transition-[width] duration-200" style={{ width: `${progress * 100}%` }} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-warm/50">ท่อนที่เลือก (15 วินาที)</span>
                  <span className="font-medium text-gold">
                    {formatClock(start)} – {formatClock(Math.min(ytMeta.duration, start + CLIP_SECONDS))}
                  </span>
                </div>
              </div>
            )
          )}
        </>
      )}
      <p className="text-[11px] leading-relaxed text-warm/40">
        เพลงเล่นผ่านเครื่องเล่นของ YouTube เมื่อเพื่อนเปิดลิงก์ ไม่มีการคัดลอกไฟล์เพลง · บางคลิปเจ้าของไม่อนุญาตให้เล่นบนเว็บอื่น
      </p>
    </div>
  );
}
