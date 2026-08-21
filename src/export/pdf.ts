/**
 * PDF output, written by hand.
 *
 * Two modes: a single page sized to the map, or a tiled multi-page layout for
 * printing a battle map at true 1-inch-per-square scale on A4/Letter and taping
 * the sheets together. JPEG data is embedded directly with DCTDecode, so there
 * is no compression library involved.
 */
import type { Surface } from '../util/canvas';
import { createSurface, ctxOf } from '../util/canvas';

export type PageSize = 'a4' | 'a3' | 'letter' | 'tabloid' | 'fit';

const PAGE_PT: Record<Exclude<PageSize, 'fit'>, [number, number]> = {
  a4: [595.28, 841.89],
  a3: [841.89, 1190.55],
  letter: [612, 792],
  tabloid: [792, 1224],
};

export interface PdfOptions {
  page: PageSize;
  landscape: boolean;
  /** Print tiled across multiple pages at real-world scale. */
  tiled: boolean;
  /** Physical size of one grid cell, in inches (1 inch = a 5 ft square). */
  inchesPerCell: number;
  /** Page margin in points. */
  margin: number;
  /** Overlap between tiles, in points, to make taping easier. */
  overlap: number;
  jpegQuality: number;
  title: string;
  cropMarks: boolean;
}

export const DEFAULT_PDF_OPTIONS: PdfOptions = {
  page: 'a4', landscape: true, tiled: false, inchesPerCell: 1,
  margin: 24, overlap: 12, jpegQuality: 0.9, title: 'Map', cropMarks: true,
};

interface PdfObject { id: number; body: string | Uint8Array; }

const encoder = new TextEncoder();

function concat(chunks: (string | Uint8Array)[]): Uint8Array {
  const parts = chunks.map((c) => (typeof c === 'string' ? encoder.encode(c) : c));
  const total = parts.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const part of parts) { out.set(part, p); p += part.length; }
  return out;
}

