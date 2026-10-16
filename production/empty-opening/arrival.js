// The arrival before the empty-studio opening (?cut=arrival): night outside the studio building, the presenters' shoes
// on the wet pavement as they walk in (never a face), past the reception desk with the D//0 logo, the backstage
// lounge where they sit down, and the camera going on
// alone through the BACKSTAGE door into the dark studio, where the opening takes over from black.
// Everything is a function of T (seconds from the arrival's start), like the opening.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RGBELoader } from './vendor/RGBELoader.js';
import { createActor, ramp, smooth, clamp01, lerpAngle } from '../lib/actors.js';
import { LOUNGE_DOOR } from '../../virtual-studio/set.js';

const RX = 3;                              // the reception's time: everything after it comes this much later
export const PRO = 22 + RX;                // the arrival's length; the opening's t = T - PRO
const WIDE = 3.6;                          // the building, wide; then the shoes
const OUTSIDE = 8.0 + RX;                  // cut from the lobby (reception) to the lounge
const FZ = 34;                             // the building's front, facing +z, well clear of the studio floor (r 26)
const V = THREE.Vector3;
const SEAT_TOP = 0.37;                     // the lounge armchairs' cushion
const SOLE = { andy: 0.009, georgie: 0.018 };

/* ---------- small canvas helpers ---------- */
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
// concrete panels with dark joints
const panels = (cols, rows) => canvasTex(1024, 1024, (x, w, h) => {
  x.fillStyle = '#2a2b2e'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.05})`; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  x.strokeStyle = '#0d0e10'; x.lineWidth = 5;
  for (let i = 0; i <= cols; i++) { x.beginPath(); x.moveTo(i * w / cols, 0); x.lineTo(i * w / cols, h); x.stroke(); }
  for (let i = 0; i <= rows; i++) { x.beginPath(); x.moveTo(0, i * h / rows); x.lineTo(w, i * h / rows); x.stroke(); }
});
// pavement slabs, and the asphalt's rough, patchy wetness (as a roughness map: dark = wet = mirror)
const slabs = () => canvasTex(1024, 1024, (x, w, h) => {
  x.fillStyle = '#3a3b3e'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 16000; i++) { x.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; x.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
  x.strokeStyle = '#121315'; x.lineWidth = 4;
  for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(i * w / 4, 0); x.lineTo(i * w / 4, h); x.stroke(); x.beginPath(); x.moveTo(0, i * h / 4); x.lineTo(w, i * h / 4); x.stroke(); }
});
const wetness = () => canvasTex(512, 512, (x, w, h) => {
  x.fillStyle = '#9a9a9a'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 60; i++) {
    const r = 20 + Math.random() * 90, px = Math.random() * w, py = Math.random() * h, g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, 'rgba(20,20,20,0.9)'); g.addColorStop(1, 'rgba(20,20,20,0)'); x.fillStyle = g; x.fillRect(px - r, py - r, 2 * r, 2 * r);
  }
}, false);
const text = (str, { w = 1024, h = 160, size = 96, color = '#f3f5f8', weight = 600, spacing = 0.28 } = {}) => canvasTex(w, h, (x) => {
  x.font = `${weight} ${size}px "Helvetica Neue", Arial, sans-serif`; x.fillStyle = color; x.textBaseline = 'middle';
  const chars = [...str], adv = chars.map(c => x.measureText(c).width + size * spacing), total = adv.reduce((a, b) => a + b, 0) - size * spacing;
  let px = (w - total) / 2; chars.forEach((c, i) => { x.fillText(c, px, h / 2); px += adv[i]; });
});
// rows of windows for the buildings across the street: most dark, a few warm or cold
const windows = (cols, rows, seed) => canvasTex(512, 512, (x, w, h) => {
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  x.fillStyle = '#08090b'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const r = rnd(); x.fillStyle = r < 0.1 ? '#ffcf8a' : r < 0.16 ? '#a8c4ff' : '#121418';
    x.fillRect(i * w / cols + 6, j * h / rows + 8, w / cols - 12, h / rows - 16);
  }
});

/* ---------- real surfaces (Poly Haven, CC0; cc0.sh): tinted to the street's own tones, so nothing gets lighter ---------- */
const CC0 = new URL('./out/cc0/', import.meta.url).href;
const texLoader = new THREE.TextureLoader();
function cc0(id, repeat, srgbMap = true) {
  const t = m => { const x = texLoader.load(`${CC0}${id}_${m}.jpg`); x.wrapS = x.wrapT = THREE.RepeatWrapping; x.repeat.set(...repeat); x.anisotropy = 8; if (m === 'diff' && srgbMap) x.colorSpace = THREE.SRGBColorSpace; return x; };
  return { map: t('diff'), normalMap: t('nor_gl'), roughnessMap: t('rough') };
}
// the pavement: the concrete's own grain with the slab joints cut in, 60 cm slabs
function slabsOver(img, joints) {
  return canvasTex(2048, 2048, (x, w, h) => {
    x.drawImage(img, 0, 0, w, h);
    x.strokeStyle = 'rgba(8,8,9,0.85)'; x.lineWidth = 7;
    for (let i = 0; i <= joints; i++) { x.beginPath(); x.moveTo(i * w / joints, 0); x.lineTo(i * w / joints, h); x.stroke(); x.beginPath(); x.moveTo(0, i * h / joints); x.lineTo(w, i * h / joints); x.stroke(); }
    // a few slabs a shade darker or lighter, as laid slabs are
    let sd = 7; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < joints; i++) for (let j = 0; j < joints; j++) { const r = rnd(); if (r < 0.3) { x.fillStyle = `rgba(${r < 0.15 ? '0,0,0' : '255,255,255'},0.06)`; x.fillRect(i * w / joints + 4, j * h / joints + 4, w / joints - 8, h / joints - 8); } }
  });
}
// a reflection that is not a mirror: blurred where the ground is only damp, sharper in the puddles, and broken up by
// the surface's own relief (its normal map), so lights smear into the wet slabs as they do on a real street
const WetReflector = {
  name: 'WetReflector',
  uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, tNormal: { value: null }, tWet: { value: null }, uScale: { value: new THREE.Vector2(1, 1) }, uWetScale: { value: new THREE.Vector2(1, 1) } },
  vertexShader: `uniform mat4 textureMatrix; varying vec4 vUv; varying vec2 vPos;
    void main() { vUv = textureMatrix * vec4(position, 1.0); vPos = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform vec3 color; uniform sampler2D tDiffuse, tNormal, tWet; uniform vec2 uScale, uWetScale; varying vec4 vUv; varying vec2 vPos;
    void main() {
      vec3 n = texture2D(tNormal, vPos * uScale).xyz * 2.0 - 1.0;
      float wet = 1.0 - texture2D(tWet, vPos * uWetScale).g;            // 1 in a puddle, ~0.4 on damp slabs
      float blur = mix(0.022, 0.002, smoothstep(0.35, 0.9, wet));
      vec2 uv = vUv.xy / vUv.w + n.xy * mix(0.012, 0.004, wet);
      vec3 c = vec3(0.0); float k = 0.0;
      for (int i = 0; i < 12; i++) {
        float a = float(i) * 2.39996, r = sqrt((float(i) + 0.5) / 12.0);
        vec2 o = vec2(cos(a), sin(a) * 1.8) * r * blur;                // stretched along the view, as wet reflections are
        float wgt = 1.0 - r * 0.5; c += texture2D(tDiffuse, uv + o).rgb * wgt; k += wgt;
      }
      c /= k;
      gl_FragColor = vec4(c * color * mix(0.35, 1.0, wet), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};
// a soft dark blot for under a shoe: the contact shadow that sets it on the ground
const blot = () => canvasTex(128, 128, (x, w, h) => { const g = x.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.45, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }, false);

/* ---------- the street: the building's front with its glass entrance, a canopy, the D//0 sign, wet pavement ---------- */
function buildStreet(nightEnv) {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); m.castShadow = m.receiveShadow = true; return m; };
  const env = 0.15;   // the studio's environment map would light the night street like a stage
  const facadeTex = (rx, ry) => cc0('concrete_panels', [rx, ry]);
  const concrete = new THREE.MeshStandardMaterial({ ...facadeTex(1, 1), color: 0x4a4b4e, roughness: 1, normalScale: new THREE.Vector2(0.8, 0.8), envMapIntensity: env });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.5, metalness: 0.6, envMapIntensity: env });
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.35, metalness: 0.9, envMapIntensity: 0.3 });
  // glass: the night street in it (the city HDRI, only as a reflection), a faint film of smudges and fingerprints
  const smudge = canvasTex(512, 512, (x, w, h) => { x.fillStyle = '#0a0a0a'; x.fillRect(0, 0, w, h); let sd = 3; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 140; i++) { const r = 6 + rnd() * 40, px = rnd() * w, py = h * (0.25 + rnd() * 0.6), gr = x.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, 'rgba(90,90,90,0.5)'); gr.addColorStop(1, 'rgba(90,90,90,0)'); x.fillStyle = gr; x.fillRect(px - r, py - r, 2 * r, 2 * r); } }, false);
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x9fb4c8, roughness: 1, roughnessMap: smudge, metalness: 0, transparent: true, opacity: 0.18, clearcoat: 1, clearcoatRoughness: 0.04, depthWrite: false, envMap: nightEnv, envMapIntensity: 0.55 });

  // the front: three blocks round the 3.2 × 3.0 m doorway, 40 m wide, 14 m high
  const W = 40, H = 14, DW = 3.2, DH = 3.0;
  const side = (W - DW) / 2;
  // (the panels' texture is about 2.5 m square)
  for (const sx of [-1, 1]) { const m = add(new THREE.BoxGeometry(side, H, 0.6), concrete, sx * (DW / 2 + side / 2), H / 2, FZ - 0.3); m.material = concrete.clone(); Object.assign(m.material, facadeTex(side / 2.5, H / 2.5)); }
  const over = add(new THREE.BoxGeometry(DW, H - DH, 0.6), concrete, 0, DH + (H - DH) / 2, FZ - 0.3); over.material = concrete.clone(); Object.assign(over.material, facadeTex(DW / 2.5, (H - DH) / 2.5));
  // a deep black reveal round the doorway
  for (const [w, h, x, y] of [[0.08, DH, -DW / 2 + 0.04, DH / 2], [0.08, DH, DW / 2 - 0.04, DH / 2], [DW, 0.08, 0, DH - 0.04]]) add(new THREE.BoxGeometry(w, h, 0.62), dark, x, y, FZ - 0.3);
  // the lobby behind: a warm, lit room with the logo on its back wall, seen through the glass
  const logoTex = new THREE.TextureLoader().load(new URL('../../assets/logo-do-1k.webp', import.meta.url).href); logoTex.colorSpace = THREE.SRGBColorSpace;
  // the lobby: 10 × 9.6 m, warm walls, a dark polished stone floor, the corridor to backstage at the back on the left
  const lobbyWall = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.7, emissive: 0x2a1a0c, emissiveIntensity: 1 });
  const stone = cc0('concrete_floor_02', [10 / 3, 9.6 / 3]);
  add(new THREE.BoxGeometry(10, 0.05, 9.6), new THREE.MeshPhysicalMaterial({ color: 0x2a221c, normalMap: stone.normalMap, normalScale: new THREE.Vector2(0.25, 0.25), roughnessMap: stone.roughnessMap, roughness: 0.45, clearcoat: 0.8, clearcoatRoughness: 0.12 }), 0, -0.021, FZ - 5.3);
  for (const [w, x] of [[0.8, -4.6], [8.0, 1.0]]) add(new THREE.BoxGeometry(w, 3.6, 0.1), lobbyWall, x, 1.8, FZ - 10.05);
  add(new THREE.BoxGeometry(1.2, 1.2, 0.1), lobbyWall, -3.6, 3.0, FZ - 10.05);                       // over the corridor
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.1, 3.6, 9.6), lobbyWall, sx * 5, 1.8, FZ - 5.3);
  add(new THREE.BoxGeometry(10, 0.1, 9.6), new THREE.MeshStandardMaterial({ color: 0x0c0a08 }), 0, 3.6, FZ - 5.3);
  // the reception desk, square on to the doors: dark stone top on a black glass front, the D//0 logo lit in its front
  // (low, at 0.55 m, so a camera at the shoes sees it), a champagne line under the top and a warm toe-kick light
  const desk = new THREE.Group(); desk.position.set(0.9, 0, FZ - 7.6); g.add(desk);
  const dAdd = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; desk.add(m); return m; };
  const deskGlass = new THREE.MeshPhysicalMaterial({ color: 0x050506, roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.5 });
  const deskStone = new THREE.MeshPhysicalMaterial({ color: 0x1c1a19, normalMap: stone.normalMap, normalScale: new THREE.Vector2(0.2, 0.2), roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.1 });
  const champagne = new THREE.MeshStandardMaterial({ color: 0xc9a671, metalness: 1, roughness: 0.35 });
  dAdd(new THREE.BoxGeometry(3.4, 1.0, 0.7), deskGlass, 0, 0.56, 0);
  dAdd(new THREE.BoxGeometry(3.5, 0.05, 0.8), deskStone, 0, 1.085, 0.02);
  dAdd(new THREE.BoxGeometry(3.42, 0.012, 0.012), champagne, 0, 1.05, 0.356);
  dAdd(new THREE.BoxGeometry(3.3, 0.06, 0.62), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.6 }), 0, 0.03, -0.02);   // recessed plinth
  const kick = dAdd(new THREE.BoxGeometry(3.28, 0.012, 0.01), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.5, 0.85) }), 0, 0.064, 0.29); kick.castShadow = false;
  const plaque = dAdd(new THREE.PlaneGeometry(1.24, 0.62), new THREE.MeshBasicMaterial({ map: logoTex, transparent: true, alphaTest: 0.04, toneMapped: false, color: new THREE.Color(1.05, 1.05, 1.05) }), 0, 0.58, 0.352);
  plaque.castShadow = false;
  const deskHalo = dAdd(new THREE.PlaneGeometry(2.0, 1.0), new THREE.MeshBasicMaterial({ map: canvasTex(256, 128, (x, w, h) => { const r = x.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2); r.addColorStop(0, 'rgba(255,214,160,0.16)'); r.addColorStop(1, 'rgba(255,214,160,0)'); x.fillStyle = r; x.fillRect(0, 0, w, h); }), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), 0, 0.58, 0.351);
  deskHalo.castShadow = false;
  // a slim monitor and a bell on the counter, a tall vase at the end
  dAdd(new THREE.BoxGeometry(0.5, 0.32, 0.02), deskGlass, 0.7, 1.29, -0.18).rotation.x = -0.12;
  dAdd(new THREE.CylinderGeometry(0.035, 0.05, 0.05, 24), champagne, -0.6, 1.135, 0.15);
  dAdd(new THREE.CylinderGeometry(0.07, 0.09, 0.42, 24), deskGlass, -1.5, 1.32, -0.1);
  const lobbyLogo = add(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshBasicMaterial({ map: logoTex, transparent: true, alphaTest: 0.04, toneMapped: false, color: new THREE.Color(0.9, 0.9, 0.9) }), 0.9, 2.3, FZ - 9.98);
  lobbyLogo.castShadow = false;
  // a warm light line along the lobby ceiling
  add(new THREE.BoxGeometry(6, 0.03, 0.06), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.6, 0.9) }), 0, 3.5, FZ - 3).castShadow = false;
  // the glass doors: two leaves that slide apart as someone comes
  const lights = new THREE.Group(); g.add(lights);
  const leaves = [-1, 1].map(sx => {
    const leaf = new THREE.Group(); g.add(leaf);
    const pane = new THREE.Mesh(new THREE.BoxGeometry(DW / 2 - 0.04, DH - 0.1, 0.02), glass); pane.position.set(0, (DH - 0.1) / 2, 0); leaf.add(pane);
    for (const [w, h, x, y] of [[DW / 2 - 0.04, 0.05, 0, 0.025], [DW / 2 - 0.04, 0.05, 0, DH - 0.12], [0.04, DH - 0.1, -sx * (DW / 4 - 0.04), (DH - 0.1) / 2]]) { const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), steel); f.position.set(x, y, 0); leaf.add(f); }
    return { leaf, sx };
  });
  // the canopy over the entrance, with a row of warm downlights in its underside
  add(new THREE.BoxGeometry(5.2, 0.18, 2.4), dark, 0, 3.45, FZ + 1.2);
  for (let i = -2; i <= 2; i++) add(new THREE.CircleGeometry(0.07, 20).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.2, 1.4) }), i * 0.95, 3.355, FZ + 1.5).castShadow = false;
  // the sign over the canopy: the logo, lit from behind (a soft halo on the concrete), and the name in white
  const halo = add(new THREE.PlaneGeometry(5.2, 2.6), new THREE.MeshBasicMaterial({ map: canvasTex(256, 128, (x, w, h) => { const r = x.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2); r.addColorStop(0, 'rgba(255,214,160,0.45)'); r.addColorStop(1, 'rgba(255,214,160,0)'); x.fillStyle = r; x.fillRect(0, 0, w, h); }), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), 0, 5.25, FZ + 0.01);
  halo.castShadow = false;
  const sign = add(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshBasicMaterial({ map: logoTex, transparent: true, alphaTest: 0.04, toneMapped: false, color: new THREE.Color(1.3, 1.3, 1.3) }), 0, 5.3, FZ + 0.02);
  sign.castShadow = false;
  const name = add(new THREE.PlaneGeometry(4.2, 0.66), new THREE.MeshBasicMaterial({ map: text('DISTANCE // ZERO', { size: 92 }), transparent: true, toneMapped: false, color: new THREE.Color(1.2, 1.2, 1.25) }), 0, 4.15, FZ + 0.02);
  name.castShadow = false;
  // pavement (4.5 m deep, then a granite kerb), the wet street beyond, the buildings across it
  // (2.4 m of texture = four 60 cm slabs; the wetness patches are their own, larger pattern)
  const floor = cc0('concrete_floor_02', [W / 2.4, 4.5 / 2.4]);
  const slabImg = new Image(); slabImg.src = `${CC0}concrete_floor_02_diff.jpg`;
  slabImg.onload = () => { const t = slabsOver(slabImg, 4); pave.material.map = t; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(W / 2.4, 4.5 / 2.4); pave.material.needsUpdate = true; };
  const wet = wetness(); wet.wrapS = wet.wrapT = THREE.RepeatWrapping; wet.repeat.set(W / 8, 4.5 / 8);
  const pave = add(new THREE.PlaneGeometry(W, 4.5).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0x8f8f8f, normalMap: floor.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), roughnessMap: floor.roughnessMap, roughness: 0.75,
    clearcoat: 1, clearcoatRoughnessMap: wet, clearcoatRoughness: 0.6, transparent: true, opacity: 0.86, envMap: nightEnv, envMapIntensity: 0.25 }), 0, 0.002, FZ + 2.25);
  pave.userData.wait = new Promise(r => slabImg.addEventListener('load', r, { once: true }));
  add(new THREE.BoxGeometry(W, 0.12, 0.25), new THREE.MeshStandardMaterial({ color: 0x55575c, roughness: 0.6, envMapIntensity: env }), 0, -0.06, FZ + 4.6);
  const wet2 = wetness(); wet2.wrapS = wet2.wrapT = THREE.RepeatWrapping; wet2.repeat.set(W / 10, 20 / 10);
  const asphalt = cc0('asphalt_02', [W / 3, 20 / 3]);
  add(new THREE.PlaneGeometry(W, 20).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({ ...asphalt, color: 0x4d4d4d, roughness: 0.8, normalScale: new THREE.Vector2(0.7, 0.7),
    clearcoat: 1, clearcoatRoughnessMap: wet2, clearcoatRoughness: 0.5, transparent: true, opacity: 0.8, envMap: nightEnv, envMapIntensity: 0.25 }), 0, -0.118, FZ + 14.6);
  // under the pavement and the street: their reflection, seen through the wet, part-transparent surfaces (as the studio
  // floor), blurred and broken up by the relief rather than a mirror
  for (const [w, d, y, z, nrm, nr, wt, wr] of [[W, 4.5, -0.003, FZ + 2.25, floor.normalMap, 2.4, wet, 8], [W, 20, -0.124, FZ + 14.6, asphalt.normalMap, 3, wet2, 10]]) {
    const m = new Reflector(new THREE.PlaneGeometry(w, d), { clipBias: 0.003, textureWidth: 1024, textureHeight: 512, color: 0x5a5d63, shader: WetReflector });
    const u = m.material.uniforms; u.tNormal.value = nrm; u.tWet.value = wt; u.uScale.value.set(1 / nr, 1 / nr); u.uWetScale.value.set(1 / wr, 1 / wr);
    m.rotation.x = -Math.PI / 2; m.position.set(0, y, z); g.add(m);
  }
  for (const [x, w, h, seed] of [[-14, 12, 18, 7], [0, 14, 24, 11], [14, 12, 16, 23]]) {
    const t = windows(6, 8, seed); const b = add(new THREE.BoxGeometry(w, h, 6), new THREE.MeshStandardMaterial({ color: 0x0c0d10, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.9, map: t, envMapIntensity: env }), x, h / 2, FZ + 28);
    b.castShadow = false; b.position.y -= 0.12;
  }
  // a street lamp further along the pavement
  add(new THREE.CylinderGeometry(0.06, 0.08, 6, 12), steel, 7, 3, FZ + 4.2);
  add(new THREE.BoxGeometry(0.9, 0.08, 0.22), steel, 6.6, 6.0, FZ + 4.2);
  add(new THREE.BoxGeometry(0.6, 0.02, 0.16), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 2.0, 2.4) }), 6.5, 5.95, FZ + 4.2).castShadow = false;


  const canopy = new THREE.SpotLight(0xffd3a0, 90, 14, 0.85, 0.6, 2); canopy.position.set(0, 3.3, FZ + 1.4); canopy.target.position.set(0, 0, FZ + 2.6);
  canopy.castShadow = true; canopy.shadow.mapSize.set(2048, 2048); canopy.shadow.bias = -0.0004; canopy.shadow.camera.near = 0.3; canopy.shadow.camera.far = 14;
  const lamp = new THREE.SpotLight(0xbcd0ff, 70, 18, 0.95, 0.7, 2); lamp.position.set(6.5, 5.9, FZ + 4.2); lamp.target.position.set(4.5, 0, FZ + 3.5);
  const lobby = new THREE.PointLight(0xffc890, 14, 9, 2); lobby.position.set(0, 2.6, FZ - 3);
  // over the desk: a warm downlight on the counter
  const deskSpot = new THREE.SpotLight(0xffd2a0, 40, 7, 0.7, 0.6, 2); deskSpot.position.set(0.9, 3.5, FZ - 7.2); deskSpot.target.position.set(0.9, 0.9, FZ - 7.4);
  deskSpot.castShadow = true; deskSpot.shadow.mapSize.set(1024, 1024); deskSpot.shadow.bias = -0.0005;
  lights.add(deskSpot, deskSpot.target);
  const sideFill = new THREE.PointLight(0x8aa2d0, 30, 22, 1.6); sideFill.position.set(-9, 5, FZ + 8);
  lights.add(canopy, canopy.target, lamp, lamp.target, lobby, sideFill);
  // narrow uplights in the pavement, grazing the concrete either side of the entrance: the building reads at night
  for (const x of [-8, -4.2, 4.2, 8]) {
    const up = new THREE.SpotLight(0xffe0b8, 520, 16, 0.2, 0.55, 1.4); up.position.set(x, 0.05, FZ + 0.35); up.target.position.set(x, 12, FZ - 0.2);
    lights.add(up, up.target);
    add(new THREE.CircleGeometry(0.09, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.9, 1.5) }), x, 0.006, FZ + 0.35).castShadow = false;
  }

  return {
    group: g, ready: pave.userData.wait,
    // the doors open as anyone comes within 2.8 m of them, and stay open while someone is near
    doors(people) {
      const near = Math.min(...people.map(p => Math.hypot(p.x, p.z - FZ)));
      const open = smooth(clamp01((2.8 - near) / 1.2));
      for (const { leaf, sx } of leaves) leaf.position.set(sx * (DW / 4 + open * (DW / 2 - 0.15)), 0, FZ - 0.05);
    },
  };
}

