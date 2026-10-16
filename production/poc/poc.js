// Proof of concept: two realistic presenters (Microsoft Rocketbox avatars, MIT licence, motion-captured
// animation) walk into the approved studio, sit down at the desk and settle, under a slow overhead camera.
// Deterministic: everything is a function of time t, so the same code plays live and renders frame by frame.
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { buildStudio, RISER } from '../../virtual-studio/set.js';
import { LOOKS, ON, studioEnvironment } from '../../virtual-studio/main.js';

const SRC = '../avatars/source/', WEB = '../avatars/web/';
const DURATION = 16;
const smooth = t => t * t * (3 - 2 * t);
const clamp01 = t => Math.min(1, Math.max(0, t));

/* ---------- presenters ---------- */

const PRESENTERS = {
  andy: {
    model: 'Male_Adult_16/Male_Adult_16', tex: 'm019', body: 'm019_body_color_black', scale: 0.0104, // 1.81 m → 1.88 m
    clips: { start: 'xy/m_walk_start', loop: 'xy/m_walk_neutral_01', stop: 'xy/m_walk_stop', sit: 'm_sit_down_chair_01' },
    // from behind the Vienna pylon, left of his chair, to the spot in front of the seat
    path: [[-5.0, -4.8], [-3.3, -3.6], [-1.78, -2.4], [-1.45, -1.62], [-0.95, -1.45]], // last point = measured mark
    seat: [-0.95, -1.93],
    delay: 0.4,
  },
  georgie: {
    model: 'Female_Adult_05/Female_Adult_05', tex: 'f005', body: 'f005_body_color_black', scale: 0.01, opacity: true,
    clips: { start: 'xy/f_walk_start', loop: 'xy/f_walk_neutral_01', stop: 'xy/f_walk_stop', sit: 'f_sit_down_chair_01' },
    path: [[5.0, -4.8], [3.3, -3.6], [1.78, -2.4], [1.45, -1.62], [0.95, -1.47]],
    seat: [0.95, -1.93],
    delay: 1.2,
  },
};
const SEAT_TOP = RISER + 0.56;      // studio chair seat surface
const FADE = 0.2, SIT_FADE = 0.35;

function loadFBX(url) {
  return new Promise((resolve, reject) => new FBXLoader().load(url, resolve, undefined, reject));
}

