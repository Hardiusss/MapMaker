/**
 * Castle generator.
 *
 * A castle is not a dungeon with battlements: the interesting part is the
 * *envelope* — a wall thick enough to fight from, towers that flank the ground
 * in front of it, and a gate that is a building rather than a hole. So the plan
 * is built from enclosures ("wards") described as outlines with a thickness,
 * rasterised through a signed-distance test into three concentric bands: outer
 * parapet, wall walk, inner parapet. That one construction gives every style a
 * curtain a figure can stand on top of, and it gives `traceWalls` an open/solid
 * grid it already knows how to turn into a VTT wall set.
 *
 * Everything is rasterised at sub-cell resolution and only collapsed to the
 * tactical grid at the end. Drawing a round tower straight onto 5 ft squares
 * gives a staircase; sampling it eight times finer and letting the mask upscale
 * gives a circle, and the walls a VTT needs are still square-aligned.
 */
import type { MapDocument, Wall, WallKind, Vec2, LightSource } from '../../core/types';
import { createDocument, rasterByRole } from '../../core/doc';
import { RNG } from '../../core/rng';
import { syllableName, createNamer, type Culture } from '../names';
import { makeGrid, at, traceWalls, type CellGrid, type DoorSpec } from '../dungeon/grid';
import { makeStamp, makeStampAuto, makeText, makeLight, makeNote, makeWall } from '../../core/factories';
import { paletteById, mix, rgba } from '../../core/color';
import { createSurface, ctxOf } from '../../util/canvas';
import { acquireScratch, releaseScratch } from '../../util/scratch';
import { blendTextures, addTonalDrift } from '../paintUtils';
import { layoutLabels } from '../labelLayout';
import { type Mask, freeMask, stencil, inkOutline, castShadow, rimShade } from './masonry';

export type CastleStyle =
  | 'motte-bailey' | 'concentric' | 'shell-keep' | 'coastal' | 'star-fort' | 'hillfort';

export interface CastleGenOptions {
  width: number;
  height: number;
  cell: number;
  seed: number;
  style: CastleStyle;
  /** 0..1 — how much of the sheet the fortification fills. */
  size: number;
  /** Cells between mural towers along a long run of curtain. */
  towerSpacing: number;
  moat: boolean;
  /** Moat / ditch width in cells. */
  moatWidth: number;
  /** 1 = a single enclosure, 2 = an outer bailey as well. */
  baileys: number;
  courtyardBuildings: boolean;
  /** 0 = garrisoned and intact, 1 = a shell nobody has held for a century. */
  ruined: number;
  labels: boolean;
  notes: boolean;
  lights: boolean;
  paletteId: string;
  title?: string;
}

export const DEFAULT_CASTLE_OPTIONS: CastleGenOptions = {
  width: 4200, height: 3360, cell: 70, seed: 1,
  style: 'concentric', size: 0.7, towerSpacing: 14,
  moat: true, moatWidth: 2.5, baileys: 2, courtyardBuildings: true,
  ruined: 0, labels: true, notes: true, lights: true,
  paletteId: 'atlas',
};

/** A named piece of the castle — used for labels, GM notes and the result. */
export interface CastleRoom {
  name: string;
  /** Centre, in grid cells. */
  x: number;
  y: number;
  kind: 'ward' | 'keep' | 'building' | 'tower' | 'gate' | 'water';
  /** Roughly how big, in cells — labels size themselves off this. */
  span: number;
}

export interface CastleResult {
  doc: MapDocument;
  grid: CellGrid;
  rooms: CastleRoom[];
  walls: Wall[];
  /** Wall/door/window/light tallies, which is what a GM checks after importing. */
  counts: { walls: number; doors: number; windows: number; lights: number };
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

const GROUND = 0;
const DITCH = 1;
const MOAT = 2;
const SEA = 3;
const COURT = 4;
const WALK = 5;
const MASONRY = 6;
const TIMBER = 7;
const EARTH = 8;
const FLOOR = 9;
const MOTTE = 10;
const RUBBLE = 11;
const DECK = 12;
const GLACIS = 13;

/**
 * What a token cannot walk through.
 *
 * A water moat is deliberately *not* in here. Fencing it off would give the
 * defenders on the wall a sight-blocking barrier between them and the only
 * ground an attacker can approach over, which is precisely backwards; a moat is
 * an obstacle the GM adjudicates, not a wall. The sea in a coastal plan is
 * different — that edge is a cliff, and a cliff really does stop you.
 */
const SOLID = new Set([MASONRY, TIMBER, EARTH, SEA]);
const isSolid = (m: number) => SOLID.has(m);

/** Sub-cells per tactical cell. See the file header for why this exists. */
const SUB = 8;

interface SubGrid {
  /** Sub-cell counts. */
  cols: number;
  rows: number;
  /** Tactical cells across the map. */
  cellCols: number;
  cellRows: number;
  mat: Uint8Array;
}

function makeSubGrid(cellCols: number, cellRows: number): SubGrid {
  const cols = cellCols * SUB, rows = cellRows * SUB;
  return { cols, rows, cellCols, cellRows, mat: new Uint8Array(cols * rows) };
}

const sIdx = (g: SubGrid, x: number, y: number) => y * g.cols + x;
const sIn = (g: SubGrid, x: number, y: number) => x >= 0 && y >= 0 && x < g.cols && y < g.rows;

/** Read a material at a point given in tactical cells. */
function matAt(g: SubGrid, cx: number, cy: number): number {
  const x = Math.floor(cx * SUB), y = Math.floor(cy * SUB);
  return sIn(g, x, y) ? g.mat[sIdx(g, x, y)] : GROUND;
}

function setAt(g: SubGrid, cx: number, cy: number, m: number): void {
  const x = Math.floor(cx * SUB), y = Math.floor(cy * SUB);
  if (sIn(g, x, y)) g.mat[sIdx(g, x, y)] = m;
}

/** Iterate the sub-cells covering a cell-space rectangle, in cell coordinates. */
function forRegion(
  g: SubGrid, x0: number, y0: number, x1: number, y1: number,
  fn: (i: number, cx: number, cy: number) => void,
): void {
  const sx0 = Math.max(0, Math.floor(x0 * SUB));
  const sy0 = Math.max(0, Math.floor(y0 * SUB));
  const sx1 = Math.min(g.cols - 1, Math.ceil(x1 * SUB));
  const sy1 = Math.min(g.rows - 1, Math.ceil(y1 * SUB));
  for (let sy = sy0; sy <= sy1; sy++) {
    for (let sx = sx0; sx <= sx1; sx++) {
      fn(sy * g.cols + sx, (sx + 0.5) / SUB, (sy + 0.5) / SUB);
    }
  }
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** Signed distance to a closed polygon; negative inside. */
function sdfPoly(poly: Vec2[], px: number, py: number): number {
  let min = Infinity;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j], b = poly[i];
    const abx = b.x - a.x, aby = b.y - a.y;
    const l2 = abx * abx + aby * aby || 1;
    let t = ((px - a.x) * abx + (py - a.y) * aby) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = px - (a.x + t * abx), dy = py - (a.y + t * aby);
    const d2 = dx * dx + dy * dy;
    if (d2 < min) min = d2;
    if ((a.y > py) !== (b.y > py) && px < a.x + ((py - a.y) / (b.y - a.y)) * (b.x - a.x)) inside = !inside;
  }
  return (inside ? -1 : 1) * Math.sqrt(min);
}

function polyBounds(poly: Vec2[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of poly) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  return { x0, y0, x1, y1 };
}

/** A circle, optionally wobbled by a few harmonics so it is not a compass circle. */
function circlePoly(cx: number, cy: number, r: number, rng: RNG, wobble = 0, n = 72): Vec2[] {
  const h = [rng.float(0, 6.28), rng.float(0, 6.28), rng.float(0, 6.28)];
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + wobble * (Math.cos(a * 2 + h[0]) * 0.5 + Math.cos(a * 3 + h[1]) * 0.32 + Math.cos(a * 5 + h[2]) * 0.18);
    out.push({ x: cx + Math.cos(a) * r * k, y: cy + Math.sin(a) * r * k });
  }
  return out;
}

/** A superellipse — the rectangular castle plan with rounded corners. */
function roundRectPoly(cx: number, cy: number, rx: number, ry: number, power = 4, n = 96): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    const k = Math.pow(Math.pow(Math.abs(c), power) + Math.pow(Math.abs(s), power), -1 / power);
    out.push({ x: cx + c * k * rx, y: cy + s * k * ry });
  }
  return out;
}

/** The lobed outline of a bailey — a bean, not a disc. */
function kidneyPoly(cx: number, cy: number, r: number, lobeAngle: number, n = 72): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + 0.22 * Math.cos(a - lobeAngle) - 0.26 * Math.cos(2 * (a - lobeAngle));
    out.push({ x: cx + Math.cos(a) * r * k, y: cy + Math.sin(a) * r * k * 0.86 });
  }
  return out;
}

/**
 * A bastioned trace.
 *
 * Each vertex of the base polygon is replaced by an arrowhead: two faces
 * meeting at the salient, two flanks folding back to the curtain. The flanks
 * are what makes it a star fort rather than a spiky circle — they are the
 * surfaces that shoot along the face of the neighbouring bastion.
 */
function starFortPoly(cx: number, cy: number, r: number, sides: number): Vec2[] {
  const out: Vec2[] = [];
  const step = (Math.PI * 2) / sides;
  const half = step * 0.30;
  const pt = (a: number, rr: number): Vec2 => ({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
  for (let i = 0; i < sides; i++) {
    const a = i * step - Math.PI / 2;
    out.push(pt(a - half, r));
    out.push(pt(a - half * 0.72, r * 1.13));   // shoulder
    out.push(pt(a, r * 1.36));                 // salient
    out.push(pt(a + half * 0.72, r * 1.13));
    out.push(pt(a + half, r));
  }
  return out;
}

interface Sample { p: Vec2; n: Vec2; t: Vec2; s: number }

/** Walk a closed outline, emitting points with outward normals every `spacing`. */
function walkOutline(poly: Vec2[], spacing: number): Sample[] {
  const out: Sample[] = [];
  let carry = 0;
  let travelled = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const tx = dx / len, ty = dy / len;
    // Outward is whichever perpendicular leaves the polygon.
    let nx = -ty, ny = tx;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (sdfPoly(poly, mid.x + nx * 0.25, mid.y + ny * 0.25) < 0) { nx = -nx; ny = -ny; }
    for (let d = carry; d < len; d += spacing) {
      out.push({
        p: { x: a.x + tx * d, y: a.y + ty * d },
        n: { x: nx, y: ny },
        t: { x: tx, y: ty },
        s: travelled + d,
      });
    }
    carry = ((carry - len) % spacing + spacing) % spacing;
    travelled += len;
  }
  return out;
}

function perimeter(poly: Vec2[]): number {
  let L = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    L += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return L;
}

/** Point on the outline at a fraction of the perimeter, with its normal. */
function outlineAt(poly: Vec2[], frac: number): Sample {
  const L = perimeter(poly);
  const want = ((frac % 1) + 1) % 1 * L;
  let acc = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1e-6;
    if (acc + len >= want) {
      const d = want - acc;
      const tx = dx / len, ty = dy / len;
      let nx = -ty, ny = tx;
      const p = { x: a.x + tx * d, y: a.y + ty * d };
      if (sdfPoly(poly, p.x + nx * 0.25, p.y + ny * 0.25) < 0) { nx = -nx; ny = -ny; }
      return { p, n: { x: nx, y: ny }, t: { x: tx, y: ty }, s: want };
    }
    acc += len;
  }
  const a = poly[0];
  return { p: { x: a.x, y: a.y }, n: { x: 1, y: 0 }, t: { x: 0, y: 1 }, s: 0 };
}

// ---------------------------------------------------------------------------
// The plan under construction
// ---------------------------------------------------------------------------

type WardMaterial = 'stone' | 'timber' | 'earth';

interface Ward {
  name: string;
  outline: Vec2[];
  /** Wall thickness in cells, measured inward from the outline. */
  thickness: number;
  material: WardMaterial;
  /** Does the top of the wall carry a fighting platform? */
  walk: boolean;
  /** Parapet thickness on each side of the walk. */
  parapet: number;
  /** Fill the interior as courtyard (an outer ward around an inner one does). */
  fillInterior: boolean;
}