/* ---------- the two presenters: on the street, then in the lounge ---------- */
// where to start a walk so that its length is a whole number of strides: the feet then plant without sliding
// (the start is moved along the walk's first leg; the walk's own scaling then stays within a percent)
function fitStart(actor, start, path, { gait = 'loop', startClip = false } = {}) {
  const c = actor.clips, unit = c[gait].dist, fixed = (startClip ? c.start.dist : 0) + c.stop.dist;
  let s = [...start];
  for (let i = 0; i < 4; i++) {
    const L = new THREE.CatmullRomCurve3([new V(s[0], 0, s[1]), ...path.map(([x, z]) => new V(x, 0, z))], false, 'centripetal').getLength();
    const n = Math.max(1, Math.round((L - fixed) / unit)), want = fixed + n * unit, d = want - L;
    const dir = new V(s[0] - path[0][0], 0, s[1] - path[0][1]).normalize();
    s = [s[0] + dir.x * d, s[1] + dir.z * d];
  }
  return s;
}
async function stageCast(scene) {
  const tl = new THREE.TextureLoader();
  const [andy, georgie] = await Promise.all(['andy', 'georgie'].map(k => createActor(k, tl, { realistic: true, wardrobe: 'show' })));
  // outside: along the pavement, side by side (Georgie half a step ahead, on the building's side), and in at the door
  andy.standAt(-11.6, FZ + 2.75, Math.PI / 2);
  // still walking at the cut: their walks' closing stop is dropped (it would pull them back out of the lounge later)
  // in at the doors, through the lobby past the reception desk (on their right) to the corridor at the back left
  const a1 = andy.walk({ path: [[-6, FZ + 2.75], [-1.6, FZ + 2.7], [-0.45, FZ + 1.6], [-0.4, FZ + 0.2], [-0.9, FZ - 2.6], [-2.2, FZ - 5.6], [-3.3, FZ - 8.6], [-3.6, FZ - 10.6]], arriveAt: 14.3, startClip: false });
  andy.segs.pop();
  georgie.standAt(-10.9, FZ + 2.05, Math.PI / 2);
  const g1 = georgie.walk({ path: [[-5.4, FZ + 2.05], [-1.3, FZ + 2.0], [0.35, FZ + 1.2], [0.4, FZ + 0.2], [-0.2, FZ - 2.8], [-1.6, FZ - 6.0], [-2.9, FZ - 8.9], [-3.3, FZ - 10.6]], arriveAt: 14.5, startClip: false });
  georgie.segs.pop();
  // inside: out of their dressing rooms (Melbourne side) to their armchairs, and down
  const chair = { andy: { x: -1.45, z: -9.95, h: 0.3 }, georgie: { x: 1.45, z: -9.95, h: -0.3 } };
  const mark = (a, c) => {
    const m = a.sitMark([0, 0], SEAT_TOP), s = Math.sin(c.h), co = Math.cos(c.h);   // the stand-off for heading 0, turned to the chair's
    return [c.x + m[0] * co + m[1] * s, c.z - m[0] * s + m[1] * co + 0.04];
  };
  const mA = mark(andy, chair.andy), pA = [[1.6, -8.25], [0, -8.12], [-1.15, -8.45], mA];
  andy.standAt(...fitStart(andy, [3.0, -9.55], pA), -Math.PI / 2);
  const a2 = andy.walk({ path: pA, at: OUTSIDE, startClip: false, endHeading: chair.andy.h, turnTime: 1.4 });
  const sA = andy.sit({ at: a2.end - 0.1 });
  const mG = mark(georgie, chair.georgie), pG = [[2.2, -8.35], [1.6, -8.75], mG];
  georgie.standAt(...fitStart(georgie, [3.0, -8.75], pG), -Math.PI / 2);
  const g2 = georgie.walk({ path: pG, at: OUTSIDE + 0.35, startClip: false, endHeading: chair.georgie.h, turnTime: 1.4 });
  const sG = georgie.sit({ at: g2.end - 0.1 });
  const cast = [andy, georgie];
  cast.forEach(a => scene.add(a.group));
  return { andy, georgie, cast, info: { a1, g1, a2, g2, sA, sG } };
}

