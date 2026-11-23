"use client";

import { useEffect, useRef } from "react";
import type { PublicLantern } from "@/types/lantern";
import { FestivalEngine, toEngineLantern } from "@/lib/scene/engine";
import { cn } from "@/lib/utils";

interface Props {
  lanterns: PublicLantern[];
  serverOffset: number;
  userId: string | null;
  follow: boolean;
  focusId: string | null;
  onLanternClick?: (id: string) => void;
  onOwnerVisibility?: (visible: boolean) => void;
  onUserNavigate?: () => void;
  /** increment to reset the camera to the default view */
  resetSignal?: number;
  /** owner's river: lanterns never expire */
  keepAlive?: boolean;
  /** hand mode: taps slap the water and push nearby lanterns */
  splashMode?: boolean;
  className?: string;
}

/** Full-screen festival scene (Canvas 2D, requestAnimationFrame) */
export function FestivalCanvas({ lanterns, serverOffset, userId, follow, focusId, onLanternClick, onOwnerVisibility, onUserNavigate, resetSignal = 0, keepAlive = false, splashMode = false, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<FestivalEngine | null>(null);
  const clickRef = useRef(onLanternClick);
  const visRef = useRef(onOwnerVisibility);
  const navRef = useRef(onUserNavigate);

  useEffect(() => {
    clickRef.current = onLanternClick;
    visRef.current = onOwnerVisibility;
    navRef.current = onUserNavigate;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new FestivalEngine(canvas, {
      interactive: true,
      onLanternClick: (id) => clickRef.current?.(id),
      onOwnerVisibility: (v) => visRef.current?.(v),
      onUserNavigate: () => navRef.current?.(),
      keepAlive,
    });
    engineRef.current = engine;
    engine.start();
    const onVis = () => (document.hidden ? engine.stop() : engine.start());
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      engine.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- engine is created once; keepAlive is fixed per mount
  }, []);

  useEffect(() => {
    engineRef.current?.setServerOffset(serverOffset);
  }, [serverOffset]);

  useEffect(() => {
    engineRef.current?.setUser(userId);
  }, [userId]);

  useEffect(() => {
    engineRef.current?.setFollow(follow);
  }, [follow]);

  useEffect(() => {
    engineRef.current?.setFocus(focusId);
  }, [focusId]);

  useEffect(() => {
    engineRef.current?.replaceAll(lanterns.map(toEngineLantern));
  }, [lanterns]);

  useEffect(() => {
    engineRef.current?.setSplashMode(splashMode);
  }, [splashMode]);

  useEffect(() => {
    if (resetSignal) engineRef.current?.resetView();
  }, [resetSignal]);

  return (
    <canvas
      ref={canvasRef}
      // touch-none: the scene handles drag / pinch itself instead of the browser scrolling or zooming
      className={cn("block h-full w-full cursor-grab touch-none select-none outline-none", className)}
      tabIndex={0}
      role="img"
      aria-label="ฉากเทศกาลลอยโคม ลากหรือใช้ปุ่มลูกศรเพื่อเลื่อนมุมมอง คลิกที่โคมเพื่ออ่านคำอธิษฐาน"
    />
  );
}
