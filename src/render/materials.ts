/**
 * The building-material catalogue.
 *
 * A fortification is not "stone, timber or earth". The difference between a
 * limestone ashlar curtain and a flint-and-mortar one is the difference between
 * two castles, and a GM who picks "stone" from a list of three has been given a
 * choice that is not one. So the materials live here, once, as data: the castle
 * generator picks from this table, the construction tool's dropdown is built
 * from it, and the texture library synthesises one tile per entry from the same
 * numbers. Nothing downstream carries its own colour table.
 *
 * Every entry answers five questions — what colour it is against the current
 * palette, how it is coursed, what the grain inside a unit looks like, how it
 * wears, and what the castle grid should build it as. That last one is why the
 * old three-value union survives underneath: a turf bank and a rammed-earth
 * rampart are different pictures but the same obstacle.
 */
import { mix, type MapPalette } from '../core/color';
import type { TextureGroup } from './textures';

/** How the picker groups them, and roughly what a builder would call them. */
export type MaterialFamily = 'stone' | 'timber' | 'earth' | 'other';

/**
 * What the castle grid builds this as.
 *
 * Three values, because the *plan* only has three answers: a wall you can
 * crenellate, a stockade, or a bank of spoil. Brick and ice are masonry;
 * adobe, turf and rammed earth are earthworks whatever they are made of.
 */
export type BuildClass = 'masonry' | 'timber' | 'earth';

/** The coursing pattern — how units are laid up. */
export type Bond =
  | 'ashlar'       // large squared blocks, fine joints
  | 'coursed'      // squared but irregular in length, visible mortar
  | 'thin-course'  // many shallow courses
  | 'rubble'       // uncut stone, thick mortar
  | 'polygonal'    // fitted irregular faces, hairline joints
  | 'nodular'      // small hard lumps set in a wide matrix
  | 'columnar'     // tall prisms, jointed vertically
  | 'brick'        // small units, running bond
  | 'herringbone'  // small units, diagonal alternating courses
  | 'plank'        // sawn boards
  | 'stave'        // vertical split timbers
  | 'block'        // big units, thin joints, stacked
  | 'monolithic';  // no joints at all

/** What the surface of one unit looks like. */
export type Grain =
  | 'speckled' | 'banded' | 'veined' | 'layered' | 'crystalline'
  | 'fibrous' | 'knotty' | 'smooth' | 'crumbly' | 'matted' | 'porous';

/**
 * How a material ages. All 0..1, all read by the texture generator.
 *
 * These are the difference between a material and a swatch: granite chips at
 * the arris and takes lichen, sandstone streaks black under every drip, timber
 * silvers, and a floor that people walk on comes up polished.
 */
export interface Wear {
  /** Spalled corners and broken arrises. */
  chip: number;
  /** Damp growth, which collects in the joints first. */
  moss: number;
  /** Weathering streaks running down the face. */
  stain: number;
  /** Smoke blackening — hearths, torches, burnt-out halls. */
  soot: number;
  /** Sheen where hands and feet have worn it smooth. */
  polish: number;
}

export interface MaterialDef {
  id: MaterialId;
  /** English name. `material.<id>` in the dictionaries overrides it on screen. */
  label: string;
  family: MaterialFamily;
  build: BuildClass;
  bond: Bond;
  grain: Grain;
  wear: Wear;

  /** Courses across one tile at the reference scale. Sets how big a unit is. */
  courses: number;
  /** Unit width divided by unit height. */
  aspect: number;
  /** Joint width as a fraction of the course height. */
  joint: number;
  /** How far the joint sits below the face, 0..1. Drives the shading, not a line. */
  relief: number;
  /** Spread of the per-unit lightness jitter — a wall is many stones, not one grey. */
  jitter: number;
  /** Hue spread per unit, in degrees. Fieldstone varies; ashlar does not. */
  hueJitter: number;
  /** Iron bands across the face, per tile. Zero for everything that has none. */
  straps?: number;
  /**
   * Multiplier on the grain inside one unit. 1 is the drawn default.
   *
   * Weather does not only take a timber's colour, it takes its surface: the
   * soft spring wood erodes away and the hard latewood is left standing proud,
   * which is why a silvered board is ridged to the touch and why it still
   * reads as a board with the colour gone out of it. Nothing else in the table
   * needs this, so it defaults to off rather than becoming another number
   * every entry has to answer.
   */
  grainDepth?: number;
  /**
   * How far drying has opened the timber, 0..1. Absent for everything else.
   *
   * A board that loses its moisture does two things at once, and they are the
   * two things that say "old fence" rather than "sawn plank": it splits along
   * the grain, because wood shrinks around the ring far more than along it,
   * and it cups across the grain, because the outer face shrinks more than the
   * inner. Same cause, so one number.
   */
  checks?: number;

