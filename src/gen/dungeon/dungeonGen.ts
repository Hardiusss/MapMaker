/**
 * Dungeon generator: BSP room partitioning, corridor carving, doors, dressing,
 * lighting and a full VTT wall set.
 */
import type { MapDocument, Wall, Vec2 } from '../../core/types';
import { createDocument, objectLayerByRole } from '../../core/doc';
import { RNG } from '../../core/rng';
import { createNamer, ROOM_PURPOSES, DUNGEON_HAZARDS } from '../names';
import { makeGrid, at, isOpen, traceWalls, paintDungeon, type CellGrid, type DoorSpec } from './grid';
import { makeStamp, makeStampAuto, makeText, makeLight, makeNote } from '../../core/factories';
import { paletteById, mix, rgba } from '../../core/color';
import { layoutLabels } from '../labelLayout';

export type DungeonLayout = 'classic' | 'sprawl' | 'tomb' | 'keep' | 'mine' | 'temple';

export interface DungeonGenOptions {
  width: number;
  height: number;
  cell: number;
  seed: number;
  layout: DungeonLayout;
  /** Approximate number of rooms. */
  rooms: number;
  roomMin: number;
  roomMax: number;
  /** 0 = strict tree of corridors, 1 = lots of loops. */
  loopiness: number;
  corridorWidth: number;
  doors: boolean;
  secretDoors: number;
  furnish: boolean;
  lights: boolean;
  labels: boolean;
  notes: boolean;
  paletteId: string;
  floorTexture: string;
  wallTexture: string;
  edgeRoughness: number;
  title?: string;
}

export const DEFAULT_DUNGEON_OPTIONS: DungeonGenOptions = {
  width: 2800, height: 2100, cell: 70, seed: 1,
  layout: 'classic', rooms: 12, roomMin: 3, roomMax: 9,
  loopiness: 0.25, corridorWidth: 1, doors: true, secretDoors: 1,
  furnish: true, lights: true, labels: true, notes: true,
  paletteId: 'dungeon', floorTexture: 'stone-floor', wallTexture: 'cliff',
  edgeRoughness: 0,
};

export interface Room {
  index: number;
  x: number; y: number; w: number; h: number;
  purpose: string;
  shape: 'rect' | 'round' | 'cross' | 'notched';
}

export interface DungeonResult {
  doc: MapDocument;
  grid: CellGrid;
  rooms: Room[];
  walls: Wall[];
}

// ---------------------------------------------------------------------------
// BSP
// ---------------------------------------------------------------------------

interface Node {
  x: number; y: number; w: number; h: number;
  left?: Node; right?: Node;
  room?: Room;
}

function split(node: Node, minSize: number, rng: RNG, depth: number, maxDepth: number): void {
  if (depth >= maxDepth) return;
  const canH = node.h >= minSize * 2 + 1;
  const canV = node.w >= minSize * 2 + 1;
  if (!canH && !canV) return;
  const horizontal = canH && (!canV || (node.h / node.w > 1.25 ? true : rng.bool()));

  if (horizontal) {
    const cut = rng.int(minSize, node.h - minSize);
    node.left = { x: node.x, y: node.y, w: node.w, h: cut };
    node.right = { x: node.x, y: node.y + cut, w: node.w, h: node.h - cut };
  } else {
    const cut = rng.int(minSize, node.w - minSize);
    node.left = { x: node.x, y: node.y, w: cut, h: node.h };
    node.right = { x: node.x + cut, y: node.y, w: node.w - cut, h: node.h };
  }
  split(node.left!, minSize, rng, depth + 1, maxDepth);
  split(node.right!, minSize, rng, depth + 1, maxDepth);
}

