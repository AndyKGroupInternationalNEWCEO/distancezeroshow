// The DISTANCE // ZERO set, modelled in code (no downloaded models): units are metres, y is up, the studio
// cameras stand at +z looking towards the LED wall at -z. Andy'K (Vienna) sits on the left, Georgie
// (Melbourne) on the right, as seen from the cameras.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { roughnessNoise, leatherNormal, brushed, ventTexture, panelJoints, floorMaps, contactShadow, arcShadow, bendX } from './details.js';
import { createWall, createPylon, createDeskFascia, createFloorInlay, gradientTexture, label, studioSign, AMBER, ICE } from './screens.js';

export const RISER = 0.16;            // stage riser height
export const DESK_CENTER = -4.4;      // z of the circle the desk is an arc of
export const SEATS = { andy: new THREE.Vector3(-0.95, RISER, -1.95), georgie: new THREE.Vector3(0.95, RISER, -1.95) };
const C = { amber: new THREE.Color(AMBER), ice: new THREE.Color(ICE), champagne: new THREE.Color('#e3c79a'), warm: new THREE.Color('#fff0dc'), cool: new THREE.Color('#e6efff') };

/* ---------- materials ---------- */

function materials(q) {
  const physical = o => new THREE.MeshPhysicalMaterial(o);
  const rough = roughnessNoise(2), brush = brushed(1);
  const M = {
    floor: new THREE.MeshStandardMaterial({ color: 0x0b0c0f, metalness: 0.2, roughness: 0.6 }),
    riser: physical({ color: 0x07080a, metalness: 0.25, roughness: 0.56, roughnessMap: rough, clearcoat: 0.3, clearcoatRoughness: 0.35 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x17191d, metalness: 0.85, roughness: 0.4, roughnessMap: rough }),
    graphite: new THREE.MeshStandardMaterial({ color: 0x222429, metalness: 0.9, roughness: 0.32, roughnessMap: rough }),
    brushed: physical({ color: 0x3a3e45, metalness: 1, roughness: 0.34, roughnessMap: brush, anisotropy: 0.6 }),
    alu: physical({ color: 0x8d9299, metalness: 1, roughness: 0.36, roughnessMap: brush, anisotropy: 0.8 }),
    edge: new THREE.MeshStandardMaterial({ color: 0xdfe3e8, metalness: 1, roughness: 0.14 }),
    seam: new THREE.MeshStandardMaterial({ color: 0x020203, metalness: 0.2, roughness: 0.9 }),
    // not mirror-smooth: a near-perfect finish focuses a spotlight into one point that bloom turns into a square
    deskGlass: physical({ color: 0x07090c, metalness: 0, roughness: 0.24, ior: 1.5, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    vent: new THREE.MeshStandardMaterial({ map: ventTexture(), metalness: 0.6, roughness: 0.5 }),
    champagne: physical({ color: 0xc9a671, metalness: 1, roughness: 0.24, roughnessMap: brush, anisotropy: 0.5 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xe8ebef, metalness: 1, roughness: 0.07 }),
    satin: new THREE.MeshStandardMaterial({ color: 0x6e737b, metalness: 1, roughness: 0.6, roughnessMap: rough }), // big flat chrome: mirror finish blows out from above
    blackGlass: physical({ color: 0x0b0c0e, metalness: 0.3, roughness: 0.62, clearcoat: 0.15, clearcoatRoughness: 0.5 }),
    shellGold: physical({ color: 0x8a7350, metalness: 1, roughness: 0.55, roughnessMap: brush, anisotropy: 0.4 }), // satin: a mirror finish turned rim light into neon outlines
    leather: physical({ color: 0x0a0a0c, metalness: 0, roughness: 0.62, normalMap: leatherNormal(4), normalScale: new THREE.Vector2(0.5, 0.5), sheen: 0.25, sheenColor: new THREE.Color(0x2a2c31), sheenRoughness: 0.5, clearcoat: 0.15, clearcoatRoughness: 0.6 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x0c0c0d, metalness: 0, roughness: 0.85 }),
    camBody: new THREE.MeshStandardMaterial({ color: 0x2c2f35, metalness: 0.55, roughness: 0.5, roughnessMap: rough }),
    camLight: new THREE.MeshStandardMaterial({ color: 0x8c9099, metalness: 0.6, roughness: 0.46, roughnessMap: rough }),
    lensGlass: physical({ color: 0x0a0d14, metalness: 0.2, roughness: 0.02, clearcoat: 1, iridescence: 0.6, iridescenceIOR: 1.6 }),
    prompterGlass: physical({ color: 0x0d1015, metalness: 0.4, roughness: 0.02, transparent: true, opacity: 0.55 }),
    wallBack: new THREE.MeshStandardMaterial({ color: 0x0a0b0d, metalness: 0.2, roughness: 0.9 }),
    fin: new THREE.MeshStandardMaterial({ color: 0x15171b, metalness: 0.9, roughness: 0.46, roughnessMap: rough }),
    logoWarm: q.glass
      ? physical({ color: 0xffffff, metalness: 0, roughness: 0.06, transmission: 1, thickness: 0.35, ior: 1.5, attenuationColor: new THREE.Color(0xf2b77a), attenuationDistance: 0.7, clearcoat: 1, specularIntensity: 1 })
      : physical({ color: 0xb59a7c, metalness: 1, roughness: 0.12, clearcoat: 1 }),
    logoCool: q.glass
      ? physical({ color: 0xffffff, metalness: 0, roughness: 0.06, transmission: 1, thickness: 0.35, ior: 1.5, attenuationColor: new THREE.Color(0xbcd4f2), attenuationDistance: 0.7, clearcoat: 1, specularIntensity: 1 })
      : physical({ color: 0xaab4c2, metalness: 1, roughness: 0.12, clearcoat: 1 }),
  };
  // large flat dark surfaces: at low camera angles they would mirror the overhead softbox and read as pale slabs
  M.blackGlass.envMapIntensity = 0.25;
  M.blackGlass.roughnessMap = rough;
  M.deskGlass.envMapIntensity = 0.18;
  M.shellGold.envMapIntensity = 0.35; // chair shells: at grazing angles they mirrored the bright side panels like neon
  M.floor.envMapIntensity = 0.35;
  M.riser.envMapIntensity = 0.35;
  return M;
}

// glowing materials: colour values above 1 feed the bloom; `level` is set every frame by the lighting
function glow(color, map) {
  const m = new THREE.MeshBasicMaterial({ color: color.clone(), map: map || null, toneMapped: true });
  m.userData.base = color.clone();
  return m;
}

const shadows = (o, cast = true, receive = true) => o.traverse(c => { if (c.isMesh) { c.castShadow = cast; c.receiveShadow = receive; } });

/* ---------- geometry helpers ---------- */

// an annular sector in the floor plane, centred on +z (the side facing the cameras)
function arcShape(r0, r1, span) {
  const s = new THREE.Shape();
  const a0 = -Math.PI / 2 - span, a1 = -Math.PI / 2 + span;
  s.absarc(0, 0, r1, a0, a1, false);
  s.lineTo(r0 * Math.cos(a1), r0 * Math.sin(a1));
  s.absarc(0, 0, r0, a1, a0, true);
  s.closePath();
  return s;
}
function arcSlab(r0, r1, span, h, bevel = 0) {
  const g = new THREE.ExtrudeGeometry(arcShape(r0, r1, span), { depth: h, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 128 });
  g.rotateX(-Math.PI / 2); // shape (x, y) → world (x, extrude, -y)
  return g;
}
// a band on a vertical cylinder, centred on +z
const band = (r, h, span, segs = 128) => new THREE.CylinderGeometry(r, r, h, segs, 1, true, -span, span * 2);

function roundRectShape(x, y, w, h, r, shape = new THREE.Shape()) {
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y); shape.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(x + w, y + h - r); shape.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  shape.lineTo(x + r, y + h); shape.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(x, y + r); shape.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return shape;
}

/* ---------- build ---------- */

export function buildStudio({ scene, quality }) {
  const M = materials(quality);
  const root = new THREE.Group();
  scene.add(root);
  const anim = [];           // per-frame updaters: (t, dt, look) => void
  const glows = { amber: [], ice: [], white: [], gradient: [], red: [] };
  const add = (o, parent = root) => { parent.add(o); return o; };
  const mesh = (geo, mat, parent = root) => add(new THREE.Mesh(geo, mat), parent);
  const gradTex = gradientTexture();

  /* ----- floor, riser, rings ----- */
  const floorGeo = new THREE.CircleGeometry(26, 96).rotateX(-Math.PI / 2);
  const floor = mesh(floorGeo, M.floor);
  floor.receiveShadow = true;
  const fm = floorMaps();
  floor.material.map = fm.map; floor.material.roughnessMap = fm.roughness;
  if (quality.reflections) { floor.material.transparent = true; floor.material.opacity = 0.85; }

  const riser = mesh(new THREE.CylinderGeometry(3.3, 3.36, RISER, 128), M.riser);
  riser.position.set(0, RISER / 2, -1.9);
  riser.receiveShadow = true; riser.castShadow = true;
  const riserLed = glow(new THREE.Color(1, 1, 1), gradTex);
  const riserBand = mesh(new THREE.CylinderGeometry(3.365, 3.365, 0.025, 128, 1, true), riserLed);
  riserBand.position.set(0, 0.03, -1.9);
  glows.gradient.push({ m: riserLed, k: 1.6 });
  // riser deck: radial panel joints and a brushed edge band
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.31, j = mesh(new THREE.BoxGeometry(0.006, 0.002, 2.6), M.seam);
    j.position.set(Math.sin(a) * 1.95, RISER + 0.001, -1.9 + Math.cos(a) * 1.95); j.rotation.y = a;
  }
  const riserEdge = mesh(new THREE.CylinderGeometry(3.335, 3.335, 0.02, 128, 1, true), M.alu);
  riserEdge.position.set(0, RISER - 0.012, -1.9);

  for (const [r, k] of [[4.6, 1.1], [5.9, 0.55]]) {
    const ringMat = glow(new THREE.Color(1, 1, 1), gradTex);
    ringMat.transparent = true;
    const ring = mesh(new THREE.RingGeometry(r, r + 0.018, 192).rotateX(-Math.PI / 2), ringMat);
    ring.position.set(0, 0.004, -1.9);
    glows.gradient.push({ m: ringMat, k });
  }
  const inlay = mesh(new THREE.PlaneGeometry(6, 0.75).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: createFloorInlay(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  inlay.position.set(0, 0.005, 2.35);
  inlay.material.userData.base = new THREE.Color(1, 1, 1);
  glows.white.push({ m: inlay.material, k: 0.75 });

  /* ----- the curved presentation desk ----- */
  const desk = add(new THREE.Group());
  desk.userData.focus = 'desk';
  desk.position.set(0, RISER, DESK_CENTER);
  const span = 0.56;
  const body = mesh(arcSlab(3.5, 3.98, span, 0.74), M.dark, desk);
  const top = mesh(arcSlab(3.24, 4.14, span + 0.035, 0.05, 0.012), M.blackGlass, desk);
  top.position.y = 0.745;
  const trim = mesh(band(4.155, 0.05, span + 0.035), M.champagne, desk);
  trim.position.y = 0.77;
  // fascia with names and wordmark, lit from inside
  const fasciaMat = new THREE.MeshStandardMaterial({ color: 0x0c0d10, metalness: 0.6, roughness: 0.3, emissive: 0xffffff, emissiveMap: createDeskFascia(), emissiveIntensity: 1 });
  fasciaMat.side = THREE.DoubleSide;
  const fascia = mesh(band(3.99, 0.26, span - 0.02), fasciaMat, desk);
  fascia.position.y = 0.46;
  anim.push((t, dt, L) => { fasciaMat.emissiveIntensity = 0.35 + 0.9 * L.accent; });
  // LED lines: under the overhang (ice), along the kick plate (amber → ice)
  const under = glow(C.ice);
  mesh(band(3.995, 0.014, span), under, desk).position.y = 0.705;
  glows.ice.push({ m: under, k: 2.4 });
  const kick = glow(new THREE.Color(1, 1, 1), gradTex);
  mesh(band(3.96, 0.02, span), kick, desk).position.y = 0.06;
  glows.gradient.push({ m: kick, k: 2 });
  // recessed plinth so the desk floats
  mesh(arcSlab(3.6, 3.9, span - 0.02, 0.05), M.rubber, desk);
  // brushed aluminium bands, a smoked glass lip along the front of the top, a bright edge highlight
  mesh(band(3.985, 0.05, span), M.alu, desk).position.y = 0.11;
  mesh(band(3.985, 0.026, span), M.alu, desk).position.y = 0.675;
  const lip = mesh(arcSlab(3.97, 4.125, span + 0.03, 0.008), M.deskGlass, desk);
  lip.position.y = 0.8;
  mesh(band(4.163, 0.006, span + 0.035), M.edge, desk).position.y = 0.797;
  // construction joints between the panels (placed between the names, never across them)
  const fs = span - 0.02;
  for (const u of [0.13, 0.38, 0.62, 0.87]) {
    const a = -fs + u * 2 * fs, j = mesh(new THREE.BoxGeometry(0.005, 0.54, 0.006), M.seam, desk);
    j.position.set(3.982 * Math.sin(a), 0.405, 3.982 * Math.cos(a)); j.rotation.y = a;
  }
  for (const y of [0.325, 0.595]) mesh(band(3.984, 0.004, span), M.seam, desk).position.y = y;
  // brushed end plates (dark, so they do not flare in the key light)
  for (const sgn of [-1, 1]) {
    const a = sgn * span, e = mesh(new THREE.BoxGeometry(0.012, 0.74, 0.5), M.brushed, desk);
    e.position.set(3.74 * Math.sin(a), 0.37, 3.74 * Math.cos(a)); e.rotation.y = a;
  }
  shadows(desk);
  const deskShadow = arcShadow(3.35, 4.3, span + 0.06, 0.72);
  deskShadow.position.y = 0.003;
  desk.add(deskShadow);

  // desk props: broadcast microphones and slim monitors facing the presenters
  for (const [seat, col] of [[SEATS.andy, C.amber], [SEATS.georgie, C.ice]]) {
    const m = microphone(M, col, glows);
    m.position.set(seat.x * 0.92, RISER + 0.807, -1.02);
    m.rotation.y = Math.PI + (seat.x < 0 ? -0.15 : 0.15);
    add(m);
    const ms = contactShadow(0.2, 0.2, 0.5); ms.position.set(seat.x * 0.92, RISER + 0.809, -1.02); add(ms);
    const mon = new THREE.Group();
    mesh(new RoundedBoxGeometry(0.34, 0.21, 0.016, 2, 0.006), M.graphite, mon).position.y = 0.15;
    const screen = mesh(new THREE.PlaneGeometry(0.32, 0.19), new THREE.MeshBasicMaterial({ color: 0x1a2230 }), mon);
    screen.position.set(0, 0.15, -0.0085); screen.rotation.y = Math.PI;
    mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.06), M.brushed, mon).position.y = 0.03;
    mesh(new THREE.BoxGeometry(0.16, 0.008, 0.1), M.brushed, mon);
    mon.position.set(seat.x * 1.6, RISER + 0.807, -1.32);
    mon.rotation.y = seat.x < 0 ? 0.55 : -0.55;
    mon.rotation.x = -0.12;
    shadows(mon);
    add(mon);
  }

  /* ----- presenter chairs ----- */
  for (const seat of [SEATS.andy, SEATS.georgie]) {
    const ch = chair(M);
    ch.userData.focus = seat.x < 0 ? 'andy' : 'georgie';
    ch.position.copy(seat);
    ch.rotation.y = seat.x < 0 ? 0.12 : -0.12;
    add(ch);
    const cs = contactShadow(0.95, 0.95, 0.6); cs.position.set(seat.x, RISER + 0.003, seat.z); add(cs);
  }

  /* ----- LED video wall ----- */
  const wall = createWall(quality.wall);
  const WALL_R = 10, WALL_Z = 3, WALL_SPAN = 0.56, WALL_H = 4.6, WALL_Y = 3.1;
  const wallMat = new THREE.MeshBasicMaterial({ map: wall.texture, side: THREE.BackSide, toneMapped: true });
  const wallMesh = mesh(new THREE.CylinderGeometry(WALL_R, WALL_R, WALL_H, 160, 1, true, Math.PI - WALL_SPAN, WALL_SPAN * 2), wallMat);
  wallMesh.position.set(0, WALL_Y, WALL_Z);
  wallMesh.userData.focus = 'wall';
  const housing = mesh(new THREE.CylinderGeometry(WALL_R + 0.18, WALL_R + 0.18, WALL_H + 0.5, 160, 1, true, Math.PI - WALL_SPAN - 0.025, WALL_SPAN * 2 + 0.05), M.dark);
  housing.material = M.dark.clone(); housing.material.side = THREE.DoubleSide;
  housing.position.copy(wallMesh.position);
  for (const y of [WALL_Y - WALL_H / 2 - 0.04, WALL_Y + WALL_H / 2 + 0.04]) {
    const b = mesh(new THREE.CylinderGeometry(WALL_R - 0.02, WALL_R - 0.02, 0.05, 160, 1, true, Math.PI - WALL_SPAN - 0.02, WALL_SPAN * 2 + 0.04), M.champagne);
    b.material = M.champagne.clone(); b.material.side = THREE.DoubleSide;
    b.position.set(0, y, WALL_Z);
  }
  // LED cabinet edges: dark end caps with a champagne reveal, like the frame of a real LED wall
  for (const sgn of [-1, 1]) {
    const a = Math.PI + sgn * (WALL_SPAN + 0.006), r = WALL_R + 0.06;
    const cap = new THREE.Group();
    cap.position.set(r * Math.sin(a), WALL_Y, WALL_Z + r * Math.cos(a)); cap.rotation.y = a;
    mesh(new THREE.BoxGeometry(0.1, WALL_H + 0.5, 0.32), M.graphite, cap);
    mesh(new THREE.BoxGeometry(0.012, WALL_H + 0.08, 0.33), M.champagne, cap).position.x = -sgn * 0.045;
    add(cap);
  }
  // the wall's own light on the set
  const wallLight = new THREE.RectAreaLight(0xffffff, 1, 9, 3.6);
  wallLight.position.set(0, WALL_Y, WALL_Z - WALL_R + 0.3);
  wallLight.lookAt(0, 1.2, 0);
  add(wallLight);

  /* ----- the 3D logo, hanging in front of the wall ----- */
  const logo = buildLogo(M, glows);
  logo.userData.focus = 'wall';
  logo.position.set(-1.31 * 1.25, 3.62, -5.55);
  logo.scale.setScalar(1.25);
  add(logo);
  for (const x of [-1.2, 1.2]) {
    const cable = mesh(new THREE.CylinderGeometry(0.004, 0.004, 3.1), M.chrome);
    cable.position.set(x, 3.62 + 1.25 + 1.55, -5.5);
  }
  shadows(logo, true, false);
  anim.push((t, dt, L) => { logo.position.y = 3.62 + Math.sin(t * 0.45) * 0.015; });

  /* ----- Vienna and Melbourne light pylons ----- */
  const pylons = [];
  for (const [side, city, tz, coords, col] of [[-1, 'VIENNA', 'Europe/Vienna', '48.21° N · 16.37° E', AMBER], [1, 'MELBOURNE', 'Australia/Melbourne', '37.81° S · 144.96° E', ICE]]) {
    const p = createPylon({ city, tz, coords, color: col, ...(quality.mobile ? { w: 192, h: 1344 } : {}) });
    const g = add(new THREE.Group());
    g.position.set(side * 6.6, 0, -4.2);
    g.rotation.y = -side * 0.62;
    const face = mesh(new THREE.PlaneGeometry(0.62, 4.34), new THREE.MeshBasicMaterial({ map: p.texture }), g);
    face.position.y = 2.33;
    face.material.userData.base = new THREE.Color(1, 1, 1);
    glows.white.push({ m: face.material, k: 1.25 });
    const frame = mesh(new RoundedBoxGeometry(0.74, 4.6, 0.3, 3, 0.03), M.graphite, g);
    frame.position.set(0, 2.3, -0.16);
    mesh(new THREE.BoxGeometry(0.8, 0.06, 0.36), M.champagne, g).position.set(0, 0.03, -0.12);
    const ps = contactShadow(1.2, 0.8, 0.55); ps.position.z = -0.14; g.add(ps);
    shadows(g);
    pylons.push(p);
  }
  anim.push(() => pylons.forEach(p => p.draw()));

  /* ----- architecture: dark room, vertical fins with LED strips, ceiling truss ----- */
  const ROOM_R = 12.6, ROOM_Z = 1, ROOM_H = 8.4, A0 = Math.PI - 1.95, A1 = Math.PI + 1.95;
  const backWall = mesh(new THREE.CylinderGeometry(ROOM_R + 0.6, ROOM_R + 0.6, ROOM_H, 96, 1, true, A0 - 0.1, A1 - A0 + 0.2), M.wallBack);
  backWall.material = M.wallBack.clone(); backWall.material.side = THREE.BackSide;
  backWall.material.map = panelJoints(46, 3); // architectural panel joints, mostly glimpsed between the fins
  backWall.position.set(0, ROOM_H / 2, ROOM_Z);
  const ceiling = mesh(new THREE.CircleGeometry(ROOM_R + 1, 64).rotateX(Math.PI / 2), M.wallBack);
  ceiling.position.set(0, ROOM_H, ROOM_Z);

  const fins = [], strips = [];
  for (let a = A0; a <= A1 + 1e-6; a += 0.075) {
    // keep the fins out from behind the LED wall where they would never be seen
    const behindWall = Math.abs(a - Math.PI) < WALL_SPAN - 0.02;
    fins.push({ a, h: behindWall ? 1.2 : ROOM_H - 0.2 });
    if (!behindWall) strips.push(a + 0.0375);
  }
  const finMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 1, 0.7), M.fin, fins.length);
  const o = new THREE.Object3D();
  fins.forEach((f, i) => {
    o.position.set(ROOM_R * Math.sin(f.a), f.h / 2, ROOM_Z + ROOM_R * Math.cos(f.a));
    o.rotation.set(0, f.a, 0); o.scale.set(1, f.h, 1); o.updateMatrix();
    finMesh.setMatrixAt(i, o.matrix);
  });
  finMesh.receiveShadow = true;
  add(finMesh);
  const stripMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const stripMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.025, ROOM_H - 1.4, 0.025), stripMat, strips.length);
  strips.forEach((a, i) => {
    o.position.set((ROOM_R + 0.3) * Math.sin(a), ROOM_H / 2 - 0.3, ROOM_Z + (ROOM_R + 0.3) * Math.cos(a));
    o.rotation.set(0, a, 0); o.scale.set(1, 1, 1); o.updateMatrix();
    stripMesh.setMatrixAt(i, o.matrix);
    stripMesh.setColorAt(i, C.amber);
  });
  add(stripMesh);
  const tmp = new THREE.Color();
  anim.push((t, dt, L) => {
    strips.forEach((a, i) => {
      const u = (A1 - a) / (A1 - A0); // 0 = Vienna side (left, -x), 1 = Melbourne side
      tmp.copy(C.amber).lerp(C.ice, THREE.MathUtils.smoothstep(u, 0.3, 0.7));
      const chase = 0.5 + 0.5 * Math.sin(u * 18 - t * (1.1 + 2.5 * L.music));
      const k = L.fins * (0.45 + 0.55 * (L.music > 0.01 ? THREE.MathUtils.lerp(0.7, chase, L.music) : 0.75 + 0.25 * Math.sin(u * 6 - t * 0.6)));
      const bias = u < 0.5 ? L.amber : L.ice;
      stripMesh.setColorAt(i, tmp.multiplyScalar(k * bias * 2.2));
    });
    stripMesh.instanceColor.needsUpdate = true;
  });

  // circular lighting truss with fixtures
  const truss = new THREE.Group();
  truss.position.set(0, 6.9, -1.4);
  add(truss);
  for (const [r, tube] of [[5.2, 0.05], [5.5, 0.05], [3.0, 0.04]]) {
    const ring = mesh(new THREE.TorusGeometry(r, tube, 8, 160).rotateX(Math.PI / 2), M.brushed, truss);
    ring.position.y = r === 5.5 ? 0.3 : 0;
  }
  const fixtures = new THREE.Group();
  truss.add(fixtures);
  const fixtureGeo = new THREE.CylinderGeometry(0.13, 0.16, 0.42, 20);
  const lensMat = glow(C.warm);
  glows.white.push({ m: lensMat, k: 1.8 });
  const lensGeo = new THREE.CircleGeometry(0.12, 20);
  const beamTargets = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const f = new THREE.Group();
    f.position.set(5.35 * Math.cos(a), -0.32, 5.35 * Math.sin(a));
    fixtures.add(f);
    f.lookAt(0, 0.8, -1.9); // aim at the set (world coordinates)
    const body = new THREE.Mesh(fixtureGeo, M.graphite); body.rotation.x = Math.PI / 2; f.add(body);
    const lens = new THREE.Mesh(lensGeo, lensMat); lens.position.z = 0.215; f.add(lens);
    if (i % 2 === 0) beamTargets.push(f);
  }

  // soft volumetric beams from the truss (very subtle; stronger in the music look)
  const beams = [];
  const beamGeo = new THREE.ConeGeometry(1.1, 6.8, 32, 1, true).translate(0, -3.4, 0).rotateX(-Math.PI / 2);
  for (const [i, f] of beamTargets.entries()) {
    const mat = beamMaterial(i % 2 ? C.ice : C.amber);
    const b = new THREE.Mesh(beamGeo, mat);
    f.add(b);
    b.position.z = 0.2;
    b.userData.phase = i * 0.9;
    beams.push(b);
  }
  anim.push((t, dt, L) => {
    for (const b of beams) {
      b.material.uniforms.uOpacity.value = L.beams * (0.75 + 0.25 * Math.sin(t * 0.8 + b.userData.phase));
      b.visible = L.beams > 0.005;
      b.rotation.x = Math.sin(t * 0.35 + b.userData.phase) * 0.12 * L.music;
      b.rotation.y = Math.cos(t * 0.27 + b.userData.phase) * 0.12 * L.music;
    }
  });

  /* ----- studio cameras and the jib ----- */
  const cams = [];
  // positions chosen by ray tests (scratch tool): in every viewpoint, across the whole cinematic drift and
  // jib swing, no camera stands between the lens and the desk, the chairs or the mics
  for (const [i, pos] of [[-4.2, 0, 4.6], [-2.7, 0, 5.5], [5.1, 0, 3.85]].entries()) {
    const n = i + 1;
    const cam = tvCamera(M, n, glows);
    cam.group.userData.focus = 'floor';
    cam.group.userData.equipment = `camera ${n}`;
    cam.group.position.set(...pos);
    // cross-shooting: camera 1 (left) holds Georgie, camera 3 (right) holds Andy'K
    const aim = n === 1 ? SEATS.georgie : n === 3 ? SEATS.andy : new THREE.Vector3(0, 0, -1.95);
    cam.group.rotation.y = Math.atan2(aim.x - cam.group.position.x, aim.z - cam.group.position.z); // lens is local +z
    cam.head.rotation.x = -0.06;
    add(cam.group);
    const sh = contactShadow(1.3, 1.3, 0.65); sh.position.set(pos[0], 0.003, pos[2]); add(sh);
    cams.push(cam);
    cable(root, M, new THREE.Vector3(pos[0], 0.02, pos[2]), new THREE.Vector3(pos[0] * 2.4 + (n - 2) * 2, 0.02, 12));
  }
  const jib = jibCrane(M, glows);
  jib.group.userData.focus = 'crane';
  jib.group.userData.equipment = 'jib';
  jib.group.position.set(7.6, 0, -1.6);
  add(jib.group);
  const js = contactShadow(2.1, 2.1, 0.55); js.position.set(7.6, 0.003, -1.6); add(js);
  cams.push(jib.cam);
  anim.push((t, dt, L) => {
    jib.arm.rotation.y = 0.12 + Math.sin(t * 0.11) * 0.3;
    jib.arm.rotation.z = -0.3 + Math.sin(t * 0.083 + 1) * 0.1; // negative lifts the camera end
    jib.cam.head.rotation.z = 0.35 - jib.arm.rotation.z;   // keep the lens pitched down at the desk
  });

  /* ----- music station (the 30 % electronic part) ----- */
  const music = musicStation(M, glows, anim);
  music.userData.focus = 'music';
  music.position.set(-5.4, 0, 0.1);
  music.rotation.y = 0.95;
  add(music);
  const mus = contactShadow(2.9, 1.3, 0.65); music.add(mus);

  /* ----- studio sign ----- */
  const signTex = studioSign();
  const signMat = new THREE.MeshBasicMaterial({ map: signTex, color: 0x222222 });
  const sign = new THREE.Group();
  mesh(new RoundedBoxGeometry(1.36, 0.42, 0.12, 3, 0.03), M.graphite, sign);
  const signFace = mesh(new THREE.PlaneGeometry(1.24, 0.31), signMat, sign);
  signFace.position.z = 0.061;
  sign.position.set(9.6, 4.6, -3.8);
  sign.rotation.y = -1.1;
  add(sign);

  /* ----- lights ----- */
  const lights = buildLights(root, quality, wallLight);

  /* ----- per-frame: lighting levels, LED colours, wall, tallies ----- */
  function update(t, dt, L, tally) {
    for (const { m, k } of glows.amber) m.color.copy(m.userData.base).multiplyScalar(k * L.amber * L.accent);
    for (const { m, k } of glows.ice) m.color.copy(m.userData.base).multiplyScalar(k * L.ice * L.accent);
    for (const { m, k } of glows.white) m.color.copy(m.userData.base).multiplyScalar(k * (0.35 + 0.65 * L.accent));
    for (const { m, k } of glows.gradient) {
      m.color.setScalar(k * L.accent * (0.85 + 0.15 * Math.sin(t * 1.2)));
    }
    gradTex.offset.x = Math.sin(t * 0.2) * 0.04 * (1 + 3 * L.music);
    wallMat.color.setScalar(L.wall);
    const tint = wall.tint();
    wallLight.color.setRGB(tint[0], tint[1], tint[2]);
    wallLight.intensity = 0.7 * L.wall;
    signMat.color.setScalar(L.onAir > 0.5 ? 1.6 : 0.12);
    cams.forEach((c, i) => c.tally(tally === i + 1 && L.onAir > 0.5));
    for (const f of anim) f(t, dt, L);
    lights.update(t, L);
  }

  const floorOpaque = () => { floor.material.transparent = false; floor.material.opacity = 1; floor.material.needsUpdate = true; };
  return { update, wall, cams, logo, desk, lights, music, floorOpaque, root };
}

