// The arrival before the empty-studio opening (?cut=arrival): night outside the studio building, the presenters' shoes
// on the wet pavement as they walk in (never a face), past the reception desk with the D//0 logo, the backstage
// lounge where they sit down, and the camera going on
// alone through the BACKSTAGE door into the dark studio, where the opening takes over from black.
// Everything is a function of T (seconds from the arrival's start), like the opening.
import * as THREE from 'three';
import { RGBELoader } from './vendor/RGBELoader.js';
import { createActor, ramp, smooth, clamp01, lerpAngle } from '../lib/actors.js';
import { LOUNGE_DOOR } from '../../virtual-studio/set.js';
import { buildStreet, canvasTex, FZ } from '../../virtual-studio/building.js';

const RX = 3;                              // the reception's time: everything after it comes this much later
export const PRO = 22 + RX;                // the arrival's length; the opening's t = T - PRO
const WIDE = 3.6;                          // the building, wide; then the shoes
const OUTSIDE = 8.0 + RX;                  // cut from the lobby (reception) to the lounge
const V = THREE.Vector3;
const SEAT_TOP = 0.37;                     // the lounge armchairs' cushion
const SOLE = { andy: 0.009, georgie: 0.018 };

// a soft dark blot for under a shoe: the contact shadow that sets it on the ground
const blot = () => canvasTex(128, 128, (x, w, h) => { const g = x.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.45, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }, false);
/* ---------- the two presenters: on the street, then in the lounge ---------- */
// where to start a walk so that its length is a whole number of strides: the feet then plant without sliding
// (the start is moved along the walk's first leg; the walk's own scaling then stays within a percent)
function fitStart(actor, start, path, { gait = 'loop', startClip = false } = {}) {
  const c = actor.clips, unit = c[gait].dist, fixed = (startClip ? c.start.dist : 0) + c.stop.dist;
  let s = [...start];
  for (let i = 0; i < 4; i++) {
    const L = new THREE.CatmullRomCurve3([new V(s[0], 0, s[1]), ...path.map(([x, z]) => new V(x, 0, z))], false, 'centripetal').getLength();
    const n = Math.max(1, Math.round((L - fixed) / unit)), want = fixed + n * unit, d = want - L;
    const dir = new V(s[0] - path[0][0], 0, s[1] - path[0][1]).normalize();
    s = [s[0] + dir.x * d, s[1] + dir.z * d];
  }
  return s;
}
async function stageCast(scene) {
  const tl = new THREE.TextureLoader();
  const [andy, georgie] = await Promise.all(['andy', 'georgie'].map(k => createActor(k, tl, { realistic: true, wardrobe: 'show' })));
  // outside: along the pavement, side by side (Georgie half a step ahead, on the building's side), and in at the door
  andy.standAt(-11.6, FZ + 2.75, Math.PI / 2);
  // still walking at the cut: their walks' closing stop is dropped (it would pull them back out of the lounge later)
  // in at the doors, through the lobby past the reception desk (on their right) to the corridor at the back left
  const a1 = andy.walk({ path: [[-6, FZ + 2.75], [-1.6, FZ + 2.7], [-0.45, FZ + 1.6], [-0.4, FZ + 0.2], [-0.9, FZ - 2.6], [-2.2, FZ - 5.6], [-3.3, FZ - 8.6], [-3.6, FZ - 10.6]], arriveAt: 14.3, startClip: false });
  andy.segs.pop();
  georgie.standAt(-10.9, FZ + 2.05, Math.PI / 2);
  const g1 = georgie.walk({ path: [[-5.4, FZ + 2.05], [-1.3, FZ + 2.0], [0.35, FZ + 1.2], [0.4, FZ + 0.2], [-0.2, FZ - 2.8], [-1.6, FZ - 6.0], [-2.9, FZ - 8.9], [-3.3, FZ - 10.6]], arriveAt: 14.5, startClip: false });
  georgie.segs.pop();
  // inside: out of their dressing rooms (Melbourne side) to their armchairs, and down
  const chair = { andy: { x: -1.45, z: -9.95, h: 0.3 }, georgie: { x: 1.45, z: -9.95, h: -0.3 } };
  const mark = (a, c) => {
    const m = a.sitMark([0, 0], SEAT_TOP), s = Math.sin(c.h), co = Math.cos(c.h);   // the stand-off for heading 0, turned to the chair's
    return [c.x + m[0] * co + m[1] * s, c.z - m[0] * s + m[1] * co + 0.04];
  };
  const mA = mark(andy, chair.andy), pA = [[1.6, -8.25], [0, -8.12], [-1.15, -8.45], mA];
  andy.standAt(...fitStart(andy, [3.0, -9.55], pA), -Math.PI / 2);
  const a2 = andy.walk({ path: pA, at: OUTSIDE, startClip: false, endHeading: chair.andy.h, turnTime: 1.4 });
  const sA = andy.sit({ at: a2.end - 0.1 });
  const mG = mark(georgie, chair.georgie), pG = [[2.2, -8.35], [1.6, -8.75], mG];
  georgie.standAt(...fitStart(georgie, [3.0, -8.75], pG), -Math.PI / 2);
  const g2 = georgie.walk({ path: pG, at: OUTSIDE + 0.35, startClip: false, endHeading: chair.georgie.h, turnTime: 1.4 });
  const sG = georgie.sit({ at: g2.end - 0.1 });
  const cast = [andy, georgie];
  cast.forEach(a => scene.add(a.group));
  return { andy, georgie, cast, info: { a1, g1, a2, g2, sA, sG } };
}

