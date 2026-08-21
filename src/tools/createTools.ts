/** Tools that create objects: stamp, text, shape, path, token. */
import type { Tool, PointerCtx } from './types';
import type { Editor } from '../core/editor';
import type { Vec2, ShapeKind, PathStyle } from '../core/types';
import { makeStamp, makeText, makeShape, makePath, makeToken } from '../core/factories';
import { assetById } from '../assets/library';
import { rectOf } from '../core/geometry';
import { rgba } from '../core/color';
import { renderAsset } from '../assets/library';

// ---------------------------------------------------------------------------
// Stamp
// ---------------------------------------------------------------------------

export interface StampSettings {
  assetId: string;
  width: number;
  /** Randomise size/rotation per placement. */
  sizeJitter: number;
  rotationJitter: number;
  tint: string | null;
  tintStrength: number;
  /** Drag to set the size instead of using the fixed width. */
  dragToSize: boolean;
  /** Repeated placement while dragging. */
  spray: boolean;
  spraySpacing: number;
}

export const stampSettings: StampSettings = {
  assetId: 'terrain/mountain',
  width: 180,
  sizeJitter: 0.18,
  rotationJitter: 0,
  tint: null,
  tintStrength: 0.6,
  dragToSize: false,
  spray: false,
  spraySpacing: 60,
};

let stampDrag: { start: Vec2; current: Vec2; active: boolean } | null = null;
let lastSpray: Vec2 | null = null;

function placeStamp(editor: Editor, at: Vec2, width?: number): void {
  const def = assetById(stampSettings.assetId);
  if (!def) return;
  const jitter = 1 + (Math.random() * 2 - 1) * stampSettings.sizeJitter;
  const w = Math.max(6, (width ?? stampSettings.width) * jitter);
  const h = w / def.aspect;
  const rot = (Math.random() * 2 - 1) * stampSettings.rotationJitter;
  editor.addObject(makeStamp(stampSettings.assetId, at.x, at.y, w, h, {
    rotation: rot,
    tint: stampSettings.tint,
    tintStrength: stampSettings.tintStrength,
  }));
}

export const stampTool: Tool = {
  id: 'stamp',
  label: 'Stamp',
  shortcut: 's',
  cursor: 'copy',
  hint: 'Click to place the selected asset. Hold and drag with Spray on to scatter a line of them.',
  onPointerDown(c) {
    if (c.button !== 0) return;
    stampDrag = { start: c.map, current: c.map, active: true };
    lastSpray = c.map;
    if (!stampSettings.dragToSize && !stampSettings.spray) placeStamp(c.editor, c.map);
    else if (stampSettings.spray) placeStamp(c.editor, c.map);
    c.editor.overlayDraw = drawStampOverlay;
  },
  onPointerMove(c) {
    if (!stampDrag?.active) return;
    stampDrag.current = c.map;
    if (stampSettings.spray && lastSpray) {
      const d = Math.hypot(c.map.x - lastSpray.x, c.map.y - lastSpray.y);
      if (d >= stampSettings.spraySpacing) {
        placeStamp(c.editor, c.map);
        lastSpray = c.map;
      }
    }
    c.editor.emitChange();
  },
  onPointerUp(c) {
    if (!stampDrag) return;
    if (stampSettings.dragToSize && !stampSettings.spray) {
      const w = Math.abs(c.map.x - stampDrag.start.x) * 2;
      if (w > 8) placeStamp(c.editor, stampDrag.start, w);
      else placeStamp(c.editor, stampDrag.start);
    }
    stampDrag = null;
    lastSpray = null;
    c.editor.emitChange();
  },
  drawOverlay: drawStampOverlay,
};

