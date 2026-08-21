/**
 * Deterministic pseudo-random numbers.
 *
 * Every generator in the app takes a seed so a map can be reproduced exactly,
 * shared as a number, and iterated on without losing the previous result.
 */

export class RNG {
  private s: number;

  constructor(seed: number | string = 1) {
    this.s = typeof seed === 'string' ? RNG.hash(seed) : (seed >>> 0) || 1;
    // Warm up — mulberry32 is weak on the first couple of draws for tiny seeds.
    for (let i = 0; i < 4; i++) this.next();
  }

  static hash(str: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /** mulberry32 — fast, good enough distribution, tiny state. */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  float(min = 0, max = 1): number { return min + this.next() * (max - min); }
  int(min: number, max: number): number { return Math.floor(this.float(min, max + 1)); }
  bool(p = 0.5): boolean { return this.next() < p; }
  sign(): number { return this.next() < 0.5 ? -1 : 1; }

  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }

  pickWeighted<T>(entries: readonly (readonly [T, number])[]): T {
    let total = 0;
    for (const [, w] of entries) total += w;
    let r = this.next() * total;
    for (const [v, w] of entries) { r -= w; if (r <= 0) return v; }
    return entries[entries.length - 1][0];
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** Box–Muller gaussian. */
  gauss(mean = 0, sd = 1): number {
    let u = 0, v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** A fresh independent stream, derived deterministically. */
  fork(salt = 0): RNG { return new RNG((this.int(0, 0x7fffffff) ^ (salt * 2654435761)) >>> 0); }

  get state(): number { return this.s; }
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}
