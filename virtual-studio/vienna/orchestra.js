// OPUS V · THE TRANSFORMING ORCHESTRA ROOM (design approved by the owner 29 Oct 2026; production/opus-v/transform:
// plan.py holds the plan in numbers and the checks, draw.py the approved drawings). A hidden room behind the grand,
// beyond the studio's Vienna-side wall, in the footprint of the annex the first Piano Stage had (19 Oct; its source:
// production/opus-v/recovered-annex-2026-10-19): x −22 … the wall, z −6.6 … 4.6 (11.2 × 9.4 m), 10 m high.
//   The wall: an 8 m opening (set.js OPUS_WALL) closed by four leaves carrying the studio's own fins and light lines.
//     Open: they step 1 m back and rise 4.2 m, behind the studio wall above the opening.
//   STRING QUARTET: an intimate room flown in from the loft (two side walls from the fixed returns beside the opening
//     to a 6 m back wall 4.7 m deep, 4.4 m high) under an acoustic canopy at 4.2 m; four places on a low platform.
//   CHAMBER ORCHESTRA (28): the walls fly out (5.4 … 9.8 m), the canopy rises to 6.2 m and a second panel comes down
//     behind the walls' line, the two risers rise out of the stage floor (0.3 m, 0.6 m), the light trusses come on.
//     Nothing moves across the stage floor. Strings on the floor; winds, trumpets and basses on riser 1; horns, timpani
//     and percussion on riser 2.
//   The change: cinematic (22 s, with its own shot) or immediate (rehearsal, technical work). 0.5–7 s the canopy ·
//   0–1.5 s the robot's bridge moves back · 1.5–9 s the walls fly · 8.5–13.5 s the risers rise · 13–15 s a light dip:
//   the places change · 17–22 s the trusses, section by section. Back to the quartet: the same, in reverse.
//   Cameras: OV1 (audience left), OV2 (audience right), OV3 (centre), each framed for the configuration; OV4 the 4K
//   motion-control robot hung from an overhead camera bridge (4.6 m for the quartet, 4.8 m for the orchestra), moving in
//   real time; the room's CCTV high in the back corner. No players and no OPUS V identity: those wait for the official
//   material. Instruments: those built for the room (opus-instruments.js) stand at their places; every other place keeps
//   a slot for its licensed model, which goes in once its file has been downloaded (missing() lists them).
//   setOpen(on) · toggle() · setConfig(name, { instant }) · update(dt, work) · open · config · progress
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { OPUS_WALL, cineRobot, securityCam } from '../set.js';
import { proposals } from './opus-instruments.js';

// R: the fins' circle about the studio's centre (0, 1); the wall's skin stands 0.6 m behind it
const R = 12.6, SKIN = R + 0.6, Z = 1, FIN_STEP = 0.075;
const OH = OPUS_WALL.h, OPEN = 2 * SKIN * Math.sin(OPUS_WALL.a1 - OPUS_WALL.a);   // 8 m × 4 m
const ANNEX = { x0: -22.0, z0: -6.6, z1: 4.6, h: 10.0 }, IN = 0.1;                  // (its walls 0.1 m thick, inside the footprint)
const XB = ANNEX.x0 + IN, ZL = ANNEX.z1 - IN, ZR = ANNEX.z0 + IN;                  // the inner faces: back, left (+z), right
const T = 22;                                                                       // the cinematic change, s
// the timeline (s) of the quartet → orchestra change; the other way runs it backwards
// (the risers rise before the places change, so the orchestra's riser places never stand on a lowered riser)
// (the robot's bridge moves back behind the quartet's back wall first, so the walls never fly through it)
const PH = { bridge: [0, 1.5], canopy: [0.5, 7], walls: [1.5, 9], back: [3, 9], risers: [8.5, 13.5], dip: [13, 15], swap: 14, trusses: [17, 22] };
const FQ = [-14.5, -1.0], FC = [-13.4, -1.0];
const RET = 14.7;   // the fixed returns beside the opening run from the wall's skin out to this radius
const atAngle = (a, r) => [r * Math.sin(a), Z + r * Math.cos(a)];                // [x, z] on a circle about the studio's centre
const QL0 = atAngle(OPUS_WALL.a1 + 0.02, RET), QR0 = atAngle(OPUS_WALL.a0 - 0.02, RET), QB = -17.7, QL1 = [QB, 2.0], QR1 = [QB, -4.0];
const RISERS = [{ h: 0.3, r0: 4.7, r1: 5.85, w: 58 }, { h: 0.6, r0: 5.85, r1: 8.6, w: 46 }];
// (the quartet's bridge runs just over the walls' tops at the back of the room; the trusses at 8.8 m, clear of every
// wall's line and of the canopies' travel)
const WALL_H = 4.4, FLOWN = 5.4, CANOPY = { q: 4.2, c: 6.2, stored: 8.0 }, BRIDGE = { q: [-17.35, 4.6], c: [-18.2, 4.8] }, TRUSS_Y = 8.8;

