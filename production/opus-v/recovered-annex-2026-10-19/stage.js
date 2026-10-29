// Vienna Piano Stage: the annex beyond the studio's Vienna-side wall, its deck, the scissor lift with the grand on
// a round platform, and the light rig. Modelled in code like the rest of the set (no downloaded models); the grand is
// the studio's own model (grandpiano.js), built once more for the platform.
// Sizes and positions come from layout.js. Lights: every fixture is drawn, but only a few of them carry a real
// three.js light (the rest are lens glow and beam), so the stage adds a handful of lights to the studio, not sixteen.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { grandPiano } from '../grandpiano.js';
import { glow, beamMaterial } from '../set.js';
import { contactShadow, panelJoints } from '../details.js';
import { AMBER, ICE } from '../screens.js';
import { ROOM, PORTAL, ANNEX, DECK, LIFT, RIG, PIANO_ON_PLATFORM, platformTop } from './layout.js';

const C = { amber: new THREE.Color(AMBER), ice: new THREE.Color(ICE), warm: new THREE.Color('#ffe2c0'), white: new THREE.Color('#fff4e8'),
  tungsten: new THREE.Color('#ffb46b') };

// angle on the studio's circle (x = R sin a, z = Z + R cos a, as set.js) of a point on the Vienna side at depth z
const wallAngle = z => 2 * Math.PI - Math.acos((z - ROOM.Z) / ROOM.R);
// x where the studio's outer wall (radius R + 0.6) meets the plane at depth z, on the Vienna side
const wallX = z => -Math.sqrt((ROOM.R + 0.6) ** 2 - (z - ROOM.Z) ** 2);

/* ---------- the opening in the Vienna-side wall ---------- */
// The wall, fins and LED strips are the studio's own (set.js `room`): the wall is replaced by the same cylinder in
// three parts (left, right, and the lintel above the opening); fins in the opening keep only their part above the
// lintel; strips in the opening are switched off. Nothing else of the studio changes.
function openWall(room, root) {
  const a0 = wallAngle(PORTAL.z0), a1 = wallAngle(PORTAL.z1);   // a0 < a1 (Vienna side, z0 further back)
  const R = room.R + 0.6, H = room.H, span = room.A1 - room.A0 + 0.2;
  room.backWall.visible = false;
  const part = (from, to, y0, y1) => {
    const m = room.backWall.material.clone();
    m.side = THREE.DoubleSide;                     // seen from the annex too
    m.map = room.backWall.material.map.clone(); m.map.needsUpdate = true;
    m.map.repeat.set((to - from) / span, (y1 - y0) / H); m.map.offset.set((from - (room.A0 - 0.1)) / span, y0 / H);
    m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping;
    const w = new THREE.Mesh(new THREE.CylinderGeometry(R, R, y1 - y0, 48, 1, true, from, to - from), m);
    w.position.set(0, (y0 + y1) / 2, room.Z);
    root.add(w);
  };
  part(room.A0 - 0.1, a0, 0, H);
  part(a1, room.A1 + 0.1, 0, H);
  part(a0, a1, PORTAL.h, H);

  const o = new THREE.Object3D();
  room.fins.forEach((f, i) => {
    if (f.a <= a0 || f.a >= a1) return;
    const h = H - 0.2 - PORTAL.h;
    o.position.set(room.R * Math.sin(f.a), PORTAL.h + h / 2, room.Z + room.R * Math.cos(f.a));
    o.rotation.set(0, f.a, 0); o.scale.set(1, h, 1); o.updateMatrix();
    room.finMesh.setMatrixAt(i, o.matrix);
  });
  room.finMesh.instanceMatrix.needsUpdate = true;
  room.strips.forEach((a, i) => {
    if (a <= a0 - 0.02 || a >= a1 + 0.02) return;
    o.position.set(0, -50, 0); o.rotation.set(0, 0, 0); o.scale.setScalar(1e-4); o.updateMatrix();
    room.stripMesh.setMatrixAt(i, o.matrix);
  });
  room.stripMesh.instanceMatrix.needsUpdate = true;
  room.finMesh.computeBoundingSphere?.(); room.stripMesh.computeBoundingSphere?.();
  return { a0, a1 };
}