/* ---------- sitting in a low armchair: the legs bend further so the feet stay on the floor ----------
   The library's sit-down is for a desk chair; lowered onto these 37 cm cushions the whole body would go down with it,
   feet through the floor. Here the body is lowered, then each leg (thigh, calf) is solved analytically so the ankle
   stays where it was, the knee bending in its own plane, and the foot keeps its own angle on the floor. */
const _v = [new V(), new V(), new V(), new V(), new V()], _q = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
function rotateBoneWorld(bone, qWorld) {
  // apply a world-space rotation to a bone, keeping its parent
  bone.getWorldQuaternion(_q[0]); bone.parent.getWorldQuaternion(_q[1]);
  bone.quaternion.copy(_q[1].invert().multiply(qWorld.clone().multiply(_q[0])));
  bone.updateWorldMatrix(false, true);
}
function legIK(a, side, raise) {
  const b = a.bones, thigh = b[`Bip01_${side}_Thigh`], calf = b[`Bip01_${side}_Calf`], foot = b[`Bip01_${side}_Foot`];
  if (!thigh || !calf || !foot) return;
  const footQ = foot.getWorldQuaternion(new THREE.Quaternion());
  const H = thigh.getWorldPosition(_v[0]), K = calf.getWorldPosition(_v[1]), A = foot.getWorldPosition(_v[2]);
  const T = A.clone(); T.y += raise;                                       // where the ankle was before the body went down
  const la = H.distanceTo(K), lb = K.distanceTo(A), d = Math.min(H.distanceTo(T), la + lb - 1e-4);
  // 1. the knee: bend it so hip to ankle is as long as hip to target
  const cur = _v[3].copy(H).sub(K).normalize().angleTo(_v[4].copy(A).sub(K).normalize());
  const want = Math.acos(THREE.MathUtils.clamp((la * la + lb * lb - d * d) / (2 * la * lb), -1, 1));
  const axis = new V().subVectors(H, K).cross(new V().subVectors(A, K)).normalize();
  if (axis.lengthSq() > 0.5) rotateBoneWorld(calf, new THREE.Quaternion().setFromAxisAngle(axis, want - cur));
  // 2. the hip: swing the leg so the ankle lands on the target
  const A2 = foot.getWorldPosition(new V());
  rotateBoneWorld(thigh, new THREE.Quaternion().setFromUnitVectors(A2.sub(H).normalize(), T.clone().sub(H).normalize()));
  // 3. the foot keeps its angle (flat on the floor)
  foot.parent.getWorldQuaternion(_q[2]); foot.quaternion.copy(_q[2].invert().multiply(footQ)); foot.updateWorldMatrix(false, true);
}

