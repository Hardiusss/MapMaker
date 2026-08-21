/** Trees, forests, scrub and the odd fungal grove. */
import type { AssetDef, AssetDrawArgs } from '../types';
import { blob, fillPath, groundShadow, inkLine, lightGradient, tracePath, speckle } from '../draw';
import { mix, rgba } from '../../core/color';
import type { Vec2 } from '../../core/types';

const ink = (a: AssetDrawArgs) => a.palette.ink;
const leaf = (a: AssetDrawArgs) => (a.tint ? mix(a.palette.forest, a.tint, a.tintStrength) : a.palette.forest);
const bark = (a: AssetDrawArgs) => mix(a.palette.ink, '#6b4a2a', 0.55);

function broadleaf(a: AssetDrawArgs, cx: number, groundY: number, size: number, alpha = 1): void {
  const { ctx, rng } = a;
  const trunkH = size * 0.42;
  const canopyR = size * 0.42;
  ctx.save();
  ctx.globalAlpha = alpha;
  groundShadow(ctx, cx + size * 0.06, groundY, canopyR * 0.75, size * 0.09, 0.3);
  // Trunk
  const tw = size * 0.09;
  ctx.fillStyle = bark(a);
  ctx.beginPath();
  ctx.moveTo(cx - tw * 0.5, groundY);
  ctx.quadraticCurveTo(cx - tw * 0.28, groundY - trunkH * 0.6, cx - tw * 0.22, groundY - trunkH);
  ctx.lineTo(cx + tw * 0.22, groundY - trunkH);
  ctx.quadraticCurveTo(cx + tw * 0.32, groundY - trunkH * 0.6, cx + tw * 0.55, groundY);
  ctx.closePath();
  ctx.fill();
  // Canopy: three overlapping lobes.
  const base = leaf(a);
  const cy = groundY - trunkH - canopyR * 0.55;
  const lobes: [number, number, number][] = [
    [cx - canopyR * 0.42, cy + canopyR * 0.2, canopyR * 0.62],
    [cx + canopyR * 0.4, cy + canopyR * 0.24, canopyR * 0.58],
    [cx, cy - canopyR * 0.22, canopyR * 0.72],
  ];
  for (const [lx, ly, lr] of lobes) {
    const pts = blob(lx, ly, lr, lr * 0.86, rng.int(5, 7), 0.14, rng);
    fillPath(ctx, pts, lightGradient(ctx, lx - lr, ly - lr, lx + lr, ly + lr, base, 0.32, 0.34));
    inkLine(ctx, pts, rgba(ink(a), 0.5), Math.max(1, size * 0.016));
  }
  ctx.restore();
}

function conifer(a: AssetDrawArgs, cx: number, groundY: number, size: number, alpha = 1): void {
  const { ctx, rng } = a;
  ctx.save();
  ctx.globalAlpha = alpha;
  groundShadow(ctx, cx + size * 0.05, groundY, size * 0.28, size * 0.07, 0.28);
  const base = mix(leaf(a), '#123a2a', 0.35);
  const tiers = rng.int(3, 5);
  const treeH = size * 0.92;
  const tw = size * 0.06;
  ctx.fillStyle = bark(a);
  ctx.fillRect(cx - tw / 2, groundY - treeH * 0.2, tw, treeH * 0.2);
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const y = groundY - treeH * (0.16 + t * 0.78);
    const half = size * (0.34 - t * 0.24) * rng.float(0.92, 1.08);
    const tierH = treeH * 0.3;
    const pts: Vec2[] = [
      { x: cx - half, y },
      { x: cx - half * 0.42, y: y - tierH * 0.3 },
      { x: cx, y: y - tierH },
      { x: cx + half * 0.42, y: y - tierH * 0.3 },
      { x: cx + half, y },
      { x: cx + half * 0.5, y: y + tierH * 0.08 },
      { x: cx - half * 0.5, y: y + tierH * 0.08 },
    ];
    fillPath(ctx, pts, lightGradient(ctx, cx - half, y - tierH, cx + half, y, base, 0.3, 0.36));
    inkLine(ctx, pts, rgba(ink(a), 0.45), Math.max(1, size * 0.012));
  }
  ctx.restore();
}

