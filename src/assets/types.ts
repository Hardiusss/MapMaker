import type { RNG } from '../core/rng';
import type { MapPalette } from '../core/color';
import type { MapKind } from '../core/types';

export type AssetGroup =
  | 'terrain' | 'vegetation' | 'settlement' | 'structures'
  | 'dungeon' | 'furniture' | 'battle' | 'symbols' | 'markers';

export interface AssetDrawArgs {
  ctx: CanvasRenderingContext2D;
  /** Draw inside the box (0, 0, w, h). */
  w: number;
  h: number;
  rng: RNG;
  palette: MapPalette;
  /** Optional recolour requested by the user. */
  tint?: string | null;
  tintStrength: number;
  /** Variant index for assets that ship several silhouettes. */
  variant: number;
}

export interface AssetDef {
  id: string;
  label: string;
  group: AssetGroup;
  tags: string[];
  /** Natural aspect ratio (w / h). */
  aspect: number;
  /** Default drawn width in map pixels. */
  defaultWidth: number;
  /** How many distinct silhouettes this asset can produce. */
  variants: number;
  /** Map kinds where this asset is offered first. */
  kinds?: MapKind[];
  draw(a: AssetDrawArgs): void;
}
