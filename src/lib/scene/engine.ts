import type { EffectId, LanternDesignId, LanternShapeId, LanternVisual } from "@/types/lantern";
import { hashString } from "@/lib/utils";
import { FADE_OUT_MS, LANTERN_LIFETIME_MS, lanternPose, type LanternPose } from "@/lib/lantern/motion";
import { drawHalo, drawLantern, drawReflection, type ScreenRect } from "@/lib/lantern/render";
import { buildFaceTextures, ensureLanternFonts, loadImage, type FaceTextures } from "@/lib/lantern/texture";
import { MAX_VISIBLE_LANTERNS, selectVisibleLanterns } from "@/lib/lantern/selection";
import { LANTERN_DESIGNS } from "@/lib/lantern/designs";
import { WaterBackground } from "./water";
import { Particles } from "./particles";
import { buildDoodleTextures } from "./doodles";
import { bubblePhase, buildWishBubble, type BubbleSprite } from "./wish-bubbles";
import { computeView, LANTERN_WORLD_SIZE, pitchFor, projectPoint, type Camera, type View } from "./view";

export interface EngineLantern {
  id: string;
  ownerId: string;
  releasedAtMs: number;
  expiresAtMs: number;
  design: LanternDesignId;
  shape?: LanternShapeId;
  light: string;
  effects: EffectId[];
  offering: number;
  /** Real lantern content; decorative lanterns use doodles instead */
  visual?: LanternVisual;
  doodleSeed?: number;
}

interface Entity extends EngineLantern {
  seed: number;
  textures: FaceTextures | null;
  texState: "idle" | "queued" | "loading" | "ready" | "error";
  vis: number;
  target: number;
  removed: boolean;
  pauseMs: number;
  pausedAt: number | null;
  rect: ScreenRect | null;
  pose: LanternPose | null;
  /** splash drift (world units) + velocity, local to this viewer */
  push?: { x: number; z: number; vx: number; vz: number };
}

interface Ripple {
  x: number;
  z: number;
  born: number;
}

/** splash tuning: how far a slap reaches, how hard it pushes, and how far a lantern may be pushed overall */
const SPLASH_RADIUS = 3.2;
const SPLASH_POWER = 2.6;
const MAX_PUSH = 5;

export type Quality = "high" | "low";

export interface EngineOptions {
  interactive?: boolean;
  quality?: Quality | "auto";
  maxVisible?: number;
  /** Frame-rate cap (e.g. 30 for decorative backgrounds). Default: display refresh rate */
  maxFps?: number;
  /** Owner's "my river": lanterns never fade out (they rest on the water forever) */
  keepAlive?: boolean;
  onLanternClick?: (id: string) => void;
  onHoverChange?: (id: string | null) => void;
  /** Called when the owner's lantern is visible on screen (for UI hints) */
  onOwnerVisibility?: (visible: boolean) => void;
  /** Called the first time the user drags / zooms the view (so the UI can turn "follow" off) */
  onUserNavigate?: () => void;
}

/** Texture canvases are recycled instead of re-allocated (object pooling) */
class TexturePool {
  private pool: FaceTextures[] = [];
  take(): FaceTextures | null {
    return this.pool.pop() ?? null;
  }
  give(t: FaceTextures) {
    if (this.pool.length < 24) this.pool.push(t);
  }
}

const TEXTURE_MIN_SIZE = 26;
const FADE_SECONDS = 1.1;

function detectQuality(): Quality {
  if (typeof navigator === "undefined") return "high";
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 8;
  const mem = nav.deviceMemory ?? 8;
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  // iOS Safari reports 4 cores or fewer on every iPhone – only truly small devices start in "low";
  // monitorPerformance() still drops to "low" automatically when frames get slow
  return cores <= 2 || mem <= 2 || reduced ? "low" : "high";
}

