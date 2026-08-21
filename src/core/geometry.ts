/** Geometry helpers shared by tools, generators and exporters. */
import type { Vec2, Rect } from './types';

export const V = (x: number, y: number): Vec2 => ({ x, y });

export function add(a: Vec2, b: Vec2): Vec2 { return { x: a.x + b.x, y: a.y + b.y }; }
export function sub(a: Vec2, b: Vec2): Vec2 { return { x: a.x - b.x, y: a.y - b.y }; }
export function mul(a: Vec2, s: number): Vec2 { return { x: a.x * s, y: a.y * s }; }
export function len(a: Vec2): number { return Math.hypot(a.x, a.y); }
export function dist(a: Vec2, b: Vec2): number { return Math.hypot(a.x - b.x, a.y - b.y); }
export function dist2(a: Vec2, b: Vec2): number { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; }
export function norm(a: Vec2): Vec2 { const l = len(a) || 1; return { x: a.x / l, y: a.y / l }; }
export function perp(a: Vec2): Vec2 { return { x: -a.y, y: a.x }; }
export function dot(a: Vec2, b: Vec2): number { return a.x * b.x + a.y * b.y; }
export function cross(a: Vec2, b: Vec2): number { return a.x * b.y - a.y * b.x; }
export function lerpV(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
export function angleOf(a: Vec2): number { return Math.atan2(a.y, a.x); }
export function rotate(p: Vec2, a: number, about: Vec2 = { x: 0, y: 0 }): Vec2 {
  const c = Math.cos(a), s = Math.sin(a);
  const dx = p.x - about.x, dy = p.y - about.y;
  return { x: about.x + dx * c - dy * s, y: about.y + dx * s + dy * c };
}
export const deg = (r: number) => (r * 180) / Math.PI;
export const rad = (d: number) => (d * Math.PI) / 180;

// ---------------------------------------------------------------------------
// Rectangles
// ---------------------------------------------------------------------------

export function rectOf(x0: number, y0: number, x1: number, y1: number): Rect {
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
}
export function rectContains(r: Rect, p: Vec2): boolean {
  return p.x >= r.x && p.y >= r.y && p.x <= r.x + r.w && p.y <= r.y + r.h;
}
export function rectIntersects(a: Rect, b: Rect): boolean {
  return !(b.x > a.x + a.w || b.x + b.w < a.x || b.y > a.y + a.h || b.y + b.h < a.y);
}
export function rectUnion(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}
export function rectExpand(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, w: r.w + by * 2, h: r.h + by * 2 };
}
export function rectCenter(r: Rect): Vec2 { return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; }
export function boundsOf(points: Vec2[]): Rect {
  if (!points.length) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// ---------------------------------------------------------------------------
// Segments & polygons
// ---------------------------------------------------------------------------

export function pointSegmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x, aby = b.y - a.y;
  const l2 = abx * abx + aby * aby;
  if (l2 === 0) return dist(p, a);
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby));
}

export function segmentsIntersect(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): Vec2 | null {
  const d1 = sub(a2, a1), d2 = sub(b2, b1);
  const denom = cross(d1, d2);
  if (Math.abs(denom) < 1e-9) return null;
  const t = cross(sub(b1, a1), d2) / denom;
  const u = cross(sub(b1, a1), d1) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a1.x + d1.x * t, y: a1.y + d1.y * t };
}

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const pi = poly[i], pj = poly[j];
    if ((pi.y > p.y) !== (pj.y > p.y) &&
        p.x < ((pj.x - pi.x) * (p.y - pi.y)) / (pj.y - pi.y) + pi.x) inside = !inside;
  }
  return inside;
}

export function polygonArea(poly: Vec2[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += poly[j].x * poly[i].y - poly[i].x * poly[j].y;
  }
  return a / 2;
}

export function polygonCentroid(poly: Vec2[]): Vec2 {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const f = poly[j].x * poly[i].y - poly[i].x * poly[j].y;
    a += f;
    cx += (poly[j].x + poly[i].x) * f;
    cy += (poly[j].y + poly[i].y) * f;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-9) return boundsOf(poly) as unknown as Vec2;
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

/** Inset (negative = outset) a simple polygon by offsetting each edge. */
export function offsetPolygon(poly: Vec2[], amount: number): Vec2[] {
  const n = poly.length;
  if (n < 3) return poly.slice();
  const sign = polygonArea(poly) > 0 ? 1 : -1;
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const prev = poly[(i - 1 + n) % n], cur = poly[i], next = poly[(i + 1) % n];
    const d1 = norm(sub(cur, prev)), d2 = norm(sub(next, cur));
    const n1 = mul(perp(d1), -sign), n2 = mul(perp(d2), -sign);
    const bis = norm(add(n1, n2));
    const cosHalf = Math.max(0.2, Math.sqrt((1 + dot(n1, n2)) / 2));
    out.push({ x: cur.x + bis.x * (amount / cosHalf), y: cur.y + bis.y * (amount / cosHalf) });
  }
  return out;
}

