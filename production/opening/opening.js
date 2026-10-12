// DISTANCE // ZERO — Episode 001 opening, 90 s. The approved studio, two presenters and two crew, a lighting
// timeline and six camera setups. Everything is a function of t, so the preview and the offline render agree.
// The audio (the official jingles) is added later: see CUES for the sync points.
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { buildStudio, RISER, SEATS } from '../../virtual-studio/set.js';
import { LOOKS, studioEnvironment } from '../../virtual-studio/main.js';
import { setClockSource } from '../../virtual-studio/screens.js';
import { createActor, bend, folder, ramp, smooth, clamp01, lerpAngle } from '../lib/actors.js';

export const DURATION = 90;
// the approved 3D logo after the key visual (kv), with a calmer bloom on the final reveal (80–90 s); logo=v1 shows the first version
const LOGO = new URLSearchParams(location.search).get('logo') || 'kv';
const BLOOM = LOGO === 'kv' ? [[0, 0.62], [80, 0.62], [83, 0.3]] : [[0, 0.62]];
const FREEZE = 88.5;                       // from here every frame is identical: a clean frame for OBS
const SEAT_TOP = RISER + 0.56;
const SHOW_START = Date.UTC(2027, 0, 27, 9, 0, 0); // 10:00 Vienna (CET = UTC+1) on 27 Jan 2027
const V = THREE.Vector3;

/* ---------- sync points for the audio (seconds) ---------- */
export const CUES = [
  { t: 0.0, id: 'start', label: 'Black. Studio asleep' },
  { t: 3.0, id: 'worklights', label: 'Work lights on' },
  { t: 3.6, id: 'keys', label: 'Key lights up (hit)' },
  { t: 6.0, id: 'accents', label: 'LED strips sweep on' },
  { t: 9.5, id: 'wall', label: 'LED wall: Vienna / Melbourne' },
  { t: 15.0, id: 'cut-crew', label: 'Cut: crew prepares the studio' },
  { t: 24.2, id: 'papers', label: 'Folder placed on the desk' },
  { t: 30.0, id: 'cut-andy', label: "Cut: Andy'K enters (follow)" },
  { t: 40.5, id: 'cut-georgie', label: 'Cut: Georgie enters (follow)' },
  { t: 50.0, id: 'cut-desk', label: 'Cut: presenters sit (reverse angle)' },
  { t: 65.0, id: 'rise', label: 'Camera rises above and behind' },
  { t: 80.0, id: 'cut-logo', label: 'Cut: final lighting transition, push to logo' },
  { t: 83.0, id: 'beams', label: 'Beams open' },
  { t: 88.5, id: 'clean', label: 'Clean frame: hold for the switch to live cameras' },
  { t: 90.0, id: 'end', label: 'End' },
];

/* ---------- lighting timeline ---------- */
// each parameter is a list of [time, value]; values ease between keys
const LIGHT = {
  house: [[0, 0], [1.5, 0], [3.0, 0.55], [11, 0.55], [14, 0.2], [80, 0.2], [83, 0.04]],
  // keys dip whenever the camera looks from behind the desk (50–80): they only light faces we never see there,
  // and would otherwise wrap round the chair edges and glint off the desk straight into the lens
  key: [[0, 0], [3.6, 0], [4.4, 1], [49.9, 1], [50, 0.4], [80, 0.4], [83, 0.4], [86, 0.3]],
  // rims dip for the reverse angle (50–65): from behind the desk they would light the chair backs like neon
  rim: [[0, 0], [5.5, 0], [7.0, 0.8], [49.9, 0.8], [50, 0.35], [65, 0.35], [68, 0.8], [80, 0.8], [83, 1.2]],
  accent: [[0, 0], [6.0, 0], [9.0, 1], [80, 1], [83, 1.15]],
  fins: [[0, 0], [6.0, 0], [9.0, 0.75], [80, 0.75], [83, 1.2], [86, 0.9]],
  wall: [[0, 0], [6.5, 0], [9.5, 1], [80, 1], [83, 0.55], [86, 0.12]],
  beams: [[0, 0], [9, 0], [12, 0.1], [80, 0.1], [83, 0.6], [86, 0.35]],
  music: [[0, 0], [80, 0], [83, 0.5], [86, 0.2]],
  onAir: [[0, 0], [10, 0], [10.2, 1]],
  bloom: BLOOM,
};
function lighting(t) {
  const L = { ...LOOKS.broadcast, aOn: 0, aBass: 0, aMid: 0, aHigh: 0, aLevel: 0 }; // the set's sound-to-light inputs: silent
  for (const [k, keys] of Object.entries(LIGHT)) {
    let v = keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [t0, v0] = keys[i - 1], [t1, v1] = keys[i];
      if (t >= t1) v = v1; else if (t > t0) { v = v0 + (v1 - v0) * smooth((t - t0) / (t1 - t0)); break; } else break;
    }
    L[k] = v;
  }
  return L;
}
const WALL = [[0, 'idle'], [9.5, 'cities'], [60, 'wave'], [84, 'idle']];
const TALLY = [[0, 0], [15, 1], [30, 3], [50, 2], [65, 4], [80, 2]];
const at = (list, t) => list.filter(([s]) => t >= s).pop()[1];

