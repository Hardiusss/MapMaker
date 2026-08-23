/**
 * The decoration and annotation layer: heraldry for faction shields and
 * banners, ornate cartouches and frames for dressing a finished map, extra
 * cartographic furniture (compass roses, scales, portolan marks), and the
 * tactical counters a GM drops on a battle or dungeon map mid-session.
 *
 * Two local helpers keep the shield family consistent: `escutcheon` traces
 * one of a few classic outlines, and `charge` stamps a bold heraldic device
 * inside it. Everything else composes from the shared draw.ts primitives the
 * rest of the library already uses.
 */
import type { AssetDef, AssetDrawArgs } from '../types';
import {
  blob, fillPath, groundShadow, inkLine, lightGradient,
  regularPolygon, roundRect, speckle, star, tracePath,
} from '../draw';
import { mix, rgba, readableInk } from '../../core/color';
import type { MapPalette } from '../../core/color';
import type { Vec2 } from '../../core/types';

const ink = (a: AssetDrawArgs) => a.palette.ink;

/** The faction colour: the requested tint when present, else the palette's own accent. */
function primaryTincture(a: AssetDrawArgs): string {
  return a.tint || a.palette.accent;
}

/** A metal-like tone (argent/or) that reads against the primary tincture. */
function metalTincture(a: AssetDrawArgs): string {
  return mix(a.palette.parchment, '#ffffff', 0.4);
}

// ---------------------------------------------------------------------------
// Shared shield family
// ---------------------------------------------------------------------------

type ShieldShape = 'heater' | 'round' | 'french';

/**
 * Trace a shield outline into the current path — flat top, tapering to a
 * point. The caller fills, strokes, or clips it; escutcheon never touches
 * fillStyle/strokeStyle so field colours stay entirely up to the asset.
 */
function escutcheon(ctx: CanvasRenderingContext2D, w: number, h: number, shape: ShieldShape): void {
  const left = w * 0.1, right = w * 0.9, top = h * 0.08, mid = w * 0.5;
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(right, top);
  if (shape === 'round') {
    ctx.lineTo(right, h * 0.46);
    ctx.quadraticCurveTo(right, h * 0.86, mid, h * 0.94);
    ctx.quadraticCurveTo(left, h * 0.86, left, h * 0.46);
  } else if (shape === 'french') {
    ctx.lineTo(right, h * 0.42);
    ctx.quadraticCurveTo(right, h * 0.7, w * 0.78, h * 0.8);
    ctx.quadraticCurveTo(mid, h * 1.0, w * 0.22, h * 0.8);
    ctx.quadraticCurveTo(left, h * 0.7, left, h * 0.42);
  } else {
    ctx.lineTo(right, h * 0.4);
    ctx.quadraticCurveTo(right, h * 0.64, w * 0.62, h * 0.8);
    ctx.quadraticCurveTo(mid, h * 0.98, w * 0.38, h * 0.8);
    ctx.quadraticCurveTo(left, h * 0.64, left, h * 0.4);
  }
  ctx.closePath();
}

type ChargeKind =
  | 'lion' | 'eagle' | 'tower' | 'crown' | 'sword-shield'
  | 'wolf-head' | 'tree' | 'star' | 'rose' | 'dragon';

const CHARGE_KINDS: ChargeKind[] = [
  'lion', 'eagle', 'tower', 'crown', 'sword-shield',
  'wolf-head', 'tree', 'star', 'rose', 'dragon',
];

/** A bold heraldic charge silhouette, centred at (cx, cy), sized by r. Legible down to ~40px. */
function charge(a: AssetDrawArgs, which: ChargeKind, cx: number, cy: number, r: number, color: string): void {
  const { ctx, rng } = a;
  const line = rgba(ink(a), 0.85);
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = line;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (which) {
    case 'lion': {
      ctx.lineWidth = Math.max(1, r * 0.1);
      for (const dx of [-0.28, 0.1]) {
        ctx.beginPath();
        ctx.moveTo(cx + r * dx, cy + r * 0.5);
        ctx.lineTo(cx + r * (dx - 0.04), cy + r * 0.92);
        ctx.stroke();
      }
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-0.18);
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.34, r * 0.52, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.restore();
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.3, cy + r * 0.3);
      ctx.quadraticCurveTo(cx - r * 0.7, cy - r * 0.1, cx - r * 0.5, cy - r * 0.55);
      ctx.quadraticCurveTo(cx - r * 0.36, cy - r * 0.8, cx - r * 0.15, cy - r * 0.7);
      ctx.stroke();
      const hx = cx + r * 0.16, hy = cy - r * 0.58;
      ctx.beginPath(); ctx.arc(hx, hy, r * 0.26, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(hx + Math.cos(ang) * r * 0.24, hy + Math.sin(ang) * r * 0.24);
        ctx.lineTo(hx + Math.cos(ang) * r * 0.42, hy + Math.sin(ang) * r * 0.42);
        ctx.stroke();
      }
      ctx.lineWidth = Math.max(1, r * 0.11);
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.2, cy + r * 0.05);
      ctx.quadraticCurveTo(cx + r * 0.5, cy - r * 0.1, cx + r * 0.58, cy - r * 0.42);
      ctx.stroke();
      break;
    }
    case 'eagle': {
      for (const side of [-1, 1] as const) {
        ctx.beginPath();
        ctx.moveTo(cx, cy - r * 0.1);
        ctx.quadraticCurveTo(cx + side * r * 0.55, cy - r * 0.7, cx + side * r * 0.95, cy - r * 0.5);
        ctx.quadraticCurveTo(cx + side * r * 0.7, cy - r * 0.1, cx + side * r * 0.3, cy + r * 0.05);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.lineWidth = Math.max(1, r * 0.05);
        for (let i = 1; i <= 3; i++) {
          const t = i / 4;
          ctx.beginPath();
          ctx.moveTo(cx + side * r * (0.3 * (1 - t) + 0.95 * t), cy - r * 0.5 * t - r * 0.1 * (1 - t));
          ctx.lineTo(cx + side * r * (0.3 * (1 - t) + 0.6 * t), cy + r * 0.15);
          ctx.stroke();
        }
      }
      ctx.lineWidth = Math.max(1, r * 0.1);
      ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.1, r * 0.2, r * 0.34, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy - r * 0.32, r * 0.18, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.02, cy - r * 0.4);
      ctx.lineTo(cx - r * 0.22, cy - r * 0.32);
      ctx.lineTo(cx - r * 0.02, cy - r * 0.24);
      ctx.closePath(); ctx.fill();
      for (const dx of [-0.1, 0.1]) {
        ctx.beginPath();
        ctx.moveTo(cx + r * dx, cy + r * 0.4);
        ctx.lineTo(cx + r * dx, cy + r * 0.66);
        ctx.stroke();
        for (const ta of [-0.12, 0, 0.12]) {
          ctx.beginPath();
          ctx.moveTo(cx + r * dx, cy + r * 0.66);
          ctx.lineTo(cx + r * (dx + ta), cy + r * 0.78);
          ctx.stroke();
        }
      }
      break;
    }
    case 'tower': {
      ctx.lineWidth = Math.max(1, r * 0.09);
      ctx.beginPath();
      ctx.rect(cx - r * 0.34, cy - r * 0.2, r * 0.68, r * 0.9);
      ctx.fill(); ctx.stroke();
      const m = 3;
      for (let i = 0; i < m; i++) {
        const mx = cx - r * 0.34 + (i + 0.5) * ((r * 0.68) / m);
        ctx.beginPath();
        ctx.rect(mx - r * 0.1, cy - r * 0.42, r * 0.2, r * 0.24);
        ctx.fill(); ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.12, cy + r * 0.7);
      ctx.lineTo(cx - r * 0.12, cy + r * 0.36);
      ctx.arc(cx, cy + r * 0.36, r * 0.12, Math.PI, 0);
      ctx.lineTo(cx + r * 0.12, cy + r * 0.7);
      ctx.closePath();
      ctx.fillStyle = rgba(ink(a), 0.7);
      ctx.fill();
      break;
    }
    case 'crown': {
      ctx.lineWidth = Math.max(1, r * 0.09);
      ctx.beginPath();
      ctx.rect(cx - r * 0.5, cy + r * 0.1, r, r * 0.32);
      ctx.fill(); ctx.stroke();
      const spikes = 5;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.5, cy + r * 0.1);
      for (let i = 0; i < spikes; i++) {
        const x1 = cx - r * 0.5 + ((i + 0.5) / spikes) * r;
        const x2 = cx - r * 0.5 + ((i + 1) / spikes) * r;
        ctx.lineTo(x1, cy - r * (i % 2 === 0 ? 0.56 : 0.4));
        ctx.lineTo(x2, cy + r * 0.1);
      }
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      for (let i = 0; i < spikes; i++) {
        const x1 = cx - r * 0.5 + ((i + 0.5) / spikes) * r;
        ctx.beginPath();
        ctx.arc(x1, cy - r * (i % 2 === 0 ? 0.56 : 0.4), r * 0.08, 0, Math.PI * 2);
        ctx.fillStyle = readableInk(color);
        ctx.fill();
        ctx.fillStyle = color;
      }
      break;
    }
    case 'sword-shield': {
      const sw = r * 0.68, sh = r * 0.88;
      ctx.save();
      ctx.translate(cx - r * 0.16 - sw / 2, cy + r * 0.08 - sh / 2);
      escutcheon(ctx, sw, sh, 'heater');
      ctx.fillStyle = mix(color, '#000000', 0.12);
      ctx.fill();
      ctx.lineWidth = Math.max(1, r * 0.05);
      ctx.strokeStyle = line;
      ctx.stroke();
      ctx.restore();
      ctx.lineWidth = Math.max(1, r * 0.12);
      ctx.strokeStyle = readableInk(color);
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.14, cy - r * 0.75);
      ctx.lineTo(cx + r * 0.14, cy + r * 0.55);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.14, cy - r * 0.4);
      ctx.lineTo(cx + r * 0.42, cy - r * 0.4);
      ctx.stroke();
      ctx.fillStyle = readableInk(color);
      ctx.beginPath(); ctx.arc(cx + r * 0.14, cy + r * 0.62, r * 0.08, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'wolf-head': {
      ctx.lineWidth = Math.max(1, r * 0.09);
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.5, cy - r * 0.1);
      ctx.quadraticCurveTo(cx - r * 0.5, cy - r * 0.55, cx - r * 0.05, cy - r * 0.55);
      ctx.quadraticCurveTo(cx + r * 0.4, cy - r * 0.5, cx + r * 0.62, cy - r * 0.06);
      ctx.lineTo(cx + r * 0.3, cy + r * 0.02);
      ctx.quadraticCurveTo(cx + r * 0.1, cy + r * 0.35, cx - r * 0.3, cy + r * 0.4);
      ctx.quadraticCurveTo(cx - r * 0.55, cy + r * 0.3, cx - r * 0.5, cy - r * 0.1);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      for (const s of [-1, 1] as const) {
        ctx.beginPath();
        ctx.moveTo(cx + s * r * 0.05, cy - r * 0.5);
        ctx.lineTo(cx + s * r * 0.28, cy - r * 0.9);
        ctx.lineTo(cx + s * r * 0.34, cy - r * 0.42);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
      }
      ctx.fillStyle = readableInk(color);
      ctx.beginPath(); ctx.arc(cx + r * 0.12, cy - r * 0.16, r * 0.06, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'tree': {
      ctx.fillStyle = mix(color, '#2c1c10', 0.4);
      ctx.fillRect(cx - r * 0.09, cy + r * 0.1, r * 0.18, r * 0.6);
      ctx.strokeStyle = line; ctx.lineWidth = Math.max(1, r * 0.05);
      ctx.strokeRect(cx - r * 0.09, cy + r * 0.1, r * 0.18, r * 0.6);
      const canopy = blob(cx, cy - r * 0.18, r * 0.55, r * 0.5, 6, 0.18, rng);
      fillPath(ctx, canopy, color);
      inkLine(ctx, canopy, line, Math.max(1, r * 0.06), true);
      break;
    }
    case 'star': {
      const pts = star(cx, cy, r * 0.85, r * 0.36, 6);
      fillPath(ctx, pts, color);
      inkLine(ctx, pts, line, Math.max(1, r * 0.08), true);
      break;
    }
    case 'rose': {
      const petals = 5;
      for (let i = 0; i < petals; i++) {
        const ang = (i / petals) * Math.PI * 2 - Math.PI / 2;
        const px = cx + Math.cos(ang) * r * 0.42;
        const py = cy + Math.sin(ang) * r * 0.42;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(ang + Math.PI / 2);
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.3, r * 0.42, 0, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.lineWidth = Math.max(1, r * 0.05);
        ctx.strokeStyle = line;
        ctx.stroke();
        ctx.restore();
      }
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = readableInk(color);
      ctx.fill();
      ctx.lineWidth = Math.max(1, r * 0.05);
      ctx.strokeStyle = line;
      ctx.stroke();
      break;
    }
    case 'dragon': {
      ctx.lineWidth = Math.max(2, r * 0.16);
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.5, cy + r * 0.5);
      ctx.quadraticCurveTo(cx - r * 0.5, cy - r * 0.1, cx - r * 0.05, cy - r * 0.05);
      ctx.quadraticCurveTo(cx + r * 0.35, cy, cx + r * 0.2, cy - r * 0.45);
      ctx.stroke();
      ctx.lineWidth = Math.max(1, r * 0.08);
      ctx.strokeStyle = line;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.1, cy - r * 0.1);
      ctx.quadraticCurveTo(cx - r * 0.05, cy - r * 0.65, cx + r * 0.4, cy - r * 0.55);
      ctx.quadraticCurveTo(cx + r * 0.15, cy - r * 0.35, cx + r * 0.1, cy - r * 0.05);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(cx + r * 0.28, cy - r * 0.5, r * 0.16, r * 0.12, -0.3, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.4, cy - r * 0.56);
      ctx.lineTo(cx + r * 0.56, cy - r * 0.62);
      ctx.lineTo(cx + r * 0.42, cy - r * 0.46);
      ctx.closePath(); ctx.fillStyle = readableInk(color); ctx.fill();
      break;
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Marker plates — a bright, ink-rimmed backing that keeps a small glyph
// legible over a dark battle map or a busy operational one.
// ---------------------------------------------------------------------------

function plateCircle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, palette: MapPalette, fill?: string): void {
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r * 1.12, 0, Math.PI * 2);
  ctx.fillStyle = rgba('#000000', 0.3);
  ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = fill ?? mix(palette.parchment, '#ffffff', 0.3);
  ctx.fill();
  ctx.strokeStyle = rgba(palette.ink, 0.85);
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.stroke();
  ctx.restore();
}

