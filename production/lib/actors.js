// Actors for the virtual studio clips: Rocketbox avatars (MIT) driven by motion-captured clips on a timeline.
// Stateless by design: actor.pose(t) depends only on t, so clips play live and render frame by frame identically.
//
// Motion sources: the library's mocap clips (walk start/cycle/stop, slow walk, sit down, 180° turn) plus small
// procedural layers where the library has no clip (breathing, head moves, reaching, holding pan bars). The
// procedural arm poses are auto-calibrated: we measure which way each bone turns the hand instead of assuming
// the rig's axes.
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

const AVATARS = new URL('../avatars/', import.meta.url).href;
const V = THREE.Vector3;
export const smooth = t => t * t * (3 - 2 * t);
export const clamp01 = t => Math.min(1, Math.max(0, t));
export const ramp = (t, a, b) => smooth(clamp01((t - a) / (b - a)));

export const CAST = {
  andy: { model: 'Male_Adult_16/Male_Adult_16', tex: 'm019', body: 'm019_body_color_black', scale: 0.0104, sex: 'm' }, // 1.88 m
  georgie: { model: 'Female_Adult_05/Female_Adult_05', tex: 'f005', body: 'f005_body_color_black', scale: 0.01, opacity: true, sex: 'f' },
  assistant: { model: 'Female_Adult_09/Female_Adult_09', tex: 'f009', body: 'f009_body_color', scale: 0.0098, opacity: true, sex: 'f' },
  operator: { model: 'Male_Adult_20/Male_Adult_20', tex: 'm027', body: 'm027_body_color', scale: 0.0101, sex: 'm' },
};
const CLIPS = {
  m: { start: 'xy/m_walk_start', loop: 'xy/m_walk_neutral_01', slow: 'xy/m_walk_slow_01', stop: 'xy/m_walk_stop', sit: 'm_sit_down_chair_01' },
  f: { start: 'xy/f_walk_start', loop: 'xy/f_walk_neutral_01', slow: 'xy/f_walk_slow_01', stop: 'xy/f_walk_stop', sit: 'f_sit_down_chair_01', turn180: 'f_turn_left_180_to_walk' },
};
const TRAVEL = new Set(['start', 'loop', 'slow', 'stop']); // forward travel removed from the clip, the path moves the actor

const fbx = new Map();
function loadFBX(path) {
  if (!fbx.has(path)) fbx.set(path, new Promise((res, rej) => new FBXLoader().load(AVATARS + 'source/' + path + '.fbx', res, undefined, rej)));
  return fbx.get(path);
}
// one processed clip per file, shared by every actor that uses it
const clipCache = new Map();
function loadClip(path, role) {
  const key = path + '|' + role;
  if (!clipCache.has(key)) clipCache.set(key, loadFBX('anim/' + path).then(g => {
    const clip = g.animations[0].clone();
    clip.tracks = clip.tracks.filter(t => !t.name.startsWith('MotionExtractionHelper'));
    const root = clip.tracks.find(t => t.name === 'Bip01.position');
    const rootI = root.clone().createInterpolant();
    if (TRAVEL.has(role)) for (let k = 2; k < root.values.length; k += 3) root.values[k] = 0;
    return { clip, dur: clip.duration, root: t => rootI.evaluate(Math.min(Math.max(t, 0), clip.duration)) };
  }));
  return clipCache.get(key);
}

// the library's specular map, inverted, as a roughness map: rubber soles, leather, denim and skin each get their own sheen
function roughnessFromSpecular(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
      for (let i = 0; i < p.length; i += 4) { const r = 0.42 + 0.56 * (1 - p[i + 1] / 255); p[i] = p[i + 1] = p[i + 2] = Math.round(r * 255); }
      x.putImageData(d, 0, 0);
      const t = new THREE.CanvasTexture(c); t.flipY = true; t.anisotropy = 8; res(t);
    };
    img.onerror = rej; img.src = url;
  });
}

