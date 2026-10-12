// Director Studio shell: one connection to the studio server, three workspaces (Live, Show, Technical),
// keyboard, and pop-out windows so each workspace can live on its own screen later.
// Every control sends a request to the local studio server, which checks the director role and talks to OBS.
import { $, $$, connect, checkSignedIn, runClocks, chatPanel, titleBadge, act, toast } from '../common.js';
import * as live from './live.js';
import * as show from './show.js';
import * as tech from './tech.js';
import * as talk from './talk.js';
import * as rehearse from './rehearse.js';
import { notifier } from '../notify.js';
import { initLayout } from './layout.js';
import * as hostmode from './hostmode.js';

const WS = ['live', 'show', 'tech', 'rehearse'];
const memo = {};
const ctx = {
  S: null, link: { state: 'connecting' }, ws: 'live', unread: 0,
  differs(key, v) { const j = JSON.stringify(v); if (memo[key] === j) return false; memo[key] = j; return true; },
  focusedIn: el => !!el && el.contains(document.activeElement),
};
let everOpen = false;

ctx.conn = connect({ onStatus: st => {
  ctx.link = st;
  if (st.state === 'open') { everOpen = true; monitors(); }
  else if (!everOpen && st.state === 'closed') checkSignedIn();
  header();
} });
ctx.obs = (action, data = {}) => ctx.conn.send({ t: 'obs', action, ...data });

let firstState = true;
ctx.conn.on('state', ({ s }) => {
  ctx.S = s; render();
  // opening the studio while a rehearsal runs lands in the Rehearsal workspace (unless a workspace was asked for)
  if (firstState) { firstState = false; if (s.rehearsal?.active && !location.hash) setWs('rehearse'); }
});
ctx.note = notifier();
ctx.conn.on('notify', m => {
  const actions = [];
  if (m.kind === 'call-drop') actions.push({ label: 'Call again', fn: () => ctx.callStart() });
  if (m.kind === 'host-down' || m.kind === 'tunnel-down') actions.push({ label: 'What to do', fn: () => setWs('rehearse') });
  if (m.kind === 'tunnel-up' && /NEW/.test(m.text)) actions.push({ label: 'Copy her link', fn: () => { setWs('rehearse'); document.querySelector('#rhCopy')?.click(); } });
  if (m.kind === 'help') actions.push({ label: 'Show', fn: () => setWs('show') });
  ctx.note.show({ ...m, actions });
});
ctx.conn.on('meters', ({ m }) => { live.meters(m); tech.meters(m); });
ctx.conn.on('frame', f => { live.frame(f); show.frame(f); hostmode.frame(f); });
ctx.conn.on('log.history', ({ entries }) => tech.logHistory(entries));
ctx.conn.on('log', ({ entry }) => tech.logEntry(entry));
chatPanel(ctx.conn, 'director', { onUnread: n => {
  if (n > ctx.unread) ctx.note.chime?.();                      // a new message from Georgie: one soft tone
  ctx.unread = n;
  titleBadge('Director Studio — DISTANCE // ZERO')(n);
  const u = $('#unread'); u.hidden = !n; u.textContent = n + ' new';
  $('#dotShow').hidden = !n || ctx.ws === 'show';
} });
runClocks(() => ctx.S);

live.init(ctx); show.init(ctx); tech.init(ctx); talk.init(ctx); rehearse.init(ctx); hostmode.init(ctx);
setInterval(() => { if (ctx.S) { live.tick(ctx); show.tick(ctx); rehearse.tick(ctx); hostmode.tick(ctx); } }, 250);

/* ---------- workspaces ---------- */

function setWs(name, { focus = false } = {}) {
  if (!WS.includes(name)) name = 'live';
  ctx.ws = name;
  for (const w of WS) {
    $('#ws-' + w).hidden = ctx.hostMode || w !== name;
    const tab = $('#tab-' + w);
    tab.setAttribute('aria-selected', String(w === name));
    tab.tabIndex = w === name ? 0 : -1;
  }
  if (focus) $('#tab-' + name).focus();
  if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
  if (name === 'show') $('#dotShow').hidden = true;
  monitors();
}
// the monitors cost OBS a screenshot a few times a second: only while a workspace with monitors is visible.
// Live Control: program + preview. SHOW and HOST mode: CAMERA 01 · PROGRAM · CAMERA 02.
function monitors() {
  if (!ctx.conn.open) return;
  const vis = document.visibilityState === 'visible';
  const on = !vis ? false : ctx.hostMode || ctx.ws === 'show' ? 'show' : ctx.ws === 'live';
  ctx.conn.send({ t: 'monitors', on }).catch(() => {});
}
ctx.monitors = monitors;
// DIRECTOR / HOST: the same account and the same rights; HOST only changes what this window shows
ctx.setMode = host => {
  ctx.hostMode = !!host;
  $('#modeDirector').setAttribute('aria-pressed', String(!host)); $('#modeHost').setAttribute('aria-pressed', String(!!host));
  document.body.classList.toggle('host-mode', !!host);
  $('#ws-host').hidden = !host;
  try { localStorage.setItem('dz-mode', host ? 'host' : 'director'); } catch {}
  setWs(ctx.ws);
};
$('#modeDirector').addEventListener('click', () => ctx.setMode(false));
$('#modeHost').addEventListener('click', () => ctx.setMode(true));
document.addEventListener('visibilitychange', monitors);
$$('.tab').forEach(t => {
  t.addEventListener('click', () => setWs(t.dataset.ws));
  t.addEventListener('keydown', e => {
    const i = WS.indexOf(t.dataset.ws);
    if (e.key === 'ArrowRight') setWs(WS[(i + 1) % WS.length], { focus: true });
    if (e.key === 'ArrowLeft') setWs(WS[(i + WS.length - 1) % WS.length], { focus: true });
  });
});
window.addEventListener('hashchange', () => setWs(location.hash.slice(1)));
setWs(location.hash.slice(1) || 'live');
try { if (localStorage.getItem('dz-mode') === 'host') ctx.setMode(true); } catch {}

