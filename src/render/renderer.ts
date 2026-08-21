/**
 * The compositor.
 *
 * `paintDocument` draws a whole map into a context that is already in map
 * coordinates. The editor calls it with the camera transform applied; the
 * exporters call it with a plain scale. One code path, so what you export is
 * exactly what you saw.
 */
import type { MapDocument, Layer, ObjectLayer, Selection, Rect, Wall, LightSource, MapNote, Vec2 } from '../core/types';
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
  // Everything that lives in the world first, then the darkness, then the
  // annotations that sit on top of it.
  const lit = o.showLightingPreview && doc.lighting.darkness > 0;
  const visible = doc.layers.filter((layer) => {
    if (!layer.visible) return false;
    if (o.soloLayerId && layer.id !== o.soloLayerId) return false;
    if (o.audience === 'player' && layer.gmOnly) return false;
    return true;
  });

  for (const layer of visible) {
    if (lit && layer.aboveLighting) continue;
    paintLayer(ctx, doc, layer, o);
  }

  // --- Lighting preview ---------------------------------------------------
  if (lit) {
    paintLighting(ctx, doc, o);
    for (const layer of visible) {
      if (layer.aboveLighting) paintLayer(ctx, doc, layer, o);
    }
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

/**
 * Darkness with light cast from each source, occluded by the walls.
 *
 * Without occlusion this pass draws a radial gradient per light and lets it
 * through everything: torchlight pours out through the walls and floods the
 * solid rock beyond, so a dungeon exported with baked lighting comes out as a
 * bright orange page with a dungeon-shaped smudge in the middle. That is the
 * opposite of what the option is for.
 *
 * Each light therefore gets its own visibility mask: the gradient, minus a
 * shadow quad projected away from the light behind every sight-blocking wall
 * within its radius. The masks are carved out of the darkness and, separately,
 * tinted in — so a torch lights the room it is in, throws a wedge of light
 * through an open door, and stops at the wall.
 */
function paintLighting(ctx: CanvasRenderingContext2D, doc: MapDocument, o: PaintOptions): void {
  const lightLayer = doc.layers.find((l) => l.kind === 'light');
  const lights: LightSource[] = lightLayer && lightLayer.kind === 'light' ? lightLayer.lights : [];

  // Only walls that block sight cast shadows, and an open door does not.
  const wallLayer = doc.layers.find((l) => l.kind === 'wall');
  const occluders: Wall[] = wallLayer && wallLayer.kind === 'wall'
    ? wallLayer.walls.filter((w) => w.blocksSight && w.doorState !== 'open')
    : [];

  const darkness = createSurface(doc.width, doc.height);
  const d = ctxOf(darkness);
  d.fillStyle = rgba('#05070d', Math.min(0.94, doc.lighting.darkness));
  d.fillRect(0, 0, doc.width, doc.height);

  const tint = createSurface(doc.width, doc.height);
  const t = ctxOf(tint);

  // Two scratch surfaces, reused and cleared per light over its own bounds only.
  const scratch = createSurface(doc.width, doc.height);
  const sc = ctxOf(scratch);
  const soft = createSurface(doc.width, doc.height);
  const so = ctxOf(soft);

  // Penumbra. A shadow cast from a wall traced along cell edges has a razor
  // edge that runs at right angles, which on a cave — where the painted rock is
  // organic but the wall segments are still the cell staircase underneath —
  // lights the floor in hard rectangles. Real torchlight has a soft edge
  // anyway, so blurring the visibility mask is both correct and the fix.
  const cellPx = doc.grid.size || 70;

  for (const l of lights) {
    const r = Math.max(l.bright, l.dim);
    if (r <= 0) continue;

    // A big light gets a wide penumbra; a candle gets a narrow one.
    const penumbra = Math.min(cellPx * 1.1, Math.max(cellPx * 0.3, r * 0.14));
    const pad = Math.ceil(penumbra * 2) + 2;
    const x0 = Math.max(0, Math.floor(l.x - r) - pad);
    const y0 = Math.max(0, Math.floor(l.y - r) - pad);
    const x1 = Math.min(doc.width, Math.ceil(l.x + r) + pad);
    const y1 = Math.min(doc.height, Math.ceil(l.y + r) + pad);
    if (x1 <= x0 || y1 <= y0) continue;
    sc.clearRect(x0, y0, x1 - x0, y1 - y0);

    // The light itself, as a white visibility field.
    const brightStop = Math.max(0.001, Math.min(0.98, l.bright / r));
    // Capped below full opacity so even the brightest spot keeps a trace of the
    // darkness. Carving a light all the way to zero leaves a flat white hole
    // that reads as a hole in the image rather than as a lit floor.
    const peak = Math.min(0.9, l.intensity);
    const g = sc.createRadialGradient(l.x, l.y, 0, l.x, l.y, r);
    g.addColorStop(0, rgba('#ffffff', peak));
    g.addColorStop(brightStop, rgba('#ffffff', peak * 0.85));
    g.addColorStop(1, rgba('#ffffff', 0));
    sc.fillStyle = g;
    sc.beginPath();
    sc.arc(l.x, l.y, r, 0, Math.PI * 2);
    sc.fill();

    // Cone lights: keep only the wedge.
    if (l.angle > 0 && l.angle < 360) {
      sc.save();
      sc.globalCompositeOperation = 'destination-in';
      const half = (l.angle * Math.PI) / 360;
      const rot = (l.rotation * Math.PI) / 180;
      sc.beginPath();
      sc.moveTo(l.x, l.y);
      sc.arc(l.x, l.y, r, rot - half, rot + half);
      sc.closePath();
      sc.fillStyle = '#ffffff';
      sc.fill();
      sc.restore();
    }

    // Shadows. Projecting to `r * 2.5` past each endpoint is comfortably
    // outside the light's own circle, so the quad always covers everything
    // the wall can hide without needing a real infinite projection.
    sc.save();
    sc.globalCompositeOperation = 'destination-out';
    sc.fillStyle = '#000000';
    const reach = r * 2.5;
    for (const w of occluders) {
      if (!segmentNearPoint(w.a, w.b, l.x, l.y, r)) continue;
      const ax = w.a.x - l.x, ay = w.a.y - l.y;
      const bx = w.b.x - l.x, by = w.b.y - l.y;
      const la = Math.hypot(ax, ay) || 1;
      const lb = Math.hypot(bx, by) || 1;
      sc.beginPath();
      sc.moveTo(w.a.x, w.a.y);
      sc.lineTo(w.b.x, w.b.y);
      sc.lineTo(l.x + (bx / lb) * reach, l.y + (by / lb) * reach);
      sc.lineTo(l.x + (ax / la) * reach, l.y + (ay / la) * reach);
      sc.closePath();
      sc.fill();
    }
    sc.restore();

    // Soften the mask, then use it for both passes.
    so.save();
    so.clearRect(x0, y0, x1 - x0, y1 - y0);
    so.filter = `blur(${penumbra}px)`;
    so.drawImage(scratch, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
    so.filter = 'none';
    so.restore();

    // Carve this light out of the darkness…
    d.save();
    d.globalCompositeOperation = 'destination-out';
    d.drawImage(soft, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
    d.restore();

    // …and add its colour, using the same mask so the tint respects the walls.
    t.save();
    t.globalCompositeOperation = 'lighter';
    t.globalAlpha = 0.38 * Math.min(1, l.intensity);
    t.drawImage(soft, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
    t.globalCompositeOperation = 'source-in';
    t.globalAlpha = 1;
    t.fillStyle = l.color;
    t.fillRect(x0, y0, x1 - x0, y1 - y0);
    t.restore();
  }

  ctx.drawImage(darkness, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(tint, 0, 0);
  ctx.restore();
}

/** Is any part of segment ab within `r` of (px, py)? */
function segmentNearPoint(a: Vec2, b: Vec2, px: number, py: number, r: number): boolean {
  const abx = b.x - a.x, aby = b.y - a.y;
  const l2 = abx * abx + aby * aby;
  let tt = l2 ? ((px - a.x) * abx + (py - a.y) * aby) / l2 : 0;
  tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
  const cx = a.x + tt * abx, cy = a.y + tt * aby;
  return Math.hypot(px - cx, py - cy) <= r;
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
