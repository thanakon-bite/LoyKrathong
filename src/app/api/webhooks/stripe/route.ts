import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { serverEnv } from "@/lib/env";
import { getStripe } from "@/lib/stripe/server";
import { handleStripeEvent } from "@/services/payment-service";
import { logError } from "@/services/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook. The raw body is required for signature verification.
 * Returns 2xx only after the event is safely handled, so Stripe retries on failure.
 */
export async function POST(req: Request) {
  let event: Stripe.Event;
  try {
    const signature = req.headers.get("stripe-signature");
    if (!signature) return NextResponse.json({ error: "missing signature" }, { status: 400 });
    const raw = await req.text();
    event = getStripe().webhooks.constructEvent(raw, signature, serverEnv("STRIPE_WEBHOOK_SECRET"));
  } catch (err) {
    // console only: anyone can POST here, so this must not write a database row per request
    console.warn("[stripe-webhook] signature verification failed:", String(err).slice(0, 200));
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  try {
    const processed = await handleStripeEvent(event);
    return NextResponse.json({ received: true, duplicate: !processed });
  } catch (err) {
    await logError("stripe-webhook", err, { eventId: event.id, type: event.type });
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }
}
