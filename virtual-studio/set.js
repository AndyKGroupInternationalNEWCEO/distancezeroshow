// The DISTANCE // ZERO set, modelled in code (no downloaded models): units are metres, y is up, the studio
// cameras stand at +z looking towards the LED wall at -z. Andy'K (Vienna) sits on the left, Georgie
// (Melbourne) on the right, as seen from the cameras.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { roughnessNoise, leatherNormal, brushed, ventTexture, panelJoints, floorMaps, contactShadow, arcShadow, bendX, micGrille } from './details.js';
import { grandPiano } from './grandpiano.js';
import { createWall, createPylon, createDeskFascia, createFloorInlay, gradientTexture, label, studioSign, namePlate, umdStrip, deckScreen, AMBER, ICE } from './screens.js';

export const RISER = 0.16;            // stage riser height
export const DESK_CENTER = -4.4;      // z of the circle the desk is an arc of
export const SEATS = { andy: new THREE.Vector3(-0.95, RISER, -1.95), georgie: new THREE.Vector3(0.95, RISER, -1.95), guest: new THREE.Vector3(0, RISER, -1.95) };
const C = { amber: new THREE.Color(AMBER), ice: new THREE.Color(ICE), champagne: new THREE.Color('#e3c79a'), warm: new THREE.Color('#fff0dc'), cool: new THREE.Color('#e6efff'),
  tungsten: new THREE.Color('#ffa64d') };   // an old filament bulb: yellow to amber, never white

/* ---------- materials ---------- */

function materials(q) {
  const physical = o => new THREE.MeshPhysicalMaterial(o);
  // phones and tablets: glass without the transmission pass (too heavy there): a clear, tinted, see-through body with
  // glassy reflections, so the logo reads as on desktops (the metal stand-in it replaces looked gold and brown)
  const lightGlass = tint => physical({ color: new THREE.Color(tint).multiplyScalar(0.35), metalness: 0, roughness: 0.04, transparent: true,
    opacity: 0.1, depthWrite: false, clearcoat: 1, clearcoatRoughness: 0.03, specularIntensity: 0.7, envMapIntensity: 1.1 });
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
      : lightGlass(0xf2b77a),
    logoCool: q.glass
      ? physical({ color: 0xffffff, metalness: 0, roughness: 0.06, transmission: 1, thickness: 0.35, ior: 1.5, attenuationColor: new THREE.Color(0xbcd4f2), attenuationDistance: 0.7, clearcoat: 1, specularIntensity: 1 })
      : lightGlass(0xbcd4f2),
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
export function glow(color, map) {
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

// guest: the third chair, in the middle for the show's guest (the presenters proof of concept was blocked without it)
export function buildStudio({ scene, quality, logo: logoStyle = 'image', guest = true }) {
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
  const fasciaMat = new THREE.MeshStandardMaterial({ color: 0x0c0d10, metalness: 0.6, roughness: 0.3, emissive: 0xffffff, emissiveMap: createDeskFascia({ guest }), emissiveIntensity: 1 });
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

  // desk props: broadcast microphones and slim monitors facing the presenters; the guest has a microphone only,
  // so nothing stands in the middle of the desk in the front shots
  if (guest) {
    const m = microphone(M, C.champagne, glows);
    m.position.set(0, RISER + 0.807, -1.02);
    m.rotation.y = Math.PI;
    add(m);
    const ms = contactShadow(0.2, 0.2, 0.5); ms.position.set(0, RISER + 0.809, -1.02); add(ms);
  }
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

  /* ----- presenter chairs, and the guest's chair between them ----- */
  for (const seat of guest ? [SEATS.andy, SEATS.guest, SEATS.georgie] : [SEATS.andy, SEATS.georgie]) {
    const ch = chair(M);
    ch.userData.focus = seat.x < 0 ? 'andy' : seat.x > 0 ? 'georgie' : 'desk';
    ch.position.copy(seat);
    ch.rotation.y = seat.x < 0 ? 0.12 : seat.x > 0 ? -0.12 : 0;
    add(ch);
    const cs = contactShadow(0.95, 0.95, 0.6); cs.position.set(seat.x, RISER + 0.003, seat.z); add(cs);
  }

  /* ----- LED video wall ----- */
  const wall = createWall(quality.wall);
  const WALL_R = 10, WALL_Z = 3, WALL_SPAN = 0.56, WALL_H = 4.6, WALL_Y = 3.1;
  // a real LED wall: the picture is the light (emissive), the surface is glossy black and catches the studio's lights
  // and the room, with the module's pixel structure in its gloss (2.5 cm pitch, only in reflections, so no moiré)
  const ledPix = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d');
    x.fillStyle = '#9a9a9a'; x.fillRect(0, 0, 32, 32);                                        // the black mask between the LEDs: matt
    const r = x.createRadialGradient(16, 16, 1, 16, 16, 10); r.addColorStop(0, '#202020'); r.addColorStop(1, '#9a9a9a');
    x.fillStyle = r; x.beginPath(); x.arc(16, 16, 10, 0, Math.PI * 2); x.fill();               // each LED's lens: glossy
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(448, 184); t.anisotropy = 8;
    return t;
  })();
  // the 22 x 9 cabinets: each with softly bevelled edges, so the lights run along the panel joints in the gloss
  const cabinet = (() => {
    const n = 128, c = document.createElement('canvas'); c.width = c.height = n; const x = c.getContext('2d'), img = x.createImageData(n, n), e = 7;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const dx = i < e ? -(e - i) / e : i >= n - e ? (i - (n - e - 1)) / e : 0, dy = j < e ? (e - j) / e : j >= n - e ? -(j - (n - e - 1)) / e : 0;
      const k = 4 * (j * n + i), nx = dx * 0.55, ny = dy * 0.55, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      img.data[k] = 128 + 127 * nx; img.data[k + 1] = 128 + 127 * ny; img.data[k + 2] = 128 + 127 * nz; img.data[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(22, 9); t.anisotropy = 8;
    return t;
  })();
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x020203, roughness: 1, roughnessMap: ledPix, metalness: 0, envMapIntensity: 0.55,
    normalMap: cabinet, normalScale: new THREE.Vector2(0.6, 0.6), emissive: 0xffffff, emissiveMap: wall.texture, side: THREE.BackSide });
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
  // light round the wall: a line along the top and the bottom (ice on the Melbourne end, amber on the Vienna end) and
  // an upright at each end, in front of the frame; they follow the looks and the music like the set's other LED lines
  const rim = glow(new THREE.Color(1, 1, 1), gradientTexture([[0, ICE], [0.5, '#f3f5f8'], [1, AMBER]]));
  glows.gradient.push({ m: rim, k: 1.8 });
  for (const y of [WALL_Y - WALL_H / 2 - 0.04, WALL_Y + WALL_H / 2 + 0.04]) {
    const l = mesh(new THREE.CylinderGeometry(WALL_R - 0.05, WALL_R - 0.05, 0.016, 160, 1, true, Math.PI - WALL_SPAN - 0.02, WALL_SPAN * 2 + 0.04), rim);
    l.material = rim; l.position.set(0, y, WALL_Z); l.castShadow = l.receiveShadow = false;
  }
  for (const sgn of [-1, 1]) {
    const m = glow(new THREE.Color(sgn < 0 ? ICE : AMBER)); (sgn < 0 ? glows.ice : glows.amber).push({ m, k: 1.8 });
    const a = Math.PI + sgn * (WALL_SPAN + 0.012), r = WALL_R - 0.05;
    const up = mesh(new THREE.BoxGeometry(0.016, WALL_H + 0.1, 0.016), m);
    up.position.set(r * Math.sin(a), WALL_Y, WALL_Z + r * Math.cos(a)); up.castShadow = up.receiveShadow = false;
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
  const logo = logoStyle === 'image' ? buildLogoImage() : logoStyle === 'kv' ? buildLogoKV(M, glows) : buildLogo(M, glows);
  logo.userData.focus = 'wall';
  logo.position.set(logoStyle === 'image' || logoStyle === 'kv' ? 0 : -1.31 * 1.25, 3.62, -5.55);   // the image and key-visual logos are centred in their own group
  logo.scale.setScalar(1.25);
  add(logo);
  for (const x of [-1.2, 1.2]) {
    const cable = mesh(new THREE.CylinderGeometry(0.004, 0.004, 3.1), M.chrome);
    cable.position.set(x, 3.62 + 1.25 + 1.55, -5.5);
  }
  shadows(logo, true, false);
  logo.traverse(c => { if (c.userData.noShadow) c.castShadow = false; });
  // during the on-air simulation the logo is flown up above the wall, so the video on the wall is not covered
  let lift = 0, liftTo = 0;
  anim.push((t, dt, L) => { lift += (liftTo - lift) * Math.min(1, dt * 1.2); logo.position.y = 3.62 + lift * 2.0 + Math.sin(t * 0.45) * 0.015; });

  /* ----- backstage lounge behind the LED wall, and its door at the wall's Vienna end ----- */
  const lounge = buildLounge(M, quality);
  add(lounge.group); add(lounge.lights);
  lounge.light(false);
  // security cameras, always recording (red lamp never off): one high on the Vienna-side wall over the whole set,
  // one in the lounge's back corner watching the dressing-room doors
  const secStudio = securityCam(M, anim); secStudio.position.set(-11.15, 6.5, -3.3); secStudio.lookAt(0, 0.8, -1); add(secStudio);
  const secLounge = securityCam(M, anim); secLounge.position.set(-3.33, 2.72, -11.03); secLounge.lookAt(2.6, 1.0, -8.6); lounge.group.add(secLounge);
  const backSign = backstageSign();
  backSign.position.set(-5.62, 0, -5.05);
  backSign.lookAt(0, 0, 1.5);
  add(backSign);
  // a fine amber guide line on the floor, from the sign round the wall's end to the lounge door (lit, so the way is seen)
  {
    const guide = new THREE.MeshBasicMaterial({ color: new THREE.Color(AMBER).multiplyScalar(0.9) });
    const pts = [[-5.35, -4.5], [-5.95, -6.15], [-5.3, -7.7], [-4.4, -8.3], [-3.56, -8.3]].map(([x, z]) => new THREE.Vector3(x, 0.012, z));
    const path = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const strip = new THREE.Mesh(new THREE.TubeGeometry(path, 80, 0.012, 4), guide);
    strip.scale.y = 0.3; strip.position.y = 0.008;
    add(strip);
  }

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
    if (behindWall && Math.abs(ROOM_R * Math.sin(a)) < 3.9) continue;   // the backstage lounge sits there (they would poke into it)
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
      const k = L.fins * (0.45 + 0.55 * (L.music > 0.01 ? THREE.MathUtils.lerp(0.7, chase, L.music) : 0.75 + 0.25 * Math.sin(u * 6 - t * 0.6)))
        * (1 + L.aOn * (L.aBass * 1.5 + L.aMid * 0.6 * (0.5 + 0.5 * Math.sin(u * 22 - t * 4)))); // sound-to-light
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
  // fixture hardware (desktop only): yoke, hinge knobs, hanging clamp and rear cooling fins (nothing near the lens, so its glow stays as it was)
  const hw = !quality.mobile && {
    plate: new THREE.BoxGeometry(0.014, 0.26, 0.07), bar: new THREE.BoxGeometry(0.37, 0.016, 0.07), knob: new THREE.CylinderGeometry(0.026, 0.026, 0.02, 16).rotateZ(Math.PI / 2),
    stem: new THREE.CylinderGeometry(0.012, 0.012, 0.15, 10), clamp: new THREE.BoxGeometry(0.07, 0.05, 0.09),
    fin: new THREE.TorusGeometry(0.15, 0.008, 6, 28),
    parts: { plate: [], knob: [], bar: [], stem: [], clamp: [], fin: [] },
  };
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
    if (hw) {
      // the yoke hangs plumb and only turns towards the set; the head tilts inside it
      const yoke = new THREE.Object3D(); yoke.position.copy(f.position); fixtures.add(yoke);
      const wp = yoke.getWorldPosition(new THREE.Vector3()); yoke.lookAt(0, wp.y, -1.9);
      yoke.updateMatrix(); f.updateMatrix(); fixtures.remove(yoke);
      const at = (part, x, y, z, parent) => hw.parts[part].push(parent.matrix.clone().multiply(new THREE.Matrix4().makeTranslation(x, y, z)));
      for (const sx of [-1, 1]) { at('plate', sx * 0.175, 0.06, 0, yoke); at('knob', sx * 0.192, 0, 0, yoke); }
      at('bar', 0, 0.19, 0, yoke); at('stem', 0, 0.27, 0, yoke); at('clamp', 0, 0.33, 0, yoke);
      for (const z of [-0.08, -0.12, -0.16]) at('fin', 0, 0, z, f);
    }
    if (i % 2 === 0) beamTargets.push(f);
  }
  // all fixtures' hardware in six instanced draws (one per part) instead of 128 separate meshes
  if (hw) for (const [part, list] of Object.entries(hw.parts)) {
    const im = new THREE.InstancedMesh(hw[part], part === 'knob' ? M.rubber : part === 'stem' ? M.brushed : M.graphite, list.length);
    list.forEach((m, k) => im.setMatrixAt(k, m));
    fixtures.add(im);
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
      b.material.uniforms.uOpacity.value = L.beams * (0.75 + 0.25 * Math.sin(t * 0.8 + b.userData.phase)) + L.aOn * L.aHigh * 0.5 * (0.3 + 0.7 * L.music);
      b.visible = b.material.uniforms.uOpacity.value > 0.005;
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
  // camera 5: a pedestal for the guest, at the front right edge (outside the floor shot, below the wide shot's line to the desk)
  {
    const pos = [1.3, 0, 6.8], cam = tvCamera(M, 5, glows);
    cam.group.userData.focus = 'guest';
    cam.group.userData.equipment = 'camera 5';
    cam.group.position.set(...pos);
    cam.group.rotation.y = Math.atan2(SEATS.guest.x - pos[0], SEATS.guest.z - pos[2]);
    cam.head.rotation.x = -0.06;
    add(cam.group);
    const sh = contactShadow(1.3, 1.3, 0.65); sh.position.set(pos[0], 0.003, pos[2]); add(sh);
    cams.push(cam);
    cable(root, M, new THREE.Vector3(pos[0], 0.02, pos[2]), new THREE.Vector3(pos[0] * 2.4 + 3, 0.02, 12));
  }
  // camera 6: the 4K high-speed camera on the motion-control robot, on its track in front of the desk
  const robot = cineRobot(M);
  robot.group.userData.focus = 'slowmo';
  robot.group.userData.equipment = '4K camera robot';
  add(robot.group);
  cams.push(robot);
  cable(root, M, new THREE.Vector3(3.3, 0.02, ROBOT.z), new THREE.Vector3(4.5, 0.02, 12));
  anim.push((t, dt) => robot.update(dt));
  anim.push((t, dt, L) => {
    jib.arm.rotation.y = 0.12 + Math.sin(t * 0.11) * 0.3;
    jib.arm.rotation.z = -0.3 + Math.sin(t * 0.083 + 1) * 0.1; // negative lifts the camera end
    jib.cam.head.rotation.z = 0.35 - jib.arm.rotation.z;   // keep the lens pitched down at the desk
  });

  /* ----- music station (the 30 % electronic part): the DJ booth, on the Melbourne side ----- */
  const music = musicStation(M, glows, anim);
  music.userData.focus = 'music';
  music.position.set(5.4, 0, 0.1);
  music.rotation.y = -0.95;
  add(music);
  const mus = contactShadow(2.9, 1.3, 0.65); music.add(mus);

  /* ----- black concert grand, on the Vienna side opposite the DJ booth ----- */
  // the pianist sits nearest the stage, the tail out towards the studio's side, the open lid towards the cameras: the
  // mirror image of a concert stage seen from the other wing (so the case is mirrored too); the walk backstage
  // passes in front of the keyboard end
  const piano = grandPiano(M);
  piano.userData.focus = 'piano';
  piano.position.set(-5.3, 0, 0.3);
  piano.rotation.y = Math.PI / 2 - 0.38;
  piano.scale.x = -1;
  add(piano);
  const ps = contactShadow(3.0, 1.9, 0.6); ps.position.set(0, 0.003, -1.25); piano.add(ps);

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
  // the truss fixture nearest above the grand (Vienna side) is the one that turns to it in the piano shot
  root.updateMatrixWorld(true);
  const pianoAt = new THREE.Vector3(-6.5, 0, -0.2), at = new THREE.Vector3();
  const pianoLamp = fixtures.children.filter(f => f.isGroup && f.children.length > 1)
    .reduce((best, f) => { const d = f.getWorldPosition(at).setY(0).distanceTo(pianoAt); return d < best.d ? { f, d } : best; }, { f: null, d: Infinity }).f;
  const lights = buildLights(root, quality, wallLight, pianoLamp);

  /* ----- per-frame: lighting levels, LED colours, wall, tallies ----- */
  function update(t, dt, L, tally) {
    const pulse = 1 + L.aOn * L.aBass * 0.9;
    for (const { m, k } of glows.amber) m.color.copy(m.userData.base).multiplyScalar(k * L.amber * L.accent * pulse);
    for (const { m, k } of glows.ice) m.color.copy(m.userData.base).multiplyScalar(k * L.ice * L.accent * pulse);
    for (const { m, k } of glows.white) m.color.copy(m.userData.base).multiplyScalar(k * (0.35 + 0.65 * L.accent) * (1 - 0.75 * L.solo));
    for (const { m, k } of glows.gradient) {
      m.color.setScalar(k * L.accent * (0.85 + 0.15 * Math.sin(t * 1.2)) * (1 + L.aOn * L.aBass * 1.3));
    }
    gradTex.offset.x = Math.sin(t * 0.2) * 0.04 * (1 + 3 * L.music);
    wallMat.emissiveIntensity = L.wall;
    const tint = wall.tint();
    wallLight.color.setRGB(tint[0], tint[1], tint[2]);
    wallLight.intensity = 0.7 * L.wall;
    signMat.color.setScalar(L.onAir > 0.5 ? 1.6 : 0.12);
    cams.forEach((c, i) => c.tally(tally === i + 1 && L.onAir > 0.5));
    for (const f of anim) f(t, dt, L);
    lights.update(t, L);
  }

  const floorOpaque = () => { floor.material.transparent = false; floor.material.opacity = 1; floor.material.needsUpdate = true; };
  /* ----- the on-air beacons: a small one over the backstage door, two larger ones on the floor either side of the stage
     front. Off the rest of the time; turning slowly while the show is about to start; three flashes, each with a tone
     from the simulation, in the last three seconds; then off again for the whole time on air ----- */
  const beacons = [beacon(0.65), beacon(1.6, { light: true }), beacon(1.6, { light: true })];
  beacons[0].group.position.set(0, LOUNGE_DOOR.h + 0.3, 0.12); lounge.doorFrame.add(beacons[0].group);
  mesh(new THREE.BoxGeometry(0.05, 0.03, 0.12), M.graphite, lounge.doorFrame).position.set(0, LOUNGE_DOOR.h + 0.285, 0.06);    // its wall bracket
  for (const [k, x] of [[1, -2.75], [2, 2.75]]) { beacons[k].group.position.set(x, 0, 0.9); add(beacons[k].group); }
  let beaconMode = 'off', cueAt = 0, beaconClock = () => performance.now() / 1000;   // a rendered clip sets its own clock
  anim.push((t, dt) => {
    const now = beaconClock();                            // real time: the flashes keep step with the tones, also in slow motion
    if (beaconMode === 'cue' && now - cueAt >= 3) beaconMode = 'off';   // on air the beacons are dark
    const flash = beaconMode === 'cue' && (now - cueAt) % 1 < 0.4;
    for (const b of beacons) b.update(dt, beaconMode === 'air' ? 1.5 : beaconMode === 'standby' ? 0.7 : 0,
      beaconMode === 'air' ? 1 : beaconMode === 'standby' ? 0.45 : flash ? 1.3 : 0);
  });

  const viewfinders = createViewfinders(cams.map(c => c.vf).filter(Boolean));
  // M: the set's materials, for the Vienna piano stage (vienna/stage.js) built round the grand
  return { update, wall, cams, viewfinders, logo, desk, lights, music, piano, floorOpaque, root, lounge, robot, M, liftLogo(on) { liftTo = on ? 1 : 0; },
    beacons: { off() { beaconMode = 'off'; }, standby() { beaconMode = 'standby'; }, cue() { beaconMode = 'cue'; cueAt = beaconClock(); }, air() { beaconMode = 'air'; }, clock(fn) { beaconClock = fn; } } };
}

