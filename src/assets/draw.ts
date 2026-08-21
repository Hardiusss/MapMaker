/**
 * Shared drawing primitives for the procedural asset library.
 *
 * These give the generated art its hand-drawn feel: wobbly ink lines, organic
 * blobs, hatching, and cheap directional shading.
 */
import type { RNG } from '../core/rng';
import type { Vec2 } from '../core/types';
import { rgba, mix } from '../core/color';

export interface DrawCtx {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  rng: RNG;
}

/** A polyline nudged off its ideal path — the base of every "inked" stroke. */
export function roughen(points: Vec2[], rng: RNG, amount: number): Vec2[] {
  return points.map((p, i) => {
    const t = i / Math.max(1, points.length - 1);
    const falloff = Math.sin(t * Math.PI) * 0.6 + 0.4;
    return { x: p.x + rng.gauss(0, amount) * falloff, y: p.y + rng.gauss(0, amount) * falloff };
  });
}

export function tracePath(ctx: CanvasRenderingContext2D, pts: Vec2[], close = false): void {
  if (!pts.length) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    const prev = pts[i - 1];
    const mx = (prev.x + p.x) / 2, my = (prev.y + p.y) / 2;
    ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
  if (close) ctx.closePath();
}

export function inkLine(ctx: CanvasRenderingContext2D, pts: Vec2[], color: string, width: number, close = false): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  tracePath(ctx, pts, close);
  ctx.stroke();
  ctx.restore();
}

export function fillPath(ctx: CanvasRenderingContext2D, pts: Vec2[], style: string | CanvasGradient | CanvasPattern): void {
  ctx.save();
  ctx.fillStyle = style;
  tracePath(ctx, pts, true);
  ctx.fill();
  ctx.restore();
}

/** Closed organic blob — clouds, canopies, rubble piles, lakes. */
export function blob(cx: number, cy: number, rx: number, ry: number, lobes: number, wobble: number, rng: RNG): Vec2[] {
  const pts: Vec2[] = [];
  const n = Math.max(8, lobes * 4);
  const phase = rng.float(0, Math.PI * 2);
  const harm = [rng.float(0.6, 1.2), rng.float(0.3, 0.8), rng.float(0.15, 0.4)];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 1
      + Math.sin(a * lobes + phase) * wobble * harm[0]
      + Math.sin(a * (lobes * 2 + 1) + phase * 1.7) * wobble * 0.5 * harm[1]
      + Math.sin(a * (lobes * 3 + 2) + phase * 2.3) * wobble * 0.25 * harm[2];
    pts.push({ x: cx + Math.cos(a) * rx * r, y: cy + Math.sin(a) * ry * r });
  }
  return pts;
}

/** Directional hatch fill clipped to the current path. Cheap shading. */
export function hatch(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  angle: number, spacing: number, color: string, width = 1,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  const diag = Math.hypot(w, h);
  const cx = x + w / 2, cy = y + h / 2;
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.beginPath();
  for (let i = -diag; i < diag; i += spacing) {
    ctx.moveTo(i, -diag / 2);
    ctx.lineTo(i, diag / 2);
  }
  ctx.stroke();
  ctx.restore();
}

/** Soft drop shadow beneath an object. */
export function groundShadow(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, rx: number, ry: number, alpha = 0.32,
): void {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
  g.addColorStop(0, rgba('#000000', alpha));
  g.addColorStop(0.6, rgba('#000000', alpha * 0.5));
  g.addColorStop(1, rgba('#000000', 0));
  ctx.save();
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Vertical light→dark gradient used for volumes lit from the upper left. */
export function lightGradient(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number, x1: number, y1: number,
  base: string, lightAmt = 0.35, darkAmt = 0.4,
): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, mix(base, '#ffffff', lightAmt));
  g.addColorStop(0.5, base);
  g.addColorStop(1, mix(base, '#000000', darkAmt));
  return g;
}

export function radialGlow(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number, color: string, alpha = 0.8,
): void {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(0.45, rgba(color, alpha * 0.45));
  g.addColorStop(1, rgba(color, 0));
  ctx.save();
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Rounded rectangle path (older Chromium in Electron may lack roundRect). */
export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

export function star(cx: number, cy: number, outer: number, inner: number, points: number, rotation = 0): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rotation + (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

export function regularPolygon(cx: number, cy: number, r: number, sides: number, rotation = 0): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i / sides) * Math.PI * 2 - Math.PI / 2;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

/** Speckle an area with small dots — gravel, foliage detail, sand. */
export function speckle(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  count: number, color: string, minR: number, maxR: number, rng: RNG,
): void {
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const px = x + rng.next() * w;
    const py = y + rng.next() * h;
    const r = rng.float(minR, maxR);
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
