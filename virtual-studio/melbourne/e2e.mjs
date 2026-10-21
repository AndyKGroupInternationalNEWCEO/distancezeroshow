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
  '--ignore-gpu-blocklist', '--no-first-run', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--window-size=1600,900', 'about:blank'], { stdio: 'ignore' });
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
    a: window.__studio, m: window.__studio.ext.melbourne, v: window.__studio.ext, VIEWS, L, three: await import('three'),
    sleep: ms => new Promise(r => setTimeout(r, ms)),
    async until(fn, ms = 20000) { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (fn()) return true; await T.sleep(40); } return false; },
    cam: () => window.__studio.camera.position,
    feeds: 0, loops: 0,
    async openCover() { T.m.armsCommand('retract'); await T.until(() => T.m.booth.arms.state === 'STOWED', 12000); T.m.coverCommand('open'); return T.until(() => T.m.cover.state === 'OPEN', 12000); },
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

await test('one DJ booth in the whole scene, on the DJ lift\'s platform, up in the studio at the start; the studio\'s small music station stands aside', async () => {
  const r = await run(() => {
    let booths = 0; T.a.scene.traverse(o => { if (o.name === 'melbourne-booth') booths++; });
    const b = T.m.booth.group; let onPlatform = false; for (let o = b.parent; o; o = o.parent) if (o === T.m.djLift.platform) onPlatform = true;
    const p = new T.three.Vector3(); b.getWorldPosition(p);
    return { booths, onPlatform, y: +p.y.toFixed(3), lift: T.m.lift.state, music: T.a.studio.music?.visible };
  });
  expect(r.booths === 1, 'booths in the scene: ' + r.booths);
  expect(r.onPlatform && r.lift === 'UP' && Math.abs(r.y) < 0.01, 'the booth should stand on the platform, up in the studio: ' + JSON.stringify(r));
  expect(r.music === false, 'the studio\'s music station should stand aside on this page');
  const pr = await run(async () => { await T.m.probesLoaded(); return { probes: T.m.probes, shows: T.m.boothReflects }; });
  expect(pr.probes && pr.probes.booth > 5 && pr.probes.floor >= 1, 'the Cycles probes did not load: ' + JSON.stringify(pr));
  await run(async () => T.until(() => T.m.boothReflects === 'up', 3000));
  // nothing of the studio's stands on the floor where the opening now is (it would float when the platform is down)
  const over = await run(() => {
    const [a0, a1, c0, c1] = T.L.LIFT_RECT, out = [];
    for (const o of T.a.studio.root.children) {
      if (!o.visible || Math.abs(o.position.y) > 0.05 || o.name === 'melbourne-room') continue;
      const [a, c] = T.L.toFrame(o.position.x, o.position.z);
      if (a > a0 - 0.2 && a < a1 + 0.2 && c > c0 - 0.2 && c < c1 + 0.2) out.push(o.name || o.type);
    }
    return out;
  });
  expect(!over.length, 'studio objects standing on the lift opening: ' + over.join(', '));
  const low = await run(() => {
    const top = T.m.booth.group.localToWorld(new T.three.Vector3(0, T.L.CLUB_BOOTH.riser + T.L.CLUB_BOOTH.top, 0)).y;
    return { state: T.m.booth.arms.state, over: T.m.booth.arms.arms.map(a => new T.three.Box3().setFromObject(a.cab).max.y - top) };
  });
  expect(low.state === 'STOWED' && low.over.every(v => v < 0), 'stowed, the monitors should stay under the console\'s top: ' + JSON.stringify(low));
  await run(async () => { T.a.director.go('music', { instant: true }); await T.sleep(2500); });
  await shot('booth-up-studio');
  for (const v of ['floor', 'djwide']) { await run(async v => { T.a.director.go(v, { instant: true }); await T.sleep(2500); }, v); await shot('up-' + v); }
});

