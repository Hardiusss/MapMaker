/** Times each generator phase by driving the built app and reading its console. */
import pw from 'playwright';
const { chromium } = pw;
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  let file = path.join(dist, url === '/' ? 'index.html' : url);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(4321, r));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('console', (m) => { const t = m.text(); if (t.startsWith('[bench]')) console.log(t); });
await page.goto('http://localhost:4321/', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

for (const label of ['Region / World', 'City', 'Dungeon', 'Caves', 'Battle Map']) {
  await page.click('button:has-text("Generate")');
  await page.waitForSelector('.modal');
  await page.click(`.modal .panel-tab:has-text("${label}")`);
  await page.waitForTimeout(120);
  const t = Date.now();
  await page.click('.modal .btn.primary');
  await page.waitForSelector('.modal', { state: 'detached', timeout: 60000 });
  console.log(`[total] ${label}: ${Date.now() - t}ms`);
  await page.waitForTimeout(400);
}
await browser.close();
server.close();
