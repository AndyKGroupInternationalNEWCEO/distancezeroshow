// DISTANCE // ZERO — the empty-studio opening, 90 s: the real studio before a show, nobody in it, as if seen live
// through its own cameras. It wakes up, the cameras look round the desk, the DJ booth and the grand, the beacons
// turn, flash three times with a tone and the studio is on air; the big logo comes up on the LED wall and the camera
// flies to it until the wall's picture fills the frame. The last 1.5 s are that picture, clean: the switch to the
// live cameras of Andy'K and Georgie goes through it (the stinger in out/).
// Everything is a function of t, so the preview and the offline render agree. The audio is laid on by mix.sh.
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { buildStudio } from '../../virtual-studio/set.js';
import { LOOKS, studioEnvironment } from '../../virtual-studio/main.js';
import { setClockSource, logoCard } from '../../virtual-studio/screens.js';

export const DURATION = 90;
const FILL = 88.5;                        // the wall's picture fills the frame; from here the frame is the clean card
const SHOW_START = Date.UTC(2027, 0, 27, 9, 0, 0); // 10:00 Vienna (CET = UTC+1) on 27 Jan 2027
const V = THREE.Vector3;
const smooth = u => u * u * (3 - 2 * u), clamp01 = u => Math.min(1, Math.max(0, u));
const ramp = (t, a, b) => smooth(clamp01((t - a) / (b - a)));

/* ---------- sync points for the audio (seconds); the theme's hit on the key lights and the opener's two hits, as in
   the approved sync sheet of the first opening ---------- */
export const CUES = [
  { t: 0.0, id: 'start', label: 'Black. Studio asleep' },
  { t: 3.0, id: 'worklights', label: 'Work lights on' },
  { t: 3.6, id: 'keys', label: 'Key lights up (hit)' },
  { t: 6.0, id: 'accents', label: 'LED strips sweep on' },
  { t: 9.5, id: 'wall', label: 'LED wall: Vienna / Melbourne' },
  { t: 15.0, id: 'cut-desk', label: 'Cut: along the empty desk' },
  { t: 28.0, id: 'cut-booth', label: "Cut: the DJ booth, Melbourne side" },
  { t: 40.0, id: 'cut-piano', label: 'Cut: the grand, Vienna side' },
  { t: 52.0, id: 'cut-cameras', label: 'Cut: behind the studio cameras' },
  { t: 64.0, id: 'standby', label: 'Crane, high: beacons turn (standby)' },
  { t: 77.0, id: 'tone1', label: 'Beacons flash + tone 1' },
  { t: 78.0, id: 'tone2', label: 'Flash + tone 2' },
  { t: 79.0, id: 'tone3', label: 'Flash + tone 3' },
  { t: 80.0, id: 'onair', label: 'ON AIR: logo on the wall, fly to it (opener hit)' },
  { t: 88.5, id: 'fill', label: 'The wall fills the frame: clean card, switch to the live cameras' },
  { t: 90.0, id: 'end', label: 'End' },
];

