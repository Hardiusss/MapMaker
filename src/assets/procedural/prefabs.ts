/**
 * Prefabs — whole furnished rooms and set pieces dropped in one click.
 *
 * Every other asset in this library is one object. A GM furnishing a tavern
 * still has to place a bar, six tables, a hearth and a stair, and get the
 * spacing right, which is the slow part of dressing a map. A prefab is a
 * arrangement of those same assets with the layout already decided: the stamp
 * tool places it like any other stamp, and because the parts are drawn rather
 * than blitted, each copy is seeded differently — two taverns from the same
 * prefab are laid out alike and detailed differently.
 *
 * Prefabs compose the existing registry by calling other assets' `draw`
 * directly, so nothing here duplicates art and a fix to a chair fixes every
 * room that has one.
 */
import type { AssetDef, AssetDrawArgs } from '../types';
import { INTERIOR_ASSETS } from './interior';
import { DUNGEON_ASSETS } from './dungeon';
import { EXTRA_ASSETS } from './extras';
import { NATURE_ASSETS } from './nature';
import { STRUCTURE_ASSETS } from './structures';
import { BATTLE_ASSETS } from './battle';
import { mix, rgba } from '../../core/color';
import { roundRect, speckle } from '../draw';

const LOOKUP = new Map<string, AssetDef>();
for (const d of [
  ...INTERIOR_ASSETS, ...DUNGEON_ASSETS, ...EXTRA_ASSETS,
  ...NATURE_ASSETS, ...STRUCTURE_ASSETS, ...BATTLE_ASSETS,
]) LOOKUP.set(d.id, d);

/** One placed object, in fractions of the prefab's box. */
interface Placement {
  id: string;
  /** Centre. */
  x: number;
  y: number;
  /** Width as a fraction of the prefab's box width. */
  w: number;
  /** Degrees, clockwise. */
  rot?: number;
  /** Random nudge, as a fraction of the box, so copies are not stencils. */
  jitter?: number;
  /** Place `repeat` copies evenly from (x, y) to (to[0], to[1]). */
  repeat?: number;
  to?: [number, number];
  /** Pin the variant instead of rolling one. */
  variant?: number;
}

type FloorKind = 'flagstone' | 'plank' | 'dirt' | 'grass' | 'sand' | 'rough-stone' | 'none';

interface Prefab {
  id: string;
  label: string;
  sub: string;
  tags: string[];
  /** Room size in 5 ft squares — the box is derived from it. */
  cells: [number, number];
  floor: FloorKind;
  /** Draw a stone wall band around the edge. */
  walls?: boolean;
  /** Doorway gaps: side and position along that side (0..1). */
  doors?: [('n' | 's' | 'e' | 'w'), number][];
  kinds?: AssetDef['kinds'];
  items: Placement[];
}

const CELL = 70; // one 5 ft square, matching the battle-map exports

// ---------------------------------------------------------------------------
// Ground
// ---------------------------------------------------------------------------

function floorFill(a: AssetDrawArgs, kind: FloorKind, inset: number): void {
  if (kind === 'none') return;
  const { ctx, w, h, rng, palette } = a;
  const x = inset, y = inset, fw = w - inset * 2, fh = h - inset * 2;
  const base =
    kind === 'plank' ? '#6b4a2a'
      : kind === 'dirt' ? mix(palette.lowland, '#6a5439', 0.55)
        : kind === 'grass' ? palette.grass
          : kind === 'sand' ? palette.desert
            : mix(palette.rock, '#8a8175', 0.4);
  const tone = a.tint ? mix(base, a.tint, a.tintStrength * 0.5) : base;

  ctx.save();
  roundRect(ctx, x, y, fw, fh, Math.min(fw, fh) * 0.015);
  ctx.clip();
  ctx.fillStyle = tone;
  ctx.fillRect(x, y, fw, fh);

  if (kind === 'flagstone' || kind === 'rough-stone') {
    // Courses of slabs, each one nudged off true so the floor is laid, not printed.
    const step = CELL * (kind === 'flagstone' ? 0.72 : 0.5);
    ctx.lineWidth = Math.max(1, step * 0.035);
    for (let row = 0; y + row * step < y + fh + step; row++) {
      const offset = kind === 'flagstone' ? (row % 2) * step * 0.5 : rng.float(0, step);
      for (let col = -1; x + col * step + offset < x + fw + step; col++) {
        const sx = x + col * step + offset + rng.float(-1, 1) * step * 0.03;
        const sy = y + row * step + rng.float(-1, 1) * step * 0.03;
        const sw = step * rng.float(0.86, 0.97);
        const sh = step * rng.float(0.86, 0.97);
        ctx.fillStyle = mix(tone, rng.bool() ? '#ffffff' : '#000000', rng.float(0, 0.13));
        ctx.fillRect(sx, sy, sw, sh);
        ctx.strokeStyle = rgba(palette.ink, 0.22);
        ctx.strokeRect(sx, sy, sw, sh);
      }
    }
  } else if (kind === 'plank') {
    const pitch = CELL * 0.34;
    for (let i = 0; y + i * pitch < y + fh + pitch; i++) {
      const py = y + i * pitch;
      ctx.fillStyle = mix(tone, rng.bool() ? '#ffffff' : '#000000', rng.float(0, 0.12));
      ctx.fillRect(x, py, fw, pitch);
      ctx.strokeStyle = rgba('#3f2b16', 0.55);
      ctx.lineWidth = Math.max(1, pitch * 0.05);
      ctx.beginPath(); ctx.moveTo(x, py); ctx.lineTo(x + fw, py); ctx.stroke();
      // Butt joints, staggered.
      let jx = x + rng.float(0.2, 0.8) * CELL * 3;
      while (jx < x + fw) {
        ctx.beginPath(); ctx.moveTo(jx, py); ctx.lineTo(jx, py + pitch); ctx.stroke();
        jx += CELL * rng.float(2.5, 4.5);
      }
    }
  } else {
    speckle(ctx, x, y, fw, fh, Math.round((fw * fh) / 900),
      rgba(kind === 'grass' ? '#3d4a2a' : '#4a3a26', 0.3),
      Math.max(1, CELL * 0.012), Math.max(1.5, CELL * 0.035), rng);
  }

  // A little grime in the corners — a clean floor looks like a diagram.
  const g = ctx.createRadialGradient(x + fw / 2, y + fh / 2, Math.min(fw, fh) * 0.2,
    x + fw / 2, y + fh / 2, Math.max(fw, fh) * 0.62);
  g.addColorStop(0, rgba('#000000', 0));
  g.addColorStop(1, rgba('#000000', 0.24));
  ctx.fillStyle = g;
  ctx.fillRect(x, y, fw, fh);
  ctx.restore();
}

