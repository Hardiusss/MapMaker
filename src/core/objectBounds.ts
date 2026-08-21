/** Bounding boxes and hit testing for map objects. */
import type { MapObject, Rect, Vec2, GridConfig, TextObject, PathObject } from './types';
import { boundsOf, pointSegmentDistance, rectContains, rotate, rad } from './geometry';
import { pathPolyline, fontString } from '../render/objects';
import { createSurface, ctxOf } from '../util/canvas';

let measureCtx: CanvasRenderingContext2D | null = null;
function getMeasureCtx(): CanvasRenderingContext2D {
  if (!measureCtx) measureCtx = ctxOf(createSurface(8, 8));
  return measureCtx;
}

export function measureText(o: TextObject): { w: number; h: number } {
  const ctx = getMeasureCtx();
  ctx.font = fontString(o);
  const lines = o.text.split('\n');
  let w = 0;
  for (const l of lines) w = Math.max(w, ctx.measureText(l).width + o.letterSpacing * Math.max(0, l.length - 1));
  const h = lines.length * o.size * o.lineHeight;
  return { w, h };
}

/** Local-space (pre-transform) extents of an object. */
export function localBounds(o: MapObject, grid?: GridConfig): Rect {
  switch (o.kind) {
    case 'stamp':
      return { x: -o.width / 2, y: -o.height / 2, w: o.width, h: o.height };
    case 'image':
      return { x: -o.width / 2, y: -o.height / 2, w: o.width, h: o.height };
    case 'text': {
      const { w, h } = measureText(o);
      if (o.curve !== 'straight') {
        const R = Math.max(20, o.curveRadius);
        return { x: -w / 2 - o.size, y: -o.size, w: w + o.size * 2, h: Math.min(R, h + o.size * 2) + o.size };
      }
      return { x: -w / 2 - o.size * 0.2, y: -h / 2 - o.size * 0.2, w: w + o.size * 0.4, h: h + o.size * 0.4 };
    }
    case 'shape': {
      if (o.shape === 'freeform' && o.points.length) {
        const b = boundsOf(o.points);
        return { x: b.x - o.strokeWidth, y: b.y - o.strokeWidth, w: b.w + o.strokeWidth * 2, h: b.h + o.strokeWidth * 2 };
      }
      const pad = o.strokeWidth / 2;
      return { x: -o.w / 2 - pad, y: -o.h / 2 - pad, w: o.w + pad * 2, h: o.h + pad * 2 };
    }
    case 'path': {
      const pts = pathPolyline(o);
      const b = boundsOf(pts);
      const pad = o.width / 2 + o.outlineWidth + 2;
      return { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 };
    }
    case 'token': {
      const size = (grid?.size ?? 70) * o.cells;
      return { x: -size / 2, y: -size / 2, w: size, h: size };
    }
  }
}

/** World-space axis-aligned bounds after rotation and scale. */
export function objectBounds(o: MapObject, grid?: GridConfig): Rect {
  const lb = localBounds(o, grid);
  const corners: Vec2[] = [
    { x: lb.x, y: lb.y },
    { x: lb.x + lb.w, y: lb.y },
    { x: lb.x + lb.w, y: lb.y + lb.h },
    { x: lb.x, y: lb.y + lb.h },
  ].map((c) => {
    const s = { x: c.x * o.scaleX, y: c.y * o.scaleY };
    const r = o.rotation ? rotate(s, rad(o.rotation)) : s;
    return { x: r.x + o.x, y: r.y + o.y };
  });
  return boundsOf(corners);
}

/** Transform a world point into an object's local space. */
export function toLocal(o: MapObject, p: Vec2): Vec2 {
  const t = { x: p.x - o.x, y: p.y - o.y };
  const r = o.rotation ? rotate(t, rad(-o.rotation)) : t;
  return { x: r.x / (o.scaleX || 1e-6), y: r.y / (o.scaleY || 1e-6) };
}

/** Precise-enough hit test: bbox for most things, distance-to-line for paths. */
export function hitTest(o: MapObject, p: Vec2, grid?: GridConfig, tolerance = 4): boolean {
  if (!o.visible || o.locked) return false;
  const local = toLocal(o, p);
  if (o.kind === 'path') {
    const pts = pathPolyline(o);
    const tol = o.width / 2 + o.outlineWidth + tolerance;
    for (let i = 1; i < pts.length; i++) {
      if (pointSegmentDistance(local, pts[i - 1], pts[i]) <= tol) return true;
    }
    return false;
  }
  const lb = localBounds(o, grid);
  return rectContains({ x: lb.x - tolerance, y: lb.y - tolerance, w: lb.w + tolerance * 2, h: lb.h + tolerance * 2 }, local);
}

export function objectsInRect(objects: MapObject[], rect: Rect, grid?: GridConfig): MapObject[] {
  return objects.filter((o) => {
    if (!o.visible || o.locked) return false;
    const b = objectBounds(o, grid);
    return b.x >= rect.x && b.y >= rect.y && b.x + b.w <= rect.x + rect.w && b.y + b.h <= rect.y + rect.h;
  });
}
