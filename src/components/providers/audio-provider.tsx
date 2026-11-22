"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { publicEnv } from "@/lib/env";
import type { AmbientMusic } from "@/lib/audio/ambient";

const STORAGE_KEY = "loykrathong:audio";

interface AudioState {
  /** user wants sound on (persisted) */
  enabled: boolean;
  /** sound is actually playing right now */
  playing: boolean;
  volume: number;
  /** user has made a choice before (hide the first-visit prompt) */
  decided: boolean;
  toggle: () => Promise<void>;
  play: () => Promise<void>;
  setVolume: (v: number) => void;
  dismiss: () => void;
}

const AudioCtx = createContext<AudioState | null>(null);

function readPref(): { enabled: boolean; volume: number; decided: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return { enabled: !!p.enabled, volume: typeof p.volume === "number" ? p.volume : 0.6, decided: true };
    }
  } catch {
    /* storage unavailable */
  }
  return { enabled: false, volume: 0.6, decided: false };
}

/**
 * Background music shared by every page (lives in the root layout, so it keeps
 * playing across client-side navigation). Browsers block autoplay, so music only
 * starts after the user presses a button.
 */
export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [volume, setVol] = useState(0.6);
  const [decided, setDecided] = useState(true);
  const synth = useRef<AmbientMusic | null>(null);
  const element = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const p = readPref();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate persisted preference after mount
    setEnabled(p.enabled);
    setVol(p.volume);
    setDecided(p.decided);
  }, []);

  const persist = useCallback((next: { enabled: boolean; volume: number }) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const startOutput = useCallback(async (vol: number) => {
    if (publicEnv.bgmUrl) {
      if (!element.current) {
        const a = new Audio(publicEnv.bgmUrl);
        a.loop = true;
        a.preload = "auto";
        element.current = a;
      }
      element.current.volume = vol;
      await element.current.play();
    } else {
      if (!synth.current) {
        const { AmbientMusic } = await import("@/lib/audio/ambient");
        synth.current = new AmbientMusic();
      }
      await synth.current.start(vol * 0.9);
    }
  }, []);

  const stopOutput = useCallback(async () => {
    element.current?.pause();
    await synth.current?.pause();
  }, []);

  const play = useCallback(async () => {
    try {
      await startOutput(volume);
      setPlaying(true);
      setEnabled(true);
      setDecided(true);
      persist({ enabled: true, volume });
    } catch {
      setPlaying(false);
    }
  }, [startOutput, volume, persist]);

  const toggle = useCallback(async () => {
    if (playing) {
      await stopOutput();
      setPlaying(false);
      setEnabled(false);
      setDecided(true);
      persist({ enabled: false, volume });
    } else {
      await play();
    }
  }, [playing, stopOutput, play, persist, volume]);

  const setVolume = useCallback(
    (v: number) => {
      setVol(v);
      if (element.current) element.current.volume = v;
      synth.current?.setVolume(v * 0.9);
      persist({ enabled, volume: v });
    },
    [enabled, persist],
  );

  const dismiss = useCallback(() => {
    setDecided(true);
    persist({ enabled: false, volume });
  }, [persist, volume]);

  // pause when the tab is hidden, resume when visible again
  useEffect(() => {
    const onVis = () => {
      if (!playing) return;
      if (document.hidden) void stopOutput();
      else void startOutput(volume);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [playing, startOutput, stopOutput, volume]);

  useEffect(
    () => () => {
      element.current?.pause();
      synth.current?.close();
    },
    [],
  );

  const value = useMemo(
    () => ({ enabled, playing, volume, decided, toggle, play, setVolume, dismiss }),
    [enabled, playing, volume, decided, toggle, play, setVolume, dismiss],
  );
  return <AudioCtx.Provider value={value}>{children}</AudioCtx.Provider>;
}

export function useAudio() {
  const ctx = useContext(AudioCtx);
  if (!ctx) throw new Error("useAudio must be used inside <AudioProvider>");
  return ctx;
}