function drawStampOverlay(ctx: CanvasRenderingContext2D, editor: Editor): void {
  if (!stampDrag || !stampSettings.dragToSize || stampSettings.spray) return;
  const def = assetById(stampSettings.assetId);
  if (!def) return;
  const w = Math.max(8, Math.abs(stampDrag.current.x - stampDrag.start.x) * 2);
  const h = w / def.aspect;
  ctx.save();
  ctx.globalAlpha = 0.6;
  const surf = renderAsset(def.id, { width: w, height: h, paletteId: editor.paletteId, seed: 3 });
  ctx.drawImage(surf, stampDrag.start.x - w / 2, stampDrag.start.y - h / 2, w, h);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

export interface TextSettings {
  size: number;
  font: string;
  color: string;
  strokeColor: string;
  strokeWidth: number;
  letterSpacing: number;
  bold: boolean;
  italic: boolean;
  curve: 'straight' | 'arcUp' | 'arcDown';
  curveRadius: number;
  banner: 'none' | 'plaque' | 'scroll' | 'underline';
}

export const textSettings: TextSettings = {
  size: 42, font: 'Georgia, "Times New Roman", serif',
  color: '#3b2c1c', strokeColor: '#efe4c8', strokeWidth: 0,
  letterSpacing: 2, bold: false, italic: false,
  curve: 'straight', curveRadius: 400, banner: 'none',
};

export const textTool: Tool = {
  id: 'text',
  label: 'Label',
  shortcut: 't',
  cursor: 'text',
  hint: 'Click to drop a label, then type in the properties panel.',
  onPointerDown(c) {
    if (c.button !== 0) return;
    const o = makeText('New Label', c.map.x, c.map.y, c.editor.paletteId, {
      size: textSettings.size,
      font: textSettings.font,
      color: textSettings.color,
      strokeColor: textSettings.strokeColor,
      strokeWidth: textSettings.strokeWidth,
      letterSpacing: textSettings.letterSpacing,
      bold: textSettings.bold,
      italic: textSettings.italic,
      curve: textSettings.curve,
      curveRadius: textSettings.curveRadius,
      banner: textSettings.banner,
    });
    c.editor.addObject(o);
    c.editor.setTool('select');
    c.editor.openDialog('text', { id: o.id });
  },
};

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

export interface ShapeSettings {
  shape: ShapeKind;
  sides: number;
  cornerRadius: number;
  fillType: 'solid' | 'texture' | 'none';
  fillColor: string;
  textureId: string;
  strokeColor: string;
  strokeWidth: number;
  dashed: boolean;
}

export const shapeSettings: ShapeSettings = {
  shape: 'rect', sides: 6, cornerRadius: 0,
  fillType: 'solid', fillColor: '#a8b077', textureId: 'stone-floor',
  strokeColor: '#3b2c1c', strokeWidth: 3, dashed: false,
};

let shapeDrag: { start: Vec2; current: Vec2 } | null = null;

export const shapeTool: Tool = {
  id: 'shape',
  label: 'Shape',
  shortcut: 'r',
  cursor: 'crosshair',
  hint: 'Drag to draw. Shift constrains to a square/circle, Alt draws from the centre.',
  onPointerDown(c) {
    if (c.button !== 0) return;
    shapeDrag = { start: c.editor.snap(c.map), current: c.map };
    c.editor.overlayDraw = drawShapeOverlay;
  },
  onPointerMove(c) {
    if (!shapeDrag) return;
    shapeDrag.current = c.editor.snap(c.map);
    c.editor.emitChange();
  },
  onPointerUp(c) {
    if (!shapeDrag) return;
    const r = resolveShapeRect(shapeDrag, c);
    shapeDrag = null;
    if (r.w < 3 || r.h < 3) { c.editor.emitChange(); return; }
    c.editor.addObject(makeShape(
      shapeSettings.shape,
      r.x + r.w / 2, r.y + r.h / 2, r.w, r.h,
      c.editor.paletteId,
      {
        sides: shapeSettings.sides,
        cornerRadius: shapeSettings.cornerRadius,
        fill: shapeSettings.fillType === 'texture'
          ? { type: 'texture', color: shapeSettings.fillColor, textureId: shapeSettings.textureId, textureScale: 1 }
          : { type: shapeSettings.fillType, color: shapeSettings.fillColor },
        strokeColor: shapeSettings.strokeColor,
        strokeWidth: shapeSettings.strokeWidth,
        dash: shapeSettings.dashed ? [12, 8] : [],
      },
    ));
    c.editor.emitChange();
  },
  drawOverlay: drawShapeOverlay,
};

function resolveShapeRect(d: { start: Vec2; current: Vec2 }, c: PointerCtx) {
  let r = rectOf(d.start.x, d.start.y, d.current.x, d.current.y);
  if (c.shift) {
    const s = Math.max(r.w, r.h);
    r = { x: d.current.x < d.start.x ? d.start.x - s : d.start.x, y: d.current.y < d.start.y ? d.start.y - s : d.start.y, w: s, h: s };
  }
  if (c.alt) {
    r = { x: d.start.x - r.w, y: d.start.y - r.h, w: r.w * 2, h: r.h * 2 };
  }
  return r;
}

function drawShapeOverlay(ctx: CanvasRenderingContext2D, editor: Editor): void {
  if (!shapeDrag) return;
  const r = rectOf(shapeDrag.start.x, shapeDrag.start.y, shapeDrag.current.x, shapeDrag.current.y);
  ctx.save();
  ctx.strokeStyle = '#8fd3ff';
  ctx.lineWidth = 1 / editor.camera.zoom;
  ctx.setLineDash([6 / editor.camera.zoom, 4 / editor.camera.zoom]);
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Path
// ---------------------------------------------------------------------------

export interface PathSettings {
  style: PathStyle;
  width: number;
  taper: number;
  jitter: number;
  smoothing: number;
  color: string;
  outlineColor: string;
  outlineWidth: number;
  closed: boolean;
  /** Freehand drawing instead of click-to-place nodes. */
  freehand: boolean;
}

export const pathSettings: PathSettings = {
  style: 'river', width: 14, taper: 0.75, jitter: 1.5, smoothing: 1,
  color: '#7fa0aa', outlineColor: '#4d6b78', outlineWidth: 3, closed: false, freehand: false,
};

let pathNodes: Vec2[] = [];
let pathHover: Vec2 | null = null;
let freehandActive = false;

function commitPath(editor: Editor): void {
  if (pathNodes.length >= 2) {
    editor.addObject(makePath(pathSettings.style, pathNodes, editor.paletteId, {
      width: pathSettings.width,
      taper: pathSettings.taper,
      jitter: pathSettings.jitter,
      smoothing: pathSettings.smoothing,
      color: pathSettings.color,
      outlineColor: pathSettings.outlineColor,
      outlineWidth: pathSettings.outlineWidth,
      closed: pathSettings.closed,
    }));
  }
  pathNodes = [];
  pathHover = null;
  editor.emitChange();
}

export const pathTool: Tool = {
  id: 'path',
  label: 'River / Road',
  shortcut: 'p',
  cursor: 'crosshair',
  hint: 'Click to add points, double-click or press Enter to finish. Esc cancels.',
  onPointerDown(c) {
    if (c.button !== 0) return;
    c.editor.overlayDraw = drawPathOverlay;
    if (pathSettings.freehand) {
      freehandActive = true;
      pathNodes = [c.map];
      return;
    }
    pathNodes.push(c.editor.snap(c.map, 'none'));
    c.editor.emitChange();
  },
  onPointerMove(c) {
    if (freehandActive) {
      const last = pathNodes[pathNodes.length - 1];
      if (!last || Math.hypot(c.map.x - last.x, c.map.y - last.y) > 8) pathNodes.push(c.map);
      c.editor.emitChange();
      return;
    }
    if (pathNodes.length) { pathHover = c.map; c.editor.emitChange(); }
  },
  onPointerUp(c) {
    if (freehandActive) {
      freehandActive = false;
      commitPath(c.editor);
    }
  },
  onDoubleClick(c) { commitPath(c.editor); },
  onKeyDown(c) {
    if (c.key === 'Enter') { commitPath(c.editor); return true; }
    if (c.key === 'Escape') { pathNodes = []; pathHover = null; c.editor.emitChange(); return true; }
    if (c.key === 'Backspace' && pathNodes.length) { pathNodes.pop(); c.editor.emitChange(); return true; }
  },
  onDeactivate(editor) { if (pathNodes.length >= 2) commitPath(editor); else { pathNodes = []; } },
  drawOverlay: drawPathOverlay,
};

function drawPathOverlay(ctx: CanvasRenderingContext2D, editor: Editor): void {
  if (!pathNodes.length) return;
  const z = editor.camera.zoom;
  const pts = pathHover ? [...pathNodes, pathHover] : pathNodes;
  ctx.save();
  ctx.strokeStyle = '#8fd3ff';
  ctx.lineWidth = Math.max(1, pathSettings.width) / 1;
  ctx.globalAlpha = 0.4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#12100e';
  ctx.lineWidth = 1 / z;
  for (const p of pathNodes) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4 / z, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Token
// ---------------------------------------------------------------------------

export interface TokenSettings {
  label: string;
  color: string;
  cells: number;
  shape: 'circle' | 'square';
  disposition: 'friendly' | 'neutral' | 'hostile' | 'secret';
}

export const tokenSettings: TokenSettings = {
  label: 'G', color: '#c4483a', cells: 1, shape: 'circle', disposition: 'hostile',
};

export const tokenTool: Tool = {
  id: 'token',
  label: 'Token',
  shortcut: 'k',
  cursor: 'crosshair',
  hint: 'Drop creature markers. They export as a separate layer so the VTT can ignore them.',
  onPointerDown(c) {
    if (c.button !== 0) return;
    const p = c.editor.snap(c.map, 'cell');
    c.editor.addObject(makeToken(tokenSettings.label, p.x, p.y, {
      color: tokenSettings.color,
      cells: tokenSettings.cells,
      shape: tokenSettings.shape,
      disposition: tokenSettings.disposition,
    }));
  },
};
