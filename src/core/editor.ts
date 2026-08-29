/**
 * The editor hub.
 *
 * Owns the document, the camera, the selection, the history and the active
 * tool, and is the only thing the React layer talks to. Everything mutating
 * goes through `mutate()` or `paint()` so undo always works.
 */
import type {
  MapDocument, Layer, MapObject, Selection, Rect, Vec2, Wall, LightSource, MapNote,
  RasterLayer, ObjectLayer, LayerRole,
} from './types';
import { EMPTY_SELECTION, isObjectLayer, isRaster } from './types';
import { Camera } from './camera';
import { History, cloneDoc, snapshotRect, clampRect } from './history';
import { Emitter } from './emitter';
import { createDocument, findLayer, makeObjectLayer, makeRasterLayer, touch, wallLayer, lightLayer, noteLayer } from './doc';
import { uid } from './id';
import { BrushStroke, DEFAULT_BRUSH, type BrushSettings } from '../render/brush';
import { snapPoint } from '../render/grid';
import { boundsOf } from './geometry';
import { objectBounds } from './objectBounds';
import type { Surface } from '../util/canvas';
import { t } from '../i18n';
import { plural } from '../i18n/plural';

export type ToolId =
  | 'select' | 'brush' | 'eraser' | 'fill' | 'stamp' | 'text' | 'shape'
  | 'path' | 'wall' | 'light' | 'note' | 'token' | 'measure' | 'pan' | 'eyedropper'
  | 'gridalign' | 'castle';

export interface ViewOptions {
  showGrid: boolean;
  showWalls: boolean;
  showLights: boolean;
  showNotes: boolean;
  showLightingPreview: boolean;
  soloLayerId: string | null;
}

export interface EditorEvents extends Record<string, unknown> {
  change: MapDocument;
  selection: Selection;
  camera: void;
  tool: ToolId;
  history: void;
  view: ViewOptions;
  status: string;
  brush: BrushSettings;
  /** Something asked the UI to open a dialog. */
  ui: { dialog: string; payload?: unknown };
}

export class Editor {
  doc: MapDocument;
  camera = new Camera();
  history = new History(150);
  selection: Selection = { ...EMPTY_SELECTION };
  events = new Emitter<EditorEvents>();

  tool: ToolId = 'brush';
  brush: BrushSettings = { ...DEFAULT_BRUSH };
  paletteId = 'atlas';

  view: ViewOptions = {
    showGrid: true,
    // Wall and light overlays are authoring aids, not part of the picture —
    // they switch on automatically when their tool is picked.
    showWalls: false,
    showLights: false,
    showNotes: true,
    showLightingPreview: false,
    soloLayerId: null,
  };

  /** Live stroke state, consumed by the renderer for previews. */
  stroke: BrushStroke | null = null;
  strokeLayerId: string | null = null;

  /** Non-persistent scratch used by tools that draw rubber bands. */
  overlayDraw: ((ctx: CanvasRenderingContext2D, editor: Editor) => void) | null = null;

  filePath: string | null = null;
  dirty = false;

  private clipboard: MapObject[] = [];

  constructor(doc?: MapDocument) {
    this.doc = doc || createDocument({ kind: 'region' });
    this.history.onChange = () => this.events.emit('history', undefined);
  }

  // -------------------------------------------------------------------------
  // Document
  // -------------------------------------------------------------------------

  setDocument(doc: MapDocument, opts: { resetHistory?: boolean; path?: string | null } = {}): void {
    this.doc = doc;
    if (doc.paletteId) this.paletteId = doc.paletteId;
    if (opts.resetHistory !== false) this.history.clear();
    this.selection = { ...EMPTY_SELECTION };
    this.filePath = opts.path ?? null;
    this.dirty = false;
    this.camera.fit(doc.width, doc.height);
    this.emitChange();
    this.events.emit('selection', this.selection);
    this.events.emit('camera', undefined);
  }

  emitChange(): void {
    this.events.emit('change', this.doc);
  }

  markDirty(): void {
    this.dirty = true;
  }