function leaves(node: Node, out: Node[] = []): Node[] {
  if (!node.left && !node.right) { out.push(node); return out; }
  if (node.left) leaves(node.left, out);
  if (node.right) leaves(node.right, out);
  return out;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

/**
 * Per-layout behaviour.
 *
 * Without this the "style" dropdown was decorative — every layout produced the
 * same BSP dungeon with slightly different furniture. Each entry now changes
 * how the space is cut up, how it is connected, and whether it is symmetric.
 */
interface LayoutRules {
  /** Mirror the left half onto the right for a formal, built structure. */
  symmetry: 'none' | 'mirrorX';
  /** Multiplier on the BSP minimum leaf size — bigger means fewer, larger rooms. */
  leafScale: number;
  /** Corridors wander instead of running in straight L-bends. */
  windingCorridors: boolean;
  /** Extra loop connections beyond the option value. */
  extraLoops: number;
  /** Bias applied to the requested room count. */
  roomScale: number;
  /** Preferred corridor width, overriding the option when wider. */
  minCorridor: number;
  /** Rooms hug the leaf they were cut from instead of floating inside it. */
  fillLeaves: boolean;
}

const LAYOUT_RULES: Record<DungeonLayout, LayoutRules> = {
  classic: { symmetry: 'none', leafScale: 1, windingCorridors: false, extraLoops: 0, roomScale: 1, minCorridor: 1, fillLeaves: false },
  sprawl: { symmetry: 'none', leafScale: 0.75, windingCorridors: false, extraLoops: 4, roomScale: 1.5, minCorridor: 1, fillLeaves: false },
  tomb: { symmetry: 'mirrorX', leafScale: 1.15, windingCorridors: false, extraLoops: 0, roomScale: 0.8, minCorridor: 1, fillLeaves: false },
  keep: { symmetry: 'none', leafScale: 1.3, windingCorridors: false, extraLoops: 1, roomScale: 0.85, minCorridor: 2, fillLeaves: true },
  mine: { symmetry: 'none', leafScale: 0.95, windingCorridors: true, extraLoops: 1, roomScale: 1.1, minCorridor: 1, fillLeaves: false },
  temple: { symmetry: 'mirrorX', leafScale: 1.4, windingCorridors: false, extraLoops: 1, roomScale: 0.7, minCorridor: 2, fillLeaves: false },
};

export function generateDungeon(opts: Partial<DungeonGenOptions> = {}): DungeonResult {
  const o: DungeonGenOptions = { ...DEFAULT_DUNGEON_OPTIONS, ...opts };
  const rules = LAYOUT_RULES[o.layout] || LAYOUT_RULES.classic;
  const rng = new RNG(o.seed);
  const namer = createNamer(o.seed, o.layout === 'tomb' || o.layout === 'temple' ? 'imperial' : 'common');

  const margin = 1;
  const cols = Math.max(12, Math.floor(o.width / o.cell));
  const rows = Math.max(10, Math.floor(o.height / o.cell));
  const g = makeGrid(cols, rows);

  // Symmetric layouts are generated in the left half and mirrored, so the axis
  // sits exactly on the map's centre line.
  const mirror = rules.symmetry === 'mirrorX';
  const workCols = mirror ? Math.floor(cols / 2) : cols;

  const targetRooms = Math.max(2, Math.round(o.rooms * rules.roomScale * (mirror ? 0.55 : 1)));
  const maxDepth = Math.max(2, Math.round(Math.log2(Math.max(2, targetRooms))));
  const root: Node = { x: margin, y: margin, w: workCols - margin * (mirror ? 1 : 2), h: rows - margin * 2 };
  split(root, Math.max(Math.round((o.roomMin + 2) * rules.leafScale), 6), rng, 0, maxDepth + 1);

  const leafList = leaves(root);
  const rooms: Room[] = [];
  const nextPurpose = purposeDealer(o.layout, rng);

  const corridorWidth = Math.max(o.corridorWidth, rules.minCorridor);

  for (const leaf of leafList) {
    if (rooms.length >= targetRooms * 1.6) break;
    const maxW = Math.min(o.roomMax, leaf.w - 2);
    const maxH = Math.min(o.roomMax, leaf.h - 2);
    if (maxW < o.roomMin || maxH < o.roomMin) continue;
    // A keep's chambers fill their plot; a warren's rooms float inside it.
    const w = rules.fillLeaves ? maxW : rng.int(o.roomMin, maxW);
    const h = rules.fillLeaves ? maxH : rng.int(o.roomMin, maxH);
    const x = leaf.x + (rules.fillLeaves ? 1 : rng.int(1, Math.max(1, leaf.w - w - 1)));
    const y = leaf.y + (rules.fillLeaves ? 1 : rng.int(1, Math.max(1, leaf.h - h - 1)));
    const shape = pickShape(rng, w, h, o.layout);
    const room: Room = { index: rooms.length, x, y, w, h, purpose: nextPurpose(), shape };
    rooms.push(room);
    leaf.room = room;
    carveRoom(g, room);
  }

  // --- Corridors -----------------------------------------------------------
  const doors: DoorSpec[] = [];
  connect(root, g, rng, { ...o, corridorWidth }, rules.windingCorridors);

  // Extra loops so the map is not a pure tree.
  const extra = Math.round(rooms.length * o.loopiness) + rules.extraLoops;
  for (let i = 0; i < extra; i++) {
    const a = rng.pick(rooms), b = rng.pick(rooms);
    if (a === b) continue;
    carveCorridor(g, roomCenter(a), roomCenter(b), corridorWidth, rng, rules.windingCorridors);
  }

  // --- Symmetry ------------------------------------------------------------
  if (mirror) {
    mirrorGrid(g, workCols);
    // A processional spine down the axis ties the two halves together.
    const axis = Math.floor(cols / 2);
    for (let y = 2; y < rows - 2; y++) {
      for (let dx = -1; dx <= 1; dx++) {
        const i = at(g, axis + dx, y);
        if (!g.open[i]) { g.open[i] = 1; g.corridor[i] = 1; }
      }
    }

    // …and spurs off it, or the wings end up as two dungeons that merely share
    // a page. Each spur runs outward until it meets carved floor.
    const spurs = 4;
    for (let s = 0; s < spurs; s++) {
      const y = Math.round(((s + 0.5) / spurs) * (rows - 6)) + 3;
      for (const dir of [-1, 1]) {
        let x = axis + dir * 2;
        let guard = 0;
        while (x > 1 && x < cols - 2 && guard++ < cols) {
          const i = at(g, x, y);
          if (g.open[i] && !g.corridor[i]) break;   // reached a room
          if (g.open[i] && g.corridor[i] && guard > 2) break; // met a corridor
          g.open[i] = 1;
          g.corridor[i] = 1;
          x += dir;
        }
      }
    }
    // Reflect the room list so labels, furnishing and lighting cover both sides.
    const reflected: Room[] = rooms.map((r, i) => ({
      ...r,
      index: rooms.length + i,
      x: cols - (r.x + r.w),
      purpose: r.purpose,
    }));
    for (const r of reflected) {
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          if (x < 0 || x >= g.cols || y < 0 || y >= g.rows) continue;
          const i = at(g, x, y);
          if (g.open[i]) g.room[i] = r.index;
        }
      }
    }
    rooms.push(...reflected);
  }

  // --- Doors ---------------------------------------------------------------
  if (o.doors) findDoors(g, rooms, doors, rng, o);

  // --- Document ------------------------------------------------------------
  const doc = createDocument({
    kind: 'dungeon',
    width: cols * o.cell,
    height: rows * o.cell,
    title: o.title || namer.dungeon(),
    paletteId: o.paletteId,
    gridOverride: { size: o.cell, type: 'square', visible: true, snap: true },
  });
  doc.meta.seed = o.seed;
  doc.meta.description = `${o.layout} dungeon, ${rooms.length} rooms. Seed ${o.seed}.`;
  doc.lighting.darkness = 1;
  doc.lighting.globalLight = false;

  paintDungeon(doc, g, {
    paletteId: o.paletteId,
    floorTexture: o.floorTexture,
    wallTexture: o.wallTexture,
    voidColor: '#0d0b0a',
    wallThickness: o.cell * 0.42,
    wallShadow: o.cell * 0.28,
    edgeRoughness: o.edgeRoughness,
    seed: o.seed,
    grid: { originX: 0, originY: 0, cell: o.cell },
  });

  const walls = traceWalls(g, o.cell, doors);
  const wl = doc.layers.find((l) => l.kind === 'wall');
  if (wl && wl.kind === 'wall') wl.walls = walls;

  if (o.doors) drawDoors(doc, doors, o);
  addDungeonFeatures(doc, g, rooms, o, rng);
  if (o.furnish) furnishRooms(doc, rooms, o, rng);
  if (o.lights) lightRooms(doc, g, rooms, o, rng);
  if (o.labels) {
    labelRooms(doc, rooms, o, rng);
    layoutLabels(doc, { padding: o.cell * 0.08, minorSizeBelow: o.cell * 0.4 });
  }
  if (o.notes) noteRooms(doc, rooms, o, rng);

  return { doc, grid: g, rooms, walls };
}

