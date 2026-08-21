/**
 * Top-down dungeon dressing — drawn from above, because that is how a
 * dungeon or battle map is read at the table.
 */
import type { AssetDef, AssetDrawArgs } from '../types';
import { blob, fillPath, groundShadow, inkLine, lightGradient, radialGlow, roundRect, speckle, star, tracePath, regularPolygon } from '../draw';
import { mix, rgba } from '../../core/color';
import type { Vec2 } from '../../core/types';

const ink = (a: AssetDrawArgs) => a.palette.ink;
const wood = (a: AssetDrawArgs) => (a.tint ? mix('#6b4a2a', a.tint, a.tintStrength) : '#6b4a2a');
const woodDark = '#3f2b16';
const iron = '#4b5054';
const stoneC = (a: AssetDrawArgs) => mix(a.palette.rock, '#8a8175', 0.45);

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

function plank(a: AssetDrawArgs, x: number, y: number, w: number, h: number, n = 4): void {
  const { ctx } = a;
  ctx.save();
  roundRect(ctx, x, y, w, h, Math.min(w, h) * 0.08);
  ctx.clip();
  ctx.fillStyle = lightGradient(ctx, x, y, x + w, y + h, wood(a), 0.24, 0.3);
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

export const DUNGEON_ASSETS: AssetDef[] = [
  // --- Doors & passages ----------------------------------------------------
  {
    id: 'dgn/door', label: 'Door', group: 'dungeon', tags: ['door', 'entry'],
    aspect: 2.4, defaultWidth: 70, variants: 2, kinds: ['dungeon', 'cave', 'battle'],
    draw(a) {
      const { ctx, w, h } = a;
      plank(a, w * 0.06, h * 0.2, w * 0.88, h * 0.6, 4);
      ctx.fillStyle = iron;
      ctx.beginPath(); ctx.arc(w * 0.78, h * 0.5, Math.min(w, h) * 0.07, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rgba(iron, 0.9);
      ctx.fillRect(w * 0.06, h * 0.26, w * 0.88, h * 0.06);
      ctx.fillRect(w * 0.06, h * 0.68, w * 0.88, h * 0.06);
    },
  },
  {
    id: 'dgn/double-door', label: 'Double Door', group: 'dungeon', tags: ['door', 'gate'],
    aspect: 2.4, defaultWidth: 110, variants: 1, kinds: ['dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h } = a;
      plank(a, w * 0.04, h * 0.2, w * 0.45, h * 0.6, 3);
      plank(a, w * 0.51, h * 0.2, w * 0.45, h * 0.6, 3);
      ctx.fillStyle = iron;
      ctx.beginPath(); ctx.arc(w * 0.44, h * 0.5, Math.min(w, h) * 0.06, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(w * 0.56, h * 0.5, Math.min(w, h) * 0.06, 0, Math.PI * 2); ctx.fill();
    },
  },
  {
    id: 'dgn/secret-door', label: 'Secret Door', group: 'dungeon', tags: ['hidden', 'gm'],
    aspect: 2.4, defaultWidth: 70, variants: 1, kinds: ['dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h } = a;
      ctx.save();
      ctx.setLineDash([w * 0.06, w * 0.04]);
      ctx.strokeStyle = rgba(a.palette.accent, 0.95);
      ctx.lineWidth = Math.max(1.5, h * 0.09);
      ctx.strokeRect(w * 0.06, h * 0.22, w * 0.88, h * 0.56);
      ctx.restore();
      ctx.fillStyle = rgba(a.palette.accent, 0.9);
      ctx.font = `bold ${h * 0.5}px serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('S', w * 0.5, h * 0.52);
    },
  },
  {
    id: 'dgn/portcullis', label: 'Portcullis', group: 'dungeon', tags: ['gate', 'bars'],
    aspect: 2.4, defaultWidth: 90, variants: 1, kinds: ['dungeon'],
    draw(a) {
      const { ctx, w, h } = a;
      ctx.save();
      ctx.strokeStyle = iron;
      ctx.lineWidth = Math.max(2, h * 0.1);
      ctx.lineCap = 'round';
      for (let i = 0; i <= 6; i++) {
        const x = w * (0.08 + (i / 6) * 0.84);
        ctx.beginPath(); ctx.moveTo(x, h * 0.18); ctx.lineTo(x, h * 0.82); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(w * 0.06, h * 0.34); ctx.lineTo(w * 0.94, h * 0.34); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w * 0.06, h * 0.66); ctx.lineTo(w * 0.94, h * 0.66); ctx.stroke();
      ctx.restore();
    },
  },
  {
    id: 'dgn/stairs', label: 'Stairs', group: 'dungeon', tags: ['steps', 'up', 'down'],
    aspect: 1.2, defaultWidth: 100, variants: 2, kinds: ['dungeon', 'cave', 'battle'],
    draw(a) {
      const { ctx, w, h } = a;
      const s = stoneC(a);
      const steps = 7;
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        const inset = w * 0.06 * t;
        ctx.fillStyle = mix(s, '#000000', t * 0.45);
        ctx.fillRect(w * 0.1 + inset, h * (0.08 + t * 0.84), w * 0.8 - inset * 2, (h * 0.84) / steps);
        ctx.strokeStyle = rgba(ink(a), 0.6);
        ctx.lineWidth = Math.max(1, h * 0.012);
        ctx.strokeRect(w * 0.1 + inset, h * (0.08 + t * 0.84), w * 0.8 - inset * 2, (h * 0.84) / steps);
      }
      // Direction arrow
      ctx.fillStyle = rgba(ink(a), 0.75);
      const up = a.variant % 2 === 0;
      const cx = w * 0.5, cy = h * 0.5, s2 = w * 0.1;
      ctx.beginPath();
      if (up) { ctx.moveTo(cx, cy - s2); ctx.lineTo(cx + s2 * 0.7, cy + s2 * 0.5); ctx.lineTo(cx - s2 * 0.7, cy + s2 * 0.5); }
      else { ctx.moveTo(cx, cy + s2); ctx.lineTo(cx + s2 * 0.7, cy - s2 * 0.5); ctx.lineTo(cx - s2 * 0.7, cy - s2 * 0.5); }
      ctx.closePath(); ctx.fill();
    },
  },
  {
    id: 'dgn/spiral-stairs', label: 'Spiral Stairs', group: 'dungeon', tags: ['steps', 'tower'],
    aspect: 1, defaultWidth: 90, variants: 1, kinds: ['dungeon'],
    draw(a) {
      const { ctx, w, h } = a;
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.46;
      const s = stoneC(a);
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = mix(s, '#000000', 0.15); ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.7); ctx.lineWidth = Math.max(1, w * 0.02); ctx.stroke();
      const steps = 12;
      for (let i = 0; i < steps; i++) {
        const a0 = (i / steps) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R);
        ctx.strokeStyle = rgba(ink(a), 0.55);
        ctx.lineWidth = Math.max(1, w * 0.012);
        ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = mix(s, '#000000', 0.5); ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.7); ctx.stroke();
      ctx.restore();
    },
  },
  {
    id: 'dgn/pit', label: 'Pit', group: 'dungeon', tags: ['trap', 'hole'],
    aspect: 1.2, defaultWidth: 100, variants: 2, kinds: ['dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const pts = blob(w / 2, h / 2, w * 0.42, h * 0.42, 5, 0.1, rng);
      fillPath(ctx, pts, '#0a0908');
      ctx.save();
      tracePath(ctx, pts, true); ctx.clip();
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.45);
      g.addColorStop(0, rgba('#000000', 1));
      g.addColorStop(1, rgba(a.palette.rock, 0.6));
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.restore();
      inkLine(ctx, pts, rgba(ink(a), 0.8), Math.max(1.5, w * 0.02));
    },
  },
  {
    id: 'dgn/spike-trap', label: 'Spike Trap', group: 'dungeon', tags: ['trap', 'danger'],
    aspect: 1, defaultWidth: 80, variants: 1, kinds: ['dungeon'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      ctx.fillStyle = '#141210';
      roundRect(ctx, w * 0.08, h * 0.08, w * 0.84, h * 0.84, w * 0.05);
      ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.8); ctx.lineWidth = Math.max(1, w * 0.02); ctx.stroke();
      const n = 4;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const x = w * (0.2 + (i / (n - 1)) * 0.6);
          const y = h * (0.2 + (j / (n - 1)) * 0.6);
          const r = w * 0.06;
          ctx.fillStyle = mix('#b8b4ac', '#6a6660', rng.next());
          ctx.beginPath();
          ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.6, y + r * 0.6); ctx.lineTo(x - r * 0.6, y + r * 0.6);
          ctx.closePath(); ctx.fill();
        }
      }
    },
  },

  // --- Furniture -----------------------------------------------------------
  {
    id: 'dgn/table-long', label: 'Long Table', group: 'furniture', tags: ['table', 'feast'],
    aspect: 2.2, defaultWidth: 140, variants: 2, kinds: ['dungeon', 'battle', 'city'],
    draw(a) {
      const { ctx, w, h } = a;
      groundShadow(ctx, w * 0.52, h * 0.56, w * 0.44, h * 0.3, 0.3);
      plank(a, w * 0.08, h * 0.2, w * 0.84, h * 0.6, 6);
      // Benches
      ctx.fillStyle = mix(wood(a), '#000000', 0.2);
      ctx.fillRect(w * 0.1, h * 0.04, w * 0.8, h * 0.12);
      ctx.fillRect(w * 0.1, h * 0.84, w * 0.8, h * 0.12);
    },
  },
  {
    id: 'dgn/table-round', label: 'Round Table', group: 'furniture', tags: ['table'],
    aspect: 1, defaultWidth: 90, variants: 2, kinds: ['dungeon', 'battle', 'city'],
    draw(a) {
      const { ctx, w, h } = a;
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.4;
      groundShadow(ctx, cx + w * 0.02, cy + h * 0.03, r, r * 0.9, 0.3);
      outlined(a, () => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); },
        lightGradient(ctx, cx - r, cy - r, cx + r, cy + r, wood(a), 0.28, 0.28));
      ctx.strokeStyle = rgba(woodDark, 0.5);
      ctx.lineWidth = Math.max(1, r * 0.06);
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.4, 0, Math.PI * 2); ctx.stroke();
    },
  },
  {
    id: 'dgn/chair', label: 'Chair', group: 'furniture', tags: ['seat', 'stool'],
    aspect: 1, defaultWidth: 40, variants: 2, kinds: ['dungeon', 'battle', 'city'],
    draw(a) {
      const { ctx, w, h } = a;
      groundShadow(ctx, w * 0.52, h * 0.55, w * 0.34, h * 0.3, 0.25);
      plank(a, w * 0.2, h * 0.2, w * 0.6, h * 0.6, 3);
      ctx.fillStyle = mix(wood(a), '#000000', 0.3);
      ctx.fillRect(w * 0.16, h * 0.16, w * 0.68, h * 0.12);
    },
  },
  {
    id: 'dgn/bed', label: 'Bed', group: 'furniture', tags: ['sleep', 'bunk'],
    aspect: 0.7, defaultWidth: 70, variants: 2, kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h } = a;
      groundShadow(ctx, w * 0.52, h * 0.53, w * 0.42, h * 0.46, 0.28);
      plank(a, w * 0.1, h * 0.06, w * 0.8, h * 0.88, 3);
      ctx.fillStyle = mix(a.palette.accent, '#8a4a44', 0.5);
      roundRect(ctx, w * 0.14, h * 0.3, w * 0.72, h * 0.6, w * 0.06);
      ctx.fill();
      ctx.fillStyle = '#e6ddcb';
      roundRect(ctx, w * 0.2, h * 0.1, w * 0.6, h * 0.18, w * 0.05);
      ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.6); ctx.lineWidth = Math.max(1, w * 0.02); ctx.stroke();
    },
  },
  {
    id: 'dgn/chest', label: 'Chest', group: 'furniture', tags: ['treasure', 'loot'],
    aspect: 1.4, defaultWidth: 56, variants: 2, kinds: ['dungeon', 'cave', 'battle'],
    draw(a) {
      const { ctx, w, h } = a;
      groundShadow(ctx, w * 0.52, h * 0.6, w * 0.4, h * 0.3, 0.32);
      plank(a, w * 0.1, h * 0.16, w * 0.8, h * 0.68, 4);
      ctx.fillStyle = iron;
      ctx.fillRect(w * 0.1, h * 0.44, w * 0.8, h * 0.1);
      ctx.fillRect(w * 0.22, h * 0.16, w * 0.07, h * 0.68);
      ctx.fillRect(w * 0.71, h * 0.16, w * 0.07, h * 0.68);
      ctx.fillStyle = '#d4b048';
      roundRect(ctx, w * 0.45, h * 0.4, w * 0.1, h * 0.18, w * 0.02);
      ctx.fill();
    },
  },
  {
    id: 'dgn/barrel', label: 'Barrel', group: 'furniture', tags: ['keg', 'storage'],
    aspect: 1, defaultWidth: 40, variants: 2, kinds: ['dungeon', 'battle', 'city'],
    draw(a) {
      const { ctx, w, h } = a;
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.42;
      groundShadow(ctx, cx + w * 0.03, cy + h * 0.03, r, r * 0.95, 0.3);
      outlined(a, () => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); },
        lightGradient(ctx, cx - r, cy - r, cx + r, cy + r, wood(a), 0.3, 0.3));
      ctx.strokeStyle = iron;
      ctx.lineWidth = Math.max(1, r * 0.12);
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.78, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.42, 0, Math.PI * 2); ctx.stroke();
    },
  },
  {
    id: 'dgn/crate', label: 'Crate', group: 'furniture', tags: ['box', 'storage'],
    aspect: 1, defaultWidth: 44, variants: 3, kinds: ['dungeon', 'battle', 'city'],
    draw(a) {
      const { ctx, w, h } = a;
      groundShadow(ctx, w * 0.53, h * 0.55, w * 0.4, h * 0.4, 0.3);
      plank(a, w * 0.12, h * 0.12, w * 0.76, h * 0.76, 3);
      ctx.strokeStyle = rgba(woodDark, 0.7);
      ctx.lineWidth = Math.max(1, w * 0.04);
      ctx.beginPath();
      ctx.moveTo(w * 0.14, h * 0.14); ctx.lineTo(w * 0.86, h * 0.86);
      ctx.moveTo(w * 0.86, h * 0.14); ctx.lineTo(w * 0.14, h * 0.86);
      ctx.stroke();
    },
  },
  {
    id: 'dgn/bookshelf', label: 'Bookshelf', group: 'furniture', tags: ['library', 'books'],
    aspect: 2.6, defaultWidth: 110, variants: 2, kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      plank(a, w * 0.04, h * 0.1, w * 0.92, h * 0.8, 2);
      const n = 22;
      for (let i = 0; i < n; i++) {
        const bw = w * 0.9 / n;
        const x = w * 0.05 + i * bw;
        const bh = h * rng.float(0.4, 0.66);
        ctx.fillStyle = rng.pick(['#7a3b3b', '#3b5a7a', '#3f6b45', '#7a6a3b', '#5a3b6b']);
        ctx.fillRect(x + bw * 0.1, h * 0.85 - bh, bw * 0.8, bh);
      }
      ctx.strokeStyle = rgba(ink(a), 0.75);
      ctx.lineWidth = Math.max(1, h * 0.05);
      ctx.strokeRect(w * 0.04, h * 0.1, w * 0.92, h * 0.8);
    },
  },
  {
    id: 'dgn/altar', label: 'Altar', group: 'furniture', tags: ['shrine', 'ritual'],
    aspect: 1.5, defaultWidth: 90, variants: 3, kinds: ['dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h } = a;
      const s = stoneC(a);
      groundShadow(ctx, w * 0.52, h * 0.56, w * 0.42, h * 0.36, 0.34);
      outlined(a, () => roundRect(ctx, w * 0.1, h * 0.18, w * 0.8, h * 0.64, w * 0.03),
        lightGradient(ctx, w * 0.1, h * 0.18, w * 0.9, h * 0.82, s, 0.28, 0.32));
      ctx.strokeStyle = rgba(ink(a), 0.4);
      ctx.lineWidth = Math.max(1, w * 0.012);
      ctx.strokeRect(w * 0.17, h * 0.28, w * 0.66, h * 0.44);
      // Sigil
      ctx.save();
      ctx.translate(w * 0.5, h * 0.5);
      ctx.strokeStyle = rgba(a.palette.accent, 0.85);
      ctx.lineWidth = Math.max(1.2, w * 0.016);
      const pts = star(0, 0, Math.min(w, h) * 0.16, Math.min(w, h) * 0.07, 5);
      tracePath(ctx, pts, true);
      ctx.stroke();
      ctx.restore();
    },
  },
  {
    id: 'dgn/sarcophagus', label: 'Sarcophagus', group: 'furniture', tags: ['tomb', 'undead'],
    aspect: 0.55, defaultWidth: 56, variants: 2, kinds: ['dungeon'],
    draw(a) {
      const { ctx, w, h } = a;
      const s = stoneC(a);
      groundShadow(ctx, w * 0.53, h * 0.53, w * 0.4, h * 0.46, 0.32);
      outlined(a, () => {
        ctx.beginPath();
        ctx.moveTo(w * 0.3, h * 0.06);
        ctx.quadraticCurveTo(w * 0.5, h * 0.0, w * 0.7, h * 0.06);
        ctx.lineTo(w * 0.86, h * 0.9);
        ctx.quadraticCurveTo(w * 0.5, h * 0.99, w * 0.14, h * 0.9);
        ctx.closePath();
      }, lightGradient(ctx, w * 0.1, 0, w * 0.9, h, s, 0.3, 0.34));
      ctx.strokeStyle = rgba(ink(a), 0.5);
      ctx.lineWidth = Math.max(1, w * 0.03);
      ctx.beginPath();
      ctx.moveTo(w * 0.5, h * 0.2); ctx.lineTo(w * 0.5, h * 0.55);
      ctx.moveTo(w * 0.34, h * 0.32); ctx.lineTo(w * 0.66, h * 0.32);
      ctx.stroke();
    },
  },
  {
    id: 'dgn/pillar', label: 'Pillar', group: 'furniture', tags: ['column', 'support'],
    aspect: 1, defaultWidth: 60, variants: 3, kinds: ['dungeon', 'city', 'battle'],
    draw(a) {
      const { ctx, w, h } = a;
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.42;
      const s = stoneC(a);
      groundShadow(ctx, cx + w * 0.04, cy + h * 0.04, r * 1.1, r * 1.05, 0.4);
      if (a.variant % 3 === 2) {
        const pts = regularPolygon(cx, cy, r, 8);
        fillPath(ctx, pts, lightGradient(ctx, cx - r, cy - r, cx + r, cy + r, s, 0.35, 0.35));
        inkLine(ctx, pts, rgba(ink(a), 0.75), Math.max(1.2, w * 0.02), true);
      } else {
        outlined(a, () => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); },
          lightGradient(ctx, cx - r, cy - r, cx + r, cy + r, s, 0.35, 0.35));
      }
      ctx.strokeStyle = rgba(ink(a), 0.35);
      ctx.lineWidth = Math.max(1, w * 0.014);
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2); ctx.stroke();
    },
  },
  {
    id: 'dgn/statue', label: 'Statue', group: 'furniture', tags: ['idol', 'guardian'],
    aspect: 1, defaultWidth: 60, variants: 3, kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h } = a;
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.44;
      const s = mix(stoneC(a), '#b9b2a4', 0.4);
      groundShadow(ctx, cx + w * 0.03, cy + h * 0.04, r, r, 0.35);
      outlined(a, () => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); }, mix(s, '#000000', 0.25));
      // A crude figure from above: head + shoulders + outstretched arms.
      ctx.fillStyle = s;
      ctx.beginPath(); ctx.arc(cx, cy - r * 0.05, r * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = s;
      ctx.lineWidth = r * 0.22;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.62, cy + r * 0.25);
      ctx.lineTo(cx, cy + r * 0.1);
      ctx.lineTo(cx + r * 0.62, cy + r * 0.25);
      ctx.stroke();
      ctx.strokeStyle = rgba(ink(a), 0.55);
      ctx.lineWidth = Math.max(1, w * 0.016);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    },
  },
  {
    id: 'dgn/brazier', label: 'Brazier', group: 'furniture', tags: ['fire', 'light'],
    aspect: 1, defaultWidth: 46, variants: 2, kinds: ['dungeon', 'cave', 'city'],
    draw(a) {
      const { ctx, w, h } = a;
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.36;
      radialGlow(ctx, cx, cy, Math.min(w, h) * 0.62, '#ff9a3c', 0.55);
      outlined(a, () => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); }, iron);
      ctx.fillStyle = '#e0662a';
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.66, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd06a';
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.34, 0, Math.PI * 2); ctx.fill();
    },
  },
  {
    id: 'dgn/campfire', label: 'Campfire', group: 'furniture', tags: ['fire', 'rest'],
    aspect: 1, defaultWidth: 60, variants: 2, kinds: ['dungeon', 'cave', 'battle'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.4;
      radialGlow(ctx, cx, cy, r * 1.7, '#ff8a3c', 0.5);
      // Stone ring
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2 + rng.float(-0.1, 0.1);
        const sx = cx + Math.cos(ang) * r, sy = cy + Math.sin(ang) * r;
        const sr = r * rng.float(0.15, 0.22);
        const pts = blob(sx, sy, sr, sr * 0.85, 4, 0.18, rng);
        fillPath(ctx, pts, mix(a.palette.rock, '#7a7267', 0.4));
        inkLine(ctx, pts, rgba(ink(a), 0.5), 1);
      }
      // Logs
      ctx.strokeStyle = woodDark;
      ctx.lineWidth = r * 0.18;
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const ang = rng.float(0, Math.PI);
        ctx.beginPath();
        ctx.moveTo(cx - Math.cos(ang) * r * 0.5, cy - Math.sin(ang) * r * 0.5);
        ctx.lineTo(cx + Math.cos(ang) * r * 0.5, cy + Math.sin(ang) * r * 0.5);
        ctx.stroke();
      }
      ctx.fillStyle = '#ff9a3c';
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.32, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffe08a';
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.15, 0, Math.PI * 2); ctx.fill();
    },
  },
  {
    id: 'dgn/well', label: 'Well', group: 'furniture', tags: ['water', 'village'],
    aspect: 1, defaultWidth: 64, variants: 2, kinds: ['dungeon', 'city', 'battle'],
    draw(a) {
      const { ctx, w, h } = a;
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.42;
      const s = stoneC(a);
      groundShadow(ctx, cx + w * 0.03, cy + h * 0.03, r * 1.05, r, 0.32);
      outlined(a, () => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); }, s);
      ctx.fillStyle = '#0e1416';
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rgba(a.palette.deepWater, 0.85);
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2); ctx.fill();
      // Beam across
      ctx.fillStyle = wood(a);
      ctx.fillRect(cx - r * 0.06, cy - r, r * 0.12, r * 2);
    },
  },
  {
    id: 'dgn/fountain', label: 'Fountain', group: 'furniture', tags: ['water', 'plaza'],
    aspect: 1, defaultWidth: 110, variants: 2, kinds: ['city', 'dungeon', 'battle'],
    draw(a) {
      const { ctx, w, h } = a;
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.46;
      const s = stoneC(a);
      outlined(a, () => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); }, s);
      ctx.fillStyle = rgba(a.palette.water, 0.9);
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.78, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = s;
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgba('#ffffff', 0.5);
      ctx.lineWidth = Math.max(1, r * 0.05);
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = rgba(ink(a), 0.6);
      ctx.lineWidth = Math.max(1, r * 0.05);
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2); ctx.stroke();
    },
  },
  {
    id: 'dgn/anvil', label: 'Forge & Anvil', group: 'furniture', tags: ['smith', 'craft'],
    aspect: 1.4, defaultWidth: 70, variants: 1, kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h } = a;
      groundShadow(ctx, w * 0.5, h * 0.6, w * 0.4, h * 0.3, 0.34);
      ctx.fillStyle = iron;
      ctx.beginPath();
      ctx.moveTo(w * 0.18, h * 0.42);
      ctx.lineTo(w * 0.82, h * 0.42);
      ctx.lineTo(w * 0.7, h * 0.55);
      ctx.lineTo(w * 0.62, h * 0.72);
      ctx.lineTo(w * 0.38, h * 0.72);
      ctx.lineTo(w * 0.3, h * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.8);
      ctx.lineWidth = Math.max(1, w * 0.02);
      ctx.stroke();
      radialGlow(ctx, w * 0.5, h * 0.5, w * 0.3, '#ff7a2a', 0.35);
    },
  },
  {
    id: 'dgn/cage', label: 'Cage', group: 'furniture', tags: ['prison', 'bars'],
    aspect: 1, defaultWidth: 70, variants: 1, kinds: ['dungeon'],
    draw(a) {
      const { ctx, w, h } = a;
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.42;
      ctx.fillStyle = rgba('#000000', 0.35);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = iron;
      ctx.lineWidth = Math.max(1.5, r * 0.1);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI;
        ctx.beginPath();
        ctx.moveTo(cx - Math.cos(ang) * r, cy - Math.sin(ang) * r);
        ctx.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
        ctx.stroke();
      }
    },
  },
  {
    id: 'dgn/throne', label: 'Throne', group: 'furniture', tags: ['seat', 'king'],
    aspect: 0.9, defaultWidth: 64, variants: 1, kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h } = a;
      const s = stoneC(a);
      groundShadow(ctx, w * 0.52, h * 0.56, w * 0.4, h * 0.4, 0.32);
      outlined(a, () => roundRect(ctx, w * 0.16, h * 0.12, w * 0.68, h * 0.76, w * 0.08),
        lightGradient(ctx, w * 0.16, h * 0.12, w * 0.84, h * 0.88, s, 0.3, 0.3));
      ctx.fillStyle = mix(a.palette.accent, '#7a2a2a', 0.5);
      roundRect(ctx, w * 0.26, h * 0.3, w * 0.48, h * 0.5, w * 0.05);
      ctx.fill();
      ctx.fillStyle = '#d4b048';
      const st = star(w * 0.5, h * 0.22, w * 0.08, w * 0.035, 5);
      fillPath(ctx, st, '#d4b048');
    },
  },
  {
    id: 'dgn/rubble', label: 'Rubble', group: 'furniture', tags: ['debris', 'collapse'],
    aspect: 1.4, defaultWidth: 90, variants: 4, kinds: ['dungeon', 'cave', 'battle'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const s = stoneC(a);
      const n = rng.int(8, 16);
      for (let i = 0; i < n; i++) {
        const x = rng.float(w * 0.12, w * 0.88);
        const y = rng.float(h * 0.15, h * 0.88);
        const r = w * rng.float(0.04, 0.11);
        const pts = blob(x, y, r, r * rng.float(0.6, 1), rng.int(4, 6), 0.22, rng);
        fillPath(ctx, pts, mix(s, rng.bool() ? '#ffffff' : '#000000', rng.float(0, 0.28)));
        inkLine(ctx, pts, rgba(ink(a), 0.5), 1);
      }
    },
  },
  {
    id: 'dgn/bones', label: 'Bones', group: 'furniture', tags: ['skeleton', 'remains'],
    aspect: 1.3, defaultWidth: 70, variants: 3, kinds: ['dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const bone = '#ded6c4';
      ctx.strokeStyle = bone;
      ctx.lineCap = 'round';
      for (let i = 0; i < rng.int(5, 9); i++) {
        const x = rng.float(w * 0.15, w * 0.85), y = rng.float(h * 0.2, h * 0.85);
        const ang = rng.float(0, Math.PI * 2), l = w * rng.float(0.1, 0.24);
        ctx.lineWidth = Math.max(1.5, w * 0.03);
        ctx.beginPath();
        ctx.moveTo(x - Math.cos(ang) * l / 2, y - Math.sin(ang) * l / 2);
        ctx.lineTo(x + Math.cos(ang) * l / 2, y + Math.sin(ang) * l / 2);
        ctx.stroke();
      }
      // Skull
      const sx = w * 0.4, sy = h * 0.5, r = w * 0.11;
      ctx.fillStyle = bone;
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2a2520';
      ctx.beginPath(); ctx.arc(sx - r * 0.36, sy - r * 0.14, r * 0.24, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(sx + r * 0.36, sy - r * 0.14, r * 0.24, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(sx - r * 0.14, sy + r * 0.3, r * 0.28, r * 0.4);
    },
  },
  {
    id: 'dgn/water-pool', label: 'Water Pool', group: 'furniture', tags: ['pond', 'liquid'],
    aspect: 1.4, defaultWidth: 130, variants: 3, kinds: ['dungeon', 'cave', 'battle'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const pts = blob(w / 2, h / 2, w * 0.44, h * 0.42, 5, 0.14, rng);
      fillPath(ctx, pts, (() => {
        const g = ctx.createRadialGradient(w * 0.45, h * 0.45, 0, w / 2, h / 2, w * 0.45);
        g.addColorStop(0, a.palette.shallowWater);
        g.addColorStop(0.7, a.palette.water);
        g.addColorStop(1, a.palette.deepWater);
        return g;
      })());
      inkLine(ctx, pts, rgba(ink(a), 0.45), Math.max(1, w * 0.012));
      // A couple of soft glints rather than ruled lines.
      ctx.strokeStyle = rgba('#ffffff', 0.22);
      ctx.lineWidth = Math.max(1, w * 0.01);
      for (let i = 0; i < 3; i++) {
        const y = h * (0.38 + i * 0.14) + rng.float(-h * 0.02, h * 0.02);
        const x0 = w * rng.float(0.28, 0.4);
        const x1 = w * rng.float(0.6, 0.74);
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.quadraticCurveTo((x0 + x1) / 2, y - h * 0.025, x1, y);
        ctx.stroke();
      }
    },
  },

  // --- Cave dressing (top-down) -------------------------------------------
  {
    id: 'dgn/crystals', label: 'Crystal Cluster', group: 'dungeon', tags: ['gem', 'cave', 'glow'],
    aspect: 1, defaultWidth: 90, variants: 4, kinds: ['cave', 'dungeon'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const hue = a.tint || rng.pick(['#7ac8ff', '#b98aff', '#8affc8', '#ff8ac8']);
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.42;
      radialGlow(ctx, cx, cy, R * 1.7, hue, 0.4);
      groundShadow(ctx, cx + R * 0.15, cy + R * 0.18, R * 0.8, R * 0.75, 0.3);
      const n = rng.int(4, 7);
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + rng.float(-0.35, 0.35);
        const d = R * rng.float(0.1, 0.45);
        const px = cx + Math.cos(ang) * d;
        const py = cy + Math.sin(ang) * d;
        const len = R * rng.float(0.45, 0.95);
        const wide = R * rng.float(0.12, 0.24);
        const dir = ang + rng.float(-0.4, 0.4);
        // A crystal from above: a long hexagonal sliver with a lit facet.
        const tip = { x: px + Math.cos(dir) * len, y: py + Math.sin(dir) * len };
        const side = { x: Math.cos(dir + Math.PI / 2) * wide, y: Math.sin(dir + Math.PI / 2) * wide };
        const body: Vec2[] = [
          { x: px + side.x, y: py + side.y },
          { x: tip.x + side.x * 0.25, y: tip.y + side.y * 0.25 },
          { x: tip.x - side.x * 0.25, y: tip.y - side.y * 0.25 },
          { x: px - side.x, y: py - side.y },
        ];
        fillPath(ctx, body, lightGradient(ctx, px, py, tip.x, tip.y, hue, 0.5, 0.45));
        inkLine(ctx, body, rgba('#ffffff', 0.5), Math.max(1, R * 0.02), true);
        // Facet highlight down the middle.
        inkLine(ctx, [{ x: px, y: py }, tip], rgba('#ffffff', 0.6), Math.max(1, R * 0.03));
      }
    },
  },
  {
    id: 'veg/mushroom-top', label: 'Fungal Cluster (top-down)', group: 'dungeon', tags: ['fungus', 'underdark', 'cave'],
    aspect: 1, defaultWidth: 90, variants: 4, kinds: ['cave', 'dungeon', 'battle'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.44;
      groundShadow(ctx, cx + R * 0.14, cy + R * 0.16, R * 0.85, R * 0.8, 0.26);
      const n = rng.int(4, 8);
      const palette = rng.pick([
        ['#a8484f', '#d97a7f'], ['#6b4a8a', '#a98ac8'],
        ['#4a7f8a', '#8ac0c8'], ['#9c6a3a', '#d0a468'],
      ]);
      for (let i = 0; i < n; i++) {
        const ang = rng.float(0, Math.PI * 2);
        const d = R * Math.sqrt(rng.next()) * 0.75;
        const px = cx + Math.cos(ang) * d;
        const py = cy + Math.sin(ang) * d;
        const cr = R * rng.float(0.16, 0.34);
        // Cap seen from above: a disc with radial gills and a pale centre.
        ctx.save();
        ctx.beginPath(); ctx.arc(px, py, cr, 0, Math.PI * 2);
        ctx.fillStyle = palette[0]; ctx.fill();
        ctx.clip();
        ctx.strokeStyle = rgba('#000000', 0.28);
        ctx.lineWidth = Math.max(1, cr * 0.08);
        const gills = 10;
        for (let k = 0; k < gills; k++) {
          const ga = (k / gills) * Math.PI * 2 + rng.float(-0.1, 0.1);
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + Math.cos(ga) * cr, py + Math.sin(ga) * cr);
          ctx.stroke();
        }
        ctx.restore();
        ctx.fillStyle = palette[1];
        ctx.beginPath(); ctx.arc(px - cr * 0.12, py - cr * 0.12, cr * 0.34, 0, Math.PI * 2); ctx.fill();
        inkLine(ctx, blob(px, py, cr, cr, 8, 0.03, rng), rgba(ink(a), 0.4), Math.max(1, cr * 0.09), true);
      }
    },
  },
  {
    id: 'dgn/stalagmites', label: 'Stalagmites', group: 'dungeon', tags: ['cave', 'rock', 'spire'],
    aspect: 1, defaultWidth: 80, variants: 4, kinds: ['cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const rock = a.tint ? mix(a.palette.rock, a.tint, a.tintStrength) : a.palette.rock;
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.42;
      groundShadow(ctx, cx + R * 0.16, cy + R * 0.18, R * 0.9, R * 0.85, 0.34);
      const n = rng.int(3, 6);
      for (let i = 0; i < n; i++) {
        const ang = rng.float(0, Math.PI * 2);
        const d = R * Math.sqrt(rng.next()) * 0.7;
        const px = cx + Math.cos(ang) * d;
        const py = cy + Math.sin(ang) * d;
        const r = R * rng.float(0.14, 0.3);
        // Concentric rings read as a cone pointing at the viewer.
        for (let k = 3; k >= 0; k--) {
          const rr = r * (0.3 + k * 0.24);
          const pts = blob(px, py, rr, rr * rng.float(0.85, 1.1), rng.int(5, 7), 0.14, rng);
          fillPath(ctx, pts, mix(rock, k === 3 ? '#0f0d0b' : '#efe8dc', k === 3 ? 0.4 : (3 - k) * 0.14));
        }
        inkLine(ctx, blob(px, py, r, r, 6, 0.12, rng), rgba(ink(a), 0.45), Math.max(1, r * 0.08), true);
      }
    },
  },
  {
    id: 'dgn/portal', label: 'Magic Portal', group: 'furniture', tags: ['arcane', 'gate'],
    aspect: 1, defaultWidth: 90, variants: 3, kinds: ['dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.44;
      const hue = a.tint || rng.pick(['#7a4ad4', '#2ab0c4', '#d44a8a']);
      radialGlow(ctx, cx, cy, r * 1.4, hue, 0.55);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.4, hue);
      g.addColorStop(1, mix(hue, '#000000', 0.6));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(cx, cy, r * 0.72, r, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgba('#ffffff', 0.7);
      ctx.lineWidth = Math.max(1.5, r * 0.06);
      ctx.beginPath(); ctx.ellipse(cx, cy, r * 0.72, r, 0, 0, Math.PI * 2); ctx.stroke();
      // Runes
      ctx.fillStyle = rgba('#ffffff', 0.8);
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        ctx.save();
        ctx.translate(cx + Math.cos(ang) * r * 0.88, cy + Math.sin(ang) * r * 1.18);
        ctx.rotate(ang);
        ctx.fillRect(-r * 0.04, -r * 0.08, r * 0.08, r * 0.16);
        ctx.restore();
      }
    },
  },
];
