/**
 * City / settlement generator.
 *
 * Lays a street network first, then fills the blocks it creates with buildings
 * that face the street they sit on — the thing that makes a drawn town read as
 * a town rather than a scatter of boxes.
 */
import type { MapDocument, Vec2, ShapeObject } from '../../core/types';
import { createDocument, rasterByRole, objectLayerByRole } from '../../core/doc';
import { RNG } from '../../core/rng';
import { createNamer, type Culture } from '../names';
import { getTexture } from '../../render/textures';
import { createSurface, ctxOf } from '../../util/canvas';
import { blendTextures, addTonalDrift, fillTexture } from '../paintUtils';
import { layoutLabels } from '../labelLayout';
import { makeShape, makePath, makeText, makeStamp, makeStampAuto, makeLight } from '../../core/factories';
import { paletteById, mix, rgba } from '../../core/color';
import { dist, chaikin, pointInPolygon, rotate } from '../../core/geometry';
import { SimplexNoise, clamp01, smoothstep } from '../../core/noise';

export type CityPlan = 'organic' | 'radial' | 'grid' | 'coastal' | 'river';
export type CitySize = 'hamlet' | 'village' | 'town' | 'city' | 'metropolis';

export interface CityGenOptions {
  width: number;
  height: number;
  seed: number;
  plan: CityPlan;
  size: CitySize;
  walls: boolean;
  wallTowers: number;
  castle: boolean;
  temple: boolean;
  market: boolean;
  docks: boolean;
  farmland: boolean;
  labels: boolean;
  streetLamps: boolean;
  paletteId: string;
  culture: Culture;
  title?: string;
}

export const DEFAULT_CITY_OPTIONS: CityGenOptions = {
  width: 2048, height: 2048, seed: 1, plan: 'organic', size: 'town',
  walls: true, wallTowers: 8, castle: true, temple: true, market: true,
  docks: false, farmland: true, labels: true, streetLamps: false,
  paletteId: 'atlas', culture: 'common',
};

const SIZE_PARAMS: Record<CitySize, { radius: number; buildings: number; rings: number; spokes: number }> = {
  hamlet: { radius: 0.16, buildings: 40, rings: 1, spokes: 3 },
  village: { radius: 0.24, buildings: 110, rings: 1, spokes: 5 },
  town: { radius: 0.32, buildings: 280, rings: 2, spokes: 7 },
  city: { radius: 0.4, buildings: 560, rings: 3, spokes: 9 },
  metropolis: { radius: 0.46, buildings: 900, rings: 4, spokes: 12 },
};

export interface CityResult {
  doc: MapDocument;
  boundary: Vec2[];
  buildings: { x: number; y: number; w: number; h: number; rot: number }[];
}

export function generateCity(opts: Partial<CityGenOptions> = {}): CityResult {
  const o: CityGenOptions = { ...DEFAULT_CITY_OPTIONS, ...opts };
  const rng = new RNG(o.seed);
  const namer = createNamer(o.seed, o.culture);
  const palette = paletteById(o.paletteId);
  const params = SIZE_PARAMS[o.size];

  const doc = createDocument({
    kind: 'city',
    width: o.width,
    height: o.height,
    title: o.title || namer.settlement(o.size === 'metropolis' ? 'city' : o.size === 'city' ? 'city' : 'town'),
    paletteId: o.paletteId,
  });
  doc.meta.seed = o.seed;

  const cx = o.width * 0.5;
  const cy = o.height * (o.plan === 'coastal' ? 0.42 : 0.5);
  const R = Math.min(o.width, o.height) * params.radius;

  // --- Ground --------------------------------------------------------------
  paintGround(doc, o, rng);

  // --- Water ---------------------------------------------------------------
  let waterPoly: Vec2[] | null = null;
  if (o.plan === 'coastal' || o.docks) waterPoly = paintCoast(doc, o, rng);
  else if (o.plan === 'river') waterPoly = paintRiver(doc, o, rng, cx, cy);

  // --- Boundary ------------------------------------------------------------
  const boundary = cityBoundary(cx, cy, R, rng, o);

  // --- Streets -------------------------------------------------------------
  const streets = buildStreets(cx, cy, R, boundary, rng, o, params);
  drawStreets(doc, streets, o, rng, namer);

  // --- Buildings -----------------------------------------------------------
  const buildings = placeBuildings(doc, cx, cy, R, boundary, streets, waterPoly, rng, o, params);

  // --- Outskirts -----------------------------------------------------------
  addOutskirts(doc, cx, cy, R, boundary, waterPoly, rng, o);

  // --- Walls & landmarks ---------------------------------------------------
  if (o.walls && o.size !== 'hamlet') drawWalls(doc, boundary, o, rng, params);
  addLandmarks(doc, cx, cy, R, rng, o, namer, waterPoly);
  if (o.labels) {
    addCityLabels(doc, cx, cy, R, rng, o, namer, streets);
    layoutLabels(doc, { padding: Math.max(4, doc.width / 360) });
  }
  if (o.streetLamps) addLamps(doc, streets, o, rng);

  return { doc, boundary, buildings };
}

