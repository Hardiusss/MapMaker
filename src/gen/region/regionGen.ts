/**
 * The region / world generator.
 *
 * Runs the field pass, paints biome textures through soft masks, carves rivers,
 * scatters relief stamps, seeds settlements and writes labels — producing a
 * finished, fully editable document rather than a flat image.
 */
import type { MapDocument, PathObject, StampObject, Vec2 } from '../../core/types';
import { createDocument, rasterByRole, objectLayerByRole, makeRasterLayer } from '../../core/doc';
import { growRealms, pickRealmSeeds } from './realms';
import { buildRoadNetwork } from './roads';
import { layoutLabels } from '../labelLayout';
import { generateFields, extractRivers, type FieldOptions, type LandShape, type Fields } from './heightmap';
import { classify, classifyValues, BIOME_ORDER, BIOME_INDEX, BIOME_TEXTURE, hillshade, isWaterBiome, type Biome } from './biomes';
import { getTexture } from '../../render/textures';
import { createSurface, ctxOf, type Surface } from '../../util/canvas';
import { acquireScratch, releaseScratch, releaseAllScratch } from '../../util/scratch';
import { RNG } from '../../core/rng';
import { createNamer, type Culture } from '../names';
import { makeStamp, makeText, makePath } from '../../core/factories';
import { paletteById, rgba, mix, parseColor } from '../../core/color';
import { chaikin, simplify, resample, dist } from '../../core/geometry';
import { SimplexNoise, clamp01, smoothstep } from '../../core/noise';

export interface RegionGenOptions {
  width: number;
  height: number;
  seed: number;
  shape: LandShape;
  landRatio: number;
  roughness: number;
  relief: number;
  moisture: number;
  temperature: number;
  paletteId: string;
  culture: Culture;
  /** Relief drawn as stamps on top of the biome textures. */
  mountainStamps: boolean;
  forestStamps: boolean;
  hillStamps: boolean;
  rivers: boolean;
  riverCount: number;
  settlements: number;
  labels: boolean;
  compass: boolean;
  scaleBar: boolean;
  border: boolean;
  /** Adds a parchment vignette and edge staining. */
  aged: boolean;
  gridType: 'none' | 'square' | 'hexPointy';
  /** Trade roads routed between settlements over the terrain. */
  roads: boolean;
  /** Extra links beyond the spanning tree, as a fraction of settlement count. */
  roadRedundancy: number;
  /** Place a bridge stamp where a road fords a river. */
  bridges: boolean;
  /** Number of political realms to grow from the largest settlements. 0 = none. */
  realms: number;
  /** Draw the dashed borders between realms. */
  realmBorders: boolean;
  /** Wash each realm's territory in its colour, 0–1. */
  realmTint: number;
  title?: string;
}

export const DEFAULT_REGION_OPTIONS: RegionGenOptions = {
  width: 2400, height: 1600, seed: 12345, shape: 'continent',
  landRatio: 0.46, roughness: 0.5, relief: 0.6, moisture: 0, temperature: 0,
  paletteId: 'atlas', culture: 'common',
  mountainStamps: true, forestStamps: true, hillStamps: true,
  rivers: true, riverCount: 14, settlements: 12,
  labels: true, compass: true, scaleBar: true, border: false, aged: true,
  gridType: 'none',
  roads: true, roadRedundancy: 0.35, bridges: true,
  realms: 5, realmBorders: true, realmTint: 0.3,
};

/** Set `window.__aetheriaBench = true` to log generator phase timings. */
const BENCH = typeof window !== 'undefined' && (window as unknown as { __aetheriaBench?: boolean }).__aetheriaBench !== false;

export interface RegionGenResult {
  doc: MapDocument;
  fields: Fields;
  biomes: Uint8Array;
}

export function generateRegion(opts: Partial<RegionGenOptions> = {}): RegionGenResult {
  const o: RegionGenOptions = { ...DEFAULT_REGION_OPTIONS, ...opts };
  const rng = new RNG(o.seed);
  const namer = createNamer(o.seed, o.culture);
  const palette = paletteById(o.paletteId);

  // Grid resolution: fine enough for detail, coarse enough to stay instant.
  const gw = Math.min(420, Math.max(140, Math.round(o.width / 7)));
  const gh = Math.round((gw * o.height) / o.width);

  const fieldOpts: Partial<FieldOptions> = {
    width: gw, height: gh, seed: o.seed, shape: o.shape,
    landRatio: o.landRatio, roughness: o.roughness, relief: o.relief,
    moistureBias: o.moisture, temperatureBias: o.temperature, erosion: 3,
  };
  const tFields = performance.now();
  const fields = generateFields(fieldOpts);
  const biomes = classify(fields);
  if (BENCH) console.log(`[bench] region fields: ${Math.round(performance.now() - tFields)}ms`);

  const doc = createDocument({
    kind: o.gridType === 'hexPointy' ? 'hex' : 'region',
    width: o.width,
    height: o.height,
    title: o.title || namer.region(),
    paletteId: o.paletteId,
    gridOverride: { type: o.gridType, visible: o.gridType !== 'none', snap: o.gridType !== 'none' },
  });
  doc.meta.seed = o.seed;
  doc.meta.description = `Procedurally generated ${o.shape} region. Seed ${o.seed}.`;

  const sx = o.width / gw;
  const sy = o.height / gh;

  const mark = (name: string, t0: number) => {
    if (BENCH) console.log(`[bench] region ${name}: ${Math.round(performance.now() - t0)}ms`);
    return performance.now();
  };
  let t = performance.now();
  paintBiomes(doc, fields, biomes, o); t = mark('paintBiomes', t);
  if (o.rivers) addRivers(doc, fields, o, namer, rng, sx, sy); t = mark('rivers', t);
  paintRelief(doc, fields, o); t = mark('relief', t);
  if (o.aged) paintAging(doc, o); t = mark('aging', t);
  addStamps(doc, fields, biomes, o, rng, sx, sy); t = mark('stamps', t);
  const towns = o.settlements > 0 ? addSettlements(doc, fields, biomes, o, rng, namer, sx, sy) : []; t = mark('settlements', t);
  if (o.roads && towns.length > 1) addRoads(doc, fields, biomes, o, rng, sx, sy, towns); t = mark('roads', t);
  if (o.realms > 0 && towns.length > 1) addRealms(doc, fields, biomes, o, rng, namer, sx, sy, towns); t = mark('realms', t);
  if (o.labels) addLabels(doc, fields, biomes, o, rng, namer, sx, sy, towns); t = mark('labels', t);
  addCartography(doc, o, namer); t = mark('cartography', t);
  if (o.labels) {
    const layout = layoutLabels(doc, { padding: Math.max(4, o.width / 340) });
    if (BENCH) console.log(`[bench]   labels nudged ${layout.moved}, hidden ${layout.hidden}`);
    t = mark('label layout', t);
  }

  releaseAllScratch();
  return { doc, fields, biomes };
}

