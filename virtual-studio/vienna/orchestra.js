// OPUS V ORCHESTRA ROOM (approved 29 Oct 2026): a hidden room behind the grand, beyond the studio's Vienna-side wall,
// where the first build of the Piano Stage had its annex (19 Oct; its source: production/opus-v/recovered-annex-2026-10-19,
// whose back wall of fins with amber LED strips and whose deck with its amber edge come back here). 6 × 4.5 × 4 m.
// Closed, four panels carrying the studio's own fins and light lines fill the wall's opening (set.js OPUS_WALL), and
// nothing tells it from the rest of the wall. One click: the panels step back behind the wall's line and slide aside
// into its pockets; behind them a riser with four places for string players, four music stands with their lights,
// acoustic walls, the back wall's amber, pinspots on the four places. No players and no OPUS V identity yet: those wait
// for the official material.
//   setOpen(on) · toggle() · update(dt, work) · get open (0 … 1) · get target
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { OPUS_WALL } from '../set.js';

const R = 12.6, Z = 1, W = 6, D = 4.5, H = 4.0, OPEN = 5.0, FIN_STEP = 0.075;
// STAGE CONFIGURATION: STRING QUARTET (the approved room's four places: first violin, second violin, viola, cello, from
// the audience's left). The CHAMBER ORCHESTRA configuration waits for the owner's decision on the room's size: it does
// not fit 6 × 4.5 m. Places: [across the wall (x), depth from the wall's line (z)], in the group's frame (+z out of the studio)
export const OPUS_PLACES = [[-1.9, 2.5], [-0.65, 2.2], [0.65, 2.2], [1.9, 2.5]];
export const QUARTET = ['First violin', 'Second violin', 'Viola', 'Cello'];

