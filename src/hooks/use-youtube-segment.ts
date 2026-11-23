"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { isEmbedBlockedError, loadYouTubeApi, type YTPlayer } from "@/lib/audio/youtube";
import { CLIP_SECONDS } from "@/lib/share/clip-music";
import { useAudio } from "@/components/providers/audio-provider";

export interface SegmentMeta {
  duration: number;
  title: string;
  author: string;
}

type Status = "idle" | "loading" | "ready" | "playing" | "error";

/**
 * Plays a 15-second segment of a YouTube video through the official IFrame player
 * (the player must stay visible – the audio is never extracted or downloaded).
 * Theme music is paused while the segment plays.
 */
export function useYouTubeSegment(videoId: string | null, opts: { loop?: boolean; controls?: boolean } = {}) {
  const host = useRef<HTMLDivElement | null>(null);
  const player = useRef<YTPlayer | null>(null);
  const startRef = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [meta, setMeta] = useState<SegmentMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState(0);
  const { suspend } = useAudio();
  // each player holds the theme music under its own key (several players may exist at once)
  const holdKey = `yt-${useId()}`;
  const hold = useCallback((on: boolean) => suspend(on, holdKey), [suspend, holdKey]);
  const loop = opts.loop ?? false;
  const controls = opts.controls ?? false;

  const clearTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  const stop = useCallback(() => {
    clearTimer();
    player.current?.pauseVideo();
    setStatus((s) => (s === "playing" ? "ready" : s));
    hold(false);
  }, [hold]);

  const watch = useCallback(() => {
    clearTimer();
    timer.current = setInterval(() => {
      const p = player.current;
      if (!p) return;
      const t = p.getCurrentTime();
      setPosition(t);
      const start = startRef.current;
      if (t >= start + CLIP_SECONDS || t < start - 1.5) {
        if (loop) p.seekTo(start, true);
        else stop();
      }
    }, 200);
  }, [loop, stop]);

  /** Plays the 15 s segment that begins at `start` */
  const playSegment = useCallback(
    (start: number) => {
      const p = player.current;
      if (!p) return;
      startRef.current = start;
      hold(true);
      p.seekTo(start, true);
      p.playVideo();
      setStatus("playing");
      watch();
    },
    [hold, watch],
  );

  // latest callbacks for the player's event handlers (the player itself is only rebuilt when the video changes)
  const latest = useRef({ hold, watch, stop, loop });
  useEffect(() => {
    latest.current = { hold, watch, stop, loop };
  });

  useEffect(() => {
    if (!videoId || !host.current) return;
    const h = () => latest.current;
    let cancelled = false;
    const mount = document.createElement("div");
    host.current.replaceChildren(mount);
    setStatus("loading");
    setError(null);
    setMeta(null);
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        player.current = new YT.Player(mount, {
          host: "https://www.youtube-nocookie.com",
          videoId,
          width: "100%",
          height: "100%",
          playerVars: { playsinline: 1, rel: 0, modestbranding: 1, controls: controls ? 1 : 0, disablekb: 1, start: startRef.current },
          events: {
            onReady: (e) => {
              if (cancelled) return;
              const data = e.target.getVideoData?.() ?? {};
              const duration = e.target.getDuration();
              if (!duration) {
                setError("คลิปนี้ไม่มีความยาวที่แน่นอน (เช่น ไลฟ์สด) ลองเลือกคลิปอื่น");
                setStatus("error");
                return;
              }
              setMeta({ duration, title: data.title ?? "", author: data.author ?? "" });
              setStatus("ready");
            },
            onStateChange: (e) => {
              if (cancelled || !window.YT) return;
              if (e.data === window.YT.PlayerState.PLAYING) {
                setStatus("playing");
                h().hold(true);
                h().watch();
              } else if (e.data === window.YT.PlayerState.PAUSED) {
                clearTimer();
                setStatus("ready");
                h().hold(false);
              } else if (e.data === window.YT.PlayerState.ENDED) {
                if (h().loop) e.target.seekTo(startRef.current, true);
                else h().stop();
              }
            },
            onError: (e) => {
              if (cancelled) return;
              clearTimer();
              h().hold(false);
              setError(
                isEmbedBlockedError(e.data)
                  ? "เจ้าของคลิปไม่อนุญาตให้เล่นบนเว็บอื่น ลองเลือกเพลงอื่น"
                  : e.data === 100
                    ? "ไม่พบคลิปนี้ หรือคลิปเป็นแบบส่วนตัว"
                    : "เล่นคลิปนี้ไม่ได้ ลองเลือกเพลงอื่น",
              );
              setStatus("error");
            },
          },
        });
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message);
        setStatus("error");
      });
    return () => {
      cancelled = true;
      clearTimer();
      h().hold(false);
      player.current?.destroy();
      player.current = null;
    };
  }, [videoId, controls]);

  const setStart = useCallback((s: number) => {
    startRef.current = s;
  }, []);

  return { host, status, meta, error, position, playSegment, stop, setStart };
}
