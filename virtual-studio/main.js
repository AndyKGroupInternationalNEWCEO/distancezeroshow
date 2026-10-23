// DISTANCE // ZERO virtual studio: renderer, quality tiers, lighting looks, the simulated on-air sequence
// and the page controls. Purely a visual experience: it connects to nothing and broadcasts nothing.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { buildStudio } from './set.js';
import { applyProbe, loadProbe } from './melbourne/probes.js';
import { createDirector, VIEWS, ORDER, inLounge, nearLounge } from './views.js';
import { createSound } from './sound.js';
import { createPanels } from './panels.js';
import { createOnAir } from './onair.js';

/* lighting looks. `onAir` scales most of it; off air the studio sits under dim work light */
export const LOOKS = {
  broadcast: { key: 1, warm: 1, cool: 1, rim: 0.8, amber: 1, ice: 1, accent: 1, fins: 0.75, beams: 0.1, music: 0 },
  vienna: { key: 1, warm: 1.12, cool: 0.7, rim: 0.95, amber: 1.4, ice: 0.4, accent: 1, fins: 0.9, beams: 0.16, music: 0 },
  melbourne: { key: 1, warm: 0.72, cool: 1.12, rim: 0.95, amber: 0.4, ice: 1.4, accent: 1, fins: 0.9, beams: 0.16, music: 0 },
  music: { key: 0.55, warm: 0.9, cool: 0.95, rim: 1.25, amber: 1.2, ice: 1.2, accent: 1.15, fins: 1.25, beams: 0.85, music: 1 },
};
export const OFF = { key: 0.36, rim: 0.35, accent: 0.42, fins: 0.45, beams: 0, wall: 0.4, house: 1, onAir: 0 };
export const ON = { wall: 1, house: 0.2, onAir: 1 };
// the piano shot, on or off air: the studio goes down to a glow and one warm spot from the truss takes the grand
export const SOLO = { key: 0.08, rim: 0.12, accent: 0.18, fins: 0.15, beams: 0, wall: 0.2, house: 0.25 };
const PROGRAMME = [['cities', 15], ['presenters', 11], ['wave', 10]];

// what the shiny surfaces reflect: a dark studio with a softbox overhead, the LED wall, key lights and the
// amber (Vienna) and ice (Melbourne) light strips. Much closer to the set than a generic bright room.
export function studioEnvironment() {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.BoxGeometry(30, 12, 30), new THREE.MeshBasicMaterial({ color: 0x050607, side: THREE.BackSide })));
  const panel = (w, h, color, k, pos, look) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(...look); env.add(m);
  };
  panel(7, 2.2, 0xfff1e0, 2.2, [0, 5.8, 1.5], [0, 0, 0]);
  panel(11, 4.4, 0x7d8698, 0.3, [0, 3, -8], [0, 3, 0]);
  for (const x of [-1, 1]) {
    panel(0.6, 6, x < 0 ? 0xf2a650 : 0xa9c8ee, 2.4, [x * 10, 3.5, -2], [0, 3.5, 0]);
    panel(0.6, 6, x < 0 ? 0xf2a650 : 0xa9c8ee, 1.4, [x * 8, 3.5, -6], [0, 3.5, 0]);
    panel(1.2, 1.2, 0xffffff, 6, [x * 3.2, 6.6, 4.4], [0, 1, -2]);
  }
  return env;
}

// shots are framed for 16:9; on narrower screens (portrait phones) keep the same width in view, within reason
function screenFov(fov, aspect) {
  const wide = 16 / 9;
  if (aspect >= wide) return fov;
  const v = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(fov) / 2) * wide / aspect);
  return Math.min(THREE.MathUtils.radToDeg(v), fov * 1.55, 64);
}

// OBS (?obs=1): the clean pre-show picture for an OBS browser source. &play=live (the default) starts the live 3D
// studio's on-air simulation, &play=video the rendered opening. &start=<ISO time> counts down to the show's real
// start, otherwise there is no countdown
export const OBS = (() => {
  const q = new URLSearchParams(location.search);
  if (q.get('obs') !== '1') return null;
  const at = Date.parse(q.get('start') || '');
  return { play: q.get('play'), startAt: Number.isFinite(at) ? at : null };
})();
const PRESHOW = 'assets/video/dz-preshow-2026-10-14b.mp4';   // the rendered empty-studio opening, with its sound (a new name for each new render: assets are cached for a year)

