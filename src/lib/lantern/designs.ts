import type { LanternDesignId, LanternFontId, TextConfig } from "@/types/lantern";

export interface LanternDesign {
  id: LanternDesignId;
  name: string;
  nameTh: string;
  /** Paper base color (outer surface, unlit) */
  paper: string;
  /** Paper color where the light is strongest */
  paperLit: string;
  /** Inner wall color */
  inner: string;
  /** Wooden base color */
  base: string;
  /** Default light color */
  defaultLight: string;
  /** Default ink color */
  defaultInk: string;
  premium: boolean;
  pattern: "none" | "lotus" | "stars";
}

export const LANTERN_DESIGNS: Record<LanternDesignId, LanternDesign> = {
  "classic-golden": {
    id: "classic-golden",
    name: "Classic Golden",
    nameTh: "ทองคลาสสิก",
    paper: "#e9c27a",
    paperLit: "#fff1c4",
    inner: "#ffd88a",
    base: "#5a3d22",
    defaultLight: "#F5B942",
    defaultInk: "#5b2d0c",
    premium: false,
    pattern: "none",
  },
  "warm-white": {
    id: "warm-white",
    name: "Warm White",
    nameTh: "ขาวนวล",
    paper: "#efe2c8",
    paperLit: "#fffaf0",
    inner: "#fff0d2",
    base: "#6b4a2b",
    defaultLight: "#FFE2A8",
    defaultInk: "#3d2a18",
    premium: false,
    pattern: "none",
  },
  "sunset-orange": {
    id: "sunset-orange",
    name: "Sunset Orange",
    nameTh: "ส้มอัสดง",
    paper: "#e59a55",
    paperLit: "#ffd3a1",
    inner: "#ffb36b",
    base: "#4f3019",
    defaultLight: "#FF9F4A",
    defaultInk: "#5a1f06",
    premium: false,
    pattern: "none",
  },
  "romantic-pink": {
    id: "romantic-pink",
    name: "Romantic Pink",
    nameTh: "ชมพูโรแมนติก",
    paper: "#e9a7b3",
    paperLit: "#ffe0e6",
    inner: "#ffc2cf",
    base: "#563226",
    defaultLight: "#FFB3C1",
    defaultInk: "#6b1f35",
    premium: false,
    pattern: "none",
  },
  "lotus-gold": {
    id: "lotus-gold",
    name: "Lotus Gold",
    nameTh: "บัวทอง",
    paper: "#e6b65c",
    paperLit: "#fff0b8",
    inner: "#ffd477",
    base: "#3f2a14",
    defaultLight: "#F5B942",
    defaultInk: "#4a2306",
    premium: true,
    pattern: "lotus",
  },
  "midnight-indigo": {
    id: "midnight-indigo",
    name: "Midnight Indigo",
    nameTh: "ครามเที่ยงคืน",
    paper: "#6f7fb6",
    paperLit: "#dfe6ff",
    inner: "#c7d2ff",
    base: "#2b2130",
    defaultLight: "#FFD27A",
    defaultInk: "#1b1f45",
    premium: true,
    pattern: "stars",
  },
};

export const LIGHT_COLORS = [
  { value: "#F5B942", label: "ทองอุ่น" },
  { value: "#FFD27A", label: "แสงเทียน" },
  { value: "#FFE2A8", label: "ขาวนวล" },
  { value: "#FF9F4A", label: "ส้มอัสดง" },
  { value: "#FFB3C1", label: "ชมพูอ่อน" },
] as const;

export const INK_COLORS = ["#5b2d0c", "#3d2a18", "#8a1c1c", "#b4232c", "#6b1f35", "#1b1f45", "#0f5132", "#000000"] as const;

export interface LanternFont {
  id: LanternFontId;
  label: string;
  family: string;
  /** Weight used on the lantern */
  weight: number;
}

export const LANTERN_FONTS: Record<LanternFontId, LanternFont> = {
  sriracha: { id: "sriracha", label: "ลายมือ (Sriracha)", family: "Sriracha", weight: 400 },
  charm: { id: "charm", label: "พู่กัน (Charm)", family: "Charm", weight: 700 },
  mali: { id: "mali", label: "น่ารัก (Mali)", family: "Mali", weight: 500 },
  kanit: { id: "kanit", label: "ทันสมัย (Kanit)", family: "Kanit", weight: 400 },
  "noto-serif-thai": { id: "noto-serif-thai", label: "ทางการ (Noto Serif)", family: "Noto Serif Thai", weight: 500 },
};

export const DEFAULT_TEXT_CONFIG: TextConfig = {
  font: "sriracha",
  color: "#5b2d0c",
  size: 1,
  position: "center",
};

export const LIMITS = {
  displayName: 40,
  wishMessage: 200,
  blessingMessage: 160,
  extraMessage: 80,
  /** photo picked in the studio (compressed before upload) */
  imageBytes: 50 * 1024 * 1024,
} as const;

/** Front-face texture resolution (square) */
export const FACE_TEXTURE_SIZE = 512;
