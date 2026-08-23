/**
 * The living and mineral world: top-down flora, ground cover and water for
 * battle-scale maps, plus pictorial side-view glyphs for region and hex maps.
 *
 * The top-down idiom (see battle.ts's canopy/tree-top) treats a plant as a
 * cluster of lit and shadowed lobes rather than a flat tinted disc — that
 * technique is generalised here (`canopyTop`, `conicalTop`) and reused across
 * a dozen species so a forest of them still reads as individual trees.
 * Streams and rapids anchor their entry/exit points to fixed tile-edge
 * midpoints so several segments can be placed edge to edge and still look
 * like one waterway.
 */
import type { AssetDef, AssetDrawArgs } from '../types';
import {
  blob, fillPath, groundShadow, inkLine, lightGradient, tracePath, hatch,
  radialGlow, roundRect, speckle,
} from '../draw';
import { mix, rgba } from '../../core/color';
import type { Vec2 } from '../../core/types';

// ---------------------------------------------------------------------------
// Shared colour helpers
// ---------------------------------------------------------------------------

const ink = (a: AssetDrawArgs) => a.palette.ink;
const tinted = (a: AssetDrawArgs, base: string) => (a.tint ? mix(base, a.tint, a.tintStrength) : base);
const leafC = (a: AssetDrawArgs) => tinted(a, a.palette.forest);
const stoneC = (a: AssetDrawArgs) => tinted(a, a.palette.rock);
const barkC = (a: AssetDrawArgs) => mix(a.palette.ink, '#6b4a2a', 0.55);

// ---------------------------------------------------------------------------
// Top-down plant idiom
// ---------------------------------------------------------------------------

interface CanopyOpts {
  clumps?: [number, number];
  clumpR?: [number, number];
  lobes?: [number, number];
  wobble?: number;
  silhouette?: string;
  silhouetteAmt?: number;
  highlight?: string;
  highlightAmt?: number;
  shadowAlpha?: number;
  outlineAlpha?: number;
}

/**
 * A plant's mass seen from directly above: a dark silhouette, a scatter of
 * lit/shadowed foliage clumps, and a small crown highlight toward the light.
 * This is battle.ts's `canopy` generalised with per-species knobs.
 */
function canopyTop(a: AssetDrawArgs, cx: number, cy: number, r: number, base: string, opts: CanopyOpts = {}): Vec2[] {
  const { ctx, rng } = a;
  const clumps = opts.clumps ?? [5, 8];
  const clumpR = opts.clumpR ?? [0.3, 0.46];
  const lobes = opts.lobes ?? [5, 7];
  groundShadow(ctx, cx + r * 0.2, cy + r * 0.22, r * 0.85, r * 0.8, opts.shadowAlpha ?? 0.24);
  const outer = blob(cx, cy, r, r * rng.float(0.92, 1.06), rng.int(7, 10), opts.wobble ?? 0.11, rng);
  fillPath(ctx, outer, mix(base, opts.silhouette ?? '#0d1c0d', opts.silhouetteAmt ?? 0.42));
  const n = rng.int(clumps[0], clumps[1]);
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + rng.float(-0.35, 0.35);
    const dist = r * rng.float(0.16, 0.46);
    const cr = r * rng.float(clumpR[0], clumpR[1]);
    const lx = cx + Math.cos(ang) * dist;
    const ly = cy + Math.sin(ang) * dist;
    const lit = (-Math.cos(ang) - Math.sin(ang)) * 0.5;
    const tone = mix(base, lit > 0 ? (opts.highlight ?? '#dbe98a') : '#0f2410', Math.abs(lit) * rng.float(0.16, 0.32));
    fillPath(ctx, blob(lx, ly, cr, cr * rng.float(0.85, 1.1), rng.int(lobes[0], lobes[1]), 0.18, rng), tone);
  }
  const inner = blob(cx - r * 0.2, cy - r * 0.22, r * 0.24, r * 0.22, rng.int(5, 7), 0.22, rng);
  fillPath(ctx, inner, mix(base, opts.highlight ?? '#cfe07a', opts.highlightAmt ?? 0.26));
  inkLine(ctx, outer, rgba(ink(a), opts.outlineAlpha ?? 0.28), Math.max(1, r * 0.035));
  return outer;
}

/** A conifer seen from above: concentric jagged rings, darkest at the rim. */
function conicalTop(a: AssetDrawArgs, cx: number, cy: number, r: number, base: string, tierCount = 4): void {
  const { ctx, rng } = a;
  groundShadow(ctx, cx + r * 0.16, cy + r * 0.18, r * 0.9, r * 0.9, 0.32);
  for (let ring = tierCount - 1; ring >= 0; ring--) {
    const rr = r * (0.3 + (ring / (tierCount - 1)) * 0.68);
    const spikes = 8 + ring * 3 + rng.int(-1, 2);
    const phase = rng.float(0, Math.PI * 2);
    const pts: Vec2[] = [];
    for (let i = 0; i < spikes; i++) {
      const a0 = (i / spikes) * Math.PI * 2 + phase;
      const a1 = ((i + 0.5) / spikes) * Math.PI * 2 + phase;
      const tip = rr * rng.float(0.86, 1.1);
      const notch = rr * rng.float(0.6, 0.76);
      const drift = rng.float(-0.06, 0.06);
      pts.push({ x: cx + Math.cos(a0 + drift) * tip, y: cy + Math.sin(a0 + drift) * tip });
      pts.push({ x: cx + Math.cos(a1) * notch, y: cy + Math.sin(a1) * notch });
    }
    const isRim = ring === tierCount - 1;
    fillPath(ctx, pts, mix(base, isRim ? '#08150f' : '#a8cf72', isRim ? 0.35 : (tierCount - 1 - ring) * (0.32 / tierCount)));
  }
  ctx.fillStyle = mix(base, '#c8e08a', 0.35);
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.09, 0, Math.PI * 2); ctx.fill();
}

/** Recursive radiating branch, used for bare trees / root tangles. */
function radiateBranch(
  ctx: CanvasRenderingContext2D, rng: AssetDrawArgs['rng'],
  x: number, y: number, ang: number, len: number, width: number, depth: number, color: string,
): void {
  if (depth <= 0 || len < 2) return;
  const ex = x + Math.cos(ang) * len;
  const ey = y + Math.sin(ang) * len;
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y);
  ctx.quadraticCurveTo(
    x + Math.cos(ang + rng.float(-0.3, 0.3)) * len * 0.5,
    y + Math.sin(ang + rng.float(-0.3, 0.3)) * len * 0.5,
    ex, ey,
  );
  ctx.stroke();
  radiateBranch(ctx, rng, ex, ey, ang - rng.float(0.25, 0.55), len * rng.float(0.6, 0.78), width * 0.66, depth - 1, color);
  radiateBranch(ctx, rng, ex, ey, ang + rng.float(0.25, 0.55), len * rng.float(0.6, 0.78), width * 0.66, depth - 1, color);
}

// ---------------------------------------------------------------------------
// Ground patch idiom (rock & ground shelf)
// ---------------------------------------------------------------------------

/** A blobby patch of ground filling most of the box; returns its outline. */
function groundPatch(a: AssetDrawArgs, color: string | CanvasGradient, opts: { lobes?: number; wobble?: number; outlineAlpha?: number; outline?: string } = {}): Vec2[] {
  const { ctx, w, h, rng } = a;
  const cx = w * 0.5, cy = h * 0.5, rx = w * 0.46, ry = h * 0.44;
  const pts = blob(cx, cy, rx, ry, opts.lobes ?? rng.int(6, 9), opts.wobble ?? 0.14, rng);
  fillPath(ctx, pts, color);
  inkLine(ctx, pts, rgba(opts.outline ?? ink(a), opts.outlineAlpha ?? 0.3), Math.max(1, w * 0.012));
  return pts;
}

// ---------------------------------------------------------------------------
// Water idiom (top-down): pools and tileable bands
// ---------------------------------------------------------------------------

/** A still body of water: gradient fill, dark rim, no flow. */
function waterPool(a: AssetDrawArgs, opts: { rx?: number; ry?: number; shore?: string; frozen?: boolean } = {}): Vec2[] {
  const { ctx, w, h, rng } = a;
  const cx = w * 0.5, cy = h * 0.5;
  const rx = opts.rx ?? w * 0.42, ry = opts.ry ?? h * 0.4;
  if (opts.shore) {
    const rim = blob(cx, cy, rx * 1.16, ry * 1.16, rng.int(6, 8), 0.12, rng);
    fillPath(ctx, rim, opts.shore);
  }
  const pts = blob(cx, cy, rx, ry, rng.int(6, 8), 0.13, rng);
  const deep = opts.frozen ? mix(a.palette.shallowWater, '#ffffff', 0.4) : a.palette.deepWater;
  const shallow = opts.frozen ? mix(a.palette.shallowWater, '#ffffff', 0.6) : a.palette.shallowWater;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
  g.addColorStop(0, shallow);
  g.addColorStop(0.55, mix(shallow, deep, 0.5));
  g.addColorStop(1, deep);
  fillPath(ctx, pts, g);
  inkLine(ctx, pts, rgba(deep, 0.55), Math.max(1, w * 0.01));
  return pts;
}

type Edge = 'L' | 'R' | 'T' | 'B';
const EDGE_PAIRS: [Edge, Edge][] = [['L', 'R'], ['T', 'B'], ['L', 'B'], ['T', 'R']];

function edgePoint(e: Edge, w: number, h: number): Vec2 {
  if (e === 'L') return { x: 0, y: h * 0.5 };
  if (e === 'R') return { x: w, y: h * 0.5 };
  if (e === 'T') return { x: w * 0.5, y: 0 };
  return { x: w * 0.5, y: h };
}

/** The direction, along the tile edge itself, that a flow's width extends. */
function edgeAlong(e: Edge): Vec2 {
  return (e === 'L' || e === 'R') ? { x: 0, y: 1 } : { x: 1, y: 0 };
}

/**
 * Centreline plus left/right banks for a flow crossing from one tile edge to
 * another. The width vector at each end is locked to the edge's own
 * direction (not the meandering curve's tangent) and its magnitude is a pure
 * function of `w`/`h` — so two independently-seeded segments that share an
 * edge and a half-width fraction butt up against each other cleanly.
 */
function flowBand(a: AssetDrawArgs, edgeA: Edge, edgeB: Edge, halfWidthFrac: number): { left: Vec2[]; right: Vec2[]; center: Vec2[] } {
  const { w, h, rng } = a;
  const pA = edgePoint(edgeA, w, h);
  const pB = edgePoint(edgeB, w, h);
  const mid: Vec2 = {
    x: (pA.x + pB.x) / 2 + rng.gauss(0, w * 0.1),
    y: (pA.y + pB.y) / 2 + rng.gauss(0, h * 0.1),
  };
  const n = 14;
  const center: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = (1 - t) * (1 - t) * pA.x + 2 * (1 - t) * t * mid.x + t * t * pB.x;
    const y = (1 - t) * (1 - t) * pA.y + 2 * (1 - t) * t * mid.y + t * t * pB.y;
    center.push({ x, y });
  }
  const hw = Math.min(w, h) * halfWidthFrac;
  const left: Vec2[] = [], right: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const p = center[i];
    let nx: number, ny: number;
    if (i === 0) { const t0 = edgeAlong(edgeA); nx = t0.x; ny = t0.y; }
    else if (i === n) { const t1 = edgeAlong(edgeB); nx = t1.x; ny = t1.y; }
    else {
      const prev = center[i - 1], next = center[i + 1];
      const dx = next.x - prev.x, dy = next.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      nx = -dy / len; ny = dx / len;
    }
    const t = i / n;
    const bulge = 1 + Math.sin(t * Math.PI) * rng.float(0.05, 0.24);
    const width = hw * bulge;
    left.push({ x: p.x + nx * width, y: p.y + ny * width });
    right.push({ x: p.x - nx * width, y: p.y - ny * width });
  }
  return { left, right, center };
}

// ===========================================================================
// Trees (top-down)
// ===========================================================================

