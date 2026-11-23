import "server-only";
import type SharpFn from "sharp";
import { cloudflareEnv } from "@/lib/platform/cloudflare";
import { TEX_H, TEX_W } from "@/lib/lantern/texture";

export type AssetKind = "image" | "drawing";

/** Longest side of a stored photo (shown on the lantern face and as a polaroid) */
export const IMAGE_MAX_SIDE = 1600;

export class InvalidImageError extends Error {}

/**
 * Re-encodes an uploaded image (strips EXIF/GPS and anything hidden in the file).
 * - Cloudflare Workers: the Images binding (sharp's native binary cannot run there)
 * - Node hosts (Netlify, local dev): sharp
 */
export async function reencodeImage(kind: AssetKind, bytes: Uint8Array): Promise<{ output: Uint8Array; ext: "webp" | "png" }> {
  const images = cloudflareEnv()?.IMAGES;
  if (images) return reencodeWithCloudflare(images, kind, bytes);
  return reencodeWithSharp(kind, bytes);
}

const toStream = (bytes: Uint8Array) => new Blob([bytes as BlobPart]).stream();

async function reencodeWithCloudflare(images: NonNullable<ReturnType<typeof cloudflareEnv>>["IMAGES"] & object, kind: AssetKind, bytes: Uint8Array) {
  try {
    const info = await images.info(toStream(bytes));
    if (!info.width || !info.height) throw new Error("no dimensions");
    const out =
      kind === "drawing"
        ? await images.input(toStream(bytes)).transform({ width: TEX_W, height: TEX_H, fit: "scale-down" }).output({ format: "image/png" })
        : await images
            .input(toStream(bytes))
            .transform({ width: IMAGE_MAX_SIDE, height: IMAGE_MAX_SIDE, fit: "scale-down" })
            .output({ format: "image/webp", quality: 84 });
    const output = new Uint8Array(await out.response().arrayBuffer());
    if (!output.byteLength) throw new Error("empty output");
    return { output, ext: kind === "drawing" ? ("png" as const) : ("webp" as const) };
  } catch (e) {
    throw new InvalidImageError(String(e));
  }
}

async function reencodeWithSharp(kind: AssetKind, bytes: Uint8Array) {
  // variable specifier: keeps bundlers for edge/Workers from trying to bundle the native module
  const mod = "sharp";
  const sharp = ((await import(/* webpackIgnore: true */ mod)) as { default: typeof SharpFn }).default;
  try {
    // 50 MB photos can be ~100 MP; sharp streams them, but keep a hard ceiling for memory
    const img = sharp(bytes, { limitInputPixels: 120_000_000, failOn: "error" }).rotate();
    const meta = await img.metadata();
    if (!meta.width || !meta.height) throw new Error("no dimensions");
    if (kind === "drawing") {
      return { output: new Uint8Array(await img.resize(TEX_W, TEX_H, { fit: "fill" }).png({ compressionLevel: 9, palette: true }).toBuffer()), ext: "png" as const };
    }
    return {
      output: new Uint8Array(await img.resize(IMAGE_MAX_SIDE, IMAGE_MAX_SIDE, { fit: "inside", withoutEnlargement: true }).webp({ quality: 84 }).toBuffer()),
      ext: "webp" as const,
    };
  } catch (e) {
    throw new InvalidImageError(String(e));
  }
}
