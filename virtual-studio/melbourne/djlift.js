// The DJ lift: the platform the one DJ booth stands on, its four guide rails through the club, two three-stage
// telescopic rams from a pit under the club floor, and its lights (an amber line under the platform's edge, a
// champagne band round it). The booth itself is booth.js, parented to `platform`: it is moved, never copied.
// Sizes from layout.js (DJ_LIFT); the motion is the Vienna lift's controller (vienna/lift.js), driven by index.js.
import * as THREE from 'three';
import { glow } from '../set.js';
import { AMBER } from '../screens.js';
import { DJ_LIFT as D, ROOM, GLASS, liftTop } from './layout.js';

export function buildDjLift({ M, frame }) {
  const g = new THREE.Group(); g.name = 'melbourne-dj-lift'; frame.add(g);
  g.position.set(D.along - GLASS.along, 0, D.across - GLASS.across);    // the lift's centre, in the frame (centred on the glass)
  const mesh = (geo, mat, parent = g) => { const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  const glows = [];
  const steel = new THREE.MeshStandardMaterial({ color: 0x24272b, metalness: 0.85, roughness: 0.32 });
  const chrome = M.chrome || new THREE.MeshStandardMaterial({ color: 0xd0d3d8, metalness: 1, roughness: 0.12 });

  /* ----- the platform: black lacquer deck on a steel frame, a champagne band round its edge ----- */
  const platform = new THREE.Group(); g.add(platform);
  const deck = new THREE.MeshPhysicalMaterial({ color: 0x0b0c0f, metalness: 0.2, roughness: 0.24, clearcoat: 1, clearcoatRoughness: 0.07, envMapIntensity: 0.9 });
  mesh(new THREE.BoxGeometry(D.w, D.thick, D.d), deck, platform).position.y = -D.thick / 2;
  mesh(new THREE.BoxGeometry(D.w + 0.012, 0.035, D.d + 0.012), M.champagne, platform).position.y = -0.03;
  const under = glow(new THREE.Color(AMBER)); glows.push({ m: under, k: 2.0 });
  for (const [x, z, w, d] of [[0, D.d / 2 - 0.06, D.w - 0.12, 0.02], [0, -D.d / 2 + 0.06, D.w - 0.12, 0.02], [D.w / 2 - 0.06, 0, 0.02, D.d - 0.12], [-D.w / 2 + 0.06, 0, 0.02, D.d - 0.12]])
    mesh(new THREE.BoxGeometry(w, 0.012, d), under, platform).position.set(x, -D.thick - 0.007, z);
  // the frame under the deck: two long beams, cross members, and the carriages that ride the rails at the corners
  for (const z of [-D.d / 2 + 0.3, D.d / 2 - 0.3]) mesh(new THREE.BoxGeometry(D.w - 0.2, 0.22, 0.14), steel, platform).position.set(0, -D.thick - 0.11, z);
  for (const x of [-D.w / 2 + 0.3, -1.2, 1.2, D.w / 2 - 0.3]) mesh(new THREE.BoxGeometry(0.12, 0.2, D.d - 0.7), steel, platform).position.set(x, -D.thick - 0.1, 0);
  const cx = D.w / 2 + D.rail / 2 + 0.02, cz = D.d / 2 + D.rail / 2 + 0.02;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    mesh(new THREE.BoxGeometry(0.2, 0.42, 0.2), steel, platform).position.set(sx * cx, -0.25, sz * cz);
    mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), chrome, platform).position.set(sx * (cx - 0.13), -0.08, sz * (cz - 0.13));   // the carriage's bolt head
  }

  /* ----- four guide rails from the club floor to the underside of the studio floor ----- */
  const railH = ROOM.ceiling - ROOM.floor;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    mesh(new THREE.BoxGeometry(D.rail, railH, D.rail), steel, g).position.set(sx * cx, ROOM.floor + railH / 2, sz * cz);
    mesh(new THREE.BoxGeometry(0.02, railH, 0.02), chrome, g).position.set(sx * (cx - D.rail / 2 - 0.01), ROOM.floor + railH / 2, sz * cz);   // the running face
  }

  /* ----- two telescopic rams: a sleeve in the club floor, three stages (the top one fixed under the platform) ----- */
  const PIT = 1.9;   // the collapsed ram sits in a pit this deep under the club floor
  const rams = [-1.2, 1.2].map(x => {
    mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 28), steel, g).position.set(x, ROOM.floor + 0.015, 0);   // the floor sleeve
    const stages = [0.13, 0.105, 0.08].map((r, i) => mesh(new THREE.CylinderGeometry(r, r, 1, 24), i ? chrome : M.dark, g));
    stages.forEach(s => { s.position.x = x; });
    return stages;
  });

  // pose for a depth h: the platform's top at liftTop(h); the rams fill the space from the pit to the platform's frame
  function pose(h) {
    const top = h >= D.travel - 1e-6 ? ROOM.floor + D.rest : liftTop(h);
    platform.position.y = top;
    const bottom = ROOM.floor - PIT, head = top - D.thick - 0.22, len = head - bottom, seg = len / 3 + 0.12;   // each stage overlaps the next
    for (const stages of rams) stages.forEach((s, i) => { s.scale.y = seg; s.position.y = bottom + (i * (len - seg)) / 2 + seg / 2; });
    return top;
  }
  pose(0);

  return {
    group: g, platform, pose, glows,
    // the light under the platform's edge: `level` 0…1
    light(level) { for (const x of glows) x.m.color.set(AMBER).multiplyScalar(level * x.k); },
  };
}
