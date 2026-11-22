/** Perspective of the water plane. World: x = lateral, z = distance from camera. */
export interface Camera {
  x: number;
  /** dolly forward (world units) */
  z: number;
}

export interface View {
  w: number;
  h: number;
  horizon: number;
  focal: number;
  /** camera height above the water */
  height: number;
}

export const LANTERN_WORLD_SIZE = 0.42;
export const NEAR_CLIP = 0.55;

export function computeView(w: number, h: number): View {
  const portrait = h > w * 1.1;
  const horizon = h * (portrait ? 0.27 : 0.31);
  const focal = Math.min(h * 0.95, w * (portrait ? 0.95 : 0.78));
  const height = ((h * 0.86 - horizon) * 1.85) / focal;
  return { w, h, horizon, focal, height };
}

export interface Projected {
  sx: number;
  sy: number;
  scale: number;
  zEff: number;
}

export function projectPoint(view: View, cam: Camera, x: number, z: number): Projected | null {
  const zEff = z - cam.z;
  if (zEff < NEAR_CLIP) return null;
  const scale = view.focal / zEff;
  return {
    sx: view.w / 2 + (x - cam.x) * scale,
    sy: view.horizon + view.height * scale,
    scale,
    zEff,
  };
}

/** Camera pitch relative to a lantern: looking down more on close lanterns */
export const pitchFor = (view: View, zEff: number) => Math.min(0.46, Math.atan2(view.height, zEff) * 0.8 + 0.05);
