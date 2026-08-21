/** Context strip under the top bar: options for whichever tool is active. */
import React from 'react';
import { useEditorEvents } from './useEditor';
import { BRUSH_PRESETS, type BrushMode } from '../render/brush';
import { fillSettings } from '../tools/paintTools';
import { stampSettings, textSettings, shapeSettings, pathSettings, tokenSettings } from '../tools';
import { wallSettings, lightSettings, LIGHT_PRESETS } from '../tools/vttTools';
import { gridAlignSettings } from '../tools/gridAlignTool';
import { assetById } from '../assets/library';
import { MAP_FONTS } from '../core/factories';
import type { WallKind, ShapeKind, PathStyle } from '../core/types';

function Group({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="opt-group">
      {label && <span className="opt-label">{label}</span>}
      {children}
    </div>
  );
}

function Num({ value, onChange, min, max, step = 1, width = 62 }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; width?: number;
}) {
  return (
    <input type="number" style={{ width }} value={value} min={min} max={max} step={step}
      onChange={(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) onChange(v); }} />
  );
}

function Range({ value, onChange, min, max, step = 0.01, width = 92 }: {
  value: number; onChange: (v: number) => void; min: number; max: number; step?: number; width?: number;
}) {
  return (
    <input type="range" style={{ width, flex: 'none' }} min={min} max={max} step={step} value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))} />
  );
}

