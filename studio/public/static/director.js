// Director Studio (Andrej, Vienna). Every control here sends a request to the local studio server,
// which checks the director role and talks to OBS. Nothing in this page talks to OBS directly.
import { $, $$, h, hms, connect, checkSignedIn, runClocks, segmentTimes, segmentTimer, clock, toast, act, holdButton, chatPanel, titleBadge } from './common.js';

let S = null, link = { state: 'connecting' }, everOpen = false;
let openRow = -1;
const memo = {};
const differs = (key, v) => { const j = JSON.stringify(v); if (memo[key] === j) return false; memo[key] = j; return true; };
const focusedIn = el => el && el.contains(document.activeElement);

const conn = connect({ onStatus: st => {
  link = st;
  if (st.state === 'open') everOpen = true;
  else if (!everOpen && st.state === 'closed') checkSignedIn();
  renderStatus();
} });
const obs = (action, data = {}) => conn.send({ t: 'obs', action, ...data });

conn.on('state', ({ s }) => { S = s; render(); });
conn.on('meters', ({ m }) => meters(m));
chatPanel(conn, 'director', { onUnread: n => { titleBadge('Director Studio — DISTANCE // ZERO')(n); const u = $('#unread'); u.hidden = !n; u.textContent = n + ' new'; } });
runClocks(() => S);
setInterval(() => S && renderTimers(), 250);

/* ---------- status ---------- */

function pill(el, cls, text) {
  el.className = 'pill ' + cls;
  el.lastChild.textContent = text;
}
function renderStatus() {
  pill($('#pStudio'), link.state === 'open' ? 'ok' : 'bad', link.state === 'open' ? `Studio ${link.rtt ?? '–'} ms` : 'Studio offline');
  const strip = $('#strip');
  const o = S?.obs;
  if (link.state !== 'open') {
    strip.hidden = false; strip.className = 'strip bad';
    strip.textContent = 'Lost connection to the studio server on this Mac. Reconnecting… (is "npm start" still running?)';
  } else if (o && !o.connected) {
    strip.hidden = false; strip.className = 'strip warn';
    strip.textContent = 'OBS not connected // ' + (o.error || 'connecting…') + ' // Retrying automatically.';
  } else strip.hidden = true;
  setDisabled(link.state !== 'open' || !o?.connected);
}
function setDisabled(off) {
  for (const b of $$('#scenes .scene, #sources .switch, #mixer .mute, #streamBtn, #recBtn, #take, #emStandby, #emMics, #emEnd')) b.disabled = off;
  if (!off && S) {
    $('#emStandby').disabled = !S.standby.exists;
    $('#emEnd').disabled = !S.obs.stream.active;
  }
}

/* ---------- render ---------- */

function render() {
  const o = S.obs;
  const up = o.connected;
  pill($('#pObs'), up ? 'ok' : o.status === 'auth-failed' || o.status === 'auth-required' ? 'bad' : 'warn', up ? 'OBS' : 'OBS ' + (o.status === 'connecting' ? '…' : 'off'));
  pill($('#pStream'), o.stream.active ? (o.stream.reconnecting ? 'bad' : 'live') : '', o.stream.active ? (o.stream.reconnecting ? 'Reconnecting' : 'On air') : 'Off air');
  pill($('#pRec'), o.record.active ? 'rec' : '', o.record.active ? (o.record.paused ? 'Rec paused' : 'Rec') : 'Rec off');
  pill($('#pHost'), S.presence.host ? 'ok' : '', S.presence.host ? 'Georgie online' : 'Georgie offline');
  $('#obsVer').textContent = up && o.version ? 'obs-websocket ' + o.version : '';
  for (const id of ['#swBadge', '#audBadge']) { const b = $(id); b.className = 'badge ' + (up ? 'live' : 'off'); b.textContent = up ? 'Live // OBS' : 'Not connected'; }

  renderSwitcher(); renderSources(); renderAudio(); renderOutput(); renderGfx(); renderRundown(); renderNote(); renderMusic(); renderHost();
  $('#emStandbyName').textContent = S.standby.exists ? '→ ' + S.standby.scene : `create scene "${S.standby.scene}"`;
  renderStatus();
}

