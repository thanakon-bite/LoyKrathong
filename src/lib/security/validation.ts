import { z } from "zod";
import { DECORATIONS, LANTERN_DESIGN_IDS, LANTERN_FONT_IDS, TEXT_POSITIONS } from "@/types/lantern";
import { LIMITS } from "@/lib/lantern/designs";
import { sanitizeText } from "./sanitize";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "สีไม่ถูกต้อง");

const cleanText = (max: number, min = 0) =>
  z
    .string()
    .transform((s) => sanitizeText(s))
    .pipe(z.string().min(min).max(max));

/** Storage object path owned by a user: "<uuid>/<kind>-<uuid>.webp|png" */
export const assetPathSchema = z
  .string()
  .regex(/^[0-9a-f-]{36}\/(image|drawing)-[0-9a-f-]{36}\.(webp|png)$/, "ไฟล์ไม่ถูกต้อง");

export const textConfigSchema = z.object({
  font: z.enum(LANTERN_FONT_IDS),
  color: hexColor,
  size: z.number().min(0.7).max(1.5),
  position: z.enum(TEXT_POSITIONS),
});

export const imageConfigSchema = z.object({
  x: z.number().min(-0.5).max(0.5),
  y: z.number().min(-0.5).max(0.5),
  scale: z.number().min(0.2).max(1),
});

export const lanternInputSchema = z.object({
  design: z.enum(LANTERN_DESIGN_IDS),
  color: hexColor,
  displayName: cleanText(LIMITS.displayName, 1),
  wishMessage: cleanText(LIMITS.wishMessage),
  blessingMessage: cleanText(LIMITS.blessingMessage),
  extraMessage: cleanText(LIMITS.extraMessage),
  textConfig: textConfigSchema,
  imageConfig: imageConfigSchema.nullable(),
  imagePath: assetPathSchema.nullable(),
  drawingPath: assetPathSchema.nullable(),
});
export type LanternInput = z.infer<typeof lanternInputSchema>;

export const releaseRequestSchema = z.object({
  packageSlug: z.string().regex(/^[a-z0-9-]{2,40}$/),
  requestId: z.uuid(),
  lantern: lanternInputSchema,
});
export type ReleaseRequest = z.infer<typeof releaseRequestSchema>;

export const reportSchema = z.object({
  reason: z.enum(["inappropriate", "spam", "harassment", "personal-info", "other"]),
  details: cleanText(300).optional(),
});

export const packageFeaturesSchema = z.object({
  designs: z.array(z.enum(LANTERN_DESIGN_IDS)).min(1),
  allowImage: z.boolean(),
  allowDrawing: z.boolean(),
  decoration: z.enum(DECORATIONS).nullable(),
  highlights: z.array(z.string().max(60)).max(8),
});

export const packageUpsertSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9-]{2,40}$/, "slug ใช้ a-z 0-9 - เท่านั้น"),
    name: cleanText(80, 1),
    description: cleanText(500),
    price: z.number().min(0).max(100000),
    currency: z.literal("thb"),
    features: packageFeaturesSchema,
    sortOrder: z.number().int().min(0).max(1000),
    isActive: z.boolean(),
  })
  .refine((p) => p.price === 0 || p.price >= 10, { message: "ราคาแพ็กเกจที่ต้องชำระต้องไม่ต่ำกว่า 10 บาท (ข้อกำหนดของ Stripe)", path: ["price"] });

export const uuidSchema = z.uuid();
