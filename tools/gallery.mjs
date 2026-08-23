/**
 * Renders a gallery of variants straight from the scripting API — every dungeon
 * layout, every battle biome, every landmass shape — so a change to a generator
 * can be eyeballed across the whole space rather than one lucky seed.
 */
import pw from '/home/claude/.npm-global/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const out = path.join(root, 'gallery');
fs.mkdirSync(out, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  let file = path.join(dist, url === '/' ? 'index.html' : url);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(4323, r));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
page.on('pageerror', (e) => console.log('PAGE ERROR', String(e)));
await page.goto('http://localhost:4323/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.Aetheria, { timeout: 20000 });

/** Generate a map in-page and return a scaled PNG of it. */
async function shot(name, recipe) {
  const b64 = await page.evaluate(async ({ recipe }) => {
    const A = window.Aetheria;
    const { kind, opts, scale } = recipe;
    const doc = A.generate[kind](opts).doc;
    const surf = A.render.forExport(doc, {
      ...A.save.defaults,
      scale: scale ?? Math.min(1, 900 / Math.max(doc.width, doc.height)),
      includeGrid: kind !== 'region' && kind !== 'city',
    });
    return surf.toDataURL('image/png').split(',')[1];
  }, { recipe });
  fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(b64, 'base64'));
  console.log('wrote', name);
}

const jobs = [];

for (const layout of ['classic', 'sprawl', 'tomb', 'keep', 'mine', 'temple']) {
  jobs.push([`dungeon-${layout}`, { kind: 'dungeon', opts: { seed: 2024, layout, rooms: 14 } }]);
}
for (const shape of ['continent', 'archipelago', 'inland-sea', 'coastline', 'pangaea', 'atoll']) {
  jobs.push([`region-${shape}`, { kind: 'region', opts: { seed: 707, shape, width: 1800, height: 1200 } }]);
}
for (const biome of ['forest', 'swamp', 'desert', 'snow', 'ruins', 'cavern', 'camp', 'graveyard', 'coast', 'volcanic']) {
  jobs.push([`battle-${biome}`, { kind: 'battle', opts: { seed: 55, biome, cols: 26, rows: 20 } }]);
}
for (const size of ['village', 'town', 'city']) {
  for (const plan of ['organic', 'grid', 'river']) {
    jobs.push([`city-${size}-${plan}`, { kind: 'city', opts: { seed: 12, size, plan } }]);
  }
}
for (const [name, opts] of [
  ['plain', { relief: 0.2, woodland: 0.35 }],
  ['pass', { relief: 0.95, woodland: 0.3 }],
  ['forest', { relief: 0.3, woodland: 0.9, wetness: 0.7 }],
]) {
  jobs.push([`operational-${name}`, { kind: 'operational', opts: { seed: 4242, ...opts } }]);
}
for (const style of ['motte-bailey', 'concentric', 'shell-keep', 'coastal', 'star-fort', 'hillfort']) {
  jobs.push([`castle-${style}`, { kind: 'castle', opts: { seed: 2024, style } }]);
}
jobs.push(['castle-ruined', { kind: 'castle', opts: { seed: 9, style: 'concentric', ruined: 0.55 } }]);
for (const style of ['chambers', 'warren', 'cavern']) {
  jobs.push([`cave-${style}`, { kind: 'cave', opts: { seed: 13, style } }]);
}
for (const paletteId of ['atlas', 'verdant', 'frostmark', 'ashen', 'ink']) {
  jobs.push([`palette-${paletteId}`, { kind: 'region', opts: { seed: 909, paletteId, width: 1800, height: 1200 } }]);
}

for (const [name, recipe] of jobs) {
  try {
    await shot(name, recipe);
  } catch (err) {
    console.log('FAILED', name, String(err));
  }
}

await browser.close();
server.close();
console.log(`\n${jobs.length} variants in ${out}`);
