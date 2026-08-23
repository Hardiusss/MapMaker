/** Application header: file actions, history, view controls. */
import React from 'react';
import { useEditorEvents } from './useEditor';
import { useLang } from '../i18n/useLang';
import { LANGS, setLang } from '../i18n';
import {
  IconNew, IconOpen, IconSave, IconExport, IconUndo, IconRedo,
  IconZoomIn, IconZoomOut, IconFit, IconWand, IconPanel, IconGrid, IconInfo,
} from './components/Icons';

export interface TopBarProps {
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onExport: () => void;
  onGenerate: () => void;
  onHelp: () => void;
  panelVisible: boolean;
  onTogglePanel: () => void;
}

export function TopBar(p: TopBarProps) {
  const editor = useEditorEvents('change', 'history', 'camera', 'view');
  const { lang, t } = useLang();

  const zoom = (factor: number) => {
    editor.camera.zoomAt({ x: editor.camera.viewW / 2, y: editor.camera.viewH / 2 }, factor);
    editor.events.emit('camera', undefined);
  };

  return (
    <div className="topbar">
      <div className="brand">
        <span className="mark">✦</span>
        <span>Aetheria</span>
      </div>

      <button className="btn ghost icon" title={`${t('action.new')}  (Ctrl+N)`} onClick={p.onNew}><IconNew size={16} /></button>
      <button className="btn ghost icon" title={`${t('action.open')}  (Ctrl+O)`} onClick={p.onOpen}><IconOpen size={16} /></button>
      <button className="btn ghost icon" title={`${t('action.save')}  (Ctrl+S)`} onClick={p.onSave}><IconSave size={16} /></button>

      <div style={{ width: 1, height: 20, background: 'var(--line)', margin: '0 4px' }} />

      <button className="btn ghost icon" title={`${t('action.undo')}${editor.history.undoLabel ? `: ${editor.history.undoLabel}` : ''}  (Ctrl+Z)`}
        disabled={!editor.history.canUndo} onClick={() => editor.undo()}><IconUndo size={16} /></button>
      <button className="btn ghost icon" title={`${t('action.redo')}${editor.history.redoLabel ? `: ${editor.history.redoLabel}` : ''}  (Ctrl+Shift+Z)`}
        disabled={!editor.history.canRedo} onClick={() => editor.redo()}><IconRedo size={16} /></button>

      <div style={{ width: 1, height: 20, background: 'var(--line)', margin: '0 4px' }} />

      <input
        className="doc-title"
        value={editor.doc.meta.title}
        title={t('action.mapTitle')}
        onChange={(e) => editor.mutate('Rename', (d) => { d.meta.title = e.target.value; })}
      />
      {editor.dirty && <span className="pill warn">{t('app.unsaved')}</span>}

      <span className="spacer" />

      <button className="btn" onClick={p.onGenerate} title={`${t('action.generate')}  (Ctrl+Shift+G)`}>
        <IconWand size={15} /> {t('action.generate.short')}
      </button>
      <button className="btn primary" onClick={p.onExport} title={`${t('action.export')}  (Ctrl+E)`}>
        <IconExport size={15} /> {t('action.export')}
      </button>

      <div style={{ width: 1, height: 20, background: 'var(--line)', margin: '0 4px' }} />

      <button className={`btn ghost icon ${editor.view.showGrid ? 'active' : ''}`} title={`${t('action.toggleGrid')}  (Ctrl+G)`}
        onClick={() => editor.setView({ showGrid: !editor.view.showGrid })}><IconGrid size={16} /></button>
      <button className="btn ghost icon" title={`${t('action.zoomOut')}  (Ctrl+-)`} onClick={() => zoom(1 / 1.25)}><IconZoomOut size={16} /></button>
      <button className="btn ghost small" title={`${t('action.zoomFit')}  (Ctrl+0)`} style={{ minWidth: 46 }}
        onClick={() => { editor.camera.fit(editor.doc.width, editor.doc.height); editor.events.emit('camera', undefined); }}>
        {Math.round(editor.camera.zoom * 100)}%
      </button>
      <button className="btn ghost icon" title={`${t('action.zoomIn')}  (Ctrl+=)`} onClick={() => zoom(1.25)}><IconZoomIn size={16} /></button>
      <button className="btn ghost icon" title={t('action.fitMap')} onClick={() => { editor.camera.fit(editor.doc.width, editor.doc.height); editor.events.emit('camera', undefined); }}>
        <IconFit size={16} />
      </button>

      <div className="lang-switch" title={t('action.language')}>
        {LANGS.map((l) => (
          <button key={l.id} className={`btn ghost small ${lang === l.id ? 'active' : ''}`}
            onClick={() => setLang(l.id)}>{l.short}</button>
        ))}
      </div>

      <button className="btn ghost icon" title={t('action.help')} onClick={p.onHelp}><IconInfo size={16} /></button>
      <button className={`btn ghost icon ${p.panelVisible ? 'active' : ''}`} title={t('action.togglePanel')}
        onClick={p.onTogglePanel}><IconPanel size={16} /></button>
    </div>
  );
}
