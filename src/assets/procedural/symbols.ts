/** Cartographic furniture: compass roses, scale bars, cartouches, markers. */
import type { AssetDef, AssetDrawArgs } from '../types';
import { blob, fillPath, inkLine, regularPolygon, roundRect, star, tracePath } from '../draw';
import { mix, rgba, readableInk } from '../../core/color';
import type { Vec2 } from '../../core/types';

const ink = (a: AssetDrawArgs) => (a.tint ? mix(a.palette.ink, a.tint, a.tintStrength) : a.palette.ink);

export const SYMBOL_ASSETS: AssetDef[] = [
  {
    id: 'sym/compass-rose', label: 'Compass Rose', group: 'symbols', tags: ['north', 'wind rose'],
    aspect: 1, defaultWidth: 200, variants: 4,
    draw(a) {
      const { ctx, w, h } = a;
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.46;
      const c = ink(a);
      const accent = a.palette.accent;
      ctx.save();
      // Outer rings
      ctx.strokeStyle = rgba(c, 0.8);
      ctx.lineWidth = Math.max(1, R * 0.02);
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.92, 0, Math.PI * 2); ctx.stroke();
      // Tick marks
      const ticks = a.variant % 2 === 0 ? 32 : 16;
      for (let i = 0; i < ticks; i++) {
        const ang = (i / ticks) * Math.PI * 2;
        const major = i % (ticks / 8) === 0;
        const r0 = R * (major ? 0.8 : 0.86);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
        ctx.lineTo(cx + Math.cos(ang) * R * 0.92, cy + Math.sin(ang) * R * 0.92);
        ctx.lineWidth = major ? Math.max(1, R * 0.02) : Math.max(1, R * 0.01);
        ctx.stroke();
      }
      // Eight-point star
      const drawPoint = (ang: number, len: number, halfWidth: number, light: boolean) => {
        const tip: Vec2 = { x: cx + Math.cos(ang) * len, y: cy + Math.sin(ang) * len };
        const l: Vec2 = { x: cx + Math.cos(ang + Math.PI / 2) * halfWidth, y: cy + Math.sin(ang + Math.PI / 2) * halfWidth };
        const r: Vec2 = { x: cx + Math.cos(ang - Math.PI / 2) * halfWidth, y: cy + Math.sin(ang - Math.PI / 2) * halfWidth };
        ctx.beginPath();
        ctx.moveTo(tip.x, tip.y); ctx.lineTo(l.x, l.y); ctx.lineTo(cx, cy); ctx.closePath();
        ctx.fillStyle = light ? mix(c, '#ffffff', 0.72) : c;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(tip.x, tip.y); ctx.lineTo(r.x, r.y); ctx.lineTo(cx, cy); ctx.closePath();
        ctx.fillStyle = light ? c : mix(c, '#ffffff', 0.72);
        ctx.fill();
        ctx.strokeStyle = rgba(c, 0.9);
        ctx.lineWidth = Math.max(1, R * 0.012);
        ctx.beginPath();
        ctx.moveTo(tip.x, tip.y); ctx.lineTo(l.x, l.y); ctx.lineTo(cx, cy); ctx.lineTo(r.x, r.y); ctx.closePath();
        ctx.stroke();
      };
      for (let i = 0; i < 4; i++) drawPoint(-Math.PI / 2 + (i / 4) * Math.PI * 2 + Math.PI / 4, R * 0.5, R * 0.07, i % 2 === 0);
      for (let i = 0; i < 4; i++) drawPoint(-Math.PI / 2 + (i / 4) * Math.PI * 2, R * 0.78, R * 0.1, i % 2 === 0);
      // North marker
      ctx.fillStyle = accent;
      const nStar = star(cx, cy - R * 0.86, R * 0.09, R * 0.035, 5);
      fillPath(ctx, nStar, accent);
      // Cardinal letters
      ctx.fillStyle = c;
      ctx.font = `600 ${R * 0.17}px Georgia, 'Times New Roman', serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const letters: [string, number, number][] = [['N', 0, -1], ['E', 1, 0], ['S', 0, 1], ['W', -1, 0]];
      for (const [ch, dx, dy] of letters) {
        if (ch === 'N') continue;
        ctx.fillText(ch, cx + dx * R * 0.68, cy + dy * R * 0.68);
      }
      ctx.restore();
    },
  },
  {
    id: 'sym/compass-simple', label: 'Simple North Arrow', group: 'symbols', tags: ['north'],
    aspect: 0.5, defaultWidth: 70, variants: 2,
    draw(a) {
      const { ctx, w, h } = a;
      const c = ink(a);
      const cx = w / 2;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(cx, h * 0.08);
      ctx.lineTo(cx + w * 0.3, h * 0.72);
      ctx.lineTo(cx, h * 0.56);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = mix(c, '#ffffff', 0.65);
      ctx.beginPath();
      ctx.moveTo(cx, h * 0.08);
      ctx.lineTo(cx - w * 0.3, h * 0.72);
      ctx.lineTo(cx, h * 0.56);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = c; ctx.lineWidth = Math.max(1, w * 0.02);
      ctx.beginPath();
      ctx.moveTo(cx, h * 0.08); ctx.lineTo(cx + w * 0.3, h * 0.72);
      ctx.lineTo(cx, h * 0.56); ctx.lineTo(cx - w * 0.3, h * 0.72);
      ctx.closePath(); ctx.stroke();
      ctx.fillStyle = c;
      ctx.font = `700 ${h * 0.2}px Georgia, serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('N', cx, h * 0.78);
    },
  },
  {
    id: 'sym/scale-bar', label: 'Scale Bar', group: 'symbols', tags: ['distance', 'legend'],
    aspect: 4, defaultWidth: 260, variants: 2,
    draw(a) {
      const { ctx, w, h } = a;
      const c = ink(a);
      const barY = h * 0.5, barH = h * 0.22;
      const segs = 4;
      for (let i = 0; i < segs; i++) {
        ctx.fillStyle = i % 2 === 0 ? c : mix(c, '#ffffff', 0.8);
        ctx.fillRect(w * 0.06 + (i / segs) * w * 0.88, barY, (w * 0.88) / segs, barH);
      }
      ctx.strokeStyle = c;
      ctx.lineWidth = Math.max(1, h * 0.03);
      ctx.strokeRect(w * 0.06, barY, w * 0.88, barH);
      ctx.fillStyle = c;
      ctx.font = `600 ${h * 0.2}px Georgia, serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      for (let i = 0; i <= segs; i++) {
        ctx.fillText(String(i * 25), w * 0.06 + (i / segs) * w * 0.88, barY - h * 0.06);
      }
      ctx.textBaseline = 'top';
      ctx.fillText('miles', w * 0.5, barY + barH + h * 0.06);
    },
  },
  {
    id: 'sym/cartouche', label: 'Title Cartouche', group: 'symbols', tags: ['title', 'frame'],
    aspect: 2.4, defaultWidth: 380, variants: 3,
    draw(a) {
      const { ctx, w, h } = a;
      const c = ink(a);
      const paper = mix(a.palette.parchment, '#ffffff', 0.25);
      ctx.save();
      // Scroll body
      ctx.fillStyle = paper;
      roundRect(ctx, w * 0.08, h * 0.16, w * 0.84, h * 0.68, h * 0.08);
      ctx.fill();
      ctx.strokeStyle = rgba(c, 0.85);
      ctx.lineWidth = Math.max(1.5, h * 0.02);
      ctx.stroke();
      // Inner rule
      ctx.strokeStyle = rgba(c, 0.5);
      ctx.lineWidth = Math.max(1, h * 0.012);
      roundRect(ctx, w * 0.12, h * 0.24, w * 0.76, h * 0.52, h * 0.05);
      ctx.stroke();
      // Curled ends
      for (const side of [-1, 1]) {
        const x = side < 0 ? w * 0.08 : w * 0.92;
        ctx.fillStyle = mix(paper, '#000000', 0.12);
        ctx.beginPath();
        ctx.ellipse(x, h * 0.5, w * 0.05, h * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = rgba(c, 0.8);
        ctx.lineWidth = Math.max(1.5, h * 0.02);
        ctx.stroke();
      }
      // Flourishes
      ctx.strokeStyle = rgba(c, 0.7);
      ctx.lineWidth = Math.max(1, h * 0.014);
      for (const side of [-1, 1]) {
        const x0 = w * 0.5 + side * w * 0.16;
        ctx.beginPath();
        ctx.moveTo(x0, h * 0.68);
        ctx.quadraticCurveTo(x0 + side * w * 0.1, h * 0.76, x0 + side * w * 0.18, h * 0.68);
        ctx.stroke();
      }
      ctx.restore();
    },
  },
  {
    id: 'sym/banner', label: 'Banner Ribbon', group: 'symbols', tags: ['label', 'title'],
    aspect: 3.6, defaultWidth: 300, variants: 3,
    draw(a) {
      const { ctx, w, h } = a;
      const c = ink(a);
      const paper = mix(a.palette.parchment, '#ffffff', 0.3);
      ctx.fillStyle = paper;
      ctx.beginPath();
      ctx.moveTo(w * 0.08, h * 0.28);
      ctx.lineTo(w * 0.92, h * 0.28);
      ctx.lineTo(w * 0.86, h * 0.5);
      ctx.lineTo(w * 0.92, h * 0.72);
      ctx.lineTo(w * 0.08, h * 0.72);
      ctx.lineTo(w * 0.14, h * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = rgba(c, 0.85);
      ctx.lineWidth = Math.max(1.2, h * 0.03);
      ctx.stroke();
      // Tails
      ctx.fillStyle = mix(paper, '#000000', 0.18);
      for (const side of [-1, 1]) {
        const x = side < 0 ? w * 0.08 : w * 0.92;
        ctx.beginPath();
        ctx.moveTo(x, h * 0.28);
        ctx.lineTo(x - side * w * 0.06, h * 0.16);
        ctx.lineTo(x - side * w * 0.06, h * 0.84);
        ctx.lineTo(x, h * 0.72);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
      }
    },
  },
  {
    id: 'sym/x-marks', label: 'X Marks the Spot', group: 'markers', tags: ['treasure', 'quest'],
    aspect: 1, defaultWidth: 60, variants: 2,
    draw(a) {
      const { ctx, w, h } = a;
      ctx.strokeStyle = a.tint || a.palette.accent;
      ctx.lineWidth = Math.max(3, w * 0.14);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(w * 0.2, h * 0.2); ctx.lineTo(w * 0.8, h * 0.8);
      ctx.moveTo(w * 0.8, h * 0.2); ctx.lineTo(w * 0.2, h * 0.8);
      ctx.stroke();
    },
  },
  {
    id: 'sym/skull', label: 'Skull Marker', group: 'markers', tags: ['danger', 'death'],
    aspect: 1, defaultWidth: 60, variants: 2,
    draw(a) {
      const { ctx, w, h } = a;
      const c = ink(a);
      ctx.fillStyle = mix(c, '#ffffff', 0.85);
      ctx.beginPath();
      ctx.ellipse(w * 0.5, h * 0.42, w * 0.3, h * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(w * 0.34, h * 0.6, w * 0.32, h * 0.18);
      ctx.strokeStyle = c; ctx.lineWidth = Math.max(1, w * 0.03);
      ctx.stroke();
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.ellipse(w * 0.38, h * 0.4, w * 0.09, h * 0.11, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(w * 0.62, h * 0.4, w * 0.09, h * 0.11, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(w * 0.5, h * 0.5); ctx.lineTo(w * 0.55, h * 0.6); ctx.lineTo(w * 0.45, h * 0.6);
      ctx.closePath(); ctx.fill();
      ctx.lineWidth = Math.max(1, w * 0.02);
      for (let i = 0; i < 3; i++) {
        const x = w * (0.4 + i * 0.1);
        ctx.beginPath(); ctx.moveTo(x, h * 0.6); ctx.lineTo(x, h * 0.78); ctx.stroke();
      }
    },
  },
  {
    id: 'sym/sea-monster', label: 'Sea Monster', group: 'symbols', tags: ['kraken', 'ocean', 'here be dragons'],
    aspect: 1.8, defaultWidth: 180, variants: 3,
    draw(a) {
      const { ctx, w, h, rng } = a;
      const c = ink(a);
      ctx.strokeStyle = rgba(c, 0.9);
      ctx.lineWidth = Math.max(2, h * 0.05);
      ctx.lineCap = 'round';
      // Serpent coils rising out of the water
      const humps = 3;
      for (let i = 0; i < humps; i++) {
        const x0 = w * (0.16 + i * 0.24);
        ctx.beginPath();
        ctx.moveTo(x0, h * 0.66);
        ctx.quadraticCurveTo(x0 + w * 0.06, h * 0.36, x0 + w * 0.14, h * 0.66);
        ctx.stroke();
      }
      // Head
      const hx = w * 0.78, hy = h * 0.42;
      ctx.fillStyle = rgba(c, 0.9);
      ctx.beginPath();
      ctx.ellipse(hx, hy, w * 0.09, h * 0.13, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(hx + w * 0.05, hy - h * 0.06);
      ctx.lineTo(hx + w * 0.14, hy - h * 0.14);
      ctx.lineTo(hx + w * 0.07, hy + h * 0.01);
      ctx.closePath(); ctx.fill();
      // Waterline
      ctx.strokeStyle = rgba(c, 0.5);
      ctx.lineWidth = Math.max(1, h * 0.02);
      for (let i = 0; i < 3; i++) {
        const y = h * (0.7 + i * 0.08);
        ctx.beginPath();
        ctx.moveTo(w * 0.06, y);
        for (let x = w * 0.06; x < w * 0.94; x += w * 0.08) {
          ctx.quadraticCurveTo(x + w * 0.02, y - h * 0.02, x + w * 0.04, y);
          ctx.quadraticCurveTo(x + w * 0.06, y + h * 0.02, x + w * 0.08, y);
        }
        ctx.stroke();
      }
    },
  },
  {
    id: 'sym/ship', label: 'Sailing Ship', group: 'symbols', tags: ['sea', 'trade route'],
    aspect: 1.3, defaultWidth: 90, variants: 2,
    draw(a) {
      const { ctx, w, h } = a;
      const c = ink(a);
      ctx.fillStyle = rgba(c, 0.9);
      ctx.beginPath();
      ctx.moveTo(w * 0.12, h * 0.62);
      ctx.lineTo(w * 0.88, h * 0.62);
      ctx.quadraticCurveTo(w * 0.76, h * 0.84, w * 0.3, h * 0.82);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba(c, 0.9);
      ctx.lineWidth = Math.max(1, w * 0.02);
      ctx.beginPath(); ctx.moveTo(w * 0.5, h * 0.62); ctx.lineTo(w * 0.5, h * 0.1); ctx.stroke();
      ctx.fillStyle = mix(a.palette.parchment, '#ffffff', 0.4);
      ctx.beginPath();
      ctx.moveTo(w * 0.5, h * 0.14);
      ctx.quadraticCurveTo(w * 0.8, h * 0.3, w * 0.5, h * 0.55);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(w * 0.48, h * 0.2);
      ctx.quadraticCurveTo(w * 0.24, h * 0.34, w * 0.48, h * 0.55);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    },
  },
  {
    id: 'sym/wind-face', label: 'Wind Face', group: 'symbols', tags: ['ornament', 'corner'],
    aspect: 1, defaultWidth: 110, variants: 3,
    draw(a) {
      const { ctx, w, h, rng } = a;
      const c = ink(a);
      const cx = w * 0.4, cy = h * 0.5, r = Math.min(w, h) * 0.28;
      // Cheeks / cloud
      const pts = blob(cx, cy, r, r * 1.05, 6, 0.14, rng);
      fillPath(ctx, pts, mix(a.palette.parchment, '#ffffff', 0.4));
      inkLine(ctx, pts, rgba(c, 0.85), Math.max(1.2, r * 0.06));
      // Face
      ctx.fillStyle = rgba(c, 0.9);
      ctx.beginPath(); ctx.arc(cx - r * 0.3, cy - r * 0.15, r * 0.08, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + r * 0.12, cy - r * 0.15, r * 0.08, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgba(c, 0.9);
      ctx.lineWidth = Math.max(1.5, r * 0.08);
      ctx.beginPath(); ctx.arc(cx - r * 0.05, cy + r * 0.25, r * 0.18, 0.1, Math.PI - 0.1); ctx.stroke();
      // Gust lines
      ctx.lineWidth = Math.max(1.5, r * 0.07);
      for (let i = 0; i < 3; i++) {
        const y = cy - r * 0.3 + i * r * 0.34;
        ctx.beginPath();
        ctx.moveTo(cx + r * 0.9, y);
        ctx.quadraticCurveTo(cx + r * 1.6, y - r * 0.22, cx + r * 2.1, y);
        ctx.stroke();
      }
    },
  },
  {
    id: 'mrk/pin', label: 'Map Pin', group: 'markers', tags: ['location', 'note'],
    aspect: 0.7, defaultWidth: 44, variants: 3,
    draw(a) {
      const { ctx, w, h } = a;
      const c = a.tint || a.palette.accent;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(w * 0.5, h * 0.96);
      ctx.quadraticCurveTo(w * 0.05, h * 0.5, w * 0.5, h * 0.06);
      ctx.quadraticCurveTo(w * 0.95, h * 0.5, w * 0.5, h * 0.96);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba(a.palette.ink, 0.7);
      ctx.lineWidth = Math.max(1, w * 0.05);
      ctx.stroke();
      ctx.fillStyle = readableInk(c);
      ctx.beginPath(); ctx.arc(w * 0.5, h * 0.36, w * 0.16, 0, Math.PI * 2); ctx.fill();
    },
  },
  {
    id: 'mrk/flag', label: 'Flag', group: 'markers', tags: ['claim', 'faction'],
    aspect: 0.8, defaultWidth: 48, variants: 3,
    draw(a) {
      const { ctx, w, h } = a;
      const c = a.tint || a.palette.accent;
      ctx.strokeStyle = rgba(a.palette.ink, 0.85);
      ctx.lineWidth = Math.max(1.5, w * 0.07);
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(w * 0.24, h * 0.96); ctx.lineTo(w * 0.24, h * 0.06); ctx.stroke();
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(w * 0.24, h * 0.08);
      ctx.lineTo(w * 0.92, h * 0.22);
      ctx.lineTo(w * 0.24, h * 0.42);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba(a.palette.ink, 0.7);
      ctx.lineWidth = Math.max(1, w * 0.03);
      ctx.stroke();
    },
  },
  {
    id: 'mrk/numbered', label: 'Numbered Marker', group: 'markers', tags: ['key', 'room'],
    aspect: 1, defaultWidth: 44, variants: 9,
    draw(a) {
      const { ctx, w, h } = a;
      const c = a.tint || a.palette.accent;
      const r = Math.min(w, h) * 0.44;
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgba(a.palette.ink, 0.85);
      ctx.lineWidth = Math.max(1.5, r * 0.12);
      ctx.stroke();
      ctx.fillStyle = readableInk(c);
      ctx.font = `700 ${r * 1.1}px Georgia, serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String((a.variant % 9) + 1), w / 2, h / 2 + r * 0.06);
    },
  },
  {
    id: 'sym/border-frame', label: 'Decorative Border', group: 'symbols', tags: ['frame', 'edge'],
    aspect: 1.5, defaultWidth: 600, variants: 3,
    draw(a) {
      const { ctx, w, h } = a;
      const c = ink(a);
      ctx.save();
      ctx.strokeStyle = rgba(c, 0.85);
      ctx.lineWidth = Math.max(2, Math.min(w, h) * 0.012);
      ctx.strokeRect(w * 0.02, h * 0.02, w * 0.96, h * 0.96);
      ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.005);
      ctx.strokeRect(w * 0.045, h * 0.045, w * 0.91, h * 0.91);
      // Corner rosettes
      const cr = Math.min(w, h) * 0.05;
      for (const [x, y] of [[0.045, 0.045], [0.955, 0.045], [0.045, 0.955], [0.955, 0.955]] as const) {
        ctx.beginPath(); ctx.arc(w * x, h * y, cr, 0, Math.PI * 2);
        ctx.fillStyle = mix(a.palette.parchment, '#ffffff', 0.3); ctx.fill();
        ctx.strokeStyle = rgba(c, 0.85); ctx.stroke();
        const st = star(w * x, h * y, cr * 0.7, cr * 0.3, 8);
        fillPath(ctx, st, rgba(c, 0.85));
      }
      ctx.restore();
    },
  },
];
