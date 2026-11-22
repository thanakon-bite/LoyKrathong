import type { Decoration, LanternDesignId } from "./lantern";

export interface PackageFeatures {
  designs: LanternDesignId[];
  allowImage: boolean;
  allowDrawing: boolean;
  decoration: Decoration | null;
  highlights: string[];
}

export interface FestivalPackage {
  id: string;
  slug: string;
  name: string;
  description: string;
  /** Major unit (THB) */
  price: number;
  currency: string;
  features: PackageFeatures;
  sortOrder: number;
  isActive: boolean;
}

export type PaymentStatus = "pending" | "paid" | "failed" | "cancelled" | "expired" | "refunded";

export interface PaymentRecord {
  id: string;
  lanternId: string | null;
  packageName: string;
  amount: number;
  currency: string;
  paymentMethod: string | null;
  paymentStatus: PaymentStatus;
  createdAt: string;
  paidAt: string | null;
}

export interface CheckoutStatus {
  paymentStatus: PaymentStatus;
  lanternId: string | null;
  lanternStatus: string | null;
}
