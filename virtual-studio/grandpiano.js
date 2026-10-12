// A black concert grand piano for the Virtual Space, on the Melbourne side opposite the DJ booth.
// Built from real proportions (about 2.74 m long, 1.58 m wide, 88 keys), in piano lacquer with an open lid.
// Clicking it opens the Virtual Space's existing piano (the music station's Piano tab); there is no second piano.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const LEN = 2.74, W = 1.58, HALF = W / 2;
const RIM_LOW = 0.62, RIM_H = 0.34, RIM_TOP = RIM_LOW + RIM_H;   // the case sits on the legs; top of the rim ~0.96 m
const KEY_Y = 0.72;                                             // top of the white keys

// plan of the case seen from above: x across (player's left to right), y = depth from the keyboard to the tail
function casePlan(inset = 0, shape = new THREE.Shape()) {
  const i = inset, L = LEN - i, R = HALF - i, Lx = -HALF + i;
  shape.moveTo(Lx, i);
  shape.lineTo(R, i);
  shape.lineTo(R, 0.62);                                                  // treble side, straight
  shape.bezierCurveTo(R, 1.22, 0.2 - i * 0.5, 1.24, 0.12 - i * 0.6, 1.92);   // the bentside: the grand's S curve
  shape.bezierCurveTo(0.05 - i * 0.6, 2.5 - i, -0.16, L, -0.46, L);           // into the tail
  shape.quadraticCurveTo(Lx, L, Lx, L - 0.36);
  shape.closePath();                                                      // bass side, straight
  return shape;
}
// extrude a plan upwards: shape y becomes depth (-z, away from the keyboard), extrusion becomes height
const lift = (shape, height, opts = {}) => new THREE.ExtrudeGeometry(shape, { depth: height, curveSegments: 40, bevelEnabled: false, ...opts }).rotateX(-Math.PI / 2);

