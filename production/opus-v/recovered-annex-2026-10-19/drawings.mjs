// Technical drawings of the Vienna Piano Stage, drawn from the same numbers the 3D stage is built from (layout.js),
// with the existing studio around it (values read from set.js and views.js). Writes two SVGs:
//   docs/vienna-stage/floor-plan.svg     plan, seen from above (back of the studio at the top)
//   docs/vienna-stage/section.svg        vertical section through the lift's centre, seen from the front
//   node virtual-studio/vienna/drawings.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOM, PORTAL, ANNEX, DECK, LIFT, CAMS, RIG, PIANO_ON_PLATFORM, platformTop } from './layout.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'docs', 'vienna-stage');

// the existing studio, as set.js and views.js build it (for reference only; nothing of it changes)
const STUDIO = {
  wallR: ROOM.R + 0.6, A0: Math.PI - 1.95, A1: Math.PI + 1.95,
  led: { R: 10, Z: 3, span: 0.56 }, riser: { r: 3.36, z: -1.9 }, desk: { r: 2.4 },
  piano: [-5.3, 0.3], dj: [5.4, 0.1], pylons: [[-6.6, -4.2], [6.6, -4.2]], lounge: { x0: -3.5, x1: 3.5, z0: -11.2, z1: -7.35 },
  security: [-11.15, -3.3, 6.5], truss: { r: 5.5, z: -1.4, y: 6.9 }, wide: [0, 11.4],
};
const wallAngle = z => 2 * Math.PI - Math.acos((z - ROOM.Z) / ROOM.R);
const wallX = (z, R = STUDIO.wallR) => -Math.sqrt(R ** 2 - (z - ROOM.Z) ** 2);
const f = n => +n.toFixed(2);

const STYLE = `<style>
  text{font-family:"Helvetica Neue",Arial,sans-serif;fill:#1d1f23}
  .t{font-size:13px}.s{font-size:10.5px;fill:#4a4f57}.h{font-size:17px;font-weight:700;letter-spacing:.06em}.k{font-size:11px;font-weight:600}
  .studio{fill:none;stroke:#9aa0a8;stroke-width:1.2}.studioFill{fill:#eef0f3;stroke:#9aa0a8;stroke-width:1}
  .wall{fill:none;stroke:#1d1f23;stroke-width:3}.wallThin{fill:none;stroke:#1d1f23;stroke-width:1.5}
  .new{fill:none;stroke:#c97a1e;stroke-width:2}.newFill{fill:#fbecd9;stroke:#c97a1e;stroke-width:1.5}
  .deck{fill:#f4dcc0;stroke:#a65f12;stroke-width:1.5}.plat{fill:#e9b779;stroke:#7a4407;stroke-width:1.5}
  .piano{fill:#2b2d31;stroke:#000;stroke-width:1}.ghost{fill:none;stroke:#7a4407;stroke-width:1.2;stroke-dasharray:5 4}
  .dim{stroke:#3b6fb6;stroke-width:1;fill:none}.dimT{font-size:11px;fill:#3b6fb6}
  .cam{fill:#d23b2f}.fov{fill:#d23b2f;fill-opacity:.07;stroke:#d23b2f;stroke-width:.8;stroke-dasharray:3 3}
  .fx{fill:#ffd23f;stroke:#7a5b00;stroke-width:1}.mv{fill:#ff9b2f;stroke:#7a3f00;stroke-width:1}.ac{fill:#59a6ff;stroke:#1d4d8a;stroke-width:1}
  .beam{stroke:#e8a400;stroke-width:.8;stroke-dasharray:2 3;fill:none}.steel{stroke:#3c4148;stroke-width:3;fill:none}.ram{stroke:#8a1c1c;stroke-width:5}
</style>`;

