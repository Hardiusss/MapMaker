/**
 * Noise primitives used by the terrain, texture and asset generators.
 *
 * `TileableNoise` is the important one: it produces gradient noise on a lattice
 * that wraps at an integer period, which is what lets the texture library emit
 * genuinely seamless tiles.
 */
import { RNG } from './rng';

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

const GRAD2: ReadonlyArray<readonly [number, number]> = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

/** Classic 2D simplex noise, seeded. Range approximately [-1, 1]. */
export class SimplexNoise {
  private perm = new Uint8Array(512);
  private permMod8 = new Uint8Array(512);

  constructor(seed: number | string = 1) {
    const rng = new RNG(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = rng.int(0, i);
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.permMod8[i] = this.perm[i] % 8;
    }
  }

  noise2D(xin: number, yin: number): number {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);

    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;

    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;

    const ii = i & 255, jj = j & 255;
    let n0 = 0, n1 = 0, n2 = 0;

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      t0 *= t0;
      const g = GRAD2[this.permMod8[ii + this.perm[jj]]];
      n0 = t0 * t0 * (g[0] * x0 + g[1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      t1 *= t1;
      const g = GRAD2[this.permMod8[ii + i1 + this.perm[jj + j1]]];
      n1 = t1 * t1 * (g[0] * x1 + g[1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      t2 *= t2;
      const g = GRAD2[this.permMod8[ii + 1 + this.perm[jj + 1]]];
      n2 = t2 * t2 * (g[0] * x2 + g[1] * y2);
    }
    return 70 * (n0 + n1 + n2);
  }

  /** Fractal Brownian motion. */
  fbm(x: number, y: number, octaves = 5, lacunarity = 2, gain = 0.5): number {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.noise2D(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  /** Ridged multifractal — the shape that reads as mountain spines. */
  ridged(x: number, y: number, octaves = 5, lacunarity = 2, gain = 0.5): number {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      const n = 1 - Math.abs(this.noise2D(x * freq, y * freq));
      sum += amp * n * n;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return (sum / norm) * 2 - 1;
  }

  /** Turbulence — |noise| stack, good for clouds and rock grain. */
  turbulence(x: number, y: number, octaves = 5): number {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * Math.abs(this.noise2D(x * freq, y * freq));
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  }

  /** Domain-warped fbm: the cheapest way to stop noise looking like noise. */
  warped(x: number, y: number, strength = 0.6, octaves = 5): number {
    const qx = this.fbm(x + 0.31, y + 5.7, 3);
    const qy = this.fbm(x + 8.3, y + 2.8, 3);
    return this.fbm(x + strength * qx, y + strength * qy, octaves);
  }
}

/**
 * Perfectly tileable gradient (Perlin-style) noise with an integer period.
 * Sample with x,y in lattice units; the field repeats every `period` units.
 */
export class TileableNoise {
  private grad: Float32Array;
  private period: number;

  constructor(period = 8, seed: number | string = 1) {
    this.period = Math.max(2, Math.floor(period));
    const rng = new RNG(seed);
    const n = this.period * this.period;
    this.grad = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const a = rng.float(0, Math.PI * 2);
      this.grad[i * 2] = Math.cos(a);
      this.grad[i * 2 + 1] = Math.sin(a);
    }
  }

  /**
   * The four lattice corners are read inline rather than through a helper that
   * filled a two-element tuple. That helper allocated once per corner — four
   * short-lived arrays per sample — and a single material tile takes on the
   * order of half a million samples, so it was the largest single source of
   * garbage in the whole texture library. The arithmetic below is unchanged.
   */
  noise(x: number, y: number): number {
    const p = this.period;
    const grad = this.grad;
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const x1 = x0 + 1, y1 = y0 + 1;
    const fx = x - x0, fy = y - y0;
    const u = fade(fx), v = fade(fy);

    // x1 is x0+1, so its wrapped index is the next lattice column with a
    // single wrap at the end. Deriving it costs a compare where the modulo
    // pair cost two divisions, and integer congruence makes it the same index.
    const wx0 = ((x0 % p) + p) % p, wx1 = wx0 + 1 === p ? 0 : wx0 + 1;
    const wy0 = ((y0 % p) + p) % p, wy1 = wy0 + 1 === p ? 0 : wy0 + 1;
    const r0 = wy0 * p, r1 = wy1 * p;
    const i00 = (r0 + wx0) * 2, i10 = (r0 + wx1) * 2;
    const i01 = (r1 + wx0) * 2, i11 = (r1 + wx1) * 2;

    const n00 = grad[i00] * fx + grad[i00 + 1] * fy;
    const n10 = grad[i10] * (fx - 1) + grad[i10 + 1] * fy;
    const n01 = grad[i01] * fx + grad[i01 + 1] * (fy - 1);
    const n11 = grad[i11] * (fx - 1) + grad[i11 + 1] * (fy - 1);

    return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v) * 1.4;
  }

  /** Tileable fbm; each octave doubles the lattice period so it still wraps. */
  fbm(x: number, y: number, octaves = 4, gain = 0.5): number {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.noise(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= 2;
    }
    return sum / norm;
  }

  turbulence(x: number, y: number, octaves = 4): number {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * Math.abs(this.noise(x * freq, y * freq));
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  }
}

export function fade(t: number): number { return t * t * t * (t * (t * 6 - 15) + 10); }
export function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
export function clamp(v: number, lo: number, hi: number): number { return v < lo ? lo : v > hi ? hi : v; }
export function clamp01(v: number): number { return clamp(v, 0, 1); }
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0 || 1e-9));
  return t * t * (3 - 2 * t);
}

