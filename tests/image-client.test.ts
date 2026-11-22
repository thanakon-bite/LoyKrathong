import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { dataUrlToBlob } from "@/lib/image-client";
import { sniffImageType } from "@/lib/security/image";

describe("dataUrlToBlob", () => {
  it("decodes base64 image data URLs byte-for-byte (no fetch, CSP-safe)", async () => {
    for (const fmt of ["webp", "png"] as const) {
      const original = await sharp({ create: { width: 8, height: 8, channels: 4, background: "#f5b942" } })[fmt]().toBuffer();
      const blob = await dataUrlToBlob(`data:image/${fmt};base64,${original.toString("base64")}`);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      expect(blob.type).toBe(`image/${fmt}`);
      expect(Buffer.from(bytes).equals(original)).toBe(true);
      expect(sniffImageType(bytes)).toBe(fmt);
    }
  });

  it("rejects malformed input", async () => {
    await expect(dataUrlToBlob("not-a-data-url")).rejects.toThrow();
  });
});
