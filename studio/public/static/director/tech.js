// TECHNICAL CONTROL — engineering: OBS diagnostics, connections, event log, the full audio mixer with
// faders and microphone tagging, sources in program, emergency, and settings.
import { $, $$, h, act, toast, holdButton, clock } from '../common.js';
import { georgieProof } from './live.js';

const level = d => Math.max(0, Math.min(100, (d + 60) / 60 * 100)).toFixed(1) + '%';
let lastBytes = null, kbps = 0;

export function init(ctx) {
  $('#obsRefresh').addEventListener('click', e => act(e.currentTarget, () => ctx.obs('refresh'), 'OBS state re-read'));
  $('#obsReconnect').addEventListener('click', e => act(e.currentTarget, () => ctx.obs('reconnect')));
  $('#emStandby').addEventListener('click', e => act(e.currentTarget, () => ctx.conn.send({ t: 'emergency', action: 'standby' }), 'Cut to standby'));
  $('#emMics').addEventListener('click', e => act(e.currentTarget, async () => {
    const r = await ctx.conn.send({ t: 'emergency', action: 'mics' });
    toast(`${r.muted} microphone${r.muted === 1 ? '' : 's'} muted`, 'ok');
  }));
  holdButton($('#emEnd'), 2000, () => act($('#emEnd'), () => ctx.conn.send({ t: 'emergency', action: 'endStream', confirm: true }), 'Stream ended'));
  $('#setStandby').addEventListener('change', e => act(null, () => ctx.conn.send({ t: 'settings', standbyScene: e.target.value }), 'Standby scene set'));
  $('#copyOverlay').addEventListener('click', e => copy($('#overlayUrl'), e.currentTarget));
  $('#copyVdo').addEventListener('click', e => copy($('#vdoView'), e.currentTarget));
}

async function copy(input, btn) {
  try { await navigator.clipboard.writeText(input.value); btn.textContent = 'Copied'; }
  catch { input.select(); btn.textContent = 'Press ⌘C'; }
  setTimeout(() => { btn.textContent = 'Copy'; }, 1600);
}

const dd = (label, value, cls = '') => h('div', {}, h('dt', { text: label }), h('dd', { class: cls, text: value, title: value }));
const pct = (a, b) => (b ? (a / b * 100).toFixed(2) + '%' : '0%');
const since = t => { if (!t) return '—'; const s = Math.floor((Date.now() - t) / 1000); return s < 60 ? s + ' s' : s < 3600 ? Math.floor(s / 60) + ' min' : Math.floor(s / 3600) + ' h ' + Math.floor(s / 60) % 60 + ' min'; };

