/**
 * The brush engine.
 *
 * A stroke accumulates into an alpha mask, and the mask is composited with a
 * texture (or a flat colour) into a paint buffer. Working in two buffers is
 * what keeps a soft, overlapping stroke from building up dark seams where the
 * dabs overlap — the same trick a raster paint program uses.
 */
import type { Rect, Vec2 } from '../core/types';
import { createSurface, ctxOf, type Surface } from '../util/canvas';
import { getPattern, getTexture } from './textures';
import { RNG } from '../core/rng';
import { dist, lerpV } from '../core/geometry';
import { rgba } from '../core/color';
import { renderAsset } from '../assets/library';

export type BrushMode = 'texture' | 'color' | 'erase' | 'scatter' | 'blur' | 'darken' | 'lighten';

export interface BrushSettings {
  mode: BrushMode;
  /** Diameter in map pixels. */
  size: number;
  /** 0 = feathered to nothing, 1 = hard edge. */
  hardness: number;
  /** Final stroke alpha. */
  opacity: number;
  /** Per-dab alpha (build-up rate). */
  flow: number;
  /** Dab spacing as a fraction of the size. */
  spacing: number;
  /** Randomised offset perpendicular to the stroke, fraction of size. */
  jitter: number;
  /** Randomised per-dab size variation, 0..1. */
  sizeJitter: number;
  /** Wobble applied to the dab silhouette so edges are not perfect circles. */
  edgeNoise: number;
  textureId: string;
  textureScale: number;
  color: string;
  /** Scatter mode. */
  scatterAssetId: string;
  scatterDensity: number;
  scatterMinScale: number;
  scatterMaxScale: number;
  scatterRotate: boolean;
  /** Pen pressure influence on size (0..1). */
  pressureSize: number;
  pressureOpacity: number;
}

export const DEFAULT_BRUSH: BrushSettings = {
  mode: 'texture',
  size: 120,
  hardness: 0.5,
  opacity: 1,
  flow: 0.85,
  spacing: 0.16,
  jitter: 0.05,
  sizeJitter: 0.12,
  edgeNoise: 0.22,
  textureId: 'grass',
  textureScale: 1,
  color: '#7fa958',
  scatterAssetId: 'veg/tree-broadleaf',
  scatterDensity: 0.5,
  scatterMinScale: 0.6,
  scatterMaxScale: 1.2,
  scatterRotate: false,
  pressureSize: 0.5,
  pressureOpacity: 0.3,
};

export const BRUSH_PRESETS: { id: string; label: string; settings: Partial<BrushSettings> }[] = [
  { id: 'terrain-soft', label: 'Soft Terrain', settings: { mode: 'texture', hardness: 0.35, edgeNoise: 0.3, spacing: 0.14 } },
  { id: 'terrain-hard', label: 'Hard Terrain', settings: { mode: 'texture', hardness: 0.95, edgeNoise: 0.08, spacing: 0.1 } },
  { id: 'coastline', label: 'Coastline', settings: { mode: 'texture', hardness: 0.85, edgeNoise: 0.45, sizeJitter: 0.25, spacing: 0.12 } },
  { id: 'airbrush', label: 'Airbrush', settings: { mode: 'color', hardness: 0.05, flow: 0.12, opacity: 0.6, spacing: 0.06, edgeNoise: 0 } },
  { id: 'shadow', label: 'Shadow', settings: { mode: 'darken', hardness: 0.2, flow: 0.18, opacity: 0.5, spacing: 0.08, edgeNoise: 0.1 } },
  { id: 'highlight', label: 'Highlight', settings: { mode: 'lighten', hardness: 0.2, flow: 0.16, opacity: 0.45, spacing: 0.08, edgeNoise: 0.1 } },
  { id: 'forest-scatter', label: 'Scatter Forest', settings: { mode: 'scatter', size: 220, scatterDensity: 0.6, spacing: 0.35 } },
  { id: 'eraser-soft', label: 'Soft Eraser', settings: { mode: 'erase', hardness: 0.3, flow: 0.6, spacing: 0.1 } },
];

interface Dab { p: Vec2; size: number; alpha: number; seed: number; }

export class BrushStroke {
  readonly mask: Surface;
  readonly paint: Surface;
  private maskCtx: CanvasRenderingContext2D;
  private paintCtx: CanvasRenderingContext2D;
  private settings: BrushSettings;
  private paletteId: string;
  private rng: RNG;
  private last: Vec2 | null = null;
  private carry = 0;
  private pattern: CanvasPattern | null = null;
  dirty: Rect | null = null;
  private docW: number;
  private docH: number;
  /** Snapshot of the layer used by blur/darken/lighten modes. */
  private sourceRef: Surface | null = null;

