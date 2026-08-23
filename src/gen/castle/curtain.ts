/**
 * A curtain wall built by hand rather than rolled.
 *
 * The castle generator plans an *enclosure* and rasterises it; a GM drawing a
 * fortification gives us the centreline directly, which is both less and more:
 * less, because there is no ward to dress, and more, because the line can be
 * open, re-entrant or a single stretch across a pass. So the geometry here is
 * offset-curve work on a polyline — two faces, towers on the outward side, a
 * gatehouse astride one segment — while the *look* is borrowed wholesale from
 * `masonry.ts`, which the generator also paints through. A wall the tool drew
 * and a wall the generator drew must be the same wall.
 *
 * Nothing in here touches the editor. The tool feeds in a polyline and gets
 * back a plan it can preview, paint and emit from.
 */
import type { Vec2, Rect, Wall, WallKind, LightSource, StampObject, GridConfig } from '../../core/types';
import { RNG } from '../../core/rng';
import { makeWall, makeLight, makeStamp, makeStampAuto } from '../../core/factories';
import { paletteById, mix, rgba } from '../../core/color';
import { maskFromPaths, freeMask, stencil, inkOutline, castShadow, rimShade } from './masonry';

export type CurtainMaterial = 'stone' | 'timber' | 'earth';
export type TowerPlacement = 'corners' | 'corners+spacing' | 'none';
export type TowerShape = 'round' | 'square';

export interface CurtainOptions {
  /** Wall thickness in feet — 10 ft is a curtain a figure can stand on. */
  thickness: number;
  material: CurtainMaterial;
  towers: TowerPlacement;
  /** Feet between mural towers when spacing is asked for. */
  towerSpacing: number;
  towerShape: TowerShape;
  crenellations: boolean;
  gatehouse: boolean;
  wallWalk: boolean;
  /** 0 = garrisoned, 1 = a shell. Breaks the wall set as well as the paint. */
  ruined: number;
}

export interface CurtainTower {
  x: number; y: number; r: number;
  /** Which way the tower faces the field. */
  n: Vec2;
  shape: TowerShape;
  ruined: boolean;
  corner: boolean;
  /** One of the two drums of the gatehouse. */
  gate: boolean;
}
export interface CurtainGate { p: Vec2; t: Vec2; n: Vec2; span: number; depth: number; passage: number; s: number }
export interface CurtainBreach { p: Vec2; t: Vec2; n: Vec2; half: number; s: number }

/** Where along the run something sits: which segment, and how far along it. */
export interface RunSpot { index: number; t: number }

export interface CurtainPlan {
  pts: Vec2[];
  closed: boolean;
  cell: number;
  /** Map pixels per foot. */
  ftPx: number;
  /** Half the wall thickness, in map px. */
  half: number;
  /** Parapet thickness; zero when there is no wall walk. */
  parapet: number;
  outer: Vec2[];
  inner: Vec2[];
  /** +1 when the outward face is the left hand of travel, -1 when it is not. */
  outSign: number;
  walkOuter: Vec2[] | null;
  walkInner: Vec2[] | null;
  towers: CurtainTower[];
  gate: CurtainGate | null;
  breaches: CurtainBreach[];
  /** Centreline length in map px, and the same in the grid's own units. */
  lengthPx: number;
  lengthUnits: number;
  unitLabel: string;
  bounds: Rect;
  seed: number;
}

// ---------------------------------------------------------------------------
// Vector / polyline helpers
// ---------------------------------------------------------------------------

const norm = (v: Vec2): Vec2 => { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; };
const leftOf = (v: Vec2): Vec2 => ({ x: -v.y, y: v.x });
const dirOf = (a: Vec2, b: Vec2): Vec2 => norm({ x: b.x - a.x, y: b.y - a.y });
const deg = (v: Vec2): number => (Math.atan2(v.y, v.x) * 180) / Math.PI;

/**
 * The `str/bastion` outline in tower radii: across the wall, then outward.
 *
 * Traced off the artwork, flanks included. Painting only the salient leaves the
 * drawn flanks lying on the grass as two loose grey slabs.
 */
const BASTION: [number, number][] = [
  [-1.02, -1.02], [-1.02, -0.45], [-0.57, 0.21], [0, 0.82], [0.57, 0.21], [1.02, -0.45], [1.02, -1.02],
];

interface Seg { a: Vec2; b: Vec2; s0: number; len: number }

