/**
 * Contact sheets for the whole stamp library, one PNG per group.
 *
 * With four hundred-odd procedural assets, "does it typecheck" says nothing
 * about whether a thing is legible. This renders every stamp at map scale and
 * lays them out on a sheet so a bad silhouette is obvious at a glance.
 */
import pw from '/home/claude/.npm-global/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const out = path.join(root, 'gallery', 'assets');
fs.mkdirSync(out, { recursive: true });

const only = process.argv.slice(2);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  let file = path.join(dist, url === '/' ? 'index.html' : url);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(4325, r));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
page.on('pageerror', (e) => console.log('PAGE ERROR', String(e)));
await page.goto('http://localhost:4325/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.Aetheria, { timeout: 20000 });

const groups = await page.evaluate(() => {
  const seen = [];
  for (const a of window.Aetheria.assets.all()) if (!seen.includes(a.group)) seen.push(a.group);
  return seen;
});

for (const group of groups) {
  if (only.length && !only.includes(group)) continue;
  const { b64, count } = await page.evaluate(({ group }) => {
    const A = window.Aetheria;
    const list = A.assets.all().filter((a) => a.group === group);
    // Prefabs are rooms — give them room. Everything else fits a uniform cell.
    const cell = group === 'prefabs' ? 300 : 128;
    const cols = group === 'prefabs' ? 4 : 8;
    const rows = Math.ceil(list.length / cols);
    const pad = 10, capH = 16;
    const cv = document.createElement('canvas');
    cv.width = cols * (cell + pad) + pad;
    cv.height = rows * (cell + pad + capH) + pad;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#20242a';
    ctx.fillRect(0, 0, cv.width, cv.height);
    list.forEach((a, i) => {
      const cx = pad + (i % cols) * (cell + pad);
      const cy = pad + Math.floor(i / cols) * (cell + pad + capH);
      ctx.fillStyle = '#2a2f36';
      ctx.fillRect(cx, cy, cell, cell);
      const w = a.aspect >= 1 ? cell : Math.round(cell * a.aspect);
      const h = a.aspect >= 1 ? Math.round(cell / a.aspect) : cell;
      try {
        const s = A.assets.render(a.id, { width: w, height: h, seed: 11, paletteId: 'atlas', variant: 0 });
        ctx.drawImage(s, cx + (cell - w) / 2, cy + (cell - h) / 2);
      } catch (err) {
        ctx.fillStyle = '#a03030';
        ctx.fillRect(cx, cy, cell, cell);
        ctx.fillStyle = '#fff';
        ctx.font = '10px sans-serif';
        ctx.fillText(String(err).slice(0, 22), cx + 4, cy + 16);
      }
      ctx.fillStyle = '#c9c2b6';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(a.label.slice(0, 24), cx + cell / 2, cy + cell + 12);
      ctx.textAlign = 'left';
    });
    return { b64: cv.toDataURL('image/png').split(',')[1], count: list.length };
  }, { group });
  fs.writeFileSync(path.join(out, `${group}.png`), Buffer.from(b64, 'base64'));
  console.log(`${group}: ${count} stamps`);
}

const total = await page.evaluate(() => window.Aetheria.assets.all().length);
await browser.close();
server.close();
console.log(`\n${total} stamps, sheets in ${out}`);
