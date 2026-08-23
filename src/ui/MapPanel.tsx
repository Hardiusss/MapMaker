/** Document-level settings: canvas, grid, palette, lighting, VTT summary. */
import React from 'react';
import { useEditorEvents } from './useEditor';
import { Section, Slider, NumberField, TextField, TextArea, SelectField, Toggle, ColorField } from './components/controls';
import { PALETTES } from '../core/color';
import { TEXTURES } from '../render/textures';
import { resizeDocument } from '../core/doc';
import type { GridType } from '../core/types';
import { clearAssetCache, clearPreviewCache } from '../assets/library';
import { clearTextureCache } from '../render/textures';
import { useLang } from '../i18n/useLang';
import { paletteName, paletteBlurb, textureLabel } from '../i18n/display';

export function MapPanel() {
  const editor = useEditorEvents('change', 'view');
  const { t } = useLang();
  const doc = editor.doc;
  const [w, setW] = React.useState(doc.width);
  const [h, setH] = React.useState(doc.height);

  React.useEffect(() => { setW(doc.width); setH(doc.height); }, [doc.width, doc.height]);

  const setGrid = (patch: Partial<typeof doc.grid>) => {
    editor.mutate('Grid settings', (d) => { d.grid = { ...d.grid, ...patch }; });
  };

  const wallCount = doc.layers.reduce((n, l) => n + (l.kind === 'wall' ? l.walls.length : 0), 0);
  const doorCount = doc.layers.reduce(
    (n, l) => n + (l.kind === 'wall' ? l.walls.filter((x) => x.kind === 'door' || x.kind === 'secretDoor').length : 0), 0);
  const lightCount = doc.layers.reduce((n, l) => n + (l.kind === 'light' ? l.lights.length : 0), 0);
  const noteCount = doc.layers.reduce((n, l) => n + (l.kind === 'note' ? l.notes.length : 0), 0);
  const objectCount = doc.layers.reduce((n, l) => n + (l.kind === 'object' ? l.objects.length : 0), 0);

  return (
    <>
      <Section title={t('panel.map')}>
        <TextField label={t('field.title')} value={doc.meta.title}
          onChange={(v) => editor.mutate('Rename', (d) => { d.meta.title = v; })} />
        <TextArea label={t('map.description')} rows={3} value={doc.meta.description}
          onChange={(v) => editor.mutate('Describe', (d) => { d.meta.description = v; })} />
        {doc.meta.seed !== undefined && <p className="hint">{t('map.seed')} <code>{doc.meta.seed}</code></p>}
      </Section>

      <Section title={t('map.canvas')}>
        <div className="grid-2">
          <NumberField label={t('field.width')} value={w} min={64} max={12000} step={16} onChange={setW} />
          <NumberField label={t('field.height')} value={h} min={64} max={12000} step={16} onChange={setH} />
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          <button className="btn small" style={{ flex: 1 }} disabled={w === doc.width && h === doc.height}
            onClick={() => editor.mutate('Resize canvas', (d) => resizeDocument(d, w, h, 'topleft'))}>
            {t('map.resizeTopLeft')}
          </button>
          <button className="btn small" style={{ flex: 1 }} disabled={w === doc.width && h === doc.height}
            onClick={() => editor.mutate('Resize canvas', (d) => resizeDocument(d, w, h, 'center'))}>
            {t('map.resizeCentred')}
          </button>
        </div>
        <p className="hint" style={{ marginTop: 6 }}>
          {t('map.cellsSummary', {
            cols: Math.round(doc.width / Math.max(1, doc.grid.size)),
            rows: Math.round(doc.height / Math.max(1, doc.grid.size)),
          })}
          {doc.grid.type !== 'none' && ` · ${(doc.width / Math.max(1, doc.grid.size) * doc.grid.unitsPerCell).toFixed(0)} × ${(doc.height / Math.max(1, doc.grid.size) * doc.grid.unitsPerCell).toFixed(0)} ${doc.grid.unitLabel}`}
        </p>
      </Section>

      <Section title={t('map.grid')}>
        <SelectField label={t('field.type')} value={doc.grid.type}
          options={[
            { value: 'none', label: t('grid.none') },
            { value: 'square', label: t('grid.square') },
            { value: 'hexPointy', label: t('grid.hexPointy') },
            { value: 'hexFlat', label: t('grid.hexFlat') },
            { value: 'isometric', label: t('grid.isometric') },
          ] as { value: GridType; label: string }[]}
          onChange={(v) => setGrid({ type: v, visible: v !== 'none' })} />
        <NumberField label={t('field.cellSize')} value={Math.round(doc.grid.size)} min={4} max={600} suffix="px"
          onChange={(v) => setGrid({ size: v })} />
        <div className="grid-2">
          <NumberField label={t('map.unitsPerCell')} value={doc.grid.unitsPerCell} min={0.1} step={0.5}
            onChange={(v) => setGrid({ unitsPerCell: v })} />
          <TextField label={t('map.unitLabel')} value={doc.grid.unitLabel} onChange={(v) => setGrid({ unitLabel: v })} />
        </div>
        <div className="grid-2">
          <NumberField label={t('map.offsetX')} value={doc.grid.offsetX} onChange={(v) => setGrid({ offsetX: v })} />
          <NumberField label={t('map.offsetY')} value={doc.grid.offsetY} onChange={(v) => setGrid({ offsetY: v })} />
        </div>
        <ColorField label={t('field.colour')} value={doc.grid.color} onChange={(v) => setGrid({ color: v })} />
        <Slider label={t('field.opacity')} value={doc.grid.opacity} min={0} max={1} step={0.02}
          onChange={(v) => setGrid({ opacity: v })} format={(v) => `${Math.round(v * 100)}%`} />
        <NumberField label={t('map.majorEvery')} value={doc.grid.majorEvery} min={0} max={20}
          onChange={(v) => setGrid({ majorEvery: Math.round(v) })} />
        <Toggle label={t('map.visible')} value={doc.grid.visible} onChange={(v) => setGrid({ visible: v })} />
        <Toggle label={t('map.snap')} value={doc.grid.snap} onChange={(v) => setGrid({ snap: v })} />
      </Section>

      <Section title={t('field.palette')}>
        <SelectField label={t('map.colourScheme')} value={editor.paletteId}
          options={PALETTES.map((p) => ({ value: p.id, label: paletteName(p.id, p.name) }))}
          onChange={(v) => {
            editor.setPalette(v);
            clearTextureCache();
            clearAssetCache();
            clearPreviewCache();
            editor.emitChange();
          }} />
        <p className="hint">{paletteBlurb(editor.paletteId, PALETTES.find((p) => p.id === editor.paletteId)?.blurb || '')}</p>
        <SelectField label={t('map.background')} value={doc.background.textureId || '—'}
          options={[{ value: '—', label: t('map.solidColour') },
            ...TEXTURES.map((tex) => ({ value: tex.id, label: textureLabel(tex.id, tex.label) }))]}
          onChange={(v) => editor.mutate('Background', (d) => {
            d.background = v === '—'
              ? { type: 'solid', color: d.background.color }
              : { type: 'texture', color: d.background.color, textureId: v, textureScale: d.background.textureScale ?? 1 };
          })} />
        {doc.background.type === 'solid' && (
          <ColorField label={t('map.backgroundColour')} value={doc.background.color}
            onChange={(v) => editor.mutate('Background', (d) => { d.background = { ...d.background, color: v }; })} />
        )}
      </Section>

      <Section title={t('map.lighting')}>
        <Toggle label={t('map.globalLight')} value={doc.lighting.globalLight}
          onChange={(v) => editor.mutate('Lighting', (d) => { d.lighting.globalLight = v; })} />
        <Slider label={t('map.darkness')} value={doc.lighting.darkness} min={0} max={1} step={0.05}
          onChange={(v) => editor.mutate('Lighting', (d) => { d.lighting.darkness = v; })} />
        <Toggle label={t('map.previewLighting')} value={editor.view.showLightingPreview}
          onChange={(v) => editor.setView({ showLightingPreview: v })} />
      </Section>

      <Section title={t('map.overlays')}>
        <Toggle label={t('map.showGrid')} value={editor.view.showGrid} onChange={(v) => editor.setView({ showGrid: v })} />
        <Toggle label={t('map.showWalls')} value={editor.view.showWalls} onChange={(v) => editor.setView({ showWalls: v })} />
        <Toggle label={t('map.showLights')} value={editor.view.showLights} onChange={(v) => editor.setView({ showLights: v })} />
        <Toggle label={t('map.showNotes')} value={editor.view.showNotes} onChange={(v) => editor.setView({ showNotes: v })} />
      </Section>

      <Section title={t('map.vttContents')}>
        <table className="shortcut-table">
          <tbody>
            <tr><td>{t('map.walls')}</td><td>{wallCount - doorCount}</td></tr>
            <tr><td>{t('map.doors')}</td><td>{doorCount}</td></tr>
            <tr><td>{t('map.lights')}</td><td>{lightCount}</td></tr>
            <tr><td>{t('map.notes')}</td><td>{noteCount}</td></tr>
            <tr><td>{t('map.objects')}</td><td>{objectCount}</td></tr>
          </tbody>
        </table>
        <p className="hint" style={{ marginTop: 8 }}>
          {t('map.vttHint')}
        </p>
      </Section>
    </>
  );
}
