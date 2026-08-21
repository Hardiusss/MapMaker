/** Landforms: mountains, hills, volcanoes, cliffs, craters, dunes. */
import type { AssetDef, AssetDrawArgs } from '../types';
import { blob, groundShadow, hatch, inkLine, lightGradient, tracePath, speckle, fillPath } from '../draw';
import { mix, rgba } from '../../core/color';
import type { Vec2 } from '../../core/types';

function ink(a: AssetDrawArgs): string {
  return a.tint ? mix(a.palette.ink, a.tint, a.tintStrength * 0.5) : a.palette.ink;
}
function rockColor(a: AssetDrawArgs): string {
  return a.tint ? mix(a.palette.rock, a.tint, a.tintStrength) : a.palette.rock;
}

/** One mountain silhouette with lit face, shadow face and optional snow cap. */
function drawPeak(
  a: AssetDrawArgs,
  cx: number, baseY: number, halfW: number, height: number,
  snow: boolean, lean: number,
): void {
  const { ctx, rng } = a;
  const rock = rockColor(a);
  const apexX = cx + lean * halfW * 0.35;
  const apexY = baseY - height;

  // Silhouette with a couple of shoulder breaks so it is not a plain triangle.
  const left: Vec2[] = [
    { x: cx - halfW, y: baseY },
    { x: cx - halfW * rng.float(0.5, 0.72), y: baseY - height * rng.float(0.28, 0.42) },
    { x: cx - halfW * rng.float(0.18, 0.34), y: baseY - height * rng.float(0.66, 0.8) },
    { x: apexX, y: apexY },
  ];
  const right: Vec2[] = [
    { x: apexX, y: apexY },
    { x: cx + halfW * rng.float(0.2, 0.4), y: baseY - height * rng.float(0.6, 0.78) },
    { x: cx + halfW * rng.float(0.55, 0.78), y: baseY - height * rng.float(0.24, 0.4) },
    { x: cx + halfW, y: baseY },
  ];

  const outline = [...left, ...right.slice(1)];

  ctx.save();
  // Shadow side first (whole silhouette in the darker tone).
  fillPath(ctx, outline, lightGradient(ctx, cx - halfW, apexY, cx + halfW, baseY, rock, 0.05, 0.45));

  // Lit face: the left flank up to the ridge line.
  const litFace = [...left, { x: apexX + halfW * 0.06, y: apexY + height * 0.08 },
    { x: cx - halfW * 0.1, y: baseY }, { x: cx - halfW, y: baseY }];
  ctx.globalAlpha = 0.85;
  fillPath(ctx, litFace, lightGradient(ctx, cx - halfW, apexY, apexX, baseY, mix(rock, '#ffffff', 0.28), 0.35, 0.05));
  ctx.globalAlpha = 1;

  // Ridge crease.
  inkLine(ctx, [{ x: apexX, y: apexY }, { x: cx - halfW * 0.08, y: baseY }], rgba(ink(a), 0.35), Math.max(1, halfW * 0.03));

  // Shadow-side hatching for texture.
  ctx.save();
  tracePath(ctx, [...right, { x: apexX, y: apexY }], true);
  ctx.clip();
  hatch(ctx, cx, apexY, halfW * 1.2, height * 1.2, Math.PI / 3.2, Math.max(2.5, halfW * 0.13), rgba(ink(a), 0.16), Math.max(1, halfW * 0.028));
  ctx.restore();

  if (snow) {
    const capH = height * a.rng.float(0.22, 0.35);
    const capY = apexY + capH;
    const capPts: Vec2[] = [
      { x: apexX - halfW * 0.02, y: apexY },
      { x: cx - halfW * 0.2, y: capY * 0.98 + apexY * 0.02 },
      { x: cx - halfW * 0.28, y: capY + capH * 0.22 },
      { x: cx - halfW * 0.1, y: capY + capH * 0.05 },
      { x: cx + halfW * 0.05, y: capY + capH * 0.3 },
      { x: cx + halfW * 0.2, y: capY },
      { x: cx + halfW * 0.3, y: capY + capH * 0.18 },
      { x: cx + halfW * 0.24, y: capY - capH * 0.15 },
    ];
    fillPath(ctx, capPts, a.palette.snow);
  }

  inkLine(ctx, outline, rgba(ink(a), 0.7), Math.max(1.2, halfW * 0.045));
  ctx.restore();
}