export function render(ctx) {
  const S = ctx.S, o = S.obs, st = o.stats, up = o.connected && ctx.link.state === 'open';

  /* OBS diagnostics */
  const b = $('#obsBadge');
  b.className = 'badge ' + (o.connected ? 'live' : o.status === 'connecting' ? 'off' : 'bad');
  b.textContent = o.connected ? 'Connected' : o.status.replace('-', ' ');
  if (o.stream.active && lastBytes != null && o.stream.bytes >= lastBytes.v) kbps = Math.round((o.stream.bytes - lastBytes.v) * 8 / Math.max(1, Date.now() - lastBytes.t));
  lastBytes = o.stream.active ? { v: o.stream.bytes, t: Date.now() } : null;
  const dropOut = o.stream.total ? o.stream.skipped / o.stream.total : 0, dropRender = st.renderTotal ? st.renderSkipped / st.renderTotal : 0;
  $('#diag').replaceChildren(
    dd('Status', o.connected ? 'Connected' : o.status, o.connected ? 'ok' : 'bad'),
    dd('Connected for', o.connected ? since(o.since) : '—'),
    dd('OBS', o.obsVersion || '—'), dd('obs-websocket', o.version || '—'),
    dd('Request latency', o.connected ? st.latency + ' ms' : '—', st.latency > 200 ? 'warn' : ''),
    dd('CPU', o.connected ? st.cpu.toFixed(1) + ' %' : '—', st.cpu > 80 ? 'bad' : st.cpu > 60 ? 'warn' : ''),
    dd('Frame rate', o.connected ? st.fps.toFixed(1) + ' fps' : '—'),
    dd('Render time', o.connected ? st.frameMs.toFixed(1) + ' ms' : '—', st.frameMs > 25 ? 'warn' : ''),
    dd('Render lag', o.connected ? pct(st.renderSkipped, st.renderTotal) : '—', dropRender > 0.01 ? 'warn' : ''),
    dd('Stream dropped', o.stream.active ? pct(o.stream.skipped, o.stream.total) : '—', dropOut > 0.01 ? 'bad' : ''),
    dd('Stream bitrate', o.stream.active && kbps ? kbps + ' kb/s' : '—'),
    dd('Congestion', o.stream.active ? Math.round(o.stream.congestion * 100) + ' %' : '—', o.stream.congestion > 0.3 ? 'warn' : ''),
    dd('Memory', o.connected ? Math.round(st.memory) + ' MB' : '—'),
    dd('Disk free', o.connected && st.disk ? (st.disk / 1024).toFixed(1) + ' GB' : '—', st.disk && st.disk < 20480 ? 'warn' : ''),
    dd('Studio Mode', o.connected ? (o.studioMode ? 'On' : 'Off') : '—'),
    dd('Transition', o.transition || '—'));
  $('#obsErr').textContent = o.connected ? '' : o.error;
  $('#obsReconnect').disabled = ctx.link.state !== 'open';
  $('#obsRefresh').disabled = !up;

  /* connections */
  const hs = S.hostStatus, fresh = hs && Date.now() - hs.at < 6 * 3600e3;
  $('#connDiag').replaceChildren(
    dd('Studio server', ctx.link.state === 'open' ? `${ctx.link.rtt ?? '–'} ms` : 'offline', ctx.link.state === 'open' ? 'ok' : 'bad'),
    dd('Director windows', String(S.presence.director)),
    dd('Georgie dashboard', S.presence.host ? 'online' : 'offline', S.presence.host ? 'ok' : ''),
    dd('Georgie link', S.presence.host && hs?.rtt ? hs.rtt + ' ms' : '—', hs?.rtt > 600 ? 'warn' : ''),
    dd('Graphics overlay', S.presence.overlay ? `${S.presence.overlay} in OBS` : 'not loaded', S.presence.overlay ? 'ok' : 'warn'),
    dd('Private call', S.call ? (S.call.phase === 'active' ? (S.call.route || 'connected') : 'ringing') : 'none', S.call?.phase === 'active' ? 'ok' : ''),
    dd('Call quality', S.call?.directorStats ? `${S.call.directorStats.rtt} ms · ${S.call.directorStats.fps} fps in · Georgie ${S.call.hostStats?.rtt ?? '–'} ms` : '—', (S.call?.directorStats?.rtt || 0) > 400 ? 'warn' : ''),
    dd('OBS address', S.settings.obsUrl));
  const item = (label, ok) => h('span', { class: 'light ' + (ok ? 'ok' : !fresh ? '' : 'warn'), text: label });
  const proof = georgieProof(S, hs);
  $('#hostStat').replaceChildren(item('Camera', proof.camera), item('Mic', proof.mic), item('Headphones', hs?.headphones),
    item('Wired net', hs?.wired), item('Light', hs?.light), item('In VDO', hs?.vdo),
    h('span', { class: 'hint', text: fresh ? `checked ${clock('vie', hs.at, false)} Vienna` : 'no check yet' }));

  /* mixer */
  const mb = $('#mixBadge'); mb.className = 'badge ' + (up ? 'live' : 'off'); mb.textContent = up ? 'Live // OBS' : 'Not connected';
  const mix = $('#mixer');
  if (!ctx.focusedIn(mix) && ctx.differs('mixer', [o.audio, up])) {
    mix.replaceChildren(...(o.audio.length ? o.audio.map(a => {
      const fader = h('input', { type: 'range', min: '-60', max: '6', step: '0.5', disabled: !up, 'aria-label': `${a.name} volume` });
      fader.value = Math.max(-60, a.volumeDb);
      const val = h('span', { text: fmtDb(a.volumeDb) });
      fader.addEventListener('input', () => { val.textContent = fmtDb(+fader.value); });
      fader.addEventListener('change', () => act(null, () => ctx.obs('volume', { input: a.name, db: +fader.value <= -60 ? -100 : +fader.value })));
      return h('div', { class: 'strip-ch' + (a.muted ? ' muted' : ''), dataset: { input: a.name } },
        h('span', { class: 'nm', title: a.name }, a.name, h('small', { text: a.kind.replace(/_capture|_source|_input/g, '') })),
        h('div', { class: 'meter', 'aria-hidden': 'true' }, h('i'), h('i')),
        h('div', { class: 'fader' }, fader, val),
        h('div', { class: 'btns' },
          h('button', { type: 'button', class: 'b sm micb', 'aria-pressed': String(a.mic), disabled: ctx.link.state !== 'open', title: 'Counts as a microphone (Live Control, Mics off)',
            onclick: e => act(e.currentTarget, () => ctx.conn.send({ t: 'settings', micInputs: toggleMic(o.audio, a.name) })) }, 'MIC'),
          h('button', { type: 'button', class: 'b sm muteb', 'aria-pressed': String(a.muted), disabled: !up,
            onclick: e => act(e.currentTarget, () => ctx.obs('mute', { input: a.name, muted: !a.muted })) }, a.muted ? 'Muted' : 'Live')));
    }) : [h('p', { class: 'card-b empty', text: up ? 'No audio sources in OBS' : 'OBS not connected' })]));
  }
  const note = $('#micModeNote');
  if (S.settings.micMode === 'list') {
    note.replaceChildren('Microphones are the sources you tagged MIC. ',
      h('button', { type: 'button', class: 'b sm quiet', text: 'Use name rule instead', onclick: e => act(e.currentTarget, () => ctx.conn.send({ t: 'settings', micInputs: null })) }));
  } else note.textContent = `Microphones are found by name (“${S.settings.micPattern}”). Tap MIC on a source to choose them yourself.`;

  /* sources in program */
  $('#srcScene').textContent = o.program;
  if (ctx.differs('srcs', [o.items, up])) {
    $('#sources').replaceChildren(...(o.items.length ? o.items.map(it => h('li', {},
      h('span', { class: 'nm', text: it.name, title: it.name }),
      h('span', { class: 'kind', text: it.kind.replace(/_capture|_source|_input/g, '') }),
      h('button', { type: 'button', class: 'switch', role: 'switch', 'aria-checked': String(it.enabled), 'aria-label': `${it.name} visible`, disabled: !up,
        onclick: e => act(e.currentTarget, () => ctx.obs('item', { itemId: it.id, enabled: !it.enabled })) })))
      : [h('li', { class: 'empty', text: up ? 'This scene has no sources' : 'OBS not connected' })]));
  }

  /* emergency */
  $('#emStandbyName').textContent = S.standby.exists ? '→ ' + S.standby.scene : `no scene "${S.standby.scene}"`;
  $('#emStandby').disabled = !up || !S.standby.exists;
  $('#emMics').disabled = !up;
  $('#emEnd').disabled = !up || !o.stream.active;

  /* settings */
  const sel = $('#setStandby');
  if (document.activeElement !== sel && ctx.differs('standbySel', [o.scenes, S.standby])) {
    const names = o.scenes.includes(S.standby.scene) ? o.scenes : [S.standby.scene, ...o.scenes];
    sel.replaceChildren(...names.map(n => h('option', { value: n, text: n + (o.scenes.includes(n) ? '' : ' (not in OBS)') })));
    sel.value = S.standby.scene;
  }
  sel.disabled = ctx.link.state !== 'open';
  const url = location.origin + '/overlay?key=' + S.overlayKey;
  if ($('#overlayUrl').value !== url) $('#overlayUrl').value = url;
  if ($('#vdoView').value !== S.vdo.view) $('#vdoView').value = S.vdo.view;
  $('#sysDiag').replaceChildren(
    dd('Director port', `127.0.0.1:${S.settings.directorPort}`), dd('Host port', `127.0.0.1:${S.settings.guestPort}`),
    dd('Data folder', S.settings.dataDir), dd('Mic name rule', S.settings.micPattern));
}

function toggleMic(audio, name) {
  return audio.filter(a => (a.name === name ? !a.mic : a.mic)).map(a => a.name);
}
const fmtDb = v => (v <= -60 ? '−∞' : (v > 0 ? '+' : '') + Number(v).toFixed(1) + ' dB');

export function meters(m) {
  for (const ch of $$('#mixer .strip-ch')) {
    const v = m[ch.dataset.input] || [-60, -60];
    const bars = ch.querySelectorAll('.meter i');
    bars[0].style.setProperty('--lv', level(v[0]));
    bars[1].style.setProperty('--lv', level(v[1]));
  }
}

const LOG_SHOW = 120;
export function logHistory(entries) { $('#log').replaceChildren(...entries.slice(-LOG_SHOW).reverse().map(line)); }
export function logEntry(entry) {
  const list = $('#log');
  list.prepend(line(entry));
  while (list.children.length > LOG_SHOW) list.lastChild.remove();
}
const line = e => h('li', {}, h('time', { text: clock('vie', e.ts) }), h('span', { class: e.level, text: e.text }));