function segments(pts: Vec2[], closed: boolean): Seg[] {
  const out: Seg[] = [];
  const n = pts.length;
  let s = 0;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-6) continue;
    out.push({ a, b, s0: s, len });
    s += len;
  }
  return out;
}

const chainLength = (segs: Seg[]): number => (segs.length ? segs[segs.length - 1].s0 + segs[segs.length - 1].len : 0);

function atSeg(g: Seg, u: number): Vec2 {
  return { x: g.a.x + (g.b.x - g.a.x) * u, y: g.a.y + (g.b.y - g.a.y) * u };
}

function atArc(segs: Seg[], s: number): { p: Vec2; t: Vec2 } {
  const total = chainLength(segs);
  const q = Math.max(0, Math.min(total, s));
  for (const g of segs) {
    if (q <= g.s0 + g.len || g === segs[segs.length - 1]) {
      return { p: atSeg(g, (q - g.s0) / g.len), t: dirOf(g.a, g.b) };
    }
  }
  return { p: segs[0].a, t: dirOf(segs[0].a, segs[0].b) };
}

/** The piece of a chain between two arc positions, as a polyline. */
function sliceChain(segs: Seg[], s0: number, s1: number): Vec2[] {
  const out: Vec2[] = [];
  for (const g of segs) {
    const a = Math.max(s0, g.s0), b = Math.min(s1, g.s0 + g.len);
    if (b - a < 1e-6) continue;
    const pa = atSeg(g, (a - g.s0) / g.len);
    const last = out[out.length - 1];
    if (!last || Math.hypot(last.x - pa.x, last.y - pa.y) > 1e-6) out.push(pa);
    out.push(atSeg(g, (b - g.s0) / g.len));
  }
  return out;
}

/**
 * Offset a polyline sideways by `d`, mitred at the joints.
 *
 * A plain per-segment offset leaves a wedge open at every corner, which on a
 * wall reads as a gap you can see through. The miter is clamped because a
 * hairpin turn drives its length to infinity and would fling the corner of the
 * curtain off the map.
 */
function offsetPolyline(pts: Vec2[], closed: boolean, d: number): Vec2[] {
  const n = pts.length;
  const count = closed ? n : n - 1;
  const dirs: Vec2[] = [];
  for (let i = 0; i < count; i++) dirs.push(dirOf(pts[i], pts[(i + 1) % n]));
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const dPrev = closed ? dirs[(i - 1 + count) % count] : (i > 0 ? dirs[i - 1] : null);
    const dNext = closed ? dirs[i % count] : (i < count ? dirs[i] : null);
    const nPrev = dPrev ? leftOf(dPrev) : null;
    const nNext = dNext ? leftOf(dNext) : null;
    if (nPrev && nNext) {
      const m = norm({ x: nPrev.x + nNext.x, y: nPrev.y + nNext.y });
      const cos = Math.max(0.3, m.x * nNext.x + m.y * nNext.y);
      out.push({ x: pts[i].x + (m.x * d) / cos, y: pts[i].y + (m.y * d) / cos });
    } else {
      const nn = (nPrev || nNext)!;
      out.push({ x: pts[i].x + nn.x * d, y: pts[i].y + nn.y * d });
    }
  }
  return out;
}

function signedArea(pts: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return a / 2;
}

function boundsOfAll(groups: Vec2[][], pad: number): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const g of groups) {
    for (const p of g) {
      if (p.x < x0) x0 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.x > x1) x1 = p.x;
      if (p.y > y1) y1 = p.y;
    }
  }
  if (!Number.isFinite(x0)) return { x: 0, y: 0, w: 1, h: 1 };
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
}

/**
 * Map pixels per foot.
 *
 * Fortification is dimensioned in feet. A tactical grid says how many feet a
 * cell is and the conversion is exact; a region map's cell is twenty-four
 * miles, and scaling a 10 ft curtain by that gives a hairline — so anything not
 * measured in feet is treated as the usual 5 ft square.
 */
export function feetToPx(grid: GridConfig): number {
  const perCell = grid.unitLabel === 'ft' && grid.unitsPerCell > 0 ? grid.unitsPerCell : 5;
  return (grid.size || 70) / perCell;
}

