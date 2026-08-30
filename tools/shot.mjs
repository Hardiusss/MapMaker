/**
 * Render whatever you are working on, in the real app, to a PNG you can look at.
 *
 *   node tools/shot.mjs <script.js> [outdir]
 *
 * The script is evaluated inside the built page with `window.Aetheria` in
 * scope, and returns an array of `{ name, b64 }`; each becomes `<name>.png`
 * in the output directory (`shot-output/` by default). Console output and
 * page errors are printed, so it doubles as a way to poke at the API.
 *
 * `asset-sheet.mjs` renders the whole library and `gallery.mjs` renders whole
 * maps; both are fixed layouts. This is the one for the question you have
 * today — one texture at four palettes, one stamp at six seeds, a castle
 * cropped to the corner you are arguing about — where the layout is part of
 * what you are working out. Typechecking a canvas routine tells you nothing
 * about whether it looks like wood, so a change to anything that draws should
 * be looked at before and after, and that needs to be one command.
 *
 *   cat > /tmp/planks.js <<'END'
 *   const A = window.Aetheria;
 *   const cv = document.createElement('canvas');
 *   cv.width = 512; cv.height = 256;
 *   const ctx = cv.getContext('2d');
 *   ['atlas', 'frostmark'].forEach((p, i) => {
 *     ctx.drawImage(A.textures.get('mat/weathered-timber',
 *       { size: 256, paletteId: p, seed: 7, detail: 1 }), i * 256, 0);
 *   });
 *   return [{ name: 'planks', b64: cv.toDataURL('image/png').split(',')[1] }];
 *   END
 *   node tools/shot.mjs /tmp/planks.js
 */
import pw from 'playwright';
const { chromium } = pw;
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const scriptArg = process.argv[2];
if (!scriptArg) {
  console.error('usage: node tools/shot.mjs <script.js> [outdir]');
  process.exit(2);
}
const script = path.resolve(scriptArg);
if (!fs.existsSync(script)) {
  console.error(`no such script: ${script}`);
  process.exit(2);
}
if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('dist/ is empty — run `npm run build` first.');
  process.exit(2);
}
const out = path.resolve(process.argv[3] || path.join(root, 'shot-output'));
fs.mkdirSync(out, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.join(dist, url === '/' ? 'index.html' : url);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
const PORT = Number(process.env.PORT || 4411);
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch({ executablePath: process.env.AETHERIA_CHROME || undefined });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
let failed = false;
page.on('pageerror', (e) => { failed = true; console.log('PAGE ERROR', String(e)); });
page.on('console', (m) => console.log(`[${m.type()}]`, m.text()));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.Aetheria, { timeout: 30000 });

// Wrapped in an async IIFE so the script can `await` and must `return`.
const body = fs.readFileSync(script, 'utf8');
let shots = [];
try {
  shots = await page.evaluate(`(async () => { ${body} })()`) || [];
} catch (err) {
  failed = true;
  console.log('SCRIPT ERROR', String(err).split('\n')[0]);
}
for (const s of shots) {
  fs.writeFileSync(path.join(out, `${s.name}.png`), Buffer.from(s.b64, 'base64'));
  console.log('wrote', path.join(out, `${s.name}.png`));
}
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
