/**
 * Long-session memory harness.
 *
 * A GM keeps this editor open for a whole evening: generating, painting,
 * hunting through the stamp library, trying palettes. None of that is a leak
 * on its own — caches are supposed to fill. The question is whether they ever
 * stop filling, so this drives the same workload several times over and asks
 * whether pass three costs more than pass two.
 *
 * Run with a built `dist/`:  node tools/bench-memory.mjs
 * Exits non-zero if retained heap keeps climbing over identical work.
 */
import pw from 'playwright';
const { chromium } = pw;
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = process.env.DIST || path.join(root, 'dist');
const CYCLES = Number(process.env.CYCLES || 3);

/**
 * Budgets for one repeat of the workload, in MB.
 *
 * After the first pass every cache the workload touches is warm: the stamps it
 * browsed are rendered, the palettes it tried are built, the textures it
 * painted with are synthesised. A second identical pass should be finding all
 * of that already there, so the only honest growth is allocator noise, React
 * state and the undo history for the strokes it just painted.
 *
 * Two instruments, because one of them is blind. `performance.memory` counts
 * the JS heap only, and the things this app accumulates are canvases — whose
 * backing store lives outside that heap. The pool that once grew to 2.2 GB of
 * scratch surfaces moved `usedJSHeapSize` by under a megabyte. So the caches
 * report their own byte totals and those are policed too; the heap figure
 * catches the ordinary kind of leak, listeners and closures and retained
 * documents.
 *
 * On a fixed build both sit near zero per pass once warm. The budgets leave
 * room for a slow machine and a GC that did not quite finish, while still
 * catching the failure that matters — a cache with no eviction adds tens of MB
 * a pass, an order of magnitude clear of these numbers. The workload keeps a
 * fixed seed so that "new content" is never an excuse for growth.
 */
const HEAP_BUDGET_MB = Number(process.env.HEAP_BUDGET_MB || 8);
const CACHE_BUDGET_MB = Number(process.env.CACHE_BUDGET_MB || 8);

/**
 * Ceiling on everything the caches hold at once, in MB.
 *
 * The growth check above cannot see the failure that actually happened here.
 * A pool that keeps one surface per distinct size looks perfectly flat when
 * asked for the same size twice, and only runs away when a session works at
 * varying sizes — which is why the workload below builds the same castle at
 * several cell sizes, and why the total is checked against a ceiling as well
 * as a slope. Before the caches were bounded this workload sat near a
 * gigabyte; the budgets now sum to a little over 300 MB, so 400 MB flags a
 * bound that has been removed or set wrong without tripping on normal work.
 */
const CEILING_MB = Number(process.env.CEILING_MB || 400);

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
await new Promise((r) => server.listen(4331, r));

const browser = await chromium.launch({
  executablePath: process.env.AETHERIA_CHROME || undefined,
  // Precise memory info makes performance.memory worth reading; expose-gc lets
  // us settle the heap before sampling instead of measuring collector lag.
  args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'],
});
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('http://localhost:4331/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

/** Settle the heap, then read it. Several GCs: one pass leaves floating garbage. */
async function sample(label) {
  await page.evaluate(async () => {
    for (let i = 0; i < 4; i++) { window.gc?.(); await new Promise((r) => setTimeout(r, 60)); }
  });
  const m = await page.evaluate(() => ({
    heap: performance.memory ? performance.memory.usedJSHeapSize : 0,
    caches: window.Aetheria?.debug?.caches?.() ?? null,
  }));
  const metrics = await page.context().newCDPSession(page).then(async (s) => {
    await s.send('Performance.enable');
    const { metrics } = await s.send('Performance.getMetrics');
    await s.detach();
    return Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  }).catch(() => ({}));
  return { label, heapMB: m.heap / 1048576, caches: m.caches, nodes: metrics.Nodes, listeners: metrics.JSEventListeners };
}

const PALETTES = ['verdant', 'atlas'];

async function paintStrokes(n) {
  await page.keyboard.press('b');
  await page.waitForTimeout(120);
  const box = await page.locator('.canvas-area').boundingBox();
  for (let s = 0; s < n; s++) {
    const x = box.x + 200 + (s * 37) % 700;
    const y = box.y + 150 + (s * 53) % 500;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 0; i < 4; i++) await page.mouse.move(x + i * 18, y + Math.sin(i) * 24);
    await page.mouse.up();
  }
}

