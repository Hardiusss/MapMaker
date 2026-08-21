/** Biome classification and the texture each biome paints with. */
import type { Fields } from './heightmap';
import { clamp01 } from '../../core/noise';

export type Biome =
  | 'ocean-deep' | 'ocean' | 'shallow' | 'lake' | 'beach'
  | 'desert' | 'savanna' | 'grassland' | 'plains' | 'forest' | 'taiga'
  | 'jungle' | 'swamp' | 'tundra' | 'snow' | 'highland' | 'mountain' | 'peak';

export const BIOME_ORDER: Biome[] = [
  'ocean-deep', 'ocean', 'shallow', 'lake', 'beach', 'desert', 'savanna',
  'plains', 'grassland', 'swamp', 'forest', 'taiga', 'jungle', 'tundra',
  'snow', 'highland', 'mountain', 'peak',
];

export const BIOME_TEXTURE: Record<Biome, string> = {
  'ocean-deep': 'water-deep',
  ocean: 'water',
  shallow: 'water-shallow',
  lake: 'water',
  beach: 'sand',
  desert: 'dunes',
  savanna: 'plains',
  grassland: 'grass',
  plains: 'plains',
  forest: 'forest',
  taiga: 'forest-pine',
  jungle: 'jungle',
  swamp: 'swamp',
  tundra: 'tundra',
  snow: 'snow',
  highland: 'rock',
  mountain: 'mountain-rock',
  peak: 'snow',
};

export const BIOME_LABEL: Record<Biome, string> = {
  'ocean-deep': 'Deep Ocean', ocean: 'Ocean', shallow: 'Shallows', lake: 'Lake',
  beach: 'Coast', desert: 'Desert', savanna: 'Savanna', grassland: 'Grassland',
  plains: 'Plains', forest: 'Forest', taiga: 'Boreal Forest', jungle: 'Jungle',
  swamp: 'Marsh', tundra: 'Tundra', snow: 'Snowfield', highland: 'Highlands',
  mountain: 'Mountains', peak: 'Peaks',
};

export function classify(f: Fields): Uint8Array {
  const out = new Uint8Array(f.w * f.h);
  const span = Math.max(0.05, 1 - f.seaLevel);
  for (let i = 0; i < out.length; i++) {
    out[i] = BIOME_ORDER.indexOf(classifyCell(f, i, span));
  }
  return out;
}

/**
 * Classify from raw field values rather than a grid index.
 *
 * The renderer calls this per screen pixel with bilinearly interpolated
 * values, which is what removes the grid stair-step from coastlines and
 * biome borders without any blurring.
 */
export function classifyValues(
  e: number, m: number, t: number, distToWater: number,
  seaLevel: number, span: number, isWater: boolean,
): Biome {
  if (isWater) {
    const depth = (seaLevel - e) / Math.max(0.05, seaLevel);
    // A narrow shallow band hugging the shore reads better than a wide one;
    // wide pale shelves look like ice floes from a distance.
    if (depth < 0.035) return 'shallow';
    if (depth < 0.3) return 'ocean';
    return 'ocean-deep';
  }

  const alt = clamp01((e - seaLevel) / span);

  // Above the treeline. Permanent snow is genuinely rare on a world map —
  // it belongs on the highest ground in the coldest latitudes, not on every
  // mid-altitude slope that happens to be a little chilly. Setting the bar low
  // here is what produces the white blotches scattered through temperate
  // country that make a generated map look broken.
  if (alt > 0.82) return t < 0.16 ? 'peak' : 'mountain';
  if (alt > 0.62) return 'mountain';
  if (alt > 0.46) return t < 0.10 ? 'snow' : 'highland';

  if (distToWater <= 1.6 && alt < 0.08) return 'beach';
  if (alt < 0.12 && m > 0.68 && t > 0.3) return 'swamp';

  if (t < 0.09) return 'snow';
  if (t < 0.30) return m > 0.5 ? 'taiga' : 'tundra';
  if (t < 0.52) {
    if (m > 0.6) return 'taiga';
    if (m > 0.36) return 'grassland';
    return 'plains';
  }
  if (t < 0.76) {
    if (m > 0.66) return 'forest';
    if (m > 0.42) return 'grassland';
    if (m > 0.24) return 'savanna';
    return 'desert';
  }
  if (m > 0.7) return 'jungle';
  if (m > 0.5) return 'forest';
  if (m > 0.28) return 'savanna';
  return 'desert';
}

export const BIOME_INDEX: Record<Biome, number> = BIOME_ORDER.reduce((acc, b, i) => {
  acc[b] = i;
  return acc;
}, {} as Record<Biome, number>);

/**
 * Grid-cell classification.
 *
 * Delegates to `classifyValues` so there is exactly one copy of the biome
 * thresholds. Keeping two parallel ladders — one for grid cells, one for
 * interpolated pixels — guarantees they drift apart, and the symptom is a map
 * whose painted terrain disagrees with the terrain its own generators think is
 * there: forests stamped onto rendered desert, roads costed against biomes the
 * renderer never drew.
 */
function classifyCell(f: Fields, i: number, span: number): Biome {
  return classifyValues(
    f.elevation[i], f.moisture[i], f.temperature[i], f.distanceToWater[i],
    f.seaLevel, span, !!f.water[i],
  );
}

export function isWaterBiome(b: Biome): boolean {
  return b === 'ocean' || b === 'ocean-deep' || b === 'shallow' || b === 'lake';
}

/** Hillshade from the elevation field, lit from the north-west. */
export function hillshade(f: Fields, strength = 1): Float32Array {
  const { w, h, elevation } = f;
  const out = new Float32Array(w * h);
  const lx = -0.6, ly = -0.6, lz = 0.53;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const xl = elevation[y * w + Math.max(0, x - 1)];
      const xr = elevation[y * w + Math.min(w - 1, x + 1)];
      const yu = elevation[Math.max(0, y - 1) * w + x];
      const yd = elevation[Math.min(h - 1, y + 1) * w + x];
      const dx = (xr - xl) * 60 * strength;
      const dy = (yd - yu) * 60 * strength;
      const len = Math.hypot(dx, dy, 1);
      const nx = -dx / len, ny = -dy / len, nz = 1 / len;
      out[i] = clamp01(nx * lx + ny * ly + nz * lz);
    }
  }
  return out;
}