export function buildStage({ studio, scene, quality }) {
  const M = studio.M, room = studio.room;
  const root = new THREE.Group(); root.name = 'vienna-stage';
  scene.add(root);
  const add = (o, parent = root) => { parent.add(o); return o; };
  const mesh = (geo, mat, parent = root) => add(new THREE.Mesh(geo, mat), parent);
  const glows = [];   // { m, k, group } lens and LED materials, levelled each frame by their light group

  /* ----- the opening, its frame ----- */
  const { a0, a1 } = openWall(room, root);
  const edge = glow(C.amber); glows.push({ m: edge, k: 1.6, group: 'frame' });
  for (const a of [a0, a1]) {
    const x = (room.R + 0.3) * Math.sin(a), z = room.Z + (room.R + 0.3) * Math.cos(a);
    const jamb = mesh(new RoundedBoxGeometry(0.34, PORTAL.h, 0.9, 2, 0.03), M.graphite); jamb.position.set(x, PORTAL.h / 2, z); jamb.rotation.y = a;
    const line = mesh(new THREE.BoxGeometry(0.03, PORTAL.h - 0.4, 0.03), edge); line.position.set(x + 0.2, PORTAL.h / 2, z); line.rotation.y = a;
  }
  const xh = (wallX(PORTAL.z0) + wallX(PORTAL.z1)) / 2 + 0.6;
  const header = mesh(new THREE.BoxGeometry(1.2, 0.4, PORTAL.z1 - PORTAL.z0 + 0.6), M.graphite);
  header.position.set(xh, PORTAL.h + 0.2, (PORTAL.z0 + PORTAL.z1) / 2);
  header.rotation.y = Math.atan2(wallX(PORTAL.z0) - wallX(PORTAL.z1), PORTAL.z1 - PORTAL.z0);
  const hl = mesh(new THREE.BoxGeometry(0.03, 0.03, PORTAL.z1 - PORTAL.z0), edge, header); hl.position.set(0.61, -0.17, 0);

  /* ----- the annex: back wall, side walls, ceiling, the closing strip above the studio's ceiling ----- */
  const shell = M.wallBack.clone(); shell.side = THREE.DoubleSide; shell.map = panelJoints(24, 4);
  const W = ANNEX.z1 - ANNEX.z0, zc = (ANNEX.z0 + ANNEX.z1) / 2;
  const back = mesh(new THREE.PlaneGeometry(W, ANNEX.h), shell); back.position.set(ANNEX.x0, ANNEX.h / 2, zc); back.rotation.y = Math.PI / 2;
  for (const [z, side] of [[ANNEX.z0, 1], [ANNEX.z1, -1]]) {
    const x1 = wallX(z) + 0.3, len = x1 - ANNEX.x0;
    const s = mesh(new THREE.PlaneGeometry(len, ANNEX.h), shell); s.position.set(ANNEX.x0 + len / 2, ANNEX.h / 2, z); if (side < 0) s.rotation.y = Math.PI;
  }
  const xc = -ROOM.R + 2.0;   // the annex ceiling runs over the opening up to here (inside the studio's ceiling height)
  const ceil = mesh(new THREE.PlaneGeometry(xc - ANNEX.x0, W).rotateX(Math.PI / 2), shell); ceil.position.set((xc + ANNEX.x0) / 2, ANNEX.h, zc);
  const close = mesh(new THREE.PlaneGeometry(W, ANNEX.h - ROOM.H), shell); close.position.set(xc, (ANNEX.h + ROOM.H) / 2, zc); close.rotation.y = -Math.PI / 2;

  // fins on the back wall, with amber LED strips between them (Vienna's colour, like the studio's Vienna side)
  const finN = 13, fin = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 1, 0.16), M.fin, finN);
  const stripMat = glow(C.amber); glows.push({ m: stripMat, k: 1.2, group: 'frame' });
  const strip = new THREE.InstancedMesh(new THREE.BoxGeometry(0.025, ANNEX.h - 1.6, 0.025), stripMat, finN - 1);
  const o = new THREE.Object3D();
  for (let i = 0; i < finN; i++) {
    const z = ANNEX.z0 + 0.4 + (i * (W - 0.8)) / (finN - 1);
    o.position.set(ANNEX.x0 + 0.35, (ANNEX.h - 0.2) / 2, z); o.scale.set(1, ANNEX.h - 0.2, 1); o.updateMatrix(); fin.setMatrixAt(i, o.matrix);
    if (i < finN - 1) { o.position.set(ANNEX.x0 + 0.12, ANNEX.h / 2, z + (W - 0.8) / (finN - 1) / 2); o.scale.set(1, 1, 1); o.updateMatrix(); strip.setMatrixAt(i, o.matrix); }
  }
  fin.receiveShadow = true;
  add(fin); add(strip);
  // the stage's name over the back wall
  const sign = mesh(new THREE.PlaneGeometry(4.2, 0.6), new THREE.MeshBasicMaterial({ map: signTexture(), transparent: true, depthWrite: false }));
  sign.position.set(ANNEX.x0 + 0.75, 7.6, zc); sign.rotation.y = Math.PI / 2;
  sign.material.color.setScalar(1.4);

  /* ----- the deck, with the round well the lift stands in ----- */
  const deckShape = new THREE.Shape();
  deckShape.moveTo(DECK.x0, -DECK.z1); deckShape.lineTo(DECK.x1, -DECK.z1); deckShape.lineTo(DECK.x1, -DECK.z0); deckShape.lineTo(DECK.x0, -DECK.z0); deckShape.closePath();
  const hole = new THREE.Path(); hole.absarc(LIFT.x, -LIFT.z, LIFT.well, 0, Math.PI * 2, true); deckShape.holes.push(hole);
  const deck = mesh(new THREE.ExtrudeGeometry(deckShape, { depth: DECK.h, bevelEnabled: false, curveSegments: 96 }).rotateX(-Math.PI / 2), M.riser);
  deck.receiveShadow = true; deck.castShadow = true;
  const lining = mesh(new THREE.CylinderGeometry(LIFT.well, LIFT.well, DECK.h, 96, 1, true), M.graphite); lining.material = M.graphite.clone(); lining.material.side = THREE.DoubleSide;
  lining.position.set(LIFT.x, DECK.h / 2, LIFT.z);
  const lip = glow(C.amber); glows.push({ m: lip, k: 1.4, group: 'under' });
  const lipRing = mesh(new THREE.TorusGeometry(LIFT.well + 0.02, 0.012, 6, 128).rotateX(Math.PI / 2), lip); lipRing.position.set(LIFT.x, DECK.h + 0.004, LIFT.z);
  // the deck's front edge: an amber line, and two steps up from the studio floor
  const front = mesh(new THREE.BoxGeometry(0.02, 0.025, DECK.z1 - DECK.z0), edge); front.position.set(DECK.x1 + 0.011, DECK.h - 0.05, (DECK.z0 + DECK.z1) / 2);
  for (const [i, h] of [[0, DECK.h / 3], [1, (2 * DECK.h) / 3]]) {
    const step = mesh(new THREE.BoxGeometry(0.34, h, 3.2), M.riser); step.position.set(DECK.x1 + 0.34 * (2 - i) - 0.17, h / 2, LIFT.z);
    step.receiveShadow = true;
  }

  /* ----- the lift: base frame, scissor packs, hydraulic rams, top frame, platform, the grand ----- */
  const lift = add(new THREE.Group()); lift.position.set(LIFT.x, 0, LIFT.z);
  const steel = M.graphite, bright = M.alu;
  const BASE_TOP = 0.1, TOP_FRAME = 0.06, xL = -LIFT.arm / 2;
  mesh(new THREE.BoxGeometry(LIFT.arm + 0.5, BASE_TOP, 2.1), steel, lift).position.y = BASE_TOP / 2;
  for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(LIFT.arm + 0.4, 0.05, 0.12), bright, lift).position.set(0, BASE_TOP + 0.025, s * LIFT.packs);   // roller rails
  const armGeo = new THREE.BoxGeometry(1, 0.09, 0.05);                        // scaled to the arm length along x
  const pinGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 14).rotateX(Math.PI / 2);   // along z
  const arms = [], pins = [];
  for (let st = 0; st < LIFT.stages; st++) for (const s of [-1, 1]) for (const k of [0, 1]) {
    const a = mesh(armGeo, steel, lift); a.castShadow = true;
    arms.push({ m: a, st, z: s * LIFT.packs + (k ? 0.065 : -0.065), k });
  }
  // cross tubes at every end joint (both packs together) and a pin at every crossing
  for (let lvl = 0; lvl <= LIFT.stages; lvl++) for (const end of [0, 1]) { const p = mesh(pinGeo, bright, lift); p.scale.z = 2 * LIFT.packs + 0.3; pins.push({ m: p, lvl, end }); }
  const hubs = [];
  for (let st = 0; st < LIFT.stages; st++) for (const s of [-1, 1]) { const h = mesh(pinGeo, bright, lift); h.scale.z = 0.24; hubs.push({ m: h, st, z: s * LIFT.packs }); }
  // two hydraulic rams between the packs: body pinned to the base, rod to a cross tube on the first stage's arm
  const RAM = { body: 0.52, back: 0.1, rod: 0.5, at: 0.3, base: new THREE.Vector3(xL + 0.3, BASE_TOP + 0.04, 0) };
  const bodyGeo = new THREE.CylinderGeometry(0.065, 0.065, 1, 18).translate(0, 0.5, 0);
  const rodGeo = new THREE.CylinderGeometry(0.03, 0.03, 1, 14).translate(0, 0.5, 0);
  const rams = [-0.42, 0.42].map(z => {
    const body = mesh(bodyGeo, M.dark, lift), rod = mesh(rodGeo, M.chrome, lift);
    body.scale.y = RAM.body + RAM.back; rod.scale.y = RAM.rod;
    const clevis = mesh(new THREE.BoxGeometry(0.16, 0.08, 0.16), steel, lift); clevis.position.set(RAM.base.x, RAM.base.y - 0.02, z);
    return { body, rod, z };
  });
  const ramTube = mesh(pinGeo, bright, lift); ramTube.scale.z = 2 * LIFT.packs;
  const topFrame = mesh(new THREE.BoxGeometry(LIFT.arm + 0.5, TOP_FRAME, 2.1), steel, lift);
  for (const s of [-1, 1]) { const r = mesh(new THREE.BoxGeometry(LIFT.arm + 0.4, 0.04, 0.12), bright, topFrame); r.position.set(0, -0.05, s * LIFT.packs); }

  const platform = add(new THREE.Group(), lift);
  const deckTop = M.riser.clone(); deckTop.color.setHex(0x0a0a0c);
  const disc = mesh(new THREE.CylinderGeometry(LIFT.r, LIFT.r, LIFT.thick, 128), deckTop, platform); disc.position.y = -LIFT.thick / 2;
  disc.receiveShadow = true; disc.castShadow = true;
  mesh(new THREE.CylinderGeometry(LIFT.r + 0.006, LIFT.r + 0.006, 0.03, 128, 1, true), M.champagne, platform).position.y = -0.016;   // brushed edge band
  const underMat = glow(C.amber); glows.push({ m: underMat, k: 2.2, group: 'under' });
  const underRing = mesh(new THREE.TorusGeometry(LIFT.r - 0.08, 0.018, 6, 128).rotateX(Math.PI / 2), underMat, platform); underRing.position.y = -LIFT.thick - 0.01;
  const topRing = glow(C.amber); glows.push({ m: topRing, k: 0.9, group: 'under' });
  mesh(new THREE.TorusGeometry(LIFT.r - 0.05, 0.006, 4, 128).rotateX(Math.PI / 2), topRing, platform).position.y = 0.003;
  const piano = grandPiano(M);
  piano.position.z = PIANO_ON_PLATFORM.z;
  platform.add(piano);
  const ps = contactShadow(2.0, 3.6, 0.55); ps.position.set(0, 0.004, -0.3); platform.add(ps);
  piano.userData.focus = 'vP1'; disc.userData.focus = 'vP1';

  // the scissor geometry for a lift height h
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
  const placeBar = (m, a, b) => { m.position.copy(a).lerp(b, 0.5); m.scale.x = a.distanceTo(b); m.rotation.set(0, 0, Math.atan2(b.y - a.y, b.x - a.x)); };
  function pose(h) {
    const top = platformTop(h);
    const H = top - LIFT.thick - TOP_FRAME - BASE_TOP;   // height the scissors span
    const s = H / LIFT.stages, theta = Math.asin(Math.min(0.95, s / LIFT.arm)), span = LIFT.arm * Math.cos(theta), xR = xL + span;
    for (const a of arms) {
      const y0 = BASE_TOP + a.st * s;
      // in each stage one arm rises from the fixed end, the other falls; packs alternate so the arms cross
      const up = a.k === 0;
      tmpA.set(xL, up ? y0 : y0 + s, a.z); tmpB.set(xR, up ? y0 + s : y0, a.z);
      placeBar(a.m, tmpA, tmpB);
    }
    for (const p of pins) p.m.position.set(p.end ? xR : xL, BASE_TOP + p.lvl * s, 0);
    for (const hb of hubs) hb.m.position.set((xL + xR) / 2, BASE_TOP + hb.st * s + s / 2, hb.z);
    // the rams: rod end on the first stage's falling arm at RAM.at of its length
    const attach = tmpA.set(xL + RAM.at * span, BASE_TOP + s * (1 - RAM.at), 0);
    ramTube.position.copy(attach);
    const dir = tmpB.copy(attach).sub(RAM.base), len = dir.length(); dir.normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    for (const r of rams) {
      r.body.position.set(RAM.base.x - dir.x * RAM.back, RAM.base.y - dir.y * RAM.back, r.z); r.body.quaternion.copy(q);
      r.rod.position.set(attach.x - dir.x * RAM.rod, attach.y - dir.y * RAM.rod, r.z); r.rod.quaternion.copy(q);
    }
    topFrame.position.y = top - LIFT.thick - TOP_FRAME / 2;
    platform.position.y = top;
    return len;
  }
  pose(0);
  lift.traverse(m => { if (m.isMesh && !m.material.isMeshBasicMaterial) { m.castShadow ??= true; m.receiveShadow = true; } });

  /* ----- the light rig ----- */
  const rig = buildRig({ root, M, quality, glows, add, mesh });

  /* ----- per frame ----- */
  const level = { frame: 1, under: 0, perimeter: 0, moving: 0, accent: 0, spot: 0 };
  function update(t, dt, h, L) {
    pose(h);
    const top = platformTop(h);
    for (const { m, k, group } of glows) m.color.copy(m.userData.base).multiplyScalar(k * (level[group] ?? 1));
    rig.update(t, dt, top, L);
  }

  return { root, piano, platform, lift, pose, update, rig, level, glows, bounds: new THREE.Box3(new THREE.Vector3(ANNEX.x0, 0, ANNEX.z0), new THREE.Vector3(wallX(PORTAL.z1), ANNEX.h, ANNEX.z1)) };
}

