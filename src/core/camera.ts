/** Viewport transform: pan, zoom and screen↔map coordinate conversion. */
import type { Vec2, Rect } from './types';

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 16;

export class Camera {
  x = 0;      // map-space point at the viewport centre
  y = 0;
  zoom = 1;
  viewW = 100;
  viewH = 100;

  setViewport(w: number, h: number): void { this.viewW = w; this.viewH = h; }

  toScreen(p: Vec2): Vec2 {
    return {
      x: (p.x - this.x) * this.zoom + this.viewW / 2,
      y: (p.y - this.y) * this.zoom + this.viewH / 2,
    };
  }

  toMap(p: Vec2): Vec2 {
    return {
      x: (p.x - this.viewW / 2) / this.zoom + this.x,
      y: (p.y - this.viewH / 2) / this.zoom + this.y,
    };
  }

  panBy(dxScreen: number, dyScreen: number): void {
    this.x -= dxScreen / this.zoom;
    this.y -= dyScreen / this.zoom;
  }

  /** Zoom keeping the map point under the cursor pinned to the cursor. */
  zoomAt(screenPoint: Vec2, factor: number): void {
    const before = this.toMap(screenPoint);
    this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoom * factor));
    const after = this.toMap(screenPoint);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
  }

  setZoom(z: number): void { this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z)); }

  fit(mapW: number, mapH: number, padding = 48): void {
    const zx = (this.viewW - padding * 2) / Math.max(1, mapW);
    const zy = (this.viewH - padding * 2) / Math.max(1, mapH);
    this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(zx, zy)));
    this.x = mapW / 2;
    this.y = mapH / 2;
  }

  centerOn(p: Vec2): void { this.x = p.x; this.y = p.y; }

  /** Map-space rectangle currently visible. */
  visibleRect(): Rect {
    const tl = this.toMap({ x: 0, y: 0 });
    const br = this.toMap({ x: this.viewW, y: this.viewH });
    return { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y };
  }

  snapshot(): { x: number; y: number; zoom: number } { return { x: this.x, y: this.y, zoom: this.zoom }; }
  restore(s: { x: number; y: number; zoom: number }): void { this.x = s.x; this.y = s.y; this.zoom = s.zoom; }
}
