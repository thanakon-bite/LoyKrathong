import { clamp, hashString, lerp, seededRandom, smoothstep } from "@/lib/utils";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Lantern lifetime – MUST match public.lantern_lifetime() in the database */
export const LANTERN_LIFETIME_MS = 7 * DAY;
/** Final stretch during which the light dims and the lantern fades away */
export const FADE_OUT_MS = HOUR;
/** After this the lantern stops drifting outwards and rests among the others */
export const SETTLE_MS = 30 * MIN;

export interface LanternSeed {
  /** lateral spread −1 … 1 */
  lane: number;
  /** depth jitter −1 … 1 */
  depthJitter: number;
  /** slow current drift direction −1 … 1 */
  drift: number;
  /** resting depth 0 … 1 (where the lantern settles after drifting out) */
  rest: number;
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
    rest: r(),
  };
  if (seedCache.size > 4000) seedCache.clear();
  seedCache.set(id, seed);
  return seed;
}

/**
 * Release keyframes (minutes → world z). Smoothly interpolated so motion is never linear:
 *  0–5   near the viewer
 *  5–15  drifting away
 *  15–30 gliding to its resting place
 * After that the lantern rests far out on the water (z ≈ 9–17) until it fades on day 7.
 */
const DEPTH_KEYS: Array<[number, number]> = [
  [0, 1.55],
  [0.12, 2.25],
  [5, 3.3],
  [15, 8.5],
];

export function depthAt(ageMs: number, rest = 0.5) {
  const restZ = 9 + rest * 8;
  const keys: Array<[number, number]> = [...DEPTH_KEYS, [SETTLE_MS / MIN, restZ]];
  const m = Math.max(0, ageMs / MIN);
  for (let i = 1; i < keys.length; i++) {
    const [m1, z1] = keys[i];
    const [m0, z0] = keys[i - 1];
    if (m <= m1) {
      const t = (m - m0) / (m1 - m0);
      // blend of smoothstep and linear keeps a continuous, eased velocity
      const e = lerp(t, smoothstep(t), 0.6);
      return lerp(z0, z1, e);
    }
  }
  // resting: a very slow tide-like breathing so the field never looks frozen
  return restZ + Math.sin((ageMs / HOUR) * 0.7 + rest * 6) * 0.6;
}

export type LifecyclePhase = "near" | "drifting" | "resting" | "fading" | "gone";

export function lifecyclePhase(ageMs: number): LifecyclePhase {
  if (ageMs >= LANTERN_LIFETIME_MS) return "gone";
  if (ageMs >= LANTERN_LIFETIME_MS - FADE_OUT_MS) return "fading";
  if (ageMs >= SETTLE_MS) return "resting";
  if (ageMs >= 5 * MIN) return "drifting";
  return "near";
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
  const settle = Math.min(ageMs, SETTLE_MS);
  const z = depthAt(ageMs, s.rest) + s.depthJitter * Math.min(1.6, 0.7 + settle / (8 * MIN));

  // lanes spread wider as lanterns float away; current drift is bounded so lanterns stay on the water
  const spread = 2.6 + z * 0.5;
  const current = s.drift * (settle / MIN) * 0.09;
  const meander = Math.sin(t * 0.045 + s.phase) * 0.35 + Math.sin(t * 0.011 + s.phase * 1.7) * 0.25;
  const x = s.lane * spread + current + meander;

  const bob = Math.sin(t * s.bobSpeed + s.phase) * 0.035 + Math.sin(t * 0.37 + s.phase * 2.3) * 0.015;
  const yaw = s.baseYaw + Math.sin(t * s.yawSpeed + s.phase) * 0.22 + Math.sin(t * 0.0007 + s.phase) * 0.6;
  const roll = Math.sin(t * s.bobSpeed * 0.8 + s.phase + 1.2) * 0.035;

  // release: light slowly brightens over the first ~5 s
  const ignite = smoothstep(t / 5);
  // final hour of day 7: dim and fade out
  const fade = 1 - smoothstep((ageMs - (LANTERN_LIFETIME_MS - FADE_OUT_MS)) / FADE_OUT_MS);
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

/** "6 วัน 23 ชม." / "4 ชม. 12 นาที" / "12:05 นาที" */
export function formatRemaining(ms: number) {
  if (ms <= 0) return "กำลังจางหาย";
  const d = Math.floor(ms / DAY);
  const h = Math.floor((ms % DAY) / HOUR);
  const m = Math.floor((ms % HOUR) / MIN);
  if (d > 0) return `${d} วัน ${h} ชม.`;
  if (h > 0) return `${h} ชม. ${m} นาที`;
  const s = Math.floor((ms % MIN) / 1000);
  return `${m}:${String(s).padStart(2, "0")} นาที`;
}
