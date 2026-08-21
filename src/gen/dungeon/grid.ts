/**
 * Shared grid plumbing for the dungeon and cave generators: a boolean map of
 * open cells, wall tracing for the VTT export, and the painting pass that turns
 * cells into artwork.
 */
import type { MapDocument, Wall, Vec2 } from '../../core/types';
import { rasterByRole, wallLayer as findWallLayer } from '../../core/doc';
import { createSurface, ctxOf, type Surface } from '../../util/canvas';
import { getTexture } from '../../render/textures';
import { makeWall } from '../../core/factories';
import { paletteById, rgba, mix } from '../../core/color';
import { RNG } from '../../core/rng';
import { SimplexNoise, clamp01 } from '../../core/noise';
import { acquireScratch, releaseScratch } from '../../util/scratch';
import { addTonalDrift } from '../paintUtils';

export interface CellGrid {
  cols: number;
  rows: number;
  /** 1 = floor, 0 = solid rock. */
  open: Uint8Array;
  /** 1 = corridor, 0 = room or solid. */
  corridor: Uint8Array;
  /** Room index per cell, -1 when not in a room. */
  room: Int16Array;
}

export function makeGrid(cols: number, rows: number): CellGrid {
  return {
    cols, rows,
    open: new Uint8Array(cols * rows),
    corridor: new Uint8Array(cols * rows),
    room: new Int16Array(cols * rows).fill(-1),
  };
}

export const at = (g: CellGrid, x: number, y: number) => y * g.cols + x;
export const inside = (g: CellGrid, x: number, y: number) => x >= 0 && y >= 0 && x < g.cols && y < g.rows;
export const isOpen = (g: CellGrid, x: number, y: number) => inside(g, x, y) && g.open[at(g, x, y)] === 1;

// ---------------------------------------------------------------------------
// Wall tracing
// ---------------------------------------------------------------------------

export interface DoorSpec {
  /** Edge key, e.g. `h:12,7`. */
  key: string;
  kind: 'door' | 'secretDoor';
  state: 'closed' | 'open' | 'locked';
}

/**
 * Walk the boundary between open and solid cells and emit merged wall runs,
 * breaking runs where a door has been placed. This is what makes a generated
 * dungeon usable in Foundry without hand-drawing a single wall.
 */
export function traceWalls(g: CellGrid, cell: number, doors: DoorSpec[] = [], originX = 0, originY = 0): Wall[] {
  const doorMap = new Map(doors.map((d) => [d.key, d]));
  const hEdges = new Set<string>();
  const vEdges = new Set<string>();

  for (let y = 0; y < g.rows; y++) {
    for (let x = 0; x < g.cols; x++) {
      if (!isOpen(g, x, y)) continue;
      if (!isOpen(g, x, y - 1)) hEdges.add(`${x},${y}`);
      if (!isOpen(g, x, y + 1)) hEdges.add(`${x},${y + 1}`);
      if (!isOpen(g, x - 1, y)) vEdges.add(`${x},${y}`);
      if (!isOpen(g, x + 1, y)) vEdges.add(`${x + 1},${y}`);
    }
  }

  const walls: Wall[] = [];
  const px = (cx: number) => originX + cx * cell;
  const py = (cy: number) => originY + cy * cell;

  // Horizontal runs, grouped by row.
  const byRow = new Map<number, number[]>();
  for (const key of hEdges) {
    const [x, y] = key.split(',').map(Number);
    const arr = byRow.get(y) || [];
    arr.push(x);
    byRow.set(y, arr);
  }
  for (const [y, xsRaw] of byRow) {
    const xs = xsRaw.sort((a, b) => a - b);
    let runStart = xs[0];
    let prev = xs[0];
    const flush = (from: number, to: number) => {
      if (to > from) walls.push(makeWall({ x: px(from), y: py(y) }, { x: px(to), y: py(y) }, 'wall'));
    };
    for (let i = 1; i <= xs.length; i++) {
      const cur = xs[i];
      const doorHere = doorMap.get(`h:${prev + 1},${y}`);
      const broken = cur !== prev + 1 || !!doorHere;
      if (i === xs.length || broken) {
        flush(runStart, prev + 1);
        if (doorHere && i < xs.length) {
          walls.push(doorWall({ x: px(prev + 1), y: py(y) }, { x: px(prev + 2), y: py(y) }, doorHere));
          runStart = prev + 2;
        } else {
          runStart = cur;
        }
      }
      prev = cur;
    }
  }

  // Vertical runs, grouped by column.
  const byCol = new Map<number, number[]>();
  for (const key of vEdges) {
    const [x, y] = key.split(',').map(Number);
    const arr = byCol.get(x) || [];
    arr.push(y);
    byCol.set(x, arr);
  }
  for (const [x, ysRaw] of byCol) {
    const ys = ysRaw.sort((a, b) => a - b);
    let runStart = ys[0];
    let prev = ys[0];
    const flush = (from: number, to: number) => {
      if (to > from) walls.push(makeWall({ x: px(x), y: py(from) }, { x: px(x), y: py(to) }, 'wall'));
    };
    for (let i = 1; i <= ys.length; i++) {
      const cur = ys[i];
      const doorHere = doorMap.get(`v:${x},${prev + 1}`);
      const broken = cur !== prev + 1 || !!doorHere;
      if (i === ys.length || broken) {
        flush(runStart, prev + 1);
        if (doorHere && i < ys.length) {
          walls.push(doorWall({ x: px(x), y: py(prev + 1) }, { x: px(x), y: py(prev + 2) }, doorHere));
          runStart = prev + 2;
        } else {
          runStart = cur;
        }
      }
      prev = cur;
    }
  }

  // Free-standing doors: openings where a corridor pierces a room boundary.
  for (const d of doors) {
    if (!d.key.startsWith('open:')) continue;
    const [, coords] = d.key.split('open:');
    const [ax, ay, bx, by] = coords.split(',').map(Number);
    walls.push(doorWall({ x: originX + ax * cell, y: originY + ay * cell }, { x: originX + bx * cell, y: originY + by * cell }, d));
  }

  return walls;
}

