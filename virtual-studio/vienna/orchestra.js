// OPUS V ORCHESTRA ROOM (approved 29 Oct 2026; VARIANT A the same day): a hidden room behind the grand, beyond the
// studio's Vienna-side wall, where the first build of the Piano Stage had its annex (19 Oct; its source:
// production/opus-v/recovered-annex-2026-10-19, whose back wall of fins with amber LED strips and whose deck with its
// amber edge come back here). 10 m wide, 8 m deep from the wall's line, 5 m high; the opening 8 m wide, 4 m high.
// Closed, four leaves carrying the studio's own fins and light lines fill the opening (set.js OPUS_WALL), and nothing
// tells it from the rest of the wall. One click: the leaves step back behind the wall's line and slide aside into the
// wall's pockets (the outer pair 1 m back, the inner pair 2.1 m, so they pass each other).
// STAGE CONFIGURATION: STRING QUARTET (4 places on a low platform) or CHAMBER ORCHESTRA (28 places: strings on the
// floor in two rows, winds and brass on the first riser, timpani and percussion on the second). The switch changes the
// chairs, stands, the light and the cameras' framing; the room's lights dip and come back on the new layout.
// Cameras: OV1 (audience left), OV2 (audience right), OV3 (centre), OV4 the 4K motion-control robot on a gantry over the
// second riser (real-time moves), and its own security camera (CCTV). No players and no OPUS V identity yet. The
// instruments wait for the approved, licence-checked models: each place keeps an empty slot for its instrument.
//   setOpen(on) · toggle() · setConfig('quartet' | 'chamber') · update(dt, work) · get open (0 … 1) · get target
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { OPUS_WALL, cineRobot, securityCam } from '../set.js';
import { proposals } from './opus-instruments.js';

// R: the fins' circle about the studio's centre (0, 1); the wall's skin stands 0.6 m behind it
const R = 12.6, SKIN = R + 0.6, Z = 1, FIN_STEP = 0.075;
const W = 10, BACK = 8.6, H = 5.0, OH = OPUS_WALL.h, OPEN = 2 * SKIN * Math.sin(OPUS_WALL.a1 - OPUS_WALL.a);   // 8 m
const POCKET = 6.25, SIDE_Z = 2.8;   // the pockets reach 6.25 m either side; the room's side walls begin behind them
// (the leaves sweep the room's front up to 2.75 m from the wall's line while they open: nothing stands there)

/* ----- the two configurations. Places: [x across the wall, z depth from the wall's line] in the room's frame (+z out
   of the studio; the audience, in the studio, has +x on its left), the instrument, the seat ----- */
