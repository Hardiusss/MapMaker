/** Settlements and standalone structures seen from a map-maker's angle. */
import type { AssetDef, AssetDrawArgs } from '../types';
import { blob, fillPath, groundShadow, inkLine, lightGradient, roundRect, star, tracePath, speckle } from '../draw';
import { mix, rgba } from '../../core/color';
import type { Vec2 } from '../../core/types';

const ink = (a: AssetDrawArgs) => a.palette.ink;
const roofColor = (a: AssetDrawArgs) => (a.tint ? mix('#8a3f34', a.tint, a.tintStrength) : '#8a3f34');
const wallColor = (a: AssetDrawArgs) => mix(a.palette.parchment, '#c9b89a', 0.5);
const stone = (a: AssetDrawArgs) => mix(a.palette.rock, '#9a9184', 0.4);

/** A single pitched-roof house drawn in three-quarter view. */
function house(a: AssetDrawArgs, x: number, y: number, w: number, h: number, rot = 0): void {
  const { ctx, rng } = a;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const bodyH = h * 0.55;
  const roofH = h * 0.45;
  // Body
  ctx.fillStyle = lightGradient(ctx, -w / 2, 0, w / 2, bodyH, wallColor(a), 0.25, 0.28);
  ctx.fillRect(-w / 2, 0, w, bodyH);
  ctx.strokeStyle = rgba(ink(a), 0.6);
  ctx.lineWidth = Math.max(0.8, w * 0.04);
  ctx.strokeRect(-w / 2, 0, w, bodyH);
  // Roof
  const roof: Vec2[] = [
    { x: -w * 0.58, y: 0 }, { x: 0, y: -roofH }, { x: w * 0.58, y: 0 },
  ];
  ctx.fillStyle = lightGradient(ctx, -w / 2, -roofH, w / 2, 0, roofColor(a), 0.3, 0.32);
  ctx.beginPath();
  ctx.moveTo(roof[0].x, roof[0].y); ctx.lineTo(roof[1].x, roof[1].y); ctx.lineTo(roof[2].x, roof[2].y);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // Door + window
  ctx.fillStyle = rgba(ink(a), 0.65);
  ctx.fillRect(-w * 0.1, bodyH * 0.32, w * 0.2, bodyH * 0.68);
  if (rng.bool(0.6)) ctx.fillRect(w * 0.18, bodyH * 0.25, w * 0.16, bodyH * 0.3);
  ctx.restore();
}

