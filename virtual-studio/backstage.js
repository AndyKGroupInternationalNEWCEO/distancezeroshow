// BACKSTAGE: three lit show posters and framed photographs in the backstage lounge.
// The posters' slots are set here (POSTER_SLOTS), not tied to three names. Their content comes from the main website's
// published programme (distancezeroshow.com/distance-zero.ics, read-only, the one source: no second programme here).
// What the site publishes is shown; what it does not publish is not invented: a slot without a published show shows
// the approved general poster. The last valid programme is kept (this browser) for when the site cannot be reached.
// The photographs are the project's own approved pictures (assets/): no generated faces.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const ICS = 'https://distancezeroshow.com/distance-zero.ics';
// each slot: what it shows. `match` picks the published shows it may show (by their title); `next`: the next show of any kind
export const POSTER_SLOTS = [
  { label: 'CURRENT / NEXT SHOW', next: true },
  { label: 'DJ SHOW', match: /\bDJ\b/i, host: "DJ Andy'K", photo: 'andrej.webp' },
  { label: 'PIANO SESSIONS', match: /piano/i, photo: 'andrej-kneisl.webp' },
];
const PHOTOS = [['andrej.webp', "DJ Andy'K"], ['georgie.webp', 'Georgie Walker'], ['keyvisual.jpg', 'DISTANCE // ZERO']];
const asset = f => new URL('../assets/' + f, import.meta.url).href;

/* ----- the programme: the site's calendar, parsed (VEVENT: SUMMARY, DESCRIPTION, DTSTART;TZID=Europe/Vienna, RRULE
   WEEKLY / MONTHLY with BYDAY such as FR or 3SU, ATTACH an official poster) ----- */
function zoned(y, mo, d, h, mi, tz = 'Europe/Vienna') {
  const guess = Date.UTC(y, mo, d, h, mi);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(guess).map(x => [x.type, +x.value]));
  return guess - (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - guess);
}
const DAYS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
function parseIcs(text) {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/), out = []; let ev = null;
  for (const l of lines) {
    if (l === 'BEGIN:VEVENT') ev = {}; else if (l === 'END:VEVENT') { if (ev?.start) out.push(ev); ev = null; }
    else if (ev) { const i = l.indexOf(':'); if (i < 0) continue; const k = l.slice(0, i), v = l.slice(i + 1).replace(/\\,/g, ',').replace(/\\n/g, ' ');
      if (k.startsWith('DTSTART')) { const m = v.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/); if (m) ev.start = [+m[1], +m[2] - 1, +m[3], +m[4], +m[5]]; }
      else if (k === 'SUMMARY') ev.title = v; else if (k === 'DESCRIPTION') ev.text = v; else if (k === 'RRULE') ev.rule = Object.fromEntries(v.split(';').map(p => p.split('=')));
      else if (k.startsWith('ATTACH') && /\.(jpe?g|png|webp)(\?|$)/i.test(v)) ev.poster = v;
      else if (k === 'STATUS') ev.status = v; }
  }
  return out.filter(e => !e.status || e.status === 'CONFIRMED');   // not confirmed: not shown as confirmed
}
// the event's next start (ms) not yet past
function nextStart(e, now = Date.now()) {
  const [y, mo, d, h, mi] = e.start, first = zoned(y, mo, d, h, mi);
  if (!e.rule) return first > now - 2 * 3600e3 ? first : null;
  const by = e.rule.BYDAY || '', nth = parseInt(by, 10) || 0, wd = DAYS[by.replace(/[-\d]/g, '')] ?? new Date(first).getUTCDay();
  const from = new Date(Math.max(now, first));
  for (let k = 0; k < 400; k++) {
    const t = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + k));
    if (t.getUTCDay() !== wd) continue;
    if (e.rule.FREQ === 'MONTHLY' && nth && Math.ceil(t.getUTCDate() / 7) !== nth) continue;
    const s = zoned(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), h, mi);
    if (s >= first && s > now - 2 * 3600e3) return s;
  }
  return null;
}
async function programme() {
  const key = 'dz-backstage-programme';
  try { const r = await fetch(ICS, { cache: 'no-cache' }); if (!r.ok) throw 0; const ev = parseIcs(await r.text()); if (!ev.length) throw 0;
    try { localStorage.setItem(key, JSON.stringify(ev)); } catch {} return ev; }
  catch { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } }
}

