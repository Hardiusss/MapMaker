/**
 * Battle map generator — a tactical encounter surface on a 5 ft grid, with
 * blocking terrain wired up as VTT walls so line of sight works on import.
 */
import type { MapDocument, Vec2, Wall } from '../../core/types';
import { createDocument, rasterByRole, objectLayerByRole } from '../../core/doc';
import { RNG } from '../../core/rng';
import { createNamer } from '../names';
import { getTexture } from '../../render/textures';
import { createSurface, ctxOf } from '../../util/canvas';
import { blendTextures, addTonalDrift, fillTexture } from '../paintUtils';
import { makeStamp, makeStampAuto, makeLight, makeWall, makeText } from '../../core/factories';
import { paletteById, mix, rgba } from '../../core/color';
import { SimplexNoise, clamp01, smoothstep } from '../../core/noise';
import { dist } from '../../core/geometry';

export type BattleBiome =
  | 'forest' | 'clearing' | 'riverbank' | 'swamp' | 'desert' | 'snow'
  | 'ruins' | 'cavern' | 'crossroads' | 'camp' | 'graveyard' | 'coast' | 'volcanic';

export interface BattleGenOptions {
  cols: number;
  rows: number;
  cell: number;
  seed: number;
  biome: BattleBiome;
  /** 0 = open field, 1 = dense cover. */
  density: number;
  water: number;
  elevation: number;
  props: boolean;
  walls: boolean;
  lights: boolean;
  paletteId: string;
  gridVisible: boolean;
  title?: string;
}

export const DEFAULT_BATTLE_OPTIONS: BattleGenOptions = {
  cols: 32, rows: 24, cell: 70, seed: 1, biome: 'forest',
  density: 0.5, water: 0.15, elevation: 0.35,
  props: true, walls: true, lights: false,
  paletteId: 'verdant', gridVisible: true,
};

interface BiomeRecipe {
  base: string;
  patches: { texture: string; amount: number; scale: number }[];
  scatter: { asset: string; weight: number; min: number; max: number; blocks: boolean }[];
  waterTexture: string;
  ambient?: { color: string; bright: number; dim: number };
}

