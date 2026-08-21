/**
 * Reusable full-size scratch canvases.
 *
 * The generators composite through masks a lot; allocating a fresh
 * 2400×1600 canvas per pass is what made the first version of the region
 * generator take ten seconds. Pooling them cuts that to a fraction.
 */
import { createSurface, ctxOf, type Surface } from './canvas';

interface Entry { surface: Surface; ctx: CanvasRenderingContext2D; inUse: boolean; }

const pool: Entry[] = [];

export function acquireScratch(w: number, h: number): Surface {
  const width = Math.max(1, Math.round(w));
  const height = Math.max(1, Math.round(h));
  for (const e of pool) {
    if (!e.inUse && e.surface.width === width && e.surface.height === height) {
      e.inUse = true;
      e.ctx.setTransform(1, 0, 0, 1, 0, 0);
      e.ctx.globalAlpha = 1;
      e.ctx.globalCompositeOperation = 'source-over';
      e.ctx.filter = 'none';
      e.ctx.clearRect(0, 0, width, height);
      return e.surface;
    }
  }
  const surface = createSurface(width, height);
  pool.push({ surface, ctx: ctxOf(surface), inUse: true });
  return surface;
}

export function releaseScratch(surface: Surface): void {
  const e = pool.find((x) => x.surface === surface);
  if (e) e.inUse = false;
}

export function releaseAllScratch(): void {
  for (const e of pool) e.inUse = false;
}

/** Drop everything — used when the document size changes drastically. */
export function purgeScratch(): void {
  pool.length = 0;
}

/** Run `fn` with a scratch surface, releasing it afterwards. */
export function withScratch<T>(w: number, h: number, fn: (s: Surface, ctx: CanvasRenderingContext2D) => T): T {
  const s = acquireScratch(w, h);
  try {
    return fn(s, ctxOf(s));
  } finally {
    releaseScratch(s);
  }
}
