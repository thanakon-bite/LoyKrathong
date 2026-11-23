"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, Coins, Loader2, QrCode, Send, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { draftHasContent, draftToVisual, useLanternDraft, type AssetUploads, type LanternDraft } from "@/hooks/use-lantern-draft";
import { useAuth } from "@/components/providers/auth-provider";
import { apiFetch, ClientApiError } from "@/lib/api-client";
import { dataUrlToBlob } from "@/lib/image-client";
import { uploadLanternAsset } from "@/lib/upload-client";
import { LANTERN_SHAPES, LANTERN_DESIGNS } from "@/lib/lantern/designs";
import { formatTHB, hashString } from "@/lib/utils";
import { useCatalog } from "@/hooks/use-catalog";
import { PricingError, quote, totalProblem } from "@/lib/pricing";
import { EFFECT_META } from "@/lib/lantern/effects-meta";
import type { Quote } from "@/types/catalog";
import { EXTRA_FACE_IDS, facesForShape, type ExtraFaceId, type PublicLantern } from "@/types/lantern";
import { LanternPreview } from "@/components/lantern/lantern-preview";
import { OfferingPicker } from "@/components/studio/offering-picker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type Step = "idle" | "session" | "uploading" | "releasing" | "redirecting";

const STEP_LABEL: Record<Step, string> = {
  idle: "",
  session: "กำลังเตรียมเซสชัน…",
  uploading: "กำลังอัปโหลดภาพบนโคม…",
  releasing: "กำลังปล่อยโคม…",
  redirecting: "กำลังสร้าง QR พร้อมเพย์…",
};

async function uploadAsset(kind: "image" | "drawing", dataUrl: string) {
  return uploadLanternAsset(kind, await dataUrlToBlob(dataUrl));
}

/**
 * Upload every wall's image/drawing once; reuse the stored path when retrying with the same content.
 * Returns the asset part of the lantern payload: front paths + `faces` (right / back / left).
 */
async function ensureUploads(draft: LanternDraft, update: (p: Partial<LanternDraft>) => void) {
  // one cache entry per asset pair (front at the top level, other walls under uploads.faces)
  const put = async (cache: AssetUploads, imageDataUrl: string | null, drawingDataUrl: string | null) => {
    const next = { ...cache };
    if (imageDataUrl) {
      const key = String(hashString(imageDataUrl));
      if (next.imageKey !== key || !next.imagePath) {
        next.imagePath = (await uploadAsset("image", imageDataUrl)).path;
        next.imageKey = key;
      }
    }
    if (drawingDataUrl) {
      const key = String(hashString(drawingDataUrl));
      if (next.drawingKey !== key || !next.drawingPath) {
        next.drawingPath = (await uploadAsset("drawing", drawingDataUrl)).path;
        next.drawingKey = key;
      }
    }
    return next;
  };
  const { faces: faceCache = {}, ...frontCache } = draft.uploads ?? {};
  const front = await put(frontCache, draft.imageDataUrl, draft.drawingDataUrl);
  const uploads: LanternDraft["uploads"] = { ...front, faces: { ...faceCache } };
  const faces: Partial<Record<ExtraFaceId, { imagePath: string | null; imageConfig: LanternDraft["imageConfig"] | null; drawingPath: string | null }>> = {};
  const walls = facesForShape(draft.shape);
  for (const face of EXTRA_FACE_IDS) {
    const art = draft.faces?.[face];
    if (!art || !walls.includes(face) || !(art.imageDataUrl || art.drawingDataUrl)) continue;
    const cached = await put(faceCache[face] ?? {}, art.imageDataUrl, art.drawingDataUrl);
    uploads.faces![face] = cached;
    // save progress after each wall so a failed upload never re-sends the walls already stored
    update({ uploads: { ...uploads, faces: { ...uploads.faces } } });
    faces[face] = {
      imagePath: art.imageDataUrl ? cached.imagePath! : null,
      imageConfig: art.imageDataUrl ? art.imageConfig : null,
      drawingPath: art.drawingDataUrl ? cached.drawingPath! : null,
    };
  }
  update({ uploads });
  return {
    imagePath: draft.imageDataUrl ? front.imagePath! : null,
    drawingPath: draft.drawingDataUrl ? front.drawingPath! : null,
    faces,
  };
}

