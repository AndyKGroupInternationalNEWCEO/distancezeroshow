// Browser test of the Melbourne Underground DJ Room on its dev page (melbourne-dev.html: the studio, the Vienna Piano
// Stage and the DJ room), in headless Chrome (local only: its own static server on 127.0.0.1).
//   node virtual-studio/vienna/dev-page.mjs && node virtual-studio/melbourne/e2e.mjs
// Writes screenshots and report.json to test-output/melbourne/. CHROME=/path/to/chrome overrides the browser.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from '../vienna/serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'test-output', 'melbourne');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
fs.mkdirSync(OUT, { recursive: true });

const server = createServer(ROOT);
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dz-mel-'));
const debugPort = 9000 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--use-angle=metal', '--enable-gpu',
  '--ignore-gpu-blocklist', '--no-first-run', '--mute-audio', '--window-size=1600,900', 'about:blank'], { stdio: 'ignore' });
let page;
for (let i = 0; i < 50 && !page; i++) {
  await new Promise(r => setTimeout(r, 200));
  try { page = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(t => t.type === 'page'); } catch {}
}
if (!page) throw new Error('Chrome did not start');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => { ws.onopen = r; });
let seq = 0; const pending = new Map(), problems = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') problems.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') problems.push('console.error: ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' ').split('\n')[0]);
};
const send = (method, params = {}) => new Promise(r => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
async function run(fn, ...args) {
  const r = await send('Runtime.evaluate', { expression: `(${fn})(...${JSON.stringify(args)})`, awaitPromise: true, returnByValue: true });
  if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result.result.value;
}
async function shot(name) { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.result.data, 'base64')); }

await send('Page.navigate', { url: BASE + 'melbourne-dev.html' });
const ok = await run(async () => { for (let i = 0; i < 300; i++) { if (window.__studio) return true; await new Promise(r => setTimeout(r, 100)); } return false; });
if (!ok) throw new Error('the page did not start');
await run(async () => {
  const [{ VIEWS }, L] = await Promise.all([import('./virtual-studio/views.js'), import('./virtual-studio/melbourne/layout.js')]);
  window.T = {
    a: window.__studio, m: window.__studio.ext.melbourne, v: window.__studio.ext, VIEWS, L,
    sleep: ms => new Promise(r => setTimeout(r, ms)),
    async until(fn, ms = 20000) { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (fn()) return true; await T.sleep(40); } return false; },
    cam: () => window.__studio.camera.position,
    feeds: 0, loops: 0,
  };
  // count the wall's renders of the DJ room, and check each one: never a picture of a picture
  const f = T.m.feed, shotFn = f.shot, before = f.before;
  f.shot = c => { T.feeds++; shotFn(c); };
  f.before = c => { if (T.v.wallMaterial.emissiveMap === T.v.feedTarget.texture) T.loops++; before(c); };
  T.a.director.setAuto(false);
  document.querySelectorAll('.vz,.mz').forEach(e => { e.style.visibility = 'hidden'; });   // clean pictures
  await T.sleep(3000);
});

const results = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log('✔ ' + name); }
  catch (e) { results.push({ name, ok: false, error: e.message }); console.log('✘ ' + name + '\n    ' + e.message); }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

await test('DJ1–DJ5 stand in the club (below the studio floor, inside its walls); DJ6 looks down through the glass', async () => {
  const r = await run(async () => {
    const out = {};
    for (const k of ['DJ1', 'DJ2', 'DJ3', 'DJ4', 'DJ5', 'DJ6']) {
      T.m.pickCamera(k); await T.sleep(3200);
      const p = T.cam(), want = T.VIEWS['m' + k].pos;
      out[k] = { y: +p.y.toFixed(2), inClub: T.L.inClub(p), off: +Math.hypot(p.x - want[0], p.y - want[1], p.z - want[2]).toFixed(2), tally: T.VIEWS['m' + k].cam };
    }
    return out;
  });
  for (const k of ['DJ1', 'DJ2', 'DJ3', 'DJ4', 'DJ5']) expect(r[k].inClub && r[k].y < -0.4 && r[k].off < 0.6, `${k} not in the club: ${JSON.stringify(r[k])}`);
  expect(!r.DJ6.inClub && r.DJ6.y > 2, 'DJ6 should be above the glass: ' + JSON.stringify(r.DJ6));
});

