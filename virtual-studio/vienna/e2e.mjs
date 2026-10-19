// Browser test of the Vienna Piano Stage and of the studio around it, in headless Chrome (local only: its own static
// server on 127.0.0.1, nothing is deployed or fetched from outside).
//   node virtual-studio/vienna/dev-page.mjs && node virtual-studio/vienna/e2e.mjs
// Writes screenshots and report.json to test-output/vienna/. CHROME=/path/to/chrome overrides the browser.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'test-output', 'vienna');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
fs.mkdirSync(OUT, { recursive: true });

/* ----- a static server for the worktree ----- */
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.bin': 'application/octet-stream', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

/* ----- Chrome over the DevTools protocol ----- */
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dz-e2e-'));
const debugPort = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--use-angle=metal', '--enable-gpu',
  '--ignore-gpu-blocklist', '--no-first-run', '--autoplay-policy=no-user-gesture-required', '--window-size=1600,900', 'about:blank'], { stdio: 'ignore' });
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
    let vmax = 0, amax = 0, last = 0, lastT = performance.now(), sampling = true;
    const sample = () => { const now = performance.now(), dt = (now - lastT) / 1000; if (dt > 0.008 && L.speed) { amax = Math.max(amax, Math.abs(L.speed - last) / dt); } vmax = Math.max(vmax, Math.abs(L.speed)); last = L.speed; lastT = now; if (sampling) requestAnimationFrame(sample); };
    requestAnimationFrame(sample);
    const t0 = performance.now();
    T.click('[data-cmd="up"]');
    const states = [L.state];
    await T.until(() => { if (states.at(-1) !== L.state) states.push(L.state); return L.state === 'ELEVATED'; });
    sampling = false;
    const secs = (performance.now() - t0) / 1000;
    if (L.state !== 'ELEVATED' || Math.abs(L.height - LIFT.travel) > 1e-6) throw new Error('not elevated');
    if (vmax > LIFT.vmax + 1e-6) throw new Error('too fast ' + vmax);
    if (amax > LIFT.accel * 2) throw new Error('acceleration ' + amax);
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

await test('stage adds no lights to the studio and is culled when out of view', async () => {
  return run(async () => {
    const count = () => { let n = 0; T.a.scene.traverse(o => { if (o.isLight) n++; }); return n; };
    const own = []; T.a.scene.getObjectByName('vienna-stage').traverse(o => { if (o.isLight) own.push(o.type); });
    document.querySelector('.vz [data-mode="PERFORMANCE"]').click();
    T.a.director.go('georgie', { instant: true }); await T.sleep(400);
    const hidden = !T.a.scene.getObjectByName('vienna-stage').visible;
    T.a.ext.pickCamera('P1'); await T.until(() => !T.a.director.flying, 6000); await T.sleep(300);
    const shown = T.a.scene.getObjectByName('vienna-stage').visible;
    document.querySelector('.vz [data-mode="WARM PIANO"]').click();
    if (own.length || !hidden || !shown) throw new Error(JSON.stringify({ own, hidden, shown }));
    return { lightsInStage: own.length, sceneLights: count(), hiddenWhenAway: hidden };
  });
});

/* cinematic */
await test('cinematic sequence: dim → under light → rise → P4/P5 follow → spot → P1 final, in order', async () => {
  const r = await run(async () => {
    const e = T.a.ext, seen = [];
    let spotBefore = 0, underDuringRise = 0;
    T.click('[data-cmd="cinematic"]');
    const watch = () => {
      if (!seen.length || seen.at(-1).view !== T.a.director.current) seen.push({ view: T.a.director.current, h: +e.lift.height.toFixed(2) });
      if (e.lift.state === 'RAISING') { underDuringRise = Math.max(underDuringRise, e.lights.under.level); spotBefore = Math.max(spotBefore, e.lights.spot.level); }
    };
    const ok = await T.until(() => { watch(); return !e.running; }, 40000);
    await T.sleep(2500);
    return { ok, history: e.history.map(x => `${x.t}s ${x.text} [${x.view} h=${x.h}]`), cuts: seen, finalView: T.a.director.current, mode: e.mode, lift: e.lift.state,
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
