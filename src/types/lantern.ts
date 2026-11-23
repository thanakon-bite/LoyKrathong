export const LANTERN_DESIGN_IDS = [
  "classic-golden",
  "warm-white",
  "sunset-orange",
  "romantic-pink",
  "jade-green",
  "sky-blue",
  "lavender-dream",
  "ruby-red",
  "lotus-gold",
  "midnight-indigo",
  "royal-kanok",
  "moonlit-sakura",
  "peacock-jade",
] as const;
export type LanternDesignId = (typeof LANTERN_DESIGN_IDS)[number];

/** Krathong silhouette (sold individually – prices live in catalog_items kind "shape") */
export const LANTERN_SHAPE_IDS = ["box", "heart", "moon", "rabbit"] as const;
export type LanternShapeId = (typeof LANTERN_SHAPE_IDS)[number];
export const isLanternShapeId = (v: string): v is LanternShapeId => (LANTERN_SHAPE_IDS as readonly string[]).includes(v);

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
  /** photo frame shape (older lanterns: none = "rounded") */
  frame?: PhotoFrame;
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
  /** krathong silhouette (older lanterns: "box") */
  shape: LanternShapeId;
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
  /** photo / drawing on the other walls (older lanterns: none – the front carries the art) */
  faces?: LanternFaces;
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
  shape: LanternShapeId;
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

/* ------------------------------------------------------------------ per-face art */

/** Paper walls of a lantern. The box has four; heart / moon / rabbit have a front and a back panel. */
export const LANTERN_FACE_IDS = ["front", "right", "back", "left"] as const;
export type LanternFaceId = (typeof LANTERN_FACE_IDS)[number];
/** Walls that can carry their own photo / drawing besides the front (front art lives in imageSrc / drawingSrc) */
export type ExtraFaceId = Exclude<LanternFaceId, "front">;
export const EXTRA_FACE_IDS = ["right", "back", "left"] as const satisfies readonly ExtraFaceId[];
export const isExtraFaceId = (v: string): v is ExtraFaceId => (EXTRA_FACE_IDS as readonly string[]).includes(v);

/** Walls a shape has, in browsing order (front first) */
export function facesForShape(shape: LanternShapeId | null | undefined): LanternFaceId[] {
  return !shape || shape === "box" ? ["front", "right", "back", "left"] : ["front", "back"];
}

/** Photo and / or drawing printed on one wall */
export interface FaceArt {
  imageSrc: string | null;
  imageConfig: ImageConfig | null;
  drawingSrc: string | null;
}

/** Art on the walls other than the front. Stored in lanterns.drawing_data.faces (see lantern-service) */
export type LanternFaces = Partial<Record<ExtraFaceId, FaceArt>>;

/** Thai wall names for the studio and the viewers */
export const FACE_LABEL_TH: Record<LanternFaceId, string> = { front: "ด้านหน้า", right: "ด้านขวา", back: "ด้านหลัง", left: "ด้านซ้าย" };

/* ------------------------------------------------------------------ photo frames */

/** Shapes a photo can be cut to on the paper (tap the photo in the studio to cycle) */
export const PHOTO_FRAMES = ["rounded", "circle", "heart", "star", "arch", "flower"] as const;
export type PhotoFrame = (typeof PHOTO_FRAMES)[number];
export const PHOTO_FRAME_LABEL_TH: Record<PhotoFrame, string> = {
  rounded: "สี่เหลี่ยมมน",
  circle: "วงกลม",
  heart: "หัวใจ",
  star: "ดาว",
  arch: "ซุ้มโค้ง",
  flower: "ดอกไม้",
};
