// The coloured specks on the Piano Stage's floor (the owner's screenshots of 2026-10-29): the same P1 still with
// the concert light, with the mirror floor and without it, at full and at reduced specular (instant cuts, no flights).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
const REPO = process.env.REPO || '/Users/andrejkneisl/DISTANCE-ZERO/virtual-space-vienna';
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), process.env.OUT_NAME || 'piano-diag');
fs.mkdirSync(OUT, { recursive: true });
execFileSync(process.execPath, [path.join(REPO, 'virtual-studio/vienna/dev-page.mjs')]);
const { createServer } = await import(path.join(REPO, 'virtual-studio/vienna/serve.mjs'));
const server = createServer(REPO); await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dz-sp-'));
process.on('exit', () => { try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch {} });
const port = 9000 + Math.floor(Math.random() * 400);
const chrome = spawn(process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [...(process.env.CHROME_ARGS ? process.env.CHROME_ARGS.split(' ') : []), '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`,
  '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--no-first-run', '--mute-audio', '--window-size=1600,900', 'about:blank'], { stdio: 'ignore' });
let page; for (let i = 0; i < 50 && !page; i++) { await new Promise(r => setTimeout(r, 200)); try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); } catch {} }
const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise(r => { ws.onopen = r; });
let seq = 0; const pending = new Map(), problems = [];
const send = (method, params = {}) => new Promise(r => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
ws.onmessage = e => { const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') problems.push(m.params.exceptionDetails.exception?.description?.split('\n')[0]);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') problems.push('error: ' + m.params.args.map(a => a.value ?? a.description).join(' '));
};
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false, screenWidth: 1600, screenHeight: 900 });
const run = async src => { const r = await send('Runtime.evaluate', { expression: src, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text); return r.result.result.value; };
const shot = async n => fs.writeFileSync(path.join(OUT, n + '.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function click(sel) {
  const r = await run(`(() => { const b = document.querySelector('${sel}').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; })()`);
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: r[0], y: r[1], button: 'left', clickCount: 1 });
}
const results = []; const check = (name, ok, s) => { results.push(ok); console.log((ok ? '✔ ' : '✘ ') + name + (ok ? '' : '  ' + JSON.stringify(s))); };
const W = (cond, ms = 60000) => run(`(async () => { const t0 = Date.now(); while (Date.now() - t0 < ${ms}) { if (${cond}) return true; await new Promise(r => setTimeout(r, 200)); } return false; })()`);
const S = `__studio.ext`;
// anything that could send the visitor's playing away: sockets, peer connections, requests to another site
await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__out = []; for (const k of ['WebSocket', 'RTCPeerConnection', 'EventSource']) { const C = window[k]; if (C) window[k] = function (...a) { __out.push(k + ' ' + a[0]); return new C(...a); }; }
  const f = window.fetch; window.fetch = (u, o) => { const s = String(u?.url || u); if (new URL(s, location.href).origin !== location.origin) __out.push('fetch ' + s); return f(u, o); };
  navigator.sendBeacon && (navigator.sendBeacon = u => { __out.push('beacon ' + u); return true; });` });
await send('Page.navigate', { url: BASE + 'melbourne-dev.html' });
console.log('studio started:', await W(`!!window.__studio?.ext?.spaces`, 300000));
const V = `${S}`;
await run(`(() => { __studio.director.setAuto(false); ${V}.setLook(true); ${V}.setMode('CINEMATIC'); __studio.director.go('vP1', { instant: true }); })()`);
await sleep(12000); await shot('a-default');
await run(`__studio.scene.traverse(o => { if (o.isReflector) o.visible = false; })`); await sleep(6000); await shot('b-no-mirror');
await run(`__studio.scene.traverse(o => { if (o.isReflector) o.visible = true; }); __studio.director.go('vP3', { instant: true })`); await sleep(8000); await shot('c-p3');
console.log('problems', JSON.stringify(problems));
chrome.kill(); server.close(); process.exit(0);