async function loadPresenter(key, texLoader, quality) {
  const P = PRESENTERS[key];
  const tex = (name, srgb = true) => {
    const t = texLoader.load(WEB + name);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  const [model, ...clipModels] = await Promise.all([loadFBX(SRC + P.model + '.fbx'), ...Object.values(P.clips).map(c => loadFBX(SRC + 'anim/' + c + '.fbx'))]);

  // materials: physically based, our recoloured wardrobe, normal maps, alpha-tested hair/lashes
  const mats = {
    body: new THREE.MeshStandardMaterial({ map: tex(P.body + '.jpg'), normalMap: tex(P.tex + '_body_normal.png', false), roughness: 0.78, metalness: 0 }),
    head: new THREE.MeshStandardMaterial({ map: tex(P.tex + '_head_color.jpg'), normalMap: tex(P.tex + '_head_normal.png', false), roughness: 0.55, metalness: 0 }),
  };
  if (P.opacity) mats.opacity = new THREE.MeshStandardMaterial({ map: tex(P.tex + '_opacity_color.png'), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.6 });
  model.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    o.frustumCulled = false;
    const pick = m => (/opacity/.test(m.name) ? mats.opacity : /head/.test(m.name) ? mats.head : mats.body);
    o.material = Array.isArray(o.material) ? o.material.map(pick) : pick(o.material);
  });
  model.scale.setScalar(P.scale);

  const group = new THREE.Group();
  group.add(model);
  const mixer = new THREE.AnimationMixer(model);

  // clips: keep the original root track for measuring distance, then take forward travel out of the walk
  // clips (the path moves the presenter instead, at exactly the speed the feet travel)
  const names = Object.keys(P.clips), clips = {}, rootZ = {};
  clipModels.forEach((m, i) => {
    const clip = m.animations[0], name = names[i];
    const root = clip.tracks.find(t => t.name === 'Bip01.position');
    rootZ[name] = root.clone().createInterpolant();
    if (name !== 'sit') for (let k = 2; k < root.values.length; k += 3) root.values[k] = 0;
    clips[name] = { clip, action: mixer.clipAction(clip), dur: clip.duration };
  });
  const travelled = (name, t) => rootZ[name].evaluate(Math.min(t, clips[name].dur))[2] * P.scale;
  const dist = name => travelled(name, clips[name].dur);

  const bones = {};
  model.traverse(o => { if (o.isBone) bones[o.name] = o; });
  // measure, don't assume: where does the pelvis end up, relative to the standing mark, after sitting down?
  for (const c of Object.values(clips)) { c.action.play(); c.action.setEffectiveWeight(0); }
  clips.sit.action.setEffectiveWeight(1); clips.sit.action.time = clips.sit.dur - 1e-4;
  mixer.update(0); group.updateMatrixWorld(true);
  const sitOffset = bones.Bip01_Pelvis.getWorldPosition(new THREE.Vector3());
  // the mark to stop on, so the pelvis lands over the middle of this presenter's seat
  const seat = new THREE.Vector3(P.seat[0], 0, P.seat[1]);
  const mark = new THREE.Vector3(seat.x - sitOffset.x, 0, seat.z - sitOffset.z);
  const pts = P.path.map(([x, z]) => new THREE.Vector3(x, 0, z));
  pts[pts.length - 1] = mark;
  const path = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const L = path.getLength();
  const loops = Math.max(1, Math.round((L - dist('start') - dist('stop')) / dist('loop')));
  const D = dist('start') + loops * dist('loop') + dist('stop');
  const k = L / D;

  // timeline
  const seg = [];
  let at = P.delay;
  seg.push({ name: 'start', at, dur: clips.start.dur }); at += clips.start.dur;
  seg.push({ name: 'loop', at, dur: loops * clips.loop.dur }); at += loops * clips.loop.dur;
  seg.push({ name: 'stop', at, dur: clips.stop.dur }); at += clips.stop.dur;
  seg.push({ name: 'sit', at, dur: clips.sit.dur }); at += clips.sit.dur;
  const sitAt = seg[3].at, seatedAt = at;

  const end = path.getPoint(1), tmp = new THREE.Vector3(), tan = new THREE.Vector3();
  const finalHeading = 0; // facing the desk and cameras (+z)
  const seatLift = SEAT_TOP + 0.09 - (RISER + sitOffset.y);     // hip joint ~9 cm above our (taller) seat

  function distanceAt(t) {
    let d = 0;
    for (const s of seg.slice(0, 3)) {
      const lt = clamp01((t - s.at) / s.dur) * s.dur;
      if (s.name === 'loop') { const n = Math.floor(lt / clips.loop.dur); d += n * dist('loop') + travelled('loop', lt - n * clips.loop.dur); }
      else d += travelled(s.name, lt);
    }
    return Math.min(L, Math.max(0, d * k));
  }

  function pose(t) {
    // weights and times of each action, with short crossfades between segments
    // stateless: every frame starts from a reset mixer, so a pose depends only on t (frame order never matters)
    mixer.stopAllAction();
    for (const c of Object.values(clips)) { c.action.reset(); c.action.play(); c.action.setEffectiveWeight(0); }
    const i = Math.max(0, seg.findLastIndex(s => t >= s.at));
    const cur = seg[i], lt = Math.max(0, t - cur.at);
    const set = (s, local, w) => {
      const c = clips[s.name];
      c.action.time = s.name === 'loop' ? local % c.dur : Math.min(local, c.dur - 1e-4);
      c.action.setEffectiveWeight(w);
    };
    const fade = cur.name === 'sit' ? SIT_FADE : FADE;
    if (i > 0 && lt < fade) {
      const w = smooth(lt / fade), prev = seg[i - 1];
      set(prev, t - prev.at, 1 - w);
      set(cur, lt, w);
    } else set(cur, lt, 1);
    mixer.update(0);

    // where the presenter stands and which way they face
    const d = distanceAt(t);
    if (t < sitAt) {
      const u = clamp01(d / L);
      path.getPointAt(u, tmp);
      path.getTangentAt(Math.min(u, 0.999), tan);
      let heading = Math.atan2(tan.x, tan.z);
      // in the last steps, turn to face the desk so the sit-down goes straight back into the chair
      const turn = smooth(clamp01((t - (seg[2].at + seg[2].dur - 1.1)) / 1.1));
      heading += (finalHeading - heading) * turn;
      group.rotation.y = heading;
      group.position.set(tmp.x, onRiser(tmp.x, tmp.z), tmp.z);
    } else {
      group.rotation.y = finalHeading;
      const lift = seatLift * smooth(clamp01((t - sitAt - clips.sit.dur * 0.45) / (clips.sit.dur * 0.5)));
      group.position.set(end.x, RISER + lift, end.z);
    }
    // seated life: breathing and small head movements, layered on top of the final sitting pose
    if (t > seatedAt - 0.5) {
      const w = smooth(clamp01((t - seatedAt + 0.5) / 1.2)), ph = key === 'andy' ? 0 : 1.7;
      bones.Bip01_Spine1 && (bones.Bip01_Spine1.rotation.z += Math.sin(t * 1.6 + ph) * 0.012 * w);
      bones.Bip01_Head && (bones.Bip01_Head.rotation.y += Math.sin(t * 0.37 + ph) * 0.12 * w);
      bones.Bip01_Head && (bones.Bip01_Head.rotation.z += Math.sin(t * 0.23 + ph) * 0.04 * w);
    }
  }
  return { group, pose, info: { path: +L.toFixed(2), loops, slide: +((k - 1) * 100).toFixed(1), seatedAt: +seatedAt.toFixed(2), sitOffset: sitOffset.toArray().map(v => +v.toFixed(2)), mark: [+mark.x.toFixed(2), +mark.z.toFixed(2)] } };
}