/* ---------- pieces ---------- */

/* ---------- a rotating red beacon (scale 1: a 14 cm dome on its base) ----------
   As a real one: a ribbed (Fresnel) red dome that catches the studio's lights, inside it a lamp and a parabolic mirror
   that turn, so a hot spot runs round the dome; two beams sweep the room, and the larger ones throw real red light. */
const ribTexture = (() => {
  let t = null;
  return () => {
    if (t) return t;
    const c = document.createElement('canvas'); c.width = 128; c.height = 8; const x = c.getContext('2d');
    for (let i = 0; i < 128; i++) { const v = 0.55 + 0.45 * Math.pow(Math.abs(Math.sin((i / 128) * Math.PI * 24)), 0.6); x.fillStyle = `rgb(${v * 255 | 0},${v * 255 | 0},${v * 255 | 0})`; x.fillRect(i, 0, 1, 8); }
    t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; return t;
  };
})();
function beacon(s, { light = false } = {}) {
  const g = new THREE.Group();
  const base = new THREE.MeshStandardMaterial({ color: 0x111214, metalness: 0.5, roughness: 0.5 });
  const ring = new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 1, roughness: 0.25 });
  // the dome: lit like a real lens (gloss from the studio lights), its ribs in both the colour and the glow
  const dome = new THREE.MeshStandardMaterial({ color: 0x5a0807, roughness: 0.18, metalness: 0, transparent: true, opacity: 0.62, depthWrite: false,
    map: ribTexture(), emissive: 0xff1a10, emissiveMap: ribTexture(), emissiveIntensity: 0.05, envMapIntensity: 1.2 });
  const add = (geo, mat, y, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; parent.add(m); return m; };
  add(new THREE.CylinderGeometry(0.075 * s, 0.085 * s, 0.045 * s, 40), base, 0.0225 * s);
  add(new THREE.TorusGeometry(0.064 * s, 0.004 * s, 8, 48).rotateX(Math.PI / 2), ring, 0.047 * s);
  add(new THREE.CylinderGeometry(0.06 * s, 0.062 * s, 0.075 * s, 48, 1, true), dome, 0.087 * s);
  add(new THREE.SphereGeometry(0.06 * s, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2), dome, 0.124 * s);
  // inside: the lamp, its parabolic mirror and the hot spot it throws on the dome, all turning
  const rot = new THREE.Group(); rot.position.y = 0.1 * s; g.add(rot);
  const mirror = new THREE.Mesh(new THREE.SphereGeometry(0.04 * s, 24, 12, Math.PI * 0.5, Math.PI, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0xe8ecf0, metalness: 1, roughness: 0.08, side: THREE.DoubleSide }));
  mirror.scale.set(1, 0.9, 0.55); rot.add(mirror);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.012 * s, 12, 8), new THREE.MeshBasicMaterial({ color: 0x220302 })); rot.add(bulb);
  const spotTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const r = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,235,225,1)'); r.addColorStop(0.25, 'rgba(255,70,50,0.9)'); r.addColorStop(1, 'rgba(255,0,0,0)'); x.fillStyle = r; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const hotMat = new THREE.MeshBasicMaterial({ map: spotTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0x000000 });
  const hot = new THREE.Mesh(new THREE.PlaneGeometry(0.075 * s, 0.075 * s), hotMat); hot.position.x = 0.059 * s; hot.rotation.y = Math.PI / 2; rot.add(hot);
  const len = 1.1 * s, beamMat = beamMaterial(new THREE.Color(1, 0.08, 0.04));
  const beam = new THREE.Mesh(new THREE.ConeGeometry(0.32 * len, len, 24, 1, true).translate(0, -len / 2, 0).rotateZ(Math.PI / 2), beamMat);
  rot.add(beam);
  // the larger beacons light the room: one red spot turning with the mirror (no shadow, so it costs little)
  let spot = null;
  if (light) {
    spot = new THREE.SpotLight(0xff2a18, 0, 9 * s, 0.42, 0.7, 2);
    spot.position.set(0, 0, 0); spot.target.position.set(1, -0.05, 0); rot.add(spot, spot.target);
  }
  g.traverse(m => { if (m.isMesh) m.castShadow = false; });
  return {
    group: g,
    // spin in turns per second, light 0..1+
    update(dt, spin, lit) {
      rot.rotation.y += dt * spin * Math.PI * 2;
      dome.emissiveIntensity = 0.05 + 1.6 * lit;
      bulb.material.color.setRGB(0.15 + 7 * lit, 0.02 + 1.2 * lit, 0.01 + 0.6 * lit);
      hotMat.color.setScalar(1.6 * lit);
      beamMat.uniforms.uOpacity.value = spin > 0 ? 0.45 * lit : 0;
      if (spot) spot.intensity = 26 * lit * s;
    },
  };
}

