/**
 * Colour-vision audit for the map palettes.
 *
 * Roughly one man in twelve has a red-green deficiency, and a GM turns the
 * screen round so five people can look at once. "It looks fine to me" is not a
 * check, so this one measures: every palette's load-bearing pairs are compared
 * under normal vision and under simulated protanopia and deuteranopia, and the
 * palette that claims to be safe has to clear a threshold on all of them.
 *
 * The simulation is Viénot, Brettel & Mollon (1999) — the LMS projection model
 * for the two dichromacies — applied to linear-light RGB. The distance is
 * CIEDE2000, because RGB and even CIE76 both badly misjudge how far apart two
 * dark blues or two pale sands actually look.
 *
 *   npm run build && node tools/check-contrast.mjs
 *
 * Exits non-zero if a palette declared `cvdSafe` fails a pair.
 */
import pw from 'playwright';
const { chromium } = pw;
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hexToRgb, worstDeltaE as worst } from './cvd.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const out = path.join(root, 'gallery', 'contrast');

// ---------------------------------------------------------------------------
// What has to stay apart
// ---------------------------------------------------------------------------

/**
 * Thresholds in ΔE2000. A just-noticeable difference is about 2.3; these are
 * far above that because the question is not "can you tell if you compare them
 * side by side" but "can you tell across a table, in a hurry, with a hex of one
 * lying next to a hex of the other".
 *
 * Lines get a higher bar than areas: a two-pixel route crossing a border has
 * far less colour to show than a province of forest.
 */
const AREA = 14;
const LINE = 20;

/**
 * Pairs that colour alone is *not* asked to separate.
 *
 * Sand, dry plain and low ground all live at the light end of the yellow axis,
 * which is the one axis a dichromat still has. Forcing them apart would mean
 * lighting one of them up — an arid interior painted like a warning sign — and
 * would buy nothing, because the generator already draws them with different
 * textures: `dunes` has ripples, `grass` has tufts, `plains` has neither. These
 * are measured and printed, but they do not gate.
 */
const TEXTURE_SEPARATED = [
  ['lowland', 'desert'],
  ['desert', 'grass'],
  ['lowland', 'shore'],
];

const PAIRS = [
  ['forest', 'highland', AREA],
  ['forest', 'grass', AREA],
  ['forest', 'swamp', AREA],
  ['water', 'lowland', AREA],
  ['water', 'grass', AREA],
  ['deepWater', 'forest', AREA],
  ['shallowWater', 'shore', AREA],
  ['highland', 'rock', AREA],
  ['routes', 'border', LINE],
  ['routes', 'ink', LINE],
  ['border', 'ink', LINE],
  ['accent', 'routes', LINE],
];

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.join(dist, url === '/' ? 'index.html' : url);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(4344, r));