/* ----- the places (plan.py: weighted arcs about a point in the doorway; x, z in the studio, y the riser) ----- */
const P_ = (inst, x, z, y = 0) => ({ inst, x, z, y });
export const CONFIGS = {
  quartet: {
    label: 'String quartet', face: FQ,
    places: [P_('First violin', -15.58, 0.313, 0.2), P_('Second violin', -16.102, -0.431, 0.2), P_('Viola', -16.162, -1.357, 0.2), P_('Cello', -15.655, -2.247, 0.2)],
    cams: { OV1: [[-14.9, 1.55, 1.4], [-15.7, 1.0, -1.3], 40], OV2: [[-14.3, 1.55, -3.7], [-15.7, 1.0, -0.6], 40], OV3: [[-13.05, 1.5, -1.15], [-15.9, 1.0, -1.0], 42] },
    view: { from: [-12.2, 1.6, -1.1], at: [-15.9, 1.0, -1.0] },
    // OV4's programme: [s, carriage across (z), wrist, look at]: over the first violin, high over the four, over the
    // cello, over them to the grand, low on the second violin and viola
    moves: [[1.2, 0.3, [-16.5, 2.4, 0.4], [-15.0, 1.0, -0.6]], [1.4, -1.0, [-16.2, 3.0, -1.0], [-15.4, 0.6, -1.0]], [1.1, -2.3, [-16.5, 2.3, -2.4], [-15.1, 1.0, -1.4]],
      [1.5, -1.0, [-16.9, 2.4, -1.0], [-9.0, 1.0, -0.8]], [1.2, -0.4, [-16.5, 2.1, -0.6], [-15.6, 0.9, -1.6]]],
    top: 3.2,
  },
  chamber: {
    label: 'Chamber orchestra', face: FC,
    places: [
      P_('First violin', -14.884, 1.607), P_('First violin', -15.642, 0.993), P_('First violin', -16.163, 0.168), P_('Second violin', -16.392, -0.78), P_('Viola', -16.299, -1.771), P_('Cello', -15.83, -2.76), P_('Cello', -14.97, -3.557),
      P_('First violin', -15.337, 2.727), P_('First violin', -16.225, 2.108), P_('Second violin', -16.926, 1.282), P_('Second violin', -17.392, 0.304), P_('Second violin', -17.593, -0.76), P_('Viola', -17.511, -1.86), P_('Viola', -17.136, -2.918), P_('Cello', -16.44, -3.898), P_('Cello', -15.425, -4.68),
      P_('Flute', -17.203, 2.833, 0.3), P_('Oboe', -17.926, 1.946, 0.3), P_('Clarinet', -18.445, 0.926, 0.3), P_('Bassoon', -18.745, -0.229, 0.3), P_('Trumpet', -18.783, -1.423, 0.3), P_('Trumpet', -18.573, -2.548, 0.3), P_('Double bass', -18.082, -3.69, 0.3), P_('Double bass', -17.274, -4.762, 0.3),
      P_('French horn', -19.038, 3.478, 0.6), P_('French horn', -19.664, 2.55, 0.6), P_('Timpani', -20.582, -0.498, 0.6), P_('Percussion', -20.248, -3.225, 0.6),
    ],
    cams: { OV1: [[-15.2, 2.8, 3.9], [-17.8, 0.9, -2.2], 55], OV2: [[-13.9, 2.8, -5.6], [-17.8, 0.9, 0.6], 55], OV3: [[-12.9, 2.4, -1.15], [-18.0, 1.0, -1.0], 58] },
    view: { from: [-12.0, 2.3, -1.1], at: [-17.6, 1.0, -1.0] },
    // over the first violins, high over the whole orchestra, the cellos and basses, back to the timpani, low on the winds
    moves: [[1.2, 2.0, [-17.0, 2.8, 2.2], [-15.2, 0.8, 1.6]], [1.4, -1.0, [-17.2, 3.5, -1.0], [-15.0, 0.4, -1.0]], [1.1, -3.5, [-17.0, 2.8, -3.6], [-15.8, 0.8, -3.4]],
      [1.5, -0.6, [-18.6, 2.6, -0.6], [-20.4, 1.2, -0.5]], [1.2, 1.0, [-18.4, 2.2, 1.0], [-18.6, 0.9, 0.3]]],
    top: 2.6,
  },
};
const STOOL = new Set(['Double bass', 'Timpani', 'Percussion']), NO_STAND = new Set(['Timpani', 'Percussion']);
// the instruments built for the room (opus-instruments.js), by place: [what, x, z (m, in the place's frame: +z towards
// the point the place faces), turn]
export const BUILT = {
  Timpani: [['timpani', 0, 0.62]],
  Percussion: [['trapTable', 0, 0.7], ['bassDrum', 1.35, 0.35, 0.2], ['triangle', 0.55, 1.15], ['cymbals', -0.95, 0.55, 0.3]],
  Bassoon: [['bassoon', 0.5, 0.12]],
};
// the licensed models still to be downloaded (production/opus-v/models): their places keep an empty slot
export const AWAITING = { 'First violin': 'Violin', 'Second violin': 'Violin', Viola: 'Viola', Cello: 'Cello', 'Double bass': 'Double bass', Flute: 'Flute', Oboe: 'Oboe', Clarinet: 'Clarinet', 'French horn': 'French horn', Trumpet: 'Trumpet', Percussion: 'Snare drum' };
export const OPUS_PLACES = CONFIGS.quartet.places.map(p => [p.x, p.z]);
export const QUARTET = CONFIGS.quartet.places.map(p => p.inst);