// ---------------------------------------------------------------------------

function paintGround(doc: MapDocument, o: CityGenOptions, rng: RNG): void {
  const bg = rasterByRole(doc, 'background');
  const terrain = rasterByRole(doc, 'terrain');
  if (!bg) return;

  fillTexture(ctxOf(bg.surface), doc.width, doc.height, 'grass', o.paletteId);

  if (!terrain) return;
  const tctx = ctxOf(terrain.surface);

  // One pass for the whole countryside: meadow, worked earth and — when the
  // settlement has farmland — strip fields, interlocking naturally.
  // Deliberately no forest texture here: woodland is drawn as tree stamps in
  // `addOutskirts`, and a forest-coloured patch that no trees stand on reads as
  // a stain rather than a wood.
  const layers = o.farmland
    ? [
        { textureId: 'grass-lush', weight: 3.2 },
        { textureId: 'grass', weight: 2.8 },
        { textureId: 'farmland', weight: 1.7 },
        { textureId: 'plains', weight: 1.4 },
        { textureId: 'dirt', weight: 1.1 },
      ]
    : [
        { textureId: 'grass-lush', weight: 3.4 },
        { textureId: 'grass', weight: 3.2 },
        { textureId: 'plains', weight: 1.6 },
        { textureId: 'dirt', weight: 1.2 },
      ];

  blendTextures(tctx, doc.width, doc.height, layers, {
    seed: o.seed + 17,
    scale: 3.4,
    warp: 0.22,
    paletteId: o.paletteId,
  });
  addTonalDrift(tctx, doc.width, doc.height, o.seed + 55, 0.9);
}

function paintCoast(doc: MapDocument, o: CityGenOptions, rng: RNG): Vec2[] {
  const water = rasterByRole(doc, 'water');
  if (!water) return [];
  const ctx = ctxOf(water.surface);
  const y0 = doc.height * 0.78;
  const pts: Vec2[] = [];
  for (let i = 0; i <= 24; i++) {
    pts.push({ x: (i / 24) * doc.width, y: y0 + Math.sin(i * 0.7 + o.seed) * doc.height * 0.05 + rng.float(-20, 20) });
  }
  const poly = [...pts, { x: doc.width, y: doc.height }, { x: 0, y: doc.height }];
  fillPoly(ctx, poly, o.paletteId, 'water');
  return poly;
}

function paintRiver(doc: MapDocument, o: CityGenOptions, rng: RNG, cx: number, cy: number): Vec2[] {
  const water = rasterByRole(doc, 'water');
  if (!water) return [];
  const ctx = ctxOf(water.surface);
  const w = doc.width * rng.float(0.06, 0.11);
  const spine: Vec2[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    spine.push({ x: doc.width * t, y: cy + Math.sin(t * 3.1 + o.seed) * doc.height * 0.12 + rng.float(-15, 15) });
  }
  const smooth = chaikin(spine, 3);
  const poly = [
    ...smooth.map((p) => ({ x: p.x, y: p.y - w / 2 })),
    ...smooth.slice().reverse().map((p) => ({ x: p.x, y: p.y + w / 2 })),
  ];
  fillPoly(ctx, poly, o.paletteId, 'water');
  return poly;
}