// ---------------------------------------------------------------------------
// Painting
// ---------------------------------------------------------------------------

/**
 * Terrain compositing.
 *
 * Rather than painting each biome through its own full-canvas mask (sixteen
 * pattern fills and blurs — the slowest part of the generator by a wide
 * margin), the whole terrain is resolved in a single per-pixel pass:
 *
 *   • the biome grid is sampled with a noise-warped lookup, which gives
 *     interlocking organic borders instead of either hard stair-steps or a
 *     muddy cross-fade;
 *   • each pixel takes its colour straight from that biome's pre-generated
 *     256×256 tile;
 *   • the shoreline ink and the offshore shelf fall out of the same lookup by
 *     probing the land flag a few pixels away, so there is no blur, no
 *     threshold pass and no erosion pass at all.
 *
 * The result is roughly ten times faster and looks better.
 */
function paintBiomes(doc: MapDocument, f: Fields, biomes: Uint8Array, o: RegionGenOptions): void {
  const bg = rasterByRole(doc, 'background');
  const terrain = rasterByRole(doc, 'terrain');
  if (!bg || !terrain) return;

  const palette = paletteById(o.paletteId);
  const W = doc.width, H = doc.height;
  const gw = f.w, gh = f.h;
  const scaleX = W / gw, scaleY = H / gh;

  // --- Texture tiles as raw pixel data ------------------------------------
  const TILE = 256;
  const tiles: (Uint8ClampedArray | null)[] = BIOME_ORDER.map(() => null);
  const tileFor = (b: number): Uint8ClampedArray => {
    let t = tiles[b];
    if (!t) {
      const surf = getTexture(BIOME_TEXTURE[BIOME_ORDER[b]], { paletteId: o.paletteId, size: TILE });
      t = surf.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, TILE, TILE).data;
      tiles[b] = t;
    }
    return t;
  };
  for (let i = 0; i < BIOME_ORDER.length; i++) tileFor(i);

  // --- Warp fields, computed coarse and sampled with nearest neighbour ----
  const warp = new SimplexNoise(o.seed + 613);
  const ww = Math.max(16, Math.round(W / 6));
  const wh = Math.max(16, Math.round(H / 6));
  const warpX = new Float32Array(ww * wh);
  const warpY = new Float32Array(ww * wh);
  // Warp strength in grid cells: about one cell of wander plus fine detail.
  const coarse = 5.5, fine = 17;
  for (let y = 0; y < wh; y++) {
    for (let x = 0; x < ww; x++) {
      const u = x / ww, v = y / wh;
      const i = y * ww + x;
      warpX[i] = warp.fbm(u * coarse, v * coarse, 3) * 1.15 + warp.fbm(u * fine + 4.1, v * fine, 2) * 0.45;
      warpY[i] = warp.fbm(u * coarse + 9.7, v * coarse + 3.3, 3) * 1.15 + warp.fbm(u * fine, v * fine + 8.6, 2) * 0.45;
    }
  }

  const bgCtx = ctxOf(bg.surface);
  const tCtx = ctxOf(terrain.surface);
  const bgImg = bgCtx.createImageData(W, H);
  const tImg = tCtx.createImageData(W, H);
  const bd = bgImg.data;
  const td = tImg.data;

  const ink = parseColor(palette.ink);
  const shelf = parseColor(mix(palette.shallowWater, palette.water, 0.4));

  const shoreInkPx = Math.max(1.2, W / 900);
  const shelfPx = Math.max(6, W / 80);
  const shoreInkG = shoreInkPx / scaleX;
  const shelfG = shelfPx / scaleX;

  const { elevation, moisture, temperature, distanceToWater, distanceToLand, seaLevel } = f;
  const span = Math.max(0.05, 1 - seaLevel);

  /** Bilinear sample of a grid field at fractional grid coordinates. */
  const sample = (arr: Float32Array, gx: number, gy: number): number => {
    const x0 = gx < 0 ? 0 : gx > gw - 1 ? gw - 1 : gx;
    const y0 = gy < 0 ? 0 : gy > gh - 1 ? gh - 1 : gy;
    const ix = x0 | 0, iy = y0 | 0;
    const fx = x0 - ix, fy = y0 - iy;
    const ix1 = ix + 1 < gw ? ix + 1 : ix;
    const iy1 = iy + 1 < gh ? iy + 1 : iy;
    const a = arr[iy * gw + ix], b = arr[iy * gw + ix1];
    const c = arr[iy1 * gw + ix], d = arr[iy1 * gw + ix1];
    return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
  };


  for (let y = 0; y < H; y++) {
    const wy = ((y * wh / H) | 0) * ww;
    const rowT = (y & (TILE - 1)) * TILE;
    for (let x = 0; x < W; x++) {
      const wi = wy + ((x * ww / W) | 0);
      // Warped sampling coordinates, in fractional grid space.
      const gx = x / scaleX + warpX[wi];
      const gy = y / scaleY + warpY[wi];

      const e = sample(elevation, gx, gy);
      const isWater = e < seaLevel;
      const m = sample(moisture, gx, gy);
      const t = sample(temperature, gx, gy);
      const dw = sample(distanceToWater, gx, gy);

      const biome = classifyValues(e, m, t, dw, seaLevel, span, isWater);
      const b = BIOME_INDEX[biome];

      const tex = tileFor(b);
      const ti = (rowT + (x & (TILE - 1))) * 4;
      let r = tex[ti], g = tex[ti + 1], bl = tex[ti + 2];

      const di = (y * W + x) * 4;

      if (isWater) {
        // Continental shelf: a graded band whose width is measured from the
        // shore, so it follows every inlet instead of stepping around it.
        const dl = sample(distanceToLand, gx, gy);
        const shelfAmt = (1 - smoothstep(0, shelfG, dl)) * 0.46;
        if (shelfAmt > 0.002) {
          r += (shelf.r - r) * shelfAmt;
          g += (shelf.g - g) * shelfAmt;
          bl += (shelf.b - bl) * shelfAmt;
        }
        bd[di] = r; bd[di + 1] = g; bd[di + 2] = bl; bd[di + 3] = 255;
        td[di + 3] = 0;
      } else {
        // Shore ink: the pen line a cartographer draws along the coast. Fading
        // it over the last fraction of a cell antialiases the line for free.
        const dwShore = sample(distanceToWater, gx, gy);
        const inkAmt = (1 - smoothstep(shoreInkG * 0.35, shoreInkG * 1.35, dwShore)) * 0.78;
        if (inkAmt > 0.002) {
          r += (ink.r - r) * inkAmt;
          g += (ink.g - g) * inkAmt;
          bl += (ink.b - bl) * inkAmt;
        }
        td[di] = r; td[di + 1] = g; td[di + 2] = bl; td[di + 3] = 255;
        bd[di + 3] = 0;
      }
    }
  }

  // Fill the sea behind everything, then lay the sampled water on top.
  bgCtx.fillStyle = bgCtx.createPattern(getTexture('water-deep', { paletteId: o.paletteId }), 'repeat')!;
  bgCtx.fillRect(0, 0, W, H);
  const seaScratch = acquireScratch(W, H);
  ctxOf(seaScratch).putImageData(bgImg, 0, 0);
  bgCtx.drawImage(seaScratch, 0, 0);
  releaseScratch(seaScratch);

  tCtx.putImageData(tImg, 0, 0);
}


