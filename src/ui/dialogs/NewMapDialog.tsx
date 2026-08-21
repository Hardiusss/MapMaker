/** "New map" — pick a kind, size and palette, or jump straight to a generator. */
import React from 'react';
import { Modal, NumberField, SelectField, TextField } from '../components/controls';
import { MAP_KINDS, type MapKind } from '../../core/types';
import { PALETTES } from '../../core/color';
import { createDocument } from '../../core/doc';
import { useEditor } from '../useEditor';

export function NewMapDialog({ onClose, onGenerate, onImport }: { onClose: () => void; onGenerate: (kind: MapKind) => void; onImport: () => void }) {
  const editor = useEditor();
  const [kind, setKind] = React.useState<MapKind>('region');
  const info = MAP_KINDS.find((k) => k.kind === kind)!;
  const [width, setWidth] = React.useState(info.defaultSize.w);
  const [height, setHeight] = React.useState(info.defaultSize.h);
  const [title, setTitle] = React.useState('');
  const [paletteId, setPaletteId] = React.useState(editor.paletteId);

  React.useEffect(() => {
    setWidth(info.defaultSize.w);
    setHeight(info.defaultSize.h);
  }, [kind]);

  const create = () => {
    const doc = createDocument({ kind, width, height, title: title || undefined, paletteId });
    editor.setPalette(paletteId);
    editor.setDocument(doc);
    editor.status('New map created.');
    onClose();
  };

  return (
    <Modal
      title="New Map"
      onClose={onClose}
      footer={
        <>
          <span className="grow hint">
            {info.blurb}
          </span>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={onImport}>Import an image…</button>
          <button className="btn" onClick={() => { onGenerate(kind); }}>Generate one instead…</button>
          <button className="btn primary" onClick={create}>Create blank</button>
        </>
      }
    >
      <div className="card-grid" style={{ marginBottom: 18 }}>
        {MAP_KINDS.map((k) => (
          <div key={k.kind} className={`card ${kind === k.kind ? 'active' : ''}`} onClick={() => setKind(k.kind)}>
            <h4>{k.label}</h4>
            <p>{k.blurb}</p>
          </div>
        ))}
      </div>

      <div className="grid-3">
        <NumberField label="Width" value={width} min={128} max={12000} step={16} onChange={setWidth} suffix="px" />
        <NumberField label="Height" value={height} min={128} max={12000} step={16} onChange={setHeight} suffix="px" />
        <SelectField label="Palette" value={paletteId}
          options={PALETTES.map((p) => ({ value: p.id, label: p.name }))} onChange={setPaletteId} />
      </div>
      <TextField label="Title" value={title} placeholder={`${info.label} Map`} onChange={setTitle} />

      <p className="hint">
        {info.defaultGrid !== 'none'
          ? `Default grid: ${info.defaultCell} px per cell = ${info.defaultUnits} ${info.defaultUnitLabel}. `
          : 'No grid by default — regional maps read better without one. '}
        You can change all of this later in the Map tab.
      </p>
    </Modal>
  );
}