function fillPoly(ctx: CanvasRenderingContext2D, poly: Vec2[], paletteId: string, textureId: string): void {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(poly[0].x, poly[0].y);
  for (const p of poly.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.closePath();
  ctx.fillStyle = ctx.createPattern(getTexture(textureId, { paletteId }), 'repeat')!;
  ctx.fill();
  ctx.strokeStyle = rgba(paletteById(paletteId).ink, 0.5);
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}

function cityBoundary(cx: number, cy: number, R: number, rng: RNG, o: CityGenOptions): Vec2[] {
  const pts: Vec2[] = [];
  const n = 48;
  const noise = new SimplexNoise(o.seed + 7);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const wob = 1 + noise.fbm(Math.cos(a) * 1.4 + 3, Math.sin(a) * 1.4 + 5, 3) * 0.22;
    pts.push({ x: cx + Math.cos(a) * R * wob, y: cy + Math.sin(a) * R * wob * 0.94 });
  }
  return pts;
}

// ---------------------------------------------------------------------------
// Streets
// ---------------------------------------------------------------------------

export interface Street { pts: Vec2[]; width: number; major: boolean; name?: string; }

function buildStreets(
  cx: number, cy: number, R: number, boundary: Vec2[],
  rng: RNG, o: CityGenOptions, params: { rings: number; spokes: number },
): Street[] {
  const streets: Street[] = [];

  if (o.plan === 'grid') {
    const spacing = R / 3.2;
    for (let x = cx - R; x <= cx + R; x += spacing) {
      streets.push({ pts: [{ x, y: cy - R }, { x, y: cy + R }], width: rng.bool(0.3) ? 16 : 10, major: rng.bool(0.3) });
    }
    for (let y = cy - R; y <= cy + R; y += spacing) {
      streets.push({ pts: [{ x: cx - R, y }, { x: cx + R, y }], width: rng.bool(0.3) ? 16 : 10, major: rng.bool(0.3) });
    }
    return streets;
  }

  // Spokes radiating out of the centre.
  const spokes = params.spokes;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2 + rng.float(-0.12, 0.12);
    const pts: Vec2[] = [];
    const steps = 10;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const rr = R * 1.15 * t;
      const wob = o.plan === 'organic' ? rng.float(-0.1, 0.1) * rr * 0.4 : 0;
      pts.push({ x: cx + Math.cos(a) * rr + wob, y: cy + Math.sin(a) * rr + wob * 0.6 });
    }
    streets.push({ pts: chaikin(pts, 2), width: 18, major: true });
  }

  // Ring roads.
  for (let r = 1; r <= params.rings; r++) {
    const rr = (R * r) / (params.rings + 0.4);
    const pts: Vec2[] = [];
    const n = 40;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const wob = o.plan === 'organic' ? 1 + rng.float(-0.06, 0.06) : 1;
      pts.push({ x: cx + Math.cos(a) * rr * wob, y: cy + Math.sin(a) * rr * wob * 0.95 });
    }
    streets.push({ pts: chaikin(pts, 2), width: r === params.rings ? 14 : 11, major: r === params.rings });
  }

  // Minor lanes connecting random points inside.
  const lanes = Math.round(params.spokes * 2.5);
  for (let i = 0; i < lanes; i++) {
    const a0 = rng.float(0, Math.PI * 2), a1 = a0 + rng.float(0.5, 1.6);
    const r0 = rng.float(R * 0.25, R * 0.95), r1 = rng.float(R * 0.25, R * 0.95);
    const p0 = { x: cx + Math.cos(a0) * r0, y: cy + Math.sin(a0) * r0 };
    const p1 = { x: cx + Math.cos(a1) * r1, y: cy + Math.sin(a1) * r1 };
    const mid = { x: (p0.x + p1.x) / 2 + rng.float(-40, 40), y: (p0.y + p1.y) / 2 + rng.float(-40, 40) };
    streets.push({ pts: chaikin([p0, mid, p1], 2), width: rng.float(6, 9), major: false });
  }

  return streets;
}

