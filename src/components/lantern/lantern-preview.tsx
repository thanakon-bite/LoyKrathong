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
  /** drag (mouse / touch) to rotate the lantern freely. Default true */
  interactive?: boolean;
}

/** Single cube lantern on a small patch of night water – used by the Studio, Preview and Detail view */
export function LanternPreview({ visual, className, ignite, rotate = true, yawOffset = 0, still, label, interactive = true }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const texRef = useRef<FaceTextures | null>(null);
  const yawRef = useRef(yawOffset);
  const visualRef = useRef(visual);
  const stillRef = useRef(still);
  // user rotation (drag) with inertia
  const userYaw = useRef(0);
  const userPitch = useRef(0);
  const vel = useRef({ yaw: 0, pitch: 0 });
  const drag = useRef<{ id: number; x: number; y: number; t: number } | null>(null);
  const lastInteract = useRef(-1e9);
  const autoWeight = useRef(1);

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
    }, 150);
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
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
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

    // only animate while the preview is on screen and the tab is visible
    let onScreen = true;
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
    });
    io.observe(canvas);
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!onScreen || document.hidden || w === 0) return;
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
      // inertia after a drag
      if (!drag.current) {
        userYaw.current += vel.current.yaw;
        userPitch.current = Math.max(-0.33, Math.min(0.55, userPitch.current + vel.current.pitch));
        vel.current.yaw *= 0.93;
        vel.current.pitch *= 0.9;
      }
      // gentle auto-sway fades out while the user is rotating and returns after a few idle seconds
      const idle = now - lastInteract.current > 3500 && !drag.current;
      autoWeight.current += ((idle ? 1 : 0) - autoWeight.current) * 0.02;
      const sway = rotate && !stillRef.current ? Math.sin(t * 0.35) * 0.32 * autoWeight.current : 0;
      const yaw = -0.42 + yawRef.current + userYaw.current + sway;
      const pitch = 0.38 + userPitch.current;
      drawReflection(ctx, x, y + size * 0.05, size, v.color, glow, 1, t, seed);
      drawLantern(ctx, {
        x,
        y,
        size,
        yaw,
        pitch,
        roll: stillRef.current ? 0 : Math.sin(t * 0.9) * 0.02,
        glow,
        alpha: 1,
        design: v.design,
        light: v.color,
        effects: v.effects,
        offering: v.offering,
        textures: texRef.current,
        time: t,
        seed,
      });
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- animation reads latest props from refs
  }, [ignite, rotate]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!interactive) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
    vel.current = { yaw: 0, pitch: 0 };
    lastInteract.current = performance.now();
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const w = e.currentTarget.getBoundingClientRect().width || 300;
    const dYaw = ((e.clientX - d.x) / w) * Math.PI * 1.4;
    const dPitch = ((e.clientY - d.y) / w) * 1.2;
    userYaw.current += dYaw;
    userPitch.current = Math.max(-0.33, Math.min(0.55, userPitch.current + dPitch));
    const dt = Math.max(8, performance.now() - d.t);
    vel.current = { yaw: (dYaw * 16) / dt, pitch: (dPitch * 16) / dt };
    drag.current = { id: d.id, x: e.clientX, y: e.clientY, t: performance.now() };
    lastInteract.current = performance.now();
  };
  const endDrag = () => {
    drag.current = null;
    lastInteract.current = performance.now();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!interactive) return;
    const step = 0.25;
    if (e.key === "ArrowLeft") userYaw.current -= step;
    else if (e.key === "ArrowRight") userYaw.current += step;
    else if (e.key === "ArrowUp") userPitch.current = Math.max(-0.33, userPitch.current - 0.1);
    else if (e.key === "ArrowDown") userPitch.current = Math.min(0.55, userPitch.current + 0.1);
    else return;
    e.preventDefault();
    lastInteract.current = performance.now();
  };

  return (
    <canvas
      ref={canvasRef}
      role="img"
      tabIndex={interactive ? 0 : undefined}
      aria-label={`${label ?? "ตัวอย่างโคมอธิษฐาน"}${interactive ? " – ลากหรือใช้ปุ่มลูกศรเพื่อหมุนโคม" : ""}`}
      className={cn("block h-full w-full outline-none", interactive && "cursor-grab touch-none active:cursor-grabbing", className)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
    />
  );
}