// opts.realistic: physically based cloth and shoes (roughness from the specular map, a little sheen on the fabric);
// opts.wardrobe: a named set of body maps from ../avatars (e.g. 'show': wardrobe_show.py, black trousers and shoes)
export async function createActor(key, texLoader, opts = {}) {
  const W = opts.wardrobe;
  const C = CAST[key], clipNames = CLIPS[C.sex];
  const tex = (name, srgb = true) => { const t = texLoader.load(AVATARS + 'web/' + name); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  const [model, ...clipList] = await Promise.all([loadFBX(C.model), ...Object.entries(clipNames).map(([role, p]) => loadClip(p, role))]);

  const mats = {
    body: opts.realistic
      ? new THREE.MeshPhysicalMaterial({ map: tex(W ? `${C.tex}_body_color_${W}.jpg` : C.body + '.jpg'), normalMap: tex(`${C.tex}_body_normal${W ? '_' + W : ''}.png`, false), normalScale: new THREE.Vector2(1.2, 1.2),
          roughness: 1, roughnessMap: await roughnessFromSpecular(`${AVATARS}web/${C.tex}_body_specular${W ? '_' + W : ''}.jpg`), sheen: 0.3, sheenRoughness: 0.8, sheenColor: new THREE.Color(0x202328) })
      : new THREE.MeshStandardMaterial({ map: tex(C.body + '.jpg'), normalMap: tex(C.tex + '_body_normal.png', false), roughness: 0.78 }),
    head: new THREE.MeshStandardMaterial({ map: tex(C.tex + '_head_color.jpg'), normalMap: tex(C.tex + '_head_normal.png', false), roughness: 0.55 }),
  };
  if (C.opacity) mats.opacity = new THREE.MeshStandardMaterial({ map: tex(C.tex + '_opacity_color.png'), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.6 });
  model.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true; o.frustumCulled = false;
    const pick = m => (/opacity/.test(m.name) ? mats.opacity || mats.head : /head/.test(m.name) ? mats.head : mats.body);
    o.material = Array.isArray(o.material) ? o.material.map(pick) : pick(o.material);
  });
  model.scale.setScalar(C.scale);
  const group = new THREE.Group();
  group.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const bones = {};
  model.traverse(o => { if (o.isBone) bones[o.name] = o; });

  const clips = {};
  Object.keys(clipNames).forEach((role, i) => {
    const c = clipList[i];
    clips[role] = { ...c, action: mixer.clipAction(c.clip), travel: t => c.root(t)[2] * C.scale, dist: c.root(c.dur)[2] * C.scale };
  });

  const segs = [], overlays = [];
  let place = { x: 0, z: 0, y: 0, heading: 0 };   // where the last added segment leaves the actor
  const A = {
    key, group, bones, clips, scale: C.scale, segs,
    get place() { return { ...place }; },

    // stand at a spot (first frame of the walk start clip = a neutral standing pose)
    standAt(x, z, heading = 0, y = 0) { place = { x, z, y, heading }; return A; },

    // walk along a path; `arriveAt` schedules the walk to end at that time, otherwise it starts at `at`
    walk({ path, at, arriveAt, gait = 'loop', startClip = true, endHeading, turnTime = 1.1, yAt = () => 0 }) {
      const pts = [new V(place.x, 0, place.z), ...path.map(([x, z]) => new V(x, 0, z))];
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal'), L = curve.getLength();
      const g = clips[gait], s = clips.start, e = clips.stop;
      const ds = startClip ? s.dist : 0;
      const n = Math.max(1, Math.round((L - ds - e.dist) / g.dist));
      const k = L / (ds + n * g.dist + e.dist); // ≈1: the path matches the stride, so the feet don't slide
      const total = (startClip ? s.dur : 0) + n * g.dur + e.dur;
      let t0 = arriveAt !== undefined ? arriveAt - total : at;
      const parts = [];
      if (startClip) { parts.push({ role: 'start', at: t0, dur: s.dur }); t0 += s.dur; }
      parts.push({ role: gait, at: t0, dur: n * g.dur, loop: true }); t0 += n * g.dur;
      parts.push({ role: 'stop', at: t0, dur: e.dur }); t0 += e.dur;
      const end = t0, startHeading = place.heading;
      const distAt = t => {
        let d = 0;
        for (const p of parts) {
          const lt = clamp01((t - p.at) / p.dur) * p.dur, c = clips[p.role];
          d += p.loop ? Math.floor(lt / c.dur) * c.dist + c.travel(lt % c.dur) : c.travel(lt);
        }
        return Math.min(L, Math.max(0, d * k));
      };
      const tmp = new V(), tan = new V();
      const placeAt = t => {
        const u = clamp01(distAt(t) / L);
        curve.getPointAt(u, tmp); curve.getTangentAt(Math.min(Math.max(u, 0.001), 0.999), tan);
        let h = Math.atan2(tan.x, tan.z);
        // ease into the path direction at the start, and towards endHeading in the last steps
        const startTurn = ramp(t, parts[0].at, parts[0].at + 0.8);
        h = lerpAngle(startHeading, h, startTurn);
        if (endHeading !== undefined) h = lerpAngle(h, endHeading, ramp(t, end - turnTime, end));
        return { x: tmp.x, z: tmp.z, y: yAt(tmp.x, tmp.z), heading: h };
      };
      for (const p of parts) segs.push({ role: p.role, at: p.at, dur: p.dur, loop: p.loop, fade: 0.2, placeAt });
      const last = placeAt(end);
      place = last;
      return { start: parts[0].at, end, length: +L.toFixed(2), slide: +((k - 1) * 100).toFixed(1) };
    },

    // the standing mark from which this actor's sit-down lands the pelvis over `seat` (measured, not assumed)
    sitMark(seat, seatTop) {
      for (const c of Object.values(clips)) { c.action.play(); c.action.setEffectiveWeight(0); }
      clips.sit.action.setEffectiveWeight(1); clips.sit.action.time = clips.sit.dur - 1e-4;
      mixer.update(0); group.position.set(0, 0, 0); group.rotation.set(0, 0, 0); group.updateMatrixWorld(true);
      const off = bones.Bip01_Pelvis.getWorldPosition(new V());
      mixer.stopAllAction();
      A._sit = { lift: seatTop + 0.09 - off.y };
      return [seat[0] - off.x, seat[1] - off.z];
    },
    sit({ at, floorY = 0 }) {
      const p = { ...place }, dur = clips.sit.dur, lift = A._sit.lift - floorY;
      segs.push({ role: 'sit', at, dur, hold: true, fade: 0.35, placeAt: t => ({ ...p, y: floorY + lift * ramp(t, at + dur * 0.45, at + dur * 0.95) }) });
      return { seatedAt: at + dur };
    },

    // the mocap 180° turn, with its own root motion; afterwards the actor's spot and heading are updated
    turn180({ at }) {
      const c = clips.turn180, p = { ...place };
      segs.push({ role: 'turn180', at, dur: c.dur, fade: 0.25, placeAt: () => p });
      const r = c.root(c.dur), off = new V(r[0] * C.scale, 0, r[2] * C.scale).applyAxisAngle(new V(0, 1, 0), p.heading);
      place = { x: p.x + off.x, z: p.z + off.z, y: p.y, heading: p.heading + Math.PI };
      return { end: at + c.dur };
    },

    // hold a still frame of a clip (a neutral standing pose for crew)
    hold(role, { at, time = 'end' }) {
      const p = { ...place }, c = clips[role];
      segs.push({ role, at, dur: 1e9, fixedTime: time === 'end' ? c.dur - 1e-4 : time, fade: 0.3, placeAt: () => p });
    },

    overlay(fn) { overlays.push(fn); },

    // where the actor stands and faces at time t (cameras follow this)
    where(t) {
      segs.sort((a, b) => a.at - b.at);
      let i = segs.findLastIndex(s => t >= s.at);
      if (i < 0) i = 0;
      const cur = segs[i];
      return t < cur.at ? cur.placeAt(cur.at) : cur.placeAt(t);
    },

    pose(t) {
      mixer.stopAllAction();
      for (const c of Object.values(clips)) { c.action.reset(); c.action.play(); c.action.setEffectiveWeight(0); }
      segs.sort((a, b) => a.at - b.at);
      let i = segs.findLastIndex(s => t >= s.at);
      if (i < 0) i = 0;
      const cur = segs[i], lt = Math.max(0, t - cur.at);
      const set = (s, local, w) => {
        const c = clips[s.role];
        c.action.time = s.fixedTime !== undefined ? s.fixedTime : s.loop ? local % c.dur : Math.min(local, c.dur - 1e-4);
        c.action.setEffectiveWeight(c.action.getEffectiveWeight() + w);
      };
      if (i > 0 && lt < cur.fade && segs[i - 1].role !== cur.role) {
        const w = smooth(lt / cur.fade), prev = segs[i - 1];
        set(prev, t - prev.at, 1 - w); set(cur, lt, w);
      } else set(cur, lt, 1);
      mixer.update(0);
      const p = A.where(t);
      group.position.set(p.x, p.y, p.z);
      group.rotation.y = p.heading;
      group.updateMatrixWorld(true);
      for (const f of overlays) f(t, A);
    },

    // which local axis of `bone` moves `tip` most along `want` (actor frame: +z forward, +y up, +x left)?
    calibrate(t, bone, tip, want) {
      A.pose(t);
      const b = bones[bone], tp = bones[tip], inv = group.quaternion.clone().invert();
      if (!b || !tp) throw new Error(`${key}: no bone ${!b ? bone : tip}`);
      const base = tp.getWorldPosition(new V());
      let best = null;
      for (const ax of [new V(1, 0, 0), new V(0, 1, 0), new V(0, 0, 1)]) for (const sgn of [1, -1]) {
        const q0 = b.quaternion.clone();
        b.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(ax.clone().multiplyScalar(sgn), 0.35));
        b.updateWorldMatrix(false, true);
        const d = tp.getWorldPosition(new V()).sub(base).applyQuaternion(inv);
        const score = d.dot(want);
        if (!best || score > best.score) best = { axis: ax.clone().multiplyScalar(sgn), score };
        b.quaternion.copy(q0); b.updateWorldMatrix(false, true);
      }
      return best.axis;
    },
  };
  return A;
}

// rotate a bone about a calibrated local axis, on top of whatever pose the clip produced
const q = new THREE.Quaternion();
export function bend(bone, axis, angle) {
  if (!bone || !angle) return;
  bone.quaternion.multiply(q.setFromAxisAngle(axis, angle));
  bone.updateWorldMatrix(false, true);
}

export function lerpAngle(a, b, k) {
  let d = ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  return a + d * k;
}

/* props */
export function folder() {
  const g = new THREE.Group();
  const cover = new THREE.Mesh(new THREE.BoxGeometry(0.235, 0.006, 0.31), new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.6 }));
  const paper = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.012, 0.297), new THREE.MeshStandardMaterial({ color: 0xe9e6df, roughness: 0.85 }));
  paper.position.set(0.006, 0.009, 0.004);
  const top = cover.clone(); top.position.y = 0.018;
  g.add(cover, paper, top);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
