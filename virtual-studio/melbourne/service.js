// THE STAFF WAY DOWN to the DJ Room (no lift needed): from the backstage lounge's Melbourne-side door, a spiral staircase
// in a glass-and-steel drum just outside the lounge (outside the studio's set and the club), 29 steps of 18 cm down
// to the club's level, a short service corridor, and automatic sliding glass doors into the club through its back wall
// at the Vienna end, away from the DJ booth. Everything here in world metres (the club's frame through layout.js).
//   route: the walking line (eye height over each step), for the first-person walk (spaces.js)
//   update(camPos, dt): the doors slide open as someone comes near (either side), and close again
//   setLevels(show, work): the stair's recessed LEDs (always on, brighter with the house lights) and the work lights
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ROOM, xyz } from './layout.js';

export const DRUM = { x: 5.0, z: -8.75, r: 1.2, walk: 0.7, steps: 29, rise: 0.18, a0: Math.PI, a1: 0.865 + 4 * Math.PI };
export const CLUB_DOOR = { along: -5.3, w: 1.24, h: 2.3 };   // (its jambs clear of the club's corner column, which ends at along −6.0)   // in the club's back wall (across −3.6)
const EYE = 1.65, F = ROOM.floor, BACK = ROOM.across - ROOM.d / 2;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const W = (al, ac, y) => V(...xyz(al, ac, y));

