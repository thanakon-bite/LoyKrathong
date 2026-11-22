import type { EffectId, LanternDesignId } from "./lantern";

export interface CatalogItem {
  id: string;
  kind: "design" | "effect";
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
  offering: OfferingSettings;
  /** Stripe minimum charge for THB */
  minPaidTotal: number;
}

export interface QuoteLine {
  kind: "design" | "effect" | "offering";
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
  effects: EffectId[];
  offering: number;
}
