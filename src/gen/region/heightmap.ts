/**
 * Terrain fields for the region generator: elevation, moisture, temperature,
 * plus the hydrology pass that turns a heightmap into rivers and lakes.
 */
import { SimplexNoise, clamp01, smoothstep, lerp } from '../../core/noise';
import { RNG } from '../../core/rng';

export type LandShape = 'continent' | 'archipelago' | 'inland-sea' | 'coastline' | 'pangaea' | 'atoll';

export interface FieldOptions {
  width: number;          // grid columns
  height: number;         // grid rows
  seed: number;
  shape: LandShape;
  /** 0 = drowned, 1 = mostly land. */
  landRatio: number;
  /** Higher = more, smaller features. */
  roughness: number;
  /** 0 = flat, 1 = alpine. */
  relief: number;
  /** Global wetness bias. */
  moistureBias: number;
  /** -1 arctic … 1 tropical. */
  temperatureBias: number;
  /** Number of erosion iterations (softens and carves valleys). */
  erosion: number;
}

export interface Fields {
  w: number;
  h: number;
  elevation: Float32Array;   // 0..1, sea level at `seaLevel`
  moisture: Float32Array;    // 0..1
  temperature: Float32Array; // 0..1
  water: Uint8Array;         // 1 = ocean/lake
  flow: Float32Array;        // flow accumulation
  seaLevel: number;
  distanceToWater: Float32Array;
}

export const DEFAULT_FIELD_OPTIONS: FieldOptions = {
  width: 320, height: 220, seed: 1, shape: 'continent',
  landRatio: 0.46, roughness: 0.5, relief: 0.6,
  moistureBias: 0, temperatureBias: 0, erosion: 3,
};

const idx = (x: number, y: number, w: number) => y * w + x;

export function generateFields(opts: Partial<FieldOptions> = {}): Fields {
  const o: FieldOptions = { ...DEFAULT_FIELD_OPTIONS, ...opts };
  const { width: w, height: h } = o;
  const rng = new RNG(o.seed);
  const base = new SimplexNoise(o.seed);
  const warp = new SimplexNoise(o.seed + 977);
  const ridge = new SimplexNoise(o.seed + 4231);
  const moist = new SimplexNoise(o.seed + 8123);

  const elevation = new Float32Array(w * h);
  const freq = 2.2 + o.roughness * 3.2;

  // --- Base elevation ------------------------------------------------------
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      const wx = warp.fbm(u * 2.1, v * 2.1, 3) * 0.35;
      const wy = warp.fbm(u * 2.1 + 5.3, v * 2.1 + 1.7, 3) * 0.35;
      let e = base.fbm((u + wx) * freq, (v + wy) * freq, 6, 2, 0.5) * 0.5 + 0.5;
      const r = ridge.ridged((u + wx) * freq * 0.8, (v + wy) * freq * 0.8, 5) * 0.5 + 0.5;
      e = lerp(e, e * 0.55 + r * 0.65, o.relief * 0.75);
      elevation[idx(x, y, w)] = e;
    }
  }

  // --- Landmass shaping ----------------------------------------------------
  applyShape(elevation, w, h, o, rng);

  // --- Normalise then pick a sea level that hits the requested land ratio ---
  normalise(elevation);
  const seaLevel = pickSeaLevel(elevation, 1 - o.landRatio);

  // --- Erosion -------------------------------------------------------------
  for (let i = 0; i < o.erosion; i++) thermalErode(elevation, w, h, 0.55);

  // --- Water mask + distance field ----------------------------------------
  const water = new Uint8Array(w * h);
  for (let i = 0; i < elevation.length; i++) water[i] = elevation[i] < seaLevel ? 1 : 0;
  fillInlandLakes(elevation, water, w, h, seaLevel);
  const distanceToWater = distanceField(water, w, h);

  // --- Hydrology -----------------------------------------------------------
  const flow = computeFlow(elevation, water, w, h);

  // --- Climate -------------------------------------------------------------
  const temperature = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(x, y, w);
      const u = x / w, v = y / h;
      const alt = clamp01((elevation[i] - seaLevel) / Math.max(0.05, 1 - seaLevel));

      // Latitude band: poles cold, equator hot. Altitude cools.
      //
      // A pure function of latitude puts every biome boundary on a perfectly
      // horizontal line, which reads as banding across the whole map. Warping
      // the latitude itself — so the isotherms wander north and south — plus a
      // healthy dose of local variation breaks that up without losing the
      // underlying "cold at the poles" logic.
      const latWarp = moist.fbm(u * 1.7 + 21.3, v * 1.7 + 13.1, 4) * 0.13;
      const lat = clamp01(Math.abs(v + latWarp - 0.5) * 2);
      const local = moist.fbm(u * 3.6 + 11, v * 3.6 + 7, 4) * 0.5 + 0.5;
      const t = 1 - lat * 1.15 + o.temperatureBias * 0.4 - alt * 0.55
        + local * 0.28 - 0.14;
      temperature[i] = clamp01(t);
    }
  }

  const moisture = rainfall(elevation, water, flow, distanceToWater, w, h, seaLevel, o, rng, moist);

  return { w, h, elevation, moisture, temperature, water, flow, seaLevel, distanceToWater };
}

