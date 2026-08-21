/**
 * Aetheria Cartographer — core document model.
 *
 * Everything the editor knows about a map lives in a `MapDocument`. The model is
 * deliberately plain-data (except for the raster surfaces, which hold a live
 * canvas) so that undo/redo, serialisation and the VTT exporters can all work
 * against the same structure.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export interface Vec2 { x: number; y: number; }
export interface Rect { x: number; y: number; w: number; h: number; }

export type BlendMode =
  | 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten'
  | 'color-dodge' | 'color-burn' | 'hard-light' | 'soft-light'
  | 'difference' | 'exclusion' | 'hue' | 'saturation' | 'color' | 'luminosity';

export const BLEND_MODES: BlendMode[] = [
  'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
  'color-dodge', 'color-burn', 'hard-light', 'soft-light',
  'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity',
];

/** Canvas2D name for a blend mode (`normal` maps to `source-over`). */
export function blendToComposite(b: BlendMode): GlobalCompositeOperation {
  return (b === 'normal' ? 'source-over' : b) as GlobalCompositeOperation;
}

// ---------------------------------------------------------------------------
// Map kinds & presets
// ---------------------------------------------------------------------------

export type MapKind = 'region' | 'operational' | 'city' | 'dungeon' | 'cave' | 'battle' | 'hex' | 'blank';

export interface MapKindInfo {
  kind: MapKind;
  label: string;
  blurb: string;
  defaultGrid: GridType;
  defaultCell: number;
  defaultUnits: number;
  defaultUnitLabel: string;
  defaultSize: { w: number; h: number };
}

export const MAP_KINDS: MapKindInfo[] = [
  {
    kind: 'region', label: 'Region / World', blurb: 'Continents, coastlines, mountain ranges, kingdoms.',
    defaultGrid: 'none', defaultCell: 128, defaultUnits: 24, defaultUnitLabel: 'mi',
    defaultSize: { w: 2400, h: 1600 },
  },
  {
    kind: 'operational', label: 'Operational / Theatre',
    blurb: 'A few miles of ground: where an army can go, and where it cannot.',
    defaultGrid: 'square', defaultCell: 96, defaultUnits: 100, defaultUnitLabel: 'yd',
    defaultSize: { w: 2688, h: 1920 },
  },
  {
    kind: 'city', label: 'City / Settlement', blurb: 'Districts, streets, walls, harbours, keeps.',
    defaultGrid: 'none', defaultCell: 64, defaultUnits: 100, defaultUnitLabel: 'ft',
    defaultSize: { w: 2048, h: 2048 },
  },
  {
    kind: 'dungeon', label: 'Dungeon', blurb: 'Rooms, corridors, doors and traps on a tactical grid.',
    defaultGrid: 'square', defaultCell: 70, defaultUnits: 5, defaultUnitLabel: 'ft',
    defaultSize: { w: 2800, h: 2100 },
  },
  {
    kind: 'cave', label: 'Cave System', blurb: 'Organic caverns carved by cellular automata.',
    defaultGrid: 'square', defaultCell: 70, defaultUnits: 5, defaultUnitLabel: 'ft',
    defaultSize: { w: 2800, h: 2100 },
  },
  {
    kind: 'battle', label: 'Battle Map', blurb: 'Tactical encounter terrain, ready for tokens.',
    defaultGrid: 'square', defaultCell: 70, defaultUnits: 5, defaultUnitLabel: 'ft',
    defaultSize: { w: 2240, h: 1680 },
  },
  {
    kind: 'hex', label: 'Hex Wilderness', blurb: 'Overland hex crawl with per-hex terrain.',
    defaultGrid: 'hexPointy', defaultCell: 96, defaultUnits: 6, defaultUnitLabel: 'mi',
    defaultSize: { w: 2400, h: 1800 },
  },
  {
    kind: 'blank', label: 'Blank Canvas', blurb: 'Start from nothing and build it yourself.',
    defaultGrid: 'none', defaultCell: 70, defaultUnits: 5, defaultUnitLabel: 'ft',
    defaultSize: { w: 2048, h: 1536 },
  },
];

// ---------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------

export type GridType = 'none' | 'square' | 'hexPointy' | 'hexFlat' | 'isometric';

export interface GridConfig {
  type: GridType;
  /** Cell size in map pixels (square: edge length; hex: width across flats). */
  size: number;
  offsetX: number;
  offsetY: number;
  color: string;
  opacity: number;
  lineWidth: number;
  visible: boolean;
  /** Snap new geometry to the grid. */
  snap: boolean;
  /** How many world units one cell represents (5 ft, 6 mi, …). */
  unitsPerCell: number;
  unitLabel: string;
  /** Draw a heavier line every N cells. Zero disables. */
  majorEvery: number;
}

