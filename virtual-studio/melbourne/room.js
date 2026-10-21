// Melbourne Underground DJ Room: the build. The studio's floor (and its mirror) get an opening in front of the studio's
// own DJ booth: the DJ lift's platform (djlift.js) and glass on a steel grid round it fill it, and under it is the club: LED walls all round (each surface its own
// part of the picture), a glossy floor, a ceiling truss with moving-head spots and washes, LED strips, laser sources,
// haze and smoke machines. The room adds no real light: it is lit by its own LED walls (emissive), the beams and the
// studio's lights above, which reach through the glass. Its booth is booth.js.
import * as THREE from 'three';
import { glow, beamMaterial } from '../set.js';
import { AMBER, ICE } from '../screens.js';
import { BOOTH, GLASS, ROOM, CLUB_BOOTH, OPENING, LIFT_RECT, at } from './layout.js';

const C = { white: new THREE.Color(1, 1, 1), gold: new THREE.Color(AMBER), silver: new THREE.Color(ICE) };

// the studio's floor disc with the glass's opening cut in it, in a shape's plane (x, −z), with the UVs CircleGeometry
// gave it (the floor's own texture stays where it was)
function discWithHole(radius, segments, hole, rotate) {
  const s = new THREE.Shape();
  for (let i = 0; i <= segments; i++) { const a = (i / segments) * Math.PI * 2; s[i ? 'lineTo' : 'moveTo'](Math.cos(a) * radius, Math.sin(a) * radius); }
  s.holes.push(new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, -z))));
  const g = new THREE.ShapeGeometry(s, 1), p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / (2 * radius) + 0.5, p.getY(i) / (2 * radius) + 0.5);
  if (rotate) g.rotateX(-Math.PI / 2);
  return g;
}
// a soft round sprite (haze, smoke, light pools)
function softDot(size = 128, edge = 0.55) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'), g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, `rgba(255,255,255,${edge})`); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

