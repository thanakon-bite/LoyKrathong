"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, Clock, Download, ImageUp, Loader2, ShieldCheck, Smartphone, XCircle } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, ClientApiError } from "@/lib/api-client";
import { BANK_APPS, detectPlatform, openBankApp, type MobilePlatform } from "@/lib/bank-apps";
import { prepareSlipFile, scanSlip } from "@/lib/slip-client";
import { cn, formatTHB } from "@/lib/utils";
import { useLanternDraft } from "@/hooks/use-lantern-draft";
import type { PromptPayOrder, SlipResult } from "@/types/payment";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { renderPromptPayQr, saveQrImage } from "./promptpay-qr";

type Phase =
  | { kind: "idle" }
  | { kind: "busy"; label: string }
  | { kind: "success"; lanternId: string | null }
  | { kind: "error"; message: string; tone: "error" | "wait" };

const subscribeNoop = () => () => undefined;
function usePlatform(): MobilePlatform {
  return useSyncExternalStore(
    subscribeNoop,
    () => detectPlatform(navigator.userAgent, navigator.maxTouchPoints),
    () => "desktop" as const,
  );
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [active]);
  return now;
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function PromptPayPayment() {
  const id = useSearchParams().get("id");
  const router = useRouter();
  const { reset } = useLanternDraft();
  const platform = usePlatform();
  const [order, setOrder] = useState<PromptPayOrder | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [showBanks, setShowBanks] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const now = useNow(!!order && order.paymentStatus !== "paid");

  const released = useCallback(
    (lanternId: string | null) => {
      setPhase({ kind: "success", lanternId });
      reset();
      window.setTimeout(() => router.push(lanternId ? `/festival?released=${lanternId}` : "/my-lanterns"), 1200);
    },
    [reset, router],
  );

  useEffect(() => {
    if (!id) return;
    let stop = false;
    apiFetch<{ order: PromptPayOrder }>(`/api/payments/${encodeURIComponent(id)}`)
      .then(({ order }) => {
        if (stop) return;
        setOrder(order);
        if (order.paymentStatus === "paid") released(order.lanternId);
      })
      .catch((e: Error) => !stop && setLoadError(e.message));
    return () => {
      stop = true;
    };
  }, [id, released]);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const amountLabel = order ? formatTHB(order.amount) : "";
  const qr = useMemo(() => {
    if (!order || typeof document === "undefined") return null;
    try {
      return renderPromptPayQr(order.qrPayload, { amountLabel, receiver: order.receiverName });
    } catch {
      return null;
    }
  }, [order, amountLabel]);

  if (!id || loadError) {
    return (
      <Card className="mx-auto max-w-lg py-12 text-center">
        <XCircle className="mx-auto mb-4 size-12 text-warm/40" />
        <h1 className="font-display text-2xl text-warm">ไม่พบรายการชำระเงิน</h1>
        {loadError && <p className="mt-2 text-sm text-warm/60">{loadError}</p>}
        <Button asChild className="mt-6">
          <Link href="/checkout">กลับไปหน้าปล่อยโคม</Link>
        </Button>
      </Card>
    );
  }
  if (!order) return <Skeleton className="mx-auto h-[75svh] max-w-md rounded-3xl" />;

  const remaining = Date.parse(order.expiresAt) - now;
  const expired = remaining <= 0;
  const closed = ["failed", "refunded"].includes(order.paymentStatus);
  const busy = phase.kind === "busy" || phase.kind === "success";

  const onSave = async () => {
    if (!qr) return;
    const r = await saveQrImage(qr.card, `promptpay-${order.amount}-thb.png`);
    if (r === "downloaded") toast.success("บันทึก QR แล้ว เปิดแอปธนาคาร แล้วเลือกสแกนจากรูปภาพ");
  };

  const onFile = async (file: File | undefined) => {
    if (!file || busy) return;
    setPreview(URL.createObjectURL(file));
    try {
      setPhase({ kind: "busy", label: "กำลังอ่าน QR บนสลิป…" });
      const scan = await scanSlip(file);
      if (scan.kind === "payment_qr") {
        setPhase({ kind: "error", tone: "error", message: "ภาพนี้คือ QR สำหรับจ่ายเงิน ไม่ใช่สลิป — กรุณาโอนเงินก่อน แล้วแนบ “สลิป” ที่แอปธนาคารสร้างให้" });
        return;
      }
      let blob: Blob;
      try {
        blob = await prepareSlipFile(file);
      } catch {
        setPhase({ kind: "error", tone: "error", message: "ไฟล์ใหญ่เกินไปหรือเปิดไม่ได้ กรุณาแนบภาพสลิป (JPG/PNG) ขนาดไม่เกิน 4 MB" });
        return;
      }
      setPhase({ kind: "busy", label: "กำลังตรวจสอบสลิปกับธนาคาร…" });
      const form = new FormData();
      form.append("file", blob, blob.type === "image/png" ? "slip.png" : "slip.jpg");
      if (scan.kind === "slip") form.append("payload", scan.qr.payload);
      const res = await apiFetch<SlipResult>(`/api/payments/${order.paymentId}/slip`, { method: "POST", body: form });
      toast.success("ยืนยันการชำระเงินสำเร็จ! กำลังปล่อยโคม…");
      released(res.lanternId);
    } catch (e) {
      const err = e as ClientApiError;
      const wait = err.code === "slip_pending" || err.code === "provider_unavailable" || err.code === "rate_limited";
      setPhase({ kind: "error", tone: wait ? "wait" : "error", message: err.message || "ตรวจสอบสลิปไม่สำเร็จ กรุณาลองใหม่" });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (phase.kind === "success") {
    return (
      <Card className="mx-auto max-w-md py-12 text-center">
        <CheckCircle2 className="mx-auto mb-4 size-14 text-emerald-300" />
        <h1 className="font-display text-2xl text-warm">ชำระเงินสำเร็จ</h1>
        <p className="mt-2 text-warm/60">โคมของคุณกำลังลอยลงสายน้ำ กำลังพาไปชม…</p>
        <Button asChild className="mt-6">
          <Link href={phase.lanternId ? `/festival?released=${phase.lanternId}` : "/my-lanterns"}>ไปชมโคมของฉัน</Link>
        </Button>
      </Card>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-3">
      {/* amount + countdown */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs text-warm/55">ยอดที่ต้องโอน</p>
          <p className="font-display text-3xl leading-tight text-gold">{amountLabel}</p>
        </div>
        <span
          className={cn(
            "flex items-center gap-1 rounded-full border px-3 py-1 text-xs tabular-nums",
            expired ? "border-red-400/40 text-red-200" : remaining < 5 * 60_000 ? "border-amber/50 text-amber" : "border-white/15 text-warm/70",
          )}
          aria-live="off"
        >
          <Clock className="size-3.5" /> {expired ? "QR หมดเวลา" : `เหลือ ${mmss(remaining)}`}
        </span>
      </div>

      {/* QR */}
      <div className="relative mx-auto w-full max-w-[min(68vw,300px)] overflow-hidden rounded-2xl bg-white p-2 shadow-[0_0_40px_-10px_rgba(245,185,66,0.6)] sm:max-w-[300px]">
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL; long-press saves it on phones
          <img src={qr.qr} alt={`QR พร้อมเพย์ ยอด ${amountLabel}`} className={cn("block aspect-square w-full [image-rendering:pixelated]", expired && "opacity-25 blur-[2px]")} />
        ) : (
          <div className="flex aspect-square items-center justify-center text-sm text-night/60">สร้าง QR ไม่ได้</div>
        )}
        {expired && (
          <p className="absolute inset-x-3 top-1/2 -translate-y-1/2 rounded-xl bg-night/85 p-3 text-center text-xs text-warm">
            QR หมดเวลาแล้ว — ถ้าโอนไปแล้ว แนบสลิปด้านล่างได้เลย ถ้ายังไม่โอน กรุณาเริ่มรายการใหม่
          </p>
        )}
      </div>
      <p className="text-center text-[11px] text-warm/50">
        พร้อมเพย์{order.receiverName ? ` · ${order.receiverName}` : ""} · ยอดถูกใส่ไว้ใน QR แล้ว
      </p>

      {/* save + bank app */}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" disabled={!qr || expired} onClick={onSave}>
          <Download /> บันทึก QR
        </Button>
        {platform === "desktop" ? (
          <p className="flex items-center justify-center gap-1.5 rounded-full border border-white/10 px-3 text-center text-[11px] leading-tight text-warm/60">
            <Smartphone className="size-4 shrink-0" /> สแกน QR ด้วยแอปธนาคารบนมือถือ
          </p>
        ) : (
          <Button variant="outline" disabled={expired} aria-expanded={showBanks} onClick={() => setShowBanks((v) => !v)}>
            <Smartphone /> เปิดแอปธนาคาร
          </Button>
        )}
      </div>
      {platform !== "desktop" && <p className="text-center text-[11px] text-warm/55">บันทึก QR → เปิดแอปธนาคาร → สแกน → เลือกรูปจากอัลบั้ม → กลับมาแนบสลิป</p>}
      {showBanks && platform !== "desktop" && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <div className="grid grid-cols-4 gap-2">
            {BANK_APPS.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => openBankApp(b, platform)}
                aria-label={`เปิดแอป ${b.name}`}
                className="flex flex-col items-center gap-1 rounded-xl p-1.5 text-center text-[10px] leading-tight text-warm/80 hover:bg-white/5"
              >
                <span className="flex size-9 items-center justify-center rounded-xl text-[11px] font-bold text-white" style={{ background: b.color }}>
                  {b.name.slice(0, 2).toUpperCase()}
                </span>
                <span>
                  เปิดแอป
                  <br />
                  {b.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* status */}
      {phase.kind === "busy" && (
        <p role="status" className="flex items-center gap-2 rounded-2xl border border-gold/30 bg-gold/10 p-3 text-sm text-warm">
          <Loader2 className="size-4 shrink-0 animate-spin text-gold" /> {phase.label}
        </p>
      )}
      {phase.kind === "error" && (
        <p
          role="alert"
          className={cn(
            "flex items-start gap-2 rounded-2xl border p-3 text-sm",
            phase.tone === "wait" ? "border-amber/40 bg-amber/10 text-amber" : "border-red-400/30 bg-red-500/10 text-red-200",
          )}
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" /> {phase.message}
        </p>
      )}
      {closed && <p className="rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">รายการนี้ปิดไปแล้ว</p>}

      {/* slip */}
      <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} onChange={(e) => void onFile(e.target.files?.[0])} />
      <div className="sticky bottom-[calc(0.75rem+var(--nf-badge))] z-20 flex flex-col gap-1 md:static">
        <Button size="lg" className="h-14 w-full text-base shadow-[0_8px_30px_-6px_rgba(0,0,0,0.8)] md:shadow-none" disabled={busy || closed} onClick={() => fileRef.current?.click()}>
          {phase.kind === "busy" ? <Loader2 className="animate-spin" /> : <ImageUp />}
          {phase.kind === "busy" ? phase.label : phase.kind === "error" ? "แนบสลิปใหม่" : "โอนแล้ว? แนบสลิป"}
        </Button>
      </div>
      {preview && phase.kind !== "idle" && (
        // eslint-disable-next-line @next/next/no-img-element -- local blob preview
        <img src={preview} alt="สลิปที่แนบ" className="mx-auto max-h-28 rounded-lg border border-white/10 object-contain" />
      )}
      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-warm/45">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" /> ระบบตรวจสลิปกับธนาคารอัตโนมัติ โคมลอยทันทีที่ยืนยันยอด · สลิปหนึ่งใบใช้ได้ครั้งเดียว · เก็บสลิปไว้ให้ผู้ดูแลตรวจสอบเท่านั้น
      </p>
      <p className="text-center text-xs">
        <Link href={`/payment/cancel?payment_id=${order.paymentId}`} className="text-warm/50 underline">
          ยกเลิกรายการ / กลับไปแก้ไขโคม
        </Link>
      </p>
    </div>
  );
}
