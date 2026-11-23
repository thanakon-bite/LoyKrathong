import type { EffectId, LanternDesignId, LanternShapeId } from "./lantern";

export interface CatalogItem {
  id: string;
  kind: "design" | "effect" | "shape";
  code: string;
  name: string;
  description: string;
  /** THB */
  price: number;
  sortOrder: number;
  isActive: boolean;
}

export interface OfferingSettings {
  enabled: boolean;
  presets: number[];
  min: number;
  max: number;
}

export interface Catalog {
  designs: CatalogItem[];
  effects: CatalogItem[];
  /** krathong silhouettes – empty until the shapes migration has run (then only "box", free, is offered) */
  shapes: CatalogItem[];
  offering: OfferingSettings;
  /** Stripe minimum charge for THB */
  minPaidTotal: number;
}

export interface QuoteLine {
  kind: "design" | "effect" | "shape" | "offering";
  code: string;
  name: string;
  amount: number;
}

export interface Quote {
  lines: QuoteLine[];
  total: number;
}

export interface Selection {
  design: LanternDesignId;
  /** krathong silhouette – "box" when omitted */
  shape?: LanternShapeId;
  effects: EffectId[];
  offering: number;
}
