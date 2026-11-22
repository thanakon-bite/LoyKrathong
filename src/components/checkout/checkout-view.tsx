"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, Check, CreditCard, Crown, Loader2, QrCode, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { draftHasContent, draftToVisual, useLanternDraft, type LanternDraft } from "@/hooks/use-lantern-draft";
import { useAuth } from "@/components/providers/auth-provider";
import { apiFetch, ClientApiError } from "@/lib/api-client";
import { dataUrlToBlob } from "@/lib/image-client";
import { LANTERN_DESIGNS } from "@/lib/lantern/designs";
import { cn, formatTHB, hashString } from "@/lib/utils";
import type { FestivalPackage } from "@/types/payment";
import type { PublicLantern } from "@/types/lantern";
import { LanternPreview } from "@/components/lantern/lantern-preview";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type Step = "idle" | "session" | "uploading" | "releasing" | "redirecting";

const STEP_LABEL: Record<Step, string> = {
  idle: "",
  session: "กำลังเตรียมเซสชัน…",
  uploading: "กำลังอัปโหลดภาพบนโคม…",
  releasing: "กำลังปล่อยโคม…",
  redirecting: "กำลังไปยังหน้าชำระเงิน…",
};

async function uploadAsset(kind: "image" | "drawing", dataUrl: string) {
  const blob = await dataUrlToBlob(dataUrl);
  const form = new FormData();
  form.append("kind", kind);
  form.append("file", blob, `${kind}.${blob.type.includes("png") ? "png" : "webp"}`);
  return apiFetch<{ path: string }>("/api/uploads", { method: "POST", body: form });
}

/** Upload image/drawing once; reuse the stored path when retrying with the same content */
async function ensureUploads(draft: LanternDraft, update: (p: Partial<LanternDraft>) => void) {
  const uploads = { ...draft.uploads };
  if (draft.imageDataUrl) {
    const key = String(hashString(draft.imageDataUrl));
    if (uploads.imageKey !== key || !uploads.imagePath) {
      uploads.imagePath = (await uploadAsset("image", draft.imageDataUrl)).path;
      uploads.imageKey = key;
    }
  }
  if (draft.drawingDataUrl) {
    const key = String(hashString(draft.drawingDataUrl));
    if (uploads.drawingKey !== key || !uploads.drawingPath) {
      uploads.drawingPath = (await uploadAsset("drawing", draft.drawingDataUrl)).path;
      uploads.drawingKey = key;
    }
  }
  update({ uploads });
  return {
    imagePath: draft.imageDataUrl ? uploads.imagePath! : null,
    drawingPath: draft.drawingDataUrl ? uploads.drawingPath! : null,
  };
}

