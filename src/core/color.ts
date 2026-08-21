/** Colour maths: parsing, mixing, ramps and the shared map palettes. */

export interface RGB { r: number; g: number; b: number; a: number; }

const HEX3 = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const HEX6 = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i;

export function parseColor(input: string): RGB {
  const s = input.trim();
  let m = HEX6.exec(s);
  if (m) {
    return {
      r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16),
      a: m[4] !== undefined ? parseInt(m[4], 16) / 255 : 1,
    };
  }
  m = HEX3.exec(s);
  if (m) {
    return { r: parseInt(m[1] + m[1], 16), g: parseInt(m[2] + m[2], 16), b: parseInt(m[3] + m[3], 16), a: 1 };
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (rgb) {
    const p = rgb[1].split(',').map((v) => parseFloat(v));
    return { r: p[0] || 0, g: p[1] || 0, b: p[2] || 0, a: p[3] === undefined ? 1 : p[3] };
  }
  const hsl = /^hsla?\(([^)]+)\)$/i.exec(s);
  if (hsl) {
    const p = hsl[1].split(',').map((v) => parseFloat(v));
    const c = hslToRgb(p[0] || 0, (p[1] || 0) / 100, (p[2] || 0) / 100);
    return { ...c, a: p[3] === undefined ? 1 : p[3] };
  }
  return { r: 0, g: 0, b: 0, a: 1 };
}

export function toHex({ r, g, b }: RGB): string {
  const h = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function toCss(c: RGB): string {
  return c.a >= 1
    ? toHex(c)
    : `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${+c.a.toFixed(3)})`;
}

export function rgba(hex: string, alpha: number): string {
  const c = parseColor(hex);
  return `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${+alpha.toFixed(3)})`;
}

export function mix(a: string, b: string, t: number): string {
  const ca = parseColor(a), cb = parseColor(b);
  return toCss({
    r: ca.r + (cb.r - ca.r) * t,
    g: ca.g + (cb.g - ca.g) * t,
    b: ca.b + (cb.b - ca.b) * t,
    a: ca.a + (cb.a - ca.a) * t,
  });
}

export function lighten(hex: string, amount: number): string { return mix(hex, '#ffffff', amount); }
export function darken(hex: string, amount: number): string { return mix(hex, '#000000', amount); }

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, l];
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255, a: 1 };
}

export function shiftHsl(hex: string, dh: number, ds = 0, dl = 0): string {
  const c = parseColor(hex);
  const [h, s, l] = rgbToHsl(c.r, c.g, c.b);
  const out = hslToRgb(h + dh, Math.max(0, Math.min(1, s + ds)), Math.max(0, Math.min(1, l + dl)));
  out.a = c.a;
  return toCss(out);
}

export function luminance(hex: string): number {
  const c = parseColor(hex);
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

export function readableInk(hex: string): string {
  return luminance(hex) > 0.42 ? '#1b1712' : '#f3ece0';
}

// ---------------------------------------------------------------------------
// Ramps
// ---------------------------------------------------------------------------

export interface RampStop { t: number; color: string; }

export function sampleRamp(stops: RampStop[], t: number): string {
  if (!stops.length) return '#000000';
  const x = Math.max(0, Math.min(1, t));
  if (x <= stops[0].t) return stops[0].color;
  if (x >= stops[stops.length - 1].t) return stops[stops.length - 1].color;
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i].t) {
      const a = stops[i - 1], b = stops[i];
      const local = (x - a.t) / (b.t - a.t || 1e-9);
      return mix(a.color, b.color, local);
    }
  }
  return stops[stops.length - 1].color;
}

