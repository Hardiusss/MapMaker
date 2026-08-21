/**
 * Autosave and crash recovery.
 *
 * Writes the working document to the app's data folder on a timer whenever it
 * is dirty, and offers it back on the next launch. A map editor that can lose
 * an evening's work to a stray Alt+F4 is not a tool anyone should rely on.
 */
import type { MapDocument } from './types';
import { saveProject, loadProject } from '../export/project';
import { bytesToBase64, base64ToBytes } from '../util/zip';

const FILE = 'autosave.aethermap';
const META = 'autosave.json';

export interface AutosaveMeta {
  title: string;
  savedAt: number;
  /** The project path the user was working on, if any. */
  filePath: string | null;
  kind: string;
}

function api() {
  return typeof window !== 'undefined' ? window.aetheria : undefined;
}

async function dataPath(name: string): Promise<string | null> {
  const bridge = api();
  if (!bridge) return null;
  const info = await bridge.info();
  // Electron gives us a real userData directory; join with the platform slash.
  const sep = info.platform === 'win32' ? '\\' : '/';
  return `${info.userData}${sep}${name}`;
}

export async function writeAutosave(doc: MapDocument, paletteId: string, filePath: string | null): Promise<boolean> {
  const bridge = api();
  if (!bridge) return false;
  try {
    const [target, metaTarget] = await Promise.all([dataPath(FILE), dataPath(META)]);
    if (!target || !metaTarget) return false;
    const bytes = await saveProject(doc, paletteId);
    await bridge.writeBinary(target, bytesToBase64(bytes));
    const meta: AutosaveMeta = {
      title: doc.meta.title,
      savedAt: Date.now(),
      filePath,
      kind: doc.kind,
    };
    await bridge.writeText(metaTarget, JSON.stringify(meta));
    return true;
  } catch (err) {
    console.warn('[aetheria] autosave failed', err);
    return false;
  }
}

export async function readAutosaveMeta(): Promise<AutosaveMeta | null> {
  const bridge = api();
  if (!bridge) return null;
  try {
    const metaTarget = await dataPath(META);
    const target = await dataPath(FILE);
    if (!metaTarget || !target) return null;
    if (!(await bridge.exists(metaTarget)) || !(await bridge.exists(target))) return null;
    return JSON.parse(await bridge.readText(metaTarget)) as AutosaveMeta;
  } catch {
    return null;
  }
}

export async function restoreAutosave(): Promise<{ doc: MapDocument; paletteId: string; filePath: string | null } | null> {
  const bridge = api();
  if (!bridge) return null;
  try {
    const target = await dataPath(FILE);
    const meta = await readAutosaveMeta();
    if (!target || !meta) return null;
    const b64 = await bridge.readBinary(target);
    const { doc, paletteId } = await loadProject(base64ToBytes(b64));
    return { doc, paletteId, filePath: meta.filePath };
  } catch (err) {
    console.warn('[aetheria] autosave restore failed', err);
    return null;
  }
}

export async function clearAutosave(): Promise<void> {
  const bridge = api();
  if (!bridge) return;
  try {
    const metaTarget = await dataPath(META);
    if (metaTarget) await bridge.writeText(metaTarget, '');
  } catch {
    // Clearing is best-effort: a stale marker only costs one dismissed prompt.
  }
}

/**
 * Start the autosave timer. Returns a stop function.
 * The callback supplies the current state so the timer never holds a stale
 * reference to a document that has since been replaced.
 */
export function startAutosave(
  getState: () => { doc: MapDocument; paletteId: string; filePath: string | null; dirty: boolean } | null,
  intervalMs = 180_000,
  onSaved?: () => void,
): () => void {
  if (!api()) return () => {};
  let busy = false;
  const id = window.setInterval(async () => {
    if (busy) return;
    const state = getState();
    if (!state || !state.dirty) return;
    busy = true;
    try {
      const ok = await writeAutosave(state.doc, state.paletteId, state.filePath);
      if (ok) onSaved?.();
    } finally {
      busy = false;
    }
  }, intervalMs);
  return () => window.clearInterval(id);
}