const TREES_TOP: AssetDef[] = [
  {
    id: 'nat/oak-canopy-top', label: 'Oak Canopy (top-down)', group: 'vegetation', sub: 'Trees (top-down)',
    tags: ['tree', 'oak', 'canopy', 'broadleaf'], aspect: 1, defaultWidth: 220, variants: 4,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const r = Math.min(a.w, a.h) * (0.42 + (a.variant % 4) * 0.02);
      canopyTop(a, a.w / 2, a.h / 2, r, leafC(a), { clumps: [6 + (a.variant % 4), 9 + (a.variant % 4)], lobes: [5, 8] });
    },
  },
  {
    id: 'nat/birch-canopy-top', label: 'Birch Canopy (top-down)', group: 'vegetation', sub: 'Trees (top-down)',
    tags: ['tree', 'birch', 'canopy'], aspect: 1, defaultWidth: 150, variants: 3,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const base = tinted(a, mix(a.palette.forest, '#c9d98a', 0.4));
      const r = Math.min(w, h) * 0.42;
      canopyTop(a, w / 2, h / 2, r, base, { clumps: [7, 10], clumpR: [0.22, 0.34], lobes: [5, 7], wobble: 0.16, highlight: '#eef3c0' });
      // Pale bark flecks glimpsed through gaps in the sparse crown.
      const n = 3 + (a.variant % 3);
      for (let i = 0; i < n; i++) {
        const ang = rng.float(0, Math.PI * 2), d = r * rng.float(0, 0.3);
        ctx.strokeStyle = rgba('#f2ede0', 0.5);
        ctx.lineWidth = Math.max(1, r * 0.03);
        ctx.beginPath();
        ctx.moveTo(w / 2 + Math.cos(ang) * d, h / 2 + Math.sin(ang) * d);
        ctx.lineTo(w / 2 + Math.cos(ang) * (d + r * 0.08), h / 2 + Math.sin(ang) * (d + r * 0.08));
        ctx.stroke();
      }
    },
  },
  {
    id: 'nat/willow-canopy-top', label: 'Willow Canopy (top-down)', group: 'vegetation', sub: 'Trees (top-down)',
    tags: ['tree', 'willow', 'drooping', 'water'], aspect: 1, defaultWidth: 190, variants: 3,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const base = tinted(a, mix(a.palette.forest, '#8fae4a', 0.3));
      const r = Math.min(w, h) * 0.36;
      const cx = w / 2, cy = h / 2;
      // Trailing fronds sweep out past the canopy edge before the mass itself,
      // so the drooping strands read as underneath the leaves.
      const strands = 14 + (a.variant % 3) * 3;
      for (let i = 0; i < strands; i++) {
        const ang = (i / strands) * Math.PI * 2 + rng.float(-0.08, 0.08);
        const len = r * rng.float(1.15, 1.5);
        const sx = cx + Math.cos(ang) * r * 0.5, sy = cy + Math.sin(ang) * r * 0.5;
        const ex = cx + Math.cos(ang) * len, ey = cy + Math.sin(ang) * len;
        const midx = cx + Math.cos(ang) * len * 0.85, midy = cy + Math.sin(ang) * len * 0.85;
        ctx.strokeStyle = rgba(mix(base, '#0f2410', 0.3), 0.7);
        ctx.lineWidth = Math.max(1, r * 0.03);
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(midx, midy, ex, ey); ctx.stroke();
      }
      canopyTop(a, cx, cy, r, base, { clumps: [6, 8], lobes: [5, 7], wobble: 0.14, silhouetteAmt: 0.36 });
    },
  },
  {
    id: 'nat/conifer-top', label: 'Spruce / Fir (top-down)', group: 'vegetation', sub: 'Trees (top-down)',
    tags: ['tree', 'conifer', 'spruce', 'fir', 'pine'], aspect: 1, defaultWidth: 150, variants: 4,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const base = mix(leafC(a), '#154a30', 0.4);
      conicalTop(a, a.w / 2, a.h / 2, Math.min(a.w, a.h) * 0.46, base, 3 + (a.variant % 3));
    },
  },
  {
    id: 'nat/dead-tree-top', label: 'Dead Tree (top-down)', group: 'vegetation', sub: 'Trees (top-down)',
    tags: ['tree', 'bare', 'dead', 'blighted'], aspect: 1, defaultWidth: 160, variants: 3,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const cx = w / 2, cy = h / 2;
      groundShadow(ctx, cx, cy, w * 0.3, h * 0.28, 0.26);
      const col = mix(a.palette.ink, '#6b5a49', 0.5);
      const arms = 5 + (a.variant % 3);
      const r = Math.min(w, h) * 0.4;
      for (let i = 0; i < arms; i++) {
        const ang = (i / arms) * Math.PI * 2 + rng.float(-0.2, 0.2);
        radiateBranch(ctx, rng, cx, cy, ang, r * rng.float(0.5, 0.7), Math.max(2, w * 0.045), 3, col);
      }
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(cx, cy, w * 0.05, 0, Math.PI * 2); ctx.fill();
    },
  },
  {
    id: 'nat/palm-top', label: 'Palm (top-down)', group: 'vegetation', sub: 'Trees (top-down)',
    tags: ['tree', 'palm', 'tropical', 'beach'], aspect: 1, defaultWidth: 170, variants: 3,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.44;
      groundShadow(ctx, cx + r * 0.1, cy + r * 0.12, r * 0.9, r * 0.85, 0.26);
      const base = mix(leafC(a), '#3f8f4a', 0.35);
      const fronds = 7 + (a.variant % 3);
      for (let i = 0; i < fronds; i++) {
        const ang = (i / fronds) * Math.PI * 2 + rng.float(-0.15, 0.15);
        const len = r * rng.float(0.85, 1.05);
        const tipx = cx + Math.cos(ang) * len, tipy = cy + Math.sin(ang) * len;
        const perp = ang + Math.PI / 2;
        const bw = r * rng.float(0.1, 0.16);
        const pts: Vec2[] = [
          { x: cx, y: cy },
          { x: cx + Math.cos(ang) * len * 0.5 + Math.cos(perp) * bw, y: cy + Math.sin(ang) * len * 0.5 + Math.sin(perp) * bw },
          { x: tipx, y: tipy },
          { x: cx + Math.cos(ang) * len * 0.5 - Math.cos(perp) * bw, y: cy + Math.sin(ang) * len * 0.5 - Math.sin(perp) * bw },
        ];
        const lit = (-Math.cos(ang) - Math.sin(ang)) * 0.5;
        fillPath(ctx, pts, mix(base, lit > 0 ? '#cfe07a' : '#123a1e', Math.abs(lit) * 0.3));
        inkLine(ctx, pts, rgba(ink(a), 0.25), Math.max(1, r * 0.02), true);
      }
      ctx.fillStyle = mix(barkC(a), '#8a6b3e', 0.4);
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.14, 0, Math.PI * 2); ctx.fill();
    },
  },
  {
    id: 'nat/maple-autumn-top', label: 'Autumn Maple (top-down)', group: 'vegetation', sub: 'Trees (top-down)',
    tags: ['tree', 'maple', 'autumn', 'fall'], aspect: 1, defaultWidth: 200, variants: 3,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const palette = ['#c0522a', '#d98a2b', '#e0b23a'];
      const pick = palette[a.variant % palette.length];
      const base = tinted(a, mix(a.palette.forest, pick, 0.72));
      canopyTop(a, a.w / 2, a.h / 2, Math.min(a.w, a.h) * 0.44, base, {
        clumps: [6, 9], lobes: [5, 8], silhouette: '#3a1a10', silhouetteAmt: 0.38, highlight: '#f5d98a', highlightAmt: 0.4,
      });
    },
  },
  {
    id: 'nat/blossom-tree-top', label: 'Blossoming Tree (top-down)', group: 'vegetation', sub: 'Trees (top-down)',
    tags: ['tree', 'blossom', 'orchard', 'spring'], aspect: 1, defaultWidth: 180, variants: 3,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, rng } = a;
      const bloom = a.variant % 2 === 0 ? '#f4c6d8' : '#f7ede2';
      const base = mix(leafC(a), '#3f7a3a', 0.35);
      const r = Math.min(a.w, a.h) * 0.42;
      const outer = canopyTop(a, a.w / 2, a.h / 2, r, base, { clumps: [6, 8], highlight: '#e9f0a0' });
      // Blossom clusters scattered over the canopy.
      const cx = a.w / 2, cy = a.h / 2;
      const clusters = rng.int(10, 16);
      for (let i = 0; i < clusters; i++) {
        const ang = rng.float(0, Math.PI * 2), d = r * rng.float(0, 0.85);
        const px = cx + Math.cos(ang) * d, py = cy + Math.sin(ang) * d;
        ctx.fillStyle = rgba(bloom, rng.float(0.6, 0.9));
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          ctx.arc(px + rng.float(-r * 0.06, r * 0.06), py + rng.float(-r * 0.06, r * 0.06), r * rng.float(0.035, 0.07), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      inkLine(ctx, outer, rgba(ink(a), 0.2), Math.max(1, r * 0.03));
    },
  },
  {
    id: 'nat/jungle-canopy-top', label: 'Jungle Canopy (top-down)', group: 'vegetation', sub: 'Trees (top-down)',
    tags: ['tree', 'jungle', 'rainforest', 'canopy', 'vines'], aspect: 1, defaultWidth: 220, variants: 3,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, rng } = a;
      const base = mix(leafC(a), '#0e5c33', 0.4);
      const r = Math.min(a.w, a.h) * 0.48;
      const cx = a.w / 2, cy = a.h / 2;
      canopyTop(a, cx, cy, r, base, { clumps: [8, 11], clumpR: [0.28, 0.44], lobes: [6, 8], wobble: 0.16, shadowAlpha: 0.3 });
      // A few vine tendrils curling off the rim.
      const vines = 3 + (a.variant % 3);
      for (let i = 0; i < vines; i++) {
        const ang = rng.float(0, Math.PI * 2);
        let x = cx + Math.cos(ang) * r * 0.92, y = cy + Math.sin(ang) * r * 0.92;
        const pts: Vec2[] = [{ x, y }];
        for (let k = 0; k < 4; k++) {
          x += rng.float(-r * 0.08, r * 0.08);
          y += rng.float(-r * 0.08, r * 0.08);
          pts.push({ x, y });
        }
        inkLine(ctx, pts, rgba(mix(base, '#052a14', 0.4), 0.75), Math.max(1, r * 0.02));
      }
    },
  },
  {
    id: 'nat/mangrove-top', label: 'Mangrove (top-down)', group: 'vegetation', sub: 'Trees (top-down)',
    tags: ['tree', 'mangrove', 'swamp', 'roots', 'coast'], aspect: 1, defaultWidth: 200, variants: 3,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.3;
      const waterR = Math.min(w, h) * 0.48;
      // Shallow water the tree stands in.
      fillPath(ctx, blob(cx, cy, waterR, waterR * 0.95, 7, 0.1, rng), rgba(a.palette.shallowWater, 0.55));
      // Prop roots radiating from the trunk out toward the waterline.
      const legs = 6 + (a.variant % 3) * 2;
      for (let i = 0; i < legs; i++) {
        const ang = (i / legs) * Math.PI * 2 + rng.float(-0.15, 0.15);
        const len = waterR * rng.float(0.7, 0.95);
        const midx = cx + Math.cos(ang) * len * 0.5, midy = cy + Math.sin(ang) * len * 0.5;
        const ex = cx + Math.cos(ang) * len, ey = cy + Math.sin(ang) * len;
        ctx.strokeStyle = rgba(barkC(a), 0.85);
        ctx.lineWidth = Math.max(1.2, w * 0.014);
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.quadraticCurveTo(midx, midy - h * 0.02, ex, ey); ctx.stroke();
      }
      canopyTop(a, cx, cy, r, mix(leafC(a), '#0e5c33', 0.3), { clumps: [5, 7], lobes: [5, 7] });
    },
  },
  {
    id: 'nat/hollow-trunk-top', label: 'Ancient Hollow Trunk (top-down)', group: 'vegetation', sub: 'Trees (top-down)',
    tags: ['tree', 'hollow', 'ancient', 'stump'], aspect: 1, defaultWidth: 130, variants: 2,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const cx = w / 2, cy = h / 2;
      const rOut = Math.min(w, h) * 0.44, rIn = rOut * (a.variant % 2 === 0 ? 0.48 : 0.36);
      groundShadow(ctx, cx, cy, rOut * 0.95, rOut * 0.9, 0.32);
      const outer = blob(cx, cy, rOut, rOut * 0.94, 7, 0.14, rng);
      const inner = blob(cx, cy, rIn, rIn * 0.9, 6, 0.18, rng);
      ctx.save();
      ctx.fillStyle = lightGradient(ctx, cx - rOut, cy - rOut, cx + rOut, cy + rOut, barkC(a), 0.3, 0.3);
      tracePath(ctx, outer, true);
      tracePath(ctx, inner, true);
      ctx.fill('evenodd');
      ctx.restore();
      // Moss speckle on the sunlit side of the bark ring.
      speckle(ctx, cx - rOut, cy - rOut, rOut, rOut, 30, rgba('#8fae4a', 0.4), 1, w * 0.012, rng);
      fillPath(ctx, inner, mix(a.palette.ink, '#000000', 0.5));
      inkLine(ctx, outer, rgba(ink(a), 0.6), Math.max(1, w * 0.014));
      inkLine(ctx, inner, rgba(ink(a), 0.55), Math.max(1, w * 0.012));
    },
  },
  {
    id: 'nat/fallen-tree-top', label: 'Fallen Tree (top-down)', group: 'vegetation', sub: 'Trees (top-down)',
    tags: ['tree', 'fallen', 'log', 'deadfall'], aspect: 1.8, defaultWidth: 220, variants: 3,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const flip = a.variant % 2 === 1;
      const x0 = flip ? w * 0.86 : w * 0.14, y0 = h * 0.5 + rng.float(-h * 0.05, h * 0.05);
      const x1 = flip ? w * 0.22 : w * 0.78, y1 = h * 0.5 + rng.float(-h * 0.05, h * 0.05);
      const trunkW = h * 0.24;
      groundShadow(ctx, (x0 + x1) / 2, (y0 + y1) / 2 + trunkW * 0.3, w * 0.4, h * 0.22, 0.28);
      const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const log: Vec2[] = [
        { x: x0 + nx * trunkW * 0.5, y: y0 + ny * trunkW * 0.5 },
        { x: x1 + nx * trunkW * 0.42, y: y1 + ny * trunkW * 0.42 },
        { x: x1 - nx * trunkW * 0.42, y: y1 - ny * trunkW * 0.42 },
        { x: x0 - nx * trunkW * 0.5, y: y0 - ny * trunkW * 0.5 },
      ];
      fillPath(ctx, log, lightGradient(ctx, x0, y0 - trunkW, x1, y1 + trunkW, barkC(a), 0.28, 0.32));
      inkLine(ctx, log, rgba(ink(a), 0.6), Math.max(1, w * 0.01));
      // Bark rings across the log.
      ctx.save(); tracePath(ctx, log, true); ctx.clip();
      const rings = 5 + (a.variant % 3);
      for (let i = 1; i < rings; i++) {
        const t = i / rings;
        const px = x0 + dx * t, py = y0 + dy * t;
        ctx.strokeStyle = rgba(ink(a), 0.22); ctx.lineWidth = Math.max(1, trunkW * 0.05);
        ctx.beginPath(); ctx.moveTo(px + nx * trunkW * 0.5, py + ny * trunkW * 0.5); ctx.lineTo(px - nx * trunkW * 0.5, py - ny * trunkW * 0.5); ctx.stroke();
      }
      ctx.restore();
      // Root plate at the raised end.
      const plateAt = flip ? { x: x1, y: y1 } : { x: x0, y: y0 };
      const plate = blob(plateAt.x + (flip ? -1 : 1) * trunkW * 0.3, plateAt.y, trunkW * 1.1, trunkW * 1.3, 6, 0.22, rng);
      fillPath(ctx, plate, mix(barkC(a), '#4a3626', 0.4));
      inkLine(ctx, plate, rgba(ink(a), 0.55), Math.max(1, w * 0.01));
      for (let i = 0; i < 6; i++) {
        const ang = rng.float(-1.4, 1.4) + (flip ? Math.PI : 0);
        const rl = trunkW * rng.float(0.6, 1.1);
        radiateBranch(ctx, rng, plateAt.x, plateAt.y, ang, rl, Math.max(1, w * 0.012), 2, mix(barkC(a), '#2a1e14', 0.4));
      }
      // Moss and fern speckle along the top of the log.
      speckle(ctx, Math.min(x0, x1), y0 - trunkW * 0.4, len, trunkW * 0.8, 18, rgba('#6f9a4a', 0.35), 1, w * 0.01, rng);
    },
  },
];

