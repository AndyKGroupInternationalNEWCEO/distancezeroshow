// Vienna Piano Stage, wired into the studio page: the stage (stage.js), the lift controller (lift.js), cameras P1–P5
// as studio viewpoints, the lighting modes, the cinematic lift sequence, the main LED wall's display source, and the
// stage's control panel. Passed to start() as `extend` (see main.js); the public studio page does not load it.
import * as THREE from 'three';
import { VIEWS, annexes } from '../views.js';
import { AMBER, ICE } from '../screens.js';
import { createLift } from './lift.js';
import { buildStage } from './stage.js';
import { ANNEX, LIFT, CAMS, platformTop } from './layout.js';

const WARM = '#ffd9b0', WHITE = '#fff4e8', TUNGSTEN = '#ffb46b';
// lighting modes: each group's [level, colour, (moving heads) pattern | (under) pulse], the haze in the beams, and the
// stage's architectural LEDs (`frame`)
export const MODES = {
  'WARM PIANO': { perimeter: [0.8, WARM], moving: [0.25, WARM, 'center'], accent: [0.45, AMBER], spot: [0.55, TUNGSTEN], under: [0.2, AMBER, 0], haze: 0.35, frame: 0.8 },
  CINEMATIC: { perimeter: [0.3, WARM], moving: [0.55, ICE, 'sweep'], accent: [0.9, ICE], spot: [0.85, TUNGSTEN], under: [0.35, ICE, 0], haze: 1, frame: 0.5 },
  PERFORMANCE: { perimeter: [1, WHITE], moving: [1, AMBER, 'fast'], accent: [1, AMBER], spot: [1, TUNGSTEN], under: [0.8, AMBER, 1], haze: 0.8, frame: 1.2 },
  BLACKOUT: { perimeter: [0, WARM], moving: [0, WARM, 'center'], accent: [0, AMBER], spot: [0, TUNGSTEN], under: [0, AMBER, 0], haze: 0, frame: 0.06 },
  'LIFT REVEAL': { perimeter: [0.12, WARM], moving: [0.7, ICE, 'track'], accent: [0.3, AMBER], spot: [0, TUNGSTEN], under: [1, AMBER, 1], haze: 1, frame: 0.4 },
};
const GROUPS = ['perimeter', 'moving', 'accent', 'spot', 'under'];
// what the studio's LED wall can show. The Melbourne stage and the media player are later phases
export const SOURCES = [
  ['main', 'Main studio'], ['vienna', 'Vienna piano live'], ['melbourne', 'Melbourne DJ live', 'Phase 2'],
  ['selected', 'Selected camera'], ['media', 'Media / graphics', 'Phase 3'], ['off', 'Off'],
];

