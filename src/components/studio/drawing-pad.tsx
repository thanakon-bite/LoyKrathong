"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Brush, Check, Eraser, Maximize2, Minimize2, Redo2, Trash2, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { FACE_LABEL_TH, type LanternFaceId, type LanternVisual } from "@/types/lantern";
import { buildFaceLayer, ensureLanternFonts, loadImage, TEX_H, TEX_W, textUnderArt } from "@/lib/lantern/texture";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { clamp, cn } from "@/lib/utils";
import { paintPaper } from "./face-paper";
import { SilhouetteMask } from "./shape-mask";

const PEN_COLORS = ["#5b2d0c", "#b4232c", "#e0457b", "#f08c00", "#1b6e3c", "#1b3f8a", "#6b2fa0", "#000000", "#ffffff"];
const MAX_HISTORY = 30;
const MAX_ZOOM = 6;
/** emoji stickers – festival ones first */
const STICKERS = [
  "🪷", "🏮", "✨", "🌕", "🎆", "💛", "❤️", "🙏", "🌸", "⭐", "🐇", "🎉",
  "🌟", "🎇", "🕯️", "🌙", "💖", "💐", "🍀", "🦋", "🐟", "🌈",
  "😊", "😍", "🥰", "😘", "😂", "🤗", "😇", "🥳", "😎", "🤩", "😺", "👍", "👏", "💪",
];
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Segoe UI Symbol",sans-serif';
/** sticker size in texture px from the brush slider (2…28) */
const stickerPx = (size: number) => Math.round(28 + size * 4);
type Tool = "pen" | "eraser" | "sticker";