function doorWall(a: Vec2, b: Vec2, d: DoorSpec): Wall {
  const w = makeWall(a, b, d.kind);
  w.doorState = d.state;
  w.blocksSight = d.state !== 'open';
  w.blocksMovement = d.state !== 'open';
  return w;
}

// ---------------------------------------------------------------------------
// Painting
// ---------------------------------------------------------------------------

export interface DungeonPaintOptions {
  paletteId: string;
  floorTexture: string;
  wallTexture: string;
  voidColor: string;
  /** Draw an outer stone band around the playable area. */
  wallThickness: number;
  /** Soft drop shadow cast by the walls onto the floor. */
  wallShadow: number;
  /** Rough up the room edges (caves want this high, dungeons low). */
  edgeRoughness: number;
  seed: number;
  grid: { originX: number; originY: number; cell: number };
}

/** Build an alpha mask of the open cells, optionally roughened. */
export function openMask(g: CellGrid, o: DungeonPaintOptions, docW: number, docH: number): Surface {
  const { cell, originX, originY } = o.grid;
  const surf = createSurface(docW, docH);
  const ctx = ctxOf(surf);
  ctx.fillStyle = '#ffffff';

  if (o.edgeRoughness <= 0.001) {
    for (let y = 0; y < g.rows; y++) {
      for (let x = 0; x < g.cols; x++) {
        if (!isOpen(g, x, y)) continue;
        ctx.fillRect(originX + x * cell, originY + y * cell, cell + 0.5, cell + 0.5);
      }
    }
    return surf;
  }

  // Organic version: rasterise the cells small, blow them up with a heavy blur
  // so the staircase melts, then re-threshold against a noise field. The noise
  // is what stops the result looking like rounded rectangles.
  const pad = 2;
  const sw = g.cols + pad * 2, sh = g.rows + pad * 2;
  const small = acquireScratch(sw, sh);
  const sctx = ctxOf(small);
  const img = sctx.createImageData(sw, sh);
  for (let y = 0; y < g.rows; y++) {
    for (let x = 0; x < g.cols; x++) {
      if (!isOpen(g, x, y)) continue;
      const i = ((y + pad) * sw + (x + pad)) * 4;
      img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255; img.data[i + 3] = 255;
    }
  }
  sctx.putImageData(img, 0, 0);

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.filter = `blur(${cell * 0.5 * o.edgeRoughness}px)`;
  ctx.drawImage(small, originX - pad * cell, originY - pad * cell, sw * cell, sh * cell);
  ctx.filter = 'none';
  ctx.restore();
  releaseScratch(small);

  // Noise field at 1/8 scale, upscaled — cheap, and smooth enough to read as rock.
  const nw = Math.max(8, Math.round(docW / 8));
  const nh = Math.max(8, Math.round(docH / 8));
  const noiseSmall = acquireScratch(nw, nh);
  const nctx = ctxOf(noiseSmall);
  const nimg = nctx.createImageData(nw, nh);
  const noise = new SimplexNoise(o.seed + 4177);
  const freq = (docW / cell) * 0.22;
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const n = noise.fbm(x / nw * freq, y / nh * freq * (nh / nw), 4) * 0.5 + 0.5;
      const i = (y * nw + x) * 4;
      const v = Math.round(clamp01(n) * 255);
      nimg.data[i] = v; nimg.data[i + 1] = v; nimg.data[i + 2] = v; nimg.data[i + 3] = 255;
    }
  }
  nctx.putImageData(nimg, 0, 0);

  const noiseBig = acquireScratch(docW, docH);
  const bctx = ctxOf(noiseBig);
  bctx.imageSmoothingEnabled = true;
  bctx.imageSmoothingQuality = 'high';
  bctx.drawImage(noiseSmall, 0, 0, docW, docH);
  releaseScratch(noiseSmall);

  const maskData = ctx.getImageData(0, 0, docW, docH);
  const noiseData = bctx.getImageData(0, 0, docW, docH).data;
  releaseScratch(noiseBig);

  const md = maskData.data;
  const amp = 70 * o.edgeRoughness;
  for (let i = 0; i < md.length; i += 4) {
    const threshold = 128 + (noiseData[i] - 128) / 128 * amp;
    const on = md[i + 3] > threshold ? 255 : 0;
    md[i] = 255; md[i + 1] = 255; md[i + 2] = 255; md[i + 3] = on;
  }
  ctx.putImageData(maskData, 0, 0);
  return surf;
}

