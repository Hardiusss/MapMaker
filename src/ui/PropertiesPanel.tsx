/** Inspector for the current selection. */
import React from 'react';
import { useEditorEvents } from './useEditor';
import type { MapObject, StampObject, TextObject, ShapeObject, PathObject, TokenObject } from '../core/types';
import { BLEND_MODES } from '../core/types';
import { Section, Slider, NumberField, TextField, TextArea, SelectField, Toggle, ColorField } from './components/controls';
import { MAP_FONTS } from '../core/factories';
import { TEXTURES } from '../render/textures';
import { assetById, ASSET_GROUPS } from '../assets/library';
import { useLang } from '../i18n/useLang';
import { t } from '../i18n';
import { plural } from '../i18n/plural';
import { textureLabel } from '../i18n/display';

export function PropertiesPanel() {
  const editor = useEditorEvents('selection', 'change');
  useLang();
  const objects = editor.selectedObjects;

  if (!objects.length) {
    return (
      <div className="empty">
        {t('props.empty')}<br />
        {t('props.emptyHint', { tool: t('tool.select') })}
      </div>
    );
  }

  const first = objects[0];
  const ids = objects.map((o) => o.id);
  const patch = (fn: (o: MapObject) => Partial<MapObject>, label?: string) => editor.updateObjects(ids, fn, label);

  return (
    <>
      <Section title={objects.length > 1 ? t('props.nObjects', { objects: plural('count.objects', objects.length) }) : first.name || first.kind}>
        <div className="grid-2">
          <NumberField label="X" value={Math.round(first.x)} onChange={(v) => patch((o) => ({ x: v }), 'Move')} />
          <NumberField label="Y" value={Math.round(first.y)} onChange={(v) => patch((o) => ({ y: v }), 'Move')} />
        </div>
        <Slider label={t('field.rotation')} value={first.rotation} min={-180} max={180} step={1}
          onChange={(v) => patch(() => ({ rotation: v }), 'Rotate')} format={(v) => `${Math.round(v)}°`} />
        <div className="grid-2">
          <NumberField label={t('props.scaleX')} value={+first.scaleX.toFixed(3)} step={0.05}
            onChange={(v) => patch(() => ({ scaleX: v || 0.01 }), 'Scale')} />
          <NumberField label={t('props.scaleY')} value={+first.scaleY.toFixed(3)} step={0.05}
            onChange={(v) => patch(() => ({ scaleY: v || 0.01 }), 'Scale')} />
        </div>
        <Slider label={t('field.opacity')} value={first.opacity} min={0} max={1} step={0.01}
          onChange={(v) => patch(() => ({ opacity: v }), 'Opacity')} format={(v) => `${Math.round(v * 100)}%`} />
        <SelectField label={t('props.blend')} value={first.blend}
          options={BLEND_MODES.map((b) => ({ value: b, label: b }))}
          onChange={(v) => patch(() => ({ blend: v }), 'Blend')} />
        <Toggle label={t('panel.locked')} value={first.locked} onChange={(v) => patch(() => ({ locked: v }))} />
        <Toggle label={t('props.shadow')} value={!!first.shadow}
          onChange={(v) => patch(() => ({ shadow: v ? { color: 'rgba(0,0,0,0.45)', blur: 18, dx: 6, dy: 8 } : null }))} />
        {first.shadow && (
          <>
            <Slider label={t('props.shadowBlur')} value={first.shadow.blur} min={0} max={90}
              onChange={(v) => patch((o) => ({ shadow: { ...o.shadow!, blur: v } }))} />
            <div className="grid-2">
              <NumberField label={t('props.shadowX')} value={first.shadow.dx} onChange={(v) => patch((o) => ({ shadow: { ...o.shadow!, dx: v } }))} />
              <NumberField label={t('props.shadowY')} value={first.shadow.dy} onChange={(v) => patch((o) => ({ shadow: { ...o.shadow!, dy: v } }))} />
            </div>
          </>
        )}
      </Section>

      {first.kind === 'stamp' && <StampProps object={first as StampObject} patch={patch} />}
      {first.kind === 'text' && <TextProps object={first as TextObject} patch={patch} />}
      {first.kind === 'shape' && <ShapeProps object={first as ShapeObject} patch={patch} />}
      {first.kind === 'path' && <PathProps object={first as PathObject} patch={patch} />}
      {first.kind === 'token' && <TokenProps object={first as TokenObject} patch={patch} />}

      <Section title={t('props.gmNote')}>
        <TextArea label={t('props.attachedNote')} value={first.note || ''} rows={3}
          onChange={(v) => patch(() => ({ note: v }))} />
      </Section>
    </>
  );
}

type Patch = (fn: (o: MapObject) => Partial<MapObject>, label?: string) => void;

