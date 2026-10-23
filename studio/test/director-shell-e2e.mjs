// The Director with the Virtual Space's controls (public/static/director/shell.js), in a real browser:
// the studio (with the mock OBS) serves the Director page, headless Chrome opens it signed in, and the test presses
// the space buttons, ⋯ and its tiles, the edge's places, CCTV and the remote, checking that each drives the studio
// itself (the show switch, the workspaces, the side panels) and that the page throws nothing.
//   CHROME=/usr/bin/google-chrome node test/director-shell-e2e.mjs      (on the RunPod pod, not on the Mac)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { startStudio, loadConfig } from '../server.js';
import { startMockObs } from './mock-obs.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'test-output', 'shell');
fs.mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const mock = startMockObs({ port: 0, password: 'pw', meters: false }); await mock.ready;
const c = loadConfig();
Object.assign(c, { director: { host: '127.0.0.1', port: 0 }, guest: { host: '127.0.0.1', port: 0 }, obs: { url: `ws://127.0.0.1:${mock.port}` }, viewerChat: null });
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dz-shell-e2e-data-'));
const app = await startStudio({ config: c, dataDir, obsPassword: 'pw', log: { log() {}, warn() {} } });
const D = `http://127.0.0.1:${app.director.port}`;
for (let i = 0; i < 100 && !app.obs.state.connected; i++) await sleep(50);
const cookie = ((await fetch(D + '/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: app.secrets.directorCode }) })).headers.get('set-cookie') || '').split(';')[0];
const [cName, cValue] = cookie.split('=');

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dz-shell-chrome-'));
const port = 9800 + Math.floor(Math.random() * 150);
const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--mute-audio', '--window-size=1600,1000', 'about:blank'], { stdio: 'ignore' });
let target;
for (let i = 0; i < 80 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); } catch {} }
const cdp = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => cdp.once('open', r));
let cid = 0; const pend = new Map(), problems = [];
cdp.on('message', raw => { const m = JSON.parse(raw); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') problems.push(m.params.exceptionDetails.exception?.description?.split('\n')[0] || m.params.exceptionDetails.text); });
const cmd = (method, params = {}) => new Promise(r => { const id = ++cid; pend.set(id, r); cdp.send(JSON.stringify({ id, method, params })); });
const run = async (fn, ...args) => { const r = await cmd('Runtime.evaluate', { expression: `(${fn})(...${JSON.stringify(args)})`, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'evaluate failed'); return r.result.result.value; };
const shot = async name => { const r = await cmd('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.result.data, 'base64')); };
const waitPage = async (fn, ms = 10000, ...args) => { const end = Date.now() + ms; while (Date.now() < end) { if (await run(fn, ...args)) return true; await sleep(150); } return false; };
await cmd('Runtime.enable'); await cmd('Page.enable'); await cmd('Network.enable');
await cmd('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
await cmd('Network.setCookie', { name: cName, value: cValue, url: D });
await cmd('Page.navigate', { url: D + '/' });

try {
  const up = await waitPage(() => !!document.querySelector('.vdock .vspaces [data-show]') && !!window.dzDirector?.S, 20000);
  ok('the Director loads with the Virtual Space controls and its studio state', up);
  ok('the old tabs, side tabs and show picker are folded away (the shell drives them)', await run(() => ['.bar .tabs', '#sideTabs', '.bar .showpick'].every(s => getComputedStyle(document.querySelector(s)).display === 'none')));
  const shows = await run(() => [...document.querySelectorAll('.vspaces [data-show]')].map(b => b.dataset.show + ':' + b.querySelector('span').textContent));
  ok('three space buttons = the three shows', shows.length === 3 && shows[0].startsWith('sunday:Studio') && shows[1].startsWith('saturday:Piano') && shows[2].startsWith('friday:DJ'), shows.join(' · '));
  await run(() => document.querySelector('.vguide [data-g=skip]')?.click());
  await shot('01-start');

  // a show switch through the studio's own switch
  await run(() => document.querySelector('.vspaces [data-show=saturday]').click());
  const sw = await waitPage(() => window.dzDirector.S?.showId === 'saturday' && document.body.dataset.space === 'piano', 10000);
  ok('PIANO switches the studio to Saturday, the controls turn gold', sw, await run(() => window.dzDirector.S?.showId + ' · ' + document.body.dataset.space));

  // a second press opens ⋯ with this show's panels
  await run(() => document.querySelector('.vspaces [data-show=saturday]').click());
  await sleep(300);
  const sheet = await run(() => ({ open: getComputedStyle(document.querySelector('.vsheet')).display !== 'none', tiles: [...document.querySelectorAll('.vtile')].filter(t => !t.hidden).map(t => t.dataset.p) }));
  ok('a second press opens ⋯ with Saturday\'s panels (the playlist among them)', sheet.open && sheet.tiles.includes('playlist') && sheet.tiles.length >= 8, sheet.tiles.join(' '));
  await run(() => document.querySelector('.vtile[data-p=runbook]').click());
  await sleep(400);
  const rb = await run(() => ({ show: !document.getElementById('ws-show').hidden, sel: document.querySelector('#sideTabs [aria-selected=true]')?.dataset.p, pressed: document.querySelector('.vtile[data-p=runbook]').getAttribute('aria-pressed') }));
  ok('a tile opens its panel in Show Control (Runbook)', rb.show && rb.sel === 'runbook' && rb.pressed === 'true', JSON.stringify(rb));
  await shot('02-sheet-runbook');

  // the edge: places
  await run(() => document.querySelector('.vedge .vplaces').click());
  for (const k of ['tech', 'rehearse', 'live']) {
    await run(k => document.querySelector(`.veb[data-place=${k}]`).click(), k);
    await sleep(300);
    ok(`the edge's ${k} opens that workspace`, await run(k => !document.getElementById('ws-' + k).hidden && document.querySelector(`.veb[data-place=${k}]`).getAttribute('aria-pressed') === 'true', k));
  }
  await shot('03-edge-live');
  await run(() => document.querySelector('.veb[data-place=cctv]').click());
  await sleep(1500);
  const cc = await run(() => ({ open: !document.querySelector('.vcctv').hidden, flag: !!window.dzDirector.cctv, cam: document.querySelector('.vcctv .vcam').textContent }));
  ok('CCTV opens and asks the studio for the camera pictures', cc.open && cc.flag, JSON.stringify(cc));
  await shot('04-cctv');
  await run(() => document.querySelector('.vcctv .x').click());
  ok('CCTV closes again', await run(() => document.querySelector('.vcctv').hidden && !window.dzDirector.cctv));
  await run(() => document.querySelector('.veb[data-place=host]').click());
  await sleep(300);
  ok('Host mode from the edge', await run(() => document.body.classList.contains('host-mode')));
  await run(() => document.querySelector('.veb[data-place=host]').click());
  await sleep(300);
  ok('and back to the Director', await run(() => !document.body.classList.contains('host-mode')));

  // the remote
  await run(() => document.getElementById('vRemote').click());
  await sleep(300);
  const r0 = await run(() => ({ pad: !document.querySelector('.vpad').hidden, ring: !document.querySelector('.vring').hidden, x: document.querySelector('.vring').style.left }));
  await run(() => document.querySelector('.vpad [data-k=right]').click()); await sleep(250);
  const r1 = await run(() => document.querySelector('.vring').style.left);
  ok('the remote shows and its arrows move the ring', r0.pad && r0.ring && r1 !== r0.x, `${r0.x} → ${r1}`);
  await run(() => document.querySelector('.vdock').classList.remove('open'));
  await run(() => document.querySelector('.vpad [data-k=menu]').click()); await sleep(250);
  ok('MENU opens ⋯', await run(() => document.querySelector('.vdock').classList.contains('open')));
  await run(() => document.querySelector('.vpad [data-k=back]').click()); await sleep(250);
  ok('BACK closes it', await run(() => !document.querySelector('.vdock').classList.contains('open')));
  await shot('05-remote');

  // back to Sunday: Friday's playlist tile is hidden on Sunday
  await run(() => document.querySelector('.vspaces [data-show=sunday]').click());
  await waitPage(() => window.dzDirector.S?.showId === 'sunday', 10000);
  await sleep(700);
  ok('on Sunday ⋯ has no Playlist tile', await run(() => document.querySelector('.vtile[data-p=playlist]').hidden));
  ok('the page threw no errors', problems.length === 0, problems.join(' | '));
} catch (e) { ok('test run', false, e.message); }
finally {
  cdp.close(); chrome.kill('SIGKILL'); await app.close?.(); mock.close?.();
  fs.rmSync(profile, { recursive: true, force: true });
  const failed = results.filter(r => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}
