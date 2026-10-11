// DISTANCE // ZERO virtual studio: renderer, quality tiers, lighting looks, the simulated on-air sequence
// and the page controls. Purely a visual experience: it connects to nothing and broadcasts nothing.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { buildStudio } from './set.js';
import { createDirector, VIEWS, ORDER } from './views.js';

/* lighting looks. `onAir` scales most of it; off air the studio sits under dim work light */
const LOOKS = {
  broadcast: { key: 1, warm: 1, cool: 1, rim: 0.8, amber: 1, ice: 1, accent: 1, fins: 0.75, beams: 0.1, music: 0 },
  vienna: { key: 1, warm: 1.12, cool: 0.7, rim: 0.95, amber: 1.4, ice: 0.4, accent: 1, fins: 0.9, beams: 0.16, music: 0 },
  melbourne: { key: 1, warm: 0.72, cool: 1.12, rim: 0.95, amber: 0.4, ice: 1.4, accent: 1, fins: 0.9, beams: 0.16, music: 0 },
  music: { key: 0.55, warm: 0.9, cool: 0.95, rim: 1.25, amber: 1.2, ice: 1.2, accent: 1.15, fins: 1.25, beams: 0.85, music: 1 },
};
const OFF = { key: 0.36, rim: 0.35, accent: 0.42, fins: 0.45, beams: 0, wall: 0.4, house: 1, onAir: 0 };
const ON = { wall: 1, house: 0.2, onAir: 1 };
const PROGRAMME = [['cities', 15], ['presenters', 11], ['wave', 10]];