interface Tower {
  x: number;
  y: number;
  r: number;
  kind: 'round' | 'bastion' | 'gate';
  ruinedTop: boolean;
}

interface Prop {
  layer: 'defences' | 'buildings' | 'gates' | 'furnishings';
  asset: string;
  /** Cell-space centre. */
  x: number;
  y: number;
  /** Cell-space width; height comes from the asset unless `h` is given. */
  w: number;
  h?: number;
  rot?: number;
  name?: string;
  opacity?: number;
  seed?: number;
  shadow?: boolean;
}

interface Opening { a: Vec2; b: Vec2; kind: WallKind }

interface LightSpec {
  x: number; y: number;
  bright: number; dim: number;
  color: string;
  animation: LightSource['animation'];
  name: string;
  intensity?: number;
}

interface Build {
  o: CastleGenOptions;
  rng: RNG;
  g: SubGrid;
  cols: number;
  rows: number;
  wards: Ward[];
  towers: Tower[];
  doors: DoorSpec[];
  props: Prop[];
  lights: LightSpec[];
  rooms: CastleRoom[];
  notes: { x: number; y: number; title: string; body: string }[];
  /** Footprints already spoken for, so buildings do not sit on the gate road. */
  reserved: { x: number; y: number; w: number; h: number }[];
}

// ---------------------------------------------------------------------------
// Rasterising the plan
// ---------------------------------------------------------------------------

function solidFor(m: WardMaterial): number {
  return m === 'stone' ? MASONRY : m === 'timber' ? TIMBER : EARTH;
}

function stampWard(b: Build, w: Ward): void {
  const { g } = b;
  const solid = solidFor(w.material);
  const bb = polyBounds(w.outline);
  const pad = w.thickness + 1;
  forRegion(g, bb.x0 - pad, bb.y0 - pad, bb.x1 + pad, bb.y1 + pad, (i, cx, cy) => {
    const d = sdfPoly(w.outline, cx, cy);
    if (d > 0) return;
    if (d <= -w.thickness) {
      if (w.fillInterior && (g.mat[i] === GROUND || g.mat[i] === DITCH || g.mat[i] === GLACIS)) g.mat[i] = COURT;
      return;
    }
    if (!w.walk) { g.mat[i] = solid; return; }
    g.mat[i] = (d > -w.parapet || d < -(w.thickness - w.parapet)) ? solid : WALK;
  });
  b.wards.push(w);
}

/** A ring of ground outside a ward: moat, dry ditch or glacis. */
function stampApron(b: Build, poly: Vec2[], from: number, to: number, m: number): void {
  const { g } = b;
  const bb = polyBounds(poly);
  forRegion(g, bb.x0 - to - 1, bb.y0 - to - 1, bb.x1 + to + 1, bb.y1 + to + 1, (i, cx, cy) => {
    if (g.mat[i] !== GROUND && g.mat[i] !== GLACIS) return;
    const d = sdfPoly(poly, cx, cy);
    if (d > from && d <= to) g.mat[i] = m;
  });
}

function stampDisc(b: Build, cx: number, cy: number, r: number, m: number, over?: (cur: number) => boolean): void {
  const { g } = b;
  forRegion(g, cx - r - 0.5, cy - r - 0.5, cx + r + 0.5, cy + r + 0.5, (i, x, y) => {
    if (Math.hypot(x - cx, y - cy) > r) return;
    if (over && !over(g.mat[i])) return;
    g.mat[i] = m;
  });
}

function stampRect(b: Build, x0: number, y0: number, x1: number, y1: number, m: number, over?: (cur: number) => boolean): void {
  const { g } = b;
  forRegion(g, x0, y0, x1, y1, (i, x, y) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return;
    if (over && !over(g.mat[i])) return;
    g.mat[i] = m;
  });
}

/**
 * A mural tower.
 *
 * The whole disc goes to masonry first and only then is the core hollowed, so
 * the ring is complete even where the tower projects beyond the curtain — that
 * projection is the entire point of a tower and it must not leave a hole in the
 * defence. Wall walk that the disc swallowed is re-opened afterwards: a tower
 * you cannot walk into from the rampart is a bollard.
 */
function addTower(b: Build, x: number, y: number, r: number, wallT: number, kind: Tower['kind'], ruinedTop = false): void {
  const { g } = b;
  const was = new Map<number, number>();
  forRegion(g, x - r - 0.5, y - r - 0.5, x + r + 0.5, y + r + 0.5, (i, cx, cy) => {
    if (Math.hypot(cx - x, cy - y) > r) return;
    was.set(i, g.mat[i]);
    g.mat[i] = MASONRY;
  });
  forRegion(g, x - r - 0.5, y - r - 0.5, x + r + 0.5, y + r + 0.5, (i, cx, cy) => {
    const d = Math.hypot(cx - x, cy - y);
    if (d > r) return;
    if (d <= r - wallT) g.mat[i] = FLOOR;
    else if (was.get(i) === WALK) g.mat[i] = FLOOR;   // the doorway off the rampart
  });
  b.towers.push({ x, y, r, kind, ruinedTop });
}

interface GateSpec {
  ward: Ward;
  /** Fraction along the ward outline. */
  frac: number;
  width: number;
  kind: 'gate' | 'postern' | 'seagate';
  towers: boolean;
  bridge: boolean;
  name: string;
}

/**
 * Cut a gate passage and hang the ironmongery in it.
 *
 * Two barriers, not one: the portcullis drops at the outer face and the timber
 * gates close at the inner. That is how a gatehouse actually worked, and in a
 * VTT it is the difference between a gate the party can be trapped inside and a
 * single door they open once.
 */
function addGate(b: Build, spec: GateSpec): Vec2 {
  const { g, o } = b;
  const w = spec.ward;
  const s = outlineAt(w.outline, spec.frac);
  const half = spec.width / 2;
  const inner = w.thickness + 1.2;

  const step = 0.5 / SUB;
  for (let d = -inner; d <= 1.6; d += step) {
    for (let u = -half + 0.03; u <= half - 0.03; u += step) {
      const px = s.p.x + s.n.x * d + s.t.x * u;
      const py = s.p.y + s.n.y * d + s.t.y * u;
      const cur = matAt(g, px, py);
      if (cur === SEA) continue;
      setAt(g, px, py, d > 0.15 ? (cur === MOAT || cur === DITCH ? DECK : cur) : COURT);
    }
  }

  const across = (d: number): [Vec2, Vec2] => ([
    { x: s.p.x + s.n.x * d - s.t.x * half, y: s.p.y + s.n.y * d - s.t.y * half },
    { x: s.p.x + s.n.x * d + s.t.x * half, y: s.p.y + s.n.y * d + s.t.y * half },
  ]);

  const [pa, pb] = across(-0.35);
  b.doors.push(freeDoor(pa, pb, 'door', 'locked'));
  if (spec.kind === 'gate') {
    const [qa, qb] = across(-w.thickness - 0.4);
    b.doors.push(freeDoor(qa, qb, 'door', 'closed'));
  }

  const angle = (Math.atan2(s.n.y, s.n.x) * 180) / Math.PI + 90;
  // A twin-drum gatehouse, built rather than stamped. The `str/gatehouse` asset
  // draws its own pair of towers at its own scale, which never lines up with the
  // ones the plan actually carves — so the drums here are real geometry with the
  // ordinary tower art on top, and the wall walk still runs through them.
  if (spec.towers && spec.kind === 'gate') {
    const tr = Math.max(1.9, spec.width * 0.95);
    for (const side of [-1, 1]) {
      const tx = s.p.x + s.t.x * (half + tr * 0.72) * side - s.n.x * (w.thickness * 0.30);
      const ty = s.p.y + s.t.y * (half + tr * 0.72) * side - s.n.y * (w.thickness * 0.30);
      addTower(b, tx, ty, tr, Math.min(1.25, tr * 0.42), 'gate');
    }
  }

  b.props.push({
    layer: 'gates', asset: 'dgn/portcullis', x: s.p.x - s.n.x * 0.35, y: s.p.y - s.n.y * 0.35,
    w: spec.width * 1.04, h: 0.7, rot: angle, name: `${spec.name} portcullis`,
  });
  if (spec.kind === 'gate') {
    b.props.push({
      layer: 'gates', asset: 'dgn/double-door',
      x: s.p.x - s.n.x * (w.thickness + 0.4), y: s.p.y - s.n.y * (w.thickness + 0.4),
      w: spec.width * 1.02, h: 0.8, rot: angle, name: `${spec.name} gates`,
    });
  }

  if (spec.bridge && o.moat) {
    // No bridge decal: the drawn asset carries its own strip of water, which is
    // wrong over a dry ditch and redundant over a wet one. A planked deck with
    // an inked edge laid across the gap is a bridge.
    const span = o.moatWidth + 2.2;
    for (let d = 0; d <= span; d += 0.5 / SUB) {
      for (let u = -half; u <= half; u += 0.5 / SUB) {
        const px = s.p.x + s.n.x * d + s.t.x * u, py = s.p.y + s.n.y * d + s.t.y * u;
        const cur = matAt(g, px, py);
        if (cur === MOAT || cur === DITCH) setAt(g, px, py, DECK);
      }
    }
  }

  b.rooms.push({ name: spec.name, x: s.p.x - s.n.x * 2.2, y: s.p.y - s.n.y * 2.2, kind: 'gate', span: spec.width + 3 });
  return s.p;
}

function freeDoor(a: Vec2, b: Vec2, kind: DoorSpec['kind'], state: DoorSpec['state']): DoorSpec {
  return {
    key: `open:${a.x.toFixed(3)},${a.y.toFixed(3)},${b.x.toFixed(3)},${b.y.toFixed(3)}`,
    kind, state,
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    horizontal: Math.abs(b.x - a.x) >= Math.abs(b.y - a.y),
  };
}

// ---------------------------------------------------------------------------
// Courtyard buildings
// ---------------------------------------------------------------------------

interface BuildingSpec {
  asset: string;
  name: string;
  /** Footprint in cells, long axis first. */
  w: number;
  h: number;
  /** Lit at night by something the garrison keeps burning. */
  fire?: boolean;
}

const COURT_BUILDINGS: BuildingSpec[] = [
  { asset: 'str/manor-td', name: 'Great Hall', w: 9, h: 6, fire: true },
  { asset: 'str/longhouse-td', name: 'Barracks', w: 9, h: 4 },
  { asset: 'str/stable-td', name: 'Stables', w: 8, h: 4 },
  { asset: 'str/chapel-td', name: 'Chapel', w: 6, h: 4 },
  { asset: 'str/smithy-td', name: 'Smithy', w: 5, h: 4, fire: true },
  { asset: 'str/cottage-td', name: 'Kitchen', w: 5, h: 4, fire: true },
  { asset: 'str/granary-td', name: 'Granary', w: 4, h: 4 },
  { asset: 'str/warehouse-td', name: 'Storehouse', w: 7, h: 4 },
];

interface Placed { x: number; y: number; w: number; h: number }

/**
 * Fit buildings into a ward, backs to the curtain.
 *
 * A castle bailey is not a field with sheds in it: everything that can be built
 * against the inside of the wall is, because the wall is one free side and the
 * middle of the yard has to stay clear for horses, musters and the well. So the
 * scoring is simply "does the back of this range touch masonry", and only when
 * nothing does is a free-standing position accepted.
 *
 * Each building is carved into the grid as a room with one door, and *then* the
 * roofed stamp is laid over it. The picture shows roofs, the wall set describes
 * rooms — and a GM who switches the Buildings layer off gets the floor plan.
 */
