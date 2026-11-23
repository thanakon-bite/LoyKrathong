"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Flag, Heart, Loader2, Share2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import type { PublicLantern } from "@/types/lantern";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/components/providers/auth-provider";
import { LanternPreview } from "@/components/lantern/lantern-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatRemaining } from "@/lib/lantern/motion";
import { EFFECT_META } from "@/lib/lantern/effects-meta";
import { canvasToBlob, renderPolaroid } from "@/lib/share/polaroid";
import { KeepsakeViewer, lanternKeepsakes, PolaroidPhoto } from "@/components/share/keepsake-viewer";

const REASONS = [
  { id: "inappropriate", label: "เนื้อหาไม่เหมาะสม" },
  { id: "harassment", label: "คุกคาม / ดูหมิ่น" },
  { id: "personal-info", label: "เปิดเผยข้อมูลส่วนตัว" },
  { id: "spam", label: "สแปม / โฆษณา" },
  { id: "other", label: "อื่น ๆ" },
] as const;

function useCountdown(expiresAt: string | undefined, serverOffset: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!expiresAt) return null;
  const ms = Date.parse(expiresAt) - (now + serverOffset);
  return { label: formatRemaining(ms), live: ms > 0 };
}

interface Props {
  lantern: PublicLantern | null;
  serverOffset: number;
  onClose: () => void;
  onGone: (id: string) => void;
  onShare?: (id: string) => void;
  /** owner's river: data comes from /api/me/lanterns – don't re-check the public endpoint */
  ownerView?: boolean;
}