export function OptionBar({ onOpenAssets }: { onOpenAssets: () => void }) {
  const editor = useEditorEvents('tool', 'brush', 'change', 'selection');
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  const tool = editor.tool;

  if (tool === 'brush' || tool === 'eraser') {
    const b = editor.brush;
    return (
      <div className="optionbar">
        <Group label="Preset">
          <select style={{ width: 130 }} value=""
            onChange={(e) => {
              const p = BRUSH_PRESETS.find((x) => x.id === e.target.value);
              if (p) editor.setBrush(p.settings);
            }}>
            <option value="">Choose…</option>
            {BRUSH_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </Group>
        <Group label="Mode">
          <select style={{ width: 104 }} value={b.mode}
            onChange={(e) => editor.setBrush({ mode: e.target.value as BrushMode })}>
            <option value="texture">Texture</option>
            <option value="color">Colour</option>
            <option value="scatter">Scatter</option>
            <option value="darken">Shade</option>
            <option value="lighten">Highlight</option>
            <option value="erase">Erase</option>
          </select>
          {b.mode === 'color' && (
            <input type="color" value={b.color} onChange={(e) => editor.setBrush({ color: e.target.value })} />
          )}
        </Group>
        <Group label="Size">
          <Range value={b.size} min={2} max={800} step={1} onChange={(v) => editor.setBrush({ size: v })} />
          <Num value={Math.round(b.size)} min={2} max={3000} onChange={(v) => editor.setBrush({ size: v })} />
        </Group>
        <Group label="Hardness">
          <Range value={b.hardness} min={0} max={1} onChange={(v) => editor.setBrush({ hardness: v })} />
        </Group>
        <Group label="Flow">
          <Range value={b.flow} min={0.02} max={1} onChange={(v) => editor.setBrush({ flow: v })} />
        </Group>
        <Group label="Opacity">
          <Range value={b.opacity} min={0.02} max={1} onChange={(v) => editor.setBrush({ opacity: v })} />
        </Group>
        <Group label="Edge">
          <Range value={b.edgeNoise} min={0} max={0.8} onChange={(v) => editor.setBrush({ edgeNoise: v })} />
        </Group>
        {b.mode === 'texture' && (
          <Group label="Texture scale">
            <Range value={b.textureScale} min={0.2} max={4} step={0.05} onChange={(v) => editor.setBrush({ textureScale: v })} width={80} />
          </Group>
        )}
        {b.mode === 'scatter' && (
          <>
            <Group label="Asset">
              <button className="btn small" onClick={onOpenAssets}>
                {assetById(b.scatterAssetId)?.label || 'Pick…'}
              </button>
            </Group>
            <Group label="Density">
              <Range value={b.scatterDensity} min={0.1} max={2} step={0.05} onChange={(v) => editor.setBrush({ scatterDensity: v })} />
            </Group>
          </>
        )}
      </div>
    );
  }

  if (tool === 'stamp') {
    const def = assetById(stampSettings.assetId);
    return (
      <div className="optionbar">
        <Group label="Asset">
          <button className="btn small" onClick={onOpenAssets}>{def?.label || 'Choose…'}</button>
        </Group>
        <Group label="Width">
          <Range value={stampSettings.width} min={10} max={900} step={1}
            onChange={(v) => { stampSettings.width = v; force(); }} />
          <Num value={Math.round(stampSettings.width)} onChange={(v) => { stampSettings.width = v; force(); }} />
        </Group>
        <Group label="Size jitter">
          <Range value={stampSettings.sizeJitter} min={0} max={0.7} onChange={(v) => { stampSettings.sizeJitter = v; force(); }} />
        </Group>
        <Group label="Rotate ±">
          <Num value={stampSettings.rotationJitter} min={0} max={180} onChange={(v) => { stampSettings.rotationJitter = v; force(); }} />
        </Group>
        <Group>
          <label className="field-row" style={{ margin: 0, gap: 5 }}>
            <input type="checkbox" checked={stampSettings.spray}
              onChange={(e) => { stampSettings.spray = e.target.checked; force(); }} />
            <span style={{ fontSize: 12 }}>Spray</span>
          </label>
          <label className="field-row" style={{ margin: 0, gap: 5 }}>
            <input type="checkbox" checked={stampSettings.dragToSize}
              onChange={(e) => { stampSettings.dragToSize = e.target.checked; force(); }} />
            <span style={{ fontSize: 12 }}>Drag to size</span>
          </label>
        </Group>
        {stampSettings.spray && (
          <Group label="Spacing">
            <Num value={stampSettings.spraySpacing} min={4} max={600} onChange={(v) => { stampSettings.spraySpacing = v; force(); }} />
          </Group>
        )}
      </div>
    );
  }

  if (tool === 'text') {
    return (
      <div className="optionbar">
        <Group label="Font">
          <select style={{ width: 170 }} value={textSettings.font}
            onChange={(e) => { textSettings.font = e.target.value; force(); }}>
            {MAP_FONTS.map((f) => <option key={f} value={f}>{f.split(',')[0].replace(/"/g, '')}</option>)}
          </select>
        </Group>
        <Group label="Size">
          <Num value={textSettings.size} min={6} max={400} onChange={(v) => { textSettings.size = v; force(); }} />
        </Group>
        <Group label="Colour">
          <input type="color" value={textSettings.color} onChange={(e) => { textSettings.color = e.target.value; force(); }} />
        </Group>
        <Group label="Halo">
          <input type="color" value={textSettings.strokeColor} onChange={(e) => { textSettings.strokeColor = e.target.value; force(); }} />
          <Num value={textSettings.strokeWidth} min={0} max={40} onChange={(v) => { textSettings.strokeWidth = v; force(); }} width={54} />
        </Group>
        <Group label="Tracking">
          <Num value={textSettings.letterSpacing} min={-10} max={60} onChange={(v) => { textSettings.letterSpacing = v; force(); }} width={54} />
        </Group>
        <Group label="Curve">
          <select value={textSettings.curve} onChange={(e) => { textSettings.curve = e.target.value as typeof textSettings.curve; force(); }}>
            <option value="straight">Straight</option>
            <option value="arcUp">Arc up</option>
            <option value="arcDown">Arc down</option>
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
        <Group label="Shape">
          <select value={shapeSettings.shape} onChange={(e) => { shapeSettings.shape = e.target.value as ShapeKind; force(); }}>
            <option value="rect">Rectangle</option>
            <option value="ellipse">Ellipse</option>
            <option value="polygon">Polygon</option>
            <option value="star">Star</option>
          </select>
          {(shapeSettings.shape === 'polygon' || shapeSettings.shape === 'star') && (
            <Num value={shapeSettings.sides} min={3} max={20} onChange={(v) => { shapeSettings.sides = v; force(); }} width={50} />
          )}
        </Group>
        <Group label="Fill">
          <select value={shapeSettings.fillType}
            onChange={(e) => { shapeSettings.fillType = e.target.value as typeof shapeSettings.fillType; force(); }}>
            <option value="solid">Solid</option>
            <option value="texture">Texture</option>
            <option value="none">None</option>
          </select>
          {shapeSettings.fillType === 'solid' && (
            <input type="color" value={shapeSettings.fillColor} onChange={(e) => { shapeSettings.fillColor = e.target.value; force(); }} />
          )}
        </Group>
        <Group label="Stroke">
          <input type="color" value={shapeSettings.strokeColor} onChange={(e) => { shapeSettings.strokeColor = e.target.value; force(); }} />
          <Num value={shapeSettings.strokeWidth} min={0} max={40} onChange={(v) => { shapeSettings.strokeWidth = v; force(); }} width={50} />
        </Group>
        <Group label="Corner">
          <Num value={shapeSettings.cornerRadius} min={0} max={200} onChange={(v) => { shapeSettings.cornerRadius = v; force(); }} width={54} />
        </Group>
      </div>
    );
  }

  if (tool === 'path') {
    return (
      <div className="optionbar">
        <Group label="Style">
          <select value={pathSettings.style} onChange={(e) => { pathSettings.style = e.target.value as PathStyle; force(); }}>
            <option value="river">River</option>
            <option value="road">Road</option>
            <option value="trail">Trail</option>
            <option value="border">Border</option>
            <option value="wall">Wall</option>
            <option value="ridge">Ridge</option>
            <option value="custom">Custom</option>
          </select>
        </Group>
        <Group label="Width">
          <Range value={pathSettings.width} min={1} max={90} step={0.5} onChange={(v) => { pathSettings.width = v; force(); }} />
          <Num value={pathSettings.width} onChange={(v) => { pathSettings.width = v; force(); }} width={54} />
        </Group>
        <Group label="Taper">
          <Range value={pathSettings.taper} min={0} max={1} onChange={(v) => { pathSettings.taper = v; force(); }} />
        </Group>
        <Group label="Wobble">
          <Range value={pathSettings.jitter} min={0} max={12} step={0.1} onChange={(v) => { pathSettings.jitter = v; force(); }} />
        </Group>
        <Group label="Colour">
          <input type="color" value={pathSettings.color} onChange={(e) => { pathSettings.color = e.target.value; force(); }} />
          <input type="color" value={pathSettings.outlineColor} onChange={(e) => { pathSettings.outlineColor = e.target.value; force(); }} />
        </Group>
        <Group>
          <label className="field-row" style={{ margin: 0, gap: 5 }}>
            <input type="checkbox" checked={pathSettings.freehand}
              onChange={(e) => { pathSettings.freehand = e.target.checked; force(); }} />
            <span style={{ fontSize: 12 }}>Freehand</span>
          </label>
          <label className="field-row" style={{ margin: 0, gap: 5 }}>
            <input type="checkbox" checked={pathSettings.closed}
              onChange={(e) => { pathSettings.closed = e.target.checked; force(); }} />
            <span style={{ fontSize: 12 }}>Closed</span>
          </label>
        </Group>
      </div>
    );
  }

  if (tool === 'wall') {
    return (
      <div className="optionbar">
        <Group label="Type">
          <select value={wallSettings.kind} onChange={(e) => { wallSettings.kind = e.target.value as WallKind; force(); }}>
            <option value="wall">Wall</option>
            <option value="door">Door</option>
            <option value="secretDoor">Secret door</option>
            <option value="window">Window (see through)</option>
            <option value="terrain">Terrain (sight only)</option>
            <option value="invisible">Invisible barrier</option>
            <option value="ethereal">Ethereal (sight blocker)</option>
          </select>
        </Group>
        <Group>
          <label className="field-row" style={{ margin: 0, gap: 5 }}>
            <input type="checkbox" checked={wallSettings.chain} onChange={(e) => { wallSettings.chain = e.target.checked; force(); }} />
            <span style={{ fontSize: 12 }}>Chain</span>
          </label>
          <label className="field-row" style={{ margin: 0, gap: 5 }}>
            <input type="checkbox" checked={wallSettings.snapToGrid} onChange={(e) => { wallSettings.snapToGrid = e.target.checked; force(); }} />
            <span style={{ fontSize: 12 }}>Snap</span>
          </label>
        </Group>
        <Group label="Blocks">
          {(['blocksMovement', 'blocksSight', 'blocksSound'] as const).map((k) => (
            <label key={k} className="field-row" style={{ margin: 0, gap: 4 }}>
              <input type="checkbox" checked={wallSettings[k]} onChange={(e) => { wallSettings[k] = e.target.checked; force(); }} />
              <span style={{ fontSize: 12 }}>{k.replace('blocks', '')}</span>
            </label>
          ))}
        </Group>
        <Group>
          <span className="hint">Walls export to Foundry and Universal VTT.</span>
        </Group>
      </div>
    );
  }

  if (tool === 'light') {
    return (
      <div className="optionbar">
        <Group label="Preset">
          <select style={{ width: 190 }} value={lightSettings.preset}
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
            {LIGHT_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </Group>
        <Group label={`Bright (${editor.doc.grid.unitLabel})`}>
          <Num value={lightSettings.bright} min={0} max={400} onChange={(v) => { lightSettings.bright = v; force(); }} />
        </Group>
        <Group label={`Dim (${editor.doc.grid.unitLabel})`}>
          <Num value={lightSettings.dim} min={0} max={800} onChange={(v) => { lightSettings.dim = v; force(); }} />
        </Group>
        <Group label="Colour">
          <input type="color" value={lightSettings.color} onChange={(e) => { lightSettings.color = e.target.value; force(); }} />
        </Group>
        <Group label="Angle">
          <Num value={lightSettings.angle} min={5} max={360} onChange={(v) => { lightSettings.angle = v; force(); }} />
        </Group>
        <Group>
          <button className={`btn small ${editor.view.showLightingPreview ? 'active' : ''}`}
            onClick={() => editor.setView({ showLightingPreview: !editor.view.showLightingPreview })}>
            Preview darkness
          </button>
        </Group>
      </div>
    );
  }

  if (tool === 'token') {
    return (
      <div className="optionbar">
        <Group label="Label">
          <input type="text" style={{ width: 70 }} value={tokenSettings.label}
            onChange={(e) => { tokenSettings.label = e.target.value; force(); }} />
        </Group>
        <Group label="Size (cells)">
          <Num value={tokenSettings.cells} min={0.5} max={6} step={0.5} onChange={(v) => { tokenSettings.cells = v; force(); }} />
        </Group>
        <Group label="Colour">
          <input type="color" value={tokenSettings.color} onChange={(e) => { tokenSettings.color = e.target.value; force(); }} />
        </Group>
        <Group label="Disposition">
          <select value={tokenSettings.disposition}
            onChange={(e) => { tokenSettings.disposition = e.target.value as typeof tokenSettings.disposition; force(); }}>
            <option value="friendly">Friendly</option>
            <option value="neutral">Neutral</option>
            <option value="hostile">Hostile</option>
            <option value="secret">Secret</option>
          </select>
        </Group>
        <Group label="Shape">
          <select value={tokenSettings.shape}
            onChange={(e) => { tokenSettings.shape = e.target.value as 'circle' | 'square'; force(); }}>
            <option value="circle">Circle</option>
            <option value="square">Square</option>
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
          <span className="hint">{n ? `${n} object${n > 1 ? 's' : ''} selected` : 'Click an object, or drag a box to select several.'}</span>
        </Group>
        {n > 0 && (
          <>
            <Group label="Order">
              <button className="btn small" onClick={() => editor.bringForward(1)}>Forward</button>
              <button className="btn small" onClick={() => editor.bringForward(-1)}>Back</button>
              <button className="btn small" onClick={() => editor.bringForward(9999)}>Front</button>
              <button className="btn small" onClick={() => editor.bringForward(-9999)}>Bottom</button>
            </Group>
            <Group>
              <button className="btn small" onClick={() => editor.duplicateSelection()}>Duplicate</button>
              <button className="btn small danger" onClick={() => editor.deleteSelection()}>Delete</button>
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
        <Group label="Mode">
          <select style={{ width: 150 }} value={fillSettings.mode}
            onChange={(e) => { fillSettings.mode = e.target.value as typeof fillSettings.mode; force(); }}>
            <option value="flood">Flood connected area</option>
            <option value="cell">Single grid cells</option>
            <option value="all">Whole layer</option>
          </select>
        </Group>
        <Group label="Paint with">
          <select style={{ width: 104 }} value={editor.brush.mode}
            onChange={(e) => editor.setBrush({ mode: e.target.value as BrushMode })}>
            <option value="texture">Texture</option>
            <option value="color">Colour</option>
            <option value="erase">Erase</option>
          </select>
          {editor.brush.mode === 'color' && (
            <input type="color" value={editor.brush.color} onChange={(e) => editor.setBrush({ color: e.target.value })} />
          )}
        </Group>
        <Group label="Opacity">
          <Range value={editor.brush.opacity} min={0.05} max={1} onChange={(v) => editor.setBrush({ opacity: v })} />
        </Group>
        <Group>
          <span className="hint">
            {fillSettings.mode === 'cell'
              ? (g.type === 'none'
                ? 'Cell fill needs a grid — turn one on in the Map tab.'
                : `Click or drag to paint ${g.type.startsWith('hex') ? 'hexes' : 'squares'}. Ideal for hex crawls.`)
              : fillSettings.mode === 'all'
                ? 'Covers the entire active layer.'
                : 'Click a region to flood it with the current texture.'}
          </span>
        </Group>
      </div>
    );
  }

  if (tool === 'gridalign') {
    const g = editor.doc.grid;
    return (
      <div className="optionbar">
        <Group label="Box spans">
          <Num value={gridAlignSettings.cols} min={1} max={80} onChange={(v) => { gridAlignSettings.cols = Math.round(v); force(); }} width={54} />
          <span style={{ color: 'var(--ink-faint)' }}>×</span>
          <Num value={gridAlignSettings.rows} min={1} max={80} onChange={(v) => { gridAlignSettings.rows = Math.round(v); force(); }} width={54} />
          <span className="opt-label">cells</span>
        </Group>
        <Group>
          <label className="field-row" style={{ margin: 0, gap: 5 }}>
            <input type="checkbox" checked={gridAlignSettings.square}
              onChange={(e) => { gridAlignSettings.square = e.target.checked; force(); }} />
            <span style={{ fontSize: 12 }}>Force square cells</span>
          </label>
        </Group>
        <Group label="Current">
          <span className="hint">
            {g.size.toFixed(1)} px/cell · offset {g.offsetX.toFixed(1)}, {g.offsetY.toFixed(1)}
            {' '}· {(editor.doc.width / g.size).toFixed(1)} × {(editor.doc.height / g.size).toFixed(1)} cells
          </span>
        </Group>
        <Group label="Nudge">
          {([['←', -1, 0], ['→', 1, 0], ['↑', 0, -1], ['↓', 0, 1]] as const).map(([label, dx, dy]) => (
            <button key={label} className="btn small" onClick={() => {
              editor.mutate('Nudge grid', (d) => {
                d.grid = { ...d.grid, offsetX: d.grid.offsetX + dx, offsetY: d.grid.offsetY + dy };
              });
            }}>{label}</button>
          ))}
        </Group>
        <Group>
          <span className="hint">Drag a box over exactly that many squares of the artwork.</span>
        </Group>
      </div>
    );
  }

  if (tool === 'measure') {
    return (
      <div className="optionbar">
        <Group>
          <span className="hint">
            Drag across the map to measure. One cell = {editor.doc.grid.unitsPerCell} {editor.doc.grid.unitLabel}.
          </span>
        </Group>
      </div>
    );
  }

  return (
    <div className="optionbar">
      <Group><span className="hint">{require_hint(editor.tool)}</span></Group>
    </div>
  );
}

function require_hint(tool: string): string {
  switch (tool) {
    case 'fill': return 'Click a region to flood it with the current texture.';
    case 'note': return 'Click to drop a GM note. Notes export as Foundry journal pins.';
    case 'eyedropper': return 'Click to sample a colour into the brush.';
    case 'pan': return 'Drag to move the view. Hold Space in any tool to pan temporarily.';
    default: return '';
  }
}
