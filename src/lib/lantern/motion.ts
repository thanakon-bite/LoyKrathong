import { clamp, hashString, lerp, seededRandom, smoothstep } from "@/lib/utils";

/** Lantern lifetime – MUST match public.lantern_lifetime() in the database */
export const LANTERN_LIFETIME_MS = 30 * 60 * 1000;
const MIN = 60 * 1000;

export interface LanternSeed {
  /** lateral spread −1 … 1 */
  lane: number;
  /** depth jitter −1 … 1 */
  depthJitter: number;
  /** slow current drift direction −1 … 1 */
  drift: number;
  phase: number;
  bobSpeed: number;
  baseYaw: number;
  yawSpeed: number;
}

const seedCache = new Map<string, LanternSeed>();

export function lanternSeed(id: string): LanternSeed {
  const cached = seedCache.get(id);
  if (cached) return cached;
  const r = seededRandom(hashString(id));
  const seed: LanternSeed = {
    lane: r() * 2 - 1,
    depthJitter: r() * 2 - 1,
    drift: r() * 2 - 1,
    phase: r() * Math.PI * 2,
    bobSpeed: 0.9 + r() * 0.6,
    baseYaw: -0.55 + r() * 0.5,
    yawSpeed: 0.08 + r() * 0.1,
  };
  if (seedCache.size > 2000) seedCache.clear();
  seedCache.set(id, seed);
  return seed;
}

/**
 * Depth keyframes (minutes → world z). Smoothly interpolated, so motion is never linear:
 *  0–5   near the viewer
 *  5–15  drifting away
 *  15–25 far and small
 *  25–30 fading out
 */
const DEPTH_KEYS: Array<[number, number]> = [
  [0, 1.55],
  [0.12, 2.25],
  [5, 3.3],
  [15, 8.5],
  [25, 17],
  [30, 21],
];

export function depthAt(ageMs: number) {
  const m = clamp(ageMs / MIN, 0, 30);
  for (let i = 1; i < DEPTH_KEYS.length; i++) {
    const [m1, z1] = DEPTH_KEYS[i];
    const [m0, z0] = DEPTH_KEYS[i - 1];
    if (m <= m1) {
      const t = (m - m0) / (m1 - m0);
      // blend of smoothstep and linear keeps a continuous, eased velocity
      const e = lerp(t, smoothstep(t), 0.6);
      return lerp(z0, z1, e);
    }
  }
  return DEPTH_KEYS[DEPTH_KEYS.length - 1][1];
}

export type LifecyclePhase = "near" | "drifting" | "far" | "fading" | "gone";

export function lifecyclePhase(ageMs: number): LifecyclePhase {
  const m = ageMs / MIN;
  if (m < 5) return "near";
  if (m < 15) return "drifting";
  if (m < 25) return "far";
  if (m < 30) return "fading";
  return "gone";
}

export interface LanternPose {
  /** world x */
  x: number;
  /** world z (distance from camera) */
  z: number;
  /** vertical bob in world units */
  bob: number;
  /** rotation around vertical axis (radians) */
  yaw: number;
  /** small roll (radians) */
  roll: number;
  /** inner light 0 … 1 */
  glow: number;
  /** opacity 0 … 1 */
  alpha: number;
}

/**
 * Deterministic pose from lantern id + age (server-time based).
 * Every client computes the same motion without syncing animation frames.
 */
export function lanternPose(id: string, ageMs: number): LanternPose {
  const s = lanternSeed(id);
  const t = ageMs / 1000;
  // depth jitter spreads lanterns out so the front of the scene never becomes a wall
  const z = depthAt(ageMs) + s.depthJitter * Math.min(1.6, 0.7 + ageMs / (8 * MIN));

  // lanes spread wider as lanterns float away
  const spread = 2.6 + z * 0.5;
  const current = s.drift * (ageMs / MIN) * 0.09;
  const meander = Math.sin(t * 0.045 + s.phase) * 0.35 + Math.sin(t * 0.11 + s.phase * 1.7) * 0.12;
  const x = s.lane * spread + current + meander;

  const bob = Math.sin(t * s.bobSpeed + s.phase) * 0.035 + Math.sin(t * 0.37 + s.phase * 2.3) * 0.015;
  const yaw = s.baseYaw + Math.sin(t * s.yawSpeed + s.phase) * 0.22 + t * 0.0009;
  const roll = Math.sin(t * s.bobSpeed * 0.8 + s.phase + 1.2) * 0.035;

  // release: light slowly brightens over the first ~5 s
  const ignite = smoothstep(t / 5);
  // last 5 minutes: dim and fade out
  const fade = 1 - smoothstep((ageMs - 25 * MIN) / (5 * MIN));
  const appear = smoothstep(t / 1.6);

  return {
    x,
    z,
    bob,
    yaw,
    roll,
    glow: clamp(ignite * (0.35 + 0.65 * fade), 0, 1),
    alpha: clamp(appear * fade, 0, 1),
  };
}

export const isExpired = (expiresAtMs: number, serverNowMs: number) => serverNowMs >= expiresAtMs;
