/** Brush, eraser, flood fill and eyedropper. */
import type { Tool, PointerCtx } from './types';
import { BrushStroke } from '../render/brush';
import { isRaster } from '../core/types';
import type { Rect, Vec2 } from '../core/types';
import { getTexture } from '../render/textures';
import { createSurface, ctxOf } from '../util/canvas';
import { renderToSurface } from '../render/renderer';
import { pointToHex, hexCenter, hexCorners } from '../render/grid';
import { boundsOf } from '../core/geometry';
import { snapshotRect, clampRect } from '../core/history';
import { toHex } from '../core/color';

function beginStroke(c: PointerCtx, erase: boolean): void {
  const { editor } = c;
  const layer = editor.activeRaster;
  if (!layer) {
    editor.status('Select a paint layer first — object layers cannot be painted on.');
    return;
  }
  if (layer.locked) { editor.status('That layer is locked.'); return; }

  const settings = erase ? { ...editor.brush, mode: 'erase' as const } : editor.brush;
  editor.stroke = new BrushStroke(
    editor.doc.width, editor.doc.height, settings, editor.paletteId,
    Math.floor(Math.random() * 1e9), layer.surface,
  );
  editor.strokeLayerId = layer.id;
  editor.stroke.begin(c.map, c.pressure);
  editor.emitChange();
}

function endStroke(editor: PointerCtx['editor'], label: string): void {
  const stroke = editor.stroke;
  const layer = editor.doc.layers.find((l) => l.id === editor.strokeLayerId);
  editor.stroke = null;
  editor.strokeLayerId = null;
  if (!stroke || !layer || !isRaster(layer) || !stroke.dirty) { editor.emitChange(); return; }

  const rect: Rect = {
    x: stroke.dirty.x - 2, y: stroke.dirty.y - 2,
    w: stroke.dirty.w + 4, h: stroke.dirty.h + 4,
  };
  editor.paint(label, layer, rect, () => { stroke.commit(layer.surface); });
}

export const brushTool: Tool = {
  id: 'brush',
  label: 'Terrain Brush',
  shortcut: 'b',
  cursor: 'crosshair',
  hint: 'Paint terrain. [ and ] change size, Shift+drag paints a straight line.',
  onPointerDown(c) { if (c.button === 0) beginStroke(c, false); },
  onPointerMove(c) {
    if (!c.editor.stroke) return;
    c.editor.stroke.move(c.map, c.pressure);
    c.editor.emitChange();
  },
  onPointerUp(c) { if (c.editor.stroke) endStroke(c.editor, 'Paint'); },
};

export const eraserTool: Tool = {
  id: 'eraser',
  label: 'Eraser',
  shortcut: 'e',
  cursor: 'crosshair',
  hint: 'Erase from the active paint layer.',
  onPointerDown(c) { if (c.button === 0) beginStroke(c, true); },
  onPointerMove(c) {
    if (!c.editor.stroke) return;
    c.editor.stroke.move(c.map, c.pressure);
    c.editor.emitChange();
  },
  onPointerUp(c) { if (c.editor.stroke) endStroke(c.editor, 'Erase'); },
};

// ---------------------------------------------------------------------------
// Flood fill
// ---------------------------------------------------------------------------

/**
 * Scanline flood fill over the active layer's alpha+colour, then paints the
 * chosen texture through the resulting mask.
 */
