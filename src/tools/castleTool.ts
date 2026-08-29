/**
 * Castle construction.
 *
 * The generator rolls a fortification; this draws one. A GM clicks the line the
 * curtain follows and gets back the same thing the generator emits — painted
 * masonry, both faces as VTT walls, towers and a gatehouse as library stamps —
 * except that the shape is theirs.
 *
 * The plan is recomputed from scratch on every pointer move rather than kept
 * and patched. It is a few hundred vector operations and no rasterising, so the
 * preview and the committed wall are the same code, and a preview that can
 * drift from what commit produces is the bug this design exists to avoid.
 */
import type { Tool, PointerCtx } from './types';
import type { Editor } from '../core/editor';
import type { Vec2, RasterLayer } from '../core/types';
import { isRaster } from '../core/types';
import { ensureVttLayers, rasterByRole } from '../core/doc';
import { ctxOf } from '../util/canvas';
import { t } from '../i18n';
import { plural } from '../i18n/plural';
import {
  planCurtain, nearestSpot, curtainWalls, curtainStamps, curtainLights,
  paintCurtainBody, paintCurtainFloor, paintCurtainShadow,
  type CurtainOptions, type CurtainPlan, type RunSpot,
} from '../gen/castle/curtain';

export type CastleSettings = CurtainOptions;

export const castleSettings: CastleSettings = {
  thickness: 10,
  material: 'granite',
  towers: 'corners+spacing',
  towerSpacing: 120,
  towerShape: 'round',
  crenellations: true,
  gatehouse: true,
  wallWalk: true,
  ruined: 0,
};

/** How close to the first node, in screen pixels, counts as closing the ring. */
const CLOSE_PX = 14;

type Phase = 'draw' | 'gate';

let nodes: Vec2[] = [];
let hover: Vec2 | null = null;
let phase: Phase = 'draw';
let closed = false;
let gateSpot: RunSpot | null = null;
/** True while the pointer is inside the closing radius of the first node. */
let onFirst = false;

function reset(): void {
  nodes = [];
  hover = null;
  phase = 'draw';
  closed = false;
  gateSpot = null;
  onFirst = false;
}

/**
 * Where the next vertex goes.
 *
 * Shift constrains to 45°, and the step along that direction is quantised to
 * whole cells — fortifications are built to lines, and a diagonal that lands
 * half a square off the grid is worse than no constraint at all.
 */
function resolvePoint(editor: Editor, raw: Vec2, shift: boolean): Vec2 {
  const last = nodes[nodes.length - 1];
  if (!last || !shift) return editor.snap(raw, 'corner');
  const dx = raw.x - last.x, dy = raw.y - last.y;
  const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  const dir = { x: Math.cos(a), y: Math.sin(a) };
  let len = dx * dir.x + dy * dir.y;
  const g = editor.doc.grid;
  if (g.snap && g.type === 'square' && g.size > 0) {
    const unit = g.size * (Math.abs(dir.x) > 0.1 && Math.abs(dir.y) > 0.1 ? Math.SQRT2 : 1);
    len = Math.max(unit, Math.round(len / unit) * unit);
  }
  return { x: last.x + dir.x * len, y: last.y + dir.y * len };
}

function previewPlan(editor: Editor): CurtainPlan | null {
  const pts = phase === 'draw' && hover && !onFirst ? [...nodes, hover] : nodes;
  return planCurtain(pts, closed, castleSettings, editor.doc.grid, gateSpot);
}

/** The raster a given part of the wall belongs on, with sane fallbacks. */
function targets(editor: Editor): { body: RasterLayer | null; floor: RasterLayer | null; relief: RasterLayer | null } {
  const doc = editor.doc;
  const body = rasterByRole(doc, 'walls-art')
    || editor.activeRaster
    || doc.layers.find((l): l is RasterLayer => isRaster(l))
    || null;
  return {
    body,
    floor: rasterByRole(doc, 'floor') || body,
    relief: rasterByRole(doc, 'relief') || body,
  };
}

