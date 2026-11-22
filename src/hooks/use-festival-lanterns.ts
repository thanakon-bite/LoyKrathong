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

/** Full refresh (catches expiry / moderation removals) */
const FULL_RESYNC_MS = 60_000;
/** Incremental "anything new?" poll while Realtime is connected (safety net) */
const POLL_LIVE_MS = 15_000;
/** Incremental poll while Realtime is unavailable – new lanterns still show up within seconds */
const POLL_FALLBACK_MS = 4_000;

/**
 * Festival data:
 *  - initial load + periodic full resync from /api/lanterns
 *  - Supabase Realtime broadcast channel "festival": events carry only the lantern id;
 *    the client always fetches the real data from the server (spoofed ids simply return nothing)
 *  - incremental polling (?since=) as a fallback so other people's lanterns appear even if
 *    Realtime is blocked or misconfigured
 *  - animation is never sent over the network – each client computes it from released_at
 */
export function useFestivalLanterns() {
  const [lanterns, setLanterns] = useState<Map<string, PublicLantern>>(new Map());
  const [serverOffset, setServerOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const connectionRef = useRef<ConnectionState>("connecting");
  const pendingIds = useRef(new Set<string>());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const newestRelease = useRef<string | null>(null);
  const hadError = useRef(false);

  const setConn = useCallback((c: ConnectionState) => {
    connectionRef.current = c;
    setConnection(c);
  }, []);

  const applyServerTime = useCallback((serverTime: string, requestStart: number) => {
    const rtt = Date.now() - requestStart;
    setServerOffset(Date.parse(serverTime) + rtt / 2 - Date.now());
  }, []);

  const trackNewest = useCallback((list: PublicLantern[]) => {
    for (const l of list) {
      if (!newestRelease.current || l.releasedAt > newestRelease.current) newestRelease.current = l.releasedAt;
    }
  }, []);

  const merge = useCallback(
    (list: PublicLantern[]) => {
      if (!list.length) return;
      trackNewest(list);
      setLanterns((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const l of list) {
          if (!prev.has(l.id)) changed = true;
          next.set(l.id, l);
        }
        return changed ? next : prev;
      });
    },
    [trackNewest],
  );

  const resync = useCallback(async () => {
    const t0 = Date.now();
    try {
      const data = await apiFetch<LanternsResponse>("/api/lanterns");
      applyServerTime(data.serverTime, t0);
      trackNewest(data.lanterns);
      setLanterns(new Map(data.lanterns.map((l) => [l.id, l])));
      if (!newestRelease.current) newestRelease.current = data.serverTime;
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [applyServerTime, trackNewest]);

  /** Fetch only what is new since the newest lantern we know about */
  const pollNew = useCallback(async () => {
    const since = newestRelease.current;
    if (!since) return;
    // small overlap so a lantern committed in the same millisecond is not missed
    const overlap = new Date(Date.parse(since) - 1500).toISOString();
    const t0 = Date.now();
    try {
      const data = await apiFetch<LanternsResponse>(`/api/lanterns?since=${encodeURIComponent(overlap)}`);
      applyServerTime(data.serverTime, t0);
      merge(data.lanterns);
    } catch {
      /* next poll will retry */
    }
  }, [applyServerTime, merge]);

  /** Fetch specific lanterns (batched – many "lantern:new" events become one request) */
  const fetchIds = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return;
      const t0 = Date.now();
      try {
        const data = await apiFetch<LanternsResponse>(`/api/lanterns?ids=${ids.slice(0, 50).join(",")}`);
        applyServerTime(data.serverTime, t0);
        merge(data.lanterns);
      } catch {
        /* polling will catch up */
      }
    },
    [applyServerTime, merge],
  );

  const queueFetch = useCallback(
    (id: string) => {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return;
      pendingIds.current.add(id);
      if (flushTimer.current) return;
      flushTimer.current = setTimeout(() => {
        const ids = [...pendingIds.current];
        pendingIds.current.clear();
        flushTimer.current = null;
        void fetchIds(ids);
      }, 300);
    },
    [fetchIds],
  );

  /** Add a lantern we already have (e.g. the one the user just released) */
  const addLocal = useCallback((l: PublicLantern) => merge([l]), [merge]);

  useEffect(() => {
    // initial load from the API (data fetching on mount)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void resync();
    const supabase = getBrowserSupabase();
    let channel: RealtimeChannel | null = null;
    let stopped = false;

    if (supabase) {
      channel = supabase
        .channel("festival")
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
        })
        .subscribe((status, err) => {
          if (status === "SUBSCRIBED") {
            setConn("live");
            if (hadError.current) {
              hadError.current = false;
              void pollNew();
            }
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            hadError.current = true;
            if (err) console.warn("[realtime]", status, err.message);
            setConn(navigator.onLine ? "polling" : "offline");
          } else if (status === "CLOSED" && !stopped) {
            setConn("polling");
          }
        });
    } else {
      setConn("polling");
    }

    // adaptive incremental polling: fast when Realtime is down, slow safety net when live
    let pollTimer: ReturnType<typeof setTimeout>;
    const schedulePoll = () => {
      const delay = connectionRef.current === "live" ? POLL_LIVE_MS : POLL_FALLBACK_MS;
      pollTimer = setTimeout(async () => {
        if (!stopped && document.visibilityState === "visible" && navigator.onLine) await pollNew();
        if (!stopped) schedulePoll();
      }, delay);
    };
    schedulePoll();

    const full = setInterval(() => {
      if (document.visibilityState === "visible") void resync();
    }, FULL_RESYNC_MS);

    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 10_000) void resync();
    };
    const onOnline = () => {
      setConn(channel ? "reconnecting" : "polling");
      void resync();
    };
    const onOffline = () => setConn("offline");
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      stopped = true;
      // unsubscribe when leaving the page
      if (channel && supabase) void supabase.removeChannel(channel);
      if (flushTimer.current) clearTimeout(flushTimer.current);
      clearTimeout(pollTimer);
      clearInterval(full);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [resync, queueFetch, pollNew, setConn]);

  return { lanterns, serverOffset, loading, error, connection, resync, fetchIds, addLocal };
}