const row = (zc, sag, x0, x1, insts, seat = 'chair') => insts.map((inst, i) => {
  const x = x0 + (x1 - x0) * i / (insts.length - 1), u = x / Math.max(Math.abs(x0), Math.abs(x1));
  return { x, z: zc - sag * u * u, inst, seat: Array.isArray(seat) ? seat[i] : seat };
});
const V1 = 'First violin', V2 = 'Second violin', VA = 'Viola', VC = 'Cello', CB = 'Double bass';
export const CONFIGS = {
  quartet: {
    label: 'String quartet',
    floor: 0.2,   // on its own low platform
    places: [{ x: 1.9, z: 4.5, inst: V1 }, { x: 0.65, z: 4.2, inst: V2 }, { x: -0.65, z: 4.2, inst: VA }, { x: -1.9, z: 4.5, inst: VC }].map(p => ({ ...p, seat: 'chair' })),
    face: -3,     // the players turn to a point this far in front of the wall (the grand's side)
    top: { w: 5.2, h: 3.0, z: 4.2, k: 3.2 },
    cams: {
      OV1: { from: [3.2, 1.55, 2.35], at: [-0.2, 1.05, 4.4], fov: 38 },
      OV2: { from: [-3.2, 1.55, 2.35], at: [0.2, 1.05, 4.4], fov: 38 },
      OV3: { from: [0, 1.5, 1.2], at: [0, 1.0, 4.4], fov: 40 },
    },
    view: { from: [0, 1.6, -2.5], at: [0, 1.1, 4.2] },
    // the robot's programme: over the first violin's shoulder, high over the four, over the cello, over them to the
    // grand, low on the second violin and viola. [s, track x (room x), wrist, look at]
    moves: [[1.2, 1.5, [1.6, 2.4, 6.2], [1.4, 1.0, 4.0]], [1.4, 0, [0, 4.1, 6.3], [0, 0.4, 4.0]], [1.1, -1.5, [-1.6, 2.2, 6.35], [-1.6, 1.0, 4.2]],
      [1.5, 0, [0, 2.9, 6.0], [0, 1.2, -2.0]], [1.2, 0.6, [0.5, 2.3, 6.2], [0.6, 1.0, 4.3]]],
  },
  chamber: {
    label: 'Chamber orchestra',
    floor: 0,
    // 28: 5 first violins, 4 second violins, 3 violas, 4 cellos, 2 double basses; flute, oboe, clarinet, bassoon;
    // 2 French horns, 2 trumpets; a timpanist; a percussionist (snare and concert bass drum are their setup). Strings
    // on the floor (first violins on the audience's left, cellos and basses on the right), winds in the middle of the
    // first riser with horns and trumpets beside them, timpani and percussion on the second. The grand stays in the studio
    places: [
      ...row(3.75, 0.3, 3.85, -3.85, [V1, V1, V1, V2, VA, VA, VC, VC]),
      ...row(4.85, 0.3, 4.4, -4.4, [V1, V1, V2, V2, V2, VA, VC, VC, CB, CB], ['chair', 'chair', 'chair', 'chair', 'chair', 'chair', 'chair', 'chair', 'stool', 'stool']),
      ...row(6.15, 0.15, 3.6, -3.6, ['French horn', 'French horn', 'Flute', 'Oboe', 'Clarinet', 'Bassoon', 'Trumpet', 'Trumpet']).map(p => ({ ...p, y: 0.3 })),
      // (at the back of the second riser, their instruments in front of them; their music on the trap table, no stand)
      { x: 1.7, z: 8.05, y: 0.6, inst: 'Timpani', seat: 'stool', stand: false }, { x: -1.9, z: 8.05, y: 0.6, inst: 'Percussion', seat: 'stool', stand: false },
    ],
    face: -6,
    top: { w: 9.2, h: 5.6, z: 5.6, k: 2.6 },
    cams: {
      OV1: { from: [4.5, 2.6, 2.95], at: [-1.0, 0.9, 5.8], fov: 52 },
      OV2: { from: [-4.5, 2.6, 2.95], at: [1.0, 0.9, 5.8], fov: 52 },
      OV3: { from: [0, 2.2, 0.4], at: [0, 1.0, 5.6], fov: 55 },
    },
    view: { from: [0, 2.3, -3.0], at: [0, 1.1, 5.2] },
    // over the violins' shoulders, high over the whole orchestra, the cellos and basses, low behind the winds, the timpani
    moves: [[1.2, 2.2, [2.3, 2.5, 6.3], [2.6, 0.7, 3.6]], [1.4, 0, [0, 4.2, 6.5], [0, 0.6, 3.6]], [1.1, -2.4, [-2.5, 2.3, 6.3], [-3.0, 0.8, 4.0]],
      [1.5, 0.8, [0.9, 1.9, 6.7], [0.2, 1.1, 5.9]], [1.2, 1.6, [1.6, 2.8, 6.9], [1.7, 1.0, 7.3]]],
  },
};
// the instruments built for the room, by place: [what, x, z (m, in the place's frame, +z to the audience), turn]
export const BUILT = {
  Timpani: [['timpani', 0, 0.8]],
  Percussion: [['trapTable', 0, 0.72], ['bassDrum', -1.25, 0.5, 0.2], ['triangle', -0.8, 1.2], ['cymbals', 0.9, 0.7, -0.3]],
  Bassoon: [['bassoon', 0.5, 0.12]],
};
export const OPUS_PLACES = CONFIGS.quartet.places.map(p => [p.x, p.z]);
export const QUARTET = CONFIGS.quartet.places.map(p => p.inst);

