import { describe, expect, it, beforeAll } from "vitest";
import { sanitizeText, escapeJsonForHtml } from "@/lib/security/sanitize";
import { sniffImageType } from "@/lib/security/image";
import { lanternInputSchema, packageUpsertSchema, releaseRequestSchema } from "@/lib/security/validation";

beforeAll(() => {
  process.env.CLAIM_TOKEN_SECRET = "test-secret-test-secret-test-secret";
});

const validLantern = {
  design: "classic-golden",
  color: "#F5B942",
  displayName: "  บี  ",
  wishMessage: "ขอให้มีความสุข",
  blessingMessage: "",
  extraMessage: "",
  textConfig: { font: "sriracha", color: "#5b2d0c", size: 1, position: "center" },
  imageConfig: null,
  imagePath: null,
  drawingPath: null,
};

describe("sanitizeText", () => {
  it("strips tags, control and bidi-override characters", () => {
    expect(sanitizeText("<script>alert(1)</script>สวัสดี‮\u0007")).toBe("alert(1)สวัสดี");
  });
  it("keeps Thai text intact", () => {
    expect(sanitizeText("ขอให้มีความสุข  มาก ๆ")).toBe("ขอให้มีความสุข มาก ๆ");
  });
  it("escapes JSON for inline script tags", () => {
    expect(escapeJsonForHtml('{"a":"</script>"}')).not.toContain("</script>");
  });
});

describe("sniffImageType", () => {
  it("detects real image signatures", () => {
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe("jpeg");
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]))).toBe("png");
    expect(sniffImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe("webp");
  });
  it("rejects disguised files", () => {
    expect(sniffImageType(new TextEncoder().encode("<?php system($_GET[1]); ?>"))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });
});

describe("validation", () => {
  it("accepts and trims a valid lantern", () => {
    const parsed = lanternInputSchema.parse(validLantern);
    expect(parsed.displayName).toBe("บี");
  });
  it("rejects an empty name", () => {
    expect(lanternInputSchema.safeParse({ ...validLantern, displayName: "   " }).success).toBe(false);
  });
  it("rejects overly long wishes", () => {
    expect(lanternInputSchema.safeParse({ ...validLantern, wishMessage: "ก".repeat(201) }).success).toBe(false);
  });
  it("rejects storage paths outside the user folder pattern (path traversal)", () => {
    expect(lanternInputSchema.safeParse({ ...validLantern, imagePath: "../../etc/passwd" }).success).toBe(false);
    expect(
      lanternInputSchema.safeParse({ ...validLantern, imagePath: "11111111-1111-1111-1111-111111111111/image-22222222-2222-2222-2222-222222222222.webp" }).success,
    ).toBe(true);
  });
  it("rejects unknown designs and fonts", () => {
    expect(lanternInputSchema.safeParse({ ...validLantern, design: "hacked" }).success).toBe(false);
    expect(lanternInputSchema.safeParse({ ...validLantern, textConfig: { ...validLantern.textConfig, font: "comic" } }).success).toBe(false);
  });
  it("requires a UUID idempotency key", () => {
    expect(releaseRequestSchema.safeParse({ packageSlug: "free", requestId: "abc", lantern: validLantern }).success).toBe(false);
  });
  it("enforces Stripe's THB minimum on paid packages", () => {
    const base = {
      slug: "premium",
      name: "Premium",
      description: "",
      currency: "thb",
      sortOrder: 1,
      isActive: true,
      features: { designs: ["classic-golden"], allowImage: true, allowDrawing: true, decoration: null, highlights: [] },
    };
    expect(packageUpsertSchema.safeParse({ ...base, price: 5 }).success).toBe(false);
    expect(packageUpsertSchema.safeParse({ ...base, price: 0 }).success).toBe(true);
    expect(packageUpsertSchema.safeParse({ ...base, price: 29 }).success).toBe(true);
  });
});

describe("claim token", () => {
  it("round-trips and rejects tampering", async () => {
    const { createClaimToken, verifyClaimToken } = await import("@/lib/security/claim-token");
    const token = createClaimToken("11111111-1111-1111-1111-111111111111");
    expect(verifyClaimToken(token)).toBe("11111111-1111-1111-1111-111111111111");
    const [payload, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ uid: "attacker", exp: Date.now() + 1e6 })).toString("base64url");
    expect(verifyClaimToken(`${forged}.${sig}`)).toBeNull();
    expect(verifyClaimToken(`${payload}.x${sig.slice(1)}`)).toBeNull();
  });
});