export function paintDungeon(doc: MapDocument, g: CellGrid, o: DungeonPaintOptions): Surface {
  const voidLayer = rasterByRole(doc, 'background');
  const floor = rasterByRole(doc, 'floor');
  const wallArt = rasterByRole(doc, 'walls-art');
  const shadow = rasterByRole(doc, 'relief');
  const palette = paletteById(o.paletteId);

  const mask = openMask(g, o, doc.width, doc.height);

  // Void
  if (voidLayer) {
    const ctx = ctxOf(voidLayer.surface);
    ctx.fillStyle = o.voidColor;
    ctx.fillRect(0, 0, doc.width, doc.height);
  }

  // Wall band: the mask dilated outwards, minus the floor itself.
  if (wallArt && o.wallThickness > 0) {
    const dilated = dilate(mask, o.wallThickness);
    const band = createSurface(doc.width, doc.height);
    const bctx = ctxOf(band);
    bctx.drawImage(dilated, 0, 0);
    bctx.globalCompositeOperation = 'destination-out';
    bctx.drawImage(mask, 0, 0);

    const ctx = ctxOf(wallArt.surface);
    const tex = createSurface(doc.width, doc.height);
    const tctx = ctxOf(tex);
    const pat = tctx.createPattern(getTexture(o.wallTexture, { paletteId: o.paletteId }), 'repeat')!;
    tctx.fillStyle = pat;
    tctx.fillRect(0, 0, doc.width, doc.height);
    tctx.globalCompositeOperation = 'destination-in';
    tctx.drawImage(band, 0, 0);
    ctx.drawImage(tex, 0, 0);

    // Ink the outer silhouette so the dungeon reads at a glance.
    const outline = createSurface(doc.width, doc.height);
    const octx = ctxOf(outline);
    octx.drawImage(dilated, 0, 0);
    octx.globalCompositeOperation = 'destination-out';
    octx.drawImage(shrinkMask(dilated, Math.max(1.5, o.grid.cell * 0.045)), 0, 0);
    const inked = createSurface(doc.width, doc.height);
    const ictx = ctxOf(inked);
    ictx.fillStyle = mix(palette.ink, '#000000', 0.4);
    ictx.fillRect(0, 0, doc.width, doc.height);
    ictx.globalCompositeOperation = 'destination-in';
    ictx.drawImage(outline, 0, 0);
    ctx.drawImage(inked, 0, 0);
  }

  // Floor
  if (floor) {
    const ctx = ctxOf(floor.surface);
    const tex = createSurface(doc.width, doc.height);
    const tctx = ctxOf(tex);
    const pat = tctx.createPattern(getTexture(o.floorTexture, { paletteId: o.paletteId }), 'repeat')!;
    tctx.fillStyle = pat;
    tctx.fillRect(0, 0, doc.width, doc.height);
    // Damp patches and dry patches: a flat floor texture over a whole dungeon
    // reads as wallpaper, and the eye picks up the tile repeat immediately.
    addTonalDrift(tctx, doc.width, doc.height, o.seed + 3301, 1.2);
    tctx.globalCompositeOperation = 'destination-in';
    tctx.drawImage(mask, 0, 0);
    ctx.drawImage(tex, 0, 0);
  }

  // Contact shadow around the walls.
  if (shadow && o.wallShadow > 0) {
    const ctx = ctxOf(shadow.surface);
    const inner = createSurface(doc.width, doc.height);
    const ictx = ctxOf(inner);
    ictx.filter = `blur(${o.wallShadow}px)`;
    ictx.fillStyle = '#000000';
    ictx.fillRect(0, 0, doc.width, doc.height);
    ictx.globalCompositeOperation = 'destination-out';
    ictx.filter = `blur(${o.wallShadow}px)`;
    ictx.drawImage(mask, 0, 0);
    ictx.filter = 'none';
    ictx.globalCompositeOperation = 'destination-in';
    ictx.drawImage(mask, 0, 0);
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.drawImage(inner, 0, 0);
    ctx.restore();
    shadow.blend = 'multiply';
  }

  return mask;
}

