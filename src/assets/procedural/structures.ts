/**
 * Buildings, defences, waterworks, and small pictorial world icons.
 *
 * Two idioms live here because they get read at two different distances: the
 * top-down shelves are footprints meant for a battle, city or dungeon map (a
 * 5 ft square renders around 70px, so a cottage footprint runs ~140-260px
 * wide), while "World icons" are small side-view glyphs in the same
 * three-quarter idiom as settlement.ts, just for individual works rather
 * than whole towns. The top-down half leans on a handful of shared
 * primitives — a gabled roof plane, a crenellation row, a water fill — so
 * fifty-odd stamps stay visually of a piece instead of each reinventing a
 * rectangle.
 */
import type { AssetDef, AssetDrawArgs } from '../types';
import {
  blob, fillPath, groundShadow, inkLine, lightGradient, radialGlow,
  roundRect, speckle, star, tracePath, regularPolygon,
} from '../draw';
import { mix, rgba } from '../../core/color';
import type { Vec2, MapKind } from '../../core/types';

// --- Shared colour + shape helpers -----------------------------------------

const ink = (a: AssetDrawArgs) => a.palette.ink;
/**
 * The face of a piece of top-down masonry, recoloured toward whatever material
 * it is built of.
 *
 * The fraction is what keeps a tinted tower a tower. Everything drawn on top of
 * this — the merlon shadows, the lit face of the drum, the ink — is derived
 * from it, so pushing all the way to the material's own colour is safe for the
 * shading but not for the *value*: a basalt drum at full strength is a black
 * disc with a black outline. Holding back a fifth keeps the piece separable
 * from the wall it stands in, which is also what a real drum does — it catches
 * the light the curtain beside it does not.
 */
const stoneBase = (a: AssetDrawArgs) => mix(a.palette.rock, '#8a8175', 0.45);
const stoneC = (a: AssetDrawArgs) => (a.tint ? mix(stoneBase(a), a.tint, a.tintStrength * 0.8) : stoneBase(a));
const woodC = (a: AssetDrawArgs) => (a.tint ? mix('#6b4a2a', a.tint, a.tintStrength) : '#6b4a2a');
const woodDark = '#3f2b16';
const plasterC = (a: AssetDrawArgs) => mix(a.palette.parchment, '#c9b89a', 0.5);
const thatchC = (a: AssetDrawArgs) => (a.tint ? mix('#c2a25a', a.tint, a.tintStrength) : '#c2a25a');
const tileRoofC = (a: AssetDrawArgs) => (a.tint ? mix('#8a3f34', a.tint, a.tintStrength) : '#8a3f34');
const slateRoofC = (a: AssetDrawArgs) => (a.tint ? mix('#5c6670', a.tint, a.tintStrength) : '#5c6670');
const ironC = '#4b5054';
const canvasC = (a: AssetDrawArgs) => (a.tint ? mix('#b8443c', a.tint, a.tintStrength) : '#b8443c');

function tri(ctx: CanvasRenderingContext2D, cx: number, cy: number, base: number, height: number, dir: 'up' | 'down' | 'left' | 'right'): void {
  ctx.beginPath();
  if (dir === 'up') { ctx.moveTo(cx - base / 2, cy); ctx.lineTo(cx, cy - height); ctx.lineTo(cx + base / 2, cy); }
  else if (dir === 'down') { ctx.moveTo(cx - base / 2, cy); ctx.lineTo(cx, cy + height); ctx.lineTo(cx + base / 2, cy); }
  else if (dir === 'left') { ctx.moveTo(cx, cy - base / 2); ctx.lineTo(cx - height, cy); ctx.lineTo(cx, cy + base / 2); }
  else { ctx.moveTo(cx, cy - base / 2); ctx.lineTo(cx + height, cy); ctx.lineTo(cx, cy + base / 2); }
  ctx.closePath();
  ctx.fill();
}

