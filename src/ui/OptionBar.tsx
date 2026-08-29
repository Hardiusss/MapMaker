/** Context strip under the top bar: options for whichever tool is active. */
import React from 'react';
import { useEditorEvents } from './useEditor';
import { BRUSH_PRESETS, type BrushMode } from '../render/brush';
import { fillSettings } from '../tools/paintTools';
import { stampSettings, textSettings, shapeSettings, pathSettings, tokenSettings } from '../tools';
import { wallSettings, lightSettings, LIGHT_PRESETS } from '../tools/vttTools';
import { gridAlignSettings } from '../tools/gridAlignTool';
import { castleSettings } from '../tools/castleTool';
import { useLang } from '../i18n/useLang';
import { assetLabel } from '../i18n/assetNames';
import type { CurtainMaterial, TowerPlacement, TowerShape } from '../gen/castle/curtain';
import { FAMILY_ORDER, materialsByFamily } from '../render/materials';
import { assetById } from '../assets/library';
import { brushPresetLabel, lightPresetLabel } from '../i18n/display';
import { MAP_FONTS } from '../core/factories';
import type { GridConfig, WallKind, ShapeKind, PathStyle } from '../core/types';
import { t } from '../i18n';
import { plural } from '../i18n/plural';

/*
 * Widths on this strip are minimums, never fixed sizes. A select measured to
 * fit "Corners + spacing" clips "Углы и промежутки", and a dropdown that will
 * not show what it is set to is failing at the one thing a dropdown does. The
 * bar scrolls sideways, so letting one grow costs nothing.
 */

/** A caption and the controls it governs. */
function Group({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="opt-group">
      {label && <span className="opt-label">{label}</span>}
      {children}
    </div>
  );
}

function Num({ value, onChange, min, max, step = 1, width = 62, label }: {
  value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number; width?: number;
  /** Only needed where the group's caption is already bound to a slider. */
  label?: string;
}) {
  return (
    <input type="number" style={{ width }} value={value} min={min} max={max} step={step} aria-label={label}
      onChange={(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) onChange(v); }} />
  );
}

/**
 * A slider that says what it is set to.
 *
 * These used to be a bare track under a caption, which told a GM that the
 * brush had a hardness and then refused to say what it was: the only way to
 * read a setting back was to eyeball the handle, and the only way to repeat
 * one tomorrow was to remember where you left it. The readout is most of the
 * reason the control is on the strip at all rather than in a dialog.
 *
 * It owns its own group so the caption can be a real `<label>` bound to the
 * input — a `<span>` beside a range reads as an unnamed control, and clicking
 * the word did nothing. `after` is for the sliders that already have a number
 * box beside them; that box is the readout, so it takes its place.
 */
function Range({ label, value, onChange, min, max, step = 0.01, width = 92, format, after }: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step?: number; width?: number;
  format?: (v: number) => string; after?: React.ReactNode;
}) {
  const id = React.useId();
  // A range that tops out at 1 is a proportion, and proportions read as
  // percentages everywhere else in the app.
  const shown = format ? format(value) : max <= 1
    ? `${Math.round(value * 100)}%`
    : String(Math.round(value * 100) / 100);
  return (
    <div className="opt-group">
      <label className="opt-label" htmlFor={id}>{label}</label>
      <input id={id} type="range" style={{ width, flex: 'none' }} min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))} />
      {after ?? <span className="opt-value">{shown}</span>}
    </div>
  );
}

