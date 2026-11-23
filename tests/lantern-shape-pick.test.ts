import { describe, expect, it } from "vitest";
import { pickLanternFace } from "@/lib/lantern/render";
import { SHAPES } from "@/lib/lantern/shapes";
import { TEX_H, TEX_W } from "@/lib/lantern/texture";

describe("pickLanternFace – silhouette lanterns", () => {
  const base = { x: 200, y: 300, size: 100, pitch: 0.36 };
  const u = base.size / 2;

  /** screen point of the texture-rect centre on the front panel at yaw 0 */
  const rectCentre = (shape: keyof typeof SHAPES) => {
    const s = SHAPES[shape];
    const sy = base.y - (s.rect.cy * Math.cos(base.pitch) - s.depth * Math.sin(base.pitch)) * u;
    return { sx: base.x + s.rect.cx * u, sy };
  };

  for (const shape of ["heart", "moon", "rabbit"] as const) {
    it(`${shape}: centre of the front panel maps to the texture centre`, () => {
      const { sx, sy } = rectCentre(shape);
      const hit = pickLanternFace({ ...base, yaw: 0, shape }, sx, sy);
      expect(hit?.face).toBe("front");
      expect(hit!.u).toBeCloseTo(TEX_W / 2, 0);
      expect(hit!.v).toBeCloseTo(TEX_H / 2, 0);
    });

    it(`${shape}: back panel is picked when turned around`, () => {
      const s = SHAPES[shape];
      const sy = base.y - (s.rect.cy * Math.cos(base.pitch) - s.depth * Math.sin(base.pitch)) * u;
      const hit = pickLanternFace({ ...base, yaw: Math.PI, shape }, base.x, sy);
      expect(hit?.face).toBe("back");
      expect(hit!.u).toBeCloseTo(TEX_W / 2, 0);
    });

    it(`${shape}: returns null away from the lantern`, () => {
      expect(pickLanternFace({ ...base, yaw: -0.42, shape }, 10, 10)).toBeNull();
      // just outside the silhouette, level with its widest point
      const s = SHAPES[shape];
      expect(pickLanternFace({ ...base, yaw: 0, shape }, base.x + (s.bbox.x1 + 0.3) * u, base.y - u)).toBeNull();
    });

    it(`${shape}: undoes roll`, () => {
      const { sx, sy } = rectCentre(shape);
      const a = pickLanternFace({ ...base, yaw: 0.2, shape }, sx, sy);
      const b = pickLanternFace({ ...base, yaw: 0.2, roll: 0.0001, shape }, sx, sy);
      expect(b?.face).toBe(a?.face);
      expect(b!.u).toBeCloseTo(a!.u, 0);
      expect(b!.v).toBeCloseTo(a!.v, 0);
    });
  }

  it("heart: the notch between the lobes is not paper", () => {
    const s = SHAPES.heart;
    const sy = base.y - ((s.bbox.y1 - 0.05) * Math.cos(base.pitch) - s.depth * Math.sin(base.pitch)) * u;
    expect(pickLanternFace({ ...base, yaw: 0, shape: "heart" }, base.x, sy)).toBeNull();
  });

  it("box stays the default shape", () => {
    const a = pickLanternFace({ ...base, yaw: 0 }, 200, 250);
    const b = pickLanternFace({ ...base, yaw: 0, shape: "box" }, 200, 250);
    expect(b).toEqual(a);
  });
});