function drawStreets(doc: MapDocument, streets: Street[], o: CityGenOptions, rng: RNG, namer: ReturnType<typeof createNamer>): void {
  const layer = doc.layers.find((l) => l.kind === 'object' && l.name === 'Streets');
  if (!layer || layer.kind !== 'object') return;
  const palette = paletteById(o.paletteId);
  for (const s of streets) {
    layer.objects.push(makePath('road', s.pts, o.paletteId, {
      width: s.width,
      outlineWidth: s.major ? 3 : 2,
      color: mix(palette.parchmentDark, '#a89a80', 0.5),
      outlineColor: rgba(palette.ink, 0.55),
      jitter: 0.4,
      smoothing: 0.6,
      name: s.major ? namer.settlement('village') + ' Way' : 'Lane',
    }));
  }
}

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------

function nearestStreetInfo(p: Vec2, streets: Street[]): { d: number; angle: number } {
  let best = Infinity, angle = 0;
  for (const s of streets) {
    for (let i = 1; i < s.pts.length; i++) {
      const a = s.pts[i - 1], b = s.pts[i];
      const abx = b.x - a.x, aby = b.y - a.y;
      const l2 = abx * abx + aby * aby || 1;
      let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / l2;
      t = Math.max(0, Math.min(1, t));
      const px = a.x + t * abx, py = a.y + t * aby;
      const d = Math.hypot(p.x - px, p.y - py) - s.width / 2;
      if (d < best) { best = d; angle = Math.atan2(aby, abx); }
    }
  }
  return { d: best, angle };
}

interface Building { x: number; y: number; w: number; h: number; rot: number; }

/**
 * Separating-axis test for two rotated rectangles, with a small margin so
 * buildings share a party wall rather than fusing into one roof.
 */
function obbOverlap(a: Building, b: Building, margin = 1.2): boolean {
  const ar = (a.rot * Math.PI) / 180, br = (b.rot * Math.PI) / 180;
  const axes = [
    { x: Math.cos(ar), y: Math.sin(ar) },
    { x: -Math.sin(ar), y: Math.cos(ar) },
    { x: Math.cos(br), y: Math.sin(br) },
    { x: -Math.sin(br), y: Math.cos(br) },
  ];
  const dx = b.x - a.x, dy = b.y - a.y;

  for (const ax of axes) {
    // Half-extent of each box projected onto this axis.
    const ea = Math.abs(Math.cos(ar) * ax.x + Math.sin(ar) * ax.y) * (a.w / 2)
      + Math.abs(-Math.sin(ar) * ax.x + Math.cos(ar) * ax.y) * (a.h / 2);
    const eb = Math.abs(Math.cos(br) * ax.x + Math.sin(br) * ax.y) * (b.w / 2)
      + Math.abs(-Math.sin(br) * ax.x + Math.cos(br) * ax.y) * (b.h / 2);
    const sep = Math.abs(dx * ax.x + dy * ax.y);
    if (sep >= ea + eb + margin) return false;   // a gap on this axis: no overlap
  }
  return true;
}

/**
 * Buildings laid out along street frontages.
 *
 * The obvious approach — scatter rectangles, reject the ones that land on a
 * road — produces a field of detached rectangles at random angles, because
 * nothing in it knows which street a given building belongs to. A town read
 * from above is the opposite of that: buildings stand shoulder to shoulder in
 * a continuous line, with their short side to the street and their backs to a
 * shared block interior, and the gaps between them are the exceptions.
 *
 * So the placement walks each street instead, stepping along it and setting a
 * plot down on each side, offset by half the street width plus half the plot's
 * depth. Density falls off from the centre, backland plots fill the interiors,
 * and the whole thing needs no rejection sampling at all beyond checking that
 * neighbouring streets have not already claimed the ground.
 */