/**
 * Rooms that suit each layout. A tomb full of kitchens and kennels reads as a
 * random dungeon with a tomb-shaped floor plan; the room list is most of what
 * sells the theme.
 */
const PURPOSES_BY_LAYOUT: Partial<Record<DungeonLayout, string[]>> = {
  tomb: ['Crypt', 'Sepulchre', 'Ossuary', 'Antechamber', 'Vault', 'Shrine', 'Gallery', 'Treasury', 'Chapel', 'Sarcophagus Hall'],
  temple: ['Chapel', 'Shrine', 'Refectory', 'Scriptorium', 'Library', 'Antechamber', 'Gallery', 'Summoning Circle', 'Cistern', 'Audience Hall'],
  keep: ['Barracks', 'Armoury', 'Guard Post', 'Mess Hall', 'Kitchen', 'Storeroom', 'Throne Room', 'Prison', 'Treasury', 'Well Room'],
  mine: ['Storeroom', 'Workshop', 'Forge', 'Cistern', 'Mushroom Farm', 'Guard Post', 'Barracks', 'Vault', 'Kennels'],
};

function purposePool(layout: DungeonLayout): string[] {
  return PURPOSES_BY_LAYOUT[layout] || ROOM_PURPOSES;
}

/**
 * Deals room purposes without replacement.
 *
 * Picking independently at random gives a dungeon with two throne rooms and
 * three kitchens roughly as often as not, and a GM reading the key has to
 * decide which one the plot meant. Dealing from a shuffled deck and only
 * reshuffling once it is empty keeps every purpose unique until there are more
 * rooms than there are things for rooms to be.
 */
function purposeDealer(layout: DungeonLayout, rng: RNG): () => string {
  const source = purposePool(layout);
  let deck: string[] = [];
  return () => {
    if (!deck.length) {
      deck = source.slice();
      rng.shuffle(deck);
    }
    return deck.pop()!;
  };
}

function pickShape(rng: RNG, w: number, h: number, layout: DungeonLayout): Room['shape'] {
  if (layout === 'mine') return 'notched';
  if (Math.abs(w - h) <= 1 && w >= 5 && rng.bool(0.3)) return 'round';
  if (w >= 6 && h >= 6 && rng.bool(0.15)) return 'cross';
  if (rng.bool(0.2)) return 'notched';
  return 'rect';
}

