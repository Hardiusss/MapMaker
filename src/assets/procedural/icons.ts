/**
 * Map symbols built from imported vector geometry.
 *
 * These are the one part of the library not drawn by our own code: the outlines
 * come from game-icons.net under CC BY 3.0. What makes them worth taking is
 * that they are *paths*, not pictures — the same property the rest of the
 * library relies on. An imported icon still redraws at whatever size the map
 * asks for, still takes the palette, still recolours under a tint, and still
 * collapses to line art in Pure Ink. A folder of PNGs would have given up all
 * four.
 *
 * Each icon carries its author through to the credits panel, because the
 * licence asks for credit per work rather than one line in a readme.
 */
import type { AssetDef, AssetDrawArgs, AssetGroup } from '../types';
import type { MapKind } from '../../core/types';
import { ICON_PATHS, type IconPath } from './iconPaths';
import { mix, rgba } from '../../core/color';
import { groundShadow } from '../draw';

/** Path2D is not free to construct; an icon redrawn every frame wants it once. */
const CACHE = new Map<string, Path2D>();
function pathFor(icon: IconPath): Path2D {
  let p = CACHE.get(icon.id);
  if (!p) { p = new Path2D(icon.d); CACHE.set(icon.id, p); }
  return p;
}

const GRID = 512;

interface ShelfSpec {
  group: AssetGroup;
  width: number;
  kinds: MapKind[];
  tags: string[];
}

const SHELVES: Record<string, ShelfSpec> = {
  'Heraldic charges': {
    group: 'symbols', width: 96, tags: ['heraldry', 'charge', 'blazon', 'faction'],
    kinds: ['region', 'operational', 'city', 'hex', 'battle', 'dungeon'],
  },
  'Sites & landmarks': {
    group: 'markers', width: 76, tags: ['poi', 'landmark', 'site'],
    kinds: ['region', 'operational', 'hex', 'city'],
  },
  'Resources & trade': {
    group: 'markers', width: 68, tags: ['resource', 'trade', 'economy'],
    kinds: ['region', 'operational', 'hex', 'city'],
  },
  'Hazards & magic': {
    group: 'markers', width: 72, tags: ['hazard', 'magic', 'danger'],
    kinds: ['battle', 'dungeon', 'cave', 'operational', 'region'],
  },
  'Bestiary marks': {
    group: 'symbols', width: 88, tags: ['monster', 'beast', 'lair'],
    kinds: ['region', 'operational', 'hex', 'battle', 'dungeon', 'cave'],
  },
  'Military symbols': {
    group: 'markers', width: 76, tags: ['military', 'unit', 'order-of-battle'],
    kinds: ['operational', 'battle', 'region'],
  },
};

const FALLBACK: ShelfSpec = { group: 'symbols', width: 80, tags: ['symbol'], kinds: [] };

/** Run the icon's path through a transform that fits it into the box. */
function paintIcon(a: AssetDrawArgs, icon: IconPath, inset: number, fill: string): void {
  const { ctx, w, h } = a;
  const size = Math.min(w, h) * (1 - inset * 2);
  const s = size / GRID;
  ctx.save();
  ctx.translate((w - size) / 2, (h - size) / 2);
  ctx.scale(s, s);
  ctx.fillStyle = fill;
  ctx.fill(pathFor(icon), 'evenodd');
  ctx.restore();
}

/** The escutcheon behind variant 2 — a plain heater shield, drawn to the box. */
function shieldPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, rw: number, rh: number): void {
  ctx.beginPath();
  ctx.moveTo(cx - rw, cy - rh);
  ctx.lineTo(cx + rw, cy - rh);
  ctx.lineTo(cx + rw, cy + rh * 0.1);
  ctx.quadraticCurveTo(cx + rw * 0.92, cy + rh * 0.72, cx, cy + rh);
  ctx.quadraticCurveTo(cx - rw * 0.92, cy + rh * 0.72, cx - rw, cy + rh * 0.1);
  ctx.closePath();
}

