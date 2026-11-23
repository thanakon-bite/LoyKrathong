import { describe, expect, it } from "vitest";
import { bubblePhase } from "@/lib/scene/wish-bubbles";

describe("wish bubbles", () => {
  it("are always visible and bob gently", () => {
    for (let t = 0; t < 30; t += 0.37) {
      const p = bubblePhase(t, 42);
      expect(p.alpha).toBe(1);
      expect(p.rise).toBeGreaterThanOrEqual(1);
      expect(p.rise).toBeLessThanOrEqual(7);
    }
  });
  it("neighbouring lanterns bob out of sync", () => {
    expect(bubblePhase(3, 11).rise).not.toBeCloseTo(bubblePhase(3, 523).rise, 3);
  });
});