/* ---------------------------------------------------------------- plan ---------------------------------------------------------------- */
function plan() {
  const S = 22, X0 = -24, X1 = 14.5, Z0 = -14, Z1 = 13.5, M = 30, LEG = 250;
  const W = (X1 - X0) * S + 2 * M + LEG, H = (Z1 - Z0) * S + 2 * M + 40;
  const X = x => f(M + (x - X0) * S), Y = z => f(M + 40 + (z - Z0) * S);
  const out = [];
  const line = (x1, z1, x2, z2, c) => out.push(`<line x1="${X(x1)}" y1="${Y(z1)}" x2="${X(x2)}" y2="${Y(z2)}" class="${c}"/>`);
  const text = (x, z, s, c = 't', a = 'start', dy = 0) => out.push(`<text x="${X(x)}" y="${f(Y(z) + dy)}" class="${c}" text-anchor="${a}">${s}</text>`);
  const arc = (R, cz, from, to, c, n = 80) => {
    const pts = []; for (let i = 0; i <= n; i++) { const a = from + ((to - from) * i) / n; pts.push(`${X(R * Math.sin(a))},${Y(cz + R * Math.cos(a))}`); }
    out.push(`<polyline points="${pts.join(' ')}" class="${c}"/>`);
  };
  const circle = (x, z, r, c) => out.push(`<circle cx="${X(x)}" cy="${Y(z)}" r="${f(r * S)}" class="${c}"/>`);
  const rect = (x0, z0, x1, z1, c) => out.push(`<rect x="${X(Math.min(x0, x1))}" y="${Y(Math.min(z0, z1))}" width="${f(Math.abs(x1 - x0) * S)}" height="${f(Math.abs(z1 - z0) * S)}" class="${c}"/>`);
  const dimH = (x0, x1, z, label, off = -14) => { line(x0, z, x1, z, 'dim'); for (const x of [x0, x1]) out.push(`<line x1="${X(x)}" y1="${Y(z) - 5}" x2="${X(x)}" y2="${Y(z) + 5}" class="dim"/>`); out.push(`<text x="${f((X(x0) + X(x1)) / 2)}" y="${f(Y(z) + off)}" class="dimT" text-anchor="middle">${label}</text>`); };
  const dimV = (z0, z1, x, label) => { line(x, z0, x, z1, 'dim'); for (const z of [z0, z1]) out.push(`<line x1="${X(x) - 5}" y1="${Y(z)}" x2="${X(x) + 5}" y2="${Y(z)}" class="dim"/>`); out.push(`<text x="${X(x) - 8}" y="${f((Y(z0) + Y(z1)) / 2)}" class="dimT" text-anchor="end">${label}</text>`); };

  out.push(`<rect width="${W}" height="${H}" fill="#fff"/>`);
  out.push(`<text x="${M}" y="26" class="h">DISTANCE // ZERO — VIENNA PIANO STAGE · FLOOR PLAN</text>`);
  out.push(`<text x="${M}" y="44" class="s">Scale 1:${Math.round(1000 / S * 0.264583 * 3.78)} at 96 dpi (${S} px = 1 m) · studio coordinates in metres (x → Melbourne, z → cameras) · grey = existing studio, unchanged · orange = new</text>`);

  // grid every 2 m
  for (let x = Math.ceil(X0 / 2) * 2; x <= X1; x += 2) out.push(`<line x1="${X(x)}" y1="${Y(Z0)}" x2="${X(x)}" y2="${Y(Z1)}" stroke="#f1f2f4"/>`);
  for (let z = Math.ceil(Z0 / 2) * 2; z <= Z1; z += 2) out.push(`<line x1="${X(X0)}" y1="${Y(z)}" x2="${X(X1)}" y2="${Y(z)}" stroke="#f1f2f4"/>`);

  /* existing studio */
  const a0 = wallAngle(PORTAL.z0), a1 = wallAngle(PORTAL.z1);
  arc(STUDIO.wallR, ROOM.Z, STUDIO.A0, a0, 'wall'); arc(STUDIO.wallR, ROOM.Z, a1, STUDIO.A1, 'wall');
  arc(STUDIO.wallR, ROOM.Z, a0, a1, 'ghost');   // the wall above the opening (lintel), cut away below 5.8 m
  arc(STUDIO.led.R, STUDIO.led.Z, Math.PI - STUDIO.led.span, Math.PI + STUDIO.led.span, 'studio');
  text(0, STUDIO.led.Z - STUDIO.led.R - 0.35, 'LED wall', 's', 'middle');
  circle(0, STUDIO.riser.z, STUDIO.riser.r, 'studioFill'); text(0, STUDIO.riser.z + 0.15, 'desk riser · host / co-host / guest', 's', 'middle');
  rect(STUDIO.lounge.x0, STUDIO.lounge.z0, STUDIO.lounge.x1, STUDIO.lounge.z1, 'studioFill'); text(0, (STUDIO.lounge.z0 + STUDIO.lounge.z1) / 2, 'backstage lounge', 's', 'middle', 4);
  rect(STUDIO.piano[0] - 1.1, STUDIO.piano[1] - 1.1, STUDIO.piano[0] + 1.1, STUDIO.piano[1] + 1.1, 'studioFill'); text(STUDIO.piano[0], STUDIO.piano[1], 'studio grand (stays)', 's', 'middle', 4);
  rect(STUDIO.dj[0] - 1.2, STUDIO.dj[1] - 0.7, STUDIO.dj[0] + 1.2, STUDIO.dj[1] + 0.7, 'studioFill'); text(STUDIO.dj[0], STUDIO.dj[1], 'DJ booth', 's', 'middle', 4);
  for (const [x, z] of STUDIO.pylons) rect(x - 0.37, z - 0.2, x + 0.37, z + 0.2, 'studioFill');
  text(-6.6, -4.9, 'VIENNA pylon', 's', 'middle'); text(6.6, -4.9, 'MELBOURNE pylon', 's', 'middle');
  circle(0, STUDIO.truss.z, STUDIO.truss.r, 'studio');
  out.push(`<rect x="${X(STUDIO.security[0]) - 4}" y="${Y(STUDIO.security[1]) - 4}" width="8" height="8" fill="#555"/>`);
  text(STUDIO.security[0] + 0.3, STUDIO.security[1] - 0.3, 'SEC 1 (on lintel, 6.5 m)', 's');
  text(STUDIO.wallR * 0.62, 9.5, 'existing studio (Ø 26.4 m, 8.4 m high) — open to the cameras', 's', 'middle');
  text(10.6, 4.2, 'MELBOURNE side', 'k', 'middle'); text(10.6, 4.7, '(Phase 2: underground DJ stage beyond this wall)', 's', 'middle');

  /* annex */
  const zc = (ANNEX.z0 + ANNEX.z1) / 2;
  const shell = [[wallX(ANNEX.z0) + 0.3, ANNEX.z0], [ANNEX.x0, ANNEX.z0], [ANNEX.x0, ANNEX.z1], [wallX(ANNEX.z1) + 0.3, ANNEX.z1]];
  out.push(`<polyline points="${shell.map(([x, z]) => `${X(x)},${Y(z)}`).join(' ')}" class="wall" stroke="#c97a1e" style="stroke:#c97a1e"/>`);
  rect(DECK.x0, DECK.z0, DECK.x1, DECK.z1, 'deck');
  for (const [i] of [[0], [1]]) rect(DECK.x1 + 0.34 * i, LIFT.z - 1.6, DECK.x1 + 0.34 * (i + 1), LIFT.z + 1.6, 'deck');
  circle(LIFT.x, LIFT.z, LIFT.well, 'newFill');
  circle(LIFT.x, LIFT.z, LIFT.r, 'plat');
  // scissor base frame (dashed, under the platform)
  rect(LIFT.x - LIFT.arm / 2 - 0.25, LIFT.z - 1.05, LIFT.x + LIFT.arm / 2 + 0.25, LIFT.z + 1.05, 'ghost');
  // the grand: case footprint (2.74 × 1.58), keyboard to +z, bench
  const pz = LIFT.z + PIANO_ON_PLATFORM.z;
  out.push(`<path d="M${X(LIFT.x - 0.79)},${Y(pz + 0.17)} L${X(LIFT.x + 0.79)},${Y(pz + 0.17)} L${X(LIFT.x + 0.79)},${Y(pz - 0.62)} Q${X(LIFT.x + 0.79)},${Y(pz - 1.3)} ${X(LIFT.x + 0.1)},${Y(pz - 1.92)} Q${X(LIFT.x - 0.1)},${Y(pz - 2.74)} ${X(LIFT.x - 0.46)},${Y(pz - 2.74)} L${X(LIFT.x - 0.79)},${Y(pz - 2.38)} Z" class="piano"/>`);
  rect(LIFT.x - 0.4, pz + 0.43, LIFT.x + 0.4, pz + 0.81, 'piano');
  text(LIFT.x, pz - 1.2, 'GRAND', 'k', 'middle', 4); out.push(`<text x="${X(LIFT.x)}" y="${Y(pz - 1.2) + 18}" class="s" text-anchor="middle" style="fill:#fff">2.74 × 1.58 m</text>`);
  text(LIFT.x, pz + 1.12, 'bench · pianist', 's', 'middle', 4);

  /* rig */
  circle(LIFT.x, LIFT.z, RIG.perimeter.r, 'new');
  for (let i = 0; i < RIG.perimeter.n; i++) {
    const a = ((i + 0.5) / RIG.perimeter.n) * Math.PI * 2;
    const x = LIFT.x + Math.cos(a) * RIG.perimeter.r, z = LIFT.z + Math.sin(a) * RIG.perimeter.r;
    out.push(`<circle cx="${X(x)}" cy="${Y(z)}" r="6" class="fx"/>`); text(x, z, `S${i + 1}`, 's', 'middle', -9);
  }
  RIG.moving.forEach(([x, , z], i) => { out.push(`<rect x="${X(x) - 6}" y="${Y(z) - 6}" width="12" height="12" class="mv"/>`); text(x, z, `M${i + 1}`, 's', 'middle', 18); });
  RIG.accent.forEach(([x, , z], i) => { out.push(`<polygon points="${X(x)},${Y(z) - 7} ${X(x) + 7},${Y(z) + 6} ${X(x) - 7},${Y(z) + 6}" class="ac"/>`); text(x + 0.35, z, `A${i + 1}`, 's', 'start', 4); });
  out.push(`<circle cx="${X(RIG.spot[0])}" cy="${Y(RIG.spot[2])}" r="8" class="fx" style="fill:#fff2b0"/>`); text(RIG.spot[0], RIG.spot[2], 'FS', 'k', 'middle', 4);

  /* cameras (positions with the lift down) */
  for (const [k, c] of Object.entries(CAMS)) {
    const [px, , pz2] = c.pos, [tx, , tz] = c.target;
    const dir = Math.atan2(tz - pz2, tx - px), hf = Math.atan(Math.tan((c.fov * Math.PI) / 360) * (16 / 9)), L = 3.2;
    const p1 = [px + Math.cos(dir - hf) * L, pz2 + Math.sin(dir - hf) * L], p2 = [px + Math.cos(dir + hf) * L, pz2 + Math.sin(dir + hf) * L];
    out.push(`<polygon points="${X(px)},${Y(pz2)} ${X(p1[0])},${Y(p1[1])} ${X(p2[0])},${Y(p2[1])}" class="fov"/>`);
    out.push(`<circle cx="${X(px)}" cy="${Y(pz2)}" r="5.5" class="cam"/>`);
    text(px, pz2, k, 'k', 'middle', -10);
  }

  /* dimensions */
  dimV(ANNEX.z0, ANNEX.z1, ANNEX.x0 - 0.9, `${f(ANNEX.z1 - ANNEX.z0)} m`);
  dimH(ANNEX.x0, wallX(zc), ANNEX.z0 - 1.1, `annex depth ${f(wallX(zc) - ANNEX.x0)} m (from studio wall)`);
  dimV(PORTAL.z0, PORTAL.z1, wallX(-1) + 1.4, `opening ${f(PORTAL.z1 - PORTAL.z0)} m`);
  dimH(DECK.x0, DECK.x1, DECK.z1 + 0.7, `deck ${f(DECK.x1 - DECK.x0)} × ${f(DECK.z1 - DECK.z0)} m, +${DECK.h} m`, 16);
  dimH(LIFT.x - LIFT.r, LIFT.x + LIFT.r, LIFT.z - LIFT.r - 0.5, `platform Ø ${f(2 * LIFT.r)} m`);

  /* legend */
  const lx = W - LEG + 10; let ly = 90;
  const leg = (svg, label) => { out.push(svg.replace(/\{x\}/g, lx).replace(/\{y\}/g, ly)); out.push(`<text x="${lx + 26}" y="${ly + 4}" class="s">${label}</text>`); ly += 22; };
  out.push(`<text x="${lx}" y="${ly - 22}" class="k">LEGEND</text>`);
  leg('<line x1="{x}" y1="{y}" x2="' + (lx + 18) + '" y2="{y}" class="wall"/>', 'wall, full height');
  leg('<line x1="{x}" y1="{y}" x2="' + (lx + 18) + '" y2="{y}" class="ghost"/>', 'above / below (lintel, lift frame)');
  leg('<rect x="{x}" y="' + (ly - 6) + '" width="18" height="12" class="deck"/>', `stage deck +${DECK.h} m`);
  leg('<circle cx="' + (lx + 9) + '" cy="{y}" r="7" class="plat"/>', 'lift platform (round)');
  leg('<circle cx="' + (lx + 9) + '" cy="{y}" r="6" class="fx"/>', 'S1–S8 perimeter spots (ring, 8.6 m)');
  leg('<rect x="' + (lx + 3) + '" y="' + (ly - 6) + '" width="12" height="12" class="mv"/>', 'M1–M4 moving heads (9.2 m)');
  leg('<polygon points="' + (lx + 9) + ',' + (ly - 7) + ' ' + (lx + 16) + ',' + (ly + 6) + ' ' + (lx + 2) + ',' + (ly + 6) + '" class="ac"/>', 'A1–A4 accent / backlights');
  leg('<circle cx="' + (lx + 9) + '" cy="{y}" r="7" class="fx" style="fill:#fff2b0"/>', 'FS performance spot (9.0 m)');
  leg('<circle cx="' + (lx + 9) + '" cy="{y}" r="5.5" class="cam"/>', 'virtual cameras P1–P5 (lift down)');
  ly += 8;
  for (const [k, c] of Object.entries(CAMS)) { out.push(`<text x="${lx}" y="${ly}" class="s">${k} · ${c.label} · ${c.fov}° v · rises ${c.rise ? Math.round(c.rise * 100) + ' %' : 'no'}</text>`); ly += 16; }
  ly += 10;
  for (const s of ['Dimensions are design values from layout.js,', 'checked against the studio model (set.js).', 'Not a structural drawing.']) { out.push(`<text x="${lx}" y="${ly}" class="s">${s}</text>`); ly += 15; }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${STYLE}${out.join('\n')}</svg>`;
}

/* -------------------------------------------------------------- section --------------------------------------------------------------- */
// scissor geometry, as stage.js poses it
function scissor(h) {
  const BASE_TOP = 0.1, TOP_FRAME = 0.06, xL = -LIFT.arm / 2;
  const top = platformTop(h), Hs = top - LIFT.thick - TOP_FRAME - BASE_TOP, s = Hs / LIFT.stages;
  const span = LIFT.arm * Math.cos(Math.asin(Math.min(0.95, s / LIFT.arm)));
  const arms = [];
  for (let st = 0; st < LIFT.stages; st++) { const y0 = BASE_TOP + st * s; arms.push([xL, y0, xL + span, y0 + s], [xL, y0 + s, xL + span, y0]); }
  const at = 0.3, attach = [xL + at * span, BASE_TOP + s * (1 - at)], base = [xL + 0.3, BASE_TOP + 0.04];
  return { top, arms, ram: [base, attach], ramLen: Math.hypot(attach[0] - base[0], attach[1] - base[1]), frameY: top - LIFT.thick - TOP_FRAME / 2, span, s };
}

function section() {
  const S = 34, X0 = -23.5, X1 = 1.5, Y0 = -0.6, Y1 = 11, M = 30, LEG = 240;
  const W = (X1 - X0) * S + 2 * M + LEG, H = (Y1 - Y0) * S + 2 * M + 40;
  const X = x => f(M + (x - X0) * S), Y = y => f(M + 40 + (Y1 - y) * S);
  const out = [];
  const line = (x1, y1, x2, y2, c, extra = '') => out.push(`<line x1="${X(x1)}" y1="${Y(y1)}" x2="${X(x2)}" y2="${Y(y2)}" class="${c}" ${extra}/>`);
  const rect = (x0, y0, x1, y1, c) => out.push(`<rect x="${X(Math.min(x0, x1))}" y="${Y(Math.max(y0, y1))}" width="${f(Math.abs(x1 - x0) * S)}" height="${f(Math.abs(y1 - y0) * S)}" class="${c}"/>`);
  const text = (x, y, s, c = 't', a = 'start', dy = 0) => out.push(`<text x="${X(x)}" y="${f(Y(y) + dy)}" class="${c}" text-anchor="${a}">${s}</text>`);
  const level = (y, x, label) => { line(x - 0.25, y, x + 0.25, y, 'dim'); out.push(`<polygon points="${X(x)},${Y(y)} ${X(x) - 5},${Y(y) - 8} ${X(x) + 5},${Y(y) - 8}" fill="#3b6fb6"/>`); text(x + 0.35, y, label, 'dimT', 'start', 4); };
  const dimV = (y0, y1, x, label) => { line(x, y0, x, y1, 'dim'); for (const y of [y0, y1]) line(x - 0.12, y, x + 0.12, y, 'dim'); text(x - 0.2, (y0 + y1) / 2, label, 'dimT', 'end', 4); };

  out.push(`<rect width="${W}" height="${H}" fill="#fff"/>`);
  out.push(`<text x="${M}" y="26" class="h">DISTANCE // ZERO — VIENNA PIANO STAGE · SECTION A–A</text>`);
  out.push(`<text x="${M}" y="44" class="s">Vertical section at z = ${LIFT.z} m through the lift's centre, seen from the cameras' side (${S} px = 1 m) · lift ELEVATED solid, LOWERED dashed · cameras and fixtures off the section line are projected</text>`);

  // floor, studio wall with the opening and lintel, ceilings
  line(X0, 0, X1, 0, 'wall');
  const xw = wallX(LIFT.z), xi = -Math.sqrt(ROOM.R ** 2 - (LIFT.z - ROOM.Z) ** 2);
  rect(xw, PORTAL.h, xi, ROOM.H, 'studioFill'); text((xw + xi) / 2, PORTAL.h + 1.3, 'lintel', 's', 'middle');
  line(xi, ROOM.H, X1, ROOM.H, 'wallThin'); text(-4, ROOM.H - 0.35, 'studio ceiling', 's', 'middle');
  line(ANNEX.x0, 0, ANNEX.x0, ANNEX.h, 'wall'); line(ANNEX.x0, ANNEX.h, -ROOM.R + 2, ANNEX.h, 'wall'); line(-ROOM.R + 2, ANNEX.h, -ROOM.R + 2, ROOM.H, 'wallThin');
  text(-4, 0.35, 'studio floor ±0.00', 's', 'middle');
  text(-4.6, 2.2, '→ main broadcast studio (desk riser at x 0)', 's', 'middle');

  // deck with the well
  rect(DECK.x0, 0, LIFT.x - LIFT.well, DECK.h, 'deck'); rect(LIFT.x + LIFT.well, 0, DECK.x1, DECK.h, 'deck');
  rect(DECK.x1, 0, DECK.x1 + 0.34, (2 * DECK.h) / 3, 'deck'); rect(DECK.x1 + 0.34, 0, DECK.x1 + 0.68, DECK.h / 3, 'deck');

  // the lift: lowered (dashed) and elevated (solid)
  const draw = (h, ghost) => {
    const g = scissor(h), ox = LIFT.x;
    rect(ox - LIFT.arm / 2 - 0.25, 0, ox + LIFT.arm / 2 + 0.25, 0.1, ghost ? 'ghost' : 'plat');
    for (const [x1, y1, x2, y2] of g.arms) line(ox + x1, y1, ox + x2, y2, ghost ? 'ghost' : 'steel');
    if (!ghost) { const [[bx, by], [ax, ay]] = g.ram; line(ox + bx, by, ox + ax, ay, 'ram'); }
    rect(ox - LIFT.arm / 2 - 0.25, g.frameY - 0.03, ox + LIFT.arm / 2 + 0.25, g.frameY + 0.03, ghost ? 'ghost' : 'plat');
    rect(ox - LIFT.r, g.top - LIFT.thick, ox + LIFT.r, g.top, ghost ? 'ghost' : 'plat');
    // the grand seen from its keyboard end: legs, case, lid open towards the studio
    const y = g.top, c = ghost ? 'ghost' : 'piano';
    rect(ox - 0.79, y + 0.62, ox + 0.79, y + 0.96, c);
    for (const lx of [-0.64, 0.64]) rect(ox + lx - 0.05, y, ox + lx + 0.05, y + 0.62, c);
    line(ox - 0.79, y + 0.97, ox - 0.79 + 1.58 * Math.cos(0.58), y + 0.97 + 1.58 * Math.sin(0.58), ghost ? 'ghost' : 'steel');
    return g;
  };
  const low = draw(0, true), high = draw(LIFT.travel, false);
  text(LIFT.x + LIFT.r + 0.2, high.top + 0.6, 'platform ELEVATED', 'k');
  text(LIFT.x + LIFT.r + 0.2, low.top + 0.25, 'LOWERED (flush with deck)', 's');
  text(LIFT.x - 0.35, 1.9, `${LIFT.stages}-stage scissor`, 's', 'end'); text(LIFT.x - 0.35, 1.55, `arms ${LIFT.arm} m, 2 packs`, 's', 'end');
  text(LIFT.x - 0.35, 0.9, `2 hydraulic rams ${f(low.ramLen)}–${f(high.ramLen)} m`, 's', 'end');

  // rig
  for (const s of [-1, 1]) out.push(`<circle cx="${X(LIFT.x + s * RIG.perimeter.r)}" cy="${Y(RIG.perimeter.y)}" r="6" class="fx"/>`);
  text(LIFT.x + RIG.perimeter.r + 0.25, RIG.perimeter.y + 0.15, 'ring truss S1–S8', 's');
  for (const [x, y] of RIG.moving.slice(0, 1).concat(RIG.moving.slice(2, 3))) out.push(`<rect x="${X(x) - 6}" y="${Y(y) - 6}" width="12" height="12" class="mv"/>`);
  text(RIG.moving[2][0], RIG.moving[2][1] + 0.3, 'M3/M4', 's', 'middle'); text(RIG.moving[0][0], RIG.moving[0][1] + 0.3, 'M1/M2', 's', 'middle');
  for (const [x, y] of RIG.accent) out.push(`<polygon points="${X(x)},${Y(y) - 7} ${X(x) + 7},${Y(y) + 6} ${X(x) - 7},${Y(y) + 6}" class="ac"/>`);
  text(RIG.accent[2][0] + 0.3, RIG.accent[2][1], 'A3/A4 back rims', 's'); text(RIG.accent[0][0] + 0.3, RIG.accent[0][1], 'A1/A2 floor backlights', 's');
  out.push(`<circle cx="${X(RIG.spot[0])}" cy="${Y(RIG.spot[1])}" r="8" class="fx" style="fill:#fff2b0"/>`); text(RIG.spot[0] + 0.3, RIG.spot[1] + 0.25, 'FS performance spot', 's');
  for (const [x, y] of [[RIG.spot[0], RIG.spot[1]], [LIFT.x + RIG.perimeter.r, RIG.perimeter.y], [LIFT.x - RIG.perimeter.r, RIG.perimeter.y]]) line(x, y, LIFT.x, high.top + 0.9, 'beam');

  // cameras, lift down (outline) and up (filled), projected onto the section
  for (const [k, c] of Object.entries(CAMS)) {
    const [px, py] = c.pos, up = py + c.rise * LIFT.travel;
    out.push(`<circle cx="${X(px)}" cy="${Y(py)}" r="5" fill="none" stroke="#d23b2f" stroke-width="1.5"/>`);
    if (c.rise) { out.push(`<circle cx="${X(px)}" cy="${Y(up)}" r="5" class="cam"/>`); line(px, py, px, up, 'dim', 'style="stroke:#d23b2f;stroke-dasharray:2 2"'); }
    text(px + 0.18, c.rise ? up : py, k, 'k', 'start', -6);
  }

  // levels and dimensions
  const lv = X1 - 0.6;
  level(DECK.h, lv - 1.4, `+${DECK.h.toFixed(2)} deck`);
  level(PORTAL.h, lv - 1.4, `+${PORTAL.h.toFixed(2)} opening`);
  level(ROOM.H, lv - 1.4, `+${ROOM.H.toFixed(2)} studio ceiling`);
  level(ANNEX.h, ANNEX.x0 + 0.6, `+${ANNEX.h.toFixed(2)} annex ceiling`);
  dimV(low.top, high.top, LIFT.x - LIFT.r - 0.5, `travel ${LIFT.travel} m`);
  dimV(0, high.top, ANNEX.x0 + 0.5, `${f(high.top)} m`);
  dimV(high.top, high.top + 0.96, LIFT.x + LIFT.r + 0.05 + 2.2, 'case 0.96');

  // legend / notes
  const lx = W - LEG + 10; let ly = 90;
  out.push(`<text x="${lx}" y="${ly - 22}" class="k">NOTES</text>`);
  for (const s of [
    `Lift: ${LIFT.stages}-stage floor-mounted scissor in a`, `Ø ${f(2 * LIFT.well)} m well; platform Ø ${f(2 * LIFT.r)} m.`,
    `Travel ${LIFT.travel} m, ${LIFT.vmax} m/s cruise,`, `${LIFT.accel} m/s² accel/brake: ~13 s per move.`,
    'Platform top: +0.45 lowered, +3.95 up.', '', 'Overhead rig carries lights only;', 'the lift stands on the floor.', '',
    'Camera heights shown lowered (o) and', 'riding with the lift (●).', '', 'Design values from layout.js.', 'Not a structural drawing.',
  ]) { out.push(`<text x="${lx}" y="${ly}" class="s">${s}</text>`); ly += 15; }

  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${STYLE}${out.join('\n')}</svg>`, low, high };
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'floor-plan.svg'), plan());
const sec = section();
fs.writeFileSync(path.join(OUT, 'section.svg'), sec.svg);
console.log(`wrote docs/vienna-stage/floor-plan.svg, section.svg · ram ${f(sec.low.ramLen)}–${f(sec.high.ramLen)} m, scissor angle at top ${f((Math.asin(sec.high.s / LIFT.arm) * 180) / Math.PI)}°`);