/* ---------- pieces ---------- */

function beamMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color.clone() }, uOpacity: { value: 0 } },
    vertexShader: `varying float vV; varying vec3 vN; varying vec3 vView;
      void main(){ vV = uv.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vView = normalize(-mv.xyz); vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }`,
    // guarded: seen straight down the cone axis the interpolated vectors can vanish, and one NaN pixel turns into
    // black blocks once the bloom pass spreads it
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying float vV; varying vec3 vN; varying vec3 vView;
      void main(){ float d = dot(vN, vView); if (isnan(d)) d = 0.0;
        float a = uOpacity * pow(min(abs(d), 1.0), 2.0) * pow(clamp(vV, 0.0, 1.0), 1.6);
        if (isnan(a) || a < 0.0) a = 0.0;
        gl_FragColor = vec4(uColor * a, a); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
}

function chair(M) {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  // pedestal: polished base, gas-lift sleeve, swivel plate
  add(new THREE.CylinderGeometry(0.33, 0.35, 0.03, 48), M.satin, 0, 0.015, 0);
  add(new THREE.CylinderGeometry(0.055, 0.06, 0.012, 32), M.graphite, 0, 0.036, 0);
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 24), M.chrome, 0, 0.13, 0);
  add(new THREE.CylinderGeometry(0.042, 0.05, 0.2, 24), M.graphite, 0, 0.3, 0);
  add(new THREE.CylinderGeometry(0.15, 0.12, 0.03, 32), M.graphite, 0, 0.41, 0);
  // seat: leather cushion on a brushed pan, piping around the sides, two stitched channels
  add(new RoundedBoxGeometry(0.5, 0.03, 0.48, 3, 0.012), M.shellGold, 0, 0.43, 0.02);
  add(new RoundedBoxGeometry(0.52, 0.12, 0.5, 6, 0.05), M.leather, 0, 0.5, 0.02);
  add(new RoundedBoxGeometry(0.527, 0.007, 0.507, 3, 0.003), M.seam, 0, 0.5, 0.02);
  for (const x of [-0.11, 0.11]) add(new THREE.BoxGeometry(0.004, 0.003, 0.42), M.seam, x, 0.561, 0.03);
  // back: curved around the sitter, leather cushion in a champagne-metal shell, channel stitching
  const back = new THREE.Group();
  back.position.set(0, 0.58, -0.24);
  back.rotation.x = -0.13;
  g.add(back);
  const K = 0.42;
  add(bendX(new RoundedBoxGeometry(0.46, 0.62, 0.075, 6, 0.034), K), M.leather, 0, 0.33, 0.02, back);
  add(bendX(new RoundedBoxGeometry(0.5, 0.66, 0.055, 6, 0.026), K), M.shellGold, 0, 0.33, -0.028, back);
  add(bendX(new RoundedBoxGeometry(0.468, 0.008, 0.08, 3, 0.003), K), M.seam, 0, 0.33 + 0.306, 0.02, back);
  for (let i = 1; i < 4; i++) add(bendX(new THREE.BoxGeometry(0.42, 0.004, 0.004, 16, 1, 1), K), M.seam, 0, 0.33 - 0.31 + i * 0.155, 0.0585, back);
  for (const x of [-0.22, 0.22]) add(new THREE.BoxGeometry(0.004, 0.56, 0.004), M.seam, x * 0.92, 0.33, 0.058 - K * x * x * 0.85, back);
  // armrests: padded leather tops on brushed side plates
  for (const sx of [-1, 1]) {
    add(new RoundedBoxGeometry(0.065, 0.04, 0.34, 4, 0.018), M.leather, sx * 0.29, 0.715, -0.01);
    add(new RoundedBoxGeometry(0.014, 0.17, 0.24, 2, 0.005), M.shellGold, sx * 0.288, 0.615, -0.02);
    for (const z of [-0.09, 0.05]) add(new THREE.CylinderGeometry(0.008, 0.008, 0.004, 12), M.chrome, sx * 0.296, 0.6, z).rotation.z = Math.PI / 2;
  }
  shadows(g);
  return g;
}

