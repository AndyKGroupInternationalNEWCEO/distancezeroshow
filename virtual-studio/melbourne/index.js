// Melbourne Underground DJ Room: the wiring. The room and its booth (room.js, booth.js), its lighting presets and
// effects (lasers, haze, smoke, a safe strobe), the LED walls' visual presets and the track on them, the tempo clock
// that the lights and visuals run on, cameras DJ1–DJ6 with an automatic sequence, the camera transition from the
// main studio through the glass floor into the club, and a control panel. The Vienna Piano Stage is not touched:
// `withVienna` puts both on the same page, each with its own controls.
//
// Not audio: nothing here plays, mixes or listens to sound. The lights follow a tempo clock (BPM, set by hand or by
// the Broadcast Studio later), not the music itself; music, microphones and the mix stay with the Broadcast Studio
// and OBS.
import * as THREE from 'three';
import { VIEWS, ZONES } from '../views.js';
import { AMBER, ICE } from '../screens.js';
import { buildRoom, LED_PRESETS } from './room.js';
import { buildBooth } from './booth.js';
import { CAMS, DESCENT, CLUB_BOOTH, GLASS, inClub, inShaft, keepInClub } from './layout.js';

const GOLD = AMBER, SILVER = ICE, WHITE = '#fff4e8', WARM = '#ffd9b0', VIOLET = '#8a5cff', MAGENTA = '#ff3fa4', CYAN = '#3fd8ff';
// each group: [level, colour, (heads) pattern | pulse]. Gold, silver and black by default; club colours in the
// performance. `effects` are the presets' own suggestion for lasers, haze and strobe (the panel can override each)
export const MODES = {
  OPENING:     { spot: [0.6, SILVER, 'up'], wash: [0.35, GOLD, 'center'], strips: [0.5, GOLD], accent: [0.8, GOLD], booth: [0.9, GOLD], led: 0.55, preset: 'LOGO', lasers: [0, SILVER, 0], haze: 0.7, strobe: 0 },
  PERFORMANCE: { spot: [1, WHITE, 'beat', 1], wash: [0.8, VIOLET, 'sweep'], strips: [1, MAGENTA], accent: [0.7, GOLD], booth: [1, GOLD], led: 1, preset: 'PULSE', lasers: [0.9, CYAN, 1], haze: 0.85, strobe: 0 },
  BREAKDOWN:   { spot: [0.45, SILVER, 'sweep'], wash: [0.5, '#3b5bff', 'fan'], strips: [0.45, SILVER], accent: [0.5, SILVER], booth: [0.8, SILVER], led: 0.6, preset: 'WAVES', lasers: [0.45, SILVER, 0], haze: 1, strobe: 0 },
  CLOSING:     { spot: [0.35, WARM, 'center'], wash: [0.4, GOLD, 'center'], strips: [0.35, GOLD], accent: [0.6, GOLD], booth: [0.8, GOLD], led: 0.45, preset: 'TRACK', lasers: [0, GOLD, 0], haze: 0.5, strobe: 0 },
  BLACKOUT:    { spot: [0, WHITE, 'center'], wash: [0, WHITE, 'center'], strips: [0, GOLD], accent: [0, GOLD], booth: [0.06, GOLD], led: 0, preset: 'OFF', lasers: [0, WHITE, 0], haze: 0, strobe: 0 },
};
const GROUPS = ['spot', 'wash', 'strips', 'accent', 'booth', 'lasers'];
export const STROBE_MAX = 0.6;   // the strobe's level is capped here, and it never flashes more than 3 times a second

