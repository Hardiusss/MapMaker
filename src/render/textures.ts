/**
 * Procedural, seamless texture library.
 *
 * Every terrain surface in the app is synthesised here from tileable noise —
 * no bundled artwork, no licensing, no downloads. Tiles are generated once and
 * cached per (id, palette, size).
 */
import { TileableNoise, WorleyNoise, clamp, clamp01, smoothstep, lerp } from '../core/noise';
import { RNG } from '../core/rng';
import {
  parseColor, mix, sampleRamp, shiftHsl, type RampStop, type MapPalette, paletteById,
} from '../core/color';
import { createSurface, ctxOf, type Surface } from '../util/canvas';
import { BudgetedCache, releaseSurface } from '../util/lru';
import { MATERIALS, materialTextureId, type MaterialDef } from './materials';

export type TextureGroup = 'ground' | 'water' | 'vegetation' | 'rock' | 'interior' | 'special';

export interface TextureDef {
  id: string;
  label: string;
  group: TextureGroup;
  /** Suggested pattern scale relative to the base tile. */
  scale: number;
  make(px: PixelWriter, p: MapPalette, rng: RNG, size: number, detail: number): void;
  /** Optional vector pass drawn on top of the pixel pass (wrapping-aware). */
  overlay?(ctx: CanvasRenderingContext2D, p: MapPalette, rng: RNG, size: number, detail: number): void;
}

// ---------------------------------------------------------------------------
// Pixel helper
// ---------------------------------------------------------------------------

export class PixelWriter {
  readonly data: Uint8ClampedArray;
  readonly size: number;

  constructor(size: number) {
    this.size = size;
    this.data = new Uint8ClampedArray(size * size * 4);
  }

  /** Fill every pixel from a callback. `u`,`v` are normalised [0,1). */
  each(fn: (u: number, v: number, x: number, y: number) => [number, number, number, number] | string): void {
    const s = this.size;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const r = fn(x / s, y / s, x, y);
        const i = (y * s + x) * 4;
        if (typeof r === 'string') {
          const c = parseColor(r);
          this.data[i] = c.r; this.data[i + 1] = c.g; this.data[i + 2] = c.b; this.data[i + 3] = c.a * 255;
        } else {
          this.data[i] = r[0]; this.data[i + 1] = r[1]; this.data[i + 2] = r[2]; this.data[i + 3] = r[3];
        }
      }
    }
  }

  toImageData(): ImageData {
    // The generic on Uint8ClampedArray is stricter than the DOM lib expects.
    return new ImageData(this.data as unknown as ImageDataArray, this.size, this.size);
  }
}

/** Colour ramp sampler that avoids re-parsing hex strings per pixel. */
function ramp(stops: RampStop[], steps = 128) {
  const lut = new Uint8ClampedArray(steps * 3);
  for (let i = 0; i < steps; i++) {
    const c = parseColor(sampleRamp(stops, i / (steps - 1)));
    lut[i * 3] = c.r; lut[i * 3 + 1] = c.g; lut[i * 3 + 2] = c.b;
  }
  return (t: number): [number, number, number] => {
    const i = Math.max(0, Math.min(steps - 1, Math.round(clamp01(t) * (steps - 1)))) * 3;
    return [lut[i], lut[i + 1], lut[i + 2]];
  };
}

function shade(rgb: [number, number, number], amount: number): [number, number, number] {
  return [rgb[0] * amount, rgb[1] * amount, rgb[2] * amount];
}

// ---------------------------------------------------------------------------
// Relief
// ---------------------------------------------------------------------------

/**
 * The light in this app comes from the upper left.
 *
 * Every drop shadow the generators cast, every rim on a stamp and every mask in
 * `masonry.ts` agrees on that, so a texture that lights itself from anywhere
 * else reads as a decal laid over the map rather than as the ground under it.
 */
const LIGHT_X = -0.66;
const LIGHT_Y = -0.66;

/** Cheap stable hash of two integers to [0,1). */
function hashi(x: number, y: number, salt = 0): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(salt | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Wrap-aware box blur of a height field.
 *
 * Blurring with clamped edges would light the tile boundary differently from
 * its interior, which is the one defect this whole file exists to avoid; the
 * modulo costs nothing next to the sampling.
 */
function blurWrap(src: Float32Array, size: number, radius: number): Float32Array {
  const tmp = new Float32Array(size * size);
  const out = new Float32Array(size * size);
  const n = radius * 2 + 1;
  for (let y = 0; y < size; y++) {
    const row = y * size;
    for (let x = 0; x < size; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += src[row + ((x + k + size) % size)];
      tmp[row + x] = sum / n;
    }
  }
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += tmp[((y + k + size) % size) * size + x];
      out[y * size + x] = sum / n;
    }
  }
  return out;
}

export interface ReliefOptions {
  /** How hard the slopes are lit. */
  strength?: number;
  /** Cavity darkening, from the difference against a blurred copy. */
  ao?: number;
  /** Radius of the blur the cavity term compares against, in pixels. */
  aoRadius?: number;
}

/**
 * Turn a height field into a light multiplier per pixel.
 *
 * Two terms, and both are needed. The gradient term is the direct light and
 * gives the material its facets; the cavity term is what puts a mortar joint
 * *in* shadow instead of drawing a grey line where a joint would be. Drawing
 * the line is what makes procedural masonry look printed.
 */