// ---------------------------------------------------------------------------
// Objects
// ---------------------------------------------------------------------------

export type ObjectKind = 'stamp' | 'text' | 'shape' | 'path' | 'token' | 'image';

export interface ObjectBase {
  id: string;
  kind: ObjectKind;
  name: string;
  x: number;
  y: number;
  /** Degrees, clockwise. */
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  blend: BlendMode;
  visible: boolean;
  locked: boolean;
  /** Optional drop shadow — huge for readability on hand-drawn style maps. */
  shadow?: { color: string; blur: number; dx: number; dy: number } | null;
  /** Free-form GM notes attached to any object; exported to VTT journal pins. */
  note?: string;
}

export interface StampObject extends ObjectBase {
  kind: 'stamp';
  /** Key into the procedural asset library, e.g. `terrain/mountain-range`. */
  assetId: string;
  /** Per-instance seed so two copies of the same asset never look identical. */
  seed: number;
  /**
   * Pin a specific variant instead of deriving one from the seed.
   *
   * Most stamps want the seed-derived variant — that is what stops a forest of
   * the same tree. A few carry data rather than style: a numbered room marker's
   * variant *is* its number, and it must survive a reseed.
   */
  variant?: number;
  /** Base draw size in map px before scaleX/scaleY. */
  width: number;
  height: number;
  /** Primary / secondary recolouring of the procedural art. */
  tint?: string | null;
  tintStrength: number;
  /** Palette override id (assets ship with several colourways). */
  palette?: string | null;
}

export type TextCurve = 'straight' | 'arcUp' | 'arcDown' | 'path';

export interface TextObject extends ObjectBase {
  kind: 'text';
  text: string;
  font: string;
  size: number;
  color: string;
  strokeColor: string;
  strokeWidth: number;
  bold: boolean;
  italic: boolean;
  letterSpacing: number;
  lineHeight: number;
  align: 'left' | 'center' | 'right';
  curve: TextCurve;
  /** Radius for arcUp / arcDown. */
  curveRadius: number;
  /** Small-caps style banner behind the label. */
  banner?: 'none' | 'plaque' | 'scroll' | 'underline';
  bannerColor?: string;
}

export type ShapeKind = 'rect' | 'ellipse' | 'polygon' | 'star' | 'freeform';

export interface FillStyle {
  type: 'solid' | 'texture' | 'linear' | 'radial' | 'none';
  color: string;
  color2?: string;
  /** Texture id from the procedural texture library. */
  textureId?: string;
  textureScale?: number;
  angle?: number;
}

export interface ShapeObject extends ObjectBase {
  kind: 'shape';
  shape: ShapeKind;
  w: number;
  h: number;
  /** For polygon/star/freeform, in local space around (0,0). */
  points: Vec2[];
  sides: number;
  cornerRadius: number;
  fill: FillStyle;
  strokeColor: string;
  strokeWidth: number;
  dash: number[];
}

export type PathStyle = 'river' | 'road' | 'trail' | 'border' | 'wall' | 'ridge' | 'custom';

export interface PathNode extends Vec2 {
  /** Per-node width multiplier — lets rivers widen towards the sea. */
  w?: number;
}

export interface PathObject extends ObjectBase {
  kind: 'path';
  nodes: PathNode[];
  closed: boolean;
  style: PathStyle;
  width: number;
  /** Rivers taper from source to mouth when > 0. */
  taper: number;
  color: string;
  color2: string;
  outlineColor: string;
  outlineWidth: number;
  dash: number[];
  /** Roughness applied along the path so nothing looks CAD-straight. */
  jitter: number;
  smoothing: number;
}

export interface TokenObject extends ObjectBase {
  kind: 'token';
  label: string;
  color: string;
  /** Size in grid cells (1 = medium, 2 = large, …). */
  cells: number;
  shape: 'circle' | 'square';
  disposition: 'friendly' | 'neutral' | 'hostile' | 'secret';
}

export interface ImageObject extends ObjectBase {
  kind: 'image';
  /** data: URL — projects stay self-contained and offline. */
  src: string;
  width: number;
  height: number;
}

export type MapObject = StampObject | TextObject | ShapeObject | PathObject | TokenObject | ImageObject;

// ---------------------------------------------------------------------------
// VTT data: walls, doors, lights, notes
// ---------------------------------------------------------------------------

export type WallKind = 'wall' | 'door' | 'secretDoor' | 'window' | 'invisible' | 'terrain' | 'ethereal';
export type DoorState = 'closed' | 'open' | 'locked';

export interface Wall {
  id: string;
  a: Vec2;
  b: Vec2;
  kind: WallKind;
  /** Foundry: does it block movement? */
  blocksMovement: boolean;
  /** Foundry: does it block sight? */
  blocksSight: boolean;
  /** Foundry: does it block sound? */
  blocksSound: boolean;
  doorState: DoorState;
  /** One-way walls (direction of the blocking side). */
  dir: 'both' | 'left' | 'right';
}

