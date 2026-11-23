"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import { Crop, ImagePlus, Loader2, Minus, Move, Plus, Shapes, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { FACE_LABEL_TH, PHOTO_FRAME_LABEL_TH, PHOTO_FRAMES, type ImageConfig, type LanternFaceId, type LanternVisual } from "@/types/lantern";
import { buildFaceLayer, ensureLanternFonts, imageRect, insideFrame, loadImage, peekImage, TEX_H, TEX_W } from "@/lib/lantern/texture";
import { cropAndCompress, prepareImageSource, validateImageFile } from "@/lib/image-client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { clamp, cn } from "@/lib/utils";
import { paintPaper } from "./face-paper";
import { SilhouetteMask } from "./shape-mask";

interface Props {
  /** the whole lantern as it is now (draft visual) */
  visual: LanternVisual;
  /** wall the photo goes on */
  face: LanternFaceId;
  imageDataUrl: string | null;
  imageConfig: ImageConfig;
  allowed: boolean;
  onImage: (dataUrl: string | null) => void;
  onConfig: (cfg: ImageConfig) => void;
  /** shown above the editor (the wall picker) */
  header?: React.ReactNode;
}

const ASPECTS = [
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "3:4", value: 3 / 4 },
  { label: "16:9", value: 16 / 9 },
];

type Pt = { x: number; y: number };

const fit = (c: ImageConfig): ImageConfig => ({
  x: clamp(c.x, -0.5, 0.5),
  y: clamp(c.y, -0.5, 0.5),
  scale: clamp(c.scale, 0.2, 1),
  ...(c.frame && c.frame !== "rounded" ? { frame: c.frame } : {}),
});
const nextFrame = (c: ImageConfig): ImageConfig => {
  const i = PHOTO_FRAMES.indexOf(c.frame ?? "rounded");
  return fit({ ...c, frame: PHOTO_FRAMES[(i + 1) % PHOTO_FRAMES.length] });
};
/** a tap (not a drag / pinch) cycles the photo frame */
const TAP_SLOP = 8;
const TAP_MS = 400;

