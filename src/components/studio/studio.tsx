"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Brush, Check, Eye, Hand, ImageIcon, Palette, Sparkles, Type, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { draftHasContent, draftToVisual, faceDraft, patchFace, useLanternDraft } from "@/hooks/use-lantern-draft";
import { LANTERN_DESIGNS } from "@/lib/lantern/designs";
import { LanternPreview } from "@/components/lantern/lantern-preview";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { facesForShape, type LanternFaceId, type LanternVisual } from "@/types/lantern";
import { cn } from "@/lib/utils";
import { DesignPicker } from "./design-picker";
import { TextPanel } from "./text-panel";
import { DrawingPad } from "./drawing-pad";
import { ImagePanel } from "./image-panel";
import { PreviewDialog } from "./preview-dialog";
import { EffectsPicker } from "./effects-picker";
import { FacePicker } from "./face-picker";
import { useCatalog } from "@/hooks/use-catalog";
import { quote } from "@/lib/pricing";

const TABS = [
  { id: "design", label: "แบบโคม", icon: Palette },
  { id: "text", label: "ข้อความ", icon: Type },
  { id: "draw", label: "วาดภาพ", icon: Brush },
  { id: "image", label: "รูปภาพ", icon: ImageIcon },
  { id: "effects", label: "เอฟเฟกต์", icon: Sparkles },
] as const;

/** preview rotation that turns a wall towards the camera (on top of the preview's own 3/4 view) */
const FACE_YAW: Record<LanternFaceId, number> = { front: 0, right: -Math.PI / 2, back: Math.PI, left: Math.PI / 2 };

const TEXT_FIELD = "input:not([type=color]):not([type=file]):not([type=range]), textarea";

/**
 * Phones: the on-screen keyboard only shrinks the visual viewport, and a fixed full-height layout would
 * leave the focused field under it. While a text field is focused the studio is fitted to the visual
 * viewport instead (preview shrunk, tab bar and CTA hidden).
 */
function useTypingViewport(root: React.RefObject<HTMLElement | null>) {
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    const mq = window.matchMedia("(max-width: 1023px)");
    let raf = 0;
    const check = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = document.activeElement;
        const typing = mq.matches && el instanceof HTMLElement && el.matches(TEXT_FIELD) && !!root.current?.contains(el);
        if (!typing) return setBox(null);
        const next = { top: vv?.offsetTop ?? 0, height: vv?.height ?? window.innerHeight };
        setBox((prev) => (prev && Math.abs(prev.top - next.top) < 1 && Math.abs(prev.height - next.height) < 1 ? prev : next));
        // keep the caret's field in view inside the (now smaller) panel
        setTimeout(() => el.scrollIntoView({ block: "nearest" }), 60);
      });
    };
    vv?.addEventListener("resize", check);
    vv?.addEventListener("scroll", check);
    document.addEventListener("focusin", check);
    document.addEventListener("focusout", check);
    return () => {
      cancelAnimationFrame(raf);
      vv?.removeEventListener("resize", check);
      vv?.removeEventListener("scroll", check);
      document.removeEventListener("focusin", check);
      document.removeEventListener("focusout", check);
    };
  }, [root]);
  return box;
}

