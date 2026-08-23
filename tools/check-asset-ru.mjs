/**
 * Coverage audit for the Russian stamp names.
 *
 * Runs against the live registry rather than the source files, because the
 * icon shelves are generated and a grep over `id:` would miss whatever the
 * next generator adds. Boots the built app, pulls `allAssets()` out of the
 * `window.Aetheria` bridge, and compares it with `src/i18n/assets.ru.ts`.
 *
 *   npm run build && node tools/check-asset-ru.mjs
 *
 * Exits non-zero on a gap, so it can gate a release.
 */
import pw from '/home/claude/.npm-global/lib/node_modules/playwright/index.js';
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
await new Promise((r) => server.listen(4337, r));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR', String(e)));
await page.goto('http://localhost:4337/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.Aetheria, { timeout: 30000 });
const registry = await page.evaluate(() =>
  window.Aetheria.assets.all().map((a) => ({ id: a.id, label: a.label, sub: a.sub || '' })));
await browser.close();
server.close();

// The dictionary is a flat literal on purpose; a regex reads it without a
// TypeScript toolchain in the loop.
const src = fs.readFileSync(path.join(root, 'src/i18n/assets.ru.ts'), 'utf8');
function mapOf(name) {
  const body = src.split(`export const ${name}: Record<string, string> = {`)[1].split('\n};')[0];
  const out = new Map();
  for (const m of body.matchAll(/^ {2}'((?:[^'\\]|\\.)*)': '((?:[^'\\]|\\.)*)',$/gm)) out.set(m[1], m[2]);
  return out;
}
const names = mapOf('ASSETS_RU');
const shelves = mapOf('SHELVES_RU');

const ids = registry.map((a) => a.id);
const subs = [...new Set(registry.map((a) => a.sub).filter(Boolean))];

const missing = ids.filter((id) => !names.has(id));
const orphan = [...names.keys()].filter((id) => !ids.includes(id));
const missingShelf = subs.filter((s) => !shelves.has(s));
const orphanShelf = [...shelves.keys()].filter((s) => !subs.includes(s));

console.log(`stamps    ${ids.length - missing.length}/${ids.length} translated`);
console.log(`shelves   ${subs.length - missingShelf.length}/${subs.length} translated`);

// Captions sit under a 64px thumbnail and ellipsise. Anything past this reads
// as a truncated word, so flag it rather than fail on it.
const CAP = 22;
const long = [...names.entries()].filter(([, ru]) => ru.length > CAP);
if (long.length) {
  console.log(`\n${long.length} caption(s) over ${CAP} characters:`);
  for (const [id, ru] of long) console.log(`  ${id.padEnd(28)} ${ru} (${ru.length})`);
}

let bad = false;
for (const [title, list] of [
  ['untranslated stamps', missing],
  ['stale entries (id not in the registry)', orphan],
  ['untranslated shelves', missingShelf],
  ['stale shelves', orphanShelf],
]) {
  if (!list.length) continue;
  bad = true;
  console.log(`\n${title}: ${list.length}`);
  for (const x of list) console.log(`  ${x}`);
}
if (bad) process.exit(1);
console.log('\ncoverage complete');
