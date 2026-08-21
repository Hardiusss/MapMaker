/**
 * Roll20 export.
 *
 * Roll20 has no scene-import format, so the useful thing to hand a GM is a
 * correctly-sized image plus the exact numbers to type into Page Settings —
 * and, for anyone with the API, a token/wall payload they can paste.
 */
import type { MapDocument } from '../core/types';

export interface Roll20Bundle {
  instructions: string;
  pageSettings: {
    widthUnits: number;
    heightUnits: number;
    scaleNumber: number;
    scaleUnits: string;
    gridType: string;
    pixelsPerUnit: number;
    imagePixelWidth: number;
    imagePixelHeight: number;
    /** Roll20 assumes 70 px per unit; this is the zoom to type in. */
    recommendedImageScalePercent: number;
  };
  dynamicLighting: {
    /** Roll20 "Dynamic Lighting" path list, one polyline per line. */
    paths: { x: number; y: number }[][];
    note: string;
  };
}

const ROLL20_PX_PER_UNIT = 70;

export function buildRoll20Bundle(doc: MapDocument): Roll20Bundle {
  const cell = Math.max(1, doc.grid.size);
  const widthUnits = +(doc.width / cell).toFixed(2);
  const heightUnits = +(doc.height / cell).toFixed(2);
  const scalePercent = +((ROLL20_PX_PER_UNIT / cell) * 100).toFixed(1);

  const wallLayer = doc.layers.find((l) => l.kind === 'wall');
  const walls = wallLayer && wallLayer.kind === 'wall' ? wallLayer.walls : [];

  const paths = walls
    .filter((w) => w.blocksSight)
    .map((w) => [
      { x: +(w.a.x / cell * ROLL20_PX_PER_UNIT).toFixed(1), y: +(w.a.y / cell * ROLL20_PX_PER_UNIT).toFixed(1) },
      { x: +(w.b.x / cell * ROLL20_PX_PER_UNIT).toFixed(1), y: +(w.b.y / cell * ROLL20_PX_PER_UNIT).toFixed(1) },
    ]);

  const instructions = `# ${doc.meta.title} — Roll20 setup

## 1. Page settings

  Width  : ${widthUnits} units
  Height : ${heightUnits} units
  Scale  : ${doc.grid.unitsPerCell} ${doc.grid.unitLabel} per unit
  Grid   : ${doc.grid.type === 'square' ? 'Square' : doc.grid.type === 'none' ? 'None' : 'Hex'}

## 2. The image

The exported PNG is ${doc.width} × ${doc.height} px at ${Math.round(cell)} px per cell.
Roll20 works in 70 px units, so after dropping the image on the Map layer,
set its size to ${widthUnits} × ${heightUnits} units (or scale it to ${scalePercent}%).

Tip: exporting at exactly 70 px per cell removes this step entirely — use the
"Roll20 (70 px/cell)" preset in the export dialog.

## 3. Dynamic lighting

${paths.length} wall segments are included in \`dynamic-lighting.json\`. Roll20's UI
has no import for these, but the API script "Wall Importer" (or DL-Import)
accepts this shape. Without the API, trace the main walls by hand — the
exported image has the walls drawn faintly on the GM layer export if you
enabled that option.
`;

  return {
    instructions,
    pageSettings: {
      widthUnits, heightUnits,
      scaleNumber: doc.grid.unitsPerCell,
      scaleUnits: doc.grid.unitLabel,
      gridType: doc.grid.type === 'square' ? 'square' : doc.grid.type === 'none' ? 'none' : 'hex',
      pixelsPerUnit: ROLL20_PX_PER_UNIT,
      imagePixelWidth: doc.width,
      imagePixelHeight: doc.height,
      recommendedImageScalePercent: scalePercent,
    },
    dynamicLighting: {
      paths,
      note: 'Coordinates are in Roll20 pixels (70 px per grid unit).',
    },
  };
}