function reliefLight(h: Float32Array, size: number, o: ReliefOptions = {}): Float32Array {
  const strength = o.strength ?? 1;
  const aoK = o.ao ?? 0.5;
  const out = new Float32Array(size * size);
  // Light a slightly softened copy: sampling the raw field turns every joint
  // into a cliff with a white lip, which is embossing, not masonry.
  const hs = blurWrap(h, size, Math.max(1, Math.round(size / 190)));
  const blurred = aoK > 0 ? blurWrap(h, size, Math.max(2, Math.round(o.aoRadius ?? size / 48))) : null;
  // Gradients are measured per pixel, so the same relief has to be scaled by
  // the tile size or a 128px tile is lit twice as hard as a 256px one.
  const g = strength * size * 0.012;
  for (let y = 0; y < size; y++) {
    const yUp = ((y - 1 + size) % size) * size;
    const yDn = ((y + 1) % size) * size;
    const row = y * size;
    for (let x = 0; x < size; x++) {
      const xL = (x - 1 + size) % size;
      const xR = (x + 1) % size;
      const gx = (hs[row + xR] - hs[row + xL]) * 0.5;
      const gy = (hs[yDn + x] - hs[yUp + x]) * 0.5;
      // Slopes rising towards the light are lit; the sign is why the light
      // direction is stored negative.
      let l = 1 + (gx * LIGHT_X + gy * LIGHT_Y) * g;
      if (blurred) l -= clamp((blurred[row + x] - h[row + x]) * aoK, 0, 0.42);
      out[row + x] = clamp(l, 0.42, 1.5);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Texture definitions
// ---------------------------------------------------------------------------

const defs: TextureDef[] = [];
const def = (d: TextureDef) => { defs.push(d); return d; };

// --- Parchment & paper -----------------------------------------------------

def({
  id: 'parchment', label: 'Parchment', group: 'special', scale: 2,
  make(px, p, rng) {
    const n = new TileableNoise(8, rng.int(1, 1e6));
    const n2 = new TileableNoise(24, rng.int(1, 1e6));
    const fibre = new TileableNoise(64, rng.int(1, 1e6));
    const r = ramp([
      { t: 0, color: mix(p.parchmentDark, '#000000', 0.06) },
      { t: 0.45, color: p.parchmentDark },
      { t: 0.72, color: p.parchment },
      { t: 1, color: mix(p.parchment, '#ffffff', 0.35) },
    ]);
    px.each((u, v) => {
      const base = n.fbm(u * 8, v * 8, 4) * 0.5 + 0.5;
      const blot = Math.abs(n2.fbm(u * 24, v * 24, 3)) * 0.35;
      const grain = fibre.noise(u * 64, v * 64) * 0.05;
      const t = clamp01(base * 0.75 + 0.2 - blot * 0.5 + grain);
      const c = r(t);
      return [c[0], c[1], c[2], 255];
    });
  },
});

def({
  id: 'parchment-fine', label: 'Fine Vellum', group: 'special', scale: 2,
  make(px, p, rng) {
    const n = new TileableNoise(16, rng.int(1, 1e6));
    const speck = new TileableNoise(96, rng.int(1, 1e6));
    const r = ramp([
      { t: 0, color: mix(p.parchment, p.parchmentDark, 0.6) },
      { t: 0.6, color: p.parchment },
      { t: 1, color: mix(p.parchment, '#ffffff', 0.5) },
    ]);
    px.each((u, v) => {
      const base = n.fbm(u * 16, v * 16, 3) * 0.5 + 0.5;
      const s = speck.noise(u * 96, v * 96);
      const t = clamp01(base * 0.6 + 0.3 + s * 0.06);
      const c = r(t);
      const dot = s > 0.72 ? 0.86 : 1;
      return [c[0] * dot, c[1] * dot, c[2] * dot, 255];
    });
  },
});

def({
  id: 'parchment-aged', label: 'Aged & Stained', group: 'special', scale: 2,
  make(px, p, rng) {
    const n = new TileableNoise(6, rng.int(1, 1e6));
    const stain = new TileableNoise(4, rng.int(1, 1e6));
    const r = ramp([
      { t: 0, color: '#6d5433' },
      { t: 0.35, color: mix(p.parchmentDark, '#7a5a34', 0.5) },
      { t: 0.7, color: p.parchment },
      { t: 1, color: mix(p.parchment, '#fff6dd', 0.6) },
    ]);
    px.each((u, v) => {
      const base = n.fbm(u * 6, v * 6, 5) * 0.5 + 0.5;
      const st = clamp01(stain.turbulence(u * 4, v * 4, 4) * 1.6 - 0.25);
      const t = clamp01(base * 0.8 + 0.25 - st * 0.65);
      const c = r(t);
      return [c[0], c[1], c[2], 255];
    });
  },
});

// --- Water -----------------------------------------------------------------

def({
  id: 'water-deep', label: 'Deep Ocean', group: 'water', scale: 2,
  make(px, p, rng) {
    const n = new TileableNoise(8, rng.int(1, 1e6));
    const w = new TileableNoise(20, rng.int(1, 1e6));
    const r = ramp([
      { t: 0, color: mix(p.deepWater, '#000814', 0.45) },
      { t: 0.5, color: p.deepWater },
      { t: 1, color: mix(p.deepWater, p.water, 0.7) },
    ]);
    px.each((u, v) => {
      const base = n.fbm(u * 8, v * 8, 4) * 0.5 + 0.5;
      const ripple = Math.sin((u * 8 + w.fbm(u * 20, v * 20, 2) * 2) * Math.PI * 2) * 0.06;
      const c = r(clamp01(base * 0.8 + 0.15 + ripple));
      return [c[0], c[1], c[2], 255];
    });
  },
});

def({
  id: 'water', label: 'Open Water', group: 'water', scale: 2,
  make(px, p, rng) {
    const n = new TileableNoise(10, rng.int(1, 1e6));
    const r = ramp([
      { t: 0, color: mix(p.water, p.deepWater, 0.6) },
      { t: 0.55, color: p.water },
      { t: 1, color: mix(p.water, p.shallowWater, 0.8) },
    ]);
    px.each((u, v) => {
      const base = n.fbm(u * 10, v * 10, 4) * 0.5 + 0.5;
      const c = r(clamp01(base));
      return [c[0], c[1], c[2], 255];
    });
  },
});

def({
  id: 'water-shallow', label: 'Shallows', group: 'water', scale: 2,
  make(px, p, rng) {
    const n = new TileableNoise(14, rng.int(1, 1e6));
    const cell = new WorleyNoise(10, rng.int(1, 1e6), 1);
    const r = ramp([
      { t: 0, color: mix(p.shallowWater, p.deepWater, 0.45) },
      { t: 0.55, color: mix(p.shallowWater, p.water, 0.35) },
      { t: 1, color: mix(p.shallowWater, '#ffffff', 0.18) },
    ]);
    px.each((u, v) => {
      const base = n.fbm(u * 14, v * 14, 3) * 0.5 + 0.5;
      const [f1, f2] = cell.f1f2(u * 10, v * 10);
      const caustic = smoothstep(0.02, 0.16, f2 - f1);
      const c = r(clamp01(base * 0.7 + 0.1 + (1 - caustic) * 0.2));
      return [c[0], c[1], c[2], 255];
    });
  },
});

def({
  id: 'water-hatched', label: 'Hatched Sea', group: 'water', scale: 2,
  make(px, p, rng) {
    const n = new TileableNoise(6, rng.int(1, 1e6));
    px.each((u, v) => {
      const base = n.fbm(u * 6, v * 6, 3) * 0.5 + 0.5;
      const line = Math.sin(v * Math.PI * 2 * 16 + n.noise(u * 6, v * 6) * 3);
      const ink = smoothstep(0.65, 0.95, line) * (0.35 + base * 0.4);
      const c = parseColor(mix(p.parchment, p.deepWater, 0.18 + ink * 0.6));
      return [c.r, c.g, c.b, 255];
    });
  },
});

def({
  id: 'ice', label: 'Sea Ice', group: 'water', scale: 2,
  make(px, p, rng) {
    const cell = new WorleyNoise(7, rng.int(1, 1e6), 1);
    const n = new TileableNoise(18, rng.int(1, 1e6));
    const r = ramp([
      { t: 0, color: mix(p.shallowWater, '#dff0f7', 0.6) },
      { t: 0.6, color: '#e9f4f8' },
      { t: 1, color: '#ffffff' },
    ]);
    px.each((u, v) => {
      const [f1, f2] = cell.f1f2(u * 7, v * 7);
      const edge = smoothstep(0.0, 0.09, f2 - f1);
      const base = n.fbm(u * 18, v * 18, 3) * 0.5 + 0.5;
      const c = r(clamp01(edge * 0.7 + base * 0.35));
      return [c[0], c[1], c[2], 255];
    });
  },
});

// --- Ground ----------------------------------------------------------------

def({
  id: 'grass', label: 'Grassland', group: 'ground', scale: 1,
  make(px, p, rng) {
    const n = new TileableNoise(16, rng.int(1, 1e6));
    const blade = new TileableNoise(64, rng.int(1, 1e6));
    const r = ramp([
      { t: 0, color: mix(p.grass, '#000000', 0.3) },
      { t: 0.45, color: p.grass },
      { t: 0.8, color: mix(p.grass, p.lowland, 0.5) },
      { t: 1, color: mix(p.grass, '#ffffff', 0.3) },
    ]);
    px.each((u, v) => {
      const base = n.fbm(u * 16, v * 16, 4) * 0.5 + 0.5;
      const grain = blade.turbulence(u * 64, v * 64, 2);
      const c = r(clamp01(base * 0.75 + grain * 0.3));
      return [c[0], c[1], c[2], 255];
    });
  },
});

def({
  id: 'grass-lush', label: 'Lush Meadow', group: 'ground', scale: 1,
  make(px, p, rng) {
    const n = new TileableNoise(12, rng.int(1, 1e6));
    const blade = new TileableNoise(80, rng.int(1, 1e6));
    const g = mix(p.grass, '#2f7a33', 0.35);
    const r = ramp([
      { t: 0, color: mix(g, '#12331a', 0.45) },
      { t: 0.5, color: g },
      { t: 1, color: mix(g, '#c8de7c', 0.55) },
    ]);
    px.each((u, v) => {
      const base = n.fbm(u * 12, v * 12, 4) * 0.5 + 0.5;
      const grain = blade.noise(u * 80, v * 80) * 0.5 + 0.5;
      const c = r(clamp01(base * 0.7 + grain * 0.4 - 0.05));
      return [c[0], c[1], c[2], 255];
    });
  },
});

def({
  id: 'plains', label: 'Dry Plains', group: 'ground', scale: 1,
  make(px, p, rng, size) {
    const n = new TileableNoise(14, rng.int(1, 1e6));
    const tussock = new WorleyNoise(28, rng.int(1, 1e6), 1);
    const scrub = new TileableNoise(7, rng.int(1, 1e6));
    const fine = new TileableNoise(84, rng.int(1, 1e6));
    // The old tile was one fbm through a three-stop ramp, which is a smooth
    // wash and reads as an unpainted area of the sheet. Dry grassland is
    // tussocks over bare ground with the soil showing through the thin places.
    const r = ramp([
      { t: 0, color: mix(p.lowland, '#5f5330', 0.5) },
      { t: 0.28, color: mix(p.lowland, '#6b5f37', 0.42) },
      { t: 0.55, color: p.lowland },
      { t: 0.8, color: mix(p.lowland, p.desert, 0.6) },
      { t: 1, color: mix(p.lowland, '#efe0b0', 0.55) },
    ]);
    const soil = parseColor(mix(p.lowland, '#7a5f3a', 0.65));
    const S = size;
    const h = new Float32Array(S * S);
    const alb = new Float32Array(S * S * 3);
    for (let y = 0; y < S; y++) {
      const v = y / S;
      for (let x = 0; x < S; x++) {
        const u = x / S;
        const base = n.fbm(u * 14, v * 14, 4) * 0.5 + 0.5;
        const [t1, , tid] = tussock.f1f2id(u * 28, v * 28);
        const clump = (1 - smoothstep(0.06, 0.34, t1)) * (0.45 + tid * 0.55);
        const patch = clamp01(scrub.fbm(u * 7, v * 7, 3) * 1.4 + 0.5);
        const grain = fine.noise(u * 84, v * 84);
        h[y * S + x] = 0.4 + clump * 0.3 + base * 0.16 + grain * 0.05;
        const t = clamp01(base * 0.4 + 0.24 + clump * 0.3 + patch * 0.2 + grain * 0.07);
        const c = r(t);
        // Bare soil where the sward has failed.
        const bald = clamp01((0.3 - patch) * 2.2) * (1 - clump);
        const i = (y * S + x) * 3;
        alb[i] = lerp(c[0], soil.r, bald * 0.42);
        alb[i + 1] = lerp(c[1], soil.g, bald * 0.42);
        alb[i + 2] = lerp(c[2], soil.b, bald * 0.42);
      }
    }
    const light = reliefLight(h, S, { strength: 0.5, ao: 0.3, aoRadius: Math.max(2, Math.round(S / 30)) });
    const out = px.data;
    for (let i = 0; i < S * S; i++) {
      const j = i * 3, o = i * 4, l = light[i];
      out[o] = alb[j] * l; out[o + 1] = alb[j + 1] * l; out[o + 2] = alb[j + 2] * l; out[o + 3] = 255;
    }
  },
});

def({
  id: 'dirt', label: 'Bare Earth', group: 'ground', scale: 1,
  make(px, p, rng, size, detail) {
    const k = clamp(Math.sqrt(detail), 0.6, 2.6);
    const n = new TileableNoise(20, rng.int(1, 1e6));
    const speck = new TileableNoise(90, rng.int(1, 1e6));
    const stoneP = Math.max(10, Math.round(26 * k));
    const stones = new WorleyNoise(stoneP, rng.int(1, 1e6), 1);
    const crack = new TileableNoise(12, rng.int(1, 1e6));
    const base0 = mix(p.lowland, '#6a4c2f', 0.6);
    const r = ramp([
      { t: 0, color: mix(base0, '#241708', 0.4) },
      { t: 0.3, color: mix(base0, '#2e1f12', 0.28) },
      { t: 0.6, color: base0 },
      { t: 1, color: mix(base0, '#c9a374', 0.6) },
    ]);
    const S = size;
    const h = new Float32Array(S * S);
    const alb = new Float32Array(S * S * 3);
    for (let y = 0; y < S; y++) {
      const v = y / S;
      for (let x = 0; x < S; x++) {
        const u = x / S;
        const base = n.fbm(u * 20, v * 20, 5) * 0.5 + 0.5;
        const s2 = speck.noise(u * 90, v * 90);
        // Small stones proud of the surface, and the shrinkage cracks that
        // open in bare earth once it has dried.
        const [f1, , sid] = stones.f1f2id(u * stoneP, v * stoneP);
        const pebble = sid > 0.66 ? (1 - smoothstep(0.05, 0.24, f1)) : 0;
        const fissure = 1 - smoothstep(0, 0.05, Math.abs(crack.fbm(u * 12, v * 12, 3)));
        h[y * S + x] = 0.4 + base * 0.24 + pebble * 0.26 + s2 * 0.05 - fissure * 0.16;
        const t = clamp01(base + s2 * 0.12 + pebble * 0.22);
        const c = r(t);
        const i = (y * S + x) * 3;
        alb[i] = c[0]; alb[i + 1] = c[1]; alb[i + 2] = c[2];
      }
    }
    const light = reliefLight(h, S, { strength: 0.6, ao: 0.4, aoRadius: Math.max(2, Math.round(S / 30)) });
    const out = px.data;
    for (let i = 0; i < S * S; i++) {
      const j = i * 3, o = i * 4, l = light[i];
      out[o] = alb[j] * l; out[o + 1] = alb[j + 1] * l; out[o + 2] = alb[j + 2] * l; out[o + 3] = 255;
    }
  },
});

def({
  id: 'mud', label: 'Churned Mud', group: 'ground', scale: 1,
  make(px, p, rng) {
    const n = new TileableNoise(10, rng.int(1, 1e6));
    const w = new TileableNoise(30, rng.int(1, 1e6));
    const base0 = '#4b3a26';
    const r = ramp([
      { t: 0, color: '#241a10' },
      { t: 0.5, color: base0 },
      { t: 1, color: '#7a6244' },
    ]);
    px.each((u, v) => {
      const warp = w.fbm(u * 30, v * 30, 3) * 0.15;
      const base = n.fbm(u * 10 + warp * 10, v * 10, 5) * 0.5 + 0.5;
      const c = r(clamp01(base));
      return [c[0], c[1], c[2], 255];
    });
  },
});

def({
  id: 'sand', label: 'Sand', group: 'ground', scale: 1,
  make(px, p, rng) {
    const n = new TileableNoise(18, rng.int(1, 1e6));
    const dune = new TileableNoise(6, rng.int(1, 1e6));
    const r = ramp([
      { t: 0, color: mix(p.desert, '#8a6f42', 0.5) },
      { t: 0.5, color: p.desert },
      { t: 1, color: mix(p.desert, '#fff3d0', 0.7) },
    ]);
    const grain = new TileableNoise(72, rng.int(1, 1e6));
    px.each((u, v) => {
      // Beach and shore sand: wind ripples are centimetres apart in reality,
      // so at map scale this should read as grain and damp patches, not as the
      // metre-high ridges that belong to the deep desert tile next door.
      const ripple = Math.sin((u * 14 + dune.fbm(u * 6, v * 6, 3) * 4) * Math.PI * 2) * 0.05;
      const base = n.fbm(u * 18, v * 18, 4) * 0.3 + 0.5;
      const speck = grain.noise(u * 72, v * 72) * 0.07;
      const c = r(clamp01(base + ripple + speck));
      return [c[0], c[1], c[2], 255];
    });
  },
});

def({
  id: 'dunes', label: 'Deep Desert', group: 'ground', scale: 2,
  make(px, p, rng) {
    const n = new TileableNoise(4, rng.int(1, 1e6));
    const patchy = new TileableNoise(7, rng.int(1, 1e6));
    const fine = new TileableNoise(56, rng.int(1, 1e6));
    // Dunes are asymmetric: a long windward slope and a short steep slip face
    // with a shadow at its foot. The old symmetric sine at high contrast tiled
    // into something that read as a fingerprint across the whole desert once
    // you zoomed out far enough to see nine copies of the tile at once.
    const r = ramp([
      { t: 0, color: mix(p.desert, '#8a6636', 0.5) },
      { t: 0.38, color: mix(p.desert, '#000000', 0.08) },
      { t: 0.7, color: p.desert },
      { t: 1, color: mix(p.desert, '#fff0c8', 0.55) },
    ]);
    px.each((u, v) => {
      const flow = n.fbm(u * 4, v * 4, 4);
      // `flow` is signed, and JS's % keeps the sign — a negative phase would
      // make Math.pow return NaN and punch black holes through the texture.
      const phase = (((v * 3 + flow * 3) % 1) + 1) % 1;
      // Sawtooth ramp up, sharp drop, then a shadow trough after the crest.
      const windward = Math.pow(phase, 0.8);
      const slip = smoothstep(0.86, 1, phase);
      const shadow = smoothstep(1, 0.92, phase) * smoothstep(0.86, 0.94, phase);
      // Not all desert is dune field: fade the ridges out over open sand flats.
      const field = smoothstep(0.35, 0.72, patchy.fbm(u * 7, v * 7, 3) * 0.5 + 0.5);
      const ridge = (windward * 0.5 - slip * 0.3 - shadow * 0.34) * (0.35 + field * 0.65);
      const base = 0.46 + ridge + fine.noise(u * 56, v * 56) * 0.05;
      const c = r(clamp01(base));
      return [c[0], c[1], c[2], 255];
    });
  },
});

def({
  id: 'snow', label: 'Snowfield', group: 'ground', scale: 1,
  make(px, p, rng, size) {
    const n = new TileableNoise(9, rng.int(1, 1e6));
    const drift = new TileableNoise(20, rng.int(1, 1e6));
    const grain = new TileableNoise(64, rng.int(1, 1e6));
    // Snow, not paper. The old ramp spent most of its range at pure white, so a
    // snowfield rendered as a flat cut-out shape with a hard edge — which on a
    // map full of textured ground is the one thing that looks unfinished.
    // Wind-scoured drifts and blue shadow in the hollows give it a surface.
    const r = ramp([
      { t: 0, color: mix(p.snow, '#6f89a8', 0.5) },
      { t: 0.32, color: mix(p.snow, '#9fb4cb', 0.45) },
      { t: 0.6, color: mix(p.snow, '#dde8f2', 0.55) },
      { t: 0.86, color: mix(p.snow, '#f4f9ff', 0.6) },
      { t: 1, color: mix(p.snow, '#ffffff', 0.75) },
    ]);
    // Sastrugi: wind-carved ridges, elongated along one axis. The elongation is
    // four taps down v rather than a stretched coordinate, because a period-20
    // field sampled over seven units does not wrap. Sixteen octaves a pixel is
    // more than a drift needs, so it is resolved on a coarse grid.
    const smearF = coarseField(Math.max(16, size >> 1), (u, v) => (
      drift.fbm(u * 20, v * 20, 4) + drift.fbm(u * 20, v * 20 + 0.5, 4)
      + drift.fbm(u * 20, v * 20 + 1.0, 4) + drift.fbm(u * 20, v * 20 + 1.5, 4)) * 0.25);
    px.each((u, v) => {
      const base = n.fbm(u * 9, v * 9, 4) * 0.5 + 0.5;
      const ridges = 1 - Math.abs(smearF(u, v)) * 2.4;
      const speck = grain.noise(u * 64, v * 64) * 0.06;
      const c = r(clamp01(base * 0.62 + ridges * 0.3 + speck));
      return [c[0], c[1], c[2], 255];
    });
  },
});

def({
  id: 'tundra', label: 'Tundra', group: 'ground', scale: 1,
  make(px, p, rng) {
    const base = new TileableNoise(11, rng.int(1, 1e6));
    const warp = new TileableNoise(5, rng.int(1, 1e6));
    const patch = new TileableNoise(26, rng.int(1, 1e6));
    const speck = new WorleyNoise(30, rng.int(1, 1e6), 1);
    // Tundra is lichen and low scrub over frozen ground: mottled, never tiled.
    // A Worley pattern here produced regular pale scales that read as reptile
    // skin from any distance at which you can see a whole map.
    const ground = mix(p.grass, '#6d6a56', 0.55);
    const r = ramp([
      { t: 0, color: mix(ground, '#3a3a30', 0.6) },
      { t: 0.4, color: ground },
      { t: 0.7, color: mix(ground, '#9aa07e', 0.55) },
      { t: 1, color: mix(ground, '#d8d8c8', 0.7) },
    ]);
    px.each((u, v) => {
      // The warp has to wrap as well as the field it warps, so it comes from a
      // noise whose period is the rate it is sampled at.
      const wx = warp.fbm(u * 5 + 3.1, v * 5, 3) * 0.3;
      const wy = warp.fbm(u * 5, v * 5 + 7.7, 3) * 0.3;
      const blotch = patch.turbulence((u + wx) * 26, (v + wy) * 26, 4);
      const broad = base.fbm(u * 11, v * 11, 4) * 0.5 + 0.5;
      // Sparse pale lichen crusts.
      const [s1, s2, sid] = speck.f1f2id(u * 30, v * 30);
      const crust = sid > 0.78 ? smoothstep(0.16, 0.0, s1) * 0.5 : 0;
      const t = clamp01(broad * 0.55 + blotch * 0.42 + crust);
      const c = r(t);
      return [c[0], c[1], c[2], 255];
    });
  },
});

def({
  id: 'swamp', label: 'Marsh', group: 'ground', scale: 1,
  make(px, p, rng) {
    const n = new TileableNoise(14, rng.int(1, 1e6));
    const pool = new TileableNoise(7, rng.int(1, 1e6));
    const r = ramp([
      { t: 0, color: mix(p.swamp, '#12200f', 0.6) },
      { t: 0.45, color: p.swamp },
      { t: 0.75, color: mix(p.swamp, p.shallowWater, 0.55) },
      { t: 1, color: mix(p.water, '#2b3a24', 0.4) },
    ]);
    px.each((u, v) => {
      const base = n.fbm(u * 14, v * 14, 4) * 0.5 + 0.5;
      const wet = smoothstep(0.45, 0.75, pool.fbm(u * 7, v * 7, 3) * 0.5 + 0.5);
      const c = r(clamp01(base * 0.55 + wet * 0.6));
      return [c[0], c[1], c[2], 255];
    });
  },
});

def({
  id: 'farmland', label: 'Farmland', group: 'ground', scale: 2,
  make(px, p, rng) {
    const n = new TileableNoise(8, rng.int(1, 1e6));
    const fields = new WorleyNoise(7, rng.int(1, 1e6), 1);
    // Fields, not stripes. The old version banded the whole tile horizontally,
    // which on a city map put faint horizontal lines from one edge of the
    // countryside to the other — the most visible artefact on the page, and
    // nothing like farmland, which is a patchwork of irregular enclosures each
    // ploughed in its own direction.
    const r = ramp([
      { t: 0, color: mix(p.lowland, '#6b5334', 0.42) },
      { t: 0.3, color: mix(p.lowland, '#87703f', 0.3) },
      { t: 0.58, color: mix(p.grass, p.lowland, 0.42) },
      { t: 0.82, color: mix(p.grass, '#c4c47e', 0.35) },
      { t: 1, color: mix(p.grass, '#dcd898', 0.48) },
    ]);
    px.each((u, v) => {
      const [f1, f2, id] = fields.f1f2id(u * 7, v * 7);
      // Each enclosure gets its own crop, its own stage of growth, and its own
      // furrow direction, derived from the cell id so it stays put. The four
      // directions are the ones whose furrows still close across the tile: a
      // free angle makes the ridge count fractional and leaves a step at the
      // edge, which is exactly the kind of ruled line the farmland tile was
      // rewritten to get rid of in the first place.
      const crop = (id - 0.5) * 0.5;
      const dir = Math.floor(id * 4) & 3;
      const ca = dir === 1 ? 0 : 1;
      const sa = dir === 0 ? 0 : dir === 2 ? 1 : dir === 3 ? -1 : 1;
      const along = u * ca + v * sa;
      const furrow = Math.sin(along * Math.PI * 2 * 46) * 0.045;
      // Hedge or wall on the boundary between two fields.
      const hedge = (1 - smoothstep(0.0, 0.035, f2 - f1)) * 0.34;
      const base = n.fbm(u * 8, v * 8, 3) * 0.16 + 0.52;
      const c = r(clamp01(base + crop + furrow - hedge));
      return [c[0], c[1], c[2], 255];
    });
  },
});

def({
  id: 'ash', label: 'Ash Waste', group: 'ground', scale: 1,
  make(px, p, rng, size) {
    const n = new TileableNoise(18, rng.int(1, 1e6));
    const drift = new TileableNoise(6, rng.int(1, 1e6));
    const clinker = new WorleyNoise(20, rng.int(1, 1e6), 1);
    const ember = new TileableNoise(9, rng.int(1, 1e6));
    const r = ramp([
      { t: 0, color: '#1e1a18' },
      { t: 0.3, color: '#2f2a27' },
      { t: 0.58, color: '#4d4643' },
      { t: 0.82, color: '#776d67' },
      { t: 1, color: '#a2968d' },
    ]);
    const glow = parseColor(mix(p.lava, '#ff8a3c', 0.4));
    const S = size;
    const h = new Float32Array(S * S);
    const alb = new Float32Array(S * S * 3);
    for (let y = 0; y < S; y++) {
      const v = y / S;
      for (let x = 0; x < S; x++) {
        const u = x / S;
        const base = n.fbm(u * 18, v * 18, 5) * 0.5 + 0.5;
        // Wind piles fine ash into drifts and leaves the clinker standing.
        const dune = drift.fbm(u * 6, v * 6, 4) * 0.5 + 0.5;
        const [c1, c2, cid] = clinker.f1f2id(u * 20, v * 20);
        const lump = cid > 0.62 ? 1 - smoothstep(0.08, 0.3, c1) : 0;
        const gap = smoothstep(0.0, 0.07, (c2 - c1) * 0.5);
        h[y * S + x] = 0.32 + dune * 0.3 + base * 0.2 + lump * 0.35 + gap * 0.05;
        const t = clamp01(base * 0.5 + dune * 0.42 - lump * 0.4);
        const c = r(t);
        // Fire still in the cracks under the crust, in the deepest hollows.
        const heat = clamp01(ember.turbulence(u * 9, v * 9, 3) * 1.6 - 0.85) * clamp01(0.5 - dune) * 1.4;
        const i = (y * S + x) * 3;
        alb[i] = lerp(c[0], glow.r, heat);
        alb[i + 1] = lerp(c[1], glow.g, heat);
        alb[i + 2] = lerp(c[2], glow.b, heat);
      }
    }
    const light = reliefLight(h, S, { strength: 0.7, ao: 0.45, aoRadius: Math.max(2, Math.round(S / 26)) });
    const out = px.data;
    for (let i = 0; i < S * S; i++) {
      const j = i * 3, o = i * 4, l = light[i];
      out[o] = alb[j] * l; out[o + 1] = alb[j + 1] * l; out[o + 2] = alb[j + 2] * l; out[o + 3] = 255;
    }
  },
});

// --- Vegetation ------------------------------------------------------------

def({
  id: 'forest', label: 'Broadleaf Canopy', group: 'vegetation', scale: 1,
  make(px, p, rng) {
    const cell = new WorleyNoise(9, rng.int(1, 1e6), 1);
    const n = new TileableNoise(24, rng.int(1, 1e6));
    const r = ramp([
      { t: 0, color: mix(p.forest, '#0d1c0d', 0.6) },
      { t: 0.4, color: p.forest },
      { t: 0.8, color: mix(p.forest, p.grass, 0.55) },
      { t: 1, color: mix(p.forest, '#d3e08a', 0.45) },
    ]);
    px.each((u, v) => {
      const [f1, f2] = cell.f1f2(u * 9, v * 9);
      const crown = 1 - smoothstep(0.0, 0.55, f1);
      const detail = n.turbulence(u * 24, v * 24, 3);
      const c = r(clamp01(crown * 0.85 + detail * 0.35 - 0.1));
      return [c[0], c[1], c[2], 255];
    });
  },
});

def({
  id: 'forest-pine', label: 'Pine Forest', group: 'vegetation', scale: 1,
  make(px, p, rng) {
    const cell = new WorleyNoise(12, rng.int(1, 1e6), 1);
    const n = new TileableNoise(30, rng.int(1, 1e6));
    const dark = mix(p.forest, '#123a2a', 0.5);
    const r = ramp([
      { t: 0, color: mix(dark, '#050f0b', 0.5) },
      { t: 0.45, color: dark },
      { t: 1, color: mix(dark, '#6f9c62', 0.7) },
    ]);
    px.each((u, v) => {
      const [f1] = cell.f1f2(u * 12, v * 12);
      const cone = 1 - smoothstep(0, 0.45, f1);
      const detail = n.turbulence(u * 30, v * 30, 3);
      const c = r(clamp01(cone * 0.9 + detail * 0.25 - 0.08));
      return [c[0], c[1], c[2], 255];
    });
  },
});

def({
  id: 'jungle', label: 'Jungle', group: 'vegetation', scale: 1,
  make(px, p, rng) {
    const cell = new WorleyNoise(7, rng.int(1, 1e6), 1);
    const cell2 = new WorleyNoise(15, rng.int(1, 1e6), 1);
    const base0 = mix(p.forest, '#1f6b28', 0.55);
    const r = ramp([
      { t: 0, color: mix(base0, '#04170a', 0.55) },
      { t: 0.4, color: base0 },
      { t: 1, color: mix(base0, '#a8d858', 0.6) },
    ]);
    px.each((u, v) => {
      const [a1] = cell.f1f2(u * 7, v * 7);
      const [b1] = cell2.f1f2(u * 15, v * 15);
      const crown = (1 - smoothstep(0, 0.5, a1)) * 0.65 + (1 - smoothstep(0, 0.4, b1)) * 0.5;
      const c = r(clamp01(crown - 0.1));
      return [c[0], c[1], c[2], 255];
    });
  },
});

def({
  id: 'moss', label: 'Moss & Lichen', group: 'vegetation', scale: 1,
  make(px, p, rng, size) {
    // Every field here is sampled at exactly its own period. Warping one noise
    // by another only stays seamless if the warp itself wraps, and the old
    // version warped a period-20 field by a period-7 one sampled at 4 — which
    // put a visible crease down two edges of every mossy surface in the app.
    const warpN = new TileableNoise(4, rng.int(1, 1e6));
    const colonyN = new TileableNoise(7, rng.int(1, 1e6));
    const patchN = new TileableNoise(18, rng.int(1, 1e6));
    const fuzz = new TileableNoise(48, rng.int(1, 1e6));
    const clump = new WorleyNoise(24, rng.int(1, 1e6), 1);
    const base0 = mix(mix(p.forest, '#5f7a3a', 0.6), '#6e7358', 0.28);
    const r = ramp([
      { t: 0, color: mix(base0, '#141f10', 0.7) },
      { t: 0.3, color: mix(base0, '#1c2a16', 0.55) },
      { t: 0.55, color: base0 },
      { t: 0.8, color: mix(base0, '#9dbb62', 0.5) },
      { t: 1, color: mix(base0, '#d6e6a4', 0.62) },
    ]);
    const S = size;
    const h = new Float32Array(S * S);
    const alb = new Float32Array(S * S * 3);
    for (let y = 0; y < S; y++) {
      const v = y / S;
      for (let x = 0; x < S; x++) {
        const u = x / S;
        const wx = warpN.fbm(u * 4, v * 4, 2) * 0.16;
        const wy = warpN.fbm(u * 4 + 2.3, v * 4 + 5.1, 2) * 0.16;
        const colony = smoothstep(0.3, 0.78, colonyN.fbm((u + wx) * 7, (v + wy) * 7, 3) * 0.5 + 0.5);
        const patchy = (patchN.fbm(u * 18, v * 18, 2) * 0.5 + 0.5) * 0.3;
        const grain = fuzz.noise(u * 48, v * 48) * 0.5 + 0.5;
        // Moss grows in cushions. A cushion catches the light on its crown and
        // is dark in the gap beside it, which is the whole reason moss reads as
        // deep and not as green paint.
        const [c1, c2] = clump.f1f2(u * 24, v * 24);
        const cushion = (1 - smoothstep(0.05, 0.42, c1)) * colony;
        const gap = smoothstep(0.0, 0.12, c2 - c1);
        h[y * S + x] = 0.3 + cushion * 0.55 + colony * 0.2 + (grain - 0.5) * 0.1 - (1 - gap) * 0.2;
        const t = clamp01(0.18 + colony * 0.5 + patchy + cushion * 0.24 + (grain - 0.5) * 0.22);
        const c = r(t);
        const i = (y * S + x) * 3;
        alb[i] = c[0]; alb[i + 1] = c[1]; alb[i + 2] = c[2];
      }
    }
    const light = reliefLight(h, S, { strength: 0.75, ao: 0.55, aoRadius: Math.max(2, Math.round(S / 30)) });
    const out = px.data;
    for (let i = 0; i < S * S; i++) {
      const j = i * 3, o = i * 4, l = light[i];
      out[o] = alb[j] * l; out[o + 1] = alb[j + 1] * l; out[o + 2] = alb[j + 2] * l; out[o + 3] = 255;
    }
  },
});

// --- Rock ------------------------------------------------------------------

def({
  id: 'rock', label: 'Rock', group: 'rock', scale: 1,
  make(px, p, rng, size) {
    const n = new TileableNoise(12, rng.int(1, 1e6));
    const crack = new TileableNoise(28, rng.int(1, 1e6));
    const fine = new TileableNoise(72, rng.int(1, 1e6));
    const lichen = new WorleyNoise(18, rng.int(1, 1e6), 1);
    const r = ramp([
      { t: 0, color: mix(p.rock, '#000000', 0.55) },
      { t: 0.3, color: mix(p.rock, '#000000', 0.25) },
      { t: 0.62, color: p.rock },
      { t: 1, color: mix(p.rock, '#ffffff', 0.45) },
    ]);
    const lichenC = parseColor(mix(p.grass, '#9aa870', 0.5));
    const S = size;
    const h = new Float32Array(S * S);
    const alb = new Float32Array(S * S * 3);
    for (let y = 0; y < S; y++) {
      const v = y / S;
      for (let x = 0; x < S; x++) {
        const u = x / S;
        const base = n.fbm(u * 12, v * 12, 5) * 0.5 + 0.5;
        // Cracks are cut into the surface rather than painted over it, so the
        // light decides which side of one is bright.
        const cr = 1 - smoothstep(0, 0.08, Math.abs(crack.fbm(u * 28, v * 28, 3)));
        const grit = fine.noise(u * 72, v * 72);
        h[y * S + x] = 0.35 + base * 0.45 + grit * 0.07 - cr * 0.4;
        const t = clamp01(base + grit * 0.08);
        const c = r(t);
        // Lichen crusts on the sheltered side of the exposed rock.
        const [l1, , lid] = lichen.f1f2id(u * 18, v * 18);
        const crust = lid > 0.7 ? (1 - smoothstep(0.05, 0.3, l1)) * 0.4 : 0;
        const i = (y * S + x) * 3;
        alb[i] = lerp(c[0], lichenC.r, crust);
        alb[i + 1] = lerp(c[1], lichenC.g, crust);
        alb[i + 2] = lerp(c[2], lichenC.b, crust);
      }
    }
    const light = reliefLight(h, S, { strength: 0.8, ao: 0.5, aoRadius: Math.max(2, Math.round(S / 28)) });
    const out = px.data;
    for (let i = 0; i < S * S; i++) {
      const j = i * 3, o = i * 4, l = light[i];
      out[o] = alb[j] * l; out[o + 1] = alb[j + 1] * l; out[o + 2] = alb[j + 2] * l; out[o + 3] = 255;
    }
  },
});

def({
  id: 'cliff', label: 'Cliff Face', group: 'rock', scale: 2,
  make(px, p, rng) {
    const n = new TileableNoise(6, rng.int(1, 1e6));
    const strata = new TileableNoise(3, rng.int(1, 1e6));
    const r = ramp([
      { t: 0, color: mix(p.rock, '#191512', 0.6) },
      { t: 0.45, color: p.rock },
      { t: 0.8, color: mix(p.rock, p.highland, 0.6) },
      { t: 1, color: mix(p.rock, '#ffffff', 0.5) },
    ]);
    const vert = new TileableNoise(30, rng.int(1, 1e6));
    px.each((u, v) => {
      // Bedding planes: a sine in v, buckled by noise, but crisped up so the
      // strata read as edges of rock rather than as an airbrushed ripple.
      const fold = strata.fbm(u * 3, v * 3, 3) * 2;
      const wave = Math.sin((v * 9 + fold) * Math.PI * 2);
      const layer = Math.sign(wave) * Math.pow(Math.abs(wave), 0.55) * 0.2;
      // Shadow line under each bed, where the rock above overhangs.
      const shelf = smoothstep(0.86, 1, wave) * 0.18;
      // Vertical jointing and weathering streaks down the face.
      const streak = (vert.noise(u * 30, v * 4) * 0.5 + 0.5) * 0.16;
      const grain = n.turbulence(u * 6, v * 6, 5) * 0.42;
      const c = r(clamp01(0.46 + layer + grain - shelf - streak * 0.6));
      return [c[0], c[1], c[2], 255];
    });
  },
});

def({
  id: 'scree', label: 'Scree & Gravel', group: 'rock', scale: 1,
  make(px, p, rng) {
    const coarse = new WorleyNoise(14, rng.int(1, 1e6), 1);
    const fine = new WorleyNoise(34, rng.int(1, 1e6), 1);
    const n = new TileableNoise(9, rng.int(1, 1e6));
    const r = ramp([
      { t: 0, color: mix(p.rock, '#141110', 0.6) },
      { t: 0.42, color: mix(p.rock, '#000000', 0.22) },
      { t: 0.72, color: p.rock },
      { t: 1, color: mix(p.rock, '#efe7d8', 0.62) },
    ]);
    px.each((u, v) => {
      // Two grades of stone, each lit from the same direction, each with a
      // per-stone tone. A single Worley layer with flat interiors reads as
      // paving; loose scree is stones of different sizes at different angles.
      const [c1, c2, id1] = coarse.f1f2id(u * 14, v * 14);
      const [d1, d2, id2] = fine.f1f2id(u * 34, v * 34);
      const bigEdge = smoothstep(0.0, 0.09, c2 - c1);
      const smallEdge = smoothstep(0.0, 0.11, d2 - d1);
      // Facing: stones nearer their own centre catch more light.
      const facing = 1 - clamp01(c1 * 1.5);
      const tone = (id1 - 0.5) * 0.34 + (id2 - 0.5) * 0.2;
      const drift = n.fbm(u * 9, v * 9, 3) * 0.16;
      const t = clamp01(0.55 + tone + facing * 0.22 + drift
        - (1 - bigEdge) * 0.45 - (1 - smallEdge) * 0.16);
      const c = r(t);
      return [c[0], c[1], c[2], 255];
    });
  },
});

def({
  id: 'mountain-rock', label: 'Alpine Rock', group: 'rock', scale: 1,
  make(px, p, rng, size) {
    // Each field is sampled at its own period. The previous version drove a
    // period-6 noise at 2.4 and 10 units across the tile, so the strata did not
    // meet themselves and every highland on the map carried a cross of seams.
    const warpN = new TileableNoise(4, rng.int(1, 1e6));
    const strata = new TileableNoise(12, rng.int(1, 1e6));
    const detailN = new TileableNoise(24, rng.int(1, 1e6));
    const frac = new WorleyNoise(11, rng.int(1, 1e6), 1);
    const hair = new WorleyNoise(27, rng.int(1, 1e6), 1);
    const r = ramp([
      { t: 0, color: mix(p.highland, '#0e0b08', 0.55) },
      { t: 0.35, color: mix(p.highland, '#000000', 0.2) },
      { t: 0.68, color: p.highland },
      { t: 1, color: mix(p.highland, p.rock, 0.75) },
    ]);
    const S = size;
    const h = new Float32Array(S * S);
    const alb = new Float32Array(S * S * 3);
    for (let y = 0; y < S; y++) {
      const v = y / S;
      for (let x = 0; x < S; x++) {
        const u = x / S;
        // Folded strata: warp along one axis so the bands buckle.
        const warp = warpN.fbm(u * 4, v * 4, 3) * 0.06;
        const band = strata.fbm((u + warp) * 12, (v + warp * 2) * 12, 5) * 0.5 + 0.5;
        const grain = detailN.turbulence(u * 24, v * 24, 4);
        // Joints at two scales, each block shaded on its own, so it reads as a
        // fractured face rather than as crazy paving.
        const [f1, f2, id] = frac.f1f2id(u * 11, v * 11);
        const joint = 1 - smoothstep(0.0, 0.03, f2 - f1);
        const [g1, g2] = hair.f1f2(u * 27, v * 27);
        const hairline = 1 - smoothstep(0.0, 0.045, g2 - g1);
        const block = (id - 0.5) * 0.16;
        // Each block is tilted a little differently, which is what gives a rock
        // face its facets once the light is applied.
        const tilt = (hashi(Math.round(id * 9973), 1, 7) - 0.5) * 0.5;
        h[y * S + x] = 0.45 + band * 0.3 + block * 0.6 + tilt * (1 - f1) * 0.5
          + grain * 0.12 - joint * 0.5 - hairline * 0.18;
        const t = clamp01(band * 0.84 + grain * 0.2 + block - joint * 0.24 - hairline * 0.1);
        const c = r(t);
        const i = (y * S + x) * 3;
        alb[i] = c[0]; alb[i + 1] = c[1]; alb[i + 2] = c[2];
      }
    }
    const light = reliefLight(h, S, { strength: 0.8, ao: 0.5, aoRadius: Math.max(2, Math.round(S / 26)) });
    const out = px.data;
    for (let i = 0; i < S * S; i++) {
      const j = i * 3, o = i * 4, l = light[i];
      out[o] = alb[j] * l; out[o + 1] = alb[j + 1] * l; out[o + 2] = alb[j + 2] * l; out[o + 3] = 255;
    }
  },
});

def({
  id: 'lava', label: 'Lava', group: 'special', scale: 1,
  make(px, p, rng) {
    const cell = new WorleyNoise(9, rng.int(1, 1e6), 1);
    const n = new TileableNoise(20, rng.int(1, 1e6));
    const r = ramp([
      { t: 0, color: '#1b1210' },
      { t: 0.35, color: '#3a2018' },
      { t: 0.62, color: mix(p.lava, '#000000', 0.35) },
      { t: 0.82, color: p.lava },
      { t: 1, color: '#ffe08a' },
    ]);
    px.each((u, v) => {
      const [f1, f2] = cell.f1f2(u * 9, v * 9);
      const crackle = 1 - smoothstep(0.0, 0.14, f2 - f1);
      const base = n.turbulence(u * 20, v * 20, 3);
      const c = r(clamp01(crackle * 0.95 + base * 0.25));
      return [c[0], c[1], c[2], 255];
    });
  },
});

// --- Interiors -------------------------------------------------------------

def({
  id: 'stone-floor', label: 'Dungeon Stone', group: 'interior', scale: 1,
  make(px, p, rng, size, detail) {
    // Flagstones on a grid, but the grid was the problem: four rows of four
    // with a per-cell light/dark flip read as a chequerboard, and the tile
    // repeat was the most visible thing on any dungeon floor. Now the courses
    // are broken, the stones vary in length, and the tone comes from the stone
    // rather than from a coin toss.
    const k = clamp(Math.sqrt(detail), 0.6, 2.6);
    const rows = Math.max(4, Math.round(5 * k) + (Math.round(5 * k) % 2));
    const cols = Math.max(3, Math.round(rows * 0.9));
    const salt = rng.int(1, 1e6);
    const grain = new TileableNoise(48, rng.int(1, 1e6));
    const fine = new TileableNoise(96, rng.int(1, 1e6));
    const wobble = new TileableNoise(10, rng.int(1, 1e6));
    const damp = new TileableNoise(6, rng.int(1, 1e6));
    const base0 = mix(p.rock, '#6a6259', 0.6);
    const r = ramp([
      { t: 0, color: mix(base0, '#17140f', 0.55) },
      { t: 0.35, color: mix(base0, '#000000', 0.22) },
      { t: 0.68, color: base0 },
      { t: 1, color: mix(base0, '#ded6c8', 0.5) },
    ]);
    const mortarC = parseColor(mix(base0, '#2b2620', 0.55));
    const mossC = parseColor(mix(p.forest, '#4e6b34', 0.45));
    const S = size;
    const h = new Float32Array(S * S);
    const alb = new Float32Array(S * S * 3);
    const jt = 0.16 / rows;
    for (let y = 0; y < S; y++) {
      const v = y / S;
      for (let x = 0; x < S; x++) {
        const u = x / S;
        const uu = u + wobble.noise(u * 10, v * 10) * 0.1 / cols;
        const vv = v + wobble.noise(u * 10 + 4.1, v * 10 + 2.6) * 0.1 / rows;
        const rowI = Math.floor(vv * rows);
        const row = ((rowI % rows) + rows) % rows;
        const by = vv * rows - rowI;
        const off = (hashi(row, 0, salt) * 0.8) / cols;
        const colF = (uu + off) * cols;
        const col = ((Math.floor(colF) % cols) + cols) % cols;
        const bx = colF - Math.floor(colF);
        // A flag that runs double length; the joint it swallows is gone for
        // both stones or neither, so the tile still wraps.
        const wide = (c: number) => hashi(row, c, salt + 5) < 0.26;
        const prev = ((col - 1) + cols) % cols;
        const mHere = wide(col) && !wide(prev);
        const mNext = wide((col + 1) % cols) && !mHere && !wide(col);
        const dx = Math.min(mHere ? 1 : bx, mNext ? 1 : 1 - bx) / cols;
        const dy = Math.min(by, 1 - by) / rows;
        const d = Math.min(dx, dy);
        const face = smoothstep(jt * 0.2, jt * 0.95, d);
        const bevel = smoothstep(jt * 0.9, jt * 3.2, d);
        const id = hashi(row, mHere ? prev : col, salt + 17);
        const g = grain.fbm(u * 48, v * 48, 3) * 0.5 + 0.5;
        const speck = fine.noise(u * 96, v * 96);
        // Worn hollows in the middle of the stones people walk over.
        const worn = clamp01(damp.fbm(u * 6, v * 6, 3) * 1.4 + 0.4);
        h[y * S + x] = 0.35 + face * 0.42 + bevel * 0.16 + (id - 0.5) * 0.1
          + speck * 0.05 - worn * face * 0.07;
        const t = clamp01(0.35 + (id - 0.5) * 0.5 + g * 0.28 + speck * 0.1 + worn * 0.1);
        const c = r(t);
        let rr = c[0], gg = c[1], bb = c[2];
        const mo = 1 - face;
        if (mo > 0.001) {
          const grit = 1 + speck * 0.2;
          rr = lerp(rr, mortarC.r * grit, mo); gg = lerp(gg, mortarC.g * grit, mo); bb = lerp(bb, mortarC.b * grit, mo);
        }
        // Damp collects in the joints of an underground floor.
        const wet = clamp01((1 - worn) * mo * 1.2) * 0.4;
        rr = lerp(rr, mossC.r, wet); gg = lerp(gg, mossC.g, wet); bb = lerp(bb, mossC.b, wet);
        const i = (y * S + x) * 3;
        alb[i] = rr; alb[i + 1] = gg; alb[i + 2] = bb;
      }
    }
    const light = reliefLight(h, S, { strength: 0.85, ao: 0.55, aoRadius: Math.max(2, Math.round(S / (rows * 3))) });
    const out = px.data;
    for (let i = 0; i < S * S; i++) {
      const j = i * 3, o = i * 4, l = light[i];
      out[o] = alb[j] * l; out[o + 1] = alb[j + 1] * l; out[o + 2] = alb[j + 2] * l; out[o + 3] = 255;
    }
  },
});

def({
  id: 'flagstone', label: 'Flagstone', group: 'interior', scale: 1,
  make(px, p, rng, size, detail) {
    const k = clamp(Math.sqrt(detail), 0.6, 2.6);
    const period = Math.max(4, Math.round(6 * k));
    const cell = new WorleyNoise(period, rng.int(1, 1e6), 0.85);
    const n = new TileableNoise(30, rng.int(1, 1e6));
    const fine = new TileableNoise(90, rng.int(1, 1e6));
    const damp = new TileableNoise(6, rng.int(1, 1e6));
    const base0 = mix(p.rock, '#7d766b', 0.6);
    const r = ramp([
      { t: 0, color: mix(base0, '#211d19', 0.6) },
      { t: 0.35, color: mix(base0, '#000000', 0.2) },
      { t: 0.6, color: base0 },
      { t: 1, color: mix(base0, '#efe8da', 0.5) },
    ]);
    const jointC = parseColor(mix(base0, '#2a251f', 0.6));
    const mossC = parseColor(mix(p.forest, '#54702f', 0.4));
    const S = size;
    const h = new Float32Array(S * S);
    const alb = new Float32Array(S * S * 3);
    for (let y = 0; y < S; y++) {
      const v = y / S;
      for (let x = 0; x < S; x++) {
        const u = x / S;
        const [f1, f2, id] = cell.f1f2id(u * period, v * period);
        const d = (f2 - f1) * 0.5;
        const face = smoothstep(0.008, 0.05, d);
        const bevel = smoothstep(0.04, 0.14, d);
        const grain = n.fbm(u * 30, v * 30, 3) * 0.5 + 0.5;
        const speck = fine.noise(u * 90, v * 90);
        // Each flag was laid on its own bed and none of them is quite level.
        const tilt = (hashi(Math.round(id * 8191), 2, 11) - 0.5) * 0.4;
        h[y * S + x] = 0.34 + face * 0.4 + bevel * 0.16 + (id - 0.5) * 0.12
          + tilt * (1 - clamp01(f1 * 2)) * 0.3 + speck * 0.04;
        const t = clamp01(0.3 + (id - 0.5) * 0.46 + grain * 0.32 + speck * 0.1);
        const c = r(t);
        let rr = c[0], gg = c[1], bb = c[2];
        const mo = 1 - face;
        if (mo > 0.001) {
          const grit = 1 + speck * 0.22;
          rr = lerp(rr, jointC.r * grit, mo); gg = lerp(gg, jointC.g * grit, mo); bb = lerp(bb, jointC.b * grit, mo);
        }
        const wet = clamp01(damp.fbm(u * 6, v * 6, 3) * 1.5 + 0.2) * mo * 0.5;
        rr = lerp(rr, mossC.r, wet); gg = lerp(gg, mossC.g, wet); bb = lerp(bb, mossC.b, wet);
        const i = (y * S + x) * 3;
        alb[i] = rr; alb[i + 1] = gg; alb[i + 2] = bb;
      }
    }
    const light = reliefLight(h, S, { strength: 0.85, ao: 0.55, aoRadius: Math.max(2, Math.round(S / (period * 3))) });
    const out = px.data;
    for (let i = 0; i < S * S; i++) {
      const j = i * 3, o = i * 4, l = light[i];
      out[o] = alb[j] * l; out[o + 1] = alb[j + 1] * l; out[o + 2] = alb[j + 2] * l; out[o + 3] = 255;
    }
  },
});

def({
  id: 'cobble', label: 'Cobblestone', group: 'interior', scale: 1,
  make(px, p, rng, size, detail) {
    const k = clamp(Math.sqrt(detail), 0.6, 2.8);
    const period = Math.max(6, Math.round(12 * k));
    const cell = new WorleyNoise(period, rng.int(1, 1e6), 1);
    const n = new TileableNoise(48, rng.int(1, 1e6));
    const ruts = new TileableNoise(6, rng.int(1, 1e6));
    const base0 = mix(p.rock, '#8a8375', 0.55);
    const r = ramp([
      { t: 0, color: '#201c17' },
      { t: 0.28, color: mix(base0, '#000000', 0.35) },
      { t: 0.6, color: base0 },
      { t: 1, color: mix(base0, '#ffffff', 0.4) },
    ]);
    const mud = parseColor(mix(p.lowland, '#3a2c1b', 0.7));
    const S = size;
    const h = new Float32Array(S * S);
    const alb = new Float32Array(S * S * 3);
    for (let y = 0; y < S; y++) {
      const v = y / S;
      for (let x = 0; x < S; x++) {
        const u = x / S;
        const [f1, f2, id] = cell.f1f2id(u * period, v * period);
        const joint = smoothstep(0.0, 0.055, (f2 - f1) * 0.5);
        // A cobble is a dome, so the height is the distance from its own
        // centre; that is what gives the whole surface its bobble.
        const dome = 1 - smoothstep(0.0, 0.42, f1);
        const grit = n.noise(u * 48, v * 48);
        // Cart ruts: the two lines where the stones have been polished and
        // pressed down over a couple of centuries.
        const rut = clamp01(ruts.fbm(u * 6, v * 6, 3) * 1.6 + 0.35);
        h[y * S + x] = 0.3 + joint * 0.22 + dome * 0.45 + (id - 0.5) * 0.1
          + grit * 0.04 - rut * 0.1;
        const t = clamp01(0.34 + (id - 0.5) * 0.42 + dome * 0.34 + joint * 0.14 + grit * 0.1);
        const c = r(t);
        // Mud in the gaps between the stones, which is where it always is.
        const fill = clamp01((1 - joint) * 1.1) * (0.35 + rut * 0.4);
        const i = (y * S + x) * 3;
        alb[i] = lerp(c[0], mud.r, fill);
        alb[i + 1] = lerp(c[1], mud.g, fill);
        alb[i + 2] = lerp(c[2], mud.b, fill);
      }
    }
    const light = reliefLight(h, S, { strength: 0.9, ao: 0.6, aoRadius: Math.max(2, Math.round(S / (period * 2.5))) });
    const out = px.data;
    for (let i = 0; i < S * S; i++) {
      const j = i * 3, o = i * 4, l = light[i];
      out[o] = alb[j] * l; out[o + 1] = alb[j + 1] * l; out[o + 2] = alb[j + 2] * l; out[o + 3] = 255;
    }
  },
});

def({
  id: 'wood-planks', label: 'Wood Planks', group: 'interior', scale: 1,
  make(px, p, rng, size, detail) {
    const k = clamp(Math.sqrt(detail), 0.6, 2.4);
    const planks = Math.max(3, Math.round(5 * k));
    const grainN = new TileableNoise(64, rng.int(1, 1e6));
    const knots = new TileableNoise(16, rng.int(1, 1e6));
    const wearN = new TileableNoise(8, rng.int(1, 1e6));
    const salt = rng.int(1, 1e6);
    const r = ramp([
      { t: 0, color: '#33220f' },
      { t: 0.4, color: '#63421f' },
      { t: 0.72, color: '#8a6135' },
      { t: 1, color: '#bd9057' },
    ]);
    const S = size;
    const h = new Float32Array(S * S);
    const alb = new Float32Array(S * S * 3);
    for (let y = 0; y < S; y++) {
      const v = y / S;
      for (let x = 0; x < S; x++) {
        const u = x / S;
        const band = Math.floor(v * planks);
        const inBand = v * planks - band;
        const tone = hashi(band, 0, salt);
        // The grain frequency has to be a whole number of cycles across the
        // tile or the board does not meet itself at the edge — the old version
        // used 60 + tone*30 and put a hard line down every wall in the game.
        const cycles = 52 + Math.round(tone * 26);
        const wander = grainN.fbm(u * 64, v * 64, 3) * 1.4;
        const ring = Math.sin(u * cycles * Math.PI * 2 + wander * 3 + tone * 19);
        const figure = Math.sign(ring) * Math.pow(Math.abs(ring), 0.65);
        // Knots sit on one board and stay there.
        const kn = Math.max(0, 1 - Math.abs(knots.fbm(u * 16, v * 16, 3)) * 7);
        // Boards are not planed flat: each is slightly domed, and the shadow
        // between two of them is a gap rather than a painted line.
        const gap = smoothstep(0, 0.06, inBand) * smoothstep(0, 0.06, 1 - inBand);
        const dome = Math.sin(inBand * Math.PI);
        const cup = (hashi(band, 3, salt) - 0.5) * 0.25;
        h[y * S + x] = gap * (0.62 + dome * 0.3 + cup * dome) + figure * 0.05 - kn * 0.22;
        // Footfall polishes the middle of a floor and dirt collects at the edges.
        const traffic = clamp01(wearN.fbm(u * 8, v * 8, 3) * 1.5 + 0.5);
        const c = r(clamp01(0.34 + figure * 0.16 + tone * 0.26 - kn * 0.55 + traffic * 0.1));
        const i = (y * S + x) * 3;
        const grime = 1 - (1 - gap) * 0.25;
        alb[i] = c[0] * grime; alb[i + 1] = c[1] * grime; alb[i + 2] = c[2] * grime;
      }
    }
    const light = reliefLight(h, S, { strength: 0.85, ao: 0.5, aoRadius: Math.max(2, Math.round(S / 40)) });
    const out = px.data;
    for (let i = 0; i < S * S; i++) {
      const j = i * 3, o = i * 4, l = light[i];
      out[o] = alb[j] * l; out[o + 1] = alb[j + 1] * l; out[o + 2] = alb[j + 2] * l; out[o + 3] = 255;
    }
  },
});

def({
  id: 'brick', label: 'Brick', group: 'interior', scale: 1,
  make(px, p, rng, size, detail) {
    const k = clamp(Math.sqrt(detail), 0.6, 2.6);
    const rows = Math.max(4, Math.round(6 * k) + (Math.round(6 * k) % 2));
    const cols = Math.max(2, Math.round(rows / 2));
    const grit = new TileableNoise(48, rng.int(1, 1e6));
    const fine = new TileableNoise(96, rng.int(1, 1e6));
    const damp = new TileableNoise(6, rng.int(1, 1e6));
    const salt = rng.int(1, 1e6);
    const r = ramp([
      { t: 0, color: '#3f211b' },
      { t: 0.35, color: '#6d3428' },
      { t: 0.68, color: '#93493a' },
      { t: 1, color: '#c07f66' },
    ]);
    const mortarC = parseColor('#a89e8c');
    const mossC = parseColor(mix(p.forest, '#5f7a3a', 0.45));
    const S = size;
    const h = new Float32Array(S * S);
    const alb = new Float32Array(S * S * 3);
    for (let y = 0; y < S; y++) {
      const v = y / S;
      for (let x = 0; x < S; x++) {
        const u = x / S;
        const row = Math.floor(v * rows) % rows;
        const by = v * rows - Math.floor(v * rows);
        const offset = (row % 2) * 0.5 / cols;
        const colF = (u + offset) * cols;
        // Modulo, because the last column of the tile and the first are the
        // same brick: without it the brick that straddles the edge is drawn in
        // two different colours.
        const col = ((Math.floor(colF) % cols) + cols) % cols;
        const bx = colF - Math.floor(colF);
        const mortar = Math.min(
          smoothstep(0, 0.055, bx) * smoothstep(0, 0.055, 1 - bx),
          smoothstep(0, 0.09, by) * smoothstep(0, 0.09, 1 - by),
        );
        const tone = hashi(row, col, salt);
        const face = grit.noise(u * 48, v * 48) * 0.1 + fine.noise(u * 96, v * 96) * 0.06;
        h[y * S + x] = mortar * 0.72 + 0.1 + face * 0.2;
        const c = r(clamp01(0.3 + tone * 0.5 + face));
        const m = 1 + grit.noise(u * 48 + 3, v * 48 + 7) * 0.14;
        let rr = lerp(mortarC.r * m, c[0], mortar);
        let gg = lerp(mortarC.g * m, c[1], mortar);
        let bb = lerp(mortarC.b * m, c[2], mortar);
        // Damp creeps up out of the joints; brick is porous and shows it.
        const wet = clamp01(damp.fbm(u * 6, v * 6, 3) * 1.6 + 0.15) * (1 - mortar) * 0.5;
        rr = lerp(rr, mossC.r, wet); gg = lerp(gg, mossC.g, wet); bb = lerp(bb, mossC.b, wet);
        const i = (y * S + x) * 3;
        alb[i] = rr; alb[i + 1] = gg; alb[i + 2] = bb;
      }
    }
    const light = reliefLight(h, S, { strength: 0.9, ao: 0.5, aoRadius: Math.max(2, Math.round(S / 36)) });
    const out = px.data;
    for (let i = 0; i < S * S; i++) {
      const j = i * 3, o = i * 4, l = light[i];
      out[o] = alb[j] * l; out[o + 1] = alb[j + 1] * l; out[o + 2] = alb[j + 2] * l; out[o + 3] = 255;
    }
  },
});

def({
  id: 'marble', label: 'Marble', group: 'interior', scale: 2,
  make(px, p, rng, size) {
    const n = new TileableNoise(6, rng.int(1, 1e6));
    const vein = new TileableNoise(12, rng.int(1, 1e6));
    const fine = new TileableNoise(64, rng.int(1, 1e6));
    const r = ramp([
      { t: 0, color: '#5d5a55' },
      { t: 0.28, color: '#9d968b' },
      { t: 0.55, color: '#d5cfc4' },
      { t: 0.82, color: '#ece7dd' },
      { t: 1, color: '#ffffff' },
    ]);
    const S = size;
    const h = new Float32Array(S * S);
    const alb = new Float32Array(S * S * 3);
    for (let y = 0; y < S; y++) {
      const v = y / S;
      for (let x = 0; x < S; x++) {
        const u = x / S;
        // Every wave has to close on itself across the tile, which means whole
        // numbers of half-cycles in u and v — the old version used sin(u*3*pi)
        // and left a hard vertical line down the middle of every marble floor.
        const w = vein.fbm(u * 12, v * 12, 4) * 0.6;
        // Even multiples: plain sine has period 2pi, so an odd number of half
        // cycles across the tile puts the wave back the other way up.
        const body = Math.sin((u * 2 + v * 4 + w * 3) * Math.PI) * 0.5 + 0.5;
        const v1 = 1 - smoothstep(0, 0.1, Math.abs(Math.sin((u * 3 + v * 2 + w * 4) * Math.PI)));
        const v2 = 1 - smoothstep(0, 0.05, Math.abs(Math.sin((u * 5 - v * 4 + w * 7) * Math.PI)));
        const v3 = 1 - smoothstep(0, 0.028, Math.abs(Math.sin((u * 2 + v * 7 + w * 9) * Math.PI)));
        const grain = n.fbm(u * 6, v * 6, 3) * 0.09;
        const t = clamp01(0.5 + body * 0.42 + grain - v1 * 0.34 - v2 * 0.2 - v3 * 0.16);
        // Polished stone: almost no relief, but the veins are softer than the
        // matrix and take a fraction less light.
        h[y * S + x] = 0.5 + t * 0.06 + fine.noise(u * 64, v * 64) * 0.02;
        const c = r(t);
        const i = (y * S + x) * 3;
        alb[i] = c[0]; alb[i + 1] = c[1]; alb[i + 2] = c[2];
      }
    }
    const light = reliefLight(h, S, { strength: 0.5, ao: 0.2, aoRadius: Math.max(2, Math.round(S / 24)) });
    const out = px.data;
    for (let i = 0; i < S * S; i++) {
      const j = i * 3, o = i * 4, l = light[i];
      out[o] = alb[j] * l; out[o + 1] = alb[j + 1] * l; out[o + 2] = alb[j + 2] * l; out[o + 3] = 255;
    }
  },
});

def({
  id: 'carpet', label: 'Carpet', group: 'interior', scale: 1,
  make(px, p, rng, size, detail) {
    // A woven pile, not a flat wash of red. Warp and weft at the thread scale,
    // a broad nap that catches the light one way and not the other, and the
    // worn tracks that any rug in a hall acquires.
    const k = clamp(Math.sqrt(detail), 0.6, 2.6);
    const threads = Math.max(48, Math.round(96 * k));
    const fuzz = new TileableNoise(96, rng.int(1, 1e6));
    const nap = new TileableNoise(8, rng.int(1, 1e6));
    const wearN = new TileableNoise(5, rng.int(1, 1e6));
    const base0 = mix(p.accent, '#6a1f22', 0.5);
    const r = ramp([
      { t: 0, color: mix(base0, '#140708', 0.6) },
      { t: 0.35, color: mix(base0, '#000000', 0.25) },
      { t: 0.68, color: base0 },
      { t: 1, color: mix(base0, '#e0b26a', 0.42) },
    ]);
    const border = parseColor(mix(base0, '#d8b26a', 0.55));
    const S = size;
    const out = px.data;
    for (let y = 0; y < S; y++) {
      const v = y / S;
      for (let x = 0; x < S; x++) {
        const u = x / S;
        const warp = Math.sin(u * threads * Math.PI * 2) * 0.5 + 0.5;
        const weft = Math.sin(v * threads * Math.PI * 2) * 0.5 + 0.5;
        // Plain weave: the thread on top alternates, so the two directions
        // interleave instead of forming a grid.
        const over = ((Math.floor(u * threads) + Math.floor(v * threads)) & 1) === 0;
        const weave = over ? warp * 0.8 + weft * 0.2 : weft * 0.8 + warp * 0.2;
        const pile = fuzz.turbulence(u * 96, v * 96, 2);
        const sheen = nap.fbm(u * 8, v * 8, 3) * 0.5 + 0.5;
        const worn = clamp01(wearN.fbm(u * 5, v * 5, 3) * 1.5 + 0.45);
        const t = clamp01(0.28 + pile * 0.42 + (weave - 0.5) * 0.18 + sheen * 0.2 - worn * 0.16);
        const c = r(t);
        // Gold thread woven through the pile. Anything laid out relative to the
        // tile — a border, a medallion — turns into a grid the moment the tile
        // repeats, so the pattern has to come out of the same fields as the
        // rest of the surface.
        const a = clamp01((sheen - 0.72) * 4) * clamp01(pile * 1.6) * (0.5 - worn * 0.3);
        const o = (y * S + x) * 4;
        out[o] = lerp(c[0], border.r, a);
        out[o + 1] = lerp(c[1], border.g, a);
        out[o + 2] = lerp(c[2], border.b, a);
        out[o + 3] = 255;
      }
    }
  },
});

def({
  id: 'cave-floor', label: 'Cavern Floor', group: 'interior', scale: 1,
  make(px, p, rng, size, detail) {
    const k = clamp(Math.sqrt(detail), 0.6, 2.6);
    const n = new TileableNoise(14, rng.int(1, 1e6));
    const pebbleP = Math.max(8, Math.round(18 * k));
    const cell = new WorleyNoise(pebbleP, rng.int(1, 1e6), 1);
    const fine = new TileableNoise(80, rng.int(1, 1e6));
    const wet = new TileableNoise(6, rng.int(1, 1e6));
    const base0 = mix(p.rock, '#574f45', 0.65);
    const r = ramp([
      { t: 0, color: mix(base0, '#0f0d0a', 0.6) },
      { t: 0.35, color: mix(base0, '#000000', 0.25) },
      { t: 0.65, color: base0 },
      { t: 1, color: mix(base0, '#d4c9b6', 0.5) },
    ]);
    const damp = parseColor(mix(base0, '#1d2a2c', 0.65));
    const S = size;
    const h = new Float32Array(S * S);
    const alb = new Float32Array(S * S * 3);
    for (let y = 0; y < S; y++) {
      const v = y / S;
      for (let x = 0; x < S; x++) {
        const u = x / S;
        const base = n.fbm(u * 14, v * 14, 5) * 0.5 + 0.5;
        const [f1, f2, id] = cell.f1f2id(u * pebbleP, v * pebbleP);
        // Loose stone lying on bedrock: each pebble is a dome with its own
        // tone, and the sand between them is lower and darker.
        const dome = 1 - smoothstep(0.05, 0.4, f1);
        const gap = smoothstep(0.0, 0.08, (f2 - f1) * 0.5);
        const grit = fine.noise(u * 80, v * 80);
        h[y * S + x] = 0.3 + base * 0.3 + dome * 0.34 + gap * 0.1 + grit * 0.05;
        const t = clamp01(base * 0.6 + dome * 0.3 + (id - 0.5) * 0.3 + grit * 0.08);
        const c = r(t);
        // Standing water in the low ground, which is where a cave puts it.
        const pool = clamp01(0.55 - base) * clamp01(wet.fbm(u * 6, v * 6, 3) * 1.6 + 0.4) * 0.8;
        const i = (y * S + x) * 3;
        alb[i] = lerp(c[0], damp.r, pool);
        alb[i + 1] = lerp(c[1], damp.g, pool);
        alb[i + 2] = lerp(c[2], damp.b, pool);
      }
    }
    const light = reliefLight(h, S, { strength: 0.8, ao: 0.5, aoRadius: Math.max(2, Math.round(S / (pebbleP * 2)) ) });
    const out = px.data;
    for (let i = 0; i < S * S; i++) {
      const j = i * 3, o = i * 4, l = light[i];
      out[o] = alb[j] * l; out[o + 1] = alb[j + 1] * l; out[o + 2] = alb[j + 2] * l; out[o + 3] = 255;
    }
  },
});

def({
  id: 'metal', label: 'Riveted Metal', group: 'interior', scale: 1,
  make(px, p, rng, size) {
    // Brushing is anisotropic, and a tileable noise cannot simply be stretched
    // — sampling v at a sixth of the period is what put a hard horizontal line
    // across every metal surface. Averaging four taps down the v axis gives the
    // same streaking out of a field that still wraps.
    const brush = new TileableNoise(160, rng.int(1, 1e6));
    const dent = new TileableNoise(12, rng.int(1, 1e6));
    const rustN = new TileableNoise(6, rng.int(1, 1e6));
    const r = ramp([
      { t: 0, color: '#22262a' },
      { t: 0.4, color: '#454b51' },
      { t: 0.72, color: '#6d747a' },
      { t: 1, color: '#a8b0b6' },
    ]);
    const rust = parseColor('#7a4526');
    const S = size;
    const h = new Float32Array(S * S);
    const alb = new Float32Array(S * S * 3);
    for (let y = 0; y < S; y++) {
      const v = y / S;
      for (let x = 0; x < S; x++) {
        const u = x / S;
        const b = (brush.noise(u * 160, v * 160)
          + brush.noise(u * 160, v * 160 + 0.6)
          + brush.noise(u * 160, v * 160 + 1.2)
          + brush.noise(u * 160, v * 160 + 1.8)) * 0.25;
        const hammered = dent.fbm(u * 12, v * 12, 3);
        h[y * S + x] = 0.5 + hammered * 0.35 + b * 0.08;
        const t = clamp01(0.52 + b * 0.5 + hammered * 0.18);
        const c = r(t);
        // Rust blooms where water has stood.
        const ox = clamp01(rustN.turbulence(u * 6, v * 6, 4) * 1.8 - 0.55) * 0.7;
        const i = (y * S + x) * 3;
        alb[i] = lerp(c[0], rust.r, ox);
        alb[i + 1] = lerp(c[1], rust.g, ox);
        alb[i + 2] = lerp(c[2], rust.b, ox);
      }
    }
    const light = reliefLight(h, S, { strength: 0.7, ao: 0.35, aoRadius: Math.max(2, Math.round(S / 20)) });
    const out = px.data;
    for (let i = 0; i < S * S; i++) {
      const j = i * 3, o = i * 4, l = light[i];
      out[o] = alb[j] * l; out[o + 1] = alb[j + 1] * l; out[o + 2] = alb[j + 2] * l; out[o + 3] = 255;
    }
  },
  overlay(ctx, p, rng, size) {
    // Rivets get a lit crown and a shadow, from the same upper-left light.
    const n = 6;
    const rad = size / 76;
    ctx.save();
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const x = (i + 0.5) * (size / n), y = (j + 0.5) * (size / n);
        ctx.fillStyle = 'rgba(0,0,0,0.42)';
        ctx.beginPath(); ctx.arc(x + rad * 0.4, y + rad * 0.45, rad, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(190,198,204,0.5)';
        ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath(); ctx.arc(x - rad * 0.3, y - rad * 0.32, rad * 0.45, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  },
});

// --- Special ---------------------------------------------------------------

def({
  id: 'hatch', label: 'Ink Hatching', group: 'special', scale: 1,
  make(px, p, rng) {
    px.each((u, v) => {
      const line = Math.sin((u + v) * Math.PI * 2 * 18);
      const a = smoothstep(0.4, 0.9, line) * 200;
      const c = parseColor(p.ink);
      return [c.r, c.g, c.b, a];
    });
  },
});

def({
  id: 'crosshatch', label: 'Ink Crosshatch', group: 'special', scale: 1,
  make(px, p, rng) {
    px.each((u, v) => {
      const l1 = Math.sin((u + v) * Math.PI * 2 * 16);
      const l2 = Math.sin((u - v) * Math.PI * 2 * 16);
      const a = (smoothstep(0.5, 0.95, l1) + smoothstep(0.5, 0.95, l2)) * 130;
      const c = parseColor(p.ink);
      return [c.r, c.g, c.b, Math.min(220, a)];
    });
  },
});

def({
  id: 'stipple', label: 'Stipple', group: 'special', scale: 1,
  make(px, p, rng) {
    const w = new WorleyNoise(24, rng.int(1, 1e6), 1);
    px.each((u, v) => {
      const [f1] = w.f1f2(u * 24, v * 24);
      const a = (1 - smoothstep(0.03, 0.14, f1)) * 210;
      const c = parseColor(p.ink);
      return [c.r, c.g, c.b, a];
    });
  },
});

def({
  id: 'fog', label: 'Fog / Cloud', group: 'special', scale: 2,
  make(px, p, rng) {
    const n = new TileableNoise(5, rng.int(1, 1e6));
    px.each((u, v) => {
      const f = clamp01(n.fbm(u * 5, v * 5, 5) * 0.8 + 0.5);
      return [255, 255, 255, f * 190];
    });
  },
});

def({
  id: 'blood', label: 'Blood & Grime', group: 'special', scale: 1,
  make(px, p, rng) {
    const n = new TileableNoise(9, rng.int(1, 1e6));
    px.each((u, v) => {
      const t = clamp01(n.turbulence(u * 9, v * 9, 4) * 1.7 - 0.35);
      const c = parseColor(mix('#4a0f0d', '#7d1c14', t));
      return [c.r, c.g, c.b, t * 235];
    });
  },
});

def({
  id: 'grass-overlay', label: 'Grass Tufts (overlay)', group: 'special', scale: 1,
  make(px, p, rng) {
    const w = new WorleyNoise(14, rng.int(1, 1e6), 1);
    px.each((u, v) => {
      const [f1] = w.f1f2(u * 14, v * 14);
      const a = (1 - smoothstep(0.05, 0.25, f1)) * 160;
      const c = parseColor(mix(p.grass, '#000000', 0.25));
      return [c.r, c.g, c.b, a];
    });
  },
});


// ---------------------------------------------------------------------------
// Built materials
// ---------------------------------------------------------------------------

/**
 * One tile per entry in the material catalogue, synthesised from its numbers.
 *
 * Writing twenty-three of these by hand would guarantee twenty-three different
 * ideas of what a mortar joint is. Instead the bond decides where the units
 * are, the grain decides what one unit's face looks like, the wear decides what
 * has happened to it since, and a single relief pass lights all of it from the
 * upper left. The catalogue is then the only place a material is described.
 */

/**
 * A low-frequency field sampled on a coarse grid and interpolated back up.
 *
 * Weathering, damp, soot and sheen are all fields with a period of a handful
 * of cycles across the tile, and evaluating four octaves of each at every one
 * of 65,536 pixels was three quarters of the cost of building a material.
 * Sampling them at a quarter of the resolution and interpolating is
 * indistinguishable at these frequencies and about ten times cheaper.
 */
function coarseField(q: number, fn: (u: number, v: number) => number): (u: number, v: number) => number {
  const data = new Float32Array(q * q);
  for (let y = 0; y < q; y++) {
    for (let x = 0; x < q; x++) data[y * q + x] = fn(x / q, y / q);
  }
  return (u, v) => {
    const fx = u * q, fy = v * q;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    // Wrapping lookups, so the interpolation carries the tile's own period.
    const xa = ((x0 % q) + q) % q, xb = (xa + 1) % q;
    const ya = ((y0 % q) + q) % q, yb = (ya + 1) % q;
    const a = data[ya * q + xa], b = data[ya * q + xb];
    const c = data[yb * q + xa], d = data[yb * q + xb];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
  };
}

interface UnitSample {
  /** 1 well inside a face, 0 in the middle of a joint. */
  face: number;
  /** 0 at the arris, 1 in the middle of the face — the bevel. */
  bevel: number;
  /** Stable per-unit random in [0,1). */
  id: number;
  /** Position inside the unit, [0,1). */
  bx: number;
  by: number;
  /** 1 when the unit's long axis runs vertically. */
  vert: number;
}

interface BondLayout {
  rows: number;
  cols: number;
  /** Worley period, for the bonds that are laid out by cells rather than courses. */
  period: number;
  /** Joint half-width, in tile units. */
  jt: number;
}

function bondLayout(m: MaterialDef, k: number): BondLayout {
  const c = Math.max(2, Math.round(m.courses * k));
  const aspect = Math.max(0.05, m.aspect);
  switch (m.bond) {
    case 'rubble': case 'polygonal': case 'nodular':
      // Half, because a cell bond's joint is measured across the gap between
      // two cell centres rather than down from the top of a course.
      return { rows: c, cols: c, period: Math.max(3, c), jt: (m.joint * 0.5) / c };
    case 'herringbone': {
      // The pattern repeats every four cells along each axis, so the lattice
      // has to be a multiple of four or the tile cannot wrap.
      const n = Math.max(4, Math.round(c / 4) * 4);
      return { rows: n, cols: n, period: n, jt: m.joint / n };
    }
    case 'stave': {
      const cols = Math.max(3, Math.round(1 / aspect * k));
      return { rows: 1, cols, period: cols, jt: m.joint / cols };
    }
    case 'monolithic':
      return { rows: 1, cols: 1, period: Math.max(3, c), jt: 0 };
    default: {
      // Running bond needs an even number of courses: the half-unit offset on
      // alternate rows only wraps if the last row and the first row disagree.
      let rows = Math.max(2, c);
      if (rows % 2) rows++;
      const cols = Math.max(1, Math.round(rows / aspect));
      return { rows, cols, period: Math.max(3, c), jt: m.joint / rows };
    }
  }
}

/** Rectangular courses — ashlar, brick, planks, staves, laminations. */
function sampleCourses(
  m: MaterialDef, L: BondLayout, u: number, v: number, salt: number, out: UnitSample,
): void {
  const { rows, cols } = L;
  const rowF = v * rows;
  const rowI = Math.floor(rowF);
  const by = rowF - rowI;
  // The joint wobble can push the sample a hair either side of the tile, so
  // the course index has to be taken modulo the count before anything is
  // hashed off it — row −1 and row rows−1 are the same course, and giving them
  // different offsets puts a step across the whole width of the tile.
  const row = ((rowI % rows) + rows) % rows;
  // Running bond, plus a per-course nudge so the perpends do not line up into
  // a lattice. Any constant shift wraps, because the shift is per course.
  const stagger = m.bond === 'stave' || m.bond === 'plank' ? 0 : (row & 1) * 0.5;
  const off = (stagger + hashi(row, 0, salt) * 0.35) / cols;
  const colF = (u + off) * cols;
  const colRaw = Math.floor(colF);
  const bx0 = colF - colRaw;
  const col = ((colRaw % cols) + cols) % cols;

  // Some units are two long. Merging is decided on the left-hand joint only,
  // and a merged unit may not merge again, so the run never exceeds two.
  const mergeP = m.bond === 'coursed' ? 0.3 : m.bond === 'rubble' ? 0.35 : m.bond === 'ashlar' ? 0.16 : 0.1;
  const merged = (c: number) => hashi(row, c, salt + 91) < mergeP;
  const prev = ((col - 1) + cols) % cols;
  const next = (col + 1) % cols;
  const mHere = merged(col) && !merged(prev);
  const mNext = merged(next) && !mHere && !merged(col);

  let bx = bx0, anchor = col;
  const leftOpen = !mHere;
  const rightOpen = !mNext;
  if (mHere) { anchor = prev; bx = 0.5 + bx0 * 0.5; }
  else if (mNext) { bx = bx0 * 0.5; }

  // Distance to the nearest live joint, in tile units.
  const dxUnits = Math.min(leftOpen ? bx0 : 1, rightOpen ? 1 - bx0 : 1);
  const dyUnits = Math.min(by, 1 - by);
  const dx = dxUnits / cols;
  const dy = dyUnits / rows;
  const d = Math.min(dx, dy);
  const jt = L.jt;
  out.face = smoothstep(jt * 0.2, jt * 0.95, d);
  out.bevel = smoothstep(jt * 0.9, jt * 3.2, d);
  out.id = hashi(row, anchor, salt + 17);
  out.bx = bx;
  out.by = by;
  out.vert = m.bond === 'stave' || m.bond === 'columnar' ? 1 : 0;
}

/** Uncut stone and flint: the layout is cellular, not coursed. */
function sampleCells(
  m: MaterialDef, L: BondLayout, cell: WorleyNoise, u: number, v: number, out: UnitSample,
): void {
  const P = L.period;
  const [f1, f2, id] = cell.f1f2id(u * P, v * P);
  out.id = id;
  out.bx = clamp01(f1 * 1.6);
  out.by = clamp01(f1 * 1.6);
  out.vert = 0;
  if (m.bond === 'nodular') {
    // A nodule is a lump floating in mortar, not a cell of a mosaic: the face
    // is the middle of the cell and everything outside it is matrix.
    const r = 0.3 + id * 0.14;
    out.face = 1 - smoothstep(r, r + 0.07, f1);
    out.bevel = 1 - smoothstep(r * 0.5, r + 0.01, f1);
    return;
  }
  const d = (f2 - f1) * 0.5 / P;
  const jt = L.jt;
  out.face = smoothstep(jt * 0.2, jt * 0.95, d);
  out.bevel = smoothstep(jt * 0.9, jt * 3.4, d);
}

/**
 * Herringbone.
 *
 * Each cell of the lattice belongs to a two-cell brick, and which way that
 * brick lies is decided by `(i - j) mod 4`: two diagonal stripes of horizontal
 * bricks, then two of vertical. That rule gives a perfect matching — every cell
 * has exactly one partner — and repeats every four cells on both axes, which is
 * what makes it tile.
 */
function sampleHerringbone(L: BondLayout, u: number, v: number, salt: number, out: UnitSample): void {
  const N = L.cols;
  const X = u * N, Y = v * N;
  const i = Math.floor(X), j = Math.floor(Y);
  const fx = X - i, fy = Y - j;
  const a = (((i - j) % 4) + 4) % 4;
  let bx: number, by: number, ax: number, ay: number, vert: number;
  if (a === 0) { bx = fx * 0.5; by = fy; ax = i; ay = j; vert = 0; }
  else if (a === 1) { bx = 0.5 + fx * 0.5; by = fy; ax = i - 1; ay = j; vert = 0; }
  else if (a === 3) { bx = fy * 0.5; by = fx; ax = i; ay = j; vert = 1; }
  else { bx = 0.5 + fy * 0.5; by = fx; ax = i; ay = j - 1; vert = 1; }
  // Same reason as the courses: the anchor is hashed, so it has to be the
  // wrapped cell and not the raw one.
  ax = ((ax % N) + N) % N;
  ay = ((ay % N) + N) % N;

  // Distance to the brick's own edge, in tile units. The long axis is two
  // cells, so the half-width there is measured on the doubled coordinate.
  const dLong = Math.min(bx, 1 - bx) * 2 / N;
  const dShort = Math.min(by, 1 - by) / N;
  const d = Math.min(dLong, dShort);
  const jt = L.jt;
  out.face = smoothstep(jt * 0.2, jt * 0.95, d);
  out.bevel = smoothstep(jt * 0.9, jt * 3.2, d);
  out.id = hashi(ax, ay, salt + 43);
  out.bx = bx; out.by = by; out.vert = vert;
}

/**
 * The noise fields a material's surface is built from.
 *
 * Every one is sampled at exactly its own period and nowhere else. A tileable
 * noise of period P only repeats if the sample coordinate advances by a
 * multiple of P across the tile, and the seam that rule buys you is invisible
 * in the source and glaring on the map — so the periods are named here rather
 * than written at each call site.
 */
interface GrainFields {
  broad: TileableNoise;      // 6
  mid: TileableNoise;        // 24
  fine: TileableNoise;       // 48
  micro: TileableNoise;      // 96
  cellFine: WorleyNoise;     // 32
  cellMicro: WorleyNoise;    // 64
}

const P_BROAD = 6, P_WOBBLE = 10, P_MID = 24, P_FINE = 48, P_MICRO = 96, P_CELL_FINE = 32, P_CELL_MICRO = 64;
/**
 * How fast a wood grain's warp travels along the board, sampled out of the
 * period-6 field. It has to be a whole multiple of that period or the tile
 * stops wrapping on that axis — which is also why the slow axis cannot go
 * below it, and why the anisotropy is bought by speeding one axis up rather
 * than slowing the other down.
 */
const P_GRAIN_RUN = P_BROAD * 2;

/** Grain inside one unit. Returns a signed lightness offset and a relief bump. */
function grainAt(m: MaterialDef, s: UnitSample, u: number, v: number, f: GrainFields): [number, number] {
  // Along/across the unit, so wood runs down a stave and along a plank.
  const along = s.vert ? s.by : s.bx;
  const across = s.vert ? s.bx : s.by;
  // Each unit was cut on its own, so its grain starts somewhere of its own.
  const jitter = s.id * 21.7;
  switch (m.grain) {
    case 'speckled': {
      const [g1, g2] = f.cellMicro.f1f2(u * P_CELL_MICRO, v * P_CELL_MICRO);
      const fleck = 1 - smoothstep(0.0, 0.14, g2 - g1);
      const mica = f.micro.noise(u * P_MICRO, v * P_MICRO);
      return [(mica + fleck * 0.5 - 0.18) * 0.34, mica * 0.12];
    }
    case 'banded': {
      // Bedding planes running through the block, not around it.
      const warp = f.mid.fbm(u * P_MID, v * P_MID, 3) * 0.35;
      const band = Math.sin((across * 5.5 + warp * 4 + jitter) * Math.PI * 2);
      return [band * 0.13 + f.fine.noise(u * P_FINE, v * P_FINE) * 0.2, band * 0.1];
    }
    case 'veined': {
      const w = f.mid.fbm(u * P_MID, v * P_MID, 4) * 0.7;
      const v1 = 1 - smoothstep(0.0, 0.09, Math.abs(Math.sin((u * 3 + v * 2 + w * 4) * Math.PI)));
      const v2 = 1 - smoothstep(0.0, 0.045, Math.abs(Math.sin((u * 5 - v * 4 + w * 6) * Math.PI)));
      const v3 = 1 - smoothstep(0.0, 0.03, Math.abs(Math.sin((u * 2 + v * 7 + w * 9) * Math.PI)));
      return [-(v1 * 0.5 + v2 * 0.3 + v3 * 0.22) + f.micro.noise(u * P_MICRO, v * P_MICRO) * 0.06, -v1 * 0.05];
    }
    case 'layered': {
      const warp = f.mid.fbm(u * P_MID, v * P_MID, 3) * 0.25;
      const lam = Math.sin((across * 9 + warp * 3 + jitter) * Math.PI * 2);
      return [lam * 0.1 + f.fine.noise(u * P_FINE, v * P_FINE) * 0.16, lam * 0.16];
    }
    case 'crystalline': {
      const [g1, g2, gid] = f.cellFine.f1f2id(u * P_CELL_FINE, v * P_CELL_FINE);
      const facet = smoothstep(0.0, 0.18, g2 - g1);
      void g1;
      return [(facet - 0.5) * 0.28 + (gid - 0.5) * 0.18 + f.micro.noise(u * P_MICRO, v * P_MICRO) * 0.1,
        (facet - 0.5) * 0.22];
    }
    case 'fibrous': {
      // Long grain, plus the ring pattern a sawn board actually shows.
      //
      // Weathering does not add grain lines, it deepens the ones already
      // there: the soft spring wood erodes and the hard latewood is left
      // standing, so a silvered board shows fewer and bolder rings than a
      // sawn one. `grainDepth` is that — wider spacing and more relief, from
      // one number, rather than a second grain type that is the same wood.
      const depth = m.grainDepth ?? 1;
      // The warp has to be anisotropic or the rings are not rings. A ring is
      // displaced by whatever the tree did while it grew, and that changes
      // steadily down the length of a board and hardly at all across its
      // width — so the noise is sampled fast along the grain and once across
      // it. Warping it evenly, which is what this did, moved a ring further
      // sideways than its own spacing, and a grain line that crosses its
      // neighbour is a blotch. That is the whole reason weathered oak was
      // being read as stone rubble.
      // Two octaves, not three: the third is a wiggle finer than the ring
      // spacing, and a warp that oscillates faster than the thing it warps
      // turns the grain into corrugation.
      const wander = s.vert
        ? f.broad.fbm(u * P_BROAD, v * P_GRAIN_RUN, 2)
        : f.broad.fbm(u * P_GRAIN_RUN, v * P_BROAD, 2);
      // Held under a quarter of a ring spacing. Past that the lines cross.
      const phase = across * (7.5 / depth) + wander * 0.55 + jitter;
      const ring = Math.sin(phase * Math.PI * 2);
      const fibre = f.micro.noise(u * P_MICRO, v * P_MICRO) * 0.22;
      let light = Math.sign(ring) * Math.pow(Math.abs(ring), 0.6) * 0.14 * depth + fibre;
      let relief = ring * 0.07 * depth;

      const dry = m.checks ?? 0;
      if (dry > 0) {
        // Cupping: the face dries faster than the back, so the board curls and
        // the middle of it sits below its own edges. One parabola across the
        // width, which the relief pass turns into the roll of light that says
        // a board is no longer flat.
        const bow = (across - 0.5) * (across - 0.5) * 4;
        relief += (bow - 0.4) * dry * 0.4;

        // Checks: the split follows a ring, opens for part of the board's
        // length and closes again. Keyed off the ring's own cycle so that at
        // most one check runs along each ring, and hashed per unit so two
        // boards never split in the same place.
        const cyc = Math.floor(phase);
        const board = Math.round(s.id * 4093);
        if (hashi(cyc, board, 131) < dry * 0.5) {
          const at = 0.18 + hashi(cyc, board, 137) * 0.64;
          const line = 1 - smoothstep(0, 0.1 + dry * 0.1, Math.abs(phase - cyc - at));
          // How far along the board this one has opened.
          const runN = s.vert
            ? f.broad.fbm(u * P_BROAD + 3.1, v * P_GRAIN_RUN + 1.7, 2)
            : f.broad.fbm(u * P_GRAIN_RUN + 3.1, v * P_BROAD + 1.7, 2);
          // A check is a crack, so it is narrow, dark and deep.
          const run = clamp01((runN + 0.34) * 3);
          const open = line * run;
          light -= open * 0.75;
          relief -= open * 1.8;
        }
      }
      return [light, relief];
    }
    case 'knotty': {
      const wander = f.mid.fbm(u * P_MID, v * P_MID, 3) * 0.6;
      const ring = Math.sin((across * 6 + wander * 3 + jitter) * Math.PI * 2);
      // Knots sit where the branch was, so one per unit at most.
      const kx = 0.5 + (hashi(Math.round(s.id * 997), 3, 5) - 0.5) * 0.7;
      const ky = 0.5 + (hashi(Math.round(s.id * 997), 7, 9) - 0.5) * 0.7;
      const kd = Math.hypot((along - kx) * (s.vert ? 0.4 : 1), (across - ky) * (s.vert ? 1 : 0.4));
      const kn = (1 - smoothstep(0.03, 0.14, kd)) * (s.id > 0.45 ? 1 : 0);
      const fibre = f.micro.noise(u * P_MICRO, v * P_MICRO) * 0.2;
      return [Math.sign(ring) * Math.pow(Math.abs(ring), 0.6) * 0.12 + fibre - kn * 0.5, -kn * 0.35];
    }
    case 'crumbly': {
      const t = f.mid.turbulence(u * P_MID, v * P_MID, 4);
      const pit = f.fine.noise(u * P_FINE, v * P_FINE);
      return [(t - 0.45) * 0.34 + pit * 0.18, (t - 0.45) * 0.34 + pit * 0.16];
    }
    case 'matted': {
      const [g1, g2] = f.cellMicro.f1f2(u * P_CELL_MICRO, v * P_CELL_MICRO);
      const tuft = smoothstep(0.0, 0.16, g2 - g1);
      const fuzz = f.mid.turbulence(u * P_MID, v * P_MID, 3);
      void g1;
      return [(tuft - 0.4) * 0.36 + (fuzz - 0.45) * 0.32, (tuft - 0.4) * 0.3];
    }
    case 'porous': {
      const [g1] = f.cellMicro.f1f2(u * P_CELL_MICRO, v * P_CELL_MICRO);
      const hole = 1 - smoothstep(0.03, 0.12, g1);
      const fineG = f.fine.noise(u * P_FINE, v * P_FINE) * 0.17;
      return [-hole * 0.18 + fineG, -hole * 0.4 + fineG * 0.4];
    }
    default: {
      const fineG = f.fine.noise(u * P_FINE, v * P_FINE);
      return [fineG * 0.12, fineG * 0.07];
    }
  }
}

/**
 * Vertically smeared noise.
 *
 * Water runs down a wall, so staining is elongated on one axis. Stretching the
 * sampling coordinate would break the wrap — a noise with period P has to be
 * sampled over exactly P units — so the elongation is done by averaging a few
 * taps down the v axis instead, each of which wraps on its own.
 */
function runoff(n: TileableNoise, u: number, v: number, period: number): number {
  const a = n.fbm(u * period, v * period, 3);
  const b = n.fbm(u * period, v * period + 0.55, 3);
  const c = n.fbm(u * period, v * period + 1.1, 3);
  const d = n.fbm(u * period, v * period + 1.65, 3);
  return (a + b + c + d) * 0.25;
}

function paintMaterial(px: PixelWriter, p: MapPalette, rng: RNG, size: number, m: MaterialDef, detail: number): void {
  const S = size;
  // A tile stretched over four times the ground shows four times the masonry.
  const k = clamp(Math.sqrt(Math.max(0.05, detail)), 0.5, 2.6);
  const L = bondLayout(m, k);
  const salt = rng.int(1, 1e6);

  const cell = new WorleyNoise(L.period, rng.int(1, 1e6), m.bond === 'polygonal' ? 0.6 : 1);
  const f: GrainFields = {
    broad: new TileableNoise(P_BROAD, rng.int(1, 1e6)),
    mid: new TileableNoise(P_MID, rng.int(1, 1e6)),
    fine: new TileableNoise(P_FINE, rng.int(1, 1e6)),
    micro: new TileableNoise(P_MICRO, rng.int(1, 1e6)),
    cellFine: new WorleyNoise(P_CELL_FINE, rng.int(1, 1e6), 1),
    cellMicro: new WorleyNoise(P_CELL_MICRO, rng.int(1, 1e6), 1),
  };
  const wobble = new TileableNoise(P_WOBBLE, rng.int(1, 1e6));
  const stainN = new TileableNoise(P_MID, rng.int(1, 1e6));
  const dampN = new TileableNoise(P_BROAD, rng.int(1, 1e6));
  const sootN = new TileableNoise(P_BROAD, rng.int(1, 1e6));
  const sheenN = new TileableNoise(P_BROAD, rng.int(1, 1e6));
  const qm = Math.max(16, S >> 1), qb = Math.max(12, S >> 2);
  const stainF = coarseField(qm, (u, v) => runoff(stainN, u, v, P_MID));
  const bodyF = coarseField(qb, (u, v) => f.broad.fbm(u * P_BROAD, v * P_BROAD, 3));
  const dampF = coarseField(qb, (u, v) => dampN.fbm(u * P_BROAD, v * P_BROAD, 3));
  const fuzzF = coarseField(qm, (u, v) => f.mid.turbulence(u * P_MID, v * P_MID, 3));
  const sootF = coarseField(qb, (u, v) => sootN.turbulence(u * P_BROAD, v * P_BROAD, 3));
  const sheenF = coarseField(qb, (u, v) => sheenN.fbm(u * P_BROAD, v * P_BROAD, 3));

  const w = m.wear;
  const baseHex = m.base(p);
  const mortarHex = m.mortar(p);
  const mortar = parseColor(mortarHex);
  const mossC = parseColor(mix(p.forest, '#5c7a37', 0.45));
  const sootC = parseColor(mix(p.ink, '#12100e', 0.55));
  const stainC = parseColor(mix(baseHex, '#3a2f22', 0.72));

  // Per-unit tinting is done in HSL, so a hue nudge is still the same stone.
  const tintLut: [number, number, number][] = [];
  for (let i = 0; i < 32; i++) {
    const t = (i / 31 - 0.5) * 2;
    const c = parseColor(shiftHsl(baseHex, t * m.hueJitter, 0, t * m.jitter * 0.55));
    tintLut.push([c.r, c.g, c.b]);
  }

  // The joints of an irregular material wander; ashlar's do not. Tying the
  // wobble to the joint width is what keeps a marble course straight and a
  // rubble course crooked without a second knob for it.
  const wobU = (m.joint * 0.9) / L.cols;
  const wobV = (m.joint * 0.9) / L.rows;

  const h = new Float32Array(S * S);
  const alb = new Float32Array(S * S * 3);
  // Where the joints are, kept separately from the height. Under a mono
  // palette the drawing *is* the joints, and reading them back off the height
  // does not work: a material with shallow relief has a height field that
  // never drops far enough to threshold, so limestone and marble came out as
  // blank hatched rectangles with no coursing at all.
  const joints = new Float32Array(S * S);
  const s: UnitSample = { face: 1, bevel: 1, id: 0, bx: 0, by: 0, vert: 0 };

  for (let y = 0; y < S; y++) {
    const v = y / S;
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const uu = u + wobble.noise(u * P_WOBBLE, v * P_WOBBLE) * wobU;
      const vv = v + wobble.noise(u * P_WOBBLE + 5.3, v * P_WOBBLE + 1.7) * wobV;

      if (m.bond === 'monolithic') {
        // No joints, so the only thing standing between this and a flat swatch
        // is the patchiness of the material itself.
        s.face = 1; s.bevel = 1; s.bx = u; s.by = v; s.vert = 0;
        s.id = clamp01(bodyF(u, v) * 1.3 + 0.5);
      } else if (m.bond === 'herringbone') {
        sampleHerringbone(L, uu, vv, salt, s);
      } else if (m.bond === 'rubble' || m.bond === 'polygonal' || m.bond === 'nodular') {
        sampleCells(m, L, cell, uu, vv, s);
      } else {
        sampleCourses(m, L, uu, vv, salt, s);
      }

      const [gLight, gRelief] = grainAt(m, s, u, v, f);

      // --- height -------------------------------------------------------
      // The joint is a trough, the face is a plateau with the grain on it, the
      // arris is rounded off, and wear cuts into all three.
      const chipN = f.fine.noise(u * P_FINE, v * P_FINE) * 0.5 + 0.5;
      const chip = clamp01((chipN - (1 - w.chip * 0.6)) * 5) * (1 - s.bevel) * w.chip;
      const relief = m.relief;
      let height = (1 - relief) + relief * (s.face * 0.72 + s.bevel * 0.28);
      height += gRelief * 0.14 * (0.3 + s.face * 0.7);
      height -= chip * relief * 0.75;
      // Rubble and fieldstone sit proud of one another by a real amount.
      height += (s.id - 0.5) * relief * 0.22;
      h[y * S + x] = height;

      // --- albedo -------------------------------------------------------
      const ti = Math.min(31, Math.max(0, Math.round(s.id * 31)));
      const tint = tintLut[ti];
      const lift = 1 + gLight * 0.55;
      let r = tint[0] * lift, g = tint[1] * lift, b = tint[2] * lift;

      // The mortar's darkness comes from the relief pass, not from painting a
      // line: a joint that is drawn dark stays dark when the light moves.
      const mo = 1 - s.face;
      if (mo > 0.001) {
        const grit = 1 + f.micro.noise(u * P_MICRO, v * P_MICRO) * 0.24;
        r = lerp(r, mortar.r * grit, mo);
        g = lerp(g, mortar.g * grit, mo);
        b = lerp(b, mortar.b * grit, mo);
      }

      // A fresh break shows unweathered material.
      if (chip > 0.01) {
        const t = clamp01(chip * 1.4);
        r = lerp(r, r * 1.15 + 13, t); g = lerp(g, g * 1.15 + 13, t); b = lerp(b, b * 1.15 + 13, t);
      }

      // Weathering, running down the face from the joints.
      if (w.stain > 0.01) {
        const st = clamp01((stainF(u, v) + 0.3) * 1.5)
          * w.stain * (0.3 + (1 - s.face) * 0.7 + s.by * 0.3);
        const a = clamp01(st) * 0.4;
        r = lerp(r, stainC.r, a); g = lerp(g, stainC.g, a); b = lerp(b, stainC.b, a);
      }

      // Damp growth starts in the joints and creeps out of them, which is why
      // the mask is keyed off the joint rather than sprinkled over the face.
      if (w.moss > 0.01) {
        const wet = clamp01(dampF(u, v) * 1.5 + 0.3);
        const seat = clamp01((1 - s.face) * 1.2 + (1 - s.bevel) * 0.5);
        const fuzz = fuzzF(u, v);
        const a = clamp01(wet * seat * w.moss * (0.45 + fuzz)) * 0.8;
        r = lerp(r, mossC.r, a); g = lerp(g, mossC.g, a); b = lerp(b, mossC.b, a);
      }

      // Soot lies over everything and settles heaviest in the hollows.
      if (w.soot > 0.01) {
        const blot = clamp01(sootF(u, v) * 1.9 - 0.25);
        const a = clamp01(blot * w.soot * (0.55 + (1 - s.bevel) * 0.6)) * 0.7;
        r = lerp(r, sootC.r, a); g = lerp(g, sootC.g, a); b = lerp(b, sootC.b, a);
      }

      // Iron bands. They lie across the face rather than in it, so they get
      // their own height as well as their own colour or the shading pass will
      // put them behind the timber they are holding together.
      if (m.straps) {
        // The straps are spaced on the timber, so they multiply with the tile's
        // reach like everything else does.
        const straps = Math.max(2, Math.round(m.straps * k));
        const band = Math.abs(((u * straps + 0.5) % 1) - 0.5);
        const on = 1 - smoothstep(0.09, 0.15, band);
        if (on > 0.01) {
          const pit = f.fine.noise(u * P_FINE, v * P_FINE) * 0.5 + 0.5;
          const iron = 46 + pit * 40;
          const rust = clamp01(fuzzF(u, v) * 1.6 - 0.5) * 0.6;
          r = lerp(r, lerp(iron, 122, rust), on);
          g = lerp(g, lerp(iron + 4, 64, rust), on);
          b = lerp(b, lerp(iron + 8, 38, rust), on);
          height = lerp(height, height + 0.34, on);
          h[y * S + x] = height;
        }
      }

      joints[y * S + x] = Math.max(1 - s.face, 1 - s.bevel * 0.35 - 0.65);
      const i = (y * S + x) * 3;
      alb[i] = r; alb[i + 1] = g; alb[i + 2] = b;
    }
  }

  const light = reliefLight(h, S, {
    strength: 0.55 + m.relief * 0.75,
    ao: 0.28 + m.relief * 0.5,
    aoRadius: Math.max(2, Math.round(S / Math.max(10, L.rows * 3))),
  });

  const mono = !!p.mono;
  const inkC = parseColor(p.ink);
  const paper = parseColor(p.parchment);
  const out = px.data;
  for (let y = 0; y < S; y++) {
    const v = y / S;
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const i = y * S + x;
      const j = i * 3;
      const o = i * 4;
      let l = light[i];
      // Polish: a broad sheen on whatever stands proudest of the surface.
      if (w.polish > 0.01) {
        const sheen = clamp01(sheenF(u, v) * 1.3 + 0.5);
        l += sheen * w.polish * 0.3 * clamp01(h[i] * 1.2 - 0.2);
      }
      if (mono) {
        // Line art: the joints inked and the tone carried by hatching, at a
        // weight taken from how dark the material actually is. That is what
        // keeps basalt and limestone apart on a page with no colour on it.
        const tone = (alb[j] * 0.299 + alb[j + 1] * 0.587 + alb[j + 2] * 0.114) / 255;
        const dark = clamp01((0.88 - tone * l) * 1.25);
        const hatch = smoothstep(0.32, 0.9, Math.sin((u + v) * Math.PI * 2 * 26) * 0.5 + 0.5);
        const cross = smoothstep(0.55, 0.95, Math.sin((u - v) * Math.PI * 2 * 26) * 0.5 + 0.5);
        const line = clamp01(joints[i] * 1.7);
        const a = clamp01(line * 0.92 + hatch * dark * 0.9 + cross * clamp01(dark - 0.55) * 1.4);
        out[o] = lerp(paper.r, inkC.r, a);
        out[o + 1] = lerp(paper.g, inkC.g, a);
        out[o + 2] = lerp(paper.b, inkC.b, a);
        out[o + 3] = 255;
        continue;
      }
      out[o] = alb[j] * l;
      out[o + 1] = alb[j + 1] * l;
      out[o + 2] = alb[j + 2] * l;
      out[o + 3] = 255;
    }
  }
}

for (const mat of MATERIALS) {
  def({
    id: materialTextureId(mat.id),
    label: mat.label,
    group: mat.group,
    scale: mat.tileScale,
    make(px, p, rng, size, detail) { paintMaterial(px, p, rng, size, mat, detail); },
  });
}

// ---------------------------------------------------------------------------
// Registry & cache
// ---------------------------------------------------------------------------

export const TEXTURES: TextureDef[] = defs;
export const TEXTURE_IDS = defs.map((d) => d.id);

export function textureDef(id: string): TextureDef | undefined {
  return defs.find((d) => d.id === id);
}

export function texturesByGroup(): Record<TextureGroup, TextureDef[]> {
  const out = { ground: [], water: [], vegetation: [], rock: [], interior: [], special: [] } as Record<TextureGroup, TextureDef[]>;
  for (const d of defs) out[d.group].push(d);
  return out;
}

/**
 * Tiles are keyed by id, palette, size, seed and detail. Detail alone has nine
 * steps and the palette six, so the key space runs to tens of thousands of
 * 256 KB tiles — an unbounded map here is a session-long climb. The budget
 * holds a few hundred tiles, which is more than any one map paints with.
 */
const cache = new BudgetedCache<Surface>(
  96 * 1024 * 1024,
  (s) => s.width * s.height * 4,
  releaseSurface,
);

export interface TextureOptions {
  size?: number;
  paletteId?: string;
  seed?: number;
  /**
   * How much ground one tile covers, relative to the scale the library was
   * drawn for — roughly a 20 ft square on a battle map.
   *
   * The same tile is asked to be the floor of a corridor and the surface of a
   * whole province, and at the second job a texture drawn for the first has
   * cobbles the size of houses. Textures that can respond read this and put
   * proportionally more, smaller units in the tile; the rest ignore it, and at
   * `1` nothing changes at all.
   */
  detail?: number;
}

/** Detail below a twentieth or above ten is somebody's arithmetic going wrong. */
const clampDetail = (d: number): number => clamp(d, 0.05, 10);

/**
 * Snap a detail level to half-octave steps.
 *
 * Detail is part of the cache key, and the brush's texture-scale control is a
 * slider with seventy-odd positions on it. Passing the raw value through would
 * have every drag build a new tile for every stop it passes — a tenth of a
 * second each for the built materials. Half octaves are as fine as the eye can
 * tell these apart anyway, and there are nine of them over the whole range.
 */
const quantiseDetail = (d: number): number => {
  const c = clampDetail(d);
  return +Math.pow(2, Math.round(Math.log2(c) * 2) / 2).toFixed(3);
};

export function getTexture(id: string, opts: TextureOptions = {}): Surface {
  const size = opts.size ?? 256;
  const paletteId = opts.paletteId ?? 'atlas';
  const seed = opts.seed ?? 1;
  const detail = clampDetail(opts.detail ?? 1);
  const key = `${id}|${paletteId}|${size}|${seed}|${detail.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const d = textureDef(id) || defs[0];
  const palette = paletteById(paletteId);
  const rng = new RNG(`${id}:${paletteId}:${seed}`);
  const px = new PixelWriter(size);
  d.make(px, palette, rng, size, detail);

  const surf = createSurface(size, size);
  const ctx = ctxOf(surf);
  ctx.putImageData(px.toImageData(), 0, 0);
  if (d.overlay) d.overlay(ctx, palette, new RNG(`${id}:overlay:${seed}`), size, detail);

  cache.set(key, surf);
  return surf;
}

export function getPattern(
  ctx: CanvasRenderingContext2D,
  id: string,
  opts: TextureOptions & { scale?: number } = {},
): CanvasPattern {
  const s = opts.scale ?? 1;
  // A pattern scaled up covers proportionally more ground, so unless the
  // caller has said otherwise that is exactly the detail the tile should be
  // built at. Scaling the tile without telling it is how a 5 ft cobble becomes
  // a 40 ft one.
  const tile = getTexture(id, { ...opts, detail: quantiseDetail(opts.detail ?? s) });
  const pat = ctx.createPattern(tile, 'repeat')!;
  if (s !== 1 && typeof DOMMatrix !== 'undefined') {
    pat.setTransform(new DOMMatrix().scaleSelf(s, s));
  }
  return pat;
}

export function clearTextureCache(): void { cache.clear(); previewCache.clear(); }

/** Entry count and retained pixel bytes. Read by the memory harness. */
export function textureCacheStats(): { entries: number; bytes: number } {
  return { entries: cache.size, bytes: cache.byteSize };
}

/**
 * Small preview used by the texture picker in the UI.
 *
 * Memoised because the picker asks for every swatch on every render of the
 * panel, and each miss is a scale plus a PNG encode. Uncached, opening the
 * texture tab re-encoded eighty tiles on every keystroke in the search box.
 */
const previewCache = new BudgetedCache<string>(8 * 1024 * 1024, (u) => u.length);

export function texturePreview(id: string, paletteId: string, size = 64): string {
  const key = `${id}|${paletteId}|${size}`;
  const hit = previewCache.get(key);
  if (hit !== undefined) return hit;
  const tile = getTexture(id, { paletteId, size: 128 });
  const out = createSurface(size, size);
  const ctx = ctxOf(out);
  ctx.drawImage(tile, 0, 0, size, size);
  const url = out.toDataURL('image/png');
  previewCache.set(key, url);
  return url;
}
