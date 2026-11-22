"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type { FestivalStats } from "@/types/lantern";

export function useFestivalStats(intervalMs = 20_000) {
  const [stats, setStats] = useState<FestivalStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const { stats } = await apiFetch<{ stats: FestivalStats }>("/api/stats");
        if (active) {
          setStats(stats);
          setError(null);
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, intervalMs);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [intervalMs]);

  return { stats, error, loading };
}