function placeBuildings(
  doc: MapDocument, cx: number, cy: number, R: number,
  boundary: Vec2[], streets: Street[], waterPoly: Vec2[] | null,
  rng: RNG, o: CityGenOptions, params: { buildings: number },
): Building[] {
  const layer = doc.layers.find((l) => l.kind === 'object' && l.name === 'Buildings');
  if (!layer || layer.kind !== 'object') return [];
  const palette = paletteById(o.paletteId);

  const placed: Building[] = [];
  const target = params.buildings;
  // Roof colours weighted the way a real town is roofed: mostly thatch and
  // weathered timber, some slate, and clay tile as the expensive minority. An
  // even spread over the same eight colours reads as a box of toy bricks.
  const roofs: [string, number][] = [
    ['#7a5a3a', 9],   // thatch
    ['#6b4a2a', 8],   // dark timber shingle
    ['#8a6a45', 6],   // pale thatch
    ['#5a5f52', 5],   // mossy slate
    ['#6d5548', 4],   // weathered board
    ['#8a4a3d', 2],   // clay tile
    ['#4f5c63', 1],   // blue slate
  ];

  // Broad-phase grid so the overlap test does not become O(n²) on a large city.
  const CELL = 48;
  const buckets = new Map<string, Building[]>();
  const bucketKey = (x: number, y: number) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
  const nearby = (x: number, y: number): Building[] => {
    const out: Building[] = [];
    const bx = Math.floor(x / CELL), by = Math.floor(y / CELL);
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const b = buckets.get(`${bx + i},${by + j}`);
        if (b) out.push(...b);
      }
    }
    return out;
  };

  const fits = (b: Building): boolean => {
    // A circular approximation cannot express "shoulder to shoulder": a plot
    // 16 wide and 28 deep gets a 12-unit exclusion radius in every direction,
    // so its neighbour along the street is pushed 25 units away and the terrace
    // comes out as a row of detached villas. Medieval towns are built to the
    // party wall, so the test has to know which way each building faces.
    const rb = Math.hypot(b.w, b.h) * 0.5;
    for (const other of nearby(b.x, b.y)) {
      const gap = dist(b, other);
      if (gap > rb + Math.hypot(other.w, other.h) * 0.5) continue;   // cheap reject
      if (obbOverlap(b, other)) return false;
    }
    return true;
  };

  const commit = (b: Building): void => {
    placed.push(b);
    const k = bucketKey(b.x, b.y);
    const list = buckets.get(k);
    if (list) list.push(b); else buckets.set(k, [b]);

    const roof = rng.pickWeighted(roofs);
    layer.objects.push(makeShape('rect', b.x, b.y, b.w, b.h, o.paletteId, {
      rotation: b.rot,
      fill: { type: 'linear', color: mix(roof, '#ffffff', 0.15), color2: mix(roof, '#000000', 0.35), angle: 35 },
      strokeColor: rgba(palette.ink, 0.75),
      strokeWidth: 1.6,
      cornerRadius: 1.5,
      name: 'Building',
      shadow: { color: 'rgba(0,0,0,0.35)', blur: 6, dx: 3, dy: 4 },
    }) as ShapeObject);
    // A ridge line down the roof sells the third dimension. It runs along the
    // building's longer axis, which is how a gable actually sits.
    const alongW = b.w >= b.h;
    layer.objects.push(makeShape(
      'rect', b.x, b.y,
      alongW ? b.w * 0.9 : 1.7,
      alongW ? 1.7 : b.h * 0.9,
      o.paletteId, {
        rotation: b.rot,
        fill: { type: 'solid', color: rgba('#ffffff', 0.32) },
        strokeWidth: 0,
        strokeColor: 'transparent',
        name: 'Ridge',
      },
    ) as ShapeObject);
  };

  const insideTown = (p: Vec2): boolean =>
    pointInPolygon(p, boundary) && !(waterPoly && pointInPolygon(p, waterPoly));

  // --- Frontages -----------------------------------------------------------
  // Longer, busier streets first: when two streets compete for a corner plot,
  // the more important one should win it.
  const ordered = streets.slice().sort((a, b) => (b.major ? 1 : 0) - (a.major ? 1 : 0));

  for (const st of ordered) {
    if (placed.length >= target) break;
    for (let i = 1; i < st.pts.length && placed.length < target; i++) {
      const a = st.pts[i - 1], b = st.pts[i];
      const segLen = Math.hypot(b.x - a.x, b.y - a.y);
      if (segLen < 6) continue;
      const ux = (b.x - a.x) / segLen, uy = (b.y - a.y) / segLen;
      const nx = -uy, ny = ux;
      const angle = (Math.atan2(uy, ux) * 180) / Math.PI;

      let travelled = rng.float(0, 14);
      while (travelled < segLen && placed.length < target) {
        const px = a.x + ux * travelled, py = a.y + uy * travelled;
        const rr = Math.hypot(px - cx, py - cy);
        const density = clamp01(1 - rr / (R * 1.05));

        // Plot frontage along the street, and depth back from it. Frontages are
        // narrow and deep — burgage plots, not suburban lots.
        const front = rng.float(13, 24) * (0.8 + density * 0.35);
        const depth = rng.float(20, 34) * (0.78 + density * 0.35);

        for (const side of [1, -1]) {
          // A gap in the terrace: yards, alleys, and the odd bombed-out plot.
          if (rng.bool(0.22 - density * 0.14)) continue;
          const off = st.width / 2 + depth / 2 + rng.float(1.5, 4);
          const p = { x: px + nx * off * side, y: py + ny * off * side };
          if (!insideTown(p)) continue;
          const b2: Building = { x: p.x, y: p.y, w: front, h: depth, rot: angle + rng.float(-2.5, 2.5) };
          if (!fits(b2)) continue;
          commit(b2);
        }
        travelled += front + rng.float(0.5, 3);
      }
    }
  }

  // --- Backland ------------------------------------------------------------
  // Workshops, stables and infill behind the street frontages. Without these
  // the block interiors read as suspiciously empty courtyards.
  let attempts = 0;
  const backlandTarget = Math.round(target * 0.42);
  let backland = 0;
  while (backland < backlandTarget && attempts < backlandTarget * 60) {
    attempts++;
    const ang = rng.float(0, Math.PI * 2);
    const rr = Math.sqrt(rng.next()) * R * 0.95;
    const p = { x: cx + Math.cos(ang) * rr, y: cy + Math.sin(ang) * rr * 0.95 };
    if (!insideTown(p)) continue;
    const info = nearestStreetInfo(p, streets);
    if (info.d < 6) continue;
    const w = rng.float(12, 20), h = rng.float(12, 20);
    const b: Building = {
      x: p.x, y: p.y, w, h,
      rot: (info.angle * 180) / Math.PI + rng.pick([0, 90]) + rng.float(-6, 6),
    };
    if (!fits(b)) continue;
    commit(b);
    backland++;
  }

  return placed;
}