// ---------------------------------------------------------------------------
// Rainfall
// ---------------------------------------------------------------------------

/**
 * Moisture from a prevailing wind rather than a second noise field.
 *
 * Noise gives you wet and dry patches, but they sit wherever the noise happens
 * to put them — which means the desert can end up on the windward coast and the
 * rainforest up a mountain, and nothing about the map's climate explains
 * anything about its terrain. Instead an air parcel is walked across the grid
 * from one edge: it picks up water over the sea, drops it when the ground rises
 * under it, and arrives on the far side of a range with nothing left. Deserts
 * then appear in the lee of mountains and rainforests on the slopes that face
 * the wind, which is both correct and, more usefully, legible — a player
 * looking at the map can see *why* the dry country is dry.
 *
 * The result is then histogram-equalised. The raw rainfall values clump hard
 * around the mean, and a classifier with thresholds at 0.24 and 0.70 would find
 * almost nothing on either side of them — which is exactly how a world ends up
 * with no deserts and no jungles at all.
 */
function rainfall(
  elevation: Float32Array, water: Uint8Array, flow: Float32Array,
  distanceToWater: Float32Array, w: number, h: number, seaLevel: number,
  o: FieldOptions, rng: RNG, moist: SimplexNoise,
): Float32Array {
  const span = Math.max(0.05, 1 - seaLevel);

  // Prevailing wind, biased towards the westerlies but not fixed — the same
  // continent with the wind off the other ocean is a genuinely different world.
  const dirs: [number, number][] = [[1, 0], [1, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1]];
  const [dx, dy] = dirs[rng.int(0, dirs.length - 1)];

  const carried = new Float32Array(w * h);
  const rain = new Float32Array(w * h);

  const xs = dx >= 0 ? { from: 0, to: w, step: 1 } : { from: w - 1, to: -1, step: -1 };
  const ys = dy >= 0 ? { from: 0, to: h, step: 1 } : { from: h - 1, to: -1, step: -1 };

  for (let y = ys.from; y !== ys.to; y += ys.step) {
    for (let x = xs.from; x !== xs.to; x += xs.step) {
      const i = idx(x, y, w);
      const ux = x - dx, uy = y - dy;
      const inside = ux >= 0 && uy >= 0 && ux < w && uy < h;
      const up = inside ? idx(ux, uy, w) : -1;

      // Air arriving from off-map comes in saturated: it has been over ocean.
      const incoming = up >= 0 ? carried[up] : 1;
      const upElev = up >= 0 ? elevation[up] : seaLevel;

      if (water[i]) {
        carried[i] = Math.min(1, incoming + 0.16);
        rain[i] = 0.6;
        continue;
      }

      // Orographic lift: the steeper the climb, the more it rains here and the
      // less is left for whatever is on the other side.
      const lift = Math.max(0, (elevation[i] - upElev) / span);
      const drop = Math.min(incoming, incoming * (0.03 + lift * 9));
      rain[i] = drop;
      // A little recharge from lakes, rivers and transpiration, so a very wide
      // continent does not go uniformly bone dry towards its far coast.
      carried[i] = Math.min(1, (incoming - drop) * 0.997 + 0.006);
    }
  }

  // Mix in a small amount of local noise and river influence so the rain
  // shadows have texture rather than reading as clean stripes.
  const maxDist = Math.max(1, Math.hypot(w, h) * 0.25);
  const raw = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(x, y, w);
      const u = x / w, v = y / h;
      const n = moist.fbm(u * 3.4, v * 3.4, 4) * 0.5 + 0.5;
      const coastal = 1 - clamp01(distanceToWater[i] / maxDist);
      raw[i] = rain[i] * 0.62 + n * 0.2 + coastal * 0.13 + Math.min(0.05, flow[i] * 0.0008);
    }
  }

  // --- Histogram equalisation over land ------------------------------------
  const BINS = 512;
  const hist = new Float64Array(BINS);
  let lo = Infinity, hi = -Infinity, landCells = 0;
  for (let i = 0; i < raw.length; i++) {
    if (water[i]) continue;
    if (raw[i] < lo) lo = raw[i];
    if (raw[i] > hi) hi = raw[i];
    landCells++;
  }
  if (!landCells || hi <= lo) {
    for (let i = 0; i < raw.length; i++) raw[i] = clamp01(raw[i]);
    return raw;
  }
  const scale = (BINS - 1) / (hi - lo);
  for (let i = 0; i < raw.length; i++) {
    if (water[i]) continue;
    hist[Math.round((raw[i] - lo) * scale)]++;
  }
  const cdf = new Float64Array(BINS);
  let run = 0;
  for (let k = 0; k < BINS; k++) { run += hist[k]; cdf[k] = run / landCells; }

  // A perfectly flat distribution would hand every world the same fraction of
  // desert, so pull it back towards its own shape and let a per-world aridity
  // offset do the rest.
  const aridity = rng.float(-0.16, 0.16) + o.moistureBias * 0.35;
  const out = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    const k = Math.max(0, Math.min(BINS - 1, Math.round((raw[i] - lo) * scale)));
    const eq = cdf[k];
    const eased = eq * eq * (3 - 2 * eq);
    out[i] = clamp01(eq * 0.7 + eased * 0.3 + aridity);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Shaping