function renderSwitcher() {
  const o = S.obs;
  $('#program').textContent = o.program || '—';
  $('#studioMode').hidden = !o.studioMode;
  $('#previewName').textContent = o.preview || '';
  if (!differs('scenes', [o.scenes, o.program, o.preview, o.studioMode, S.standby])) return;
  const box = $('#scenes');
  if (!o.scenes.length) { box.replaceChildren(h('p', { class: 'empty', text: o.connected ? 'OBS has no scenes' : 'Waiting for OBS…' })); return; }
  box.replaceChildren(...o.scenes.map((name, i) => {
    const pgm = name === o.program, pvw = o.studioMode && name === o.preview;
    return h('button', {
      type: 'button', class: `scene ${pgm ? 'pgm' : ''} ${pvw ? 'pvw' : ''} ${name === S.standby.scene ? 'standby' : ''}`,
      'aria-pressed': pgm ? 'true' : 'false',
      title: o.studioMode ? 'Send to preview, then Take' : 'Cut to program',
      onclick: e => pickScene(name, e.currentTarget),
    }, h('span', { text: name }), i < 9 ? h('kbd', { text: String(i + 1) }) : null,
    pgm ? h('span', { class: 'tag', text: 'PGM' }) : pvw ? h('span', { class: 'tag', text: 'PVW' }) : null);
  }));
}
function pickScene(name, btn) {
  if (!S?.obs.connected) return;
  return act(btn, () => obs(S.obs.studioMode ? 'preview' : 'program', { scene: name }));
}

function renderSources() {
  const o = S.obs;
  $('#srcScene').textContent = o.program;
  if (!differs('items', [o.items, o.connected])) return;
  const ul = $('#sources');
  if (!o.items.length) { ul.replaceChildren(h('li', { class: 'empty', text: o.connected ? 'This scene has no sources' : 'OBS not connected' })); return; }
  ul.replaceChildren(...o.items.map(it => h('li', {},
    h('span', { class: 'name', text: it.name, title: it.name }),
    h('span', { class: 'kind', text: it.kind.replace(/_capture|_source|_input/g, '') }),
    h('button', { type: 'button', class: 'switch', role: 'switch', 'aria-checked': String(it.enabled), 'aria-label': `${it.name} visible`,
      onclick: e => act(e.currentTarget, () => obs('item', { itemId: it.id, enabled: !it.enabled })) }))));
}

const level = d => Math.max(0, Math.min(100, (d + 60) / 60 * 100)).toFixed(1) + '%';
function renderAudio() {
  const o = S.obs;
  if (!differs('audio', [o.audio, o.connected])) return;
  const box = $('#mixer');
  if (!o.audio.length) { box.replaceChildren(h('p', { class: 'empty pb', text: o.connected ? 'No audio sources in OBS' : 'OBS not connected' })); return; }
  box.replaceChildren(...o.audio.map(a => h('div', { class: 'ch' + (a.muted ? ' muted' : ''), dataset: { input: a.name } },
    h('span', { class: 'name', title: a.name }, a.name, a.mic ? h('small', { text: 'MIC' }) : null),
    h('button', { type: 'button', class: 'b mute', 'aria-pressed': String(a.muted), 'aria-label': `Mute ${a.name}`,
      onclick: e => act(e.currentTarget, () => obs('mute', { input: a.name, muted: !a.muted })) }, a.muted ? 'Muted' : 'Live'),
    h('div', { class: 'meter', 'aria-hidden': 'true' }, h('i'), h('i')),
    h('span', { class: 'db', text: '−∞' }))));
}
function meters(m) {
  for (const ch of $$('#mixer .ch')) {
    const v = m[ch.dataset.input] || [-60, -60];
    const bars = ch.querySelectorAll('.meter i');
    bars[0].style.setProperty('--lv', level(v[0]));
    bars[1].style.setProperty('--lv', level(v[1]));
    const peak = Math.max(v[0], v[1]);
    ch.querySelector('.db').textContent = peak <= -60 ? '−∞' : peak.toFixed(1);
  }
}

function renderOutput() {
  const { stream, record, stats, connected } = S.obs;
  $('#outStream').classList.toggle('on', stream.active);
  $('#streamTc').textContent = stream.active ? (stream.timecode || '').split('.')[0] || 'LIVE' : 'OFF';
  const sb = $('#streamBtn');
  sb.firstChild.textContent = stream.active ? 'End stream ' : 'Go live ';
  sb.classList.toggle('danger', stream.active);
  $('#outRec').classList.toggle('on', record.active);
  $('#recTc').textContent = record.active ? (record.timecode || '').split('.')[0] : 'OFF';
  $('#recBtn').textContent = record.active ? 'Stop recording' : 'Record';
  const drop = stream.total ? (stream.skipped / stream.total * 100).toFixed(2) + '%' : '0%';
  const vals = connected ? [stats.cpu.toFixed(1) + '%', stats.fps.toFixed(0), drop, Math.round(stream.congestion * 100) + '%'] : ['—', '—', '—', '—'];
  $$('#stats b').forEach((b, i) => { b.textContent = vals[i]; });
}

