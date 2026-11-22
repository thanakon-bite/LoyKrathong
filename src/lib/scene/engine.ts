import type { Decoration, LanternDesignId, LanternVisual } from "@/types/lantern";
import { hashString } from "@/lib/utils";
import { LANTERN_LIFETIME_MS, lanternPose, type LanternPose } from "@/lib/lantern/motion";
import { drawHalo, drawLantern, drawReflection, type ScreenRect } from "@/lib/lantern/render";
import { buildFaceTextures, ensureLanternFonts, loadImage, type FaceTextures } from "@/lib/lantern/texture";
import { MAX_VISIBLE_LANTERNS, selectVisibleLanterns } from "@/lib/lantern/selection";
import { LANTERN_DESIGNS } from "@/lib/lantern/designs";
import { WaterBackground } from "./water";
import { Particles } from "./particles";
import { buildDoodleTextures } from "./doodles";
import { computeView, LANTERN_WORLD_SIZE, pitchFor, projectPoint, type Camera, type View } from "./view";

export interface EngineLantern {
  id: string;
  ownerId: string;
  releasedAtMs: number;
  expiresAtMs: number;
  design: LanternDesignId;
  light: string;
  decoration: Decoration | null;
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
}

export type Quality = "high" | "low";

export interface EngineOptions {
  interactive?: boolean;
  quality?: Quality | "auto";
  maxVisible?: number;
  onLanternClick?: (id: string) => void;
  onHoverChange?: (id: string | null) => void;
  /** Called when the owner's lantern is visible on screen (for UI hints) */
  onOwnerVisibility?: (visible: boolean) => void;
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
  return cores <= 4 || mem <= 4 || reduced ? "low" : "high";
}

export class FestivalEngine {
  private ctx: CanvasRenderingContext2D;
  private entities = new Map<string, Entity>();
  private water: WaterBackground;
  private particles: Particles;
  private pool = new TexturePool();
  private view: View = computeView(1, 1);
  private cam: Camera = { x: 0, z: 0 };
  private camTarget: Camera = { x: 0, z: 0 };
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
      canvas.addEventListener("pointermove", this.onPointerMove);
      canvas.addEventListener("pointerleave", this.onPointerLeave);
      canvas.addEventListener("click", this.onClick);
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
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.canvas.removeEventListener("click", this.onClick);
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
      const age = ((i + 0.5) / count) * 27 * 60 * 1000;
      list.push({
        id: `deco-${i}`,
        ownerId: "",
        releasedAtMs: now - age,
        expiresAtMs: Number.POSITIVE_INFINITY,
        design,
        light: LANTERN_DESIGNS[design].defaultLight,
        decoration: null,
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
    const maxDpr = this.quality === "high" ? 2 : 1.25;
    this.dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, maxDpr);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.view = computeView(w, h);
    this.water.resize(this.view, this.dpr);
  };

  private setQuality(q: Quality) {
    if (q === this.quality) return;
    this.quality = q;
    this.water.setQuality(q === "high" ? 90 : 40);
    this.particles.setCount(q === "high" ? 38 : 14);
    this.resize();
  }

  private ageOf(e: Entity, now: number) {
    const ref = e.pausedAt ?? now;
    return ref - e.releasedAtMs - e.pauseMs;
  }