const RECIPES: Record<BattleBiome, BiomeRecipe> = {
  forest: {
    base: 'grass',
    patches: [
      { texture: 'grass-lush', amount: 6, scale: 1 },
      { texture: 'dirt', amount: 3, scale: 1 },
      { texture: 'moss', amount: 4, scale: 1 },
    ],
    scatter: [
      { asset: 'btl/tree-top', weight: 8, min: 1.6, max: 3.2, blocks: true },
      { asset: 'btl/pine-top', weight: 3, min: 1.4, max: 2.6, blocks: true },
      { asset: 'btl/bush-top', weight: 5, min: 0.8, max: 1.4, blocks: false },
      { asset: 'btl/boulder', weight: 3, min: 0.9, max: 1.8, blocks: true },
      { asset: 'btl/log', weight: 2, min: 1.6, max: 3, blocks: true },
      { asset: 'btl/stump', weight: 2, min: 0.6, max: 0.9, blocks: false },
      { asset: 'btl/grass-patch', weight: 4, min: 1.6, max: 3, blocks: false },
    ],
    waterTexture: 'water-shallow',
  },
  clearing: {
    base: 'grass',
    patches: [{ texture: 'grass-lush', amount: 5, scale: 1 }, { texture: 'dirt', amount: 2, scale: 1 }],
    scatter: [
      { asset: 'btl/tree-top', weight: 3, min: 1.8, max: 3, blocks: true },
      { asset: 'btl/bush-top', weight: 4, min: 0.8, max: 1.3, blocks: false },
      { asset: 'btl/grass-patch', weight: 6, min: 1.6, max: 3, blocks: false },
      { asset: 'btl/boulder', weight: 2, min: 0.8, max: 1.4, blocks: true },
    ],
    waterTexture: 'water-shallow',
  },
  riverbank: {
    base: 'grass',
    patches: [{ texture: 'dirt', amount: 5, scale: 1 }, { texture: 'sand', amount: 4, scale: 1 }],
    scatter: [
      { asset: 'btl/tree-top', weight: 4, min: 1.6, max: 2.8, blocks: true },
      { asset: 'veg/reeds', weight: 5, min: 1, max: 2, blocks: false },
      { asset: 'btl/boulder', weight: 3, min: 0.8, max: 1.6, blocks: true },
      { asset: 'btl/log', weight: 2, min: 1.6, max: 2.6, blocks: true },
    ],
    waterTexture: 'water',
  },
  swamp: {
    base: 'swamp',
    patches: [{ texture: 'moss', amount: 6, scale: 1 }, { texture: 'mud', amount: 5, scale: 1 }],
    scatter: [
      { asset: 'veg/tree-dead', weight: 6, min: 1.4, max: 2.6, blocks: true },
      { asset: 'veg/reeds', weight: 7, min: 1, max: 2.2, blocks: false },
      { asset: 'veg/mushroom', weight: 3, min: 0.8, max: 1.4, blocks: false },
      { asset: 'btl/log', weight: 3, min: 1.4, max: 2.4, blocks: true },
    ],
    waterTexture: 'swamp',
  },
  desert: {
    base: 'sand',
    patches: [{ texture: 'dunes', amount: 6, scale: 1 }, { texture: 'scree', amount: 3, scale: 1 }],
    scatter: [
      { asset: 'btl/boulder', weight: 6, min: 1, max: 2.2, blocks: true },
      { asset: 'veg/cactus', weight: 4, min: 0.7, max: 1.2, blocks: false },
      { asset: 'terrain/rocks', weight: 3, min: 1, max: 1.8, blocks: true },
      { asset: 'dgn/bones', weight: 2, min: 0.8, max: 1.4, blocks: false },
    ],
    waterTexture: 'water-shallow',
  },
  snow: {
    base: 'snow',
    patches: [{ texture: 'ice', amount: 4, scale: 1 }, { texture: 'tundra', amount: 4, scale: 1 }],
    scatter: [
      { asset: 'btl/pine-top', weight: 7, min: 1.4, max: 2.6, blocks: true },
      { asset: 'btl/boulder', weight: 3, min: 0.9, max: 1.8, blocks: true },
      { asset: 'veg/tree-dead', weight: 2, min: 1.2, max: 2, blocks: true },
    ],
    waterTexture: 'ice',
    ambient: { color: '#cfe6ff', bright: 0, dim: 0 },
  },
  ruins: {
    base: 'dirt',
    patches: [{ texture: 'flagstone', amount: 6, scale: 1 }, { texture: 'moss', amount: 4, scale: 1 }, { texture: 'grass', amount: 3, scale: 1 }],
    scatter: [
      { asset: 'dgn/pillar', weight: 6, min: 0.9, max: 1.4, blocks: true },
      { asset: 'dgn/rubble', weight: 6, min: 1.2, max: 2.4, blocks: false },
      { asset: 'town/ruins', weight: 3, min: 2, max: 3.4, blocks: true },
      { asset: 'veg/vines', weight: 3, min: 1.2, max: 2.2, blocks: false },
      { asset: 'dgn/statue', weight: 2, min: 0.9, max: 1.3, blocks: true },
    ],
    waterTexture: 'water-shallow',
  },
  cavern: {
    base: 'cave-floor',
    patches: [{ texture: 'rock', amount: 6, scale: 1 }, { texture: 'scree', amount: 4, scale: 1 }],
    scatter: [
      { asset: 'btl/boulder', weight: 7, min: 1, max: 2.2, blocks: true },
      { asset: 'dgn/rubble', weight: 5, min: 1.2, max: 2.2, blocks: false },
      { asset: 'veg/mushroom', weight: 4, min: 0.9, max: 1.6, blocks: false },
      { asset: 'dgn/water-pool', weight: 2, min: 1.6, max: 3, blocks: false },
    ],
    waterTexture: 'water-deep',
  },
  crossroads: {
    base: 'grass',
    patches: [{ texture: 'dirt', amount: 8, scale: 1 }, { texture: 'plains', amount: 3, scale: 1 }],
    scatter: [
      { asset: 'btl/tree-top', weight: 4, min: 1.6, max: 2.8, blocks: true },
      { asset: 'btl/fence', weight: 3, min: 2.4, max: 4, blocks: true },
      { asset: 'btl/wagon', weight: 2, min: 1.6, max: 2.4, blocks: true },
      { asset: 'btl/grass-patch', weight: 4, min: 1.6, max: 2.6, blocks: false },
    ],
    waterTexture: 'water-shallow',
  },
  camp: {
    base: 'dirt',
    patches: [{ texture: 'grass', amount: 4, scale: 1 }, { texture: 'mud', amount: 3, scale: 1 }],
    scatter: [
      { asset: 'btl/tent', weight: 6, min: 1.8, max: 2.6, blocks: true },
      { asset: 'dgn/campfire', weight: 3, min: 1, max: 1.6, blocks: false },
      { asset: 'btl/crates-stack', weight: 4, min: 1.2, max: 2, blocks: true },
      { asset: 'dgn/barrel', weight: 3, min: 0.7, max: 1, blocks: true },
      { asset: 'btl/wagon', weight: 2, min: 1.8, max: 2.6, blocks: true },
    ],
    waterTexture: 'water-shallow',
    ambient: { color: '#ffae5c', bright: 20, dim: 40 },
  },
  graveyard: {
    base: 'grass',
    patches: [{ texture: 'dirt', amount: 5, scale: 1 }, { texture: 'moss', amount: 4, scale: 1 }],
    scatter: [
      { asset: 'dgn/sarcophagus', weight: 6, min: 0.9, max: 1.4, blocks: true },
      { asset: 'veg/tree-dead', weight: 4, min: 1.4, max: 2.6, blocks: true },
      { asset: 'dgn/bones', weight: 4, min: 0.9, max: 1.6, blocks: false },
      { asset: 'town/ruins', weight: 2, min: 1.8, max: 2.8, blocks: true },
    ],
    waterTexture: 'water-shallow',
  },
  coast: {
    base: 'sand',
    patches: [{ texture: 'grass', amount: 4, scale: 1 }, { texture: 'scree', amount: 3, scale: 1 }],
    scatter: [
      { asset: 'btl/boulder', weight: 6, min: 1, max: 2.2, blocks: true },
      { asset: 'veg/tree-palm', weight: 3, min: 1.4, max: 2.2, blocks: true },
      { asset: 'btl/log', weight: 2, min: 1.6, max: 2.6, blocks: true },
      { asset: 'btl/crates-stack', weight: 2, min: 1.2, max: 1.8, blocks: true },
    ],
    waterTexture: 'water',
  },
  volcanic: {
    base: 'ash',
    patches: [{ texture: 'rock', amount: 5, scale: 1 }, { texture: 'scree', amount: 4, scale: 1 }],
    scatter: [
      { asset: 'btl/boulder', weight: 7, min: 1, max: 2.4, blocks: true },
      { asset: 'terrain/rocks', weight: 4, min: 1.2, max: 2, blocks: true },
      { asset: 'btl/scorch', weight: 4, min: 1.6, max: 3, blocks: false },
      { asset: 'dgn/bones', weight: 2, min: 0.9, max: 1.4, blocks: false },
    ],
    waterTexture: 'lava',
    ambient: { color: '#ff6a2a', bright: 15, dim: 35 },
  },
};

