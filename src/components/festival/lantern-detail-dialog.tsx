"use client";

import { useEffect, useState } from "react";
import { Clock, Flag, Loader2 } from "lucide-react";
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
  if (ms <= 0) return "กำลังจางหาย";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${String(s).padStart(2, "0")} นาที`;
}

interface Props {
  lantern: PublicLantern | null;
  serverOffset: number;
  onClose: () => void;
  onGone: (id: string) => void;
}

export function LanternDetailDialog({ lantern, serverOffset, onClose, onGone }: Props) {
  const { user, ensureSession } = useAuth();
  const [fresh, setFresh] = useState<PublicLantern | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number]["id"]>("inappropriate");
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);
  const data = fresh?.id === lantern?.id ? fresh : lantern;
  const remaining = useCountdown(data?.expiresAt, serverOffset);
  const isMine = !!user && data?.ownerId === user.id;

  // re-validate with the server (expired lanterns cannot be opened) and refresh signed URLs
  useEffect(() => {
    if (!lantern) return;
    let active = true;
    apiFetch<{ lantern: PublicLantern }>(`/api/lanterns/${lantern.id}`)
      .then((r) => active && setFresh(r.lantern))
      .catch((e) => {
        if (!active) return;
        if (e.status === 404) {
          toast.info("โคมนี้ลอยหายไปกับสายน้ำแล้ว");
          onGone(lantern.id);
        }
      });
    return () => {
      active = false;
      setReporting(false);
    };
  }, [lantern, onGone]);

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

  return (
    <Dialog open={!!lantern} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl p-0 sm:p-0">
        {data && (
          <div className="grid md:grid-cols-[1fr_1.1fr]">
            <div className="relative h-72 overflow-hidden rounded-t-3xl md:h-auto md:min-h-[460px] md:rounded-l-3xl md:rounded-tr-none">
              <LanternPreview visual={data} label={`โคมของ ${data.displayName}`} />
            </div>
            <div className="space-y-5 p-5 sm:p-7">
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2">
                  {isMine && <Badge>โคมของคุณ</Badge>}
                  {remaining && (
                    <Badge variant="muted">
                      <Clock className="size-3" /> ลอยอีก {remaining}
                    </Badge>
                  )}
                </div>
                <DialogTitle className="pt-1 text-2xl">{data.displayName}</DialogTitle>
                <DialogDescription>ปล่อยโคมเมื่อ {new Date(data.releasedAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.</DialogDescription>
              </DialogHeader>

              {data.wishMessage && (
                <section>
                  <h3 className="mb-1 text-xs tracking-widest text-gold">คำอธิษฐาน</h3>
                  <p className="whitespace-pre-line font-hand text-lg leading-relaxed text-warm">{data.wishMessage}</p>
                </section>
              )}
              {data.blessingMessage && (
                <section>
                  <h3 className="mb-1 text-xs tracking-widest text-gold">คำอวยพร</h3>
                  <p className="whitespace-pre-line text-warm/85">{data.blessingMessage}</p>
                </section>
              )}
              {data.extraMessage && <p className="text-sm text-warm/60">{data.extraMessage}</p>}

              {(data.drawingSrc || data.imageSrc) && (
                <div className="grid grid-cols-2 gap-3">
                  {data.drawingSrc && (
                    <figure className="overflow-hidden rounded-2xl border border-white/10 bg-[#f6e7c6]">
                      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                      <img src={data.drawingSrc} alt={`ภาพวาดของ ${data.displayName}`} loading="lazy" className="aspect-[512/563] w-full object-contain" />
                      <figcaption className="bg-night/80 px-2 py-1 text-center text-xs text-warm/60">ภาพวาด</figcaption>
                    </figure>
                  )}
                  {data.imageSrc && (
                    <figure className="overflow-hidden rounded-2xl border border-white/10 bg-black/40">
                      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                      <img src={data.imageSrc} alt={`รูปภาพจาก ${data.displayName}`} loading="lazy" className="aspect-square w-full object-cover" />
                      <figcaption className="bg-night/80 px-2 py-1 text-center text-xs text-warm/60">รูปภาพ</figcaption>
                    </figure>
                  )}
                </div>
              )}

              {!isMine && (
                <div className="border-t border-white/5 pt-4">
                  {!reporting ? (
                    <button type="button" onClick={() => setReporting(true)} className="flex items-center gap-1.5 text-xs text-warm/45 hover:text-red-300">
                      <Flag className="size-3.5" /> รายงานโคมนี้
                    </button>
                  ) : (
                    <div className="space-y-3">
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
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
