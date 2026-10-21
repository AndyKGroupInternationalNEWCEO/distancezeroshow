// Vienna Piano Stage: the studio's own piano area made into a lift stage. A round platform let into the floor under
// the grand (flush with the floor when down, so the grand stands exactly where it always has), a scissor lift with
// hydraulic rams in a pit below it, and a light rig over it. The grand is the studio's own (set.js); this module only
// lifts it. Modelled in code like the rest of the set; sizes and positions come from layout.js.
// Lights: every fixture is drawn, but only a few carry a real three.js light (the rest are lens glow and beam).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { glow, beamMaterial } from '../set.js';
import { AMBER, ICE } from '../screens.js';
import { ROOM, PIANO, STAGE, LIFT, RIG, MIC, platformTop, at } from './layout.js';

const C = { amber: new THREE.Color(AMBER), ice: new THREE.Color(ICE), warm: new THREE.Color('#ffe2c0'), white: new THREE.Color('#fff4e8'),
  tungsten: new THREE.Color('#ffb46b') };

export function buildStage({ studio, scene }) {
  const M = studio.M, piano = studio.piano;
  const root = new THREE.Group(); root.name = 'vienna-stage';
  scene.add(root);
  const add = (o, parent = root) => { parent.add(o); return o; };
  const mesh = (geo, mat, parent = root) => add(new THREE.Mesh(geo, mat), parent);
  const glows = [];   // { m, k, group }: LED materials, levelled each frame by their light group

  /* ----- the pit: its opening in the floor (dark, seen once the platform has risen) and a brushed trim round it ----- */
  const pit = mesh(new THREE.CircleGeometry(LIFT.pit, 96).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x020203, roughness: 0.95, metalness: 0 }));
  pit.position.set(STAGE.x, 0.002, STAGE.z); pit.receiveShadow = true;
  const trim = mesh(new THREE.RingGeometry(LIFT.pit, LIFT.pit + 0.07, 128).rotateX(-Math.PI / 2), M.champagne);
  trim.position.set(STAGE.x, 0.003, STAGE.z);
  const lip = glow(C.amber); glows.push({ m: lip, k: 1.3, group: 'under' });
  const lipRing = mesh(new THREE.RingGeometry(LIFT.pit + 0.075, LIFT.pit + 0.095, 128).rotateX(-Math.PI / 2), lip); lipRing.position.set(STAGE.x, 0.0035, STAGE.z);

  /* ----- the lift: base frame on the pit floor, scissor packs, hydraulic rams, top frame, platform ----- */
  // its scissors run along the grand's length
  const lift = add(new THREE.Group()); lift.position.set(STAGE.x, 0, STAGE.z); lift.rotation.y = PIANO.rotY - Math.PI / 2;
  // the steel picks up the amber glow from under the platform (emissive, set each frame: there is no real light there)
  const steel = M.graphite.clone(), bright = M.alu;
  const FLOOR = -LIFT.depth, BASE_TOP = FLOOR + 0.1, TOP_FRAME = 0.03, xL = -LIFT.arm / 2;
  mesh(new THREE.BoxGeometry(LIFT.arm + 0.5, 0.1, 2.1), steel, lift).position.y = FLOOR + 0.05;
  for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(LIFT.arm + 0.4, 0.05, 0.12), bright, lift).position.set(0, BASE_TOP + 0.025, s * LIFT.packs);   // roller rails
  const armGeo = new THREE.BoxGeometry(1, 0.09, 0.05);                        // scaled to the arm length along x
  const pinGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 14).rotateX(Math.PI / 2);   // along z
  const arms = [], pins = [], hubs = [];
  for (let st = 0; st < LIFT.stages; st++) for (const s of [-1, 1]) for (const k of [0, 1]) arms.push({ m: mesh(armGeo, steel, lift), st, z: s * LIFT.packs + (k ? 0.065 : -0.065), k });
  // cross tubes at every end joint (both packs together) and a pin at every crossing
  for (let lvl = 0; lvl <= LIFT.stages; lvl++) for (const end of [0, 1]) { const p = mesh(pinGeo, M.dark, lift); p.scale.z = 2 * LIFT.packs + 0.3; pins.push({ m: p, lvl, end }); }
  for (let st = 0; st < LIFT.stages; st++) for (const s of [-1, 1]) { const h = mesh(pinGeo, bright, lift); h.scale.z = 0.24; hubs.push({ m: h, st, z: s * LIFT.packs }); }
  // two hydraulic rams between the packs: body pinned to the base, rod to a cross tube on the first stage's arm.
  // The rod (0.5 m) always stays inside the body (0.52 m ahead of its pivot, 0.1 m behind): ram 0.4 … 1.02 m
  const RAM = { body: 0.52, back: 0.1, rod: 0.5, at: 0.3, base: new THREE.Vector3(xL + 0.3, BASE_TOP + 0.04, 0) };
  const bodyGeo = new THREE.CylinderGeometry(0.065, 0.065, 1, 18).translate(0, 0.5, 0);
  const rodGeo = new THREE.CylinderGeometry(0.03, 0.03, 1, 14).translate(0, 0.5, 0);
  const rams = [-0.42, 0.42].map(z => {
    const body = mesh(bodyGeo, M.dark, lift), rod = mesh(rodGeo, M.chrome, lift);
    body.scale.y = RAM.body + RAM.back; rod.scale.y = RAM.rod;
    mesh(new THREE.BoxGeometry(0.16, 0.08, 0.16), steel, lift).position.set(RAM.base.x, RAM.base.y - 0.02, z);   // clevis
    return { body, rod, z };
  });
  const ramTube = mesh(pinGeo, bright, lift); ramTube.scale.z = 2 * LIFT.packs;
  const topFrame = mesh(new THREE.BoxGeometry(LIFT.arm + 0.5, TOP_FRAME, 2.1), steel, lift);

  const platform = add(new THREE.Group()); platform.position.set(STAGE.x, 0, STAGE.z);
  const deckTop = M.riser.clone(); deckTop.color.setHex(0x0a0a0c);
  // the platform's top: down, the studio's own floor shows through it (its tiles and the mirror under them, so the
  // grand and the concert light reflect in it exactly as round it); up, black lacquer with a clear coat, the studio
  // floor's colour, which carries the light and the room in its gloss (no mirror up there)
  const deckGloss = new THREE.MeshPhysicalMaterial({ color: 0x0b0c0f, metalness: 0.2, roughness: 0.22, roughnessMap: M.floor.roughnessMap,
    clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 0.9 });
  const disc = mesh(new THREE.CylinderGeometry(LIFT.r, LIFT.r, LIFT.thick, 128), [deckTop, deckGloss, deckTop], platform); disc.position.y = 0.004 - LIFT.thick / 2;
  // down, with the mirror floor on: the top and the pit's cover stand aside, the studio floor is the platform's top
  const flush = top => { const through = top < 0.001 && M.floor.transparent; deckGloss.visible = !through; pit.visible = !through; };
  disc.receiveShadow = true; disc.castShadow = true;
  mesh(new THREE.CylinderGeometry(LIFT.r + 0.006, LIFT.r + 0.006, 0.03, 128, 1, true), M.champagne, platform).position.y = -0.012;   // brushed edge band
  const underMat = glow(C.amber); glows.push({ m: underMat, k: 2.2, group: 'under' });
  mesh(new THREE.TorusGeometry(LIFT.r - 0.08, 0.016, 6, 128).rotateX(Math.PI / 2), underMat, platform).position.y = -LIFT.thick - 0.006;
  const topRing = glow(C.amber); glows.push({ m: topRing, k: 0.9, group: 'under' });
  mesh(new THREE.TorusGeometry(LIFT.r - 0.05, 0.006, 4, 128).rotateX(Math.PI / 2), topRing, platform).position.y = 0.007;
  disc.userData.focus = 'piano';
  platform.add(vocalMic(M));   // the platform, like the grand on it, opens the studio's piano shot and Piano tab
  const pianoY0 = piano.position.y;
  // the grand's lacquer: on stage it shows more of the room in its reflections (with the studio dimmed around the
  // stage it would read as a black silhouette); back to the studio's own value when the stage is not in use
  const lacquer = new Set(); piano.traverse(o => { if (o.isMesh && o.material.clearcoat === 1 && o.material.color.getHex() === 0x050506) lacquer.add(o.material); });
  const lacquerEnv = [...lacquer][0]?.envMapIntensity ?? 0.9;
  let shine = 0, lacquerMap = null, lacquerK = 1;
  // a look can give the lacquer reflections of its own (concert-look.js: warm softbox strips), used while on stage
  function lacquerLook(map, k = 1) { lacquerMap = map; lacquerK = k; }

  // the scissor geometry for a lift height h; returns the rams' length
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion();
  const placeBar = (m, a, b) => { m.position.copy(a).lerp(b, 0.5); m.scale.x = a.distanceTo(b); m.rotation.set(0, 0, Math.atan2(b.y - a.y, b.x - a.x)); };
  function pose(h) {
    const top = platformTop(h);
    const H = top - LIFT.thick - TOP_FRAME - BASE_TOP;   // height the scissors span
    const s = H / LIFT.stages, span = LIFT.arm * Math.cos(Math.asin(Math.min(0.95, s / LIFT.arm))), xR = xL + span;
    for (const a of arms) {
      const y0 = BASE_TOP + a.st * s, up = a.k === 0;     // in each stage one arm rises from the fixed end, the other falls
      tmpA.set(xL, up ? y0 : y0 + s, a.z); tmpB.set(xR, up ? y0 + s : y0, a.z);
      placeBar(a.m, tmpA, tmpB);
    }
    for (const p of pins) p.m.position.set(p.end ? xR : xL, BASE_TOP + p.lvl * s, 0);
    for (const hb of hubs) hb.m.position.set((xL + xR) / 2, BASE_TOP + hb.st * s + s / 2, hb.z);
    const attach = tmpA.set(xL + RAM.at * span, BASE_TOP + s * (1 - RAM.at), 0);
    ramTube.position.copy(attach);
    const dir = tmpB.copy(attach).sub(RAM.base), len = dir.length(); dir.normalize();
    q.setFromUnitVectors(Y, dir);
    for (const r of rams) {
      r.body.position.set(RAM.base.x - dir.x * RAM.back, RAM.base.y - dir.y * RAM.back, r.z); r.body.quaternion.copy(q);
      r.rod.position.set(attach.x - dir.x * RAM.rod, attach.y - dir.y * RAM.rod, r.z); r.rod.quaternion.copy(q);
    }
    topFrame.position.y = top - LIFT.thick - TOP_FRAME / 2;
    platform.position.y = top;
    flush(top);
    piano.position.y = pianoY0 + top;                     // the studio's grand rides on the platform
    return len;
  }
  pose(0);
  lift.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });

  /* ----- the light rig ----- */
  const rig = buildRig({ studioLights: studio.lights, M, add, mesh });

  /* ----- the optional key light: soft, warm, no shadow; added to the scene (not to `root`, which is hidden when out
     of view: a light hidden with it would change the light count) and lit only while the stage is in use ----- */
  let key = null, keyK = 0;
  function keyLight(on) {
    if (on && !key) {
      key = new THREE.SpotLight(0xfff1e2, 0, 0, RIG.key.angle, 1, 2);
      scene.add(key, key.target);
    } else if (!on && key) { scene.remove(key, key.target); key = null; }
  }

  /* ----- per frame: `L` is the light state from index.js (each group's level and colour, the haze) ----- */
  function update(t, dt, h, L, seen = true, active = false) {
    pose(h);
    studio.lights.pianoLift(platformTop(h));
    if (key) {
      keyK += ((active ? 1 : 0) - keyK) * Math.min(1, dt * 2);
      key.position.set(RIG.key.pos[0], RIG.key.pos[1] + RIG.key.rise * h, RIG.key.pos[2]);
      key.target.position.set(STAGE.x, platformTop(h) + 0.85, STAGE.z);
      key.intensity = RIG.key.level * keyK;
    }
    shine += ((active ? 1 : 0) - shine) * Math.min(1, dt * 2);
    const own = lacquerMap && shine > 0.5;
    for (const m of lacquer) { m.envMap = own ? lacquerMap : null; m.envMapIntensity = own ? lacquerEnv * lacquerK * shine : lacquerEnv * (1 + 1.4 * shine); }
    if (!seen) return rig.dark();
    steel.emissive.copy(L.under.color).multiplyScalar(0.07 * L.under.level * Math.min(1, h / 0.6));
    for (const { m, k, group } of glows) {
      const g = L[group];
      m.color.copy(g.color).multiplyScalar(k * g.level * (1 + 0.25 * Math.sin(t * 2.2) * (g.pulse || 0)));
    }
    rig.update(t, dt, platformTop(h), L, active);
  }

  const R = Math.max(RIG.perimeter.r, 3.2) + 0.5;
  return { root, piano, platform, lift, pose, update, rig, keyLight, lacquerLook, get key() { return !!key; },
    bounds: new THREE.Box3(new THREE.Vector3(STAGE.x - R, -LIFT.depth, STAGE.z - R), new THREE.Vector3(STAGE.x + R, ROOM.H, STAGE.z + R)) };
}

