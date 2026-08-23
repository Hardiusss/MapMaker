/** Bottom strip: tool hint, document facts, VTT counts. */
import React from 'react';
import { useEditorEvents } from './useEditor';
import { getTool } from '../tools';
import { useLang } from '../i18n/useLang';

export function StatusBar() {
  const editor = useEditorEvents('tool', 'change', 'selection', 'history');
  const { t } = useLang();
  const doc = editor.doc;
  const tool = getTool(editor.tool);

  const cells = doc.grid.type === 'none'
    ? null
    : t('status.cells', {
      cols: Math.round(doc.width / doc.grid.size),
      rows: Math.round(doc.height / doc.grid.size),
    });

  const walls = doc.layers.reduce((n, l) => n + (l.kind === 'wall' ? l.walls.length : 0), 0);
  const lights = doc.layers.reduce((n, l) => n + (l.kind === 'light' ? l.lights.length : 0), 0);
  const objects = doc.layers.reduce((n, l) => n + (l.kind === 'object' ? l.objects.length : 0), 0);

  return (
    <div className="statusbar">
      <strong style={{ color: 'var(--ink-dim)' }}>{tool.label}</strong>
      <span>{tool.hint}</span>
      <span className="grow" />
      {editor.selection.objectIds.length > 0 && (
        <>
          <span>{t('status.selected', { count: editor.selection.objectIds.length })}</span>
          <span className="sep" />
        </>
      )}
      <span>{t('status.size', { w: doc.width, h: doc.height })}</span>
      {cells && <><span className="sep" /><span>{cells}</span></>}
      <span className="sep" />
      <span>{t('status.objects', { count: objects })}</span>
      <span className="sep" />
      <span>{t('status.wallsLights', { walls, lights })}</span>
      <span className="sep" />
      <span>{t('status.undoSteps', { count: editor.history.depth })}</span>
    </div>
  );
}
