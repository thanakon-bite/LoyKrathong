"use client";

import { useEffect, useRef } from "react";
import { FestivalEngine } from "@/lib/scene/engine";
import { cn } from "@/lib/utils";

/** Landing-page background: night water with decorative (non-interactive) lanterns */
export function DecorativeScene({ className, count = 22 }: { className?: string; count?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const engine = new FestivalEngine(canvas, { interactive: false });
    const narrow = window.innerWidth < 640;
    engine.populateDecorative(narrow ? Math.round(count * 0.6) : count);
    engine.start();
    // pause when scrolled out of view or tab hidden
    const io = new IntersectionObserver(([entry]) => (entry.isIntersecting && !document.hidden ? engine.start() : engine.stop()));
    io.observe(canvas);
    const onVis = () => (document.hidden ? engine.stop() : engine.start());
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      engine.destroy();
    };
  }, [count]);

  return <canvas ref={ref} aria-hidden className={cn("block h-full w-full", className)} />;
}
