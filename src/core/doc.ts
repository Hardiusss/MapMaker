/** Construction and mutation helpers for `MapDocument`. */
import {
  type MapDocument, type Layer, type RasterLayer, type ObjectLayer, type WallLayer,
  type LightLayer, type NoteLayer, type MapKind, type GridConfig, type FillStyle,
  type LayerRole, type MapObject, MAP_KINDS, isRaster, isObjectLayer,
} from './types';
import { uid } from './id';
import { createSurface } from '../util/canvas';
import { paletteById } from './color';

export function defaultGrid(kind: MapKind): GridConfig {
  const info = MAP_KINDS.find((k) => k.kind === kind) || MAP_KINDS[0];
  return {
    type: info.defaultGrid,
    size: info.defaultCell,
    offsetX: 0,
    offsetY: 0,
    color: '#000000',
    opacity: kind === 'region' || kind === 'city' ? 0.18 : 0.32,
    lineWidth: 1,
    visible: info.defaultGrid !== 'none',
    snap: info.defaultGrid !== 'none',
    unitsPerCell: info.defaultUnits,
    unitLabel: info.defaultUnitLabel,
    majorEvery: info.defaultGrid === 'square' ? 5 : 0,
  };
}

export function makeRasterLayer(name: string, w: number, h: number, role: LayerRole = 'custom'): RasterLayer {
  return {
    id: uid('l_'), name, kind: 'raster', visible: true, locked: false,
    opacity: 1, blend: 'normal', role, surface: createSurface(w, h), clipToBelow: false,
  };
}

export function makeObjectLayer(name: string, role: LayerRole = 'custom'): ObjectLayer {
  return { id: uid('l_'), name, kind: 'object', visible: true, locked: false, opacity: 1, blend: 'normal', role, objects: [] };
}

export function makeWallLayer(name = 'VTT Walls'): WallLayer {
  return { id: uid('l_'), name, kind: 'wall', visible: true, locked: false, opacity: 1, blend: 'normal', role: 'vtt-walls', walls: [] };
}

export function makeLightLayer(name = 'VTT Lighting'): LightLayer {
  return { id: uid('l_'), name, kind: 'light', visible: true, locked: false, opacity: 1, blend: 'normal', role: 'vtt-lights', lights: [] };
}

export function makeNoteLayer(name = 'GM Notes'): NoteLayer {
  return {
    id: uid('l_'), name, kind: 'note', visible: true, locked: false,
    opacity: 1, blend: 'normal', role: 'vtt-notes', notes: [], gmOnly: true,
  };
}

function backgroundFor(kind: MapKind, paletteId: string): FillStyle {
  const p = paletteById(paletteId);
  switch (kind) {
    case 'region':
    case 'hex':
      return { type: 'texture', color: p.parchment, textureId: 'parchment', textureScale: 1 };
    case 'city':
    case 'operational':
      return { type: 'texture', color: p.parchment, textureId: 'parchment-fine', textureScale: 1 };
    case 'dungeon':
    case 'cave':
      return { type: 'solid', color: '#12100e' };
    case 'castle':
    case 'battle':
      return { type: 'solid', color: '#1a1714' };
    default:
      return { type: 'solid', color: p.parchment };
  }
}

