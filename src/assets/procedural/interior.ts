/**
 * Room-scale interior furnishings — the "dressing" layer a GM drops onto a
 * dungeon or building interior once the walls are down. dungeon.ts covers
 * the load-bearing pieces (doors, stairs, a handful of furniture); this file
 * is the deep catalogue of what actually fills a room, grouped by the kind
 * of room it belongs to so the picker doesn't turn into one long scroll.
 * Everything is seen from directly above, same as the rest of the interior
 * set: a bed is a rectangle of bedding with a pillow, not an elevation.
 */
import type { AssetDef, AssetDrawArgs } from '../types';
import {
  blob, fillPath, groundShadow, inkLine, lightGradient, radialGlow,
  regularPolygon, roundRect, speckle, star, tracePath,
} from '../draw';
import { mix, rgba } from '../../core/color';
import type { Vec2 } from '../../core/types';

// --- Shared colour + drawing helpers ---------------------------------------

const ink = (a: AssetDrawArgs) => a.palette.ink;
const woodBase = '#6b4a2a';
const woodDark = '#3f2b16';
const iron = '#4b5054';
const ironLight = '#8b9096';
const brassBase = '#b8933a';

const wood = (a: AssetDrawArgs, base: string = woodBase) => (a.tint ? mix(base, a.tint, a.tintStrength) : base);
const brass = (a: AssetDrawArgs) => (a.tint ? mix(brassBase, a.tint, a.tintStrength * 0.5) : brassBase);
const stoneC = (a: AssetDrawArgs) => mix(a.palette.rock, '#8a8175', 0.45);
const cloth = (a: AssetDrawArgs, base: string) => (a.tint ? mix(base, a.tint, a.tintStrength) : base);

function outlined(a: AssetDrawArgs, drawShape: () => void, fill: string | CanvasGradient, strokeAlpha = 0.75, lw = 0.02): void {
  const { ctx, w } = a;
  ctx.save();
  drawShape();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = rgba(ink(a), strokeAlpha);
  ctx.lineWidth = Math.max(1, w * lw);
  ctx.stroke();
  ctx.restore();
}

function plank(a: AssetDrawArgs, x: number, y: number, w: number, h: number, n = 4, base?: string): void {
  const { ctx } = a;
  const baseColor = base ?? wood(a);
  ctx.save();
  roundRect(ctx, x, y, w, h, Math.min(w, h) * 0.08);
  ctx.clip();
  ctx.fillStyle = lightGradient(ctx, x, y, x + w, y + h, baseColor, 0.24, 0.3);
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = rgba(woodDark, 0.55);
  ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.03);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    ctx.beginPath();
    if (w > h) { ctx.moveTo(x + w * t, y); ctx.lineTo(x + w * t, y + h); }
    else { ctx.moveTo(x, y + h * t); ctx.lineTo(x + w, y + h * t); }
    ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  roundRect(ctx, x, y, w, h, Math.min(w, h) * 0.08);
  ctx.strokeStyle = rgba(ink(a), 0.7);
  ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.06);
  ctx.stroke();
  ctx.restore();
}

/** A round stool or seat cushion, top-down. */
function stool(a: AssetDrawArgs, cx: number, cy: number, r: number): void {
  const { ctx } = a;
  groundShadow(ctx, cx + r * 0.15, cy + r * 0.2, r * 1.05, r, 0.26);
  outlined(a, () => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); },
    lightGradient(ctx, cx - r, cy - r, cx + r, cy + r, wood(a), 0.26, 0.3));
  ctx.strokeStyle = rgba(woodDark, 0.5);
  ctx.lineWidth = Math.max(1, r * 0.1);
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.58, 0, Math.PI * 2); ctx.stroke();
}

/** A round glass vessel with a coloured contents and a highlight. */
function jar(a: AssetDrawArgs, cx: number, cy: number, r: number, liquid: string, glassAlpha = 0.3): void {
  const { ctx } = a;
  outlined(a, () => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); }, rgba('#dfe9e6', glassAlpha), 0.55, 0.03);
  ctx.fillStyle = rgba(liquid, 0.85);
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = rgba('#ffffff', 0.5);
  ctx.beginPath(); ctx.arc(cx - r * 0.24, cy - r * 0.24, r * 0.16, 0, Math.PI * 2); ctx.fill();
}