  /** The face colour, against the current palette. */
  base(p: MapPalette): string;
  /** What sits in the joints. */
  mortar(p: MapPalette): string;
  /** Where the tile lands in the texture picker. */
  group: TextureGroup;
  /** Suggested pattern scale, passed straight to the `TextureDef`. */
  tileScale: number;
}

export type MaterialId =
  // stone
  | 'granite' | 'limestone' | 'sandstone' | 'slate' | 'marble' | 'fieldstone' | 'flint' | 'basalt'
  // timber
  | 'oak' | 'pine' | 'birch' | 'weathered-timber' | 'charred-timber' | 'iron-bound'
  // fired and formed
  | 'brick-red' | 'brick-pale' | 'brick-herringbone' | 'adobe' | 'rammed-earth'
  // other
  | 'turf' | 'packed-clay' | 'ice-block' | 'bone';

const wear = (chip: number, moss: number, stain: number, soot: number, polish: number): Wear =>
  ({ chip, moss, stain, soot, polish });

/**
 * The catalogue.
 *
 * Ordered by family, and within a family from the commonest to the strangest,
 * because that is the order the dropdown shows and the order a builder would
 * reach for them in.
 */
export const MATERIALS: MaterialDef[] = [
  // --- Stone ---------------------------------------------------------------
  {
    id: 'granite', label: 'Granite', family: 'stone', build: 'masonry',
    bond: 'coursed', grain: 'speckled', wear: wear(0.5, 0.3, 0.25, 0.15, 0.1),
    courses: 11, aspect: 1.9, joint: 0.13, relief: 0.55, jitter: 0.13, hueJitter: 7,
    base: (p) => mix(p.rock, '#8d9095', 0.55),
    mortar: (p) => mix(p.rock, '#4a463f', 0.55),
    group: 'rock', tileScale: 1,
  },
  {
    id: 'limestone', label: 'Limestone Ashlar', family: 'stone', build: 'masonry',
    bond: 'ashlar', grain: 'porous', wear: wear(0.22, 0.28, 0.5, 0.12, 0.12),
    courses: 8, aspect: 2.2, joint: 0.055, relief: 0.3, jitter: 0.075, hueJitter: 4,
    base: (p) => mix(p.rock, '#e3dac0', 0.66),
    mortar: (p) => mix(p.rock, '#b9ae93', 0.5),
    group: 'rock', tileScale: 1,
  },
  {
    id: 'sandstone', label: 'Sandstone', family: 'stone', build: 'masonry',
    bond: 'coursed', grain: 'banded', wear: wear(0.4, 0.2, 0.65, 0.18, 0.08),
    courses: 10, aspect: 2.0, joint: 0.1, relief: 0.4, jitter: 0.1, hueJitter: 9,
    base: (p) => mix(p.rock, '#c4915a', 0.6),
    mortar: (p) => mix(p.rock, '#8d6f4c', 0.5),
    group: 'rock', tileScale: 1,
  },
  {
    id: 'slate', label: 'Slate', family: 'stone', build: 'masonry',
    bond: 'thin-course', grain: 'layered', wear: wear(0.35, 0.42, 0.3, 0.2, 0.25),
    courses: 22, aspect: 3.4, joint: 0.16, relief: 0.65, jitter: 0.16, hueJitter: 8,
    base: (p) => mix(p.rock, '#3f4855', 0.72),
    mortar: (p) => mix(p.rock, '#2b2f36', 0.6),
    group: 'rock', tileScale: 1,
  },
  {
    id: 'marble', label: 'Veined Marble', family: 'stone', build: 'masonry',
    bond: 'ashlar', grain: 'veined', wear: wear(0.12, 0.06, 0.14, 0.08, 0.7),
    courses: 7, aspect: 1.6, joint: 0.035, relief: 0.16, jitter: 0.06, hueJitter: 5,
    base: (p) => mix(p.rock, '#efe9de', 0.8),
    mortar: (p) => mix(p.rock, '#c3bcae', 0.6),
    group: 'rock', tileScale: 2,
  },
  {
    id: 'fieldstone', label: 'Fieldstone Rubble', family: 'stone', build: 'masonry',
    bond: 'rubble', grain: 'crumbly', wear: wear(0.6, 0.3, 0.35, 0.12, 0.05),
    courses: 12, aspect: 1.25, joint: 0.34, relief: 0.66, jitter: 0.2, hueJitter: 16,
    base: (p) => mix(p.rock, '#8e8271', 0.4),
    mortar: (p) => mix(p.rock, '#a89c84', 0.55),
    group: 'rock', tileScale: 1,
  },
  {
    id: 'flint', label: 'Flint & Mortar', family: 'stone', build: 'masonry',
    bond: 'nodular', grain: 'crystalline', wear: wear(0.3, 0.34, 0.3, 0.1, 0.3),
    courses: 19, aspect: 1.1, joint: 0.42, relief: 0.52, jitter: 0.18, hueJitter: 10,
    base: (p) => mix(p.rock, '#3b4247', 0.62),
    mortar: (p) => mix(p.parchmentDark, '#e2d9c0', 0.6),
    group: 'rock', tileScale: 1,
  },
  {
    id: 'basalt', label: 'Basalt', family: 'stone', build: 'masonry',
    bond: 'columnar', grain: 'crystalline', wear: wear(0.28, 0.24, 0.18, 0.3, 0.12),
    courses: 8, aspect: 0.42, joint: 0.13, relief: 0.72, jitter: 0.12, hueJitter: 6,
    base: (p) => mix(p.rock, '#232629', 0.8),
    mortar: (p) => mix(p.rock, '#14161a', 0.7),
    group: 'rock', tileScale: 1,
  },

  // --- Timber --------------------------------------------------------------
  {
    id: 'oak', label: 'Oak', family: 'timber', build: 'timber',
    bond: 'plank', grain: 'fibrous', wear: wear(0.3, 0.24, 0.4, 0.25, 0.3),
    courses: 9, aspect: 6, joint: 0.055, relief: 0.42, jitter: 0.13, hueJitter: 8,
    base: (p) => mix(p.highland, '#6d4826', 0.72),
    mortar: (p) => mix('#2a1a0e', p.ink, 0.18),
    group: 'interior', tileScale: 1,
  },
  {
    id: 'pine', label: 'Pine', family: 'timber', build: 'timber',
    bond: 'stave', grain: 'knotty', wear: wear(0.34, 0.3, 0.34, 0.22, 0.18),
    courses: 12, aspect: 0.085, joint: 0.1, relief: 0.5, jitter: 0.14, hueJitter: 9,
    base: (p) => mix(p.highland, '#c19a63', 0.66),
    mortar: (p) => mix('#3d2a16', p.ink, 0.16),
    group: 'interior', tileScale: 1,
  },
  {
    id: 'birch', label: 'Birch', family: 'timber', build: 'timber',
    bond: 'stave', grain: 'fibrous', wear: wear(0.2, 0.2, 0.22, 0.15, 0.2),
    courses: 14, aspect: 0.065, joint: 0.08, relief: 0.4, jitter: 0.09, hueJitter: 5,
    base: (p) => mix(p.parchment, '#ded2b8', 0.55),
    mortar: (p) => mix('#4a3c28', p.ink, 0.16),
    group: 'interior', tileScale: 1,
  },
  /**
   * Silvered oak, not rubble.
   *
   * This came out of the table as grey stone: it took its colour from `rock`,
   * chipped at the arris like masonry, and grew moss in joints wide enough to
   * be mortar. All three are wrong about wood. Weather greys a board and lifts
   * its grain; it does not spall the corners, and a board fence does not have
   * mortar in it. So the colour now comes from oak's own brown drifted toward
   * silver, which keeps it wood under every palette; the joints and relief are
   * oak's; the chipping is nearly gone; and the grain is doubled, because on a
   * weathered board the grain is the loudest thing left.
   *
   * Colour alone did not save it. The rings were being warped as far across
   * the board as along it, and a ring that wanders further than its own
   * spacing is not a ring, it is a blotch — which is the rubble everyone kept
   * seeing. `grainAt` now warps them along the grain only, and `checks` opens
   * the splits and cups the boards that are the rest of what weather does.
   */
  {
    id: 'weathered-timber', label: 'Weathered Timber', family: 'timber', build: 'timber',
    bond: 'plank', grain: 'fibrous', wear: wear(0.14, 0.16, 0.34, 0.18, 0.06),
    courses: 9, aspect: 6, joint: 0.05, relief: 0.4, jitter: 0.16, hueJitter: 9,
    grainDepth: 2.1, checks: 0.55,
    base: (p) => mix(mix(p.highland, '#6d4826', 0.72), '#9d9a94', 0.6),
    mortar: (p) => mix('#3a3229', p.ink, 0.16),
    group: 'interior', tileScale: 1,
  },
  {
    id: 'charred-timber', label: 'Charred Timber', family: 'timber', build: 'timber',
    bond: 'plank', grain: 'fibrous', wear: wear(0.35, 0.1, 0.15, 0.8, 0.35),
    courses: 9, aspect: 6, joint: 0.07, relief: 0.6, jitter: 0.15, hueJitter: 4,
    // Fire drives the water out faster than weather does, and the checking is
    // the first thing anyone notices about a burnt beam.
    grainDepth: 1.4, checks: 0.8,
    base: (p) => mix('#191513', p.ink, 0.16),
    mortar: (p) => mix('#000000', p.ink, 0.1),
    group: 'interior', tileScale: 1,
  },
  {
    id: 'iron-bound', label: 'Iron-Bound Timber', family: 'timber', build: 'timber',
    bond: 'plank', grain: 'fibrous', wear: wear(0.3, 0.2, 0.5, 0.3, 0.25),
    courses: 9, aspect: 6, joint: 0.06, relief: 0.45, jitter: 0.12, hueJitter: 7, straps: 4,
    base: (p) => mix(p.highland, '#5b3d21', 0.75),
    mortar: (p) => mix('#241608', p.ink, 0.16),
    group: 'interior', tileScale: 1,
  },

  // --- Fired and formed ----------------------------------------------------
  {
    id: 'brick-red', label: 'Red Brick', family: 'earth', build: 'masonry',
    bond: 'brick', grain: 'smooth', wear: wear(0.28, 0.3, 0.42, 0.25, 0.15),
    courses: 17, aspect: 2.6, joint: 0.17, relief: 0.45, jitter: 0.13, hueJitter: 11,
    base: (p) => mix('#9b4a33', p.accent, 0.22),
    mortar: (p) => mix(p.parchmentDark, '#b3a894', 0.5),
    group: 'interior', tileScale: 1,
  },
  {
    id: 'brick-pale', label: 'Pale Brick', family: 'earth', build: 'masonry',
    bond: 'brick', grain: 'smooth', wear: wear(0.24, 0.26, 0.48, 0.2, 0.15),
    courses: 17, aspect: 2.6, joint: 0.17, relief: 0.42, jitter: 0.11, hueJitter: 8,
    base: (p) => mix('#cbab7f', p.parchmentDark, 0.3),
    mortar: (p) => mix(p.parchmentDark, '#a9a08b', 0.55),
    group: 'interior', tileScale: 1,
  },
  {
    id: 'brick-herringbone', label: 'Herringbone Brick', family: 'earth', build: 'masonry',
    bond: 'herringbone', grain: 'smooth', wear: wear(0.22, 0.24, 0.35, 0.22, 0.4),
    courses: 16, aspect: 2, joint: 0.14, relief: 0.4, jitter: 0.14, hueJitter: 12,
    base: (p) => mix('#a55a3c', p.accent, 0.22),
    mortar: (p) => mix(p.parchmentDark, '#b0a48d', 0.5),
    group: 'interior', tileScale: 1,
  },
  {
    id: 'adobe', label: 'Adobe', family: 'earth', build: 'earth',
    bond: 'block', grain: 'crumbly', wear: wear(0.5, 0.12, 0.55, 0.2, 0.1),
    courses: 10, aspect: 2.1, joint: 0.15, relief: 0.35, jitter: 0.11, hueJitter: 9,
    base: (p) => mix(p.desert, '#c39c6c', 0.55),
    mortar: (p) => mix(p.desert, '#a3835a', 0.55),
    group: 'interior', tileScale: 1,
  },
  {
    id: 'rammed-earth', label: 'Rammed Earth', family: 'earth', build: 'earth',
    bond: 'thin-course', grain: 'layered', wear: wear(0.45, 0.2, 0.5, 0.15, 0.08),
    courses: 10, aspect: 9, joint: 0.09, relief: 0.22, jitter: 0.09, hueJitter: 7,
    base: (p) => mix(p.lowland, '#a58a5f', 0.55),
    mortar: (p) => mix(p.lowland, '#8a7048', 0.55),
    group: 'ground', tileScale: 1,
  },

  // --- Other ---------------------------------------------------------------
  {
    id: 'turf', label: 'Turf Bank', family: 'other', build: 'earth',
    bond: 'thin-course', grain: 'matted', wear: wear(0.3, 0.85, 0.25, 0.05, 0.05),
    courses: 12, aspect: 5, joint: 0.14, relief: 0.28, jitter: 0.15, hueJitter: 14,
    base: (p) => mix(p.grass, '#5d7a3d', 0.45),
    mortar: (p) => mix(p.lowland, '#5a4a2e', 0.6),
    group: 'ground', tileScale: 1,
  },
  {
    id: 'packed-clay', label: 'Packed Clay', family: 'other', build: 'earth',
    bond: 'monolithic', grain: 'crumbly', wear: wear(0.4, 0.18, 0.4, 0.12, 0.2),
    courses: 6, aspect: 1, joint: 0, relief: 0.3, jitter: 0.17, hueJitter: 12,
    base: (p) => mix(p.lowland, '#8b6a45', 0.6),
    mortar: (p) => mix(p.lowland, '#6d5233', 0.6),
    group: 'ground', tileScale: 1,
  },
  {
    id: 'ice-block', label: 'Ice Block', family: 'other', build: 'masonry',
    bond: 'block', grain: 'crystalline', wear: wear(0.2, 0.04, 0.1, 0.03, 0.6),
    courses: 8, aspect: 1.8, joint: 0.09, relief: 0.3, jitter: 0.1, hueJitter: 10,
    base: (p) => mix('#dceef7', p.shallowWater, 0.32),
    mortar: (p) => mix(p.shallowWater, '#9fc4d6', 0.5),
    group: 'rock', tileScale: 1,
  },
  {
    id: 'bone', label: 'Bone', family: 'other', build: 'masonry',
    bond: 'polygonal', grain: 'porous', wear: wear(0.45, 0.15, 0.45, 0.1, 0.35),
    courses: 11, aspect: 1.35, joint: 0.2, relief: 0.46, jitter: 0.14, hueJitter: 8,
    base: (p) => mix('#e0d6ba', p.parchment, 0.28),
    mortar: (p) => mix('#4a4132', p.ink, 0.18),
    group: 'special', tileScale: 1,
  },
];

export const MATERIAL_IDS: MaterialId[] = MATERIALS.map((m) => m.id);

/** The texture that paints a material. Namespaced so it cannot collide. */
export const materialTextureId = (id: MaterialId): string => `mat/${id}`;

const BY_ID = new Map<string, MaterialDef>(MATERIALS.map((m) => [m.id, m]));

/**
 * The three values the castle tool and generator used before this table
 * existed. Documents and saved tool settings may still carry them, and a
 * dropdown that silently resets to granite because it did not recognise
 * "timber" is worse than no dropdown.
 */
const LEGACY: Record<string, MaterialId> = {
  stone: 'granite',
  timber: 'oak',
  earth: 'turf',
};

export function materialById(id: string): MaterialDef {
  return BY_ID.get(id) || BY_ID.get(LEGACY[id] ?? '') || MATERIALS[0];
}

export const FAMILY_ORDER: MaterialFamily[] = ['stone', 'timber', 'earth', 'other'];

export function materialsByFamily(): Record<MaterialFamily, MaterialDef[]> {
  const out: Record<MaterialFamily, MaterialDef[]> = { stone: [], timber: [], earth: [], other: [] };
  for (const m of MATERIALS) out[m.family].push(m);
  return out;
}
