/**
 * Terrain classes for the operational scale.
 *
 * A world map classifies ground by climate — what grows there. A battle map
 * classifies it by what a token can stand on. An operational map has to answer
 * a third question, which is the one a commander actually asks: how long does
 * it take to cross, can I see through it, and will it stop a charge?
 *
 * So every class carries movement cost, cover and line-of-sight in the table
 * below, the legend is generated from that same table, and the map cannot drift
 * out of agreement with its own key.
 */
import type { BattleBiome } from '../battle/battleGen';

export type OpTerrain =
  | 'road' | 'open' | 'field' | 'scrub' | 'woods' | 'forest'
  | 'marsh' | 'water' | 'ford' | 'rough' | 'steep' | 'crag'
  | 'built' | 'ruin';

export type Cover = 'none' | 'light' | 'heavy';

export interface TerrainClass {
  id: OpTerrain;
  label: string;
  /** Movement points to enter one cell. `Infinity` is impassable. */
  move: number;
  cover: Cover;
  /** Does a unit in this cell block line of sight through it? */
  blocksSight: boolean;
  /** Base fill. */
  color: string;
  /** Texture used at low opacity over the fill, for tooth. */
  texture: string;
  /** Short note for the legend — why the number is what it is. */
  note: string;
}

/**
 * Costs are in movement points where open ground is 1. They are deliberately
 * coarse: at this scale the question is "one bound or two", not "how many feet".
 */
export const OP_TERRAIN: Record<OpTerrain, TerrainClass> = {
  road:   { id: 'road',   label: 'Road',            move: 0.5,      cover: 'none',  blocksSight: false, color: '#c2ab84', texture: 'dirt',      note: 'Column of march; no cover.' },
  open:   { id: 'open',   label: 'Open ground',     move: 1,        cover: 'none',  blocksSight: false, color: '#a8b276', texture: 'grass',     note: 'Good going, no cover, seen from everywhere.' },
  field:  { id: 'field',  label: 'Cultivated',      move: 1,        cover: 'light', blocksSight: false, color: '#bfb977', texture: 'farmland',  note: 'Walls and hedges give light cover.' },
  scrub:  { id: 'scrub',  label: 'Scrub',           move: 1.5,      cover: 'light', blocksSight: false, color: '#93a267', texture: 'grass-lush',note: 'Slow going; conceals a prone unit.' },
  woods:  { id: 'woods',  label: 'Light woods',     move: 2,        cover: 'heavy', blocksSight: false, color: '#6d8a56', texture: 'forest',    note: 'Heavy cover; sight to one cell only.' },
  forest: { id: 'forest', label: 'Dense forest',    move: 3,        cover: 'heavy', blocksSight: true,  color: '#4c6b41', texture: 'forest-pine', note: 'Blocks sight and formation entirely.' },
  marsh:  { id: 'marsh',  label: 'Marsh',           move: 3,        cover: 'light', blocksSight: false, color: '#6f7c58', texture: 'swamp',     note: 'Exhausting; no charge, no cavalry.' },
  water:  { id: 'water',  label: 'Deep water',      move: Infinity, cover: 'none',  blocksSight: false, color: '#4a7183', texture: 'water',     note: 'Impassable except by boat.' },
  ford:   { id: 'ford',   label: 'Ford',            move: 2,        cover: 'none',  blocksSight: false, color: '#7fa2ad', texture: 'water-shallow', note: 'The only place a body of troops crosses.' },
  rough:  { id: 'rough',  label: 'Broken ground',   move: 2,        cover: 'light', blocksSight: false, color: '#b0a07c', texture: 'scree',     note: 'Breaks up a line; light cover.' },
  steep:  { id: 'steep',  label: 'Steep slope',     move: 3,        cover: 'none',  blocksSight: false, color: '#8d7a5e', texture: 'rock',      note: 'Uphill fight; costly to assault.' },
  crag:   { id: 'crag',   label: 'Crag',            move: Infinity, cover: 'none',  blocksSight: true,  color: '#5d554a', texture: 'mountain-rock', note: 'Impassable; anchors a flank.' },
  built:  { id: 'built',  label: 'Built-up',        move: 1.5,      cover: 'heavy', blocksSight: true,  color: '#b09a80', texture: 'cobble',    note: 'Strongpoint. Must be cleared house by house.' },
  ruin:   { id: 'ruin',   label: 'Ruins',           move: 2,        cover: 'heavy', blocksSight: false, color: '#9a9184', texture: 'stone-floor', note: 'Heavy cover, bad going, worth holding.' },
};

export const OP_TERRAIN_ORDER: OpTerrain[] = [
  'road', 'open', 'field', 'scrub', 'woods', 'forest',
  'marsh', 'water', 'ford', 'rough', 'steep', 'crag', 'built', 'ruin',
];

export const OP_INDEX: Record<OpTerrain, number> = OP_TERRAIN_ORDER.reduce((acc, t, i) => {
  acc[t] = i;
  return acc;
}, {} as Record<OpTerrain, number>);

/** Movement cost of a cell index, for the pathing and chokepoint passes. */
export function moveCost(i: number): number {
  return OP_TERRAIN[OP_TERRAIN_ORDER[i]].move;
}

export function passable(i: number): boolean {
  return Number.isFinite(moveCost(i));
}

/**
 * The battle-map biome that best represents a stretch of this terrain, used
 * when a sector is handed to the tactical generator.
 */
export const OP_TO_BATTLE_BIOME: Record<OpTerrain, BattleBiome> = {
  road: 'crossroads', open: 'clearing', field: 'clearing', scrub: 'clearing',
  woods: 'forest', forest: 'forest', marsh: 'swamp', water: 'coast',
  ford: 'riverbank', rough: 'cavern', steep: 'cavern', crag: 'cavern',
  built: 'ruins', ruin: 'ruins',
};
