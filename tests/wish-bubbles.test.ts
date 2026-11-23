import { describe, expect, it } from "vitest";
import { BUBBLE_PERIOD, BUBBLE_SHOW, bubblePhase } from "@/lib/scene/wish-bubbles";

describe("wish bubble timing", () => {
  it("is visible part of each cycle, fades and rises while shown", () => {
    const samples = Array.from({ length: 240 }, (_, i) => bubblePhase((i / 240) * BUBBLE_PERIOD, 0));
    const visible = samples.filter((s) => s.alpha > 0).length / samples.length;
    expect(visible).toBeGreaterThan(0.5);
    expect(visible).toBeLessThanOrEqual(BUBBLE_SHOW / BUBBLE_PERIOD + 0.01);
    for (const s of samples) {
      expect(s.alpha).toBeGreaterThanOrEqual(0);
      expect(s.alpha).toBeLessThanOrEqual(1);
    }
    expect(bubblePhase(4, 0).rise).toBeGreaterThan(bubblePhase(1, 0).rise);
  });

  it("staggers lanterns so they take turns", () => {
    const a = Array.from({ length: 50 }, (_, i) => bubblePhase(i * 0.25, 11).alpha > 0);
    const b = Array.from({ length: 50 }, (_, i) => bubblePhase(i * 0.25, 523).alpha > 0);
    expect(a).not.toEqual(b);
  });
});
