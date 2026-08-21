/**
 * The terrain behind an operational map.
 *
 * This is a landlocked theatre a few kilometres across, not a continent: no sea
 * level, no biomes by latitude. What matters is where the ground rises, where
 * the water runs, and what is growing on the rest — because those three things
 * between them decide where an army can go and where it cannot.
 */
import { SimplexNoise, clamp01, smoothstep } from '../../core/noise';
import { RNG } from '../../core/rng';
import { OP_INDEX, OP_TERRAIN_ORDER, type OpTerrain } from './terrain';
import { removeLoops } from '../../core/geometry';

export interface OpFieldOptions {
  cols: number;
  rows: number;
  seed: number;
  /** 0 = a plain, 1 = a mountain pass. */
  relief: number;
  /** 0 = steppe, 1 = deep forest. */
  woodland: number;
  /** 0 = dry, 1 = river valley with marshes. */
  wetness: number;
  /** How much of the theatre is farmed and settled. */
  settlement: number;
}

export interface OpFields {
  cols: number;
  rows: number;
  /** 0..1 */
  elevation: Float32Array;
  /** Normalised slope magnitude, 0..1 */
  slope: Float32Array;
  /** Wetness, 0..1 — high in valley floors and near the watercourse. */
  wet: Float32Array;
  /** Tree cover, 0..1 */
  trees: Float32Array;
  /** Cells the watercourse runs through. */
  water: Uint8Array;
  /** The watercourse as a polyline of cell coordinates, source to mouth. */
  course: { x: number; y: number }[];
}

const IDX = (x: number, y: number, w: number) => y * w + x;

export function generateOpFields(o: OpFieldOptions): OpFields {
  const { cols, rows } = o;
  const rng = new RNG(o.seed);
  const base = new SimplexNoise(o.seed);
  const ridge = new SimplexNoise(o.seed + 4111);
  const wood = new SimplexNoise(o.seed + 8221);
  const damp = new SimplexNoise(o.seed + 1307);

  const n = cols * rows;
  const elevation = new Float32Array(n);
  const slope = new Float32Array(n);
  const wet = new Float32Array(n);
  const trees = new Float32Array(n);
  const water = new Uint8Array(n);

  // --- Elevation -----------------------------------------------------------
  // A ridge across the map plus rolling ground. The ridge is what makes a
  // theatre worth planning in: it gives high ground to hold, a reverse slope to
  // hide behind, and a limited number of ways through.
  const ridgeAngle = rng.float(0, Math.PI);
  const rc = Math.cos(ridgeAngle), rs = Math.sin(ridgeAngle);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const u = x / cols, v = y / rows;
      // Distance from a wandering line across the map.
      const along = u * rc + v * rs;
      const across = -u * rs + v * rc;
      const wander = base.fbm(along * 2.4, 7.3, 3) * 0.22;
      const band = Math.abs(across - 0.5 + wander);
      const spine = Math.exp(-(band * band) / 0.024);

      const rolling = base.fbm(u * 3.1, v * 3.1, 5) * 0.5 + 0.5;
      const broken = Math.abs(ridge.fbm(u * 5.4, v * 5.4, 4));
      elevation[IDX(x, y, cols)] = clamp01(
        rolling * 0.5 + spine * o.relief * 0.75 + broken * o.relief * 0.28,
      );
    }
  }

  // --- Slope ---------------------------------------------------------------
  // Against a *fixed* reference gradient, not the map's own maximum. Dividing
  // by the maximum renormalises every map to the same spread, so a theatre
  // asked for as a mountain pass classifies exactly like a theatre asked for as
  // a plain — the relief slider moves the colours and changes nothing that
  // matters. A constant means steep ground is steep in absolute terms.
  const REFERENCE_GRADIENT = 0.3;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = IDX(x, y, cols);
      const l = elevation[IDX(Math.max(0, x - 1), y, cols)];
      const r = elevation[IDX(Math.min(cols - 1, x + 1), y, cols)];
      const u = elevation[IDX(x, Math.max(0, y - 1), cols)];
      const d = elevation[IDX(x, Math.min(rows - 1, y + 1), cols)];
      slope[i] = clamp01(Math.hypot(r - l, d - u) / REFERENCE_GRADIENT);
    }
  }

  // --- Watercourse ---------------------------------------------------------
  // One river, walked downhill from the highest edge cell. At this scale a
  // theatre has one watercourse that matters and the question is where you can
  // cross it, so tracing a single course beats a drainage network.
  const raw = traceCourse(elevation, cols, rows);
  // Steepest descent produces switchbacks a real watercourse would have cut
  // through long ago, so the course is relaxed before anything is derived from
  // it — and the water cells are then rasterised from the *smoothed* line, so
  // the blue on the map and the impassable cells in the model stay the same
  // river.
  const course = smoothCourse(raw, cols, rows);
  rasteriseCourse(course, water, cols, rows);

  // --- Wetness -------------------------------------------------------------
  const dist = distanceToWater(water, cols, rows);
  const spanCells = Math.max(cols, rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = IDX(x, y, cols);
      const u = x / cols, v = y / rows;
      const near = 1 - clamp01(dist[i] / (spanCells * 0.13));
      const low = 1 - elevation[i];
      const flat = 1 - slope[i];
      const noise = damp.fbm(u * 3.6, v * 3.6, 3) * 0.5 + 0.5;
      wet[i] = clamp01((near * 0.55 + low * 0.3 + flat * 0.2) * (0.5 + noise * 0.8) * (0.4 + o.wetness));
    }
  }

  // --- Tree cover ----------------------------------------------------------
  // Woods take the ground nobody farms: the steep bits, the wet bits, and
  // wherever the noise says a wood happens to be.
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = IDX(x, y, cols);
      const u = x / cols, v = y / rows;
      const patch = wood.fbm(u * 2.7, v * 2.7, 4) * 0.5 + 0.5;
      const detail = wood.fbm(u * 7.5 + 12, v * 7.5, 3) * 0.5 + 0.5;
      const marginal = slope[i] * 0.4 + clamp01(wet[i] - 0.5) * 0.5;
      trees[i] = clamp01((patch * 0.7 + detail * 0.3) * (0.35 + o.woodland) + marginal * 0.35 - 0.18);
    }
  }

  return { cols, rows, elevation, slope, wet, trees, water, course };
}

