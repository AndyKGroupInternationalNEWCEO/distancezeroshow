// The DJ lift's shaft cover: a glass floor panel that closes the opening in the studio floor once the booth is down in
// the club, and clears it before the booth comes back up. It lives under the studio floor behind the opening; it
// slides forward 3.5 cm below the floor, then rises flush into the glass floor round it (the same glass, the same
// steel T-grid on the same lines), so the studio floor reads as one surface. Opening is the reverse: down, then back.
// A thin ice line on its leading edge lights while it moves. A soft mechanical sound (Web Audio, made here: a drive
// hum, the rollers, the lock) plays while it moves; no file, and nothing when the page's sound effects are off.
//
// States: OPEN, CLOSING, CLOSED, OPENING. The lift and the cover lock each other (index.js): the cover closes only
// over a lift standing down, the lift moves only while the cover is OPEN.
import * as THREE from 'three';
import { glow } from '../set.js';
import { ICE } from '../screens.js';
import { GLASS, LIFT_RECT } from './layout.js';

const SLIDE = 4.6, RISE = 0.7, DROP = 0.035;   // s, s, m (how far under the floor it travels)
const ease = u => u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;

export function buildCover({ M, frame, glass }) {
  const [a0, a1, c0, c1] = LIFT_RECT.map((v, i) => v - (i < 2 ? GLASS.along : GLASS.across));   // the opening it covers, in the frame
  const w = a1 - a0 + 0.03, d = c1 - c0 + 0.03, cx = (a0 + a1) / 2, cz = (c0 + c1) / 2;
  const away = d + 0.25;                                           // where it waits: fully behind the opening's back edge
  const g = new THREE.Group(); g.name = 'melbourne-shaft-cover'; frame.add(g);
  const mesh = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  // the glass (the floor's own material), its steel bezel, the T-grid on the glass floor's lines
  const pane = mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), glass, 0, 0.002, 0); pane.renderOrder = 3;
  const steel = new THREE.MeshStandardMaterial({ color: 0x1c1f23, metalness: 0.8, roughness: 0.38 });
  for (const [x, z, bw, bd] of [[0, -d / 2, w, 0.03], [0, d / 2, w, 0.03], [-w / 2, 0, 0.03, d], [w / 2, 0, 0.03, d]]) mesh(new THREE.BoxGeometry(bw, 0.05, bd), steel, x, -0.025, z);
  const gx = Math.round(GLASS.w / GLASS.pane), gz = Math.round(GLASS.d / GLASS.pane), beam = GLASS.beam;
  for (let i = 0; i <= gx; i++) { const a = -GLASS.w / 2 + (i * GLASS.w) / gx - cx; if (Math.abs(a) < w / 2 - 0.02) mesh(new THREE.BoxGeometry(beam, 0.22, d), steel, a, -0.11, 0); }
  for (let j = 0; j <= gz; j++) { const c = -GLASS.d / 2 + (j * GLASS.d) / gz - cz; if (Math.abs(c) < d / 2 - 0.02) mesh(new THREE.BoxGeometry(w, 0.22, beam), steel, 0, -0.11, c); }
  const edge = glow(new THREE.Color(ICE)); mesh(new THREE.BoxGeometry(w - 0.06, 0.006, 0.008), edge, 0, -0.004, d / 2 - 0.004);
  g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });

  let state = 'OPEN', t = 0, light = 0;
  const pose = (slide, lift) => g.position.set(cx, -DROP * (1 - lift), cz - away * (1 - slide));
  pose(0, 0);
  const sound = mechSound();

  function command(cmd) {
    // (a reversal mid-way carries on from where the panel is)
    if (cmd === 'close') { if (state === 'CLOSED' || state === 'CLOSING') return { ok: true }; t = state === 'OPENING' ? SLIDE + RISE - t : 0; state = 'CLOSING'; sound.start(); return { ok: true }; }
    if (cmd === 'open') { if (state === 'OPEN' || state === 'OPENING') return { ok: true }; t = state === 'CLOSING' ? SLIDE + RISE - t : 0; state = 'OPENING'; sound.start(); return { ok: true }; }
    return { ok: false, reason: 'No such cover command' };
  }
  function update(dt) {
    if (state === 'CLOSING' || state === 'OPENING') {
      t = Math.min(SLIDE + RISE, t + dt);
      // closing: slide (under the floor), then rise flush; opening: drop, then slide back
      const k = state === 'CLOSING' ? t : SLIDE + RISE - t;
      pose(ease(Math.min(1, k / SLIDE)), ease(Math.max(0, (k - SLIDE) / RISE)));
      if (t >= SLIDE + RISE) { state = state === 'CLOSING' ? 'CLOSED' : 'OPEN'; sound.stop(); }
    }
    light += ((state === 'CLOSING' || state === 'OPENING' ? 1 : 0) - light) * (1 - Math.exp(-dt * 4));
    edge.color.set(ICE).multiplyScalar(0.06 + 1.6 * light);
    g.visible = state !== 'OPEN';                                  // waiting under the floor, it is not drawn at all
  }
  return {
    group: g, command, update, sound,
    get state() { return state; },
    get progress() { return state === 'CLOSED' ? 1 : state === 'OPEN' ? 0 : (state === 'CLOSING' ? t : SLIDE + RISE - t) / (SLIDE + RISE); },
    duration: SLIDE + RISE,
  };
}