  /**
   * Structural edit. The callback receives a mutable clone; return nothing and
   * the clone is installed, with before/after recorded for undo.
   */
  mutate(label: string, fn: (draft: MapDocument) => void | MapDocument): void {
    const before = this.doc;
    const draft = cloneDoc(before);
    const result = fn(draft);
    const after = touch(result || draft);
    this.doc = after;
    this.history.push({ kind: 'doc', before, after }, label);
    this.markDirty();
    this.emitChange();
  }

  /** Group several mutations (and paint operations) into one undo step. */
  batch(label: string, fn: () => void): void {
    this.history.begin(label);
    try { fn(); } finally { this.history.commit(label); }
  }

  /** Record a raster change made directly to a layer surface. */
  paint(label: string, layer: RasterLayer, rect: Rect, draw: () => void): void {
    const r = clampRect(rect, layer.surface.width, layer.surface.height);
    const before = snapshotRect(layer.surface, r);
    draw();
    const after = snapshotRect(layer.surface, r);
    this.history.push({ kind: 'raster', layerId: layer.id, rect: r, before, after }, label);
    this.markDirty();
    this.emitChange();
  }

  undo(): void {
    if (!this.history.canUndo) return;
    this.doc = this.history.undo(this.doc);
    this.markDirty();
    this.emitChange();
  }

  redo(): void {
    if (!this.history.canRedo) return;
    this.doc = this.history.redo(this.doc);
    this.markDirty();
    this.emitChange();
  }

  // -------------------------------------------------------------------------
  // Layers
  // -------------------------------------------------------------------------

  get activeLayer(): Layer | undefined { return findLayer(this.doc, this.doc.activeLayerId); }

  get activeRaster(): RasterLayer | undefined {
    const l = this.activeLayer;
    return l && isRaster(l) ? l : undefined;
  }

  get activeObjectLayer(): ObjectLayer | undefined {
    const l = this.activeLayer;
    return l && isObjectLayer(l) ? l : undefined;
  }

  setActiveLayer(id: string): void {
    if (this.doc.activeLayerId === id) return;
    this.doc = { ...this.doc, activeLayerId: id };
    this.emitChange();
  }

  addLayer(kind: 'raster' | 'object', name?: string, role: LayerRole = 'custom'): void {
    this.mutate('Add Layer', (d) => {
      const layer = kind === 'raster'
        ? makeRasterLayer(name || 'New Paint Layer', d.width, d.height, role)
        : makeObjectLayer(name || 'New Object Layer', role);
      const idx = d.layers.findIndex((l) => l.id === d.activeLayerId);
      d.layers.splice(idx < 0 ? d.layers.length : idx + 1, 0, layer);
      d.activeLayerId = layer.id;
    });
  }

  removeLayer(id: string): void {
    if (this.doc.layers.length <= 1) return;
    this.mutate('Delete Layer', (d) => {
      const idx = d.layers.findIndex((l) => l.id === id);
      if (idx < 0) return;
      d.layers.splice(idx, 1);
      if (d.activeLayerId === id) d.activeLayerId = d.layers[Math.max(0, idx - 1)].id;
    });
  }

  duplicateLayer(id: string): void {
    this.mutate('Duplicate Layer', (d) => {
      const idx = d.layers.findIndex((l) => l.id === id);
      if (idx < 0) return;
      const src = d.layers[idx];
      let copy: Layer;
      if (src.kind === 'raster') {
        const surface = makeRasterLayer(src.name, d.width, d.height, src.role).surface;
        surface.getContext('2d')!.drawImage(src.surface, 0, 0);
        copy = { ...src, id: uid('l_'), name: `${src.name} copy`, surface };
      } else {
        copy = { ...cloneLayerData(src), id: uid('l_'), name: `${src.name} copy` } as Layer;
      }
      d.layers.splice(idx + 1, 0, copy);
      d.activeLayerId = copy.id;
    });
  }