await test('DJ TRANSITION down: the booth rides the platform from the studio floor to the club floor, smooth start and stop, the cameras follow; nothing in its way', async () => {
  const r = await run(async () => {
    const m = T.m, b = m.booth.group, box = new T.three.Box3(), ob = new T.three.Box3(), p = new T.three.Vector3();
    // what the booth and platform must never touch on the way: the glass, the club's truss heads, smoke machines, the
    // cameras DJ1–DJ5 (as small boxes round their lenses), the club's columns
    const obstacles = [];
    m.room.panes.forEach((o, i) => obstacles.push(['glass ' + i, o]));
    m.room.heads.forEach((h, i) => obstacles.push(['head ' + i, h.head]));
    const cams = ['DJ1', 'DJ2', 'DJ3', 'DJ4', 'DJ5'].map(k => [k, new T.three.Vector3(...T.VIEWS['m' + k].pos)]);
    const hits = new Set(), views = [], ys = [], speeds = [];
    m.transition('down');
    const t0 = performance.now();
    while (performance.now() - t0 < 40000) {
      const v = T.a.director.current; if (views.at(-1) !== v) views.push(v);
      box.setFromObject(b).union(ob.setFromObject(m.djLift.platform));
      for (const [n, o] of obstacles) if (o.visible !== false && box.intersectsBox(ob.setFromObject(o))) hits.add(n);
      for (const [n, c] of cams) if (box.distanceToPoint(c) < 0.25) hits.add('camera ' + n);
      b.getWorldPosition(p); ys.push(p.y); speeds.push(Math.abs(m.lift.speed));
      if (!m.travelling && m.lift.state === 'DOWN') break;
      await T.sleep(50);
    }
    b.getWorldPosition(p);
    return { views, hits: [...hits], end: m.lift.state, y: +p.y.toFixed(3), floor: T.L.ROOM.floor, vmax: Math.max(...speeds), first: speeds.slice(0, 200), last: speeds.slice(-6), s: (performance.now() - t0) / 1000, mode: m.mode, cam: T.a.director.current, inClub: T.L.inClub(T.cam()) };
  });
  expect(r.end === 'DOWN' && Math.abs(r.y - (r.floor + 0.02)) < 0.005, 'the booth did not arrive on the club floor: ' + JSON.stringify({ end: r.end, y: r.y }));
  expect(!r.hits.length, 'the booth or its platform touched: ' + r.hits.join(', '));
  expect(r.vmax <= 0.361, 'too fast: ' + r.vmax);
  expect(r.first.some(v => v > 0) && r.first.find(v => v > 0) < 0.06, 'no smooth start: ' + r.first.find(v => v > 0));
  for (const k of ['mLifttop', 'mDJ6', 'mLiftlow', 'mDJ1']) expect(r.views.includes(k), 'the transition did not show ' + k + ': ' + r.views.join(' → '));
  expect(r.mode === 'PERFORMANCE', 'not PERFORMANCE at the bottom');
  expect(await run(() => T.m.boothReflects) === 'down', 'down in the club the console should reflect the club');
  await run(async () => T.until(() => T.a.director.current === 'mDJ2', 8000));
});

await test('DJ TRANSITION: screenshots on the way down (from the studio, through the glass, from the club floor, arrival)', async () => {
  await run(async () => { await T.until(() => T.m.cover.state === 'CLOSED', 12000); await T.openCover(); T.m.liftCommand('reset'); await T.until(() => T.m.lift.state === 'UP', 30000); T.m.transition('down'); });
  for (const [name, until] of [['lift-1-start', 'T.m.lift.depth > 0.4'], ['lift-2-glass', 'T.a.director.current === "mDJ6" && T.m.lift.depth > 2.0'], ['lift-3-club', 'T.a.director.current === "mLiftlow" && T.m.lift.depth > 4.2'], ['lift-4-arrived', 'T.a.director.current === "mDJ1"']]) {
    await run(async c => { await T.until(() => eval(c), 30000); await T.sleep(300); }, until);
    await shot(name);
  }
  await run(async () => T.until(() => !T.m.travelling, 10000));
});