function wallBand(a: AssetDrawArgs, thickness: number, doors: Prefab['doors']): void {
  const { ctx, w, h, palette, rng } = a;
  const stone = mix(palette.rock, '#8a8175', 0.3);
  ctx.save();
  // The band itself: outer rect minus inner rect, so the room reads as enclosed.
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.rect(thickness, thickness, w - thickness * 2, h - thickness * 2);
  ctx.fillStyle = stone;
  ctx.fill('evenodd');
  // Block courses along the band.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.rect(thickness, thickness, w - thickness * 2, h - thickness * 2);
  ctx.clip('evenodd');
  const step = thickness * 1.5;
  ctx.strokeStyle = rgba(palette.ink, 0.28);
  ctx.lineWidth = Math.max(1, thickness * 0.08);
  for (let x = 0; x < w; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y < h; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  speckle(ctx, 0, 0, w, h, Math.round((w + h) / 6), rgba('#000000', 0.18),
    thickness * 0.06, thickness * 0.16, rng);
  ctx.restore();
  // Outline last so it sits on top of the courses.
  ctx.strokeStyle = rgba(palette.ink, 0.85);
  ctx.lineWidth = Math.max(1.5, thickness * 0.16);
  ctx.strokeRect(thickness * 0.08, thickness * 0.08, w - thickness * 0.16, h - thickness * 0.16);
  ctx.strokeRect(thickness, thickness, w - thickness * 2, h - thickness * 2);
  ctx.restore();

  // Punch the doorways back out to the floor colour, then frame them.
  for (const [side, t] of doors ?? []) {
    const gap = thickness * 2.6;
    let dx = 0, dy = 0, dw = 0, dh = 0;
    if (side === 'n') { dx = t * w - gap / 2; dy = -1; dw = gap; dh = thickness + 2; }
    if (side === 's') { dx = t * w - gap / 2; dy = h - thickness - 1; dw = gap; dh = thickness + 2; }
    if (side === 'w') { dx = -1; dy = t * h - gap / 2; dw = thickness + 2; dh = gap; }
    if (side === 'e') { dx = w - thickness - 1; dy = t * h - gap / 2; dw = thickness + 2; dh = gap; }
    ctx.save();
    ctx.clearRect(dx, dy, dw, dh);
    ctx.strokeStyle = rgba(palette.ink, 0.7);
    ctx.lineWidth = Math.max(1, thickness * 0.12);
    if (side === 'n' || side === 's') {
      ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(dx, dy + dh);
      ctx.moveTo(dx + dw, dy); ctx.lineTo(dx + dw, dy + dh);
    } else {
      ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(dx + dw, dy);
      ctx.moveTo(dx, dy + dh); ctx.lineTo(dx + dw, dy + dh);
    }
    ctx.stroke();
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

function drawOne(a: AssetDrawArgs, id: string, cx: number, cy: number, wFrac: number, rot: number, salt: number, variant?: number): void {
  const def = LOOKUP.get(id);
  if (!def) return; // A prefab referencing a retired asset degrades, it does not crash.
  const { ctx } = a;
  const pw = Math.max(4, wFrac * a.w);
  const ph = Math.max(4, pw / def.aspect);
  const rng = a.rng.fork(salt);
  ctx.save();
  ctx.translate(cx * a.w, cy * a.h);
  if (rot) ctx.rotate((rot * Math.PI) / 180);
  ctx.translate(-pw / 2, -ph / 2);
  def.draw({
    ctx, w: pw, h: ph, rng,
    palette: a.palette,
    tint: a.tint,
    tintStrength: a.tintStrength,
    variant: variant ?? rng.int(0, Math.max(0, def.variants - 1)),
  });
  ctx.restore();
}

function placeAll(a: AssetDrawArgs, items: Placement[]): void {
  let salt = 1;
  for (const p of items) {
    const n = Math.max(1, p.repeat ?? 1);
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1);
      const bx = p.to ? p.x + (p.to[0] - p.x) * t : p.x;
      const by = p.to ? p.y + (p.to[1] - p.y) * t : p.y;
      const j = p.jitter ?? 0;
      const jx = j ? a.rng.float(-j, j) : 0;
      const jy = j ? a.rng.float(-j, j) : 0;
      const rot = (p.rot ?? 0) + (j ? a.rng.float(-8, 8) : 0);
      drawOne(a, p.id, bx + jx, by + jy, p.w, rot, salt++, p.variant);
    }
  }
}

function toAsset(p: Prefab): AssetDef {
  const [cw, ch] = p.cells;
  return {
    id: `pre/${p.id}`,
    label: p.label,
    group: 'prefabs',
    sub: p.sub,
    tags: [...p.tags, 'prefab', 'kit', `${cw}x${ch}`],
    aspect: cw / ch,
    defaultWidth: cw * CELL,
    variants: 3,
    kinds: p.kinds ?? ['dungeon', 'battle', 'city'],
    draw(a) {
      const thickness = p.walls ? Math.max(3, a.w / cw * 0.34) : 0;
      floorFill(a, p.floor, thickness * 0.9);
      if (p.walls) wallBand(a, thickness, p.doors);
      placeAll(a, p.items);
    },
  };
}

// ---------------------------------------------------------------------------
// The kits
// ---------------------------------------------------------------------------

const PREFABS: Prefab[] = [
  // --- Interiors -----------------------------------------------------------
  {
    id: 'tavern-common-room', label: 'Tavern Common Room', sub: 'Room kits',
    tags: ['inn', 'tavern', 'social'], cells: [9, 7], floor: 'plank', walls: true,
    doors: [['s', 0.5], ['e', 0.75]],
    items: [
      { id: 'int/fireplace-rug', x: 0.14, y: 0.28, w: 0.2, rot: -90 },
      { id: 'int/bar-counter', x: 0.72, y: 0.2, w: 0.34 },
      { id: 'int/keg-rack', x: 0.88, y: 0.42, w: 0.14 },
      { id: 'int/tavern-table-stools', x: 0.3, y: 0.58, w: 0.17, jitter: 0.015 },
      { id: 'int/tavern-table-stools', x: 0.52, y: 0.75, w: 0.17, jitter: 0.015 },
      { id: 'int/tavern-table-stools', x: 0.22, y: 0.84, w: 0.15, jitter: 0.015 },
      { id: 'int/long-bench', x: 0.62, y: 0.48, w: 0.22, rot: 12, jitter: 0.01 },
      { id: 'int/spilled-tankards', x: 0.42, y: 0.66, w: 0.09, jitter: 0.02 },
      { id: 'int/dart-board', x: 0.06, y: 0.62, w: 0.06 },
      { id: 'int/wall-sconce', x: 0.5, y: 0.06, w: 0.05, repeat: 3, to: [0.9, 0.06] },
      { id: 'int/hanging-lantern', x: 0.45, y: 0.36, w: 0.07 },
      { id: 'int/firewood-stack', x: 0.09, y: 0.44, w: 0.09 },
    ],
  },
  {
    id: 'inn-guest-room', label: 'Inn Guest Room', sub: 'Room kits',
    tags: ['bedroom', 'rest'], cells: [5, 4], floor: 'plank', walls: true,
    doors: [['s', 0.3]],
    items: [
      { id: 'int/simple-cot', x: 0.26, y: 0.32, w: 0.24, rot: 90 },
      { id: 'int/nightstand-candle', x: 0.47, y: 0.24, w: 0.1 },
      { id: 'int/clothes-chest', x: 0.76, y: 0.22, w: 0.16 },
      { id: 'int/wash-stand', x: 0.82, y: 0.62, w: 0.14 },
      { id: 'int/rug-runner', x: 0.45, y: 0.72, w: 0.4, rot: 4 },
      { id: 'int/wall-sconce', x: 0.12, y: 0.08, w: 0.07 },
      { id: 'int/curtain-drape', x: 0.62, y: 0.06, w: 0.18 },
    ],
  },
  {
    id: 'kitchen-scullery', label: 'Kitchen & Scullery', sub: 'Room kits',
    tags: ['cooking', 'service'], cells: [7, 6], floor: 'flagstone', walls: true,
    doors: [['e', 0.5], ['w', 0.3]],
    items: [
      { id: 'int/hearth-fire', x: 0.2, y: 0.16, w: 0.26 },
      { id: 'int/cauldron-hook', x: 0.2, y: 0.3, w: 0.12 },
      { id: 'int/stone-oven', x: 0.62, y: 0.16, w: 0.22 },
      { id: 'int/prep-table', x: 0.45, y: 0.52, w: 0.3, rot: 0 },
      { id: 'int/butcher-block', x: 0.8, y: 0.5, w: 0.16 },
      { id: 'int/larder-shelves', x: 0.86, y: 0.8, w: 0.22, rot: -90 },
      { id: 'int/water-basin', x: 0.16, y: 0.72, w: 0.15 },
      { id: 'int/hanging-herbs', x: 0.38, y: 0.86, w: 0.14, jitter: 0.02 },
      { id: 'int/firewood-stack', x: 0.08, y: 0.5, w: 0.1 },
      { id: 'int/sacks-amphorae', x: 0.6, y: 0.84, w: 0.16, jitter: 0.02 },
    ],
  },
  {
    id: 'blacksmith-workshop', label: "Blacksmith's Workshop", sub: 'Room kits',
    tags: ['forge', 'craft', 'smith'], cells: [7, 6], floor: 'flagstone', walls: true,
    doors: [['s', 0.6]],
    items: [
      { id: 'int/forge-hearth', x: 0.22, y: 0.2, w: 0.28 },
      { id: 'int/bellows', x: 0.06, y: 0.34, w: 0.13, rot: 90 },
      { id: 'dgn/anvil', x: 0.45, y: 0.42, w: 0.18 },
      { id: 'int/quench-trough', x: 0.68, y: 0.32, w: 0.2 },
      { id: 'int/grindstone-wheel', x: 0.83, y: 0.58, w: 0.15 },
      { id: 'int/tool-bench', x: 0.42, y: 0.8, w: 0.3 },
      { id: 'int/weapon-rack', x: 0.86, y: 0.86, w: 0.2, rot: -90 },
      { id: 'int/armour-stand', x: 0.12, y: 0.78, w: 0.12 },
      { id: 'dgn/barrel', x: 0.68, y: 0.68, w: 0.09, jitter: 0.015 },
    ],
  },
  {
    id: 'wizard-study', label: "Wizard's Study", sub: 'Room kits',
    tags: ['arcane', 'library', 'mage'], cells: [7, 6], floor: 'plank', walls: true,
    doors: [['s', 0.5]],
    items: [
      { id: 'int/carpet-patterned', x: 0.48, y: 0.55, w: 0.44 },
      { id: 'int/writing-desk-inkwell', x: 0.3, y: 0.28, w: 0.26 },
      { id: 'dgn/bookshelf', x: 0.72, y: 0.09, w: 0.4 },
      { id: 'int/scroll-rack', x: 0.9, y: 0.4, w: 0.22, rot: -90 },
      { id: 'int/arcane-orrery', x: 0.68, y: 0.62, w: 0.2 },
      { id: 'int/standing-globe', x: 0.18, y: 0.66, w: 0.13 },
      { id: 'int/book-stacks-floor', x: 0.4, y: 0.82, w: 0.14, jitter: 0.02 },
      { id: 'int/lectern', x: 0.6, y: 0.86, w: 0.11 },
      { id: 'int/floor-candelabra', x: 0.1, y: 0.42, w: 0.1 },
      { id: 'dgn/portal', x: 0.87, y: 0.82, w: 0.16 },
    ],
  },
  {
    id: 'alchemy-lab', label: 'Alchemy Laboratory', sub: 'Room kits',
    tags: ['arcane', 'potion', 'craft'], cells: [7, 6], floor: 'flagstone', walls: true,
    doors: [['w', 0.5]],
    items: [
      { id: 'int/alchemy-bench', x: 0.4, y: 0.2, w: 0.34 },
      { id: 'int/distillation-still', x: 0.78, y: 0.24, w: 0.2 },
      { id: 'int/potion-shelf', x: 0.9, y: 0.6, w: 0.26, rot: -90 },
      { id: 'int/mortar-pestle-table', x: 0.28, y: 0.5, w: 0.2 },
      { id: 'int/specimen-jars', x: 0.6, y: 0.5, w: 0.16 },
      { id: 'int/chalk-circle', x: 0.42, y: 0.79, w: 0.3 },
      { id: 'int/wall-sconce', x: 0.2, y: 0.07, w: 0.06, repeat: 2, to: [0.62, 0.07] },
      { id: 'dgn/crate', x: 0.12, y: 0.83, w: 0.1, jitter: 0.015 },
    ],
  },
  {
    id: 'library-scriptorium', label: 'Library & Scriptorium', sub: 'Room kits',
    tags: ['books', 'study'], cells: [9, 7], floor: 'plank', walls: true,
    doors: [['s', 0.5]],
    items: [
      { id: 'dgn/bookshelf', x: 0.22, y: 0.08, w: 0.34, repeat: 2, to: [0.72, 0.08] },
      { id: 'dgn/bookshelf', x: 0.06, y: 0.5, w: 0.3, rot: 90 },
      { id: 'dgn/bookshelf', x: 0.94, y: 0.5, w: 0.3, rot: 90 },
      { id: 'int/reading-desk', x: 0.32, y: 0.44, w: 0.2, repeat: 2, to: [0.66, 0.44] },
      { id: 'int/reading-desk', x: 0.32, y: 0.68, w: 0.2, repeat: 2, to: [0.66, 0.68] },
      { id: 'int/map-table', x: 0.5, y: 0.88, w: 0.26 },
      { id: 'int/lectern', x: 0.5, y: 0.24, w: 0.1 },
      { id: 'int/scroll-rack', x: 0.86, y: 0.86, w: 0.18 },
      { id: 'int/hanging-lantern', x: 0.35, y: 0.56, w: 0.06, repeat: 2, to: [0.65, 0.56] },
    ],
  },
  {
    id: 'chapel', label: 'Chapel', sub: 'Room kits',
    tags: ['temple', 'shrine', 'holy'], cells: [7, 9], floor: 'flagstone', walls: true,
    doors: [['s', 0.5]],
    items: [
      { id: 'dgn/altar', x: 0.5, y: 0.14, w: 0.34 },
      { id: 'int/candelabrum', x: 0.24, y: 0.16, w: 0.1 },
      { id: 'int/candelabrum', x: 0.76, y: 0.16, w: 0.1 },
      { id: 'int/reliquary-casket', x: 0.5, y: 0.27, w: 0.14 },
      { id: 'int/rug-runner', x: 0.5, y: 0.6, w: 0.16, rot: 90 },
      { id: 'int/pew-rows', x: 0.27, y: 0.46, w: 0.24, repeat: 3, to: [0.27, 0.78] },
      { id: 'int/pew-rows', x: 0.73, y: 0.46, w: 0.24, repeat: 3, to: [0.73, 0.78] },
      { id: 'int/stone-font', x: 0.5, y: 0.88, w: 0.16 },
      { id: 'int/hanging-censer', x: 0.5, y: 0.35, w: 0.09 },
      { id: 'int/wall-sconce', x: 0.08, y: 0.3, w: 0.05, repeat: 3, to: [0.08, 0.8] },
      { id: 'int/wall-sconce', x: 0.92, y: 0.3, w: 0.05, repeat: 3, to: [0.92, 0.8] },
    ],
  },
  {
    id: 'barracks', label: 'Barracks Dormitory', sub: 'Room kits',
    tags: ['guard', 'soldiers', 'beds'], cells: [9, 6], floor: 'plank', walls: true,
    doors: [['w', 0.5]],
    items: [
      { id: 'int/bunk-beds', x: 0.22, y: 0.2, w: 0.16, repeat: 4, to: [0.85, 0.2] },
      { id: 'int/bunk-beds', x: 0.22, y: 0.82, w: 0.16, repeat: 4, to: [0.85, 0.82] },
      { id: 'int/clothes-chest', x: 0.22, y: 0.38, w: 0.09, repeat: 4, to: [0.85, 0.38] },
      { id: 'int/weapon-rack', x: 0.55, y: 0.55, w: 0.26 },
      { id: 'int/armour-stand', x: 0.14, y: 0.55, w: 0.09 },
      { id: 'dgn/brazier', x: 0.9, y: 0.55, w: 0.08 },
      { id: 'int/coat-rack', x: 0.32, y: 0.55, w: 0.07 },
    ],
  },
  {
    id: 'prison-block', label: 'Prison Block', sub: 'Room kits',
    tags: ['jail', 'cells', 'dungeon'], cells: [9, 6], floor: 'rough-stone', walls: true,
    doors: [['e', 0.5]],
    items: [
      { id: 'dgn/portcullis', x: 0.18, y: 0.28, w: 0.16, rot: 90 },
      { id: 'dgn/portcullis', x: 0.42, y: 0.28, w: 0.16, rot: 90 },
      { id: 'dgn/portcullis', x: 0.18, y: 0.72, w: 0.16, rot: 90 },
      { id: 'dgn/portcullis', x: 0.42, y: 0.72, w: 0.16, rot: 90 },
      { id: 'int/cell-bunk-straw', x: 0.1, y: 0.2, w: 0.13, repeat: 2, to: [0.32, 0.2] },
      { id: 'int/cell-bunk-straw', x: 0.1, y: 0.8, w: 0.13, repeat: 2, to: [0.32, 0.8] },
      { id: 'int/manacle-wall-ring', x: 0.06, y: 0.5, w: 0.07, repeat: 2, to: [0.3, 0.5] },
      { id: 'int/guard-table-keys', x: 0.72, y: 0.4, w: 0.2 },
      { id: 'dgn/brazier', x: 0.86, y: 0.72, w: 0.09 },
      { id: 'dgn/bones', x: 0.24, y: 0.55, w: 0.12, jitter: 0.02 },
    ],
  },
  {
    id: 'throne-room', label: 'Throne Room', sub: 'Room kits',
    tags: ['court', 'castle', 'king'], cells: [9, 11], floor: 'flagstone', walls: true,
    doors: [['s', 0.5]],
    items: [
      { id: 'dgn/throne', x: 0.5, y: 0.12, w: 0.16 },
      { id: 'int/rug-runner', x: 0.5, y: 0.58, w: 0.2, rot: 90 },
      { id: 'dgn/pillar', x: 0.2, y: 0.34, w: 0.11, repeat: 4, to: [0.2, 0.86] },
      { id: 'dgn/pillar', x: 0.8, y: 0.34, w: 0.11, repeat: 4, to: [0.8, 0.86] },
      { id: 'int/tapestry', x: 0.06, y: 0.24, w: 0.16, rot: 90 },
      { id: 'int/tapestry', x: 0.94, y: 0.24, w: 0.16, rot: 90 },
      { id: 'dgn/brazier', x: 0.32, y: 0.2, w: 0.08 },
      { id: 'dgn/brazier', x: 0.68, y: 0.2, w: 0.08 },
      { id: 'int/long-bench', x: 0.12, y: 0.62, w: 0.16, rot: 90 },
      { id: 'int/long-bench', x: 0.88, y: 0.62, w: 0.16, rot: 90 },
      { id: 'int/floor-candelabra', x: 0.36, y: 0.9, w: 0.08 },
      { id: 'int/floor-candelabra', x: 0.64, y: 0.9, w: 0.08 },
    ],
  },
  {
    id: 'crypt-chamber', label: 'Crypt Chamber', sub: 'Room kits',
    tags: ['tomb', 'undead', 'burial'], cells: [7, 7], floor: 'rough-stone', walls: true,
    doors: [['s', 0.5]],
    items: [
      { id: 'dgn/sarcophagus', x: 0.5, y: 0.34, w: 0.16 },
      { id: 'dgn/sarcophagus', x: 0.2, y: 0.6, w: 0.13, rot: 90 },
      { id: 'dgn/sarcophagus', x: 0.8, y: 0.6, w: 0.13, rot: -90 },
      { id: 'dgn/pillar', x: 0.22, y: 0.2, w: 0.11 },
      { id: 'dgn/pillar', x: 0.78, y: 0.2, w: 0.11 },
      { id: 'dgn/bones', x: 0.42, y: 0.76, w: 0.16, jitter: 0.03 },
      { id: 'dgn/bones', x: 0.66, y: 0.84, w: 0.13, jitter: 0.03 },
      { id: 'dgn/rubble', x: 0.14, y: 0.86, w: 0.16, jitter: 0.02 },
      { id: 'dgn/brazier', x: 0.5, y: 0.12, w: 0.08 },
      { id: 'int/reliquary-casket', x: 0.5, y: 0.55, w: 0.12 },
    ],
  },
  {
    id: 'storeroom', label: 'Storeroom', sub: 'Room kits',
    tags: ['warehouse', 'supplies', 'crates'], cells: [7, 6], floor: 'plank', walls: true,
    doors: [['e', 0.5]],
    items: [
      { id: 'int/larder-shelves', x: 0.07, y: 0.4, w: 0.3, rot: 90 },
      { id: 'int/display-shelving', x: 0.5, y: 0.08, w: 0.5 },
      { id: 'dgn/crate', x: 0.24, y: 0.36, w: 0.11, jitter: 0.02 },
      { id: 'btl/crates-stack', x: 0.44, y: 0.42, w: 0.16, jitter: 0.02 },
      { id: 'dgn/barrel', x: 0.66, y: 0.36, w: 0.1, repeat: 3, to: [0.88, 0.36], jitter: 0.012 },
      { id: 'int/sacks-amphorae', x: 0.32, y: 0.72, w: 0.2, jitter: 0.02 },
      { id: 'dgn/crate', x: 0.62, y: 0.7, w: 0.12, jitter: 0.02 },
      { id: 'btl/crates-stack', x: 0.82, y: 0.78, w: 0.16, jitter: 0.02 },
      { id: 'int/hanging-lantern', x: 0.5, y: 0.55, w: 0.07 },
    ],
  },
  {
    id: 'guard-room', label: 'Guard Room', sub: 'Room kits',
    tags: ['watch', 'checkpoint'], cells: [5, 5], floor: 'flagstone', walls: true,
    doors: [['n', 0.5], ['s', 0.5]],
    items: [
      { id: 'dgn/table-round', x: 0.36, y: 0.44, w: 0.24 },
      { id: 'dgn/chair', x: 0.2, y: 0.36, w: 0.11, jitter: 0.015 },
      { id: 'dgn/chair', x: 0.5, y: 0.3, w: 0.11, jitter: 0.015 },
      { id: 'dgn/chair', x: 0.38, y: 0.62, w: 0.11, jitter: 0.015 },
      { id: 'int/weapon-rack', x: 0.82, y: 0.32, w: 0.24, rot: -90 },
      { id: 'int/armour-stand', x: 0.8, y: 0.72, w: 0.13 },
      { id: 'dgn/brazier', x: 0.2, y: 0.78, w: 0.11 },
      { id: 'int/wall-shelf', x: 0.5, y: 0.86, w: 0.16 },
    ],
  },
  {
    id: 'general-store', label: 'General Store', sub: 'Room kits',
    tags: ['shop', 'merchant', 'trade'], cells: [7, 6], floor: 'plank', walls: true,
    doors: [['s', 0.4]],
    items: [
      { id: 'int/shop-counter-scale', x: 0.5, y: 0.3, w: 0.4 },
      { id: 'int/display-shelving', x: 0.5, y: 0.09, w: 0.44 },
      { id: 'int/hanging-goods-rack', x: 0.1, y: 0.4, w: 0.16, rot: 90 },
      { id: 'int/market-crate-display', x: 0.24, y: 0.68, w: 0.2 },
      { id: 'int/sacks-amphorae', x: 0.56, y: 0.72, w: 0.18, jitter: 0.02 },
      { id: 'dgn/barrel', x: 0.84, y: 0.62, w: 0.1, repeat: 2, to: [0.84, 0.82], jitter: 0.012 },
      { id: 'int/wall-shelf', x: 0.9, y: 0.3, w: 0.13, rot: -90 },
      { id: 'int/hanging-lantern', x: 0.35, y: 0.5, w: 0.07 },
    ],
  },
  {
    id: 'noble-bedchamber', label: 'Noble Bedchamber', sub: 'Room kits',
    tags: ['bedroom', 'luxury'], cells: [7, 6], floor: 'plank', walls: true,
    doors: [['s', 0.35]],
    items: [
      { id: 'int/carpet-patterned', x: 0.52, y: 0.6, w: 0.46 },
      { id: 'int/four-poster-bed', x: 0.3, y: 0.28, w: 0.3 },
      { id: 'int/nightstand-candle', x: 0.5, y: 0.2, w: 0.09 },
      { id: 'int/wardrobe', x: 0.82, y: 0.16, w: 0.2 },
      { id: 'int/dresser-mirror', x: 0.88, y: 0.5, w: 0.18, rot: -90 },
      { id: 'int/folding-screen', x: 0.66, y: 0.74, w: 0.18 },
      { id: 'int/wash-stand', x: 0.16, y: 0.72, w: 0.12 },
      { id: 'int/tapestry', x: 0.5, y: 0.05, w: 0.2 },
      { id: 'int/potted-plant', x: 0.9, y: 0.86, w: 0.1 },
      { id: 'int/floor-candelabra', x: 0.1, y: 0.5, w: 0.09 },
    ],
  },
  {
    id: 'torture-chamber', label: 'Torture Chamber', sub: 'Room kits',
    tags: ['dungeon', 'grim', 'prison'], cells: [7, 6], floor: 'rough-stone', walls: true,
    doors: [['n', 0.5]],
    items: [
      { id: 'int/torture-rack', x: 0.42, y: 0.44, w: 0.32 },
      { id: 'int/iron-maiden', x: 0.82, y: 0.26, w: 0.16 },
      { id: 'int/stocks', x: 0.18, y: 0.24, w: 0.18 },
      { id: 'int/brazier-irons', x: 0.8, y: 0.66, w: 0.15 },
      { id: 'int/manacle-wall-ring', x: 0.08, y: 0.6, w: 0.08, repeat: 2, to: [0.08, 0.82] },
      { id: 'int/tool-bench', x: 0.45, y: 0.82, w: 0.24 },
      { id: 'dgn/bones', x: 0.2, y: 0.86, w: 0.13, jitter: 0.02 },
      { id: 'dgn/pit', x: 0.66, y: 0.86, w: 0.14 },
    ],
  },
  {
    id: 'dining-hall', label: 'Great Dining Hall', sub: 'Room kits',
    tags: ['feast', 'hall', 'banquet'], cells: [11, 7], floor: 'flagstone', walls: true,
    doors: [['w', 0.5], ['e', 0.5]],
    items: [
      { id: 'dgn/table-long', x: 0.5, y: 0.3, w: 0.5 },
      { id: 'dgn/table-long', x: 0.5, y: 0.66, w: 0.5 },
      { id: 'int/long-bench', x: 0.3, y: 0.86, w: 0.26 },
      { id: 'int/long-bench', x: 0.7, y: 0.86, w: 0.26 },
      { id: 'int/fireplace-rug', x: 0.5, y: 0.09, w: 0.16 },
      { id: 'int/spilled-tankards', x: 0.36, y: 0.3, w: 0.06, jitter: 0.02 },
      { id: 'int/spilled-tankards', x: 0.62, y: 0.66, w: 0.06, jitter: 0.02 },
      { id: 'dgn/chandelier', x: 0.32, y: 0.48, w: 0.12 },
      { id: 'dgn/chandelier', x: 0.68, y: 0.48, w: 0.12 },
      { id: 'int/tapestry', x: 0.14, y: 0.06, w: 0.14 },
      { id: 'int/tapestry', x: 0.86, y: 0.06, w: 0.14 },
    ],
  },

  // --- Outdoor set pieces --------------------------------------------------
  {
    id: 'camp-site', label: 'Camp Site', sub: 'Set pieces',
    tags: ['camp', 'rest', 'travel'], cells: [9, 8], floor: 'dirt',
    kinds: ['battle', 'operational'],
    items: [
      { id: 'dgn/campfire', x: 0.5, y: 0.5, w: 0.13 },
      { id: 'btl/tent', x: 0.24, y: 0.3, w: 0.2, rot: 18, jitter: 0.01 },
      { id: 'btl/tent', x: 0.74, y: 0.32, w: 0.2, rot: -12, jitter: 0.01 },
      { id: 'btl/tent', x: 0.6, y: 0.76, w: 0.18, rot: 6, jitter: 0.01 },
      { id: 'btl/log', x: 0.3, y: 0.62, w: 0.18, rot: 24, jitter: 0.02 },
      { id: 'btl/log', x: 0.68, y: 0.56, w: 0.16, rot: -40, jitter: 0.02 },
      { id: 'btl/wagon', x: 0.2, y: 0.82, w: 0.24, rot: -8 },
      { id: 'dgn/crate', x: 0.86, y: 0.62, w: 0.09, jitter: 0.02 },
      { id: 'dgn/barrel', x: 0.9, y: 0.76, w: 0.08, jitter: 0.02 },
      { id: 'nat/oak-canopy-top', x: 0.1, y: 0.14, w: 0.22, jitter: 0.015 },
      { id: 'nat/conifer-top', x: 0.9, y: 0.12, w: 0.18, jitter: 0.015 },
      { id: 'nat/tall-grass-clump-top', x: 0.42, y: 0.9, w: 0.12, jitter: 0.03 },
    ],
  },
  {
    id: 'bandit-ambush', label: 'Bandit Ambush', sub: 'Set pieces',
    tags: ['encounter', 'road', 'combat'], cells: [11, 8], floor: 'dirt',
    kinds: ['battle', 'operational'],
    items: [
      { id: 'str/barricade', x: 0.46, y: 0.46, w: 0.26, rot: 8 },
      { id: 'nat/boulder-cluster-top', x: 0.16, y: 0.24, w: 0.22, jitter: 0.02 },
      { id: 'nat/boulder-single-top', x: 0.78, y: 0.7, w: 0.14, jitter: 0.02 },
      { id: 'nat/boulder-cluster-top', x: 0.86, y: 0.26, w: 0.18, jitter: 0.02 },
      { id: 'btl/broken-wagon', x: 0.62, y: 0.34, w: 0.22, rot: -18 },
      { id: 'nat/oak-canopy-top', x: 0.08, y: 0.72, w: 0.2, jitter: 0.02 },
      { id: 'nat/thorn-bush-top', x: 0.34, y: 0.78, w: 0.14, jitter: 0.03 },
      { id: 'nat/thorn-bush-top', x: 0.56, y: 0.86, w: 0.12, jitter: 0.03 },
      { id: 'btl/blood-splatter', x: 0.5, y: 0.62, w: 0.14, jitter: 0.03 },
      { id: 'btl/log', x: 0.7, y: 0.56, w: 0.16, rot: 66 },
      { id: 'dgn/campfire', x: 0.9, y: 0.5, w: 0.1 },
    ],
  },
  {
    id: 'farmstead-yard', label: 'Farmstead Yard', sub: 'Set pieces',
    tags: ['farm', 'rural', 'village'], cells: [12, 10], floor: 'dirt',
    kinds: ['battle', 'city'],
    items: [
      { id: 'str/cottage-td', x: 0.24, y: 0.24, w: 0.3 },
      { id: 'str/barn-td', x: 0.74, y: 0.26, w: 0.32 },
      { id: 'str/granary-td', x: 0.86, y: 0.66, w: 0.16 },
      { id: 'dgn/well', x: 0.46, y: 0.5, w: 0.1 },
      { id: 'btl/fence', x: 0.12, y: 0.68, w: 0.22, repeat: 4, to: [0.72, 0.68] },
      { id: 'btl/wagon', x: 0.34, y: 0.78, w: 0.18, rot: 12 },
      { id: 'veg/wheat-field', x: 0.24, y: 0.9, w: 0.34, jitter: 0.01 },
      { id: 'btl/crates-stack', x: 0.6, y: 0.58, w: 0.11, jitter: 0.02 },
      { id: 'nat/oak-canopy-top', x: 0.06, y: 0.46, w: 0.16, jitter: 0.02 },
      { id: 'int/firewood-stack', x: 0.42, y: 0.34, w: 0.09 },
      { id: 'nat/mud-tracks-top', x: 0.62, y: 0.84, w: 0.2, jitter: 0.02 },
    ],
  },
  {
    id: 'graveyard-plot', label: 'Graveyard Plot', sub: 'Set pieces',
    tags: ['undead', 'burial', 'grim'], cells: [9, 8], floor: 'grass',
    kinds: ['battle', 'city'],
    items: [
      { id: 'town/graveyard', x: 0.5, y: 0.46, w: 0.6 },
      { id: 'town/shrine', x: 0.5, y: 0.14, w: 0.16 },
      { id: 'btl/fence', x: 0.1, y: 0.9, w: 0.2, repeat: 5, to: [0.9, 0.9] },
      { id: 'nat/dead-tree-top', x: 0.12, y: 0.32, w: 0.2, jitter: 0.02 },
      { id: 'nat/dead-tree-top', x: 0.88, y: 0.7, w: 0.18, jitter: 0.02 },
      { id: 'dgn/rubble', x: 0.72, y: 0.24, w: 0.14, jitter: 0.03 },
      { id: 'nat/moss-patch-top', x: 0.3, y: 0.74, w: 0.16, jitter: 0.03 },
      { id: 'nat/leaf-litter-top', x: 0.62, y: 0.8, w: 0.18, jitter: 0.03 },
    ],
  },
  {
    id: 'market-row', label: 'Market Row', sub: 'Set pieces',
    tags: ['town', 'trade', 'crowd'], cells: [14, 8], floor: 'flagstone',
    kinds: ['battle', 'city'],
    items: [
      { id: 'str/market-stall-td', x: 0.14, y: 0.2, w: 0.15, repeat: 5, to: [0.86, 0.2], jitter: 0.008 },
      { id: 'str/market-stall-td', x: 0.2, y: 0.8, w: 0.15, repeat: 4, to: [0.8, 0.8], jitter: 0.008 },
      { id: 'dgn/fountain', x: 0.5, y: 0.5, w: 0.14 },
      { id: 'int/market-crate-display', x: 0.28, y: 0.38, w: 0.1, jitter: 0.02 },
      { id: 'int/sacks-amphorae', x: 0.68, y: 0.62, w: 0.11, jitter: 0.02 },
      { id: 'dgn/barrel', x: 0.82, y: 0.42, w: 0.07, repeat: 2, to: [0.9, 0.56], jitter: 0.01 },
      { id: 'btl/wagon', x: 0.12, y: 0.55, w: 0.14, rot: 90 },
      { id: 'int/hanging-goods-rack', x: 0.42, y: 0.68, w: 0.1 },
    ],
  },
  {
    id: 'dock-landing', label: 'Dock Landing', sub: 'Set pieces',
    tags: ['harbour', 'water', 'boats'], cells: [12, 9], floor: 'none',
    kinds: ['battle', 'city'],
    items: [
      { id: 'nat/sea-foam-top', x: 0.5, y: 0.2, w: 1.0 },
      { id: 'str/dock', x: 0.4, y: 0.6, w: 0.44 },
      { id: 'str/jetty', x: 0.78, y: 0.5, w: 0.2, rot: 90 },
      { id: 'str/rowboat', x: 0.2, y: 0.34, w: 0.14, rot: -20, jitter: 0.01 },
      { id: 'str/sailing-boat', x: 0.66, y: 0.24, w: 0.22, rot: 8 },
      { id: 'dgn/crate', x: 0.32, y: 0.78, w: 0.09, jitter: 0.02 },
      { id: 'btl/crates-stack', x: 0.5, y: 0.84, w: 0.13, jitter: 0.02 },
      { id: 'dgn/barrel', x: 0.16, y: 0.8, w: 0.08, repeat: 2, to: [0.24, 0.9], jitter: 0.01 },
      { id: 'str/warehouse-td', x: 0.86, y: 0.84, w: 0.24 },
      { id: 'int/hanging-lantern', x: 0.6, y: 0.68, w: 0.06 },
    ],
  },
  {
    id: 'bridge-crossing', label: 'Bridge Crossing', sub: 'Set pieces',
    tags: ['river', 'road', 'chokepoint'], cells: [12, 8], floor: 'grass',
    kinds: ['battle', 'operational'],
    items: [
      { id: 'nat/stream-segment-top', x: 0.5, y: 0.5, w: 1.0, rot: 0 },
      { id: 'str/bridge-stone-td', x: 0.5, y: 0.5, w: 0.26, rot: 90 },
      { id: 'nat/reed-bed-top', x: 0.18, y: 0.36, w: 0.14, jitter: 0.03 },
      { id: 'nat/reed-bed-top', x: 0.82, y: 0.64, w: 0.14, jitter: 0.03 },
      { id: 'nat/boulder-cluster-top', x: 0.26, y: 0.72, w: 0.16, jitter: 0.02 },
      { id: 'nat/willow-canopy-top', x: 0.14, y: 0.16, w: 0.2, jitter: 0.02 },
      { id: 'nat/oak-canopy-top', x: 0.88, y: 0.2, w: 0.18, jitter: 0.02 },
      { id: 'str/well-head', x: 0.72, y: 0.86, w: 0.1 },
      { id: 'nat/tall-grass-clump-top', x: 0.42, y: 0.86, w: 0.12, jitter: 0.03 },
    ],
  },
  {
    id: 'woodland-clearing', label: 'Woodland Clearing', sub: 'Set pieces',
    tags: ['forest', 'encounter', 'nature'], cells: [12, 10], floor: 'grass',
    kinds: ['battle'],
    items: [
      { id: 'nat/oak-canopy-top', x: 0.1, y: 0.16, w: 0.2, jitter: 0.02 },
      { id: 'nat/oak-canopy-top', x: 0.3, y: 0.08, w: 0.18, jitter: 0.02 },
      { id: 'nat/conifer-top', x: 0.62, y: 0.1, w: 0.16, jitter: 0.02 },
      { id: 'nat/conifer-top', x: 0.86, y: 0.2, w: 0.18, jitter: 0.02 },
      { id: 'nat/birch-canopy-top', x: 0.92, y: 0.56, w: 0.16, jitter: 0.02 },
      { id: 'nat/oak-canopy-top', x: 0.8, y: 0.88, w: 0.2, jitter: 0.02 },
      { id: 'nat/conifer-top', x: 0.5, y: 0.94, w: 0.16, jitter: 0.02 },
      { id: 'nat/birch-canopy-top', x: 0.16, y: 0.86, w: 0.16, jitter: 0.02 },
      { id: 'nat/oak-canopy-top', x: 0.06, y: 0.54, w: 0.18, jitter: 0.02 },
      { id: 'nat/fallen-tree-top', x: 0.38, y: 0.6, w: 0.24, rot: 22 },
      { id: 'nat/boulder-single-top', x: 0.66, y: 0.46, w: 0.12, jitter: 0.02 },
      { id: 'nat/fern-cluster-top', x: 0.52, y: 0.34, w: 0.12, jitter: 0.03 },
      { id: 'nat/flower-meadow-top', x: 0.62, y: 0.7, w: 0.16, jitter: 0.03 },
      { id: 'nat/tall-grass-clump-top', x: 0.28, y: 0.42, w: 0.12, jitter: 0.03 },
      { id: 'nat/hollow-trunk-top', x: 0.84, y: 0.68, w: 0.13 },
    ],
  },
  {
    id: 'ruined-shrine', label: 'Ruined Shrine', sub: 'Set pieces',
    tags: ['ruins', 'overgrown', 'encounter'], cells: [10, 9], floor: 'grass',
    kinds: ['battle', 'dungeon'],
    items: [
      { id: 'str/ruin-shell-td', x: 0.48, y: 0.44, w: 0.5 },
      { id: 'dgn/altar', x: 0.48, y: 0.4, w: 0.2 },
      { id: 'dgn/pillar', x: 0.24, y: 0.24, w: 0.1 },
      { id: 'dgn/pillar', x: 0.74, y: 0.66, w: 0.1 },
      { id: 'dgn/rubble', x: 0.66, y: 0.28, w: 0.18, jitter: 0.03 },
      { id: 'dgn/rubble', x: 0.3, y: 0.68, w: 0.16, jitter: 0.03 },
      { id: 'nat/moss-patch-top', x: 0.5, y: 0.6, w: 0.18, jitter: 0.03 },
      { id: 'nat/bramble-thicket-top', x: 0.86, y: 0.4, w: 0.18, jitter: 0.03 },
      { id: 'nat/oak-canopy-top', x: 0.08, y: 0.8, w: 0.2, jitter: 0.02 },
      { id: 'nat/root-tangle-top', x: 0.2, y: 0.5, w: 0.14, jitter: 0.03 },
      { id: 'veg/vines', x: 0.72, y: 0.86, w: 0.16, jitter: 0.03 },
    ],
  },
  {
    id: 'siege-battery', label: 'Siege Battery', sub: 'Set pieces',
    tags: ['war', 'siege', 'artillery'], cells: [12, 8], floor: 'dirt',
    kinds: ['battle', 'operational'],
    items: [
      { id: 'str/rampart', x: 0.5, y: 0.18, w: 1.0 },
      { id: 'str/trebuchet', x: 0.24, y: 0.5, w: 0.2 },
      { id: 'str/catapult', x: 0.56, y: 0.52, w: 0.16 },
      { id: 'btl/ballista', x: 0.8, y: 0.48, w: 0.14 },
      { id: 'str/barricade', x: 0.4, y: 0.34, w: 0.18, jitter: 0.01 },
      { id: 'btl/crates-stack', x: 0.66, y: 0.72, w: 0.12, jitter: 0.02 },
      { id: 'dgn/barrel', x: 0.34, y: 0.74, w: 0.08, repeat: 3, to: [0.5, 0.82], jitter: 0.012 },
      { id: 'btl/tent', x: 0.9, y: 0.78, w: 0.16, rot: -8 },
      { id: 'dgn/campfire', x: 0.14, y: 0.78, w: 0.1 },
      { id: 'btl/scorch', x: 0.72, y: 0.28, w: 0.16, jitter: 0.03 },
    ],
  },
  {
    id: 'watchpost', label: 'Road Watchpost', sub: 'Set pieces',
    tags: ['guard', 'road', 'checkpoint'], cells: [9, 7], floor: 'dirt',
    kinds: ['battle', 'operational'],
    items: [
      { id: 'str/guardpost-td', x: 0.28, y: 0.36, w: 0.26 },
      { id: 'str/palisade', x: 0.5, y: 0.08, w: 0.5 },
      { id: 'str/barricade', x: 0.72, y: 0.5, w: 0.2, rot: 90 },
      { id: 'dgn/campfire', x: 0.46, y: 0.62, w: 0.11 },
      { id: 'btl/log', x: 0.34, y: 0.72, w: 0.16, rot: 12 },
      { id: 'int/weapon-rack', x: 0.86, y: 0.3, w: 0.16, rot: -90 },
      { id: 'btl/tent', x: 0.86, y: 0.78, w: 0.18, rot: 10 },
      { id: 'dgn/crate', x: 0.16, y: 0.76, w: 0.1, jitter: 0.02 },
      { id: 'nat/conifer-top', x: 0.06, y: 0.16, w: 0.16, jitter: 0.02 },
    ],
  },
];

export const PREFAB_ASSETS: AssetDef[] = PREFABS.map(toAsset);
