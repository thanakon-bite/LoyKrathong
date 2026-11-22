"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Crosshair, Loader2, Plus, RefreshCw, Sparkles, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/providers/auth-provider";
import { useFestivalLanterns } from "@/hooks/use-festival-lanterns";
import { MAX_VISIBLE_LANTERNS } from "@/lib/lantern/selection";
import { FestivalCanvas } from "@/components/scene/festival-canvas";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn, formatNumber } from "@/lib/utils";
import { LanternDetailDialog } from "./lantern-detail-dialog";

const CONNECTION_LABEL = {
  connecting: "กำลังเชื่อมต่อ",
  live: "Live",
  reconnecting: "กำลังเชื่อมต่อใหม่",
  offline: "ออฟไลน์",
  polling: "อัปเดตอัตโนมัติ",
} as const;

export function FestivalView() {
  const params = useSearchParams();
  const router = useRouter();
  const releasedId = params.get("released");
  const focusParam = params.get("focus");
  const { user } = useAuth();
  const { lanterns, serverOffset, loading, error, connection, resync, fetchIds } = useFestivalLanterns();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const [ownerVisible, setOwnerVisible] = useState(true);
  const handledRelease = useRef<string | null>(null);

  const list = useMemo(() => [...lanterns.values()], [lanterns]);
  const selected = selectedId ? (lanterns.get(selectedId) ?? null) : null;
  const myCount = user ? list.filter((l) => l.ownerId === user.id).length : 0;

  // just released: make sure the lantern is loaded and follow it
  useEffect(() => {
    if (!releasedId || loading || handledRelease.current === releasedId) return;
    handledRelease.current = releasedId;
    if (!lanterns.has(releasedId)) void fetchIds([releasedId]);
    toast.success("โคมของคุณกำลังลอยออกไปบนสายน้ำ ✨", { description: "กล้องจะติดตามโคมของคุณ สามารถปิดได้ที่มุมขวาบน" });
    router.replace("/festival", { scroll: false });
  }, [releasedId, loading, lanterns, fetchIds, router]);

  // opened from "My lanterns"
  useEffect(() => {
    if (!focusParam || loading) return;
    if (lanterns.has(focusParam)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- open detail once data has arrived
      setSelectedId(focusParam);
      router.replace("/festival", { scroll: false });
    } else void fetchIds([focusParam]);
  }, [focusParam, loading, lanterns, fetchIds, router]);

  const onGone = useCallback(() => setSelectedId(null), []);
  const visibleCount = Math.min(list.length, MAX_VISIBLE_LANTERNS);

  return (
    <div className="fixed inset-0 overflow-hidden bg-night">
      <h1 className="sr-only">เทศกาลลอยโคมออนไลน์ – โคมที่กำลังลอยอยู่</h1>
      <FestivalCanvas
        lanterns={list}
        serverOffset={serverOffset}
        userId={user?.id ?? null}
        follow={follow}
        focusId={selectedId}
        onLanternClick={setSelectedId}
        onOwnerVisibility={setOwnerVisible}
      />

      {/* HUD */}
      <div className="pointer-events-none absolute inset-x-0 top-16 flex flex-wrap items-start justify-between gap-2 px-4 sm:px-6">
        <div className="glass pointer-events-auto flex items-center gap-3 rounded-full px-4 py-2 text-xs sm:text-sm">
          <span className="flex items-center gap-1.5">
            <span
              className={cn(
                "size-2 rounded-full",
                connection === "live" ? "animate-pulse bg-emerald-400" : connection === "offline" ? "bg-red-400" : "bg-amber-400",
              )}
            />
            {CONNECTION_LABEL[connection]}
          </span>
          <span className="h-4 w-px bg-white/15" />
          <span>
            โคมที่กำลังลอย <b className="text-gold">{formatNumber(list.length)}</b>
            {list.length > MAX_VISIBLE_LANTERNS && <span className="text-warm/50"> · แสดง {visibleCount}</span>}
          </span>
        </div>
        {myCount > 0 && (
          <label className="glass pointer-events-auto flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-xs sm:text-sm">
            <Crosshair className="size-4 text-gold" /> ติดตามโคมของฉัน
            <Switch checked={follow} onCheckedChange={setFollow} aria-label="ติดตามโคมของฉัน" />
          </label>
        )}
      </div>

      <AnimatePresence>
        {myCount > 0 && !ownerVisible && !follow && (
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            onClick={() => setFollow(true)}
            className="glass absolute left-1/2 top-32 -translate-x-1/2 rounded-full px-4 py-2 text-xs text-amber"
          >
            โคมของคุณลอยออกนอกจอ – แตะเพื่อติดตาม
          </motion.button>
        )}
      </AnimatePresence>

      {/* states */}
      {loading && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="glass flex items-center gap-3 rounded-full px-5 py-3 text-sm">
            <Loader2 className="size-4 animate-spin text-gold" /> กำลังโหลดโคมบนสายน้ำ…
          </div>
        </div>
      )}
      {!loading && error && list.length === 0 && (
        <div className="absolute inset-0 grid place-items-center p-4">
          <div className="glass max-w-sm rounded-3xl p-6 text-center">
            <WifiOff className="mx-auto mb-3 size-8 text-amber" />
            <p className="text-warm">ไม่สามารถโหลดโคมได้</p>
            <p className="mt-1 text-sm text-warm/60">{error}</p>
            <Button className="mt-4" variant="outline" onClick={() => void resync()}>
              <RefreshCw /> ลองใหม่
            </Button>
          </div>
        </div>
      )}
      {!loading && !error && list.length === 0 && (
        <div className="absolute inset-x-0 top-1/3 grid place-items-center p-4">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass max-w-sm rounded-3xl p-7 text-center">
            <Sparkles className="mx-auto mb-3 size-8 text-gold" />
            <p className="font-display text-xl text-warm">สายน้ำยังเงียบสงบ</p>
            <p className="mt-2 text-sm text-warm/60">ยังไม่มีโคมลอยอยู่ในขณะนี้ มาเป็นคนแรกที่ส่งแสงแห่งความหวังลงสายน้ำกันเถอะ</p>
            <Button asChild className="mt-5">
              <Link href="/create">ปล่อยโคมดวงแรก</Link>
            </Button>
          </motion.div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center px-4">
        <Button asChild size="lg" className="pointer-events-auto">
          <Link href="/create">
            <Plus /> สร้างโคมของคุณ
          </Link>
        </Button>
      </div>
      <p className="pointer-events-none absolute bottom-20 left-1/2 hidden -translate-x-1/2 text-xs text-warm/40 sm:block">คลิกที่โคมเพื่ออ่านคำอธิษฐาน</p>

      <LanternDetailDialog lantern={selected} serverOffset={serverOffset} onClose={() => setSelectedId(null)} onGone={onGone} />
    </div>
  );
}