/* ---------- sitting in a low armchair: the legs bend further so the feet stay on the floor ----------
   The library's sit-down is for a desk chair; lowered onto these 37 cm cushions the whole body would go down with it,
   feet through the floor. Here the body is lowered, then each leg (thigh, calf) is solved analytically so the ankle
   stays where it was, the knee bending in its own plane, and the foot keeps its own angle on the floor. */
const _v = [new V(), new V(), new V(), new V(), new V()], _q = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
function rotateBoneWorld(bone, qWorld) {
  // apply a world-space rotation to a bone, keeping its parent
  bone.getWorldQuaternion(_q[0]); bone.parent.getWorldQuaternion(_q[1]);
  bone.quaternion.copy(_q[1].invert().multiply(qWorld.clone().multiply(_q[0])));
  bone.updateWorldMatrix(false, true);
}
function legIK(a, side, raise) {
  const b = a.bones, thigh = b[`Bip01_${side}_Thigh`], calf = b[`Bip01_${side}_Calf`], foot = b[`Bip01_${side}_Foot`];
  if (!thigh || !calf || !foot) return;
  const footQ = foot.getWorldQuaternion(new THREE.Quaternion());
  const H = thigh.getWorldPosition(_v[0]), K = calf.getWorldPosition(_v[1]), A = foot.getWorldPosition(_v[2]);
  const T = A.clone(); T.y += raise;                                       // where the ankle was before the body went down
  const la = H.distanceTo(K), lb = K.distanceTo(A), d = Math.min(H.distanceTo(T), la + lb - 1e-4);
  // 1. the knee: bend it so hip to ankle is as long as hip to target
  const cur = _v[3].copy(H).sub(K).normalize().angleTo(_v[4].copy(A).sub(K).normalize());
  const want = Math.acos(THREE.MathUtils.clamp((la * la + lb * lb - d * d) / (2 * la * lb), -1, 1));
  const axis = new V().subVectors(H, K).cross(new V().subVectors(A, K)).normalize();
  if (axis.lengthSq() > 0.5) rotateBoneWorld(calf, new THREE.Quaternion().setFromAxisAngle(axis, want - cur));
  // 2. the hip: swing the leg so the ankle lands on the target
  const A2 = foot.getWorldPosition(new V());
  rotateBoneWorld(thigh, new THREE.Quaternion().setFromUnitVectors(A2.sub(H).normalize(), T.clone().sub(H).normalize()));
  // 3. the foot keeps its angle (flat on the floor)
  foot.parent.getWorldQuaternion(_q[2]); foot.quaternion.copy(_q[2].invert().multiply(footQ)); foot.updateWorldMatrix(false, true);
}

function posePresenter(a, T) {
  a.pose(T);
  const drop = Math.min(0, a.group.position.y);                         // how far the sit-down took the body under the floor
  a.group.position.y += SOLE[a.key]; a.group.updateMatrixWorld(true);
  if (drop < 0) { legIK(a, 'L', -drop); legIK(a, 'R', -drop); }
}

