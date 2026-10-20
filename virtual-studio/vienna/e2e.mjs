// Browser test of the Vienna Piano Stage and of the studio around it, in headless Chrome (local only: its own static
// server on 127.0.0.1, nothing is deployed or fetched from outside).
//   node virtual-studio/vienna/dev-page.mjs && node virtual-studio/vienna/e2e.mjs
// Writes screenshots and report.json to test-output/vienna/. CHROME=/path/to/chrome overrides the browser; HEADFUL=1
// runs it in a normal Chrome window (real compositing, as on the show machine) instead of headless. Audio plays muted
// (it still plays and keeps time). SHOW=0 leaves out the Piano Show's real-time run (about 7 minutes).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'test-output', 'vienna');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
fs.mkdirSync(OUT, { recursive: true });

/* ----- the worktree's preview server (byte ranges, for seeking in the audio masters) ----- */
const server = createServer(ROOT);
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

/* ----- Chrome over the DevTools protocol ----- */
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dz-e2e-'));
const debugPort = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, [...(process.env.HEADFUL ? [] : ['--headless=new']), `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--use-angle=metal', '--enable-gpu',
  '--ignore-gpu-blocklist', '--no-first-run', '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  // a real window behind others must not be throttled (it would slow its frames and timers and fail the timing tests)
  '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--window-size=1600,900', 'about:blank'], { stdio: 'ignore' });
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
// run a function in the page (it is stringified: it can only use its arguments and the page's globals)
async function run(fn, ...args) {
  const r = await send('Runtime.evaluate', { expression: `(${fn})(...${JSON.stringify(args)})`, awaitPromise: true, returnByValue: true });
  if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result.result.value;
}
async function shot(name) { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.result.data, 'base64')); }
async function open(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await send('Page.navigate', { url: BASE + url });
    const ok = await run(async () => { for (let i = 0; i < 200; i++) { if (window.__studio) return true; if (!document.getElementById('fallback')?.hidden && document.readyState === 'complete' && i > 40) return false; await new Promise(r => setTimeout(r, 100)); } return false; }).catch(() => false);
    if (ok) {
      await run(async () => {
        window.T = {
          a: window.__studio, sleep: ms => new Promise(r => setTimeout(r, ms)),
          async until(fn, ms = 25000) { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (fn()) return true; await T.sleep(40); } return false; },
          click: sel => document.querySelector('.vz ' + sel).click(),
          msg: () => document.querySelector('.vz [data-k="msg"]')?.textContent,
          dist: (a, b) => Math.hypot(a.x - b[0], a.y - b[1], a.z - b[2]),
        };
        const [{ VIEWS, inLounge }, layout] = await Promise.all([import('./virtual-studio/views.js'), import('./virtual-studio/vienna/layout.js').catch(() => null)]);
        Object.assign(T, { VIEWS, inLounge, layout });
        T.a.director.setAuto(false);
      });
      return;
    }
  }
  throw new Error('page did not start: ' + url);
}

/* ----- the tests ----- */
const results = [];
async function test(name, fn) {
  const before = problems.length, t0 = Date.now();
  try {
    const detail = await fn();
    const errs = problems.slice(before);
    results.push({ name, ok: errs.length === 0, detail, errors: errs, ms: Date.now() - t0 });
  } catch (e) {
    results.push({ name, ok: false, detail: String(e.message || e).split('\n')[0], errors: problems.slice(before), ms: Date.now() - t0 });
  }
  const r = results.at(-1);
  console.log(`${r.ok ? '✔' : '✖'} ${name}${r.ok ? '' : '  →  ' + JSON.stringify(r.detail) + (r.errors.length ? ' ' + r.errors.join(' | ') : '')}`);
}
const expect = (cond, what) => { if (!cond) throw new Error(what); };

await open('vienna-dev.html');

await test('dev page starts with the stage, panel and controls', async () => {
  const r = await run(() => ({
    ext: !!T.a.ext, stage: !!T.a.scene.getObjectByName('vienna-stage'), panel: !!document.querySelector('.vz'),
    cams: document.querySelectorAll('.vz [data-cam]').length, modes: document.querySelectorAll('.vz [data-mode]').length,
    sources: document.querySelectorAll('.vz [data-src]').length, disabled: [...document.querySelectorAll('.vz [data-src]:disabled')].map(b => b.dataset.src),
    state: document.querySelector('.vz [data-k="state"]').textContent, views: Object.keys(T.VIEWS).filter(k => /^vP/.test(k)),
    piano: T.a.studio.piano.position.toArray(), platform: T.a.ext.stage.platform.position.toArray().map(v => +v.toFixed(3)), stage: T.layout.STAGE,
    pianos: (() => { let n = 0; T.a.scene.traverse(o => { if (o.userData.focus === 'piano' && o.isGroup) n++; }); return n; })(),
  }));
  expect(r.ext && r.stage && r.panel, 'stage or panel missing');
  expect(r.cams === 5 && r.modes === 5 && r.sources === 6, 'control counts ' + JSON.stringify(r));
  expect(r.disabled.join() === 'melbourne,media', 'later-phase sources should be disabled');
  expect(r.state === 'LOWERED' && r.views.length === 5, 'initial state');
  expect(r.piano.join() === '-5.3,0,0.3', 'the grand is not at its original place: ' + r.piano);
  expect(r.platform[0] === r.stage.x && r.platform[2] === r.stage.z && r.platform[1] === 0, 'platform not under the grand');
  expect(r.pianos === 1, 'more than one grand in the scene');
  return r;
});

/* lift */
await test('lift: DOWN refused when lowered, UP raises with limited speed and acceleration', async () => {
  return run(async () => {
    const L = T.a.ext.lift, { LIFT } = T.layout;
    T.click('[data-cmd="down"]'); const refused = T.msg();
    if (!/Already lowered/.test(refused)) throw new Error('DOWN not refused: ' + refused);
    // acceleration over 0.25 s windows: frame to frame, the page's step and this sampler's clock fall out of phase
    let vmax = 0, amax = 0, sampling = true; const track = [];
    const sample = () => { const now = performance.now() / 1000; track.push([now, L.speed]); vmax = Math.max(vmax, Math.abs(L.speed));
      for (let i = track.length - 2; i >= 0; i--) if (now - track[i][0] >= 0.25) { if (L.speed && track[i][1]) amax = Math.max(amax, Math.abs(L.speed - track[i][1]) / (now - track[i][0])); break; }
      if (sampling) requestAnimationFrame(sample); };
    requestAnimationFrame(sample);
    const t0 = performance.now();
    T.click('[data-cmd="up"]');
    const states = [L.state];
    await T.until(() => { if (states.at(-1) !== L.state) states.push(L.state); return L.state === 'ELEVATED'; });
    sampling = false;
    const secs = (performance.now() - t0) / 1000;
    if (L.state !== 'ELEVATED' || Math.abs(L.height - LIFT.travel) > 1e-6) throw new Error('not elevated');
    if (vmax > LIFT.vmax + 1e-6) throw new Error('too fast ' + vmax);
    if (amax > LIFT.accel * 1.5 * 1.15) throw new Error('acceleration ' + amax);   // braking may use up to 1.5× (lift.js)
    const top = T.a.ext.stage.platform.position.y, pianoY = T.a.studio.piano.position.y;
    if (Math.abs(top - T.layout.platformTop(LIFT.travel)) > 1e-6 || Math.abs(pianoY - top) > 1e-6) throw new Error('platform ' + top + ', grand ' + pianoY);
    T.click('[data-cmd="up"]'); const again = T.msg();
    return { states, seconds: +secs.toFixed(1), vmax: +vmax.toFixed(3), accelMax: +amax.toFixed(3), platformTop: top, grandY: pianoY, upAgain: again };
  });
});

await test('lift: conflicting command refused while moving; STOP brakes to STOPPED; DOWN lowers', async () => {
  return run(async () => {
    const L = T.a.ext.lift;
    T.click('[data-cmd="down"]'); await T.sleep(2500);
    T.click('[data-cmd="up"]'); const conflict = T.msg();
    if (!/STOP/.test(conflict) || L.state !== 'LOWERING') throw new Error('conflict not refused: ' + conflict);
    const h0 = L.height; T.click('[data-cmd="stop"]');
    await T.until(() => L.state === 'STOPPED', 5000);
    const braked = +(h0 - L.height).toFixed(3);
    if (L.state !== 'STOPPED' || braked <= 0 || braked > 0.5) throw new Error('stop: ' + L.state + ' ' + braked);
    const stoppedAt = +L.height.toFixed(2);
    await T.sleep(500); if (Math.abs(L.height - stoppedAt) > 0.01) throw new Error('drifts after stop');
    T.click('[data-cmd="down"]'); await T.until(() => L.state === 'LOWERED');
    return { conflict, brakingDistance: braked, stoppedAt, final: L.state };
  });
});

await test('lift: RESET while raising brakes, reverses and returns to LOWERED', async () => {
  return run(async () => {
    const L = T.a.ext.lift;
    T.click('[data-cmd="up"]'); await T.sleep(4000);
    const h = +L.height.toFixed(2); T.click('[data-cmd="reset"]');
    const st = L.state, maxH = { v: L.height };
    await T.until(() => { maxH.v = Math.max(maxH.v, L.height); return L.state === 'LOWERED'; });
    return { resetAt: h, stateAfterReset: st, overshoot: +(maxH.v - h).toFixed(3), final: L.state };
  });
});

await test('mechanism: scissor, rams and platform stay consistent over the whole travel', async () => {
  return run(() => {
    const st = T.a.ext.stage, { LIFT, platformTop } = T.layout, out = [];
    for (let h = 0; h <= LIFT.travel + 1e-9; h += LIFT.travel / 14) {
      const ram = st.pose(h);
      // the rod must stay inside the ram body: body 0.52 m + 0.1 m behind its pivot, rod 0.5 m
      if (ram < 0.4 || ram > 1.02) throw new Error(`ram ${ram.toFixed(3)} at h ${h}`);
      if (Math.abs(st.platform.position.y - platformTop(h)) > 1e-9) throw new Error('platform off at ' + h);
      out.push(+ram.toFixed(3));
    }
    st.pose(T.a.ext.lift.height);
    return { ramLengths: `${out[0]}–${out.at(-1)} m`, steps: out.length };
  });
});

/* cameras */
for (const [k, h] of [['P1', 0], ['P2', 0], ['P3', 0], ['P4', 0], ['P5', 0]]) {
  await test(`camera ${k}: flies to its preset, frames the piano, labelled`, async () => {
    const r = await run(async (k) => {
      T.a.ext.pickCamera(k);
      await T.until(() => !T.a.director.flying, 6000); await T.sleep(600);
      const v = T.VIEWS['v' + k], cam = T.a.camera;
      const piano = T.a.ext.stage.platform.localToWorld(new cam.position.constructor(0, 0.9, 0)).project(cam);
      const keys = T.a.ext.stage.piano.localToWorld(new cam.position.constructor(0, 0.72, 0.1)).project(cam);
      return { view: T.a.director.current, posErr: +T.dist(cam.position, v.pos).toFixed(3), targetErr: +T.dist(T.a.controls.target, v.target).toFixed(3),
        piano: [+piano.x.toFixed(2), +piano.y.toFixed(2)], keys: [+keys.x.toFixed(2), +keys.y.toFixed(2)], shot: document.getElementById('shot').textContent,
        pressed: document.querySelector(`.vz [data-cam="${k}"]`).getAttribute('aria-pressed') };
    }, k);
    await shot(`cam-${k}-lowered`);
    expect(r.view === 'v' + k && r.pressed === 'true', 'not on ' + k);
    expect(r.posErr < 0.05 && r.targetErr < 0.05, 'off preset ' + JSON.stringify(r));
    const inFrame = p => Math.abs(p[0]) < 0.95 && Math.abs(p[1]) < 0.95;
    if (k === 'P2') expect(inFrame(r.keys), 'keyboard out of frame');   // the keyboard close-up: the keys, not the whole grand
    else expect(inFrame(r.piano), 'piano out of frame ' + r.piano);
    return r;
  });
}

await test('cameras follow the rising platform (P1 rides 75 %, P2/P3/P5 ride fully, P5 lags, P4 stays down and tilts up)', async () => {
  const r = await run(async () => {
    const L = T.a.ext.lift, out = {};
    for (const k of ['P1', 'P2', 'P3', 'P4']) out[k] = T.VIEWS['v' + k].pos[1];
    const tilt0 = T.VIEWS.vP4.target[1];
    T.a.ext.pickCamera('P5'); await T.until(() => !T.a.director.flying, 6000);
    const y0 = T.a.camera.position.y;
    T.click('[data-cmd="up"]');
    await T.until(() => L.height > 1.5);
    const lag = +(L.height - (T.a.camera.position.y - y0)).toFixed(3);
    await T.until(() => L.state === 'ELEVATED'); await T.sleep(3500);
    const rise = {}; for (const k of ['P1', 'P2', 'P3', 'P4']) rise[k] = +(T.VIEWS['v' + k].pos[1] - out[k]).toFixed(3);
    return { p5Rise: +(T.a.camera.position.y - y0).toFixed(3), p5LagMidway: lag, rise, p4Tilt: +(T.VIEWS.vP4.target[1] - tilt0).toFixed(2) };
  });
  await shot('cam-P5-elevated');
  // (the cameras' slow drift moves them up to ±0.1 m in height, hence the tolerances)
  expect(Math.abs(r.p5Rise - 3.5) < 0.25, 'P5 did not ride up: ' + r.p5Rise);
  expect(r.p5LagMidway > 0.05, 'P5 should trail the platform');
  expect(Math.abs(r.rise.P1 - 2.625) < 0.25 && Math.abs(r.rise.P2 - 3.5) < 0.1 && Math.abs(r.rise.P4) < 0.1, 'rise ' + JSON.stringify(r.rise));
  expect(Math.abs(r.p4Tilt - 1.75) < 0.05, 'P4 should tilt up with the lift'); 
  return r;
});

for (const k of ['P1', 'P2', 'P3', 'P4']) {
  await test(`camera ${k} at the top: ${k === 'P2' ? 'keyboard' : 'piano'} still framed`, async () => {
    const r = await run(async (k) => {
      T.a.ext.pickCamera(k); await T.until(() => !T.a.director.flying, 6000); await T.sleep(1200);
      const cam = T.a.camera, V = cam.position.constructor;
      const p = (k === 'P2' ? T.a.ext.stage.piano.localToWorld(new V(0, 0.72, 0.1)) : T.a.ext.stage.platform.localToWorld(new V(0, 0.9, 0))).project(cam);
      return [+p.x.toFixed(2), +p.y.toFixed(2)];
    }, k);
    await shot(`cam-${k}-elevated`);
    expect(Math.abs(r[0]) < 0.95 && Math.abs(r[1]) < 0.95, 'out of frame ' + r);
    return { pianoInFrame: r };
  });
}

await test('manual camera override: dragging frees the camera from the preset', async () => {
  return run(async () => {
    const c = T.a.controls; c.dispatchEvent({ type: 'start' }); c.dispatchEvent({ type: 'end' });
    const p = T.a.camera.position.clone(); const free = T.a.director.current;
    T.click('[data-cmd="down"]'); await T.sleep(2500);
    const moved = +T.a.camera.position.distanceTo(p).toFixed(3);
    T.click('[data-cmd="stop"]'); await T.until(() => !T.a.ext.lift.moving, 5000);
    T.click('[data-cmd="reset"]'); await T.until(() => T.a.ext.lift.state === 'LOWERED');
    if (free !== null || moved > 0.2) throw new Error('camera still tied to the preset: ' + moved);
    return { view: free, cameraMovedWhileLiftMoved: moved };
  });
});

/* lighting */
for (const mode of ['WARM PIANO', 'CINEMATIC', 'PERFORMANCE', 'LIFT REVEAL', 'BLACKOUT']) {
  await test(`lighting ${mode}: levels reach the mode, real lights follow`, async () => {
    const r = await run(async (mode) => {
      T.a.ext.pickCamera('P1'); await T.until(() => !T.a.director.flying, 6000);
      document.querySelector(`.vz [data-mode="${mode}"]`).click(); await T.sleep(3500);
      const L = T.a.ext.lights, real = T.a.ext.stage.rig.real, lev = {}, inten = {};
      for (const g of ['perimeter', 'moving', 'accent', 'spot', 'under']) lev[g] = +L[g].level.toFixed(2);
      for (const [g, ls] of Object.entries(real)) inten[g] = ls.map(l => Math.round(l.intensity));
      return { lev, inten, pressed: document.querySelector(`.vz [data-mode="${mode}"]`).getAttribute('aria-pressed') };
    }, mode);
    await shot('light-' + mode.toLowerCase().replace(' ', '-'));
    const goal = (await import('./index.js').catch(() => null))?.MODES;   // not importable in node (three.js); compare against the copy below
    const want = { 'WARM PIANO': [0.8, 0.25, 0.45, 0.55, 0.2], CINEMATIC: [0.3, 0.55, 0.9, 0.85, 0.35], PERFORMANCE: [1, 1, 1, 1, 0.8], 'LIFT REVEAL': [0.12, 0.7, 0.3, 0, 1], BLACKOUT: [0, 0, 0, 0, 0] }[mode];
    ['perimeter', 'moving', 'accent', 'spot', 'under'].forEach((g, i) => expect(Math.abs(r.lev[g] - want[i]) < 0.08, `${g} at ${r.lev[g]}, want ${want[i]}`));
    const all = Object.values(r.inten).flat();
    if (mode === 'BLACKOUT') expect(all.every(v => v === 0), 'light left on in blackout');
    if (mode === 'PERFORMANCE') expect(all.every(v => v > 0), 'a light is off in performance');
    expect(r.pressed === 'true', 'button state');
    void goal;
    return r;
  });
}

await test('stage adds no lights to the studio (studio look; the concert look adds only its key light) and is culled when out of view', async () => {
  return run(async () => {
    const count = () => { let n = 0; T.a.scene.traverse(o => { if (o.isLight) n++; }); return n; };
    const concert = count(); T.a.ext.setLook(false); await T.sleep(200);
    const studio = count(); T.a.ext.setLook(true); await T.sleep(200);
    if (concert !== studio + 1 || count() !== concert) throw new Error(JSON.stringify({ concert, studio }));
    const own = []; T.a.scene.getObjectByName('vienna-stage').traverse(o => { if (o.isLight) own.push(o.type); });
    document.querySelector('.vz [data-mode="PERFORMANCE"]').click();
    T.a.director.go('georgie', { instant: true }); await T.sleep(400);
    const hidden = !T.a.scene.getObjectByName('vienna-stage').visible;
    T.a.ext.pickCamera('P1'); await T.until(() => !T.a.director.flying, 6000); await T.sleep(300);
    const shown = T.a.scene.getObjectByName('vienna-stage').visible;
    document.querySelector('.vz [data-mode="WARM PIANO"]').click();
    if (own.length || !hidden || !shown) throw new Error(JSON.stringify({ own, hidden, shown }));
    return { lightsInStage: own.length, sceneLights: studio, concertLookLights: concert, hiddenWhenAway: hidden };
  });
});

/* cinematic */
await test('cinematic opening: dim → under light → rise → P4/P5 follow → spot on the hit → P1, ends with the jingle', async () => {
  const r = await run(async () => {
    const e = T.a.ext, seen = [], { OPENING } = await import('./virtual-studio/vienna/opening.js');
    let spotBefore = 0, underDuringRise = 0, elevatedAt = null; const t0 = performance.now();
    T.click('[data-cmd="cinematic"]');
    const watch = () => {
      if (elevatedAt === null && e.lift.state === 'ELEVATED') elevatedAt = +((performance.now() - t0) / 1000).toFixed(2);
      if (!seen.length || seen.at(-1).view !== T.a.director.current) seen.push({ view: T.a.director.current, h: +e.lift.height.toFixed(2) });
      if (e.lift.state === 'RAISING') { underDuringRise = Math.max(underDuringRise, e.lights.under.level); spotBefore = Math.max(spotBefore, e.lights.spot.level); }
    };
    const ok = await T.until(() => { watch(); return !e.running; }, 40000);
    await T.sleep(2500);
    return { ok, opening: { hit: OPENING.hit, duration: OPENING.duration, rise: +e.opening.rise.toFixed(2) }, elevatedAt, history: e.history.map(x => `${x.t}s ${x.text} [${x.view} h=${x.h}]`), cuts: seen, finalView: T.a.director.current, mode: e.mode, lift: e.lift.state,
      spotDuringRise: +spotBefore.toFixed(2), underDuringRise: +underDuringRise.toFixed(2), spotAtEnd: +e.lights.spot.level.toFixed(2) };
  });
  await shot('cinematic-final');
  expect(r.ok, 'did not finish');
  const texts = r.history.map(h => h.split(' ').slice(1).join(' '));
  const order = ['lights down', 'under-platform', 'lift rising', 'performance spot', 'done'];
  let i = 0; for (const t of texts) if (i < order.length && t.includes(order[i])) i++;
  expect(i === order.length, 'steps out of order: ' + texts.join(' / '));
  expect(r.cuts.map(c => c.view).join() === 'vP4,vP5,vP1' || r.cuts.map(c => c.view).slice(-3).join() === 'vP4,vP5,vP1', 'cuts ' + JSON.stringify(r.cuts));
  expect(r.finalView === 'vP1' && r.mode === 'CINEMATIC' && r.lift === 'ELEVATED', 'end state');
  expect(r.underDuringRise > 0.8 && r.spotDuringRise < 0.15 && r.spotAtEnd > 0.6, 'light cues ' + JSON.stringify(r));
  // on the jingle's timing (opening.js): the platform arrives on the hit, the opening ends with the jingle
  const at = name => +r.history.find(h => h.includes(name))?.split('s ')[0];
  const { hit, duration } = r.opening;
  expect(Math.abs(at('performance spot') - hit) < 0.1 && Math.abs(r.elevatedAt - hit) < 0.5, `platform up at ${r.elevatedAt}, hit ${hit}`);
  expect(Math.abs(at('done') - duration) < 0.1, 'opening length ' + at('done'));
  return r;
});

await test('cinematic refused unless lowered; manual camera and light overrides respected; STOP cancels', async () => {
  return run(async () => {
    const e = T.a.ext;
    T.click('[data-cmd="cinematic"]'); const refused = T.msg();
    if (!/Lower the platform first/.test(refused)) throw new Error('not refused: ' + refused);
    T.click('[data-cmd="reset"]'); await T.until(() => e.lift.state === 'LOWERED');
    T.click('[data-cmd="cinematic"]'); await T.sleep(5000);
    e.pickCamera('P3'); document.querySelector('.vz [data-mode="WARM PIANO"]').click();
    await T.until(() => !e.running, 40000); await T.sleep(500);
    const after = { view: T.a.director.current, mode: e.mode, lift: e.lift.state };
    if (after.view !== 'vP3' || after.mode !== 'WARM PIANO' || after.lift !== 'ELEVATED') throw new Error('override lost ' + JSON.stringify(after));
    T.click('[data-cmd="reset"]'); await T.until(() => e.lift.state === 'LOWERED');
    T.click('[data-cmd="cinematic"]'); await T.sleep(6000);
    T.click('[data-cmd="stop"]'); await T.until(() => !e.lift.moving, 5000);
    const stopped = { running: e.running, lift: e.lift.state, msg: T.msg() };
    if (stopped.running || stopped.lift !== 'STOPPED') throw new Error('stop did not cancel ' + JSON.stringify(stopped));
    T.click('[data-cmd="reset"]'); await T.until(() => e.lift.state === 'LOWERED');
    return { refused, overrideKept: after, stopped };
  });
});

/* LED wall routing */
await test('LED wall routing: main / Vienna live / selected camera / off; disabled sources inert; no picture of a picture', async () => {
  const r = await run(async () => {
    const e = T.a.ext, R = T.a.renderer, out = {};
    // watch every render into the feed target: the wall must not show the feed while the feed is being drawn
    let feedRenders = 0, recursive = 0;
    const orig = R.render.bind(R);
    R.render = (scene, cam) => { if (R.getRenderTarget() === e.feedTarget) { feedRenders++; if (e.wallMaterial.emissiveMap === e.feedTarget.texture) recursive++; } return orig(scene, cam); };
    T.a.director.go('studio', { instant: true });
    for (const src of ['vienna', 'selected', 'off', 'main']) {
      document.querySelector(`.vz [data-src="${src}"]`).click(); await T.sleep(1200);
      out[src] = e.wallShows();
      if (src === 'vienna') {
        const px = new Uint16Array(e.feedTarget.width * e.feedTarget.height * 4);
        R.readRenderTargetPixels(e.feedTarget, 0, 0, e.feedTarget.width, e.feedTarget.height, px);
        let lit = 0; for (let i = 0; i < px.length; i += 4) if (px[i] || px[i + 1] || px[i + 2]) lit++;
        out.feedLitPixels = +(lit / (px.length / 4)).toFixed(3);
      }
    }
    document.querySelector('.vz [data-src="melbourne"]').click(); out.afterDisabledClick = e.source;
    R.render = orig;
    return { ...out, feedRenders, recursive };
  });
  expect(r.vienna === 'feed' && r.selected === 'feed' && r.off === 'black' && r.main === 'studio', 'routing ' + JSON.stringify(r));
  expect(r.afterDisabledClick === 'main', 'disabled source changed the wall');
  expect(r.feedRenders > 10 && r.recursive === 0, 'feed renders ' + JSON.stringify(r));
  expect(r.feedLitPixels > 0.2, 'feed picture is empty');
  return r;
});
await run(async () => { document.querySelector('.vz [data-src="vienna"]').click(); T.a.director.go('studio', { instant: true }); await T.sleep(1500); });
await shot('wall-vienna-live');
await run(() => document.querySelector('.vz [data-src="main"]').click());

/* the studio's own features, on the dev page */
await test('studio features unchanged on the dev page: views, on-air simulation, backstage walk, piano panel, keys', async () => {
  return run(async () => {
    const a = T.a, out = {};
    for (const v of ['studio', 'desk', 'andy', 'georgie', 'wall', 'crane', 'floor', 'music', 'piano', 'guest', 'slowmo']) {
      a.director.go(v, { instant: true }); await T.sleep(150);
      // (the wall shot and the robot's shot end away from their listed position on the public page too: orbit limits, robot path)
      if (a.director.current !== v || T.dist(a.camera.position, T.VIEWS[v].pos) > 0.6 && v !== 'slowmo' && v !== 'wall') throw new Error('view ' + v);
    }
    out.views = 'ok';
    dispatchEvent(new KeyboardEvent('keydown', { key: '2' })); await T.sleep(100); out.key2 = a.director.current;
    a.director.go('backstage'); await T.until(() => T.inLounge(a.camera.position) && !a.director.flying, 30000); out.backstage = T.inLounge(a.camera.position);
    a.director.go('studio'); await T.until(() => !a.director.flying && !T.inLounge(a.camera.position), 30000);
    a.panels.open('station', 'piano'); await T.sleep(400); out.pianoPanel = document.body.dataset.piano || (!document.getElementById('panel').hidden ? 'open' : 'closed'); a.panels.close();
    a.air.open(); await T.sleep(5000); out.onAir = { open: a.air.isOpen, status: document.getElementById('status').textContent, cam: document.getElementById('cam').textContent };
    a.air.close(); await T.sleep(800); out.afterAir = document.getElementById('status').textContent;
    if (out.key2 !== 'desk' || !out.backstage || !out.onAir.open || !/Simulat/.test(out.onAir.status)) throw new Error(JSON.stringify(out));
    return out;
  });
});

await test('on air: a Vienna camera shows its own tally label', async () => {
  return run(async () => {
    T.a.setOnAir(true); await T.sleep(3500);
    T.a.ext.pickCamera('P2'); await T.until(() => !T.a.director.flying, 6000);
    const cam = document.getElementById('cam').textContent; T.a.setOnAir(false);
    if (cam !== 'CAM P2') throw new Error(cam);
    return { tally: cam };
  });
});

/* the optional key light */
await test('key light: on with the concert look (the default); in the studio look off, on adds exactly one light, lit only while the stage is in use; off removes it', async () => {
  return run(async () => {
    const count = () => { let n = 0; T.a.scene.traverse(o => { if (o.isLight) n++; }); return n; };
    const find = () => { let k = null; T.a.scene.traverse(o => { if (o.isSpotLight && o.color.getHex() === 0xfff1e2) k = o; }); return k; };
    const concert = T.a.ext.look.on && !!find();
    document.querySelector('.vz [data-look="studio"]').click(); await T.sleep(200);
    const n0 = count(), off = !find() && !T.a.ext.look.on;
    document.querySelector('.vz [data-key="on"]').click(); await T.sleep(200);
    const n1 = count(), pressed = document.querySelector('.vz [data-key="on"]').getAttribute('aria-pressed');
    T.a.ext.pickCamera('P1'); await T.until(() => !T.a.director.flying, 6000); await T.sleep(2500);
    const lit = find().intensity;
    T.a.director.go('studio', { instant: true }); await T.sleep(3000);
    const away = find().intensity;
    document.querySelector('.vz [data-key="off"]').click(); await T.sleep(200);
    const n2 = count();
    document.querySelector('.vz [data-look="concert"]').click(); await T.sleep(200);
    if (!concert || !off || n1 !== n0 + 1 || n2 !== n0 || lit < 50 || away > 5 || pressed !== 'true' || !find()) throw new Error(JSON.stringify({ concert, off, n0, n1, n2, lit, away, pressed }));
    return { concertLookKeyOn: concert, offInStudioLook: off, lightsOff: n0, lightsOn: n1, intensityOnStage: Math.round(lit), intensityAway: Math.round(away) };
  });
});

/* screenshots for review: P1, P4 and P5 with the grand up, key light off and on (panel folded) */
await run(() => document.querySelector('.vz').classList.add('min'));
for (const key of [false, true]) {
  await run(async key => { const e = T.a.ext; e.setKey(key); e.setMode('CINEMATIC'); if (e.lift.state !== 'ELEVATED') { T.click('[data-cmd="reset"]'); await T.until(() => e.lift.state === 'LOWERED', 30000); T.click('[data-cmd="up"]'); await T.until(() => e.lift.state === 'ELEVATED', 30000); } }, key);
  for (const k of ['P1', 'P4', 'P5']) {
    await run(async k => { T.a.ext.pickCamera(k); await T.until(() => !T.a.director.flying, 6000); await T.sleep(2500); }, k);
    await shot(`review-${k}-key-${key ? 'on' : 'off'}`);
  }
}
await run(async () => { document.querySelector('.vz').classList.remove('min'); T.a.ext.setKey(false); T.click('[data-cmd="reset"]'); await T.until(() => T.a.ext.lift.state === 'LOWERED', 30000); });

/* performance (informational: headless Chrome on this Mac) */
async function fps(view) {
  return run(async (view) => {
    T.a.director.setAuto(false);
    if (view.startsWith('vP')) T.a.ext?.pickCamera(view.slice(1)); else T.a.director.go(view, { instant: true });
    await T.sleep(2500);
    let n = 0; const t0 = performance.now(); await new Promise(r => { const f = () => { n++; performance.now() - t0 < 3000 ? requestAnimationFrame(f) : r(); }; requestAnimationFrame(f); });
    return +(n / ((performance.now() - t0) / 1000)).toFixed(1);
  }, view);
}
const perf = { dev: { studio: await fps('studio'), P1: await fps('vP1'), P4: await fps('vP4') } };
// render time per frame, measured synchronously (the scene alone, with its mirror floor): key light and Vienna feed off and on
perf.renderMs = await run(async () => {
  const a = T.a, R = a.renderer, gl = R.getContext(), px = new Uint8Array(4), w = ms => new Promise(r => setTimeout(r, ms));
  const time = async () => { await w(2000); const res = []; for (let k = 0; k < 4; k++) { R.render(a.scene, a.camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); const t0 = performance.now(); for (let i = 0; i < 20; i++) R.render(a.scene, a.camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); res.push((performance.now() - t0) / 20); await w(150); } return +Math.min(...res).toFixed(1); };
  const frame = async () => { await w(2000); let n = 0; const t0 = performance.now(); await new Promise(r => { const f = () => { n++; performance.now() - t0 < 3000 ? requestAnimationFrame(f) : r(); }; requestAnimationFrame(f); }); return +(n / ((performance.now() - t0) / 1000)).toFixed(1); };
  const out = {};
  a.ext.pickCamera('P1'); await T.until(() => !a.director.flying, 6000);
  out.P1_keyOff = await time(); a.ext.setKey(true); out.P1_keyOn = await time(); a.ext.setKey(false);
  a.director.go('studio', { instant: true });
  out.studio_feedOff_fps = await frame(); a.ext.setSource('vienna'); out.studio_feedOn_fps = await frame(); a.ext.setSource('main');
  return out;
});

/* ----- the repertoire: songs from the library on their original recordings; the grand's keys ----- */
await open('vienna-dev.html');
// a watch on the keys: the 88 keys' instance matrices as they are now; `moved()` says whether any has changed since
await run(() => {
  const kb = T.a.studio.piano.userData.keyboard, meshes = [];
  T.a.studio.piano.traverse(o => { if (o.isInstancedMesh) meshes.push(o); });
  const snap = () => meshes.map(m => Float32Array.from(m.instanceMatrix.array));
  const rest = snap();
  T.keys = { kb, rest, moved: () => snap().some((a, i) => a.some((v, j) => v !== rest[i][j])), down: () => kb.notes.filter(n => kb.depth(n) > 0) };
});
await test('repertoire panel: the whole library listed (piano repertoire first), the chosen song\'s details, keys marked still', async () => {
  const r = await run(async () => {
    const { REPERTOIRE } = await import('./virtual-studio/vienna/repertoire.js');
    const sel = document.querySelector('.vz .vz-songs'), groups = [...sel.querySelectorAll('optgroup')].map(g => [g.label, g.children.length]);
    const info = document.querySelector('.vz [data-k="songInfo"]').textContent;
    const other = REPERTOIRE.find(s => !s.piano); sel.value = other.id; sel.dispatchEvent(new Event('change')); await T.sleep(50);
    const picked = T.a.ext.picked.id, info2 = document.querySelector('.vz [data-k="songInfo"]').textContent;
    sel.value = REPERTOIRE.find(s => s.piano).id; sel.dispatchEvent(new Event('change'));
    return { songs: REPERTOIRE.length, piano: REPERTOIRE.filter(s => s.piano).length, options: sel.options.length, first: groups[0], groups: groups.length, picked, other: other.id,
      infoHasKeysStill: /no approved piano part/.test(info), infoHasRecording: /original \(MP3\)/.test(info), info2HasChords: info2.includes(other.chords?.split(/\s*[–—-]\s*/)[0] || '—'), keysMoved: T.keys.moved() };
  });
  expect(r.options === r.songs + r.piano && r.first[0] === 'Piano repertoire' && r.first[1] === r.piano, 'song list ' + JSON.stringify(r));
  expect(r.picked === r.other && r.info2HasChords, 'picking a song');
  expect(r.infoHasKeysStill && r.infoHasRecording && !r.keysMoved, 'song info / keys');
  return r;
});
await test('singer\'s microphone: on the platform, rises with the lift', async () => {
  return run(async () => {
    const mic = T.a.scene.getObjectByName('vienna-mic'), e = T.a.ext;
    if (!mic) throw new Error('no microphone');
    const y = () => { mic.updateWorldMatrix(true, false); return mic.matrixWorld.elements[13]; };
    const onPlatform = (() => { for (let o = mic.parent; o; o = o.parent) if (o === e.stage.platform) return true; return false; })();
    const y0 = y(); T.click('[data-cmd="up"]'); await T.until(() => e.lift.state === 'ELEVATED', 30000);
    const y1 = y(), h = e.lift.height ?? e.lift.h;
    T.click('[data-cmd="reset"]'); await T.until(() => e.lift.state === 'LOWERED', 30000);
    if (!onPlatform || !(y1 - y0 > 3.4)) throw new Error(JSON.stringify({ onPlatform, y0, y1, h }));
    return { onPlatform, rise: +(y1 - y0).toFixed(3) };
  });
});
await test('song: PERFORM plays the original recording on its own clock, cuts round P1 → P3, keys stay still (no approved part)', async () => {
  const r = await run(async () => {
    const sh = T.a.ext.show, a = sh.audio.song, cuts = [];
    T.click('[data-song="perform"]');
    const started = await T.until(() => !a.paused && a.currentTime > 0.5, 30000);
    let moved = false, drift = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < 19000) {
      if (T.keys.moved()) moved = true;
      if (!a.paused) drift = Math.max(drift, Math.abs(sh.time - a.currentTime));
      const v = T.a.director.current; if (cuts.at(-1) !== v) cuts.push(v);
      await T.sleep(100);
    }
    return { started, state: sh.state, segment: sh.segment, label: sh.label, src: a.src, duration: +a.duration.toFixed(2), listed: T.a.ext.picked.seconds, cuts, moved, drift: +drift.toFixed(3),
      panel: document.querySelector('.vz [data-k="showState"]').textContent, seekBar: document.querySelector('.vz [data-k="showBar"]').parentElement.classList.contains('seek'),
      playing: Object.values(sh.audio).filter(x => !x.paused).length };
  });
  expect(r.started && r.state === 'SONG' && r.segment === 'song', 'song did not start ' + JSON.stringify(r));
  expect(r.src === (await run(() => T.a.ext.picked.audio)), 'not the original recording');
  expect(Math.abs(r.duration - r.listed) < 2, `recording ${r.duration} s, library ${r.listed} s`);
  expect(r.cuts.join() === 'vP1,vP3', 'cuts ' + r.cuts);
  expect(!r.moved, 'keys moved without an approved part');
  expect(r.drift < 0.1 && r.playing === 1 && r.seekBar, 'clock / audio / seek bar ' + JSON.stringify(r));
  await shot('song-P3');
  return r;
});
await test('song: PAUSE freezes the recording and the show time; a jump while paused moves both; RESUME plays on from there', async () => {
  const r = await run(async () => {
    const sh = T.a.ext.show, a = sh.audio.song;
    T.click('[data-show="pause"]'); await T.sleep(300);
    const p0 = sh.time, a0 = a.currentTime; await T.sleep(1500);
    const frozen = { paused: sh.paused && a.paused, dt: +(sh.time - p0).toFixed(3), da: +(a.currentTime - a0).toFixed(3), label: document.querySelector('.vz [data-k="showState"]').textContent, button: document.querySelector('.vz [data-show="pause"]').textContent };
    // the jump: a click on the time bar at 50 %
    const bar = document.querySelector('.vz [data-k="showBar"]').parentElement, b = bar.getBoundingClientRect();
    bar.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: b.left + b.width * 0.5, clientY: b.top + b.height / 2 }));
    await T.sleep(300);
    const jumped = { time: +sh.time.toFixed(2), audio: +a.currentTime.toFixed(2), half: +(sh.duration / 2).toFixed(2), stillPaused: a.paused };
    T.click('[data-show="pause"]'); await T.until(() => !a.paused, 5000); await T.sleep(1500);
    return { frozen, jumped, resumed: { playing: !a.paused, time: +sh.time.toFixed(2), audio: +a.currentTime.toFixed(2) }, moved: T.keys.moved() };
  });
  expect(r.frozen.paused && r.frozen.dt === 0 && r.frozen.da === 0 && /PAUSED/.test(r.frozen.label) && r.frozen.button === 'Resume', 'pause ' + JSON.stringify(r.frozen));
  expect(Math.abs(r.jumped.time - r.jumped.half) < 1 && Math.abs(r.jumped.audio - r.jumped.time) < 0.05 && r.jumped.stillPaused, 'jump while paused ' + JSON.stringify(r.jumped));
  expect(r.resumed.playing && r.resumed.time > r.jumped.time + 1 && r.resumed.time < r.jumped.time + 2.5, 'resume ' + JSON.stringify(r.resumed));
  expect(!r.moved, 'keys moved');
  return r;
});
await test('song: jumps forward and back keep the cuts on the song\'s grid (next cut at the next 16 s mark)', async () => {
  const r = await run(async () => {
    const sh = T.a.ext.show, a = sh.audio.song, next = async (at, ms) => { sh.seek(at); const v0 = T.a.director.current; const t0 = performance.now(); await T.until(() => T.a.director.current !== v0, ms); return { at, view: T.a.director.current, when: +sh.time.toFixed(2), after: Math.round(performance.now() - t0) }; };
    const fwd = await next(46, 6000);    // the cue at 48 s: P5
    const back = await next(13, 6000);   // back: the cue at 16 s: P3 (the grid is not lost after a jump back)
    return { fwd, back, moved: T.keys.moved() };
  });
  expect(r.fwd.view === 'vP5' && r.fwd.when >= 48 && r.fwd.when < 49, 'forward ' + JSON.stringify(r.fwd));
  expect(r.back.view === 'vP3' && r.back.when >= 16 && r.back.when < 17, 'back ' + JSON.stringify(r.back));
  expect(!r.moved, 'keys moved');
  return r;
});
await test('keys: a test part (test only, never in the repertoire) follows the recording\'s time through jumps and pause; STOP lifts every key', async () => {
  const r = await run(async () => {
    const e = T.a.ext, sh = e.show, a = sh.audio.song;
    // three notes, two seconds each, well apart: C4 at 100 s, E4 at 104 s, a G2–G3 octave at 108 s
    const errors = e.keyPlayer.load({ song: 'test/only', kind: 'piano-part', source: 'e2e test', approved: { by: 'e2e test', on: '2026-10-20' },
      notes: [{ t: 100, d: 2, m: 60 }, { t: 104, d: 2, m: 64 }, { t: 108, d: 2, m: 43 }, { t: 108, d: 2, m: 55 }] });
    const at = async s => { sh.seek(s); await T.sleep(250); return { at: s, time: +sh.time.toFixed(2), down: T.keys.down() }; };
    const seen = [await at(101), await at(103), await at(105), await at(108.5), await at(101.2)];
    T.click('[data-show="pause"]'); await T.sleep(600); const held = { paused: a.paused, down: T.keys.down() };
    T.click('[data-show="pause"]'); await T.sleep(200);
    await at(105);
    T.click('[data-show="song-stop"]'); await T.sleep(300);
    const after = { state: sh.state, down: T.keys.down(), moved: T.keys.moved(), playing: !a.paused };
    // performing again unloads the test part (no approved part for this song): the keys stay still
    T.click('[data-song="perform"]'); await T.until(() => !a.paused && a.currentTime > 0.3, 20000); sh.seek(101); await T.sleep(500);
    const again = { part: !!e.keyPlayer.part, down: T.keys.down(), moved: T.keys.moved() };
    T.click('[data-show="song-stop"]'); await T.sleep(200);
    return { errors, seen, held, after, again };
  });
  const want = [[60], [], [64], [43, 55], [60]];
  r.seen.forEach((s, i) => expect(s.down.join() === want[i].join(), `at ${s.at} s: down ${s.down}, expected ${want[i]}`));
  expect(!r.errors.length, 'test part refused ' + r.errors);
  expect(r.held.paused && r.held.down.join() === '60', 'pause should hold the key ' + JSON.stringify(r.held));
  expect(r.after.state === 'LIVE' && !r.after.down.length && !r.after.moved && !r.after.playing, 'stop ' + JSON.stringify(r.after));
  expect(!r.again.part && !r.again.down.length && !r.again.moved, 'test part still loaded ' + JSON.stringify(r.again));
  return r;
});
await test('song: plays to its end and returns to LIVE; a recording that cannot be loaded is reported, nothing plays instead', async () => {
  const r = await run(async (base) => {
    const e = T.a.ext, sh = e.show, a = sh.audio.song;
    T.click('[data-song="perform"]'); await T.until(() => !a.paused && a.currentTime > 0.3, 20000);
    sh.seek(sh.duration - 2);
    const ended = await T.until(() => sh.state === 'LIVE', 8000);
    const end = { ended, state: sh.state, playing: !a.paused, view: T.a.director.current, moved: T.keys.moved() };
    sh.playSong({ ...e.picked, id: 'test/missing', title: 'Missing test recording', audio: base + 'test-output/vienna/no-such-recording.mp3' });
    await T.until(() => sh.state === 'LIVE', 8000); await T.sleep(100);
    return { end, missing: { state: sh.state, msg: T.msg(), playing: Object.values(sh.audio).filter(x => !x.paused).length } };
  }, BASE);
  expect(r.end.ended && !r.end.playing && !r.end.moved, 'end ' + JSON.stringify(r.end));
  expect(r.missing.state === 'LIVE' && /could not be loaded/.test(r.missing.msg) && r.missing.playing === 0, 'missing ' + JSON.stringify(r.missing));
  return r;
});
/* screenshots for review: the concert look (the default), the grand up, P1–P5 */
await run(async () => { const e = T.a.ext; document.querySelector('.vz').classList.add('min'); e.setMode('CINEMATIC'); T.click('[data-cmd="up"]'); await T.until(() => e.lift.state === 'ELEVATED', 30000); });
for (const k of ['P1', 'P2', 'P3', 'P4', 'P5']) {
  await run(async k => { T.a.ext.pickCamera(k); await T.until(() => !T.a.director.flying, 6000); await T.sleep(2500); }, k);
  await shot(`concert-${k}`);
}
await run(() => document.querySelector('.vz').classList.remove('min'));

/* ----- D//0 — PIANO SESSIONS: the show on the official audio ----- */
if (process.env.SHOW !== '0') {
await open('vienna-dev.html');
// a recorder in the page: every camera cut, segment change and lift arrival, in show time; and how many of the show's
// audio elements play at once (must never be more than one)
await run(() => {
  const a = T.a, sh = a.ext.show, log = []; let view = null, state = null, lift = null, maxPlaying = 0;
  const tick = () => {
    const playing = Object.values(sh.audio).filter(x => !x.paused).length; maxPlaying = Math.max(maxPlaying, playing);
    if (sh.state !== state) { state = sh.state; log.push({ k: 'state', v: state, t: +sh.time.toFixed(2) }); }
    if (a.director.current !== view) { view = a.director.current; log.push({ k: 'cut', v: view, seg: sh.segment, t: +sh.time.toFixed(2) }); }
    if (a.ext.lift.state !== lift) { lift = a.ext.lift.state; log.push({ k: 'lift', v: lift, seg: sh.segment, t: +sh.time.toFixed(2) }); }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  const ended = {}; for (const [k, el] of Object.entries(sh.audio)) el.addEventListener('ended', () => { ended[k] = (ended[k] || 0) + 1; });
  window.SHOWLOG = { log, ended, get maxPlaying() { return maxPlaying; } };
});
await test('piano show: SHORT OPENING → LONG THEME → LIVE on the official audio, cuts and lift on the measured script', async () => {
  const durations = await run(async () => {
    const sh = T.a.ext.show; await T.until(() => sh.audio.opening.readyState >= 1 && sh.audio.theme.readyState >= 1, 20000);
    document.querySelector('.vz [data-show="start"]').click();
    return { opening: sh.audio.opening.duration, theme: sh.audio.theme.duration, scripts: sh.scripts };
  });
  // screenshots at moments of the opening and the theme (show time)
  const at = async (seg, t, name) => {
    await run(async (seg, t) => { await T.until(() => T.a.ext.show.segment === seg && T.a.ext.show.time >= t, 400000); }, seg, t);
    await shot('show-' + name);
  };
  await at('opening', 2, 'opening-02s-P4');
  await at('opening', 15, 'opening-15s-P5-rising');
  await at('opening', 23, 'opening-23s-P1-arrival');
  await at('opening', 40, 'opening-40s-final-accent');
  await at('theme', 60, 'theme-01m00-loud');
  await at('theme', 120, 'theme-02m00-quiet');
  await at('theme', 285, 'theme-04m45-climax');
  const r = await run(async () => { await T.until(() => T.a.ext.show.state === 'LIVE', 400000); await T.sleep(1500);
    return { log: SHOWLOG.log, maxPlaying: SHOWLOG.maxPlaying, mode: T.a.ext.mode, view: T.a.director.current, label: document.querySelector('.vz [data-k="showLabel"]').textContent,
      paused: Object.values(T.a.ext.show.audio).map(x => x.paused) }; });
  await shot('show-live-piano');
  const states = r.log.filter(e => e.k === 'state').map(e => e.v).join(' → ');
  expect(states.endsWith('OPENING → THEME → LIVE'), 'segments ' + states);
  expect(Math.abs(durations.opening - 44.4) < 0.01 && Math.abs(durations.theme - 328.92) < 0.01, 'durations ' + JSON.stringify(durations));
  expect(r.maxPlaying === 1 && r.paused.every(Boolean), 'audio overlap or still playing: ' + r.maxPlaying);
  const up = r.log.find(e => e.k === 'lift' && e.v === 'ELEVATED' && e.seg === 'opening');
  const arrival = durations.scripts.opening.arrival;
  expect(up && Math.abs(up.t - arrival) < 0.35, `platform up at ${up?.t}, the script says ${arrival}`);
  // every scripted cut happened within a frame or two of its cue
  const late = [];
  for (const seg of ['opening', 'theme']) for (const c of durations.scripts[seg].cues.filter(c => c.cut)) {
    const hit = r.log.find(e => e.k === 'cut' && e.seg === seg && e.v === 'v' + c.cut && Math.abs(e.t - c.t) < 0.25);
    const dup = r.log.find(e => e.k === 'cut' && e.seg === seg && Math.abs(e.t - c.t) < 0.25);   // a cue to the camera already on air is not a new cut
    if (!hit && !(dup && dup.v === 'v' + c.cut)) { const prev = [...durations.scripts[seg].cues].filter(x => x.cut && x.t < c.t).at(-1); if (!prev || prev.cut !== c.cut) late.push(`${seg} ${c.t} ${c.cut}`); }
  }
  expect(!late.length, 'cuts missed: ' + late.join(', '));
  expect(r.mode === 'WARM PIANO' && r.view === 'vP1' && r.label === 'Live piano performance', 'live state ' + JSON.stringify(r));
  return { durations: { opening: durations.opening, theme: durations.theme }, segments: states, platformUpAt: up.t, scriptedArrival: arrival,
    cuts: r.log.filter(e => e.k === 'cut').length, maxAudioPlaying: r.maxPlaying };
});

await test('between songs: by hand, warm light and keyboard shots on the measured accents, no lift move, back to LIVE when it ends', async () => {
  const r = await run(async () => {
    const sh = T.a.ext.show, L = T.a.ext.lift, e = T.a.ext, h0 = L.height, from = SHOWLOG.log.length;
    document.querySelector('.vz [data-show="between"]').click(); await T.sleep(1500);
    const during = { state: sh.state, mode: e.mode, view: T.a.director.current, playing: Object.values(sh.audio).filter(x => !x.paused).map(x => x.src.split('/').pop()) };
    let minH = L.height, maxH = L.height;
    await T.until(() => { minH = Math.min(minH, L.height); maxH = Math.max(maxH, L.height); return sh.state === 'LIVE'; }, 40000);
    return { during, liftMoved: +(maxH - minH).toFixed(4), h0, log: SHOWLOG.log.slice(from), after: sh.state, script: sh.scripts.between.cues, duration: sh.audio.between.duration, ended: sh.audio.between.ended };
  });
  await shot('show-between-songs-done');
  expect(r.during.state === 'BETWEEN' && r.during.mode === 'WARM PIANO' && r.during.view === 'vP2', 'between ' + JSON.stringify(r.during));
  expect(r.during.playing.length === 1 && r.during.playing[0] === 'dz-piano-between-songs.wav', 'audio ' + r.during.playing);
  expect(r.liftMoved === 0, 'the lift moved during between songs');
  const cuts = r.log.filter(x => x.k === 'cut' && x.seg === 'between');
  for (const c of r.script.filter(c => c.cut)) expect(cuts.some(x => x.v === 'v' + c.cut && Math.abs(x.t - c.t) < 0.25), `between cut ${c.cut} at ${c.t} missing: ${JSON.stringify(cuts)}`);
  expect(r.after === 'LIVE' && r.ended && Math.abs(r.duration - 29.56) < 0.01, 'end ' + JSON.stringify({ after: r.after, ended: r.ended, d: r.duration }));
  return { cuts: cuts.map(x => `${x.t}s ${x.v}`), liftMoved: r.liftMoved, duration: r.duration, backTo: r.after };
});

await test('between songs: repeatable; STOP BETWEEN SONGS and RETURN TO LIVE PIANO end it at once', async () => {
  return run(async () => {
    const sh = T.a.ext.show, playing = () => Object.values(sh.audio).filter(x => !x.paused).length;
    document.querySelector('.vz [data-show="between"]').click(); await T.sleep(3000);
    const again = { state: sh.state, t: +sh.time.toFixed(1) };
    document.querySelector('.vz [data-show="between-stop"]').click(); await T.sleep(300);
    const stopped = { state: sh.state, playing: playing() };
    document.querySelector('.vz [data-show="between"]').click(); await T.sleep(2000);
    document.querySelector('.vz [data-show="return-live"]').click(); await T.sleep(300);
    const returned = { state: sh.state, playing: playing(), view: T.a.director.current, mode: T.a.ext.mode };
    if (again.state !== 'BETWEEN' || again.t < 2 || stopped.state !== 'LIVE' || stopped.playing || returned.state !== 'LIVE' || returned.playing || returned.view !== 'vP1') throw new Error(JSON.stringify({ again, stopped, returned }));
    return { playedAgain: again, afterStop: stopped, afterReturn: returned };
  });
});

await test('closing: slow cuts on the measured accents, the light coming down step by step, last shot on the grand, SHOW ENDED after it dies away', async () => {
  const shots = [];
  await run(() => { window.MASTER = []; const sh = T.a.ext.show; const f = () => { if (sh.state === 'CLOSING') MASTER.push([+sh.time.toFixed(2), +T.a.ext.lights.master.toFixed(3)]); if (sh.state !== 'ENDED') requestAnimationFrame(f); }; requestAnimationFrame(f);
    window.FROM = SHOWLOG.log.length; document.querySelector('.vz [data-show="closing"]').click(); });
  for (const [t, name] of [[3, 'closing-03s'], [20, 'closing-20s'], [33, 'closing-33s-last-shot']]) {
    await run(async t => { await T.until(() => T.a.ext.show.segment === 'closing' && T.a.ext.show.time >= t, 60000); }, t);
    await shot('show-' + name); shots.push(name);
  }
  const r = await run(async () => {
    const sh = T.a.ext.show; await T.until(() => sh.state === 'ENDED', 30000); await T.sleep(1500);
    return { state: sh.state, label: document.querySelector('.vz [data-k="showState"]').textContent, ended: sh.audio.closing.ended, endedAt: sh.audio.closing.currentTime, duration: sh.audio.closing.duration,
      view: T.a.director.current, mode: T.a.ext.mode, master: +T.a.ext.lights.master.toFixed(3), log: SHOWLOG.log.slice(FROM), script: sh.scripts.closing.cues,
      masterTrack: MASTER.filter((_, i) => i % 30 === 0), playing: Object.values(sh.audio).filter(x => !x.paused).length };
  });
  await shot('show-ended');
  const cuts = r.log.filter(x => x.k === 'cut' && x.seg === 'closing');
  for (const c of r.script.filter(c => c.cut)) expect(cuts.some(x => x.v === 'v' + c.cut && Math.abs(x.t - c.t) < 0.25), `closing cut ${c.cut} at ${c.t} missing`);
  const m = r.masterTrack.map(x => x[1]);
  expect(m.every((v, i) => i === 0 || v <= m[i - 1] + 0.002) && m.at(-1) < 0.5, 'light did not come down step by step: ' + m.join(','));
  expect(r.state === 'ENDED' && r.label === 'SHOW ENDED' && r.ended && Math.abs(r.duration - 38.4) < 0.01 && r.playing === 0, 'end ' + JSON.stringify({ state: r.state, label: r.label, ended: r.ended, d: r.duration }));
  expect(r.view === 'vP1' && r.mode === 'WARM PIANO' && Math.abs(r.master - 0.35) < 0.03, 'last shot ' + JSON.stringify({ view: r.view, mode: r.mode, master: r.master }));
  return { cuts: cuts.map(x => `${x.t}s ${x.v}`), lightLevelOverTime: r.masterTrack, endedAt: r.endedAt, duration: r.duration, final: { view: r.view, mode: r.mode, master: r.master }, screenshots: shots };
});

await test('closing: RESTART CLOSING plays it from the top; STOP CLOSING returns to LIVE; never two recordings at once', async () => {
  return run(async () => {
    const sh = T.a.ext.show, playing = () => Object.values(sh.audio).filter(x => !x.paused).length;
    document.querySelector('.vz [data-show="closing-restart"]').click(); await T.sleep(1200);
    const restarted = { state: sh.state, t: +sh.time.toFixed(1), playing: playing() };
    document.querySelector('.vz [data-show="closing-stop"]').click(); await T.sleep(300);
    const stopped = { state: sh.state, playing: playing(), master: +T.a.ext.lights.master.toFixed(2) };
    await T.sleep(4000); const masterBack = +T.a.ext.lights.master.toFixed(2);
    if (restarted.state !== 'CLOSING' || restarted.t > 2 || restarted.playing !== 1 || stopped.state !== 'LIVE' || stopped.playing || SHOWLOG.maxPlaying !== 1 || masterBack < 0.9)
      throw new Error(JSON.stringify({ restarted, stopped, masterBack, max: SHOWLOG.maxPlaying }));
    return { restarted, stopped, lightBackAfterStop: masterBack, maxRecordingsAtOnce: SHOWLOG.maxPlaying };
  });
});

await test('all four original recordings load and play to their end in the show', async () => {
  return run(() => {
    const sh = T.a.ext.show, r = {};
    // (the song slot is tested with the repertoire)
    for (const [k, a] of Object.entries(sh.audio)) if (k !== 'song') r[k] = { file: decodeURIComponent(a.src.split('/').pop()), duration: +a.duration.toFixed(3), playedToEnd: SHOWLOG.ended[k] || 0 };
    if (Object.values(r).some(x => !x.playedToEnd || !(x.duration > 0))) throw new Error(JSON.stringify(r));
    return r;
  });
});

await test('piano show: PAUSE freezes audio and lift together; RESUME keeps them in step (platform still arrives on the accent)', async () => {
  return run(async () => {
    const sh = T.a.ext.show, L = T.a.ext.lift, arrival = sh.scripts.opening.arrival;
    document.querySelector('.vz [data-show="restart"]').click();                       // the platform is up: it is lowered first
    const prep = sh.state;
    await T.until(() => sh.state === 'OPENING', 30000);
    await T.until(() => sh.time >= 12, 20000);
    document.querySelector('.vz [data-show="pause"]').click();
    const a0 = sh.audio.opening.currentTime, h0 = L.height; await T.sleep(3000);
    const drift = { audio: +(sh.audio.opening.currentTime - a0).toFixed(3), lift: +(L.height - h0).toFixed(4), showVsAudio: +(sh.time - sh.audio.opening.currentTime).toFixed(3) };
    document.querySelector('.vz [data-show="pause"]').click();
    let upAt = null; await T.until(() => { if (L.state === 'ELEVATED') { upAt = sh.time; return true; } return false; }, 20000);
    const sync = +Math.abs(sh.time - sh.audio.opening.currentTime).toFixed(3);
    if (prep !== 'PREPARING' || drift.audio !== 0 || drift.lift !== 0 || Math.abs(upAt - arrival) > 0.35 || sync > 0.05) throw new Error(JSON.stringify({ prep, drift, upAt, arrival, sync }));
    return { restartFromUp: prep, whilePaused: drift, platformUpAt: +upAt.toFixed(2), arrival, showMinusAudioAfterResume: sync };
  });
});

await test('piano show: START twice plays one audio; SKIP stops the opening; manual camera, lift STOP and STOP SHOW stay with the operator', async () => {
  return run(async () => {
    const sh = T.a.ext.show, L = T.a.ext.lift, playing = () => Object.values(sh.audio).filter(x => !x.paused).length;
    document.querySelector('.vz [data-show="start"]').click(); const again = T.msg();
    const one = playing();
    document.querySelector('.vz [data-show="skip"]').click(); await T.sleep(1500);
    const skip = { state: sh.state, openingPaused: sh.audio.opening.paused, themePlaying: !sh.audio.theme.paused, playing: playing() };
    await T.until(() => !T.a.director.flying, 3000);
    T.a.ext.pickCamera('P3'); await T.until(() => !T.a.director.flying, 6000);
    const t0 = sh.time; await T.until(() => sh.scripts.theme.cues.some(c => c.cut && c.t > t0 && c.t < sh.time), 20000); await T.sleep(300);
    const keptCam = T.a.director.current;
    T.click('[data-cmd="down"]'); await T.sleep(1500); T.click('[data-cmd="stop"]'); await T.until(() => !L.moving, 5000);
    const liftAfterStop = L.state;
    document.querySelector('.vz [data-show="stop"]').click(); await T.sleep(300);
    const stopped = { state: sh.state, playing: playing() };
    T.click('[data-cmd="reset"]'); await T.until(() => L.state === 'LOWERED', 30000);
    if (!/already running/.test(again) || one !== 1 || skip.state !== 'THEME' || !skip.openingPaused || !skip.themePlaying || skip.playing !== 1 || keptCam !== 'vP3' || liftAfterStop !== 'STOPPED' || stopped.state !== 'IDLE' || stopped.playing !== 0)
      throw new Error(JSON.stringify({ again, one, skip, keptCam, liftAfterStop, stopped }));
    return { secondStart: again, skip, manualCameraKept: keptCam, liftAfterStop, stopped, liftResetAfterwards: L.state };
  });
});

await test('piano show: no opening video configured yet — no video element, no Video/3D button', async () => {
  return run(() => {
    const r = { video: !!document.querySelector('video.vz-video'), button: !!document.querySelector('.vz [data-show="video"]'), slot: T.a.ext.show.video };
    if (r.video || r.button || r.slot) throw new Error(JSON.stringify(r));
    return r;
  });
});
}

/* the opening on a real audio file: an 18.5 s silent WAV stands in for the jingle (?jingle=) */
{
  const sr = 8000, n = Math.round(sr * 18.5), b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  fs.writeFileSync(path.join(OUT, 'jingle-test.wav'), b);
}
await open('vienna-dev.html?jingle=test-output/vienna/jingle-test.wav');
await test('opening follows the jingle file\'s own clock when it plays', async () => {
  return run(async () => {
    const e = T.a.ext; T.click('[data-cmd="cinematic"]');
    await T.until(() => e.opening.clock === 'jingle', 5000);
    const clock = e.opening.clock;
    await T.until(() => !e.running, 30000);
    const h = e.history.map(x => `${x.t}s ${x.text}`);
    if (clock !== 'jingle' || !h.some(x => x.includes('done'))) throw new Error(JSON.stringify({ clock, h }));
    return { clock, history: h };
  });
});

/* the public page (studio.html) on this branch */
await open('studio.html');
await test('public studio page unchanged: no stage, no panel, no Vienna views, wall intact', async () => {
  const r = await run(() => {
    let shell = 0; T.a.scene.traverse(o => { if (o.isMesh && o.geometry?.type === 'CylinderGeometry' && o.geometry.parameters.radiusTop === 13.2 && o.visible) shell++; });
    return { ext: !!T.a.ext, stage: !!T.a.scene.getObjectByName('vienna-stage'), panel: !!document.querySelector('.vz'), views: Object.keys(T.VIEWS).filter(k => /^vP/.test(k)).length, wallParts: shell, lights: (() => { let n = 0; T.a.scene.traverse(o => { if (o.isLight) n++; }); return n; })(), piano: T.a.studio.piano.position.toArray() };
  });
  await shot('public-studio');
  expect(!r.ext && !r.stage && !r.panel && r.views === 0, 'Vienna parts on the public page ' + JSON.stringify(r));
  const devLights = results.find(x => x.name.startsWith('stage adds no lights'))?.detail?.sceneLights;
  expect(r.lights === devLights, `light count differs: public ${r.lights}, dev ${devLights}`);
  expect(r.wallParts === 1, 'studio wall changed');
  expect(r.piano.join() === '-5.3,0,0.3', 'studio grand moved');
  return r;
});
perf.public = { studio: await fps('studio') };
await test('public studio page: views and on-air simulation still run', async () => {
  return run(async () => {
    const a = T.a;
    for (const v of ['studio', 'desk', 'piano', 'music', 'security']) { a.director.go(v, { instant: true }); await T.sleep(150); if (a.director.current !== v && !(v === 'security')) throw new Error(v); }
    a.air.open(); await T.sleep(4000); const open = a.air.isOpen; a.air.close();
    if (!open) throw new Error('on-air did not open');
    return { views: 'ok', onAir: open };
  });
});

/* report */
const passed = results.filter(r => r.ok).length;
const report = { date: new Date().toISOString(), chrome: (await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json()).Browser, passed, failed: results.length - passed, perf, results };
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(`\n${passed}/${results.length} passed · fps (headless, informational): ${JSON.stringify(perf)}\nreport and screenshots: ${path.relative(ROOT, OUT)}/`);
ws.close(); server.close();
await new Promise(r => { chrome.once('exit', r); chrome.kill(); });
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}   // Chrome may still be flushing its profile
process.exit(results.length === passed ? 0 : 1);
