// PIANO (the owner's brief of 2026-10-27), in headless Chrome by real clicks: the choice on entering (no show by itself),
// PLAY PIANO in private, SIMULATE LIVE SHOW in the agreed order, the NOW PLAYING lower third whole, RETURN TO PIANO.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
const REPO = process.env.REPO || '/Users/andrejkneisl/DISTANCE-ZERO/virtual-space-vienna';
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), 'piano-test');
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
const state = () => run(`(() => { const v = ${S}; return { active: v.spaces.active, show: v.show.state, seg: v.show.segment, view: __studio.director.current, after: v.spaces.afterShow.on,
  choice: !document.querySelector('.sp-choice').hidden, choiceBtn: document.querySelector('.sp-choice .play').textContent, gfx: !document.querySelector('.sp-air').hidden, pianoPanel: document.body.dataset.piano === 'on',
  playing: [...Object.values(v.show.audio || {}), v.melbourne.openings.big.audio, v.melbourne.openings.short.audio].filter(a => a && !a.paused).length, out: window.__out }; })()`);

await send('Page.navigate', { url: BASE + 'melbourne-dev.html' });
await run(`(async () => { for (let i = 0; i < 300 && !window.__studio?.ext?.spaces; i++) await new Promise(r => setTimeout(r, 100)); __studio.director.setAuto(false); })()`);
await sleep(3000);

// 1. entering PIANO: the choice, no show
await click('[data-space="piano"]'); await sleep(5000); let s = await state();
check('PIANO: the choice appears, the show does not start by itself (5 s)', s.active === 'piano' && s.choice && s.choiceBtn === 'Play piano' && s.show === 'IDLE' && !s.gfx && s.playing === 0, s);
await shot('1-choice');
// 2. PLAY PIANO: private, no simulation
await click('.sp-choice .play'); await sleep(1500);
await click('.panel .key.white'); await sleep(4000); s = await state();
check('PLAY PIANO: the piano panel, no show, no on-air graphics, nothing sent out', s.pianoPanel && !s.choice && s.show === 'IDLE' && !s.gfx && s.playing === 0 && !s.out.length, s);
await shot('2-play-piano');
await run(`document.getElementById('panelClose')?.click()`);
// 3. SIMULATE LIVE SHOW: the segments in order, never two recordings at once
await click('[data-space="piano"]'); await sleep(800); s = await state(); check('PIANO again (at rest): the choice again', s.choice && s.show === 'IDLE', s);
await run(`(() => { window.__seq = []; window.__maxPlaying = 0; const v = ${S}; setInterval(() => { const P = v.show, k = P.state === 'SONG' ? 'SONG:' + (P.song?.id || '') : P.state;
  if (__seq[__seq.length - 1] !== k) __seq.push(k); __maxPlaying = Math.max(__maxPlaying, Object.values(P.audio || {}).filter(a => !a.paused).length); }, 50); })()`);
await click('.sp-choice .sim');
check('SIMULATE LIVE SHOW: the show starts', await W(`${S}.show.state !== 'IDLE'`, 20000), await state());
const VIEWPORTS = [[1600, 900], [1280, 720], [1920, 1080], [1366, 768], [1024, 640]];   // (1280×720 ≈ 1920×1080 at 150 % zoom)
const measure = () => run(`(() => { const g = document.querySelector('.sp-air'), r = g.getBoundingClientRect(), l = g.querySelector('.air-l3').getBoundingClientRect(), a = g.querySelector('.l3art'), ar = a.getBoundingClientRect(), br = g.querySelector('.air-l3 b').getBoundingClientRect();
  const inside = q => q.top >= r.top - 0.5 && q.bottom <= r.bottom + 0.5 && q.left >= r.left - 0.5 && q.right <= r.right + 0.5;
  return { vh: innerHeight, gh: Math.round(r.height), l3: inside(l), art: !a.hidden && a.naturalWidth > 0 && inside(ar) && ar.height >= 40, title: inside(br) && br.right <= l.right + 0.5, text: g.querySelector('.air-l3 b').textContent }; })()`);