/* ---------- lighting timeline: each parameter a list of [time, value], eased between keys ---------- */
const LIGHT = {
  house: [[0, 0], [1.5, 0], [3.0, 0.55], [11, 0.55], [14, 0.2], [64, 0.2], [70, 0.12], [80, 0.06]],
  key: [[0, 0], [3.6, 0], [4.4, 1], [64, 1], [70, 0.7], [80, 1]],
  rim: [[0, 0], [5.5, 0], [7.0, 0.8], [80, 0.8], [83, 1.1]],
  accent: [[0, 0], [6.0, 0], [9.0, 1], [64, 1], [70, 0.75], [80, 1.1]],
  fins: [[0, 0], [6.0, 0], [9.0, 0.75], [80, 0.75], [83, 1.1]],
  wall: [[0, 0], [6.5, 0], [9.5, 1], [64, 1], [70, 0.6], [79, 1]],
  beams: [[0, 0], [9, 0], [12, 0.1], [77, 0.1], [80, 0.55]],
  music: [[0, 0], [28, 0], [30, 0.25], [40, 0.25], [42, 0]],
  onAir: [[0, 0], [80, 0], [80.05, 1]],
  bloom: [[0, 0.6], [80, 0.6], [86, 0.45]],
};
function lighting(t) {
  const L = { ...LOOKS.broadcast, solo: 0, aOn: 0, aBass: 0, aMid: 0, aHigh: 0, aLevel: 0, djOn: 0, djA: 0, djB: 0, djVA: 0.85, djVB: 0.85, djX: 0.5 };
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
const WALL = [[0, 'idle'], [9.5, 'cities'], [64, 'idle'], [79.1, 'logo']];
const at = (list, t) => list.filter(([s]) => t >= s).pop()[1];

/* ---------- cameras ---------- */
const curve = pts => new THREE.CatmullRomCurve3(pts.map(p => new V(...p)), false, 'centripetal');
const WALL_C = new V(0, 3.1, -7), FOV_END = 40, END_DIST = 3.0 / (2 * Math.tan(THREE.MathUtils.degToRad(FOV_END / 2)));
const SHOTS = {
  // 0–15: low glide past camera 1, rising to the wide shot as the lights come up
  wake: { pos: curve([[-7.0, 0.55, 8.2], [-5.6, 0.85, 7.7], [-3.0, 1.3, 7.9], [-1.0, 2.1, 9.1], [0.2, 3.0, 10.8]]), target: curve([[-4.2, 1.3, 4.4], [-3.6, 1.3, 3.0], [-2.0, 1.3, 0.2], [-0.4, 1.5, -2.2], [0, 1.75, -3.0]]), fov: 38 },
  // 15–28: a slow dolly along the front of the empty desk: microphones, the three chairs, the names on the fascia
  desk: { pos: curve([[-2.9, 1.22, 1.75], [0, 1.3, 2.05], [2.9, 1.22, 1.75]]), target: curve([[-1.4, 0.95, -1.5], [0, 0.95, -1.6], [1.4, 0.95, -1.5]]), fov: 36 },
  // 28–40: the DJ booth on the Melbourne side, from the room, a slow arc round its front
  booth: { pos: curve([[3.15, 1.55, 2.25], [3.35, 1.62, 1.7], [3.75, 1.75, 1.15]]), target: curve([[5.25, 1.12, 0.25], [5.35, 1.1, 0.1], [5.4, 1.08, 0.0]]), fov: 34 },
  // 40–52: the grand on the Vienna side, its lid open to us, sliding past the keyboard end
  piano: { pos: curve([[-4.3, 1.45, 3.0], [-5.1, 1.6, 2.85], [-5.9, 1.8, 2.55]]), target: curve([[-6.0, 0.85, -0.1], [-6.3, 0.85, -0.25], [-6.6, 0.85, -0.35]]), fov: 36 },
  // 52–64: behind the studio cameras, looking past them to the set
  cams: { pos: curve([[-2.2, 1.7, 7.6], [0, 1.8, 7.9], [2.2, 1.9, 7.4]]), target: curve([[-0.6, 1.25, -1.6], [0, 1.3, -1.8], [0.6, 1.25, -1.6]]), fov: 40 },
  // 64–80: the crane, high on the Melbourne side, coming round and down to the centre in front of the set
  crane: { pos: curve([[7.0, 5.6, 7.0], [4.6, 4.4, 8.9], [1.4, 3.2, 9.6], [0, 2.75, 9.4]]), target: curve([[0, 1.0, -2.0], [0, 1.4, -2.6], [0, 2.2, -4.8], [0, 2.9, -7]]), fov: 42 },
  // 80–88.5: the fly to the LED wall, ending square on its centre with the wall's 3 m high logo box filling the frame
  fly: { pos: curve([[0, 2.75, 9.4], [0, 2.95, 4.0], [0, 3.1, WALL_C.z + END_DIST]]), target: curve([[0, 2.9, -7], [0, 3.05, -7], [0, 3.1, -7]]), fov: FOV_END },
};
function shot(name, u) { const s = SHOTS[name]; return { pos: s.pos.getPoint(u), target: s.target.getPoint(u), fov: s.fov }; }
const easeInOut = u => u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
function cameraAt(t) {
  if (t < 15) return shot('wake', smooth(t / 15));
  if (t < 28) return shot('desk', smooth((t - 15) / 13));
  if (t < 40) return shot('booth', smooth((t - 28) / 12));
  if (t < 52) return shot('piano', smooth((t - 40) / 12));
  if (t < 64) return shot('cams', smooth((t - 52) / 12));
  if (t < 80) return shot('crane', smooth((t - 64) / 16));
  return shot('fly', easeInOut(clamp01((t - 80) / (FILL - 80))));
}
// a real camera is never perfectly still: a slow float, like a pedestal or a crane arm settling, gone for the fly's end
const FLOAT = [[0.31, 0.7], [0.53, 2.1], [0.87, 4.3]];
function float(t, k) {
  let x = 0, y = 0;
  for (const [f, p] of FLOAT) { x += Math.sin(t * f * 6.283 + p) / f; y += Math.sin(t * f * 5.1 + p * 1.7) / f; }
  return new V(x, y, 0).multiplyScalar(0.0016 * k);
}

/* ---------- the camera's own look: grain, a soft vignette, a little colour fringing at the edges ---------- */
const LensShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uGrain: { value: 0.035 }, uVignette: { value: 0.32 }, uFringe: { value: 0.0016 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uGrain, uVignette, uFringe; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime * 37.0) * 43758.5453); }
    void main(){
      vec2 d = vUv - 0.5; float r2 = dot(d, d);
      vec3 c = vec3(texture2D(tDiffuse, vUv - d * uFringe * r2 * 4.0).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv + d * uFringe * r2 * 4.0).b);
      c *= 1.0 - uVignette * smoothstep(0.08, 0.5, r2);
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c += (hash(vUv * 1000.0) - 0.5) * uGrain * (0.35 + 0.65 * (1.0 - l));   // grain shows most in the shadows
      gl_FragColor = vec4(c, 1.0);
    }`,
};
// the clean card, mixed in over the fly's last moment: the frame becomes the wall's picture itself
const CardShader = {
  uniforms: { tDiffuse: { value: null }, tCard: { value: null }, uMix: { value: 0 } },
  vertexShader: LensShader.vertexShader,
  fragmentShader: `uniform sampler2D tDiffuse, tCard; uniform float uMix; varying vec2 vUv;
    void main(){ gl_FragColor = vec4(mix(texture2D(tDiffuse, vUv).rgb, texture2D(tCard, vUv).rgb, uMix), 1.0); }`,
};
// the same card the wall draws, at frame size (exported for the end frame and the stinger)
export function drawCard(canvas, glow = 1) {
  const x = canvas.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, canvas.width, canvas.height);
  logoCard(x, cardArt, canvas.width / 2, canvas.height / 2, canvas.width, canvas.height, glow);
}
const cardArt = new Image(); cardArt.src = new URL('../../assets/logo-do-1k.webp', import.meta.url).href;

/* ---------- boot ---------- */
export async function start({ canvas, width, height, realtime = true, progress = () => {} }) {
  const quality = { mobile: false, dpr: 1, shadowSize: 2048, shadows2: true, reflections: true, glass: true, bloomScale: 0.75, wall: { width: 2048, height: 860 }, wallFps: 30, ao: true };
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

  // the clocks on the wall and the pylons show show time: 09:58:30 → 10:00:00 Vienna over the opening
  let clockT = 0;
  setClockSource(() => new Date(SHOW_START - (DURATION - clockT) * 1000));

  const studio = buildStudio({ scene, quality, logo: 'image' });
  studio.beacons.clock(() => clockT);
  const mirror = new Reflector(new THREE.CircleGeometry(26, 64), { clipBias: 0.003, textureWidth: 1024, textureHeight: 1024, color: 0x6a6d73 });
  mirror.rotation.x = -Math.PI / 2; mirror.position.y = -0.002; scene.add(mirror);
  progress(0.4);

  await new Promise(r => (cardArt.complete ? r() : cardArt.addEventListener('load', r, { once: true })));
  const cardCanvas = document.createElement('canvas'); cardCanvas.width = width; cardCanvas.height = height; drawCard(cardCanvas);
  const cardTex = new THREE.CanvasTexture(cardCanvas);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(width * quality.bloomScale, height * quality.bloomScale), 0.6, 0.55, 0.86);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const lens = new ShaderPass(LensShader); composer.addPass(lens);
  const card = new ShaderPass(CardShader); card.uniforms.tCard.value = cardTex; composer.addPass(card);
  composer.setSize(width, height);

  let program = '', mode = '', lifted = false;
  function beacons(t) {
    const m = t < 64 ? 'off' : t < 77 ? 'standby' : t < 80 ? 'cue' : 'air';
    if (m === mode) return;
    mode = m;
    if (m === 'cue') { clockT = 77; studio.beacons.cue(); clockT = t; }   // the cue's flashes count from 77 s exactly
    else studio.beacons[m]();
  }
  function frame(tIn, dt) {
    const t = Math.min(tIn, FILL);
    clockT = t;
    const L = lighting(t), prog = at(WALL, t);
    if (prog !== program) { studio.wall.set(prog); program = prog; }
    beacons(t);
    // the hanging logo flies up, clear of the wall's picture, while the beacons count down
    if ((t >= 77) !== lifted) { lifted = t >= 77; studio.liftLogo(lifted); }
    studio.wall.draw(t, tIn >= FILL ? 0 : dt);
    studio.update(t, tIn >= FILL ? 0 : dt, L, 0);
    const c = cameraAt(t), wob = float(t, 1 - ramp(t, 84, 87.5));
    camera.position.copy(c.pos).add(wob); camera.fov = c.fov; camera.updateProjectionMatrix(); camera.lookAt(c.target.clone().add(wob.multiplyScalar(0.6)));
    bloom.strength = L.bloom;
    lens.uniforms.uTime.value = tIn;
    card.uniforms.uMix.value = ramp(tIn, 87.3, FILL);
    composer.render(dt);
  }
  frame(0, 1 / 30);
  await renderer.compileAsync(scene, camera);
  progress(1);

  let last = 0;
  return {
    duration: DURATION, fillAt: FILL, cues: CUES, renderer, scene, camera,
    seek(t) { frame(t, Math.max(0, Math.min(0.2, t - last)) || 1 / 30); last = t; },
    grab(type = 'image/jpeg', q = 0.95) { return canvas.toDataURL(type, q); },
  };
}