export function CheckoutView() {
  const router = useRouter();
  const { draft, update, reset, renewRequestId } = useLanternDraft();
  const { ensureSession, configured } = useAuth();
  const { catalog } = useCatalog();
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);

  const visual = useMemo(() => (draft ? draftToVisual(draft) : null), [draft]);
  const priced = useMemo((): { quote: Quote | null; problem: string | null } => {
    if (!catalog || !draft) return { quote: null, problem: null };
    try {
      const q = quote(catalog, { design: draft.design, shape: draft.shape, effects: draft.effects ?? [], offering: draft.offering ?? 0 });
      return { quote: q, problem: totalProblem(q.total, catalog.minPaidTotal) };
    } catch (e) {
      return { quote: null, problem: e instanceof PricingError ? e.message : "คำนวณราคาไม่ได้" };
    }
  }, [catalog, draft]);

  if (!draft || !visual) return <Skeleton className="h-[70svh] rounded-3xl" />;

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

  const q = priced.quote;
  const total = q?.total ?? 0;
  const offering = draft.offering ?? 0;
  const o = catalog?.offering;
  const setOffering = (v: number) => {
    setError(null);
    update({ offering: Math.max(0, Math.round(v * 100) / 100) });
  };

  const submit = async () => {
    if (!q || priced.problem) return;
    setError(null);
    try {
      setStep("session");
      await ensureSession();
      setStep("uploading");
      const { imagePath, drawingPath, faces } = await ensureUploads(draft, update);
      const payload = {
        requestId: draft.requestId,
        effects: draft.effects ?? [],
        offering,
        lantern: {
          design: draft.design,
          shape: draft.shape ?? "box",
          color: draft.color,
          displayName: draft.displayName,
          wishMessage: draft.wishMessage,
          blessingMessage: draft.blessingMessage,
          extraMessage: draft.extraMessage,
          textConfig: draft.textConfig,
          imageConfig: imagePath ? draft.imageConfig : null,
          imagePath,
          drawingPath,
          faces,
        },
      };
      if (q.total <= 0) {
        setStep("releasing");
        const { lantern } = await apiFetch<{ lantern: PublicLantern | null }>("/api/lanterns", { method: "POST", json: payload });
        reset();
        toast.success("ปล่อยโคมสำเร็จ! โคมของคุณกำลังลอยออกไปบนสายน้ำ");
        router.push(lantern ? `/festival?released=${lantern.id}` : "/festival");
      } else {
        setStep("redirecting");
        // PromptPay QR + slip: the amount comes from the server-side quote, never from this page
        const { paymentId } = await apiFetch<{ paymentId: string }>("/api/checkout", { method: "POST", json: payload });
        router.push(`/payment/promptpay?id=${paymentId}`);
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
  const effects = draft.effects ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr] lg:gap-10">
      <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="relative h-[26svh] min-h-48 overflow-hidden rounded-3xl border border-gold/15 sm:h-[38svh] sm:min-h-64">
          <LanternPreview visual={visual} label="โคมที่จะปล่อย" />
          <Link href="/create" className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-night/60 px-3 py-1 text-xs text-amber backdrop-blur lg:hidden">
            <ArrowLeft className="size-3.5" /> แก้ไข
          </Link>
        </div>
        <Card className="hidden space-y-1 text-sm lg:block">
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
        {/* ---- offering ---- */}
        {o?.enabled !== false && (
          <section className="rounded-3xl border border-gold/20 bg-gradient-to-b from-gold/10 to-transparent p-4 sm:p-5">
            <h2 className="flex items-center gap-2 font-display text-lg text-warm sm:text-xl">
              <Coins className="size-5 text-gold" /> ใส่เงินลงกระทง <span className="text-xs font-normal text-warm/50">(ไม่บังคับ)</span>
            </h2>
            <p className="mt-1 text-xs text-warm/55">ยอดเงินจะแสดงเด่นบนหัวโคมของคุณในเทศกาล</p>
            <OfferingPicker settings={o} value={offering} onChange={setOffering} disabled={busy} className="mt-3" />
          </section>
        )}

        {/* ---- bill ---- */}
        <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
          <h2 className="mb-3 font-display text-lg text-warm sm:text-xl">สรุปรายการ</h2>
          {!catalog ? (
            <Skeleton className="h-24" />
          ) : (
            <ul className="space-y-2 text-sm">
              <li className="flex justify-between gap-3 text-warm/80">
                <span>โคมอธิษฐาน · {LANTERN_DESIGNS[draft.design].nameTh}</span>
                <span>{q?.lines.find((l) => l.kind === "design") ? formatTHB(q.lines.find((l) => l.kind === "design")!.amount) : "ฟรี"}</span>
              </li>
              {(draft.shape ?? "box") !== "box" && (
                <li className="flex justify-between gap-3 text-warm/80">
                  <span>ทรง{LANTERN_SHAPES[draft.shape].nameTh}</span>
                  <span>{q?.lines.find((l) => l.kind === "shape") ? formatTHB(q.lines.find((l) => l.kind === "shape")!.amount) : "ฟรี"}</span>
                </li>
              )}
              {q?.lines
                .filter((l) => l.kind === "effect")
                .map((l) => (
                  <li key={l.code} className="flex items-center justify-between gap-3 text-warm/80">
                    <span className="flex items-center gap-1.5">
                      <span aria-hidden>{EFFECT_META[l.code as keyof typeof EFFECT_META]?.emoji}</span> {l.name}
                    </span>
                    <span className="flex items-center gap-2">
                      {formatTHB(l.amount)}
                      <button
                        type="button"
                        aria-label={`เอา ${l.name} ออก`}
                        disabled={busy}
                        className="rounded-full p-0.5 text-warm/40 hover:bg-white/10 hover:text-warm"
                        onClick={() => update({ effects: effects.filter((e) => e !== l.code) })}
                      >
                        <X className="size-3.5" />
                      </button>
                    </span>
                  </li>
                ))}
              {offering > 0 && (
                <li className="flex justify-between gap-3 text-gold">
                  <span className="flex items-center gap-1.5">
                    <Coins className="size-4" /> ใส่เงินลงกระทง
                  </span>
                  <span>{formatTHB(offering)}</span>
                </li>
              )}
              {effects.length === 0 && (
                <li>
                  <Link href="/create" className="text-xs text-amber underline">
                    + เพิ่มเอฟเฟกต์ (พลุ หัวใจ ดาว …)
                  </Link>
                </li>
              )}
              <li className="flex items-baseline justify-between border-t border-white/10 pt-3">
                <span className="text-warm">รวม</span>
                <span className="font-display text-2xl text-gold">{total > 0 ? formatTHB(total) : "ฟรี"}</span>
              </li>
            </ul>
          )}
        </section>

        {total > 0 && (
          <p className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs text-warm/65">
            <QrCode className="size-5 shrink-0 text-gold" /> สแกน QR พร้อมเพย์ด้วยแอปธนาคารใดก็ได้ แล้วแนบสลิป ระบบตรวจกับธนาคารและปล่อยโคมให้ทันที
          </p>
        )}

        {(priced.problem || error) && (
          <p role="alert" className="flex items-start gap-2 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
            <AlertCircle className="mt-0.5 size-4 shrink-0" /> {priced.problem ?? error}
          </p>
        )}

        {/* phones: stick above Netlify's "Powered by" badge instead of sliding under it */}
        <Button
          size="lg"
          className="sticky bottom-[calc(0.75rem+var(--nf-badge))] z-20 w-full shadow-[0_8px_30px_-6px_rgba(0,0,0,0.8)] md:static md:shadow-none"
          disabled={!q || !!priced.problem || busy || !configured}
          onClick={submit}
        >
          {busy ? <Loader2 className="animate-spin" /> : total > 0 ? <QrCode /> : <Send />}
          {busy ? STEP_LABEL[step] : total > 0 ? `สแกน QR จ่าย ${formatTHB(total)}` : "ปล่อยโคมเลย (ฟรี)"}
        </Button>
        {!configured && <p className="text-center text-xs text-amber">ระบบยังไม่ได้เชื่อมต่อฐานข้อมูล (ตั้งค่า Supabase ตาม README)</p>}
        <p className="text-center text-[11px] text-warm/40 sm:text-xs">
          ดำเนินการต่อ = ยอมรับ{" "}
          <Link href="/terms" className="underline">
            ข้อกำหนดการใช้งาน
          </Link>{" "}
          และ{" "}
          <Link href="/privacy" className="underline">
            นโยบายความเป็นส่วนตัว
          </Link>
          {offering > 0 && " · เงินที่ใส่ลงกระทงไม่สามารถขอคืนได้"}
        </p>
      </div>
    </div>
  );
}