function StampProps({ object, patch }: { object: StampObject; patch: Patch }) {
  const def = assetById(object.assetId);
  return (
    <Section title={t('tool.stamp')}>
      <p className="hint" style={{ marginTop: -4, marginBottom: 8 }}>
        {def ? `${def.label} · ${def.group}` : object.assetId}
      </p>
      <div className="grid-2">
        <NumberField label={t('field.width')} value={Math.round(object.width)}
          onChange={(v) => patch((o) => {
            const s = o as StampObject;
            const ratio = s.height / Math.max(1, s.width);
            return { width: v, height: Math.round(v * ratio) };
          }, 'Resize')} />
        <NumberField label={t('field.height')} value={Math.round(object.height)}
          onChange={(v) => patch(() => ({ height: v }), 'Resize')} />
      </div>
      <NumberField label={t('props.variantSeed')} value={object.seed} onChange={(v) => patch(() => ({ seed: Math.round(v) }), 'Reseed')} />
      <button className="btn small" style={{ width: '100%', marginBottom: 8 }}
        onClick={() => patch(() => ({ seed: Math.floor(Math.random() * 1e6) }), 'Reseed')}>
        {t('props.reroll')}
      </button>
      <Toggle label={t('props.recolour')} value={!!object.tint} onChange={(v) => patch(() => ({ tint: v ? '#8a4a3a' : null }))} />
      {object.tint && (
        <>
          <ColorField label={t('props.tint')} value={object.tint} onChange={(v) => patch(() => ({ tint: v }))} />
          <Slider label={t('props.tintStrength')} value={object.tintStrength} min={0} max={1} step={0.05}
            onChange={(v) => patch(() => ({ tintStrength: v }))} />
        </>
      )}
    </Section>
  );
}

