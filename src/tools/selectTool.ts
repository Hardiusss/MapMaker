/** Select / move / scale / rotate objects, plus marquee selection. */
import type { Tool, PointerCtx } from './types';
import type { Editor } from '../core/editor';
import type { MapObject, Rect, Vec2 } from '../core/types';
import { isObjectLayer } from '../core/types';
import { hitTest, objectBounds, objectsInRect } from '../core/objectBounds';
import { rectOf } from '../core/geometry';
import { rgba } from '../core/color';

type Mode = 'idle' | 'move' | 'marquee' | 'scale' | 'rotate';
type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rot';

interface State {
  mode: Mode;
  start: Vec2;
  last: Vec2;
  marquee: Rect | null;
  handle: HandleId | null;
  originals: Map<string, MapObject>;
  bounds: Rect | null;
  pivot: Vec2;
  startAngle: number;
}

const state: State = {
  mode: 'idle', start: { x: 0, y: 0 }, last: { x: 0, y: 0 },
  marquee: null, handle: null, originals: new Map(), bounds: null,
  pivot: { x: 0, y: 0 }, startAngle: 0,
};

export function handlePositions(b: Rect): Record<HandleId, Vec2> {
  return {
    nw: { x: b.x, y: b.y },
    n: { x: b.x + b.w / 2, y: b.y },
    ne: { x: b.x + b.w, y: b.y },
    e: { x: b.x + b.w, y: b.y + b.h / 2 },
    se: { x: b.x + b.w, y: b.y + b.h },
    s: { x: b.x + b.w / 2, y: b.y + b.h },
    sw: { x: b.x, y: b.y + b.h },
    w: { x: b.x, y: b.y + b.h / 2 },
    rot: { x: b.x + b.w / 2, y: b.y - 34 },
  };
}

function pickHandle(editor: Editor, p: Vec2): HandleId | null {
  const b = editor.selectionBounds();
  if (!b) return null;
  const tol = 9 / editor.camera.zoom;
  const hs = handlePositions(b);
  for (const [id, pos] of Object.entries(hs) as [HandleId, Vec2][]) {
    if (Math.abs(p.x - pos.x) <= tol && Math.abs(p.y - pos.y) <= tol) return id;
  }
  return null;
}

function topmostAt(editor: Editor, p: Vec2): MapObject | null {
  const tol = 4 / editor.camera.zoom;
  for (let i = editor.doc.layers.length - 1; i >= 0; i--) {
    const l = editor.doc.layers[i];
    if (!isObjectLayer(l) || !l.visible || l.locked) continue;
    for (let j = l.objects.length - 1; j >= 0; j--) {
      if (hitTest(l.objects[j], p, editor.doc.grid, tol)) return l.objects[j];
    }
  }
  return null;
}

function snapshotSelection(editor: Editor): void {
  state.originals.clear();
  for (const o of editor.selectedObjects) state.originals.set(o.id, JSON.parse(JSON.stringify(o)));
  state.bounds = editor.selectionBounds();
}

