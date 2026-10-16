// Export of the 90 s empty-studio opening (production/empty-opening) for Blender + Cycles, frame by frame: the set as
// glTF (at ON AIR, everything lit), and per frame the camera, every light (intensity, colour, position, aim), every
// material whose colour changes (LED strips, glows, signs), every object that moves or shows/hides (the hanging logo,
// the beacons' mirrors), and the picture of every screen that changes (the LED wall, the pylons' clocks).
// The opening's own timeline drives it all: exactly what the real-time opening shows, rebuilt with ray-traced light.
import * as THREE from 'three';
import { GLTFExporter } from './vendor/GLTFExporter.js';
import { start as startOpening } from '../empty-opening/opening.js';

const FPS = 30;
const r4 = v => Math.round(v * 1e4) / 1e4;

export async function start() {
  const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 36;
  const op = await startOpening({ canvas, width: 64, height: 36, realtime: false });
  const { scene, camera } = op, N = Math.round(op.duration * FPS);
  await new Promise(r => setTimeout(r, 3000));          // every image texture loaded

  // what changes over the opening: sampled at a few moments across it
  const SAMPLES = [0, 5, 12, 30, 50, 66, 78.3, 79.5, 82, 86, 89].map(t => Math.round(t * FPS));
  const meshes = [], mats = new Set(), lights = [], canvases = new Map();
  scene.traverse(o => {
    if (o.isLight && !o.isAmbientLight && !o.isHemisphereLight) lights.push(o);
    if (o.isMesh || o.isGroup || o.isObject3D) meshes.push(o);
    if (o.isMesh) for (const m of [].concat(o.material)) if (m) {
      mats.add(m);
      for (const k of ['map', 'emissiveMap']) if (m[k]?.isCanvasTexture) { if (!canvases.has(m[k])) canvases.set(m[k], []); canvases.get(m[k]).push(m); }
    }
  });
  const matState = m => [m.color?.r, m.color?.g, m.color?.b, m.emissive?.r ?? 0, m.emissive?.g ?? 0, m.emissive?.b ?? 0, m.emissiveIntensity ?? 1, m.opacity].map(v => r4(v ?? 0));
  const objState = o => [...o.matrixWorld.elements.map(r4), o.visible ? 1 : 0];
  const texVersions = new Map();
  const seen = { mat: new Map(), obj: new Map() };
  for (const f of SAMPLES) {
    await op.seek(f / FPS);
    scene.updateMatrixWorld(true);
    for (const m of mats) { const s = matState(m).join(); (seen.mat.get(m) || seen.mat.set(m, new Set()).get(m)).add(s); }
    for (const o of meshes) if (!o.isLight && !o.isCamera) { const s = objState(o).join(); (seen.obj.get(o) || seen.obj.set(o, new Set()).get(o)).add(s); }
    for (const t of canvases.keys()) { (texVersions.get(t) || texVersions.set(t, new Set()).get(t)).add(t.version); }
  }
  const animMats = [...mats].filter(m => seen.mat.get(m).size > 1);
  const animObjs = meshes.filter(o => seen.obj.get(o)?.size > 1);
  const animTex = [...canvases.keys()].filter(t => texVersions.get(t).size > 1);
  animMats.forEach((m, i) => { m.name = `DZM_${i}`; });
  animObjs.forEach((o, i) => { o.name = `DZO_${i}`; });
  // a changing screen: its materials named after it (when one material also changes colour, the screen's name wins)
  animTex.forEach((t, i) => canvases.get(t).forEach(m => { m.userData.dzt = i; m.name = `DZT_${i}`; }));
  lights.forEach((l, i) => { l.name = `DZL_${i}`; });

  // the set as it stands ON AIR (86 s): geometry and materials; lights, cameras and custom shaders go to the JSON
  await op.seek(86);
  scene.updateMatrixWorld(true);
  const shaders = [], hidden = [];
  scene.traverse(o => {
    if (o.isMesh && (o.material?.isShaderMaterial || o.material?.isRawShaderMaterial)) {
      shaders.push({ kind: `${o.material.type}/${o.geometry.type}`, params: o.geometry.parameters || {}, matrix: o.matrixWorld.toArray(),
        uniforms: Object.fromEntries(Object.entries(o.material.uniforms || {}).filter(([, u]) => typeof u.value === 'number').map(([k, u]) => [k, u.value])) });
      hidden.push([o, o.visible]); o.visible = false;
    }
  });
  shaders.push({ kind: 'Reflector/CircleGeometry', params: { radius: 26 }, matrix: new THREE.Matrix4().toArray(), uniforms: {} });
  scene.traverse(o => { if (o.isReflector) hidden.push([o, o.visible]), (o.visible = false); });

  return {
    frames: N, counts: { lights: lights.length, mats: animMats.length, objs: animObjs.length, screens: animTex.length },
    async glb() {
      const ok = img => (img instanceof HTMLCanvasElement || img instanceof ImageBitmap || (img instanceof HTMLImageElement && img.complete)) && img.width > 0 && img.height > 0;
      const KEYS = ['map', 'emissiveMap', 'roughnessMap', 'metalnessMap', 'normalMap', 'aoMap', 'alphaMap', 'clearcoatMap', 'clearcoatRoughnessMap', 'clearcoatNormalMap', 'sheenColorMap', 'sheenRoughnessMap', 'transmissionMap', 'thicknessMap', 'specularIntensityMap', 'specularColorMap', 'lightMap', 'bumpMap', 'displacementMap'];
      const restore = [];
      scene.traverse(o => { if (!o.isMesh) return; for (const m of [].concat(o.material)) for (const k of KEYS) if (m && m[k] && !ok(m[k].image)) { restore.push([m, k, m[k]]); m[k] = null; } });
      // lights, the real-time fake beams (custom shaders: Cycles has real haze) and the mirror floor stay out of the glTF
      const parents = [...lights, ...hidden.map(([o]) => o)].map(l => [l, l.parent]); for (const [l, p] of parents) p.remove(l);
      const out = await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: false, maxTextureSize: 4096 });
      for (const [l, p] of parents) p.add(l); for (const [m, k, t] of restore) m[k] = t;
      const a = new Uint8Array(out); let s = ''; for (let i = 0; i < a.length; i += 32768) s += String.fromCharCode(...a.subarray(i, i + 32768));
      return btoa(s);
    },
    // static description: the lights' kind and shape, which materials/objects/screens are animated
    meta() {
      const wp = new THREE.Vector3(), wq = new THREE.Quaternion(), ws = new THREE.Vector3();
      return {
        lights: lights.map(o => {
          o.matrixWorld.decompose(wp, wq, ws);
          const L = { name: o.name, type: o.type, color: o.color.toArray(), intensity: o.intensity, pos: wp.toArray() };
          if (o.isSpotLight) Object.assign(L, { angle: o.angle, penumbra: o.penumbra, distance: o.distance, target: o.target.getWorldPosition(new THREE.Vector3()).toArray() });
          if (o.isRectAreaLight) Object.assign(L, { width: o.width * ws.x, height: o.height * ws.y, quat: { dir: new THREE.Vector3(0, 0, -1).applyQuaternion(wq).toArray(), up: new THREE.Vector3(0, 1, 0).applyQuaternion(wq).toArray() } });
          if (o.isPointLight) L.distance = o.distance;
          return L;
        }),
        shaders, yUp: true, env: true, background: [0.016, 0.02, 0.027], fog: { color: [0.016, 0.02, 0.027], density: 0.024 }, exposure: 1.1, toneMapping: 4,
        actors: [], actorVisible: [], frames: { fps: FPS, first: 0, count: N, startSeconds: 0 }, focus: 9,
        anim: { mats: animMats.map(m => m.name), objs: animObjs.map(o => o.name), screens: animTex.map((t, i) => ({ name: `DZT_${i}`, w: t.image.width, h: t.image.height })) },
      };
    },
    // one frame of the opening: camera, lights, materials, objects, and the changing screens' pictures (JPEG data URLs)
    async frame(f) {
      await op.seek(f / FPS);
      scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
      const tp = new THREE.Vector3();
      return {
        camera: { m: camera.matrixWorld.toArray().map(r4), fov: r4(camera.fov) },
        lights: lights.map(l => {
          const p = l.getWorldPosition(new THREE.Vector3());
          const row = [r4(l.visible ? l.intensity : 0), ...l.color.toArray().map(r4), ...p.toArray().map(r4)];
          if (l.isSpotLight) row.push(...l.target.getWorldPosition(tp).toArray().map(r4));
          return row;
        }),
        mats: animMats.map(matState),
        objs: animObjs.map(objState),
        screens: animTex.map(t => (t.image.toDataURL ? t.image.toDataURL('image/jpeg', 0.92) : null)),
      };
    },
  };
}