export const VEGETATION_ASSETS: AssetDef[] = [
  {
    id: 'veg/tree-broadleaf', label: 'Broadleaf Tree', group: 'vegetation', tags: ['oak', 'tree'],
    aspect: 0.9, defaultWidth: 70, variants: 3,
    draw(a) { broadleaf(a, a.w * 0.5, a.h * 0.94, Math.min(a.w, a.h) * 0.95); },
  },
  {
    id: 'veg/tree-pine', label: 'Pine Tree', group: 'vegetation', tags: ['conifer', 'fir'],
    aspect: 0.75, defaultWidth: 60, variants: 3,
    draw(a) { conifer(a, a.w * 0.5, a.h * 0.95, Math.min(a.w * 1.3, a.h) * 0.95); },
  },
  {
    id: 'veg/tree-dead', label: 'Dead Tree', group: 'vegetation', tags: ['bare', 'blighted'],
    aspect: 0.9, defaultWidth: 64, variants: 3,
    draw(a) {
      const { ctx, w, h, rng } = a;
      const cx = w * 0.5, groundY = h * 0.94;
      groundShadow(ctx, cx, groundY, w * 0.24, h * 0.05, 0.3);
      const col = mix(a.palette.ink, '#6b5a49', 0.5);
      const branch = (x: number, y: number, ang: number, lenPx: number, width: number, depth: number) => {
        if (depth <= 0 || lenPx < 2) return;
        const ex = x + Math.cos(ang) * lenPx;
        const ey = y + Math.sin(ang) * lenPx;
        ctx.strokeStyle = col; ctx.lineWidth = width; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + Math.cos(ang + rng.float(-0.3, 0.3)) * lenPx * 0.5, y + Math.sin(ang + rng.float(-0.3, 0.3)) * lenPx * 0.5, ex, ey);
        ctx.stroke();
        branch(ex, ey, ang - rng.float(0.25, 0.6), lenPx * rng.float(0.6, 0.78), width * 0.65, depth - 1);
        branch(ex, ey, ang + rng.float(0.25, 0.6), lenPx * rng.float(0.6, 0.78), width * 0.65, depth - 1);
      };
      branch(cx, groundY, -Math.PI / 2, h * 0.34, Math.max(2, w * 0.06), 4);
    },
  },
  {
    id: 'veg/tree-palm', label: 'Palm Tree', group: 'vegetation', tags: ['tropical', 'beach'],
    aspect: 0.9, defaultWidth: 70, variants: 2,
    draw(a) {
      const { ctx, w, h, rng } = a;
      const cx = w * 0.5, groundY = h * 0.94;
      groundShadow(ctx, cx, groundY, w * 0.22, h * 0.05, 0.28);
      const lean = rng.float(-0.18, 0.18);
      const topX = cx + lean * w * 0.6, topY = h * 0.3;
      ctx.strokeStyle = mix(a.palette.ink, '#8a6b3e', 0.5);
      ctx.lineWidth = Math.max(2, w * 0.07);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, groundY);
      ctx.quadraticCurveTo(cx + lean * w * 0.1, h * 0.6, topX, topY);
      ctx.stroke();
      const fronds = rng.int(6, 8);
      for (let i = 0; i < fronds; i++) {
        const ang = (i / fronds) * Math.PI * 2 + rng.float(-0.2, 0.2);
        const len = w * rng.float(0.24, 0.36);
        const ex = topX + Math.cos(ang) * len;
        const ey = topY + Math.sin(ang) * len * 0.6 + h * 0.05;
        ctx.strokeStyle = mix(leaf(a), '#3f8f4a', 0.4);
        ctx.lineWidth = Math.max(2, w * 0.05);
        ctx.beginPath(); ctx.moveTo(topX, topY);
        ctx.quadraticCurveTo(topX + Math.cos(ang) * len * 0.6, topY + Math.sin(ang) * len * 0.2, ex, ey);
        ctx.stroke();
      }
    },
  },
  {
    id: 'veg/forest-broadleaf', label: 'Broadleaf Wood', group: 'vegetation', tags: ['forest', 'wood'],
    aspect: 1.6, defaultWidth: 240, variants: 3, kinds: ['region', 'hex'],
    draw(a) {
      const { w, h, rng } = a;
      const n = rng.int(9, 15);
      const pts: { x: number; y: number; s: number }[] = [];
      for (let i = 0; i < n; i++) {
        pts.push({ x: rng.float(w * 0.1, w * 0.9), y: rng.float(h * 0.4, h * 0.95), s: rng.float(0.4, 0.62) });
      }
      pts.sort((p, q) => p.y - q.y);
      for (const p of pts) broadleaf(a, p.x, p.y, Math.min(w, h) * p.s, 0.95);
    },
  },
  {
    id: 'veg/forest-pine', label: 'Pine Wood', group: 'vegetation', tags: ['forest', 'taiga'],
    aspect: 1.6, defaultWidth: 240, variants: 3, kinds: ['region', 'hex'],
    draw(a) {
      const { w, h, rng } = a;
      const n = rng.int(10, 17);
      const pts: { x: number; y: number; s: number }[] = [];
      for (let i = 0; i < n; i++) {
        pts.push({ x: rng.float(w * 0.08, w * 0.92), y: rng.float(h * 0.4, h * 0.96), s: rng.float(0.38, 0.6) });
      }
      pts.sort((p, q) => p.y - q.y);
      for (const p of pts) conifer(a, p.x, p.y, Math.min(w, h) * p.s, 0.95);
    },
  },
  {
    id: 'veg/forest-mixed', label: 'Mixed Wood', group: 'vegetation', tags: ['forest'],
    aspect: 1.6, defaultWidth: 240, variants: 3, kinds: ['region', 'hex'],
    draw(a) {
      const { w, h, rng } = a;
      const n = rng.int(10, 16);
      const pts: { x: number; y: number; s: number; pine: boolean }[] = [];
      for (let i = 0; i < n; i++) {
        pts.push({ x: rng.float(w * 0.08, w * 0.92), y: rng.float(h * 0.4, h * 0.96), s: rng.float(0.38, 0.6), pine: rng.bool() });
      }
      pts.sort((p, q) => p.y - q.y);
      for (const p of pts) (p.pine ? conifer : broadleaf)(a, p.x, p.y, Math.min(w, h) * p.s, 0.95);
    },
  },
  {
    id: 'veg/bush', label: 'Bush', group: 'vegetation', tags: ['shrub', 'scrub'],
    aspect: 1.3, defaultWidth: 48, variants: 4,
    draw(a) {
      const { ctx, w, h, rng } = a;
      groundShadow(ctx, w * 0.5, h * 0.86, w * 0.34, h * 0.1, 0.26);
      const base = mix(leaf(a), a.palette.grass, 0.4);
      const n = rng.int(3, 5);
      for (let i = 0; i < n; i++) {
        const cx = w * rng.float(0.28, 0.72);
        const cy = h * rng.float(0.5, 0.72);
        const r = w * rng.float(0.16, 0.26);
        const pts = blob(cx, cy, r, r * 0.8, rng.int(5, 7), 0.2, rng);
        fillPath(ctx, pts, lightGradient(ctx, cx - r, cy - r, cx + r, cy + r, base, 0.3, 0.3));
        inkLine(ctx, pts, rgba(ink(a), 0.4), Math.max(1, w * 0.02));
      }
    },
  },
  {
    id: 'veg/cactus', label: 'Cactus', group: 'vegetation', tags: ['desert', 'saguaro'],
    aspect: 0.8, defaultWidth: 48, variants: 3,
    draw(a) {
      const { ctx, w, h, rng } = a;
      const g = mix('#4f7f4a', leaf(a), 0.4);
      const cx = w * 0.5, groundY = h * 0.94;
      groundShadow(ctx, cx, groundY, w * 0.2, h * 0.04, 0.25);
      const bw = w * 0.22;
      ctx.fillStyle = g;
      ctx.strokeStyle = rgba(ink(a), 0.5);
      ctx.lineWidth = Math.max(1, w * 0.02);
      const cap = (x: number, y0: number, y1: number, ww: number) => {
        ctx.beginPath();
        ctx.moveTo(x - ww / 2, y0);
        ctx.lineTo(x - ww / 2, y1 + ww / 2);
        ctx.arc(x, y1 + ww / 2, ww / 2, Math.PI, 0);
        ctx.lineTo(x + ww / 2, y0);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
      };
      cap(cx, groundY, h * 0.22, bw);
      if (a.variant !== 0) {
        const side = rng.sign();
        ctx.beginPath();
        ctx.strokeStyle = g;
        ctx.lineWidth = bw * 0.7;
        ctx.lineCap = 'round';
        ctx.moveTo(cx + side * bw * 0.3, h * 0.62);
        ctx.lineTo(cx + side * w * 0.26, h * 0.62);
        ctx.lineTo(cx + side * w * 0.26, h * 0.42);
        ctx.stroke();
      }
    },
  },
  {
    id: 'veg/mushroom', label: 'Giant Mushrooms', group: 'vegetation', tags: ['fungus', 'underdark'],
    aspect: 1.2, defaultWidth: 70, variants: 3, kinds: ['cave', 'dungeon', 'battle'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      groundShadow(ctx, w * 0.5, h * 0.9, w * 0.34, h * 0.08, 0.3);
      const n = rng.int(2, 4);
      for (let i = 0; i < n; i++) {
        const cx = w * rng.float(0.25, 0.75);
        const groundY = h * rng.float(0.78, 0.92);
        const s = Math.min(w, h) * rng.float(0.3, 0.5);
        ctx.fillStyle = '#e8ded0';
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.1, groundY);
        ctx.quadraticCurveTo(cx - s * 0.07, groundY - s * 0.5, cx - s * 0.09, groundY - s * 0.6);
        ctx.lineTo(cx + s * 0.09, groundY - s * 0.6);
        ctx.quadraticCurveTo(cx + s * 0.07, groundY - s * 0.5, cx + s * 0.1, groundY);
        ctx.closePath(); ctx.fill();
        const capColor = rng.pick(['#a8484f', '#6b4a8a', '#4a7f8a', '#9c6a3a']);
        const cy = groundY - s * 0.6;
        ctx.fillStyle = capColor;
        ctx.beginPath();
        ctx.ellipse(cx, cy, s * 0.36, s * 0.28, 0, Math.PI, 0);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = rgba('#ffffff', 0.5);
        for (let k = 0; k < 4; k++) {
          ctx.beginPath();
          ctx.arc(cx + rng.float(-s * 0.24, s * 0.24), cy - rng.float(0, s * 0.16), s * rng.float(0.025, 0.05), 0, Math.PI * 2);
          ctx.fill();
        }
        inkLine(ctx, [{ x: cx - s * 0.36, y: cy }, { x: cx + s * 0.36, y: cy }], rgba(ink(a), 0.35), Math.max(1, s * 0.03));
      }
    },
  },
  {
    id: 'veg/reeds', label: 'Reeds', group: 'vegetation', tags: ['marsh', 'swamp', 'grass'],
    aspect: 1.4, defaultWidth: 60, variants: 3,
    draw(a) {
      const { ctx, w, h, rng } = a;
      const c = mix(a.palette.swamp, a.palette.grass, 0.5);
      const n = rng.int(12, 20);
      for (let i = 0; i < n; i++) {
        const x = rng.float(w * 0.1, w * 0.9);
        const groundY = h * rng.float(0.85, 0.98);
        const len = h * rng.float(0.35, 0.7);
        const bend = rng.float(-w * 0.12, w * 0.12);
        ctx.strokeStyle = rgba(c, rng.float(0.6, 1));
        ctx.lineWidth = Math.max(1, w * 0.015);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x, groundY);
        ctx.quadraticCurveTo(x + bend * 0.4, groundY - len * 0.6, x + bend, groundY - len);
        ctx.stroke();
      }
    },
  },
  {
    id: 'veg/vines', label: 'Vines & Ivy', group: 'vegetation', tags: ['overgrowth', 'ruins'],
    aspect: 1, defaultWidth: 90, variants: 3,
    draw(a) {
      const { ctx, w, h, rng } = a;
      const c = mix(leaf(a), '#3d7a35', 0.5);
      const strands = rng.int(3, 6);
      for (let s = 0; s < strands; s++) {
        let x = rng.float(w * 0.1, w * 0.9), y = 0;
        const pts: Vec2[] = [{ x, y }];
        while (y < h) {
          y += h * rng.float(0.08, 0.16);
          x += rng.float(-w * 0.08, w * 0.08);
          pts.push({ x, y });
        }
        inkLine(ctx, pts, rgba(c, 0.9), Math.max(1, w * 0.014));
        for (const p of pts) {
          ctx.fillStyle = rgba(c, 0.85);
          ctx.beginPath();
          ctx.ellipse(p.x + rng.float(-w * 0.03, w * 0.03), p.y, w * 0.025, w * 0.016, rng.float(0, Math.PI), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },
  },
];
