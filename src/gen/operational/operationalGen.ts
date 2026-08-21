/**
 * Operational maps: the scale between a battle map and a world map.
 *
 * A tactical map answers "where do I stand"; a world map answers "where is the
 * kingdom". Neither answers the question a GM actually has when a campaign
 * reaches a siege, a border war or a running fight through a valley: *where
 * does this week's fighting happen, and what does the ground do to it*.
 *
 * So this generator produces a theatre a few kilometres across on a grid whose
 * cell is roughly one tactical engagement, classifies every cell by movement
 * cost, cover and line of sight, and then marks the things a plan is made of —
 * the crossings, the high ground, the ways through, the objectives worth
 * taking. A sector of it can be handed straight to the battle generator, which
 * is what turns one map into a series of linked engagements.
 */
import type { MapDocument, Vec2 } from '../../core/types';
import { createDocument, rasterByRole } from '../../core/doc';
import { RNG } from '../../core/rng';
import { createNamer } from '../names';
import { makeStamp, makeText, makePath, makeShape, makeNote } from '../../core/factories';
import { paletteById, mix, rgba, parseColor } from '../../core/color';
import { getTexture } from '../../render/textures';
import { createSurface, ctxOf } from '../../util/canvas';
import { clamp01, smoothstep, SimplexNoise } from '../../core/noise';
import { chaikin, dist } from '../../core/geometry';
import { layoutLabels } from '../labelLayout';
import {
  OP_TERRAIN, OP_TERRAIN_ORDER, OP_INDEX, OP_TO_BATTLE_BIOME, moveCost, passable,
  type OpTerrain,
} from './terrain';
import {
  generateOpFields, classifyOp, classifyOpValues, sampleOp, arableField,
  opIndex as IDX, type OpFields,
} from './fields';
import { generateBattleMap, type BattleGenOptions } from '../battle/battleGen';

export type OpPosture = 'meeting' | 'attack-defend' | 'crossing' | 'siege';

export interface OperationalGenOptions {
  width: number;
  height: number;
  /** Pixels per operational cell. */
  cell: number;
  seed: number;
  /** How many map units one cell represents, and their name. */
  unitsPerCell: number;
  unitLabel: string;
  /** Cells per side of a lettered sector. */
  sectorSize: number;
  relief: number;
  woodland: number;
  wetness: number;
  settlement: number;
  posture: OpPosture;
  /** Draw the staff overlay: sectors, objectives, deployment, legend. */
  overlay: boolean;
  contours: boolean;
  objectives: number;
  paletteId: string;
  title?: string;
}

export const DEFAULT_OPERATIONAL_OPTIONS: OperationalGenOptions = {
  width: 2688, height: 1920, cell: 96, seed: 1,
  unitsPerCell: 100, unitLabel: 'yd', sectorSize: 4,
  relief: 0.55, woodland: 0.5, wetness: 0.5, settlement: 0.5,
  posture: 'meeting', overlay: true, contours: true, objectives: 5,
  paletteId: 'atlas',
};

export interface OpSector {
  /** e.g. "C3" */
  id: string;
  col: number;
  row: number;
  /** Cell bounds, inclusive of x0/y0 and exclusive of x1/y1. */
  x0: number; y0: number; x1: number; y1: number;
  /** Terrain class occupying the most cells in this sector. */
  dominant: OpTerrain;
  /** Share of the sector each terrain class occupies, largest first. */
  mix: { terrain: OpTerrain; share: number }[];
  /** Mean movement cost of the passable cells. */
  going: number;
  /** Fraction of cells that are impassable. */
  blocked: number;
  name: string;
}

export interface OpObjective {
  /** Cell coordinates. */
  x: number; y: number;
  kind: 'crossing' | 'height' | 'settlement' | 'crossroads' | 'ruin';
  name: string;
  /** Why it is worth taking, in a sentence a GM can read aloud. */
  why: string;
  sector: string;
}

export interface OperationalResult {
  doc: MapDocument;
  fields: OpFields;
  /** Terrain class index per cell. */
  terrain: Uint8Array;
  sectors: OpSector[];
  objectives: OpObjective[];
  /** Cells that are the only way through a line of impassable ground. */
  chokepoints: Vec2[];
  options: OperationalGenOptions;
}

// ---------------------------------------------------------------------------

export function generateOperational(opts: Partial<OperationalGenOptions> = {}): OperationalResult {
  const o: OperationalGenOptions = { ...DEFAULT_OPERATIONAL_OPTIONS, ...opts };
  const rng = new RNG(o.seed);
  const namer = createNamer(o.seed, 'common');

  const cols = Math.max(10, Math.floor(o.width / o.cell));
  const rows = Math.max(8, Math.floor(o.height / o.cell));

  const fieldOpts = {
    cols, rows, seed: o.seed,
    relief: o.relief, woodland: o.woodland, wetness: o.wetness, settlement: o.settlement,
  };
  const f = generateOpFields(fieldOpts);
  const terrain = classifyOp(f, fieldOpts);

  const doc = createDocument({
    kind: 'operational',
    width: cols * o.cell,
    height: rows * o.cell,
    title: o.title || `${namer.region()} — Theatre of Operations`,
    paletteId: o.paletteId,
    gridOverride: {
      size: o.cell, type: 'square', visible: true, snap: true,
      unitsPerCell: o.unitsPerCell, unitLabel: o.unitLabel, majorEvery: o.sectorSize,
    },
  });
  doc.meta.seed = o.seed;

  // --- Crossings -----------------------------------------------------------
  const crossings = placeCrossings(f, terrain, rng);

  // --- Settlements and roads ----------------------------------------------
  const places = placeSettlements(f, terrain, o, rng, namer);
  const roads = buildRoads(f, terrain, places, crossings, o);

  // --- Painting ------------------------------------------------------------
  const arable = arableField(f, fieldOpts);
  paintTerrain(doc, f, arable, o);
  if (o.contours) paintContours(doc, f, o);
  paintWater(doc, f, terrain, o, crossings);

  drawRoads(doc, roads, o, namer, rng);
  drawPlaces(doc, places, o);

  // --- Analysis ------------------------------------------------------------
  const sectors = buildSectors(terrain, cols, rows, o, namer);
  const chokepoints = findChokepoints(terrain, cols, rows, Math.max(2, Math.round(o.objectives * 0.8)));
  const objectives = pickObjectives(f, terrain, places, crossings, chokepoints, sectors, o, rng, namer);

  if (o.overlay) {
    drawSectorGrid(doc, sectors, o);
    drawDeployment(doc, terrain, cols, rows, o);
    drawChokepoints(doc, chokepoints, o);
    drawObjectives(doc, objectives, o);
    drawLegend(doc, terrain, o);
  }
  noteObjectives(doc, objectives, o);
  layoutLabels(doc, { padding: o.cell * 0.1, minorSizeBelow: o.cell * 0.22 });

  doc.meta.description = [
    `${cols}×${rows} cells at ${o.unitsPerCell} ${o.unitLabel} — `,
    `${(cols * o.unitsPerCell).toLocaleString()}×${(rows * o.unitsPerCell).toLocaleString()} ${o.unitLabel}. `,
    `${sectors.length} sectors, ${objectives.length} objectives, ${chokepoints.length} chokepoints. `,
    `Seed ${o.seed}.`,
  ].join('');

  return { doc, fields: f, terrain, sectors, objectives, chokepoints, options: o };
}