  moveLayer(id: string, delta: number): void {
    this.mutate('Reorder Layer', (d) => {
      const idx = d.layers.findIndex((l) => l.id === id);
      const next = idx + delta;
      if (idx < 0 || next < 0 || next >= d.layers.length) return;
      const [l] = d.layers.splice(idx, 1);
      d.layers.splice(next, 0, l);
    });
  }

  updateLayer(id: string, patch: Partial<Layer>): void {
    this.mutate('Layer Settings', (d) => {
      const idx = d.layers.findIndex((l) => l.id === id);
      if (idx < 0) return;
      d.layers[idx] = { ...d.layers[idx], ...patch } as Layer;
    });
  }

  mergeLayerDown(id: string): void {
    this.mutate('Merge Down', (d) => {
      const idx = d.layers.findIndex((l) => l.id === id);
      if (idx <= 0) return;
      const upper = d.layers[idx], lower = d.layers[idx - 1];
      if (!isRaster(upper) || !isRaster(lower)) return;
      const ctx = lower.surface.getContext('2d')!;
      ctx.save();
      ctx.globalAlpha = upper.opacity;
      ctx.globalCompositeOperation = upper.blend === 'normal' ? 'source-over' : (upper.blend as GlobalCompositeOperation);
      ctx.drawImage(upper.surface, 0, 0);
      ctx.restore();
      d.layers.splice(idx, 1);
      d.activeLayerId = lower.id;
    });
  }

  clearLayer(id: string): void {
    const l = findLayer(this.doc, id);
    if (!l) return;
    if (isRaster(l)) {
      this.paint('Clear Layer', l, { x: 0, y: 0, w: l.surface.width, h: l.surface.height }, () => {
        l.surface.getContext('2d')!.clearRect(0, 0, l.surface.width, l.surface.height);
      });
    } else {
      this.mutate('Clear Layer', (d) => {
        const t = d.layers.find((x) => x.id === id);
        if (!t) return;
        if (t.kind === 'object') t.objects = [];
        if (t.kind === 'wall') t.walls = [];
        if (t.kind === 'light') t.lights = [];
        if (t.kind === 'note') t.notes = [];
      });
    }
  }

  // -------------------------------------------------------------------------
  // Selection
  // -------------------------------------------------------------------------

  setSelection(sel: Partial<Selection>): void {
    this.selection = { ...EMPTY_SELECTION, ...sel };
    this.events.emit('selection', this.selection);
  }

  clearSelection(): void { this.setSelection({}); }

  selectObjects(ids: string[], additive = false): void {
    const objectIds = additive
      ? Array.from(new Set([...this.selection.objectIds, ...ids]))
      : ids;
    this.selection = { ...this.selection, objectIds, wallIds: [], lightIds: [], noteIds: [] };
    this.events.emit('selection', this.selection);
  }

  get selectedObjects(): MapObject[] {
    const ids = new Set(this.selection.objectIds);
    const out: MapObject[] = [];
    for (const l of this.doc.layers) {
      if (!isObjectLayer(l)) continue;
      for (const o of l.objects) if (ids.has(o.id)) out.push(o);
    }
    return out;
  }

  selectionBounds(): Rect | null {
    const objs = this.selectedObjects;
    if (!objs.length) return null;
    let r: Rect | null = null;
    for (const o of objs) {
      const b = objectBounds(o, this.doc.grid);
      r = r ? {
        x: Math.min(r.x, b.x), y: Math.min(r.y, b.y),
        w: Math.max(r.x + r.w, b.x + b.w) - Math.min(r.x, b.x),
        h: Math.max(r.y + r.h, b.y + b.h) - Math.min(r.y, b.y),
      } : b;
    }
    return r;
  }

  // -------------------------------------------------------------------------
  // Objects
  // -------------------------------------------------------------------------

  addObject(obj: MapObject, layerId?: string): void {
    const target = layerId || this.activeObjectLayer?.id ||
      this.doc.layers.find((l) => isObjectLayer(l))?.id;
    if (!target) return;
    this.mutate('Add Object', (d) => {
      const l = d.layers.find((x) => x.id === target);
      if (l && l.kind === 'object') l.objects.push(obj);
    });
    this.selectObjects([obj.id]);
  }

