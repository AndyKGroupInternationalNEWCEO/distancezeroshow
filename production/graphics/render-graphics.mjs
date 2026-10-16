// Renders the lower thirds (graphics.html) to OBS-ready files with transparency, frame-exact through headless Chrome:
//   out/<name>.webm  VP9 with alpha (OBS media source, small)      out/<name>.mov  ProRes 4444 with alpha (editing)
//   node production/graphics/render-graphics.mjs                    all presets (andy, georgie, guest)
//   node production/graphics/render-graphics.mjs guest "ANNA MUSTER" "PRODUCER · BERLIN"
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..', '..'), OUT = join(HERE, 'out');
mkdirSync(OUT, { recursive: true });
const FPS = 30;
const jobs = process.argv[2] ? [{ g: process.argv[2], name: process.argv[3], sub: process.argv[4] }] : [{ g: 'andy' }, { g: 'georgie' }, { g: 'guest' }];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try { const b = await readFile(join(ROOT, p)); res.writeHead(200, { 'Content-Type': types[extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
}).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const cdpPort = 9300 + Math.floor(Math.random() * 90);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'dz-gfx-'))}`, '--no-first-run', '--window-size=1920,1080', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws;
for (let i = 0; i < 60 && !ws; i++) { try { const pg = (await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json()).find(t => t.type === 'page'); ws = new WebSocket(pg.webSocketDebuggerUrl); } catch { await sleep(250); } }
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0; const pending = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description); return r.result.result.value; };

for (const j of jobs) {
  const qs = new URLSearchParams({ g: j.g, t: '0', ...(j.name ? { name: j.name } : {}), ...(j.sub ? { sub: j.sub } : {}) });
  await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/production/graphics/graphics.html?${qs}` });
  for (let i = 0; i < 60 && !(await evaluate('!!window.graphicReady').catch(() => false)); i++) await sleep(250);
  const dur = await evaluate('graphic.DURATION'), n = Math.round(dur * FPS);
  const name = `lower-third-${j.name ? j.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') : j.g}`;
  const dir = mkdtempSync(join(tmpdir(), 'dz-gfx-frames-'));
  for (let f = 0; f < n; f++) {
    const url = await evaluate(`(graphic.draw(${f / FPS}), graphic.canvas.toDataURL('image/png'))`);
    writeFileSync(join(dir, `f${String(f).padStart(4, '0')}.png`), Buffer.from(url.split(',')[1], 'base64'));
  }
  const run = args => new Promise((res, rej) => { const p = spawn('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', join(dir, 'f%04d.png'), ...args], { stdio: 'inherit' }); p.on('close', c => c ? rej(new Error('ffmpeg ' + c)) : res()); });
  await run(['-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '24', '-row-mt', '1', '-auto-alt-ref', '0', join(OUT, name + '.webm')]);
  await run(['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-vendor', 'apl0', join(OUT, name + '.mov')]);
  writeFileSync(join(OUT, name + '-still.png'), Buffer.from((await evaluate(`(graphic.draw(4), graphic.canvas.toDataURL('image/png'))`)).split(',')[1], 'base64'));
  console.log(name, `${n} frames`);
}
ws.close(); chrome.kill(); server.close();