// ---------------------------------------------------------------------------

function applyShape(e: Float32Array, w: number, h: number, o: FieldOptions, rng: RNG): void {
  const cx = 0.5, cy = 0.5;
  const blobs: { x: number; y: number; r: number }[] = [];
  if (o.shape === 'archipelago' || o.shape === 'atoll') {
    const n = o.shape === 'atoll' ? 1 : rng.int(6, 14);
    for (let i = 0; i < n; i++) {
      blobs.push({ x: rng.float(0.15, 0.85), y: rng.float(0.15, 0.85), r: rng.float(0.06, 0.2) });
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      const i = idx(x, y, w);
      let mask = 1;
      switch (o.shape) {
        case 'continent': {
          const d = Math.hypot((u - cx) * 1.15, (v - cy) * 1.35);
          mask = 1 - smoothstep(0.24, 0.62, d);
          break;
        }
        case 'pangaea': {
          const d = Math.hypot((u - cx) * 0.9, (v - cy) * 1.05);
          mask = 1 - smoothstep(0.38, 0.78, d);
          break;
        }
        case 'archipelago': {
          let m = 0;
          for (const b of blobs) {
            const d = Math.hypot(u - b.x, v - b.y);
            m = Math.max(m, 1 - smoothstep(b.r * 0.4, b.r, d));
          }
          mask = m * 0.9 + 0.12;
          break;
        }
        case 'atoll': {
          const b = blobs[0];
          const d = Math.hypot(u - b.x, v - b.y);
          const ring = 1 - Math.abs(d - b.r * 1.4) / (b.r * 0.7);
          mask = clamp01(ring) * 0.95 + 0.05;
          break;
        }
        case 'inland-sea': {
          const d = Math.hypot((u - cx) * 1.2, (v - cy) * 1.2);
          mask = smoothstep(0.1, 0.34, d) * (1 - smoothstep(0.5, 0.78, d));
          mask = clamp01(mask + 0.2);
          break;
        }
        case 'coastline': {
          // Land on one side, ocean on the other, with a wandering shore.
          mask = 1 - smoothstep(0.35, 0.85, u + (v - 0.5) * 0.25);
          break;
        }
      }
      // Always fade the outermost border to sea so nothing is cut off.
      const border = Math.min(
        smoothstep(0, 0.06, u), smoothstep(0, 0.06, 1 - u),
        smoothstep(0, 0.06, v), smoothstep(0, 0.06, 1 - v),
      );
      e[i] = e[i] * (0.25 + 0.75 * mask) * (0.2 + 0.8 * border);
    }
  }
}