function paintRelief(doc: MapDocument, f: Fields, o: RegionGenOptions): void {
  const relief = rasterByRole(doc, 'relief');
  if (!relief) return;
  const shade = hillshade(f, 1 + o.relief);
  const small = createSurface(f.w, f.h);
  const sctx = ctxOf(small);
  const img = sctx.createImageData(f.w, f.h);
  for (let i = 0; i < shade.length; i++) {
    const land = f.water[i] ? 0 : 1;
    const s = shade[i];
    // Dark where the slope faces away from the light, transparent elsewhere.
    const dark = clamp01((0.55 - s) * 1.9) * land;
    const light = clamp01((s - 0.72) * 2.2) * land;
    if (dark > light) {
      img.data[i * 4] = 30; img.data[i * 4 + 1] = 24; img.data[i * 4 + 2] = 18;
      img.data[i * 4 + 3] = dark * 150;
    } else {
      img.data[i * 4] = 255; img.data[i * 4 + 1] = 250; img.data[i * 4 + 2] = 235;
      img.data[i * 4 + 3] = light * 110;
    }
  }
  sctx.putImageData(img, 0, 0);

  // Blur at grid resolution, not after upscaling. Chromium implements the
  // canvas blur filter in tiles, and blurring a heavily-upscaled image leaves
  // faint full-width seams at the tile boundaries — which on a map reads as
  // mysterious horizontal bands across the terrain.
  const softened = acquireScratch(f.w, f.h);
  const soft = ctxOf(softened);
  soft.filter = 'blur(0.6px)';
  soft.drawImage(small, 0, 0);
  soft.filter = 'none';

  const ctx = ctxOf(relief.surface);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(softened, 0, 0, doc.width, doc.height);
  releaseScratch(softened);
  relief.blend = 'overlay';
  relief.opacity = 0.75;
}

function paintAging(doc: MapDocument, o: RegionGenOptions): void {
  const relief = rasterByRole(doc, 'relief');
  if (!relief) return;
  const ctx = ctxOf(relief.surface);
  const palette = paletteById(o.paletteId);
  // Vignette: darker towards the edges, like a map that has been handled.
  const g = ctx.createRadialGradient(
    doc.width / 2, doc.height / 2, Math.min(doc.width, doc.height) * 0.25,
    doc.width / 2, doc.height / 2, Math.max(doc.width, doc.height) * 0.72,
  );
  g.addColorStop(0, rgba('#000000', 0));
  g.addColorStop(1, rgba(mix(palette.ink, '#3a2a18', 0.5), 0.28));
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, doc.width, doc.height);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------

