import "server-only";
import Stripe from "stripe";
import { serverEnv } from "@/lib/env";

let stripe: Stripe | null = null;

/** Server-side Stripe client. The secret key never reaches the browser. */
export function getStripe(): Stripe {
  if (!stripe) {
    stripe = new Stripe(serverEnv("STRIPE_SECRET_KEY"), {
      appInfo: { name: "loy-krathong-online", version: "1.0.0" },
      // fetch + WebCrypto: runs on Node hosts and on Cloudflare Workers alike
      httpClient: Stripe.createFetchHttpClient(),
      maxNetworkRetries: 2,
      timeout: 20_000,
    });
  }
  return stripe;
}

/** Webhook signature check with WebCrypto (Workers have no Node crypto HMAC streams) */
export const stripeCrypto = Stripe.createSubtleCryptoProvider();

/** THB → satang (Stripe uses the smallest currency unit) */
export const toMinorUnit = (amount: number) => Math.round(amount * 100);
export const fromMinorUnit = (amount: number) => amount / 100;
