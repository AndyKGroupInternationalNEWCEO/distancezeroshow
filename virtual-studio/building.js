// The studio building, its street and its reception: the night street with the building's glass entrance, the canopy
// and the D//0 sign, wet pavement, the buildings across the street, and inside the doors the lobby with the reception
// desk (the D//0 logo lit in its front) and the corridor to backstage. Made for the arrival before the opening
// (production/empty-opening/arrival.js), and shown in the Virtual Space as RECEPTION and BUILDING (spaces.js).
// It stands well clear of the studio: the front faces +z at FZ.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

export const FZ = 34;                      // the building's front, facing +z, well clear of the studio floor (r 26)
const clamp01 = x => Math.max(0, Math.min(1, x));
const smooth = x => x * x * (3 - 2 * x);

/* ---------- small canvas helpers ---------- */
export function canvasTex(w, h, draw, srgb = true) {
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
let CC0 = '';   // where the CC0 textures are (set by buildStreet)
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

/* ---------- the street: the building's front with its glass entrance, a canopy, the D//0 sign, wet pavement ---------- */
export function buildStreet(nightEnv, { cc0: base, furnish = false } = {}) {
  CC0 = base;
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
  const logoTex = new THREE.TextureLoader().load(new URL('../assets/logo-do-1k.webp', import.meta.url).href); logoTex.colorSpace = THREE.SRGBColorSpace;
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
  if (furnish) furnishLobby({ g, add, glass, champagne, stone });
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
  const name = add(new THREE.PlaneGeometry(4.2, 0.66), new THREE.MeshBasicMaterial({ map: text('DISTANCE // ZERO', { w: 2048, h: 320, size: 118 }), transparent: true, toneMapped: false, color: new THREE.Color(1.2, 1.2, 1.25) }), 0, 4.15, FZ + 0.02);
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

/* ---------- the reception, furnished (the Virtual Space; the arrival keeps its bare lobby): a polished marble floor,
   a crystal chandelier over the room, a sofa and low table, framed show posters, and in the back wall the two ways on:
   a sliding glass door to the studio (ON AIR over it) and a plain door to backstage, staff only ---------- */
function furnishLobby({ g, add, glass, champagne }) {
  const zBack = FZ - 9.99;
  // marble, polished: the room's light and the chandelier in it
  const marble = cc0('marble_01', [10 / 2.5, 9.6 / 2.5]);
  add(new THREE.PlaneGeometry(9.9, 9.5).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({ ...marble, color: 0x8a8378, roughness: 0.25,
    normalScale: new THREE.Vector2(0.3, 0.3), clearcoat: 0.8, clearcoatRoughness: 0.08 }), 0, 0.052, FZ - 5.3).castShadow = false;
  // dark oak on the side walls, to door height
  const oak = cc0('dark_wooden_planks', [9.6 / 2, 2.6 / 2]);
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.03, 2.6, 9.5), new THREE.MeshStandardMaterial({ ...oak, color: 0x6a5240, roughness: 0.7 }), sx * 4.93, 1.35, FZ - 5.3);

  // the crystal chandelier: three rings of glass rods hanging at different lengths from a champagne ring, lit warm
  const ch = new THREE.Group(); ch.position.set(0, 3.58, FZ - 4.6); g.add(ch);
  const rodMat = new THREE.MeshPhysicalMaterial({ color: 0xfff6ea, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, emissive: 0xffd2a0, emissiveIntensity: 0.45 });
  const rings = [[0.75, 40, 0.9], [0.52, 30, 0.7], [0.3, 20, 0.5]], count = rings.reduce((n, r) => n + r[1], 0);
  const rods = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.011, 0.011, 1, 8), rodMat, count), m4 = new THREE.Matrix4();
  let i = 0, seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const [r, n, len] of rings) for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, l = len * (0.75 + 0.5 * rnd());
    m4.compose(new THREE.Vector3(Math.cos(a) * r, -0.05 - l / 2, Math.sin(a) * r), new THREE.Quaternion(), new THREE.Vector3(1, l, 1)); rods.setMatrixAt(i++, m4);
  }
  ch.add(rods);
  for (const [r] of rings) { const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 8, 64).rotateX(Math.PI / 2), champagne); ring.position.y = -0.04; ch.add(ring); }
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.05, 8), champagne); ch.add(rod);
  const glow = new THREE.PointLight(0xffd9b0, 16, 8, 2); glow.position.y = -0.55; ch.add(glow);

  // (the sofa, armchairs, table, plants and lamps are real scanned models: spaces.js, PROPS)

  // framed show posters on the right wall
  const loader = new THREE.TextureLoader();
  for (const [img, z] of [['keyvisual.jpg', FZ - 3.2], ['studio-still.jpg', FZ - 6.6]]) {
    const tex = loader.load(CC0 + '../' + img); tex.colorSpace = THREE.SRGBColorSpace;
    const frame = add(new THREE.BoxGeometry(0.04, 1.06, 1.66), champagne, 4.9, 1.72, z);
    const pic = add(new THREE.PlaneGeometry(1.56, 0.96), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 }), 4.875, 1.72, z); pic.rotation.y = -Math.PI / 2; pic.castShadow = false;
    frame.castShadow = false;
  }

  // the way to the show: a sliding glass door in the corridor opening (x −4.2 … −3.0), ON AIR over it
  for (const sx of [-1, 1]) {
    const leaf = add(new THREE.BoxGeometry(0.6, 2.36, 0.02), glass, -3.6 + sx * 0.3, 1.23, zBack + 0.02);
    leaf.castShadow = false;
    add(new THREE.BoxGeometry(0.02, 2.36, 0.03), champagne, -3.6 + sx * 0.59, 1.23, zBack + 0.02);
  }
  add(new THREE.BoxGeometry(1.24, 0.04, 0.05), champagne, -3.6, 2.42, zBack + 0.02);
  const onAir = add(new THREE.PlaneGeometry(0.9, 0.22), new THREE.MeshBasicMaterial({ map: text('STUDIO  ·  ON AIR', { w: 1024, h: 256, size: 110, color: '#ff4a3d' }), transparent: true, toneMapped: false }), -3.6, 2.7, zBack + 0.03);
  onAir.castShadow = false;
  // backstage: a plain dark door, staff only
  add(new THREE.BoxGeometry(1.0, 2.2, 0.05), new THREE.MeshStandardMaterial({ color: 0x15130f, roughness: 0.6 }), 3.6, 1.15, zBack + 0.025);
  add(new THREE.BoxGeometry(0.03, 0.3, 0.03), champagne, 3.2, 1.1, zBack + 0.07);
  const staff = add(new THREE.PlaneGeometry(1.1, 0.22), new THREE.MeshBasicMaterial({ map: text('BACKSTAGE  ·  STAFF ONLY', { w: 1024, h: 200, size: 72, color: '#d8c9ac' }), transparent: true, toneMapped: false }), 3.6, 2.45, zBack + 0.03);
  staff.castShadow = false;
}