export function CheckoutView() {
  const router = useRouter();
  const { draft, update, reset, renewRequestId } = useLanternDraft();
  const { ensureSession, configured } = useAuth();
  const [packages, setPackages] = useState<FestivalPackage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ packages: FestivalPackage[] }>("/api/packages")
      .then(({ packages }) => setPackages(packages))
      .catch((e: Error) => setLoadError(e.message));
  }, []);

  const allowedSlugs = useMemo(() => new Set((packages ?? []).filter((p) => draft && p.features.designs.includes(draft.design)).map((p) => p.slug)), [packages, draft]);
  const chosen = packages?.find((p) => p.slug === (selected ?? "")) ?? packages?.find((p) => allowedSlugs.has(p.slug)) ?? null;
  const visual = useMemo(() => (draft ? draftToVisual(draft, chosen?.features.decoration ?? null) : null), [draft, chosen]);

  if (!draft || !visual) return <Skeleton className="h-[70dvh] rounded-3xl" />;

  if (!draft.displayName.trim() || !draftHasContent(draft)) {
    return (
      <Card className="mx-auto max-w-lg py-12 text-center">
        <Sparkles className="mx-auto mb-4 size-10 text-gold" />
        <h2 className="font-display text-2xl text-warm">ยังไม่มีโคมที่ออกแบบไว้</h2>
        <p className="mt-2 text-warm/60">เริ่มสร้างโคมอธิษฐานของคุณก่อน แล้วกลับมาที่หน้านี้เพื่อปล่อยโคม</p>
        <Button asChild className="mt-6">
          <Link href="/create">ไปสร้างโคม</Link>
        </Button>
      </Card>
    );
  }

  const submit = async () => {
    if (!chosen) return;
    setError(null);
    try {
      setStep("session");
      await ensureSession();
      setStep("uploading");
      const { imagePath, drawingPath } = await ensureUploads(draft, update);
      const payload = {
        packageSlug: chosen.slug,
        requestId: draft.requestId,
        lantern: {
          design: draft.design,
          color: draft.color,
          displayName: draft.displayName,
          wishMessage: draft.wishMessage,
          blessingMessage: draft.blessingMessage,
          extraMessage: draft.extraMessage,
          textConfig: draft.textConfig,
          imageConfig: imagePath ? draft.imageConfig : null,
          imagePath,
          drawingPath,
        },
      };
      if (chosen.price <= 0) {
        setStep("releasing");
        const { lantern } = await apiFetch<{ lantern: PublicLantern | null }>("/api/lanterns", { method: "POST", json: payload });
        reset();
        toast.success("ปล่อยโคมสำเร็จ! โคมของคุณกำลังลอยออกไปบนสายน้ำ");
        router.push(lantern ? `/festival?released=${lantern.id}` : "/festival");
      } else {
        setStep("redirecting");
        const { url } = await apiFetch<{ url: string }>("/api/checkout", { method: "POST", json: payload });
        window.location.assign(url);
      }
    } catch (e) {
      const err = e as ClientApiError;
      if (err.code === "already_processed" || err.code === "session_closed") renewRequestId();
      if (err.code === "asset_missing") update({ uploads: {} });
      setError(err.message);
      toast.error(err.message);
      setStep("idle");
    }
  };

  const busy = step !== "idle";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr] lg:gap-10">
      <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="relative h-[38dvh] min-h-64 overflow-hidden rounded-3xl border border-gold/15">
          <LanternPreview visual={visual} label="โคมที่จะปล่อย" />
        </div>
        <Card className="space-y-1 text-sm">
          <p className="text-warm/50">ผู้ปล่อยโคม</p>
          <p className="text-warm">{draft.displayName}</p>
          <p className="pt-2 text-warm/50">แบบโคม</p>
          <p className="text-warm">{LANTERN_DESIGNS[draft.design].nameTh}</p>
          {draft.wishMessage && (
            <>
              <p className="pt-2 text-warm/50">คำอธิษฐาน</p>
              <p className="line-clamp-3 whitespace-pre-line text-warm">{draft.wishMessage}</p>
            </>
          )}
          <Button asChild variant="link" className="h-auto px-0 pt-3">
            <Link href="/create">
              <ArrowLeft /> กลับไปแก้ไขโคม
            </Link>
          </Button>
        </Card>
      </div>

      <div className="space-y-5">
        <h2 className="font-display text-2xl text-warm">เลือกแพ็กเกจ</h2>
        {loadError && (
          <Card className="flex items-start gap-3 border-red-400/30 text-sm text-red-200">
            <AlertCircle className="mt-0.5 size-5 shrink-0" />
            <div>
              <p>{loadError}</p>
              <Button variant="link" className="h-auto px-0" onClick={() => location.reload()}>
                ลองใหม่
              </Button>
            </div>
          </Card>
        )}
        {!packages && !loadError && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
        )}
        {packages && packages.length === 0 && <Card className="text-warm/60">ยังไม่มีแพ็กเกจที่เปิดให้บริการในขณะนี้</Card>}
        <div className="space-y-3" role="radiogroup" aria-label="แพ็กเกจ">
          {packages?.map((p) => {
            const allowed = allowedSlugs.has(p.slug);
            const active = chosen?.slug === p.slug;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={!allowed || busy}
                onClick={() => setSelected(p.slug)}
                className={cn(
                  "relative w-full rounded-3xl border p-5 text-left transition disabled:cursor-not-allowed",
                  active ? "border-gold bg-gold/10 shadow-[0_0_40px_-16px_rgba(245,185,66,0.9)]" : "border-white/10 bg-white/[0.03] hover:border-gold/40",
                  !allowed && "opacity-45",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 font-display text-lg text-warm">
                      {p.price > 0 && <Crown className="size-4 text-gold" />} {p.name}
                    </p>
                    <p className="mt-1 text-sm text-warm/60">{p.description}</p>
                  </div>
                  <p className="shrink-0 font-display text-2xl text-gold">{p.price > 0 ? formatTHB(p.price, p.currency) : "ฟรี"}</p>
                </div>
                {p.features.highlights.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-warm/70">
                    {p.features.highlights.map((h) => (
                      <li key={h} className="flex items-center gap-1">
                        <Check className="size-3.5 text-gold" /> {h}
                      </li>
                    ))}
                  </ul>
                )}
                {!allowed && <p className="mt-2 text-xs text-amber">แบบโคมที่เลือกไม่รวมอยู่ในแพ็กเกจนี้</p>}
              </button>
            );
          })}
        </div>

        {chosen && chosen.price > 0 && (
          <p className="flex flex-wrap items-center gap-3 text-xs text-warm/55">
            <span className="flex items-center gap-1">
              <CreditCard className="size-4" /> บัตรเครดิต / เดบิต
            </span>
            <span className="flex items-center gap-1">
              <QrCode className="size-4" /> PromptPay QR (เมื่อเปิดใช้งาน)
            </span>
            <span>ชำระอย่างปลอดภัยผ่าน Stripe · สกุลเงิน THB</span>
          </p>
        )}

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
            <AlertCircle className="mt-0.5 size-4 shrink-0" /> {error}
          </p>
        )}

        <Button size="lg" className="w-full" disabled={!chosen || busy || !configured} onClick={submit}>
          {busy ? <Loader2 className="animate-spin" /> : chosen && chosen.price > 0 ? <CreditCard /> : <Send />}
          {busy ? STEP_LABEL[step] : chosen && chosen.price > 0 ? `ชำระเงิน ${formatTHB(chosen.price, chosen.currency)}` : "ปล่อยโคมเลย"}
        </Button>
        {!configured && <p className="text-center text-xs text-amber">ระบบยังไม่ได้เชื่อมต่อฐานข้อมูล (ตั้งค่า Supabase ตาม README)</p>}
        <p className="text-center text-xs text-warm/40">
          เมื่อดำเนินการต่อ ถือว่าคุณยอมรับ{" "}
          <Link href="/terms" className="underline">
            ข้อกำหนดการใช้งาน
          </Link>{" "}
          และ{" "}
          <Link href="/privacy" className="underline">
            นโยบายความเป็นส่วนตัว
          </Link>
        </p>
      </div>
    </div>
  );
}
