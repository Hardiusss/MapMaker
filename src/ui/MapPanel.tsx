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

export function MapPanel() {
  const editor = useEditorEvents('change', 'view');
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
      <Section title="Map">
        <TextField label="Title" value={doc.meta.title}
          onChange={(v) => editor.mutate('Rename', (d) => { d.meta.title = v; })} />
        <TextArea label="Description" rows={3} value={doc.meta.description}
          onChange={(v) => editor.mutate('Describe', (d) => { d.meta.description = v; })} />
        {doc.meta.seed !== undefined && <p className="hint">Generator seed: <code>{doc.meta.seed}</code></p>}
      </Section>

      <Section title="Canvas">
        <div className="grid-2">
          <NumberField label="Width" value={w} min={64} max={12000} step={16} onChange={setW} />
          <NumberField label="Height" value={h} min={64} max={12000} step={16} onChange={setH} />
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          <button className="btn small" style={{ flex: 1 }} disabled={w === doc.width && h === doc.height}
            onClick={() => editor.mutate('Resize canvas', (d) => resizeDocument(d, w, h, 'topleft'))}>
            Resize (anchor top-left)
          </button>
          <button className="btn small" style={{ flex: 1 }} disabled={w === doc.width && h === doc.height}
            onClick={() => editor.mutate('Resize canvas', (d) => resizeDocument(d, w, h, 'center'))}>
            Resize (centred)
          </button>
        </div>
        <p className="hint" style={{ marginTop: 6 }}>
          {Math.round(doc.width / Math.max(1, doc.grid.size))} × {Math.round(doc.height / Math.max(1, doc.grid.size))} cells
          {doc.grid.type !== 'none' && ` · ${(doc.width / Math.max(1, doc.grid.size) * doc.grid.unitsPerCell).toFixed(0)} × ${(doc.height / Math.max(1, doc.grid.size) * doc.grid.unitsPerCell).toFixed(0)} ${doc.grid.unitLabel}`}
        </p>
      </Section>

      <Section title="Grid">
        <SelectField label="Type" value={doc.grid.type}
          options={[
            { value: 'none', label: 'None' },
            { value: 'square', label: 'Square' },
            { value: 'hexPointy', label: 'Hex (pointy top)' },
            { value: 'hexFlat', label: 'Hex (flat top)' },
            { value: 'isometric', label: 'Isometric' },
          ] as { value: GridType; label: string }[]}
          onChange={(v) => setGrid({ type: v, visible: v !== 'none' })} />
        <NumberField label="Cell size" value={Math.round(doc.grid.size)} min={4} max={600} suffix="px"
          onChange={(v) => setGrid({ size: v })} />
        <div className="grid-2">
          <NumberField label="Units / cell" value={doc.grid.unitsPerCell} min={0.1} step={0.5}
            onChange={(v) => setGrid({ unitsPerCell: v })} />
          <TextField label="Unit label" value={doc.grid.unitLabel} onChange={(v) => setGrid({ unitLabel: v })} />
        </div>
        <div className="grid-2">
          <NumberField label="Offset X" value={doc.grid.offsetX} onChange={(v) => setGrid({ offsetX: v })} />
          <NumberField label="Offset Y" value={doc.grid.offsetY} onChange={(v) => setGrid({ offsetY: v })} />
        </div>
        <ColorField label="Colour" value={doc.grid.color} onChange={(v) => setGrid({ color: v })} />
        <Slider label="Opacity" value={doc.grid.opacity} min={0} max={1} step={0.02}
          onChange={(v) => setGrid({ opacity: v })} format={(v) => `${Math.round(v * 100)}%`} />
        <NumberField label="Heavy line every" value={doc.grid.majorEvery} min={0} max={20}
          onChange={(v) => setGrid({ majorEvery: Math.round(v) })} />
        <Toggle label="Visible" value={doc.grid.visible} onChange={(v) => setGrid({ visible: v })} />
        <Toggle label="Snap to grid" value={doc.grid.snap} onChange={(v) => setGrid({ snap: v })} />
      </Section>

      <Section title="Palette">
        <SelectField label="Colour scheme" value={editor.paletteId}
          options={PALETTES.map((p) => ({ value: p.id, label: p.name }))}
          onChange={(v) => {
            editor.setPalette(v);
            clearTextureCache();
            clearAssetCache();
            clearPreviewCache();
            editor.emitChange();
          }} />
        <p className="hint">{PALETTES.find((p) => p.id === editor.paletteId)?.blurb}</p>
        <SelectField label="Background" value={doc.background.textureId || '—'}
          options={[{ value: '—', label: 'Solid colour' }, ...TEXTURES.map((t) => ({ value: t.id, label: t.label }))]}
          onChange={(v) => editor.mutate('Background', (d) => {
            d.background = v === '—'
              ? { type: 'solid', color: d.background.color }
              : { type: 'texture', color: d.background.color, textureId: v, textureScale: d.background.textureScale ?? 1 };
          })} />
        {doc.background.type === 'solid' && (
          <ColorField label="Background colour" value={doc.background.color}
            onChange={(v) => editor.mutate('Background', (d) => { d.background = { ...d.background, color: v }; })} />
        )}
      </Section>

      <Section title="Lighting (VTT)">
        <Toggle label="Global illumination" value={doc.lighting.globalLight}
          onChange={(v) => editor.mutate('Lighting', (d) => { d.lighting.globalLight = v; })} />
        <Slider label="Scene darkness" value={doc.lighting.darkness} min={0} max={1} step={0.05}
          onChange={(v) => editor.mutate('Lighting', (d) => { d.lighting.darkness = v; })} />
        <Toggle label="Preview lighting in editor" value={editor.view.showLightingPreview}
          onChange={(v) => editor.setView({ showLightingPreview: v })} />
      </Section>

      <Section title="Overlays">
        <Toggle label="Show grid" value={editor.view.showGrid} onChange={(v) => editor.setView({ showGrid: v })} />
        <Toggle label="Show walls" value={editor.view.showWalls} onChange={(v) => editor.setView({ showWalls: v })} />
        <Toggle label="Show lights" value={editor.view.showLights} onChange={(v) => editor.setView({ showLights: v })} />
        <Toggle label="Show notes" value={editor.view.showNotes} onChange={(v) => editor.setView({ showNotes: v })} />
      </Section>

      <Section title="VTT contents">
        <table className="shortcut-table">
          <tbody>
            <tr><td>Walls</td><td>{wallCount - doorCount}</td></tr>
            <tr><td>Doors</td><td>{doorCount}</td></tr>
            <tr><td>Lights</td><td>{lightCount}</td></tr>
            <tr><td>Notes</td><td>{noteCount}</td></tr>
            <tr><td>Objects</td><td>{objectCount}</td></tr>
          </tbody>
        </table>
        <p className="hint" style={{ marginTop: 8 }}>
          These travel with the Foundry and Universal VTT exports.
        </p>
      </Section>
    </>
  );
}