/** A lit candle: a small brass base, a flame, and a warm glow. */
function candleFlame(a: AssetDrawArgs, cx: number, cy: number, r: number): void {
  const { ctx } = a;
  radialGlow(ctx, cx, cy, r * 5, '#ffb15c', 0.5);
  ctx.fillStyle = brass(a);
  ctx.beginPath(); ctx.arc(cx, cy, r * 1.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffd06a';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
}

/** A cloth sack, seen from above: an organic blob cinched at the neck. */
function sackBlob(a: AssetDrawArgs, cx: number, cy: number, r: number, color: string): void {
  const { ctx, rng } = a;
  const pts = blob(cx, cy, r, r * 0.92, 5, 0.14, rng);
  fillPath(ctx, pts, color);
  inkLine(ctx, pts, rgba(ink(a), 0.45), Math.max(1, r * 0.08), true);
  ctx.strokeStyle = rgba(woodDark, 0.5);
  ctx.lineWidth = Math.max(1, r * 0.1);
  ctx.beginPath(); ctx.moveTo(cx - r * 0.18, cy - r * 0.75); ctx.lineTo(cx + r * 0.18, cy - r * 0.6); ctx.stroke();
}

/** A tall-necked jar, seen from above as a lobed oval. */
function amphora(a: AssetDrawArgs, cx: number, cy: number, r: number, color: string): void {
  const { ctx } = a;
  groundShadow(ctx, cx + r * 0.1, cy + r * 0.14, r * 1.1, r * 1.2, 0.28);
  outlined(a, () => { ctx.beginPath(); ctx.ellipse(cx, cy, r * 0.85, r, 0, 0, Math.PI * 2); }, color, 0.6, 0.03);
  ctx.fillStyle = rgba('#000000', 0.16);
  ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.3, r * 0.45, r * 0.32, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = rgba('#ffffff', 0.35);
  ctx.beginPath(); ctx.ellipse(cx - r * 0.2, cy - r * 0.35, r * 0.16, r * 0.24, 0, 0, Math.PI * 2); ctx.fill();
}

/** An organic bundle — herbs, game, a hanging coat — as a loose blob. */
function bundle(a: AssetDrawArgs, cx: number, cy: number, r: number, color: string): void {
  const { ctx, rng } = a;
  const pts = blob(cx, cy, r, r * 1.3, 3, 0.22, rng);
  fillPath(ctx, pts, color);
  inkLine(ctx, pts, rgba(ink(a), 0.4), Math.max(1, r * 0.1), true);
}

/** A wall-mounted shelf unit: a plank shelf divided into rows of goods. */
function railShelf(
  a: AssetDrawArgs, x: number, y: number, w: number, h: number, rows: number,
  item: (rx: number, ry: number, rw: number, rh: number, row: number) => void,
): void {
  const { ctx } = a;
  plank(a, x, y, w, h, 2);
  const rh = h / rows;
  for (let r = 0; r < rows; r++) item(x, y + rh * r, w, rh, r);
  ctx.strokeStyle = rgba(ink(a), 0.55);
  ctx.lineWidth = Math.max(1, h * 0.02);
  for (let r = 1; r < rows; r++) {
    ctx.beginPath(); ctx.moveTo(x, y + rh * r); ctx.lineTo(x + w, y + rh * r); ctx.stroke();
  }
}

/** A woven chain: a heavy wavy ink line, bold enough to read at a glance. */
function chainLine(ctx: CanvasRenderingContext2D, pts: Vec2[], color: string, width: number): void {
  inkLine(ctx, pts, color, width);
  for (const p of pts) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(p.x, p.y, width * 0.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

/**
 * A rectangular woven rug — the single most useful piece of room dressing a
 * GM drops down, so it gets real patterns instead of a flat tint. Four
 * distinct weaves keyed off the variant: bordered medallion, motif grid,
 * banded kilim, diamond lattice.
 */
function weaveRug(a: AssetDrawArgs, x: number, y: number, w: number, h: number, colors: [string, string, string]): void {
  const { ctx, rng } = a;
  const cx = x + w / 2, cy = y + h / 2;
  const short = Math.min(w, h);
  const [base, border, accent] = colors;
  groundShadow(ctx, cx, cy + h * 0.04, w * 0.52, h * 0.52, 0.22);
  outlined(a, () => roundRect(ctx, x, y, w, h, short * 0.03), base, 0.55, 0.012);
  ctx.save();
  roundRect(ctx, x, y, w, h, short * 0.03);
  ctx.clip();
  const style = a.variant % 4;
  if (style === 0) {
    const bands = 4;
    for (let i = 0; i < bands; i++) {
      const inset = short * (0.05 + i * 0.045);
      ctx.strokeStyle = rgba(i % 2 === 0 ? border : accent, 0.85);
      ctx.lineWidth = Math.max(1, short * 0.018);
      roundRect(ctx, x + inset, y + inset, w - inset * 2, h - inset * 2, short * 0.02);
      ctx.stroke();
    }
    const dpts = star(cx, cy, short * 0.22, short * 0.1, 8);
    fillPath(ctx, dpts, rgba(accent, 0.85));
    inkLine(ctx, dpts, rgba(border, 0.9), Math.max(1, short * 0.015), true);
  } else if (style === 1) {
    const cols = Math.max(2, Math.round(w / (short * 0.24)));
    const rows = Math.max(2, Math.round(h / (short * 0.24)));
    const cw = w / cols, ch = h / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const mx = x + cw * (c + 0.5), my = y + ch * (r + 0.5);
        const mr = Math.min(cw, ch) * 0.3;
        const pts = regularPolygon(mx, my, mr, 4, Math.PI / 4);
        fillPath(ctx, pts, rgba(accent, 0.7));
        inkLine(ctx, pts, rgba(border, 0.6), 1, true);
      }
    }
    ctx.strokeStyle = rgba(border, 0.9);
    ctx.lineWidth = Math.max(1, short * 0.02);
    roundRect(ctx, x + w * 0.04, y + h * 0.05, w * 0.92, h * 0.9, short * 0.02);
    ctx.stroke();
  } else if (style === 2) {
    const bands = rng.int(5, 8);
    for (let i = 0; i < bands; i++) {
      const t0 = i / bands, t1 = (i + 1) / bands;
      ctx.fillStyle = rgba(i % 2 === 0 ? border : accent, 0.55);
      ctx.fillRect(x, y + h * t0, w, h * (t1 - t0) + 1);
    }
    ctx.strokeStyle = rgba(base, 0.85);
    ctx.lineWidth = Math.max(1, short * 0.015);
    const midY = y + h / 2;
    for (let i = 0; i < 6; i++) {
      const cx2 = x + w * ((i + 0.5) / 6);
      ctx.beginPath();
      ctx.moveTo(cx2 - w * 0.05, midY + h * 0.12);
      ctx.lineTo(cx2, midY - h * 0.1);
      ctx.lineTo(cx2 + w * 0.05, midY + h * 0.12);
      ctx.stroke();
    }
  } else {
    const step = short * 0.18;
    ctx.strokeStyle = rgba(border, 0.75);
    ctx.lineWidth = Math.max(1, short * 0.012);
    for (let d = -h; d < w + h; d += step) {
      ctx.beginPath(); ctx.moveTo(x + d, y); ctx.lineTo(x + d - h, y + h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + d, y + h); ctx.lineTo(x + d - h, y); ctx.stroke();
    }
    const dpts = regularPolygon(cx, cy, short * 0.2, 4, Math.PI / 4);
    fillPath(ctx, dpts, rgba(accent, 0.85));
    inkLine(ctx, dpts, rgba(border, 0.9), Math.max(1, short * 0.015), true);
  }
  ctx.restore();
  ctx.strokeStyle = rgba(border, 0.5);
  ctx.lineWidth = Math.max(1, short * 0.01);
  const fringeN = Math.max(4, Math.round(w / (short * 0.06)));
  for (let i = 0; i < fringeN; i++) {
    const fx = x + (w / fringeN) * (i + 0.5);
    ctx.beginPath(); ctx.moveTo(fx, y - h * 0.005); ctx.lineTo(fx, y - h * 0.035); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(fx, y + h + h * 0.005); ctx.lineTo(fx, y + h + h * 0.035); ctx.stroke();
  }
}

export const INTERIOR_ASSETS: AssetDef[] = [
  // --- Kitchen ---------------------------------------------------------
  {
    id: 'int/hearth-fire', label: 'Cooking Hearth', group: 'furniture', sub: 'Kitchen',
    tags: ['kitchen', 'fire', 'cooking', 'light'], aspect: 1.3, defaultWidth: 130, variants: 2,
    kinds: ['dungeon', 'city', 'battle'],
    draw(a) {
      const { ctx, w, h } = a;
      const s = stoneC(a);
      groundShadow(ctx, w * 0.52, h * 0.6, w * 0.44, h * 0.34, 0.32);
      const arched = a.variant % 2 === 0;
      if (arched) {
        outlined(a, () => roundRect(ctx, w * 0.06, h * 0.1, w * 0.88, h * 0.8, w * 0.16),
          lightGradient(ctx, w * 0.06, h * 0.1, w * 0.94, h * 0.9, s, 0.26, 0.34));
      } else {
        outlined(a, () => roundRect(ctx, w * 0.04, h * 0.06, w * 0.92, h * 0.88, w * 0.03),
          lightGradient(ctx, w * 0.04, h * 0.06, w * 0.96, h * 0.94, s, 0.26, 0.34));
        ctx.fillStyle = mix(s, '#000000', 0.2);
        ctx.fillRect(w * 0.04, h * 0.06, w * 0.92, h * 0.1);
      }
      radialGlow(ctx, w * 0.5, h * 0.56, w * 0.5, '#ff8a3c', 0.55);
      ctx.fillStyle = '#0e0c0a';
      ctx.beginPath(); ctx.ellipse(w * 0.5, h * 0.58, w * 0.3, h * 0.22, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff9a3c';
      ctx.beginPath(); ctx.ellipse(w * 0.5, h * 0.58, w * 0.18, h * 0.13, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffe08a';
      ctx.beginPath(); ctx.ellipse(w * 0.5, h * 0.58, w * 0.08, h * 0.06, 0, 0, Math.PI * 2); ctx.fill();
      // Pot hook over the coals.
      ctx.strokeStyle = iron;
      ctx.lineWidth = Math.max(1, w * 0.018);
      ctx.beginPath(); ctx.moveTo(w * 0.5, h * 0.14); ctx.lineTo(w * 0.5, h * 0.34); ctx.stroke();
    },
  },
  {
    id: 'int/stone-oven', label: 'Stone Oven', group: 'furniture', sub: 'Kitchen',
    tags: ['kitchen', 'oven', 'bread', 'fire'], aspect: 1.1, defaultWidth: 110, variants: 2,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h } = a;
      const s = mix(stoneC(a), '#c9c0b0', 0.2);
      const cx = w / 2, cy = h * 0.52, r = Math.min(w, h) * 0.44;
      groundShadow(ctx, cx + r * 0.08, cy + r * 0.1, r, r * 0.92, 0.32);
      if (a.variant % 2 === 0) {
        outlined(a, () => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); },
          lightGradient(ctx, cx - r, cy - r, cx + r, cy + r, s, 0.3, 0.3));
      } else {
        outlined(a, () => roundRect(ctx, cx - r, cy - r * 0.86, r * 2, r * 1.72, r * 0.2),
          lightGradient(ctx, cx - r, cy - r, cx + r, cy + r, s, 0.3, 0.3));
      }
      radialGlow(ctx, cx, cy, r * 1.3, '#ff8a3c', 0.35);
      ctx.fillStyle = '#1a1512';
      ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.1, r * 0.42, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e0662a';
      ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.14, r * 0.2, r * 0.14, 0, 0, Math.PI * 2); ctx.fill();
    },
  },
  {
    id: 'int/cauldron-hook', label: 'Cauldron on a Hook', group: 'furniture', sub: 'Kitchen',
    tags: ['kitchen', 'pot', 'cooking'], aspect: 1, defaultWidth: 56, variants: 2,
    kinds: ['dungeon', 'city', 'battle'],
    draw(a) {
      const { ctx, w, h } = a;
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.4;
      groundShadow(ctx, cx + r * 0.1, cy + r * 0.14, r * 1.05, r, 0.32);
      outlined(a, () => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); }, iron);
      ctx.fillStyle = mix(iron, '#000000', 0.3);
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2); ctx.fill();
      if (a.variant % 2 === 0) {
        // Hung from a chain — a short link disappearing above the rim.
        ctx.strokeStyle = ironLight;
        ctx.lineWidth = Math.max(1, r * 0.1);
        ctx.beginPath(); ctx.moveTo(cx, cy - r * 0.7); ctx.lineTo(cx, cy - r * 1.5); ctx.stroke();
      } else {
        // Sat on a tripod of legs.
        ctx.strokeStyle = ironLight;
        ctx.lineWidth = Math.max(1, r * 0.14);
        for (let i = 0; i < 3; i++) {
          const ang = (i / 3) * Math.PI * 2 + Math.PI / 2;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(ang) * r * 1.15, cy + Math.sin(ang) * r * 1.15);
          ctx.stroke();
        }
      }
      ctx.fillStyle = rgba(iron, 0.9);
      ctx.beginPath(); ctx.arc(cx - r * 0.5, cy, r * 0.1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + r * 0.5, cy, r * 0.1, 0, Math.PI * 2); ctx.fill();
    },
  },
  {
    id: 'int/butcher-block', label: 'Butcher Block', group: 'furniture', sub: 'Kitchen',
    tags: ['kitchen', 'meat', 'table'], aspect: 1.3, defaultWidth: 80, variants: 2,
    kinds: ['dungeon', 'city', 'battle'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      groundShadow(ctx, w * 0.53, h * 0.56, w * 0.42, h * 0.36, 0.3);
      const round = a.variant % 2 === 0;
      const block = mix(woodBase, '#c9a066', 0.4);
      if (round) {
        const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.42;
        outlined(a, () => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); },
          lightGradient(ctx, cx - r, cy - r, cx + r, cy + r, block, 0.2, 0.3));
      } else {
        plank(a, w * 0.1, h * 0.16, w * 0.8, h * 0.68, 3, block);
      }
      ctx.strokeStyle = rgba(woodDark, 0.6);
      ctx.lineWidth = Math.max(1, w * 0.012);
      for (let i = 0; i < 6; i++) {
        const x0 = w * rng.float(0.25, 0.75), y0 = h * rng.float(0.3, 0.7);
        const ang = rng.float(0, Math.PI * 2), l = w * rng.float(0.06, 0.14);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 + Math.cos(ang) * l, y0 + Math.sin(ang) * l);
        ctx.stroke();
      }
      // A cleaver resting on top.
      ctx.fillStyle = ironLight;
      ctx.save();
      ctx.translate(w * 0.68, h * 0.36);
      ctx.rotate(0.5);
      ctx.fillRect(-w * 0.02, -h * 0.02, w * 0.2, h * 0.1);
      ctx.restore();
    },
  },
  {
    id: 'int/prep-table', label: 'Prep Table', group: 'furniture', sub: 'Kitchen',
    tags: ['kitchen', 'table', 'utensils'], aspect: 2.0, defaultWidth: 130, variants: 2,
    kinds: ['dungeon', 'city', 'battle'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      groundShadow(ctx, w * 0.52, h * 0.56, w * 0.46, h * 0.34, 0.3);
      plank(a, w * 0.06, h * 0.16, w * 0.88, h * 0.68, 5);
      if (a.variant % 2 === 0) {
        // Vegetables scattered.
        const colors = ['#a8542f', '#7fa04a', '#c9a83a', '#8a3b3b'];
        for (let i = 0; i < 7; i++) {
          const cx = w * rng.float(0.14, 0.86), cy = h * rng.float(0.28, 0.72);
          const r = Math.min(w, h) * rng.float(0.05, 0.09);
          const pts = blob(cx, cy, r, r * rng.float(0.8, 1), 5, 0.16, rng);
          fillPath(ctx, pts, rng.pick(colors));
          inkLine(ctx, pts, rgba(ink(a), 0.4), 1, true);
        }
      } else {
        // Utensils: knife and rolling pin laid out.
        ctx.fillStyle = ironLight;
        ctx.save(); ctx.translate(w * 0.28, h * 0.5); ctx.rotate(-0.15);
        ctx.fillRect(-w * 0.16, -h * 0.03, w * 0.3, h * 0.06);
        ctx.fillStyle = woodDark;
        ctx.fillRect(w * 0.14, -h * 0.03, w * 0.08, h * 0.06);
        ctx.restore();
        ctx.fillStyle = mix(woodBase, '#d8bf94', 0.5);
        ctx.save(); ctx.translate(w * 0.68, h * 0.5); ctx.rotate(0.2);
        ctx.fillRect(-w * 0.2, -h * 0.045, w * 0.4, h * 0.09);
        ctx.fillStyle = woodDark;
        ctx.fillRect(-w * 0.26, -h * 0.015, w * 0.06, h * 0.03);
        ctx.fillRect(w * 0.2, -h * 0.015, w * 0.06, h * 0.03);
        ctx.restore();
      }
    },
  },
  {
    id: 'int/larder-shelves', label: 'Larder Shelves', group: 'furniture', sub: 'Kitchen',
    tags: ['kitchen', 'storage', 'food', 'shelf'], aspect: 2.4, defaultWidth: 120, variants: 2,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      railShelf(a, w * 0.04, h * 0.06, w * 0.92, h * 0.68, 3, (rx, ry, rw, rh) => {
        const n = 5;
        for (let i = 0; i < n; i++) {
          const iw = rw / n;
          const ix = rx + iw * i + iw * 0.15;
          const kind = rng.pick(['jar', 'sack', 'loaf'] as const);
          if (kind === 'jar') {
            ctx.fillStyle = rng.pick(['#8a6a3a', '#4a6a4a', '#6a4a3a']);
            roundRect(ctx, ix, ry + rh * 0.1, iw * 0.6, rh * 0.8, iw * 0.15);
            ctx.fill();
          } else if (kind === 'sack') {
            ctx.fillStyle = mix('#c9b285', '#8a7350', rng.float(0, 0.4));
            ctx.beginPath(); ctx.arc(ix + iw * 0.3, ry + rh * 0.55, rh * 0.4, 0, Math.PI * 2); ctx.fill();
          } else {
            ctx.fillStyle = '#c9a05a';
            roundRect(ctx, ix, ry + rh * 0.2, iw * 0.55, rh * 0.6, rh * 0.25);
            ctx.fill();
          }
        }
      });
      if (a.variant % 2 === 1) {
        // Hams strung below the bottom shelf.
        for (let i = 0; i < 3; i++) {
          bundle(a, w * (0.2 + i * 0.32), h * 0.86, Math.min(w, h) * 0.09, '#a8583f');
        }
      }
    },
  },
  {
    id: 'int/water-basin', label: 'Water Basin', group: 'furniture', sub: 'Kitchen',
    tags: ['kitchen', 'water', 'sink'], aspect: 1.3, defaultWidth: 70, variants: 2,
    kinds: ['dungeon', 'city', 'battle'],
    draw(a) {
      const { ctx, w, h } = a;
      groundShadow(ctx, w * 0.52, h * 0.56, w * 0.42, h * 0.32, 0.3);
      const round = a.variant % 2 === 0;
      const shell = round ? stoneC(a) : wood(a);
      if (round) {
        const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.42;
        outlined(a, () => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); }, shell);
        ctx.fillStyle = rgba(a.palette.water, 0.85);
        ctx.beginPath(); ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2); ctx.fill();
      } else {
        outlined(a, () => roundRect(ctx, w * 0.08, h * 0.14, w * 0.84, h * 0.72, w * 0.06), shell);
        ctx.fillStyle = rgba(a.palette.water, 0.85);
        roundRect(ctx, w * 0.16, h * 0.22, w * 0.68, h * 0.56, w * 0.04);
        ctx.fill();
      }
      ctx.strokeStyle = rgba('#ffffff', 0.4);
      ctx.lineWidth = Math.max(1, w * 0.015);
      ctx.beginPath(); ctx.moveTo(w * 0.36, h * 0.4); ctx.lineTo(w * 0.5, h * 0.36); ctx.stroke();
    },
  },
  {
    id: 'int/hanging-herbs', label: 'Hanging Herbs & Game', group: 'furniture', sub: 'Kitchen',
    tags: ['kitchen', 'herbs', 'meat', 'rack'], aspect: 1.6, defaultWidth: 90, variants: 3,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      ctx.strokeStyle = woodDark;
      ctx.lineWidth = Math.max(1, h * 0.05);
      ctx.beginPath(); ctx.moveTo(w * 0.04, h * 0.12); ctx.lineTo(w * 0.96, h * 0.12); ctx.stroke();
      const herb = ['#5f7a3f', '#4a6a3a', '#7a8a4a'];
      const game = ['#9c4a3f', '#8a3b3b', '#a85c4a'];
      const mode = a.variant % 3; // 0 herbs, 1 game, 2 mixed
      const n = 5;
      for (let i = 0; i < n; i++) {
        const cx = w * (0.12 + (i / (n - 1)) * 0.76) + rng.float(-w * 0.02, w * 0.02);
        const cy = h * rng.float(0.42, 0.66);
        const r = Math.min(w, h) * rng.float(0.1, 0.16);
        const useGame = mode === 1 || (mode === 2 && rng.bool());
        groundShadow(ctx, cx + r * 0.15, cy + r * 0.2, r * 0.9, r * 0.8, 0.22);
        bundle(a, cx, cy, r, mode === 0 ? rng.pick(herb) : rng.pick(useGame ? game : herb));
        ctx.strokeStyle = rgba(woodDark, 0.7);
        ctx.lineWidth = Math.max(1, r * 0.1);
        ctx.beginPath(); ctx.moveTo(cx, h * 0.12); ctx.lineTo(cx, cy - r * 0.6); ctx.stroke();
      }
    },
  },
  {
    id: 'int/firewood-stack', label: 'Firewood Stack', group: 'furniture', sub: 'Kitchen',
    tags: ['kitchen', 'wood', 'fuel'], aspect: 1.4, defaultWidth: 80, variants: 3,
    kinds: ['dungeon', 'city', 'battle'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      groundShadow(ctx, w * 0.52, h * 0.58, w * 0.44, h * 0.36, 0.3);
      const mode = a.variant % 3;
      const logColor = () => mix(woodBase, rng.bool() ? '#d8bf94' : woodDark, rng.float(0, 0.5));
      if (mode === 0) {
        // Neat stacked log ends: a grid of circles.
        const cols = 5, rows = 3;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const rad = Math.min(w, h) * 0.09;
            const cx = w * 0.14 + c * (w * 0.72 / (cols - 1)) + (r % 2) * (w * 0.72 / (cols - 1) / 2);
            const cy = h * 0.28 + r * rad * 1.5;
            if (cx > w * 0.9) continue;
            ctx.fillStyle = logColor();
            ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = rgba(ink(a), 0.5); ctx.lineWidth = 1; ctx.stroke();
            ctx.strokeStyle = rgba(woodDark, 0.6); ctx.lineWidth = Math.max(1, rad * 0.15);
            ctx.beginPath(); ctx.arc(cx, cy, rad * 0.5, 0, Math.PI * 2); ctx.stroke();
          }
        }
      } else if (mode === 1) {
        // Loose scattered logs.
        for (let i = 0; i < 8; i++) {
          const cx = w * rng.float(0.15, 0.85), cy = h * rng.float(0.2, 0.85);
          const ang = rng.float(0, Math.PI);
          const len = w * rng.float(0.2, 0.34), thick = Math.min(w, h) * rng.float(0.06, 0.1);
          ctx.strokeStyle = logColor();
          ctx.lineWidth = thick;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(cx - Math.cos(ang) * len / 2, cy - Math.sin(ang) * len / 2);
          ctx.lineTo(cx + Math.cos(ang) * len / 2, cy + Math.sin(ang) * len / 2);
          ctx.stroke();
        }
      } else {
        // A tidy triangular pile under a lean-to.
        const rows = 4;
        for (let r = 0; r < rows; r++) {
          const n = rows - r;
          const y = h * 0.85 - r * Math.min(w, h) * 0.16;
          for (let i = 0; i < n; i++) {
            const x = w * 0.5 - (n - 1) * Math.min(w, h) * 0.1 + i * Math.min(w, h) * 0.2;
            const rad = Math.min(w, h) * 0.1;
            ctx.fillStyle = logColor();
            ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = rgba(ink(a), 0.5); ctx.lineWidth = 1; ctx.stroke();
          }
        }
      }
    },
  },

  // --- Tavern ------------------------------------------------------------
  {
    id: 'int/bar-counter', label: 'Bar Counter', group: 'furniture', sub: 'Tavern',
    tags: ['tavern', 'bar', 'counter'], aspect: 1.4, defaultWidth: 160, variants: 2,
    kinds: ['dungeon', 'city', 'battle'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const flip = a.variant % 2 === 1;
      const mx = (x: number) => (flip ? w - x : x);
      groundShadow(ctx, w * 0.5, h * 0.56, w * 0.46, h * 0.4, 0.3);
      const armW = h * 0.32;
      const pts: Vec2[] = [
        { x: mx(w * 0.06), y: h * 0.08 }, { x: mx(w * 0.94), y: h * 0.08 },
        { x: mx(w * 0.94), y: h * 0.08 + armW }, { x: mx(w * 0.06 + armW), y: h * 0.08 + armW },
        { x: mx(w * 0.06 + armW), y: h * 0.92 }, { x: mx(w * 0.06), y: h * 0.92 },
      ];
      fillPath(ctx, pts, lightGradient(ctx, 0, 0, w, h, wood(a), 0.26, 0.3));
      inkLine(ctx, pts, rgba(ink(a), 0.75), Math.max(1, w * 0.015), true);
      ctx.strokeStyle = rgba(woodDark, 0.5);
      ctx.lineWidth = Math.max(1, w * 0.01);
      ctx.beginPath(); ctx.moveTo(mx(w * 0.06), h * 0.5); ctx.lineTo(mx(w * 0.94), h * 0.5); ctx.stroke();
      // Bottles racked along the back wall arm.
      for (let i = 0; i < 8; i++) {
        const bx = mx(w * 0.1 + i * (w * 0.8 / 8));
        const by = h * 0.16;
        ctx.fillStyle = rng.pick(['#3b5a3f', '#5a3b3b', '#3b3b5a', '#6b5a2f']);
        roundRect(ctx, bx, by, w * 0.03, armW * 0.4, w * 0.01);
        ctx.fill();
      }
    },
  },
  {
    id: 'int/keg-rack', label: 'Keg Rack', group: 'furniture', sub: 'Tavern',
    tags: ['tavern', 'keg', 'storage'], aspect: 1.6, defaultWidth: 100, variants: 2,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h } = a;
      groundShadow(ctx, w * 0.52, h * 0.58, w * 0.46, h * 0.32, 0.3);
      ctx.strokeStyle = rgba(woodDark, 0.8);
      ctx.lineWidth = Math.max(1, h * 0.04);
      ctx.strokeRect(w * 0.04, h * 0.14, w * 0.92, h * 0.74);
      const twoTier = a.variant % 2 === 1;
      const kegN = twoTier ? 4 : 3;
      const rows = twoTier ? 2 : 1;
      for (let row = 0; row < rows; row++) {
        for (let i = 0; i < kegN; i++) {
          const r = Math.min(w / kegN, h / rows) * 0.4;
          const cx = w * (0.5 / kegN + i / kegN);
          const cy = rows === 1 ? h * 0.5 : h * (0.32 + row * 0.4);
          outlined(a, () => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); },
            lightGradient(ctx, cx - r, cy - r, cx + r, cy + r, wood(a), 0.3, 0.3));
          ctx.strokeStyle = iron;
          ctx.lineWidth = Math.max(1, r * 0.14);
          ctx.beginPath(); ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2); ctx.stroke();
        }
      }
    },
  },
  {
    id: 'int/tavern-table-stools', label: 'Tavern Table & Stools', group: 'furniture', sub: 'Tavern',
    tags: ['tavern', 'table', 'seats'], aspect: 1.3, defaultWidth: 120, variants: 2,
    kinds: ['dungeon', 'city', 'battle'],
    draw(a) {
      const { ctx, w, h } = a;
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.26;
      const seats = a.variant % 2 === 0 ? 4 : 6;
      const seatR = Math.min(w, h) * 0.13;
      for (let i = 0; i < seats; i++) {
        const ang = (i / seats) * Math.PI * 2;
        stool(a, cx + Math.cos(ang) * r * 1.9, cy + Math.sin(ang) * r * 1.9, seatR);
      }
      groundShadow(ctx, cx + r * 0.06, cy + r * 0.1, r, r * 0.95, 0.3);
      outlined(a, () => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); },
        lightGradient(ctx, cx - r, cy - r, cx + r, cy + r, wood(a), 0.28, 0.28));
      ctx.strokeStyle = rgba(woodDark, 0.5);
      ctx.lineWidth = Math.max(1, r * 0.08);
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.66, 0, Math.PI * 2); ctx.stroke();
    },
  },
  {
    id: 'int/long-bench', label: 'Long Bench', group: 'furniture', sub: 'Tavern',
    tags: ['tavern', 'bench', 'seat'], aspect: 4, defaultWidth: 140, variants: 2,
    kinds: ['dungeon', 'city', 'battle'],
    draw(a) {
      const { ctx, w, h } = a;
      groundShadow(ctx, w * 0.5, h * 0.6, w * 0.48, h * 0.4, 0.28);
      plank(a, w * 0.03, h * 0.2, w * 0.94, h * 0.6, 8);
      if (a.variant % 2 === 1) {
        ctx.fillStyle = rgba(cloth(a, '#8a3b3b'), 0.75);
        roundRect(ctx, w * 0.05, h * 0.32, w * 0.9, h * 0.36, h * 0.12);
        ctx.fill();
      }
    },
  },
  {
    id: 'int/dart-board', label: 'Dart Board', group: 'furniture', sub: 'Tavern',
    tags: ['tavern', 'wall', 'game', 'trophy'], aspect: 1, defaultWidth: 50, variants: 2,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.42;
      groundShadow(ctx, cx, cy + r * 0.1, r * 0.9, r * 0.8, 0.24);
      if (a.variant % 2 === 0) {
        const rings = 4;
        for (let i = rings; i >= 1; i--) {
          ctx.fillStyle = i % 2 === 0 ? '#d8cbb0' : '#7a3b3b';
          ctx.beginPath(); ctx.arc(cx, cy, r * (i / rings), 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = '#2a2118';
        ctx.beginPath(); ctx.arc(cx, cy, r * 0.08, 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < 3; i++) {
          const ang = rng.float(0, Math.PI * 2), d = r * rng.float(0.1, 0.7);
          ctx.fillStyle = ironLight;
          ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * d, cy + Math.sin(ang) * d, r * 0.05, 0, Math.PI * 2); ctx.fill();
        }
        ctx.strokeStyle = rgba(ink(a), 0.6); ctx.lineWidth = Math.max(1, w * 0.02);
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      } else {
        // A mounted trophy head on a plaque.
        outlined(a, () => roundRect(ctx, w * 0.14, h * 0.5, w * 0.72, h * 0.36, w * 0.05), wood(a));
        ctx.fillStyle = mix('#8a6a4a', '#000000', 0.15);
        ctx.beginPath(); ctx.ellipse(cx, h * 0.42, r * 0.5, r * 0.42, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#e6ddcb'; ctx.lineWidth = Math.max(1, w * 0.03);
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(cx + s * r * 0.2, h * 0.3);
          ctx.quadraticCurveTo(cx + s * r * 0.7, h * 0.05, cx + s * r * 0.5, h * 0.0);
          ctx.stroke();
        }
      }
    },
  },
  {
    id: 'int/spilled-tankards', label: 'Spilled Tankards & Plates', group: 'furniture', sub: 'Tavern',
    tags: ['tavern', 'mess', 'floor'], aspect: 1.4, defaultWidth: 60, variants: 3,
    kinds: ['dungeon', 'city', 'battle'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const mode = a.variant % 3;
      if (mode !== 1) {
        for (let i = 0; i < 2; i++) {
          const cx = w * rng.float(0.2, 0.5), cy = h * rng.float(0.3, 0.7);
          const r = Math.min(w, h) * 0.12;
          ctx.save(); ctx.translate(cx, cy); ctx.rotate(rng.float(0, Math.PI));
          outlined(a, () => roundRect(ctx, -r * 0.5, -r, r, r * 2, r * 0.2), ironLight, 0.6, 0.06);
          ctx.restore();
        }
      }
      if (mode !== 0) {
        for (let i = 0; i < 2; i++) {
          const cx = w * rng.float(0.5, 0.85), cy = h * rng.float(0.3, 0.7);
          const r = Math.min(w, h) * 0.14;
          outlined(a, () => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); }, '#d8cbb0', 0.55, 0.03);
          const crumb = blob(cx, cy, r * 0.4, r * 0.35, 4, 0.2, rng);
          fillPath(ctx, crumb, '#8a6a3a');
        }
      }
      if (mode === 2) {
        const spill = blob(w * 0.4, h * 0.55, w * 0.28, h * 0.18, 5, 0.2, rng);
        fillPath(ctx, spill, rgba('#c9a03a', 0.4));
      }
    },
  },
  {
    id: 'int/fireplace-rug', label: 'Fireplace with Rug', group: 'furniture', sub: 'Tavern',
    tags: ['tavern', 'fire', 'rug', 'light'], aspect: 1.6, defaultWidth: 150, variants: 2,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const s = stoneC(a);
      groundShadow(ctx, w * 0.5, h * 0.28, w * 0.4, h * 0.2, 0.3);
      outlined(a, () => roundRect(ctx, w * 0.14, h * 0.02, w * 0.72, h * 0.42, w * 0.05),
        lightGradient(ctx, w * 0.14, 0, w * 0.86, h * 0.44, s, 0.26, 0.32));
      radialGlow(ctx, w * 0.5, h * 0.24, w * 0.4, '#ff8a3c', 0.55);
      ctx.fillStyle = '#0e0c0a';
      ctx.beginPath(); ctx.ellipse(w * 0.5, h * 0.24, w * 0.24, h * 0.14, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff9a3c';
      ctx.beginPath(); ctx.ellipse(w * 0.5, h * 0.26, w * 0.13, h * 0.08, 0, 0, Math.PI * 2); ctx.fill();
      if (a.variant % 2 === 0) {
        weaveRug(a, w * 0.16, h * 0.54, w * 0.68, h * 0.4, [
          cloth(a, '#7a3b3b'), cloth(a, '#3f2b16'), cloth(a, '#c9a227'),
        ]);
      } else {
        const cx = w * 0.5, cy = h * 0.74, r = w * 0.3;
        groundShadow(ctx, cx, cy + h * 0.02, r * 0.95, r * 0.75, 0.2);
        outlined(a, () => { ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.68, 0, 0, Math.PI * 2); },
          cloth(a, '#7a3b3b'), 0.5, 0.012);
        for (let i = 0; i < rng.int(2, 3); i++) {
          ctx.strokeStyle = rgba(cloth(a, '#c9a227'), 0.8);
          ctx.lineWidth = Math.max(1, r * 0.03);
          ctx.beginPath(); ctx.ellipse(cx, cy, r * (0.7 - i * 0.2), r * 0.68 * (0.7 - i * 0.2), 0, 0, Math.PI * 2); ctx.stroke();
        }
      }
    },
  },

  // --- Library -------------------------------------------------------------
  {
    id: 'int/reading-desk', label: 'Reading Desk', group: 'furniture', sub: 'Library',
    tags: ['library', 'desk', 'book'], aspect: 1.5, defaultWidth: 90, variants: 2,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h } = a;
      groundShadow(ctx, w * 0.52, h * 0.56, w * 0.44, h * 0.34, 0.3);
      plank(a, w * 0.06, h * 0.16, w * 0.88, h * 0.68, 3);
      const bx = w * 0.5, by = h * 0.5, bw = w * 0.4, bh = h * 0.32;
      outlined(a, () => roundRect(ctx, bx - bw / 2, by - bh / 2, bw, bh, w * 0.02), '#e6ddc8', 0.6, 0.012);
      ctx.strokeStyle = rgba(ink(a), 0.35);
      ctx.lineWidth = Math.max(1, w * 0.008);
      ctx.beginPath(); ctx.moveTo(bx, by - bh / 2); ctx.lineTo(bx, by + bh / 2); ctx.stroke();
      for (let i = 1; i < 4; i++) {
        const t = i / 4;
        ctx.beginPath();
        ctx.moveTo(bx - bw / 2, by - bh / 2 + bh * t); ctx.lineTo(bx - bw * 0.06, by - bh / 2 + bh * t);
        ctx.moveTo(bx + bw * 0.06, by - bh / 2 + bh * t); ctx.lineTo(bx + bw / 2, by - bh / 2 + bh * t);
        ctx.stroke();
      }
      if (a.variant % 2 === 1) {
        ctx.fillStyle = rgba('#7a3b3b', 0.85);
        roundRect(ctx, w * 0.14, h * 0.24, w * 0.14, h * 0.16, w * 0.01);
        ctx.fill();
      }
    },
  },
  {
    id: 'int/lectern', label: 'Lectern', group: 'furniture', sub: 'Library',
    tags: ['library', 'lectern', 'book', 'podium'], aspect: 0.8, defaultWidth: 50, variants: 2,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h } = a;
      groundShadow(ctx, w * 0.52, h * 0.58, w * 0.36, h * 0.36, 0.3);
      outlined(a, () => {
        ctx.beginPath();
        ctx.moveTo(w * 0.5, h * 0.14);
        ctx.lineTo(w * 0.86, h * 0.5);
        ctx.lineTo(w * 0.5, h * 0.86);
        ctx.lineTo(w * 0.14, h * 0.5);
        ctx.closePath();
      }, lightGradient(ctx, w * 0.14, h * 0.14, w * 0.86, h * 0.86, wood(a), 0.28, 0.28));
      ctx.fillStyle = '#e6ddc8';
      roundRect(ctx, w * 0.32, h * 0.36, w * 0.36, h * 0.28, w * 0.02);
      ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.4); ctx.lineWidth = Math.max(1, w * 0.01);
      ctx.beginPath(); ctx.moveTo(w * 0.5, h * 0.36); ctx.lineTo(w * 0.5, h * 0.64); ctx.stroke();
      if (a.variant % 2 === 1) {
        ctx.strokeStyle = rgba(a.palette.accent, 0.7);
        ctx.lineWidth = Math.max(1, w * 0.012);
        const pts = star(w * 0.5, h * 0.5, w * 0.09, w * 0.04, 5);
        tracePath(ctx, pts, true); ctx.stroke();
      }
    },
  },
  {
    id: 'int/scroll-rack', label: 'Scroll Rack', group: 'furniture', sub: 'Library',
    tags: ['library', 'scrolls', 'shelf'], aspect: 1.8, defaultWidth: 100, variants: 2,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      plank(a, w * 0.04, h * 0.1, w * 0.92, h * 0.8, 2);
      const horiz = a.variant % 2 === 0;
      const cols = horiz ? 6 : 8, rows = horiz ? 3 : 2;
      const cw = (w * 0.86) / cols, ch = (h * 0.66) / rows;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cx = w * 0.07 + cw * (c + 0.5), cy = h * 0.17 + ch * (r + 0.5);
          ctx.fillStyle = '#141210';
          roundRect(ctx, cx - cw * 0.36, cy - ch * 0.36, cw * 0.72, ch * 0.72, Math.min(cw, ch) * 0.15);
          ctx.fill();
          if (rng.bool(0.7)) {
            ctx.fillStyle = rng.pick(['#d8cba8', '#c9a83a', '#a83a3a', '#3a6ba8']);
            ctx.beginPath(); ctx.arc(cx, cy, Math.min(cw, ch) * 0.22, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
      ctx.strokeStyle = rgba(ink(a), 0.65);
      ctx.lineWidth = Math.max(1, h * 0.03);
      ctx.strokeRect(w * 0.04, h * 0.1, w * 0.92, h * 0.8);
    },
  },
  {
    id: 'int/map-table', label: 'Map Table', group: 'furniture', sub: 'Library',
    tags: ['library', 'map', 'table', 'chart'], aspect: 1.6, defaultWidth: 140, variants: 2,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      groundShadow(ctx, w * 0.52, h * 0.56, w * 0.46, h * 0.34, 0.3);
      plank(a, w * 0.06, h * 0.14, w * 0.88, h * 0.72, 4);
      ctx.save();
      ctx.translate(w * 0.5, h * 0.5); ctx.rotate(-0.08);
      ctx.fillStyle = '#e8dcb8';
      roundRect(ctx, -w * 0.36, -h * 0.28, w * 0.72, h * 0.56, w * 0.015);
      ctx.fill();
      ctx.strokeStyle = rgba('#8a7350', 0.6); ctx.lineWidth = Math.max(1, w * 0.006);
      for (let i = 0; i < 4; i++) {
        const pts = blob(rng.float(-w * 0.25, w * 0.25), rng.float(-h * 0.18, h * 0.18), w * 0.08, h * 0.06, 5, 0.3, rng);
        tracePath(ctx, pts, true); ctx.stroke();
      }
      if (a.variant % 2 === 0) {
        // Compass rose.
        ctx.strokeStyle = rgba(a.palette.accent, 0.75); ctx.lineWidth = Math.max(1, w * 0.008);
        const pts = star(0, 0, w * 0.1, w * 0.04, 8);
        tracePath(ctx, pts, true); ctx.stroke();
      } else {
        // Route lines with pin markers.
        ctx.strokeStyle = rgba(a.palette.accent, 0.7); ctx.lineWidth = Math.max(1, w * 0.006);
        ctx.setLineDash([w * 0.015, w * 0.01]);
        ctx.beginPath(); ctx.moveTo(-w * 0.28, -h * 0.1); ctx.lineTo(w * 0.24, h * 0.14); ctx.stroke();
        ctx.setLineDash([]);
        for (const [px, py] of [[-w * 0.28, -h * 0.1], [w * 0.24, h * 0.14]] as const) {
          ctx.fillStyle = '#a8342c';
          ctx.beginPath(); ctx.arc(px, py, w * 0.014, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
    },
  },
  {
    id: 'int/standing-globe', label: 'Standing Globe', group: 'furniture', sub: 'Library',
    tags: ['library', 'globe', 'map'], aspect: 1, defaultWidth: 50, variants: 2,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h } = a;
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.4;
      groundShadow(ctx, cx + r * 0.1, cy + r * 0.12, r, r * 0.95, 0.32);
      const celestial = a.variant % 2 === 1;
      const base = celestial ? '#1c2440' : mix(a.palette.water, '#2f7f9e', 0.3);
      outlined(a, () => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); }, base);
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
      if (celestial) {
        for (let i = 0; i < 16; i++) {
          const px = cx + a.rng.float(-r, r), py = cy + a.rng.float(-r, r);
          if (Math.hypot(px - cx, py - cy) > r) continue;
          ctx.fillStyle = '#f4ecd8';
          ctx.beginPath(); ctx.arc(px, py, r * 0.02, 0, Math.PI * 2); ctx.fill();
        }
      } else {
        for (let i = 0; i < 5; i++) {
          const pts = blob(cx + a.rng.float(-r * 0.5, r * 0.5), cy + a.rng.float(-r * 0.5, r * 0.5),
            r * a.rng.float(0.14, 0.26), r * a.rng.float(0.12, 0.2), 5, 0.2, a.rng);
          fillPath(ctx, pts, mix(a.palette.forest, '#8a9a5a', 0.3));
        }
      }
      ctx.strokeStyle = rgba('#ffffff', 0.25); ctx.lineWidth = Math.max(1, r * 0.03);
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, r * Math.abs(Math.cos(i * 0.5)), r, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = rgba(brass(a), 0.8); ctx.lineWidth = Math.max(1, r * 0.06);
      ctx.beginPath(); ctx.moveTo(cx - r * 0.3, cy + r * 0.9); ctx.lineTo(cx + r * 0.3, cy + r * 0.9); ctx.stroke();
    },
  },
  {
    id: 'int/book-stacks-floor', label: 'Book Stacks (Floor)', group: 'furniture', sub: 'Library',
    tags: ['library', 'books', 'clutter'], aspect: 1.2, defaultWidth: 60, variants: 3,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const stacks = a.variant % 3 === 0 ? 2 : a.variant % 3 === 1 ? 3 : 1;
      const colors = ['#7a3b3b', '#3b5a7a', '#3f6b45', '#7a6a3b', '#5a3b6b'];
      const positions: Vec2[] = stacks === 1
        ? [{ x: w * 0.5, y: h * 0.55 }]
        : stacks === 2
          ? [{ x: w * 0.36, y: h * 0.5 }, { x: w * 0.66, y: h * 0.6 }]
          : [{ x: w * 0.28, y: h * 0.42 }, { x: w * 0.62, y: h * 0.5 }, { x: w * 0.44, y: h * 0.72 }];
      for (const p of positions) {
        groundShadow(ctx, p.x + w * 0.02, p.y + h * 0.03, w * 0.16, h * 0.14, 0.28);
        const n = rng.int(3, 6);
        const bw = w * rng.float(0.24, 0.32);
        for (let i = 0; i < n; i++) {
          const bh = h * 0.05;
          const y = p.y + h * 0.1 - i * bh;
          const jx = rng.float(-w * 0.015, w * 0.015);
          ctx.fillStyle = rng.pick(colors);
          ctx.save();
          ctx.translate(p.x + jx, y);
          ctx.rotate(rng.float(-0.06, 0.06));
          roundRect(ctx, -bw / 2, -bh / 2, bw, bh, bh * 0.2);
          ctx.fill();
          ctx.strokeStyle = rgba(ink(a), 0.35); ctx.lineWidth = 1; ctx.stroke();
          ctx.restore();
        }
        if (stacks === 1) {
          // A book fanned open on top of the precarious stack.
          const topY = p.y + h * 0.1 - n * h * 0.05 - h * 0.03;
          ctx.fillStyle = '#e6ddc8';
          roundRect(ctx, p.x - bw * 0.4, topY - h * 0.04, bw * 0.8, h * 0.08, w * 0.01);
          ctx.fill();
        }
      }
    },
  },
  {
    id: 'int/writing-desk-inkwell', label: 'Writing Desk', group: 'furniture', sub: 'Library',
    tags: ['library', 'desk', 'ink', 'candle'], aspect: 1.5, defaultWidth: 90, variants: 2,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h } = a;
      groundShadow(ctx, w * 0.52, h * 0.56, w * 0.44, h * 0.34, 0.3);
      plank(a, w * 0.06, h * 0.16, w * 0.88, h * 0.68, 3);
      ctx.fillStyle = '#e6ddc8';
      roundRect(ctx, w * 0.16, h * 0.32, w * 0.32, h * 0.28, w * 0.01);
      ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.4); ctx.lineWidth = Math.max(1, w * 0.006);
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(w * 0.19, h * (0.37 + i * 0.05)); ctx.lineTo(w * 0.44, h * (0.37 + i * 0.05));
        ctx.stroke();
      }
      ctx.fillStyle = iron;
      ctx.beginPath(); ctx.arc(w * 0.62, h * 0.55, w * 0.05, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0e0c0a';
      ctx.beginPath(); ctx.arc(w * 0.62, h * 0.55, w * 0.032, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = brass(a); ctx.lineWidth = Math.max(1, w * 0.012);
      ctx.beginPath(); ctx.moveTo(w * 0.62, h * 0.55); ctx.lineTo(w * 0.74, h * 0.4); ctx.stroke();
      if (a.variant % 2 === 0) {
        candleFlame(a, w * 0.78, h * 0.32, w * 0.025);
      } else {
        ctx.fillStyle = '#e6ddc8';
        roundRect(ctx, w * 0.68, h * 0.28, w * 0.18, h * 0.14, w * 0.008);
        ctx.fill();
      }
    },
  },

  // --- Laboratory ----------------------------------------------------------
  {
    id: 'int/alchemy-bench', label: 'Alchemy Bench', group: 'furniture', sub: 'Laboratory',
    tags: ['lab', 'alchemy', 'glassware', 'bench'], aspect: 2.0, defaultWidth: 140, variants: 2,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      groundShadow(ctx, w * 0.52, h * 0.56, w * 0.47, h * 0.34, 0.3);
      plank(a, w * 0.05, h * 0.16, w * 0.9, h * 0.68, 5, mix(woodBase, '#2a2a24', 0.3));
      const liquids = ['#4ac47a', '#c44a9a', '#4a9ac4', '#c4a04a'];
      const active = a.variant % 2 === 1;
      for (let i = 0; i < 6; i++) {
        const cx = w * (0.12 + i * 0.155), cy = h * 0.42;
        const r = Math.min(w, h) * rng.float(0.06, 0.1);
        const liquid = rng.pick(liquids);
        jar(a, cx, cy, r, liquid);
        if (active && i % 2 === 0) radialGlow(ctx, cx, cy, r * 3, liquid, 0.4);
      }
    },
  },
  {
    id: 'int/distillation-still', label: 'Distillation Still', group: 'furniture', sub: 'Laboratory',
    tags: ['lab', 'alchemy', 'still', 'glassware'], aspect: 1.1, defaultWidth: 70, variants: 2,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h } = a;
      groundShadow(ctx, w * 0.52, h * 0.58, w * 0.4, h * 0.32, 0.3);
      jar(a, w * 0.32, h * 0.5, Math.min(w, h) * 0.2, '#c4a04a');
      ctx.strokeStyle = rgba(brass(a), 0.85);
      ctx.lineWidth = Math.max(1, w * 0.03);
      if (a.variant % 2 === 0) {
        ctx.beginPath();
        ctx.moveTo(w * 0.32, h * 0.32);
        ctx.quadraticCurveTo(w * 0.7, h * 0.18, w * 0.72, h * 0.5);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(w * 0.44, h * 0.42);
        for (let i = 0; i < 4; i++) {
          const t = i / 3;
          ctx.quadraticCurveTo(w * (0.5 + t * 0.15), h * (0.2 - (i % 2) * 0.08), w * (0.55 + t * 0.15), h * 0.42);
        }
        ctx.stroke();
      }
      jar(a, w * 0.72, h * 0.62, Math.min(w, h) * 0.13, '#8ac0c8');
    },
  },
  {
    id: 'int/potion-shelf', label: 'Potion Shelf', group: 'furniture', sub: 'Laboratory',
    tags: ['lab', 'alchemy', 'shelf', 'bottle'], aspect: 2.2, defaultWidth: 110, variants: 2,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const rows = a.variant % 2 === 0 ? 1 : 2;
      railShelf(a, w * 0.04, h * 0.1, w * 0.92, h * 0.7, rows, (rx, ry, rw, rh) => {
        const n = 8;
        for (let i = 0; i < n; i++) {
          const cx = rx + (rw / n) * (i + 0.5);
          const cy = ry + rh * 0.55;
          jar(a, cx, cy, rh * 0.32, rng.pick(['#4ac47a', '#c44a9a', '#4a9ac4', '#c4a04a', '#8a4ac4']));
        }
      });
    },
  },
  {
    id: 'int/mortar-pestle-table', label: 'Mortar & Pestle Table', group: 'furniture', sub: 'Laboratory',
    tags: ['lab', 'alchemy', 'mortar'], aspect: 1.2, defaultWidth: 70, variants: 2,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      groundShadow(ctx, w * 0.52, h * 0.56, w * 0.42, h * 0.34, 0.3);
      plank(a, w * 0.08, h * 0.16, w * 0.84, h * 0.68, 3);
      const cx = w * 0.5, cy = h * 0.5, r = Math.min(w, h) * 0.18;
      outlined(a, () => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); }, stoneC(a));
      ctx.fillStyle = mix(stoneC(a), '#000000', 0.35);
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.68, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8a9a4a';
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.35, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = stoneC(a); ctx.lineWidth = Math.max(1, r * 0.28); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx + r * 0.3, cy - r * 0.9); ctx.lineTo(cx - r * 0.1, cy - r * 0.1); ctx.stroke();
      if (a.variant % 2 === 1) {
        const pts = blob(w * 0.76, h * 0.62, w * 0.08, h * 0.06, 5, 0.2, rng);
        fillPath(ctx, pts, '#6f8a3f');
      }
    },
  },
  {
    id: 'int/specimen-jars', label: 'Specimen Jars', group: 'furniture', sub: 'Laboratory',
    tags: ['lab', 'alchemy', 'jars', 'creepy'], aspect: 1.4, defaultWidth: 70, variants: 3,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const tint = a.variant % 3 === 0 ? '#4a8a5a' : a.variant % 3 === 1 ? '#6a4a8a' : '#8a3a3a';
      for (let i = 0; i < 3; i++) {
        const cx = w * (0.2 + i * 0.3), cy = h * 0.55;
        const r = Math.min(w, h) * rng.float(0.16, 0.22);
        groundShadow(ctx, cx, cy + r * 0.6, r * 0.9, r * 0.4, 0.24);
        jar(a, cx, cy, r, tint, 0.35);
        const spec = blob(cx, cy + r * 0.1, r * 0.28, r * 0.34, 5, 0.24, rng);
        fillPath(ctx, spec, mix(tint, '#000000', 0.2));
      }
    },
  },
  {
    id: 'int/arcane-orrery', label: 'Arcane Orrery', group: 'furniture', sub: 'Laboratory',
    tags: ['lab', 'arcane', 'orrery', 'astronomy'], aspect: 1, defaultWidth: 80, variants: 2,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.44;
      groundShadow(ctx, cx + R * 0.06, cy + R * 0.1, R * 0.9, R * 0.85, 0.3);
      const hue = a.tint || '#7a4ad4';
      radialGlow(ctx, cx, cy, R * 1.3, hue, 0.4);
      outlined(a, () => { ctx.beginPath(); ctx.arc(cx, cy, R * 0.14, 0, Math.PI * 2); }, '#ffd06a', 0.7, 0.02);
      const rings = a.variant % 2 === 0 ? 3 : 4;
      for (let i = 1; i <= rings; i++) {
        const r = (R * i) / rings;
        ctx.strokeStyle = rgba(brass(a), 0.7);
        ctx.lineWidth = Math.max(1, R * 0.02);
        ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.4, rng.float(0, Math.PI), 0, Math.PI * 2); ctx.stroke();
        const ang = rng.float(0, Math.PI * 2);
        const ox = Math.cos(ang) * r, oy = Math.sin(ang) * r * 0.4;
        ctx.fillStyle = rng.pick(['#8ac0c8', '#c44a9a', '#4a9ac4', '#c4a04a']);
        ctx.beginPath(); ctx.arc(cx + ox, cy + oy, R * 0.05, 0, Math.PI * 2); ctx.fill();
      }
    },
  },
  {
    id: 'int/chalk-circle', label: 'Chalk Circle & Reagents', group: 'furniture', sub: 'Laboratory',
    tags: ['lab', 'arcane', 'ritual', 'floor'], aspect: 1.3, defaultWidth: 130, variants: 2,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.42;
      const hue = a.tint || '#7a4ad4';
      radialGlow(ctx, cx, cy, r * 1.4, hue, 0.3);
      ctx.strokeStyle = rgba(hue, 0.8);
      ctx.lineWidth = Math.max(1.2, w * 0.012);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      if (a.variant % 2 === 0) {
        const pts = star(cx, cy, r * 0.85, r * 0.32, 5);
        tracePath(ctx, pts, true); ctx.stroke();
      } else {
        const pts = regularPolygon(cx, cy, r * 0.75, 6);
        tracePath(ctx, pts, true); ctx.stroke();
        const inner = regularPolygon(cx, cy, r * 0.4, 6, Math.PI / 6);
        tracePath(ctx, inner, true); ctx.stroke();
      }
      const bowls = 5;
      for (let i = 0; i < bowls; i++) {
        const ang = (i / bowls) * Math.PI * 2;
        const bx = cx + Math.cos(ang) * r * 1.15, by = cy + Math.sin(ang) * r * 1.15;
        const br = Math.min(w, h) * 0.05;
        outlined(a, () => { ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); }, stoneC(a), 0.6, 0.02);
        ctx.fillStyle = rng.pick(['#a83a3a', '#3a8a5a', '#c9a83a']);
        ctx.beginPath(); ctx.arc(bx, by, br * 0.6, 0, Math.PI * 2); ctx.fill();
      }
    },
  },

  // --- Bedchamber ------------------------------------------------------------
  {
    id: 'int/four-poster-bed', label: 'Four-Poster Bed', group: 'furniture', sub: 'Bedchamber',
    tags: ['bedchamber', 'bed', 'sleep'], aspect: 0.85, defaultWidth: 110, variants: 2,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h } = a;
      groundShadow(ctx, w * 0.52, h * 0.53, w * 0.44, h * 0.46, 0.3);
      const canopy = a.variant % 2 === 0 ? cloth(a, '#7a3b5a') : cloth(a, '#3b5a7a');
      ctx.strokeStyle = rgba(canopy, 0.5);
      ctx.lineWidth = Math.max(1, w * 0.015);
      ctx.strokeRect(w * 0.06, h * 0.04, w * 0.88, h * 0.92);
      for (const [cx, cy] of [[0.1, 0.08], [0.9, 0.08], [0.1, 0.92], [0.9, 0.92]] as const) {
        ctx.fillStyle = wood(a);
        ctx.beginPath(); ctx.arc(w * cx, h * cy, w * 0.03, 0, Math.PI * 2); ctx.fill();
      }
      plank(a, w * 0.12, h * 0.1, w * 0.76, h * 0.82, 2);
      ctx.fillStyle = rgba(mix(a.palette.accent, canopy, 0.5), 0.9);
      roundRect(ctx, w * 0.16, h * 0.32, w * 0.68, h * 0.56, w * 0.05);
      ctx.fill();
      ctx.fillStyle = '#e6ddcb';
      roundRect(ctx, w * 0.22, h * 0.14, w * 0.56, h * 0.16, w * 0.04);
      ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.55); ctx.lineWidth = Math.max(1, w * 0.015); ctx.stroke();
    },
  },
  {
    id: 'int/simple-cot', label: 'Simple Cot', group: 'furniture', sub: 'Bedchamber',
    tags: ['bedchamber', 'bed', 'sleep', 'cheap'], aspect: 0.5, defaultWidth: 50, variants: 2,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h } = a;
      groundShadow(ctx, w * 0.52, h * 0.53, w * 0.42, h * 0.46, 0.28);
      plank(a, w * 0.1, h * 0.06, w * 0.8, h * 0.88, 2, mix(woodBase, '#3a2a1a', 0.2));
      ctx.fillStyle = mix('#8a7a5a', a.palette.accent, 0.15);
      roundRect(ctx, w * 0.16, h * 0.28, w * 0.68, h * 0.62, w * 0.04);
      ctx.fill();
      ctx.fillStyle = '#d8cdb2';
      roundRect(ctx, w * 0.22, h * 0.1, w * 0.56, h * 0.16, w * 0.04);
      ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.5); ctx.lineWidth = Math.max(1, w * 0.015); ctx.stroke();
      if (a.variant % 2 === 1) {
        outlined(a, () => roundRect(ctx, w * 0.6, h * 0.86, w * 0.32, h * 0.14, w * 0.02), wood(a), 0.6, 0.02);
      }
    },
  },
  {
    id: 'int/bunk-beds', label: 'Bunk Beds', group: 'furniture', sub: 'Bedchamber',
    tags: ['bedchamber', 'bed', 'sleep', 'barracks'], aspect: 0.6, defaultWidth: 60, variants: 2,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h } = a;
      groundShadow(ctx, w * 0.52, h * 0.53, w * 0.42, h * 0.46, 0.3);
      const stacked = a.variant % 2 === 0;
      const drawCot = (x: number, y: number, bw: number, bh: number, dark: number) => {
        plank(a, x, y, bw, bh, 2, mix(woodBase, '#000000', dark));
        ctx.fillStyle = mix('#7a8ca0', a.palette.accent, 0.1);
        roundRect(ctx, x + bw * 0.1, y + bh * 0.24, bw * 0.8, bh * 0.68, bw * 0.05);
        ctx.fill();
        ctx.fillStyle = '#e6ddcb';
        roundRect(ctx, x + bw * 0.16, y + bh * 0.08, bw * 0.68, bh * 0.16, bw * 0.05);
        ctx.fill();
      };
      if (stacked) {
        drawCot(w * 0.14, h * 0.06, w * 0.72, h * 0.42, 0.18);
        drawCot(w * 0.06, h * 0.5, w * 0.72, h * 0.42, 0);
        ctx.strokeStyle = rgba(ink(a), 0.5); ctx.lineWidth = Math.max(1, w * 0.02);
        ctx.strokeRect(w * 0.14, h * 0.06, w * 0.72, h * 0.42);
        ctx.strokeRect(w * 0.06, h * 0.5, w * 0.72, h * 0.42);
      } else {
        drawCot(w * 0.06, h * 0.08, w * 0.4, h * 0.84, 0);
        drawCot(w * 0.54, h * 0.08, w * 0.4, h * 0.84, 0.12);
      }
    },
  },
  {
    id: 'int/wardrobe', label: 'Wardrobe', group: 'furniture', sub: 'Bedchamber',
    tags: ['bedchamber', 'storage', 'closet'], aspect: 1.6, defaultWidth: 90, variants: 2,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h } = a;
      groundShadow(ctx, w * 0.52, h * 0.58, w * 0.46, h * 0.3, 0.3);
      plank(a, w * 0.05, h * 0.14, w * 0.9, h * 0.72, 2);
      const twoDoors = a.variant % 2 === 0;
      ctx.strokeStyle = rgba(woodDark, 0.6); ctx.lineWidth = Math.max(1, w * 0.012);
      if (twoDoors) {
        ctx.beginPath(); ctx.moveTo(w * 0.5, h * 0.14); ctx.lineTo(w * 0.5, h * 0.86); ctx.stroke();
        for (const s of [-1, 1]) {
          ctx.fillStyle = brass(a);
          ctx.beginPath(); ctx.arc(w * 0.5 + s * w * 0.08, h * 0.5, w * 0.015, 0, Math.PI * 2); ctx.fill();
        }
      } else {
        ctx.fillStyle = rgba('#dfe9e6', 0.35);
        roundRect(ctx, w * 0.58, h * 0.2, w * 0.3, h * 0.6, w * 0.01);
        ctx.fill();
        ctx.fillStyle = brass(a);
        ctx.beginPath(); ctx.arc(w * 0.86, h * 0.5, w * 0.015, 0, Math.PI * 2); ctx.fill();
      }
    },
  },
  {
    id: 'int/dresser-mirror', label: 'Dresser with Mirror', group: 'furniture', sub: 'Bedchamber',
    tags: ['bedchamber', 'dresser', 'mirror'], aspect: 1.5, defaultWidth: 80, variants: 2,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h } = a;
      const flip = a.variant % 2 === 1;
      const mx = (x: number) => (flip ? w - x : x);
      groundShadow(ctx, w * 0.52, h * 0.6, w * 0.44, h * 0.3, 0.3);
      plank(a, w * 0.06, h * 0.22, w * 0.7, h * 0.62, 3);
      ctx.strokeStyle = rgba(woodDark, 0.5); ctx.lineWidth = Math.max(1, w * 0.01);
      for (let i = 1; i < 3; i++) {
        ctx.beginPath(); ctx.moveTo(w * 0.06, h * 0.22 + (h * 0.62 * i) / 3);
        ctx.lineTo(w * 0.76, h * 0.22 + (h * 0.62 * i) / 3); ctx.stroke();
      }
      const mcx = mx(w * 0.84), mcy = h * 0.5;
      outlined(a, () => { ctx.beginPath(); ctx.ellipse(mcx, mcy, w * 0.1, h * 0.34, 0, 0, Math.PI * 2); }, wood(a));
      ctx.fillStyle = rgba('#dfe9f2', 0.6);
      ctx.beginPath(); ctx.ellipse(mcx, mcy, w * 0.07, h * 0.27, 0, 0, Math.PI * 2); ctx.fill();
    },
  },
  {
    id: 'int/nightstand-candle', label: 'Nightstand with Candle', group: 'furniture', sub: 'Bedchamber',
    tags: ['bedchamber', 'nightstand', 'candle', 'light'], aspect: 1, defaultWidth: 40, variants: 2,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h } = a;
      groundShadow(ctx, w * 0.52, h * 0.56, w * 0.36, h * 0.34, 0.28);
      plank(a, w * 0.16, h * 0.16, w * 0.68, h * 0.68, 1);
      if (a.variant % 2 === 0) {
        candleFlame(a, w * 0.5, h * 0.42, w * 0.04);
      } else {
        ctx.fillStyle = '#7a3b3b';
        roundRect(ctx, w * 0.32, h * 0.34, w * 0.36, h * 0.24, w * 0.02);
        ctx.fill();
        ctx.strokeStyle = rgba(ink(a), 0.4); ctx.lineWidth = Math.max(1, w * 0.01); ctx.stroke();
      }
    },
  },
  {
    id: 'int/wash-stand', label: 'Wash Stand', group: 'furniture', sub: 'Bedchamber',
    tags: ['bedchamber', 'wash', 'basin', 'pitcher'], aspect: 1, defaultWidth: 50, variants: 2,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h } = a;
      groundShadow(ctx, w * 0.52, h * 0.56, w * 0.4, h * 0.34, 0.3);
      plank(a, w * 0.14, h * 0.16, w * 0.72, h * 0.68, 1);
      const cx = w * 0.4, cy = h * 0.5, r = Math.min(w, h) * 0.2;
      outlined(a, () => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); }, '#e0e6e2');
      ctx.fillStyle = rgba(a.palette.water, 0.8);
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2); ctx.fill();
      const px = w * 0.72, py = h * 0.44;
      outlined(a, () => { ctx.beginPath(); ctx.ellipse(px, py, r * 0.4, r * 0.5, 0, 0, Math.PI * 2); }, '#dfe6da');
      if (a.variant % 2 === 1) {
        ctx.strokeStyle = rgba('#e6ddcb', 0.9); ctx.lineWidth = Math.max(1, w * 0.03);
        ctx.beginPath(); ctx.moveTo(w * 0.16, h * 0.14); ctx.lineTo(w * 0.16, h * 0.4); ctx.stroke();
      }
    },
  },
  {
    id: 'int/folding-screen', label: 'Folding Screen', group: 'furniture', sub: 'Bedchamber',
    tags: ['bedchamber', 'screen', 'privacy'], aspect: 1.8, defaultWidth: 110, variants: 3,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h } = a;
      const panels = a.variant % 3 === 1 ? 4 : 3;
      const painted = a.variant % 3 === 2;
      groundShadow(ctx, w * 0.5, h * 0.62, w * 0.46, h * 0.24, 0.28);
      const pw = w / panels;
      for (let i = 0; i < panels; i++) {
        const x0 = pw * i, y0 = h * (i % 2 === 0 ? 0.2 : 0.28);
        const y1 = h * (i % 2 === 0 ? 0.86 : 0.78);
        outlined(a, () => roundRect(ctx, x0 + pw * 0.06, y0, pw * 0.88, y1 - y0, pw * 0.06),
          cloth(a, painted ? '#7a4a5a' : '#8a6a4a'));
        if (painted) {
          const cx = x0 + pw / 2, cy = (y0 + y1) / 2;
          const pts = star(cx, cy, pw * 0.24, pw * 0.1, 5);
          fillPath(ctx, pts, rgba('#c9a227', 0.7));
        } else {
          ctx.strokeStyle = rgba(woodDark, 0.4); ctx.lineWidth = Math.max(1, pw * 0.02);
          for (let k = 1; k < 3; k++) {
            ctx.beginPath(); ctx.moveTo(x0 + pw * 0.06, y0 + ((y1 - y0) * k) / 3);
            ctx.lineTo(x0 + pw * 0.94, y0 + ((y1 - y0) * k) / 3); ctx.stroke();
          }
        }
      }
    },
  },
  {
    id: 'int/clothes-chest', label: 'Clothes Chest', group: 'furniture', sub: 'Bedchamber',
    tags: ['bedchamber', 'chest', 'storage'], aspect: 1.4, defaultWidth: 70, variants: 2,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h } = a;
      groundShadow(ctx, w * 0.52, h * 0.6, w * 0.4, h * 0.3, 0.32);
      plank(a, w * 0.1, h * 0.16, w * 0.8, h * 0.68, 4);
      const ornate = a.variant % 2 === 1;
      ctx.fillStyle = ornate ? brass(a) : iron;
      ctx.fillRect(w * 0.1, h * 0.44, w * 0.8, h * 0.1);
      ctx.fillRect(w * 0.2, h * 0.16, w * 0.06, h * 0.68);
      ctx.fillRect(w * 0.74, h * 0.16, w * 0.06, h * 0.68);
      if (ornate) {
        ctx.fillStyle = '#d4b048';
        ctx.beginPath(); ctx.arc(w * 0.5, h * 0.49, w * 0.04, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = '#8a8580';
        roundRect(ctx, w * 0.46, h * 0.4, w * 0.08, h * 0.18, w * 0.02);
        ctx.fill();
      }
    },
  },

  // --- Prison ----------------------------------------------------------------
  {
    id: 'int/cell-bunk-straw', label: 'Cell Bunk with Straw', group: 'furniture', sub: 'Prison',
    tags: ['prison', 'bunk', 'straw', 'cell'], aspect: 1.6, defaultWidth: 80, variants: 2,
    kinds: ['dungeon', 'battle'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      groundShadow(ctx, w * 0.52, h * 0.56, w * 0.44, h * 0.34, 0.3);
      plank(a, w * 0.06, h * 0.14, w * 0.88, h * 0.72, 3, mix(woodBase, '#000000', 0.3));
      if (a.variant % 2 === 0) {
        speckle(ctx, w * 0.1, h * 0.2, w * 0.8, h * 0.6, 60, '#c9b25a', 1, Math.min(w, h) * 0.015, rng);
      } else {
        speckle(ctx, w * 0.5, h * 0.2, w * 0.4, h * 0.6, 70, '#c9b25a', 1, Math.min(w, h) * 0.02, rng);
        ctx.fillStyle = rgba('#5a5348', 0.6);
        roundRect(ctx, w * 0.1, h * 0.3, w * 0.32, h * 0.4, w * 0.02);
        ctx.fill();
      }
    },
  },
  {
    id: 'int/manacle-wall-ring', label: 'Manacle Wall Ring', group: 'furniture', sub: 'Prison',
    tags: ['prison', 'chains', 'wall', 'torture'], aspect: 1, defaultWidth: 40, variants: 1,
    kinds: ['dungeon', 'battle'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      ctx.fillStyle = rgba('#1a1512', 0.4);
      roundRect(ctx, w * 0.1, h * 0.1, w * 0.8, h * 0.8, w * 0.06);
      ctx.fill();
      const cx = w * 0.5, cy = h * 0.4, r = Math.min(w, h) * 0.16;
      ctx.strokeStyle = ironLight;
      ctx.lineWidth = Math.max(1.5, r * 0.35);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      const pts: Vec2[] = [];
      let x = cx, y = cy + r;
      for (let i = 0; i < 6; i++) {
        x += rng.float(-w * 0.06, w * 0.06);
        y += h * 0.08;
        pts.push({ x, y });
      }
      chainLine(ctx, pts, iron, Math.max(1.4, r * 0.3));
    },
  },
  {
    id: 'int/torture-rack', label: 'Torture Rack', group: 'furniture', sub: 'Prison',
    tags: ['prison', 'torture', 'rack'], aspect: 1.8, defaultWidth: 100, variants: 1,
    kinds: ['dungeon', 'battle'],
    draw(a) {
      const { ctx, w, h } = a;
      groundShadow(ctx, w * 0.52, h * 0.56, w * 0.46, h * 0.32, 0.32);
      plank(a, w * 0.14, h * 0.32, w * 0.72, h * 0.36, 5, mix(woodBase, '#000000', 0.2));
      for (const cx of [w * 0.1, w * 0.9]) {
        outlined(a, () => { ctx.beginPath(); ctx.arc(cx, h * 0.5, w * 0.08, 0, Math.PI * 2); }, ironLight);
        ctx.strokeStyle = rgba(ink(a), 0.5); ctx.lineWidth = Math.max(1, w * 0.008);
        for (let i = 0; i < 4; i++) {
          const ang = (i / 4) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(cx, h * 0.5);
          ctx.lineTo(cx + Math.cos(ang) * w * 0.08, h * 0.5 + Math.sin(ang) * w * 0.08);
          ctx.stroke();
        }
      }
      ctx.strokeStyle = rgba('#c9b28a', 0.85); ctx.lineWidth = Math.max(1, w * 0.012);
      ctx.beginPath(); ctx.moveTo(w * 0.18, h * 0.5); ctx.lineTo(w * 0.82, h * 0.5); ctx.stroke();
    },
  },
  {
    id: 'int/iron-maiden', label: 'Iron Maiden', group: 'furniture', sub: 'Prison',
    tags: ['prison', 'torture', 'iron'], aspect: 0.5, defaultWidth: 56, variants: 1,
    kinds: ['dungeon', 'battle'],
    /**
     * A tapered grey shape from above is a traffic cone. What names this one
     * is its ironmongery: two leaves with a seam between them, three hinges
     * down one side and a hasp down the other, banded and riveted, with the
     * cast face on the lid that is the only reason anyone recognises the
     * thing at all.
     */
    draw(a) {
      const { ctx, w, h } = a;
      groundShadow(ctx, w * 0.55, h * 0.55, w * 0.42, h * 0.48, 0.36);
      const body = mix(iron, '#000000', 0.1);
      // Head end broad and round, foot end drawn in — a body, not a cone.
      const shell = () => {
        ctx.beginPath();
        ctx.moveTo(w * 0.5, h * 0.03);
        ctx.bezierCurveTo(w * 0.9, h * 0.06, w * 0.92, h * 0.34, w * 0.8, h * 0.56);
        ctx.bezierCurveTo(w * 0.74, h * 0.78, w * 0.68, h * 0.95, w * 0.5, h * 0.97);
        ctx.bezierCurveTo(w * 0.32, h * 0.95, w * 0.26, h * 0.78, w * 0.2, h * 0.56);
        ctx.bezierCurveTo(w * 0.08, h * 0.34, w * 0.1, h * 0.06, w * 0.5, h * 0.03);
        ctx.closePath();
      };
      outlined(a, shell, lightGradient(ctx, w * 0.1, 0, w * 0.9, h, body, 0.3, 0.4), 0.8, 0.024);

      ctx.save();
      shell();
      ctx.clip();
      // The two leaves, and the shadow the near one drops into the seam.
      ctx.fillStyle = rgba('#000000', 0.3);
      ctx.fillRect(w * 0.5, 0, w * 0.05, h);
      ctx.strokeStyle = rgba(ironLight, 0.5);
      ctx.lineWidth = Math.max(1, w * 0.018);
      ctx.beginPath(); ctx.moveTo(w * 0.49, h * 0.04); ctx.lineTo(w * 0.49, h * 0.96); ctx.stroke();
      // Iron bands across the shell, each with its rivets.
      for (const t of [0.2, 0.44, 0.68, 0.86]) {
        ctx.fillStyle = rgba(mix(iron, '#ffffff', 0.16), 0.85);
        ctx.fillRect(0, h * t - h * 0.018, w, h * 0.036);
        ctx.fillStyle = rgba('#000000', 0.28);
        ctx.fillRect(0, h * t + h * 0.018, w, h * 0.012);
        ctx.fillStyle = rgba(ironLight, 0.9);
        for (const u of [0.2, 0.34, 0.66, 0.8]) {
          ctx.beginPath(); ctx.arc(w * u, h * t, w * 0.02, 0, Math.PI * 2); ctx.fill();
        }
      }
      // The face on the lid: brow, eyes and a nose ridge, cast proud.
      const fy = h * 0.115;
      ctx.strokeStyle = rgba('#000000', 0.5);
      ctx.lineWidth = Math.max(1, w * 0.022);
      ctx.beginPath();
      ctx.moveTo(w * 0.32, fy - h * 0.02);
      ctx.quadraticCurveTo(w * 0.5, fy - h * 0.045, w * 0.68, fy - h * 0.02);
      ctx.stroke();
      ctx.fillStyle = rgba('#0d0f11', 0.85);
      for (const u of [0.4, 0.6]) {
        ctx.beginPath(); ctx.ellipse(w * u, fy + h * 0.012, w * 0.055, h * 0.012, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = rgba(ironLight, 0.45);
      ctx.lineWidth = Math.max(1, w * 0.026);
      ctx.beginPath(); ctx.moveTo(w * 0.5, fy); ctx.lineTo(w * 0.5, fy + h * 0.055); ctx.stroke();
      ctx.strokeStyle = rgba('#0d0f11', 0.7);
      ctx.lineWidth = Math.max(1, w * 0.018);
      ctx.beginPath();
      ctx.moveTo(w * 0.4, fy + h * 0.075);
      ctx.quadraticCurveTo(w * 0.5, fy + h * 0.09, w * 0.6, fy + h * 0.075);
      ctx.stroke();
      ctx.restore();

      // Hinges on the far leaf, hasp and lock on the near one.
      ctx.fillStyle = mix(iron, '#000000', 0.35);
      for (const [t, x0] of [[0.22, 0.11], [0.5, 0.11], [0.8, 0.16]] as [number, number][]) {
        roundRect(ctx, w * x0, h * t - h * 0.03, w * 0.15, h * 0.06, w * 0.02);
        ctx.fill();
      }
      ctx.fillStyle = mix(iron, '#ffffff', 0.1);
      roundRect(ctx, w * 0.42, h * 0.46, w * 0.3, h * 0.075, w * 0.02);
      ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.7);
      ctx.lineWidth = Math.max(1, w * 0.016);
      ctx.stroke();
      ctx.fillStyle = mix(brassBase, '#000000', 0.15);
      ctx.beginPath(); ctx.arc(w * 0.73, h * 0.5, w * 0.055, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.75);
      ctx.lineWidth = Math.max(1, w * 0.018);
      ctx.stroke();
    },
  },
  {
    id: 'int/stocks', label: 'Stocks', group: 'furniture', sub: 'Prison',
    tags: ['prison', 'stocks', 'punishment'], aspect: 1.3, defaultWidth: 70, variants: 2,
    kinds: ['dungeon', 'city', 'battle'],
    draw(a) {
      const { ctx, w, h } = a;
      groundShadow(ctx, w * 0.52, h * 0.58, w * 0.44, h * 0.3, 0.3);
      plank(a, w * 0.1, h * 0.28, w * 0.8, h * 0.44, 3, mix(woodBase, '#000000', 0.15));
      const single = a.variant % 2 === 0;
      ctx.fillStyle = '#0e0c0a';
      if (single) {
        ctx.beginPath(); ctx.arc(w * 0.5, h * 0.5, w * 0.08, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(w * 0.36, h * 0.5, w * 0.07, 0, Math.PI * 2); ctx.fill();
        for (const s of [-1, 1]) {
          ctx.beginPath(); ctx.arc(w * 0.62 + s * w * 0.13, h * 0.5, w * 0.05, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.strokeStyle = rgba(ink(a), 0.5); ctx.lineWidth = Math.max(1, w * 0.01);
      ctx.beginPath(); ctx.moveTo(w * 0.1, h * 0.5); ctx.lineTo(w * 0.9, h * 0.5); ctx.stroke();
    },
  },
  {
    id: 'int/brazier-irons', label: 'Brazier of Irons', group: 'furniture', sub: 'Prison',
    tags: ['prison', 'brazier', 'fire', 'torture', 'light'], aspect: 1, defaultWidth: 46, variants: 1,
    kinds: ['dungeon', 'battle'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const cx = w * 0.46, cy = h * 0.52, r = Math.min(w, h) * 0.3;
      radialGlow(ctx, cx, cy, r * 2, '#ff7a2a', 0.5);
      outlined(a, () => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); }, iron);
      ctx.fillStyle = '#e0662a';
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = ironLight; ctx.lineWidth = Math.max(1, r * 0.12);
      for (let i = 0; i < 3; i++) {
        const ang = rng.float(-0.5, 0.2) - i * 0.3;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * r * 0.4, cy + Math.sin(ang) * r * 0.4);
        ctx.lineTo(cx + Math.cos(ang) * r * 1.7, cy + Math.sin(ang) * r * 1.7);
        ctx.stroke();
      }
    },
  },
  {
    id: 'int/guard-table-keys', label: "Guard's Table with Keys", group: 'furniture', sub: 'Prison',
    tags: ['prison', 'guard', 'keys', 'table'], aspect: 1.2, defaultWidth: 70, variants: 1,
    kinds: ['dungeon', 'city', 'battle'],
    draw(a) {
      const { ctx, w, h } = a;
      groundShadow(ctx, w * 0.5, h * 0.56, w * 0.42, h * 0.32, 0.3);
      plank(a, w * 0.08, h * 0.18, w * 0.68, h * 0.6, 3);
      stool(a, w * 0.86, h * 0.5, Math.min(w, h) * 0.14);
      const kx = w * 0.32, ky = h * 0.46, kr = Math.min(w, h) * 0.06;
      ctx.strokeStyle = ironLight; ctx.lineWidth = Math.max(1, kr * 0.3);
      ctx.beginPath(); ctx.arc(kx, ky, kr, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 4; i++) {
        const ang = (i / 4) * Math.PI * 2;
        const ex = kx + Math.cos(ang) * kr, ey = ky + Math.sin(ang) * kr;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex + Math.cos(ang) * kr * 0.7, ey + Math.sin(ang) * kr * 0.7);
        ctx.stroke();
      }
    },
  },

  // --- Forge -------------------------------------------------------------
  {
    id: 'int/forge-hearth', label: 'Forge Hearth', group: 'furniture', sub: 'Forge',
    tags: ['forge', 'fire', 'coals', 'smith'], aspect: 1.2, defaultWidth: 120, variants: 2,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const s = mix(stoneC(a), '#2a2622', 0.3);
      groundShadow(ctx, w * 0.52, h * 0.6, w * 0.44, h * 0.32, 0.32);
      outlined(a, () => roundRect(ctx, w * 0.04, h * 0.06, w * 0.92, h * 0.88, w * 0.05),
        lightGradient(ctx, w * 0.04, h * 0.06, w * 0.96, h * 0.94, s, 0.24, 0.34));
      const hot = a.variant % 2 === 0;
      radialGlow(ctx, w * 0.5, h * 0.56, hot ? w * 0.55 : w * 0.35, '#ff7a2a', hot ? 0.6 : 0.32);
      ctx.fillStyle = '#0e0c0a';
      ctx.beginPath(); ctx.ellipse(w * 0.5, h * 0.56, w * 0.3, h * 0.22, 0, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 10; i++) {
        const cx = w * rng.float(0.32, 0.68), cy = h * rng.float(0.46, 0.68);
        ctx.fillStyle = hot ? rng.pick(['#ff9a3c', '#ffd06a', '#e0662a']) : rng.pick(['#5a4a3a', '#7a5a3a']);
        ctx.beginPath(); ctx.arc(cx, cy, w * 0.02, 0, Math.PI * 2); ctx.fill();
      }
    },
  },
  {
    id: 'int/bellows', label: 'Bellows', group: 'furniture', sub: 'Forge',
    tags: ['forge', 'bellows', 'air'], aspect: 1.6, defaultWidth: 70, variants: 1,
    kinds: ['dungeon', 'city'],
    /**
     * A great bellows is a teardrop: a broad round butt, a straight taper, and
     * an iron nozzle at the point. The old outline was a lumpy pentagon with
     * three lines on it, which is why it read as a sack. Drawn properly the
     * silhouette does most of the work, and the rest is the top board sitting
     * inside a ring of pleated leather with its nails all round.
     */
    draw(a) {
      const { ctx, w, h, rng } = a;
      groundShadow(ctx, w * 0.46, h * 0.58, w * 0.44, h * 0.34, 0.32);
      const cy = h * 0.5, back = w * 0.1, tip = w * 0.86, halfW = h * 0.34;
      const body = () => {
        ctx.beginPath();
        ctx.moveTo(tip, cy - h * 0.045);
        ctx.bezierCurveTo(w * 0.55, cy - halfW * 0.92, w * 0.36, cy - halfW, back + halfW * 0.9, cy - halfW * 0.8);
        ctx.bezierCurveTo(back - halfW * 0.25, cy - halfW * 0.55, back - halfW * 0.25, cy + halfW * 0.55, back + halfW * 0.9, cy + halfW * 0.8);
        ctx.bezierCurveTo(w * 0.36, cy + halfW, w * 0.55, cy + halfW * 0.92, tip, cy + h * 0.045);
        ctx.closePath();
      };
      // The leather, dark and slightly greasy.
      outlined(a, body, lightGradient(ctx, 0, cy - halfW, 0, cy + halfW,
        mix('#3b2718', a.tint ?? '#3b2718', a.tint ? a.tintStrength * 0.5 : 0), 0.2, 0.36), 0.75, 0.016);

      ctx.save();
      body();
      ctx.clip();
      // Pleats, tightening toward the nozzle where the leather has less room.
      ctx.strokeStyle = rgba('#1d1207', 0.4);
      for (let i = 0; i < 7; i++) {
        const t = 0.1 + i * 0.115;
        const x = back + (tip - back) * t;
        const sp = halfW * (1 - t * 0.85);
        ctx.lineWidth = Math.max(1, w * 0.011);
        ctx.beginPath();
        ctx.moveTo(x, cy - sp);
        ctx.quadraticCurveTo(x + w * 0.02, cy, x, cy + sp);
        ctx.stroke();
      }
      // The top board: a wooden panel inside the leather, not the whole shape.
      // The shadow round it is what sets it down into the leather.
      const bx = back + halfW * 0.8, brx = halfW * 0.72, bry = halfW * 0.6;
      ctx.fillStyle = rgba('#0d0904', 0.35);
      ctx.beginPath();
      ctx.ellipse(bx + w * 0.008, cy + h * 0.012, brx * 1.06, bry * 1.08, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = lightGradient(ctx, 0, cy - bry, 0, cy + bry, mix(wood(a), '#c69a5e', 0.4), 0.24, 0.3);
      ctx.beginPath();
      ctx.ellipse(bx, cy, brx, bry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rgba(woodDark, 0.8);
      ctx.lineWidth = Math.max(1, w * 0.013);
      ctx.stroke();
      // The board is two planks with the valve slot between them.
      ctx.beginPath();
      ctx.moveTo(bx, cy - bry); ctx.lineTo(bx, cy + bry);
      ctx.stroke();
      ctx.fillStyle = rgba('#120d08', 0.6);
      roundRect(ctx, bx - brx * 0.1, cy - bry * 0.34, brx * 0.2, bry * 0.68, brx * 0.08);
      ctx.fill();

      // Nails round the leather edge — clipped, so none of them float free.
      ctx.fillStyle = rgba(ironLight, 0.85);
      for (let i = 0; i < 18; i++) {
        const ang = (i / 18) * Math.PI * 2;
        const x = bx + Math.cos(ang) * brx * 1.28;
        const y = cy + Math.sin(ang) * bry * 1.3;
        ctx.beginPath(); ctx.arc(x, y, w * 0.009, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();

      // The iron loop the smith's boy hauls on, and the tuyère at the point.
      ctx.strokeStyle = mix(iron, '#000000', 0.2);
      ctx.lineWidth = Math.max(1.5, w * 0.022);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(back + halfW * 0.02, cy, halfW * 0.3, Math.PI * 0.62, Math.PI * 1.38);
      ctx.stroke();
      ctx.fillStyle = lightGradient(ctx, 0, cy - h * 0.06, 0, cy + h * 0.06, iron, 0.3, 0.35);
      roundRect(ctx, tip - w * 0.02, cy - h * 0.055, w * 0.16, h * 0.11, h * 0.02);
      ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.75);
      ctx.lineWidth = Math.max(1, w * 0.014);
      ctx.stroke();
      ctx.fillStyle = rgba('#120d08', 0.9);
      ctx.beginPath();
      ctx.ellipse(tip + w * 0.13, cy, w * 0.012, h * 0.035, 0, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  {
    id: 'int/quench-trough', label: 'Quench Trough', group: 'furniture', sub: 'Forge',
    tags: ['forge', 'water', 'trough'], aspect: 1.8, defaultWidth: 90, variants: 2,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      groundShadow(ctx, w * 0.52, h * 0.58, w * 0.46, h * 0.28, 0.3);
      outlined(a, () => roundRect(ctx, w * 0.05, h * 0.24, w * 0.9, h * 0.52, h * 0.16), stoneC(a));
      ctx.fillStyle = rgba(mix(a.palette.water, '#3a3a3a', 0.15), 0.85);
      roundRect(ctx, w * 0.1, h * 0.3, w * 0.8, h * 0.4, h * 0.12);
      ctx.fill();
      if (a.variant % 2 === 0) {
        for (let i = 0; i < 3; i++) {
          const cx = w * rng.float(0.3, 0.7), cy = h * rng.float(0.35, 0.55);
          ctx.strokeStyle = rgba('#ffffff', 0.4); ctx.lineWidth = Math.max(1, w * 0.01);
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.quadraticCurveTo(cx + w * 0.02, cy - h * 0.14, cx + w * 0.04, cy - h * 0.24); ctx.stroke();
        }
      }
    },
  },
  {
    id: 'int/grindstone-wheel', label: 'Grindstone Wheel', group: 'furniture', sub: 'Forge',
    tags: ['forge', 'grindstone', 'sharpen'], aspect: 1, defaultWidth: 60, variants: 1,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h } = a;
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.4;
      groundShadow(ctx, cx + r * 0.08, cy + r * 0.1, r, r * 0.9, 0.3);
      ctx.strokeStyle = wood(a); ctx.lineWidth = Math.max(1, r * 0.16);
      ctx.beginPath(); ctx.moveTo(cx - r * 0.9, cy - r * 0.4); ctx.lineTo(cx - r * 0.9, cy + r * 0.9); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + r * 0.9, cy - r * 0.4); ctx.lineTo(cx + r * 0.9, cy + r * 0.9); ctx.stroke();
      outlined(a, () => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); },
        lightGradient(ctx, cx - r, cy - r, cx + r, cy + r, mix(stoneC(a), '#8a7a6a', 0.3), 0.3, 0.3));
      ctx.strokeStyle = rgba(ink(a), 0.4); ctx.lineWidth = Math.max(1, r * 0.02);
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = ironLight;
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.14, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = ironLight; ctx.lineWidth = Math.max(1, r * 0.1);
      ctx.beginPath(); ctx.moveTo(cx + r * 0.14, cy); ctx.lineTo(cx + r * 0.4, cy); ctx.stroke();
    },
  },
  {
    id: 'int/weapon-rack', label: 'Weapon Rack', group: 'furniture', sub: 'Forge',
    tags: ['forge', 'weapons', 'rack', 'wall'], aspect: 1.8, defaultWidth: 100, variants: 2,
    kinds: ['dungeon', 'city', 'battle'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      plank(a, w * 0.04, h * 0.7, w * 0.92, h * 0.2, 2);
      const axes = a.variant % 2 === 1;
      const n = 6;
      for (let i = 0; i < n; i++) {
        const bx = w * (0.1 + i * 0.8 / (n - 1));
        const by = h * 0.72;
        const len = h * rng.float(0.5, 0.66);
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(rng.float(-0.06, 0.06));
        if (axes) {
          ctx.strokeStyle = wood(a); ctx.lineWidth = Math.max(1, w * 0.012);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -len); ctx.stroke();
          ctx.fillStyle = ironLight;
          const pts: Vec2[] = [{ x: 0, y: -len }, { x: w * 0.08, y: -len * 0.86 }, { x: 0, y: -len * 0.72 }];
          fillPath(ctx, pts, ironLight);
        } else {
          ctx.fillStyle = ironLight;
          const pts: Vec2[] = [
            { x: -w * 0.01, y: 0 }, { x: w * 0.01, y: 0 },
            { x: w * 0.015, y: -len * 0.8 }, { x: 0, y: -len }, { x: -w * 0.015, y: -len * 0.8 },
          ];
          fillPath(ctx, pts, ironLight);
          ctx.fillStyle = brass(a);
          ctx.fillRect(-w * 0.012, 0, w * 0.024, h * 0.08);
        }
        ctx.restore();
      }
    },
  },
  {
    id: 'int/armour-stand', label: 'Armour Stand', group: 'furniture', sub: 'Forge',
    tags: ['forge', 'armour', 'stand'], aspect: 0.8, defaultWidth: 56, variants: 2,
    kinds: ['dungeon', 'city', 'battle'],
    draw(a) {
      const { ctx, w, h } = a;
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.4;
      groundShadow(ctx, cx + r * 0.08, cy + r * 0.12, r, r, 0.32);
      const heavy = a.variant % 2 === 0;
      const metal = heavy ? ironLight : mix('#7a5a3a', '#c9a86a', 0.3);
      ctx.fillStyle = metal;
      ctx.beginPath(); ctx.arc(cx, cy - r * 0.1, r * 0.28, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = metal;
      ctx.lineWidth = r * (heavy ? 0.4 : 0.28);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.6, cy + r * 0.3);
      ctx.lineTo(cx, cy + r * 0.1);
      ctx.lineTo(cx + r * 0.6, cy + r * 0.3);
      ctx.stroke();
      ctx.strokeStyle = rgba(ink(a), 0.55); ctx.lineWidth = Math.max(1, w * 0.015);
      ctx.beginPath(); ctx.arc(cx, cy - r * 0.1, r * 0.28, 0, Math.PI * 2); ctx.stroke();
    },
  },
  {
    id: 'int/tool-bench', label: 'Tool Bench', group: 'furniture', sub: 'Forge',
    tags: ['forge', 'tools', 'bench', 'hammers'], aspect: 2.0, defaultWidth: 120, variants: 2,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      groundShadow(ctx, w * 0.52, h * 0.56, w * 0.47, h * 0.34, 0.3);
      plank(a, w * 0.05, h * 0.16, w * 0.9, h * 0.68, 5, mix(woodBase, '#000000', 0.15));
      const hammers = a.variant % 2 === 0;
      for (let i = 0; i < 4; i++) {
        const x0 = w * (0.14 + i * 0.22), y0 = h * rng.float(0.32, 0.62);
        ctx.save();
        ctx.translate(x0, y0);
        ctx.rotate(rng.float(-0.4, 0.4));
        if (hammers) {
          ctx.strokeStyle = wood(a); ctx.lineWidth = Math.max(1, w * 0.01);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, h * 0.16); ctx.stroke();
          ctx.fillStyle = ironLight;
          ctx.fillRect(-w * 0.03, -h * 0.02, w * 0.06, h * 0.05);
        } else {
          ctx.strokeStyle = ironLight; ctx.lineWidth = Math.max(1, w * 0.012);
          ctx.beginPath(); ctx.moveTo(-w * 0.03, 0); ctx.lineTo(w * 0.03, h * 0.1); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(w * 0.03, 0); ctx.lineTo(-w * 0.03, h * 0.1); ctx.stroke();
        }
        ctx.restore();
      }
    },
  },

  // --- Temple --------------------------------------------------------------
  {
    id: 'int/pew-rows', label: 'Pew Rows', group: 'furniture', sub: 'Temple',
    tags: ['temple', 'pew', 'seating'], aspect: 2.2, defaultWidth: 140, variants: 2,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h } = a;
      const rows = a.variant % 2 === 0 ? 2 : 3;
      const rh = h / rows;
      for (let r = 0; r < rows; r++) {
        const y = rh * r + rh * 0.14;
        groundShadow(ctx, w * 0.5, y + rh * 0.44, w * 0.47, rh * 0.3, 0.24);
        plank(a, w * 0.03, y, w * 0.94, rh * 0.72, 6);
      }
    },
  },
  {
    id: 'int/stone-font', label: 'Stone Font', group: 'furniture', sub: 'Temple',
    tags: ['temple', 'font', 'water', 'ritual'], aspect: 1, defaultWidth: 60, variants: 1,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h } = a;
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.4;
      groundShadow(ctx, cx + r * 0.06, cy + r * 0.1, r, r * 0.95, 0.3);
      outlined(a, () => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); },
        lightGradient(ctx, cx - r, cy - r, cx + r, cy + r, mix(stoneC(a), '#cfc8ba', 0.3), 0.3, 0.28));
      ctx.fillStyle = rgba(a.palette.shallowWater, 0.85);
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgba('#ffffff', 0.5); ctx.lineWidth = Math.max(1, r * 0.05);
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.4, 0, Math.PI * 2); ctx.stroke();
    },
  },
  {
    id: 'int/candelabrum', label: 'Candelabrum', group: 'furniture', sub: 'Temple',
    tags: ['temple', 'candle', 'light'], aspect: 1, defaultWidth: 40, variants: 2,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h } = a;
      const cx = w / 2, cy = h / 2;
      const branches = a.variant % 2 === 0 ? 3 : 5;
      ctx.fillStyle = brass(a);
      ctx.beginPath(); ctx.arc(cx, cy, Math.min(w, h) * 0.1, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < branches; i++) {
        const ang = (i / branches) * Math.PI * 2 - Math.PI / 2;
        const bx = cx + Math.cos(ang) * Math.min(w, h) * 0.3;
        const by = cy + Math.sin(ang) * Math.min(w, h) * 0.3;
        ctx.strokeStyle = brass(a); ctx.lineWidth = Math.max(1, w * 0.02);
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(bx, by); ctx.stroke();
        candleFlame(a, bx, by, Math.min(w, h) * 0.035);
      }
    },
  },
  {
    id: 'int/reliquary-casket', label: 'Reliquary Casket', group: 'furniture', sub: 'Temple',
    tags: ['temple', 'reliquary', 'gold', 'holy'], aspect: 1.3, defaultWidth: 56, variants: 2,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      groundShadow(ctx, w * 0.52, h * 0.6, w * 0.4, h * 0.3, 0.32);
      outlined(a, () => roundRect(ctx, w * 0.12, h * 0.2, w * 0.76, h * 0.6, w * 0.08),
        lightGradient(ctx, w * 0.12, h * 0.2, w * 0.88, h * 0.8, mix(a.palette.accent, '#4a2a5a', 0.3), 0.3, 0.3));
      ctx.fillStyle = brass(a);
      ctx.fillRect(w * 0.12, h * 0.46, w * 0.76, h * 0.08);
      if (a.variant % 2 === 1) {
        for (let i = 0; i < 6; i++) {
          ctx.beginPath(); ctx.arc(w * (0.2 + i * 0.12), h * 0.28, w * 0.015, 0, Math.PI * 2); ctx.fill();
        }
      }
      const gem = rng.pick(['#7ac8ff', '#b98aff', '#ff8ac8']);
      const pts = star(w * 0.5, h * 0.5, w * 0.08, w * 0.035, 6);
      fillPath(ctx, pts, gem);
      radialGlow(ctx, w * 0.5, h * 0.5, w * 0.3, gem, 0.4);
    },
  },
  {
    id: 'int/offering-bowls', label: 'Offering Bowls', group: 'furniture', sub: 'Temple',
    tags: ['temple', 'offering', 'bowl'], aspect: 1.4, defaultWidth: 60, variants: 3,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const mode = a.variant % 3;
      for (let i = 0; i < 3; i++) {
        const cx = w * (0.2 + i * 0.3), cy = h * (0.5 + (i % 2) * 0.1);
        const r = Math.min(w, h) * 0.14;
        groundShadow(ctx, cx, cy + r * 0.5, r * 0.9, r * 0.4, 0.24);
        outlined(a, () => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); }, brass(a), 0.6, 0.02);
        if (mode === 0) {
          ctx.fillStyle = rng.pick(['#8a3a3a', '#c9a83a']);
          ctx.beginPath(); ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2); ctx.fill();
        } else if (mode === 1) {
          for (let k = 0; k < 4; k++) {
            ctx.fillStyle = '#d4b048';
            ctx.beginPath(); ctx.arc(cx + rng.float(-r * 0.4, r * 0.4), cy + rng.float(-r * 0.4, r * 0.4), r * 0.14, 0, Math.PI * 2); ctx.fill();
          }
        } else {
          candleFlame(a, cx, cy, r * 0.3);
        }
      }
    },
  },
  {
    id: 'int/prayer-mats', label: 'Prayer Mats', group: 'furniture', sub: 'Temple',
    tags: ['temple', 'mat', 'floor', 'prayer'], aspect: 1.6, defaultWidth: 90, variants: 3,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h } = a;
      const base = cloth(a, '#7a3b5a'), border = cloth(a, '#c9a227');
      if (a.variant % 3 === 2) {
        weaveRug(a, w * 0.08, h * 0.1, w * 0.84, h * 0.8, [base, ink(a), border]);
        return;
      }
      const rows = a.variant % 3 === 0 ? 2 : 3;
      const mw = w * 0.9 / rows, mh = h * 0.7;
      for (let i = 0; i < rows; i++) {
        const x = w * 0.05 + i * mw;
        groundShadow(ctx, x + mw * 0.44, h * 0.5 + mh * 0.06, mw * 0.4, mh * 0.44, 0.2);
        outlined(a, () => roundRect(ctx, x + mw * 0.06, h * 0.15, mw * 0.82, mh, mw * 0.05), base, 0.5, 0.012);
        ctx.strokeStyle = rgba(border, 0.8); ctx.lineWidth = Math.max(1, mw * 0.03);
        roundRect(ctx, x + mw * 0.14, h * 0.2, mw * 0.66, mh * 0.86, mw * 0.04);
        ctx.stroke();
      }
    },
  },
  {
    id: 'int/hanging-censer', label: 'Hanging Censer', group: 'furniture', sub: 'Temple',
    tags: ['temple', 'censer', 'smoke', 'light'], aspect: 1, defaultWidth: 40, variants: 2,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h } = a;
      const cx = w / 2, cy = h * 0.55, r = Math.min(w, h) * 0.24;
      const heavy = a.variant % 2 === 1;
      radialGlow(ctx, cx, cy, r * (heavy ? 3.2 : 2.2), '#ffb15c', heavy ? 0.5 : 0.32);
      outlined(a, () => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); }, brass(a));
      ctx.strokeStyle = rgba('#d8cbb0', heavy ? 0.5 : 0.3); ctx.lineWidth = Math.max(1, r * 0.15);
      ctx.beginPath();
      ctx.moveTo(cx, cy - r); ctx.quadraticCurveTo(cx + r * 0.6, cy - r * 1.8, cx - r * 0.2, cy - r * 2.6);
      ctx.stroke();
      ctx.strokeStyle = ironLight; ctx.lineWidth = Math.max(1, r * 0.1);
      ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, h * 0.06); ctx.stroke();
    },
  },

  // --- Shop --------------------------------------------------------------
  {
    id: 'int/shop-counter-scale', label: 'Shop Counter with Scale', group: 'furniture', sub: 'Shop',
    tags: ['shop', 'counter', 'scale', 'merchant'], aspect: 1.8, defaultWidth: 120, variants: 2,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h } = a;
      groundShadow(ctx, w * 0.52, h * 0.58, w * 0.47, h * 0.32, 0.3);
      plank(a, w * 0.05, h * 0.2, w * 0.9, h * 0.6, 6);
      const scaleX = a.variant % 2 === 0 ? w * 0.24 : w * 0.5;
      ctx.strokeStyle = brass(a); ctx.lineWidth = Math.max(1, w * 0.012);
      ctx.beginPath(); ctx.moveTo(scaleX, h * 0.5); ctx.lineTo(scaleX, h * 0.3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(scaleX - w * 0.09, h * 0.32); ctx.lineTo(scaleX + w * 0.09, h * 0.32); ctx.stroke();
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(scaleX + s * w * 0.09, h * 0.32); ctx.lineTo(scaleX + s * w * 0.09, h * 0.4); ctx.stroke();
        outlined(a, () => { ctx.beginPath(); ctx.arc(scaleX + s * w * 0.09, h * 0.42, w * 0.03, 0, Math.PI * 2); }, brass(a), 0.5, 0.01);
      }
      if (a.variant % 2 === 1) {
        ctx.fillStyle = '#e6ddc8';
        roundRect(ctx, w * 0.68, h * 0.32, w * 0.2, h * 0.24, w * 0.01);
        ctx.fill();
      }
    },
  },
  {
    id: 'int/display-shelving', label: 'Display Shelving', group: 'furniture', sub: 'Shop',
    tags: ['shop', 'shelf', 'goods', 'display'], aspect: 2.2, defaultWidth: 110, variants: 2,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const cloth_ = a.variant % 2 === 0;
      railShelf(a, w * 0.04, h * 0.08, w * 0.92, h * 0.72, 3, (rx, ry, rw, rh) => {
        const n = 5;
        for (let i = 0; i < n; i++) {
          const iw = rw / n;
          const ix = rx + iw * i + iw * 0.14;
          if (cloth_) {
            ctx.fillStyle = rng.pick(['#7a3b5a', '#3b5a7a', '#5a7a3b', '#8a6a3a']);
            roundRect(ctx, ix, ry + rh * 0.2, iw * 0.72, rh * 0.6, rh * 0.1);
            ctx.fill();
          } else {
            ctx.fillStyle = rng.pick(['#8a6a4a', '#6a7a8a', '#a89058']);
            ctx.beginPath(); ctx.arc(ix + iw * 0.32, ry + rh * 0.55, rh * 0.36, 0, Math.PI * 2); ctx.fill();
          }
        }
      });
    },
  },
  {
    id: 'int/hanging-goods-rack', label: 'Hanging Goods Rack', group: 'furniture', sub: 'Shop',
    tags: ['shop', 'rack', 'goods', 'hanging'], aspect: 1.6, defaultWidth: 90, variants: 2,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      ctx.strokeStyle = woodDark; ctx.lineWidth = Math.max(1, h * 0.05);
      ctx.beginPath(); ctx.moveTo(w * 0.04, h * 0.12); ctx.lineTo(w * 0.96, h * 0.12); ctx.stroke();
      const pouches = a.variant % 2 === 0;
      const n = 5;
      for (let i = 0; i < n; i++) {
        const cx = w * (0.12 + (i / (n - 1)) * 0.76);
        const cy = h * rng.float(0.44, 0.66);
        const r = Math.min(w, h) * rng.float(0.08, 0.13);
        groundShadow(ctx, cx + r * 0.15, cy + r * 0.2, r * 0.8, r * 0.7, 0.2);
        bundle(a, cx, cy, r, pouches ? rng.pick(['#8a5a3a', '#6a4a3a']) : rng.pick(['#5f7a3f', '#7a8a4a']));
        ctx.strokeStyle = rgba(woodDark, 0.7); ctx.lineWidth = Math.max(1, r * 0.1);
        ctx.beginPath(); ctx.moveTo(cx, h * 0.12); ctx.lineTo(cx, cy - r * 0.6); ctx.stroke();
      }
    },
  },
  {
    id: 'int/sacks-amphorae', label: 'Sacks & Amphorae', group: 'furniture', sub: 'Shop',
    tags: ['shop', 'sacks', 'amphora', 'goods'], aspect: 1.4, defaultWidth: 80, variants: 3,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const mode = a.variant % 3;
      const positions: Vec2[] = [
        { x: w * 0.2, y: h * 0.6 }, { x: w * 0.5, y: h * 0.45 }, { x: w * 0.78, y: h * 0.62 },
      ];
      for (let i = 0; i < positions.length; i++) {
        const p = positions[i];
        const r = Math.min(w, h) * 0.2;
        const useSack = mode === 0 ? true : mode === 1 ? false : i % 2 === 0;
        groundShadow(ctx, p.x + r * 0.1, p.y + r * 0.15, r * 0.9, r * 0.7, 0.28);
        if (useSack) sackBlob(a, p.x, p.y, r, mix('#c9b285', '#8a7350', rng.float(0, 0.4)));
        else amphora(a, p.x, p.y, r * 0.8, rng.pick(['#a8662f', '#8a6a4a']));
      }
    },
  },
  {
    id: 'int/market-crate-display', label: 'Market Crate Display', group: 'furniture', sub: 'Shop',
    tags: ['shop', 'crate', 'produce', 'market'], aspect: 1.6, defaultWidth: 100, variants: 2,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const pyramid = a.variant % 2 === 0;
      const crate = (x: number, y: number, s: number) => {
        groundShadow(ctx, x + s * 0.53, y + s * 0.55, s * 0.4, s * 0.4, 0.28);
        plank(a, x, y, s, s, 3);
        ctx.strokeStyle = rgba(woodDark, 0.7); ctx.lineWidth = Math.max(1, s * 0.05);
        ctx.beginPath(); ctx.moveTo(x + s * 0.1, y + s * 0.1); ctx.lineTo(x + s * 0.9, y + s * 0.9);
        ctx.moveTo(x + s * 0.9, y + s * 0.1); ctx.lineTo(x + s * 0.1, y + s * 0.9); ctx.stroke();
      };
      if (pyramid) {
        const s = Math.min(w, h) * 0.4;
        crate(w * 0.08, h * 0.5, s); crate(w * 0.5, h * 0.5, s);
        crate(w * 0.3, h * 0.08, s);
      } else {
        const s = Math.min(w, h) * 0.36;
        for (let i = 0; i < 3; i++) crate(w * (0.06 + i * 0.32), h * 0.5, s);
        for (let i = 0; i < 4; i++) {
          const cx = w * (0.1 + i * 0.24), cy = h * 0.34;
          ctx.fillStyle = rng.pick(['#a8542f', '#c9a83a', '#7fa04a']);
          ctx.beginPath(); ctx.arc(cx, cy, Math.min(w, h) * 0.05, 0, Math.PI * 2); ctx.fill();
        }
      }
    },
  },

  // --- Comfort ---------------------------------------------------------------
  {
    id: 'int/carpet-patterned', label: 'Patterned Carpet', group: 'furniture', sub: 'Comfort',
    tags: ['comfort', 'rug', 'carpet', 'floor'], aspect: 1.6, defaultWidth: 280, variants: 4,
    kinds: ['dungeon', 'city', 'battle'],
    draw(a) {
      const { w, h } = a;
      const palettes: [string, string, string][] = [
        [cloth(a, '#7a2f3a'), cloth(a, '#2a2118'), cloth(a, '#c9a227')],
        [cloth(a, '#2f4a5a'), cloth(a, '#1c2a33'), cloth(a, '#c98a3a')],
        [cloth(a, '#3f5a3a'), cloth(a, '#22301f'), cloth(a, '#d4b048')],
        [cloth(a, '#5a3a5a'), cloth(a, '#241a26'), cloth(a, '#8ac0c8')],
      ];
      const colors = palettes[a.rng.int(0, palettes.length - 1)];
      weaveRug(a, w * 0.04, h * 0.06, w * 0.92, h * 0.88, colors);
    },
  },
  {
    id: 'int/rug-runner', label: 'Runner Rug', group: 'furniture', sub: 'Comfort',
    tags: ['comfort', 'rug', 'runner', 'hallway', 'floor'], aspect: 3.2, defaultWidth: 200, variants: 4,
    kinds: ['dungeon', 'city', 'battle'],
    draw(a) {
      const { w, h } = a;
      const palettes: [string, string, string][] = [
        [cloth(a, '#7a3b3b'), cloth(a, '#2a2118'), cloth(a, '#c9a227')],
        [cloth(a, '#3b4a7a'), cloth(a, '#1c2233'), cloth(a, '#c9c0a0')],
        [cloth(a, '#4a5a3b'), cloth(a, '#22301f'), cloth(a, '#a8622f')],
      ];
      const colors = palettes[a.rng.int(0, palettes.length - 1)];
      weaveRug(a, w * 0.03, h * 0.1, w * 0.94, h * 0.8, colors);
    },
  },
  {
    id: 'int/rug-sheepskin', label: 'Sheepskin Rug', group: 'furniture', sub: 'Comfort',
    tags: ['comfort', 'rug', 'hide', 'floor'], aspect: 1.1, defaultWidth: 90, variants: 2,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const cx = w / 2, cy = h / 2;
      const base = a.variant % 2 === 0 ? cloth(a, '#e8ddc4') : cloth(a, '#9a8567');
      groundShadow(ctx, cx, cy + h * 0.05, w * 0.46, h * 0.42, 0.22);
      const pts = blob(cx, cy, w * 0.46, h * 0.44, 7, 0.24, rng);
      fillPath(ctx, pts, base);
      inkLine(ctx, pts, rgba(ink(a), 0.4), Math.max(1, Math.min(w, h) * 0.012), true);
      // Fur texture: a scatter of short pale tufts, denser near the edge.
      for (let i = 0; i < 120; i++) {
        const ang = rng.float(0, Math.PI * 2);
        const rr = Math.sqrt(rng.next()) * 0.94;
        const px = cx + Math.cos(ang) * w * 0.44 * rr;
        const py = cy + Math.sin(ang) * h * 0.42 * rr;
        ctx.strokeStyle = rgba(mix(base, '#ffffff', rng.float(0.1, 0.35)), 0.5);
        ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.006);
        const l = Math.min(w, h) * rng.float(0.02, 0.035);
        const tang = ang + rng.float(-0.3, 0.3);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(tang) * l, py + Math.sin(tang) * l);
        ctx.stroke();
      }
    },
  },
  {
    id: 'int/tapestry', label: 'Tapestry', group: 'furniture', sub: 'Comfort',
    tags: ['comfort', 'tapestry', 'wall', 'hanging'], aspect: 0.55, defaultWidth: 90, variants: 3,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const base = cloth(a, '#5a2f3f'), border = cloth(a, '#c9a227');
      outlined(a, () => roundRect(ctx, w * 0.1, h * 0.02, w * 0.8, h * 0.86, w * 0.04), base, 0.5, 0.014);
      ctx.strokeStyle = rgba(border, 0.85);
      ctx.lineWidth = Math.max(1, w * 0.03);
      roundRect(ctx, w * 0.16, h * 0.07, w * 0.68, h * 0.76, w * 0.03);
      ctx.stroke();
      const mode = a.variant % 3;
      const cx = w * 0.5, cy = h * 0.44;
      if (mode === 0) {
        const pts = star(cx, cy, w * 0.26, w * 0.11, 5);
        fillPath(ctx, pts, rgba(border, 0.85));
        inkLine(ctx, pts, rgba(ink(a), 0.4), Math.max(1, w * 0.012), true);
      } else if (mode === 1) {
        for (let i = 0; i < 4; i++) {
          const y = h * (0.16 + i * 0.16);
          ctx.strokeStyle = rgba(border, 0.75);
          ctx.lineWidth = Math.max(1, h * 0.02);
          ctx.beginPath(); ctx.moveTo(w * 0.22, y); ctx.lineTo(w * 0.78, y); ctx.stroke();
        }
      } else {
        // A stylised tree — a trunk with a canopy of small blobs.
        ctx.strokeStyle = rgba(border, 0.8); ctx.lineWidth = Math.max(1, w * 0.025);
        ctx.beginPath(); ctx.moveTo(cx, h * 0.7); ctx.lineTo(cx, h * 0.42); ctx.stroke();
        for (let i = 0; i < 5; i++) {
          const ang = rng.float(0, Math.PI * 2);
          const pts = blob(cx + Math.cos(ang) * w * 0.14, h * 0.3 + Math.sin(ang) * h * 0.07,
            w * 0.1, h * 0.06, 5, 0.2, rng);
          fillPath(ctx, pts, rgba(border, 0.7));
        }
      }
      // Fringe along the bottom.
      ctx.strokeStyle = rgba(border, 0.6); ctx.lineWidth = Math.max(1, w * 0.012);
      for (let i = 0; i < 9; i++) {
        const fx = w * 0.14 + i * (w * 0.72 / 8);
        ctx.beginPath(); ctx.moveTo(fx, h * 0.88); ctx.lineTo(fx, h * 0.96); ctx.stroke();
      }
    },
  },
  {
    id: 'int/curtain-drape', label: 'Curtain Drape', group: 'furniture', sub: 'Comfort',
    tags: ['comfort', 'curtain', 'window', 'wall'], aspect: 0.6, defaultWidth: 80, variants: 2,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h } = a;
      const base = cloth(a, '#5a3b6b');
      const open = a.variant % 2 === 0;
      const folds = 7;
      const spanX = open ? [w * 0.06, w * 0.42] : [w * 0.08, w * 0.92];
      const fw = (spanX[1] - spanX[0]) / folds;
      for (let i = 0; i < folds; i++) {
        const x = spanX[0] + i * fw;
        ctx.fillStyle = lightGradient(ctx, x, 0, x + fw, 0, base, i % 2 === 0 ? 0.22 : -0.1, i % 2 === 0 ? 0.1 : 0.32);
        roundRect(ctx, x, h * 0.03, fw * 1.05, h * 0.9, fw * 0.3);
        ctx.fill();
      }
      ctx.strokeStyle = rgba(ink(a), 0.4); ctx.lineWidth = Math.max(1, w * 0.012);
      roundRect(ctx, spanX[0], h * 0.03, spanX[1] - spanX[0], h * 0.9, fw * 0.3);
      ctx.stroke();
      if (open) {
        // A tieback cinching the drawn curtain.
        ctx.strokeStyle = rgba('#c9a227', 0.85); ctx.lineWidth = Math.max(1, w * 0.03);
        ctx.beginPath(); ctx.moveTo(spanX[0], h * 0.5); ctx.lineTo(spanX[1] + w * 0.02, h * 0.46); ctx.stroke();
      }
    },
  },
  {
    id: 'int/wall-sconce', label: 'Wall Sconce', group: 'furniture', sub: 'Comfort',
    tags: ['comfort', 'sconce', 'light', 'wall'], aspect: 1, defaultWidth: 30, variants: 2,
    kinds: ['dungeon', 'city', 'battle'],
    draw(a) {
      const { ctx, w, h } = a;
      const twin = a.variant % 2 === 1;
      outlined(a, () => roundRect(ctx, w * 0.36, h * 0.62, w * 0.28, h * 0.3, w * 0.06), brass(a), 0.6, 0.02);
      if (twin) {
        candleFlame(a, w * 0.32, h * 0.4, w * 0.06);
        candleFlame(a, w * 0.68, h * 0.4, w * 0.06);
      } else {
        candleFlame(a, w * 0.5, h * 0.36, w * 0.08);
      }
    },
  },
  {
    id: 'int/floor-candelabra', label: 'Floor Candelabra', group: 'furniture', sub: 'Comfort',
    tags: ['comfort', 'candle', 'light', 'stand'], aspect: 0.6, defaultWidth: 40, variants: 2,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h } = a;
      const cx = w / 2, cy = h * 0.7;
      groundShadow(ctx, cx, cy + h * 0.06, w * 0.3, h * 0.14, 0.26);
      outlined(a, () => { ctx.beginPath(); ctx.ellipse(cx, cy, w * 0.26, h * 0.1, 0, 0, Math.PI * 2); }, brass(a), 0.6, 0.02);
      if (a.variant % 2 === 0) {
        ctx.strokeStyle = brass(a); ctx.lineWidth = Math.max(1, w * 0.05);
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, h * 0.16); ctx.stroke();
        candleFlame(a, cx, h * 0.12, w * 0.06);
      } else {
        for (const s of [-1, 0, 1]) {
          const bx = cx + s * w * 0.16;
          ctx.strokeStyle = brass(a); ctx.lineWidth = Math.max(1, w * 0.035);
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(bx, h * (s === 0 ? 0.1 : 0.24)); ctx.stroke();
          candleFlame(a, bx, h * (s === 0 ? 0.06 : 0.2), w * 0.045);
        }
      }
    },
  },
  {
    id: 'int/hanging-lantern', label: 'Hanging Lantern', group: 'furniture', sub: 'Comfort',
    tags: ['comfort', 'lantern', 'light', 'ceiling'], aspect: 1, defaultWidth: 36, variants: 2,
    kinds: ['dungeon', 'city', 'battle'],
    draw(a) {
      const { ctx, w, h } = a;
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.32;
      radialGlow(ctx, cx, cy, r * 3, '#ffb15c', 0.5);
      if (a.variant % 2 === 0) {
        outlined(a, () => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); }, ironLight, 0.6, 0.02);
      } else {
        const pts = regularPolygon(cx, cy, r, 6);
        fillPath(ctx, pts, ironLight);
        inkLine(ctx, pts, rgba(ink(a), 0.6), Math.max(1, r * 0.06), true);
      }
      ctx.fillStyle = '#ffd06a';
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgba(iron, 0.7); ctx.lineWidth = Math.max(1, r * 0.12);
      ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, 0); ctx.stroke();
    },
  },
  {
    id: 'int/potted-plant', label: 'Potted Plant', group: 'furniture', sub: 'Comfort',
    tags: ['comfort', 'plant', 'decor'], aspect: 1, defaultWidth: 50, variants: 3,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const cx = w / 2, cy = h * 0.64, pr = Math.min(w, h) * 0.24;
      groundShadow(ctx, cx, cy + pr * 0.4, pr * 1.3, pr * 0.9, 0.3);
      outlined(a, () => { ctx.beginPath(); ctx.arc(cx, cy, pr, 0, Math.PI * 2); },
        lightGradient(ctx, cx - pr, cy - pr, cx + pr, cy + pr, mix(stoneC(a), '#8a5a3a', 0.3), 0.26, 0.3));
      const mode = a.variant % 3;
      const green = mix(a.palette.forest, '#7fa04a', 0.3);
      if (mode === 0) {
        for (let i = 0; i < 6; i++) {
          const ang = rng.float(0, Math.PI * 2);
          const pts = blob(cx + Math.cos(ang) * pr * 0.6, cy - pr * 0.2 + Math.sin(ang) * pr * 0.5,
            pr * 0.5, pr * 0.32, 5, 0.22, rng);
          fillPath(ctx, pts, green);
          inkLine(ctx, pts, rgba(ink(a), 0.35), 1, true);
        }
      } else if (mode === 1) {
        ctx.strokeStyle = green; ctx.lineWidth = Math.max(1, pr * 0.16); ctx.lineCap = 'round';
        for (let i = 0; i < 4; i++) {
          const ang = -Math.PI / 2 + rng.float(-0.5, 0.5);
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.quadraticCurveTo(cx + Math.cos(ang) * pr * 0.6, cy + Math.sin(ang) * pr * 1.4,
            cx + Math.cos(ang) * pr * 0.9, cy + Math.sin(ang) * pr * 2.1);
          ctx.stroke();
        }
      } else {
        for (let i = 0; i < 5; i++) {
          const ang = rng.float(0, Math.PI * 2);
          const px = cx + Math.cos(ang) * pr * 0.65, py = cy - pr * 0.1 + Math.sin(ang) * pr * 0.5;
          const pts = blob(px, py, pr * 0.4, pr * 0.28, 5, 0.2, rng);
          fillPath(ctx, pts, green);
          ctx.fillStyle = rng.pick(['#c9527a', '#e0b04a', '#e0e0e0']);
          ctx.beginPath(); ctx.arc(px, py, pr * 0.12, 0, Math.PI * 2); ctx.fill();
        }
      }
    },
  },
  {
    id: 'int/wall-mirror', label: 'Wall Mirror', group: 'furniture', sub: 'Comfort',
    tags: ['comfort', 'mirror', 'wall', 'decor'], aspect: 0.6, defaultWidth: 50, variants: 2,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h } = a;
      const cx = w / 2, cy = h / 2;
      if (a.variant % 2 === 0) {
        outlined(a, () => { ctx.beginPath(); ctx.ellipse(cx, cy, w * 0.32, h * 0.42, 0, 0, Math.PI * 2); }, brass(a));
        ctx.fillStyle = rgba('#dfe9f2', 0.6);
        ctx.beginPath(); ctx.ellipse(cx, cy, w * 0.24, h * 0.34, 0, 0, Math.PI * 2); ctx.fill();
      } else {
        outlined(a, () => roundRect(ctx, w * 0.1, h * 0.06, w * 0.8, h * 0.88, w * 0.06), wood(a));
        ctx.fillStyle = rgba('#dfe9f2', 0.6);
        roundRect(ctx, w * 0.18, h * 0.14, w * 0.64, h * 0.72, w * 0.03);
        ctx.fill();
      }
      ctx.strokeStyle = rgba('#ffffff', 0.4); ctx.lineWidth = Math.max(1, w * 0.02);
      ctx.beginPath(); ctx.moveTo(w * 0.36, h * 0.3); ctx.lineTo(w * 0.42, h * 0.7); ctx.stroke();
    },
  },
  {
    id: 'int/wall-shelf', label: 'Wall Shelf', group: 'furniture', sub: 'Comfort',
    tags: ['comfort', 'shelf', 'wall', 'decor'], aspect: 2.4, defaultWidth: 90, variants: 2,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const books = a.variant % 2 === 0;
      railShelf(a, w * 0.04, h * 0.28, w * 0.92, h * 0.44, 1, (rx, ry, rw, rh) => {
        const n = 7;
        for (let i = 0; i < n; i++) {
          const iw = rw / n;
          const ix = rx + iw * i + iw * 0.12;
          if (books) {
            ctx.fillStyle = rng.pick(['#7a3b3b', '#3b5a7a', '#3f6b45', '#7a6a3b']);
            roundRect(ctx, ix, ry + rh * 0.08, iw * 0.7, rh * 0.86, iw * 0.1);
            ctx.fill();
          } else {
            ctx.fillStyle = rng.pick(['#8a6a4a', '#6a7a8a', '#c9a83a']);
            ctx.beginPath(); ctx.arc(ix + iw * 0.3, ry + rh * 0.6, rh * 0.3, 0, Math.PI * 2); ctx.fill();
          }
        }
      });
    },
  },
  {
    id: 'int/coat-rack', label: 'Coat Rack', group: 'furniture', sub: 'Comfort',
    tags: ['comfort', 'coat', 'rack', 'stand'], aspect: 0.6, defaultWidth: 36, variants: 2,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h } = a;
      const cx = w / 2;
      groundShadow(ctx, cx, h * 0.9, w * 0.28, h * 0.08, 0.24);
      ctx.strokeStyle = wood(a); ctx.lineWidth = Math.max(1, w * 0.06);
      ctx.beginPath(); ctx.moveTo(cx, h * 0.9); ctx.lineTo(cx, h * 0.1); ctx.stroke();
      const items = a.variant % 2 === 0 ? 1 : 3;
      const colors = ['#5a3b6b', '#8a3b3b', '#3b5a7a'];
      for (let i = 0; i < items; i++) {
        const ang = -Math.PI / 2 + (i - (items - 1) / 2) * 0.7;
        const px = cx + Math.cos(ang) * w * 0.3, py = h * 0.22 + Math.sin(ang) * h * 0.1;
        bundle(a, px, py, w * 0.16, cloth(a, colors[i % colors.length]));
      }
      ctx.fillStyle = wood(a);
      ctx.beginPath(); ctx.arc(cx, h * 0.1, w * 0.05, 0, Math.PI * 2); ctx.fill();
    },
  },
  {
    id: 'int/standing-screen', label: 'Standing Screen', group: 'furniture', sub: 'Comfort',
    tags: ['comfort', 'screen', 'wall', 'decor'], aspect: 1.8, defaultWidth: 100, variants: 2,
    kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h } = a;
      groundShadow(ctx, w * 0.5, h * 0.58, w * 0.46, h * 0.24, 0.26);
      const slatted = a.variant % 2 === 0;
      outlined(a, () => roundRect(ctx, w * 0.04, h * 0.18, w * 0.92, h * 0.64, w * 0.04),
        lightGradient(ctx, 0, 0, w, h, wood(a), 0.2, 0.26));
      if (slatted) {
        ctx.strokeStyle = rgba(woodDark, 0.5); ctx.lineWidth = Math.max(1, w * 0.01);
        for (let i = 1; i < 9; i++) {
          const x = w * 0.04 + (w * 0.92 * i) / 9;
          ctx.beginPath(); ctx.moveTo(x, h * 0.18); ctx.lineTo(x, h * 0.82); ctx.stroke();
        }
      } else {
        const panels = 3;
        for (let i = 0; i < panels; i++) {
          const cx = w * 0.04 + (w * 0.92 * (i + 0.5)) / panels;
          const pts = star(cx, h * 0.5, w * 0.06, w * 0.025, 6);
          fillPath(ctx, pts, rgba(a.palette.accent, 0.7));
        }
      }
    },
  },
];
