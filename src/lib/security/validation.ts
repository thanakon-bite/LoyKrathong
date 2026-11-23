import { z } from "zod";
import { DECORATIONS, EFFECT_IDS, LANTERN_DESIGN_IDS,
  LANTERN_SHAPE_IDS, LANTERN_FONT_IDS, PHOTO_FRAMES, TEXT_POSITIONS } from "@/types/lantern";
import { LIMITS } from "@/lib/lantern/designs";
import { sanitizeText } from "./sanitize";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "สีไม่ถูกต้อง");

const cleanText = (max: number, min = 0) =>
  z
    .string()
    .transform((s) => sanitizeText(s))
    .pipe(z.string().min(min).max(max));

/** Storage object path owned by a user: "<uuid>/[r2-]<kind>-<uuid>.webp|png" (r2- = Cloudflare R2, else Supabase Storage) */
export const assetPathSchema = z
  .string()
  .regex(/^[0-9a-f-]{36}\/(r2-)?(image|drawing)-[0-9a-f-]{36}\.(webp|png)$/, "ไฟล์ไม่ถูกต้อง");

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
  /** photo frame shape – optional, older lanterns have none ("rounded") */
  frame: z.enum(PHOTO_FRAMES).optional(),
});

/** Photo and / or drawing on one of the other walls (paths are checked for ownership by assertAssets) */
export const faceArtInputSchema = z
  .object({
    imagePath: assetPathSchema.nullable().default(null),
    imageConfig: imageConfigSchema.nullable().default(null),
    drawingPath: assetPathSchema.nullable().default(null),
  })
  .strict()
  .refine((f) => !f.imagePath || f.imageConfig, { message: "ตำแหน่งรูปไม่ถูกต้อง", path: ["imageConfig"] });

/** right / back / left – the front art stays in imagePath / drawingPath. Unknown keys are rejected. */
export const lanternFacesInputSchema = z
  .object({
    right: faceArtInputSchema.optional(),
    back: faceArtInputSchema.optional(),
    left: faceArtInputSchema.optional(),
  })
  .strict();
export type LanternFacesInput = z.infer<typeof lanternFacesInputSchema>;

export const lanternInputSchema = z.object({
  design: z.enum(LANTERN_DESIGN_IDS),
  shape: z.enum(LANTERN_SHAPE_IDS).default("box"),
  color: hexColor,
  displayName: cleanText(LIMITS.displayName, 1),
  wishMessage: cleanText(LIMITS.wishMessage),
  blessingMessage: cleanText(LIMITS.blessingMessage),
  extraMessage: cleanText(LIMITS.extraMessage),
  textConfig: textConfigSchema,
  imageConfig: imageConfigSchema.nullable(),
  imagePath: assetPathSchema.nullable(),
  drawingPath: assetPathSchema.nullable(),
  /** art on the other walls (only the walls the shape has are kept – see lantern-service) */
  faces: lanternFacesInputSchema.default({}),
});
export type LanternInput = z.infer<typeof lanternInputSchema>;

export const releaseRequestSchema = z.object({
  requestId: z.uuid(),
  lantern: lanternInputSchema,
  /** paid add-ons; prices are looked up on the server */
  effects: z.array(z.enum(EFFECT_IDS)).max(EFFECT_IDS.length).default([]),
  /** money put into the lantern (THB) */
  offering: z.number().min(0).max(100000).default(0),
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

export const catalogItemUpdateSchema = z.object({
  name: cleanText(60, 1),
  description: cleanText(200),
  price: z.number().min(0).max(100000),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(1000),
});

export const offeringSettingsSchema = z
  .object({
    enabled: z.boolean(),
    presets: z.array(z.number().min(1).max(100000)).min(1).max(8),
    min: z.number().min(1).max(100000),
    max: z.number().min(1).max(100000),
  })
  .refine((o) => o.min <= o.max, { message: "ขั้นต่ำต้องไม่มากกว่าสูงสุด", path: ["min"] });

/* ---------------------------------------------------------------- PromptPay slip payments */

/** Slip mini-QR read in the browser: EMV TLV, alphanumeric, ≤ 128 chars (EasySlip's payload limit) */
export const slipPayloadSchema = z.string().trim().regex(/^[0-9A-Za-z]{20,128}$/, "QR ของสลิปไม่ถูกต้อง");

export const adminPaymentActionSchema = z.object({ action: z.literal("approve") });
