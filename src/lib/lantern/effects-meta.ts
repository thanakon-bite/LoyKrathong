import type { EffectId } from "@/types/lantern";

/** Display metadata (names/prices themselves come from the catalog in the database) */
export const EFFECT_META: Record<EffectId, { emoji: string; nameTh: string; hint: string }> = {
  fireworks: { emoji: "🎆", nameTh: "พลุ", hint: "พลุหลากสีพุ่งขึ้นแตกกระจายเหนือโคม" },
  hearts: { emoji: "💗", nameTh: "หัวใจ", hint: "หัวใจเรืองแสงลอยขึ้นฟ้าแล้วแตกเป็นประกาย" },
  stars: { emoji: "✨", nameTh: "ดาวระยิบ", hint: "วงแหวนดาวหมุนรอบโคม พร้อมดาวระยิบและดาวตก" },
  petals: { emoji: "🌸", nameTh: "กลีบดอกไม้", hint: "กลีบบัวและกุหลาบหมุนร่วงลงลอยรอบกระทง" },
  butterflies: { emoji: "🦋", nameTh: "ผีเสื้อ", hint: "ผีเสื้อปีกเรืองแสงบินวนทิ้งประกายระยิบ" },
  fireflies: { emoji: "🌟", nameTh: "หิ่งห้อย", hint: "หิ่งห้อยนับสิบกะพริบล่องลอยรอบโคม" },
  "thai-frame": { emoji: "🪷", nameTh: "กรอบลายไทย", hint: "ลายไทยสีทองบนกระดาษ และกลีบกนกทองล้อมกระทง" },
  rainbow: { emoji: "🌈", nameTh: "รุ้ง", hint: "สายรุ้งเรืองแสงพาดหลังโคม มีประกายวิ่งตามแนวรุ้ง" },
  "golden-aura": { emoji: "👑", nameTh: "ออร่าทอง", hint: "ลำแสงทองหมุนรอบโคม รัศมีเต้นเป็นจังหวะ ผงทองลอยขึ้น" },
};
