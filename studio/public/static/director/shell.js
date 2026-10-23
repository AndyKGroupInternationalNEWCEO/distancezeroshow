// The Virtual Space's controls over the Director (the same model as the Virtual Space, the broadcast functions inside):
//   - three space buttons at the bottom = the three shows (STUDIO = Sunday, PIANO = Saturday, DJ ROOM = Friday); a press
//     switches the show through the studio's own switch (the END … & SWITCH dialog when one still runs), a second press
//     opens ⋯;
//   - ⋯ = this show's side panels as glass tiles (Plan, Playlist, Runbook, Audio, Video, Graphics, Talk, Guest, More);
//   - the edge = the places that are always there: Live, Show, CCTV, Technical, Rehearsal, Host mode;
//   - CCTV: the show's cameras, one after the other, full size (as the Virtual Space's security monitor);
//   - the glass remote (arrows, OK, HOME, BACK, MENU; the keyboard's arrows too) and the first visit's guide.
// It only drives the existing controls (tabs, side tabs, the show picker, the mode switch); nothing of the studio's
// logic lives here.
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const ICON = {"studio": "<svg viewBox=\"0 0 48 48\" aria-hidden=\"true\"><path d=\"M6 33c8-5 28-5 36 0\"/><path d=\"M9 33v6m30-6v6\"/><rect x=\"15\" y=\"9\" width=\"13\" height=\"9\" rx=\"1.5\"/><path d=\"M28 12l6-3v9l-6-3\"/><path d=\"M21.5 18v8m-5 0h10\"/></svg>", "piano": "<svg viewBox=\"0 0 48 48\" aria-hidden=\"true\"><path d=\"M7 30h34v-3c0-6-4-9-10-9-3 0-4-6-11-6-7 0-13 6-13 12z\"/><path d=\"M7 30v4h34v-4\"/><path d=\"M12 34v6m24-6v6\"/><path d=\"M13 30v-3m4 3v-3m4 3v-3m4 3v-3m4 3v-3m4 3v-3\"/></svg>", "dj": "<svg viewBox=\"0 0 48 48\" aria-hidden=\"true\"><circle cx=\"17\" cy=\"27\" r=\"9\"/><circle cx=\"17\" cy=\"27\" r=\"2\"/><path d=\"M30 18h11v18H30z\"/><path d=\"M33 23h5m-5 4h5m-5 4h5\"/><path d=\"M9 16a15 12 0 0 1 30 0\"/><rect x=\"6\" y=\"15\" width=\"5\" height=\"8\" rx=\"2\"/><rect x=\"37\" y=\"15\" width=\"5\" height=\"8\" rx=\"2\"/></svg>", "places": "<svg viewBox=\"0 0 48 48\" aria-hidden=\"true\"><path d=\"M24 42s13-12.5 13-22a13 13 0 0 0-26 0c0 9.5 13 22 13 22z\"/><circle cx=\"24\" cy=\"20\" r=\"4.5\"/></svg>", "cctv": "<svg viewBox=\"0 0 48 48\" aria-hidden=\"true\"><path d=\"M8 14l26 8-3 8-26-8z\"/><path d=\"M34 22l6 2\"/><path d=\"M14 24l-2 10H6\"/></svg>", "backstage": "<svg viewBox=\"0 0 48 48\" aria-hidden=\"true\"><path d=\"M12 40V8h20l4 4v28\"/><path d=\"M8 40h32\"/><circle cx=\"28\" cy=\"25\" r=\"1.5\"/></svg>"};
const svg = p => `<svg viewBox="0 0 48 48" aria-hidden="true">${p}</svg>`;
const TI = {
  live: svg('<rect x="6" y="10" width="16" height="12" rx="1"/><rect x="26" y="10" width="16" height="12" rx="1"/><path d="M6 30h36M6 37h24"/>'),
  show: svg('<circle cx="24" cy="25" r="15"/><path d="M24 16v9l6 4M20 6h8"/>'),
  tech: svg('<circle cx="24" cy="24" r="6"/><path d="M24 6v6M24 36v6M6 24h6M36 24h6M11 11l4 4M33 33l4 4M37 11l-4 4M15 33l-4 4"/>'),
  rehearse: svg('<path d="M36 18a13 13 0 1 0 1 10"/><path d="M37 8v10H27"/>'),
  host: svg('<circle cx="24" cy="16" r="7"/><path d="M10 42c1-9 7-14 14-14s13 5 14 14"/>'),
  plan: svg('<path d="M10 10h28M10 18h28M10 26h28M10 34h18"/>'),
  playlist: svg('<path d="M8 12h22M8 20h22M8 28h14"/><path d="M32 26v12l8-2"/><circle cx="29" cy="38" r="3"/>'),
  runbook: svg('<path d="M12 8h18l6 6v26H12z"/><path d="M17 20h14M17 26h14M17 32h9"/>'),
  audio: svg('<path d="M8 18h8l10-8v28l-10-8H8z"/><path d="M32 18a8 8 0 0 1 0 12M36 13a14 14 0 0 1 0 22"/>'),
  video: svg('<rect x="6" y="12" width="26" height="24" rx="2"/><path d="M32 20l10-6v20l-10-6"/>'),
  gfx: svg('<path d="M24 8l16 8-16 8-16-8z"/><path d="M8 24l16 8 16-8M8 32l16 8 16-8"/>'),
  talk: svg('<path d="M8 10h32v20H22l-8 7v-7H8z"/>'),
  guest: svg('<circle cx="18" cy="17" r="6"/><path d="M6 40c1-8 6-12 12-12s11 4 12 12"/><path d="M34 14v12M28 20h12"/>'),
  more: svg('<circle cx="12" cy="24" r="2.5"/><circle cx="24" cy="24" r="2.5"/><circle cx="36" cy="24" r="2.5"/>'),
  remote: svg('<rect x="15" y="4" width="18" height="40" rx="7"/><circle cx="24" cy="18" r="5"/><path d="M20 30h8M20 36h8"/>'),
};
const SPACE = { sunday: ['studio', 'Studio'], saturday: ['piano', 'Piano'], friday: ['dj', 'DJ Room'] };
const PANELS = [['plan', 'Plan'], ['playlist', 'Playlist'], ['runbook', 'Runbook'], ['audio', 'Audio'], ['video', 'Video'], ['gfx', 'Graphics'], ['talk', 'Talk'], ['guest', 'Guest'], ['more', 'More']];
const PLACES = [['live', 'Live', TI.live], ['show', 'Show', TI.show], ['cctv', 'CCTV', ICON.cctv], ['tech', 'Technical', TI.tech], ['rehearse', 'Rehearsal', TI.rehearse], ['host', 'Host', TI.host]];
const store = { get(k, d) { try { const v = localStorage.getItem('dz-shell-' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem('dz-shell-' + k, JSON.stringify(v)); } catch {} } };
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
document.body.classList.add('dz-shell');

/* ---------- the dock: ⋯ sheet above the three shows ---------- */
const dock = el('div', 'vdock'); dock.id = 'vdock';
const sheet = el('div', 'vsheet'); sheet.setAttribute('role', 'group'); sheet.setAttribute('aria-label', "This show's panels");
for (const [p, label] of PANELS) { const b = el('button', 'b vtile', `${TI[p]}<span>${label}</span><i class="vdot" hidden></i>`); b.type = 'button'; b.dataset.p = p; sheet.append(b); }
const spaces = el('div', 'vspaces'); spaces.setAttribute('role', 'group'); spaces.setAttribute('aria-label', 'Shows');
const more = el('button', 'vsp vmore', '⋯'); more.type = 'button'; more.id = 'vMore'; more.setAttribute('aria-expanded', 'false'); more.setAttribute('aria-label', "This show's panels");
const remoteBtn = el('button', 'vsp vmore', TI.remote); remoteBtn.type = 'button'; remoteBtn.id = 'vRemote'; remoteBtn.setAttribute('aria-pressed', 'false'); remoteBtn.setAttribute('aria-label', 'Remote');
dock.append(sheet, spaces); document.body.append(dock);

function renderSpaces() {
  const pick = $('#showPick'); if (!pick) return;
  const ids = [...pick.options].map(o => o.value).filter(Boolean);
  const order = ['sunday', 'saturday', 'friday'].filter(id => ids.includes(id)).concat(ids.filter(id => !SPACE[id]));
  if (spaces.dataset.ids !== order.join()) {
    spaces.dataset.ids = order.join();
    spaces.replaceChildren(...order.map(id => { const [k, label] = SPACE[id] || ['studio', pick.querySelector(`option[value="${id}"]`)?.textContent.split(' — ')[0] || id];
      const b = el('button', 'vsp ' + k, `${ICON[k]}<span>${label}</span><small></small>`); b.type = 'button'; b.dataset.show = id; b.setAttribute('aria-pressed', 'false'); return b; }), more, remoteBtn);
  }
  const cur = pick.value; document.body.dataset.space = (SPACE[cur] || ['studio'])[0];
  for (const b of spaces.querySelectorAll('[data-show]')) {
    b.setAttribute('aria-pressed', String(b.dataset.show === cur));
    const name = pick.querySelector(`option[value="${b.dataset.show}"]`)?.textContent || '';
    b.querySelector('small').textContent = b.dataset.show === cur ? ($('#rbNow')?.textContent || name) : name.split(' — ')[1] || name;
  }
  // only this show's panels: the playlist where the show has one; the dots of Talk and Guest
  sheet.querySelector('[data-p=playlist]').hidden = !!$('#plTab')?.hidden;
  for (const [p, dot] of [['talk', '#dotTalk'], ['guest', '#dotGuest']]) sheet.querySelector(`[data-p=${p}] .vdot`).hidden = !!$(dot)?.hidden;
  const selP = $('#sideTabs [aria-selected=true]')?.dataset.p, inShow = !$('#ws-show')?.hidden;
  for (const t of sheet.querySelectorAll('.vtile')) t.setAttribute('aria-pressed', String(inShow && t.dataset.p === selP));
  for (const b of edge.querySelectorAll('[data-place]')) b.setAttribute('aria-pressed', String(placeOn(b.dataset.place)));
}
spaces.addEventListener('click', e => {
  const b = e.target.closest('[data-show]'); if (!b) return;
  const pick = $('#showPick');
  if (b.dataset.show === pick.value) return setMore(!dock.classList.contains('open'));
  pick.value = b.dataset.show; pick.dispatchEvent(new Event('change', { bubbles: true }));
});
function setMore(on) { dock.classList.toggle('open', on); more.setAttribute('aria-expanded', String(on)); placeRing(); }
more.addEventListener('click', () => setMore(!dock.classList.contains('open')));
sheet.addEventListener('click', e => {
  const t = e.target.closest('.vtile'); if (!t) return;
  if ($('#ws-show')?.hidden) $('#tab-show')?.click();
  $(`#sideTabs [data-p="${t.dataset.p}"]`)?.click();
  renderSpaces();
});

/* ---------- the edge: the places that are always there ---------- */
const edge = el('nav', 'vedge'); edge.setAttribute('aria-label', 'Places');
const tog = el('button', 'veb vplaces', `${ICON.places}<span>Places</span>`); tog.type = 'button'; tog.setAttribute('aria-expanded', 'false');
edge.append(tog);
for (const [k, label, icon] of PLACES) { const b = el('button', 'veb', `${icon}<span>${label}</span>`); b.type = 'button'; b.dataset.place = k; b.setAttribute('aria-pressed', 'false'); edge.append(b); }
document.body.append(edge);
tog.addEventListener('click', () => { edge.classList.toggle('open'); tog.setAttribute('aria-expanded', String(edge.classList.contains('open'))); placeRing(); });
const placeOn = k => k === 'cctv' ? !cctv.hidden : k === 'host' ? document.body.classList.contains('host-mode') : !document.body.classList.contains('host-mode') && !$('#ws-' + k)?.hidden;
edge.addEventListener('click', e => {
  const b = e.target.closest('[data-place]'); if (!b) return;
  const k = b.dataset.place;
  if (k === 'cctv') return setCctv(cctv.hidden);
  setCctv(false);
  if (k === 'host') return (document.body.classList.contains('host-mode') ? $('#modeDirector') : $('#modeHost'))?.click(), renderSpaces();
  if (document.body.classList.contains('host-mode')) $('#modeDirector')?.click();
  $('#tab-' + k)?.click(); renderSpaces();
});

/* ---------- CCTV: the show's cameras in turn, full size ---------- */
const cctv = el('section', 'vcctv', `<header><b>CCTV</b><span class="vcam"></span><button class="x" type="button" aria-label="Close">×</button></header><div class="vscr"><img alt=""><p class="hint">No camera picture yet: OBS sends the cameras' pictures while this is open.</p></div><div class="vthumbs"></div>`);
cctv.hidden = true; document.body.append(cctv);
let cctvI = 0, cctvT = 0;
const camTiles = () => $$('#showMons figure, #showMons .tile, #showMons > *').filter(f => f.querySelector('img'));
function cctvPaint() {
  const tiles = camTiles(); const thumbs = cctv.querySelector('.vthumbs');
  if (!tiles.length) { cctv.querySelector('img').hidden = true; cctv.querySelector('p').hidden = false; thumbs.replaceChildren(); return; }
  cctvI %= tiles.length;
  const cur = tiles[cctvI], img = cur.querySelector('img'), name = (cur.querySelector('figcaption, .cap, b')?.textContent || 'Camera ' + (cctvI + 1)).trim();
  const big = cctv.querySelector('img'); if (img?.src && big.src !== img.src) big.src = img.src;
  big.hidden = !img?.src; cctv.querySelector('p').hidden = !!img?.src;
  cctv.querySelector('.vcam').textContent = `CAM ${cctvI + 1} · ${name}`;
  thumbs.replaceChildren(...tiles.map((t, i) => { const b = el('button', 'b' + (i === cctvI ? ' on' : ''), (t.querySelector('figcaption, .cap, b')?.textContent || 'CAM ' + (i + 1)).trim()); b.type = 'button'; b.onclick = () => { cctvI = i; cctvT = Date.now(); cctvPaint(); }; return b; }));
}
function setCctv(on) {
  cctv.hidden = !on; const c = window.dzDirector; if (c) { c.cctv = on; c.monitors?.(); }
  renderSpaces(); placeRing();
}
cctv.querySelector('.x').addEventListener('click', () => setCctv(false));
setInterval(() => { if (cctv.hidden) return; if (Date.now() - cctvT > 5000) { cctvI++; cctvT = Date.now(); } cctvPaint(); }, 500);

/* ---------- the remote: the arrows move the ring between the controls in view, OK presses ---------- */
const pad = el('div', 'vpad', `<button class="g sm home" type="button" data-k="home" aria-label="Home">⌂</button><button class="g sm back" type="button" data-k="back" aria-label="Back">↩</button><button class="g sm menu" type="button" data-k="menu" aria-label="Menu">⋯</button><div class="g ring"></div><button class="g ar up" type="button" data-k="up" aria-label="Up">▲</button><button class="g ar dn" type="button" data-k="down" aria-label="Down">▼</button><button class="g ar lf" type="button" data-k="left" aria-label="Left">◀</button><button class="g ar rt" type="button" data-k="right" aria-label="Right">▶</button><button class="g ok" type="button" data-k="ok">OK</button>`);
pad.hidden = true; const ring = el('div', 'vring'); ring.hidden = true; document.body.append(pad, ring);
let remote = false, focusEl = null;
const usable = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && !e.disabled && !e.closest('[hidden]') && !pad.contains(e); };
function candidates() {
  const modal = [...$$('.switchdlg, .help, .help-dlg, .assist, dialog[open]')].find(d => !d.hidden && d.getBoundingClientRect().width);
  const sel = 'button, select, input, textarea, [tabindex="0"]';
  const roots = modal ? [modal] : !cctv.hidden ? [cctv, dock, edge] : [$('main'), dock, edge, $('.bar')];
  return roots.flatMap(r => r ? [...r.querySelectorAll(sel)] : []).filter(usable);
}
function placeRing() {
  if (!remote) { ring.hidden = true; return; }
  const c = candidates(); if (!focusEl || !c.includes(focusEl)) focusEl = c.find(e => /^(goBtn|cutBtn)$/.test(e.id)) || c[0];
  if (!focusEl) { ring.hidden = true; return; }
  const r = focusEl.getBoundingClientRect(); Object.assign(ring.style, { left: r.left - 4 + 'px', top: r.top - 4 + 'px', width: r.width + 8 + 'px', height: r.height + 8 + 'px' }); ring.hidden = false;
}
function move(dir) {
  const c = candidates(); if (!focusEl) return placeRing();
  const a = focusEl.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2; let best = null, bd = Infinity;
  for (const e of c) { if (e === focusEl) continue; const r = e.getBoundingClientRect(), dx = r.left + r.width / 2 - ax, dy = r.top + r.height / 2 - ay;
    if (!(dir === 'left' ? dx < -4 : dir === 'right' ? dx > 4 : dir === 'up' ? dy < -4 : dy > 4)) continue;
    const d = dir === 'left' || dir === 'right' ? Math.abs(dx) + Math.abs(dy) * 2.5 : Math.abs(dy) + Math.abs(dx) * 2.5; if (d < bd) { bd = d; best = e; } }
  if (best) { focusEl = best; best.scrollIntoView({ block: 'nearest' }); placeRing(); }
}
function key(k) {
  if (k === 'ok') { if (!focusEl) return; if (/SELECT|INPUT|TEXTAREA/.test(focusEl.tagName)) focusEl.focus(); else focusEl.click(); setTimeout(placeRing, 80); return; }
  if (k === 'back') { const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }); if (!cctv.hidden) setCctv(false); else if (dock.classList.contains('open')) setMore(false); else if (edge.classList.contains('open')) tog.click(); else document.dispatchEvent(esc); setTimeout(placeRing, 80); return; }
  if (k === 'home') { setCctv(false); setMore(false); if (document.body.classList.contains('host-mode')) $('#modeDirector')?.click(); $('#tab-live')?.click(); focusEl = $('#cutBtn'); renderSpaces(); placeRing(); return; }
  if (k === 'menu') return setMore(!dock.classList.contains('open'));
  move(k);
}
function setRemote(on) { remote = on; pad.hidden = !on; remoteBtn.setAttribute('aria-pressed', String(on)); store.set('remote', on); placeRing(); }
remoteBtn.addEventListener('click', () => setRemote(!remote));
pad.addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) key(b.dataset.k); });
// with the remote up the arrows, Enter and Backspace work it (the studio's own shortcuts keep their letters)
document.addEventListener('keydown', e => {
  if (!remote || e.altKey || e.metaKey || e.ctrlKey || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) return;
  const k = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'ok', Backspace: 'back', Home: 'home' }[e.key];
  if (k) { e.preventDefault(); e.stopPropagation(); key(k); }
}, true);
addEventListener('resize', placeRing); addEventListener('scroll', placeRing, true);

