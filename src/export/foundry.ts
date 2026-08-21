/**
 * Foundry VTT export.
 *
 * Produces a Scene document that Foundry can import directly: walls with the
 * correct sense/movement constants, doors with their state, ambient lights in
 * scene units, journal note pins, and grid metadata that matches the map.
 *
 * Constants are inlined so the exporter does not depend on a Foundry install:
 *   WALL_MOVEMENT_TYPES  NONE 0   NORMAL 20
 *   WALL_SENSE_TYPES     NONE 0   LIMITED 10   NORMAL 20
 *   WALL_DOOR_TYPES      NONE 0   DOOR 1   SECRET 2
 *   WALL_DOOR_STATES     CLOSED 0 OPEN 1   LOCKED 2
 *   GRID_TYPES           GRIDLESS 0 SQUARE 1 HEXODDR 2 HEXEVENR 3 HEXODDQ 4 HEXEVENQ 5
 */
import type { MapDocument, Wall, LightSource, MapNote, GridConfig } from '../core/types';
import { foundryId } from '../core/id';
import { parseColor } from '../core/color';

const MOVE_NONE = 0, MOVE_NORMAL = 20;
const SENSE_NONE = 0, SENSE_LIMITED = 10, SENSE_NORMAL = 20;
const DOOR_NONE = 0, DOOR_DOOR = 1, DOOR_SECRET = 2;
const DS_CLOSED = 0, DS_OPEN = 1, DS_LOCKED = 2;

export interface FoundryExportOptions {
  /** Path Foundry will use for the background image. */
  imagePath: string;
  /** Scene name; defaults to the document title. */
  name?: string;
  /** Include tokens placed in the editor as Foundry tokens. */
  includeTokens: boolean;
  /** Bake the editor's lighting preview into the image instead of exporting lights. */
  bakedLighting: boolean;
  /** Foundry generation to target. v10+ share the same shape here. */
  version: 11 | 12 | 13;
  /** Scene padding (0 – 0.5). */
  padding: number;
  /** Extra scene flags. */
  navigation: boolean;
  tokenVision: boolean;
  fogExploration: boolean;
}

export const DEFAULT_FOUNDRY_OPTIONS: FoundryExportOptions = {
  imagePath: 'worlds/my-world/scenes/map.webp',
  includeTokens: true,
  bakedLighting: false,
  version: 12,
  padding: 0.25,
  navigation: true,
  tokenVision: true,
  fogExploration: true,
};

function gridTypeFor(g: GridConfig): number {
  switch (g.type) {
    case 'square': return 1;
    case 'hexPointy': return 2;   // odd-r rows
    case 'hexFlat': return 4;     // odd-q columns
    default: return 0;
  }
}

function wallToFoundry(w: Wall) {
  const isDoor = w.kind === 'door' || w.kind === 'secretDoor';
  let move = w.blocksMovement ? MOVE_NORMAL : MOVE_NONE;
  let sense = w.blocksSight ? SENSE_NORMAL : SENSE_NONE;
  let sound = w.blocksSound ? SENSE_NORMAL : SENSE_NONE;

  if (w.kind === 'window') { sense = SENSE_LIMITED; move = MOVE_NORMAL; }
  if (w.kind === 'terrain') { move = MOVE_NONE; sense = SENSE_LIMITED; sound = SENSE_NONE; }
  if (w.kind === 'ethereal') { move = MOVE_NONE; sense = SENSE_NORMAL; sound = SENSE_NONE; }
  if (w.kind === 'invisible') { move = MOVE_NORMAL; sense = SENSE_NONE; sound = SENSE_NONE; }

  const ds = w.doorState === 'open' ? DS_OPEN : w.doorState === 'locked' ? DS_LOCKED : DS_CLOSED;
  if (isDoor && w.doorState === 'open') { move = MOVE_NONE; sense = SENSE_NONE; sound = SENSE_NONE; }

  return {
    _id: foundryId(),
    c: [Math.round(w.a.x), Math.round(w.a.y), Math.round(w.b.x), Math.round(w.b.y)],
    light: sense,
    move,
    sight: sense,
    sound,
    dir: w.dir === 'left' ? 1 : w.dir === 'right' ? 2 : 0,
    door: w.kind === 'secretDoor' ? DOOR_SECRET : w.kind === 'door' ? DOOR_DOOR : DOOR_NONE,
    ds,
    threshold: { light: null, sight: null, sound: null, attenuation: false },
    flags: {},
  };
}

function pxToUnits(px: number, grid: GridConfig): number {
  return +(px / Math.max(1, grid.size) * grid.unitsPerCell).toFixed(2);
}

