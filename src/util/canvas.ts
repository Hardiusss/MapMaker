/** Canvas surface helpers. Everything the renderer draws on comes from here. */

export type Surface = HTMLCanvasElement;
export type Ctx = CanvasRenderingContext2D;

export function createSurface(w: number, h: number): Surface {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export function ctxOf(c: Surface, opts?: CanvasRenderingContext2DSettings): Ctx {
  const ctx = c.getContext('2d', { willReadFrequently: false, ...opts });
  if (!ctx) throw new Error('2D canvas context unavailable');
  return ctx;
}

export function clearSurface(c: Surface): void {
  ctxOf(c).clearRect(0, 0, c.width, c.height);
}

export function cloneSurface(src: Surface): Surface {
  const out = createSurface(src.width, src.height);
  ctxOf(out).drawImage(src, 0, 0);
  return out;
}

export function resizeSurface(src: Surface, w: number, h: number, keepContent = true): Surface {
  const out = createSurface(w, h);
  if (keepContent) ctxOf(out).drawImage(src, 0, 0);
  return out;
}

export function fillSurface(c: Surface, style: string | CanvasPattern | CanvasGradient): void {
  const ctx = ctxOf(c);
  ctx.save();
  ctx.fillStyle = style;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.restore();
}

/** Scale a surface into a new one (used by exporters and thumbnails). */
export function scaleSurface(src: Surface, w: number, h: number, smooth = true): Surface {
  const out = createSurface(w, h);
  const ctx = ctxOf(out);
  ctx.imageSmoothingEnabled = smooth;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  return out;
}

export function toDataURL(c: Surface, type = 'image/png', quality?: number): string {
  return c.toDataURL(type, quality);
}

export function toBlob(c: Surface, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), type, quality);
  });
}

export async function toBase64(c: Surface, type = 'image/png', quality?: number): Promise<string> {
  const url = c.toDataURL(type, quality);
  const idx = url.indexOf(',');
  return url.slice(idx + 1);
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image load failed: ${src.slice(0, 64)}`));
    img.src = src;
  });
}

export async function surfaceFromDataURL(src: string): Promise<Surface> {
  const img = await loadImage(src);
  const c = createSurface(img.naturalWidth || img.width, img.naturalHeight || img.height);
  ctxOf(c).drawImage(img, 0, 0);
  return c;
}

/** True when every pixel is fully transparent — lets us skip empty layers. */
export function isSurfaceEmpty(c: Surface, step = 8): boolean {
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  for (let i = 3; i < data.length; i += 4 * step) if (data[i] !== 0) return false;
  return true;
}

/** Bounding box of non-transparent pixels (or null when the surface is blank). */
export function alphaBounds(c: Surface): { x: number; y: number; w: number; h: number } | null {
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] !== 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** True when every pixel in the surface is fully opaque (alpha 255). */
export function isFullyOpaque(c: Surface, step = 4): boolean {
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  for (let i = 3; i < data.length; i += 4 * step) if (data[i] !== 255) return false;
  // Second pass over the border, where partial coverage usually hides.
  const w = c.width, h = c.height;
  for (let x = 0; x < w; x++) {
    if (data[(x) * 4 + 3] !== 255) return false;
    if (data[((h - 1) * w + x) * 4 + 3] !== 255) return false;
  }
  for (let y = 0; y < h; y++) {
    if (data[(y * w) * 4 + 3] !== 255) return false;
    if (data[(y * w + w - 1) * 4 + 3] !== 255) return false;
  }
  return true;
}
