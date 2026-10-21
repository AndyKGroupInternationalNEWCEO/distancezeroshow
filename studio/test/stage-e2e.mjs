// Browser test of the Saturday integration with the REAL Vienna Piano Stage page (the local worktree, as it is now):
// the studio (with the mock OBS) serves /piano-stage/, headless Chrome opens it like the OBS browser source, the
// bridge connects, and the Director drives it: the stage's opening, cameras P1–P5, lighting, and a playlist song with
// PLAY / PAUSE / resume / STOP / NEXT. Every audio or video element that plays in the page is counted, so a second
// sound would show. Screenshots of P1–P5 with the host camera box go to test-output/stage/.
//   node test/stage-e2e.mjs            (needs Google Chrome; ~2 minutes; audio muted)
// The test uses the official "between songs" piano ident as a STAND-IN piano master (in a temporary folder), because
// no Deep Connections piano master exists yet. Nothing is written to the worktree or to the studio's data.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { startStudio, loadConfig } from '../server.js';
import { startMockObs } from './mock-obs.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'test-output', 'stage');
fs.mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const cfg = loadConfig();
const STAGE_ROOT = path.resolve(ROOT, cfg.pianoStage.root);
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); };

/* a temporary DISTANCE-ZERO with a stand-in piano master for "Game" */
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dz-stage-e2e-'));
const dz = path.join(base, 'DISTANCE-ZERO');
const standIn = path.join(STAGE_ROOT, 'assets/audio/piano-sessions/dz-piano-between-songs.wav');
fs.mkdirSync(path.join(dz, 'shared-assets/piano-sessions/deep-connections'), { recursive: true });
fs.copyFileSync(standIn, path.join(dz, 'shared-assets/piano-sessions/deep-connections/02-game-piano.wav'));

