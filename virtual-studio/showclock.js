// The SHOW TIMER: a studio clock as television studios hang them, a real object on the main studio's wall (Vienna side,
// high, clear of every camera's line): a black rectangular case, a smoked acrylic front and red seven-segment LED
// digits, HH:MM:SS.mmm. COUNT UP from zero or COUNTDOWN from a set time (it stops at zero and blinks); START, PAUSE,
// RESET. Drawn on a canvas only when the reading changes; it stays lit in every light mode (a studio clock is never off).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const W = 2048, H = 320;   // the face's canvas: 12 characters, HH:MM:SS.mmm
const LIT = '#ff2414', DIM = 'rgba(255,40,24,0.07)';
// a seven-segment digit's segments (a…g) as bevelled bars in a 1 × 2 cell
const SEG = { a: [0.12, 0, 0.76, 0, 'h'], b: [0.88, 0.1, 0, 0.8, 'v'], c: [0.88, 1.1, 0, 0.8, 'v'], d: [0.12, 2, 0.76, 0, 'h'], e: [0.12, 1.1, 0, 0.8, 'v'], f: [0.12, 0.1, 0, 0.8, 'v'], g: [0.12, 1, 0.76, 0, 'h'] };
const DIGITS = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];

function face() {
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const S = 118, T = 0.16;   // a digit's width (px) and a segment's thickness (of the width)
  const bar = (x0, y0, len, vertical, on) => {
    const t = T * S / 2, L = len * S; x.fillStyle = on ? LIT : DIM; x.beginPath();
    if (vertical) { x.moveTo(x0, y0); x.lineTo(x0 + t, y0 + t); x.lineTo(x0 + t, y0 + L - t); x.lineTo(x0, y0 + L); x.lineTo(x0 - t, y0 + L - t); x.lineTo(x0 - t, y0 + t); }
    else { x.moveTo(x0, y0); x.lineTo(x0 + t, y0 - t); x.lineTo(x0 + L - t, y0 - t); x.lineTo(x0 + L, y0); x.lineTo(x0 + L - t, y0 + t); x.lineTo(x0 + t, y0 + t); }
    x.closePath(); x.fill();
  };
  const digit = (px, py, n, on = true) => { const lit = DIGITS[n] || ''; for (const [k, [sx, sy, w, h, o]] of Object.entries(SEG)) bar(px + sx * S, py + sy * S, o === 'h' ? w : h, o === 'v', on && lit.includes(k)); };
  const dot = (px, py, on) => { x.fillStyle = on ? LIT : DIM; x.beginPath(); x.arc(px, py, S * 0.085, 0, Math.PI * 2); x.fill(); };
  let last = '';
  function draw(text, blinkOff = false) {
    const key = text + blinkOff; if (key === last) return; last = key;
    x.fillStyle = '#050102'; x.fillRect(0, 0, W, H);
    const adv = ch => (ch === ':' ? 60 : ch === '.' ? 46 : S * 1.32);
    const top = (H - 2 * S) / 2; let px = (W - [...text].reduce((a, ch) => a + adv(ch), 0)) / 2;   // centred
    for (const ch of text) {
      if (ch === ':') { dot(px + 18, top + S * 0.62, !blinkOff); dot(px + 18, top + S * 1.38, !blinkOff); }
      else if (ch === '.') { dot(px + 16, top + S * 1.95, !blinkOff); }
      else digit(px + S * 0.08, top, +ch, !blinkOff);
      px += adv(ch);
    }
    tex.needsUpdate = true;
  }
  return { tex, draw };
}

export function showClock({ M, parent }) {
  const g = new THREE.Group(); g.name = 'show-timer';
  // on the room's wall, Vienna side, high: readable from the desk, out of the cameras' way; turned to the studio's centre
  g.position.set(-11.7, 4.5, 3.7); g.lookAt(0, 4.5, 1);   // (the room's wall: a circle of 12.6 m about (0, 1); the brackets reach it) parent.add(g);
  const caseMat = new THREE.MeshPhysicalMaterial({ color: 0x08080a, metalness: 0.4, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  add(new RoundedBoxGeometry(1.62, 0.36, 0.09, 4, 0.02), caseMat, 0, 0, 0);
  add(new RoundedBoxGeometry(1.66, 0.4, 0.02, 3, 0.008), M.brushed || caseMat, 0, 0, -0.05);   // the bezel's back plate
  const f = face();
  add(new THREE.PlaneGeometry(1.5, 1.5 * H / W), new THREE.MeshBasicMaterial({ map: f.tex, toneMapped: false, color: new THREE.Color(1.5, 1.5, 1.5) }), 0, 0, 0.046);
  // the smoked acrylic front: the room's reflections over the digits
  add(new THREE.PlaneGeometry(1.52, 0.3), new THREE.MeshPhysicalMaterial({ color: 0x000000, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.28, clearcoat: 1, clearcoatRoughness: 0.03, depthWrite: false }), 0, 0, 0.049);
  // wall brackets
  for (const sx of [-0.6, 0.6]) add(new THREE.BoxGeometry(0.05, 0.08, 0.5), M.graphite || caseMat, sx, 0, -0.3);
  g.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = false; });

  /* ----- the timer ----- */
  let mode = 'up', running = false, acc = 0, since = 0, target = 5 * 60000;
  const now = () => performance.now();
  const elapsed = () => acc + (running ? now() - since : 0);
  const value = () => (mode === 'up' ? elapsed() : Math.max(0, target - elapsed()));
  const fmt = ms => { ms = Math.floor(ms); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`; };
  const api = {
    group: g,
    countUp() { mode = 'up'; api.reset(); },
    countdown(ms) { mode = 'down'; target = Math.max(1000, +ms || target); api.reset(); },
    start() { if (running) return; if (mode === 'down' && value() <= 0) return; running = true; since = now(); },
    pause() { if (!running) return; acc = elapsed(); running = false; },
    reset() { running = false; acc = 0; },
    get state() { return { mode, running, ms: Math.round(value()), target, text: fmt(value()) }; },
    update() {
      if (running && mode === 'down' && value() <= 0) { acc = target; running = false; }
      // at zero after a countdown: the digits blink (twice a second) until reset
      const done = mode === 'down' && value() <= 0 && acc >= target;
      f.draw(fmt(value()), done && (now() / 500) % 2 < 1);
    },
  };
  api.update();
  return api;
}