export function buildOrchestra({ M, scene }) {
  // the wall's own frame (for the leaves): at the opening's middle, +z out of the studio
  const a = OPUS_WALL.a, g = new THREE.Group(); g.name = 'opus-v-wall';
  g.position.set(R * Math.sin(a), 0, Z + R * Math.cos(a)); g.rotation.y = a; scene.add(g);
  const room = new THREE.Group(); room.name = 'opus-v-room'; room.visible = false; scene.add(room);   // the annex, in the studio's own coordinates
  const add = (geo, mat, x, y, z, parent = room) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  const ss = THREE.MathUtils.smoothstep, lerp = THREE.MathUtils.lerp, clamp = THREE.MathUtils.clamp;
  const dark = M.graphite || M.fin;

  /* ----- the leaves: the wall's own skin, fins and light lines on four leaves ----- */
  const skin = M.wallBack.clone(); skin.side = THREE.DoubleSide;
  const stripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xf2a650).multiplyScalar(1.6), toneMapped: false });
  const leafW = OPEN / 4, leaves = [];
  const A0 = Math.PI - 1.95, finAt = [], stripAt = [];   // the studio's fin grid, as set.js lays it
  for (let f = A0; f <= Math.PI + 1.95; f += FIN_STEP) { if (f > OPUS_WALL.a0 - 0.01 && f < OPUS_WALL.a1 + 0.01) finAt.push(f); if (f + 0.0375 > OPUS_WALL.a0 && f + 0.0375 < OPUS_WALL.a1) stripAt.push(f + 0.0375); }
  for (let i = 0; i < 4; i++) {
    const cx = -OPEN / 2 + (i + 0.5) * leafW, p = new THREE.Group(); g.add(p); p.position.set(cx, 0, 0); p.userData.cx = cx;
    const da = Math.asin(cx / SKIN); add(new THREE.BoxGeometry(leafW + 0.02, OH, 0.05), skin, 0, OH / 2, SKIN * Math.cos(da) - R, p).rotation.y = da;
    const mine = x => Math.max(0, Math.min(3, Math.floor((x + OPEN / 2) / leafW))) === i;   // each fin and line on its nearest leaf
    for (const f of finAt) { const x = R * Math.sin(f - a); if (mine(x)) add(new THREE.BoxGeometry(0.16, OH, 0.7), M.fin, x - cx, OH / 2, R * Math.cos(f - a) - R, p).rotation.y = f - a; }
    for (const f of stripAt) { const x = (R + 0.3) * Math.sin(f - a); if (mine(x)) { const s = add(new THREE.BoxGeometry(0.025, OH - 0.7, 0.025), stripMat, x - cx, 0.7 + (OH - 0.7) / 2, (R + 0.3) * Math.cos(f - a) - R, p); s.castShadow = false; } }
    leaves.push(p);
  }

  /* ----- the annex: oak stage floor, fabric side walls with oak diffusers, the back wall of fins with amber LED strips,
     the wall's inner face round the opening (its skin is drawn only from the studio side), the fixed returns ----- */
  const oak = new THREE.MeshPhysicalMaterial({ color: 0x2a1f17, roughness: 0.42, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.3 });
  const fabric = new THREE.MeshStandardMaterial({ color: 0x17171b, roughness: 0.96, metalness: 0 });
  const shellMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.55, metalness: 0 });   // the quartet room's warm acoustic panels
  const amber = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });                    // LED strips and edges (levelled per frame)
  const thAt = z => 2 * Math.PI - Math.acos((z - Z) / (SKIN + 0.05));                                   // the wall's angle at a given z (Vienna side)
  const th0 = thAt(ANNEX.z0), th1 = thAt(ANNEX.z1);
  const floor = new THREE.Shape(); floor.moveTo(ANNEX.x0, -ANNEX.z0); floor.lineTo(ANNEX.x0, -ANNEX.z1);   // (shape y = −z)
  for (let i = 0; i <= 32; i++) { const th = th1 + (th0 - th1) * i / 32; floor.lineTo(SKIN * Math.sin(th), -(Z + SKIN * Math.cos(th))); }
  const slab = d => new THREE.ExtrudeGeometry(floor, { depth: d, bevelEnabled: false, curveSegments: 1 }).rotateX(-Math.PI / 2);
  add(slab(0.05), oak, 0, -0.046, 0);                       // its top 4 mm over the studio's floor, which runs on under it
  add(slab(0.08), fabric, 0, ANNEX.h, 0);
  add(new THREE.BoxGeometry(0.1, ANNEX.h, ANNEX.z1 - ANNEX.z0), fabric, ANNEX.x0 + 0.05, ANNEX.h / 2, (ANNEX.z0 + ANNEX.z1) / 2);
  for (const z of [ANNEX.z0 + 0.05, ANNEX.z1 - 0.05]) {
    const x1 = -Math.sqrt(SKIN * SKIN - (z - Z) ** 2);
    add(new THREE.BoxGeometry(x1 - ANNEX.x0, ANNEX.h, 0.1), fabric, (ANNEX.x0 + x1) / 2, ANNEX.h / 2, z);
    for (let n = 0; n < 12; n++) add(new THREE.BoxGeometry(0.08, 0.6 + (n % 3) * 0.3, 0.06), oak, -14.0 - n * 0.62, 2.6, z + (z > 0 ? -0.08 : 0.08));   // oak diffusers
  }
  const ring = (t0, t1, y0, y1) => add(new THREE.CylinderGeometry(SKIN + 0.05, SKIN + 0.05, y1 - y0, 32, 1, true, t0, t1 - t0), fabric, 0, (y0 + y1) / 2, Z);
  ring(th0, OPUS_WALL.a0, 0, ANNEX.h); ring(OPUS_WALL.a1, th1, 0, ANNEX.h); ring(OPUS_WALL.a0, OPUS_WALL.a1, OH, ANNEX.h);
  for (const th of [OPUS_WALL.a1 + 0.02, OPUS_WALL.a0 - 0.02]) {   // the fixed returns beside the opening
    const [x0, z0] = atAngle(th, SKIN + 0.05), [x1, z1] = atAngle(th, RET);
    add(new THREE.BoxGeometry(0.16, WALL_H, Math.hypot(x1 - x0, z1 - z0)), shellMat, (x0 + x1) / 2, WALL_H / 2, (z0 + z1) / 2).rotation.y = Math.atan2(x1 - x0, z1 - z0);
  }
  // the back wall, as the annex had it: dark fins with amber LED strips between them
  for (let z = ZR + 0.4; z <= ZL - 0.39; z += 0.6) {
    add(new RoundedBoxGeometry(0.28, 7.2, 0.12, 2, 0.02), M.fin, XB + 0.14, 0.8 + 3.6, z);
    add(new THREE.BoxGeometry(0.02, 6.8, 0.03), amber, XB + 0.05, 0.8 + 3.6, z + 0.3).castShadow = false;
  }

  /* ----- the machinery: the quartet room's flown walls, the two canopy panels, the risers (lifts), the light trusses,
     the OV4 camera bridge ----- */
  const wallPanel = (p0, p1) => {   // a flown wall from p0 to p1 ([x, z]); its slatted face on the side to its left
    const w = new THREE.Group(), len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]); room.add(w);
    const inner = new THREE.Group(); w.add(inner); inner.position.set((p0[0] + p1[0]) / 2, 0, (p0[1] + p1[1]) / 2); inner.rotation.y = Math.atan2(p1[0] - p0[0], p1[1] - p0[1]) - Math.PI / 2;
    add(new THREE.BoxGeometry(len, WALL_H, 0.2), shellMat, 0, WALL_H / 2, 0, inner);
    for (let n = 0; n < Math.floor(len / 0.45); n++) add(new THREE.BoxGeometry(0.06, WALL_H - 0.6, 0.06), oak, -len / 2 + 0.25 + n * 0.45, WALL_H / 2, 0.12, inner).castShadow = false;   // oak slats
    add(new THREE.BoxGeometry(len, 0.02, 0.03), amber, 0, WALL_H - 0.15, 0.13, inner).castShadow = false;                                                       // a warm cove line
    for (const y of [0.03, WALL_H]) add(new THREE.BoxGeometry(len, 0.06, 0.24), dark, 0, y, 0, inner);
    return w;
  };
  // (walked round the quartet room: left wall front to back, back wall left to right, right wall back to front)
  const qWalls = [wallPanel(QL0, QL1), wallPanel(QL1, QR1), wallPanel(QR1, QR0)];
  const canopyPanel = (w, d) => {
    const c = new THREE.Group(); room.add(c);
    add(new RoundedBoxGeometry(d, 0.12, w, 2, 0.03), shellMat, 0, 0, 0, c);
    const dl = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false }); c.userData.dl = dl;   // its downlights
    for (let i = 0; i < Math.floor(d / 0.9); i++) for (let j = 0; j < Math.floor(w / 0.9); j++) add(new THREE.CylinderGeometry(0.06, 0.06, 0.01, 16), dl, -d / 2 + 0.45 + i * 0.9, -0.065, -w / 2 + 0.45 + j * 0.9, c).castShadow = false;
    return c;
  };
  const canF = canopyPanel(5.2, 2.3), canB = canopyPanel(10.2, 3.5);
  canF.position.set(-15.85, CANOPY.q, -1.0); canB.position.set(-19.75, CANOPY.stored, -1.0);
  // the risers: ring sectors about the orchestra's centre, clipped to the room, each with its amber front edge;
  // lowered, their tops sit just under the stage floor
  const risers = RISERS.map(({ h, r0, r1, w }) => {
    const s = new THREE.Shape(), t0 = THREE.MathUtils.degToRad(w), pts = [];
    for (let i = 0; i <= 40; i++) { const th = t0 - 2 * t0 * i / 40; pts.push([Math.max(FC[0] - r0 * Math.cos(th), XB + 0.3), clamp(FC[1] + r0 * Math.sin(th), ZR + 0.02, ZL - 0.02)]); }
    for (let i = 0; i <= 40; i++) { const th = -t0 + 2 * t0 * i / 40; pts.push([Math.max(FC[0] - r1 * Math.cos(th), XB + 0.3), clamp(FC[1] + r1 * Math.sin(th), ZR + 0.02, ZL - 0.02)]); }
    pts.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z)));
    const r = new THREE.Group(); room.add(r);
    add(new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false }).rotateX(-Math.PI / 2), oak, 0, 0, 0, r);
    const edge = new THREE.CatmullRomCurve3(pts.slice(0, 41).map(([x, z]) => new THREE.Vector3(x, h + 0.006, z)));
    add(new THREE.TubeGeometry(edge, 80, 0.006, 6), amber, 0, 0, 0, r).castShadow = false;
    r.userData.h = h; r.position.y = -h - 0.01; return r;
  });
  // the light trusses at 8.8 m, each with a row of profile spots whose lenses light up in turn: the front one between the
  // quartet room's side walls' lines, the two others behind its back wall's line
  const lens = [];
  [[-15.4, -4.35, 2.5], [-19.0, ZR + 0.3, ZL - 0.3], [-21.0, ZR + 0.3, ZL - 0.3]].forEach(([x, z0, z1]) => {
    add(new THREE.BoxGeometry(0.3, 0.3, z1 - z0), dark, x, TRUSS_Y, (z0 + z1) / 2);
    const L = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false }); lens.push(L);
    for (let z = z0 + 0.5; z < z1 - 0.3; z += 1.1) { add(new THREE.CylinderGeometry(0.1, 0.12, 0.34, 16), dark, x, TRUSS_Y - 0.3, z); add(new THREE.CircleGeometry(0.085, 16).rotateX(Math.PI / 2), L, x, TRUSS_Y - 0.48, z).castShadow = false; }
  });
  // OV4: the overhead camera bridge across the room on the side walls' rails; the robot hangs from it, its track along it
  const bridge = new THREE.Group(); room.add(bridge); bridge.position.set(BRIDGE.q[0], BRIDGE.q[1], -1.0);
  add(new THREE.BoxGeometry(0.34, 0.26, ZL - ZR - 0.4), dark, 0, 0.13, 0, bridge);
  for (const z of [ZR + 0.25, ZL - 0.25]) add(new THREE.BoxGeometry(0.4, 0.3, 0.3), dark, 0, 0.15, z + 1.0, bridge);
  const hang = new THREE.Group(); hang.rotation.x = Math.PI; bridge.add(hang);   // upside down: its local x runs along +z
  const robotMoves = CONFIGS.quartet.moves.map(mv => [mv[0], 0, [0, 0, 0], [0, 0, 0]]);
  let robot = null;
  try {
    robot = cineRobot(M, { moves: robotMoves, at: [0, 0, 0], rotY: Math.PI / 2, rail: 6.0, parkX: 2.6, park: [-16.0, 1.0, -1.0] });
    robot.group.userData.equipment = '4K camera robot · OPUS V bridge'; hang.add(robot.group);
  } catch (e) { console.error('OPUS V robot:', e); robot = null; }
  // the room's security camera, high in the back corner on the audience's left
  const recAnim = [], CCTV_AT = [XB + 0.25, 6.0, ZL - 0.25], CCTV_AIM = [-15.5, 0.5, -2.0];
  const sec = securityCam(M, recAnim); sec.position.set(...CCTV_AT); room.add(sec); sec.lookAt(...CCTV_AIM);

  /* ----- the two configurations' places: chairs (stools), stands with their lights, pinspot pools, the quartet's low
     platform, the instruments built for the room; merged per material, one set per configuration ----- */
  const leather = M.leather || fabric, chrome = M.chrome || M.brushed, graphite = M.graphite || chrome;
  const standLight = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
  const poolTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,226,180,1)'); gr.addColorStop(0.5, 'rgba(255,226,180,0.45)'); gr.addColorStop(1, 'rgba(255,226,180,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
  const pool = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0x000000 });
  const PR = proposals(), INST = { timpani: PR.timpani, bassDrum: PR.bassDrum, cymbals: PR.cymbals, triangle: PR.triangle, trapTable: PR.trapTable, bassoon: PR.bassoon }, Y = new THREE.Vector3(0, 1, 0);
  const sets = {};
  for (const [name, C] of Object.entries(CONFIGS)) {
    const set = new THREE.Group(); set.name = 'opus-v-' + name; set.visible = false; room.add(set);
    const tmp = new THREE.Group(), put = (geo, mat, x, y, z, parent) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); parent.add(o); return o; };
    if (name === 'quartet') {   // the quartet's low platform, with its amber edge
      put(new RoundedBoxGeometry(2.7, 0.2, 4.4, 2, 0.02), oak, -15.75, 0.1, -1.0, tmp);
      put(new THREE.BoxGeometry(0.012, 0.012, 4.4), amber, -14.4, 0.206, -1.0, tmp);
    }
    const slots = [];
    for (const p of C.places) {
      const c = new THREE.Group(); c.position.set(p.x, p.y, p.z); tmp.add(c);
      c.rotation.y = Math.atan2(C.face[0] - p.x, C.face[1] - p.z);   // (+z of the place: to the point it faces)
      if (STOOL.has(p.inst)) {   // a tall stool with a footring
        put(new THREE.CylinderGeometry(0.19, 0.19, 0.06, 24), leather, 0, 0.74, 0, c);
        put(new THREE.CylinderGeometry(0.02, 0.025, 0.72, 12), chrome, 0, 0.36, 0, c);
        put(new THREE.CylinderGeometry(0.2, 0.22, 0.02, 24), graphite, 0, 0.01, 0, c);
        put(new THREE.TorusGeometry(0.16, 0.008, 6, 24).rotateX(Math.PI / 2), chrome, 0, 0.3, 0, c);
      } else {                   // a black concert chair on chrome legs
        put(new RoundedBoxGeometry(0.46, 0.06, 0.44, 2, 0.02), leather, 0, 0.48, 0, c);
        put(new RoundedBoxGeometry(0.44, 0.42, 0.05, 2, 0.02), leather, 0, 0.78, -0.2, c).rotation.x = -0.12;
        for (const [lx, lz] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) put(new THREE.CylinderGeometry(0.012, 0.012, 0.46, 10), chrome, lx, 0.23, lz, c);
      }
      if (!NO_STAND.has(p.inst)) {   // a professional music stand turned to the player, with its light
        const s = new THREE.Group(); s.position.set(0, 0, STOOL.has(p.inst) ? 0.78 : 0.62); c.add(s);
        put(new THREE.CylinderGeometry(0.012, 0.014, 1.05, 12), chrome, 0, 0.53, 0, s);
        for (let n = 0; n < 3; n++) { const leg = put(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 8), chrome, Math.cos(n * 2.09) * 0.14, 0.06, Math.sin(n * 2.09) * 0.14, s); leg.rotation.set(Math.sin(n * 2.09) * 1.2, 0, -Math.cos(n * 2.09) * 1.2); }
        put(new RoundedBoxGeometry(0.52, 0.36, 0.015, 2, 0.006), graphite, 0, 1.12, 0, s).rotation.x = 0.35;
        put(new THREE.BoxGeometry(0.5, 0.02, 0.04), graphite, 0, 0.95, -0.06, s);
        put(new THREE.BoxGeometry(0.16, 0.015, 0.03), standLight, 0, 1.3, -0.08, s);
      }
      put(new THREE.PlaneGeometry(1.25, 1.25).rotateX(-Math.PI / 2), pool, 0, 0.01, 0.15, c);   // the pinspot's pool
      const slot = new THREE.Object3D(); slot.position.copy(c.position); slot.rotation.y = c.rotation.y;
      slot.userData = { inst: p.inst, model: BUILT[p.inst] && !AWAITING[p.inst] ? 'built' : AWAITING[p.inst] ? 'awaiting: ' + AWAITING[p.inst] : 'built' };
      set.add(slot); slots.push(slot);
      for (const [what, x, z, turn = 0] of BUILT[p.inst] || []) {
        const o = INST[what](); o.position.set(x, 0, z).applyAxisAngle(Y, c.rotation.y).add(c.position); o.rotation.y = c.rotation.y + Math.PI + turn; tmp.add(o);
      }
    }
    // merged: one mesh per material
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
      const o = new THREE.Mesh(mergeGeometries(geos, false), mat); set.add(o);
      const lit = mat !== standLight && mat !== pool && mat !== amber; o.castShadow = lit; o.receiveShadow = lit;
      if (mat === pool) o.renderOrder = 1;
    }
    sets[name] = { group: set, slots };
  }

  /* ----- light: a warm area light under each canopy panel (the front one over the quartet, both for the orchestra),
     an amber wash on the back wall's fins, the downlights, the pinspots' pools, the stand lights, the trusses' lenses;
     CLEANING MODE: white work light ----- */
  const topF = new THREE.RectAreaLight(0xffe7c8, 0, 4.6, 2.0); topF.rotation.x = -Math.PI / 2; topF.position.y = -0.08; canF.add(topF);
  const topB = new THREE.RectAreaLight(0xffe7c8, 0, 9.2, 3.0); topB.rotation.x = -Math.PI / 2; topB.position.y = -0.08; canB.add(topB);
  const wash = new THREE.RectAreaLight(0xf2a650, 0, ZL - ZR - 0.6, 6.0); wash.position.set(-15.0, 4.2, -1.0); room.add(wash); wash.lookAt(XB, 4.2, -1.0);
  const WORK = new THREE.Color(0xf4f2ee), WARM = new THREE.Color(0xffe7c8);

  /* ----- state ----- */
  let k = 0, target = 0;                 // the wall: 0 closed … 1 open
  let m = 0, mTo = 0;                    // the room: 0 quartet … 1 orchestra (the change runs along T)
  let config = 'quartet', shown = null, t = 0, cine = false;
  const listeners = [];
  const ph = (u, [a0, a1]) => ss(u * T, a0, a1);
  function show(name) {   // the places and the robot's programme of one configuration (the cameras follow: onConfig)
    shown = name;
    for (const [n, s] of Object.entries(sets)) s.group.visible = n === name;
    CONFIGS[name].moves.forEach((mv, i) => { robotMoves[i][0] = mv[0]; robotMoves[i][1] = mv[1] + 1.0; robotMoves[i][2] = mv[2].slice(); robotMoves[i][3] = mv[3].slice(); });
    for (const f of listeners) f(name);
  }
  const camOf = (key, name = config) => {
    if (key === 'CCTV') { const at = new THREE.Vector3(...CCTV_AIM), from = new THREE.Vector3(...CCTV_AT); return { pos: at.clone().sub(from).setLength(0.3).add(from), target: at, fov: 80 }; }
    const c = CONFIGS[name].cams[key]; return c && { pos: new THREE.Vector3(...c[0]), target: new THREE.Vector3(...c[1]), fov: c[2] };
  };
  // the transformation shot: from the doorway, rising as a crane over the stage while it changes, settling over it
  const xfShot = { pos: new THREE.Vector3(-12.4, 1.8, -1.1), target: new THREE.Vector3(-15.8, 1.2, -1.0) };
  const xfPos = new THREE.CatmullRomCurve3([[-12.4, 1.8, -1.1], [-13.0, 3.4, -0.4], [-13.2, 5.0, -1.0], [-13.0, 3.6, -1.6]].map(p => new THREE.Vector3(...p)));
  const xfLook = new THREE.CatmullRomCurve3([[-15.8, 1.2, -1.0], [-17.0, 1.0, -0.8], [-18.4, 0.6, -1.0], [-18.0, 1.0, -1.0]].map(p => new THREE.Vector3(...p)));
  const toLeaf = v => g.worldToLocal(new THREE.Vector3(...v));   // the world in the wall's own frame
  show(config);

  return {
    group: room, wall: g, CONFIGS, sets,
    get robot() { return robot; },
    get open() { return k; }, get target() { return target; },
    setOpen(on) { target = on ? 1 : 0; }, toggle() { target = target ? 0 : 1; },
    get config() { return config; }, get label() { return CONFIGS[config].label; },
    get progress() { return m; }, get changing() { return m !== mTo; }, get cinematic() { return cine; },
    // the change: cinematic (T s, with its shot) or immediate; while the wall is closed it is always immediate
    setConfig(name, { instant = false } = {}) {
      if (!CONFIGS[name]) return; config = name; mTo = name === 'chamber' ? 1 : 0;
      cine = !instant && k > 0.01 && m !== mTo;
      if (!cine) m = mTo;
    },
    onConfig(f) { listeners.push(f); },
    places: name => CONFIGS[name || config].places.map(p => p.inst),
    slots: name => sets[name || config].slots,
    // the instruments still missing: their licensed models wait for their files
    missing: name => [...new Set(CONFIGS[name || config].places.filter(p => AWAITING[p.inst]).map(p => AWAITING[p.inst]))],
    camera: camOf, xfShot,
    // where spaces.js's cinematic move into the room ends, in the wall's own frame
    get view() { const v = CONFIGS[config].view; return { from: toLeaf(v.from), at: toLeaf(v.at) }; },
    toWorld(v) { return g.localToWorld(v.clone()); },
    // the director keeps a camera in the room, or in the doorway while it is open; in the quartet room, inside its walls
    has(p) {
      if (p.y > ANNEX.h + 0.5 || p.x < ANNEX.x0 - 0.3 || p.z < ANNEX.z0 - 0.3 || p.z > ANNEX.z1 + 0.3) return false;
      const r = Math.hypot(p.x, p.z - Z);
      if (r > SKIN + 0.1) return true;
      const th = Math.atan2(p.x, p.z - Z) + 2 * Math.PI;
      return k > 0.5 && p.y < OH && th > OPUS_WALL.a0 + 0.02 && th < OPUS_WALL.a1 - 0.02 && r > R - 1.6;   // the doorway
    },
    keep(p) {
      const r = Math.hypot(p.x, p.z - Z);
      if (r <= SKIN + 0.1) { p.y = clamp(p.y, 0.35, OH - 0.3); return; }   // the doorway: under its head
      p.x = Math.max(p.x, XB + 0.3); p.z = clamp(p.z, ZR + 0.3, ZL - 0.3); p.y = clamp(p.y, 0.35, ANNEX.h - 0.6);
      if (m < 0.05 && p.y < WALL_H) {   // the quartet room's walls are in
        p.x = Math.max(p.x, QB + 0.35);
        const u = clamp((p.x - QL0[0]) / (QL1[0] - QL0[0]), 0, 1), v = clamp((p.x - QR0[0]) / (QR1[0] - QR0[0]), 0, 1);
        p.z = clamp(p.z, lerp(QR0[1], QR1[1], v) + 0.35, lerp(QL0[1], QL1[1], u) - 0.35);
      }
    },
    update(dt, work = 0) {
      t += dt;
      // the wall: 7 s, the leaves 1 m back, then up 4.2 m behind the wall over the opening
      k = clamp(k + Math.sign(target - k) * dt / 7, 0, 1);
      const back = ss(k, 0, 0.3), up = ss(k, 0.25, 1);
      for (const p of leaves) p.position.set(p.userData.cx, up * 4.2, back * 1.0);
      room.visible = k > 0.001;
      // the room's change
      if (m !== mTo) { m = clamp(m + Math.sign(mTo - m) * dt / T, 0, 1); if (Math.abs(m - mTo) < 1e-6) m = mTo; }
      const want = m >= PH.swap / T ? 'chamber' : 'quartet';
      if (want !== shown) show(want);
      const dip = 1 - Math.sin(Math.PI * clamp((m * T - PH.dip[0]) / (PH.dip[1] - PH.dip[0]), 0, 1));   // 1 … 0 (the swap) … 1
      canF.position.y = lerp(CANOPY.q, CANOPY.c, ph(m, PH.canopy));
      canB.position.y = lerp(CANOPY.stored, CANOPY.c, ph(m, PH.back));
      const wy = lerp(0, FLOWN, ph(m, PH.walls)); for (const w of qWalls) w.position.y = wy;
      for (const r of risers) r.position.y = lerp(-r.userData.h - 0.01, 0, ph(m, PH.risers));
      const b = ph(m, PH.bridge); bridge.position.set(lerp(BRIDGE.q[0], BRIDGE.c[0], b), lerp(BRIDGE.q[1], BRIDGE.c[1], b), -1.0);
      // the lights
      const w = Math.min(1, work), on = k > 0.01 ? 1 : 0, wall = ss(k, 0.3, 0.7), spots = ss(k, 0.5, 0.9) * dip, stands = ss(k, 0.7, 1) * dip, tr = ph(m, PH.trusses);
      amber.color.setRGB(0.95, 0.6, 0.25).multiplyScalar(1.7 * wall);
      wash.intensity = (0.5 + 1.3 * ph(m, PH.walls)) * wall * (1 - w * 0.5);
      const topK = lerp(CONFIGS.quartet.top, CONFIGS.chamber.top, ph(m, PH.canopy));
      for (const [L, kk] of [[topF, 1], [topB, ph(m, PH.back)]]) { L.color.copy(WARM).lerp(WORK, Math.min(1, work * 3)); L.intensity = (topK * spots * (1 - w) + 4.2 * work * on) * kk; }
      for (const c of [canF, canB]) c.userData.dl.color.setRGB(1, 0.86, 0.66).multiplyScalar(1.2 * spots * (1 - w) + 1.5 * w * on);
      lens.forEach((L, i) => L.color.setRGB(1, 0.9, 0.75).multiplyScalar(((1 - w) * 2.2 * ss(tr * 3 - i, 0, 1) + w * 1.6) * wall));   // section by section
      pool.color.setScalar(0.55 * spots * (1 - w));
      standLight.color.setRGB(1, 0.9, 0.75).multiplyScalar(1.4 * stands);
      // the transformation shot follows the change
      if (cine) { const u = clamp(mTo ? m : 1 - m, 0, 1); xfPos.getPointAt(u, xfShot.pos); xfLook.getPointAt(u, xfShot.target); if (m === mTo) cine = false; }
      if (room.visible) {
        for (const f of recAnim) f(t);
        if (robot) try { robot.update(dt); } catch (e) { console.error('OPUS V robot:', e); robot = null; }
      }
      return k;
    },
  };
}