export function melbourne({ scene, camera, controls, director, studio, quality, reducedMotion }) {
  // the director keeps cameras above the studio floor; down here the club's walls, floor and ceiling are the limits
  // (a camera dragged or zoomed hard against a wall stays in, rather than being thrown up into the studio)
  let inside = false;
  const ours = () => !director.flying && (!director.current || (!!VIEWS[director.current]?.melbourne && VIEWS[director.current].pos[1] < 0));
  ZONES.push({
    has: p => inClub(p) || inShaft(p) || (inside && ours()),
    keep(p, target) { inside = !inShaft(p) || inClub(p); if (inside) { keepInClub(p); keepInClub(target, 0.1); } },
  });
  const room = buildRoom({ studio, scene, quality });
  const [bx, bz] = [CLUB_BOOTH.along - GLASS.along, CLUB_BOOTH.across - GLASS.across];
  const booth = buildBooth({ M: studio.M, parent: room.frame, at: [bx, 0, bz] });

  /* ----- light state: eased towards the preset, with the effects the operator set on top ----- */
  let mode = 'OPENING';
  const fx = { lasers: null, laserLevel: 1, haze: null, strobe: 0, preset: null };   // null: follow the preset
  const L = { led: { level: 0 }, haze: { level: 0 }, strobe: { level: 0 }, screens: { level: 1 }, pads: { level: 1 }, meters: { level: 1 }, preset: 'LOGO', track: null, smokeRequest: 0 };
  for (const g of GROUPS) L[g] = { level: 0, color: new THREE.Color(), pattern: 'center', pulse: 0 };
  const goal = new THREE.Color();
  let master = 0;   // the room as a whole: 1 while the DJ Room is the environment, a glow through the glass otherwise
  function ease(dt) {
    const m = MODES[mode], k = 1 - Math.exp(-dt * 2.0);
    for (const g of GROUPS) {
      const [level, color, extra, pulse] = m[g];
      let lvl = level;
      if (g === 'lasers') { lvl = fx.lasers === null ? level : fx.lasers ? Math.max(level, 0.8) : 0; lvl *= fx.laserLevel; }
      L[g].level += (lvl * master - L[g].level) * k;
      L[g].color.lerp(goal.set(color), k);
      if (g === 'spot' || g === 'wash') { L[g].pattern = extra; L[g].pulse = pulse || 0; }
      if (g === 'lasers') L[g].pulse = extra;
    }
    L.led.level += (m.led * Math.max(master, 0.25) - L.led.level) * k;
    L.haze.level += ((fx.haze ?? m.haze) * master - L.haze.level) * k;
    L.strobe.level = Math.min(STROBE_MAX, fx.strobe) * master;
    L.preset = fx.preset || m.preset;
    for (const g of ['screens', 'pads', 'meters']) L[g].level = Math.max(0.2, L.booth.level);
  }

  /* ----- the studio's wall upstairs: linked to the Vienna stage's wall routing by withVienna ----- */
  const wallBox = wallOf(studio), overlay = wallOverlay(L);
  const wall = { auto: true, setSource: null, getSource: null, texture: null, set(name) { wall.setSource?.(name); } };
  const desk = deskMonitors(studio);
  desk.apply = () => { const want = desk.on && wallLive() && !!wall.texture; if (want === desk.shown) return; desk.shown = want; if (want) desk.show(wall.texture); else desk.hide(); };

  /* ----- the tempo clock ----- */
  let bpm = 128, beat = 0;

  /* ----- cameras DJ1–DJ6, and the transition camera ----- */
  const keys = Object.keys(CAMS), id = k => 'm' + k;
  for (const k of keys) { const c = CAMS[k]; VIEWS[id(k)] = { label: c.label, long: c.long, pos: [...c.pos], target: [...c.target], fov: c.fov, drift: reducedMotion ? 0 : c.drift, tally: 0, cam: c.name, free: true, melbourne: k }; }
  VIEWS.mTravel = { label: 'Transition', long: 'Main studio → DJ room', pos: [...DESCENT[0].pos], target: [...DESCENT[0].target], fov: 50, drift: 0, tally: 0, cam: 'CAM DJ6', free: true, melbourne: 'travel' };
  let program = null, auto = false, autoNext = 0, autoI = 0, travel = null, env = 'studio';
  let show = 'ended', shown = 'DJ2';   // the DJ room camera the studio's LED wall shows (follows every cut down here; the operator can pick it alone)
  // a camera that is not yet in the club (or one on the glass, DJ6) cuts: a flight would pass through the floor
  const below = k => CAMS[k].pos[1] < 0;
  const cut = (k, { instant = false } = {}) => { program = k; shown = k; director.setAuto(false); director.go(id(k), { instant: instant || below(k) !== inClub(camera.position) }); };
  const AUTO = ['DJ1', 'DJ2', 'DJ3', 'DJ5', 'DJ2', 'DJ4', 'DJ1', 'DJ3'];   // calm cuts, every 8 bars
  // the travel: through DESCENT's keyframes on a smooth curve, eased in and out, then the master wide
  const path = { pos: new THREE.CatmullRomCurve3(DESCENT.map(d => new THREE.Vector3(...d.pos)), false, 'centripetal'), target: new THREE.CatmullRomCurve3(DESCENT.map(d => new THREE.Vector3(...d.target)), false, 'centripetal') };
  const travelTime = DESCENT.at(-1).t;
  const pv = new THREE.Vector3(), tv = new THREE.Vector3();
  function startTravel() {
    travel = { t: 0 }; auto = false; program = 'travel';
    director.setAuto(false); director.go('mTravel', { instant: true });
    say('Transition: main studio → DJ room');
  }

  /* ----- environments: the main studio (the room glows through the glass) or the DJ room ----- */
  function setEnv(name, { transition = true } = {}) {
    if (name === 'djroom') {
      env = 'djroom';
      if (transition && !reducedMotion) startTravel(); else cut('DJ1', { instant: true });
      if (wall.auto && show !== 'live') api.setShow('live');
      say('Environment: DJ room');
    } else if (name === 'studio') {
      env = 'studio'; travel = null; auto = false; program = null;
      director.go('studio', { instant: inClub(camera.position) || inShaft(camera.position) }); say('Environment: main studio');
    }
  }

  /* ----- what the room shows; and culling ----- */
  const frustum = new THREE.Frustum(), pm = new THREE.Matrix4();
  let t = 0, ui = null;
  const say = text => { if (ui) ui.msg.textContent = text; };
  function update(dt) {
    t += dt; beat += dt * bpm / 60;
    // the room's master: full in the DJ room, a soft glow up through the glass while the main studio is the room
    // (and full while the studio's wall shows the DJ room live: the show is on down there)
    master += ((env === 'djroom' || wallLive() ? 1 : 0.35) - master) * (1 - Math.exp(-dt * 1.2));
    ease(dt);
    // another stage's shot taken from down here (a Vienna camera, a studio view): a cut, never a flight through the floor
    if (director.flying && inClub(camera.position) && !VIEWS[director.current]?.melbourne) director.go(director.current, { instant: true });
    if (!inClub(camera.position) && !inShaft(camera.position) && !ours()) inside = false;
    if (travel) {
      travel.t += dt;
      const u = Math.min(1, travel.t / travelTime), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      path.pos.getPoint(e, pv).toArray(VIEWS.mTravel.pos); path.target.getPoint(e, tv).toArray(VIEWS.mTravel.target);
      camera.position.copy(pv); controls.target.copy(tv); camera.lookAt(tv);   // the director does not follow a moving shot
      if (u >= 1) { travel = null; cut('DJ2', { instant: true }); say('DJ room: CAM DJ2'); }
    }
    if (auto && !travel && beat >= autoNext) { autoNext = beat + 32; const k = AUTO[autoI++ % AUTO.length]; if (env === 'djroom') cut(k); else shown = k; }
    camera.updateMatrixWorld(); pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pm);
    desk.apply();
    const seen = frustum.intersectsBox(room.bounds) || feedWanted();
    room.root.visible = seen;
    if (seen) { room.face(camera); room.update(t, dt, L, beat); booth.update(t, dt, L, beat); }
    ui?.show({ mode, env, program, auto, bpm, beat, fx, preset: L.preset, track: L.track, view: VIEWS[director.current]?.melbourne || null, show, wall: wallName(), wallAuto: wall.auto, desk: desk.on });
  }

  /* ----- the controls (the panel uses these; the Broadcast Studio's bridge will use the same) ----- */
  const api = {
    update, room, booth, L, MODES,
    get mode() { return mode; }, get env() { return env; }, get program() { return program; }, get auto() { return auto; }, get bpm() { return bpm; }, get beat() { return beat; },
    get travelling() { return !!travel; },
    setEnv,
    pickCamera(k) { if (!CAMS[k]) return say('No such camera'); travel = null; auto = false; env = 'djroom'; cut(k); say('DJ room: ' + CAMS[k].name); },
    setAuto(on) { auto = !!on; autoNext = beat; travel = null; say(auto ? 'Automatic camera sequence on (8 bars a shot)' : 'Automatic camera sequence off'); },
    transition: startTravel,
    setMode(m) { if (!MODES[m]) return say('No such lighting preset'); mode = m; fx.preset = null; say('Lighting: ' + m); },
    setLed(p) { if (!LED_PRESETS.includes(p)) return say('No such LED preset'); fx.preset = p; say('LED walls: ' + p); },
    lasers(on, level) { fx.lasers = on === null ? null : !!on; if (level !== undefined) fx.laserLevel = Math.max(0, Math.min(1, +level)); say(`Lasers ${fx.lasers === null ? 'with the preset' : fx.lasers ? 'on' : 'off'} · ${Math.round(fx.laserLevel * 100)} %`); },
    haze(density) { fx.haze = density === null ? null : Math.max(0, Math.min(1, +density)); say(`Haze ${fx.haze === null ? 'with the preset' : Math.round(fx.haze * 100) + ' %'}`); },
    smoke(seconds = 2.5) { L.smokeRequest = Math.max(0.5, Math.min(6, +seconds)); say('Smoke: a burst of ' + L.smokeRequest + ' s'); },
    strobe(level) { fx.strobe = Math.max(0, Math.min(STROBE_MAX, +level)); say(fx.strobe ? `Strobe ${Math.round((fx.strobe / STROBE_MAX) * 100)} % (max 3 flashes a second)` : 'Strobe off'); },
    setTrack(tr) { L.track = tr?.title ? { title: String(tr.title).slice(0, 60), artist: String(tr.artist || '').slice(0, 60) } : null; say(L.track ? 'Track: ' + L.track.title : 'Track cleared'); },
    setTempo(b) { const v = +b; if (!(v >= 60 && v <= 200)) return say('Tempo: 60–200 BPM'); bpm = v; say(`Tempo ${bpm} BPM`); },
    // the studio's LED wall upstairs: 'djroom' (this room live, from the camera it shows), 'main' (the studio's own
    // programme) or 'off'; `auto`: the wall follows the show (setShow)
    setWall(w) { const name = { djroom: 'melbourne', main: 'main', off: 'off' }[w]; if (!name) return say('No such wall source'); wall.set(name); say('Studio wall: ' + w); },
    // the DJ show's state as the Broadcast Studio runs it: live ⇒ the wall shows the room; a break or the end ⇒ the
    // studio's own programme again (only while the wall follows the show)
    setShow(state) { if (!['live', 'break', 'ended'].includes(state)) return say('No such show state'); show = state; if (wall.auto) wall.set(state === 'live' ? 'melbourne' : 'main'); say('DJ show: ' + state); },
    setWallAuto(on) { wall.auto = !!on; say(wall.auto ? 'Studio wall follows the DJ show' : 'Studio wall by hand'); },
    showOnWall(k) { if (!CAMS[k]) return say('No such camera'); shown = k; say('Studio wall: ' + CAMS[k].name); },
    setDeskMonitors(on) { desk.on = !!on; desk.apply(); say(desk.on ? 'Presenter monitors: DJ room live' : 'Presenter monitors off'); },
    feed: { shot: c => feedShot(c), wanted: () => feedWanted(), before: c => feedBefore(c), after: (r, rt) => overlay.render(r, rt) },
    linkWall(set, get, texture) { wall.setSource = set; wall.getSource = get; wall.texture = texture; },
    report() { return { env, mode, program, auto, show, wall: wallName(), wallAuto: wall.auto, shown, deskMonitors: desk.on, bpm, preset: L.preset, track: L.track, lasers: fx.lasers, laserLevel: fx.laserLevel, haze: fx.haze, strobe: fx.strobe, travelling: !!travel, view: director.current }; },
  };
  ui = panel(api);
  return api;

  /* ----- the studio's LED wall (and the presenters' desk monitors) showing this room live ----- */
  // The picture is rendered by the Vienna stage's wall routing (vienna/index.js, source 'melbourne'): the same render
  // target, the same rule against a picture of a picture. It is a picture only: no sound goes with it.
  function wallName() { const s = wall.getSource?.(); return s === 'melbourne' ? 'djroom' : s || 'main'; }
  function wallLive() { return wall.getSource?.() === 'melbourne'; }
  // worth a render only while someone upstairs can see the wall or a desk monitor (never from down here)
  function feedWanted() {
    if (!wallLive() || inClub(camera.position) || inShaft(camera.position)) return false;
    camera.updateMatrixWorld(); pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pm);
    return frustum.intersectsBox(wallBox) || (desk.on && desk.screens.some(m => frustum.intersectsObject(m)));
  }
  function feedShot(c) {
    const v = VIEWS[id(shown)];
    c.position.set(...v.pos); c.lookAt(...v.target); c.fov = v.fov;
  }
  function feedBefore(c) { room.root.visible = true; room.face(c); room.update(t, 0, L, beat); }
}