export class FestivalEngine {
  private ctx: CanvasRenderingContext2D;
  private entities = new Map<string, Entity>();
  private water: WaterBackground;
  private particles: Particles;
  private pool = new TexturePool();
  /** wish speech-bubble sprites, by lantern id */
  private bubbles = new Map<string, { text: string; sprite: BubbleSprite | null }>();
  private view: View = computeView(1, 1);
  private cam: Camera = { x: 0, z: 0 };
  private camTarget: Camera = { x: 0, z: 0 };
  /**
   * 360° orbit: the world is rotated around a pivot `orbitR` in front of the camera before projecting.
   * Drag sideways to orbit; drag up/down or pinch to glide over the water.
   */
  private orbit = 0;
  private orbitTarget = 0;
  private orbitVel = 0;
  private orbitR = 6;
  private ripples: Ripple[] = [];
  private lastSplash = { x: 0, z: 0, t: -1e9 };
  private dpr = 1;
  private raf = 0;
  private last = 0;
  private time = 0;
  private lastSelect = 0;
  private serverOffset = 0;
  private userId: string | null = null;
  private follow = true;
  private followEngaged = false;
  private focusId: string | null = null;
  private hoverId: string | null = null;
  private drawOrder: Entity[] = [];
  private quality: Quality;
  private autoQuality: boolean;
  private frameTimes: number[] = [];
  private loadQueue: Entity[] = [];
  private loading = 0;
  private resizeObs: ResizeObserver | null = null;
  private ownerVisible = false;
  private vignette: HTMLCanvasElement | null = null;
  // free camera (drag / pinch / wheel / keys)
  private manual = false;
  private userCam: Camera = { x: 0, z: 0 };
  private camVel = { x: 0, z: 0 };
  private pointers = new Map<number, { x: number; y: number }>();
  private dragDistance = 0;
  private suppressClick = false;
  private pinchDist = 0;
  private lastMoveT = 0;
  private lastDrawn = 0;
  private destroyed = false;
  private readonly max: number;

  constructor(private canvas: HTMLCanvasElement, private opts: EngineOptions = {}) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D not supported");
    this.ctx = ctx;
    this.max = opts.maxVisible ?? MAX_VISIBLE_LANTERNS;
    this.autoQuality = !opts.quality || opts.quality === "auto";
    this.quality = this.autoQuality ? detectQuality() : (opts.quality as Quality);
    this.water = new WaterBackground(this.quality === "high" ? 90 : 40);
    this.particles = new Particles(this.quality === "high" ? 38 : 14);