// ---------------------------------------------------------------------------
// Walls & landmarks
// ---------------------------------------------------------------------------

/** Trees, orchards and hedges outside the settlement, so it sits in a landscape. */
function addOutskirts(
  doc: MapDocument, cx: number, cy: number, R: number,
  boundary: Vec2[], waterPoly: Vec2[] | null, rng: RNG, o: CityGenOptions,
): void {
  const layer = doc.layers.find((l) => l.kind === 'object' && l.name === 'Streets');
  if (!layer || layer.kind !== 'object') return;
  const scale = Math.min(doc.width, doc.height) / 2048;
  const noise = new SimplexNoise(o.seed + 733);

  // Woods, not confetti: the density field is squared so trees gather into
  // stands with real clearings between them, and thin out towards the cleared
  // land around the settlement.
  const attempts = Math.round(1400 * scale);
  let placed = 0;
  const cap = Math.round(420 * scale);
  for (let i = 0; i < attempts && placed < cap; i++) {
    const x = rng.float(0, doc.width);
    const y = rng.float(0, doc.height);
    if (pointInPolygon({ x, y }, boundary)) continue;
    if (waterPoly && pointInPolygon({ x, y }, waterPoly)) continue;
    const raw = noise.fbm((x / doc.width) * 2.6, (y / doc.height) * 2.6, 4) * 0.5 + 0.5;
    const density = clamp01((raw - 0.42) * 2.4);
    const clearance = clamp01((dist({ x, y }, { x: cx, y: cy }) - R * 1.05) / (R * 0.5));
    if (rng.next() > density * density * clearance) continue;
    const conifer = raw > 0.62;
    const w = rng.float(30, 62) * scale;
    layer.objects.push(makeStampAuto(conifer ? 'btl/pine-top' : 'btl/tree-top', x, y, w, {
      seed: rng.int(1, 1e6),
      opacity: 0.95,
      rotation: rng.float(0, 360),
    }));
    placed++;
  }
}