// ===========================================================================
// Undergrowth (top-down)
// ===========================================================================

const UNDERGROWTH_TOP: AssetDef[] = [
  {
    id: 'nat/bramble-thicket-top', label: 'Bramble Thicket (top-down)', group: 'vegetation', sub: 'Undergrowth (top-down)',
    tags: ['bramble', 'thicket', 'thorns', 'difficult terrain'], aspect: 1.1, defaultWidth: 90, variants: 3,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const base = mix(a.palette.forest, '#3a2a1a', 0.4);
      const pts = groundPatch(a, mix(base, '#000000', 0.15), { wobble: 0.2, outlineAlpha: 0.35 });
      ctx.save(); tracePath(ctx, pts, true); ctx.clip();
      const tangles = 10 + (a.variant % 3) * 3;
      for (let i = 0; i < tangles; i++) {
        const cx = w * rng.float(0.15, 0.85), cy = h * rng.float(0.15, 0.85);
        const r = w * rng.float(0.08, 0.16);
        const knot = blob(cx, cy, r, r * 0.85, rng.int(5, 7), 0.3, rng);
        fillPath(ctx, knot, mix(base, rng.bool() ? '#4a3a20' : '#0d1c0d', rng.float(0.1, 0.3)));
        // Thorn ticks.
        for (let k = 0; k < 3; k++) {
          const ang = rng.float(0, Math.PI * 2);
          ctx.strokeStyle = rgba(ink(a), 0.5); ctx.lineWidth = Math.max(1, w * 0.008);
          ctx.beginPath(); ctx.moveTo(cx + Math.cos(ang) * r * 0.8, cy + Math.sin(ang) * r * 0.8);
          ctx.lineTo(cx + Math.cos(ang) * r * 1.15, cy + Math.sin(ang) * r * 1.15); ctx.stroke();
        }
      }
      ctx.restore();
    },
  },
  {
    id: 'nat/fern-cluster-top', label: 'Fern Cluster (top-down)', group: 'vegetation', sub: 'Undergrowth (top-down)',
    tags: ['fern', 'forest floor'], aspect: 1, defaultWidth: 70, variants: 3,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const base = mix(a.palette.forest, '#7fa958', 0.35);
      groundShadow(ctx, w * 0.5, h * 0.56, w * 0.36, h * 0.24, 0.2);
      const clusters = 2 + (a.variant % 3);
      for (let c = 0; c < clusters; c++) {
        const bx = w * rng.float(0.3, 0.7), by = h * rng.float(0.4, 0.62);
        const fronds = rng.int(5, 8);
        for (let i = 0; i < fronds; i++) {
          const ang = -Math.PI / 2 + (i / fronds - 0.5) * Math.PI * 1.3 + rng.float(-0.1, 0.1);
          const len = w * rng.float(0.22, 0.34);
          const tipx = bx + Math.cos(ang) * len, tipy = by + Math.sin(ang) * len;
          ctx.strokeStyle = rgba(base, 0.9); ctx.lineWidth = Math.max(1, w * 0.012); ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx + Math.cos(ang) * len * 0.5, by + Math.sin(ang) * len * 0.5, tipx, tipy); ctx.stroke();
          const leaflets = 6;
          for (let k = 1; k <= leaflets; k++) {
            const t = k / (leaflets + 1);
            const px = bx + (tipx - bx) * t, py = by + (tipy - by) * t;
            const perp = ang + Math.PI / 2;
            const ll = len * 0.16 * (1 - t * 0.5);
            ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(perp) * ll, py + Math.sin(perp) * ll);
            ctx.moveTo(px, py); ctx.lineTo(px - Math.cos(perp) * ll, py - Math.sin(perp) * ll);
            ctx.lineWidth = Math.max(0.8, w * 0.006); ctx.stroke();
          }
        }
      }
    },
  },
  {
    id: 'nat/flower-meadow-top', label: 'Flower Meadow Patch (top-down)', group: 'vegetation', sub: 'Undergrowth (top-down)',
    tags: ['flowers', 'meadow', 'wildflowers'], aspect: 1.2, defaultWidth: 100, variants: 3,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      groundPatch(a, mix(a.palette.grass, '#9cc06a', 0.3), { outlineAlpha: 0.18 });
      const hues = ['#e8577a', '#f2c94c', '#ffffff', '#9b6bd8', '#f0956a'];
      const n = 16 + (a.variant % 3) * 6;
      for (let i = 0; i < n; i++) {
        const x = w * rng.float(0.14, 0.86), y = h * rng.float(0.14, 0.86);
        const c = rng.pick(hues);
        const petals = rng.int(4, 6);
        const pr = w * rng.float(0.02, 0.032);
        for (let p = 0; p < petals; p++) {
          const ang = (p / petals) * Math.PI * 2;
          ctx.fillStyle = rgba(c, 0.85);
          ctx.beginPath(); ctx.ellipse(x + Math.cos(ang) * pr, y + Math.sin(ang) * pr, pr * 0.8, pr * 0.5, ang, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = rgba('#f2c94c', 0.9);
        ctx.beginPath(); ctx.arc(x, y, pr * 0.4, 0, Math.PI * 2); ctx.fill();
      }
    },
  },
  {
    id: 'nat/tall-grass-clump-top', label: 'Tall Grass Clump (top-down)', group: 'vegetation', sub: 'Undergrowth (top-down)',
    tags: ['grass', 'clump', 'difficult terrain'], aspect: 1, defaultWidth: 60, variants: 3,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const c = mix(a.palette.grass, '#7fa958', 0.4);
      const mass = blob(w / 2, h / 2, w * 0.4, h * 0.38, rng.int(6, 8), 0.2, rng);
      fillPath(ctx, mass, rgba(mix(c, '#2c4a20', 0.4), 0.35));
      ctx.save(); tracePath(ctx, mass, true); ctx.clip();
      const blades = 14 + (a.variant % 3) * 5;
      ctx.lineCap = 'round';
      for (let i = 0; i < blades; i++) {
        const x = w * rng.float(0.2, 0.8), y = h * rng.float(0.2, 0.8);
        const len = h * rng.float(0.2, 0.36);
        const bend = rng.float(-w * 0.08, w * 0.08);
        ctx.strokeStyle = rgba(c, rng.float(0.6, 1)); ctx.lineWidth = Math.max(1, w * 0.02);
        ctx.beginPath(); ctx.moveTo(x, y + len * 0.4); ctx.quadraticCurveTo(x + bend * 0.5, y - len * 0.2, x + bend, y - len * 0.6); ctx.stroke();
      }
      ctx.restore();
    },
  },
  {
    id: 'nat/reed-bed-top', label: 'Reed Bed (top-down)', group: 'vegetation', sub: 'Undergrowth (top-down)',
    tags: ['reeds', 'marsh', 'wetland'], aspect: 1.3, defaultWidth: 100, variants: 3,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      fillPath(ctx, blob(w * 0.5, h * 0.5, w * 0.46, h * 0.42, 6, 0.16, rng), rgba(a.palette.shallowWater, 0.4));
      const c = mix(a.palette.swamp, '#8a7a3a', 0.4);
      const n = 20 + (a.variant % 3) * 8;
      for (let i = 0; i < n; i++) {
        const x = w * rng.float(0.12, 0.88), y = h * rng.float(0.55, 0.85);
        const len = h * rng.float(0.4, 0.7);
        const bend = rng.float(-w * 0.05, w * 0.05);
        ctx.strokeStyle = rgba(c, rng.float(0.65, 1)); ctx.lineWidth = Math.max(1, w * 0.012); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + bend * 0.5, y - len * 0.6, x + bend, y - len); ctx.stroke();
      }
    },
  },
  {
    id: 'nat/heather-top', label: 'Heather (top-down)', group: 'vegetation', sub: 'Undergrowth (top-down)',
    tags: ['heather', 'moor', 'scrub'], aspect: 1.2, defaultWidth: 70, variants: 2,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const base = mix(a.palette.highland, '#6a5a7a', 0.35);
      const pts = groundPatch(a, lightGradient(ctx, 0, 0, w, h, base, 0.26, 0.24), { wobble: 0.18, outlineAlpha: 0.22 });
      ctx.save(); tracePath(ctx, pts, true); ctx.clip();
      speckle(ctx, 0, 0, w, h, 60 + (a.variant % 2) * 30, rgba('#b98ac9', 0.55), 1, w * 0.02, rng);
      speckle(ctx, 0, 0, w, h, 20, rgba('#7a5a8a', 0.4), 1, w * 0.014, rng);
      ctx.restore();
    },
  },
  {
    id: 'nat/thorn-bush-top', label: 'Thorn Bush (top-down)', group: 'vegetation', sub: 'Undergrowth (top-down)',
    tags: ['thorn', 'bush', 'shrub'], aspect: 1, defaultWidth: 70, variants: 2,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const base = mix(a.palette.forest, '#4a5a2a', 0.4);
      const r = Math.min(w, h) * 0.4;
      const outer = canopyTop(a, w / 2, h / 2, r, base, { clumps: [4, 6], lobes: [5, 6], wobble: 0.2 });
      const spikes = 10 + (a.variant % 2) * 4;
      for (let i = 0; i < spikes; i++) {
        const t = i / spikes;
        const idx = Math.floor(t * outer.length);
        const p = outer[idx];
        const ang = Math.atan2(p.y - h / 2, p.x - w / 2);
        ctx.strokeStyle = rgba(ink(a), 0.55); ctx.lineWidth = Math.max(1, w * 0.01);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(ang) * r * 0.2, p.y + Math.sin(ang) * r * 0.2); ctx.stroke();
      }
    },
  },
  {
    id: 'nat/berry-bush-top', label: 'Berry Bush (top-down)', group: 'vegetation', sub: 'Undergrowth (top-down)',
    tags: ['berries', 'bush', 'food'], aspect: 1, defaultWidth: 70, variants: 3,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, rng } = a;
      const berry = a.variant % 3 === 0 ? '#8a2a4a' : a.variant % 3 === 1 ? '#2a2a5a' : '#c0472a';
      const outer = canopyTop(a, a.w / 2, a.h / 2, Math.min(a.w, a.h) * 0.4, mix(a.palette.forest, a.palette.grass, 0.4), { clumps: [4, 6] });
      const clusters = rng.int(4, 7);
      const cx = a.w / 2, cy = a.h / 2, r = Math.min(a.w, a.h) * 0.36;
      for (let c = 0; c < clusters; c++) {
        const ang = rng.float(0, Math.PI * 2), d = r * rng.float(0.1, 0.75);
        const bx = cx + Math.cos(ang) * d, by = cy + Math.sin(ang) * d;
        for (let k = 0; k < rng.int(3, 5); k++) {
          ctx.fillStyle = rgba(berry, rng.float(0.75, 1));
          ctx.beginPath(); ctx.arc(bx + rng.float(-r * 0.06, r * 0.06), by + rng.float(-r * 0.06, r * 0.06), r * 0.045, 0, Math.PI * 2); ctx.fill();
        }
      }
      inkLine(ctx, outer, rgba(ink(a), 0.2), Math.max(1, r * 0.03));
    },
  },
  {
    id: 'nat/cattails-top', label: 'Cattails (top-down)', group: 'vegetation', sub: 'Undergrowth (top-down)',
    tags: ['cattails', 'marsh', 'wetland'], aspect: 1, defaultWidth: 70, variants: 2,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      fillPath(ctx, blob(w * 0.5, h * 0.6, w * 0.4, h * 0.3, 6, 0.16, rng), rgba(a.palette.shallowWater, 0.4));
      const n = 5 + (a.variant % 2) * 2;
      for (let i = 0; i < n; i++) {
        const x = w * rng.float(0.25, 0.75);
        const groundY = h * rng.float(0.62, 0.78);
        const headY = h * rng.float(0.18, 0.3);
        ctx.strokeStyle = mix(a.palette.swamp, '#3a5a2a', 0.3); ctx.lineWidth = Math.max(1, w * 0.014); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, groundY); ctx.quadraticCurveTo(x + rng.float(-w * 0.03, w * 0.03), (groundY + headY) / 2, x, headY); ctx.stroke();
        ctx.fillStyle = mix('#5a3a1a', '#2a1a0a', 0.2);
        ctx.beginPath(); ctx.ellipse(x, headY - h * 0.06, w * 0.025, h * 0.07, 0, 0, Math.PI * 2); ctx.fill();
      }
    },
  },
  {
    id: 'nat/moss-patch-top', label: 'Moss Patch (top-down)', group: 'vegetation', sub: 'Undergrowth (top-down)',
    tags: ['moss', 'lichen', 'damp'], aspect: 1.1, defaultWidth: 60, variants: 2,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const base = mix(a.palette.forest, '#8fae4a', 0.55);
      const pts = groundPatch(a, base, { wobble: 0.24, outlineAlpha: 0.12 });
      ctx.save(); tracePath(ctx, pts, true); ctx.clip();
      speckle(ctx, 0, 0, w, h, 40 + (a.variant % 2) * 20, rgba('#4a6a2a', 0.3), 1, w * 0.02, rng);
      speckle(ctx, 0, 0, w, h, 20, rgba('#c8e08a', 0.35), 1, w * 0.012, rng);
      ctx.restore();
    },
  },
  {
    id: 'nat/root-tangle-top', label: 'Root Tangle (top-down)', group: 'vegetation', sub: 'Undergrowth (top-down)',
    tags: ['roots', 'forest floor'], aspect: 1.2, defaultWidth: 80, variants: 2,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      groundPatch(a, mix(a.palette.lowland, '#5a4a34', 0.4), { outlineAlpha: 0.15, wobble: 0.1 });
      const strands = 5 + (a.variant % 2) * 2;
      for (let i = 0; i < strands; i++) {
        let x = w * rng.float(0.1, 0.4), y = h * rng.float(0.1, 0.4);
        const pts: Vec2[] = [{ x, y }];
        for (let k = 0; k < 4; k++) {
          x += w * rng.float(0.1, 0.24); y += h * rng.float(0.08, 0.2);
          pts.push({ x, y });
        }
        inkLine(ctx, pts, rgba(barkC(a), 0.7), Math.max(1, w * rng.float(0.015, 0.03)));
      }
    },
  },
  {
    id: 'nat/leaf-litter-top', label: 'Leaf Litter (top-down)', group: 'vegetation', sub: 'Undergrowth (top-down)',
    tags: ['leaves', 'forest floor', 'autumn'], aspect: 1.2, defaultWidth: 80, variants: 3,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const pts = groundPatch(a, mix(a.palette.lowland, '#5a4a34', 0.35), { outlineAlpha: 0.12, wobble: 0.14 });
      const hues = ['#c0522a', '#d98a2b', '#8a6a2a', '#a8752f'];
      ctx.save(); tracePath(ctx, pts, true); ctx.clip();
      const n = 20 + (a.variant % 3) * 8;
      for (let i = 0; i < n; i++) {
        const x = w * rng.float(0.1, 0.9), y = h * rng.float(0.1, 0.9);
        const ang = rng.float(0, Math.PI * 2);
        ctx.fillStyle = rgba(rng.pick(hues), rng.float(0.65, 0.95));
        ctx.beginPath(); ctx.ellipse(x, y, w * 0.035, w * 0.02, ang, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    },
  },
];

