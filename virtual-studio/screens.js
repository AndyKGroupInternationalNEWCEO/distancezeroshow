// Everything that is drawn rather than modelled: the LED video wall programme, the Vienna and Melbourne
// pylons, the desk fascia, the floor inlay and small labels. All 2D canvas, uploaded as textures.
import * as THREE from 'three';

export const AMBER = '#f2a650';
export const ICE = '#a9c8ee';
export const CHAMPAGNE = '#e3c79a';
const FONT = 'Archivo, "Helvetica Neue", Arial, sans-serif';

/* ---------- helpers ---------- */

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// font-stretch keywords inside ctx.font are not supported everywhere: an invalid value is silently
// ignored, so fall back to the plain weight instead of drawing in the previous font
function setFont(ctx, weight, px, stretch = 'expanded') {
  ctx.font = `${weight} ${px}px ${FONT}`;
  if (stretch === 'normal') return;
  const plain = ctx.font;
  ctx.font = `${weight} ${stretch} ${px}px ${FONT}`; // ignored (stays plain) where unsupported
  if (!ctx.font) ctx.font = plain;
}

// letter-spaced text without relying on ctx.letterSpacing (not in every Safari)
export function spaced(ctx, text, x, y, spacing, align = 'center') {
  const chars = [...text];
  const widths = chars.map(c => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  const prev = ctx.textAlign;
  ctx.textAlign = 'left';
  chars.forEach((c, i) => { ctx.fillText(c, cx, y); cx += widths[i] + spacing; });
  ctx.textAlign = prev;
  return total;
}

export function texture(c, { srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

const clock = tz => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date());
const day = tz => new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date()).toUpperCase();
const mix = (a, b, t) => a + (b - a) * t;

// a horizontal amber → ice gradient strip, used for LED lines on the desk, riser and floor rings
export function gradientTexture(stops = [[0, AMBER], [0.5, '#f3f5f8'], [1, ICE]], w = 512) {
  const c = canvas(w, 4), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, w, 0);
  for (const [o, col] of stops) g.addColorStop(o, col);
  x.fillStyle = g; x.fillRect(0, 0, w, 4);
  return texture(c, { aniso: 1 });
}

/* ---------- skylines (pre-rendered once, then composited every frame) ---------- */

