/**
 * The asset registry.
 *
 * Assets are functions, not files. Each one draws itself into a canvas at
 * whatever size is asked for, seeded per instance so no two copies are
 * identical. Rendered bitmaps are cached because the editor redraws often.
 */
import type { AssetDef, AssetGroup } from './types';
import { TERRAIN_ASSETS } from './procedural/terrain';
import { VEGETATION_ASSETS } from './procedural/vegetation';
import { SETTLEMENT_ASSETS } from './procedural/settlement';
import { DUNGEON_ASSETS } from './procedural/dungeon';
import { BATTLE_ASSETS } from './procedural/battle';
import { SYMBOL_ASSETS } from './procedural/symbols';
import { EXTRA_ASSETS } from './procedural/extras';
import { RNG } from '../core/rng';
import { paletteById, parseColor } from '../core/color';
import { createSurface, ctxOf, type Surface, loadImage } from '../util/canvas';
import type { MapKind } from '../core/types';
import { setAssetLookup } from '../core/factories';

const BUILT_IN: AssetDef[] = [
  ...TERRAIN_ASSETS,
  ...VEGETATION_ASSETS,
  ...SETTLEMENT_ASSETS,
  ...DUNGEON_ASSETS,
  ...BATTLE_ASSETS,
  ...SYMBOL_ASSETS,
  ...EXTRA_ASSETS,
];

const registry = new Map<string, AssetDef>();
for (const d of BUILT_IN) registry.set(d.id, d);

/** User-imported PNG/SVG assets get wrapped in the same interface. */
const userImages = new Map<string, HTMLImageElement>();

export function registerImageAsset(id: string, label: string, img: HTMLImageElement, group: AssetGroup = 'battle'): AssetDef {
  userImages.set(id, img);
  const d: AssetDef = {
    id, label, group, tags: ['imported', 'custom'],
    aspect: (img.naturalWidth || 1) / (img.naturalHeight || 1),
    defaultWidth: Math.min(400, img.naturalWidth || 200),
    variants: 1,
    draw({ ctx, w, h }) { ctx.drawImage(img, 0, 0, w, h); },
  };
  registry.set(id, d);
  return d;
}

export async function registerImageFromDataURL(id: string, label: string, dataUrl: string, group: AssetGroup = 'battle'): Promise<AssetDef> {
  const img = await loadImage(dataUrl);
  return registerImageAsset(id, label, img, group);
}

export function isUserAsset(id: string): boolean { return userImages.has(id); }

setAssetLookup((id) => registry.get(id));

export function allAssets(): AssetDef[] { return Array.from(registry.values()); }
export function assetById(id: string): AssetDef | undefined { return registry.get(id); }

export function assetsByGroup(group: AssetGroup): AssetDef[] {
  return allAssets().filter((a) => a.group === group);
}

export const ASSET_GROUPS: { group: AssetGroup; label: string }[] = [
  { group: 'terrain', label: 'Landforms' },
  { group: 'vegetation', label: 'Vegetation' },
  { group: 'settlement', label: 'Settlements' },
  { group: 'structures', label: 'Structures' },
  { group: 'dungeon', label: 'Dungeon' },
  { group: 'furniture', label: 'Furnishings' },
  { group: 'battle', label: 'Battle Props' },
  { group: 'symbols', label: 'Cartography' },
  { group: 'markers', label: 'Markers' },
];