const browser = await chromium.launch({ executablePath: process.env.AETHERIA_CHROME || undefined });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
page.on('pageerror', (e) => console.log('PAGE ERROR', String(e)));
await page.goto('http://localhost:4344/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.Aetheria?.palettes, { timeout: 30000 });

const palettes = await page.evaluate(() => window.Aetheria.palettes.all());
const realmSets = await page.evaluate(() =>
  Object.fromEntries(window.Aetheria.palettes.all().map((p) => [p.id, window.Aetheria.palettes.realmColors(p.id)])));

let bad = 0;
for (const p of palettes) {
  const rows = PAIRS.map(([a, b, min]) => ({ a, b, min, d: worst(hexToRgb(p[a]), hexToRgb(p[b])) }));
  // Realms are drawn next to each other, so every pair of the first few has to
  // separate — not just consecutive ones.
  const realms = realmSets[p.id].slice(0, 6);
  let realmMin = Infinity, realmPair = '';
  for (let i = 0; i < realms.length; i++) {
    for (let j = i + 1; j < realms.length; j++) {
      const d = worst(hexToRgb(realms[i]), hexToRgb(realms[j]));
      if (d < realmMin) { realmMin = d; realmPair = `${realms[i]}/${realms[j]}`; }
    }
  }
  rows.push({ a: 'realm', b: realmPair, min: AREA, d: realmMin });
  const soft = TEXTURE_SEPARATED.map(([a, b]) => ({ a, b, d: worst(hexToRgb(p[a]), hexToRgb(p[b])) }));

  const fails = rows.filter((r) => r.d < r.min);
  const tag = p.cvdSafe ? 'SAFE' : 'art ';
  if (p.cvdSafe && fails.length) {
    bad++;
    console.log(`FAIL  ${tag} ${p.id}: ${fails.length} pair(s) below threshold`);
  } else if (p.cvdSafe) {
    console.log(`PASS  ${tag} ${p.id}: all ${rows.length} pairs clear (worst ΔE00 ${Math.min(...rows.map((r) => r.d)).toFixed(1)})`);
  } else {
    console.log(`      ${tag} ${p.id}: ${fails.length}/${rows.length} pair(s) below threshold (informational)`);
  }
  for (const r of rows) {
    const mark = r.d < r.min ? '  <' : '   ';
    if (p.cvdSafe || process.env.VERBOSE) {
      console.log(`      ${mark} ${(r.a + '/' + r.b).padEnd(28)} ΔE00 ${r.d.toFixed(1).padStart(5)}  (min ${r.min})`);
    }
  }
  if (p.cvdSafe || process.env.VERBOSE) {
    for (const r of soft) {
      console.log(`      ~   ${(r.a + '/' + r.b).padEnd(28)} ΔE00 ${r.d.toFixed(1).padStart(5)}  (texture-separated)`);
    }
  }
}

// ---------------------------------------------------------------------------
// A rendered map, put through the same simulation, so the numbers can be seen
// ---------------------------------------------------------------------------

if (process.env.SHEETS !== '0') {
  fs.mkdirSync(out, { recursive: true });
  for (const id of (process.env.SHEET_PALETTES || palettes.filter((p) => p.cvdSafe).map((p) => p.id).join(',')).split(',')) {
    if (!id) continue;
    const b64 = await page.evaluate(async (paletteId) => {
      const A = window.Aetheria;
      const { doc } = A.generate.region({ seed: 20250828, width: 1400, height: 900, paletteId, realms: 5 });
      const surf = A.render.toSurface(doc, { paletteId, scale: 1 });
      const cv = document.createElement('canvas');
      cv.width = surf.width; cv.height = surf.height;
      cv.getContext('2d').drawImage(surf, 0, 0);
      return cv.toDataURL('image/png').split(',')[1];
    }, id);
    const png = Buffer.from(b64, 'base64');
    fs.writeFileSync(path.join(out, `${id}-normal.png`), png);
    // Re-open the PNG in the page to get pixels, simulate, and write back.
    for (const kind of ['protan', 'deutan']) {
      const sim = await page.evaluate(async ({ b64, kind }) => {
        const img = new Image();
        await new Promise((r) => { img.onload = r; img.src = 'data:image/png;base64,' + b64; });
        const cv = document.createElement('canvas');
        cv.width = img.width; cv.height = img.height;
        const ctx = cv.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, cv.width, cv.height);
        const px = d.data;
        const s2l = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
        const l2s = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
        const cl = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
        for (let i = 0; i < px.length; i += 4) {
          const r = s2l(px[i] / 255), g = s2l(px[i + 1] / 255), b = s2l(px[i + 2] / 255);
          const L = 17.8824 * r + 43.5161 * g + 4.11935 * b;
          const M = 3.45565 * r + 27.1554 * g + 3.86714 * b;
          const S = 0.0299566 * r + 0.184309 * g + 1.46709 * b;
          let L2 = L, M2 = M;
          if (kind === 'protan') L2 = 2.02344 * M - 2.52581 * S; else M2 = 0.494207 * L + 1.24827 * S;
          px[i] = cl(l2s(cl(0.080944 * L2 - 0.130504 * M2 + 0.116721 * S))) * 255;
          px[i + 1] = cl(l2s(cl(-0.0102485 * L2 + 0.0540194 * M2 - 0.113615 * S))) * 255;
          px[i + 2] = cl(l2s(cl(-0.000365294 * L2 - 0.00412163 * M2 + 0.693513 * S))) * 255;
        }
        ctx.putImageData(d, 0, 0);
        return cv.toDataURL('image/png').split(',')[1];
      }, { b64, kind });
      fs.writeFileSync(path.join(out, `${id}-${kind}.png`), Buffer.from(sim, 'base64'));
    }
    console.log(`\nwrote ${id} normal/protan/deutan to ${out}`);
  }
}

await browser.close();
server.close();
process.exit(bad ? 1 : 0);