function renderGfx() {
  const g = S.gfx;
  for (const [id, on] of [['#gBug', g.bug], ['#gClocks', g.clocks], ['#gIdent', g.ident]]) { $(id).classList.toggle('on', on); $(id).setAttribute('aria-pressed', String(on)); }
  $('#ltShow').classList.toggle('on', g.lowerThird.visible);
  $('#ltShow').textContent = g.lowerThird.visible ? 'Update' : 'Show';
  const b = $('#gfxBadge');
  b.className = 'badge ' + (S.presence.overlay ? 'live' : 'off');
  b.textContent = S.presence.overlay ? `Overlay live ×${S.presence.overlay}` : 'Overlay not in OBS';
  const url = location.origin + '/overlay?key=' + S.overlayKey;
  if ($('#overlayUrl').value !== url) $('#overlayUrl').value = url;
  if (!memo.ltInit) { memo.ltInit = 1; $('#ltTitle').value = g.lowerThird.title; $('#ltSub').value = g.lowerThird.subtitle; $('#ltSide').value = g.lowerThird.side; }
}

/* ---------- rundown ---------- */

const LEAD = { andrej: ['Andrej leads', 'andrej'], georgie: ['Georgie leads', 'georgie'], both: ['Both', ''] };
function renderRundown() {
  const r = S.rundown;
  const badge = $('#roBadge');
  badge.className = 'badge ' + (r.sample ? 'sample' : 'live');
  badge.textContent = r.sample ? 'Sample rundown' : 'Rundown';
  $('#roTitle').textContent = r.title || '';
  const seg = r.segments[r.index], nxt = r.segments[r.index + 1];
  $('#ident').classList.toggle('idle', !seg);
  $('#segTitle').textContent = seg ? seg.title : 'Show not started';
  $('#segMeta').textContent = seg ? `${String(r.index + 1).padStart(2, '0')} // ${seg.kind} // ${LEAD[seg.lead][0]} // ${seg.minutes} min` : 'Take the first segment when you go live';
  $('#segNotes').hidden = !seg?.notes;
  $('#segNotes').textContent = seg?.notes || '';
  $('#nextTitle').textContent = nxt ? nxt.title : r.index >= 0 ? 'End of show' : (r.segments[0]?.title || '—');
  $('#nextMeta').textContent = nxt ? `${nxt.minutes} min // ${LEAD[nxt.lead][0]}` : '';
  $('#advance').firstChild.textContent = r.index < 0 ? 'Start show // take first segment ' : nxt ? 'Take next segment ' : 'Last segment ';
  $('#advance').disabled = r.index >= 0 && !nxt;
  $('#prev').disabled = r.index <= 0;
  renderTimers();

  if (focusedIn($('#ro')) || !differs('ro', [r, openRow])) return;
  const times = segmentTimes(S);
  const total = r.segments.reduce((a, s) => a + s.minutes, 0);
  $('#ro').replaceChildren(...r.segments.map((s, i) => {
    const li = h('li', { class: i < r.index ? 'done' : i === r.index ? 'cur' : i === r.index + 1 ? 'nxt' : '' },
      h('button', { type: 'button', class: 'r', 'aria-expanded': String(openRow === i), onclick: () => { openRow = openRow === i ? -1 : i; renderRundown(); } },
        h('span', { class: 'i', text: String(i + 1).padStart(2, '0') }),
        h('span', { class: 't vie', text: clock('vie', times[i], false) }),
        h('span', { class: 't mel', text: clock('mel', times[i], false) }),
        h('span', { class: 'ti', text: s.title }),
        h('span', { class: 'k', text: s.kind }),
        h('span', { class: 'm', text: s.minutes + "'" })));
    if (openRow === i) {
      const ta = h('textarea', { class: 'in', rows: '3', maxlength: '2000', 'aria-label': `Notes for ${s.title}` });
      ta.value = s.notes;
      li.append(h('div', { class: 'more' },
        h('p', { class: 'lead' }, h('b', { class: LEAD[s.lead][1], text: LEAD[s.lead][0] })),
        ta,
        h('div', { class: 'row end' },
          h('button', { type: 'button', class: 'b ghost', text: 'Save notes', onclick: e => act(e.currentTarget, () => conn.send({ t: 'rundown', action: 'notes', index: i, notes: ta.value }), 'Notes saved') }),
          h('button', { type: 'button', class: 'b solid', text: i === r.index ? 'Restart segment' : 'Take this segment', onclick: e => act(e.currentTarget, () => conn.send({ t: 'rundown', action: 'go', index: i })) }))));
    }
    return li;
  }));
  const slot = S.show.schedule.minutes;
  $('#roTotal').replaceChildren(h('span', { text: `${r.segments.length} segments` }),
    h('span', { class: total > slot ? 'bad' : '', text: `${total} of ${slot} min${total > slot ? ' // over the slot' : ''}` }));
}