export function LanternDetailDialog({ lantern, serverOffset, onClose, onGone, onShare, ownerView }: Props) {
  const { user, ensureSession } = useAuth();
  const [fresh, setFresh] = useState<PublicLantern | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number]["id"]>("inappropriate");
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);
  const [zoom, setZoom] = useState<number | null>(null);
  const data = fresh?.id === lantern?.id ? fresh : lantern;
  const remaining = useCountdown(data?.expiresAt, serverOffset);
  const isMine = !!user && data?.ownerId === user.id;

  // re-validate with the server (expired lanterns cannot be opened) and refresh signed URLs.
  // Keyed by id: the festival replaces lantern objects on every realtime update / resync.
  const lanternId = lantern?.id ?? null;
  useEffect(() => {
    if (!lanternId || ownerView) return;
    let active = true;
    apiFetch<{ lantern: PublicLantern }>(`/api/lanterns/${lanternId}`)
      .then((r) => active && setFresh(r.lantern))
      .catch((e) => {
        if (!active) return;
        if (e.status === 404) {
          toast.info("โคมนี้ลอยหายไปกับสายน้ำแล้ว");
          onGone(lanternId);
        }
      });
    return () => {
      active = false;
      setReporting(false);
      setZoom(null);
    };
  }, [lanternId, onGone, ownerView]);

  // the card opens as the same polaroid postcard that is shared (rendered once per lantern)
  const [postcard, setPostcard] = useState<{ id: string; url: string } | null>(null);
  const latest = useRef(data);
  useEffect(() => {
    latest.current = data;
  });
  const postcardKey = data ? `${data.id}|${data.imageSrc ? 1 : 0}|${data.drawingSrc ? 1 : 0}` : null;
  useEffect(() => {
    const v = latest.current;
    if (!postcardKey || !v) return;
    let cancelled = false;
    let url: string | null = null;
    renderPolaroid(v, { host: window.location.host })
      .then((c) => canvasToBlob(c, "image/jpeg", 0.9))
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setPostcard({ id: v.id, url });
      })
      .catch(() => undefined); // the live 3D lantern stays as the fallback
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [postcardKey]);
  const postcardUrl = postcard && postcard.id === data?.id ? postcard.url : null;

  // ---- top carousel: live krathong → postcard → photo cards (swipe sideways, tap to open big) ----
  const track = useRef<HTMLDivElement>(null);
  const [slide, setSlide] = useState(0);
  const [big, setBig] = useState<"lantern" | "postcard" | null>(null);
  useEffect(() => {
    track.current?.scrollTo({ left: 0 });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset per lantern
    setSlide(0);
    setBig(null);
  }, [lanternId]);
  const onTrackScroll = () => {
    const el = track.current;
    if (!el) return;
    const w = el.clientWidth || 1;
    setSlide(Math.round(el.scrollLeft / w));
  };
  const goSlide = (i: number) => track.current?.scrollTo({ left: i * (track.current.clientWidth || 0), behavior: "smooth" });

  const sendReport = async () => {
    if (!data) return;
    setSending(true);
    try {
      await ensureSession();
      await apiFetch(`/api/lanterns/${data.id}/report`, { method: "POST", json: { reason, details: details || undefined } });
      toast.success("ขอบคุณที่ช่วยดูแลเทศกาล ทีมงานจะตรวจสอบโดยเร็ว");
      setReporting(false);
      setDetails("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const released = data ? new Date(data.releasedAt).toLocaleString("th-TH", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  const keepsakes = data ? lanternKeepsakes(data) : [];
  // photos of every wall as polaroids (drawings are already visible on the lantern itself)
  const gallery = keepsakes.filter((k) => k.kind === "image" && k.src);

  return (
    <Dialog open={!!lantern} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[94dvh] max-w-4xl gap-0 overflow-hidden p-0 sm:p-0" onEscapeKeyDown={(e) => {
          if (big) {
            e.preventDefault();
            setBig(null);
          } else if (zoom !== null) e.preventDefault();
        }}>
        {data && (
          <div className="relative grid h-[calc(100dvh-1.5rem)] max-h-[94dvh] grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] md:h-[min(640px,86dvh)] md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] md:grid-rows-1">
            {/* ---------- lantern ---------- */}
            <div className="relative h-[42svh] min-h-56 overflow-hidden bg-[radial-gradient(ellipse_at_50%_30%,#1a1838,#070b18)] md:h-full">
              <div
                ref={track}
                onScroll={onTrackScroll}
                className="studio-row flex h-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {/* 1 · the krathong, still floating and turning */}
                <button type="button" onClick={() => setBig("lantern")} aria-label={`ดูโคมของ ${data.displayName} แบบหมุนได้`} className="relative h-full w-full shrink-0 snap-center">
                  <LanternPreview visual={data} interactive={false} label={`โคมของ ${data.displayName}`} />
                  {data.effects.length > 0 && (
                    <span className="pointer-events-none absolute inset-x-3 bottom-8 flex flex-wrap justify-center gap-1.5">
                      {data.effects.map((e) => (
                        <span key={e} className="glass rounded-full px-2.5 py-1 text-[11px] text-warm/85">
                          {EFFECT_META[e].emoji} {EFFECT_META[e].nameTh}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
                {/* 2 · the shared postcard */}
                <button type="button" onClick={() => postcardUrl && setBig("postcard")} aria-label="ดูโปสการ์ด" className="relative h-full w-full shrink-0 snap-center">
                  {postcardUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- local blob URL of the rendered postcard
                    <img src={postcardUrl} alt={`โปสการ์ดโคมของ ${data.displayName}`} className="absolute inset-0 h-full w-full object-contain p-3 md:p-5" />
                  ) : (
                    <span className="absolute inset-0 grid place-items-center text-xs text-warm/50">กำลังสร้างโปสการ์ด…</span>
                  )}
                </button>
                {/* 3… · photo cards */}
                {gallery.map((g, i) => (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => setZoom(keepsakes.indexOf(g))}
                    aria-label={`ดู${g.label}`}
                    className="relative grid h-full w-full shrink-0 snap-center place-items-center p-6"
                  >
                    <span className="w-[min(62%,15rem)]">
                      <PolaroidPhoto src={g.src!} alt={`${g.label}จาก ${data.displayName}`} caption={data.displayName} size="sm" rotate={i % 2 ? 2.5 : -2.5} />
                    </span>
                  </button>
                ))}
              </div>
              {/* dots + arrows */}
              <div className="pointer-events-none absolute inset-x-0 bottom-2 flex items-center justify-center gap-1.5">
                {Array.from({ length: 2 + gallery.length }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`ไปการ์ดที่ ${i + 1}`}
                    onClick={() => goSlide(i)}
                    className={cn("pointer-events-auto h-1.5 rounded-full transition-all", i === slide ? "w-5 bg-gold" : "w-1.5 bg-white/40")}
                  />
                ))}
              </div>
              {slide > 0 && (
                <button type="button" aria-label="ก่อนหน้า" onClick={() => goSlide(slide - 1)} className="absolute left-2 top-1/2 hidden size-9 -translate-y-1/2 place-items-center rounded-full bg-night/60 text-warm backdrop-blur md:grid">
                  <ChevronLeft className="size-5" />
                </button>
              )}
              {slide < 1 + gallery.length && (
                <button type="button" aria-label="ถัดไป" onClick={() => goSlide(slide + 1)} className="absolute right-2 top-1/2 hidden size-9 -translate-y-1/2 place-items-center rounded-full bg-night/60 text-warm backdrop-blur md:grid">
                  <ChevronRight className="size-5" />
                </button>
              )}
              <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-night/60 px-2.5 py-1 text-[11px] text-warm/75 backdrop-blur">
                {slide === 0 ? "กระทง · แตะเพื่อหมุนดู" : slide === 1 ? "โปสการ์ด" : "รูปบนกระทง"} · เลื่อนซ้าย-ขวา
              </span>
            </div>

            {/* ---------- details ---------- */}
            <div className="flex min-h-0 flex-col md:border-l md:border-white/5">
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-5 pt-4 sm:px-7 md:pt-7">
                <DialogHeader className="gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {isMine && <Badge>โคมของคุณ</Badge>}
                    {remaining?.live ? (
                      <Badge variant="muted">
                        <Clock className="size-3" /> ลอยอีก {remaining.label}
                      </Badge>
                    ) : (
                      ownerView && <Badge variant="muted">ลอยอยู่ในสายน้ำของคุณ</Badge>
                    )}
                  </div>
                  <DialogTitle className="font-display text-3xl leading-tight text-warm sm:text-4xl">{data.displayName}</DialogTitle>
                  <DialogDescription className="flex items-center gap-1.5 text-sm text-warm/50">
                    <CalendarDays className="size-4" /> ปล่อยโคมเมื่อ {released} น.
                  </DialogDescription>
                </DialogHeader>

                {data.offering > 0 && (
                  <div className="flex items-center gap-3 rounded-2xl border border-gold/40 bg-gradient-to-r from-amber-300/20 via-gold/10 to-transparent p-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[radial-gradient(circle_at_35%_35%,#fff3c4,#f5b942_55%,#b9781c)] font-display text-lg text-[#7a4a0c] shadow-[0_0_20px_-2px_rgba(245,185,66,0.9)]">
                      ฿
                    </span>
                    <div>
                      <p className="text-xs text-warm/60">ใส่เงินลงกระทง</p>
                      <p className="font-display text-2xl leading-none text-gold">฿{data.offering.toLocaleString("th-TH")}</p>
                    </div>
                  </div>
                )}

                {data.wishMessage && (
                  <section className="relative rounded-2xl border border-gold/15 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-4 pl-5">
                    <span className="absolute inset-y-4 left-0 w-1 rounded-full bg-gold/70" />
                    <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-medium tracking-widest text-gold">
                      <Sparkles className="size-3.5" /> คำอธิษฐาน
                    </h3>
                    <p className="whitespace-pre-line break-words font-hand text-xl leading-relaxed text-warm">{data.wishMessage}</p>
                  </section>
                )}
                {data.blessingMessage && (
                  <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-medium tracking-widest text-amber/90">
                      <Heart className="size-3.5" /> คำอวยพร
                    </h3>
                    <p className="whitespace-pre-line break-words text-warm/85">{data.blessingMessage}</p>
                  </section>
                )}
                {data.extraMessage && <p className="whitespace-pre-line break-words text-sm text-warm/60">{data.extraMessage}</p>}

                {!isMine && reporting && (
                  <div className="space-y-3 rounded-2xl border border-red-400/20 bg-red-500/5 p-4">
                    <p className="text-sm text-warm">รายงานเนื้อหาไม่เหมาะสม</p>
                    <div className="flex flex-wrap gap-2">
                      {REASONS.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          aria-pressed={reason === r.id}
                          onClick={() => setReason(r.id)}
                          className={cn("rounded-full border px-3 py-1 text-xs", reason === r.id ? "border-red-300 bg-red-500/15 text-red-100" : "border-white/10 text-warm/60")}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                    <Textarea rows={2} maxLength={300} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="รายละเอียดเพิ่มเติม (ไม่บังคับ)" />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setReporting(false)}>
                        ยกเลิก
                      </Button>
                      <Button size="sm" variant="destructive" onClick={sendReport} disabled={sending}>
                        {sending && <Loader2 className="animate-spin" />} ส่งรายงาน
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* ---------- actions ---------- */}
              {(onShare || !isMine) && (
                <div className="flex items-center gap-3 border-t border-white/5 bg-[#0b1122]/90 px-5 py-3 sm:px-7">
                  {onShare && (
                    <Button className="flex-1 sm:flex-none" variant={isMine ? "default" : "outline"} onClick={() => onShare(data.id)}>
                      <Share2 /> {isMine ? "แชร์โคมของฉัน" : "แชร์โคมดวงนี้"}
                    </Button>
                  )}
                  {!isMine && !reporting && (
                    <button type="button" onClick={() => setReporting(true)} className="ml-auto flex items-center gap-1.5 text-xs text-warm/40 hover:text-red-300">
                      <Flag className="size-3.5" /> รายงาน
                    </button>
                  )}
                </div>
              )}
            </div>

            {big && (
              <div className="absolute inset-0 z-20 bg-[#05080f]/95" role="dialog" aria-label={big === "lantern" ? "กระทงแบบหมุนได้" : "โปสการ์ด"}>
                {big === "lantern" ? (
                  <LanternPreview visual={data} label={`โคมของ ${data.displayName} – ลากเพื่อหมุน`} />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- local blob URL of the rendered postcard
                  postcardUrl && <img src={postcardUrl} alt={`โปสการ์ดโคมของ ${data.displayName}`} className="absolute inset-0 h-full w-full object-contain p-4" />
                )}
                {big === "lantern" && (
                  <span className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-night/60 px-3 py-1 text-xs text-warm/70 backdrop-blur">ลากเพื่อหมุนกระทง</span>
                )}
                <button type="button" aria-label="ปิด" onClick={() => setBig(null)} className="absolute right-3 top-3 grid size-10 place-items-center rounded-full bg-white/10 text-warm hover:bg-white/20">
                  <X className="size-5" />
                </button>
              </div>
            )}
            <KeepsakeViewer visual={data} items={keepsakes} index={zoom !== null && zoom >= 0 ? zoom : null} onIndex={setZoom} contained />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