function posePresenter(a, T) {
  a.pose(T);
  const drop = Math.min(0, a.group.position.y);                         // how far the sit-down took the body under the floor
  a.group.position.y += SOLE[a.key]; a.group.updateMatrixWorld(true);
  if (drop < 0) { legIK(a, 'L', -drop); legIK(a, 'R', -drop); }
}

/* ---------- the camera: always low, at the shoes ---------- */
const curve = pts => new THREE.CatmullRomCurve3(pts.map(p => new V(...p)), false, 'centripetal');
function midOf(cast, T) { const a = cast.andy.where(T), g = cast.georgie.where(T); return { x: (a.x + g.x) / 2, z: (a.z + g.z) / 2, h: lerpAngle(a.heading, g.heading, 0.5) }; }
// behind the pair, at ankle height, along a delayed heading, the way a dolly would trail them
function trail(cast, T, back, y, ahead, ty) {
  const p = midOf(cast, T), lag = midOf(cast, T - 0.9), h = lerpAngle(lag.h, p.h, 0.3), f = new V(Math.sin(h), 0, Math.cos(h));
  return { pos: new V(p.x, y, p.z).addScaledVector(f, -back), target: new V(p.x, ty, p.z).addScaledVector(f, ahead) };
}
// the lounge: low along the front wall, between the table and the wall, with them (Georgie sits first, then Andrej,
// seen from the side); then on alone through the BACKSTAGE door, which swings as the camera comes
const LOUNGE_KEYS = [[OUTSIDE, [3.3, 0.17, -7.72]], [11.2 + RX, [1.5, 0.18, -7.66]], [13 + RX, [-0.1, 0.19, -7.62]], [15.5 + RX, [-1.15, 0.2, -7.66]], [17.8 + RX, [-1.55, 0.24, LOUNGE_DOOR.z + 0.05]], [19.4 + RX, [-3.45, 0.3, LOUNGE_DOOR.z]], [PRO, [-5.2, 0.4, LOUNGE_DOOR.z + 0.1]]];
const LOUNGE_PATH = curve(LOUNGE_KEYS.map(k => k[1]));
// the path's parameter over time: a monotone cubic through the keys (Fritsch–Carlson), so the dolly's speed changes
// smoothly from key to key instead of jumping; it starts already moving (the cut lands on a moving camera)
const loungeU = (() => {
  const xs = LOUNGE_KEYS.map(k => k[0]), n = xs.length - 1, ys = xs.map((_, i) => i / n);
  const d = xs.slice(1).map((x, i) => (ys[i + 1] - ys[i]) / (x - xs[i]));
  const m = xs.map((_, i) => (i === 0 ? d[0] : i === n ? d[n - 1] : d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i])));
  return T => {
    if (T <= xs[0]) return 0; if (T >= xs[n]) return 1;
    let i = 0; while (T > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (T - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
})();
export function cameraAt(cast, T) {
  if (T < WIDE) {
    // the building at night, from across the pavement, low: the sign, the canopy, the lit lobby, the wet slabs
    const u = smooth(T / WIDE);
    return { pos: new V(3.2 - 0.8 * u, 0.4 + 0.05 * u, FZ + 11.5 - 1.2 * u), target: new V(0.2, 2.7, FZ), fov: 46 };
  }
  if (T < OUTSIDE) {
    // behind their shoes through the doors into the lobby; there the camera lets them go on to the left and drifts on
    // towards the reception desk, its lit D//0 low in the frame
    const c = trail(cast, T, 1.9, 0.16, 2.4, 0.13);
    const u = smooth(clamp01((T - 7.4) / (OUTSIDE - 7.4)));
    const deskPos = new V(0.15, 0.17, FZ - 1.6).lerp(new V(0.55, 0.19, FZ - 3.9), u), deskAim = new V(0.85, 0.42, FZ - 7.3);
    const w = ramp(T, 7.2, 9.0);
    return { pos: c.pos.lerp(deskPos, w), target: c.target.lerp(deskAim, w), fov: 40 };
  }
  const pos = LOUNGE_PATH.getPoint(loungeU(T));
  // the door: its threshold, then on out into the dark studio
  const look = new V(-3.5, 0.62, LOUNGE_DOOR.z).lerp(new V(-7, 0.45, LOUNGE_DOOR.z), ramp(T, 18.9 + RX, 20.2 + RX));
  // their feet: both as they come in, then Andrej's to his chair; then straight on to the door
  const a = cast.andy.where(T), m = midOf(cast, T);
  const feet = new V(m.x, 0.02, m.z).lerp(new V(a.x, 0.0, a.z), ramp(T, 10.5 + RX, 12.5 + RX));
  return { pos, target: feet.lerp(look, ramp(T, 16.9 + RX, 18.1 + RX)), fov: 40 };
}

/* ---------- boot ---------- */
export async function buildArrival(scene, renderer) {
  // the night city (Poly Haven, CC0), only as reflections in glass and wet ground: not as light, not as a backdrop
  const hdr = await new RGBELoader().setDataType(THREE.FloatType).loadAsync(`${CC0}modern_buildings_night_4k.hdr`);
  // its street lamps are thousands of times brighter than the night around them; in a wet floor at a grazing angle they
  // would bloom into white blots. Clamped, they stay small bright glints, as a camera sees them
  const px = hdr.image.data; for (let i = 0; i < px.length; i++) if ((i & 3) !== 3) px[i] = Math.min(px[i], 1.6);
  const pm = new THREE.PMREMGenerator(renderer), nightEnv = pm.fromEquirectangular(hdr).texture; hdr.dispose(); pm.dispose();
  const street = buildStreet(nightEnv); scene.add(street.group);
  await street.ready;
  // a warm light by the BACKSTAGE door inside the lounge, so the door and its frame read as the camera goes to it
  const doorLight = new THREE.PointLight(0xffc68a, 0, 6, 1.5); doorLight.position.set(-3.1, 2.75, LOUNGE_DOOR.z); scene.add(doorLight);
  const cast = await stageCast(scene);
  const heads = new V(), ndc = new V();
  // contact shadows: a soft blot under each shoe, darkest when the sole is down, gone as the foot lifts
  const blotTex = blot(), feet = [];
  for (const a of cast.cast) for (const side of ['L', 'R']) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blotTex, transparent: true, depthWrite: false, color: 0x000000, opacity: 0 }));
    m.renderOrder = 2; scene.add(m);
    feet.push({ a, foot: a.bones[`Bip01_${side}_Foot`], toe: a.bones[`Bip01_${side}_Toe0`], m });
  }
  const fp = new V(), tp = new V();
  function placeBlots(T) {
    const groundY = T < OUTSIDE ? 0.004 : 0.006;
    for (const f of feet) {
      f.m.visible = f.a.group.visible;
      if (!f.m.visible) continue;
      f.foot.getWorldPosition(fp); (f.toe || f.foot).getWorldPosition(tp);
      const lift = clamp01((fp.y - f.a.group.position.y - 0.085) / 0.12);
      f.m.position.set((fp.x + tp.x) / 2, groundY, (fp.z + tp.z) / 2);
      f.m.rotation.y = Math.atan2(tp.x - fp.x, tp.z - fp.z);
      f.m.scale.set(0.16 + 0.08 * lift, 1, 0.34 + 0.1 * lift);
      f.m.material.opacity = 0.62 * (1 - lift) * (1 - lift);
    }
  }

  return {
    PRO, WIDE, OUTSIDE, info: cast.info,
    // pose everything for T, show the right part, and give the camera
    pose(T, studio) {
      const outside = T < OUTSIDE;
      street.group.visible = outside;
      studio.lounge.light(!outside);
      doorLight.intensity = outside ? 0 : 30;
      // the library's soles sit a few millimetres under the ground at each step (measured: Andy'K 7 mm, Georgie's heels
      // 16 mm): lifted so they stand on it
      for (const a of cast.cast) { posePresenter(a, T); a.group.visible = T >= WIDE; }
      placeBlots(T);
      const cam = cameraAt(cast, T);
      // an operator's hands on a low dolly: a few millimetres of slow drift, never a shake
      const hx = Math.sin(T * 0.83 + 1.1) * 0.004 + Math.sin(T * 1.91) * 0.0015, hy = Math.sin(T * 0.67 + 2.3) * 0.003, hz = Math.sin(T * 0.59) * 0.003;
      cam.pos.x += hx; cam.pos.y += hy; cam.pos.z += hz; cam.target.x += hx * 2.5; cam.target.y += hy * 2.5;
      street.doors([...cast.cast.map(a => a.where(T)), { x: cam.pos.x, z: cam.pos.z }]);
      return cam;
    },
    hide(studio) { doorLight.intensity = 0; street.group.visible = false; for (const a of cast.cast) a.group.visible = false; for (const f of feet) f.m.visible = false; studio.lounge.light(false); },
    show() {},
    // review: the lowest point of each presenter's skinned mesh over time (soles under the ground are below 0)
    soles(times) {
      const box = new THREE.Box3(), out = {};
      for (const T of times) for (const a of cast.cast) {
        posePresenter(a, T); let lo = Infinity;
        a.group.traverse(o => { if (o.isSkinnedMesh) { o.computeBoundingBox(); box.copy(o.boundingBox).applyMatrix4(o.matrixWorld); lo = Math.min(lo, box.min.y); } });
        const ground = T < OUTSIDE ? 0.002 : 0.004;
        out[a.key] = Math.min(out[a.key] ?? Infinity, +(lo - ground).toFixed(4));
      }
      return out;
    },
    // review: is any head inside the picture? (never wanted)
    headsInFrame(camera) {
      return cast.cast.filter(a => { if (!a.group.visible) return false; a.bones.Bip01_Head.getWorldPosition(heads); ndc.copy(heads).project(camera); return Math.abs(ndc.x) < 1.05 && Math.abs(ndc.y) < 1.05 && ndc.z < 1; }).map(a => a.key);
    },
    // the moments a foot lands, for the footsteps in the mix: [T, 'street' | 'lounge']
    footsteps() {
      const out = [], prev = {}, foot = new V();
      for (let T = 0; T < 17 + RX; T += 1 / 120) {
        for (const a of cast.cast) {
          a.pose(T);
          for (const side of ['L', 'R']) {
            a.bones[`Bip01_${side}_Foot`].getWorldPosition(foot);
            const k = a.key + side, y = foot.y - a.group.position.y, p = prev[k];
            if (p && p.y > 0.115 && y <= 0.115 && T - (p.last || -1) > 0.3) { out.push([+T.toFixed(3), T < OUTSIDE ? 'street' : 'lounge', a.key]); p.last = T; }
            prev[k] = { y, last: p?.last };
          }
        }
      }
      return out;
    },
  };
}