  updateObjects(ids: string[], patch: (o: MapObject) => Partial<MapObject>, label = 'Edit Object'): void {
    const idSet = new Set(ids);
    this.mutate(label, (d) => {
      for (const l of d.layers) {
        if (l.kind !== 'object') continue;
        l.objects = l.objects.map((o) => (idSet.has(o.id) ? ({ ...o, ...patch(o) } as MapObject) : o));
      }
    });
  }

  deleteSelection(): void {
    const { objectIds, wallIds, lightIds, noteIds } = this.selection;
    if (!objectIds.length && !wallIds.length && !lightIds.length && !noteIds.length) return;
    const o = new Set(objectIds), w = new Set(wallIds), li = new Set(lightIds), n = new Set(noteIds);
    this.mutate('Delete', (d) => {
      for (const l of d.layers) {
        if (l.kind === 'object') l.objects = l.objects.filter((x) => !o.has(x.id));
        else if (l.kind === 'wall') l.walls = l.walls.filter((x) => !w.has(x.id));
        else if (l.kind === 'light') l.lights = l.lights.filter((x) => !li.has(x.id));
        else if (l.kind === 'note') l.notes = l.notes.filter((x) => !n.has(x.id));
      }
    });
    this.clearSelection();
  }

  duplicateSelection(offset = 24): void {
    const objs = this.selectedObjects;
    if (!objs.length) return;
    const copies: MapObject[] = objs.map((o) => ({ ...JSON.parse(JSON.stringify(o)), id: uid('o_'), x: o.x + offset, y: o.y + offset }));
    this.mutate('Duplicate', (d) => {
      // Copies land on the layer that owns the original, so a duplicated
      // label stays with the labels and a duplicated tree stays with the trees.
      for (const l of d.layers) {
        if (l.kind !== 'object') continue;
        const owned = new Set(l.objects.map((o) => o.id));
        const mine = copies.filter((_, i) => owned.has(objs[i].id));
        if (mine.length) l.objects.push(...mine);
      }
    });
    this.selectObjects(copies.map((c) => c.id));
  }

  copySelection(): void {
    const objs = this.selectedObjects;
    // Reporting "0 objects copied" is reporting a non-event; the clipboard is
    // also left alone, so a stray Ctrl+C does not throw away what is on it.
    if (!objs.length) { this.status(t('app.status.nothingToCopy')); return; }
    this.clipboard = JSON.parse(JSON.stringify(objs));
    this.status(t('app.status.copied', { objects: plural('count.objects', this.clipboard.length) }));
  }

  pasteClipboard(at?: Vec2): void {
    // Ctrl+V with an empty clipboard used to do nothing at all, which reads as
    // a broken shortcut rather than an empty clipboard.
    if (!this.clipboard.length) { this.status(t('app.status.nothingToPaste')); return; }
    const b = boundsOf(this.clipboard.map((o) => ({ x: o.x, y: o.y })));
    const target = at || { x: this.camera.x, y: this.camera.y };
    const dx = target.x - (b.x + b.w / 2);
    const dy = target.y - (b.y + b.h / 2);
    const copies = this.clipboard.map((o) => ({ ...JSON.parse(JSON.stringify(o)), id: uid('o_'), x: o.x + dx, y: o.y + dy }));
    this.mutate('Paste', (d) => {
      const layer = d.layers.find((l) => l.id === d.activeLayerId && l.kind === 'object')
        || d.layers.find((l) => l.kind === 'object');
      if (layer && layer.kind === 'object') layer.objects.push(...copies);
    });
    this.selectObjects(copies.map((c) => c.id));
  }

  bringForward(delta: number): void {
    const ids = new Set(this.selection.objectIds);
    if (!ids.size) return;
    this.mutate('Reorder', (d) => {
      for (const l of d.layers) {
        if (l.kind !== 'object') continue;
        const arr = l.objects;
        const indices = arr.map((o, i) => (ids.has(o.id) ? i : -1)).filter((i) => i >= 0);
        if (delta > 0) indices.reverse();
        for (const i of indices) {
          const j = Math.max(0, Math.min(arr.length - 1, i + delta));
          if (i === j) continue;
          const [o] = arr.splice(i, 1);
          arr.splice(j, 0, o);
        }
      }
    });
  }