export function vienna({ renderer, scene, camera, controls, director, studio, quality, reducedMotion }) {
  const stage = buildStage({ studio, scene, quality });
  const lift = createLift(LIFT);

  /* ----- light state: eased towards the mode (plus any per-group override from the sequence) ----- */
  let mode = 'WARM PIANO', override = {};
  const L = { haze: 0, frame: 0 };
  for (const g of GROUPS) L[g] = { level: 0, color: new THREE.Color(), pattern: 'center', pulse: 0 };
  const goalColor = new THREE.Color();
  function easeLights(dt) {
    const m = MODES[mode], k = 1 - Math.exp(-dt * 2.2);
    for (const g of GROUPS) {
      const [level, color, extra] = m[g], s = L[g];
      s.level += ((override[g] ?? level) - s.level) * k;
      s.color.lerp(goalColor.set(color), k);
      if (g === 'moving') s.pattern = extra;
      if (g === 'under') s.pulse += (extra - s.pulse) * k;
    }
    L.haze += (m.haze - L.haze) * k;
    L.frame += (m.frame - L.frame) * k;
  }

  /* ----- cameras P1–P5: studio viewpoints whose position rides with the lift ----- */
  const keys = Object.keys(CAMS);
  const id = k => 'v' + k;
  const eased = Object.fromEntries(keys.map(k => [k, 0]));   // each camera's own view of the lift height (P5 lags)
  const shot = (k, h, pos = new THREE.Vector3(), target = new THREE.Vector3()) => {
    const c = CAMS[k], top = platformTop(h);
    pos.set(c.pos[0], c.pos[1] + c.rise * h, c.pos[2]);
    target.set(c.target[0], c.fixedTarget ? c.target[1] : top + c.target[1], c.target[2]);
    return { pos, target };
  };
  for (const k of keys) {
    const c = CAMS[k], s = shot(k, 0);
    VIEWS[id(k)] = { label: c.label, long: c.long, pos: s.pos.toArray(), target: s.target.toArray(), fov: c.fov, drift: 0, tally: 0, cam: c.name, free: true, vienna: k };
  }
  // the annex: a camera inside it stays within its walls; a target inside it is not pulled back onto the studio set
  annexes.push({
    has: p => p.x <= -11 && p.x >= ANNEX.x0 - 0.5 && p.z >= ANNEX.z0 && p.z <= ANNEX.z1,
    clamp(p, t) {
      p.x = THREE.MathUtils.clamp(p.x, ANNEX.x0 + 0.4, -9); p.y = THREE.MathUtils.clamp(p.y, 0.35, ANNEX.h - 0.4); p.z = THREE.MathUtils.clamp(p.z, ANNEX.z0 + 0.3, ANNEX.z1 - 0.3);
      t.x = THREE.MathUtils.clamp(t.x, ANNEX.x0 + 0.2, 8); t.y = THREE.MathUtils.clamp(t.y, 0, ANNEX.h - 0.2); t.z = THREE.MathUtils.clamp(t.z, ANNEX.z0 + 0.2, 8);
    },
  });

  /* ----- the stage's programme camera (what "Vienna piano live" shows), and cuts ----- */
  let program = 'P1';
  const cut = (k, { instant = false } = {}) => {
    program = k;
    director.setAuto(false);
    director.go(id(k), { instant });
  };

  /* ----- the cinematic sequence: lights dim, under-platform light, lift rises, cameras follow, spot, final frame ----- */
  let seq = null;
  const say = text => { ui.msg.textContent = text; };
  function cinematic() {
    if (seq) return say('Cinematic sequence already running');
    if (lift.state !== 'LOWERED') return say('Lower the platform first (DOWN or RESET)');
    seq = { t: 0, done: new Set(), cams: true, lights: true, elevatedAt: null };
    mode = 'LIFT REVEAL'; override = { under: 0, spot: 0 };       // 1. the stage lights dim
    cut('P4', { instant: true });
    say('Cinematic: lights down');
  }
  const once = (name, when, fn) => { if (when && !seq.done.has(name)) { seq.done.add(name); fn(); } };
  function runSequence(dt) {
    if (!seq) return;
    seq.t += dt;
    once('under', seq.t >= 2, () => { delete override.under; say('Cinematic: under-platform light'); });           // 2.
    once('rise', seq.t >= 3.5, () => { lift.command('up'); say('Cinematic: lift rising'); });                      // 3.
    once('track', seq.t >= 8, () => { if (seq.cams) cut('P5', { instant: true }); });                              // 4. follow it up
    if (seq.elevatedAt === null && lift.state === 'ELEVATED') {
      seq.elevatedAt = seq.t; override.spot = 1; say('Cinematic: performance spot');                               // 5.
    }
    once('final', seq.elevatedAt !== null && seq.t >= seq.elevatedAt + 2.5, () => {                                 // 6.
      if (seq.cams) cut('P1', { instant: true });
      if (seq.lights) { mode = 'CINEMATIC'; delete override.spot; }
      say('Cinematic: done'); seq = null;
    });
  }
  function abortSequence(why) { if (!seq) return; seq = null; override = {}; say(why); }

  /* ----- commands (the panel's buttons) ----- */
  function command(name) {
    if (name === 'cinematic') return cinematic();
    if (name === 'stop' || name === 'reset') abortSequence(name === 'stop' ? 'Stopped: sequence cancelled' : 'Reset: sequence cancelled');
    const r = lift.command(name);
    if (!r.ok) say(r.reason);
    else if (name === 'reset') { mode = 'WARM PIANO'; override = {}; say('Reset: platform returning to the deck'); }
    else if (name !== 'stop') say('');
  }
  function setMode(name) {
    mode = name; override = seq ? {} : override;
    if (seq) seq.lights = false;   // the operator has the lights now; the lift carries on
  }
  function pickCamera(k) {
    if (seq) seq.cams = false;     // the operator has the cameras now
    program = k;
    director.setAuto(false);
    director.go(id(k));
  }

  /* ----- the main LED wall's source: the studio's own programme, a live picture rendered from a camera, or black ----- */
  let source = 'main';
  const wallMat = (() => { let m = null; studio.root.traverse(o => { if (o.isMesh && o.material?.emissiveMap === studio.wall.texture) m = o.material; }); return m; })();
  const WALL_ASPECT = 2048 / 860;
  const feed = {
    rt: new THREE.WebGLRenderTarget(quality.broadcast ? 1536 : 1024, quality.broadcast ? 645 : 430, { type: THREE.HalfFloatType }),
    cam: new THREE.PerspectiveCamera(40, WALL_ASPECT, 0.05, 80),
    at: 0,
    black: new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1),
  };
  feed.black.needsUpdate = true;
  feed.rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
  // the wall's own texture is drawn mirrored (it is seen from inside the curve): the feed the same way
  feed.rt.texture.wrapS = THREE.RepeatWrapping; feed.rt.texture.repeat.x = -1;
  feed.black.wrapS = THREE.RepeatWrapping;
  let reflectors = null;
  const feedShot = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  function renderFeed(t) {
    if (!wallMat) return;
    if (source === 'main') { wallMat.emissiveMap = studio.wall.texture; return; }
    if (source === 'off') { wallMat.emissiveMap = feed.black; return; }
    if (t - feed.at < 1 / 20) return;                     // 20 pictures a second is plenty for a wall seen across the room
    feed.at = t;
    if (source === 'vienna') {
      shot(program, eased[program], feedShot.pos, feedShot.target);
      feed.cam.position.copy(feedShot.pos); feed.cam.lookAt(feedShot.target);
      // the shot is framed for 16:9: the wall is wider, so keep the height and show more at the sides
      feed.cam.fov = CAMS[program].fov;
    } else {                                              // 'selected': the operator's own camera
      feed.cam.position.copy(camera.position); feed.cam.quaternion.copy(camera.quaternion); feed.cam.fov = camera.fov;
    }
    feed.cam.updateProjectionMatrix();
    // no picture of a picture: while the feed renders, the wall shows its own programme (never the feed itself), the
    // mirror floor is left out and the shadow maps are not redrawn
    reflectors ??= (() => { const r = []; scene.traverse(o => { if (o.isReflector) r.push(o); }); return r; })();
    const shown = reflectors.map(o => o.visible), auto = renderer.shadowMap.autoUpdate, before = renderer.getRenderTarget();
    reflectors.forEach(o => { o.visible = false; }); renderer.shadowMap.autoUpdate = false;
    wallMat.emissiveMap = studio.wall.texture;
    renderer.setRenderTarget(feed.rt); renderer.render(scene, feed.cam);
    renderer.setRenderTarget(before);
    reflectors.forEach((o, i) => { o.visible = shown[i]; }); renderer.shadowMap.autoUpdate = auto;
    wallMat.emissiveMap = feed.rt.texture;
  }
  function setSource(name) { source = name; feed.at = -1; if (wallMat && name === 'main') wallMat.emissiveMap = studio.wall.texture; }

  /* ----- only draw the stage while it can be seen ----- */
  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4();
  const visible = () => {
    if (annexes[annexes.length - 1].has(camera.position)) return true;
    if (source === 'vienna') return true;
    camera.updateMatrixWorld();
    pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    return frustum.setFromProjectionMatrix(pv).intersectsBox(stage.bounds);
  };

  /* ----- the panel ----- */
  const ui = panel({ command, setMode, pickCamera, setSource });

  /* ----- per frame ----- */
  let t = 0, settle = null, wasFlying = false;
  const want = { pos: new THREE.Vector3(), target: new THREE.Vector3() }, offset = new THREE.Vector3();
  function update(dt) {
    t += dt;
    runSequence(dt);
    const h = lift.step(dt);
    for (const k of keys) {
      const lag = CAMS[k].lag;
      eased[k] = lag && !reducedMotion ? eased[k] + (h - eased[k]) * (1 - Math.exp(-dt / lag * 2)) : h;
      const s = shot(k, eased[k], want.pos, want.target), v = VIEWS[id(k)];
      s.pos.toArray(v.pos); s.target.toArray(v.target);
    }
    easeLights(dt);

    // the shot follows the lift; arriving from a flight it settles onto the moving shot instead of jumping
    const k = VIEWS[director.current]?.vienna;
    if (k && director.flying) wasFlying = true;
    else if (k) {
      shot(k, eased[k], want.pos, want.target);
      if (wasFlying || !settle) { offset.copy(camera.position).sub(want.pos); settle = k; wasFlying = false; }
      offset.multiplyScalar(Math.exp(-dt * 3));
      camera.position.copy(want.pos).add(offset);
      controls.target.copy(want.target);
    } else { settle = null; wasFlying = false; }

    const seen = visible();
    stage.root.visible = seen;
    if (seen) stage.update(t, dt, h, L); else stage.rig.dark();
    renderFeed(t);
    ui.show({ state: lift.state, h, mode, view: VIEWS[director.current]?.vienna || null, program, source, seq: !!seq });
  }

  return { update, stage, lift, command, setMode, pickCamera, setSource, get mode() { return mode; }, get source() { return source; } };
}