/** Nearest point on the run to `p`, as a segment index and a fraction along it. */
export function nearestSpot(pts: Vec2[], closed: boolean, p: Vec2): RunSpot | null {
  const segs = segments(pts, closed);
  if (!segs.length) return null;
  let best: RunSpot = { index: 0, t: 0.5 };
  let bestD = Infinity;
  segs.forEach((g, i) => {
    const vx = g.b.x - g.a.x, vy = g.b.y - g.a.y;
    const t = Math.max(0, Math.min(1, ((p.x - g.a.x) * vx + (p.y - g.a.y) * vy) / (vx * vx + vy * vy)));
    const q = atSeg(g, t);
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < bestD) { bestD = d; best = { index: i, t }; }
  });
  return best;
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

/**
 * Everything the wall run is, worked out once.
 *
 * The seed comes from the geometry alone, so nudging a setting redraws the same
 * wall with the same merlons missing from the same places — a run that
 * reshuffles its own ruin every time you toggle a checkbox is unusable.
 */
export function planCurtain(
  pts: Vec2[], closed: boolean, o: CurtainOptions, grid: GridConfig, gateAt: RunSpot | null = null,
): CurtainPlan | null {
  if (pts.length < 2 || (closed && pts.length < 3)) return null;
  const segs = segments(pts, closed);
  if (!segs.length) return null;

  const cell = grid.size || 70;
  const ftPx = feetToPx(grid);
  const half = Math.max((o.thickness * ftPx) / 2, cell * 0.16);
  const seed = RNG.hash(`${closed ? 'R' : 'L'}${pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('|')}`);
  const rng = new RNG(seed);

  const a = offsetPolyline(pts, closed, half);
  const b = offsetPolyline(pts, closed, -half);
  // On a ring the outward face is whichever offset encloses more ground; on an
  // open run there is no inside, so the left hand of travel is called outward.
  const flip = closed && Math.abs(signedArea(b)) > Math.abs(signedArea(a));
  const outer = flip ? b : a;
  const inner = flip ? a : b;
  const sign = flip ? -1 : 1;
  const outwardAt = (t: Vec2): Vec2 => { const n = leftOf(t); return { x: n.x * sign, y: n.y * sign }; };

  const parapetRaw = Math.min(half * 0.45, ftPx * 3);
  const walkWidth = half * 2 - parapetRaw * 2;
  const hasWalk = o.wallWalk && walkWidth > cell * 0.35;
  const parapet = hasWalk ? parapetRaw : 0;
  const walkOuter = hasWalk ? offsetPolyline(pts, closed, (half - parapet) * sign) : null;
  const walkInner = hasWalk ? offsetPolyline(pts, closed, -(half - parapet) * sign) : null;

  const lengthPx = chainLength(segs);

  // --- Towers -------------------------------------------------------------
  const towers: CurtainTower[] = [];
  const tr = Math.max(half * 1.8, ftPx * 10);
  if (o.towers !== 'none') {
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      if (!closed && (i === 0 || i === n - 1)) {
        // The end of an open run is capped by a tower facing along the wall —
        // the direction the wall would have continued in is the exposed one.
        const g = i === 0 ? segs[0] : segs[segs.length - 1];
        const d = dirOf(g.a, g.b);
        towers.push({
          x: pts[i].x, y: pts[i].y, r: tr, n: i === 0 ? { x: -d.x, y: -d.y } : d,
          shape: o.towerShape, ruined: false, corner: true, gate: false,
        });
        continue;
      }
      const dPrev = dirOf(pts[(i - 1 + n) % n], pts[i]);
      const dNext = dirOf(pts[i], pts[(i + 1) % n]);
      const m = norm({ x: leftOf(dPrev).x + leftOf(dNext).x, y: leftOf(dPrev).y + leftOf(dNext).y });
      towers.push({
        x: pts[i].x, y: pts[i].y, r: tr, n: { x: m.x * sign, y: m.y * sign },
        shape: o.towerShape, ruined: false, corner: true, gate: false,
      });
    }
    if (o.towers === 'corners+spacing') {
      const spacing = Math.max(cell * 2, o.towerSpacing * ftPx);
      for (const g of segs) {
        const count = Math.max(0, Math.round(g.len / spacing) - 1);
        const t = dirOf(g.a, g.b);
        const nOut = outwardAt(t);
        for (let k = 1; k <= count; k++) {
          const p = atSeg(g, k / (count + 1));
          towers.push({ x: p.x, y: p.y, r: tr, n: nOut, shape: o.towerShape, ruined: false, corner: false, gate: false });
        }
      }
    }
  }

  // --- Gatehouse ----------------------------------------------------------
  let gate: CurtainGate | null = null;
  if (o.gatehouse) {
    let spot = gateAt;
    if (!spot) {
      // Fallback placement: the longest run of wall is where the road would
      // meet it, and it is the only stretch with room for a gatehouse.
      let bestLen = -1;
      segs.forEach((g, i) => { if (g.len > bestLen) { bestLen = g.len; spot = { index: i, t: 0.5 }; } });
    }
    const g = spot ? segs[Math.max(0, Math.min(segs.length - 1, spot.index))] : null;
    if (g && spot) {
      // Not the `str/gatehouse` asset: it draws its own pair of square towers
      // at its own scale, which never lines up with the passage carved here.
      // The drums are real geometry instead — two ordinary towers flanking a
      // cart-wide passage — so the curtain, the art and the walls all agree.
      let passage = Math.max(ftPx * 10, half * 1.4);
      let drum = Math.max(half * 1.5, ftPx * 7);
      const k = Math.min(1, (g.len * 0.85) / (passage + drum * 4));
      if (k > 0.45) {
        passage *= k;
        drum *= k;
        const span = passage + drum * 4;
        const t = dirOf(g.a, g.b);
        const nOut = outwardAt(t);
        const u = Math.max(span / 2 + cell * 0.2, Math.min(g.len - span / 2 - cell * 0.2, g.len * spot.t));
        const p = atSeg(g, u / g.len);
        gate = { p, t, n: nOut, span, depth: drum * 2, passage, s: g.s0 + u };
        for (const side of [-1, 1]) {
          const off = passage / 2 + drum * 0.95;
          towers.push({
            x: p.x + t.x * off * side, y: p.y + t.y * off * side, r: drum,
            n: nOut, shape: 'round', ruined: false, corner: false, gate: true,
          });
        }
      }
    }
  }

  // A bastion is drawn with its flanks retiring onto the curtain, so its centre
  // is not on the wall line — push it out until the flanks land on the masonry.
  for (const t of towers) {
    if (t.shape !== 'square') continue;
    t.x += t.n.x * t.r * 0.45;
    t.y += t.n.y * t.r * 0.45;
  }

  // A gate whose drums have fallen is a hole, not a gate; leave those standing.
  for (const t of towers) t.ruined = !t.gate && rng.next() < o.ruined * 0.6;

  // --- Breaches -----------------------------------------------------------
  const breaches: CurtainBreach[] = [];
  if (o.ruined > 0.02) {
    const wanted = Math.round((o.ruined * (lengthPx / cell)) / 22 + (o.ruined > 0.15 ? 1 : 0));
    for (let i = 0, tries = 0; i < wanted && tries < wanted * 30; tries++) {
      const s = rng.next() * lengthPx;
      const { p, t } = atArc(segs, s);
      if (towers.some((w) => Math.hypot(w.x - p.x, w.y - p.y) < w.r + cell)) continue;
      if (gate && Math.abs(s - gate.s) < gate.span) continue;
      if (breaches.some((w) => Math.abs(w.s - s) < w.half * 2 + cell)) continue;
      i++;
      breaches.push({ p, t, n: outwardAt(t), half: rng.float(1.2, 1.4 + o.ruined * 2.6) * cell * 0.5, s });
    }
  }

  const towerPts = towers.map((t) => [{ x: t.x - t.r, y: t.y - t.r }, { x: t.x + t.r, y: t.y + t.r }]).flat();
  const gatePts = gate
    ? [-1, 1].flatMap((sd) => [-1, 1].map((se) => ({
      x: gate!.p.x + gate!.t.x * (gate!.span / 2) * sd + gate!.n.x * (gate!.depth / 2) * se,
      y: gate!.p.y + gate!.t.y * (gate!.span / 2) * sd + gate!.n.y * (gate!.depth / 2) * se,
    })))
    : [];

  return {
    pts, closed, cell, ftPx, half, parapet,
    outer, inner, outSign: sign, walkOuter, walkInner,
    towers, gate, breaches,
    lengthPx,
    lengthUnits: (lengthPx / cell) * (grid.unitsPerCell || 5),
    unitLabel: grid.unitLabel || 'ft',
    bounds: boundsOfAll([outer, inner, towerPts, gatePts], cell * 1.4),
    seed,
  };
}

