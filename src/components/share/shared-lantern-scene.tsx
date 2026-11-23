"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Hand, Info, Music2, Plus, Sparkles, Waves } from "lucide-react";
import type { PublicLantern } from "@/types/lantern";
import type { ClipMusic } from "@/lib/share/clip-music";
import { drawHalo, drawLantern, drawReflection, pickLanternFace, type DrawLanternParams } from "@/lib/lantern/render";
import { buildFaceTextures, ensureLanternFonts, hitFaceContent, loadImage, type FaceTextures } from "@/lib/lantern/texture";
import { formatRemaining } from "@/lib/lantern/motion";
import { useAudio } from "@/components/providers/audio-provider";
import { Button } from "@/components/ui/button";
import { hashString, seededRandom } from "@/lib/utils";
import { KeepsakeViewer, lanternKeepsakes, type KeepsakeKind } from "./keepsake-viewer";
import { VinylPlayer, type VinylPlayerHandle } from "./vinyl-player";
import { LanternDetailDialog } from "@/components/festival/lantern-detail-dialog";

const HOLD_KEY = "shared-link";
const LIGHTS = ["#F5B942", "#FFD27A", "#FF9A5A", "#FFB3C7", "#FFE6A6"];

interface Props {
  lantern: PublicLantern;
  /** song the owner attached to the link (?yt=…&t=…) */
  music: ClipMusic | null;
}

/**
 * What a friend sees when opening a shared "lantern + song" link: only this krathong, drifting
 * under a full moon. The song plays from a vinyl (theme music stays silent until the visitor pauses it);
 * tapping the photo / sticker / text on the paper walls opens it as a polaroid, sticker or note.
 */