export function beamMaterial(color) {
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
  // satin chrome for the arm (a mirror finish read as a white line), a woven mesh head
  M.micArm ||= new THREE.MeshStandardMaterial({ color: 0xc9cdd3, metalness: 1, roughness: 0.22 });
  M.grille ||= new THREE.MeshStandardMaterial({ color: 0x6a6e76, metalness: 1, roughness: 0.42, bumpMap: micGrille(), bumpScale: 1.4 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.02, 32), M.graphite); base.position.y = 0.01; g.add(base);
  // rubber foot under the base, a fine bevel on its top edge, and a collar where the arm goes in
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.004, 32), M.rubber); foot.position.y = 0.001; g.add(foot);
  const bevel = new THREE.Mesh(new THREE.TorusGeometry(0.0595, 0.0016, 6, 48).rotateX(Math.PI / 2), M.micArm); bevel.position.y = 0.02; g.add(bevel);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.018, 16), M.graphite); collar.position.set(0, 0.028, 0.004); collar.rotation.x = 0.25; g.add(collar);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.26, 12), M.micArm);
  arm.position.set(0, 0.13, 0.03); arm.rotation.x = 0.25; g.add(arm);
  const capsule = new THREE.Group();
  capsule.position.set(0, 0.26, 0.07); capsule.rotation.x = 1.1; g.add(capsule);
  capsule.add(new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.02, 0.16, 24), M.graphite));
  const grill = new THREE.Mesh(new THREE.SphereGeometry(0.026, 32, 20), M.grille); grill.position.y = 0.09; capsule.add(grill);
  // a bright trim ring where the mesh head meets the body
  const trim = new THREE.Mesh(new THREE.TorusGeometry(0.0238, 0.0018, 6, 40).rotateX(Math.PI / 2), M.micArm); trim.position.y = 0.079; capsule.add(trim);
  const ringMat = glow(color);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0235, 0.003, 8, 32).rotateX(Math.PI / 2), ringMat); ring.position.y = 0.05; capsule.add(ring);
  // shock mount: a ring around the body held by a small yoke on the arm
  const shock = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.0035, 8, 32).rotateX(Math.PI / 2), M.graphite); shock.position.y = -0.01; capsule.add(shock);
  for (const sx of [-1, 1]) { const y = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.03, 0.008), M.graphite); y.position.set(sx * 0.036, -0.03, 0); capsule.add(y); }
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.012, 16), M.chrome); knob.rotation.z = Math.PI / 2; knob.position.set(0.04, -0.03, 0); capsule.add(knob);
  // hinge at the top of the arm: a knuckle with two screw caps
  const knuckle = new THREE.Group(); knuckle.position.set(0, 0.256, 0.062); g.add(knuckle);
  const kn = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.024, 16), M.graphite); kn.rotation.z = Math.PI / 2; knuckle.add(kn);
  for (const sx of [-1, 1]) { const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.004, 12), M.micArm); cap.rotation.z = Math.PI / 2; cap.position.x = sx * 0.014; knuckle.add(cap); }
  // cable from the base into a desk grommet
  const grommet = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.003, 8, 20).rotateX(Math.PI / 2), M.brushed); grommet.position.set(0.03, 0.002, -0.1); g.add(grommet);
  const lead = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.012, -0.055), new THREE.Vector3(0.012, 0.01, -0.085), new THREE.Vector3(0.03, -0.01, -0.1)]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(lead, 12, 0.0025, 6), M.rubber));
  const hex = color.getHex();
  (hex === new THREE.Color(AMBER).getHex() ? glows.amber : hex === new THREE.Color(ICE).getHex() ? glows.ice : glows.white).push({ m: ringMat, k: 2.5 });
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
  // the inner elements: two fine dark retaining rings and a faint bright one, so the glass has depth
  for (const [r, mat] of [[0.066, M.seam], [0.045, M.edge], [0.03, M.seam]]) add(ax(new THREE.TorusGeometry(r, 0.0016, 6, 48).rotateX(Math.PI / 2)), mat, 0, 0, 0.0812, lensGroup);
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
  // side panel screws on the body
  for (const sx of [-1, 1]) for (const [w, y, z] of [[0.1215, 0.1, 0.13], [0.1215, 0.1, 0.51], [0.1215, 0.3, 0.51]]) {   // on the front section, where they are seen
    const sc = add(new THREE.CylinderGeometry(0.006, 0.006, 0.004, 10), M.brushed, sx * w, y, z, head); sc.rotation.z = Math.PI / 2;
  }
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
  // its picture: from the lens, through the prompter glass, along the head's +z (the viewfinder shows it, live)
  const vf = { screen: vfScreen, head, eye: new THREE.Vector3(0, 0.2, 1.02), ahead: new THREE.Vector3(0, 0.2, 6), fov: 30, name: `CAM ${n}` };
  return { group, head, vf, tally(on) { tallyMat.color.setRGB(on ? 6 : 0.14, on ? 0.15 : 0.015, on ? 0.12 : 0.02); } };
}

// a compact 4K high-speed (slow-motion) camera: box body, cine lens with matte box, top monitor, on a short slider
// the 4K high-speed camera itself (the robot below carries it): lens along local +z, mounting point at the origin
function highSpeedCamera(M) {
  const add = (geo, mat, x, y, z, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const ax = geo => geo.rotateX(Math.PI / 2);
  const head = new THREE.Group();
  // body, cine lens (focus and iris rings, glass), matte box
  add(new RoundedBoxGeometry(0.13, 0.13, 0.21, 3, 0.012), M.camBody, 0, 0.065, 0, head);
  for (const sx of [-1, 1]) { const v = add(new THREE.PlaneGeometry(0.15, 0.07), M.vent, sx * 0.0655, 0.065, -0.01, head); v.rotation.y = sx * Math.PI / 2; }
  add(ax(new THREE.CylinderGeometry(0.046, 0.046, 0.16, 32)), M.graphite, 0, 0.065, 0.18, head);
  for (const z of [0.15, 0.2]) add(ax(new THREE.CylinderGeometry(0.05, 0.05, 0.024, 32)), M.rubber, 0, 0.065, z, head);
  add(ax(new THREE.TorusGeometry(0.038, 0.003, 6, 32).rotateX(Math.PI / 2)), M.chrome, 0, 0.065, 0.261, head);
  add(new THREE.CircleGeometry(0.037, 32), M.lensGlass, 0, 0.065, 0.26, head);
  // matte box: open front and back, four thin flags
  for (const [w, h, x, y] of [[0.15, 0.004, 0, 0.12], [0.15, 0.004, 0, 0.01], [0.004, 0.11, -0.075, 0.065], [0.004, 0.11, 0.075, 0.065]]) add(new THREE.BoxGeometry(w, h, 0.08), M.graphite, x, y, 0.3, head);
  // top handle, a small monitor facing back, the label, and the record lamp
  add(new THREE.BoxGeometry(0.02, 0.02, 0.16), M.graphite, 0, 0.15, 0.02, head);
  const mon = add(new RoundedBoxGeometry(0.12, 0.08, 0.016, 2, 0.004), M.camBody, 0, 0.19, -0.07, head); mon.rotation.x = -0.35;
  const scr = add(new THREE.PlaneGeometry(0.105, 0.065), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.07, 0.1) }), 0, 0.187, -0.0795, head); scr.rotation.set(-0.35, Math.PI, 0);
  const plate = new THREE.MeshBasicMaterial({ map: label('4K · 1000 FPS', { w: 512, h: 96, size: 54 }) });
  for (const sx of [-1, 1]) { const p = add(new THREE.PlaneGeometry(0.12, 0.0225), plate, sx * 0.0662, 0.115, -0.01, head); p.rotation.y = sx * Math.PI / 2; }
  const tallyMat = new THREE.MeshBasicMaterial({ color: 0x220405 });
  add(new THREE.BoxGeometry(0.02, 0.012, 0.012), tallyMat, 0.045, 0.136, 0.09, head);
  shadows(head);
  const vf = { screen: scr, head, eye: new THREE.Vector3(0, 0.065, 0.33), ahead: new THREE.Vector3(0, 0.065, 6), fov: 38, name: 'SLOW-MO 4K' };
  return { head, vf, tally(on) { tallyMat.color.setRGB(on ? 6 : 0.14, on ? 0.15 : 0.015, on ? 0.12 : 0.02); } };
}

/* ---------- motion-control camera robot (like the arms on real sets) carrying the 4K high-speed camera ----------
   On a floor track in front of the desk: carriage, turning base, shoulder, upper arm, elbow, forearm, wrist. Parked
   folded and low (below every other shot's frame); on the slow-mo shot it flies its programme of moves, and the
   picture is taken from its lens. The arm is solved each frame (two-link IK) for where the camera has to be. */
