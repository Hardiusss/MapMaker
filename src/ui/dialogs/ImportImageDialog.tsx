/** Bring an existing map image in, detect its grid, and get it VTT-ready. */
import React from 'react';
import { Modal, NumberField, TextField, Toggle, Section, SelectField } from '../components/controls';
import { useEditor } from '../useEditor';
import { documentFromImage, imageAsLayer, guessGridSize } from '../../core/importImage';
import { createSurface, ctxOf, loadImage } from '../../util/canvas';
import { PALETTES } from '../../core/color';

export function ImportImageDialog({ onClose }: { onClose: () => void }) {
  const editor = useEditor();
  const [dataUrl, setDataUrl] = React.useState<string | null>(null);
  const [dims, setDims] = React.useState<{ w: number; h: number } | null>(null);
  const [name, setName] = React.useState('Imported Map');
  const [cell, setCell] = React.useState(70);
  const [confidence, setConfidence] = React.useState(0);
  const [detecting, setDetecting] = React.useState(false);
  const [mode, setMode] = React.useState<'new' | 'layer'>('new');
  const [paletteId, setPaletteId] = React.useState(editor.paletteId);
  const [useGrid, setUseGrid] = React.useState(true);
  const previewRef = React.useRef<HTMLCanvasElement>(null);

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const url = String(reader.result);
      setDataUrl(url);
      setName(file.name.replace(/\.[^.]+$/, ''));
      const img = await loadImage(url);
      setDims({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
      detect(img);
      drawPreview(img);
    };
    reader.readAsDataURL(file);
  };

  const drawPreview = (img: HTMLImageElement) => {
    const c = previewRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const s = Math.min(c.width / img.width, c.height / img.height);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(img, (c.width - img.width * s) / 2, (c.height - img.height * s) / 2, img.width * s, img.height * s);
  };

  const detect = (img: HTMLImageElement) => {
    setDetecting(true);
    window.setTimeout(() => {
      // Work on a downscaled copy: the grid signal survives, the cost does not.
      const maxSide = 1400;
      const s = Math.min(1, maxSide / Math.max(img.width, img.height));
      const work = createSurface(Math.round(img.width * s), Math.round(img.height * s));
      ctxOf(work).drawImage(img, 0, 0, work.width, work.height);
      const guess = guessGridSize(work, 16, 200);
      setCell(Math.round((guess.size / s) * 10) / 10);
      setConfidence(guess.confidence);
      setDetecting(false);
    }, 20);
  };

  const doImport = async () => {
    if (!dataUrl) return;
    if (mode === 'new') {
      const { doc } = await documentFromImage(dataUrl, {
        cellSize: useGrid ? cell : 0,
        title: name,
        paletteId,
      });
      editor.setPalette(paletteId);
      editor.setDocument(doc);
      editor.status('Image imported. Use Align Grid if the squares do not line up, then add walls.');
    } else {
      const next = await imageAsLayer(editor.doc, dataUrl, true);
      editor.mutate('Import image', () => next);
      editor.status('Image added as a layer.');
    }
    onClose();
  };

  return (
    <Modal
      title="Import a Map Image"
      onClose={onClose}
      footer={
        <>
          <span className="grow hint">
            Bring your own artwork in, drop a grid on it, then add walls and lights and export to your VTT.
          </span>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={doImport} disabled={!dataUrl}>Import</button>
        </>
      }
    >
      <div className="grid-2">
        <div>
          <Section title="File">
            <label className="btn" style={{ width: '100%', marginBottom: 8 }}>
              {dataUrl ? 'Choose a different image…' : 'Choose an image…'}
              <input type="file" accept="image/*" style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); e.currentTarget.value = ''; }} />
            </label>
            {dims && <p className="hint">{dims.w} × {dims.h} px</p>}
            <canvas ref={previewRef} width={340} height={220}
              style={{ width: '100%', background: 'var(--bg-0)', border: '1px solid var(--line)', borderRadius: 6 }} />
          </Section>
        </div>
        <div>
          <Section title="How to bring it in">
            <SelectField label="Mode" value={mode}
              options={[
                { value: 'new', label: 'New map from this image' },
                { value: 'layer', label: 'Add to the current map as a layer' },
              ] as { value: 'new' | 'layer'; label: string }[]}
              onChange={setMode} />
            {mode === 'new' && (
              <>
                <TextField label="Title" value={name} onChange={setName} />
                <SelectField label="Palette" value={paletteId}
                  options={PALETTES.map((p) => ({ value: p.id, label: p.name }))}
                  onChange={setPaletteId} />
              </>
            )}
          </Section>

          {mode === 'new' && (
            <Section title="Grid">
              <Toggle label="This image has a grid" value={useGrid} onChange={setUseGrid} />
              {useGrid && (
                <>
                  <NumberField label="Cell size" value={cell} min={4} max={600} step={0.5} suffix="px"
                    onChange={setCell} />
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                    <span className={`pill ${confidence > 0.5 ? 'ok' : 'warn'}`}>
                      {detecting ? 'detecting…' : confidence > 0.5 ? 'confident' : confidence > 0.15 ? 'rough guess' : 'unsure'}
                    </span>
                    {dims && (
                      <span className="hint">
                        {(dims.w / cell).toFixed(1)} × {(dims.h / cell).toFixed(1)} cells
                      </span>
                    )}
                  </div>
                  <p className="hint">
                    The detector looks for the strongest repeating line spacing in the artwork.
                    If it guesses wrong, import anyway and use the <strong>Align Grid</strong> tool —
                    drag a box over a known number of squares and it solves the size and offset for you.
                  </p>
                </>
              )}
            </Section>
          )}
        </div>
      </div>
    </Modal>
  );
}
