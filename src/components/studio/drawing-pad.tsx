"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Brush, Check, Eraser, Maximize2, Pencil, Redo2, Trash2, Undo2 } from "lucide-react";
import type { LanternVisual } from "@/types/lantern";
import { buildFaceTextures, ensureLanternFonts, loadImage, TEX_H, TEX_W } from "@/lib/lantern/texture";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { paintPaper } from "./face-paper";

const PEN_COLORS = ["#5b2d0c", "#b4232c", "#e0457b", "#f08c00", "#1b6e3c", "#1b3f8a", "#6b2fa0", "#000000", "#ffffff"];
const MAX_HISTORY = 30;

interface Props {
  /** Lantern content shown underneath (text + image), without the drawing itself */
  visual: LanternVisual;
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  /** false while the tab is hidden – skips re-rendering the background on every keystroke */
  active?: boolean;
}

/**
 * Freehand drawing directly on the front face of the lantern.
 * Supports mouse, touch and pen (pressure), with undo / redo / clear.
 */
export function DrawingPad({ visual, value, onChange, active = true }: Props) {
  const baseRef = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [color, setColor] = useState(PEN_COLORS[1]);
  const [size, setSize] = useState(8);
  const undoStack = useRef<ImageData[]>([]);
  const redoStack = useRef<ImageData[]>([]);
  const [history, setHistory] = useState({ undo: 0, redo: 0 });
  const syncHistory = () => setHistory({ undo: undoStack.current.length, redo: redoStack.current.length });
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number; mx: number; my: number } | null>(null);
  const hasInk = useRef(Boolean(value));
  /** full-screen drawing mode – on phones the canvas only takes touches here, so the page can still scroll */
  const [full, setFull] = useState(false);
  useEffect(() => {
    if (!full) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [full]);
  const initialValue = useRef(value);

  // base layer: paper + text + image (WYSIWYG with the lantern)
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      await ensureLanternFonts([visual.textConfig.font]);
      const image = visual.imageSrc ? await loadImage(visual.imageSrc).catch(() => null) : null;
      const tex = buildFaceTextures({ ...visual, drawingSrc: null }, { image });
      const c = baseRef.current;
      if (cancelled || !c) return;
      const ctx = c.getContext("2d")!;
      paintPaper(ctx, visual.design, visual.color);
      ctx.drawImage(tex.front, 0, 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [visual, active]);

  const ctx = () => drawRef.current!.getContext("2d", { willReadFrequently: true })!;
  const snapshot = () => ctx().getImageData(0, 0, TEX_W, TEX_H);

  // load existing drawing once
  useEffect(() => {
    const c = drawRef.current;
    if (!c) return;
    const g = c.getContext("2d", { willReadFrequently: true })!;
    g.clearRect(0, 0, TEX_W, TEX_H);
    if (initialValue.current) {
      loadImage(initialValue.current)
        .then((img) => {
          g.drawImage(img, 0, 0, TEX_W, TEX_H);
          undoStack.current = [g.getImageData(0, 0, TEX_W, TEX_H)];
          setHistory({ undo: 1, redo: 0 });
        })
        .catch(() => undefined);
    } else {
      undoStack.current = [g.getImageData(0, 0, TEX_W, TEX_H)];
    }
  }, []);

  const emit = useCallback(() => {
    onChange(hasInk.current ? drawRef.current!.toDataURL("image/png") : null);
  }, [onChange]);

  const pos = (e: React.PointerEvent | PointerEvent) => {
    const r = drawRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * TEX_W, y: ((e.clientY - r.top) / r.height) * TEX_H };
  };

  const strokeTo = (x: number, y: number, pressure: number) => {
    const g = ctx();
    const p = last.current!;
    const mx = (p.x + x) / 2;
    const my = (p.y + y) / 2;
    g.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
    g.strokeStyle = color;
    g.lineCap = "round";
    g.lineJoin = "round";
    // pressure only matters for a stylus; mouse/touch draw at the chosen size
    g.lineWidth = tool === "eraser" ? size * 2.5 : size * (pressure >= 0 ? 0.45 + pressure * 1.1 : 1);
    g.beginPath();
    g.moveTo(p.mx, p.my);
    g.quadraticCurveTo(p.x, p.y, mx, my);
    g.stroke();
    last.current = { x, y, mx, my };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const { x, y } = pos(e);
    last.current = { x, y, mx: x, my: y };
    // dot for a single tap
    const g = ctx();
    g.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
    g.fillStyle = color;
    g.beginPath();
    g.arc(x, y, (tool === "eraser" ? size * 2.5 : size) / 2, 0, Math.PI * 2);
    g.fill();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const { x, y } = pos(ev);
      strokeTo(x, y, ev.pointerType === "pen" ? ev.pressure : -1);
    }
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    if (tool === "pen") hasInk.current = true;
    undoStack.current.push(snapshot());
    if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
    redoStack.current = [];
    syncHistory();
    emit();
  };

  const undo = () => {
    if (undoStack.current.length <= 1) return;
    redoStack.current.push(undoStack.current.pop()!);
    ctx().putImageData(undoStack.current[undoStack.current.length - 1], 0, 0);
    hasInk.current = undoStack.current.length > 1 || Boolean(initialValue.current);
    syncHistory();
    emit();
  };

  const redo = () => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(next);
    ctx().putImageData(next, 0, 0);
    hasInk.current = true;
    syncHistory();
    emit();
  };

  const clear = () => {
    const g = ctx();
    g.clearRect(0, 0, TEX_W, TEX_H);
    undoStack.current.push(snapshot());
    redoStack.current = [];
    hasInk.current = false;
    initialValue.current = null;
    syncHistory();
    emit();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    }
  };

  return (
    <div
      data-draw-full={full || undefined}
      className={cn(full ? "fixed inset-0 z-[60] flex flex-col gap-3 overflow-y-auto bg-night/95 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur" : "space-y-4")}
      onKeyDown={onKeyDown}
    >
      {full && (
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-warm">วาดบนโคม</p>
          <Button type="button" size="sm" onClick={() => setFull(false)}>
            <Check /> เสร็จ
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-full border border-white/10 bg-white/5 p-1" role="radiogroup" aria-label="เครื่องมือ">
          <button
            type="button"
            role="radio"
            aria-checked={tool === "pen"}
            onClick={() => setTool("pen")}
            className={cn("flex h-9 items-center gap-1.5 rounded-full px-3 text-xs", tool === "pen" ? "bg-gold text-night" : "text-warm/70")}
          >
            <Brush className="size-4" /> ปากกา
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={tool === "eraser"}
            onClick={() => setTool("eraser")}
            className={cn("flex h-9 items-center gap-1.5 rounded-full px-3 text-xs", tool === "eraser" ? "bg-gold text-night" : "text-warm/70")}
          >
            <Eraser className="size-4" /> ยางลบ
          </button>
        </div>
        <div className="ml-auto flex gap-1">
          <Button type="button" variant="subtle" size="icon" onClick={undo} disabled={history.undo <= 1} aria-label="ย้อนกลับ (Undo)">
            <Undo2 />
          </Button>
          <Button type="button" variant="subtle" size="icon" onClick={redo} disabled={!history.redo} aria-label="ทำซ้ำ (Redo)">
            <Redo2 />
          </Button>
          <Button type="button" variant="subtle" size="icon" onClick={clear} aria-label="ล้างภาพวาดทั้งหมด">
            <Trash2 />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PEN_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`สีปากกา ${c}`}
            aria-pressed={color === c && tool === "pen"}
            onClick={() => {
              setColor(c);
              setTool("pen");
            }}
            className={cn("size-9 rounded-full border-2 transition", color === c && tool === "pen" ? "scale-110 border-gold" : "border-white/20")}
            style={{ background: c }}
          />
        ))}
        <label className="relative grid size-9 cursor-pointer place-items-center rounded-full border-2 border-dashed border-white/30 text-xs text-warm/60">
          +
          <input
            type="color"
            aria-label="เลือกสีปากกา"
            value={color}
            onChange={(e) => {
              setColor(e.target.value);
              setTool("pen");
            }}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs text-warm/60">ขนาด</span>
        <Slider className="max-w-48" min={2} max={28} step={1} value={[size]} onValueChange={([v]) => setSize(v)} aria-label="ขนาดแปรง" />
        <span className="grid size-8 place-items-center">
          <span className="rounded-full bg-warm" style={{ width: Math.max(3, size * 0.8), height: Math.max(3, size * 0.8) }} />
        </span>
      </div>

      <div
        className={cn(
          "relative mx-auto w-full overflow-hidden rounded-xl border border-gold/30 shadow-[0_0_40px_-10px_rgba(245,185,66,0.6)]",
          full ? "max-w-[min(100%,calc((100dvh-15rem)*0.909))]" : "max-w-sm",
        )}
        style={{ aspectRatio: `${TEX_W} / ${TEX_H}` }}
      >
        <canvas ref={baseRef} width={TEX_W} height={TEX_H} className="absolute inset-0 h-full w-full" aria-hidden />
        <canvas
          ref={drawRef}
          width={TEX_W}
          height={TEX_H}
          tabIndex={0}
          aria-label="พื้นที่วาดภาพบนด้านหน้าโคม"
          className={cn(
            "absolute inset-0 h-full w-full outline-none",
            tool === "eraser" ? "cursor-cell" : "cursor-crosshair",
            // phones: draw only in full-screen mode so a finger on the canvas can still scroll the page
            full ? "touch-none" : "pointer-events-none sm:pointer-events-auto sm:touch-none",
          )}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={end}
        />
        {!full && (
          <>
            {/* phones: tap to open the full-screen pad */}
            <button
              type="button"
              onClick={() => setFull(true)}
              className="absolute inset-0 grid place-items-center bg-night/25 sm:hidden"
              aria-label="แตะเพื่อเริ่มวาดแบบเต็มจอ"
            >
              <span className="flex items-center gap-1.5 rounded-full bg-gold px-4 py-2 text-sm font-medium text-night shadow-lg">
                <Pencil className="size-4" /> แตะเพื่อวาด
              </span>
            </button>
            <button
              type="button"
              onClick={() => setFull(true)}
              aria-label="ขยายเต็มจอ"
              className="absolute right-2 top-2 hidden size-8 place-items-center rounded-full bg-night/60 text-warm/80 backdrop-blur hover:text-warm sm:grid"
            >
              <Maximize2 className="size-4" />
            </button>
          </>
        )}
      </div>
      {full ? (
        <Button type="button" className="mx-auto w-full max-w-sm" onClick={() => setFull(false)}>
          <Check /> เสร็จ กลับไปหน้าออกแบบ
        </Button>
      ) : (
        <p className="hidden text-center text-xs text-warm/45 sm:block">วาดหัวใจ ดอกไม้ ดวงดาว หรือเขียนด้วยลายมือของคุณได้เลย · Ctrl+Z เพื่อย้อนกลับ</p>
      )}
    </div>
  );
}