  constructor(width: number, height: number, settings: BrushSettings, paletteId: string, seed = 1, source?: Surface) {
    this.docW = width;
    this.docH = height;
    this.settings = { ...settings };
    this.paletteId = paletteId;
    this.rng = new RNG(seed);
    this.mask = createSurface(width, height);
    this.paint = createSurface(width, height);
    this.maskCtx = ctxOf(this.mask);
    this.paintCtx = ctxOf(this.paint);
    this.sourceRef = source || null;
    if (settings.mode === 'texture') {
      this.pattern = getPattern(this.paintCtx, settings.textureId, {
        paletteId, scale: settings.textureScale, seed: 1,
      });
    }
  }

  get composite(): GlobalCompositeOperation {
    return this.settings.mode === 'erase' ? 'destination-out' : 'source-over';
  }

  begin(p: Vec2, pressure = 1): void {
    this.last = p;
    this.carry = 0;
    this.stamp(p, pressure);
  }

  move(p: Vec2, pressure = 1): void {
    if (!this.last) { this.begin(p, pressure); return; }
    const step = Math.max(1, this.settings.size * this.settings.spacing);
    let d = dist(this.last, p);
    if (d < 0.01) return;
    let t = 0;
    while (this.carry + (d - t) >= step) {
      t += step - this.carry;
      this.carry = 0;
      this.stamp(lerpV(this.last, p, t / d), pressure);
    }
    this.carry += d - t;
    this.last = p;
  }

  end(): void { this.last = null; }

  // -------------------------------------------------------------------------

  private markDirty(r: Rect): void {
    this.dirty = this.dirty ? {
      x: Math.min(this.dirty.x, r.x),
      y: Math.min(this.dirty.y, r.y),
      w: Math.max(this.dirty.x + this.dirty.w, r.x + r.w) - Math.min(this.dirty.x, r.x),
      h: Math.max(this.dirty.y + this.dirty.h, r.y + r.h) - Math.min(this.dirty.y, r.y),
    } : { ...r };
  }

  private stamp(p: Vec2, pressure: number): void {
    const s = this.settings;
    if (s.mode === 'scatter') { this.stampScatter(p); return; }

    const pr = 1 - s.pressureSize + s.pressureSize * pressure;
    const size = s.size * pr * (1 + this.rng.float(-s.sizeJitter, s.sizeJitter));
    const jx = this.rng.gauss(0, s.size * s.jitter);
    const jy = this.rng.gauss(0, s.size * s.jitter);
    const cx = p.x + jx, cy = p.y + jy;
    const r = size / 2;
    const alpha = s.flow * (1 - s.pressureOpacity + s.pressureOpacity * pressure);

    const rect: Rect = { x: cx - r - 2, y: cy - r - 2, w: r * 2 + 4, h: r * 2 + 4 };
    this.markDirty(rect);

    // --- Dab into the mask -------------------------------------------------
    const m = this.maskCtx;
    m.save();
    m.globalCompositeOperation = 'lighter';
    const g = m.createRadialGradient(cx, cy, 0, cx, cy, Math.max(0.5, r));
    const core = Math.max(0, Math.min(0.97, s.hardness));
    g.addColorStop(0, rgba('#ffffff', alpha));
    g.addColorStop(core, rgba('#ffffff', alpha));
    g.addColorStop(1, rgba('#ffffff', 0));
    m.fillStyle = g;
    if (s.edgeNoise > 0.001) {
      m.beginPath();
      const lobes = 9;
      const phase = this.rng.float(0, Math.PI * 2);
      for (let i = 0; i <= lobes; i++) {
        const a = (i / lobes) * Math.PI * 2;
        const wob = 1 + Math.sin(a * 3 + phase) * s.edgeNoise * 0.5 + Math.sin(a * 5 + phase * 1.7) * s.edgeNoise * 0.25;
        const x = cx + Math.cos(a) * r * wob;
        const y = cy + Math.sin(a) * r * wob;
        i === 0 ? m.moveTo(x, y) : m.lineTo(x, y);
      }
      m.closePath();
      m.fill();
    } else {
      m.beginPath();
      m.arc(cx, cy, r, 0, Math.PI * 2);
      m.fill();
    }
    m.restore();

    this.refreshPaint(rect);
  }

