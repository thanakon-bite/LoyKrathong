"use client";

import { useEffect, useRef } from "react";
import type { LanternVisual } from "@/types/lantern";
import { drawLantern, drawReflection } from "@/lib/lantern/render";
import { buildFaceTextures, ensureLanternFonts, loadImage, type FaceTextures } from "@/lib/lantern/texture";
import { cn, hashString, smoothstep } from "@/lib/utils";

interface Props {
  visual: LanternVisual;
  className?: string;
  /** play the "light slowly brightens" release animation */
  ignite?: boolean;
  /** slow automatic rotation to show the side faces */
  rotate?: boolean;
  /** manual yaw offset (e.g. from a drag) */
  yawOffset?: number;
  /** freeze animation (paused lantern in the detail view) */
  still?: boolean;
  label?: string;
}

/** Single cube lantern on a small patch of night water – used by the Studio, Preview and Detail view */
export function LanternPreview({ visual, className, ignite, rotate = true, yawOffset = 0, still, label }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const texRef = useRef<FaceTextures | null>(null);
  const yawRef = useRef(yawOffset);
  const visualRef = useRef(visual);
  const stillRef = useRef(still);

  useEffect(() => {
    yawRef.current = yawOffset;
    visualRef.current = visual;
    stillRef.current = still;
  });

  // rebuild face textures when content changes (debounced while typing)
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      await ensureLanternFonts([visual.textConfig.font]);
      const [image, drawing] = await Promise.all([
        visual.imageSrc ? loadImage(visual.imageSrc).catch(() => null) : null,
        visual.drawingSrc ? loadImage(visual.drawingSrc).catch(() => null) : null,
      ]);
      if (cancelled) return;
      texRef.current = buildFaceTextures(visual, { image, drawing }, { target: texRef.current });
    }, 90);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [visual]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const start = performance.now();
    const seed = (hashString(visual.displayName || "x") % 100) / 10;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const v = visualRef.current;
      const t = stillRef.current ? 0 : (now - start) / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const horizon = h * 0.42;
      const sky = ctx.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, "#050813");
      sky.addColorStop(1, "#111a3a");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, horizon);
      const water = ctx.createLinearGradient(0, horizon, 0, h);
      water.addColorStop(0, "#0b1430");
      water.addColorStop(1, "#02040a");
      ctx.fillStyle = water;
      ctx.fillRect(0, horizon, w, h - horizon);
      ctx.fillStyle = "rgba(255, 214, 140, 0.14)";
      ctx.fillRect(0, horizon, w, 1);

      const size = Math.min(w * 0.36, h * 0.34);
      const glow = ignite ? smoothstep(t / 3.5) : 1;
      const bob = stillRef.current ? 0 : Math.sin(t * 1.2) * size * 0.02;
      const x = w / 2;
      const y = h * 0.78 + bob;
      const yaw = -0.42 + yawRef.current + (rotate && !stillRef.current ? Math.sin(t * 0.35) * 0.32 : 0);
      drawReflection(ctx, x, y + size * 0.05, size, v.color, glow, 1, t, seed);
      drawLantern(ctx, {
        x,
        y,
        size,
        yaw,
        pitch: 0.38,
        roll: stillRef.current ? 0 : Math.sin(t * 0.9) * 0.02,
        glow,
        alpha: 1,
        design: v.design,
        light: v.color,
        decoration: v.decoration,
        textures: texRef.current,
        time: t,
        seed,
      });
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- animation reads latest props from refs
  }, [ignite, rotate]);

  return <canvas ref={canvasRef} role="img" aria-label={label ?? "ตัวอย่างโคมอธิษฐาน"} className={cn("block h-full w-full", className)} />;
}