/** Chaikin corner cutting — cheap, stable polyline smoothing. */
export function chaikin(points: Vec2[], iterations = 2, closed = false): Vec2[] {
  let pts = points.slice();
  for (let it = 0; it < iterations; it++) {
    if (pts.length < 3) break;
    const next: Vec2[] = [];
    if (!closed) next.push(pts[0]);
    const n = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      next.push({ x: 0.75 * a.x + 0.25 * b.x, y: 0.75 * a.y + 0.25 * b.y });
      next.push({ x: 0.25 * a.x + 0.75 * b.x, y: 0.25 * a.y + 0.75 * b.y });
    }
    if (!closed) next.push(pts[pts.length - 1]);
    pts = next;
  }
  return pts;
}

/** Ramer–Douglas–Peucker simplification. Keeps wall counts sane for VTTs. */
export function simplify(points: Vec2[], epsilon = 2): Vec2[] {
  if (points.length < 3) return points.slice();
  let maxDist = 0, index = 0;
  const first = points[0], last = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = pointSegmentDistance(points[i], first, last);
    if (d > maxDist) { maxDist = d; index = i; }
  }
  if (maxDist > epsilon) {
    const left = simplify(points.slice(0, index + 1), epsilon);
    const right = simplify(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}

/** Resample a polyline to evenly spaced points. */
export function resample(points: Vec2[], spacing: number): Vec2[] {
  if (points.length < 2) return points.slice();
  const out: Vec2[] = [points[0]];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    let segLen = dist(a, b);
    if (segLen === 0) continue;
    let t = 0;
    while (carry + (segLen - t) >= spacing) {
      t += spacing - carry;
      carry = 0;
      out.push(lerpV(a, b, t / segLen));
    }
    carry += segLen - t;
  }
  const lastPt = points[points.length - 1];
  if (dist(out[out.length - 1], lastPt) > spacing * 0.25) out.push(lastPt);
  return out;
}

/** Catmull–Rom spline evaluated into a polyline. */
export function catmullRom(points: Vec2[], samplesPerSegment = 12, closed = false): Vec2[] {
  const n = points.length;
  if (n < 2) return points.slice();
  const out: Vec2[] = [];
  const get = (i: number) => points[closed ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i))];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let s = 0; s < samplesPerSegment; s++) {
      const t = s / samplesPerSegment;
      const t2 = t * t, t3 = t2 * t;
      out.push({
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  if (!closed) out.push(points[n - 1]);
  return out;
}

/** Total length of a polyline. */
export function pathLength(points: Vec2[]): number {
  let l = 0;
  for (let i = 1; i < points.length; i++) l += dist(points[i - 1], points[i]);
  return l;
}

/** Convex hull (Andrew's monotone chain). */
export function convexHull(points: Vec2[]): Vec2[] {
  const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const half = (src: Vec2[]) => {
    const h: Vec2[] = [];
    for (const p of src) {
      while (h.length >= 2 && cross(sub(h[h.length - 1], h[h.length - 2]), sub(p, h[h.length - 2])) <= 0) h.pop();
      h.push(p);
    }
    h.pop();
    return h;
  };
  return half(pts).concat(half(pts.slice().reverse()));
}

/**
 * Where two segments cross, or null. Endpoints touching does not count as a
 * crossing — consecutive segments of a polyline always share one.
 */
export function segmentIntersection(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): Vec2 | null {
  const d1x = p2.x - p1.x, d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x, d2y = p4.y - p3.y;
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-9) return null;          // parallel
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / den;
  const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / den;
  const EPS = 1e-6;
  if (t <= EPS || t >= 1 - EPS || u <= EPS || u >= 1 - EPS) return null;
  return { x: p1.x + d1x * t, y: p1.y + d1y * t };
}

/**
 * Splice out any section of a polyline that crosses an earlier part of itself.
 *
 * Smoothing a path that doubles back can pull the two halves through each
 * other, and a river that crosses its own course is the one mistake a reader
 * spots instantly. Cutting at the crossing keeps the line, loses the loop.
 */
export function removeLoops(path: Vec2[]): Vec2[] {
  const out = path.slice();
  for (let i = 0; i < out.length - 3; i++) {
    for (let j = out.length - 2; j > i + 1; j--) {
      const hit = segmentIntersection(out[i], out[i + 1], out[j], out[j + 1]);
      if (!hit) continue;
      out.splice(i + 1, j - i, hit);
      break;
    }
  }
  return out;
}