function skyline(city, w, h, color) {
  const c = canvas(w, h), x = c.getContext('2d');
  const P = new Path2D();
  const rect = (l, t, r) => { P.rect(l * w, h - t * h, (r - l) * w, t * h); };
  const tri = (l, r, top, base = 0) => { P.moveTo(l * w, h - base * h); P.lineTo(((l + r) / 2) * w, h - top * h); P.lineTo(r * w, h - base * h); P.closePath(); };
  const windows = [];
  const block = (l, t, r) => { rect(l, t, r); windows.push([l, t, r]); };

  if (city === 'vienna') {
    // Riesenrad (Prater giant wheel)
    const wx = 0.13 * w, wy = h - 0.42 * h, wr = 0.3 * h;
    P.moveTo(wx - wr * 0.55, h); P.lineTo(wx, wy); P.lineTo(wx + wr * 0.55, h); P.lineTo(wx + wr * 0.45, h); P.lineTo(wx, wy + 8); P.lineTo(wx - wr * 0.45, h); P.closePath();
    x.save();
    x.strokeStyle = color; x.lineWidth = 2.2; x.shadowColor = color; x.shadowBlur = 14;
    x.beginPath(); x.arc(wx, wy, wr, 0, Math.PI * 2); x.stroke();
    x.lineWidth = 1.2; x.globalAlpha = 0.7;
    x.beginPath(); x.arc(wx, wy, wr * 0.93, 0, Math.PI * 2); x.stroke();
    for (let i = 0; i < 15; i++) {
      const a = (i / 15) * Math.PI * 2;
      x.beginPath(); x.moveTo(wx, wy); x.lineTo(wx + Math.cos(a) * wr, wy + Math.sin(a) * wr); x.stroke();
      x.fillStyle = color; x.globalAlpha = 0.9; x.fillRect(wx + Math.cos(a) * wr - 4, wy + Math.sin(a) * wr - 3, 8, 7); x.globalAlpha = 0.7;
    }
    x.restore();
    block(0.0, 0.16, 0.06); block(0.21, 0.22, 0.27); block(0.27, 0.15, 0.31);
    // Karlskirche: dome, portico and two columns
    rect(0.335, 0.34, 0.35); rect(0.47, 0.34, 0.485);
    P.rect(0.329 * w, h - 0.36 * h, 0.027 * w, 0.025 * h); P.rect(0.464 * w, h - 0.36 * h, 0.027 * w, 0.025 * h);
    rect(0.355, 0.2, 0.465);
    P.moveTo(0.37 * w, h - 0.2 * h); P.ellipse(0.41 * w, h - 0.26 * h, 0.042 * w, 0.1 * h, 0, Math.PI, 0); P.lineTo(0.452 * w, h - 0.2 * h); P.closePath();
    rect(0.405, 0.42, 0.415);
    tri(0.36, 0.46, 0.27, 0.2);
    block(0.5, 0.18, 0.55);
    // Stephansdom: the steep patterned roof and the south tower spire
    P.moveTo(0.56 * w, h - 0.22 * h); P.lineTo(0.6 * w, h - 0.4 * h); P.lineTo(0.7 * w, h - 0.4 * h); P.lineTo(0.72 * w, h - 0.22 * h); P.closePath();
    rect(0.56, 0.22, 0.72);
    P.moveTo(0.585 * w, h - 0.22 * h); P.lineTo(0.598 * w, h - 0.55 * h); P.lineTo(0.607 * w, h - 0.92 * h); P.lineTo(0.616 * w, h - 0.55 * h); P.lineTo(0.63 * w, h - 0.22 * h); P.closePath();
    P.moveTo(0.695 * w, h - 0.3 * h); P.lineTo(0.703 * w, h - 0.52 * h); P.lineTo(0.711 * w, h - 0.3 * h); P.closePath();
    block(0.73, 0.2, 0.79);
    // Donauturm
    rect(0.868, 0.82, 0.876); P.ellipse(0.872 * w, h - 0.72 * h, 0.032 * w, 0.025 * h, 0, 0, Math.PI * 2); rect(0.871, 0.96, 0.873);
    block(0.8, 0.13, 0.86); block(0.89, 0.24, 0.95); block(0.95, 0.15, 1);
  } else {
    // Arts Centre spire (lattice)
    x.save();
    x.strokeStyle = color; x.lineWidth = 1.6; x.shadowColor = color; x.shadowBlur = 12;
    const sx = 0.09 * w, top = h - 0.86 * h, base = h - 0.2 * h, half = 0.045 * w;
    x.beginPath(); x.moveTo(sx - half, base); x.lineTo(sx, top); x.lineTo(sx + half, base); x.stroke();
    for (let i = 1; i < 9; i++) {
      const t = i / 9, y = mix(base, top, t), r = half * (1 - t);
      x.globalAlpha = 0.8;
      x.beginPath(); x.moveTo(sx - r, y); x.lineTo(sx + r * 0.6, mix(base, top, t + 0.11)); x.stroke();
      x.beginPath(); x.moveTo(sx + r, y); x.lineTo(sx - r * 0.6, mix(base, top, t + 0.11)); x.stroke();
    }
    x.restore();
    rect(0.04, 0.2, 0.14);
    block(0.16, 0.34, 0.21); block(0.21, 0.5, 0.25);
    // Eureka Tower with its crown
    rect(0.3, 0.86, 0.36); P.rect(0.302 * w, h - 0.92 * h, 0.056 * w, 0.06 * h); windows.push([0.3, 0.84, 0.36]);
    block(0.37, 0.42, 0.42);
    // Australia 108 and its cantilevered starburst
    P.moveTo(0.45 * w, h); P.lineTo(0.45 * w, h - 0.94 * h); P.quadraticCurveTo(0.49 * w, h - 0.96 * h, 0.5 * w, h - 0.9 * h); P.lineTo(0.5 * w, h - 0.72 * h);
    P.lineTo(0.525 * w, h - 0.7 * h); P.lineTo(0.525 * w, h - 0.64 * h); P.lineTo(0.5 * w, h - 0.62 * h); P.lineTo(0.5 * w, h); P.closePath();
    windows.push([0.45, 0.9, 0.5]);
    // Rialto twins and the rest of the CBD
    block(0.56, 0.62, 0.6); block(0.6, 0.55, 0.63);
    block(0.66, 0.46, 0.7); block(0.7, 0.68, 0.74); block(0.75, 0.38, 0.8);
    // Bolte Bridge twin pylons
    rect(0.86, 0.52, 0.868); rect(0.885, 0.52, 0.893); rect(0.82, 0.16, 0.95);
    block(0.95, 0.27, 1);
  }

  const fill = x.createLinearGradient(0, 0, 0, h);
  fill.addColorStop(0, '#191d24'); fill.addColorStop(1, '#0a0b0e');
  x.fillStyle = fill; x.fill(P);
  x.save();
  x.strokeStyle = color; x.lineWidth = 2; x.shadowColor = color; x.shadowBlur = 16;
  x.stroke(P);
  x.restore();
  // lit windows
  let seed = city === 'vienna' ? 7 : 13;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  x.fillStyle = color;
  for (const [l, t, r] of windows) {
    for (let yy = h - t * h + 10; yy < h - 6; yy += 9) {
      for (let xx = l * w + 5; xx < r * w - 5; xx += 8) if (rnd() > 0.72) { x.globalAlpha = 0.25 + rnd() * 0.5; x.fillRect(xx, yy, 3, 3); }
    }
  }
  x.globalAlpha = 1;
  return c;
}