function placeBuildings(b: Build, ward: Ward, wanted: BuildingSpec[], max = 99, wallT = 0.4): void {
  const { g, rng } = b;
  const bb = polyBounds(ward.outline);
  const x0 = Math.max(1, Math.floor(bb.x0)), y0 = Math.max(1, Math.floor(bb.y0));
  const x1 = Math.min(b.cols - 2, Math.ceil(bb.x1)), y1 = Math.min(b.rows - 2, Math.ceil(bb.y1));
  const W = x1 - x0 + 1, H = y1 - y0 + 1;
  if (W < 4 || H < 4) return;

  // Cell-resolution view of the yard, plus how far each cell is from anything
  // that is not yard. Distance 1 means "against a wall".
  const yard = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // Courtyard, and inside *this* ward: an inner bailey's bounding box also
      // covers the outer ward's yard, and a hall parked in the killing ground is
      // the one thing that plan exists to prevent.
      if (sdfPoly(ward.outline, x0 + x + 0.5, y0 + y + 0.5) > -ward.thickness - 0.4) { yard[y * W + x] = 0; continue; }
      let ok = 0;
      for (let sy = 0; sy < SUB; sy += 2) {
        for (let sx = 0; sx < SUB; sx += 2) {
          if (matAt(g, x0 + x + (sx + 0.5) / SUB, y0 + y + (sy + 0.5) / SUB) === COURT) ok++;
        }
      }
      yard[y * W + x] = ok >= (SUB / 2) * (SUB / 2) - 1 ? 1 : 0;
    }
  }
  const dist = new Int16Array(W * H).fill(9999);
  const queue: number[] = [];
  for (let i = 0; i < yard.length; i++) if (!yard[i]) { dist[i] = 0; queue.push(i); }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head], x = i % W, y = (i / W) | 0;
    const d = dist[i] + 1;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (dist[j] <= d) continue;
      dist[j] = d;
      queue.push(j);
    }
  }

  const placed: Placed[] = b.reserved.map((r) => ({ ...r }));
  const clear = (rx: number, ry: number, rw: number, rh: number): boolean => {
    for (let y = ry; y < ry + rh; y++) {
      for (let x = rx; x < rx + rw; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) return false;
        if (!yard[y * W + x]) return false;
      }
    }
    const ax0 = x0 + rx - 1, ay0 = y0 + ry - 1, ax1 = x0 + rx + rw + 1, ay1 = y0 + ry + rh + 1;
    return !placed.some((p) => ax0 < p.x + p.w && ax1 > p.x && ay0 < p.y + p.h && ay1 > p.y);
  };

  let built = 0;
  for (const spec of wanted) {
    if (built >= max) break;
    let best: { x: number; y: number; w: number; h: number; rot: number; score: number } | null = null;
    for (const rot of [0, 90] as const) {
      const rw = rot === 0 ? spec.w : spec.h;
      const rh = rot === 0 ? spec.h : spec.w;
      for (let ry = 0; ry + rh <= H; ry++) {
        for (let rx = 0; rx + rw <= W; rx++) {
          if (!clear(rx, ry, rw, rh)) continue;
          let minD = 9999;
          for (let y = ry; y < ry + rh; y++) {
            for (let x = rx; x < rx + rw; x++) minD = Math.min(minD, dist[y * W + x]);
          }
          const score = Math.abs(minD - 1) * 4 + rng.float(0, 1);
          if (!best || score < best.score) best = { x: rx, y: ry, w: rw, h: rh, rot, score };
        }
      }
    }
    // Nothing fits: skip it and try the next, smaller, thing on the list. Taking
    // a fixed slice of the wish-list instead leaves a bailey empty whenever the
    // shuffle happens to deal three great halls into a courtyard that has room
    // for a granary.
    if (!best) continue;
    built++;
    placed.push({ x: x0 + best.x, y: y0 + best.y, w: best.w, h: best.h });
    carveBuilding(b, spec, x0 + best.x, y0 + best.y, best.w, best.h, best.rot, dist, x0, y0, W, H, wallT);
  }
}

function carveBuilding(
  b: Build, spec: BuildingSpec, gx: number, gy: number, w: number, h: number, rot: number,
  dist: Int16Array, ox: number, oy: number, W: number, H: number, wallT: number,
): void {
  const { rng } = b;
  stampRect(b, gx, gy, gx + w, gy + h, MASONRY);
  stampRect(b, gx + wallT, gy + wallT, gx + w - wallT, gy + h - wallT, FLOOR);

  // The door goes on whichever side has the most open yard in front of it —
  // a hall whose only door opens onto the curtain is a storeroom.
  type Side = 'n' | 's' | 'e' | 'w';
  const sides: { side: Side; open: number }[] = [
    { side: 'n' as Side, open: sample(dist, ox, oy, W, H, gx + w / 2, gy - 1.5) },
    { side: 's' as Side, open: sample(dist, ox, oy, W, H, gx + w / 2, gy + h + 1.5) },
    { side: 'w' as Side, open: sample(dist, ox, oy, W, H, gx - 1.5, gy + h / 2) },
    { side: 'e' as Side, open: sample(dist, ox, oy, W, H, gx + w + 1.5, gy + h / 2) },
  ].sort((p, q) => q.open - p.open);
  const side = sides[0].side;
  const dw = 1.1;
  let a: Vec2, c: Vec2;
  if (side === 'n' || side === 's') {
    const dx = gx + w / 2;
    const dy = side === 'n' ? gy : gy + h;
    stampRect(b, dx - dw / 2, dy - wallT - 0.05, dx + dw / 2, dy + wallT + 0.05, FLOOR);
    a = { x: dx - dw / 2, y: dy }; c = { x: dx + dw / 2, y: dy };
  } else {
    const dy = gy + h / 2;
    const dx = side === 'w' ? gx : gx + w;
    stampRect(b, dx - wallT - 0.05, dy - dw / 2, dx + wallT + 0.05, dy + dw / 2, FLOOR);
    a = { x: dx, y: dy - dw / 2 }; c = { x: dx, y: dy + dw / 2 };
  }
  b.doors.push(freeDoor(a, c, 'door', rng.bool(0.15) ? 'locked' : 'closed'));

  const cx = gx + w / 2, cy = gy + h / 2;
  const ruinIt = b.rng.next() < b.o.ruined * 0.75;
  b.props.push({
    layer: 'buildings',
    asset: ruinIt ? 'str/ruin-shell-td' : spec.asset,
    x: cx, y: cy,
    w: rot === 0 ? w : h,
    h: rot === 0 ? h : w,
    rot, name: ruinIt ? `${spec.name} (ruined)` : spec.name,
    shadow: true,
  });
  if (ruinIt) {
    // A roofless range is also a breached one: take a bite out of a wall so the
    // VTT agrees with the picture.
    const s = outlineAt([
      { x: gx, y: gy }, { x: gx + w, y: gy }, { x: gx + w, y: gy + h }, { x: gx, y: gy + h },
    ], b.rng.next());
    stampDisc(b, s.p.x, s.p.y, b.rng.float(0.8, 1.5), RUBBLE, (m) => m === MASONRY || m === FLOOR);
  }
  b.rooms.push({ name: spec.name, x: cx, y: cy, kind: 'building', span: Math.max(w, h) });
  if (spec.fire && !ruinIt) {
    b.lights.push({
      x: cx, y: cy, bright: 15, dim: 30, color: '#ffb066', animation: 'flame',
      name: `${spec.name} hearth`, intensity: 0.7,
    });
  }
}

function sample(dist: Int16Array, ox: number, oy: number, W: number, H: number, x: number, y: number): number {
  const ix = Math.round(x - ox), iy = Math.round(y - oy);
  if (ix < 0 || iy < 0 || ix >= W || iy >= H) return 0;
  return dist[iy * W + ix];
}

// ---------------------------------------------------------------------------
// Keep
// ---------------------------------------------------------------------------

/**
 * The donjon.
 *
 * Its door is on the first floor, reached by a stair inside a forebuilding
 * bolted to one side — that is the single most characteristic thing about a
 * Norman keep and the reason storming one was so unattractive. On a top-down
 * map that becomes two doors in series with a stair between them, which is
 * exactly how it plays: you have to take the forebuilding first.
 */
function addKeep(b: Build, cx: number, cy: number, w: number, h: number, round: boolean, name: string): void {
  const wallT = round ? 1.3 : 1.1;
  if (round) {
    const r = Math.min(w, h) / 2;
    stampDisc(b, cx, cy, r, MASONRY);
    stampDisc(b, cx, cy, r - wallT, FLOOR);
  } else {
    stampRect(b, cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2, MASONRY);
    stampRect(b, cx - w / 2 + wallT, cy - h / 2 + wallT, cx + w / 2 - wallT, cy + h / 2 - wallT, FLOOR);
    // Corner turrets: the silhouette that says "keep" rather than "big shed".
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const tx = cx + sx * (w / 2 - 0.25), ty = cy + sy * (h / 2 - 0.25);
        stampDisc(b, tx, ty, 1.5, MASONRY);
        stampDisc(b, tx, ty, 0.75, FLOOR);
        b.props.push({ layer: 'defences', asset: 'str/round-tower', x: tx, y: ty, w: 3.4, name: 'Keep turret' });
        b.lights.push({ x: tx, y: ty, bright: 20, dim: 40, color: '#ffae5c', animation: 'torch', name: 'Turret brazier' });
      }
    }
  }

  // Forebuilding on the courtyard side, carrying the stair to the first floor.
  const fw = 3.2, fh = 4.4;
  const fx = cx, fy = cy + (round ? Math.min(w, h) / 2 : h / 2) + fh / 2 - 0.9;
  stampRect(b, fx - fw / 2, fy - fh / 2, fx + fw / 2, fy + fh / 2, MASONRY);
  stampRect(b, fx - fw / 2 + 0.55, fy - fh / 2 + 0.55, fx + fw / 2 - 0.55, fy + fh / 2 - 0.55, FLOOR);
  stampRect(b, fx - 0.6, fy + fh / 2 - 0.7, fx + 0.6, fy + fh / 2 + 0.1, FLOOR);
  b.doors.push(freeDoor({ x: fx - 0.6, y: fy + fh / 2 }, { x: fx + 0.6, y: fy + fh / 2 }, 'door', 'closed'));
  // …and the first-floor door at the head of the stair.
  const inner = fy - fh / 2;
  stampRect(b, fx - 0.6, inner - 0.8, fx + 0.6, inner + 0.6, FLOOR);
  b.doors.push(freeDoor({ x: fx - 0.6, y: inner - 0.4 }, { x: fx + 0.6, y: inner - 0.4 }, 'door', 'locked'));
  b.props.push({ layer: 'gates', asset: 'dgn/stairs', x: fx, y: fy + 0.2, w: 1.7, h: 2.6, rot: 180, name: 'Stair to the keep door' });

  b.props.push({
    layer: 'buildings', asset: round ? 'str/tower-footprint-td' : 'str/manor-td',
    x: cx, y: cy, w, h, name, shadow: true, opacity: 0.94,
  });
  b.rooms.push({ name, x: cx, y: cy, kind: 'keep', span: Math.max(w, h) });
  b.notes.push({
    x: cx, y: cy, title: name,
    body: 'The keep is entered at first-floor level through the forebuilding stair; the ground floor is a storage undercroft with no outside door.',
  });
  b.lights.push({ x: fx, y: fy, bright: 10, dim: 20, color: '#ffcf8a', animation: 'torch', name: 'Forebuilding lantern' });
}

// ---------------------------------------------------------------------------
// Mural towers
// ---------------------------------------------------------------------------

/**
 * Towers at the corners, then at intervals along whatever is left.
 *
 * Spacing them evenly around the whole circuit is the wrong answer: a corner is
 * where the wall is weakest and where a tower flanks two faces at once, so the
 * corners are claimed first and only the long straight runs between them are
 * subdivided.
 */
