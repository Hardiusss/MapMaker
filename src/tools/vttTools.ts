/** Wall, light, note and measurement tools — the VTT-facing half of the editor. */
import type { Tool } from './types';
import type { Editor } from '../core/editor';
import type { Vec2, WallKind } from '../core/types';
import { makeWall, makeLight, makeNote } from '../core/factories';
import { measureDistance, hexDesignationAt, hexCenter, pointToHex, type Measurement } from '../render/grid';
import { plural } from '../i18n/plural';
import { WALL_COLORS } from '../render/renderer';
import { rgba } from '../core/color';
import { pointSegmentDistance, dist } from '../core/geometry';
import { t } from '../i18n';

// ---------------------------------------------------------------------------
// Walls
// ---------------------------------------------------------------------------

export interface WallSettings {
  kind: WallKind;
  /** Keep drawing from the last endpoint. */
  chain: boolean;
  snapToGrid: boolean;
  blocksMovement: boolean;
  blocksSight: boolean;
  blocksSound: boolean;
}

export const wallSettings: WallSettings = {
  kind: 'wall', chain: true, snapToGrid: true,
  blocksMovement: true, blocksSight: true, blocksSound: true,
};

let wallStart: Vec2 | null = null;
let wallHover: Vec2 | null = null;

function snapWall(editor: Editor, p: Vec2): Vec2 {
  if (!wallSettings.snapToGrid) return p;
  const g = editor.doc.grid;
  if (g.type === 'none') return p;
  const s = g.size / 2;
  return { x: Math.round((p.x - g.offsetX) / s) * s + g.offsetX, y: Math.round((p.y - g.offsetY) / s) * s + g.offsetY };
}

export const wallTool: Tool = {
  id: 'wall',
  get label() { return t('tool.wall'); },
  shortcut: 'w',
  cursor: 'crosshair',
  get hint() { return t('tool.wall.hint'); },
  onActivate(editor) { editor.setView({ showWalls: true }); },
  onPointerDown(c) {
    if (c.button !== 0) return;
    const p = snapWall(c.editor, c.map);
    if (!wallStart) { wallStart = p; wallHover = p; c.editor.emitChange(); return; }
    if (dist(wallStart, p) > 2) {
      const w = makeWall(wallStart, p, wallSettings.kind);
      w.blocksMovement = wallSettings.blocksMovement;
      w.blocksSight = wallSettings.blocksSight;
      w.blocksSound = wallSettings.blocksSound;
      c.editor.addWall(w);
    }
    wallStart = wallSettings.chain ? p : null;
    c.editor.emitChange();
  },
  onPointerMove(c) {
    if (!wallStart) return;
    wallHover = snapWall(c.editor, c.map);
    c.editor.emitChange();
  },
  onKeyDown(c) {
    if (c.key === 'Escape') { wallStart = null; wallHover = null; c.editor.emitChange(); return true; }
  },
  onDeactivate() { wallStart = null; wallHover = null; },
  drawOverlay(ctx, editor) {
    if (!wallStart || !wallHover) return;
    const z = editor.camera.zoom;
    ctx.save();
    ctx.strokeStyle = WALL_COLORS[wallSettings.kind];
    ctx.lineWidth = Math.max(1.5, 4 / z);
    ctx.setLineDash([8 / z, 6 / z]);
    ctx.beginPath();
    ctx.moveTo(wallStart.x, wallStart.y);
    ctx.lineTo(wallHover.x, wallHover.y);
    ctx.stroke();
    ctx.restore();
  },
};

// ---------------------------------------------------------------------------
// Lights
// ---------------------------------------------------------------------------

export interface LightSettings {
  preset: string;
  bright: number;
  dim: number;
  color: string;
  intensity: number;
  angle: number;
  animation: 'none' | 'torch' | 'pulse' | 'chroma' | 'flame' | 'hexa';
}