function addRivers(
  doc: MapDocument, f: Fields, o: RegionGenOptions,
  namer: ReturnType<typeof createNamer>, rng: RNG, sx: number, sy: number,
): void {
  const layer = doc.layers.find((l) => l.kind === 'object' && l.name === 'Rivers & Lakes')
    || doc.layers.find((l) => l.kind === 'object' && l.role === 'features');
  if (!layer || layer.kind !== 'object') return;
  const palette = paletteById(o.paletteId);
  const rivers = extractRivers(f, 120, o.riverCount);
  if (BENCH) console.log(`[bench]   rivers found: ${rivers.length}`);

  for (const r of rivers) {
    if (r.length < 10) continue;
    let pts: Vec2[] = r.map((p) => ({ x: (p.x + 0.5) * sx, y: (p.y + 0.5) * sy }));
    pts = chaikin(simplify(pts, Math.max(1.2, sx * 0.35)), 2);
    if (pts.length < 3) continue;
    const maxFlow = Math.max(...r.map((p) => p.flow));
    const width = Math.max(5, Math.min(34, Math.sqrt(maxFlow) * 0.8 * (doc.width / 2400)));
    const river = makePath('river', pts, o.paletteId, {
      name: namer.river(),
      width,
      taper: 0.8,
      jitter: Math.max(0.5, sx * 0.12),
      smoothing: 1,
      outlineWidth: Math.max(1.5, width * 0.22),
      color: palette.water,
      color2: palette.deepWater,
      outlineColor: mix(palette.deepWater, palette.ink, 0.35),
    });
    layer.objects.push(river);
  }
}

/**
 * Summed-area table over a boolean mask, so "how much of this window is
 * mountain?" is three additions instead of a loop.
 */
function integral(mask: Uint8Array, w: number, h: number): Int32Array {
  const W = w + 1;
  const s = new Int32Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let run = 0;
    for (let x = 0; x < w; x++) {
      run += mask[y * w + x];
      s[(y + 1) * W + (x + 1)] = s[y * W + (x + 1)] + run;
    }
  }
  return s;
}

/** Fraction of the (2r+1)² window around (cx, cy) that is set in the mask. */
function coverage(s: Int32Array, w: number, h: number, cx: number, cy: number, r: number): number {
  const x0 = Math.max(0, cx - r), y0 = Math.max(0, cy - r);
  const x1 = Math.min(w, cx + r + 1), y1 = Math.min(h, cy + r + 1);
  const area = (x1 - x0) * (y1 - y0);
  if (area <= 0) return 0;
  const W = w + 1;
  return (s[y1 * W + x1] - s[y0 * W + x1] - s[y1 * W + x0] + s[y0 * W + x0]) / area;
}

/**
 * Orientation of the local massif, as an angle in degrees.
 *
 * A mountain range drawn as a horizontal row of peaks across a ridge that runs
 * north-east is the single most obvious tell that a map was assembled by a
 * program. Taking the principal axis of the mountain cells in the window and
 * rotating the stamp to match costs one covariance and fixes it.
 */
function massifAngle(mask: Uint8Array, w: number, h: number, cx: number, cy: number, r: number): number {
  let n = 0, mx = 0, my = 0;
  const x0 = Math.max(0, cx - r), y0 = Math.max(0, cy - r);
  const x1 = Math.min(w - 1, cx + r), y1 = Math.min(h - 1, cy + r);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!mask[y * w + x]) continue;
      mx += x; my += y; n++;
    }
  }
  if (n < 6) return 0;
  mx /= n; my /= n;
  let sxx = 0, syy = 0, sxy = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!mask[y * w + x]) continue;
      const dx = x - mx, dy = y - my;
      sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
    }
  }
  sxx /= n; syy /= n; sxy /= n;
  // Principal axis of a 2×2 covariance matrix.
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy) * 180 / Math.PI;
  // Only commit to an orientation when the massif is actually elongated;
  // a round blob has no meaningful direction and would pick one at random.
  const tr = sxx + syy, det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
  const major = tr / 2 + disc, minor = tr / 2 - disc;
  if (minor <= 0 || major / minor < 1.35) return 0;
  return angle;
}

