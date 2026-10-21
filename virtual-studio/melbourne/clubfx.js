// The club's showpieces, in the existing room (room.js), in its own coordinates (x along, z across, y studio height):
//  · D//0 DISCO ZERO: a large mirror ball over the dance floor in front of the booth (clear of the DJ lift's shaft and
//    the truss), mirror tiles on a sphere, a motor and chain, two pin spots on it from the ceiling, and its moving
//    reflections on the walls, floor and ceiling, computed from the tiles that face a pin spot (not painted on);
//  · the PA: two hanging line arrays of eight boxes either side of the back wall, two double-18" subwoofers under
//    each, with perforated grilles; they are scenery (no sound comes out of the page);
//  · ground fog: low, slow layers over the floor after a fog burst, fading away.
// No light is added: the ball's tiles reflect the club's Cycles probe (probes.js), its dots and the pin-spot beams
// are drawn. Levels come from the room's light state (L.disco, L.fogFloor).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { beamMaterial } from '../set.js';
import { ROOM } from './layout.js';

const W = ROOM.w / 2, D = ROOM.d / 2, FLOOR = ROOM.floor, CEIL = ROOM.ceiling;
export const BALL = { x: 0, z: 3.2, y: CEIL - 1.05, r: 0.34 };   // over the dance floor, 1.2 m in front of the DJ lift's shaft

function tex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }

export function buildClubFx({ room, M, lite }) {
  const g = new THREE.Group(); g.name = 'melbourne-clubfx'; room.add(g);
  const mesh = (geo, mat, x, y, z, p = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; p.add(m); return m; };
  const dark = M.dark, steel = new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.85, roughness: 0.35 });

  /* ================= D//0 DISCO ZERO ================= */
  const ball = new THREE.Group(); ball.position.set(BALL.x, BALL.y, BALL.z); g.add(ball);
  // the chain and the motor at the ceiling
  mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 24), steel, BALL.x, CEIL - 0.08, BALL.z);
  mesh(new THREE.CylinderGeometry(0.004, 0.004, CEIL - 0.14 - BALL.y - BALL.r, 6), steel, BALL.x, (CEIL - 0.14 + BALL.y + BALL.r) / 2, BALL.z);
  // the tiles: rows of square mirrors on the sphere, a dark core between them
  mesh(new THREE.SphereGeometry(BALL.r - 0.004, 48, 32), new THREE.MeshStandardMaterial({ color: 0x0a0a0b, roughness: 0.8 }), 0, 0, 0, ball);
  const tile = 0.026, rows = Math.round(Math.PI * BALL.r / tile), mirrors = [];
  for (let i = 1; i < rows; i++) {
    const lat = -Math.PI / 2 + (i / rows) * Math.PI, n = Math.max(6, Math.round(2 * Math.PI * BALL.r * Math.cos(lat) / tile));
    for (let j = 0; j < n; j++) { const lon = (j / n) * Math.PI * 2 + i * 0.37; mirrors.push(new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon))); }
  }
  const mirrorMat = new THREE.MeshStandardMaterial({ color: 0xe9ecf0, metalness: 1, roughness: 0.06 });
  const tiles = new THREE.InstancedMesh(new THREE.PlaneGeometry(tile * 0.92, tile * 0.92), mirrorMat, mirrors.length);
  const o = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0);
  mirrors.forEach((n, i) => { o.position.copy(n).multiplyScalar(BALL.r); o.lookAt(n.clone().multiplyScalar(2 * BALL.r)); o.rotateZ((i % 7) * 0.004); o.updateMatrix(); tiles.setMatrixAt(i, o.matrix); });
  tiles.castShadow = false; ball.add(tiles);
  // two pin spots on the ceiling aimed at the ball, drawn with their beams
  const pins = [[-2.4, 1.9], [2.4, 4.6]].map(([x, z]) => {
    const p = new THREE.Vector3(x, CEIL - 0.25, z), head = new THREE.Group(); head.position.copy(p); g.add(head);
    room.updateMatrixWorld(true); head.lookAt(room.localToWorld(new THREE.Vector3(BALL.x, BALL.y, BALL.z)));
    mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.18, 20).rotateX(Math.PI / 2), dark, 0, 0, 0, head);
    const lens = new THREE.MeshBasicMaterial({ color: 0x000000 }); mesh(new THREE.CircleGeometry(0.035, 20), lens, 0, 0, 0.091, head);
    const bm = beamMaterial(new THREE.Color(1, 0.95, 0.88)), dist = p.distanceTo(new THREE.Vector3(BALL.x, BALL.y, BALL.z));
    const beam = mesh(new THREE.ConeGeometry(Math.tan(0.035) * dist, dist, 20, 1, true).translate(0, -dist / 2, 0).rotateX(-Math.PI / 2), bm, 0, 0, 0, head); beam.castShadow = false;
    return { p, lens, bm };
  });
  // the reflections: one dot per tile that faces a pin spot, where its reflected ray meets the room
  const N = lite ? 120 : 260, pick = Array.from({ length: N }, (_, i) => Math.floor((i * 7919) % mirrors.length));
  const dotTex = tex(64, 64, (x, w) => { const gr = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, w, w); });
  const dotMat = new THREE.MeshBasicMaterial({ map: dotTex, color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const dots = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), dotMat, N); dots.castShadow = dots.receiveShadow = false; dots.frustumCulled = false; g.add(dots);
  const nW = new THREE.Vector3(), d = new THREE.Vector3(), r = new THREE.Vector3(), hit = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const NORMALS = { x: [new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 0, 0)], y: [new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 1, 0)], z: [new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, 1)] };
  const centre = new THREE.Vector3(BALL.x, BALL.y, BALL.z);
  function placeDots(level, rot) {
    for (let k = 0; k < N; k++) {
      const n = mirrors[pick[k]], spot = pins[k % 2].p;
      nW.copy(n).applyAxisAngle(up, rot);
      d.copy(centre).addScaledVector(nW, BALL.r).sub(spot).normalize();
      const facing = -d.dot(nW);
      if (level < 0.002 || facing < 0.15) { dots.setMatrixAt(k, zero); continue; }
      r.copy(d).addScaledVector(nW, -2 * d.dot(nW));
      // the nearest of the room's six faces along r
      let best = Infinity, axis = null, side = 0;
      for (const [a, lo, hi] of [['x', -W + 0.06, W - 0.06], ['y', FLOOR + 0.005, CEIL - 0.01], ['z', -D + 0.06, D - 0.06]]) {
        const v = r[a]; if (Math.abs(v) < 1e-5) continue; const t = ((v > 0 ? hi : lo) - centre[a]) / v; if (t > 0 && t < best) { best = t; axis = a; side = v > 0 ? 0 : 1; }
      }
      hit.copy(centre).addScaledVector(r, best);
      q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), NORMALS[axis][side]);
      const size = 0.05 + best * 0.012; s.set(size, size, 1);
      o.position.copy(hit); o.quaternion.copy(q); o.scale.copy(s); o.updateMatrix(); dots.setMatrixAt(k, o.matrix);
    }
    dots.instanceMatrix.needsUpdate = true;
  }

  /* ================= the PA: line arrays and subwoofers either side of the back wall ================= */
  const grille = tex(256, 256, (x, w) => { x.fillStyle = '#1a1b1e'; x.fillRect(0, 0, w, w); x.fillStyle = '#050506'; for (let i = 0; i < w; i += 6) for (let j = (i / 6) % 2 ? 3 : 0; j < w; j += 6) { x.beginPath(); x.arc(i + 3, j + 3, 1.9, 0, Math.PI * 2); x.fill(); } });
  grille.wrapS = grille.wrapT = THREE.RepeatWrapping;
  const cab = new THREE.MeshPhysicalMaterial({ color: 0x0d0e10, metalness: 0.1, roughness: 0.7, clearcoat: 0.2 });
  const grilleMat = new THREE.MeshStandardMaterial({ map: grille, metalness: 0.75, roughness: 0.5 });
  const badge = tex(256, 64, (x, w, h) => { x.fillStyle = '#0d0e10'; x.fillRect(0, 0, w, h); x.fillStyle = 'rgba(232,234,238,0.75)'; x.font = '700 30px Archivo, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('D//0 AUDIO', w / 2, h / 2); });
  for (const sx of [-1, 1]) {
    const x0 = sx * (W - 1.6), z0 = -D + 1.8;
    const aim = Math.atan2(-x0, 3 - z0);                          // turned towards the dance floor
    // the hanging array: a flown frame, eight boxes splaying downwards
    const arr = new THREE.Group(); arr.position.set(x0, CEIL - 0.35, z0); arr.rotation.y = aim; g.add(arr);
    mesh(new THREE.BoxGeometry(0.78, 0.06, 0.6), steel, 0, 0, 0, arr);
    for (const dx of [-0.3, 0.3]) mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.35, 6), steel, dx, 0.18, 0, arr);
    let y = -0.04, tilt = 0;
    for (let i = 0; i < 8; i++) {
      tilt += i < 3 ? 0.015 : 0.05; const box = new THREE.Group(); box.position.set(0, y - 0.13, 0); box.rotation.x = tilt; arr.add(box);
      mesh(new RoundedBoxGeometry(0.74, 0.25, 0.52, 2, 0.01), cab, 0, 0, 0, box);
      const gm = grilleMat.clone(); gm.map = grille.clone(); gm.map.repeat.set(3, 1); gm.map.needsUpdate = true;
      mesh(new THREE.PlaneGeometry(0.7, 0.21), gm, 0, 0, 0.261, box);
      if (i === 3) mesh(new THREE.PlaneGeometry(0.16, 0.04), new THREE.MeshBasicMaterial({ map: badge, color: 0x666666 }), 0.26, -0.085, 0.263, box);
      y -= 0.25 * Math.cos(tilt);
    }
    // two double-18" subwoofers on the floor under it, the upper one turned like the array
    for (let k = 0; k < 2; k++) {
      const sub = new THREE.Group(); sub.position.set(x0, FLOOR + 0.3 + k * 0.6, z0 - 0.2); sub.rotation.y = aim; g.add(sub);
      mesh(new RoundedBoxGeometry(1.1, 0.58, 0.8, 2, 0.015), cab, 0, 0, 0, sub);
      const gm = grilleMat.clone(); gm.map = grille.clone(); gm.map.repeat.set(4, 2); gm.map.needsUpdate = true;
      mesh(new THREE.PlaneGeometry(1.04, 0.52), gm, 0, 0, 0.401, sub);
      for (const dx of [-0.26, 0.26]) mesh(new THREE.RingGeometry(0.2, 0.215, 40), steel, dx, 0, 0.403, sub);
    }
  }

  /* ================= ground fog: low layers that spread over the floor after a burst and fade ================= */
  const fogTex = tex(256, 256, (x, w) => { const gr = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, w, w); });
  const layers = Array.from({ length: lite ? 6 : 12 }, (_, i) => {
    const m = mesh(new THREE.PlaneGeometry(4.2, 4.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: fogTex, color: 0x000000, transparent: true, depthWrite: false, opacity: 1 }), ((i * 3.3) % 10) - 5, FLOOR + 0.08 + (i % 4) * 0.09, ((i * 2.1) % 7) - 1.5);
    m.castShadow = m.receiveShadow = false; m.renderOrder = 4; m.userData.ph = i * 1.3; return m;
  });

  /* ================= per frame ================= */
  let rot = 0;
  function update(t, dt, L) {
    const disco = L.disco.level;
    rot += dt * 0.22 * L.disco.speed * (disco > 0.01 ? 1 : 0);    // about two turns a minute at speed 1
    ball.rotation.y = rot;
    for (const p of pins) { p.lens.color.setRGB(1, 0.95, 0.88).multiplyScalar(1.8 * disco); p.bm.uniforms.uColor.value.setRGB(1, 0.95, 0.88); p.bm.uniforms.uOpacity.value = 0.22 * disco * (0.3 + 0.7 * L.haze.level); }
    dotMat.color.setRGB(1, 0.96, 0.9).multiplyScalar(0.9 * disco);
    dots.visible = disco > 0.002; if (dots.visible) placeDots(disco, rot);
    const fog = L.fogFloor.level;
    for (const m of layers) { m.visible = fog > 0.003; if (!m.visible) continue; m.position.x += Math.sin(t * 0.07 + m.userData.ph) * dt * 0.12; m.scale.setScalar(1 + 0.15 * Math.sin(t * 0.05 + m.userData.ph));
      m.material.color.copy(L.wash.color).lerp(new THREE.Color(1, 1, 1), 0.6).multiplyScalar(0.28 * fog * (0.35 + 0.65 * Math.max(L.wash.level, L.spot.level, 0.3))); }
  }
  return { group: g, ball, tiles, mirrorMat, dots, pins, update };
}