/* ---------- the singer's microphone: a boom stand with a dynamic vocal mic (visual only, no audio) ---------- */
// Built to the real thing's sizes: a bevelled cast-iron round base (Ø 30 cm) with a rubber ring, a matt black powder-coated
// telescopic pole (lower tube Ø 22 mm, upper Ø 17 mm) with its height clutch, a boom clutch with a T-knob, a Ø 13 mm
// boom with an end counterweight, a C-clip holding the mic by its handle, and the mic itself: a 16 cm handheld
// dynamic (tapered satin handle, XLR socket, chrome ring, a woven-wire ball grille Ø 5 cm). The cable leaves the XLR,
// hangs in a short loop and runs along the boom and down the pole to the floor, towards the middle of the platform.
// Placed in the piano's frame (MIC in layout.js), well inside the platform's edge.
function vocalMic(M) {
  const g = new THREE.Group(); g.name = 'vienna-mic';
  const local = (along, across, y) => { const [x, z] = at(along, across); return new THREE.Vector3(x - STAGE.x, y, z - STAGE.z); };
  const powder = new THREE.MeshStandardMaterial({ color: 0x141416, metalness: 0.35, roughness: 0.62 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, metalness: 0, roughness: 0.9 });
  const handle = new THREE.MeshPhysicalMaterial({ color: 0x232428, metalness: 0.55, roughness: 0.34, clearcoat: 0.3, clearcoatRoughness: 0.4 });
  // the grille: fine woven wire (a canvas weave as colour and bump), silver-grey, over a dark foam windscreen
  const weave = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'); x.fillStyle = '#1b1b1b'; x.fillRect(0, 0, 64, 64);
    x.strokeStyle = '#d6d9dd'; x.lineWidth = 3;
    for (let i = 0; i < 64; i += 8) { x.beginPath(); x.moveTo(i + 2, 0); x.lineTo(i + 2, 64); x.stroke(); x.beginPath(); x.moveTo(0, i + 2); x.lineTo(64, i + 2); x.stroke(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(30, 10); t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const grille = new THREE.MeshStandardMaterial({ color: 0xc4c8cd, map: weave, bumpMap: weave, bumpScale: 0.6, metalness: 0.9, roughness: 0.42 });
  const foam = new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 1 });
  const add = (geo, mat, pos, parent = g) => { const m = new THREE.Mesh(geo, mat); if (pos) m.position.copy(pos); parent.add(m); m.castShadow = true; return m; };
  const tube = (from, to, r, mat) => {   // a cylinder from one point to another
    const d = to.clone().sub(from), m = add(new THREE.CylinderGeometry(r, r, d.length(), 16), mat, from.clone().addScaledVector(d, 0.5));
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return m;
  };
  const lathe = (pts, segs = 40) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs);

  const base = local(...MIC.base, 0), top = base.clone().setY(MIC.pole), cap = local(...MIC.capsule), aim = local(...MIC.aim);
  // the base: a low bevelled disc on a rubber ring
  add(new THREE.CylinderGeometry(0.115, 0.15, 0.026, 64), powder, base.clone().setY(0.017));
  add(new THREE.CylinderGeometry(0.03, 0.04, 0.012, 24), powder, base.clone().setY(0.036));
  add(new THREE.CylinderGeometry(0.146, 0.146, 0.004, 48), rubber, base.clone().setY(0.002));
  // the pole: lower tube, height clutch, upper tube
  const clutchY = MIC.pole * 0.58;
  tube(base.clone().setY(0.03), base.clone().setY(clutchY), 0.011, powder);
  add(lathe([[0, -0.03], [0.016, -0.03], [0.018, -0.02], [0.018, 0.02], [0.013, 0.03], [0, 0.03]], 24), powder, base.clone().setY(clutchY));
  add(new THREE.CylinderGeometry(0.006, 0.006, 0.03, 10).rotateZ(Math.PI / 2), rubber, base.clone().setY(clutchY).add(new THREE.Vector3(0.03, 0, 0)));   // clutch screw
  tube(base.clone().setY(clutchY), top, 0.0085, powder);
  // the mic's pose: its axis points at the singer's mouth; the clip holds it 5 cm behind the grille, the clip's stud
  // meets the boom 3 cm below the handle
  const axis = aim.clone().sub(cap).normalize();
  const mic = new THREE.Group(); mic.position.copy(cap); g.add(mic);
  mic.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
  const clipAt = cap.clone().addScaledVector(axis, -0.06), boomEnd = clipAt.clone().add(new THREE.Vector3(0, -0.035, 0));
  // the boom clutch (a block with a T-knob), the boom with its counterweight
  const dir = boomEnd.clone().sub(top).normalize(), tail = top.clone().addScaledVector(dir, -0.26);
  const clutch = add(new RoundedBoxGeometry(0.045, 0.06, 0.045, 2, 0.008), powder, top);
  clutch.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(dir.x, 0, dir.z).normalize());
  const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  tube(top, top.clone().addScaledVector(side, 0.05), 0.005, powder);
  tube(top.clone().addScaledVector(side, 0.05).add(new THREE.Vector3(0, -0.02, 0)), top.clone().addScaledVector(side, 0.05).add(new THREE.Vector3(0, 0.02, 0)), 0.007, rubber);
  tube(tail, boomEnd, 0.0065, powder);
  tube(tail, tail.clone().addScaledVector(dir, 0.07), 0.021, powder);                                  // counterweight
  tube(tail.clone().addScaledVector(dir, -0.004), tail.clone().addScaledVector(dir, 0.002), 0.017, rubber);   // its end cap
  tube(boomEnd, clipAt.clone().add(new THREE.Vector3(0, -0.016, 0)), 0.004, powder);                    // the clip's stud
  // the mic (in its own frame: +z towards the mouth, 0 = the ring under the grille)
  const body = add(lathe([[0, -0.112], [0.0105, -0.112], [0.0112, -0.104], [0.0122, -0.09], [0.0155, -0.03], [0.0168, -0.012], [0.017, 0]]), handle, null, mic);
  body.geometry.rotateX(Math.PI / 2);
  add(new THREE.CylinderGeometry(0.0182, 0.0182, 0.007, 32).rotateX(Math.PI / 2), M.chrome, new THREE.Vector3(0, 0, 0.0035), mic);   // the ring
  add(new THREE.CylinderGeometry(0.0085, 0.0085, 0.006, 20).rotateX(Math.PI / 2), M.chrome, new THREE.Vector3(0, 0, -0.114), mic);   // the XLR socket
  const R = 0.0245, C = 0.026, ball = [[0.0185, 0.007], [0.0225, 0.01], [R, 0.016]];
  for (let i = 0; i <= 12; i++) { const a = (i / 12) * Math.PI / 2; ball.push([+(R * Math.cos(a)).toFixed(5) || 0, C + R * Math.sin(a)]); }
  add(lathe(ball, 48), grille, null, mic).geometry.rotateX(Math.PI / 2);
  add(new THREE.SphereGeometry(R - 0.002, 24, 16), foam, new THREE.Vector3(0, 0, C - 0.004), mic);
  const clip = add(new THREE.TorusGeometry(0.0175, 0.0035, 8, 24, Math.PI * 1.55), powder, new THREE.Vector3(0, 0, -0.06), mic);
  clip.rotation.z = -Math.PI / 2 + Math.PI * 0.225;   // the C opens upwards, the mic sits in it
  // the cable: out of the XLR, a short drop, taped along under the boom, down the pole, onto the floor towards the
  // middle of the platform
  const xlr = cap.clone().addScaledVector(axis, -0.12), down = new THREE.Vector3(0, -1, 0), inward = base.clone().negate().setY(0).normalize();
  const boomLen = boomEnd.distanceTo(top), under = f => top.clone().addScaledVector(dir, boomLen * f).addScaledVector(down, 0.011);
  const pole = y => base.clone().setY(y).addScaledVector(side, -0.013);
  const cable = new THREE.CatmullRomCurve3([
    xlr, xlr.clone().addScaledVector(axis, -0.025).addScaledVector(down, 0.035), under(0.86), under(0.6), under(0.3), under(0.08),
    pole(MIC.pole - 0.07), pole(clutchY + 0.05), pole(clutchY - 0.05), pole(0.3), pole(0.09),
    base.clone().setY(0.03).addScaledVector(inward, 0.16), base.clone().setY(0.004).addScaledVector(inward, 0.24),
    base.clone().setY(0.003).addScaledVector(inward, 0.6),
  ], false, 'centripetal');
  add(new THREE.TubeGeometry(cable, 120, 0.003, 8), rubber);
  return g;
}