// the studio's wall upstairs and its box (taken before anything is routed to it)
function wallOf(studio) {
  let mesh = null; studio.root.traverse(o => { if (o.isMesh && o.material?.emissiveMap === studio.wall.texture) mesh = o; });
  return mesh ? new THREE.Box3().setFromObject(mesh) : new THREE.Box3();
}

// the presenters' slim desk monitors (set.js): dark until the DJ room is live, then its picture (centre of the wide
// feed, the right way round: the feed texture is drawn mirrored for the curved wall)
function deskMonitors(studio) {
  const screens = [];
  studio.root.traverse(o => { const p = o.geometry?.parameters; if (o.isMesh && p && p.width === 0.32 && p.height === 0.19 && o.material?.color?.getHex() === 0x1a2230) screens.push(o); });
  const geo = screens[0]?.geometry, live = geo?.clone(), mat = new THREE.MeshBasicMaterial({ toneMapped: false });
  if (live) {
    const span = (0.32 / 0.19) / (2048 / 860), uv = live.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, 0.5 + (0.5 - uv.getX(i)) * span);   // mirrored back, cropped to the monitor
  }
  const own = screens.map(m => m.material);
  return {
    screens, on: true, shown: false,
    show(texture) { if (!live) return; mat.map = texture; mat.needsUpdate = true; screens.forEach(m => { m.geometry = live; m.material = mat; }); },
    hide() { screens.forEach((m, i) => { m.geometry = geo; m.material = own[i]; }); },
  };
}

