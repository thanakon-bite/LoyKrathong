import type { EffectId } from "@/types/lantern";

/** Display metadata (names/prices themselves come from the catalog in the database) */
export const EFFECT_META: Record<EffectId, { emoji: string; nameTh: string; hint: string }> = {
  fireworks: { emoji: "🎆", nameTh: "พลุ", hint: "พลุแตกเหนือโคม" },
  hearts: { emoji: "💗", nameTh: "หัวใจ", hint: "หัวใจลอยขึ้นฟ้า" },
  stars: { emoji: "✨", nameTh: "ดาวระยิบ", hint: "ดาวหมุนรอบโคม" },
  petals: { emoji: "🌸", nameTh: "กลีบดอกไม้", hint: "กลีบดอกไม้ลอยรอบกระทง" },
  butterflies: { emoji: "🦋", nameTh: "ผีเสื้อ", hint: "ผีเสื้อเรืองแสงบินวน" },
  fireflies: { emoji: "🌟", nameTh: "หิ่งห้อย", hint: "แสงหิ่งห้อยกะพริบ" },
  "thai-frame": { emoji: "🪷", nameTh: "กรอบลายไทย", hint: "ลายไทยสีทองบนกระดาษ" },
  rainbow: { emoji: "🌈", nameTh: "รุ้ง", hint: "สายรุ้งพาดหลังโคม" },
  "golden-aura": { emoji: "👑", nameTh: "ออร่าทอง", hint: "รัศมีทองเปล่งประกาย" },
};
