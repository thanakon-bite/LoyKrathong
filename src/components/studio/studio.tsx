"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Brush, Eye, Hand, ImageIcon, Palette, Sparkles, Type } from "lucide-react";
import { toast } from "sonner";
import { draftHasContent, draftToVisual, useLanternDraft } from "@/hooks/use-lantern-draft";
import { LANTERN_DESIGNS } from "@/lib/lantern/designs";
import { LanternPreview } from "@/components/lantern/lantern-preview";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DesignPicker } from "./design-picker";
import { TextPanel } from "./text-panel";
import { DrawingPad } from "./drawing-pad";
import { ImagePanel } from "./image-panel";
import { PreviewDialog } from "./preview-dialog";
import { EffectsPicker } from "./effects-picker";
import { useCatalog } from "@/hooks/use-catalog";
import { quote } from "@/lib/pricing";

export function Studio() {
  const router = useRouter();
  const { draft, update, reset } = useLanternDraft();
  const { catalog } = useCatalog();
  const [tab, setTab] = useState("design");
  const [preview, setPreview] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<"displayName" | "content", string>>>({});

  const visual = useMemo(() => (draft ? draftToVisual(draft) : null), [draft]);
  const visualNoDrawing = useMemo(() => (visual ? { ...visual, drawingSrc: null } : null), [visual]);
  const subtotal = useMemo(() => {
    if (!catalog || !draft) return 0;
    try {
      return quote(catalog, { design: draft.design, effects: draft.effects ?? [], offering: 0 }).total;
    } catch {
      return 0;
    }
  }, [catalog, draft]);

  if (!draft || !visual || !visualNoDrawing) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Skeleton className="h-[50dvh] rounded-3xl" />
        <Skeleton className="h-[60dvh] rounded-3xl" />
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

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:gap-10">
      {/* Live preview */}
      <div className="lg:sticky lg:top-24 lg:self-start">
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative h-[34dvh] min-h-60 overflow-hidden sm:h-[42dvh] sm:min-h-72 rounded-3xl border border-gold/15 shadow-[0_0_80px_-30px_rgba(245,185,66,0.6)] lg:h-[62dvh]"
        >
          <LanternPreview visual={visual} label="ตัวอย่างโคมแบบสด อัปเดตทันทีเมื่อแก้ไข" />
          <span className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-night/55 px-3 py-1 text-xs text-warm/70 backdrop-blur">
            <Hand className="size-3.5" /> ลากเพื่อหมุนโคม
          </span>
          <span className="absolute left-3 top-3 rounded-full bg-night/60 px-3 py-1 text-xs text-amber backdrop-blur">
            {LANTERN_DESIGNS[draft.design].nameTh}
          </span>
        </motion.div>
        <div className="mt-4 hidden gap-3 lg:flex">
          <Button size="lg" className="flex-1" onClick={() => validate() && setPreview(true)}>
            <Eye /> Preview Lantern{subtotal > 0 && <span className="opacity-80">· ฿{subtotal.toLocaleString("th-TH")}</span>}
          </Button>
          <Button size="lg" variant="ghost" onClick={() => (confirm("ล้างโคมที่ออกแบบไว้ทั้งหมด?") ? reset() : undefined)}>
            เริ่มใหม่
          </Button>
        </div>
      </div>

      {/* Editor */}
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl sm:p-6">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="design">
              <Palette /> <span className="hidden sm:inline">แบบโคม</span>
            </TabsTrigger>
            <TabsTrigger value="text">
              <Type /> <span className="hidden sm:inline">ข้อความ</span>
            </TabsTrigger>
            <TabsTrigger value="draw">
              <Brush /> <span className="hidden sm:inline">วาดภาพ</span>
            </TabsTrigger>
            <TabsTrigger value="image">
              <ImageIcon /> <span className="hidden sm:inline">รูปภาพ</span>
            </TabsTrigger>
            <TabsTrigger value="effects">
              <Sparkles /> <span className="hidden sm:inline">เอฟเฟกต์</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="design">
            <DesignPicker
              design={draft.design}
              color={draft.color}
              onDesign={(d) => update({ design: d, color: LANTERN_DESIGNS[d].defaultLight, textConfig: { ...draft.textConfig, color: LANTERN_DESIGNS[d].defaultInk } })}
              onColor={(c) => update({ color: c })}
              prices={catalog?.designs ?? null}
            />
          </TabsContent>
          <TabsContent value="text">
            <TextPanel draft={draft} errors={errors} onChange={(p) => update(p)} />
          </TabsContent>
          <TabsContent value="draw" forceMount className="data-[state=inactive]:hidden">
            <DrawingPad visual={visualNoDrawing} value={draft.drawingDataUrl} onChange={(d) => update({ drawingDataUrl: d })} active={tab === "draw"} />
          </TabsContent>
          <TabsContent value="image">
            <ImagePanel
              visual={visual}
              imageDataUrl={draft.imageDataUrl}
              imageConfig={draft.imageConfig}
              allowed
              onImage={(d) => update({ imageDataUrl: d })}
              onConfig={(c) => update({ imageConfig: c })}
            />
          </TabsContent>
          <TabsContent value="effects">
            <EffectsPicker items={catalog?.effects ?? null} value={draft.effects ?? []} onChange={(effects) => update({ effects })} />
          </TabsContent>
        </Tabs>
      </div>

      {/* mobile sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-night/85 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl lg:hidden">
        <Button size="lg" className="w-full" onClick={() => validate() && setPreview(true)}>
          <Eye /> Preview Lantern{subtotal > 0 && <span className="opacity-80">· ฿{subtotal.toLocaleString("th-TH")}</span>}
        </Button>
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
