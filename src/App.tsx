/** Application shell: owns the Editor, dialogs, shortcuts and the desktop menu wiring. */
import React from 'react';
import { Editor } from './core/editor';
import { EditorContext } from './ui/useEditor';
import { TopBar } from './ui/TopBar';
import { Toolbar } from './ui/Toolbar';
import { OptionBar } from './ui/OptionBar';
import { CanvasView } from './ui/CanvasView';
import { SidePanel, type PanelTab } from './ui/SidePanel';
import { StatusBar } from './ui/StatusBar';
import { NewMapDialog } from './ui/dialogs/NewMapDialog';
import { GenerateDialog, kindToGen, type GenKind } from './ui/dialogs/GenerateDialog';
import { ExportDialog, type ExportFormat } from './ui/dialogs/ExportDialog';
import { ShortcutsDialog, FoundryHelpDialog, AboutDialog } from './ui/dialogs/HelpDialog';
import { TextEditDialog, NoteEditDialog } from './ui/dialogs/QuickEditDialogs';
import { ImportImageDialog } from './ui/dialogs/ImportImageDialog';
import { Modal } from './ui/components/controls';
import { saveProjectAs, openProjectFrom } from './export';
import { generateRegion } from './gen/region/regionGen';
import { getTool, TOOLS } from './tools';
import { randomSeed } from './core/rng';
import type { MapKind } from './core/types';
import { installApi } from './api';
import { startAutosave, readAutosaveMeta, restoreAutosave, clearAutosave, type AutosaveMeta } from './core/autosave';
import { t } from './i18n';
import { useLang } from './i18n/useLang';
import { plural } from './i18n/plural';

type Dialog =
  | { kind: 'none' }
  | { kind: 'new' }
  | { kind: 'generate'; gen: GenKind }
  | { kind: 'export'; format?: ExportFormat }
  | { kind: 'shortcuts' }
  | { kind: 'foundry' }
  | { kind: 'about' }
  | { kind: 'text'; id: string }
  | { kind: 'note'; id: string }
  | { kind: 'import' };

function bootstrapEditor(): Editor {
  // Open on something worth looking at rather than an empty canvas.
  const { doc } = generateRegion({
    seed: randomSeed(),
    width: 2400, height: 1600,
    settlements: 10,
    paletteId: 'atlas',
  });
  const editor = new Editor(doc);
  editor.paletteId = 'atlas';
  return editor;
}

