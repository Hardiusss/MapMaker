/** Layer stack: visibility, ordering, blending and per-layer actions. */
import React from 'react';
import { useEditorEvents } from './useEditor';
import type { Layer } from '../core/types';
import { BLEND_MODES } from '../core/types';
import { Section, Slider, SelectField } from './components/controls';
import {
  IconEye, IconEyeOff, IconLock, IconPlus, IconTrash, IconCopy,
  IconUp, IconDown, IconMerge, IconImage, IconLayers,
} from './components/Icons';

const KIND_LABEL: Record<Layer['kind'], string> = {
  raster: 'paint', object: 'objects', wall: 'walls', light: 'lights', note: 'notes',
};

export function LayerPanel() {
  const editor = useEditorEvents('change');
  const doc = editor.doc;
  const active = editor.activeLayer;

  return (
    <>
      <Section
        title="Layers"
        action={
          <span style={{ display: 'flex', gap: 3 }}>
            <button className="btn ghost icon small" title="New paint layer"
              onClick={() => editor.addLayer('raster')}><IconImage size={14} /></button>
            <button className="btn ghost icon small" title="New object layer"
              onClick={() => editor.addLayer('object')}><IconPlus size={14} /></button>
          </span>
        }
      >
        <div className="layer-list">
          {doc.layers.map((layer) => (
            <div
              key={layer.id}
              className={`layer-row ${layer.id === doc.activeLayerId ? 'active' : ''}`}
              onClick={() => editor.setActiveLayer(layer.id)}
            >
              <span
                className={`eye ${layer.visible ? 'on' : ''}`}
                onClick={(e) => { e.stopPropagation(); editor.updateLayer(layer.id, { visible: !layer.visible }); }}
                title={layer.visible ? 'Hide' : 'Show'}
              >
                {layer.visible ? <IconEye size={14} /> : <IconEyeOff size={14} />}
              </span>
              <span className="name" title={layer.name}>{layer.name}</span>
              {layer.locked && <IconLock size={12} />}
              {layer.gmOnly && <span className="pill" title="Excluded from player exports">GM</span>}
              <span className="kind">{KIND_LABEL[layer.kind]}</span>
            </div>
          ))}
        </div>
      </Section>

      {active && (
        <Section title={`“${active.name}”`}>
          <div className="field">
            <label>Name</label>
            <input type="text" value={active.name}
              onChange={(e) => editor.updateLayer(active.id, { name: e.target.value })} />
          </div>

          <Slider label="Opacity" value={active.opacity} min={0} max={1} step={0.01}
            onChange={(v) => editor.updateLayer(active.id, { opacity: v })}
            format={(v) => `${Math.round(v * 100)}%`} />

          <SelectField label="Blend mode" value={active.blend}
            options={BLEND_MODES.map((b) => ({ value: b, label: b }))}
            onChange={(v) => editor.updateLayer(active.id, { blend: v })} />

          <div className="field-row" style={{ marginBottom: 10 }}>
            <label>Locked</label>
            <input type="checkbox" checked={active.locked}
              onChange={(e) => editor.updateLayer(active.id, { locked: e.target.checked })} />
          </div>

          {active.kind === 'raster' && (
            <div className="field-row" style={{ marginBottom: 10 }}>
              <label>Clip to layer below</label>
              <input type="checkbox" checked={active.clipToBelow}
                onChange={(e) => editor.updateLayer(active.id, { clipToBelow: e.target.checked } as Partial<Layer>)} />
            </div>
          )}

          <div className="field-row" style={{ marginBottom: 10 }}>
            <label title="Left out of player exports">GM only</label>
            <input type="checkbox" checked={!!active.gmOnly}
              onChange={(e) => editor.updateLayer(active.id, { gmOnly: e.target.checked } as Partial<Layer>)} />
          </div>

          <div className="field-row" style={{ marginBottom: 10 }}>
            <label>Solo (isolate)</label>
            <input type="checkbox" checked={editor.view.soloLayerId === active.id}
              onChange={(e) => editor.setView({ soloLayerId: e.target.checked ? active.id : null })} />
          </div>

          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <button className="btn small" title="Move up" onClick={() => editor.moveLayer(active.id, 1)}><IconUp size={13} /></button>
            <button className="btn small" title="Move down" onClick={() => editor.moveLayer(active.id, -1)}><IconDown size={13} /></button>
            <button className="btn small" title="Duplicate" onClick={() => editor.duplicateLayer(active.id)}><IconCopy size={13} /></button>
            <button className="btn small" title="Merge down" onClick={() => editor.mergeLayerDown(active.id)}><IconMerge size={13} /></button>
            <button className="btn small" onClick={() => editor.clearLayer(active.id)}>Clear</button>
            <button className="btn small danger" title="Delete layer" onClick={() => editor.removeLayer(active.id)}><IconTrash size={13} /></button>
          </div>
        </Section>
      )}
    </>
  );
}