export interface BattleResult {
  doc: MapDocument;
  blockers: { x: number; y: number; r: number }[];
}

export function generateBattleMap(opts: Partial<BattleGenOptions> = {}): BattleResult {
  const o: BattleGenOptions = { ...DEFAULT_BATTLE_OPTIONS, ...opts };
  const rng = new RNG(o.seed);
  const namer = createNamer(o.seed);
  const recipe = RECIPES[o.biome];
  const width = o.cols * o.cell;
  const height = o.rows * o.cell;

  const doc = createDocument({
    kind: 'battle',
    width, height,
    title: o.title || `${o.biome[0].toUpperCase()}${o.biome.slice(1)} Encounter`,
    paletteId: o.paletteId,
    gridOverride: { size: o.cell, type: 'square', visible: o.gridVisible, snap: true, majorEvery: 5 },
  });
  doc.meta.seed = o.seed;
  doc.meta.description = `${o.cols}×${o.rows} squares at ${o.cell}px/5ft. Seed ${o.seed}.`;

  paintBase(doc, o, recipe, rng);
  const waterMaskPoly = o.water > 0.01 ? paintWater(doc, o, recipe, rng) : [];
  if (o.elevation > 0.01) paintElevation(doc, o, rng);

  const blockers = o.props ? scatterProps(doc, o, recipe, rng, waterMaskPoly) : [];
  if (o.walls) buildWalls(doc, blockers, o);
  if (o.lights || recipe.ambient) addLights(doc, o, recipe, rng);

  return { doc, blockers };
}