export function ImagePanel({ visual, face, imageDataUrl, imageConfig, allowed, onImage, onConfig, header }: Props) {
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
  const imgRef = useRef<HTMLImageElement | null>(null);

  // the wall as it will look, photo in place – rendered synchronously when the images are decoded
  // (keeps a pinch smooth), otherwise once they have loaded
  const drawingSrc = face === "front" ? visual.drawingSrc : (visual.faces?.[face]?.drawingSrc ?? null);
  useEffect(() => {
    let cancelled = false;
    const paint = (image: HTMLImageElement | null, drawing: HTMLImageElement | null) => {
      imgRef.current = image;
      const c = faceRef.current;
      if (cancelled || !c) return;
      const v: LanternVisual =
        face === "front"
          ? { ...visual, imageSrc: imageDataUrl, imageConfig }
          : { ...visual, faces: { ...visual.faces, [face]: { imageSrc: imageDataUrl, imageConfig, drawingSrc } } };
      const layer = buildFaceLayer(v, face, { image, drawing });
      const ctx = c.getContext("2d")!;
      paintPaper(ctx, visual.design, visual.color);
      ctx.drawImage(layer, 0, 0);
      if (image) {
        const r = imageRect(imageConfig, image, TEX_W, TEX_H);
        ctx.setLineDash([10, 8]);
        ctx.strokeStyle = "rgba(245,185,66,0.9)";
        ctx.lineWidth = 3;
        ctx.strokeRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8);
      }
    };
    const image = imageDataUrl ? peekImage(imageDataUrl) : null;
    const drawing = drawingSrc ? peekImage(drawingSrc) : null;
    if ((!imageDataUrl || image) && (!drawingSrc || drawing)) {
      paint(image, drawing);
    } else {
      void (async () => {
        await ensureLanternFonts([visual.textConfig.font]);
        const [im, dr] = await Promise.all([
          imageDataUrl ? loadImage(imageDataUrl).catch(() => null) : null,
          drawingSrc ? loadImage(drawingSrc).catch(() => null) : null,
        ]);
        paint(im, dr);
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [visual, face, imageDataUrl, imageConfig, drawingSrc]);

  const openFile = useCallback(
    async (file: File) => {
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
    },
    [setSource],
  );

  const confirmCrop = async () => {
    if (!source || !area) return;
    setBusy(true);
    try {
      const out = await cropAndCompress(source, area);
      onImage(out);
      // keep clear of the wish text on the front; centred on the other walls
      const y = face !== "front" ? 0 : visual.textConfig.position === "bottom" ? -0.15 : 0.18;
      onConfig(fit({ x: 0, y, scale: aspect >= 1 ? 0.6 : 0.45, frame: imageConfig.frame }));
      setSource(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // ---------- gestures: one finger / mouse drags the photo, two fingers pinch (resize) and move it ----------
  const pointers = useRef(new Map<number, Pt>());
  const gesture = useRef<{ start: Pt; dist: number; cfg: ImageConfig } | null>(null);
  /** the current touch is still a clean tap: one finger, barely moved, short */
  const tap = useRef<{ x: number; y: number; t: number; ok: boolean } | null>(null);
  const cfgRef = useRef(imageConfig);
  useEffect(() => {
    cfgRef.current = imageConfig;
  });
  const centre = () => {
    const pts = [...pointers.current.values()];
    const x = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const [a, b] = pts;
    return { x, y, dist: a && b ? Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) : 0 };
  };
  /** (re)start the gesture from the current fingers – called whenever one lands or lifts, so nothing jumps */
  const restart = () => {
    if (!pointers.current.size) {
      gesture.current = null;
      return;
    }
    const c = centre();
    gesture.current = { start: { x: c.x, y: c.y }, dist: c.dist, cfg: cfgRef.current };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!imageDataUrl || !imgRef.current) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    tap.current = pointers.current.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now(), ok: true } : null;
    restart();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const t = tap.current;
    if (t && Math.hypot(e.clientX - t.x, e.clientY - t.y) > TAP_SLOP) t.ok = false;
    // a tap must not nudge the photo – only start moving once it is clearly a drag
    if (t?.ok && pointers.current.size === 1) return;
    const r = e.currentTarget.getBoundingClientRect();
    const g = gesture.current;
    const c = centre();
    const scale = g.dist && c.dist ? g.cfg.scale * (c.dist / g.dist) : g.cfg.scale;
    const next = fit({ ...g.cfg, x: g.cfg.x + (c.x - g.start.x) / r.width, y: g.cfg.y + (c.y - g.start.y) / r.height, scale });
    cfgRef.current = next;
    onConfig(next);
  };

  const endPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.delete(e.pointerId)) return;
    const t = tap.current;
    tap.current = null;
    if (e.type === "pointerup" && t?.ok && pointers.current.size === 0 && performance.now() - t.t < TAP_MS && imgRef.current) {
      // only a tap ON the photo changes its frame
      const box = e.currentTarget.getBoundingClientRect();
      const u = ((e.clientX - box.left) / box.width) * TEX_W;
      const v = ((e.clientY - box.top) / box.height) * TEX_H;
      const cfg = cfgRef.current;
      const r = imageRect(cfg, imgRef.current, TEX_W, TEX_H);
      if (u >= r.x && u <= r.x + r.w && v >= r.y && v <= r.y + r.h && insideFrame(cfg, r, u, v)) {
        const next = nextFrame(cfg);
        cfgRef.current = next;
        onConfig(next);
      }
    }
    restart();
  };

  // trackpad pinch / ctrl + wheel resizes the photo on desktop
  useEffect(() => {
    const c = faceRef.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const cfg = cfgRef.current;
      const next = fit({ ...cfg, scale: cfg.scale * Math.exp(-e.deltaY * 0.01) });
      cfgRef.current = next;
      onConfig(next);
    };
    // iOS Safari: its own pinch gesture events must not zoom the page while resizing the photo
    const stop = (e: Event) => e.preventDefault();
    c.addEventListener("wheel", onWheel, { passive: false });
    c.addEventListener("gesturestart", stop);
    c.addEventListener("gesturechange", stop);
    return () => {
      c.removeEventListener("wheel", onWheel);
      c.removeEventListener("gesturestart", stop);
      c.removeEventListener("gesturechange", stop);
    };
  }, [onConfig, imageDataUrl]);

  const nudgeScale = (f: number) => onConfig(fit({ ...imageConfig, scale: imageConfig.scale * f }));

  if (!allowed) {
    return <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-warm/60">แพ็กเกจที่เลือกไม่รองรับการใส่รูปภาพ</p>;
  }

  return (
    <div className="flex h-full flex-col gap-2 lg:h-auto lg:gap-3">
      {header}
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
            "flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed px-6 py-6 text-center transition lg:flex-none lg:py-12",
            dragOver ? "border-gold bg-gold/10" : "border-white/15 hover:border-gold/50 hover:bg-white/[0.03]",
          )}
        >
          <span className="grid size-14 place-items-center rounded-2xl bg-gold/10 text-gold">
            {loadingFile ? <Loader2 className="size-7 animate-spin" /> : <ImagePlus className="size-7" />}
          </span>
          <span className="text-sm text-warm">{loadingFile ? "กำลังเปิดรูป…" : `แตะเพื่อเลือกรูปสำหรับ${FACE_LABEL_TH[face]}`}</span>
          <span className="text-xs text-warm/45">JPG, JPEG, PNG, WEBP · ไม่เกิน 50 MB</span>
        </button>
      ) : (
        <>
          <div className="min-h-0 flex-1 [container-type:size] lg:flex-none lg:[container-type:normal]">
            <div
              className="relative mx-auto w-[min(100cqw,calc(100cqh*0.909))] overflow-hidden rounded-xl border border-gold/30 lg:w-full lg:max-w-sm"
              style={{ aspectRatio: `${TEX_W} / ${TEX_H}` }}
            >
              <canvas
                ref={faceRef}
                width={TEX_W}
                height={TEX_H}
                aria-label={`${FACE_LABEL_TH[face]}ของโคม ลากเพื่อย้ายรูป ถ่างหรือหุบสองนิ้วเพื่อย่อขยาย`}
                className="absolute inset-0 h-full w-full cursor-move touch-none select-none"
                style={{ WebkitTouchCallout: "none" }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endPointer}
                onPointerCancel={endPointer}
                onContextMenu={(e) => e.preventDefault()}
              />
              <SilhouetteMask shape={visual.shape} />
              <button
                type="button"
                onClick={() => onConfig(nextFrame(imageConfig))}
                aria-label={`กรอบรูป: ${PHOTO_FRAME_LABEL_TH[imageConfig.frame ?? "rounded"]} แตะเพื่อเปลี่ยนกรอบ`}
                className="absolute left-2 top-2 flex items-center gap-1 rounded-full border border-gold/40 bg-night/70 px-2.5 py-1 text-[11px] text-warm backdrop-blur"
              >
                <Shapes className="size-3.5 text-gold" /> กรอบ: {PHOTO_FRAME_LABEL_TH[imageConfig.frame ?? "rounded"]}
              </button>
              <span className="pointer-events-none absolute inset-x-2 bottom-2 flex items-center justify-center gap-1.5 rounded-full bg-night/60 px-2 py-1 text-[11px] text-warm/80 backdrop-blur">
                <Move className="size-3.5 shrink-0" /> แตะรูปเพื่อเปลี่ยนกรอบ · ลาก/สองนิ้วเพื่อจัดรูป
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button type="button" variant="subtle" size="sm" className="px-2.5" onClick={() => setSource(imageDataUrl)}>
              <Crop /> ครอป
            </Button>
            <Button type="button" variant="subtle" size="sm" className="px-2.5" onClick={() => inputRef.current?.click()}>
              <Upload /> เปลี่ยน
            </Button>
            <Button type="button" variant="ghost" size="sm" className="px-2.5 text-red-300 hover:text-red-200" onClick={() => onImage(null)}>
              <Trash2 /> ลบ
            </Button>
            <div className="ml-auto flex items-center rounded-full border border-white/10 bg-white/5">
              <button type="button" aria-label="ย่อรูป" onClick={() => nudgeScale(1 / 1.1)} className="grid size-8 place-items-center text-warm/80 hover:text-warm">
                <Minus className="size-4" />
              </button>
              <span className="w-9 text-center text-[11px] tabular-nums text-warm/60">{Math.round(imageConfig.scale * 100)}%</span>
              <button type="button" aria-label="ขยายรูป" onClick={() => nudgeScale(1.1)} className="grid size-8 place-items-center text-warm/80 hover:text-warm">
                <Plus className="size-4" />
              </button>
            </div>
          </div>
        </>
      )}

      <Dialog open={!!source} onOpenChange={(o) => !o && setSource(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>ครอปรูปภาพ</DialogTitle>
            <DialogDescription>ลากเพื่อจัดตำแหน่ง และซูมเพื่อเลือกส่วนที่ต้องการแสดงบน{FACE_LABEL_TH[face]}ของโคม</DialogDescription>
          </DialogHeader>
          <div className="relative h-72 overflow-hidden rounded-2xl bg-black sm:h-96">
            {source && (
              <Cropper image={source} crop={crop} zoom={zoom} aspect={aspect} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_, px) => setArea(px)} />
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
