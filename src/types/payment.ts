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

/* ---------------------------------------------------------------- PromptPay QR + slip */

export type SlipStatus = "processing" | "verified" | "rejected" | "error" | "pending_review";

/** What the PromptPay payment page needs (amount/payload come from the server, never the browser) */
export interface PromptPayOrder {
  paymentId: string;
  lanternId: string | null;
  /** THB */
  amount: number;
  /** EMVCo PromptPay QR payload with the exact amount */
  qrPayload: string;
  /** shown under the QR so the payer can confirm who receives the money */
  receiverName: string | null;
  createdAt: string;
  /** QR countdown end – a slip is still accepted a while after this */
  expiresAt: string;
  paymentStatus: PaymentStatus;
  lanternStatus: string | null;
  lastSlip: { status: SlipStatus; reason: string | null; message: string | null } | null;
}

export interface SlipResult {
  status: "paid";
  lanternId: string | null;
  alreadyProcessed: boolean;
}