/**
 * Grow an alpha silhouette outwards.
 *
 * Done at half resolution: the wall band is tens of pixels wide, so the extra
 * precision of working at full size buys nothing and costs four times the fill
 * rate on a large dungeon.
 */
function dilate(src: Surface, amount: number): Surface {
  const half = acquireScratch(Math.max(1, Math.round(src.width / 2)), Math.max(1, Math.round(src.height / 2)));
  const hctx = ctxOf(half);
  hctx.imageSmoothingEnabled = true;
  hctx.drawImage(src, 0, 0, half.width, half.height);

  const grown = acquireScratch(half.width, half.height);
  const gctx = ctxOf(grown);
  const a = amount / 2;
  const steps = 10;
  for (let i = 0; i < steps; i++) {
    const ang = (i / steps) * Math.PI * 2;
    gctx.drawImage(half, Math.cos(ang) * a, Math.sin(ang) * a);
  }
  gctx.drawImage(half, 0, 0);

  const out = createSurface(src.width, src.height);
  const octx = ctxOf(out);
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(grown, 0, 0, src.width, src.height);
  // Re-harden the edge; the upscale leaves a soft ramp.
  octx.globalCompositeOperation = 'source-in';
  octx.fillStyle = '#ffffff';
  octx.fillRect(0, 0, src.width, src.height);

  releaseScratch(half);
  releaseScratch(grown);
  return out;
}

/** Shrink an alpha silhouette inwards, also at half resolution. */
function shrinkMask(src: Surface, amount: number): Surface {
  const half = acquireScratch(Math.max(1, Math.round(src.width / 2)), Math.max(1, Math.round(src.height / 2)));
  const hctx = ctxOf(half);
  hctx.imageSmoothingEnabled = true;
  hctx.drawImage(src, 0, 0, half.width, half.height);

  const eroded = acquireScratch(half.width, half.height);
  const ectx = ctxOf(eroded);
  ectx.drawImage(half, 0, 0);
  ectx.globalCompositeOperation = 'destination-in';
  const a = amount / 2;
  const steps = 8;
  for (let i = 0; i < steps; i++) {
    const ang = (i / steps) * Math.PI * 2;
    ectx.drawImage(half, Math.cos(ang) * a, Math.sin(ang) * a);
  }

  const out = createSurface(src.width, src.height);
  const octx = ctxOf(out);
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(eroded, 0, 0, src.width, src.height);

  releaseScratch(half);
  releaseScratch(eroded);
  return out;
}
