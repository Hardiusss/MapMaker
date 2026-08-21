/**
 * Political geography for region maps.
 *
 * Grows realms outward from their capitals with a cost-weighted flood fill —
 * mountains and water are expensive to cross, river valleys and plains are
 * cheap — so borders land where borders actually land: along ridgelines and
 * coasts rather than as straight lines on a Voronoi diagram.
 */
import type { Fields } from './heightmap';
import type { Vec2 } from '../../core/types';
import { RNG } from '../../core/rng';
import { clamp01 } from '../../core/noise';
import { BIOME_ORDER, type Biome } from './biomes';

export interface RealmSeed {
  /** Grid coordinates of the capital. */
  gx: number;
  gy: number;
  name: string;
  color: string;
}

export interface Realm {
  index: number;
  name: string;
  color: string;
  capital: Vec2;
  /** Grid cells belonging to this realm. */
  cells: number[];
  centroid: Vec2;
  area: number;
}

export interface RealmResult {
  /** Realm index per grid cell, -1 for unclaimed (sea, wilderness). */
  owner: Int16Array;
  realms: Realm[];
  /** Border polylines in grid coordinates. */
  borders: Vec2[][];
  /** Coastal edges of every realm, useful when tinting territory. */
}

export const REALM_COLORS = [
  '#a8452f', '#3f6b8c', '#6b8a3f', '#8a5a9c', '#b8863a',
  '#3f8a7a', '#9c4a6b', '#5a6b8a', '#8a6b3f', '#4a8a4a',
  '#8a3f5a', '#6b5a3f',
];

interface QueueItem { cell: number; cost: number; realm: number; }

/**
 * Assign every land cell to a realm.
 *
 * Uses a uniform-cost search (Dijkstra with a simple binary heap) from all
 * capitals at once, so each cell ends up with whichever realm can reach it most
 * cheaply. Terrain cost is what shapes the borders.
 */
export function growRealms(f: Fields, biomes: Uint8Array, seeds: RealmSeed[]): RealmResult {
  const { w, h, elevation, water, seaLevel } = f;
  const owner = new Int16Array(w * h).fill(-1);
  const best = new Float32Array(w * h).fill(Infinity);
  const span = Math.max(0.05, 1 - seaLevel);

  const bMountain = BIOME_ORDER.indexOf('mountain' as Biome);
  const bPeak = BIOME_ORDER.indexOf('peak' as Biome);
  const bHighland = BIOME_ORDER.indexOf('highland' as Biome);
  const bDesert = BIOME_ORDER.indexOf('desert' as Biome);
  const bSwamp = BIOME_ORDER.indexOf('swamp' as Biome);
  const bSnow = BIOME_ORDER.indexOf('snow' as Biome);

  const stepCost = (i: number): number => {
    if (water[i]) return 26;           // crossing water is possible but dear
    const b = biomes[i];
    const alt = clamp01((elevation[i] - seaLevel) / span);
    let c = 1 + alt * 3.2;
    if (b === bMountain || b === bPeak) c += 7;
    else if (b === bHighland) c += 2.4;
    else if (b === bDesert) c += 2.6;
    else if (b === bSwamp) c += 1.8;
    else if (b === bSnow) c += 3.2;
    return c;
  };

  // Binary heap keyed on cost.
  const heap: QueueItem[] = [];
  const push = (item: QueueItem) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].cost <= heap[i].cost) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = (): QueueItem | undefined => {
    if (!heap.length) return undefined;
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l].cost < heap[m].cost) m = l;
        if (r < heap.length && heap[r].cost < heap[m].cost) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };

  seeds.forEach((s, index) => {
    const i = s.gy * w + s.gx;
    best[i] = 0;
    owner[i] = index;
    push({ cell: i, cost: 0, realm: index });
  });

  // Realms stop growing once they are this expensive to reach — otherwise a
  // single realm swallows an entire archipelago across open ocean.
  const reach = 55;

  for (;;) {
    const cur = pop();
    if (!cur) break;
    if (cur.cost > best[cur.cell]) continue;
    const x = cur.cell % w, y = (cur.cell / w) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        const diag = dx && dy ? 1.414 : 1;
        const next = cur.cost + stepCost(j) * diag;
        if (next >= best[j] || next > reach) continue;
        best[j] = next;
        owner[j] = cur.realm;
        push({ cell: j, cost: next, realm: cur.realm });
      }
    }
  }

  // Water is never owned in the final result; it was only a travel cost.
  for (let i = 0; i < owner.length; i++) if (water[i]) owner[i] = -1;

  const realms: Realm[] = seeds.map((s, index) => ({
    index,
    name: s.name,
    color: s.color,
    capital: { x: s.gx, y: s.gy },
    cells: [],
    centroid: { x: s.gx, y: s.gy },
    area: 0,
  }));

  for (let i = 0; i < owner.length; i++) {
    const o = owner[i];
    if (o >= 0) realms[o].cells.push(i);
  }
  for (const r of realms) {
    if (!r.cells.length) continue;
    let sx = 0, sy = 0;
    for (const i of r.cells) { sx += i % w; sy += (i / w) | 0; }
    r.centroid = { x: sx / r.cells.length, y: sy / r.cells.length };
    r.area = r.cells.length;
  }

  return { owner, realms, borders: traceBorders(owner, w, h) };
}