/* ----- a poster, drawn on a canvas (a backlit lightbox in a frame): a picture, the slot, the show, its date ----- */
const img = src => new Promise(ok => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
const fmt = (t, tz) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(t);
async function drawPoster(c, slot, show) {
  const x = c.getContext('2d'), W = c.width, H = c.height;
  x.fillStyle = '#07080a'; x.fillRect(0, 0, W, H);
  const pic = await img(show?.poster || asset(slot.photo || 'keyvisual.jpg'));
  if (pic) { const k = Math.max(W / pic.width, (H * 0.68) / pic.height), w = pic.width * k, h = pic.height * k; x.drawImage(pic, (W - w) / 2, 0, w, h); }
  if (show?.poster) return;   // an official poster: shown as it is
  const g = x.createLinearGradient(0, H * 0.4, 0, H); g.addColorStop(0, 'rgba(7,8,10,0)'); g.addColorStop(0.45, 'rgba(7,8,10,0.96)'); g.addColorStop(1, '#07080a'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = '#f2a650'; x.fillRect(56, H * 0.62, 90, 6);
  x.textAlign = 'left'; x.fillStyle = 'rgba(242,166,80,0.95)'; x.font = '700 30px Archivo, Arial, sans-serif'; x.fillText(slot.label, 56, H * 0.62 + 52);
  const title = show ? show.title.replace(/^DISTANCE \/\/ ZERO\s*[—-]\s*/i, '') : slot.next ? 'DISTANCE // ZERO' : slot.label;
  x.fillStyle = '#ffffff'; x.font = '800 62px Archivo, Arial, sans-serif';
  const words = title.toUpperCase().split(' '); let line = '', y = H * 0.62 + 130;
  for (const w of words) { if (x.measureText(line + w).width > W - 112 && line) { x.fillText(line.trim(), 56, y); y += 70; line = ''; } line += w + ' '; } x.fillText(line.trim(), 56, y);
  x.font = '600 28px Archivo, Arial, sans-serif'; x.fillStyle = 'rgba(243,245,248,0.85)'; y += 56;
  if (show?.at) { x.fillText('Vienna  ' + fmt(show.at, 'Europe/Vienna'), 56, y); x.fillText('Melbourne  ' + fmt(show.at, 'Australia/Melbourne'), 56, y + 40); y += 80; }
  else if (slot.host) { x.fillText(slot.host, 56, y); y += 40; }
  x.font = '600 24px Archivo, Arial, sans-serif'; x.fillStyle = 'rgba(243,245,248,0.6)'; x.fillText(show ? 'Live at distancezeroshow.com' : 'Programme at distancezeroshow.com', 56, H - 60);
}

export function buildBackstage({ M, parent, lounge }) {
  const g = new THREE.Group(); g.name = 'backstage-posters'; parent.add(g);
  const { x0, x1, z0 } = lounge;
  const frameMat = new THREE.MeshPhysicalMaterial({ color: 0x0d0d0f, metalness: 0.6, roughness: 0.3, clearcoat: 0.5 });
  const brass = M.champagne || frameMat;
  const frame = (w, h, depth = 0.05) => { const f = new THREE.Group(); f.add(new THREE.Mesh(new RoundedBoxGeometry(w + 0.08, h + 0.08, depth, 3, 0.01), frameMat)); return f; };
  // the posters: on the Vienna-side wall, beside the visitors' door, at eye height, each a backlit lightbox
  const posters = POSTER_SLOTS.map((slot, i) => {
    const c = document.createElement('canvas'); c.width = 768; c.height = 1088;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const f = frame(0.6, 0.85); f.position.set(x0 + 0.04, 1.6, z0 + 0.5 + i * 0.75); f.rotation.y = Math.PI / 2; g.add(f);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.85), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(0.92, 0.92, 0.92) })); face.position.z = 0.027; f.add(face);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.025, 0.06), brass); lamp.position.set(0, 0.5, 0.08); f.add(lamp);   // a brass picture light over it
    return { slot, c, tex };
  });
  // the photographs: framed on the Melbourne-side wall, the project's own pictures
  PHOTOS.forEach(([file, name], i) => {
    const f = frame(0.55, 0.7); f.position.set(x1 - 0.04, 1.6, z0 + 0.45 + i * 0.72); f.rotation.y = -Math.PI / 2; g.add(f);
    new THREE.TextureLoader().load(asset(file), t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
      const k = t.image.width / t.image.height, w = k > 0.55 / 0.62 ? 0.55 : 0.62 * k, h = k > 0.55 / 0.62 ? 0.55 / k : 0.62;
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 })); p.position.set(0, 0.03, 0.027); f.add(p); });
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.7), new THREE.MeshStandardMaterial({ color: 0xf1ede6, roughness: 0.9 })); mat.position.z = 0.026; f.add(mat);   // the passe-partout
    const cap = document.createElement('canvas'); cap.width = 512; cap.height = 48; const cx = cap.getContext('2d'); cx.fillStyle = '#3a342c'; cx.font = '600 26px Archivo, Arial, sans-serif'; cx.textAlign = 'center'; cx.fillText(name, 256, 32);
    const ct = new THREE.CanvasTexture(cap); ct.colorSpace = THREE.SRGBColorSpace; const capM = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.0375), new THREE.MeshBasicMaterial({ map: ct, transparent: true })); capM.position.set(0, -0.31, 0.0275); f.add(capM);
  });

  // the programme, now and every 30 minutes
  async function sync() {
    const ev = await programme(), now = Date.now();
    const shows = ev.map(e => ({ ...e, at: nextStart(e, now) })).filter(e => e.at).sort((a, b) => a.at - b.at);
    for (const p of posters) {
      const show = p.slot.next ? shows[0] : shows.find(s => p.slot.match?.test(s.title));
      await drawPoster(p.c, p.slot, show || null); p.tex.needsUpdate = true;
    }
  }
  sync(); setInterval(sync, 30 * 60e3);
  return { group: g, sync };
}