function floodFill(c: PointerCtx): void {
  const { editor } = c;
  const layer = editor.activeRaster;
  if (!layer || layer.locked) { editor.status('Flood fill needs an unlocked paint layer.'); return; }

  const W = layer.surface.width, H = layer.surface.height;
  const sx = Math.round(c.map.x), sy = Math.round(c.map.y);
  if (sx < 0 || sy < 0 || sx >= W || sy >= H) return;

  const src = layer.surface.getContext('2d', { willReadFrequently: true })!;
  const img = src.getImageData(0, 0, W, H);
  const data = img.data;
  const idx = (x: number, y: number) => (y * W + x) * 4;

  const start = idx(sx, sy);
  const target = [data[start], data[start + 1], data[start + 2], data[start + 3]];
  const tol = 32;

  const match = (i: number) =>
    Math.abs(data[i] - target[0]) <= tol &&
    Math.abs(data[i + 1] - target[1]) <= tol &&
    Math.abs(data[i + 2] - target[2]) <= tol &&
    Math.abs(data[i + 3] - target[3]) <= tol;

  const mask = createSurface(W, H);
  const mctx = ctxOf(mask);
  const maskImg = mctx.createImageData(W, H);
  const md = maskImg.data;

  const visited = new Uint8Array(W * H);
  const stack: number[] = [sx, sy];
  let minX = sx, minY = sy, maxX = sx, maxY = sy;

  while (stack.length) {
    const y = stack.pop()!;
    let x = stack.pop()!;
    if (visited[y * W + x]) continue;
    // Walk left.
    while (x >= 0 && !visited[y * W + x] && match(idx(x, y))) x--;
    x++;
    let spanUp = false, spanDown = false;
    while (x < W && !visited[y * W + x] && match(idx(x, y))) {
      visited[y * W + x] = 1;
      const mi = idx(x, y);
      md[mi] = 255; md[mi + 1] = 255; md[mi + 2] = 255; md[mi + 3] = 255;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (y > 0) {
        const up = match(idx(x, y - 1)) && !visited[(y - 1) * W + x];
        if (up && !spanUp) { stack.push(x, y - 1); spanUp = true; }
        else if (!up) spanUp = false;
      }
      if (y < H - 1) {
        const dn = match(idx(x, y + 1)) && !visited[(y + 1) * W + x];
        if (dn && !spanDown) { stack.push(x, y + 1); spanDown = true; }
        else if (!dn) spanDown = false;
      }
      x++;
    }
  }

  mctx.putImageData(maskImg, 0, 0);

  const fill = createSurface(W, H);
  const fctx = ctxOf(fill);
  const b = editor.brush;
  if (b.mode === 'texture') {
    const tile = getTexture(b.textureId, { paletteId: editor.paletteId });
    const pat = fctx.createPattern(tile, 'repeat')!;
    if (b.textureScale !== 1 && typeof DOMMatrix !== 'undefined') pat.setTransform(new DOMMatrix().scaleSelf(b.textureScale, b.textureScale));
    fctx.fillStyle = pat;
  } else {
    fctx.fillStyle = b.color;
  }
  fctx.fillRect(0, 0, W, H);
  fctx.globalCompositeOperation = 'destination-in';
  fctx.drawImage(mask, 0, 0);

  const rect: Rect = { x: minX - 1, y: minY - 1, w: maxX - minX + 3, h: maxY - minY + 3 };
  editor.paint('Flood Fill', layer, rect, () => {
    const ctx = ctxOf(layer.surface);
    ctx.save();
    ctx.globalAlpha = b.opacity;
    ctx.drawImage(fill, 0, 0);
    ctx.restore();
  });
}

// ---------------------------------------------------------------------------
// Cell fill — one grid cell (square or hex) at a time
// ---------------------------------------------------------------------------

export interface FillSettings {
  /** `flood` spreads over matching pixels, `cell` paints single grid cells,
   *  `all` covers the whole layer. */
  mode: 'flood' | 'cell' | 'all';
  /** Cell mode: soften the cell edge by this fraction of a cell. */
  feather: number;
}

export const fillSettings: FillSettings = { mode: 'flood', feather: 0 };

let cellDragging = false;
const paintedCells = new Set<string>();

/** Cover the entire active layer. */
function fillAll(c: PointerCtx): void {
  const { editor } = c;
  const layer = editor.activeRaster;
  if (!layer || layer.locked) { editor.status('Flood fill needs an unlocked paint layer.'); return; }
  const b = editor.brush;
  editor.paint('Fill Layer', layer, { x: 0, y: 0, w: layer.surface.width, h: layer.surface.height }, () => {
    const ctx = ctxOf(layer.surface);
    ctx.save();
    ctx.globalAlpha = b.opacity;
    if (b.mode === 'texture') {
      const tile = getTexture(b.textureId, { paletteId: editor.paletteId });
      const pat = ctx.createPattern(tile, 'repeat')!;
      if (b.textureScale !== 1 && typeof DOMMatrix !== 'undefined') {
        pat.setTransform(new DOMMatrix().scaleSelf(b.textureScale, b.textureScale));
      }
      ctx.fillStyle = pat;
    } else {
      ctx.fillStyle = b.color;
    }
    ctx.fillRect(0, 0, layer.surface.width, layer.surface.height);
    ctx.restore();
  });
}

export const fillTool: Tool = {
  id: 'fill',
  label: 'Fill',
  shortcut: 'g',
  cursor: 'crosshair',
  hint: 'Flood a region, paint single grid cells, or cover the whole layer — pick the mode in the options bar.',
  onPointerDown(c) {
    if (c.button !== 0) return;
    if (fillSettings.mode === 'all') { fillAll(c); return; }
    if (fillSettings.mode === 'cell') {
      const layer = c.editor.activeRaster;
      if (!layer) { c.editor.status('Cell fill needs a paint layer.'); return; }
      if (c.editor.doc.grid.type === 'none') { c.editor.status('Cell fill needs a grid — turn one on in the Map tab.'); return; }
      cellDragging = true;
      paintedCells.clear();
      // One undo step for the whole drag, however many cells it covers.
      c.editor.history.begin('Fill cells');
      paintOneCell(c);
      return;
    }
    floodFill(c);
  },
  onPointerMove(c) {
    if (cellDragging) paintOneCell(c);
  },
  onPointerUp(c) {
    if (!cellDragging) return;
    cellDragging = false;
    paintedCells.clear();
    c.editor.history.commit('Fill cells');
    c.editor.emitChange();
  },
};

