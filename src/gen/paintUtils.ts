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
  /** How much ground one texture tile covers here. See `TextureOptions`. */
  detail?: number;
}

/**
 * Paint `layers` across the given context, choosing a texture per pixel.
 *
 * Each layer gets its own noise field and the winner at each point is whichever
 * field scores highest after a per-layer bias. The obvious alternative — one
 * field sliced by cumulative weight thresholds — has a nasty failure mode: a
 * low-weight texture is assigned a *narrow band of the field's range*, and a
 * narrow band of a smooth scalar field is a contour line. So instead of small
 * patches of dirt in the grass you get long winding filaments of it tracing
 * level sets across the whole map, which read as scratches on the paper.
 *
 * The biases are calibrated against the actual fields before painting, so the
 * area each texture ends up with still matches the weights it asked for.
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
    const surf = getTexture(l.textureId, { paletteId: o.paletteId, size: TILE, detail: o.detail ?? 1 });
    return surf.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, TILE, TILE).data;
  });

  const n = layers.length;
  const total = layers.reduce((a, b) => a + Math.max(0.0001, b.weight), 0);
  const target = layers.map((l) => Math.max(0.0001, l.weight) / total);

  // Coarse fields. One per layer is a real cost, so they are kept coarser than
  // they would need to be for a clean edge — the dithered lookup below hides
  // the resolution far better than extra samples would buy back.
  const fw = Math.max(24, Math.round(W / 7));
  const fh = Math.max(24, Math.round(H / 7));
  const cells = fw * fh;

  // The warp is shared by every layer, so it is computed once rather than
  // n times — it is four fbm evaluations per cell and would otherwise dominate
  // the cost of the whole pass.
  const warpN = new SimplexNoise(o.seed + 4409);
  const warpX = new Float32Array(cells);
  const warpY = new Float32Array(cells);
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < fw; x++) {
      const u = x / fw, v = y / fh;
      const i = y * fw + x;
      warpX[i] = warpN.fbm(u * o.scale * 1.7, v * o.scale * 1.7, 3) * o.warp;
      warpY[i] = warpN.fbm(u * o.scale * 1.7 + 6.3, v * o.scale * 1.7 + 2.1, 3) * o.warp;
    }
  }

  const fields: Float32Array[] = [];
  for (let li = 0; li < n; li++) {
    const pick = new SimplexNoise(o.seed + li * 7919 + 13);
    const f = new Float32Array(cells);
    // A per-layer offset in the sampling domain as well as a distinct seed:
    // two SimplexNoise instances seeded a few apart can still correlate.
    const ox = li * 31.7, oy = li * 17.3;
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        const i = y * fw + x;
        const u = x / fw + warpX[i], v = y / fh + warpY[i];
        // Two octave bands so patches have both large shape and frayed edges.
        const val = pick.fbm(u * o.scale + ox, v * o.scale + oy, 4) * 0.62
          + pick.fbm(u * o.scale * 3.4 + 11 + ox, v * o.scale * 3.4 + oy, 2) * 0.38;
        f[i] = val * 0.5 + 0.5;
      }
    }
    fields.push(f);
  }

  // --- Calibrate the biases -------------------------------------------------
  // Start from the log of the weights, then nudge until the measured share of
  // the field matches the requested one. Six passes is more than enough; the
  // mapping from bias to area is smooth and monotone.
  const bias = target.map((t) => Math.log(t) * 0.3);
  const winner = new Uint8Array(cells);
  const counts = new Float64Array(n);

  const assign = (): void => {
    counts.fill(0);
    for (let i = 0; i < cells; i++) {
      let best = 0, bestScore = fields[0][i] + bias[0];
      for (let li = 1; li < n; li++) {
        const sc = fields[li][i] + bias[li];
        if (sc > bestScore) { bestScore = sc; best = li; }
      }
      winner[i] = best;
      counts[best]++;
    }
  };

  for (let pass = 0; pass < 6; pass++) {
    assign();
    let moved = 0;
    for (let li = 0; li < n; li++) {
      const share = counts[li] / cells;
      const step = Math.log(target[li] / Math.max(share, 1 / cells)) * 0.22;
      bias[li] += step;
      moved = Math.max(moved, Math.abs(step));
    }
    if (moved < 0.004) break;
  }
  assign();

  // --- Paint ---------------------------------------------------------------
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const alpha = Math.round((o.alpha ?? 1) * 255);

  // The winner map is one value per field cell, so a straight nearest lookup
  // draws every patch boundary as an axis-aligned staircase five pixels to a
  // step — invisible on a world map, obvious the moment a battle map is zoomed
  // to a token. Jittering the lookup by up to a cell in each direction frays
  // the boundary into a stipple instead, which is both cheaper than
  // interpolating and closer to how ground actually changes.
  const sx = fw / W, sy = fh / H;
  const JITTER = 1.35;
  for (let y = 0; y < H; y++) {
    const rowT = (y & (TILE - 1)) * TILE;
    const fyBase = y * sy;
    for (let x = 0; x < W; x++) {
      // Cheap integer hash — two decorrelated values per pixel.
      let hx = (x * 374761393 + y * 668265263) | 0;
      hx = ((hx ^ (hx >>> 13)) * 1274126177) | 0;
      const h1 = ((hx ^ (hx >>> 16)) >>> 0) / 4294967296;
      let hy = (x * 2654435761 + y * 40503) | 0;
      hy = ((hy ^ (hy >>> 15)) * 2246822519) | 0;
      const h2 = ((hy ^ (hy >>> 13)) >>> 0) / 4294967296;

      let fx = ((x * sx + (h1 - 0.5) * JITTER) | 0);
      let fy = ((fyBase + (h2 - 0.5) * JITTER) | 0);
      if (fx < 0) fx = 0; else if (fx >= fw) fx = fw - 1;
      if (fy < 0) fy = 0; else if (fy >= fh) fy = fh - 1;

      const tex = tiles[winner[fy * fw + fx]];
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
export function fillTexture(
  ctx: CanvasRenderingContext2D, W: number, H: number, textureId: string, paletteId: string, detail = 1,
): void {
  const pat = ctx.createPattern(getTexture(textureId, { paletteId, detail }), 'repeat')!;
  ctx.save();
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
