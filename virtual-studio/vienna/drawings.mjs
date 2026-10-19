// Technical drawings of the Vienna Piano Stage, drawn from the same numbers the 3D stage is built from (layout.js),
// with the existing studio around it (values read from set.js and views.js). Writes two SVGs:
//   docs/vienna-stage/floor-plan.svg     plan, seen from above (back of the studio at the top)
//   docs/vienna-stage/section.svg        vertical section along the grand's length through the lift's centre
//   node virtual-studio/vienna/drawings.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOM, PIANO, STAGE, LIFT, CAMS, RIG, platformTop, at } from './layout.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'docs', 'vienna-stage');

// the existing studio, as set.js and views.js build it (for reference only; none of it moves)
const STUDIO = {
  wallR: ROOM.R + 0.6, A0: Math.PI - 1.95, A1: Math.PI + 1.95,
  led: { R: 10, Z: 3, span: 0.56 }, riser: { r: 3.36, z: -1.9 }, dj: [5.4, 0.1, -0.95],
  pylons: [[-6.6, -4.2], [6.6, -4.2]], lounge: { x0: -3.5, x1: 3.5, z0: -11.2, z1: -7.35 },
  security: [-11.15, -3.3, 6.5], truss: { r: 5.5, x: 0, z: -1.4, y: 6.9 },
  walk: [[-3.5, 0.6], [-4.9, -3.2], [-6.3, -6.4], [-4.7, -8.3], [-3.1, -8.3]],
};
const f = n => +n.toFixed(2);
const along = (x, z) => (x - STAGE.x) * Math.sin(PIANO.rotY) + (z - STAGE.z) * Math.cos(PIANO.rotY);   // section coordinate

