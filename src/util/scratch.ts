/**
 * Reusable full-size scratch canvases.
 *
 * The generators composite through masks a lot; allocating a fresh
 * 2400×1600 canvas per pass is what made the first version of the region
 * generator take ten seconds. Pooling them cuts that to a fraction.
 *
 * The pool is bounded by the pixels it is holding, not by how many surfaces it
 * has. Releasing a surface only marks it free — the memory stays checked out
 * of the browser until something evicts it — so a pool that only ever grew
 * turned a session of "generate a castle, try a different cell size, generate
 * again" into gigabytes of retained backing store. Idle surfaces are now
 * dropped oldest-first once the pool is over budget; anything still in use is
 * untouchable, so a generator mid-composite never has the ground moved.
 */
import { createSurface, ctxOf, type Surface } from './canvas';

interface Entry {
  surface: Surface;
  ctx: CanvasRenderingContext2D;
  inUse: boolean;
  bytes: number;
  /** Monotonic stamp of the last acquire, for oldest-first eviction. */
  used: number;
}

const pool: Entry[] = [];
let clock = 0;
let held = 0;

/**
 * How many bytes of idle scratch we are willing to keep.
 *
 * One generation's working set is a handful of document-sized surfaces — a
 * 2400×1600 sheet is 15 MB, and the castle painter holds four or five at once
 * — so 128 MB keeps a whole generation's sizes hot and still lets the previous
 * map's sizes fall out. Raising it trades memory for fewer reallocations; the
 * generator benchmarks move by single-digit milliseconds across a wide range.
 */
const BUDGET_BYTES = 128 * 1024 * 1024;

/** Drop idle surfaces, oldest first, until the pool is inside its budget. */
function trim(): void {
  if (held <= BUDGET_BYTES) return;
  const idle = pool.filter((e) => !e.inUse).sort((a, b) => a.used - b.used);
  for (const e of idle) {
    if (held <= BUDGET_BYTES) break;
    const i = pool.indexOf(e);
    if (i >= 0) pool.splice(i, 1);
    held -= e.bytes;
    // Zeroing the dimensions is what actually hands the backing store back;
    // dropping the reference alone leaves it to the compositor's own timing.
    e.surface.width = 0;
    e.surface.height = 0;
  }
}

export function acquireScratch(w: number, h: number): Surface {
  const width = Math.max(1, Math.round(w));
  const height = Math.max(1, Math.round(h));
  for (const e of pool) {
    if (!e.inUse && e.surface.width === width && e.surface.height === height) {
      e.inUse = true;
      e.used = ++clock;
      e.ctx.setTransform(1, 0, 0, 1, 0, 0);
      e.ctx.globalAlpha = 1;
      e.ctx.globalCompositeOperation = 'source-over';
      e.ctx.filter = 'none';
      e.ctx.clearRect(0, 0, width, height);
      return e.surface;
    }
  }
  const surface = createSurface(width, height);
  const bytes = width * height * 4;
  pool.push({ surface, ctx: ctxOf(surface), inUse: true, bytes, used: ++clock });
  held += bytes;
  trim();
  return surface;
}

export function releaseScratch(surface: Surface): void {
  const e = pool.find((x) => x.surface === surface);
  if (!e) return;
  e.inUse = false;
  // A release is the moment the pool can shed anything it overshot on.
  trim();
}

export function releaseAllScratch(): void {
  for (const e of pool) e.inUse = false;
  trim();
}

/** Pool occupancy and the pixel bytes it is holding onto. */
export function scratchStats(): { entries: number; inUse: number; bytes: number } {
  let inUse = 0;
  for (const e of pool) if (e.inUse) inUse++;
  return { entries: pool.length, inUse, bytes: held };
}

/** Drop everything — used when the document size changes drastically. */
export function purgeScratch(): void {
  for (const e of pool) { e.surface.width = 0; e.surface.height = 0; }
  pool.length = 0;
  held = 0;
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