  /** Rebuild the coloured paint buffer for one dirty rectangle. */
  private refreshPaint(rect: Rect): void {
    const s = this.settings;
    const x = Math.max(0, Math.floor(rect.x));
    const y = Math.max(0, Math.floor(rect.y));
    const w = Math.min(this.docW - x, Math.ceil(rect.w + (rect.x - x)));
    const h = Math.min(this.docH - y, Math.ceil(rect.h + (rect.y - y)));
    if (w <= 0 || h <= 0) return;

    const tmp = createSurface(w, h);
    const t = ctxOf(tmp);

    if (s.mode === 'erase') {
      // The mask itself is the erasure; paint mirrors it in white.
      t.drawImage(this.mask, x, y, w, h, 0, 0, w, h);
    } else if (s.mode === 'texture' && this.pattern) {
      t.save();
      t.translate(-x, -y);
      t.fillStyle = this.pattern;
      t.fillRect(x, y, w, h);
      t.restore();
      t.globalCompositeOperation = 'destination-in';
      t.drawImage(this.mask, x, y, w, h, 0, 0, w, h);
    } else if (s.mode === 'darken' || s.mode === 'lighten') {
      t.fillStyle = s.mode === 'darken' ? '#000000' : '#ffffff';
      t.fillRect(0, 0, w, h);
      t.globalCompositeOperation = 'destination-in';
      t.drawImage(this.mask, x, y, w, h, 0, 0, w, h);
    } else if (s.mode === 'blur' && this.sourceRef) {
      t.filter = 'blur(4px)';
      t.drawImage(this.sourceRef, x, y, w, h, 0, 0, w, h);
      t.filter = 'none';
      t.globalCompositeOperation = 'destination-in';
      t.drawImage(this.mask, x, y, w, h, 0, 0, w, h);
    } else {
      t.fillStyle = s.color;
      t.fillRect(0, 0, w, h);
      t.globalCompositeOperation = 'destination-in';
      t.drawImage(this.mask, x, y, w, h, 0, 0, w, h);
    }

    this.paintCtx.save();
    this.paintCtx.clearRect(x, y, w, h);
    this.paintCtx.drawImage(tmp, x, y);
    this.paintCtx.restore();
  }

  private stampScatter(p: Vec2): void {
    const s = this.settings;
    const count = Math.max(1, Math.round(s.scatterDensity * 3));
    const R = s.size / 2;
    for (let i = 0; i < count; i++) {
      const ang = this.rng.float(0, Math.PI * 2);
      const rad = Math.sqrt(this.rng.next()) * R;
      const x = p.x + Math.cos(ang) * rad;
      const y = p.y + Math.sin(ang) * rad;
      const scale = this.rng.float(s.scatterMinScale, s.scatterMaxScale);
      const seed = this.rng.int(1, 1e6);
      const base = s.size * 0.35 * scale;
      const surf = renderAsset(s.scatterAssetId, {
        width: Math.max(4, base),
        paletteId: this.paletteId,
        seed,
        variant: seed % 8,
      });
      const dw = surf.width, dh = surf.height;
      this.paintCtx.save();
      this.paintCtx.globalAlpha = s.flow;
      this.paintCtx.translate(x, y);
      if (s.scatterRotate) this.paintCtx.rotate(this.rng.float(0, Math.PI * 2));
      this.paintCtx.drawImage(surf, -dw / 2, -dh / 2);
      this.paintCtx.restore();
      this.markDirty({ x: x - dw, y: y - dh, w: dw * 2, h: dh * 2 });
    }
  }

  /** Bake this stroke into a destination surface. */
  commit(target: Surface): Rect | null {
    if (!this.dirty) return null;
    const ctx = ctxOf(target);
    ctx.save();
    ctx.globalAlpha = this.settings.opacity;
    ctx.globalCompositeOperation = this.composite;
    ctx.drawImage(this.paint, 0, 0);
    ctx.restore();
    const r = this.dirty;
    return {
      x: Math.max(0, Math.floor(r.x - 2)),
      y: Math.max(0, Math.floor(r.y - 2)),
      w: Math.min(target.width, Math.ceil(r.w + 4)),
      h: Math.min(target.height, Math.ceil(r.h + 4)),
    };
  }
}

/** A round preview of the current brush for the toolbar. */
export function brushPreview(settings: BrushSettings, paletteId: string, box = 64): string {
  const s = createSurface(box, box);
  const ctx = ctxOf(s);
  const r = box * 0.44;
  if (settings.mode === 'texture') {
    ctx.fillStyle = getPattern(ctx, settings.textureId, { paletteId, scale: 0.35 });
  } else if (settings.mode === 'erase') {
    ctx.fillStyle = '#8a8a8a';
  } else if (settings.mode === 'darken') {
    ctx.fillStyle = '#111111';
  } else if (settings.mode === 'lighten') {
    ctx.fillStyle = '#ffffff';
  } else {
    ctx.fillStyle = settings.color;
  }
  ctx.beginPath();
  ctx.arc(box / 2, box / 2, r, 0, Math.PI * 2);
  ctx.fill();
  // Feather the rim according to hardness.
  const g = ctx.createRadialGradient(box / 2, box / 2, r * Math.min(0.95, settings.hardness), box / 2, box / 2, r);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(box / 2, box / 2, r, 0, Math.PI * 2);
  ctx.fill();
  return s.toDataURL('image/png');
}