const STYLE = `<style>
  text{font-family:"Helvetica Neue",Arial,sans-serif;fill:#1d1f23}
  .t{font-size:13px}.s{font-size:10.5px;fill:#4a4f57}.h{font-size:17px;font-weight:700;letter-spacing:.06em}.k{font-size:11px;font-weight:600}
  .studio{fill:none;stroke:#9aa0a8;stroke-width:1.2}.studioFill{fill:#eef0f3;stroke:#9aa0a8;stroke-width:1}
  .wall{fill:none;stroke:#1d1f23;stroke-width:3}.wallThin{fill:none;stroke:#1d1f23;stroke-width:1.5}
  .new{fill:none;stroke:#c97a1e;stroke-width:2}.pit{fill:#3a3530;stroke:#a65f12;stroke-width:1.5}.plat{fill:#e9b779;stroke:#7a4407;stroke-width:1.5}
  .piano{fill:#2b2d31;stroke:#000;stroke-width:1}.ghost{fill:none;stroke:#7a4407;stroke-width:1.2;stroke-dasharray:5 4}
  .walk{fill:none;stroke:#3b6fb6;stroke-width:1;stroke-dasharray:2 4}
  .dim{stroke:#3b6fb6;stroke-width:1;fill:none}.dimT{font-size:11px;fill:#3b6fb6}
  .cam{fill:#d23b2f}.fov{fill:#d23b2f;fill-opacity:.07;stroke:#d23b2f;stroke-width:.8;stroke-dasharray:3 3}
  .fx{fill:#ffd23f;stroke:#7a5b00;stroke-width:1}.mv{fill:#ff9b2f;stroke:#7a3f00;stroke-width:1}.ac{fill:#59a6ff;stroke:#1d4d8a;stroke-width:1}
  .beam{stroke:#e8a400;stroke-width:.8;stroke-dasharray:2 3;fill:none}.steel{stroke:#3c4148;stroke-width:3;fill:none}.ram{stroke:#8a1c1c;stroke-width:5}
</style>`;
const svg = (W, H, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${STYLE}${body.join('\n')}</svg>`;

/* ---------------------------------------------------------------- plan ---------------------------------------------------------------- */
function plan() {
  const S = 30, X0 = -13.6, X1 = 8.6, Z0 = -12.6, Z1 = 9, M = 30, LEG = 270;
  const W = Math.round((X1 - X0) * S + 2 * M + LEG), H = Math.round((Z1 - Z0) * S + 2 * M + 40);
  const X = x => f(M + (x - X0) * S), Y = z => f(M + 40 + (z - Z0) * S);
  const out = [];
  const text = (x, z, s, c = 't', a = 'start', dy = 0) => out.push(`<text x="${X(x)}" y="${f(Y(z) + dy)}" class="${c}" text-anchor="${a}">${s}</text>`);
  const poly = (pts, c, closed = false) => out.push(`<${closed ? 'polygon' : 'polyline'} points="${pts.map(([x, z]) => `${X(x)},${Y(z)}`).join(' ')}" class="${c}"/>`);
  const arc = (R, cx, cz, from, to, c, n = 90) => poly(Array.from({ length: n + 1 }, (_, i) => { const a = from + ((to - from) * i) / n; return [cx + R * Math.sin(a), cz + R * Math.cos(a)]; }), c);
  const circle = (x, z, r, c) => out.push(`<circle cx="${X(x)}" cy="${Y(z)}" r="${f(r * S)}" class="${c}"/>`);
  const rect = (x0, z0, x1, z1, c) => out.push(`<rect x="${X(Math.min(x0, x1))}" y="${Y(Math.min(z0, z1))}" width="${f(Math.abs(x1 - x0) * S)}" height="${f(Math.abs(z1 - z0) * S)}" class="${c}"/>`);
  // a box turned like the grand: w across it, d along its length
  const box = (cx, cz, w, d, rot, c) => {
    const s = Math.sin(rot), co = Math.cos(rot);
    poly([[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([a, b]) => [cx + b * s - a * co, cz + b * co + a * s]), c, true);
  };

  out.push(`<rect width="${W}" height="${H}" fill="#fff"/>`);
  out.push(`<text x="${M}" y="26" class="h">DISTANCE // ZERO — VIENNA PIANO STAGE · FLOOR PLAN</text>`);
  out.push(`<text x="${M}" y="44" class="s">Scale ≈ 1:${Math.round(1000 / (S * 25.4 / 96))} at 96 dpi (${S} px = 1 m) · studio coordinates in metres (x → Melbourne side, z → studio cameras) · grey = existing studio, unchanged · orange = new</text>`);
  for (let x = Math.ceil(X0); x <= X1; x++) out.push(`<line x1="${X(x)}" y1="${Y(Z0)}" x2="${X(x)}" y2="${Y(Z1)}" stroke="${x % 5 ? '#f5f6f7' : '#e6e8eb'}"/>`);
  for (let z = Math.ceil(Z0); z <= Z1; z++) out.push(`<line x1="${X(X0)}" y1="${Y(z)}" x2="${X(X1)}" y2="${Y(z)}" stroke="${z % 5 ? '#f5f6f7' : '#e6e8eb'}"/>`);

  /* existing studio */
  arc(STUDIO.wallR, 0, ROOM.Z, STUDIO.A0, STUDIO.A1, 'wall');
  arc(STUDIO.led.R, 0, STUDIO.led.Z, Math.PI - STUDIO.led.span, Math.PI + STUDIO.led.span, 'studio');
  text(0, STUDIO.led.Z - STUDIO.led.R + 0.45, 'LED wall', 's', 'middle');
  circle(0, STUDIO.riser.z, STUDIO.riser.r, 'studioFill'); text(0, STUDIO.riser.z + 0.15, 'desk riser · host · co-host · guest', 's', 'middle');
  rect(STUDIO.lounge.x0, STUDIO.lounge.z0, STUDIO.lounge.x1, STUDIO.lounge.z1, 'studioFill'); text(0, (STUDIO.lounge.z0 + STUDIO.lounge.z1) / 2, 'backstage lounge', 's', 'middle', 4);
  box(STUDIO.dj[0], STUDIO.dj[1], 2.4, 1.1, STUDIO.dj[2] + Math.PI / 2, 'studioFill'); text(STUDIO.dj[0], STUDIO.dj[1], 'DJ booth', 's', 'middle', 4);
  for (const [x, z] of STUDIO.pylons) rect(x - 0.37, z - 0.2, x + 0.37, z + 0.2, 'studioFill');
  text(-6.6, -4.75, 'VIENNA pylon', 's', 'middle'); text(6.6, -4.75, 'MELBOURNE pylon', 's', 'middle');
  arc(STUDIO.truss.r, STUDIO.truss.x, STUDIO.truss.z, 0, Math.PI * 2, 'studio'); text(3.2, STUDIO.truss.z - STUDIO.truss.r + 0.4, 'studio lighting truss (6.9 m)', 's', 'middle');
  poly(STUDIO.walk, 'walk'); text(-4.5, -5.2, 'walk to backstage', 's');
  out.push(`<rect x="${X(STUDIO.security[0]) - 4}" y="${Y(STUDIO.security[1]) - 4}" width="8" height="8" fill="#555"/>`);
  text(STUDIO.security[0] + 0.3, STUDIO.security[1] - 0.35, 'SEC 1', 's');
  text(3.4, 7.6, 'studio cameras and the open front of the set ↓', 's', 'middle');
  text(-1, 8.5, 'existing studio: Ø 26.4 m, 8.4 m high — unchanged except the piano area', 's', 'middle');

  /* the stage, at the grand's own place */
  circle(STAGE.x, STAGE.z, LIFT.pit + 0.095, 'new');
  circle(STAGE.x, STAGE.z, LIFT.pit, 'pit');
  circle(STAGE.x, STAGE.z, LIFT.r, 'plat');
  box(STAGE.x, STAGE.z, 2.1, LIFT.arm + 0.5, PIANO.rotY, 'ghost');     // lift frame below the platform
  const caseC = at(0.96 + 0.17 - PIANO.len / 2, 0), bench = at(0.96 + 0.62, 0);
  box(caseC[0], caseC[1], PIANO.width, PIANO.len, PIANO.rotY, 'piano');
  box(bench[0], bench[1], 0.8, 0.38, PIANO.rotY, 'piano');
  out.push(`<text x="${X(caseC[0])}" y="${Y(caseC[1]) + 4}" class="k" text-anchor="middle" style="fill:#fff">GRAND</text>`);
  text(STAGE.x - 2.6, STAGE.z + 3.35, `platform Ø ${f(2 * LIFT.r)} m in a Ø ${f(2 * LIFT.pit)} m pit, flush with the floor when lowered`, 'k');
  text(STAGE.x - 2.6, STAGE.z + 3.7, 'keyboard and pianist face the studio; the open lid faces the cameras', 's');

  /* rig */
  circle(STAGE.x, STAGE.z, RIG.perimeter.r, 'new');
  for (let i = 0; i < RIG.perimeter.n; i++) {
    const a = ((i + 0.5) / RIG.perimeter.n) * Math.PI * 2, x = STAGE.x + Math.cos(a) * RIG.perimeter.r, z = STAGE.z + Math.sin(a) * RIG.perimeter.r;
    out.push(`<circle cx="${X(x)}" cy="${Y(z)}" r="6" class="fx"/>`); text(x, z, `S${i + 1}`, 's', 'middle', -9);
  }
  RIG.moving.forEach(([x, , z], i) => { out.push(`<rect x="${X(x) - 6}" y="${Y(z) - 6}" width="12" height="12" class="mv"/>`); text(x, z, `M${i + 1}`, 's', 'middle', 18); });
  RIG.accent.forEach(([x, , z], i) => { out.push(`<polygon points="${X(x)},${Y(z) - 7} ${X(x) + 7},${Y(z) + 6} ${X(x) - 7},${Y(z) + 6}" class="ac"/>`); text(x + 0.3, z, `A${i + 1}`, 's', 'start', 4); });
  out.push(`<circle cx="${X(RIG.spot[0])}" cy="${Y(RIG.spot[2])}" r="8" class="fx" style="fill:#fff2b0"/>`); text(RIG.spot[0], RIG.spot[2], 'FS', 'k', 'middle', 4);

  /* cameras (lift lowered) */
  for (const [k, c] of Object.entries(CAMS)) {
    const [px, , pz] = c.pos, [tx, , tz] = c.target;
    const dir = Math.atan2(tz - pz, tx - px), hf = Math.atan(Math.tan((c.fov * Math.PI) / 360) * (16 / 9)), L = 2.6;
    poly([[px, pz], [px + Math.cos(dir - hf) * L, pz + Math.sin(dir - hf) * L], [px + Math.cos(dir + hf) * L, pz + Math.sin(dir + hf) * L]], 'fov', true);
    out.push(`<circle cx="${X(px)}" cy="${Y(pz)}" r="5.5" class="cam"/>`);
    text(px, pz, k, 'k', 'middle', -10);
  }

  /* legend */
  const lx = W - LEG + 10; let ly = 90;
  const leg = (mark, label) => { out.push(mark(lx, ly)); out.push(`<text x="${lx + 26}" y="${ly + 4}" class="s">${label}</text>`); ly += 22; };
  out.push(`<text x="${lx}" y="${ly - 22}" class="k">LEGEND</text>`);
  leg((x, y) => `<line x1="${x}" y1="${y}" x2="${x + 18}" y2="${y}" class="wall"/>`, 'studio wall (unchanged)');
  leg((x, y) => `<circle cx="${x + 9}" cy="${y}" r="7" class="pit"/>`, `lift pit, ${LIFT.depth} m deep`);
  leg((x, y) => `<circle cx="${x + 9}" cy="${y}" r="7" class="plat"/>`, 'lift platform');
  leg((x, y) => `<line x1="${x}" y1="${y}" x2="${x + 18}" y2="${y}" class="ghost"/>`, 'scissor frame, below the platform');
  leg((x, y) => `<rect x="${x + 2}" y="${y - 6}" width="14" height="12" class="piano"/>`, 'the studio grand (stays in place)');
  leg((x, y) => `<circle cx="${x + 9}" cy="${y}" r="6" class="fx"/>`, `S1–S8 perimeter spots, ring ${RIG.perimeter.y} m`);
  leg((x, y) => `<rect x="${x + 3}" y="${y - 6}" width="12" height="12" class="mv"/>`, `M1–M4 moving heads, ${RIG.moving[0][1]} m`);
  leg((x, y) => `<polygon points="${x + 9},${y - 7} ${x + 16},${y + 6} ${x + 2},${y + 6}" class="ac"/>`, 'A1–A2 floor backlights, A3–A4 rims');
  leg((x, y) => `<circle cx="${x + 9}" cy="${y}" r="7" class="fx" style="fill:#fff2b0"/>`, `FS performance spot, ${RIG.spot[1]} m`);
  leg((x, y) => `<circle cx="${x + 9}" cy="${y}" r="5.5" class="cam"/>`, 'virtual cameras (lift lowered)');
  ly += 6;
  for (const [k, c] of Object.entries(CAMS)) { out.push(`<text x="${lx}" y="${ly}" class="s">${k} ${c.label} · ${c.fov}° · ${c.rise ? `rides ${Math.round(c.rise * 100)} % of the lift` : 'on the floor'}</text>`); ly += 16; }
  ly += 10;
  for (const s of ['Dimensions are design values from layout.js,', 'checked against the studio model (set.js).', 'Not a structural drawing.']) { out.push(`<text x="${lx}" y="${ly}" class="s">${s}</text>`); ly += 15; }
  return svg(W, H, out);
}