export default function App() {
  const [editor] = React.useState(bootstrapEditor);
  const [dialog, setDialog] = React.useState<Dialog>({ kind: 'none' });
  const [tab, setTab] = React.useState<PanelTab>('layers');
  const [panelVisible, setPanelVisible] = React.useState(true);
  const [recovery, setRecovery] = React.useState<AutosaveMeta | null>(null);

  const close = React.useCallback(() => setDialog({ kind: 'none' }), []);

  // Expose the scripting API (see src/api.ts) — handy in the dev console and
  // used by the headless test harness.
  React.useEffect(() => { installApi(editor); }, [editor]);

  // ---- Editor-driven dialogs --------------------------------------------
  React.useEffect(() => {
    return editor.events.on('ui', ({ dialog: d, payload }) => {
      const p = payload as { id?: string } | undefined;
      if (d === 'text' && p?.id) setDialog({ kind: 'text', id: p.id });
      else if (d === 'note' && p?.id) setDialog({ kind: 'note', id: p.id });
      else if (d === 'export') setDialog({ kind: 'export' });
    });
  }, [editor]);

  // ---- Selection switches the panel to the inspector ---------------------
  React.useEffect(() => {
    return editor.events.on('selection', (sel) => {
      if (sel.objectIds.length) setTab('props');
    });
  }, [editor]);

  // ---- Window title ------------------------------------------------------
  React.useEffect(() => {
    const update = () => {
      const t = `${editor.doc.meta.title}${editor.dirty ? ' •' : ''} — Aetheria Cartographer`;
      document.title = t;
      window.aetheria?.setTitle(t);
    };
    update();
    return editor.events.on('change', update);
  }, [editor]);

  // ---- File actions ------------------------------------------------------
  const doSave = React.useCallback(async (saveAs = false) => {
    try {
      const res = await saveProjectAs(editor.doc, editor.paletteId, saveAs ? null : editor.filePath);
      if (!res.cancelled && res.path) {
        editor.filePath = res.path;
        editor.dirty = false;
        editor.status(t('app.status.saved', { path: res.path }));
        editor.emitChange();
      }
    } catch (err) {
      editor.status(t('app.status.saveFailed', { error: (err as Error).message }));
    }
  }, [editor]);

  const doOpen = React.useCallback(async (path?: string) => {
    try {
      const res = await openProjectFrom(path);
      if (!res) return;
      editor.setPalette(res.paletteId);
      editor.setDocument(res.doc, { path: res.path });
      editor.status(t('app.status.opened', { path: res.path }));
    } catch (err) {
      editor.status(t('app.status.openFailed', { error: (err as Error).message }));
    }
  }, [editor]);

  // ---- Desktop menu ------------------------------------------------------
  React.useEffect(() => {
    const off = window.aetheria?.onMenu((payload) => {
      switch (payload.command) {
        case 'new': setDialog({ kind: 'new' }); break;
        case 'open': doOpen(); break;
        case 'open-path': doOpen(payload.path); break;
        case 'import-image': setDialog({ kind: 'import' }); break;
        case 'save': doSave(false); break;
        case 'save-as': doSave(true); break;
        case 'export': setDialog({ kind: 'export', format: payload.format as ExportFormat }); break;
        case 'undo': editor.undo(); break;
        case 'redo': editor.redo(); break;
        case 'duplicate': editor.duplicateSelection(); break;
        case 'delete': editor.deleteSelection(); break;
        case 'select-all': selectAll(); break;
        case 'zoom-in': editor.camera.setZoom(editor.camera.zoom * 1.25); editor.events.emit('camera', undefined); break;
        case 'zoom-out': editor.camera.setZoom(editor.camera.zoom / 1.25); editor.events.emit('camera', undefined); break;
        case 'zoom-fit': editor.camera.fit(editor.doc.width, editor.doc.height); editor.events.emit('camera', undefined); break;
        case 'toggle-grid': editor.setView({ showGrid: !editor.view.showGrid }); break;
        case 'toggle-walls': editor.setView({ showWalls: !editor.view.showWalls }); break;
        case 'toggle-lights': editor.setView({ showLightingPreview: !editor.view.showLightingPreview }); break;
        case 'generate': setDialog({ kind: 'generate', gen: (payload.kind as GenKind) || 'region' }); break;
        case 'derive-walls': deriveWalls(); break;
        case 'help-shortcuts': setDialog({ kind: 'shortcuts' }); break;
        case 'help-foundry': setDialog({ kind: 'foundry' }); break;
        case 'help-about': setDialog({ kind: 'about' }); break;
      }
    });
    return off;
  }, [editor, doOpen, doSave]);

  const selectAll = React.useCallback(() => {
    const ids: string[] = [];
    for (const l of editor.doc.layers) {
      if (l.kind === 'object' && l.visible && !l.locked) ids.push(...l.objects.map((o) => o.id));
    }
    editor.selectObjects(ids);
  }, [editor]);

  /** Turn every blocking prop and shape into VTT walls. */
  const deriveWalls = React.useCallback(() => {
    editor.status(t('app.status.derivingWalls'));
    import('./gen/deriveWalls').then(({ deriveWallsFromDocument }) => {
      const walls = deriveWallsFromDocument(editor.doc);
      editor.addWalls(walls, 'Derive walls');
      editor.setView({ showWalls: true });
      editor.status(t('app.status.wallsAdded', { walls: plural('count.wallSegments', walls.length) }));
    });
  }, [editor]);

  // ---- Keyboard ----------------------------------------------------------
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      const mod = e.ctrlKey || e.metaKey;

      if (mod) {
        switch (e.key.toLowerCase()) {
          case 'z': e.preventDefault(); e.shiftKey ? editor.redo() : editor.undo(); return;
          case 'y': e.preventDefault(); editor.redo(); return;
          case 's': e.preventDefault(); doSave(e.shiftKey); return;
          case 'o': e.preventDefault(); doOpen(); return;
          case 'i': e.preventDefault(); setDialog({ kind: 'import' }); return;
          case 'n': e.preventDefault(); setDialog({ kind: 'new' }); return;
          case 'e': e.preventDefault(); setDialog({ kind: 'export' }); return;
          case 'd': e.preventDefault(); editor.duplicateSelection(); return;
          case 'c': e.preventDefault(); editor.copySelection(); return;
          case 'v': e.preventDefault(); editor.pasteClipboard(); return;
          case 'a': e.preventDefault(); selectAll(); return;
          case 'g':
            e.preventDefault();
            if (e.shiftKey) setDialog({ kind: 'generate', gen: kindToGen(editor.doc.kind) });
            else editor.setView({ showGrid: !editor.view.showGrid });
            return;
          case 'w': e.preventDefault(); editor.setView({ showWalls: !editor.view.showWalls }); return;
          case 'l': e.preventDefault(); editor.setView({ showLightingPreview: !editor.view.showLightingPreview }); return;
          case '0': e.preventDefault(); editor.camera.fit(editor.doc.width, editor.doc.height); editor.events.emit('camera', undefined); return;
          case '1': e.preventDefault(); editor.camera.setZoom(1); editor.events.emit('camera', undefined); return;
          case '=': case '+': e.preventDefault(); editor.camera.setZoom(editor.camera.zoom * 1.25); editor.events.emit('camera', undefined); return;
          case '-': e.preventDefault(); editor.camera.setZoom(editor.camera.zoom / 1.25); editor.events.emit('camera', undefined); return;
        }
        return;
      }

      // Tool-owned keys first.
      const handled = getTool(editor.tool).onKeyDown?.({
        editor, key: e.key, shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey, native: e,
      });
      if (handled) { e.preventDefault(); return; }

      if (e.key === 'Delete' || e.key === 'Backspace') { editor.deleteSelection(); return; }
      if (e.key === '[') { editor.setBrush({ size: Math.max(2, editor.brush.size * 0.85) }); return; }
      if (e.key === ']') { editor.setBrush({ size: Math.min(3000, editor.brush.size * 1.18) }); return; }

      const tool = TOOLS.find((t) => t.shortcut === e.key.toLowerCase());
      if (tool) {
        getTool(editor.tool).onDeactivate?.(editor);
        editor.setTool(tool.id);
        tool.onActivate?.(editor);
        if (tool.hint) editor.status(tool.hint);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor, doSave, doOpen, selectAll]);

  // ---- Autosave & crash recovery ----------------------------------------
  React.useEffect(() => {
    let cancelled = false;
    readAutosaveMeta().then((meta) => {
      if (!cancelled && meta && meta.title && meta.savedAt) setRecovery(meta);
    });
    const stop = startAutosave(
      () => ({ doc: editor.doc, paletteId: editor.paletteId, filePath: editor.filePath, dirty: editor.dirty }),
      180_000,
      () => editor.status(t('app.status.autosaved')),
    );
    return () => { cancelled = true; stop(); };
  }, [editor]);

  // ---- Warn before losing work ------------------------------------------
  React.useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (!editor.dirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, [editor]);

  return (
    <EditorContext.Provider value={editor}>
      <div className={`app ${panelVisible ? '' : 'no-panel'}`}>
        <TopBar
          onNew={() => setDialog({ kind: 'new' })}
          onOpen={() => doOpen()}
          onSave={() => doSave(false)}
          onExport={() => setDialog({ kind: 'export' })}
          onGenerate={() => setDialog({ kind: 'generate', gen: kindToGen(editor.doc.kind) })}
          onHelp={() => setDialog({ kind: 'shortcuts' })}
          panelVisible={panelVisible}
          onTogglePanel={() => setPanelVisible((v) => !v)}
        />
        <OptionBar onOpenAssets={() => { setPanelVisible(true); setTab('assets'); }} />
        <Toolbar />
        <CanvasView />
        {panelVisible && <SidePanel tab={tab} onTab={setTab} />}
        <StatusBar />
      </div>

      {dialog.kind === 'new' && (
        <NewMapDialog
          onClose={close}
          onGenerate={(kind: MapKind) => setDialog({ kind: 'generate', gen: kindToGen(kind) })}
          onImport={() => setDialog({ kind: 'import' })}
        />
      )}
      {dialog.kind === 'generate' && <GenerateDialog initial={dialog.gen} onClose={close} />}
      {dialog.kind === 'export' && <ExportDialog initial={dialog.format} onClose={close} />}
      {dialog.kind === 'shortcuts' && <ShortcutsDialog onClose={close} />}
      {dialog.kind === 'foundry' && <FoundryHelpDialog onClose={close} />}
      {dialog.kind === 'about' && <AboutDialog onClose={close} />}
      {dialog.kind === 'text' && <TextEditDialog id={dialog.id} onClose={close} />}
      {dialog.kind === 'note' && <NoteEditDialog id={dialog.id} onClose={close} />}
      {dialog.kind === 'import' && <ImportImageDialog onClose={close} />}

      {recovery && (
        <RecoveryDialog
          meta={recovery}
          onDiscard={() => { clearAutosave(); setRecovery(null); }}
          onDismiss={() => setRecovery(null)}
          onRecover={async () => {
            const res = await restoreAutosave();
            if (res) {
              editor.setPalette(res.paletteId);
              editor.setDocument(res.doc, { path: res.filePath });
              editor.markDirty();
              editor.status(t('app.status.recovered'));
            }
            setRecovery(null);
          }}
        />
      )}
    </EditorContext.Provider>
  );
}

