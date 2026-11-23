"use client";

import { useCallback, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { EXTRA_FACE_IDS, facesForShape, type EffectId, type ExtraFaceId, type ImageConfig, type LanternDesignId, type LanternFaceId, type LanternFaces, type LanternVisual, type TextConfig, type LanternShapeId } from "@/types/lantern";
import { DEFAULT_TEXT_CONFIG, LANTERN_DESIGNS } from "@/lib/lantern/designs";

/** Photo / drawing of one of the other walls (the front keeps the top-level fields) */
export interface FaceDraft {
  imageDataUrl: string | null;
  imageConfig: ImageConfig;
  drawingDataUrl: string | null;
}

/** Upload cache of one asset pair (key = hash of the data URL) */
export interface AssetUploads {
  imageKey?: string;
  imagePath?: string;
  drawingKey?: string;
  drawingPath?: string;
}

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
  /** art on the other walls (only the walls of the chosen shape are used) */
  faces: Partial<Record<ExtraFaceId, FaceDraft>>;
  /** Cache of already uploaded assets (key = hash of the data URL); faces = the other walls */
  uploads: AssetUploads & { faces?: Partial<Record<ExtraFaceId, AssetUploads>> };
}

export const DEFAULT_IMAGE_CONFIG: ImageConfig = { x: 0, y: 0.18, scale: 0.55 };

export const emptyFaceDraft = (): FaceDraft => ({ imageDataUrl: null, imageConfig: { ...DEFAULT_IMAGE_CONFIG }, drawingDataUrl: null });

/** Photo / drawing of any wall, front included */
export function faceDraft(d: LanternDraft, face: LanternFaceId): FaceDraft {
  if (face === "front") return { imageDataUrl: d.imageDataUrl, imageConfig: d.imageConfig, drawingDataUrl: d.drawingDataUrl };
  return d.faces?.[face] ?? emptyFaceDraft();
}

/** Draft patch that changes one wall's photo / drawing */
export function patchFace(d: LanternDraft, face: LanternFaceId, patch: Partial<FaceDraft>): Partial<LanternDraft> {
  if (face === "front") return patch;
  const next = { ...faceDraft(d, face), ...patch };
  const faces = { ...d.faces };
  if (next.imageDataUrl || next.drawingDataUrl) faces[face] = next;
  else delete faces[face];
  return { faces };
}

/** Walls of the chosen shape that carry a photo or a drawing */
export function facesWithArt(d: LanternDraft): LanternFaceId[] {
  return facesForShape(d.shape).filter((f) => {
    const a = faceDraft(d, f);
    return Boolean(a.imageDataUrl || a.drawingDataUrl);
  });
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
    imageConfig: { ...DEFAULT_IMAGE_CONFIG },
    imageDataUrl: null,
    drawingDataUrl: null,
    effects: [],
    offering: 0,
    requestId: crypto.randomUUID(),
    faces: {},
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
let quotaWarned = false;
function persist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // quota exceeded (several photos / drawings – data URLs) – keep the draft in memory only.
      // Drop the stale copy so a reload never brings back an older version of the design.
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      if (!quotaWarned) {
        quotaWarned = true;
        toast.warning("รูปและภาพวาดบนโคมมีขนาดรวมใหญ่ แบบร่างจะไม่ถูกบันทึกหากรีเฟรชหน้า กรุณาปล่อยโคมโดยไม่ปิดหน้านี้");
      }
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
    faces: draftFacesToVisual(d),
  };
}

/** The other walls' art as LanternVisual.faces (walls the shape doesn't have are left out) */
export function draftFacesToVisual(d: LanternDraft): LanternFaces {
  const walls = facesForShape(d.shape);
  const faces: LanternFaces = {};
  for (const f of EXTRA_FACE_IDS) {
    const a = d.faces?.[f];
    if (!a || !walls.includes(f) || !(a.imageDataUrl || a.drawingDataUrl)) continue;
    faces[f] = { imageSrc: a.imageDataUrl, imageConfig: a.imageDataUrl ? a.imageConfig : null, drawingSrc: a.drawingDataUrl };
  }
  return faces;
}

export function draftHasContent(d: LanternDraft) {
  return Boolean(d.wishMessage.trim() || d.blessingMessage.trim() || d.extraMessage.trim() || facesWithArt(d).length);
}