// ---------------------------------------------------------------------------
// Crossings
// ---------------------------------------------------------------------------

/**
 * Fords and bridges along the watercourse.
 *
 * A river with no crossings is a wall and a river with crossings everywhere is
 * a stripe of blue paint. Two or three places to get over it is what makes the
 * water a feature of the plan: every road, every advance and most of the
 * fighting will end up funnelled through them.
 */
function placeCrossings(f: OpFields, terrain: Uint8Array, rng: RNG): { x: number; y: number; bridge: boolean }[] {
  const out: { x: number; y: number; bridge: boolean }[] = [];
  const course = f.course;
  if (course.length < 6) return out;

  const wanted = Math.max(2, Math.round(course.length / 14));
  const spacing = Math.max(3, Math.floor(course.length / (wanted + 1)));
  for (let k = 1; k <= wanted; k++) {
    const at = Math.min(course.length - 2, k * spacing + rng.int(-1, 1));
    const p = course[at];
    if (!p) continue;
    const cx = Math.round(p.x), cy = Math.round(p.y);
    if (out.some((c) => Math.abs(c.x - cx) + Math.abs(c.y - cy) < 4)) continue;
    const bridge = rng.bool(0.45);
    out.push({ x: cx, y: cy, bridge });
    // A ford is shallow water; a bridge leaves the water alone and spans it.
    if (!bridge) terrain[IDX(cx, cy, f.cols)] = OP_INDEX.ford;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Settlements
// ---------------------------------------------------------------------------

interface OpPlace { x: number; y: number; kind: 'village' | 'town' | 'farm' | 'tower'; name: string; }

function placeSettlements(
  f: OpFields, terrain: Uint8Array, o: OperationalGenOptions, rng: RNG,
  namer: ReturnType<typeof createNamer>,
): OpPlace[] {
  const { cols, rows } = f;
  const out: OpPlace[] = [];

  // Score every cell: people build on good going, near water, off the crags.
  const scored: { i: number; s: number }[] = [];
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      const i = IDX(x, y, cols);
      if (!passable(terrain[i])) continue;
      if (terrain[i] === OP_INDEX.water || terrain[i] === OP_INDEX.marsh) continue;
      const nearWater = neighbourHas(terrain, cols, rows, x, y, 2, OP_INDEX.water) ? 1 : 0;
      const flat = 1 - f.slope[i];
      const farmed = terrain[i] === OP_INDEX.field ? 1 : 0;
      scored.push({ i, s: flat * 0.5 + nearWater * 0.3 + farmed * 0.4 + rng.float(0, 0.25) });
    }
  }
  scored.sort((a, b) => b.s - a.s);

  const want = Math.max(2, Math.round(cols * rows * 0.008 * (0.5 + o.settlement)));
  const minGap = Math.max(4, Math.round(Math.min(cols, rows) / 5));
  for (const c of scored) {
    if (out.length >= want) break;
    const x = c.i % cols, y = Math.floor(c.i / cols);
    if (out.some((p) => dist(p, { x, y }) < minGap)) continue;
    const kind: OpPlace['kind'] = out.length === 0 ? 'town' : rng.bool(0.55) ? 'village' : rng.bool(0.5) ? 'farm' : 'tower';
    out.push({ x, y, kind, name: namer.settlement(kind === 'town' ? 'town' : 'village') });
    // A settlement is built-up ground: a strongpoint on the terrain map.
    if (kind === 'town' || kind === 'village') terrain[IDX(x, y, cols)] = OP_INDEX.built;
  }
  return out;
}