function paintBase(doc: MapDocument, o: BattleGenOptions, recipe: BiomeRecipe, rng: RNG): void {
  const bg = rasterByRole(doc, 'background');
  const terrain = rasterByRole(doc, 'terrain');
  if (!bg) return;

  fillTexture(ctxOf(bg.surface), doc.width, doc.height, recipe.base, o.paletteId);

  if (!terrain) return;
  const tctx = ctxOf(terrain.surface);

  // The base texture plus every patch texture, resolved in one pass. The base
  // carries the most weight so the patches read as variation, not as a quilt.
  const layers = [
    { textureId: recipe.base, weight: 4.5 },
    ...recipe.patches.map((p) => ({ textureId: p.texture, weight: Math.max(0.6, p.amount * 0.45) })),
  ];
  blendTextures(tctx, doc.width, doc.height, layers, {
    seed: o.seed + 13,
    scale: 3.1,
    warp: 0.26,
    paletteId: o.paletteId,
  });
  addTonalDrift(tctx, doc.width, doc.height, o.seed + 991, 1);
}

function paintWater(doc: MapDocument, o: BattleGenOptions, recipe: BiomeRecipe, rng: RNG): Vec2[] {
  const water = rasterByRole(doc, 'water');
  if (!water) return [];
  const ctx = ctxOf(water.surface);
  const noise = new SimplexNoise(o.seed + 55);

  const mask = createSurface(doc.width, doc.height);
  const mctx = ctxOf(mask);
  mctx.fillStyle = '#ffffff';

  const poly: Vec2[] = [];
  if (rng.bool(0.55)) {
    // A stream crossing the map.
    const vertical = rng.bool();
    const w = doc.width * rng.float(0.06, 0.13) * (0.5 + o.water);
    const pts: Vec2[] = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      const drift = noise.fbm(t * 3, o.seed % 10, 3) * (vertical ? doc.width : doc.height) * 0.18;
      pts.push(vertical
        ? { x: doc.width * 0.5 + drift, y: doc.height * t }
        : { x: doc.width * t, y: doc.height * 0.5 + drift });
    }
    mctx.beginPath();
    mctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts.slice(1)) mctx.lineTo(p.x, p.y);
    mctx.lineWidth = w;
    mctx.lineCap = 'round';
    mctx.lineJoin = 'round';
    mctx.strokeStyle = '#ffffff';
    mctx.stroke();
    poly.push(...pts);
  } else {
    // A pond.
    const cx = rng.float(doc.width * 0.25, doc.width * 0.75);
    const cy = rng.float(doc.height * 0.25, doc.height * 0.75);
    const r = Math.min(doc.width, doc.height) * rng.float(0.12, 0.24) * (0.6 + o.water);
    mctx.beginPath();
    for (let i = 0; i <= 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      const wob = 1 + noise.fbm(Math.cos(a) * 1.6, Math.sin(a) * 1.6, 3) * 0.28;
      const p = { x: cx + Math.cos(a) * r * wob, y: cy + Math.sin(a) * r * wob * 0.85 };
      poly.push(p);
      i === 0 ? mctx.moveTo(p.x, p.y) : mctx.lineTo(p.x, p.y);
    }
    mctx.closePath();
    mctx.fill();
  }

  const palette = paletteById(o.paletteId);

  // Bank first: a fringe of wet earth outside the water line. Without it a
  // stream reads as a blue ribbon laid on top of the grass rather than a
  // channel cut into it — the water has to disturb the ground it runs through.
  const bank = createSurface(doc.width, doc.height);
  const bankCtx = ctxOf(bank);
  bankCtx.filter = `blur(${o.cell * 0.75}px)`;
  bankCtx.drawImage(mask, 0, 0);
  bankCtx.filter = 'none';
  // Knock the interior back out, leaving only the ring of spread.
  bankCtx.globalCompositeOperation = 'destination-out';
  bankCtx.drawImage(mask, 0, 0);
  bankCtx.globalCompositeOperation = 'source-in';
  bankCtx.fillStyle = mix(palette.lowland, '#6a5334', 0.7);
  bankCtx.fillRect(0, 0, doc.width, doc.height);
  ctx.save();
  ctx.globalAlpha = 0.8;
  ctx.drawImage(bank, 0, 0);
  ctx.restore();

  // Shallow rim next: the mask grown a little and tinted, so the deep water
  // sits inside a band of wadeable shallows instead of stopping dead.
  const rim = createSurface(doc.width, doc.height);
  const rimCtx = ctxOf(rim);
  rimCtx.filter = `blur(${o.cell * 0.22}px)`;
  rimCtx.drawImage(mask, 0, 0);
  rimCtx.filter = 'none';
  rimCtx.globalCompositeOperation = 'source-in';
  rimCtx.fillStyle = mix(palette.shallowWater, palette.water, 0.4);
  rimCtx.fillRect(0, 0, doc.width, doc.height);
  ctx.save();
  ctx.globalAlpha = 0.75;
  ctx.drawImage(rim, 0, 0);
  ctx.restore();

  // Body of water, its edge feathered by a cell-scale blur of the mask.
  const soft = createSurface(doc.width, doc.height);
  const softCtx = ctxOf(soft);
  softCtx.filter = `blur(${o.cell * 0.1}px)`;
  softCtx.drawImage(mask, 0, 0);
  softCtx.filter = 'none';

  const tmp = createSurface(doc.width, doc.height);
  const tc = ctxOf(tmp);
  tc.fillStyle = tc.createPattern(getTexture(recipe.waterTexture, { paletteId: o.paletteId }), 'repeat')!;
  tc.fillRect(0, 0, doc.width, doc.height);
  tc.globalCompositeOperation = 'destination-in';
  tc.drawImage(soft, 0, 0);
  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.drawImage(tmp, 0, 0);
  ctx.restore();

  return poly;
}