/** Pre-baked 256-entry lookup — much faster than sampling a ramp per pixel. */
export function bakeRamp(stops: RampStop[], size = 256): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * 3);
  for (let i = 0; i < size; i++) {
    const c = parseColor(sampleRamp(stops, i / (size - 1)));
    out[i * 3] = c.r; out[i * 3 + 1] = c.g; out[i * 3 + 2] = c.b;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cartographic palettes
// ---------------------------------------------------------------------------

export interface MapPalette {
  id: string;
  name: string;
  blurb: string;
  /**
   * Render stamps as a two-tone ink drawing rather than in their own colours.
   * The procedural assets pick their own greens and browns, which is right for
   * a painted map and wrong for a pen-and-ink one; flagging the palette lets
   * the asset renderer duotone the result instead of every asset needing to
   * know about it.
   */
  mono?: boolean;
  parchment: string;
  parchmentDark: string;
  ink: string;
  inkSoft: string;
  deepWater: string;
  water: string;
  shallowWater: string;
  shore: string;
  lowland: string;
  grass: string;
  forest: string;
  highland: string;
  rock: string;
  snow: string;
  desert: string;
  swamp: string;
  lava: string;
  accent: string;
  routes: string;
  border: string;
}

export const PALETTES: MapPalette[] = [
  {
    id: 'atlas', name: 'Old Atlas', blurb: 'Aged parchment, sepia ink, muted greens.',
    parchment: '#e8d9b5', parchmentDark: '#c9b285', ink: '#3b2c1c', inkSoft: '#6b573c',
    deepWater: '#4d6b78', water: '#7fa0aa', shallowWater: '#a9c4c6', shore: '#ddd0a8',
    lowland: '#cfc292', grass: '#a8b077', forest: '#6d8355', highland: '#a89571',
    rock: '#8b7d68', snow: '#efeade', desert: '#ddc794', swamp: '#7d8a63',
    lava: '#b8492a', accent: '#8c3b2e', routes: '#7a5c33', border: '#8a4b3c',
  },
  {
    id: 'verdant', name: 'Verdant Realms', blurb: 'Saturated, painterly, high-fantasy colour.',
    parchment: '#efe4c8', parchmentDark: '#cdbb95', ink: '#2b2118', inkSoft: '#57452f',
    deepWater: '#1f4a63', water: '#2f7f9e', shallowWater: '#69bcc9', shore: '#e5d8ae',
    lowland: '#c9cf8a', grass: '#7fa958', forest: '#39743f', highland: '#9d8a63',
    rock: '#7c6f5d', snow: '#f6f4ee', desert: '#e6cf92', swamp: '#5f7a4a',
    lava: '#d4552a', accent: '#a8452f', routes: '#8a6334', border: '#a03c3c',
  },
  {
    id: 'frostmark', name: 'Frostmark', blurb: 'Cold northern reaches, pale blues and slate.',
    parchment: '#e4e7ea', parchmentDark: '#bdc4cc', ink: '#22292f', inkSoft: '#4a555f',
    deepWater: '#2b4257', water: '#4c7794', shallowWater: '#87b3c4', shore: '#d5dbdd',
    lowland: '#b9c3ba', grass: '#8fa48d', forest: '#4d6a5b', highland: '#98a1a6',
    rock: '#77808a', snow: '#f7fafc', desert: '#c8c4ab', swamp: '#63756a',
    lava: '#9a4a3a', accent: '#3f6b8c', routes: '#5d6874', border: '#41627d',
  },
  {
    id: 'ashen', name: 'Ashen Wastes', blurb: 'Volcanic, blasted, ember-lit.',
    parchment: '#d8cdc0', parchmentDark: '#a8998a', ink: '#241d19', inkSoft: '#4b3c33',
    deepWater: '#3a2f33', water: '#5d4a48', shallowWater: '#8a6d61', shore: '#a7907c',
    lowland: '#9a8471', grass: '#7d7a55', forest: '#4f5540', highland: '#8a7565',
    rock: '#6b5e56', snow: '#cfc7bd', desert: '#c2a880', swamp: '#5c5544',
    lava: '#e0632a', accent: '#c0472a', routes: '#7a5842', border: '#96412c',
  },
  {
    id: 'ink', name: 'Pure Ink', blurb: 'Line-art monochrome, printer friendly.', mono: true,
    parchment: '#faf6ec', parchmentDark: '#e2dccb', ink: '#151515', inkSoft: '#4a4a4a',
    deepWater: '#c9d3d8', water: '#dde4e8', shallowWater: '#edf1f3', shore: '#f2ece0',
    lowland: '#f4efe4', grass: '#e6e6d8', forest: '#cfd6c6', highland: '#e2ddd2',
    rock: '#cfcac1', snow: '#ffffff', desert: '#f3ead6', swamp: '#dbdfd0',
    lava: '#e0b8ae', accent: '#333333', routes: '#5a5a5a', border: '#2c2c2c',
  },
  {
    id: 'dungeon', name: 'Dungeon Slate', blurb: 'Interior stone, torchlight, deep shadow.',
    parchment: '#2a2724', parchmentDark: '#1a1816', ink: '#e8dfcf', inkSoft: '#b3a794',
    deepWater: '#1b2c34', water: '#2f5560', shallowWater: '#4c7d84', shore: '#4a4238',
    lowland: '#585048', grass: '#4d5a42', forest: '#39472f', highland: '#63594d',
    rock: '#6d6459', snow: '#c9c4bb', desert: '#8d7c5f', swamp: '#3f4a37',
    lava: '#e2662d', accent: '#c9a227', routes: '#7a6a4f', border: '#8c6f3a',
  },
];

export function paletteById(id: string): MapPalette {
  return PALETTES.find((p) => p.id === id) || PALETTES[0];
}