// `extend` (optional): builds an addition to the set (the Vienna piano stage) once the studio stands; it gets the
// renderer, scene, studio and camera direction and returns { update(dt, t) }, run every frame after the camera has moved
export async function start({ canvas, ui, quality, progress = () => {}, extend = null }) {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ----- renderer ----- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality.dpr < 2, powerPreference: 'high-performance', stencil: false });
  let dpr = quality.dpr;
  renderer.setPixelRatio(dpr);
  // the realism pass (?real=0 shows the previous look for comparison): ambient occlusion and the floor light baked
  // in Cycles. The tone curve stays ACES: AgX made the black studio grey here
  const REAL = new URLSearchParams(location.search).get('real') !== '0';
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  RectAreaLightUniformsLib.init();
  progress(0.35);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x040507);
  scene.fog = new THREE.FogExp2(0x040507, 0.024);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studioEnvironment(), 0.02).texture;
  scene.environmentIntensity = 0.8;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 80);
  const v0 = VIEWS.crane;
  camera.position.set(...v0.pos);

  /* ----- the set ----- */
  const studio = buildStudio({ scene, quality, logo: new URLSearchParams(location.search).get('logo') || 'image' });
  progress(0.7);

  // reflections rendered in Cycles (production/gpu, cache-studio): the studio seen from its middle at eye height
  // becomes every material's environment, the grand's lacquer reflects the studio from over its open lid. Loaded
  // once, in the background; until then (and with ?real=0) the generic studio environment above
  const studioProbes = !REAL ? Promise.resolve(false) : Promise.all([
    loadProbe(renderer, 'studio').then(env => { scene.environment = env; }),
    applyProbe(renderer, 'studio-piano', [studio.piano], { intensity: 1.8, shared: new Set(Object.values(studio.M).filter(m => m?.isMaterial)) }),
  ]).then(() => true).catch(e => { console.warn('studio probes:', e.message); return false; });

  let mirror = null;
  if (quality.reflections) {
    const ms = quality.mirrorSize || 1024;
    mirror = new Reflector(new THREE.CircleGeometry(26, 64), { clipBias: 0.003, textureWidth: ms, textureHeight: ms, color: 0x6a6d73 });
    mirror.rotation.x = -Math.PI / 2;
    mirror.position.y = -0.002;
    scene.add(mirror);
  }

  /* ----- post ----- */
  // broadcast: the post chain renders into a multisampled target, so edges stay clean at 1080p (the canvas's own
  // antialiasing does not reach the composer's targets)
  const composer = quality.msaa
    ? new EffectComposer(renderer, new THREE.WebGLRenderTarget(1920, 1080, { type: THREE.HalfFloatType, samples: quality.msaa }))
    : new EffectComposer(renderer);
  composer.setPixelRatio(dpr);
  composer.addPass(new RenderPass(scene, camera));
  let ao = null;
  if (REAL && quality.ao) {
    ao = new GTAOPass(scene, camera, 256, 256);
    ao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.6, thickness: 1.2, scale: 1.1, samples: 12 });
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    ao.blendIntensity = 0.9;
    // light cones, LED glows and other see-through things are not solid: keep them out of the occlusion
    const hide = ao.overrideVisibility.bind(ao);
    ao.overrideVisibility = () => {
      hide();
      scene.traverse(o => { if (o.isMesh && (o.material.transparent || o.material.isShaderMaterial || o.material.isMeshBasicMaterial)) o.visible = false; });
    };
    composer.addPass(ao);
  }
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.62, 0.55, 0.86);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  // security cameras: the picture as their recording, in the renderer itself: grey, a little hard, sensor noise, a dark
  // edge from the cheap wide lens. Off (not even run) on every other shot.
  const cctvPass = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec3 c = texture2D(tDiffuse, vUv).rgb;
        float y = dot(c, vec3(0.299, 0.587, 0.114));
        y = clamp((y - 0.5) * 1.25 + 0.5 + 0.06, 0.0, 1.0);
        y += (hash(vUv * 900.0 + fract(uTime * 7.0)) - 0.5) * 0.06;
        vec2 d = vUv - 0.5; y *= 1.0 - dot(d, d) * 1.1;
        gl_FragColor = vec4(vec3(y) * vec3(0.96, 1.0, 0.97), 1.0);
      }`,
  });
  cctvPass.enabled = false;
  composer.addPass(cctvPass);

  /* ----- controls and direction ----- */
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(...v0.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.8;
  controls.panSpeed = 0.6;
  controls.minDistance = 0.7;
  controls.maxDistance = 15;
  controls.minPolarAngle = 0.12;
  controls.maxPolarAngle = 1.55;
  controls.minAzimuthAngle = -1.35;
  controls.maxAzimuthAngle = 1.35;
  controls.screenSpacePanning = true;

  const lens = { fov: v0.fov };
  let air = null;   // the full-screen on-air simulation (created below)
  let lastFree = false;
  const director = createDirector({
    camera, lens, controls, reducedMotion,
    onView: name => {
      for (const b of ui.views) b.setAttribute('aria-pressed', String(b.dataset.view === name));
      document.getElementById('viewLabel').textContent = name ? VIEWS[name].label : 'Free';
      ui.shot.textContent = name ? VIEWS[name].long : 'Free camera';
      const cctv = name && VIEWS[name].cctv;
      document.body.classList.toggle('cctv', !!cctv); cctvPass.enabled = !!cctv;
      // a security camera looks from where it hangs, often from the side or behind the set: no orbit limits there (nor
      // for shots marked `free`: the Vienna piano stage's cameras, which look across the set)
      // (dragging away from a free shot keeps the limits open: closing them would swing the camera round)
      const free = cctv || (name ? !!VIEWS[name].free : lastFree); lastFree = !cctv && free;
      controls.minAzimuthAngle = free ? -Infinity : -1.35; controls.maxAzimuthAngle = free ? Infinity : 1.35;
      controls.maxPolarAngle = free && !cctv ? Math.PI - 0.2 : 1.55;   // the Vienna stage's cameras look up at the raised grand
      if (cctv) document.getElementById('cctvName').textContent = cctv;
      for (const b of ui.views) if (b.dataset.view === 'security') b.setAttribute('aria-pressed', String(!!cctv));
      for (const b of ui.views) if (b.dataset.view === 'slowmo') b.setAttribute('aria-pressed', String(name === 'slowmo' || name === 'robot'));
      air?.shot(name);
      showTally();
    },
    onAuto: on => { ui.auto.setAttribute('aria-pressed', String(on)); ui.auto.querySelector('span').textContent = on ? 'Auto camera on' : 'Auto camera off'; },
  });

  /* ----- state: look, on/off air (simulation only) ----- */
  let look = 'broadcast', onAir = false, sim = false, countdownTimer = 0, programmeAt = 0, programmeIndex = 0;
  let after = false;   // AFTERSHOW (spaces.js): the show is over, the work light is on, the wall says so
  // a* = what the studio "hears" (soundtrack and piano), 0 when silent
  const L = { ...LOOKS.broadcast, ...OFF, warm: 1, cool: 1, amber: 1, ice: 1, music: 0, solo: 0, aOn: 0, aBass: 0, aMid: 0, aHigh: 0, aLevel: 0, djOn: 0, djA: 0, djB: 0, djVA: 0.85, djVB: 0.85, djX: 0.5 };
  const target = () => {
    const base = { ...LOOKS[look] };
    // after the show: the stage light down to a glow, the house work light up full, nothing on air
    if (after) return { ...base, key: 0.12, rim: 0.08, accent: 0.22, fins: 0.15, beams: 0, wall: 0.35, house: 2.6, onAir: 0, music: 0, solo: 0 };
    const goal = onAir ? { ...base, ...ON }
      : { ...base, key: base.key * OFF.key, rim: base.rim * OFF.rim, accent: base.accent * OFF.accent, fins: base.fins * OFF.fins, beams: 0, wall: OFF.wall, house: OFF.house, onAir: 0, music: base.music * 0.3 };
    goal.solo = director.current === 'piano' ? 1 : VIEWS[director.current]?.solo || 0;   // (shots of the Vienna piano stage: partly)
    if (goal.solo) for (const [k, v] of Object.entries(SOLO)) goal[k] *= 1 + (v - 1) * goal.solo;
    return goal;
  };

  function showTally() {
    const n = director.tally();
    ui.cam.textContent = onAir ? (VIEWS[director.current]?.cam || (n === 4 ? 'JIB' : n === 6 ? '4K HS' : `CAM ${n}`)) : 'CAM —';
  }

  // the wall's own on-air programme, except while the simulation player has the wall for the show's video
  const setWall = program => { if (!air?.isOpen) studio.wall.set(program); };

  function setLook(name) {
    look = name;
    for (const b of ui.looks) b.setAttribute('aria-pressed', String(b.dataset.look === name));
    document.getElementById('lookLabel').textContent = ui.looks.find(x => x.dataset.look === name)?.textContent || name;
    air?.look(name);
    if (onAir) setWall(name === 'music' ? 'wave' : PROGRAMME[programmeIndex][0]);
  }

  function setAfterShow(on) {
    after = !!on;
    if (after && onAir) setOnAir(false);
    studio.wall.set(after ? 'ended' : 'idle');
    ui.status.textContent = after ? 'After the show · off air' : 'Off air · studio preview';
  }

  function setOnAir(on) {
    clearInterval(countdownTimer);
    ui.onair.setAttribute('aria-pressed', String(on));
    ui.onair.querySelector('span').textContent = on ? 'End simulation' : 'Simulate on air';
    document.body.classList.toggle('sim', on);
    if (!on) {
      onAir = false; studio.wall.countdown(0); ui.count.hidden = true;
      studio.wall.set('idle');
      ui.status.textContent = 'Off air · studio preview';
      ui.live.textContent = 'Simulation ended. The studio is back in preview lighting.';
      showTally();
      return;
    }
    // a short stand-by count, then lights up. Always labelled as a simulation.
    ui.status.textContent = 'Simulation starting';
    let n = reducedMotion || air?.isOpen ? 0 : 3;   // the player starts its own video straight away
    const step = () => {
      if (n > 0) { studio.wall.countdown(n); ui.count.hidden = false; ui.count.textContent = String(n); n--; return; }
      clearInterval(countdownTimer);
      studio.wall.countdown(0); ui.count.hidden = true;
      onAir = true;
      programmeIndex = 0; programmeAt = clock.elapsed;
      setWall(look === 'music' ? 'wave' : PROGRAMME[0][0]);
      ui.status.textContent = 'Simulated on air';
      ui.live.textContent = 'Simulated on-air lighting. Nothing is being broadcast.';
      showTally();
    };
    step();
    if (!reducedMotion) countdownTimer = setInterval(step, 800);
  }

  /* ----- sound: the music station's soundtrack and piano (nothing plays until the visitor clicks) ----- */
  const sound = createSound();
  const panels = createPanels({ sound, el: ui.panel, onMusicStart: () => { if (look !== 'music') setLook('music'); if (!sim) { director.setAuto(false); director.go('music'); } } });

  /* ----- UI wiring ----- */
  // the security button: the camera where you are (studio or backstage); pressed again, the other one
  const security = () => director.current === 'security' ? 'securityLounge' : director.current === 'securityLounge' ? 'security'
    : inLounge(camera.position) ? 'securityLounge' : 'security';
  // the 4K button: the robot's picture; pressed again, the robot itself at work
  const slowmo = () => director.current === 'slowmo' ? 'robot' : 'slowmo';
  for (const b of ui.views) b.addEventListener('click', () => { director.setAuto(false); const v = b.dataset.view; director.go(v === 'security' ? security() : v === 'slowmo' ? slowmo() : v); });
  // the recording's clock, as burnt into a CCTV picture
  setInterval(() => { if (document.body.classList.contains('cctv')) document.getElementById('cctvTime').textContent = new Date().toLocaleString('en-GB', { timeZone: 'Europe/Vienna', hour12: false }).replace(',', ''); }, 500);
  for (const b of ui.looks) b.addEventListener('click', () => setLook(b.dataset.look));
  // the camera and light menus: one open at a time; a choice, Escape or a click elsewhere closes it
  const menus = ['view', 'look'].map(k => [document.getElementById(k + 'Menu'), document.getElementById(k + 'MenuBtn')]);
  const closeMenus = () => { for (const [m, btn] of menus) { m.hidden = true; btn.setAttribute('aria-expanded', 'false'); } };
  for (const [m, btn] of menus) {
    btn.addEventListener('click', () => {
      const open = m.hidden; closeMenus();
      if (!open) return;
      m.hidden = false; btn.setAttribute('aria-expanded', 'true');
      (m.querySelector('[aria-pressed="true"]') || m.querySelector('button')).focus({ preventScroll: true });
    });
    m.addEventListener('click', e => { if (e.target.closest('button')) { closeMenus(); btn.focus({ preventScroll: true }); } });
    m.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closeMenus(); btn.focus({ preventScroll: true }); } });
  }
  document.addEventListener('pointerdown', e => { if (!e.target.closest('.pop, .mbtn')) closeMenus(); });
  // "Simulate on air": full screen, on-air lighting, the show's video on the LED wall and broadcast graphics on top
  air = createOnAir({ studio, director, sound, looks: { get: () => look, set: name => setLook(name) }, live: ui.live, reducedMotion, obs: OBS,
    onStart: () => { panels.close(); closeMenus(); sound.dj.stop(); sim = true; setOnAir(true); },
    onEnd: () => { sim = false; setOnAir(false); } });
  ui.onair.addEventListener('click', () => (air.isOpen ? air.close() : air.open()));
  ui.auto.addEventListener('click', () => director.setAuto(!director.auto));
  addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey || /input|select|textarea/i.test(e.target.tagName)) return;
    if (document.body.dataset.piano === 'on') return; // the piano owns the keyboard while it is open
    const i = Number(e.key);
    if (i >= 1 && i <= 9) { director.setAuto(false); director.go(ORDER[i - 1]); }
    else if (e.key === '0') { director.setAuto(false); director.go('guest'); }
    else if (e.key === 'h' || e.key === 'H') { director.setAuto(false); director.go(slowmo()); }
    else if (e.key === 'b' || e.key === 'B') { director.setAuto(false); director.go('backstage'); }
    else if (e.key === 's' || e.key === 'S') { director.setAuto(false); director.go(security()); }
    else if (e.key === 'o' || e.key === 'O') ui.onair.click();
    else if (e.key === 'a' || e.key === 'A') ui.auto.click();
    else if (e.key === 'l' || e.key === 'L') { const keys = Object.keys(LOOKS); setLook(keys[(keys.indexOf(look) + 1) % keys.length]); }
  });
  canvas.addEventListener('pointerdown', () => ui.hint.classList.add('gone'), { once: true });

  /* ----- click or tap an object to fly to it (desk, chairs, LED wall and logo, music station, cameras, crane) ----- */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const focusAt = (x, y) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    for (const hit of ray.intersectObject(studio.root, true)) {
      if (!hit.object.visible || hit.object.material?.isShaderMaterial) continue; // light beams are not objects
      let o = hit.object;
      while (o && !o.userData.focus) o = o.parent;
      return o ? o.userData.focus : null;   // the first solid thing under the pointer decides
    }
    return null;
  };
  let downAt = null;
  canvas.addEventListener('pointerdown', e => { downAt = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  canvas.addEventListener('pointerup', e => {
    if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6 || performance.now() - downAt.t > 450) return; // a drag, not a tap
    const view = focusAt(e.clientX, e.clientY);
    if (view) { director.setAuto(false); director.go(view); }
    // the music station and the grand open the music panel (the grand on its existing Piano tab). On a touch screen the
    // browser still sends a click after the tap, which would land on the panel just opened (on a phone it covers the
    // lower half): so the panel opens with that click, or shortly after the tap if no click comes
    const tab = view === 'music' ? [] : view === 'piano' ? ['piano'] : null;
    if (!tab) return;
    clearTimeout(panelTimer);
    pendingPanel = () => { pendingPanel = null; clearTimeout(panelTimer); panels.open('station', ...tab); };
    panelTimer = setTimeout(() => pendingPanel?.(), e.pointerType === 'mouse' ? 0 : 400);
  });
  let pendingPanel = null, panelTimer = 0;
  canvas.addEventListener('click', () => { if (pendingPanel) setTimeout(() => pendingPanel?.(), 0); });
  let hoverQueued = false;
  canvas.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || e.buttons || hoverQueued) return;
    hoverQueued = true;
    requestAnimationFrame(() => { hoverQueued = false; canvas.style.cursor = focusAt(e.clientX, e.clientY) ? 'pointer' : ''; });
  });
  setTimeout(() => ui.hint.classList.add('gone'), 9000);

  /* ----- sizing and adaptive quality ----- */
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    // broadcast: the drawing buffer is 1080 lines high whatever the source size (1920 × 1080 in a 16:9 source)
    if (quality.broadcast && h) { dpr = 1080 / h; renderer.setPixelRatio(dpr); composer.setPixelRatio(dpr); }
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.resolution.set(w * quality.bloomScale, h * quality.bloomScale);
    // portrait phones: frame a slightly taller picture and show its lower part, so the set sits higher on screen
    // and the ceiling takes less room
    const tall = h > w ? 1.25 : 1;
    camera.aspect = w / (h * tall);
    if (tall > 1) camera.setViewOffset(w, h * tall, 0, h * (tall - 1) * 0.9, w, h); else camera.clearViewOffset();
  }
  addEventListener('resize', resize);
  resize();

  // judge the frame rate only after shaders and textures have settled
  let frames = 0, sampleAt = performance.now() + 4000, downgraded = 0;
  function adapt(now) {
    if (now < sampleAt) { frames = 0; return; }
    frames++;
    if (now - sampleAt < 2500) return;
    const fps = (frames * 1000) / (now - sampleAt);
    frames = 0; sampleAt = now;
    if (document.hidden || fps >= 40 || downgraded > 4 || quality.broadcast) return;
    downgraded++;
    if (dpr > 1) { dpr = Math.max(1, dpr - 0.25); renderer.setPixelRatio(dpr); composer.setPixelRatio(dpr); resize(); }
    else if (ao?.enabled) ao.enabled = false;
    else if (mirror) { scene.remove(mirror); mirror = null; studio.floorOpaque?.(); }
    else bloom.enabled = false;
  }

  /* ----- loop ----- */
  const clock = { elapsed: 0, last: performance.now() };
  // backstage monitors: live feeds of the studio cameras, rendered small and only while someone is in the lounge
  const feeds = studio.lounge.screens.map(({ view, mat }) => {
    const v = VIEWS[view], rt = new THREE.WebGLRenderTarget(384, 216, { type: THREE.HalfFloatType });
    rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
    const cam = new THREE.PerspectiveCamera(v.fov * 0.9, 16 / 9, 0.05, 60);
    cam.position.set(...v.pos); cam.lookAt(...v.target);
    mat.map = rt.texture; mat.color.setScalar(1.15); mat.needsUpdate = true;
    return { rt, cam };
  });
  let feedAt = 0, loungeOn = null;
  // the desk's confidence monitors: the programme (the shot on air), small, 8 times a second, only in the studio
  const deskRT = new THREE.WebGLRenderTarget(320, 180, { type: THREE.HalfFloatType });
  deskRT.texture.colorSpace = THREE.LinearSRGBColorSpace;
  const deskCam = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 60);
  for (const mat of studio.deskScreens || []) { mat.map = deskRT.texture; mat.color.setScalar(1); mat.needsUpdate = true; }
  let deskAt = 0; const DESK_AT = new THREE.Vector3(0, 1, -1.5);
  // the studio cameras' viewfinders show their own live pictures: one camera per frame, in turn, about 20 times a
  // second in all, and only while the viewer is near the cameras (from further away the screens are a few pixels)
  let vfAt = 0, vfNext = 0;
  const camSpot = studio.cams.map(c => (c.group || c.head).getWorldPosition(new THREE.Vector3()));   // (the jib's camera has only its head)
  const nearCams = p => camSpot.some(q => q.distanceTo(p) < 7);
  // slow motion: on the high-speed camera's shot the set's own time (lights, wall, logo, beams) eases down to its time scale
  let slowK = 1, setTime = 0;
  let wallAccum = 0;
  const wallStep = 1 / quality.wallFps;
  const lerp = (a, b, k) => a + (b - a) * k;

  let avgDt = 1 / 60;
  function frame(now) {
    const dt = Math.min(0.1, (now - clock.last) / 1000);
    clock.last = now;
    clock.elapsed += dt;
    const t = clock.elapsed;

    // lighting eases towards the current look; keys come up a little faster than the rest, like dimmers on a desk
    const goal = target();
    for (const k of Object.keys(goal)) L[k] = lerp(L[k] ?? goal[k], goal[k], 1 - Math.exp(-dt * (k === 'key' ? 3.2 : 1.8)));

    if (onAir && look !== 'music' && t - programmeAt > PROGRAMME[programmeIndex][1]) {
      programmeIndex = (programmeIndex + 1) % PROGRAMME.length; programmeAt = t;
      setWall(PROGRAMME[programmeIndex][0]);
    }
    if (onAir && look === 'music' && studio.wall.program !== 'wave') setWall('wave');

    // the studio listens: fast attack, slower release, like a light desk's sound-to-light
    const a = sound.levels(), d0 = sound.dj.deck(0), d1 = sound.dj.deck(1), playing = sound.state.playing || d0.playing || d1.playing;
    // the booth plays along with its two decks: the playing deck's platter turns, the faders sit where the visitor put them
    L.djA = d0.playing ? 1 : 0; L.djB = d1.playing ? 1 : 0; L.djOn = L.djA || L.djB; L.djVA = d0.vol; L.djVB = d1.vol; L.djX = sound.dj.xf;
    L.aOn = lerp(L.aOn, a.on, 1 - Math.exp(-dt * 2.5));
    for (const [k, v] of [['aBass', a.bass], ['aMid', a.mid], ['aHigh', a.high], ['aLevel', a.level]]) L[k] = v > L[k] ? lerp(L[k], v, 0.65) : lerp(L[k], v, 1 - Math.exp(-dt * 7));
    studio.wall.spectrum(a.on ? sound.bins : null);
    if (!onAir && playing && studio.wall.program === 'idle') studio.wall.set('wave');      // the wall becomes the visualiser
    if (!onAir && !playing && studio.wall.program === 'wave') studio.wall.set('idle');

    slowK = lerp(slowK, VIEWS[director.current]?.slow ?? 1, 1 - Math.exp(-dt * 2.5));
    const sdt = dt * slowK; setTime += sdt;
    document.body.classList.toggle('slowmo', slowK < 0.6);
    wallAccum += sdt;
    if (studio.wall.program === 'film' ? studio.wall.fresh() : wallAccum >= wallStep) { studio.wall.draw(setTime, wallAccum); wallAccum = 0; }
    const robotShot = director.current === 'slowmo';
    studio.robot.active = robotShot || director.current === 'robot';
    studio.update(setTime, sdt, L, director.tally());
    scene.environmentIntensity = 0.8 * (1 - 0.45 * L.solo);   // the lacquer reflects a darker room too
    bloom.strength = 0.62 * (1 - 0.55 * L.solo);              // and the warm keys stay keys, not a neon bar

    // a single slow frame (a hitch) is not passed on to the camera in full: it carries on smoothly instead of jumping
    // ahead. A machine that is slow all the time keeps its own pace (its average), so moves never turn slow motion
    avgDt += (dt - avgDt) * 0.05;
    director.update(Math.min(dt, avgDt * 2), now);
    if (director.walking) camera.lookAt(controls.target); else controls.update(dt);   // walking: no orbit limits, just look ahead
    // the slow-mo shot is the robot's own camera: the picture follows its lens through the programme of moves
    if (robotShot) { camera.position.copy(studio.robot.shot.pos); controls.target.copy(studio.robot.shot.target); camera.lookAt(controls.target); }
    ext?.update(dt, t);
    camera.fov = screenFov(lens.fov, camera.aspect);
    camera.updateProjectionMatrix();

    if (studio.deskScreens?.length && t - deskAt > 0.125 && camera.position.distanceTo(DESK_AT) < 16 && studio.root.visible) {
      deskAt = t; deskCam.position.copy(camera.position); deskCam.quaternion.copy(camera.quaternion); deskCam.fov = camera.fov; deskCam.updateProjectionMatrix();
      renderer.setRenderTarget(deskRT); renderer.render(scene, deskCam); renderer.setRenderTarget(null);
    }
    const here = inLounge(camera.position) || nearLounge(camera.position);
    if (here) studio.lounge.door(camera.position, dt);
    if (here !== loungeOn) { loungeOn = here; studio.lounge.light(here); }
    if (here && t - feedAt > 0.1) {
      feedAt = t;
      for (const f of feeds) { renderer.setRenderTarget(f.rt); renderer.render(scene, f.cam); }
      renderer.setRenderTarget(null);
    }
    if (t - vfAt > 0.05 && nearCams(camera.position)) { vfAt = t; studio.viewfinders.update(renderer, scene, vfNext++); }
    cctvPass.uniforms.uTime.value = t;
    composer.render(dt);
    adapt(now);
    raf = requestAnimationFrame(frame);
  }

  const ext = extend ? extend({ renderer, scene, camera, controls, director, studio, quality, reducedMotion, get air() { return air; }, get onAir() { return onAir; }, setAfterShow, get afterShow() { return after; }, panels, sound }) : null;

  // warm up: draw the wall once and compile shaders before revealing
  studio.wall.set('idle');
  studio.wall.draw(0, 1);
  studio.update(0, 0, L, 2);
  await renderer.compileAsync(scene, camera);
  // and everything that is hidden until it is needed (the DJ room below, the stage's parts, the effects): its shaders
  // compiled now, not on the frame it first appears (that frame would stall). Lights stay as they are
  const hiddenNow = [];
  scene.traverse(o => { if (!o.visible && !o.isLight) { hiddenNow.push(o); o.visible = true; } });
  try { await renderer.compileAsync(scene, camera); } catch {}
  for (const o of hiddenNow) o.visible = false;
  progress(1);

  let raf = requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else if (!videoOnly) { clock.last = performance.now(); raf = requestAnimationFrame(frame); }
  });

  /* ----- OBS: a clean picture at once, the live 3D studio's on-air simulation or the rendered video. Which one is
     chosen in the Broadcast Studio, which sets this page's address on its OBS browser source ----- */
  let videoOnly = false;
  if (OBS) {
    document.body.classList.add('obs');
    if (OBS.play === 'video') {
      videoOnly = true; cancelAnimationFrame(raf);                          // the 3D studio rests while the video plays
      const v = document.createElement('video');
      v.className = 'obs-video'; v.src = PRESHOW; v.playsInline = true; v.preload = 'auto';
      document.body.append(v);
      v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });   // a browser that refuses sound still shows it
      // it ends on its last frame, the clean logo card, for the switch to the live cameras
    } else air.open();                                                    // play=live, and the default
  }

  // opening move: from the crane down to the wide shot, then the auto tour takes over
  ui.status.textContent = 'Off air · studio preview';
  setLook('broadcast');
  director.go('studio');
  director.setAuto(!reducedMotion);

  return { renderer, scene, camera, controls, director, studio, sound, panels, setOnAir, setLook, air, ext, studioProbes };
}