const ROBOT = { z: 2.6, shoulder: 0.58, L1: 1.15, L2: 1.1 };
// the programme, in the set's own (slowed) time: track position, where the camera is, what it looks at
const MOVES = [
  [0.8, 0, [0, 0.35, 2.0], [0, 1.05, -1.9]],          // on the floor, low on the desk
  [1.2, 0, [0, 2.3, 1.8], [0, 0.85, -1.9]],            // rise up over it
  [0.9, -2.4, [-1.9, 1.25, 1.7], [0, 1.0, -1.9]],      // across to the Vienna side
  [1.4, 2.4, [1.9, 1.25, 1.7], [0, 1.0, -1.9]],        // the arc past the desk to Melbourne
  [0.8, 1.6, [1.3, 0.45, 1.5], [0.95, 1.2, -1.95]],    // down low on Georgie's chair
  [1.3, -0.4, [-0.3, 2.35, 1.3], [0, 3.6, -5.5]],      // the swoop up to the logo
  [0.9, -1.5, [-1.2, 0.45, 1.6], [-0.95, 1.2, -1.95]], // low on Andy'K's chair, then back to the floor
];
function cineRobot(M) {
  const group = new THREE.Group();
  const add = (geo, mat, x, y, z, parent = group) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  // satin titanium, so it reads against the dark set; thin amber light rings at the joints, in the studio's colours
  const body = new THREE.MeshPhysicalMaterial({ color: 0x6a6f77, metalness: 0.8, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  const led = new THREE.MeshBasicMaterial({ color: new THREE.Color(AMBER).multiplyScalar(1.6) });
  const ring = (r, parent, z = 0, axis = 'z') => { const t = add(new THREE.TorusGeometry(r, 0.006, 6, 40), led, 0, 0, z, parent); if (axis === 'y') t.rotation.x = Math.PI / 2; if (axis === 'x') t.rotation.y = Math.PI / 2; return t; };
  // track: two rails on sleepers along the front of the set, with end stops
  for (const z of [-0.13, 0.13]) add(new THREE.BoxGeometry(6.4, 0.035, 0.05), M.brushed, 0, 0.0475, ROBOT.z + z);
  for (let x = -3.1; x <= 3.11; x += 0.62) add(new THREE.BoxGeometry(0.08, 0.03, 0.42), M.graphite, x, 0.015, ROBOT.z);
  for (const x of [-3.22, 3.22]) add(new THREE.BoxGeometry(0.06, 0.1, 0.4), M.graphite, x, 0.06, ROBOT.z);
  // carriage, base and turning column
  const carriage = new THREE.Group(); carriage.position.set(0, 0, ROBOT.z); group.add(carriage);
  add(new RoundedBoxGeometry(0.52, 0.08, 0.46, 2, 0.015), M.graphite, 0, 0.105, 0, carriage);
  add(new THREE.CylinderGeometry(0.2, 0.22, 0.2, 32), body, 0, 0.245, 0, carriage);
  const column = new THREE.Group(); column.position.y = 0.345; carriage.add(column);
  add(new THREE.CylinderGeometry(0.17, 0.19, 0.2, 32), body, 0, 0.1, 0, column);
  ring(0.19, column, 0, 'y').position.y = 0.01;
  // shoulder, upper arm, elbow, forearm (each arm along its local +z, pitched about x)
  const shoulder = new THREE.Group(); shoulder.position.y = ROBOT.shoulder - 0.345; column.add(shoulder);
  const jt = (r, len, parent) => { const c = add(new THREE.CylinderGeometry(r, r, len, 32).rotateZ(Math.PI / 2), body, 0, 0, 0, parent); for (const sx of [-1, 1]) ring(r * 0.8, parent, 0, 'x').position.x = sx * (len / 2 + 0.002); return c; };
  jt(0.14, 0.32, shoulder);
  add(new RoundedBoxGeometry(0.17, 0.17, ROBOT.L1, 3, 0.05), body, 0, 0, ROBOT.L1 / 2, shoulder);
  const elbow = new THREE.Group(); elbow.position.z = ROBOT.L1; shoulder.add(elbow);
  jt(0.11, 0.26, elbow);
  add(new RoundedBoxGeometry(0.13, 0.13, ROBOT.L2, 3, 0.04), body, 0, 0, ROBOT.L2 / 2, elbow);
  const wrist = new THREE.Group(); wrist.position.z = ROBOT.L2; elbow.add(wrist);
  add(new THREE.SphereGeometry(0.08, 24, 16), body, 0, 0, 0, wrist);
  // a cable loom along the arm
  const loom = new THREE.CatmullRomCurve3([new THREE.Vector3(0.1, 0.05, 0.1), new THREE.Vector3(0.11, 0.1, ROBOT.L1 * 0.5), new THREE.Vector3(0.09, 0.06, ROBOT.L1 - 0.1)]);
  shoulder.add(new THREE.Mesh(new THREE.TubeGeometry(loom, 16, 0.014, 6), M.rubber));
  // the camera, held at the wrist and aimed separately (the wrist's three axes)
  const cam = highSpeedCamera(M);
  const head = cam.head; group.add(head);
  shadows(group);

  const v = new THREE.Vector3(), wp = new THREE.Vector3(), look = new THREE.Vector3(), lens = new THREE.Vector3(), park = new THREE.Vector3(0, 1.0, -1.9);
  const total = MOVES.reduce((a, m) => a + m[0], 0);
  let u = 0, active = false;
  function pose(trackX, wristAt, lookAt) {
    carriage.position.x = trackX;
    const sx = trackX, sy = ROBOT.shoulder, sz = ROBOT.z;
    const dx = wristAt.x - sx, dy = wristAt.y - sy, dz = wristAt.z - sz;
    column.rotation.y = Math.atan2(dx, dz);
    const r = Math.hypot(dx, dz), { L1, L2 } = ROBOT;
    const d = THREE.MathUtils.clamp(Math.hypot(r, dy), Math.abs(L1 - L2) + 0.02, L1 + L2 - 0.02);
    const a1 = Math.atan2(dy, r) + Math.acos(THREE.MathUtils.clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));   // elbow up
    const a2 = Math.PI - Math.acos(THREE.MathUtils.clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
    shoulder.rotation.x = -a1; elbow.rotation.x = a2;
    group.updateMatrixWorld(true);
    wrist.getWorldPosition(wp);
    head.position.copy(wp).y += 0.06; head.lookAt(lookAt);
  }
  return {
    group, head, tally: cam.tally, vf: cam.vf,
    // the camera's picture: where its lens is and what it looks at (for the slow-mo shot)
    shot: { pos: lens, target: look },
    set active(on) { if (on && !active) u = 0; active = on; },
    update(dt) {
      if (!active) {
        // parked: at the Vienna end of the track, folded over itself along the rail, low: outside every other shot
        carriage.position.x = -2.8; column.rotation.y = -Math.PI / 2; shoulder.rotation.x = -0.18; elbow.rotation.x = 2.75;
        group.updateMatrixWorld(true); wrist.getWorldPosition(wp); head.position.copy(wp).y += 0.06; head.lookAt(park);
        return;
      }
      u = (u + dt) % total;
      let i = 0, t = u;
      while (t > MOVES[i][0]) { t -= MOVES[i][0]; i++; }
      const [dur, x0, w0, l0] = MOVES[i], [, x1, w1, l1] = MOVES[(i + 1) % MOVES.length];
      const k = THREE.MathUtils.smoothstep(t / dur, 0, 1);
      look.set(...l0).lerp(v.set(...l1), k);
      const w = new THREE.Vector3(...w0).lerp(v.set(...w1), k);
      pose(THREE.MathUtils.lerp(x0, x1, k), w, look);
      head.localToWorld(lens.set(0, 0.065, 0.36));
    },
  };
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
  // DJ Andy'K AKX 2026 (software by Andy'K Music Lab), a club-standard booth with no other maker's name: two media players with large jog wheels and tilted touch screens either side
  // of a four-channel mixer (EQ, channel faders, crossfader), the players' top plates level with the mixer's
  const TOP = 1.09, jogs = [], pads = [], gearFrom = g.children.length;
  const knobs = [], slots = [], caps = [];
  const btnMat = c => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.6) });
  for (const [s, n, colr] of [[-1, 1, AMBER], [1, 2, ICE]]) {
    const px = s * 0.37;
    add(new RoundedBoxGeometry(0.33, 0.1, 0.45, 3, 0.012), M.graphite, px, TOP - 0.05, 0);
    add(new THREE.BoxGeometry(0.31, 0.003, 0.43), M.blackGlass, px, TOP + 0.0015, 0);
    // the touch screen, tilted towards the DJ
    const scr = new THREE.Group(); scr.position.set(px, TOP + 0.03, -0.14); scr.rotation.x = 0.38; g.add(scr);
    add(new RoundedBoxGeometry(0.27, 0.03, 0.16, 2, 0.008), M.dark, 0, 0, 0, scr);
    add(new THREE.PlaneGeometry(0.24, 0.14), new THREE.MeshBasicMaterial({ map: deckScreen(n, colr) }), 0, 0.0155, 0, scr).rotation.x = -Math.PI / 2;
    // the jog wheel: rubber rim, brushed platter with its centre display, a lit ring; the platter turns
    add(new THREE.CylinderGeometry(0.112, 0.112, 0.012, 64), M.rubber, px, TOP + 0.006, 0.07);
    const jog = new THREE.Group(); jog.position.set(px, TOP + 0.013, 0.07); g.add(jog);
    add(new THREE.CylinderGeometry(0.1, 0.1, 0.01, 64), M.brushed, 0, 0, 0, jog);
    for (let k = 0; k < 3; k++) add(new THREE.BoxGeometry(0.004, 0.002, 0.03), M.chrome, Math.cos(k * 2.09) * 0.075, 0.006, Math.sin(k * 2.09) * 0.075, jog).rotation.y = -k * 2.09;
    add(new THREE.CylinderGeometry(0.036, 0.036, 0.003, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(colr).multiplyScalar(0.55) }), 0, 0.0065, 0, jog);
    const ringMat = glow(new THREE.Color(colr));
    add(new THREE.TorusGeometry(0.106, 0.003, 8, 96).rotateX(Math.PI / 2), ringMat, px, TOP + 0.013, 0.07);
    (s < 0 ? glows.amber : glows.ice).push({ m: ringMat, k: 2.4 });
    jogs.push(jog);
    // CUE and PLAY, bottom left; eight performance pads under the screen; the tempo fader on the right
    add(new THREE.CylinderGeometry(0.018, 0.018, 0.008, 32), btnMat(0xffa23a), px - 0.125, TOP + 0.004, 0.13);
    add(new THREE.CylinderGeometry(0.018, 0.018, 0.008, 32), btnMat(0x3ad16b), px - 0.125, TOP + 0.004, 0.185);
    for (let k = 0; k < 8; k++) pads.push([px - 0.105 + k * 0.03, TOP + 0.003, -0.045, k]);
    slots.push([px + 0.135, TOP + 0.001, 0.08, 0.012, 0.17]);
    caps.push([px + 0.135, TOP + 0.009, 0.06, 0.03, 0.016]);
  }
  // the mixer
  add(new RoundedBoxGeometry(0.38, 0.1, 0.45, 3, 0.012), M.graphite, 0, TOP - 0.05, 0);
  add(new THREE.BoxGeometry(0.36, 0.003, 0.43), M.blackGlass, 0, TOP + 0.0015, 0);
  const CH = [-0.12, -0.04, 0.04, 0.12];
  CH.forEach((cx, ch) => {
    for (const z of [-0.18, -0.13, -0.09, -0.05]) knobs.push([cx, z]);
    slots.push([cx, TOP + 0.001, 0.1, 0.008, 0.11]);
    caps.push([cx, TOP + 0.009, 0.07 + ch * 0.012, 0.022, 0.014]);
  });
  for (const z of [-0.18, -0.12]) knobs.push([0.168, z]);
  slots.push([0, TOP + 0.001, 0.19, 0.13, 0.01]);   // crossfader
  caps.push([0, TOP + 0.009, 0.19, 0.016, 0.03]);
  // the booth's name on the far sides, which face the room and the cameras (the DJ stands behind the booth)
  const plate = (text, wd, x, size = 64, color = '#e7c48d') => { const m = add(new THREE.PlaneGeometry(wd, wd / 8), new THREE.MeshBasicMaterial({ map: label(text, { w: 1024, h: 128, size, color, bg: '#1b1d22' }) }), x, TOP - 0.05, -0.2265); m.rotation.y = Math.PI; return m; };
  // the mixer's front: the DJ Andy'K logo, lit, and the model name beside it
  const djTex = new THREE.TextureLoader().load(new URL('../assets/sponsor-djandyk.webp', import.meta.url).href); djTex.colorSpace = THREE.SRGBColorSpace; djTex.anisotropy = 8;
  add(new THREE.PlaneGeometry(0.084, 0.084 * 273 / 520), new THREE.MeshBasicMaterial({ map: djTex, transparent: true, alphaTest: 0.04, color: new THREE.Color(1.15, 1.05, 0.92) }), 0.075, TOP - 0.05, -0.2268).rotation.y = Math.PI;
  plate('AKX 2026', 0.16, -0.095, 72);
  plate('AKX 2026  ·  DECK 1', 0.26, -0.37, 56, '#c9ced6'); plate('AKX 2026  ·  DECK 2', 0.26, 0.37, 56, '#c9ced6');   // (seen from the room, deck 1 is on the right)
  const fx = add(new THREE.PlaneGeometry(0.07, 0.035), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.18, 0.24, 0.34) }), -0.168, TOP + 0.002, -0.15);
  fx.rotation.x = -Math.PI / 2;
  // the small parts as instances: a handful of draw calls for the whole booth
  const inst = (geo, mat, list, place) => { const im = new THREE.InstancedMesh(geo, mat, list.length); const o = new THREE.Object3D(); list.forEach((v, k) => { place(o, v); o.updateMatrix(); im.setMatrixAt(k, o.matrix); }); g.add(im); return im; };
  inst(new THREE.CylinderGeometry(0.011, 0.012, 0.018, 20), M.rubber, knobs, (o, [x, z]) => { o.position.set(x, TOP + 0.009, z); o.scale.set(1, 1, 1); });
  inst(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x020203 }), slots, (o, [x, y, z, sx, sz]) => { o.position.set(x, y, z); o.scale.set(sx, 0.002, sz); });
  const capMesh = inst(new THREE.BoxGeometry(1, 1, 1), M.brushed, caps, (o, [x, y, z, sx, sy]) => { o.position.set(x, y, z); o.scale.set(sx, sy, sx === 0.016 ? 0.03 : 0.018); });
  const padMesh = inst(new THREE.BoxGeometry(0.024, 0.006, 0.02), new THREE.MeshBasicMaterial(), pads, (o, [x, y, z]) => o.position.set(x, y, z));
  const PAD = [0xff4a3d, 0xffa23a, 0xf3d36b, 0x3ad16b, 0x3ad1c9, 0x4a8cff, 0x9a6bff, 0xff6bd1];
  pads.forEach(([, , , k], i) => padMesh.setColorAt(i, new THREE.Color(PAD[k]).multiplyScalar(0.9)));
  // channel level meters, beside each fader
  const meters = new THREE.InstancedMesh(new THREE.BoxGeometry(0.008, 0.003, 0.006), new THREE.MeshBasicMaterial(), 4 * 12);
  const o = new THREE.Object3D(), col = new THREE.Color();
  for (let ch = 0; ch < 4; ch++) for (let i = 0; i < 12; i++) {
    o.position.set(CH[ch] + 0.02, TOP + 0.002, 0.15 - i * 0.009); o.updateMatrix();
    meters.setMatrixAt(ch * 12 + i, o.matrix);
    meters.setColorAt(ch * 12 + i, col.set(0x111111));
  }
  g.add(meters);
  // the gear a quarter over life size: on the 2.3 m booth and on camera it read as small; scaled about the table top
  const gear = new THREE.Group(), GEAR = 1.25;
  gear.scale.setScalar(GEAR); gear.position.y = 0.99 * (1 - GEAR);
  gear.rotation.y = Math.PI;   // the DJ stands behind the booth and faces the room, not the wall
  gear.add(...g.children.slice(gearFrom)); g.add(gear);
  let fadersAt = '';
  const fo = new THREE.Object3D();
  anim.push((t, dt, L) => {
    jogs.forEach((r, k) => { r.rotation.y -= dt * (L.djOn ? ([L.djA, L.djB][k] ? 3.5 : 0) : 0.4 + 2.6 * L.music + 5 * L.aOn * L.aLevel); });   // a playing deck: about 33 rpm
    // channel 2 and 3 faders follow decks 1 and 2 (up, away from the DJ, is louder); the crossfader follows its slider
    const key = `${L.djVA}|${L.djVB}|${L.djX}`;
    if (key !== fadersAt) {
      fadersAt = key;
      for (const [k, v] of [[3, L.djVA], [4, L.djVB]]) { fo.position.set(CH[k - 2], TOP + 0.009, 0.15 - v * 0.1); fo.scale.set(0.022, 0.014, 0.018); fo.updateMatrix(); capMesh.setMatrixAt(k, fo.matrix); }
      fo.position.set(-0.06 + L.djX * 0.12, TOP + 0.009, 0.19); fo.scale.set(0.016, 0.016, 0.03); fo.updateMatrix(); capMesh.setMatrixAt(6, fo.matrix);
      capMesh.instanceMatrix.needsUpdate = true;
    }
    for (let ch = 0; ch < 4; ch++) {
      const heard = [L.aBass, L.aMid, L.aHigh, L.aLevel][ch] * 1.5;                 // real levels while something plays
      const lvl = THREE.MathUtils.lerp(L.accent * (0.45 + 0.4 * Math.abs(Math.sin(t * (2.3 + ch * 0.7) + ch)) * (0.4 + 0.6 * L.music)), heard, L.aOn);
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

/* ---------- the official logo artwork (assets/logo-do-1k.webp), hung as it is ----------
   The crystal D//0 picture itself on a card, unlit, so its gold and silver stay exactly as drawn (the set's
   lights and tone mapping would grey it). Alpha cut-out, so it hangs free in front of the wall and casts its
   own shape as a shadow. A single card is paper-thin from the jib and crane, so the letters get a body: the same
   cut-out stacked through 10 cm, darker inside, reads as a solid edge from the side (the face stays as drawn). */

function buildLogoImage() {
  const g = new THREE.Group();
  const tex = new THREE.TextureLoader().load(new URL('../assets/logo-do-1k.webp', import.meta.url).href);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  // the picture fills 1024 x 501 of its 1024 x 512 canvas; 2.12 m wide, as the key-visual logo it replaces
  const w = 2.12, h = w * 512 / 1024, depth = 0.1, layers = 28;
  const geo = new THREE.PlaneGeometry(w, h);
  const face = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, toneMapped: false, color: new THREE.Color(0.94, 0.94, 0.94), side: THREE.DoubleSide });   // a touch under white: only its sparkle blooms
  // the front as before: soft edges blended over the solid body behind it
  const front = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.04, toneMapped: false, color: face.color, side: THREE.DoubleSide });
  const edge = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, toneMapped: false, color: new THREE.Color(0.32, 0.31, 0.3), side: THREE.DoubleSide });   // the sides: the metal in shade
  for (let i = 0; i <= layers; i++) {
    const card = new THREE.Mesh(geo, i === layers ? front : i === 0 ? face : edge);
    card.position.set(0, h / 2 - 0.05, 0.12 - depth + depth * i / layers);
    card.userData.noShadow = i !== layers;   // one shadow is enough
    g.add(card);
  }
  return g;
}

