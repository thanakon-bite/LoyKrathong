import type { Catalog, CatalogItem } from "@/types/catalog";
import { MIN_PAID_TOTAL } from "@/lib/pricing";

/** Mirrors the seed in migration 005 – only used for display when the API is unreachable */
const item = (kind: CatalogItem["kind"], code: string, name: string, price: number, sortOrder: number): CatalogItem => ({
  id: `${kind}:${code}`,
  kind,
  code,
  name,
  description: "",
  price,
  sortOrder,
  isActive: true,
});

export const FALLBACK_CATALOG: Catalog = {
  designs: [
    item("design", "classic-golden", "ทองคลาสสิก", 0, 10),
    item("design", "warm-white", "ขาวนวล", 0, 20),
    item("design", "sunset-orange", "ส้มอัสดง", 0, 30),
    item("design", "romantic-pink", "ชมพูโรแมนติก", 0, 40),
    item("design", "lotus-gold", "บัวทอง", 19, 50),
    item("design", "midnight-indigo", "คราม", 19, 60),
  ],
  effects: [
    item("effect", "fireworks", "พลุ", 29, 10),
    item("effect", "hearts", "หัวใจ", 15, 20),
    item("effect", "stars", "ดาวระยิบ", 15, 30),
    item("effect", "petals", "กลีบดอกไม้", 15, 40),
    item("effect", "butterflies", "ผีเสื้อ", 19, 50),
    item("effect", "fireflies", "หิ่งห้อย", 15, 60),
    item("effect", "thai-frame", "กรอบลายไทย", 19, 70),
    item("effect", "rainbow", "รุ้ง", 19, 80),
    item("effect", "golden-aura", "ออร่าทอง", 25, 90),
  ],
  offering: { enabled: true, presets: [10, 20, 50, 100, 199], min: 1, max: 10000 },
  minPaidTotal: MIN_PAID_TOTAL,
};
