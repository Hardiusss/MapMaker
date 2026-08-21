/**
 * End-to-end verification of every exporter, run in a real browser.
 *
 * Generates one map of each kind, builds every export payload, and asserts the
 * structure a VTT will actually look for: Foundry wall constants and light
 * units, UVTT grid coordinates, Roll20 page settings, PDF headers, and a
 * lossless round-trip through the native project format.
 */
import pw from '/home/claude/.npm-global/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const out = path.join(root, 'export-output');
fs.mkdirSync(out, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  let file = path.join(dist, url === '/' ? 'index.html' : url);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(4322, r));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('http://localhost:4322/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.Aetheria, { timeout: 20000 });
await page.waitForTimeout(2500);

const results = await page.evaluate(async () => {
  const A = window.Aetheria;
  const report = [];
  const push = (name, ok, detail) => report.push({ name, ok, detail });

  const maps = {
    dungeon: A.generate.dungeon({ seed: 4242, rooms: 10 }).doc,
    cave: A.generate.cave({ seed: 77 }).doc,
    battle: A.generate.battle({ seed: 9, biome: 'ruins' }).doc,
    city: A.generate.city({ seed: 5, size: 'town' }).doc,
    region: A.generate.region({ seed: 31, width: 1600, height: 1100 }).doc,
  };

  // ---------- Foundry ----------
  for (const [kind, doc] of Object.entries(maps)) {
    const { scene, summary } = A.build.foundryScene(doc, { imagePath: `worlds/w/scenes/${kind}.png` });
    const okShape = scene.width === doc.width && scene.height === doc.height
      && Array.isArray(scene.walls) && Array.isArray(scene.lights) && Array.isArray(scene.notes);
    const gridOk = scene.grid.size === Math.round(doc.grid.size)
      && scene.grid.distance === doc.grid.unitsPerCell;
    const wallConstantsOk = scene.walls.every((w) =>
      Array.isArray(w.c) && w.c.length === 4 && w.c.every(Number.isFinite)
      && [0, 20].includes(w.move) && [0, 10, 20].includes(w.sight)
      && [0, 1, 2].includes(w.door) && [0, 1, 2].includes(w.ds)
      && typeof w._id === 'string' && w._id.length === 16);
    const lightUnitsOk = scene.lights.every((l) =>
      Number.isFinite(l.config.bright) && Number.isFinite(l.config.dim)
      && l.config.bright <= 5000 && /^#[0-9a-f]{6}$/i.test(l.config.color));
    push(`foundry:${kind}`, okShape && gridOk && wallConstantsOk && lightUnitsOk,
      `${summary.walls} walls, ${summary.doors} doors, ${summary.lights} lights, ${summary.notes} notes`);

    // Round-trip through JSON exactly as the file would.
    try {
      const text = JSON.stringify(scene);
      const back = JSON.parse(text);
      push(`foundry-json:${kind}`, back.walls.length === scene.walls.length, `${(text.length / 1024).toFixed(0)} KiB`);
    } catch (e) {
      push(`foundry-json:${kind}`, false, String(e));
    }
  }

  // ---------- Universal VTT ----------
  for (const kind of ['dungeon', 'battle', 'cave']) {
    const doc = maps[kind];
    const surf = A.render.forExport(doc, { ...A.save.defaults, includeGrid: false, scale: 0.5 });
    const b64 = surf.toDataURL('image/png').split(',')[1];
    const uvtt = A.build.uvtt(doc, b64);
    const cells = { x: Math.round(doc.width / doc.grid.size), y: Math.round(doc.height / doc.grid.size) };
    const okRes = uvtt.resolution.map_size.x === cells.x && uvtt.resolution.map_size.y === cells.y
      && uvtt.resolution.pixels_per_grid === Math.round(doc.grid.size);
    const losOk = uvtt.line_of_sight.every((chain) => chain.length >= 2
      && chain.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)
        && p.x >= -1 && p.y >= -1 && p.x <= cells.x + 1 && p.y <= cells.y + 1));
    const portalsOk = uvtt.portals.every((p) => p.bounds.length === 2 && typeof p.closed === 'boolean');
    const imgOk = typeof uvtt.image === 'string' && uvtt.image.length > 1000;
    push(`uvtt:${kind}`, okRes && losOk && portalsOk && imgOk,
      `${uvtt.line_of_sight.length} LOS chains, ${uvtt.portals.length} portals, ${uvtt.lights.length} lights`);
  }

  // ---------- Roll20 ----------
  {
    const doc = maps.battle;
    const b = A.build.roll20(doc);
    const ok = b.pageSettings.widthUnits === +(doc.width / doc.grid.size).toFixed(2)
      && b.pageSettings.pixelsPerUnit === 70 && b.instructions.includes('Page settings');
    push('roll20', ok, `${b.dynamicLighting.paths.length} DL paths`);
  }

  // ---------- PDF ----------
  {
    const doc = maps.battle;
    const surf = A.render.forExport(doc, { ...A.save.defaults, scale: 0.35 });
    const single = A.build.pdf(surf, doc.grid.size * 0.35, { page: 'a4', tiled: false, title: 'T' });
    const tiled = A.build.pdf(surf, doc.grid.size * 0.35, { page: 'a4', tiled: true, inchesPerCell: 1, title: 'T' });
    const head = String.fromCharCode(...single.slice(0, 8));
    const tail = String.fromCharCode(...single.slice(-8));
    push('pdf-single', head.startsWith('%PDF-1.4') && tail.includes('EOF'), `${(single.length / 1024).toFixed(0)} KiB`);
    push('pdf-tiled', tiled.length > single.length, `${(tiled.length / 1024).toFixed(0)} KiB`);
  }

  // ---------- Project round-trip ----------
  for (const [kind, doc] of Object.entries(maps)) {
    try {
      const bytes = await A.build.project(doc, 'atlas');
      const back = await A.build.loadProject(bytes);
      const sameLayers = back.doc.layers.length === doc.layers.length;
      const sameSize = back.doc.width === doc.width && back.doc.height === doc.height;
      const sameWalls = back.doc.layers.reduce((n, l) => n + (l.walls ? l.walls.length : 0), 0)
        === doc.layers.reduce((n, l) => n + (l.walls ? l.walls.length : 0), 0);
      const sameObjects = back.doc.layers.reduce((n, l) => n + (l.objects ? l.objects.length : 0), 0)
        === doc.layers.reduce((n, l) => n + (l.objects ? l.objects.length : 0), 0);
      // Raster survival: at least one layer must come back with pixels.
      const rasterOk = back.doc.layers.some((l) => {
        if (l.kind !== 'raster') return false;
        const ctx = l.surface.getContext('2d', { willReadFrequently: true });
        const d = ctx.getImageData(0, 0, Math.min(64, l.surface.width), Math.min(64, l.surface.height)).data;
        for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return true;
        return false;
      });
      push(`project:${kind}`, sameLayers && sameSize && sameWalls && sameObjects && rasterOk,
        `${(bytes.length / 1024).toFixed(0)} KiB, ${back.doc.layers.length} layers`);
    } catch (e) {
      push(`project:${kind}`, false, String(e));
    }
  }

  // ---------- Derive walls ----------
  {
    const doc = maps.city;
    const walls = A.deriveWalls(doc);
    push('derive-walls', walls.length > 50, `${walls.length} segments from city objects`);
  }

  // ---------- Grid detection ----------
  for (const cellSize of [40, 70, 100, 128]) {
    const doc = A.generate.battle({ seed: 3 + cellSize, cell: cellSize, cols: 24, rows: 18, biome: 'clearing' }).doc;
    const surf = A.render.forExport(doc, { ...A.save.defaults, scale: 1, includeGrid: true });
    const guess = window.__guessGrid(surf, 16, 260);
    const err = Math.abs(guess.size - cellSize);
    push(`grid-detect:${cellSize}`, err <= 2.5, `guessed ${guess.size.toFixed(1)}px (confidence ${guess.confidence.toFixed(2)})`);
  }
  {
    // Half-scale scan: the detector should still find the pitch.
    const doc = A.generate.battle({ seed: 88, cell: 70, cols: 24, rows: 18 }).doc;
    const surf = A.render.forExport(doc, { ...A.save.defaults, scale: 0.5, includeGrid: true });
    const guess = window.__guessGrid(surf, 12, 200);
    push('grid-detect:scaled', Math.abs(guess.size - 35) <= 2, `guessed ${guess.size.toFixed(1)}px, expected 35`);
  }

  // ---------- Image export sizes ----------
  {
    const doc = maps.battle;
    const s1 = A.render.forExport(doc, { ...A.save.defaults, scale: 1 });
    push('image-1x', s1.width === doc.width && s1.height === doc.height, `${s1.width}×${s1.height}`);
    const s2 = A.render.forExport(doc, { ...A.save.defaults, scale: 70 / doc.grid.size });
    push('image-roll20', Math.abs(s2.width - (doc.width / doc.grid.size) * 70) < 2, `${s2.width}×${s2.height}`);
  }

  return report;
});

