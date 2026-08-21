/**
 * Turn map objects into VTT walls.
 *
 * Useful after hand-drawing a map: buildings, boulders and closed paths become
 * line-of-sight blockers without tracing every edge by hand.
 */
import type { MapDocument, Wall, Vec2, ShapeObject, StampObject, PathObject } from '../core/types';
import { makeWall } from '../core/factories';
import { objectBounds, localBounds } from '../core/objectBounds';
import { pathPolyline } from '../render/objects';
import { rad, rotate, simplify } from '../core/geometry';
import { assetById } from '../assets/library';

/** Asset groups whose stamps read as solid at the table. */
const BLOCKING_GROUPS = new Set(['terrain', 'settlement', 'structures']);
const BLOCKING_TAGS = new Set(['cover', 'rock', 'tree', 'boulder', 'pillar', 'column', 'statue', 'wall', 'barrier']);

export interface DeriveWallOptions {
  shapes: boolean;
  stamps: boolean;
  closedPaths: boolean;
  /** Approximate round props with this many sides. */
  sides: number;
  /** Shrink each outline slightly so tokens can hug the edge. */
  inset: number;
}

export const DEFAULT_DERIVE_OPTIONS: DeriveWallOptions = {
  shapes: true, stamps: true, closedPaths: true, sides: 8, inset: 0.9,
};

function transformed(o: { x: number; y: number; rotation: number; scaleX: number; scaleY: number }, p: Vec2): Vec2 {
  const s = { x: p.x * o.scaleX, y: p.y * o.scaleY };
  const r = o.rotation ? rotate(s, rad(o.rotation)) : s;
  return { x: r.x + o.x, y: r.y + o.y };
}

function polygonWalls(points: Vec2[], closed = true): Wall[] {
  const out: Wall[] = [];
  const n = points.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = points[i], b = points[(i + 1) % n];
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1) continue;
    out.push(makeWall(a, b, 'wall'));
  }
  return out;
}

export function deriveWallsFromDocument(doc: MapDocument, opts: Partial<DeriveWallOptions> = {}): Wall[] {
  const o = { ...DEFAULT_DERIVE_OPTIONS, ...opts };
  const walls: Wall[] = [];

  for (const layer of doc.layers) {
    if (layer.kind !== 'object' || !layer.visible) continue;

    for (const obj of layer.objects) {
      if (!obj.visible) continue;

      if (obj.kind === 'shape' && o.shapes) {
        const s = obj as ShapeObject;
        const pts = shapeOutline(s, o.sides).map((p) => transformed(s, { x: p.x * o.inset, y: p.y * o.inset }));
        walls.push(...polygonWalls(pts));
      } else if (obj.kind === 'stamp' && o.stamps) {
        const s = obj as StampObject;
        const def = assetById(s.assetId);
        const blocking = def && (BLOCKING_GROUPS.has(def.group) || def.tags.some((t) => BLOCKING_TAGS.has(t)));
        if (!blocking) continue;
        const lb = localBounds(s, doc.grid);
        const rx = (lb.w / 2) * o.inset;
        const ry = (lb.h / 2) * o.inset;
        const pts: Vec2[] = [];
        for (let i = 0; i < o.sides; i++) {
          const a = (i / o.sides) * Math.PI * 2;
          pts.push(transformed(s, { x: Math.cos(a) * rx, y: Math.sin(a) * ry }));
        }
        walls.push(...polygonWalls(pts));
      } else if (obj.kind === 'path' && o.closedPaths) {
        const p = obj as PathObject;
        if (!p.closed && p.style !== 'wall') continue;
        const pts = simplify(pathPolyline(p), 4).map((q) => transformed(p, q));
        walls.push(...polygonWalls(pts, p.closed));
      }
    }
  }

  return walls;
}

function shapeOutline(s: ShapeObject, sides: number): Vec2[] {
  const hw = s.w / 2, hh = s.h / 2;
  switch (s.shape) {
    case 'rect':
      return [{ x: -hw, y: -hh }, { x: hw, y: -hh }, { x: hw, y: hh }, { x: -hw, y: hh }];
    case 'ellipse': {
      const pts: Vec2[] = [];
      const n = Math.max(6, sides);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        pts.push({ x: Math.cos(a) * hw, y: Math.sin(a) * hh });
      }
      return pts;
    }
    case 'polygon':
    case 'star': {
      const pts: Vec2[] = [];
      const n = Math.max(3, s.sides);
      const count = s.shape === 'star' ? n * 2 : n;
      for (let i = 0; i < count; i++) {
        const rr = s.shape === 'star' ? (i % 2 === 0 ? 1 : 0.45) : 1;
        const a = (i / count) * Math.PI * 2 - Math.PI / 2;
        pts.push({ x: Math.cos(a) * hw * rr, y: Math.sin(a) * hh * rr });
      }
      return pts;
    }
    case 'freeform':
      return s.points.length ? s.points : [{ x: -hw, y: -hh }, { x: hw, y: -hh }, { x: hw, y: hh }, { x: -hw, y: hh }];
  }
}
