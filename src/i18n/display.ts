/**
 * Translation for strings that live in data rather than in the UI.
 *
 * Layer names, texture and palette ids, map kinds and tool presets are all
 * read by code that is not the interface — generators match layers by name,
 * exporters read `MAP_KINDS`, the project file stores whatever the layer was
 * called. So none of them are translated where they are defined; they are
 * translated here, at the point of display, and the stored value stays
 * English in every language.
 */
import { t } from './index';

/**
 * Default layer names, keyed by the exact string `defaultLayers()` stores.
 *
 * A name that is not in this table is one the user typed, so it is shown back
 * to them verbatim.
 */
const LAYER_KEYS: Record<string, string> = {
  'Ocean & Landmass': 'layer.oceanLandmass',
  'Terrain': 'layer.terrain',
  'Water': 'layer.water',
  'Shading & Relief': 'layer.shadingRelief',
  'Rivers & Lakes': 'layer.riversLakes',
  'Landmarks': 'layer.landmarks',
  'Routes & Borders': 'layer.routesBorders',
  'Labels': 'layer.labels',
  'Relief': 'layer.relief',
  'Watercourse': 'layer.watercourse',
  'Roads & Crossings': 'layer.roadsCrossings',
  'Places': 'layer.places',
  'Operations Overlay': 'layer.operationsOverlay',
  'Ground': 'layer.ground',
  'Streets': 'layer.streets',
  'Buildings': 'layer.buildings',
  'Walls & Gates': 'layer.wallsGates',
  'Void': 'layer.void',
  'Floor': 'layer.floor',
  'Wall Faces': 'layer.wallFaces',
  'Shadow & Depth': 'layer.shadowDepth',
  'Terrain Features': 'layer.terrainFeatures',
  'Furnishings': 'layer.furnishings',
  'Doors & Stairs': 'layer.doorsStairs',
  'Hazards': 'layer.hazards',
  'Ditch & Water': 'layer.ditchWater',
  'Courtyards & Floors': 'layer.courtyardsFloors',
  'Masonry & Earthworks': 'layer.masonryEarthworks',
  'Shadow & Relief': 'layer.shadowRelief',
  'Defences': 'layer.defences',
  'Gates & Stairs': 'layer.gatesStairs',
  'Shading': 'layer.shading',
  'Props': 'layer.props',
  'Tokens': 'layer.tokens',
  'Background': 'layer.background',
  'Paint': 'layer.paint',
  'Objects': 'layer.objects',
  'VTT Walls': 'layer.vttWalls',
  'VTT Lighting': 'layer.vttLighting',
  'GM Notes': 'layer.gmNotes',
  'Realms': 'layer.realms',
  'New Paint Layer': 'layer.newPaint',
  'New Object Layer': 'layer.newObject',
  'Imported Image': 'layer.importedImage',
};

/** What a layer is called on screen. The stored `layer.name` never changes. */
export function layerName(stored: string): string {
  const direct = LAYER_KEYS[stored];
  if (direct) return t(direct);
  // `duplicateLayer` appends " copy", so a duplicate of a default layer is
  // still recognisable — translate the base and re-suffix it.
  if (stored.endsWith(' copy')) {
    const base = stored.slice(0, -5);
    if (LAYER_KEYS[base]) return t('layer.copySuffix', { name: t(LAYER_KEYS[base]) });
  }
  return stored;
}

export function textureLabel(id: string, fallback: string): string {
  const key = `texture.${id}`;
  const s = t(key);
  return s === key ? fallback : s;
}

export function paletteName(id: string, fallback: string): string {
  const key = `palette.${id}`;
  const s = t(key);
  return s === key ? fallback : s;
}

export function paletteBlurb(id: string, fallback: string): string {
  const key = `palette.${id}.blurb`;
  const s = t(key);
  return s === key ? fallback : s;
}

export function mapKindLabel(kind: string): string { return t(`kind.${kind}`); }
export function mapKindBlurb(kind: string): string { return t(`kind.${kind}.blurb`); }

export function brushPresetLabel(id: string, fallback: string): string {
  const key = `brush.preset.${id}`;
  const s = t(key);
  return s === key ? fallback : s;
}

export function lightPresetLabel(id: string, fallback: string): string {
  const key = `light.preset.${id}`;
  const s = t(key);
  return s === key ? fallback : s;
}

/**
 * Undo-step names, keyed by the exact string the editor records.
 *
 * The label is written where the edit happens — deep in tools and generators
 * that have no business knowing what language the interface is in — and it is
 * stored on the history stack, which outlives any one language choice. So it
 * stays English there and is translated here, the same way layer names are.
 *
 * A label with no entry is shown as it is. That is the right failure: a new
 * command that has not been added here reads as an English word in the undo
 * tooltip, rather than as a raw key or as nothing at all.
 */
const HISTORY_KEYS: Record<string, string> = {
  'Edit': 'history.edit',
  'Add Layer': 'history.addLayer',
  'Delete Layer': 'history.deleteLayer',
  'Duplicate Layer': 'history.duplicateLayer',
  'Reorder Layer': 'history.reorderLayer',
  'Layer Settings': 'history.layerSettings',
  'Merge Down': 'history.mergeDown',
  'Clear Layer': 'history.clearLayer',
  'Rename': 'history.rename',
  'Add Object': 'history.addObject',
  'Edit Object': 'history.editObject',
  'Delete': 'history.delete',
  'Duplicate': 'history.duplicate',
  'Paste': 'history.paste',
  'Reorder': 'history.reorder',
  'Move': 'history.move',
  'Nudge': 'history.nudge',
  'Rotate': 'history.rotate',
  'Scale': 'history.scale',
  'Resize': 'history.resize',
  'Opacity': 'history.opacity',
  'Blend': 'history.blend',
  'Reseed': 'history.reseed',
  'Edit text': 'history.editText',
  'Edit label': 'history.editLabel',
  'Describe': 'history.describe',
  'Add Wall': 'history.addWall',
  'Add Walls': 'history.addWalls',
  'Edit Wall': 'history.editWall',
  'Derive walls': 'history.deriveWalls',
  'Add Light': 'history.addLight',
  'Edit Light': 'history.editLight',
  'Lighting': 'history.lighting',
  'Add Note': 'history.addNote',
  'Edit Note': 'history.editNote',
  'Delete note': 'history.deleteNote',
  'Paint': 'history.paint',
  'Erase': 'history.erase',
  'Fill Layer': 'history.fillLayer',
  'Flood Fill': 'history.floodFill',
  'Fill cells': 'history.fillCells',
  'Background': 'history.background',
  'Grid settings': 'history.gridSettings',
  'Hex settings': 'history.hexSettings',
  'Align grid': 'history.alignGrid',
  'Nudge grid': 'history.nudgeGrid',
  'Resize canvas': 'history.resizeCanvas',
  'Import image': 'history.importImage',
  'Castle masonry': 'history.castleMasonry',
  'Castle floor': 'history.castleFloor',
  'Castle shadow': 'history.castleShadow',
  'Castle objects': 'history.castleObjects',
};

/** What an undo step is called on screen. */
export function historyLabel(stored: string): string {
  const key = HISTORY_KEYS[stored];
  return key ? t(key) : stored;
}
