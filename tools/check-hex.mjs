/**
 * Hex-grid invariants.
 *
 * The arithmetic under a hex crawl is the kind that looks right and is wrong
 * by one row: an offset layout has to be un-sheared to get axial coordinates,
 * the remainder operator disagrees with itself on negative numbers, and the
 * two orientations shear on different axes. None of that shows up as a crash —
 * it shows up as a GM calling out a hex the players cannot find.
 *
 * So this asserts the things that must hold whatever the layout: a hex centre
 * maps back to its own coordinates, the number drawn in a hex is the number a
 * note dropped there is given, all six neighbours are one step away, and a
 * straight run of six hexes is six hexes and a day and a half.
 *
 *   npm run build && node tools/check-hex.mjs
 */
import pw from 'playwright';
const { chromium } = pw;
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const dist='/home/claude/aetheria/dist';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
const server=http.createServer((q,r)=>{const u=(q.url||'/').split('?')[0];let f=path.join(dist,u==='/'?'index.html':u);
 if(!fs.existsSync(f)||fs.statSync(f).isDirectory())f=path.join(dist,'index.html');
 r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(r);});
await new Promise(r=>server.listen(4502,r));
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const page=await browser.newPage();
page.on('pageerror',e=>console.log('PAGE ERROR',String(e)));
await page.goto('http://localhost:4502/',{waitUntil:'networkidle'});
await page.waitForFunction(()=>!!window.Aetheria?.hex,{timeout:30000});
const out = await page.evaluate(()=>{
  const A=window.Aetheria, H=A.hex;
  const fails=[];
  for (const type of ['hexPointy','hexFlat']) {
    const g={ type, size:96, offsetX:0, offsetY:0, color:'#000', opacity:0.3, lineWidth:1,
      visible:true, snap:true, unitsPerCell:6, unitLabel:'mi', majorEvery:0,
      hexLabels:'colRow', travelPerDay:24 };
    const pointy = type!=='hexFlat';
    // round trip: centre of (c,r) -> pointToHex -> (c,r); and the label matches
    for (let r=-4; r<=8; r++) for (let c=-4; c<=8; c++) {
      const p = H.centre(c, r, g);
      const back = H.at(p, g);
      if (back.col!==c || back.row!==r) fails.push(`${type} roundtrip (${c},${r}) -> (${back.col},${back.row})`);
      const want = H.label(c, r, 'colRow', pointy);
      const got = H.designationAt(p, g);
      if (want!==got) fails.push(`${type} label (${c},${r}) ${want} != ${got}`);
    }
    // adjacency: all six neighbours are distance 1
    const nb = pointy
      ? (c,r)=> (Math.abs(r%2)===1
          ? [[c,r-1],[c+1,r-1],[c+1,r],[c+1,r+1],[c,r+1],[c-1,r]]
          : [[c-1,r-1],[c,r-1],[c+1,r],[c,r+1],[c-1,r+1],[c-1,r]])
      : (c,r)=> (Math.abs(c%2)===1
          ? [[c,r-1],[c+1,r],[c+1,r+1],[c,r+1],[c-1,r+1],[c-1,r]]
          : [[c,r-1],[c+1,r-1],[c+1,r],[c,r+1],[c-1,r],[c-1,r-1]]);
    for (const [c,r] of [[3,3],[4,4],[0,0],[-2,5],[7,2]]) {
      for (const [nc,nr] of nb(c,r)) {
        const d = H.distance({col:c,row:r},{col:nc,row:nr},pointy);
        if (d!==1) fails.push(`${type} neighbour (${c},${r})->(${nc},${nr}) d=${d}`);
      }
    }
    // measured distance in hexes vs geometric plausibility
    const a = H.centre(2,2,g), b = H.centre(8,2,g);
    const m = A.measure(a,b,g);
    if (m.cells!==6) fails.push(`${type} straight run cells=${m.cells}`);
    if (Math.abs(m.units-36)>1e-6) fails.push(`${type} units=${m.units}`);
    if (Math.abs(m.days-1.5)>1e-6) fails.push(`${type} days=${m.days}`);
  }
  // axial label sanity
  const g2={ type:'hexPointy', size:96, offsetX:0, offsetY:0, color:'#000', opacity:0.3, lineWidth:1,
      visible:true, snap:true, unitsPerCell:6, unitLabel:'mi', majorEvery:0, hexLabels:'axial' };
  const ax = H.designationAt(H.centre(3,4,g2), g2);
  return { fails, sampleColRow: H.label(3,4,'colRow',true), sampleAxial: ax };
});
console.log('failures:', out.fails.length);
for (const f of out.fails.slice(0,15)) console.log('  ', f);
console.log('colRow(3,4) =', out.sampleColRow, ' axial(3,4) =', out.sampleAxial);
await browser.close(); server.close();
process.exit(out.fails.length?1:0);
