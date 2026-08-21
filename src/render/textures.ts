/**
 * Procedural, seamless texture library.
 *
 * Every terrain surface in the app is synthesised here from tileable noise —
 * no bundled artwork, no licensing, no downloads. Tiles are generated once and
 * cached per (id, palette, size).
 */
import { TileableNoise, WorleyNoise, clamp01, smoothstep, lerp } from '../core/noise';
import { RNG } from '../core/rng';
import { parseColor, mix, sampleRamp, type RampStop, type MapPalette, paletteById } from '../core/color';
import { createSurface, ctxOf, type Surface } from '../util/canvas';

export type TextureGroup = 'ground' | 'water' | 'vegetation' | 'rock' | 'interior' | 'special';

export interface TextureDef {
  id: string;
  label: string;
  group: TextureGroup;
  /** Suggested pattern scale relative to the base tile. */
  scale: number;
  make(px: PixelWriter, p: MapPalette, rng: RNG, size: number): void;
  /** Optional vector pass drawn on top of the pixel pass (wrapping-aware). */
  overlay?(ctx: CanvasRenderingContext2D, p: MapPalette, rng: RNG, size: number): void;
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
  make(px, p, rng) {
    const n = new TileableNoise(14, rng.int(1, 1e6));
    const r = ramp([
      { t: 0, color: mix(p.lowland, '#6b5f37', 0.4) },
      { t: 0.5, color: p.lowland },
      { t: 1, color: mix(p.lowland, p.desert, 0.7) },
    ]);
    px.each((u, v) => {
      const base = n.fbm(u * 14, v * 14, 4) * 0.5 + 0.5;
      const c = r(clamp01(base));
      return [c[0], c[1], c[2], 255];
    });
  },
});

def({
  id: 'dirt', label: 'Bare Earth', group: 'ground', scale: 1,
  make(px, p, rng) {
    const n = new TileableNoise(20, rng.int(1, 1e6));
    const speck = new TileableNoise(90, rng.int(1, 1e6));
    const base0 = mix(p.lowland, '#6a4c2f', 0.6);
    const r = ramp([
      { t: 0, color: mix(base0, '#2e1f12', 0.5) },
      { t: 0.5, color: base0 },
      { t: 1, color: mix(base0, '#c19a6b', 0.6) },
    ]);
    px.each((u, v) => {
      const base = n.fbm(u * 20, v * 20, 5) * 0.5 + 0.5;
      const s = speck.noise(u * 90, v * 90);
      const c = r(clamp01(base + s * 0.12));
      return [c[0], c[1], c[2], 255];
    });
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
  make(px, p, rng) {
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
      { t: 0.86, color: mix(p.snow, '#ffffff', 0.7) },
      { t: 1, color: '#ffffff' },
    ]);
    px.each((u, v) => {
      const base = n.fbm(u * 9, v * 9, 4) * 0.5 + 0.5;
      // Sastrugi: wind-carved ridges, elongated along one axis.
      const ridges = 1 - Math.abs(drift.fbm(u * 20, v * 7, 4));
      const speck = grain.noise(u * 64, v * 64) * 0.06;
      const c = r(clamp01(base * 0.5 + ridges * 0.42 + speck));
      return [c[0], c[1], c[2], 255];
    });
  },
});

def({
  id: 'tundra', label: 'Tundra', group: 'ground', scale: 1,
  make(px, p, rng) {
    const base = new TileableNoise(11, rng.int(1, 1e6));
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
      const wx = base.fbm(u * 5 + 3.1, v * 5, 3) * 0.3;
      const wy = base.fbm(u * 5, v * 5 + 7.7, 3) * 0.3;
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
    const strips = rng.int(5, 9);
    const r = ramp([
      { t: 0, color: mix(p.lowland, '#5c4326', 0.5) },
      { t: 0.5, color: mix(p.grass, p.lowland, 0.5) },
      { t: 1, color: mix(p.grass, '#d6d67a', 0.5) },
    ]);
    px.each((u, v) => {
      const band = Math.floor(v * strips) / strips;
      const jitter = n.noise(band * 12, 3.1) * 0.35;
      const base = n.fbm(u * 8, v * 8, 3) * 0.2 + 0.5;
      const furrow = Math.sin(u * Math.PI * 2 * 40) * 0.05;
      const c = r(clamp01(base + jitter + furrow));
      return [c[0], c[1], c[2], 255];
    });
  },
});