// what the shiny surfaces reflect: a dark studio with a softbox overhead, the LED wall, key lights and the
// amber (Vienna) and ice (Melbourne) light strips. Much closer to the set than a generic bright room.
function studioEnvironment() {
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

export async function start({ canvas, ui, quality, progress = () => {} }) {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ----- renderer ----- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality.dpr < 2, powerPreference: 'high-performance', stencil: false });
  let dpr = quality.dpr;
  renderer.setPixelRatio(dpr);
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
  const studio = buildStudio({ scene, quality });
  progress(0.7);

  let mirror = null;
  if (quality.reflections) {
    mirror = new Reflector(new THREE.CircleGeometry(26, 64), { clipBias: 0.003, textureWidth: 1024, textureHeight: 1024, color: 0x6a6d73 });
    mirror.rotation.x = -Math.PI / 2;
    mirror.position.y = -0.002;
    scene.add(mirror);
  }

  /* ----- post ----- */
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(dpr);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.62, 0.55, 0.86);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

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
  const director = createDirector({
    camera, lens, controls, reducedMotion,
    onView: name => {
      for (const b of ui.views) b.setAttribute('aria-pressed', String(b.dataset.view === name));
      ui.shot.textContent = name ? VIEWS[name].long : 'Free camera';
      showTally();
    },
    onAuto: on => { ui.auto.setAttribute('aria-pressed', String(on)); ui.auto.querySelector('span').textContent = on ? 'Auto camera on' : 'Auto camera off'; },
  });

  /* ----- state: look, on/off air (simulation only) ----- */
  let look = 'broadcast', onAir = false, sim = false, countdownTimer = 0, programmeAt = 0, programmeIndex = 0;
  const L = { ...LOOKS.broadcast, ...OFF, warm: 1, cool: 1, amber: 1, ice: 1, music: 0 };
  const target = () => {
    const base = { ...LOOKS[look] };
    if (!onAir) return { ...base, key: base.key * OFF.key, rim: base.rim * OFF.rim, accent: base.accent * OFF.accent, fins: base.fins * OFF.fins, beams: 0, wall: OFF.wall, house: OFF.house, onAir: 0, music: base.music * 0.3 };
    return { ...base, ...ON };
  };

  function showTally() {
    const n = director.tally();
    ui.cam.textContent = onAir ? (n === 4 ? 'JIB' : `CAM ${n}`) : 'CAM —';
  }

  function setLook(name) {
    look = name;
    for (const b of ui.looks) b.setAttribute('aria-pressed', String(b.dataset.look === name));
    if (onAir) studio.wall.set(name === 'music' ? 'wave' : PROGRAMME[programmeIndex][0]);
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
    let n = reducedMotion ? 0 : 3;
    const step = () => {
      if (n > 0) { studio.wall.countdown(n); ui.count.hidden = false; ui.count.textContent = String(n); n--; return; }
      clearInterval(countdownTimer);
      studio.wall.countdown(0); ui.count.hidden = true;
      onAir = true;
      programmeIndex = 0; programmeAt = clock.elapsed;
      studio.wall.set(look === 'music' ? 'wave' : PROGRAMME[0][0]);
      ui.status.textContent = 'Simulated on air';
      ui.live.textContent = 'Simulated on-air lighting. Nothing is being broadcast.';
      showTally();
    };
    step();
    if (!reducedMotion) countdownTimer = setInterval(step, 800);
  }

  /* ----- UI wiring ----- */
  for (const b of ui.views) b.addEventListener('click', () => { director.setAuto(false); director.go(b.dataset.view); });
  for (const b of ui.looks) b.addEventListener('click', () => setLook(b.dataset.look));
  ui.onair.addEventListener('click', () => { sim = !sim; setOnAir(sim); });
  ui.auto.addEventListener('click', () => director.setAuto(!director.auto));
  addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey || /input|select|textarea/i.test(e.target.tagName)) return;
    const i = Number(e.key);
    if (i >= 1 && i <= ORDER.length) { director.setAuto(false); director.go(ORDER[i - 1]); }
    else if (e.key === 'o' || e.key === 'O') ui.onair.click();
    else if (e.key === 'a' || e.key === 'A') ui.auto.click();
    else if (e.key === 'l' || e.key === 'L') { const keys = Object.keys(LOOKS); setLook(keys[(keys.indexOf(look) + 1) % keys.length]); }
  });
  canvas.addEventListener('pointerdown', () => ui.hint.classList.add('gone'), { once: true });
  setTimeout(() => ui.hint.classList.add('gone'), 9000);

  /* ----- sizing and adaptive quality ----- */
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
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
    if (document.hidden || fps >= 40 || downgraded > 4) return;
    downgraded++;
    if (dpr > 1) { dpr = Math.max(1, dpr - 0.25); renderer.setPixelRatio(dpr); composer.setPixelRatio(dpr); resize(); }
    else if (mirror) { scene.remove(mirror); mirror = null; studio.floorOpaque?.(); }
    else bloom.enabled = false;
  }

  /* ----- loop ----- */
  const clock = { elapsed: 0, last: performance.now() };
  let wallAccum = 0;
  const wallStep = 1 / quality.wallFps;
  const lerp = (a, b, k) => a + (b - a) * k;

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
      studio.wall.set(PROGRAMME[programmeIndex][0]);
    }
    if (onAir && look === 'music' && studio.wall.program !== 'wave') studio.wall.set('wave');

    wallAccum += dt;
    if (wallAccum >= wallStep) { studio.wall.draw(t, wallAccum); wallAccum = 0; }
    studio.update(t, dt, L, director.tally());

    director.update(dt, now);
    controls.update(dt);
    camera.fov = screenFov(lens.fov, camera.aspect);
    camera.updateProjectionMatrix();

    composer.render(dt);
    adapt(now);
    raf = requestAnimationFrame(frame);
  }

  // warm up: draw the wall once and compile shaders before revealing
  studio.wall.set('idle');
  studio.wall.draw(0, 1);
  studio.update(0, 0, L, 2);
  await renderer.compileAsync(scene, camera);
  progress(1);

  let raf = requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else { clock.last = performance.now(); raf = requestAnimationFrame(frame); }
  });

  // opening move: from the crane down to the wide shot, then the auto tour takes over
  ui.status.textContent = 'Off air · studio preview';
  setLook('broadcast');
  director.go('studio');
  director.setAuto(!reducedMotion);

  return { renderer, scene, camera, controls, director, studio, setOnAir, setLook };
}