function photo(src) {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  return img;
}

/* ---------- the LED video wall ---------- */

// Programmes: 'idle' (studio off air), 'cities', 'presenters', 'wave'. The wall never claims to be live.
export function createWall({ width = 2048, height = 860 } = {}) {
  const c = canvas(width, height), x = c.getContext('2d');
  const W = width, H = height, S = W / 2048;
  const tex = texture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.x = -1; // seen from inside the curved wall

  const vienna = skyline('vienna', Math.round(760 * S), Math.round(420 * S), AMBER);
  const melbourne = skyline('melbourne', Math.round(760 * S), Math.round(420 * S), ICE);
  const andrej = photo('assets/andrej.webp');
  const georgie = photo('assets/georgie.webp');

  // LED cabinet seams, drawn once
  const seams = canvas(W, H), sx = seams.getContext('2d');
  sx.strokeStyle = 'rgba(0,0,0,0.35)'; sx.lineWidth = Math.max(1, 1.5 * S);
  for (let i = 1; i < 22; i++) { const px = Math.round((i * W) / 22) + 0.5; sx.beginPath(); sx.moveTo(px, 0); sx.lineTo(px, H); sx.stroke(); }
  for (let i = 1; i < 9; i++) { const py = Math.round((i * H) / 9) + 0.5; sx.beginPath(); sx.moveTo(0, py); sx.lineTo(W, py); sx.stroke(); }

  const state = { program: 'idle', from: 'idle', fade: 1, countdown: 0 };

  function background(t, level) {
    const g = x.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, '#120c06'); g.addColorStop(0.5, '#06070a'); g.addColorStop(1, '#060a12');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    // glow behind the hanging 3D logo
    const r = x.createRadialGradient(W / 2, H * 0.32, 10, W / 2, H * 0.32, W * 0.28);
    r.addColorStop(0, `rgba(243,245,248,${0.1 * level})`); r.addColorStop(0.5, `rgba(169,200,238,${0.04 * level})`); r.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = r; x.fillRect(0, 0, W, H);
    // faint perspective grid on the floor of the image
    x.strokeStyle = `rgba(201,206,214,${0.05 + 0.03 * level})`; x.lineWidth = 1;
    for (let i = -12; i <= 12; i++) { x.beginPath(); x.moveTo(W / 2 + i * 26 * S, H * 0.62); x.lineTo(W / 2 + i * 150 * S, H); x.stroke(); }
    for (let i = 0; i < 6; i++) { const y = H * 0.62 + Math.pow(i / 6, 1.8) * H * 0.38 + ((t * 18 * S) % 20); x.beginPath(); x.moveTo(0, y); x.lineTo(W, y); x.stroke(); }
  }

  function wave(t, y, amp, alpha, strands = 7, speed = 1) {
    x.save();
    x.globalCompositeOperation = 'lighter';
    for (let s = 0; s < strands; s++) {
      const g = x.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, `rgba(242,166,80,${alpha})`); g.addColorStop(0.5, `rgba(243,245,248,${alpha})`); g.addColorStop(1, `rgba(169,200,238,${alpha})`);
      x.strokeStyle = g; x.lineWidth = (s === 0 ? 2.6 : 1.1) * S;
      x.beginPath();
      for (let px = 0; px <= W; px += 12 * S) {
        const u = px / W;
        const env = Math.sin(Math.PI * u) * 0.8 + 0.2;
        const yy = y + Math.sin(u * 9 + t * 1.3 * speed + s * 0.45) * amp * env * (1 - s * 0.08) + Math.sin(u * 23 - t * 2.1 * speed + s) * amp * 0.18;
        px === 0 ? x.moveTo(px, yy) : x.lineTo(px, yy);
      }
      x.stroke();
    }
    x.restore();
  }

  function cityLabel(name, sub, tz, cx, color, align) {
    x.fillStyle = color;
    setFont(x, 600, 46 * S);
    spaced(x, name, cx, H * 0.14, 16 * S, align);
    x.fillStyle = '#f3f5f8';
    setFont(x, 300, 64 * S, 'normal');
    x.textAlign = align; x.fillText(clock(tz), cx, H * 0.255);
    x.fillStyle = 'rgba(201,206,214,0.7)';
    setFont(x, 500, 19 * S);
    spaced(x, `${day(tz)}  ·  ${sub}`, cx, H * 0.31, 6 * S, align);
  }

  const programs = {
    idle(t) {
      background(t, 0.4);
      wave(t * 0.4, H * 0.62, 26 * S, 0.22, 3, 0.6);
      x.fillStyle = 'rgba(201,206,214,0.55)';
      setFont(x, 500, 26 * S);
      spaced(x, 'DISTANCE // ZERO', W / 2, H * 0.84, 18 * S);
      x.fillStyle = 'rgba(138,144,153,0.8)';
      setFont(x, 500, 17 * S);
      spaced(x, 'VIENNA  ·  15,731 KM  ·  MELBOURNE', W / 2, H * 0.9, 8 * S);
    },
    cities(t) {
      background(t, 1);
      x.globalAlpha = 0.95;
      x.drawImage(vienna, W * 0.02, H * 0.62 - vienna.height);
      x.drawImage(melbourne, W * 0.98 - melbourne.width, H * 0.62 - melbourne.height);
      x.globalAlpha = 1;
      // reflections of the skylines on the "water"
      x.save(); x.globalAlpha = 0.16; x.scale(1, -1);
      x.drawImage(vienna, W * 0.02, -H * 0.62 - vienna.height * 0.55, vienna.width, vienna.height * 0.55);
      x.drawImage(melbourne, W * 0.98 - melbourne.width, -H * 0.62 - melbourne.height * 0.55, melbourne.width, melbourne.height * 0.55);
      x.restore();
      cityLabel('VIENNA', '48.21° N  16.37° E', 'Europe/Vienna', W * 0.05, AMBER, 'left');
      cityLabel('MELBOURNE', '37.81° S  144.96° E', 'Australia/Melbourne', W * 0.95, ICE, 'right');
      wave(t, H * 0.7, 30 * S, 0.5);
      x.fillStyle = '#f3f5f8';
      setFont(x, 400, 30 * S);
      spaced(x, '15,731 KM', W / 2, H * 0.86, 14 * S);
      x.strokeStyle = 'rgba(201,206,214,0.5)'; x.lineWidth = 1.5 * S;
      x.beginPath(); x.moveTo(W * 0.36, H * 0.85); x.lineTo(W * 0.44, H * 0.85); x.moveTo(W * 0.56, H * 0.85); x.lineTo(W * 0.64, H * 0.85); x.stroke();
    },
    presenters(t) {
      background(t, 0.8);
      wave(t, H * 0.5, 40 * S, 0.3, 5);
      const card = (img, cx, name, place, color, dir) => {
        const cw = 330 * S, ch = 470 * S, top = H * 0.12;
        x.save();
        x.fillStyle = '#0b0c0f'; x.fillRect(cx - cw / 2, top, cw, ch);
        if (img.complete && img.naturalWidth) {
          const k = 1.06 + Math.sin(t * 0.15 + dir) * 0.03; // slow Ken Burns
          const sw = img.naturalWidth / k, sh = sw * (ch / cw);
          x.beginPath(); x.rect(cx - cw / 2, top, cw, ch); x.clip();
          x.drawImage(img, (img.naturalWidth - sw) / 2 + dir * 10, 0, sw, Math.min(sh, img.naturalHeight), cx - cw / 2, top, cw, ch);
          const fade = x.createLinearGradient(0, top + ch * 0.55, 0, top + ch);
          fade.addColorStop(0, 'rgba(7,8,10,0)'); fade.addColorStop(1, 'rgba(7,8,10,0.95)');
          x.fillStyle = fade; x.fillRect(cx - cw / 2, top, cw, ch);
        }
        x.restore();
        x.strokeStyle = color; x.lineWidth = 3 * S; x.strokeRect(cx - cw / 2, top, cw, ch);
        x.fillStyle = '#f3f5f8'; setFont(x, 700, 34 * S);
        spaced(x, name, cx, top + ch - 52 * S, 8 * S);
        x.fillStyle = color; setFont(x, 500, 17 * S);
        spaced(x, place, cx, top + ch - 22 * S, 7 * S);
      };
      card(andrej, W * 0.21, "DJ ANDY'K", 'VIENNA · AUSTRIA', AMBER, -1);
      card(georgie, W * 0.79, 'GEORGIE', 'MELBOURNE · AUSTRALIA', ICE, 1);
      x.fillStyle = 'rgba(243,245,248,0.85)'; setFont(x, 400, 24 * S);
      spaced(x, 'BETWEEN TWO WORLDS. ONE ROOM.', W / 2, H * 0.9, 12 * S);
    },
    wave(t) {
      background(t, 0.7);
      for (let i = 0; i < 3; i++) wave(t + i * 1.7, H * (0.45 + i * 0.12), (70 - i * 18) * S, 0.42 - i * 0.1, 8, 1.4);
      // equaliser bars along the bottom
      const n = 64, bw = W / n;
      for (let i = 0; i < n; i++) {
        const u = i / n, v = 0.5 + 0.5 * Math.sin(t * 3.1 + i * 0.55) * Math.sin(t * 1.3 + i * 0.21);
        const col = u < 0.5 ? `rgba(242,166,80,${0.25 + v * 0.5})` : `rgba(169,200,238,${0.25 + v * 0.5})`;
        x.fillStyle = col; x.fillRect(i * bw + 3 * S, H - v * H * 0.16 - 8 * S, bw - 6 * S, v * H * 0.16);
      }
      x.fillStyle = '#f3f5f8'; setFont(x, 500, 26 * S);
      spaced(x, 'MUSIC CONNECTS US', W / 2, H * 0.14, 18 * S);
    },
  };

  // stand-by card while the page counts down (the number itself is shown once, in the page overlay)
  function countdown() {
    x.fillStyle = 'rgba(7,8,10,0.6)'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#f3f5f8'; setFont(x, 500, 54 * S);
    spaced(x, 'STAND BY', W / 2, H * 0.78, 30 * S);
    x.fillStyle = CHAMPAGNE; setFont(x, 600, 22 * S);
    spaced(x, 'SIMULATION', W / 2, H * 0.86, 14 * S);
  }

  return {
    texture: tex,
    canvas: c,
    get program() { return state.program; },
    set(program) {
      if (program === state.program) return;
      state.from = state.program; state.program = program; state.fade = 0;
    },
    countdown(n) { state.countdown = n; },
    draw(t, dt) {
      x.textBaseline = 'alphabetic';
      if (state.fade < 1) {
        // dip through black, like a vision mixer: old programme out, new programme in
        state.fade = Math.min(1, state.fade + dt / 0.9);
        const second = state.fade >= 0.5;
        programs[second ? state.program : state.from](t);
        x.globalAlpha = second ? (1 - state.fade) * 2 : state.fade * 2;
        x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
        x.globalAlpha = 1;
      } else programs[state.program](t);
      if (state.countdown) countdown(state.countdown);
      x.drawImage(seams, 0, 0);
      tex.needsUpdate = true;
    },
    // a rough average colour of the current programme, for the light the wall throws onto the set
    tint() {
      return { idle: [0.5, 0.55, 0.65], cities: [0.95, 0.8, 0.75], presenters: [0.9, 0.85, 0.8], wave: [0.85, 0.8, 0.9] }[state.program];
    },
  };
}