function microphone(M, color, glows) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.02, 32), M.graphite); base.position.y = 0.01; g.add(base);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.26, 12), M.chrome);
  arm.position.set(0, 0.13, 0.03); arm.rotation.x = 0.25; g.add(arm);
  const capsule = new THREE.Group();
  capsule.position.set(0, 0.26, 0.07); capsule.rotation.x = 1.1; g.add(capsule);
  capsule.add(new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.02, 0.16, 24), M.graphite));
  const grill = new THREE.Mesh(new THREE.SphereGeometry(0.026, 24, 16), M.brushed); grill.position.y = 0.09; capsule.add(grill);
  const ringMat = glow(color);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0235, 0.003, 8, 32).rotateX(Math.PI / 2), ringMat); ring.position.y = 0.05; capsule.add(ring);
  // shock mount: a ring around the body held by a small yoke on the arm
  const shock = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.0035, 8, 32).rotateX(Math.PI / 2), M.graphite); shock.position.y = -0.01; capsule.add(shock);
  for (const sx of [-1, 1]) { const y = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.03, 0.008), M.graphite); y.position.set(sx * 0.036, -0.03, 0); capsule.add(y); }
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.012, 16), M.chrome); knob.rotation.z = Math.PI / 2; knob.position.set(0.04, -0.03, 0); capsule.add(knob);
  // cable from the base into a desk grommet
  const grommet = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.003, 8, 20).rotateX(Math.PI / 2), M.brushed); grommet.position.set(0.03, 0.002, -0.1); g.add(grommet);
  const lead = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.012, -0.055), new THREE.Vector3(0.012, 0.01, -0.085), new THREE.Vector3(0.03, -0.01, -0.1)]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(lead, 12, 0.0025, 6), M.rubber));
  (color.getHex() === new THREE.Color(AMBER).getHex() ? glows.amber : glows.ice).push({ m: ringMat, k: 2.5 });
  shadows(g);
  return g;
}

