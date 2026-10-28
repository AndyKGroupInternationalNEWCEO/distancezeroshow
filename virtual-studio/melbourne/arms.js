// The booth monitors on their mechanical arms (part of the one DJ booth: they ride the DJ lift with it). Stowed, each
// monitor sits low at its end of the riser behind the DJ, under the console's height, so in the studio nothing
// stands in the way of the view. Deployed (only once the booth is down in the club), each arm's carriage slides out
// to the side, its three-stage telescopic column rises, and its boom swings forward to the DJ, the monitor turned to
// the DJ's ears. A thin ice line on each column lights while it moves; a soft mechanical sound goes with it.
// States: STOWED, DEPLOYING, DEPLOYED, STOWING. index.js locks them with the lift: deploy only with the booth down and
// standing, the lift moves only with the arms stowed.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ICE } from '../screens.js';
import { mechSound } from './cover.js';

const T = 6.2;                                   // s, the whole move
const phase = (t, a, b) => { const u = Math.min(1, Math.max(0, (t - a) / (b - a))); return u * u * (3 - 2 * u); };
// stowed → deployed: the carriage's x (from the booth's centre line), the column's height, the boom's direction
const SLIDE = [1.95, 2.2], COL = [0.32, 1.2], BOOM = 0.43, BASE_Z = -0.55;
const EAR = new THREE.Vector3(0, 1.62, -0.55);   // the DJ's ears, over the riser (riser height added by the caller)

