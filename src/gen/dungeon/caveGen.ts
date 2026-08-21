/**
 * Cave generator: cellular automata carve the caverns, a flood fill keeps only
 * connected space, and tunnels stitch surviving pockets back together.
 */
import type { MapDocument, Wall } from '../../core/types';
import { createDocument, objectLayerByRole } from '../../core/doc';
import { RNG } from '../../core/rng';
import { SimplexNoise } from '../../core/noise';
import { createNamer } from '../names';
import { makeGrid, at, isOpen, traceWalls, paintDungeon, type CellGrid } from './grid';
import { makeStamp, makeStampAuto, makeLight, makeText } from '../../core/factories';
import { paletteById, mix } from '../../core/color';
import type { Vec2 } from '../../core/types';
import { dist } from '../../core/geometry';

/**
 * How the space is laid out.
 *
 * `cavern` is the pure cellular-automata cave, which is what this generator
 * used to produce unconditionally. It is the right shape for a single big
 * arena, and the wrong one for almost everything else: run it at any density
 * that stays connected and you get one undifferentiated blob with no chambers,
 * no tunnels and nowhere for a party to be ambushed.
 */
export type CaveStyle = 'chambers' | 'warren' | 'cavern';

export interface CaveGenOptions {
  width: number;
  height: number;
  cell: number;
  seed: number;
  style: CaveStyle;
  /** Number of chambers for the chamber-based styles. 0 = pick from map size. */
  chambers: number;
  /** Initial proportion of solid rock, 0.35–0.55 works well. */
  density: number;
  smoothing: number;
  /** Keep only pockets larger than this many cells. */
  minPocket: number;
  water: boolean;
  waterLevel: number;
  crystals: boolean;
  mushrooms: boolean;
  lights: boolean;
  paletteId: string;
  floorTexture: string;
  wallTexture: string;
  title?: string;
}

export const DEFAULT_CAVE_OPTIONS: CaveGenOptions = {
  width: 2800, height: 2100, cell: 70, seed: 1,
  style: 'chambers', chambers: 0,
  density: 0.45, smoothing: 5, minPocket: 30,
  water: true, waterLevel: 0.12, crystals: true, mushrooms: true, lights: true,
  paletteId: 'dungeon', floorTexture: 'cave-floor', wallTexture: 'rock',
};

export interface CaveResult {
  doc: MapDocument;
  grid: CellGrid;
  walls: Wall[];
}

export function generateCave(opts: Partial<CaveGenOptions> = {}): CaveResult {
  const o: CaveGenOptions = { ...DEFAULT_CAVE_OPTIONS, ...opts };
  const rng = new RNG(o.seed);
  const namer = createNamer(o.seed, 'dwarven');

  const cols = Math.max(20, Math.floor(o.width / o.cell));
  const rows = Math.max(16, Math.floor(o.height / o.cell));
  const g = makeGrid(cols, rows);

  if (o.style === 'cavern') {
    carveCavern(g, o, rng);
  } else {
    carveChambers(g, o, rng);
  }

  // Pockets
  const pockets = findPockets(g);
  pockets.sort((a, b) => b.cells.length - a.cells.length);
  const kept = pockets.filter((p) => p.cells.length >= o.minPocket);
  for (const p of pockets) {
    if (kept.includes(p)) continue;
    for (const i of p.cells) g.open[i] = 0;
  }
  // Tunnel any surviving pockets together — the chamber layout already links
  // its chambers, but smoothing can still pinch a passage shut.
  for (let i = 1; i < kept.length; i++) {
    tunnel(g, kept[i - 1].center, kept[i].center, rng, 0);
  }

  const doc = createDocument({
    kind: 'cave',
    width: cols * o.cell,
    height: rows * o.cell,
    title: o.title || `${namer.dungeon()} Caverns`,
    paletteId: o.paletteId,
    gridOverride: { size: o.cell, type: 'square', visible: true, snap: true },
  });
  doc.meta.seed = o.seed;
  doc.lighting.darkness = 1;
  doc.lighting.globalLight = false;

  paintDungeon(doc, g, {
    paletteId: o.paletteId,
    floorTexture: o.floorTexture,
    wallTexture: o.wallTexture,
    voidColor: '#0b0a09',
    wallThickness: o.cell * 0.75,
    wallShadow: o.cell * 0.45,
    edgeRoughness: 0.85,
    seed: o.seed,
    grid: { originX: 0, originY: 0, cell: o.cell },
  });

  const walls = traceWalls(g, o.cell, []);
  const wl = doc.layers.find((l) => l.kind === 'wall');
  if (wl && wl.kind === 'wall') wl.walls = walls;

  dressCave(doc, g, o, rng);

  return { doc, grid: g, walls };
}