function addStamps(
  doc: MapDocument, f: Fields, biomes: Uint8Array, o: RegionGenOptions,
  rng: RNG, sx: number, sy: number,
): void {
  const layer = doc.layers.find((l) => l.kind === 'object' && l.role === 'features');
  if (!layer || layer.kind !== 'object') return;

  const bMountain = BIOME_ORDER.indexOf('mountain');
  const bPeak = BIOME_ORDER.indexOf('peak');
  const bHighland = BIOME_ORDER.indexOf('highland');
  const bForest = BIOME_ORDER.indexOf('forest');
  const bTaiga = BIOME_ORDER.indexOf('taiga');
  const bJungle = BIOME_ORDER.indexOf('jungle');

  const scale = doc.width / 2400;
  const placed: { x: number; y: number; r: number }[] = [];
  const fits = (x: number, y: number, r: number) => {
    for (const p of placed) if (dist({ x, y }, p) < (p.r + r) * 0.58) return false;
    placed.push({ x, y, r });
    return true;
  };

  // Masks and their summed-area tables. A stamp is anchored on one grid cell
  // but covers dozens of them, so placing on the anchor's biome alone drops
  // 400-pixel mountains onto grassland whenever a single peak pokes out of the
  // plains. Every stamp below is instead sized to the region it is describing.
  const n = biomes.length;
  const mtnMask = new Uint8Array(n);
  const highMask = new Uint8Array(n);
  const woodMask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const b = biomes[i];
    if (b === bMountain || b === bPeak) { mtnMask[i] = 1; highMask[i] = 1; }
    else if (b === bHighland) highMask[i] = 1;
    else if (b === bForest || b === bTaiga || b === bJungle) woodMask[i] = 1;
  }
  const mtnS = integral(mtnMask, f.w, f.h);
  const highS = integral(highMask, f.w, f.h);
  const woodS = integral(woodMask, f.w, f.h);

  /**
   * Largest window around this cell that is still mostly the right terrain,
   * expressed as a stamp width in pixels. Returns 0 when even the smallest
   * stamp would sit mostly on something else.
   */
  const fitWidth = (
    table: Int32Array, gx: number, gy: number,
    minPx: number, maxPx: number, want: number,
  ): number => {
    const cell = Math.min(sx, sy);
    let best = 0;
    for (let px = maxPx; px >= minPx; px -= (maxPx - minPx) / 5) {
      const r = Math.max(1, Math.round((px * 0.5) / cell));
      if (coverage(table, f.w, f.h, gx, gy, r) >= want) { best = px; break; }
    }
    return best;
  };

  const cells: number[] = [];
  for (let i = 0; i < n; i++) cells.push(i);
  rng.shuffle(cells);

  let mountains = 0, forests = 0, hills = 0;
  const maxMountains = o.mountainStamps ? Math.round(58 * scale) : 0;
  const maxForests = o.forestStamps ? Math.round(52 * scale) : 0;
  const maxHills = o.hillStamps ? Math.round(26 * scale) : 0;

  for (const i of cells) {
    const b = biomes[i];
    const gx = i % f.w, gy = Math.floor(i / f.w);
    const x = (gx + rng.float(0.1, 0.9)) * sx;
    const y = (gy + rng.float(0.1, 0.9)) * sy;

    if ((b === bMountain || b === bPeak) && mountains < maxMountains) {
      // Ranges need a broad massif behind them; a single peak gets a single
      // peak. `want` is deliberately lower for ranges because a ridge is
      // long and thin, so its bounding window always contains some valley.
      const wide = fitWidth(highS, gx, gy, 220 * scale, 420 * scale, 0.62);
      const range = wide > 0 && rng.bool(0.55);
      const w = range ? wide : fitWidth(highS, gx, gy, 100 * scale, 230 * scale, 0.55);
      if (!w) continue;
      if (!fits(x, y, w * (range ? 0.28 : 0.46))) continue;
      const r = Math.max(2, Math.round((w * 0.5) / Math.min(sx, sy)));
      layer.objects.push(makeStamp(range ? 'terrain/mountain-range' : 'terrain/mountain', x, y, w, w / (range ? 3.2 : 1.5), {
        seed: rng.int(1, 1e6),
        rotation: range ? clampAngle(massifAngle(mtnMask, f.w, f.h, gx, gy, r)) : 0,
      }));
      mountains++;
    } else if (b === bHighland && hills < maxHills) {
      const w = fitWidth(highS, gx, gy, 80 * scale, 160 * scale, 0.5);
      if (!w) continue;
      if (!fits(x, y, w * 0.62)) continue;
      layer.objects.push(makeStamp(rng.bool(0.4) ? 'terrain/hills-cluster' : 'terrain/hill', x, y, w, w / 2.2, {
        seed: rng.int(1, 1e6),
      }));
      hills++;
    } else if ((b === bForest || b === bTaiga || b === bJungle) && forests < maxForests) {
      const w = fitWidth(woodS, gx, gy, 120 * scale, 260 * scale, 0.5);
      if (!w) continue;
      if (!fits(x, y, w * 0.34)) continue;
      const asset = b === bTaiga ? 'veg/forest-pine' : b === bJungle ? 'veg/forest-broadleaf' : 'veg/forest-mixed';
      layer.objects.push(makeStamp(asset, x, y, w, w / 1.6, { seed: rng.int(1, 1e6), opacity: 0.92 }));
      forests++;
    }
    if (mountains >= maxMountains && forests >= maxForests && hills >= maxHills) break;
  }

  // Sort by y so nearer stamps overlap farther ones.
  layer.objects.sort((a, b2) => {
    if (a.kind === 'path' && b2.kind !== 'path') return -1;
    if (b2.kind === 'path' && a.kind !== 'path') return 1;
    return a.y - b2.y;
  });
}

/** Keep range stamps roughly level — a peak drawn on its side reads as a bug. */
function clampAngle(deg: number): number {
  let a = deg;
  while (a > 90) a -= 180;
  while (a < -90) a += 180;
  return Math.max(-32, Math.min(32, a));
}

/**
 * Trade roads. Routed over the terrain rather than drawn straight, so they
 * bend around mountains, follow valleys and merge into one another.
 */
function addRoads(
  doc: MapDocument, f: Fields, biomes: Uint8Array, o: RegionGenOptions,
  rng: RNG, sx: number, sy: number, towns: Town[],
): void {
  const layer = doc.layers.find((l) => l.kind === 'object' && l.name === 'Routes & Borders');
  if (!layer || layer.kind !== 'object') return;

  const weightFor = (size: Town['size']) =>
    size === 'city' ? 1 : size === 'town' ? 0.7 : size === 'village' ? 0.4 : 0.2;

  const roads = buildRoadNetwork(
    f, biomes,
    towns.map((t) => ({ gx: t.gx, gy: t.gy, weight: weightFor(t.size) })),
    { redundancy: o.roadRedundancy },
  );
  if (BENCH) console.log(`[bench]   roads: ${roads.length}`);

  const palette = paletteById(o.paletteId);
  const scale = doc.width / 2400;

  for (const road of roads) {
    const pts = chaikin(simplify(road.path.map((p) => ({ x: (p.x + 0.5) * sx, y: (p.y + 0.5) * sy })), Math.max(1.5, sx * 0.4)), 2);
    if (pts.length < 3) continue;
    const major = road.importance > 0.55;
    layer.objects.push(makePath(major ? 'road' : 'trail', pts, o.paletteId, {
      name: major ? 'Trade road' : 'Track',
      // A pale core inside a dark outline is what keeps a road legible over
      // forest, sand and rock alike.
      width: (major ? 6.5 : 4) * scale,
      outlineWidth: (major ? 3 : 2) * scale,
      color: major ? mix(palette.routes, '#f0e2c0', 0.45) : mix(palette.routes, '#e8d9b5', 0.25),
      outlineColor: rgba(palette.ink, 0.7),
      dash: major ? [] : [9 * scale, 7 * scale],
      jitter: 0.7,
      smoothing: 1,
      opacity: 0.9,
    }));
  }

  // Bridges where a road fords a river read as a landmark, and tell the GM
  // where an ambush or a toll gate belongs.
  if (o.bridges) {
    const features = doc.layers.find((l) => l.kind === 'object' && l.role === 'features');
    if (features && features.kind === 'object') {
      const placed: Vec2[] = [];
      for (const road of roads) {
        for (const c of road.crossings) {
          const p = { x: (c.x + 0.5) * sx, y: (c.y + 0.5) * sy };
          if (placed.some((q) => dist(p, q) < 90 * scale)) continue;
          placed.push(p);
          features.objects.push(makeStamp('town/bridge', p.x, p.y, 90 * scale, 41 * scale, {
            seed: rng.int(1, 1e6),
            name: 'Bridge',
            rotation: rng.float(-12, 12),
          }));
        }
      }
    }
  }
}