/**
 * Build the thing, in one undo step.
 *
 * The picture is painted rather than emitted as objects. A curtain is a
 * continuous run of one material with merlons, a walk and collapses cut through
 * it; no object kind in the model can express that, and a `PathObject` wide
 * enough to stand for a wall is a stroked line, not masonry. Towers, gatehouse
 * and battlements *are* library assets and stay objects, because a GM will want
 * to drag a tower two squares along without repainting the wall.
 *
 * Paint happens before the structural mutation so that undo, which replays the
 * step backwards, restores the document first and the pixels after.
 */
function commit(editor: Editor): void {
  const plan = planCurtain(nodes, closed, castleSettings, editor.doc.grid, gateSpot);
  reset();
  if (!plan) { editor.emitChange(); return; }

  const walls = curtainWalls(plan, castleSettings);
  const stamps = curtainStamps(plan, castleSettings);
  const lights = curtainLights(plan);
  const { body, floor, relief } = targets(editor);
  const rect = plan.bounds;
  const paletteId = editor.paletteId;

  editor.batch(t('tool.castle'), () => {
    if (relief) editor.paint('Castle shadow', relief, rect,
      () => paintCurtainShadow(ctxOf(relief.surface), plan));
    if (floor) editor.paint('Castle floor', floor, rect,
      () => paintCurtainFloor(ctxOf(floor.surface), plan, castleSettings, paletteId));
    if (body) editor.paint('Castle masonry', body, rect,
      () => paintCurtainBody(ctxOf(body.surface), plan, castleSettings, paletteId));

    editor.mutate('Castle objects', (draft) => {
      // A wall run without a wall layer to put walls on is the one failure the
      // GM cannot fix afterwards, so the VTT layers are made if they are absent.
      const d = ensureVttLayers(draft);
      const layer = d.layers.find((l) => l.kind === 'object' && l.name === 'Defences')
        || d.layers.find((l) => l.kind === 'object' && l.role === 'features')
        || d.layers.find((l) => l.kind === 'object' && l.id === d.activeLayerId)
        || d.layers.find((l) => l.kind === 'object');
      if (layer && layer.kind === 'object') layer.objects.push(...stamps);
      const wl = d.layers.find((l) => l.kind === 'wall');
      if (wl && wl.kind === 'wall') wl.walls.push(...walls);
      const ll = d.layers.find((l) => l.kind === 'light');
      if (ll && ll.kind === 'light') ll.lights.push(...lights);
      return d;
    });
  });

  editor.status(t('tool.castle.built', {
    length: Math.round(plan.lengthUnits), unit: plan.unitLabel,
    walls: plural('count.wallSegments', walls.length),
    towers: plural('count.towers', plan.towers.length),
    lights: plural('count.lights', lights.length),
  }));
}

/** Finish the outline; the gatehouse gets a click of its own if it is switched on. */
function finish(editor: Editor): void {
  // A double click leaves a vertex on top of the previous one.
  if (nodes.length >= 2) {
    const a = nodes[nodes.length - 1], b = nodes[nodes.length - 2];
    if (Math.hypot(a.x - b.x, a.y - b.y) < 1) nodes.pop();
  }
  if (nodes.length < 2 || (closed && nodes.length < 3)) { reset(); editor.emitChange(); return; }
  if (castleSettings.gatehouse && phase === 'draw') {
    phase = 'gate';
    hover = null;
    editor.status(t('tool.castle.gateHint'));
    editor.emitChange();
    return;
  }
  commit(editor);
}

