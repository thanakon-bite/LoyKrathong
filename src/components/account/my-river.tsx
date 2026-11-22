"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Hand, Loader2, Sparkles } from "lucide-react";
import type { PublicLantern } from "@/types/lantern";
import { apiFetch } from "@/lib/api-client";
import { FestivalCanvas } from "@/components/scene/festival-canvas";
import { LanternDetailDialog } from "@/components/festival/lantern-detail-dialog";
import { ShareDialog } from "@/components/share/share-dialog";
import { Button } from "@/components/ui/button";

interface Props {
  userId: string;
  /** bump to reload (e.g. after claiming guest lanterns) */
  reloadKey?: number;
}

/**
 * "สายน้ำของฉัน" – the owner's own lanterns floating on the water.
 * Unlike the public festival, lanterns stay here after their 7 days are over.
 */
export function MyRiver({ userId, reloadKey = 0 }: Props) {
  const [lanterns, setLanterns] = useState<PublicLantern[] | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [shareId, setShareId] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);

  useEffect(() => {
    let active = true;
    const t0 = Date.now();
    apiFetch<{ lanterns: PublicLantern[]; serverTime: string }>("/api/me/lanterns")
      .then((r) => {
        if (!active) return;
        setOffset(Date.parse(r.serverTime) + (Date.now() - t0) / 2 - Date.now());
        setLoadedAt(Date.parse(r.serverTime));
        setLanterns(r.lanterns);
      })
      .catch((e: Error) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const byId = useMemo(() => new Map((lanterns ?? []).map((l) => [l.id, l])), [lanterns]);
  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;
  const shareLantern = shareId ? (byId.get(shareId) ?? null) : null;
  const isPublic = (l: PublicLantern) => Date.parse(l.expiresAt) > loadedAt;

  return (
    <section aria-labelledby="river-title" className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 id="river-title" className="font-display text-2xl text-warm">สายน้ำของฉัน</h2>
          <p className="text-sm text-warm/55">โคมของคุณยังลอยอยู่ที่นี่เสมอ แม้จะครบ 7 วันในเทศกาลแล้ว</p>
        </div>
      </div>
      <div className="relative h-[46dvh] min-h-72 overflow-hidden rounded-3xl border border-gold/15 bg-night">
        {lanterns && lanterns.length > 0 && (
          <FestivalCanvas
            lanterns={lanterns}
            serverOffset={offset}
            userId={userId}
            follow={false}
            focusId={selectedId}
            onLanternClick={setSelectedId}
            keepAlive
          />
        )}
        {!lanterns && !error && (
          <div className="absolute inset-0 grid place-items-center text-sm text-warm/60">
            <Loader2 className="size-5 animate-spin text-gold" />
          </div>
        )}
        {error && <div className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-red-200">{error}</div>}
        {lanterns && lanterns.length === 0 && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <div>
              <Sparkles className="mx-auto mb-3 size-8 text-gold" />
              <p className="text-warm">สายน้ำของคุณยังว่างอยู่</p>
              <Button asChild size="sm" className="mt-4">
                <Link href="/create">ปล่อยโคมดวงแรก</Link>
              </Button>
            </div>
          </div>
        )}
        {lanterns && lanterns.length > 0 && (
          <p className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-night/50 px-3 py-1 text-xs text-warm/65 backdrop-blur">
            <Hand className="size-3.5" /> ลากเพื่อเลื่อนดู · แตะโคมเพื่ออ่าน
          </p>
        )}
      </div>

      <LanternDetailDialog
        lantern={selected}
        serverOffset={offset}
        ownerView
        onClose={() => setSelectedId(null)}
        onGone={() => setSelectedId(null)}
        onShare={
          selected && isPublic(selected)
            ? (id) => {
                setSelectedId(null);
                setShareId(id);
              }
            : undefined
        }
      />
      <ShareDialog lantern={shareLantern} onClose={() => setShareId(null)} />
    </section>
  );
}