/** Flat-filled, ink-outlined rectangle — the basic top-down wall block. */
function block(a: AssetDrawArgs, x: number, y: number, w: number, h: number, fill: string | CanvasGradient, lw = 0.03): void {
  const { ctx } = a;
  ctx.save();
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = rgba(ink(a), 0.7);
  ctx.lineWidth = Math.max(1, Math.min(w, h) * lw);
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

function blockRound(a: AssetDrawArgs, x: number, y: number, w: number, h: number, r: number, fill: string | CanvasGradient, lw = 0.03): void {
  const { ctx } = a;
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = rgba(ink(a), 0.7);
  ctx.lineWidth = Math.max(1, Math.min(w, h) * lw);
  ctx.stroke();
  ctx.restore();
}

/**
 * A gabled roof plane seen from above: covers the wall footprint, with a
 * ridge line, a shadow on the lee slope, gable walls peeking past the eaves
 * at the ridge ends, and roofing texture that varies by material.
 */
/**
 * A pitched roof seen from above.
 *
 * From directly overhead a roof is a rectangle, which is why this used to draw
 * one: a flat slab with a line down it. But nobody looks at a battle map from
 * directly overhead — the light is always coming from somewhere, and what tells
 * you a building is a building rather than a crate is the pair of slopes
 * meeting at a ridge, the shadow the eaves throw on the ground, and the
 * courses of whatever it is covered in running along the pitch.
 *
 * So the roof is drawn as two planes, each shaded from its eaves up to the
 * ridge; the plane facing the light gets the highlight, the other gets the
 * shade, and the ridge is a board between them. `vertical` says the ridge runs
 * down the image, so the planes are left and right of it.
 */
function pitchedRoof(
  a: AssetDrawArgs, x: number, y: number, w: number, h: number,
  color: string, style: 'thatch' | 'tile' | 'slate', vertical = true,
): void {
  const { ctx, rng } = a;
  const overhang = Math.min(w, h) * 0.08;
  const rx = x - overhang, ry = y - overhang, rw = w + overhang * 2, rh = h + overhang * 2;
  const unit = Math.min(rw, rh);
  const radius = unit * 0.05;

  // --- the shadow the overhang throws -------------------------------------
  ctx.save();
  ctx.fillStyle = rgba('#000000', 0.3);
  ctx.filter = `blur(${Math.max(1, unit * 0.05)}px)`;
  roundRect(ctx, rx + unit * 0.055, ry + unit * 0.07, rw, rh, radius);
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRect(ctx, rx, ry, rw, rh, radius);
  ctx.clip();

  // --- the two planes ------------------------------------------------------
  // A flat plane under a directional light is evenly lit, so most of the work
  // here is done by the *step* at the ridge: the slope facing the light and
  // the slope facing away are two different values with a hard edge between
  // them, and that edge is what says "roof" rather than "box". The ramps at
  // either end are the shadow the wall throws back up under the overhang.
  const ramp = ctx.createLinearGradient(
    rx, ry, vertical ? rx + rw : rx, vertical ? ry : ry + rh,
  );
  ramp.addColorStop(0, mix(color, '#000000', 0.22));
  ramp.addColorStop(0.09, mix(color, '#ffffff', 0.22));
  ramp.addColorStop(0.485, mix(color, '#ffffff', 0.34));
  ramp.addColorStop(0.5, mix(color, '#000000', 0.2));
  ramp.addColorStop(0.91, mix(color, '#000000', 0.3));
  ramp.addColorStop(1, mix(color, '#000000', 0.46));
  ctx.fillStyle = ramp;
  ctx.fillRect(rx, ry, rw, rh);

  // --- what it is covered in ----------------------------------------------
  if (style === 'thatch') {
    // Thatch is laid in courses along the eaves but the stalks themselves run
    // down the pitch, and from above that is the whole texture: hundreds of
    // fine parallel lines from ridge to eaves, cut off square at the bottom.
    // Not the scattered blotches this used to draw, which read as gravel.
    ctx.save();
    ctx.lineCap = 'butt';
    const stalks = Math.max(14, Math.round((vertical ? rh : rw) / (unit * 0.035)));
    for (let i = 0; i < stalks; i++) {
      const t = (i + rng.float(0.2, 0.8)) / stalks;
      ctx.lineWidth = Math.max(0.6, unit * rng.float(0.006, 0.014));
      ctx.strokeStyle = rgba(rng.bool(0.55) ? '#3a2a10' : '#f6ecc4', rng.float(0.05, 0.14));
      ctx.beginPath();
      if (vertical) { ctx.moveTo(rx, ry + rh * t); ctx.lineTo(rx + rw, ry + rh * t); }
      else { ctx.moveTo(rx + rw * t, ry); ctx.lineTo(rx + rw * t, ry + rh); }
      ctx.stroke();
    }
    // The fringe of cut ends along each eaves.
    const fringe = unit * 0.1;
    for (let i = 0; i < stalks; i++) {
      const t = (i + rng.float(0.15, 0.85)) / stalks;
      const len = fringe * rng.float(0.5, 1);
      ctx.lineWidth = Math.max(1, unit * 0.016);
      ctx.strokeStyle = rgba(rng.bool() ? '#2a1e0c' : '#ffffff', rng.float(0.08, 0.2));
      for (const near of [true, false]) {
        ctx.beginPath();
        if (vertical) {
          const x0 = near ? rx : rx + rw;
          ctx.moveTo(x0, ry + rh * t); ctx.lineTo(x0 + (near ? len : -len), ry + rh * t);
        } else {
          const y0 = near ? ry : ry + rh;
          ctx.moveTo(rx + rw * t, y0); ctx.lineTo(rx + rw * t, y0 + (near ? len : -len));
        }
        ctx.stroke();
      }
    }
    // Patchy weathering, broad and low-contrast — new straw against old.
    for (let i = 0; i < 5; i++) {
      const px = rng.float(rx, rx + rw), py = rng.float(ry, ry + rh);
      const r = unit * rng.float(0.18, 0.34);
      const g = ctx.createRadialGradient(px, py, 0, px, py, r);
      const c = rng.bool() ? '#3a2a10' : '#f2e4b0';
      g.addColorStop(0, rgba(c, 0.1));
      g.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = g;
      ctx.fillRect(px - r, py - r, r * 2, r * 2);
    }
    ctx.restore();
  } else {
    // Tile and slate are laid in courses stepping down the slope, each course
    // lapping the one below — so the line that shows is the shadow under the
    // lap, not a scored line. Slate lays finer.
    const step = unit * (style === 'slate' ? 0.085 : 0.125);
    const span = vertical ? rw : rh;
    const rows = Math.max(3, Math.round(span / step));
    ctx.lineWidth = Math.max(1, unit * (style === 'slate' ? 0.014 : 0.018));
    for (let i = 1; i < rows; i++) {
      const t = i / rows;
      ctx.strokeStyle = rgba('#000000', style === 'slate' ? 0.22 : 0.26);
      ctx.beginPath();
      if (vertical) { ctx.moveTo(rx + rw * t, ry); ctx.lineTo(rx + rw * t, ry + rh); }
      else { ctx.moveTo(rx, ry + rh * t); ctx.lineTo(rx + rw, ry + rh * t); }
      ctx.stroke();
      // The lit edge of the course below, catching the sun over the lap.
      ctx.strokeStyle = rgba('#ffffff', 0.13);
      ctx.beginPath();
      const o = ctx.lineWidth;
      if (vertical) { ctx.moveTo(rx + rw * t + o, ry); ctx.lineTo(rx + rw * t + o, ry + rh); }
      else { ctx.moveTo(rx, ry + rh * t + o); ctx.lineTo(rx + rw, ry + rh * t + o); }
      ctx.stroke();
    }
    // Perpends, staggered course to course, so the covering reads as units.
    const across = Math.max(3, Math.round((vertical ? rh : rw) / (step * 1.6)));
    ctx.strokeStyle = rgba('#000000', 0.12);
    ctx.lineWidth = Math.max(1, unit * 0.01);
    for (let i = 0; i < rows; i++) {
      const t0 = i / rows, t1 = (i + 1) / rows;
      for (let j = 0; j < across; j++) {
        const u = (j + (i % 2 ? 0.5 : 0)) / across;
        ctx.beginPath();
        if (vertical) {
          ctx.moveTo(rx + rw * t0, ry + rh * u); ctx.lineTo(rx + rw * t1, ry + rh * u);
        } else {
          ctx.moveTo(rx + rw * u, ry + rh * t0); ctx.lineTo(rx + rw * u, ry + rh * t1);
        }
        ctx.stroke();
      }
    }
  }

  // --- the ridge -----------------------------------------------------------
  // Thatch is finished with a rolled and pegged ridge that sits proud; tile
  // and slate take a course of ridge tiles. Either way it is a band with a
  // shadow under it, not a scored line.
  const ridgeW = unit * (style === 'thatch' ? 0.15 : 0.08);
  // Lit half then shaded half, so the ridge is itself a little roof.
  ctx.fillStyle = mix(color, '#ffffff', style === 'thatch' ? 0.34 : 0.26);
  if (vertical) ctx.fillRect(rx + rw / 2 - ridgeW * 0.5, ry, ridgeW * 0.55, rh);
  else ctx.fillRect(rx, ry + rh / 2 - ridgeW * 0.5, rw, ridgeW * 0.55);
  ctx.fillStyle = mix(color, '#000000', 0.3);
  if (vertical) ctx.fillRect(rx + rw / 2 - ridgeW * 0.5 + ridgeW * 0.55, ry, ridgeW * 0.45, rh);
  else ctx.fillRect(rx, ry + rh / 2 - ridgeW * 0.5 + ridgeW * 0.55, rw, ridgeW * 0.45);
  // and the shadow it drops onto the slope below it
  ctx.fillStyle = rgba('#000000', 0.16);
  if (vertical) ctx.fillRect(rx + rw / 2 + ridgeW * 0.5, ry, ridgeW * 0.4, rh);
  else ctx.fillRect(rx, ry + rh / 2 + ridgeW * 0.5, rw, ridgeW * 0.4);
  if (style === 'thatch') {
    // A thatched ridge is held down by liggers pinned in a zigzag, which is
    // the one detail that says "thatch" and not "a lighter stripe".
    ctx.strokeStyle = rgba(ink(a), 0.4);
    ctx.lineWidth = Math.max(1, unit * 0.013);
    const pegs = Math.max(6, Math.round((vertical ? rh : rw) / (unit * 0.085)));
    ctx.beginPath();
    for (let i = 0; i <= pegs; i++) {
      const t = i / pegs;
      const off = (i % 2 ? 0.34 : -0.34) * ridgeW;
      const px = vertical ? rx + rw / 2 + off : rx + rw * t;
      const py = vertical ? ry + rh * t : ry + rh / 2 + off;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  // --- verge ---------------------------------------------------------------
  // At the gable end the roof oversails the wall, so what shows from above is
  // the barge board along that edge, with the ridge running out to meet it —
  // not the wall. The wedge of plaster that used to poke out past each end
  // read as an arrowhead, which is not a thing roofs have.
  const verge = overhang * 1.05;
  ctx.fillStyle = rgba(mix(color, ink(a), 0.6), 0.5);
  if (vertical) {
    ctx.fillRect(rx, ry, rw, verge);
    ctx.fillRect(rx, ry + rh - verge, rw, verge);
  } else {
    ctx.fillRect(rx, ry, verge, rh);
    ctx.fillRect(rx + rw - verge, ry, verge, rh);
  }
  ctx.restore();

  // --- eaves ---------------------------------------------------------------
  ctx.save();
  ctx.strokeStyle = rgba(ink(a), 0.72);
  ctx.lineWidth = Math.max(1, unit * 0.026);
  roundRect(ctx, rx, ry, rw, rh, radius);
  ctx.stroke();
  ctx.restore();
}

function crenellations(a: AssetDrawArgs, x: number, y: number, w: number, mh: number, n: number, edge: 'top' | 'bottom' = 'top'): void {
  const { ctx } = a;
  const s = stoneC(a);
  const mw = w / (n * 2 - 1);
  ctx.save();
  ctx.fillStyle = mix(s, '#ffffff', 0.14);
  ctx.strokeStyle = rgba(ink(a), 0.6);
  ctx.lineWidth = Math.max(1, mh * 0.15);
  for (let i = 0; i < n; i++) {
    const mx = x + i * mw * 2;
    const my = edge === 'top' ? y - mh : y;
    ctx.fillRect(mx, my, mw, mh);
    ctx.strokeRect(mx, my, mw, mh);
  }
  ctx.restore();
}

function waterFill(a: AssetDrawArgs, x: number, y: number, w: number, h: number): void {
  const { ctx, rng } = a;
  ctx.save();
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, a.palette.shallowWater);
  g.addColorStop(1, a.palette.water);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = rgba('#ffffff', 0.25);
  ctx.lineWidth = Math.max(1, h * 0.03);
  for (let i = 0; i < 3; i++) {
    const yy = y + h * (0.2 + i * 0.28) + rng.float(-h * 0.03, h * 0.03);
    ctx.beginPath();
    ctx.moveTo(x + w * 0.05, yy);
    ctx.quadraticCurveTo(x + w * 0.5, yy - h * 0.06, x + w * 0.95, yy);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Side-view house glyph for world icons, in settlement.ts's idiom — that
 * file keeps its own version private, so this is a small, deliberate
 * duplicate rather than a shared export.
 */
function houseGlyph(a: AssetDrawArgs, x: number, y: number, w: number, h: number, roofCol: string, wallCol: string, rot = 0): void {
  const { ctx, rng } = a;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const bodyH = h * 0.55, roofH = h * 0.45;
  ctx.fillStyle = lightGradient(ctx, -w / 2, 0, w / 2, bodyH, wallCol, 0.25, 0.28);
  ctx.fillRect(-w / 2, 0, w, bodyH);
  ctx.strokeStyle = rgba(ink(a), 0.6);
  ctx.lineWidth = Math.max(0.8, w * 0.04);
  ctx.strokeRect(-w / 2, 0, w, bodyH);
  ctx.fillStyle = lightGradient(ctx, -w / 2, -roofH, w / 2, 0, roofCol, 0.3, 0.32);
  ctx.beginPath();
  ctx.moveTo(-w * 0.58, 0); ctx.lineTo(0, -roofH); ctx.lineTo(w * 0.58, 0);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = rgba(ink(a), 0.65);
  ctx.fillRect(-w * 0.1, bodyH * 0.32, w * 0.2, bodyH * 0.68);
  if (rng.bool(0.5)) ctx.fillRect(w * 0.18, bodyH * 0.25, w * 0.16, bodyH * 0.3);
  ctx.restore();
}

function towerGlyph(a: AssetDrawArgs, x: number, groundY: number, w: number, h: number, roofOn: boolean, stone: string): void {
  const { ctx } = a;
  ctx.save();
  ctx.fillStyle = lightGradient(ctx, x - w / 2, groundY - h, x + w / 2, groundY, stone, 0.28, 0.34);
  ctx.fillRect(x - w / 2, groundY - h, w, h);
  ctx.strokeStyle = rgba(ink(a), 0.65);
  ctx.lineWidth = Math.max(1, w * 0.06);
  ctx.strokeRect(x - w / 2, groundY - h, w, h);
  if (roofOn) {
    const rh = h * 0.3;
    ctx.fillStyle = lightGradient(ctx, x - w, groundY - h - rh, x + w, groundY - h, tileRoofC(a), 0.3, 0.3);
    ctx.beginPath();
    ctx.moveTo(x - w * 0.6, groundY - h); ctx.lineTo(x, groundY - h - rh); ctx.lineTo(x + w * 0.6, groundY - h);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.fillStyle = rgba(ink(a), 0.7);
  ctx.fillRect(x - w * 0.09, groundY - h * 0.62, w * 0.18, h * 0.2);
  ctx.restore();
}

/** A wall band spanning the full tile width with only top/bottom edges inked
 * — no vertical end-caps — so adjacent tiles of the same run join cleanly. */
function wallBand(a: AssetDrawArgs, y: number, h: number, fill: string | CanvasGradient): void {
  const { ctx, w } = a;
  ctx.save();
  ctx.fillStyle = fill;
  ctx.fillRect(0, y, w, h);
  ctx.strokeStyle = rgba(ink(a), 0.65);
  ctx.lineWidth = Math.max(1, h * 0.05);
  ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, y + h); ctx.lineTo(w, y + h); ctx.stroke();
  ctx.restore();
}

/** A settlement-style city wall ring — filled blob, inked outline. */
function wallRing(a: AssetDrawArgs, cx: number, cy: number, rx: number, ry: number, lobes: number, wobble: number): Vec2[] {
  const { ctx, rng } = a;
  const pts = blob(cx, cy, rx, ry, lobes, wobble, rng);
  fillPath(ctx, pts, rgba(a.palette.parchmentDark, 0.5));
  inkLine(ctx, pts, rgba(ink(a), 0.7), Math.max(1.2, rx * 0.05));
  return pts;
}

/** A few drifting puffs above a chimney or furnace. */
function smoke(a: AssetDrawArgs, x: number, y: number, s: number): void {
  const { ctx, rng } = a;
  ctx.save();
  ctx.fillStyle = rgba('#9a958c', 0.45);
  for (let i = 0; i < 4; i++) {
    const t = i / 4;
    ctx.beginPath();
    ctx.ellipse(x + rng.float(-s * 0.2, s * 0.2) + t * s * 0.15, y - t * s * 1.3, s * (0.3 + t * 0.25), s * (0.22 + t * 0.18), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** A small pennant on a pole, planted at (x, yBase) reaching up to yTop. */
function flag(a: AssetDrawArgs, x: number, yTop: number, yBase: number, size: number): void {
  const { ctx } = a;
  ctx.save();
  ctx.strokeStyle = rgba(ink(a), 0.8);
  ctx.lineWidth = Math.max(1, size * 0.16);
  ctx.beginPath(); ctx.moveTo(x, yBase); ctx.lineTo(x, yTop); ctx.stroke();
  ctx.fillStyle = a.palette.accent;
  ctx.beginPath();
  ctx.moveTo(x, yTop); ctx.lineTo(x + size, yTop + size * 0.3); ctx.lineTo(x, yTop + size * 0.6);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

const TD_KINDS: MapKind[] = ['battle', 'city', 'dungeon'];
const WORLD_KINDS: MapKind[] = ['region', 'operational', 'hex'];

export const STRUCTURE_ASSETS: AssetDef[] = [
  // === Buildings (top-down) =================================================
  {
    id: 'str/cottage-td', label: 'Cottage', group: 'structures', sub: 'Buildings (top-down)',
    tags: ['house', 'thatch', 'hut'], aspect: 1.3, defaultWidth: 150, variants: 3, kinds: TD_KINDS,
    draw(a) {
      const { w, h, rng } = a;
      groundShadow(a.ctx, w * 0.52, h * 0.56, w * 0.4, h * 0.34, 0.26);
      const vertical = a.variant % 2 === 0;
      pitchedRoof(a, w * 0.16, h * 0.2, w * 0.68, h * 0.62, thatchC(a), 'thatch', vertical);
      if (rng.bool(0.7)) {
        const cx = w * (vertical ? 0.72 : 0.5), cy = h * (vertical ? 0.5 : 0.24);
        a.ctx.fillStyle = mix(stoneC(a), '#000000', 0.15);
        a.ctx.fillRect(cx - w * 0.02, cy - h * 0.02, w * 0.04, h * 0.05);
      }
    },
  },
  {
    id: 'str/longhouse-td', label: 'Longhouse', group: 'structures', sub: 'Buildings (top-down)',
    tags: ['hall', 'timber', 'clan'], aspect: 2.4, defaultWidth: 260, variants: 2, kinds: TD_KINDS,
    draw(a) {
      const { w, h } = a;
      groundShadow(a.ctx, w * 0.52, h * 0.55, w * 0.42, h * 0.3, 0.26);
      pitchedRoof(a, w * 0.1, h * 0.2, w * 0.8, h * 0.6, a.variant % 2 === 0 ? thatchC(a) : tileRoofC(a), a.variant % 2 === 0 ? 'thatch' : 'tile', false);
    },
  },
  {
    id: 'str/townhouse-td', label: 'Timber-Framed Townhouse', group: 'structures', sub: 'Buildings (top-down)',
    tags: ['house', 'timber', 'city'], aspect: 0.8, defaultWidth: 170, variants: 3, kinds: TD_KINDS,
    draw(a) {
      const { w, h } = a;
      groundShadow(a.ctx, w * 0.52, h * 0.56, w * 0.36, h * 0.38, 0.26);
      pitchedRoof(a, w * 0.18, h * 0.16, w * 0.64, h * 0.68, slateRoofC(a), 'slate', a.variant % 2 === 0);
    },
  },
  {
    id: 'str/manor-td', label: 'Stone Manor', group: 'structures', sub: 'Buildings (top-down)',
    tags: ['manor', 'estate', 'lord'], aspect: 1.6, defaultWidth: 280, variants: 2, kinds: TD_KINDS,
    draw(a) {
      const { ctx, w, h } = a;
      groundShadow(ctx, w * 0.52, h * 0.58, w * 0.44, h * 0.3, 0.28);
      pitchedRoof(a, w * 0.12, h * 0.22, w * 0.76, h * 0.56, tileRoofC(a), 'tile', true);
      // A wing set forward from the main range.
      pitchedRoof(a, w * 0.58, h * 0.5, w * 0.26, h * 0.32, tileRoofC(a), 'tile', false);
    },
  },
  {
    id: 'str/barn-td', label: 'Barn', group: 'structures', sub: 'Buildings (top-down)',
    tags: ['barn', 'farm', 'storage'], aspect: 1.7, defaultWidth: 230, variants: 2, kinds: TD_KINDS,
    draw(a) {
      const { w, h } = a;
      groundShadow(a.ctx, w * 0.52, h * 0.56, w * 0.44, h * 0.28, 0.26);
      pitchedRoof(a, w * 0.1, h * 0.22, w * 0.8, h * 0.56, a.variant % 2 === 0 ? tileRoofC(a) : thatchC(a), a.variant % 2 === 0 ? 'tile' : 'thatch', false);
    },
  },
  {
    id: 'str/stable-td', label: 'Stable', group: 'structures', sub: 'Buildings (top-down)',
    tags: ['stable', 'horses', 'stalls'], aspect: 2.0, defaultWidth: 230, variants: 2, kinds: TD_KINDS,
    draw(a) {
      const { ctx, w, h, rng } = a;
      groundShadow(ctx, w * 0.52, h * 0.56, w * 0.44, h * 0.3, 0.26);
      // Lean-to: roofed along the back, open along the front so the stalls read.
      block(a, w * 0.06, h * 0.2, w * 0.88, h * 0.62, plasterC(a));
      const roofDepth = h * 0.34;
      pitchedRoof(a, w * 0.06, h * 0.1, w * 0.88, roofDepth, thatchC(a), 'thatch', false);
      const stalls = 5;
      ctx.strokeStyle = rgba(woodDark, 0.7);
      ctx.lineWidth = Math.max(1, w * 0.012);
      for (let i = 1; i < stalls; i++) {
        const x = w * (0.06 + (i / stalls) * 0.88);
        ctx.beginPath(); ctx.moveTo(x, h * 0.24); ctx.lineTo(x, h * 0.8); ctx.stroke();
      }
      for (let i = 0; i < stalls; i++) {
        if (!rng.bool(0.6)) continue;
        const x = w * (0.06 + (i + 0.5) / stalls * 0.88);
        ctx.fillStyle = mix(woodC(a), '#000000', 0.1);
        ctx.beginPath(); ctx.ellipse(x, h * 0.66, w * 0.04, h * 0.07, 0, 0, Math.PI * 2); ctx.fill();
      }
    },
  },
  {
    id: 'str/chapel-td', label: 'Chapel', group: 'structures', sub: 'Buildings (top-down)',
    tags: ['church', 'nave', 'apse'], aspect: 1.4, defaultWidth: 210, variants: 2, kinds: TD_KINDS,
    draw(a) {
      const { ctx, w, h } = a;
      groundShadow(ctx, w * 0.52, h * 0.56, w * 0.4, h * 0.32, 0.28);
      pitchedRoof(a, w * 0.16, h * 0.22, w * 0.58, h * 0.56, slateRoofC(a), 'slate', false);
      // Semicircular apse at one end.
      const apseX = w * 0.78, apseY = h * 0.5, apseR = h * 0.26;
      ctx.save();
      ctx.beginPath();
      ctx.arc(apseX, apseY, apseR, -Math.PI / 2, Math.PI / 2);
      ctx.closePath();
      ctx.fillStyle = lightGradient(ctx, apseX, apseY - apseR, apseX + apseR, apseY + apseR, slateRoofC(a), 0.24, 0.28);
      ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.7);
      ctx.lineWidth = Math.max(1, h * 0.02);
      ctx.stroke();
      ctx.restore();
      // Small bell tower square at the front gable.
      block(a, w * 0.04, h * 0.32, w * 0.1, h * 0.36, mix(stoneC(a), '#000000', 0.05));
    },
  },
  {
    id: 'str/guardpost-td', label: 'Guard Post', group: 'structures', sub: 'Buildings (top-down)',
    tags: ['sentry', 'checkpoint', 'watch'], aspect: 1.0, defaultWidth: 110, variants: 2, kinds: TD_KINDS,
    draw(a) {
      const { w, h } = a;
      groundShadow(a.ctx, w * 0.52, h * 0.58, w * 0.36, h * 0.3, 0.28);
      pitchedRoof(a, w * 0.2, h * 0.24, w * 0.6, h * 0.5, a.variant % 2 === 0 ? tileRoofC(a) : slateRoofC(a), a.variant % 2 === 0 ? 'tile' : 'slate', true);
    },
  },
  {
    id: 'str/market-stall-td', label: 'Market Stall', group: 'structures', sub: 'Buildings (top-down)',
    tags: ['stall', 'awning', 'market'], aspect: 1.5, defaultWidth: 120, variants: 3, kinds: TD_KINDS,
    draw(a) {
      const { ctx, w, h, rng } = a;
      groundShadow(ctx, w * 0.52, h * 0.6, w * 0.4, h * 0.24, 0.24);
      // Trestle table under the awning.
      ctx.fillStyle = mix(woodC(a), '#000000', 0.1);
      ctx.fillRect(w * 0.18, h * 0.4, w * 0.64, h * 0.36);
      // Awning canopy — a striped pitched cloth, offset from centre.
      const stripeCol = a.tint ? mix(canvasC(a), a.tint, a.tintStrength) : rng.pick(['#b8443c', '#3c6ab8', '#3c9e5a', '#c9a227']);
      const ax = w * 0.5, ay = h * 0.34, aw = w * 0.76, ah = h * 0.38;
      const pts: Vec2[] = [{ x: ax - aw / 2, y: ay + ah / 2 }, { x: ax - aw * 0.3, y: ay - ah / 2 }, { x: ax + aw * 0.3, y: ay - ah / 2 }, { x: ax + aw / 2, y: ay + ah / 2 }];
      fillPath(ctx, pts, lightGradient(ctx, ax - aw / 2, ay - ah / 2, ax + aw / 2, ay + ah / 2, stripeCol, 0.2, 0.24));
      ctx.save();
      tracePath(ctx, pts, true); ctx.clip();
      ctx.strokeStyle = rgba('#ffffff', 0.4);
      ctx.lineWidth = Math.max(1, w * 0.02);
      for (let i = 0; i < 5; i++) {
        const t = i / 5;
        ctx.beginPath(); ctx.moveTo(ax - aw / 2 + aw * t, ay - ah / 2); ctx.lineTo(ax - aw / 2 + aw * t, ay + ah / 2); ctx.stroke();
      }
      ctx.restore();
      inkLine(ctx, pts, rgba(ink(a), 0.7), Math.max(1, w * 0.018), true);
      // Front poles.
      ctx.strokeStyle = rgba(woodDark, 0.8);
      ctx.lineWidth = Math.max(1, w * 0.02);
      ctx.beginPath(); ctx.moveTo(ax - aw / 2, ay + ah / 2); ctx.lineTo(ax - aw / 2, h * 0.82); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ax + aw / 2, ay + ah / 2); ctx.lineTo(ax + aw / 2, h * 0.82); ctx.stroke();
    },
  },
  {
    id: 'str/smithy-td', label: 'Smithy', group: 'structures', sub: 'Buildings (top-down)',
    tags: ['forge', 'blacksmith', 'craft'], aspect: 1.5, defaultWidth: 190, variants: 2, kinds: TD_KINDS,
    draw(a) {
      const { ctx, w, h } = a;
      groundShadow(ctx, w * 0.4, h * 0.56, w * 0.32, h * 0.3, 0.26);
      pitchedRoof(a, w * 0.06, h * 0.2, w * 0.56, h * 0.6, tileRoofC(a), 'tile', false);
      // Outdoor forge yard beside it.
      const fx = w * 0.78, fy = h * 0.6;
      radialGlow(ctx, fx, fy, w * 0.2, '#ff7a2a', 0.4);
      ctx.fillStyle = ironC;
      ctx.beginPath();
      ctx.moveTo(fx - w * 0.12, fy - h * 0.06); ctx.lineTo(fx + w * 0.12, fy - h * 0.06);
      ctx.lineTo(fx + w * 0.08, fy + h * 0.1); ctx.lineTo(fx - w * 0.08, fy + h * 0.1);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.7); ctx.lineWidth = Math.max(1, w * 0.015); ctx.stroke();
      ctx.fillStyle = '#e0662a';
      ctx.beginPath(); ctx.arc(fx, fy - h * 0.02, w * 0.05, 0, Math.PI * 2); ctx.fill();
      // Anvil block.
      ctx.fillStyle = mix(ironC, '#000000', 0.2);
      ctx.fillRect(fx - w * 0.14, fy + h * 0.16, w * 0.1, h * 0.05);
    },
  },
  {
    id: 'str/watermill-td', label: 'Watermill', group: 'structures', sub: 'Buildings (top-down)',
    tags: ['mill', 'wheel', 'river'], aspect: 1.6, defaultWidth: 240, variants: 2, kinds: TD_KINDS,
    draw(a) {
      const { ctx, w, h, rng } = a;
      groundShadow(ctx, w * 0.4, h * 0.56, w * 0.32, h * 0.28, 0.26);
      waterFill(a, w * 0.7, h * 0.1, w * 0.28, h * 0.8);
      pitchedRoof(a, w * 0.06, h * 0.2, w * 0.56, h * 0.58, tileRoofC(a), 'tile', false);
      // Wheel half-submerged at the millrace edge.
      const cx = w * 0.7, cy = h * 0.5, r = h * 0.3;
      ctx.save();
      ctx.strokeStyle = rgba(woodDark, 0.85);
      ctx.lineWidth = Math.max(1.5, w * 0.02);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      const rot = rng.float(0, Math.PI / 2);
      for (let i = 0; i < 8; i++) {
        const ang = rot + (i / 8) * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r); ctx.stroke();
      }
      ctx.fillStyle = mix(stoneC(a), '#000000', 0.1);
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.18, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    },
  },
  {
    id: 'str/granary-td', label: 'Granary', group: 'structures', sub: 'Buildings (top-down)',
    tags: ['grain', 'silo', 'storage'], aspect: 1.1, defaultWidth: 160, variants: 2, kinds: TD_KINDS,
    draw(a) {
      const { ctx, w, h } = a;
      const cx = w * 0.5, cy = h * 0.54, r = Math.min(w, h) * 0.38;
      groundShadow(ctx, cx + r * 0.1, cy + r * 0.14, r * 1.05, r * 0.95, 0.3);
      // Raised round crib on staddle stones, seen from above as two rings.
      block(a, cx - r, cy - r, r * 2, r * 2, mix(woodC(a), '#000000', 0.05), 0.02);
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = lightGradient(ctx, cx - r, cy - r, cx + r, cy + r, a.variant % 2 === 0 ? tileRoofC(a) : thatchC(a), 0.26, 0.3);
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      ctx.restore();
      ctx.strokeStyle = rgba(ink(a), 0.7); ctx.lineWidth = Math.max(1, r * 0.05);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2); ctx.stroke();
      // Corner staddle stones.
      ctx.fillStyle = stoneC(a);
      for (let i = 0; i < 4; i++) {
        const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const sx = cx + Math.cos(ang) * r * 1.12, sy = cy + Math.sin(ang) * r * 1.12;
        ctx.beginPath(); ctx.arc(sx, sy, r * 0.1, 0, Math.PI * 2); ctx.fill();
      }
    },
  },
  {
    id: 'str/warehouse-td', label: 'Warehouse', group: 'structures', sub: 'Buildings (top-down)',
    tags: ['storage', 'goods', 'dock'], aspect: 1.8, defaultWidth: 260, variants: 2, kinds: TD_KINDS,
    draw(a) {
      const { ctx, w, h, rng } = a;
      groundShadow(ctx, w * 0.52, h * 0.56, w * 0.46, h * 0.28, 0.26);
      pitchedRoof(a, w * 0.08, h * 0.2, w * 0.84, h * 0.58, slateRoofC(a), 'slate', false);
      // Loading bay doors along one long eave, visible past the roof edge.
      const n = 4;
      for (let i = 0; i < n; i++) {
        const x = w * (0.14 + (i / n) * 0.72);
        ctx.fillStyle = rgba('#000000', 0.5);
        ctx.fillRect(x, h * 0.78, w * 0.1, h * 0.06);
      }
    },
  },
  {
    id: 'str/inn-courtyard-td', label: 'Inn Courtyard', group: 'structures', sub: 'Buildings (top-down)',
    tags: ['inn', 'tavern', 'yard'], aspect: 1.5, defaultWidth: 260, variants: 2, kinds: TD_KINDS,
    draw(a) {
      const { ctx, w, h, rng } = a;
      groundShadow(ctx, w * 0.52, h * 0.56, w * 0.46, h * 0.34, 0.28);
      // Ranges on three sides around an open yard.
      pitchedRoof(a, w * 0.08, h * 0.12, w * 0.84, h * 0.24, tileRoofC(a), 'tile', false);
      pitchedRoof(a, w * 0.08, h * 0.12, w * 0.22, h * 0.72, tileRoofC(a), 'tile', true);
      pitchedRoof(a, w * 0.7, h * 0.12, w * 0.22, h * 0.72, tileRoofC(a), 'tile', true);
      // Yard dressing: a well and a couple of carts.
      const cx = w * 0.5, cy = h * 0.66;
      ctx.fillStyle = stoneC(a);
      ctx.beginPath(); ctx.arc(cx, cy, w * 0.05, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.6); ctx.lineWidth = Math.max(1, w * 0.01); ctx.stroke();
      ctx.fillStyle = mix(woodC(a), '#000000', 0.1);
      ctx.fillRect(w * 0.34, h * 0.72, w * 0.12, w * 0.07);
    },
  },
  {
    id: 'str/tower-footprint-td', label: 'Tower Footprint', group: 'structures', sub: 'Buildings (top-down)',
    tags: ['tower', 'round', 'stairs'], aspect: 1.0, defaultWidth: 150, variants: 2, kinds: TD_KINDS,
    draw(a) {
      const { ctx, w, h } = a;
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.46;
      groundShadow(ctx, cx + r * 0.08, cy + r * 0.1, r, r * 0.95, 0.3);
      const s = stoneC(a);
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = lightGradient(ctx, cx - r, cy - r, cx + r, cy + r, s, 0.28, 0.3);
      ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.72); ctx.lineWidth = Math.max(1, r * 0.06); ctx.stroke();
      ctx.clip();
      // Wall thickness ring, then a spiral of stair treads winding to the core.
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = mix(s, '#000000', 0.2); ctx.fill();
      const steps = a.variant % 2 === 0 ? 14 : 10;
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        const ang = t * Math.PI * 2.6;
        const rr = r * (0.78 - t * 0.6);
        ctx.save();
        ctx.translate(cx + Math.cos(ang) * rr * 0.4, cy + Math.sin(ang) * rr * 0.4);
        ctx.rotate(ang);
        ctx.fillStyle = mix(s, '#000000', t * 0.3);
        ctx.fillRect(-r * 0.06, -rr * 0.5, r * 0.12, rr);
        ctx.restore();
      }
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.16, 0, Math.PI * 2);
      ctx.fillStyle = mix(s, '#000000', 0.45); ctx.fill();
      ctx.restore();
    },
  },
  {
    id: 'str/ruin-shell-td', label: 'Ruined Shell', group: 'structures', sub: 'Buildings (top-down)',
    tags: ['ruin', 'roofless', 'derelict'], aspect: 1.4, defaultWidth: 210, variants: 3, kinds: TD_KINDS,
    draw(a) {
      const { ctx, w, h, rng } = a;
      groundShadow(ctx, w * 0.52, h * 0.56, w * 0.42, h * 0.3, 0.24);
      const s = mix(stoneC(a), '#8b8578', 0.35);
      const wallT = Math.min(w, h) * 0.09;
      const x0 = w * 0.12, y0 = h * 0.18, x1 = w * 0.88, y1 = h * 0.82;
      // Dirt-and-rubble floor showing through the missing roof.
      ctx.fillStyle = mix(a.palette.lowland, '#000000', 0.08);
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      // Outer wall ring — thickness is what reads as "ruin" from above.
      ctx.save();
      ctx.fillStyle = lightGradient(ctx, x0, y0, x1, y1, s, 0.24, 0.3);
      ctx.fillRect(x0, y0, x1 - x0, wallT);
      ctx.fillRect(x0, y1 - wallT, x1 - x0, wallT);
      ctx.fillRect(x0, y0, wallT, y1 - y0);
      ctx.fillRect(x1 - wallT, y0, wallT, y1 - y0);
      ctx.restore();
      ctx.strokeStyle = rgba(ink(a), 0.55);
      ctx.lineWidth = Math.max(1, w * 0.01);
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      ctx.strokeRect(x0 + wallT, y0 + wallT, x1 - x0 - wallT * 2, y1 - y0 - wallT * 2);
      // Breaches in the wall.
      const breaches = rng.int(2, 3);
      for (let i = 0; i < breaches; i++) {
        const side = rng.int(0, 3);
        const t = rng.float(0.2, 0.8);
        ctx.fillStyle = mix(a.palette.lowland, '#000000', 0.08);
        if (side === 0) ctx.fillRect(x0 + (x1 - x0) * t - wallT * 0.6, y0, wallT * 1.2, wallT);
        else if (side === 1) ctx.fillRect(x0 + (x1 - x0) * t - wallT * 0.6, y1 - wallT, wallT * 1.2, wallT);
        else if (side === 2) ctx.fillRect(x0, y0 + (y1 - y0) * t - wallT * 0.6, wallT, wallT * 1.2);
        else ctx.fillRect(x1 - wallT, y0 + (y1 - y0) * t - wallT * 0.6, wallT, wallT * 1.2);
      }
      // Rubble scattered on the floor.
      for (let i = 0; i < rng.int(6, 10); i++) {
        const x = rng.float(x0 + wallT, x1 - wallT), y = rng.float(y0 + wallT, y1 - wallT);
        const r = Math.min(w, h) * rng.float(0.02, 0.045);
        const pts = blob(x, y, r, r * rng.float(0.7, 1), 5, 0.2, rng);
        fillPath(ctx, pts, mix(s, '#000000', rng.float(0, 0.3)));
        inkLine(ctx, pts, rgba(ink(a), 0.4), 1, true);
      }
    },
  },
  // === Defences (top-down) ==================================================
  {
    id: 'str/wall-segment', label: 'Wall Segment', group: 'structures', sub: 'Defences (top-down)',
    tags: ['wall', 'curtain', 'stone', 'crenellation'], aspect: 5, defaultWidth: 350, variants: 2, kinds: TD_KINDS,
    draw(a) {
      const { ctx, w, h } = a;
      const yTop = h * 0.32, bandH = h * 0.4;
      const s = stoneC(a);
      wallBand(a, yTop, bandH, lightGradient(ctx, 0, yTop, 0, yTop + bandH, s, 0.24, 0.3));
      ctx.fillStyle = rgba('#000000', 0.12);
      ctx.fillRect(0, yTop + bandH * 0.55, w, bandH * 0.45);
      const n = Math.max(4, Math.round(w / (h * 0.6)));
      crenellations(a, 0, yTop, w, bandH * 0.32, n, 'top');
    },
  },
  {
    id: 'str/wall-corner', label: 'Wall Corner', group: 'structures', sub: 'Defences (top-down)',
    tags: ['wall', 'corner', 'stone', 'turn'], aspect: 1, defaultWidth: 170, variants: 1, kinds: TD_KINDS,
    draw(a) {
      const { ctx, w, h } = a;
      const bandH = Math.min(w, h) * 0.24;
      const yTop = h * 0.5 - bandH / 2;
      const vx = w * 0.62;
      const s = stoneC(a);
      ctx.save();
      ctx.fillStyle = lightGradient(ctx, 0, yTop, 0, yTop + bandH, s, 0.24, 0.3);
      ctx.fillRect(0, yTop, vx + bandH, bandH);
      ctx.fillRect(vx, yTop, bandH, h - yTop);
      ctx.strokeStyle = rgba(ink(a), 0.65);
      ctx.lineWidth = Math.max(1, bandH * 0.08);
      ctx.beginPath(); ctx.moveTo(0, yTop); ctx.lineTo(vx + bandH, yTop); ctx.lineTo(vx + bandH, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, yTop + bandH); ctx.lineTo(vx, yTop + bandH); ctx.lineTo(vx, h); ctx.stroke();
      ctx.restore();
      const n = Math.max(3, Math.round(vx / (bandH * 1.4)));
      crenellations(a, 0, yTop, vx, bandH * 0.34, n, 'top');
      ctx.save();
      ctx.translate(vx + bandH, yTop);
      ctx.rotate(Math.PI / 2);
      const n2 = Math.max(2, Math.round((h - yTop) / (bandH * 1.4)));
      crenellations(a, 0, 0, h - yTop, bandH * 0.34, n2, 'top');
      ctx.restore();
    },
  },
  {
    id: 'str/gatehouse', label: 'Gatehouse', group: 'structures', sub: 'Defences (top-down)',
    tags: ['gate', 'towers', 'fortification'], aspect: 1.3, defaultWidth: 230, variants: 2, kinds: TD_KINDS,
    draw(a) {
      const { ctx, w, h } = a;
      const yTop = h * 0.3, bandH = h * 0.44;
      const s = stoneC(a);
      wallBand(a, yTop, bandH, lightGradient(ctx, 0, yTop, 0, yTop + bandH, s, 0.24, 0.3));
      crenellations(a, 0, yTop, w * 0.28, bandH * 0.3, 2, 'top');
      crenellations(a, w * 0.72, yTop, w * 0.28, bandH * 0.3, 2, 'top');
      const towerW = w * 0.24, towerH = h * 0.78;
      block(a, w * 0.5 - w * 0.34 - towerW / 2, h * 0.5 - towerH / 2, towerW, towerH, lightGradient(ctx, 0, 0, towerW, towerH, s, 0.3, 0.32));
      block(a, w * 0.5 + w * 0.34 - towerW / 2, h * 0.5 - towerH / 2, towerW, towerH, lightGradient(ctx, 0, 0, towerW, towerH, s, 0.3, 0.32));
      crenellations(a, w * 0.5 - w * 0.34 - towerW / 2, h * 0.5 - towerH / 2, towerW, bandH * 0.3, 3, 'top');
      crenellations(a, w * 0.5 + w * 0.34 - towerW / 2, h * 0.5 - towerH / 2, towerW, bandH * 0.3, 3, 'top');
      ctx.fillStyle = '#0d0b09';
      const gw = w * 0.24;
      ctx.fillRect(w * 0.5 - gw / 2, yTop - h * 0.02, gw, bandH + h * 0.04);
      ctx.strokeStyle = rgba(ink(a), 0.7); ctx.lineWidth = Math.max(1, w * 0.012);
      ctx.strokeRect(w * 0.5 - gw / 2, yTop - h * 0.02, gw, bandH + h * 0.04);
    },
  },
  {
    id: 'str/round-tower', label: 'Round Tower', group: 'structures', sub: 'Defences (top-down)',
    tags: ['tower', 'bastion', 'watch'], aspect: 1, defaultWidth: 170, variants: 2, kinds: TD_KINDS,
    draw(a) {
      const { ctx, w, h, rng } = a;
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.4;
      groundShadow(ctx, cx + r * 0.08, cy + r * 0.1, r, r * 0.95, 0.3);
      const s = stoneC(a);
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = lightGradient(ctx, cx - r, cy - r, cx + r, cy + r, s, 0.28, 0.3);
      ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.72); ctx.lineWidth = Math.max(1, r * 0.05); ctx.stroke();
      ctx.restore();
      const n = 10;
      const mw = r * 0.34, mh = r * 0.22;
      ctx.fillStyle = mix(s, '#ffffff', 0.14);
      ctx.strokeStyle = rgba(ink(a), 0.6);
      ctx.lineWidth = Math.max(1, mh * 0.15);
      for (let i = 0; i < n; i += (a.variant % 2 === 0 ? 1 : 2)) {
        const ang = (i / n) * Math.PI * 2;
        ctx.save();
        ctx.translate(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
        ctx.rotate(ang);
        ctx.fillRect(-mw / 2, -mh / 2, mw, mh);
        ctx.strokeRect(-mw / 2, -mh / 2, mw, mh);
        ctx.restore();
      }
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(ink(a), 0.4); ctx.lineWidth = Math.max(1, r * 0.03); ctx.stroke();
      for (let i = 0; i < 4; i++) {
        const ang = (i / 4) * Math.PI * 2 + rng.float(-0.1, 0.1);
        ctx.fillStyle = rgba('#000000', 0.7);
        ctx.save();
        ctx.translate(cx + Math.cos(ang) * r * 0.86, cy + Math.sin(ang) * r * 0.86);
        ctx.rotate(ang);
        ctx.fillRect(-r * 0.03, -r * 0.1, r * 0.06, r * 0.2);
        ctx.restore();
      }
    },
  },
  {
    id: 'str/bastion', label: 'Square Bastion', group: 'structures', sub: 'Defences (top-down)',
    tags: ['bastion', 'fortification', 'star-fort'], aspect: 1, defaultWidth: 200, variants: 2, kinds: TD_KINDS,
    draw(a) {
      const { ctx, w, h } = a;
      const s = stoneC(a);
      groundShadow(ctx, w * 0.5, h * 0.56, w * 0.4, h * 0.36, 0.28);
      ctx.save();
      ctx.fillStyle = lightGradient(ctx, 0, h * 0.7, 0, h, s, 0.24, 0.3);
      ctx.fillRect(0, h * 0.72, w * 0.32, h * 0.28);
      ctx.fillRect(w * 0.68, h * 0.72, w * 0.32, h * 0.28);
      ctx.restore();
      const pts: Vec2[] = [
        { x: w * 0.28, y: h * 0.78 }, { x: w * 0.22, y: h * 0.4 },
        { x: w * 0.5, y: h * 0.1 }, { x: w * 0.78, y: h * 0.4 }, { x: w * 0.72, y: h * 0.78 },
      ];
      fillPath(ctx, pts, lightGradient(ctx, w * 0.22, h * 0.1, w * 0.78, h * 0.78, s, 0.3, 0.3));
      inkLine(ctx, pts, rgba(ink(a), 0.72), Math.max(1, w * 0.02), true);
      const nFace = a.variant % 2 === 0 ? 4 : 5;
      const faces: [Vec2, Vec2][] = [[pts[1], pts[2]], [pts[2], pts[3]]];
      for (const [p0, p1] of faces) {
        for (let i = 0; i < nFace; i++) {
          const t = (i + 0.5) / nFace;
          const mx = p0.x + (p1.x - p0.x) * t, my = p0.y + (p1.y - p0.y) * t;
          const nx = -(p1.y - p0.y), ny = p1.x - p0.x;
          const nl = Math.hypot(nx, ny) || 1;
          const ox = (nx / nl) * w * 0.03, oy = (ny / nl) * w * 0.03;
          ctx.fillStyle = mix(s, '#ffffff', 0.14);
          ctx.fillRect(mx + ox - w * 0.025, my + oy - w * 0.025, w * 0.05, w * 0.05);
        }
      }
    },
  },
  {
    id: 'str/palisade', label: 'Palisade Run', group: 'structures', sub: 'Defences (top-down)',
    tags: ['palisade', 'timber', 'stakes'], aspect: 4.5, defaultWidth: 340, variants: 2, kinds: TD_KINDS,
    draw(a) {
      const { ctx, w, h, rng } = a;
      const yTop = h * 0.28, bandH = h * 0.44;
      ctx.fillStyle = rgba('#000000', 0.1);
      ctx.fillRect(0, yTop + bandH * 0.5, w, bandH * 0.5);
      const postW = h * 0.16;
      const n = Math.max(6, Math.round(w / postW));
      const pw = w / n;
      for (let i = 0; i < n; i++) {
        const x = i * pw + pw / 2;
        const lean = rng.float(-0.06, 0.06);
        ctx.save();
        ctx.translate(x, yTop);
        ctx.rotate(lean);
        const pts: Vec2[] = [
          { x: -pw * 0.36, y: bandH }, { x: -pw * 0.36, y: bandH * 0.15 }, { x: 0, y: -bandH * 0.12 },
          { x: pw * 0.36, y: bandH * 0.15 }, { x: pw * 0.36, y: bandH },
        ];
        fillPath(ctx, pts, lightGradient(ctx, -pw * 0.36, -bandH * 0.12, pw * 0.36, bandH, woodC(a), 0.26, 0.3));
        inkLine(ctx, pts, rgba(ink(a), 0.55), Math.max(1, pw * 0.1));
        ctx.restore();
      }
      ctx.strokeStyle = rgba(woodDark, 0.7);
      ctx.lineWidth = Math.max(1, bandH * 0.08);
      ctx.beginPath(); ctx.moveTo(0, yTop + bandH * 0.75); ctx.lineTo(w, yTop + bandH * 0.75); ctx.stroke();
    },
  },
  {
    id: 'str/rampart', label: 'Earthwork Rampart', group: 'structures', sub: 'Defences (top-down)',
    tags: ['earthwork', 'ditch', 'mound'], aspect: 3, defaultWidth: 280, variants: 2, kinds: TD_KINDS,
    draw(a) {
      const { ctx, w, h, rng } = a;
      const earth = mix(a.palette.highland, a.palette.lowland, 0.4);
      ctx.fillStyle = mix(a.palette.rock, '#000000', 0.25);
      ctx.fillRect(0, h * 0.72, w, h * 0.2);
      ctx.save();
      ctx.fillStyle = lightGradient(ctx, 0, h * 0.14, 0, h * 0.72, earth, 0.28, 0.24);
      ctx.beginPath();
      ctx.moveTo(0, h * 0.72);
      for (let x = 0; x <= w; x += w / 24) {
        ctx.lineTo(x, h * 0.42 - Math.sin(x * 0.05) * h * 0.03 + rng.float(-h * 0.015, h * 0.015));
      }
      ctx.lineTo(w, h * 0.72);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.5); ctx.lineWidth = Math.max(1, h * 0.02); ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = rgba(a.palette.grass, 0.7);
      ctx.lineWidth = Math.max(1, h * 0.012);
      for (let i = 0; i < 22; i++) {
        const x = rng.float(w * 0.02, w * 0.98);
        const y = rng.float(h * 0.4, h * 0.68);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rng.float(-3, 3), y - h * 0.05); ctx.stroke();
      }
    },
  },
  {
    id: 'str/barricade', label: 'Wooden Barricade', group: 'structures', sub: 'Defences (top-down)',
    tags: ['barricade', 'obstacle', 'improvised'], aspect: 2.2, defaultWidth: 190, variants: 2, kinds: TD_KINDS,
    draw(a) {
      const { ctx, w, h, rng } = a;
      groundShadow(ctx, w * 0.5, h * 0.6, w * 0.46, h * 0.16, 0.22);
      const n = 6;
      for (let i = 0; i < n; i++) {
        const x = w * ((i + 0.5) / n);
        const lean = rng.float(-0.3, 0.3);
        ctx.save();
        ctx.translate(x, h * 0.55);
        ctx.rotate(lean);
        ctx.strokeStyle = mix(woodC(a), '#000000', 0.1);
        ctx.lineWidth = Math.max(2, w * 0.02);
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-h * 0.3, 0); ctx.lineTo(h * 0.3, 0); ctx.stroke();
        ctx.restore();
      }
      ctx.strokeStyle = rgba(woodDark, 0.8);
      ctx.lineWidth = Math.max(1, w * 0.015);
      ctx.beginPath(); ctx.moveTo(w * 0.06, h * 0.75); ctx.lineTo(w * 0.94, h * 0.35); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w * 0.06, h * 0.35); ctx.lineTo(w * 0.94, h * 0.75); ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const x = w * (0.2 + i * 0.3);
        ctx.fillStyle = mix(woodC(a), '#000000', 0.05);
        tri(ctx, x, h * 0.3, w * 0.05, h * 0.22, 'up');
      }
    },
  },
  {
    id: 'str/caltrops', label: 'Caltrop Field', group: 'structures', sub: 'Defences (top-down)',
    tags: ['caltrops', 'hazard', 'trap'], aspect: 1.3, defaultWidth: 150, variants: 3, kinds: TD_KINDS,
    draw(a) {
      const { ctx, w, h, rng } = a;
      const n = rng.int(9, 14);
      for (let i = 0; i < n; i++) {
        const x = rng.float(w * 0.1, w * 0.9), y = rng.float(h * 0.15, h * 0.9);
        const r = Math.min(w, h) * rng.float(0.045, 0.07);
        groundShadow(ctx, x, y, r * 1.2, r * 0.6, 0.18);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rng.float(0, Math.PI));
        ctx.strokeStyle = mix('#8a8175', '#3a352c', 0.4);
        ctx.lineWidth = Math.max(1, r * 0.3);
        ctx.lineCap = 'round';
        for (let k = 0; k < 4; k++) {
          const ang = (k / 4) * Math.PI * 2 + Math.PI / 4;
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r); ctx.stroke();
        }
        ctx.fillStyle = mix('#b8b4ac', '#6a6660', rng.next());
        ctx.beginPath(); ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    },
  },
  {
    id: 'str/siege-ram', label: 'Siege Ram', group: 'structures', sub: 'Defences (top-down)',
    tags: ['ram', 'siege engine', 'wheeled'], aspect: 1.8, defaultWidth: 200, variants: 1, kinds: TD_KINDS,
    draw(a) {
      const { ctx, w, h } = a;
      groundShadow(ctx, w * 0.5, h * 0.6, w * 0.4, h * 0.24, 0.28);
      pitchedRoof(a, w * 0.24, h * 0.24, w * 0.5, h * 0.5, mix(woodC(a), '#000000', 0.05), 'tile', false);
      ctx.fillStyle = mix(woodC(a), '#000000', 0.1);
      ctx.fillRect(w * 0.06, h * 0.44, w * 0.2, h * 0.12);
      ctx.fillStyle = ironC;
      ctx.beginPath();
      ctx.moveTo(w * 0.06, h * 0.44); ctx.lineTo(w * 0.02, h * 0.5); ctx.lineTo(w * 0.06, h * 0.56);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.6); ctx.lineWidth = Math.max(1, w * 0.012); ctx.stroke();
      ctx.fillStyle = mix(woodDark, '#000000', 0.2);
      for (const wy of [h * 0.28, h * 0.72]) {
        ctx.beginPath(); ctx.arc(w * 0.36, wy, w * 0.05, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(w * 0.62, wy, w * 0.05, 0, Math.PI * 2); ctx.fill();
      }
    },
  },
  {
    id: 'str/catapult', label: 'Catapult', group: 'structures', sub: 'Defences (top-down)',
    tags: ['siege engine', 'artillery'], aspect: 1.2, defaultWidth: 170, variants: 1, kinds: TD_KINDS,
    draw(a) {
      const { ctx, w, h } = a;
      groundShadow(ctx, w * 0.5, h * 0.62, w * 0.36, h * 0.24, 0.28);
      ctx.strokeStyle = mix(woodC(a), '#000000', 0.1);
      ctx.lineWidth = Math.max(2, w * 0.03);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(w * 0.2, h * 0.7); ctx.lineTo(w * 0.5, h * 0.34); ctx.lineTo(w * 0.8, h * 0.7);
      ctx.moveTo(w * 0.32, h * 0.7); ctx.lineTo(w * 0.68, h * 0.7);
      ctx.stroke();
      ctx.strokeStyle = mix(woodDark, '#000000', 0.1);
      ctx.lineWidth = Math.max(2, w * 0.025);
      ctx.beginPath(); ctx.moveTo(w * 0.5, h * 0.5); ctx.lineTo(w * 0.78, h * 0.18); ctx.stroke();
      ctx.fillStyle = ironC;
      ctx.beginPath(); ctx.arc(w * 0.78, h * 0.16, w * 0.04, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = mix(woodDark, '#000000', 0.2);
      ctx.beginPath(); ctx.arc(w * 0.24, h * 0.74, w * 0.05, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(w * 0.76, h * 0.74, w * 0.05, 0, Math.PI * 2); ctx.fill();
    },
  },
  {
    id: 'str/trebuchet', label: 'Trebuchet', group: 'structures', sub: 'Defences (top-down)',
    tags: ['siege engine', 'counterweight'], aspect: 1, defaultWidth: 190, variants: 1, kinds: TD_KINDS,
    draw(a) {
      const { ctx, w, h } = a;
      groundShadow(ctx, w * 0.5, h * 0.66, w * 0.42, h * 0.24, 0.3);
      block(a, w * 0.12, h * 0.56, w * 0.76, h * 0.16, lightGradient(ctx, 0, h * 0.56, 0, h * 0.72, woodC(a), 0.22, 0.28));
      ctx.strokeStyle = mix(woodC(a), '#000000', 0.15);
      ctx.lineWidth = Math.max(2, w * 0.03);
      ctx.beginPath(); ctx.moveTo(w * 0.42, h * 0.6); ctx.lineTo(w * 0.5, h * 0.16); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w * 0.58, h * 0.6); ctx.lineTo(w * 0.5, h * 0.16); ctx.stroke();
      ctx.save();
      ctx.translate(w * 0.5, h * 0.16);
      ctx.rotate(-0.5);
      ctx.strokeStyle = mix(woodDark, '#000000', 0.1);
      ctx.lineWidth = Math.max(2, w * 0.03);
      ctx.beginPath(); ctx.moveTo(-w * 0.16, 0); ctx.lineTo(w * 0.4, 0); ctx.stroke();
      ctx.fillStyle = ironC;
      ctx.fillRect(-w * 0.22, -w * 0.06, w * 0.14, w * 0.12);
      ctx.restore();
      ctx.fillStyle = mix(woodDark, '#000000', 0.2);
      ctx.beginPath(); ctx.arc(w * 0.5, h * 0.14, w * 0.03, 0, Math.PI * 2); ctx.fill();
    },
  },

  // === Ways & water (top-down) ==============================================
  {
    id: 'str/bridge-stone-td', label: 'Stone Bridge', group: 'structures', sub: 'Ways & water (top-down)',
    tags: ['bridge', 'stone', 'crossing', 'river'], aspect: 3, defaultWidth: 280, variants: 2, kinds: TD_KINDS,
    draw(a) {
      const { ctx, w, h } = a;
      waterFill(a, w * 0.32, 0, w * 0.36, h);
      const s = stoneC(a);
      const deckY = h * 0.36, deckH = h * 0.28;
      wallBand(a, deckY, deckH, lightGradient(ctx, 0, deckY, 0, deckY + deckH, s, 0.26, 0.28));
      ctx.fillStyle = mix(s, '#000000', 0.3);
      ctx.fillRect(w * 0.42, deckY - h * 0.02, w * 0.06, deckH + h * 0.04);
      ctx.fillRect(w * 0.58, deckY - h * 0.02, w * 0.06, deckH + h * 0.04);
      ctx.strokeStyle = rgba(ink(a), 0.7);
      ctx.lineWidth = Math.max(1, h * 0.015);
      ctx.beginPath(); ctx.moveTo(0, deckY + deckH * 0.12); ctx.lineTo(w, deckY + deckH * 0.12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, deckY + deckH * 0.88); ctx.lineTo(w, deckY + deckH * 0.88); ctx.stroke();
    },
  },
  {
    id: 'str/bridge-wood-td', label: 'Wooden Bridge', group: 'structures', sub: 'Ways & water (top-down)',
    tags: ['bridge', 'timber', 'crossing'], aspect: 3, defaultWidth: 260, variants: 2, kinds: TD_KINDS,
    draw(a) {
      const { ctx, w, h } = a;
      waterFill(a, w * 0.3, 0, w * 0.4, h);
      const deckY = h * 0.38, deckH = h * 0.24;
      wallBand(a, deckY, deckH, lightGradient(ctx, 0, deckY, 0, deckY + deckH, woodC(a), 0.24, 0.28));
      ctx.strokeStyle = rgba(woodDark, 0.55);
      ctx.lineWidth = Math.max(1, w * 0.008);
      const planks = Math.round(w / (deckH * 0.6));
      for (let i = 1; i < planks; i++) {
        const x = (w / planks) * i;
        ctx.beginPath(); ctx.moveTo(x, deckY); ctx.lineTo(x, deckY + deckH); ctx.stroke();
      }
      ctx.fillStyle = mix(woodDark, '#000000', 0.15);
      for (const x of [w * 0.4, w * 0.5, w * 0.6]) {
        ctx.beginPath(); ctx.arc(x, deckY + deckH * 1.15, deckH * 0.14, 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = rgba(ink(a), 0.5); ctx.lineWidth = Math.max(1, h * 0.01);
      ctx.beginPath(); ctx.moveTo(0, deckY); ctx.lineTo(w, deckY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, deckY + deckH); ctx.lineTo(w, deckY + deckH); ctx.stroke();
    },
  },
  {
    id: 'str/bridge-rope-td', label: 'Rope Bridge', group: 'structures', sub: 'Ways & water (top-down)',
    tags: ['bridge', 'rope', 'rickety'], aspect: 3.6, defaultWidth: 260, variants: 1, kinds: TD_KINDS,
    draw(a) {
      const { ctx, w, h, rng } = a;
      waterFill(a, w * 0.24, 0, w * 0.52, h);
      const deckY = h * 0.42, deckH = h * 0.16;
      const n = Math.round(w / (deckH * 1.2));
      for (let i = 0; i < n; i++) {
        const x = (w / n) * i;
        const gap = deckH * 0.18;
        ctx.fillStyle = mix(woodC(a), '#000000', rng.float(0, 0.12));
        ctx.fillRect(x + gap / 2, deckY, w / n - gap, deckH);
      }
      ctx.strokeStyle = rgba(woodDark, 0.75);
      ctx.lineWidth = Math.max(1, h * 0.014);
      for (const yy of [deckY - deckH * 0.5, deckY + deckH * 1.5]) {
        ctx.beginPath();
        ctx.moveTo(0, yy);
        ctx.quadraticCurveTo(w * 0.5, yy + h * 0.03, w, yy);
        ctx.stroke();
      }
    },
  },
  {
    id: 'str/jetty', label: 'Jetty / Pier', group: 'structures', sub: 'Ways & water (top-down)',
    tags: ['jetty', 'pier', 'dock'], aspect: 2.6, defaultWidth: 220, variants: 2, kinds: TD_KINDS,
    draw(a) {
      const { ctx, w, h } = a;
      waterFill(a, w * 0.3, 0, w * 0.7, h);
      const deckY = h * 0.38, deckH = h * 0.24;
      ctx.save();
      ctx.fillStyle = lightGradient(ctx, 0, deckY, 0, deckY + deckH, woodC(a), 0.24, 0.28);
      ctx.fillRect(0, deckY, w * 0.68, deckH);
      ctx.strokeStyle = rgba(ink(a), 0.65); ctx.lineWidth = Math.max(1, deckH * 0.08);
      ctx.beginPath(); ctx.moveTo(0, deckY); ctx.lineTo(w * 0.68, deckY); ctx.lineTo(w * 0.68, deckY + deckH); ctx.lineTo(0, deckY + deckH); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = mix(woodDark, '#000000', 0.1);
      const n = 4;
      for (let i = 0; i < n; i++) {
        const x = w * 0.08 + (i / (n - 1)) * w * 0.52;
        ctx.beginPath(); ctx.arc(x, deckY - h * 0.03, h * 0.03, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x, deckY + deckH + h * 0.03, h * 0.03, 0, Math.PI * 2); ctx.fill();
      }
    },
  },
  {
    id: 'str/dock', label: 'Dock with Mooring Posts', group: 'structures', sub: 'Ways & water (top-down)',
    tags: ['dock', 'quay', 'mooring'], aspect: 2, defaultWidth: 240, variants: 2, kinds: TD_KINDS,
    draw(a) {
      const { ctx, w, h, rng } = a;
      waterFill(a, w * 0.5, 0, w * 0.5, h);
      ctx.save();
      ctx.fillStyle = lightGradient(ctx, 0, 0, 0, h, stoneC(a), 0.22, 0.28);
      ctx.fillRect(0, h * 0.1, w * 0.54, h * 0.8);
      ctx.strokeStyle = rgba(ink(a), 0.65); ctx.lineWidth = Math.max(1, w * 0.012);
      ctx.strokeRect(0, h * 0.1, w * 0.54, h * 0.8);
      ctx.restore();
      ctx.fillStyle = ironC;
      for (const t of [0.22, 0.5, 0.78]) {
        const y = h * t;
        ctx.beginPath(); ctx.arc(w * 0.5, y, h * 0.035, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = rgba('#8a6a3a', 0.7); ctx.lineWidth = Math.max(1, h * 0.012);
        ctx.beginPath(); ctx.moveTo(w * 0.5, y); ctx.quadraticCurveTo(w * 0.62, y + h * 0.06, w * 0.7, y - h * 0.02); ctx.stroke();
      }
      if (rng.bool(0.7)) block(a, w * 0.16, h * 0.3, w * 0.12, w * 0.12, mix(woodC(a), '#000000', 0.05));
    },
  },
  {
    id: 'str/rowboat', label: 'Rowboat', group: 'structures', sub: 'Ways & water (top-down)',
    tags: ['boat', 'skiff', 'small craft'], aspect: 2.2, defaultWidth: 110, variants: 2, kinds: TD_KINDS,
    draw(a) {
      const { ctx, w, h } = a;
      waterFill(a, 0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      const hull: Vec2[] = [
        { x: cx - w * 0.42, y: cy }, { x: cx - w * 0.2, y: cy - h * 0.26 }, { x: cx + w * 0.2, y: cy - h * 0.26 },
        { x: cx + w * 0.42, y: cy }, { x: cx + w * 0.2, y: cy + h * 0.26 }, { x: cx - w * 0.2, y: cy + h * 0.26 },
      ];
      fillPath(ctx, hull, lightGradient(ctx, cx - w * 0.4, cy - h * 0.26, cx + w * 0.4, cy + h * 0.26, woodC(a), 0.26, 0.28));
      inkLine(ctx, hull, rgba(ink(a), 0.72), Math.max(1, w * 0.025), true);
      ctx.strokeStyle = rgba(woodDark, 0.6); ctx.lineWidth = Math.max(1, w * 0.018);
      for (const t of [-0.14, 0.14]) {
        ctx.beginPath(); ctx.moveTo(cx - w * 0.16, cy + h * t); ctx.lineTo(cx + w * 0.16, cy + h * t); ctx.stroke();
      }
      ctx.strokeStyle = rgba(woodDark, 0.7); ctx.lineWidth = Math.max(1, w * 0.015);
      ctx.beginPath(); ctx.moveTo(cx - w * 0.1, cy - h * 0.2); ctx.lineTo(cx - w * 0.58, cy - h * 0.4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - w * 0.1, cy + h * 0.2); ctx.lineTo(cx - w * 0.58, cy + h * 0.4); ctx.stroke();
    },
  },
  {
    id: 'str/sailing-boat', label: 'Sailing Boat', group: 'structures', sub: 'Ways & water (top-down)',
    tags: ['boat', 'sail', 'ship'], aspect: 1.4, defaultWidth: 150, variants: 2, kinds: TD_KINDS,
    draw(a) {
      const { ctx, w, h } = a;
      waterFill(a, 0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      const hull: Vec2[] = [
        { x: cx, y: cy - h * 0.4 }, { x: cx + w * 0.22, y: cy - h * 0.1 }, { x: cx + w * 0.16, y: cy + h * 0.38 },
        { x: cx - w * 0.16, y: cy + h * 0.38 }, { x: cx - w * 0.22, y: cy - h * 0.1 },
      ];
      fillPath(ctx, hull, lightGradient(ctx, cx - w * 0.2, cy - h * 0.4, cx + w * 0.2, cy + h * 0.38, woodC(a), 0.26, 0.3));
      inkLine(ctx, hull, rgba(ink(a), 0.72), Math.max(1, w * 0.02), true);
      ctx.fillStyle = mix(a.palette.parchment, '#efe6d2', 0.4);
      ctx.beginPath(); ctx.ellipse(cx, cy, w * 0.06, h * 0.24, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.55); ctx.lineWidth = Math.max(1, w * 0.015);
      ctx.stroke();
      ctx.fillStyle = woodDark;
      ctx.beginPath(); ctx.arc(cx, cy, w * 0.025, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.4); ctx.lineWidth = Math.max(1, w * 0.01);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - h * 0.36); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + h * 0.34); ctx.stroke();
    },
  },
  {
    id: 'str/river-barge', label: 'River Barge', group: 'structures', sub: 'Ways & water (top-down)',
    tags: ['barge', 'cargo', 'river'], aspect: 2.8, defaultWidth: 220, variants: 1, kinds: TD_KINDS,
    draw(a) {
      const { ctx, w, h, rng } = a;
      waterFill(a, 0, 0, w, h);
      const cy = h / 2;
      blockRound(a, w * 0.08, cy - h * 0.3, w * 0.84, h * 0.6, h * 0.16, lightGradient(ctx, 0, cy - h * 0.3, 0, cy + h * 0.3, woodC(a), 0.24, 0.3));
      const n = 4;
      for (let i = 0; i < n; i++) {
        const x = w * (0.2 + i * 0.16);
        const s = h * rng.float(0.22, 0.34);
        block(a, x, cy - s / 2, s, s, mix(woodC(a), '#000000', 0.1));
      }
      ctx.strokeStyle = rgba(woodDark, 0.8); ctx.lineWidth = Math.max(1, w * 0.012);
      ctx.beginPath(); ctx.moveTo(w * 0.9, cy); ctx.lineTo(w * 0.98, cy); ctx.stroke();
    },
  },
  {
    id: 'str/ferry-raft', label: 'Ferry Raft', group: 'structures', sub: 'Ways & water (top-down)',
    tags: ['raft', 'ferry', 'logs'], aspect: 1.8, defaultWidth: 170, variants: 1, kinds: TD_KINDS,
    draw(a) {
      const { ctx, w, h } = a;
      waterFill(a, 0, 0, w, h);
      const logs = 6;
      const lw = (w * 0.86) / logs;
      for (let i = 0; i < logs; i++) {
        const x = w * 0.07 + i * lw;
        ctx.save();
        ctx.fillStyle = lightGradient(ctx, x, h * 0.2, x + lw, h * 0.8, woodC(a), 0.24, 0.28);
        roundRect(ctx, x, h * 0.2, lw * 0.92, h * 0.6, lw * 0.4);
        ctx.fill();
        ctx.strokeStyle = rgba(ink(a), 0.5); ctx.lineWidth = Math.max(1, lw * 0.08); ctx.stroke();
        ctx.restore();
      }
      ctx.strokeStyle = rgba(woodDark, 0.7); ctx.lineWidth = Math.max(1, h * 0.02);
      ctx.beginPath(); ctx.moveTo(w * 0.06, h * 0.32); ctx.lineTo(w * 0.94, h * 0.32); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w * 0.06, h * 0.68); ctx.lineTo(w * 0.94, h * 0.68); ctx.stroke();
      ctx.fillStyle = mix(woodDark, '#000000', 0.1);
      const corners: [number, number][] = [[w * 0.08, h * 0.24], [w * 0.92, h * 0.24], [w * 0.08, h * 0.76], [w * 0.92, h * 0.76]];
      for (const [x, y] of corners) {
        ctx.beginPath(); ctx.arc(x, y, h * 0.03, 0, Math.PI * 2); ctx.fill();
      }
    },
  },
  {
    id: 'str/canal-lock', label: 'Canal Lock', group: 'structures', sub: 'Ways & water (top-down)',
    tags: ['lock', 'canal', 'gates'], aspect: 1.4, defaultWidth: 220, variants: 1, kinds: TD_KINDS,
    draw(a) {
      const { ctx, w, h } = a;
      waterFill(a, 0, h * 0.28, w, h * 0.44);
      const s = stoneC(a);
      block(a, w * 0.3, h * 0.22, w * 0.4, h * 0.56, lightGradient(ctx, 0, h * 0.22, 0, h * 0.78, mix(a.palette.shallowWater, s, 0.4), 0.2, 0.22));
      ctx.fillStyle = mix(s, '#000000', 0.05);
      ctx.fillRect(w * 0.3, h * 0.22, w * 0.04, h * 0.56);
      ctx.fillRect(w * 0.66, h * 0.22, w * 0.04, h * 0.56);
      ctx.strokeStyle = rgba(woodDark, 0.8); ctx.lineWidth = Math.max(1, w * 0.02);
      ctx.beginPath(); ctx.moveTo(w * 0.32, h * 0.28); ctx.lineTo(w * 0.4, h * 0.5); ctx.lineTo(w * 0.32, h * 0.72); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w * 0.68, h * 0.28); ctx.lineTo(w * 0.6, h * 0.5); ctx.lineTo(w * 0.68, h * 0.72); ctx.stroke();
      ctx.fillStyle = ironC;
      ctx.beginPath(); ctx.arc(w * 0.3, h * 0.24, w * 0.018, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(w * 0.7, h * 0.76, w * 0.018, 0, Math.PI * 2); ctx.fill();
    },
  },
  {
    id: 'str/ford', label: 'Ford', group: 'structures', sub: 'Ways & water (top-down)',
    tags: ['ford', 'crossing', 'shallows'], aspect: 2, defaultWidth: 190, variants: 2, kinds: TD_KINDS,
    draw(a) {
      const { ctx, w, h, rng } = a;
      waterFill(a, w * 0.3, 0, w * 0.4, h);
      ctx.fillStyle = rgba(a.palette.shallowWater, 0.85);
      ctx.fillRect(0, h * 0.4, w, h * 0.2);
      ctx.strokeStyle = rgba('#ffffff', 0.35); ctx.lineWidth = Math.max(1, h * 0.015);
      ctx.beginPath(); ctx.moveTo(0, h * 0.4); ctx.lineTo(w, h * 0.4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, h * 0.6); ctx.lineTo(w, h * 0.6); ctx.stroke();
      for (let i = 0; i < 5; i++) {
        const x = w * (0.28 + i * 0.12);
        const y = h * 0.5 + rng.float(-h * 0.03, h * 0.03);
        ctx.fillStyle = mix(stoneC(a), '#000000', rng.float(0, 0.15));
        ctx.beginPath(); ctx.ellipse(x, y, w * 0.035, h * 0.06, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = rgba(ink(a), 0.4); ctx.lineWidth = 1; ctx.stroke();
      }
    },
  },
  {
    id: 'str/well-head', label: 'Well-head', group: 'structures', sub: 'Ways & water (top-down)',
    tags: ['well', 'winch', 'water'], aspect: 1, defaultWidth: 90, variants: 2, kinds: TD_KINDS,
    draw(a) {
      const { ctx, w, h } = a;
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.3;
      groundShadow(ctx, cx + r * 0.1, cy + r * 0.12, r * 1.2, r * 1.05, 0.3);
      const s = stoneC(a);
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = lightGradient(ctx, cx - r, cy - r, cx + r, cy + r, s, 0.28, 0.3); ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.7); ctx.lineWidth = Math.max(1, r * 0.15); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#0e1416';
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rgba(a.palette.deepWater, 0.85);
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.48, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = mix(woodC(a), '#000000', 0.1);
      ctx.lineWidth = Math.max(1, r * 0.16);
      ctx.beginPath(); ctx.moveTo(cx - r * 1.2, cy + r * 0.35); ctx.lineTo(cx - r * 0.28, cy - r * 1.15); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + r * 1.2, cy + r * 0.35); ctx.lineTo(cx + r * 0.28, cy - r * 1.15); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - r * 0.28, cy - r * 1.15); ctx.lineTo(cx + r * 0.28, cy - r * 1.15); ctx.stroke();
      ctx.strokeStyle = rgba(woodDark, 0.6); ctx.lineWidth = Math.max(1, r * 0.06);
      ctx.beginPath(); ctx.moveTo(cx, cy - r * 1.15); ctx.lineTo(cx, cy - r * 0.18); ctx.stroke();
      ctx.fillStyle = mix(ironC, '#8a6a3a', 0.4);
      ctx.fillRect(cx - r * 0.14, cy - r * 0.32, r * 0.28, r * 0.18);
    },
  },

  // === World icons ===========================================================
  {
    id: 'str/abbey', label: 'Abbey', group: 'structures', sub: 'World icons',
    tags: ['monastery', 'church', 'cloister'], aspect: 1.3, defaultWidth: 130, variants: 2, kinds: WORLD_KINDS,
    draw(a) {
      const { ctx, w, h, rng } = a;
      const groundY = h * 0.9;
      groundShadow(ctx, w * 0.5, groundY, w * 0.4, h * 0.06, 0.26);
      const wallPts = blob(w * 0.44, h * 0.68, w * 0.32, h * 0.16, 5, 0.06, rng);
      fillPath(ctx, wallPts, rgba(a.palette.parchmentDark, 0.4));
      inkLine(ctx, wallPts, rgba(ink(a), 0.5), Math.max(1, w * 0.012));
      houseGlyph(a, w * 0.55, h * 0.38, w * 0.5, h * 0.5, tileRoofC(a), stoneC(a));
      towerGlyph(a, w * 0.86, groundY, w * 0.14, h * 0.56, a.variant % 2 === 0, stoneC(a));
      ctx.strokeStyle = rgba(ink(a), 0.8); ctx.lineWidth = Math.max(1, w * 0.012);
      ctx.beginPath(); ctx.moveTo(w * 0.86, groundY - h * 0.68); ctx.lineTo(w * 0.86, groundY - h * 0.78); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w * 0.82, groundY - h * 0.73); ctx.lineTo(w * 0.9, groundY - h * 0.73); ctx.stroke();
    },
  },
  {
    id: 'str/walled-city', label: 'Walled City', group: 'structures', sub: 'World icons',
    tags: ['city', 'walls', 'capital'], aspect: 1.3, defaultWidth: 160, variants: 2, kinds: WORLD_KINDS,
    draw(a) {
      const { w, h, rng } = a;
      const cx = w * 0.5, cy = h * 0.56;
      const outer = wallRing(a, cx, cy, w * 0.44, h * 0.4, 7, 0.07);
      const n = rng.int(8, 12);
      const spots: Vec2[] = [];
      for (let i = 0; i < n; i++) {
        const ang = rng.float(0, Math.PI * 2), r = Math.sqrt(rng.next()) * 0.72;
        spots.push({ x: cx + Math.cos(ang) * w * 0.36 * r, y: cy + Math.sin(ang) * h * 0.32 * r });
      }
      spots.sort((p, q) => p.y - q.y);
      for (const p of spots) houseGlyph(a, p.x, p.y - h * 0.08, w * rng.float(0.08, 0.12), h * rng.float(0.14, 0.2), tileRoofC(a), plasterC(a), rng.float(-0.1, 0.1));
      towerGlyph(a, cx, cy - h * 0.02, w * 0.09, h * 0.32, true, stoneC(a));
      for (let i = 0; i < 5; i++) {
        const p = outer[Math.floor((i / 5) * outer.length)];
        towerGlyph(a, p.x, p.y + h * 0.02, w * 0.05, h * 0.15, false, stoneC(a));
      }
    },
  },
  {
    id: 'str/hilltop-fort', label: 'Hilltop Fort', group: 'structures', sub: 'World icons',
    tags: ['fort', 'hill', 'stronghold'], aspect: 1.2, defaultWidth: 130, variants: 2, kinds: WORLD_KINDS,
    draw(a) {
      const { ctx, w, h, rng } = a;
      const groundY = h * 0.92;
      groundShadow(ctx, w * 0.5, groundY, w * 0.42, h * 0.05, 0.26);
      const hill = blob(w * 0.5, h * 0.72, w * 0.46, h * 0.26, 5, 0.08, rng);
      fillPath(ctx, hill, lightGradient(ctx, 0, h * 0.4, 0, groundY, mix(a.palette.highland, a.palette.grass, 0.4), 0.22, 0.2));
      inkLine(ctx, hill, rgba(ink(a), 0.5), Math.max(1, w * 0.012));
      const wallPts = blob(w * 0.5, h * 0.5, w * 0.28, h * 0.12, 6, 0.08, rng);
      fillPath(ctx, wallPts, rgba(a.palette.parchmentDark, 0.5));
      inkLine(ctx, wallPts, rgba(ink(a), 0.65), Math.max(1, w * 0.014));
      towerGlyph(a, w * 0.5, h * 0.5, w * 0.14, h * 0.34, true, stoneC(a));
    },
  },
  {
    id: 'str/motte-keep', label: 'Keep on a Motte', group: 'structures', sub: 'World icons',
    tags: ['motte', 'bailey', 'earthwork'], aspect: 1.0, defaultWidth: 110, variants: 2, kinds: WORLD_KINDS,
    draw(a) {
      const { ctx, w, h } = a;
      const groundY = h * 0.92;
      groundShadow(ctx, w * 0.5, groundY, w * 0.42, h * 0.05, 0.28);
      ctx.strokeStyle = rgba(woodDark, 0.7); ctx.lineWidth = Math.max(1, w * 0.02);
      for (let i = 0; i < 10; i++) {
        const x = w * (0.06 + i * 0.09);
        ctx.beginPath(); ctx.moveTo(x, groundY); ctx.lineTo(x, groundY - h * 0.1); ctx.stroke();
      }
      const mound: Vec2[] = [
        { x: w * 0.24, y: groundY - h * 0.06 }, { x: w * 0.36, y: h * 0.44 },
        { x: w * 0.64, y: h * 0.44 }, { x: w * 0.76, y: groundY - h * 0.06 },
      ];
      fillPath(ctx, mound, lightGradient(ctx, w * 0.24, h * 0.44, w * 0.76, groundY, mix(a.palette.highland, a.palette.lowland, 0.4), 0.24, 0.22));
      inkLine(ctx, mound, rgba(ink(a), 0.5), Math.max(1, w * 0.012), true);
      towerGlyph(a, w * 0.5, h * 0.46, w * 0.2, h * 0.34, a.variant % 2 === 0, woodC(a));
    },
  },
  {
    id: 'str/wizard-tower', label: "Wizard's Tower", group: 'structures', sub: 'World icons',
    tags: ['wizard', 'magic', 'spire'], aspect: 0.5, defaultWidth: 70, variants: 2, kinds: WORLD_KINDS,
    draw(a) {
      const { ctx, w, h, rng } = a;
      const groundY = h * 0.94;
      groundShadow(ctx, w * 0.5, groundY, w * 0.3, h * 0.03, 0.28);
      const hue = a.tint || rng.pick(['#7a4ad4', '#2ab0c4', '#8a4ad4']);
      towerGlyph(a, w * 0.5, groundY, w * 0.34, h * 0.72, false, stoneC(a));
      ctx.fillStyle = lightGradient(ctx, w * 0.2, groundY - h * 0.82, w * 0.8, groundY - h * 0.72, hue, 0.3, 0.2);
      ctx.beginPath();
      ctx.moveTo(w * 0.28, groundY - h * 0.72); ctx.lineTo(w * 0.5, groundY - h * 0.9); ctx.lineTo(w * 0.72, groundY - h * 0.72);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.6); ctx.lineWidth = Math.max(1, w * 0.02); ctx.stroke();
      radialGlow(ctx, w * 0.5, groundY - h * 0.9, w * 0.2, hue, 0.6);
    },
  },
  {
    id: 'str/obelisk', label: 'Obelisk', group: 'structures', sub: 'World icons',
    tags: ['monument', 'stone', 'ancient'], aspect: 0.35, defaultWidth: 50, variants: 2, kinds: WORLD_KINDS,
    draw(a) {
      const { ctx, w, h } = a;
      const groundY = h * 0.94;
      groundShadow(ctx, w * 0.5, groundY, w * 0.6, h * 0.025, 0.28);
      const s = stoneC(a);
      const topW = w * 0.3, botW = w * 0.7, tipY = h * 0.08, shoulderY = h * 0.16;
      const pts: Vec2[] = [
        { x: w * 0.5 - botW / 2, y: groundY }, { x: w * 0.5 - topW / 2, y: shoulderY },
        { x: w * 0.5, y: tipY }, { x: w * 0.5 + topW / 2, y: shoulderY }, { x: w * 0.5 + botW / 2, y: groundY },
      ];
      fillPath(ctx, pts, lightGradient(ctx, w * 0.5 - botW / 2, tipY, w * 0.5 + botW / 2, groundY, s, 0.3, 0.26));
      inkLine(ctx, pts, rgba(ink(a), 0.68), Math.max(1, w * 0.03), true);
      ctx.strokeStyle = rgba(ink(a), 0.3); ctx.lineWidth = Math.max(1, w * 0.015);
      for (let i = 0; i < 3; i++) {
        const y = shoulderY + (groundY - shoulderY) * ((i + 1) / 4);
        ctx.beginPath(); ctx.moveTo(w * 0.5 - botW * 0.25, y); ctx.lineTo(w * 0.5 + botW * 0.25, y); ctx.stroke();
      }
    },
  },
  {
    id: 'str/colossus', label: 'Colossus', group: 'structures', sub: 'World icons',
    tags: ['statue', 'giant', 'monument'], aspect: 0.6, defaultWidth: 80, variants: 2, kinds: WORLD_KINDS,
    draw(a) {
      const { ctx, w, h } = a;
      const groundY = h * 0.94;
      groundShadow(ctx, w * 0.5, groundY, w * 0.36, h * 0.03, 0.3);
      const s = mix(stoneC(a), '#b9b2a4', 0.35);
      block(a, w * 0.22, groundY - h * 0.1, w * 0.56, h * 0.1, lightGradient(ctx, 0, 0, 0, h * 0.1, s, 0.24, 0.26));
      ctx.fillStyle = lightGradient(ctx, w * 0.3, h * 0.2, w * 0.7, groundY - h * 0.1, s, 0.3, 0.28);
      ctx.fillRect(w * 0.36, h * 0.5, w * 0.1, groundY - h * 0.1 - h * 0.5);
      ctx.fillRect(w * 0.54, h * 0.5, w * 0.1, groundY - h * 0.1 - h * 0.5);
      ctx.beginPath();
      ctx.moveTo(w * 0.3, h * 0.5); ctx.lineTo(w * 0.36, h * 0.16); ctx.lineTo(w * 0.64, h * 0.16); ctx.lineTo(w * 0.7, h * 0.5);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.6); ctx.lineWidth = Math.max(1, w * 0.015); ctx.stroke();
      ctx.beginPath(); ctx.arc(w * 0.5, h * 0.1, w * 0.09, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (a.variant % 2 === 0) {
        ctx.strokeStyle = s; ctx.lineWidth = w * 0.06; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(w * 0.66, h * 0.24); ctx.lineTo(w * 0.82, h * 0.06); ctx.stroke();
      }
    },
  },
  {
    id: 'str/arch-monument', label: 'Gateway Arch', group: 'structures', sub: 'World icons',
    tags: ['arch', 'monument', 'gateway'], aspect: 1.1, defaultWidth: 100, variants: 1, kinds: WORLD_KINDS,
    draw(a) {
      const { ctx, w, h } = a;
      const groundY = h * 0.92;
      groundShadow(ctx, w * 0.5, groundY, w * 0.38, h * 0.04, 0.28);
      const s = stoneC(a);
      const legW = w * 0.18;
      ctx.fillStyle = lightGradient(ctx, 0, h * 0.2, 0, groundY, s, 0.28, 0.26);
      ctx.fillRect(w * 0.14, h * 0.36, legW, groundY - h * 0.36);
      ctx.fillRect(w * 0.86 - legW, h * 0.36, legW, groundY - h * 0.36);
      ctx.strokeStyle = rgba(ink(a), 0.65); ctx.lineWidth = Math.max(1, w * 0.015);
      ctx.strokeRect(w * 0.14, h * 0.36, legW, groundY - h * 0.36);
      ctx.strokeRect(w * 0.86 - legW, h * 0.36, legW, groundY - h * 0.36);
      ctx.beginPath();
      ctx.moveTo(w * 0.14, h * 0.36);
      ctx.arc(w * 0.5, h * 0.36, w * 0.36, Math.PI, 0);
      ctx.lineTo(w * 0.86, h * 0.36);
      ctx.lineWidth = h * 0.14;
      ctx.strokeStyle = lightGradient(ctx, 0, h * 0.06, 0, h * 0.36, s, 0.3, 0.22);
      ctx.stroke();
      ctx.strokeStyle = rgba(ink(a), 0.6); ctx.lineWidth = Math.max(1, w * 0.014); ctx.stroke();
    },
  },
  {
    id: 'str/caravanserai', label: 'Caravanserai', group: 'structures', sub: 'World icons',
    tags: ['desert', 'trade', 'inn'], aspect: 1.6, defaultWidth: 150, variants: 1, kinds: WORLD_KINDS,
    draw(a) {
      const { ctx, w, h } = a;
      const groundY = h * 0.9;
      groundShadow(ctx, w * 0.5, groundY, w * 0.44, h * 0.05, 0.28);
      const s = mix(stoneC(a), a.palette.desert, 0.35);
      block(a, w * 0.08, h * 0.38, w * 0.84, groundY - h * 0.38, lightGradient(ctx, 0, h * 0.38, 0, groundY, s, 0.24, 0.24));
      towerGlyph(a, w * 0.12, groundY, w * 0.1, h * 0.46, false, s);
      towerGlyph(a, w * 0.88, groundY, w * 0.1, h * 0.46, false, s);
      ctx.fillStyle = '#0d0b09';
      ctx.beginPath();
      ctx.moveTo(w * 0.42, groundY); ctx.lineTo(w * 0.42, h * 0.54);
      ctx.arc(w * 0.5, h * 0.54, w * 0.08, Math.PI, 0);
      ctx.lineTo(w * 0.58, groundY);
      ctx.closePath(); ctx.fill();
    },
  },
  {
    id: 'str/trading-post', label: 'Trading Post', group: 'structures', sub: 'World icons',
    tags: ['outpost', 'frontier', 'palisade'], aspect: 1.3, defaultWidth: 110, variants: 1, kinds: WORLD_KINDS,
    draw(a) {
      const { ctx, w, h } = a;
      const groundY = h * 0.92;
      groundShadow(ctx, w * 0.5, groundY, w * 0.4, h * 0.04, 0.26);
      ctx.strokeStyle = rgba(woodDark, 0.75); ctx.lineWidth = Math.max(1, w * 0.018);
      for (let i = 0; i < 9; i++) {
        const x = w * (0.06 + i * 0.11);
        ctx.beginPath(); ctx.moveTo(x, groundY); ctx.lineTo(x, groundY - h * 0.28); ctx.stroke();
      }
      houseGlyph(a, w * 0.5, h * 0.42, w * 0.44, h * 0.44, tileRoofC(a), plasterC(a));
      flag(a, w * 0.5, h * 0.06, h * 0.2, w * 0.1);
    },
  },
  {
    id: 'str/fishing-village', label: 'Fishing Village', group: 'structures', sub: 'World icons',
    tags: ['coast', 'boats', 'nets'], aspect: 1.6, defaultWidth: 130, variants: 2, kinds: WORLD_KINDS,
    draw(a) {
      const { ctx, w, h, rng } = a;
      waterFill(a, 0, h * 0.72, w, h * 0.22);
      const n = rng.int(3, 4);
      for (let i = 0; i < n; i++) {
        const x = w * (0.16 + i * 0.24);
        houseGlyph(a, x, h * (0.42 + rng.float(-0.04, 0.04)), w * 0.2, h * 0.32, thatchC(a), plasterC(a), rng.float(-0.06, 0.06));
      }
      ctx.strokeStyle = rgba(woodDark, 0.7); ctx.lineWidth = Math.max(1, w * 0.012);
      ctx.beginPath(); ctx.moveTo(w * 0.06, h * 0.7); ctx.lineTo(w * 0.06, h * 0.5); ctx.lineTo(w * 0.2, h * 0.5); ctx.lineTo(w * 0.2, h * 0.7); ctx.stroke();
      ctx.strokeStyle = rgba(ink(a), 0.3);
      for (let i = 0; i < 4; i++) {
        const y = h * (0.53 + i * 0.04);
        ctx.beginPath(); ctx.moveTo(w * 0.07, y); ctx.lineTo(w * 0.19, y); ctx.stroke();
      }
      ctx.fillStyle = mix(woodC(a), '#000000', 0.1);
      ctx.beginPath();
      ctx.moveTo(w * 0.62, h * 0.82); ctx.quadraticCurveTo(w * 0.78, h * 0.72, w * 0.94, h * 0.82);
      ctx.quadraticCurveTo(w * 0.78, h * 0.88, w * 0.62, h * 0.82);
      ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.6); ctx.lineWidth = Math.max(1, w * 0.01); ctx.stroke();
    },
  },
  {
    id: 'str/logging-camp', label: 'Logging Camp', group: 'structures', sub: 'World icons',
    tags: ['timber', 'woodcutting', 'forest'], aspect: 1.5, defaultWidth: 120, variants: 1, kinds: WORLD_KINDS,
    draw(a) {
      const { ctx, w, h, rng } = a;
      const groundY = h * 0.92;
      groundShadow(ctx, w * 0.3, groundY, w * 0.24, h * 0.04, 0.24);
      houseGlyph(a, w * 0.24, h * 0.56, w * 0.3, h * 0.4, thatchC(a), woodC(a));
      const lx = w * 0.62, ly = groundY - h * 0.02;
      for (let row = 0; row < 3; row++) {
        for (let i = 0; i < 4 - row; i++) {
          const x = lx + i * w * 0.08 + row * w * 0.04;
          const y = ly - row * h * 0.09;
          ctx.fillStyle = lightGradient(ctx, x - w * 0.04, y - h * 0.045, x + w * 0.04, y + h * 0.045, woodC(a), 0.3, 0.2);
          ctx.beginPath(); ctx.ellipse(x, y, w * 0.045, h * 0.05, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = rgba(woodDark, 0.6); ctx.lineWidth = 1; ctx.stroke();
        }
      }
      ctx.fillStyle = mix('#c9b089', '#000000', 0.08);
      ctx.beginPath(); ctx.ellipse(w * 0.5, groundY, w * 0.06, h * 0.03, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.5); ctx.lineWidth = 1; ctx.stroke();
    },
  },
  {
    id: 'str/quarry', label: 'Quarry', group: 'structures', sub: 'World icons',
    tags: ['stone', 'mining', 'terraces'], aspect: 1.4, defaultWidth: 130, variants: 1, kinds: WORLD_KINDS,
    draw(a) {
      const { ctx, w, h, rng } = a;
      const s = stoneC(a);
      groundShadow(ctx, w * 0.5, h * 0.9, w * 0.44, h * 0.05, 0.26);
      const steps = 4;
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        const y0 = h * (0.3 + t * 0.5), sw = w * (0.86 - t * 0.5);
        ctx.fillStyle = mix(s, '#000000', t * 0.28);
        ctx.fillRect(w * 0.5 - sw / 2, y0, sw, h * 0.16);
        ctx.strokeStyle = rgba(ink(a), 0.4); ctx.lineWidth = Math.max(1, w * 0.01);
        ctx.strokeRect(w * 0.5 - sw / 2, y0, sw, h * 0.16);
      }
      for (let i = 0; i < 4; i++) {
        const x = rng.float(w * 0.2, w * 0.8), y = h * rng.float(0.82, 0.9);
        const bw = w * rng.float(0.06, 0.1);
        ctx.fillStyle = mix(s, '#ffffff', 0.1);
        ctx.fillRect(x - bw / 2, y - bw * 0.35, bw, bw * 0.7);
        ctx.strokeStyle = rgba(ink(a), 0.4); ctx.strokeRect(x - bw / 2, y - bw * 0.35, bw, bw * 0.7);
      }
    },
  },
  {
    id: 'str/smelter', label: 'Smelter', group: 'structures', sub: 'World icons',
    tags: ['furnace', 'smoke', 'industry'], aspect: 1.0, defaultWidth: 100, variants: 1, kinds: WORLD_KINDS,
    draw(a) {
      const { ctx, w, h } = a;
      const groundY = h * 0.9;
      groundShadow(ctx, w * 0.5, groundY, w * 0.36, h * 0.05, 0.28);
      const s = mix(stoneC(a), '#000000', 0.1);
      block(a, w * 0.22, h * 0.42, w * 0.56, groundY - h * 0.42, lightGradient(ctx, 0, h * 0.42, 0, groundY, s, 0.24, 0.24));
      block(a, w * 0.6, h * 0.1, w * 0.14, h * 0.34, lightGradient(ctx, 0, h * 0.1, 0, h * 0.44, s, 0.26, 0.22));
      smoke(a, w * 0.67, h * 0.1, w * 0.16);
      radialGlow(ctx, w * 0.5, groundY - h * 0.06, w * 0.14, '#ff7a2a', 0.5);
    },
  },
  {
    id: 'str/ruined-tower', label: 'Ruined Tower', group: 'structures', sub: 'World icons',
    tags: ['ruin', 'broken', 'tower'], aspect: 0.6, defaultWidth: 70, variants: 2, kinds: WORLD_KINDS,
    draw(a) {
      const { ctx, w, h, rng } = a;
      const groundY = h * 0.94;
      groundShadow(ctx, w * 0.5, groundY, w * 0.32, h * 0.03, 0.28);
      const s = mix(stoneC(a), '#8b8578', 0.35);
      const topY = h * rng.float(0.18, 0.32);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(w * 0.28, groundY);
      ctx.lineTo(w * 0.3, topY + h * 0.1);
      ctx.lineTo(w * 0.44, topY);
      ctx.lineTo(w * 0.6, topY + h * 0.08);
      ctx.lineTo(w * 0.72, groundY);
      ctx.closePath();
      ctx.fillStyle = lightGradient(ctx, w * 0.28, topY, w * 0.72, groundY, s, 0.28, 0.3);
      ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.62); ctx.lineWidth = Math.max(1, w * 0.03); ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = rgba('#000000', 0.35); ctx.lineWidth = Math.max(1, w * 0.012);
      ctx.beginPath(); ctx.moveTo(w * 0.46, topY + h * 0.14); ctx.lineTo(w * 0.4, h * 0.6); ctx.lineTo(w * 0.48, groundY - h * 0.06); ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const x = w * (0.2 + i * 0.22), y = groundY - h * rng.float(0, 0.02);
        const bw = w * 0.09;
        ctx.fillStyle = s;
        ctx.fillRect(x, y - bw * 0.4, bw, bw * 0.4);
        ctx.strokeStyle = rgba(ink(a), 0.5); ctx.strokeRect(x, y - bw * 0.4, bw, bw * 0.4);
      }
    },
  },
  {
    id: 'str/barrow-mound', label: 'Barrow Mound', group: 'structures', sub: 'World icons',
    tags: ['tomb', 'burial', 'ancient'], aspect: 1.6, defaultWidth: 110, variants: 2, kinds: WORLD_KINDS,
    draw(a) {
      const { ctx, w, h, rng } = a;
      const groundY = h * 0.88;
      groundShadow(ctx, w * 0.5, groundY, w * 0.44, h * 0.05, 0.26);
      const mound = blob(w * 0.5, groundY - h * 0.02, w * 0.42, h * 0.24, 5, 0.08, rng);
      fillPath(ctx, mound, lightGradient(ctx, 0, h * 0.4, 0, groundY, a.palette.grass, 0.2, 0.24));
      inkLine(ctx, mound, rgba(ink(a), 0.5), Math.max(1, w * 0.012));
      ctx.fillStyle = '#0d0b09';
      ctx.beginPath(); ctx.ellipse(w * 0.5, groundY - h * 0.02, w * 0.08, h * 0.1, 0, 0, Math.PI * 2); ctx.fill();
      const s = stoneC(a);
      for (const sx of [w * 0.32, w * 0.68]) {
        ctx.fillStyle = mix(s, '#000000', 0.1);
        ctx.fillRect(sx - w * 0.025, groundY - h * 0.28, w * 0.05, h * 0.28);
        ctx.strokeStyle = rgba(ink(a), 0.5); ctx.lineWidth = 1; ctx.strokeRect(sx - w * 0.025, groundY - h * 0.28, w * 0.05, h * 0.28);
      }
    },
  },
  {
    id: 'str/hermitage', label: 'Hermitage', group: 'structures', sub: 'World icons',
    tags: ['hermit', 'cave', 'solitary'], aspect: 1.2, defaultWidth: 90, variants: 1, kinds: WORLD_KINDS,
    draw(a) {
      const { ctx, w, h, rng } = a;
      const groundY = h * 0.92;
      groundShadow(ctx, w * 0.55, groundY, w * 0.4, h * 0.04, 0.26);
      const rock = blob(w * 0.68, h * 0.5, w * 0.34, h * 0.42, 5, 0.14, rng);
      fillPath(ctx, rock, lightGradient(ctx, 0, h * 0.1, 0, groundY, stoneC(a), 0.2, 0.26));
      inkLine(ctx, rock, rgba(ink(a), 0.5), Math.max(1, w * 0.012));
      houseGlyph(a, w * 0.32, h * 0.6, w * 0.32, h * 0.34, thatchC(a), plasterC(a));
      ctx.fillStyle = rgba(a.palette.grass, 0.5);
      ctx.beginPath(); ctx.ellipse(w * 0.36, groundY - h * 0.02, w * 0.14, h * 0.03, 0, 0, Math.PI * 2); ctx.fill();
    },
  },
  {
    id: 'str/toll-bridge', label: 'Toll Bridge', group: 'structures', sub: 'World icons',
    tags: ['bridge', 'toll', 'gate'], aspect: 1.8, defaultWidth: 110, variants: 1, kinds: WORLD_KINDS,
    draw(a) {
      const { ctx, w, h } = a;
      const s = stoneC(a);
      ctx.fillStyle = lightGradient(ctx, 0, h * 0.3, 0, h * 0.7, s, 0.25, 0.3);
      ctx.beginPath();
      ctx.moveTo(0, h * 0.62);
      ctx.quadraticCurveTo(w * 0.5, h * 0.22, w, h * 0.62);
      ctx.lineTo(w, h * 0.72);
      ctx.quadraticCurveTo(w * 0.5, h * 0.34, 0, h * 0.72);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.68); ctx.lineWidth = Math.max(1, h * 0.02); ctx.stroke();
      houseGlyph(a, w * 0.2, h * 0.42, w * 0.24, h * 0.32, tileRoofC(a), plasterC(a));
      ctx.strokeStyle = rgba('#c9463f', 0.85); ctx.lineWidth = Math.max(1, w * 0.02);
      ctx.beginPath(); ctx.moveTo(w * 0.32, h * 0.56); ctx.lineTo(w * 0.56, h * 0.5); ctx.stroke();
    },
  },
  {
    id: 'str/waystation-inn', label: 'Waystation Inn', group: 'structures', sub: 'World icons',
    tags: ['inn', 'roadside', 'travel'], aspect: 1.4, defaultWidth: 110, variants: 1, kinds: WORLD_KINDS,
    draw(a) {
      const { ctx, w, h } = a;
      const groundY = h * 0.9;
      groundShadow(ctx, w * 0.5, groundY, w * 0.42, h * 0.05, 0.26);
      houseGlyph(a, w * 0.42, h * 0.5, w * 0.4, h * 0.4, tileRoofC(a), plasterC(a));
      ctx.fillStyle = lightGradient(ctx, w * 0.68, h * 0.56, w * 0.94, groundY, woodC(a), 0.24, 0.26);
      ctx.beginPath();
      ctx.moveTo(w * 0.66, groundY); ctx.lineTo(w * 0.66, h * 0.64); ctx.lineTo(w * 0.94, h * 0.56); ctx.lineTo(w * 0.94, groundY);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.55); ctx.lineWidth = Math.max(1, w * 0.012); ctx.stroke();
      ctx.strokeStyle = rgba(woodDark, 0.75); ctx.lineWidth = Math.max(1, w * 0.015);
      ctx.beginPath(); ctx.moveTo(w * 0.14, groundY); ctx.lineTo(w * 0.14, h * 0.32); ctx.lineTo(w * 0.28, h * 0.32); ctx.stroke();
      ctx.fillStyle = a.palette.accent;
      ctx.fillRect(w * 0.16, h * 0.34, w * 0.1, h * 0.1);
    },
  },
  {
    id: 'str/shipyard', label: 'Shipyard', group: 'structures', sub: 'World icons',
    tags: ['ship', 'construction', 'dock'], aspect: 1.7, defaultWidth: 140, variants: 1, kinds: WORLD_KINDS,
    draw(a) {
      const { ctx, w, h } = a;
      waterFill(a, w * 0.7, h * 0.5, w * 0.3, h * 0.4);
      ctx.fillStyle = mix(woodC(a), '#000000', 0.1);
      ctx.fillRect(w * 0.5, h * 0.5, w * 0.26, h * 0.1);
      const keelY = h * 0.68;
      ctx.strokeStyle = rgba(woodDark, 0.8); ctx.lineWidth = Math.max(1, w * 0.015);
      ctx.beginPath(); ctx.moveTo(w * 0.06, keelY); ctx.lineTo(w * 0.5, keelY); ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const x = w * (0.1 + i * 0.07);
        const rh = h * (0.14 + Math.sin((i / 5) * Math.PI) * 0.1);
        ctx.beginPath();
        ctx.moveTo(x, keelY);
        ctx.quadraticCurveTo(x - w * 0.02, keelY - rh, x, keelY - rh * 1.1);
        ctx.quadraticCurveTo(x + w * 0.02, keelY - rh, x + w * 0.05, keelY);
        ctx.stroke();
      }
      ctx.strokeStyle = rgba(woodC(a), 0.8); ctx.lineWidth = Math.max(1, w * 0.012);
      ctx.beginPath(); ctx.moveTo(w * 0.54, keelY); ctx.lineTo(w * 0.54, h * 0.3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w * 0.54, h * 0.44); ctx.lineTo(w * 0.42, h * 0.44); ctx.stroke();
    },
  },
];
