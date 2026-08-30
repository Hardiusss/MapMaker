/**
 * Renders the application icon from the same procedural asset library the maps
 * use — a compass rose on aged parchment. No external art, same as everything
 * else in this project.
 */
import pw from 'playwright';
const { chromium } = pw;
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const resources = path.join(root, 'resources');
fs.mkdirSync(resources, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  let file = path.join(dist, url === '/' ? 'index.html' : url);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(4324, r));

const browser = await chromium.launch({ executablePath: process.env.AETHERIA_CHROME || undefined });
const page = await browser.newPage();
await page.goto('http://localhost:4324/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.Aetheria, { timeout: 20000 });

for (const size of [1024, 512, 256, 128, 64, 32]) {
  const b64 = await page.evaluate(async (size) => {
    const A = window.Aetheria;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');

    // Parchment disc.
    const pad = size * 0.04;
    const r = size / 2 - pad;
    const tile = A.textures.get('parchment-aged', { paletteId: 'atlas', size: 256 });
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = ctx.createPattern(tile, 'repeat');
    ctx.fillRect(0, 0, size, size);
    // Inner shading so the disc has some depth at small sizes.
    const g = ctx.createRadialGradient(size * 0.38, size * 0.34, 0, size / 2, size / 2, r);
    g.addColorStop(0, 'rgba(255,255,255,0.22)');
    g.addColorStop(0.75, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(40,26,12,0.45)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    ctx.restore();

    // Compass rose.
    const rose = A.assets.render('sym/compass-rose', {
      width: Math.round(size * 0.82),
      paletteId: 'atlas',
      seed: 3,
      variant: 0,
    });
    ctx.drawImage(rose, (size - rose.width) / 2, (size - rose.height) / 2);

    // Rim.
    ctx.strokeStyle = 'rgba(59,44,28,0.85)';
    ctx.lineWidth = Math.max(1, size * 0.018);
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
    ctx.stroke();

    return c.toDataURL('image/png').split(',')[1];
  }, size);
  const name = size === 512 ? 'icon.png' : `icon-${size}.png`;
  fs.writeFileSync(path.join(resources, name), Buffer.from(b64, 'base64'));
  console.log('wrote resources/' + name);
}

await browser.close();
server.close();
