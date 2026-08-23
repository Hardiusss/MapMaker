/** Screenshots of the asset browser in Russian, one per group. */
import pw from '/home/claude/.npm-global/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const out = path.join(root, 'smoke-output', 'ru');
fs.mkdirSync(out, { recursive: true });
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png' };
const server = http.createServer((req,res)=>{ const u=decodeURIComponent((req.url||'/').split('?')[0]);
  let f=path.join(dist,u==='/'?'index.html':u); if(!fs.existsSync(f)||fs.statSync(f).isDirectory()) f=path.join(dist,'index.html');
  res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'}); fs.createReadStream(f).pipe(res); });
await new Promise(r=>server.listen(4343,r));

const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await b.newPage({ viewport:{ width:1500, height:1050 }, deviceScaleFactor:2 });
page.on('pageerror', e=>console.log('PAGE ERROR', String(e)));
await page.goto('http://localhost:4343/',{waitUntil:'networkidle'});
await page.waitForTimeout(2000);

// Captions only appear on hover; force them so the shots are readable.
await page.addStyleTag({ content: '.asset-cell .cap { opacity: 1 !important; }' });
await page.click('.lang-switch button:has-text("RU")');
await page.waitForTimeout(400);
// The Assets tab: third of the dock's tabs in RU is «Объекты».
await page.click('.panel-tabs button:has-text("Объекты")');
await page.waitForTimeout(800);

const panel = page.locator('.side-panel');
async function shot(name) { await page.waitForTimeout(700); await panel.screenshot({ path: path.join(out, name) }); console.log('shot', name); }

// The dock opens on Textures when the brush tool is live; we want stamps.
await page.click('.side-panel button.btn.small:text-is("Стемпы")');
await page.waitForTimeout(600);
await shot('00-all.png');
for (const [chip, file] of [['Заготовки','01-prefabs.png'],['Существа','02-creatures.png'],
  ['Обстановка','03-furniture.png'],['Картография','04-symbols.png'],['Маркеры','05-markers.png'],
  ['Постройки','06-structures.png'],['Рельеф','07-terrain.png']]) {
  await page.click(`.side-panel button.btn.small:text-is("${chip}")`);
  await shot(file);
}

// Shelf chips inside Furnishings, so a second row is visible.
await page.click('.side-panel button.btn.small:text-is("Обстановка")');
await page.waitForTimeout(300);
const chips = await page.locator('.asset-shelves .chip').allTextContents();
console.log('furniture shelves:', chips.join(' | '));
await page.click('.side-panel button.btn.small:text-is("Существа")');
await page.waitForTimeout(300);
console.log('creature shelves:', (await page.locator('.asset-shelves .chip').allTextContents()).join(' | '));

// Search «башня».
await page.click('.side-panel button.btn.small:text-is("Все")');
await page.fill('.asset-search input', 'башня');
await page.waitForTimeout(900);
const caps = await page.locator('.asset-cell .cap').allTextContents();
console.log('search «башня» ->', caps.length, 'hits:', caps.join(' | '));
await panel.screenshot({ path: path.join(out, '08-search-bashnya.png') });

await page.fill('.asset-search input', 'лев');
await page.waitForTimeout(700);
console.log('search «лев» ->', (await page.locator('.asset-cell .cap').allTextContents()).join(' | '));
await page.fill('.asset-search input', 'tower');
await page.waitForTimeout(700);
console.log('search "tower" ->', (await page.locator('.asset-cell .cap').allTextContents()).length, 'hits');

// Empty state + textures mode.
await page.fill('.asset-search input', 'zzzz');
await page.waitForTimeout(500);
console.log('empty:', await page.locator('.empty').textContent());
await page.fill('.asset-search input', '');
await page.waitForTimeout(400);
await page.click('.side-panel button.btn.small:text-is("Текстуры")');
await page.waitForTimeout(900);
await panel.screenshot({ path: path.join(out, '09-textures.png') });

await b.close(); server.close();