function normalise(a: Float32Array): void {
  let min = Infinity, max = -Infinity;
  for (const v of a) { if (v < min) min = v; if (v > max) max = v; }
  const range = max - min || 1;
  for (let i = 0; i < a.length; i++) a[i] = (a[i] - min) / range;
}

function pickSeaLevel(e: Float32Array, waterFraction: number): number {
  const sample: number[] = [];
  const step = Math.max(1, Math.floor(e.length / 20000));
  for (let i = 0; i < e.length; i += step) sample.push(e[i]);
  sample.sort((a, b) => a - b);
  const k = Math.floor(clamp01(waterFraction) * (sample.length - 1));
  return sample[k];
}

/** Thermal erosion: slump material downhill so slopes become believable. */
function thermalErode(e: Float32Array, w: number, h: number, talus: number): void {
  const out = new Float32Array(e);
  const t = talus / Math.max(w, h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = idx(x, y, w);
      let total = 0;
      let maxDiff = 0;
      const diffs: number[] = [];
      const neigh = [i - 1, i + 1, i - w, i + w];
      for (const j of neigh) {
        const d = e[i] - e[j];
        diffs.push(d > t ? d : 0);
        if (d > t) { total += d; if (d > maxDiff) maxDiff = d; }
      }
      if (total <= 0) continue;
      const move = maxDiff * 0.25;
      out[i] -= move;
      for (let k = 0; k < neigh.length; k++) {
        if (diffs[k] > 0) out[neigh[k]] += (move * diffs[k]) / total;
      }
    }
  }
  e.set(out);
}

/** Flood from the borders so enclosed basins become lakes, not ocean. */
function fillInlandLakes(e: Float32Array, water: Uint8Array, w: number, h: number, seaLevel: number): void {
  const ocean = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let x = 0; x < w; x++) { stack.push(x, 0); stack.push(x, h - 1); }
  for (let y = 0; y < h; y++) { stack.push(0, y); stack.push(w - 1, y); }
  while (stack.length) {
    const y = stack.pop()!, x = stack.pop()!;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const i = idx(x, y, w);
    if (ocean[i] || !water[i]) continue;
    ocean[i] = 1;
    stack.push(x - 1, y, x + 1, y, x, y - 1, x, y + 1);
  }
  // Everything still marked water but not reachable from the border is a lake:
  // keep it as water, but raise it slightly so the biome pass can tell them apart.
  for (let i = 0; i < water.length; i++) {
    if (water[i] && !ocean[i]) e[i] = seaLevel - 0.004;
  }
}