function tvCamera(M, n, glows) {
  const group = new THREE.Group();
  const add = (geo, mat, x, y, z, parent = group) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  // pedestal: three-wheel base, telescopic column, steering ring
  add(new THREE.CylinderGeometry(0.46, 0.5, 0.12, 6), M.camBody, 0, 0.14, 0);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const w = add(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 20), M.rubber, Math.cos(a) * 0.42, 0.07, Math.sin(a) * 0.42);
    w.rotation.z = Math.PI / 2;
    add(new THREE.BoxGeometry(0.06, 0.1, 0.06), M.brushed, Math.cos(a) * 0.42, 0.12, Math.sin(a) * 0.42);
  }
  add(new THREE.CylinderGeometry(0.11, 0.13, 0.62, 24), M.camBody, 0, 0.5, 0);
  add(new THREE.CylinderGeometry(0.075, 0.075, 0.5, 24), M.brushed, 0, 1.05, 0);
  add(new THREE.TorusGeometry(0.36, 0.018, 10, 48).rotateX(Math.PI / 2), M.brushed, 0, 0.82, 0);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const spoke = add(new THREE.CylinderGeometry(0.01, 0.01, 0.3, 8), M.brushed, Math.cos(a) * 0.2, 0.82, Math.sin(a) * 0.2);
    spoke.rotation.set(0, -a, Math.PI / 2);
  }
  // column collars, steering pedals and a cable clipped down the column to the base
  for (const y of [0.8, 1.29]) add(new THREE.CylinderGeometry(0.088, 0.088, 0.03, 24), M.graphite, 0, y, 0);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 3, pedal = add(new THREE.BoxGeometry(0.1, 0.02, 0.05), M.brushed, Math.cos(a) * 0.4, 0.21, Math.sin(a) * 0.4);
    pedal.rotation.y = -a;
  }
  const camCable = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 1.45, -0.44), new THREE.Vector3(0.02, 1.2, -0.3), new THREE.Vector3(0.09, 0.9, -0.1), new THREE.Vector3(0.12, 0.45, -0.12), new THREE.Vector3(0.1, 0.22, -0.3), new THREE.Vector3(0.05, 0.02, -0.55)]);
  add(new THREE.TubeGeometry(camCable, 40, 0.009, 6), M.rubber, 0, 0, 0);
  for (const y of [0.62, 1.0]) add(new THREE.BoxGeometry(0.03, 0.02, 0.03), M.graphite, 0.1, y, -0.11);
  // pan/tilt head and camera: body, box lens, teleprompter hood, viewfinder, pan bars, tally
  const head = new THREE.Group();
  head.position.y = 1.32;
  group.add(head);
  add(new THREE.BoxGeometry(0.26, 0.1, 0.26), M.graphite, 0, 0, 0, head);
  add(new RoundedBoxGeometry(0.2, 0.26, 0.42, 3, 0.03), M.camBody, 0, 0.19, -0.1, head);
  add(new RoundedBoxGeometry(0.24, 0.27, 0.48, 3, 0.03), M.camLight, 0, 0.2, 0.32, head);
  // box lens front: focus ring (rubber), barrel, glass with a bright retaining ring, and a short hood
  const lensGroup = new THREE.Group(); lensGroup.position.set(0, 0.2, 0.56); head.add(lensGroup);
  const ax = geo => geo.rotateX(Math.PI / 2);
  add(ax(new THREE.CylinderGeometry(0.104, 0.104, 0.035, 48)), M.rubber, 0, 0, 0.02, lensGroup);
  for (let i = 0; i < 3; i++) add(ax(new THREE.TorusGeometry(0.104, 0.0025, 6, 48).rotateX(Math.PI / 2)), M.seam, 0, 0, 0.008 + i * 0.012, lensGroup);
  add(ax(new THREE.CylinderGeometry(0.098, 0.1, 0.05, 48)), M.graphite, 0, 0, 0.06, lensGroup);
  add(ax(new THREE.TorusGeometry(0.088, 0.005, 8, 48).rotateX(Math.PI / 2)), M.chrome, 0, 0, 0.083, lensGroup);
  add(new THREE.CircleGeometry(0.087, 48), M.lensGlass, 0, 0, 0.08, lensGroup);
  const hoodRing = add(ax(new THREE.CylinderGeometry(0.112, 0.102, 0.04, 48, 1, true)), M.graphite.clone(), 0, 0, 0.105, lensGroup);
  hoodRing.material.side = THREE.DoubleSide;
  // zoom rocker on the side of the lens
  add(new RoundedBoxGeometry(0.03, 0.06, 0.09, 2, 0.008), M.graphite, 0.135, 0.17, 0.3, head);
  // carrying handle, side vents, rear connectors
  const handle = add(new THREE.TorusGeometry(0.075, 0.011, 8, 20, Math.PI), M.graphite, 0, 0.32, -0.1, head);
  handle.rotation.y = Math.PI / 2;
  for (const sx of [-1, 1]) {
    const v = add(new THREE.PlaneGeometry(0.2, 0.11), M.vent, sx * 0.1015, 0.17, -0.13, head);
    v.rotation.y = sx * Math.PI / 2;
  }
  for (const [x, y] of [[-0.05, 0.12], [0, 0.12], [0.05, 0.12], [-0.03, 0.22]]) add(ax(new THREE.CylinderGeometry(0.011, 0.011, 0.03, 16)), M.brushed, x, y, -0.325, head);
  // teleprompter in front of the lens
  const hood = new THREE.Group(); hood.position.set(0, 0.2, 0.8); head.add(hood);
  add(new THREE.BoxGeometry(0.5, 0.02, 0.4), M.graphite, 0, 0.21, 0, hood);
  add(new THREE.BoxGeometry(0.02, 0.42, 0.4), M.graphite, -0.25, 0, 0, hood);
  add(new THREE.BoxGeometry(0.02, 0.42, 0.4), M.graphite, 0.25, 0, 0, hood);
  add(new THREE.BoxGeometry(0.5, 0.06, 0.4), M.graphite, 0, -0.22, 0, hood);
  const glass = add(new THREE.PlaneGeometry(0.48, 0.52), M.prompterGlass, 0, 0, 0, hood);
  glass.rotation.x = -Math.PI / 4;
  add(new THREE.BoxGeometry(0.52, 0.44, 0.03), M.graphite, 0, 0, -0.2, hood).scale.set(1, 1, 1);
  const shroud = add(new THREE.BoxGeometry(0.5, 0.42, 0.01), new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.9 }), 0, 0, 0.2, hood);
  shroud.visible = false;
  // viewfinder with a small sunshade
  add(new RoundedBoxGeometry(0.2, 0.15, 0.14, 2, 0.02), M.camBody, 0, 0.42, -0.18, head);
  add(new THREE.BoxGeometry(0.2, 0.005, 0.06), M.graphite, 0, 0.497, -0.275, head);
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.005, 0.07, 0.06), M.graphite, sx * 0.1, 0.465, -0.275, head);
  const vfScreen = add(new THREE.PlaneGeometry(0.17, 0.11), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.06, 0.08, 0.11) }), 0, 0.42, -0.251, head);
  vfScreen.rotation.y = Math.PI;
  // pan bars
  for (const s of [-1, 1]) {
    const bar = add(new THREE.CylinderGeometry(0.014, 0.014, 0.75, 12), M.brushed, s * 0.16, 0.02, -0.42, head);
    bar.rotation.set(Math.PI / 2 - 0.35, 0, s * 0.2);
    add(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 12), M.rubber, s * 0.23, -0.1, -0.76, head).rotation.set(Math.PI / 2 - 0.35, 0, 0);
  }
  // camera number plates on both sides of the lens
  const plate = new THREE.MeshBasicMaterial({ map: label(String(n), { size: 90 }) });
  for (const s of [-1, 1]) {
    const p = add(new THREE.PlaneGeometry(0.12, 0.06), plate, s * 0.1215, 0.3, 0.3, head);
    p.rotation.y = s * Math.PI / 2;
  }
  // tally lamp
  const tallyMat = new THREE.MeshBasicMaterial({ color: 0x220405 });
  add(new THREE.BoxGeometry(0.07, 0.025, 0.025), tallyMat, 0, 0.345, 0.5, head);
  add(new THREE.BoxGeometry(0.07, 0.025, 0.025), tallyMat, 0, 0.5, -0.15, head);
  shadows(group);
  return { group, head, tally(on) { tallyMat.color.setRGB(on ? 6 : 0.14, on ? 0.15 : 0.015, on ? 0.12 : 0.02); } };
}