initLayout();

// selecting a show loads its OBS scene collection, rundown, microphones, standby scene, transition and graphics
$('#showPick').addEventListener('change', e => {
  const id = e.target.value; if (!id) return;
  act(null, async () => {
    try {
      const r = await ctx.conn.send({ t: 'show.select', show: id });
      const notes = r?.result?.notes || r?.notes || [];
      if (notes.length) toast(notes.join(' · '), 'warn');
    } catch (err) { e.target.value = ctx.S?.showId || ''; throw err; }
  }, 'Show loaded');
});

$('#popout').addEventListener('click', () => {
  const w = window.open(location.pathname + '#' + ctx.ws, 'dz-' + ctx.ws, 'popup,width=1440,height=900');
  if (w) w.opener = null;
});

/* ---------- header: tallies, problems ---------- */

function header() {
  const S = ctx.S, o = S?.obs;
  // SELECT SHOW: lists the presets; the current one stays selected
  const pick = $('#showPick'), shows = S?.shows || [];
  if (pick.dataset.n !== String(shows.length)) { pick.replaceChildren(...shows.map(x => Object.assign(document.createElement('option'), { value: x.id, textContent: x.name }))); pick.dataset.n = String(shows.length); }
  if (!shows.some(x => x.id === S?.showId) && !pick.querySelector('option[value=""]')) pick.prepend(Object.assign(document.createElement('option'), { value: '', textContent: '— choose —' }));
  if (document.activeElement !== pick) pick.value = S?.showId || '';
  const air = $('#tallyAir'), rec = $('#tallyRec');
  const live = !!o?.stream.active;
  air.className = 'tally' + (live ? (o.stream.reconnecting ? ' warn' : ' on') : '');
  air.querySelector('span').replaceChildren(live ? (o.stream.reconnecting ? 'RECONNECTING ' : 'ON AIR ') : 'OFF AIR');
  if (live && o.stream.timecode) air.querySelector('span').append(Object.assign(document.createElement('small'), { textContent: o.stream.timecode.split('.')[0] }));
  rec.className = 'tally rec' + (o?.record.active ? ' on' : '');
  rec.querySelector('span').textContent = o?.record.active ? (o.record.paused ? 'REC PAUSED' : 'REC') : 'REC';

  const strip = $('#strip');
  if (ctx.link.state !== 'open') {
    strip.hidden = false; strip.className = 'strip bad';
    strip.textContent = 'Lost connection to the studio server on this Mac. Reconnecting… (is "npm start" still running?)';
  } else if (o && !o.connected) {
    strip.hidden = false; strip.className = 'strip warn';
    strip.textContent = 'OBS not connected // ' + (o.error || 'connecting…') + ' // Retrying automatically. Controls are locked.';
  } else strip.hidden = true;
  $('#dotTech').hidden = !(ctx.link.state !== 'open' || (o && !o.connected));
}

function render() {
  header();
  live.render(ctx);
  show.render(ctx);
  tech.render(ctx);
  talk.render(ctx);
  rehearse.render(ctx);
  hostmode.render(ctx);
}

/* ---------- keyboard ---------- */

document.addEventListener('keydown', e => {
  if (e.altKey && !e.metaKey && !e.ctrlKey && /^Digit[1-4]$/.test(e.code)) { e.preventDefault(); setWs(WS[+e.code.slice(5) - 1]); return; }
  if (e.metaKey || e.ctrlKey || e.altKey || !ctx.S) return;
  if (e.target.closest('input, textarea, select, [contenteditable]')) return;
  if (e.key === 'Escape') { $('#help').hidden = true; return; }
  if (e.key === '?') { e.preventDefault(); toggleHelp(); return; }
  if ((e.key === ']' || e.key === '[') && !ctx.hostMode) { e.preventDefault(); show.step(ctx, e.key === ']' ? 1 : -1); return; }
  if (ctx.ws === 'live' && !ctx.hostMode) live.key(e, ctx); // switching keys only where the monitors are
});
function toggleHelp() { const h = $('#help'); h.hidden = !h.hidden; if (!h.hidden) $('#helpClose').focus(); }
$('#helpBtn').addEventListener('click', toggleHelp);
$('#helpClose').addEventListener('click', toggleHelp);
$('#help').addEventListener('click', e => { if (e.target.id === 'help') toggleHelp(); });