export function buildOrchestra({ M, scene }) {
  const a = OPUS_WALL.a, g = new THREE.Group(); g.name = 'opus-v-room';
  g.position.set(R * Math.sin(a), 0, Z + R * Math.cos(a)); g.rotation.y = a; scene.add(g);   // local +z: out of the studio
  const add = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  const room = new THREE.Group(); g.add(room); room.visible = false;

  /* ----- the panels: the wall's own skin, fins and light lines on four sliding leaves ----- */
  const skin = M.wallBack.clone(); skin.side = THREE.DoubleSide;
  const stripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xf2a650).multiplyScalar(1.6), toneMapped: false });
  const panelW = OPEN / 4, panels = [];
  // the studio's fin grid, as set.js lays it from its first angle (π − 1.95) every 0.075 rad
  const A0 = Math.PI - 1.95, finAt = [], stripAt = [];
  for (let f = A0; f <= Math.PI + 1.95; f += FIN_STEP) { if (f > OPUS_WALL.a0 - 0.01 && f < OPUS_WALL.a1 + 0.01) finAt.push(f); if (f + 0.0375 > OPUS_WALL.a0 && f + 0.0375 < OPUS_WALL.a1) stripAt.push(f + 0.0375); }
  for (let i = 0; i < 4; i++) {
    const x0 = -OPEN / 2 + i * panelW, cx = x0 + panelW / 2, p = new THREE.Group(); p.userData = { cx, side: cx < 0 ? -1 : 1 }; g.add(p); p.position.set(cx, 0, 0);
    // (on the wall's arc: a point at angle f lies at x = r sin(f − a), z = r cos(f − a) − R in this frame)
    const da = cx / R; add(new THREE.BoxGeometry(panelW + 0.02, H, 0.05), skin, 0, H / 2, (R + 0.6) * Math.cos(da) - R, p).rotation.y = da;
    const mine = x => Math.max(0, Math.min(3, Math.floor((x + OPEN / 2) / panelW))) === i;   // each fin and line on its nearest leaf (the edge ones too)
    for (const f of finAt) { const x = R * Math.sin(f - a); if (mine(x)) add(new THREE.BoxGeometry(0.16, H, 0.7), M.fin, x - cx, H / 2, R * Math.cos(f - a) - R, p).rotation.y = f - a; }
    for (const f of stripAt) { const x = (R + 0.3) * Math.sin(f - a); if (mine(x)) { const s = add(new THREE.BoxGeometry(0.025, H - 0.7, 0.025), stripMat, x - cx, 0.7 + (H - 0.7) / 2, (R + 0.3) * Math.cos(f - a) - R, p); s.castShadow = false; } }
    panels.push(p);
  }

  /* ----- the room ----- */
  const oak = new THREE.MeshPhysicalMaterial({ color: 0x2a1f17, roughness: 0.42, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.3 });
  const fabric = new THREE.MeshStandardMaterial({ color: 0x17171b, roughness: 0.96, metalness: 0 });
  const amber = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });   // the back wall's LED strips (levelled per frame)
  const zc = 0.6 + D / 2;
  add(new THREE.BoxGeometry(W, 0.05, D), oak, 0, -0.025, zc, room);
  add(new THREE.BoxGeometry(W, 0.06, D), fabric, 0, H + 0.03, zc, room);
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.08, H, D), fabric, sx * W / 2, H / 2, zc, room);
  add(new THREE.BoxGeometry(W, H, 0.08), fabric, 0, H / 2, 0.6 + D + 0.04, room);
  // the back wall, as the annex had it: dark fins with amber LED strips between them
  for (let x = -W / 2 + 0.45; x <= W / 2 - 0.44; x += 0.6) {
    add(new RoundedBoxGeometry(0.12, H - 0.5, 0.28, 2, 0.02), M.fin, x, H / 2, 0.6 + D - 0.14, room);
    const s = add(new THREE.BoxGeometry(0.03, H - 0.9, 0.02), amber, x + 0.3, H / 2, 0.6 + D - 0.05, room); s.castShadow = false;
  }
  // wooden diffusers on the side walls (acoustics), the riser with its amber front edge and one step
  for (const sx of [-1, 1]) for (let k = 0; k < 7; k++) add(new THREE.BoxGeometry(0.06, 0.6 + (k % 3) * 0.25, 0.08), oak, sx * (W / 2 - 0.08), 2.2, 1.0 + k * 0.55, room);
  const RZ0 = 1.3, RZ1 = 3.5, RH = 0.3;
  add(new RoundedBoxGeometry(W - 0.8, RH, RZ1 - RZ0, 2, 0.02), oak, 0, RH / 2, (RZ0 + RZ1) / 2, room);
  add(new THREE.BoxGeometry(W - 0.8, RH / 2, 0.3), oak, 0, RH / 4, RZ0 - 0.15, room);
  const edge = add(new THREE.BoxGeometry(W - 0.8, 0.012, 0.012), amber, 0, RH + 0.006, RZ0 + 0.01, room); edge.castShadow = false;

  // four places: a black concert chair on chrome legs, and a professional music stand turned to it, with its light
  const leather = M.leather || fabric, chrome = M.chrome || M.brushed, standLight = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
  const look = new THREE.Vector3(0, 1.2, -9);   // towards the grand
  for (const [x, z] of OPUS_PLACES) {
    const c = new THREE.Group(); c.position.set(x, RH, z); room.add(c); c.rotation.y = Math.atan2(look.x - x, look.z - z);   // (in this frame: +z of the chair to the grand)
    add(new RoundedBoxGeometry(0.46, 0.06, 0.44, 2, 0.02), leather, 0, 0.48, 0, c);
    add(new RoundedBoxGeometry(0.44, 0.42, 0.05, 2, 0.02), leather, 0, 0.78, -0.2, c).rotation.x = -0.12;
    for (const [lx, lz] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) add(new THREE.CylinderGeometry(0.012, 0.012, 0.46, 10), chrome, lx, 0.23, lz, c);
    const s = new THREE.Group(); s.position.set(0, 0, 0.62); c.add(s);
    add(new THREE.CylinderGeometry(0.012, 0.014, 1.05, 12), chrome, 0, 0.53, 0, s);
    for (let k = 0; k < 3; k++) { const leg = add(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 8), chrome, Math.cos(k * 2.09) * 0.14, 0.06, Math.sin(k * 2.09) * 0.14, s); leg.rotation.set(Math.sin(k * 2.09) * 1.2, 0, -Math.cos(k * 2.09) * 1.2); }
    const desk = add(new RoundedBoxGeometry(0.52, 0.36, 0.015, 2, 0.006), M.graphite || chrome, 0, 1.12, 0, s); desk.rotation.x = 0.35;
    add(new THREE.BoxGeometry(0.5, 0.02, 0.04), M.graphite || chrome, 0, 0.95, -0.06, s);   // its ledge
    const lamp = add(new THREE.BoxGeometry(0.16, 0.015, 0.03), standLight, 0, 1.3, -0.08, s); lamp.castShadow = false;
  }

  /* ----- light: a soft warm top light over the riser and the back wall's amber (real lights, dark while closed),
     a pinspot's pool on each place, the stand lights; CLEANING MODE turns the top light white ----- */
  const top = new THREE.RectAreaLight(0xffe7c8, 0, W - 1.2, D - 1.2); top.position.set(0, H - 0.05, zc); g.add(top);
  const wash = new THREE.RectAreaLight(0xf2a650, 0, W - 0.6, H - 0.6); wash.position.set(0, H / 2, 1.2); g.add(wash);
  // aimed in the world (lookAt takes world points): the top light down onto the riser, the wash at the back wall
  g.updateMatrixWorld(true); top.lookAt(g.localToWorld(new THREE.Vector3(0, 0, zc))); wash.lookAt(g.localToWorld(new THREE.Vector3(0, H / 2, 0.6 + D)));
  const poolTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,226,180,1)'); gr.addColorStop(0.5, 'rgba(255,226,180,0.45)'); gr.addColorStop(1, 'rgba(255,226,180,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
  const pools = OPUS_PLACES.map(([x, z]) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0x000000 })); m.position.set(x, RH + 0.01, z + 0.15); room.add(m); return m; });
  const WORK = new THREE.Color(0xf4f2ee), WARM = new THREE.Color(0xffe7c8);

  /* ----- opening and closing: 7 s, eased; the panels back 1 m, then aside 2.6 m; the light comes up back to front ----- */
  let k = 0, target = 0;
  const ss = THREE.MathUtils.smoothstep;
  return {
    group: g,
    get open() { return k; }, get target() { return target; },
    setOpen(on) { target = on ? 1 : 0; }, toggle() { target = target ? 0 : 1; },
    // where a camera looks in from the studio, and the room's middle (for the cinematic move)
    view: { from: new THREE.Vector3(0, 1.6, -2.5), at: new THREE.Vector3(0, 1.1, 2.6) },
    toWorld(v) { return g.localToWorld(v.clone()); },
    update(dt, work = 0) {
      k = THREE.MathUtils.clamp(k + Math.sign(target - k) * dt / 7, 0, 1);
      const back = ss(k, 0, 0.28), aside = ss(k, 0.22, 1);
      for (const p of panels) p.position.set(p.userData.cx + p.userData.side * 2.6 * aside, 0, back * 1.0);
      room.visible = k > 0.001;
      const wall = ss(k, 0.3, 0.7), spots = ss(k, 0.5, 0.9), stands = ss(k, 0.7, 1);
      amber.color.setRGB(0.95, 0.6, 0.25).multiplyScalar(1.7 * wall);
      wash.intensity = 1.6 * wall;
      top.color.copy(WARM).lerp(WORK, Math.min(1, work * 3)); top.intensity = 3.2 * spots * (1 - Math.min(1, work)) + 4.2 * work * (k > 0.01 ? 1 : 0);
      for (const m of pools) m.material.color.setScalar(0.55 * spots * (1 - Math.min(1, work)));
      standLight.color.setRGB(1, 0.9, 0.75).multiplyScalar(1.4 * stands);
      return k;
    },
  };
}
