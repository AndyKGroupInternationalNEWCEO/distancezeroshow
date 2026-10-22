// The three space buttons on melbourne-dev.html (the main page's content), in headless Chrome, by real clicks (CDP
// mouse events at the button's centre): STUDIO / PIANO / DJ ROOM, pause on the second press, one music source.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
const REPO = process.env.REPO || '/Users/andrejkneisl/DISTANCE-ZERO/virtual-space-vienna';
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), 'spaces-test');
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
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
const run = async src => { const r = await send('Runtime.evaluate', { expression: src, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text); return r.result.result.value; };
const shot = async n => fs.writeFileSync(path.join(OUT, n + '.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function click(sel) {
  const r = await run(`(() => { const b = document.querySelector('${sel}').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; })()`);
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: r[0], y: r[1], button: 'left', clickCount: 1 });
}
const state = () => run(`(() => { const v = __studio.ext, m = v.melbourne; return { active: v.spaces.active, piano: v.show.state, paused: v.show.paused, dj: m.opening.state, lift: m.lift.state, env: m.env, view: __studio.director.current,
  labels: [...document.querySelectorAll('.spaces [data-space] small')].map(e => e.textContent), panels: [...document.querySelectorAll('.vz,.mz')].map(e => getComputedStyle(e).display),
  audio: [...document.querySelectorAll('audio')].length, playing: [v.show.audio && Object.values(v.show.audio), m.openings.big.audio, m.openings.short.audio].flat().filter(a => a && !a.paused).length }; })()`);
const results = []; const check = (name, ok, s) => { results.push(ok); console.log((ok ? '✔ ' : '✘ ') + name + (ok ? '' : '  ' + JSON.stringify(s))); };

await send('Page.navigate', { url: BASE + 'melbourne-dev.html' });
await run(`(async () => { for (let i = 0; i < 300 && !window.__studio?.ext?.spaces; i++) await new Promise(r => setTimeout(r, 100)); __studio.director.setAuto(false); })()`);
await sleep(3000);
let s = await state(); check('three buttons, Studio active, director panels hidden', s.active === 'studio' && s.panels.every(d => d === 'none'), s);
await shot('1-start');
await click('[data-space="dj"]'); await sleep(2500); s = await state();
check('DJ ROOM: opening 1 plays, one music source', s.dj === 'PLAYING' && s.playing === 1, s);
await run(`__studio.ext.melbourne.djOpening('seek', 50)`); await run(`(async () => { for (let i = 0; i < 400 && __studio.ext.melbourne.lift.state !== 'DOWN'; i++) await new Promise(r => setTimeout(r, 100)); })()`); await sleep(1500);
await shot('2-dj-club');
await click('[data-space="dj"]'); await sleep(600); s = await state(); check('DJ ROOM again: paused', s.dj === 'PAUSED' && s.playing === 0, s);
await click('[data-space="dj"]'); await sleep(600); s = await state(); check('DJ ROOM again: playing', s.dj === 'PLAYING', s);
await click('[data-space="piano"]'); await sleep(3000); s = await state();
check('PIANO: DJ opening stopped, piano show started, one music source', s.dj === 'IDLE' && s.piano !== 'IDLE' && s.playing <= 1 && s.env === 'studio', s);
await run(`(async () => { for (let i = 0; i < 300 && __studio.ext.show.state === 'PREPARING'; i++) await new Promise(r => setTimeout(r, 100)); })()`); await sleep(9000);
await shot('3-piano');
await click('[data-space="piano"]'); await sleep(600); s = await state(); check('PIANO again: paused', s.paused === true && s.playing === 0, s);
await click('[data-space="studio"]'); await sleep(1500); s = await state();
check('STUDIO: piano stopped, nothing plays', s.piano === 'IDLE' && s.dj === 'IDLE' && s.playing === 0 && s.active === 'studio', s);
await run(`(async () => { for (let i = 0; i < 900 && (__studio.ext.melbourne.travelling || __studio.ext.melbourne.lift.state !== 'UP'); i++) await new Promise(r => setTimeout(r, 100)); })()`); await sleep(2500);
await shot('4-studio');
const v0 = (await state()).view; await click('[data-space="studio"]'); await sleep(2500); s = await state(); check('STUDIO again: next shot', s.view !== v0, { v0, ...s });
await click('.spaces .more'); await sleep(500); await shot('5-more');
const ctrlShown = await run(`getComputedStyle(document.querySelector('.row.ctrl')).display !== 'none'`); check('⋯ opens the old control bar', ctrlShown, {});
check('no errors', !problems.length, problems);
console.log(`${results.filter(Boolean).length}/${results.length}`, OUT);
chrome.kill(); server.close(); process.exit(0);
