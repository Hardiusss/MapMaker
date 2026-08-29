/** Bring an existing map image in, detect its grid, and get it VTT-ready. */
import React from 'react';
import { Modal, NumberField, TextField, Toggle, Section, SelectField } from '../components/controls';
import { useEditor } from '../useEditor';
import { documentFromImage, imageAsLayer, guessGridSize } from '../../core/importImage';
import { createSurface, ctxOf, loadImage } from '../../util/canvas';
import { PALETTES } from '../../core/color';
import { useLang } from '../../i18n/useLang';
import { paletteName } from '../../i18n/display';

export function ImportImageDialog({ onClose }: { onClose: () => void }) {
  const editor = useEditor();
  const { t } = useLang();
  const [dataUrl, setDataUrl] = React.useState<string | null>(null);
  const [dims, setDims] = React.useState<{ w: number; h: number } | null>(null);
  const [name, setName] = React.useState(t('dlg.import.defaultName'));
  const [cell, setCell] = React.useState(70);
  const [confidence, setConfidence] = React.useState(0);
  const [detecting, setDetecting] = React.useState(false);
  const [mode, setMode] = React.useState<'new' | 'layer'>('new');
  const [paletteId, setPaletteId] = React.useState(editor.paletteId);
  const [useGrid, setUseGrid] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const previewRef = React.useRef<HTMLCanvasElement>(null);

  /**
   * A file the browser will not decode used to fail silently: the promise
   * rejected into nothing, the preview stayed blank and the Import button
   * stayed disabled, so the dialog looked broken rather than picky. A .webp
   * an old build cannot read and a .psd renamed to .png both land here.
   */
  const readFile = (file: File) => {
    setError(null);
    const reader = new FileReader();
    reader.onerror = () => setError(t('dlg.import.unreadable', { file: file.name }));
    reader.onload = async () => {
      const url = String(reader.result);
      try {
        const img = await loadImage(url);
        setDataUrl(url);
        setName(file.name.replace(/\.[^.]+$/, ''));
        setDims({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
        detect(img);
        drawPreview(img);
      } catch {
        setDataUrl(null);
        setDims(null);
        setError(t('dlg.import.notAnImage', { file: file.name }));
      }
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

  // Building a document around a forty-megapixel scan is seconds of work on the
  // main thread. The button says so rather than going dead.
  const doImport = async () => {
    if (!dataUrl || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'new') {
        const { doc } = await documentFromImage(dataUrl, {
          cellSize: useGrid ? cell : 0,
          title: name,
          paletteId,
        });
        editor.setPalette(paletteId);
        editor.setDocument(doc);
        editor.status(t('dlg.import.statusNew', { tool: t('tool.gridAlign') }));
      } else {
        const next = await imageAsLayer(editor.doc, dataUrl, true);
        editor.mutate('Import image', () => next);
        editor.status(t('dlg.import.statusLayer'));
      }
      onClose();
    } catch (err) {
      setBusy(false);
      setError(t('dlg.import.failed', { error: (err as Error).message }));
    }
  };

  return (
    <Modal
      title={t('dlg.import.title')}
      onClose={onClose}
      footer={
        <>
          <span className="grow hint">
            {t('dlg.import.blurb')}
          </span>
          <button className="btn" onClick={onClose} disabled={busy}>{t('action.cancel')}</button>
          <button className="btn primary" onClick={doImport} disabled={!dataUrl || busy}>
            {busy ? t('dlg.import.importing') : t('action.import')}
          </button>
        </>
      }
    >
      <div className="grid-2">
        <div>
          <Section title={t('dlg.import.file')}>
            <label className="btn" style={{ width: '100%', marginBottom: 8 }}>
              {dataUrl ? t('dlg.import.chooseOther') : t('dlg.import.choose')}
              <input type="file" accept="image/*" style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); e.currentTarget.value = ''; }} />
            </label>
            {dims && <p className="hint">{dims.w} × {dims.h} px</p>}
            {error && <p className="hint error" role="alert">{error}</p>}
            <canvas ref={previewRef} width={340} height={220}
              style={{ width: '100%', background: 'var(--bg-0)', border: '1px solid var(--line)', borderRadius: 6 }} />
          </Section>
        </div>
        <div>
          <Section title={t('dlg.import.how')}>
            <SelectField label={t('dlg.import.mode')} value={mode}
              options={[
                { value: 'new', label: t('dlg.import.modeNew') },
                { value: 'layer', label: t('dlg.import.modeLayer') },
              ] as { value: 'new' | 'layer'; label: string }[]}
              onChange={setMode} />
            {mode === 'new' && (
              <>
                <TextField label={t('field.title')} value={name} onChange={setName} />
                <SelectField label={t('field.palette')} value={paletteId}
                  options={PALETTES.map((p) => ({ value: p.id, label: paletteName(p.id, p.name) }))}
                  onChange={setPaletteId} />
              </>
            )}
          </Section>

          {mode === 'new' && (
            <Section title={t('map.grid')}>
              <Toggle label={t('dlg.import.hasGrid')} value={useGrid} onChange={setUseGrid} />
              {useGrid && (
                <>
                  <NumberField label={t('field.cellSize')} value={cell} min={4} max={600} step={0.5} suffix="px"
                    onChange={setCell} />
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                    <span className={`pill ${confidence > 0.5 ? 'ok' : 'warn'}`}>
                      {detecting ? t('dlg.import.detecting')
                        : confidence > 0.5 ? t('dlg.import.confident')
                          : confidence > 0.15 ? t('dlg.import.rough') : t('dlg.import.unsure')}
                    </span>
                    {dims && (
                      <span className="hint">
                        {t('map.cellsSummary', {
                          cols: (dims.w / cell).toFixed(1), rows: (dims.h / cell).toFixed(1),
                        })}
                      </span>
                    )}
                  </div>
                  <p className="hint">{t('dlg.import.detectHint', { tool: t('tool.gridAlign') })}</p>
                </>
              )}
            </Section>
          )}
        </div>
      </div>
    </Modal>
  );
}