interface Pocket { cells: number[]; center: Vec2; }

/**
 * The original cellular-automata cave: one large organic space.
 */
function carveCavern(g: CellGrid, o: CaveGenOptions, rng: RNG): void {
  const { cols, rows } = g;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const border = x < 2 || y < 2 || x >= cols - 2 || y >= rows - 2;
      g.open[at(g, x, y)] = border ? 0 : (rng.next() > o.density ? 1 : 0);
    }
  }
  smooth(g, o.smoothing);
}

/**
 * Chambers joined by tunnels.
 *
 * Cellular automata alone cannot produce this: the rule has no notion of "a
 * room", so at any density that keeps the cave connected it dissolves into a
 * single blob, and at any density that keeps chambers distinct it disconnects
 * them entirely. Placing the chambers first and letting the automata only
 * roughen their edges keeps both properties — a party can be in a chamber, or
 * in a tunnel between chambers, which is the whole point of a cave map.
 */
function carveChambers(g: CellGrid, o: CaveGenOptions, rng: RNG): void {
  const { cols, rows } = g;
  g.open.fill(0);

  const warren = o.style === 'warren';
  const area = (cols - 6) * (rows - 6);
  const want = o.chambers > 0
    ? o.chambers
    : Math.max(5, Math.round(area / (warren ? 34 : 52)));

  // Chamber centres and radii chosen together, so the rejection test can ask
  // the question that actually matters: would these two chambers touch? Testing
  // centre distance alone lets a pair of large chambers overlap into one shape
  // and the whole layout collapses back into a blob.
  const centres: Vec2[] = [];
  const radii: number[] = [];
  const gap = warren ? 2.2 : 2.9;

  for (let attempt = 0; attempt < want * 120 && centres.length < want; attempt++) {
    const r = warren ? rng.float(1.6, 2.8) : rng.float(2.0, 4.2);
    const pad = Math.ceil(r) + 3;
    if (cols - pad * 2 < 2 || rows - pad * 2 < 2) break;
    const c = { x: rng.int(pad, cols - pad - 1), y: rng.int(pad, rows - pad - 1) };
    let clash = false;
    for (let k = 0; k < centres.length; k++) {
      if (dist(centres[k], c) < r + radii[k] + gap) { clash = true; break; }
    }
    if (clash) continue;
    centres.push(c);
    radii.push(r);
  }
  if (!centres.length) { centres.push({ x: cols >> 1, y: rows >> 1 }); radii.push(3); }

  const noise = new SimplexNoise(rng.int(1, 1e6));

  for (let k = 0; k < centres.length; k++) {
    const c = centres[k];
    const base = radii[k];
    // A wobbling radius rather than a circle: caves are dissolved rock, not
    // drilled holes.
    const reach = Math.ceil(base * 1.45);
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const x = c.x + dx, y = c.y + dy;
        if (x < 2 || y < 2 || x >= cols - 2 || y >= rows - 2) continue;
        const d = Math.hypot(dx, dy);
        if (d > reach) continue;
        const ang = Math.atan2(dy, dx);
        // Sampling the noise on a circle keeps the wobble continuous all the
        // way round, with no seam where the angle wraps.
        const wobble = 1 + noise.fbm(
          Math.cos(ang) * 1.3 + c.x * 0.11,
          Math.sin(ang) * 1.3 + c.y * 0.11, 3,
        ) * 0.34;
        if (d <= base * wobble) g.open[at(g, x, y)] = 1;
      }
    }
  }

  // Link them: a spanning tree first so everything is reachable, then a few
  // extra passages so the map is not a tree a party can only backtrack through.
  const linked = new Set<number>([0]);
  const edges: [number, number][] = [];
  while (linked.size < centres.length) {
    let best: [number, number] | null = null, bestD = Infinity;
    for (const a of linked) {
      for (let b = 0; b < centres.length; b++) {
        if (linked.has(b)) continue;
        const d = dist(centres[a], centres[b]);
        if (d < bestD) { bestD = d; best = [a, b]; }
      }
    }
    if (!best) break;
    edges.push(best);
    linked.add(best[1]);
  }
  const extras = Math.max(2, Math.round(centres.length * (warren ? 0.5 : 0.38)));
  for (let i = 0; i < extras; i++) {
    const a = rng.int(0, centres.length - 1);
    const b = rng.int(0, centres.length - 1);
    if (a !== b) edges.push([a, b]);
  }
  for (const [a, b] of edges) {
    tunnel(g, centres[a], centres[b], rng, warren ? 0 : rng.bool(0.5) ? 1 : 0);
  }

  // Dead-end side passages: the thing that makes a cave feel explored rather
  // than laid out.
  const spurs = Math.max(3, Math.round(centres.length * 0.75));
  for (let i = 0; i < spurs; i++) {
    const from = centres[rng.int(0, centres.length - 1)];
    const len = rng.int(4, 10);
    const ang = rng.float(0, Math.PI * 2);
    const to = {
      x: Math.round(from.x + Math.cos(ang) * len),
      y: Math.round(from.y + Math.sin(ang) * len),
    };
    tunnel(g, from, to, rng, 0);
  }

  // Round the corners off without letting the automata eat the structure
  // underneath: a cell only flips when almost all of its neighbours disagree.
  polish(g, 2);
}