export const LIGHT_PRESETS: { id: string; label: string; bright: number; dim: number; color: string; animation: LightSettings['animation'] }[] = [
  { id: 'torch', label: 'Torch (20/40 ft)', bright: 20, dim: 40, color: '#ffae5c', animation: 'torch' },
  { id: 'lantern', label: 'Hooded Lantern (30/60 ft)', bright: 30, dim: 60, color: '#ffd7a0', animation: 'flame' },
  { id: 'candle', label: 'Candle (5/10 ft)', bright: 5, dim: 10, color: '#ffcf8a', animation: 'torch' },
  { id: 'light-spell', label: 'Light Spell (20/40 ft)', bright: 20, dim: 40, color: '#ffffff', animation: 'none' },
  { id: 'brazier', label: 'Brazier (25/50 ft)', bright: 25, dim: 50, color: '#ff9a4a', animation: 'flame' },
  { id: 'magical', label: 'Arcane Glow (15/30 ft)', bright: 15, dim: 30, color: '#7ac8ff', animation: 'pulse' },
  { id: 'lava', label: 'Lava Glow (10/25 ft)', bright: 10, dim: 25, color: '#ff5a2a', animation: 'chroma' },
  { id: 'daylight', label: 'Daylight (60/120 ft)', bright: 60, dim: 120, color: '#fff6e0', animation: 'none' },
];

export const lightSettings: LightSettings = {
  preset: 'torch', bright: 20, dim: 40, color: '#ffae5c', intensity: 0.85, angle: 360, animation: 'torch',
};

export const lightTool: Tool = {
  id: 'light',
  get label() { return t('tool.light'); },
  shortcut: 'l',
  cursor: 'crosshair',
  get hint() { return t('tool.light.hint'); },
  onActivate(editor) { editor.setView({ showLights: true }); },
  onPointerDown(c) {
    if (c.button !== 0) return;
    const g = c.editor.doc.grid;
    const perUnit = g.size / Math.max(1, g.unitsPerCell);
    c.editor.addLight(makeLight(c.map.x, c.map.y, g.size, {
      bright: lightSettings.bright * perUnit,
      dim: lightSettings.dim * perUnit,
      color: lightSettings.color,
      intensity: lightSettings.intensity,
      angle: lightSettings.angle,
      animation: lightSettings.animation,
      name: LIGHT_PRESETS.find((p) => p.id === lightSettings.preset)?.label || 'Light',
    }));
  },
};

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export const noteTool: Tool = {
  id: 'note',
  get label() { return t('tool.note'); },
  shortcut: 'n',
  cursor: 'crosshair',
  get hint() { return t('tool.note.hint'); },
  onPointerDown(c) {
    if (c.button !== 0) return;
    // On a numbered hex map the note *is* the hex's entry in the key, so it is
    // dropped on the hex centre and named for it. A GM who calls out 0407 can
    // then find the note by searching for 0407, which is the whole point of
    // numbering the hexes in the first place.
    const g = c.editor.doc.grid;
    const hex = hexDesignationAt(c.map, g);
    const at = hex ? hexCenter(pointToHex(c.map, g).col, pointToHex(c.map, g).row, g) : c.map;
    const n = makeNote(at.x, at.y, hex ? t('note.hexTitle', { hex }) : t('note.newTitle'));
    c.editor.addNote(n);
    c.editor.openDialog('note', { id: n.id });
  },
};

// ---------------------------------------------------------------------------
// Measure
// ---------------------------------------------------------------------------

let measureA: Vec2 | null = null;
let measureB: Vec2 | null = null;

/**
 * What the measurement says out loud.
 *
 * Distance alone is not the answer a GM wants on an overland map. "Thirty
 * miles" is arithmetic; "five hexes, thirty miles, two days" is a ruling they
 * can make at the table without doing the division themselves.
 */
function measurementText(d: Measurement): string {
  const parts: string[] = [];
  if (d.hex) parts.push(plural('count.hexes', Math.round(d.cells)));
  parts.push(d.label);
  if (d.days !== undefined) {
    parts.push(d.days < 1
      ? plural('count.hours', Math.max(1, Math.round(d.days * 24)))
      : plural('count.days', +d.days.toFixed(d.days < 10 ? 1 : 0)));
  }
  if (!d.hex) parts.push(t('tool.measure.cells', { cells: d.cells.toFixed(1) }));
  return parts.join(' · ');
}

