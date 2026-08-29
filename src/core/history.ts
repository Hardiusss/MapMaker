/**
 * Undo / redo.
 *
 * Two kinds of patch are recorded:
 *   • `doc`    — a structural snapshot (layers, objects, settings). Raster
 *                surfaces are shared by reference, so these stay cheap.
 *   • `raster` — the pixels of a dirty rectangle before and after a stroke.
 *
 * Keeping them separate means painting a stroke costs one small ImageData pair
 * instead of a full-canvas copy, and moving an object costs nothing but JSON.
 */
import type { MapDocument, Layer, Rect } from './types';
import { isRaster } from './types';

export interface RasterPatch {
  kind: 'raster';
  layerId: string;
  rect: Rect;
  before: ImageData;
  after: ImageData;
}

export interface DocPatch {
  kind: 'doc';
  before: MapDocument;
  after: MapDocument;
}

export type Patch = RasterPatch | DocPatch;

export interface HistoryEntry {
  label: string;
  patches: Patch[];
  at: number;
}

/** Deep-clone a document while keeping the live canvas surfaces by reference. */
export function cloneDoc(doc: MapDocument): MapDocument {
  const layers: Layer[] = doc.layers.map((l) => {
    switch (l.kind) {
      case 'raster': return { ...l };
      case 'object': return { ...l, objects: l.objects.map((o) => structuredCloneSafe(o)) };
      case 'wall': return { ...l, walls: l.walls.map((w) => ({ ...w, a: { ...w.a }, b: { ...w.b } })) };
      case 'light': return { ...l, lights: l.lights.map((x) => ({ ...x })) };
      case 'note': return { ...l, notes: l.notes.map((n) => ({ ...n })) };
    }
  });
  return {
    ...doc,
    background: { ...doc.background },
    grid: { ...doc.grid },
    meta: { ...doc.meta, tags: doc.meta.tags.slice() },
    lighting: { ...doc.lighting },
    layers,
  };
}

function structuredCloneSafe<T>(v: T): T {
  // Objects in the model are plain JSON-compatible data.
  return JSON.parse(JSON.stringify(v)) as T;
}

export class History {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private limit: number;
  private pending: Patch[] | null = null;
  private pendingLabel = '';
  onChange: (() => void) | null = null;

  constructor(limit = 120) { this.limit = limit; }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
  get undoLabel(): string { return this.undoStack.at(-1)?.label || ''; }
  get redoLabel(): string { return this.redoStack.at(-1)?.label || ''; }
  get depth(): number { return this.undoStack.length; }

  /** Group several patches into one undo step. */
  begin(label: string): void {
    this.pending = [];
    this.pendingLabel = label;
  }

  /**
   * Record one patch as its own undo step, unless a `begin()` is open.
   *
   * The label used to be hardcoded to "Edit" here, which meant every caller's
   * label was thrown away the moment it was not inside a batch — so the undo
   * button offered to undo "Edit" whether you had renamed the map, deleted a
   * layer or pasted a town. A history that will not say what is in it is worse
   * than one with no labels at all, because the tooltip claims otherwise.
   */
  push(patch: Patch, label = 'Edit'): void {
    if (this.pending) { this.pending.push(patch); return; }
    this.commitEntry({ label, patches: [patch], at: Date.now() });
  }

  commit(label?: string): void {
    if (!this.pending) return;
    const patches = this.pending;
    this.pending = null;
    if (!patches.length) return;
    this.commitEntry({ label: label || this.pendingLabel || 'Edit', patches, at: Date.now() });
  }

  abort(): void { this.pending = null; }

  private commitEntry(entry: HistoryEntry): void {
    this.undoStack.push(entry);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
    this.onChange?.();
  }

  /** Applies the inverse of the newest entry. Returns the document to install. */
  undo(current: MapDocument): MapDocument {
    const entry = this.undoStack.pop();
    if (!entry) return current;
    let doc = current;
    for (let i = entry.patches.length - 1; i >= 0; i--) {
      const p = entry.patches[i];
      if (p.kind === 'doc') doc = p.before;
      else applyRaster(doc, p, 'before');
    }
    this.redoStack.push(entry);
    this.onChange?.();
    return doc;
  }

  redo(current: MapDocument): MapDocument {
    const entry = this.redoStack.pop();
    if (!entry) return current;
    let doc = current;
    for (const p of entry.patches) {
      if (p.kind === 'doc') doc = p.after;
      else applyRaster(doc, p, 'after');
    }
    this.undoStack.push(entry);
    this.onChange?.();
    return doc;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.pending = null;
    this.onChange?.();
  }
}

function applyRaster(doc: MapDocument, patch: RasterPatch, which: 'before' | 'after'): void {
  const layer = doc.layers.find((l) => l.id === patch.layerId);
  if (!layer || !isRaster(layer)) return;
  const ctx = layer.surface.getContext('2d');
  if (!ctx) return;
  ctx.putImageData(patch[which], patch.rect.x, patch.rect.y);
}

/** Capture the pixels of a rect — used to bracket a paint operation. */
export function snapshotRect(surface: HTMLCanvasElement, rect: Rect): ImageData {
  const ctx = surface.getContext('2d', { willReadFrequently: true })!;
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  const w = Math.max(1, Math.min(surface.width - x, Math.ceil(rect.w)));
  const h = Math.max(1, Math.min(surface.height - y, Math.ceil(rect.h)));
  return ctx.getImageData(x, y, w, h);
}

export function clampRect(rect: Rect, w: number, h: number): Rect {
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  return {
    x, y,
    w: Math.max(1, Math.min(w - x, Math.ceil(rect.w + (rect.x - x)))),
    h: Math.max(1, Math.min(h - y, Math.ceil(rect.h + (rect.y - y)))),
  };
}
