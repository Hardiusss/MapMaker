/**
 * Universal VTT export (.dd2vtt / .uvtt / .df2vtt).
 *
 * This is the interchange format Dungeondraft popularised; Foundry reads it via
 * the Universal Battlemap Importer, and Arkenforge, Fantasy Grounds and others
 * consume it too. Everything is expressed in grid units, not pixels.
 */
import type { MapDocument, Wall, LightSource, Vec2 } from '../core/types';
import { parseColor } from '../core/color';

export interface UvttOptions {
  /** Extra precision on the exported polygons. */
  simplify: boolean;
  bakedLighting: boolean;
  ambientLight: string;
}

export const DEFAULT_UVTT_OPTIONS: UvttOptions = {
  simplify: true, bakedLighting: false, ambientLight: '#ffffff',
};

interface UvttPoint { x: number; y: number; }

export interface UvttFile {
  format: number;
  resolution: {
    map_origin: UvttPoint;
    map_size: UvttPoint;
    pixels_per_grid: number;
  };
  line_of_sight: UvttPoint[][];
  objects_line_of_sight: UvttPoint[][];
  portals: {
    position: UvttPoint;
    bounds: UvttPoint[];
    rotation: number;
    closed: boolean;
    freestanding: boolean;
  }[];
  environment: { baked_lighting: boolean; ambient_light: string };
  lights: {
    position: UvttPoint;
    range: number;
    intensity: number;
    color: string;
    shadows: boolean;
  }[];
  image: string;
}

function toGrid(p: Vec2, cell: number): UvttPoint {
  return { x: +(p.x / cell).toFixed(4), y: +(p.y / cell).toFixed(4) };
}

function hexRgba(color: string, alpha = 1): string {
  const c = parseColor(color);
  const h = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `${h(c.r)}${h(c.g)}${h(c.b)}${h(alpha * 255)}`;
}

/**
 * Chain wall segments into polylines. UVTT consumers get much better results
 * from a few long chains than from hundreds of disjoint two-point segments.
 */
export function chainWalls(walls: Wall[], epsilon = 0.5): Vec2[][] {
  const remaining = walls.slice();
  const chains: Vec2[][] = [];
  const key = (p: Vec2) => `${Math.round(p.x / epsilon)},${Math.round(p.y / epsilon)}`;

  const byPoint = new Map<string, Wall[]>();
  for (const w of remaining) {
    for (const p of [w.a, w.b]) {
      const k = key(p);
      const arr = byPoint.get(k) || [];
      arr.push(w);
      byPoint.set(k, arr);
    }
  }

  const used = new Set<string>();
  for (const start of remaining) {
    if (used.has(start.id)) continue;
    used.add(start.id);
    const chain: Vec2[] = [start.a, start.b];

    // Extend forwards.
    let grew = true;
    while (grew) {
      grew = false;
      const tail = chain[chain.length - 1];
      const cands = byPoint.get(key(tail)) || [];
      for (const c of cands) {
        if (used.has(c.id)) continue;
        if (key(c.a) === key(tail)) { chain.push(c.b); used.add(c.id); grew = true; break; }
        if (key(c.b) === key(tail)) { chain.push(c.a); used.add(c.id); grew = true; break; }
      }
    }
    // Extend backwards.
    grew = true;
    while (grew) {
      grew = false;
      const head = chain[0];
      const cands = byPoint.get(key(head)) || [];
      for (const c of cands) {
        if (used.has(c.id)) continue;
        if (key(c.a) === key(head)) { chain.unshift(c.b); used.add(c.id); grew = true; break; }
        if (key(c.b) === key(head)) { chain.unshift(c.a); used.add(c.id); grew = true; break; }
      }
    }
    chains.push(chain);
  }
  return chains;
}

/** Drop points that lie on the straight line between their neighbours. */
function collapseCollinear(pts: Vec2[], eps = 0.01): Vec2[] {
  if (pts.length < 3) return pts;
  const out: Vec2[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1], b = pts[i], c = pts[i + 1];
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (Math.abs(cross) > eps) out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export function buildUvtt(doc: MapDocument, imageBase64: string, opts: Partial<UvttOptions> = {}): UvttFile {
  const o = { ...DEFAULT_UVTT_OPTIONS, ...opts };
  const cell = Math.max(1, doc.grid.size);

  const wallLayer = doc.layers.find((l) => l.kind === 'wall');
  const lightLayer = doc.layers.find((l) => l.kind === 'light');
  const walls = wallLayer && wallLayer.kind === 'wall' ? wallLayer.walls : [];
  const lights = lightLayer && lightLayer.kind === 'light' ? lightLayer.lights : [];

  const blocking = walls.filter((w) => w.kind !== 'door' && w.kind !== 'secretDoor' && w.blocksSight);
  const doors = walls.filter((w) => w.kind === 'door' || w.kind === 'secretDoor');

  let chains = chainWalls(blocking).map((c) => (o.simplify ? collapseCollinear(c) : c));
  chains = chains.filter((c) => c.length >= 2);

  return {
    format: 0.3,
    resolution: {
      map_origin: { x: 0, y: 0 },
      map_size: { x: Math.round(doc.width / cell), y: Math.round(doc.height / cell) },
      pixels_per_grid: Math.round(cell),
    },
    line_of_sight: chains.map((c) => c.map((p) => toGrid(p, cell))),
    objects_line_of_sight: [],
    portals: doors.map((d) => ({
      position: toGrid({ x: (d.a.x + d.b.x) / 2, y: (d.a.y + d.b.y) / 2 }, cell),
      bounds: [toGrid(d.a, cell), toGrid(d.b, cell)],
      rotation: +Math.atan2(d.b.y - d.a.y, d.b.x - d.a.x).toFixed(4),
      closed: d.doorState !== 'open',
      freestanding: false,
    })),
    environment: {
      baked_lighting: o.bakedLighting,
      ambient_light: hexRgba(o.ambientLight, doc.lighting.globalLight ? 1 : 0),
    },
    lights: o.bakedLighting ? [] : lights.map((l) => ({
      position: toGrid({ x: l.x, y: l.y }, cell),
      range: +(Math.max(l.bright, l.dim) / cell).toFixed(3),
      intensity: +l.intensity.toFixed(2),
      color: hexRgba(l.color, 1),
      shadows: true,
    })),
    image: imageBase64,
  };
}

export function uvttReadme(doc: MapDocument): string {
  return `# ${doc.meta.title} — Universal VTT

\`${doc.meta.title}.dd2vtt\` is a Universal VTT bundle: the map image is embedded
inside the file, along with line-of-sight polygons, door portals and lights.

Import targets:
  * **Foundry VTT** — install the "Universal Battlemap Importer" module, then
    drag the .dd2vtt onto the Scenes tab.
  * **Fantasy Grounds Unity** — Import Universal VTT from the campaign menu.
  * **Arkenforge / MapTool / Talespire** — see each tool's UVTT import.

Grid: ${Math.round(doc.grid.size)} px per cell, ${doc.grid.unitsPerCell} ${doc.grid.unitLabel} per cell,
map is ${Math.round(doc.width / doc.grid.size)} × ${Math.round(doc.height / doc.grid.size)} cells.

If your VTT complains about the grid, it is almost always because the map
dimensions are not a whole number of cells — regenerate or crop so both sides
divide evenly by the cell size.
`;
}
