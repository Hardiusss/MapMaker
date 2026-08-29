/** Layer stack: visibility, ordering, blending and per-layer actions. */
import React from 'react';
import { useEditorEvents } from './useEditor';
import type { Layer } from '../core/types';
import { BLEND_MODES } from '../core/types';
import { Section, Slider, SelectField, TextField, Toggle } from './components/controls';
import { useLang } from '../i18n/useLang';
import { layerName } from '../i18n/display';
import {
  IconEye, IconEyeOff, IconLock, IconPlus, IconTrash, IconCopy,
  IconUp, IconDown, IconMerge, IconImage, IconLayers,
} from './components/Icons';

const KIND_KEY: Record<Layer['kind'], string> = {
  raster: 'layerkind.raster', object: 'layerkind.object', wall: 'layerkind.wall',
  light: 'layerkind.light', note: 'layerkind.note',
};

export function LayerPanel() {
  const editor = useEditorEvents('change');
  const { t } = useLang();
  const doc = editor.doc;
  const active = editor.activeLayer;

  return (
    <>
      <Section
        title={t('panel.layers')}
        action={
          <span style={{ display: 'flex', gap: 3 }}>
            <button className="btn ghost icon small" title={t('panel.newRasterLayer')}
              onClick={() => editor.addLayer('raster')}><IconImage size={14} /></button>
            <button className="btn ghost icon small" title={t('panel.newObjectLayer')}
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
                title={layer.visible ? t('panel.hide') : t('panel.show')}
              >
                {layer.visible ? <IconEye size={14} /> : <IconEyeOff size={14} />}
              </span>
              <span className="name" title={layerName(layer.name)}>{layerName(layer.name)}</span>
              {layer.locked && <IconLock size={12} />}
              {layer.gmOnly && <span className="pill" title={t('panel.gmExcluded')}>{t('panel.gm')}</span>}
              <span className="kind">{t(KIND_KEY[layer.kind])}</span>
            </div>
          ))}
        </div>
      </Section>

      {active && (
        <Section title={`“${layerName(active.name)}”`}>
          {/* Shows the display name, but typing writes the raw string: a rename
              is meant to replace the default, not to edit a translation of it. */}
          <TextField label={t('panel.name')} value={layerName(active.name)}
            onChange={(v) => editor.updateLayer(active.id, { name: v })} />

          <Slider label={t('field.opacity')} value={active.opacity} min={0} max={1} step={0.01}
            onChange={(v) => editor.updateLayer(active.id, { opacity: v })}
            format={(v) => `${Math.round(v * 100)}%`} />

          <SelectField label={t('panel.blendMode')} value={active.blend}
            options={BLEND_MODES.map((b) => ({ value: b, label: b }))}
            onChange={(v) => editor.updateLayer(active.id, { blend: v })} />

          <Toggle label={t('panel.locked')} value={active.locked}
            onChange={(v) => editor.updateLayer(active.id, { locked: v })} />

          {active.kind === 'raster' && (
            <Toggle label={t('panel.clipToBelow')} value={active.clipToBelow}
              onChange={(v) => editor.updateLayer(active.id, { clipToBelow: v } as Partial<Layer>)} />
          )}

          <Toggle label={t('panel.gmOnly')} title={t('panel.gmOnlyHint')} value={!!active.gmOnly}
            onChange={(v) => editor.updateLayer(active.id, { gmOnly: v } as Partial<Layer>)} />

          <Toggle label={t('panel.solo')} value={editor.view.soloLayerId === active.id}
            onChange={(v) => editor.setView({ soloLayerId: v ? active.id : null })} />

          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <button className="btn small" title={t('panel.moveUp')} onClick={() => editor.moveLayer(active.id, 1)}><IconUp size={13} /></button>
            <button className="btn small" title={t('panel.moveDown')} onClick={() => editor.moveLayer(active.id, -1)}><IconDown size={13} /></button>
            <button className="btn small" title={t('panel.duplicate')} onClick={() => editor.duplicateLayer(active.id)}><IconCopy size={13} /></button>
            <button className="btn small" title={t('panel.mergeDown')} onClick={() => editor.mergeLayerDown(active.id)}><IconMerge size={13} /></button>
            <button className="btn small" onClick={() => editor.clearLayer(active.id)}>{t('panel.clear')}</button>
            <button className="btn small danger" title={t('panel.deleteLayer')} onClick={() => editor.removeLayer(active.id)}><IconTrash size={13} /></button>
          </div>
        </Section>
      )}
    </>
  );
}
