// DJ ROOM (the owner's brief of 2026-10-27/28), in headless Chrome by real clicks: the choice on entering, PLAY DJ at
// the console, SIMULATE LIVE SHOW, and the PAUSE (transition) jingle played whole before the next track.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
const REPO = process.env.REPO || '/Users/andrejkneisl/DISTANCE-ZERO/virtual-space-vienna';
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), 'dj-test');
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
const st = () => run(`(() => { const v = ${S}, m = v.melbourne, d = v.spaces.dj; return { active: v.spaces.active, choice: !document.querySelector('.sp-choice').hidden, choiceBtn: document.querySelector('.sp-choice .play').textContent,
  dj: d ? { i: d.i, done: !!d.done, soon: !!d.soon, step: d.steps[d.i - 1] && Object.keys(d.steps[d.i - 1])[0], el: d.el ? (d.el.crossOrigin ? 'track' : 'jingle') : null, t: d.el ? +d.el.currentTime.toFixed(1) : 0, dur: d.el ? +(d.el.duration || 0).toFixed(1) : 0, paused: d.el ? d.el.paused : null, ended: d.el ? d.el.ended : null } : null,
  opening: m.opening.state, pov: document.body.classList.contains('sp-pov-on') }; })()`);
// HARD_LIMIT: never left running
setTimeout(() => { console.log('TIMEOUT', JSON.stringify(problems)); chrome.kill(); process.exit(2); }, 300000);
await send('Page.navigate', { url: BASE + 'melbourne-dev.html' });
await run(`(async () => { for (let i = 0; i < 300 && !window.__studio?.ext?.spaces; i++) await new Promise(r => setTimeout(r, 100)); __studio.director.setAuto(false); })()`);
await sleep(3000);
const enterDj = async () => { await click('.spaces [data-space="dj"]'); if (!await W(`!document.querySelector('.sp-choice').hidden`, 10000)) await click('.spaces [data-space="dj"]'); };
await enterDj(); await sleep(4000); let d = await st();
check('DJ ROOM: the choice, no show by itself (4 s)', d.active === 'dj' && d.choice && d.choiceBtn === 'Play DJ' && !d.dj && d.opening !== 'PLAYING', d);
await shot('1-dj-choice');
await click('.sp-choice .play'); await W(`document.body.classList.contains('sp-pov-on')`, 20000); await sleep(1500); d = await st();
check('PLAY DJ: at the console in first person, no show', d.pov && !d.dj && d.opening !== 'PLAYING', d);
await shot('2-play-dj');
await run(`document.querySelector('.sp-pad .home').click()`); await sleep(1500);
await enterDj(); await sleep(500); await click('.sp-choice .sim');
check('SIMULATE LIVE SHOW: STARTING SOON, then opening 1', await W(`${S}.melbourne.opening.state === 'PLAYING'`, 60000), await st());
await run(`${S}.melbourne.djOpening('seek', 97.5)`);
check('opening ends → track 1 plays', await W(`${S}.spaces.dj?.el?.crossOrigin === 'anonymous' && !${S}.spaces.dj.el.paused && ${S}.spaces.dj.el.currentTime > 1`, 60000), await st());
await run(`(() => { const a = ${S}.spaces.dj.el; a.currentTime = a.duration - 1.5; })()`);
check('track 1 ends → the PAUSE jingle plays', await W(`${S}.spaces.dj?.el && !${S}.spaces.dj.el.crossOrigin && !${S}.spaces.dj.el.paused && ${S}.spaces.dj.el.duration > 60`, 20000), await st());
d = await st(); console.log('  jingle:', JSON.stringify(d.dj));
// past the old 12 s cut: it must go on playing (no fade, no next track)
await run(`${S}.spaces.dj.el.currentTime = 11`); await sleep(6000); d = await st();
check('the PAUSE jingle plays on past 12 s (no cut, no fade, same step)', d.dj.el === 'jingle' && d.dj.step === 'jingle' && !d.dj.paused && d.dj.t > 14, d);
const vol = await run(`${S}.spaces.dj.el.volume`); check('…at full volume (no fade-out)', vol === 1, vol);
await run(`${S}.spaces.dj.el.currentTime = 40`); await sleep(3000); d = await st();
check('still the jingle at 40 s', d.dj.el === 'jingle' && !d.dj.paused && d.dj.t >= 42, d);
await shot('3-jingle-40s');
// its end: the next track only after it has ended
await run(`(() => { window.__endedSeen = false; const a = ${S}.spaces.dj.el; a.addEventListener('ended', () => { window.__endedSeen = true; window.__endedAt = a.currentTime; window.__endedDur = a.duration; }, { once: true }); a.currentTime = a.duration - 2; })()`);
check('the jingle plays to its end, then track 2 starts', await W(`${S}.spaces.dj?.el?.crossOrigin === 'anonymous' && ${S}.spaces.dj.el.currentTime > 0.5`, 30000), await st());
const e = await run(`({ seen: window.__endedSeen, at: window.__endedAt, dur: window.__endedDur })`);
check(`the jingle's own end came first (ended at ${e.at?.toFixed?.(2)} of ${e.dur?.toFixed?.(2)} s)`, e.seen && Math.abs(e.at - e.dur) < 0.25, e);
check('no errors', !problems.length, problems);
console.log(`${results.filter(Boolean).length}/${results.length}`, OUT);
chrome.kill(); server.close(); process.exit(0);