function addMuralTowers(b: Build, ward: Ward, spacing: number, radius: number, phase = 0): void {
  const samples = walkOutline(ward.outline, 0.4);
  const n = samples.length;
  if (n < 8) return;
  const L = perimeter(ward.outline);
  // Measure the turn over a window two and a half cells long. Anything shorter
  // just measures the polygon's own faceting and every vertex reads as a corner.
  const k = Math.max(3, Math.round(2.5 / 0.4));
  const minSep = Math.max(4.5, spacing * 0.85);

  const turn = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = samples[(i - k + n) % n].t, c = samples[(i + k) % n].t;
    turn[i] = Math.abs(Math.atan2(a.x * c.y - a.y * c.x, a.x * c.x + a.y * c.y));
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((p, q) => turn[q] - turn[p]);
  const around = (a: number, c: number) => Math.min(Math.abs(a - c), L - Math.abs(a - c));
  const sites: number[] = [];
  for (const i of order) {
    if (turn[i] < 0.75) break;
    if (sites.some((s) => around(s, samples[i].s) < minSep)) continue;
    sites.push(samples[i].s);
  }
  sites.sort((p, q) => p - q);
  if (!sites.length) sites.push(((phase % 1) + 1) % 1 * L);

  const filled: number[] = [];
  for (let i = 0; i < sites.length; i++) {
    const a = sites[i], nx = i + 1 < sites.length ? sites[i + 1] : sites[0] + L;
    filled.push(a);
    const gap = nx - a;
    const extra = Math.floor(gap / spacing);
    for (let j = 1; j <= extra; j++) filled.push((a + (gap * j) / (extra + 1)) % L);
  }
  filled.sort((p, q) => p - q);

  const wallT = Math.max(0.9, ward.thickness * 0.42);
  const kept: number[] = [];
  for (const s of filled) {
    if (kept.some((c) => around(s, c) < minSep * 0.92)) continue;
    kept.push(s);
  }
  for (const s of kept) {
    const smp = outlineAt(ward.outline, s / L);
    const x = smp.p.x - smp.n.x * ward.thickness * 0.34;
    const y = smp.p.y - smp.n.y * ward.thickness * 0.34;
    if (matAt(b.g, x, y) === SEA || matAt(b.g, x, y) === GROUND) continue;
    if (b.towers.some((t) => Math.hypot(t.x - x, t.y - y) < (t.r + radius) * 0.85)) continue;
    const ruinedTop = b.rng.next() < b.o.ruined * 0.55;
    addTower(b, x, y, radius, wallT, 'round', ruinedTop);
  }
}

// ---------------------------------------------------------------------------
// Ruin
// ---------------------------------------------------------------------------

/**
 * Break the castle, wall set included.
 *
 * A ruin drawn as a picture of a ruin over an intact wall set is worse than no
 * ruin at all: the players see a breach and the VTT refuses to let them walk
 * through it. So a collapse is a change to the grid — the masonry becomes
 * rubble, rubble is walkable, and the traced walls come out with the hole
 * already in them.
 */
function applyRuin(b: Build): void {
  const { o, rng, g } = b;
  if (o.ruined <= 0.001) return;

  for (const ward of b.wards) {
    const L = perimeter(ward.outline);
    const breaches = Math.round(o.ruined * (L / 22) + (o.ruined > 0.15 ? 1 : 0));
    for (let i = 0, tries = 0; i < breaches && tries < breaches * 30; tries++) {
      const s = outlineAt(ward.outline, rng.next());
      if (b.towers.some((t) => Math.hypot(t.x - s.p.x, t.y - s.p.y) < t.r + 1.4)) continue;
      if (b.doors.some((d) => Math.hypot(d.x - s.p.x, d.y - s.p.y) < 3.2)) continue;
      i++;
      const half = rng.float(1.2, 1.4 + o.ruined * 2.6);
      const step = 0.5 / SUB;
      for (let u = -half; u <= half; u += step) {
        // Taper the ends so the breach reads as a collapse, not a doorway.
        const bite = ward.thickness + 1.2 - Math.pow(Math.abs(u) / half, 2.2) * (ward.thickness * 0.35);
        for (let d = -bite; d <= 0.9; d += step) {
          const px = s.p.x + s.n.x * d + s.t.x * u, py = s.p.y + s.n.y * d + s.t.y * u;
          const m = matAt(g, px, py);
          if (m === MASONRY || m === TIMBER || m === EARTH || m === WALK) setAt(g, px, py, RUBBLE);
        }
      }
      b.props.push({
        layer: 'furnishings', asset: 'dgn/rubble',
        x: s.p.x - s.n.x * ward.thickness * 0.4, y: s.p.y - s.n.y * ward.thickness * 0.4,
        w: half * 1.5, rot: rng.float(0, 360), opacity: 0.9, name: 'Collapsed curtain',
      });
      b.rooms.push({ name: 'Breach', x: s.p.x, y: s.p.y, kind: 'ward', span: half * 2 });
      b.notes.push({
        x: s.p.x, y: s.p.y, title: 'Breach in the curtain',
        body: 'The wall has come down here. Rubble slope, difficult terrain, no cover — but it is a way in.',
      });
    }
  }

  for (const t of b.towers) {
    if (!t.ruinedTop) continue;
    const s = rng.float(0, Math.PI * 2);
    const px = t.x + Math.cos(s) * t.r * 0.85, py = t.y + Math.sin(s) * t.r * 0.85;
    stampDisc(b, px, py, t.r * rng.float(0.4, 0.7), RUBBLE, (m) => m === MASONRY || m === FLOOR);
  }

  // Fallen stone and weeds across the yards.
  const scatter = Math.round(o.ruined * 60);
  for (let i = 0; i < scatter; i++) {
    const x = rng.float(1, b.cols - 1), y = rng.float(1, b.rows - 1);
    const m = matAt(g, x, y);
    if (m !== COURT && m !== FLOOR && m !== WALK) continue;
    b.props.push({
      layer: 'furnishings', asset: rng.bool(0.7) ? 'dgn/rubble' : 'veg/bush',
      x, y, w: rng.float(0.7, 1.6), rot: rng.float(0, 360), opacity: rng.float(0.7, 0.95),
      name: 'Debris',
    });
  }
}

// ---------------------------------------------------------------------------
// Style plans
// ---------------------------------------------------------------------------

/** Fraction along an outline nearest a given point — where a road would meet it. */
function fracToward(poly: Vec2[], target: Vec2): number {
  const L = perimeter(poly);
  let best = 0, bestD = Infinity;
  for (const s of walkOutline(poly, 0.4)) {
    const d = Math.hypot(s.p.x - target.x, s.p.y - target.y);
    if (d < bestD) { bestD = d; best = s.s; }
  }
  return best / L;
}

/** A ring of lean-to ranges built against the inside of a shell keep's wall. */
function addLeanTos(b: Build, cx: number, cy: number, rInner: number, depth: number): void {
  const rFront = rInner - depth;
  const bays = Math.max(5, Math.round((Math.PI * 2 * (rFront + depth / 2)) / 4.4));
  stampDisc(b, cx, cy, rInner, FLOOR, (m) => m === COURT);
  stampDisc(b, cx, cy, rFront, MASONRY, (m) => m === FLOOR);
  stampDisc(b, cx, cy, rFront - 0.85, COURT, (m) => m === MASONRY);

  for (let i = 0; i < bays; i++) {
    const a = (i / bays) * Math.PI * 2;
    // Party wall between neighbouring ranges.
    for (let r = rFront - 0.6; r <= rInner + 0.2; r += 0.5 / SUB) {
      for (let w = -0.42; w <= 0.42; w += 0.5 / SUB) {
        const px = cx + Math.cos(a) * r - Math.sin(a) * w;
        const py = cy + Math.sin(a) * r + Math.cos(a) * w;
        if (matAt(b.g, px, py) === FLOOR) setAt(b.g, px, py, MASONRY);
      }
    }
    // Door onto the yard, in the middle of the bay.
    const am = ((i + 0.5) / bays) * Math.PI * 2;
    const dr = rFront - 0.3;
    for (let r = rFront - 0.75; r <= rFront + 0.3; r += 0.5 / SUB) {
      for (let w = -0.55; w <= 0.55; w += 0.5 / SUB) {
        const px = cx + Math.cos(am) * r - Math.sin(am) * w;
        const py = cy + Math.sin(am) * r + Math.cos(am) * w;
        setAt(b.g, px, py, FLOOR);
      }
    }
    b.doors.push(freeDoor(
      { x: cx + Math.cos(am) * dr + Math.sin(am) * 0.55, y: cy + Math.sin(am) * dr - Math.cos(am) * 0.55 },
      { x: cx + Math.cos(am) * dr - Math.sin(am) * 0.55, y: cy + Math.sin(am) * dr + Math.cos(am) * 0.55 },
      'door', 'closed',
    ));
  }
  b.rooms.push({ name: 'Lean-to Ranges', x: cx, y: cy - (rInner - depth / 2), kind: 'building', span: depth * 2 });
}

function addRoundhouse(b: Build, x: number, y: number, r: number, name: string): void {
  stampDisc(b, x, y, r, TIMBER);
  stampDisc(b, x, y, r - 0.5, FLOOR);
  const a = b.rng.float(0, Math.PI * 2);
  const dx = x + Math.cos(a) * (r - 0.25), dy = y + Math.sin(a) * (r - 0.25);
  stampDisc(b, dx, dy, 0.55, FLOOR);
  b.doors.push(freeDoor(
    { x: dx - Math.sin(a) * 0.55, y: dy + Math.cos(a) * 0.55 },
    { x: dx + Math.sin(a) * 0.55, y: dy - Math.cos(a) * 0.55 },
    'door', 'open',
  ));
  b.props.push({ layer: 'buildings', asset: 'str/cottage-td', x, y, w: r * 2.05, h: r * 2.05, rot: b.rng.float(0, 360), name, shadow: true });
  if (name !== 'Roundhouse') b.rooms.push({ name, x, y, kind: 'building', span: r * 2 });
  b.lights.push({ x, y, bright: 8, dim: 18, color: '#ffb066', animation: 'flame', name: 'Hearth', intensity: 0.6 });
}

/** Crenellation, palisade or turf revetment laid along the crest of a ward. */
function dressCrest(b: Build, w: Ward): void {
  const seg = w.material === 'stone' ? 2.6 : w.material === 'timber' ? 2.4 : 3.2;
  const asset = w.material === 'stone' ? 'str/wall-segment' : w.material === 'timber' ? 'str/palisade' : 'str/rampart';
  const band = w.walk ? w.parapet : w.thickness;
  // Each asset carries its crest at a different fraction of its own height;
  // these put the drawn battlement on the drawn wall rather than beside it.
  // Stone and timber crests are cropped bands and can be stretched to fit the
  // wall; the earthwork asset is a long shallow strip and stretching it to the
  // width of a rampart turns each segment into a slab. That one is drawn at its
  // own proportions instead, as a crest line running along the bank.
  const bandToHeight = w.material === 'stone' ? 2.5 : w.material === 'timber' ? 2.3 : 0;
  for (const s of walkOutline(w.outline, seg)) {
    // A ruin loses its merlons before it loses its wall.
    if (b.rng.next() < b.o.ruined * 0.8) continue;
    const inset = band * 0.5;
    const x = s.p.x - s.n.x * inset, y = s.p.y - s.n.y * inset;
    // Both ends as well as the middle, or a segment laid across the salient of a
    // bastion sticks out into the ditch like a plank.
    let onWall = true;
    for (const t of [-0.5, 0, 0.5]) {
      const m = matAt(b.g, x + s.t.x * seg * t, y + s.t.y * seg * t);
      if (m !== MASONRY && m !== TIMBER && m !== EARTH) { onWall = false; break; }
    }
    if (!onWall) continue;
    b.props.push({
      layer: 'defences', asset,
      x, y, w: seg * 1.08, h: bandToHeight ? band * bandToHeight : (seg * 1.08) / 3,
      rot: (Math.atan2(s.t.y, s.t.x) * 180) / Math.PI,
      opacity: w.material === 'earth' ? 0.75 : 0.95, name: 'Battlements',
    });
  }
}

