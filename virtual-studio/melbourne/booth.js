// The club's DJ booth (Melbourne Underground DJ Room): a riser, a long console with the D//0 mark lit in its front,
// four media players (jog wheels with lit rings, tilted touch screens, performance pads) round a four-channel mixer
// (gain, three-band EQ and filter per channel, channel faders, level meters, a crossfader), the DJ's headphones, a
// gooseneck microphone, and the cables down the back. The equipment is visual: nothing here mixes or plays audio
// (that is the Broadcast Studio's and OBS's). The jogs turn and the meters move with the room's tempo clock.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { glow } from '../set.js';
import { AMBER, ICE } from '../screens.js';
import { CLUB_BOOTH as B, MONITORS, ROOM } from './layout.js';

const GOLD = new THREE.Color(AMBER), SILVER = new THREE.Color(ICE);

// a player's screen: a waveform that scrolls with the beat, the track's position bar, deck number
function screenPicture(deck) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 160;
  const x = c.getContext('2d'), tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const wave = Array.from({ length: 512 }, (_, i) => 0.25 + 0.75 * Math.abs(Math.sin(i * 0.37 + deck) * Math.sin(i * 0.05 + deck * 2)));
  let last = -1;
  return {
    tex,
    draw(t, beat, on) {
      if (t - last < 0.1) return; last = t;
      x.fillStyle = '#05070a'; x.fillRect(0, 0, 256, 160);
      if (!on) { tex.needsUpdate = true; return; }
      x.fillStyle = deck % 2 ? '#a9c8ee' : '#f2a650'; x.font = '600 18px Archivo, Arial, sans-serif'; x.fillText('DECK ' + (deck + 1), 10, 22);
      x.fillStyle = 'rgba(255,255,255,0.55)'; x.font = '500 13px Archivo, Arial, sans-serif'; x.fillText('128.0 BPM', 180, 22);
      const off = Math.floor(beat * 16) % 512;
      for (let i = 0; i < 236; i++) { const h = wave[(i + off) % 512] * 34; x.fillStyle = i === 118 ? '#ffffff' : deck % 2 ? 'rgba(169,200,238,0.85)' : 'rgba(242,166,80,0.85)'; x.fillRect(10 + i, 80 - h, 1, 2 * h); }
      x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(10, 136, 236, 6);
      x.fillStyle = 'rgba(255,255,255,0.8)'; x.fillRect(10, 136, 236 * ((t * 0.004 + deck * 0.21) % 1), 6);
      tex.needsUpdate = true;
    },
  };
}