export function buildService({ M, scene, glass }) {
  const g = new THREE.Group(); g.name = 'service-way'; scene.add(g);
  const add = (geo, mat, p, parent = g) => { const m = new THREE.Mesh(geo, mat); if (p) m.position.copy(p); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  const concrete = new THREE.MeshStandardMaterial({ color: 0x24252a, roughness: 0.82, metalness: 0.05, side: THREE.DoubleSide });
  const tread = new THREE.MeshPhysicalMaterial({ color: 0x1a1b1f, roughness: 0.45, metalness: 0.4, clearcoat: 0.3, clearcoatRoughness: 0.4 });
  const steel = M.brushed, chrome = M.chrome || steel, nosing = M.champagne || steel;
  const lit = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });   // the step lights' lenses
  const work = [];   // work lights (CLEANING MODE)

  /* ----- the drum: a glass-and-steel cylinder above the floor (it stands behind the LED wall's Melbourne end), dark
     concrete below, a steel column in the middle, the spiral of treads, a helical handrail ----- */
  const { x: cx, z: cz, r: R } = DRUM, depth = DRUM.steps * DRUM.rise;
  const drumGlass = glass || new THREE.MeshPhysicalMaterial({ color: 0x9fb2c4, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
  add(new THREE.CylinderGeometry(R, R, 2.6, 64, 1, true), drumGlass, V(cx, 1.3, cz)).castShadow = false;
  for (const y of [0.02, 2.6]) add(new THREE.TorusGeometry(R, 0.03, 10, 96).rotateX(Math.PI / 2), steel, V(cx, y, cz));
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; add(new THREE.BoxGeometry(0.05, 2.6, 0.05), steel, V(cx + Math.cos(a) * R, 1.3, cz + Math.sin(a) * R)); }
  add(new THREE.CylinderGeometry(R + 0.04, R + 0.04, 0.06, 64), steel, V(cx, 2.63, cz));                               // the drum's lid
  // the shaft below: concrete, with the doorway to the corridor at the bottom (three.js measures a cylinder's angle
  // from +z: θ = π/2 − a for the direction (cos a, sin a))
  add(new THREE.CylinderGeometry(R, R, depth - 2.6, 64, 1, true), concrete, V(cx, -(depth - 2.6) / 2, cz));
  add(new THREE.CylinderGeometry(R, R, 2.6, 64, 1, true, Math.PI / 2 - DRUM.a1 + 0.55, Math.PI * 2 - 1.1), concrete, V(cx, -depth + 1.3, cz));
  add(new THREE.CircleGeometry(R, 64).rotateX(-Math.PI / 2), concrete, V(cx, -depth + 0.001, cz));
  add(new THREE.CylinderGeometry(0.1, 0.1, depth + 2.6, 24), steel, V(cx, (2.6 - depth) / 2, cz));                       // the column
  // the treads: wedges from the column to the wall, oak-dark steel with a champagne anti-slip nosing
  const da = (DRUM.a1 - DRUM.a0) / DRUM.steps, wedge = new THREE.Shape();
  wedge.moveTo(0.1, 0); wedge.lineTo(R - 0.03, -Math.tan(da / 2) * (R - 0.03)); wedge.lineTo(R - 0.03, Math.tan(da / 2) * (R - 0.03) * 1.05); wedge.lineTo(0.1, 0.02);
  const wedgeGeo = new THREE.ExtrudeGeometry(wedge, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2 }).rotateX(Math.PI / 2);
  const noseGeo = new THREE.BoxGeometry(R - 0.16, 0.012, 0.03);
  for (let i = 0; i < DRUM.steps; i++) {
    const a = DRUM.a0 + (i + 0.5) * da, y = -(i + 1) * DRUM.rise + DRUM.rise;   // step i's top
    const t = add(wedgeGeo, tread, V(cx, y, cz)); t.rotation.y = -a;
    const n = add(noseGeo, nosing, V(cx + Math.cos(a + da / 2) * (R / 2 + 0.05), y + 0.006, cz + Math.sin(a + da / 2) * (R / 2 + 0.05))); n.rotation.y = -(a + da / 2);
    // a recessed round LED in the wall beside every other step: a chrome rim and a soft white lens, low over the tread
    if (i % 2 === 0) {
      const la = a, lp = V(cx + Math.cos(la) * (R - 0.012), y + 0.28, cz + Math.sin(la) * (R - 0.012));
      const rim = add(new THREE.TorusGeometry(0.03, 0.006, 8, 32), chrome, lp); rim.lookAt(cx, lp.y, cz); rim.castShadow = false;
      const lens = add(new THREE.CircleGeometry(0.026, 24), lit, lp.clone().lerp(V(cx, lp.y, cz), 0.004)); lens.lookAt(cx, lp.y, cz); lens.castShadow = false;
    }
  }
  // the handrail: a helix on posts along the wall
  const helix = new THREE.CatmullRomCurve3(Array.from({ length: 80 }, (_, k) => { const f = k / 79, a = DRUM.a0 + f * (DRUM.a1 - DRUM.a0); return V(cx + Math.cos(a) * (R - 0.09), 0.95 - f * depth + DRUM.rise, cz + Math.sin(a) * (R - 0.09)); }));
  add(new THREE.TubeGeometry(helix, 320, 0.022, 10), steel);
  // the stair's own light: soft white from the step LEDs (three small lights carry it down the shaft), dimmed in the show
  const stairLights = [0.2, 0.5, 0.8].map(f => { const l = new THREE.PointLight(0xfff4e6, 0, 4.5, 2); l.position.set(cx, -f * depth + 1.2, cz); g.add(l); return l; });
  const shaftWork = new THREE.PointLight(0xf4f2ee, 0, 9, 2); shaftWork.position.set(cx, -depth / 2, cz); g.add(shaftWork); work.push([shaftWork, 30]);

  /* ----- the landing at the top (between the lounge's door and the drum) and the service corridor at the club's level ----- */
  add(new THREE.BoxGeometry(0.9, 0.04, 1.1), tread, V(3.95, 0.02, -8.25));
  const bottom = V(cx + Math.cos(DRUM.a1) * DRUM.walk, F, cz + Math.sin(DRUM.a1) * DRUM.walk);
  const turn = W(CLUB_DOOR.along, BACK - 1.4, F), door = W(CLUB_DOOR.along, BACK, F);
  const corridor = (a, b, w = 1.5, h = 2.6) => {
    const d = b.clone().sub(a), len = d.length(), mid = a.clone().lerp(b, 0.5), ry = Math.atan2(d.x, d.z);
    const c = new THREE.Group(); c.position.set(mid.x, F, mid.z); c.rotation.y = ry; g.add(c);
    add(new THREE.BoxGeometry(w, 0.05, len + w), tread, V(0, 0.025, 0), c);
    add(new THREE.BoxGeometry(w, 0.05, len + w), concrete, V(0, h, 0), c);
    for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.05, h, len + w), concrete, V(sx * w / 2, h / 2, 0), c);
    for (const sx of [-1, 1]) { const s = add(new THREE.BoxGeometry(0.02, 0.02, len + w - 0.2), new THREE.MeshBasicMaterial({ color: 0xf2e6d2, toneMapped: false }), V(sx * (w / 2 - 0.04), 0.08, 0), c); s.castShadow = false; }   // low LED lines
    const l = new THREE.RectAreaLight(0xf4f2ee, 0, w - 0.2, len), lp = V(mid.x, F + h - 0.03, mid.z); l.position.copy(lp); l.lookAt(lp.x, F, lp.z); l.rotation.z = -ry; g.add(l); work.push([l, 3.5]);
    return c;
  };
  corridor(bottom, turn); corridor(turn, door.clone().lerp(turn, 0.5));

  /* ----- the automatic sliding glass doors in the club's back wall: two safety-glass leaves in slim steel frames, a
     header with the drive, sliding along the wall; a green EXIT sign over them on the club's side ----- */
  const dg = new THREE.Group(); dg.position.copy(door); dg.lookAt(W(CLUB_DOOR.along, BACK + 1, F)); g.add(dg);   // local +z: into the club
  const { w: DW, h: DH } = CLUB_DOOR;
  const pane = new THREE.MeshPhysicalMaterial({ color: 0xcfe0ec, metalness: 0, roughness: 0.03, transmission: 0, transparent: true, opacity: 0.18, clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false });
  add(new RoundedBoxGeometry(DW + 0.24, 0.22, 0.2, 2, 0.02), steel, V(0, DH + 0.11, 0), dg);                            // the header and its drive
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.06, DH, 0.12), steel, V(sx * (DW / 2 + 0.06), DH / 2, 0), dg);   // the jambs
  const leaves = [-1, 1].map(sx => {
    const l = new THREE.Group(); l.position.set(sx * DW / 4, 0, 0); dg.add(l);
    add(new THREE.BoxGeometry(DW / 2 - 0.02, DH - 0.04, 0.012), pane, V(0, DH / 2, 0), l).castShadow = false;
    for (const [w, h, x, y] of [[DW / 2, 0.04, 0, 0.02], [DW / 2, 0.04, 0, DH - 0.02], [0.03, DH, -sx * (DW / 4 - 0.015), DH / 2], [0.03, DH, sx * (DW / 4 - 0.015), DH / 2]]) add(new THREE.BoxGeometry(w, h, 0.03), steel, V(x, y, 0), l);
    return { l, sx };
  });
  const exitFace = new THREE.MeshBasicMaterial({ map: exitTexture(), toneMapped: false, color: new THREE.Color(0.08, 0.08, 0.08) });
  add(new THREE.BoxGeometry(0.4, 0.17, 0.05), new THREE.MeshStandardMaterial({ color: 0xd8dadd, roughness: 0.5 }), V(0, DH + 0.42, 0.12), dg);
  add(new THREE.PlaneGeometry(0.38, 0.15), exitFace, V(0, DH + 0.42, 0.146), dg).castShadow = false;

  /* ----- the walking line: the lounge, its new door, the landing, down the spiral, the corridor, through the doors ----- */
  const route = [V(1.6, EYE, -8.6), V(3.5, EYE, -8.25), V(4.0, EYE, -8.4)];
  for (let i = 0; i <= DRUM.steps; i++) { const f = i / DRUM.steps, a = DRUM.a0 + f * (DRUM.a1 - DRUM.a0); route.push(V(cx + Math.cos(a) * DRUM.walk, EYE - i * DRUM.rise, cz + Math.sin(a) * DRUM.walk)); }
  route.push(turn.clone().setY(F + EYE), door.clone().setY(F + EYE), W(CLUB_DOOR.along, BACK + 1.6, F + EYE));

  let open = 0;
  return {
    group: g, route, door: dg,
    update(camPos, dt) {
      const near = camPos.distanceTo(V(door.x, F + 1.2, door.z)) < 2.6;
      open += ((near ? 1 : 0) - open) * Math.min(1, dt * 3);
      for (const { l, sx } of leaves) l.position.x = sx * (DW / 4 + open * (DW / 2 - 0.04));
      return open;
    },
    get open() { return open; },
    setLevels(exitK, workK) {
      for (const l of stairLights) l.intensity = 2.2 + 10 * workK;
      lit.color.setScalar(0.9 + 1.2 * workK);
      for (const [l, k] of work) l.intensity = k * workK;
      exitFace.color.setScalar(0.08 + 1.25 * exitK);
    },
  };
}

function exitTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 200; const x = c.getContext('2d');
  x.fillStyle = '#0a8f3c'; x.fillRect(0, 0, 512, 200); x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 8; x.strokeRect(10, 10, 492, 180);
  x.fillStyle = '#ffffff'; x.font = '700 96px Archivo, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('EXIT', 300, 104);
  x.beginPath(); x.moveTo(60, 100); x.lineTo(130, 60); x.lineTo(130, 140); x.closePath(); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
