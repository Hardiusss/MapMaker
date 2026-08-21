/**
 * Export orchestration.
 *
 * Every exporter funnels through here so the desktop bridge (native save
 * dialogs) and the browser fallback (download links) stay in one place.
 */
import type { MapDocument } from '../core/types';
import { renderToSurface } from '../render/renderer';
import { buildFoundryScene, foundryReadme, slug, type FoundryExportOptions } from './foundry';
import { buildUvtt, uvttReadme, type UvttOptions } from './uvtt';
import { buildRoll20Bundle } from './roll20';
import { buildPdf, type PdfOptions } from './pdf';
import { saveProject, loadProject, PROJECT_EXT } from './project';
import { zipStore, utf8, base64ToBytes, bytesToBase64 } from '../util/zip';
import type { Surface } from '../util/canvas';

export type ExportFormat = 'png' | 'jpg' | 'webp' | 'foundry' | 'uvtt' | 'roll20' | 'pdf' | 'project';

export interface ImageExportOptions {
  scale: number;
  format: 'png' | 'jpg' | 'webp';
  quality: number;
  includeGrid: boolean;
  includeWalls: boolean;
  includeLights: boolean;
  includeNotes: boolean;
  bakedLighting: boolean;
  padding: number;
  paletteId: string;
  /** `player` drops every GM-only layer — notes, tokens, keyed annotations. */
  audience: 'gm' | 'player';
}

export const DEFAULT_IMAGE_EXPORT: ImageExportOptions = {
  scale: 1, format: 'png', quality: 0.92,
  includeGrid: true, includeWalls: false, includeLights: false, includeNotes: false,
  bakedLighting: false, padding: 0, paletteId: 'atlas', audience: 'gm',
};

export function bridge() {
  return typeof window !== 'undefined' ? window.aetheria : undefined;
}

export const isDesktop = (): boolean => !!bridge();

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

export interface SaveResult { path: string | null; cancelled: boolean; }

export async function saveBytes(
  bytes: Uint8Array,
  defaultName: string,
  filters: { name: string; extensions: string[] }[],
): Promise<SaveResult> {
  const api = bridge();
  if (api) {
    const path = await api.saveDialog({ title: 'Save', defaultName, filters });
    if (!path) return { path: null, cancelled: true };
    await api.writeBinary(path, bytesToBase64(bytes));
    return { path, cancelled: false };
  }
  downloadBlob(new Blob([bytes.slice().buffer as ArrayBuffer]), defaultName);
  return { path: defaultName, cancelled: false };
}