/* ---------- the first visit: the shows, ⋯ and the places glow in turn ---------- */
const guide = el('div', 'vguide', '<p></p><div class="row end"><button class="b sm quiet" type="button" data-g="skip">Skip</button><button class="b sm" type="button" data-g="next">Next</button></div>');
guide.hidden = true; document.body.append(guide);
const GUIDE = [[() => spaces.querySelector('[data-show]'), 'The three shows: STUDIO is Sunday, PIANO is Saturday, DJ ROOM is Friday. A press switches the show (it asks first when one still runs); a second press opens its panels.'],
  [() => more, "⋯ opens this show's panels: plan, playlist, runbook, audio, video, graphics, talk, guest, more."],
  [() => tog, 'The places, always here: Live (monitors, CUT/TAKE, broadcast), Show (clock, GO, script), CCTV, Technical, Rehearsal and Host mode.']];
let gi = -1;
function guideStep(i) {
  for (const g of $$('.vglow')) g.classList.remove('vglow');
  gi = i; if (i >= GUIDE.length) { guide.hidden = true; store.set('guided', true); return; }
  const t = GUIDE[i][0](); if (!t) return guideStep(i + 1);
  t.classList.add('vglow'); guide.querySelector('p').textContent = GUIDE[i][1]; guide.querySelector('[data-g=next]').textContent = i === GUIDE.length - 1 ? 'Done' : 'Next';
  guide.hidden = false; const r = t.getBoundingClientRect();
  guide.style.left = Math.min(innerWidth - 300, Math.max(16, i === 2 ? r.right + 12 : r.left)) + 'px'; guide.style.top = (i === 2 ? r.top : r.top - guide.offsetHeight - 14) + 'px';
}
guide.addEventListener('click', e => { const b = e.target.closest('[data-g]'); if (b) guideStep(b.dataset.g === 'next' ? gi + 1 : GUIDE.length); });

setInterval(renderSpaces, 500);
renderSpaces();
if (store.get('remote', false)) setRemote(true);
if (!store.get('guided', false)) setTimeout(() => guideStep(0), 1200);