export interface LightSource {
  id: string;
  x: number;
  y: number;
  /** Bright radius in map px. */
  bright: number;
  /** Dim radius in map px. */
  dim: number;
  color: string;
  intensity: number;
  /** Cone lights. */
  angle: number;
  rotation: number;
  animation: 'none' | 'torch' | 'pulse' | 'chroma' | 'flame' | 'hexa';
  animationSpeed: number;
  name: string;
}

export interface MapNote {
  id: string;
  x: number;
  y: number;
  title: string;
  body: string;
  icon: string;
  color: string;
}

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

export type LayerKind = 'raster' | 'object' | 'wall' | 'light' | 'note';

export interface LayerBase {
  id: string;
  name: string;
  kind: LayerKind;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blend: BlendMode;
  /** Layer role — the generators and exporters use this to find things. */
  role?: LayerRole;
  /**
   * Keep this layer out of anything the players see. Used by the export
   * dialog's player/GM switch — secret annotations, tokens, keyed room numbers.
   */
  gmOnly?: boolean;
  /**
   * Draw this layer after the darkness pass rather than before it.
   *
   * A dungeon lit by torchlight is mostly dark, which is the point — but the
   * room numbers and the GM's notes are annotations *on* the map, not objects
   * *in* it, and a key you cannot read in the unlit half of the dungeon is no
   * key at all.
   */
  aboveLighting?: boolean;
  /**
   * Draw this layer after the measuring grid rather than before it.
   *
   * The grid is an instrument laid over the map, so it belongs on top of the
   * terrain — but not on top of the key, which is a piece of paper pinned to
   * the corner of the sheet and would be unreadable with rulings through it.
   */
  aboveGrid?: boolean;
}

export type LayerRole =
  | 'background' | 'terrain' | 'water' | 'relief' | 'floor' | 'walls-art'
  | 'features' | 'labels' | 'grid' | 'gm' | 'vtt-walls' | 'vtt-lights' | 'vtt-notes'
  | 'custom';

export interface RasterLayer extends LayerBase {
  kind: 'raster';
  /** Live drawing surface. Never serialised directly — see `serialize.ts`. */
  surface: HTMLCanvasElement;
  /** Clip this layer to the alpha of the layer beneath it. */
  clipToBelow: boolean;
}

export interface ObjectLayer extends LayerBase {
  kind: 'object';
  objects: MapObject[];
}

export interface WallLayer extends LayerBase {
  kind: 'wall';
  walls: Wall[];
}

export interface LightLayer extends LayerBase {
  kind: 'light';
  lights: LightSource[];
}

export interface NoteLayer extends LayerBase {
  kind: 'note';
  notes: MapNote[];
}

export type Layer = RasterLayer | ObjectLayer | WallLayer | LightLayer | NoteLayer;

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

export interface MapMeta {
  title: string;
  author: string;
  description: string;
  created: number;
  modified: number;
  tags: string[];
  /** Seed of the generator that produced the map, when applicable. */
  seed?: number;
}

export interface GlobalLighting {
  /** Global illumination on/off, mirrors Foundry's scene setting. */
  globalLight: boolean;
  darkness: number;
  ambientColor: string;
  /** Preview-only: render the light falloff inside the editor. */
  preview: boolean;
}

export interface MapDocument {
  id: string;
  kind: MapKind;
  width: number;
  height: number;
  /**
   * Colour scheme id. Lives on the document rather than only on the editor so
   * that exporting, saving and any headless use all agree on how the map is
   * meant to look without having to be told separately.
   */
  paletteId: string;
  /** Background paint under every layer. */
  background: FillStyle;
  grid: GridConfig;
  layers: Layer[];
  activeLayerId: string;
  meta: MapMeta;
  lighting: GlobalLighting;
  /** Padding in cells added around the image when exported to a VTT. */
  vttPadding: number;
}

export interface Selection {
  layerId: string | null;
  objectIds: string[];
  wallIds: string[];
  lightIds: string[];
  noteIds: string[];
}

export const EMPTY_SELECTION: Selection = {
  layerId: null, objectIds: [], wallIds: [], lightIds: [], noteIds: [],
};

// ---------------------------------------------------------------------------
// Narrowing helpers
// ---------------------------------------------------------------------------

export const isRaster = (l: Layer): l is RasterLayer => l.kind === 'raster';
export const isObjectLayer = (l: Layer): l is ObjectLayer => l.kind === 'object';
export const isWallLayer = (l: Layer): l is WallLayer => l.kind === 'wall';
export const isLightLayer = (l: Layer): l is LightLayer => l.kind === 'light';
export const isNoteLayer = (l: Layer): l is NoteLayer => l.kind === 'note';
