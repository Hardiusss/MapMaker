/**
 * Trade roads between settlements.
 *
 * Roads are routed with A* over a terrain cost field rather than drawn as
 * straight lines: they follow valleys, hug coasts, avoid mountains and swamps,
 * and merge onto each other where that is cheaper than cutting new ground —
 * which is what makes a road network look like it grew rather than being
 * ruled on afterwards.
 */
import type { Fields } from './heightmap';
import type { Vec2 } from '../../core/types';
import { clamp01 } from '../../core/noise';
import { BIOME_ORDER, type Biome } from './biomes';

export interface RoadNode { gx: number; gy: number; weight: number; }

export interface Road {
  /** Grid-space polyline. */
  path: Vec2[];
  /** 0 = minor track, 1 = main highway. */
  importance: number;
  /** Grid cells where the road crosses significant water. */
  crossings: Vec2[];
}

const IDX = (x: number, y: number, w: number) => y * w + x;

/** Build the per-cell cost of moving through the landscape. */
function buildCost(f: Fields, biomes: Uint8Array): Float32Array {
  const { w, h, elevation, water, seaLevel, flow } = f;
  const span = Math.max(0.05, 1 - seaLevel);
  const cost = new Float32Array(w * h);

  const bMountain = BIOME_ORDER.indexOf('mountain' as Biome);
  const bPeak = BIOME_ORDER.indexOf('peak' as Biome);
  const bHighland = BIOME_ORDER.indexOf('highland' as Biome);
  const bSwamp = BIOME_ORDER.indexOf('swamp' as Biome);
  const bDesert = BIOME_ORDER.indexOf('desert' as Biome);
  const bSnow = BIOME_ORDER.indexOf('snow' as Biome);
  const bJungle = BIOME_ORDER.indexOf('jungle' as Biome);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = IDX(x, y, w);
      if (water[i]) {
        // Fording a river is expensive but possible; open sea is not.
        cost[i] = flow[i] > 0 ? 40 : 400;
        continue;
      }
      const alt = clamp01((elevation[i] - seaLevel) / span);
      let c = 1 + alt * 2.5;

      // Slope matters more than height: roads climb gently or not at all.
      const l = elevation[IDX(Math.max(0, x - 1), y, w)];
      const r = elevation[IDX(Math.min(w - 1, x + 1), y, w)];
      const u = elevation[IDX(x, Math.max(0, y - 1), w)];
      const d = elevation[IDX(x, Math.min(h - 1, y + 1), w)];
      const slope = Math.hypot(r - l, d - u) / span;
      c += slope * 26;

      const b = biomes[i];
      if (b === bMountain || b === bPeak) c += 9;
      else if (b === bHighland) c += 2;
      else if (b === bSwamp) c += 6;
      else if (b === bJungle) c += 4;
      else if (b === bDesert) c += 2.5;
      else if (b === bSnow) c += 3;

      cost[i] = c;
    }
  }
  return cost;
}

/** A* over the cost field, 8-connected. */
function route(f: Fields, cost: Float32Array, start: number, goal: number, discount: Float32Array): Vec2[] | null {
  const { w, h } = f;
  const n = w * h;
  const g = new Float32Array(n).fill(Infinity);
  const cameFrom = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);

  const gx = goal % w, gy = (goal / w) | 0;
  const heuristic = (i: number) => {
    const x = i % w, y = (i / w) | 0;
    return Math.hypot(x - gx, y - gy);
  };

  // Binary heap of (f, cell).
  const heapF: number[] = [];
  const heapI: number[] = [];
  const push = (fScore: number, cell: number) => {
    heapF.push(fScore); heapI.push(cell);
    let i = heapF.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heapF[p] <= heapF[i]) break;
      [heapF[p], heapF[i]] = [heapF[i], heapF[p]];
      [heapI[p], heapI[i]] = [heapI[i], heapI[p]];
      i = p;
    }
  };
  const pop = (): number => {
    const top = heapI[0];
    const lastF = heapF.pop()!, lastI = heapI.pop()!;
    if (heapF.length) {
      heapF[0] = lastF; heapI[0] = lastI;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < heapF.length && heapF[l] < heapF[m]) m = l;
        if (r < heapF.length && heapF[r] < heapF[m]) m = r;
        if (m === i) break;
        [heapF[m], heapF[i]] = [heapF[i], heapF[m]];
        [heapI[m], heapI[i]] = [heapI[i], heapI[m]];
        i = m;
      }
    }
    return top;
  };

  g[start] = 0;
  push(heuristic(start), start);
  let guard = 0;
  const limit = n * 4;

  while (heapF.length && guard++ < limit) {
    const cur = pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const x = cur % w, y = (cur / w) | 0;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = IDX(nx, ny, w);
        if (closed[j]) continue;
        const diag = dx && dy ? 1.414 : 1;
        // Existing roads are cheap to join, which is what makes the network
        // branch instead of running a dozen parallel tracks.
        const step = cost[j] * diag * discount[j];
        const tentative = g[cur] + step;
        if (tentative >= g[j]) continue;
        g[j] = tentative;
        cameFrom[j] = cur;
        push(tentative + heuristic(j) * 1.05, j);
      }
    }
  }

  if (cameFrom[goal] < 0 && goal !== start) return null;
  const out: Vec2[] = [];
  let cur = goal;
  let steps = 0;
  while (cur >= 0 && steps++ < n) {
    out.push({ x: cur % w, y: (cur / w) | 0 });
    if (cur === start) break;
    cur = cameFrom[cur];
  }
  return out.reverse();
}