/* ---------- the LED walls' pictures ---------- */
// One canvas per surface (back wall behind the DJ, the two side walls, the front wall), drawn together at up to
// 24 frames a second from the same clock and preset, so they are coordinated but not identical:
//   back: the D//0 mark and the track, over the preset's main picture; sides: the preset's motion running round the
//   room; front: a quieter strip (the cameras look across it). Presets: LOGO, PULSE, TUNNEL, WAVES, TRACK, OFF.
export const LED_PRESETS = ['LOGO', 'PULSE', 'TUNNEL', 'WAVES', 'TRACK', 'OFF'];
function ledWalls(logoImg) {
  const make = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return { c, x: c.getContext('2d'), tex, w, h }; };
  const S = { back: make(1024, 384), left: make(1024, 320), right: make(1024, 320), front: make(1024, 256) };
  let last = -1;
  const GOLD = '242,166,80', SILVER = '169,200,238', WHITE = '255,244,232';
  function bars(s, beat, energy, offset, cols) {
    const n = 48, bw = s.w / n;
    for (let i = 0; i < n; i++) {
      const ph = (beat + (i + offset) / 12) % 1, h = (0.18 + 0.82 * Math.pow(1 - ph, 2.2)) * energy;
      const col = cols[i % cols.length], g = s.x.createLinearGradient(0, s.h, 0, s.h * (1 - h));
      g.addColorStop(0, `rgba(${col},0.95)`); g.addColorStop(1, `rgba(${col},0)`);
      s.x.fillStyle = g; s.x.fillRect(i * bw + 2, s.h * (1 - h), bw - 4, s.h * h);
    }
  }
  function tunnel(s, t, beat, energy) {
    const cx = s.w / 2, cy = s.h / 2;
    for (let k = 0; k < 9; k++) {
      const p = ((t * 0.35 + k / 9) % 1), r = Math.pow(p, 1.6) * s.w * 0.75;
      s.x.strokeStyle = `rgba(${k % 2 ? GOLD : SILVER},${(1 - p) * 0.85 * energy})`; s.x.lineWidth = 2 + 10 * p;
      s.x.strokeRect(cx - r, cy - r * (s.h / s.w) * 1.6, 2 * r, 2 * r * (s.h / s.w) * 1.6);
    }
    s.x.fillStyle = `rgba(${WHITE},${0.25 * energy * Math.max(0, Math.cos(beat * Math.PI * 2))})`; s.x.fillRect(0, 0, s.w, s.h);
  }
  function waves(s, t, energy, phase) {
    for (let k = 0; k < 5; k++) {
      s.x.beginPath();
      for (let i = 0; i <= 64; i++) { const u = i / 64, y = s.h * (0.5 + 0.32 * Math.sin(u * 7 + t * (0.6 + k * 0.15) + phase + k) * Math.sin(t * 0.3 + k)); i ? s.x.lineTo(u * s.w, y) : s.x.moveTo(0, y); }
      s.x.strokeStyle = `rgba(${k % 2 ? SILVER : GOLD},${0.7 * energy})`; s.x.lineWidth = 3 + k; s.x.stroke();
    }
  }
  function grid(s) { s.x.fillStyle = 'rgba(0,0,0,0.5)'; for (let i = 0; i < s.w; i += 32) s.x.fillRect(i, 0, 2, s.h); for (let j = 0; j < s.h; j += 64) s.x.fillRect(0, j, s.w, 2); }
  return {
    surfaces: S,
    draw(t, beat, st) {
      if (t - last < 1 / st.fps) return; last = t;
      const e = st.energy;
      for (const [name, s] of Object.entries(S)) {
        s.x.globalCompositeOperation = 'source-over'; s.x.fillStyle = '#000'; s.x.fillRect(0, 0, s.w, s.h);
        if (st.preset === 'OFF' || e <= 0.001) { s.tex.needsUpdate = true; continue; }
        s.x.globalCompositeOperation = 'lighter';
        const side = name === 'left' || name === 'right', off = name === 'right' ? 24 : 0;
        if (st.preset === 'PULSE') bars(s, beat, e * (name === 'front' ? 0.45 : 1), off, side ? [GOLD, SILVER] : [GOLD]);
        else if (st.preset === 'TUNNEL') name === 'back' ? tunnel(s, t, beat, e) : bars(s, beat, e * 0.6, off, [SILVER]);
        else if (st.preset === 'WAVES') waves(s, t, e * (name === 'front' ? 0.5 : 1), off * 0.2);
        else if (st.preset === 'LOGO' || st.preset === 'TRACK') { waves(s, t * 0.5, e * 0.35, off * 0.2); if (side) bars(s, beat, e * 0.35, off, [GOLD]); }
        // the back wall: the D//0 mark (the official artwork) and, with TRACK or a track given, its title and artist
        if (name === 'back') {
          const showTrack = st.track && (st.preset === 'TRACK' || st.preset === 'LOGO');
          if (logoImg.complete && logoImg.naturalWidth && st.preset !== 'TUNNEL') {
            const h = s.h * (showTrack ? 0.42 : 0.6), w = h * (logoImg.naturalWidth / logoImg.naturalHeight), k = 0.75 + 0.25 * Math.max(0, Math.cos(beat * Math.PI * 2));
            s.x.globalAlpha = Math.min(1, e * k); s.x.globalCompositeOperation = 'source-over';
            s.x.drawImage(logoImg, (s.w - w) / 2, showTrack ? s.h * 0.08 : (s.h - h) / 2, w, h); s.x.globalAlpha = 1;
          }
          if (showTrack) {
            s.x.globalCompositeOperation = 'source-over'; s.x.textAlign = 'center'; s.x.textBaseline = 'middle';
            s.x.fillStyle = `rgba(${WHITE},${Math.min(1, e + 0.2)})`; s.x.font = '600 46px Archivo, Arial, sans-serif';
            s.x.fillText(st.track.title.toUpperCase(), s.w / 2, s.h * 0.68);
            s.x.fillStyle = `rgba(${GOLD},${Math.min(1, e + 0.2)})`; s.x.font = '500 28px Archivo, Arial, sans-serif';
            s.x.fillText(st.track.artist || '', s.w / 2, s.h * 0.83);
          }
        }
        if (name === 'front') { s.x.globalCompositeOperation = 'source-over'; s.x.textAlign = 'left'; s.x.textBaseline = 'middle'; s.x.fillStyle = `rgba(${WHITE},${0.45 * e})`; s.x.font = '600 26px Archivo, Arial, sans-serif'; s.x.fillText('DISTANCE // ZERO  ·  FRIDAY  ·  DJ SESSIONS  ·  MELBOURNE UNDERGROUND', ((-t * 40) % 1024) + 1024 * 0.02, s.h / 2); }
        // the strobe (safe: at most 3 flashes a second, its level capped by the panel)
        if (st.strobe > 0 && (beat * 2) % 1 < 0.12) { s.x.globalCompositeOperation = 'source-over'; s.x.fillStyle = `rgba(255,255,255,${0.7 * st.strobe})`; s.x.fillRect(0, 0, s.w, s.h); }
        s.x.globalCompositeOperation = 'source-over'; grid(s);
        s.tex.needsUpdate = true;
      }
    },
  };
}