/**
 * Chain the edges between differently-owned cells into polylines.
 *
 * Same idea as the dungeon wall tracer: collect unit edges, then walk them into
 * long runs so the border renders as a few smooth paths rather than thousands
 * of one-cell dashes.
 */
function traceBorders(owner: Int16Array, w: number, h: number): Vec2[][] {
  const edges: [Vec2, Vec2][] = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = owner[y * w + x];
      if (a < 0) continue;
      const right = x + 1 < w ? owner[y * w + x + 1] : -1;
      const down = y + 1 < h ? owner[(y + 1) * w + x] : -1;
      if (right !== a) edges.push([{ x: x + 1, y }, { x: x + 1, y: y + 1 }]);
      if (down !== a) edges.push([{ x, y: y + 1 }, { x: x + 1, y: y + 1 }]);
      if (x === 0) edges.push([{ x, y }, { x, y: y + 1 }]);
      if (y === 0) edges.push([{ x, y }, { x: x + 1, y }]);
    }
  }

  const key = (p: Vec2) => `${p.x},${p.y}`;
  const byPoint = new Map<string, number[]>();
  edges.forEach(([a, b], i) => {
    for (const p of [a, b]) {
      const k = key(p);
      const list = byPoint.get(k) || [];
      list.push(i);
      byPoint.set(k, list);
    }
  });

  const used = new Set<number>();
  const chains: Vec2[][] = [];

  for (let i = 0; i < edges.length; i++) {
    if (used.has(i)) continue;
    used.add(i);
    const chain: Vec2[] = [edges[i][0], edges[i][1]];

    for (const dir of [1, -1]) {
      for (;;) {
        const end = dir === 1 ? chain[chain.length - 1] : chain[0];
        const candidates = byPoint.get(key(end)) || [];
        let found = -1;
        for (const c of candidates) {
          if (used.has(c)) continue;
          found = c;
          break;
        }
        if (found < 0) break;
        used.add(found);
        const [ea, eb] = edges[found];
        const next = key(ea) === key(end) ? eb : ea;
        if (dir === 1) chain.push(next); else chain.unshift(next);
      }
    }
    if (chain.length >= 4) chains.push(chain);
  }

  return chains;
}

/** Pick capitals from the strongest settlement sites, spaced apart. */
export function pickRealmSeeds(
  candidates: { gx: number; gy: number }[],
  count: number,
  minSeparation: number,
  rng: RNG,
  nameFor: () => string,
): RealmSeed[] {
  const seeds: RealmSeed[] = [];
  for (const c of candidates) {
    if (seeds.length >= count) break;
    if (seeds.some((s) => Math.hypot(s.gx - c.gx, s.gy - c.gy) < minSeparation)) continue;
    seeds.push({
      gx: c.gx,
      gy: c.gy,
      name: nameFor(),
      color: REALM_COLORS[seeds.length % REALM_COLORS.length],
    });
  }
  return seeds;
}