export const selectTool: Tool = {
  id: 'select',
  label: 'Select & Transform',
  shortcut: 'v',
  cursor: 'default',
  hint: 'Click to select, drag to move. Handles scale; the top handle rotates. Shift adds to the selection.',

  onPointerDown(c) {
    const { editor } = c;
    if (c.button !== 0) return;

    const handle = pickHandle(editor, c.map);
    if (handle) {
      snapshotSelection(editor);
      state.mode = handle === 'rot' ? 'rotate' : 'scale';
      state.handle = handle;
      state.start = c.map;
      state.last = c.map;
      const b = state.bounds!;
      state.pivot = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      state.startAngle = Math.atan2(c.map.y - state.pivot.y, c.map.x - state.pivot.x);
      return;
    }

    const hit = topmostAt(editor, c.map);
    if (hit) {
      if (c.shift) editor.selectObjects([hit.id], true);
      else if (!editor.selection.objectIds.includes(hit.id)) editor.selectObjects([hit.id]);
      snapshotSelection(editor);
      state.mode = 'move';
      state.start = c.map;
      state.last = c.map;
      return;
    }

    if (!c.shift) editor.clearSelection();
    state.mode = 'marquee';
    state.start = c.map;
    state.marquee = { x: c.map.x, y: c.map.y, w: 0, h: 0 };
    editor.overlayDraw = drawOverlay;
  },

  onPointerMove(c) {
    const { editor } = c;
    if (state.mode === 'idle') return;

    if (state.mode === 'marquee') {
      state.marquee = rectOf(state.start.x, state.start.y, c.map.x, c.map.y);
      editor.emitChange();
      return;
    }

    if (state.mode === 'move') {
      let dx = c.map.x - state.start.x;
      let dy = c.map.y - state.start.y;
      if (c.shift) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      applyTransform(editor, (o) => {
        const src = state.originals.get(o.id)!;
        let nx = src.x + dx, ny = src.y + dy;
        if (editor.doc.grid.snap && c.ctrl) {
          const s = editor.snap({ x: nx, y: ny }, 'corner');
          nx = s.x; ny = s.y;
        }
        return { x: nx, y: ny };
      });
      return;
    }

    if (state.mode === 'scale' && state.bounds && state.handle) {
      const b = state.bounds;
      const h = state.handle;
      const anchorX = h.includes('w') ? b.x + b.w : b.x;
      const anchorY = h.includes('n') ? b.y + b.h : b.y;
      let sx = 1, sy = 1;
      if (h.includes('e')) sx = (c.map.x - b.x) / Math.max(1e-3, b.w);
      if (h.includes('w')) sx = (b.x + b.w - c.map.x) / Math.max(1e-3, b.w);
      if (h.includes('s')) sy = (c.map.y - b.y) / Math.max(1e-3, b.h);
      if (h.includes('n')) sy = (b.y + b.h - c.map.y) / Math.max(1e-3, b.h);
      if (h === 'n' || h === 's') sx = 1;
      if (h === 'e' || h === 'w') sy = 1;
      if (c.shift || h.length === 2) {
        const u = Math.max(Math.abs(sx), Math.abs(sy));
        sx = Math.sign(sx || 1) * u;
        sy = Math.sign(sy || 1) * u;
      }
      sx = clampScale(sx); sy = clampScale(sy);
      applyTransform(editor, (o) => {
        const src = state.originals.get(o.id)!;
        return {
          x: anchorX + (src.x - anchorX) * sx,
          y: anchorY + (src.y - anchorY) * sy,
          scaleX: src.scaleX * sx,
          scaleY: src.scaleY * sy,
        };
      });
      return;
    }

    if (state.mode === 'rotate') {
      const ang = Math.atan2(c.map.y - state.pivot.y, c.map.x - state.pivot.x);
      let delta = ((ang - state.startAngle) * 180) / Math.PI;
      if (c.shift) delta = Math.round(delta / 15) * 15;
      const rad = (delta * Math.PI) / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      applyTransform(editor, (o) => {
        const src = state.originals.get(o.id)!;
        const dx = src.x - state.pivot.x, dy = src.y - state.pivot.y;
        return {
          x: state.pivot.x + dx * cos - dy * sin,
          y: state.pivot.y + dx * sin + dy * cos,
          rotation: src.rotation + delta,
        };
      });
    }
  },

  onPointerUp(c) {
    const { editor } = c;
    if (state.mode === 'marquee' && state.marquee) {
      const all: MapObject[] = [];
      for (const l of editor.doc.layers) if (isObjectLayer(l) && l.visible && !l.locked) all.push(...l.objects);
      const inside = objectsInRect(all, state.marquee, editor.doc.grid);
      editor.selectObjects(inside.map((o) => o.id), c.shift);
    }
    if (state.mode !== 'idle' && state.mode !== 'marquee') {
      editor.markDirty();
    }
    state.mode = 'idle';
    state.marquee = null;
    state.handle = null;
    state.originals.clear();
    editor.emitChange();
  },

  onDoubleClick(c) {
    const hit = topmostAt(c.editor, c.map);
    if (hit && hit.kind === 'text') c.editor.openDialog('text', { id: hit.id });
  },

  onKeyDown(c) {
    const step = c.shift ? 10 : 1;
    const nudge = (dx: number, dy: number) => {
      c.editor.updateObjects(c.editor.selection.objectIds, (o) => ({ x: o.x + dx, y: o.y + dy }), 'Nudge');
      return true;
    };
    switch (c.key) {
      case 'ArrowLeft': return nudge(-step, 0);
      case 'ArrowRight': return nudge(step, 0);
      case 'ArrowUp': return nudge(0, -step);
      case 'ArrowDown': return nudge(0, step);
    }
  },

  drawOverlay,
};

function clampScale(s: number): number {
  const a = Math.abs(s);
  return Math.sign(s || 1) * Math.max(0.02, Math.min(40, a));
}

/** Applies a live transform without spamming the history stack. */
function applyTransform(editor: Editor, fn: (o: MapObject) => Partial<MapObject>): void {
  const ids = new Set(state.originals.keys());
  const layers = editor.doc.layers.map((l) => {
    if (l.kind !== 'object') return l;
    let changed = false;
    const objects = l.objects.map((o) => {
      if (!ids.has(o.id)) return o;
      changed = true;
      return { ...o, ...fn(o) } as MapObject;
    });
    return changed ? { ...l, objects } : l;
  });
  editor.doc = { ...editor.doc, layers };
  editor.emitChange();
}

function drawOverlay(ctx: CanvasRenderingContext2D, editor: Editor): void {
  const z = editor.camera.zoom;

  if (state.mode === 'marquee' && state.marquee) {
    ctx.save();
    ctx.strokeStyle = '#8fd3ff';
    ctx.fillStyle = rgba('#8fd3ff', 0.12);
    ctx.lineWidth = 1 / z;
    ctx.setLineDash([5 / z, 4 / z]);
    ctx.fillRect(state.marquee.x, state.marquee.y, state.marquee.w, state.marquee.h);
    ctx.strokeRect(state.marquee.x, state.marquee.y, state.marquee.w, state.marquee.h);
    ctx.restore();
  }

  // Per-object outlines.
  ctx.save();
  ctx.strokeStyle = rgba('#8fd3ff', 0.75);
  ctx.lineWidth = 1 / z;
  for (const o of editor.selectedObjects) {
    const b = objectBounds(o, editor.doc.grid);
    ctx.strokeRect(b.x, b.y, b.w, b.h);
  }
  ctx.restore();

  const b = editor.selectionBounds();
  if (!b) return;

  ctx.save();
  ctx.strokeStyle = '#8fd3ff';
  ctx.lineWidth = 1.5 / z;
  ctx.setLineDash([]);
  ctx.strokeRect(b.x, b.y, b.w, b.h);

  const hs = handlePositions(b);
  ctx.beginPath();
  ctx.moveTo(b.x + b.w / 2, b.y);
  ctx.lineTo(hs.rot.x, hs.rot.y);
  ctx.stroke();

  const s = 7 / z;
  ctx.fillStyle = '#12100e';
  for (const [id, p] of Object.entries(hs) as [HandleId, Vec2][]) {
    ctx.beginPath();
    if (id === 'rot') { ctx.arc(p.x, p.y, s * 0.8, 0, Math.PI * 2); }
    else { ctx.rect(p.x - s / 2, p.y - s / 2, s, s); }
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