/** One evening's worth of work, compressed. */
async function cycle() {
  // The same map every pass, deliberately. A different seed would put genuinely
  // new stamps and tiles in the caches, and legitimate filling is
  // indistinguishable from a leak. Holding the seed fixed means every byte the
  // second pass adds is a byte the first pass should already have had.
  await page.evaluate(() => {
    const A = window.Aetheria;
    const r = A.generate.battle({ seed: 90210 });
    A.load(r.doc || r);
  });
  await page.waitForTimeout(600);

  await paintStrokes(20);

  // Work at several scales. Each distinct mask size is a distinct scratch
  // surface, and a pool that never evicts grows by hundreds of MB per size —
  // invisible to a workload that only ever asks for one.
  await page.evaluate(() => {
    const A = window.Aetheria;
    for (const cell of [50, 80]) A.generate.castle({ seed: 4242, cell });
  });
  await page.waitForTimeout(200);

  // Hunt through the stamp library. Driven through the API rather than by
  // clicking the group buttons: the panel renders a preview per visible cell,
  // and this asks for exactly that set without depending on translated labels.
  await page.evaluate(() => {
    const A = window.Aetheria;
    const all = A.assets.all();
    for (let i = 0; i < all.length; i += 3) A.assets.preview(all[i].id, 'atlas', 72);
    for (const t of A.textures.all()) A.textures.get(t.id, { paletteId: 'atlas', size: 128 });
  });
  await page.waitForTimeout(150);

  // Try the palettes on.
  await page.click('.panel-tab:has-text("Map")').catch(() => {});
  await page.waitForTimeout(200);
  for (const p of PALETTES) {
    await page.selectOption('.panel select', p).catch(() => {});
    await page.waitForTimeout(220);
  }

  // And the language switch.
  for (const lang of ['ru', 'en']) {
    await page.evaluate((l) => {
      try { localStorage.setItem('aetheria.lang', l); } catch { /* private mode */ }
      window.dispatchEvent(new StorageEvent('storage', { key: 'aetheria.lang', newValue: l }));
    }, lang);
    await page.waitForTimeout(200);
  }
}

const samples = [await sample('startup')];
for (let i = 0; i < CYCLES; i++) {
  const t0 = Date.now();
  await cycle();
  console.log(`  [cycle ${i + 1}/${CYCLES} done in ${((Date.now() - t0) / 1000).toFixed(0)}s]`);
  samples.push(await sample(`cycle ${i + 1}`));
}

const mb = (b) => (b / 1048576).toFixed(1);
console.log('\n  checkpoint     heap MB   textures        stamps          previews        scratch');
for (const s of samples) {
  const c = s.caches;
  const f = (o) => (o ? `${String(o.entries).padStart(4)}/${mb(o.bytes).padStart(6)}MB` : '   -');
  console.log(
    `  ${s.label.padEnd(12)} ${s.heapMB.toFixed(1).padStart(8)}  ` +
    `${f(c?.textures)}  ${f(c?.assetBitmaps)}  ${f(c?.assetPreviews)}  ${f(c?.scratch)}`,
  );
}

// The first cycle fills the caches; growth after that is what we are policing.
const first = samples[1], last = samples[samples.length - 1];
const passes = Math.max(1, CYCLES - 1);
const heapPerPass = (last.heapMB - first.heapMB) / passes;
const cacheMB = (s) => (s.caches ? s.caches.totalBytes / 1048576 : 0);
const cachePerPass = (cacheMB(last) - cacheMB(first)) / passes;

console.log(`\n  after cycle 1      heap ${first.heapMB.toFixed(1)} MB   caches ${cacheMB(first).toFixed(1)} MB`);
console.log(`  after cycle ${CYCLES}      heap ${last.heapMB.toFixed(1)} MB   caches ${cacheMB(last).toFixed(1)} MB`);
console.log(`  over ${passes} further identical pass(es):`);
console.log(`    JS heap      ${heapPerPass >= 0 ? '+' : ''}${heapPerPass.toFixed(1)} MB/pass  (budget ${HEAP_BUDGET_MB})`);
console.log(`    cache bytes  ${cachePerPass >= 0 ? '+' : ''}${cachePerPass.toFixed(1)} MB/pass  (budget ${CACHE_BUDGET_MB})`);
if (errors.length) {
  console.log(`\n  console errors (${errors.length}):`);
  for (const e of errors.slice(0, 10)) console.log('   -', e);
}

await browser.close();
server.close();

const peakMB = Math.max(...samples.map(cacheMB));
console.log(`    peak cached  ${peakMB.toFixed(1)} MB       (ceiling ${CEILING_MB})`);

const failures = [];
if (peakMB > CEILING_MB) {
  failures.push(`caches peaked at ${peakMB.toFixed(1)} MB (ceiling ${CEILING_MB} MB)`);
}
if (heapPerPass > HEAP_BUDGET_MB) {
  failures.push(`JS heap grew ${heapPerPass.toFixed(1)} MB/pass (budget ${HEAP_BUDGET_MB} MB)`);
}
if (cachePerPass > CACHE_BUDGET_MB) {
  failures.push(`cached bytes grew ${cachePerPass.toFixed(1)} MB/pass (budget ${CACHE_BUDGET_MB} MB)`);
}
if (errors.length) failures.push(`${errors.length} console error(s)`);

if (failures.length) {
  console.error('\nFAIL: ' + failures.join('; ') + '.');
  process.exit(1);
}
console.log('\nOK: retained heap and cached bytes are flat across repeats of the workload.');
