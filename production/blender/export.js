// Export of the real-time studio for Blender + Cycles (build.py): the set as glTF, its lights, custom-shader parts,
// a camera move per frame and the LED wall's picture per frame. Used for the seamless background loops (SHOTS).
// Driven by export.mjs through headless Chrome; everything is a function of the frame, as in the opening.
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { GLTFExporter } from './vendor/GLTFExporter.js';
import { buildStudio } from '../../virtual-studio/set.js';
import { LOOKS, studioEnvironment } from '../../virtual-studio/main.js';
import { setClockSource } from '../../virtual-studio/screens.js';

const V = THREE.Vector3;
const FPS = 30;
// one loop = four passes of the studio background video (5.0417 s, 121 frames at 24 fps): 605 frames at 30 fps exactly,
// so the wall, the camera and the light all come back to their first frame
export const LOOP = 121 * 4 / 24;
const N = Math.round(LOOP * FPS);

// on air, as the opening has it after ON AIR: keys, rims, accents and fins up, house light down, a little beam haze
export const ON_AIR = { ...LOOKS.broadcast, house: 0.06, key: 1, rim: 1.1, accent: 1.1, fins: 1.1, wall: 1, beams: 0.55, music: 0, onAir: 1,
  solo: 0, aOn: 0, aBass: 0, aMid: 0, aHigh: 0, aLevel: 0, djOn: 0, djA: 0, djB: 0, djVA: 0.85, djVB: 0.85, djX: 0.5 };

/* ---------- the loops: broadcast camera positions, each a slow periodic move (a sine round a rest point) ----------
   pos/target at rest, drift: the move's amplitude (m) along x, y, z; fov: vertical, as on the studio cameras.
   'two': behind the two hosts, who are keyed in front of it (the desk comes as its own layer with alpha). */
export const SHOTS = {
  // the whole studio from the front, a crane slowly floating left and right: opening wide, breaks, closing
  wide: { pos: [0, 2.6, 9.6], target: [0, 1.9, -3.2], drift: [1.1, 0.12, 0.25], fov: 40, focus: 11.5 },
  // the hosts' shot: eye level over the desk, the LED wall and the hanging logo behind them
  two: { pos: [0, 1.32, 2.7], target: [0, 1.85, -6.0], drift: [0.35, 0.04, 0.08], fov: 40, focus: 4.6 },
  // Vienna: the grand, its lid open to us (the opening's piano shot, held), amber
  // (the studio's piano look: the room down to a glow, one warm spot from the truss on the grand)
  vienna: { pos: [-5.1, 1.6, 2.85], target: [-6.3, 0.85, -0.25], drift: [0.22, 0.04, 0.12], fov: 36, focus: 3.2, light: { solo: 1 } },
  // Melbourne: the DJ booth from the room (the opening's booth shot, held), ice
  // (the studio's music look, the decks on)
  melbourne: { pos: [3.35, 1.62, 1.7], target: [5.35, 1.1, 0.1], drift: [0.18, 0.04, 0.12], fov: 34, focus: 2.6, light: { ...LOOKS.music, music: 0.6, djOn: 1, djA: 1, djB: 1 } },
};
function camAt(shot, f) {
  const s = SHOTS[shot], a = 2 * Math.PI * f / N;
  // x drifts once per loop, y and z with it (phase-shifted): a smooth closed path, no stop, no jump at the loop point
  const d = new V(Math.sin(a) * s.drift[0], Math.sin(a + 1.3) * s.drift[1], (Math.cos(a) - 1) * 0.5 * s.drift[2]);
  return { pos: new V(...s.pos).add(d), target: new V(...s.target).add(d.clone().multiplyScalar(0.35)), fov: s.fov };
}

