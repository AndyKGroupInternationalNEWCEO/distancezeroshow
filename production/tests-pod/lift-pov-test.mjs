// FIRST PERSON and the lift (the owner's brief of 2026-10-28): PLAY DJ takes the player down into the DJ Room with the
// booth, the eyes ride with the console the whole way (before: the booth went down, the picture stayed up under the
// ceiling), HOME and PLAY DJ again, the studio and PIANO still answer. OUT_NAME=... keeps a before run apart.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
const REPO = process.env.REPO || '/Users/andrejkneisl/DISTANCE-ZERO/virtual-space-vienna';
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), process.env.OUT_NAME || 'lift-pov-test');
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
// where the eyes are against the console: in first person they sit 0.64 m over it (povEye in spaces.js), wherever it is
const where = () => run(`(() => { const v = ${S}, m = v.melbourne, g = m.booth.gear.group, c = __studio.camera, p = new (c.position.constructor)();
  g.getWorldPosition(p); return { pov: document.body.classList.contains('sp-pov-on'), view: __studio.director.current, lift: m.lift.state, env: m.env, moving: !!m.travelling,
    camY: +c.position.y.toFixed(2), boothY: +p.y.toFixed(2), off: +(c.position.y - p.y).toFixed(2), dist: +c.position.distanceTo(p).toFixed(2) }; })()`);

await send('Page.navigate', { url: BASE + 'melbourne-dev.html' });
await run(`(async () => { for (let i = 0; i < 300 && !window.__studio?.ext?.spaces; i++) await new Promise(r => setTimeout(r, 100)); __studio.director.setAuto(false); })()`);
await sleep(3000);
const enterDj = async () => { await click('.spaces [data-space="dj"]'); if (!await W(`!document.querySelector('.sp-choice').hidden`, 10000)) await click('.spaces [data-space="dj"]'); };

// 1. PLAY DJ with the booth up in the studio
let w = await where(); check('at the start the booth is up in the studio', w.lift === 'UP', w);
await enterDj(); await sleep(1500);
await click('.sp-choice .play'); await W(`document.body.classList.contains('sp-pov-on')`, 20000); await sleep(1500);
w = await where(); const start = w; await shot('1-play-dj-start');
check('PLAY DJ: first person at the console', w.pov && w.view === 'pov', w);
// (the build before this fix stayed up in the studio: the lift is sent down here as a deck's PLAY did then, the same ride)
if (!w.moving && w.lift === 'UP' && !(await run(`${S}.melbourne.travelling`))) { console.log('  (this build stays up: the lift sent down by hand, as a deck PLAY did)'); await run(`${S}.melbourne.transition('down')`); }
// 2. the ride: the eyes against the console, sampled through the whole ride
let maxDev = 0, samples = 0, mid = false;
const t0 = Date.now();
while (Date.now() - t0 < 120000) {
  w = await where(); samples++;
  maxDev = Math.max(maxDev, Math.abs(w.off - start.off));
  if (!mid && w.moving && w.boothY < start.boothY - 1.5) { mid = true; await shot('2-riding'); }
  if (w.lift === 'DOWN' && !w.moving) break;
  await sleep(250);
}
await sleep(2500); w = await where(); await shot('3-down-in-the-club');
console.log('  start', JSON.stringify(start), '\n  end  ', JSON.stringify(w), `\n  ${samples} samples, largest change of the eye height against the console ${maxDev.toFixed(2)} m`);
check('the booth went down into the DJ Room', w.lift === 'DOWN' && w.boothY < start.boothY - 3, w);
check('the eyes rode with it: still 0.64 m over the console, at the bottom and all the way (≤ 0.05 m)', Math.abs(w.off - 0.64) < 0.06 && maxDev <= 0.05, { w, maxDev });
check('still in first person at the bottom', w.pov && w.view === 'pov', w);
// 3. HOME, then PLAY DJ again with the booth already down: straight into the club
await run(`document.querySelector('.sp-pad .home').click()`); await sleep(2500); w = await where();
check('HOME leaves first person', !w.pov, w);
await enterDj(); await sleep(1000); await click('.sp-choice .play'); await W(`document.body.classList.contains('sp-pov-on')`, 20000); await sleep(2000); w = await where();
check('PLAY DJ again: at the console down in the club, the eyes 0.64 m over it', w.pov && w.lift === 'DOWN' && Math.abs(w.off - 0.64) < 0.06, w);
await shot('4-play-dj-again');
// 4. back to the studio: the booth rides up, the studio and PIANO answer
await run(`document.querySelector('.sp-pad .back').click()`); await sleep(800);
await click('.spaces [data-space="studio"]'); await W(`${S}.melbourne.lift.state === 'UP' && !${S}.melbourne.travelling`, 120000); await sleep(1500); w = await where();
check('STUDIO: the booth back up, out of first person', w.lift === 'UP' && !w.pov, w);
await run(`document.querySelector('.air-exit')?.click()`); await sleep(1500);
await click('.spaces [data-space="piano"]'); if (!await W(`!document.querySelector('.sp-choice').hidden`, 10000)) await click('.spaces [data-space="piano"]');
await sleep(800); await click('.sp-choice .play'); await sleep(3000);
const pv = await run(`(() => ({ active: ${S}.spaces.active, view: __studio.director.current, panel: document.body.dataset.piano === 'on' }))()`);
check('PLAY PIANO still works', pv.active === 'piano' && pv.panel, pv);
await shot('5-play-piano');
check('nothing sent out', !(await run('window.__out')).length, await run('window.__out'));
check('no errors', !problems.length, problems);
console.log(`${results.filter(Boolean).length}/${results.length}`, OUT);
chrome.kill(); server.close(); process.exit(0);
