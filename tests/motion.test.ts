import { describe, expect, it } from "vitest";
import { depthAt, formatRemaining, lanternPose, lifecyclePhase, FADE_OUT_MS, LANTERN_LIFETIME_MS, SETTLE_MS } from "@/lib/lantern/motion";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("lantern lifecycle (7 days)", () => {
  it("lives for 7 days", () => {
    expect(LANTERN_LIFETIME_MS).toBe(7 * DAY);
  });

  it("maps age to phases", () => {
    expect(lifecyclePhase(2 * MIN)).toBe("near");
    expect(lifecyclePhase(10 * MIN)).toBe("drifting");
    expect(lifecyclePhase(3 * DAY)).toBe("resting");
    expect(lifecyclePhase(7 * DAY - 30 * MIN)).toBe("fading");
    expect(lifecyclePhase(7 * DAY)).toBe("gone");
  });

  it("floats away during the first 30 minutes, then rests far out on the water", () => {
    let prev = -Infinity;
    for (let t = 0; t <= SETTLE_MS; t += 5000) {
      const z = depthAt(t, 0.5);
      expect(z).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = z;
    }
    for (const t of [1 * HOUR, 1 * DAY, 4 * DAY, 6.9 * DAY]) {
      const z = depthAt(t, 0.5);
      expect(z).toBeGreaterThan(8);
      expect(z).toBeLessThan(19);
    }
  });

  it("stays on the water (bounded lateral drift) even after days", () => {
    for (const t of [1 * DAY, 3 * DAY, 6 * DAY]) {
      expect(Math.abs(lanternPose("drifter", t).x)).toBeLessThan(15);
    }
  });

  it("is deterministic for every client", () => {
    expect(lanternPose("abc", 123_456)).toEqual(lanternPose("abc", 123_456));
    expect(lanternPose("abc", 123_456)).not.toEqual(lanternPose("xyz", 123_456));
  });

  it("ignites at release, stays lit for days, fades in the final hour", () => {
    expect(lanternPose("a", 0).glow).toBeLessThan(0.05);
    expect(lanternPose("a", 6000).glow).toBeGreaterThan(0.95);
    expect(lanternPose("a", 3 * DAY).alpha).toBeCloseTo(1, 5);
    expect(lanternPose("a", LANTERN_LIFETIME_MS - FADE_OUT_MS / 2).alpha).toBeLessThan(1);
    expect(lanternPose("a", LANTERN_LIFETIME_MS).alpha).toBeCloseTo(0, 5);
  });

  it("does not move linearly", () => {
    const v1 = depthAt(2 * MIN + 1000) - depthAt(2 * MIN);
    const v2 = depthAt(10 * MIN + 1000) - depthAt(10 * MIN);
    expect(Math.abs(v1 - v2)).toBeGreaterThan(1e-6);
  });

  it("formats remaining time in Thai", () => {
    expect(formatRemaining(6 * DAY + 23 * HOUR + 5 * MIN)).toBe("6 วัน 23 ชม.");
    expect(formatRemaining(4 * HOUR + 12 * MIN)).toBe("4 ชม. 12 นาที");
    expect(formatRemaining(12 * MIN + 5000)).toBe("12:05 นาที");
    expect(formatRemaining(0)).toBe("กำลังจางหาย");
  });
});