/**
 * Political layer: grow realms from the largest settlements, wash their
 * territory in a heraldic colour and draw the borders between them.
 */
function addRealms(
  doc: MapDocument, f: Fields, biomes: Uint8Array, o: RegionGenOptions,
  rng: RNG, namer: ReturnType<typeof createNamer>, sx: number, sy: number, towns: Town[],
): void {
  const capitals = towns
    .filter((t) => t.size === 'city' || t.size === 'town' || t.size === 'village')
    .map((t) => ({ gx: t.gx, gy: t.gy }));
  if (capitals.length < 2) return;

  const seeds = pickRealmSeeds(
    capitals,
    Math.min(o.realms, capitals.length),
    Math.max(6, f.w / 12),
    rng,
    () => namer.region(),
  );
  // A pen-and-ink map should not sprout six heraldic colours.
  const palette0 = paletteById(o.paletteId);
  if (palette0.mono) {
    seeds.forEach((s, i) => {
      s.color = mix(palette0.ink, palette0.parchment, 0.25 + (i % 4) * 0.16);
    });
  }
  if (seeds.length < 2) return;

  const { owner, realms, borders } = growRealms(f, biomes, seeds);

  // --- Territory wash ------------------------------------------------------
  if (o.realmTint > 0.01) {
    const tint = makeRasterLayer('Realms', doc.width, doc.height, 'custom');
    tint.blend = 'multiply';
    tint.opacity = Math.min(1, o.realmTint);

    const small = acquireScratch(f.w, f.h);
    const sctx = ctxOf(small);
    const img = sctx.createImageData(f.w, f.h);
    for (let i = 0; i < owner.length; i++) {
      const idx = i * 4;
      const r = owner[i];
      if (r < 0) {
        // Unclaimed land and sea stay neutral: white multiplies to nothing.
        img.data[idx] = 255; img.data[idx + 1] = 255; img.data[idx + 2] = 255; img.data[idx + 3] = 255;
        continue;
      }
      const c = parseColor(mix('#ffffff', realms[r].color, 0.85));
      img.data[idx] = c.r; img.data[idx + 1] = c.g; img.data[idx + 2] = c.b; img.data[idx + 3] = 255;
    }
    sctx.putImageData(img, 0, 0);

    // Soften at grid resolution for the same reason as the relief pass.
    const softened = acquireScratch(f.w, f.h);
    const soft = ctxOf(softened);
    soft.filter = 'blur(1.1px)';
    soft.drawImage(small, 0, 0);
    soft.filter = 'none';

    const ctx = ctxOf(tint.surface);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(softened, 0, 0, doc.width, doc.height);
    releaseScratch(softened);
    releaseScratch(small);

    // Sit the wash directly above the shading so stamps and labels stay crisp.
    const at = doc.layers.findIndex((l) => l.role === 'relief');
    doc.layers.splice(at < 0 ? doc.layers.length : at + 1, 0, tint);
  }

  // --- Borders -------------------------------------------------------------
  if (o.realmBorders) {
    const layer = doc.layers.find((l) => l.kind === 'object' && l.name === 'Routes & Borders');
    if (layer && layer.kind === 'object') {
      const palette = paletteById(o.paletteId);
      const scale = doc.width / 2400;
      for (const chain of borders) {
        if (chain.length < 5) continue;
        const pts = chaikin(simplify(chain.map((p) => ({ x: p.x * sx, y: p.y * sy })), Math.max(2, sx * 0.5)), 2);
        if (pts.length < 3) continue;
        layer.objects.push(makePath('border', pts, o.paletteId, {
          name: 'Realm border',
          width: 5 * scale,
          outlineWidth: 14 * scale,
          color: mix(palette.border, palette.ink, 0.3),
          outlineColor: rgba(palette.border, 0.4),
          dash: [16 * scale, 9 * scale, 4 * scale, 9 * scale],
          jitter: 0.8,
          smoothing: 0.8,
          opacity: 0.95,
        }));
      }
    }
  }

  // --- Realm names ---------------------------------------------------------
  const labels = doc.layers.find((l) => l.kind === 'object' && l.role === 'labels');
  if (labels && labels.kind === 'object') {
    const palette = paletteById(o.paletteId);
    const scale = doc.width / 2400;
    for (const realm of realms) {
      if (realm.area < (f.w * f.h) / 220) continue;
      labels.objects.push(makeText(realm.name.toUpperCase(), realm.centroid.x * sx, realm.centroid.y * sy, o.paletteId, {
        size: 30 * scale,
        bold: true,
        letterSpacing: 11 * scale,
        color: mix(realm.color, palette.ink, 0.45),
        strokeColor: rgba(palette.parchment, 0.7),
        strokeWidth: 4 * scale,
        opacity: 0.9,
        name: `Realm: ${realm.name}`,
      }));
    }
  }
}

interface Town {
  x: number; y: number;
  /** Grid coordinates, kept so the realm pass can seed from settlements. */
  gx: number; gy: number;
  name: string;
  size: 'hamlet' | 'village' | 'town' | 'city';
}