export const castleTool: Tool = {
  id: 'castle',
  // Labels read through `t()` on access rather than being frozen at module
  // load, so a language switch renames the tool without a reload.
  get label() { return t('tool.castle'); },
  get hint() { return t('tool.castle.hint'); },
  shortcut: 'c',
  cursor: 'crosshair',

  onPointerDown(c: PointerCtx) {
    if (c.button !== 0) return;
    if (phase === 'gate') {
      gateSpot = nearestSpot(nodes, closed, c.map);
      commit(c.editor);
      return;
    }
    if (onFirst && nodes.length >= 3) {
      closed = true;
      finish(c.editor);
      return;
    }
    nodes.push(resolvePoint(c.editor, c.map, c.shift));
    hover = null;
    c.editor.emitChange();
  },

  onPointerMove(c: PointerCtx) {
    if (phase === 'gate') {
      gateSpot = nearestSpot(nodes, closed, c.map);
      c.editor.emitChange();
      return;
    }
    if (!nodes.length) return;
    const first = nodes[0];
    onFirst = nodes.length >= 3 && Math.hypot(c.map.x - first.x, c.map.y - first.y) * c.editor.camera.zoom < CLOSE_PX;
    hover = onFirst ? first : resolvePoint(c.editor, c.map, c.shift);
    c.editor.emitChange();
  },

  onDoubleClick(c: PointerCtx) { finish(c.editor); },

  onKeyDown(c) {
    if (c.key === 'Enter') { finish(c.editor); return true; }
    if (c.key === 'Escape') { reset(); c.editor.emitChange(); return true; }
    if (c.key === 'Backspace' && nodes.length) {
      if (phase === 'gate') phase = 'draw';
      else nodes.pop();
      c.editor.emitChange();
      return true;
    }
  },

  onDeactivate(editor) {
    // Cancel rather than commit: a fortification half drawn when the GM reaches
    // for another tool is not something they asked to have built.
    if (nodes.length) { reset(); editor.emitChange(); }
  },

  drawOverlay(ctx, editor) {
    if (!nodes.length) return;
    const z = editor.camera.zoom;
    const plan = previewPlan(editor);
    ctx.save();
    ctx.lineJoin = 'round';

    if (plan) {
      ctx.beginPath();
      poly(ctx, plan.outer, plan.closed);
      poly(ctx, plan.inner, plan.closed);
      ctx.fillStyle = 'rgba(143,211,255,0.18)';
      ctx.fill(plan.closed ? 'evenodd' : 'nonzero');
      ctx.strokeStyle = '#8fd3ff';
      ctx.lineWidth = 1.5 / z;
      ctx.beginPath();
      poly(ctx, plan.outer, plan.closed);
      ctx.stroke();
      ctx.beginPath();
      poly(ctx, plan.inner, plan.closed);
      ctx.stroke();

      for (const tw of plan.towers) {
        ctx.beginPath();
        ctx.arc(tw.x, tw.y, tw.r, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (plan.gate) {
        const g = plan.gate;
        ctx.save();
        ctx.translate(g.p.x, g.p.y);
        ctx.rotate(Math.atan2(g.t.y, g.t.x));
        ctx.strokeStyle = '#ffd24a';
        ctx.lineWidth = 2 / z;
        ctx.strokeRect(-g.span / 2, -g.depth / 2, g.span, g.depth);
        ctx.restore();
      }
      label(ctx, z, plan);
    }

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#12100e';
    ctx.lineWidth = 1 / z;
    for (const p of nodes) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4 / z, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    if (onFirst) {
      ctx.strokeStyle = '#ffd24a';
      ctx.lineWidth = 2 / z;
      ctx.beginPath();
      ctx.arc(nodes[0].x, nodes[0].y, CLOSE_PX / z, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  },
};

function poly(ctx: CanvasRenderingContext2D, pts: Vec2[], close: boolean): void {
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  if (close) ctx.closePath();
}

function label(ctx: CanvasRenderingContext2D, z: number, plan: CurtainPlan): void {
  const anchor = plan.pts[plan.pts.length - 1];
  const text = t('tool.castle.readout', {
    length: Math.round(plan.lengthUnits), unit: plan.unitLabel,
    towers: plural('count.towers', plan.towers.length),
  });
  ctx.font = `${13 / z}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  const w = ctx.measureText(text).width;
  ctx.fillStyle = 'rgba(18,16,14,0.85)';
  ctx.fillRect(anchor.x + 10 / z, anchor.y - 22 / z, w + 12 / z, 20 / z);
  ctx.fillStyle = '#ffd24a';
  ctx.fillText(text, anchor.x + 16 / z, anchor.y - 8 / z);
}
