/**
 * A cache that is bounded by what it holds, not by how many things it holds.
 *
 * The editor's caches store canvases and data URLs whose sizes differ by three
 * orders of magnitude — a 16px marker bitmap and a 2000px forest stamp are one
 * entry each — so an entry count is not a budget. Counting bytes is, and it is
 * the number that decides whether a session that has been open all evening is
 * still comfortable.
 *
 * Least-recently-used order comes free from `Map`, which iterates in insertion
 * order: a hit deletes and re-inserts, so the oldest live entry is always the
 * one the iterator yields first.
 */
export class BudgetedCache<V> {
  private map = new Map<string, V>();
  private bytes = 0;
  private sizes = new Map<string, number>();

  constructor(
    private budget: number,
    private sizeOf: (v: V) => number,
    /** Called on the way out, for values holding memory the GC will not rush. */
    private onEvict?: (v: V) => void,
  ) {}

  get(key: string): V | undefined {
    const v = this.map.get(key);
    if (v === undefined) return undefined;
    // Re-insert so this becomes the newest entry.
    this.map.delete(key);
    this.map.set(key, v);
    return v;
  }

  set(key: string, value: V): void {
    const existing = this.map.get(key);
    if (existing !== undefined) {
      this.bytes -= this.sizes.get(key) ?? 0;
      this.map.delete(key);
    }
    const size = this.sizeOf(value);
    this.map.set(key, value);
    this.sizes.set(key, size);
    this.bytes += size;
    this.trim();
  }

  private trim(): void {
    if (this.bytes <= this.budget) return;
    for (const [k, v] of this.map) {
      if (this.bytes <= this.budget) break;
      // Never evict the entry that was just stored: the caller is about to
      // return it, and dropping it would make the cache a no-op for anything
      // larger than the budget.
      if (this.map.size <= 1) break;
      this.map.delete(k);
      this.bytes -= this.sizes.get(k) ?? 0;
      this.sizes.delete(k);
      this.onEvict?.(v);
    }
  }

  clear(): void {
    if (this.onEvict) for (const v of this.map.values()) this.onEvict(v);
    this.map.clear();
    this.sizes.clear();
    this.bytes = 0;
  }

  get size(): number { return this.map.size; }
  get byteSize(): number { return this.bytes; }
  values(): IterableIterator<V> { return this.map.values(); }
}

/** Canvas-backed values only give their memory back when zeroed. */
export const releaseSurface = (s: { width: number; height: number }): void => {
  s.width = 0;
  s.height = 0;
};