/* ---------- the stage riser: actors step up onto it ---------- */
const riserY = (x, z) => RISER * smooth(clamp01((3.45 - Math.hypot(x, z + 1.9)) / 0.35));

/* ---------- cast and crew ---------- */
async function stageActors(scene, texLoader) {
  const [andy, georgie, assistant, operator] = await Promise.all(['andy', 'georgie', 'assistant', 'operator'].map(k => createActor(k, texLoader)));
  const info = {};

  // presenters: in from opposite sides of the studio, slow natural walk, sit at their own chairs
  const markA = andy.sitMark([SEATS.andy.x, -1.93], SEAT_TOP);
  andy.standAt(-9.5, 3.0, Math.PI);
  info.andy = andy.walk({ path: [[-8.5, -1.5], [-6.0, -3.3], [-3.3, -3.6], [-1.78, -2.4], [-1.45, -1.62], markA], arriveAt: 48.6, gait: 'slow', endHeading: 0, yAt: riserY });
  Object.assign(info.andy, andy.sit({ at: 48.6, floorY: RISER }));
  const markG = georgie.sitMark([SEATS.georgie.x, -1.93], SEAT_TOP);
  georgie.standAt(9.5, 3.0, Math.PI);
  info.georgie = georgie.walk({ path: [[6.0, 1.0], [4.8, -2.2], [3.3, -3.6], [1.78, -2.4], [1.45, -1.62], markG], arriveAt: 49.8, gait: 'slow', endHeading: 0, yAt: riserY });
  Object.assign(info.georgie, georgie.sit({ at: 49.8, floorY: RISER }));

  // assistant: brings a folder to the desk between the chairs, turns and leaves the way she came
  assistant.standAt(5.4, -5.3, -1.0);
  info.assistant = assistant.walk({ path: [[3.2, -3.6], [1.9, -2.75], [0.55, -2.55], [0.05, -2.0], [0, -1.58]], arriveAt: 22.8, endHeading: 0, yAt: riserY });
  const turn = assistant.turn180({ at: 25.6 });
  info.assistant.exit = assistant.walk({ path: [[0.7, -2.7], [2.2, -3.1], [3.7, -4.5], [5.3, -6.3]], at: turn.end - 0.25, startClip: false, yAt: riserY });

  // camera operator: stands behind camera 1 (which holds Georgie), takes the pan bars as the studio wakes up
  const cam1 = new V(-4.2, 0, 4.6), aim = new V(SEATS.georgie.x, 0, SEATS.georgie.z);
  const heading = Math.atan2(aim.x - cam1.x, aim.z - cam1.z);
  operator.standAt(cam1.x - Math.sin(heading) * 0.95, cam1.z - Math.cos(heading) * 0.95, heading);
  operator.hold('stop', { at: 0 });

  // --- procedural layers, calibrated on the rig ---
  const fwd = new V(0, 0, 1), up = new V(0, 1, 0), fwdUp = new V(0, 0.45, 1).normalize();
  const cal = (a, t, bone, tip, want) => a.calibrate(t, bone, tip, want);
  const opAx = {
    rUp: cal(operator, 1, 'Bip01_R_UpperArm', 'Bip01_R_Hand', fwd), lUp: cal(operator, 1, 'Bip01_L_UpperArm', 'Bip01_L_Hand', fwd),
    rFo: cal(operator, 1, 'Bip01_R_Forearm', 'Bip01_R_Hand', fwdUp), lFo: cal(operator, 1, 'Bip01_L_Forearm', 'Bip01_L_Hand', fwdUp),
    head: cal(operator, 1, 'Bip01_Head', 'Bip01_MMiddleEyebrow', new V(0, -1, 0.3).normalize()), spine: cal(operator, 1, 'Bip01_Spine1', 'Bip01_Head', fwd),
  };
  operator.overlay((t, a) => {
    const b = a.bones, grip = ramp(t, 17.5, 19.5) * (1 - ramp(t, 62, 64) * 0.35);
    bend(b.Bip01_Spine1, opAx.spine, 0.08 * grip + Math.sin(t * 0.9) * 0.012);
    bend(b.Bip01_R_UpperArm, opAx.rUp, 0.75 * grip); bend(b.Bip01_L_UpperArm, opAx.lUp, 0.72 * grip);
    bend(b.Bip01_R_Forearm, opAx.rFo, 0.95 * grip); bend(b.Bip01_L_Forearm, opAx.lFo, 0.9 * grip);
    bend(b.Bip01_Head, opAx.head, 0.12 + 0.18 * grip + Math.sin(t * 0.31) * 0.05);  // looking into the viewfinder
  });

  const asAx = {
    rUp: cal(assistant, 22.9, 'Bip01_R_UpperArm', 'Bip01_R_Hand', fwdUp), spine: cal(assistant, 22.9, 'Bip01_Spine1', 'Bip01_Head', fwd),
    rFo: cal(assistant, 22.9, 'Bip01_R_Forearm', 'Bip01_R_Hand', fwd),
  };
  const reach = t => ramp(t, 23.0, 24.0) * (1 - ramp(t, 24.6, 25.4));
  assistant.overlay((t, a) => {
    const r = reach(t), b = a.bones;
    bend(b.Bip01_Spine1, asAx.spine, 0.22 * r);
    bend(b.Bip01_R_UpperArm, asAx.rUp, 1.05 * r);
    bend(b.Bip01_R_Forearm, asAx.rFo, 0.25 * r);
  });

  // the folder: in her right hand while she walks in, placed on the desk at the reach
  const doc = folder();
  scene.add(doc);
  const onDesk = { pos: new V(0.02, RISER + 0.81, -1.02), quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.08, 0)) };
  const hand = new V(), carryQ = new THREE.Quaternion(), e = new THREE.Euler();
  function placeFolder(t) {
    const placed = ramp(t, 23.85, 24.35);
    if (t > 24.35) { doc.position.copy(onDesk.pos); doc.quaternion.copy(onDesk.quat); return; }
    assistant.bones.Bip01_R_Hand.getWorldPosition(hand);
    // carried at her side: upright, long edge along the walking direction, hanging just below the hand
    carryQ.setFromEuler(e.set(0, assistant.group.rotation.y, Math.PI / 2, 'YXZ'));
    const carryPos = hand.clone().add(new V(0, -0.11, 0));
    doc.position.lerpVectors(carryPos, onDesk.pos, placed);
    doc.quaternion.slerpQuaternions(carryQ, onDesk.quat, placed);
  }

  // presenters, seated: breathing, small head moves; Georgie glances over to Andy'K once
  for (const [a, ph, glance] of [[andy, 0, 0], [georgie, 1.7, 1]]) {
    const ax = { spine: cal(a, 1, 'Bip01_Spine1', 'Bip01_Head', fwd), head: cal(a, 1, 'Bip01_Head', 'Bip01_MMiddleEyebrow', new V(glance ? 1 : -1, 0, 0.2).normalize()) };
    const seated = (a === andy ? info.andy : info.georgie).seatedAt;
    a.overlay((t, A) => {
      const w = ramp(t, seated - 0.5, seated + 0.7), b = A.bones;
      bend(b.Bip01_Spine1, ax.spine, Math.sin(t * 1.6 + ph) * 0.012 * w);
      const look = glance ? ramp(t, 57, 58.2) * (1 - ramp(t, 60.5, 61.8)) * 0.42 : 0;
      bend(b.Bip01_Head, ax.head, (Math.sin(t * 0.37 + ph) * 0.07 + look) * w);
    });
  }

  const cast = [andy, georgie, assistant, operator];
  cast.forEach(a => scene.add(a.group));
  // on set only when needed (they wait offstage, out of every shot, before their entrance)
  const shown = { andy: [29.9, 999], georgie: [29.9, 999], assistant: [15, info.assistant.exit.end + 0.1], operator: [0, 999] };
  return {
    info, cast, andy, georgie,
    pose(t) {
      for (const a of cast) { const [s, e2] = shown[a.key]; a.group.visible = t >= s && t <= e2; if (a.group.visible) a.pose(t); }
      placeFolder(t);
    },
  };
}