// ---------------------------------------------------------------------------
// Painting
// ---------------------------------------------------------------------------

function tracePoly(ctx: CanvasRenderingContext2D, pts: Vec2[], closed: boolean): void {
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  if (closed) ctx.closePath();
}

/** The band between two offset faces, as one fillable path. */
function traceBand(ctx: CanvasRenderingContext2D, outer: Vec2[], inner: Vec2[], closed: boolean): void {
  ctx.beginPath();
  if (closed) {
    tracePoly(ctx, outer, true);
    tracePoly(ctx, inner, true);
  } else {
    tracePoly(ctx, outer, false);
    for (let i = inner.length - 1; i >= 0; i--) ctx.lineTo(inner[i].x, inner[i].y);
    ctx.closePath();
  }
}

const fillBand = (ctx: CanvasRenderingContext2D, outer: Vec2[], inner: Vec2[], closed: boolean) => {
  traceBand(ctx, outer, inner, closed);
  ctx.fill(closed ? 'evenodd' : 'nonzero');
};

function traceTower(ctx: CanvasRenderingContext2D, t: CurtainTower): void {
  ctx.beginPath();
  if (t.shape === 'round') { ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); return; }
  tracePoly(ctx, towerPolygon(t), true);
}

/** The footprint of a tower as a polygon — used for the paint and the walls alike. */
function towerPolygon(t: CurtainTower): Vec2[] {
  const a0 = Math.atan2(t.n.y, t.n.x);
  if (t.shape === 'square') {
    const co = Math.cos(a0), si = Math.sin(a0);
    return BASTION.map(([u, v]) => ({
      x: t.x + co * v * t.r - si * u * t.r,
      y: t.y + si * v * t.r + co * u * t.r,
    }));
  }
  const n = 16;
  return Array.from({ length: n }, (_, i) => {
    const a = a0 + (i / n) * Math.PI * 2;
    return { x: t.x + Math.cos(a) * t.r, y: t.y + Math.sin(a) * t.r };
  });
}

