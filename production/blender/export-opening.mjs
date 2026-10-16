// Exports the animated 90 s opening for Blender (export-opening.js): cache-opening/set.glb, scene.json, anim/f0001.json …
// and screens/<n>/0001.jpg … (each changing screen's picture per frame).
//   node production/blender/export-opening.mjs [firstFrame] [lastFrame]
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..', '..'), OUT = join(HERE, 'cache-opening');
mkdirSync(join(OUT, 'anim'), { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try { const b = await readFile(join(ROOT, p)); res.writeHead(200, { 'Content-Type': types[extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
}).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const cdpPort = 9600 + Math.floor(Math.random() * 150);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'dz-exop-'))}`, '--use-angle=metal', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws;
for (let i = 0; i < 80 && !ws; i++) { try { const pg = (await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json()).find(t => t.type === 'page'); if (pg) ws = new WebSocket(pg.webSocketDebuggerUrl); } catch {} if (!ws) await sleep(250); }
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0; const pending = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') console.error('page error:', m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); });
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description); return r.result.result.value; };
await send('Runtime.enable');
await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/production/blender/export-opening.html` });
for (let i = 0; i < 400 && !(await evaluate('!!window.exportReady').catch(() => false)); i++) await sleep(500);
const counts = await evaluate('openingExport.counts');
console.log('animated:', JSON.stringify(counts));
const from = +(process.argv[2] || 1), N = await evaluate('openingExport.frames'), to = +(process.argv[3] || N);
if (from === 1) {
  writeFileSync(join(OUT, 'set.glb'), Buffer.from(await evaluate('openingExport.glb()'), 'base64'));
  writeFileSync(join(OUT, 'scene.json'), JSON.stringify(await evaluate('openingExport.meta()')));
}
for (let f = from; f <= to; f++) {
  const fr = await evaluate(`openingExport.frame(${f - 1})`);
  fr.screens.forEach((url, i) => { if (!url) return; mkdirSync(join(OUT, 'screens', String(i)), { recursive: true }); writeFileSync(join(OUT, 'screens', String(i), `${String(f).padStart(4, '0')}.jpg`), Buffer.from(url.split(',')[1], 'base64')); });
  delete fr.screens;
  writeFileSync(join(OUT, 'anim', `f${String(f).padStart(4, '0')}.json`), JSON.stringify(fr));
  if (f % 300 === 0) console.log('frame', f, '/', N);
}
console.log('done', OUT);
ws.close(); chrome.kill(); server.close();