  private select(now: number) {
    // loop decorative lanterns
    for (const e of this.entities.values()) {
      if (e.doodleSeed != null && now - e.releasedAtMs > LANTERN_LIFETIME_MS - 10_000) {
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
        const p = projectPoint(this.view, this.cam, pose.x, pose.z);
        return !!p && p.sx > -this.view.w * 0.1 && p.sx < this.view.w * 1.1;
      },
    });
    const ids = new Set(chosen.map((c) => c.id));
    for (const e of this.entities.values()) e.target = ids.has(e.id) ? 1 : 0;
  }

  private requestTextures(e: Entity) {
    if (e.texState !== "idle") return;
    if (e.doodleSeed != null) {
      e.textures = buildDoodleTextures(e.doodleSeed, this.quality === "high" ? 0.4 : 0.3);
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
      resolution: this.quality === "high" ? 0.5 : 0.35,
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
      list.push(e);
    }
    // strict cap: selected lanterns first, then the strongest fading ones
    if (list.length > this.max) {
      list.sort((a, b) => b.target - a.target || b.vis - a.vis);
      list.length = this.max;
    }
    list.sort((a, b) => b.pose!.z - a.pose!.z);
    this.drawOrder = list;

    this.updateCamera(dt, now);
    this.render(now);
  };

  private updateCamera(dt: number, now: number) {
    const focus = this.focusId ? this.entities.get(this.focusId) : null;
    if (focus?.pose) {
      this.camTarget = { x: focus.pose.x, z: focus.pose.z - 2.4 };
    } else if (this.follow && this.userId) {
      let mine: Entity | null = null;
      for (const e of this.entities.values()) {
        if (e.ownerId === this.userId && !e.removed && e.target > 0 && e.pose && (!mine || e.releasedAtMs > mine.releasedAtMs)) mine = e;
      }
      if (mine?.pose) {
        const p = projectPoint(this.view, this.cam, mine.pose.x, mine.pose.z);
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
    const k = 1 - Math.exp(-dt * (focus ? 2.2 : 0.8));
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
      const p = projectPoint(v, this.cam, pose.x, pose.z);
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
        yaw: pose.yaw,
        pitch: pitchFor(v, zEff),
        roll: pose.roll,
        glow: pose.glow,
        alpha: pose.alpha * e.vis,
        design: e.design,
        light: e.light,
        decoration: e.decoration,
        textures: e.textures,
        time: this.time,
        halo: false,
        highlight: isHover || isFocus ? 1 : e.ownerId && e.ownerId === this.userId ? 0.35 : 0,
        seed: e.seed,
      });
    }

    this.particles.draw(ctx, v.w, v.h, this.time);

    // soft vignette
    const vg = ctx.createRadialGradient(v.w / 2, v.h * 0.55, Math.min(v.w, v.h) * 0.35, v.w / 2, v.h * 0.55, Math.max(v.w, v.h) * 0.8);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, v.w, v.h);
    void now;
  }

  private monitorPerformance(dtMs: number) {
    if (!this.autoQuality || this.quality === "low") return;
    this.frameTimes.push(dtMs);
    if (this.frameTimes.length >= 120) {
      const sorted = [...this.frameTimes].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      this.frameTimes = [];
      if (median > 26 && document.visibilityState === "visible") this.setQuality("low");
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

  private onPointerMove = (ev: PointerEvent) => {
    if (ev.pointerType === "touch") return;
    const id = this.hitTest(ev.clientX, ev.clientY);
    if (id !== this.hoverId) {
      this.hoverId = id;
      this.canvas.style.cursor = id ? "pointer" : "default";
      this.opts.onHoverChange?.(id);
    }
  };

  private onPointerLeave = () => {
    if (this.hoverId) {
      this.hoverId = null;
      this.canvas.style.cursor = "default";
      this.opts.onHoverChange?.(null);
    }
  };

  private onClick = (ev: MouseEvent) => {
    const id = this.hitTest(ev.clientX, ev.clientY);
    if (id) this.opts.onLanternClick?.(id);
  };
}

export function toEngineLantern(l: {
  id: string;
  ownerId: string;
  releasedAt: string;
  expiresAt: string;
  design: LanternDesignId;
  color: string;
  decoration: Decoration | null;
} & LanternVisual): EngineLantern {
  return {
    id: l.id,
    ownerId: l.ownerId,
    releasedAtMs: Date.parse(l.releasedAt),
    expiresAtMs: Date.parse(l.expiresAt),
    design: l.design,
    light: l.color,
    decoration: l.decoration,
    visual: l,
  };
}