/* ---------- the camera: always low, at the shoes ---------- */
const curve = pts => new THREE.CatmullRomCurve3(pts.map(p => new V(...p)), false, 'centripetal');
function midOf(cast, T) { const a = cast.andy.where(T), g = cast.georgie.where(T); return { x: (a.x + g.x) / 2, z: (a.z + g.z) / 2, h: lerpAngle(a.heading, g.heading, 0.5) }; }
// behind the pair, at ankle height, along a delayed heading, the way a dolly would trail them
function trail(cast, T, back, y, ahead, ty) {
  const p = midOf(cast, T), lag = midOf(cast, T - 0.9), h = lerpAngle(lag.h, p.h, 0.3), f = new V(Math.sin(h), 0, Math.cos(h));
  return { pos: new V(p.x, y, p.z).addScaledVector(f, -back), target: new V(p.x, ty, p.z).addScaledVector(f, ahead) };
}
// the lounge: low along the front wall, between the table and the wall, with them (Georgie sits first, then Andrej,
// seen from the side); then on alone through the BACKSTAGE door, which swings as the camera comes
const LOUNGE_KEYS = [[OUTSIDE, [3.3, 0.17, -7.72]], [11.2 + RX, [1.5, 0.18, -7.66]], [13 + RX, [-0.1, 0.19, -7.62]], [15.5 + RX, [-1.15, 0.2, -7.66]], [17.8 + RX, [-1.55, 0.24, LOUNGE_DOOR.z + 0.05]], [19.4 + RX, [-3.45, 0.3, LOUNGE_DOOR.z]], [PRO, [-5.2, 0.4, LOUNGE_DOOR.z + 0.1]]];
const LOUNGE_PATH = curve(LOUNGE_KEYS.map(k => k[1]));
// the path's parameter over time: a monotone cubic through the keys (Fritsch–Carlson), so the dolly's speed changes
// smoothly from key to key instead of jumping; it starts already moving (the cut lands on a moving camera)
const loungeU = (() => {
  const xs = LOUNGE_KEYS.map(k => k[0]), n = xs.length - 1, ys = xs.map((_, i) => i / n);
  const d = xs.slice(1).map((x, i) => (ys[i + 1] - ys[i]) / (x - xs[i]));
  const m = xs.map((_, i) => (i === 0 ? d[0] : i === n ? d[n - 1] : d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i])));
  return T => {
    if (T <= xs[0]) return 0; if (T >= xs[n]) return 1;
    let i = 0; while (T > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (T - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
})();
export function cameraAt(cast, T) {
  if (T < WIDE) {
    // the building at night, from across the pavement, low: the sign, the canopy, the lit lobby, the wet slabs
    const u = smooth(T / WIDE);
    return { pos: new V(3.2 - 0.8 * u, 0.4 + 0.05 * u, FZ + 11.5 - 1.2 * u), target: new V(0.2, 2.7, FZ), fov: 46 };
  }
  if (T < OUTSIDE) {
    // behind their shoes through the doors into the lobby; there the camera lets them go on to the left and drifts on
    // towards the reception desk, its lit D//0 low in the frame
    const c = trail(cast, T, 1.9, 0.16, 2.4, 0.13);
    const u = smooth(clamp01((T - 7.4) / (OUTSIDE - 7.4)));
    const deskPos = new V(0.15, 0.17, FZ - 1.6).lerp(new V(0.55, 0.19, FZ - 3.9), u), deskAim = new V(0.85, 0.42, FZ - 7.3);
    const w = ramp(T, 7.2, 9.0);
    return { pos: c.pos.lerp(deskPos, w), target: c.target.lerp(deskAim, w), fov: 40 };
  }
  const pos = LOUNGE_PATH.getPoint(loungeU(T));
  // the door: its threshold, then on out into the dark studio
  const look = new V(-3.5, 0.62, LOUNGE_DOOR.z).lerp(new V(-7, 0.45, LOUNGE_DOOR.z), ramp(T, 18.9 + RX, 20.2 + RX));
  // their feet: both as they come in, then Andrej's to his chair; then straight on to the door
  const a = cast.andy.where(T), m = midOf(cast, T);
  const feet = new V(m.x, 0.02, m.z).lerp(new V(a.x, 0.0, a.z), ramp(T, 10.5 + RX, 12.5 + RX));
  return { pos, target: feet.lerp(look, ramp(T, 16.9 + RX, 18.1 + RX)), fov: 40 };
}

/* ---------- boot ---------- */
export async function buildArrival(scene, renderer) {
  // the night city (Poly Haven, CC0), only as reflections in glass and wet ground: not as light, not as a backdrop
  const hdr = await new RGBELoader().setDataType(THREE.FloatType).loadAsync(`${CC0}modern_buildings_night_4k.hdr`);
  // its street lamps are thousands of times brighter than the night around them; in a wet floor at a grazing angle they
  // would bloom into white blots. Clamped, they stay small bright glints, as a camera sees them
  const px = hdr.image.data; for (let i = 0; i < px.length; i++) if ((i & 3) !== 3) px[i] = Math.min(px[i], 1.6);
  const pm = new THREE.PMREMGenerator(renderer), nightEnv = pm.fromEquirectangular(hdr).texture; hdr.dispose(); pm.dispose();
  const street = buildStreet(nightEnv, { cc0: new URL('./out/cc0/', import.meta.url).href }); scene.add(street.group);
  await street.ready;
  // a warm light by the BACKSTAGE door inside the lounge, so the door and its frame read as the camera goes to it
  const doorLight = new THREE.PointLight(0xffc68a, 0, 6, 1.5); doorLight.position.set(-3.1, 2.75, LOUNGE_DOOR.z); scene.add(doorLight);
  const cast = await stageCast(scene);
  const heads = new V(), ndc = new V();
  // contact shadows: a soft blot under each shoe, darkest when the sole is down, gone as the foot lifts
  const blotTex = blot(), feet = [];
  for (const a of cast.cast) for (const side of ['L', 'R']) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blotTex, transparent: true, depthWrite: false, color: 0x000000, opacity: 0 }));
    m.renderOrder = 2; scene.add(m);
    feet.push({ a, foot: a.bones[`Bip01_${side}_Foot`], toe: a.bones[`Bip01_${side}_Toe0`], m });
  }
  const fp = new V(), tp = new V();
  function placeBlots(T) {
    const groundY = T < OUTSIDE ? 0.004 : 0.006;
    for (const f of feet) {
      f.m.visible = f.a.group.visible;
      if (!f.m.visible) continue;
      f.foot.getWorldPosition(fp); (f.toe || f.foot).getWorldPosition(tp);
      const lift = clamp01((fp.y - f.a.group.position.y - 0.085) / 0.12);
      f.m.position.set((fp.x + tp.x) / 2, groundY, (fp.z + tp.z) / 2);
      f.m.rotation.y = Math.atan2(tp.x - fp.x, tp.z - fp.z);
      f.m.scale.set(0.16 + 0.08 * lift, 1, 0.34 + 0.1 * lift);
      f.m.material.opacity = 0.62 * (1 - lift) * (1 - lift);
    }
  }

  return {
    PRO, WIDE, OUTSIDE, info: cast.info,
    // pose everything for T, show the right part, and give the camera
    pose(T, studio) {
      const outside = T < OUTSIDE;
      street.group.visible = outside;
      studio.lounge.light(!outside);
      doorLight.intensity = outside ? 0 : 30;
      // the library's soles sit a few millimetres under the ground at each step (measured: Andy'K 7 mm, Georgie's heels
      // 16 mm): lifted so they stand on it
      for (const a of cast.cast) { posePresenter(a, T); a.group.visible = T >= WIDE; }
      placeBlots(T);
      const cam = cameraAt(cast, T);
      // an operator's hands on a low dolly: a few millimetres of slow drift, never a shake
      const hx = Math.sin(T * 0.83 + 1.1) * 0.004 + Math.sin(T * 1.91) * 0.0015, hy = Math.sin(T * 0.67 + 2.3) * 0.003, hz = Math.sin(T * 0.59) * 0.003;
      cam.pos.x += hx; cam.pos.y += hy; cam.pos.z += hz; cam.target.x += hx * 2.5; cam.target.y += hy * 2.5;
      street.doors([...cast.cast.map(a => a.where(T)), { x: cam.pos.x, z: cam.pos.z }]);
      return cam;
    },
    hide(studio) { doorLight.intensity = 0; street.group.visible = false; for (const a of cast.cast) a.group.visible = false; for (const f of feet) f.m.visible = false; studio.lounge.light(false); },
    show() {},
    // review: the lowest point of each presenter's skinned mesh over time (soles under the ground are below 0)
    soles(times) {
      const box = new THREE.Box3(), out = {};
      for (const T of times) for (const a of cast.cast) {
        posePresenter(a, T); let lo = Infinity;
        a.group.traverse(o => { if (o.isSkinnedMesh) { o.computeBoundingBox(); box.copy(o.boundingBox).applyMatrix4(o.matrixWorld); lo = Math.min(lo, box.min.y); } });
        const ground = T < OUTSIDE ? 0.002 : 0.004;
        out[a.key] = Math.min(out[a.key] ?? Infinity, +(lo - ground).toFixed(4));
      }
      return out;
    },
    // review: is any head inside the picture? (never wanted)
    headsInFrame(camera) {
      return cast.cast.filter(a => { if (!a.group.visible) return false; a.bones.Bip01_Head.getWorldPosition(heads); ndc.copy(heads).project(camera); return Math.abs(ndc.x) < 1.05 && Math.abs(ndc.y) < 1.05 && ndc.z < 1; }).map(a => a.key);
    },
    // the moments a foot lands, for the footsteps in the mix: [T, 'street' | 'lounge']
    footsteps() {
      const out = [], prev = {}, foot = new V();
      for (let T = 0; T < 17 + RX; T += 1 / 120) {
        for (const a of cast.cast) {
          a.pose(T);
          for (const side of ['L', 'R']) {
            a.bones[`Bip01_${side}_Foot`].getWorldPosition(foot);
            const k = a.key + side, y = foot.y - a.group.position.y, p = prev[k];
            if (p && p.y > 0.115 && y <= 0.115 && T - (p.last || -1) > 0.3) { out.push([+T.toFixed(3), T < OUTSIDE ? 'street' : 'lounge', a.key]); p.last = T; }
            prev[k] = { y, last: p?.last };
          }
        }
      }
      return out;
    },
  };
}