function jibCrane(M, glows) {
  const group = new THREE.Group();
  const add = (geo, mat, x, y, z, parent = group) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.3;
    const leg = add(new THREE.CylinderGeometry(0.025, 0.03, 1.9, 12), M.camBody, Math.cos(a) * 0.45, 0.85, Math.sin(a) * 0.45);
    leg.rotation.set(Math.sin(a) * 0.28, 0, -Math.cos(a) * 0.28);
    add(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 16), M.rubber, Math.cos(a) * 0.85, 0.02, Math.sin(a) * 0.85);
  }
  add(new THREE.CylinderGeometry(0.09, 0.11, 0.3, 20), M.graphite, 0, 1.78, 0);
  const arm = new THREE.Group();
  arm.position.y = 1.95;
  group.add(arm);
  // the arm points along -x; the camera end swings over the set
  const beam = add(new THREE.BoxGeometry(5.2, 0.12, 0.12), M.camLight, -1.7, 0, 0, arm);
  add(new THREE.BoxGeometry(5.2, 0.02, 0.18), M.brushed, -1.7, 0.08, 0, arm);
  add(new THREE.BoxGeometry(0.5, 0.42, 0.32), M.graphite, 1.05, -0.05, 0, arm);
  add(new THREE.CylinderGeometry(0.14, 0.14, 0.34, 24), M.brushed, 1.32, -0.05, 0, arm).rotation.x = Math.PI / 2;
  beam.castShadow = true;
  const head = new THREE.Group();
  head.position.set(-4.3, -0.3, 0);
  arm.add(head);
  add(new THREE.BoxGeometry(0.1, 0.36, 0.1), M.graphite, 0, 0.18, 0, head);
  add(new RoundedBoxGeometry(0.18, 0.2, 0.36, 2, 0.02), M.camBody, 0, -0.06, 0, head).rotation.y = Math.PI / 2;
  const lens = add(new THREE.CylinderGeometry(0.06, 0.07, 0.18, 24), M.camLight, -0.25, -0.06, 0, head);
  lens.rotation.z = Math.PI / 2;
  const tallyMat = new THREE.MeshBasicMaterial({ color: 0x220405 });
  add(new THREE.BoxGeometry(0.03, 0.03, 0.05), tallyMat, -0.12, 0.06, 0, head);
  shadows(group);
  return { group, arm, cam: { head, tally(on) { tallyMat.color.setRGB(on ? 6 : 0.14, on ? 0.15 : 0.015, on ? 0.12 : 0.02); } } };
}