// ===========================================================================
// Rock & ground (top-down)
// ===========================================================================

function rockBlob(a: AssetDrawArgs, cx: number, cy: number, r: number): Vec2[] {
  const { ctx, rng } = a;
  const rock = stoneC(a);
  const pts = blob(cx, cy, r, r * rng.float(0.75, 1), rng.int(4, 7), 0.15, rng);
  fillPath(ctx, pts, lightGradient(ctx, cx - r, cy - r, cx + r, cy + r, rock, 0.32, 0.36));
  inkLine(ctx, pts, rgba(ink(a), 0.65), Math.max(1, r * 0.09));
  return pts;
}

const ROCK_GROUND_TOP: AssetDef[] = [
  {
    id: 'nat/boulder-cluster-top', label: 'Boulder Cluster', group: 'terrain', sub: 'Rock & ground (top-down)',
    tags: ['boulders', 'rocks', 'cover'], aspect: 1.3, defaultWidth: 130, variants: 4,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { w, h, rng } = a;
      groundShadow(a.ctx, w * 0.5, h * 0.86, w * 0.42, h * 0.12, 0.35);
      const n = 3 + (a.variant % 4);
      for (let i = 0; i < n; i++) {
        rockBlob(a, w * rng.float(0.22, 0.78), h * rng.float(0.4, 0.72), w * rng.float(0.13, 0.24));
      }
    },
  },
  {
    id: 'nat/boulder-single-top', label: 'Large Boulder', group: 'terrain', sub: 'Rock & ground (top-down)',
    tags: ['boulder', 'rock', 'cover'], aspect: 1.15, defaultWidth: 100, variants: 4,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.42;
      groundShadow(ctx, cx + r * 0.1, cy + r * 0.12, r * 0.95, r * 0.85, 0.4);
      const pts = rockBlob(a, cx, cy, r);
      ctx.save(); tracePath(ctx, pts, true); ctx.clip();
      const cracks = 2 + (a.variant % 4);
      for (let i = 0; i < cracks; i++) {
        const ang = rng.float(0, Math.PI * 2);
        const p0: Vec2 = { x: cx + Math.cos(ang) * r * 0.1, y: cy + Math.sin(ang) * r * 0.1 };
        const p1: Vec2 = { x: cx + Math.cos(ang) * r * 1.1, y: cy + Math.sin(ang) * r * 1.1 };
        inkLine(ctx, [p0, p1], rgba(ink(a), 0.3), Math.max(1, r * 0.03));
      }
      speckle(ctx, cx - r, cy - r, r * 1.2, r * 1.2, 12, rgba('#8fae4a', 0.3), 1, r * 0.04, rng);
      ctx.restore();
    },
  },
  {
    id: 'nat/scree-slope-top', label: 'Scree Slope', group: 'terrain', sub: 'Rock & ground (top-down)',
    tags: ['scree', 'talus', 'loose rock'], aspect: 1.6, defaultWidth: 160, variants: 2,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const base = stoneC(a);
      const pts: Vec2[] = a.variant % 2 === 0
        ? [{ x: 0, y: h }, { x: w * 0.7, y: h }, { x: w, y: h * 0.55 }, { x: w * 0.4, y: 0 }, { x: 0, y: h * 0.35 }]
        : [{ x: 0, y: h * 0.6 }, { x: w * 0.3, y: 0 }, { x: w, y: 0 }, { x: w, y: h * 0.4 }, { x: w * 0.55, y: h }, { x: 0, y: h }];
      fillPath(ctx, pts, mix(base, a.palette.lowland, 0.3));
      inkLine(ctx, pts, rgba(ink(a), 0.35), Math.max(1, w * 0.008), true);
      ctx.save(); tracePath(ctx, pts, true); ctx.clip();
      const n = 60;
      for (let i = 0; i < n; i++) {
        const x = w * rng.next(), y = h * rng.next();
        const r = w * rng.float(0.01, 0.03);
        ctx.fillStyle = mix(base, rng.bool() ? '#ffffff' : '#000000', rng.float(0.05, 0.25));
        ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.75, rng.float(0, Math.PI), 0, Math.PI * 2); ctx.fill();
      }
      hatch(ctx, 0, 0, w, h, Math.PI / 3, Math.max(3, w * 0.05), rgba(ink(a), 0.08), 1);
      ctx.restore();
    },
  },
  {
    id: 'nat/rock-shelf-top', label: 'Rock Shelf / Ledge', group: 'terrain', sub: 'Rock & ground (top-down)',
    tags: ['ledge', 'shelf', 'stone'], aspect: 1.7, defaultWidth: 160, variants: 2,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const base = stoneC(a);
      const inset = w * 0.06;
      ctx.save();
      roundRect(ctx, inset, inset, w - inset * 2, h - inset * 2, Math.min(w, h) * 0.1);
      ctx.fillStyle = lightGradient(ctx, 0, 0, w, h, base, 0.24, 0.24);
      ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.55); ctx.lineWidth = Math.max(1, w * 0.012); ctx.stroke();
      ctx.clip();
      // Stepped edge line where the ledge drops off.
      const edgeY = a.variant % 2 === 0 ? h * 0.7 : h * 0.3;
      ctx.strokeStyle = rgba(ink(a), 0.3); ctx.lineWidth = Math.max(1, w * 0.01);
      ctx.beginPath();
      for (let x = 0; x <= w; x += w / 10) ctx.lineTo(x, edgeY + Math.sin(x * 0.05) * h * 0.02);
      ctx.stroke();
      hatch(ctx, 0, 0, w, h, 0, Math.max(4, w * 0.06), rgba(ink(a), 0.08), 1);
      speckle(ctx, 0, 0, w, h, 20, rgba(ink(a), 0.15), 1, w * 0.008, rng);
      ctx.restore();
    },
  },
  {
    id: 'nat/gravel-patch-top', label: 'Gravel Patch', group: 'terrain', sub: 'Rock & ground (top-down)',
    tags: ['gravel', 'stones'], aspect: 1.2, defaultWidth: 90, variants: 2,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const pts = groundPatch(a, mix(a.palette.rock, a.palette.lowland, 0.35), { outlineAlpha: 0.2, wobble: 0.12 });
      ctx.save(); tracePath(ctx, pts, true); ctx.clip();
      speckle(ctx, 0, 0, w, h, 90 + (a.variant % 2) * 40, rgba(ink(a), 0.2), w * 0.006, w * 0.016, rng);
      speckle(ctx, 0, 0, w, h, 30, rgba('#ffffff', 0.25), w * 0.004, w * 0.01, rng);
      ctx.restore();
    },
  },
  {
    id: 'nat/sand-ripples-top', label: 'Sand Patch (ripples)', group: 'terrain', sub: 'Rock & ground (top-down)',
    tags: ['sand', 'desert', 'beach'], aspect: 1.2, defaultWidth: 100, variants: 2,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const sand = tinted(a, a.palette.desert);
      const pts = groundPatch(a, sand, { outlineAlpha: 0.18, wobble: 0.1 });
      ctx.save(); tracePath(ctx, pts, true); ctx.clip();
      const rows = 6 + (a.variant % 2) * 2;
      for (let r = 0; r < rows; r++) {
        const y = (r + 0.5) / rows * h;
        ctx.strokeStyle = rgba(mix(sand, '#000000', 0.18), 0.5);
        ctx.lineWidth = Math.max(1, h * 0.012);
        ctx.beginPath();
        for (let x = 0; x <= w; x += w / 16) ctx.lineTo(x, y + Math.sin(x * 0.08 + r) * h * 0.02);
        ctx.stroke();
      }
      ctx.restore();
    },
  },
  {
    id: 'nat/mud-tracks-top', label: 'Mud Patch (tracks)', group: 'terrain', sub: 'Rock & ground (top-down)',
    tags: ['mud', 'tracks', 'footprints'], aspect: 1.3, defaultWidth: 100, variants: 2,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const mud = mix(a.palette.swamp, '#3a2a18', 0.5);
      const pts = groundPatch(a, lightGradient(ctx, 0, 0, w, h, mud, 0.16, 0.2), { outlineAlpha: 0.2, wobble: 0.14 });
      ctx.save(); tracePath(ctx, pts, true); ctx.clip();
      speckle(ctx, 0, 0, w, h, 6, rgba('#8fa8b8', 0.3), w * 0.02, w * 0.05, rng);
      const ang = a.variant % 2 === 0 ? -0.5 : 0.5;
      let x = w * 0.15, y = h * (a.variant % 2 === 0 ? 0.85 : 0.15);
      const step = w * 0.16;
      for (let i = 0; i < 5; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        ctx.fillStyle = rgba('#1c140c', 0.4);
        ctx.beginPath();
        ctx.ellipse(x + Math.cos(ang + Math.PI / 2) * side * w * 0.03, y + Math.sin(ang) * step * i, w * 0.035, w * 0.06, ang, 0, Math.PI * 2);
        ctx.fill();
        x += Math.cos(ang) * step * 0.3;
        y += Math.sin(ang) * 0;
      }
      ctx.restore();
    },
  },
  {
    id: 'nat/cracked-earth-top', label: 'Cracked Earth', group: 'terrain', sub: 'Rock & ground (top-down)',
    tags: ['drought', 'desert', 'cracked'], aspect: 1.2, defaultWidth: 100, variants: 2,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const base = tinted(a, mix(a.palette.desert, a.palette.lowland, 0.4));
      const pts = groundPatch(a, base, { outlineAlpha: 0.2, wobble: 0.1 });
      ctx.save(); tracePath(ctx, pts, true); ctx.clip();
      const seeds = 5 + (a.variant % 2) * 2;
      for (let i = 0; i < seeds; i++) {
        radiateBranch(ctx, rng, w * rng.float(0.2, 0.8), h * rng.float(0.2, 0.8), rng.float(0, Math.PI * 2), w * 0.18, Math.max(1, w * 0.012), 3, rgba(mix(base, '#000000', 0.5), 0.6));
      }
      ctx.restore();
    },
  },
  {
    id: 'nat/snow-drift-top', label: 'Snow Drift', group: 'terrain', sub: 'Rock & ground (top-down)',
    tags: ['snow', 'drift', 'winter'], aspect: 1.3, defaultWidth: 100, variants: 2,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const cx = w * 0.5, cy = h * 0.5;
      const pts = blob(cx, cy, w * 0.44, h * 0.4, rng.int(5, 7), 0.12, rng);
      fillPath(ctx, pts, lightGradient(ctx, cx - w * 0.4, cy - h * 0.4, cx + w * 0.4, cy + h * 0.4, a.palette.snow, 0.06, 0.16));
      inkLine(ctx, pts, rgba(mix(a.palette.snow, '#5a7a9a', 0.5), 0.35), Math.max(1, w * 0.01));
      ctx.save(); tracePath(ctx, pts, true); ctx.clip();
      const drifts = 2 + (a.variant % 2);
      for (let i = 0; i < drifts; i++) {
        const dx = w * rng.float(0.3, 0.7), dy = h * rng.float(0.3, 0.7);
        const dp = blob(dx, dy, w * rng.float(0.14, 0.22), h * rng.float(0.1, 0.16), 5, 0.14, rng);
        fillPath(ctx, dp, rgba(mix(a.palette.snow, '#7fa0c0', 0.4), 0.35));
      }
      ctx.restore();
    },
  },
  {
    id: 'nat/ice-sheet-top', label: 'Ice Sheet (cracks)', group: 'terrain', sub: 'Rock & ground (top-down)',
    tags: ['ice', 'frozen', 'cracks'], aspect: 1.3, defaultWidth: 110, variants: 2,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const ice = mix(a.palette.shallowWater, '#ffffff', 0.55);
      const pts = groundPatch(a, rgba(ice, 0.88), { outlineAlpha: 0.3, wobble: 0.08 });
      ctx.save(); tracePath(ctx, pts, true); ctx.clip();
      speckle(ctx, 0, 0, w, h, 10, rgba('#ffffff', 0.4), w * 0.02, w * 0.05, rng);
      const cracks = 4 + (a.variant % 2) * 2;
      for (let i = 0; i < cracks; i++) {
        radiateBranch(ctx, rng, w * rng.float(0.2, 0.8), h * rng.float(0.2, 0.8), rng.float(0, Math.PI * 2), w * 0.22, Math.max(1, w * 0.012), 2, rgba('#4a7a9a', 0.4));
      }
      ctx.restore();
    },
  },
  {
    id: 'nat/lava-crack-top', label: 'Lava Crack', group: 'terrain', sub: 'Rock & ground (top-down)',
    tags: ['lava', 'volcanic', 'glow', 'hazard'], aspect: 1.3, defaultWidth: 110, variants: 2,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const rock = mix(a.palette.rock, '#241a16', 0.55);
      groundPatch(a, rock, { outlineAlpha: 0.4, wobble: 0.1 });
      const n = 2 + (a.variant % 2);
      for (let i = 0; i < n; i++) {
        let x = w * rng.float(0.15, 0.85), y = h * rng.float(0.15, 0.85);
        const pts: Vec2[] = [{ x, y }];
        const steps = 5;
        for (let k = 0; k < steps; k++) {
          x += w * rng.float(-0.14, 0.14); y += h * rng.float(-0.14, 0.14);
          x = Math.max(w * 0.06, Math.min(w * 0.94, x)); y = Math.max(h * 0.06, Math.min(h * 0.94, y));
          pts.push({ x, y });
        }
        for (const p of pts) radialGlow(ctx, p.x, p.y, w * 0.1, a.palette.lava, 0.5);
        inkLine(ctx, pts, a.palette.lava, Math.max(1.5, w * 0.02));
        inkLine(ctx, pts, rgba('#ffd88a', 0.8), Math.max(0.8, w * 0.008));
      }
    },
  },
  {
    id: 'nat/tar-pit-top', label: 'Tar Pit', group: 'terrain', sub: 'Rock & ground (top-down)',
    tags: ['tar', 'pit', 'hazard', 'sticky'], aspect: 1.15, defaultWidth: 100, variants: 2,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const cx = w / 2, cy = h / 2;
      const rim = blob(cx, cy, w * 0.46, h * 0.42, 6, 0.14, rng);
      fillPath(ctx, rim, mix(a.palette.lowland, '#2a2018', 0.4));
      const pool = blob(cx, cy, w * 0.36, h * 0.32, 6, 0.1, rng);
      const g = ctx.createRadialGradient(cx - w * 0.08, cy - h * 0.08, 0, cx, cy, w * 0.4);
      g.addColorStop(0, '#3a3a3a'); g.addColorStop(0.4, '#0e0e0e'); g.addColorStop(1, '#000000');
      fillPath(ctx, pool, g);
      inkLine(ctx, pool, rgba('#000000', 0.7), Math.max(1, w * 0.012));
      const bubbles = 3 + (a.variant % 2) * 2;
      for (let i = 0; i < bubbles; i++) {
        ctx.strokeStyle = rgba('#5a5a5a', 0.5); ctx.lineWidth = Math.max(1, w * 0.012);
        ctx.beginPath(); ctx.arc(cx + rng.float(-w * 0.22, w * 0.22), cy + rng.float(-h * 0.2, h * 0.2), w * rng.float(0.02, 0.045), 0, Math.PI * 1.6); ctx.stroke();
      }
    },
  },
  {
    id: 'nat/ash-heap-top', label: 'Ash Heap', group: 'terrain', sub: 'Rock & ground (top-down)',
    tags: ['ash', 'cinder', 'volcanic'], aspect: 1.2, defaultWidth: 90, variants: 2,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const cx = w / 2, cy = h / 2;
      const gray = mix(a.palette.rock, '#8a8580', 0.5);
      const pts = blob(cx, cy, w * 0.42, h * 0.38, 6, 0.14, rng);
      fillPath(ctx, pts, lightGradient(ctx, cx - w * 0.4, cy - h * 0.4, cx + w * 0.4, cy + h * 0.4, gray, 0.32, 0.28));
      inkLine(ctx, pts, rgba(ink(a), 0.35), Math.max(1, w * 0.01));
      ctx.save(); tracePath(ctx, pts, true); ctx.clip();
      speckle(ctx, 0, 0, w, h, 30, rgba('#4a4540', 0.35), 1, w * 0.014, rng);
      if (a.variant % 2 === 1) speckle(ctx, 0, 0, w, h, 5, rgba(a.palette.lava, 0.6), 1, w * 0.01, rng);
      ctx.restore();
    },
  },
  {
    id: 'nat/coral-head-top', label: 'Coral Head', group: 'terrain', sub: 'Rock & ground (top-down)',
    tags: ['coral', 'reef', 'shallows'], aspect: 1, defaultWidth: 90, variants: 3,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.4;
      fillPath(ctx, blob(cx, cy, r * 1.15, r * 1.1, 7, 0.14, rng), rgba(a.palette.shallowWater, 0.5));
      const base = blob(cx, cy, r * 0.7, r * 0.65, 6, 0.16, rng);
      fillPath(ctx, base, mix('#d8c8a0', a.palette.desert, 0.3));
      const hues = ['#e8577a', '#f2954c', '#9b6bd8', '#4cc9c9', '#f2c94c'];
      const branches = 8 + (a.variant % 3) * 3;
      for (let i = 0; i < branches; i++) {
        const ang = rng.float(0, Math.PI * 2), d = r * rng.float(0, 0.55);
        const bx = cx + Math.cos(ang) * d, by = cy + Math.sin(ang) * d;
        const c = rng.pick(hues);
        const forks = rng.int(2, 4);
        for (let f = 0; f < forks; f++) {
          const fang = ang + rng.float(-1, 1);
          const len = r * rng.float(0.15, 0.3);
          ctx.strokeStyle = rgba(c, 0.85); ctx.lineWidth = Math.max(1.4, r * 0.05); ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(fang) * len, by + Math.sin(fang) * len); ctx.stroke();
          ctx.fillStyle = rgba(c, 0.9);
          ctx.beginPath(); ctx.arc(bx + Math.cos(fang) * len, by + Math.sin(fang) * len, r * 0.045, 0, Math.PI * 2); ctx.fill();
        }
      }
    },
  },
  {
    id: 'nat/tide-pool-top', label: 'Tide Pool', group: 'terrain', sub: 'Rock & ground (top-down)',
    tags: ['tide pool', 'coast', 'rockpool'], aspect: 1.2, defaultWidth: 90, variants: 2,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, rng } = a;
      const pts = waterPool(a, { rx: a.w * 0.36, ry: a.h * 0.32, shore: mix(a.palette.rock, a.palette.desert, 0.4) });
      const dots = 4 + (a.variant % 2) * 2;
      for (let i = 0; i < dots; i++) {
        const ang = rng.float(0, Math.PI * 2), d = a.w * rng.float(0, 0.25);
        ctx.fillStyle = rgba(rng.pick(['#e8577a', '#f2954c', '#9b6bd8']), 0.7);
        ctx.beginPath(); ctx.arc(a.w / 2 + Math.cos(ang) * d, a.h / 2 + Math.sin(ang) * d, a.w * 0.02, 0, Math.PI * 2); ctx.fill();
      }
      inkLine(ctx, pts, rgba(ink(a), 0.3), Math.max(1, a.w * 0.008));
    },
  },
];