/* ---------- the light rig: perimeter ring, moving heads, accents, the performance spot, the under-platform LED ---------- */
// Groups are addressed by name; `L` (from index.js) holds each group's level, colour and, for the moving heads, the
// pattern. Real lights (the rest is glow and beam): two for the perimeter ring, two of the four moving heads, one back
// rim, the performance spot (the only one with a shadow) and the light under the platform. Phones: three in all.
function buildRig({ root, M, quality, glows, add, mesh }) {
  const lite = !!quality.mobile;
  const ring = add(new THREE.Group()); ring.position.set(LIFT.x, RIG.perimeter.y, LIFT.z);
  mesh(new THREE.TorusGeometry(RIG.perimeter.r, 0.05, 8, 128).rotateX(Math.PI / 2), M.brushed, ring);
  mesh(new THREE.TorusGeometry(RIG.perimeter.r, 0.05, 8, 128).rotateX(Math.PI / 2), M.brushed, ring).position.y = 0.32;
  for (let i = 0; i < 4; i++) {   // drop pipes to the ceiling
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const p = mesh(new THREE.CylinderGeometry(0.03, 0.03, ANNEX.h - RIG.perimeter.y, 8), M.brushed, ring);
    p.position.set(Math.cos(a) * RIG.perimeter.r, (ANNEX.h - RIG.perimeter.y) / 2, Math.sin(a) * RIG.perimeter.r);
  }
  // two pipes for the moving heads, along z
  for (const x of [RIG.moving[0][0], RIG.moving[2][0]]) {
    const p = mesh(new THREE.CylinderGeometry(0.045, 0.045, ANNEX.z1 - ANNEX.z0 - 1, 10).rotateX(Math.PI / 2), M.brushed);
    p.position.set(x, RIG.moving[0][1] + 0.32, (ANNEX.z0 + ANNEX.z1) / 2);
  }

  const bodyGeo = new THREE.CylinderGeometry(0.13, 0.16, 0.42, 20).rotateX(Math.PI / 2);   // along +z, the lens at +z
  const lensGeo = new THREE.CircleGeometry(0.115, 24);
  // a fixture: body and lens aimed along its +z (use lookAt), a beam cone, and its own lens glow
  const fixture = (pos, group, { scale = 1, beamAngle = 0.14, color = C.white } = {}) => {
    const g = add(new THREE.Group()); g.position.copy(pos);
    const head = add(new THREE.Group(), g);
    const body = mesh(bodyGeo, M.graphite, head); body.scale.setScalar(scale); body.castShadow = false;
    const lm = glow(color); glows.push({ m: lm, k: 2.2, group });
    const lens = mesh(lensGeo, lm, head); lens.position.z = 0.215 * scale; lens.scale.setScalar(scale);
    const beam = mesh(new THREE.ConeGeometry(Math.tan(beamAngle), 1, 28, 1, true).translate(0, -0.5, 0).rotateX(-Math.PI / 2), beamMaterial(color), head);
    beam.position.z = 0.22 * scale;
    return { g, head, lens: lm, beam, color: color.clone(), group };
  };

  const fixtures = [];
  for (let i = 0; i < RIG.perimeter.n; i++) {
    const a = ((i + 0.5) / RIG.perimeter.n) * Math.PI * 2;
    fixtures.push(fixture(new THREE.Vector3(LIFT.x + Math.cos(a) * RIG.perimeter.r, RIG.perimeter.y - 0.25, LIFT.z + Math.sin(a) * RIG.perimeter.r), 'perimeter', { beamAngle: 0.17, color: C.warm }));
  }
  const movers = RIG.moving.map(p => {
    const f = fixture(new THREE.Vector3(...p), 'moving', { scale: 1.1, beamAngle: 0.07, color: C.white });
    // a moving head's base and yoke above the head
    mesh(new RoundedBoxGeometry(0.42, 0.16, 0.34, 2, 0.03), M.graphite, f.g).position.y = 0.26;
    const yoke = mesh(new THREE.BoxGeometry(0.46, 0.06, 0.08), M.graphite, f.g); yoke.position.y = 0.16;
    return f;
  });
  const accents = RIG.accent.map((p, i) => fixture(new THREE.Vector3(...p), 'accent', { scale: i < 2 ? 0.8 : 1, beamAngle: 0.2, color: C.amber }));
  const spotF = fixture(new THREE.Vector3(...RIG.spot), 'spot', { scale: 1.5, beamAngle: 0.1, color: C.tungsten });
  fixtures.push(...movers, ...accents, spotF);

  // real lights
  const spot = (color, pos, { angle = 0.3, penumbra = 0.6, shadow = false } = {}) => {
    const l = new THREE.SpotLight(color, 0, 0, angle, penumbra, 2);
    l.position.copy(pos); root.add(l, l.target);
    if (shadow) {
      l.castShadow = true; l.shadow.mapSize.setScalar(Math.min(2048, quality.shadowSize || 1024));
      l.shadow.bias = -0.0004; l.shadow.normalBias = 0.02; l.shadow.camera.near = 2; l.shadow.camera.far = 16;
      l.shadow.autoUpdate = false; l.shadow.needsUpdate = true;
    }
    return l;
  };
  const front = a => new THREE.Vector3(LIFT.x + Math.cos(a) * RIG.perimeter.r, RIG.perimeter.y - 0.25, LIFT.z + Math.sin(a) * RIG.perimeter.r);
  const real = {
    perimeter: lite ? [spot(C.warm, front(0), { angle: 0.4, penumbra: 0.8 })] : [spot(C.warm, front(-0.6), { angle: 0.36, penumbra: 0.8 }), spot(C.warm, front(0.6), { angle: 0.36, penumbra: 0.8 })],
    moving: lite ? [] : [spot(C.white, movers[0].g.position, { angle: 0.12, penumbra: 0.5 }), spot(C.white, movers[3].g.position, { angle: 0.12, penumbra: 0.5 })],
    accent: lite ? [] : [spot(C.amber, accents[2].g.position, { angle: 0.3, penumbra: 0.7 })],
    spot: [spot(C.tungsten, spotF.g.position, { angle: 0.15, penumbra: 0.45, shadow: !lite })],
  };
  const under = new THREE.PointLight(C.amber, 0, 7, 2); root.add(under);

  const aim = new THREE.Vector3(), tmp = new THREE.Vector3(), col = new THREE.Color();
  const center = new THREE.Vector3(LIFT.x, 0, LIFT.z + PIANO_ON_PLATFORM.z * 0 - 0.4);
  // where a moving head points, for its pattern
  const moverAim = (i, pattern, t, top, out) => {
    const phase = i * Math.PI * 0.5;
    if (pattern === 'sweep') return out.set(LIFT.x + Math.cos(t * 0.35 + phase) * 2.6, top + 0.2, LIFT.z + Math.sin(t * 0.35 + phase) * 2.6);
    if (pattern === 'fast') return out.set(LIFT.x + Math.cos(t * 1.1 + phase) * 3.2, top * (0.5 + 0.5 * Math.sin(t * 0.7 + i)), LIFT.z + Math.sin(t * 1.3 + phase) * 3.2);
    if (pattern === 'track') return out.set(LIFT.x + Math.cos(phase + 0.8) * (LIFT.r - 0.1), top - LIFT.thick, LIFT.z + Math.sin(phase + 0.8) * (LIFT.r - 0.1));
    return out.set(LIFT.x + (i % 2 ? 0.6 : -0.6), top + 0.9, LIFT.z + (i < 2 ? -0.5 : 0.3));   // 'center': a soft cross on the piano
  };

  let shadowAt = -1;
  return {
    fixtures,
    real,
    update(t, dt, top, L) {
      center.y = top + 0.9;
      for (const [k, f] of fixtures.entries()) {
        const g = L[f.group];
        if (f.group === 'moving') moverAim(movers.indexOf(f), g.pattern, t, top, aim); else aim.copy(center);
        if (f.group === 'accent' && k - RIG.perimeter.n - movers.length < 2) aim.set(LIFT.x, top + 1.6, LIFT.z);   // the floor backlights skim the piano's back
        f.head.lookAt(aim);
        const len = f.g.position.distanceTo(aim);
        f.beam.scale.setScalar(len);
        col.copy(g.color);
        f.beam.material.uniforms.uColor.value.copy(col);
        f.beam.material.uniforms.uOpacity.value = 0.11 * g.level * L.haze * (f.group === 'spot' ? 1.4 : 1);
        f.beam.visible = g.level * L.haze > 0.01;
        f.lens.color.copy(col).multiplyScalar(2.2 * g.level);
        f.aim = f.aim ? f.aim.lerp(aim, 1) : aim.clone();
      }
      // real lights, at the group's level and colour
      const put = (l, from, to, k, color) => { l.position.copy(from); l.target.position.copy(to); l.color.copy(color); l.intensity = k; };
      real.perimeter.forEach(l => put(l, l.position, center, 380 * L.perimeter.level * (lite ? 1.6 : 1), L.perimeter.color));
      real.moving.forEach((l, i) => put(l, movers[i ? 3 : 0].g.position, movers[i ? 3 : 0].aim, 420 * L.moving.level, L.moving.color));
      real.accent.forEach(l => put(l, l.position, tmp.set(LIFT.x, top + 1.2, LIFT.z), 300 * L.accent.level, L.accent.color));
      real.spot.forEach(l => put(l, l.position, tmp.set(LIFT.x, top + 0.75, LIFT.z + 0.3), 620 * L.spot.level, L.spot.color));
      under.position.set(LIFT.x, Math.max(0.2, top - LIFT.thick - 0.35), LIFT.z);
      under.color.copy(L.under.color);
      under.intensity = 9 * L.under.level * (1 + 0.25 * Math.sin(t * 2.2) * L.under.pulse);
      // the spot's shadow: redrawn while the lift moves or the spot is up, not every frame when nothing changes
      const sl = real.spot[0];
      if (sl.castShadow && L.spot.level > 0.02 && (top !== shadowAt || L.active)) { sl.shadow.needsUpdate = true; shadowAt = top; }
    },
  };
}

function signTexture() {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 292;
  const x = c.getContext('2d');
  x.fillStyle = '#f2a650'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '500 120px "Archivo", "Helvetica Neue", Arial, sans-serif';
  const text = 'VIENNA  ·  PIANO  STAGE';
  // letter-spaced by hand (canvas letterSpacing is not everywhere yet)
  const sp = 34, chars = [...text], widths = chars.map(ch => x.measureText(ch).width), total = widths.reduce((a, b) => a + b, 0) + sp * (chars.length - 1);
  let px = (c.width - total) / 2;
  x.textAlign = 'left';
  chars.forEach((ch, i) => { x.fillText(ch, px, c.height / 2); px += widths[i] + sp; });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
