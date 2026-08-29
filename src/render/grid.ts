/** Grid drawing plus the hex/square maths used for snapping and generators. */
import type { GridConfig, HexLabelStyle, Rect, Vec2 } from '../core/types';
import { rgba } from '../core/color';

export function drawGrid(ctx: CanvasRenderingContext2D, grid: GridConfig, area: Rect, zoom = 1): void {
  if (!grid.visible || grid.type === 'none' || grid.size <= 0) return;
  // Hide the grid when it would turn into a solid wash of lines.
  if (grid.size * zoom < 3) return;

  ctx.save();
  ctx.globalAlpha = grid.opacity;
  ctx.strokeStyle = grid.color;
  ctx.lineWidth = Math.max(0.4, grid.lineWidth / zoom);

  switch (grid.type) {
    case 'square': drawSquare(ctx, grid, area); break;
    case 'hexPointy': drawHex(ctx, grid, area, true, zoom); break;
    case 'hexFlat': drawHex(ctx, grid, area, false, zoom); break;
    case 'isometric': drawIso(ctx, grid, area); break;
  }
  ctx.restore();
}

function drawSquare(ctx: CanvasRenderingContext2D, g: GridConfig, area: Rect): void {
  const s = g.size;
  const x0 = Math.floor((area.x - g.offsetX) / s) * s + g.offsetX;
  const y0 = Math.floor((area.y - g.offsetY) / s) * s + g.offsetY;
  const x1 = area.x + area.w, y1 = area.y + area.h;

  ctx.beginPath();
  for (let x = x0; x <= x1; x += s) { ctx.moveTo(x, area.y); ctx.lineTo(x, y1); }
  for (let y = y0; y <= y1; y += s) { ctx.moveTo(area.x, y); ctx.lineTo(x1, y); }
  ctx.stroke();

  if (g.majorEvery > 1) {
    const m = s * g.majorEvery;
    const mx0 = Math.floor((area.x - g.offsetX) / m) * m + g.offsetX;
    const my0 = Math.floor((area.y - g.offsetY) / m) * m + g.offsetY;
    ctx.save();
    ctx.lineWidth *= 2.2;
    ctx.globalAlpha = Math.min(1, ctx.globalAlpha * 1.6);
    ctx.beginPath();
    for (let x = mx0; x <= x1; x += m) { ctx.moveTo(x, area.y); ctx.lineTo(x, y1); }
    for (let y = my0; y <= y1; y += m) { ctx.moveTo(area.x, y); ctx.lineTo(x1, y); }
    ctx.stroke();
    ctx.restore();
  }
}