def({
  id: 'ash', label: 'Ash Waste', group: 'ground', scale: 1,
  make(px, p, rng) {
    const n = new TileableNoise(18, rng.int(1, 1e6));
    const r = ramp([
      { t: 0, color: '#2a2523' },
      { t: 0.5, color: '#4d4643' },
      { t: 1, color: '#8e837c' },
    ]);
    px.each((u, v) => {
      const base = n.fbm(u * 18, v * 18, 5) * 0.5 + 0.5;
      const c = r(clamp01(base));
      return [c[0], c[1], c[2], 255];
    });
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
  make(px, p, rng) {
    const warpN = new TileableNoise(7, rng.int(1, 1e6));
    const n = new TileableNoise(20, rng.int(1, 1e6));
    const fuzz = new TileableNoise(48, rng.int(1, 1e6));
    const base0 = mix(mix(p.forest, '#5f7a3a', 0.6), '#6e7358', 0.28);
    const r = ramp([
      { t: 0, color: mix(base0, '#1c2a16', 0.65) },
      { t: 0.45, color: base0 },
      { t: 0.78, color: mix(base0, '#9dbb62', 0.5) },
      { t: 1, color: mix(base0, '#d2e2a0', 0.6) },
    ]);
    px.each((u, v) => {
      // Broad colonies from a warped low-frequency field, with fine grain on
      // top. High-octave turbulence on its own produced tight swirls that read
      // as marbling rather than as moss.
      const wx = warpN.fbm(u * 4, v * 4, 2) * 0.2;
      const wy = warpN.fbm(u * 4 + 4.9, v * 4 + 2.2, 2) * 0.2;
      const colony = smoothstep(0.3, 0.78, n.fbm((u + wx) * 7, (v + wy) * 7, 2) * 0.5 + 0.5);
      const patchy = (n.fbm(u * 18, v * 18, 2) * 0.5 + 0.5) * 0.3;
      const grain = fuzz.noise(u * 48, v * 48) * 0.5 + 0.5;
      const t = clamp01(0.2 + colony * 0.58 + patchy + (grain - 0.5) * 0.2);
      const c = r(t);
      return [c[0], c[1], c[2], 255];
    });
  },
});

// --- Rock ------------------------------------------------------------------

def({
  id: 'rock', label: 'Rock', group: 'rock', scale: 1,
  make(px, p, rng) {
    const n = new TileableNoise(12, rng.int(1, 1e6));
    const crack = new TileableNoise(28, rng.int(1, 1e6));
    const r = ramp([
      { t: 0, color: mix(p.rock, '#000000', 0.5) },
      { t: 0.5, color: p.rock },
      { t: 1, color: mix(p.rock, '#ffffff', 0.45) },
    ]);
    px.each((u, v) => {
      const base = n.fbm(u * 12, v * 12, 5) * 0.5 + 0.5;
      const cr = 1 - smoothstep(0, 0.08, Math.abs(crack.fbm(u * 28, v * 28, 3)));
      const c = shade(r(clamp01(base)), 1 - cr * 0.45);
      return [c[0], c[1], c[2], 255];
    });
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
  make(px, p, rng) {
    const strata = new TileableNoise(6, rng.int(1, 1e6));
    const detail = new TileableNoise(24, rng.int(1, 1e6));
    const frac = new WorleyNoise(11, rng.int(1, 1e6), 1);
    // Bare alpine rock, not a snowfield. The previous ramp topped out at the
    // palette's snow colour, which put white blotches all over any highland the
    // noise happened to push high — mid-map, mid-latitude, in high summer.
    // Snow belongs to the snow biome and to the caps drawn on the stamps.
    const r = ramp([
      { t: 0, color: mix(p.highland, '#0e0b08', 0.55) },
      { t: 0.35, color: mix(p.highland, '#000000', 0.2) },
      { t: 0.68, color: p.highland },
      { t: 1, color: mix(p.highland, p.rock, 0.75) },
    ]);
    px.each((u, v) => {
      // Folded strata: warp the coordinate along one axis so the bands buckle.
      const warp = strata.fbm(u * 4, v * 4, 3) * 0.3;
      const band = strata.fbm(u * 2.4 + warp * 2, v * 10 + warp * 6, 5) * 0.5 + 0.5;
      const grain = detail.turbulence(u * 24, v * 24, 4);
      // Joints in the rock face, at two scales and with per-block shading, so
      // it reads as a fractured cliff rather than crazy paving.
      const [f1, f2, id] = frac.f1f2id(u * 11, v * 11);
      const joint = 1 - smoothstep(0.0, 0.03, f2 - f1);
      const [g1, g2] = frac.f1f2(u * 27 + 3.3, v * 27 + 1.1);
      const hairline = 1 - smoothstep(0.0, 0.045, g2 - g1);
      const block = (id - 0.5) * 0.16;
      const t = clamp01(band * 0.84 + grain * 0.2 + block
        - joint * 0.3 - hairline * 0.12);
      const c = r(t);
      return [c[0], c[1], c[2], 255];
    });
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
  make(px, p, rng) {
    const n = new TileableNoise(24, rng.int(1, 1e6));
    const base0 = mix(p.rock, '#6a6259', 0.6);
    const r = ramp([
      { t: 0, color: mix(base0, '#1a1714', 0.45) },
      { t: 0.5, color: base0 },
      { t: 1, color: mix(base0, '#d8d0c2', 0.4) },
    ]);
    px.each((u, v) => {
      const base = n.fbm(u * 24, v * 24, 4) * 0.5 + 0.5;
      const c = r(clamp01(base));
      return [c[0], c[1], c[2], 255];
    });
  },
  overlay(ctx, p, rng, size) {
    // 4×4 flagstones with wrapping joints and per-stone tonal variation.
    const cells = 4;
    const cs = size / cells;
    ctx.save();
    for (let gy = 0; gy < cells; gy++) {
      for (let gx = 0; gx < cells; gx++) {
        const jitter = rng.float(-0.06, 0.06);
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = jitter > 0 ? '#ffffff' : '#000000';
        ctx.fillRect(gx * cs + 1, gy * cs + 1, cs - 2, cs - 2);
      }
    }
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = Math.max(1.5, size / 110);
    for (let i = 0; i <= cells; i++) {
      ctx.beginPath(); ctx.moveTo(i * cs, 0); ctx.lineTo(i * cs, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * cs); ctx.lineTo(size, i * cs); ctx.stroke();
    }
    ctx.restore();
  },
});

def({
  id: 'flagstone', label: 'Flagstone', group: 'interior', scale: 1,
  make(px, p, rng) {
    const cell = new WorleyNoise(6, rng.int(1, 1e6), 0.85);
    const n = new TileableNoise(30, rng.int(1, 1e6));
    const base0 = mix(p.rock, '#7d766b', 0.6);
    const r = ramp([
      { t: 0, color: mix(base0, '#211d19', 0.6) },
      { t: 0.35, color: mix(base0, '#000000', 0.2) },
      { t: 0.6, color: base0 },
      { t: 1, color: mix(base0, '#efe8da', 0.5) },
    ]);
    px.each((u, v) => {
      const [f1, f2] = cell.f1f2(u * 6, v * 6);
      const joint = smoothstep(0.0, 0.08, f2 - f1);
      const grain = n.fbm(u * 30, v * 30, 3) * 0.5 + 0.5;
      const c = r(clamp01(joint * 0.7 + grain * 0.35));
      return [c[0], c[1], c[2], 255];
    });
  },
});

def({
  id: 'cobble', label: 'Cobblestone', group: 'interior', scale: 1,
  make(px, p, rng) {
    const cell = new WorleyNoise(12, rng.int(1, 1e6), 1);
    const n = new TileableNoise(48, rng.int(1, 1e6));
    const base0 = mix(p.rock, '#8a8375', 0.55);
    const r = ramp([
      { t: 0, color: '#201c17' },
      { t: 0.28, color: mix(base0, '#000000', 0.35) },
      { t: 0.6, color: base0 },
      { t: 1, color: mix(base0, '#ffffff', 0.4) },
    ]);
    px.each((u, v) => {
      const [f1, f2] = cell.f1f2(u * 12, v * 12);
      const joint = smoothstep(0.0, 0.1, f2 - f1);
      const dome = 1 - smoothstep(0.05, 0.45, f1);
      const c = r(clamp01(joint * 0.5 + dome * 0.5 + n.noise(u * 48, v * 48) * 0.12));
      return [c[0], c[1], c[2], 255];
    });
  },
});

def({
  id: 'wood-planks', label: 'Wood Planks', group: 'interior', scale: 1,
  make(px, p, rng) {
    const n = new TileableNoise(64, rng.int(1, 1e6));
    const knots = new TileableNoise(8, rng.int(1, 1e6));
    const planks = 5;
    const r = ramp([
      { t: 0, color: '#3a2716' },
      { t: 0.45, color: '#6b4a2a' },
      { t: 0.8, color: '#8c6438' },
      { t: 1, color: '#b98b52' },
    ]);
    px.each((u, v) => {
      const band = Math.floor(v * planks);
      const inBand = v * planks - band;
      const tone = ((band * 2654435761) % 97) / 97;
      const grainFreq = 60 + tone * 30;
      const grain = Math.sin((u * grainFreq) + n.fbm(u * 64, band * 3.7, 3) * 8) * 0.5 + 0.5;
      const knot = Math.max(0, 1 - Math.abs(knots.fbm(u * 8, band * 4.3, 3)) * 6) * 0.5;
      const edge = smoothstep(0, 0.06, inBand) * smoothstep(0, 0.06, 1 - inBand);
      const c = shade(r(clamp01(0.35 + grain * 0.35 + tone * 0.2 - knot)), 0.55 + edge * 0.45);
      return [c[0], c[1], c[2], 255];
    });
  },
});

def({
  id: 'brick', label: 'Brick', group: 'interior', scale: 1,
  make(px, p, rng) {
    const n = new TileableNoise(48, rng.int(1, 1e6));
    const rows = 6, cols = 3;
    const r = ramp([
      { t: 0, color: '#4a2620' },
      { t: 0.5, color: '#8a4536' },
      { t: 1, color: '#b8705a' },
    ]);
    px.each((u, v) => {
      const row = Math.floor(v * rows);
      const offset = row % 2 === 0 ? 0 : 0.5 / cols;
      const bx = ((u + offset) * cols) % 1;
      const by = v * rows - row;
      const mortar = Math.min(
        smoothstep(0, 0.05, bx) * smoothstep(0, 0.05, 1 - bx),
        smoothstep(0, 0.08, by) * smoothstep(0, 0.08, 1 - by),
      );
      const tone = (((row * 31 + Math.floor((u + offset) * cols) * 17) * 2654435761) % 89) / 89;
      const grain = n.noise(u * 48, v * 48) * 0.12;
      const c = r(clamp01(0.35 + tone * 0.45 + grain));
      const m = parseColor('#a89e8c');
      const out: [number, number, number] = [
        lerp(m.r, c[0], mortar), lerp(m.g, c[1], mortar), lerp(m.b, c[2], mortar),
      ];
      return [out[0], out[1], out[2], 255];
    });
  },
});

def({
  id: 'marble', label: 'Marble', group: 'interior', scale: 2,
  make(px, p, rng) {
    const n = new TileableNoise(6, rng.int(1, 1e6));
    const vein = new TileableNoise(10, rng.int(1, 1e6));
    const r = ramp([
      { t: 0, color: '#6d6a66' },
      { t: 0.4, color: '#cfc9bf' },
      { t: 0.75, color: '#e8e3d9' },
      { t: 1, color: '#ffffff' },
    ]);
    px.each((u, v) => {
      const warp = vein.fbm(u * 10, v * 10, 4) * 0.6;
      const marbleT = Math.sin((u * 3 + v * 2 + warp * 4) * Math.PI) * 0.5 + 0.5;
      const grain = n.fbm(u * 6, v * 6, 3) * 0.1;
      const c = r(clamp01(0.45 + marbleT * 0.55 + grain));
      return [c[0], c[1], c[2], 255];
    });
  },
});

def({
  id: 'carpet', label: 'Carpet', group: 'interior', scale: 1,
  make(px, p, rng) {
    const n = new TileableNoise(80, rng.int(1, 1e6));
    const base0 = mix(p.accent, '#6a1f22', 0.5);
    const r = ramp([
      { t: 0, color: mix(base0, '#170808', 0.5) },
      { t: 0.5, color: base0 },
      { t: 1, color: mix(base0, '#e0b26a', 0.35) },
    ]);
    px.each((u, v) => {
      const fuzz = n.turbulence(u * 80, v * 80, 2);
      const c = r(clamp01(0.35 + fuzz * 0.6));
      return [c[0], c[1], c[2], 255];
    });
  },
});

def({
  id: 'cave-floor', label: 'Cavern Floor', group: 'interior', scale: 1,
  make(px, p, rng) {
    const n = new TileableNoise(14, rng.int(1, 1e6));
    const cell = new WorleyNoise(18, rng.int(1, 1e6), 1);
    const base0 = mix(p.rock, '#574f45', 0.65);
    const r = ramp([
      { t: 0, color: mix(base0, '#120f0c', 0.55) },
      { t: 0.5, color: base0 },
      { t: 1, color: mix(base0, '#cfc4b1', 0.45) },
    ]);
    px.each((u, v) => {
      const [f1, f2] = cell.f1f2(u * 18, v * 18);
      const pebbles = smoothstep(0.0, 0.1, f2 - f1);
      const base = n.fbm(u * 14, v * 14, 5) * 0.5 + 0.5;
      const c = r(clamp01(base * 0.7 + pebbles * 0.3));
      return [c[0], c[1], c[2], 255];
    });
  },
});

def({
  id: 'metal', label: 'Riveted Metal', group: 'interior', scale: 1,
  make(px, p, rng) {
    const n = new TileableNoise(50, rng.int(1, 1e6));
    const r = ramp([
      { t: 0, color: '#2b2f33' },
      { t: 0.5, color: '#565c62' },
      { t: 1, color: '#9aa2a8' },
    ]);
    px.each((u, v) => {
      const brushed = n.noise(u * 200, v * 6) * 0.25;
      const c = r(clamp01(0.5 + brushed));
      return [c[0], c[1], c[2], 255];
    });
  },
  overlay(ctx, p, rng, size) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    const n = 6;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const x = (i + 0.5) * (size / n), y = (j + 0.5) * (size / n);
        ctx.beginPath(); ctx.arc(x, y, size / 90, 0, Math.PI * 2); ctx.fill();
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

const cache = new Map<string, Surface>();

export interface TextureOptions {
  size?: number;
  paletteId?: string;
  seed?: number;
}

export function getTexture(id: string, opts: TextureOptions = {}): Surface {
  const size = opts.size ?? 256;
  const paletteId = opts.paletteId ?? 'atlas';
  const seed = opts.seed ?? 1;
  const key = `${id}|${paletteId}|${size}|${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const d = textureDef(id) || defs[0];
  const palette = paletteById(paletteId);
  const rng = new RNG(`${id}:${paletteId}:${seed}`);
  const px = new PixelWriter(size);
  d.make(px, palette, rng, size);

  const surf = createSurface(size, size);
  const ctx = ctxOf(surf);
  ctx.putImageData(px.toImageData(), 0, 0);
  if (d.overlay) d.overlay(ctx, palette, new RNG(`${id}:overlay:${seed}`), size);

  cache.set(key, surf);
  return surf;
}

export function getPattern(
  ctx: CanvasRenderingContext2D,
  id: string,
  opts: TextureOptions & { scale?: number } = {},
): CanvasPattern {
  const tile = getTexture(id, opts);
  const pat = ctx.createPattern(tile, 'repeat')!;
  const s = opts.scale ?? 1;
  if (s !== 1 && typeof DOMMatrix !== 'undefined') {
    pat.setTransform(new DOMMatrix().scaleSelf(s, s));
  }
  return pat;
}

export function clearTextureCache(): void { cache.clear(); }

/** Small preview used by the texture picker in the UI. */
export function texturePreview(id: string, paletteId: string, size = 64): string {
  const tile = getTexture(id, { paletteId, size: 128 });
  const out = createSurface(size, size);
  const ctx = ctxOf(out);
  ctx.drawImage(tile, 0, 0, size, size);
  return out.toDataURL('image/png');
}
