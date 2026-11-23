/**
 * Helpers for the official YouTube IFrame Player (used for the 15-second music clip on shared links).
 * YouTube's policies require the player to stay visible (≥ 200×200 px) while it plays and
 * forbid extracting the audio.
 */

/** Finds the first YouTube link inside pasted text ("ดูคลิปนี้ https://youtu.be/… ?si=…"), adding https:// when missing */
function findYouTubeUrl(value: string): URL | null {
  const m = /(?:https?:\/\/)?(?:[\w-]+\.)*(?:youtube\.com|youtu\.be|youtube-nocookie\.com)\/[^\s"'<>]*/i.exec(value);
  if (!m) return null;
  try {
    return new URL(/^https?:\/\//i.test(m[0]) ? m[0] : `https://${m[0]}`);
  } catch {
    return null;
  }
}

/** Accepts a YouTube URL (watch / youtu.be / embed / shorts / live / music), text containing one, or a bare 11-char video id */
export function parseYouTubeId(input: string | undefined | null): string | null {
  if (!input) return null;
  const value = input.trim();
  if (/^[\w-]{11}$/.test(value)) return value;
  const url = findYouTubeUrl(value);
  if (!url) return null;
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  if (host === "youtu.be") {
    const id = url.pathname.split("/")[1] ?? "";
    return /^[\w-]{11}$/.test(id) ? id : null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const v = url.searchParams.get("v");
    if (v && /^[\w-]{11}$/.test(v)) return v;
    const m = /^\/(?:embed|shorts|live|v)\/([\w-]{11})/.exec(url.pathname);
    if (m) return m[1];
  }
  return null;
}

/** Start time carried by a pasted link (?t=90, ?t=1m30s, &start=90) – seconds, or 0 */
export function parseYouTubeStart(input: string | undefined | null): number {
  const url = input ? findYouTubeUrl(input.trim()) : null;
  const raw = url?.searchParams.get("t") ?? url?.searchParams.get("start");
  if (!raw) return 0;
  if (/^\d+s?$/.test(raw)) return parseInt(raw, 10);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(raw);
  return m ? (Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)) : 0;
}

// --- minimal typings for the IFrame Player API we use ---
export interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(volume: number): void;
  unMute(): void;
  getPlayerState(): number;
  getDuration(): number;
  getCurrentTime(): number;
  getVideoData?(): { title?: string; author?: string; video_id?: string };
  destroy(): void;
}

interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      host?: string;
      videoId: string;
      width?: number | string;
      height?: number | string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (e: { target: YTPlayer }) => void;
        onStateChange?: (e: { data: number; target: YTPlayer }) => void;
        onError?: (e: { data: number }) => void;
      };
    },
  ) => YTPlayer;
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;

export function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT) resolve(window.YT);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    s.onerror = () => {
      apiPromise = null;
      reject(new Error("โหลดเครื่องเล่น YouTube ไม่สำเร็จ"));
    };
    document.head.appendChild(s);
  });
  return apiPromise;
}

/** Errors 101 / 150 = the owner disabled playback on other websites */
export const isEmbedBlockedError = (code: number) => code === 101 || code === 150;