export function buildRoom({ studio, scene, quality }) {
  const M = studio.M, root = new THREE.Group(); root.name = 'melbourne-room'; scene.add(root);
  const add = (o, parent = root) => { parent.add(o); return o; };
  const mesh = (geo, mat, parent = root) => add(new THREE.Mesh(geo, mat), parent);
  const glows = [];   // { m, k, group }: emissive parts whose level and colour follow a lighting group
  const lite = !quality?.reflections;   // weaker hardware: fewer haze layers, slower LED pictures

  // the room's frame (Melbourne side), centred on the glass
  const frame = new THREE.Group(); root.add(frame);
  const [gx, gz] = at(GLASS.along, GLASS.across); frame.position.set(gx, 0, gz); frame.rotation.y = BOOTH.rotY;
  const local = (al, ac) => [al - GLASS.along, ac - GLASS.across];   // Melbourne frame → this group's x, z

  /* ----- the opening in the studio floor and in its mirror: the glass and the DJ lift's platform ----- */
  const glassRect = OPENING.map(([al, ac]) => at(al, ac));
  let floor = null; studio.root.traverse(o => { if (o.isMesh && o.material === M.floor && o.geometry.type === 'CircleGeometry') floor = o; });
  if (floor) { const r = floor.geometry.parameters.radius; floor.geometry.dispose(); floor.geometry = discWithHole(r, 96, glassRect, true); }
  const mirror = scene.children.find(o => o.isReflector);
  if (mirror) { const r = mirror.geometry.parameters.radius; mirror.geometry.dispose(); mirror.geometry = discWithHole(r, 64, glassRect, false); }

  /* ----- the glass: panes on a steel T-grid, the slab's edge round it with a lit line ----- */
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x1a2026, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.16, depthWrite: false,
    clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 0.9, side: THREE.DoubleSide });
  // the glass round the DJ lift's platform (which takes the middle of it): panes in front and either side
  const [la0, la1, lc0, lc1] = LIFT_RECT.map((v, i) => v - (i < 2 ? GLASS.along : GLASS.across));   // the platform, in this frame
  const [ga0, ga1, gc0, gc1] = [-GLASS.w / 2, GLASS.w / 2, -GLASS.d / 2, GLASS.d / 2];
  const pieces = [[ga0, ga1, lc1, gc1], [ga0, la0, gc0, lc1], [la1, ga1, gc0, lc1]].filter(([a0, a1, c0, c1]) => a1 - a0 > 0.01 && c1 - c0 > 0.01);
  const panes = pieces.map(([a0, a1, c0, c1]) => {
    const p = mesh(new THREE.PlaneGeometry(a1 - a0, c1 - c0).rotateX(-Math.PI / 2), glass, frame); p.position.set((a0 + a1) / 2, 0.002, (c0 + c1) / 2); p.renderOrder = 3;
    p.userData.focus = 'music'; return p;
  });
  const pane = panes[0];
  const steel = new THREE.MeshStandardMaterial({ color: 0x1c1f23, metalness: 0.8, roughness: 0.38 });
  // the steel T-grid: every line the glass has, only where there is glass (not across the platform)
  const inLift = (a, c) => a > la0 + 0.01 && a < la1 - 0.01 && c > lc0 + 0.01 && c < lc1 - 0.01;
  const beam = (a0, a1, c0, c1) => { const m = mesh(new THREE.BoxGeometry(Math.max(GLASS.beam, a1 - a0), 0.22, Math.max(GLASS.beam, c1 - c0)), steel, frame); m.position.set((a0 + a1) / 2, -0.11, (c0 + c1) / 2); };
  const nW = Math.round(GLASS.w / GLASS.pane), nD = Math.round(GLASS.d / GLASS.pane);
  const cuts = (lo, hi, f0, f1) => [[lo, Math.min(hi, f0)], [Math.max(lo, f1), hi]].filter(([a, b]) => b - a > 0.02);
  for (let i = 0; i <= nW; i++) { const a = ga0 + (i * GLASS.w) / nW; for (const [c0, c1] of (a > la0 && a < la1 ? cuts(gc0, gc1, lc0, lc1) : [[gc0, gc1]])) beam(a, a, c0, c1); }
  for (let j = 0; j <= nD; j++) { const c = gc0 + (j * GLASS.d) / nD; for (const [a0, a1] of (c > lc0 && c < lc1 ? cuts(ga0, ga1, la0, la1) : [[ga0, ga1]])) beam(a0, a1, c, c); }
  // the platform's edge where it meets the glass: a steel beam on each side
  beam(la0 - 0.03, la1 + 0.03, lc1 + 0.03, lc1 + 0.03); if (gc0 < lc1) { beam(la0 - 0.03, la0 - 0.03, Math.max(gc0, lc0), lc1); beam(la1 + 0.03, la1 + 0.03, Math.max(gc0, lc0), lc1); }
  // the slab's faces round the whole opening (dark), a brushed rim on the studio side and a lit line inside it
  const rim = glow(C.silver); glows.push({ m: rim, k: 1.2, group: 'strips' });
  const ring = OPENING.map(([al, ac]) => [al - GLASS.along, ac - GLASS.across]);
  ring.forEach(([a0, c0], i) => {
    const [a1, c1] = ring[(i + 1) % ring.length], lw = Math.abs(a1 - a0), ld = Math.abs(c1 - c0), cx = (a0 + a1) / 2, cz = (c0 + c1) / 2;
    if (Math.max(lw, ld) < 0.01) return;
    // the platform's back edge is the shaft cover's slot (cover.js): the panel runs through it just under the floor
    const slot = ld < 0.01 && Math.abs(c0 - lc0) < 1e-6, SLOT = 0.3;
    if (slot) mesh(new THREE.BoxGeometry(lw, GLASS.slab - SLOT, 0.04), M.dark, frame).position.set(cx, -SLOT - (GLASS.slab - SLOT) / 2, cz);
    else mesh(new THREE.BoxGeometry(lw || 0.04, GLASS.slab, ld || 0.04), M.dark, frame).position.set(cx, -GLASS.slab / 2, cz);
    mesh(new THREE.BoxGeometry((lw || 0.05) + 0.05, 0.008, (ld || 0.05) + 0.05), M.champagne, frame).position.set(cx, 0.004, cz);
    if (!slot) mesh(new THREE.BoxGeometry((lw || 0.012) + 0.01, 0.012, (ld || 0.012) + 0.01), rim, frame).position.set(cx, -0.03, cz);
  });

  /* ----- the club: floor, ceiling, columns, LED walls ----- */
  const [rx, rz] = local(ROOM.along, ROOM.across);
  const room = new THREE.Group(); frame.add(room); room.position.set(rx, 0, rz);
  const H = ROOM.ceiling - ROOM.floor;
  const roomFloor = new THREE.MeshPhysicalMaterial({ color: 0x060709, metalness: 0.35, roughness: 0.2, clearcoat: 0.7, clearcoatRoughness: 0.12 });
  const fl = mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.d).rotateX(-Math.PI / 2), roomFloor, room); fl.position.y = ROOM.floor; fl.receiveShadow = true;
  // the ceiling: concrete-dark, with the glass's opening (the glass's own frame is in `frame`)
  const ceil = new THREE.Shape([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => new THREE.Vector2(a * ROOM.w / 2, b * ROOM.d / 2)));
  ceil.holes.push(new THREE.Path(OPENING.map(([al, ac]) => new THREE.Vector2(al - ROOM.along, -(ac - ROOM.across)))));
  const ce = mesh(new THREE.ShapeGeometry(ceil).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x07070a, roughness: 0.92, side: THREE.DoubleSide }), room); ce.position.y = ROOM.ceiling;
  // dark steel columns in the corners and between the walls' panels, with a champagne line
  const colMat = new THREE.MeshStandardMaterial({ color: 0x101114, metalness: 0.7, roughness: 0.45 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    mesh(new THREE.BoxGeometry(0.5, H, 0.5), colMat, room).position.set(sx * (ROOM.w / 2 - 0.25), ROOM.floor + H / 2, sz * (ROOM.d / 2 - 0.25));
  }
  // the LED walls: back (behind the DJ, −across), left and right (the room's ends along), front (+across, lower,
  // behind the front cameras)
  const led = ledWalls(Object.assign(new Image(), { src: new URL('../../assets/logo-do-1k.webp', import.meta.url).href }));
  const walls = [];
  const wall = (surface, len, h, x, y, z, ry) => {
    const mat = new THREE.MeshBasicMaterial({ map: led.surfaces[surface].tex, color: new THREE.Color(0, 0, 0), toneMapped: true });
    const w = mesh(new THREE.PlaneGeometry(len, h), mat, room); w.position.set(x, y, z); w.rotation.y = ry;
    // its frame: a dark border all round, slightly proud of the screen
    for (const [bx, by, bw, bh] of [[0, h / 2 + 0.04, len + 0.16, 0.08], [0, -h / 2 - 0.04, len + 0.16, 0.08], [-len / 2 - 0.04, 0, 0.08, h], [len / 2 + 0.04, 0, 0.08, h]]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.1), M.dark); f.position.set(bx, by, 0.02); w.add(f);
    }
    walls.push(mat); return w;
  };
  wall('back', ROOM.w - 1.4, H - 0.7, 0, ROOM.floor + 0.35 + (H - 0.7) / 2, -ROOM.d / 2 + 0.06, 0);
  wall('left', ROOM.d - 1.4, H - 1.0, -ROOM.w / 2 + 0.06, ROOM.floor + 0.5 + (H - 1.0) / 2, 0, Math.PI / 2);
  wall('right', ROOM.d - 1.4, H - 1.0, ROOM.w / 2 - 0.06, ROOM.floor + 0.5 + (H - 1.0) / 2, 0, -Math.PI / 2);
  wall('front', ROOM.w - 1.4, 1.4, 0, ROOM.ceiling - 1.0, ROOM.d / 2 - 0.06, Math.PI);
  // the walls round the screens: dark acoustic panels
  const panel = new THREE.MeshStandardMaterial({ color: 0x08090b, roughness: 0.85 });
  for (const [len, x, z, ry] of [[ROOM.w, 0, -ROOM.d / 2, 0], [ROOM.d, -ROOM.w / 2, 0, Math.PI / 2], [ROOM.d, ROOM.w / 2, 0, -Math.PI / 2], [ROOM.w, 0, ROOM.d / 2, Math.PI]]) {
    const p = mesh(new THREE.PlaneGeometry(len, H), panel, room); p.position.set(x, ROOM.floor + H / 2, z); p.rotation.y = ry;
  }

  /* ----- LED strips: along the floor at the walls' feet, round the ceiling, round the DJ riser (booth.js lights its own) ----- */
  const strip = glow(C.gold); glows.push({ m: strip, k: 1.6, group: 'strips' });
  for (const [len, x, z, ry] of [[ROOM.w - 1.2, 0, -ROOM.d / 2 + 0.3, 0], [ROOM.d - 1.2, -ROOM.w / 2 + 0.3, 0, Math.PI / 2], [ROOM.d - 1.2, ROOM.w / 2 - 0.3, 0, Math.PI / 2], [ROOM.w - 1.2, 0, ROOM.d / 2 - 0.3, 0]]) {
    for (const y of [ROOM.floor + 0.02, ROOM.ceiling - 0.03]) { const s = mesh(new THREE.BoxGeometry(len, 0.015, 0.03), strip, room); s.position.set(x, y, z); s.rotation.y = ry; }
  }
  // architectural accents: warm uplights grazing the four columns
  const accent = glow(C.gold); glows.push({ m: accent, k: 1.1, group: 'accent' });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const a = mesh(new THREE.PlaneGeometry(0.42, H - 0.2), accent, room); a.material = new THREE.MeshBasicMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = 8; c.height = 128; const x = c.getContext('2d'); const g = x.createLinearGradient(0, 128, 0, 0); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 8, 128); return new THREE.CanvasTexture(c); })(), color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    glows.push({ m: a.material, k: 0.9, group: 'accent' });
    a.position.set(sx * (ROOM.w / 2 - 0.25) - sx * 0.26, ROOM.floor + (H - 0.2) / 2, sz * (ROOM.d / 2 - 0.25)); a.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
  }

  /* ----- the rig: two truss lines over the room, moving-head spots (narrow beams) and washes (wide, soft) ----- */
  const trussY = ROOM.ceiling - 0.45;
  const trussMat = new THREE.MeshStandardMaterial({ color: 0x1a1b1e, metalness: 0.85, roughness: 0.35 });
  const [bAl, bAc] = [CLUB_BOOTH.along - ROOM.along, CLUB_BOOTH.across - ROOM.across];
  // (the back line clear of the DJ lift's shaft: the platform and its rails pass between the two)
  const trussZ = [LIFT_RECT[2] - ROOM.across - 0.55, bAc + 1.9];
  for (const z of trussZ) for (const dy of [0, -0.3]) for (const dz of [-0.15, 0.15]) mesh(new THREE.CylinderGeometry(0.025, 0.025, ROOM.w - 1.6, 8).rotateZ(Math.PI / 2), trussMat, room).position.set(0, trussY + dy, z + dz);
  const heads = [], beamGeo = a => new THREE.ConeGeometry(Math.tan(a), 1, 24, 1, true).translate(0, -0.5, 0).rotateX(-Math.PI / 2);
  const spotGeo = beamGeo(0.05), washGeo = beamGeo(0.2);
  trussZ.forEach((z, row) => {
    for (let i = 0; i < 6; i++) {
      const kind = i % 2 ? 'wash' : 'spot', x = -4.5 + i * 1.8 + (row ? 0.9 : 0);
      const head = new THREE.Group(); head.position.set(x, trussY - 0.5, z); room.add(head);
      mesh(new THREE.BoxGeometry(0.34, 0.12, 0.26), M.dark, head).position.y = 0.2;                       // the base on the truss
      mesh(new THREE.BoxGeometry(0.06, 0.32, 0.3), M.dark, head).position.x = -0.15;                       // the yoke
      mesh(new THREE.BoxGeometry(0.06, 0.32, 0.3), M.dark, head).position.x = 0.15;
      const aim = new THREE.Group(); head.add(aim);
      mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.3, 20).rotateX(Math.PI / 2), M.dark, aim);
      const lens = glow(C.white); glows.push({ m: lens, k: 2.2, group: kind });
      mesh(new THREE.CircleGeometry(kind === 'wash' ? 0.1 : 0.06, 24), lens, aim).position.z = 0.152;
      const bm = beamMaterial(C.white), beam = mesh(kind === 'wash' ? washGeo : spotGeo, bm, aim);
      heads.push({ kind, head, aim, beam, bm, i: heads.length, row });
    }
  });
  // light pools on the floor where the heads land
  const dot = softDot(64, 0.9);
  const pools = heads.map(h => mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: dot, color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), room));

  /* ----- lasers: four sources (two behind the DJ, high; one on each side wall), each a fan of fine beams ----- */
  const lasers = [];
  const rayDir = new THREE.Vector3(), rayAt = new THREE.Vector3();
  const laserSrc = [[-2.6, ROOM.floor + 3.9, -ROOM.d / 2 + 0.35, 0], [2.6, ROOM.floor + 3.9, -ROOM.d / 2 + 0.35, 0], [-ROOM.w / 2 + 0.35, ROOM.floor + 3.4, bAc + 0.4, Math.PI / 2], [ROOM.w / 2 - 0.35, ROOM.floor + 3.4, bAc + 0.4, -Math.PI / 2]];
  for (const [x, y, z, ry] of laserSrc) {
    const unit = new THREE.Group(); unit.position.set(x, y, z); unit.rotation.y = ry; room.add(unit);
    mesh(new THREE.BoxGeometry(0.34, 0.14, 0.26), M.dark, unit);
    const aperture = glow(C.white); glows.push({ m: aperture, k: 1.5, group: 'lasers' });
    mesh(new THREE.PlaneGeometry(0.2, 0.03), aperture, unit).position.z = 0.131;
    const fan = new THREE.Group(); unit.add(fan); fan.position.z = 0.14;
    const mat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    // each beam: a bright core and a faint glow round it (the beam seen through haze)
    const halo = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const rays = [];
    for (let i = 0; i < (lite ? 10 : 16); i++) {
      const r = mesh(new THREE.CylinderGeometry(0.0028, 0.0028, 1, 4).translate(0, 0.5, 0).rotateX(Math.PI / 2), mat, fan); r.scale.z = 11; r.castShadow = false;
      const h = mesh(new THREE.CylinderGeometry(0.011, 0.011, 1, 6).translate(0, 0.5, 0).rotateX(Math.PI / 2), halo, r); h.castShadow = false;
      rays.push(r);
    }
    lasers.push({ unit, fan, mat, halo, rays, k: lasers.length });
  }

  /* ----- haze (continuous, density adjustable) and smoke (bursts from two machines either side of the booth) ----- */
  const hazeTex = softDot(128, 0.5);
  const haze = [];
  const hazeN = lite ? 6 : 14;
  for (let i = 0; i < hazeN; i++) {
    const m = mesh(new THREE.PlaneGeometry(7, 3.2), new THREE.MeshBasicMaterial({ map: hazeTex, color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), room);
    m.position.set(-5 + ((i * 3.7) % 10), ROOM.floor + 1.6 + (i % 3) * 1.0, -3.8 + ((i * 2.3) % 7.6)); m.userData.ph = i * 1.7; haze.push(m);
  }
  const smokeTex = softDot(128, 0.85);
  const machines = [[bAl - 3.0, bAc + 0.2], [bAl + 3.0, bAc + 0.2]].map(([x, z]) => {   // outside the lift's footprint
    const g = new THREE.Group(); g.position.set(x, ROOM.floor, z); room.add(g);
    mesh(new THREE.BoxGeometry(0.5, 0.28, 0.32), M.dark, g).position.y = 0.14;
    mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.08, 12).rotateZ(Math.PI / 2), M.chrome, g).position.set(0, 0.18, 0.18);
    return g;
  });
  const puffs = [];
  for (let i = 0; i < (lite ? 32 : 72); i++) {
    const m = mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: smokeTex, color: 0x000000, transparent: true, depthWrite: false, opacity: 0 }), room);
    m.visible = false; puffs.push({ m, life: 0, vel: new THREE.Vector3() });
  }
  let smokeLeft = 0, smokeNext = 0, smokeAt = 0;

  /* ----- per frame ----- */
  const camQ = new THREE.Quaternion(), v = new THREE.Vector3(), w = new THREE.Vector3(), boothWorld = new THREE.Vector3();
  const goals = heads.map(() => new THREE.Vector3()), cur = heads.map(() => new THREE.Vector3(bAl, ROOM.floor, bAc + 1.5));
  const toRoom = new THREE.Matrix4();
  function update(t, dt, L, beat) {
    for (const g of glows) { const s = L[g.group]; if (!s) continue; g.m.color.copy(s.color).multiplyScalar(s.level * g.k); }
    for (const m of walls) m.color.setScalar(L.led.level > 0.001 ? 1 : 0);
    led.draw(t, beat, { preset: L.preset, energy: L.led.level, strobe: L.strobe.level, track: L.track, fps: lite ? 12 : 24 });
    // moving heads: smooth figures, not random: each head's aim point eases towards a point on its pattern
    for (const h of heads) {
      const s = L[h.kind], p = s.pattern, k = h.i * 0.52, ph = beat * Math.PI * 2;
      const g = goals[h.i];
      if (p === 'center') g.set(bAl + (h.i % 6 - 2.5) * 0.25, ROOM.floor, bAc + 0.4);
      else if (p === 'fan') g.set(bAl + (h.i % 6 - 2.5) * 1.6, ROOM.floor, bAc + 3.0 + (h.row ? 0.8 : -0.8));
      else if (p === 'sweep') g.set(bAl + Math.sin(t * 0.45 + k) * 4.5, ROOM.floor, bAc + 2.2 + Math.cos(t * 0.35 + k) * 2.2);
      else if (p === 'beat') g.set(bAl + Math.sin(ph / 4 + k) * 4.2, ROOM.floor, bAc + 2.4 + Math.sin(ph / 2 + k) * 1.8);
      else g.set(bAl + (h.i % 6 - 2.5) * 0.9, ROOM.floor + 3.2, bAc - 3.8);   // 'up': into the back wall, over the DJ
      cur[h.i].lerp(g, 1 - Math.exp(-dt * (p === 'beat' ? 3 : 1.4)));
      h.aim.lookAt(v.copy(cur[h.i]).applyMatrix4(room.matrixWorld));
      const d = h.aim.getWorldPosition(w).distanceTo(v);
      h.beam.scale.set(1, 1, d);
      const pulse = s.pulse ? 0.5 + 0.5 * Math.max(0, Math.cos(ph)) : 1;
      h.bm.uniforms.uColor.value.copy(s.color);
      h.bm.uniforms.uOpacity.value = (h.kind === 'wash' ? 0.12 : 0.34) * s.level * (0.25 + 0.75 * L.haze.level) * pulse;
      const pool = pools[h.i]; pool.position.set(cur[h.i].x, ROOM.floor + 0.004, cur[h.i].z); pool.visible = cur[h.i].y < ROOM.floor + 0.5;
      pool.scale.setScalar(h.kind === 'wash' ? 2.2 : 0.7); pool.material.color.copy(s.color).multiplyScalar((h.kind === 'wash' ? 0.25 : 0.55) * s.level * pulse);
    }
    // lasers: fans crossing above and behind the DJ, the opening angle and tilt on the bars, sharp on the beat
    for (const l of lasers) {
      const s = L.lasers, open = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * 0.4 + l.k));
      l.fan.rotation.x = -0.12 - 0.28 * (0.5 + 0.5 * Math.sin((beat / 4) * Math.PI * 2 + l.k));
      l.fan.rotation.y = (l.k < 2 ? (l.k ? -0.35 : 0.35) : 0) + 0.15 * Math.sin(t * 0.3 + l.k);
      // the pattern: a fan (spread across), a scan (the fan sweeping wide on the bar), or a tunnel (a turning cone)
      const pat = s.pattern || 'fan', nR = l.rays.length;
      if (pat === 'tunnel') { l.fan.rotation.x = -0.2; l.rays.forEach((r, i) => { const a = (i / nR) * Math.PI * 2 + t * 1.2 * (l.k % 2 ? 1 : -1); r.rotation.set(Math.sin(a) * 0.16, Math.cos(a) * 0.16, 0); }); }
      else { if (pat === 'scan') l.fan.rotation.y += Math.sin((beat / 8) * Math.PI * 2 + l.k) * 0.45; l.rays.forEach((r, i) => { r.rotation.set(0, (i / (nR - 1) - 0.5) * open, 0); }); }
      // a beam ends at the club's ceiling (the underside of the studio floor): it never shows up in the studio above
      l.fan.updateMatrixWorld(true);
      for (const r of l.rays) { r.getWorldDirection(rayDir); r.getWorldPosition(rayAt); r.scale.z = rayDir.y > 0.001 ? Math.min(11, (ROOM.ceiling - 0.03 - rayAt.y) / rayDir.y) : 11; }
      const on = s.level * (s.pulse ? ((beat * 2) % 1 < 0.55 ? 1 : 0.1) : 1);
      l.mat.color.copy(s.color).multiplyScalar(1.8 * on); l.halo.color.copy(s.color).multiplyScalar(0.22 * on * (0.25 + 0.75 * L.haze.level));
      l.fan.visible = on > 0.002;
    }
    // haze: slow drift, lit by what is in the air
    camQ.copy(cameraQuat);
    const air = 0.04 * L.haze.level * (0.3 + L.spot.level + 0.6 * L.wash.level + 0.4 * L.led.level);
    for (const m of haze) { m.position.x += Math.sin(t * 0.05 + m.userData.ph) * dt * 0.08; m.quaternion.copy(camQ); m.material.color.copy(L.wash.color).lerp(C.white, 0.5).multiplyScalar(air); m.visible = air > 0.0005; }
    // smoke: a burst is a few seconds of puffs from both machines, which rise, spread and fade
    if (L.smokeRequest) { smokeLeft = L.smokeRequest; L.smokeRequest = 0; }
    if (smokeLeft > 0) {
      smokeLeft -= dt; smokeAt += dt;
      if (smokeAt >= smokeNext) {
        smokeAt = 0; smokeNext = 0.08;
        for (const mach of machines) {
          const p = puffs.find(q => !q.m.visible); if (!p) break;
          p.m.visible = true; p.life = 0; p.m.position.set(mach.position.x, ROOM.floor + 0.2, mach.position.z + 0.22);
          p.vel.set((Math.random() - 0.5) * 0.4, 0.35 + Math.random() * 0.25, 0.9 + Math.random() * 0.5);
        }
      }
    }
    for (const p of puffs) {
      if (!p.m.visible) continue;
      p.life += dt; p.vel.multiplyScalar(1 - dt * 0.45);
      p.m.position.addScaledVector(p.vel, dt);
      const life = p.life / 5;   // five seconds
      if (life >= 1) { p.m.visible = false; continue; }
      p.m.scale.setScalar(0.6 + life * 3.4); p.m.quaternion.copy(camQ);
      p.m.material.opacity = 0.55 * Math.sin(Math.PI * Math.min(1, life * 1.4)) * (1 - life);
      p.m.material.color.copy(L.wash.color).lerp(C.white, 0.7).multiplyScalar(0.35 + 0.6 * Math.max(L.wash.level, L.spot.level));
    }
  }
  const cameraQuat = new THREE.Quaternion();
  const R = Math.hypot(ROOM.w, ROOM.d) / 2 + 1;
  const [cx, cz] = at(ROOM.along, ROOM.across);
  return {
    root, frame, room, update, floor, mirror, glass, panes, led, floorMaterial: roomFloor, heads, lasers, puffs, haze,
    face(camera) { cameraQuat.copy(camera.quaternion); },
    bounds: new THREE.Box3(new THREE.Vector3(cx - R, ROOM.floor - 0.1, cz - R), new THREE.Vector3(cx + R, 2.6, cz + R)),   // (up to the booth's top while it is up in the studio)
    toRoom,
  };
}
