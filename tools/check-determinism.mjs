/**
 * Same seed, same map.
 *
 * The promise the whole application rests on: a GM who writes a seed in their
 * notes can hand it to a player and get the same coastline back next week. It
 * has to be checked on the *picture*, not on the document, because the two
 * came apart for a long time without anyone noticing — the documents were
 * byte-identical while every road on every map wandered somewhere new, because
 * `pathPolyline` seeded a path's wobble from the object id, and an id is
 * random by construction. Comparing JSON would still say that was fine.
 *
 * So this generates each kind twice from one seed, renders both, and compares
 * the pixels. Everything reachable from a generator — noise fields, texture
 * synthesis, stamp rasterisation, path wobble, label layout — is downstream of
 * that comparison.
 */
import pw from 'playwright';
const { chromium } = pw;
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.join(dist, url === '/' ? 'index.html' : url);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(4327, r));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
page.on('pageerror', (e) => console.log('PAGE ERROR', String(e)));
await page.goto('http://localhost:4327/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.Aetheria, { timeout: 30000 });

const KINDS = ['region', 'operational', 'city', 'castle', 'dungeon', 'cave', 'battle'];
const SEED = 4242;

const results = await page.evaluate(async ({ kinds, seed }) => {
  const A = window.Aetheria;
  const pixels = (doc) => {
    // Small enough to be quick, large enough that a shifted road shows up.
    const s = A.render.toSurface(doc, { paletteId: 'atlas', scale: 0.28 });
    const cv = document.createElement('canvas');
    cv.width = s.width; cv.height = s.height;
    const ctx = cv.getContext('2d');
    ctx.drawImage(s, 0, 0);
    return ctx.getImageData(0, 0, cv.width, cv.height).data;
  };
  const out = [];
  for (const kind of kinds) {
    const opts = { seed, paletteId: 'atlas' };
    const a = pixels(A.generate[kind](opts).doc);
    const b = pixels(A.generate[kind](opts).doc);
    let differing = 0, worst = 0;
    for (let i = 0; i < a.length; i += 4) {
      const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      if (d > 0) differing++;
      if (d > worst) worst = d;
    }
    out.push({ kind, total: a.length / 4, differing, worst });
  }
  return out;
}, { kinds: KINDS, seed: SEED });

let failures = 0;
for (const r of results) {
  const share = ((r.differing / r.total) * 100).toFixed(3);
  if (r.differing === 0) {
    console.log(`PASS  ${r.kind.padEnd(12)} identical across two generations at seed ${SEED}`);
  } else {
    failures++;
    console.log(`FAIL  ${r.kind.padEnd(12)} ${r.differing} of ${r.total} pixels differ (${share}%), worst ${r.worst}/765`);
  }
}

await browser.close();
server.close();
console.log(`\n${results.length - failures}/${results.length} generators are deterministic`);
process.exit(failures ? 1 : 0);
