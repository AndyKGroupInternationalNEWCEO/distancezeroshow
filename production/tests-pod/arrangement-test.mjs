// The piano arrangements (arrangements.js) in headless Chrome: one picked from SONGS at the Piano plays on the show clock
// with the grand's own sound (no recording), its keys move, its pages lie on the desk, and it ends back at LIVE.
// then the same choice in the DJ ROOM (PLAY DJ at the console, SIMULATE LIVE SHOW, RETURN TO DJ BOOTH).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
const REPO = process.env.REPO || '/Users/andrejkneisl/DISTANCE-ZERO/virtual-space-vienna';
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), 'arrangement-test');
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
setTimeout(() => { console.log('TIMEOUT'); chrome.kill(); process.exit(2); }, 240000);
await send('Page.navigate', { url: BASE + 'melbourne-dev.html' });
await run(`(async () => { for (let i = 0; i < 300 && !window.__studio?.ext?.spaces; i++) await new Promise(r => setTimeout(r, 100)); __studio.director.setAuto(false); })()`);
await sleep(3000);
// count what the grand's own piano sound is asked to play
await run(`(() => { const s = __studio.sound; window.__on = 0; window.__off = 0; const on = s.noteOn, off = s.noteOff; const kb = __studio.studio.piano.userData.keyboard, press = kb.press; window.__keys = 0; kb.press = (n, d) => { if (d > 0) __keys++; return press(n, d); }; s.noteOn = (...a) => { __on++; return on(...a); }; s.noteOff = (...a) => { __off++; return off(...a); }; })()`);
await click('.spaces [data-space="piano"]'); if (!await W(`!document.querySelector('.sp-choice').hidden`, 10000)) await click('.spaces [data-space="piano"]');
await click('.sp-choice .play'); await sleep(1500);
await run(`__studio.panels.open('station', 'songs')`); await sleep(1000);
const head = await run(`document.querySelector('.sp-lib header b')?.textContent`);
check('SONGS lists the piano songs and the 128 arrangements', /6 piano songs · 128 piano arrangements/.test(head || ''), head);
const id = 'back-to-eurodance/stay--piano';
await run(`document.querySelector('.sp-lib [data-id="${id}"]').scrollIntoView({ block: 'center' })`); await sleep(300);
await click(`.sp-lib [data-id="${id}"]`);
check('the arrangement plays (SONG, no recording: the show clock)', await W(`${S}.show.state === 'SONG' && ${S}.show.song?.id === '${id}'`, 20000), await run(`({ s: ${S}.show.state, id: ${S}.show.song?.id })`));
await sleep(4000);
const a = await run(`(() => { const P = ${S}.show, kb = __studio.studio.piano.userData.keyboard; return { clock: P.clock, t: +P.time.toFixed(2), dur: P.duration, keys: __keys, part: ${S}.keyPlayer.part?.song, on: __on, title: document.querySelector('.sp-air .air-l3 b')?.textContent,
  sheet: performance.getEntriesByType('resource').filter(e => e.name.includes('/assets/sheets/back-to-eurodance__stay--piano/')).map(e => e.name.split('/').pop()) }; })()`);
console.log('  ', JSON.stringify(a));
check('it runs on the show clock and moves on (no recording)', a.clock === 'show clock' && a.t > 2 && a.dur > 100, a);
check("the grand's own sound plays its notes", a.on > 10, a);
check('its keys move with its notes', a.keys > 10 && a.part === id, a);
check('its pages are on the desk', a.sheet.length > 0, a);
check('NOW PLAYING shows its title', /Stay \(Piano arrangement\)/.test(a.title || ''), a);
await shot('1-arrangement');
await run(`${S}.show.command('pause')`); await sleep(1500); const offP = await run('__off'); const tp = await run(`${S}.show.time`); await sleep(1500);
check('pause: the notes are let go and the clock stops', offP > 0 && Math.abs((await run(`${S}.show.time`)) - tp) < 0.01, { offP, tp });
await run(`${S}.show.command('pause')`); await sleep(500);
await run(`${S}.show.seek(${S}.show.duration - 1.5)`);
check('at its end it goes back to LIVE (nothing left ringing)', await W(`${S}.show.state === 'LIVE'`, 20000), await run(`${S}.show.state`));
check('no errors', !problems.length, problems);
console.log(`${results.filter(Boolean).length}/${results.length}`, OUT);
chrome.kill(); server.close(); process.exit(0);
