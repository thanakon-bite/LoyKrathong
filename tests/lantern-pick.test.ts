import { describe, expect, it } from "vitest";
import { pickLanternFace } from "@/lib/lantern/render";
import { TEX_H, TEX_W } from "@/lib/lantern/texture";

describe("pickLanternFace", () => {
  const base = { x: 200, y: 300, size: 100, pitch: 0.36 };

  it("maps the centre of a straight-on front wall to the texture centre", () => {
    // yaw 0: only the front wall faces the camera. Its centre (0, HEIGHT/2, +1) projects to
    // y - (HEIGHT/2 · cos(pitch) − sin(pitch)) · size/2
    const u = base.size / 2;
    const cy = base.y - ((TEX_H / TEX_W) * Math.cos(base.pitch) - Math.sin(base.pitch)) * u;
    const hit = pickLanternFace({ ...base, yaw: 0 }, base.x, cy);
    expect(hit?.face).toBe("front");
    expect(hit!.u).toBeCloseTo(TEX_W / 2, 0);
    expect(hit!.v).toBeCloseTo(TEX_H / 2, 0);
  });

  it("returns null away from the lantern", () => {
    expect(pickLanternFace({ ...base, yaw: -0.42 }, 10, 10)).toBeNull();
  });

  it("undoes roll", () => {
    const a = pickLanternFace({ ...base, yaw: 0 }, 200, 250);
    const b = pickLanternFace({ ...base, yaw: 0, roll: 0.0001 }, 200, 250);
    expect(b?.face).toBe(a?.face);
    expect(b!.u).toBeCloseTo(a!.u, 0);
    expect(b!.v).toBeCloseTo(a!.v, 0);
  });
});
