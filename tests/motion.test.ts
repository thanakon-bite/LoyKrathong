import { describe, expect, it } from "vitest";
import { depthAt, lanternPose, lifecyclePhase, LANTERN_LIFETIME_MS } from "@/lib/lantern/motion";

const MIN = 60_000;

describe("lantern lifecycle", () => {
  it("has a 30 minute lifetime", () => {
    expect(LANTERN_LIFETIME_MS).toBe(30 * MIN);
  });

  it("maps age to the documented phases", () => {
    expect(lifecyclePhase(2 * MIN)).toBe("near");
    expect(lifecyclePhase(10 * MIN)).toBe("drifting");
    expect(lifecyclePhase(20 * MIN)).toBe("far");
    expect(lifecyclePhase(27 * MIN)).toBe("fading");
    expect(lifecyclePhase(30 * MIN)).toBe("gone");
  });

  it("floats steadily away (depth increases monotonically)", () => {
    let prev = -Infinity;
    for (let t = 0; t <= 30 * MIN; t += 5000) {
      const z = depthAt(t);
      expect(z).toBeGreaterThanOrEqual(prev);
      prev = z;
    }
    expect(depthAt(25 * MIN)).toBeGreaterThan(depthAt(15 * MIN));
  });

  it("is deterministic for every client", () => {
    expect(lanternPose("abc", 123_456)).toEqual(lanternPose("abc", 123_456));
    expect(lanternPose("abc", 123_456)).not.toEqual(lanternPose("xyz", 123_456));
  });

  it("ignites at release and fades out at the end", () => {
    expect(lanternPose("a", 0).glow).toBeLessThan(0.05);
    expect(lanternPose("a", 6000).glow).toBeGreaterThan(0.95);
    expect(lanternPose("a", 10 * MIN).alpha).toBeCloseTo(1, 5);
    expect(lanternPose("a", 27.5 * MIN).alpha).toBeLessThan(1);
    expect(lanternPose("a", 30 * MIN).alpha).toBeCloseTo(0, 5);
  });

  it("does not move linearly (velocity changes over time)", () => {
    const v1 = depthAt(2 * MIN + 1000) - depthAt(2 * MIN);
    const v2 = depthAt(10 * MIN + 1000) - depthAt(10 * MIN);
    expect(Math.abs(v1 - v2)).toBeGreaterThan(1e-6);
  });
});
