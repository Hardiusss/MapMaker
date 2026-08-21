/**
 * A second wave of assets: the pieces you reach for once the basics are down —
 * standing stones, aqueducts, graveyards, palisades, siege engines, orchards,
 * and the map furniture that makes a page look finished.
 */
import type { AssetDef, AssetDrawArgs } from '../types';
import {
  blob, fillPath, groundShadow, inkLine, lightGradient, radialGlow,
  regularPolygon, roundRect, speckle, star, tracePath, hatch,
} from '../draw';
import { mix, rgba, readableInk } from '../../core/color';
import type { Vec2 } from '../../core/types';

const ink = (a: AssetDrawArgs) => a.palette.ink;
const stoneC = (a: AssetDrawArgs) => (a.tint ? mix(a.palette.rock, a.tint, a.tintStrength) : mix(a.palette.rock, '#8f887c', 0.4));
const woodC = '#6b4a2a';

export const EXTRA_ASSETS: AssetDef[] = [
  // -------------------------------------------------------------- terrain
  {
    id: 'terrain/oasis', label: 'Oasis', group: 'terrain', tags: ['desert', 'water', 'palms'],
    aspect: 1.3, defaultWidth: 130, variants: 3, kinds: ['region', 'hex', 'battle'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const sand = mix(a.palette.desert, '#ffe9b0', 0.3);
      const ring = blob(w * 0.5, h * 0.55, w * 0.42, h * 0.4, 6, 0.12, rng);
      fillPath(ctx, ring, sand);
      const pool = blob(w * 0.5, h * 0.58, w * 0.24, h * 0.22, 5, 0.16, rng);
      fillPath(ctx, pool, (() => {
        const g = ctx.createRadialGradient(w * 0.46, h * 0.54, 0, w * 0.5, h * 0.58, w * 0.26);
        g.addColorStop(0, a.palette.shallowWater);
        g.addColorStop(1, a.palette.deepWater);
        return g;
      })());
      inkLine(ctx, pool, rgba(ink(a), 0.4), Math.max(1, w * 0.01));
      // A few palms leaning over the water.
      for (let i = 0; i < rng.int(3, 5); i++) {
        const x = w * rng.float(0.2, 0.8);
        const groundY = h * rng.float(0.4, 0.72);
        const lean = rng.float(-0.25, 0.25);
        const topX = x + lean * w * 0.18, topY = groundY - h * rng.float(0.25, 0.4);
        ctx.strokeStyle = mix(ink(a), '#8a6b3e', 0.5);
        ctx.lineWidth = Math.max(1.5, w * 0.016);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x, groundY);
        ctx.quadraticCurveTo(x, (groundY + topY) / 2, topX, topY);
        ctx.stroke();
        for (let k = 0; k < 6; k++) {
          const ang = (k / 6) * Math.PI * 2;
          ctx.strokeStyle = mix(a.palette.forest, '#4f9c4a', 0.45);
          ctx.lineWidth = Math.max(1.2, w * 0.013);
          ctx.beginPath();
          ctx.moveTo(topX, topY);
          ctx.quadraticCurveTo(topX + Math.cos(ang) * w * 0.05, topY + Math.sin(ang) * w * 0.02,
            topX + Math.cos(ang) * w * 0.09, topY + Math.sin(ang) * w * 0.05 + h * 0.02);
          ctx.stroke();
        }
      }
    },
  },
  {
    id: 'terrain/glacier', label: 'Glacier', group: 'terrain', tags: ['ice', 'arctic'],
    aspect: 1.6, defaultWidth: 220, variants: 3, kinds: ['region', 'hex'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const body = blob(w * 0.5, h * 0.5, w * 0.45, h * 0.42, 6, 0.14, rng);
      fillPath(ctx, body, lightGradient(ctx, 0, 0, w, h, '#dfeaf2', 0.4, 0.25));
      inkLine(ctx, body, rgba('#7d97ab', 0.8), Math.max(1.2, w * 0.01));
      // Crevasse fields running across the flow direction.
      ctx.save();
      tracePath(ctx, body, true);
      ctx.clip();
      ctx.strokeStyle = rgba('#8fb3c9', 0.85);
      for (let i = 0; i < rng.int(7, 12); i++) {
        const y = h * rng.float(0.15, 0.85);
        ctx.lineWidth = Math.max(1, w * rng.float(0.004, 0.012));
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= w; x += w * 0.1) {
          ctx.lineTo(x, y + Math.sin(x * 0.05 + i) * h * 0.02);
        }
        ctx.stroke();
      }
      ctx.restore();
      speckle(ctx, 0, 0, w, h, 30, rgba('#ffffff', 0.6), w * 0.004, w * 0.012, rng);
    },
  },
  {
    id: 'terrain/geyser', label: 'Geyser Field', group: 'terrain', tags: ['volcanic', 'steam'],
    aspect: 1.2, defaultWidth: 120, variants: 3, kinds: ['region', 'hex', 'battle'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const crust = mix(a.palette.rock, '#c8b48a', 0.45);
      const base = blob(w * 0.5, h * 0.62, w * 0.42, h * 0.32, 6, 0.13, rng);
      fillPath(ctx, base, crust);
      inkLine(ctx, base, rgba(ink(a), 0.4), Math.max(1, w * 0.01));
      for (let i = 0; i < rng.int(2, 4); i++) {
        const cx = w * rng.float(0.28, 0.72), cy = h * rng.float(0.5, 0.75);
        const r = w * rng.float(0.05, 0.1);
        fillPath(ctx, blob(cx, cy, r, r * 0.8, 5, 0.15, rng), mix('#79c6c0', '#ffffff', 0.25));
        inkLine(ctx, blob(cx, cy, r, r * 0.8, 5, 0.15, rng), rgba(ink(a), 0.4), 1);
        ctx.globalAlpha = 0.28;
        for (let k = 0; k < 4; k++) {
          fillPath(ctx, blob(cx + rng.float(-w * 0.03, w * 0.03), cy - h * (0.08 + k * 0.09),
            w * (0.05 + k * 0.02), h * (0.04 + k * 0.012), 4, 0.3, rng), '#e8ecee');
        }
        ctx.globalAlpha = 1;
      }
    },
  },
  {
    id: 'terrain/standing-stones', label: 'Standing Stones', group: 'structures', tags: ['henge', 'ancient', 'druid'],
    aspect: 1, defaultWidth: 110, variants: 4, kinds: ['region', 'battle', 'hex'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const s = stoneC(a);
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.36;
      // Trodden circle of earth.
      fillPath(ctx, blob(cx, cy, R * 1.35, R * 1.3, 7, 0.08, rng), rgba(mix(a.palette.lowland, '#6a5334', 0.5), 0.6));
      const n = rng.int(6, 10);
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + rng.float(-0.12, 0.12);
        const px = cx + Math.cos(ang) * R;
        const py = cy + Math.sin(ang) * R;
        const sw = R * rng.float(0.17, 0.26);
        const sh = R * rng.float(0.3, 0.44);
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(ang + Math.PI / 2 + rng.float(-0.16, 0.16));
        groundShadow(ctx, sw * 0.2, sh * 0.25, sw, sh * 0.5, 0.35);
        ctx.fillStyle = lightGradient(ctx, -sw, -sh, sw, sh, s, 0.35, 0.38);
        roundRect(ctx, -sw / 2, -sh / 2, sw, sh, sw * 0.2);
        ctx.fill();
        ctx.strokeStyle = rgba(ink(a), 0.7);
        ctx.lineWidth = Math.max(1, sw * 0.12);
        ctx.stroke();
        ctx.restore();
      }
    },
  },
  {
    id: 'terrain/sinkhole', label: 'Sinkhole', group: 'terrain', tags: ['pit', 'cave entrance'],
    aspect: 1.1, defaultWidth: 110, variants: 3, kinds: ['region', 'battle', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const rim = blob(w / 2, h / 2, w * 0.42, h * 0.4, 6, 0.13, rng);
      fillPath(ctx, rim, mix(a.palette.rock, '#6d6154', 0.5));
      for (let k = 3; k >= 1; k--) {
        const inner = blob(w / 2, h / 2 + h * 0.02 * k, w * 0.42 * (k / 4), h * 0.4 * (k / 4), 6, 0.16, rng);
        fillPath(ctx, inner, mix('#0a0908', a.palette.rock, (k - 1) * 0.16));
      }
      inkLine(ctx, rim, rgba(ink(a), 0.7), Math.max(1.2, w * 0.014));
      speckle(ctx, w * 0.1, h * 0.1, w * 0.8, h * 0.8, 24, rgba(ink(a), 0.2), w * 0.005, w * 0.014, rng);
    },
  },

  // ----------------------------------------------------------- vegetation
  {
    id: 'veg/orchard', label: 'Orchard', group: 'vegetation', tags: ['farm', 'trees', 'rows'],
    aspect: 1.4, defaultWidth: 180, variants: 3, kinds: ['region', 'city', 'hex'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const cols = rng.int(4, 6), rows = rng.int(3, 5);
      const base = mix(a.palette.forest, '#5f9c48', 0.4);
      ctx.fillStyle = rgba(mix(a.palette.grass, '#6a5334', 0.35), 0.5);
      ctx.fillRect(w * 0.04, h * 0.06, w * 0.92, h * 0.88);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = w * (0.12 + (c / (cols - 1)) * 0.76) + rng.float(-w * 0.015, w * 0.015);
          const y = h * (0.16 + (r / (rows - 1)) * 0.68) + rng.float(-h * 0.015, h * 0.015);
          const rr = Math.min(w / cols, h / rows) * 0.3;
          groundShadow(ctx, x + rr * 0.2, y + rr * 0.25, rr * 0.9, rr * 0.85, 0.22);
          fillPath(ctx, blob(x, y, rr, rr * 0.95, 6, 0.14, rng), mix(base, '#000000', 0.18));
          fillPath(ctx, blob(x - rr * 0.12, y - rr * 0.12, rr * 0.6, rr * 0.58, 5, 0.16, rng), mix(base, '#cfe07a', 0.25));
        }
      }
    },
  },
  {
    id: 'veg/wheat-field', label: 'Wheat Field', group: 'vegetation', tags: ['farm', 'crops'],
    aspect: 1.5, defaultWidth: 200, variants: 3, kinds: ['region', 'city', 'battle'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const gold = mix('#d8c05a', a.palette.lowland, 0.3);
      ctx.fillStyle = gold;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = rgba(mix(gold, '#000000', 0.35), 0.6);
      const rows = rng.int(10, 16);
      for (let i = 0; i < rows; i++) {
        const y = (i / rows) * h + rng.float(-2, 2);
        ctx.lineWidth = Math.max(1, h * 0.008);
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= w; x += w * 0.08) ctx.lineTo(x, y + Math.sin(x * 0.04 + i) * h * 0.008);
        ctx.stroke();
      }
      speckle(ctx, 0, 0, w, h, 90, rgba('#fff0b0', 0.4), w * 0.003, w * 0.008, rng);
      ctx.strokeStyle = rgba(ink(a), 0.45);
      ctx.lineWidth = Math.max(1, h * 0.012);
      ctx.strokeRect(0, 0, w, h);
    },
  },
  {
    id: 'veg/hedge', label: 'Hedge Row', group: 'vegetation', tags: ['barrier', 'garden', 'cover'],
    aspect: 5, defaultWidth: 240, variants: 3, kinds: ['battle', 'city'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const base = mix(a.palette.forest, '#3d7a35', 0.45);
      groundShadow(ctx, w * 0.5, h * 0.68, w * 0.48, h * 0.22, 0.3);
      const lobes = Math.max(6, Math.round(w / (h * 0.8)));
      for (let i = 0; i < lobes; i++) {
        const cx = ((i + 0.5) / lobes) * w;
        const r = (w / lobes) * rng.float(0.6, 0.85);
        fillPath(ctx, blob(cx, h * 0.5, r, h * 0.42, 5, 0.2, rng),
          mix(base, rng.bool() ? '#a8d060' : '#12300f', rng.float(0.05, 0.25)));
      }
      inkLine(ctx, [{ x: 0, y: h * 0.72 }, { x: w, y: h * 0.72 }], rgba(ink(a), 0.25), Math.max(1, h * 0.04));
    },
  },
  {
    id: 'veg/lily-pads', label: 'Lily Pads', group: 'vegetation', tags: ['water', 'swamp'],
    aspect: 1.3, defaultWidth: 110, variants: 4, kinds: ['battle', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const green = mix(a.palette.forest, '#5aa04a', 0.5);
      for (let i = 0; i < rng.int(7, 13); i++) {
        const x = rng.float(w * 0.1, w * 0.9);
        const y = rng.float(h * 0.1, h * 0.9);
        const r = w * rng.float(0.05, 0.11);
        const notch = rng.float(0, Math.PI * 2);
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, r, notch + 0.5, notch - 0.5);
        ctx.closePath();
        ctx.fillStyle = mix(green, rng.bool() ? '#ffffff' : '#000000', rng.float(0, 0.18));
        ctx.fill();
        ctx.strokeStyle = rgba(ink(a), 0.3);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
        if (rng.bool(0.25)) {
          ctx.fillStyle = rng.pick(['#e8d6ea', '#f2e6c8', '#e6a8c0']);
          ctx.beginPath(); ctx.arc(x, y, r * 0.3, 0, Math.PI * 2); ctx.fill();
        }
      }
    },
  },

  // ----------------------------------------------------------- structures
  {
    id: 'town/aqueduct', label: 'Aqueduct', group: 'structures', tags: ['roman', 'bridge', 'water'],
    aspect: 3.5, defaultWidth: 260, variants: 2, kinds: ['region', 'city'],
    draw(a) {
      const { ctx, w, h } = a;
      const s = stoneC(a);
      const arches = 6;
      const deckY = h * 0.32, baseY = h * 0.92;
      ctx.fillStyle = lightGradient(ctx, 0, deckY, 0, baseY, s, 0.28, 0.34);
      ctx.fillRect(0, deckY, w, h * 0.12);
      for (let i = 0; i < arches; i++) {
        const x = (i / arches) * w;
        const bw = w / arches;
        ctx.fillRect(x + bw * 0.36, deckY + h * 0.12, bw * 0.28, baseY - deckY - h * 0.12);
      }
      // Arch openings.
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < arches; i++) {
        const cx = ((i + 0.5) / arches) * w;
        const r = (w / arches) * 0.32;
        ctx.beginPath();
        ctx.moveTo(cx - r, baseY);
        ctx.lineTo(cx - r, deckY + h * 0.28);
        ctx.arc(cx, deckY + h * 0.28, r, Math.PI, 0);
        ctx.lineTo(cx + r, baseY);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      ctx.strokeStyle = rgba(ink(a), 0.6);
      ctx.lineWidth = Math.max(1, h * 0.012);
      ctx.strokeRect(0, deckY, w, h * 0.12);
      // Water channel on top.
      ctx.fillStyle = rgba(a.palette.water, 0.85);
      ctx.fillRect(0, deckY + h * 0.02, w, h * 0.035);
    },
  },
  {
    id: 'town/graveyard', label: 'Graveyard', group: 'structures', tags: ['tombs', 'undead', 'church'],
    aspect: 1.3, defaultWidth: 140, variants: 3, kinds: ['region', 'city', 'battle'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const s = mix(stoneC(a), '#b6b0a4', 0.4);
      ctx.fillStyle = rgba(mix(a.palette.grass, '#5b6b4a', 0.5), 0.55);
      ctx.fillRect(w * 0.04, h * 0.06, w * 0.92, h * 0.88);
      ctx.strokeStyle = rgba(ink(a), 0.5);
      ctx.lineWidth = Math.max(1, w * 0.008);
      ctx.strokeRect(w * 0.04, h * 0.06, w * 0.92, h * 0.88);
      const cols = rng.int(3, 5), rows = rng.int(3, 5);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (rng.bool(0.15)) continue;
          const x = w * (0.16 + (c / Math.max(1, cols - 1)) * 0.68) + rng.float(-w * 0.02, w * 0.02);
          const y = h * (0.2 + (r / Math.max(1, rows - 1)) * 0.62);
          const gw = w * 0.06, gh = h * 0.1;
          groundShadow(ctx, x + gw * 0.3, y + gh * 0.5, gw, gh * 0.4, 0.28);
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(rng.float(-0.12, 0.12));
          ctx.fillStyle = s;
          if (rng.bool(0.7)) {
            ctx.beginPath();
            ctx.moveTo(-gw / 2, gh / 2);
            ctx.lineTo(-gw / 2, -gh * 0.15);
            ctx.arc(0, -gh * 0.15, gw / 2, Math.PI, 0);
            ctx.lineTo(gw / 2, gh / 2);
            ctx.closePath();
            ctx.fill();
          } else {
            ctx.fillRect(-gw * 0.15, -gh / 2, gw * 0.3, gh);
            ctx.fillRect(-gw / 2, -gh * 0.2, gw, gh * 0.26);
          }
          ctx.strokeStyle = rgba(ink(a), 0.55);
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();
        }
      }
    },
  },
  {
    id: 'town/palisade', label: 'Palisade', group: 'structures', tags: ['wall', 'stockade', 'fort'],
    aspect: 5, defaultWidth: 260, variants: 3, kinds: ['battle', 'city', 'region'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      groundShadow(ctx, w * 0.5, h * 0.7, w * 0.5, h * 0.18, 0.3);
      const posts = Math.max(10, Math.round(w / (h * 0.36)));
      for (let i = 0; i < posts; i++) {
        const x = ((i + 0.5) / posts) * w;
        const pw = (w / posts) * 0.9;
        const tone = rng.float(0, 1);
        ctx.save();
        ctx.translate(x, h * 0.5);
        ctx.rotate(rng.float(-0.05, 0.05));
        ctx.fillStyle = mix(woodC, tone > 0.5 ? '#a8763f' : '#3a2612', Math.abs(tone - 0.5) * 0.7);
        ctx.beginPath();
        ctx.moveTo(-pw / 2, h * 0.34);
        ctx.lineTo(-pw / 2, -h * 0.2);
        ctx.lineTo(0, -h * 0.36);
        ctx.lineTo(pw / 2, -h * 0.2);
        ctx.lineTo(pw / 2, h * 0.34);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = rgba(ink(a), 0.55);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }
      // Binding rail.
      ctx.strokeStyle = rgba('#3a2612', 0.75);
      ctx.lineWidth = Math.max(2, h * 0.07);
      ctx.beginPath(); ctx.moveTo(0, h * 0.6); ctx.lineTo(w, h * 0.6); ctx.stroke();
    },
  },
  {
    id: 'town/watchtower-ruin', label: 'Ruined Tower', group: 'structures', tags: ['ruin', 'broken'],
    aspect: 1, defaultWidth: 90, variants: 3, kinds: ['region', 'battle'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const s = stoneC(a);
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.36;
      groundShadow(ctx, cx + R * 0.15, cy + R * 0.2, R * 1.2, R * 1.1, 0.32);
      // Broken ring of wall seen from above.
      const gapStart = rng.float(0, Math.PI * 2);
      const gap = rng.float(0.7, 1.5);
      ctx.beginPath();
      ctx.arc(cx, cy, R, gapStart + gap, gapStart + Math.PI * 2);
      ctx.arc(cx, cy, R * 0.68, gapStart + Math.PI * 2, gapStart + gap, true);
      ctx.closePath();
      ctx.fillStyle = lightGradient(ctx, cx - R, cy - R, cx + R, cy + R, s, 0.32, 0.34);
      ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.7);
      ctx.lineWidth = Math.max(1, R * 0.06);
      ctx.stroke();
      // Rubble spilling from the breach.
      for (let i = 0; i < rng.int(5, 10); i++) {
        const ang = gapStart + rng.float(0, gap);
        const d = R * rng.float(0.8, 1.5);
        const px = cx + Math.cos(ang) * d, py = cy + Math.sin(ang) * d;
        const r = R * rng.float(0.06, 0.13);
        fillPath(ctx, blob(px, py, r, r * 0.8, 5, 0.2, rng), mix(s, '#000000', rng.float(0, 0.3)));
      }
    },
  },
  {
    id: 'town/shrine', label: 'Wayside Shrine', group: 'structures', tags: ['altar', 'road', 'holy'],
    aspect: 1, defaultWidth: 56, variants: 3, kinds: ['region', 'battle', 'city'],
    draw(a) {
      const { ctx, w, h } = a;
      const s = stoneC(a);
      groundShadow(ctx, w * 0.52, h * 0.72, w * 0.3, h * 0.1, 0.3);
      ctx.fillStyle = lightGradient(ctx, w * 0.3, h * 0.3, w * 0.7, h * 0.75, s, 0.3, 0.3);
      ctx.fillRect(w * 0.34, h * 0.34, w * 0.32, h * 0.4);
      ctx.strokeStyle = rgba(ink(a), 0.65);
      ctx.lineWidth = Math.max(1, w * 0.02);
      ctx.strokeRect(w * 0.34, h * 0.34, w * 0.32, h * 0.4);
      // Little peaked roof.
      ctx.fillStyle = mix('#8a3f34', s, 0.2);
      ctx.beginPath();
      ctx.moveTo(w * 0.26, h * 0.36);
      ctx.lineTo(w * 0.5, h * 0.16);
      ctx.lineTo(w * 0.74, h * 0.36);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      fillPath(ctx, star(w * 0.5, h * 0.53, w * 0.09, w * 0.035, 4), a.palette.accent);
    },
  },
  {
    id: 'town/dock', label: 'Wooden Dock', group: 'structures', tags: ['pier', 'water', 'boat'],
    aspect: 2.4, defaultWidth: 160, variants: 3, kinds: ['battle', 'city'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      groundShadow(ctx, w * 0.5, h * 0.62, w * 0.46, h * 0.2, 0.3);
      // Deck planks running along the pier.
      const planks = 6;
      for (let i = 0; i < planks; i++) {
        const y = h * (0.32 + (i / planks) * 0.36);
        ctx.fillStyle = mix(woodC, rng.bool() ? '#a8763f' : '#3a2612', rng.float(0, 0.35));
        ctx.fillRect(w * 0.06, y, w * 0.88, (h * 0.36) / planks - 1);
      }
      ctx.strokeStyle = rgba(ink(a), 0.65);
      ctx.lineWidth = Math.max(1, h * 0.02);
      ctx.strokeRect(w * 0.06, h * 0.32, w * 0.88, h * 0.36);
      // Mooring posts.
      for (const t of [0.12, 0.42, 0.72, 0.94]) {
        ctx.fillStyle = '#3a2612';
        ctx.beginPath();
        ctx.arc(w * t, h * 0.28, h * 0.05, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(w * t, h * 0.72, h * 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },

  // -------------------------------------------------------------- dungeon
  {
    id: 'dgn/trapdoor', label: 'Trapdoor', group: 'dungeon', tags: ['hatch', 'secret'],
    aspect: 1, defaultWidth: 60, variants: 2, kinds: ['dungeon', 'cave', 'battle'],
    draw(a) {
      const { ctx, w, h } = a;
      const inset = w * 0.14;
      ctx.fillStyle = lightGradient(ctx, inset, inset, w - inset, h - inset, woodC, 0.22, 0.34);
      ctx.fillRect(inset, inset, w - inset * 2, h - inset * 2);
      ctx.strokeStyle = rgba(ink(a), 0.8);
      ctx.lineWidth = Math.max(1.5, w * 0.045);
      ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
      ctx.strokeStyle = rgba('#3a2612', 0.7);
      ctx.lineWidth = Math.max(1, w * 0.025);
      for (let i = 1; i < 4; i++) {
        const x = inset + ((w - inset * 2) * i) / 4;
        ctx.beginPath(); ctx.moveTo(x, inset); ctx.lineTo(x, h - inset); ctx.stroke();
      }
      ctx.fillStyle = '#4b5054';
      ctx.beginPath(); ctx.arc(w * 0.72, h * 0.5, w * 0.07, 0, Math.PI * 2); ctx.fill();
    },
  },
  {
    id: 'dgn/lever', label: 'Lever & Mechanism', group: 'dungeon', tags: ['switch', 'puzzle'],
    aspect: 1, defaultWidth: 44, variants: 2, kinds: ['dungeon'],
    draw(a) {
      const { ctx, w, h } = a;
      const s = stoneC(a);
      ctx.fillStyle = s;
      roundRect(ctx, w * 0.2, h * 0.2, w * 0.6, h * 0.6, w * 0.08);
      ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.75);
      ctx.lineWidth = Math.max(1, w * 0.04);
      ctx.stroke();
      ctx.strokeStyle = '#4b5054';
      ctx.lineWidth = Math.max(2, w * 0.09);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(w * 0.5, h * 0.5);
      ctx.lineTo(w * 0.74, h * 0.28);
      ctx.stroke();
      ctx.fillStyle = a.palette.accent;
      ctx.beginPath(); ctx.arc(w * 0.74, h * 0.28, w * 0.07, 0, Math.PI * 2); ctx.fill();
    },
  },
  {
    id: 'dgn/chandelier', label: 'Chandelier', group: 'furniture', tags: ['light', 'hall'],
    aspect: 1, defaultWidth: 90, variants: 2, kinds: ['dungeon', 'city'],
    draw(a) {
      const { ctx, w, h } = a;
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.4;
      radialGlow(ctx, cx, cy, R * 1.8, '#ffcf8a', 0.4);
      ctx.strokeStyle = '#4b5054';
      ctx.lineWidth = Math.max(1.5, R * 0.08);
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.55, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * R * 0.55, cy + Math.sin(ang) * R * 0.55);
        ctx.lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R);
        ctx.stroke();
        ctx.fillStyle = '#ffd88a';
        ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R, R * 0.12, 0, Math.PI * 2); ctx.fill();
      }
    },
  },
  {
    id: 'dgn/summoning-circle', label: 'Summoning Circle', group: 'dungeon', tags: ['ritual', 'arcane', 'glyph'],
    aspect: 1, defaultWidth: 160, variants: 4, kinds: ['dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.45;
      const hue = a.tint || rng.pick(['#c44a3a', '#7a4ad4', '#4ac47a']);
      radialGlow(ctx, cx, cy, R * 1.2, hue, 0.28);
      ctx.strokeStyle = rgba(hue, 0.9);
      ctx.lineWidth = Math.max(1.5, R * 0.035);
      for (const rr of [1, 0.86, 0.52]) {
        ctx.beginPath(); ctx.arc(cx, cy, R * rr, 0, Math.PI * 2); ctx.stroke();
      }
      // Inscribed pentagram or hexagram.
      const points = rng.bool() ? 5 : 6;
      ctx.beginPath();
      for (let i = 0; i <= points; i++) {
        const ang = ((i * (points === 5 ? 2 : 2)) / points) * Math.PI * 2 - Math.PI / 2;
        const px = cx + Math.cos(ang) * R * 0.86;
        const py = cy + Math.sin(ang) * R * 0.86;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
      // Runes around the rim.
      ctx.fillStyle = rgba(hue, 0.95);
      for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * Math.PI * 2;
        ctx.save();
        ctx.translate(cx + Math.cos(ang) * R * 0.93, cy + Math.sin(ang) * R * 0.93);
        ctx.rotate(ang + Math.PI / 2);
        ctx.fillRect(-R * 0.018, -R * 0.045, R * 0.036, R * 0.09);
        ctx.restore();
      }
    },
  },

  // --------------------------------------------------------------- battle
  {
    id: 'btl/ballista', label: 'Ballista', group: 'battle', tags: ['siege', 'engine'],
    aspect: 1.2, defaultWidth: 140, variants: 2, kinds: ['battle'],
    draw(a) {
      const { ctx, w, h } = a;
      groundShadow(ctx, w * 0.52, h * 0.58, w * 0.4, h * 0.3, 0.32);
      // Frame.
      ctx.fillStyle = lightGradient(ctx, w * 0.3, h * 0.3, w * 0.7, h * 0.7, woodC, 0.26, 0.32);
      ctx.fillRect(w * 0.36, h * 0.24, w * 0.28, h * 0.56);
      ctx.strokeStyle = rgba(ink(a), 0.75);
      ctx.lineWidth = Math.max(1, w * 0.012);
      ctx.strokeRect(w * 0.36, h * 0.24, w * 0.28, h * 0.56);
      // Bow arms.
      ctx.strokeStyle = '#3a2612';
      ctx.lineWidth = Math.max(2, w * 0.035);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(w * 0.1, h * 0.2);
      ctx.quadraticCurveTo(w * 0.5, h * 0.34, w * 0.9, h * 0.2);
      ctx.stroke();
      // String.
      ctx.strokeStyle = rgba('#e8dcc0', 0.9);
      ctx.lineWidth = Math.max(1, w * 0.012);
      ctx.beginPath();
      ctx.moveTo(w * 0.1, h * 0.2);
      ctx.lineTo(w * 0.5, h * 0.44);
      ctx.lineTo(w * 0.9, h * 0.2);
      ctx.stroke();
      // Bolt.
      ctx.strokeStyle = '#4b5054';
      ctx.lineWidth = Math.max(2, w * 0.02);
      ctx.beginPath(); ctx.moveTo(w * 0.5, h * 0.44); ctx.lineTo(w * 0.5, h * 0.08); ctx.stroke();
    },
  },
  {
    id: 'btl/broken-wagon', label: 'Wrecked Wagon', group: 'battle', tags: ['ambush', 'debris'],
    aspect: 1.6, defaultWidth: 150, variants: 3, kinds: ['battle'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      groundShadow(ctx, w * 0.52, h * 0.56, w * 0.44, h * 0.3, 0.3);
      ctx.save();
      ctx.translate(w * 0.5, h * 0.5);
      ctx.rotate(rng.float(-0.5, 0.5));
      ctx.fillStyle = lightGradient(ctx, -w * 0.3, -h * 0.2, w * 0.3, h * 0.2, woodC, 0.2, 0.34);
      ctx.fillRect(-w * 0.3, -h * 0.2, w * 0.6, h * 0.4);
      ctx.strokeStyle = rgba(ink(a), 0.7);
      ctx.lineWidth = Math.max(1, w * 0.012);
      ctx.strokeRect(-w * 0.3, -h * 0.2, w * 0.6, h * 0.4);
      // Missing planks.
      ctx.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(rng.float(-w * 0.3, w * 0.2), rng.float(-h * 0.2, h * 0.1), w * 0.09, h * 0.12);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
      // A wheel off its axle.
      const wx = w * rng.float(0.12, 0.3), wy = h * rng.float(0.6, 0.85);
      ctx.save();
      ctx.translate(wx, wy);
      ctx.rotate(rng.float(0, Math.PI));
      ctx.strokeStyle = '#3a2612';
      ctx.lineWidth = Math.max(2, w * 0.02);
      ctx.beginPath(); ctx.ellipse(0, 0, w * 0.09, w * 0.09, 0, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(ang) * w * 0.09, Math.sin(ang) * w * 0.09);
        ctx.stroke();
      }
      ctx.restore();
    },
  },
  {
    id: 'btl/ford-stones', label: 'Stepping Stones', group: 'battle', tags: ['river', 'crossing'],
    aspect: 3, defaultWidth: 200, variants: 3, kinds: ['battle'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const rock = mix(a.palette.rock, '#8d8578', 0.4);
      const n = rng.int(5, 8);
      for (let i = 0; i < n; i++) {
        const x = ((i + 0.5) / n) * w + rng.float(-w * 0.02, w * 0.02);
        const y = h * 0.5 + Math.sin(i * 1.7) * h * 0.22;
        const r = h * rng.float(0.18, 0.3);
        groundShadow(ctx, x + r * 0.15, y + r * 0.2, r, r * 0.85, 0.3);
        fillPath(ctx, blob(x, y, r, r * rng.float(0.75, 1), 5, 0.16, rng),
          lightGradient(ctx, x - r, y - r, x + r, y + r, rock, 0.32, 0.34));
        inkLine(ctx, blob(x, y, r, r * 0.9, 5, 0.16, rng), rgba(ink(a), 0.55), Math.max(1, r * 0.1), true);
      }
    },
  },
  {
    id: 'btl/ice-patch', label: 'Ice Patch', group: 'battle', tags: ['slippery', 'winter'],
    aspect: 1.3, defaultWidth: 160, variants: 3, kinds: ['battle'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const pts = blob(w / 2, h / 2, w * 0.44, h * 0.42, 6, 0.16, rng);
      fillPath(ctx, pts, rgba('#cfe6f2', 0.75));
      ctx.save();
      tracePath(ctx, pts, true);
      ctx.clip();
      ctx.strokeStyle = rgba('#ffffff', 0.6);
      ctx.lineWidth = Math.max(1, w * 0.006);
      for (let i = 0; i < rng.int(6, 12); i++) {
        const x = rng.float(0, w), y = rng.float(0, h);
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let k = 0; k < 3; k++) {
          ctx.lineTo(x + rng.float(-w * 0.16, w * 0.16), y + rng.float(-h * 0.16, h * 0.16));
        }
        ctx.stroke();
      }
      ctx.restore();
      inkLine(ctx, pts, rgba('#8fb3c9', 0.7), Math.max(1, w * 0.008), true);
    },
  },

  // ------------------------------------------------------------- symbols
  {
    id: 'sym/legend-box', label: 'Legend Panel', group: 'symbols', tags: ['key', 'frame'],
    aspect: 0.8, defaultWidth: 260, variants: 2,
    draw(a) {
      const { ctx, w, h } = a;
      const paper = mix(a.palette.parchment, '#ffffff', 0.25);
      ctx.fillStyle = paper;
      roundRect(ctx, w * 0.04, h * 0.04, w * 0.92, h * 0.92, w * 0.03);
      ctx.fill();
      ctx.strokeStyle = rgba(ink(a), 0.85);
      ctx.lineWidth = Math.max(1.5, w * 0.012);
      ctx.stroke();
      ctx.strokeStyle = rgba(ink(a), 0.45);
      ctx.lineWidth = Math.max(1, w * 0.006);
      roundRect(ctx, w * 0.08, h * 0.08, w * 0.84, h * 0.84, w * 0.02);
      ctx.stroke();
      // Ruled lines for the GM to write on.
      ctx.strokeStyle = rgba(ink(a), 0.22);
      for (let i = 1; i < 8; i++) {
        const y = h * (0.16 + i * 0.095);
        ctx.beginPath(); ctx.moveTo(w * 0.14, y); ctx.lineTo(w * 0.86, y); ctx.stroke();
      }
      ctx.fillStyle = rgba(ink(a), 0.75);
      ctx.font = `600 ${h * 0.075}px Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.fillText('LEGEND', w * 0.5, h * 0.15);
    },
  },
  {
    id: 'sym/route-marker', label: 'Route Marker', group: 'markers', tags: ['travel', 'distance'],
    aspect: 1, defaultWidth: 40, variants: 4,
    draw(a) {
      const { ctx, w, h } = a;
      const c = a.tint || a.palette.routes;
      const pts = regularPolygon(w / 2, h / 2, Math.min(w, h) * 0.42, 6);
      fillPath(ctx, pts, mix(a.palette.parchment, '#ffffff', 0.3));
      inkLine(ctx, pts, c, Math.max(1.5, w * 0.07), true);
      ctx.fillStyle = c;
      ctx.font = `700 ${Math.min(w, h) * 0.42}px Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String((a.variant % 9) + 1), w / 2, h / 2 + Math.min(w, h) * 0.02);
    },
  },
  {
    id: 'sym/dragon', label: 'Dragon', group: 'symbols', tags: ['here be dragons', 'ornament'],
    aspect: 1.6, defaultWidth: 190, variants: 3,
    draw(a) {
      const { ctx, w, h, rng } = a;
      const c = a.tint ? mix(ink(a), a.tint, a.tintStrength) : ink(a);
      ctx.save();
      ctx.strokeStyle = rgba(c, 0.9);
      ctx.fillStyle = rgba(c, 0.88);
      ctx.lineWidth = Math.max(1.5, h * 0.03);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Serpentine body.
      const spine: Vec2[] = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        spine.push({ x: w * (0.1 + t * 0.66), y: h * (0.62 + Math.sin(t * Math.PI * 1.6) * 0.16) });
      }
      ctx.beginPath();
      ctx.moveTo(spine[0].x, spine[0].y);
      for (let i = 1; i < spine.length; i++) ctx.lineTo(spine[i].x, spine[i].y);
      ctx.lineWidth = Math.max(3, h * 0.075);
      ctx.stroke();

      // Tail flick.
      ctx.lineWidth = Math.max(1.5, h * 0.03);
      ctx.beginPath();
      ctx.moveTo(spine[0].x, spine[0].y);
      ctx.quadraticCurveTo(w * 0.02, h * 0.5, w * 0.06, h * 0.34);
      ctx.stroke();

      // Wing.
      const wx = w * 0.42, wy = h * 0.5;
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.quadraticCurveTo(w * 0.42, h * 0.05, w * 0.72, h * 0.12);
      ctx.quadraticCurveTo(w * 0.6, h * 0.3, wx + w * 0.14, wy - h * 0.02);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Wing ribs.
      ctx.lineWidth = Math.max(1, h * 0.015);
      for (const t of [0.3, 0.55, 0.8]) {
        ctx.beginPath();
        ctx.moveTo(wx, wy);
        ctx.lineTo(w * (0.44 + t * 0.28), h * (0.06 + t * 0.1));
        ctx.stroke();
      }

      // Head and jaw.
      const hx = w * 0.8, hy = h * (0.62 + Math.sin(Math.PI * 1.6) * 0.16);
      ctx.beginPath();
      ctx.ellipse(hx, hy - h * 0.06, w * 0.07, h * 0.06, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(hx + w * 0.04, hy - h * 0.08);
      ctx.lineTo(hx + w * 0.14, hy - h * 0.14);
      ctx.lineTo(hx + w * 0.05, hy - h * 0.02);
      ctx.closePath();
      ctx.fill();
      // Horn.
      ctx.beginPath();
      ctx.moveTo(hx - w * 0.02, hy - h * 0.11);
      ctx.lineTo(hx - w * 0.07, hy - h * 0.22);
      ctx.stroke();

      // Legs.
      for (const t of [0.35, 0.62]) {
        const p = spine[Math.round(t * 10)];
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - w * 0.03, p.y + h * 0.14);
        ctx.lineTo(p.x + w * 0.02, p.y + h * 0.18);
        ctx.stroke();
      }
      ctx.restore();
    },
  },
];
