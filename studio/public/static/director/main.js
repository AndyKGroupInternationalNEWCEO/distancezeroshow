// Director Studio shell: one connection to the studio server, three workspaces (Live, Show, Technical),
// keyboard, and pop-out windows so each workspace can live on its own screen later.
// Every control sends a request to the local studio server, which checks the director role and talks to OBS.
import { $, $$, connect, checkSignedIn, runClocks, chatPanel, titleBadge } from '../common.js';
import * as live from './live.js';
import * as show from './show.js';
import * as tech from './tech.js';

const WS = ['live', 'show', 'tech'];
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

ctx.conn.on('state', ({ s }) => { ctx.S = s; render(); });
ctx.conn.on('meters', ({ m }) => { live.meters(m); tech.meters(m); });
ctx.conn.on('frame', f => live.frame(f));
ctx.conn.on('log.history', ({ entries }) => tech.logHistory(entries));
ctx.conn.on('log', ({ entry }) => tech.logEntry(entry));
chatPanel(ctx.conn, 'director', { onUnread: n => {
  ctx.unread = n;
  titleBadge('Director Studio — DISTANCE // ZERO')(n);
  const u = $('#unread'); u.hidden = !n; u.textContent = n + ' new';
  $('#dotShow').hidden = !n || ctx.ws === 'show';
} });
runClocks(() => ctx.S);

live.init(ctx); show.init(ctx); tech.init(ctx);
setInterval(() => { if (ctx.S) { live.tick(ctx); show.tick(ctx); } }, 250);

/* ---------- workspaces ---------- */

function setWs(name, { focus = false } = {}) {
  if (!WS.includes(name)) name = 'live';
  ctx.ws = name;
  for (const w of WS) {
    $('#ws-' + w).hidden = w !== name;
    const tab = $('#tab-' + w);
    tab.setAttribute('aria-selected', String(w === name));
    tab.tabIndex = w === name ? 0 : -1;
  }
  if (focus) $('#tab-' + name).focus();
  if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
  if (name === 'show') $('#dotShow').hidden = true;
  monitors();
}
// the program/preview monitors cost OBS a screenshot a few times a second: only while Live Control is visible
function monitors() {
  if (!ctx.conn.open) return;
  ctx.conn.send({ t: 'monitors', on: ctx.ws === 'live' && document.visibilityState === 'visible' }).catch(() => {});
}
document.addEventListener('visibilitychange', monitors);
$$('.tab').forEach(t => {
  t.addEventListener('click', () => setWs(t.dataset.ws));
  t.addEventListener('keydown', e => {
    const i = WS.indexOf(t.dataset.ws);
    if (e.key === 'ArrowRight') setWs(WS[(i + 1) % 3], { focus: true });
    if (e.key === 'ArrowLeft') setWs(WS[(i + 2) % 3], { focus: true });
  });
});
window.addEventListener('hashchange', () => setWs(location.hash.slice(1)));
setWs(location.hash.slice(1) || 'live');

$('#popout').addEventListener('click', () => {
  const w = window.open(location.pathname + '#' + ctx.ws, 'dz-' + ctx.ws, 'popup,width=1440,height=900');
  if (w) w.opener = null;
});

/* ---------- header: tallies, problems ---------- */

function header() {
  const S = ctx.S, o = S?.obs;
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
}

/* ---------- keyboard ---------- */

document.addEventListener('keydown', e => {
  if (e.altKey && !e.metaKey && !e.ctrlKey && /^Digit[123]$/.test(e.code)) { e.preventDefault(); setWs(WS[+e.code.slice(5) - 1]); return; }
  if (e.metaKey || e.ctrlKey || e.altKey || !ctx.S) return;
  if (e.target.closest('input, textarea, select, [contenteditable]')) return;
  if (e.key === 'Escape') { $('#help').hidden = true; return; }
  if (e.key === '?') { e.preventDefault(); toggleHelp(); return; }
  if (e.key === ']' || e.key === '[') { e.preventDefault(); show.step(ctx, e.key === ']' ? 1 : -1); return; }
  if (ctx.ws === 'live') live.key(e, ctx); // switching keys only where the monitors are
});
function toggleHelp() { const h = $('#help'); h.hidden = !h.hidden; if (!h.hidden) $('#helpClose').focus(); }
$('#helpBtn').addEventListener('click', toggleHelp);
$('#helpClose').addEventListener('click', toggleHelp);
$('#help').addEventListener('click', e => { if (e.target.id === 'help') toggleHelp(); });
