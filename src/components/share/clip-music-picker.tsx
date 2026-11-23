"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardPaste, Loader2, Minus, Music2, Pause, Play, Plus, RefreshCw, Search } from "lucide-react";
import { parseYouTubeId, parseYouTubeStart } from "@/lib/audio/youtube";
import { CLIP_SECONDS, formatClock, type ClipMusic } from "@/lib/share/clip-music";
import { useYouTubeSegment } from "@/hooks/use-youtube-segment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, hashString, seededRandom } from "@/lib/utils";

interface Props {
  value: ClipMusic | null;
  onChange: (v: ClipMusic | null) => void;
}

const BARS = 56;

/**
 * "แนบเพลง": paste a YouTube link → drag the golden 15-second window over the song → share.
 * The preview plays through the official, visible YouTube player (audio is never extracted).
 */
export function ClipMusicPicker({ value, onChange }: Props) {
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const videoId = value?.videoId ?? null;
  const start = value?.start ?? 0;
  const { host: ytHost, status: ytStatus, meta: ytMeta, error: ytError, position: ytPosition, playSegment, stop: stopClip, setStart: setClipStart } = useYouTubeSegment(videoId);
  const duration = ytMeta?.duration ?? 0;
  const maxStart = Math.max(0, Math.floor(duration - CLIP_SECONDS));
  const playing = ytStatus === "playing";

  // a start time taken from the pasted link (?t=) may lie past the last full 15 s – pull it back once the length is known
  useEffect(() => {
    if (value && duration > 0 && value.start > maxStart) onChange({ ...value, start: maxStart });
  }, [value, duration, maxStart, onChange]);

  const apply = (raw: string) => {
    setLink(raw);
    const text = raw.trim();
    if (!text) return setLinkError(null);
    const id = parseYouTubeId(text);
    if (!id) {
      // plain words → offer a YouTube search instead of an error
      setLinkError(/youtu/i.test(text) || /^https?:/i.test(text) ? "ลิงก์นี้ไม่ใช่ลิงก์คลิป YouTube" : null);
      return;
    }
    setLinkError(null);
    if (id !== videoId) onChange({ videoId: id, start: parseYouTubeStart(text) });
  };

  const paste = async () => {
    try {
      apply(await navigator.clipboard.readText());
    } catch {
      setLinkError("เบราว์เซอร์ไม่อนุญาตให้อ่านคลิปบอร์ด กดค้างที่ช่องแล้วเลือก “วาง” แทน");
    }
  };

  const setStart = (s: number) => {
    if (!value) return;
    const next = Math.min(maxStart, Math.max(0, Math.round(s)));
    if (next === value.start) return;
    onChange({ ...value, start: next });
    setClipStart(next);
    if (playing) playSegment(next);
  };

  const reset = () => {
    stopClip();
    setLink("");
    setLinkError(null);
    onChange(null);
  };

  /* ---------------- step 1: paste a link ---------------- */
  if (!videoId) {
    const query = link.trim();
    const isSearch = !!query && !parseYouTubeId(query) && !linkError;
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-dashed border-gold/35 bg-gradient-to-b from-gold/[0.08] to-transparent p-4">
          <div className="mb-3 flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gold/15 text-gold">
              <Music2 className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-warm">แนบเพลงจาก YouTube</p>
              <p className="text-xs text-warm/55">เพื่อนเปิดลิงก์แล้วได้ยินเพลง 15 วินาทีพร้อมเห็นกระทงของคุณ</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Input
              inputMode="url"
              autoComplete="off"
              placeholder="วางลิงก์ เช่น https://youtu.be/…"
              aria-label="ลิงก์ YouTube"
              value={link}
              onChange={(e) => apply(e.target.value)}
              className="h-11 flex-1"
            />
            <Button type="button" variant="subtle" className="h-11 shrink-0" onClick={paste}>
              <ClipboardPaste /> วาง
            </Button>
          </div>
          {linkError && <p className="mt-2 text-xs text-red-300">{linkError}</p>}
          {isSearch && (
            <a
              href={`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex items-center gap-1.5 text-xs text-gold hover:underline"
            >
              <Search className="size-3.5" /> ค้นหา “{query.slice(0, 40)}” บน YouTube แล้วคัดลอกลิงก์มาวาง
            </a>
          )}
        </div>
        <ol className="grid grid-cols-3 gap-2 text-center text-[11px] text-warm/55">
          {["คัดลอกลิงก์จาก YouTube", "ลากเลือกท่อน 15 วิ", "แชร์ให้เพื่อน"].map((t, i) => (
            <li key={t} className="rounded-xl bg-white/[0.04] px-2 py-2">
              <span className="mx-auto mb-1 grid size-5 place-items-center rounded-full bg-white/10 text-[10px] text-warm">{i + 1}</span>
              {t}
            </li>
          ))}
        </ol>
      </div>
    );
  }

  /* ---------------- step 2: pick the 15 seconds ---------------- */
  return (
    <div className="space-y-3">
      {/* song */}
      <div className="flex items-center gap-3 rounded-2xl bg-white/[0.04] p-2 pr-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- YouTube thumbnail */}
        <img src={`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`} alt="" className="h-12 w-20 shrink-0 rounded-lg object-cover" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-warm" title={ytMeta?.title}>
            {ytMeta?.title || (ytStatus === "error" ? "เล่นคลิปนี้ไม่ได้" : "กำลังโหลดเพลง…")}
          </p>
          <p className="truncate text-xs text-warm/50">
            {ytMeta?.author}
            {duration > 0 && ` · ${formatClock(duration)}`}
          </p>
        </div>
        <Button type="button" size="sm" variant="ghost" className="shrink-0 text-warm/70" onClick={reset}>
          <RefreshCw /> เปลี่ยน
        </Button>
      </div>

      {/* official YouTube player – must stay visible (min. 200×200 by YouTube policy) */}
      <div className="relative aspect-video min-h-[200px] w-full overflow-hidden rounded-2xl bg-black">
        <div ref={ytHost} className="absolute inset-0 [&_iframe]:h-full [&_iframe]:w-full" />
        {ytStatus === "loading" && (
          <div className="absolute inset-0 grid place-items-center">
            <Loader2 className="size-6 animate-spin text-gold" />
          </div>
        )}
      </div>

      {ytError ? (
        <div className="space-y-2 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-xs text-red-100">
          <p>{ytError}</p>
          <Button type="button" size="sm" variant="outline" onClick={reset}>
            เลือกเพลงอื่น
          </Button>
        </div>
      ) : (
        duration > 0 && (
          <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-warm/60">ลากแถบสีทองเพื่อเลือกท่อน</span>
              <span className="rounded-full bg-gold/15 px-2.5 py-0.5 text-xs font-medium tabular-nums text-gold">
                {formatClock(start)} – {formatClock(Math.min(duration, start + CLIP_SECONDS))}
              </span>
            </div>
            <SegmentTimeline
              seed={videoId}
              duration={duration}
              start={start}
              position={playing ? ytPosition : null}
              onChange={setStart}
            />
            <div className="flex items-center gap-2">
              <Button type="button" size="icon" variant="subtle" className="rounded-full" aria-label="ถอยหลัง 5 วินาที" onClick={() => setStart(start - 5)} disabled={start <= 0}>
                <Minus />
              </Button>
              <Button type="button" className="flex-1 rounded-full" onClick={() => (playing ? stopClip() : playSegment(start))}>
                {playing ? <Pause /> : <Play />} {playing ? "หยุดฟัง" : "ฟังท่อนนี้"}
              </Button>
              <Button type="button" size="icon" variant="subtle" className="rounded-full" aria-label="เดินหน้า 5 วินาที" onClick={() => setStart(start + 5)} disabled={start >= maxStart}>
                <Plus />
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                ["ต้นเพลง", 0],
                ["ช่วง 1/4", duration * 0.25],
                ["กลางเพลง", duration * 0.5 - CLIP_SECONDS / 2],
                ["ช่วง 3/4", duration * 0.75],
              ].map(([label, s]) => (
                <button
                  key={label as string}
                  type="button"
                  onClick={() => setStart(s as number)}
                  className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-warm/65 transition hover:border-gold/50 hover:text-warm"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )
      )}
      <p className="text-[11px] leading-relaxed text-warm/40">
        เพลงเล่นผ่านเครื่องเล่นของ YouTube ไม่มีการคัดลอกไฟล์เพลง · บางคลิปเจ้าของไม่อนุญาตให้เล่นบนเว็บอื่น
      </p>
    </div>
  );
}

/** Whole song as a (decorative) waveform with a draggable 15-second window */
function SegmentTimeline({ seed, duration, start, position, onChange }: { seed: string; duration: number; start: number; position: number | null; onChange: (s: number) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const grab = useRef<number | null>(null);
  const bars = useMemo(() => {
    const r = seededRandom(hashString(seed));
    return Array.from({ length: BARS }, (_, i) => 0.25 + 0.75 * Math.abs(Math.sin(i * 0.45 + r() * 2)) * (0.55 + r() * 0.45));
  }, [seed]);
  const winFrac = Math.min(1, CLIP_SECONDS / duration);
  const left = duration > 0 ? start / duration : 0;
  const maxStart = Math.max(0, duration - CLIP_SECONDS);

  const secondsAt = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    return ((clientX - r.left) / r.width) * duration;
  };

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const s = secondsAt(e.clientX);
    // grabbing the window keeps the finger's offset; tapping elsewhere centres the window there
    const inside = s >= start && s <= start + CLIP_SECONDS;
    grab.current = inside ? s - start : CLIP_SECONDS / 2;
    if (!inside) onChange(s - CLIP_SECONDS / 2);
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (grab.current === null) return;
    onChange(secondsAt(e.clientX) - grab.current);
  };
  const onUp = () => (grab.current = null);
  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 1;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") onChange(start - step);
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") onChange(start + step);
    else if (e.key === "Home") onChange(0);
    else if (e.key === "End") onChange(maxStart);
    else return;
    e.preventDefault();
  };

  const head = position !== null && duration > 0 ? Math.min(1, Math.max(0, position / duration)) : null;

  return (
    <div className="space-y-1">
      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label="ท่อนเพลง 15 วินาที"
        aria-valuemin={0}
        aria-valuemax={Math.floor(maxStart)}
        aria-valuenow={start}
        aria-valuetext={`เริ่ม ${formatClock(start)}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
        className="relative h-14 cursor-pointer touch-none select-none rounded-xl bg-black/30 outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
      >
        <div className="absolute inset-x-1.5 inset-y-2 flex items-center gap-[2px]">
          {bars.map((b, i) => {
            const f = (i + 0.5) / BARS;
            const on = f >= left && f <= left + winFrac;
            return <span key={i} className={cn("flex-1 rounded-full transition-colors", on ? "bg-gold" : "bg-white/15")} style={{ height: `${b * 100}%` }} />;
          })}
        </div>
        {/* window */}
        <div
          className="pointer-events-none absolute inset-y-0 rounded-xl border-2 border-gold bg-gold/15 shadow-[0_0_24px_-6px_rgba(245,185,66,0.9)]"
          style={{ left: `${left * 100}%`, width: `max(${winFrac * 100}%, 22px)` }}
        >
          <span className="absolute -top-px left-1/2 h-1.5 w-6 -translate-x-1/2 rounded-b-full bg-gold" />
        </div>
        {head !== null && <div className="pointer-events-none absolute inset-y-1 w-0.5 rounded-full bg-white shadow-[0_0_8px_white]" style={{ left: `${head * 100}%` }} />}
      </div>
      <div className="flex justify-between text-[10px] tabular-nums text-warm/40">
        <span>0:00</span>
        <span>{formatClock(duration)}</span>
      </div>
    </div>
  );
}
