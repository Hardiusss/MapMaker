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

export type ExportFormat = 'png' | 'foundry' | 'uvtt' | 'roll20' | 'pdf';

const FORMATS: { id: ExportFormat; label: string; blurb: string }[] = [
  { id: 'png', label: 'Image', blurb: 'PNG, JPEG or WebP at any resolution. For printing, VTT uploads or sharing.' },
  { id: 'foundry', label: 'Foundry VTT', blurb: 'Scene JSON + image. Walls, doors, lights and note pins come across.' },
  { id: 'uvtt', label: 'Universal VTT', blurb: '.dd2vtt with the image embedded — line of sight, portals and lights.' },
  { id: 'roll20', label: 'Roll20', blurb: '70 px/cell image plus page settings and dynamic-lighting paths.' },
  { id: 'pdf', label: 'Print PDF', blurb: 'Single page, or tiled across sheets at true 1-inch-per-square scale.' },
];

export function ExportDialog({ initial, onClose }: { initial?: ExportFormat; onClose: () => void }) {
  const editor = useEditor();
  const doc = editor.doc;
  const [format, setFormat] = React.useState<ExportFormat>(initial || 'png');
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<string | null>(null);

  const [img, setImg] = React.useState<ImageExportOptions>({
    ...DEFAULT_IMAGE_EXPORT,
    paletteId: editor.paletteId,
    includeGrid: doc.grid.visible,
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
        setResult(res.path || 'Saved');
        editor.status(`Exported to ${res.path}`);
      }
    } catch (err) {
      console.error(err);
      editor.status(`Export failed: ${(err as Error).message}`);
      setResult(`Failed: ${(err as Error).message}`);
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
      title="Export"
      size="wide"
      onClose={onClose}
      footer={
        <>
          <span className="grow hint">
            {result ? `Saved: ${result}` : isDesktop() ? 'A native save dialog will open.' : 'The file will download to your browser.'}
          </span>
          <button className="btn" onClick={onClose}>Close</button>
          <button className="btn primary" onClick={run} disabled={busy}>{busy ? 'Exporting…' : 'Export'}</button>
        </>
      }
    >
      <div className="card-grid" style={{ marginBottom: 18 }}>
        {FORMATS.map((f) => (
          <div key={f.id} className={`card ${format === f.id ? 'active' : ''}`} onClick={() => setFormat(f.id)}>
            <h4>{f.label}</h4>
            <p>{f.blurb}</p>
          </div>
        ))}
      </div>

      <div className="grid-2">
        <div>
          <Section title="Image">
            <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
              <button className="btn small" onClick={() => setPreset('web')}>Web</button>
              <button className="btn small" onClick={() => setPreset('print')}>Print 300dpi</button>
              <button className="btn small" onClick={() => setPreset('foundry')}>Foundry 1:1</button>
              <button className="btn small" onClick={() => setPreset('roll20')}>Roll20 70px/cell</button>
            </div>
            <Slider label="Resolution" value={img.scale} min={0.1} max={4} step={0.05}
              onChange={(v) => setImg({ ...img, scale: v })} format={(v) => `${Math.round(v * 100)}%`} />
            <p className="hint" style={{ marginTop: -4, marginBottom: 10 }}>
              Output: {outW} × {outH} px ({megapixels.toFixed(1)} MP)
              {megapixels > 60 && <strong style={{ color: 'var(--accent)' }}> — very large, may be slow</strong>}
            </p>
            {format !== 'uvtt' && format !== 'roll20' && (
              <SelectField label="File format" value={img.format}
                options={[{ value: 'png', label: 'PNG (lossless)' }, { value: 'jpg', label: 'JPEG' }, { value: 'webp', label: 'WebP' }] as { value: ImageExportOptions['format']; label: string }[]}
                onChange={(v) => setImg({ ...img, format: v })} />
            )}
            {img.format !== 'png' && (
              <Slider label="Quality" value={img.quality} min={0.4} max={1} step={0.02}
                onChange={(v) => setImg({ ...img, quality: v })} format={(v) => `${Math.round(v * 100)}%`} />
            )}
            <SelectField label="Audience" value={img.audience}
              options={[
                { value: 'gm', label: 'GM — everything' },
                { value: 'player', label: 'Players — hide GM-only layers' },
              ] as { value: 'gm' | 'player'; label: string }[]}
              onChange={(v) => setImg({ ...img, audience: v, includeNotes: v === 'gm' && img.includeNotes })} />
            {img.audience === 'player' && (
              <p className="hint" style={{ marginTop: -4, marginBottom: 8 }}>
                Layers marked GM-only in the Layers panel are left out, and the filename
                gets a <code>-player</code> suffix so the two versions never get mixed up.
              </p>
            )}
            <Toggle label="Draw grid" value={img.includeGrid} onChange={(v) => setImg({ ...img, includeGrid: v })} />
            <Toggle label="Draw walls (GM reference)" value={img.includeWalls} onChange={(v) => setImg({ ...img, includeWalls: v })} />
            <Toggle label="Draw light markers" value={img.includeLights} onChange={(v) => setImg({ ...img, includeLights: v })} />
            <Toggle label="Draw note pins" value={img.includeNotes} onChange={(v) => setImg({ ...img, includeNotes: v })} />
            <Toggle label="Bake lighting into the image" value={img.bakedLighting}
              onChange={(v) => setImg({ ...img, bakedLighting: v })} />
            {img.bakedLighting && (
              <p className="hint">Lights are burned into the picture and left out of the VTT data.</p>
            )}
          </Section>
        </div>

        <div>
          {format === 'foundry' && (
            <Section title="Foundry VTT">
              <TextField label="Background image path in Foundry" value={foundry.imagePath}
                onChange={(v) => setFoundry({ ...foundry, imagePath: v })} />
              <SelectField label="Target version" value={String(foundry.version)}
                options={[{ value: '13', label: 'v13' }, { value: '12', label: 'v12' }, { value: '11', label: 'v11 / v10' }]}
                onChange={(v) => setFoundry({ ...foundry, version: Number(v) as 11 | 12 | 13 })} />
              <Slider label="Scene padding" value={foundry.padding} min={0} max={0.5} step={0.05}
                onChange={(v) => setFoundry({ ...foundry, padding: v })} />
              <Toggle label="Token vision" value={foundry.tokenVision} onChange={(v) => setFoundry({ ...foundry, tokenVision: v })} />
              <Toggle label="Fog exploration" value={foundry.fogExploration} onChange={(v) => setFoundry({ ...foundry, fogExploration: v })} />
              <Toggle label="Include tokens" value={foundry.includeTokens} onChange={(v) => setFoundry({ ...foundry, includeTokens: v })} />
              <Toggle label="Show in navigation bar" value={foundry.navigation} onChange={(v) => setFoundry({ ...foundry, navigation: v })} />
              <p className="hint">
                You get a .zip with the image, the scene JSON and a short README.
                Drop the image in your world's folder and use Scenes → Import Data.
              </p>
            </Section>
          )}

          {format === 'uvtt' && (
            <Section title="Universal VTT">
              <p className="hint">
                The image is embedded inside the .dd2vtt, so it is a single file.
                Wall segments are chained into polylines and doors become portals.
              </p>
              <p className="hint" style={{ marginTop: 8 }}>
                Grid must divide the image evenly. Current map:
                {' '}{(doc.width / doc.grid.size).toFixed(2)} × {(doc.height / doc.grid.size).toFixed(2)} cells
                {(doc.width % doc.grid.size !== 0 || doc.height % doc.grid.size !== 0) && (
                  <strong style={{ color: 'var(--accent)' }}> — not a whole number; some VTTs will complain.</strong>
                )}
              </p>
            </Section>
          )}

          {format === 'roll20' && (
            <Section title="Roll20">
              <p className="hint">
                Roll20 works in 70 px units. The bundle contains the image rescaled to
                70 px per cell, the exact Page Settings numbers, and the wall paths as JSON
                for the community wall-import API scripts.
              </p>
            </Section>
          )}

          {format === 'pdf' && (
            <Section title="Print">
              <SelectField label="Page size" value={pdf.page}
                options={[
                  { value: 'fit', label: 'Fit page to map' },
                  { value: 'a4', label: 'A4' }, { value: 'a3', label: 'A3' },
                  { value: 'letter', label: 'Letter' }, { value: 'tabloid', label: 'Tabloid' },
                ] as { value: PageSize; label: string }[]}
                onChange={(v) => setPdf({ ...pdf, page: v })} />
              <Toggle label="Landscape" value={pdf.landscape} onChange={(v) => setPdf({ ...pdf, landscape: v })} />
              <Toggle label="Tile across pages (battle-map scale)" value={pdf.tiled}
                onChange={(v) => setPdf({ ...pdf, tiled: v })} />
              {pdf.tiled && (
                <>
                  <NumberField label="Inches per grid cell" value={pdf.inchesPerCell} min={0.25} max={3} step={0.05}
                    onChange={(v) => setPdf({ ...pdf, inchesPerCell: v })} />
                  <NumberField label="Overlap" value={pdf.overlap} min={0} max={72} suffix="pt"
                    onChange={(v) => setPdf({ ...pdf, overlap: v })} />
                  <Toggle label="Crop marks" value={pdf.cropMarks} onChange={(v) => setPdf({ ...pdf, cropMarks: v })} />
                  <p className="hint">
                    A {Math.round(doc.width / doc.grid.size)} × {Math.round(doc.height / doc.grid.size)} cell map at
                    {' '}{pdf.inchesPerCell}" per square prints about
                    {' '}{Math.ceil((doc.width / doc.grid.size) * pdf.inchesPerCell / 7.5)} ×
                    {' '}{Math.ceil((doc.height / doc.grid.size) * pdf.inchesPerCell / 10)} sheets.
                  </p>
                </>
              )}
              <NumberField label="Margin" value={pdf.margin} min={0} max={72} suffix="pt"
                onChange={(v) => setPdf({ ...pdf, margin: v })} />
            </Section>
          )}

          {format === 'png' && (
            <Section title="Notes">
              <p className="hint">
                For a VTT, export at 1:1 with the grid switched off — the table draws its own grid,
                and a baked grid that is a pixel out is very hard to unsee.
              </p>
              <p className="hint" style={{ marginTop: 8 }}>
                For print, 300 dpi is 3.125× the on-screen size; the “Print 300dpi” preset sets that up.
              </p>
            </Section>
          )}
        </div>
      </div>
    </Modal>
  );
}
