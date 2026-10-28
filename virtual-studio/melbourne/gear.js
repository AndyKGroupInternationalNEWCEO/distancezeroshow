// The DJ's gear on the one DJ booth: four media players and a four-channel mixer at real sizes (players 33 × 45 cm,
// mixer 40 × 46 cm, as club-standard equipment), the DJ's headphones and a talkback microphone. Every printed label,
// button outline and scale is a silkscreen texture on the faceplates; jogs, knobs, faders, buttons and meters are
// modelled. No other maker's name: the gear is DJ Andy'K's AKX line.
//
// It plays nothing and invents nothing. Everything that moves follows data from the Broadcast Studio and OBS:
//   setDeck(n, { title, artist, bpm, key, state: 'play'|'pause'|'stop', position, duration, pitch, waveform })
//   setMixer({ ch: [{ trim, hi, mid, low, filter, fader, cue }], xfader, master, phones })   (0…1, 0.5 = centre)
//   setLevels({ ch: [0…1 ×4], master: [L, R] })   (peak levels, e.g. from OBS's InputVolumeMeters)
//   setMic(on)                                      (TALK: the mic's ring lights)
// Without data the controls stay in their defined rest position, the meters stay dark and the jogs stand still.
// The DJ stands at −z and faces +z (the room); "left" and "right" below are the DJ's.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { AMBER, ICE } from '../screens.js';
import { brushed, roughnessNoise } from '../details.js';

const GOLD = new THREE.Color(AMBER), SILVER = new THREE.Color(ICE);
const DECK = { w: 0.329, d: 0.453 }, MIX = { w: 0.394, d: 0.459 };
export const DECK_X = [-0.74, -0.38, 0.38, 0.74];   // the players' centres along the console (x); the mixer at 0
const REST = { trim: 0.5, hi: 0.5, mid: 0.5, low: 0.5, filter: 0.5, fader: 0, cue: false };