/* -------------------------------------------------------------- section --------------------------------------------------------------- */
// the scissor as stage.js poses it (in the lift's own frame: x along the grand, tail end negative)
function scissor(h) {
  const FLOOR = -LIFT.depth, BASE_TOP = FLOOR + 0.1, TOP_FRAME = 0.03, xL = -LIFT.arm / 2;
  const top = platformTop(h), s = (top - LIFT.thick - TOP_FRAME - BASE_TOP) / LIFT.stages;
  const span = LIFT.arm * Math.cos(Math.asin(Math.min(0.95, s / LIFT.arm)));
  const arms = [];
  for (let st = 0; st < LIFT.stages; st++) { const y0 = BASE_TOP + st * s; arms.push([xL, y0, xL + span, y0 + s], [xL, y0 + s, xL + span, y0]); }
  const attach = [xL + 0.3 * span, BASE_TOP + s * 0.7], base = [xL + 0.3, BASE_TOP + 0.04];
  return { top, arms, s, ram: [base, attach], ramLen: Math.hypot(attach[0] - base[0], attach[1] - base[1]), frameY: top - LIFT.thick - TOP_FRAME / 2, floor: FLOOR };
}

function section() {
  const S = 52, U0 = -6.8, U1 = 7.4, Y0 = -1, Y1 = 8.9, M = 30, LEG = 250;
  const W = Math.round((U1 - U0) * S + 2 * M + LEG), H = Math.round((Y1 - Y0) * S + 2 * M + 40);
  const X = u => f(M + (u - U0) * S), Y = y => f(M + 40 + (Y1 - y) * S);
  const out = [];
  const line = (u1, y1, u2, y2, c, extra = '') => out.push(`<line x1="${X(u1)}" y1="${Y(y1)}" x2="${X(u2)}" y2="${Y(y2)}" class="${c}" ${extra}/>`);
  const rect = (u0, y0, u1, y1, c) => out.push(`<rect x="${X(Math.min(u0, u1))}" y="${Y(Math.max(y0, y1))}" width="${f(Math.abs(u1 - u0) * S)}" height="${f(Math.abs(y1 - y0) * S)}" class="${c}"/>`);
  const text = (u, y, s, c = 't', a = 'start', dy = 0) => out.push(`<text x="${X(u)}" y="${f(Y(y) + dy)}" class="${c}" text-anchor="${a}">${s}</text>`);
  const level = (y, u, label) => { line(u - 0.2, y, u + 0.2, y, 'dim'); out.push(`<polygon points="${X(u)},${Y(y)} ${X(u) - 5},${Y(y) - 8} ${X(u) + 5},${Y(y) - 8}" fill="#3b6fb6"/>`); text(u + 0.3, y, label, 'dimT', 'start', 4); };
  const dimV = (y0, y1, u, label) => { line(u, y0, u, y1, 'dim'); for (const y of [y0, y1]) line(u - 0.1, y, u + 0.1, y, 'dim'); text(u - 0.15, (y0 + y1) / 2, label, 'dimT', 'end', 4); };

  out.push(`<rect width="${W}" height="${H}" fill="#fff"/>`);
  out.push(`<text x="${M}" y="26" class="h">DISTANCE // ZERO — VIENNA PIANO STAGE · SECTION A–A</text>`);
  out.push(`<text x="${M}" y="44" class="s">Vertical section along the grand's length through the lift's centre, seen from the studio cameras' side (${S} px = 1 m) · ELEVATED solid, LOWERED dashed · fixtures and cameras off the line projected</text>`);

  // floor with the pit, the studio ceiling
  line(U0, 0, -LIFT.pit, 0, 'wall'); line(LIFT.pit, 0, U1, 0, 'wall');
  out.push(`<polyline points="${X(-LIFT.pit)},${Y(0)} ${X(-LIFT.pit)},${Y(-LIFT.depth)} ${X(LIFT.pit)},${Y(-LIFT.depth)} ${X(LIFT.pit)},${Y(0)}" class="wallThin"/>`);
  line(U0, ROOM.H, U1, ROOM.H, 'wallThin'); text(U1 - 0.2, ROOM.H - 0.3, 'studio ceiling', 's', 'end');
  text(U1 - 0.2, 0.2, 'studio floor ±0.00', 's', 'end');

  // the lift, lowered (dashed) and elevated (solid)
  const draw = (h, ghost) => {
    const g = scissor(h), c = ghost ? 'ghost' : 'steel';
    rect(-LIFT.arm / 2 - 0.25, g.floor, LIFT.arm / 2 + 0.25, g.floor + 0.1, ghost ? 'ghost' : 'plat');
    for (const [x1, y1, x2, y2] of g.arms) line(x1, y1, x2, y2, c);
    if (!ghost) { const [[bx, by], [ax, ay]] = g.ram; line(bx, by, ax, ay, 'ram'); }
    rect(-LIFT.arm / 2 - 0.25, g.frameY - 0.015, LIFT.arm / 2 + 0.25, g.frameY + 0.015, ghost ? 'ghost' : 'plat');
    rect(-LIFT.r, g.top - LIFT.thick, LIFT.r, g.top, ghost ? 'ghost' : 'plat');
    // the grand from its long side (case from the tail to the keyboard, legs, lid propped open) and the bench
    const y = g.top, pc = ghost ? 'ghost' : 'piano', k = 0.96 + 0.17, tail = k - PIANO.len;
    rect(tail, y + 0.62, k - 0.17, y + 0.96, pc); rect(k - 0.17, y + 0.62, k, y + 0.74, pc);
    for (const u of [k - 0.4, tail + 0.32]) rect(u - 0.05, y, u + 0.05, y + 0.62, pc);
    out.push(`<polyline points="${X(k - 0.45)},${Y(y + 0.98)} ${X(tail + 0.15)},${Y(y + 1.85)} ${X(tail)},${Y(y + 1.62)}" class="${c}" style="stroke-width:${ghost ? 1.2 : 2}"/>`);
    rect(0.96 + 0.62 - 0.19, y + 0.44, 0.96 + 0.62 + 0.19, y + 0.51, pc); for (const u of [-0.15, 0.15]) rect(0.96 + 0.62 + u - 0.02, y, 0.96 + 0.62 + u + 0.02, y + 0.44, pc);
    return g;
  };
  const low = draw(0, true), high = draw(LIFT.travel, false);
  text(-LIFT.r - 0.2, high.top - 0.05, 'platform ELEVATED', 'k', 'end');
  text(-LIFT.r - 0.2, 0.45, 'LOWERED: flush with the floor,', 's', 'end'); text(-LIFT.r - 0.2, 0.2, 'the grand exactly where it stands today', 's', 'end');
  text(LIFT.arm / 2 + 0.4, 1.7, `${LIFT.stages}-stage scissor, arms ${LIFT.arm} m, two packs`, 's');
  text(LIFT.arm / 2 + 0.4, 1.4, `2 hydraulic rams ${f(low.ramLen)}–${f(high.ramLen)} m (red)`, 's');
  text(LIFT.arm / 2 + 0.4, 1.1, `scissor angle ${f((Math.asin(low.s / LIFT.arm) * 180) / Math.PI)}°–${f((Math.asin(high.s / LIFT.arm) * 180) / Math.PI)}°`, 's');
  text(-1.2, high.top + 2.0, 'tail', 's', 'middle'); text(1.58, high.top + 0.65, 'bench', 's', 'middle');

  // rig: the ring truss (two cut points), moving heads, spot and accents projected onto the section line
  for (const s of [-1, 1]) out.push(`<circle cx="${X(s * RIG.perimeter.r)}" cy="${Y(RIG.perimeter.y)}" r="6" class="fx"/>`);
  text(RIG.perimeter.r + 0.2, RIG.perimeter.y + 0.1, 'ring truss S1–S8', 's');
  for (const [x, y, z] of RIG.moving) out.push(`<rect x="${X(along(x, z)) - 6}" y="${Y(y) - 6}" width="12" height="12" class="mv"/>`);
  text(0, RIG.moving[0][1] - 0.45, 'M1–M4', 's', 'middle');
  RIG.accent.forEach(([x, y, z]) => out.push(`<polygon points="${X(along(x, z))},${Y(y) - 7} ${X(along(x, z)) + 7},${Y(y) + 6} ${X(along(x, z)) - 7},${Y(y) + 6}" class="ac"/>`));
  text(along(RIG.accent[3][0], RIG.accent[3][2]) + 0.25, RIG.accent[3][1], 'A3/A4 back rims', 's');
  const fsU = along(RIG.spot[0], RIG.spot[2]);
  out.push(`<circle cx="${X(fsU)}" cy="${Y(RIG.spot[1])}" r="8" class="fx" style="fill:#fff2b0"/>`); text(fsU + 0.25, RIG.spot[1] - 0.1, 'FS', 'k');
  for (const [u, y] of [[fsU, RIG.spot[1]], [RIG.perimeter.r, RIG.perimeter.y], [-RIG.perimeter.r, RIG.perimeter.y]]) line(u, y, 0, high.top + 0.9, 'beam');
  line(U0, 6.9, U1, 6.9, 'studio', 'style="stroke-dasharray:8 6"'); text(U0 + 0.1, 6.98, 'studio truss 6.9 m (beside the stage, not over it)', 's');

  // cameras: lowered (o) and riding with the lift (●)
  for (const [k, c] of Object.entries(CAMS)) {
    const u = along(c.pos[0], c.pos[2]), y0 = c.pos[1], y1 = y0 + c.rise * LIFT.travel;
    if (u < U0 || u > U1) { text(u < U0 ? U0 + 0.1 : U1 - 0.1, y1, `${k} (projected ${f(u)} m) ${c.rise ? '↑' : ''}`, 'k', u < U0 ? 'start' : 'end'); continue; }
    out.push(`<circle cx="${X(u)}" cy="${Y(y0)}" r="5" fill="none" stroke="#d23b2f" stroke-width="1.5"/>`);
    if (c.rise) { out.push(`<circle cx="${X(u)}" cy="${Y(y1)}" r="5" class="cam"/>`); line(u, y0, u, y1, 'dim', 'style="stroke:#d23b2f;stroke-dasharray:2 2"'); }
    text(u + 0.15, y1, k, 'k', 'start', -7);
  }

  // levels and dimensions
  level(-LIFT.depth, LIFT.pit + 0.3, `−${LIFT.depth.toFixed(2)} pit floor`);
  level(ROOM.H, U0 + 0.4, `+${ROOM.H.toFixed(2)}`);
  dimV(low.top, high.top, -LIFT.r - 0.3, `travel ${LIFT.travel} m`);

  const lx = W - LEG + 10; let ly = 90;
  out.push(`<text x="${lx}" y="${ly - 22}" class="k">NOTES</text>`);
  for (const s of [
    'One stage: the studio’s own grand, at', 'its own place, on a round lift platform', `Ø ${f(2 * LIFT.r)} m let into the floor (pit Ø ${f(2 * LIFT.pit)} m).`, '',
    `Travel ${LIFT.travel} m · ${LIFT.vmax} m/s cruise ·`, `${LIFT.accel} m/s² accel and brake: ~13 s a move.`, `Platform top ±0.00 lowered, +${LIFT.travel.toFixed(2)} up;`, `lid top then at about +${f(LIFT.travel + 1.85)}.`, '',
    'The lift stands on the pit floor; the', 'rig over it carries lights only.', '',
    'Camera heights shown lowered (o) and', 'riding with the lift (●).', '', 'Design values from layout.js.', 'Not a structural drawing.',
  ]) { out.push(`<text x="${lx}" y="${ly}" class="s">${s}</text>`); ly += 15; }
  return { svg: svg(W, H, out), low, high };
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'floor-plan.svg'), plan());
const sec = section();
fs.writeFileSync(path.join(OUT, 'section.svg'), sec.svg);
console.log(`wrote docs/vienna-stage/floor-plan.svg, section.svg · stage centre (${STAGE.x}, ${STAGE.z}) · rams ${f(sec.low.ramLen)}–${f(sec.high.ramLen)} m`);
