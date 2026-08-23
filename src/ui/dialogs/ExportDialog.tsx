/** Export dialog — image, Foundry, Universal VTT, Roll20 and print PDF. */
import React from 'react';
import { Modal, Slider, NumberField, SelectField, Toggle, TextField, Section } from '../components/controls';
import { useEditor } from '../useEditor';
import {
  exportImage, exportFoundry, exportUvtt, exportRoll20, exportPdf,
  DEFAULT_IMAGE_EXPORT, type ImageExportOptions, isDesktop,
} from '../../export';
import { DEFAULT_FOUNDRY_OPTIONS, type FoundryExportOptions, slug } from '../../export/foundry';
import { DEFAULT_PDF_OPTIONS, type PdfOptions, type PageSize } from '../../export/pdf';
import { useLang } from '../../i18n/useLang';

export type ExportFormat = 'png' | 'foundry' | 'uvtt' | 'roll20' | 'pdf';

// Only the ids live here; the label and blurb are looked up at render time so
// that a language switch with the dialog open repaints the cards too.
const FORMATS: ExportFormat[] = ['png', 'foundry', 'uvtt', 'roll20', 'pdf'];

export function ExportDialog({ initial, onClose }: { initial?: ExportFormat; onClose: () => void }) {
  const editor = useEditor();
  const { t } = useLang();
  const doc = editor.doc;
  const [format, setFormat] = React.useState<ExportFormat>(initial || 'png');
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<string | null>(null);

  const [img, setImg] = React.useState<ImageExportOptions>({
    ...DEFAULT_IMAGE_EXPORT,
    paletteId: editor.paletteId,
    includeGrid: doc.grid.visible,
    // A dungeon or a cave is lit by what is burning in it, and an image export
    // is the one that ends up printed or pasted into a document — nothing else
    // is going to add the torchlight later. (A VTT export overrides this: the
    // table's own lighting engine wants a flat image to work from.)
    bakedLighting: (doc.kind === 'dungeon' || doc.kind === 'cave') && doc.lighting.darkness > 0,
  });
  const [foundry, setFoundry] = React.useState<FoundryExportOptions>({
    ...DEFAULT_FOUNDRY_OPTIONS,
    padding: doc.vttPadding,
    imagePath: `worlds/my-world/scenes/${slug(doc.meta.title)}.png`,
  });
  const [pdf, setPdf] = React.useState<PdfOptions>({ ...DEFAULT_PDF_OPTIONS, title: doc.meta.title });

  const outW = Math.round(doc.width * img.scale);
  const outH = Math.round(doc.height * img.scale);
  const megapixels = (outW * outH) / 1e6;

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      let res;
      if (format === 'png') res = await exportImage(doc, img);
      else if (format === 'foundry') res = await exportFoundry(doc, img, foundry);
      else if (format === 'uvtt') res = await exportUvtt(doc, img);
      else if (format === 'roll20') res = await exportRoll20(doc, img);
      else res = await exportPdf(doc, img, pdf);

      if (res.cancelled) setResult(null);
      else {
        setResult(res.path || t('export.saved'));
        editor.status(t('export.status.done', { path: res.path ?? '' }));
      }
    } catch (err) {
      console.error(err);
      editor.status(t('export.status.failed', { error: (err as Error).message }));
      setResult(t('export.result.failed', { error: (err as Error).message }));
    } finally {
      setBusy(false);
    }
  };

  const setPreset = (preset: 'roll20' | 'foundry' | 'print' | 'web') => {
    if (preset === 'roll20') setImg({ ...img, scale: 70 / Math.max(1, doc.grid.size), includeGrid: false, format: 'png' });
    if (preset === 'foundry') setImg({ ...img, scale: 1, includeGrid: false, format: 'png' });
    if (preset === 'print') setImg({ ...img, scale: Math.min(4, 300 / 96), includeGrid: true, format: 'png' });
    if (preset === 'web') setImg({ ...img, scale: Math.min(1, 2000 / doc.width), includeGrid: true, format: 'jpg', quality: 0.86 });
  };

  return (
    <Modal
      title={t('action.export')}
      size="wide"
      onClose={onClose}
      footer={
        <>
          <span className="grow hint">
            {result
              ? t('export.savedTo', { path: result })
              : isDesktop() ? t('export.nativeDialog') : t('export.browserDownload')}
          </span>
          <button className="btn" onClick={onClose}>{t('action.close')}</button>
          <button className="btn primary" onClick={run} disabled={busy}>
            {busy ? t('export.busy') : t('action.export')}
          </button>
        </>
      }
    >
      <div className="card-grid" style={{ marginBottom: 18 }}>
        {FORMATS.map((id) => (
          <div key={id} className={`card ${format === id ? 'active' : ''}`} onClick={() => setFormat(id)}>
            <h4>{t(`export.fmt.${id}`)}</h4>
            <p>{t(`export.fmt.${id}.blurb`)}</p>
          </div>
        ))}
      </div>

      <div className="grid-2">
        <div>
          <Section title={t('export.section.image')}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
              <button className="btn small" onClick={() => setPreset('web')}>{t('export.preset.web')}</button>
              <button className="btn small" onClick={() => setPreset('print')}>{t('export.preset.print')}</button>
              <button className="btn small" onClick={() => setPreset('foundry')}>{t('export.preset.foundry')}</button>
              <button className="btn small" onClick={() => setPreset('roll20')}>{t('export.preset.roll20')}</button>
            </div>
            <Slider label={t('export.resolution')} value={img.scale} min={0.1} max={4} step={0.05}
              onChange={(v) => setImg({ ...img, scale: v })} format={(v) => `${Math.round(v * 100)}%`} />
            <p className="hint" style={{ marginTop: -4, marginBottom: 10 }}>
              {t('export.output', { w: outW, h: outH, mp: megapixels.toFixed(1) })}
              {megapixels > 60 && <strong style={{ color: 'var(--accent)' }}>{t('export.veryLarge')}</strong>}
            </p>
            {format !== 'uvtt' && format !== 'roll20' && (
              <SelectField label={t('export.fileFormat')} value={img.format}
                options={[{ value: 'png', label: t('export.png') }, { value: 'jpg', label: 'JPEG' }, { value: 'webp', label: 'WebP' }] as { value: ImageExportOptions['format']; label: string }[]}
                onChange={(v) => setImg({ ...img, format: v })} />
            )}
            {img.format !== 'png' && (
              <Slider label={t('export.quality')} value={img.quality} min={0.4} max={1} step={0.02}
                onChange={(v) => setImg({ ...img, quality: v })} format={(v) => `${Math.round(v * 100)}%`} />
            )}
            <SelectField label={t('export.audience')} value={img.audience}
              options={[
                { value: 'gm', label: t('export.audience.gm') },
                { value: 'player', label: t('export.audience.player') },
              ] as { value: 'gm' | 'player'; label: string }[]}
              onChange={(v) => setImg({ ...img, audience: v, includeNotes: v === 'gm' && img.includeNotes })} />
            {img.audience === 'player' && (
              <p className="hint" style={{ marginTop: -4, marginBottom: 8 }}>
                {t('export.playerHint')}
              </p>
            )}
            <Toggle label={t('export.drawGrid')} value={img.includeGrid} onChange={(v) => setImg({ ...img, includeGrid: v })} />
            <Toggle label={t('export.drawWalls')} value={img.includeWalls} onChange={(v) => setImg({ ...img, includeWalls: v })} />
            <Toggle label={t('export.drawLights')} value={img.includeLights} onChange={(v) => setImg({ ...img, includeLights: v })} />
            <Toggle label={t('export.drawNotes')} value={img.includeNotes} onChange={(v) => setImg({ ...img, includeNotes: v })} />
            <Toggle label={t('export.bakeLighting')} value={img.bakedLighting}
              onChange={(v) => setImg({ ...img, bakedLighting: v })} />
            {img.bakedLighting && (
              <p className="hint">{t('export.bakeHint')}</p>
            )}
          </Section>
        </div>

        <div>
          {format === 'foundry' && (
            <Section title={t('export.fmt.foundry')}>
              <TextField label={t('export.foundry.imagePath')} value={foundry.imagePath}
                onChange={(v) => setFoundry({ ...foundry, imagePath: v })} />
              <SelectField label={t('export.foundry.version')} value={String(foundry.version)}
                options={[{ value: '13', label: 'v13' }, { value: '12', label: 'v12' }, { value: '11', label: 'v11 / v10' }]}
                onChange={(v) => setFoundry({ ...foundry, version: Number(v) as 11 | 12 | 13 })} />
              <Slider label={t('export.foundry.padding')} value={foundry.padding} min={0} max={0.5} step={0.05}
                onChange={(v) => setFoundry({ ...foundry, padding: v })} />
              <Toggle label={t('export.foundry.tokenVision')} value={foundry.tokenVision} onChange={(v) => setFoundry({ ...foundry, tokenVision: v })} />
              <Toggle label={t('export.foundry.fog')} value={foundry.fogExploration} onChange={(v) => setFoundry({ ...foundry, fogExploration: v })} />
              <Toggle label={t('export.foundry.tokens')} value={foundry.includeTokens} onChange={(v) => setFoundry({ ...foundry, includeTokens: v })} />
              <Toggle label={t('export.foundry.nav')} value={foundry.navigation} onChange={(v) => setFoundry({ ...foundry, navigation: v })} />
              <p className="hint">
                {t('export.foundry.hint')}
              </p>
            </Section>
          )}

          {format === 'uvtt' && (
            <Section title={t('export.fmt.uvtt')}>
              <p className="hint">
                {t('export.uvtt.hint')}
              </p>
              <p className="hint" style={{ marginTop: 8 }}>
                {t('export.uvtt.grid', {
                  cols: (doc.width / doc.grid.size).toFixed(2),
                  rows: (doc.height / doc.grid.size).toFixed(2),
                })}
                {(doc.width % doc.grid.size !== 0 || doc.height % doc.grid.size !== 0) && (
                  <strong style={{ color: 'var(--accent)' }}>{t('export.uvtt.warn')}</strong>
                )}
              </p>
            </Section>
          )}

          {format === 'roll20' && (
            <Section title={t('export.fmt.roll20')}>
              <p className="hint">
                {t('export.roll20.hint')}
              </p>
            </Section>
          )}

          {format === 'pdf' && (
            <Section title={t('export.pdf.section')}>
              <SelectField label={t('export.pdf.pageSize')} value={pdf.page}
                options={[
                  { value: 'fit', label: t('export.pdf.fit') },
                  { value: 'a4', label: 'A4' }, { value: 'a3', label: 'A3' },
                  { value: 'letter', label: 'Letter' }, { value: 'tabloid', label: 'Tabloid' },
                ] as { value: PageSize; label: string }[]}
                onChange={(v) => setPdf({ ...pdf, page: v })} />
              <Toggle label={t('export.pdf.landscape')} value={pdf.landscape} onChange={(v) => setPdf({ ...pdf, landscape: v })} />
              <Toggle label={t('export.pdf.tiled')} value={pdf.tiled}
                onChange={(v) => setPdf({ ...pdf, tiled: v })} />
              {pdf.tiled && (
                <>
                  <NumberField label={t('export.pdf.inchesPerCell')} value={pdf.inchesPerCell} min={0.25} max={3} step={0.05}
                    onChange={(v) => setPdf({ ...pdf, inchesPerCell: v })} />
                  <NumberField label={t('export.pdf.overlap')} value={pdf.overlap} min={0} max={72} suffix={t('field.pt')}
                    onChange={(v) => setPdf({ ...pdf, overlap: v })} />
                  <Toggle label={t('export.pdf.cropMarks')} value={pdf.cropMarks} onChange={(v) => setPdf({ ...pdf, cropMarks: v })} />
                  <p className="hint">
                    {t('export.pdf.sheets', {
                      cols: Math.round(doc.width / doc.grid.size),
                      rows: Math.round(doc.height / doc.grid.size),
                      inches: pdf.inchesPerCell,
                      sw: Math.ceil((doc.width / doc.grid.size) * pdf.inchesPerCell / 7.5),
                      sh: Math.ceil((doc.height / doc.grid.size) * pdf.inchesPerCell / 10),
                    })}
                  </p>
                </>
              )}
              <NumberField label={t('export.pdf.margin')} value={pdf.margin} min={0} max={72} suffix={t('field.pt')}
                onChange={(v) => setPdf({ ...pdf, margin: v })} />
            </Section>
          )}

          {format === 'png' && (
            <Section title={t('export.notes')}>
              <p className="hint">
                {t('export.notes.vtt')}
              </p>
              <p className="hint" style={{ marginTop: 8 }}>
                {t('export.notes.print')}
              </p>
            </Section>
          )}
        </div>
      </div>
    </Modal>
  );
}