/**
 * The crash-recovery prompt.
 *
 * Built on `Modal` rather than hand-rolled markup so that it behaves like
 * every other dialog in the app: Escape closes it, the backdrop closes it, and
 * the first control takes focus. It used to be neither — hardcoded English in
 * a translated interface, and the one dialog in the app that ignored Escape,
 * which is the worst place for that since it is the first thing a GM sees
 * after a crash.
 *
 * Escape means "not now": it leaves the autosave on disk, because dismissing a
 * prompt should never be the same gesture as throwing work away.
 */
function RecoveryDialog({ meta, onDiscard, onDismiss, onRecover }: {
  meta: AutosaveMeta;
  onDiscard: () => void;
  onDismiss: () => void;
  onRecover: () => void;
}) {
  const { t: tr } = useLang();
  return (
    <Modal
      title={tr('app.recover.title')}
      size="narrow"
      onClose={onDismiss}
      footer={
        <>
          <button className="btn" onClick={onDiscard}>{tr('app.recover.discard')}</button>
          <span className="grow" />
          <button className="btn" onClick={onDismiss}>{tr('app.recover.notNow')}</button>
          <button className="btn primary" onClick={onRecover}>{tr('app.recover.recover')}</button>
        </>
      }
    >
      <p style={{ marginTop: 0 }}>
        {tr('app.recover.body', {
          title: meta.title,
          when: new Date(meta.savedAt).toLocaleString(),
        })}
      </p>
      <p className="hint">{tr('app.recover.hint')}</p>
    </Modal>
  );
}