export function OptionBar({ onOpenAssets }: { onOpenAssets: () => void }) {
  const editor = useEditorEvents('tool', 'brush', 'change', 'selection');
  const { t } = useLang();
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  const tool = editor.tool;

  if (tool === 'brush' || tool === 'eraser') {
    const b = editor.brush;
    return (
      <div className="optionbar">
        <Group label={t('opt.preset')}>
          <select style={{ minWidth: 130 }} value=""
            onChange={(e) => {
              const p = BRUSH_PRESETS.find((x) => x.id === e.target.value);
              if (p) editor.setBrush(p.settings);
            }}>
            <option value="">{t('opt.choose')}</option>
            {BRUSH_PRESETS.map((p) => <option key={p.id} value={p.id}>{brushPresetLabel(p.id, p.label)}</option>)}
          </select>
        </Group>
        <Group label={t('opt.mode')}>
          <select style={{ minWidth: 104 }} value={b.mode}
            onChange={(e) => editor.setBrush({ mode: e.target.value as BrushMode })}>
            <option value="texture">{t('brushmode.texture')}</option>
            <option value="color">{t('brushmode.color')}</option>
            <option value="scatter">{t('brushmode.scatter')}</option>
            <option value="darken">{t('brushmode.darken')}</option>
            <option value="lighten">{t('brushmode.lighten')}</option>
            <option value="erase">{t('brushmode.erase')}</option>
          </select>
          {b.mode === 'color' && (
            <input type="color" value={b.color} onChange={(e) => editor.setBrush({ color: e.target.value })} />
          )}
        </Group>
        <Range label={t('opt.size')} value={b.size} min={2} max={800} step={1}
          onChange={(v) => editor.setBrush({ size: v })}
          after={<Num value={Math.round(b.size)} min={2} max={3000} label={t('opt.size')}
            onChange={(v) => editor.setBrush({ size: v })} />} />
        <Range label={t('opt.hardness')} value={b.hardness} min={0} max={1} onChange={(v) => editor.setBrush({ hardness: v })} />
        <Range label={t('opt.flow')} value={b.flow} min={0.02} max={1} onChange={(v) => editor.setBrush({ flow: v })} />
        <Range label={t('opt.opacity')} value={b.opacity} min={0.02} max={1} onChange={(v) => editor.setBrush({ opacity: v })} />
        <Range label={t('opt.edge')} value={b.edgeNoise} min={0} max={0.8} onChange={(v) => editor.setBrush({ edgeNoise: v })} />
        {b.mode === 'texture' && (
          <Range label={t('opt.textureScale')} value={b.textureScale} min={0.2} max={4} step={0.05}
            format={(v) => `${v.toFixed(2)}×`}
            onChange={(v) => editor.setBrush({ textureScale: v })} width={80} />
        )}
        {b.mode === 'scatter' && (
          <>
            <Group label={t('opt.asset')}>
              <button className="btn small" onClick={onOpenAssets}>
                {(() => { const d = assetById(b.scatterAssetId); return d ? assetLabel(d) : t('opt.choose'); })()}
              </button>
            </Group>
            <Range label={t('opt.density')} value={b.scatterDensity} min={0.1} max={2} step={0.05}
              format={(v) => `${v.toFixed(2)}×`}
              onChange={(v) => editor.setBrush({ scatterDensity: v })} />
          </>
        )}
      </div>
    );
  }

  if (tool === 'stamp') {
    const def = assetById(stampSettings.assetId);
    return (
      <div className="optionbar">
        <Group label={t('opt.asset')}>
          <button className="btn small" onClick={onOpenAssets}>{def ? assetLabel(def) : t('opt.choose')}</button>
        </Group>
        <Range label={t('opt.width')} value={stampSettings.width} min={10} max={900} step={1}
          onChange={(v) => { stampSettings.width = v; force(); }}
          after={<Num value={Math.round(stampSettings.width)} label={t('opt.width')}
            onChange={(v) => { stampSettings.width = v; force(); }} />} />
        <Range label={t('opt.sizeJitter')} value={stampSettings.sizeJitter} min={0} max={0.7}
          onChange={(v) => { stampSettings.sizeJitter = v; force(); }} />
        <Group label={t('opt.rotateJitter')}>
          <Num value={stampSettings.rotationJitter} min={0} max={180} onChange={(v) => { stampSettings.rotationJitter = v; force(); }} />
        </Group>
        <Group>
          <label className="field-row" style={{ margin: 0, gap: 5 }}>
            <input type="checkbox" checked={stampSettings.spray}
              onChange={(e) => { stampSettings.spray = e.target.checked; force(); }} />
            <span style={{ fontSize: 12 }}>{t('opt.spray')}</span>
          </label>
          <label className="field-row" style={{ margin: 0, gap: 5 }}>
            <input type="checkbox" checked={stampSettings.dragToSize}
              onChange={(e) => { stampSettings.dragToSize = e.target.checked; force(); }} />
            <span style={{ fontSize: 12 }}>{t('opt.dragToSize')}</span>
          </label>
        </Group>
        {stampSettings.spray && (
          <Group label={t('opt.spacing')}>
            <Num value={stampSettings.spraySpacing} min={4} max={600} onChange={(v) => { stampSettings.spraySpacing = v; force(); }} />
          </Group>
        )}
      </div>
    );
  }

  if (tool === 'text') {
    return (
      <div className="optionbar">
        <Group label={t('opt.font')}>
          <select style={{ minWidth: 170 }} value={textSettings.font}
            onChange={(e) => { textSettings.font = e.target.value; force(); }}>
            {MAP_FONTS.map((f) => <option key={f} value={f}>{f.split(',')[0].replace(/"/g, '')}</option>)}
          </select>
        </Group>
        <Group label={t('opt.size')}>
          <Num value={textSettings.size} min={6} max={400} onChange={(v) => { textSettings.size = v; force(); }} />
        </Group>
        <Group label={t('opt.colour')}>
          <input type="color" value={textSettings.color} onChange={(e) => { textSettings.color = e.target.value; force(); }} />
        </Group>
        <Group label={t('opt.halo')}>
          <input type="color" value={textSettings.strokeColor} onChange={(e) => { textSettings.strokeColor = e.target.value; force(); }} />
          <Num value={textSettings.strokeWidth} min={0} max={40} onChange={(v) => { textSettings.strokeWidth = v; force(); }} width={54} />
        </Group>
        <Group label={t('opt.tracking')}>
          <Num value={textSettings.letterSpacing} min={-10} max={60} onChange={(v) => { textSettings.letterSpacing = v; force(); }} width={54} />
        </Group>
        <Group label={t('opt.curve')}>
          <select value={textSettings.curve} onChange={(e) => { textSettings.curve = e.target.value as typeof textSettings.curve; force(); }}>
            <option value="straight">{t('curve.straight')}</option>
            <option value="arcUp">{t('curve.arcUp')}</option>
            <option value="arcDown">{t('curve.arcDown')}</option>
          </select>
        </Group>
        <Group>
          <button className={`btn small ${textSettings.bold ? 'active' : ''}`}
            onClick={() => { textSettings.bold = !textSettings.bold; force(); }} style={{ fontWeight: 700 }}>B</button>
          <button className={`btn small ${textSettings.italic ? 'active' : ''}`}
            onClick={() => { textSettings.italic = !textSettings.italic; force(); }} style={{ fontStyle: 'italic' }}>I</button>
        </Group>
      </div>
    );
  }

  if (tool === 'shape') {
    return (
      <div className="optionbar">
        <Group label={t('opt.shape')}>
          <select value={shapeSettings.shape} onChange={(e) => { shapeSettings.shape = e.target.value as ShapeKind; force(); }}>
            <option value="rect">{t('shape.rect')}</option>
            <option value="ellipse">{t('shape.ellipse')}</option>
            <option value="polygon">{t('shape.polygon')}</option>
            <option value="star">{t('shape.star')}</option>
          </select>
          {(shapeSettings.shape === 'polygon' || shapeSettings.shape === 'star') && (
            <Num value={shapeSettings.sides} min={3} max={20} onChange={(v) => { shapeSettings.sides = v; force(); }} width={50} />
          )}
        </Group>
        <Group label={t('opt.fill')}>
          <select value={shapeSettings.fillType}
            onChange={(e) => { shapeSettings.fillType = e.target.value as typeof shapeSettings.fillType; force(); }}>
            <option value="solid">{t('fill.solid')}</option>
            <option value="texture">{t('fill.texture')}</option>
            <option value="none">{t('fill.none')}</option>
          </select>
          {shapeSettings.fillType === 'solid' && (
            <input type="color" value={shapeSettings.fillColor} onChange={(e) => { shapeSettings.fillColor = e.target.value; force(); }} />
          )}
        </Group>
        <Group label={t('opt.stroke')}>
          <input type="color" value={shapeSettings.strokeColor} onChange={(e) => { shapeSettings.strokeColor = e.target.value; force(); }} />
          <Num value={shapeSettings.strokeWidth} min={0} max={40} onChange={(v) => { shapeSettings.strokeWidth = v; force(); }} width={50} />
        </Group>
        <Group label={t('opt.corner')}>
          <Num value={shapeSettings.cornerRadius} min={0} max={200} onChange={(v) => { shapeSettings.cornerRadius = v; force(); }} width={54} />
        </Group>
      </div>
    );
  }

  if (tool === 'path') {
    return (
      <div className="optionbar">
        <Group label={t('opt.style')}>
          <select value={pathSettings.style} onChange={(e) => { pathSettings.style = e.target.value as PathStyle; force(); }}>
            <option value="river">{t('path.river')}</option>
            <option value="road">{t('path.road')}</option>
            <option value="trail">{t('path.trail')}</option>
            <option value="border">{t('path.border')}</option>
            <option value="wall">{t('path.wall')}</option>
            <option value="ridge">{t('path.ridge')}</option>
            <option value="custom">{t('path.custom')}</option>
          </select>
        </Group>
        <Range label={t('opt.width')} value={pathSettings.width} min={1} max={90} step={0.5}
          onChange={(v) => { pathSettings.width = v; force(); }}
          after={<Num value={pathSettings.width} width={54} label={t('opt.width')}
            onChange={(v) => { pathSettings.width = v; force(); }} />} />
        <Range label={t('opt.taper')} value={pathSettings.taper} min={0} max={1} onChange={(v) => { pathSettings.taper = v; force(); }} />
        <Range label={t('opt.wobble')} value={pathSettings.jitter} min={0} max={12} step={0.1}
          onChange={(v) => { pathSettings.jitter = v; force(); }} />
        <Group label={t('opt.colour')}>
          <input type="color" value={pathSettings.color} onChange={(e) => { pathSettings.color = e.target.value; force(); }} />
          <input type="color" value={pathSettings.outlineColor} onChange={(e) => { pathSettings.outlineColor = e.target.value; force(); }} />
        </Group>
        <Group>
          <label className="field-row" style={{ margin: 0, gap: 5 }}>
            <input type="checkbox" checked={pathSettings.freehand}
              onChange={(e) => { pathSettings.freehand = e.target.checked; force(); }} />
            <span style={{ fontSize: 12 }}>{t('opt.freehand')}</span>
          </label>
          <label className="field-row" style={{ margin: 0, gap: 5 }}>
            <input type="checkbox" checked={pathSettings.closed}
              onChange={(e) => { pathSettings.closed = e.target.checked; force(); }} />
            <span style={{ fontSize: 12 }}>{t('opt.closed')}</span>
          </label>
        </Group>
      </div>
    );
  }

  if (tool === 'castle') {
    const s = castleSettings;
    return (
      <div className="optionbar">
        <Group label={t('opt.castle.thickness')}>
          <Num value={s.thickness} min={2} max={60} step={1} width={54}
            onChange={(v) => { s.thickness = v; force(); }} />
          <span className="hint">{t('opt.castle.feet')}</span>
        </Group>
        <Group label={t('opt.castle.material')}>
          {/* Grouped by family: twenty-odd materials as one flat list is a list
              nobody reads to the bottom of. */}
          <select style={{ minWidth: 160 }} value={s.material}
            onChange={(e) => { s.material = e.target.value as CurtainMaterial; force(); }}>
            {FAMILY_ORDER.map((fam) => (
              <optgroup key={fam} label={t(`opt.castle.materialGroup.${fam}`)}>
                {materialsByFamily()[fam].map((m) => (
                  <option key={m.id} value={m.id}>{t(`material.${m.id}`)}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </Group>
        <Group label={t('opt.castle.towers')}>
          <select style={{ minWidth: 150 }} value={s.towers}
            onChange={(e) => { s.towers = e.target.value as TowerPlacement; force(); }}>
            <option value="corners">{t('opt.castle.towers.corners')}</option>
            <option value="corners+spacing">{t('opt.castle.towers.spacing')}</option>
            <option value="none">{t('opt.castle.towers.none')}</option>
          </select>
          <select value={s.towerShape} onChange={(e) => { s.towerShape = e.target.value as TowerShape; force(); }}>
            <option value="round">{t('opt.castle.towerShape.round')}</option>
            <option value="square">{t('opt.castle.towerShape.square')}</option>
          </select>
        </Group>
        {s.towers === 'corners+spacing' && (
          <Group label={t('opt.castle.towerSpacing')}>
            <Num value={s.towerSpacing} min={20} max={600} step={10} width={62}
              onChange={(v) => { s.towerSpacing = v; force(); }} />
            <span className="hint">{t('opt.castle.feet')}</span>
          </Group>
        )}
        <Range label={t('opt.castle.ruined')} value={s.ruined} min={0} max={1}
          onChange={(v) => { s.ruined = v; force(); }} />
        <Group>
          <label className="field-row" style={{ margin: 0, gap: 5 }}>
            <input type="checkbox" checked={s.crenellations}
              onChange={(e) => { s.crenellations = e.target.checked; force(); }} />
            <span style={{ fontSize: 12 }}>{t('opt.castle.crenellations')}</span>
          </label>
          <label className="field-row" style={{ margin: 0, gap: 5 }}>
            <input type="checkbox" checked={s.wallWalk}
              onChange={(e) => { s.wallWalk = e.target.checked; force(); }} />
            <span style={{ fontSize: 12 }}>{t('opt.castle.wallWalk')}</span>
          </label>
          <label className="field-row" style={{ margin: 0, gap: 5 }}>
            <input type="checkbox" checked={s.gatehouse}
              onChange={(e) => { s.gatehouse = e.target.checked; force(); }} />
            <span style={{ fontSize: 12 }}>{t('opt.castle.gatehouse')}</span>
          </label>
        </Group>
      </div>
    );
  }

  if (tool === 'wall') {
    return (
      <div className="optionbar">
        <Group label={t('opt.type')}>
          <select value={wallSettings.kind} onChange={(e) => { wallSettings.kind = e.target.value as WallKind; force(); }}>
            <option value="wall">{t('wall.wall')}</option>
            <option value="door">{t('wall.door')}</option>
            <option value="secretDoor">{t('wall.secretDoor')}</option>
            <option value="window">{t('wall.window')}</option>
            <option value="terrain">{t('wall.terrain')}</option>
            <option value="invisible">{t('wall.invisible')}</option>
            <option value="ethereal">{t('wall.ethereal')}</option>
          </select>
        </Group>
        <Group>
          <label className="field-row" style={{ margin: 0, gap: 5 }}>
            <input type="checkbox" checked={wallSettings.chain} onChange={(e) => { wallSettings.chain = e.target.checked; force(); }} />
            <span style={{ fontSize: 12 }}>{t('opt.chain')}</span>
          </label>
          <label className="field-row" style={{ margin: 0, gap: 5 }}>
            <input type="checkbox" checked={wallSettings.snapToGrid} onChange={(e) => { wallSettings.snapToGrid = e.target.checked; force(); }} />
            <span style={{ fontSize: 12 }}>{t('opt.snap')}</span>
          </label>
        </Group>
        <Group label={t('opt.blocks')}>
          {(['blocksMovement', 'blocksSight', 'blocksSound'] as const).map((k) => (
            <label key={k} className="field-row" style={{ margin: 0, gap: 4 }}>
              <input type="checkbox" checked={wallSettings[k]} onChange={(e) => { wallSettings[k] = e.target.checked; force(); }} />
              <span style={{ fontSize: 12 }}>{t(`opt.blocks.${k.replace('blocks', '').toLowerCase()}`)}</span>
            </label>
          ))}
        </Group>
        <Group>
          <span className="hint">{t('opt.wallHint')}</span>
        </Group>
      </div>
    );
  }

  if (tool === 'light') {
    return (
      <div className="optionbar">
        <Group label={t('opt.preset')}>
          <select style={{ minWidth: 190 }} value={lightSettings.preset}
            onChange={(e) => {
              const p = LIGHT_PRESETS.find((x) => x.id === e.target.value);
              if (p) {
                lightSettings.preset = p.id;
                lightSettings.bright = p.bright;
                lightSettings.dim = p.dim;
                lightSettings.color = p.color;
                lightSettings.animation = p.animation;
              }
              force();
            }}>
            {LIGHT_PRESETS.map((p) => <option key={p.id} value={p.id}>{lightPresetLabel(p.id, p.label)}</option>)}
          </select>
        </Group>
        <Group label={t('opt.bright', { unit: editor.doc.grid.unitLabel })}>
          <Num value={lightSettings.bright} min={0} max={400} onChange={(v) => { lightSettings.bright = v; force(); }} />
        </Group>
        <Group label={t('opt.dim', { unit: editor.doc.grid.unitLabel })}>
          <Num value={lightSettings.dim} min={0} max={800} onChange={(v) => { lightSettings.dim = v; force(); }} />
        </Group>
        <Group label={t('opt.colour')}>
          <input type="color" value={lightSettings.color} onChange={(e) => { lightSettings.color = e.target.value; force(); }} />
        </Group>
        <Group label={t('opt.angle')}>
          <Num value={lightSettings.angle} min={5} max={360} onChange={(v) => { lightSettings.angle = v; force(); }} />
        </Group>
        <Group>
          <button className={`btn small ${editor.view.showLightingPreview ? 'active' : ''}`}
            onClick={() => editor.setView({ showLightingPreview: !editor.view.showLightingPreview })}>
            {t('opt.previewDarkness')}
          </button>
        </Group>
      </div>
    );
  }

  if (tool === 'token') {
    return (
      <div className="optionbar">
        <Group label={t('opt.label')}>
          <input type="text" style={{ width: 70 }} value={tokenSettings.label}
            onChange={(e) => { tokenSettings.label = e.target.value; force(); }} />
        </Group>
        <Group label={t('opt.sizeCells')}>
          <Num value={tokenSettings.cells} min={0.5} max={6} step={0.5} onChange={(v) => { tokenSettings.cells = v; force(); }} />
        </Group>
        <Group label={t('opt.colour')}>
          <input type="color" value={tokenSettings.color} onChange={(e) => { tokenSettings.color = e.target.value; force(); }} />
        </Group>
        <Group label={t('opt.disposition')}>
          <select value={tokenSettings.disposition}
            onChange={(e) => { tokenSettings.disposition = e.target.value as typeof tokenSettings.disposition; force(); }}>
            <option value="friendly">{t('disp.friendly')}</option>
            <option value="neutral">{t('disp.neutral')}</option>
            <option value="hostile">{t('disp.hostile')}</option>
            <option value="secret">{t('disp.secret')}</option>
          </select>
        </Group>
        <Group label={t('opt.shape')}>
          <select value={tokenSettings.shape}
            onChange={(e) => { tokenSettings.shape = e.target.value as 'circle' | 'square'; force(); }}>
            <option value="circle">{t('shape.circle')}</option>
            <option value="square">{t('shape.square')}</option>
          </select>
        </Group>
      </div>
    );
  }

  if (tool === 'select') {
    const n = editor.selection.objectIds.length;
    return (
      <div className="optionbar">
        <Group>
          <span className="hint">{n ? t('opt.selected', { count: n }) : t('opt.selectHint')}</span>
        </Group>
        {n > 0 && (
          <>
            <Group label={t('opt.order')}>
              <button className="btn small" onClick={() => editor.bringForward(1)}>{t('opt.forward')}</button>
              <button className="btn small" onClick={() => editor.bringForward(-1)}>{t('opt.back')}</button>
              <button className="btn small" onClick={() => editor.bringForward(9999)}>{t('opt.front')}</button>
              <button className="btn small" onClick={() => editor.bringForward(-9999)}>{t('opt.bottom')}</button>
            </Group>
            <Group>
              <button className="btn small" onClick={() => editor.duplicateSelection()}>{t('opt.duplicate')}</button>
              <button className="btn small danger" onClick={() => editor.deleteSelection()}>{t('opt.delete')}</button>
            </Group>
          </>
        )}
      </div>
    );
  }

  if (tool === 'fill') {
    const g = editor.doc.grid;
    return (
      <div className="optionbar">
        <Group label={t('opt.mode')}>
          <select style={{ minWidth: 150 }} value={fillSettings.mode}
            onChange={(e) => { fillSettings.mode = e.target.value as typeof fillSettings.mode; force(); }}>
            <option value="flood">{t('opt.fillMode.flood')}</option>
            <option value="cell">{t('opt.fillMode.cell')}</option>
            <option value="all">{t('opt.fillMode.all')}</option>
          </select>
        </Group>
        <Group label={t('opt.paintWith')}>
          <select style={{ minWidth: 104 }} value={editor.brush.mode}
            onChange={(e) => editor.setBrush({ mode: e.target.value as BrushMode })}>
            <option value="texture">{t('brushmode.texture')}</option>
            <option value="color">{t('brushmode.color')}</option>
            <option value="erase">{t('brushmode.erase')}</option>
          </select>
          {editor.brush.mode === 'color' && (
            <input type="color" value={editor.brush.color} onChange={(e) => editor.setBrush({ color: e.target.value })} />
          )}
        </Group>
        <Range label={t('opt.opacity')} value={editor.brush.opacity} min={0.05} max={1}
          onChange={(v) => editor.setBrush({ opacity: v })} />
        <Group>
          <span className="hint">
            {fillSettings.mode === 'cell'
              ? (g.type === 'none'
                ? t('tool.status.cellFillNeedsGrid')
                : t(g.type.startsWith('hex') ? 'opt.fillHint.hexes' : 'opt.fillHint.squares'))
              : fillSettings.mode === 'all'
                ? t('opt.fillHint.all')
                : t('opt.fillHint.flood')}
          </span>
        </Group>
      </div>
    );
  }

  if (tool === 'gridalign') {
    const g = editor.doc.grid;
    return (
      <div className="optionbar">
        <Group label={t('opt.boxSpans')}>
          <Num value={gridAlignSettings.cols} min={1} max={80} onChange={(v) => { gridAlignSettings.cols = Math.round(v); force(); }} width={54} />
          <span style={{ color: 'var(--ink-faint)' }}>×</span>
          <Num value={gridAlignSettings.rows} min={1} max={80} onChange={(v) => { gridAlignSettings.rows = Math.round(v); force(); }} width={54} />
          <span className="opt-label">{t('field.cells')}</span>
        </Group>
        <Group>
          <label className="field-row" style={{ margin: 0, gap: 5 }}>
            <input type="checkbox" checked={gridAlignSettings.square}
              onChange={(e) => { gridAlignSettings.square = e.target.checked; force(); }} />
            <span style={{ fontSize: 12 }}>{t('opt.forceSquare')}</span>
          </label>
        </Group>
        <Group label={t('opt.current')}>
          <span className="hint">
            {t('opt.gridCurrent', {
              size: g.size.toFixed(1),
              x: g.offsetX.toFixed(1),
              y: g.offsetY.toFixed(1),
              cols: (editor.doc.width / g.size).toFixed(1),
              rows: (editor.doc.height / g.size).toFixed(1),
            })}
          </span>
        </Group>
        <Group label={t('opt.nudge')}>
          {([['←', -1, 0], ['→', 1, 0], ['↑', 0, -1], ['↓', 0, 1]] as const).map(([label, dx, dy]) => (
            <button key={label} className="btn small" onClick={() => {
              editor.mutate('Nudge grid', (d) => {
                d.grid = { ...d.grid, offsetX: d.grid.offsetX + dx, offsetY: d.grid.offsetY + dy };
              });
            }}>{label}</button>
          ))}
        </Group>
        <Group>
          <span className="hint">{t('opt.gridAlignHint')}</span>
        </Group>
      </div>
    );
  }

  if (tool === 'measure') {
    return (
      <div className="optionbar">
        <Group>
          <span className="hint">{measureHint(editor.doc.grid)}</span>
        </Group>
      </div>
    );
  }

  return (
    <div className="optionbar">
      <Group><span className="hint">{require_hint(editor.tool, t)}</span></Group>
    </div>
  );
}

function require_hint(tool: string, t: (k: string) => string): string {
  switch (tool) {
    case 'fill': return t('opt.fillHint.flood');
    case 'note': return t('opt.noteHint');
    case 'eyedropper': return t('opt.eyedropperHint');
    case 'pan': return t('opt.panHint');
    default: return '';
  }
}

/**
 * What the measure tool promises before you drag.
 *
 * On a hex crawl the useful fact is not the cell size but the day's march, so
 * the hint says both — a GM should be able to answer "how far is that?" from
 * the option bar without measuring anything.
 */
function measureHint(g: GridConfig): string {
  const hex = g.type === 'hexPointy' || g.type === 'hexFlat';
  const pace = g.travelPerDay ?? 0;
  if (!hex) return t('opt.measureHint', { units: g.unitsPerCell, unit: g.unitLabel });
  if (pace <= 0) return t('opt.measureHintHexNoPace', { units: g.unitsPerCell, unit: g.unitLabel });
  return t('opt.measureHintHex', {
    units: g.unitsPerCell, unit: g.unitLabel,
    pace: plural('count.hexes', +(pace / Math.max(0.001, g.unitsPerCell)).toFixed(1)),
  });
}