function traceRotatedRect(ctx: CanvasRenderingContext2D, c: Vec2, t: Vec2, along: number, across: number): void {
  const n = leftOf(t);
  ctx.beginPath();
  for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    const x = c.x + t.x * (along / 2) * su + n.x * (across / 2) * sv;
    const y = c.y + t.y * (along / 2) * su + n.y * (across / 2) * sv;
    if (su === -1 && sv === -1) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** Every hole the plan puts through the wall: collapses, and the gate passage. */
function cutHoles(ctx: CanvasRenderingContext2D, plan: CurtainPlan): void {
  ctx.globalCompositeOperation = 'destination-out';
  for (const b of plan.breaches) {
    // An ellipse across the wall, not a rectangle: a collapse tapers at the
    // shoulders, and a square-ended hole reads as a doorway someone cut.
    ctx.beginPath();
    ctx.ellipse(b.p.x, b.p.y, b.half, plan.half * 1.35, Math.atan2(b.t.y, b.t.x), 0, Math.PI * 2);
    ctx.fill();
  }
  if (plan.gate) {
    traceRotatedRect(ctx, plan.gate.p, plan.gate.t, plan.gate.passage, plan.gate.depth + plan.half * 2 + 4);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function bodyMask(plan: CurtainPlan) {
  const r = plan.bounds;
  return maskFromPaths(r.x, r.y, r.w, r.h, (ctx) => {
    fillBand(ctx, plan.outer, plan.inner, plan.closed);
    if (plan.walkOuter && plan.walkInner) {
      // The walk is a floor, not masonry: cut it out here and paint it as
      // flagstone, leaving the two parapets as the solid part of the curtain.
      ctx.globalCompositeOperation = 'destination-out';
      fillBand(ctx, plan.walkOuter, plan.walkInner, plan.closed);
      ctx.globalCompositeOperation = 'source-over';
    }
    for (const t of plan.towers) { traceTower(ctx, t); ctx.fill(); }
    cutHoles(ctx, plan);
  });
}

/** Everything under foot: the walk, and the paved road through the gate. */
function floorMask(plan: CurtainPlan) {
  const r = plan.bounds;
  return maskFromPaths(r.x, r.y, r.w, r.h, (ctx) => {
    if (plan.walkOuter && plan.walkInner) fillBand(ctx, plan.walkOuter, plan.walkInner, plan.closed);
    if (plan.gate) {
      traceRotatedRect(ctx, plan.gate.p, plan.gate.t, plan.gate.passage, plan.gate.depth);
      ctx.fill();
    }
    for (const b of plan.breaches) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.ellipse(b.p.x, b.p.y, b.half, plan.half * 1.35, Math.atan2(b.t.y, b.t.x), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
  });
}

function breachMask(plan: CurtainPlan) {
  const r = plan.bounds;
  return maskFromPaths(r.x, r.y, r.w, r.h, (ctx) => {
    for (const b of plan.breaches) {
      ctx.beginPath();
      ctx.ellipse(b.p.x, b.p.y, b.half, plan.half * 1.35, Math.atan2(b.t.y, b.t.x), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** The wall itself — masonry courses, palisade timber or a turf bank. */
export function paintCurtainBody(ctx: CanvasRenderingContext2D, plan: CurtainPlan, o: CurtainOptions, paletteId: string): void {
  const p = paletteById(paletteId);
  const m = bodyMask(plan);
  const ink = Math.max(1.5, plan.cell * 0.045);
  if (o.material === 'timber') {
    stencil(ctx, m, 'wood-planks', paletteId, { tint: '#3a2716', tintAlpha: 0.4 });
    inkOutline(ctx, m, ink, rgba(mix(p.ink, '#000000', 0.35), 0.9));
  } else if (o.material === 'earth') {
    stencil(ctx, m, 'dirt', paletteId, {
      tint: mix(p.highland, '#000000', 0.2), tintAlpha: 0.4, drift: 0.9, seed: plan.seed + 97,
    });
    rimShade(ctx, m, plan.cell * 0.75, 0.6, '#1a1408');
  } else {
    stencil(ctx, m, 'rock', paletteId, { drift: 0.7, seed: plan.seed + 101 });
    inkOutline(ctx, m, ink, rgba(mix(p.ink, '#000000', 0.35), 0.9));
  }
  freeMask(m);
}

/**
 * The ground the wall stands on: the fighting platform, the paved gate
 * passage, and the spill of stone where the curtain has come down. A breach
 * left as a hole in the paint shows the sheet behind it, which reads as a pit.
 */
export function paintCurtainFloor(
  ctx: CanvasRenderingContext2D, plan: CurtainPlan, o: CurtainOptions, paletteId: string,
): void {
  if (plan.walkOuter || plan.gate) {
    const m = floorMask(plan);
    // You walk on what the wall is made of: flags on masonry, a plank fighting
    // deck behind a palisade, beaten earth on top of a bank.
    if (o.material === 'timber') stencil(ctx, m, 'wood-planks', paletteId, { tint: '#4a331f', tintAlpha: 0.2 });
    else if (o.material === 'earth') stencil(ctx, m, 'dirt', paletteId, { drift: 0.7, seed: plan.seed + 61 });
    else stencil(ctx, m, 'flagstone', paletteId, {});
    freeMask(m);
  }
  if (plan.breaches.length) {
    const m = breachMask(plan);
    stencil(ctx, m, 'scree', paletteId, { drift: 0.8, seed: plan.seed + 83 });
    freeMask(m);
  }
}

/** The cast shadow that stands the wall up off the ground. */
export function paintCurtainShadow(ctx: CanvasRenderingContext2D, plan: CurtainPlan): void {
  const m = bodyMask(plan);
  castShadow(ctx, m, plan.cell * 0.16, plan.cell * 0.22, plan.cell * 0.22);
  freeMask(m);
}

// ---------------------------------------------------------------------------
// Walls
// ---------------------------------------------------------------------------

interface Cut { s0: number; s1: number; kind: WallKind | 'gap' }

function chainWalls(segs: Seg[], cuts: Cut[]): Wall[] {
  const total = chainLength(segs);
  const kept: Cut[] = [];
  for (const c of cuts.slice().sort((x, y) => x.s0 - y.s0)) {
    const s0 = Math.max(0, c.s0), s1 = Math.min(total, c.s1);
    if (s1 - s0 < 1e-3) continue;
    if (kept.length && s0 < kept[kept.length - 1].s1) continue;
    kept.push({ s0, s1, kind: c.kind });
  }
  const out: Wall[] = [];
  const run = (s0: number, s1: number, kind: WallKind) => {
    if (s1 - s0 < 1e-3) return;
    const chain = sliceChain(segs, s0, s1);
    for (let i = 1; i < chain.length; i++) out.push(makeWall(chain[i - 1], chain[i], kind));
  };
  let cursor = 0;
  for (const c of kept) {
    run(cursor, c.s0, 'wall');
    if (c.kind !== 'gap') run(c.s0, c.s1, c.kind);
    cursor = c.s1;
  }
  run(cursor, total, 'wall');
  return out;
}

/**
 * The VTT wall set.
 *
 * Both faces of the curtain, because a wall a figure can stand *on* is two
 * barriers with a walk between them — one face is a parapet you take cover
 * behind and the other is the drop into the bailey. Arrow loops go in the outer
 * face only; nobody shoots inwards.
 */
export function curtainWalls(plan: CurtainPlan, o: CurtainOptions): Wall[] {
  const outerSegs = segments(plan.outer, plan.closed);
  const innerSegs = segments(plan.inner, plan.closed);
  if (!outerSegs.length || !innerSegs.length) return [];
  const centreLen = plan.lengthPx || 1;
  const outerLen = chainLength(outerSegs);
  const innerLen = chainLength(innerSegs);

  const faceCuts = (faceLen: number, withSlits: boolean): Cut[] => {
    const k = faceLen / centreLen;
    const cuts: Cut[] = [];
    for (const b of plan.breaches) cuts.push({ s0: (b.s - b.half) * k, s1: (b.s + b.half) * k, kind: 'gap' });
    if (plan.gate) {
      const w = plan.gate.passage / 2 + plan.half;
      cuts.push({ s0: (plan.gate.s - w) * k, s1: (plan.gate.s + w) * k, kind: 'gap' });
    }
    // A wall stripped to a shell has no loops left to speak of, only holes.
    if (withSlits && o.ruined <= 0.75) {
      // Every 20 ft, floored at two and a half cells so a coarse grid does not
      // end up with two loops in one square. Not derived from the tower
      // spacing: loops are cut to suit a bowman, towers to suit a wall.
      const spacing = Math.max(plan.cell * 2.5, plan.ftPx * 20);
      const w = plan.ftPx * 2.5;
      for (let s = spacing / 2; s < faceLen - w; s += spacing) cuts.push({ s0: s, s1: s + w, kind: 'window' });
    }
    return cuts;
  };

  const walls = [
    ...chainWalls(outerSegs, faceCuts(outerLen, true)),
    ...chainWalls(innerSegs, faceCuts(innerLen, false)),
  ];

  // Towers: only the part that projects past the curtain is a barrier of its
  // own. Ringing the whole drum would also wall the garrison out of it.
  for (const t of plan.towers) {
    const poly = towerPolygon(t);
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const mx = (a.x + b.x) / 2 - t.x, my = (a.y + b.y) / 2 - t.y;
      const l = Math.hypot(mx, my) || 1;
      if ((mx / l) * t.n.x + (my / l) * t.n.y < -0.15) continue;
      walls.push(makeWall(a, b, 'wall'));
    }
  }

  if (plan.gate) {
    const g = plan.gate;
    const at = (u: number, v: number): Vec2 => ({ x: g.p.x + g.t.x * u + g.n.x * v, y: g.p.y + g.t.y * u + g.n.y * v });
    const out = g.depth / 2, back = -g.depth / 2, hw = g.passage / 2;
    for (const side of [-1, 1]) walls.push(makeWall(at(hw * side, out), at(hw * side, back), 'wall'));
    // Two barriers, as a gatehouse actually worked: the portcullis drops at the
    // outer face and the timber gates close at the inner. In a VTT that is the
    // difference between a gate the party can be trapped inside and one door.
    const portcullis = makeWall(at(-hw, out * 0.92), at(hw, out * 0.92), 'door');
    portcullis.doorState = 'locked';
    walls.push(portcullis, makeWall(at(-hw, back * 0.92), at(hw, back * 0.92), 'door'));
  }

  return walls;
}

// ---------------------------------------------------------------------------
// Stamps and lights
// ---------------------------------------------------------------------------

/**
 * The drawn furniture on top of the paint.
 *
 * Crest, towers and gatehouse are library assets rather than more painting: a
 * GM will want to drag a tower two squares along, and the generator already
 * dresses its own wards this way.
 */
export function curtainStamps(plan: CurtainPlan, o: CurtainOptions): StampObject[] {
  const rng = new RNG(plan.seed ^ 0x5ca1e);
  const out: StampObject[] = [];
  const shadow = { color: 'rgba(0,0,0,0.42)', blur: plan.cell * 0.22, dx: plan.cell * 0.07, dy: plan.cell * 0.1 };

  // --- Crest --------------------------------------------------------------
  // Stone only gets a battlement band when the GM asked for one; timber and
  // earth *are* their crest — stakes and a turf bank — so those always run.
  const crestAsset = o.material === 'stone' ? 'str/wall-segment' : o.material === 'timber' ? 'str/palisade' : 'str/rampart';
  if (o.material !== 'stone' || o.crenellations) {
    const segs = segments(plan.pts, plan.closed);
    const step = (o.material === 'stone' ? 2.6 : o.material === 'timber' ? 2.4 : 3.2) * plan.cell;
    const band = plan.parapet > 0 ? plan.parapet : plan.half * 2;
    // Each asset carries its crest at a different fraction of its own height;
    // these put the drawn battlement on the drawn wall rather than beside it.
    const bandToHeight = o.material === 'stone' ? 2.5 : o.material === 'timber' ? 2.3 : 0;
    const total = chainLength(segs);
    // With a walk the battlement belongs on the outer parapet; without one the
    // whole thickness is the crest and it sits on the centreline.
    const off = plan.parapet > 0 ? (plan.half - plan.parapet / 2) * plan.outSign : 0;
    for (let s = step / 2; s < total; s += step) {
      // A ruin loses its merlons before it loses its wall.
      if (rng.next() < o.ruined * 0.8) continue;
      const { p, t } = atArc(segs, s);
      if (plan.breaches.some((b) => Math.abs(b.s - s) < b.half + step * 0.4)) continue;
      if (plan.gate && Math.abs(s - plan.gate.s) < plan.gate.span * 0.6) continue;
      if (plan.towers.some((w) => Math.hypot(w.x - p.x, w.y - p.y) < w.r * 0.85)) continue;
      const n = leftOf(t);
      out.push(makeStamp(crestAsset, p.x + n.x * off, p.y + n.y * off, step * 1.08,
        bandToHeight ? band * bandToHeight : (step * 1.08) / 3, {
          rotation: deg(t),
          opacity: o.material === 'earth' ? 0.75 : 0.95,
          seed: rng.int(1, 1e6),
          name: 'Battlements',
        }));
    }
  }

  // --- Towers -------------------------------------------------------------
  for (const t of plan.towers) {
    out.push(makeStampAuto(t.shape === 'round' ? 'str/round-tower' : 'str/bastion', t.x, t.y, t.r * 2.05, {
      // The bastion's salient is drawn pointing up; turn it to face the field.
      rotation: t.shape === 'square' ? deg(t.n) + 90 : 0,
      opacity: t.ruined ? 0.72 : 1,
      seed: rng.int(1, 1e6),
      name: t.gate ? 'Gate tower' : t.ruined ? 'Ruined tower' : t.corner ? 'Corner tower' : 'Mural tower',
      shadow,
    }));
  }

  // --- Gatehouse and rubble ----------------------------------------------
  if (plan.gate) {
    const g = plan.gate;
    out.push(makeStamp('dgn/portcullis', g.p.x + g.n.x * g.depth * 0.42, g.p.y + g.n.y * g.depth * 0.42,
      g.passage * 1.04, plan.half * 0.7, { rotation: deg(g.t), seed: rng.int(1, 1e6), name: 'Portcullis' }));
    out.push(makeStamp('dgn/double-door', g.p.x - g.n.x * g.depth * 0.42, g.p.y - g.n.y * g.depth * 0.42,
      g.passage * 1.02, plan.half * 0.8, { rotation: deg(g.t), seed: rng.int(1, 1e6), name: 'Gates' }));
  }
  for (const b of plan.breaches) {
    out.push(makeStampAuto('dgn/rubble', b.p.x, b.p.y, b.half * 1.5, {
      rotation: rng.float(0, 360), opacity: 0.9, seed: rng.int(1, 1e6), name: 'Collapsed curtain',
    }));
  }
  for (const t of plan.towers) {
    if (!t.ruined) continue;
    const a = rng.float(0, Math.PI * 2);
    out.push(makeStampAuto('dgn/rubble', t.x + Math.cos(a) * t.r * 0.55, t.y + Math.sin(a) * t.r * 0.55, t.r * 0.9, {
      rotation: rng.float(0, 360), opacity: 0.9, seed: rng.int(1, 1e6), name: 'Fallen masonry',
    }));
  }
  return out;
}

/** Braziers on the tower tops — on a night map they are what the garrison sees by. */
export function curtainLights(plan: CurtainPlan): LightSource[] {
  const unit = plan.ftPx;
  const out: LightSource[] = [];
  for (const t of plan.towers) {
    if (t.ruined) continue;
    out.push(makeLight(t.x, t.y, plan.cell, {
      bright: (t.gate ? 25 : 20) * unit, dim: (t.gate ? 50 : 40) * unit,
      color: '#ffae5c', animation: 'flame',
      name: t.gate ? 'Gatehouse lantern' : 'Tower brazier',
    }));
  }
  return out;
}