let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(22)} ${r.detail}`);
}
console.log(`\n${results.length - failed}/${results.length} checks passed`);
if (errors.length) {
  console.log(`\nconsole errors (${errors.length}):`);
  for (const e of errors.slice(0, 10)) console.log('  -', e);
}

// Write one real Foundry bundle to disk for manual inspection.
const sample = await page.evaluate(async () => {
  const A = window.Aetheria;
  const doc = A.generate.dungeon({ seed: 1234, rooms: 12 }).doc;
  const { scene } = A.build.foundryScene(doc, { imagePath: 'worlds/demo/scenes/sample-dungeon.png' });
  const surf = A.render.forExport(doc, { ...A.save.defaults, includeGrid: false, scale: 0.5 });
  const uvtt = A.build.uvtt(doc, surf.toDataURL('image/png').split(',')[1]);
  return {
    scene: JSON.stringify(scene, null, 2),
    uvtt: JSON.stringify({ ...uvtt, image: `${uvtt.image.slice(0, 40)}…(${uvtt.image.length} chars)` }, null, 2),
    png: surf.toDataURL('image/png').split(',')[1],
  };
});
fs.writeFileSync(path.join(out, 'sample-dungeon.scene.json'), sample.scene);
fs.writeFileSync(path.join(out, 'sample-dungeon.dd2vtt.preview.json'), sample.uvtt);
fs.writeFileSync(path.join(out, 'sample-dungeon.png'), Buffer.from(sample.png, 'base64'));
console.log('\nwrote sample exports to', out);

await browser.close();
server.close();
process.exit(failed ? 1 : 0);
