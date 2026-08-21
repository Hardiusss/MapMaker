/**
 * Scripting API.
 *
 * Exposed on `window.Aetheria` so the app can be driven from the developer
 * console — batch-generating a dozen encounter maps, re-exporting a folder of
 * projects, or wiring the editor into your own tooling. It is also what the
 * headless test harness drives.
 */
import type { Editor } from './core/editor';
import type { MapDocument } from './core/types';
import { generateRegion, DEFAULT_REGION_OPTIONS } from './gen/region/regionGen';
import { generateDungeon, DEFAULT_DUNGEON_OPTIONS } from './gen/dungeon/dungeonGen';
import { generateCave, DEFAULT_CAVE_OPTIONS } from './gen/dungeon/caveGen';
import { generateCity, DEFAULT_CITY_OPTIONS } from './gen/city/cityGen';
import { generateBattleMap, DEFAULT_BATTLE_OPTIONS } from './gen/battle/battleGen';
import { buildFoundryScene, foundryReadme } from './export/foundry';
import { buildUvtt } from './export/uvtt';
import { buildRoll20Bundle } from './export/roll20';
import { buildPdf } from './export/pdf';
import { saveProject, loadProject } from './export/project';
import {
  exportImage, exportFoundry, exportUvtt, exportRoll20, exportPdf,
  renderExportSurface, DEFAULT_IMAGE_EXPORT,
} from './export';
import { renderToSurface, renderThumbnail } from './render/renderer';
import { allAssets, renderAsset, assetPreview } from './assets/library';
import { TEXTURES, getTexture } from './render/textures';
import { generateFields } from './gen/region/heightmap';
import { classify, BIOME_ORDER } from './gen/region/biomes';
import { deriveWallsFromDocument } from './gen/deriveWalls';
import { createDocument } from './core/doc';
import { randomSeed } from './core/rng';
import { guessGridSize, documentFromImage, imageAsLayer } from './core/importImage';

export function installApi(editor: Editor): void {
  const api = {
    version: '0.9.0',
    editor,

    /** Generators. Each returns a fresh document; `load` installs it. */
    generate: {
      region: generateRegion,
      dungeon: generateDungeon,
      cave: generateCave,
      city: generateCity,
      battle: generateBattleMap,
      defaults: {
        region: DEFAULT_REGION_OPTIONS,
        dungeon: DEFAULT_DUNGEON_OPTIONS,
        cave: DEFAULT_CAVE_OPTIONS,
        city: DEFAULT_CITY_OPTIONS,
        battle: DEFAULT_BATTLE_OPTIONS,
      },
      seed: randomSeed,
    },

    /** Install a document into the editor. */
    load(doc: MapDocument, paletteId?: string): void {
      if (paletteId) editor.setPalette(paletteId);
      editor.setDocument(doc);
    },

    blank: createDocument,

    /** Build export payloads without touching the filesystem. */
    build: {
      foundryScene: buildFoundryScene,
      foundryReadme,
      uvtt: buildUvtt,
      roll20: buildRoll20Bundle,
      pdf: buildPdf,
      project: saveProject,
      loadProject,
    },

    /** Export straight to disk (opens the platform save dialog). */
    save: {
      image: exportImage,
      foundry: exportFoundry,
      uvtt: exportUvtt,
      roll20: exportRoll20,
      pdf: exportPdf,
      defaults: DEFAULT_IMAGE_EXPORT,
    },

    render: {
      toSurface: renderToSurface,
      thumbnail: renderThumbnail,
      forExport: renderExportSurface,
    },

    assets: { all: allAssets, render: renderAsset, preview: assetPreview },
    textures: { all: () => TEXTURES, get: getTexture },
    deriveWalls: deriveWallsFromDocument,

    /**
     * Diagnostics used by the tuning harnesses. Cheap to keep around: biome
     * balance is the thing most likely to drift when a threshold is nudged,
     * and eyeballing a rendered map is a poor way to notice that highlands
     * quietly grew to a third of the landmass.
     */
    debug: {
      /** Deciles of the raw temperature and moisture fields, over land only. */
      fieldStats(seeds = 6, opts: Record<string, unknown> = {}) {
        const t: number[] = [], m: number[] = [], a: number[] = [];
        for (let s = 0; s < seeds; s++) {
          const f = generateFields({ seed: 100 + s, ...opts });
          const span = Math.max(0.05, 1 - f.seaLevel);
          for (let i = 0; i < f.water.length; i++) {
            if (f.water[i]) continue;
            t.push(f.temperature[i]);
            m.push(f.moisture[i]);
            a.push((f.elevation[i] - f.seaLevel) / span);
          }
        }
        const deciles = (arr: number[]) => {
          arr.sort((x, y) => x - y);
          return Array.from({ length: 11 }, (_, k) =>
            +arr[Math.min(arr.length - 1, Math.floor(k / 10 * arr.length))].toFixed(3));
        };
        return { temperature: deciles(t), moisture: deciles(m), altitude: deciles(a), landCells: t.length };
      },

      biomeStats(seeds = 6, opts: Record<string, unknown> = {}) {
        const tally: Record<string, number> = {};
        let land = 0, total = 0;
        for (let s = 0; s < seeds; s++) {
          const f = generateFields({ seed: 100 + s, ...opts });
          const b = classify(f);
          for (let i = 0; i < b.length; i++) {
            const name = BIOME_ORDER[b[i]];
            tally[name] = (tally[name] || 0) + 1;
            total++;
            if (!f.water[i]) land++;
          }
        }
        const out: Record<string, string> = {};
        for (const k of Object.keys(tally).sort((a, c) => tally[c] - tally[a])) {
          const isSea = k.startsWith('ocean') || k === 'shallow' || k === 'lake';
          out[k] = (tally[k] / total * 100).toFixed(1) + '%'
            + (isSea ? ' of map' : ' of map, ' + (tally[k] / land * 100).toFixed(1) + '% of land');
        }
        return out;
      },
    },

    /** Bringing existing artwork in. */
    import: {
      documentFromImage,
      imageAsLayer,
      guessGridSize,
    },
  };

  // Convenience alias used by the test harness.
  (window as unknown as { __guessGrid: typeof guessGridSize }).__guessGrid = guessGridSize;

  (window as unknown as { Aetheria: typeof api }).Aetheria = api;
}