/**
 * Walk downhill from the highest point on an edge until the map runs out.
 *
 * The walk refuses to step anywhere adjacent to ground it has already used.
 * Steepest descent on a noisy field otherwise curls back on itself and draws a
 * river that crosses its own course twice, which is the sort of thing a reader
 * notices immediately and cannot unsee.
 */
function traceCourse(e: Float32Array, cols: number, rows: number): { x: number; y: number }[] {
  // Start on whichever edge cell is highest — that is where the water enters.
  let start = { x: 0, y: 0 }, best = -1;
  const edge = (x: number, y: number) => {
    const v = e[IDX(x, y, cols)];
    if (v > best) { best = v; start = { x, y }; }
  };
  for (let x = 0; x < cols; x++) { edge(x, 0); edge(x, rows - 1); }
  for (let y = 0; y < rows; y++) { edge(0, y); edge(cols - 1, y); }

  const path: { x: number; y: number }[] = [];
  const used = new Uint8Array(cols * rows);       // on the course
  const near = new Uint8Array(cols * rows);       // beside the course
  const markNear = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        near[IDX(nx, ny, cols)] = 1;
      }
    }
  };

  let { x, y } = start;
  for (let guard = 0; guard < cols * rows; guard++) {
    const i = IDX(x, y, cols);
    path.push({ x, y });
    used[i] = 1;
    if (path.length > 3 && (x === 0 || y === 0 || x === cols - 1 || y === rows - 1)) break;

    let bx = -1, by = -1, drop = -Infinity;
    // Two passes: prefer ground that is not even beside the course; fall back
    // to merely unused ground rather than dead-ending in a bend.
    for (let pass = 0; pass < 2 && bx < 0; pass++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const j = IDX(nx, ny, cols);
          if (used[j]) continue;
          if (pass === 0 && near[j]) continue;
          const dz = e[i] - e[j];
          const bias = (dx === 0 || dy === 0) ? 0.0008 : 0;
          if (dz + bias > drop) { drop = dz + bias; bx = nx; by = ny; }
        }
      }
    }
    if (bx < 0) break;
    markNear(x, y);
    x = bx; y = by;
  }
  return path;
}

/** Laplacian relaxation of the course, with the ends pinned. */
function smoothCourse(
  path: { x: number; y: number }[], cols: number, rows: number,
): { x: number; y: number }[] {
  if (path.length < 5) return path;
  let cur = path.map((p) => ({ x: p.x, y: p.y }));
  for (let pass = 0; pass < 2; pass++) {
    const next = cur.map((p) => ({ x: p.x, y: p.y }));
    for (let i = 1; i < cur.length - 1; i++) {
      next[i].x = cur[i].x + (cur[i - 1].x + cur[i + 1].x - 2 * cur[i].x) * 0.28;
      next[i].y = cur[i].y + (cur[i - 1].y + cur[i + 1].y - 2 * cur[i].y) * 0.28;
    }
    cur = next;
  }
  for (const p of cur) {
    p.x = Math.max(0, Math.min(cols - 1, p.x));
    p.y = Math.max(0, Math.min(rows - 1, p.y));
  }
  return removeLoops(cur);
}

/** Mark every cell the smoothed course passes through. */
function rasteriseCourse(
  path: { x: number; y: number }[], water: Uint8Array, cols: number, rows: number,
): void {
  const mark = (x: number, y: number) => {
    const cx = Math.round(x), cy = Math.round(y);
    if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return;
    water[IDX(cx, cy, cols)] = 1;
  };
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 3));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      mark(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    }
  }
}