/* ---------- logo after the key visual (assets/keyvisual.jpg): the official reference for the 3D logo ----------
   Proportions measured on the key visual, letter height 1: a wide D with a square stem and big rounded corners on the
   right, two thin parallel slashes, a tall rounded 0 with a narrow slot. Spacing keeps every part clear of the next,
   bevels included. Warm Vienna side (D and first slash), cool
   Melbourne side (second slash and 0). Deeper, crisper glass than the first version. */

// a closed polyline: follows the outline exactly, so corners stay sharp (a smoothed curve overshot into small curls)
class Outline extends THREE.Curve {
  constructor(points) {
    super();
    const p = points.filter((q, i) => i === 0 || q.distanceTo(points[i - 1]) > 1e-5);
    if (p.length > 1 && p[0].distanceTo(p[p.length - 1]) < 1e-5) p.pop();
    this.p = p; this.len = [0];
    for (let i = 1; i <= p.length; i++) this.len.push(this.len[i - 1] + p[i - 1].distanceTo(p[i % p.length]));
  }
  getPoint(t, target = new THREE.Vector3()) {
    const d = (t % 1) * this.len[this.len.length - 1], { p, len } = this;
    let i = 1; while (i < len.length - 1 && len[i] < d) i++;
    const k = (d - len[i - 1]) / (len[i] - len[i - 1] || 1);
    return target.copy(p[i - 1]).lerp(p[i % p.length], k);
  }
}

// rectangle with its own radius per corner: [bottom-left, bottom-right, top-right, top-left]
function cornerShape(x, y, w, h, [bl, br, tr, tl], shape = new THREE.Shape()) {
  shape.moveTo(x + bl, y);
  shape.lineTo(x + w - br, y); if (br) shape.absarc(x + w - br, y + br, br, -Math.PI / 2, 0, false);
  shape.lineTo(x + w, y + h - tr); if (tr) shape.absarc(x + w - tr, y + h - tr, tr, 0, Math.PI / 2, false);
  shape.lineTo(x + tl, y + h); if (tl) shape.absarc(x + tl, y + h - tl, tl, Math.PI / 2, Math.PI, false);
  shape.lineTo(x, y + bl); if (bl) shape.absarc(x + bl, y + bl, bl, Math.PI, Math.PI * 1.5, false);
  return shape;
}

function buildLogoKV(M, glows) {
  const g = new THREE.Group();
  const D = cornerShape(0, 0, 0.84, 1, [0, 0.42, 0.42, 0]);
  D.holes.push(cornerShape(0.24, 0.22, 0.4, 0.56, [0, 0.2, 0.2, 0], new THREE.Path()));
  const slash = x0 => { const s = new THREE.Shape(); s.moveTo(x0, 0); s.lineTo(x0 + 0.11, 0); s.lineTo(x0 + 0.40, 1); s.lineTo(x0 + 0.29, 1); s.closePath(); return s; };
  const O = cornerShape(1.38, 0, 0.72, 1, [0.34, 0.34, 0.34, 0.34]);
  O.holes.push(cornerShape(1.63, 0.23, 0.22, 0.54, [0.11, 0.11, 0.11, 0.11], new THREE.Path()));
  const parts = [[D, M.logoWarm, C.amber], [slash(0.82), M.logoWarm, C.amber], [slash(0.99), M.logoCool, C.ice], [O, M.logoCool, C.ice]];
  const depth = 0.22;
  for (const [shape, mat, col] of parts) {
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 2, curveSegments: 48 });
    g.add(new THREE.Mesh(geo, mat));
    const lineMat = glow(col);
    (col === C.amber ? glows.amber : glows.ice).push({ m: lineMat, k: 3.2 });
    for (const path of [shape, ...shape.holes]) {
      const outline = new Outline(path.getPoints(48).map(p => new THREE.Vector3(p.x, p.y, 0)));
      for (const z of [depth + 0.042, -0.042]) {
        const tube = new THREE.Mesh(new THREE.TubeGeometry(outline, outline.p.length * 2, z > 0 ? 0.007 : 0.005, 6, true), lineMat);
        tube.position.z = z;
        g.add(tube);
      }
    }
  }
  const box = new THREE.Box3().setFromObject(g), cx = (box.min.x + box.max.x) / 2;
  for (const c of g.children) c.position.x -= cx;                          // centred, so it hangs between the cables
  return g;
}

/* ---------- backstage lounge: a small D//0 living room behind the LED wall ----------
   Inside the gap between the wall (z -7) and the studio's back wall: 7 m wide, 3.85 m deep, 3 m high, closed on all
   sides, so no studio shot sees into it. Four monitors carry live feeds (rendered by main.js while someone is in here),
   three armchairs (Andrej, the guest, Georgie), a coffee table with coffee and sekt, an arc lamp, warm cove light. */
export const LOUNGE = { x0: -3.5, x1: 3.5, z0: -11.2, z1: -7.35, h: 3 };
export const LOUNGE_DOOR = { z: -8.3, w: 0.95, h: 2.2 };   // in the Vienna-side wall (x0), reached around the LED wall's end