    this.resize();
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObs = new ResizeObserver(() => this.resize());
      this.resizeObs.observe(canvas);
    }
    if (opts.interactive) {
      canvas.addEventListener("pointerdown", this.onPointerDown);
      canvas.addEventListener("pointermove", this.onPointerMove);
      canvas.addEventListener("pointerup", this.onPointerUp);
      canvas.addEventListener("pointercancel", this.onPointerUp);
      canvas.addEventListener("pointerleave", this.onPointerLeave);
      canvas.addEventListener("click", this.onClick);
      canvas.addEventListener("wheel", this.onWheel, { passive: false });
      canvas.addEventListener("keydown", this.onKeyDown);
    }
  }

  // ------------------------------------------------------------------ public API

  start() {
    if (this.raf || this.destroyed) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  destroy() {
    this.destroyed = true;
    this.stop();
    this.resizeObs?.disconnect();
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.canvas.removeEventListener("click", this.onClick);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("keydown", this.onKeyDown);
    this.entities.clear();
  }

  /** serverNow − clientNow, so animation follows server time */
  setServerOffset(ms: number) {
    this.serverOffset = ms;
  }

  serverNow() {
    return Date.now() + this.serverOffset;
  }

  setUser(id: string | null) {
    this.userId = id;
    this.lastSelect = 0;
  }

  setFollow(on: boolean) {
    this.follow = on;
    if (!on) this.followEngaged = false;
    else this.manual = false; // following takes the camera back
  }

  /** screen point → water-plane world point (inverse of projectPoint; null above the horizon) */
  private unproject(sx: number, sy: number): { x: number; z: number } | null {
    const v = this.view;
    const scale = (sy - v.horizon) / v.height;
    if (scale <= 0.02) return null;
    return { x: this.cam.x + (sx - v.w / 2) / scale, z: this.cam.z + v.focal / scale };
  }

  private splashAt(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect();
    const w = this.unproject(clientX - r.left, clientY - r.top);
    if (!w) return;
    const t = this.time;
    // slapping the same spot over and over fades out (no flinging lanterns into orbit), and a short cooldown
    const same = Math.hypot(w.x - this.lastSplash.x, w.z - this.lastSplash.z) < 0.9 && t - this.lastSplash.t < 1.2;
    if (t - this.lastSplash.t < 0.12) return;
    const power = SPLASH_POWER * (same ? 0.35 : 1);
    this.lastSplash = { x: w.x, z: w.z, t };
    this.ripples.push({ x: w.x, z: w.z, born: t });
    if (this.ripples.length > 12) this.ripples.shift();
    for (const e of this.drawOrder) {
      if (!e.pose) continue;
      const dx = e.pose.x - w.x;
      const dz = e.pose.z - w.z;
      const d = Math.hypot(dx, dz);
      if (d > SPLASH_RADIUS) continue;
      const k = power * (1 - d / SPLASH_RADIUS) ** 1.5;
      const nx = d > 0.05 ? dx / d : Math.cos(t * 7);
      const nz = d > 0.05 ? dz / d : Math.sin(t * 7);
      const p = (e.push ??= { x: 0, z: 0, vx: 0, vz: 0 });
      p.vx += nx * k;
      p.vz += nz * k;
    }
  }

  /** integrate splash drift: damped motion, capped distance, and lanterns gently keep apart */
  private stepPush(dt: number) {
    const list = this.drawOrder;
    for (const e of list) {
      const p = e.push;
      if (!p) continue;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      const damp = Math.exp(-dt * 1.6);
      p.vx *= damp;
      p.vz *= damp;
      const m = Math.hypot(p.x, p.z);
      if (m > MAX_PUSH) {
        p.x *= MAX_PUSH / m;
        p.z *= MAX_PUSH / m;
      }
    }
    // pushed lanterns must not end up on top of each other
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.pose) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b.pose || (!a.push && !b.push)) continue;
        const dx = b.pose.x - a.pose.x;
        const dz = b.pose.z - a.pose.z;
        const d = Math.hypot(dx, dz);
        const min = LANTERN_WORLD_SIZE * 1.9;
        if (d >= min || d === 0) continue;
        const f = ((min - d) / min) * 0.5;
        const pa = (a.push ??= { x: 0, z: 0, vx: 0, vz: 0 });
        const pb = (b.push ??= { x: 0, z: 0, vx: 0, vz: 0 });
        pa.vx -= (dx / d) * f;
        pa.vz -= (dz / d) * f;
        pb.vx += (dx / d) * f;
        pb.vz += (dz / d) * f;
      }
    }
  }

  private drawRipples(ctx: CanvasRenderingContext2D) {
    if (!this.ripples.length) return;
    const t = this.time;
    this.ripples = this.ripples.filter((r) => t - r.born < 1.6);
    ctx.save();
    for (const r of this.ripples) {
      const p = this.project(r.x, r.z);
      if (!p) continue;
      const age = (t - r.born) / 1.6;
      for (let k = 0; k < 3; k++) {
        const a = age - k * 0.12;
        if (a <= 0) continue;
        const rad = (0.25 + a * SPLASH_RADIUS * 0.8) * p.scale;
        ctx.globalAlpha = Math.max(0, (1 - a) * 0.55);
        ctx.strokeStyle = "#cfe3ff";
        ctx.lineWidth = Math.max(1, 2.2 * (1 - a));
        ctx.beginPath();
        ctx.ellipse(p.sx, p.sy, rad, rad * 0.32, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** Return to the default view */
  resetView() {
    this.manual = false;
    this.userCam = { x: 0, z: 0 };
    this.camVel = { x: 0, z: 0 };
    this.followEngaged = false;
    // turn back the short way round
    const full = Math.PI * 2;
    this.orbit = ((((this.orbit + Math.PI) % full) + full) % full) - Math.PI;
    this.orbitTarget = 0;
    this.orbitVel = 0;
  }

  /** Focus (zoom into) a lantern and pause its motion; null resumes */
  setFocus(id: string | null) {
    const now = this.serverNow();
    if (this.focusId && this.focusId !== id) {
      const prev = this.entities.get(this.focusId);
      if (prev?.pausedAt != null) {
        prev.pauseMs += now - prev.pausedAt;
        prev.pausedAt = null;
      }
    }
    this.focusId = id;
    if (id) {
      const e = this.entities.get(id);
      if (e && e.pausedAt == null) e.pausedAt = now;
    }
    this.lastSelect = 0;
  }

  upsert(list: EngineLantern[]) {
    if (this.opts.keepAlive) list = list.map((l) => ({ ...l, expiresAtMs: Number.POSITIVE_INFINITY }));
    for (const l of list) {
      const existing = this.entities.get(l.id);
      if (existing) {
        const contentChanged = existing.visual !== l.visual && l.visual;
        Object.assign(existing, l, { removed: false });
        if (contentChanged && existing.texState === "ready") existing.texState = "idle";
      } else {
        this.entities.set(l.id, {
          ...l,
          seed: (hashString(l.id) % 1000) / 100,
          textures: null,
          texState: "idle",
          vis: 0,
          target: 0,
          removed: false,
          pauseMs: 0,
          pausedAt: null,
          rect: null,
          pose: null,
        });
      }
    }
    this.lastSelect = 0;
  }

  /** Replace the full set (used after an initial fetch or a resync) */
  replaceAll(list: EngineLantern[]) {
    const keep = new Set(list.map((l) => l.id));
    for (const e of this.entities.values()) if (!keep.has(e.id)) e.removed = true;
    this.upsert(list);
  }

  remove(id: string) {
    const e = this.entities.get(id);
    if (e) {
      e.removed = true;
      this.lastSelect = 0;
    }
  }

  /** Fill the scene with decorative lanterns (landing page). Not user data. */
  populateDecorative(count: number) {
    const now = this.serverNow();
    const designs: LanternDesignId[] = ["classic-golden", "classic-golden", "warm-white", "classic-golden", "sunset-orange", "classic-golden", "warm-white", "romantic-pink"];
    const list: EngineLantern[] = [];
    for (let i = 0; i < count; i++) {
      const design = designs[i % designs.length];
      const shape: LanternShapeId = i % 7 === 3 ? "moon" : i % 9 === 5 ? "heart" : "box";
      const age = ((i + 0.5) / count) * 38 * 60 * 1000;
      list.push({
        id: `deco-${i}`,
        ownerId: "",
        releasedAtMs: now - age,
        expiresAtMs: Number.POSITIVE_INFINITY,
        design,
        shape,
        light: LANTERN_DESIGNS[design].defaultLight,
        effects: [],
        offering: 0,
        doodleSeed: 101 + i * 37,
      });
    }
    this.upsert(list);
  }

  getVisibleCount() {
    return this.drawOrder.length;
  }

  // ------------------------------------------------------------------ internals

  private resize = () => {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    // full retina resolution is rarely worth it for a soft, glowing scene – big win on phones
    // phones have 3x screens: 1x looked blurry; 2x keeps lanterns and their writing crisp
    const maxDpr = this.quality === "high" ? 2 : 1.5;
    this.dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, maxDpr);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.view = computeView(w, h);
    this.water.resize(this.view, this.dpr);
    this.vignette = this.buildVignette(w, h);
  };

  /** Vignette is static – render it once per resize instead of every frame */
  private buildVignette(w: number, h: number) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w / 2));
    c.height = Math.max(1, Math.round(h / 2));
    const g = c.getContext("2d")!;
    g.scale(0.5, 0.5);
    const vg = g.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.35, w / 2, h * 0.55, Math.max(w, h) * 0.8);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.45)");
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);
    return c;
  }

  private setQuality(q: Quality) {
    if (q === this.quality) return;
    this.quality = q;
    this.water.setQuality(q === "high" ? 90 : 40);
    this.particles.setCount(q === "high" ? 38 : 14);
    this.resize();
  }

  private ageOf(e: Entity, now: number) {
    const ref = e.pausedAt ?? now;
    const age = ref - e.releasedAtMs - e.pauseMs;
    // owner view: freeze the lifecycle in the "resting" phase instead of fading out on day 7
    return this.opts.keepAlive ? Math.min(age, LANTERN_LIFETIME_MS - FADE_OUT_MS - 60_000) : age;
  }

  private select(now: number) {
    // loop decorative lanterns
    for (const e of this.entities.values()) {
      // decorative background lanterns re-launch every ~40 minutes so the landing page stays alive
      if (e.doodleSeed != null && now - e.releasedAtMs > 40 * 60_000) {
        e.releasedAtMs = now;
        e.pauseMs = 0;
      }
    }

    const candidates = [...this.entities.values()].filter((e) => !e.removed);
    const pinned = new Set<string>(this.focusId ? [this.focusId] : []);
    const chosen = selectVisibleLanterns(candidates, {
      currentUserId: this.userId,
      serverNowMs: now,
      max: this.max,
      pinnedIds: pinned,
      isInView: (l) => {
        const e = l as Entity;
        const pose = lanternPose(e.id, this.ageOf(e, now));
        const p = this.project(pose.x, pose.z);
        return !!p && p.sx > -this.view.w * 0.1 && p.sx < this.view.w * 1.1;
      },
    });
    const ids = new Set(chosen.map((c) => c.id));
    for (const e of this.entities.values()) e.target = ids.has(e.id) ? 1 : 0;
  }

  private requestTextures(e: Entity) {
    if (e.texState !== "idle") return;
    if (e.doodleSeed != null) {
      e.textures = buildDoodleTextures(e.doodleSeed, this.quality === "high" ? 0.5 : 0.4);
      e.texState = "ready";
      return;
    }
    e.texState = "queued";
    this.loadQueue.push(e);
    this.pumpQueue();
  }

  private pumpQueue() {
    while (this.loading < 3 && this.loadQueue.length) {
      const e = this.loadQueue.shift()!;
      if (!this.entities.has(e.id) || e.removed) {
        e.texState = "idle";
        continue;
      }
      this.loading++;
      e.texState = "loading";
      this.buildTextures(e)
        .catch(() => {
          e.texState = "error";
        })
        .finally(() => {
          this.loading--;
          this.pumpQueue();
        });
    }
  }

  private async buildTextures(e: Entity) {
    const v = e.visual;
    if (!v) {
      e.texState = "error";
      return;
    }
    await ensureLanternFonts([v.textConfig.font]);
    const [image, drawing] = await Promise.all([
      v.imageSrc ? loadImage(v.imageSrc).catch(() => null) : Promise.resolve(null),
      v.drawingSrc ? loadImage(v.drawingSrc).catch(() => null) : Promise.resolve(null),
    ]);
    if (this.destroyed) return;
    e.textures = buildFaceTextures(v, { image, drawing }, {
      target: e.textures ?? this.pool.take(),
      resolution: this.quality === "high" ? 0.6 : 0.45,
    });
    e.texState = "ready";
  }

  private releaseTextures(e: Entity) {
    if (e.textures && e.doodleSeed == null) this.pool.give(e.textures);
    e.textures = null;
    e.texState = "idle";
  }

  private frame = (t: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const fps = this.opts.maxFps ?? (this.quality === "low" ? 30 : 0);
    if (fps && t - this.lastDrawn < 1000 / fps - 2) return;
    this.lastDrawn = t;
    const dtMs = t - this.last;
    this.last = t;
    const dt = Math.min(0.05, Math.max(0, dtMs / 1000));
    this.time += dt;
    this.monitorPerformance(dtMs);

    const now = this.serverNow();
    if (t - this.lastSelect > 400 || this.lastSelect === 0) {
      this.select(now);
      this.lastSelect = t;
    }

    // fades & eviction – use real elapsed time so fades finish on time even on slow devices
    const step = Math.min(0.5, Math.max(0, dtMs / 1000)) / FADE_SECONDS;
    for (const e of this.entities.values()) {
      if (e.vis < e.target) e.vis = Math.min(e.target, e.vis + step);
      else if (e.vis > e.target) e.vis = Math.max(e.target, e.vis - step);
      if (e.vis === 0 && e.target === 0) {
        if (e.removed || e.expiresAtMs <= now) this.entities.delete(e.id);
        if (e.textures) this.releaseTextures(e);
      }
    }

    // build draw list
    const list: Entity[] = [];
    for (const e of this.entities.values()) {
      if (e.vis <= 0) continue;
      e.pose = lanternPose(e.id, this.ageOf(e, now));
      if (e.push) {
        e.pose.x += e.push.x;
        e.pose.z += e.push.z;
      }
      list.push(e);
    }
    // strict cap: selected lanterns first, then the strongest fading ones
    if (list.length > this.max) {
      list.sort((a, b) => b.target - a.target || b.vis - a.vis);
      list.length = this.max;
    }
    list.sort((a, b) => b.pose!.z - a.pose!.z);
    this.drawOrder = list;

    this.stepPush(dt);
    this.updateCamera(dt, now);
    this.render(now);
  };

  /** world (x, z) → screen, after the 360° orbit around the pivot in front of the camera */
  private project(x: number, z: number) {
    if (this.orbit === 0) return projectPoint(this.view, this.cam, x, z);
    const px = this.cam.x;
    const pz = this.cam.z + this.orbitR;
    const c = Math.cos(this.orbit);
    const sn = Math.sin(this.orbit);
    const dx = x - px;
    const dz = z - pz;
    return projectPoint(this.view, this.cam, px + dx * c + dz * sn, pz - dx * sn + dz * c);
  }

  private updateCamera(dt: number, now: number) {
    const focus = this.focusId ? this.entities.get(this.focusId) : null;
    // orbit with inertia; the pivot sits on the focused lantern while a card is open
    if (this.pointers.size === 0 && this.orbitVel) {
      this.orbitTarget += this.orbitVel * dt;
      this.orbitVel *= Math.exp(-dt * 3);
      if (Math.abs(this.orbitVel) < 0.002) this.orbitVel = 0;
    }
    this.orbit += (this.orbitTarget - this.orbit) * (1 - Math.exp(-dt * 10));
    if (Math.abs(this.orbit) < 1e-5 && this.orbitTarget === 0) this.orbit = 0;
    const pivotTarget = focus?.pose ? 2.4 : 6;
    this.orbitR += (pivotTarget - this.orbitR) * (1 - Math.exp(-dt * 2.2));
    if (focus?.pose) {
      this.camTarget = { x: focus.pose.x, z: focus.pose.z - this.orbitR };
    } else if (this.manual) {
      // free camera with inertia
      if (this.pointers.size === 0) {
        this.userCam.x += this.camVel.x * dt;
        this.userCam.z += this.camVel.z * dt;
        const decay = Math.exp(-dt * 3.5);
        this.camVel.x *= decay;
        this.camVel.z *= decay;
      }
      this.clampUserCam();
      this.camTarget = { ...this.userCam };
    } else if (this.follow && this.userId) {
      let mine: Entity | null = null;
      for (const e of this.entities.values()) {
        if (e.ownerId === this.userId && !e.removed && e.target > 0 && e.pose && (!mine || e.releasedAtMs > mine.releasedAtMs)) mine = e;
      }
      if (mine?.pose) {
        const p = this.project(mine.pose.x, mine.pose.z);
        const outOfView = !p || p.sx < this.view.w * 0.18 || p.sx > this.view.w * 0.82 || p.zEff > 9;
        if (outOfView) this.followEngaged = true;
        if (this.followEngaged) {
          this.camTarget = { x: mine.pose.x * 0.85, z: Math.max(0, mine.pose.z - 6.5) };
        }
        const visibleNow = !!p && p.sx > 0 && p.sx < this.view.w;
        if (visibleNow !== this.ownerVisible) {
          this.ownerVisible = visibleNow;
          this.opts.onOwnerVisibility?.(visibleNow);
        }
      } else {
        this.followEngaged = false;
        this.camTarget = { x: 0, z: 0 };
      }
    } else {
      this.camTarget = { x: 0, z: 0 };
    }
    const k = 1 - Math.exp(-dt * (focus ? 2.2 : this.manual ? 12 : 0.8));
    this.cam.x += (this.camTarget.x - this.cam.x) * k;
    this.cam.z += (this.camTarget.z - this.cam.z) * k;
    void now;
  }

  private render(now: number) {
    const ctx = this.ctx;
    const v = this.view;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    this.water.draw(ctx, this.time);

    const projected: Array<{ e: Entity; sx: number; sy: number; size: number; zEff: number }> = [];
    for (const e of this.drawOrder) {
      const pose = e.pose!;
      const p = this.project(pose.x, pose.z);
      if (!p) {
        e.rect = null;
        continue;
      }
      const size = LANTERN_WORLD_SIZE * p.scale;
      if (p.sx < -size * 4 || p.sx > v.w + size * 4 || p.sy - size * 3 > v.h) {
        e.rect = null;
        continue;
      }
      projected.push({ e, sx: p.sx, sy: p.sy - pose.bob * p.scale, size, zEff: p.zEff });
    }

    // reflections first (they lie on the water under every lantern)
    for (const { e, sx, sy, size } of projected) {
      const pose = e.pose!;
      drawReflection(ctx, sx, sy + size * 0.06, size, e.light, pose.glow, pose.alpha * e.vis, this.time, e.seed);
    }

    // halos: one additive pass under all lanterns, dimmed when the front of the scene is crowded
    const crowd = projected.filter((p) => p.size > 40).length;
    const haloStrength = Math.max(0.35, Math.min(1, 10 / Math.max(1, crowd)));
    for (const { e, sx, sy, size } of projected) {
      const pose = e.pose!;
      const hl = this.hoverId === e.id || this.focusId === e.id ? 1.8 : 1;
      drawHalo(ctx, sx, sy - size * 0.6, size, e.light, pose.glow, pose.alpha * e.vis, haloStrength * hl);
    }

    for (const { e, sx, sy, size, zEff } of projected) {
      const pose = e.pose!;
      if (size >= TEXTURE_MIN_SIZE && e.texState === "idle") this.requestTextures(e);
      const isHover = this.hoverId === e.id;
      const isFocus = this.focusId === e.id;
      e.rect = drawLantern(ctx, {
        x: sx,
        y: sy,
        size,
        yaw: pose.yaw + this.orbit,
        pitch: pitchFor(v, zEff),
        roll: pose.roll,
        glow: pose.glow,
        alpha: pose.alpha * e.vis,
        design: e.design,
        shape: e.shape,
        light: e.light,
        effects: e.effects,
        offering: e.offering,
        textures: e.textures,
        time: this.time,
        halo: false,
        highlight: isHover || isFocus ? 1 : e.ownerId && e.ownerId === this.userId ? 0.35 : 0,
        seed: e.seed,
      });
    }

    this.drawRipples(ctx);
    this.particles.draw(ctx, v.w, v.h, this.time);

    if (this.vignette) ctx.drawImage(this.vignette, 0, 0, v.w, v.h);
    this.drawWishBubbles(ctx, projected);
    void now;
  }

  /**
   * "What did they wish for?" – speech bubbles float up above other people's lanterns, a few at a time
   * (the nearest ones), taking turns so the river never gets cluttered.
   */
  private bubbleFontRequested = false;

  private drawWishBubbles(ctx: CanvasRenderingContext2D, projected: Array<{ e: Entity; sx: number; size: number }>) {
    if (!this.bubbleFontRequested && typeof document !== "undefined" && document.fonts) {
      this.bubbleFontRequested = true;
      void document.fonts.load('400 13px "Sriracha"', "กขค").catch(() => undefined);
    }
    const fontsReady = typeof document === "undefined" || !document.fonts || document.fonts.check('13px "Sriracha"', "ก");
    const max = this.quality === "high" ? 30 : 18;
    const candidates = projected
      .filter(({ e, size }) => {
        const wish = e.visual?.wishMessage;
        return wish && e.doodleSeed == null && e.rect && size >= 14 && e.vis > 0.5 && (e.pose?.alpha ?? 0) > 0.4 && e.id !== this.focusId;
      })
      .sort((a, b) => b.size - a.size)
      .slice(0, max * 2);
    const placed: Array<{ x: number; y: number; w: number; h: number }> = [];
    let shown = 0;
    for (const { e, sx, size } of candidates) {
      if (shown >= max) break;
      const { alpha, rise } = bubblePhase(this.time, e.seed);
      if (alpha <= 0.01) continue;
      const text = e.visual!.wishMessage;
      let entry = this.bubbles.get(e.id);
      if (!entry || entry.text !== text || (!entry.sprite && fontsReady)) {
        if (!fontsReady && entry) continue;
        if (this.bubbles.size > 160) this.bubbles.clear();
        entry = { text, sprite: fontsReady ? buildWishBubble(text) : null };
        this.bubbles.set(e.id, entry);
      }
      const sp = entry.sprite;
      if (!sp) continue;
      // every lantern on screen shows its wish: far ones smaller, crowded ones stacked upwards
      const scale = Math.max(0.55, Math.min(1.1, size / 90));
      const w = sp.w * scale;
      const h = sp.h * scale;
      const x = Math.max(4, Math.min(this.view.w - w - 4, sx - w / 2));
      let y = Math.max(56, e.rect!.y - h - 6 - rise * scale);
      const hits = (yy: number) => placed.some((r) => x < r.x + r.w && x + w > r.x && yy < r.y + r.h && yy + h > r.y);
      for (let tries = 0; tries < 4 && hits(y) && y - h - 4 >= 56; tries++) y -= h + 4;
      placed.push({ x, y, w, h });
      ctx.globalAlpha = alpha * (e.pose?.alpha ?? 1);
      ctx.drawImage(sp.canvas, x, y, w, h);
      shown++;
    }
    ctx.globalAlpha = 1;
  }

  private monitorPerformance(dtMs: number) {
    if (!this.autoQuality || this.quality === "low") return;
    this.frameTimes.push(dtMs);
    if (this.frameTimes.length >= 90) {
      const sorted = [...this.frameTimes].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      this.frameTimes = [];
      if (median > 22 && document.visibilityState === "visible") this.setQuality("low");
    }
  }

  private hitTest(clientX: number, clientY: number): string | null {
    const r = this.canvas.getBoundingClientRect();
    const x = clientX - r.left;
    const y = clientY - r.top;
    for (let i = this.drawOrder.length - 1; i >= 0; i--) {
      const e = this.drawOrder[i];
      if (!e.rect || e.doodleSeed != null || e.vis < 0.5 || (e.pose?.alpha ?? 0) < 0.15) continue;
      const pad = Math.max(6, e.rect.w * 0.08);
      if (x >= e.rect.x - pad && x <= e.rect.x + e.rect.w + pad && y >= e.rect.y - pad && y <= e.rect.y + e.rect.h + pad) return e.id;
    }
    return null;
  }

  // ------------------------------------------------------------------ free camera input

  private clampUserCam() {
    this.userCam.x = Math.max(-11, Math.min(11, this.userCam.x));
    this.userCam.z = Math.max(-1.2, Math.min(17, this.userCam.z));
  }

  private startManual() {
    if (!this.manual) {
      this.manual = true;
      // continue from wherever the camera currently is
      this.userCam = { ...this.cam };
      this.opts.onUserNavigate?.();
    }
  }

  /** world units moved per screen pixel at a mid-distance reference depth */
  private get worldPerPx() {
    const ref = Math.max(2.5, 6 - this.cam.z * 0.2);
    return ref / this.view.focal;
  }

  private onPointerDown = (ev: PointerEvent) => {
    if (this.focusId) return;
    this.canvas.setPointerCapture?.(ev.pointerId);
    this.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (this.pointers.size === 1) {
      this.dragDistance = 0;
      this.camVel = { x: 0, z: 0 };
      this.orbitVel = 0;
      this.lastMoveT = performance.now();
    }
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };

  private onPointerUp = (ev: PointerEvent) => {
    this.pointers.delete(ev.pointerId);
    if (this.dragDistance > 8) this.suppressClick = true;
    if (this.pointers.size < 2) this.pinchDist = 0;
  };

  private onWheel = (ev: WheelEvent) => {
    if (this.focusId) return;
    ev.preventDefault();
    this.startManual();
    this.userCam.z -= ev.deltaY * 0.01;
    this.userCam.x += ev.deltaX * this.worldPerPx;
    this.clampUserCam();
  };

  private onKeyDown = (ev: KeyboardEvent) => {
    if (this.focusId) return;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-0.6, 0],
      ArrowRight: [0.6, 0],
      ArrowUp: [0, 0.9],
      ArrowDown: [0, -0.9],
    };
    const m = moves[ev.key];
    if (!m) return;
    ev.preventDefault();
    this.startManual();
    this.userCam.x += m[0];
    this.userCam.z += m[1];
    this.clampUserCam();
  };

  private onPointerMove = (ev: PointerEvent) => {
    const prev = this.pointers.get(ev.pointerId);
    if (prev) {
      const dx = ev.clientX - prev.x;
      const dy = ev.clientY - prev.y;
      this.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (this.pointers.size >= 2) {
        // pinch: fingers apart = move forward over the water
        const [a, b] = [...this.pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinchDist) {
          this.startManual();
          this.userCam.z += (dist - this.pinchDist) * 0.03;
          this.clampUserCam();
        }
        this.pinchDist = dist;
        this.dragDistance += 20;
        return;
      }
      this.dragDistance += Math.abs(dx) + Math.abs(dy);
      if (this.dragDistance > 8) {
        this.startManual();
        // grab-the-water feel: drag left → view moves right, drag down → glide forward
        // (360° turning happens on a single lantern in its card, not here)
        const sx = -dx * this.worldPerPx;
        const sz = (dy / Math.max(1, this.view.h)) * 14;
        this.userCam.x += sx;
        this.userCam.z += sz;
        this.clampUserCam();
        const now = performance.now();
        const dt = Math.max(0.008, (now - this.lastMoveT) / 1000);
        this.lastMoveT = now;
        this.camVel = { x: (sx / dt) * 0.6, z: (sz / dt) * 0.6 };
        this.canvas.style.cursor = "grabbing";
      }
      return;
    }
    if (ev.pointerType === "touch") return;
    const id = this.hitTest(ev.clientX, ev.clientY);
    if (id !== this.hoverId || this.canvas.style.cursor === "grabbing") {
      this.hoverId = id;
      this.canvas.style.cursor = id ? "pointer" : "grab";
      this.opts.onHoverChange?.(id);
    }
  };

  private onPointerLeave = () => {
    if (this.hoverId) {
      this.hoverId = null;
      this.canvas.style.cursor = "grab";
      this.opts.onHoverChange?.(null);
    }
  };

  private onClick = (ev: MouseEvent) => {
    // a drag is not a click
    if (this.suppressClick) {
      this.suppressClick = false;
      return;
    }
    // tap a lantern → open its card; tap the water → slap it and nudge nearby lanterns (this viewer only)
    const id = this.hitTest(ev.clientX, ev.clientY);
    if (id) this.opts.onLanternClick?.(id);
    else this.splashAt(ev.clientX, ev.clientY);
  };
}

export function toEngineLantern(l: {
  id: string;
  ownerId: string;
  releasedAt: string;
  expiresAt: string;
  design: LanternDesignId;
  color: string;
} & LanternVisual): EngineLantern {
  return {
    id: l.id,
    ownerId: l.ownerId,
    releasedAtMs: Date.parse(l.releasedAt),
    expiresAtMs: Date.parse(l.expiresAt),
    design: l.design,
    shape: l.shape ?? "box",
    light: l.color,
    effects: l.effects ?? [],
    offering: l.offering ?? 0,
    visual: l,
  };
}
