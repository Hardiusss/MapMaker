/** Top-down props for tactical / battle maps. */
import type { AssetDef, AssetDrawArgs } from '../types';
import { blob, fillPath, groundShadow, inkLine, lightGradient, roundRect, speckle, tracePath } from '../draw';
import { mix, rgba } from '../../core/color';
import type { Vec2 } from '../../core/types';

const ink = (a: AssetDrawArgs) => a.palette.ink;

/** A tree seen from directly overhead: concentric canopy lobes. */
function canopy(a: AssetDrawArgs, cx: number, cy: number, r: number, base: string): void {
  const { ctx, rng } = a;
  // Soft contact shadow, offset down-right to match the map's light direction.
  groundShadow(ctx, cx + r * 0.2, cy + r * 0.22, r * 0.85, r * 0.8, 0.22);

  // Silhouette.
  const outer = blob(cx, cy, r, r * rng.float(0.92, 1.06), rng.int(7, 10), 0.11, rng);
  fillPath(ctx, outer, mix(base, '#0d1c0d', 0.42));

  // Clumps of foliage rather than concentric rings — a real canopy from above
  // is a cluster of rounded masses catching light at different angles.
  const clumps = rng.int(5, 8);
  for (let i = 0; i < clumps; i++) {
    const ang = (i / clumps) * Math.PI * 2 + rng.float(-0.35, 0.35);
    const dist = r * rng.float(0.18, 0.46);
    const cr = r * rng.float(0.3, 0.46);
    const lx = cx + Math.cos(ang) * dist;
    const ly = cy + Math.sin(ang) * dist;
    // Lit from the upper left: clumps to that side are brighter.
    const lit = (-Math.cos(ang) - Math.sin(ang)) * 0.5;
    const tone = mix(base, lit > 0 ? '#dbe98a' : '#0f2410', Math.abs(lit) * rng.float(0.18, 0.34));
    fillPath(ctx, blob(lx, ly, cr, cr * rng.float(0.85, 1.1), rng.int(5, 7), 0.18, rng), tone);
  }

  // Crown highlight — offset towards the light and kept small, so it reads as
  // sun catching the top of the tree rather than a gap in the leaves.
  const inner = blob(cx - r * 0.22, cy - r * 0.24, r * 0.26, r * 0.24, rng.int(5, 7), 0.22, rng);
  fillPath(ctx, inner, mix(base, '#cfe07a', 0.28));

  inkLine(ctx, outer, rgba(ink(a), 0.28), Math.max(1, r * 0.035));
}