function musicStation(M, glows, anim) {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  add(new RoundedBoxGeometry(2.3, 0.94, 0.8, 4, 0.04), M.dark, 0, 0.47, 0);
  add(new RoundedBoxGeometry(2.36, 0.05, 0.86, 3, 0.02), M.blackGlass, 0, 0.965, 0);
  for (const sx of [-1, 1]) {
    const v = add(new THREE.PlaneGeometry(0.46, 0.3), M.vent, sx * 1.152, 0.42, 0);
    v.rotation.y = sx * Math.PI / 2;
  }
  const front = glow(new THREE.Color(1, 1, 1), gradientTexture());
  add(new THREE.PlaneGeometry(2.2, 0.018), front, 0, 0.88, 0.402);
  glows.gradient.push({ m: front, k: 2 });
  // two media players and a mixer
  const jogs = [];
  for (const s of [-1, 1]) {
    add(new RoundedBoxGeometry(0.34, 0.06, 0.44, 2, 0.015), M.graphite, s * 0.55, 1.02, 0);
    add(new THREE.CylinderGeometry(0.12, 0.12, 0.012, 48), M.brushed, s * 0.55, 1.056, 0.04);
    const ringMat = glow(s < 0 ? new THREE.Color(AMBER) : new THREE.Color(ICE));
    const ring = add(new THREE.TorusGeometry(0.128, 0.004, 8, 64).rotateX(Math.PI / 2), ringMat, s * 0.55, 1.058, 0.04);
    (s < 0 ? glows.amber : glows.ice).push({ m: ringMat, k: 2.4 });
    const screen = add(new THREE.PlaneGeometry(0.2, 0.08), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.32, 0.45) }), s * 0.55, 1.052, -0.15);
    screen.rotation.x = -Math.PI / 2;
    jogs.push(ring);
  }
  add(new RoundedBoxGeometry(0.34, 0.07, 0.42, 2, 0.015), M.graphite, 0, 1.025, 0);
  // mixer level meters
  const meters = new THREE.InstancedMesh(new THREE.BoxGeometry(0.012, 0.004, 0.008), new THREE.MeshBasicMaterial(), 4 * 12);
  const o = new THREE.Object3D(), col = new THREE.Color();
  for (let ch = 0; ch < 4; ch++) for (let i = 0; i < 12; i++) {
    o.position.set(-0.09 + ch * 0.06, 1.062, 0.12 - i * 0.012); o.updateMatrix();
    meters.setMatrixAt(ch * 12 + i, o.matrix);
    meters.setColorAt(ch * 12 + i, col.set(0x111111));
  }
  g.add(meters);
  anim.push((t, dt, L) => {
    for (const r of jogs) r.rotation.y += dt * (0.4 + 2.6 * L.music);
    for (let ch = 0; ch < 4; ch++) {
      const lvl = L.accent * (0.45 + 0.4 * Math.abs(Math.sin(t * (2.3 + ch * 0.7) + ch)) * (0.4 + 0.6 * L.music));
      for (let i = 0; i < 12; i++) {
        const on = i / 12 < lvl;
        meters.setColorAt(ch * 12 + i, on ? col.setRGB(i > 9 ? 3 : i > 7 ? 2.6 : 0.6, i > 9 ? 0.4 : i > 7 ? 1.6 : 1.9, i > 7 ? 0.2 : 0.9) : col.setRGB(0.03, 0.03, 0.035));
      }
    }
    meters.instanceColor.needsUpdate = true;
  });
  // studio monitors on stands
  for (const s of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 12), M.brushed, s * 1.45, 0.55, -0.15);
    add(new THREE.CylinderGeometry(0.2, 0.22, 0.03, 24), M.graphite, s * 1.45, 0.015, -0.15);
    const box = add(new RoundedBoxGeometry(0.26, 0.4, 0.3, 3, 0.02), M.graphite, s * 1.45, 1.3, -0.15);
    box.rotation.y = -s * 0.25;
    const cone = add(new THREE.CircleGeometry(0.085, 32), M.brushed, 0, -0.06, 0.151, box);
    const tw = add(new THREE.CircleGeometry(0.03, 24), M.chrome, 0, 0.11, 0.151, box);
    cone.receiveShadow = tw.receiveShadow = true;
  }
  shadows(g);
  return g;
}