/* ---------- cameras ---------- */
const curve = pts => new THREE.CatmullRomCurve3(pts.map(p => new V(...p)), false, 'centripetal');
const SHOTS = {
  // 0–15: low glide past camera 1 and its operator, rising to the wide shot as the lights come up
  wake: { pos: curve([[-7.0, 0.55, 8.2], [-5.6, 0.85, 7.7], [-3.0, 1.3, 7.9], [-1.0, 2.1, 9.1], [0.2, 3.0, 10.8]]), target: curve([[-4.2, 1.3, 4.4], [-3.6, 1.3, 3.0], [-2.0, 1.3, 0.2], [-0.4, 1.5, -2.2], [0, 1.75, -3.0]]), fov: 38 },
  // 15–30: high, from behind the desk: the assistant's back, the folder, camera operator in the distance
  crew: { pos: curve([[2.4, 3.05, -4.95], [1.25, 2.9, -4.75]]), target: curve([[0.3, 0.9, -1.45], [0.05, 0.95, -1.2]]), fov: 42 },
  // 50–65: reverse angle from behind the desk, towards the studio cameras
  desk: { pos: curve([[0, 1.45, -5.05], [0, 1.62, -4.5]]), target: curve([[0, 1.1, 2.0], [0, 1.1, 2.0]]), fov: 44 },
  // 65–80: rise above and behind the presenters to straight overhead
  rise: { pos: curve([[0, 1.62, -4.5], [0.2, 3.2, -4.75], [0.35, 5.1, -4.6], [0.15, 6.0, -3.2], [0.02, 6.3, -1.88]]), target: curve([[0, 1.1, 2.0], [0, 0.9, 1.2], [0, 0.6, 0.2], [0, 0.2, -1.2], [0, 0, -1.9]]), fov: 46 },
  // 80–88.5: push in on the logo in front of the darkening LED wall, then hold still
  logo: { pos: curve([[0, 3.0, 1.4], [0, 4.2, -2.4]]), target: curve([[0, 4.25, -5.45], [0, 4.25, -5.45]]), fov: 40 },
};
const easeOut = u => 1 - Math.pow(1 - u, 3);
function shot(name, u) { const s = SHOTS[name]; return { pos: s.pos.getPoint(u), target: s.target.getPoint(u), fov: s.fov }; }
// v2 correction (approved): 40.5–50 s is a high top shot that tracks Georgie's entrance from above, so neither
// presenter's face is turned towards the lens (in v1 a head-height follow saw Andy'K arriving face-on).
// ?version=v1 reproduces the original master exactly.
const VERSION = new URLSearchParams(location.search).get('version') || 'v2';
const TOP = { h: 6.0, back: 1.1, ahead: 0, fov: 40 }; // height (m), behind her (m), look-ahead (m), lens
function topFollow(actor, t) {
  const p = actor.where(t), lag = actor.where(t - 1.0), h = lerpAngle(lag.heading, p.heading, 0.3);
  const fwd = new V(Math.sin(h), 0, Math.cos(h)), drift = smooth(clamp01((t - 40.5) / 9.5));
  // above and slightly behind her, lowering a little as she reaches the desk; looks steeply down, a step ahead of her
  const q = new URLSearchParams(location.search), H = +(q.get('h') || TOP.h), B = +(q.get('b') || TOP.back), A = +(q.get('a') || TOP.ahead);
  return { pos: new V(p.x, H - 0.4 * drift, p.z).addScaledVector(fwd, -B), target: new V(p.x, 0, p.z).addScaledVector(fwd, A), fov: +(q.get('f') || TOP.fov) };
}
function follow(actor, t, dist, height) {
  // behind the actor, along a slightly delayed heading, so the camera trails like an operator would
  const p = actor.where(t), lag = actor.where(t - 0.7), h = lerpAngle(lag.heading, p.heading, 0.35);
  const back = new V(-Math.sin(h), 0, -Math.cos(h));
  return { pos: new V(p.x, p.y + height, p.z).addScaledVector(back, dist), target: new V(p.x, p.y + 1.15, p.z).addScaledVector(back, -3.0), fov: 42 };
}
const CHECK = { assistant: [[1.6, 1.45, 0.4], [0, 0.95, -1.4]], seated: [[0, 1.6, 2.4], [0, 1.0, -1.8]], side: [[4.2, 1.6, -0.6], [0, 0.9, -1.8]] };
function cameraAt(t, cast) {
  const check = CHECK[new URLSearchParams(location.search).get('view')];
  if (check) return { pos: new V(...check[0]), target: new V(...check[1]), fov: 40 }; // review only, never in the clip
  if (t < 15) return shot('wake', smooth(t / 15));
  if (t < 30) return shot('crew', smooth((t - 15) / 15));
  if (t < 40.5) return follow(cast.andy, t, 2.4, 1.95);
  if (t < 50) return VERSION === 'v1' ? follow(cast.georgie, t, 2.8, 2.05) : topFollow(cast.georgie, t);
  if (t < 65) return shot('desk', smooth((t - 50) / 15));
  if (t < 80) return shot('rise', smooth((t - 65) / 15));
  return shot('logo', easeOut(clamp01((t - 80) / (FREEZE - 80))));
}