export const measureTool: Tool = {
  id: 'measure',
  get label() { return t('tool.measure'); },
  shortcut: 'm',
  cursor: 'crosshair',
  get hint() { return t('tool.measure.hint'); },
  onPointerDown(c) { measureA = c.map; measureB = c.map; c.editor.emitChange(); },
  onPointerMove(c) { if (measureA) { measureB = c.map; c.editor.emitChange(); } },
  onPointerUp(c) {
    if (measureA && measureB) {
      const d = measureDistance(measureA, measureB, c.editor.doc.grid);
      c.editor.status(t('tool.status.distance', { label: measurementText(d) }));
    }
  },
  onKeyDown(c) {
    if (c.key === 'Escape') { measureA = measureB = null; c.editor.emitChange(); return true; }
  },
  drawOverlay(ctx, editor) {
    if (!measureA || !measureB) return;
    const z = editor.camera.zoom;
    ctx.save();
    ctx.strokeStyle = '#ffd24a';
    ctx.lineWidth = 2 / z;
    ctx.setLineDash([8 / z, 5 / z]);
    ctx.beginPath();
    ctx.moveTo(measureA.x, measureA.y);
    ctx.lineTo(measureB.x, measureB.y);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const p of [measureA, measureB]) {
      ctx.fillStyle = '#ffd24a';
      ctx.beginPath(); ctx.arc(p.x, p.y, 4 / z, 0, Math.PI * 2); ctx.fill();
    }
    const d = measureDistance(measureA, measureB, editor.doc.grid);
    const mid = { x: (measureA.x + measureB.x) / 2, y: (measureA.y + measureB.y) / 2 };
    ctx.font = `${16 / z}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    const text = measurementText(d);
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = rgba('#12100e', 0.85);
    ctx.fillRect(mid.x - tw / 2 - 6 / z, mid.y - 22 / z, tw + 12 / z, 22 / z);
    ctx.fillStyle = '#ffd24a';
    ctx.fillText(text, mid.x, mid.y - 6 / z);
    ctx.restore();
  },
};

// ---------------------------------------------------------------------------
// Pan
// ---------------------------------------------------------------------------

let panning = false;
let panLast: Vec2 | null = null;

export const panTool: Tool = {
  id: 'pan',
  get label() { return t('tool.pan'); },
  shortcut: 'h',
  cursor: 'grab',
  get hint() { return t('tool.pan.hint'); },
  onPointerDown(c) { panning = true; panLast = c.screen; },
  onPointerMove(c) {
    if (!panning || !panLast) return;
    c.editor.camera.panBy(c.screen.x - panLast.x, c.screen.y - panLast.y);
    panLast = c.screen;
    c.editor.events.emit('camera', undefined);
  },
  onPointerUp() { panning = false; panLast = null; },
};

/** Used by the canvas view for hit-testing wall/light/note handles. */
export function pickVttHandle(editor: Editor, p: Vec2): { type: 'wall' | 'light' | 'note'; id: string } | null {
  const tol = 10 / editor.camera.zoom;
  for (const l of editor.doc.layers) {
    if (l.kind === 'light' && l.visible) {
      for (const li of l.lights) if (dist(p, { x: li.x, y: li.y }) <= tol) return { type: 'light', id: li.id };
    }
    if (l.kind === 'note' && l.visible) {
      for (const n of l.notes) if (dist(p, { x: n.x, y: n.y - 14 / editor.camera.zoom }) <= tol * 1.4) return { type: 'note', id: n.id };
    }
  }
  for (const l of editor.doc.layers) {
    if (l.kind !== 'wall' || !l.visible) continue;
    for (const w of l.walls) if (pointSegmentDistance(p, w.a, w.b) <= tol) return { type: 'wall', id: w.id };
  }
  return null;
}
