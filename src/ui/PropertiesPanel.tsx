/** Inspector for the current selection. */
import React from 'react';
import { useEditorEvents } from './useEditor';
import type { MapObject, StampObject, TextObject, ShapeObject, PathObject, TokenObject } from '../core/types';
import { BLEND_MODES } from '../core/types';
import { Section, Slider, NumberField, TextField, TextArea, SelectField, Toggle, ColorField } from './components/controls';
import { MAP_FONTS } from '../core/factories';
import { TEXTURES } from '../render/textures';
import { assetById, ASSET_GROUPS } from '../assets/library';

export function PropertiesPanel() {
  const editor = useEditorEvents('selection', 'change');
  const objects = editor.selectedObjects;

  if (!objects.length) {
    return (
      <div className="empty">
        Nothing selected.<br />
        Pick the <strong>Select</strong> tool and click something on the map,
        or drag a box around several objects.
      </div>
    );
  }

  const first = objects[0];
  const ids = objects.map((o) => o.id);
  const patch = (fn: (o: MapObject) => Partial<MapObject>, label?: string) => editor.updateObjects(ids, fn, label);

  return (
    <>
      <Section title={objects.length > 1 ? `${objects.length} objects` : first.name || first.kind}>
        <div className="grid-2">
          <NumberField label="X" value={Math.round(first.x)} onChange={(v) => patch((o) => ({ x: v }), 'Move')} />
          <NumberField label="Y" value={Math.round(first.y)} onChange={(v) => patch((o) => ({ y: v }), 'Move')} />
        </div>
        <Slider label="Rotation" value={first.rotation} min={-180} max={180} step={1}
          onChange={(v) => patch(() => ({ rotation: v }), 'Rotate')} format={(v) => `${Math.round(v)}°`} />
        <div className="grid-2">
          <NumberField label="Scale X" value={+first.scaleX.toFixed(3)} step={0.05}
            onChange={(v) => patch(() => ({ scaleX: v || 0.01 }), 'Scale')} />
          <NumberField label="Scale Y" value={+first.scaleY.toFixed(3)} step={0.05}
            onChange={(v) => patch(() => ({ scaleY: v || 0.01 }), 'Scale')} />
        </div>
        <Slider label="Opacity" value={first.opacity} min={0} max={1} step={0.01}
          onChange={(v) => patch(() => ({ opacity: v }), 'Opacity')} format={(v) => `${Math.round(v * 100)}%`} />
        <SelectField label="Blend" value={first.blend}
          options={BLEND_MODES.map((b) => ({ value: b, label: b }))}
          onChange={(v) => patch(() => ({ blend: v }), 'Blend')} />
        <Toggle label="Locked" value={first.locked} onChange={(v) => patch(() => ({ locked: v }))} />
        <Toggle label="Drop shadow" value={!!first.shadow}
          onChange={(v) => patch(() => ({ shadow: v ? { color: 'rgba(0,0,0,0.45)', blur: 18, dx: 6, dy: 8 } : null }))} />
        {first.shadow && (
          <>
            <Slider label="Shadow blur" value={first.shadow.blur} min={0} max={90}
              onChange={(v) => patch((o) => ({ shadow: { ...o.shadow!, blur: v } }))} />
            <div className="grid-2">
              <NumberField label="Shadow X" value={first.shadow.dx} onChange={(v) => patch((o) => ({ shadow: { ...o.shadow!, dx: v } }))} />
              <NumberField label="Shadow Y" value={first.shadow.dy} onChange={(v) => patch((o) => ({ shadow: { ...o.shadow!, dy: v } }))} />
            </div>
          </>
        )}
      </Section>

      {first.kind === 'stamp' && <StampProps object={first as StampObject} patch={patch} />}
      {first.kind === 'text' && <TextProps object={first as TextObject} patch={patch} />}
      {first.kind === 'shape' && <ShapeProps object={first as ShapeObject} patch={patch} />}
      {first.kind === 'path' && <PathProps object={first as PathObject} patch={patch} />}
      {first.kind === 'token' && <TokenProps object={first as TokenObject} patch={patch} />}

      <Section title="GM note">
        <TextArea label="Attached note" value={first.note || ''} rows={3}
          onChange={(v) => patch(() => ({ note: v }))} />
      </Section>
    </>
  );
}

type Patch = (fn: (o: MapObject) => Partial<MapObject>, label?: string) => void;