function planConcentric(b: Build, cx: number, cy: number, R: number): void {
  const { o, rng } = b;
  const twoRings = o.baileys >= 2;
  // A concentric plan spends most of its ground on the rings themselves, so it
  // is drawn a little larger than the other styles at the same `size`.
  const outerR = R * (twoRings ? 1.30 : 1.05);

  const outer: Ward = {
    name: twoRings ? 'Outer Ward' : 'Bailey',
    outline: roundRectPoly(cx, cy, outerR * 1.14, outerR * 0.96, 4.2),
    thickness: 3.8, material: 'stone', walk: true, parapet: 0.95, fillInterior: true,
  };
  stampWard(b, outer);
  if (o.moat) stampApron(b, outer.outline, 0.4, 0.4 + o.moatWidth, MOAT);

  let inner: Ward | null = null;
  if (twoRings) {
    inner = {
      name: 'Inner Ward',
      outline: roundRectPoly(cx, cy + outerR * 0.02, outerR * 0.72, outerR * 0.60, 2.4),
      thickness: 3.8, material: 'stone', walk: true, parapet: 0.95, fillInterior: true,
    };
    stampWard(b, inner);
  }

  addGate(b, { ward: outer, frac: 0.26, width: 2.4, kind: 'gate', towers: true, bridge: true, name: 'Great Gatehouse' });
  addGate(b, { ward: outer, frac: 0.74, width: 1.2, kind: 'postern', towers: false, bridge: false, name: 'Postern' });
  if (inner) addGate(b, { ward: inner, frac: 0.62, width: 2.2, kind: 'gate', towers: true, bridge: false, name: 'Inner Gate' });

  addMuralTowers(b, outer, o.towerSpacing, 2.1);
  // Half a bay out of step with the outer ring, so no attacker on the outer
  // wall walk is ever directly under an inner tower's shadow — and so the inner
  // towers look down into the gaps between the outer ones.
  if (inner) addMuralTowers(b, inner, o.towerSpacing * 0.8, 2.5, 0.5);

  // Size the donjon off the ward it actually stands in, not off the map: a keep
  // that overlaps the inner curtain is worse than a small one.
  const host = inner || outer;
  const hb = polyBounds(host.outline);
  const freeW = (hb.x1 - hb.x0) / 2 - host.thickness - 0.8;
  const freeH = (hb.y1 - hb.y0) / 2 - host.thickness - 0.8;
  const keepW = Math.max(4.5, Math.min(9, freeW * 0.62));
  const keepH = Math.max(4, Math.min(7, freeH * 0.45));
  // Centre the keep *and its forebuilding* in the ward, not the keep alone, or
  // the stair block ends up jammed against the far wall with the yard all at
  // one end.
  const keepY = cy - (4.4 - 0.9) / 2;
  addKeep(b, cx, keepY, keepW, keepH, false, 'The Donjon');
  // A one-cell margin around the keep and its forebuilding, no more: this is a
  // keep-out box, and one sized to the whole ward leaves nowhere to build.
  b.reserved.push({ x: cx - keepW / 2 - 1, y: keepY - keepH / 2 - 1, w: keepW + 2, h: keepH + 6.4 });

  if (o.courtyardBuildings) {
    const list = rng.shuffle(COURT_BUILDINGS.slice());
    if (inner) {
      // Nothing is built in the outer ring on purpose — see the note below.
      placeBuildings(b, inner, list, 4);
    } else {
      placeBuildings(b, outer, list);
    }
  }

  b.rooms.push({ name: outer.name, x: cx, y: cy + outerR * 0.74, kind: 'ward', span: outerR });
  if (inner) {
    b.rooms.push({ name: 'Killing Ground', x: cx - outerR * 0.80, y: cy, kind: 'ward', span: outerR * 0.5 });
    b.notes.push({
      x: cx - outerR * 0.82, y: cy, title: 'Killing ground',
      body: 'Between the rings. Nothing is built here on purpose: anyone who takes the outer wall is left in the open, overlooked from a wall that is higher than the one they just climbed.',
    });
  }
}

function planShellKeep(b: Build, cx: number, cy: number, R: number): void {
  const { o, rng } = b;
  const rr = R * 0.80;
  const ward: Ward = {
    name: 'Shell Keep',
    outline: circlePoly(cx, cy, rr, rng, 0.025),
    thickness: 3.8, material: 'stone', walk: true, parapet: 0.95, fillInterior: true,
  };
  stampWard(b, ward);
  if (o.moat) stampApron(b, ward.outline, 0.4, 0.4 + o.moatWidth, MOAT);

  addGate(b, { ward, frac: 0.26, width: 2.2, kind: 'gate', towers: true, bridge: true, name: 'Gate Tower' });
  addGate(b, { ward, frac: 0.76, width: 1.1, kind: 'postern', towers: false, bridge: false, name: 'Postern' });
  addMuralTowers(b, ward, Math.max(o.towerSpacing * 1.8, perimeter(ward.outline) / 3), 2.2);

  if (o.courtyardBuildings) addLeanTos(b, cx, cy, rr - ward.thickness, Math.min(3.4, rr * 0.30));

  b.props.push({ layer: 'furnishings', asset: 'dgn/well', x: cx, y: cy, w: 1.6, name: 'Well' });
  b.rooms.push({ name: 'Well', x: cx, y: cy, kind: 'building', span: 2 });
  b.rooms.push({ name: ward.name, x: cx, y: cy - rr * 0.55, kind: 'ward', span: rr });
  b.notes.push({
    x: cx, y: cy, title: 'The shell',
    body: 'There is no separate keep — the curtain is the keep. Everything the garrison needs is built against the inside of it, and the yard in the middle is barely thirty feet across.',
  });
}

function planMotteBailey(b: Build, cx: number, cy: number, R: number): void {
  const { o, rng } = b;
  const mx = cx + R * 0.72, my = cy - R * 0.30;
  const mR = R * 0.56;
  const bxc = cx - R * 0.40, byc = cy + R * 0.18;
  const bR = R * 0.86;

  // Bailey first, so the motte and its ditch cut across it where they meet.
  const bailey: Ward = {
    name: 'Bailey',
    outline: kidneyPoly(bxc, byc, bR, Math.atan2(my - byc, mx - bxc) + Math.PI),
    thickness: 1.5, material: 'timber', walk: false, parapet: 0.5, fillInterior: true,
  };
  stampWard(b, bailey);
  stampApron(b, bailey.outline, 0.3, 0.3 + Math.max(1.6, o.moatWidth), DITCH);

  // The motte: a raised mound with its own palisade and a tower on top.
  stampDisc(b, mx, my, mR, MOTTE);
  const mottePal: Ward = {
    name: 'Motte',
    outline: circlePoly(mx, my, mR * 0.82, rng, 0.03),
    thickness: 1.3, material: 'timber', walk: false, parapet: 0.45, fillInterior: false,
  };
  stampWard(b, mottePal);
  stampApron(b, circlePoly(mx, my, mR, rng, 0.02, 64), 0.1, 0.1 + Math.max(1.8, o.moatWidth), DITCH);

  const keepSide = Math.min(mR * 0.78, 4.6);
  addKeep(b, mx, my - mR * 0.10, keepSide, keepSide * 0.9, false, 'Timber Keep');

  // The bridge up: bailey gate, causeway across both ditches, motte gate.
  const bFrac = fracToward(bailey.outline, { x: mx, y: my });
  const bPt = outlineAt(bailey.outline, bFrac);
  addGate(b, { ward: bailey, frac: bFrac, width: 1.8, kind: 'postern', towers: false, bridge: false, name: 'Motte Gate' });
  const mFrac = fracToward(mottePal.outline, bPt.p);
  const mPt = outlineAt(mottePal.outline, mFrac);
  addGate(b, { ward: mottePal, frac: mFrac, width: 1.6, kind: 'postern', towers: false, bridge: false, name: 'Keep Gate' });

  const dx = mPt.p.x - bPt.p.x, dy = mPt.p.y - bPt.p.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  for (let t = -0.6; t <= len + 0.6; t += 0.5 / SUB) {
    for (let w = -0.85; w <= 0.85; w += 0.5 / SUB) {
      const px = bPt.p.x + ux * t - uy * w, py = bPt.p.y + uy * t + ux * w;
      const m = matAt(b.g, px, py);
      if (m === DITCH || m === GROUND || m === MOAT) setAt(b.g, px, py, DECK);
    }
  }

  // The bailey gate faces away from the motte, where the road comes in.
  const gFrac = fracToward(bailey.outline, { x: bxc - bR * 2, y: byc + bR });
  addGate(b, { ward: bailey, frac: gFrac, width: 2.2, kind: 'gate', towers: false, bridge: true, name: 'Bailey Gate' });
  // Timber drums either side of the gate — a bailey gate is two posts and a
  // fighting platform, not a stone gatehouse.
  const gPt = outlineAt(bailey.outline, gFrac);
  for (const side of [-1, 1]) {
    const tx = gPt.p.x + gPt.t.x * 2.3 * side - gPt.n.x * 0.5;
    const ty = gPt.p.y + gPt.t.y * 2.3 * side - gPt.n.y * 0.5;
    stampDisc(b, tx, ty, 1.6, TIMBER);
    stampDisc(b, tx, ty, 0.95, FLOOR);
    b.props.push({ layer: 'defences', asset: 'str/tower-footprint-td', x: tx, y: ty, w: 3.3, name: 'Gate tower', shadow: true });
    b.lights.push({ x: tx, y: ty, bright: 15, dim: 30, color: '#ffae5c', animation: 'torch', name: 'Gate brazier' });
  }

  if (o.courtyardBuildings) {
    const list = rng.shuffle(COURT_BUILDINGS.filter((x) => x.name !== 'Great Hall').slice());
    placeBuildings(b, bailey, [COURT_BUILDINGS[0], ...list], 5, 0.35);
  }
  b.props.push({ layer: 'furnishings', asset: 'dgn/well', x: bxc, y: byc, w: 1.6, name: 'Well' });
  b.rooms.push({ name: 'Bailey', x: bxc, y: byc + bR * 0.62, kind: 'ward', span: bR });
  b.rooms.push({ name: 'The Motte', x: mx, y: my + mR * 0.72, kind: 'ward', span: mR });
  b.notes.push({
    x: mx, y: my, title: 'The motte',
    body: 'Twenty-five feet of piled earth with a ditch at the foot. The bridge is the only way up and it can be dropped; take the bailey and you have taken nothing.',
  });
}

function planCoastal(b: Build, cx: number, cy: number, R: number): void {
  const { o, rng } = b;
  const g = b.g;
  const shoreBase = b.cols * 0.735;
  const phase = rng.float(0, Math.PI * 2);
  const shoreX = (y: number) => shoreBase + Math.sin(y * 0.16 + phase) * 1.4 + Math.sin(y * 0.41 + phase * 2) * 0.7;

  // Pushed towards the water: the whole point is that one face of the castle
  // has no wall, because the cliff is already there.
  const ccx = b.cols * 0.55;
  const ward: Ward = {
    name: 'Sea Castle',
    outline: roundRectPoly(ccx, cy, R * 1.05, R * 1.08, 3.4),
    thickness: 3.6, material: 'stone', walk: true, parapet: 0.95, fillInterior: true,
  };
  stampWard(b, ward);
  if (o.moat) {
    stampApron(b, ward.outline, 0.4, 0.4 + o.moatWidth, MOAT);
    // Only on the landward side: a moat that meets the sea all the way round
    // turns a coastal castle into an island one, which is a different building.
    forRegion(g, shoreBase - 14, 0, b.cols, b.rows, (i, x) => {
      if (g.mat[i] === MOAT && x > shoreBase - 7) g.mat[i] = GROUND;
    });
  }

  // The sea takes everything seaward of the cliff line, wall included.
  forRegion(g, 0, 0, b.cols, b.rows, (i, x, y) => {
    if (x > shoreX(y)) g.mat[i] = SEA;
  });
  // A low sea wall closes the gap where the curtain would have run.
  forRegion(g, shoreBase - 6, 0, b.cols, b.rows, (i, x, y) => {
    if (g.mat[i] !== COURT && g.mat[i] !== WALK) return;
    if (shoreX(y) - x < 1.5) g.mat[i] = MASONRY;
  });

  addGate(b, { ward, frac: 0.5, width: 2.4, kind: 'gate', towers: true, bridge: true, name: 'Landward Gatehouse' });
  addGate(b, { ward, frac: 0.79, width: 1.2, kind: 'postern', towers: false, bridge: false, name: 'Postern' });
  addMuralTowers(b, ward, o.towerSpacing, 2.2);

  // Sea gate and quay.
  const gy = cy + rng.float(-R * 0.25, R * 0.25);
  const gxWall = shoreX(gy);
  for (let x = gxWall - 2.6; x <= gxWall + 0.2; x += 0.5 / SUB) {
    for (let w = -1.0; w <= 1.0; w += 0.5 / SUB) setAt(g, x, gy + w, COURT);
  }
  b.doors.push(freeDoor({ x: gxWall - 0.9, y: gy - 1.0 }, { x: gxWall - 0.9, y: gy + 1.0 }, 'door', 'closed'));
  b.props.push({ layer: 'gates', asset: 'dgn/double-door', x: gxWall - 0.9, y: gy, w: 2.1, h: 0.8, rot: 90, name: 'Sea gate' });

  const quayW = 5.5, quayH = 7.0;
  for (let x = gxWall; x <= gxWall + quayW; x += 0.5 / SUB) {
    for (let y = gy - quayH / 2; y <= gy + quayH / 2; y += 0.5 / SUB) {
      if (matAt(g, x, y) === SEA) setAt(g, x, y, DECK);
    }
  }
  b.props.push({ layer: 'gates', asset: 'str/dock', x: gxWall + quayW * 0.45, y: gy, w: quayW * 1.02, h: quayH * 0.98, name: 'Quay' });
  b.props.push({ layer: 'gates', asset: 'str/jetty', x: gxWall + quayW + 2.2, y: gy - 1.6, w: 5.0, rot: rng.float(-6, 6), name: 'Jetty' });
  b.props.push({ layer: 'gates', asset: 'str/sailing-boat', x: gxWall + quayW + 3.4, y: gy + 2.4, w: 4.2, rot: rng.float(-20, 20), name: 'Moored ship' });
  b.rooms.push({ name: 'Quay', x: gxWall + quayW * 0.6, y: gy, kind: 'water', span: quayH });

  const keepW = Math.max(5.5, R * 0.44);
  addKeep(b, ccx + R * 0.42, cy - R * 0.30, keepW, keepW * 0.85, false, 'Sea Tower');
  b.reserved.push({ x: ccx + R * 0.42 - keepW / 2 - 1, y: cy - R * 0.30 - keepW * 0.42 - 1, w: keepW + 2, h: keepW * 0.85 + 6.4 });

  if (o.courtyardBuildings) placeBuildings(b, ward, rng.shuffle(COURT_BUILDINGS.slice()), 6);
  b.rooms.push({ name: ward.name, x: ccx - R * 0.5, y: cy + R * 0.72, kind: 'ward', span: R });
  b.notes.push({
    x: gxWall + 2, y: gy, title: 'The sea gate',
    body: 'Supplies come in by water, which is why a siege here has to be a blockade. The quay is below the wall and reachable only through the sea gate.',
  });
}