// the stage riser: step up when inside its radius (smoothed over one stride)
function onRiser(x, z) {
  const r = Math.hypot(x, z + 1.9);
  return RISER * smooth(clamp01((3.45 - r) / 0.35));
}

/* ---------- overhead camera ---------- */

const CAM = {
  // starts straight down over the desk, turns and lowers to a high angle from behind the presenters
  // (faces stay hidden), ending in front of the hanging logo, never above it
  pos: new THREE.CatmullRomCurve3([new THREE.Vector3(0.02, 6.3, -1.85), new THREE.Vector3(2.2, 6.0, -3.0), new THREE.Vector3(1.3, 5.7, -4.3), new THREE.Vector3(0.3, 5.3, -4.75)]),
  target: new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, -1.9), new THREE.Vector3(0, 0.4, -1.8), new THREE.Vector3(0, 0.8, -0.6), new THREE.Vector3(0, 0.9, 0.6)]),
};
const DEBUG_VIEWS = { side: [[4.2, 1.6, -0.6], [0, 0.9, -1.8]], front: [[0, 1.6, 2.4], [0, 1.0, -1.8]] };
function cameraAt(camera, t) {
  const dbg = DEBUG_VIEWS[new URLSearchParams(location.search).get('view')];
  if (dbg) { camera.position.set(...dbg[0]); camera.lookAt(...dbg[1]); return; } // checking only, not part of the shot
  const u = smooth(clamp01(t / DURATION));
  camera.position.copy(CAM.pos.getPoint(u));
  camera.lookAt(CAM.target.getPoint(u));
}

/* ---------- boot ---------- */

export async function start({ canvas, width, height, progress = () => {}, realtime = true }) {
  const mobile = /quality=low/.test(location.search);
  const quality = mobile
    ? { mobile: true, dpr: 1.5, shadowSize: 1024, shadows2: false, reflections: false, glass: false, bloomScale: 0.5, wall: { width: 1280, height: 538 }, wallFps: 20 }
    : { mobile: false, dpr: 1, shadowSize: 2048, shadows2: true, reflections: true, glass: true, bloomScale: 0.75, wall: { width: 2048, height: 860 }, wallFps: 30 };
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !realtime });
  renderer.setPixelRatio(realtime ? Math.min(devicePixelRatio, quality.dpr === 1 ? 1.75 : 1.5) : 1);
  renderer.setSize(width, height, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  RectAreaLightUniformsLib.init();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x040507);
  scene.fog = new THREE.FogExp2(0x040507, 0.024);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studioEnvironment(), 0.02).texture;
  scene.environmentIntensity = 0.8;
  const camera = new THREE.PerspectiveCamera(46, width / height, 0.05, 80);

  const studio = buildStudio({ scene, quality, guest: false });
  if (quality.reflections) {
    const mirror = new Reflector(new THREE.CircleGeometry(26, 64), { clipBias: 0.003, textureWidth: 1024, textureHeight: 1024, color: 0x6a6d73 });
    mirror.rotation.x = -Math.PI / 2; mirror.position.y = -0.002; scene.add(mirror);
  }
  progress(0.3);

  const texLoader = new THREE.TextureLoader();
  const people = await Promise.all(['andy', 'georgie'].map(k => loadPresenter(k, texLoader, quality)));
  people.forEach(p => scene.add(p.group));
  progress(0.9);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(width * quality.bloomScale, height * quality.bloomScale), 0.62, 0.55, 0.86));
  composer.addPass(new OutputPass());
  composer.setSize(width, height);

  // studio lighting: the approved broadcast look, on air
  const L = { ...LOOKS.broadcast, ...ON, solo: 0, aOn: 0, aBass: 0, aMid: 0, aHigh: 0, aLevel: 0 };   // silent set, no piano solo
  studio.wall.set('cities');

  let last = 0;
  function frame(t, dt) {
    studio.wall.draw(t, dt);
    studio.update(t, dt, L, 0);
    for (const p of people) p.pose(t);
    cameraAt(camera, t);
    composer.render(dt);
  }
  // warm up
  frame(0, 1 / 30);
  await renderer.compileAsync(scene, camera);
  progress(1);

  const api = {
    duration: DURATION, info: people.map(p => p.info), renderer, scene, camera,
    seek(t) { frame(t, Math.max(1 / 60, t - last)); last = t; },
    grab(type = 'image/jpeg', q = 0.92) { return canvas.toDataURL(type, q); }, // straight from the WebGL canvas
    resize(w, h) { renderer.setSize(w, h, false); composer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); },
  };
  if (realtime) {
    const t0 = performance.now();
    let prev = t0, frames = 0, fpsAt = t0;
    const loop = now => {
      const t = ((now - t0) / 1000) % (DURATION + 2);
      frame(Math.min(t, DURATION), (now - prev) / 1000);
      prev = now; frames++;
      if (now - fpsAt > 1000) { api.fps = Math.round(frames * 1000 / (now - fpsAt)); frames = 0; fpsAt = now; }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  return api;
}