function buildLounge(M, quality) {
  const g = new THREE.Group(), { x0, x1, z0, z1, h } = LOUNGE, W = x1 - x0, D = z1 - z0, cz = (z0 + z1) / 2;
  g.userData.focus = 'backstage';
  const add = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const physical = o => new THREE.MeshPhysicalMaterial(o);
  const L = {
    wall: new THREE.MeshStandardMaterial({ color: 0x1a1612, metalness: 0.1, roughness: 0.8, map: panelJoints(12, 2) }),
    floor: physical({ color: 0x1c130d, metalness: 0, roughness: 0.42, roughnessMap: roughnessNoise(3), clearcoat: 0.4, clearcoatRoughness: 0.3 }),
    rug: new THREE.MeshStandardMaterial({ color: 0x14100d, roughness: 0.95 }),
    cognac: physical({ color: 0x4a2a17, metalness: 0, roughness: 0.5, normalMap: leatherNormal(3), normalScale: new THREE.Vector2(0.4, 0.4), sheen: 0.3, sheenColor: new THREE.Color(0x6b4a33), clearcoat: 0.25, clearcoatRoughness: 0.4 }),
    walnut: physical({ color: 0x241710, metalness: 0, roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.25 }),
    porcelain: physical({ color: 0xf2efe9, metalness: 0, roughness: 0.18, clearcoat: 0.8 }),
    coffee: new THREE.MeshStandardMaterial({ color: 0x2a160b, roughness: 0.25 }),
    bottle: physical({ color: 0x0c2414, metalness: 0, roughness: 0.08, clearcoat: 1 }),
    foil: new THREE.MeshStandardMaterial({ color: 0xc9a671, metalness: 1, roughness: 0.3 }),
    flute: physical({ color: 0xdfe6ee, metalness: 0, roughness: 0.02, transparent: true, opacity: 0.28, depthWrite: false, clearcoat: 1 }),
    sekt: new THREE.MeshStandardMaterial({ color: 0xe8c56a, roughness: 0.1, transparent: true, opacity: 0.75, emissive: 0x3a2a08 }),
    marble: physical({ color: 0xd9d6d0, metalness: 0, roughness: 0.25, clearcoat: 0.6 }),
  };
  // room: floor, walls, ceiling (all facing inwards)
  add(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), L.floor, 0, 0.004, cz).receiveShadow = true;
  // walls, seen from both sides (the walk from the studio passes outside them); the Vienna-side wall has the doorway
  L.wall.side = THREE.DoubleSide;
  const DOOR = LOUNGE_DOOR, dz0 = DOOR.z - DOOR.w / 2, dz1 = DOOR.z + DOOR.w / 2;
  for (const [w, x, z, ry] of [[W, 0, z0, 0], [W, 0, z1, Math.PI], [D, x1, cz, -Math.PI / 2], [dz0 - z0, x0, (z0 + dz0) / 2, Math.PI / 2], [z1 - dz1, x0, (dz1 + z1) / 2, Math.PI / 2]])
    add(new THREE.PlaneGeometry(w, h), L.wall, x, h / 2, z).rotation.y = ry;
  add(new THREE.PlaneGeometry(DOOR.w, h - DOOR.h), L.wall, x0, (h + DOOR.h) / 2, DOOR.z).rotation.y = Math.PI / 2;   // over the door
  // the door: champagne frame, a dark leaf hinged at the front that swings into the room as someone comes
  const frame = new THREE.Group(); frame.position.set(x0, 0, DOOR.z); frame.rotation.y = -Math.PI / 2; g.add(frame);   // local +z = outside
  for (const [w, hh, x, y] of [[DOOR.w + 0.08, 0.04, 0, DOOR.h + 0.02], [0.04, DOOR.h, -DOOR.w / 2 - 0.02, DOOR.h / 2], [0.04, DOOR.h, DOOR.w / 2 + 0.02, DOOR.h / 2]])
    for (const zz of [-0.03, 0.03]) add(new THREE.BoxGeometry(w, hh, 0.03), M.shellGold, x, y, zz, frame);
  const leafPivot = new THREE.Group(); leafPivot.position.set(-DOOR.w / 2, 0, 0); frame.add(leafPivot);
  add(new THREE.BoxGeometry(DOOR.w - 0.02, DOOR.h - 0.02, 0.04), M.blackGlass, DOOR.w / 2, DOOR.h / 2, 0, leafPivot);
  add(new THREE.BoxGeometry(0.012, 0.22, 0.02), M.shellGold, DOOR.w - 0.12, 1.02, 0.035, leafPivot);
  add(new THREE.BoxGeometry(0.012, 0.22, 0.02), M.shellGold, DOOR.w - 0.12, 1.02, -0.035, leafPivot);
  add(new THREE.PlaneGeometry(0.42, 0.16), new THREE.MeshBasicMaterial({ map: label('NO ENTRY', { w: 512, h: 200, size: 66, color: '#ff5a4d', bg: '#0b0909' }) }), DOOR.w / 2, 1.5, 0.022, leafPivot);
  const over = add(new THREE.PlaneGeometry(0.9, 0.16), new THREE.MeshBasicMaterial({ map: label('BACKSTAGE', { w: 512, h: 96, size: 52, color: '#f2a650', bg: '#070605' }) }), 0, DOOR.h + 0.2, 0.02, frame);
  over.material.color.setScalar(1.6);
  let doorA = 0;
  const doorAt = new THREE.Vector3(x0, 1.2, DOOR.z);
  add(new THREE.PlaneGeometry(W, D).rotateX(Math.PI / 2), M.wallBack, 0, h, cz);
  // warm cove light along the ceiling and a fine champagne skirting
  const cove = glow(C.amber); cove.userData.lounge = true;
  add(new THREE.BoxGeometry(W - 0.2, 0.02, 0.02), cove, 0, h - 0.12, z0 + 0.06);
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.02, 0.02, D - 0.2), cove, sx * (x1 - 0.06), h - 0.12, cz);
  add(new THREE.BoxGeometry(W, 0.06, 0.012), M.champagne, 0, 0.03, z0 + 0.006);
  // round rug with a thin amber-to-ice ring, like the studio floor
  add(new THREE.CircleGeometry(1.55, 64).rotateX(-Math.PI / 2), L.rug, 0, 0.008, -9.45);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.42, 1.44, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(AMBER).multiplyScalar(0.5) }));
  ring.position.set(0, 0.01, -9.45); g.add(ring);

  // back wall: the D//0 logo between four monitors, over a walnut sideboard
  const logoTex = new THREE.TextureLoader().load(new URL('../assets/logo-do-1k.webp', import.meta.url).href); logoTex.colorSpace = THREE.SRGBColorSpace;
  add(new THREE.PlaneGeometry(1.5, 0.75), new THREE.MeshBasicMaterial({ map: logoTex, transparent: true, alphaTest: 0.04, toneMapped: false, color: new THREE.Color(0.8, 0.8, 0.8) }), 0, 2.25, z0 + 0.02);
  const screens = [];
  // wall-mounted broadcast monitors: slim satin bezel on a wall arm, the live picture under a faintly reflective glass,
  // the source's name and tally in the picture (as on a multiviewer), a small power lamp
  const screenGlass = physical({ color: 0x000000, metalness: 0, roughness: 0.3, transparent: true, opacity: 0.1, clearcoat: 0.6, clearcoatRoughness: 0.22, depthWrite: false });   // a soft sheen, not a hot spot
  const power = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 0.75, 1.4) });
  for (const [x, view, name] of [[-2.55, 'andy', 'CAM 3 · ANDREJ'], [-1.45, 'guest', 'CAM 5 · GUEST'], [1.45, 'wall', 'VIDEO WALL'], [2.55, 'georgie', 'CAM 1 · GEORGIE']]) {
    const mon = new THREE.Group(); mon.position.set(x, 2.25, z0 + 0.09); mon.rotation.x = -0.06; g.add(mon);   // tilted down a touch, towards the room
    add(new THREE.BoxGeometry(0.22, 0.16, 0.06), M.graphite, 0, 0, -0.06, mon);                                   // wall arm
    add(new RoundedBoxGeometry(0.96, 0.56, 0.035, 2, 0.008), M.camBody, 0, 0, 0, mon);
    add(new RoundedBoxGeometry(0.965, 0.565, 0.012, 2, 0.004), M.graphite, 0, 0, 0.012, mon);
    const mat = new THREE.MeshBasicMaterial({ color: 0x0b0d10, toneMapped: true });
    add(new THREE.PlaneGeometry(0.93, 0.523), mat, 0, 0, 0.0185, mon);
    add(new THREE.PlaneGeometry(0.93, 0.052), new THREE.MeshBasicMaterial({ map: umdStrip(name, view === 'wall' ? '#3ad16b' : '#5a0d0d'), transparent: true, opacity: 0.88 }), 0, -0.235, 0.019, mon);
    add(new THREE.PlaneGeometry(0.93, 0.523), screenGlass, 0, 0, 0.02, mon);
    add(new THREE.CircleGeometry(0.004, 10), power, 0.44, -0.272, 0.019, mon);
    screens.push({ view, mat });
  }
  add(new RoundedBoxGeometry(4.2, 0.5, 0.42, 3, 0.02), L.walnut, 0, 0.27, z0 + 0.23);
  add(new THREE.BoxGeometry(4.22, 0.012, 0.44), M.champagne, 0, 0.523, z0 + 0.23);
  // on the sideboard: an espresso machine, cups on its warmer and beside it; next to the sideboard a glass-door fridge
  const esp = espresso(M, L); esp.position.set(-1.6, 0.53, z0 + 0.24); g.add(esp);
  for (let i = 0; i < 3; i++) add(new THREE.CylinderGeometry(0.04, 0.032, 0.06, 20), L.porcelain, -1.15, 0.56 + i * 0.062, z0 + 0.25);
  const fridge = minibar(M, L); fridge.position.set(-2.5, 0, z0 + 0.28); g.add(fridge);

  // three armchairs, Andrej (Vienna side), the guest, Georgie (Melbourne side), facing the room
  const seats = [[-1.45, -9.95, 0.3], [0, -10.25, 0], [1.45, -9.95, -0.3]];
  for (const [x, z, ry] of seats) {
    const c = armchair(M, L); c.position.set(x, 0, z); c.rotation.y = ry; g.add(c);
    const sh = contactShadow(1.15, 1.05, 0.7); sh.position.set(x, 0.012, z); sh.rotation.y = ry; g.add(sh);
  }
  for (const [w, dd, x, z, k] of [[1.6, 1.6, 0, -9.0, 0.6], [4.5, 0.75, 0, z0 + 0.25, 0.55], [0.6, 0.6, 3.05, -10.75, 0.5], [0.75, 0.7, -2.5, z0 + 0.3, 0.55]]) {
    const sh = contactShadow(w, dd, k); sh.position.set(x, 0.013, z); g.add(sh);   // table, sideboard, lamp base
  }

  // coffee table: black glass on a champagne drum; coffee for three, sekt in an ice bucket, three flutes, name cards
  const table = new THREE.Group(); table.position.set(0, 0, -9.0); g.add(table);
  add(new THREE.CylinderGeometry(0.62, 0.62, 0.03, 64), M.deskGlass, 0, 0.42, 0, table);
  add(new THREE.CylinderGeometry(0.3, 0.34, 0.4, 48), M.champagne, 0, 0.2, 0, table);
  const CARD = { ANDREJ: '#f2a650', GEORGIE: '#a9c8ee', GUEST: '#e3c79a' };
  for (const [x, z, name] of [[-0.36, -0.28, 'ANDREJ'], [0, -0.42, 'GUEST'], [0.36, -0.28, 'GEORGIE']]) {
    add(new THREE.CylinderGeometry(0.07, 0.07, 0.006, 24), L.porcelain, x, 0.438, z, table);                       // saucer
    add(new THREE.CylinderGeometry(0.042, 0.034, 0.06, 24), L.porcelain, x, 0.47, z, table);                      // cup
    add(new THREE.CircleGeometry(0.038, 24).rotateX(-Math.PI / 2), L.coffee, x, 0.495, z, table);
    const card = add(new THREE.PlaneGeometry(0.16, 0.05), new THREE.MeshBasicMaterial({ map: namePlate(name, CARD[name]), side: THREE.DoubleSide }), x * 1.3, 0.465, z + 0.17, table);
    card.rotation.x = -0.3;
  }
  add(new THREE.CylinderGeometry(0.11, 0.09, 0.22, 32, 1, true), M.chrome, -0.05, 0.545, 0.12, table).material = M.chrome;   // ice bucket
  add(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 32), new THREE.MeshStandardMaterial({ color: 0xcfe0ee, roughness: 0.15, metalness: 0 }), -0.05, 0.6, 0.12, table);
  add(new THREE.CylinderGeometry(0.036, 0.04, 0.24, 24), L.bottle, -0.05, 0.62, 0.12, table);
  add(new THREE.CylinderGeometry(0.014, 0.034, 0.1, 20), L.bottle, -0.05, 0.79, 0.12, table);
  add(new THREE.CylinderGeometry(0.016, 0.016, 0.05, 16), L.foil, -0.05, 0.85, 0.12, table);
  for (const [x, z] of [[0.18, 0.18], [0.27, 0.08], [0.24, 0.26]]) {
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.004, 20), L.flute, x, 0.437, z, table);
    add(new THREE.CylinderGeometry(0.003, 0.003, 0.09, 8), L.flute, x, 0.48, z, table);
    add(new THREE.CylinderGeometry(0.024, 0.012, 0.12, 20, 1, true), L.flute, x, 0.585, z, table);
    add(new THREE.CylinderGeometry(0.021, 0.012, 0.08, 20), L.sekt, x, 0.565, z, table);
  }

  // arc floor lamp from the Melbourne corner, its shade low beside Georgie's chair, and its warm light
  add(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 40), L.marble, 3.05, 0.025, -10.75);
  const arc = new THREE.CatmullRomCurve3([new THREE.Vector3(3.05, 0.05, -10.75), new THREE.Vector3(3.08, 1.1, -10.7), new THREE.Vector3(2.95, 1.62, -10.5), new THREE.Vector3(2.62, 1.66, -10.25), new THREE.Vector3(2.45, 1.52, -10.15)]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(arc, 48, 0.012, 8), M.chrome));
  const shade = add(new THREE.SphereGeometry(0.17, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), M.champagne.clone(), 2.45, 1.38, -10.15); shade.material.side = THREE.DoubleSide;
  const bulb = glow(C.warm); bulb.userData.lounge = true;
  add(new THREE.SphereGeometry(0.045, 16, 12), bulb, 2.45, 1.37, -10.15);
  // the three dressing rooms on the Melbourne-side wall: dark doors in champagne frames, gold name plates, a warm
  // light line over each (the doors' frames and the lines give the dark side its depth)
  const doorLine = glow(C.warm); doorLine.userData.lounge = true;
  const NAME = { ANDREJ: '#f2a650', GEORGIE: '#a9c8ee', GUEST: '#e3c79a' };   // as on the desk: Vienna amber, Melbourne ice, the guest champagne
  for (const [z, name] of [[-7.95, 'GUEST'], [-8.95, 'GEORGIE'], [-9.95, 'ANDREJ']]) {
    const d = new THREE.Group(); d.position.set(x1, 0, z); d.rotation.y = -Math.PI / 2; g.add(d);
    add(new THREE.BoxGeometry(0.8, 2.1, 0.04), M.blackGlass, 0, 1.05, 0.02, d);
    for (const [w, hh, x, y] of [[0.88, 0.035, 0, 2.115], [0.035, 2.12, -0.42, 1.06], [0.035, 2.12, 0.42, 1.06]]) add(new THREE.BoxGeometry(w, hh, 0.05), M.shellGold, x, y, 0.025, d);   // satin: no hot streaks
    add(new THREE.BoxGeometry(0.012, 0.22, 0.02), M.shellGold, 0.3, 1.02, 0.05, d);                                   // handle
    add(new RoundedBoxGeometry(0.42, 0.115, 0.01, 2, 0.003), M.shellGold, 0, 1.62, 0.046, d);                         // gold rim
    const plate = add(new THREE.PlaneGeometry(0.4, 0.1), new THREE.MeshBasicMaterial({ map: namePlate(name, NAME[name]) }), 0, 1.62, 0.0515, d);
    plate.material.color.setScalar(1.25);
    add(new THREE.BoxGeometry(0.7, 0.012, 0.03), doorLine, 0, 2.3, 0.05, d);                                        // warm line over the door
  }
  // its lights exist only while someone is in here: the studio's shaders then cost what they did before (the first visit
  // recompiles them once, hidden by the cut into the lounge)
  const lights = new THREE.Group();
  const lamp = new THREE.PointLight(0xffd6a0, 0, 5, 2); lamp.position.set(2.45, 1.25, -10.1);
  const room = new THREE.PointLight(0xffe2bf, 0, 6, 2); room.position.set(-0.6, 2.75, -9.4);
  // soft indirect wash along the dressing-room wall, high and low in intensity: depth, not a lit wall
  const wash = new THREE.PointLight(0xffd9b0, 0, 4.5, 2); wash.position.set(1.4, 2.7, -8.9);
  lights.add(lamp, room, wash);
  shadows(g, true, true);
  g.traverse(o => { if (o.isMesh && o.material?.isMeshBasicMaterial) o.castShadow = false; });
  return {
    group: g, lights, screens, doorFrame: frame,
    // the door opens as someone comes near it (either side), and closes behind them
    // (it swings into the room)
    door(camPos, dt) { const want = camPos.distanceTo(doorAt) < 2.4 ? 1.45 : 0; doorA += (want - doorA) * Math.min(1, dt * 2.6); leafPivot.rotation.y = doorA; },
    // drawn and lit only while someone is in the lounge, so the studio costs what it did before
    light(on) { g.visible = lights.visible = on; lamp.intensity = on ? 5 : 0; room.intensity = on ? 7 : 0; wash.intensity = on ? 1.6 : 0; doorLine.color.copy(C.warm).multiplyScalar(on ? 0.55 : 0.2); cove.color.copy(C.amber).multiplyScalar(on ? 1.6 : 0.4); bulb.color.copy(C.warm).multiplyScalar(on ? 3 : 0.5); },
  };
}