function cable(root, M, from, to) {
  const mid = from.clone().lerp(to, 0.5);
  mid.x += (Math.random() - 0.5) * 1.6;
  const curve = new THREE.CatmullRomCurve3([from, from.clone().lerp(mid, 0.4).add(new THREE.Vector3(0.6, 0, 0.3)), mid, to]);
  curve.points.forEach(p => { p.y = 0.012; });
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.011, 6), M.rubber);
  m.receiveShadow = true;
  root.add(m);
}

/* ---------- logo: D // 0, extruded, with glowing edge lines like the key visual ---------- */

function buildLogo(M, glows) {
  const g = new THREE.Group();
  const D = new THREE.Shape();
  D.moveTo(0, 0); D.lineTo(0.38, 0); D.absarc(0.38, 0.5, 0.5, -Math.PI / 2, Math.PI / 2, false); D.lineTo(0, 1); D.closePath();
  const Dh = new THREE.Path();
  Dh.moveTo(0.2, 0.2); Dh.lineTo(0.38, 0.2); Dh.absarc(0.38, 0.5, 0.3, -Math.PI / 2, Math.PI / 2, false); Dh.lineTo(0.2, 0.8); Dh.closePath();
  D.holes.push(Dh);
  const slash = x0 => { const s = new THREE.Shape(); s.moveTo(x0, 0); s.lineTo(x0 + 0.16, 0); s.lineTo(x0 + 0.48, 1); s.lineTo(x0 + 0.32, 1); s.closePath(); return s; };
  const Z = roundRectShape(1.84, 0, 0.8, 1, 0.38);
  const Zh = new THREE.Path(); roundRectShape(2.04, 0.2, 0.4, 0.6, 0.2, Zh); Z.holes.push(Zh);

  const parts = [[D, M.logoWarm, C.amber], [slash(0.96), M.logoWarm, C.amber], [slash(1.24), M.logoCool, C.ice], [Z, M.logoCool, C.ice]];
  const depth = 0.16;
  for (const [shape, mat, col] of parts) {
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 4, curveSegments: 48 });
    const m = new THREE.Mesh(geo, mat);
    g.add(m);
    // neon contour on the front face and a softer one on the back
    const lineMat = glow(col);
    (col === C.amber ? glows.amber : glows.ice).push({ m: lineMat, k: 3.2 });
    for (const path of [shape, ...shape.holes]) {
      const pts = path.getPoints(64).map(p => new THREE.Vector3(p.x, p.y, 0));
      const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
      for (const z of [depth + 0.03, -0.03]) {
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(64, pts.length * 3), z > 0 ? 0.008 : 0.006, 6, true), lineMat);
        tube.position.z = z;
        g.add(tube);
      }
    }
  }
  return g;
}