function renderTimers() {
  const r = S.rundown, t = segmentTimer(S);
  const set = (id, text, cls = '') => { const d = $(id); d.className = cls; d.querySelector('strong').textContent = text; };
  if (!t) { set('#tElapsed', '--:--'); set('#tRemain', '--:--'); set('#tOver', '--:--'); $('#segProgress i').style.width = '0'; return; }
  set('#tElapsed', hms(t.elapsed));
  set('#tRemain', hms(t.remaining), t.remaining < 0 ? 'over' : t.remaining < 60000 ? 'near' : '');
  // planned show time up to the end of this segment vs. actual: positive = running late
  const planned = r.segments.slice(0, r.index + 1).reduce((a, s) => a + s.minutes, 0) * 6e4;
  const drift = (Date.now() - r.showStartedAt) - planned + Math.max(0, t.remaining);
  set('#tOver', hms(drift, { sign: true }), drift > 60000 ? 'over' : drift < -60000 ? 'near' : '');
  const p = $('#segProgress');
  p.classList.toggle('over', t.remaining < 0);
  p.firstChild.style.width = (t.ratio * 100).toFixed(2) + '%';
}

function renderNote() {
  const ta = $('#note');
  if (document.activeElement !== ta && !ta.dataset.dirty) ta.value = S.note;
}
function renderMusic() {
  const m = S.music;
  $('#mNow').textContent = m.title || m.artist ? `On air: ${m.artist}${m.artist && m.title ? ' — ' : ''}${m.title}${m.label ? ' [' + m.label + ']' : ''}` : 'Nothing set';
  if (!memo.musicInit) { memo.musicInit = 1; $('#mArtist').value = m.artist; $('#mTitle').value = m.title; $('#mLabel').value = m.label; }
}

function renderHost() {
  const online = S.presence.host, st = S.hostStatus;
  const b = $('#hostBadge');
  b.className = 'badge ' + (online ? 'live' : 'off');
  b.textContent = online ? 'Online' : 'Offline';
  const fresh = st && Date.now() - st.at < 6 * 3600e3;
  const item = (label, ok) => h('span', { class: !fresh ? '' : ok ? 'ok' : 'no', text: label });
  $('#hostStat').replaceChildren(item(online ? 'Dashboard' : 'Not signed in', online), item('Camera', st?.camera), item('Mic', st?.mic),
    item('Headphones', st?.headphones), item('Wired net', st?.wired), item('In VDO', st?.vdo));
  if ($('#vdoView').value !== S.vdo.view) $('#vdoView').value = S.vdo.view;
}

/* ---------- controls ---------- */

$('#take').addEventListener('click', e => act(e.currentTarget, () => obs('take')));
holdButton($('#streamBtn'), 1500, () => act($('#streamBtn'), () => obs('stream', { on: !S.obs.stream.active, confirm: true }),
  S.obs.stream.active ? 'Stream stopped' : 'Stream starting'));
$('#recBtn').addEventListener('click', e => act(e.currentTarget, () => obs('record', { on: !S.obs.record.active })));

$('#emStandby').addEventListener('click', e => act(e.currentTarget, () => conn.send({ t: 'emergency', action: 'standby' }), 'Cut to standby'));
$('#emMics').addEventListener('click', e => act(e.currentTarget, async () => { const r = await conn.send({ t: 'emergency', action: 'mics' }); toast(`${r.muted} microphone${r.muted === 1 ? '' : 's'} muted`, 'ok'); }));
holdButton($('#emEnd'), 2000, () => act($('#emEnd'), () => conn.send({ t: 'emergency', action: 'endStream', confirm: true }), 'Stream ended'));

