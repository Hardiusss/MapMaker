/**
 * Grid alignment.
 *
 * The single most useful thing when you bring an existing battle map into a
 * VTT: drag a box around a known number of squares and the tool solves for cell
 * size and offset so the grid lands exactly on the artwork.
 */
import type { Tool } from './types';
import type { Editor } from '../core/editor';
import type { Vec2, Rect } from '../core/types';
import { rectOf } from '../core/geometry';
import { rgba } from '../core/color';
import { t } from '../i18n';

export interface GridAlignSettings {
  /** How many cells the dragged box spans. */
  cols: number;
  rows: number;
  /** Keep cells square by averaging the two solved sizes. */
  square: boolean;
}

export const gridAlignSettings: GridAlignSettings = { cols: 4, rows: 4, square: true };

let drag: { start: Vec2; current: Vec2 } | null = null;

function apply(editor: Editor, r: Rect): void {
  const cols = Math.max(1, Math.round(gridAlignSettings.cols));
  const rows = Math.max(1, Math.round(gridAlignSettings.rows));
  let sizeX = r.w / cols;
  let sizeY = r.h / rows;
  if (gridAlignSettings.square) {
    const s = (sizeX + sizeY) / 2;
    sizeX = s;
    sizeY = s;
  }
  const size = sizeX;
  // Offset is where the lattice crosses zero, modulo one cell.
  const offsetX = ((r.x % size) + size) % size;
  const offsetY = ((r.y % size) + size) % size;

  editor.mutate('Align grid', (d) => {
    d.grid = {
      ...d.grid,
      type: d.grid.type === 'none' ? 'square' : d.grid.type,
      size: +size.toFixed(3),
      offsetX: +offsetX.toFixed(3),
      offsetY: +offsetY.toFixed(3),
      visible: true,
      snap: true,
    };
  });
  editor.status(t('tool.status.gridSet', {
    size: size.toFixed(1),
    cols: (editor.doc.width / size).toFixed(1),
    rows: (editor.doc.height / size).toFixed(1),
  }));
}

export const gridAlignTool: Tool = {
  id: 'gridalign',
  get label() { return t('tool.gridAlign'); },
  cursor: 'crosshair',
  get hint() { return t('tool.gridAlign.hint'); },
  onActivate(editor) { editor.setView({ showGrid: true }); },
  onPointerDown(c) {
    if (c.button !== 0) return;
    drag = { start: c.map, current: c.map };
  },
  onPointerMove(c) {
    if (!drag) return;
    drag.current = c.map;
    c.editor.emitChange();
  },
  onPointerUp(c) {
    if (!drag) return;
    const r = rectOf(drag.start.x, drag.start.y, drag.current.x, drag.current.y);
    drag = null;
    if (r.w < 8 || r.h < 8) { c.editor.emitChange(); return; }
    apply(c.editor, r);
  },
  onKeyDown(c) {
    if (c.key === 'Escape') { drag = null; c.editor.emitChange(); return true; }
  },
  drawOverlay(ctx, editor) {
    if (!drag) return;
    const z = editor.camera.zoom;
    const r = rectOf(drag.start.x, drag.start.y, drag.current.x, drag.current.y);
    ctx.save();
    ctx.strokeStyle = '#ffd24a';
    ctx.fillStyle = rgba('#ffd24a', 0.1);
    ctx.lineWidth = 1.5 / z;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeRect(r.x, r.y, r.w, r.h);

    // Preview the solved lattice inside the box.
    const cols = Math.max(1, Math.round(gridAlignSettings.cols));
    const rows = Math.max(1, Math.round(gridAlignSettings.rows));
    ctx.lineWidth = 1 / z;
    ctx.strokeStyle = rgba('#ffd24a', 0.6);
    ctx.beginPath();
    for (let i = 1; i < cols; i++) {
      const x = r.x + (r.w * i) / cols;
      ctx.moveTo(x, r.y); ctx.lineTo(x, r.y + r.h);
    }
    for (let j = 1; j < rows; j++) {
      const y = r.y + (r.h * j) / rows;
      ctx.moveTo(r.x, y); ctx.lineTo(r.x + r.w, y);
    }
    ctx.stroke();

    const label = `${(r.w / cols).toFixed(1)} × ${(r.h / rows).toFixed(1)} px per cell`;
    ctx.font = `${13 / z}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = rgba('#12100e', 0.9);
    ctx.fillRect(r.x + r.w / 2 - tw / 2 - 6 / z, r.y - 24 / z, tw + 12 / z, 20 / z);
    ctx.fillStyle = '#ffd24a';
    ctx.fillText(label, r.x + r.w / 2, r.y - 10 / z);
    ctx.restore();
  },
};