await test('the gear moves on data only: still without it; a playing deck turns its jog, counts its time and shows its track; pause stops it; mixer, meters and mic follow what is sent', async () => {
  const r = await run(async () => {
    const m = T.m, gear = m.booth.gear, jog = gear.decks[1].jog;
    const r0 = jog.rotation.y; await T.sleep(1000);
    const still = Math.abs(jog.rotation.y - r0) < 1e-9 && gear.decks.every(d => d.data.state === 'stop' && !d.data.title);
    const cap0 = gear.strips[1].cap.position.z;
    m.setDeck(2, { title: 'Deep Connections', artist: "DJ Andy'K", bpm: 124, key: '8A', duration: 300, position: 10, state: 'play' });
    const a0 = jog.rotation.y; await T.sleep(1000);
    const turned = Math.abs(jog.rotation.y - a0), pos = m.report().gear.decks[1].position;
    m.setDeck(2, { state: 'pause' }); const p0 = jog.rotation.y; await T.sleep(600);
    const paused = Math.abs(jog.rotation.y - p0) < 1e-9 && Math.abs(m.report().gear.decks[1].position - pos) < 0.7;
    m.setMixer({ ch: [{}, { fader: 1, hi: 0.2 }], xfader: 0.2 }); await T.sleep(100);
    const capMoved = Math.abs(gear.strips[1].cap.position.z - cap0) > 0.05;
    m.setLevels({ ch: [0, 0.8, 0, 0], master: [0.7, 0.7] }); await T.sleep(50);
    const lit = gear.strips[1].segs.filter(x => x.color.r + x.color.g + x.color.b > 0.3).length, dark = gear.strips[0].segs.filter(x => x.color.r + x.color.g + x.color.b > 0.3).length;
    m.setMic(true);
    return { still, turned, pos, paused, capMoved, lit, dark, bpm: m.bpm, track: m.L.track?.title };
  });
  expect(r.still, 'the gear moved without data');
  expect(r.turned > 2.5 && r.turned < 4.5, '33⅓ rpm is about 3.5 rad a second; turned ' + r.turned);
  expect(r.pos > 10.5 && r.pos < 11.6, 'position should count from 10 s: ' + r.pos);
  expect(r.paused && r.capMoved, 'pause or the mixer did not follow: ' + JSON.stringify(r));
  expect(r.lit >= 10 && r.dark === 0, 'meters should follow the levels sent: ' + JSON.stringify({ lit: r.lit, dark: r.dark }));
  expect(r.bpm === 124 && r.track === 'Deep Connections', 'the deck\'s BPM and title should reach the lights and walls');
  await run(async () => { T.m.setDeck(2, { state: 'play' }); T.m.setDeck(3, { title: 'Cycles', artist: "DJ Andy'K", bpm: 124, duration: 280, position: 95, state: 'pause' }); T.m.setMixer({ ch: [{ fader: 0 }, { fader: 0.9 }, { fader: 0.6 }, { fader: 0 }], xfader: 0.5 });
    const k = setInterval(() => T.m.setLevels({ ch: [0, 0.55 + Math.random() * 0.3, 0.2, 0], master: [0.7, 0.68] }), 80); T.levels = k;
    T.m.pickCamera('DJ4'); await T.sleep(3500); });
  await shot('gear-DJ4');
  await run(async () => { T.m.pickCamera('DJ5'); await T.sleep(3500); });
  await shot('gear-DJ5');
  await run(async () => { T.m.pickCamera('DJ2'); await T.sleep(3500); });
  await shot('gear-DJ2');
  await run(() => { clearInterval(T.levels); });
});