export const TERRAIN_ASSETS: AssetDef[] = [
  {
    id: 'terrain/mountain', label: 'Mountain', group: 'terrain', tags: ['peak', 'alps', 'range'],
    aspect: 1.5, defaultWidth: 180, variants: 4, kinds: ['region', 'hex'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const baseY = h * 0.92;
      groundShadow(ctx, w * 0.5, baseY, w * 0.45, h * 0.09, 0.28);
      const snow = a.variant % 2 === 1;
      // A small back peak gives depth.
      if (a.variant >= 2) {
        ctx.globalAlpha = 0.75;
        drawPeak(a, w * 0.68, baseY - h * 0.03, w * 0.24, h * 0.6, snow, rng.float(-0.3, 0.3));
        ctx.globalAlpha = 1;
      }
      drawPeak(a, w * 0.44, baseY, w * 0.36, h * 0.82, snow, rng.float(-0.25, 0.25));
    },
  },
  {
    id: 'terrain/mountain-range', label: 'Mountain Range', group: 'terrain', tags: ['range', 'chain'],
    aspect: 3.2, defaultWidth: 420, variants: 4, kinds: ['region', 'hex'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const baseY = h * 0.9;
      groundShadow(ctx, w * 0.5, baseY + h * 0.02, w * 0.48, h * 0.1, 0.24);
      const n = rng.int(4, 7);
      const snow = a.variant % 2 === 1;
      // Back row, hazier and lower.
      ctx.globalAlpha = 0.6;
      for (let i = 0; i < n; i++) {
        const cx = ((i + 0.5) / n) * w + rng.float(-w * 0.03, w * 0.03);
        drawPeak(a, cx, baseY - h * 0.06, (w / n) * rng.float(0.42, 0.6), h * rng.float(0.42, 0.6), snow, rng.float(-0.3, 0.3));
      }
      ctx.globalAlpha = 1;
      // Front row.
      for (let i = 0; i < n; i++) {
        const cx = ((i + 0.2 + rng.float(0, 0.6)) / n) * w;
        drawPeak(a, cx, baseY, (w / n) * rng.float(0.5, 0.75), h * rng.float(0.6, 0.92), snow, rng.float(-0.3, 0.3));
      }
    },
  },
  {
    id: 'terrain/hill', label: 'Hill', group: 'terrain', tags: ['mound', 'downs'],
    aspect: 2.2, defaultWidth: 140, variants: 3, kinds: ['region', 'hex'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const base = a.tint ? mix(a.palette.highland, a.tint, a.tintStrength) : a.palette.highland;
      const baseY = h * 0.86;
      groundShadow(ctx, w * 0.5, baseY, w * 0.42, h * 0.11, 0.22);
      const humps = 1 + (a.variant % 3);
      for (let i = 0; i < humps; i++) {
        const cx = w * (0.28 + (i / Math.max(1, humps)) * 0.5) + rng.float(-w * 0.04, w * 0.04);
        const rx = w * rng.float(0.2, 0.3);
        const ry = h * rng.float(0.42, 0.62);
        const pts: Vec2[] = [];
        for (let k = 0; k <= 22; k++) {
          const t = k / 22;
          const ang = Math.PI * (1 + t);
          pts.push({ x: cx + Math.cos(ang) * rx, y: baseY + Math.sin(ang) * ry * (0.92 + rng.float(-0.05, 0.05)) });
        }
        pts.push({ x: cx + rx, y: baseY });
        fillPath(ctx, pts, lightGradient(ctx, cx - rx, baseY - ry, cx + rx, baseY, base, 0.3, 0.32));
        inkLine(ctx, pts, rgba(ink(a), 0.55), Math.max(1, w * 0.012));
        // A couple of contour ticks.
        ctx.save();
        tracePath(ctx, pts, true); ctx.clip();
        hatch(ctx, cx - rx, baseY - ry, rx * 2, ry, Math.PI / 2.6, Math.max(3, w * 0.05), rgba(ink(a), 0.14), 1);
        ctx.restore();
      }
    },
  },
  {
    id: 'terrain/hills-cluster', label: 'Rolling Hills', group: 'terrain', tags: ['downs', 'moor'],
    aspect: 3, defaultWidth: 300, variants: 3, kinds: ['region', 'hex'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const base = a.tint ? mix(a.palette.highland, a.tint, a.tintStrength) : a.palette.highland;
      const rows = 2;
      for (let r = 0; r < rows; r++) {
        const y = h * (0.62 + r * 0.24);
        ctx.globalAlpha = r === 0 ? 0.7 : 1;
        const n = rng.int(3, 5) + r;
        for (let i = 0; i < n; i++) {
          const cx = ((i + rng.float(0.1, 0.9)) / n) * w;
          const rx = w * rng.float(0.09, 0.16);
          const ry = h * rng.float(0.16, 0.26);
          const pts: Vec2[] = [];
          for (let k = 0; k <= 18; k++) {
            const ang = Math.PI * (1 + k / 18);
            pts.push({ x: cx + Math.cos(ang) * rx, y: y + Math.sin(ang) * ry });
          }
          pts.push({ x: cx + rx, y });
          fillPath(ctx, pts, lightGradient(ctx, cx - rx, y - ry, cx + rx, y, base, 0.28, 0.3));
          inkLine(ctx, pts, rgba(ink(a), 0.5), Math.max(1, w * 0.007));
        }
      }
      ctx.globalAlpha = 1;
    },
  },
  {
    id: 'terrain/volcano', label: 'Volcano', group: 'terrain', tags: ['fire', 'caldera'],
    aspect: 1.5, defaultWidth: 200, variants: 2, kinds: ['region', 'hex'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const baseY = h * 0.92;
      const rock = mix(a.palette.rock, '#2c2320', 0.5);
      groundShadow(ctx, w * 0.5, baseY, w * 0.46, h * 0.09, 0.3);
      const halfW = w * 0.4, height = h * 0.72, cx = w * 0.5;
      const rimY = baseY - height;
      const rimHalf = halfW * 0.22;
      const body: Vec2[] = [
        { x: cx - halfW, y: baseY },
        { x: cx - halfW * 0.55, y: baseY - height * 0.45 },
        { x: cx - rimHalf, y: rimY },
        { x: cx - rimHalf * 0.4, y: rimY + height * 0.05 },
        { x: cx + rimHalf * 0.4, y: rimY + height * 0.05 },
        { x: cx + rimHalf, y: rimY },
        { x: cx + halfW * 0.55, y: baseY - height * 0.45 },
        { x: cx + halfW, y: baseY },
      ];
      fillPath(ctx, body, lightGradient(ctx, cx - halfW, rimY, cx + halfW, baseY, rock, 0.22, 0.4));
      inkLine(ctx, body, rgba(ink(a), 0.72), Math.max(1.2, w * 0.012));
      // Lava in the caldera and a couple of flows.
      ctx.save();
      ctx.fillStyle = a.palette.lava;
      ctx.beginPath();
      ctx.ellipse(cx, rimY + height * 0.045, rimHalf * 0.85, height * 0.035, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      for (let i = 0; i < 3; i++) {
        const dir = rng.sign();
        const pts: Vec2[] = [{ x: cx + dir * rimHalf * 0.4, y: rimY + height * 0.06 }];
        let x = pts[0].x, y = pts[0].y;
        for (let k = 0; k < 6; k++) {
          x += dir * rng.float(w * 0.02, w * 0.06);
          y += rng.float(height * 0.08, height * 0.16);
          pts.push({ x, y });
        }
        inkLine(ctx, pts, rgba(a.palette.lava, 0.85), Math.max(1.5, w * 0.016));
      }
      // Plume.
      ctx.globalAlpha = 0.3;
      for (let i = 0; i < 5; i++) {
        const p = blob(cx + rng.float(-w * 0.08, w * 0.08), rimY - h * (0.05 + i * 0.045), w * (0.09 + i * 0.02), h * (0.05 + i * 0.012), 4, 0.3, rng);
        fillPath(ctx, p, '#a89f97');
      }
      ctx.globalAlpha = 1;
    },
  },
  {
    id: 'terrain/plateau', label: 'Plateau / Mesa', group: 'terrain', tags: ['mesa', 'butte'],
    aspect: 2, defaultWidth: 200, variants: 2, kinds: ['region', 'hex'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const rock = rockColor(a);
      const topY = h * 0.34, baseY = h * 0.88;
      const pts: Vec2[] = [
        { x: w * 0.14, y: baseY }, { x: w * 0.2, y: topY + h * 0.06 },
        { x: w * 0.3, y: topY }, { x: w * 0.72, y: topY - h * 0.03 },
        { x: w * 0.82, y: topY + h * 0.05 }, { x: w * 0.88, y: baseY },
      ];
      groundShadow(ctx, w * 0.5, baseY, w * 0.42, h * 0.08, 0.26);
      fillPath(ctx, pts, lightGradient(ctx, w * 0.1, topY, w * 0.9, baseY, rock, 0.2, 0.42));
      // Flat cap.
      const cap = [{ x: w * 0.3, y: topY }, { x: w * 0.72, y: topY - h * 0.03 }, { x: w * 0.78, y: topY + h * 0.04 }, { x: w * 0.26, y: topY + h * 0.07 }];
      fillPath(ctx, cap, mix(a.palette.lowland, rock, 0.35));
      inkLine(ctx, pts, rgba(ink(a), 0.7), Math.max(1.2, w * 0.012));
      ctx.save();
      tracePath(ctx, pts, true); ctx.clip();
      hatch(ctx, 0, topY, w, baseY - topY, 0, Math.max(3, w * 0.035), rgba(ink(a), 0.13), 1);
      ctx.restore();
    },
  },
  {
    id: 'terrain/cliff', label: 'Cliff Line', group: 'terrain', tags: ['escarpment', 'ridge'],
    aspect: 4, defaultWidth: 320, variants: 2,
    draw(a) {
      const { ctx, w, h, rng } = a;
      const rock = rockColor(a);
      const top: Vec2[] = [];
      const n = 14;
      for (let i = 0; i <= n; i++) {
        top.push({ x: (i / n) * w, y: h * 0.4 + rng.gauss(0, h * 0.05) });
      }
      const bottom = top.map((p) => ({ x: p.x + rng.float(-w * 0.01, w * 0.01), y: p.y + h * rng.float(0.28, 0.44) }));
      const poly = [...top, ...bottom.reverse()];
      fillPath(ctx, poly, lightGradient(ctx, 0, h * 0.4, 0, h * 0.85, rock, 0.15, 0.45));
      inkLine(ctx, top, rgba(ink(a), 0.75), Math.max(1.4, h * 0.03));
      // Fall lines describing the face.
      ctx.save();
      tracePath(ctx, poly, true); ctx.clip();
      for (let i = 0; i <= n; i++) {
        inkLine(ctx, [top[i], bottom[n - i]], rgba(ink(a), 0.2), Math.max(1, h * 0.012));
      }
      ctx.restore();
    },
  },
  {
    id: 'terrain/crater', label: 'Crater', group: 'terrain', tags: ['impact', 'sinkhole'],
    aspect: 1, defaultWidth: 160, variants: 2,
    draw(a) {
      const { ctx, w, h, rng } = a;
      const rock = rockColor(a);
      const cx = w / 2, cy = h / 2;
      const outer = blob(cx, cy, w * 0.44, h * 0.42, 5, 0.09, rng);
      fillPath(ctx, outer, lightGradient(ctx, 0, 0, w, h, rock, 0.3, 0.3));
      const inner = blob(cx, cy + h * 0.02, w * 0.28, h * 0.26, 5, 0.12, rng);
      fillPath(ctx, inner, mix(rock, '#000000', 0.5));
      inkLine(ctx, outer, rgba(ink(a), 0.6), Math.max(1, w * 0.012));
      inkLine(ctx, inner, rgba(ink(a), 0.45), Math.max(1, w * 0.01));
      speckle(ctx, 0, 0, w, h, 40, rgba(ink(a), 0.18), w * 0.004, w * 0.012, rng);
    },
  },
  {
    id: 'terrain/dunes', label: 'Sand Dunes', group: 'terrain', tags: ['desert', 'erg'],
    aspect: 3, defaultWidth: 280, variants: 2,
    draw(a) {
      const { ctx, w, h, rng } = a;
      const sand = a.tint ? mix(a.palette.desert, a.tint, a.tintStrength) : a.palette.desert;
      for (let r = 0; r < 3; r++) {
        const y = h * (0.45 + r * 0.2);
        const n = rng.int(2, 4);
        for (let i = 0; i < n; i++) {
          const cx = ((i + rng.float(0.15, 0.85)) / n) * w;
          const rx = w * rng.float(0.14, 0.24);
          const ry = h * rng.float(0.12, 0.2);
          const pts: Vec2[] = [];
          for (let k = 0; k <= 16; k++) {
            const t = k / 16;
            pts.push({ x: cx - rx + t * rx * 2, y: y - Math.sin(t * Math.PI) * ry });
          }
          pts.push({ x: cx + rx * 1.35, y });
          fillPath(ctx, pts, lightGradient(ctx, cx - rx, y - ry, cx + rx, y, sand, 0.3, 0.22));
          inkLine(ctx, pts.slice(0, -1), rgba(ink(a), 0.28), Math.max(1, w * 0.005));
        }
      }
    },
  },
  {
    id: 'terrain/rocks', label: 'Rock Outcrop', group: 'terrain', tags: ['boulders', 'stones'],
    aspect: 1.4, defaultWidth: 90, variants: 4, kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, w, h, rng } = a;
      const rock = rockColor(a);
      groundShadow(ctx, w * 0.5, h * 0.85, w * 0.42, h * 0.12, 0.35);
      const n = 2 + (a.variant % 3);
      for (let i = 0; i < n; i++) {
        const cx = w * rng.float(0.25, 0.75);
        const cy = h * rng.float(0.45, 0.72);
        const r = w * rng.float(0.14, 0.26);
        const pts = blob(cx, cy, r, r * rng.float(0.7, 1), rng.int(4, 6), 0.16, rng);
        fillPath(ctx, pts, lightGradient(ctx, cx - r, cy - r, cx + r, cy + r, rock, 0.3, 0.38));
        inkLine(ctx, pts, rgba(ink(a), 0.65), Math.max(1, w * 0.018));
      }
    },
  },
  {
    id: 'terrain/chasm', label: 'Chasm', group: 'terrain', tags: ['rift', 'canyon', 'pit'],
    aspect: 2.6, defaultWidth: 260, variants: 2,
    draw(a) {
      const { ctx, w, h, rng } = a;
      const top: Vec2[] = [];
      const bot: Vec2[] = [];
      const n = 16;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const mid = h * 0.5 + Math.sin(t * Math.PI * 1.7) * h * 0.12;
        const half = h * (0.08 + Math.sin(t * Math.PI) * 0.24) * rng.float(0.85, 1.15);
        top.push({ x: t * w, y: mid - half });
        bot.push({ x: t * w, y: mid + half });
      }
      const poly = [...top, ...bot.slice().reverse()];
      fillPath(ctx, poly, '#0a0908');
      ctx.save();
      tracePath(ctx, poly, true); ctx.clip();
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, rgba(a.palette.rock, 0.55));
      g.addColorStop(0.45, rgba('#000000', 0));
      g.addColorStop(1, rgba(a.palette.rock, 0.3));
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.restore();
      inkLine(ctx, top, rgba(ink(a), 0.8), Math.max(1.2, h * 0.02));
      inkLine(ctx, bot, rgba(ink(a), 0.8), Math.max(1.2, h * 0.02));
    },
  },
];