// a prosumer espresso machine: chrome body, group head with portafilter, steam wand, pressure gauge, drip tray
function espresso(M, L) {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  add(new RoundedBoxGeometry(0.34, 0.36, 0.38, 3, 0.02), M.chrome, 0, 0.2, -0.02);                 // body
  add(new RoundedBoxGeometry(0.345, 0.02, 0.385, 2, 0.006), M.graphite, 0, 0.385, -0.02);          // cup warmer
  add(new RoundedBoxGeometry(0.3, 0.025, 0.14, 2, 0.006), M.graphite, 0, 0.02, 0.2);                // drip tray
  add(new THREE.BoxGeometry(0.26, 0.004, 0.11), M.brushed, 0, 0.034, 0.2);
  add(new THREE.CylinderGeometry(0.035, 0.04, 0.05, 24), M.chrome, -0.03, 0.2, 0.19);               // group head
  add(new THREE.CylinderGeometry(0.036, 0.03, 0.03, 24), M.brushed, -0.03, 0.165, 0.19);            // portafilter basket
  const handle = add(new THREE.CylinderGeometry(0.012, 0.014, 0.13, 12), L.walnut, -0.03, 0.165, 0.27); handle.rotation.x = Math.PI / 2 - 0.15;
  const wand = add(new THREE.CylinderGeometry(0.005, 0.005, 0.16, 8), M.chrome, 0.13, 0.14, 0.2); wand.rotation.z = 0.15;
  add(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 24).rotateX(Math.PI / 2), M.chrome, 0.08, 0.3, 0.172);                // gauge
  add(new THREE.CircleGeometry(0.03, 24), L.porcelain, 0.08, 0.3, 0.179);
  add(new THREE.BoxGeometry(0.002, 0.024, 0.001), L.coffee, 0.08, 0.305, 0.18).rotation.z = -0.6;
  for (const x of [-0.08, 0.04]) add(new THREE.CylinderGeometry(0.035, 0.028, 0.05, 20), L.porcelain, x, 0.42, -0.06);   // cups on the warmer
  add(new THREE.CylinderGeometry(0.028, 0.022, 0.045, 20), L.porcelain, -0.03, 0.06, 0.2);          // a cup under the spout
  return g;
}

// a glass-door drinks fridge: black cabinet, lit interior, bottles of sekt and water on two shelves
function minibar(M, L) {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  // the cabinet: a solid back half, then an open front compartment (sides, top, floor) behind the glass door
  add(new RoundedBoxGeometry(0.56, 0.86, 0.25, 2, 0.015), M.camBody, 0, 0.43, -0.125);
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.03, 0.86, 0.25), M.camBody, sx * 0.265, 0.43, 0.125);
  for (const y of [0.015, 0.845]) add(new THREE.BoxGeometry(0.56, 0.03, 0.25), M.camBody, 0, y, 0.125);
  const inside = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.32, 0.36, 0.42) });   // the lit interior, a soft cool glow
  add(new THREE.PlaneGeometry(0.5, 0.8), inside, 0, 0.43, 0.002);
  for (const y of [0.3, 0.56]) add(new THREE.BoxGeometry(0.46, 0.006, 0.3), M.chrome, 0, y, 0.06);
  const water = new THREE.MeshStandardMaterial({ color: 0x9fb8c8, roughness: 0.1, transparent: true, opacity: 0.7 });
  for (let i = 0; i < 4; i++) { add(new THREE.CylinderGeometry(0.03, 0.032, 0.2, 16), L.bottle, -0.15 + i * 0.1, 0.4, 0.1); add(new THREE.CylinderGeometry(0.01, 0.026, 0.05, 12), L.foil, -0.15 + i * 0.1, 0.52, 0.1); }
  for (let i = 0; i < 5; i++) add(new THREE.CylinderGeometry(0.026, 0.026, 0.17, 16), water, -0.18 + i * 0.09, 0.65, 0.1);
  add(new THREE.PlaneGeometry(0.5, 0.76), physical({ color: 0x0a0c0f, metalness: 0, roughness: 0.2, transparent: true, opacity: 0.16, clearcoat: 0.6, clearcoatRoughness: 0.2, depthWrite: false }), 0, 0.46, 0.252);
  for (const [w, h, x, y] of [[0.54, 0.04, 0, 0.84], [0.54, 0.04, 0, 0.07], [0.03, 0.8, -0.265, 0.455], [0.03, 0.8, 0.265, 0.455]]) add(new THREE.BoxGeometry(w, h, 0.02), M.graphite, x, y, 0.255);
  add(new THREE.BoxGeometry(0.012, 0.4, 0.02), M.shellGold, 0.235, 0.46, 0.272);                    // handle
  add(new THREE.BoxGeometry(0.4, 0.02, 0.005), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.5, 1.6) }), 0, 0.81, 0.24);   // interior light
  return g;
}
const physical = o => new THREE.MeshPhysicalMaterial(o);

// a deep club armchair: cognac leather, low walnut plinth on champagne feet
function armchair(M, L) {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  add(new RoundedBoxGeometry(0.9, 0.08, 0.82, 3, 0.02), L.walnut, 0, 0.1, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.CylinderGeometry(0.022, 0.016, 0.06, 12), M.champagne, sx * 0.4, 0.03, sz * 0.36);
  add(new RoundedBoxGeometry(0.66, 0.2, 0.7, 5, 0.07), L.cognac, 0, 0.27, 0.04);                   // seat cushion
  add(new RoundedBoxGeometry(0.88, 0.62, 0.2, 5, 0.08), L.cognac, 0, 0.5, -0.32).rotation.x = -0.12; // back
  for (const sx of [-1, 1]) add(new RoundedBoxGeometry(0.15, 0.46, 0.8, 5, 0.06), L.cognac, sx * 0.38, 0.36, 0);   // arms
  add(new RoundedBoxGeometry(0.62, 0.06, 0.004, 2, 0.002), M.seam, 0, 0.375, 0.39);                  // piping line on the cushion front
  return g;
}