function distanceToWater(water: Uint8Array, cols: number, rows: number): Float32Array {
  const d = new Float32Array(cols * rows).fill(1e9);
  for (let i = 0; i < water.length; i++) if (water[i]) d[i] = 0;
  const put = (i: number, v: number) => { if (v < d[i]) d[i] = v; };
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = IDX(x, y, cols);
      if (x > 0) put(i, d[i - 1] + 1);
      if (y > 0) put(i, d[i - cols] + 1);
      if (x > 0 && y > 0) put(i, d[i - cols - 1] + 1.414);
      if (x < cols - 1 && y > 0) put(i, d[i - cols + 1] + 1.414);
    }
  }
  for (let y = rows - 1; y >= 0; y--) {
    for (let x = cols - 1; x >= 0; x--) {
      const i = IDX(x, y, cols);
      if (x < cols - 1) put(i, d[i + 1] + 1);
      if (y < rows - 1) put(i, d[i + cols] + 1);
      if (x < cols - 1 && y < rows - 1) put(i, d[i + cols + 1] + 1.414);
      if (x > 0 && y < rows - 1) put(i, d[i + cols - 1] + 1.414);
    }
  }
  return d;
}

/**
 * Assign a terrain class to every cell.
 *
 * Order matters: the impassable and the wet win over the merely wooded, because
 * a marsh with trees in it is still a marsh as far as getting a company across
 * it is concerned.
 */
export function classifyOp(f: OpFields, o: OpFieldOptions): Uint8Array {
  const out = new Uint8Array(f.cols * f.rows);
  const rng = new RNG(o.seed + 77);
  const settleNoise = new SimplexNoise(o.seed + 555);

  const arable = arableField(f, o);
  for (let y = 0; y < f.rows; y++) {
    for (let x = 0; x < f.cols; x++) {
      const i = IDX(x, y, f.cols);
      const t: OpTerrain = f.water[i]
        ? 'water'
        : classifyOpValues(f.elevation[i], f.slope[i], f.wet[i], f.trees[i], arable[i]);

      out[i] = OP_INDEX[t];
    }
  }

  // A handful of ruins on the high ground — old works, worth holding.
  const ruins = Math.round(f.cols * f.rows * 0.004);
  for (let k = 0; k < ruins; k++) {
    const x = rng.int(1, f.cols - 2), y = rng.int(1, f.rows - 2);
    const i = IDX(x, y, f.cols);
    if (!Number.isFinite(OP_TERRAIN_ORDER.indexOf('crag'))) continue;
    if (out[i] === OP_INDEX.water || out[i] === OP_INDEX.crag) continue;
    if (f.elevation[i] < 0.45) continue;
    out[i] = OP_INDEX.ruin;
  }

  return out;
}

export { IDX as opIndex };

/** Bilinear sample of a cell field at fractional cell coordinates. */
export function sampleOp(arr: Float32Array, cols: number, rows: number, gx: number, gy: number): number {
  const x0 = gx < 0 ? 0 : gx > cols - 1 ? cols - 1 : gx;
  const y0 = gy < 0 ? 0 : gy > rows - 1 ? rows - 1 : gy;
  const ix = x0 | 0, iy = y0 | 0;
  const fx = x0 - ix, fy = y0 - iy;
  const ix1 = ix + 1 < cols ? ix + 1 : ix;
  const iy1 = iy + 1 < rows ? iy + 1 : iy;
  const a = arr[iy * cols + ix], b = arr[iy * cols + ix1];
  const c = arr[iy1 * cols + ix], d = arr[iy1 * cols + ix1];
  const top = a + (b - a) * fx;
  const bot = c + (d - c) * fx;
  return top + (bot - top) * fy;
}

/**
 * Classify from raw field values rather than a cell index.
 *
 * The painter calls this per screen pixel with bilinearly interpolated values,
 * which is what stops the map reading as a checkerboard: a class boundary
 * follows the contour of the field that produced it instead of the edge of
 * whichever cell happened to be sampled. The cell grid stays exactly what it
 * was — a measuring instrument laid over the ground, not the ground itself.
 */
export function classifyOpValues(
  elevation: number, slope: number, wet: number, trees: number, arable: number,
): OpTerrain {
  if (slope > 0.78 && elevation > 0.6) return 'crag';
  if (slope > 0.5) return 'steep';
  if (wet > 0.72) return 'marsh';
  if (trees > 0.62) return 'forest';
  if (trees > 0.42) return 'woods';
  if (slope > 0.34) return 'rough';
  if (trees > 0.3) return 'scrub';
  return arable > 0.42 ? 'field' : 'open';
}

/**
 * The arable field, precomputed so the painter and the cell classifier agree
 * on where the farmland is without recomputing noise per pixel.
 */
export function arableField(f: OpFields, o: OpFieldOptions): Float32Array {
  const settleNoise = new SimplexNoise(o.seed + 555);
  const out = new Float32Array(f.cols * f.rows);
  for (let y = 0; y < f.rows; y++) {
    for (let x = 0; x < f.cols; x++) {
      const i = IDX(x, y, f.cols);
      const u = x / f.cols, v = y / f.rows;
      out[i] = (settleNoise.fbm(u * 2.2, v * 2.2, 3) * 0.5 + 0.5)
        * (1 - f.elevation[i] * 0.6) * (0.4 + o.settlement);
    }
  }
  return out;
}