export function buildOrchestra({ M, scene }) {
  const a = OPUS_WALL.a, g = new THREE.Group(); g.name = 'opus-v-room';
  g.position.set(R * Math.sin(a), 0, Z + R * Math.cos(a)); g.rotation.y = a; scene.add(g);   // local +z: out of the studio
  const add = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  const room = new THREE.Group(); g.add(room); room.visible = false;
  // on the wall's circle: a point at angle φ from the room's axis lies at x = r sin φ, z = r cos φ − R in this frame
  const arcZ = (x, r = SKIN) => Math.sqrt(Math.max(0, r * r - x * x)) - R;

  /* ----- the leaves: the wall's own skin, fins and light lines on four sliding leaves ----- */
  const skin = M.wallBack.clone(); skin.side = THREE.DoubleSide;
  const stripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xf2a650).multiplyScalar(1.6), toneMapped: false });
  const leafW = OPEN / 4, leaves = [];
  // the studio's fin grid, as set.js lays it from its first angle (π − 1.95) every 0.075 rad
  const A0 = Math.PI - 1.95, finAt = [], stripAt = [];
  for (let f = A0; f <= Math.PI + 1.95; f += FIN_STEP) { if (f > OPUS_WALL.a0 - 0.01 && f < OPUS_WALL.a1 + 0.01) finAt.push(f); if (f + 0.0375 > OPUS_WALL.a0 && f + 0.0375 < OPUS_WALL.a1) stripAt.push(f + 0.0375); }
  for (let i = 0; i < 4; i++) {
    const cx = -OPEN / 2 + (i + 0.5) * leafW, inner = i === 1 || i === 2, p = new THREE.Group(); g.add(p); p.position.set(cx, 0, 0);
    // open: the outer pair 1 m back, the inner pair 2.1 m (behind them), then all four aside into the pockets, 4 … 6 m out
    p.userData = { cx, back: inner ? 2.1 : 1.0, to: Math.sign(cx) * (OPEN / 2 + leafW / 2) };
    const da = Math.asin(cx / SKIN); add(new THREE.BoxGeometry(leafW + 0.02, OH, 0.05), skin, 0, OH / 2, SKIN * Math.cos(da) - R, p).rotation.y = da;
    const mine = x => Math.max(0, Math.min(3, Math.floor((x + OPEN / 2) / leafW))) === i;   // each fin and line on its nearest leaf (the edge ones too)
    for (const f of finAt) { const x = R * Math.sin(f - a); if (mine(x)) add(new THREE.BoxGeometry(0.16, OH, 0.7), M.fin, x - cx, OH / 2, R * Math.cos(f - a) - R, p).rotation.y = f - a; }
    for (const f of stripAt) { const x = (R + 0.3) * Math.sin(f - a); if (mine(x)) { const s = add(new THREE.BoxGeometry(0.025, OH - 0.7, 0.025), stripMat, x - cx, 0.7 + (OH - 0.7) / 2, (R + 0.3) * Math.cos(f - a) - R, p); s.castShadow = false; } }
    leaves.push(p);
  }

  /* ----- the room: oak floor (the pockets and the room as one), acoustic fabric walls and ceiling ----- */
  const oak = new THREE.MeshPhysicalMaterial({ color: 0x2a1f17, roughness: 0.42, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.3 });
  const fabric = new THREE.MeshStandardMaterial({ color: 0x17171b, roughness: 0.96, metalness: 0 });
  const amber = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });   // the back wall's LED strips and the risers' edges (levelled per frame)
  const phiP = Math.asin(POCKET / SKIN), phiO = OPUS_WALL.a1 - a, outline = new THREE.Shape();
  for (let i = 0; i <= 24; i++) { const f = -phiP + 2 * phiP * i / 24, x = SKIN * Math.sin(f), z = SKIN * Math.cos(f) - R; i ? outline.lineTo(x, -z) : outline.moveTo(x, -z); }
  for (const [x, z] of [[POCKET, SIDE_Z], [W / 2, SIDE_Z], [W / 2, BACK], [-W / 2, BACK], [-W / 2, SIDE_Z], [-POCKET, SIDE_Z]]) outline.lineTo(x, -z);
  const slab = d => new THREE.ExtrudeGeometry(outline, { depth: d, bevelEnabled: false, curveSegments: 1 }).rotateX(-Math.PI / 2);   // (shape y = −z)
  add(slab(0.05), oak, 0, -0.046, 0, room);          // its top 4 mm over the studio's floor, which runs on under it
  add(slab(0.06), fabric, 0, H, 0, room);
  add(new THREE.BoxGeometry(W, H, 0.08), fabric, 0, H / 2, BACK + 0.04, room);
  for (const sx of [-1, 1]) {
    add(new THREE.BoxGeometry(0.08, H, BACK - SIDE_Z), fabric, sx * (W / 2 + 0.04), H / 2, (SIDE_Z + BACK) / 2, room);
    add(new THREE.BoxGeometry(POCKET - W / 2, H, 0.08), fabric, sx * (POCKET + W / 2) / 2, H / 2, SIDE_Z + 0.04, room);   // the pocket's back
    const z0 = arcZ(POCKET); add(new THREE.BoxGeometry(0.08, H, SIDE_Z - z0), fabric, sx * (POCKET + 0.04), H / 2, (z0 + SIDE_Z) / 2, room);   // its end
    // the wall's inner face beside the opening (its skin is only drawn from the studio side)
    add(new THREE.CylinderGeometry(SKIN + 0.05, SKIN + 0.05, OH, 24, 1, true, sx > 0 ? phiO : -phiP, phiP - phiO), fabric, 0, OH / 2, -R, room);
  }
  add(new THREE.CylinderGeometry(SKIN + 0.05, SKIN + 0.05, H - OH, 48, 1, true, -phiP, 2 * phiP), fabric, 0, (OH + H) / 2, -R, room);   // and over it
  // the back wall, as the annex had it: dark fins with amber LED strips between them, clear of the second riser
  for (let x = -W / 2 + 0.45; x <= W / 2 - 0.44; x += 0.6) {
    add(new RoundedBoxGeometry(0.12, H - 1.0, 0.28, 2, 0.02), M.fin, x, 0.7 + (H - 1.0) / 2, BACK - 0.14, room);
    const s = add(new THREE.BoxGeometry(0.03, H - 1.4, 0.02), amber, x + 0.3, 0.7 + (H - 1.0) / 2, BACK - 0.05, room); s.castShadow = false;
  }
  // oak diffusers on the side walls (acoustics)
  for (const sx of [-1, 1]) for (let k = 0; k < 10; k++) add(new THREE.BoxGeometry(0.06, 0.6 + (k % 3) * 0.3, 0.08), oak, sx * (W / 2 - 0.03), 2.5, SIDE_Z + 0.3 + k * 0.56, room);
  // the two risers across the back, each with its amber front edge: winds and brass (0.3 m), timpani and percussion (0.6 m)
  for (const [z0, z1, h] of [[5.3, 6.4, 0.3], [6.4, BACK - 0.3, 0.6]]) {
    add(new RoundedBoxGeometry(W - 0.8, h, z1 - z0, 2, 0.02), oak, 0, h / 2, (z0 + z1) / 2, room);
    const e = add(new THREE.BoxGeometry(W - 0.8, 0.012, 0.012), amber, 0, h + 0.006, z0 + 0.01, room); e.castShadow = false;
  }

  /* ----- the configurations' furniture: concert chairs (or stools), music stands with their lights, the pinspots'
     pools; merged per material, one set of meshes per configuration. Each place keeps an empty slot for its instrument ----- */
  const leather = M.leather || fabric, chrome = M.chrome || M.brushed, graphite = M.graphite || chrome;
  const standLight = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
  const poolTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,226,180,1)'); gr.addColorStop(0.5, 'rgba(255,226,180,0.45)'); gr.addColorStop(1, 'rgba(255,226,180,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
  const pool = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0x000000 });
  const sets = {};
  const P = proposals(), INST = { timpani: P.timpani, bassDrum: P.bassDrum, cymbals: P.cymbals, triangle: P.triangle, trapTable: P.trapTable, bassoon: P.bassoon }, Y = new THREE.Vector3(0, 1, 0);
  for (const [name, C] of Object.entries(CONFIGS)) {
    const set = new THREE.Group(); set.name = 'opus-v-' + name; set.visible = false; room.add(set);
    const tmp = new THREE.Group(), put = (geo, mat, x, y, z, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
    if (name === 'quartet') {   // the quartet's own low platform, in front of the risers, with its amber edge
      put(new RoundedBoxGeometry(5.6, C.floor, 2.4, 2, 0.02), oak, 0, C.floor / 2, 4.1, tmp);
      put(new THREE.BoxGeometry(5.6, 0.012, 0.012), amber, 0, C.floor + 0.006, 2.91, tmp);
    }
    const slots = [];
    for (const p of C.places) {
      const y = p.y ?? C.floor, c = new THREE.Group(); c.position.set(p.x, y, p.z); tmp.add(c);
      c.rotation.y = Math.atan2(-p.x, C.face - p.z);   // (+z of the place: to the point it faces)
      if (p.seat === 'stool') {   // a tall stool (double bass, timpani, percussion) with a footring
        put(new THREE.CylinderGeometry(0.19, 0.19, 0.06, 24), leather, 0, 0.74, 0, c);
        put(new THREE.CylinderGeometry(0.02, 0.025, 0.72, 12), chrome, 0, 0.36, 0, c);
        put(new THREE.CylinderGeometry(0.2, 0.22, 0.02, 24), graphite, 0, 0.01, 0, c);
        put(new THREE.TorusGeometry(0.16, 0.008, 6, 24).rotateX(Math.PI / 2), chrome, 0, 0.3, 0, c);
      } else {                    // a black concert chair on chrome legs
        put(new RoundedBoxGeometry(0.46, 0.06, 0.44, 2, 0.02), leather, 0, 0.48, 0, c);
        put(new RoundedBoxGeometry(0.44, 0.42, 0.05, 2, 0.02), leather, 0, 0.78, -0.2, c).rotation.x = -0.12;
        for (const [lx, lz] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) put(new THREE.CylinderGeometry(0.012, 0.012, 0.46, 10), chrome, lx, 0.23, lz, c);
      }
      // a professional music stand turned to the player, with its light
      if (p.stand !== false) {
      const s = new THREE.Group(); s.position.set(0, 0, p.seat === 'stool' ? 0.78 : 0.62); c.add(s);
      put(new THREE.CylinderGeometry(0.012, 0.014, 1.05, 12), chrome, 0, 0.53, 0, s);
      for (let k = 0; k < 3; k++) { const leg = put(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 8), chrome, Math.cos(k * 2.09) * 0.14, 0.06, Math.sin(k * 2.09) * 0.14, s); leg.rotation.set(Math.sin(k * 2.09) * 1.2, 0, -Math.cos(k * 2.09) * 1.2); }
      put(new RoundedBoxGeometry(0.52, 0.36, 0.015, 2, 0.006), graphite, 0, 1.12, 0, s).rotation.x = 0.35;
      put(new THREE.BoxGeometry(0.5, 0.02, 0.04), graphite, 0, 0.95, -0.06, s);   // its ledge
      put(new THREE.BoxGeometry(0.16, 0.015, 0.03), standLight, 0, 1.3, -0.08, s);
      }
      put(new THREE.PlaneGeometry(1.25, 1.25).rotateX(-Math.PI / 2), pool, 0, 0.01, 0.15, c);   // the pinspot's pool
      // the instrument's slot (empty until the approved models are in)
      const slot = new THREE.Object3D(); slot.position.set(p.x, y, p.z); slot.rotation.y = c.rotation.y; slot.userData = { inst: p.inst }; set.add(slot); slots.push(slot);
    }
    // the instruments built for the room (opus-instruments.js), each at its place in the place's own frame (+z: to the
    // audience; the instrument's front, −z of its own, turned that way): the timpani in front of the timpanist; the
    // percussionist's concert bass drum, trap table, triangle and cymbal cradle round him; the bassoon on its stand
    // beside the bassoonist's chair. (The licensed models of the other instruments go into the slots when downloaded)
    for (const [i, p] of C.places.entries()) for (const [what, x, z, turn = 0] of BUILT[p.inst] || []) {
      const o = INST[what](), c = slots[i];
      o.position.set(x, 0, z).applyAxisAngle(Y, c.rotation.y).add(c.position); o.rotation.y = c.rotation.y + Math.PI + turn;
      tmp.add(o);
    }
    // merged: one mesh per material (28 places would otherwise be some 450 draw calls)
    tmp.updateMatrixWorld(true);
    const byMat = new Map();
    tmp.traverse(o => {
      if (!o.isMesh) return;
      const gm = o.geometry.clone().applyMatrix4(o.matrixWorld);
      for (const n of Object.keys(gm.attributes)) if (!['position', 'normal', 'uv'].includes(n)) gm.deleteAttribute(n);
      if (!byMat.has(o.material)) byMat.set(o.material, []);
      byMat.get(o.material).push(gm.index ? gm : gm.setIndex([...Array(gm.attributes.position.count).keys()]));
    });
    for (const [mat, geos] of byMat) {
      const m = new THREE.Mesh(mergeGeometries(geos, false), mat); set.add(m);
      const lit = mat !== standLight && mat !== pool && mat !== amber; m.castShadow = lit; m.receiveShadow = lit;
      if (mat === pool) m.renderOrder = 1;
    }
    sets[name] = { group: set, slots };
  }

  /* ----- light: a soft warm top light over the players (its size and place follow the configuration) and the back
     wall's amber (real lights, dark while closed), the pinspots' pools, the stand lights; CLEANING MODE turns the top
     light white ----- */
  const top = new THREE.RectAreaLight(0xffe7c8, 0, 4, 3); g.add(top);
  const wash = new THREE.RectAreaLight(0xf2a650, 0, W - 0.6, H - 0.8); wash.position.set(0, H / 2, 2.0); g.add(wash);
  const local = v => { g.updateMatrixWorld(true); return g.localToWorld(new THREE.Vector3(...v)); };
  // (lookAt takes world points)
  const aim = () => { top.lookAt(local([top.position.x, 0, top.position.z])); wash.lookAt(local([0, H / 2, BACK])); };
  const WORK = new THREE.Color(0xf4f2ee), WARM = new THREE.Color(0xffe7c8);

  /* ----- OV4: the 4K motion-control robot on a gantry over the second riser, its track along the back wall (turned
     to face the studio, so its track runs along −x); and the room's security camera, high in the corner where the
     Vienna-side wall begins ----- */
  const GANTRY = 2.4;   // the track's deck over the riser (cineRobot lifts its moves by it: they are given here as they are in the room)
  const robotMoves = CONFIGS.quartet.moves.map(m => [m[0], 0, [0, 0, 0], [0, 0, 0]]);
  let robot = null;
  try {
    robot = cineRobot(M, { moves: robotMoves, at: [0, 0.6, BACK - 0.6], rotY: Math.PI, rail: 6.4, parkX: 2.8, park: local([0, 1.0 - GANTRY, 3.0]).toArray(), base: () => GANTRY });
    robot.group.userData.equipment = '4K camera robot · OPUS V'; room.add(robot.group);
  } catch (e) { console.error('OPUS V robot:', e); robot = null; }
  const recAnim = [], CCTV_AT = [-W / 2 + 0.2, 4.6, SIDE_Z + 0.25], CCTV_AIM = [1.5, 0.8, 6.5];
  const sec = securityCam(M, recAnim); sec.position.set(...CCTV_AT); room.add(sec); sec.lookAt(local(CCTV_AIM));

  let config = 'quartet', shown = null;
  const listeners = [];
  function show(name) {   // the layout, the light and the robot's programme of one configuration
    shown = name; const C = CONFIGS[name];
    for (const [n, s] of Object.entries(sets)) s.group.visible = n === name;
    top.width = C.top.w; top.height = C.top.h; top.position.set(0, H - 0.05, C.top.z); aim();
    C.moves.forEach((m, i) => { robotMoves[i][0] = m[0]; robotMoves[i][1] = -m[1]; robotMoves[i][2] = local([m[2][0], m[2][1] - GANTRY, m[2][2]]).toArray(); robotMoves[i][3] = local([m[3][0], m[3][1] - GANTRY, m[3][2]]).toArray(); });
    for (const f of listeners) f(name);
  }
  const camOf = (k, name = config) => {
    if (k === 'CCTV') { const at = local(CCTV_AIM), from = local(CCTV_AT); return { pos: at.clone().sub(from).setLength(0.3).add(from), target: at, fov: 80 }; }
    const c = CONFIGS[name].cams[k]; return c && { pos: local(c.from), target: local(c.at), fov: c.fov };
  };

  /* ----- opening and closing: 7 s, eased; the leaves back, then aside; the light comes up back to front. A change of
     configuration dips the room's light (0.8 s down, the new layout, 0.8 s up); closed, it changes at once ----- */
  let k = 0, target = 0, dip = 0, t = 0;
  const ss = THREE.MathUtils.smoothstep;
  show(config);
  return {
    group: g, CONFIGS,
    get robot() { return robot; },
    get open() { return k; }, get target() { return target; },
    setOpen(on) { target = on ? 1 : 0; }, toggle() { target = target ? 0 : 1; },
    get config() { return config; }, get label() { return CONFIGS[config].label; },
    setConfig(name) { if (!CONFIGS[name] || name === config) return; config = name; if (k < 0.01) show(name); else if (!dip) dip = 0.001; },
    onConfig(f) { listeners.push(f); },
    places: name => CONFIGS[name || config].places.map(p => p.inst),
    slots: name => sets[name || config].slots,
    camera: camOf,
    // where the cinematic move ends: looking in from the studio onto the players
    get view() { const v = CONFIGS[config].view; return { from: new THREE.Vector3(...v.from), at: new THREE.Vector3(...v.at) }; },
    toWorld(v) { return g.localToWorld(v.clone()); },
    // the room as the director keeps a camera in it: inside its walls, or in the doorway while it is open
    has(p) {
      const q = g.worldToLocal(p.clone());
      if (q.y > H + 0.5 || q.z > BACK + 0.5 || Math.abs(q.x) > POCKET + 0.3) return false;
      if (q.z > arcZ(q.x) + 0.1) return true;
      return k > 0.5 && q.y < OH && Math.abs(q.x) < OPEN / 2 - 0.3 && q.z > arcZ(q.x, R - 1.6);   // in the doorway
    },
    keep(p) {
      const q = g.worldToLocal(p.clone());
      if (q.z < arcZ(q.x) + 0.1) q.y = THREE.MathUtils.clamp(q.y, 0.35, OH - 0.3);   // the doorway: only under its head
      else {
        const half = q.z > SIDE_Z + 0.2 ? W / 2 - 0.15 : POCKET - 0.15;
        q.x = THREE.MathUtils.clamp(q.x, -half, half); q.y = THREE.MathUtils.clamp(q.y, 0.35, H - 0.2); q.z = Math.min(q.z, BACK - 0.35);
      }
      p.copy(g.localToWorld(q));
    },
    update(dt, work = 0) {
      t += dt;
      k = THREE.MathUtils.clamp(k + Math.sign(target - k) * dt / 7, 0, 1);
      const back = ss(k, 0, 0.28), aside = ss(k, 0.22, 1);
      for (const p of leaves) { const u = p.userData; p.position.set(u.cx + (u.to - u.cx) * aside, 0, back * u.back); }
      room.visible = k > 0.001;
      let lv = 1;
      if (dip) { dip += dt / 1.6; if (dip >= 0.5 && shown !== config) show(config); if (dip >= 1) dip = 0; lv = dip ? Math.abs(1 - 2 * dip) : 1; }
      else if (shown !== config) show(config);
      const wall = ss(k, 0.3, 0.7), spots = ss(k, 0.5, 0.9) * lv, stands = ss(k, 0.7, 1) * lv, w = Math.min(1, work);
      amber.color.setRGB(0.95, 0.6, 0.25).multiplyScalar(1.7 * wall);
      wash.intensity = 1.6 * wall;
      top.color.copy(WARM).lerp(WORK, Math.min(1, work * 3)); top.intensity = CONFIGS[shown].top.k * spots * (1 - w) + 4.2 * work * (k > 0.01 ? 1 : 0);
      pool.color.setScalar(0.55 * spots * (1 - w));
      standLight.color.setRGB(1, 0.9, 0.75).multiplyScalar(1.4 * stands);
      if (room.visible) {
        for (const f of recAnim) f(t);
        if (robot) try { robot.update(dt); } catch (e) { console.error('OPUS V robot:', e); robot = null; }
      }
      return k;
    },
  };
}