/* ---------- the light rig: perimeter ring, moving heads, accents, the performance spot, the under-platform LED ---------- */
// Groups are addressed by name; `L` (from index.js) holds each group's level, colour and, for the moving heads, the
// pattern. Real lights (the rest is glow and beam): two for the perimeter ring, two of the four moving heads, one back
// rim, the performance spot (the only one with a shadow) and the light under the platform. Phones: three in all.
function buildRig({ studioLights, M, add, mesh }) {
  // a small ring truss over the grand, hung from the studio ceiling; the moving heads on drop pipes inside it
  const ring = add(new THREE.Group()); ring.position.set(STAGE.x, RIG.perimeter.y, STAGE.z);
  mesh(new THREE.TorusGeometry(RIG.perimeter.r, 0.04, 8, 128).rotateX(Math.PI / 2), M.brushed, ring);
  mesh(new THREE.TorusGeometry(RIG.perimeter.r, 0.04, 8, 128).rotateX(Math.PI / 2), M.brushed, ring).position.y = 0.22;
  const drop = (x, z, from) => { const p = mesh(new THREE.CylinderGeometry(0.025, 0.025, ROOM.H - from, 8), M.brushed); p.position.set(x, (ROOM.H + from) / 2, z); };
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; drop(STAGE.x + Math.cos(a) * RIG.perimeter.r, STAGE.z + Math.sin(a) * RIG.perimeter.r, RIG.perimeter.y); }
  for (const [x, y, z] of RIG.moving) drop(x, z, y + 0.3);
  for (const [x, y, z] of RIG.accent.slice(2)) drop(x, z, y + 0.1);
  drop(RIG.spot[0], RIG.spot[2], RIG.spot[1] + 0.1);

  const bodyGeo = new THREE.CylinderGeometry(0.13, 0.16, 0.42, 20).rotateX(Math.PI / 2);   // along +z, the lens at +z
  const lensGeo = new THREE.CircleGeometry(0.115, 24);
  // a fixture: body and lens aimed along its +z (use lookAt), a beam cone, and its own lens glow
  const fixture = (pos, group, { scale = 1, beamAngle = 0.14, color = C.white, low = false } = {}) => {
    const g = add(new THREE.Group()); g.position.copy(pos);
    const head = add(new THREE.Group(), g);
    const body = mesh(bodyGeo, M.graphite, head); body.scale.setScalar(scale); body.castShadow = false;
    const lm = glow(color);
    const lens = mesh(lensGeo, lm, head); lens.position.z = 0.215 * scale; lens.scale.setScalar(scale);
    const beam = mesh(new THREE.ConeGeometry(Math.tan(beamAngle), 1, 28, 1, true).translate(0, -0.5, 0).rotateX(-Math.PI / 2), beamMaterial(color), head);
    beam.position.z = 0.22 * scale;
    return { g, head, lens: lm, beam, group, low, aim: new THREE.Vector3() };
  };

  const fixtures = [];
  for (let i = 0; i < RIG.perimeter.n; i++) {
    const a = ((i + 0.5) / RIG.perimeter.n) * Math.PI * 2;
    fixtures.push(fixture(new THREE.Vector3(STAGE.x + Math.cos(a) * RIG.perimeter.r, RIG.perimeter.y - 0.25, STAGE.z + Math.sin(a) * RIG.perimeter.r), 'perimeter', { beamAngle: 0.17, color: C.warm }));
  }
  const movers = RIG.moving.map(p => {
    const f = fixture(new THREE.Vector3(...p), 'moving', { scale: 1.1, beamAngle: 0.07, color: C.white });
    // a moving head's base and yoke above the head
    mesh(new RoundedBoxGeometry(0.42, 0.16, 0.34, 2, 0.03), M.graphite, f.g).position.y = 0.26;
    const yoke = mesh(new THREE.BoxGeometry(0.46, 0.06, 0.08), M.graphite, f.g); yoke.position.y = 0.16;
    return f;
  });
  const accents = RIG.accent.map((p, i) => fixture(new THREE.Vector3(...p), 'accent', { scale: i < 2 ? 0.8 : 1, beamAngle: 0.2, color: C.amber, low: i < 2 }));
  const spotF = fixture(new THREE.Vector3(...RIG.spot), 'spot', { scale: 1.5, beamAngle: 0.1, color: C.tungsten });
  fixtures.push(...movers, ...accents, spotF);

  // No real lights of its own: every three.js light added here would cost every lit surface of the studio, on every
  // shot (measured: 7 lights more than doubled the broadcast frame time, even with the stage out of view). Instead the
  // studio's own two piano lights, which already follow the grand up (set.js `pianoLift`), are the stage's key and
  // performance spot while the stage is in use, and the rest is drawn: beams in the haze, lens glow, pools of light on
  // the platform, the glow in the pit.
  const studioTop = studioLights.piano.top, studioSolo = studioLights.piano.solo;
  const poolTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,0.55)'); g.addColorStop(0.8, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const poolGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const pool = () => { const m = mesh(poolGeo, new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0x000000 })); m.renderOrder = 2; m.castShadow = m.receiveShadow = false; return m; };
  const moverPools = movers.map(() => pool()), washPool = pool(), spotPool = pool(), pitGlow = pool();

  const aim = new THREE.Vector3(), tmp = new THREE.Vector3(), col = new THREE.Color();
  const center = new THREE.Vector3(STAGE.x, 0, STAGE.z);   // the middle of the grand on the platform
  // where a moving head points, for its pattern
  const moverAim = (i, pattern, t, top, out) => {
    const phase = i * Math.PI * 0.5;
    if (pattern === 'sweep') return out.set(STAGE.x + Math.cos(t * 0.35 + phase) * 1.5, top, STAGE.z + Math.sin(t * 0.35 + phase) * 1.5);
    if (pattern === 'fast') return out.set(STAGE.x + Math.cos(t * 1.1 + phase) * 1.7, top + 0.4 * (0.5 + 0.5 * Math.sin(t * 0.7 + i)), STAGE.z + Math.sin(t * 1.3 + phase) * 1.7);
    if (pattern === 'track') return out.set(STAGE.x + Math.cos(phase + 0.8) * (LIFT.r - 0.1), top - LIFT.thick, STAGE.z + Math.sin(phase + 0.8) * (LIFT.r - 0.1));
    return out.set(STAGE.x + (i % 2 ? 0.6 : -0.6), top + 0.9, STAGE.z + (i < 2 ? -0.5 : 0.3));   // 'center': a soft cross on the piano
  };
  // a pool of light where a beam from `from` towards `to` meets the platform top (hidden when it misses the platform)
  const onPlatform = (m, from, to, top, angle, color, k) => {
    const s = (top + 0.012 - from.y) / (to.y - from.y);
    tmp.copy(to).sub(from).multiplyScalar(s).add(from);
    const r = Math.hypot(tmp.x - STAGE.x, tmp.z - STAGE.z), size = 2.4 * Math.tan(angle) * from.distanceTo(tmp);
    m.visible = s > 0 && r < LIFT.r - 0.1 && k > 0.005;
    m.position.copy(tmp); m.scale.set(size, 1, size);
    m.material.color.copy(color).multiplyScalar(k);
  };

  return {
    fixtures,
    // what lights the stage for real: the studio's own piano lights (read by tests)
    real: { perimeter: [studioTop], spot: [studioSolo] },
    dark() { for (const m of [...moverPools, washPool, spotPool, pitGlow]) m.visible = false; },
    // `active`: the stage is in use (a Vienna camera, the lift up or moving, the sequence): its modes then drive the
    // studio's two piano lights; otherwise those stay as the studio sets them
    update(t, dt, top, L, active) {
      center.y = top + 0.9;
      for (const f of fixtures) {
        const g = L[f.group];
        if (f.group === 'moving') moverAim(movers.indexOf(f), g.pattern, t, top, aim); else aim.copy(center);
        if (f.low) aim.set(STAGE.x, top + 1.6, STAGE.z);   // the floor backlights skim the piano's back into the haze
        f.aim.copy(aim);
        f.head.lookAt(aim);
        f.beam.scale.setScalar(f.g.position.distanceTo(aim));
        col.copy(g.color);
        f.beam.material.uniforms.uColor.value.copy(col);
        f.beam.material.uniforms.uOpacity.value = 0.11 * g.level * L.haze * (f.group === 'spot' ? 1.4 : 1);
        f.beam.visible = g.level * L.haze > 0.01;
        f.lens.color.copy(col).multiplyScalar(2.2 * g.level);
      }
      movers.forEach((f, i) => onPlatform(moverPools[i], f.g.position, f.aim, top, 0.07, L.moving.color, 0.55 * L.moving.level));
      onPlatform(spotPool, spotF.g.position, center, top, 0.11, L.spot.color, 0.5 * L.spot.level);
      washPool.visible = L.perimeter.level > 0.005; washPool.position.set(STAGE.x, top + 0.011, STAGE.z); washPool.scale.set(4.6, 1, 4.6);
      washPool.material.color.copy(L.perimeter.color).multiplyScalar(0.18 * L.perimeter.level);
      // the glow in the pit under a raised platform
      pitGlow.visible = top > 0.05 && L.under.level > 0.005; pitGlow.position.set(STAGE.x, 0.004, STAGE.z); pitGlow.scale.set(4.4, 1, 4.4);
      pitGlow.material.color.copy(L.under.color).multiplyScalar(0.6 * L.under.level * Math.min(1, top / 0.6) * (1 + 0.25 * Math.sin(t * 2.2) * L.under.pulse));
      if (!active) return;
      studioSolo.color.copy(L.spot.color); studioSolo.intensity = 700 * L.spot.level;
      studioTop.color.copy(L.perimeter.color); studioTop.intensity = 280 * L.perimeter.level;
    },
  };
}