  // -------------------------------------------------------------------------
  // Walls / lights / notes
  // -------------------------------------------------------------------------

  addWall(wall: Wall): void {
    this.mutate('Add Wall', (d) => {
      const l = d.layers.find((x) => x.kind === 'wall');
      if (l && l.kind === 'wall') l.walls.push(wall);
    });
  }

  addWalls(walls: Wall[], label = 'Add Walls'): void {
    if (!walls.length) return;
    this.mutate(label, (d) => {
      const l = d.layers.find((x) => x.kind === 'wall');
      if (l && l.kind === 'wall') l.walls.push(...walls);
    });
  }

  updateWall(id: string, patch: Partial<Wall>): void {
    this.mutate('Edit Wall', (d) => {
      const l = d.layers.find((x) => x.kind === 'wall');
      if (l && l.kind === 'wall') l.walls = l.walls.map((w) => (w.id === id ? { ...w, ...patch } : w));
    });
  }

  addLight(light: LightSource): void {
    this.mutate('Add Light', (d) => {
      const l = d.layers.find((x) => x.kind === 'light');
      if (l && l.kind === 'light') l.lights.push(light);
    });
  }

  updateLight(id: string, patch: Partial<LightSource>): void {
    this.mutate('Edit Light', (d) => {
      const l = d.layers.find((x) => x.kind === 'light');
      if (l && l.kind === 'light') l.lights = l.lights.map((x) => (x.id === id ? { ...x, ...patch } : x));
    });
  }

  addNote(note: MapNote): void {
    this.mutate('Add Note', (d) => {
      const l = d.layers.find((x) => x.kind === 'note');
      if (l && l.kind === 'note') l.notes.push(note);
    });
  }

  updateNote(id: string, patch: Partial<MapNote>): void {
    this.mutate('Edit Note', (d) => {
      const l = d.layers.find((x) => x.kind === 'note');
      if (l && l.kind === 'note') l.notes = l.notes.map((n) => (n.id === id ? { ...n, ...patch } : n));
    });
  }

  // -------------------------------------------------------------------------
  // View & tools
  // -------------------------------------------------------------------------

  setTool(tool: ToolId): void {
    if (this.tool === tool) return;
    this.tool = tool;
    this.events.emit('tool', tool);
  }

  setBrush(patch: Partial<BrushSettings>): void {
    this.brush = { ...this.brush, ...patch };
    this.events.emit('brush', this.brush);
  }

  setView(patch: Partial<ViewOptions>): void {
    this.view = { ...this.view, ...patch };
    this.events.emit('view', this.view);
  }

  setPalette(id: string): void {
    this.paletteId = id;
    // Keep the document in step so exports, saves and headless renders all
    // agree on the palette without being told separately.
    if (this.doc.paletteId !== id) this.doc = { ...this.doc, paletteId: id };
    this.emitChange();
  }

  snap(p: Vec2, mode: 'corner' | 'cell' | 'half' | 'none' = 'corner'): Vec2 {
    return snapPoint(p, this.doc.grid, mode);
  }

  status(msg: string): void { this.events.emit('status', msg); }

  openDialog(dialog: string, payload?: unknown): void {
    this.events.emit('ui', { dialog, payload });
  }
}

function cloneLayerData(l: Layer): Layer {
  switch (l.kind) {
    case 'object': return { ...l, objects: JSON.parse(JSON.stringify(l.objects)) };
    case 'wall': return { ...l, walls: JSON.parse(JSON.stringify(l.walls)) };
    case 'light': return { ...l, lights: JSON.parse(JSON.stringify(l.lights)) };
    case 'note': return { ...l, notes: JSON.parse(JSON.stringify(l.notes)) };
    default: return { ...l };
  }
}