/* ---------- city pylons: tall glass light columns, one per city ---------- */

export function createPylon({ city, tz, coords, color, w = 256, h = 1792 }) {
  const c = canvas(w, h), x = c.getContext('2d');
  const tex = texture(c);
  let last = '';
  function draw() {
    const now = clock(tz);
    if (now === last) return;
    last = now;
    x.clearRect(0, 0, w, h);
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(10,11,14,1)'); g.addColorStop(0.5, color === AMBER ? 'rgba(48,30,12,1)' : 'rgba(16,26,40,1)'); g.addColorStop(1, 'rgba(10,11,14,1)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    // edge light
    x.fillStyle = color; x.fillRect(0, 0, 6, h); x.fillRect(w - 6, 0, 6, h);
    x.save();
    x.translate(w * 0.56, h * 0.5); x.rotate(-Math.PI / 2);
    x.fillStyle = color; setFont(x, 700, 84);
    spaced(x, city, 0, 0, 28);
    x.restore();
    x.fillStyle = '#f3f5f8'; setFont(x, 300, 58, 'normal'); x.textAlign = 'center';
    x.fillText(now.slice(0, 5), w / 2, h * 0.08);
    x.fillStyle = 'rgba(201,206,214,0.7)'; setFont(x, 500, 20);
    spaced(x, now.slice(6) + ' S', w / 2, h * 0.08 + 36, 4);
    x.save(); x.translate(w * 0.5, h * 0.9); x.rotate(-Math.PI / 2);
    setFont(x, 500, 22); x.fillStyle = 'rgba(201,206,214,0.6)';
    spaced(x, coords, 0, 8, 6);
    x.restore();
    tex.needsUpdate = true;
  }
  draw();
  return { texture: tex, draw };
}