export function SharedLanternScene({ lantern, music }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vinyl = useRef<VinylPlayerHandle>(null);
  const texRef = useRef<FaceTextures | null>(null);
  const assets = useRef<{ image: HTMLImageElement | null; drawing: HTMLImageElement | null }>({ image: null, drawing: null });
  const params = useRef<DrawLanternParams | null>(null);
  const userYaw = useRef(0);
  const yawVel = useRef(0);
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const [intro, setIntro] = useState(!!music);
  const [viewer, setViewer] = useState<number | null>(null);
  const [details, setDetails] = useState(false);
  const { suspend } = useAudio();
  const items = useMemo(() => lanternKeepsakes(lantern), [lantern]);

  // a link with a song: the site's theme music stays silent – only the owner's song plays
  useEffect(() => {
    if (!music) return;
    suspend(true, HOLD_KEY);
    return () => suspend(false, HOLD_KEY);
  }, [music, suspend]);
  /** the song is playing (its own hold), failed, or the visitor paused it → hand music back */
  const release = useCallback(() => suspend(false, HOLD_KEY), [suspend]);

  // face textures (photo + sticker printed on the paper, exactly like on the river)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureLanternFonts([lantern.textConfig.font]);
      const [image, drawing] = await Promise.all([
        lantern.imageSrc ? loadImage(lantern.imageSrc).catch(() => null) : null,
        lantern.drawingSrc ? loadImage(lantern.drawingSrc).catch(() => null) : null,
      ]);
      if (cancelled) return;
      assets.current = { image, drawing };
      texRef.current = buildFaceTextures(lantern, { image, drawing }, { target: texRef.current });
    })();
    return () => {
      cancelled = true;
    };
  }, [lantern]);

  // ---------- scene ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const seed = hashString(lantern.id);
    const rnd = seededRandom(seed);
    const stars = Array.from({ length: 150 }, () => ({ x: rnd(), y: rnd() * rnd(), r: 0.4 + rnd() * 1.3, p: rnd() * 6.28, s: 0.6 + rnd() * 2 }));
    const far = Array.from({ length: 11 }, () => ({ x: rnd(), d: rnd(), v: 0.004 + rnd() * 0.01, yaw: -0.8 + rnd() * 0.9, light: LIGHTS[Math.floor(rnd() * LIGHTS.length)] }));
    far.sort((a, b) => a.d - b.d);
    const sparks = Array.from({ length: 26 }, () => ({ x: rnd() - 0.5, p: rnd(), v: 0.05 + rnd() * 0.08, r: 0.6 + rnd() * 1.6 }));

    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let raf = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden || !w) return;
      const t = (now - t0) / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const narrow = w < 768;
      const horizon = h * (narrow ? 0.5 : 0.56);

      // sky
      const sky = ctx.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, "#03050f");
      sky.addColorStop(0.6, "#0c1433");
      sky.addColorStop(1, "#1d2752");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, horizon);
      for (const s of stars) {
        ctx.globalAlpha = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * s.s + s.p));
        ctx.fillStyle = "#fff6e0";
        ctx.fillRect(s.x * w, s.y * horizon * 0.95, s.r, s.r);
      }
      ctx.globalAlpha = 1;

      // full moon
      const R = Math.max(30, Math.min(84, Math.min(w, h) * 0.085));
      const mx = w * (narrow ? 0.8 : 0.76);
      const my = narrow ? Math.max(R + 150, horizon * 0.48) : horizon * 0.34;
      const halo = ctx.createRadialGradient(mx, my, R * 0.8, mx, my, R * 6);
      halo.addColorStop(0, "rgba(255,236,200,0.32)");
      halo.addColorStop(0.35, "rgba(255,220,170,0.1)");
      halo.addColorStop(1, "rgba(255,220,170,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(mx - R * 6, my - R * 6, R * 12, R * 12);
      const disk = ctx.createRadialGradient(mx - R * 0.3, my - R * 0.3, R * 0.1, mx, my, R);
      disk.addColorStop(0, "#fffdf4");
      disk.addColorStop(0.75, "#f8ebcb");
      disk.addColorStop(1, "#e9d29e");
      ctx.fillStyle = disk;
      ctx.beginPath();
      ctx.arc(mx, my, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(196,170,120,0.22)";
      for (const [cx, cy, cr] of [[-0.3, -0.15, 0.2], [0.25, 0.2, 0.14], [0.05, -0.4, 0.1], [0.35, -0.2, 0.08], [-0.15, 0.35, 0.12]]) {
        ctx.beginPath();
        ctx.arc(mx + cx * R, my + cy * R, cr * R, 0, Math.PI * 2);
        ctx.fill();
      }

      // water
      const water = ctx.createLinearGradient(0, horizon, 0, h);
      water.addColorStop(0, "#121d44");
      water.addColorStop(0.4, "#0a1230");
      water.addColorStop(1, "#02040b");
      ctx.fillStyle = water;
      ctx.fillRect(0, horizon, w, h - horizon);
      ctx.fillStyle = "rgba(255,214,140,0.18)";
      ctx.fillRect(0, horizon, w, 1);

      // moonlight path on the water
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let y = horizon + 2; y < h; y += 5) {
        const k = (y - horizon) / (h - horizon);
        const half = R * (0.5 + k * 2.6) * (0.7 + 0.3 * Math.sin(t * 1.4 + y * 0.09));
        const off = Math.sin(t * 0.9 + y * 0.05) * R * 0.25 * k;
        ctx.fillStyle = `rgba(255,232,190,${(0.22 * (1 - k * 0.75)).toFixed(3)})`;
        ctx.fillRect(mx - half + off, y, half * 2 * (0.6 + 0.4 * Math.sin(y * 0.7 + t * 2)), 1.4);
      }
      ctx.restore();

      // distant krathongs drifting along the far bank
      for (const f of far) {
        const s = 8 + f.d * 22;
        const x = ((((f.x + t * f.v) % 1.2) + 1.2) % 1.2) * w - w * 0.1;
        const y = horizon + 6 + f.d * (h - horizon) * 0.22;
        drawReflection(ctx, x, y, s, f.light, 1, 0.7, t, f.x * 10);
        drawHalo(ctx, x, y - s * 0.6, s, f.light, 1, 0.75, 0.9);
        drawLantern(ctx, { x, y, size: s, yaw: f.yaw + Math.sin(t * 0.3 + f.x * 9) * 0.15, pitch: 0.25, glow: 1, alpha: 0.9, design: "classic-golden", light: f.light, time: t, halo: false });
      }

      // ripples
      ctx.strokeStyle = "rgba(160,190,255,0.06)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 9; i++) {
        const y = horizon + ((i / 9 + t * 0.01) % 1) * (h - horizon);
        const amp = 2 + ((y - horizon) / (h - horizon)) * 6;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 24) ctx.lineTo(x, y + Math.sin(x * 0.02 + t + i) * amp);
        ctx.stroke();
      }

      // ---- the shared krathong: floating, drifting, gently turning ----
      const size = Math.max(92, Math.min(230, Math.min(w * (narrow ? 0.32 : 0.2), h * 0.2)));
      const lx = w / 2 + Math.sin(t * 0.11) * w * (narrow ? 0.05 : 0.08);
      const ly = h * (narrow ? 0.79 : 0.74) + Math.sin(t * 1.1) * size * 0.025;
      if (!drag.current) {
        userYaw.current += yawVel.current;
        yawVel.current *= 0.93;
      }
      const p: DrawLanternParams = {
        x: lx,
        y: ly,
        size,
        yaw: -0.42 + Math.sin(t * 0.22) * 0.3 + userYaw.current,
        pitch: 0.36,
        roll: Math.sin(t * 0.9) * 0.025,
        glow: 1,
        alpha: 1,
        design: lantern.design,
        shape: lantern.shape,
        light: lantern.color,
        effects: lantern.effects,
        offering: lantern.offering,
        textures: texRef.current,
        time: t,
        seed: seed % 1000,
      };
      drawReflection(ctx, lx, ly + size * 0.05, size, lantern.color, 1, 1, t, seed % 100);
      drawLantern(ctx, p);
      params.current = p;

      // embers rising from the candle
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const s of sparks) {
        const k = (s.p + t * s.v) % 1;
        ctx.globalAlpha = Math.sin(k * Math.PI) * 0.8;
        ctx.fillStyle = "#ffd98a";
        ctx.beginPath();
        ctx.arc(lx + s.x * size * 1.4 + Math.sin(t + s.p * 9) * 6, ly - size * 1.1 - k * size * 1.6, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [lantern]);

  // ---------- tap / drag ----------
  const local = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };

  /** which keepsake is under the pointer (null = not on the krathong) */
  const pick = (x: number, y: number): KeepsakeKind | "lantern" | null => {
    const p = params.current;
    if (!p) return null;
    const hit = pickLanternFace(p, x, y);
    if (!hit) {
      // base / rim / candle light still count as "the krathong"
      const near = Math.abs(x - p.x) < p.size * 0.85 && y < p.y + p.size * 0.25 && y > p.y - p.size * 1.6;
      return near ? "lantern" : null;
    }
    return hitFaceContent(lantern, assets.current, hit.face, hit.u, hit.v) ?? "lantern";
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    yawVel.current = 0;
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d) {
      const [x, y] = local(e);
      e.currentTarget.style.cursor = pick(x, y) ? "pointer" : "grab";
      return;
    }
    if (d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.hypot(dx, e.clientY - d.y) < 8) return;
    d.moved = true;
    const step = (dx / Math.max(320, e.currentTarget.clientWidth)) * Math.PI * 2;
    userYaw.current += step;
    yawVel.current = step * 0.5;
    d.x = e.clientX;
    d.y = e.clientY;
  };
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    const [x, y] = local(e);
    const kind = pick(x, y);
    if (!kind || !items.length) return;
    const i = kind === "lantern" ? 0 : items.findIndex((it) => it.kind === kind);
    setViewer(i < 0 ? 0 : i);
  };

  const startIntro = () => {
    vinyl.current?.play(); // inside the tap – browsers only allow sound from a user gesture
    setIntro(false);
  };

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const remaining = Date.parse(lantern.expiresAt) - now;

  return (
    <div className="fixed inset-0 overflow-hidden bg-night">
      <h1 className="sr-only">โคมอธิษฐานของ {lantern.displayName}</h1>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`กระทงของ ${lantern.displayName} ลอยอยู่ใต้แสงจันทร์ แตะรูป สติกเกอร์ หรือข้อความเพื่อดูใกล้ ๆ`}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
      />

      {/* title */}
      <div className="pointer-events-none absolute inset-x-0 top-[68px] px-4 text-center md:top-20">
        <p className="text-xs tracking-[0.25em] text-gold/80">โคมอธิษฐานของ</p>
        <p className="font-display text-3xl leading-tight text-warm drop-shadow-[0_2px_12px_rgba(0,0,0,0.7)] md:text-5xl">{lantern.displayName}</p>
        <p suppressHydrationWarning className="mt-1 flex items-center justify-center gap-1.5 text-xs text-warm/55">
          <Waves className="size-3.5" /> {remaining > 0 ? `ลอยอยู่บนสายน้ำอีก ${formatRemaining(remaining)}` : "กำลังลอยไปกับสายน้ำ"}
        </p>
      </div>

      {/* song */}
      {music && (
        <VinylPlayer
          ref={vinyl}
          music={music}
          accent={lantern.color}
          onSettled={release}
          className="absolute left-4 top-[164px] z-20 md:left-10 md:top-1/2 md:-translate-y-1/2"
        />
      )}

      {/* hint + actions */}
      <div className="pointer-events-none absolute inset-x-0 bottom-[max(1.25rem,env(safe-area-inset-bottom))] flex flex-col items-center gap-3 px-4">
        {items.length > 0 && (
          <p className="flex items-center gap-1.5 rounded-full bg-night/50 px-3 py-1 text-center text-xs text-warm/70 backdrop-blur">
            <Hand className="size-3.5 shrink-0" /> แตะรูป สติกเกอร์ หรือข้อความบนกระทงเพื่อดูใกล้ ๆ · ลากเพื่อหมุน
          </p>
        )}
        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2">
          <Button asChild size="lg">
            <Link href="/create">
              <Plus /> ปล่อยกระทงของฉัน
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="bg-night/40 backdrop-blur">
            <Link href={`/festival?focus=${lantern.id}`}>
              <Sparkles /> ดูเทศกาล
            </Link>
          </Button>
          <Button size="icon" variant="ghost" aria-label="รายละเอียดและรายงาน" className="size-11 rounded-full bg-night/40 backdrop-blur" onClick={() => setDetails(true)}>
            <Info />
          </Button>
        </div>
      </div>

      <KeepsakeViewer visual={lantern} items={items} index={viewer} onIndex={setViewer} />
      <LanternDetailDialog lantern={details ? lantern : null} serverOffset={0} onClose={() => setDetails(false)} onGone={() => setDetails(false)} />

      {/* intro: the tap that opens the gift also starts the song */}
      <AnimatePresence>
        {intro && music && (
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.6 } }}
            onClick={startIntro}
            className="absolute inset-0 z-40 grid place-items-center bg-[#03050d]/75 px-6 backdrop-blur-sm"
          >
            <motion.span
              initial={{ y: 20, scale: 0.95 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: -30, scale: 1.05 }}
              className="glass flex max-w-sm flex-col items-center gap-4 rounded-3xl px-8 py-8 text-center"
            >
              <span className="relative grid size-20 place-items-center">
                <span className="absolute inset-0 animate-ping rounded-full bg-gold/25" />
                <span className="grid size-16 place-items-center rounded-full bg-gold text-night shadow-[0_0_40px_-4px_rgba(245,185,66,0.9)]">
                  <Music2 className="size-7" />
                </span>
              </span>
              <span className="font-display text-2xl leading-snug text-warm">{lantern.displayName} ส่งกระทงพร้อมเพลงมาให้คุณ</span>
              <span className="text-sm text-warm/60">แตะเพื่อเปิดกระทงและฟังเพลง 🎵</span>
            </motion.span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