function carveRoom(g: CellGrid, r: Room): void {
  const cx = r.x + (r.w - 1) / 2, cy = r.y + (r.h - 1) / 2;
  const rad = Math.min(r.w, r.h) / 2;
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      let on = true;
      if (r.shape === 'round') {
        on = Math.hypot((x - cx) / (r.w / 2), (y - cy) / (r.h / 2)) <= 1.02;
      } else if (r.shape === 'cross') {
        const inX = Math.abs(x - cx) <= r.w / 4;
        const inY = Math.abs(y - cy) <= r.h / 4;
        on = inX || inY;
      } else if (r.shape === 'notched') {
        const cornerX = x < r.x + 1 || x > r.x + r.w - 2;
        const cornerY = y < r.y + 1 || y > r.y + r.h - 2;
        on = !(cornerX && cornerY);
      }
      if (!on) continue;
      const i = at(g, x, y);
      g.open[i] = 1;
      g.room[i] = r.index;
      g.corridor[i] = 0;
    }
  }
}

function roomCenter(r: Room): Vec2 {
  return { x: Math.floor(r.x + r.w / 2), y: Math.floor(r.y + r.h / 2) };
}

function connect(node: Node, g: CellGrid, rng: RNG, o: DungeonGenOptions, winding = false): Vec2 | null {
  if (node.room) return roomCenter(node.room);
  const a = node.left ? connect(node.left, g, rng, o, winding) : null;
  const b = node.right ? connect(node.right, g, rng, o, winding) : null;
  if (a && b) carveCorridor(g, a, b, o.corridorWidth, rng, winding);
  return a || b;
}

function carveCorridor(g: CellGrid, a: Vec2, b: Vec2, width: number, rng: RNG, winding = false): void {
  const half = Math.max(0, Math.floor((width - 1) / 2));
  const put = (x: number, y: number) => {
    for (let dy = -half; dy <= half; dy++) {
      for (let dx = -half; dx <= half; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 1 || ny < 1 || nx >= g.cols - 1 || ny >= g.rows - 1) continue;
        const i = at(g, nx, ny);
        if (!g.open[i]) { g.open[i] = 1; g.corridor[i] = 1; }
      }
    }
  };

  if (winding) {
    // A drunkard's walk biased towards the target — mine workings follow the
    // seam, not the surveyor's straight line.
    let x = a.x, y = a.y;
    let guard = 0;
    while ((x !== b.x || y !== b.y) && guard++ < (g.cols + g.rows) * 3) {
      put(x, y);
      const dx = Math.sign(b.x - x), dy = Math.sign(b.y - y);
      // Enough wander to look hand-dug, not so much that the whole level
      // dissolves into one open cavern.
      if (rng.bool(0.08)) {
        x += rng.int(-1, 1);
        y += rng.int(-1, 1);
      } else if (dx !== 0 && (dy === 0 || rng.bool())) {
        x += dx;
      } else if (dy !== 0) {
        y += dy;
      }
      x = Math.max(1, Math.min(g.cols - 2, x));
      y = Math.max(1, Math.min(g.rows - 2, y));
    }
    put(b.x, b.y);
    return;
  }

  const horizontalFirst = rng.bool();
  if (horizontalFirst) {
    for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) put(x, a.y);
    for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) put(b.x, y);
  } else {
    for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) put(a.x, y);
    for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) put(x, b.y);
  }
}

/** Reflect the carved left half of the grid onto the right. */
function mirrorGrid(g: CellGrid, workCols: number): void {
  for (let y = 0; y < g.rows; y++) {
    for (let x = 0; x < workCols; x++) {
      const src = at(g, x, y);
      const mx = g.cols - 1 - x;
      if (mx <= x) continue;
      const dst = at(g, mx, y);
      g.open[dst] = g.open[src];
      g.corridor[dst] = g.corridor[src];
    }
  }
}

/**
 * Draw the doors the wall tracer already knows about.
 *
 * `findDoors` has always fed `traceWalls`, so the exported Foundry scene had
 * working, openable doors — but nothing put a door on the picture, so the map a
 * GM prints or shares as an image showed every room standing wide open. The
 * geometry is the same either way; this only renders it.
 */
function drawDoors(doc: MapDocument, doors: DoorSpec[], o: DungeonGenOptions): void {
  const layer = doc.layers.find((l) => l.kind === 'object' && l.name === 'Doors & Stairs')
    || objectLayerByRole(doc, 'features');
  if (!layer || layer.kind !== 'object') return;

  for (const d of doors) {
    const asset = d.kind === 'secretDoor'
      ? 'dgn/secret-door'
      : d.state === 'locked' ? 'dgn/portcullis' : 'dgn/door';
    // A door spans the opening and is thin across it. The assets are drawn
    // lying east-west, so `makeStampAuto` keeps that proportion and a doorway
    // in a side wall is turned a quarter turn — forcing them into a square box
    // stretches a door leaf into a panel as tall as the corridor is wide.
    layer.objects.push(makeStampAuto(asset, d.x * o.cell, d.y * o.cell, o.cell * 1.06, {
      seed: Math.round(d.x * 131 + d.y * 977),
      rotation: d.horizontal ? 0 : 90,
      // Secret doors belong to the GM's copy of the map, not the players'.
      opacity: d.kind === 'secretDoor' ? 0.85 : 1,
      name: d.kind === 'secretDoor'
        ? 'Secret door'
        : d.state === 'locked' ? 'Locked door' : 'Door',
    }));
  }
}