function addSettlements(
  doc: MapDocument, f: Fields, biomes: Uint8Array, o: RegionGenOptions,
  rng: RNG, namer: ReturnType<typeof createNamer>, sx: number, sy: number,
): Town[] {
  const layer = doc.layers.find((l) => l.kind === 'object' && l.role === 'features');
  if (!layer || layer.kind !== 'object') return [];

  const scale = doc.width / 2400;
  const scores: { i: number; s: number }[] = [];
  const span = Math.max(0.05, 1 - f.seaLevel);
  for (let i = 0; i < f.elevation.length; i++) {
    if (f.water[i]) continue;
    const alt = clamp01((f.elevation[i] - f.seaLevel) / span);
    if (alt > 0.5) continue;
    const coast = 1 - clamp01(f.distanceToWater[i] / 6);
    const river = clamp01(f.flow[i] / 400);
    const arable = clamp01(f.moisture[i] * 1.2) * clamp01(f.temperature[i] * 1.4);
    const s = coast * 0.5 + river * 0.7 + arable * 0.6 - alt * 0.4 + rng.float(0, 0.35);
    scores.push({ i, s });
  }
  scores.sort((a, b) => b.s - a.s);

  const towns: Town[] = [];
  const minDist = Math.max(120, doc.width / 14);
  for (const { i } of scores) {
    if (towns.length >= o.settlements) break;
    const gx = i % f.w, gy = Math.floor(i / f.w);
    const x = (gx + 0.5) * sx, y = (gy + 0.5) * sy;
    if (towns.some((t) => dist(t, { x, y }) < minDist)) continue;
    const roll = towns.length;
    const size: Town['size'] = roll === 0 ? 'city' : roll < 3 ? 'town' : roll < 8 ? 'village' : 'hamlet';
    towns.push({ x, y, gx, gy, name: namer.settlement(size), size });
  }

  for (const t of towns) {
    const asset = t.size === 'city' ? 'town/city' : t.size === 'town' ? 'town/town' : 'town/village';
    const w = (t.size === 'city' ? 190 : t.size === 'town' ? 145 : 110) * scale;
    const def = { city: 1.25, town: 1.3, village: 1.6, hamlet: 1.6 }[t.size];
    layer.objects.push(makeStamp(asset, t.x, t.y, w, w / def, { seed: rng.int(1, 1e6), name: t.name }));
  }

  // A handful of landmarks for flavour.
  const landmarks = ['town/castle', 'town/ruins', 'town/tower', 'town/mine', 'town/temple', 'town/lighthouse'];
  const count = Math.round(6 * scale);
  for (let k = 0; k < count; k++) {
    const pick = scores[rng.int(0, Math.min(scores.length - 1, 400))];
    if (!pick) break;
    const gx = pick.i % f.w, gy = Math.floor(pick.i / f.w);
    const x = (gx + 0.5) * sx, y = (gy + 0.5) * sy;
    if (towns.some((t) => dist(t, { x, y }) < minDist * 0.6)) continue;
    const asset = rng.pick(landmarks);
    const w = rng.float(70, 120) * scale;
    layer.objects.push(makeStamp(asset, x, y, w, w / 1.3, { seed: rng.int(1, 1e6) }));
  }

  return towns;
}

function addLabels(
  doc: MapDocument, f: Fields, biomes: Uint8Array, o: RegionGenOptions,
  rng: RNG, namer: ReturnType<typeof createNamer>, sx: number, sy: number, towns: Town[],
): void {
  const layer = doc.layers.find((l) => l.kind === 'object' && l.role === 'labels');
  if (!layer || layer.kind !== 'object') return;
  const palette = paletteById(o.paletteId);
  const scale = doc.width / 2400;

  for (const t of towns) {
    const size = (t.size === 'city' ? 34 : t.size === 'town' ? 27 : 22) * scale;
    layer.objects.push(makeText(t.name, t.x, t.y + (t.size === 'city' ? 62 : 46) * scale, o.paletteId, {
      size,
      bold: t.size === 'city',
      letterSpacing: t.size === 'city' ? 4 : 2,
      strokeColor: palette.parchment,
      strokeWidth: Math.max(2, size * 0.18),
      color: palette.ink,
    }));
  }

  // Region-scale labels placed at biome cluster centroids.
  const clusters = biomeClusters(biomes, f.w, f.h);
  const wanted: { biome: Biome; make: () => string; size: number; italic: boolean }[] = [
    { biome: 'mountain', make: () => namer.range(), size: 44, italic: false },
    { biome: 'forest', make: () => namer.forest(), size: 38, italic: true },
    { biome: 'taiga', make: () => namer.forest(), size: 38, italic: true },
    { biome: 'desert', make: () => namer.region(), size: 40, italic: true },
    { biome: 'jungle', make: () => namer.forest(), size: 38, italic: true },
    { biome: 'swamp', make: () => namer.region(), size: 32, italic: true },
    { biome: 'ocean-deep', make: () => namer.sea(), size: 52, italic: true },
    { biome: 'grassland', make: () => namer.region(), size: 36, italic: true },
    { biome: 'tundra', make: () => namer.region(), size: 34, italic: true },
  ];

  for (const wDef of wanted) {
    const list = clusters.get(wDef.biome) || [];
    for (const c of list.slice(0, 2)) {
      if (c.count < (f.w * f.h) / 260) continue;
      const x = (c.x + 0.5) * sx, y = (c.y + 0.5) * sy;
      if (towns.some((t) => dist(t, { x, y }) < 140 * scale)) continue;
      const isSea = isWaterBiome(wDef.biome);
      const text = wDef.make();

      // Fit the type to the room available. `c.radius` is the distance from the
      // label's anchor to the edge of the region it names, so twice that is how
      // much horizontal space there is before the words run out onto something
      // they are not describing. A long name in a narrow bay gets set smaller;
      // if it would have to shrink past legibility, the region goes unnamed,
      // which is what a real cartographer would do too.
      const room = 2 * c.radius * Math.min(sx, sy) * 0.92;
      const fitted = Math.min(wDef.size * scale, room / Math.max(1, text.length * 0.56));
      if (fitted < 15 * scale) continue;

      layer.objects.push(makeText(text, x, y, o.paletteId, {
        size: fitted,
        italic: wDef.italic,
        letterSpacing: Math.min(7 * scale, fitted * 0.18),
        color: isSea ? mix(palette.deepWater, palette.ink, 0.35) : palette.inkSoft,
        strokeColor: isSea ? rgba(palette.shallowWater, 0.6) : rgba(palette.parchment, 0.75),
        strokeWidth: 3 * scale,
        curve: rng.bool(0.35) ? (rng.bool() ? 'arcUp' : 'arcDown') : 'straight',
        curveRadius: rng.float(500, 1300) * scale,
        rotation: rng.float(-6, 6),
      }));
    }
  }
}