/** Chamfer distance transform from water cells. */
function distanceField(water: Uint8Array, w: number, h: number): Float32Array {
  const d = new Float32Array(w * h).fill(1e9);
  for (let i = 0; i < water.length; i++) if (water[i]) d[i] = 0;
  const put = (i: number, v: number) => { if (v < d[i]) d[i] = v; };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(x, y, w);
      if (x > 0) put(i, d[i - 1] + 1);
      if (y > 0) put(i, d[i - w] + 1);
      if (x > 0 && y > 0) put(i, d[i - w - 1] + 1.414);
      if (x < w - 1 && y > 0) put(i, d[i - w + 1] + 1.414);
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = idx(x, y, w);
      if (x < w - 1) put(i, d[i + 1] + 1);
      if (y < h - 1) put(i, d[i + w] + 1);
      if (x < w - 1 && y < h - 1) put(i, d[i + w + 1] + 1.414);
      if (x > 0 && y < h - 1) put(i, d[i + w - 1] + 1.414);
    }
  }
  return d;
}

/** D8 flow accumulation — the input to river extraction. */
function computeFlow(e: Float32Array, water: Uint8Array, w: number, h: number): Float32Array {
  const order = new Int32Array(w * h);
  for (let i = 0; i < order.length; i++) order[i] = i;
  const arr = Array.from(order).sort((a, b) => e[b] - e[a]);

  const flow = new Float32Array(w * h).fill(1);
  const down = new Int32Array(w * h).fill(-1);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(x, y, w);
      let best = -1, bestE = e[i];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = idx(nx, ny, w);
          if (e[j] < bestE) { bestE = e[j]; best = j; }
        }
      }
      down[i] = best;
    }
  }

  for (const i of arr) {
    const j = down[i];
    if (j >= 0 && !water[i]) flow[j] += flow[i];
  }
  return flow;
}

/**
 * Trace river polylines from their sources down to the sea.
 *
 * Sorting purely by flow and tracing from the top picks river *mouths* first —
 * cells one step from the ocean — which produces two-pixel rivers and burns the
 * best candidates. Instead we find the heads (cells above the flow threshold
 * with no upstream neighbour that also clears it) and follow each one down.
 */
export function extractRivers(f: Fields, minFlow = 260, maxRivers = 26): { x: number; y: number; flow: number }[][] {
  const { w, h, elevation, water, flow } = f;

  const heads: number[] = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = idx(x, y, w);
      if (water[i] || flow[i] <= minFlow) continue;
      let fed = false;
      for (let dy = -1; dy <= 1 && !fed; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const j = idx(x + dx, y + dy, w);
          if (elevation[j] > elevation[i] && flow[j] > minFlow) { fed = true; break; }
        }
      }
      if (!fed) heads.push(i);
    }
  }

  // Longest, strongest rivers first so the map's headline features survive the cap.
  heads.sort((a, b) => flow[b] - flow[a]);

  const claimed = new Uint8Array(w * h);
  const rivers: { x: number; y: number; flow: number }[][] = [];

  for (const start of heads) {
    if (rivers.length >= maxRivers) break;
    if (claimed[start]) continue;

    const path: { x: number; y: number; flow: number }[] = [];
    let cur = start;
    let guard = 0;
    let joinedExisting = false;

    while (guard++ < w + h) {
      const x = cur % w, y = (cur / w) | 0;
      path.push({ x, y, flow: flow[cur] });
      if (water[cur]) break;
      if (claimed[cur] && path.length > 1) { joinedExisting = true; break; }
      claimed[cur] = 1;

      let best = -1, bestE = elevation[cur];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = idx(nx, ny, w);
          if (elevation[j] < bestE) { bestE = elevation[j]; best = j; }
        }
      }
      if (best < 0) break;   // sink: a lake with no outlet
      cur = best;
    }

    // A tributary that merges into a bigger river is still worth drawing, but a
    // three-cell dribble is not.
    if (path.length >= (joinedExisting ? 12 : 8)) rivers.push(path);
  }

  return rivers;
}
