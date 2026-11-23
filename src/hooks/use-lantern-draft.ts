"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { EffectId, ImageConfig, LanternDesignId, LanternVisual, TextConfig, LanternShapeId } from "@/types/lantern";
import { DEFAULT_TEXT_CONFIG, LANTERN_DESIGNS } from "@/lib/lantern/designs";

export interface LanternDraft {
  design: LanternDesignId;
  color: string;
  displayName: string;
  wishMessage: string;
  blessingMessage: string;
  extraMessage: string;
  textConfig: TextConfig;
  imageConfig: ImageConfig;
  imageDataUrl: string | null;
  drawingDataUrl: string | null;
  /** krathong silhouette */
  shape: LanternShapeId;
  /** paid add-on effects */
  effects: EffectId[];
  /** money put into the lantern (THB) */
  offering: number;
  /** Idempotency key for the release request – the same key is reused on retry */
  requestId: string;
  /** Cache of already uploaded assets (key = hash of the data URL) */
  uploads: { imageKey?: string; imagePath?: string; drawingKey?: string; drawingPath?: string };
}

const STORAGE_KEY = "loykrathong:draft:v1";

export function newDraft(): LanternDraft {
  return {
    design: "classic-golden",
    shape: "box",
    color: LANTERN_DESIGNS["classic-golden"].defaultLight,
    displayName: "",
    wishMessage: "",
    blessingMessage: "",
    extraMessage: "",
    textConfig: { ...DEFAULT_TEXT_CONFIG },
    imageConfig: { x: 0, y: 0.18, scale: 0.55 },
    imageDataUrl: null,
    drawingDataUrl: null,
    effects: [],
    offering: 0,
    requestId: crypto.randomUUID(),
    uploads: {},
  };
}

let state: LanternDraft | null = null;
const listeners = new Set<() => void>();

function load(): LanternDraft {
  if (state) return state;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      state = { ...newDraft(), ...(JSON.parse(raw) as Partial<LanternDraft>) };
      return state;
    }
  } catch {
    /* ignore */
  }
  state = newDraft();
  return state;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function persist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // quota exceeded (large image) – keep the draft in memory only
    }
  }, 250);
}

function emit() {
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const SERVER_SNAPSHOT = null;

/** Draft shared across /create and /checkout and kept in sessionStorage */
export function useLanternDraft() {
  const draft = useSyncExternalStore<LanternDraft | null>(subscribe, load, () => SERVER_SNAPSHOT);

  const update = useCallback((patch: Partial<LanternDraft> | ((d: LanternDraft) => Partial<LanternDraft>)) => {
    const current = load();
    const p = typeof patch === "function" ? patch(current) : patch;
    state = { ...current, ...p };
    persist();
    emit();
  }, []);

  const reset = useCallback(() => {
    state = newDraft();
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    emit();
  }, []);

  /** New idempotency key – used after a request was closed (cancelled payment, etc.) */
  const renewRequestId = useCallback(() => {
    state = { ...load(), requestId: crypto.randomUUID() };
    persist();
    emit();
  }, []);

  return { draft, update, reset, renewRequestId, ready: draft !== null };
}

export function draftToVisual(d: LanternDraft): LanternVisual {
  return {
    design: d.design,
    shape: d.shape ?? "box",
    color: d.color,
    effects: d.effects ?? [],
    offering: d.offering ?? 0,
    displayName: d.displayName,
    wishMessage: d.wishMessage,
    blessingMessage: d.blessingMessage,
    extraMessage: d.extraMessage,
    textConfig: d.textConfig,
    imageConfig: d.imageDataUrl ? d.imageConfig : null,
    imageSrc: d.imageDataUrl,
    drawingSrc: d.drawingDataUrl,
  };
}

export function draftHasContent(d: LanternDraft) {
  return Boolean(d.wishMessage.trim() || d.blessingMessage.trim() || d.extraMessage.trim() || d.imageDataUrl || d.drawingDataUrl);
}
