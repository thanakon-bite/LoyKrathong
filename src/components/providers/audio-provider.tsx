"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { publicEnv } from "@/lib/env";
import type { AmbientMusic } from "@/lib/audio/ambient";

const STORAGE_KEY = "loykrathong:audio";

/** Theme song (audio only). Override with NEXT_PUBLIC_BGM_URL. */
export const DEFAULT_BGM_URL = "/audio/loykrathong-bgm.mp3";
const BGM_URL = publicEnv.bgmUrl || DEFAULT_BGM_URL;

type Source = "file" | "synth";

interface AudioState {
  /** user wants music (on by default; off only after pressing mute) */
  enabled: boolean;
  /** music is actually audible right now */
  playing: boolean;
  /** enabled but the browser is waiting for the first tap/click before sound may start */
  waitingForGesture: boolean;
  volume: number;
  source: Source;
  toggle: () => Promise<void>;
  play: () => Promise<void>;
  setVolume: (v: number) => void;
  /**
   * Temporarily silence the theme music without changing the user's preference.
   * Each caller holds its own key (e.g. a playing YouTube clip, a shared-music page);
   * the theme resumes only when every hold has been released.
   */
  suspend: (on: boolean, key?: string) => void;
  /** some hold is active – the theme song is silenced on purpose */
  suspended: boolean;
}

const AudioCtx = createContext<AudioState | null>(null);

function readPref(): { enabled: boolean; volume: number } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      // music is ON unless the user explicitly muted it
      return { enabled: p.muted !== true, volume: typeof p.volume === "number" ? p.volume : 0.6 };
    }
  } catch {
    /* storage unavailable */
  }
  return { enabled: true, volume: 0.6 };
}

const GESTURES = ["pointerdown", "keydown", "touchstart"] as const;

/**
 * Background music shared by every page (lives in the root layout, so it keeps playing
 * across client-side navigation). It starts automatically; browsers that block autoplay
 * with sound get it started on the visitor's first tap / click / key press anywhere.
 */
export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [waitingForGesture, setWaiting] = useState(false);
  const [volume, setVol] = useState(0.6);
  const [source, setSource] = useState<Source>("file");
  const element = useRef<HTMLAudioElement | null>(null);
  const synth = useRef<AmbientMusic | null>(null);
  const sourceRef = useRef<Source>("file");
  const volumeRef = useRef(0.6);
  const enabledRef = useRef(true);
  const holds = useRef(new Set<string>());
  const suspended = useRef(false);
  const [isSuspended, setIsSuspended] = useState(false);

  const persist = useCallback((next: { muted: boolean; volume: number }) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const startSynth = useCallback(async () => {
    if (!synth.current) {
      const { AmbientMusic } = await import("@/lib/audio/ambient");
      synth.current = new AmbientMusic();
    }
    await synth.current.start(volumeRef.current * 0.9);
  }, []);

  const audio = useCallback(() => {
    if (!element.current) {
      const a = new Audio(BGM_URL);
      a.loop = true;
      a.preload = "auto";
      a.volume = volumeRef.current;
      // file missing / unsupported → generated ambient music instead of silence
      a.addEventListener("error", () => {
        sourceRef.current = "synth";
        setSource("synth");
        if (enabledRef.current && !suspended.current) void startSynth().then(() => setPlaying(true), () => undefined);
      });
      element.current = a;
    }
    return element.current;
  }, [startSynth]);

  /** Starts sound; resolves false when the browser still blocks autoplay */
  const startOutput = useCallback(async (): Promise<boolean> => {
    try {
      if (sourceRef.current === "synth") await startSynth();
      else {
        const a = audio();
        a.volume = volumeRef.current;
        await a.play();
      }
      setPlaying(true);
      setWaiting(false);
      return true;
    } catch (e) {
      if ((e as DOMException)?.name === "NotAllowedError") {
        setWaiting(true);
        return false;
      }
      // decode/network problem → fall back to synth
      if (sourceRef.current === "file") {
        sourceRef.current = "synth";
        setSource("synth");
        try {
          await startSynth();
          setPlaying(true);
          setWaiting(false);
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }
  }, [audio, startSynth]);

  const stopOutput = useCallback(async () => {
    element.current?.pause();
    await synth.current?.pause();
    setPlaying(false);
  }, []);

  // load preference and try to start immediately
  useEffect(() => {
    const p = readPref();
    enabledRef.current = p.enabled;
    volumeRef.current = p.volume;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate persisted preference after mount
    setEnabled(p.enabled);
    setVol(p.volume);
    // child effects run first, so a page that holds the music (shared clip) is already registered here
    if (p.enabled && !suspended.current) void startOutput();
  }, [startOutput]);

  // autoplay was blocked → start on the first interaction anywhere on the page
  useEffect(() => {
    if (!waitingForGesture) return;
    const onGesture = (e: Event) => {
      if (!enabledRef.current || suspended.current) return;
      // the sound button handles its own click (otherwise one tap would start and immediately mute)
      if ((e.target as Element | null)?.closest?.("[data-audio-control]")) return;
      void startOutput();
    };
    GESTURES.forEach((g) => document.addEventListener(g, onGesture, { capture: true, passive: true }));
    return () => GESTURES.forEach((g) => document.removeEventListener(g, onGesture, { capture: true }));
  }, [waitingForGesture, startOutput]);

  const play = useCallback(async () => {
    enabledRef.current = true;
    setEnabled(true);
    persist({ muted: false, volume: volumeRef.current });
    if (!suspended.current) await startOutput();
  }, [startOutput, persist]);

  const toggle = useCallback(async () => {
    if (enabled) {
      enabledRef.current = false;
      setEnabled(false);
      setWaiting(false);
      persist({ muted: true, volume: volumeRef.current });
      await stopOutput();
    } else {
      await play();
    }
  }, [enabled, play, stopOutput, persist]);

  const setVolume = useCallback(
    (v: number) => {
      setVol(v);
      volumeRef.current = v;
      if (element.current) element.current.volume = v;
      synth.current?.setVolume(v * 0.9);
      persist({ muted: !enabledRef.current, volume: v });
    },
    [persist],
  );

  const suspend = useCallback(
    (on: boolean, key = "default") => {
      if (on) holds.current.add(key);
      else holds.current.delete(key);
      const next = holds.current.size > 0;
      if (suspended.current === next) return;
      suspended.current = next;
      setIsSuspended(next);
      if (next) {
        element.current?.pause();
        void synth.current?.pause();
        setPlaying(false);
      } else if (enabledRef.current && !document.hidden) void startOutput();
    },
    [startOutput],
  );

  // pause when the tab is hidden, resume when visible again
  useEffect(() => {
    const onVis = () => {
      if (!enabledRef.current || suspended.current) return;
      if (document.hidden) {
        element.current?.pause();
        void synth.current?.pause();
      } else void startOutput();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [startOutput]);

  useEffect(
    () => () => {
      element.current?.pause();
      synth.current?.close();
    },
    [],
  );

  const value = useMemo(
    () => ({ enabled, playing, waitingForGesture, volume, source, toggle, play, setVolume, suspend, suspended: isSuspended }),
    [enabled, playing, waitingForGesture, volume, source, toggle, play, setVolume, suspend, isSuspended],
  );
  return <AudioCtx.Provider value={value}>{children}</AudioCtx.Provider>;
}

export function useAudio() {
  const ctx = useContext(AudioCtx);
  if (!ctx) throw new Error("useAudio must be used inside <AudioProvider>");
  return ctx;
}