/* ---------- lights ---------- */

function buildLights(root, quality, wallLight) {
  const spot = (color, pos, target, { angle = 0.42, penumbra = 0.65, shadow = false } = {}) => {
    const l = new THREE.SpotLight(color, 0, 0, angle, penumbra, 2);
    l.position.copy(pos); l.target.position.copy(target);
    root.add(l, l.target);
    if (shadow) {
      l.castShadow = true;
      l.shadow.mapSize.setScalar(quality.shadowSize);
      l.shadow.bias = -0.0004; l.shadow.normalBias = 0.02;
      l.shadow.camera.near = 2; l.shadow.camera.far = 20;
    }
    return l;
  };
  const keyL = spot(C.warm, new THREE.Vector3(-3.2, 6.6, 4.4), new THREE.Vector3(-0.7, 1.2, -1.9), { angle: 0.3, penumbra: 0.8, shadow: true });
  const keyR = spot(C.cool, new THREE.Vector3(3.2, 6.6, 4.4), new THREE.Vector3(0.7, 1.2, -1.9), { angle: 0.3, penumbra: 0.8, shadow: quality.shadows2 });
  const rimA = spot(C.amber, new THREE.Vector3(-3.2, 6.0, -5.6), new THREE.Vector3(-0.95, 1.5, -1.9), { angle: 0.22, penumbra: 0.8 });
  const rimI = spot(C.ice, new THREE.Vector3(3.2, 6.0, -5.6), new THREE.Vector3(0.95, 1.5, -1.9), { angle: 0.22, penumbra: 0.8 });
  const djSpot = spot(C.amber, new THREE.Vector3(-4.2, 6.5, 2.4), new THREE.Vector3(-5.4, 0.9, 0.1), { angle: 0.32 });
  const logoSpot = spot(C.warm, new THREE.Vector3(0, 7.4, -2.2), new THREE.Vector3(0, 3.6, -5.6), { angle: 0.3, penumbra: 0.9 });
  const fill = new THREE.RectAreaLight(C.warm, 0, 5.5, 1.6);
  fill.position.set(0, 5.6, 1.6); fill.lookAt(0, 0.8, -1.8);
  const house = new THREE.RectAreaLight(C.cool, 0, 14, 10);
  house.position.set(0, 8.2, 0); house.lookAt(0, 0, 0);
  const hemi = new THREE.HemisphereLight(0x343a46, 0x0a0a0c, 0.4);
  // soft front fill at camera height: lifts the furniture, floor and architecture out of the black, nothing more
  const soft = new THREE.RectAreaLight(0xf2efe9, 0, 10, 2.4);
  soft.position.set(0, 2.6, 9.5); soft.lookAt(0, 1.0, -2.5);
  root.add(fill, house, hemi, soft);
  return {
    update(t, L) {
      const breathe = 1 + 0.04 * Math.sin(t * 0.7);
      keyL.intensity = 220 * L.key * L.warm;
      keyR.intensity = 200 * L.key * L.cool;
      rimA.intensity = 140 * L.rim * L.amber * breathe;
      rimI.intensity = 140 * L.rim * L.ice * (2 - breathe);
      djSpot.intensity = 120 * L.accent * (0.6 + 0.4 * L.music);
      logoSpot.intensity = 120 * L.accent;
      fill.intensity = 1.6 * L.key;
      house.intensity = 0.9 * L.house;
      hemi.intensity = 0.42 + 0.3 * L.house;
      soft.intensity = 0.55 + 0.25 * L.house;
    },
  };
}