/** Layer stacks tuned for each kind of map — the app's opinionated starting point. */
export function defaultLayers(kind: MapKind, w: number, h: number): Layer[] {
  switch (kind) {
    case 'region':
    case 'hex':
      return [
        makeRasterLayer('Ocean & Landmass', w, h, 'background'),
        makeRasterLayer('Terrain', w, h, 'terrain'),
        makeRasterLayer('Water', w, h, 'water'),
        makeRasterLayer('Shading & Relief', w, h, 'relief'),
        // Rivers sit above the shading but below the relief stamps, so a river
        // reads through a forest without being drawn over a mountain peak.
        makeObjectLayer('Rivers & Lakes', 'water'),
        makeObjectLayer('Landmarks', 'features'),
        makeObjectLayer('Routes & Borders', 'features'),
        makeObjectLayer('Labels', 'labels'),
        makeNoteLayer(),
      ];
    case 'operational':
      return [
        makeRasterLayer('Terrain', w, h, 'background'),
        makeRasterLayer('Relief', w, h, 'relief'),
        makeRasterLayer('Water', w, h, 'water'),
        makeObjectLayer('Watercourse', 'water'),
        makeObjectLayer('Roads & Crossings', 'features'),
        makeObjectLayer('Places', 'features'),
        // The staff overlay: sectors, objectives, deployment zones, the legend.
        // Kept as its own layer so it can be switched off to get a clean
        // terrain map, or switched on alone to print a planning sheet.
        { ...makeObjectLayer('Operations Overlay', 'labels'), aboveGrid: true },
        makeObjectLayer('Labels', 'labels'),
        makeNoteLayer(),
      ];
    case 'city':
      return [
        makeRasterLayer('Ground', w, h, 'background'),
        makeRasterLayer('Terrain', w, h, 'terrain'),
        makeRasterLayer('Water', w, h, 'water'),
        makeObjectLayer('Streets', 'features'),
        makeObjectLayer('Buildings', 'features'),
        makeObjectLayer('Walls & Gates', 'features'),
        makeObjectLayer('Labels', 'labels'),
        makeWallLayer(),
        makeLightLayer(),
        makeNoteLayer(),
      ];
    case 'dungeon':
    case 'cave':
      return [
        makeRasterLayer('Void', w, h, 'background'),
        makeRasterLayer('Floor', w, h, 'floor'),
        makeRasterLayer('Wall Faces', w, h, 'walls-art'),
        makeRasterLayer('Shadow & Depth', w, h, 'relief'),
        makeObjectLayer('Terrain Features', 'features'),
        makeObjectLayer('Furnishings', 'features'),
        makeObjectLayer('Doors & Stairs', 'features'),
        // Traps are the GM's business. They ride above the darkness because a
        // GM map is a working document: a pit trap you cannot see in an unlit
        // corridor is a pit trap you will forget to spring.
        { ...makeObjectLayer('Hazards', 'gm'), gmOnly: true, aboveLighting: true },
        // The key sits on top of the darkness: room numbers a GM cannot read in
        // the unlit half of the dungeon are not a key.
        { ...makeObjectLayer('Labels', 'labels'), aboveLighting: true },
        makeWallLayer(),
        makeLightLayer(),
        { ...makeNoteLayer(), aboveLighting: true },
      ];
    // A castle is an outdoor tactical map with a dungeon's appetite for walls:
    // ground and water under everything, the masonry as its own raster so the
    // curtain can be inked, and the usual VTT trio on top.
    case 'castle':
      return [
        makeRasterLayer('Ground', w, h, 'background'),
        makeRasterLayer('Ditch & Water', w, h, 'water'),
        makeRasterLayer('Courtyards & Floors', w, h, 'floor'),
        makeRasterLayer('Masonry & Earthworks', w, h, 'walls-art'),
        makeRasterLayer('Shadow & Relief', w, h, 'relief'),
        makeObjectLayer('Defences', 'features'),
        makeObjectLayer('Buildings', 'features'),
        makeObjectLayer('Gates & Stairs', 'features'),
        makeObjectLayer('Furnishings', 'features'),
        { ...makeObjectLayer('Labels', 'labels'), aboveLighting: true },
        makeWallLayer(),
        makeLightLayer(),
        makeNoteLayer(),
      ];
    case 'battle':
      return [
        makeRasterLayer('Ground', w, h, 'background'),
        makeRasterLayer('Terrain', w, h, 'terrain'),
        makeRasterLayer('Water', w, h, 'water'),
        makeRasterLayer('Shading', w, h, 'relief'),
        makeObjectLayer('Props', 'features'),
        { ...makeObjectLayer('Tokens', 'gm'), gmOnly: true },
        makeObjectLayer('Labels', 'labels'),
        makeWallLayer(),
        makeLightLayer(),
        makeNoteLayer(),
      ];
    default:
      return [
        makeRasterLayer('Background', w, h, 'background'),
        makeRasterLayer('Paint', w, h, 'terrain'),
        makeObjectLayer('Objects', 'features'),
        makeObjectLayer('Labels', 'labels'),
        makeWallLayer(),
        makeLightLayer(),
        makeNoteLayer(),
      ];
  }
}

export interface NewDocOptions {
  kind?: MapKind;
  width?: number;
  height?: number;
  title?: string;
  paletteId?: string;
  gridOverride?: Partial<GridConfig>;
}

