/** Layer stack: visibility, ordering, blending and per-layer actions. */
import React from 'react';
import { useEditorEvents } from './useEditor';
import type { Layer } from '../core/types';
import { BLEND_MODES } from '../core/types';
import { Section, Slider, SelectField } from './components/controls';
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
          <div className="field">
            <label>{t('panel.name')}</label>
            {/* Shows the display name, but typing writes the raw string: a rename
                is meant to replace the default, not to edit a translation of it. */}
            <input type="text" value={layerName(active.name)}
              onChange={(e) => editor.updateLayer(active.id, { name: e.target.value })} />
          </div>

          <Slider label={t('field.opacity')} value={active.opacity} min={0} max={1} step={0.01}
            onChange={(v) => editor.updateLayer(active.id, { opacity: v })}
            format={(v) => `${Math.round(v * 100)}%`} />

          <SelectField label={t('panel.blendMode')} value={active.blend}
            options={BLEND_MODES.map((b) => ({ value: b, label: b }))}
            onChange={(v) => editor.updateLayer(active.id, { blend: v })} />

          <div className="field-row" style={{ marginBottom: 10 }}>
            <label>{t('panel.locked')}</label>
            <input type="checkbox" checked={active.locked}
              onChange={(e) => editor.updateLayer(active.id, { locked: e.target.checked })} />
          </div>

          {active.kind === 'raster' && (
            <div className="field-row" style={{ marginBottom: 10 }}>
              <label>{t('panel.clipToBelow')}</label>
              <input type="checkbox" checked={active.clipToBelow}
                onChange={(e) => editor.updateLayer(active.id, { clipToBelow: e.target.checked } as Partial<Layer>)} />
            </div>
          )}

          <div className="field-row" style={{ marginBottom: 10 }}>
            <label title={t('panel.gmOnlyHint')}>{t('panel.gmOnly')}</label>
            <input type="checkbox" checked={!!active.gmOnly}
              onChange={(e) => editor.updateLayer(active.id, { gmOnly: e.target.checked } as Partial<Layer>)} />
          </div>

          <div className="field-row" style={{ marginBottom: 10 }}>
            <label>{t('panel.solo')}</label>
            <input type="checkbox" checked={editor.view.soloLayerId === active.id}
              onChange={(e) => editor.setView({ soloLayerId: e.target.checked ? active.id : null })} />
          </div>

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