/** Worley / cellular noise — used for cobbles, cracked earth and scales. */
export class WorleyNoise {
  private points: Float32Array;
  private period: number;
  /**
   * Scratch returned by `f1f2` / `f1f2id`, reused between calls.
   *
   * These are sampled once per pixel and every call site destructures the
   * result on the spot, so handing back the same array costs nothing and saves
   * a hundred thousand allocations per tile. The contract that buys it: read
   * the values out immediately, never hold the array.
   */
  private out2: [number, number] = [0, 0];
  private out3: [number, number, number] = [0, 0, 0];

  constructor(period = 8, seed: number | string = 1, jitter = 1) {
    this.period = Math.max(2, Math.floor(period));
    const rng = new RNG(seed);
    const n = this.period * this.period;
    this.points = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      this.points[i * 2] = 0.5 + (rng.next() - 0.5) * jitter;
      this.points[i * 2 + 1] = 0.5 + (rng.next() - 0.5) * jitter;
    }
  }

  /** Returns [F1, F2] distances, normalised roughly to [0,1]. Reuses `out2`. */
  f1f2(x: number, y: number): [number, number] {
    const p = this.period;
    const pts = this.points;
    const xi = Math.floor(x), yi = Math.floor(y);
    let f1 = 1e9, f2 = 1e9;
    for (let dy = -1; dy <= 1; dy++) {
      const cy = yi + dy;
      const wy = ((cy % p) + p) % p;
      const row = wy * p;
      for (let dx = -1; dx <= 1; dx++) {
        const cx = xi + dx;
        const wx = ((cx % p) + p) % p;
        const i = (row + wx) * 2;
        const px = cx + pts[i] - x;
        const py = cy + pts[i + 1] - y;
        const d = Math.sqrt(px * px + py * py);
        if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
      }
    }
    const o = this.out2;
    o[0] = Math.min(1, f1); o[1] = Math.min(1, f2);
    return o;
  }

  /**
   * [F1, F2, id] — as `f1f2`, plus a stable pseudo-random value in [0,1) that
   * identifies the nearest feature point.
   *
   * Without the id every cell in a Worley texture has an identical interior and
   * the result reads as machine-cut paving: the only variation is the seam
   * between cells. The id lets each stone, each lichen patch, each cobble carry
   * its own tone, which is the difference between gravel and a tiled floor.
   */
  f1f2id(x: number, y: number): [number, number, number] {
    const p = this.period;
    const pts = this.points;
    const xi = Math.floor(x), yi = Math.floor(y);
    let f1 = 1e9, f2 = 1e9, id = 0;
    for (let dy = -1; dy <= 1; dy++) {
      const cy = yi + dy;
      const wy = ((cy % p) + p) % p;
      const row = wy * p;
      for (let dx = -1; dx <= 1; dx++) {
        const cx = xi + dx;
        const wx = ((cx % p) + p) % p;
        const i = (row + wx) * 2;
        const px = cx + pts[i] - x;
        const py = cy + pts[i + 1] - y;
        const d = Math.sqrt(px * px + py * py);
        if (d < f1) { f2 = f1; f1 = d; id = hash01(wx, wy); }
        else if (d < f2) { f2 = d; }
      }
    }
    const o = this.out3;
    o[0] = Math.min(1, f1); o[1] = Math.min(1, f2); o[2] = id;
    return o;
  }
}

/** Cheap stable hash of a lattice cell to [0,1). */
function hash01(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
