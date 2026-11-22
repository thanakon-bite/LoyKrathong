"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api-client";
import type { PublicLantern } from "@/types/lantern";

export type ConnectionState = "connecting" | "live" | "reconnecting" | "offline" | "polling";

interface LanternsResponse {
  serverTime: string;
  lanterns: PublicLantern[];
}

const RESYNC_INTERVAL_MS = 120_000;

/**
 * Festival data:
 *  - initial load + periodic resync from /api/lanterns
 *  - Supabase Realtime private broadcast channel "festival" (events only: lantern:new / lantern:removed;
 *    animation is never sent over the network – each client computes it from released_at)
 *  - automatic reconnect + resync after network loss
 */
export function useFestivalLanterns() {
  const [lanterns, setLanterns] = useState<Map<string, PublicLantern>>(new Map());
  const [serverOffset, setServerOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [removed, setRemoved] = useState<string[]>([]);
  const pendingIds = useRef(new Set<string>());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hadError = useRef(false);

  const applyServerTime = useCallback((serverTime: string, requestStart: number) => {
    const rtt = Date.now() - requestStart;
    setServerOffset(Date.parse(serverTime) + rtt / 2 - Date.now());
  }, []);

  const resync = useCallback(async () => {
    const t0 = Date.now();
    try {
      const data = await apiFetch<LanternsResponse>("/api/lanterns");
      applyServerTime(data.serverTime, t0);
      setLanterns(new Map(data.lanterns.map((l) => [l.id, l])));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [applyServerTime]);

  /** Fetch specific lanterns (batched – many "lantern:new" events become one request) */
  const fetchIds = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return;
      const t0 = Date.now();
      try {
        const data = await apiFetch<LanternsResponse>(`/api/lanterns?ids=${ids.slice(0, 50).join(",")}`);
        applyServerTime(data.serverTime, t0);
        if (data.lanterns.length) {
          setLanterns((prev) => {
            const next = new Map(prev);
            for (const l of data.lanterns) next.set(l.id, l);
            return next;
          });
        }
      } catch {
        /* the periodic resync will catch up */
      }
    },
    [applyServerTime],
  );

  const queueFetch = useCallback(
    (id: string) => {
      pendingIds.current.add(id);
      if (flushTimer.current) return;
      flushTimer.current = setTimeout(() => {
        const ids = [...pendingIds.current];
        pendingIds.current.clear();
        flushTimer.current = null;
        void fetchIds(ids);
      }, 350);
    },
    [fetchIds],
  );

  /** Add a lantern we already have (e.g. the one the user just released) */
  const addLocal = useCallback((l: PublicLantern) => {
    setLanterns((prev) => new Map(prev).set(l.id, l));
  }, []);

  useEffect(() => {
    // initial load from the API (data fetching on mount)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void resync();
    const supabase = getBrowserSupabase();
    let channel: RealtimeChannel | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    if (supabase) {
      channel = supabase
        .channel("festival", { config: { private: true } })
        .on("broadcast", { event: "lantern:new" }, ({ payload }) => {
          if (payload?.id) queueFetch(String(payload.id));
        })
        .on("broadcast", { event: "lantern:removed" }, ({ payload }) => {
          const id = payload?.id ? String(payload.id) : null;
          if (!id) return;
          setLanterns((prev) => {
            if (!prev.has(id)) return prev;
            const next = new Map(prev);
            next.delete(id);
            return next;
          });
          setRemoved((r) => [...r.slice(-50), id]);
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            setConnection("live");
            if (hadError.current) {
              hadError.current = false;
              void resync();
            }
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            hadError.current = true;
            setConnection(navigator.onLine ? "reconnecting" : "offline");
          } else if (status === "CLOSED") {
            setConnection("offline");
          }
        });
    } else {
      setConnection("polling");
      pollTimer = setInterval(() => void resync(), 15_000);
    }

    const periodic = setInterval(() => {
      if (document.visibilityState === "visible") void resync();
    }, RESYNC_INTERVAL_MS);
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 20_000) void resync();
    };
    const onOnline = () => {
      setConnection("reconnecting");
      void resync();
    };
    const onOffline = () => setConnection("offline");
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      // unsubscribe when leaving the page
      if (channel && supabase) void supabase.removeChannel(channel);
      if (pollTimer) clearInterval(pollTimer);
      if (flushTimer.current) clearTimeout(flushTimer.current);
      clearInterval(periodic);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [resync, queueFetch]);

  return { lanterns, serverOffset, loading, error, connection, removed, resync, fetchIds, addLocal };
}