function drawWalls(doc: MapDocument, boundary: Vec2[], o: CityGenOptions, rng: RNG, params: { spokes: number }): void {
  const layer = doc.layers.find((l) => l.kind === 'object' && l.name === 'Walls & Gates');
  if (!layer || layer.kind !== 'object') return;
  const palette = paletteById(o.paletteId);

  const ring = boundary.map((p) => ({ x: p.x, y: p.y }));
  const scale = Math.min(doc.width, doc.height) / 2048;
  const wallW = 26 * scale;

  layer.objects.push(makePath('wall', [...ring, ring[0]], o.paletteId, {
    closed: true,
    width: wallW,
    outlineWidth: 4 * scale,
    color: mix(palette.rock, '#a49a8b', 0.45),
    outlineColor: rgba(palette.ink, 0.9),
    jitter: 0,
    smoothing: 0.4,
    name: 'City Wall',
    shadow: { color: 'rgba(0,0,0,0.4)', blur: 14 * scale, dx: 4 * scale, dy: 6 * scale },
  }));
  // A darker inner line gives the wall a walkway and some thickness.
  layer.objects.push(makePath('wall', [...ring, ring[0]], o.paletteId, {
    closed: true,
    width: wallW * 0.42,
    outlineWidth: 0,
    color: rgba(palette.ink, 0.35),
    outlineColor: 'transparent',
    jitter: 0,
    smoothing: 0.4,
    name: 'Wall Walk',
  }));

  const towers = Math.max(4, o.wallTowers);
  for (let i = 0; i < towers; i++) {
    const p = ring[Math.floor((i / towers) * ring.length)];
    layer.objects.push(makeStampAuto('dgn/pillar', p.x, p.y, wallW * 2.1, {
      seed: rng.int(1, 1e6), name: 'Wall Tower',
      shadow: { color: 'rgba(0,0,0,0.45)', blur: 12 * scale, dx: 4 * scale, dy: 5 * scale },
    }));
  }

  // Gates where the major approaches meet the wall.
  const gates = Math.min(4, Math.max(2, Math.round(params.spokes / 2)));
  for (let i = 0; i < gates; i++) {
    const idx = Math.floor(((i + 0.5) / gates) * ring.length) % ring.length;
    const p = ring[idx];
    const q = ring[(idx + 2) % ring.length];
    const ang = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
    layer.objects.push(makeStampAuto('dgn/double-door', p.x, p.y, wallW * 3, {
      seed: rng.int(1, 1e6), name: 'City Gate', rotation: ang,
    }));
  }
}

