/**
 * Bring existing artwork into the editor.
 *
 * The point is not to redraw someone's map — it is to take a battle map you
 * already own, drop a grid on it, add walls, doors and lights, and push the
 * whole thing into a VTT.
 */
import type { MapDocument } from './types';
import { createDocument, makeRasterLayer } from './doc';
import { createSurface, ctxOf, loadImage } from '../util/canvas';
import { makeImageObject } from './factories';

export interface ImportImageOptions {
  /** Guessed cell size in pixels; 0 leaves the grid off. */
  cellSize?: number;
  title?: string;
  paletteId?: string;
  /** Cap the document size; very large scans get scaled down. */
  maxSide?: number;
}

export interface ImportResult {
  doc: MapDocument;
  scaledBy: number;
}

/** Create a whole new document whose background is the supplied image. */
export async function documentFromImage(dataUrl: string, o: ImportImageOptions = {}): Promise<ImportResult> {
  const img = await loadImage(dataUrl);
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const maxSide = o.maxSide ?? 8192;
  const scale = Math.min(1, maxSide / Math.max(iw, ih));
  const w = Math.round(iw * scale);
  const h = Math.round(ih * scale);

  const cell = o.cellSize && o.cellSize > 4 ? o.cellSize * scale : 0;

  const doc = createDocument({
    kind: 'battle',
    width: w,
    height: h,
    title: o.title || 'Imported Map',
    paletteId: o.paletteId || 'atlas',
    gridOverride: cell
      ? { type: 'square', size: cell, visible: true, snap: true }
      : { type: 'square', size: 70, visible: false, snap: false },
  });
  doc.background = { type: 'solid', color: '#000000' };
  doc.meta.description = `Imported from an image (${iw} × ${ih}px).`;

  const bg = doc.layers.find((l) => l.kind === 'raster');
  if (bg && bg.kind === 'raster') {
    bg.name = 'Imported Artwork';
    ctxOf(bg.surface).drawImage(img, 0, 0, w, h);
    bg.locked = true;
  }

  return { doc, scaledBy: scale };
}

/** Add the image to the current document as a new locked raster layer. */
export async function imageAsLayer(doc: MapDocument, dataUrl: string, fit = true): Promise<MapDocument> {
  const img = await loadImage(dataUrl);
  const layer = makeRasterLayer('Imported Image', doc.width, doc.height, 'custom');
  const ctx = ctxOf(layer.surface);
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (fit) {
    const s = Math.min(doc.width / iw, doc.height / ih);
    ctx.drawImage(img, (doc.width - iw * s) / 2, (doc.height - ih * s) / 2, iw * s, ih * s);
  } else {
    ctx.drawImage(img, 0, 0);
  }
  const layers = doc.layers.slice();
  const idx = layers.findIndex((l) => l.id === doc.activeLayerId);
  layers.splice(idx < 0 ? layers.length : idx + 1, 0, layer);
  return { ...doc, layers, activeLayerId: layer.id };
}

/** Place the image as a free-floating object you can move and scale. */
export async function imageAsObject(doc: MapDocument, dataUrl: string, at: { x: number; y: number }, targetWidth?: number) {
  const img = await loadImage(dataUrl);
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const w = targetWidth || Math.min(iw, doc.width * 0.4);
  return makeImageObject(dataUrl, at.x, at.y, w, (w * ih) / iw);
}

/**
 * Guess the grid pitch of an imported battle map.
 *
 * Sums the absolute image gradient into horizontal and vertical 1-D profiles,
 * then autocorrelates them. A grid is periodic, so the autocorrelation has
 * peaks at the cell size and at every multiple of it; picking the *smallest*
 * strong peak finds the fundamental instead of latching onto the heavier
 * every-fifth-line rules that most battle maps also draw.
 */
export function guessGridSize(source: HTMLCanvasElement, min = 24, max = 320): { size: number; confidence: number } {
  const w = source.width, h = source.height;
  const ctx = source.getContext('2d', { willReadFrequently: true })!;
  const { data } = ctx.getImageData(0, 0, w, h);

  const colEnergy = new Float32Array(w);
  const rowEnergy = new Float32Array(h);
  const lum = (i: number) => data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;

  const step = Math.max(1, Math.floor(Math.min(w, h) / 900));
  for (let y = 1; y < h - 1; y += step) {
    for (let x = 1; x < w - 1; x += step) {
      const i = (y * w + x) * 4;
      const c = lum(i);
      colEnergy[x] += Math.abs(c - lum(i - 4));
      rowEnergy[y] += Math.abs(c - lum(i - w * 4));
    }
  }

  const upper = Math.min(max, Math.floor(Math.min(w, h) / 3));
  if (upper <= min) return { size: 0, confidence: 0 };

  const corr = (profile: Float32Array): Float32Array => {
    const n = profile.length;
    let mean = 0;
    for (let i = 0; i < n; i++) mean += profile[i];
    mean /= n;
    const centred = new Float32Array(n);
    let norm = 0;
    for (let i = 0; i < n; i++) { centred[i] = profile[i] - mean; norm += centred[i] * centred[i]; }
    norm = norm || 1;

    const out = new Float32Array(upper + 1);
    for (let lag = min; lag <= upper; lag++) {
      let sum = 0;
      for (let i = 0; i + lag < n; i++) sum += centred[i] * centred[i + lag];
      out[lag] = sum / norm;
    }
    return out;
  };

  const ac = corr(colEnergy);
  const acRow = corr(rowEnergy);
  const combined = new Float32Array(upper + 1);
  for (let lag = min; lag <= upper; lag++) combined[lag] = ac[lag] + acRow[lag];

  // Local maxima only — the raw curve is noisy at single-pixel resolution.
  let peak = -Infinity;
  for (let lag = min + 1; lag < upper; lag++) if (combined[lag] > peak) peak = combined[lag];
  if (peak <= 0) return { size: 0, confidence: 0 };

  let fundamental = 0;
  for (let lag = min + 1; lag < upper; lag++) {
    if (combined[lag] < peak * 0.55) continue;
    if (combined[lag] <= combined[lag - 1] || combined[lag] < combined[lag + 1]) continue;
    fundamental = lag;
    break;
  }
  if (!fundamental) return { size: 0, confidence: 0 };

  // Parabolic refinement around the integer peak for sub-pixel accuracy.
  const y0 = combined[fundamental - 1], y1 = combined[fundamental], y2 = combined[fundamental + 1];
  const denom = y0 - 2 * y1 + y2;
  const shift = denom !== 0 ? (0.5 * (y0 - y2)) / denom : 0;
  const size = fundamental + Math.max(-0.5, Math.min(0.5, shift));

  // Confidence: how far the fundamental stands above the surrounding curve.
  let mean = 0, count = 0;
  for (let lag = min; lag <= upper; lag++) { mean += combined[lag]; count++; }
  mean /= count || 1;
  const confidence = Math.max(0, Math.min(1, (combined[fundamental] - mean) / (peak - mean || 1)));

  return { size: +size.toFixed(2), confidence };
}