function jpegBytes(surface: Surface, quality: number): Uint8Array {
  const url = surface.toDataURL('image/jpeg', quality);
  const b64 = url.slice(url.indexOf(',') + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function buildPdf(surface: Surface, gridCellPx: number, opts: Partial<PdfOptions> = {}): Uint8Array {
  const o = { ...DEFAULT_PDF_OPTIONS, ...opts };

  const pages: { image: Surface; wPt: number; hPt: number; xPt: number; yPt: number; pageW: number; pageH: number; label?: string }[] = [];

  if (o.page === 'fit' || !o.tiled) {
    let pageW: number, pageH: number;
    if (o.page === 'fit') {
      // 96 CSS px per inch, 72 pt per inch.
      pageW = (surface.width / 96) * 72;
      pageH = (surface.height / 96) * 72;
    } else {
      const [a, b] = PAGE_PT[o.page];
      pageW = o.landscape ? b : a;
      pageH = o.landscape ? a : b;
    }
    const availW = pageW - o.margin * 2;
    const availH = pageH - o.margin * 2;
    const scale = o.page === 'fit' ? 1 : Math.min(availW / surface.width, availH / surface.height);
    const wPt = surface.width * scale;
    const hPt = surface.height * scale;
    pages.push({
      image: surface, wPt, hPt,
      xPt: (pageW - wPt) / 2, yPt: (pageH - hPt) / 2,
      pageW, pageH,
    });
  } else {
    const [a, b] = PAGE_PT[o.page];
    const pageW = o.landscape ? b : a;
    const pageH = o.landscape ? a : b;
    const availW = pageW - o.margin * 2 + o.overlap;
    const availH = pageH - o.margin * 2 + o.overlap;

    // Points per source pixel so that one cell prints at `inchesPerCell`.
    const ptPerPx = (o.inchesPerCell * 72) / Math.max(1, gridCellPx);
    const tilePxW = Math.floor(availW / ptPerPx);
    const tilePxH = Math.floor(availH / ptPerPx);
    const cols = Math.ceil(surface.width / tilePxW);
    const rows = Math.ceil(surface.height / tilePxH);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const sx = c * tilePxW;
        const sy = r * tilePxH;
        const sw = Math.min(tilePxW, surface.width - sx);
        const sh = Math.min(tilePxH, surface.height - sy);
        const tile = createSurface(sw, sh);
        ctxOf(tile).drawImage(surface, sx, sy, sw, sh, 0, 0, sw, sh);
        pages.push({
          image: tile,
          wPt: sw * ptPerPx,
          hPt: sh * ptPerPx,
          xPt: o.margin,
          yPt: pageH - o.margin - sh * ptPerPx,
          pageW, pageH,
          label: `${o.title} — row ${r + 1}, column ${c + 1} of ${rows}×${cols}`,
        });
      }
    }
  }

  // --- Assemble the PDF ----------------------------------------------------
  const objects: PdfObject[] = [];
  let nextId = 1;
  const alloc = () => nextId++;

  const catalogId = alloc();
  const pagesId = alloc();
  const fontId = alloc();

  const pageIds: number[] = [];
  const chunks: (string | Uint8Array)[] = [];

  for (const p of pages) {
    const imgId = alloc();
    const contentId = alloc();
    const pageId = alloc();
    pageIds.push(pageId);

    const jpeg = jpegBytes(p.image, o.jpegQuality);
    objects.push({
      id: imgId,
      body: concat([
        `<< /Type /XObject /Subtype /Image /Width ${p.image.width} /Height ${p.image.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
        jpeg,
        '\nendstream',
      ]),
    });

    let content = `q\n${p.wPt.toFixed(2)} 0 0 ${p.hPt.toFixed(2)} ${p.xPt.toFixed(2)} ${p.yPt.toFixed(2)} cm\n/Im${imgId} Do\nQ\n`;
    if (o.cropMarks && pages.length > 1) {
      const m = 8;
      content += `0.5 w 0.6 G\n`;
      const corners: [number, number][] = [
        [p.xPt, p.yPt], [p.xPt + p.wPt, p.yPt], [p.xPt, p.yPt + p.hPt], [p.xPt + p.wPt, p.yPt + p.hPt],
      ];
      for (const [x, y] of corners) {
        content += `${(x - m).toFixed(1)} ${y.toFixed(1)} m ${(x + m).toFixed(1)} ${y.toFixed(1)} l S\n`;
        content += `${x.toFixed(1)} ${(y - m).toFixed(1)} m ${x.toFixed(1)} ${(y + m).toFixed(1)} l S\n`;
      }
    }
    if (p.label) {
      content += `BT /F1 8 Tf 0.35 g ${o.margin.toFixed(1)} ${(p.pageH - 14).toFixed(1)} Td (${escapePdfText(p.label)}) Tj ET\n`;
    }
    const contentBytes = encoder.encode(content);
    objects.push({
      id: contentId,
      body: concat([`<< /Length ${contentBytes.length} >>\nstream\n`, contentBytes, '\nendstream']),
    });

    objects.push({
      id: pageId,
      body: `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${p.pageW.toFixed(2)} ${p.pageH.toFixed(2)}] ` +
        `/Resources << /XObject << /Im${imgId} ${imgId} 0 R >> /Font << /F1 ${fontId} 0 R >> >> ` +
        `/Contents ${contentId} 0 R >>`,
    });
  }

  objects.push({ id: catalogId, body: `<< /Type /Catalog /Pages ${pagesId} 0 R >>` });
  objects.push({
    id: pagesId,
    body: `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((i) => `${i} 0 R`).join(' ')}] >>`,
  });
  objects.push({ id: fontId, body: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>' });

  objects.sort((a, b) => a.id - b.id);

  chunks.push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const offsets = new Map<number, number>();
  let length = encoder.encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n').length;

  for (const obj of objects) {
    offsets.set(obj.id, length);
    const head = `${obj.id} 0 obj\n`;
    const tail = '\nendobj\n';
    const bodyBytes = typeof obj.body === 'string' ? encoder.encode(obj.body) : obj.body;
    chunks.push(head, bodyBytes, tail);
    length += encoder.encode(head).length + bodyBytes.length + encoder.encode(tail).length;
  }

  const xrefStart = length;
  let xref = `xref\n0 ${nextId}\n0000000000 65535 f \n`;
  for (let i = 1; i < nextId; i++) {
    const off = offsets.get(i) ?? 0;
    xref += `${off.toString().padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${nextId} /Root ${catalogId} 0 R /Producer (Aetheria Cartographer) /Title (${escapePdfText(o.title)}) >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  chunks.push(xref);

  return concat(chunks);
}

function escapePdfText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}
