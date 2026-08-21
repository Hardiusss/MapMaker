/**
 * Shared painting helpers for the generators.
 *
 * `blendTextures` is the workhorse: it resolves a whole layer of mixed ground
 * textures in one per-pixel pass instead of compositing each texture through
 * its own full-canvas mask. That is an order of magnitude faster and gives
 * organic, interlocking patches rather than airbrushed blobs.
 */
import { getTexture } from '../render/textures';
import { SimplexNoise, clamp01 } from '../core/noise';
import { createSurface, ctxOf, type Surface } from '../util/canvas';
import { parseColor } from '../core/color';

const TILE = 256;

export interface BlendLayer {
  textureId: string;
  /** Relative share of the surface this texture should occupy. */
  weight: number;
}

export interface BlendOptions {
  seed: number;
  /** Feature size, in "patches across the map". Lower = bigger patches. */
  scale: number;
  /** Warp strength; higher makes patch borders more ragged. */
  warp: number;
  paletteId: string;
  /** Optional alpha for the whole result. */
  alpha?: number;
}

/**
 * Paint `layers` across the given context, choosing a texture per pixel from a
 * warped noise field weighted by each layer's share.
 */
export function blendTextures(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  layers: BlendLayer[],
  o: BlendOptions,
): void {
  if (!layers.length) return;

  const tiles = layers.map((l) => {
    const surf = getTexture(l.textureId, { paletteId: o.paletteId, size: TILE });
    return surf.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, TILE, TILE).data;
  });

  // Cumulative weights → thresholds in 0..1.
  const total = layers.reduce((a, b) => a + Math.max(0.0001, b.weight), 0);
  const thresholds: number[] = [];
  let acc = 0;
  for (const l of layers) {
    acc += Math.max(0.0001, l.weight) / total;
    thresholds.push(acc);
  }

  const pick = new SimplexNoise(o.seed);
  const warpN = new SimplexNoise(o.seed + 4409);

  // Coarse fields, nearest-sampled: plenty smooth once upscaled.
  const fw = Math.max(24, Math.round(W / 5));
  const fh = Math.max(24, Math.round(H / 5));
  const field = new Float32Array(fw * fh);
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < fw; x++) {
      const u = x / fw, v = y / fh;
      const wx = warpN.fbm(u * o.scale * 1.7, v * o.scale * 1.7, 3) * o.warp;
      const wy = warpN.fbm(u * o.scale * 1.7 + 6.3, v * o.scale * 1.7 + 2.1, 3) * o.warp;
      // Two octave bands so patches have both large shape and frayed edges.
      const n = pick.fbm((u + wx) * o.scale, (v + wy) * o.scale, 4) * 0.62
        + pick.fbm((u + wx) * o.scale * 3.4 + 11, (v + wy) * o.scale * 3.4, 2) * 0.38;
      field[y * fw + x] = clamp01(n * 0.5 + 0.5);
    }
  }

  const img = ctx.createImageData(W, H);
  const d = img.data;
  const alpha = Math.round((o.alpha ?? 1) * 255);

  for (let y = 0; y < H; y++) {
    const fy = ((y * fh / H) | 0) * fw;
    const rowT = (y & (TILE - 1)) * TILE;
    for (let x = 0; x < W; x++) {
      const n = field[fy + ((x * fw / W) | 0)];
      let li = thresholds.length - 1;
      for (let i = 0; i < thresholds.length; i++) {
        if (n <= thresholds[i]) { li = i; break; }
      }
      const tex = tiles[li];
      const ti = (rowT + (x & (TILE - 1))) * 4;
      const di = (y * W + x) * 4;
      d[di] = tex[ti];
      d[di + 1] = tex[ti + 1];
      d[di + 2] = tex[ti + 2];
      d[di + 3] = alpha;
    }
  }

  ctx.putImageData(img, 0, 0);
}

/**
 * Broad light/dark drift over an existing surface — stops large flat areas of
 * ground from looking like a single swatch.
 */
export function addTonalDrift(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  seed: number,
  strength = 1,
): void {
  const noise = new SimplexNoise(seed);
  const dw = Math.max(16, Math.round(W / 24));
  const dh = Math.max(16, Math.round(H / 24));
  const surf = createSurface(dw, dh);
  const sctx = ctxOf(surf);
  const img = sctx.createImageData(dw, dh);
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const n = noise.fbm((x / dw) * 3.1, (y / dh) * 3.1, 4);
      const i = (y * dw + x) * 4;
      if (n < 0) {
        img.data[i] = 18; img.data[i + 1] = 24; img.data[i + 2] = 14;
        img.data[i + 3] = clamp01(-n * 1.5) * 62 * strength;
      } else {
        img.data[i] = 250; img.data[i + 1] = 244; img.data[i + 2] = 202;
        img.data[i + 3] = clamp01(n * 1.5) * 46 * strength;
      }
    }
  }
  sctx.putImageData(img, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(surf, 0, 0, W, H);
  ctx.restore();
}

/** Fill an entire context with one repeating texture. */
export function fillTexture(ctx: CanvasRenderingContext2D, W: number, H: number, textureId: string, paletteId: string): void {
  const pat = ctx.createPattern(getTexture(textureId, { paletteId }), 'repeat')!;
  ctx.save();
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