let measured = false;
const t0 = Date.now();
while (Date.now() - t0 < 12 * 60000) {
  s = await state();
  if (s.show === 'ENDED') break;
  if (s.show === 'SONG' && !measured && await run(`${S}.show.time > 2 && !document.querySelector('.sp-air .l3art').hidden && document.querySelector('.sp-air .l3art').complete`)) {
    measured = true;
    for (const [w, h] of VIEWPORTS) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false, screenWidth: w, screenHeight: h }); await sleep(800);
      for (const cam of ['P1', 'onWall', 'P6']) {
        await run(cam === 'onWall' ? `__studio.director.go('onWall', { instant: true })` : `${S}.pickCamera('${cam}')`); await sleep(1500);
        // before: the overlay as it was (the class it had, which the page's keyboard style also uses), then as it is now
        await run(`document.querySelector('.sp-air').classList.add('keys')`); await sleep(200); const before = await measure(); if (w === 1600) await shot(`3-before-${cam}`);
        await run(`document.querySelector('.sp-air').classList.remove('keys')`); await sleep(200); const after = await measure(); if (w === 1600 || cam === 'P1') await shot(`3-after-${cam}-${w}x${h}`);
        console.log(`  ${w}×${h} ${cam}: before ${JSON.stringify(before)}`);
        check(`NOW PLAYING whole at ${w}×${h} ${cam}: artwork and title inside the picture`, after.gh === after.vh && after.l3 && after.art && after.title, after);
      }
    }
    await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false, screenWidth: 1600, screenHeight: 900 });
  }
  // on through each recording: a jump to 1.5 s before its end, so that each one ends by itself (its 'ended')
  await run(`(() => { const P = ${S}.show, d = P.duration; if (!P.segment || P.paused || !(d > 4) || P.time > d - 3) return;
    if (P.segment === 'song') P.seek(d - 1.5); else P.audio[P.segment].currentTime = d - 1.5; })()`);
  await sleep(700);
}
const segs = (await run(`__seq`)).filter(k => !['IDLE', 'LIVE', 'PREPARING'].includes(k)), maxPlaying = await run(`__maxPlaying`);
console.log("  segments:", segs.join(' → '));
const order = segs.map(k => k.startsWith('SONG:') ? 'SONG' : k).join(',');
check('the agreed order: INTRO (opening, theme) → SONG 1 → PAUSE → SONG 2 → SONG 3 → PAUSE → SONG 4 → PAUSE → closing → ended',
  order === 'OPENING,THEME,SONG,BETWEEN,SONG,SONG,BETWEEN,SONG,BETWEEN,CLOSING,ENDED', order);
check('four different songs', new Set(segs.filter(k => k.startsWith('SONG:'))).size === 4, segs);
check('never two recordings at once', maxPlaying <= 1, maxPlaying);
check('measured the lower third during a song', measured, {});
// 4. the end: RETURN TO PIANO, and nothing starts again
await sleep(1500); s = await state();
check('ENDED: the choice with RETURN TO PIANO, the on-air graphics gone', s.choice && s.choiceBtn === 'Return to piano' && !s.gfx, s);
await shot('4-ended');
await click('.sp-choice .play'); await sleep(9000); s = await state();
check('RETURN TO PIANO: at the piano, no show, no AFTERSHOW, nothing plays (9 s)', s.active === 'piano' && s.show === 'IDLE' && !s.after && !s.gfx && s.playing === 0 && s.pianoPanel, s);
await shot('5-return');
// 5. the other spaces still answer
await click('[data-space="studio"]'); await sleep(1500); s = await state(); check('STUDIO still works', s.active === 'studio' && !s.choice, s);
await click('[data-space="dj"]'); await sleep(2500); s = await state(); check('DJ ROOM still starts its show', s.active === 'dj' && (await run(`${S}.melbourne.opening.state`)) === 'PLAYING', s);
check('nothing sent out', !s.out.length, s.out);
check('no errors', !problems.length, problems);
console.log(`${results.filter(Boolean).length}/${results.length}`, OUT);
chrome.kill(); server.close(); process.exit(0);