const rd = (action, extra) => conn.send({ t: 'rundown', action, ...extra });
$('#advance').addEventListener('click', e => act(e.currentTarget, () => rd('next')));
$('#prev').addEventListener('click', e => act(e.currentTarget, () => rd('prev')));
$('#resetShow').addEventListener('click', e => {
  if (!confirmTwice(e.currentTarget, 'Reset? click again')) return;
  act(e.currentTarget, () => rd('reset'), 'Show clock reset');
});
$('#reload').addEventListener('click', e => act(e.currentTarget, () => rd('reload'), 'Rundown reloaded from file'));

/* a second click within 3 s confirms; no browser dialogs during a live show */
function confirmTwice(btn, label) {
  if (btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = btn.dataset.label; return true; }
  btn.dataset.armed = '1'; btn.dataset.label = btn.textContent; btn.textContent = label;
  setTimeout(() => { if (btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = btn.dataset.label; } }, 3000);
  return false;
}

const note = $('#note');
note.addEventListener('input', () => { note.dataset.dirty = '1'; });
const flashSaved = () => { $('#noteSaved').classList.add('show'); setTimeout(() => $('#noteSaved').classList.remove('show'), 1600); };
$('#noteSend').addEventListener('click', e => act(e.currentTarget, async () => { await conn.send({ t: 'note', text: note.value }); delete note.dataset.dirty; flashSaved(); }));
$('#noteClear').addEventListener('click', e => act(e.currentTarget, async () => { note.value = ''; await conn.send({ t: 'note', text: '' }); delete note.dataset.dirty; flashSaved(); }));

$('#mSet').addEventListener('click', e => act(e.currentTarget, () => conn.send({ t: 'music', artist: $('#mArtist').value, title: $('#mTitle').value, label: $('#mLabel').value })));
$('#mClear').addEventListener('click', e => { for (const id of ['#mArtist', '#mTitle', '#mLabel']) $(id).value = ''; act(e.currentTarget, () => conn.send({ t: 'music' })); });

const gfx = (action, extra) => conn.send({ t: 'gfx', action, ...extra });
$('#gBug').addEventListener('click', e => act(e.currentTarget, () => gfx('bug', { on: !S.gfx.bug })));
$('#gClocks').addEventListener('click', e => act(e.currentTarget, () => gfx('clocks', { on: !S.gfx.clocks })));
$('#gIdent').addEventListener('click', e => act(e.currentTarget, () => gfx('ident', { on: !S.gfx.ident })));
const lower = on => gfx('lower', { on, title: $('#ltTitle').value, subtitle: $('#ltSub').value, side: $('#ltSide').value });
$('#ltShow').addEventListener('click', e => {
  if (!$('#ltTitle').value.trim()) return toast('Type a name for the lower third first', 'bad');
  act(e.currentTarget, () => lower(true));
});
$('#ltHide').addEventListener('click', e => act(e.currentTarget, () => lower(false)));
$('#gClear').addEventListener('click', e => act(e.currentTarget, () => gfx('clear')));
$$('#presets button').forEach(b => b.addEventListener('click', () => { $('#ltTitle').value = b.dataset.t; $('#ltSub').value = b.dataset.s; $('#ltSide').value = b.dataset.side; }));

async function copy(input, btn) {
  try { await navigator.clipboard.writeText(input.value); btn.textContent = 'Copied'; }
  catch { input.select(); btn.textContent = 'Press ⌘C'; }
  setTimeout(() => { btn.textContent = 'Copy'; }, 1600);
}
$('#copyOverlay').addEventListener('click', e => copy($('#overlayUrl'), e.currentTarget));
$('#copyVdo').addEventListener('click', e => copy($('#vdoView'), e.currentTarget));

/* keyboard: 1–9 scenes, T take, ] next segment, [ previous */
document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || !S) return;
  if (e.target.closest('input, textarea, select, [contenteditable]')) return;
  if (/^[1-9]$/.test(e.key)) {
    const name = S.obs.scenes[+e.key - 1];
    if (name) { e.preventDefault(); pickScene(name, $$('#scenes .scene')[+e.key - 1]); }
  } else if (e.key === 't' || e.key === 'T') { if (S.obs.studioMode) { e.preventDefault(); $('#take').click(); } }
  else if (e.key === ']') { e.preventDefault(); if (!$('#advance').disabled) $('#advance').click(); }
  else if (e.key === '[') { e.preventDefault(); if (!$('#prev').disabled) $('#prev').click(); }
});