function addLandmarks(
  doc: MapDocument, cx: number, cy: number, R: number,
  rng: RNG, o: CityGenOptions, namer: ReturnType<typeof createNamer>, waterPoly: Vec2[] | null,
): void {
  const layer = doc.layers.find((l) => l.kind === 'object' && l.name === 'Buildings');
  if (!layer || layer.kind !== 'object') return;

  if (o.market) {
    layer.objects.push(makeStamp('dgn/fountain', cx, cy, 90, 90, { seed: rng.int(1, 1e6), name: 'Market Fountain' }));
  }
  if (o.castle) {
    const a = rng.float(0, Math.PI * 2);
    const p = { x: cx + Math.cos(a) * R * 0.55, y: cy + Math.sin(a) * R * 0.55 };
    layer.objects.push(makeStamp('town/castle', p.x, p.y, 220, 160, { seed: rng.int(1, 1e6), name: 'Keep' }));
  }
  if (o.temple) {
    const a = rng.float(0, Math.PI * 2);
    const p = { x: cx + Math.cos(a) * R * 0.4, y: cy + Math.sin(a) * R * 0.4 };
    layer.objects.push(makeStamp('town/temple', p.x, p.y, 130, 120, { seed: rng.int(1, 1e6), name: 'Temple' }));
  }
  if (o.docks && waterPoly) {
    layer.objects.push(makeStamp('town/port', cx + rng.float(-R * 0.3, R * 0.3), doc.height * 0.76, 190, 120, {
      seed: rng.int(1, 1e6), name: 'Docks',
    }));
  }
}

function addCityLabels(
  doc: MapDocument, cx: number, cy: number, R: number,
  rng: RNG, o: CityGenOptions, namer: ReturnType<typeof createNamer>, streets: Street[],
): void {
  const layer = doc.layers.find((l) => l.kind === 'object' && l.role === 'labels');
  if (!layer || layer.kind !== 'object') return;
  const palette = paletteById(o.paletteId);

  layer.objects.push(makeText(doc.meta.title, cx, cy - R * 1.22, o.paletteId, {
    size: 72, bold: true, letterSpacing: 10,
    color: palette.ink, strokeColor: rgba(palette.parchment, 0.85), strokeWidth: 6,
    banner: 'none', name: 'City Name',
  }));

  const districts = ['Old Quarter', 'Craftsman’s Row', 'The Shambles', 'Templeside', 'Merchant Quarter', 'Riverside', 'The Warrens', 'Highgate', 'Dockside', 'Garden District'];
  const n = Math.min(districts.length, o.size === 'metropolis' ? 8 : o.size === 'city' ? 6 : 4);
  const picked = rng.shuffle(districts.slice()).slice(0, n);
  picked.forEach((name, i) => {
    const a = (i / n) * Math.PI * 2 + rng.float(-0.2, 0.2);
    const rr = R * rng.float(0.45, 0.85);
    layer.objects.push(makeText(name, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, o.paletteId, {
      size: 26, italic: true, letterSpacing: 4,
      color: palette.inkSoft, strokeColor: rgba(palette.parchment, 0.7), strokeWidth: 3,
      rotation: rng.float(-8, 8), name: `District: ${name}`,
    }));
  });

  // Two or three named taverns give the GM something to hang a scene on.
  for (let i = 0; i < 3; i++) {
    const a = rng.float(0, Math.PI * 2), rr = R * rng.float(0.2, 0.7);
    layer.objects.push(makeText(namer.tavern(), cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, o.paletteId, {
      size: 18, italic: true, color: palette.accent,
      strokeColor: rgba(palette.parchment, 0.8), strokeWidth: 2.5,
      name: 'Tavern',
    }));
  }
}

function addLamps(doc: MapDocument, streets: Street[], o: CityGenOptions, rng: RNG): void {
  const layer = doc.layers.find((l) => l.kind === 'light');
  if (!layer || layer.kind !== 'light') return;
  for (const s of streets) {
    if (!s.major) continue;
    for (let i = 2; i < s.pts.length; i += 4) {
      const p = s.pts[i];
      layer.lights.push(makeLight(p.x, p.y, 64, {
        bright: 60, dim: 140, color: '#ffcf8a', intensity: 0.7, animation: 'flame', name: 'Street Lamp',
      }));
    }
  }
}