function planStarFort(b: Build, cx: number, cy: number, R: number): void {
  const { o, rng } = b;
  // As large as the glacis will allow: the interior of a bastioned work is a
  // parade ground, and it needs room to be one.
  const rr = R * 0.84;
  const sides = rng.pick([5, 6]);
  const outline = starFortPoly(cx, cy, rr, sides);
  const ward: Ward = {
    name: 'The Works',
    outline,
    thickness: 3.6, material: 'stone', walk: true, parapet: 0.9, fillInterior: true,
  };
  stampWard(b, ward);

  const ditchW = Math.max(3.0, o.moatWidth * 1.3);
  // Always dry: a bastioned trace wants the ditch swept by fire from the
  // flanks, and water in it would only stop the defenders counter-attacking.
  stampApron(b, outline, 0.3, 0.3 + ditchW, DITCH);
  stampApron(b, outline, 0.3 + ditchW, 0.3 + ditchW + 2.8, GLACIS);

  const step = (Math.PI * 2) / sides;
  for (let i = 0; i < sides; i++) {
    const a = i * step - Math.PI / 2;
    // Bastion salients: the whole reason for the shape.
    b.props.push({
      layer: 'defences', asset: 'str/bastion',
      x: cx + Math.cos(a) * rr * 1.08, y: cy + Math.sin(a) * rr * 1.08,
      w: rr * 0.42, rot: (a * 180) / Math.PI + 90, name: 'Bastion', opacity: 0.85,
    });
    b.lights.push({
      x: cx + Math.cos(a) * rr * 1.20, y: cy + Math.sin(a) * rr * 1.20,
      bright: 20, dim: 40, color: '#ffae5c', animation: 'torch', name: 'Bastion brazier',
    });

    // A ravelin in the ditch opposite each curtain, splitting the approach.
    const am = a + step / 2;
    const apex = { x: cx + Math.cos(am) * (rr + ditchW * 0.95), y: cy + Math.sin(am) * (rr + ditchW * 0.95) };
    const baseR = rr * 0.72;
    const spread = step * 0.30;
    const tri = [
      apex,
      { x: cx + Math.cos(am - spread) * baseR * 1.32, y: cy + Math.sin(am - spread) * baseR * 1.32 },
      { x: cx + Math.cos(am + spread) * baseR * 1.32, y: cy + Math.sin(am + spread) * baseR * 1.32 },
    ];
    const bb = polyBounds(tri);
    forRegion(b.g, bb.x0 - 1, bb.y0 - 1, bb.x1 + 1, bb.y1 + 1, (idx, x, y) => {
      if (b.g.mat[idx] !== MOAT && b.g.mat[idx] !== DITCH) return;
      if (sdfPoly(tri, x, y) < 0) b.g.mat[idx] = EARTH;
    });
  }

  addGate(b, { ward, frac: 0.5 / sides + 0.5, width: 2.6, kind: 'gate', towers: true, bridge: true, name: 'Sally Port' });
  addGate(b, { ward, frac: 0.5 / sides, width: 1.3, kind: 'postern', towers: false, bridge: false, name: 'Postern' });

  // Small on purpose: what sits in the middle of a bastioned work is a magazine
  // and a barrack block, not a medieval donjon.
  const keepW = Math.max(4.6, rr * 0.38);
  addKeep(b, cx, cy - 1.8, keepW, keepW * 0.74, false, 'The Citadel');
  b.reserved.push({ x: cx - keepW / 2 - 1, y: cy - 1.8 - keepW * 0.37 - 1, w: keepW + 2, h: keepW * 0.74 + 6.4 });
  if (o.courtyardBuildings) placeBuildings(b, ward, rng.shuffle(COURT_BUILDINGS.slice()), 6);

  b.props.push({ layer: 'furnishings', asset: 'dgn/well', x: cx - rr * 0.42, y: cy + rr * 0.3, w: 1.6, name: 'Well' });
  b.rooms.push({ name: 'Parade Ground', x: cx, y: cy + rr * 0.42, kind: 'building', span: 6 });
  b.rooms.push({ name: 'Glacis', x: cx, y: cy + (rr + ditchW + 1.8), kind: 'ward', span: 6 });
  b.rooms.push({ name: ward.name, x: cx, y: cy - rr * 0.55, kind: 'ward', span: rr });
  b.notes.push({
    x: cx, y: cy - rr - ditchW * 0.5, title: 'The trace',
    body: 'Angled bastions, so every stretch of ditch is swept lengthways from the flank of the next work along. There is no dead ground at the foot of this wall.',
  });
}

function planHillfort(b: Build, cx: number, cy: number, R: number): void {
  const { o, rng } = b;
  const rings = o.baileys >= 2 ? 3 : 2;
  // Bank, ditch and a berm between them, measured in cells rather than as a
  // fraction of the radius. Spacing the rings proportionally is how three banks
  // and three ditches fuse into one shapeless mound as soon as the map is small:
  // the ditch of an inner ring lands inside the bank of the outer one and is
  // silently dropped, because an apron only writes over open ground.
  const bank = 2.2;
  const ditchW = Math.max(1.6, o.moatWidth * 0.75);
  const pitch = bank + ditchW + 0.5;
  const RH = Math.min(R * 1.28, Math.min(cx, cy) - ditchW - 1.5);
  const outlines: Vec2[][] = [];
  for (let k = 0; k < rings; k++) {
    const r = RH - k * pitch;
    const outline = circlePoly(cx, cy, r, rng, 0.06);
    outlines.push(outline);
    stampWard(b, {
      name: k === 0 ? 'Outer Rampart' : k === rings - 1 ? 'Inner Rampart' : 'Middle Rampart',
      outline, thickness: bank, material: 'earth', walk: false, parapet: 0.8,
      fillInterior: k === rings - 1,
    });
    stampApron(b, outline, 0.15, 0.15 + ditchW, DITCH);
  }

  // A timber breastwork along the crest of the innermost bank.
  const inner = outlines[rings - 1];
  const crest = inner.map((p) => ({ x: cx + (p.x - cx) * 0.92, y: cy + (p.y - cy) * 0.92 }));
  stampWard(b, {
    name: 'Palisade', outline: crest, thickness: 1.1, material: 'timber',
    walk: false, parapet: 0.3, fillInterior: false,
  });

  // One entrance, driven straight through every bank, then turned inward.
  const innerR = RH - (rings - 1) * pitch;
  const ang = rng.float(0, Math.PI * 2);
  const ux = Math.cos(ang), uy = Math.sin(ang);
  const halfWay = 1.25;
  for (let d = RH + ditchW + 1.5; d > innerR - 4.5; d -= 0.5 / SUB) {
    for (let w = -halfWay; w <= halfWay; w += 0.5 / SUB) {
      const px = cx + ux * d - uy * w, py = cy + uy * d + ux * w;
      const m = matAt(b.g, px, py);
      if (m === EARTH || m === TIMBER || m === DITCH) setAt(b.g, px, py, d > innerR - 2.2 ? GROUND : COURT);
    }
  }
  // The inturn: the ends of the innermost bank fold back inside, so the last
  // forty feet of the approach is a corridor with a bank on either hand.
  for (const side of [-1, 1]) {
    for (let d = innerR - 0.2; d > innerR - 6.5; d -= 0.5 / SUB) {
      for (let w = halfWay; w <= halfWay + 1.7; w += 0.5 / SUB) {
        const px = cx + ux * d - uy * w * side, py = cy + uy * d + ux * w * side;
        if (matAt(b.g, px, py) === COURT) setAt(b.g, px, py, EARTH);
      }
    }
  }
  const gx = cx + ux * (innerR - 1.4), gy = cy + uy * (innerR - 1.4);
  b.doors.push(freeDoor(
    { x: gx - uy * halfWay, y: gy + ux * halfWay }, { x: gx + uy * halfWay, y: gy - ux * halfWay }, 'door', 'closed',
  ));
  b.props.push({
    layer: 'gates', asset: 'dgn/double-door', x: gx, y: gy, w: 2.4, h: 0.8,
    rot: (Math.atan2(uy, ux) * 180) / Math.PI + 90, name: 'Hill gate',
  });
  b.rooms.push({ name: 'Inturned Gate', x: gx, y: gy, kind: 'gate', span: 4 });

  // Roundhouses and a chieftain's hall on the summit.
  const courtR = innerR - bank;
  const huts = Math.max(5, Math.round(courtR * 0.9));
  const placedHuts: Vec2[] = [];
  for (let i = 0; i < huts * 30 && placedHuts.length < huts; i++) {
    const a = rng.float(0, Math.PI * 2), rr = Math.sqrt(rng.next()) * courtR * 0.82;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    const r = rng.float(1.25, 1.85);
    if (matAt(b.g, x, y) !== COURT) continue;
    if (placedHuts.some((p) => Math.hypot(p.x - x, p.y - y) < r * 2 + 0.9)) continue;
    let clean = true;
    for (let t = 0; t < 12 && clean; t++) {
      const th = (t / 12) * Math.PI * 2;
      if (matAt(b.g, x + Math.cos(th) * (r + 0.5), y + Math.sin(th) * (r + 0.5)) !== COURT) clean = false;
    }
    if (!clean) continue;
    placedHuts.push({ x, y });
    addRoundhouse(b, x, y, r, placedHuts.length === 1 ? "Chieftain's Hall" : 'Roundhouse');
  }

  b.props.push({ layer: 'furnishings', asset: 'dgn/well', x: cx, y: cy, w: 1.6, name: 'Spring' });
  b.rooms.push({ name: 'The Summit', x: cx, y: cy - R * 0.55, kind: 'ward', span: R * 0.6 });
  b.notes.push({
    x: cx + ux * R * 0.95, y: cy + uy * R * 0.95, title: 'The approach',
    body: 'Three banks and three ditches, and the entrance is a hundred-foot corridor overlooked from both sides. There is no masonry here and none is needed.',
  });
}

// ---------------------------------------------------------------------------
// From sub-cells to the tactical grid
// ---------------------------------------------------------------------------

/**
 * Collapse the fine plan onto the 5 ft grid the VTT will use.
 *
 * A cell is solid when at least 45% of it is. Anything lower and a wall one
 * cell thick can fall between two cells and vanish; anything higher and a wall
 * walk two cells wide gets swallowed by the parapets on either side of it. Both
 * failures are silent in the picture and fatal in play, which is why every band
 * in the plan is dimensioned to survive this test.
 */
