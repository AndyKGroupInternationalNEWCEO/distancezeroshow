// Exports one background loop's studio for Blender: cache-<shot>/set.glb, scene.json and wall/0001.jpg … (one per frame).
//   node production/blender/export.mjs wide        (shots: wide, two, vienna, melbourne — see export.js)
//   node production/blender/export.mjs opening     the 90 s opening, animated (export-opening.js): cache-opening/
// Then: DZ_CACHE=cache-wide blender -b -P production/blender/build.py
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..', '..');
const shot = process.argv[2] || 'wide', OUT = join(HERE, `cache-${shot}`);
mkdirSync(join(OUT, 'wall'), { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try { const b = await readFile(join(ROOT, p)); res.writeHead(200, { 'Content-Type': types[extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
}).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const cdpPort = 9800 + Math.floor(Math.random() * 150);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'dz-export-'))}`, '--use-angle=metal', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws;
for (let i = 0; i < 60 && !ws; i++) { try { const pg = (await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json()).find(t => t.type === 'page'); ws = new WebSocket(pg.webSocketDebuggerUrl); } catch { await sleep(250); } }
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0; const pending = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'warning') console.warn('page:', m.params.args.map(x => x.value).join(' '));
  if (m.method === 'Runtime.exceptionThrown') console.error('page error:', m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); });
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description); return r.result.result.value; };
await send('Runtime.enable');
await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/production/blender/export.html?shot=${shot}` });
for (let i = 0; i < 240 && !(await evaluate('!!window.exportReady').catch(() => false)); i++) await sleep(500);

writeFileSync(join(OUT, 'set.glb'), Buffer.from(await evaluate('studioExport.glb()'), 'base64'));
const meta = await evaluate('studioExport.meta()');
writeFileSync(join(OUT, 'scene.json'), JSON.stringify(meta));
console.log(`${shot}: ${meta.lights.length} lights, ${meta.shaders.length} custom shaders, ${meta.frames.count} frames`);
const only = +(process.argv[3] || 0);   // optional: export only the first N wall frames (tests)
for (let f = 0; f < (only || meta.frames.count); f++) {
  const url = await evaluate(`studioExport.wall(${f})`);
  writeFileSync(join(OUT, 'wall', `${String(f + 1).padStart(4, '0')}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
  (await evaluate('studioExport.viewfinders()')).forEach((u, k) => {
    mkdirSync(join(OUT, `vf${k}`), { recursive: true });
    writeFileSync(join(OUT, `vf${k}`, `${String(f + 1).padStart(4, '0')}.jpg`), Buffer.from(u.split(',')[1], 'base64'));
  });
}
console.log('done', OUT);
ws.close(); chrome.kill(); server.close();