function tower(a: AssetDrawArgs, x: number, groundY: number, w: number, h: number, roof = true): void {
  const { ctx, rng } = a;
  const s = stone(a);
  ctx.save();
  ctx.fillStyle = lightGradient(ctx, x - w / 2, groundY - h, x + w / 2, groundY, s, 0.28, 0.34);
  ctx.fillRect(x - w / 2, groundY - h, w, h);
  ctx.strokeStyle = rgba(ink(a), 0.65);
  ctx.lineWidth = Math.max(1, w * 0.06);
  ctx.strokeRect(x - w / 2, groundY - h, w, h);
  // Crenellations
  const merlons = 4;
  const mw = w / (merlons * 2 - 1);
  for (let i = 0; i < merlons; i++) {
    const mx = x - w / 2 + i * mw * 2;
    ctx.fillStyle = mix(s, '#ffffff', 0.12);
    ctx.fillRect(mx, groundY - h - mw * 0.9, mw, mw * 0.9);
    ctx.strokeRect(mx, groundY - h - mw * 0.9, mw, mw * 0.9);
  }
  if (roof) {
    const rh = h * 0.34;
    const ry = groundY - h - mw * 0.9;
    ctx.fillStyle = lightGradient(ctx, x - w, ry - rh, x + w, ry, roofColor(a), 0.3, 0.3);
    ctx.beginPath();
    ctx.moveTo(x - w * 0.62, ry); ctx.lineTo(x, ry - rh); ctx.lineTo(x + w * 0.62, ry);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  // Window slit
  ctx.fillStyle = rgba(ink(a), 0.7);
  ctx.fillRect(x - w * 0.09, groundY - h * 0.62, w * 0.18, h * 0.2);
  ctx.restore();
}

export const SETTLEMENT_ASSETS: AssetDef[] = [
  {
    id: 'town/village', label: 'Village', group: 'settlement', tags: ['hamlet', 'houses'],
    aspect: 1.6, defaultWidth: 120, variants: 3, kinds: ['region', 'hex'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      groundShadow(ctx, w * 0.5, h * 0.86, w * 0.4, h * 0.1, 0.22);
      const n = rng.int(3, 6);
      const placed: Vec2[] = [];
      for (let i = 0; i < n; i++) {
        const x = rng.float(w * 0.2, w * 0.8);
        const y = rng.float(h * 0.4, h * 0.86);
        placed.push({ x, y });
      }
      placed.sort((p, q) => p.y - q.y);
      for (const p of placed) house(a, p.x, p.y - h * 0.2, w * rng.float(0.16, 0.24), h * rng.float(0.3, 0.4), rng.float(-0.08, 0.08));
    },
  },
  {
    id: 'town/town', label: 'Town', group: 'settlement', tags: ['walled', 'burg'],
    aspect: 1.3, defaultWidth: 160, variants: 3, kinds: ['region', 'hex'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const cx = w * 0.5, cy = h * 0.55;
      const wallPts = blob(cx, cy, w * 0.4, h * 0.36, 6, 0.08, rng);
      fillPath(ctx, wallPts, rgba(a.palette.parchmentDark, 0.5));
      inkLine(ctx, wallPts, rgba(ink(a), 0.7), Math.max(1.5, w * 0.02));
      const n = rng.int(6, 10);
      const inside: Vec2[] = [];
      for (let i = 0; i < n; i++) {
        const ang = rng.float(0, Math.PI * 2), r = Math.sqrt(rng.next()) * 0.72;
        inside.push({ x: cx + Math.cos(ang) * w * 0.36 * r, y: cy + Math.sin(ang) * h * 0.32 * r });
      }
      inside.sort((p, q) => p.y - q.y);
      for (const p of inside) house(a, p.x, p.y - h * 0.09, w * rng.float(0.1, 0.15), h * rng.float(0.16, 0.24), rng.float(-0.1, 0.1));
      // Gate towers
      tower(a, cx - w * 0.38, cy + h * 0.08, w * 0.08, h * 0.24, false);
      tower(a, cx + w * 0.38, cy + h * 0.08, w * 0.08, h * 0.24, false);
    },
  },
  {
    id: 'town/city', label: 'City', group: 'settlement', tags: ['capital', 'metropolis'],
    aspect: 1.25, defaultWidth: 210, variants: 3, kinds: ['region', 'hex'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const cx = w * 0.5, cy = h * 0.56;
      const outer = blob(cx, cy, w * 0.44, h * 0.4, 7, 0.07, rng);
      fillPath(ctx, outer, rgba(a.palette.parchmentDark, 0.55));
      inkLine(ctx, outer, rgba(ink(a), 0.75), Math.max(2, w * 0.018));
      const inner = blob(cx, cy - h * 0.04, w * 0.2, h * 0.18, 5, 0.08, rng);
      inkLine(ctx, inner, rgba(ink(a), 0.5), Math.max(1.2, w * 0.012));
      const n = rng.int(12, 18);
      const spots: Vec2[] = [];
      for (let i = 0; i < n; i++) {
        const ang = rng.float(0, Math.PI * 2), r = Math.sqrt(rng.next()) * 0.78;
        spots.push({ x: cx + Math.cos(ang) * w * 0.4 * r, y: cy + Math.sin(ang) * h * 0.36 * r });
      }
      spots.sort((p, q) => p.y - q.y);
      for (const p of spots) house(a, p.x, p.y - h * 0.06, w * rng.float(0.07, 0.11), h * rng.float(0.12, 0.18), rng.float(-0.1, 0.1));
      // Citadel
      tower(a, cx, cy - h * 0.02, w * 0.1, h * 0.3, true);
      // Wall towers around the ring
      for (let i = 0; i < 6; i++) {
        const t = (i / 6) * Math.PI * 2;
        const p = outer[Math.floor((i / 6) * outer.length)];
        tower(a, p.x, p.y + h * 0.03, w * 0.055, h * 0.16, false);
      }
    },
  },
  {
    id: 'town/castle', label: 'Castle', group: 'settlement', tags: ['keep', 'fortress'],
    aspect: 1.4, defaultWidth: 150, variants: 3,
    draw(a) {
      const { ctx, w, h, rng } = a;
      const groundY = h * 0.9;
      groundShadow(ctx, w * 0.5, groundY, w * 0.42, h * 0.08, 0.3);
      const s = stone(a);
      // Curtain wall
      ctx.fillStyle = lightGradient(ctx, w * 0.2, h * 0.5, w * 0.8, groundY, s, 0.22, 0.32);
      ctx.fillRect(w * 0.2, h * 0.55, w * 0.6, groundY - h * 0.55);
      ctx.strokeStyle = rgba(ink(a), 0.7);
      ctx.lineWidth = Math.max(1, w * 0.012);
      ctx.strokeRect(w * 0.2, h * 0.55, w * 0.6, groundY - h * 0.55);
      const merlons = 9;
      const mw = (w * 0.6) / (merlons * 2 - 1);
      for (let i = 0; i < merlons; i++) {
        const mx = w * 0.2 + i * mw * 2;
        ctx.fillStyle = mix(s, '#ffffff', 0.15);
        ctx.fillRect(mx, h * 0.55 - mw, mw, mw);
        ctx.strokeRect(mx, h * 0.55 - mw, mw, mw);
      }
      // Gate
      ctx.fillStyle = rgba(ink(a), 0.75);
      ctx.beginPath();
      ctx.moveTo(w * 0.44, groundY);
      ctx.lineTo(w * 0.44, h * 0.72);
      ctx.arc(w * 0.5, h * 0.72, w * 0.06, Math.PI, 0);
      ctx.lineTo(w * 0.56, groundY);
      ctx.closePath(); ctx.fill();
      // Towers
      tower(a, w * 0.2, groundY, w * 0.13, h * 0.52, true);
      tower(a, w * 0.8, groundY, w * 0.13, h * 0.52, true);
      tower(a, w * 0.5, h * 0.6, w * 0.16, h * 0.44, true);
      // Banner
      ctx.strokeStyle = rgba(ink(a), 0.8);
      ctx.lineWidth = Math.max(1, w * 0.008);
      ctx.beginPath(); ctx.moveTo(w * 0.5, h * 0.16); ctx.lineTo(w * 0.5, h * 0.05); ctx.stroke();
      ctx.fillStyle = a.palette.accent;
      ctx.beginPath();
      ctx.moveTo(w * 0.5, h * 0.05); ctx.lineTo(w * 0.62, h * 0.09); ctx.lineTo(w * 0.5, h * 0.13);
      ctx.closePath(); ctx.fill();
    },
  },
  {
    id: 'town/tower', label: 'Lone Tower', group: 'structures', tags: ['wizard', 'watchtower'],
    aspect: 0.7, defaultWidth: 70, variants: 3,
    draw(a) {
      const { ctx, w, h } = a;
      groundShadow(ctx, w * 0.5, h * 0.94, w * 0.3, h * 0.05, 0.3);
      tower(a, w * 0.5, h * 0.94, w * 0.42, h * 0.7, a.variant % 2 === 0);
    },
  },
  {
    id: 'town/ruins', label: 'Ruins', group: 'structures', tags: ['broken', 'ancient'],
    aspect: 1.5, defaultWidth: 120, variants: 4,
    draw(a) {
      const { ctx, w, h, rng } = a;
      const s = mix(stone(a), '#8b8578', 0.4);
      groundShadow(ctx, w * 0.5, h * 0.88, w * 0.4, h * 0.08, 0.24);
      const cols = rng.int(3, 6);
      for (let i = 0; i < cols; i++) {
        const x = w * (0.15 + (i / cols) * 0.7) + rng.float(-w * 0.03, w * 0.03);
        const ch = h * rng.float(0.2, 0.55);
        const cw = w * rng.float(0.06, 0.1);
        ctx.fillStyle = lightGradient(ctx, x - cw, h * 0.88 - ch, x + cw, h * 0.88, s, 0.28, 0.3);
        ctx.fillRect(x - cw / 2, h * 0.88 - ch, cw, ch);
        ctx.strokeStyle = rgba(ink(a), 0.55);
        ctx.lineWidth = Math.max(1, w * 0.01);
        ctx.strokeRect(x - cw / 2, h * 0.88 - ch, cw, ch);
        // Broken top
        ctx.fillStyle = mix(s, '#000000', 0.25);
        ctx.beginPath();
        ctx.moveTo(x - cw / 2, h * 0.88 - ch);
        ctx.lineTo(x - cw * 0.1, h * 0.88 - ch - h * 0.03);
        ctx.lineTo(x + cw / 2, h * 0.88 - ch + h * 0.01);
        ctx.closePath(); ctx.fill();
      }
      // Fallen blocks
      for (let i = 0; i < 6; i++) {
        const x = rng.float(w * 0.1, w * 0.9), y = rng.float(h * 0.8, h * 0.94);
        const bw = w * rng.float(0.04, 0.08);
        ctx.save();
        ctx.translate(x, y); ctx.rotate(rng.float(-0.4, 0.4));
        ctx.fillStyle = s; ctx.fillRect(-bw / 2, -bw / 3, bw, bw * 0.66);
        ctx.strokeStyle = rgba(ink(a), 0.5); ctx.lineWidth = 1; ctx.strokeRect(-bw / 2, -bw / 3, bw, bw * 0.66);
        ctx.restore();
      }
    },
  },
  {
    id: 'town/temple', label: 'Temple', group: 'structures', tags: ['shrine', 'church'],
    aspect: 1.1, defaultWidth: 100, variants: 3,
    draw(a) {
      const { ctx, w, h } = a;
      const groundY = h * 0.9;
      groundShadow(ctx, w * 0.5, groundY, w * 0.36, h * 0.06, 0.28);
      const s = stone(a);
      // Steps
      ctx.fillStyle = mix(s, '#ffffff', 0.15);
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(w * (0.18 - i * 0.02), groundY - i * h * 0.03, w * (0.64 + i * 0.04), h * 0.03);
      }
      // Columns
      const cols = 5;
      for (let i = 0; i < cols; i++) {
        const x = w * (0.24 + (i / (cols - 1)) * 0.52);
        ctx.fillStyle = lightGradient(ctx, x - w * 0.03, h * 0.4, x + w * 0.03, groundY, s, 0.3, 0.28);
        ctx.fillRect(x - w * 0.035, h * 0.4, w * 0.07, groundY - h * 0.49);
      }
      // Pediment
      ctx.fillStyle = lightGradient(ctx, w * 0.15, h * 0.15, w * 0.85, h * 0.4, s, 0.3, 0.25);
      ctx.beginPath();
      ctx.moveTo(w * 0.14, h * 0.4); ctx.lineTo(w * 0.5, h * 0.14); ctx.lineTo(w * 0.86, h * 0.4);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.65); ctx.lineWidth = Math.max(1, w * 0.012); ctx.stroke();
      ctx.fillStyle = a.palette.accent;
      const st = star(w * 0.5, h * 0.3, w * 0.05, w * 0.02, 4);
      fillPath(ctx, st, a.palette.accent);
    },
  },
  {
    id: 'town/windmill', label: 'Windmill', group: 'structures', tags: ['mill', 'farm'],
    aspect: 0.9, defaultWidth: 80, variants: 2,
    draw(a) {
      const { ctx, w, h, rng } = a;
      const groundY = h * 0.92;
      groundShadow(ctx, w * 0.5, groundY, w * 0.26, h * 0.05, 0.28);
      const bodyW = w * 0.3, bodyH = h * 0.45;
      ctx.fillStyle = lightGradient(ctx, w * 0.5 - bodyW, groundY - bodyH, w * 0.5 + bodyW, groundY, wallColor(a), 0.25, 0.3);
      ctx.beginPath();
      ctx.moveTo(w * 0.5 - bodyW * 0.7, groundY);
      ctx.lineTo(w * 0.5 - bodyW * 0.45, groundY - bodyH);
      ctx.lineTo(w * 0.5 + bodyW * 0.45, groundY - bodyH);
      ctx.lineTo(w * 0.5 + bodyW * 0.7, groundY);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.6); ctx.lineWidth = Math.max(1, w * 0.015); ctx.stroke();
      // Cap
      ctx.fillStyle = roofColor(a);
      ctx.beginPath();
      ctx.moveTo(w * 0.5 - bodyW * 0.55, groundY - bodyH);
      ctx.lineTo(w * 0.5, groundY - bodyH - h * 0.12);
      ctx.lineTo(w * 0.5 + bodyW * 0.55, groundY - bodyH);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // Sails
      const cx = w * 0.5, cy = groundY - bodyH - h * 0.02;
      const rot = rng.float(0, Math.PI / 2);
      ctx.strokeStyle = rgba(ink(a), 0.8);
      ctx.lineWidth = Math.max(1, w * 0.012);
      for (let i = 0; i < 4; i++) {
        const ang = rot + (i / 4) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(ang) * w * 0.34, cy + Math.sin(ang) * w * 0.34);
        ctx.stroke();
      }
    },
  },
  {
    id: 'town/bridge', label: 'Bridge', group: 'structures', tags: ['crossing', 'span'],
    aspect: 2.2, defaultWidth: 120, variants: 2,
    draw(a) {
      const { ctx, w, h } = a;
      const s = stone(a);
      ctx.fillStyle = lightGradient(ctx, 0, h * 0.3, 0, h * 0.7, s, 0.25, 0.3);
      ctx.beginPath();
      ctx.moveTo(0, h * 0.62);
      ctx.quadraticCurveTo(w * 0.5, h * 0.2, w, h * 0.62);
      ctx.lineTo(w, h * 0.74);
      ctx.quadraticCurveTo(w * 0.5, h * 0.34, 0, h * 0.74);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.7); ctx.lineWidth = Math.max(1, h * 0.02); ctx.stroke();
      // Arches
      ctx.fillStyle = rgba('#000000', 0.35);
      for (const t of [0.3, 0.5, 0.7]) {
        const x = w * t;
        const y = h * (0.74 - Math.sin(t * Math.PI) * 0.12);
        ctx.beginPath();
        ctx.arc(x, y + h * 0.1, w * 0.07, Math.PI, 0);
        ctx.fill();
      }
    },
  },
  {
    id: 'town/port', label: 'Harbour', group: 'structures', tags: ['dock', 'ship', 'pier'],
    aspect: 1.6, defaultWidth: 130, variants: 2,
    draw(a) {
      const { ctx, w, h, rng } = a;
      // Pier
      ctx.fillStyle = mix('#6b4a2a', a.palette.ink, 0.25);
      ctx.fillRect(w * 0.1, h * 0.55, w * 0.6, h * 0.08);
      for (let i = 0; i < 6; i++) {
        const x = w * (0.14 + i * 0.1);
        ctx.fillRect(x, h * 0.63, w * 0.02, h * 0.2);
      }
      // Ship hull
      ctx.fillStyle = mix('#4a3520', a.palette.ink, 0.2);
      ctx.beginPath();
      ctx.moveTo(w * 0.45, h * 0.42);
      ctx.lineTo(w * 0.92, h * 0.42);
      ctx.quadraticCurveTo(w * 0.86, h * 0.56, w * 0.55, h * 0.55);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.7); ctx.lineWidth = Math.max(1, w * 0.01); ctx.stroke();
      // Mast + sail
      ctx.strokeStyle = rgba(ink(a), 0.8);
      ctx.beginPath(); ctx.moveTo(w * 0.7, h * 0.42); ctx.lineTo(w * 0.7, h * 0.1); ctx.stroke();
      ctx.fillStyle = mix('#efe6d2', a.palette.parchment, 0.4);
      ctx.beginPath();
      ctx.moveTo(w * 0.7, h * 0.14);
      ctx.quadraticCurveTo(w * 0.86, h * 0.26, w * 0.7, h * 0.4);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    },
  },
  {
    id: 'town/mine', label: 'Mine', group: 'structures', tags: ['shaft', 'dwarven'],
    aspect: 1.2, defaultWidth: 80, variants: 2,
    draw(a) {
      const { ctx, w, h } = a;
      const s = stone(a);
      groundShadow(ctx, w * 0.5, h * 0.88, w * 0.34, h * 0.06, 0.3);
      const pts = blob(w * 0.5, h * 0.62, w * 0.4, h * 0.3, 5, 0.12, a.rng);
      fillPath(ctx, pts, lightGradient(ctx, 0, h * 0.3, 0, h * 0.9, s, 0.25, 0.35));
      inkLine(ctx, pts, rgba(ink(a), 0.6), Math.max(1, w * 0.015));
      // Adit
      ctx.fillStyle = '#0d0b09';
      ctx.beginPath();
      ctx.moveTo(w * 0.36, h * 0.86);
      ctx.lineTo(w * 0.36, h * 0.62);
      ctx.arc(w * 0.5, h * 0.62, w * 0.14, Math.PI, 0);
      ctx.lineTo(w * 0.64, h * 0.86);
      ctx.closePath(); ctx.fill();
      // Beams
      ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = Math.max(2, w * 0.035);
      ctx.beginPath();
      ctx.moveTo(w * 0.33, h * 0.88); ctx.lineTo(w * 0.33, h * 0.6);
      ctx.lineTo(w * 0.67, h * 0.6); ctx.lineTo(w * 0.67, h * 0.88);
      ctx.stroke();
    },
  },
  {
    id: 'town/camp', label: 'Camp', group: 'structures', tags: ['tents', 'army'],
    aspect: 1.5, defaultWidth: 100, variants: 3,
    draw(a) {
      const { ctx, w, h, rng } = a;
      const n = rng.int(3, 5);
      for (let i = 0; i < n; i++) {
        const x = rng.float(w * 0.2, w * 0.8);
        const y = rng.float(h * 0.5, h * 0.85);
        const tw = w * rng.float(0.14, 0.2);
        groundShadow(ctx, x, y, tw * 0.6, tw * 0.15, 0.24);
        ctx.fillStyle = lightGradient(ctx, x - tw, y - tw, x + tw, y, mix(a.palette.parchment, '#c8b48c', 0.6), 0.28, 0.3);
        ctx.beginPath();
        ctx.moveTo(x - tw * 0.6, y); ctx.lineTo(x, y - tw * 0.85); ctx.lineTo(x + tw * 0.6, y);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = rgba(ink(a), 0.6); ctx.lineWidth = Math.max(1, w * 0.01); ctx.stroke();
        ctx.fillStyle = rgba(ink(a), 0.6);
        ctx.beginPath();
        ctx.moveTo(x - tw * 0.12, y); ctx.lineTo(x, y - tw * 0.4); ctx.lineTo(x + tw * 0.12, y);
        ctx.closePath(); ctx.fill();
      }
      // Fire
      ctx.fillStyle = '#e07a2a';
      ctx.beginPath(); ctx.arc(w * 0.5, h * 0.92, w * 0.035, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rgba('#ffd27a', 0.6);
      ctx.beginPath(); ctx.arc(w * 0.5, h * 0.92, w * 0.07, 0, Math.PI * 2); ctx.fill();
    },
  },
  {
    id: 'town/lighthouse', label: 'Lighthouse', group: 'structures', tags: ['beacon', 'coast'],
    aspect: 0.55, defaultWidth: 60, variants: 2,
    draw(a) {
      const { ctx, w, h } = a;
      const groundY = h * 0.94;
      groundShadow(ctx, w * 0.5, groundY, w * 0.4, h * 0.03, 0.3);
      const topW = w * 0.34, botW = w * 0.6, topY = h * 0.24;
      ctx.beginPath();
      ctx.moveTo(w * 0.5 - botW / 2, groundY);
      ctx.lineTo(w * 0.5 - topW / 2, topY);
      ctx.lineTo(w * 0.5 + topW / 2, topY);
      ctx.lineTo(w * 0.5 + botW / 2, groundY);
      ctx.closePath();
      ctx.fillStyle = '#efe8dc'; ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.65); ctx.lineWidth = Math.max(1, w * 0.03); ctx.stroke();
      // Red bands
      ctx.save();
      ctx.clip();
      ctx.fillStyle = '#b4453a';
      for (let i = 0; i < 3; i++) ctx.fillRect(0, topY + (i * 2 + 1) * (groundY - topY) / 6, w, (groundY - topY) / 6);
      ctx.restore();
      // Lamp
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(w * 0.5 - topW * 0.7, topY - h * 0.1, topW * 1.4, h * 0.1);
      ctx.fillStyle = '#ffe08a';
      ctx.fillRect(w * 0.5 - topW * 0.45, topY - h * 0.085, topW * 0.9, h * 0.07);
    },
  },
  {
    id: 'town/farm', label: 'Farmstead', group: 'structures', tags: ['barn', 'fields'],
    aspect: 1.6, defaultWidth: 110, variants: 2,
    draw(a) {
      const { ctx, w, h, rng } = a;
      // Fields behind
      ctx.save();
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = mix(a.palette.grass, a.palette.lowland, 0.5);
      ctx.fillRect(w * 0.05, h * 0.3, w * 0.9, h * 0.35);
      ctx.strokeStyle = rgba(ink(a), 0.2); ctx.lineWidth = 1;
      for (let i = 0; i < 8; i++) {
        ctx.beginPath();
        ctx.moveTo(w * 0.05, h * (0.3 + i * 0.045));
        ctx.lineTo(w * 0.95, h * (0.3 + i * 0.045));
        ctx.stroke();
      }
      ctx.restore();
      house(a, w * 0.32, h * 0.62, w * 0.22, h * 0.3, 0);
      house(a, w * 0.66, h * 0.68, w * 0.28, h * 0.24, 0);
    },
  },
];
