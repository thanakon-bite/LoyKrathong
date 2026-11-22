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
  className?: string;
}

/** Full-screen festival scene (Canvas 2D, requestAnimationFrame) */
export function FestivalCanvas({ lanterns, serverOffset, userId, follow, focusId, onLanternClick, onOwnerVisibility, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<FestivalEngine | null>(null);
  const clickRef = useRef(onLanternClick);
  const visRef = useRef(onOwnerVisibility);

  useEffect(() => {
    clickRef.current = onLanternClick;
    visRef.current = onOwnerVisibility;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new FestivalEngine(canvas, {
      interactive: true,
      onLanternClick: (id) => clickRef.current?.(id),
      onOwnerVisibility: (v) => visRef.current?.(v),
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

  return (
    <canvas
      ref={canvasRef}
      className={cn("block h-full w-full touch-manipulation select-none", className)}
      role="img"
      aria-label="ฉากเทศกาลลอยโคม แสดงโคมอธิษฐานที่กำลังลอยอยู่บนผิวน้ำ คลิกที่โคมเพื่อดูคำอธิษฐาน"
    />
  );
}