function lightToFoundry(l: LightSource, grid: GridConfig) {
  const c = parseColor(l.color);
  return {
    _id: foundryId(),
    x: Math.round(l.x),
    y: Math.round(l.y),
    rotation: Math.round(l.rotation),
    walls: true,
    vision: false,
    config: {
      alpha: +(0.5 * l.intensity).toFixed(2),
      angle: l.angle,
      bright: pxToUnits(l.bright, grid),
      color: `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`,
      coloration: 1,
      dim: pxToUnits(l.dim, grid),
      attenuation: 0.5,
      luminosity: 0.5,
      saturation: 0,
      contrast: 0,
      shadows: 0,
      animation: l.animation === 'none'
        ? { type: null, speed: 5, intensity: 5, reverse: false }
        : { type: l.animation, speed: l.animationSpeed, intensity: 5, reverse: false },
      darkness: { min: 0, max: 1 },
    },
    hidden: false,
    flags: {},
  };
}

function noteToFoundry(n: MapNote, version: number) {
  const base = {
    _id: foundryId(),
    entryId: null as string | null,
    pageId: null as string | null,
    x: Math.round(n.x),
    y: Math.round(n.y),
    iconSize: 40,
    text: n.title,
    fontFamily: 'Signika',
    fontSize: 32,
    textAnchor: 1,
    textColor: '#FFFFFF',
    global: false,
    flags: { aetheria: { body: n.body } },
  };
  return version >= 12
    ? { ...base, texture: { src: 'icons/svg/book.svg', tint: n.color } }
    : { ...base, icon: 'icons/svg/book.svg', iconTint: n.color };
}

export interface FoundrySceneExport {
  scene: Record<string, unknown>;
  /** Ready-to-paste summary the UI shows next to the download. */
  summary: { walls: number; doors: number; lights: number; notes: number; tokens: number };
}

export function buildFoundryScene(doc: MapDocument, opts: Partial<FoundryExportOptions> = {}): FoundrySceneExport {
  const o = { ...DEFAULT_FOUNDRY_OPTIONS, ...opts };
  const wallLayer = doc.layers.find((l) => l.kind === 'wall');
  const lightLayer = doc.layers.find((l) => l.kind === 'light');
  const noteLayer = doc.layers.find((l) => l.kind === 'note');

  const walls = wallLayer && wallLayer.kind === 'wall' ? wallLayer.walls : [];
  const lights = o.bakedLighting ? [] : (lightLayer && lightLayer.kind === 'light' ? lightLayer.lights : []);
  const notes = noteLayer && noteLayer.kind === 'note' ? noteLayer.notes : [];

  const tokens: Record<string, unknown>[] = [];
  if (o.includeTokens) {
    for (const l of doc.layers) {
      if (l.kind !== 'object') continue;
      for (const obj of l.objects) {
        if (obj.kind !== 'token') continue;
        tokens.push({
          _id: foundryId(),
          name: obj.label || obj.name,
          x: Math.round(obj.x - (doc.grid.size * obj.cells) / 2),
          y: Math.round(obj.y - (doc.grid.size * obj.cells) / 2),
          width: obj.cells,
          height: obj.cells,
          disposition: obj.disposition === 'friendly' ? 1 : obj.disposition === 'hostile' ? -1 : obj.disposition === 'secret' ? -2 : 0,
          texture: { src: 'icons/svg/mystery-man.svg', tint: obj.color },
          hidden: obj.disposition === 'secret',
          flags: {},
        });
      }
    }
  }

  const gridColor = doc.grid.color;
  const scene: Record<string, unknown> = {
    _id: foundryId(),
    name: o.name || doc.meta.title || 'Aetheria Map',
    active: false,
    navigation: o.navigation,
    navOrder: 0,
    navName: '',
    width: doc.width,
    height: doc.height,
    padding: o.padding,
    initial: null,
    backgroundColor: '#1b1712',
    background: {
      src: o.imagePath,
      anchorX: 0, anchorY: 0,
      offsetX: 0, offsetY: 0,
      fit: 'fill',
      scaleX: 1, scaleY: 1,
      rotation: 0, tint: '#ffffff',
      alphaThreshold: 0,
    },
    foreground: null,
    foregroundElevation: 20,
    thumb: null,
    grid: {
      type: gridTypeFor(doc.grid),
      size: Math.round(doc.grid.size),
      style: 'solidLines',
      thickness: Math.max(1, Math.round(doc.grid.lineWidth)),
      color: gridColor,
      alpha: +doc.grid.opacity.toFixed(2),
      distance: doc.grid.unitsPerCell,
      units: doc.grid.unitLabel,
    },
    tokenVision: o.tokenVision,
    fog: {
      exploration: o.fogExploration,
      overlay: null,
      colors: { explored: null, unexplored: null },
    },
    environment: {
      darknessLevel: +doc.lighting.darkness.toFixed(2),
      darknessLock: false,
      globalLight: {
        enabled: doc.lighting.globalLight,
        alpha: 0.5,
        bright: false,
        color: null,
        coloration: 1,
        contrast: 0,
        darkness: { min: 0, max: 0 },
        luminosity: 0,
        saturation: 0,
        shadows: 0,
      },
      cycle: true,
      base: { hue: 0, intensity: 0, luminosity: 0, saturation: 0, shadows: 0 },
      dark: { hue: 0, intensity: 0, luminosity: -0.25, saturation: 0, shadows: 0 },
    },
    // Legacy top-level keys kept so v10/v11 imports also line up.
    globalLight: doc.lighting.globalLight,
    darkness: +doc.lighting.darkness.toFixed(2),
    gridType: gridTypeFor(doc.grid),
    gridDistance: doc.grid.unitsPerCell,
    gridUnits: doc.grid.unitLabel,
    gridColor,
    gridAlpha: +doc.grid.opacity.toFixed(2),
    img: o.imagePath,

    walls: walls.map(wallToFoundry),
    lights: lights.map((l) => lightToFoundry(l, doc.grid)),
    notes: notes.map((n) => noteToFoundry(n, o.version)),
    tokens,
    tiles: [],
    drawings: [],
    sounds: [],
    regions: [],
    templates: [],
    playlist: null,
    playlistSound: null,
    journal: null,
    journalEntryPage: null,
    weather: '',
    folder: null,
    sort: 0,
    ownership: { default: 0 },
    flags: {
      aetheria: {
        generator: 'Aetheria Cartographer',
        version: '0.9.0',
        seed: doc.meta.seed ?? null,
        kind: doc.kind,
      },
    },
    _stats: {
      systemId: null, systemVersion: null,
      coreVersion: o.version === 13 ? '13.0.0' : o.version === 12 ? '12.331' : '11.315',
      createdTime: doc.meta.created,
      modifiedTime: doc.meta.modified,
      lastModifiedBy: null,
    },
  };

  const doorCount = walls.filter((w) => w.kind === 'door' || w.kind === 'secretDoor').length;

  return {
    scene,
    summary: {
      walls: walls.length - doorCount,
      doors: doorCount,
      lights: lights.length,
      notes: notes.length,
      tokens: tokens.length,
    },
  };
}