export function buildBooth({ M, parent, at }) {
  const g = new THREE.Group(); g.name = 'melbourne-booth'; parent.add(g); g.position.set(...at); g.position.y = ROOM.floor;
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

  /* ----- the gear, on the work top: players at ±0.55 and ±1.2, the mixer in the middle ----- */
  const gear = new THREE.Group(); g.add(gear); gear.position.y = top;
  const jogs = [], screens = [], pads = [], meters = [];
  const players = [-1.22, -0.58, 0.58, 1.22];
  players.forEach((px, deck) => {
    const p = new THREE.Group(); p.position.set(px, 0, -0.04); gear.add(p);
    add(new RoundedBoxGeometry(0.58, 0.07, 0.62, 2, 0.012), panel, 0, 0.035, 0, p);
    // the jog: a platter with a lit ring and a centre display
    const jog = new THREE.Group(); jog.position.set(0, 0.072, -0.02); p.add(jog);
    add(new THREE.CylinderGeometry(0.155, 0.155, 0.02, 48), new THREE.MeshStandardMaterial({ color: 0x1e2024, metalness: 0.9, roughness: 0.25 }), 0, 0.01, 0, jog);
    add(new THREE.CylinderGeometry(0.13, 0.13, 0.004, 48), rubber, 0, 0.022, 0, jog);
    add(new THREE.BoxGeometry(0.012, 0.003, 0.11), L(new THREE.Color(1, 1, 1), 0.9), 0, 0.025, -0.06, jog);   // the platter's marker
    add(new THREE.TorusGeometry(0.162, 0.004, 6, 64).rotateX(Math.PI / 2), L(deck % 2 ? SILVER : GOLD, 1.7), 0, 0.075, -0.02, p);
    add(new THREE.CylinderGeometry(0.045, 0.045, 0.006, 32), L(deck % 2 ? SILVER : GOLD, 0.8), 0, 0.096, -0.02, p);
    jogs.push(jog);
    // the touch screen on a tilted stand at the back, towards the DJ (−z)
    const scr = screenPicture(deck); screens.push(scr);
    const s = new THREE.Group(); s.position.set(0, 0.07, 0.24); s.rotation.x = -0.55; p.add(s);
    add(new RoundedBoxGeometry(0.42, 0.28, 0.025, 2, 0.008), panel, 0, 0.14, 0, s);
    const sm = new THREE.MeshBasicMaterial({ map: scr.tex, color: 0x000000 }); lit.push({ m: sm, k: 1, group: 'screens', white: true });
    const face = add(new THREE.PlaneGeometry(0.37, 0.23), sm, 0, 0.14, -0.0135, s); face.rotation.y = Math.PI;
    // the performance pads (8) and the play / cue buttons, near the DJ
    for (let i = 0; i < 8; i++) {
      const m = L(deck % 2 ? SILVER : GOLD, 0.6, 'pads');
      add(new RoundedBoxGeometry(0.05, 0.012, 0.05, 1, 0.006), m, -0.135 + (i % 4) * 0.09, 0.076, -0.22 - Math.floor(i / 4) * 0.062, p);
      pads.push({ m, deck, i });
    }
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 24), L(new THREE.Color(0.3, 1, 0.45), 0.9), -0.21, 0.076, -0.27, p);   // play
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 24), L(GOLD, 0.9), -0.21, 0.076, -0.19, p);                           // cue
    // the tempo fader, along the right edge
    add(new THREE.BoxGeometry(0.012, 0.004, 0.3), rubber, 0.24, 0.072, 0, p);
    add(new RoundedBoxGeometry(0.04, 0.02, 0.026, 1, 0.005), knobMat, 0.24, 0.08, 0.02, p);
  });
  // the mixer: four channels, gain + three EQ + filter knobs, a meter, a channel fader each; master; crossfader
  const mixer = new THREE.Group(); mixer.position.set(0, 0, -0.04); gear.add(mixer);
  add(new RoundedBoxGeometry(0.5, 0.09, 0.64, 2, 0.012), panel, 0, 0.045, 0, mixer);
  const knobGeo = new THREE.CylinderGeometry(0.014, 0.016, 0.024, 16), capGeo = new THREE.BoxGeometry(0.003, 0.002, 0.012);
  for (let ch = 0; ch < 4; ch++) {
    const x = -0.165 + ch * 0.11;
    for (let k = 0; k < 5; k++) {
      const kn = add(knobGeo, knobMat, x, 0.102, 0.24 - k * 0.07, mixer); kn.rotation.y = (ch * 5 + k) * 0.7;
      add(capGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), 0, 0.013, 0.007, kn);
    }
    // the meter: 10 segments, lit from the bottom with the tempo clock
    const segs = [];
    for (let i = 0; i < 10; i++) { const m = L(i > 7 ? new THREE.Color(1, 0.3, 0.2) : i > 5 ? GOLD : SILVER, 0.9, 'meters'); add(new THREE.BoxGeometry(0.012, 0.003, 0.009), m, x + 0.035, 0.091, -0.04 - i * 0.012, mixer); segs.push(m); }
    meters.push(segs);
    add(new THREE.BoxGeometry(0.01, 0.004, 0.16), rubber, x, 0.091, -0.2, mixer);   // the fader's slot
    add(new RoundedBoxGeometry(0.034, 0.024, 0.022, 1, 0.005), knobMat, x, 0.102, -0.22 + ch * 0.02, mixer);   // the fader's cap
    add(new RoundedBoxGeometry(0.028, 0.01, 0.02, 1, 0.004), L(GOLD, 0.8, 'pads'), x, 0.094, -0.115, mixer);   // the cue button
  }
  add(new THREE.BoxGeometry(0.16, 0.004, 0.01), rubber, 0, 0.091, -0.295, mixer);                               // crossfader
  add(new RoundedBoxGeometry(0.024, 0.024, 0.036, 1, 0.005), knobMat, 0.02, 0.102, -0.295, mixer);
  // the mixer's name strip, the D//0 line in small type
  add(new THREE.BoxGeometry(0.4, 0.002, 0.012), L(SILVER, 0.6), 0, 0.091, 0.305, mixer);

  /* ----- the DJ's headphones, on the work top beside the mixer; the gooseneck mic on the right ----- */
  const hp = new THREE.Group(); hp.position.set(0.36, 0.01, 0.2); hp.rotation.y = -0.5; gear.add(hp);
  add(new THREE.TorusGeometry(0.095, 0.012, 8, 32, Math.PI), black, 0, 0.04, 0, hp).rotation.x = -Math.PI / 2;
  for (const s of [-1, 1]) { const cup = add(new THREE.CylinderGeometry(0.045, 0.045, 0.035, 24), black, s * 0.095, 0.022, 0, hp); add(new THREE.CylinderGeometry(0.03, 0.03, 0.004, 24), L(GOLD, 0.6), 0, 0.019, 0, cup); }
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0.43, 0.03, 0.2), new THREE.Vector3(0.33, 0.012, 0.0), new THREE.Vector3(0.24, 0.07, -0.18)]);   // the coiled cable to the mixer's socket
  add(new THREE.TubeGeometry(curve, 30, 0.004, 6), rubber, 0, 0, 0, gear);
  // the gooseneck mic: base on the console's right end, the neck curving up and in
  const neck = new THREE.CatmullRomCurve3([new THREE.Vector3(1.6, 0, 0.22), new THREE.Vector3(1.6, 0.22, 0.2), new THREE.Vector3(1.5, 0.38, 0.0), new THREE.Vector3(1.38, 0.42, -0.14)]);
  add(new THREE.CylinderGeometry(0.035, 0.04, 0.02, 20), black, 1.6, 0.01, 0.22, gear);
  add(new THREE.TubeGeometry(neck, 40, 0.007, 8), panel, 0, 0, 0, gear);
  const head = add(new THREE.CylinderGeometry(0.014, 0.018, 0.09, 16), black, 1.36, 0.425, -0.17, gear); head.lookAt(new THREE.Vector3(1.2, 0.6, -0.5).add(gear.position));
  add(new THREE.SphereGeometry(0.017, 16, 12), new THREE.MeshStandardMaterial({ color: 0x55585e, metalness: 0.8, roughness: 0.5 }), 0, 0.05, 0, head);
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

  /* ----- per frame: the tempo clock turns the jogs and runs the meters; levels from the room's light state ----- */
  function update(t, dt, Ls, beat) {
    const on = Ls.booth.level;
    for (const l of lit) {
      const s = Ls[l.group] || Ls.booth;
      if (l.white) l.m.color.setScalar(Math.min(1, s.level * l.k + 0.05));
      else l.m.color.copy(l.m.userData.base).multiplyScalar(s.level * l.k);
    }
    jogs.forEach((j, i) => { j.rotation.y -= dt * (i === 1 || i === 2 ? 3.5 : 0.5) * (on > 0.05 ? 1 : 0); });
    screens.forEach((s, i) => s.draw(t, beat + i * 0.25, on > 0.05));
    meters.forEach((segs, ch) => {
      const lvl = on * (ch === 1 || ch === 2 ? 0.55 + 0.45 * Math.pow(1 - ((beat + ch * 0.5) % 1), 1.5) : 0.15);
      segs.forEach((m, i) => { if (i / 10 > lvl) m.color.setScalar(0.02); });
    });
    pads.forEach(p => { if (((beat * 4) | 0) % 8 !== p.i || !(p.deck === 1 || p.deck === 2)) p.m.color.multiplyScalar(0.35); });
  }
  return { group: g, update, jogs, screens };
}