function neighbourHas(
  terrain: Uint8Array, cols: number, rows: number, x: number, y: number, r: number, want: number,
): boolean {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      if (terrain[IDX(nx, ny, cols)] === want) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Roads
// ---------------------------------------------------------------------------

/**
 * Roads between the settlements, routed over the going and forced through the
 * crossings. A road that ignores the river is the fastest way to make a map
 * look like it was drawn by someone who has never had to move anything.
 */
function buildRoads(
  f: OpFields, terrain: Uint8Array, places: OpPlace[],
  crossings: { x: number; y: number; bridge: boolean }[],
  o: OperationalGenOptions,
): Vec2[][] {
  const { cols, rows } = f;
  const cost = new Float32Array(cols * rows);
  for (let i = 0; i < cost.length; i++) {
    const m = moveCost(terrain[i]);
    cost[i] = Number.isFinite(m) ? m : 1e5;
  }
  // Crossings are cheap: that is the whole point of them.
  for (const c of crossings) cost[IDX(c.x, c.y, cols)] = 0.6;

  const nodes: Vec2[] = places.map((p) => ({ x: p.x, y: p.y }));
  // Roads also want to leave the map, so the theatre connects to the world.
  const edges: Vec2[] = [
    { x: 0, y: Math.floor(rows / 2) },
    { x: cols - 1, y: Math.floor(rows / 2) },
  ];
  const all = [...nodes, ...edges];

  const routes: Vec2[][] = [];
  const linked = new Set<number>([0]);
  const discount = new Float32Array(cols * rows).fill(1);

  while (linked.size < all.length) {
    let best: [number, number] | null = null, bestD = Infinity;
    for (const a of linked) {
      for (let b = 0; b < all.length; b++) {
        if (linked.has(b)) continue;
        const d = dist(all[a], all[b]);
        if (d < bestD) { bestD = d; best = [a, b]; }
      }
    }
    if (!best) break;
    linked.add(best[1]);
    const path = route(cost, discount, cols, rows, all[best[0]], all[best[1]]);
    if (!path) continue;
    for (const p of path) {
      const i = IDX(p.x, p.y, cols);
      discount[i] = 0.35;
      // The road itself becomes terrain — it is the fastest ground on the map.
      if (terrain[i] !== OP_INDEX.water && terrain[i] !== OP_INDEX.ford) terrain[i] = OP_INDEX.road;
    }
    routes.push(path);
  }
  return routes;
}

/** A* over the movement cost field, 8-connected. */
function route(
  cost: Float32Array, discount: Float32Array, cols: number, rows: number, from: Vec2, to: Vec2,
): Vec2[] | null {
  const n = cols * rows;
  const g = new Float32Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const start = IDX(from.x, from.y, cols), goal = IDX(to.x, to.y, cols);

  const heapF: number[] = [], heapI: number[] = [];
  const push = (fv: number, cell: number) => {
    heapF.push(fv); heapI.push(cell);
    let i = heapF.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heapF[p] <= heapF[i]) break;
      [heapF[p], heapF[i]] = [heapF[i], heapF[p]];
      [heapI[p], heapI[i]] = [heapI[i], heapI[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heapI[0];
    const lf = heapF.pop()!, li = heapI.pop()!;
    if (heapF.length) {
      heapF[0] = lf; heapI[0] = li;
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
  push(0, start);
  let guard = 0;
  while (heapF.length && guard++ < n * 6) {
    const cur = pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const x = cur % cols, y = (cur / cols) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const j = IDX(nx, ny, cols);
        if (closed[j]) continue;
        const diag = dx && dy ? 1.414 : 1;
        const t = g[cur] + cost[j] * diag * discount[j];
        if (t >= g[j]) continue;
        g[j] = t;
        came[j] = cur;
        push(t + Math.hypot(nx - to.x, ny - to.y) * 1.02, j);
      }
    }
  }

  if (came[goal] < 0 && goal !== start) return null;
  const out: Vec2[] = [];
  let cur = goal, steps = 0;
  while (cur >= 0 && steps++ < n) {
    out.push({ x: cur % cols, y: (cur / cols) | 0 });
    if (cur === start) break;
    cur = came[cur];
  }
  return out.reverse();
}

// ---------------------------------------------------------------------------
// Painting
// ---------------------------------------------------------------------------

/**
 * Flat terrain fills with a little texture through them.
 *
 * Deliberately not painterly. A world map is a picture of a place; an
 * operational map is an instrument, and the reader has to be able to tell open
 * ground from scrub at a glance and from across a table. So each class gets its
 * own flat colour, the texture is dropped in at low opacity for tooth, and the
 * boundaries are dithered rather than blended — a soft gradient between two
 * movement costs would be a lie about where the cost changes.
 */
function paintTerrain(
  doc: MapDocument, f: OpFields, arable: Float32Array, o: OperationalGenOptions,
): void {
  const layer = rasterByRole(doc, 'background');
  if (!layer) return;
  const ctx = ctxOf(layer.surface);
  const W = doc.width, H = doc.height;
  const palette = paletteById(o.paletteId);

  const TILE = 256;
  const tiles = OP_TERRAIN_ORDER.map((t) => {
    const surf = getTexture(OP_TERRAIN[t].texture, { paletteId: o.paletteId, size: TILE });
    return surf.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, TILE, TILE).data;
  });
  const fills = OP_TERRAIN_ORDER.map((t) => {
    // Nudge each class towards the palette so a map in Frostmark or Dungeon
    // Slate still reads as one document rather than a pasted-in chart.
    const c = parseColor(mix(OP_TERRAIN[t].color, palette.parchment, 0.18));
    return [c.r, c.g, c.b] as [number, number, number];
  });

  // A warp field so class boundaries wander instead of following the sample
  // lattice. Computed coarse; the classification behind it is smooth anyway.
  const warpN = new SimplexNoise(o.seed + 313);
  const ww = Math.max(16, Math.round(W / 8)), wh = Math.max(16, Math.round(H / 8));
  const warpX = new Float32Array(ww * wh), warpY = new Float32Array(ww * wh);
  for (let y = 0; y < wh; y++) {
    for (let x = 0; x < ww; x++) {
      const u = x / ww, v = y / wh;
      const i = y * ww + x;
      warpX[i] = warpN.fbm(u * 6, v * 6, 3) * 0.55 + warpN.fbm(u * 19 + 3, v * 19, 2) * 0.22;
      warpY[i] = warpN.fbm(u * 6 + 8.1, v * 6 + 2.7, 3) * 0.55 + warpN.fbm(u * 19, v * 19 + 5.5, 2) * 0.22;
    }
  }

  const img = ctx.createImageData(W, H);
  const d = img.data;
  const cell = o.cell;
  const { cols, rows } = f;

  for (let y = 0; y < H; y++) {
    const rowT = (y & (TILE - 1)) * TILE;
    const wy = ((y * wh / H) | 0) * ww;
    for (let x = 0; x < W; x++) {
      const wi = wy + ((x * ww / W) | 0);
      // Sample the fields, not the cell array. Painting from the cell array
      // fills each square with one flat colour, and a map whose every class
      // boundary is a cell edge reads as a chequerboard rather than as ground.
      const gx = x / cell + warpX[wi];
      const gy = y / cell + warpY[wi];

      const t = classifyOpValues(
        sampleOp(f.elevation, cols, rows, gx, gy),
        sampleOp(f.slope, cols, rows, gx, gy),
        sampleOp(f.wet, cols, rows, gx, gy),
        sampleOp(f.trees, cols, rows, gx, gy),
        sampleOp(arable, cols, rows, gx, gy),
      );
      const ti2 = OP_INDEX[t];

      const fill = fills[ti2];
      const tex = tiles[ti2];
      const ti = (rowT + (x & (TILE - 1))) * 4;
      // Texture as luminance modulation only, so the class colour survives.
      const lum = (tex[ti] * 0.299 + tex[ti + 1] * 0.587 + tex[ti + 2] * 0.114) / 255;
      const k = 0.84 + lum * 0.32;

      const di = (y * W + x) * 4;
      d[di] = fill[0] * k;
      d[di + 1] = fill[1] * k;
      d[di + 2] = fill[2] * k;
      d[di + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Contour lines and hillshade.
 *
 * At this scale the height of the ground is a tactical fact — who is shooting
 * downhill, which slope costs a charge its momentum, where a reverse slope
 * hides a reserve — so it gets drawn explicitly rather than being implied by
 * shading alone.
 */
function paintContours(doc: MapDocument, f: OpFields, o: OperationalGenOptions): void {
  const layer = rasterByRole(doc, 'relief');
  if (!layer) return;
  const ctx = ctxOf(layer.surface);
  const W = doc.width, H = doc.height;
  const palette = paletteById(o.paletteId);

  // Hillshade first, computed at cell resolution and blurred at that size
  // before it is enlarged — blurring afterwards leaves the bilinear facets.
  const small = createSurface(f.cols, f.rows);
  const sctx = ctxOf(small);
  const img = sctx.createImageData(f.cols, f.rows);
  for (let y = 0; y < f.rows; y++) {
    for (let x = 0; x < f.cols; x++) {
      const l = f.elevation[IDX(Math.max(0, x - 1), y, f.cols)];
      const r = f.elevation[IDX(Math.min(f.cols - 1, x + 1), y, f.cols)];
      const u = f.elevation[IDX(x, Math.max(0, y - 1), f.cols)];
      const dn = f.elevation[IDX(x, Math.min(f.rows - 1, y + 1), f.cols)];
      // Light from the north-west, the cartographic convention.
      const shade = clamp01(0.5 + ((l - r) + (u - dn)) * 4.5);
      const k = (y * f.cols + x) * 4;
      if (shade > 0.5) {
        img.data[k] = 255; img.data[k + 1] = 250; img.data[k + 2] = 235;
        img.data[k + 3] = (shade - 0.5) * 2 * 62;
      } else {
        img.data[k] = 26; img.data[k + 1] = 21; img.data[k + 2] = 15;
        img.data[k + 3] = (0.5 - shade) * 2 * 78;
      }
    }
  }
  sctx.putImageData(img, 0, 0);
  const soft = createSurface(f.cols, f.rows);
  const soCtx = ctxOf(soft);
  soCtx.filter = 'blur(0.6px)';
  soCtx.drawImage(small, 0, 0);
  soCtx.filter = 'none';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(soft, 0, 0, W, H);

  // --- Contour lines -------------------------------------------------------
  // Marching squares over the elevation field. Every fifth line is drawn heavy,
  // which is the convention that lets a reader count height at a glance instead
  // of tracing each line individually.
  const sample = (gx: number, gy: number) => sampleOp(f.elevation, f.cols, f.rows, gx, gy);
  const step = Math.max(4, Math.round(o.cell / 6));      // in pixels
  const gstep = step / o.cell;                            // in cells
  const levels = 12;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let li = 1; li < levels; li++) {
    const level = li / levels;
    const major = li % 3 === 0;
    ctx.strokeStyle = rgba(palette.ink, major ? 0.4 : 0.22);
    ctx.lineWidth = major ? Math.max(1.6, o.cell * 0.02) : Math.max(1, o.cell * 0.011);
    ctx.beginPath();

    for (let py = 0; py + step <= H; py += step) {
      const gy = py / o.cell;
      for (let px = 0; px + step <= W; px += step) {
        const gx = px / o.cell;
        const v00 = sample(gx, gy);
        const v10 = sample(gx + gstep, gy);
        const v11 = sample(gx + gstep, gy + gstep);
        const v01 = sample(gx, gy + gstep);

        // Crossing points on each edge of the little square, if any.
        const pts: Vec2[] = [];
        const edge = (a: number, b: number, ax: number, ay: number, bx: number, by: number) => {
          if ((a < level) === (b < level)) return;
          const t = (level - a) / ((b - a) || 1e-9);
          pts.push({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t });
        };
        edge(v00, v10, px, py, px + step, py);
        edge(v10, v11, px + step, py, px + step, py + step);
        edge(v11, v01, px + step, py + step, px, py + step);
        edge(v01, v00, px, py + step, px, py);

        // Two crossings is the ordinary case; four is a saddle, which we draw
        // as two separate segments rather than guessing at the connectivity.
        if (pts.length >= 2) {
          ctx.moveTo(pts[0].x, pts[0].y);
          ctx.lineTo(pts[1].x, pts[1].y);
        }
        if (pts.length === 4) {
          ctx.moveTo(pts[2].x, pts[2].y);
          ctx.lineTo(pts[3].x, pts[3].y);
        }
      }
    }
    ctx.stroke();
  }
  ctx.restore();
  layer.opacity = 0.9;
}

function paintWater(
  doc: MapDocument, f: OpFields, terrain: Uint8Array, o: OperationalGenOptions,
  crossings: { x: number; y: number; bridge: boolean }[],
): void {
  const layer = doc.layers.find((l) => l.kind === 'object' && l.name === 'Watercourse');
  if (!layer || layer.kind !== 'object') return;
  if (f.course.length < 3) return;
  const palette = paletteById(o.paletteId);

  const pts = chaikin(f.course.map((p) => ({ x: (p.x + 0.5) * o.cell, y: (p.y + 0.5) * o.cell })), 2);
  layer.objects.push(makePath('river', pts, o.paletteId, {
    name: 'Watercourse',
    width: o.cell * 0.3,
    taper: 0.85,
    smoothing: 1,
    outlineWidth: Math.max(2, o.cell * 0.05),
    color: palette.water,
    color2: palette.deepWater,
    outlineColor: mix(palette.deepWater, palette.ink, 0.4),
  }));

  for (const c of crossings) {
    const x = (c.x + 0.5) * o.cell, y = (c.y + 0.5) * o.cell;
    layer.objects.push(makeStamp(c.bridge ? 'town/bridge' : 'sym/scale-bar', x, y, o.cell * 1.1, o.cell * 0.55, {
      seed: c.x * 31 + c.y,
      opacity: c.bridge ? 1 : 0,
      name: c.bridge ? 'Bridge' : 'Ford',
    }));
    // Both kinds get a label, because which one it is changes the plan: a
    // bridge can be held or burned, a ford can only be watched.
    layer.objects.push(makeText(c.bridge ? 'BRIDGE' : 'FORD', x, y - o.cell * 0.5, o.paletteId, {
      size: o.cell * 0.2,
      bold: true,
      letterSpacing: 1.5,
      color: mix(palette.deepWater, palette.ink, 0.5),
      strokeColor: rgba(palette.parchment, 0.85),
      strokeWidth: Math.max(2, o.cell * 0.04),
    }));
  }
}

function drawRoads(
  doc: MapDocument, roads: Vec2[][], o: OperationalGenOptions,
  namer: ReturnType<typeof createNamer>, rng: RNG,
): void {
  const layer = doc.layers.find((l) => l.kind === 'object' && l.name === 'Roads & Crossings');
  if (!layer || layer.kind !== 'object') return;
  const palette = paletteById(o.paletteId);
  for (const r of roads) {
    if (r.length < 3) continue;
    const pts = chaikin(r.map((p) => ({ x: (p.x + 0.5) * o.cell, y: (p.y + 0.5) * o.cell })), 2);
    layer.objects.push(makePath('road', pts, o.paletteId, {
      name: 'Road',
      width: Math.max(4, o.cell * 0.11),
      outlineWidth: Math.max(1.5, o.cell * 0.03),
      color: mix(palette.parchmentDark, '#b09a72', 0.55),
      outlineColor: rgba(palette.ink, 0.55),
      jitter: 0.3,
      smoothing: 0.7,
    }));
  }
}

function drawPlaces(doc: MapDocument, places: OpPlace[], o: OperationalGenOptions): void {
  const layer = doc.layers.find((l) => l.kind === 'object' && l.name === 'Places');
  const labels = doc.layers.find((l) => l.kind === 'object' && l.role === 'labels' && l.name === 'Labels');
  if (!layer || layer.kind !== 'object') return;
  const palette = paletteById(o.paletteId);

  for (const p of places) {
    const x = (p.x + 0.5) * o.cell, y = (p.y + 0.5) * o.cell;
    const asset = p.kind === 'town' ? 'town/town' : p.kind === 'village' ? 'town/village'
      : p.kind === 'tower' ? 'town/tower' : 'town/village';
    const w = (p.kind === 'town' ? 1.5 : 1.1) * o.cell;
    layer.objects.push(makeStamp(asset, x, y, w, w / 1.4, { seed: p.x * 71 + p.y, name: p.name }));
    if (labels && labels.kind === 'object') {
      labels.objects.push(makeText(p.name, x, y + o.cell * 0.55, o.paletteId, {
        size: o.cell * (p.kind === 'town' ? 0.26 : 0.2),
        bold: p.kind === 'town',
        color: palette.ink,
        strokeColor: rgba(palette.parchment, 0.9),
        strokeWidth: Math.max(2, o.cell * 0.045),
      }));
    }
  }
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

const SECTOR_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // I and O omitted: they read as 1 and 0

/**
 * Divide the theatre into lettered sectors and describe what is in each.
 *
 * This is the part that makes the map usable as a campaign rather than a
 * picture. A GM can say "they fall back through C3 towards the ford", and C3
 * has a name, a terrain mix and a movement cost — and can be handed to the
 * battle generator to become the actual table the fight is played on.
 */
function buildSectors(
  terrain: Uint8Array, cols: number, rows: number,
  o: OperationalGenOptions, namer: ReturnType<typeof createNamer>,
): OpSector[] {
  const size = Math.max(2, o.sectorSize);
  const sc = Math.ceil(cols / size), sr = Math.ceil(rows / size);
  const out: OpSector[] = [];

  for (let row = 0; row < sr; row++) {
    for (let col = 0; col < sc; col++) {
      const x0 = col * size, y0 = row * size;
      const x1 = Math.min(cols, x0 + size), y1 = Math.min(rows, y0 + size);
      const tally = new Float64Array(OP_TERRAIN_ORDER.length);
      let total = 0, going = 0, goingCells = 0, blocked = 0;

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const t = terrain[IDX(x, y, cols)];
          tally[t]++;
          total++;
          const m = moveCost(t);
          if (Number.isFinite(m)) { going += m; goingCells++; } else blocked++;
        }
      }
      if (!total) continue;

      const mix = OP_TERRAIN_ORDER
        .map((t, i) => ({ terrain: t, share: tally[i] / total }))
        .filter((m) => m.share > 0)
        .sort((a, b) => b.share - a.share);

      out.push({
        id: `${SECTOR_LETTERS[col % SECTOR_LETTERS.length]}${row + 1}`,
        col, row, x0, y0, x1, y1,
        dominant: mix[0].terrain,
        mix,
        going: goingCells ? going / goingCells : Infinity,
        blocked: blocked / total,
        name: `${SECTOR_LETTERS[col % SECTOR_LETTERS.length]}${row + 1} · ${OP_TERRAIN[mix[0].terrain].label}`,
      });
    }
  }
  return out;
}

/**
 * The narrowest places an army can get through.
 *
 * Testing for an absolute neck — impassable ground within one cell on both
 * sides — finds nothing at all on a map of open country, which is the wrong
 * answer: open country still has places where the going pinches, and those are
 * still where a defender stands. So this ranks every passable cell by how much
 * narrower the corridor through it is than the corridor across it, and returns
 * the most constricted few. On a mountain pass that finds the pass; on a plain
 * it finds the gap between the wood and the marsh, which is where the fighting
 * will be anyway.
 */
function findChokepoints(terrain: Uint8Array, cols: number, rows: number, want: number): Vec2[] {
  // "Blocked" here means impassable *or* so slow that no formed body will go
  // that way — a marsh is not a wall, but an attack does not come through one.
  const open = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= cols || y >= rows) return false;
    return moveCost(terrain[IDX(x, y, cols)]) < 3;
  };

  const LIMIT = 9;
  const reach = (x: number, y: number, dx: number, dy: number) => {
    let n = 0;
    for (let k = 1; k <= LIMIT; k++) {
      if (!open(x + dx * k, y + dy * k)) break;
      n++;
    }
    return n;
  };

  const scored: { x: number; y: number; score: number }[] = [];
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      if (!open(x, y)) continue;
      // Span through the cell on each of the four axes, including the cell.
      const spans = [
        reach(x, y, 1, 0) + reach(x, y, -1, 0) + 1,
        reach(x, y, 0, 1) + reach(x, y, 0, -1) + 1,
        reach(x, y, 1, 1) + reach(x, y, -1, -1) + 1,
        reach(x, y, 1, -1) + reach(x, y, -1, 1) + 1,
      ];
      const narrow = Math.min(...spans);
      const wide = Math.max(...spans);
      // A neck is narrow one way and long the other. A pocket is narrow both
      // ways and is a cul-de-sac, not a gate; the ratio rejects it.
      if (narrow > 5) continue;
      const score = wide / narrow;
      if (score < 2.2) continue;
      scored.push({ x, y, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const out: Vec2[] = [];
  const gap = Math.max(4, Math.round(Math.min(cols, rows) / 5));
  for (const c of scored) {
    if (out.length >= want) break;
    if (out.some((p) => Math.abs(p.x - c.x) + Math.abs(p.y - c.y) < gap)) continue;
    out.push({ x: c.x, y: c.y });
  }
  return out;
}

/**
 * The handful of places worth fighting over.
 *
 * Every objective carries the reason it is one, because the reason is the part
 * a GM has to say out loud and the part a generated map usually leaves out.
 */
function pickObjectives(
  f: OpFields, terrain: Uint8Array, places: OpPlace[],
  crossings: { x: number; y: number; bridge: boolean }[],
  chokepoints: Vec2[], sectors: OpSector[],
  o: OperationalGenOptions, rng: RNG, namer: ReturnType<typeof createNamer>,
): OpObjective[] {
  const sectorAt = (x: number, y: number): string => {
    const s = sectors.find((sec) => x >= sec.x0 && x < sec.x1 && y >= sec.y0 && y < sec.y1);
    return s ? s.id : '—';
  };
  const out: OpObjective[] = [];

  for (const c of crossings) {
    out.push({
      x: c.x, y: c.y, kind: 'crossing',
      name: c.bridge ? `${namer.settlement('village')} Bridge` : `${namer.settlement('village')} Ford`,
      why: c.bridge
        ? 'The only crossing a column can use in force. Hold it, or drop it.'
        : 'Passable but slow, and every man who uses it is exposed while he does.',
      sector: sectorAt(c.x, c.y),
    });
  }

  // The commanding height: the highest passable cell with a view.
  let bestI = -1, bestE = -1;
  for (let i = 0; i < terrain.length; i++) {
    if (!passable(terrain[i])) continue;
    if (f.elevation[i] > bestE) { bestE = f.elevation[i]; bestI = i; }
  }
  if (bestI >= 0) {
    const x = bestI % f.cols, y = Math.floor(bestI / f.cols);
    out.push({
      x, y, kind: 'height',
      name: `${namer.range()} Height`,
      why: 'Commands the valley. Whoever holds it sees the other side coming.',
      sector: sectorAt(x, y),
    });
  }

  for (const p of places) {
    if (p.kind !== 'town' && p.kind !== 'tower') continue;
    out.push({
      x: p.x, y: p.y, kind: p.kind === 'tower' ? 'ruin' : 'settlement',
      name: p.name,
      why: p.kind === 'tower'
        ? 'Stone walls and a view. A company in here is worth three in the open.'
        : 'Supplies, shelter and the road junction it grew up around.',
      sector: sectorAt(p.x, p.y),
    });
  }

  for (const c of chokepoints.slice(0, 3)) {
    out.push({
      x: c.x, y: c.y, kind: 'crossroads',
      name: `${namer.region()} Gap`,
      why: 'The ground funnels here. A small force can hold up a large one.',
      sector: sectorAt(c.x, c.y),
    });
  }

  // Keep the strongest few, spread out — a map with an objective every third
  // cell has no objectives at all.
  const kept: OpObjective[] = [];
  for (const ob of out) {
    if (kept.length >= o.objectives) break;
    if (kept.some((k) => Math.abs(k.x - ob.x) + Math.abs(k.y - ob.y) < 4)) continue;
    kept.push(ob);
  }
  return kept;
}

// ---------------------------------------------------------------------------
// The staff overlay
// ---------------------------------------------------------------------------

function overlayLayer(doc: MapDocument) {
  const l = doc.layers.find((x) => x.kind === 'object' && x.name === 'Operations Overlay');
  return l && l.kind === 'object' ? l : null;
}

function drawSectorGrid(doc: MapDocument, sectors: OpSector[], o: OperationalGenOptions): void {
  const layer = overlayLayer(doc);
  if (!layer) return;
  const palette = paletteById(o.paletteId);

  for (const s of sectors) {
    const x = (s.x0 + (s.x1 - s.x0) / 2) * o.cell;
    const y = (s.y0 + (s.y1 - s.y0) / 2) * o.cell;
    // The designation, set large and faint: readable when you look for it,
    // invisible when you are reading the ground.
    layer.objects.push(makeText(s.id, x, y, o.paletteId, {
      size: o.cell * 0.85,
      bold: true,
      letterSpacing: 2,
      color: rgba(palette.ink, 0.13),
      strokeWidth: 0,
      strokeColor: 'transparent',
      name: `Sector ${s.id}`,
    }));
  }
}

/**
 * Deployment zones on the two long edges.
 *
 * Which edges depends on the posture: a meeting engagement puts both forces on
 * opposite sides, a crossing operation puts the attacker on the far bank.
 */
function drawDeployment(
  doc: MapDocument, terrain: Uint8Array, cols: number, rows: number, o: OperationalGenOptions,
): void {
  const layer = overlayLayer(doc);
  if (!layer) return;
  const palette = paletteById(o.paletteId);

  const depth = Math.max(2, Math.round(cols * 0.13));
  const zones: { x: number; w: number; label: string; color: string }[] = [
    { x: 0, w: depth, label: 'BLUE — deploy', color: '#3f6f9c' },
    { x: cols - depth, w: depth, label: 'RED — deploy', color: '#9c4a3f' },
  ];

  for (const z of zones) {
    layer.objects.push(makeShape('rect',
      (z.x + z.w / 2) * o.cell, (rows / 2) * o.cell,
      z.w * o.cell, rows * o.cell, o.paletteId, {
        fill: { type: 'solid', color: rgba(z.color, 0.13) },
        strokeColor: rgba(z.color, 0.85),
        strokeWidth: Math.max(3, o.cell * 0.05),
        dash: [o.cell * 0.32, o.cell * 0.22],
        name: z.label,
      }));
    layer.objects.push(makeText(z.label, (z.x + z.w / 2) * o.cell, o.cell * 0.5, o.paletteId, {
      size: o.cell * 0.24,
      bold: true,
      letterSpacing: 2,
      color: z.color,
      strokeColor: rgba(palette.parchment, 0.9),
      strokeWidth: Math.max(2, o.cell * 0.04),
      name: z.label,
    }));
  }
}

function drawChokepoints(doc: MapDocument, chokepoints: Vec2[], o: OperationalGenOptions): void {
  const layer = overlayLayer(doc);
  if (!layer) return;
  const palette = paletteById(o.paletteId);
  for (const c of chokepoints) {
    const x = (c.x + 0.5) * o.cell, y = (c.y + 0.5) * o.cell;
    layer.objects.push(makeShape('ellipse', x, y, o.cell * 1.5, o.cell * 1.5, o.paletteId, {
      fill: { type: 'none', color: 'transparent' },
      strokeColor: rgba('#b0522a', 0.8),
      strokeWidth: Math.max(2, o.cell * 0.035),
      dash: [o.cell * 0.14, o.cell * 0.1],
      name: 'Chokepoint',
    }));
    layer.objects.push(makeText('✕', x, y, o.paletteId, {
      size: o.cell * 0.4,
      color: rgba('#b0522a', 0.9),
      strokeWidth: 0,
      strokeColor: 'transparent',
      name: 'Chokepoint',
    }));
  }
}

function drawObjectives(doc: MapDocument, objectives: OpObjective[], o: OperationalGenOptions): void {
  const layer = overlayLayer(doc);
  if (!layer) return;
  const palette = paletteById(o.paletteId);

  objectives.forEach((ob, i) => {
    const x = (ob.x + 0.5) * o.cell, y = (ob.y + 0.5) * o.cell;
    layer.objects.push(makeStamp('mrk/numbered', x, y - o.cell * 0.05, o.cell * 0.62, o.cell * 0.62, {
      seed: i,
      variant: i,
      tint: '#c2531f',
      opacity: 0.95,
      name: `Objective ${i + 1}: ${ob.name}`,
    }));
    // A settlement objective already has its name on the map from the place
    // labels; printing it again in red caps is just two labels fighting.
    if (ob.kind === 'settlement') return;
    layer.objects.push(makeText(ob.name.toUpperCase(), x, y + o.cell * 0.55, o.paletteId, {
      size: o.cell * 0.19,
      bold: true,
      letterSpacing: 1.2,
      color: mix('#8c3a12', palette.ink, 0.25),
      strokeColor: rgba(palette.parchment, 0.92),
      strokeWidth: Math.max(2, o.cell * 0.04),
      name: `Objective ${i + 1}`,
    }));
  });
}

/**
 * The key.
 *
 * Generated from the same table the terrain is classified with, so it can never
 * describe a map other than the one it is printed on. The movement column is
 * the reason the map exists, so it is the column that is set in bold.
 */
function drawLegend(doc: MapDocument, terrain: Uint8Array, o: OperationalGenOptions): void {
  const layer = overlayLayer(doc);
  if (!layer) return;
  const palette = paletteById(o.paletteId);

  // Only classes that actually occur — a key full of terrain the map does not
  // contain is a key the reader stops trusting.
  const present = new Set<number>();
  for (let i = 0; i < terrain.length; i++) present.add(terrain[i]);
  const rowsList = OP_TERRAIN_ORDER.filter((_, i) => present.has(i));

  const pad = o.cell * 0.34;
  const lineH = o.cell * 0.34;
  const boxW = o.cell * 7.2;
  const headerH = lineH * 1.9;
  const boxH = pad * 2 + headerH + lineH * rowsList.length + lineH * 0.3;
  const x0 = doc.width - boxW - o.cell * 0.4;
  const y0 = doc.height - boxH - o.cell * 0.4;

  const text = (str: string, x: number, y: number, size: number, opts: Record<string, unknown> = {}) => {
    layer.objects.push(makeText(str, x, y, o.paletteId, {
      size, color: palette.ink, strokeWidth: 0, strokeColor: 'transparent',
      // Set, not placed: the label layout pass must leave the key alone.
      locked: true,
      name: 'Legend', ...opts,
    }));
  };

  layer.objects.push(makeShape('rect', x0 + boxW / 2, y0 + boxH / 2, boxW, boxH, o.paletteId, {
    // Opaque: a key with a deployment boundary showing faintly through it is a
    // key the reader has to squint past.
    fill: { type: 'solid', color: palette.parchment },
    strokeColor: rgba(palette.ink, 0.75),
    strokeWidth: Math.max(1.5, o.cell * 0.022),
    cornerRadius: o.cell * 0.06,
    name: 'Legend',
  }));

  // Header, then a rule under it, then the rows — so the column titles cannot
  // collide with the first entry however many classes the map turns out to use.
  text('TERRAIN', x0 + pad, y0 + pad + lineH * 0.5, lineH * 0.58, { align: 'left', bold: true, letterSpacing: 1.4 });
  text('GOING', x0 + boxW - pad - lineH * 4.7, y0 + pad + lineH * 0.5, lineH * 0.44, { align: 'right', bold: true, letterSpacing: 0.4 });
  text('COVER', x0 + boxW - pad - lineH * 2.6, y0 + pad + lineH * 0.5, lineH * 0.44, { align: 'center', bold: true, letterSpacing: 0.4 });
  text('SIGHT', x0 + boxW - pad - lineH * 0.05, y0 + pad + lineH * 0.5, lineH * 0.44, { align: 'right', bold: true, letterSpacing: 0.4 });
  layer.objects.push(makeShape('rect', x0 + boxW / 2, y0 + pad + lineH * 1.15, boxW - pad * 2, Math.max(1, o.cell * 0.012), o.paletteId, {
    fill: { type: 'solid', color: rgba(palette.ink, 0.5) },
    strokeWidth: 0, strokeColor: 'transparent', name: 'Legend',
  }));

  rowsList.forEach((t, i) => {
    const def = OP_TERRAIN[t];
    const y = y0 + pad + headerH + lineH * (i + 0.5);
    layer.objects.push(makeShape('rect', x0 + pad + lineH * 0.36, y, lineH * 0.68, lineH * 0.68, o.paletteId, {
      fill: { type: 'solid', color: mix(def.color, palette.parchment, 0.18) },
      strokeColor: rgba(palette.ink, 0.6),
      strokeWidth: 1,
      name: def.label,
    }));
    text(def.label, x0 + pad + lineH * 0.85, y, lineH * 0.54, { align: 'left' });
    // Words, not symbols. A key is read once under pressure and a glyph the
    // reader has to decode first is worse than the word it stands for.
    const going = Number.isFinite(def.move) ? `${def.move}×` : '—';
    const cover = def.cover === 'none' ? '—' : def.cover === 'light' ? 'light' : 'HEAVY';
    const sight = def.blocksSight ? 'blocks' : '—';
    text(going, x0 + boxW - pad - lineH * 4.7, y, lineH * 0.54, { align: 'right', bold: true });
    text(cover, x0 + boxW - pad - lineH * 2.6, y, lineH * 0.5, { align: 'center', bold: def.cover === 'heavy' });
    text(sight, x0 + boxW - pad - lineH * 0.05, y, lineH * 0.5, { align: 'right', bold: def.blocksSight });
  });
}

function noteObjectives(doc: MapDocument, objectives: OpObjective[], o: OperationalGenOptions): void {
  const layer = doc.layers.find((l) => l.kind === 'note');
  if (!layer || layer.kind !== 'note') return;
  objectives.forEach((ob, i) => {
    layer.notes.push(makeNote(
      (ob.x + 0.5) * o.cell, (ob.y + 0.5) * o.cell,
      `Objective ${i + 1} — ${ob.name} (sector ${ob.sector})\n${ob.why}`,
    ));
  });
}

// ---------------------------------------------------------------------------
// From theatre to table
// ---------------------------------------------------------------------------

/**
 * Generate the tactical map for one sector of a theatre.
 *
 * This is the join that makes an operational map worth having. The sector's
 * terrain mix chooses the battle-map recipe, its tree share sets the density,
 * its water share decides whether there is a stream across the table, and the
 * seed is derived from the theatre's seed and the sector's designation — so
 * C3 is always the same ground, whoever generates it and whenever, and a
 * campaign fought across the theatre stays consistent from session to session.
 */
export function battleFromSector(
  result: OperationalResult, sectorId: string,
  overrides: Partial<BattleGenOptions> = {},
): { battle: ReturnType<typeof generateBattleMap>; sector: OpSector } | null {
  const sector = result.sectors.find((s) => s.id.toUpperCase() === sectorId.toUpperCase());
  if (!sector) return null;

  const share = (t: OpTerrain) => sector.mix.find((m) => m.terrain === t)?.share ?? 0;
  const trees = share('woods') + share('forest') * 1.4 + share('scrub') * 0.4;
  const water = share('water') + share('ford') + share('marsh') * 0.5;
  const broken = share('rough') + share('steep') + share('crag');

  // A deterministic seed from the theatre and the designation. Nothing about
  // the order sectors are asked for may change what any of them contains.
  let h = result.options.seed | 0;
  for (const ch of sector.id.toUpperCase()) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const seed = Math.abs(h) % 1_000_000;

  const battle = generateBattleMap({
    seed,
    biome: OP_TO_BATTLE_BIOME[sector.dominant],
    density: clamp01(0.25 + trees * 0.9 + broken * 0.4),
    water: clamp01(water * 1.6),
    elevation: clamp01(0.2 + broken * 1.2),
    paletteId: result.options.paletteId,
    title: `Sector ${sector.id} — ${OP_TERRAIN[sector.dominant].label}`,
    ...overrides,
  });

  battle.doc.meta.description = [
    `Sector ${sector.id} of ${result.doc.meta.title}. `,
    `Ground: ${sector.mix.slice(0, 3).map((m) => `${OP_TERRAIN[m.terrain].label} ${Math.round(m.share * 100)}%`).join(', ')}. `,
    `Mean going ${sector.going.toFixed(2)}×`,
    sector.blocked > 0.01 ? `, ${Math.round(sector.blocked * 100)}% impassable.` : '.',
  ].join('');

  return { battle, sector };
}