// what the wall's live picture carries: DJ Andy'K, the track, and the official D//0 artwork (assets/logo-do-1k.webp)
function wallOverlay(L) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 430;
  const x = c.getContext('2d'), tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const logo = new Image(); logo.src = new URL('../../assets/logo-do-1k.webp', import.meta.url).href;
  const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthTest: false })));
  let drawn = null;
  function draw() {
    const key = (L.track?.title || '') + '|' + (L.track?.artist || '') + '|' + logo.complete;
    if (key === drawn) return; drawn = key;
    x.clearRect(0, 0, 1024, 430);
    const g = x.createLinearGradient(0, 300, 0, 430); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.7)');
    x.fillStyle = g; x.fillRect(0, 300, 1024, 130);
    if (logo.complete && logo.naturalWidth) { const h = 44, w = h * logo.naturalWidth / logo.naturalHeight; x.drawImage(logo, 1024 - 32 - w, 24, w, h); }
    x.fillStyle = '#f2a650'; x.font = '700 15px Archivo, Arial, sans-serif'; x.fillText("DJ ANDY'K  ·  LIVE FROM THE DJ ROOM", 32, 368);
    if (L.track?.title) {
      x.fillStyle = '#f3f5f8'; x.font = '600 26px Archivo, Arial, sans-serif'; x.fillText(L.track.title, 32, 400);
      if (L.track.artist) { const w = x.measureText(L.track.title).width; x.fillStyle = 'rgba(243,245,248,0.7)'; x.font = '500 17px Archivo, Arial, sans-serif'; x.fillText('—  ' + L.track.artist, 32 + w + 16, 400); }
    }
    tex.needsUpdate = true;
  }
  return {
    render(renderer, target) {
      draw();
      const clear = renderer.autoClear; renderer.autoClear = false;
      renderer.setRenderTarget(target); renderer.render(scene, cam);
      renderer.autoClear = clear;
    },
  };
}