/**
 * Conservative smoothing for the chamber layouts.
 *
 * The usual majority rule (`> 4 neighbours solid`) is far too eager here: a
 * one-cell tunnel has six solid neighbours along its length and is filled in on
 * the first pass, and the thin rock between two nearby chambers is opened on
 * the second. Requiring near-unanimity only knocks the single-cell nubs and
 * notches off, which is all the chamber layouts need.
 */
function polish(g: CellGrid, steps: number): void {
  const { cols, rows } = g;
  for (let step = 0; step < steps; step++) {
    const next = new Uint8Array(g.open);
    for (let y = 2; y < rows - 2; y++) {
      for (let x = 2; x < cols - 2; x++) {
        let walls = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            if (!isOpen(g, x + dx, y + dy)) walls++;
          }
        }
        const i = at(g, x, y);
        if (walls >= 7) next[i] = 0;
        else if (walls <= 1) next[i] = 1;
      }
    }
    g.open.set(next);
  }
}

/** Cellular-automata smoothing, with the border kept solid. */
function smooth(g: CellGrid, steps: number): void {
  const { cols, rows } = g;
  for (let step = 0; step < steps; step++) {
    const next = new Uint8Array(g.open);
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < cols - 1; x++) {
        let walls = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            if (!isOpen(g, x + dx, y + dy)) walls++;
          }
        }
        const i = at(g, x, y);
        if (walls > 4) next[i] = 0;
        else if (walls < 4) next[i] = 1;
      }
    }
    g.open.set(next);
    for (let x = 0; x < cols; x++) { g.open[at(g, x, 0)] = 0; g.open[at(g, x, 1)] = 0; g.open[at(g, x, rows - 1)] = 0; g.open[at(g, x, rows - 2)] = 0; }
    for (let y = 0; y < rows; y++) { g.open[at(g, 0, y)] = 0; g.open[at(g, 1, y)] = 0; g.open[at(g, cols - 1, y)] = 0; g.open[at(g, cols - 2, y)] = 0; }
  }
}

function findPockets(g: CellGrid): Pocket[] {
  const seen = new Uint8Array(g.cols * g.rows);
  const out: Pocket[] = [];
  for (let y = 0; y < g.rows; y++) {
    for (let x = 0; x < g.cols; x++) {
      const i = at(g, x, y);
      if (seen[i] || !g.open[i]) continue;
      const cells: number[] = [];
      const stack = [i];
      seen[i] = 1;
      let sx = 0, sy = 0;
      while (stack.length) {
        const j = stack.pop()!;
        const jx = j % g.cols, jy = Math.floor(j / g.cols);
        cells.push(j);
        sx += jx; sy += jy;
        const neigh = [[jx - 1, jy], [jx + 1, jy], [jx, jy - 1], [jx, jy + 1]];
        for (const [nx, ny] of neigh) {
          if (nx < 0 || ny < 0 || nx >= g.cols || ny >= g.rows) continue;
          const k = at(g, nx, ny);
          if (seen[k] || !g.open[k]) continue;
          seen[k] = 1;
          stack.push(k);
        }
      }
      out.push({ cells, center: { x: Math.round(sx / cells.length), y: Math.round(sy / cells.length) } });
    }
  }
  return out;
}