// ===========================================================================
// Water (top-down)
// ===========================================================================

const WATER_TOP: AssetDef[] = [
  {
    id: 'nat/pond-small-top', label: 'Small Pond', group: 'terrain', sub: 'Water (top-down)',
    tags: ['pond', 'water', 'still'], aspect: 1.2, defaultWidth: 120, variants: 3,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      waterPool(a, { shore: mix(a.palette.shore, a.palette.grass, 0.4) });
      // A few reeds at the shoreline.
      const reeds = 3 + (a.variant % 3) * 2;
      for (let i = 0; i < reeds; i++) {
        const ang = rng.float(0, Math.PI * 2);
        const x = w / 2 + Math.cos(ang) * w * 0.44, y = h / 2 + Math.sin(ang) * h * 0.42;
        ctx.strokeStyle = rgba(mix(a.palette.swamp, a.palette.grass, 0.4), 0.8); ctx.lineWidth = Math.max(1, w * 0.01); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(ang) * w * 0.06, y + Math.sin(ang) * h * 0.06 - h * 0.08); ctx.stroke();
      }
    },
  },
  {
    id: 'nat/stream-segment-top', label: 'Stream Segment', group: 'terrain', sub: 'Water (top-down)',
    tags: ['stream', 'river', 'water', 'tileable'], aspect: 1, defaultWidth: 140, variants: 4,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const [eA, eB] = EDGE_PAIRS[a.variant % EDGE_PAIRS.length];
      const { left, right, center } = flowBand(a, eA, eB, 0.16);
      const band = [...left, ...right.slice().reverse()];
      const g = ctx.createLinearGradient(left[0].x, left[0].y, right[right.length - 1].x, right[right.length - 1].y);
      g.addColorStop(0, a.palette.shallowWater); g.addColorStop(1, a.palette.water);
      fillPath(ctx, band, g);
      inkLine(ctx, left, rgba(a.palette.deepWater, 0.55), Math.max(1, w * 0.008));
      inkLine(ctx, right, rgba(a.palette.deepWater, 0.55), Math.max(1, w * 0.008));
      // Current ripple ticks along the flow.
      ctx.save(); tracePath(ctx, band, true); ctx.clip();
      for (let i = 1; i < center.length - 1; i += 2) {
        const p = center[i], q = center[i + 1] ?? center[i];
        const ang = Math.atan2(q.y - p.y, q.x - p.x);
        ctx.strokeStyle = rgba('#ffffff', rng.float(0.15, 0.3)); ctx.lineWidth = Math.max(1, w * 0.006);
        ctx.beginPath(); ctx.moveTo(p.x - Math.cos(ang) * w * 0.03, p.y - Math.sin(ang) * w * 0.03);
        ctx.lineTo(p.x + Math.cos(ang) * w * 0.03, p.y + Math.sin(ang) * w * 0.03); ctx.stroke();
      }
      ctx.restore();
    },
  },
  {
    id: 'nat/waterfall-pool-top', label: 'Waterfall Plunge Pool', group: 'terrain', sub: 'Water (top-down)',
    tags: ['waterfall', 'pool', 'foam'], aspect: 1.1, defaultWidth: 130, variants: 2,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const cx = w * 0.5, cy = h * 0.58;
      waterPool(a, { rx: w * 0.4, ry: h * 0.36, shore: mix(a.palette.rock, a.palette.shore, 0.4) });
      // The incoming plunge from the top edge.
      const inX = w * (a.variant % 2 === 0 ? 0.5 : 0.42);
      ctx.save();
      const chute: Vec2[] = [{ x: inX - w * 0.1, y: 0 }, { x: inX + w * 0.1, y: 0 }, { x: cx + w * 0.08, y: cy - h * 0.1 }, { x: cx - w * 0.08, y: cy - h * 0.1 }];
      fillPath(ctx, chute, rgba('#ffffff', 0.7));
      ctx.restore();
      radialGlow(ctx, inX, cy - h * 0.12, w * 0.28, '#ffffff', 0.45);
      for (let i = 0; i < 18; i++) {
        const ang = rng.float(0, Math.PI * 2), d = rng.float(0, w * 0.22);
        ctx.fillStyle = rgba('#ffffff', rng.float(0.3, 0.6));
        ctx.beginPath(); ctx.arc(inX + Math.cos(ang) * d, cy - h * 0.1 + Math.sin(ang) * d * 0.6, w * rng.float(0.02, 0.045), 0, Math.PI * 2); ctx.fill();
      }
    },
  },
  {
    id: 'nat/rapids-top', label: 'Rapids (white water)', group: 'terrain', sub: 'Water (top-down)',
    tags: ['rapids', 'white water', 'river'], aspect: 1.3, defaultWidth: 160, variants: 4,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const [eA, eB] = EDGE_PAIRS[a.variant % EDGE_PAIRS.length];
      const { left, right, center } = flowBand(a, eA, eB, 0.2);
      const band = [...left, ...right.slice().reverse()];
      fillPath(ctx, band, mix(a.palette.water, a.palette.deepWater, 0.3));
      inkLine(ctx, left, rgba(a.palette.deepWater, 0.6), Math.max(1, w * 0.008));
      inkLine(ctx, right, rgba(a.palette.deepWater, 0.6), Math.max(1, w * 0.008));
      ctx.save(); tracePath(ctx, band, true); ctx.clip();
      // Exposed rocks breaking the surface.
      const rocks = 3 + (a.variant % 3);
      for (let i = 0; i < rocks; i++) {
        const t = rng.float(0.15, 0.85);
        const idx = Math.floor(t * (center.length - 1));
        const p = center[idx];
        rockBlob(a, p.x + rng.float(-w * 0.08, w * 0.08), p.y + rng.float(-h * 0.08, h * 0.08), Math.min(w, h) * rng.float(0.05, 0.09));
      }
      // Chaotic foam patches.
      const foam = 16 + (a.variant % 3) * 6;
      for (let i = 0; i < foam; i++) {
        const x = w * rng.next(), y = h * rng.next();
        ctx.fillStyle = rgba('#ffffff', rng.float(0.3, 0.65));
        ctx.beginPath(); ctx.ellipse(x, y, w * rng.float(0.02, 0.05), w * rng.float(0.012, 0.03), rng.float(0, Math.PI), 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    },
  },
  {
    id: 'nat/marsh-hummocks-top', label: 'Marsh with Hummocks', group: 'terrain', sub: 'Water (top-down)',
    tags: ['marsh', 'wetland', 'hummocks'], aspect: 1.4, defaultWidth: 160, variants: 2,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      groundPatch(a, mix(a.palette.swamp, a.palette.water, 0.4), { outlineAlpha: 0.2, wobble: 0.16 });
      const hummocks = 5 + (a.variant % 2) * 2;
      for (let i = 0; i < hummocks; i++) {
        const cx = w * rng.float(0.15, 0.85), cy = h * rng.float(0.2, 0.8);
        const r = w * rng.float(0.08, 0.14);
        const pts = blob(cx, cy, r, r * 0.85, 5, 0.2, rng);
        fillPath(ctx, pts, mix(a.palette.grass, a.palette.swamp, 0.3));
        inkLine(ctx, pts, rgba(ink(a), 0.3), Math.max(1, w * 0.008));
        for (let k = 0; k < 4; k++) {
          const bang = rng.float(0, Math.PI * 2);
          ctx.strokeStyle = rgba(a.palette.grass, 0.8); ctx.lineWidth = Math.max(1, w * 0.008);
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(bang) * r * 0.9, cy + Math.sin(bang) * r * 0.9 - r * 0.3); ctx.stroke();
        }
      }
    },
  },
  {
    id: 'nat/hot-spring-top', label: 'Hot Spring (steam)', group: 'terrain', sub: 'Water (top-down)',
    tags: ['hot spring', 'steam', 'geothermal'], aspect: 1.1, defaultWidth: 110, variants: 2,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      waterPool(a, { rx: w * 0.36, ry: h * 0.32, shore: mix(a.palette.rock, '#c9b89a', 0.4) });
      const cx = w / 2, cy = h / 2;
      ctx.fillStyle = rgba(mix(a.palette.shallowWater, '#eaf6ff', 0.5), 0.5);
      ctx.beginPath(); ctx.ellipse(cx, cy, w * 0.14, h * 0.12, 0, 0, Math.PI * 2); ctx.fill();
      const wisps = 4 + (a.variant % 2) * 2;
      for (let i = 0; i < wisps; i++) {
        const bx = cx + rng.float(-w * 0.14, w * 0.14);
        for (let k = 0; k < 3; k++) {
          const ry = cy - h * (0.1 + k * 0.16);
          ctx.fillStyle = rgba('#ffffff', 0.22 - k * 0.06);
          ctx.beginPath(); ctx.ellipse(bx + rng.gauss(0, w * 0.02) * k, ry, w * (0.05 + k * 0.02), h * 0.05, 0, 0, Math.PI * 2); ctx.fill();
        }
      }
    },
  },
  {
    id: 'nat/frozen-pond-top', label: 'Frozen Pond', group: 'terrain', sub: 'Water (top-down)',
    tags: ['ice', 'frozen', 'pond', 'winter'], aspect: 1.2, defaultWidth: 120, variants: 2,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const pts = waterPool(a, { shore: mix(a.palette.snow, a.palette.shore, 0.5), frozen: true });
      ctx.save(); tracePath(ctx, pts, true); ctx.clip();
      speckle(ctx, 0, 0, w, h, 8, rgba('#ffffff', 0.4), w * 0.015, w * 0.03, rng);
      const cracks = 3 + (a.variant % 2) * 2;
      for (let i = 0; i < cracks; i++) {
        radiateBranch(ctx, rng, w * rng.float(0.3, 0.7), h * rng.float(0.3, 0.7), rng.float(0, Math.PI * 2), w * 0.2, Math.max(1, w * 0.01), 2, rgba('#7fa0c0', 0.5));
      }
      ctx.restore();
    },
  },
  {
    id: 'nat/sea-foam-top', label: 'Sea Foam / Breaking Wave', group: 'terrain', sub: 'Water (top-down)',
    tags: ['foam', 'wave', 'shore', 'surf'], aspect: 2.4, defaultWidth: 200, variants: 2,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, a.palette.shore); g.addColorStop(0.4, a.palette.shallowWater); g.addColorStop(1, a.palette.water);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      const waveY = h * (a.variant % 2 === 0 ? 0.4 : 0.5);
      // Scalloped foam line.
      const scallops = 10;
      ctx.beginPath();
      ctx.moveTo(0, waveY);
      for (let i = 0; i <= scallops; i++) {
        const x = (i / scallops) * w;
        const y = waveY + Math.sin(i * 1.3 + rng.float(-0.3, 0.3)) * h * 0.06;
        ctx.quadraticCurveTo(x - w / scallops / 2, y - h * 0.08, x, y);
      }
      ctx.strokeStyle = rgba('#ffffff', 0.8); ctx.lineWidth = Math.max(2, h * 0.05); ctx.lineCap = 'round'; ctx.stroke();
      speckle(ctx, 0, waveY - h * 0.06, w, h * 0.12, 40, rgba('#ffffff', 0.5), 1, w * 0.008, rng);
    },
  },
];