function paintElevation(doc: MapDocument, o: BattleGenOptions, rng: RNG): void {
  const shade = rasterByRole(doc, 'relief');
  if (!shade) return;
  const ctx = ctxOf(shade.surface);
  const noise = new SimplexNoise(o.seed + 88);
  const small = createSurface(Math.round(doc.width / 8), Math.round(doc.height / 8));
  const sctx = ctxOf(small);
  const img = sctx.createImageData(small.width, small.height);
  for (let y = 0; y < small.height; y++) {
    for (let x = 0; x < small.width; x++) {
      const n = noise.fbm(x / small.width * 3.2, y / small.height * 3.2, 4);
      const i = (y * small.width + x) * 4;
      const v = clamp01(Math.abs(n) * 1.4) * o.elevation;
      if (n < 0) {
        img.data[i] = 20; img.data[i + 1] = 16; img.data[i + 2] = 12; img.data[i + 3] = v * 140;
      } else {
        img.data[i] = 255; img.data[i + 1] = 248; img.data[i + 2] = 230; img.data[i + 3] = v * 90;
      }
    }
  }
  sctx.putImageData(img, 0, 0);

  // Blur at the small resolution, then upscale. Blurring after a twelve-fold
  // enlargement spreads the filter over half a source pixel, which leaves the
  // bilinear facets intact — and an `overlay` blend then prints them onto the
  // grass as a quilt of light and dark squares.
  const soft = createSurface(small.width, small.height);
  const softCtx = ctxOf(soft);
  softCtx.filter = 'blur(1.4px)';
  softCtx.drawImage(small, 0, 0);
  softCtx.filter = 'none';

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(soft, 0, 0, doc.width, doc.height);
  shade.blend = 'overlay';
  shade.opacity = 0.7;
}