function TextProps({ object, patch }: { object: TextObject; patch: Patch }) {
  return (
    <Section title={t('tool.text')}>
      <TextArea label={t('props.text')} value={object.text} rows={2} onChange={(v) => patch(() => ({ text: v }), 'Edit text')} />
      <SelectField label={t('props.font')} value={object.font}
        options={MAP_FONTS.map((f) => ({ value: f, label: f.split(',')[0].replace(/"/g, '') }))}
        onChange={(v) => patch(() => ({ font: v }))} />
      <NumberField label={t('field.size')} value={object.size} min={4} max={500} onChange={(v) => patch(() => ({ size: v }))} />
      <ColorField label={t('field.colour')} value={object.color} onChange={(v) => patch(() => ({ color: v }))} />
      <ColorField label={t('props.halo')} value={object.strokeColor} onChange={(v) => patch(() => ({ strokeColor: v }))} />
      <Slider label={t('props.haloWidth')} value={object.strokeWidth} min={0} max={30} step={0.5}
        onChange={(v) => patch(() => ({ strokeWidth: v }))} />
      <Slider label={t('props.letterSpacing')} value={object.letterSpacing} min={-10} max={60} step={0.5}
        onChange={(v) => patch(() => ({ letterSpacing: v }))} />
      <Slider label={t('props.lineHeight')} value={object.lineHeight} min={0.7} max={2.6} step={0.05}
        onChange={(v) => patch(() => ({ lineHeight: v }))} />
      <div className="field-row">
        <label>{t('props.style')}</label>
        <button className={`btn small ${object.bold ? 'active' : ''}`} onClick={() => patch((o) => ({ bold: !(o as TextObject).bold }))}>B</button>
        <button className={`btn small ${object.italic ? 'active' : ''}`} onClick={() => patch((o) => ({ italic: !(o as TextObject).italic }))}>I</button>
      </div>
      <SelectField label={t('props.curve')} value={object.curve}
        options={[
          { value: 'straight', label: t('curve.straight') },
          { value: 'arcUp', label: t('curve.arcUp') },
          { value: 'arcDown', label: t('curve.arcDown') },
        ] as { value: TextObject['curve']; label: string }[]}
        onChange={(v) => patch(() => ({ curve: v }))} />
      {object.curve !== 'straight' && (
        <Slider label={t('props.curveRadius')} value={object.curveRadius} min={40} max={3000} step={10}
          onChange={(v) => patch(() => ({ curveRadius: v }))} />
      )}
      <SelectField label={t('props.banner')} value={object.banner || 'none'}
        options={[
          { value: 'none', label: t('banner.none') },
          { value: 'plaque', label: t('banner.plaque') },
          { value: 'scroll', label: t('banner.scroll') },
          { value: 'underline', label: t('banner.underline') },
        ] as { value: NonNullable<TextObject['banner']>; label: string }[]}
        onChange={(v) => patch(() => ({ banner: v }))} />
    </Section>
  );
}

function ShapeProps({ object, patch }: { object: ShapeObject; patch: Patch }) {
  return (
    <Section title={t('tool.shape')}>
      <div className="grid-2">
        <NumberField label={t('field.width')} value={Math.round(object.w)} onChange={(v) => patch(() => ({ w: v }))} />
        <NumberField label={t('field.height')} value={Math.round(object.h)} onChange={(v) => patch(() => ({ h: v }))} />
      </div>
      {(object.shape === 'polygon' || object.shape === 'star') && (
        <NumberField label={t('props.sides')} value={object.sides} min={3} max={24} onChange={(v) => patch(() => ({ sides: Math.round(v) }))} />
      )}
      {object.shape === 'rect' && (
        <Slider label={t('props.cornerRadius')} value={object.cornerRadius} min={0} max={200}
          onChange={(v) => patch(() => ({ cornerRadius: v }))} />
      )}
      <SelectField label={t('props.fillType')} value={object.fill.type}
        options={[
          { value: 'solid', label: t('fill.solid') },
          { value: 'texture', label: t('fill.texture') },
          { value: 'linear', label: t('fill.linear') },
          { value: 'radial', label: t('fill.radial') },
          { value: 'none', label: t('fill.none') },
        ] as { value: ShapeObject['fill']['type']; label: string }[]}
        onChange={(v) => patch((o) => ({ fill: { ...(o as ShapeObject).fill, type: v } }))} />
      {object.fill.type !== 'none' && (
        <ColorField label={t('props.fillColour')} value={object.fill.color}
          onChange={(v) => patch((o) => ({ fill: { ...(o as ShapeObject).fill, color: v } }))} />
      )}
      {object.fill.type === 'texture' && (
        <SelectField label={t('props.texture')} value={object.fill.textureId || 'grass'}
          options={TEXTURES.map((tex) => ({ value: tex.id, label: textureLabel(tex.id, tex.label) }))}
          onChange={(v) => patch((o) => ({ fill: { ...(o as ShapeObject).fill, textureId: v } }))} />
      )}
      <ColorField label={t('props.stroke')} value={object.strokeColor} onChange={(v) => patch(() => ({ strokeColor: v }))} />
      <Slider label={t('props.strokeWidth')} value={object.strokeWidth} min={0} max={40} step={0.5}
        onChange={(v) => patch(() => ({ strokeWidth: v }))} />
    </Section>
  );
}

function PathProps({ object, patch }: { object: PathObject; patch: Patch }) {
  return (
    <Section title={t('props.path')}>
      <SelectField label={t('props.style')} value={object.style}
        options={[
          { value: 'river', label: t('path.river') }, { value: 'road', label: t('path.road') },
          { value: 'trail', label: t('path.trail') }, { value: 'border', label: t('path.border') },
          { value: 'wall', label: t('path.wall') }, { value: 'ridge', label: t('path.ridge') },
          { value: 'custom', label: t('path.custom') },
        ] as { value: PathObject['style']; label: string }[]}
        onChange={(v) => patch(() => ({ style: v }))} />
      <Slider label={t('field.width')} value={object.width} min={0.5} max={120} step={0.5} onChange={(v) => patch(() => ({ width: v }))} />
      <Slider label={t('props.taper')} value={object.taper} min={0} max={1} step={0.02} onChange={(v) => patch(() => ({ taper: v }))} />
      <Slider label={t('props.wobble')} value={object.jitter} min={0} max={16} step={0.1} onChange={(v) => patch(() => ({ jitter: v }))} />
      <Slider label={t('props.smoothing')} value={object.smoothing} min={0} max={2} step={0.05} onChange={(v) => patch(() => ({ smoothing: v }))} />
      <ColorField label={t('field.colour')} value={object.color} onChange={(v) => patch(() => ({ color: v }))} />
      <ColorField label={t('props.colour2')} value={object.color2} onChange={(v) => patch(() => ({ color2: v }))} />
      <ColorField label={t('props.outline')} value={object.outlineColor} onChange={(v) => patch(() => ({ outlineColor: v }))} />
      <Slider label={t('props.outlineWidth')} value={object.outlineWidth} min={0} max={30} step={0.5}
        onChange={(v) => patch(() => ({ outlineWidth: v }))} />
      <Toggle label={t('props.closed')} value={object.closed} onChange={(v) => patch(() => ({ closed: v }))} />
      <p className="hint">{t('props.nodes', { nodes: plural('count.nodes', object.nodes.length) })}</p>
    </Section>
  );
}

function TokenProps({ object, patch }: { object: TokenObject; patch: Patch }) {
  return (
    <Section title={t('tool.token')}>
      <TextField label={t('opt.label')} value={object.label} onChange={(v) => patch(() => ({ label: v }))} />
      <NumberField label={t('props.sizeCells')} value={object.cells} min={0.5} max={8} step={0.5}
        onChange={(v) => patch(() => ({ cells: v }))} />
      <ColorField label={t('field.colour')} value={object.color} onChange={(v) => patch(() => ({ color: v }))} />
      <SelectField label={t('props.disposition')} value={object.disposition}
        options={[
          { value: 'friendly', label: t('disp.friendly') }, { value: 'neutral', label: t('disp.neutral') },
          { value: 'hostile', label: t('disp.hostile') }, { value: 'secret', label: t('disp.secret') },
        ] as { value: TokenObject['disposition']; label: string }[]}
        onChange={(v) => patch(() => ({ disposition: v }))} />
      <SelectField label={t('opt.shape')} value={object.shape}
        options={[{ value: 'circle', label: t('shape.circle') }, { value: 'square', label: t('shape.square') }] as { value: TokenObject['shape']; label: string }[]}
        onChange={(v) => patch(() => ({ shape: v }))} />
    </Section>
  );
}