/** Place doors where a corridor meets a room. */
function findDoors(g: CellGrid, rooms: Room[], doors: DoorSpec[], rng: RNG, o: DungeonGenOptions): void {
  const perRoom = new Map<number, number>();
  const seen = new Set<string>();

  for (let y = 1; y < g.rows - 1; y++) {
    for (let x = 1; x < g.cols - 1; x++) {
      const i = at(g, x, y);
      if (!g.open[i] || !g.corridor[i]) continue;
      const neighbours: [number, number, 'h' | 'v', number, number, number, number][] = [
        [x, y - 1, 'h', x, y, x + 1, y],
        [x, y + 1, 'h', x, y + 1, x + 1, y + 1],
        [x - 1, y, 'v', x, y, x, y + 1],
        [x + 1, y, 'v', x + 1, y, x + 1, y + 1],
      ];
      for (const [nx, ny, axis, ax, ay, bx, by] of neighbours) {
        if (!isOpen(g, nx, ny)) continue;
        const j = at(g, nx, ny);
        if (g.corridor[j]) continue;
        const roomIdx = g.room[j];
        if (roomIdx < 0) continue;
        const key = `open:${ax},${ay},${bx},${by}`;
        if (seen.has(key)) continue;
        const count = perRoom.get(roomIdx) || 0;
        if (count >= 3) continue;
        seen.add(key);
        perRoom.set(roomIdx, count + 1);
        const secret = rng.next() < o.secretDoors / Math.max(1, rooms.length);
        doors.push({
          key,
          kind: secret ? 'secretDoor' : 'door',
          state: rng.bool(0.12) ? 'locked' : 'closed',
          x: (ax + bx) / 2,
          y: (ay + by) / 2,
          horizontal: axis === 'h',
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Dressing
// ---------------------------------------------------------------------------

const FURNISHING_BY_PURPOSE: Record<string, string[]> = {
  Barracks: ['dgn/bed', 'dgn/chest', 'dgn/table-long', 'dgn/chair'],
  Storeroom: ['dgn/crate', 'dgn/barrel', 'dgn/crates-stack'],
  Shrine: ['dgn/altar', 'dgn/brazier', 'dgn/statue'],
  Library: ['dgn/bookshelf', 'dgn/table-long', 'dgn/chair'],
  Crypt: ['dgn/sarcophagus', 'dgn/bones', 'dgn/rubble'],
  Armoury: ['dgn/crate', 'dgn/anvil', 'dgn/bookshelf'],
  Kitchen: ['dgn/table-long', 'dgn/barrel', 'dgn/campfire'],
  'Mess Hall': ['dgn/table-long', 'dgn/chair', 'dgn/barrel'],
  Cistern: ['dgn/water-pool', 'dgn/well'],
  Workshop: ['dgn/anvil', 'dgn/table-long', 'dgn/crate'],
  Prison: ['dgn/cage', 'dgn/bones', 'dgn/rubble'],
  'Torture Chamber': ['dgn/cage', 'dgn/table-long', 'dgn/brazier', 'dgn/bones'],
  'Throne Room': ['dgn/throne', 'dgn/pillar', 'dgn/brazier'],
  'Audience Hall': ['dgn/pillar', 'dgn/rug', 'dgn/brazier'],
  Laboratory: ['dgn/table-long', 'dgn/bookshelf', 'dgn/portal'],
  'Summoning Circle': ['dgn/portal', 'dgn/brazier', 'dgn/altar'],
  Treasury: ['dgn/chest', 'dgn/crate', 'dgn/statue'],
  Kennels: ['dgn/cage', 'dgn/bones'],
  'Well Room': ['dgn/well', 'dgn/barrel'],
  Vault: ['dgn/chest', 'dgn/pillar'],
  Ossuary: ['dgn/bones', 'dgn/sarcophagus'],
  Chapel: ['dgn/altar', 'dgn/pillar', 'dgn/brazier'],
  Forge: ['dgn/anvil', 'dgn/campfire', 'dgn/crate'],
  'Mushroom Farm': ['veg/mushroom-top', 'dgn/water-pool', 'dgn/crate'],
  'Sarcophagus Hall': ['dgn/sarcophagus', 'dgn/pillar', 'dgn/brazier', 'dgn/statue'],
  Sepulchre: ['dgn/sarcophagus', 'dgn/bones', 'dgn/altar'],
  Gallery: ['dgn/statue', 'dgn/pillar', 'dgn/rug'],
};

const GENERIC_FURNITURE = ['dgn/crate', 'dgn/barrel', 'dgn/rubble', 'dgn/table-round', 'dgn/chair', 'dgn/pillar', 'dgn/bones'];

/** Pieces that occupy two squares rather than one. */
const WIDE_FURNITURE = new Set(['dgn/table-long', 'dgn/bookshelf', 'dgn/altar', 'dgn/bed', 'dgn/sarcophagus', 'dgn/cage']);

/** Pieces that belong against a wall rather than out in the middle of the floor. */
const AGAINST_WALL = new Set([
  'dgn/bookshelf', 'dgn/bed', 'dgn/chest', 'dgn/barrel', 'dgn/crate', 'dgn/anvil',
  'dgn/cage', 'dgn/sarcophagus', 'dgn/statue', 'dgn/throne', 'dgn/brazier',
  'dgn/rubble', 'dgn/bones',
]);

/**
 * The things that make a dungeon a place rather than a floor plan: pillars
 * holding up the big halls, collapsed masonry, a flooded chamber, a chasm cut
 * across a corridor, and the traps the GM is going to spring.
 *
 * The physical features go on the ordinary feature layer, so torchlight falls
 * on them like anything else. The trap markers go on a GM-only layer above the
 * darkness — they are annotations about the world, not objects in it, and a
 * spike pit a GM cannot see in an unlit corridor is one they will forget.
 */
function addDungeonFeatures(
  doc: MapDocument, g: CellGrid, rooms: Room[], o: DungeonGenOptions, rng: RNG,
): void {
  const terrain = doc.layers.find((l) => l.kind === 'object' && l.name === 'Terrain Features')
    || objectLayerByRole(doc, 'features');
  const hazards = doc.layers.find((l) => l.kind === 'object' && l.name === 'Hazards');
  if (!terrain || terrain.kind !== 'object') return;

  const cell = o.cell;
  const px = (c: number) => (c + 0.5) * cell;

  // --- Pillars -------------------------------------------------------------
  // A hall more than five squares across needs something holding the roof up,
  // and a colonnade is the cheapest way to make a big empty room interesting to
  // fight in: it breaks line of sight and gives cover.
  for (const room of rooms) {
    if (room.shape !== 'rect' || room.w < 6 || room.h < 5) continue;
    if (rng.bool(0.45)) continue;
    const inset = 1;
    const step = room.w >= 9 ? 3 : 2;
    for (let x = room.x + inset; x < room.x + room.w - inset; x += step) {
      for (const y of [room.y + inset, room.y + room.h - 1 - inset]) {
        if (y <= room.y || y >= room.y + room.h - 1) continue;
        terrain.objects.push(makeStamp('dgn/pillar', px(x), px(y), cell * 0.8, cell * 0.8, {
          seed: rng.int(1, 1e6),
          shadow: { color: 'rgba(0,0,0,0.55)', blur: cell * 0.2, dx: cell * 0.06, dy: cell * 0.09 },
          name: 'Pillar',
        }));
      }
    }
  }

  // --- Rubble --------------------------------------------------------------
  // Collapsed masonry, mostly along the walls where a ceiling comes down first.
  const openCells: number[] = [];
  for (let i = 0; i < g.open.length; i++) if (g.open[i]) openCells.push(i);
  rng.shuffle(openCells);
  const rubble = Math.round(openCells.length * 0.045);
  for (let k = 0; k < rubble && k < openCells.length; k++) {
    const i = openCells[k];
    const cx = i % g.cols, cy = Math.floor(i / g.cols);
    terrain.objects.push(makeStampAuto('dgn/rubble', px(cx) + rng.float(-0.2, 0.2) * cell, px(cy) + rng.float(-0.2, 0.2) * cell,
      cell * rng.float(0.7, 1.3), {
        seed: rng.int(1, 1e6),
        rotation: rng.float(0, 360),
        opacity: rng.float(0.75, 1),
        name: 'Rubble',
      }));
  }

  // --- A flooded chamber ---------------------------------------------------
  // Water in a dungeon is difficult terrain, a hiding place and a reason for
  // the party to argue, so it is worth having exactly one of.
  const floodable = rooms.filter((r) => r.w * r.h >= 12);
  if (floodable.length && rng.bool(0.7)) {
    const room = rng.pick(floodable);
    const pools = Math.max(2, Math.round(room.w * room.h / 9));
    for (let k = 0; k < pools; k++) {
      const x = room.x + rng.float(0.6, room.w - 0.6);
      const y = room.y + rng.float(0.6, room.h - 0.6);
      terrain.objects.push(makeStampAuto('dgn/water-pool', px(x - 0.5), px(y - 0.5),
        cell * rng.float(1.4, 2.6), {
          seed: rng.int(1, 1e6),
          rotation: rng.float(0, 360),
          opacity: 0.88,
          name: 'Standing water',
        }));
    }
  }

  // --- A chasm across a corridor -------------------------------------------
  // Cut somewhere the party has to deal with it rather than walk around.
  const corridorCells = openCells.filter((i) => g.corridor[i]);
  if (corridorCells.length > 20 && rng.bool(0.6)) {
    const start = corridorCells[rng.int(0, corridorCells.length - 1)];
    const cx = start % g.cols, cy = Math.floor(start / g.cols);
    const span = rng.int(2, 4);
    const horizontal = rng.bool();
    for (let k = 0; k < span; k++) {
      const x = horizontal ? cx + k : cx;
      const y = horizontal ? cy : cy + k;
      if (x < 0 || y < 0 || x >= g.cols || y >= g.rows) break;
      if (!g.open[at(g, x, y)]) break;
      terrain.objects.push(makeStampAuto('dgn/pit', px(x), px(y), cell * 1.25, {
        seed: rng.int(1, 1e6),
        rotation: rng.float(0, 360),
        name: 'Chasm',
      }));
    }
  }

  // --- Traps ---------------------------------------------------------------
  if (!hazards || hazards.kind !== 'object') return;
  const trapAssets = ['dgn/spike-trap', 'dgn/trapdoor', 'dgn/pit'];
  // Traps belong where the party has no choice: corridors and doorways, plus
  // the odd treasure room. Scattering them uniformly makes them a tax rather
  // than a decision.
  const candidates = openCells.filter((i) => g.corridor[i]);
  rng.shuffle(candidates);
  const trapCount = Math.min(candidates.length, Math.max(2, Math.round(rooms.length * 0.4)));
  const used: Vec2[] = [];
  for (let k = 0, placed = 0; k < candidates.length && placed < trapCount; k++) {
    const i = candidates[k];
    const cx = i % g.cols, cy = Math.floor(i / g.cols);
    if (used.some((u) => Math.abs(u.x - cx) + Math.abs(u.y - cy) < 5)) continue;
    used.push({ x: cx, y: cy });
    placed++;
    const asset = rng.pick(trapAssets);
    hazards.objects.push(makeStampAuto(asset, px(cx), px(cy), cell * 1.05, {
      seed: rng.int(1, 1e6),
      opacity: 0.9,
      name: asset === 'dgn/spike-trap' ? 'Spike trap'
        : asset === 'dgn/trapdoor' ? 'Concealed trapdoor' : 'Covered pit',
    }));
  }
}

function furnishRooms(doc: MapDocument, rooms: Room[], o: DungeonGenOptions, rng: RNG): void {
  const layer = objectLayerByRole(doc, 'features');
  const doorLayer = doc.layers.find((l) => l.kind === 'object' && l.name === 'Doors & Stairs');
  if (!layer) return;

  for (const room of rooms) {
    const pool = FURNISHING_BY_PURPOSE[room.purpose] || GENERIC_FURNITURE;
    const area = room.w * room.h;
    // Roughly one piece per five squares, which reads as a used room without
    // filling the floor a party has to fight across.
    const count = Math.min(14, Math.max(2, Math.round(area / 5) + rng.int(-1, 2)));
    const used: Vec2[] = [];

    for (let i = 0; i < count; i++) {
      const assetId = rng.pick(rng.bool(0.78) ? pool : GENERIC_FURNITURE);
      const cells = WIDE_FURNITURE.has(assetId) ? 2 : 1;
      const w = o.cell * cells * rng.float(0.8, 1.05);

      // Most furniture stands against a wall — beds, shelves, workbenches,
      // altars. Scattering everything uniformly across the floor is the giveaway
      // that nobody actually lives here.
      const wallish = AGAINST_WALL.has(assetId) ? 0.85 : 0.35;
      let placed: Vec2 | null = null;
      let rotation = 0;

      for (let attempt = 0; attempt < 8 && !placed; attempt++) {
        let cx: number, cy: number;
        if (rng.bool(wallish) && room.w > 2.6 && room.h > 2.6) {
          const side = rng.int(0, 3);
          const inset = 0.75;
          if (side === 0) { cx = room.x + rng.float(1, room.w - 1); cy = room.y + inset; rotation = 180; }
          else if (side === 1) { cx = room.x + room.w - inset; cy = room.y + rng.float(1, room.h - 1); rotation = 270; }
          else if (side === 2) { cx = room.x + rng.float(1, room.w - 1); cy = room.y + room.h - inset; rotation = 0; }
          else { cx = room.x + inset; cy = room.y + rng.float(1, room.h - 1); rotation = 90; }
        } else {
          cx = room.x + rng.float(0.8, room.w - 0.8);
          cy = room.y + rng.float(0.8, room.h - 0.8);
          rotation = rng.bool(0.5) ? rng.pick([0, 90, 180, 270]) : rng.float(-8, 8);
        }
        const clearance = cells > 1 ? 1.5 : 1.0;
        if (used.some((u) => Math.hypot(u.x - cx, u.y - cy) < clearance)) continue;
        placed = { x: cx, y: cy };
      }
      if (!placed) continue;
      used.push(placed);

      layer.objects.push(makeStamp(assetId, placed.x * o.cell, placed.y * o.cell, w, w, {
        seed: rng.int(1, 1e6),
        rotation: rotation + rng.float(-4, 4),
        shadow: { color: 'rgba(0,0,0,0.45)', blur: o.cell * 0.14, dx: o.cell * 0.04, dy: o.cell * 0.06 },
      }));
    }
  }

  // Stairs: entrance in the first room, exit in the last.
  if (rooms.length >= 2 && doorLayer && doorLayer.kind === 'object') {
    const first = rooms[0], last = rooms[rooms.length - 1];
    for (const [room, variant] of [[first, 0], [last, 1]] as const) {
      const c = roomCenter(room);
      doorLayer.objects.push(makeStamp('dgn/stairs', (c.x + 0.5) * o.cell, (c.y + 0.5) * o.cell, o.cell * 1.6, o.cell * 1.9, {
        seed: variant + 1,
        name: variant === 0 ? 'Stairs Up (entrance)' : 'Stairs Down',
      }));
    }
  }
}

/**
 * Torches, braziers and the odd arcane glow.
 *
 * The light matters more here than it does on a daylit map, because with wall
 * occlusion the unlit parts of a dungeon are genuinely black. A few dark rooms
 * are atmosphere; a dungeon where the corridors are also unlit is a page the GM
 * cannot read. So the passages get wall sconces at intervals, and only a small
 * minority of rooms are left dark on purpose.
 */
function lightRooms(doc: MapDocument, g: CellGrid, rooms: Room[], o: DungeonGenOptions, rng: RNG): void {
  const layer = doc.layers.find((l) => l.kind === 'light');
  if (!layer || layer.kind !== 'light') return;
  const unitPx = o.cell / 5; // 5 ft per cell

  const PRESETS: [{ b: number; d: number; c: string; a: 'torch' | 'flame' | 'pulse'; n: string }, number][] = [
    [{ b: 20, d: 40, c: '#ffae5c', a: 'torch', n: 'Torch' }, 6],
    [{ b: 25, d: 50, c: '#ff9a4a', a: 'flame', n: 'Brazier' }, 3],
    [{ b: 10, d: 22, c: '#7ac8ff', a: 'pulse', n: 'Arcane Glow' }, 1],
  ];

  for (const room of rooms) {
    if (rng.bool(0.14)) continue; // a few rooms stay dark on purpose
    const area = room.w * room.h;
    const n = area > 40 ? 3 : area > 18 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const x = (room.x + rng.float(1, room.w - 1)) * o.cell;
      const y = (room.y + rng.float(1, room.h - 1)) * o.cell;
      const preset = rng.pickWeighted(PRESETS);
      layer.lights.push(makeLight(x, y, o.cell, {
        bright: preset.b * unitPx,
        dim: preset.d * unitPx,
        color: preset.c,
        animation: preset.a,
        name: preset.n,
      }));
    }
  }

  // --- Corridor sconces ----------------------------------------------------
  // Spaced along the passages rather than scattered, which is both how a
  // building is actually lit and what keeps the gaps between pools even.
  const spacing = 7;
  const lit: Vec2[] = [];
  for (let y = 0; y < g.rows; y++) {
    for (let x = 0; x < g.cols; x++) {
      const i = at(g, x, y);
      if (!g.open[i] || !g.corridor[i]) continue;
      if (lit.some((p) => Math.abs(p.x - x) + Math.abs(p.y - y) < spacing)) continue;
      if (rng.bool(0.25)) continue;   // not every junction gets one
      lit.push({ x, y });
      layer.lights.push(makeLight((x + 0.5) * o.cell, (y + 0.5) * o.cell, o.cell, {
        bright: 11 * unitPx,
        dim: 24 * unitPx,
        color: '#ffb066',
        intensity: 0.6,
        animation: 'torch',
        name: 'Wall sconce',
      }));
    }
  }
}

function labelRooms(doc: MapDocument, rooms: Room[], o: DungeonGenOptions, rng: RNG): void {
  const layer = doc.layers.find((l) => l.kind === 'object' && l.role === 'labels');
  if (!layer || layer.kind !== 'object') return;
  const palette = paletteById(o.paletteId);

  rooms.forEach((room, i) => {
    const c = roomCenter(room);
    const x = (c.x + 0.5) * o.cell;
    const y = (c.y + 0.5) * o.cell;
    layer.objects.push(makeStamp('mrk/numbered', x, y - o.cell * 0.1, o.cell * 0.7, o.cell * 0.7, {
      seed: i,
      variant: i,
      name: `Room ${i + 1}`,
      tint: palette.accent,
      opacity: 0.95,
    }));
    layer.objects.push(makeText(room.purpose, x, y + o.cell * 0.62, o.paletteId, {
      size: o.cell * 0.26,
      color: mix(palette.ink, '#ffffff', 0.15),
      strokeColor: 'rgba(0,0,0,0.75)',
      strokeWidth: o.cell * 0.05,
      letterSpacing: 1,
      name: `Label ${i + 1}`,
    }));
  });
}

function noteRooms(doc: MapDocument, rooms: Room[], o: DungeonGenOptions, rng: RNG): void {
  const layer = doc.layers.find((l) => l.kind === 'note');
  if (!layer || layer.kind !== 'note') return;
  rooms.forEach((room, i) => {
    if (rng.bool(0.55)) return;
    const c = roomCenter(room);
    layer.notes.push(makeNote((c.x + 0.5) * o.cell, (c.y + 0.5) * o.cell, `Room ${i + 1} — ${room.purpose}`));
    const n = layer.notes[layer.notes.length - 1];
    n.body = rng.pick(DUNGEON_HAZARDS);
    n.icon = String(i + 1);
  });
}
