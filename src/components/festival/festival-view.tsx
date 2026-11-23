"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Crosshair, Hand, Loader2, LocateFixed, Plus, RefreshCw, Sparkles, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/providers/auth-provider";
import { useFestivalLanterns } from "@/hooks/use-festival-lanterns";
import { MAX_VISIBLE_LANTERNS } from "@/lib/lantern/selection";
import { FestivalCanvas } from "@/components/scene/festival-canvas";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn, formatNumber } from "@/lib/utils";
import { LanternDetailDialog } from "./lantern-detail-dialog";
import { ShareDialog } from "@/components/share/share-dialog";

const CONNECTION_LABEL = {
  connecting: "กำลังเชื่อมต่อ",
  live: "Live",
  reconnecting: "กำลังเชื่อมต่อใหม่",
  offline: "ออฟไลน์",
  polling: "อัปเดตอัตโนมัติ",
} as const;

export function FestivalView({ initialFocusId }: { initialFocusId?: string } = {}) {
  const params = useSearchParams();
  const router = useRouter();
  const releasedId = params.get("released");
  const focusParam = params.get("focus") ?? initialFocusId ?? null;
  const { user } = useAuth();
  const { lanterns, serverOffset, loading, error, connection, resync, fetchIds } = useFestivalLanterns();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const [ownerVisible, setOwnerVisible] = useState(true);
  const [navigated, setNavigated] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);
  const handledRelease = useRef<string | null>(null);
  const handledFocus = useRef<string | null>(null);
  const [pendingShare, setPendingShare] = useState<string | null>(null);
  const [shareId, setShareId] = useState<string | null>(null);
  const [shareIsNew, setShareIsNew] = useState(false);

  const list = useMemo(() => [...lanterns.values()], [lanterns]);
  const selected = selectedId ? (lanterns.get(selectedId) ?? null) : null;
  const shareLantern = shareId ? (lanterns.get(shareId) ?? null) : null;
  const myCount = user ? list.filter((l) => l.ownerId === user.id).length : 0;

  // just released: make sure the lantern is loaded and follow it
  useEffect(() => {
    if (!releasedId || loading || handledRelease.current === releasedId) return;
    handledRelease.current = releasedId;
    if (!lanterns.has(releasedId)) void fetchIds([releasedId]);
    toast.success("โคมของคุณกำลังลอยออกไปบนสายน้ำ ✨");
    setPendingShare(releasedId);
    router.replace("/festival", { scroll: false });
  }, [releasedId, loading, lanterns, fetchIds, router]);

  // open the share postcard once the released lantern is loaded and its light has ignited
  useEffect(() => {
    if (!pendingShare || !lanterns.has(pendingShare)) return;
    const t = setTimeout(() => {
      setShareIsNew(true);
      setShareId(pendingShare);
      setPendingShare(null);
    }, 3500);
    return () => clearTimeout(t);
  }, [pendingShare, lanterns]);

  // opened from "My lanterns"
  useEffect(() => {
    if (!focusParam || loading || handledFocus.current === focusParam) return;
    if (lanterns.has(focusParam)) {
      handledFocus.current = focusParam;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- open detail once data has arrived
      setSelectedId(focusParam);
      // ?focus= from "My lanterns" is cleaned up; a shared /l/<id> link keeps its own URL
      if (params.get("focus")) router.replace("/festival", { scroll: false });
    } else void fetchIds([focusParam]);
  }, [focusParam, loading, lanterns, fetchIds, router, params]);

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
        onUserNavigate={() => {
          setNavigated(true);
          setFollow(false);
        }}
        resetSignal={resetSignal}
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
            <span className="hidden sm:inline">{CONNECTION_LABEL[connection]}</span>
          </span>
          <span className="hidden h-4 w-px bg-white/15 sm:block" />
          <span>
            <span className="hidden sm:inline">โคมที่กำลังลอย </span>
            <b className="text-gold">{formatNumber(list.length)}</b>
            <span className="sm:hidden"> โคม</span>
            {list.length > MAX_VISIBLE_LANTERNS && <span className="text-warm/50"> · แสดง {visibleCount}</span>}
          </span>
        </div>
        {myCount > 0 && (
          <label className="glass pointer-events-auto flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-xs sm:text-sm">
            <Crosshair className="size-4 text-gold" /> <span className="hidden sm:inline">ติดตามโคมของฉัน</span><span className="sm:hidden">ติดตาม</span>
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

      <div className="pointer-events-none absolute inset-x-0 bottom-[calc(1.5rem+var(--nf-badge))] flex justify-center px-4">
        <Button asChild size="lg" className="pointer-events-auto">
          <Link href="/create">
            <Plus /> สร้างโคมของคุณ
          </Link>
        </Button>
      </div>
      {!navigated ? (
        <p className="pointer-events-none absolute bottom-[calc(5rem+var(--nf-badge))] left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-night/40 px-3 py-1 text-xs text-warm/60 backdrop-blur">
          <Hand className="size-3.5" /> ลากเพื่อเลื่อนดู · แตะโคมเพื่ออ่านและหมุนดู 360°
        </p>
      ) : (
        <button
          type="button"
          onClick={() => {
            setResetSignal((n) => n + 1);
            setNavigated(false);
          }}
          className="glass absolute bottom-[calc(5rem+var(--nf-badge))] left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-warm/80"
        >
          <LocateFixed className="size-3.5 text-gold" /> กลับมุมมองเริ่มต้น
        </button>
      )}

      <LanternDetailDialog
        lantern={selected}
        serverOffset={serverOffset}
        onClose={() => setSelectedId(null)}
        onGone={onGone}
        onShare={(id) => {
          setSelectedId(null);
          setShareIsNew(false);
          setShareId(id);
        }}
      />
      <ShareDialog lantern={shareLantern} justReleased={shareIsNew} onClose={() => setShareId(null)} />
    </div>
  );
}
