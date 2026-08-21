/** Default-constructed objects. Keeps the tools short and the defaults in one place. */
import type {
  StampObject, TextObject, ShapeObject, PathObject, TokenObject, ImageObject,
  Wall, LightSource, MapNote, Vec2, ShapeKind, PathStyle, WallKind,
} from './types';
import { uid } from './id';
import { paletteById } from './color';

const base = (name: string, x: number, y: number) => ({
  id: uid('o_'), name, x, y, rotation: 0, scaleX: 1, scaleY: 1,
  opacity: 1, blend: 'normal' as const, visible: true, locked: false, shadow: null,
});

export function makeStamp(assetId: string, x: number, y: number, width: number, height: number, opts: Partial<StampObject> = {}): StampObject {
  return {
    ...base(assetId.split('/').pop() || 'Stamp', x, y),
    kind: 'stamp',
    assetId,
    seed: Math.floor(Math.random() * 1e6),
    width, height,
    tint: null,
    tintStrength: 0.6,
    palette: null,
    ...opts,
  };
}

export const MAP_FONTS = [
  'Georgia, "Times New Roman", serif',
  '"Palatino Linotype", Palatino, serif',
  '"Book Antiqua", Georgia, serif',
  '"Trajan Pro", Georgia, serif',
  'Optima, Candara, sans-serif',
  '"Courier New", monospace',
  'system-ui, sans-serif',
];

export function makeText(text: string, x: number, y: number, paletteId: string, opts: Partial<TextObject> = {}): TextObject {
  const p = paletteById(paletteId);
  return {
    ...base(text.slice(0, 24) || 'Label', x, y),
    kind: 'text',
    text,
    font: MAP_FONTS[0],
    size: 42,
    color: p.ink,
    strokeColor: p.parchment,
    strokeWidth: 0,
    bold: false,
    italic: false,
    letterSpacing: 2,
    lineHeight: 1.2,
    align: 'center',
    curve: 'straight',
    curveRadius: 400,
    banner: 'none',
    bannerColor: null as unknown as string,
    ...opts,
  };
}

export function makeShape(shape: ShapeKind, x: number, y: number, w: number, h: number, paletteId: string, opts: Partial<ShapeObject> = {}): ShapeObject {
  const p = paletteById(paletteId);
  return {
    ...base('Shape', x, y),
    kind: 'shape',
    shape,
    w, h,
    points: [],
    sides: 6,
    cornerRadius: 0,
    fill: { type: 'solid', color: p.lowland },
    strokeColor: p.ink,
    strokeWidth: 3,
    dash: [],
    ...opts,
  };
}

export const PATH_PRESETS: Record<PathStyle, Partial<PathObject>> = {
  river: { width: 14, taper: 0.75, outlineWidth: 3, smoothing: 1, jitter: 1.5 },
  road: { width: 8, taper: 0, outlineWidth: 2.5, smoothing: 1, jitter: 1, dash: [] },
  trail: { width: 5, taper: 0, outlineWidth: 0, smoothing: 1, jitter: 2, dash: [10, 8] },
  border: { width: 4, taper: 0, outlineWidth: 8, smoothing: 0.6, jitter: 0.5 },
  wall: { width: 12, taper: 0, outlineWidth: 3, smoothing: 0.2, jitter: 0 },
  ridge: { width: 22, taper: 0, outlineWidth: 0, smoothing: 1, jitter: 2 },
  custom: { width: 6, taper: 0, outlineWidth: 0, smoothing: 1, jitter: 0 },
};

export function makePath(style: PathStyle, nodes: Vec2[], paletteId: string, opts: Partial<PathObject> = {}): PathObject {
  const p = paletteById(paletteId);
  const colors: Record<PathStyle, [string, string, string]> = {
    river: [p.water, p.deepWater, p.shallowWater],
    road: [p.routes, p.routes, p.ink],
    trail: [p.routes, p.routes, p.ink],
    border: [p.border, p.border, p.border],
    wall: [p.rock, p.rock, p.ink],
    ridge: [p.ink, p.ink, p.ink],
    custom: [p.ink, p.ink, p.ink],
  };
  const [color, color2, outline] = colors[style];
  return {
    ...base(`${style[0].toUpperCase()}${style.slice(1)}`, 0, 0),
    kind: 'path',
    nodes: nodes.map((n) => ({ x: n.x, y: n.y })),
    closed: false,
    style,
    width: 8,
    taper: 0,
    color,
    color2,
    outlineColor: outline,
    outlineWidth: 2,
    dash: [],
    jitter: 1,
    smoothing: 1,
    ...PATH_PRESETS[style],
    ...opts,
  };
}

export function makeToken(label: string, x: number, y: number, opts: Partial<TokenObject> = {}): TokenObject {
  return {
    ...base(label || 'Token', x, y),
    kind: 'token',
    label,
    color: '#c4483a',
    cells: 1,
    shape: 'circle',
    disposition: 'hostile',
    ...opts,
  };
}

export function makeImageObject(src: string, x: number, y: number, w: number, h: number): ImageObject {
  return { ...base('Image', x, y), kind: 'image', src, width: w, height: h };
}

export function makeWall(a: Vec2, b: Vec2, kind: WallKind = 'wall'): Wall {
  const solid = kind === 'wall';
  return {
    id: uid('w_'),
    a: { ...a }, b: { ...b },
    kind,
    blocksMovement: kind !== 'ethereal' && kind !== 'terrain',
    blocksSight: kind !== 'window' && kind !== 'invisible',
    blocksSound: solid,
    doorState: 'closed',
    dir: 'both',
  };
}

export function makeLight(x: number, y: number, cell = 70, opts: Partial<LightSource> = {}): LightSource {
  return {
    id: uid('li_'),
    x, y,
    bright: cell * 4,
    dim: cell * 8,
    color: '#ffae5c',
    intensity: 0.85,
    angle: 360,
    rotation: 0,
    animation: 'torch',
    animationSpeed: 5,
    name: 'Torch',
    ...opts,
  };
}

export function makeNote(x: number, y: number, title = 'Note'): MapNote {
  return { id: uid('n_'), x, y, title, body: '', icon: 'i', color: '#d4b34a' };
}

/**
 * Place a stamp by width alone, taking the height from the asset's natural
 * aspect ratio. Generators should prefer this — hand-computing heights is how
 * you end up with square logs.
 */
export function makeStampAuto(
  assetId: string, x: number, y: number, width: number, opts: Partial<StampObject> = {},
): StampObject {
  const def = assetLookup(assetId);
  const aspect = def?.aspect || 1;
  return makeStamp(assetId, x, y, width, width / aspect, opts);
}

/** Indirection so `factories` does not import the whole asset library eagerly. */
let assetLookup: (id: string) => { aspect: number } | undefined = () => undefined;
export function setAssetLookup(fn: (id: string) => { aspect: number } | undefined): void {
  assetLookup = fn;
}