await test('shaft cover: with the booth down it slides in and rises flush with the glass floor, closing the whole opening; the lift is locked while it is not open; it will not close over a booth that is up; it sounds while it moves', async () => {
  const r = await run(async () => {
    const m = T.m, c = m.cover;
    await T.until(() => c.state === 'CLOSED', 15000);            // it closed by itself after the descent
    const auto = c.state === 'CLOSED';
    await T.openCover(); c.group.updateMatrixWorld(true);
    const close = m.coverCommand('close'); await T.sleep(400);
    const moving = auto && close.ok && c.state === 'CLOSING', sound = c.sound.playing || !c.sound.on;
    await T.until(() => c.state === 'CLOSED', 12000);
    const box = new T.three.Box3().setFromObject(c.group.children[0]);   // the glass
    const [a0, a1, c0, c1] = T.L.LIFT_RECT, corners = [[a0, c0], [a1, c0], [a0, c1], [a1, c1]].map(([a, cc]) => T.L.at(a, cc));
    const inside = corners.every(([x, z]) => x >= box.min.x - 0.02 && x <= box.max.x + 0.02 && z >= box.min.z - 0.02 && z <= box.max.z + 0.02);
    const flush = Math.abs(box.max.y - 0.002) < 0.003;
    const lockedUp = m.liftCommand('up').ok === false && m.lift.state === 'DOWN';
    return { moving, sound, state: c.state, inside, flush, lockedUp };
  });
  expect(r.moving && r.sound, 'the cover did not close by itself after the descent, with its sound: ' + JSON.stringify(r));
  expect(r.state === 'CLOSED' && r.inside && r.flush, 'the cover does not close the opening flush: ' + JSON.stringify(r));
  expect(r.lockedUp, 'the lift moved with the cover closed');
  await run(async () => { T.a.director.go('music', { instant: true }); await T.sleep(2500); });
  await shot('cover-closed-studio');
  await run(async () => { T.m.pickCamera('DJ6'); await T.sleep(3000); });
  await shot('cover-closed-DJ6');
  await run(async () => { T.m.pickCamera('DJ1'); await T.sleep(2500); });
});

await test('monitor arms: out with the booth down (carriage, column, boom), each monitor turned to the DJ, clear of the console and the lift\'s rails; the lift is locked until they are in', async () => {
  const r = await run(async () => {
    const m = T.m, A = m.booth.arms;
    const auto = m.report().arms;                               // (the cover test before took them in to open the cover)
    m.armsCommand('deploy'); await T.until(() => A.state === 'DEPLOYED', 15000);
    const console_ = new T.three.Box3(), b = new T.three.Box3(), ear = m.booth.group.localToWorld(new T.three.Vector3(0, T.L.CLUB_BOOTH.riser + 1.62, -0.55));
    m.booth.group.updateMatrixWorld(true);
    // the console's cabinet: its first mesh after the riser
    console_.setFromObject(m.booth.group.children[2]);
    const out = A.arms.map(a => { b.setFromObject(a.cab); const c = b.getCenter(new T.three.Vector3()); const fwd = new T.three.Vector3(0, 0, 1).applyQuaternion(a.cab.getWorldQuaternion(new T.three.Quaternion()));
      return { hitsConsole: b.intersectsBox(console_), facing: +fwd.dot(ear.clone().sub(c).normalize()).toFixed(2), dist: +c.distanceTo(ear).toFixed(2) }; });
    const locked = m.liftCommand('up').ok === false;
    return { state: A.state, out, locked };
  });
  expect(r.state === 'DEPLOYED', 'the arms did not come out');
  for (const a of r.out) expect(!a.hitsConsole && a.facing > 0.8 && a.dist < 2.1, 'a monitor is not placed for the DJ: ' + JSON.stringify(a));
  expect(r.locked, 'the lift moved with the arms out');
  await run(async () => { T.m.pickCamera('DJ2'); await T.sleep(3000); });
  await shot('arms-DJ2');
  await run(async () => { T.m.pickCamera('DJ1'); await T.sleep(2500); });
  await shot('arms-DJ1');
  for (const v of ['floor', 'djwide']) { await run(async v => { T.a.director.go(v, { instant: true }); await T.sleep(2500); }, v); await shot('down-' + v); }
});

