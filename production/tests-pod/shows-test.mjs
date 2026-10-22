// The three space buttons on melbourne-dev.html (the main page's content), in headless Chrome, by real clicks (CDP
// mouse events at the button's centre): STUDIO / PIANO / DJ ROOM, pause on the second press, one music source.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
const REPO = process.env.REPO || '/Users/andrejkneisl/DISTANCE-ZERO/virtual-space-vienna';
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), 'shows-test');
fs.mkdirSync(OUT, { recursive: true });
execFileSync(process.execPath, [path.join(REPO, 'virtual-studio/vienna/dev-page.mjs')]);
const { createServer } = await import(path.join(REPO, 'virtual-studio/vienna/serve.mjs'));
const server = createServer(REPO); await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dz-sp-'));
process.on('exit', () => { try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch {} });
const port = 9000 + Math.floor(Math.random() * 400);
const chrome = spawn(process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [...(process.env.CHROME_ARGS ? process.env.CHROME_ARGS.split(' ') : []), '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`,
  '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--no-first-run', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--window-size=1600,900', 'about:blank'], { stdio: 'ignore' });
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

const W = (cond, ms = 60000) => run(`(async () => { const t0 = Date.now(); while (Date.now() - t0 < ${ms}) { if (${cond}) return true; await new Promise(r => setTimeout(r, 200)); } return false; })()`);
const S = `__studio.ext`;
// PIANO: the show order
await click('.spaces [data-space="piano"]'); await sleep(1500);
check('PIANO: STARTING SOON first', await run(`document.querySelector('.sp-card').classList.contains('on') && ${S}.show.state === 'IDLE'`), {});
await shot('piano-soon');
check('then the Piano Sessions start', await W(`${S}.show.state !== 'IDLE'`, 20000), {});
await run(`${S}.showCommand('live')`);
check('LIVE → song 1 plays', await W(`${S}.show.state === 'SONG'`, 15000), await run(`${S}.show.state`));
const song1 = await run(`${S}.show.song?.title`);
await W(`${S}.show.duration > 10`, 20000); await run(`${S}.show.seek(${S}.show.duration - 1.5)`);
check('song 1 ends → between songs', await W(`${S}.show.state === 'BETWEEN'`, 20000), await run(`${S}.show.state`));
await shot('piano-between');
check('between → song 2', await W(`${S}.show.state === 'SONG' && ${S}.show.song?.title !== ${JSON.stringify(song1)}`, 45000), await run(`[${S}.show.state, ${S}.show.song?.title]`));
await sleep(4000); await shot('piano-song2');
const k = await run(`(() => { const kb = __studio.studio.piano.userData.keyboard; return { keys: kb.notes.filter(x => kb.depth(x) > 0).length, cam: __studio.director.current, label: document.querySelector('.spaces [data-space=piano] small').textContent }; })()`);
console.log('  song 2:', JSON.stringify(k));
// DJ ROOM: opening 1 → track → jingle → track
await click('.spaces [data-space="dj"]'); await sleep(2000);
check('DJ ROOM: piano stopped, opening 1 plays', await W(`${S}.melbourne.opening.state === 'PLAYING' && ${S}.show.state === 'IDLE'`, 10000), {});
await run(`${S}.melbourne.djOpening('seek', 97.5)`);
check('opening ends → track 1 plays, the light follows it', await W(`${S}.spaces.dj?.el && !${S}.spaces.dj.el.paused && ${S}.spaces.dj.el.currentTime > 2`, 40000), await run(`${S}.spaces.dj && { i: ${S}.spaces.dj.i, el: !!${S}.spaces.dj.el }`));
const lv = []; for (let i = 0; i < 6; i++) { lv.push(await run(`(() => { const L = ${S}.melbourne.L; return L.music ? [L.music.low, L.music.kick, L.spot.level].map(x => +x.toFixed(2)) : null; })()`)); await sleep(300); }
console.log('  music/light samples [low, kick, spot]:', JSON.stringify(lv));
check('the light follows the track (live analyser)', lv.every(Boolean) && new Set(lv.map(x => x[2])).size > 1, lv);
await shot('dj-track1');
await run(`(() => { const a = ${S}.spaces.dj.el; a.currentTime = a.duration - 1; })()`);
check('track 1 ends → jingle', await W(`${S}.spaces.dj?.el && !${S}.spaces.dj.el.crossOrigin && ${S}.spaces.dj.el.duration > 1`, 15000), {});
await run(`(() => { const a = ${S}.spaces.dj.el; a.currentTime = a.duration - 1; })()`);
check('jingle ends → track 2', await W(`${S}.spaces.dj?.el?.crossOrigin === 'anonymous' && ${S}.spaces.dj.i === 4`, 30000), await run(`${S}.spaces.dj && ${S}.spaces.dj.i`));
await click('.spaces [data-space="dj"]'); await sleep(800);
check("DJ ROOM again: paused", await run(`${S}.spaces.dj.paused && ${S}.spaces.dj.el.paused`), await run(`({ active: ${S}.spaces.active, paused: ${S}.spaces.dj?.paused, elPaused: ${S}.spaces.dj?.el?.paused, i: ${S}.spaces.dj?.i })`));
await click('.spaces [data-space="studio"]'); await sleep(1000);
check('STUDIO: everything stops', await run(`!${S}.spaces.dj && ${S}.melbourne.opening.state !== 'PLAYING' && ${S}.show.state === 'IDLE'`), {});
await click('.edge [data-view-edge="security"]'); await sleep(2500); await shot('edge-cctv');
check('CCTV on the edge', await run(`__studio.director.current === 'security'`), await run(`[__studio.director.current, (() => { const b = document.querySelector('.edge [data-view-edge=security]').getBoundingClientRect(); const el = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return el.className || el.tagName; })()]`));
await click('.more'); await sleep(300);
check('no errors', !problems.length, problems);
console.log(`${results.filter(Boolean).length}/${results.length}`, OUT);
chrome.kill(); server.close(); process.exit(0);