// the Vienna Piano Stage and the DJ room on one page: Vienna's controls stay exactly as they are (window.__studio.ext
// is Vienna's), the DJ room is ext.melbourne
export function withVienna(vienna) {
  return ctx => {
    const v = vienna(ctx), m = melbourne(ctx), u = v.update;
    v.update = (dt, t) => { u(dt, t); m.update(dt, t); };
    v.melbourne = m;
    v.addSource('melbourne', m.feed); m.linkWall(v.setSource, () => v.source, v.feedTarget.texture);
    return v;
  };
}

/* ---------- the panel: right side, folded on narrow screens ---------- */
function panel(api) {
  const css = `
  .mz{position:fixed;top:72px;right:16px;z-index:6;width:300px;max-height:calc(100vh - 170px);overflow:auto;background:rgba(8,9,12,.86);border:1px solid var(--line,#2a2c31);border-radius:14px;padding:12px 14px;color:var(--chrome,#b9bcc2);font:12px/1.4 Archivo,Arial,sans-serif;backdrop-filter:blur(8px)}
  .mz h2{margin:0 0 6px;font-size:.78rem;letter-spacing:.18em;color:#a9c8ee;display:flex;justify-content:space-between;align-items:center}
  .mz h3{margin:10px 0 4px;font-size:.66rem;letter-spacing:.14em;text-transform:uppercase;color:var(--chrome-hi,#e8e9ec)}
  .mz .row{display:flex;flex-wrap:wrap;gap:4px}
  .mz .b{background:rgba(255,255,255,.05);border:1px solid var(--line,#2a2c31);color:var(--chrome-hi,#e8e9ec);border-radius:8px;padding:5px 8px;font:inherit;font-size:.68rem;cursor:pointer}
  .mz .b[aria-pressed=true]{border-color:#a9c8ee;background:rgba(169,200,238,.16)}
  .mz input[type=range]{width:100%}
  .mz label{display:block;font-size:.66rem;margin-top:4px}
  .mz input[type=text],.mz input[type=number]{width:100%;box-sizing:border-box;background:rgba(255,255,255,.05);border:1px solid var(--line,#2a2c31);color:var(--chrome-hi,#e8e9ec);border-radius:6px;padding:4px 6px;font:inherit;font-size:.7rem;margin:2px 0}
  .mz .msg{min-height:1.3em;color:#a9c8ee;font-size:.68rem;margin:8px 0 0}
  .mz.min .body{display:none}
  .mz .min-btn{background:none;border:0;color:inherit;font-size:1rem;cursor:pointer}
  body.obs .mz,body.dz-stage .mz{display:none}`;
  const el = document.createElement('section'); el.className = 'mz'; el.setAttribute('aria-label', 'Melbourne underground DJ room controls');
  const btn = (attr, val, text) => `<button class="b" type="button" data-${attr}="${val}">${text}</button>`;
  el.innerHTML = `<style>${css}</style>
    <h2>DJ room — Melbourne <button type="button" class="min-btn" aria-label="Minimise" aria-expanded="true">–</button></h2>
    <div class="body">
      <h3>Environment</h3>
      <div class="row">${btn('env', 'studio', 'Main studio')}${btn('env', 'djroom', 'DJ room')}${btn('travel', '1', 'Transition')}</div>
      <h3>DJ show</h3>
      <div class="row">${btn('show', 'live', 'Live')}${btn('show', 'break', 'Break')}${btn('show', 'ended', 'Ended')}</div>
      <h3>Studio wall upstairs</h3>
      <div class="row">${btn('wall', 'djroom', 'DJ room live')}${btn('wall', 'main', 'Main studio')}${btn('wall', 'off', 'Off')}${btn('wallauto', '1', 'Follow show')}${btn('desk', '1', 'Desk monitors')}</div>
      <h3>Cameras</h3>
      <div class="row">${Object.entries(CAMS).map(([k, c]) => `<button class="b" type="button" data-cam="${k}" title="${c.long}">${k}</button>`).join('')}${btn('auto', '1', 'Auto')}</div>
      <h3>Lighting</h3>
      <div class="row">${Object.keys(MODES).map(m => btn('mode', m, m.toLowerCase())).join('')}</div>
      <h3>LED walls</h3>
      <div class="row">${LED_PRESETS.map(p => btn('led', p, p.toLowerCase())).join('')}</div>
      <label>Track title<input type="text" data-k="title" maxlength="60" placeholder="(from the Broadcast Studio)"></label>
      <label>Artist<input type="text" data-k="artist" maxlength="60" placeholder="DJ Andy'K"></label>
      <div class="row">${btn('track', 'set', 'Show track')}${btn('track', 'clear', 'Clear')}</div>
      <h3>Effects</h3>
      <div class="row">${btn('lasers', 'preset', 'Lasers: preset')}${btn('lasers', 'on', 'On')}${btn('lasers', 'off', 'Off')}</div>
      <label>Laser intensity <input type="range" min="0" max="1" step="0.05" value="1" data-k="laserLevel"></label>
      <label>Haze density <input type="range" min="0" max="1" step="0.05" value="0.7" data-k="haze"></label>
      <div class="row">${btn('haze', 'preset', 'Haze: preset')}${btn('smoke', '1', 'Smoke burst')}</div>
      <label>Strobe (capped, max 3 flashes/s) <input type="range" min="0" max="${STROBE_MAX}" step="0.05" value="0" data-k="strobe"></label>
      <label>Tempo clock (BPM — not audio-reactive) <input type="number" min="60" max="200" step="1" value="128" data-k="bpm"></label>
      <p class="msg" data-k="msg" role="status" aria-live="polite"></p>
      <small>Development preview · visual only: no audio is played or mixed here</small>
    </div>`;
  document.body.append(el);
  if (innerWidth < 700) el.classList.add('min');
  const q = k => el.querySelector(`[data-k="${k}"]`);
  el.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.classList.contains('min-btn')) { const min = el.classList.toggle('min'); b.setAttribute('aria-expanded', String(!min)); b.textContent = min ? '+' : '–'; return; }
    const d = b.dataset;
    if (d.env) api.setEnv(d.env);
    else if (d.travel) { api.setEnv('djroom'); }
    else if (d.cam) { if (api.env !== 'djroom') api.setEnv('djroom', { transition: false }); api.pickCamera(d.cam); }
    else if (d.auto) api.setAuto(!api.auto);
    else if (d.show) api.setShow(d.show);
    else if (d.wall) api.setWall(d.wall);
    else if (d.wallauto) api.setWallAuto(!api.report().wallAuto);
    else if (d.desk) api.setDeskMonitors(!api.report().deskMonitors);
    else if (d.mode) api.setMode(d.mode);
    else if (d.led) api.setLed(d.led);
    else if (d.track) api.setTrack(d.track === 'set' ? { title: q('title').value, artist: q('artist').value } : null);
    else if (d.lasers) api.lasers(d.lasers === 'preset' ? null : d.lasers === 'on');
    else if (d.haze) api.haze(null);
    else if (d.smoke) api.smoke();
  });
  el.addEventListener('input', e => {
    const k = e.target.dataset.k;
    if (k === 'laserLevel') api.lasers(api.report().lasers, e.target.value);
    else if (k === 'haze') api.haze(e.target.value);
    else if (k === 'strobe') api.strobe(e.target.value);
  });
  el.addEventListener('change', e => { if (e.target.dataset.k === 'bpm') api.setTempo(e.target.value); });
  el.addEventListener('keydown', e => e.stopPropagation());   // the studio's keys stay with the studio
  let last = '';
  const press = (sel, on) => { for (const b of el.querySelectorAll(sel)) b.setAttribute('aria-pressed', String(on(b))); };
  return {
    msg: q('msg'),
    show(s) {
      const key = [s.mode, s.env, s.program, s.auto, s.preset, s.fx.lasers, s.fx.haze === null, s.view, s.show, s.wall, s.wallAuto, s.desk].join('|');
      if (key === last) return; last = key;
      press('[data-env]', b => b.dataset.env === s.env);
      press('[data-cam]', b => b.dataset.cam === s.view);
      press('[data-auto]', () => s.auto);
      press('[data-show]', b => b.dataset.show === s.show);
      press('[data-wall]', b => b.dataset.wall === s.wall);
      press('[data-wallauto]', () => s.wallAuto);
      press('[data-desk]', () => s.desk);
      press('[data-mode]', b => b.dataset.mode === s.mode);
      press('[data-led]', b => b.dataset.led === s.preset);
      press('[data-lasers]', b => (b.dataset.lasers === 'preset' && s.fx.lasers === null) || (b.dataset.lasers === 'on' && s.fx.lasers === true) || (b.dataset.lasers === 'off' && s.fx.lasers === false));
      press('[data-haze]', () => s.fx.haze === null);
    },
  };
}