export function grandPiano(M) {
  const g = new THREE.Group();
  const lacquer = new THREE.MeshPhysicalMaterial({ color: 0x050506, metalness: 0, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.025, envMapIntensity: 0.9 });
  const satin = new THREE.MeshPhysicalMaterial({ color: 0x08080a, metalness: 0, roughness: 0.4, clearcoat: 0.4, clearcoatRoughness: 0.2 });
  const plateGold = new THREE.MeshStandardMaterial({ color: 0xb08d4f, metalness: 1, roughness: 0.32, envMapIntensity: 0.8 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a25e, metalness: 1, roughness: 0.22 });
  const spruce = new THREE.MeshStandardMaterial({ color: 0x9a7448, metalness: 0, roughness: 0.6 });
  const felt = new THREE.MeshStandardMaterial({ color: 0x4a0f12, roughness: 0.95 });
  const ivory = new THREE.MeshPhysicalMaterial({ color: 0xf1ede4, roughness: 0.32, clearcoat: 0.35, clearcoatRoughness: 0.25 });
  const ebony = new THREE.MeshPhysicalMaterial({ color: 0x0a0a0b, roughness: 0.28, clearcoat: 0.6, clearcoatRoughness: 0.12 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xd8dade, metalness: 1, roughness: 0.25 });
  const add = (geo, mat, x = 0, y = 0, z = 0, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };

  /* case: the rim (outer shell with the inside hollow), bottom, soundboard, iron plate, strings */
  const rimShape = casePlan(0); rimShape.holes.push(casePlan(0.055, new THREE.Path()));
  add(lift(rimShape, RIM_H, { bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 3 }), lacquer, 0, RIM_LOW, 0);
  add(lift(casePlan(0.01), 0.03), satin, 0, RIM_LOW, 0);                                  // bottom
  add(lift(casePlan(0.055), 0.012), spruce, 0, RIM_LOW + 0.16, 0);                        // soundboard
  const plate = casePlan(0.1);
  for (const [x, y, r] of [[-0.2, 1.1, 0.09], [0.12, 1.0, 0.08], [-0.36, 1.6, 0.075], [-0.05, 1.55, 0.07], [-0.3, 2.1, 0.06], [0.0, 0.62, 0.06]]) {
    const h = new THREE.Path(); h.absarc(x, y, r, 0, Math.PI * 2, true); plate.holes.push(h);      // the plate's round openings
  }
  add(lift(plate, 0.02), plateGold, 0, RIM_LOW + 0.2, 0);
  // strings: steel and copper-wound, fanning from the pin block to the tail
  const strings = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0012, 0.0012, 1, 4).rotateX(Math.PI / 2), steel, 120);
  const o = new THREE.Object3D();
  for (let i = 0; i < 120; i++) {
    const u = i / 119, x0 = -0.6 + u * 1.22, len = 2.2 - u * 1.25, x1 = x0 * 0.7 - 0.12 + u * 0.12;
    const a = new THREE.Vector3(x0, RIM_LOW + 0.235, -0.3), b = new THREE.Vector3(x1, RIM_LOW + 0.235, -0.3 - len);
    o.position.copy(a).lerp(b, 0.5); o.lookAt(b); o.scale.set(1, 1, a.distanceTo(b)); o.updateMatrix();
    strings.setMatrixAt(i, o.matrix);
  }
  g.add(strings);
  add(new THREE.BoxGeometry(1.32, 0.02, 0.06), felt, 0, RIM_LOW + 0.245, -0.28);            // damper felt line
  add(new THREE.BoxGeometry(1.36, 0.05, 0.14), plateGold, -0.02, RIM_LOW + 0.24, -0.16);    // pin block cover

  /* lid: hinged on the bass side, propped open towards the cameras; the front flap folded back on top */
  const hinge = new THREE.Group(); hinge.position.set(-HALF, RIM_TOP + 0.012, 0); g.add(hinge);
  const lidShape = casePlan(0); const lid = add(lift(lidShape, 0.026, { bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2 }), lacquer, HALF, 0, -0.42, hinge);
  lid.scale.z = (LEN - 0.42) / LEN;
  hinge.rotation.z = 0.58;                                                                  // about 33 degrees, the full stick
  const flap = add(new RoundedBoxGeometry(W - 0.02, 0.022, 0.4, 2, 0.008), lacquer, 0, RIM_TOP + 0.03, -0.21);
  flap.rotation.x = 0.02;
  // prop stick from the treble rim to the lid
  const stickBase = new THREE.Vector3(HALF - 0.06, RIM_TOP, -1.25);
  const lidPoint = new THREE.Vector3(HALF - 0.06, 0, -1.25).sub(new THREE.Vector3(-HALF, 0, 0)).applyAxisAngle(new THREE.Vector3(0, 0, 1), 0.58).add(new THREE.Vector3(-HALF, RIM_TOP + 0.012, 0));
  const stick = add(new THREE.CylinderGeometry(0.012, 0.012, 1, 10), lacquer);
  stick.position.copy(stickBase).lerp(lidPoint, 0.5); stick.scale.y = stickBase.distanceTo(lidPoint);
  stick.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), lidPoint.clone().sub(stickBase).normalize());

  /* keyboard: 52 white and 36 black keys, key slip, cheek blocks, fallboard and music desk */
  const KW = 1.222 / 52, front = 0.17;                                                      // keys stick out in front of the case
  const whites = new THREE.InstancedMesh(new RoundedBoxGeometry(KW - 0.0012, 0.022, 0.15, 1, 0.002), ivory, 52);
  const blacks = new THREE.InstancedMesh(new RoundedBoxGeometry(0.0115, 0.012, 0.092, 1, 0.002), ebony, 36);
  const x0 = -1.222 / 2 + KW / 2;
  for (let i = 0; i < 52; i++) { o.position.set(x0 + i * KW, KEY_Y - 0.011, front - 0.075); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1); o.updateMatrix(); whites.setMatrixAt(i, o.matrix); }
  // black keys: A0–B0 has one (A#), then the 2 + 3 pattern for each octave from C1
  let bi = 0;
  const hasBlack = w => { const n = (w + 5) % 7; return n === 0 || n === 1 || n === 3 || n === 4 || n === 5; }; // white index 0 is A0
  for (let w = 0; w < 51 && bi < 36; w++) {
    if (!hasBlack(w)) continue;
    o.position.set(x0 + (w + 0.5) * KW, KEY_Y + 0.006, front - 0.122); o.updateMatrix(); blacks.setMatrixAt(bi++, o.matrix);
  }
  blacks.count = bi;
  g.add(whites, blacks);
  add(new THREE.BoxGeometry(1.24, 0.07, 0.17), satin, 0, KEY_Y - 0.06, front - 0.08);       // key bed
  add(new RoundedBoxGeometry(1.25, 0.05, 0.022, 2, 0.006), lacquer, 0, KEY_Y - 0.03, front + 0.006); // key slip
  for (const s of [-1, 1]) add(new RoundedBoxGeometry(0.17, 0.11, 0.2, 3, 0.02), lacquer, s * 0.705, KEY_Y - 0.005, front - 0.1); // cheek blocks
  const fall = add(new RoundedBoxGeometry(1.25, 0.13, 0.03, 2, 0.008), lacquer, 0, KEY_Y + 0.06, -0.02); fall.rotation.x = -0.12;
  add(new THREE.BoxGeometry(1.26, 0.012, 0.02), brass, 0, KEY_Y + 0.0, -0.005);             // a thin brass line
  const desk = add(new RoundedBoxGeometry(0.86, 0.32, 0.016, 2, 0.006), lacquer, 0, RIM_TOP + 0.18, -0.36); desk.rotation.x = -0.24;
  add(new RoundedBoxGeometry(0.86, 0.02, 0.05, 1, 0.005), lacquer, 0, RIM_TOP + 0.03, -0.32);

  /* legs, casters, pedal lyre */
  const leg = (x, z) => {
    add(new THREE.CylinderGeometry(0.055, 0.04, RIM_LOW - 0.06, 16), lacquer, x, (RIM_LOW - 0.06) / 2 + 0.06, z);
    add(new RoundedBoxGeometry(0.15, 0.06, 0.15, 2, 0.015), lacquer, x, RIM_LOW - 0.03, z);
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 14).rotateZ(Math.PI / 2), brass, x, 0.03, z);
  };
  leg(-0.64, -0.18); leg(0.64, -0.18); leg(-0.42, -2.42);
  const lyre = new THREE.Group(); lyre.position.set(0, 0, -0.42); g.add(lyre);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.028, RIM_LOW - 0.08, 0.05), lacquer, s * 0.11, (RIM_LOW - 0.08) / 2 + 0.08, 0, lyre);
  add(new RoundedBoxGeometry(0.3, 0.08, 0.1, 2, 0.02), lacquer, 0, 0.1, 0, lyre);
  for (const x of [-0.07, 0, 0.07]) { const p = add(new RoundedBoxGeometry(0.035, 0.012, 0.12, 2, 0.005), brass, x, 0.1, 0.09, lyre); p.rotation.x = 0.12; }
  add(new THREE.CylinderGeometry(0.008, 0.008, 0.5, 8).rotateZ(0.6), lacquer, 0.25, 0.42, -0.02);     // lyre brace to the case

  /* bench: lacquered frame, black leather top */
  const bench = new THREE.Group(); bench.position.set(0, 0, 0.62); g.add(bench);
  add(new RoundedBoxGeometry(0.78, 0.07, 0.36, 3, 0.02), M.leather, 0, 0.5, 0, bench);
  add(new RoundedBoxGeometry(0.8, 0.07, 0.38, 3, 0.012), lacquer, 0, 0.44, 0, bench);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.CylinderGeometry(0.022, 0.018, 0.42, 12), lacquer, sx * 0.34, 0.21, sz * 0.14, bench);
  for (const sx of [-1, 1]) add(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 16).rotateZ(Math.PI / 2), brass, sx * 0.42, 0.44, 0, bench);  // height knobs

  g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  strings.castShadow = false;
  return g;
}