/* ---------- boot ---------- */
export async function start({ canvas, width, height, realtime = true, progress = () => {} }) {
  const quality = { mobile: false, dpr: 1, shadowSize: 2048, shadows2: true, reflections: true, glass: true, bloomScale: 0.75, wall: { width: 2048, height: 860 }, wallFps: 30 };
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !realtime });
  renderer.setPixelRatio(realtime ? Math.min(devicePixelRatio, 1.5) : 1);
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
  const camera = new THREE.PerspectiveCamera(40, width / height, 0.05, 80);

  // clocks on the LED wall and pylons show show time: 09:58:30 → 10:00:00 Vienna over the opening
  let clockT = 0;
  setClockSource(() => new Date(SHOW_START - (DURATION - clockT) * 1000));

  const studio = buildStudio({ scene, quality, logo: LOGO, guest: false });   // blocked before the guest chair
  const mirror = new Reflector(new THREE.CircleGeometry(26, 64), { clipBias: 0.003, textureWidth: 1024, textureHeight: 1024, color: 0x6a6d73 });
  mirror.rotation.x = -Math.PI / 2; mirror.position.y = -0.002; scene.add(mirror);
  progress(0.25);

  const cast = await stageActors(scene, new THREE.TextureLoader());
  progress(0.85);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(width * quality.bloomScale, height * quality.bloomScale), 0.62, 0.55, 0.86);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.setSize(width, height);

  let program = '', last = 0;
  function frame(tIn, dt) {
    const t = Math.min(tIn, FREEZE);
    clockT = t;
    const L = lighting(t), prog = at(WALL, t);
    if (prog !== program) { studio.wall.set(prog); program = prog; }
    studio.wall.draw(t, tIn >= FREEZE ? 0 : dt);
    studio.update(t, tIn >= FREEZE ? 0 : dt, L, at(TALLY, t));
    cast.pose(t);
    const c = cameraAt(t, cast);
    camera.position.copy(c.pos); camera.fov = c.fov; camera.updateProjectionMatrix(); camera.lookAt(c.target);
    bloom.strength = L.bloom;
    composer.render(dt);
  }
  frame(0, 1 / 30);
  await renderer.compileAsync(scene, camera);
  progress(1);

  // review tool: is a presenter's face readable in this frame? (head in the picture, face turned towards the lens)
  const headPos = new V(), browPos = new V(), toCam = new V(), ndc = new V();
  function faces(t) {
    api.seek(t);
    return Object.fromEntries([['andy', cast.andy], ['georgie', cast.georgie]].map(([k, a]) => {
      if (!a.group.visible) return [k, { visible: false }];
      a.bones.Bip01_Head.getWorldPosition(headPos); a.bones.Bip01_MMiddleEyebrow.getWorldPosition(browPos);
      const faceDir = browPos.clone().sub(headPos).setY(0).normalize();              // where the face points (horizontal)
      toCam.copy(camera.position).sub(headPos).normalize();
      ndc.copy(headPos).project(camera);
      const inFrame = Math.abs(ndc.x) < 1 && Math.abs(ndc.y) < 1 && ndc.z < 1;
      const facing = faceDir.dot(toCam);                                                // 1 = straight at the lens
      const px = (0.24 / headPos.distanceTo(camera.position)) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 540; // head height in 1080p pixels
      return [k, { inFrame, facing: +facing.toFixed(2), px: Math.round(px), readable: inFrame && facing > 0.34 && px > 14 }];
    }));
  }
  const api = {
    faces, version: VERSION,
    duration: DURATION, freezeAt: FREEZE, cues: CUES, info: cast.info, renderer, scene, camera,
    seek(t) { frame(t, Math.max(0, Math.min(0.2, t - last)) || 1 / 30); last = t; },
    grab(type = 'image/jpeg', q = 0.95) { return canvas.toDataURL(type, q); },
    resize(w, h) { renderer.setSize(w, h, false); composer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); },
  };
  return api;
}
