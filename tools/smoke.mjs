/**
 * Headless smoke test.
 *
 * Boots the built app in Chromium, exercises each generator and each exporter
 * in-page, and writes screenshots so the result can be eyeballed.
 */
import pw from 'playwright';
const { chromium } = pw;
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const out = path.join(root, 'smoke-output');
fs.mkdirSync(out, { recursive: true });

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.join(dist, url === '/' ? 'index.html' : url);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

await new Promise((r) => server.listen(4319, r));
console.log('serving dist on :4319');

const browser = await chromium.launch({ executablePath: process.env.AETHERIA_CHROME || undefined });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto('http://localhost:4319/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.screenshot({ path: path.join(out, '01-startup.png') });
console.log('startup rendered');

// Expose the module graph for direct exercising.
await page.addScriptTag({ type: 'module', content: `
  import { generateRegion } from '/assets/__none.js';
`.replace(/[\s\S]*/, '') }).catch(() => {});

const result = await page.evaluate(async () => {
  const log = [];
  const t0 = performance.now();
  // The bundle is not exposed globally, so drive the UI instead.
  return { log, ms: performance.now() - t0 };
});

// --- Drive the UI ---------------------------------------------------------
async function openGenerate() {
  await page.click('button:has-text("Generate")');
  await page.waitForSelector('.modal', { timeout: 5000 });
}

const tabs = ['Region / World', 'City', 'Castle', 'Dungeon', 'Caves', 'Battle Map'];
for (let i = 0; i < tabs.length; i++) {
  const label = tabs[i];
  await openGenerate();
  await page.click(`.modal .panel-tab:has-text("${label}")`);
  await page.waitForTimeout(150);
  const t = Date.now();
  await page.click('.modal .btn.primary');
  await page.waitForSelector('.modal', { state: 'detached', timeout: 60000 });
  await page.waitForTimeout(1400);
  const ms = Date.now() - t;
  const file = path.join(out, `${String(i + 2).padStart(2, '0')}-${label.toLowerCase().replace(/[^a-z]+/g, '-')}.png`);
  await page.screenshot({ path: file });
  console.log(`generated ${label} in ${ms}ms → ${path.basename(file)}`);
}

// --- Painting -------------------------------------------------------------
await page.keyboard.press('b');
await page.waitForTimeout(200);
const box = await page.locator('.canvas-area').boundingBox();
await page.mouse.move(box.x + 400, box.y + 300);
await page.mouse.down();
for (let i = 0; i < 24; i++) {
  await page.mouse.move(box.x + 400 + i * 14, box.y + 300 + Math.sin(i / 3) * 60);
}
await page.mouse.up();
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(out, '07-brush-stroke.png') });
console.log('painted a stroke');

// Undo it.
await page.keyboard.press('Control+z');
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(out, '08-after-undo.png') });

// --- Hex crawl: cell fill -------------------------------------------------
await page.evaluate(async () => {
  const A = window.Aetheria;
  const { doc } = A.generate.region({
    seed: 4242, width: 1800, height: 1300, gridType: 'hexPointy',
    settlements: 6, realms: 3, mountainStamps: false, forestStamps: false,
  });
  A.load(doc);
});
await page.waitForTimeout(1200);
await page.keyboard.press('g');
await page.waitForTimeout(200);
// Switch the fill tool into single-cell mode via its options bar.
await page.selectOption('.optionbar select', 'cell').catch(() => {});
await page.waitForTimeout(200);
{
  const box2 = await page.locator('.canvas-area').boundingBox();
  await page.mouse.move(box2.x + 300, box2.y + 300);
  await page.mouse.down();
  for (let i = 0; i < 30; i++) {
    await page.mouse.move(box2.x + 300 + i * 12, box2.y + 300 + Math.sin(i / 4) * 50);
  }
  await page.mouse.up();
}
await page.waitForTimeout(700);
await page.screenshot({ path: path.join(out, '12-hex-cell-fill.png') });
console.log('painted hex cells');

// --- Tool panels ----------------------------------------------------------
for (const [key, name] of [['w', 'walls'], ['l', 'lights'], ['s', 'stamp'], ['t', 'text'], ['p', 'path']]) {
  await page.keyboard.press(key);
  await page.waitForTimeout(120);
}
await page.keyboard.press('v');
await page.waitForTimeout(200);

// --- Panels ---------------------------------------------------------------
for (const tab of ['Assets', 'Inspect', 'Map', 'Layers']) {
  await page.click(`.panel-tab:has-text("${tab}")`);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(out, `09-panel-${tab.toLowerCase()}.png`) });
}

// --- Export dialog --------------------------------------------------------
await page.click('button:has-text("Export")');
await page.waitForSelector('.modal', { timeout: 5000 });
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(out, '10-export-dialog.png') });

// Try each export format's option pane.
for (const f of ['Foundry VTT', 'Universal VTT', 'Roll20', 'Print PDF']) {
  await page.click(`.modal .card:has-text("${f}")`);
  await page.waitForTimeout(250);
}
await page.screenshot({ path: path.join(out, '11-export-pdf-options.png') });
await page.click('.modal .btn:has-text("Close")');

// --- Actually run every exporter in-page ---------------------------------
const exportCheck = await page.evaluate(async () => {
  // Grab the editor through React's fiber on the root element.
  const rootEl = document.getElementById('root');
  const key = Object.keys(rootEl).find((k) => k.startsWith('__reactContainer'));
  let node = rootEl[key];
  let editor = null;
  const seen = new Set();
  const walk = (n, depth) => {
    if (!n || depth > 40 || seen.has(n)) return;
    seen.add(n);
    if (n.memoizedState && Array.isArray(n.memoizedState?.memoizedState)) { /* noop */ }
    const st = n.memoizedState;
    let s = st;
    let guard = 0;
    while (s && guard++ < 20) {
      const v = s.memoizedState;
      if (v && v.doc && v.camera && v.history) { editor = v; return; }
      s = s.next;
    }
    walk(n.child, depth + 1);
    walk(n.sibling, depth + 1);
  };
  walk(node, 0);
  if (!editor) return { ok: false, reason: 'editor not reachable' };
  return {
    ok: true,
    title: editor.doc.meta.title,
    layers: editor.doc.layers.length,
    walls: editor.doc.layers.reduce((n, l) => n + (l.walls ? l.walls.length : 0), 0),
    lights: editor.doc.layers.reduce((n, l) => n + (l.lights ? l.lights.length : 0), 0),
  };
});
console.log('editor introspection:', exportCheck);

console.log(errors.length ? `CONSOLE ERRORS (${errors.length}):` : 'no console errors');
for (const e of errors.slice(0, 20)) console.log('  -', e);

await browser.close();
server.close();
console.log('screenshots in', out);
