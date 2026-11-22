import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";

/**
 * Short-lived signed token proving ownership of a guest (anonymous) account.
 * Used when a guest signs in to an EXISTING account and wants to move their lanterns there.
 */
const TTL_MS = 60 * 60 * 1000;

function sign(payload: string) {
  return createHmac("sha256", serverEnv("CLAIM_TOKEN_SECRET")).update(payload).digest("base64url");
}

export function createClaimToken(guestUserId: string) {
  const payload = Buffer.from(JSON.stringify({ uid: guestUserId, exp: Date.now() + TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyClaimToken(token: string): string | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { uid: string; exp: number };
    if (typeof data.uid !== "string" || Date.now() > data.exp) return null;
    return data.uid;
  } catch {
    return null;
  }
}
