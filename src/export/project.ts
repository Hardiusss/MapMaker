/**
 * Native project format (`.aethermap`).
 *
 * A ZIP holding `project.json`, one PNG per raster layer and a thumbnail.
 * Self-contained, offline, and readable with any zip tool if you ever need to
 * dig a layer out by hand.
 */
import type { MapDocument, Layer, RasterLayer } from '../core/types';
import { isRaster } from '../core/types';
import { zipStore, unzipStore, utf8, fromUtf8, base64ToBytes, bytesToBase64, type ZipEntry } from '../util/zip';
import { createSurface, ctxOf, surfaceFromDataURL, alphaBounds, isFullyOpaque } from '../util/canvas';
import { renderThumbnail } from '../render/renderer';

export const PROJECT_VERSION = 1;
export const PROJECT_EXT = 'aethermap';

interface SerializedRaster extends Omit<RasterLayer, 'surface'> {
  surfaceFile: string | null;
  /** Where the stored PNG sits on the full canvas — layers are cropped to
   *  their painted area, which typically halves the file size. */
  surfaceRect?: { x: number; y: number; w: number; h: number };
}

interface ProjectFile {
  format: 'aetheria-cartographer';
  version: number;
  app: string;
  savedAt: number;
  paletteId: string;
  document: Omit<MapDocument, 'layers'> & { layers: (Layer | SerializedRaster)[] };
}

export async function saveProject(doc: MapDocument, paletteId: string): Promise<Uint8Array> {
  const entries: ZipEntry[] = [];
  const layers: (Layer | SerializedRaster)[] = [];

  for (const layer of doc.layers) {
    if (!isRaster(layer)) { layers.push(layer); continue; }
    const bounds = alphaBounds(layer.surface);
    let file: string | null = null;
    let rect: { x: number; y: number; w: number; h: number } | undefined;
    if (bounds) {
      // Store only the painted rectangle. A layer holding one small stroke
      // should not cost a full-canvas PNG.
      const crop = createSurface(bounds.w, bounds.h);
      ctxOf(crop).drawImage(layer.surface, bounds.x, bounds.y, bounds.w, bounds.h, 0, 0, bounds.w, bounds.h);
      // A fully opaque layer (a painted ground, say) has no alpha worth
      // preserving, and PNG is a poor fit for procedural noise. JPEG here cuts
      // a typical battle-map project from ~11 MB to under 2 MB.
      const opaque = isFullyOpaque(crop);
      const url = opaque ? crop.toDataURL('image/jpeg', 0.93) : crop.toDataURL('image/png');
      const b64 = url.slice(url.indexOf(',') + 1);
      file = `layers/${layer.id}.${opaque ? 'jpg' : 'png'}`;
      rect = bounds;
      entries.push({ name: file, data: base64ToBytes(b64) });
    }
    const { surface, ...rest } = layer;
    layers.push({ ...rest, surfaceFile: file, surfaceRect: rect });
  }

  const project: ProjectFile = {
    format: 'aetheria-cartographer',
    version: PROJECT_VERSION,
    app: 'Aetheria Cartographer 0.9.0',
    savedAt: Date.now(),
    paletteId,
    document: { ...doc, layers },
  };

  entries.unshift({ name: 'project.json', data: utf8(JSON.stringify(project, null, 1)) });

  try {
    const thumb = renderThumbnail(doc, 512, paletteId);
    const url = thumb.toDataURL('image/png');
    entries.push({ name: 'thumbnail.png', data: base64ToBytes(url.slice(url.indexOf(',') + 1)) });
  } catch {
    // A thumbnail is a nicety; never let it block a save.
  }

  return zipStore(entries);
}

export async function loadProject(bytes: Uint8Array): Promise<{ doc: MapDocument; paletteId: string }> {
  const files = unzipStore(bytes);
  const raw = files.get('project.json');
  if (!raw) throw new Error('project.json missing — is this an Aetheria map?');
  const project = JSON.parse(fromUtf8(raw)) as ProjectFile;
  if (project.format !== 'aetheria-cartographer') throw new Error('Unrecognised project format');

  const layers: Layer[] = [];
  for (const l of project.document.layers) {
    if (l.kind !== 'raster') { layers.push(l as Layer); continue; }
    const s = l as SerializedRaster;
    const surface = createSurface(project.document.width, project.document.height);
    if (s.surfaceFile) {
      const data = files.get(s.surfaceFile);
      if (data) {
        const mime = s.surfaceFile.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
        const url = `data:${mime};base64,${bytesToBase64(data)}`;
        const loaded = await surfaceFromDataURL(url);
        const r = s.surfaceRect;
        ctxOf(surface).drawImage(loaded, r ? r.x : 0, r ? r.y : 0);
      }
    }
    const { surfaceFile, surfaceRect, ...rest } = s;
    layers.push({ ...(rest as Omit<RasterLayer, 'surface'>), surface } as RasterLayer);
  }

  const doc: MapDocument = { ...(project.document as unknown as MapDocument), layers };
  // Older files kept the palette beside the document rather than inside it.
  const paletteId = doc.paletteId || project.paletteId || 'atlas';
  doc.paletteId = paletteId;
  return { doc, paletteId };
}

/** Quick check without a full parse — used by the open dialog. */
export function looksLikeProject(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}
