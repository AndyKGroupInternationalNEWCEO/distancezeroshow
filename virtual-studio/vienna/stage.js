// Vienna Piano Stage: the studio's own piano area made into a lift stage. A round platform let into the floor under
// the grand (flush with the floor when down, so the grand stands exactly where it always has), a scissor lift with
// hydraulic rams in a pit below it, and a light rig over it. The grand is the studio's own (set.js); this module only
// lifts it. Modelled in code like the rest of the set; sizes and positions come from layout.js.
// Lights: every fixture is drawn, but only a few carry a real three.js light (the rest are lens glow and beam).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { glow, beamMaterial } from '../set.js';
import { AMBER, ICE } from '../screens.js';
import { ROOM, PIANO, STAGE, LIFT, RIG, platformTop } from './layout.js';

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
  const disc = mesh(new THREE.CylinderGeometry(LIFT.r, LIFT.r, LIFT.thick, 128), deckTop, platform); disc.position.y = 0.004 - LIFT.thick / 2;
  disc.receiveShadow = true; disc.castShadow = true;
  mesh(new THREE.CylinderGeometry(LIFT.r + 0.006, LIFT.r + 0.006, 0.03, 128, 1, true), M.champagne, platform).position.y = -0.012;   // brushed edge band
  const underMat = glow(C.amber); glows.push({ m: underMat, k: 2.2, group: 'under' });
  mesh(new THREE.TorusGeometry(LIFT.r - 0.08, 0.016, 6, 128).rotateX(Math.PI / 2), underMat, platform).position.y = -LIFT.thick - 0.006;
  const topRing = glow(C.amber); glows.push({ m: topRing, k: 0.9, group: 'under' });
  mesh(new THREE.TorusGeometry(LIFT.r - 0.05, 0.006, 4, 128).rotateX(Math.PI / 2), topRing, platform).position.y = 0.007;
  disc.userData.focus = 'piano';   // the platform, like the grand on it, opens the studio's piano shot and Piano tab
  const pianoY0 = piano.position.y;
  // the grand's lacquer: on stage it shows more of the room in its reflections (with the studio dimmed around the
  // stage it would read as a black silhouette); back to the studio's own value when the stage is not in use
  const lacquer = new Set(); piano.traverse(o => { if (o.isMesh && o.material.clearcoat === 1 && o.material.color.getHex() === 0x050506) lacquer.add(o.material); });
  const lacquerEnv = [...lacquer][0]?.envMapIntensity ?? 0.9;
  let shine = 0;

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
    for (const m of lacquer) m.envMapIntensity = lacquerEnv * (1 + 1.4 * shine);
    if (!seen) return rig.dark();
    steel.emissive.copy(L.under.color).multiplyScalar(0.07 * L.under.level * Math.min(1, h / 0.6));
    for (const { m, k, group } of glows) {
      const g = L[group];
      m.color.copy(g.color).multiplyScalar(k * g.level * (1 + 0.25 * Math.sin(t * 2.2) * (g.pulse || 0)));
    }
    rig.update(t, dt, platformTop(h), L, active);
  }

  const R = Math.max(RIG.perimeter.r, 3.2) + 0.5;
  return { root, piano, platform, lift, pose, update, rig, keyLight, get key() { return !!key; },
    bounds: new THREE.Box3(new THREE.Vector3(STAGE.x - R, -LIFT.depth, STAGE.z - R), new THREE.Vector3(STAGE.x + R, ROOM.H, STAGE.z + R)) };
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
