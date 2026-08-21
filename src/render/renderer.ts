/**
 * The compositor.
 *
 * `paintDocument` draws a whole map into a context that is already in map
 * coordinates. The editor calls it with the camera transform applied; the
 * exporters call it with a plain scale. One code path, so what you export is
 * exactly what you saw.
 */
import type { MapDocument, Layer, ObjectLayer, Selection, Rect, Wall, LightSource, MapNote } from '../core/types';
import { blendToComposite, isRaster, isObjectLayer } from '../core/types';
import { drawObject, resolveFill } from './objects';
import { objectBounds } from '../core/objectBounds';
import { drawGrid } from './grid';
import { getPattern } from './textures';
import { createSurface, ctxOf, type Surface } from '../util/canvas';
import { rgba, mix } from '../core/color';
import type { Camera } from '../core/camera';

export interface PaintOptions {
  paletteId: string;
  showGrid: boolean;
  showWalls: boolean;
  showLights: boolean;
  showNotes: boolean;
  /** Darkness + light falloff preview (also used by the "baked lighting" export). */
  showLightingPreview: boolean;
  forExport: boolean;
  /** Visible map-space rectangle; used to skip work when zoomed in. */
  clip?: Rect;
  zoom: number;
  /** Live stroke preview drawn on top of a specific layer. */
  liveLayerId?: string | null;
  liveSurface?: Surface | null;
  liveComposite?: GlobalCompositeOperation;
  /** Layers to skip (e.g. while isolating one for editing). */
  soloLayerId?: string | null;
  /** Draw the bright/dim rings around each light (only useful while editing them). */
  showLightRadii?: boolean;
  /** `player` omits every layer flagged GM-only. */
  audience?: 'gm' | 'player';
  /** Ids to highlight — the selection outline for walls, lights and notes. */
  highlightIds?: Set<string>;
}

export const DEFAULT_PAINT: PaintOptions = {
  paletteId: 'atlas',
  showGrid: true,
  showWalls: false,
  showLights: false,
  showNotes: true,
  showLightingPreview: false,
  forExport: false,
  zoom: 1,
  showLightRadii: false,
  audience: 'gm',
};

export function paintDocument(ctx: CanvasRenderingContext2D, doc: MapDocument, opts: Partial<PaintOptions> = {}): void {
  // The document knows its own palette; an explicit option still wins.
  const o: PaintOptions = { ...DEFAULT_PAINT, paletteId: doc.paletteId || DEFAULT_PAINT.paletteId, ...opts };

  // --- Background ---------------------------------------------------------
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, doc.width, doc.height);
  ctx.clip();

  if (doc.background.type !== 'none') {
    ctx.fillStyle = doc.background.type === 'texture'
      ? getPattern(ctx, doc.background.textureId || 'parchment', { paletteId: o.paletteId, scale: doc.background.textureScale ?? 1 })
      : doc.background.color;
    ctx.fillRect(0, 0, doc.width, doc.height);
  }

  // --- Layers -------------------------------------------------------------
  for (let i = 0; i < doc.layers.length; i++) {
    const layer = doc.layers[i];
    if (!layer.visible) continue;
    if (o.soloLayerId && layer.id !== o.soloLayerId) continue;
    if (o.audience === 'player' && layer.gmOnly) continue;
    paintLayer(ctx, doc, layer, o);
  }

  // --- Lighting preview ---------------------------------------------------
  if (o.showLightingPreview && doc.lighting.darkness > 0) {
    paintLighting(ctx, doc, o);
  }

  ctx.restore();

  // --- Grid ---------------------------------------------------------------
  if (o.showGrid) {
    drawGrid(ctx, doc.grid, o.clip || { x: 0, y: 0, w: doc.width, h: doc.height }, o.zoom);
  }

  // --- Editor overlays ----------------------------------------------------
  if (!o.forExport) {
    if (o.showWalls) paintWalls(ctx, doc, o);
    if (o.showLights) paintLightHandles(ctx, doc, o);
    if (o.showNotes) paintNotes(ctx, doc, o);
  }
}

