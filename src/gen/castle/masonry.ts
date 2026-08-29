/**
 * The shared drawing vocabulary for fortification.
 *
 * Both the castle generator and the interactive construction tool have to make
 * masonry that looks like the same masonry, so the stencil / ink / shadow pass
 * lives here rather than twice. Everything works through a `Mask`: a white
 * silhouette on a scratch surface plus where it sits on the document. How the
 * silhouette was produced — upscaled from a sub-cell grid, or drawn as a path —
 * is the caller's business.
 */
import type { Surface } from '../../util/canvas';
import { ctxOf } from '../../util/canvas';
import { acquireScratch, releaseScratch } from '../../util/scratch';
import { addTonalDrift, fillTexture } from '../paintUtils';

export interface Mask {
  surf: Surface;
  /** Where the mask sits on the document, in px. */
  x: number; y: number; w: number; h: number;
  empty: boolean;
}

export function freeMask(m: Mask): void { releaseScratch(m.surf); }

/**
 * A mask drawn as ordinary canvas paths inside a document-space box.
 *
 * The callback receives a context already translated so it can draw in
 * document coordinates; anything it fills white is in the mask, anything it
 * erases with `destination-out` is a hole. Paths antialias on their own, so
 * unlike the generator's grid masks this needs no supersampling.
 */
export function maskFromPaths(
  x: number, y: number, w: number, h: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): Mask {
  const pw = Math.max(1, Math.ceil(w)), ph = Math.max(1, Math.ceil(h));
  const surf = acquireScratch(pw, ph);
  const ctx = ctxOf(surf);
  ctx.save();
  ctx.translate(-x, -y);
  ctx.fillStyle = '#ffffff';
  draw(ctx);
  ctx.restore();
  return { surf, x, y, w: pw, h: ph, empty: false };
}

export interface StencilOptions {
  tint?: string;
  tintAlpha?: number;
  drift?: number;
  seed?: number;
  alpha?: number;
  /** How much ground one texture tile covers here. See `TextureOptions`. */
  detail?: number;
}

/**
 * Paint one texture through a mask onto a layer.
 *
 * The scratch is translated so the texture pattern is anchored to the document
 * origin rather than to the mask's corner — otherwise every material starts its
 * tiling somewhere else and the seams between them show.
 */
export function stencil(dst: CanvasRenderingContext2D, m: Mask, textureId: string, paletteId: string, opts: StencilOptions = {}): void {
  if (m.empty) return;
  const tex = acquireScratch(m.w, m.h);
  const tctx = ctxOf(tex);
  tctx.translate(-m.x, -m.y);
  fillTexture(tctx, m.x + m.w, m.y + m.h, textureId, paletteId, opts.detail);
  if (opts.tint) {
    tctx.save();
    tctx.globalAlpha = opts.tintAlpha ?? 0.3;
    tctx.fillStyle = opts.tint;
    tctx.fillRect(m.x, m.y, m.w, m.h);
    tctx.restore();
  }
  if (opts.drift) addTonalDrift(tctx, m.x + m.w, m.y + m.h, opts.seed ?? 1, opts.drift);
  tctx.setTransform(1, 0, 0, 1, 0, 0);
  tctx.globalCompositeOperation = 'destination-in';
  tctx.drawImage(m.surf, 0, 0);
  dst.save();
  dst.globalAlpha = opts.alpha ?? 1;
  dst.drawImage(tex, m.x, m.y);
  dst.restore();
  releaseScratch(tex);
}

/** Ink the silhouette of a mask, so masonry reads as a drawn plan and not a stain. */
export function inkOutline(dst: CanvasRenderingContext2D, m: Mask, width: number, color: string): void {
  if (m.empty) return;
  const eroded = acquireScratch(m.w, m.h);
  const ectx = ctxOf(eroded);
  ectx.drawImage(m.surf, 0, 0);
  ectx.globalCompositeOperation = 'destination-in';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ectx.drawImage(m.surf, Math.cos(a) * width, Math.sin(a) * width);
  }
  const ring = acquireScratch(m.w, m.h);
  const rctx = ctxOf(ring);
  rctx.drawImage(m.surf, 0, 0);
  rctx.globalCompositeOperation = 'destination-out';
  rctx.drawImage(eroded, 0, 0);
  rctx.globalCompositeOperation = 'source-in';
  rctx.fillStyle = color;
  rctx.fillRect(0, 0, m.w, m.h);
  dst.drawImage(ring, m.x, m.y);
  releaseScratch(eroded);
  releaseScratch(ring);
}

/** A cast shadow from anything solid, so the walls stand up off the ground. */
export function castShadow(dst: CanvasRenderingContext2D, m: Mask, dx: number, dy: number, blur: number): void {
  if (m.empty) return;
  const pad = Math.ceil(blur * 2 + Math.max(Math.abs(dx), Math.abs(dy)));
  const s = acquireScratch(m.w + pad * 2, m.h + pad * 2);
  const sctx = ctxOf(s);
  sctx.filter = `blur(${blur}px)`;
  sctx.drawImage(m.surf, pad + dx, pad + dy);
  sctx.filter = 'none';
  sctx.globalCompositeOperation = 'destination-out';
  sctx.drawImage(m.surf, pad, pad);
  sctx.globalCompositeOperation = 'source-in';
  sctx.fillStyle = 'rgba(0,0,0,0.55)';
  sctx.fillRect(0, 0, s.width, s.height);
  dst.drawImage(s, m.x - pad, m.y - pad);
  releaseScratch(s);
}

/** Darken the rim inside a mask — how a mound or a ditch reads from above. */
export function rimShade(dst: CanvasRenderingContext2D, m: Mask, blur: number, alpha: number, color = '#000000'): void {
  if (m.empty) return;
  const s = acquireScratch(m.w, m.h);
  const sctx = ctxOf(s);
  sctx.fillStyle = color;
  sctx.fillRect(0, 0, m.w, m.h);
  sctx.globalCompositeOperation = 'destination-out';
  sctx.filter = `blur(${blur}px)`;
  sctx.drawImage(m.surf, 0, 0);
  sctx.filter = 'none';
  sctx.globalCompositeOperation = 'destination-in';
  sctx.drawImage(m.surf, 0, 0);
  dst.save();
  dst.globalAlpha = alpha;
  dst.drawImage(s, m.x, m.y);
  dst.restore();
  releaseScratch(s);
}