/* ---------- desk fascia: names under each chair, wordmark in the middle ---------- */

export function createDeskFascia() {
  const w = 4096, h = 256, c = canvas(w, h), x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
  x.textBaseline = 'middle';
  x.fillStyle = '#f3f5f8'; setFont(x, 600, 64);
  spaced(x, 'DISTANCE // ZERO', w / 2, h * 0.5, 30);
  const name = (n, place, cx, col) => {
    x.fillStyle = col; setFont(x, 700, 50);
    spaced(x, n, cx, h * 0.4, 18);
    x.fillStyle = 'rgba(201,206,214,0.8)'; setFont(x, 500, 26);
    spaced(x, place, cx, h * 0.72, 12);
  };
  name("DJ ANDY'K", 'VIENNA', w * 0.26, AMBER);
  name('GEORGIE', 'MELBOURNE', w * 0.74, ICE);
  x.fillStyle = AMBER; x.fillRect(w * 0.38, h * 0.5 - 2, w * 0.05, 4);
  x.fillStyle = ICE; x.fillRect(w * 0.57, h * 0.5 - 2, w * 0.05, 4);
  return texture(c, { aniso: 16 });
}

/* ---------- floor inlay in front of the desk ---------- */

export function createFloorInlay() {
  const w = 2048, h = 256, c = canvas(w, h), x = c.getContext('2d');
  x.textBaseline = 'middle';
  x.fillStyle = AMBER; setFont(x, 600, 54);
  spaced(x, 'VIENNA', w * 0.16, h / 2, 26);
  x.fillStyle = ICE;
  spaced(x, 'MELBOURNE', w * 0.84, h / 2, 26);
  x.fillStyle = '#f3f5f8'; setFont(x, 400, 46);
  spaced(x, '15,731 KM', w / 2, h / 2, 20);
  const g = x.createLinearGradient(w * 0.3, 0, w * 0.7, 0);
  g.addColorStop(0, AMBER); g.addColorStop(1, ICE);
  x.fillStyle = g; x.fillRect(w * 0.3, h / 2 - 2, w * 0.1, 3); x.fillRect(w * 0.6, h / 2 - 2, w * 0.1, 3);
  return texture(c, { aniso: 16 });
}

/* ---------- small flat labels: camera numbers, the studio sign ---------- */

export function label(text, { w = 256, h = 128, color = '#f3f5f8', bg = '#000', size = 72, weight = 700 } = {}) {
  const c = canvas(w, h), x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  x.fillStyle = color; x.textBaseline = 'middle';
  setFont(x, weight, size);
  spaced(x, text, w / 2, h / 2 + 2, size * 0.12);
  return texture(c);
}

export function studioSign() {
  const w = 1024, h = 256, c = canvas(w, h), x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
  x.textBaseline = 'middle';
  x.fillStyle = '#ff2a2a'; setFont(x, 800, 92);
  spaced(x, 'ON AIR', w / 2, h * 0.4, 24);
  x.fillStyle = '#ffd2c8'; setFont(x, 600, 40);
  spaced(x, 'SIMULATION', w / 2, h * 0.8, 20);
  return texture(c);
}