// a silkscreened faceplate: a canvas texture, drawn once, laid on a device's top so the DJ reads it upright
function faceplate(w, d, draw, px = 2048) {
  const c = document.createElement('canvas'); c.width = px; c.height = Math.round(px * d / w);
  const x = c.getContext('2d'), s = c.width / w;   // metres → pixels
  x.fillStyle = '#121316'; x.fillRect(0, 0, c.width, c.height);
  // brushed grain
  for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(255,255,255,${0.008 + Math.random() * 0.012})`; x.fillRect(0, Math.random() * c.height, c.width, 1); }
  // coordinates: (u, v) in metres, u to the DJ's right from the centre, v away from the DJ from the centre
  const P = (u, v) => [c.width / 2 + u * s, c.height / 2 - v * s];
  draw({ x, s, P, text(t, u, v, size = 0.0055, color = 'rgba(225,228,234,0.82)', align = 'center', weight = 600) {
    x.font = `${weight} ${Math.round(size * s)}px Archivo, Arial, sans-serif`; x.fillStyle = color; x.textAlign = align; x.textBaseline = 'middle';
    const [a, b] = P(u, v); x.fillText(t, a, b);
  }, ring(u, v, r, color = 'rgba(220,224,230,0.35)', lw = 0.0007) { const [a, b] = P(u, v); x.strokeStyle = color; x.lineWidth = lw * s; x.beginPath(); x.arc(a, b, r * s, 0, Math.PI * 2); x.stroke(); },
  rect(u, v, w2, d2, color = 'rgba(220,224,230,0.3)', fill = null, lw = 0.0006) { const [a, b] = P(u - w2 / 2, v + d2 / 2); if (fill) { x.fillStyle = fill; x.fillRect(a, b, w2 * s, d2 * s); } x.strokeStyle = color; x.lineWidth = lw * s; x.strokeRect(a, b, w2 * s, d2 * s); },
  scale(u, v, r, n = 11, a0 = -150, a1 = 150) { const [a, b] = P(u, v); x.strokeStyle = 'rgba(220,224,230,0.55)'; x.lineWidth = 0.0005 * s;
    for (let i = 0; i < n; i++) { const ang = ((a0 + (a1 - a0) * i / (n - 1)) - 90) * Math.PI / 180; x.beginPath(); x.moveTo(a + Math.cos(ang) * r * s, b + Math.sin(ang) * r * s); x.lineTo(a + Math.cos(ang) * (r + 0.003) * s, b + Math.sin(ang) * (r + 0.003) * s); x.stroke(); } } });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const geo = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).rotateY(Math.PI);   // texture's top away from the DJ, its right to the DJ's right
  return { tex, geo };
}

export function buildGear({ M, parent, glowMat }) {
  const g = new THREE.Group(); g.name = 'melbourne-gear'; parent.add(g);
  const mesh = (geo, mat, x, y, z, p = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; p.add(m); return m; };
  const at = (u, v) => [-u, v];   // the DJ's (right, away) → this group's (x, z)
  const lit = [];                  // { m, base, k, group }
  const led = (color, k = 1, group = 'booth') => { const m = glowMat(color); lit.push({ m, base: new THREE.Color(color), k, group }); return m; };

  /* ----- materials: anodised graphite, satin black, brushed aluminium, soft-touch rubber, gloss screen glass ----- */
  const body = new THREE.MeshPhysicalMaterial({ color: 0x17181b, metalness: 0.55, roughness: 0.38, clearcoat: 0.25, clearcoatRoughness: 0.4 });
  const satin = new THREE.MeshPhysicalMaterial({ color: 0x0c0d0f, metalness: 0.2, roughness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.35 });
  const alu = new THREE.MeshStandardMaterial({ color: 0xb9bcc2, metalness: 1, roughness: 0.28 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x0a0a0b, roughness: 0.9 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x050607, metalness: 0, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02 });
  const screenGlass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.08, depthWrite: false, clearcoat: 1, clearcoatRoughness: 0.02 });
  const capWhite = new THREE.MeshBasicMaterial({ color: 0xe8eaee });
  // close-up finish: the bodies' satin varies a little (no plastic-flat gloss), the jogs' tops and the trims are
  // brushed aluminium (anisotropic highlight), the screens sit in a gloss-black glass bezel
  body.roughnessMap = roughnessNoise(3); body.roughness = 0.42;
  const aluBrushed = new THREE.MeshPhysicalMaterial({ color: 0xc3c6cc, metalness: 1, roughness: 0.3, roughnessMap: brushed(2), anisotropy: 0.8 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xe2e4e8, metalness: 1, roughness: 0.12 });
  const bezel = new THREE.MeshPhysicalMaterial({ color: 0x030304, metalness: 0, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03 });
  const plateRough = brushed(1);

  // a knob: knurled skirt and a domed cap (lathe profile), a white pointer line; `value` 0…1 turns it −150°…+150°
  const knobGeo = new THREE.LatheGeometry([[0.0, 0], [0.0105, 0], [0.0105, 0.004], [0.0095, 0.006], [0.0092, 0.016], [0.0082, 0.019], [0.005, 0.0205], [0, 0.021]].map(([r, y]) => new THREE.Vector2(r, y)), 56);
  const smallKnobGeo = knobGeo.clone().scale(0.8, 0.85, 0.8);
  const pointerGeo = new THREE.BoxGeometry(0.0012, 0.0008, 0.0065).translate(0, 0.0212, 0.0045);
  const knobCap = new THREE.CylinderGeometry(0.0056, 0.0056, 0.0008, 40);
  function knob(p, u, v, geo = knobGeo) { const [x, z] = at(u, v); const k = mesh(geo, body, x, 0, z, p); mesh(knobCap, aluBrushed, 0, geo === knobGeo ? 0.0207 : 0.0177, 0, k); mesh(pointerGeo, capWhite, 0, 0, 0, k); return k; }
  const turn = (k, value) => { k.rotation.y = -(-150 + 300 * value) * Math.PI / 180; };

  /* ================= the players ================= */
  const decks = DECK_X.map((cx, n) => {
    const p = new THREE.Group(); p.position.set(cx, 0, -0.02); g.add(p);
    const tint = n % 2 ? SILVER : GOLD;
    // the body: a low chassis rising towards the screen, rounded edges, a rubber foot line
    mesh(new RoundedBoxGeometry(DECK.w, 0.06, DECK.d, 3, 0.008), body, 0, 0.03, 0, p);
    mesh(new RoundedBoxGeometry(DECK.w - 0.01, 0.006, DECK.d - 0.01, 1, 0.002), rubber, 0, 0.002, 0, p);
    // a brushed aluminium band round the top edge
    mesh(new RoundedBoxGeometry(DECK.w + 0.002, 0.005, DECK.d + 0.002, 3, 0.0025), aluBrushed, 0, 0.0575, 0, p);
    const fp = faceplate(DECK.w, DECK.d, ({ text, ring, rect, P, x, s }) => {
      ring(0, -0.03, 0.108, 'rgba(220,224,230,0.25)'); ring(0, -0.03, 0.113, 'rgba(220,224,230,0.12)');
      text('PLAY/PAUSE', -0.115, -0.207, 0.0042); text('CUE', -0.115, -0.152, 0.0042);
      ring(-0.115, -0.185, 0.019); ring(-0.115, -0.13, 0.019);
      rect(0.135, -0.06, 0.012, 0.13); text('TEMPO', 0.135, 0.016, 0.0038);
      for (const t of [-6, -3, 0, 3, 6]) text(t > 0 ? '+' + t : String(t), 0.155, -0.06 - t * 0.0095, 0.0032, 'rgba(220,224,230,0.6)');
      text('HOT CUE', 0, 0.112, 0.0038); for (let i = 0; i < 8; i++) { text('ABCDEFGH'[i], -0.1225 + i * 0.035, 0.083, 0.0034, 'rgba(220,224,230,0.55)'); }
      text('LOOP', -0.125, 0.046, 0.0036); text('IN', -0.142, 0.033, 0.0032); text('OUT', -0.108, 0.033, 0.0032);
      text('SYNC', 0.12, 0.062, 0.0036); text('MASTER', 0.12, 0.046, 0.0033);
      text('AKX-3000', -0.14, 0.205, 0.0058, 'rgba(232,234,238,0.9)', 'left', 700);
      text('DECK ' + (n + 1), 0.14, 0.205, 0.0052, n % 2 ? 'rgba(169,200,238,0.95)' : 'rgba(242,166,80,0.95)', 'right', 700);
      text('VINYL', 0.105, -0.205, 0.0034); text('JOG MODE', 0.105, -0.193, 0.003, 'rgba(220,224,230,0.5)');
      x.strokeStyle = 'rgba(220,224,230,0.18)'; x.lineWidth = 0.0005 * s; const [a, b] = P(-DECK.w / 2 + 0.008, 0.125), [c2] = P(DECK.w / 2 - 0.008, 0); x.beginPath(); x.moveTo(a, b); x.lineTo(c2, b); x.stroke();
    });
    mesh(fp.geo, new THREE.MeshStandardMaterial({ map: fp.tex, metalness: 0.5, roughness: 0.5, roughnessMap: plateRough }), 0, 0.0605, 0, p);
    // the screen: a 9-inch touch screen in a raised, tilted housing at the far end
    const sh = new THREE.Group(); sh.position.set(0, 0.06, 0.168); sh.rotation.x = -0.32; p.add(sh);   // its far edge up: the screen faces the DJ
    mesh(new RoundedBoxGeometry(0.29, 0.03, 0.135, 3, 0.006), body, 0, 0.012, 0, sh);
    mesh(new RoundedBoxGeometry(0.224, 0.003, 0.146, 2, 0.004), bezel, 0, 0.0262, 0, sh);   // the screen's glass bezel
    const scr = screen(n), sm = new THREE.MeshBasicMaterial({ map: scr.tex, toneMapped: false, color: 0x000000 });
    lit.push({ m: sm, white: true, k: 1, group: 'screens' });
    const face = mesh(new THREE.PlaneGeometry(0.2, 0.125).rotateX(-Math.PI / 2).rotateY(Math.PI), sm, 0, 0.0275, 0.0, sh); face.castShadow = false;
    // the screen's cover glass: clear, only a faint gloss over the picture (an opaque black glass had hidden the screens)
    mesh(new THREE.PlaneGeometry(0.205, 0.13).rotateX(-Math.PI / 2), screenGlass, 0, 0.0278, 0, sh).castShadow = false;
    // the jog: aluminium rim, a touch platter with a fine groove ring, a lit ring round it, a platter marker
    const [jx, jz] = at(0, -0.03);
    const jogRing = led(tint, 1.4); mesh(new THREE.TorusGeometry(0.1065, 0.0018, 12, 160).rotateX(Math.PI / 2), jogRing, jx, 0.062, jz, p);
    const jog = new THREE.Group(); jog.position.set(jx, 0.061, jz); p.add(jog); jog.userData.ctl = { deck: n, act: 'jog' };
    mesh(new THREE.CylinderGeometry(0.103, 0.103, 0.014, 160), aluBrushed, 0, 0.007, 0, jog);
    mesh(new THREE.TorusGeometry(0.1032, 0.0045, 12, 160).rotateX(Math.PI / 2), rubber, 0, 0.007, 0, jog);   // the jog's grip
    const grooves = (() => { const c = document.createElement('canvas'); c.width = c.height = 1024; const x = c.getContext('2d'); x.scale(2, 2); x.fillStyle = '#101113'; x.fillRect(0, 0, 512, 512);
      for (let r = 40; r < 250; r += 1.1) { x.strokeStyle = `rgba(255,255,255,${0.035 + (r % 9 < 2 ? 0.03 : 0)})`; x.lineWidth = 1; x.beginPath(); x.arc(256, 256, r, 0, Math.PI * 2); x.stroke(); }
      x.fillStyle = '#d9dbe0'; x.fillRect(250, 18, 12, 70);   // the platter's marker, at 12 o'clock
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; })();
    mesh(new THREE.CylinderGeometry(0.094, 0.094, 0.004, 160), new THREE.MeshPhysicalMaterial({ map: grooves, metalness: 0.4, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.25 }), 0, 0.016, 0, jog);
    const centre = led(tint, 0.35, 'screens'); mesh(new THREE.TorusGeometry(0.026, 0.0016, 10, 72).rotateX(Math.PI / 2), centre, 0, 0.0185, 0, jog);   // the jog's centre display: a thin lit ring
    // play / cue: big round buttons with lit rims; the hot-cue pads; loop, sync; the tempo fader; the browse knob
    const play = led(new THREE.Color(0.25, 1, 0.45), 1.2), cue = led(GOLD, 1.2);
    for (const [v, m] of [[-0.185, play], [-0.13, cue]]) { const [x, z] = at(-0.115, v); mesh(new THREE.CylinderGeometry(0.0165, 0.0165, 0.008, 64), satin, x, 0.064, z, p).userData.ctl = { deck: n, act: v < -0.15 ? 'play' : 'cue' }; mesh(new THREE.TorusGeometry(0.0168, 0.0016, 10, 64).rotateX(Math.PI / 2), m, x, 0.068, z, p); mesh(new THREE.TorusGeometry(0.0192, 0.0011, 10, 64).rotateX(Math.PI / 2), chrome, x, 0.0612, z, p); }
    // HOT CUE A–H: a tap sets a cue where the track is, the next tap jumps back to it (spaces.js); lit once set
    const hot = [];
    for (let i = 0; i < 8; i++) { const m = led(tint, 0.35, 'pads'); const [x, z] = at(-0.1225 + i * 0.035, 0.095); mesh(new RoundedBoxGeometry(0.028, 0.007, 0.016, 2, 0.003), m, x, 0.063, z, p).userData.ctl = { deck: n, act: 'hot', i }; hot.push(m); }
    // LOOP IN / OUT (lit while a loop plays), SYNC (lit while this deck's tempo matches the other's)
    const loopM = []; let syncM = null;
    for (const [u, act] of [[-0.142, 'loopIn'], [-0.108, 'loopOut'], [0.12, 'sync']]) { const [x, z] = at(u, u > 0 ? 0.075 : 0.058); const m = led(act === 'sync' ? tint : GOLD, 0.3, 'pads');
      mesh(new RoundedBoxGeometry(0.022, 0.006, 0.012, 2, 0.002), m, x, 0.0625, z, p).userData.ctl = { deck: n, act }; if (act === 'sync') syncM = m; else loopM.push(m); }
    { const [x, z] = at(0.135, -0.06); mesh(new THREE.BoxGeometry(0.004, 0.003, 0.12), rubber, x, 0.0612, z, p); }
    const tempoCap = mesh(new RoundedBoxGeometry(0.03, 0.014, 0.018, 2, 0.004), satin, ...((([x, z]) => [x, 0.068, z])(at(0.135, -0.06))), p);
    tempoCap.userData.ctl = { deck: n, act: 'tempo' }; mesh(new THREE.BoxGeometry(0.024, 0.0006, 0.0018), capWhite, 0, 0.0072, 0, tempoCap);
    knob(p, 0.13, 0.168, smallKnobGeo).position.y = 0.06;
    // (no USB stick: nothing here claims a source the Broadcast Studio did not report)
    return { p, jog, jogRing, centre, play, cue, hot, loopM, syncM, tempoCap, screen: scr, data: { state: 'stop', position: 0, duration: 0, pitch: 0, title: '', artist: '', bpm: null, key: '', waveform: null, at: 0, hot: [], loop: null, sync: false } };
  });

  /* ================= the mixer ================= */
  const mx = new THREE.Group(); mx.position.set(0, 0, -0.02); g.add(mx);
  mesh(new RoundedBoxGeometry(MIX.w, 0.095, MIX.d, 3, 0.01), body, 0, 0.0475, 0, mx);
  const CHU = [-0.135, -0.075, -0.015, 0.045], MASTER_U = 0.125;   // the four channel strips, the master section
  const fp = faceplate(MIX.w, MIX.d, ({ text, ring, rect, scale }) => {
    const rows = [['TRIM', 0.185], ['HI', 0.135], ['MID', 0.095], ['LOW', 0.055], ['COLOR', 0.012]];
    CHU.forEach((u, i) => {
      text(String(i + 1), u, 0.212, 0.0062, 'rgba(232,234,238,0.9)', 'center', 700);
      for (const [name, v] of rows) { text(name, u, v + 0.017, 0.0029); scale(u, v, 0.0118); }
      text('CUE', u, -0.028, 0.0031); rect(u, -0.11, 0.004, 0.064); for (let t = 0; t <= 10; t++) rect(u + 0.011, -0.142 + t * 0.0064, 0.004, 0.0002, 'rgba(220,224,230,0.4)');
    });
    text('MASTER', MASTER_U, 0.212, 0.0042, 'rgba(232,234,238,0.9)'); scale(MASTER_U, 0.185, 0.0118); text('BOOTH', MASTER_U, 0.152, 0.0031); scale(MASTER_U, 0.135, 0.0118);
    text('PHONES', MASTER_U, 0.095, 0.0031); scale(MASTER_U, 0.075, 0.0118); text('MIC', MASTER_U, 0.035, 0.0031); text('L      R', MASTER_U, -0.028, 0.003);
    text('A', -0.06, -0.205, 0.004); text('B', 0.06, -0.205, 0.004); rect(0, -0.19, 0.11, 0.004); text('CROSSFADER', 0, -0.214, 0.0029, 'rgba(220,224,230,0.55)');
    text('AKX-V4', -0.18, -0.218, 0.0052, 'rgba(232,234,238,0.9)', 'left', 700); text('DISTANCE // ZERO', 0.18, -0.218, 0.0038, 'rgba(242,166,80,0.8)', 'right', 600);
  }, 2304);
  mesh(fp.geo, new THREE.MeshStandardMaterial({ map: fp.tex, metalness: 0.5, roughness: 0.5, roughnessMap: plateRough }), 0, 0.0955, 0, mx);
  mesh(new RoundedBoxGeometry(MIX.w + 0.002, 0.005, MIX.d + 0.002, 3, 0.0025), aluBrushed, 0, 0.0925, 0, mx);
  const KNOBS = ['trim', 'hi', 'mid', 'low', 'filter'], KV = [0.185, 0.135, 0.095, 0.055, 0.012];
  const strips = CHU.map((u, i) => {
    const knobs = KNOBS.map((name, k) => { const kn = knob(mx, u, KV[k], k === 0 || k === 4 ? smallKnobGeo : knobGeo); kn.position.y = 0.0955; kn.userData.ctl = { ch: i, act: 'knob', name }; return kn; });
    const cueM = led(GOLD, 0.9, 'pads'); { const [x, z] = at(u, -0.04); mesh(new RoundedBoxGeometry(0.024, 0.007, 0.012, 2, 0.003), cueM, x, 0.099, z, mx).userData.ctl = { ch: i, act: 'chcue' }; }
    const segs = [];   // a 15-segment meter beside the fader
    for (let s = 0; s < 15; s++) { const c = s > 12 ? new THREE.Color(1, 0.25, 0.2) : s > 9 ? GOLD : SILVER, m = led(c, 1.1, 'meters'); const [x, z] = at(u + 0.021, -0.145 + s * 0.0048); mesh(new THREE.BoxGeometry(0.006, 0.0015, 0.0034), m, x, 0.0965, z, mx); segs.push(m); }
    const [fx, fz] = at(u, -0.11);
    mesh(new THREE.BoxGeometry(0.0035, 0.0012, 0.07), rubber, fx, 0.0961, fz, mx);   // the fader's slot
    const cap = mesh(new RoundedBoxGeometry(0.016, 0.016, 0.026, 2, 0.004), satin, fx, 0.104, fz, mx); cap.userData.ctl = { ch: i, act: 'fader' };
    for (const dz of [-0.007, 0.007]) mesh(new THREE.BoxGeometry(0.0165, 0.0012, 0.0016), rubber, 0, 0.0082, dz, cap);   // grip ridges
    mesh(new THREE.BoxGeometry(0.0022, 0.0006, 0.022), capWhite, 0, 0.0082, 0, cap);
    return { u, knobs, cueM, segs, cap, value: { ...REST }, level: 0 };
  });
  const master = { knobs: [[0.185, 'master'], [0.135, 'booth'], [0.075, 'phones']].map(([v, name]) => { const k = knob(mx, MASTER_U, v); k.position.y = 0.0955; k.userData.ctl = { act: 'mknob', name }; return k; }), segs: [[], []], level: [0, 0] };
  for (const [side, du] of [[0, -0.008], [1, 0.008]]) for (let s = 0; s < 15; s++) { const c = s > 12 ? new THREE.Color(1, 0.25, 0.2) : s > 9 ? GOLD : SILVER, m = led(c, 1.1, 'meters'); const [x, z] = at(MASTER_U + du, -0.145 + s * 0.0048); mesh(new THREE.BoxGeometry(0.006, 0.0015, 0.0034), m, x, 0.0965, z, mx); master.segs[side].push(m); }
  // TALK: the mic's on button (lit red while the mic is open)
  const micLed = led(new THREE.Color(1, 0.18, 0.12), 1.4); { const [x, z] = at(MASTER_U, 0.05); mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.005, 40), micLed, x, 0.098, z, mx).userData.ctl = { act: 'mic' }; }
  { const [x, z] = at(0, -0.19); mesh(new THREE.BoxGeometry(0.11, 0.003, 0.004), rubber, x, 0.0962, z, mx); }
  const xfCap = mesh(new RoundedBoxGeometry(0.024, 0.016, 0.016, 2, 0.004), satin, 0, 0.104, -0.19 - 0.0, mx); xfCap.position.z = -0.19; xfCap.userData.ctl = { act: 'xfader' };
  const mix = { xfader: 0.5, master: 0.7, booth: 0.5, phones: 0.5 };

  /* ================= headphones (the console's left end) and the talkback mic (its right end) ================= */
  const hp = new THREE.Group(); hp.position.set(1.32, 0, -0.08); hp.rotation.y = 0.5; g.add(hp);   // on the console's left end
  mesh(new THREE.TorusGeometry(0.088, 0.009, 10, 48, Math.PI).rotateX(-Math.PI / 2).rotateY(Math.PI / 2), satin, 0, 0.012, 0, hp);
  for (const s of [-1, 1]) { const cup = new THREE.Group(); cup.position.set(0, 0.024, s * 0.088); cup.rotation.x = Math.PI / 2; hp.add(cup);
    mesh(new THREE.CylinderGeometry(0.042, 0.04, 0.03, 32), body, 0, 0, 0, cup); mesh(new THREE.TorusGeometry(0.033, 0.011, 10, 32).rotateX(Math.PI / 2), rubber, 0, s * 0.016, 0, cup);
    mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.002, 24), alu, 0, -s * 0.016, 0, cup); }
  { const c = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.02, -0.09), new THREE.Vector3(0.05, 0.01, -0.12), new THREE.Vector3(0.1, 0.006, -0.1), new THREE.Vector3(0.14, 0.01, -0.05)].map(v => v.applyEuler(hp.rotation).add(hp.position)));
    mesh(new THREE.TubeGeometry(c, 40, 0.0028, 6), rubber, 0, 0, 0); }
  // the mic: a heavy round base, a gooseneck, a cardioid capsule with a mesh grille and a red ON ring (TALK)
  const mic = new THREE.Group(); mic.position.set(-1.36, 0, 0.12); g.add(mic);
  mesh(new THREE.CylinderGeometry(0.05, 0.056, 0.022, 40), satin, 0, 0.011, 0, mic);
  const neck = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.02, 0), new THREE.Vector3(0, 0.2, 0.0), new THREE.Vector3(0.03, 0.33, -0.07), new THREE.Vector3(0.06, 0.38, -0.17)]);
  mesh(new THREE.TubeGeometry(neck, 60, 0.0065, 10), new THREE.MeshStandardMaterial({ color: 0x1b1c1f, metalness: 0.7, roughness: 0.45 }), 0, 0, 0, mic);
  const micOn = led(new THREE.Color(1, 0.15, 0.1), 1.6, 'mic');
  const capsule = new THREE.Group(); capsule.position.set(0.06, 0.38, -0.17); capsule.lookAt(new THREE.Vector3(0.09, 0.4, -0.35).add(mic.position)); mic.add(capsule);
  mesh(new THREE.CylinderGeometry(0.011, 0.009, 0.05, 20).rotateX(Math.PI / 2), satin, 0, 0, 0.0, capsule);
  mesh(new THREE.TorusGeometry(0.0112, 0.0018, 6, 24), micOn, 0, 0, -0.022, capsule);
  const grille = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#2a2c30'; x.fillRect(0, 0, 64, 64); x.fillStyle = '#0d0e10'; for (let i = 0; i < 64; i += 4) for (let j = 0; j < 64; j += 4) x.fillRect(i + 1, j + 1, 2, 2); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 2); return t; })();
  mesh(new THREE.SphereGeometry(0.016, 24, 16), new THREE.MeshStandardMaterial({ map: grille, metalness: 0.8, roughness: 0.45 }), 0, 0, 0.032, capsule);
  let micState = false;

  /* ================= data in ================= */
  const clamp01 = v => Math.max(0, Math.min(1, +v || 0));
  function setDeck(n, d = {}) {
    const k = decks[n]; if (!k) return false;
    const o = k.data;
    for (const f of ['title', 'artist', 'key']) if (f in d) o[f] = String(d[f] ?? '').slice(0, 80);
    if ('bpm' in d) o.bpm = Number.isFinite(+d.bpm) && +d.bpm > 0 ? +d.bpm : null;
    if ('duration' in d) o.duration = Math.max(0, +d.duration || 0);
    if ('position' in d) { o.position = Math.max(0, +d.position || 0); o.at = performance.now() / 1000; }
    if ('pitch' in d) o.pitch = Math.max(-0.16, Math.min(0.16, +d.pitch || 0));
    if ('sync' in d) o.sync = !!d.sync;
    if ('hot' in d) o.hot = Array.isArray(d.hot) ? d.hot.slice(0, 8).map(v => (Number.isFinite(v) ? +v : null)) : [];
    if ('loop' in d) o.loop = d.loop && Number.isFinite(d.loop.a) ? { a: +d.loop.a, b: Number.isFinite(d.loop.b) ? +d.loop.b : null, on: !!d.loop.on } : null;
    if ('waveform' in d) o.waveform = Array.isArray(d.waveform) && d.waveform.length ? d.waveform.slice(0, 2048).map(clamp01) : null;
    if ('state' in d && ['play', 'pause', 'stop'].includes(d.state)) { o.position = position(o); o.at = performance.now() / 1000; o.state = d.state; if (d.state === 'stop' && !('position' in d)) o.position = 0; }
    k.screen.dirty = true;
    return true;
  }
  function setMixer(d = {}) {
    (d.ch || []).forEach((c, i) => { const s = strips[i]; if (!s || !c) return; for (const f of [...KNOBS, 'fader']) if (f in c) s.value[f] = clamp01(c[f]); if ('cue' in c) s.value.cue = !!c.cue; });
    for (const f of ['xfader', 'master', 'booth', 'phones']) if (f in d) mix[f] = clamp01(d[f]);
  }
  function setLevels(d = {}) {
    (d.ch || []).forEach((v, i) => { if (strips[i]) strips[i].level = Math.max(strips[i].level, clamp01(v)); });
    (d.master || []).forEach((v, i) => { if (i < 2) master.level[i] = Math.max(master.level[i], clamp01(v)); });
  }
  const position = o => o.state === 'play' ? Math.min(o.duration || Infinity, o.position + (performance.now() / 1000 - o.at) * (1 + o.pitch)) : o.position;

  /* ================= per frame ================= */
  const segsOn = (segs, level, power) => segs.forEach((m, i) => { if (i / segs.length >= level) m.color.multiplyScalar(0.04); else m.color.multiplyScalar(power); });
  function update(t, dt, Ls) {
    const power = Ls.booth.level > 0.03 ? 1 : 0;
    work.intensity = WORK * Math.min(1, Ls.booth.level);
    for (const l of lit) { const s = Ls[l.group] || Ls.booth; if (l.white) l.m.color.setScalar(Math.min(1, s.level * l.k + 0.04)); else l.m.color.copy(l.base).multiplyScalar(Math.max(s.level, 0.25) * l.k); }
    // TALK: the mic's ring
    micOn.color.setRGB(1, 0.15, 0.1).multiplyScalar(micState ? 1.6 : 0.03); micLed.color.setRGB(1, 0.18, 0.12).multiplyScalar(micState ? 1.4 : 0.05);
    decks.forEach((k, n) => {
      const o = k.data, playing = o.state === 'play' && power;
      // the platter turns at 33⅓ rpm (× the pitch) while the deck plays; it stands still otherwise
      if (playing) k.jog.rotation.y -= dt * (100 / 3 / 60) * Math.PI * 2 * (1 + o.pitch);
      const loaded = !!o.title || o.duration > 0;
      k.jogRing.color.copy(n % 2 ? SILVER : GOLD).multiplyScalar(loaded ? (playing ? 1.4 : 0.5) : 0.04);
      k.centre.color.copy(n % 2 ? SILVER : GOLD).multiplyScalar(loaded ? 0.5 : 0.03);
      // PLAY lit while playing, blinking when paused; CUE lit when stopped at the cue (as club players do)
      k.play.color.setRGB(0.25, 1, 0.45).multiplyScalar(o.state === 'play' ? 1.2 : o.state === 'pause' && (t * 2) % 1 < 0.5 ? 1.0 : 0.05);
      k.cue.color.copy(GOLD).multiplyScalar(loaded && o.state !== 'play' ? 1.1 : 0.05);
      k.hot.forEach((m, i) => m.color.multiplyScalar(o.hot[i] != null ? 2.6 : loaded ? 0.35 : 0.12));
      k.syncM.color.multiplyScalar(o.sync && loaded ? 2.6 : loaded ? 0.35 : 0.12);
      k.loopM.forEach((m, i) => m.color.multiplyScalar(o.loop?.on ? ((t * 2) % 1 < 0.6 ? 3 : 1.2) : i === 0 && o.loop ? 2 : 0.15));
      k.tempoCap.position.z = at(0.135, -0.06 + o.pitch / 0.16 * 0.055)[1];
      if (power) k.screen.draw(t, o, position(o));
    });
    strips.forEach(s => {
      KNOBS.forEach((f, i) => turn(s.knobs[i], s.value[f]));
      s.cap.position.z = at(0, -0.142 + s.value.fader * 0.064)[1];
      s.cueM.color.multiplyScalar(s.value.cue ? 1.4 : 0.08);
      segsOn(s.segs, s.level, power); s.level = Math.max(0, s.level - dt * 1.6);   // the meter falls back at about 24 dB/s
    });
    master.knobs.forEach((k, i) => turn(k, [mix.master, mix.booth, mix.phones][i]));
    master.segs.forEach((segs, i) => { segsOn(segs, master.level[i], power); master.level[i] = Math.max(0, master.level[i] - dt * 1.6); });
    xfCap.position.x = at(-0.055 + mix.xfader * 0.11, 0)[0];
  }

  /* ================= the booth's work light: one soft, warm light from above the console onto the gear ================= */
  // (a real three.js light, as club booths have a lamp over the decks; no shadow, so it costs little. It is lit only
  // while the booth's own light is up)
  const work = new THREE.SpotLight(0xffe2c4, 0, 3.2, 0.62, 0.85, 2); work.castShadow = false;
  work.position.set(0, 1.25, -0.35); work.target.position.set(0, 0, 0.02); g.add(work, work.target);
  const WORK = 6.5;

  return {
    group: g, update, decks, strips, work, setDeck, setMixer, setLevels, get mix() { return mix; }, setMic(on) { micState = !!on; },
    report() { return { decks: decks.map(k => ({ ...k.data, position: +position(k.data).toFixed(2), waveform: k.data.waveform ? k.data.waveform.length : 0 })), mixer: { ch: strips.map(s => ({ ...s.value, level: +s.level.toFixed(3) })), ...mix }, mic: micState }; },
  };
}

// a player's screen: what the deck reports, nothing else. NO TRACK when nothing is loaded; the waveform only when the
// Broadcast Studio sends one (an overview of peaks), otherwise the track's position bar alone
function screen(n) {
  const c = document.createElement('canvas'); c.width = 1280; c.height = 800;   // drawn at 640 × 400, twice as sharp
  const x = c.getContext('2d'), tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; x.scale(2, 2);
  const accent = n % 2 ? '#a9c8ee' : '#f2a650';
  const time = s => { s = Math.max(0, s); const m = Math.floor(s / 60), r = Math.floor(s % 60); return `${m}:${String(r).padStart(2, '0')}`; };
  let last = -1, lastKey = '';
  return {
    tex, dirty: true,
    draw(t, o, pos) {
      const key = [o.title, o.artist, o.bpm, o.key, o.state, o.duration, o.waveform?.length, Math.floor(pos * 4), o.pitch, o.hot.join(), JSON.stringify(o.loop)].join('|');
      if (key === lastKey && !this.dirty) return; if (t - last < 0.08 && !this.dirty) return;
      last = t; lastKey = key; this.dirty = false;
      x.fillStyle = '#05070a'; x.fillRect(0, 0, 640, 400);
      x.fillStyle = 'rgba(255,255,255,0.06)'; x.fillRect(0, 0, 640, 44);
      x.font = '700 22px Archivo, Arial, sans-serif'; x.fillStyle = accent; x.textBaseline = 'middle'; x.textAlign = 'left'; x.fillText('DECK ' + (n + 1), 18, 22);
      const icon = o.state === 'play' ? '▶' : o.state === 'pause' ? '❚❚' : '■'; x.textAlign = 'right'; x.fillStyle = o.state === 'play' ? '#58e08a' : 'rgba(255,255,255,0.6)'; x.fillText(icon, 622, 22);
      if (!o.title && !o.duration) { x.textAlign = 'center'; x.fillStyle = 'rgba(255,255,255,0.35)'; x.font = '600 26px Archivo, Arial, sans-serif'; x.fillText('NO TRACK', 320, 220); tex.needsUpdate = true; return; }
      x.textAlign = 'left'; x.fillStyle = '#f3f5f8'; x.font = '600 30px Archivo, Arial, sans-serif'; x.fillText((o.title || '—').slice(0, 30), 18, 82);
      x.fillStyle = 'rgba(243,245,248,0.65)'; x.font = '500 22px Archivo, Arial, sans-serif'; x.fillText((o.artist || '').slice(0, 36), 18, 116);
      x.textAlign = 'right'; x.font = '700 30px Archivo, Arial, sans-serif'; x.fillStyle = '#f3f5f8';
      x.fillText(o.bpm ? (o.bpm * (1 + o.pitch)).toFixed(1) : '—', 622, 82);
      x.font = '500 16px Archivo, Arial, sans-serif'; x.fillStyle = 'rgba(243,245,248,0.6)'; x.fillText((o.bpm ? 'BPM' : 'BPM —') + (o.key ? '   ' + o.key : '') + (o.pitch ? `   ${o.pitch > 0 ? '+' : ''}${(o.pitch * 100).toFixed(1)}%` : ''), 622, 112);
      // the overview: the waveform's peaks if sent, the played part brighter; the playhead
      const X0 = 18, X1 = 622, Y = 250, H = 70, f = o.duration ? Math.min(1, pos / o.duration) : 0;
      if (o.waveform) { const w = o.waveform, n2 = w.length; for (let i = 0; i < X1 - X0; i++) { const v = w[Math.floor(i / (X1 - X0) * n2)], h = v * H; x.fillStyle = i / (X1 - X0) < f ? 'rgba(255,255,255,0.35)' : accent; x.fillRect(X0 + i, Y - h / 2, 1, h); } }
      else { x.fillStyle = 'rgba(255,255,255,0.12)'; x.fillRect(X0, Y - 3, X1 - X0, 6); x.fillStyle = accent; x.fillRect(X0, Y - 3, (X1 - X0) * f, 6); }
      // the loop (shaded, LOOP when it plays) and the hot cues (A–H marks under the overview)
      const px = sec => X0 + (X1 - X0) * Math.min(1, sec / (o.duration || 1));
      if (o.loop && o.duration) { const a = px(o.loop.a), b = o.loop.b != null ? px(o.loop.b) : a + 2; x.fillStyle = o.loop.on ? 'rgba(242,166,80,0.32)' : 'rgba(242,166,80,0.16)'; x.fillRect(a, Y - H / 2 - 4, Math.max(2, b - a), H + 8);
        if (o.loop.on) { x.font = '700 18px Archivo, Arial, sans-serif'; x.textAlign = 'center'; x.fillStyle = '#f2a650'; x.fillText('LOOP', 320, 345); } }
      if (o.duration) o.hot.forEach((h, i) => { if (h == null) return; const hx = px(h); x.fillStyle = accent; x.beginPath(); x.moveTo(hx, Y + H / 2 + 6); x.lineTo(hx - 7, Y + H / 2 + 20); x.lineTo(hx + 7, Y + H / 2 + 20); x.fill();
        x.font = '700 13px Archivo, Arial, sans-serif'; x.textAlign = 'center'; x.fillStyle = '#05070a'; x.fillText('ABCDEFGH'[i], hx, Y + H / 2 + 15); });
      x.fillStyle = '#ffffff'; x.fillRect(X0 + (X1 - X0) * f - 1, Y - H / 2 - 6, 2, H + 12);
      x.textAlign = 'left'; x.font = '600 24px Archivo, Arial, sans-serif'; x.fillStyle = '#f3f5f8'; x.fillText(time(pos), 18, 345);
      x.textAlign = 'right'; x.fillStyle = accent; x.fillText(o.duration ? '−' + time(o.duration - pos) : '', 622, 345);
      tex.needsUpdate = true;
    },
  };
}