// the cover's sound: a low drive hum, the rollers' hiss, a soft lock at the end. Quiet (a set noise, not music)
export function mechSound() {
  let ctx = null, nodes = null, on = true, volume = 0.35;
  const ensure = () => { if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ctx = new C(); } if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return ctx; };
  function start() {
    if (!on || nodes || !ensure()) return;
    const now = ctx.currentTime, out = ctx.createGain(); out.gain.setValueAtTime(0, now); out.gain.linearRampToValueAtTime(volume, now + 0.4); out.connect(ctx.destination);
    const hum = ctx.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 46;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 210; const hg = ctx.createGain(); hg.gain.value = 0.16; hum.connect(lp).connect(hg).connect(out);
    const servo = ctx.createOscillator(); servo.type = 'triangle'; servo.frequency.setValueAtTime(170, now); servo.frequency.linearRampToValueAtTime(205, now + 2.5);
    const sg = ctx.createGain(); sg.gain.value = 0.02; servo.connect(sg).connect(out);
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), ch = buf.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    const roll = ctx.createBufferSource(); roll.buffer = buf; roll.loop = true; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 850; bp.Q.value = 0.8;
    const rg = ctx.createGain(); rg.gain.value = 0.035; roll.connect(bp).connect(rg).connect(out);
    hum.start(); servo.start(); roll.start();
    nodes = { out, srcs: [hum, servo, roll] };
  }
  function stop() {
    if (!nodes || !ctx) return;
    const now = ctx.currentTime, { out, srcs } = nodes; nodes = null;
    out.gain.cancelScheduledValues(now); out.gain.setValueAtTime(out.gain.value, now); out.gain.linearRampToValueAtTime(0, now + 0.25);
    srcs.forEach(s => s.stop(now + 0.3));
    // the lock: a soft thump and a short click
    const g2 = ctx.createGain(); g2.gain.setValueAtTime(volume * 0.5, now + 0.05); g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.3); g2.connect(ctx.destination);
    const th = ctx.createOscillator(); th.type = 'sine'; th.frequency.setValueAtTime(95, now); th.frequency.exponentialRampToValueAtTime(55, now + 0.25); th.connect(g2); th.start(now + 0.05); th.stop(now + 0.32);
  }
  return { start, stop, set(o, v) { on = !!o; if (v !== undefined) volume = Math.max(0, Math.min(1, +v)); if (!on) stop(); }, get on() { return on; }, get playing() { return !!nodes; } };
}