export function searchAssets(query: string, kind?: MapKind): AssetDef[] {
  const q = query.trim().toLowerCase();
  let list = allAssets();
  if (kind) {
    list = list.slice().sort((a, b) => {
      const ai = a.kinds?.includes(kind) ? 0 : 1;
      const bi = b.kinds?.includes(kind) ? 0 : 1;
      return ai - bi;
    });
  }
  if (!q) return list;
  return list.filter((a) =>
    a.label.toLowerCase().includes(q) ||
    a.id.toLowerCase().includes(q) ||
    a.tags.some((t) => t.includes(q)));
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export interface RenderAssetOptions {
  width: number;
  height?: number;
  seed?: number;
  paletteId?: string;
  tint?: string | null;
  tintStrength?: number;
  variant?: number;
}

const bitmapCache = new Map<string, Surface>();
const MAX_CACHE = 500;

function cacheKey(id: string, o: Required<Omit<RenderAssetOptions, 'height'>> & { height: number }): string {
  return `${id}|${o.width}|${o.height}|${o.seed}|${o.paletteId}|${o.tint ?? '-'}|${o.tintStrength}|${o.variant}`;
}

export function renderAsset(id: string, opts: RenderAssetOptions): Surface {
  const d = assetById(id);
  const width = Math.max(2, Math.round(opts.width));
  const def = d || BUILT_IN[0];
  const height = Math.max(2, Math.round(opts.height ?? width / def.aspect));
  const full = {
    width, height,
    seed: opts.seed ?? 1,
    paletteId: opts.paletteId ?? 'atlas',
    tint: opts.tint ?? null,
    tintStrength: opts.tintStrength ?? 0.6,
    variant: opts.variant ?? 0,
  };
  const key = cacheKey(def.id, full);
  const hit = bitmapCache.get(key);
  if (hit) return hit;

  const surf = createSurface(width, height);
  const ctx = ctxOf(surf);
  const palette = paletteById(full.paletteId);
  ctx.save();
  def.draw({
    ctx, w: width, h: height,
    rng: new RNG(`${def.id}:${full.seed}`),
    palette,
    tint: full.tint,
    tintStrength: full.tintStrength,
    variant: full.variant,
  });
  ctx.restore();
  if (palette.mono) duotone(surf, palette.ink, palette.parchment);

  if (bitmapCache.size > MAX_CACHE) {
    // Cheapest possible eviction: drop the oldest quarter.
    const keys = Array.from(bitmapCache.keys()).slice(0, Math.floor(MAX_CACHE / 4));
    for (const k of keys) bitmapCache.delete(k);
  }
  bitmapCache.set(key, surf);
  return surf;
}

/**
 * Collapse a rendered asset to a two-tone ink drawing: luminance drives a ramp
 * from the palette's ink to its paper colour, and alpha is preserved so the
 * silhouette is untouched.
 */
function duotone(surface: Surface, darkHex: string, lightHex: string): void {
  const ctx = surface.getContext('2d', { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, surface.width, surface.height);
  const d = img.data;
  const dark = parseColor(darkHex);
  const light = parseColor(lightHex);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    // Perceptual luminance, then a slight contrast lift so line work stays crisp.
    let l = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
    l = Math.max(0, Math.min(1, (l - 0.5) * 1.25 + 0.5));
    d[i] = dark.r + (light.r - dark.r) * l;
    d[i + 1] = dark.g + (light.g - dark.g) * l;
    d[i + 2] = dark.b + (light.b - dark.b) * l;
  }
  ctx.putImageData(img, 0, 0);
}

export function clearAssetCache(): void { bitmapCache.clear(); }

const previewCache = new Map<string, string>();

export function assetPreview(id: string, paletteId: string, box = 72): string {
  const key = `${id}|${paletteId}|${box}`;
  const hit = previewCache.get(key);
  if (hit) return hit;
  const d = assetById(id);
  if (!d) return '';
  const w = d.aspect >= 1 ? box : Math.round(box * d.aspect);
  const h = d.aspect >= 1 ? Math.round(box / d.aspect) : box;
  const s = renderAsset(id, { width: w, height: h, paletteId, seed: 7, variant: 0 });
  const out = createSurface(box, box);
  const ctx = ctxOf(out);
  ctx.drawImage(s, (box - w) / 2, (box - h) / 2);
  const url = out.toDataURL('image/png');
  previewCache.set(key, url);
  return url;
}

export function clearPreviewCache(): void { previewCache.clear(); }