function scatterProps(
  doc: MapDocument, o: BattleGenOptions, recipe: BiomeRecipe, rng: RNG, waterPoly: Vec2[],
): { x: number; y: number; r: number }[] {
  const layer = objectLayerByRole(doc, 'features');
  if (!layer) return [];
  const blockers: { x: number; y: number; r: number }[] = [];
  const placed: { x: number; y: number; r: number }[] = [];

  const cells = o.cols * o.rows;
  const target = Math.round(cells * 0.12 * (0.4 + o.density * 1.5));
  const weights = recipe.scatter.map((s) => [s, s.weight] as const);

  // A density field so props gather into groves and thickets with open ground
  // between them. Uniform scatter reads as a bad tile-set, not as terrain.
  const clump = new SimplexNoise(o.seed + 271);
  const clumpScale = 2.6;
  const densityAt = (x: number, y: number) =>
    clamp01(clump.fbm((x / doc.width) * clumpScale, (y / doc.height) * clumpScale, 3) * 0.5 + 0.55);

  let attempts = 0;
  while (placed.length < target && attempts < target * 40) {
    attempts++;
    const x = rng.float(o.cell * 0.4, doc.width - o.cell * 0.4);
    const y = rng.float(o.cell * 0.4, doc.height - o.cell * 0.4);
    // Rejection sampling against the density field.
    if (rng.next() > densityAt(x, y) * (0.45 + o.density * 0.9)) continue;
    const spec = rng.pickWeighted(weights);
    const cellsWide = rng.float(spec.min, spec.max);
    const r = (cellsWide * o.cell) / 2;
    if (placed.some((p) => dist(p, { x, y }) < (p.r + r) * 0.72)) continue;

    placed.push({ x, y, r });
    if (spec.blocks) blockers.push({ x, y, r: r * 0.72 });

    // Top-down props read best when they can rotate freely, but anything with
    // an obvious "up" (tents, wagons) only gets a small nudge.
    const freeRotate = !/tent|wagon|rug|fence/.test(spec.asset);
    layer.objects.push(makeStampAuto(spec.asset, x, y, cellsWide * o.cell, {
      seed: rng.int(1, 1e6),
      rotation: freeRotate ? rng.float(0, 360) : rng.float(-12, 12) + (rng.bool() ? 0 : 90),
      shadow: spec.blocks ? { color: 'rgba(0,0,0,0.35)', blur: o.cell * 0.2, dx: o.cell * 0.05, dy: o.cell * 0.08 } : null,
    }));
  }

  layer.objects.sort((a, b) => a.y - b.y);
  return blockers;
}

/** Approximate each blocking prop with a polygon of walls. */
function buildWalls(doc: MapDocument, blockers: { x: number; y: number; r: number }[], o: BattleGenOptions): void {
  const layer = doc.layers.find((l) => l.kind === 'wall');
  if (!layer || layer.kind !== 'wall') return;
  const walls: Wall[] = [];
  for (const b of blockers) {
    const sides = b.r > o.cell ? 8 : 6;
    const pts: Vec2[] = [];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      pts.push({ x: b.x + Math.cos(a) * b.r, y: b.y + Math.sin(a) * b.r });
    }
    for (let i = 0; i < sides; i++) {
      walls.push(makeWall(pts[i], pts[(i + 1) % sides], 'wall'));
    }
  }
  // Border walls so tokens cannot wander off the map.
  const w = doc.width, h = doc.height;
  walls.push(makeWall({ x: 0, y: 0 }, { x: w, y: 0 }, 'wall'));
  walls.push(makeWall({ x: w, y: 0 }, { x: w, y: h }, 'wall'));
  walls.push(makeWall({ x: w, y: h }, { x: 0, y: h }, 'wall'));
  walls.push(makeWall({ x: 0, y: h }, { x: 0, y: 0 }, 'wall'));
  layer.walls = walls;
}

function addLights(doc: MapDocument, o: BattleGenOptions, recipe: BiomeRecipe, rng: RNG): void {
  const layer = doc.layers.find((l) => l.kind === 'light');
  if (!layer || layer.kind !== 'light') return;
  const unitPx = o.cell / 5;
  const amb = recipe.ambient;
  if (amb && amb.bright > 0) {
    const n = rng.int(2, 5);
    for (let i = 0; i < n; i++) {
      layer.lights.push(makeLight(rng.float(0, doc.width), rng.float(0, doc.height), o.cell, {
        bright: amb.bright * unitPx, dim: amb.dim * unitPx, color: amb.color,
        animation: 'flame', name: 'Ambient Fire',
      }));
    }
  }
  if (o.lights && (!amb || amb.bright === 0)) {
    const n = rng.int(2, 4);
    for (let i = 0; i < n; i++) {
      layer.lights.push(makeLight(rng.float(0, doc.width), rng.float(0, doc.height), o.cell, {
        bright: 20 * unitPx, dim: 40 * unitPx, color: '#ffae5c', animation: 'torch', name: 'Torch',
      }));
    }
  }
}
