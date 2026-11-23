import type { Catalog, Quote, QuoteLine, Selection } from "@/types/catalog";

/** Smallest paid total (PromptPay transfers have no Stripe-style minimum) */
export const MIN_PAID_TOTAL = 1;

export class PricingError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Builds the bill for a lantern. Used by the browser for display AND by the server
 * (with catalog data from the database) to decide what is actually charged.
 */
export function quote(catalog: Catalog, sel: Selection): Quote {
  const lines: QuoteLine[] = [];

  const design = catalog.designs.find((d) => d.code === sel.design && d.isActive);
  if (!design) throw new PricingError("design_unavailable", "แบบโคมนี้ไม่เปิดให้เลือกในขณะนี้");
  if (design.price > 0) lines.push({ kind: "design", code: design.code, name: `สีโคม ${design.name}`, amount: design.price });

  const shapeCode = sel.shape ?? "box";
  const shape = catalog.shapes.find((s) => s.code === shapeCode && s.isActive);
  // the classic box is always available (also before shapes exist in the catalog)
  if (!shape && shapeCode !== "box") throw new PricingError("shape_unavailable", "รูปทรงกระทงนี้ไม่เปิดให้เลือกในขณะนี้");
  if (shape && shape.price > 0) lines.push({ kind: "shape", code: shape.code, name: `ทรง${shape.name}`, amount: shape.price });

  const unique = [...new Set(sel.effects)];
  for (const code of unique) {
    const fx = catalog.effects.find((e) => e.code === code && e.isActive);
    if (!fx) throw new PricingError("effect_unavailable", "มีเอฟเฟกต์ที่ไม่เปิดให้เลือกในขณะนี้");
    lines.push({ kind: "effect", code: fx.code, name: `เอฟเฟกต์ ${fx.name}`, amount: fx.price });
  }

  const offering = round2(sel.offering || 0);
  if (offering > 0) {
    const o = catalog.offering;
    if (!o.enabled) throw new PricingError("offering_disabled", "ปิดการใส่เงินลงกระทงชั่วคราว");
    if (offering < o.min || offering > o.max) {
      throw new PricingError("offering_range", `ใส่เงินได้ตั้งแต่ ${o.min} ถึง ${o.max.toLocaleString("th-TH")} บาท`);
    }
    lines.push({ kind: "offering", code: "offering", name: "ใส่เงินลงกระทง", amount: offering });
  }

  const total = round2(lines.reduce((s, l) => s + l.amount, 0));
  return { lines, total };
}

/** Free (0) or at least the minimum paid total */
export function totalProblem(total: number, min = MIN_PAID_TOTAL): string | null {
  if (total > 0 && total < min) return `ยอดชำระขั้นต่ำ ${min} บาท – เพิ่มของเสริมหรือใส่เงินอีก ${round2(min - total)} บาท`;
  return null;
}
