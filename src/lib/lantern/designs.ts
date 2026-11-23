import type { LanternDesignId, LanternFontId, LanternShapeId, TextConfig } from "@/types/lantern";

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
  pattern: LanternPattern;
}

/** Artwork printed on the paper walls (premium designs get the lavish ones) */
export type LanternPattern = "none" | "lotus" | "stars" | "kanok" | "sakura" | "peacock";

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
  "jade-green": {
    id: "jade-green",
    name: "Jade Green",
    nameTh: "เขียวหยก",
    paper: "#6fb58a",
    paperLit: "#dcf7e0",
    inner: "#b4e8c4",
    base: "#2f3a26",
    defaultLight: "#7DFFC8",
    defaultInk: "#123d26",
    premium: false,
    pattern: "none",
  },
  "sky-blue": {
    id: "sky-blue",
    name: "Sky Blue",
    nameTh: "ฟ้าใส",
    paper: "#7fb2e5",
    paperLit: "#e2f1ff",
    inner: "#bcdcfa",
    base: "#2f3440",
    defaultLight: "#7FB2FF",
    defaultInk: "#14304f",
    premium: false,
    pattern: "none",
  },
  "lavender-dream": {
    id: "lavender-dream",
    name: "Lavender Dream",
    nameTh: "ม่วงลาเวนเดอร์",
    paper: "#a891d8",
    paperLit: "#efe6ff",
    inner: "#d6c6fa",
    base: "#3a2c42",
    defaultLight: "#D79BFF",
    defaultInk: "#341a5c",
    premium: false,
    pattern: "none",
  },
  "ruby-red": {
    id: "ruby-red",
    name: "Ruby Red",
    nameTh: "แดงทับทิม",
    paper: "#c8323f",
    paperLit: "#ffc2c6",
    inner: "#ff8a94",
    base: "#3a1014",
    defaultLight: "#FF4D6D",
    defaultInk: "#4a0710",
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
    paper: "#7d8cc8",
    paperLit: "#eef1ff",
    inner: "#c9d3ff",
    base: "#221a2c",
    defaultLight: "#FFE7B0",
    defaultInk: "#1b1f45",
    premium: true,
    pattern: "stars",
  },
  "royal-kanok": {
    id: "royal-kanok",
    name: "Royal Kanok",
    nameTh: "กนกทองหลวง",
    paper: "#c63a32",
    paperLit: "#ffd8b4",
    inner: "#ff9e72",
    base: "#3a1208",
    defaultLight: "#FFC46B",
    defaultInk: "#5c0a10",
    premium: true,
    pattern: "kanok",
  },
  "moonlit-sakura": {
    id: "moonlit-sakura",
    name: "Moonlit Sakura",
    nameTh: "ซากุระแสงจันทร์",
    paper: "#f2c3d3",
    paperLit: "#fff0f6",
    inner: "#ffd6e6",
    base: "#4a2f3a",
    defaultLight: "#FFC7DD",
    defaultInk: "#7a2448",
    premium: true,
    pattern: "sakura",
  },
  "peacock-jade": {
    id: "peacock-jade",
    name: "Peacock Jade",
    nameTh: "นกยูงมรกต",
    paper: "#3e9e8e",
    paperLit: "#dcfff2",
    inner: "#a3efd8",
    base: "#16302a",
    defaultLight: "#C9FFE6",
    defaultInk: "#073b36",
    premium: true,
    pattern: "peacock",
  },
};

export const LIGHT_COLORS = [
  { value: "#F5B942", label: "ทองอุ่น" },
  { value: "#FFD27A", label: "แสงเทียน" },
  { value: "#FFE2A8", label: "ขาวนวล" },
  { value: "#FFF6E0", label: "ขาวจันทร์" },
  { value: "#FF9F4A", label: "ส้มอัสดง" },
  { value: "#FF6B4A", label: "แดงส้ม" },
  { value: "#FF4D6D", label: "แดงกุหลาบ" },
  { value: "#FFB3C1", label: "ชมพูอ่อน" },
  { value: "#FF7EB6", label: "ชมพูบานเย็น" },
  { value: "#D79BFF", label: "ม่วงลาเวนเดอร์" },
  { value: "#9F8CFF", label: "ม่วงคราม" },
  { value: "#7FB2FF", label: "ฟ้าคราม" },
  { value: "#6FE3FF", label: "ฟ้าน้ำทะเล" },
  { value: "#7DFFC8", label: "เขียวมิ้นต์" },
  { value: "#B6F36B", label: "เขียวหิ่งห้อย" },
  { value: "#FFF27A", label: "เหลืองมะนาว" },
] as const;

export interface LanternShapeMeta {
  id: LanternShapeId;
  nameTh: string;
  description: string;
}

/** Display info for each krathong silhouette (price / on-off live in catalog_items kind "shape") */
export const LANTERN_SHAPES: Record<LanternShapeId, LanternShapeMeta> = {
  box: { id: "box", nameTh: "กล่องสี่เหลี่ยม", description: "โคมกระดาษทรงลูกบาศก์คลาสสิก" },
  heart: { id: "heart", nameTh: "หัวใจ", description: "โคมรูปหัวใจ ส่งความรักลอยไปกับสายน้ำ" },
  moon: { id: "moon", nameTh: "ดวงจันทร์", description: "โคมทรงกลมเหมือนพระจันทร์เต็มดวง" },
  rabbit: { id: "rabbit", nameTh: "กระต่ายดวงจันทร์", description: "กระต่ายบนดวงจันทร์ ตามตำนานคืนวันเพ็ญ" },
};

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
