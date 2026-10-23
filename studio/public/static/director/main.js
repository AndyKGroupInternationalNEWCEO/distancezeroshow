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
import { initHelpTips } from '../helptips.js';

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
// after a studio update this page reloads by itself, but never during a call
let bootBuild = '';
function reloadIfUpdated(b) {
  if (!b) return;
  bootBuild ||= b;
  if (b !== bootBuild && !document.querySelector('.callpanel:not([hidden])')) location.reload();
}
ctx.conn.on('state', ({ s }) => {
  ctx.S = s; render(); reloadIfUpdated(s.build);
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
ctx.conn.on('guest.snap', m => show.guestSnap(m));
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
  const on = !vis ? false : ctx.hostMode || ctx.ws === 'show' || ctx.cctv ? 'show' : ctx.ws === 'live';   // CCTV (shell.js) shows the cameras
  ctx.conn.send({ t: 'monitors', on }).catch(() => {});
}
ctx.monitors = monitors;
window.dzDirector = ctx;   // the Virtual Space controls (shell.js) read and drive the same state
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
initHelpTips('director');

// selecting a show loads its OBS scene collection, rundown, microphones, standby scene, transition and graphics.
// If the current show still runs, the switch dialog says what runs, why, and offers END & SWITCH or STAY.
$('#showPick').addEventListener('change', e => {
  const id = e.target.value; if (!id) return;
  e.target.value = ctx.S?.showId || '';           // stays on the current show until the switch has really happened
  switchTo(id);
});
async function switchTo(id, end = false) {
  try {
    const chk = end ? null : await ctx.conn.send({ t: 'show.check', show: id });
    if (chk?.blockers?.length) return switchDialog(chk);
    const r = await ctx.conn.send({ t: 'show.select', show: id, end });
    const notes = r?.notes || [];
    toast(notes.length ? notes.join(' · ') : 'Show loaded', notes.length ? 'warn' : 'ok');
    $('#switchDlg').hidden = true;
  } catch (err) {
    if (err.check) return switchDialog(err.check);   // something started in between: show it again
    toast(err.message, 'bad');
  }
}
const short = n => (n || '').split(' — ')[0];
function switchDialog(chk) {
  const dlg = $('#switchDlg'), hard = chk.blockers.filter(b => !b.fix);
  const from = short(chk.fromName) || 'The current show', to = short(chk.toName);
  dlg.classList.toggle('hard', hard.length > 0);
  $('#swTitle').textContent = `${chk.fromName || 'The current show'} is still active`;
  $('#swList').replaceChildren(...chk.blockers.map(b => {
    const li = document.createElement('li'); li.className = b.fix ? '' : 'hard';
    li.append(Object.assign(document.createElement('b'), { textContent: b.title }), Object.assign(document.createElement('span'), { textContent: b.text }));
    return li;
  }));
  const end = $('#swEnd'), go = $('#swGo');
  if (hard.length) {
    end.hidden = true;
    const live = hard.find(b => b.id === 'stream' || b.id === 'record');
    go.hidden = !live;
    go.textContent = 'Open broadcast controls';
    go.onclick = () => { dlg.hidden = true; location.hash = 'live'; document.getElementById(hard.some(b => b.id === 'stream') ? 'outStream' : 'outRec')?.scrollIntoView({ block: 'center' }); };
    $('#swNote').textContent = live ? 'Nothing was stopped. Stream and recording are ended only by you — then choose the show again.' : 'Nothing was changed. Try again in a moment.';
  } else {
    end.hidden = false; go.hidden = true;
    end.textContent = `End ${from} & switch to ${to}`;
    end.onclick = () => { end.disabled = true; switchTo(chk.to, true).finally(() => { end.disabled = false; }); };
    $('#swNote').textContent = 'The stream and the recording are never touched. Scripts, notes and episodes stay saved.';
  }
  $('#swStay').textContent = `Stay in ${from}`;
  $('#swStay').onclick = () => { dlg.hidden = true; };
  dlg.hidden = false;
  (hard.length ? $('#swStay') : end).focus();
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#switchDlg').hidden) $('#switchDlg').hidden = true; });

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
  } else if (S?.showCheck && !S.showCheck.ok) {
    // the show selected here and the collection open in OBS differ: say which, and how to fix it
    strip.hidden = false; strip.className = 'strip warn';
    strip.textContent = `SHOW AND OBS DO NOT MATCH // this show needs the OBS collection "${S.showCheck.want}", but OBS has "${S.showCheck.have}" open. Select the show again (top right) or open "${S.showCheck.want}" in OBS.`;
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