export function buildArms({ parent, riser, M, glow, black, rubber }) {
  const steel = new THREE.MeshStandardMaterial({ color: 0x2b2e33, metalness: 0.9, roughness: 0.3 });
  const chrome = M.chrome || new THREE.MeshStandardMaterial({ color: 0xd0d3d8, metalness: 1, roughness: 0.12 });
  const mesh = (geo, mat, x, y, z, p) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; p.add(m); return m; };
  const ear = EAR.clone(); ear.y += riser;
  const arms = [-1, 1].map(s => {
    // the track in the riser the carriage runs on
    mesh(new THREE.BoxGeometry(0.5, 0.008, 0.12), steel, s * 2.08, riser + 0.004, BASE_Z, parent);
    const carriage = new THREE.Group(); carriage.position.set(s * SLIDE[0], riser, BASE_Z); parent.add(carriage);
    mesh(new RoundedBoxGeometry(0.3, 0.06, 0.3, 2, 0.01), steel, 0, 0.038, 0, carriage);
    mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.05, 28), black, 0, 0.09, 0, carriage);
    // the column: three stages (outer steel, two chromed), each overlapping the next
    const stages = [0.05, 0.041, 0.032].map((r, i) => mesh(new THREE.CylinderGeometry(r, r, 1, 28), i ? chrome : steel, 0, 0, 0, carriage));
    const line = glow(new THREE.Color(ICE));
    const strip = mesh(new THREE.BoxGeometry(0.006, 1, 0.006), line, 0, 0, 0.051, carriage);
    // the head on top: a yaw joint, the boom, a tilt joint and the monitor
    const head = new THREE.Group(); carriage.add(head);
    mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.07, 24), black, 0, 0.035, 0, head);
    const boom = new THREE.Group(); boom.position.y = 0.05; head.add(boom);
    mesh(new RoundedBoxGeometry(0.05, 0.05, BOOM, 2, 0.008), steel, 0, 0, BOOM / 2, boom);
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.07, 20).rotateZ(Math.PI / 2), chrome, 0, 0, BOOM, boom);
    const box = new THREE.Group(); box.position.set(0, 0.0, BOOM); boom.add(box);
    // the monitor: a two-way box (woofer, tweeter, a port), its back plate with the arm's yoke
    const cab = new THREE.Group(); cab.position.set(0, 0.25, 0); box.add(cab);
    mesh(new RoundedBoxGeometry(0.3, 0.46, 0.32, 4, 0.024), black, 0, 0, 0, cab);
    // the drivers, modelled (not flat discs): the woofer's cone dished into the baffle with a rolled rubber surround
    // and a domed dust cap in a chrome trim ring; the tweeter's soft dome in a shallow waveguide
    const cone = new THREE.MeshStandardMaterial({ color: 0x15161a, metalness: 0.1, roughness: 0.7, side: THREE.DoubleSide });   // (seen from inside the dish)
    const woof = new THREE.Group(); woof.position.set(0, -0.07, 0.16); cab.add(woof);
    mesh(new THREE.LatheGeometry([[0.03, -0.028], [0.06, -0.018], [0.09, -0.006], [0.097, 0]].map(([r, y]) => new THREE.Vector2(r, y)), 64).rotateX(Math.PI / 2), cone, 0, 0, 0, woof);
    mesh(new THREE.TorusGeometry(0.1, 0.007, 12, 72), rubber, 0, 0, 0.001, woof);
    mesh(new THREE.SphereGeometry(0.034, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, 0.45), new THREE.MeshStandardMaterial({ color: 0x1c1d20, metalness: 0.4, roughness: 0.45 }), 0, 0, -0.026, woof);
    mesh(new THREE.TorusGeometry(0.109, 0.005, 12, 72), chrome, 0, 0, 0.002, woof);
    const tw = new THREE.Group(); tw.position.set(0, 0.13, 0.16); cab.add(tw);
    mesh(new THREE.LatheGeometry([[0.022, -0.012], [0.04, -0.006], [0.058, 0]].map(([r, y]) => new THREE.Vector2(r, y)), 64).rotateX(Math.PI / 2), cone, 0, 0, 0, tw);
    mesh(new THREE.SphereGeometry(0.02, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, 0.6), new THREE.MeshStandardMaterial({ color: 0x8a8e95, metalness: 0.6, roughness: 0.35 }), 0, 0, -0.012, tw);
    mesh(new THREE.TorusGeometry(0.06, 0.003, 10, 72), chrome, 0, 0, 0.001, tw);
    // the bass port: a flared slot
    mesh(new RoundedBoxGeometry(0.11, 0.028, 0.012, 3, 0.008), black, 0, -0.195, 0.158, cab);
    mesh(new RoundedBoxGeometry(0.096, 0.016, 0.014, 2, 0.006), new THREE.MeshBasicMaterial({ color: 0x000000 }), 0, -0.195, 0.158, cab);
    mesh(new THREE.BoxGeometry(0.2, 0.06, 0.04), steel, 0, -0.22, -0.1, cab);                   // the yoke
    return { s, carriage, stages, strip, head, boom, box, cab };
  });

  let state = 'STOWED', t = 0;
  const sound = mechSound();
  const tmp = new THREE.Vector3(), w = new THREE.Vector3(), e = new THREE.Vector3();
  function pose(k) {                                            // k: 0 stowed … T deployed
    const a = phase(k, 0, 1.6), b = phase(k, 1.2, 3.9), c = phase(k, 3.5, T);
    for (const r of arms) {
      r.carriage.position.x = r.s * (SLIDE[0] + (SLIDE[1] - SLIDE[0]) * a);
      const h = COL[0] + (COL[1] - COL[0]) * b, seg = h / 3 + 0.06;
      r.stages.forEach((st, i) => { st.scale.y = seg; st.position.y = 0.11 + (i * (h - seg)) / 2 + seg / 2; });
      r.strip.scale.y = h * 0.9; r.strip.position.y = 0.11 + h * 0.45;
      r.head.position.y = 0.11 + h;
      // the boom: stowed pointing back (−z), behind the DJ; deployed pointing at its place in front of the DJ's side
      // (each swings round its own outer side: never across the console)
      const stowYaw = r.s > 0 ? Math.PI : -Math.PI, outYaw = Math.atan2(-r.s * 0.25, 0.35);
      r.boom.rotation.y = stowYaw + (outYaw - stowYaw) * c;
      // the monitor: stowed level and facing back; deployed turned to the DJ's ears
      r.box.updateWorldMatrix(true, false);
      r.box.getWorldPosition(w); tmp.copy(ear); r.box.parent.parent.parent.parent.localToWorld(tmp);   // the ears in world space
      const look = Math.atan2(tmp.x - w.x, tmp.z - w.z), pitch = Math.atan2(tmp.y - w.y - 0.25, Math.hypot(tmp.x - w.x, tmp.z - w.z));
      r.box.rotation.set(0, 0, 0); r.box.quaternion.identity();
      const worldYaw = new THREE.Euler().setFromQuaternion(r.boom.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y;
      r.box.rotation.order = 'YXZ'; r.box.rotation.y = c * (look - worldYaw); r.box.rotation.x = -c * pitch * 0.6;
    }
  }
  pose(0);

  function command(cmd) {
    if (cmd === 'deploy') { if (state === 'DEPLOYED' || state === 'DEPLOYING') return { ok: true }; if (state === 'STOWING') t = T - t; else t = 0; state = 'DEPLOYING'; sound.start(); return { ok: true }; }
    if (cmd === 'retract') { if (state === 'STOWED' || state === 'STOWING') return { ok: true }; if (state === 'DEPLOYING') t = T - t; else t = 0; state = 'STOWING'; sound.start(); return { ok: true }; }
    return { ok: false, reason: 'No such arms command' };
  }
  let glowLevel = 0;
  function update(dt) {
    if (state === 'DEPLOYING' || state === 'STOWING') {
      t = Math.min(T, t + dt);
      pose(state === 'DEPLOYING' ? t : T - t);
      if (t >= T) { state = state === 'DEPLOYING' ? 'DEPLOYED' : 'STOWED'; sound.stop(); }
    }
    glowLevel += ((state === 'DEPLOYING' || state === 'STOWING' ? 1 : state === 'DEPLOYED' ? 0.25 : 0.03) - glowLevel) * (1 - Math.exp(-dt * 4));
    for (const r of arms) r.strip.material.color.set(ICE).multiplyScalar(1.5 * glowLevel);
  }
  return { arms, command, update, sound, get state() { return state; }, duration: T };
}