export interface RoadNetworkOptions {
  /** Extra connections beyond the spanning tree, as a fraction of node count. */
  redundancy: number;
  /** How strongly later roads prefer to reuse earlier ones. */
  reuse: number;
  /** Cap on total roads, to keep large maps sane. */
  maxRoads: number;
}

export const DEFAULT_ROAD_OPTIONS: RoadNetworkOptions = {
  redundancy: 0.35, reuse: 0.25, maxRoads: 40,
};

/**
 * Connect the settlements with a minimum spanning tree plus a few extra links,
 * routing each connection over the terrain.
 */
export function buildRoadNetwork(
  f: Fields,
  biomes: Uint8Array,
  nodes: RoadNode[],
  opts: Partial<RoadNetworkOptions> = {},
): Road[] {
  const o = { ...DEFAULT_ROAD_OPTIONS, ...opts };
  if (nodes.length < 2) return [];

  const cost = buildCost(f, biomes);
  const discount = new Float32Array(f.w * f.h).fill(1);
  const roads: Road[] = [];

  // --- Minimum spanning tree on straight-line distance ---------------------
  const connected = new Set<number>([0]);
  const edges: [number, number][] = [];
  while (connected.size < nodes.length) {
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (const a of connected) {
      for (let b = 0; b < nodes.length; b++) {
        if (connected.has(b)) continue;
        const d = Math.hypot(nodes[a].gx - nodes[b].gx, nodes[a].gy - nodes[b].gy);
        if (d < bestD) { bestD = d; best = [a, b]; }
      }
    }
    if (!best) break;
    edges.push(best);
    connected.add(best[1]);
  }

  // --- A few redundant links between nearby settlements --------------------
  const extras = Math.round(nodes.length * o.redundancy);
  const pairs: { a: number; b: number; d: number }[] = [];
  for (let a = 0; a < nodes.length; a++) {
    for (let b = a + 1; b < nodes.length; b++) {
      if (edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) continue;
      pairs.push({ a, b, d: Math.hypot(nodes[a].gx - nodes[b].gx, nodes[a].gy - nodes[b].gy) });
    }
  }
  pairs.sort((p, q) => p.d - q.d);
  for (const p of pairs.slice(0, extras)) edges.push([p.a, p.b]);

  // Route the busiest links first so the minor ones can merge onto them.
  edges.sort((e1, e2) => (nodes[e2[0]].weight + nodes[e2[1]].weight) - (nodes[e1[0]].weight + nodes[e1[1]].weight));

  for (const [a, b] of edges.slice(0, o.maxRoads)) {
    const start = IDX(Math.round(nodes[a].gx), Math.round(nodes[a].gy), f.w);
    const goal = IDX(Math.round(nodes[b].gx), Math.round(nodes[b].gy), f.w);
    const path = route(f, cost, start, goal, discount);
    if (!path || path.length < 3) continue;

    const crossings: Vec2[] = [];
    for (const p of path) {
      const i = IDX(p.x, p.y, f.w);
      // Reusing this cell later is cheaper — roads converge into highways.
      discount[i] = Math.min(discount[i], o.reuse);
      if (f.water[i]) crossings.push(p);
    }

    roads.push({
      path,
      importance: clamp01((nodes[a].weight + nodes[b].weight) / 2),
      crossings: mergeRuns(crossings),
    });
  }

  return roads;
}

/** Collapse a run of adjacent water cells into a single crossing point. */
function mergeRuns(cells: Vec2[]): Vec2[] {
  if (cells.length < 2) return cells;
  const out: Vec2[] = [];
  let runStart = 0;
  for (let i = 1; i <= cells.length; i++) {
    const broken = i === cells.length
      || Math.abs(cells[i].x - cells[i - 1].x) > 1
      || Math.abs(cells[i].y - cells[i - 1].y) > 1;
    if (!broken) continue;
    const mid = cells[Math.floor((runStart + i - 1) / 2)];
    out.push(mid);
    runStart = i;
  }
  return out;
}
