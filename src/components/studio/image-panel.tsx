"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import { Crop, ImagePlus, Loader2, Move, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import type { ImageConfig, LanternVisual } from "@/types/lantern";
import { buildFaceTextures, ensureLanternFonts, imageRect, loadImage, TEX_H, TEX_W } from "@/lib/lantern/texture";
import { cropAndCompress, prepareImageSource, validateImageFile } from "@/lib/image-client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { clamp, cn } from "@/lib/utils";
import { paintPaper } from "./face-paper";

interface Props {
  visual: LanternVisual;
  imageDataUrl: string | null;
  imageConfig: ImageConfig;
  allowed: boolean;
  onImage: (dataUrl: string | null) => void;
  onConfig: (cfg: ImageConfig) => void;
}

const ASPECTS = [
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "3:4", value: 3 / 4 },
  { label: "16:9", value: 16 / 9 },
];

export function ImagePanel({ visual, imageDataUrl, imageConfig, allowed, onImage, onConfig }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const faceRef = useRef<HTMLCanvasElement>(null);
  const [source, setSourceState] = useState<string | null>(null);
  // picked photos are blob: URLs – free the (possibly 50 MB) file as soon as it is replaced or the editor closes
  const setSource = useCallback((next: string | null) => {
    setSourceState((prev) => {
      if (prev && prev !== next && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return next;
    });
  }, []);
  useEffect(() => () => setSource(null), [setSource]);
  const [loadingFile, setLoadingFile] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [aspect, setAspect] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const drag = useRef<{ startX: number; startY: number; cfg: ImageConfig } | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // render the face with the image in place (drag to reposition)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureLanternFonts([visual.textConfig.font]);
      const [image, drawing] = await Promise.all([
        visual.imageSrc ? loadImage(visual.imageSrc).catch(() => null) : null,
        visual.drawingSrc ? loadImage(visual.drawingSrc).catch(() => null) : null,
      ]);
      imgRef.current = image;
      const tex = buildFaceTextures(visual, { image, drawing });
      const c = faceRef.current;
      if (cancelled || !c) return;
      const ctx = c.getContext("2d")!;
      paintPaper(ctx, visual.design, visual.color);
      ctx.drawImage(tex.front, 0, 0);
      if (image && visual.imageConfig) {
        const r = imageRect(visual.imageConfig, image, TEX_W, TEX_H);
        ctx.setLineDash([10, 8]);
        ctx.strokeStyle = "rgba(245,185,66,0.9)";
        ctx.lineWidth = 3;
        ctx.strokeRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visual]);

  const openFile = useCallback(async (file: File) => {
    const err = validateImageFile(file);
    if (err) {
      toast.error(err);
      return;
    }
    setLoadingFile(true);
    try {
      setSource(await prepareImageSource(file));
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoadingFile(false);
    }
  }, [setSource]);

  const confirmCrop = async () => {
    if (!source || !area) return;
    setBusy(true);
    try {
      const out = await cropAndCompress(source, area);
      onImage(out);
      onConfig({ x: 0, y: visual.textConfig.position === "bottom" ? -0.15 : 0.18, scale: aspect >= 1 ? 0.6 : 0.45 });
      setSource(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!imageDataUrl || !imgRef.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * TEX_W;
    const py = ((e.clientY - r.top) / r.height) * TEX_H;
    const ir = imageRect(imageConfig, imgRef.current, TEX_W, TEX_H);
    if (px < ir.x || px > ir.x + ir.w || py < ir.y || py > ir.y + ir.h) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startY: e.clientY, cfg: imageConfig };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    const dx = (e.clientX - drag.current.startX) / r.width;
    const dy = (e.clientY - drag.current.startY) / r.height;
    onConfig({ ...drag.current.cfg, x: clamp(drag.current.cfg.x + dx, -0.5, 0.5), y: clamp(drag.current.cfg.y + dy, -0.5, 0.5) });
  };

  if (!allowed) {
    return <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-warm/60">แพ็กเกจที่เลือกไม่รองรับการใส่รูปภาพ</p>;
  }

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        className="sr-only"
        aria-label="เลือกรูปภาพ"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void openFile(f);
          e.target.value = "";
        }}
      />

      {!imageDataUrl ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void openFile(f);
          }}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed px-6 py-12 text-center transition",
            dragOver ? "border-gold bg-gold/10" : "border-white/15 hover:border-gold/50 hover:bg-white/[0.03]",
          )}
        >
          <span className="grid size-14 place-items-center rounded-2xl bg-gold/10 text-gold">
            {loadingFile ? <Loader2 className="size-7 animate-spin" /> : <ImagePlus className="size-7" />}
          </span>
          <span className="text-sm text-warm">{loadingFile ? "กำลังเปิดรูป…" : "แตะเพื่อเลือกรูป หรือลากไฟล์มาวาง"}</span>
          <span className="text-xs text-warm/45">JPG, JPEG, PNG, WEBP · ไม่เกิน 50 MB</span>
        </button>
      ) : (
        <>
          <div className="relative mx-auto w-full max-w-sm overflow-hidden rounded-xl border border-gold/30" style={{ aspectRatio: `${TEX_W} / ${TEX_H}` }}>
            <canvas
              ref={faceRef}
              width={TEX_W}
              height={TEX_H}
              aria-label="ด้านหน้าโคม ลากรูปเพื่อปรับตำแหน่ง"
              className="absolute inset-0 h-full w-full cursor-move touch-none"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
            />
          </div>
          <p className="flex items-center justify-center gap-1.5 text-xs text-warm/50">
            <Move className="size-3.5" /> ลากรูปบนโคมเพื่อปรับตำแหน่ง
          </p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>ขนาดรูป</Label>
              <Slider min={0.2} max={1} step={0.01} value={[imageConfig.scale]} onValueChange={([v]) => onConfig({ ...imageConfig, scale: v })} aria-label="ขนาดรูป" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>แนวนอน</Label>
                <Slider min={-0.5} max={0.5} step={0.01} value={[imageConfig.x]} onValueChange={([v]) => onConfig({ ...imageConfig, x: v })} aria-label="ตำแหน่งแนวนอน" />
              </div>
              <div className="space-y-1.5">
                <Label>แนวตั้ง</Label>
                <Slider min={-0.5} max={0.5} step={0.01} value={[imageConfig.y]} onValueChange={([v]) => onConfig({ ...imageConfig, y: v })} aria-label="ตำแหน่งแนวตั้ง" />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="subtle" size="sm" onClick={() => setSource(imageDataUrl)}>
              <Crop /> ครอปใหม่
            </Button>
            <Button type="button" variant="subtle" size="sm" onClick={() => inputRef.current?.click()}>
              <Upload /> เปลี่ยนรูป
            </Button>
            <Button type="button" variant="ghost" size="sm" className="text-red-300 hover:text-red-200" onClick={() => onImage(null)}>
              <Trash2 /> ลบรูป
            </Button>
          </div>
        </>
      )}

      <Dialog open={!!source} onOpenChange={(o) => !o && setSource(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>ครอปรูปภาพ</DialogTitle>
            <DialogDescription>ลากเพื่อจัดตำแหน่ง และซูมเพื่อเลือกส่วนที่ต้องการแสดงบนโคม</DialogDescription>
          </DialogHeader>
          <div className="relative h-72 overflow-hidden rounded-2xl bg-black sm:h-96">
            {source && (
              <Cropper
                image={source}
                crop={crop}
                zoom={zoom}
                aspect={aspect}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, px) => setArea(px)}
              />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {ASPECTS.map((a) => (
              <button
                key={a.label}
                type="button"
                aria-pressed={aspect === a.value}
                onClick={() => setAspect(a.value)}
                className={cn("rounded-full border px-3 py-1 text-xs", aspect === a.value ? "border-gold bg-gold/15 text-warm" : "border-white/10 text-warm/60")}
              >
                {a.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-warm/60">ซูม</span>
            <Slider min={1} max={4} step={0.01} value={[zoom]} onValueChange={([v]) => setZoom(v)} aria-label="ซูม" />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setSource(null)}>
              ยกเลิก
            </Button>
            <Button type="button" onClick={confirmCrop} disabled={busy || !area}>
              {busy ? <Loader2 className="animate-spin" /> : <Crop />} ใช้รูปนี้
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