function StampProps({ object, patch }: { object: StampObject; patch: Patch }) {
  const def = assetById(object.assetId);
  return (
    <Section title="Stamp">
      <p className="hint" style={{ marginTop: -4, marginBottom: 8 }}>
        {def ? `${def.label} · ${def.group}` : object.assetId}
      </p>
      <div className="grid-2">
        <NumberField label="Width" value={Math.round(object.width)}
          onChange={(v) => patch((o) => {
            const s = o as StampObject;
            const ratio = s.height / Math.max(1, s.width);
            return { width: v, height: Math.round(v * ratio) };
          }, 'Resize')} />
        <NumberField label="Height" value={Math.round(object.height)}
          onChange={(v) => patch(() => ({ height: v }), 'Resize')} />
      </div>
      <NumberField label="Variant seed" value={object.seed} onChange={(v) => patch(() => ({ seed: Math.round(v) }), 'Reseed')} />
      <button className="btn small" style={{ width: '100%', marginBottom: 8 }}
        onClick={() => patch(() => ({ seed: Math.floor(Math.random() * 1e6) }), 'Reseed')}>
        Reroll appearance
      </button>
      <Toggle label="Recolour" value={!!object.tint} onChange={(v) => patch(() => ({ tint: v ? '#8a4a3a' : null }))} />
      {object.tint && (
        <>
          <ColorField label="Tint" value={object.tint} onChange={(v) => patch(() => ({ tint: v }))} />
          <Slider label="Tint strength" value={object.tintStrength} min={0} max={1} step={0.05}
            onChange={(v) => patch(() => ({ tintStrength: v }))} />
        </>
      )}
    </Section>
  );
}