export function createDocument(opts: NewDocOptions = {}): MapDocument {
  const kind = opts.kind || 'region';
  const info = MAP_KINDS.find((k) => k.kind === kind)!;
  const width = Math.round(opts.width || info.defaultSize.w);
  const height = Math.round(opts.height || info.defaultSize.h);
  const layers = defaultLayers(kind, width, height);
  const now = Date.now();

  return {
    id: uid('doc_'),
    kind,
    width,
    height,
    paletteId: opts.paletteId || 'atlas',
    background: backgroundFor(kind, opts.paletteId || 'atlas'),
    grid: { ...defaultGrid(kind), ...(opts.gridOverride || {}) },
    layers,
    activeLayerId: layers[1]?.id || layers[0].id,
    meta: {
      title: opts.title || `${info.label} Map`,
      author: '',
      description: '',
      created: now,
      modified: now,
      tags: [],
    },
    lighting: {
      globalLight: kind !== 'dungeon' && kind !== 'cave',
      darkness: kind === 'dungeon' || kind === 'cave' ? 1 : 0,
      ambientColor: '#ffffff',
      preview: false,
    },
    vttPadding: kind === 'dungeon' || kind === 'cave' || kind === 'battle' || kind === 'castle' ? 0.25 : 0,
  };
}

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

export function findLayer(doc: MapDocument, id: string | null): Layer | undefined {
  return id ? doc.layers.find((l) => l.id === id) : undefined;
}

export function activeLayer(doc: MapDocument): Layer | undefined {
  return findLayer(doc, doc.activeLayerId);
}

export function layerByRole(doc: MapDocument, role: LayerRole): Layer | undefined {
  return doc.layers.find((l) => l.role === role);
}

export function rasterByRole(doc: MapDocument, role: LayerRole): RasterLayer | undefined {
  const l = layerByRole(doc, role);
  return l && isRaster(l) ? l : undefined;
}

export function objectLayerByRole(doc: MapDocument, role: LayerRole): ObjectLayer | undefined {
  const l = layerByRole(doc, role);
  return l && isObjectLayer(l) ? l : undefined;
}

export function allObjects(doc: MapDocument): { layer: ObjectLayer; object: MapObject }[] {
  const out: { layer: ObjectLayer; object: MapObject }[] = [];
  for (const l of doc.layers) if (isObjectLayer(l)) for (const o of l.objects) out.push({ layer: l, object: o });
  return out;
}

export function findObject(doc: MapDocument, id: string): { layer: ObjectLayer; object: MapObject } | undefined {
  for (const l of doc.layers) {
    if (!isObjectLayer(l)) continue;
    const o = l.objects.find((ob) => ob.id === id);
    if (o) return { layer: l, object: o };
  }
  return undefined;
}

export function wallLayer(doc: MapDocument): WallLayer | undefined {
  return doc.layers.find((l): l is WallLayer => l.kind === 'wall');
}

export function lightLayer(doc: MapDocument): LightLayer | undefined {
  return doc.layers.find((l): l is LightLayer => l.kind === 'light');
}

export function noteLayer(doc: MapDocument): NoteLayer | undefined {
  return doc.layers.find((l): l is NoteLayer => l.kind === 'note');
}

/** Ensure a document has the VTT layers even when it was created blank. */
export function ensureVttLayers(doc: MapDocument): MapDocument {
  const layers = doc.layers.slice();
  if (!layers.some((l) => l.kind === 'wall')) layers.push(makeWallLayer());
  if (!layers.some((l) => l.kind === 'light')) layers.push(makeLightLayer());
  if (!layers.some((l) => l.kind === 'note')) layers.push(makeNoteLayer());
  return { ...doc, layers };
}

/** Resize the document canvas, growing/cropping every raster layer with it. */
export function resizeDocument(doc: MapDocument, w: number, h: number, anchor: 'topleft' | 'center' = 'topleft'): MapDocument {
  const dx = anchor === 'center' ? Math.round((w - doc.width) / 2) : 0;
  const dy = anchor === 'center' ? Math.round((h - doc.height) / 2) : 0;
  const layers = doc.layers.map((l) => {
    if (!isRaster(l)) return l;
    const next = createSurface(w, h);
    next.getContext('2d')!.drawImage(l.surface, dx, dy);
    return { ...l, surface: next };
  });
  return { ...doc, width: w, height: h, layers };
}

export function touch(doc: MapDocument): MapDocument {
  return { ...doc, meta: { ...doc.meta, modified: Date.now() } };
}
