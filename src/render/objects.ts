/** Draws every kind of `MapObject` into a 2D context in map coordinates. */
import type {
  MapObject, StampObject, TextObject, ShapeObject, PathObject, TokenObject, ImageObject,
  FillStyle, Vec2, GridConfig,
} from '../core/types';
import { blendToComposite } from '../core/types';
import { renderAsset } from '../assets/library';
import { getPattern } from './textures';
import { catmullRom, resample, pathLength, dist, norm, sub, perp } from '../core/geometry';
import { RNG } from '../core/rng';
import { mix, rgba, readableInk } from '../core/color';
import { loadImage } from '../util/canvas';

export interface DrawObjectOptions {
  paletteId: string;
  /** Editor-only chrome (selection handles are drawn separately). */
  forExport?: boolean;
  grid?: GridConfig;
}

/**
 * Decoded imported artwork, keyed by object id.
 *
 * Entries outlive the objects that made them — deleting an image from the map
 * left its decode behind for the rest of the session — so the map is bounded.
 * Evicting only costs a re-decode from the `src` the object still carries.
 */
const IMAGE_CACHE_MAX = 48;
const imageCache = new Map<string, HTMLImageElement>();

function rememberImage(id: string, img: HTMLImageElement): void {
  imageCache.delete(id);
  imageCache.set(id, img);
  while (imageCache.size > IMAGE_CACHE_MAX) {
    // Map iterates in insertion order, so the first key is the coldest.
    const oldest = imageCache.keys().next().value;
    if (oldest === undefined) break;
    imageCache.delete(oldest);
  }
}