/** Live 3D preview that swings smoothly to the wall being edited */
function StudioPreview({ visual, yaw, label }: { visual: LanternVisual; yaw: number; label: string }) {
  const [cur, setCur] = useState(yaw);
  const curRef = useRef(yaw);
  useEffect(() => {
    const from = curRef.current;
    // shortest way round
    const d = ((((yaw - from + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
    if (Math.abs(d) < 1e-3) return;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 650);
      curRef.current = from + d * (1 - (1 - k) ** 3);
      setCur(curRef.current);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [yaw]);
  return <LanternPreview visual={visual} yawOffset={cur} label={label} />;
}

export function Studio() {
  const router = useRouter();
  const { draft, update, reset } = useLanternDraft();
  const { catalog } = useCatalog();
  const [tab, setTab] = useState("design");
  const [preview, setPreview] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<"displayName" | "content", string>>>({});
  const [pickedFace, setFace] = useState<LanternFaceId>("front");
  const rootRef = useRef<HTMLDivElement>(null);
  const typing = useTypingViewport(rootRef);

  // phones: the studio is a full-screen app – the page itself must not scroll (see globals.css)
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("studio-app");
    return () => html.classList.remove("studio-app");
  }, []);

  const visual = useMemo(() => (draft ? draftToVisual(draft) : null), [draft]);
  const subtotal = useMemo(() => {
    if (!catalog || !draft) return 0;
    try {
      return quote(catalog, { design: draft.design, shape: draft.shape, effects: draft.effects ?? [], offering: 0 }).total;
    } catch {
      return 0;
    }
  }, [catalog, draft]);

  const shape = draft?.shape ?? "box";
  const face: LanternFaceId = facesForShape(shape).includes(pickedFace) ? pickedFace : "front";
  const onDrawing = useCallback((d: string | null) => update((cur) => patchFace(cur, face, { drawingDataUrl: d })), [update, face]);
  const onImage = useCallback((d: string | null) => update((cur) => patchFace(cur, face, { imageDataUrl: d })), [update, face]);
  const onImageConfig = useCallback((c: { x: number; y: number; scale: number }) => update((cur) => patchFace(cur, face, { imageConfig: c })), [update, face]);

  if (!draft || !visual) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Skeleton className="h-[50svh] rounded-3xl" />
        <Skeleton className="h-[60svh] rounded-3xl" />
      </div>
    );
  }

  const validate = () => {
    const e: typeof errors = {};
    if (!draft.displayName.trim()) e.displayName = "กรุณากรอกชื่อผู้ปล่อยโคม";
    if (!draftHasContent(draft)) e.content = "กรุณาเขียนคำอธิษฐาน คำอวยพร วาดภาพ หรือใส่รูปอย่างน้อย 1 อย่าง";
    setErrors(e);
    if (Object.keys(e).length) {
      setTab("text");
      toast.error(Object.values(e)[0]);
      return false;
    }
    return true;
  };
  const askReset = () => (confirm("ล้างโคมที่ออกแบบไว้ทั้งหมด?") ? reset() : undefined);

  const art = faceDraft(draft, face);
  const walls = facesForShape(shape);
  const marks = (key: "drawingDataUrl" | "imageDataUrl") => Object.fromEntries(walls.map((f) => [f, Boolean(faceDraft(draft, f)[key])]));
  const editingFace = tab === "draw" || tab === "image";
  const yaw = editingFace ? FACE_YAW[face] : 0;
  const cta = (
    <>
      <Eye /> ดูตัวอย่างโคม{subtotal > 0 && <span className="opacity-80">· ฿{subtotal.toLocaleString("th-TH")}</span>}
    </>
  );

  return (
    <div
      ref={rootRef}
      className={cn(
        // phones / tablets: a fixed full-screen app under the site header (svh – dvh changes while the
        // browser bars move and made the canvas flicker). Desktop: the two-column page as before.
        "fixed inset-x-0 top-16 z-30 flex h-[calc(100svh-4rem)] flex-col bg-[radial-gradient(ellipse_at_top,#14204a_0%,#070c1d_45%,#050913_100%)]",
        "has-[[data-draw-full]]:z-[60] lg:static lg:z-auto lg:grid lg:h-auto lg:grid-cols-[1.1fr_1fr] lg:gap-10 lg:bg-none",
        typing && "z-50",
      )}
      style={typing ? { top: typing.top, height: typing.height } : undefined}
    >
      {/* Live preview */}
      <div className={cn("shrink-0 px-3 pt-2 lg:sticky lg:top-24 lg:self-start lg:px-0 lg:pt-0", typing && typing.height < 360 && "hidden")}>
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className={cn(
            "relative overflow-hidden rounded-3xl border border-gold/15 shadow-[0_0_80px_-30px_rgba(245,185,66,0.6)] lg:h-[62svh]",
            typing ? "h-[24svh]" : editingFace ? "h-[19svh] min-h-28" : "h-[23svh] min-h-32",
          )}
        >
          <StudioPreview visual={visual} yaw={yaw} label="ตัวอย่างโคมแบบสด อัปเดตทันทีเมื่อแก้ไข" />
          <span className="pointer-events-none absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-night/55 px-3 py-1 text-[11px] text-warm/70 backdrop-blur lg:bottom-3 lg:text-xs">
            <Hand className="size-3.5" /> ลากเพื่อหมุนโคม
          </span>
          <span className="absolute left-2 top-2 rounded-full bg-night/60 px-3 py-1 text-xs text-amber backdrop-blur lg:left-3 lg:top-3">{LANTERN_DESIGNS[draft.design].nameTh}</span>
          {typing && (
            <Button
              size="sm"
              className="absolute right-2 top-2 h-8 px-3"
              onClick={() => (document.activeElement as HTMLElement | null)?.blur()}
              aria-label="พิมพ์เสร็จแล้ว ซ่อนแป้นพิมพ์"
            >
              <Check /> เสร็จ
            </Button>
          )}
        </motion.div>
        <div className="mt-4 hidden gap-3 lg:flex">
          <Button size="lg" className="flex-1" onClick={() => validate() && setPreview(true)}>
            {cta}
          </Button>
          <Button size="lg" variant="ghost" onClick={askReset}>
            เริ่มใหม่
          </Button>
        </div>
      </div>

      {/* Editor */}
      {/* backdrop-filter would trap the full-screen drawing pad (position: fixed) inside this box – drop it while drawing full screen */}
      <div className="flex min-h-0 flex-1 flex-col lg:block lg:rounded-3xl lg:border lg:border-white/10 lg:bg-white/[0.03] lg:p-6 lg:backdrop-blur-xl lg:has-[[data-draw-full]]:backdrop-blur-none">
        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col lg:block">
          <div className={cn("shrink-0 px-3 pt-2 lg:px-0 lg:pt-0", typing && "hidden")}>
            <TabsList>
              {TABS.map(({ id, label, icon: Icon }) => (
                <TabsTrigger key={id} value={id} aria-label={label} className="flex-col gap-0.5 px-1 py-1.5 text-[10px] leading-none sm:flex-row sm:gap-1.5 sm:px-3 sm:py-2 sm:text-sm">
                  <Icon /> <span>{label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {/* the panel takes exactly the height that is left on phones (it only scrolls inside, e.g. with the keyboard open) */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-2 pt-3 lg:overflow-visible lg:p-0">
            <TabsContent value="design" className="mt-0 lg:mt-4">
              <DesignPicker
                design={draft.design}
                shape={shape}
                color={draft.color}
                onDesign={(d) => update({ design: d, color: LANTERN_DESIGNS[d].defaultLight, textConfig: { ...draft.textConfig, color: LANTERN_DESIGNS[d].defaultInk } })}
                onShape={(s) => update({ shape: s })}
                onColor={(c) => update({ color: c })}
                prices={catalog?.designs ?? null}
                shapePrices={catalog?.shapes ?? null}
              />
            </TabsContent>
            <TabsContent value="text" className="mt-0 lg:mt-4">
              <TextPanel draft={draft} errors={errors} onChange={(p) => update(p)} />
            </TabsContent>
            <TabsContent value="draw" forceMount className="mt-0 h-full data-[state=inactive]:hidden lg:mt-4 lg:h-auto">
              <DrawingPad
                key={face}
                visual={visual}
                face={face}
                value={art.drawingDataUrl}
                onChange={onDrawing}
                active={tab === "draw"}
                header={<FacePicker shape={shape} value={face} onChange={setFace} marks={marks("drawingDataUrl")} />}
              />
            </TabsContent>
            <TabsContent value="image" className="mt-0 h-full lg:mt-4 lg:h-auto">
              <ImagePanel
                key={face}
                visual={visual}
                face={face}
                imageDataUrl={art.imageDataUrl}
                imageConfig={art.imageConfig}
                allowed
                onImage={onImage}
                onConfig={onImageConfig}
                header={<FacePicker shape={shape} value={face} onChange={setFace} marks={marks("imageDataUrl")} />}
              />
            </TabsContent>
            <TabsContent value="effects" className="mt-0 lg:mt-4">
              <EffectsPicker items={catalog?.effects ?? null} value={draft.effects ?? []} onChange={(effects) => update({ effects })} />
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* phones: action bar – lifted above Netlify's fixed badge (--nf-badge) */}
      <div className={cn("shrink-0 border-t border-white/10 bg-night/85 px-3 pt-2 pb-[calc(max(0.5rem,env(safe-area-inset-bottom))+var(--nf-badge))] backdrop-blur-xl lg:hidden", typing && "hidden")}>
        <div className="flex gap-2">
          <Button size="lg" variant="ghost" className="shrink-0 px-3" aria-label="เริ่มออกแบบใหม่" onClick={askReset}>
            <RotateCcw />
          </Button>
          <Button size="lg" className="flex-1" onClick={() => validate() && setPreview(true)}>
            {cta}
          </Button>
        </div>
      </div>

      <PreviewDialog
        open={preview}
        visual={visual}
        onClose={() => setPreview(false)}
        onConfirm={() => {
          setPreview(false);
          router.push("/checkout");
        }}
      />
    </div>
  );
}