/**
 * Paint one grid cell, recording exactly one history patch for it.
 *
 * The cell key is checked first so that dragging back over ground you have
 * already covered costs nothing and does not stack no-op undo patches.
 */
function paintOneCell(c: PointerCtx): void {
  const { editor } = c;
  const layer = editor.activeRaster;
  if (!layer) return;

  const geom = cellGeometry(c);
  if (!geom || paintedCells.has(geom.key)) return;
  paintedCells.add(geom.key);

  const rect = clampRect(
    { x: geom.bounds.x - 3, y: geom.bounds.y - 3, w: geom.bounds.w + 6, h: geom.bounds.h + 6 },
    layer.surface.width, layer.surface.height,
  );
  const before = snapshotRect(layer.surface, rect);
  paintPolygon(editor, layer.surface, geom.poly, geom.bounds);
  const after = snapshotRect(layer.surface, rect);
  editor.history.push({ kind: 'raster', layerId: layer.id, rect, before, after });
  editor.markDirty();
  editor.emitChange();
}

interface CellGeometry { key: string; poly: Vec2[]; bounds: Rect; }

function cellGeometry(c: PointerCtx): CellGeometry | null {
  const g = c.editor.doc.grid;
  if (g.type === 'none') return null;

  if (g.type === 'hexPointy' || g.type === 'hexFlat') {
    const cell = pointToHex(c.map, g);
    const poly = hexCorners(hexCenter(cell.col, cell.row, g), g);
    return { key: `${cell.col},${cell.row}`, poly, bounds: boundsOf(poly) };
  }

  const col = Math.floor((c.map.x - g.offsetX) / g.size);
  const row = Math.floor((c.map.y - g.offsetY) / g.size);
  const x = col * g.size + g.offsetX;
  const y = row * g.size + g.offsetY;
  const poly: Vec2[] = [
    { x, y }, { x: x + g.size, y }, { x: x + g.size, y: y + g.size }, { x, y: y + g.size },
  ];
  return { key: `${col},${row}`, poly, bounds: { x, y, w: g.size, h: g.size } };
}

function paintPolygon(editor: PointerCtx['editor'], surface: HTMLCanvasElement, poly: Vec2[], bounds: Rect): void {
  const b = editor.brush;
  const ctx = ctxOf(surface);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(poly[0].x, poly[0].y);
  for (const p of poly.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.closePath();
  ctx.clip();
  ctx.globalAlpha = b.opacity;
  if (b.mode === 'erase') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000000';
  } else if (b.mode === 'texture') {
    const tile = getTexture(b.textureId, { paletteId: editor.paletteId });
    const pat = ctx.createPattern(tile, 'repeat')!;
    if (b.textureScale !== 1 && typeof DOMMatrix !== 'undefined') {
      pat.setTransform(new DOMMatrix().scaleSelf(b.textureScale, b.textureScale));
    }
    ctx.fillStyle = pat;
  } else {
    ctx.fillStyle = b.color;
  }
  ctx.fillRect(bounds.x - 2, bounds.y - 2, bounds.w + 4, bounds.h + 4);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Eyedropper
// ---------------------------------------------------------------------------

export const eyedropperTool: Tool = {
  id: 'eyedropper',
  label: 'Eyedropper',
  shortcut: 'i',
  cursor: 'crosshair',
  hint: 'Sample a colour from the flattened map into the brush.',
  onPointerDown(c) {
    const { editor } = c;
    const x = Math.round(c.map.x), y = Math.round(c.map.y);
    if (x < 0 || y < 0 || x >= editor.doc.width || y >= editor.doc.height) return;

    // Flatten only the raster layers — that is what "the colour under the
    // cursor" means when you are matching terrain you have already painted.
    const win = 3;
    const surf = createSurface(editor.doc.width, editor.doc.height);
    const ctx = ctxOf(surf);
    for (const l of editor.doc.layers) {
      if (l.kind === 'raster' && l.visible) {
        ctx.globalAlpha = l.opacity;
        ctx.drawImage(l.surface, 0, 0);
      }
    }
    const d = ctx.getImageData(Math.max(0, x - win), Math.max(0, y - win), win * 2, win * 2).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 8) continue;
      r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
    }
    if (!n) { editor.status('Nothing to sample there.'); return; }
    const hex = toHex({ r: r / n, g: g / n, b: b / n, a: 1 });
    editor.setBrush({ color: hex, mode: 'color' });
    editor.status(`Sampled ${hex}`);
  },
};
