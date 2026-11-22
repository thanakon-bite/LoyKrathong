import { parseYouTubeId } from "@/lib/audio/youtube";

/** Length of the music segment attached to a shared lantern link */
export const CLIP_SECONDS = 15;
const MAX_START = 12 * 3600;

export interface ClipMusic {
  videoId: string;
  /** start second of the 15-second segment */
  start: number;
}

/** Reads ?yt=<id>&t=<seconds> from a shared link (anything invalid is ignored) */
export function parseClipParams(get: (k: string) => string | null | undefined): ClipMusic | null {
  const videoId = parseYouTubeId(get("yt") ?? null);
  if (!videoId) return null;
  const t = Number(get("t") ?? 0);
  const start = Number.isFinite(t) ? Math.min(MAX_START, Math.max(0, Math.floor(t))) : 0;
  return { videoId, start };
}

export function lanternShareUrl(origin: string, lanternId: string, music?: ClipMusic | null) {
  const url = new URL(`/l/${lanternId}`, origin);
  if (music) {
    url.searchParams.set("yt", music.videoId);
    url.searchParams.set("t", String(Math.floor(music.start)));
  }
  return url.toString();
}

export const formatClock = (s: number) => {
  const sec = Math.max(0, Math.floor(s));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const r = String(sec % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
};