function toAsset(icon: IconPath): AssetDef {
  const spec = SHELVES[icon.sub] ?? FALLBACK;
  return {
    id: icon.id,
    label: icon.label,
    group: spec.group,
    sub: icon.sub,
    tags: [...spec.tags, ...icon.label.toLowerCase().split(' '), `by:${icon.author}`],
    aspect: 1,
    defaultWidth: spec.width,
    variants: 3,
    kinds: spec.kinds.length ? spec.kinds : undefined,
    draw(a) {
      const { ctx, w, h, palette } = a;
      const cx = w / 2, cy = h / 2;
      const inkColor = a.tint ? mix(palette.ink, a.tint, a.tintStrength) : palette.ink;

      switch (a.variant % 3) {
        // Bare silhouette. What you want when the icon sits on open parchment
        // and the map's own colour should show through around it.
        case 0: {
          ctx.save();
          ctx.shadowColor = rgba('#000000', 0.35);
          ctx.shadowBlur = Math.max(1, Math.min(w, h) * 0.03);
          ctx.shadowOffsetY = Math.min(w, h) * 0.012;
          paintIcon(a, icon, 0.06, inkColor);
          ctx.restore();
          break;
        }

        // A struck medallion: the form a map legend or a hex-crawl marker wants,
        // because it stays readable over terrain of any colour.
        case 1: {
          const r = Math.min(w, h) * 0.47;
          groundShadow(ctx, cx + r * 0.08, cy + r * 0.1, r * 0.98, r * 0.94, 0.3);
          const disc = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
          disc.addColorStop(0, mix(palette.parchment, '#ffffff', 0.35));
          disc.addColorStop(1, palette.parchmentDark);
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fillStyle = disc; ctx.fill();
          ctx.strokeStyle = rgba(inkColor, 0.85);
          ctx.lineWidth = Math.max(1.5, r * 0.075);
          ctx.stroke();
          ctx.strokeStyle = rgba(inkColor, 0.35);
          ctx.lineWidth = Math.max(1, r * 0.025);
          ctx.beginPath(); ctx.arc(cx, cy, r * 0.84, 0, Math.PI * 2); ctx.stroke();
          paintIcon(a, icon, 0.26, inkColor);
          break;
        }

        // Blazoned on a shield. Tint is the field colour here, which is the
        // whole point — one charge, one stamp, a different banner per faction.
        default: {
          const rw = Math.min(w, h) * 0.42, rh = Math.min(w, h) * 0.47;
          groundShadow(ctx, cx + rw * 0.1, cy + rh * 0.12, rw, rh * 0.95, 0.3);
          const field = a.tint ? mix(palette.accent, a.tint, a.tintStrength) : palette.accent;
          const g = ctx.createLinearGradient(cx - rw, cy - rh, cx + rw, cy + rh);
          g.addColorStop(0, mix(field, '#ffffff', 0.28));
          g.addColorStop(1, mix(field, '#000000', 0.3));
          shieldPath(ctx, cx, cy, rw, rh);
          ctx.fillStyle = g; ctx.fill();
          paintIcon(a, icon, 0.3, mix(palette.parchment, '#ffffff', 0.35));
          shieldPath(ctx, cx, cy, rw, rh);
          ctx.strokeStyle = rgba(palette.ink, 0.85);
          ctx.lineWidth = Math.max(1.5, rw * 0.07);
          ctx.stroke();
          break;
        }
      }
    },
  };
}

export const ICON_ASSETS: AssetDef[] = ICON_PATHS.map(toAsset);

/** Credits for the About box, one line per upstream author. */
export function iconCredits(): { author: string; count: number }[] {
  const tally = new Map<string, number>();
  for (const i of ICON_PATHS) tally.set(i.author, (tally.get(i.author) || 0) + 1);
  return [...tally.entries()]
    .map(([author, count]) => ({ author, count }))
    .sort((a, b) => b.count - a.count || a.author.localeCompare(b.author));
}