function coarsen(g: SubGrid): { cells: CellGrid; mat: Uint8Array } {
  const cells = makeGrid(g.cellCols, g.cellRows);
  const mat = new Uint8Array(g.cellCols * g.cellRows);
  const tally = new Uint16Array(16);
  for (let cy = 0; cy < g.cellRows; cy++) {
    for (let cx = 0; cx < g.cellCols; cx++) {
      tally.fill(0);
      let solid = 0;
      for (let sy = 0; sy < SUB; sy++) {
        for (let sx = 0; sx < SUB; sx++) {
          const m = g.mat[(cy * SUB + sy) * g.cols + cx * SUB + sx];
          tally[m]++;
          if (isSolid(m)) solid++;
        }
      }
      let mode = 0;
      for (let m = 1; m < 16; m++) if (tally[m] > tally[mode]) mode = m;
      const i = cy * g.cellCols + cx;
      mat[i] = mode;
      cells.open[at(cells, cx, cy)] = solid >= SUB * SUB * 0.45 ? 0 : 1;
    }
  }
  return { cells, mat };
}

/**
 * Arrow loops.
 *
 * Found rather than planned: any masonry cell with open ground in front of it
 * and a fighting platform within three cells behind it is somewhere a garrison
 * would have cut a loop. Thinning them to one every few cells keeps the wall
 * from turning into a colonnade.
 */
function findSlits(mat: Uint8Array, cells: CellGrid, cell: number, spacing: number): Opening[] {
  const { cols, rows } = cells;
  const out: Opening[] = [];
  const taken: Vec2[] = [];
  const OUTSIDE = new Set([GROUND, MOAT, DITCH, GLACIS]);
  const dirs: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];

  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      const i = y * cols + x;
      if (mat[i] !== MASONRY) continue;
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        if (!OUTSIDE.has(mat[ny * cols + nx])) continue;
        let backed = false;
        for (let k = 1; k <= 3 && !backed; k++) {
          const bx = x - dx * k, by = y - dy * k;
          if (bx < 0 || by < 0 || bx >= cols || by >= rows) break;
          const bm = mat[by * cols + bx];
          if (bm === WALK || bm === FLOOR) backed = true;
          else if (bm !== MASONRY) break;
        }
        if (!backed) continue;
        if (taken.some((p) => Math.abs(p.x - x) + Math.abs(p.y - y) < spacing)) continue;
        taken.push({ x, y });
        const ex = dx > 0 ? x + 1 : x, ey = dy > 0 ? y + 1 : y;
        out.push(dy !== 0
          ? { a: { x: ex * cell, y: ey * cell }, b: { x: (ex + 1) * cell, y: ey * cell }, kind: 'window' }
          : { a: { x: ex * cell, y: ey * cell }, b: { x: ex * cell, y: (ey + 1) * cell }, kind: 'window' });
        break;
      }
    }
  }
  return out;
}

/**
 * Cut an opening into an already-traced wall run.
 *
 * `traceWalls` merges each face of the curtain into as few segments as it can,
 * which is what a VTT wants — but a window has to replace a piece of a segment,
 * not lie on top of one, or the solid wall behind it still blocks the sight it
 * was supposed to allow.
 */
function punchOpenings(walls: Wall[], openings: Opening[]): Wall[] {
  const EPS = 0.5;
  const out = walls.slice();
  for (const op of openings) {
    const horiz = Math.abs(op.a.y - op.b.y) < EPS;
    const lo = horiz ? Math.min(op.a.x, op.b.x) : Math.min(op.a.y, op.b.y);
    const hi = horiz ? Math.max(op.a.x, op.b.x) : Math.max(op.a.y, op.b.y);
    const fixed = horiz ? op.a.y : op.a.x;

    const idx = out.findIndex((w) => {
      if (w.kind !== 'wall') return false;
      const wh = Math.abs(w.a.y - w.b.y) < EPS;
      if (wh !== horiz) return false;
      if (Math.abs((horiz ? w.a.y : w.a.x) - fixed) > EPS) return false;
      const wlo = horiz ? Math.min(w.a.x, w.b.x) : Math.min(w.a.y, w.b.y);
      const whi = horiz ? Math.max(w.a.x, w.b.x) : Math.max(w.a.y, w.b.y);
      return wlo <= lo + EPS && whi >= hi - EPS;
    });
    if (idx < 0) continue;

    const w = out[idx];
    const wlo = horiz ? Math.min(w.a.x, w.b.x) : Math.min(w.a.y, w.b.y);
    const whi = horiz ? Math.max(w.a.x, w.b.x) : Math.max(w.a.y, w.b.y);
    const mk = (from: number, to: number, kind: WallKind): Wall | null => {
      if (to - from < EPS) return null;
      const a = horiz ? { x: from, y: fixed } : { x: fixed, y: from };
      const c = horiz ? { x: to, y: fixed } : { x: fixed, y: to };
      return makeWall(a, c, kind);
    };
    const pieces = [mk(wlo, lo, 'wall'), mk(lo, hi, op.kind), mk(hi, whi, 'wall')].filter((p): p is Wall => !!p);
    out.splice(idx, 1, ...pieces);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Painting
// ---------------------------------------------------------------------------

/**
 * A mask of every sub-cell matching `pred`, rasterised small and blown up.
 *
 * The upscale is the whole trick: at eight samples to the cell the staircase on
 * a round tower is an eighth of a square, and letting the browser resample it
 * turns that into an antialiased curve for free. Thresholding it back to hard
 * edges would throw away the only thing worth having.
 *
 * Only the material's bounding box is allocated. Most of these cover a tenth of
 * the sheet, and paying full canvas cost for each of a dozen of them is what
 * made the first version of this take half a minute.
 */
function matMask(g: SubGrid, cell: number, pred: (m: number) => boolean): Mask {
  let bx0 = g.cols, by0 = g.rows, bx1 = -1, by1 = -1;
  for (let y = 0; y < g.rows; y++) {
    for (let x = 0; x < g.cols; x++) {
      if (!pred(g.mat[y * g.cols + x])) continue;
      if (x < bx0) bx0 = x;
      if (x > bx1) bx1 = x;
      if (y < by0) by0 = y;
      if (y > by1) by1 = y;
    }
  }
  if (bx1 < 0) return { surf: acquireScratch(1, 1), x: 0, y: 0, w: 1, h: 1, empty: true };

  const pad = 2;
  bx0 = Math.max(0, bx0 - pad); by0 = Math.max(0, by0 - pad);
  bx1 = Math.min(g.cols - 1, bx1 + pad); by1 = Math.min(g.rows - 1, by1 + pad);
  const sw = bx1 - bx0 + 1, sh = by1 - by0 + 1;

  const small = createSurface(sw, sh);
  const sctx = ctxOf(small);
  const img = sctx.createImageData(sw, sh);
  const d = img.data;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      if (!pred(g.mat[(y + by0) * g.cols + x + bx0])) continue;
      const j = (y * sw + x) * 4;
      d[j] = 255; d[j + 1] = 255; d[j + 2] = 255; d[j + 3] = 255;
    }
  }
  sctx.putImageData(img, 0, 0);

  const scale = cell / SUB;
  const px = bx0 * scale, py = by0 * scale;
  const pw = Math.max(1, Math.round(sw * scale)), ph = Math.max(1, Math.round(sh * scale));
  const out = acquireScratch(pw, ph);
  const octx = ctxOf(out);
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(small, 0, 0, pw, ph);
  return { surf: out, x: px, y: py, w: pw, h: ph, empty: false };
}

/** Several textures interlocking, resolved inside the mask's box only. */
function blendStencil(
  dst: CanvasRenderingContext2D, m: Mask,
  layers: { textureId: string; weight: number }[], seed: number, scale: number, paletteId: string,
): void {
  if (m.empty) return;
  const tex = acquireScratch(m.w, m.h);
  const tctx = ctxOf(tex);
  blendTextures(tctx, m.w, m.h, layers, { seed, scale, warp: 0.3, paletteId });
  addTonalDrift(tctx, m.w, m.h, seed + 7, 0.6);
  tctx.globalCompositeOperation = 'destination-in';
  tctx.drawImage(m.surf, 0, 0);
  dst.drawImage(tex, m.x, m.y);
  releaseScratch(tex);
}

function paintCastle(doc: MapDocument, b: Build): void {
  const { g, o } = b;
  const W = doc.width, H = doc.height;
  const cell = o.cell;
  const palette = paletteById(o.paletteId);
  const ground = rasterByRole(doc, 'background');
  const water = rasterByRole(doc, 'water');
  const floor = rasterByRole(doc, 'floor');
  const stone = rasterByRole(doc, 'walls-art');
  const relief = rasterByRole(doc, 'relief');

  if (ground) {
    const ctx = ctxOf(ground.surface);
    blendTextures(ctx, W, H, [
      { textureId: 'grass', weight: 3.6 },
      { textureId: 'grass-lush', weight: 2.2 },
      { textureId: 'plains', weight: 1.6 },
      { textureId: 'dirt', weight: 1.0 },
    ], { seed: o.seed + 91, scale: 3.0, warp: 0.24, paletteId: o.paletteId });
    addTonalDrift(ctx, W, H, o.seed + 421, 0.9);
  }

  if (water) {
    const ctx = ctxOf(water.surface);
    const sea = matMask(g, cell, (m) => m === SEA);
    stencil(ctx, sea, 'water', o.paletteId, { drift: 0.8, seed: o.seed + 7 });
    rimShade(ctx, sea, cell * 0.5, 0.5, '#0b1a20');
    freeMask(sea);

    const ditch = matMask(g, cell, (m) => m === DITCH);
    stencil(ctx, ditch, 'dirt', o.paletteId, { tint: '#1d1509', tintAlpha: 0.5, drift: 0.7, seed: o.seed + 11 });
    rimShade(ctx, ditch, cell * 0.4, 0.7);
    freeMask(ditch);

    const moat = matMask(g, cell, (m) => m === MOAT);
    stencil(ctx, moat, 'water', o.paletteId, { tint: '#1c3a2c', tintAlpha: 0.42, drift: 0.6, seed: o.seed + 13 });
    rimShade(ctx, moat, cell * 0.4, 0.55, '#101c18');
    freeMask(moat);

    const glacis = matMask(g, cell, (m) => m === GLACIS);
    stencil(ctx, glacis, 'grass', o.paletteId, { tint: '#b9b07a', tintAlpha: 0.45, alpha: 0.95 });
    freeMask(glacis);
  }

  if (floor) {
    const ctx = ctxOf(floor.surface);
    const motte = matMask(g, cell, (m) => m === MOTTE);
    stencil(ctx, motte, 'grass-lush', o.paletteId, { drift: 1.1, seed: o.seed + 17 });
    rimShade(ctx, motte, cell * 0.9, 0.55);
    freeMask(motte);

    const court = matMask(g, cell, (m) => m === COURT);
    // Mostly beaten earth. A castle yard is a farmyard with better walls: only
    // the tracks that take carts every day are paved, and a courtyard rendered
    // wall-to-wall in cobble reads as a piazza.
    blendStencil(ctx, court, [
      { textureId: 'dirt', weight: 8.0 },
      { textureId: 'cobble', weight: 1.4 },
      { textureId: 'mud', weight: 1.2 },
    ], o.seed + 37, 4.5, o.paletteId);
    freeMask(court);

    const walk = matMask(g, cell, (m) => m === WALK);
    stencil(ctx, walk, 'flagstone', o.paletteId, {});
    freeMask(walk);

    const rooms = matMask(g, cell, (m) => m === FLOOR);
    stencil(ctx, rooms, 'wood-planks', o.paletteId, {});
    freeMask(rooms);

    const deck = matMask(g, cell, (m) => m === DECK);
    stencil(ctx, deck, 'wood-planks', o.paletteId, { tint: '#4a331f', tintAlpha: 0.22 });
    inkOutline(ctx, deck, Math.max(1.5, cell * 0.05), rgba('#2a1c10', 0.9));
    freeMask(deck);

    const rubble = matMask(g, cell, (m) => m === RUBBLE);
    stencil(ctx, rubble, 'scree', o.paletteId, { drift: 0.8, seed: o.seed + 83 });
    freeMask(rubble);
  }

  if (stone) {
    const ctx = ctxOf(stone.surface);
    const earth = matMask(g, cell, (m) => m === EARTH);
    stencil(ctx, earth, 'dirt', o.paletteId, {
      tint: mix(palette.highland, '#000000', 0.2), tintAlpha: 0.4, drift: 0.9, seed: o.seed + 97,
    });
    rimShade(ctx, earth, cell * 0.75, 0.6, '#1a1408');
    freeMask(earth);

    const timber = matMask(g, cell, (m) => m === TIMBER);
    stencil(ctx, timber, 'wood-planks', o.paletteId, { tint: '#3a2716', tintAlpha: 0.4 });
    freeMask(timber);

    const masonry = matMask(g, cell, (m) => m === MASONRY);
    stencil(ctx, masonry, 'rock', o.paletteId, { drift: 0.7, seed: o.seed + 101 });
    inkOutline(ctx, masonry, Math.max(1.5, cell * 0.045), rgba(mix(palette.ink, '#000000', 0.35), 0.9));
    freeMask(masonry);
  }

  if (relief) {
    const ctx = ctxOf(relief.surface);
    const solid = matMask(g, cell, (m) => m === MASONRY || m === TIMBER || m === EARTH);
    castShadow(ctx, solid, cell * 0.16, cell * 0.22, cell * 0.22);
    freeMask(solid);
    relief.blend = 'multiply';
    relief.opacity = 0.85;
  }
}