const mock = startMockObs({ port: 0, password: 'pw', meters: false }); await mock.ready;
const c = loadConfig();
Object.assign(c, { director: { host: '127.0.0.1', port: 0 }, guest: { host: '127.0.0.1', port: 0 }, obs: { url: `ws://127.0.0.1:${mock.port}` }, viewerChat: null });
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dz-stage-e2e-data-'));
const app = await startStudio({ config: c, dataDir, obsPassword: 'pw', log: { log() {}, warn() {} }, dzRoot: dz });
const D = `http://127.0.0.1:${app.director.port}`;
for (let i = 0; i < 100 && !app.obs.state.connected; i++) await new Promise(r => setTimeout(r, 50));
const cookie = ((await fetch(D + '/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: app.secrets.directorCode }) })).headers.get('set-cookie') || '').split(';')[0];

/* the Director, over the real WebSocket */
const dws = new WebSocket(D.replace('http', 'ws') + '/ws', { headers: { Origin: D, Cookie: cookie } });
await new Promise(r => dws.once('open', r));
let seq = 0; const acks = new Map(); let S = null;
dws.on('message', raw => { const m = JSON.parse(raw); if (m.t === 'state') S = m.s; if (m.t === 'ack' && acks.has(m.id)) { acks.get(m.id)(m); acks.delete(m.id); } });
const send = msg => new Promise(r => { const id = 'e' + ++seq; acks.set(id, r); dws.send(JSON.stringify({ ...msg, id })); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitFor = async (fn, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await sleep(100); } return false; };
await send({ t: 'show.select', show: 'saturday' });

/* Chrome, like the OBS browser source: 1920 × 1080, autoplay allowed, audio muted */
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dz-stage-chrome-'));
const port = 9800 + Math.floor(Math.random() * 150);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist',
  '--no-first-run', '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--window-size=1920,1080', 'about:blank'], { stdio: 'ignore' });
let target;
for (let i = 0; i < 60 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); } catch {} }
const cdp = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => cdp.once('open', r));
let cid = 0; const pend = new Map(), problems = [];
cdp.on('message', raw => { const m = JSON.parse(raw); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') problems.push(m.params.exceptionDetails.exception?.description?.split('\n')[0] || m.params.exceptionDetails.text); });
const cmd = (method, params = {}) => new Promise(r => { const id = ++cid; pend.set(id, r); cdp.send(JSON.stringify({ id, method, params })); });
const run = async (fn, ...args) => { const r = await cmd('Runtime.evaluate', { expression: `(${fn})(...${JSON.stringify(args)})`, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text); return r.result.result.value; };
const shot = async name => { const r = await cmd('Page.captureScreenshot', { format: 'png' }); const f = path.join(OUT, name + '.png'); fs.writeFileSync(f, Buffer.from(r.result.data, 'base64')); return f; };
await cmd('Runtime.enable'); await cmd('Page.enable');
await cmd('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
// every media element that ever plays, with what it plays: a second sound at the same time would be visible here
await cmd('Page.addScriptToEvaluateOnNewDocument', { source: `window.__media = new Set(); const _p = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { window.__media.add(this); return _p.apply(this, arguments); };
  window.__playing = () => [...window.__media].filter(m => !m.paused && !m.ended && m.currentTime > 0 && !(m.tagName === 'VIDEO' && m.muted)).map(m => (m.currentSrc || m.src).split('/').pop());` });
const t0 = Date.now();
await cmd('Page.navigate', { url: app.urls().pianoStage.replace(/^http:\/\/127\.0\.0\.1:\d+/, D) });

const connected = await waitFor(() => S?.stage?.connected, 60000);
ok('the real Vienna Piano Stage page loads from the worktree and its bridge connects', connected, connected ? `${((Date.now() - t0) / 1000).toFixed(1)} s` : 'no connection');
if (!connected) { await finish(); process.exit(1); }
const rep = () => S.stage.report;
await waitFor(() => rep(), 5000);
ok('it reports the stage\'s own state', rep()?.state === 'IDLE' && rep()?.program === 'P1', JSON.stringify({ state: rep()?.state, program: rep()?.program, lift: rep()?.lift, keys: rep()?.keys }));
ok('clean picture: the page\'s own controls and the stage panel are hidden', await run(() => ['header.top', 'nav.dock', '.vz', '.hint', '.shot'].every(s => { const e = document.querySelector(s); return !e || getComputedStyle(e).display === 'none'; })));
ok('not the Virtual Space on-air simulation (no theme song or music bed, no ON AIR graphics)', await run(() => !document.body.classList.contains('obs') && !document.querySelector('.air:not([hidden])')));
ok('nothing plays before the Director starts it', (await run(() => window.__playing())).length === 0);

/* cameras P1–P5, each with the host camera box of the PIANO STAGE scene drawn on top (from shows/saturday.json) */
const box = JSON.parse(fs.readFileSync(path.join(ROOT, 'shows/saturday.json'), 'utf8')).scenes.find(s => s.name === 'PIANO STAGE').items.find(i => i[0] === 'Cam // Andrej')[1];
await send({ t: 'stage', cmd: 'lift', lift: 'up' });
await waitFor(() => rep()?.lift === 'ELEVATED', 30000);
for (const k of ['P1', 'P2', 'P3', 'P4', 'P5']) {
  const r = await send({ t: 'stage', cmd: 'cam', cam: k });
  await sleep(2500);   // the camera flies to the shot
  await run((b) => { let el = document.getElementById('camBox'); if (!el) { el = document.createElement('div'); el.id = 'camBox'; document.body.append(el); }
    Object.assign(el.style, { position: 'fixed', left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px', border: '3px solid #ff3b3b', background: 'rgba(255,59,59,.25)', zIndex: 99, pointerEvents: 'none' }); }, box);
  await shot('cam-' + k);
  await run(() => document.getElementById('camBox')?.remove());
  ok(`camera ${k} from the Director`, r.ok && rep()?.program === k, r.ok ? `program ${rep()?.program}` : r.error);
}
const lm = await send({ t: 'stage', cmd: 'mode', mode: 'CINEMATIC' });
await sleep(600);
ok('lighting mode from the Director', lm.ok && rep()?.mode === 'CINEMATIC', rep()?.mode);
await send({ t: 'stage', cmd: 'mode', mode: 'WARM PIANO' });
await send({ t: 'stage', cmd: 'lift', lift: 'reset' });
await waitFor(() => rep()?.lift === 'LOWERED', 30000);

/* the stage's opening from the Director (GO of "OPENING — PIANO SESSIONS" sends the same command) */
const st = await send({ t: 'stage', cmd: 'start' });
await waitFor(() => rep()?.state === 'OPENING' && rep()?.time > 1, 15000);
const p1 = await run(() => window.__playing());
ok('OPENING: the official short opening plays — and only it', st.ok && rep()?.state === 'OPENING' && p1.length === 1 && /opening/.test(p1[0]), `${rep()?.state} ${rep()?.time}s · playing: ${p1.join(', ')}`);
await sleep(3000);
ok('the stage\'s clock is the audio: time runs', rep()?.time > 3 && rep()?.clock === 'audio', `t=${rep()?.time} clock=${rep()?.clock}`);
const skip = await send({ t: 'stage', cmd: 'skip' });
await waitFor(() => rep()?.state === 'THEME' && rep()?.time > 1, 10000);
const p2 = await run(() => window.__playing());
ok('DISTANCE // ZERO (Piano Version) follows — and only it plays', skip.ok && p2.length === 1 && /theme/.test(p2[0]), `playing: ${p2.join(', ')} · ${rep()?.label}`);
const live = await send({ t: 'stage', cmd: 'live' });
await waitFor(() => rep()?.state === 'LIVE', 8000);
ok('LIVE PIANO: all audio stops', live.ok && (await run(() => window.__playing())).length === 0, rep()?.state);

/* the playlist: PLAY / PAUSE / resume / STOP / NEXT on the stage's song slot */
const play = await send({ t: 'playlist', action: 'play', index: 0 });
await waitFor(() => rep()?.state === 'SONG' && rep()?.time > 1, 10000);
let p3 = await run(() => window.__playing());
ok('PLAY: the piano master plays on the stage (stand-in file), alone', play.ok && rep()?.song === 'piano-sessions/game' && p3.length === 1 && /^game\?k=/.test(p3[0]), play.ok ? `${rep()?.label} · ${rep()?.time}s · playing ${p3.map(x => x.replace(/k=.*/, 'k=…')).join(', ')}` : play.error);
ok('the keys stay still: no approved, time-synchronised piano part', rep()?.keys === 'still');
await sleep(1500);
const before = rep().time;
const pause = await send({ t: 'playlist', action: 'pause' });
await sleep(1500);
const tPaused = rep().time; await sleep(1200);
ok('PAUSE holds the song (time stands, nothing plays)', pause.ok && rep().paused && Math.abs(rep().time - tPaused) < 0.05 && (await run(() => window.__playing())).length === 0, `t=${rep().time} (was ${before})`);
const resume = await send({ t: 'playlist', action: 'play' });
await sleep(1500);
ok('PLAY after PAUSE carries on from there', resume.ok && !rep().paused && rep().time > tPaused + 0.5 && rep().time < tPaused + 4, `t=${rep().time} after ${tPaused}`);
const sk = await send({ t: 'stage', cmd: 'seek', time: 20 });
await sleep(800);
ok('seek within the song (the stage\'s own seek)', sk.ok && rep().time >= 20 && rep().time < 23, `t=${rep().time}`);
const stop = await send({ t: 'playlist', action: 'stop' });
await waitFor(() => rep()?.state === 'LIVE', 5000);
ok('STOP: back to live piano, silence', stop.ok && rep()?.state === 'LIVE' && (await run(() => window.__playing())).length === 0, rep()?.state);
const next = await send({ t: 'playlist', action: 'next' });
ok('NEXT to a track without a piano master is refused (the original is never played)', !next.ok && /PIANO MASTER MISSING/.test(next.error), next.error);
ok('the Director sees the stage via the studio state', S.playlist?.viaStage && S.stage?.report?.obs === false && S.stage.pages === 1, `pages ${S.stage.pages}, obs ${S.stage.report.obs}`);
ok('no script errors in the page', problems.length === 0, problems.slice(0, 3).join(' | '));

await finish();
process.exit(results.every(r => r.pass) ? 0 : 1);

async function finish() {
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ at: new Date().toISOString(), worktree: STAGE_ROOT, results }, null, 2));
  try { cdp.close(); } catch {} chrome.kill(); dws.close();
  await app.close(); await mock.close();
  fs.rmSync(base, { recursive: true, force: true }); fs.rmSync(dataDir, { recursive: true, force: true });
  setTimeout(() => fs.rmSync(profile, { recursive: true, force: true }), 500);
  console.log(`\n${results.filter(r => r.pass).length}/${results.length} passed · screenshots: ${OUT}`);
}