// a small bullet security camera on a wall arm: white housing with a sun hood, dark glass, IR ring and a red
// recording lamp that pulses but never goes out (security records all the time). Lens along local +z (use lookAt).
export function securityCam(M, anim) {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const white = new THREE.MeshStandardMaterial({ color: 0xd9dbdd, metalness: 0.1, roughness: 0.45 });
  const ax = geo => geo.rotateX(Math.PI / 2);
  add(ax(new THREE.CylinderGeometry(0.045, 0.045, 0.2, 24)), white, 0, 0, 0);                                    // housing
  const hood = add(ax(new THREE.CylinderGeometry(0.056, 0.056, 0.17, 24, 1, true, -Math.PI * 0.75, Math.PI * 1.5)), white, 0, 0.004, 0.04);
  hood.material = white.clone(); hood.material.side = THREE.DoubleSide; hood.rotation.z = Math.PI;              // open at the bottom
  add(new THREE.CircleGeometry(0.04, 24), M.lensGlass, 0, 0, 0.1005);
  add(new THREE.CircleGeometry(0.014, 16), new THREE.MeshBasicMaterial({ color: 0x050608 }), 0, 0, 0.101);
  const ir = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.18, 0.02, 0.02) });
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; add(new THREE.CircleGeometry(0.004, 8), ir, Math.cos(a) * 0.027, Math.sin(a) * 0.027, 0.1012); }
  const rec = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  add(new THREE.SphereGeometry(0.006, 10, 8), rec, 0.03, 0.03, 0.098);
  // mount: a ball joint and an arm back to the wall plate
  add(new THREE.SphereGeometry(0.02, 16, 12), M.graphite, 0, -0.02, -0.08);
  add(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 10).rotateX(Math.PI / 2), white, 0, -0.03, -0.16);
  add(new THREE.CylinderGeometry(0.05, 0.05, 0.015, 24).rotateX(Math.PI / 2), white, 0, -0.03, -0.24);
  anim.push(t => rec.color.setRGB(2.2 + 1.6 * (Math.sin(t * 3.2) > 0 ? 1 : 0), 0.08, 0.06));   // pulses between bright and brighter
  shadows(g, true, false);
  return g;
}

// the way backstage, at the LED wall's Vienna end: a lit BACKSTAGE sign with an arrow round the wall, on a slim post.
// Tapping it walks there (main.js / views.js).
function backstageSign() {
  const g = new THREE.Group();
  g.userData.focus = 'backstage';
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#070605'; x.fillRect(0, 0, 1024, 256);
  x.strokeStyle = 'rgba(242,166,80,.5)'; x.lineWidth = 4; x.strokeRect(10, 10, 1004, 236);
  x.fillStyle = '#f2a650'; x.textBaseline = 'middle'; x.font = '700 104px Archivo, "Helvetica Neue", Arial, sans-serif';
  x.fillText('BACKSTAGE', 60, 132);
  x.beginPath(); x.moveTo(860, 88); x.lineTo(960, 128); x.lineTo(860, 168); x.lineWidth = 16; x.strokeStyle = '#f2a650'; x.stroke();   // arrow: round the wall
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.225), new THREE.MeshBasicMaterial({ map: tex }));
  panel.material.color.setScalar(1.5); panel.position.y = 2.15; g.add(panel);
  // a mirror image on the back is not needed: the sign faces the studio
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.26, 0.03), new THREE.MeshStandardMaterial({ color: 0x15171b, metalness: 0.8, roughness: 0.4 }));
  back.position.set(0, 2.15, -0.02); g.add(back);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 2.05, 12), new THREE.MeshStandardMaterial({ color: 0xc9a671, metalness: 1, roughness: 0.3 }));
  post.position.y = 1.02; g.add(post);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.03, 32), new THREE.MeshStandardMaterial({ color: 0x15171b, metalness: 0.8, roughness: 0.4 }));
  foot.position.y = 0.015; g.add(foot);
  shadows(g);
  return g;
}

/* ---------- lights ---------- */

function buildLights(root, quality, wallLight, pianoLamp) {
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
  // on desktops every fixture casts a shadow, as in the Cycles renders (phones keep the key light's only)
  const many = quality.shadows2 && quality.ao;
  const rimA = spot(C.amber, new THREE.Vector3(-3.2, 6.0, -5.6), new THREE.Vector3(-0.95, 1.5, -1.9), { angle: 0.22, penumbra: 0.8, shadow: many });
  const rimI = spot(C.ice, new THREE.Vector3(3.2, 6.0, -5.6), new THREE.Vector3(0.95, 1.5, -1.9), { angle: 0.22, penumbra: 0.8, shadow: many });
  const djSpot = spot(C.ice, new THREE.Vector3(4.2, 6.5, 2.4), new THREE.Vector3(5.4, 0.9, 0.1), { angle: 0.32, shadow: many });   // the DJ booth, Melbourne side
  // the grand piano opposite: a soft warm top light, so the lacquer shows its curves (Vienna side)
  const pianoSpot = spot(C.warm, new THREE.Vector3(-4.0, 6.4, 3.0), new THREE.Vector3(-6.5, 0.8, -0.2), { angle: 0.36, penumbra: 0.85, shadow: many });
  // the piano shot: everything else goes down and that truss fixture tilts onto the grand with one narrow,
  // warm spot, like a single old bulb over the piano in an empty hall
  const soloAim = new THREE.Vector3(-6.4, 0.8, -0.15);
  pianoLamp.updateWorldMatrix(true, false);
  const restQ = pianoLamp.quaternion.clone();
  pianoLamp.lookAt(soloAim);
  const aimQ = pianoLamp.quaternion.clone();
  pianoLamp.quaternion.copy(restQ);
  const soloFrom = pianoLamp.getWorldPosition(new THREE.Vector3());
  const soloSpot = spot(C.tungsten, soloFrom, soloAim, { angle: 0.26, penumbra: 0.55, shadow: many });
  const soloLen = soloFrom.distanceTo(soloAim), pianoAim = pianoSpot.target.position.clone(), soloAim0 = soloAim.clone(), lampQ = new THREE.Quaternion();
  const soloBeam = new THREE.Mesh(new THREE.ConeGeometry(Math.tan(0.26) * soloLen, soloLen, 32, 1, true).translate(0, -soloLen / 2, 0).rotateX(-Math.PI / 2), beamMaterial(C.tungsten));
  soloBeam.position.z = 0.2;
  pianoLamp.add(soloBeam);
  const soloLens = pianoLamp.children[1];
  soloLens.material = glow(C.warm);   // its own lens, so it can glow on its own (a clone would lose userData.base)
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
    piano: { top: pianoSpot, solo: soloSpot },   // the grand's own lights (the Vienna piano stage uses them as its key and spot)
    // the grand raised by the piano lift (vienna/): its warm top light and the solo spot follow it up
    pianoLift(y) {
      pianoSpot.target.position.copy(pianoAim).setY(pianoAim.y + y);
      soloAim.copy(soloAim0).setY(soloAim0.y + y); soloSpot.target.position.copy(soloAim);
      lampQ.copy(pianoLamp.quaternion); pianoLamp.quaternion.copy(restQ); pianoLamp.lookAt(soloAim); aimQ.copy(pianoLamp.quaternion); pianoLamp.quaternion.copy(lampQ);
      soloBeam.scale.setScalar(soloFrom.distanceTo(soloAim) / soloLen);
    },
    update(t, L) {
      const breathe = 1 + 0.04 * Math.sin(t * 0.7);
      keyL.intensity = 220 * L.key * L.warm;
      keyR.intensity = 200 * L.key * L.cool;
      rimA.intensity = 140 * L.rim * L.amber * breathe;
      rimI.intensity = 140 * L.rim * L.ice * (2 - breathe);
      djSpot.intensity = 120 * L.accent * (0.6 + 0.4 * L.music);
      pianoSpot.intensity = 95 * L.accent * (0.75 + 0.25 * L.music) * (1 - L.solo);
      soloSpot.intensity = 480 * L.solo;
      soloBeam.material.uniforms.uOpacity.value = 0.16 * L.solo;
      soloBeam.visible = L.solo > 0.01;
      soloLens.material.color.copy(soloLens.material.userData.base).multiplyScalar(1.8 * (0.35 + 0.65 * L.accent)).lerp(C.tungsten, L.solo).multiplyScalar(1 + 3 * L.solo);
      pianoLamp.quaternion.slerpQuaternions(restQ, aimQ, THREE.MathUtils.smoothstep(L.solo, 0, 1));
      logoSpot.intensity = 120 * L.accent;
      fill.intensity = 1.6 * L.key;
      house.intensity = 0.9 * L.house;
      hemi.intensity = (0.42 + 0.3 * L.house) * (1 - 0.75 * L.solo);
      soft.intensity = (0.55 + 0.25 * L.house) * (1 - 0.85 * L.solo);
    },
  };
}

/* ---------- the studio cameras' viewfinders: each shows its own camera's live picture ----------
   Rendered small from the lens (through the prompter glass), under a viewfinder overlay: safe-area corners, a centre
   cross, the camera's name and the lens settings. update() renders all of them (offline renders, every frame) or only
   the one at `index` (the live page spreads them over frames). The mirror floor and the shadow maps are left alone
   while they render: the floor would render its reflection again for every viewfinder, the shadows are current. */
function createViewfinders(list) {
  const W = 320, H = 208, eye = new THREE.Vector3(), ahead = new THREE.Vector3();
  const items = list.map(v => {
    const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType });
    rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
    const cam = new THREE.PerspectiveCamera(v.fov, W / H, 0.05, 60);
    v.screen.material = new THREE.MeshBasicMaterial({ map: rt.texture, color: new THREE.Color(0.9, 0.9, 0.9) });
    const overlay = new THREE.Mesh(v.screen.geometry, new THREE.MeshBasicMaterial({ map: viewfinderOverlay(v.name), transparent: true, depthWrite: false }));
    overlay.position.z = 0.0008; v.screen.add(overlay);
    return { ...v, rt, cam };
  });
  let reflectors = null;
  return {
    count: items.length,
    update(renderer, scene, index) {
      reflectors ??= (() => { const r = []; scene.traverse(o => { if (o.isReflector) r.push(o); }); return r; })();
      const auto = renderer.shadowMap.autoUpdate, target = renderer.getRenderTarget();
      renderer.shadowMap.autoUpdate = false;
      const shown = reflectors.map(o => o.visible); reflectors.forEach(o => { o.visible = false; });
      for (const [i, v] of items.entries()) {
        if (index !== undefined && i !== index % items.length) continue;
        v.head.updateWorldMatrix(true, false);
        v.cam.position.copy(eye.copy(v.eye).applyMatrix4(v.head.matrixWorld));
        v.cam.lookAt(ahead.copy(v.ahead).applyMatrix4(v.head.matrixWorld));
        v.screen.visible = false;
        renderer.setRenderTarget(v.rt); renderer.render(scene, v.cam);
        v.screen.visible = true;
      }
      reflectors.forEach((o, i) => { o.visible = shown[i]; });
      renderer.setRenderTarget(target); renderer.shadowMap.autoUpdate = auto;
    },
  };
}
function viewfinderOverlay(name) {
  const c = document.createElement('canvas'); c.width = 640; c.height = 416;
  const x = c.getContext('2d'), w = c.width, h = c.height;
  x.strokeStyle = 'rgba(255,255,255,0.75)'; x.lineWidth = 3;
  // safe-area corners (90 %), a small centre cross
  const m = 0.05, L = 34;
  for (const [cx, cy, sx, sy] of [[w * m, h * m, 1, 1], [w * (1 - m), h * m, -1, 1], [w * m, h * (1 - m), 1, -1], [w * (1 - m), h * (1 - m), -1, -1]]) {
    x.beginPath(); x.moveTo(cx, cy + sy * L); x.lineTo(cx, cy); x.lineTo(cx + sx * L, cy); x.stroke();
  }
  x.beginPath(); x.moveTo(w / 2 - 14, h / 2); x.lineTo(w / 2 + 14, h / 2); x.moveTo(w / 2, h / 2 - 14); x.lineTo(w / 2, h / 2 + 14); x.stroke();
  x.font = '600 26px "Helvetica Neue", Arial, sans-serif'; x.fillStyle = 'rgba(255,255,255,0.85)'; x.textBaseline = 'top';
  x.fillText(name, w * 0.08, h * 0.08);
  x.textAlign = 'right'; x.fillText('1080p50', w * 0.92, h * 0.08);
  x.textBaseline = 'bottom'; x.textAlign = 'left'; x.font = '500 22px "Helvetica Neue", Arial, sans-serif';
  x.fillText('F2.8   1/100   0dB   5600K', w * 0.08, h * 0.92);
  x.textAlign = 'right'; x.fillText('TC 10:00:00:00', w * 0.92, h * 0.92);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