await test('screenshots of DJ1–DJ6 (PERFORMANCE)', async () => {
  await run(() => T.m.setMode('PERFORMANCE'));
  for (const k of ['DJ1', 'DJ2', 'DJ3', 'DJ4', 'DJ5', 'DJ6']) { await run(async k => { T.m.pickCamera(k); await T.sleep(3500); }, k); await shot('cam-' + k); }
});

await test('transition: from the main studio over the glass, through it, down into the club, ends on DJ2', async () => {
  const r = await run(async () => {
    T.m.setEnv('studio'); await T.sleep(2500);
    const start = T.cam().y, seen = { above: false, shaft: false, club: false };
    T.m.setEnv('djroom');
    const t0 = performance.now();
    while (T.m.travelling && performance.now() - t0 < 20000) {
      const p = T.cam(); if (p.y > 0.35) seen.above = true; if (T.L.inShaft(p)) seen.shaft = true; if (T.L.inClub(p)) seen.club = true;
      await T.sleep(30);
    }
    await T.sleep(600);
    return { start, seen, end: T.a.director.current, inClub: T.L.inClub(T.cam()) };
  });
  expect(r.start > 0.35, 'did not start in the studio');
  expect(r.seen.above && r.seen.shaft && r.seen.club, 'the camera did not travel through the glass: ' + JSON.stringify(r.seen));
  expect(r.end === 'mDJ2' && r.inClub, 'did not end on DJ2 in the club: ' + JSON.stringify(r));
});

await test('transition: screenshots on the way down', async () => {
  await run(async () => { T.m.setEnv('studio'); await T.sleep(2500); T.m.setEnv('djroom'); });
  for (const s of [1, 4, 6.5, 9]) { await run(async ms => T.sleep(ms), s === 1 ? 1000 : s === 4 ? 3000 : 2500); await shot('travel-' + String(s).replace('.', '_') + 's'); }
  await run(() => T.until(() => !T.m.travelling));
});

await test('dragging in the club keeps the camera inside it; back to the main studio is a cut, not a flight through the floor', async () => {
  const r = await run(async () => {
    T.m.pickCamera('DJ1'); await T.sleep(3000);
    const c = T.a.controls; c.dispatchEvent({ type: 'start' });   // the operator takes the camera
    T.a.camera.position.y = T.L.ROOM.floor - 2; T.a.camera.position.x += 30; await T.sleep(300);
    const p = T.cam(), kept = T.L.inClub(p) && p.y >= T.L.ROOM.floor + 0.29;
    T.m.setEnv('studio'); await T.sleep(100);
    const after = T.cam().y;
    return { kept, after };
  });
  expect(r.kept, 'a dragged camera left the club');
  expect(r.after > 0.35, 'back to the studio should cut above the floor, got y ' + r.after);
});

await test('studio wall upstairs: DJ room live from the camera picked down there; the studio programme again after the show', async () => {
  const r = await run(async () => {
    T.m.setShow('live'); T.m.setEnv('studio'); T.a.director.go('wall', { instant: true }); await T.sleep(1500);
    const n0 = T.feeds; await T.sleep(1500);
    const live = { shows: T.v.wallShows(), renders: T.feeds - n0, source: T.v.source };
    T.m.showOnWall('DJ4'); await T.sleep(600);
    const shown = T.m.report().shown;
    T.m.pickCamera('DJ3'); await T.sleep(2500);       // the director goes down: the wall upstairs is not seen, not rendered
    const n1 = T.feeds; await T.sleep(1500);
    const below = { renders: T.feeds - n1, shown: T.m.report().shown };
    T.m.setEnv('studio'); T.a.director.go('wall', { instant: true }); await T.sleep(800);
    T.m.setShow('break'); await T.sleep(600);
    const brk = T.v.wallShows();
    T.m.setShow('live'); await T.sleep(600);
    return { live, shown, below, brk, again: T.v.source, loops: T.loops };
  });
  expect(r.live.source === 'melbourne' && r.live.shows === 'feed' && r.live.renders >= 10, 'the wall did not show the DJ room live: ' + JSON.stringify(r.live));
  expect(r.shown === 'DJ4' && r.below.shown === 'DJ3', 'the wall should follow the camera picked down here');
  expect(r.below.renders === 0, 'the wall was rendered while the camera was in the club: ' + r.below.renders);
  expect(r.brk === 'studio' && r.again === 'melbourne', 'break should give the wall back to the studio, live take it again');
  expect(r.loops === 0, 'picture of a picture: ' + r.loops);
});