/* ---------- the stage's control panel (built here, so the studio page only has to load this module) ---------- */
function panel({ command, setMode, pickCamera, setSource }) {
  const css = `
  .vz{position:fixed;left:var(--gut,16px);top:calc(env(safe-area-inset-top,0px) + 74px);z-index:6;width:min(300px,calc(100vw - 32px));
    max-height:calc(100vh - 200px);overflow:auto;border:1px solid var(--line);background:var(--glass);backdrop-filter:blur(14px) saturate(120%);
    -webkit-backdrop-filter:blur(14px);border-radius:14px;padding:12px 14px 14px;font-size:.78rem;color:var(--chrome)}
  .vz h2{font-stretch:125%;font-weight:600;font-size:.72rem;letter-spacing:.2em;text-transform:uppercase;color:var(--amber);display:flex;align-items:center;gap:8px;margin:0}
  .vz h2 button{margin-left:auto;background:none;border:0;color:var(--dim);cursor:pointer;font-size:.9rem;padding:2px 6px}
  .vz.min .body{display:none}
  .vz h3{font-stretch:112%;font-weight:500;font-size:.6rem;letter-spacing:.22em;text-transform:uppercase;color:var(--dim);margin:12px 0 6px}
  .vz .row{display:flex;flex-wrap:wrap;gap:5px}
  .vz button.b{border:1px solid var(--line);background:rgba(255,255,255,.04);border-radius:8px;padding:6px 9px;cursor:pointer;font-size:.7rem;
    letter-spacing:.08em;text-transform:uppercase;color:var(--chrome-hi)}
  .vz button.b:hover{border-color:rgba(242,166,80,.6)}
  .vz button.b[aria-pressed="true"]{background:linear-gradient(100deg,var(--amber),var(--champagne));color:#120c06;border-color:transparent}
  .vz button.b:disabled{opacity:.38;cursor:not-allowed}
  .vz button.stop{border-color:rgba(255,74,61,.6);color:#ffb3ad}
  .vz .state{display:flex;justify-content:space-between;align-items:baseline;margin-top:10px;font-variant-numeric:tabular-nums}
  .vz .state b{font-stretch:125%;letter-spacing:.14em;color:var(--chrome-hi);font-weight:600}
  .vz .bar{height:4px;border-radius:2px;background:rgba(255,255,255,.1);margin:6px 0 2px;overflow:hidden}
  .vz .bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--amber),var(--champagne))}
  .vz .msg{min-height:1.2em;margin-top:8px;color:var(--champagne);font-size:.7rem}
  .vz small{color:var(--dim);font-size:.6rem;letter-spacing:.1em}
  body.obs .vz{display:none}`;
  const el = document.createElement('section');
  el.className = 'vz'; el.setAttribute('aria-label', 'Vienna piano stage controls');
  const btn = (attr, val, text, extra = '') => `<button class="b" type="button" data-${attr}="${val}" ${extra}>${text}</button>`;
  el.innerHTML = `<style>${css}</style>
    <h2>Vienna piano stage <button type="button" class="min-btn" aria-label="Minimise" aria-expanded="true">–</button></h2>
    <div class="body">
      <div class="state"><b data-k="state">LOWERED</b><span data-k="h">0.00 m</span></div>
      <div class="bar"><i data-k="bar"></i></div>
      <h3>Piano lift</h3>
      <div class="row">${btn('cmd', 'up', 'Up')}${btn('cmd', 'stop', 'Stop', 'class="b stop"')}${btn('cmd', 'down', 'Down')}${btn('cmd', 'reset', 'Reset')}${btn('cmd', 'cinematic', 'Cinematic')}</div>
      <h3>Cameras</h3>
      <div class="row">${Object.entries(CAMS).map(([k, c]) => btn('cam', k, k, `title="${c.long}"`)).join('')}</div>
      <h3>Lighting</h3>
      <div class="row">${Object.keys(MODES).map(m => btn('mode', m, m.toLowerCase())).join('')}</div>
      <h3>Main display</h3>
      <div class="row">${SOURCES.map(([k, label, later]) => btn('src', k, label, later ? `disabled title="${later}"` : '')).join('')}</div>
      <p class="msg" data-k="msg" role="status" aria-live="polite"></p>
      <small>Development preview · simulation only, nothing is broadcast</small>
    </div>`;
  el.querySelector('.b.stop')?.removeAttribute('class');
  el.querySelector('[data-cmd="stop"]').className = 'b stop';
  document.body.append(el);
  const q = k => el.querySelector(`[data-k="${k}"]`);
  el.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.classList.contains('min-btn')) { const min = el.classList.toggle('min'); b.setAttribute('aria-expanded', String(!min)); b.textContent = min ? '+' : '–'; return; }
    if (b.dataset.cmd) command(b.dataset.cmd);
    else if (b.dataset.cam) pickCamera(b.dataset.cam);
    else if (b.dataset.mode) setMode(b.dataset.mode);
    else if (b.dataset.src) setSource(b.dataset.src);
  });
  // keys used by the studio page stay with it: the panel is used with the pointer
  el.addEventListener('keydown', e => e.stopPropagation());
  let last = '';
  const press = (sel, on) => { for (const b of el.querySelectorAll(sel)) b.setAttribute('aria-pressed', String(on(b))); };
  return {
    msg: q('msg'),
    show(s) {
      const key = [s.state, s.h.toFixed(2), s.mode, s.view, s.program, s.source, s.seq].join('|');
      if (key === last) return;
      last = key;
      q('state').textContent = s.state + (s.seq ? ' · CINEMATIC' : '');
      q('h').textContent = `+${s.h.toFixed(2)} m`;
      q('bar').style.width = `${(s.h / LIFT.travel) * 100}%`;
      press('[data-cam]', b => b.dataset.cam === s.view);
      press('[data-mode]', b => b.dataset.mode === s.mode);
      press('[data-src]', b => b.dataset.src === s.source);
      press('[data-cmd="cinematic"]', () => s.seq);
      for (const b of el.querySelectorAll('[data-cam]')) b.textContent = b.dataset.cam + (b.dataset.cam === s.program ? ' ●' : '');
    },
  };
}