/** A short README shipped alongside the export so importing is obvious. */
export function foundryReadme(doc: MapDocument, opts: Partial<FoundryExportOptions> = {}): string {
  const o = { ...DEFAULT_FOUNDRY_OPTIONS, ...opts };
  return `# ${doc.meta.title} — Foundry VTT import

This folder contains:
  * \`${slug(doc.meta.title)}.webp\` (or .png) — the map image
  * \`${slug(doc.meta.title)}.scene.json\` — the Foundry Scene document

## Import (30 seconds)

1. Copy the image into your Foundry data folder, e.g.
   \`Data/worlds/<your-world>/scenes/\`.
   The scene expects it at: \`${o.imagePath}\`
   (If you put it elsewhere, open the scene afterwards and repoint the
   Background Image field — everything else still lines up.)

2. In Foundry, open the **Scenes** sidebar → the folder context menu →
   **Import Data** → choose \`${slug(doc.meta.title)}.scene.json\`.

3. Activate the scene. Walls, doors, lights and note pins are already placed.

## What came across

  * Grid: ${doc.grid.type === 'square' ? 'square' : doc.grid.type === 'none' ? 'gridless' : 'hex'} at ${Math.round(doc.grid.size)} px = ${doc.grid.unitsPerCell} ${doc.grid.unitLabel}
  * Scene padding: ${o.padding}
  * Token vision: ${o.tokenVision ? 'on' : 'off'}; global light: ${doc.lighting.globalLight ? 'on' : 'off'}; darkness ${doc.lighting.darkness}
  * Doors export with their state (closed / open / locked). Secret doors use
    Foundry's secret door type, so players never see them.
  * Light radii were converted from pixels to ${doc.grid.unitLabel} using the grid scale,
    so a torch really is 20/40 ${doc.grid.unitLabel}.

## Notes

Note pins carry their text in \`flags.aetheria.body\`; link them to journal
entries in Foundry if you want full pages behind each pin.
`;
}

export function slug(s: string): string {
  return (s || 'map').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'map';
}
