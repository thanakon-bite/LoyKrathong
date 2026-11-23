import { beforeAll, describe, expect, it } from "vitest";
import { assetPathSchema } from "@/lib/security/validation";

const UID = "11111111-2222-4333-8444-555555555555";
const ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("asset paths", () => {
  it("accepts Supabase and R2 asset names (both fit the DB check on image_url)", () => {
    const dbCheck = /^[0-9a-f-]{36}\/[a-z0-9-]+\.(webp|png)$/;
    for (const p of [`${UID}/image-${ID}.webp`, `${UID}/r2-image-${ID}.webp`, `${UID}/r2-drawing-${ID}.png`]) {
      expect(assetPathSchema.safeParse(p).success, p).toBe(true);
      expect(dbCheck.test(p), p).toBe(true);
    }
  });
  it("rejects raw uploads and traversal", () => {
    for (const p of [`raw/${UID}/image-${ID}`, `${UID}/../x.webp`, `${UID}/r3-image-${ID}.webp`]) expect(assetPathSchema.safeParse(p).success, p).toBe(false);
  });
});

describe("R2 presigned URLs", () => {
  let r2: typeof import("@/lib/storage/r2");
  let storage: typeof import("@/services/storage-service");
  beforeAll(async () => {
    Object.assign(process.env, { R2_ACCOUNT_ID: "acc123", R2_ACCESS_KEY_ID: "AKIDEXAMPLE", R2_SECRET_ACCESS_KEY: "secret", R2_BUCKET: "lantern-assets" });
    r2 = await import("@/lib/storage/r2");
    storage = await import("@/services/storage-service");
  });

  it("routes by file name", () => {
    expect(storage.isR2Path(`${UID}/r2-image-${ID}.webp`)).toBe(true);
    expect(storage.isR2Path(`${UID}/image-${ID}.webp`)).toBe(false);
  });

  it("PUT signature pins size + type and expires", async () => {
    const url = new URL(await r2.presignPut(`raw/${UID}/image-${ID}`, "image/jpeg", 48 * 1024 * 1024));
    expect(url.host).toBe("acc123.r2.cloudflarestorage.com");
    expect(url.pathname).toBe(`/lantern-assets/raw/${UID}/image-${ID}`);
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("content-length;content-type;host");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("600");
  });

  it("GET expiry is clamped to the SigV4 maximum", async () => {
    const url = new URL(await r2.presignGet(`${UID}/r2-image-${ID}.webp`, 30 * 86400));
    expect(url.searchParams.get("X-Amz-Expires")).toBe("604800");
  });

  it("direct upload keys are scoped to the user", async () => {
    const { key, uploadUrl } = await storage.createDirectUpload(UID, "image", "image/png", 1234);
    expect(key).toMatch(new RegExp(`^raw/${UID}/image-[0-9a-f-]{36}$`));
    expect(uploadUrl).toContain(encodeURI(key));
    await expect(storage.finishDirectUpload("99999999-2222-4333-8444-555555555555", key)).rejects.toMatchObject({ status: 403 });
  });
});