function plateDiamond(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, palette: MapPalette, fill: string): void {
  ctx.save();
  const halo = regularPolygon(cx, cy, r * 1.16, 4, Math.PI / 4);
  fillPath(ctx, halo, rgba('#000000', 0.3));
  const face = regularPolygon(cx, cy, r, 4, Math.PI / 4);
  fillPath(ctx, face, fill);
  inkLine(ctx, face, rgba(palette.ink, 0.85), Math.max(1, r * 0.12), true);
  ctx.restore();
}

export const HERALDRY_ASSETS: AssetDef[] = [
  // ------------------------------------------------------------ Heraldry
  {
    id: 'her/shield-per-pale', label: 'Per Pale Shield', group: 'symbols', sub: 'Heraldry',
    tags: ['shield', 'heraldry', 'field', 'faction'],
    aspect: 0.86, defaultWidth: 100, variants: 2, kinds: ['region', 'operational', 'city', 'hex'],
    draw(a) {
      const { ctx, w, h } = a;
      const primary = primaryTincture(a);
      const secondary = metalTincture(a);
      const shape: ShieldShape = a.variant % 2 === 0 ? 'heater' : 'french';
      ctx.save();
      escutcheon(ctx, w, h, shape);
      ctx.save();
      ctx.clip();
      ctx.fillStyle = secondary; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = primary; ctx.fillRect(w * 0.5, 0, w * 0.5, h);
      ctx.restore();
      escutcheon(ctx, w, h, shape);
      ctx.lineWidth = Math.max(1.5, w * 0.045);
      ctx.strokeStyle = rgba(ink(a), 0.85);
      ctx.stroke();
      ctx.restore();
    },
  },
  {
    id: 'her/shield-quartered', label: 'Quartered Shield', group: 'symbols', sub: 'Heraldry',
    tags: ['shield', 'heraldry', 'field', 'faction'],
    aspect: 0.86, defaultWidth: 100, variants: 2, kinds: ['region', 'operational', 'city', 'hex'],
    draw(a) {
      const { ctx, w, h } = a;
      const primary = primaryTincture(a);
      const secondary = metalTincture(a);
      const shape: ShieldShape = a.variant % 2 === 0 ? 'heater' : 'round';
      ctx.save();
      escutcheon(ctx, w, h, shape);
      ctx.save();
      ctx.clip();
      ctx.fillStyle = secondary; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = primary;
      ctx.fillRect(0, 0, w * 0.5, h * 0.5);
      ctx.fillRect(w * 0.5, h * 0.5, w * 0.5, h * 0.5);
      ctx.strokeStyle = rgba(ink(a), 0.4);
      ctx.lineWidth = Math.max(1, w * 0.012);
      ctx.beginPath();
      ctx.moveTo(w * 0.5, h * 0.06); ctx.lineTo(w * 0.5, h * 1);
      ctx.moveTo(w * 0.06, h * 0.5); ctx.lineTo(w * 0.94, h * 0.5);
      ctx.stroke();
      ctx.restore();
      escutcheon(ctx, w, h, shape);
      ctx.lineWidth = Math.max(1.5, w * 0.045);
      ctx.strokeStyle = rgba(ink(a), 0.85);
      ctx.stroke();
      ctx.restore();
    },
  },
  {
    id: 'her/shield-bend', label: 'Shield with a Bend', group: 'symbols', sub: 'Heraldry',
    tags: ['shield', 'heraldry', 'field', 'faction'],
    aspect: 0.86, defaultWidth: 100, variants: 2, kinds: ['region', 'operational', 'city', 'hex'],
    draw(a) {
      const { ctx, w, h } = a;
      const primary = primaryTincture(a);
      const secondary = metalTincture(a);
      const flip = a.variant % 2 === 1;
      ctx.save();
      escutcheon(ctx, w, h, 'heater');
      ctx.save();
      ctx.clip();
      ctx.fillStyle = primary; ctx.fillRect(0, 0, w, h);
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(flip ? Math.PI / 4 : -Math.PI / 4);
      ctx.fillStyle = secondary;
      ctx.fillRect(-w * 0.9, -h * 0.14, w * 1.8, h * 0.28);
      ctx.strokeStyle = rgba(ink(a), 0.6);
      ctx.lineWidth = Math.max(1, w * 0.015);
      ctx.strokeRect(-w * 0.9, -h * 0.14, w * 1.8, h * 0.28);
      ctx.restore();
      ctx.restore();
      escutcheon(ctx, w, h, 'heater');
      ctx.lineWidth = Math.max(1.5, w * 0.045);
      ctx.strokeStyle = rgba(ink(a), 0.85);
      ctx.stroke();
      ctx.restore();
    },
  },
  {
    id: 'her/shield-charges', label: 'Charged Shield', group: 'symbols', sub: 'Heraldry',
    tags: ['shield', 'heraldry', 'charge', 'faction'],
    aspect: 0.86, defaultWidth: 100, variants: 10, kinds: ['region', 'operational', 'city', 'hex'],
    draw(a) {
      const { ctx, w, h } = a;
      const primary = primaryTincture(a);
      const secondary = metalTincture(a);
      const which = CHARGE_KINDS[a.variant % CHARGE_KINDS.length];
      ctx.save();
      escutcheon(ctx, w, h, 'heater');
      ctx.fillStyle = primary; ctx.fill();
      ctx.save();
      ctx.clip();
      charge(a, which, w * 0.5, h * 0.52, Math.min(w, h) * 0.4, secondary);
      ctx.restore();
      escutcheon(ctx, w, h, 'heater');
      ctx.lineWidth = Math.max(1.5, w * 0.045);
      ctx.strokeStyle = rgba(ink(a), 0.85);
      ctx.stroke();
      ctx.restore();
    },
  },
  {
    id: 'her/shield-lion', label: 'Shield: Lion Rampant', group: 'symbols', sub: 'Heraldry',
    tags: ['shield', 'heraldry', 'lion', 'faction'],
    aspect: 0.86, defaultWidth: 100, variants: 2, kinds: ['region', 'operational', 'city', 'hex'],
    draw(a) {
      const { ctx, w, h } = a;
      const primary = primaryTincture(a);
      const secondary = metalTincture(a);
      const shape: ShieldShape = a.variant % 2 === 0 ? 'heater' : 'french';
      ctx.save();
      escutcheon(ctx, w, h, shape);
      ctx.save();
      ctx.clip();
      ctx.fillStyle = secondary; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = primary; ctx.fillRect(w * 0.5, 0, w * 0.5, h);
      charge(a, 'lion', w * 0.5, h * 0.54, Math.min(w, h) * 0.38, secondary);
      ctx.restore();
      escutcheon(ctx, w, h, shape);
      ctx.lineWidth = Math.max(1.5, w * 0.045);
      ctx.strokeStyle = rgba(ink(a), 0.85);
      ctx.stroke();
      ctx.restore();
    },
  },
  {
    id: 'her/shield-eagle', label: 'Shield: Eagle Displayed', group: 'symbols', sub: 'Heraldry',
    tags: ['shield', 'heraldry', 'eagle', 'faction'],
    aspect: 0.86, defaultWidth: 100, variants: 2, kinds: ['region', 'operational', 'city', 'hex'],
    draw(a) {
      const { ctx, w, h } = a;
      const primary = primaryTincture(a);
      const secondary = metalTincture(a);
      const shape: ShieldShape = a.variant % 2 === 0 ? 'heater' : 'round';
      ctx.save();
      escutcheon(ctx, w, h, shape);
      ctx.save();
      ctx.clip();
      ctx.fillStyle = secondary; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = primary;
      ctx.fillRect(0, 0, w * 0.5, h * 0.5);
      ctx.fillRect(w * 0.5, h * 0.5, w * 0.5, h * 0.5);
      charge(a, 'eagle', w * 0.5, h * 0.52, Math.min(w, h) * 0.36, secondary);
      ctx.restore();
      escutcheon(ctx, w, h, shape);
      ctx.lineWidth = Math.max(1.5, w * 0.045);
      ctx.strokeStyle = rgba(ink(a), 0.85);
      ctx.stroke();
      ctx.restore();
    },
  },
  {
    id: 'her/shield-dragon', label: 'Shield: Dragon', group: 'symbols', sub: 'Heraldry',
    tags: ['shield', 'heraldry', 'dragon', 'faction'],
    aspect: 0.86, defaultWidth: 100, variants: 2, kinds: ['region', 'operational', 'city', 'hex'],
    draw(a) {
      const { ctx, w, h } = a;
      const primary = primaryTincture(a);
      const secondary = metalTincture(a);
      const flip = a.variant % 2 === 1;
      ctx.save();
      escutcheon(ctx, w, h, 'heater');
      ctx.save();
      ctx.clip();
      ctx.fillStyle = primary; ctx.fillRect(0, 0, w, h);
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(flip ? Math.PI / 4 : -Math.PI / 4);
      ctx.fillStyle = secondary;
      ctx.fillRect(-w * 0.9, -h * 0.14, w * 1.8, h * 0.28);
      ctx.restore();
      charge(a, 'dragon', w * 0.5, h * 0.52, Math.min(w, h) * 0.38, secondary);
      ctx.restore();
      escutcheon(ctx, w, h, 'heater');
      ctx.lineWidth = Math.max(1.5, w * 0.045);
      ctx.strokeStyle = rgba(ink(a), 0.85);
      ctx.stroke();
      ctx.restore();
    },
  },
  {
    id: 'her/wall-banner', label: 'Hanging Wall Banner', group: 'symbols', sub: 'Heraldry',
    tags: ['banner', 'faction', 'hall'],
    aspect: 0.6, defaultWidth: 90, variants: 2, kinds: ['region', 'operational', 'city', 'hex'],
    draw(a) {
      const { ctx, w, h } = a;
      const primary = primaryTincture(a);
      const secondary = metalTincture(a);
      ctx.save();
      ctx.strokeStyle = '#4b3a24';
      ctx.lineWidth = Math.max(2, w * 0.06);
      ctx.beginPath(); ctx.moveTo(w * 0.04, h * 0.05); ctx.lineTo(w * 0.96, h * 0.05); ctx.stroke();
      for (const x of [w * 0.08, w * 0.92]) {
        ctx.beginPath(); ctx.arc(x, h * 0.05, w * 0.04, 0, Math.PI * 2);
        ctx.fillStyle = '#4b3a24'; ctx.fill();
      }
      const bodyTop = h * 0.1, bodyBot = h * 0.82;
      ctx.beginPath();
      ctx.moveTo(w * 0.12, bodyTop);
      ctx.lineTo(w * 0.88, bodyTop);
      ctx.quadraticCurveTo(w * 0.94, h * 0.4, w * 0.86, bodyBot);
      ctx.lineTo(w * 0.14, bodyBot);
      ctx.quadraticCurveTo(w * 0.06, h * 0.4, w * 0.12, bodyTop);
      ctx.closePath();
      ctx.fillStyle = primary; ctx.fill();
      ctx.lineWidth = Math.max(1.2, w * 0.03); ctx.strokeStyle = rgba(ink(a), 0.85); ctx.stroke();
      ctx.strokeStyle = secondary; ctx.lineWidth = Math.max(1, w * 0.02);
      const n = 8;
      for (let i = 0; i < n; i++) {
        const x = w * (0.14 + (i / (n - 1)) * 0.72);
        ctx.beginPath(); ctx.moveTo(x, bodyBot); ctx.lineTo(x, bodyBot + h * 0.06); ctx.stroke();
      }
      const kinds: ChargeKind[] = ['star', 'rose'];
      charge(a, kinds[a.variant % kinds.length], w * 0.5, h * 0.44, Math.min(w, h) * 0.22, secondary);
      ctx.restore();
    },
  },
  {
    id: 'her/war-banner', label: 'War Banner', group: 'symbols', sub: 'Heraldry',
    tags: ['banner', 'pole', 'faction', 'war'],
    aspect: 0.55, defaultWidth: 70, variants: 2, kinds: ['region', 'operational', 'city', 'hex'],
    draw(a) {
      const { ctx, w, h } = a;
      const primary = primaryTincture(a);
      const secondary = metalTincture(a);
      ctx.save();
      ctx.strokeStyle = '#4b3a24'; ctx.lineWidth = Math.max(2, w * 0.07); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(w * 0.18, h * 0.98); ctx.lineTo(w * 0.18, h * 0.04); ctx.stroke();
      ctx.beginPath(); ctx.arc(w * 0.18, h * 0.04, w * 0.06, 0, Math.PI * 2);
      ctx.fillStyle = '#4b3a24'; ctx.fill();
      const top = h * 0.1, bot = h * 0.5;
      ctx.beginPath();
      ctx.moveTo(w * 0.22, top);
      ctx.lineTo(w * 0.92, top + h * 0.02);
      ctx.lineTo(w * 0.78, (top + bot) / 2);
      ctx.lineTo(w * 0.92, bot - h * 0.02);
      ctx.lineTo(w * 0.22, bot);
      ctx.closePath();
      ctx.fillStyle = primary; ctx.fill();
      ctx.lineWidth = Math.max(1.2, w * 0.03); ctx.strokeStyle = rgba(ink(a), 0.85); ctx.stroke();
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(w * 0.22, top); ctx.lineTo(w * 0.68, top + h * 0.02);
      ctx.lineTo(w * 0.68, bot - h * 0.02); ctx.lineTo(w * 0.22, bot);
      ctx.closePath();
      ctx.clip();
      const kinds: ChargeKind[] = ['star', 'rose'];
      charge(a, kinds[a.variant % kinds.length], w * 0.42, (top + bot) / 2, Math.min(w, h) * 0.16, secondary);
      ctx.restore();
      ctx.restore();
    },
  },
  {
    id: 'her/pennant', label: 'Pennant', group: 'symbols', sub: 'Heraldry',
    tags: ['pennant', 'flag', 'faction'],
    aspect: 1.4, defaultWidth: 70, variants: 2, kinds: ['region', 'operational', 'city', 'hex'],
    draw(a) {
      const { ctx, w, h } = a;
      const primary = primaryTincture(a);
      ctx.save();
      ctx.strokeStyle = rgba(ink(a), 0.85); ctx.lineWidth = Math.max(1.5, w * 0.03); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(w * 0.06, h * 0.92); ctx.lineTo(w * 0.06, h * 0.08); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(w * 0.06, h * 0.12);
      ctx.lineTo(w * 0.94, h * 0.32);
      ctx.lineTo(w * 0.06, h * 0.5);
      ctx.closePath();
      ctx.fillStyle = primary; ctx.fill();
      ctx.lineWidth = Math.max(1, w * 0.02); ctx.stroke();
      if (a.variant % 2 === 1) fillPath(ctx, star(w * 0.35, h * 0.31, w * 0.08, w * 0.03, 5), metalTincture(a));
      ctx.restore();
    },
  },
  {
    id: 'her/standard', label: 'Standard', group: 'symbols', sub: 'Heraldry',
    tags: ['standard', 'vexillum', 'pole', 'faction'],
    aspect: 0.5, defaultWidth: 70, variants: 2, kinds: ['region', 'operational', 'city', 'hex'],
    draw(a) {
      const { ctx, w, h } = a;
      const primary = primaryTincture(a);
      const secondary = metalTincture(a);
      ctx.save();
      ctx.strokeStyle = '#4b3a24'; ctx.lineWidth = Math.max(2, w * 0.08); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(w * 0.5, h * 0.98); ctx.lineTo(w * 0.5, h * 0.14); ctx.stroke();
      ctx.fillStyle = secondary;
      ctx.beginPath(); ctx.arc(w * 0.5, h * 0.08, w * 0.09, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.7); ctx.lineWidth = Math.max(1, w * 0.02); ctx.stroke();
      ctx.strokeStyle = '#4b3a24'; ctx.lineWidth = Math.max(1.5, w * 0.05);
      ctx.beginPath(); ctx.moveTo(w * 0.16, h * 0.2); ctx.lineTo(w * 0.84, h * 0.2); ctx.stroke();
      ctx.fillStyle = primary;
      ctx.fillRect(w * 0.16, h * 0.2, w * 0.68, h * 0.5);
      ctx.strokeStyle = rgba(ink(a), 0.85); ctx.lineWidth = Math.max(1, w * 0.02);
      ctx.strokeRect(w * 0.16, h * 0.2, w * 0.68, h * 0.5);
      ctx.strokeStyle = secondary; ctx.lineWidth = Math.max(1, w * 0.015);
      for (let i = 0; i < 7; i++) {
        const x = w * (0.16 + (i / 6) * 0.68);
        ctx.beginPath(); ctx.moveTo(x, h * 0.7); ctx.lineTo(x, h * 0.76); ctx.stroke();
      }
      ctx.save();
      ctx.beginPath(); ctx.rect(w * 0.16, h * 0.2, w * 0.68, h * 0.5); ctx.clip();
      const kinds: ChargeKind[] = ['crown', 'tower'];
      charge(a, kinds[a.variant % kinds.length], w * 0.5, h * 0.45, Math.min(w, h) * 0.18, secondary);
      ctx.restore();
      ctx.restore();
    },
  },
  {
    id: 'her/roundel', label: 'Heraldic Roundel', group: 'symbols', sub: 'Heraldry',
    tags: ['roundel', 'disc', 'heraldry'],
    aspect: 1, defaultWidth: 60, variants: 3, kinds: ['region', 'operational', 'city', 'hex'],
    draw(a) {
      const { ctx, w, h } = a;
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.4;
      const c = primaryTincture(a);
      ctx.save();
      ctx.fillStyle = lightGradient(ctx, cx - R, cy - R, cx + R, cy + R, c, 0.28, 0.3);
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.85); ctx.lineWidth = Math.max(1.2, R * 0.1); ctx.stroke();
      if (a.variant === 1) {
        ctx.strokeStyle = rgba(metalTincture(a), 0.9); ctx.lineWidth = Math.max(1, R * 0.06);
        for (let i = 0; i < 12; i++) {
          const ang = (i / 12) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(ang) * R * 0.3, cy + Math.sin(ang) * R * 0.3);
          ctx.lineTo(cx + Math.cos(ang) * R * 0.85, cy + Math.sin(ang) * R * 0.85);
          ctx.stroke();
        }
      } else if (a.variant === 2) {
        ctx.strokeStyle = rgba('#000000', 0.2); ctx.lineWidth = Math.max(1, R * 0.04);
        for (let i = 0; i < 8; i++) {
          const ang = (i / 8) * Math.PI * 2;
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R); ctx.stroke();
        }
      }
      ctx.restore();
    },
  },
  {
    id: 'her/crest-mantling', label: "Knight's Crest", group: 'symbols', sub: 'Heraldry',
    tags: ['crest', 'mantling', 'helm', 'heraldry'],
    aspect: 1.3, defaultWidth: 140, variants: 2, kinds: ['region', 'operational', 'city', 'hex'],
    draw(a) {
      const { ctx, w, h } = a;
      const primary = primaryTincture(a);
      const secondary = metalTincture(a);
      const c = ink(a);
      ctx.save();
      for (const side of [-1, 1] as const) {
        ctx.beginPath();
        ctx.moveTo(w * 0.5, h * 0.42);
        ctx.quadraticCurveTo(w * 0.5 + side * w * 0.4, h * 0.5, w * 0.5 + side * w * 0.32, h * 0.9);
        ctx.quadraticCurveTo(w * 0.5 + side * w * 0.18, h * 0.7, w * 0.5 + side * w * 0.12, h * 0.5);
        ctx.closePath();
        ctx.fillStyle = primary; ctx.fill();
        ctx.lineWidth = Math.max(1, w * 0.012); ctx.strokeStyle = rgba(c, 0.8); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(w * 0.5, h * 0.44);
        ctx.quadraticCurveTo(w * 0.5 + side * w * 0.3, h * 0.55, w * 0.5 + side * w * 0.24, h * 0.82);
        ctx.strokeStyle = rgba(secondary, 0.9); ctx.lineWidth = Math.max(1, w * 0.015); ctx.stroke();
      }
      ctx.save();
      ctx.translate(w * 0.5, h * 0.4);
      for (let i = 0; i < 8; i++) {
        const t = i / 8;
        ctx.beginPath();
        ctx.ellipse(-w * 0.18 + t * w * 0.36, 0, w * 0.05, h * 0.045, 0, 0, Math.PI * 2);
        ctx.fillStyle = i % 2 === 0 ? primary : secondary;
        ctx.fill();
        ctx.strokeStyle = rgba(c, 0.6); ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = lightGradient(ctx, w * 0.38, h * 0.16, w * 0.62, h * 0.4, '#8a8a8a', 0.3, 0.3);
      roundRect(ctx, w * 0.38, h * 0.14, w * 0.24, h * 0.26, w * 0.05);
      ctx.fill(); ctx.strokeStyle = rgba(c, 0.8); ctx.lineWidth = Math.max(1, w * 0.015); ctx.stroke();
      const kinds: ChargeKind[] = ['wolf-head', 'star'];
      charge(a, kinds[a.variant % kinds.length], w * 0.5, h * 0.08, Math.min(w, h) * 0.14, primary);
      ctx.restore();
    },
  },

  // ------------------------------------------------------ Cartouches & frames
  {
    id: 'her/cartouche-grand', label: 'Grand Cartouche', group: 'symbols', sub: 'Cartouches & frames',
    tags: ['title', 'frame', 'ornate'],
    aspect: 2.2, defaultWidth: 460, variants: 2, kinds: ['region', 'operational', 'city', 'hex'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const c = ink(a);
      const paper = mix(a.palette.parchment, '#ffffff', 0.3);
      ctx.save();
      roundRect(ctx, w * 0.04, h * 0.1, w * 0.92, h * 0.8, h * 0.14);
      ctx.fillStyle = mix(paper, '#000000', 0.05); ctx.fill();
      ctx.strokeStyle = rgba(c, 0.85); ctx.lineWidth = Math.max(2, h * 0.028); ctx.stroke();
      roundRect(ctx, w * 0.07, h * 0.16, w * 0.86, h * 0.68, h * 0.1);
      ctx.fillStyle = paper; ctx.fill();
      ctx.strokeStyle = rgba(c, 0.6); ctx.lineWidth = Math.max(1, h * 0.014); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(w * 0.32, h * 0.12);
      ctx.quadraticCurveTo(w * 0.5, h * 0.0, w * 0.68, h * 0.12);
      ctx.quadraticCurveTo(w * 0.5, h * 0.06, w * 0.32, h * 0.12);
      ctx.closePath();
      ctx.fillStyle = paper; ctx.fill();
      ctx.strokeStyle = rgba(c, 0.8); ctx.lineWidth = Math.max(1, h * 0.02); ctx.stroke();
      fillPath(ctx, star(w * 0.5, h * 0.05, h * 0.06, h * 0.025, 6), a.palette.accent);
      for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
        ctx.save();
        ctx.translate(w * 0.5 + sx * w * 0.42, h * 0.5 + sy * h * 0.36);
        ctx.scale(sx, sy);
        ctx.strokeStyle = rgba(c, 0.75); ctx.lineWidth = Math.max(1, h * 0.016);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(w * 0.06, h * 0.02, w * 0.05, -h * 0.08);
        ctx.stroke();
        fillPath(ctx, blob(w * 0.02, -h * 0.06, w * 0.025, h * 0.03, 3, 0.2, rng), mix(paper, '#000000', 0.1));
        ctx.restore();
      }
      const curl = a.variant === 1 ? 1.3 : 1;
      for (const side of [-1, 1] as const) {
        const x = side < 0 ? w * 0.04 : w * 0.96;
        ctx.beginPath();
        ctx.ellipse(x, h * 0.5, w * 0.04 * curl, h * 0.38, 0, 0, Math.PI * 2);
        ctx.fillStyle = mix(paper, '#000000', 0.14); ctx.fill();
        ctx.strokeStyle = rgba(c, 0.8); ctx.lineWidth = Math.max(1.5, h * 0.02); ctx.stroke();
      }
      ctx.restore();
    },
  },
  {
    id: 'her/rope-frame', label: 'Rope Border', group: 'symbols', sub: 'Cartouches & frames',
    tags: ['frame', 'rope', 'border'],
    aspect: 1.4, defaultWidth: 400, variants: 2, kinds: ['region', 'operational', 'city', 'hex'],
    draw(a) {
      const { ctx, w, h } = a;
      const c = ink(a);
      const rope = a.variant === 0 ? mix('#c8a35a', a.palette.parchment, 0.15) : mix(a.palette.rock, '#c8a35a', 0.3);
      ctx.save();
      ctx.strokeStyle = rgba(c, 0.4);
      ctx.lineWidth = Math.max(3, Math.min(w, h) * 0.03);
      ctx.strokeRect(w * 0.03, h * 0.03, w * 0.94, h * 0.94);
      const inset = Math.min(w, h) * 0.03;
      const W = w - inset * 2, H = h - inset * 2;
      const perim = 2 * W + 2 * H;
      const beadR = Math.min(w, h) * 0.018;
      const n = Math.max(16, Math.round(perim / (beadR * 2.4)));
      for (let i = 0; i < n; i++) {
        const d = (i / n) * perim;
        let x = 0, y = 0;
        if (d < W) { x = inset + d; y = inset; }
        else if (d < W + H) { x = inset + W; y = inset + (d - W); }
        else if (d < 2 * W + H) { x = inset + W - (d - W - H); y = inset + H; }
        else { x = inset; y = inset + H - (d - 2 * W - H); }
        const twist = i % 2 === 0;
        ctx.beginPath(); ctx.arc(x, y, beadR * (twist ? 1 : 0.75), 0, Math.PI * 2);
        ctx.fillStyle = twist ? rope : mix(rope, '#000000', 0.25);
        ctx.fill();
        ctx.strokeStyle = rgba(c, 0.5); ctx.lineWidth = Math.max(0.6, beadR * 0.2); ctx.stroke();
      }
      ctx.restore();
    },
  },
  {
    id: 'her/corner-flourish', label: 'Corner Flourish', group: 'symbols', sub: 'Cartouches & frames',
    tags: ['ornament', 'corner', 'flourish'],
    aspect: 1, defaultWidth: 140, variants: 4, kinds: ['region', 'operational', 'city', 'hex'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const c = ink(a);
      ctx.save();
      const rot = (a.variant % 4) * (Math.PI / 2);
      ctx.translate(w / 2, h / 2); ctx.rotate(rot); ctx.translate(-w / 2, -h / 2);
      ctx.strokeStyle = rgba(c, 0.85); ctx.lineWidth = Math.max(1.4, Math.min(w, h) * 0.028);
      ctx.beginPath();
      ctx.moveTo(w * 0.05, h * 0.55);
      ctx.quadraticCurveTo(w * 0.05, h * 0.05, w * 0.55, h * 0.05);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(w * 0.14, h * 0.55);
      ctx.quadraticCurveTo(w * 0.14, h * 0.14, w * 0.55, h * 0.14);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(w * 0.14, h * 0.14, w * 0.08, Math.PI * 0.5, Math.PI * 2);
      ctx.stroke();
      for (const t of [0.35, 0.65, 0.9]) {
        const x = w * 0.05 + t * w * 0.5;
        const y = h * 0.05 + (1 - t) * h * 0.5;
        const leaf = blob(x, y, w * 0.03, h * 0.02, 3, 0.2, rng);
        fillPath(ctx, leaf, mix(a.palette.parchment, '#000000', 0.1));
        inkLine(ctx, leaf, rgba(c, 0.75), 1, true);
      }
      ctx.restore();
    },
  },
  {
    id: 'her/scroll-ribbon', label: 'Scroll Ribbon', group: 'symbols', sub: 'Cartouches & frames',
    tags: ['title', 'ribbon', 'scroll'],
    aspect: 3.2, defaultWidth: 320, variants: 2, kinds: ['region', 'operational', 'city', 'hex'],
    draw(a) {
      const { ctx, w, h } = a;
      const c = ink(a);
      const paper = mix(a.palette.parchment, '#ffffff', 0.3);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(w * 0.02, h * 0.5);
      ctx.quadraticCurveTo(w * 0.15, h * 0.15, w * 0.4, h * 0.3);
      ctx.quadraticCurveTo(w * 0.5, h * 0.4, w * 0.6, h * 0.3);
      ctx.quadraticCurveTo(w * 0.85, h * 0.15, w * 0.98, h * 0.5);
      ctx.quadraticCurveTo(w * 0.85, h * 0.85, w * 0.6, h * 0.7);
      ctx.quadraticCurveTo(w * 0.5, h * 0.6, w * 0.4, h * 0.7);
      ctx.quadraticCurveTo(w * 0.15, h * 0.85, w * 0.02, h * 0.5);
      ctx.closePath();
      ctx.fillStyle = paper; ctx.fill();
      ctx.strokeStyle = rgba(c, 0.85); ctx.lineWidth = Math.max(1.2, h * 0.03); ctx.stroke();
      if (a.variant === 1) fillPath(ctx, star(w * 0.5, h * 0.5, h * 0.1, h * 0.04, 5), a.palette.accent);
      ctx.restore();
    },
  },
  {
    id: 'her/parchment-patch', label: 'Torn Parchment Patch', group: 'symbols', sub: 'Cartouches & frames',
    tags: ['parchment', 'torn', 'note'],
    aspect: 1.3, defaultWidth: 200, variants: 3, kinds: ['region', 'operational', 'city', 'hex'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const paper = mix(a.palette.parchment, '#ffffff', 0.15);
      const pts = blob(w * 0.5, h * 0.5, w * 0.44, h * 0.42, 9, 0.16, rng);
      ctx.save();
      groundShadow(ctx, w * 0.52, h * 0.56, w * 0.42, h * 0.36, 0.22);
      fillPath(ctx, pts, mix(paper, '#8a6b3e', 0.12));
      inkLine(ctx, pts, rgba(mix(ink(a), '#5a4326', 0.3), 0.7), Math.max(1, w * 0.008), true);
      ctx.save();
      tracePath(ctx, pts, true); ctx.clip();
      const g = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.1, w * 0.5, h * 0.5, Math.min(w, h) * 0.5);
      g.addColorStop(0, rgba('#000000', 0));
      g.addColorStop(1, rgba('#5a4326', 0.3));
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      speckle(ctx, 0, 0, w, h, 30, rgba('#5a4326', 0.2), w * 0.003, w * 0.008, rng);
      ctx.restore();
      ctx.restore();
    },
  },
  {
    id: 'her/wax-seal', label: 'Wax Seal', group: 'symbols', sub: 'Cartouches & frames',
    tags: ['seal', 'wax', 'sigil', 'letter'],
    aspect: 1, defaultWidth: 70, variants: 3, kinds: ['region', 'operational', 'city', 'hex'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const waxColor = a.tint || mix('#8c1d24', a.palette.accent, 0.3);
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.42;
      const edge = blob(cx, cy, R, R, 5, 0.12, rng);
      ctx.save();
      groundShadow(ctx, cx + R * 0.15, cy + R * 0.2, R, R * 0.85, 0.28);
      fillPath(ctx, edge, lightGradient(ctx, cx - R, cy - R, cx + R, cy + R, waxColor, 0.22, 0.3));
      inkLine(ctx, edge, rgba(mix(waxColor, '#000000', 0.5), 0.8), Math.max(1, R * 0.05), true);
      ctx.save();
      tracePath(ctx, edge, true); ctx.clip();
      ctx.strokeStyle = rgba('#ffffff', 0.25);
      ctx.lineWidth = Math.max(1, R * 0.08);
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.86, 0, Math.PI * 2); ctx.stroke();
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.65);
      g.addColorStop(0, rgba('#000000', 0.35));
      g.addColorStop(0.7, rgba('#000000', 0.12));
      g.addColorStop(1, rgba('#000000', 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.65, 0, Math.PI * 2); ctx.fill();
      const kinds: ChargeKind[] = ['star', 'tower', 'rose'];
      charge(a, kinds[a.variant % kinds.length], cx, cy, R * 0.5, mix(waxColor, '#000000', 0.35));
      ctx.restore();
      ctx.restore();
    },
  },
  {
    id: 'her/ribbon-divider', label: 'Ribbon Divider', group: 'symbols', sub: 'Cartouches & frames',
    tags: ['divider', 'ribbon', 'rule'],
    aspect: 5, defaultWidth: 260, variants: 2, kinds: ['region', 'operational', 'city', 'hex'],
    draw(a) {
      const { ctx, w, h } = a;
      const c = ink(a);
      const primary = primaryTincture(a);
      ctx.save();
      ctx.strokeStyle = rgba(c, 0.6); ctx.lineWidth = Math.max(1, h * 0.05);
      ctx.beginPath(); ctx.moveTo(w * 0.02, h * 0.5); ctx.lineTo(w * 0.38, h * 0.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w * 0.62, h * 0.5); ctx.lineTo(w * 0.98, h * 0.5); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(w * 0.38, h * 0.5);
      ctx.lineTo(w * 0.46, h * 0.2); ctx.lineTo(w * 0.5, h * 0.5); ctx.lineTo(w * 0.54, h * 0.2); ctx.lineTo(w * 0.62, h * 0.5);
      ctx.lineTo(w * 0.54, h * 0.8); ctx.lineTo(w * 0.5, h * 0.5); ctx.lineTo(w * 0.46, h * 0.8);
      ctx.closePath();
      ctx.fillStyle = primary; ctx.fill();
      ctx.strokeStyle = rgba(c, 0.8); ctx.lineWidth = Math.max(1, h * 0.03); ctx.stroke();
      if (a.variant === 1) fillPath(ctx, star(w * 0.5, h * 0.5, h * 0.14, h * 0.06, 5), metalTincture(a));
      ctx.restore();
    },
  },
  {
    id: 'her/decorative-rule', label: 'Decorative Rule', group: 'symbols', sub: 'Cartouches & frames',
    tags: ['rule', 'divider', 'fleuron'],
    aspect: 6, defaultWidth: 280, variants: 2, kinds: ['region', 'operational', 'city', 'hex'],
    draw(a) {
      const { ctx, w, h } = a;
      const c = ink(a);
      ctx.save();
      ctx.strokeStyle = rgba(c, 0.75); ctx.lineWidth = Math.max(1, h * 0.06);
      ctx.beginPath(); ctx.moveTo(w * 0.03, h * 0.5); ctx.lineTo(w * 0.44, h * 0.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w * 0.56, h * 0.5); ctx.lineTo(w * 0.97, h * 0.5); ctx.stroke();
      ctx.lineWidth = Math.max(1, h * 0.03);
      ctx.beginPath(); ctx.moveTo(w * 0.44, h * 0.5); ctx.lineTo(w * 0.48, h * 0.2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w * 0.56, h * 0.5); ctx.lineTo(w * 0.52, h * 0.2); ctx.stroke();
      const sides = a.variant === 0 ? 4 : 6;
      const pts = regularPolygon(w * 0.5, h * 0.5, h * 0.24, sides, Math.PI / sides);
      fillPath(ctx, pts, mix(a.palette.parchment, '#ffffff', 0.3));
      inkLine(ctx, pts, rgba(c, 0.85), Math.max(1, h * 0.03), true);
      ctx.restore();
    },
  },

  // -------------------------------------------------------------- Cartography
  {
    id: 'her/compass-mariner', label: "Mariner's Rose", group: 'symbols', sub: 'Cartography',
    tags: ['north', 'compass', 'portolan'],
    aspect: 1, defaultWidth: 220, variants: 2, kinds: ['region', 'operational', 'city', 'hex'],
    draw(a) {
      const { ctx, w, h } = a;
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.46;
      const c = ink(a);
      ctx.save();
      ctx.strokeStyle = rgba(c, 0.8); ctx.lineWidth = Math.max(1, R * 0.015);
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
      const spikes = 32;
      for (let i = 0; i < spikes; i++) {
        const ang = (i / spikes) * Math.PI * 2 - Math.PI / 2;
        const major = i % 8 === 0;
        const mid = i % 4 === 0;
        const len = major ? R * 0.96 : mid ? R * 0.74 : R * 0.54;
        const halfW = major ? R * 0.045 : R * 0.02;
        const tip: Vec2 = { x: cx + Math.cos(ang) * len, y: cy + Math.sin(ang) * len };
        const l: Vec2 = { x: cx + Math.cos(ang + Math.PI / 2) * halfW, y: cy + Math.sin(ang + Math.PI / 2) * halfW };
        const r: Vec2 = { x: cx + Math.cos(ang - Math.PI / 2) * halfW, y: cy + Math.sin(ang - Math.PI / 2) * halfW };
        ctx.beginPath();
        ctx.moveTo(tip.x, tip.y); ctx.lineTo(l.x, l.y); ctx.lineTo(cx, cy); ctx.lineTo(r.x, r.y); ctx.closePath();
        ctx.fillStyle = i % 2 === 0 ? c : mix(c, '#ffffff', 0.7);
        ctx.fill();
        if (major) { ctx.strokeStyle = rgba(c, 0.9); ctx.lineWidth = Math.max(1, R * 0.01); ctx.stroke(); }
      }
      if (a.variant === 1) {
        ctx.strokeStyle = rgba(a.palette.routes, 0.35); ctx.lineWidth = Math.max(0.6, R * 0.006);
        for (let i = 0; i < 8; i++) {
          const ang = (i / 8) * Math.PI * 2;
          ctx.beginPath(); ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(ang) * R * 1.3, cy + Math.sin(ang) * R * 1.3);
          ctx.stroke();
        }
      }
      fillPath(ctx, star(cx, cy - R * 1.0, R * 0.09, R * 0.035, 5), a.palette.accent);
      ctx.restore();
    },
  },
  {
    id: 'her/compass-arrow', label: 'Arrow North Point', group: 'symbols', sub: 'Cartography',
    tags: ['north', 'arrow', 'simple'],
    aspect: 0.6, defaultWidth: 60, variants: 2, kinds: ['region', 'operational', 'city', 'hex'],
    draw(a) {
      const { ctx, w, h } = a;
      const c = ink(a);
      ctx.save();
      ctx.strokeStyle = rgba(c, 0.9); ctx.lineWidth = Math.max(2, w * 0.09); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(w * 0.5, h * 0.86); ctx.lineTo(w * 0.5, h * 0.18); ctx.stroke();
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.moveTo(w * 0.5, h * 0.04); ctx.lineTo(w * 0.74, h * 0.32); ctx.lineTo(w * 0.26, h * 0.32); ctx.closePath(); ctx.fill();
      if (a.variant % 2 === 1) {
        ctx.lineWidth = Math.max(1, w * 0.05);
        ctx.beginPath(); ctx.moveTo(w * 0.36, h * 0.8); ctx.lineTo(w * 0.64, h * 0.8); ctx.stroke();
      }
      ctx.fillStyle = c;
      ctx.font = `700 ${h * 0.16}px Georgia, serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('N', w * 0.5, h * 0.9);
      ctx.restore();
    },
  },
  {
    id: 'her/latlong-corner', label: 'Lat/Long Corner', group: 'symbols', sub: 'Cartography',
    tags: ['grid', 'coordinates', 'corner'],
    aspect: 1, defaultWidth: 140, variants: 4, kinds: ['region', 'operational', 'city', 'hex'],
    draw(a) {
      const { ctx, w, h } = a;
      const c = ink(a);
      ctx.save();
      const rot = (a.variant % 4) * (Math.PI / 2);
      ctx.translate(w / 2, h / 2); ctx.rotate(rot); ctx.translate(-w / 2, -h / 2);
      ctx.strokeStyle = rgba(c, 0.85); ctx.lineWidth = Math.max(1.2, Math.min(w, h) * 0.02);
      ctx.beginPath(); ctx.moveTo(w * 0.08, h * 0.9); ctx.lineTo(w * 0.08, h * 0.08); ctx.lineTo(w * 0.9, h * 0.08); ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        const major = i % 2 === 0;
        ctx.lineWidth = Math.max(1, Math.min(w, h) * (major ? 0.018 : 0.01));
        const y = h * 0.08 + t * h * 0.8;
        ctx.beginPath(); ctx.moveTo(w * 0.08, y); ctx.lineTo(w * (0.08 + (major ? 0.05 : 0.03)), y); ctx.stroke();
        const x = w * 0.08 + t * w * 0.8;
        ctx.beginPath(); ctx.moveTo(x, h * 0.08); ctx.lineTo(x, h * (0.08 + (major ? 0.05 : 0.03))); ctx.stroke();
      }
      ctx.fillStyle = c;
      ctx.font = `600 ${Math.min(w, h) * 0.09}px Georgia, serif`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText('45°N', w * 0.12, h * 0.06);
      ctx.save();
      ctx.translate(w * 0.04, h * 0.5); ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('12°E', 0, 0);
      ctx.restore();
      ctx.restore();
    },
  },
  {
    id: 'her/scale-leagues', label: 'Distance Scale (Leagues)', group: 'symbols', sub: 'Cartography',
    tags: ['distance', 'legend', 'leagues'],
    aspect: 4, defaultWidth: 260, variants: 2, kinds: ['region', 'operational', 'city', 'hex'],
    draw(a) {
      const { ctx, w, h } = a;
      const c = ink(a);
      const barY = h * 0.5, barH = h * 0.22;
      const segs = a.variant === 0 ? 4 : 5;
      ctx.save();
      for (let i = 0; i < segs; i++) {
        ctx.fillStyle = i % 2 === 0 ? c : mix(c, '#ffffff', 0.8);
        ctx.fillRect(w * 0.06 + (i / segs) * w * 0.88, barY, (w * 0.88) / segs, barH);
      }
      ctx.strokeStyle = c; ctx.lineWidth = Math.max(1, h * 0.03);
      ctx.strokeRect(w * 0.06, barY, w * 0.88, barH);
      ctx.fillStyle = c;
      ctx.font = `600 ${h * 0.2}px Georgia, serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      for (let i = 0; i <= segs; i++) ctx.fillText(String(i * 5), w * 0.06 + (i / segs) * w * 0.88, barY - h * 0.06);
      ctx.textBaseline = 'top';
      ctx.fillText('leagues', w * 0.5, barY + barH + h * 0.06);
      ctx.restore();
    },
  },
  {
    id: 'her/north-fleur', label: 'North Arrow (Fleur-de-lis)', group: 'symbols', sub: 'Cartography',
    tags: ['north', 'fleur-de-lis', 'ornament'],
    aspect: 0.55, defaultWidth: 70, variants: 2, kinds: ['region', 'operational', 'city', 'hex'],
    draw(a) {
      const { ctx, w, h } = a;
      const c = ink(a);
      ctx.save();
      ctx.strokeStyle = rgba(c, 0.9); ctx.lineWidth = Math.max(1.5, w * 0.06);
      ctx.beginPath(); ctx.moveTo(w * 0.5, h * 0.92); ctx.lineTo(w * 0.5, h * 0.42); ctx.stroke();
      const cx = w * 0.5, topY = h * 0.06;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(cx, topY);
      ctx.quadraticCurveTo(cx + w * 0.1, h * 0.22, cx + w * 0.05, h * 0.36);
      ctx.lineTo(cx - w * 0.05, h * 0.36);
      ctx.quadraticCurveTo(cx - w * 0.1, h * 0.22, cx, topY);
      ctx.closePath(); ctx.fill();
      for (const s of [-1, 1] as const) {
        ctx.beginPath();
        ctx.moveTo(cx, h * 0.2);
        ctx.quadraticCurveTo(cx + s * w * 0.28, h * 0.14, cx + s * w * 0.2, h * 0.34);
        ctx.quadraticCurveTo(cx + s * w * 0.08, h * 0.3, cx, h * 0.24);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillRect(cx - w * 0.18, h * 0.36, w * 0.36, h * 0.045);
      if (a.variant === 1) {
        ctx.strokeStyle = rgba(a.palette.accent, 0.8); ctx.lineWidth = Math.max(1, w * 0.02);
        ctx.beginPath(); ctx.arc(cx, h * 0.2, w * 0.34, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = c;
      ctx.font = `700 ${h * 0.12}px Georgia, serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('N', cx, h * 0.4);
      ctx.restore();
    },
  },
  {
    id: 'her/wind-rhumb', label: 'Wind Rose with Rhumb Lines', group: 'symbols', sub: 'Cartography',
    tags: ['wind rose', 'rhumb', 'portolan'],
    aspect: 1, defaultWidth: 240, variants: 2, kinds: ['region', 'operational', 'city', 'hex'],
    draw(a) {
      const { ctx, w, h } = a;
      const c = ink(a);
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.44;
      const n = a.variant === 0 ? 8 : 16;
      const pts: Vec2[] = [];
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
        pts.push({ x: cx + Math.cos(ang) * R, y: cy + Math.sin(ang) * R });
      }
      ctx.save();
      ctx.strokeStyle = rgba(a.palette.routes, 0.3); ctx.lineWidth = Math.max(0.6, R * 0.006);
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); ctx.stroke();
        }
      }
      ctx.strokeStyle = rgba(c, 0.85); ctx.lineWidth = Math.max(1, R * 0.015);
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
      for (const p of pts) { ctx.beginPath(); ctx.arc(p.x, p.y, R * 0.02, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); }
      fillPath(ctx, star(cx, cy, R * 0.14, R * 0.06, 8), a.palette.accent);
      ctx.restore();
    },
  },
  {
    id: 'her/depth-soundings', label: 'Depth Soundings', group: 'symbols', sub: 'Cartography',
    tags: ['depth', 'soundings', 'portolan', 'sea'],
    aspect: 1.2, defaultWidth: 120, variants: 3, kinds: ['region', 'operational', 'city', 'hex'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const c = ink(a);
      ctx.save();
      const n = 5 + a.variant * 2;
      ctx.fillStyle = rgba(c, 0.85);
      ctx.font = `600 ${Math.min(w, h) * 0.16}px Georgia, serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < n; i++) {
        const x = rng.float(w * 0.12, w * 0.88), y = rng.float(h * 0.18, h * 0.88);
        ctx.beginPath(); ctx.arc(x, y, Math.min(w, h) * 0.012, 0, Math.PI * 2); ctx.fill();
        const depth = rng.int(2, 40);
        ctx.fillText(String(depth), x, y - Math.min(w, h) * 0.07);
      }
      ctx.restore();
    },
  },
  {
    id: 'her/hachure-ridge', label: 'Hachure Ridge Mark', group: 'symbols', sub: 'Cartography',
    tags: ['hachure', 'relief', 'ridge'],
    aspect: 2, defaultWidth: 140, variants: 3, kinds: ['region', 'operational', 'city', 'hex'],
    draw(a) {
      const { ctx, w, h } = a;
      const c = ink(a);
      ctx.save();
      ctx.strokeStyle = rgba(c, 0.8); ctx.lineCap = 'round';
      const rows = 3 + (a.variant % 3);
      for (let r = 0; r < rows; r++) {
        const t = rows > 1 ? r / (rows - 1) : 0.5;
        const y = h * (0.22 + t * 0.56);
        const n = 6;
        for (let i = 0; i < n; i++) {
          const x = w * (0.1 + i * (0.8 / (n - 1)));
          const falloff = 1 - Math.abs(t - 0.5) * 1.6;
          const len = h * 0.16 * Math.max(0.3, falloff);
          ctx.lineWidth = Math.max(1, h * 0.02 * (1 - (i / n) * 0.4));
          ctx.beginPath();
          ctx.moveTo(x, y - len / 2);
          ctx.lineTo(x + w * 0.015, y + len / 2);
          ctx.stroke();
        }
      }
      ctx.restore();
    },
  },
  {
    id: 'her/map-fold', label: 'Map Fold Crease', group: 'symbols', sub: 'Cartography',
    tags: ['fold', 'crease', 'parchment'],
    aspect: 6, defaultWidth: 400, variants: 2, kinds: ['region', 'operational', 'city', 'hex'],
    draw(a) {
      const { ctx, w, h } = a;
      const c = ink(a);
      ctx.save();
      const y = h * 0.5;
      const grad = ctx.createLinearGradient(0, y - h * 0.4, 0, y + h * 0.4);
      grad.addColorStop(0, rgba('#000000', 0));
      grad.addColorStop(0.48, rgba('#000000', 0.14));
      grad.addColorStop(0.5, rgba('#ffffff', 0.22));
      grad.addColorStop(0.52, rgba('#000000', 0.1));
      grad.addColorStop(1, rgba('#000000', 0));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = rgba(c, 0.35); ctx.lineWidth = Math.max(1, h * 0.03);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, a.variant % 2 === 1 ? y - h * 0.06 : y);
      ctx.stroke();
      ctx.restore();
    },
  },

  // -------------------------------------------------------- Tactical markers
  {
    id: 'mrk/unit-counter', label: 'Unit Counter', group: 'markers', sub: 'Tactical markers',
    tags: ['unit', 'wargame', 'counter', 'nato'],
    aspect: 1, defaultWidth: 48, variants: 4, kinds: ['operational', 'battle', 'dungeon'],
    draw(a) {
      const { ctx, w, h } = a;
      const p = a.palette;
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.46;
      ctx.save();
      ctx.fillStyle = rgba('#000000', 0.32);
      roundRect(ctx, cx - R, cy - R, R * 2, R * 2, R * 0.18); ctx.fill();
      roundRect(ctx, cx - R * 0.88, cy - R * 0.88, R * 1.76, R * 1.76, R * 0.14);
      ctx.fillStyle = mix(p.parchment, '#ffffff', 0.3); ctx.fill();
      ctx.strokeStyle = rgba(p.ink, 0.85); ctx.lineWidth = Math.max(1, R * 0.1); ctx.stroke();
      const glyph = a.tint || p.accent;
      ctx.strokeStyle = glyph; ctx.fillStyle = glyph; ctx.lineWidth = Math.max(1.5, R * 0.14); ctx.lineCap = 'round';
      const kind = a.variant % 4;
      if (kind === 0) {
        ctx.beginPath();
        ctx.moveTo(cx - R * 0.5, cy - R * 0.5); ctx.lineTo(cx + R * 0.5, cy + R * 0.5);
        ctx.moveTo(cx + R * 0.5, cy - R * 0.5); ctx.lineTo(cx - R * 0.5, cy + R * 0.5);
        ctx.stroke();
      } else if (kind === 1) {
        ctx.beginPath(); ctx.ellipse(cx, cy, R * 0.5, R * 0.28, -0.5, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - R * 0.55, cy + R * 0.4); ctx.lineTo(cx + R * 0.55, cy - R * 0.4); ctx.stroke();
      } else if (kind === 2) {
        ctx.beginPath(); ctx.arc(cx - R * 0.1, cy, R * 0.5, -0.9, 0.9); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - R * 0.5, cy); ctx.lineTo(cx + R * 0.4, cy); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + R * 0.4, cy); ctx.lineTo(cx + R * 0.2, cy - R * 0.15);
        ctx.moveTo(cx + R * 0.4, cy); ctx.lineTo(cx + R * 0.2, cy + R * 0.15);
        ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(cx, cy, R * 0.4, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, R * 0.1, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    },
  },
  {
    id: 'mrk/objective', label: 'Objective Marker', group: 'markers', sub: 'Tactical markers',
    tags: ['objective', 'goal', 'wargame'],
    aspect: 1, defaultWidth: 44, variants: 2, kinds: ['operational', 'battle', 'dungeon'],
    draw(a) {
      const { ctx, w, h } = a;
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.42;
      ctx.save();
      plateCircle(ctx, cx, cy, R, a.palette);
      const glyph = a.tint || a.palette.accent;
      const pts = star(cx, cy, R * 0.62, R * 0.28, a.variant % 2 === 0 ? 5 : 6);
      fillPath(ctx, pts, glyph);
      inkLine(ctx, pts, rgba(a.palette.ink, 0.85), Math.max(1, R * 0.08), true);
      ctx.restore();
    },
  },
  {
    id: 'mrk/rally-point', label: 'Rally Point', group: 'markers', sub: 'Tactical markers',
    tags: ['rally', 'regroup', 'wargame'],
    aspect: 1, defaultWidth: 44, variants: 2, kinds: ['operational', 'battle', 'dungeon'],
    draw(a) {
      const { ctx, w, h } = a;
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.42;
      ctx.save();
      plateCircle(ctx, cx, cy, R, a.palette);
      const glyph = a.tint || a.palette.routes;
      ctx.strokeStyle = glyph; ctx.fillStyle = glyph; ctx.lineWidth = Math.max(1.5, R * 0.1); ctx.lineCap = 'round';
      const n = a.variant % 2 === 0 ? 4 : 3;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2;
        const x0 = cx + Math.cos(ang) * R * 0.85, y0 = cy + Math.sin(ang) * R * 0.85;
        const x1 = cx + Math.cos(ang) * R * 0.3, y1 = cy + Math.sin(ang) * R * 0.3;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        const ah = Math.atan2(y1 - y0, x1 - x0);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 - Math.cos(ah - 0.4) * R * 0.16, y1 - Math.sin(ah - 0.4) * R * 0.16);
        ctx.lineTo(x1 - Math.cos(ah + 0.4) * R * 0.16, y1 - Math.sin(ah + 0.4) * R * 0.16);
        ctx.closePath(); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.14, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    },
  },
  {
    id: 'mrk/deployment-corner', label: 'Deployment Zone Corner', group: 'markers', sub: 'Tactical markers',
    tags: ['deployment', 'zone', 'bracket'],
    aspect: 1, defaultWidth: 40, variants: 4, kinds: ['operational', 'battle', 'dungeon'],
    draw(a) {
      const { ctx, w, h } = a;
      const c = a.tint || a.palette.accent;
      ctx.save();
      const rot = (a.variant % 4) * (Math.PI / 2);
      ctx.translate(w / 2, h / 2); ctx.rotate(rot); ctx.translate(-w / 2, -h / 2);
      ctx.strokeStyle = rgba('#000000', 0.35); ctx.lineWidth = Math.max(3, w * 0.22); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(w * 0.08, h * 0.7); ctx.lineTo(w * 0.08, h * 0.08); ctx.lineTo(w * 0.7, h * 0.08); ctx.stroke();
      ctx.strokeStyle = c; ctx.lineWidth = Math.max(2, w * 0.12);
      ctx.beginPath(); ctx.moveTo(w * 0.08, h * 0.7); ctx.lineTo(w * 0.08, h * 0.08); ctx.lineTo(w * 0.7, h * 0.08); ctx.stroke();
      ctx.restore();
    },
  },
  {
    id: 'mrk/threat-diamond', label: 'Threat Diamond', group: 'markers', sub: 'Tactical markers',
    tags: ['threat', 'danger', 'warning'],
    aspect: 1, defaultWidth: 44, variants: 2, kinds: ['operational', 'battle', 'dungeon'],
    draw(a) {
      const { ctx, w, h } = a;
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.42;
      const danger = mix('#c0392b', a.palette.accent, 0.2);
      const fill = a.tint || danger;
      ctx.save();
      plateDiamond(ctx, cx, cy, R, a.palette, fill);
      ctx.fillStyle = readableInk(fill);
      if (a.variant % 2 === 0) {
        ctx.font = `800 ${R * 0.9}px Georgia, serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('!', cx, cy + R * 0.06);
      } else {
        ctx.beginPath(); ctx.arc(cx - R * 0.18, cy - R * 0.1, R * 0.1, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + R * 0.18, cy - R * 0.1, R * 0.1, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = readableInk(fill); ctx.lineWidth = Math.max(1, R * 0.1); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cx - R * 0.24, cy + R * 0.26); ctx.lineTo(cx + R * 0.24, cy + R * 0.26); ctx.stroke();
      }
      ctx.restore();
    },
  },
  {
    id: 'mrk/patrol-arrow', label: 'Patrol Route Arrow', group: 'markers', sub: 'Tactical markers',
    tags: ['patrol', 'route', 'loop'],
    aspect: 1.4, defaultWidth: 60, variants: 2, kinds: ['operational', 'battle', 'dungeon'],
    draw(a) {
      const { ctx, w, h } = a;
      const c = a.tint || a.palette.routes;
      const cx = w * 0.5, cy = h * 0.55, R = Math.min(w, h) * 0.32;
      const start = Math.PI * 0.15, end = a.variant % 2 === 0 ? Math.PI * 1.7 : Math.PI * 1.4;
      ctx.save();
      ctx.strokeStyle = rgba('#000000', 0.3); ctx.lineWidth = Math.max(3, h * 0.16); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(cx, cy, R, start, end); ctx.stroke();
      ctx.strokeStyle = c; ctx.lineWidth = Math.max(1.5, h * 0.08);
      ctx.beginPath(); ctx.arc(cx, cy, R, start, end); ctx.stroke();
      const ex = cx + Math.cos(end) * R, ey = cy + Math.sin(end) * R;
      const dir = end + Math.PI / 2;
      const ah = Math.min(w, h) * 0.18;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(ex + Math.cos(dir) * ah, ey + Math.sin(dir) * ah);
      ctx.lineTo(ex + Math.cos(dir + 2.5) * ah * 0.6, ey + Math.sin(dir + 2.5) * ah * 0.6);
      ctx.lineTo(ex + Math.cos(dir - 2.5) * ah * 0.6, ey + Math.sin(dir - 2.5) * ah * 0.6);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    },
  },
  {
    id: 'mrk/chokepoint-bracket', label: 'Chokepoint Bracket', group: 'markers', sub: 'Tactical markers',
    tags: ['chokepoint', 'bracket', 'terrain'],
    aspect: 1.2, defaultWidth: 50, variants: 2, kinds: ['operational', 'battle', 'dungeon'],
    draw(a) {
      const { ctx, w, h } = a;
      const c = a.tint || a.palette.accent;
      const inward = a.variant % 2 === 0;
      ctx.save();
      const path = () => {
        ctx.beginPath();
        if (inward) {
          ctx.moveTo(w * 0.32, h * 0.1); ctx.lineTo(w * 0.12, h * 0.5); ctx.lineTo(w * 0.32, h * 0.9);
          ctx.moveTo(w * 0.68, h * 0.1); ctx.lineTo(w * 0.88, h * 0.5); ctx.lineTo(w * 0.68, h * 0.9);
        } else {
          ctx.moveTo(w * 0.12, h * 0.1); ctx.lineTo(w * 0.32, h * 0.5); ctx.lineTo(w * 0.12, h * 0.9);
          ctx.moveTo(w * 0.88, h * 0.1); ctx.lineTo(w * 0.68, h * 0.5); ctx.lineTo(w * 0.88, h * 0.9);
        }
      };
      ctx.strokeStyle = rgba('#000000', 0.35); ctx.lineWidth = Math.max(3, w * 0.16); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      path(); ctx.stroke();
      ctx.strokeStyle = c; ctx.lineWidth = Math.max(1.5, w * 0.08);
      path(); ctx.stroke();
      ctx.restore();
    },
  },
  {
    id: 'mrk/sector-plate', label: 'Sector Label Plate', group: 'markers', sub: 'Tactical markers',
    tags: ['sector', 'grid', 'label'],
    aspect: 1, defaultWidth: 48, variants: 24, kinds: ['operational', 'battle', 'dungeon'],
    draw(a) {
      const { ctx, w, h } = a;
      const p = a.palette;
      const letters = 'ABCDEF';
      const li = a.variant % letters.length;
      const ni = Math.floor(a.variant / letters.length) % 4;
      const label = letters[li] + String(ni + 1);
      ctx.save();
      roundRect(ctx, w * 0.06, h * 0.1, w * 0.88, h * 0.8, w * 0.1);
      ctx.fillStyle = rgba('#000000', 0.3); ctx.fill();
      roundRect(ctx, w * 0.1, h * 0.14, w * 0.8, h * 0.72, w * 0.08);
      const plate = a.tint ? mix(p.parchment, a.tint, 0.25) : mix(p.parchment, '#ffffff', 0.25);
      ctx.fillStyle = plate; ctx.fill();
      ctx.strokeStyle = rgba(p.ink, 0.85); ctx.lineWidth = Math.max(1.2, w * 0.03); ctx.stroke();
      ctx.fillStyle = readableInk(plate);
      ctx.font = `800 ${h * 0.4}px Georgia, serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, w * 0.5, h * 0.53);
      ctx.restore();
    },
  },
  {
    id: 'mrk/waypoint-ring', label: 'Waypoint Ring', group: 'markers', sub: 'Tactical markers',
    tags: ['waypoint', 'route', 'number'],
    aspect: 1, defaultWidth: 40, variants: 12, kinds: ['operational', 'battle', 'dungeon'],
    draw(a) {
      const { ctx, w, h } = a;
      const p = a.palette;
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.42;
      const c = a.tint || p.routes;
      const plateFill = mix(p.parchment, '#ffffff', 0.3);
      ctx.save();
      plateCircle(ctx, cx, cy, R, p, plateFill);
      ctx.strokeStyle = c; ctx.lineWidth = Math.max(1.2, R * 0.14);
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.72, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = readableInk(plateFill);
      ctx.font = `700 ${R * 0.7}px Georgia, serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String((a.variant % 12) + 1), cx, cy + R * 0.05);
      ctx.restore();
    },
  },
  {
    id: 'mrk/difficulty-stars', label: 'Encounter Difficulty', group: 'markers', sub: 'Tactical markers',
    tags: ['difficulty', 'rating', 'encounter'],
    aspect: 2.6, defaultWidth: 130, variants: 5, kinds: ['operational', 'battle', 'dungeon'],
    draw(a) {
      const { ctx, w, h } = a;
      const p = a.palette;
      const filled = (a.variant % 5) + 1;
      ctx.save();
      roundRect(ctx, w * 0.02, h * 0.22, w * 0.96, h * 0.56, h * 0.14);
      ctx.fillStyle = rgba('#000000', 0.28); ctx.fill();
      roundRect(ctx, w * 0.04, h * 0.27, w * 0.92, h * 0.46, h * 0.12);
      ctx.fillStyle = mix(p.parchment, '#ffffff', 0.28); ctx.fill();
      ctx.strokeStyle = rgba(p.ink, 0.8); ctx.lineWidth = Math.max(1, h * 0.02); ctx.stroke();
      const n = 5;
      for (let i = 0; i < n; i++) {
        const cx = w * (0.12 + i * (0.76 / (n - 1)));
        const cy = h * 0.5;
        const r = Math.min(w / n, h) * 0.3;
        const pts = star(cx, cy, r, r * 0.42, 5);
        fillPath(ctx, pts, i < filled ? (a.tint || p.accent) : rgba(p.ink, 0.15));
        inkLine(ctx, pts, rgba(p.ink, 0.7), Math.max(1, r * 0.12), true);
      }
      ctx.restore();
    },
  },
  {
    id: 'mrk/condition-token', label: 'Condition Token', group: 'markers', sub: 'Tactical markers',
    tags: ['condition', 'status', 'fire', 'poison', 'blessed', 'cursed'],
    aspect: 1, defaultWidth: 40, variants: 4, kinds: ['operational', 'battle', 'dungeon'],
    draw(a) {
      const { ctx, w, h } = a;
      const p = a.palette;
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.42;
      const kinds = ['fire', 'poison', 'blessed', 'cursed'] as const;
      const kind = kinds[a.variant % 4];
      const colors: Record<typeof kinds[number], string> = {
        fire: '#d9622b', poison: '#5a9c3a', blessed: '#d9c04a', cursed: '#6a3d9c',
      };
      const c = colors[kind];
      ctx.save();
      plateCircle(ctx, cx, cy, R, p, mix(p.parchment, '#ffffff', 0.25));
      ctx.fillStyle = c; ctx.strokeStyle = rgba(p.ink, 0.8); ctx.lineWidth = Math.max(1, R * 0.08);
      if (kind === 'fire') {
        ctx.beginPath();
        ctx.moveTo(cx, cy - R * 0.55);
        ctx.quadraticCurveTo(cx + R * 0.35, cy - R * 0.1, cx + R * 0.15, cy + R * 0.2);
        ctx.quadraticCurveTo(cx + R * 0.3, cy + R * 0.25, cx, cy + R * 0.55);
        ctx.quadraticCurveTo(cx - R * 0.3, cy + R * 0.25, cx - R * 0.15, cy + R * 0.2);
        ctx.quadraticCurveTo(cx - R * 0.35, cy - R * 0.1, cx, cy - R * 0.55);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      } else if (kind === 'poison') {
        for (let i = 0; i < 3; i++) {
          const x = cx + (i - 1) * R * 0.32;
          ctx.beginPath(); ctx.arc(x, cy + (i === 1 ? -R * 0.15 : R * 0.1), R * 0.18, 0, Math.PI * 2);
          ctx.fill(); ctx.stroke();
        }
      } else if (kind === 'blessed') {
        ctx.strokeStyle = c; ctx.lineWidth = Math.max(2, R * 0.16); ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx, cy - R * 0.5); ctx.lineTo(cx, cy + R * 0.5);
        ctx.moveTo(cx - R * 0.3, cy - R * 0.15); ctx.lineTo(cx + R * 0.3, cy - R * 0.15);
        ctx.stroke();
      } else {
        const pts = star(cx, cy, R * 0.5, R * 0.22, 7);
        fillPath(ctx, pts, c);
        inkLine(ctx, pts, rgba(p.ink, 0.8), Math.max(1, R * 0.08), true);
      }
      ctx.restore();
    },
  },
  {
    id: 'mrk/initiative-chit', label: 'Initiative Chit', group: 'markers', sub: 'Tactical markers',
    tags: ['initiative', 'turn order', 'chit'],
    aspect: 1, defaultWidth: 40, variants: 8, kinds: ['operational', 'battle', 'dungeon'],
    draw(a) {
      const { ctx, w, h } = a;
      const p = a.palette;
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.44;
      ctx.save();
      const halo = regularPolygon(cx, cy, R * 1.1, 6);
      fillPath(ctx, halo, rgba('#000000', 0.3));
      const face = regularPolygon(cx, cy, R, 6);
      const fill = a.tint ? mix(p.parchment, a.tint, 0.3) : mix(p.parchment, '#ffffff', 0.3);
      fillPath(ctx, face, fill);
      inkLine(ctx, face, rgba(p.ink, 0.85), Math.max(1, R * 0.1), true);
      ctx.fillStyle = readableInk(fill);
      ctx.font = `800 ${R * 0.8}px Georgia, serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String((a.variant % 8) + 1), cx, cy + R * 0.05);
      ctx.restore();
    },
  },
];
