import { describe, expect, it } from "vitest";
import { FALLBACK_CATALOG as catalog } from "@/lib/catalog/defaults";
import { PricingError, quote, totalProblem } from "@/lib/pricing";

describe("à-la-carte pricing", () => {
  it("free lantern costs nothing", () => {
    expect(quote(catalog, { design: "classic-golden", effects: [], offering: 0 })).toEqual({ lines: [], total: 0 });
  });

  it("adds lantern colour, each effect and the offering as separate lines", () => {
    const q = quote(catalog, { design: "lotus-gold", effects: ["fireworks", "hearts"], offering: 50 });
    expect(q.lines.map((l) => [l.kind, l.amount])).toEqual([
      ["design", 19],
      ["effect", 29],
      ["effect", 15],
      ["offering", 50],
    ]);
    expect(q.total).toBe(113);
  });

  it("charges a duplicated effect only once", () => {
    expect(quote(catalog, { design: "classic-golden", effects: ["stars", "stars"], offering: 0 }).total).toBe(15);
  });

  it("rejects hidden items and out-of-range offerings", () => {
    const hidden = { ...catalog, effects: catalog.effects.map((e) => (e.code === "rainbow" ? { ...e, isActive: false } : e)) };
    expect(() => quote(hidden, { design: "classic-golden", effects: ["rainbow"], offering: 0 })).toThrow(PricingError);
    expect(() => quote(catalog, { design: "classic-golden", effects: [], offering: 20000 })).toThrow(/ใส่เงินได้/);
    const off = { ...catalog, offering: { ...catalog.offering, enabled: false } };
    expect(() => quote(off, { design: "classic-golden", effects: [], offering: 10 })).toThrow(PricingError);
  });

  it("flags totals below the Stripe minimum", () => {
    expect(totalProblem(0)).toBeNull();
    expect(totalProblem(5)).toMatch(/ขั้นต่ำ 10/);
    expect(totalProblem(10)).toBeNull();
  });

  it("rounds satang correctly", () => {
    expect(quote(catalog, { design: "classic-golden", effects: [], offering: 10.555 }).total).toBe(10.56);
  });
});