function TextProps({ object, patch }: { object: TextObject; patch: Patch }) {
  return (
    <Section title="Label">
      <TextArea label="Text" value={object.text} rows={2} onChange={(v) => patch(() => ({ text: v }), 'Edit text')} />
      <SelectField label="Font" value={object.font}
        options={MAP_FONTS.map((f) => ({ value: f, label: f.split(',')[0].replace(/"/g, '') }))}
        onChange={(v) => patch(() => ({ font: v }))} />
      <NumberField label="Size" value={object.size} min={4} max={500} onChange={(v) => patch(() => ({ size: v }))} />
      <ColorField label="Colour" value={object.color} onChange={(v) => patch(() => ({ color: v }))} />
      <ColorField label="Halo" value={object.strokeColor} onChange={(v) => patch(() => ({ strokeColor: v }))} />
      <Slider label="Halo width" value={object.strokeWidth} min={0} max={30} step={0.5}
        onChange={(v) => patch(() => ({ strokeWidth: v }))} />
      <Slider label="Letter spacing" value={object.letterSpacing} min={-10} max={60} step={0.5}
        onChange={(v) => patch(() => ({ letterSpacing: v }))} />
      <Slider label="Line height" value={object.lineHeight} min={0.7} max={2.6} step={0.05}
        onChange={(v) => patch(() => ({ lineHeight: v }))} />
      <div className="field-row">
        <label>Style</label>
        <button className={`btn small ${object.bold ? 'active' : ''}`} onClick={() => patch((o) => ({ bold: !(o as TextObject).bold }))}>B</button>
        <button className={`btn small ${object.italic ? 'active' : ''}`} onClick={() => patch((o) => ({ italic: !(o as TextObject).italic }))}>I</button>
      </div>
      <SelectField label="Curve" value={object.curve}
        options={[
          { value: 'straight', label: 'Straight' },
          { value: 'arcUp', label: 'Arc up' },
          { value: 'arcDown', label: 'Arc down' },
        ] as { value: TextObject['curve']; label: string }[]}
        onChange={(v) => patch(() => ({ curve: v }))} />
      {object.curve !== 'straight' && (
        <Slider label="Curve radius" value={object.curveRadius} min={40} max={3000} step={10}
          onChange={(v) => patch(() => ({ curveRadius: v }))} />
      )}
      <SelectField label="Banner" value={object.banner || 'none'}
        options={[
          { value: 'none', label: 'None' },
          { value: 'plaque', label: 'Plaque' },
          { value: 'scroll', label: 'Scroll' },
          { value: 'underline', label: 'Underline' },
        ] as { value: NonNullable<TextObject['banner']>; label: string }[]}
        onChange={(v) => patch(() => ({ banner: v }))} />
    </Section>
  );
}

function ShapeProps({ object, patch }: { object: ShapeObject; patch: Patch }) {
  return (
    <Section title="Shape">
      <div className="grid-2">
        <NumberField label="Width" value={Math.round(object.w)} onChange={(v) => patch(() => ({ w: v }))} />
        <NumberField label="Height" value={Math.round(object.h)} onChange={(v) => patch(() => ({ h: v }))} />
      </div>
      {(object.shape === 'polygon' || object.shape === 'star') && (
        <NumberField label="Sides" value={object.sides} min={3} max={24} onChange={(v) => patch(() => ({ sides: Math.round(v) }))} />
      )}
      {object.shape === 'rect' && (
        <Slider label="Corner radius" value={object.cornerRadius} min={0} max={200}
          onChange={(v) => patch(() => ({ cornerRadius: v }))} />
      )}
      <SelectField label="Fill type" value={object.fill.type}
        options={[
          { value: 'solid', label: 'Solid' },
          { value: 'texture', label: 'Texture' },
          { value: 'linear', label: 'Linear gradient' },
          { value: 'radial', label: 'Radial gradient' },
          { value: 'none', label: 'None' },
        ] as { value: ShapeObject['fill']['type']; label: string }[]}
        onChange={(v) => patch((o) => ({ fill: { ...(o as ShapeObject).fill, type: v } }))} />
      {object.fill.type !== 'none' && (
        <ColorField label="Fill colour" value={object.fill.color}
          onChange={(v) => patch((o) => ({ fill: { ...(o as ShapeObject).fill, color: v } }))} />
      )}
      {object.fill.type === 'texture' && (
        <SelectField label="Texture" value={object.fill.textureId || 'grass'}
          options={TEXTURES.map((t) => ({ value: t.id, label: t.label }))}
          onChange={(v) => patch((o) => ({ fill: { ...(o as ShapeObject).fill, textureId: v } }))} />
      )}
      <ColorField label="Stroke" value={object.strokeColor} onChange={(v) => patch(() => ({ strokeColor: v }))} />
      <Slider label="Stroke width" value={object.strokeWidth} min={0} max={40} step={0.5}
        onChange={(v) => patch(() => ({ strokeWidth: v }))} />
    </Section>
  );
}

function PathProps({ object, patch }: { object: PathObject; patch: Patch }) {
  return (
    <Section title="Path">
      <SelectField label="Style" value={object.style}
        options={[
          { value: 'river', label: 'River' }, { value: 'road', label: 'Road' },
          { value: 'trail', label: 'Trail' }, { value: 'border', label: 'Border' },
          { value: 'wall', label: 'Wall' }, { value: 'ridge', label: 'Ridge' },
          { value: 'custom', label: 'Custom' },
        ] as { value: PathObject['style']; label: string }[]}
        onChange={(v) => patch(() => ({ style: v }))} />
      <Slider label="Width" value={object.width} min={0.5} max={120} step={0.5} onChange={(v) => patch(() => ({ width: v }))} />
      <Slider label="Taper" value={object.taper} min={0} max={1} step={0.02} onChange={(v) => patch(() => ({ taper: v }))} />
      <Slider label="Wobble" value={object.jitter} min={0} max={16} step={0.1} onChange={(v) => patch(() => ({ jitter: v }))} />
      <Slider label="Smoothing" value={object.smoothing} min={0} max={2} step={0.05} onChange={(v) => patch(() => ({ smoothing: v }))} />
      <ColorField label="Colour" value={object.color} onChange={(v) => patch(() => ({ color: v }))} />
      <ColorField label="Second colour" value={object.color2} onChange={(v) => patch(() => ({ color2: v }))} />
      <ColorField label="Outline" value={object.outlineColor} onChange={(v) => patch(() => ({ outlineColor: v }))} />
      <Slider label="Outline width" value={object.outlineWidth} min={0} max={30} step={0.5}
        onChange={(v) => patch(() => ({ outlineWidth: v }))} />
      <Toggle label="Closed loop" value={object.closed} onChange={(v) => patch(() => ({ closed: v }))} />
      <p className="hint">{object.nodes.length} node{object.nodes.length === 1 ? '' : 's'}</p>
    </Section>
  );
}

function TokenProps({ object, patch }: { object: TokenObject; patch: Patch }) {
  return (
    <Section title="Token">
      <TextField label="Label" value={object.label} onChange={(v) => patch(() => ({ label: v }))} />
      <NumberField label="Size (cells)" value={object.cells} min={0.5} max={8} step={0.5}
        onChange={(v) => patch(() => ({ cells: v }))} />
      <ColorField label="Colour" value={object.color} onChange={(v) => patch(() => ({ color: v }))} />
      <SelectField label="Disposition" value={object.disposition}
        options={[
          { value: 'friendly', label: 'Friendly' }, { value: 'neutral', label: 'Neutral' },
          { value: 'hostile', label: 'Hostile' }, { value: 'secret', label: 'Secret' },
        ] as { value: TokenObject['disposition']; label: string }[]}
        onChange={(v) => patch(() => ({ disposition: v }))} />
      <SelectField label="Shape" value={object.shape}
        options={[{ value: 'circle', label: 'Circle' }, { value: 'square', label: 'Square' }] as { value: TokenObject['shape']; label: string }[]}
        onChange={(v) => patch(() => ({ shape: v }))} />
    </Section>
  );
}