export const BATTLE_ASSETS: AssetDef[] = [
  {
    id: 'btl/tree-top', label: 'Tree (top-down)', group: 'battle', tags: ['tree', 'canopy'],
    aspect: 1, defaultWidth: 120, variants: 4, kinds: ['battle', 'dungeon', 'city'],
    draw(a) {
      const base = a.tint ? mix(a.palette.forest, a.tint, a.tintStrength) : a.palette.forest;
      canopy(a, a.w / 2, a.h / 2, Math.min(a.w, a.h) * 0.46, base);
    },
  },
  {
    id: 'btl/pine-top', label: 'Pine (top-down)', group: 'battle', tags: ['tree', 'conifer'],
    aspect: 1, defaultWidth: 110, variants: 4, kinds: ['battle'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.46;
      const base = mix(a.palette.forest, '#154a30', 0.4);
      groundShadow(ctx, cx + r * 0.16, cy + r * 0.18, r * 0.9, r * 0.9, 0.34);
      // Tiers get lighter towards the crown, so the tree reads as a cone from
      // directly above rather than a flat snowflake.
      for (let ring = 3; ring >= 0; ring--) {
        const rr = r * (0.34 + ring * 0.22);
        const spikes = 9 + ring * 3;
        const pts: Vec2[] = [];
        for (let i = 0; i < spikes * 2; i++) {
          const ang = (i / (spikes * 2)) * Math.PI * 2 + ring * 0.22;
          const rad = i % 2 === 0 ? rr : rr * 0.7;
          pts.push({ x: cx + Math.cos(ang) * rad, y: cy + Math.sin(ang) * rad });
        }
        fillPath(ctx, pts, mix(base, ring === 3 ? '#08150f' : '#a8cf72', ring === 3 ? 0.35 : (3 - ring) * 0.085));
      }
      ctx.fillStyle = mix(base, '#c8e08a', 0.35);
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.09, 0, Math.PI * 2); ctx.fill();
    },
  },
  {
    id: 'btl/boulder', label: 'Boulder', group: 'battle', tags: ['rock', 'cover'],
    aspect: 1.2, defaultWidth: 90, variants: 4, kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const rock = a.tint ? mix(a.palette.rock, a.tint, a.tintStrength) : a.palette.rock;
      const cx = w / 2, cy = h / 2;
      groundShadow(ctx, cx + w * 0.06, cy + h * 0.08, w * 0.44, h * 0.4, 0.4);
      const pts = blob(cx, cy, w * 0.42, h * 0.4, rng.int(5, 8), 0.13, rng);
      fillPath(ctx, pts, lightGradient(ctx, cx - w * 0.4, cy - h * 0.4, cx + w * 0.4, cy + h * 0.4, rock, 0.34, 0.36));
      inkLine(ctx, pts, rgba(ink(a), 0.7), Math.max(1.2, w * 0.02));
      // Cracks
      ctx.save();
      tracePath(ctx, pts, true); ctx.clip();
      ctx.strokeStyle = rgba(ink(a), 0.3);
      ctx.lineWidth = Math.max(1, w * 0.012);
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        let x = cx + rng.float(-w * 0.3, w * 0.3), y = cy + rng.float(-h * 0.3, h * 0.3);
        ctx.moveTo(x, y);
        for (let k = 0; k < 3; k++) {
          x += rng.float(-w * 0.14, w * 0.14); y += rng.float(-h * 0.14, h * 0.14);
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
    },
  },
  {
    id: 'btl/log', label: 'Fallen Log', group: 'battle', tags: ['wood', 'cover'],
    aspect: 3, defaultWidth: 150, variants: 3, kinds: ['battle', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      groundShadow(ctx, w * 0.5, h * 0.62, w * 0.46, h * 0.22, 0.34);
      const y = h * 0.5, r = h * 0.28;
      ctx.fillStyle = lightGradient(ctx, 0, y - r, 0, y + r, '#6b4a2a', 0.3, 0.36);
      roundRect(ctx, w * 0.04, y - r, w * 0.92, r * 2, r);
      ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.65);
      ctx.lineWidth = Math.max(1, h * 0.03);
      ctx.stroke();
      // End grain
      ctx.fillStyle = '#8a6438';
      ctx.beginPath(); ctx.ellipse(w * 0.06, y, r * 0.35, r * 0.92, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgba('#3f2b16', 0.7);
      ctx.lineWidth = Math.max(1, h * 0.015);
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath(); ctx.ellipse(w * 0.06, y, r * 0.35 * (i / 4), r * 0.92 * (i / 4), 0, 0, Math.PI * 2); ctx.stroke();
      }
      // Bark lines
      ctx.strokeStyle = rgba('#3f2b16', 0.4);
      for (let i = 0; i < 5; i++) {
        const yy = y - r + (i / 4) * r * 2;
        ctx.beginPath(); ctx.moveTo(w * 0.12, yy); ctx.lineTo(w * 0.94, yy + rng.float(-h * 0.02, h * 0.02)); ctx.stroke();
      }
    },
  },
  {
    id: 'btl/stump', label: 'Tree Stump', group: 'battle', tags: ['wood'],
    aspect: 1, defaultWidth: 50, variants: 2, kinds: ['battle'],
    draw(a) {
      const { ctx, w, h } = a;
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.4;
      groundShadow(ctx, cx + w * 0.04, cy + h * 0.05, r, r, 0.34);
      ctx.fillStyle = '#8a6438';
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.7);
      ctx.lineWidth = Math.max(1, r * 0.09);
      ctx.stroke();
      ctx.strokeStyle = rgba('#3f2b16', 0.6);
      ctx.lineWidth = Math.max(1, r * 0.06);
      for (let i = 1; i <= 4; i++) { ctx.beginPath(); ctx.arc(cx, cy, r * (i / 5), 0, Math.PI * 2); ctx.stroke(); }
    },
  },
  {
    id: 'btl/tent', label: 'Tent (top-down)', group: 'battle', tags: ['camp', 'shelter'],
    aspect: 1.4, defaultWidth: 120, variants: 2, kinds: ['battle', 'city'],
    draw(a) {
      const { ctx, w, h } = a;
      groundShadow(ctx, w * 0.52, h * 0.55, w * 0.44, h * 0.4, 0.3);
      const cloth = mix(a.palette.parchment, '#b9a279', 0.55);
      ctx.fillStyle = lightGradient(ctx, 0, h * 0.1, 0, h * 0.9, cloth, 0.24, 0.3);
      ctx.beginPath();
      ctx.moveTo(w * 0.08, h * 0.2); ctx.lineTo(w * 0.92, h * 0.2);
      ctx.lineTo(w * 0.92, h * 0.8); ctx.lineTo(w * 0.08, h * 0.8);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.7);
      ctx.lineWidth = Math.max(1, w * 0.014);
      ctx.stroke();
      ctx.strokeStyle = rgba(ink(a), 0.5);
      ctx.lineWidth = Math.max(1, w * 0.02);
      ctx.beginPath(); ctx.moveTo(w * 0.08, h * 0.5); ctx.lineTo(w * 0.92, h * 0.5); ctx.stroke();
      // Guy ropes
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(ink(a), 0.4);
      for (const [x1, y1, x2, y2] of [[0.08, 0.2, 0.02, 0.08], [0.92, 0.2, 0.98, 0.08], [0.08, 0.8, 0.02, 0.92], [0.92, 0.8, 0.98, 0.92]] as const) {
        ctx.beginPath(); ctx.moveTo(w * x1, h * y1); ctx.lineTo(w * x2, h * y2); ctx.stroke();
      }
    },
  },
  {
    id: 'btl/wagon', label: 'Wagon', group: 'battle', tags: ['cart', 'travel'],
    aspect: 1.8, defaultWidth: 140, variants: 2, kinds: ['battle', 'city'],
    draw(a) {
      const { ctx, w, h } = a;
      groundShadow(ctx, w * 0.52, h * 0.55, w * 0.44, h * 0.34, 0.32);
      ctx.fillStyle = lightGradient(ctx, 0, h * 0.2, 0, h * 0.8, '#6b4a2a', 0.24, 0.3);
      roundRect(ctx, w * 0.14, h * 0.22, w * 0.72, h * 0.56, w * 0.03);
      ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.75);
      ctx.lineWidth = Math.max(1, w * 0.012);
      ctx.stroke();
      // Planks
      ctx.strokeStyle = rgba('#3f2b16', 0.6);
      for (let i = 1; i < 6; i++) {
        const x = w * (0.14 + (i / 6) * 0.72);
        ctx.beginPath(); ctx.moveTo(x, h * 0.22); ctx.lineTo(x, h * 0.78); ctx.stroke();
      }
      // Wheels
      ctx.fillStyle = '#3f2b16';
      for (const [x, y] of [[0.2, 0.14], [0.2, 0.86], [0.78, 0.14], [0.78, 0.86]] as const) {
        ctx.beginPath(); ctx.ellipse(w * x, h * y, w * 0.07, h * 0.09, 0, 0, Math.PI * 2); ctx.fill();
      }
      // Yoke
      ctx.strokeStyle = '#3f2b16';
      ctx.lineWidth = Math.max(2, w * 0.02);
      ctx.beginPath(); ctx.moveTo(w * 0.14, h * 0.5); ctx.lineTo(w * 0.02, h * 0.5); ctx.stroke();
    },
  },
  {
    id: 'btl/fence', label: 'Fence Run', group: 'battle', tags: ['wood', 'barrier'],
    aspect: 4, defaultWidth: 200, variants: 2, kinds: ['battle', 'city'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      ctx.strokeStyle = '#6b4a2a';
      ctx.lineWidth = Math.max(2, h * 0.14);
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(w * 0.02, h * 0.42); ctx.lineTo(w * 0.98, h * 0.42); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w * 0.02, h * 0.66); ctx.lineTo(w * 0.98, h * 0.66); ctx.stroke();
      ctx.strokeStyle = '#4f3620';
      ctx.lineWidth = Math.max(2, h * 0.18);
      const posts = 7;
      for (let i = 0; i <= posts; i++) {
        const x = w * (0.03 + (i / posts) * 0.94);
        ctx.beginPath(); ctx.moveTo(x, h * 0.22); ctx.lineTo(x, h * 0.86); ctx.stroke();
      }
    },
  },
  {
    id: 'btl/crates-stack', label: 'Crate Stack', group: 'battle', tags: ['cargo', 'cover'],
    aspect: 1.3, defaultWidth: 100, variants: 3, kinds: ['battle', 'dungeon', 'city'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const n = rng.int(3, 5);
      for (let i = 0; i < n; i++) {
        const cw = w * rng.float(0.24, 0.36);
        const x = rng.float(w * 0.08, w * 0.92 - cw);
        const y = rng.float(h * 0.08, h * 0.92 - cw);
        ctx.save();
        ctx.translate(x + cw / 2, y + cw / 2);
        ctx.rotate(rng.float(-0.25, 0.25));
        groundShadow(ctx, cw * 0.1, cw * 0.12, cw * 0.7, cw * 0.7, 0.3);
        ctx.fillStyle = lightGradient(ctx, -cw / 2, -cw / 2, cw / 2, cw / 2, '#7a5630', 0.26, 0.3);
        ctx.fillRect(-cw / 2, -cw / 2, cw, cw);
        ctx.strokeStyle = rgba(ink(a), 0.7);
        ctx.lineWidth = Math.max(1, cw * 0.06);
        ctx.strokeRect(-cw / 2, -cw / 2, cw, cw);
        ctx.strokeStyle = rgba('#3f2b16', 0.7);
        ctx.beginPath();
        ctx.moveTo(-cw / 2, -cw / 2); ctx.lineTo(cw / 2, cw / 2);
        ctx.moveTo(cw / 2, -cw / 2); ctx.lineTo(-cw / 2, cw / 2);
        ctx.stroke();
        ctx.restore();
      }
    },
  },
  {
    id: 'btl/bush-top', label: 'Bush (top-down)', group: 'battle', tags: ['shrub', 'difficult'],
    aspect: 1, defaultWidth: 70, variants: 4, kinds: ['battle'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const base = mix(a.palette.forest, a.palette.grass, 0.45);
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.44;
      groundShadow(ctx, cx + r * 0.12, cy + r * 0.14, r * 0.9, r * 0.86, 0.28);
      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * Math.PI * 2 + rng.float(-0.3, 0.3);
        const d = r * rng.float(0.15, 0.4);
        const lr = r * rng.float(0.4, 0.6);
        const pts = blob(cx + Math.cos(ang) * d, cy + Math.sin(ang) * d, lr, lr * 0.9, rng.int(5, 7), 0.2, rng);
        fillPath(ctx, pts, mix(base, rng.bool() ? '#ffffff' : '#000000', rng.float(0, 0.2)));
      }
    },
  },
  {
    id: 'btl/grass-patch', label: 'Tall Grass', group: 'battle', tags: ['difficult terrain'],
    aspect: 1.4, defaultWidth: 140, variants: 3, kinds: ['battle'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const c = mix(a.palette.grass, '#7fa958', 0.4);
      const n = rng.int(60, 110);
      for (let i = 0; i < n; i++) {
        const x = rng.float(0, w), y = rng.float(0, h);
        const len = h * rng.float(0.08, 0.18);
        const bend = rng.float(-w * 0.03, w * 0.03);
        ctx.strokeStyle = rgba(mix(c, rng.bool() ? '#ffffff' : '#000000', rng.float(0, 0.3)), rng.float(0.5, 1));
        ctx.lineWidth = Math.max(1, w * 0.007);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + bend * 0.5, y - len * 0.6, x + bend, y - len);
        ctx.stroke();
      }
    },
  },
  {
    id: 'btl/blood-splatter', label: 'Blood Splatter', group: 'battle', tags: ['gore', 'aftermath'],
    aspect: 1.2, defaultWidth: 110, variants: 4, kinds: ['battle', 'dungeon'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const c = '#6e1410';
      const main = blob(w / 2, h / 2, w * 0.22, h * 0.2, rng.int(5, 8), 0.3, rng);
      fillPath(ctx, main, rgba(c, 0.85));
      for (let i = 0; i < rng.int(14, 26); i++) {
        const ang = rng.float(0, Math.PI * 2);
        const d = rng.float(w * 0.12, w * 0.48);
        const x = w / 2 + Math.cos(ang) * d, y = h / 2 + Math.sin(ang) * d * 0.9;
        const r = w * rng.float(0.008, 0.035);
        ctx.fillStyle = rgba(c, rng.float(0.4, 0.85));
        ctx.beginPath(); ctx.ellipse(x, y, r, r * rng.float(0.6, 1.4), ang, 0, Math.PI * 2); ctx.fill();
      }
    },
  },
  {
    id: 'btl/scorch', label: 'Scorch Mark', group: 'battle', tags: ['fire', 'aftermath'],
    aspect: 1, defaultWidth: 130, variants: 3, kinds: ['battle', 'dungeon'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.45);
      g.addColorStop(0, rgba('#100c0a', 0.9));
      g.addColorStop(0.55, rgba('#2a1c14', 0.65));
      g.addColorStop(1, rgba('#2a1c14', 0));
      const pts = blob(w / 2, h / 2, w * 0.44, h * 0.44, rng.int(6, 9), 0.16, rng);
      fillPath(ctx, pts, g);
      speckle(ctx, w * 0.2, h * 0.2, w * 0.6, h * 0.6, 40, rgba('#000000', 0.5), w * 0.004, w * 0.012, rng);
    },
  },
  {
    id: 'btl/rug', label: 'Rug', group: 'battle', tags: ['carpet', 'interior'],
    aspect: 1.5, defaultWidth: 160, variants: 3, kinds: ['battle', 'dungeon', 'city'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const c1 = a.tint || rng.pick(['#7a2a2a', '#2a4a7a', '#2a6b4a', '#6b4a7a']);
      const c2 = mix(c1, '#e0c070', 0.55);
      ctx.fillStyle = c1;
      ctx.fillRect(w * 0.06, h * 0.08, w * 0.88, h * 0.84);
      ctx.strokeStyle = c2;
      ctx.lineWidth = Math.max(2, w * 0.014);
      ctx.strokeRect(w * 0.1, h * 0.14, w * 0.8, h * 0.72);
      ctx.strokeRect(w * 0.15, h * 0.22, w * 0.7, h * 0.56);
      ctx.fillStyle = c2;
      ctx.save();
      ctx.translate(w * 0.5, h * 0.5);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-w * 0.09, -w * 0.09, w * 0.18, w * 0.18);
      ctx.restore();
      // Fringe
      ctx.strokeStyle = rgba('#e8dcc0', 0.85);
      ctx.lineWidth = Math.max(1, w * 0.006);
      for (let i = 0; i < 24; i++) {
        const y = h * (0.08 + (i / 23) * 0.84);
        ctx.beginPath(); ctx.moveTo(w * 0.06, y); ctx.lineTo(w * 0.02, y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(w * 0.94, y); ctx.lineTo(w * 0.98, y); ctx.stroke();
      }
    },
  },
];