function tunnel(g: CellGrid, a: Vec2, b: Vec2, rng: RNG, extraWidth = 1): void {
  let x = a.x, y = a.y;
  let guard = 0;
  const r = 0 + extraWidth;
  const carve = (cx: number, cy: number) => {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 2 || ny < 2 || nx >= g.cols - 2 || ny >= g.rows - 2) continue;
        g.open[at(g, nx, ny)] = 1;
        g.corridor[at(g, nx, ny)] = 1;
      }
    }
  };
  while ((x !== b.x || y !== b.y) && guard++ < 4000) {
    carve(x, y);
    const dx = Math.sign(b.x - x), dy = Math.sign(b.y - y);
    if (dx !== 0 && (dy === 0 || rng.bool())) x += dx;
    else if (dy !== 0) y += dy;
    if (rng.bool(0.15)) { x += rng.int(-1, 1); y += rng.int(-1, 1); }
    x = Math.max(2, Math.min(g.cols - 3, x));
    y = Math.max(2, Math.min(g.rows - 3, y));
  }
  carve(b.x, b.y);
}

function dressCave(doc: MapDocument, g: CellGrid, o: CaveGenOptions, rng: RNG): void {
  const features = objectLayerByRole(doc, 'features');
  const lights = doc.layers.find((l) => l.kind === 'light');
  if (!features) return;

  const openCells: number[] = [];
  for (let i = 0; i < g.open.length; i++) if (g.open[i]) openCells.push(i);
  rng.shuffle(openCells);

  const unitPx = o.cell / 5;
  const budget = Math.round(openCells.length * 0.24);
  let placed = 0;

  // Weighted table, built once from the options.
  const table: [string, number][] = [
    ['dgn/rubble', 5],
    ['btl/boulder', 4],
    ['dgn/stalagmites', 4],
    ['dgn/bones', 1.5],
  ];
  if (o.water) table.push(['dgn/water-pool', 4 * (0.4 + o.waterLevel * 3)]);
  if (o.mushrooms) table.push(['veg/mushroom-top', 3]);
  if (o.crystals) table.push(['dgn/crystals', 2.2]);

  const sizes: Record<string, [number, number]> = {
    'dgn/rubble': [0.9, 1.9],
    'btl/boulder': [0.7, 1.5],
    'dgn/stalagmites': [0.8, 1.7],
    'dgn/bones': [0.8, 1.3],
    'dgn/water-pool': [1.8, 3.8],
    'veg/mushroom-top': [0.9, 1.9],
    'dgn/crystals': [0.8, 1.6],
  };

  const taken: { x: number; y: number; r: number }[] = [];

  for (const i of openCells) {
    if (placed >= budget) break;
    const x = ((i % g.cols) + rng.float(0.15, 0.85)) * o.cell;
    const y = (Math.floor(i / g.cols) + rng.float(0.15, 0.85)) * o.cell;

    const asset = rng.pickWeighted(table);
    const [lo, hi] = sizes[asset] || [1, 1.6];
    const width = o.cell * rng.float(lo, hi);
    const radius = width * 0.42;
    if (taken.some((t) => dist(t, { x, y }) < (t.r + radius) * 0.75)) continue;
    taken.push({ x, y, r: radius });

    features.objects.push(makeStampAuto(asset, x, y, width, {
      seed: rng.int(1, 1e6),
      rotation: rng.float(0, 360),
      tint: asset === 'dgn/crystals' ? rng.pick(['#7ac8ff', '#b98aff', '#8affc8']) : null,
      shadow: asset === 'dgn/water-pool' ? null
        : { color: 'rgba(0,0,0,0.4)', blur: o.cell * 0.16, dx: o.cell * 0.04, dy: o.cell * 0.06 },
    }));
    placed++;

    if (o.lights && lights && lights.kind === 'light') {
      if (asset === 'dgn/crystals') {
        lights.lights.push(makeLight(x, y, o.cell, {
          bright: 8 * unitPx, dim: 20 * unitPx, color: '#7ac8ff',
          animation: 'pulse', intensity: 0.7, name: 'Crystal Glow',
        }));
      } else if (asset === 'veg/mushroom-top' && rng.bool(0.45)) {
        lights.lights.push(makeLight(x, y, o.cell, {
          bright: 5 * unitPx, dim: 12 * unitPx, color: '#6fe0c0',
          animation: 'pulse', intensity: 0.55, name: 'Bioluminescence',
        }));
      }
    }
  }

  features.objects.sort((a, b) => a.y - b.y);
}
