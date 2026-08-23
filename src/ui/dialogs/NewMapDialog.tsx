/** "New map" — pick a kind, size and palette, or jump straight to a generator. */
import React from 'react';
import { Modal, NumberField, SelectField, TextField } from '../components/controls';
import { MAP_KINDS, type MapKind } from '../../core/types';
import { PALETTES } from '../../core/color';
import { createDocument } from '../../core/doc';
import { useEditor } from '../useEditor';
import { useLang } from '../../i18n/useLang';
import { mapKindLabel, mapKindBlurb, paletteName } from '../../i18n/display';

export function NewMapDialog({ onClose, onGenerate, onImport }: { onClose: () => void; onGenerate: (kind: MapKind) => void; onImport: () => void }) {
  const editor = useEditor();
  const { t } = useLang();
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
    editor.status(t('dlg.new.created'));
    onClose();
  };

  return (
    <Modal
      title={t('dlg.new.title')}
      onClose={onClose}
      footer={
        <>
          <span className="grow hint">
            {mapKindBlurb(info.kind)}
          </span>
          <button className="btn" onClick={onClose}>{t('action.cancel')}</button>
          <button className="btn" onClick={onImport}>{t('dlg.new.import')}</button>
          <button className="btn" onClick={() => { onGenerate(kind); }}>{t('dlg.new.generate')}</button>
          <button className="btn primary" onClick={create}>{t('dlg.new.create')}</button>
        </>
      }
    >
      <div className="card-grid" style={{ marginBottom: 18 }}>
        {MAP_KINDS.map((k) => (
          <div key={k.kind} className={`card ${kind === k.kind ? 'active' : ''}`} onClick={() => setKind(k.kind)}>
            <h4>{mapKindLabel(k.kind)}</h4>
            <p>{mapKindBlurb(k.kind)}</p>
          </div>
        ))}
      </div>

      <div className="grid-3">
        <NumberField label={t('field.width')} value={width} min={128} max={12000} step={16} onChange={setWidth} suffix="px" />
        <NumberField label={t('field.height')} value={height} min={128} max={12000} step={16} onChange={setHeight} suffix="px" />
        <SelectField label={t('field.palette')} value={paletteId}
          options={PALETTES.map((p) => ({ value: p.id, label: paletteName(p.id, p.name) }))} onChange={setPaletteId} />
      </div>
      <TextField label={t('field.title')} value={title}
        placeholder={t('dlg.new.titlePlaceholder', { kind: mapKindLabel(info.kind) })} onChange={setTitle} />

      <p className="hint">
        {info.defaultGrid !== 'none'
          ? t('dlg.new.gridDefault', {
            cell: info.defaultCell, units: info.defaultUnits, unit: info.defaultUnitLabel,
          })
          : t('dlg.new.noGrid')}
        {t('dlg.new.changeLater')}
      </p>
    </Modal>
  );
}