function paintLayer(ctx: CanvasRenderingContext2D, doc: MapDocument, layer: Layer, o: PaintOptions): void {
  const isLive = o.liveLayerId === layer.id && o.liveSurface;

  if (isRaster(layer)) {
    // A scratch pass is needed when the layer clips to what is below it, or
    // when the live stroke erases (destination-out must not eat lower layers).
    const needsScratch = layer.clipToBelow || (isLive && o.liveComposite === 'destination-out');
    if (needsScratch) {
      // Composite onto a scratch surface so the clip is honoured.
      const scratch = createSurface(doc.width, doc.height);
      const sctx = ctxOf(scratch);
      sctx.drawImage(layer.surface, 0, 0);
      if (isLive) {
        sctx.globalCompositeOperation = o.liveComposite || 'source-over';
        sctx.drawImage(o.liveSurface!, 0, 0);
        sctx.globalCompositeOperation = 'source-over';
      }
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      ctx.globalCompositeOperation = blendToComposite(layer.blend);
      ctx.drawImage(scratch, 0, 0);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.globalAlpha = layer.opacity;
    ctx.globalCompositeOperation = blendToComposite(layer.blend);
    ctx.drawImage(layer.surface, 0, 0);
    if (isLive) {
      ctx.globalCompositeOperation = o.liveComposite || blendToComposite(layer.blend);
      ctx.drawImage(o.liveSurface!, 0, 0);
    }
    ctx.restore();
    return;
  }

  if (isObjectLayer(layer)) {
    ctx.save();
    ctx.globalAlpha = layer.opacity;
    ctx.globalCompositeOperation = blendToComposite(layer.blend);

    // A city can carry a thousand objects. Two cheap strategies keep the canvas
    // responsive: cache the whole layer to a bitmap while zoomed out (where the
    // resolution loss is invisible), and cull to the viewport while zoomed in
    // (where only a handful of objects are on screen anyway).
    const cached = !o.forExport && o.zoom <= 1 && layer.objects.length >= 60
      ? getLayerCache(layer, doc, o)
      : null;

    if (cached) {
      ctx.drawImage(cached, 0, 0);
    } else {
      const clip = o.clip;
      for (const obj of layer.objects) {
        if (clip && !o.forExport) {
          const b = objectBounds(obj, doc.grid);
          if (b.x > clip.x + clip.w || b.x + b.w < clip.x || b.y > clip.y + clip.h || b.y + b.h < clip.y) continue;
        }
        drawObject(ctx, obj, { paletteId: o.paletteId, forExport: o.forExport, grid: doc.grid });
      }
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Object-layer bitmap cache
// ---------------------------------------------------------------------------

interface LayerCacheEntry { surface: Surface; paletteId: string; width: number; height: number; }

/**
 * Keyed on the `objects` array itself. Every mutation replaces that array, so
 * the cache invalidates exactly when the layer's contents change and never
 * needs an explicit version counter.
 */
const layerCache = new WeakMap<object, LayerCacheEntry>();

function getLayerCache(layer: ObjectLayer, doc: MapDocument, o: PaintOptions): Surface | null {
  const hit = layerCache.get(layer.objects);
  if (hit && hit.paletteId === o.paletteId && hit.width === doc.width && hit.height === doc.height) {
    return hit.surface;
  }
  try {
    const surface = createSurface(doc.width, doc.height);
    const c = ctxOf(surface);
    for (const obj of layer.objects) {
      drawObject(c, obj, { paletteId: o.paletteId, forExport: false, grid: doc.grid });
    }
    layerCache.set(layer.objects, { surface, paletteId: o.paletteId, width: doc.width, height: doc.height });
    return surface;
  } catch {
    // Out of canvas memory on a huge document — fall back to direct drawing.
    return null;
  }
}

// ---------------------------------------------------------------------------
// Lighting
// ---------------------------------------------------------------------------

function paintLighting(ctx: CanvasRenderingContext2D, doc: MapDocument, o: PaintOptions): void {
  const lightLayer = doc.layers.find((l) => l.kind === 'light');
  const lights: LightSource[] = lightLayer && lightLayer.kind === 'light' ? lightLayer.lights : [];

  const scratch = createSurface(doc.width, doc.height);
  const s = ctxOf(scratch);
  s.fillStyle = rgba('#05070d', Math.min(0.94, doc.lighting.darkness));
  s.fillRect(0, 0, doc.width, doc.height);

  s.globalCompositeOperation = 'destination-out';
  for (const l of lights) {
    const r = Math.max(l.bright, l.dim);
    if (r <= 0) continue;
    const g = s.createRadialGradient(l.x, l.y, 0, l.x, l.y, r);
    const brightStop = Math.max(0.001, Math.min(0.98, l.bright / r));
    g.addColorStop(0, rgba('#ffffff', Math.min(1, l.intensity)));
    g.addColorStop(brightStop, rgba('#ffffff', Math.min(1, l.intensity) * 0.85));
    g.addColorStop(1, rgba('#ffffff', 0));
    s.fillStyle = g;
    s.beginPath();
    s.arc(l.x, l.y, r, 0, Math.PI * 2);
    s.fill();
  }
  s.globalCompositeOperation = 'source-over';

  ctx.drawImage(scratch, 0, 0);

  // Warm tint from each light on top of the darkness.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const l of lights) {
    const r = Math.max(l.bright, l.dim);
    if (r <= 0) continue;
    const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, r);
    g.addColorStop(0, rgba(l.color, 0.32 * l.intensity));
    g.addColorStop(1, rgba(l.color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(l.x, l.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Overlays (editor only)
// ---------------------------------------------------------------------------

export const WALL_COLORS: Record<Wall['kind'], string> = {
  wall: '#ff5a4a',
  door: '#4aa3ff',
  secretDoor: '#c46bff',
  window: '#4affd0',
  invisible: '#9aa4ad',
  terrain: '#7aff5a',
  ethereal: '#ffd24a',
};

function paintWalls(ctx: CanvasRenderingContext2D, doc: MapDocument, o: PaintOptions): void {
  const layer = doc.layers.find((l) => l.kind === 'wall');
  if (!layer || layer.kind !== 'wall' || !layer.visible) return;
  const lw = Math.max(1.5, 4 / o.zoom);
  ctx.save();
  ctx.lineCap = 'round';
  for (const w of layer.walls) {
    ctx.strokeStyle = WALL_COLORS[w.kind];
    ctx.lineWidth = lw;
    ctx.setLineDash(w.kind === 'secretDoor' ? [lw * 3, lw * 2] : w.kind === 'invisible' ? [lw * 1.5, lw * 1.5] : []);
    ctx.beginPath();
    ctx.moveTo(w.a.x, w.a.y);
    ctx.lineTo(w.b.x, w.b.y);
    ctx.stroke();
    ctx.setLineDash([]);
    // Endpoint handles
    ctx.fillStyle = '#ffffff';
    for (const p of [w.a, w.b]) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, lw * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    if (w.kind === 'door' || w.kind === 'secretDoor') {
      const mx = (w.a.x + w.b.x) / 2, my = (w.a.y + w.b.y) / 2;
      ctx.fillStyle = w.doorState === 'open' ? '#4affa0' : w.doorState === 'locked' ? '#ff4a4a' : WALL_COLORS[w.kind];
      ctx.beginPath();
      ctx.arc(mx, my, lw * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function paintLightHandles(ctx: CanvasRenderingContext2D, doc: MapDocument, o: PaintOptions): void {
  const layer = doc.layers.find((l) => l.kind === 'light');
  if (!layer || layer.kind !== 'light' || !layer.visible) return;
  const r = Math.max(4, 7 / o.zoom);
  ctx.save();
  for (const l of layer.lights) {
    const highlighted = o.highlightIds?.has(l.id);
    if (o.showLightRadii || highlighted) {
      ctx.strokeStyle = rgba(l.color, highlighted ? 0.9 : 0.55);
      ctx.lineWidth = Math.max(1, 1.5 / o.zoom);
      ctx.setLineDash([6 / o.zoom, 5 / o.zoom]);
      ctx.beginPath(); ctx.arc(l.x, l.y, l.bright, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([2 / o.zoom, 6 / o.zoom]);
      ctx.beginPath(); ctx.arc(l.x, l.y, l.dim, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    // The bulb itself is always a small solid dot; cheap to read, never noisy.
    ctx.fillStyle = l.color;
    ctx.beginPath(); ctx.arc(l.x, l.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.lineWidth = Math.max(1, 1.5 / o.zoom);
    ctx.stroke();
  }
  ctx.restore();
}

function paintNotes(ctx: CanvasRenderingContext2D, doc: MapDocument, o: PaintOptions): void {
  const layer = doc.layers.find((l) => l.kind === 'note');
  if (!layer || layer.kind !== 'note' || !layer.visible) return;
  const r = Math.max(8, 14 / o.zoom);
  ctx.save();
  for (const n of layer.notes) {
    ctx.fillStyle = n.color;
    ctx.strokeStyle = '#1b1712';
    ctx.lineWidth = Math.max(1, 2 / o.zoom);
    ctx.beginPath();
    ctx.moveTo(n.x, n.y);
    ctx.lineTo(n.x - r * 0.6, n.y - r * 1.2);
    ctx.arc(n.x, n.y - r * 1.2, r * 0.6, Math.PI, 0);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1b1712';
    ctx.font = `700 ${r * 0.8}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(n.icon || 'i', n.x, n.y - r * 1.2);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Screen rendering
// ---------------------------------------------------------------------------

export function renderToScreen(
  ctx: CanvasRenderingContext2D,
  doc: MapDocument,
  camera: Camera,
  opts: Partial<PaintOptions> = {},
): void {
  const { canvas } = ctx;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  ctx.save();
  ctx.translate(camera.viewW / 2, camera.viewH / 2);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  // Page shadow + edge so the canvas reads as a physical sheet.
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 26 / camera.zoom;
  ctx.shadowOffsetY = 8 / camera.zoom;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, doc.width, doc.height);
  ctx.restore();

  paintDocument(ctx, doc, { ...opts, clip: camera.visibleRect(), zoom: camera.zoom });

  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1 / camera.zoom;
  ctx.strokeRect(0, 0, doc.width, doc.height);

  ctx.restore();
}

/** Flatten the document into an offscreen surface — the export path. */
export function renderToSurface(
  doc: MapDocument,
  opts: Partial<PaintOptions> & { scale?: number; padding?: number } = {},
): Surface {
  const scale = opts.scale ?? 1;
  const pad = Math.round((opts.padding ?? 0) * scale);
  const surf = createSurface(Math.round(doc.width * scale) + pad * 2, Math.round(doc.height * scale) + pad * 2);
  const ctx = ctxOf(surf);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.save();
  ctx.translate(pad, pad);
  ctx.scale(scale, scale);
  paintDocument(ctx, doc, { ...opts, forExport: true, zoom: scale });
  ctx.restore();
  return surf;
}

/** Small thumbnail used by the project browser and the save file. */
export function renderThumbnail(doc: MapDocument, maxSide = 480, paletteId?: string): Surface {
  const scale = Math.min(maxSide / doc.width, maxSide / doc.height, 1);
  return renderToSurface(doc, {
    scale,
    paletteId: paletteId || doc.paletteId,
    showGrid: false, showWalls: false, showLights: false, showNotes: false,
  });
}