function drawIso(ctx: CanvasRenderingContext2D, g: GridConfig, area: Rect): void {
  const s = g.size;
  const diag = area.w + area.h;
  ctx.beginPath();
  for (let i = -diag; i < diag; i += s) {
    ctx.moveTo(area.x + i, area.y);
    ctx.lineTo(area.x + i + area.h, area.y + area.h);
    ctx.moveTo(area.x + i, area.y);
    ctx.lineTo(area.x + i - area.h, area.y + area.h);
  }
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Hex maths
// ---------------------------------------------------------------------------

export interface HexMetrics {
  /** Distance between adjacent hex centres horizontally. */
  colStep: number;
  rowStep: number;
  width: number;
  height: number;
}

export function hexMetrics(size: number, pointy: boolean): HexMetrics {
  if (pointy) {
    // `size` is the width across flats.
    const w = size;
    const h = (size * 2) / Math.sqrt(3);
    return { colStep: w, rowStep: h * 0.75, width: w, height: h };
  }
  const h = size;
  const w = (size * 2) / Math.sqrt(3);
  return { colStep: w * 0.75, rowStep: h, width: w, height: h };
}

export function hexCenter(col: number, row: number, g: GridConfig): Vec2 {
  const pointy = g.type !== 'hexFlat';
  const m = hexMetrics(g.size, pointy);
  if (pointy) {
    const x = g.offsetX + col * m.colStep + (row % 2 ? m.colStep / 2 : 0);
    const y = g.offsetY + row * m.rowStep;
    return { x, y };
  }
  const x = g.offsetX + col * m.colStep;
  const y = g.offsetY + row * m.rowStep + (col % 2 ? m.rowStep / 2 : 0);
  return { x, y };
}

export function hexCorners(center: Vec2, g: GridConfig): Vec2[] {
  const pointy = g.type !== 'hexFlat';
  const m = hexMetrics(g.size, pointy);
  const r = pointy ? m.height / 2 : m.width / 2;
  const pts: Vec2[] = [];
  for (let i = 0; i < 6; i++) {
    const a = pointy ? (Math.PI / 180) * (60 * i - 90) : (Math.PI / 180) * (60 * i);
    pts.push({ x: center.x + r * Math.cos(a), y: center.y + r * Math.sin(a) });
  }
  return pts;
}

/**
 * Below this many screen pixels across, a hex has no room for its number and
 * the map is better off without four digits smeared over every cell.
 */
const HEX_LABEL_MIN_PX = 38;

function drawHex(
  ctx: CanvasRenderingContext2D, g: GridConfig, area: Rect, pointy: boolean, zoom: number,
): void {
  const m = hexMetrics(g.size, pointy);
  const cols = Math.ceil(area.w / m.colStep) + 2;
  const rows = Math.ceil(area.h / m.rowStep) + 2;
  const c0 = Math.floor((area.x - g.offsetX) / m.colStep) - 1;
  const r0 = Math.floor((area.y - g.offsetY) / m.rowStep) - 1;

  ctx.beginPath();
  for (let r = r0; r < r0 + rows; r++) {
    for (let c = c0; c < c0 + cols; c++) {
      const center = hexCenter(c, r, g);
      const pts = hexCorners(center, g);
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < 6; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
    }
  }
  ctx.stroke();

  const style = g.hexLabels ?? 'none';
  if (style === 'none' || g.size * zoom < HEX_LABEL_MIN_PX) return;

  // The number sits in the upper part of the hex, the way a printed hex map
  // does it: it stays out of the way of whatever terrain is stamped in the
  // middle, and a column of them reads as a column.
  ctx.save();
  ctx.globalAlpha = Math.min(1, ctx.globalAlpha * 2.2);
  ctx.fillStyle = ctx.strokeStyle as string;
  ctx.font = `${Math.round(g.size * 0.17)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let r = r0; r < r0 + rows; r++) {
    for (let c = c0; c < c0 + cols; c++) {
      const center = hexCenter(c, r, g);
      ctx.fillText(hexLabel(c, r, style, pointy), center.x, center.y - m.height * 0.3);
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Hex coordinates
// ---------------------------------------------------------------------------

/**
 * Offset column/row to axial (q, r).
 *
 * `hexCenter` lays pointy-top hexes out with the odd rows pushed right and
 * flat-top hexes with the odd columns pushed down — "odd-r" and "odd-q" in the
 * usual naming — so the shear that has to be undone is the one those offsets
 * introduce. The remainder is written the long way because `-1 % 2` is `-1` in
 * JavaScript and a map that runs left of the origin would come out sheared the
 * wrong way for half its width.
 */
export function hexToAxial(col: number, row: number, pointy: boolean): { q: number; r: number } {
  if (pointy) {
    const parity = ((row % 2) + 2) % 2;
    return { q: col - (row - parity) / 2, r: row };
  }
  const parity = ((col % 2) + 2) % 2;
  return { q: col, r: row - (col - parity) / 2 };
}

/**
 * How many hexes apart two hexes are.
 *
 * Not the straight-line distance: on a hex grid the six neighbours are all one
 * step away, which is the whole reason to use hexes, and measuring in pixels
 * makes a diagonal move cost more than a straight one. In cube coordinates it
 * is half the sum of the three axis differences, which is the number of steps
 * a rider actually takes.
 */
export function hexDistance(
  a: { col: number; row: number }, b: { col: number; row: number }, pointy: boolean,
): number {
  const p = hexToAxial(a.col, a.row, pointy);
  const q = hexToAxial(b.col, b.row, pointy);
  const dq = p.q - q.q, dr = p.r - q.r;
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
}

const pad = (n: number): string => (n < 0 ? '-' : '') + String(Math.abs(n)).padStart(2, '0');

/** One hex's designation under the given scheme. */
export function hexLabel(col: number, row: number, style: HexLabelStyle, pointy: boolean): string {
  if (style === 'axial') {
    const { q, r } = hexToAxial(col, row, pointy);
    return `${q},${r}`;
  }
  // One-based, because a printed hex map has no column zero.
  return `${pad(col + 1)}${pad(row + 1)}`;
}

/**
 * How many cells a document spans.
 *
 * Not `width / grid.size`: on a hex grid the rows are three quarters of a hex
 * apart, so dividing by the size counts about fifteen per cent too few of them.
 * The status bar and the canvas summary both used to get this wrong and
 * disagree with the hex numbering drawn beside them.
 */
export function gridSpan(width: number, height: number, g: GridConfig): { cols: number; rows: number } {
  const size = Math.max(1, g.size);
  if (g.type === 'hexPointy' || g.type === 'hexFlat') {
    const m = hexMetrics(size, g.type !== 'hexFlat');
    return { cols: Math.round(width / m.colStep), rows: Math.round(height / m.rowStep) };
  }
  return { cols: Math.round(width / size), rows: Math.round(height / size) };
}

/**
 * The designation of whatever hex a map point falls in, or an empty string if
 * the document is not on a hex grid or is not numbering them.
 */
export function hexDesignationAt(p: Vec2, g: GridConfig): string {
  if (g.type !== 'hexPointy' && g.type !== 'hexFlat') return '';
  const style = g.hexLabels ?? 'none';
  if (style === 'none') return '';
  const { col, row } = pointToHex(p, g);
  return hexLabel(col, row, style, g.type !== 'hexFlat');
}

/** Pixel → hex axial coordinate (offset layout, matching `hexCenter`). */
export function pointToHex(p: Vec2, g: GridConfig): { col: number; row: number } {
  const pointy = g.type !== 'hexFlat';
  const m = hexMetrics(g.size, pointy);
  if (pointy) {
    const row = Math.round((p.y - g.offsetY) / m.rowStep);
    const col = Math.round((p.x - g.offsetX - (row % 2 ? m.colStep / 2 : 0)) / m.colStep);
    return { col, row };
  }
  const col = Math.round((p.x - g.offsetX) / m.colStep);
  const row = Math.round((p.y - g.offsetY - (col % 2 ? m.rowStep / 2 : 0)) / m.rowStep);
  return { col, row };
}

// ---------------------------------------------------------------------------
// Snapping
// ---------------------------------------------------------------------------

export type SnapMode = 'none' | 'cell' | 'corner' | 'half';

export function snapPoint(p: Vec2, g: GridConfig, mode: SnapMode = 'corner'): Vec2 {
  if (!g.snap || g.type === 'none' || mode === 'none') return p;
  if (g.type === 'square') {
    const s = mode === 'half' ? g.size / 2 : g.size;
    const ox = g.offsetX % s, oy = g.offsetY % s;
    if (mode === 'cell') {
      return {
        x: Math.floor((p.x - g.offsetX) / g.size) * g.size + g.offsetX + g.size / 2,
        y: Math.floor((p.y - g.offsetY) / g.size) * g.size + g.offsetY + g.size / 2,
      };
    }
    return { x: Math.round((p.x - ox) / s) * s + ox, y: Math.round((p.y - oy) / s) * s + oy };
  }
  if (g.type === 'hexPointy' || g.type === 'hexFlat') {
    const { col, row } = pointToHex(p, g);
    return hexCenter(col, row, g);
  }
  return p;
}

/** Snap a whole rect so both corners land on the grid. */
export function snapRect(r: Rect, g: GridConfig): Rect {
  const a = snapPoint({ x: r.x, y: r.y }, g, 'corner');
  const b = snapPoint({ x: r.x + r.w, y: r.y + r.h }, g, 'corner');
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
}

export interface Measurement {
  cells: number;
  units: number;
  label: string;
  /** True when `cells` is a count of hexes rather than a pixel distance. */
  hex: boolean;
  /** Days of travel, when the grid says how far a party gets in one. */
  days?: number;
}

/**
 * Human-readable distance between two map points using the grid's units.
 *
 * On a hex grid this counts hexes rather than measuring pixels. Those are
 * different answers — a rider going three hexes up-and-across covers three
 * hexes, not the 2.6 that a ruler laid over the same two centres reports — and
 * on a hex crawl the count is the one that matters, because it is what the
 * day's travel is spent on.
 */
export function measureDistance(a: Vec2, b: Vec2, g: GridConfig, diagonalRule: 'euclidean' | 'chebyshev' | 'alternating' = 'euclidean'): Measurement {
  const hex = g.type === 'hexPointy' || g.type === 'hexFlat';
  let cells: number;
  if (hex) {
    cells = hexDistance(pointToHex(a, g), pointToHex(b, g), g.type !== 'hexFlat');
  } else {
    const dx = Math.abs(b.x - a.x) / g.size;
    const dy = Math.abs(b.y - a.y) / g.size;
    if (diagonalRule === 'chebyshev') cells = Math.max(dx, dy);
    else if (diagonalRule === 'alternating') {
      const lo = Math.min(dx, dy), hi = Math.max(dx, dy);
      cells = hi + Math.floor(lo / 2);
    } else cells = Math.hypot(dx, dy);
  }
  const units = cells * g.unitsPerCell;
  const pace = g.travelPerDay ?? 0;
  return {
    cells,
    units,
    hex,
    days: pace > 0 ? units / pace : undefined,
    label: `${units.toFixed(units < 10 ? 1 : 0)} ${g.unitLabel}`,
  };
}