interface Cluster {
  /** Interior point (approximate pole of inaccessibility), in grid cells. */
  x: number;
  y: number;
  count: number;
  /** Distance from (x, y) to the nearest cell outside the cluster, in grid cells. */
  radius: number;
}

/**
 * Connected regions of each biome, largest first, each with a point to hang a
 * label on.
 *
 * The obvious choice — the centroid — is wrong for anything that is not convex,
 * and coastlines are never convex: the centroid of a C-shaped strait or a bay
 * that wraps around a headland lands squarely on the headland, so the map ends
 * up captioning dry ground as a sea. Instead each cluster reports its pole of
 * inaccessibility: the interior cell furthest from any cell that is not part of
 * the cluster. That point is guaranteed to be inside the region, and its
 * distance to the edge doubles as a budget for how large the label may be
 * drawn before it spills out of the thing it is naming.
 */
function biomeClusters(biomes: Uint8Array, w: number, h: number): Map<Biome, Cluster[]> {
  const seen = new Uint8Array(w * h);
  const out = new Map<Biome, Cluster[]>();
  const stack: number[] = [];
  const cells: number[] = [];

  for (let start = 0; start < biomes.length; start++) {
    if (seen[start]) continue;
    const target = biomes[start];
    const b = BIOME_ORDER[target];
    stack.length = 0;
    cells.length = 0;
    stack.push(start);
    seen[start] = 1;

    let minX = w, maxX = 0, minY = h, maxY = 0;
    while (stack.length) {
      const j = stack.pop()!;
      const x = j % w, y = (j / w) | 0;
      cells.push(j);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0 && !seen[j - 1] && biomes[j - 1] === target) { seen[j - 1] = 1; stack.push(j - 1); }
      if (x < w - 1 && !seen[j + 1] && biomes[j + 1] === target) { seen[j + 1] = 1; stack.push(j + 1); }
      if (y > 0 && !seen[j - w] && biomes[j - w] === target) { seen[j - w] = 1; stack.push(j - w); }
      if (y < h - 1 && !seen[j + w] && biomes[j + w] === target) { seen[j + w] = 1; stack.push(j + w); }
    }

    const pole = poleOfInaccessibility(cells, minX, minY, maxX, maxY, w);
    const list = out.get(b) || [];
    list.push({ x: pole.x, y: pole.y, count: cells.length, radius: pole.r });
    out.set(b, list);
  }

  for (const [, list] of out) list.sort((a, b) => b.count - a.count);
  return out;
}

/**
 * Chamfer distance transform over the cluster's bounding box, returning the
 * cell with the greatest distance to the outside. The box is padded by one so
 * that a cluster touching the map edge is still bounded on that side — a label
 * centred half off the page helps nobody.
 */
function poleOfInaccessibility(
  cells: number[], minX: number, minY: number, maxX: number, maxY: number, w: number,
): { x: number; y: number; r: number } {
  const bw = maxX - minX + 3, bh = maxY - minY + 3;
  const d = new Float32Array(bw * bh); // 0 everywhere = outside
  for (const c of cells) {
    const x = (c % w) - minX + 1, y = ((c / w) | 0) - minY + 1;
    d[y * bw + x] = Infinity;
  }

  const D1 = 1, D2 = 1.41421356;
  for (let y = 1; y < bh; y++) {
    for (let x = 1; x < bw - 1; x++) {
      const i = y * bw + x;
      if (d[i] === 0) continue;
      const m = Math.min(
        d[i - bw] + D1, d[i - 1] + D1,
        d[i - bw - 1] + D2, d[i - bw + 1] + D2,
      );
      if (m < d[i]) d[i] = m;
    }
  }
  let best = 0, bestX = cells.length ? cells[0] % w : 0, bestY = cells.length ? (cells[0] / w) | 0 : 0;
  for (let y = bh - 2; y >= 0; y--) {
    for (let x = bw - 2; x >= 1; x--) {
      const i = y * bw + x;
      if (d[i] === 0) continue;
      const m = Math.min(
        d[i + bw] + D1, d[i + 1] + D1,
        d[i + bw + 1] + D2, d[i + bw - 1] + D2,
      );
      if (m < d[i]) d[i] = m;
      if (d[i] > best) { best = d[i]; bestX = x + minX - 1; bestY = y + minY - 1; }
    }
  }
  return { x: bestX, y: bestY, r: best };
}

function addCartography(doc: MapDocument, o: RegionGenOptions, namer: ReturnType<typeof createNamer>): void {
  const layer = doc.layers.find((l) => l.kind === 'object' && l.role === 'labels');
  if (!layer || layer.kind !== 'object') return;
  const scale = doc.width / 2400;

  if (o.compass) {
    const size = 240 * scale;
    layer.objects.push(makeStamp('sym/compass-rose', doc.width - size * 0.75, size * 0.75, size, size, { seed: 4, opacity: 0.9 }));
  }
  if (o.scaleBar) {
    const w = 320 * scale;
    layer.objects.push(makeStamp('sym/scale-bar', w * 0.62, doc.height - 70 * scale, w, w / 4, { seed: 2, opacity: 0.92 }));
  }
  if (o.border) {
    layer.objects.push(makeStamp('sym/border-frame', doc.width / 2, doc.height / 2, doc.width, doc.height, { seed: 1, opacity: 0.85 }));
  }
}
