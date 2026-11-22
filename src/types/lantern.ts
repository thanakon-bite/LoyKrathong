export const LANTERN_DESIGN_IDS = [
  "classic-golden",
  "warm-white",
  "sunset-orange",
  "romantic-pink",
  "lotus-gold",
  "midnight-indigo",
] as const;
export type LanternDesignId = (typeof LANTERN_DESIGN_IDS)[number];

export const LANTERN_FONT_IDS = ["sriracha", "charm", "mali", "kanit", "noto-serif-thai"] as const;
export type LanternFontId = (typeof LANTERN_FONT_IDS)[number];

export const TEXT_POSITIONS = ["top", "center", "bottom"] as const;
export type TextPosition = (typeof TEXT_POSITIONS)[number];

/** Legacy package decorations (old payments only) */
export const DECORATIONS = ["thai-frame", "sparkle-petals"] as const;
export type Decoration = (typeof DECORATIONS)[number];

/** Effects sold individually (prices live in catalog_items) */
export const EFFECT_IDS = [
  "fireworks",
  "hearts",
  "stars",
  "petals",
  "butterflies",
  "fireflies",
  "thai-frame",
  "rainbow",
  "golden-aura",
] as const;
export type EffectId = (typeof EFFECT_IDS)[number];
export const isEffectId = (v: string): v is EffectId => (EFFECT_IDS as readonly string[]).includes(v);

export interface TextConfig {
  font: LanternFontId;
  /** Ink color (#RRGGBB) */
  color: string;
  /** Font scale multiplier 0.7 – 1.5 */
  size: number;
  /** Position of the wish text on the front face */
  position: TextPosition;
}

export interface ImageConfig {
  /** Center offset relative to face size, -0.5 … 0.5 */
  x: number;
  y: number;
  /** Width relative to face width, 0.2 … 1 */
  scale: number;
}

export interface DrawingData {
  /** Storage object path in bucket lantern-assets */
  path: string;
  width: number;
  height: number;
}

/** Content a lantern is drawn from – shared by Studio preview, Festival scene and Detail view */
export interface LanternVisual {
  design: LanternDesignId;
  /** Light color inside the lantern (#RRGGBB) */
  color: string;
  effects: EffectId[];
  /** money put into the lantern (THB) – shown as a gold coin badge above it */
  offering: number;
  displayName: string;
  wishMessage: string;
  blessingMessage: string;
  extraMessage: string;
  textConfig: TextConfig;
  imageConfig: ImageConfig | null;
  /** Any URL the browser can load (signed URL, data: URL, blob: URL) */
  imageSrc: string | null;
  drawingSrc: string | null;
}

/** Lantern as returned by the public API */
export interface PublicLantern extends LanternVisual {
  id: string;
  ownerId: string;
  releasedAt: string;
  expiresAt: string;
}

export interface MyLanternSummary {
  id: string;
  displayName: string;
  wishMessage: string;
  design: LanternDesignId;
  color: string;
  status: LanternStatus;
  createdAt: string;
  releasedAt: string | null;
  expiresAt: string | null;
  packageName: string | null;
  effects: EffectId[];
  offering: number;
}

export type LanternStatus = "pending_payment" | "active" | "expired" | "removed" | "cancelled";

export interface FestivalStats {
  totalLanterns: number;
  totalParticipants: number;
  totalWishes: number;
  activeLanterns: number;
  updatedAt: string;
}