// ---------------------------------------------------------------------------
// Emission
// ---------------------------------------------------------------------------

function objLayer(doc: MapDocument, name: string) {
  const l = doc.layers.find((x) => x.kind === 'object' && x.name === name);
  return l && l.kind === 'object' ? l : undefined;
}

function emitProps(doc: MapDocument, b: Build): void {
  const cell = b.o.cell;
  const layers = {
    defences: objLayer(doc, 'Defences'),
    buildings: objLayer(doc, 'Buildings'),
    gates: objLayer(doc, 'Gates & Stairs'),
    furnishings: objLayer(doc, 'Furnishings'),
  };
  for (const p of b.props) {
    const layer = layers[p.layer];
    if (!layer) continue;
    const shadow = p.shadow
      ? { color: 'rgba(0,0,0,0.42)', blur: cell * 0.22, dx: cell * 0.07, dy: cell * 0.1 }
      : null;
    const common = {
      seed: p.seed ?? b.rng.int(1, 1e6),
      rotation: p.rot ?? 0,
      opacity: p.opacity ?? 1,
      name: p.name,
      shadow,
    };
    layer.objects.push(p.h === undefined
      ? makeStampAuto(p.asset, p.x * cell, p.y * cell, p.w * cell, common)
      : makeStamp(p.asset, p.x * cell, p.y * cell, p.w * cell, p.h * cell, common));
  }
}

function emitTowers(b: Build): void {
  for (const t of b.towers) {
    b.props.push({
      layer: 'defences', asset: 'str/round-tower', x: t.x, y: t.y, w: t.r * 2.05,
      opacity: t.ruinedTop ? 0.72 : 1,
      name: t.kind === 'gate' ? 'Gate tower' : t.ruinedTop ? 'Ruined tower' : 'Mural tower',
      shadow: true,
    });
    if (t.ruinedTop) {
      for (let i = 0; i < 2; i++) {
        const a = b.rng.float(0, Math.PI * 2);
        b.props.push({
          layer: 'furnishings', asset: 'dgn/rubble',
          x: t.x + Math.cos(a) * t.r * 0.55, y: t.y + Math.sin(a) * t.r * 0.55,
          w: t.r * 0.9, rot: b.rng.float(0, 360), opacity: 0.9, name: 'Fallen masonry',
        });
      }
      continue;
    }
    // Braziers on the tower tops: on a night map these are what the garrison
    // sees by, and they are the only lights that reach the ground outside.
    b.lights.push({
      x: t.x, y: t.y, bright: t.kind === 'gate' ? 25 : 20, dim: t.kind === 'gate' ? 50 : 40,
      color: '#ffae5c', animation: 'flame', name: t.kind === 'gate' ? 'Gatehouse lantern' : 'Tower brazier',
    });
  }
}

function emitLights(doc: MapDocument, b: Build): void {
  const layer = doc.layers.find((l) => l.kind === 'light');
  if (!layer || layer.kind !== 'light') return;
  // Radii are authored in feet and converted here; a torch has to be 20/40 ft
  // in Foundry whatever pixel size the map was drawn at.
  const unit = b.o.cell / 5;
  for (const l of b.lights) {
    layer.lights.push(makeLight(l.x * b.o.cell, l.y * b.o.cell, b.o.cell, {
      bright: l.bright * unit,
      dim: l.dim * unit,
      color: l.color,
      intensity: l.intensity ?? 0.85,
      animation: l.animation,
      name: l.name,
    }));
  }
}

function emitLabels(doc: MapDocument, b: Build, title: string): void {
  const layer = doc.layers.find((l) => l.kind === 'object' && l.role === 'labels');
  if (!layer || layer.kind !== 'object') return;
  const p = paletteById(b.o.paletteId);
  const cell = b.o.cell;

  layer.objects.push(makeText(title, doc.width / 2, cell * 2.2, b.o.paletteId, {
    size: cell * 1.15, bold: true, letterSpacing: 10,
    color: mix(p.ink, '#ffffff', 0.1),
    strokeColor: 'rgba(0,0,0,0.6)', strokeWidth: cell * 0.06,
    name: 'Castle name',
  }));

  const seen = new Set<string>();
  for (const r of b.rooms) {
    if (r.kind === 'tower') continue;
    const key = `${r.name}@${Math.round(r.x)},${Math.round(r.y)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const big = r.kind === 'ward' || r.kind === 'keep';
    layer.objects.push(makeText(r.name, r.x * cell, r.y * cell, b.o.paletteId, {
      size: cell * (big ? 0.58 : 0.36),
      italic: !big,
      letterSpacing: big ? 5 : 2,
      color: big ? mix(p.ink, '#ffffff', 0.12) : mix(p.inkSoft, '#ffffff', 0.25),
      strokeColor: 'rgba(0,0,0,0.65)',
      strokeWidth: cell * 0.07,
      name: r.name,
    }));
  }
}

function emitNotes(doc: MapDocument, b: Build): void {
  const layer = doc.layers.find((l) => l.kind === 'note');
  if (!layer || layer.kind !== 'note') return;
  for (const n of b.notes) {
    const note = makeNote(n.x * b.o.cell, n.y * b.o.cell, n.title);
    note.body = n.body;
    layer.notes.push(note);
  }
}

const GARRISON_NOTES = [
  ['Murder holes', 'The vault of the gate passage is pierced above; anything trapped between portcullis and gates can be shot, burned or drowned from the chamber over it.'],
  ['The well', 'Sunk through rock to the water table. Poison it and the castle falls in a week; the garrison knows that and guards it.'],
  ['Postern', 'A single door, barred from inside, at the foot of a blind angle of the wall. Sallies go out of it at night — and so does anyone who has bribed the sergeant.'],
  ['Wall walk', 'Ten feet wide behind the parapet, with stairs at the towers. A figure up here has cover and a clear shot down at the ditch.'],
  ['Undercroft', 'Beneath the hall: barrels, salt meat, and the money chest. The only way down is a trap in the hall floor.'],
];

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const STYLE_NOUNS: Record<CastleStyle, string[]> = {
  'motte-bailey': ['Keep', 'Mount', 'Hold'],
  concentric: ['Castle', 'Ward', 'Citadel'],
  'shell-keep': ['Keep', 'Ring', 'Crown'],
  coastal: ['Head', 'Point', 'Haven'],
  'star-fort': ['Fort', 'Redoubt', 'Star'],
  hillfort: ['Dun', 'Camp', 'Rings'],
};

function castleName(rng: RNG, style: CastleStyle, culture: Culture): string {
  const stem = syllableName(rng, culture);
  const noun = rng.pick(STYLE_NOUNS[style]);
  const adj = rng.pick(['Grey', 'Black', 'Iron', 'Red', 'High', 'Old', 'Storm', 'Raven', 'Bright']);
  switch (rng.int(0, 3)) {
    case 0: return `${noun === 'Castle' ? 'Castle ' : ''}${stem}${noun === 'Castle' ? '' : ` ${noun}`}`;
    case 1: return `${stem} ${noun}`;
    case 2: return `The ${adj} ${noun}`;
    default: return `${adj}${rng.pick(['gate', 'mere', 'crag', 'holm', 'march', 'watch', 'fell', 'moor'])}`;
  }
}

export function generateCastle(opts: Partial<CastleGenOptions> = {}): CastleResult {
  const o: CastleGenOptions = { ...DEFAULT_CASTLE_OPTIONS, ...opts };
  const rng = new RNG(o.seed);
  const culture: Culture = o.style === 'star-fort' ? 'imperial'
    : o.style === 'hillfort' ? 'northern'
    : o.style === 'coastal' ? 'northern' : 'common';
  const namer = createNamer(o.seed + 811, culture);

  const cols = Math.max(26, Math.floor(o.width / o.cell));
  const rows = Math.max(22, Math.floor(o.height / o.cell));
  const g = makeSubGrid(cols, rows);

  const b: Build = {
    o, rng, g, cols, rows,
    wards: [], towers: [], doors: [], props: [], lights: [],
    rooms: [], notes: [], reserved: [],
  };

  const cx = cols / 2, cy = rows / 2;
  const size = Math.max(0.15, Math.min(1, o.size));
  const R = Math.min(cols, rows) * 0.5 * (0.42 + 0.34 * size);

  switch (o.style) {
    case 'motte-bailey': planMotteBailey(b, cx, cy, R); break;
    case 'shell-keep': planShellKeep(b, cx, cy, R); break;
    case 'coastal': planCoastal(b, cx, cy, R); break;
    case 'star-fort': planStarFort(b, cx, cy, R); break;
    case 'hillfort': planHillfort(b, cx, cy, R); break;
    default: planConcentric(b, cx, cy, R); break;
  }

  applyRuin(b);
  for (const w of b.wards) dressCrest(b, w);
  emitTowers(b);

  const { cells, mat } = coarsen(g);

  const title = o.title || castleName(rng, o.style, culture);
  const doc = createDocument({
    kind: 'castle',
    width: cols * o.cell,
    height: rows * o.cell,
    title,
    paletteId: o.paletteId,
    gridOverride: { size: o.cell, type: 'square', visible: true, snap: true, majorEvery: 5 },
  });
  doc.meta.seed = o.seed;
  doc.meta.description = `${o.style} castle, ${cols}×${rows} squares at ${o.cell}px / 5 ft.`
    + `${o.ruined > 0.05 ? ` ${Math.round(o.ruined * 100)}% ruined.` : ''} Seed ${o.seed}.`;

  paintCastle(doc, b);

  let walls = traceWalls(cells, o.cell, b.doors);
  const slitSpacing = Math.max(3, Math.round(o.towerSpacing / 2));
  const slits = o.ruined > 0.75 ? [] : findSlits(mat, cells, o.cell, slitSpacing);
  walls = punchOpenings(walls, slits);
  const wl = doc.layers.find((l) => l.kind === 'wall');
  if (wl && wl.kind === 'wall') wl.walls = walls;

  emitProps(doc, b);
  if (o.lights) emitLights(doc, b);
  if (o.labels) {
    emitLabels(doc, b, title);
    layoutLabels(doc, { padding: o.cell * 0.12, minorSizeBelow: o.cell * 0.4 });
  }
  if (o.notes) {
    const extra = rng.shuffle(GARRISON_NOTES.slice()).slice(0, 3);
    for (const [t, body] of extra) {
      const spot = rng.pick(b.rooms.length ? b.rooms : [{ x: cx, y: cy } as CastleRoom]);
      b.notes.push({ x: spot.x, y: spot.y, title: t, body });
    }
    b.notes.push({
      x: cx, y: 1.6,
      title: `${title} — the garrison`,
      body: `Held for ${namer.person()}. Reckon on ${Math.round(8 + R * 2)} men-at-arms and twice that in servants; `
        + 'the wall walk is manned at night, the gate is shut at dusk and the drawbridge raised.',
    });
    emitNotes(doc, b);
  }

  const doorCount = walls.filter((w) => w.kind === 'door' || w.kind === 'secretDoor').length;
  const windowCount = walls.filter((w) => w.kind === 'window').length;
  const lightLayer = doc.layers.find((l) => l.kind === 'light');

  return {
    doc,
    grid: cells,
    rooms: b.rooms,
    walls,
    counts: {
      walls: walls.length - doorCount - windowCount,
      doors: doorCount,
      windows: windowCount,
      lights: lightLayer && lightLayer.kind === 'light' ? lightLayer.lights.length : 0,
    },
  };
}