await test('studio wall: screenshots (wall shot and the wide studio), with a track', async () => {
  await run(async () => { T.m.setTrack({ title: 'Deep Connections', artist: "DJ Andy'K" }); T.m.showOnWall('DJ1'); T.a.director.go('wall', { instant: true }); await T.sleep(2500); });
  await shot('wall-djroom-live');
  await run(async () => { T.a.director.go('studio', { instant: true }); await T.sleep(2500); });
  await shot('studio-wide-djroom-live');
});

await test('presenter desk monitors: the live picture while the wall shows the DJ room, their own screens otherwise', async () => {
  const r = await run(async () => {
    const screens = []; T.a.studio.root.traverse(o => { const p = o.geometry?.parameters; if (o.isMesh && p?.width === 0.32 && p?.height === 0.19) screens.push(o); });
    const map = () => screens.map(m => m.material.map === T.v.feedTarget.texture);
    await T.sleep(200); const on = map();
    T.m.setDeskMonitors(false); await T.sleep(200); const off = map();
    T.m.setDeskMonitors(true); T.m.setWall('main'); await T.sleep(200); const main = map();
    T.m.setWall('djroom'); return { n: screens.length, on, off, main };
  });
  expect(r.n >= 2 && r.on.every(Boolean), 'desk monitors not live: ' + JSON.stringify(r));
  expect(!r.off.some(Boolean) && !r.main.some(Boolean), 'desk monitors should go back to their own screens');
});

await test('the page plays no sound for the DJ room', async () => {
  const n = await run(() => [...document.querySelectorAll('audio,video')].filter(m => !m.paused).length);
  expect(n === 0, n + ' media elements playing');
});

await test('Piano Stage platform: down, the studio floor (mirror) shows through; up, black gloss', async () => {
  const r = await run(async () => {
    const ext = T.v; ext.command('reset'); await T.until(() => ext.lift.state === 'LOWERED', 30000);
    const top = () => { let m = null; ext.stage.platform.traverse(o => { if (Array.isArray(o.material)) m = o.material[1]; }); return m; };
    const floorTransparent = T.a.studio.M.floor.transparent;
    const down = top().visible;
    ext.pickCamera('P1'); await T.sleep(3000);
    return { floorTransparent, down, top: { color: top().color.getHexString(), clearcoat: top().clearcoat, roughness: top().roughness } };
  });
  expect(r.floorTransparent ? r.down === false : r.down === true, 'platform top down: ' + JSON.stringify(r));
  expect(r.top.clearcoat === 1 && r.top.roughness < 0.3, 'platform top should be glossy: ' + JSON.stringify(r.top));
  await shot('piano-P1-down');
  const up = await run(async () => { T.v.command('up'); return T.until(() => T.v.lift.state === 'ELEVATED', 30000); });
  expect(up, 'lift did not reach the top');
  await run(async () => { let m = null; T.v.stage.platform.traverse(o => { if (Array.isArray(o.material)) m = o.material[1]; }); if (!m.visible) throw new Error('top hidden while up'); await T.sleep(1500); });
  await shot('piano-P1-up');
  await run(async () => { T.v.pickCamera('P4'); await T.sleep(3000); });
  await shot('piano-P4-up');
  await run(async () => { T.v.command('down'); await T.until(() => T.v.lift.state === 'LOWERED', 30000); T.v.pickCamera('P4'); await T.sleep(2000); });
  await shot('piano-P4-down');
});

await test('no errors on the page', async () => { expect(!problems.length, problems.join(' | ')); });

const passed = results.filter(r => r.ok).length;
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ date: new Date().toISOString(), results, problems }, null, 2));
console.log(`\n${passed}/${results.length} passed\nreport and screenshots: test-output/melbourne/`);
chrome.kill(); server.close();
process.exit(passed === results.length ? 0 : 1);
