// Bulk-generate names and confirm nothing unfortunate slips through.
import pw from 'playwright';
const { chromium } = pw;
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const dist = '/home/claude/aetheria/dist';
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css' };
const server = http.createServer((req,res)=>{ const u=(req.url||'/').split('?')[0];
  let f=path.join(dist,u==='/'?'index.html':u); if(!fs.existsSync(f)||fs.statSync(f).isDirectory()) f=path.join(dist,'index.html');
  res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'}); fs.createReadStream(f).pipe(res); });
await new Promise(r=>server.listen(4331,r));
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage();
await p.goto('http://localhost:4331/',{waitUntil:'networkidle'});
await p.waitForFunction(()=>!!window.Aetheria,{timeout:20000});
const res = await p.evaluate(async () => {
  const A = window.Aetheria;
  const bad = [];
  const BANNED = ['fuck','shit','cunt','piss','cock','dick','wank','twat','bitch','slut','whore','rape','nigg','fagg','anus','arse','tits','penis'];
  let total = 0;
  for (let s = 0; s < 120; s++) {
    const { doc } = A.generate.region({ seed: 1000 + s, width: 1200, height: 800, settlements: 14, realms: 4 });
    for (const l of doc.layers) {
      if (l.kind !== 'object') continue;
      for (const o of l.objects) {
        if (o.kind !== 'text') continue;
        total++;
        const flat = o.text.toLowerCase().replace(/[^a-z]/g, '');
        for (const w of BANNED) if (flat.includes(w)) bad.push(o.text);
      }
    }
  }
  return { total, bad: Array.from(new Set(bad)) };
});
console.log(`checked ${res.total} generated labels across 120 maps`);
console.log(res.bad.length ? `PROBLEMS: ${res.bad.join(', ')}` : 'no unfortunate names');
await b.close(); server.close();