export function drawObject(ctx: CanvasRenderingContext2D, o: MapObject, opts: DrawObjectOptions): void {
  if (!o.visible) return;
  ctx.save();
  ctx.globalAlpha = o.opacity;
  ctx.globalCompositeOperation = blendToComposite(o.blend);
  ctx.translate(o.x, o.y);
  if (o.rotation) ctx.rotate((o.rotation * Math.PI) / 180);
  ctx.scale(o.scaleX, o.scaleY);
  if (o.shadow) {
    ctx.shadowColor = o.shadow.color;
    ctx.shadowBlur = o.shadow.blur;
    ctx.shadowOffsetX = o.shadow.dx;
    ctx.shadowOffsetY = o.shadow.dy;
  }
  switch (o.kind) {
    case 'stamp': drawStamp(ctx, o, opts); break;
    case 'text': drawText(ctx, o, opts); break;
    case 'shape': drawShape(ctx, o, opts); break;
    case 'path': drawPath(ctx, o, opts); break;
    case 'token': drawToken(ctx, o, opts); break;
    case 'image': drawImageObject(ctx, o); break;
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Stamps
// ---------------------------------------------------------------------------

function drawStamp(ctx: CanvasRenderingContext2D, o: StampObject, opts: DrawObjectOptions): void {
  const surf = renderAsset(o.assetId, {
    width: o.width,
    height: o.height,
    seed: o.seed,
    paletteId: o.palette || opts.paletteId,
    tint: o.tint,
    tintStrength: o.tintStrength,
    variant: o.variant ?? (o.seed % 16),
  });
  ctx.drawImage(surf, -o.width / 2, -o.height / 2, o.width, o.height);
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

export function fontString(o: TextObject): string {
  return `${o.italic ? 'italic ' : ''}${o.bold ? '700' : '400'} ${o.size}px ${o.font}`;
}

function drawText(ctx: CanvasRenderingContext2D, o: TextObject, opts: DrawObjectOptions): void {
  ctx.font = fontString(o);
  ctx.textAlign = o.curve === 'straight' ? o.align : 'center';
  ctx.textBaseline = 'middle';

  const lines = o.text.split('\n');

  if (o.banner && o.banner !== 'none') drawBanner(ctx, o, lines);

  if (o.curve === 'straight') {
    const totalH = (lines.length - 1) * o.size * o.lineHeight;
    lines.forEach((line, i) => {
      const y = -totalH / 2 + i * o.size * o.lineHeight;
      drawTracked(ctx, line, 0, y, o);
    });
  } else {
    drawArcText(ctx, o);
  }
}

/** Letter-spacing aware text drawing (canvas has no letterSpacing everywhere). */
function drawTracked(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, o: TextObject): void {
  if (!o.letterSpacing) {
    if (o.strokeWidth > 0) {
      ctx.lineWidth = o.strokeWidth;
      ctx.strokeStyle = o.strokeColor;
      ctx.lineJoin = 'round';
      ctx.strokeText(text, x, y);
    }
    ctx.fillStyle = o.color;
    ctx.fillText(text, x, y);
    return;
  }
  const chars = Array.from(text);
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + o.letterSpacing * (chars.length - 1);
  let cx = o.align === 'center' ? x - total / 2 : o.align === 'right' ? x - total : x;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  for (let i = 0; i < chars.length; i++) {
    if (o.strokeWidth > 0) {
      ctx.lineWidth = o.strokeWidth;
      ctx.strokeStyle = o.strokeColor;
      ctx.lineJoin = 'round';
      ctx.strokeText(chars[i], cx, y);
    }
    ctx.fillStyle = o.color;
    ctx.fillText(chars[i], cx, y);
    cx += widths[i] + o.letterSpacing;
  }
  ctx.textAlign = prevAlign;
}

function drawArcText(ctx: CanvasRenderingContext2D, o: TextObject): void {
  const chars = Array.from(o.text.replace(/\n/g, ' '));
  const widths = chars.map((c) => ctx.measureText(c).width + o.letterSpacing);
  const total = widths.reduce((a, b) => a + b, 0);
  const R = Math.max(20, o.curveRadius);
  const up = o.curve === 'arcUp';
  const totalAngle = total / R;
  let angle = -totalAngle / 2;
  ctx.save();
  ctx.textAlign = 'center';
  for (let i = 0; i < chars.length; i++) {
    const step = widths[i] / R;
    const a = angle + step / 2;
    ctx.save();
    if (up) {
      ctx.translate(Math.sin(a) * R, -Math.cos(a) * R + R);
      ctx.rotate(a);
    } else {
      ctx.translate(Math.sin(a) * R, Math.cos(a) * R - R);
      ctx.rotate(-a);
    }
    if (o.strokeWidth > 0) {
      ctx.lineWidth = o.strokeWidth;
      ctx.strokeStyle = o.strokeColor;
      ctx.lineJoin = 'round';
      ctx.strokeText(chars[i], 0, 0);
    }
    ctx.fillStyle = o.color;
    ctx.fillText(chars[i], 0, 0);
    ctx.restore();
    angle += step;
  }
  ctx.restore();
}

function drawBanner(ctx: CanvasRenderingContext2D, o: TextObject, lines: string[]): void {
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width + o.letterSpacing * l.length)) + o.size * 1.2;
  const h = lines.length * o.size * o.lineHeight + o.size * 0.5;
  const color = o.bannerColor || rgba('#efe3c6', 0.85);
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = rgba(o.color, 0.7);
  ctx.lineWidth = Math.max(1, o.size * 0.04);
  if (o.banner === 'plaque') {
    ctx.beginPath();
    ctx.rect(-w / 2, -h / 2, w, h);
    ctx.fill(); ctx.stroke();
  } else if (o.banner === 'scroll') {
    ctx.beginPath();
    ctx.moveTo(-w / 2, -h / 2);
    ctx.lineTo(w / 2, -h / 2);
    ctx.lineTo(w / 2 - h * 0.2, 0);
    ctx.lineTo(w / 2, h / 2);
    ctx.lineTo(-w / 2, h / 2);
    ctx.lineTo(-w / 2 + h * 0.2, 0);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  } else if (o.banner === 'underline') {
    ctx.beginPath();
    ctx.moveTo(-w / 2 + o.size * 0.3, h / 2);
    ctx.lineTo(w / 2 - o.size * 0.3, h / 2);
    ctx.strokeStyle = o.color;
    ctx.lineWidth = Math.max(1, o.size * 0.06);
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export function resolveFill(ctx: CanvasRenderingContext2D, f: FillStyle, w: number, h: number, paletteId: string): string | CanvasGradient | CanvasPattern {
  switch (f.type) {
    case 'none': return 'rgba(0,0,0,0)';
    case 'texture':
      return getPattern(ctx, f.textureId || 'grass', { paletteId, scale: f.textureScale ?? 1 });
    case 'linear': {
      const a = ((f.angle ?? 0) * Math.PI) / 180;
      const g = ctx.createLinearGradient(-Math.cos(a) * w / 2, -Math.sin(a) * h / 2, Math.cos(a) * w / 2, Math.sin(a) * h / 2);
      g.addColorStop(0, f.color);
      g.addColorStop(1, f.color2 || mix(f.color, '#000000', 0.4));
      return g;
    }
    case 'radial': {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(w, h) / 2);
      g.addColorStop(0, f.color);
      g.addColorStop(1, f.color2 || mix(f.color, '#000000', 0.5));
      return g;
    }
    default: return f.color;
  }
}

function shapePath(ctx: CanvasRenderingContext2D, o: ShapeObject): void {
  const { w, h } = o;
  ctx.beginPath();
  switch (o.shape) {
    case 'rect': {
      const r = Math.min(o.cornerRadius, w / 2, h / 2);
      if (r <= 0) { ctx.rect(-w / 2, -h / 2, w, h); break; }
      const x = -w / 2, y = -h / 2;
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      break;
    }
    case 'ellipse':
      ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
      break;
    case 'polygon': {
      const n = Math.max(3, o.sides);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        const px = (Math.cos(a) * w) / 2, py = (Math.sin(a) * h) / 2;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    }
    case 'star': {
      const n = Math.max(3, o.sides);
      for (let i = 0; i < n * 2; i++) {
        const rr = i % 2 === 0 ? 1 : 0.45;
        const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
        const px = (Math.cos(a) * w * rr) / 2, py = (Math.sin(a) * h * rr) / 2;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    }
    case 'freeform': {
      if (!o.points.length) break;
      ctx.moveTo(o.points[0].x, o.points[0].y);
      for (let i = 1; i < o.points.length; i++) ctx.lineTo(o.points[i].x, o.points[i].y);
      ctx.closePath();
      break;
    }
  }
}

function drawShape(ctx: CanvasRenderingContext2D, o: ShapeObject, opts: DrawObjectOptions): void {
  shapePath(ctx, o);
  if (o.fill.type !== 'none') {
    ctx.fillStyle = resolveFill(ctx, o.fill, o.w, o.h, opts.paletteId);
    ctx.fill();
  }
  if (o.strokeWidth > 0) {
    ctx.strokeStyle = o.strokeColor;
    ctx.lineWidth = o.strokeWidth;
    ctx.setLineDash(o.dash || []);
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

// ---------------------------------------------------------------------------
// Paths (rivers, roads, borders)
// ---------------------------------------------------------------------------

/** Returns the polyline the path actually renders, in local space. */
export function pathPolyline(o: PathObject): Vec2[] {
  if (o.nodes.length < 2) return o.nodes.map((n) => ({ x: n.x, y: n.y }));
  let pts: Vec2[] = o.smoothing > 0
    ? catmullRom(o.nodes.map((n) => ({ x: n.x, y: n.y })), Math.max(2, Math.round(o.smoothing * 12)), o.closed)
    : o.nodes.map((n) => ({ x: n.x, y: n.y }));
  if (o.jitter > 0) {
    // Seeded from the path's own shape, not from `o.id`.
    //
    // The id is a random string minted when the object is created, so the same
    // map seed grew a different set of roads on every generation — the routes
    // ran between the same towns but wandered differently, which is exactly
    // the thing "same seed, same map" is supposed to rule out. The first node,
    // the node count and the width are stable across a regeneration and across
    // a save and reload, and no two paths on a map share all three.
    const n0 = o.nodes[0];
    const rng = new RNG(`path:${n0.x.toFixed(2)},${n0.y.toFixed(2)}:${o.nodes.length}:${o.width}`);
    pts = pts.map((p, i) => {
      const edge = Math.min(i, pts.length - 1 - i) / Math.max(1, pts.length * 0.1);
      const k = Math.min(1, edge);
      return { x: p.x + rng.gauss(0, o.jitter) * k, y: p.y + rng.gauss(0, o.jitter) * k };
    });
  }
  return pts;
}

/** Build the outline of a variable-width ribbon along a polyline. */
export function ribbon(pts: Vec2[], widthAt: (t: number) => number): Vec2[] {
  const left: Vec2[] = [], right: Vec2[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(n - 1, i + 1)];
    const dir = norm(sub(next, prev));
    const nrm = perp(dir);
    const hw = widthAt(i / Math.max(1, n - 1)) / 2;
    left.push({ x: pts[i].x + nrm.x * hw, y: pts[i].y + nrm.y * hw });
    right.push({ x: pts[i].x - nrm.x * hw, y: pts[i].y - nrm.y * hw });
  }
  return [...left, ...right.reverse()];
}

function drawPath(ctx: CanvasRenderingContext2D, o: PathObject, opts: DrawObjectOptions): void {
  const pts = pathPolyline(o);
  if (pts.length < 2) return;

  const widthAt = (t: number) => {
    const base = o.width;
    if (o.taper <= 0) return base;
    return base * (1 - o.taper) + base * o.taper * t;
  };

  const trace = (p: Vec2[]) => {
    ctx.beginPath();
    ctx.moveTo(p[0].x, p[0].y);
    for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
    if (o.closed) ctx.closePath();
  };

  switch (o.style) {
    case 'river': {
      const outline = ribbon(pts, (t) => widthAt(t) + o.outlineWidth * 2);
      ctx.beginPath();
      ctx.moveTo(outline[0].x, outline[0].y);
      for (const p of outline) ctx.lineTo(p.x, p.y);
      ctx.closePath();
      ctx.fillStyle = o.outlineColor;
      ctx.fill();

      const body = ribbon(pts, widthAt);
      ctx.beginPath();
      ctx.moveTo(body[0].x, body[0].y);
      for (const p of body) ctx.lineTo(p.x, p.y);
      ctx.closePath();
      const g = ctx.createLinearGradient(pts[0].x, pts[0].y, pts[pts.length - 1].x, pts[pts.length - 1].y);
      g.addColorStop(0, o.color);
      g.addColorStop(1, o.color2 || o.color);
      ctx.fillStyle = g;
      ctx.fill();
      break;
    }
    case 'road':
    case 'trail': {
      trace(pts);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (o.outlineWidth > 0) {
        ctx.strokeStyle = o.outlineColor;
        ctx.lineWidth = o.width + o.outlineWidth * 2;
        ctx.setLineDash([]);
        ctx.stroke();
      }
      ctx.strokeStyle = o.color;
      ctx.lineWidth = o.width;
      ctx.setLineDash(o.style === 'trail' ? (o.dash.length ? o.dash : [o.width * 1.6, o.width * 1.4]) : o.dash);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    case 'border': {
      trace(pts);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = o.outlineColor;
      ctx.lineWidth = o.width + o.outlineWidth * 2;
      ctx.globalAlpha *= 0.35;
      ctx.stroke();
      ctx.globalAlpha /= 0.35;
      ctx.strokeStyle = o.color;
      ctx.lineWidth = o.width;
      ctx.setLineDash(o.dash.length ? o.dash : [o.width * 3, o.width * 2, o.width * 0.8, o.width * 2]);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    case 'ridge': {
      // Repeated chevrons that read as a mountain spine or cliff edge.
      const spaced = resample(pts, Math.max(6, o.width * 0.9));
      ctx.strokeStyle = o.color;
      ctx.lineWidth = Math.max(1, o.width * 0.18);
      ctx.lineCap = 'round';
      for (let i = 1; i < spaced.length; i++) {
        const d = norm(sub(spaced[i], spaced[i - 1]));
        const nn = perp(d);
        const p = spaced[i];
        ctx.beginPath();
        ctx.moveTo(p.x - d.x * o.width * 0.4 + nn.x * o.width * 0.35, p.y - d.y * o.width * 0.4 + nn.y * o.width * 0.35);
        ctx.lineTo(p.x, p.y);
        ctx.lineTo(p.x - d.x * o.width * 0.4 - nn.x * o.width * 0.35, p.y - d.y * o.width * 0.4 - nn.y * o.width * 0.35);
        ctx.stroke();
      }
      break;
    }
    default: {
      trace(pts);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (o.outlineWidth > 0) {
        ctx.strokeStyle = o.outlineColor;
        ctx.lineWidth = o.width + o.outlineWidth * 2;
        ctx.stroke();
      }
      ctx.strokeStyle = o.color;
      ctx.lineWidth = o.width;
      ctx.setLineDash(o.dash);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

const DISPOSITION_RING: Record<TokenObject['disposition'], string> = {
  friendly: '#4a8cd4',
  neutral: '#d4b34a',
  hostile: '#c4483a',
  secret: '#8a4ad4',
};

function drawToken(ctx: CanvasRenderingContext2D, o: TokenObject, opts: DrawObjectOptions): void {
  const size = (opts.grid?.size ?? 70) * o.cells;
  const r = size / 2;
  ctx.save();
  ctx.fillStyle = o.color;
  ctx.strokeStyle = DISPOSITION_RING[o.disposition];
  ctx.lineWidth = Math.max(2, size * 0.06);
  if (o.shape === 'circle') {
    ctx.beginPath(); ctx.arc(0, 0, r * 0.88, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else {
    ctx.fillRect(-r * 0.88, -r * 0.88, r * 1.76, r * 1.76);
    ctx.strokeRect(-r * 0.88, -r * 0.88, r * 1.76, r * 1.76);
  }
  if (o.label) {
    ctx.fillStyle = readableInk(o.color);
    ctx.font = `700 ${r * 0.7}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(o.label.slice(0, 2).toUpperCase(), 0, r * 0.03);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Imported images
// ---------------------------------------------------------------------------

function drawImageObject(ctx: CanvasRenderingContext2D, o: ImageObject): void {
  let img = imageCache.get(o.id);
  if (!img) {
    img = new Image();
    img.src = o.src;
  }
  rememberImage(o.id, img);
  if (img.complete && img.naturalWidth) {
    ctx.drawImage(img, -o.width / 2, -o.height / 2, o.width, o.height);
  }
}

/** How many decoded imported images are being held. */
export function imageCacheStats(): { entries: number } {
  return { entries: imageCache.size };
}

export async function preloadImageObject(o: ImageObject): Promise<void> {
  if (imageCache.has(o.id)) return;
  rememberImage(o.id, await loadImage(o.src));
}