export async function saveTextFile(
  text: string,
  defaultName: string,
  filters: { name: string; extensions: string[] }[],
): Promise<SaveResult> {
  const api = bridge();
  if (api) {
    const path = await api.saveDialog({ title: 'Save', defaultName, filters });
    if (!path) return { path: null, cancelled: true };
    await api.writeText(path, text);
    return { path, cancelled: false };
  }
  downloadBlob(new Blob([text], { type: 'text/plain' }), defaultName);
  return { path: defaultName, cancelled: false };
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

export function renderExportSurface(doc: MapDocument, o: ImageExportOptions): Surface {
  return renderToSurface(doc, {
    scale: o.scale,
    padding: o.padding,
    // `paletteId` defaults to 'atlas' in the options object, which would
    // silently recolour a map exported headlessly — prefer the document's own.
    paletteId: doc.paletteId || o.paletteId,
    showGrid: o.includeGrid,
    showWalls: o.includeWalls,
    showLights: o.includeLights,
    showNotes: o.includeNotes,
    showLightingPreview: o.bakedLighting,
    audience: o.audience,
    forExport: true,
  });
}

function mimeFor(format: string): string {
  return format === 'jpg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
}

export function surfaceToBytes(surface: Surface, format: string, quality: number): Uint8Array {
  const url = surface.toDataURL(mimeFor(format), quality);
  return base64ToBytes(url.slice(url.indexOf(',') + 1));
}

// ---------------------------------------------------------------------------
// Formats
// ---------------------------------------------------------------------------

export async function exportImage(doc: MapDocument, o: ImageExportOptions): Promise<SaveResult> {
  const surface = renderExportSurface(doc, o);
  const bytes = surfaceToBytes(surface, o.format, o.quality);
  const ext = o.format === 'jpg' ? 'jpg' : o.format;
  const suffix = o.audience === 'player' ? '-player' : '';
  return saveBytes(bytes, `${slug(doc.meta.title)}${suffix}.${ext}`, [
    { name: o.format.toUpperCase(), extensions: [ext] },
  ]);
}

export async function exportFoundry(
  doc: MapDocument,
  image: ImageExportOptions,
  foundry: Partial<FoundryExportOptions>,
): Promise<SaveResult & { summary?: ReturnType<typeof buildFoundryScene>['summary'] }> {
  const name = slug(doc.meta.title);
  const imageName = `${name}.${image.format === 'jpg' ? 'jpg' : image.format}`;
  const opts: Partial<FoundryExportOptions> = {
    ...foundry,
    imagePath: foundry.imagePath || `worlds/my-world/scenes/${imageName}`,
    bakedLighting: image.bakedLighting,
  };

  const surface = renderExportSurface(doc, image);
  const imgBytes = surfaceToBytes(surface, image.format, image.quality);
  const { scene, summary } = buildFoundryScene(doc, opts);

  const zip = zipStore([
    { name: imageName, data: imgBytes },
    { name: `${name}.scene.json`, data: utf8(JSON.stringify(scene, null, 2)) },
    { name: 'README.md', data: utf8(foundryReadme(doc, opts)) },
  ]);

  const res = await saveBytes(zip, `${name}-foundry.zip`, [{ name: 'Foundry bundle', extensions: ['zip'] }]);
  return { ...res, summary };
}

export async function exportUvtt(
  doc: MapDocument,
  image: ImageExportOptions,
  uvtt: Partial<UvttOptions> = {},
): Promise<SaveResult> {
  // UVTT always embeds a PNG with no grid drawn — the VTT draws its own.
  const surface = renderExportSurface(doc, { ...image, includeGrid: false, includeWalls: false, includeLights: false, includeNotes: false, padding: 0 });
  const url = surface.toDataURL('image/png');
  const b64 = url.slice(url.indexOf(',') + 1);
  const file = buildUvtt(doc, b64, { ...uvtt, bakedLighting: image.bakedLighting });
  const name = slug(doc.meta.title);
  return saveTextFile(JSON.stringify(file), `${name}.dd2vtt`, [
    { name: 'Universal VTT', extensions: ['dd2vtt', 'uvtt', 'df2vtt'] },
  ]);
}

export async function exportRoll20(doc: MapDocument, image: ImageExportOptions): Promise<SaveResult> {
  const name = slug(doc.meta.title);
  // Roll20 wants 70 px per grid unit.
  const roll20Scale = 70 / Math.max(1, doc.grid.size);
  const surface = renderExportSurface(doc, { ...image, scale: roll20Scale, includeGrid: false });
  const bytes = surfaceToBytes(surface, 'png', 1);
  const bundle = buildRoll20Bundle(doc);
  const zip = zipStore([
    { name: `${name}-roll20.png`, data: bytes },
    { name: 'SETUP.md', data: utf8(bundle.instructions) },
    { name: 'page-settings.json', data: utf8(JSON.stringify(bundle.pageSettings, null, 2)) },
    { name: 'dynamic-lighting.json', data: utf8(JSON.stringify(bundle.dynamicLighting, null, 2)) },
  ]);
  return saveBytes(zip, `${name}-roll20.zip`, [{ name: 'Roll20 bundle', extensions: ['zip'] }]);
}

export async function exportPdf(
  doc: MapDocument,
  image: ImageExportOptions,
  pdf: Partial<PdfOptions> = {},
): Promise<SaveResult> {
  const surface = renderExportSurface(doc, image);
  const bytes = buildPdf(surface, doc.grid.size * image.scale, { title: doc.meta.title, ...pdf });
  return saveBytes(bytes, `${slug(doc.meta.title)}.pdf`, [{ name: 'PDF', extensions: ['pdf'] }]);
}

export async function saveProjectAs(doc: MapDocument, paletteId: string, path?: string | null): Promise<SaveResult> {
  const bytes = await saveProject(doc, paletteId);
  const api = bridge();
  if (api && path) {
    await api.writeBinary(path, bytesToBase64(bytes));
    await api.recentPush(path);
    return { path, cancelled: false };
  }
  const res = await saveBytes(bytes, `${slug(doc.meta.title)}.${PROJECT_EXT}`, [
    { name: 'Aetheria Map', extensions: [PROJECT_EXT] },
  ]);
  if (res.path && api) await api.recentPush(res.path);
  return res;
}

export async function openProjectFrom(path?: string): Promise<{ doc: MapDocument; paletteId: string; path: string } | null> {
  const api = bridge();
  if (api) {
    let target = path;
    if (!target) {
      const picked = await api.openDialog({
        title: 'Open Map',
        filters: [{ name: 'Aetheria Map', extensions: [PROJECT_EXT] }],
      });
      target = picked[0];
    }
    if (!target) return null;
    const b64 = await api.readBinary(target);
    const { doc, paletteId } = await loadProject(base64ToBytes(b64));
    await api.recentPush(target);
    return { doc, paletteId, path: target };
  }
  // Browser fallback: a hidden file input.
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = `.${PROJECT_EXT},.zip`;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      const buf = new Uint8Array(await file.arrayBuffer());
      const { doc, paletteId } = await loadProject(buf);
      resolve({ doc, paletteId, path: file.name });
    };
    input.click();
  });
}

export { PROJECT_EXT } from './project';
export { slug } from './foundry';
