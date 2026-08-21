/**
 * Cave generator: cellular automata carve the caverns, a flood fill keeps only
 * connected space, and tunnels stitch surviving pockets back together.
 */
import type { MapDocument, Wall } from '../../core/types';
import { createDocument, objectLayerByRole } from '../../core/doc';
import { RNG } from '../../core/rng';
import { createNamer } from '../names';
import { makeGrid, at, isOpen, traceWalls, paintDungeon, type CellGrid } from './grid';
import { makeStamp, makeStampAuto, makeLight, makeText } from '../../core/factories';
import { paletteById, mix } from '../../core/color';
import type { Vec2 } from '../../core/types';
import { dist } from '../../core/geometry';

export interface CaveGenOptions {
  width: number;
  height: number;
  cell: number;
  seed: number;
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

  // Seed
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const border = x < 2 || y < 2 || x >= cols - 2 || y >= rows - 2;
      g.open[at(g, x, y)] = border ? 0 : (rng.next() > o.density ? 1 : 0);
    }
  }

  // Automata
  for (let step = 0; step < o.smoothing; step++) {
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
    // Re-assert the border.
    for (let x = 0; x < cols; x++) { g.open[at(g, x, 0)] = 0; g.open[at(g, x, 1)] = 0; g.open[at(g, x, rows - 1)] = 0; g.open[at(g, x, rows - 2)] = 0; }
    for (let y = 0; y < rows; y++) { g.open[at(g, 0, y)] = 0; g.open[at(g, 1, y)] = 0; g.open[at(g, cols - 1, y)] = 0; g.open[at(g, cols - 2, y)] = 0; }
  }

  // Pockets
  const pockets = findPockets(g);
  pockets.sort((a, b) => b.cells.length - a.cells.length);
  const kept = pockets.filter((p) => p.cells.length >= o.minPocket);
  for (const p of pockets) {
    if (kept.includes(p)) continue;
    for (const i of p.cells) g.open[i] = 0;
  }
  // Tunnel the surviving pockets together.
  for (let i = 1; i < kept.length; i++) {
    tunnel(g, kept[i - 1].center, kept[i].center, rng);
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

function tunnel(g: CellGrid, a: Vec2, b: Vec2, rng: RNG): void {
  let x = a.x, y = a.y;
  let guard = 0;
  const carve = (cx: number, cy: number) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
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
  const budget = Math.round(openCells.length * 0.18);
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