export async function start({ shot }) {
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(64, 36, false);
  RectAreaLightUniformsLib.init();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x040507);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(studioEnvironment(), 0.02).texture;
  setClockSource(() => new Date(Date.UTC(2027, 0, 27, 9, 0, 0)));   // the clocks at 10:00 Vienna, show time
  const quality = { mobile: false, dpr: 1, shadowSize: 2048, shadows2: true, reflections: false, glass: true, bloomScale: 0.75, wall: { width: 2048, height: 860 }, wallFps: 30, ao: false };
  // the hanging logo as the key visual's real glass (amber Vienna, ice Melbourne): ray-traced glass in Cycles
  const studio = buildStudio({ scene, quality, logo: new URLSearchParams(location.search).get('logo') || 'kv' });
  studio.liftLogo(false); studio.beacons.off();

  // the wall's film: the studio background loop's frames (frames.sh), drawn by the wall's own 'film' programme
  const base = new URL('../empty-opening/out/frames/', import.meta.url).href;
  const count = await (await fetch(base + 'count.json')).json();
  const frames = await Promise.all(Array.from({ length: count.bg }, (_, i) => new Promise((res, rej) => {
    const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = `${base}bg/${String(i + 1).padStart(4, '0')}.jpg`;
  })));
  const film = document.createElement('canvas'); film.width = frames[0].width; film.height = frames[0].height;
  Object.assign(film, { readyState: 4, videoWidth: film.width, videoHeight: film.height });
  studio.wall.film(() => [[film, 1]]);
  studio.wall.set('film');
  const setFilm = f => film.getContext('2d').drawImage(frames[Math.floor(f * 24 / FPS) % count.bg], 0, 0);

  // every image texture loaded before anything is exported
  await new Promise(r => setTimeout(r, 3000));
  // settle the set at show time (damped parts come to rest), then hold it: the light is the same on every frame
  const T0 = 120;
  const L = { ...ON_AIR, ...(SHOTS[shot].light || {}) };
  for (let i = 0; i < 90; i++) { setFilm(0); studio.wall.draw(T0, 1 / 30); studio.update(T0, 1 / 30, L, 0); }
  scene.updateMatrixWorld(true);

  // the wall's material, by its canvas texture (named, so build.py can put the per-frame pictures on it)
  let wallMesh = null;
  scene.traverse(o => { if (o.isMesh && (o.material?.map === studio.wall.texture || o.material?.emissiveMap === studio.wall.texture)) { o.material.name = 'DZ_LED_WALL'; wallMesh = o; } });

  // lights and custom shaders go to scene.json; the glTF carries geometry and standard materials only
  const lights = [], shaders = [], detached = [], hidden = [];
  const wp = new V(), wq = new THREE.Quaternion(), ws = new V();
  scene.traverse(o => {
    if (o.isSpotLight && o.intensity > 0 && o.visible) {
      o.getWorldPosition(wp); o.target.updateMatrixWorld();
      lights.push({ type: 'SpotLight', color: o.color.toArray(), intensity: o.intensity, pos: wp.toArray(), target: o.target.getWorldPosition(new V()).toArray(), angle: o.angle, penumbra: o.penumbra, distance: o.distance, castShadow: o.castShadow });
    } else if (o.isRectAreaLight && o.intensity > 0 && o.visible) {
      o.matrixWorld.decompose(wp, wq, ws);
      lights.push({ type: 'RectAreaLight', color: o.color.toArray(), intensity: o.intensity, pos: wp.toArray(), width: o.width * ws.x, height: o.height * ws.y,
        quat: { dir: new V(0, 0, -1).applyQuaternion(wq).toArray(), up: new V(0, 1, 0).applyQuaternion(wq).toArray() } });
    } else if (o.isPointLight && o.intensity > 0 && o.visible) {
      o.getWorldPosition(wp);
      lights.push({ type: 'PointLight', color: o.color.toArray(), intensity: o.intensity, pos: wp.toArray(), distance: o.distance });
    }
    if (o.isLight) detached.push(o);
    if (o.isMesh && (o.material?.isShaderMaterial || o.material?.isRawShaderMaterial) && o.visible) {
      const g = o.geometry;
      shaders.push({ kind: `${o.material.type}/${g.type}`, params: g.parameters || {}, matrix: o.matrixWorld.toArray(),
        uniforms: Object.fromEntries(Object.entries(o.material.uniforms || {}).filter(([, u]) => typeof u.value === 'number').map(([k, u]) => [k, u.value])) });
      hidden.push(o);
    }
  });
  // the real-time mirror floor's replacement (build.py lays a ray-traced polished floor of this radius)
  shaders.push({ kind: 'Reflector/CircleGeometry', params: { radius: 26 }, matrix: new THREE.Matrix4().toArray(), uniforms: {} });

  return {
    frames: N, loop: LOOP, shot,
    async glb() {
      // textures the exporter cannot write (procedural data textures, images not drawable): left out, listed
      const skipped = [], KEYS = ['map', 'emissiveMap', 'roughnessMap', 'metalnessMap', 'normalMap', 'aoMap', 'alphaMap', 'clearcoatMap', 'clearcoatRoughnessMap', 'clearcoatNormalMap', 'sheenColorMap', 'sheenRoughnessMap', 'transmissionMap', 'thicknessMap', 'specularIntensityMap', 'specularColorMap', 'iridescenceMap', 'anisotropyMap', 'lightMap', 'bumpMap', 'displacementMap'];
      // (render-target pictures, e.g. the live viewfinders, are not images either: none of the loops sees them)
      const ok = img => (img instanceof HTMLCanvasElement || img instanceof ImageBitmap || (img instanceof HTMLImageElement && img.complete)) && img.width > 0 && img.height > 0;
      scene.traverse(o => { if (!o.isMesh) return; for (const m of [].concat(o.material)) for (const k of KEYS) if (m && m[k] && !ok(m[k].image)) { skipped.push(`${m.name || m.type}.${k}`); m[k] = null; m.needsUpdate = true; } });
      if (skipped.length) console.warn('textures left out:', [...new Set(skipped)].join(', '));
      for (const o of hidden) o.visible = false;
      const parents = detached.map(l => [l, l.parent]); for (const [l, p] of parents) p.remove(l);
      const out = await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: true, maxTextureSize: 4096 });
      for (const [l, p] of parents) p.add(l); for (const o of hidden) o.visible = true;
      const a = new Uint8Array(out); let s = ''; for (let i = 0; i < a.length; i += 32768) s += String.fromCharCode(...a.subarray(i, i + 32768));
      return btoa(s);
    },
    meta() {
      const camera = [];
      for (let f = 0; f < N; f++) {
        const c = camAt(shot, f), m = new THREE.Matrix4().lookAt(c.pos, c.target, new V(0, 1, 0)).setPosition(c.pos);
        camera.push({ m: m.toArray(), fov: c.fov, aspect: 16 / 9 });
      }
      return { lights, shaders, env: true, background: [0.016, 0.02, 0.027], fog: { color: [0.016, 0.02, 0.027], density: 0.024 }, exposure: 1.1, toneMapping: 4,
        actors: [], frames: { fps: FPS, first: 0, count: N, startSeconds: 0 }, camera, actorVisible: [], focus: SHOTS[shot].focus, wall: wallMesh ? { name: 'DZ_LED_WALL' } : null };
    },
    // the wall's picture for frame f, as a JPEG (data URL)
    wall(f) { setFilm(f); studio.wall.draw(T0 + f / FPS, 1 / FPS); return studio.wall.canvas.toDataURL('image/jpeg', 0.93); },
  };
}