/** colour emoji rendered on a roomy scratch canvas, then stamped as an image (never clipped) */
const emojiCache = new Map<string, HTMLCanvasElement>();
function emojiSprite(emoji: string, px: number): HTMLCanvasElement {
  const key = `${emoji}|${px}`;
  const hit = emojiCache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = Math.ceil(px * 1.6);
  const g = c.getContext("2d")!;
  g.font = `${px}px ${EMOJI_FONT}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(emoji, c.width / 2, c.height / 2 + px * 0.06);
  if (emojiCache.size > 60) emojiCache.clear();
  emojiCache.set(key, c);
  return c;
}

interface Props {
  /** The lantern as it is now (the drawing of `face` itself is ignored – it lives on the ink canvas) */
  visual: LanternVisual;
  /** wall being drawn on */
  face: LanternFaceId;
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  /** false while the tab is hidden – skips re-rendering the background on every keystroke */
  active?: boolean;
  /** shown above the tools (the wall picker) */
  header?: React.ReactNode;
}

interface View {
  z: number;
  x: number;
  y: number;
}

type Pt = { x: number; y: number };

/**
 * Freehand drawing directly on one wall of the lantern. Mouse, touch and pen (pressure), undo / redo / clear.
 * One finger always draws; two fingers pinch-zoom and pan the paper (a second finger cancels the stroke
 * the first one started). Strokes are mapped through the zoomed canvas rect, so they land right at any zoom.
 */
export function DrawingPad({ visual, face, value, onChange, active = true, header }: Props) {
  const baseRef = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [sticker, setSticker] = useState(STICKERS[0]);
  const [color, setColor] = useState(PEN_COLORS[1]);
  const [size, setSize] = useState(8);
  const undoStack = useRef<ImageData[]>([]);
  const redoStack = useRef<ImageData[]>([]);
  const [history, setHistory] = useState({ undo: 0, redo: 0 });
  const syncHistory = () => setHistory({ undo: undoStack.current.length, redo: redoStack.current.length });
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number; mx: number; my: number } | null>(null);
  const hasInk = useRef(Boolean(value));
  const initialValue = useRef(value);
  /** full-screen drawing mode (bigger paper on phones) */
  const [full, setFull] = useState(false);

  // ---------- zoom / pan (applied straight to the DOM while a gesture runs) ----------
  const view = useRef<View>({ z: 1, x: 0, y: 0 });
  const [zoomLabel, setZoomLabel] = useState(1);
  const applyView = useCallback((v: View) => {
    const vp = viewportRef.current;
    if (!vp) return;
    const W = vp.clientWidth;
    const H = vp.clientHeight;
    const z = clamp(v.z, 1, MAX_ZOOM);
    const next = { z, x: clamp(v.x, W * (1 - z), 0), y: clamp(v.y, H * (1 - z), 0) };
    view.current = next;
    if (paperRef.current) paperRef.current.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.z})`;
  }, []);
  const commitZoom = () => setZoomLabel(Math.round(view.current.z * 10) / 10);
  /** zoom by a factor around a point of the viewport */
  const zoomAt = useCallback(
    (factor: number, px: number, py: number) => {
      const v = view.current;
      const z = clamp(v.z * factor, 1, MAX_ZOOM);
      const cx = (px - v.x) / v.z;
      const cy = (py - v.y) / v.z;
      applyView({ z, x: px - z * cx, y: py - z * cy });
      setZoomLabel(Math.round(z * 10) / 10);
    },
    [applyView],
  );
  const zoomCentre = (factor: number) => {
    const vp = viewportRef.current;
    if (vp) zoomAt(factor, vp.clientWidth / 2, vp.clientHeight / 2);
  };
  const resetZoom = () => {
    applyView({ z: 1, x: 0, y: 0 });
    commitZoom();
  };
  // the paper size changes with full screen / rotation – keep the pan inside it
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const ro = new ResizeObserver(() => applyView(view.current));
    ro.observe(vp);
    return () => ro.disconnect();
  }, [applyView]);

  // ctrl / ⌘ + wheel (and trackpad pinch) zooms, a plain wheel pans once zoomed in – desktop
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      const r = vp.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
      } else if (view.current.z > 1) {
        e.preventDefault();
        applyView({ ...view.current, x: view.current.x - e.deltaX, y: view.current.y - e.deltaY });
      }
    };
    // iOS Safari: its own pinch gesture events must not zoom the page while zooming the paper
    const stop = (e: Event) => e.preventDefault();
    vp.addEventListener("wheel", onWheel, { passive: false });
    vp.addEventListener("gesturestart", stop);
    vp.addEventListener("gesturechange", stop);
    return () => {
      vp.removeEventListener("wheel", onWheel);
      vp.removeEventListener("gesturestart", stop);
      vp.removeEventListener("gesturechange", stop);
    };
  }, [applyView, zoomAt]);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  // ---------- base layer: paper + text + photo of this wall (WYSIWYG with the lantern) ----------
  const art = face === "front" ? { imageSrc: visual.imageSrc, imageConfig: visual.imageConfig } : (visual.faces?.[face] ?? { imageSrc: null, imageConfig: null });
  const visualRef = useRef(visual);
  useEffect(() => {
    visualRef.current = visual;
  });
  // everything the base depends on – but not the drawing itself, so a stroke never re-renders it
  const baseKey = [
    visual.design,
    visual.color,
    visual.shape,
    visual.effects.join(","),
    JSON.stringify(visual.textConfig),
    visual.displayName,
    visual.wishMessage,
    visual.blessingMessage,
    visual.extraMessage,
    art.imageSrc?.length ?? 0,
    art.imageSrc?.slice(-32) ?? "",
    JSON.stringify(art.imageConfig),
    face !== "front" && textUnderArt({ shape: visual.shape, faces: { ...visual.faces, [face]: { imageSrc: null, imageConfig: null, drawingSrc: "x" } } }),
  ].join("|");
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      const v = visualRef.current;
      await ensureLanternFonts([v.textConfig.font]);
      const src = face === "front" ? v.imageSrc : (v.faces?.[face]?.imageSrc ?? null);
      const image = src ? await loadImage(src).catch(() => null) : null;
      const c = baseRef.current;
      if (cancelled || !c) return;
      const layer = buildFaceLayer(face === "front" ? { ...v, drawingSrc: null } : v, face, { image });
      const ctx = c.getContext("2d")!;
      paintPaper(ctx, v.design, v.color);
      ctx.drawImage(layer, 0, 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [baseKey, face, active]);

  const ctx = () => drawRef.current!.getContext("2d", { willReadFrequently: true })!;
  const snapshot = () => ctx().getImageData(0, 0, TEX_W, TEX_H);

  // load the existing drawing once (the pad is re-mounted per wall)
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

  /** client point → texture space; the canvas rect already includes the zoom / pan transform */
  const pos = (e: { clientX: number; clientY: number }) => {
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

  // ---------- gestures ----------
  const pointers = useRef(new Map<number, Pt>());
  /** two-finger gesture state; `lock` keeps the last finger from drawing after a pinch until all are lifted */
  const pinch = useRef<{ d0: number; m0: Pt; v0: View } | null>(null);
  const lock = useRef(false);
  const local = (e: { clientX: number; clientY: number }): Pt => {
    const r = viewportRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const twoFingers = () => {
    const [a, b] = [...pointers.current.values()];
    return { d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  };

  const cancelStroke = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    const top = undoStack.current[undoStack.current.length - 1];
    if (top) ctx().putImageData(top, 0, 0);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!full && typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      // phones: tapping the paper first opens the big full-screen pad – drawing starts with the next touch
      e.preventDefault();
      setFull(true);
      return;
    }
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    if (pointers.current.size >= 2) {
      // a second finger: this is a pinch, not a stroke – take back what the first finger just drew
      cancelStroke();
      lock.current = true;
      const { d, m } = twoFingers();
      pinch.current = { d0: d, m0: m, v0: { ...view.current } };
      return;
    }
    if (lock.current) return;
    drawRef.current?.focus({ preventScroll: true });
    drawing.current = true;
    const { x, y } = pos(e);
    last.current = { x, y, mx: x, my: y };
    const g = ctx();
    if (tool === "sticker") {
      // stamp the emoji (a second finger takes it back like a stroke – see cancelStroke)
      g.globalCompositeOperation = "source-over";
      const sprite = emojiSprite(sticker, stickerPx(size));
      g.drawImage(sprite, x - sprite.width / 2, y - sprite.height / 2);
      return;
    }
    // dot for a single tap
    g.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
    g.fillStyle = color;
    g.beginPath();
    g.arc(x, y, (tool === "eraser" ? size * 2.5 : size) / 2, 0, Math.PI * 2);
    g.fill();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, local(e));
    if (pinch.current && pointers.current.size >= 2) {
      const { d, m } = twoFingers();
      const { d0, m0, v0 } = pinch.current;
      const z = clamp(v0.z * (d / d0), 1, MAX_ZOOM);
      // keep the paper point that was under the fingers' midpoint under it (zoom + pan in one)
      const cx = (m0.x - v0.x) / v0.z;
      const cy = (m0.y - v0.y) / v0.z;
      applyView({ z, x: m.x - z * cx, y: m.y - z * cy });
      return;
    }
    if (!drawing.current || tool === "sticker") return;
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const { x, y } = pos(ev);
      strokeTo(x, y, ev.pointerType === "pen" ? ev.pressure : -1);
    }
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    if (tool !== "eraser") hasInk.current = true;
    undoStack.current.push(snapshot());
    if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
    redoStack.current = [];
    syncHistory();
    emit();
  };

  const release = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(e.pointerId)) return;
    if (pointers.current.size < 2 && pinch.current) {
      pinch.current = null;
      commitZoom();
    }
    if (e.type === "pointercancel") cancelStroke();
    else end();
    if (pointers.current.size === 0) lock.current = false;
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

  const toolBtn = (id: "pen" | "eraser", Icon: typeof Brush, label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={tool === id || (id === "pen" && tool === "sticker")}
      aria-label={label}
      onClick={() => setTool(id)}
      className={cn("flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs", tool === id || (id === "pen" && tool === "sticker") ? "bg-gold text-night" : "text-warm/70")}
    >
      <Icon className="size-4" /> <span className="hidden sm:inline">{label}</span>
    </button>
  );

  return (
    <div
      data-draw-full={full || undefined}
      className={cn(
        "flex flex-col gap-2",
        full ? "fixed inset-0 z-[60] bg-night/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur" : "h-full lg:h-auto lg:gap-3",
      )}
      onKeyDown={onKeyDown}
    >
      {full ? (
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-warm">
            วาดบน{FACE_LABEL_TH[face]} <span className="text-xs font-normal text-warm/50">· สองนิ้วเพื่อซูม/เลื่อน</span>
          </p>
          <Button type="button" size="sm" onClick={() => setFull(false)}>
            <Check /> เสร็จ
          </Button>
        </div>
      ) : (
        header
      )}

      {/* tools: pen / eraser · size · undo / redo / clear · full screen */}
      <div className="flex items-center gap-2">
        <div className="flex shrink-0 rounded-full border border-white/10 bg-white/5 p-0.5" role="radiogroup" aria-label="เครื่องมือ">
          {toolBtn("pen", Brush, "ปากกา")}
          {toolBtn("eraser", Eraser, "ยางลบ")}
        </div>
        <Slider className="min-w-12 flex-1" min={2} max={28} step={1} value={[size]} onValueChange={([v]) => setSize(v)} aria-label="ขนาดแปรง" />
        <span className="grid size-6 shrink-0 place-items-center" aria-hidden>
          <span className="rounded-full bg-warm" style={{ width: Math.max(3, size * 0.7), height: Math.max(3, size * 0.7) }} />
        </span>
        <div className="flex shrink-0 gap-1">
          <Button type="button" variant="subtle" size="icon" className="size-8" onClick={undo} disabled={history.undo <= 1} aria-label="ย้อนกลับ (Undo)">
            <Undo2 />
          </Button>
          <Button type="button" variant="subtle" size="icon" className="size-8" onClick={redo} disabled={!history.redo} aria-label="ทำซ้ำ (Redo)">
            <Redo2 />
          </Button>
          <Button type="button" variant="subtle" size="icon" className="size-8" onClick={clear} aria-label="ล้างภาพวาดทั้งหมด">
            <Trash2 />
          </Button>
          <Button type="button" variant="subtle" size="icon" className="size-8" onClick={() => setFull((f) => !f)} aria-label={full ? "ออกจากโหมดเต็มจอ" : "วาดแบบเต็มจอ"}>
            {full ? <Minimize2 /> : <Maximize2 />}
          </Button>
        </div>
      </div>

      {/* pen colours / emoji stickers – one scrollable row */}
      {tool === "sticker" ? (
        <div className="no-scrollbar studio-row -mx-1 flex items-center gap-1.5 overflow-x-auto overscroll-x-contain px-1 py-0.5 lg:flex-wrap lg:overflow-visible" role="radiogroup" aria-label="สติกเกอร์อีโมจิ">
          <button
            type="button"
            onClick={() => setTool("pen")}
            aria-label="กลับไปใช้ปากกา"
            className="flex h-8 shrink-0 items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2.5 text-xs text-warm/80"
          >
            <Brush className="size-4" /> สี
          </button>
          {STICKERS.map((em) => (
            <button
              key={em}
              type="button"
              role="radio"
              aria-checked={sticker === em}
              aria-label={`สติกเกอร์ ${em}`}
              onClick={() => setSticker(em)}
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-xl border text-xl leading-none transition",
                sticker === em ? "scale-110 border-gold bg-gold/15 shadow-[0_0_14px_-4px_rgba(245,185,66,0.9)]" : "border-white/10 bg-white/[0.03]",
              )}
              style={{ fontFamily: EMOJI_FONT }}
            >
              {em}
            </button>
          ))}
        </div>
      ) : (
        <div className="no-scrollbar studio-row -mx-1 flex items-center gap-2 overflow-x-auto overscroll-x-contain px-1 py-0.5 lg:flex-wrap lg:overflow-visible">
          <button
            type="button"
            onClick={() => setTool("sticker")}
            aria-label="สติกเกอร์อีโมจิ"
            className="flex h-8 shrink-0 items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2.5 text-xs text-warm"
          >
            <span className="text-base leading-none" style={{ fontFamily: EMOJI_FONT }} aria-hidden>
              🪷
            </span>
            สติกเกอร์
          </button>
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
              className={cn("size-8 shrink-0 rounded-full border-2 transition", color === c && tool === "pen" ? "scale-110 border-gold" : "border-white/20")}
              style={{ background: c }}
            />
          ))}
          <label className="relative grid size-8 shrink-0 cursor-pointer place-items-center rounded-full border-2 border-dashed border-white/30 text-xs text-warm/60">
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
      )}

      {/* paper – sized to the space that is left (container query), fixed width on desktop */}
      <div className={cn("min-h-0 flex-1 [container-type:size]", !full && "lg:flex-none lg:[container-type:normal]")}>
        <div
          ref={viewportRef}
          className={cn(
            "relative mx-auto touch-none select-none overflow-hidden rounded-xl border border-gold/30 shadow-[0_0_40px_-10px_rgba(245,185,66,0.6)]",
            "w-[min(100cqw,calc(100cqh*0.909))]",
            !full && "lg:w-full lg:max-w-sm",
            tool === "eraser" ? "cursor-cell" : tool === "sticker" ? "cursor-copy" : "cursor-crosshair",
          )}
          style={{ aspectRatio: `${TEX_W} / ${TEX_H}`, WebkitTouchCallout: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={release}
          onPointerCancel={release}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div ref={paperRef} className="absolute inset-0 origin-top-left will-change-transform">
            <canvas ref={baseRef} width={TEX_W} height={TEX_H} className="absolute inset-0 h-full w-full" aria-hidden />
            <canvas
              ref={drawRef}
              width={TEX_W}
              height={TEX_H}
              tabIndex={0}
              aria-label={`พื้นที่วาดภาพบน${FACE_LABEL_TH[face]}ของโคม`}
              className="absolute inset-0 h-full w-full outline-none"
            />
            <SilhouetteMask shape={visual.shape} />
          </div>
          {/* zoom badge */}
          <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-full bg-night/65 p-0.5 text-warm/85 backdrop-blur" onPointerDown={(e) => e.stopPropagation()}>
            <button type="button" aria-label="ซูมออก" onClick={() => zoomCentre(1 / 1.5)} disabled={zoomLabel <= 1} className="grid size-7 place-items-center rounded-full disabled:opacity-40">
              <ZoomOut className="size-4" />
            </button>
            <button type="button" aria-label="ขนาดปกติ" onClick={resetZoom} className="min-w-9 text-[11px] tabular-nums">
              {Math.round(zoomLabel * 100)}%
            </button>
            <button type="button" aria-label="ซูมเข้า" onClick={() => zoomCentre(1.5)} disabled={zoomLabel >= MAX_ZOOM} className="grid size-7 place-items-center rounded-full disabled:opacity-40">
              <ZoomIn className="size-4" />
            </button>
          </div>
        </div>
      </div>
      <p className="text-center text-[11px] text-warm/45">
        {tool === "sticker" ? `แตะบนกระดาษเพื่อแปะ ${sticker} · ขนาดตามแถบเลื่อน` : "นิ้วเดียววาด · สองนิ้วถ่าง/หุบเพื่อซูมและเลื่อนกระดาษ"}<span className="hidden lg:inline"> · Ctrl+Z เพื่อย้อนกลับ</span>
      </p>
    </div>
  );
}