await test('DJ1–DJ5 stand in the club (below the studio floor, inside its walls, clear of the lift); DJ6 looks down through the glass', async () => {
  const r = await run(async () => {
    const out = {};
    for (const k of ['DJ1', 'DJ2', 'DJ3', 'DJ4', 'DJ5', 'DJ6']) {
      T.m.pickCamera(k); await T.sleep(3200);
      const p = T.cam(), want = T.VIEWS['m' + k].pos;
      out[k] = { y: +p.y.toFixed(2), inClub: T.L.inClub(p), off: +Math.hypot(p.x - want[0], p.y - want[1], p.z - want[2]).toFixed(2) };
    }
    return out;
  });
  for (const k of ['DJ1', 'DJ2', 'DJ3', 'DJ4', 'DJ5']) expect(r[k].inClub && r[k].y < -0.4 && r[k].off < 0.6, `${k} not in the club: ${JSON.stringify(r[k])}`);
  expect(!r.DJ6.inClub && r.DJ6.y > 2, 'DJ6 should be above the glass: ' + JSON.stringify(r.DJ6));
});

await test('screenshots of DJ1–DJ6 (PERFORMANCE, the booth down)', async () => {
  await run(() => T.m.setMode('PERFORMANCE'));
  for (const k of ['DJ1', 'DJ2', 'DJ3', 'DJ4', 'DJ5', 'DJ6']) { await run(async k => { T.m.pickCamera(k); await T.sleep(3500); }, k); await shot('cam-' + k); }
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

await test('DJ lift HOLD: a moving lift stops and stays; UP / DOWN / transition refused; released, it answers again', async () => {
  const r = await run(async () => {
    const m = T.m;
    await T.until(() => m.cover.state === 'CLOSED', 12000); await T.openCover();
    m.liftCommand('up'); await T.until(() => m.lift.depth < 4.0, 15000);
    m.setLiftHold(true); await T.until(() => !m.lift.moving, 10000);
    const held = m.lift.depth;
    const up = m.liftCommand('up'), down = m.liftCommand('down'); m.transition('up'); await T.sleep(800);
    const still = Math.abs(m.lift.depth - held) < 1e-6 && !m.travelling;
    m.setLiftHold(false); const again = m.liftCommand('down'); await T.until(() => m.lift.state === 'DOWN', 30000);
    return { state: m.lift.state, held, up: up.ok, down: down.ok, still, again: again.ok };
  });
  expect(!r.up && !r.down && r.still, 'hold let the lift move: ' + JSON.stringify(r));
  expect(r.again && r.state === 'DOWN', 'after the hold the lift should answer: ' + JSON.stringify(r));
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

await test('DJ TRANSITION up: the same booth rides back into the studio; the club is left without a booth', async () => {
  const r = await run(async () => {
    const m = T.m; m.transition('up');
    await T.until(() => !m.travelling && m.lift.state === 'UP', 40000);
    const p = new T.three.Vector3(); m.booth.group.getWorldPosition(p);
    let booths = 0; T.a.scene.traverse(o => { if (o.name === 'melbourne-booth') booths++; });
    return { state: m.lift.state, y: +p.y.toFixed(3), booths, cam: T.a.director.current };
  });
  expect(r.state === 'UP' && Math.abs(r.y) < 0.01 && r.booths === 1, 'not back up: ' + JSON.stringify(r));
  const cv = await run(() => ({ state: T.m.cover.state, close: T.m.coverCommand('close').ok }));
  expect(cv.state === 'OPEN' && cv.close === false, 'the cover should be open and refuse to close over the booth up: ' + JSON.stringify(cv));
  expect(await run(() => T.m.boothReflects) === 'up', 'up in the studio the console should reflect the studio');
  await run(async () => { T.m.pickCamera('DJ1'); await T.sleep(3000); });
  await shot('club-booth-up');
  await run(async () => { T.a.director.go('music', { instant: true }); await T.sleep(2500); });
  await shot('booth-back-up-studio');
});

await test('DJ opening: the official show song drives it; the booth sets off at 0:41 and lands in the club on the first entry (1:00); BUILD-UP before and DROP on 2:47; pause holds everything; stop', async () => {
  const r = await run(async () => {
    const m = T.m, o = m.opening;
    const started = m.djOpening('start').ok; await T.until(() => o.time > 0.3, 15000);
    const playing = o.state === 'PLAYING', first = T.a.director.current;
    m.djOpening('seek', 38); await T.until(() => m.lift.state === 'DESCENDING', 8000);
    const setOff = +o.time.toFixed(2);
    await T.until(() => m.lift.state === 'DOWN', 30000);
    const landed = +o.time.toFixed(2), mode60 = m.mode;
    m.djOpening('seek', 160); await T.sleep(300); const build = m.mode;
    await T.until(() => m.mode === 'DROP', 12000); const drop = +o.time.toFixed(2);
    m.djOpening('pause'); const p0 = o.time; await T.sleep(1000); const held = Math.abs(o.time - p0) < 0.05 && o.state === 'PAUSED';
    m.djOpening('pause'); await T.sleep(500); const resumed = o.state === 'PLAYING';
    m.djOpening('stop');
    return { started, playing, first, setOff, landed, mode60, build, drop, held, resumed, state: o.state };
  });
  expect(r.started && r.playing && r.first === 'djwide', 'the opening did not start on the wide studio shot: ' + JSON.stringify(r));
  expect(r.setOff >= 40.9 && r.setOff <= 43.8, 'the booth should set off at 0:41 (+2.5 s of light): ' + r.setOff);
  expect(Math.abs(r.landed - 60) < 1.2 && r.mode60 === 'PERFORMANCE', 'the booth should land on 1:00 in PERFORMANCE: ' + JSON.stringify(r));
  expect(r.build === 'BUILD-UP' && Math.abs(r.drop - 167) < 0.6, 'BUILD-UP then the DROP on 2:47: ' + JSON.stringify(r));
  expect(r.held && r.resumed && r.state === 'IDLE', 'pause / resume / stop: ' + JSON.stringify(r));
  await run(async () => { T.m.transition('up'); await T.until(() => !T.m.travelling && T.m.lift.state === 'UP', 60000); });
});

await test('DJ opening 1 (short): the booth sets off at 0:35 and lands on the entry at 0:54 with the DROP; starting it stops opening 2', async () => {
  const r = await run(async () => {
    const m = T.m;
    m.djOpening('start', undefined, 'big'); await T.until(() => m.openings.big.time > 0.3, 15000);
    m.djOpening('start', undefined, 'short'); await T.until(() => m.openings.short.time > 0.3, 15000);
    const bigStopped = m.openings.big.state === 'IDLE', o = m.openings.short;
    m.djOpening('seek', 32); await T.until(() => m.lift.state === 'DESCENDING', 8000);
    const setOff = +o.time.toFixed(2);
    await T.until(() => m.lift.state === 'DOWN', 30000);
    const landed = +o.time.toFixed(2); await T.sleep(300); const mode = m.mode;
    m.djOpening('stop');
    return { bigStopped, setOff, landed, mode, state: o.state };
  });
  expect(r.bigStopped, 'opening 2 should stop when opening 1 starts');
  expect(r.setOff >= 34.9 && r.setOff <= 37.8, 'the booth should set off at 0:35 (+2.5 s of light): ' + r.setOff);
  expect(Math.abs(r.landed - 54) < 1.2 && r.mode === 'DROP', 'the booth should land on 0:54 with the DROP: ' + JSON.stringify(r));
  await run(async () => { T.m.transition('up'); await T.until(() => !T.m.travelling && T.m.lift.state === 'UP', 60000); });
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
