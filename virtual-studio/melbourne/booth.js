// THE DJ booth (the one booth: it rides the DJ lift between the studio and the club): a riser, a long console with
// the D//0 mark lit in its front, the gear on its work top (gear.js: four media players and a four-channel mixer at
// real sizes, headphones, a talkback mic), the booth monitors on stands, and the cables down the back. Nothing here
// plays or mixes audio (that is the Broadcast Studio's and OBS's); the gear moves only on data it is sent.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { glow } from '../set.js';
import { AMBER, ICE } from '../screens.js';
import { CLUB_BOOTH as B, MONITORS, ROOM } from './layout.js';
import { buildGear, DECK_X } from './gear.js';

const GOLD = new THREE.Color(AMBER), SILVER = new THREE.Color(ICE);

// `floor`: the y it stands on in `parent` (the DJ lift's platform carries it: 0)
export function buildBooth({ M, parent, at, floor = ROOM.floor }) {
  const g = new THREE.Group(); g.name = 'melbourne-booth'; parent.add(g); g.position.set(...at); g.position.y = floor;
  const add = (geo, mat, x, y, z, p = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; p.add(m); return m; };
  const lit = [];   // { m, k, group }: lit parts, their level set by the room's light state
  const L = (color, k, group = 'booth') => { const m = glow(color); lit.push({ m, k, group }); return m; };
  const black = new THREE.MeshPhysicalMaterial({ color: 0x0b0b0d, metalness: 0.3, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3 });
  const panel = new THREE.MeshStandardMaterial({ color: 0x16171a, metalness: 0.6, roughness: 0.4 });     // the gear's brushed faces
  const rubber = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.85 });
  const knobMat = new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.5, roughness: 0.35 });

  /* ----- riser: the DJ's platform, its front edge lit ----- */
  add(new RoundedBoxGeometry(B.w + 1.4, B.riser, 2.6, 2, 0.02), black, 0, B.riser / 2, -0.55);
  add(new THREE.BoxGeometry(B.w + 1.36, 0.014, 0.02), L(GOLD, 1.6, 'strips'), 0, B.riser - 0.03, 0.75);
  const top = B.riser + B.top;

  /* ----- the console: a cabinet with a lit front, a work top the gear stands on ----- */
  add(new RoundedBoxGeometry(B.w, B.top - 0.05, B.d, 3, 0.03), black, 0, B.riser + (B.top - 0.05) / 2, 0);
  add(new RoundedBoxGeometry(B.w + 0.08, 0.05, B.d + 0.06, 2, 0.015), panel, 0, top - 0.025, 0);
  // the front: a smoked panel, the D//0 mark lit behind it, a gold line under it
  const logoTex = new THREE.TextureLoader().load(new URL('../../assets/logo-do-1k.webp', import.meta.url).href); logoTex.colorSpace = THREE.SRGBColorSpace;
  const logoMat = new THREE.MeshBasicMaterial({ map: logoTex, transparent: true, color: 0x000000 }); lit.push({ m: logoMat, k: 1.1, group: 'booth', white: true });
  add(new THREE.PlaneGeometry(0.95, 0.95 * 0.42), logoMat, 0, B.riser + B.top * 0.55, B.d / 2 + 0.002);
  add(new THREE.BoxGeometry(B.w - 0.1, 0.012, 0.01), L(GOLD, 1.8, 'strips'), 0, B.riser + 0.12, B.d / 2 + 0.004);
  add(new THREE.BoxGeometry(B.w - 0.1, 0.008, 0.01), L(SILVER, 1.2, 'strips'), 0, top - 0.06, B.d / 2 + 0.004);
  add(new THREE.PlaneGeometry(B.w - 0.2, 0.024), new THREE.MeshBasicMaterial({ color: 0x9a9da3 }), 0, B.riser + B.top * 0.22, B.d / 2 + 0.003);   // engraved line

  /* ----- the gear on the work top: four players and the mixer at real sizes, headphones, the talkback mic (gear.js) ----- */
  const gearRoot = new THREE.Group(); g.add(gearRoot); gearRoot.position.y = top;
  const gear = buildGear({ M, parent: gearRoot, glowMat: c => glow(c) });
  const players = DECK_X;
  // cables: from the back of each player and the mixer down behind the console to a floor box
  const back = -B.d / 2 - 0.02;
  [...players, 0].forEach((px, i) => {
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(px, top + 0.03, back + 0.05), new THREE.Vector3(px, top - 0.05, back - 0.03), new THREE.Vector3(px * 0.7, B.riser + 0.4, back - 0.05), new THREE.Vector3(i * 0.04 - 0.08, B.riser + 0.02, back - 0.2)]);
    add(new THREE.TubeGeometry(c, 24, 0.005, 6), rubber);
  });
  add(new RoundedBoxGeometry(0.3, 0.1, 0.18, 1, 0.01), panel, 0, B.riser + 0.05, back - 0.25);   // the floor box

  /* ----- the booth monitors on stands, turned in to the DJ's head ----- */
  const ear = new THREE.Vector3(0, B.riser + 1.62, -0.55);
  for (const s of [-1, 1]) {
    const st = new THREE.Group(); st.position.set(s * MONITORS.along, B.riser, MONITORS.across); g.add(st);
    add(new THREE.CylinderGeometry(0.16, 0.18, 0.02, 24), black, 0, 0.01, 0, st);
    add(new THREE.CylinderGeometry(0.02, 0.02, MONITORS.height - 0.25, 12), panel, 0, (MONITORS.height - 0.25) / 2, 0, st);
    const box = new THREE.Group(); box.position.y = MONITORS.height; st.add(box);
    box.rotation.set(0, Math.atan2(ear.x - st.position.x, ear.z - st.position.z), 0);   // its front (+z) at the DJ
    add(new RoundedBoxGeometry(0.3, 0.46, 0.32, 2, 0.02), black, 0, 0, 0, box);
    add(new THREE.CircleGeometry(0.105, 32), rubber, 0, -0.07, 0.161, box);
    add(new THREE.TorusGeometry(0.107, 0.006, 6, 32), M.chrome, 0, -0.07, 0.162, box);
    add(new THREE.CircleGeometry(0.032, 24), new THREE.MeshStandardMaterial({ color: 0x777b82, metalness: 0.9, roughness: 0.3 }), 0, 0.13, 0.161, box);
    add(new THREE.BoxGeometry(0.06, 0.008, 0.002), L(GOLD, 0.8), 0, -0.2, 0.161, box);
  }

  /* ----- per frame: the console's own lights from the room's light state; the gear from its data (gear.js) ----- */
  function update(t, dt, Ls) {
    for (const l of lit) {
      const s = Ls[l.group] || Ls.booth;
      if (l.white) l.m.color.setScalar(Math.min(1, s.level * l.k + 0.05));
      else l.m.color.copy(l.m.userData.base).multiplyScalar(s.level * l.k);
    }
    gear.update(t, dt, Ls);
  }
  return { group: g, update, gear };
}