// ===========================================================================
// World nature (side view)
// ===========================================================================

function sideTree(a: AssetDrawArgs, cx: number, groundY: number, size: number, canopy: (rr: number) => Vec2[], base: string, trunkH = 0.4): void {
  const { ctx } = a;
  groundShadow(ctx, cx + size * 0.05, groundY, size * 0.3, size * 0.07, 0.26);
  const th = size * trunkH, tw = size * 0.07;
  ctx.fillStyle = barkC(a);
  ctx.beginPath();
  ctx.moveTo(cx - tw / 2, groundY); ctx.lineTo(cx - tw * 0.3, groundY - th); ctx.lineTo(cx + tw * 0.3, groundY - th); ctx.lineTo(cx + tw / 2, groundY);
  ctx.closePath(); ctx.fill();
  const pts = canopy(size * 0.4);
  fillPath(ctx, pts, base);
  inkLine(ctx, pts, rgba(ink(a), 0.4), Math.max(1, size * 0.015));
}

const WORLD_NATURE: AssetDef[] = [
  {
    id: 'nat/savannah-acacia', label: 'Savannah Acacia', group: 'vegetation', sub: 'World nature',
    tags: ['savannah', 'acacia', 'plains', 'africa'], aspect: 0.95, defaultWidth: 120, variants: 3,
    kinds: ['region', 'operational', 'hex'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const cx = w * 0.5, groundY = h * 0.92;
      groundShadow(ctx, cx, groundY, w * 0.3, h * 0.05, 0.26);
      const lean = rng.float(-0.15, 0.2);
      const th = h * 0.45;
      ctx.strokeStyle = barkC(a); ctx.lineWidth = Math.max(2, w * 0.05); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx, groundY); ctx.quadraticCurveTo(cx + lean * w * 0.2, groundY - th * 0.6, cx + lean * w * 0.4, groundY - th); ctx.stroke();
      const topX = cx + lean * w * 0.4, topY = groundY - th;
      const base = tinted(a, mix(a.palette.forest, '#b8a24a', 0.5));
      const rw = w * (0.32 + (a.variant % 3) * 0.04), rh = h * 0.1;
      const pts = blob(topX, topY - rh * 0.4, rw, rh, 6, 0.16, rng);
      fillPath(ctx, pts, lightGradient(ctx, topX - rw, topY - rh, topX + rw, topY, base, 0.3, 0.28));
      inkLine(ctx, pts, rgba(ink(a), 0.5), Math.max(1, w * 0.012));
      // Dry grass tufts at the base.
      const tufts = 3 + (a.variant % 3);
      for (let i = 0; i < tufts; i++) {
        const x = cx + rng.float(-w * 0.3, w * 0.3);
        ctx.strokeStyle = rgba(mix(a.palette.desert, a.palette.grass, 0.4), 0.8); ctx.lineWidth = Math.max(1, w * 0.01);
        ctx.beginPath(); ctx.moveTo(x, groundY); ctx.lineTo(x + rng.float(-w * 0.02, w * 0.02), groundY - h * 0.08); ctx.stroke();
      }
    },
  },
  {
    id: 'nat/redwood-grove', label: 'Redwood Grove', group: 'vegetation', sub: 'World nature',
    tags: ['redwood', 'sequoia', 'giant trees'], aspect: 0.85, defaultWidth: 150, variants: 3,
    kinds: ['region', 'operational', 'hex'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const groundY = h * 0.94;
      groundShadow(ctx, w * 0.5, groundY, w * 0.4, h * 0.05, 0.26);
      const n = 3 + (a.variant % 3);
      const trees: { x: number; s: number }[] = [];
      for (let i = 0; i < n; i++) trees.push({ x: w * ((i + 0.5) / n) + rng.float(-w * 0.04, w * 0.04), s: rng.float(0.75, 1) });
      trees.sort((p, q) => q.s - p.s);
      for (const t of trees) {
        const th = h * 0.82 * t.s, tw = w * 0.03 * t.s;
        const base = mix(leafC(a), '#0e3a22', 0.4);
        ctx.fillStyle = barkC(a);
        ctx.beginPath(); ctx.moveTo(t.x - tw, groundY); ctx.lineTo(t.x - tw * 0.4, groundY - th * 0.55); ctx.lineTo(t.x + tw * 0.4, groundY - th * 0.55); ctx.lineTo(t.x + tw, groundY); ctx.closePath(); ctx.fill();
        const pts: Vec2[] = [];
        const topY = groundY - th;
        for (let k = 0; k <= 5; k++) {
          const ty = topY + (k / 5) * th * 0.6;
          const half = tw * (0.3 + k * 1.1);
          pts.push({ x: t.x + half, y: ty });
        }
        const crown: Vec2[] = [{ x: t.x, y: topY }, ...pts, { x: t.x - pts[pts.length - 1].x + t.x * 2 - pts[pts.length - 1].x, y: pts[pts.length - 1].y }];
        // Simple symmetric conifer silhouette instead of the mirrored hack above.
        const silhouette: Vec2[] = [{ x: t.x, y: topY }];
        for (let k = 1; k <= 5; k++) { const ty = topY + (k / 5) * th * 0.62; silhouette.push({ x: t.x + tw * (0.3 + k * 1.05), y: ty }); }
        for (let k = 5; k >= 1; k--) { const ty = topY + (k / 5) * th * 0.62; silhouette.push({ x: t.x - tw * (0.3 + k * 1.05), y: ty }); }
        fillPath(ctx, silhouette, lightGradient(ctx, t.x - tw * 5, topY, t.x + tw * 5, groundY, base, 0.26, 0.3));
        inkLine(ctx, silhouette, rgba(ink(a), 0.35), Math.max(1, w * 0.006));
        void crown;
      }
    },
  },
  {
    id: 'nat/mangrove-swamp', label: 'Mangrove Swamp', group: 'vegetation', sub: 'World nature',
    tags: ['mangrove', 'swamp', 'coast', 'roots'], aspect: 1.6, defaultWidth: 170, variants: 2,
    kinds: ['region', 'operational', 'hex'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const waterY = h * 0.72;
      const wg = ctx.createLinearGradient(0, waterY, 0, h);
      wg.addColorStop(0, a.palette.shallowWater); wg.addColorStop(1, a.palette.water);
      ctx.fillStyle = wg; ctx.fillRect(0, waterY, w, h - waterY);
      const n = 4 + (a.variant % 2) * 2;
      for (let i = 0; i < n; i++) {
        const cx = w * ((i + 0.5) / n) + rng.float(-w * 0.03, w * 0.03);
        const th = h * rng.float(0.16, 0.24);
        const legs = 4;
        for (let l = 0; l < legs; l++) {
          const ang = -Math.PI / 2 + (l / (legs - 1) - 0.5) * 1.1;
          ctx.strokeStyle = rgba(barkC(a), 0.85); ctx.lineWidth = Math.max(1, w * 0.007); ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(cx, waterY - th * 0.15); ctx.lineTo(cx + Math.cos(ang) * th * 0.5, waterY + th * 0.18); ctx.stroke();
        }
        const base = mix(leafC(a), '#0e5c33', 0.35);
        const pts = blob(cx, waterY - th, w * 0.09, h * 0.07, 6, 0.2, rng);
        fillPath(ctx, pts, base);
        inkLine(ctx, pts, rgba(ink(a), 0.35), Math.max(1, w * 0.008));
      }
    },
  },
  {
    id: 'nat/coral-reef-world', label: 'Coral Reef', group: 'vegetation', sub: 'World nature',
    tags: ['coral', 'reef', 'ocean', 'tropical'], aspect: 1.5, defaultWidth: 150, variants: 2,
    kinds: ['region', 'operational', 'hex'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const waterLine = h * 0.5;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, a.palette.shallowWater); g.addColorStop(1, a.palette.deepWater);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      const hues = ['#e8577a', '#f2954c', '#9b6bd8', '#4cc9c9', '#f2c94c'];
      const clusters = 5 + (a.variant % 2) * 3;
      for (let i = 0; i < clusters; i++) {
        const cx = w * rng.float(0.1, 0.9);
        const top = waterLine - h * rng.float(0.02, 0.16);
        const c = rng.pick(hues);
        for (let f = 0; f < rng.int(3, 6); f++) {
          const ang = -Math.PI / 2 + rng.float(-0.9, 0.9);
          const len = h * rng.float(0.06, 0.14);
          ctx.strokeStyle = rgba(c, 0.85); ctx.lineWidth = Math.max(1.5, w * 0.012); ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(cx, waterLine + h * 0.06); ctx.lineTo(cx + Math.cos(ang) * len, top + Math.sin(ang) * len); ctx.stroke();
        }
      }
      // Foam where the reef breaks the surface.
      speckle(ctx, 0, waterLine - h * 0.03, w, h * 0.06, 30, rgba('#ffffff', 0.4), 1, w * 0.008, rng);
    },
  },
  {
    id: 'nat/rice-terraces', label: 'Rice Terraces', group: 'terrain', sub: 'World nature',
    tags: ['rice', 'terraces', 'farmland', 'paddy'], aspect: 1.7, defaultWidth: 180, variants: 2,
    kinds: ['region', 'operational', 'hex'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const steps = 5 + (a.variant % 2) * 2;
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        const y0 = h * (0.2 + t * 0.7), y1 = h * (0.2 + (t + 1 / steps) * 0.7);
        const x0 = w * (0.05 + t * 0.08);
        const pts: Vec2[] = [{ x: x0, y: y0 }, { x: w * 0.98, y: y0 }, { x: w * 0.98, y: y1 - h * 0.02 }, { x: x0 - w * 0.03, y: y1 - h * 0.02 }];
        const wet = i % 2 === 0;
        fillPath(ctx, pts, wet ? mix(a.palette.shallowWater, a.palette.grass, 0.3) : mix(a.palette.grass, '#c9d98a', 0.3));
        inkLine(ctx, pts, rgba(ink(a), 0.3), Math.max(1, w * 0.006));
        if (wet) {
          ctx.strokeStyle = rgba('#ffffff', 0.3); ctx.lineWidth = Math.max(1, h * 0.005);
          ctx.beginPath(); ctx.moveTo(x0 + w * 0.05, (y0 + y1) / 2); ctx.lineTo(w * 0.9, (y0 + y1) / 2); ctx.stroke();
        }
      }
    },
  },
  {
    id: 'nat/vineyard-rows', label: 'Vineyard Rows', group: 'vegetation', sub: 'World nature',
    tags: ['vineyard', 'wine', 'farmland', 'hillside'], aspect: 1.7, defaultWidth: 170, variants: 2,
    kinds: ['region', 'operational', 'hex'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const hillBase = tinted(a, a.palette.highland);
      const hillTop: Vec2[] = [{ x: 0, y: h }, { x: 0, y: h * 0.5 }, { x: w * 0.5, y: h * 0.3 }, { x: w, y: h * 0.42 }, { x: w, y: h }];
      fillPath(ctx, hillTop, lightGradient(ctx, 0, h * 0.3, 0, h, hillBase, 0.2, 0.24));
      const rows = 6 + (a.variant % 2) * 2;
      for (let r = 0; r < rows; r++) {
        const t = r / (rows - 1);
        const y = h * (0.4 + t * 0.5);
        const n = Math.round(6 + t * 10);
        for (let i = 0; i < n; i++) {
          const x = w * (0.06 + (i / n) * 0.9) + Math.sin(t * 3) * w * 0.03;
          const s = w * (0.012 + t * 0.012);
          ctx.fillStyle = mix(leafC(a), '#0e3a22', 0.3);
          ctx.beginPath(); ctx.ellipse(x, y, s, s * 0.7, 0, 0, Math.PI * 2); ctx.fill();
        }
      }
    },
  },
  {
    id: 'nat/olive-grove', label: 'Olive Grove', group: 'vegetation', sub: 'World nature',
    tags: ['olive', 'grove', 'mediterranean'], aspect: 1.6, defaultWidth: 160, variants: 3,
    kinds: ['region', 'operational', 'hex'],
    draw(a) {
      const { w, h, rng } = a;
      const groundY = h * 0.9;
      const n = 4 + (a.variant % 3) * 2;
      const rows: { x: number; y: number; s: number }[] = [];
      for (let i = 0; i < n; i++) rows.push({ x: w * rng.float(0.08, 0.92), y: groundY - h * rng.float(0, 0.14), s: rng.float(0.55, 0.85) });
      rows.sort((p, q) => p.y - q.y);
      const base = tinted(a, mix(a.palette.forest, '#9aa86a', 0.55));
      for (const r of rows) {
        sideTree(a, r.x, r.y, Math.min(w, h) * r.s, (rr) => blob(r.x, r.y - rr * 1.05, rr * 0.7, rr * 0.55, 6, 0.16, a.rng), base, 0.5);
      }
    },
  },
  {
    id: 'nat/tundra-scrub', label: 'Tundra Scrub', group: 'vegetation', sub: 'World nature',
    tags: ['tundra', 'arctic', 'scrub', 'lichen'], aspect: 1.6, defaultWidth: 150, variants: 2,
    kinds: ['region', 'operational', 'hex'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const groundY = h * 0.9;
      const ground: Vec2[] = [{ x: 0, y: h }, { x: 0, y: groundY }, { x: w, y: groundY - h * 0.03 }, { x: w, y: h }];
      fillPath(ctx, ground, tinted(a, mix(a.palette.highland, a.palette.snow, 0.3)));
      const bumps = 8 + (a.variant % 2) * 4;
      for (let i = 0; i < bumps; i++) {
        const x = w * rng.float(0.05, 0.95), r = w * rng.float(0.03, 0.06);
        const pts = blob(x, groundY - r * 0.3, r, r * 0.55, 5, 0.2, rng);
        fillPath(ctx, pts, mix(a.palette.grass, '#6a7a5a', 0.4));
        inkLine(ctx, pts, rgba(ink(a), 0.25), Math.max(1, w * 0.004));
      }
      speckle(ctx, 0, groundY - h * 0.05, w, h * 0.15, 40, rgba('#8fae4a', 0.3), 1, w * 0.006, rng);
    },
  },
  {
    id: 'nat/bamboo-grove', label: 'Bamboo Grove', group: 'vegetation', sub: 'World nature',
    tags: ['bamboo', 'grove', 'jungle'], aspect: 0.8, defaultWidth: 120, variants: 2,
    kinds: ['region', 'operational', 'hex'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const groundY = h * 0.94;
      groundShadow(ctx, w * 0.5, groundY, w * 0.36, h * 0.04, 0.24);
      const n = 6 + (a.variant % 2) * 3;
      const green = mix(leafC(a), '#c9d98a', 0.3);
      for (let i = 0; i < n; i++) {
        const x = w * (0.15 + (i / n) * 0.7) + rng.float(-w * 0.02, w * 0.02);
        const topY = h * rng.float(0.06, 0.24);
        const lean = rng.float(-w * 0.03, w * 0.03);
        ctx.strokeStyle = green; ctx.lineWidth = Math.max(2, w * 0.018); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, groundY); ctx.quadraticCurveTo(x + lean * 0.5, (topY + groundY) / 2, x + lean, topY); ctx.stroke();
        const nodes = 5;
        ctx.strokeStyle = rgba(ink(a), 0.3); ctx.lineWidth = Math.max(1, w * 0.006);
        for (let k = 1; k < nodes; k++) {
          const t = k / nodes; const ny = groundY + (topY - groundY) * t; const nx = x + lean * t;
          ctx.beginPath(); ctx.moveTo(nx - w * 0.012, ny); ctx.lineTo(nx + w * 0.012, ny); ctx.stroke();
        }
        for (let leaf = 0; leaf < 3; leaf++) {
          const ang = -Math.PI / 2 + rng.float(-1, 1);
          const len = w * rng.float(0.08, 0.14);
          ctx.strokeStyle = rgba(green, 0.85); ctx.lineWidth = Math.max(1.2, w * 0.012);
          ctx.beginPath(); ctx.moveTo(x + lean, topY); ctx.lineTo(x + lean + Math.cos(ang) * len, topY + Math.sin(ang) * len); ctx.stroke();
        }
      }
    },
  },
  {
    id: 'nat/petrified-forest', label: 'Petrified Forest', group: 'terrain', sub: 'World nature',
    tags: ['petrified', 'fossil', 'stone trees', 'badlands'], aspect: 1.4, defaultWidth: 150, variants: 3,
    kinds: ['region', 'operational', 'hex'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const groundY = h * 0.92;
      const ground: Vec2[] = [{ x: 0, y: h }, { x: 0, y: groundY }, { x: w, y: groundY - h * 0.02 }, { x: w, y: h }];
      fillPath(ctx, ground, tinted(a, mix(a.palette.desert, a.palette.rock, 0.4)));
      const n = 3 + (a.variant % 3);
      const stone = mix(a.palette.rock, '#a89678', 0.4);
      for (let i = 0; i < n; i++) {
        const x = w * ((i + 0.5) / n) + rng.float(-w * 0.05, w * 0.05);
        const th = h * rng.float(0.32, 0.55);
        const tw = w * rng.float(0.03, 0.05);
        const trunk: Vec2[] = [{ x: x - tw, y: groundY }, { x: x - tw * 0.5, y: groundY - th }, { x: x + tw * 0.5, y: groundY - th }, { x: x + tw, y: groundY }];
        fillPath(ctx, trunk, lightGradient(ctx, x - tw, groundY - th, x + tw, groundY, stone, 0.28, 0.3));
        inkLine(ctx, trunk, rgba(ink(a), 0.4), Math.max(1, w * 0.006));
        ctx.save(); tracePath(ctx, trunk, true); ctx.clip();
        hatch(ctx, x - tw, groundY - th, tw * 2, th, Math.PI / 2.4, Math.max(2, w * 0.02), rgba(ink(a), 0.15), 1);
        ctx.restore();
        // A snapped bare branch stub.
        if (rng.bool()) {
          ctx.strokeStyle = mix(ink(a), stone, 0.4); ctx.lineWidth = Math.max(1, w * 0.01);
          ctx.beginPath(); ctx.moveTo(x, groundY - th * 0.7); ctx.lineTo(x + (rng.bool() ? 1 : -1) * tw * 2, groundY - th * 0.85); ctx.stroke();
        }
      }
    },
  },
  {
    id: 'nat/floating-islands', label: 'Floating Islands', group: 'terrain', sub: 'World nature',
    tags: ['floating', 'islands', 'fantasy', 'sky'], aspect: 1.3, defaultWidth: 150, variants: 2,
    kinds: ['region', 'operational', 'hex'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const islands = [{ x: w * 0.4, y: h * 0.4, s: 1 }, { x: w * 0.78, y: h * 0.66, s: 0.55 + (a.variant % 2) * 0.1 }];
      for (const isl of islands) {
        const rx = w * 0.28 * isl.s, ry = h * 0.14 * isl.s;
        radialGlow(ctx, isl.x, isl.y + ry * 1.6, rx * 0.9, '#ffffff', 0.2);
        const top = blob(isl.x, isl.y, rx, ry, 6, 0.14, rng);
        const under: Vec2[] = [{ x: isl.x - rx * 0.7, y: isl.y + ry * 0.3 }, { x: isl.x, y: isl.y + ry * 2.2 }, { x: isl.x + rx * 0.7, y: isl.y + ry * 0.3 }];
        fillPath(ctx, under, mix(stoneC(a), '#000000', 0.2));
        fillPath(ctx, top, lightGradient(ctx, isl.x - rx, isl.y - ry, isl.x + rx, isl.y + ry, tinted(a, a.palette.grass), 0.3, 0.2));
        inkLine(ctx, top, rgba(ink(a), 0.4), Math.max(1, w * 0.006));
        inkLine(ctx, under, rgba(ink(a), 0.35), Math.max(1, w * 0.006));
        // A thin waterfall trailing off the underside into mist.
        ctx.strokeStyle = rgba('#ffffff', 0.5); ctx.lineWidth = Math.max(1, w * 0.008);
        ctx.beginPath(); ctx.moveTo(isl.x, isl.y + ry * 2); ctx.lineTo(isl.x + rx * 0.1, isl.y + ry * 3.2); ctx.stroke();
        for (let i = 0; i < 6; i++) {
          const py = isl.y + ry * (2.4 + i * 0.25);
          ctx.fillStyle = rgba('#ffffff', 0.18 - i * 0.02);
          ctx.beginPath(); ctx.ellipse(isl.x, py, rx * 0.3, ry * 0.3, 0, 0, Math.PI * 2); ctx.fill();
        }
      }
    },
  },
  {
    id: 'nat/great-waterfall', label: 'Great Waterfall', group: 'terrain', sub: 'World nature',
    tags: ['waterfall', 'cliff', 'cascade'], aspect: 0.9, defaultWidth: 140, variants: 2,
    kinds: ['region', 'operational', 'hex'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const rock = stoneC(a);
      const cliff: Vec2[] = [{ x: 0, y: 0 }, { x: w * 0.4, y: 0 }, { x: w * 0.5, y: h * 0.7 }, { x: w * 0.42, y: h }, { x: 0, y: h }];
      fillPath(ctx, cliff, lightGradient(ctx, 0, 0, w * 0.4, h, rock, 0.16, 0.4));
      inkLine(ctx, cliff, rgba(ink(a), 0.55), Math.max(1, w * 0.01));
      const cliff2: Vec2[] = [{ x: w, y: 0 }, { x: w * 0.62, y: 0 }, { x: w * 0.55, y: h * 0.7 }, { x: w * 0.6, y: h }, { x: w, y: h }];
      fillPath(ctx, cliff2, lightGradient(ctx, w * 0.55, 0, w, h, mix(rock, '#000000', 0.15), 0.14, 0.36));
      inkLine(ctx, cliff2, rgba(ink(a), 0.5), Math.max(1, w * 0.01));
      const chuteX0 = w * 0.4, chuteX1 = w * 0.62;
      const chute: Vec2[] = [{ x: chuteX0 + w * 0.02, y: 0 }, { x: chuteX1 - w * 0.02, y: 0 }, { x: w * 0.53, y: h * 0.72 }, { x: w * 0.47, y: h * 0.72 }];
      fillPath(ctx, chute, mix('#ffffff', a.palette.water, 0.15));
      ctx.save(); tracePath(ctx, chute, true); ctx.clip();
      for (let i = 0; i < 10; i++) {
        const x = chuteX0 + (chuteX1 - chuteX0) * rng.next();
        ctx.strokeStyle = rgba('#ffffff', rng.float(0.3, 0.6)); ctx.lineWidth = Math.max(1, w * 0.006);
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + rng.float(-w * 0.03, w * 0.03), h * 0.7); ctx.stroke();
      }
      ctx.restore();
      radialGlow(ctx, w * 0.5, h * 0.78, w * 0.32, '#ffffff', 0.55);
      speckle(ctx, w * 0.3, h * 0.68, w * 0.4, h * 0.2, 30, rgba('#ffffff', 0.5), 1, w * 0.012, rng);
    },
  },
  {
    id: 'nat/canyon-world', label: 'Canyon', group: 'terrain', sub: 'World nature',
    tags: ['canyon', 'gorge', 'strata', 'desert'], aspect: 2.2, defaultWidth: 220, variants: 2,
    kinds: ['region', 'operational', 'hex'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const rock = tinted(a, a.palette.desert);
      const bands = 6;
      for (let b = 0; b < bands; b++) {
        const t = b / bands;
        const depth = t;
        const left = w * (0.02 + depth * 0.34), right = w * (0.98 - depth * 0.34);
        const y0 = h * (0.06 + t * 0.13), y1 = h * (0.06 + (t + 1 / bands) * 0.13 * bands / bands + t * 0);
        const pts: Vec2[] = [{ x: 0, y: y0 }, { x: left, y: y0 }, { x: left, y: h }, { x: 0, y: h }];
        const ptsR: Vec2[] = [{ x: right, y: y0 }, { x: w, y: y0 }, { x: w, y: h }, { x: right, y: h }];
        const shade = mix(rock, '#3a2418', t * 0.5);
        if (b === 0) { fillPath(ctx, pts, shade); fillPath(ctx, ptsR, shade); }
        else {
          const band: Vec2[] = [{ x: 0, y: y0 }, { x: left, y: y0 }, { x: left, y: h }, { x: 0, y: h }];
          fillPath(ctx, band, shade);
          const bandR: Vec2[] = [{ x: right, y: y0 }, { x: w, y: y0 }, { x: w, y: h }, { x: right, y: h }];
          fillPath(ctx, bandR, shade);
        }
        inkLine(ctx, [{ x: 0, y: y0 }, { x: left, y: y0 }], rgba(ink(a), 0.2), Math.max(1, w * 0.004));
        inkLine(ctx, [{ x: right, y: y0 }, { x: w, y: y0 }], rgba(ink(a), 0.2), Math.max(1, w * 0.004));
        void y1;
      }
      // River at the canyon floor.
      const riverY = h * 0.9;
      const riverPts: Vec2[] = [];
      for (let i = 0; i <= 10; i++) riverPts.push({ x: (i / 10) * w, y: riverY + Math.sin(i + rng.float(0, 1)) * h * 0.02 });
      inkLine(ctx, riverPts, mix(a.palette.water, a.palette.deepWater, 0.3), Math.max(2, h * 0.05));
    },
  },
  {
    id: 'nat/fjord-world', label: 'Fjord', group: 'terrain', sub: 'World nature',
    tags: ['fjord', 'inlet', 'cliffs', 'nordic'], aspect: 1.6, defaultWidth: 170, variants: 2,
    kinds: ['region', 'operational', 'hex'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const rock = stoneC(a);
      const left: Vec2[] = [{ x: 0, y: 0 }, { x: w * 0.42, y: 0 }, { x: w * 0.3, y: h * 0.4 }, { x: w * 0.18, y: h }, { x: 0, y: h }];
      const right: Vec2[] = [{ x: w, y: 0 }, { x: w * 0.6, y: 0 }, { x: w * 0.72, y: h * 0.4 }, { x: w * 0.82, y: h }, { x: w, y: h }];
      fillPath(ctx, left, lightGradient(ctx, 0, 0, w * 0.4, h, rock, 0.2, 0.35));
      fillPath(ctx, right, lightGradient(ctx, w * 0.6, 0, w, h, mix(rock, '#000000', 0.1), 0.15, 0.4));
      inkLine(ctx, left, rgba(ink(a), 0.5), Math.max(1, w * 0.008));
      inkLine(ctx, right, rgba(ink(a), 0.5), Math.max(1, w * 0.008));
      const wg = ctx.createLinearGradient(0, 0, 0, h);
      wg.addColorStop(0, a.palette.water); wg.addColorStop(1, a.palette.deepWater);
      ctx.save();
      const water: Vec2[] = [{ x: w * 0.18, y: h }, { x: w * 0.3, y: h * 0.4 }, { x: w * 0.42, y: 0 }, { x: w * 0.6, y: 0 }, { x: w * 0.72, y: h * 0.4 }, { x: w * 0.82, y: h }];
      fillPath(ctx, water, wg);
      ctx.restore();
      if (a.variant % 2 === 1) {
        speckle(ctx, w * 0.2, 0, w * 0.6, h * 0.15, 10, rgba('#ffffff', 0.3), w * 0.01, w * 0.03, rng);
      }
    },
  },
  {
    id: 'nat/salt-flat', label: 'Salt Flat', group: 'terrain', sub: 'World nature',
    tags: ['salt flat', 'desert', 'flat', 'mirage'], aspect: 2.2, defaultWidth: 200, variants: 2,
    kinds: ['region', 'operational', 'hex'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const horizon = h * 0.55;
      const sky = ctx.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, mix(a.palette.parchment, '#dff0f7', 0.4)); sky.addColorStop(1, '#eef6f2');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, w, horizon);
      const flatColor = tinted(a, mix('#f4efe4', a.palette.desert, 0.15));
      ctx.fillStyle = lightGradient(ctx, 0, horizon, 0, h, flatColor, 0.1, 0.06);
      ctx.fillRect(0, horizon, w, h - horizon);
      const cols = 8 + (a.variant % 2) * 4;
      const rows = 4;
      for (let r = 0; r < rows; r++) {
        const y = horizon + (h - horizon) * ((r + 0.5) / rows);
        for (let c = 0; c < cols; c++) {
          const x = w * ((c + 0.5) / cols) + (r % 2) * (w / cols / 2) + rng.float(-w * 0.01, w * 0.01);
          ctx.strokeStyle = rgba(ink(a), 0.14 + r * 0.03); ctx.lineWidth = Math.max(1, w * 0.003);
          ctx.beginPath();
          ctx.moveTo(x - w / cols / 2.2, y - h * 0.02); ctx.lineTo(x, y); ctx.lineTo(x + w / cols / 2.2, y - h * 0.02);
          ctx.lineTo(x, y + h * 0.03); ctx.closePath(); ctx.stroke();
        }
      }
      inkLine(ctx, [{ x: 0, y: horizon }, { x: w, y: horizon }], rgba(ink(a), 0.15), Math.max(1, h * 0.006));
    },
  },
  {
    id: 'nat/badlands-world', label: 'Badlands', group: 'terrain', sub: 'World nature',
    tags: ['badlands', 'eroded', 'arid', 'hoodoo'], aspect: 2, defaultWidth: 190, variants: 2,
    kinds: ['region', 'operational', 'hex'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const baseY = h * 0.92;
      groundShadow(ctx, w * 0.5, baseY, w * 0.46, h * 0.06, 0.22);
      const n = 5 + (a.variant % 2) * 2;
      const stripe = ['#c9a06a', '#b8895a', '#a8714a', '#9a5f42'];
      for (let i = 0; i < n; i++) {
        const cx = w * ((i + 0.5) / n) + rng.float(-w * 0.02, w * 0.02);
        const peakH = h * rng.float(0.3, 0.62);
        const halfW = (w / n) * rng.float(0.4, 0.6);
        const pts: Vec2[] = [
          { x: cx - halfW, y: baseY }, { x: cx - halfW * 0.5, y: baseY - peakH * 0.5 },
          { x: cx - halfW * 0.15, y: baseY - peakH * 0.85 }, { x: cx, y: baseY - peakH },
          { x: cx + halfW * 0.2, y: baseY - peakH * 0.8 }, { x: cx + halfW * 0.5, y: baseY - peakH * 0.45 },
          { x: cx + halfW, y: baseY },
        ];
        ctx.save(); tracePath(ctx, pts, true); ctx.clip();
        const bandCount = 5;
        for (let s = 0; s < bandCount; s++) {
          const sy0 = baseY - (s / bandCount) * peakH, sy1 = baseY - ((s + 1) / bandCount) * peakH;
          ctx.fillStyle = mix(stripe[s % stripe.length], '#000000', s * 0.03);
          ctx.fillRect(cx - halfW, sy1, halfW * 2, sy0 - sy1);
        }
        ctx.restore();
        inkLine(ctx, pts, rgba(ink(a), 0.5), Math.max(1, w * 0.006));
      }
    },
  },
  {
    id: 'nat/mesa-butte', label: 'Mesa', group: 'terrain', sub: 'World nature',
    tags: ['mesa', 'butte', 'tower', 'desert'], aspect: 1.3, defaultWidth: 140, variants: 3,
    kinds: ['region', 'operational', 'hex'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const rock = stoneC(a);
      const baseY = h * 0.92;
      groundShadow(ctx, w * 0.55, baseY, w * 0.4, h * 0.06, 0.24);
      if (a.variant % 3 !== 0) {
        // Smaller companion butte behind, for depth.
        const bx = w * 0.28, btop = h * rng.float(0.4, 0.55);
        const back: Vec2[] = [{ x: bx - w * 0.14, y: baseY - h * 0.04 }, { x: bx - w * 0.1, y: btop }, { x: bx + w * 0.1, y: btop }, { x: bx + w * 0.14, y: baseY - h * 0.04 }];
        ctx.globalAlpha = 0.6;
        fillPath(ctx, back, mix(rock, a.palette.parchment, 0.3));
        ctx.globalAlpha = 1;
      }
      const cx = w * 0.6, topY = h * 0.22;
      const halfBase = w * 0.22, halfTop = w * 0.15;
      const pts: Vec2[] = [
        { x: cx - halfBase, y: baseY }, { x: cx - halfTop * 1.1, y: topY + h * 0.06 }, { x: cx - halfTop, y: topY },
        { x: cx + halfTop, y: topY }, { x: cx + halfTop * 1.1, y: topY + h * 0.06 }, { x: cx + halfBase, y: baseY },
      ];
      fillPath(ctx, pts, lightGradient(ctx, cx - halfBase, topY, cx + halfBase, baseY, rock, 0.2, 0.4));
      const cap: Vec2[] = [{ x: cx - halfTop, y: topY }, { x: cx + halfTop, y: topY }, { x: cx + halfTop * 1.05, y: topY + h * 0.03 }, { x: cx - halfTop * 1.05, y: topY + h * 0.03 }];
      fillPath(ctx, cap, mix(a.palette.lowland, rock, 0.3));
      inkLine(ctx, pts, rgba(ink(a), 0.6), Math.max(1, w * 0.008));
      ctx.save(); tracePath(ctx, pts, true); ctx.clip();
      hatch(ctx, cx - halfBase, topY, halfBase * 2, baseY - topY, 0, Math.max(2, w * 0.03), rgba(ink(a), 0.14), 1);
      ctx.restore();
    },
  },
  {
    id: 'nat/ice-shelf-world', label: 'Ice Shelf', group: 'terrain', sub: 'World nature',
    tags: ['ice shelf', 'glacier', 'arctic', 'sea ice'], aspect: 1.8, defaultWidth: 180, variants: 2,
    kinds: ['region', 'operational', 'hex'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, a.palette.water); g.addColorStop(1, a.palette.deepWater);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      const edgeY = h * (a.variant % 2 === 0 ? 0.58 : 0.5);
      const ice = mix(a.palette.snow, '#dff0f7', 0.3);
      const top: Vec2[] = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: edgeY - h * 0.02 }];
      const n = 10;
      for (let i = n; i >= 0; i--) {
        const x = (i / n) * w;
        top.push({ x, y: edgeY + Math.sin(i * 1.7) * h * 0.03 });
      }
      fillPath(ctx, top, lightGradient(ctx, 0, 0, 0, edgeY, ice, 0.25, 0.12));
      inkLine(ctx, top.slice(2), rgba(mix(ink(a), '#4a7a9a', 0.4), 0.55), Math.max(1, h * 0.01));
      ctx.save(); tracePath(ctx, top, true); ctx.clip();
      const crevasses = 5 + (a.variant % 2) * 2;
      for (let i = 0; i < crevasses; i++) {
        const x = w * rng.float(0.1, 0.9);
        ctx.strokeStyle = rgba('#4a7a9a', 0.4); ctx.lineWidth = Math.max(1, w * 0.006);
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + rng.float(-w * 0.04, w * 0.04), edgeY * rng.float(0.6, 0.95)); ctx.stroke();
      }
      speckle(ctx, 0, 0, w, edgeY, 12, rgba('#ffffff', 0.4), w * 0.015, w * 0.035, rng);
      ctx.restore();
    },
  },
];

export const NATURE_ASSETS: AssetDef[] = [
  ...TREES_TOP,
  ...UNDERGROWTH_TOP,
  ...ROCK_GROUND_TOP,
  ...WATER_TOP,
  ...WORLD_NATURE,
];
