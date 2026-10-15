// Host Dashboard (Georgie, Melbourne). Read-only show information, private talkback, and a local
// camera/mic check. This page has no OBS or broadcast controls, and the server refuses them for this role anyway.
import { $, $$, h, hms, connect, checkSignedIn, runClocks, segmentTimes, segmentTimer, clock, day, nextShow, countdown, toast, chatPanel, titleBadge } from './common.js';
import { createCall } from './call.js';
import { notifier } from './notify.js';
import { testDevices, playTone } from './checks.js';
import { initHelpTips } from './helptips.js';
import { createMonitors, createClock, createScript, createBreakMonitors, syncClock, cueLine, serverNow } from './showpanels.js';
import { nextSteps, renderSteps } from './steps.js';

let S = null, link = { state: 'connecting' }, everOpen = false, lastNote = null, roKey = '';
let downSince = 0, reconnects = 0, slowPings = 0;

const conn = connect({ onStatus: st => {
  const was = link.state;
  link = st;
  if (st.state === 'open') {
    if (was !== 'open' && everOpen) {
      reconnects++;
      const down = downSince ? Date.now() - downSince : 0;
      // tell Vienna after the fact: while the link was down nothing could be sent
      if (down > 5000) autoHelp('normal', 'reconnected', `Georgie's dashboard was disconnected for ${Math.round(down / 1000)} s and is back`, { downSeconds: Math.round(down / 1000) });
    }
    downSince = 0; everOpen = true; report(); watch();
    slowPings = st.rtt > 1500 ? slowPings + 1 : 0;
    if (slowPings === 3) autoHelp('urgent', 'slow-link', `Georgie's link to Vienna is very slow (${st.rtt} ms)`, { rtt: st.rtt });
  } else {
    if (!downSince) downSince = Date.now();
    if (!everOpen && st.state === 'closed') checkSignedIn();
  }
  renderStatus();
} });
conn.on('state', ({ s }) => { S = s; render(); });
// SHOW: the three monitors, the show clock, the live script with teleprompter, break monitors (all read-only)
const mons = createMonitors($('#hMons'), { programLabel: 'LIVE PROGRAM' });
const sclock = createClock($('#hClock'));
const script = createScript($('#hScript'), { me: 'GEORGIE', role: 'host', conn });
const bmons = createBreakMonitors($('#hBreak'), { call: { get phase() { return call.phase; }, streams: () => call.streams(), micOn: () => call.micOn() }, role: 'host' });
conn.on('frame', f => mons.frame(f));
initHelpTips('host');
function watch() { if (conn.open) conn.send({ t: 'monitors', on: document.visibilityState === 'visible' && !$('#view-show').hidden }).catch(() => {}); }
document.addEventListener('visibilitychange', watch);
conn.on('alert', ({ text }) => alertBox(text));
conn.on('help.update', () => {}); // the state update that follows repaints the help card
conn.on('assist', a => assistCard(a));
const note = notifier();
conn.on('notify', m => note.show(m));
conn.on('check.request', ({ items }) => checkCard(items));
setInterval(() => renderStatus(), 5000); // keeps the "how long offline" advice current
chatPanel(conn, 'host', { onUnread: n => { titleBadge('Host Dashboard — DISTANCE // ZERO')(n); const u = $('#unread'); u.hidden = !n; u.textContent = n + ' new'; } });
runClocks(() => S);
setInterval(() => S && tick(), 250);
setInterval(report, 10000); // keeps Vienna's view of this link (round-trip time) fresh

/* ---------- views ---------- */

function setView(v) {
  for (const name of ['show', 'check']) {
    $('#view-' + name).hidden = name !== v;
    $('#tab-' + name).setAttribute('aria-selected', String(name === v));
  }
  if (v !== 'check') stopCheck();
  watch();
  try { sessionStorage.setItem('dz-host-view', v); } catch {}
}
$$('.tab').forEach(t => t.addEventListener('click', () => setView(t.dataset.view)));
$('#goCheck').addEventListener('click', () => setView('check'));

/* ---------- status ---------- */

function renderStatus() {
  const ok = link.state === 'open', slow = ok && link.rtt > 600;
  const l = $('#linkLight');
  l.className = 'light ' + (ok ? (slow ? 'warn' : 'ok') : 'bad');
  l.textContent = ok ? `Vienna ${link.rtt ?? '–'} ms` : 'Vienna offline';
  const strip = $('#strip'), t = S?.tally;
  const downFor = downSince ? Date.now() - downSince : 0;
  if (!ok) {
    strip.className = 'strip bad';
    strip.textContent = !everOpen ? 'Connecting to the Vienna studio…'
      : downFor < 20000 ? 'Lost the link to Vienna. Reconnecting by itself… A call in progress keeps running for a moment.'
      : 'Still no link to Vienna. 1) Check your internet. 2) Reload this page. 3) Still nothing: message Andrej by phone; he may need to send you a new link.';
  }
  else if (S?.rehearsal?.active && !t?.onAir) { strip.className = 'strip rehearsal'; strip.textContent = 'Rehearsal // private, not on air. Nothing you say goes out.'; }
  else if (t?.onAir) { strip.className = 'strip live'; strip.textContent = '● On air // Vienna is streaming to YouTube. Everything you say can be heard.'; }
  else if (t && !t.obs) { strip.className = 'strip warn'; strip.textContent = 'Off air // Vienna\'s broadcast software is not connected yet.'; }
  else { strip.className = 'strip off'; strip.textContent = 'Off air // not streaming' + (t?.recording ? ' // Vienna is recording' : ''); }
  const air = $('#tallyAir');
  air.className = 'tally' + (t?.onAir ? ' on' : t?.recording ? ' rec on' : '');
  air.querySelector('span').textContent = t?.onAir ? 'ON AIR' : t?.recording ? 'REC' : 'OFF AIR';
}

const LEAD = { andrej: 'Andrej leads', georgie: 'You lead', both: 'Both of you' };
function render() {
  syncClock(S);
  script.render(S);
  const r0 = S.rundown;
  $('#hEp').textContent = [r0.title, r0.episode?.date && `${r0.episode.date}`].filter(Boolean).join(' · ');
  const lk = $('#hLock'); lk.textContent = r0.locked ? 'SCRIPT LOCKED — READY FOR BROADCAST' : ''; lk.className = 'badge ' + (r0.locked ? 'lock' : 'off'); lk.hidden = !r0.locked;
  renderHelp();
  $('#callBtn').disabled = !S.presence.director && call.phase === 'idle';
  const b = $('#andrejBadge'); b.className = 'badge ' + (S.presence.director ? 'live' : 'off'); b.textContent = S.presence.director ? 'Andrej online' : 'Offline';
  $('#vdoOpen').disabled = !S.vdo?.push;
  if (S.note !== lastNote) {
    const first = lastNote === null;
    lastNote = S.note;
    $('#cuePanel').hidden = !S.note;
    $('#cue').textContent = S.note;
    if (S.note && !first) { const c = $('#cue'); c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash'); toast('New instruction from Andrej'); }
  }
  const m = S.music;
  $('#music').textContent = m.title || m.artist ? `${m.artist}${m.artist && m.title ? ' — ' : ''}${m.title}${m.label ? ' [' + m.label + ']' : ''}` : 'Nothing set';

  const r = S.rundown, seg = r.segments[r.index], nxt = r.segments[r.index + 1];
  $('#heroWait').hidden = !!seg; $('#heroLive').hidden = !seg;
  if (seg) {
    $('#segTitle').textContent = seg.title;
    $('#segMeta').replaceChildren(`${String(r.index + 1).padStart(2, '0')} of ${r.segments.length} // ${seg.kind} // `, h('b', { class: seg.lead === 'georgie' ? 'mel' : seg.lead === 'andrej' ? 'vie' : '', text: LEAD[seg.lead] }));
    $('#segNotes').hidden = !seg.notes; $('#segNotes').textContent = seg.notes;
  }
  $('#nextTitle').textContent = nxt ? nxt.title : r.index >= 0 ? 'End of show' : (r.segments[0]?.title || '—');
  $('#nextMeta').textContent = nxt ? `${nxt.minutes} min // ${LEAD[nxt.lead]}` : r.index < 0 && r.segments[0] ? `${r.segments[0].minutes} min // ${LEAD[r.segments[0].lead]}` : '';
  renderRundown();
  renderStatus();
  tick();
}

function renderRundown() {
  const r = S.rundown;
  const badge = $('#roBadge');
  badge.className = 'badge ' + (r.sample ? 'sample' : 'live');
  badge.textContent = r.sample ? 'Sample' : `${r.segments.length} segments`;
  const key = JSON.stringify(r);
  if (key === roKey) return;
  roKey = key;
  const times = segmentTimes(S);
  $('#ro').replaceChildren(...r.segments.map((s, i) => h('li', { class: i < r.index ? 'done' : i === r.index ? 'cur' : i === r.index + 1 ? 'nxt' : '' },
    h('div', { class: 'r' },
      h('span', { class: 'i', text: String(i + 1).padStart(2, '0') }),
      h('span', { class: 't mel', text: clock('mel', times[i], false) }),
      h('span', { class: 't vie alt', text: clock('vie', times[i], false) }),
      h('span', { class: 'ti', text: s.title }),
      h('span', { class: 'k', text: s.kind }),
      h('span', { class: 'm', text: s.minutes + "'" })),
    cueLine(S, s) ? h('div', { class: 'cueline', text: cueLine(S, s) }) : null,
    s.notes || s.lead !== 'both' ? h('div', { class: 'read' }, h('span', { class: 'lead ' + s.lead, text: LEAD[s.lead] }), s.notes ? h('p', { text: s.notes }) : null) : null)));
  const total = r.segments.reduce((a, s) => a + s.minutes, 0);
  $('#roTotal').replaceChildren(h('span', { text: 'Times in Melbourne, then Vienna' }), h('span', { text: `${total} min` }));
}

function tick() {
  sclock.tick(S); bmons.tick(S); mons.update(S);
  renderSteps($('#hSteps'), nextSteps(S, 'host', serverNow()));
  const r = S.rundown, t = segmentTimer(S);
  if (!t) {
    const at = nextShow(S.show), now = Date.now();
    $('#waitLabel').textContent = now < at ? 'Next show starts in' : 'Show slot is now // waiting for Andrej';
    $('#countdown').textContent = now < at ? countdown(at - now) : '00:00:00';
    $('#when').textContent = `${day('mel', at)} ${clock('mel', at, false)} Melbourne // ${day('vie', at)} ${clock('vie', at, false)} Vienna`;
    return;
  }
  const set = (id, text, cls = '') => { const d = $(id); d.className = cls; d.querySelector('strong').textContent = text; };
  set('#tRemain', hms(t.remaining), t.remaining < 0 ? 'over' : t.remaining < 60000 ? 'near' : '');
  set('#tElapsed', hms(t.elapsed), 'sub');
  $('#segLabel').textContent = t.remaining < 0 ? 'On air now // over time' : t.remaining < 60000 ? 'On air now // wrap up' : 'On air now';
  $('#segProgress').classList.toggle('over', t.remaining < 0);
  $('#segProgress i').style.width = (t.ratio * 100).toFixed(2) + '%';
}

function alertBox(text) {
  const box = h('div', { class: 'alert', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': 'Message from Vienna' },
    h('div', {}, h('span', { class: 'label', text: 'Vienna' }), h('p', { text }), h('button', { class: 'b primary', type: 'button', text: 'Understood', onclick: () => box.remove() })));
  document.body.append(box);
  box.querySelector('button').focus();
}

/* ---------- camera & mic check: stays on this device ---------- */

const checks = {};
let stream = null, audioCtx = null, raf = 0, micPeak = -60;
try { Object.assign(checks, JSON.parse(localStorage.getItem('dz-host-checks') || '{}')); } catch {}
for (const cb of $$('#checks input')) {
  cb.checked = !!checks[cb.dataset.k];
  cb.addEventListener('change', () => { checks[cb.dataset.k] = cb.checked; save(); report(); });
}
$('#vdoJoined').checked = !!checks.vdo;
$('#vdoJoined').addEventListener('change', e => { checks.vdo = e.target.checked; save(); report(); });
function save() { try { localStorage.setItem('dz-host-checks', JSON.stringify(checks)); } catch {} }

const device = { camera: false, mic: false, cameraLabel: '', micLabel: '' };
let reportTimer = null;
function report() {
  summary();
  clearTimeout(reportTimer);
  reportTimer = setTimeout(() => {
    if (!conn.open) return;
    conn.send({ t: 'host.status', status: { ...device, headphones: !!checks.headphones, wired: !!checks.wired, light: !!checks.light, vdo: !!checks.vdo, rtt: link.rtt || 0 } }).catch(() => {});
  }, 300);
}
function summary() {
  const items = [device.camera, device.mic, checks.headphones, checks.wired, checks.light, checks.power, checks.vdo];
  const done = items.filter(Boolean).length;
  $('#checkSummary').textContent = done === items.length ? 'All done. You are ready.' : `${done} of ${items.length} done`;
  $('#dotCheck').hidden = done === items.length;
}

async function startCheck() {
  stopCheck();
  if (!navigator.mediaDevices?.getUserMedia) {
    $('#previewMsg').textContent = 'This browser cannot open the camera here. Use Chrome or Safari, and open the dashboard over https.';
    return;
  }
  const cam = $('#camSel').value, mic = $('#micSel').value;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: cam && cam !== 'Camera' ? { exact: cam } : undefined, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: { deviceId: mic && mic !== 'Microphone' ? { exact: mic } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch (e) {
    const why = e.name === 'NotAllowedError' ? 'Camera or microphone permission was blocked. Allow it in the browser address bar and try again.'
      : e.name === 'NotReadableError' ? 'Another app is using the camera or microphone. Close it and try again.'
      : e.name === 'NotFoundError' ? 'No camera or microphone found.' : e.message;
    $('#previewMsg').textContent = why;
    setBadge('bad', 'Problem');
    autoHelp('normal', 'camera-check', 'Georgie\'s camera/mic check failed: ' + e.name, { error: e.name });
    return;
  }
  const v = $('#video');
  v.srcObject = stream; v.hidden = false; $('#thirds').hidden = false; $('#previewMsg').hidden = true;
  $('#checkStop').hidden = false; $('#checkStart').textContent = 'Restart';
  await listDevices();
  const vt = stream.getVideoTracks()[0], at = stream.getAudioTracks()[0];
  const st = vt?.getSettings() || {};
  device.camera = !!vt; device.mic = false; device.cameraLabel = vt?.label || ''; device.micLabel = at?.label || '';
  $('#camInfo').textContent = vt ? `${st.width || '?'} × ${st.height || '?'}${st.frameRate ? ' @ ' + Math.round(st.frameRate) + ' fps' : ''}${st.height && st.height < 720 ? ' // low resolution, try another camera' : ''}` : '';
  micPeak = -60;
  if (at) meter(stream);
  setBadge('untested', 'Checking… say something');
  report();
}

function meter(s) {
  audioCtx = new AudioContext();
  const an = audioCtx.createAnalyser();
  an.fftSize = 1024;
  audioCtx.createMediaStreamSource(s).connect(an);
  const buf = new Float32Array(an.fftSize);
  let shown = 0;
  const loop = () => {
    an.getFloatTimeDomainData(buf);
    let peak = 0;
    for (const x of buf) peak = Math.max(peak, Math.abs(x));
    const dbv = peak > 0 ? Math.max(-60, 20 * Math.log10(peak)) : -60;
    $('#micLvl').style.setProperty('--lv', ((dbv + 60) / 60 * 100).toFixed(1) + '%');
    micPeak = Math.max(micPeak - 0.15, dbv);
    if (performance.now() - shown > 250) { shown = performance.now(); $('#micDb').textContent = micPeak > -60 ? micPeak.toFixed(0) + ' dB' : ''; }
    if (!device.mic && dbv > -45) {
      device.mic = true; report();
      setBadge('live', dbv > -3 ? 'OK // a bit loud' : 'Camera & mic OK');
    }
    raf = requestAnimationFrame(loop);
  };
  loop();
}

function stopCheck() {
  cancelAnimationFrame(raf);
  audioCtx?.close().catch(() => {}); audioCtx = null;
  stream?.getTracks().forEach(t => t.stop()); stream = null;
  const v = $('#video'); v.srcObject = null; v.hidden = true; $('#thirds').hidden = true;
  $('#previewMsg').hidden = false; $('#checkStop').hidden = true; $('#checkStart').textContent = 'Start check';
  $('#micLvl').style.setProperty('--lv', '0%');
}

async function listDevices() {
  const list = await navigator.mediaDevices.enumerateDevices();
  const fill = (sel, kind, current) => {
    const opts = list.filter(d => d.kind === kind);
    sel.replaceChildren(...opts.map((d, i) => h('option', { value: d.deviceId, text: d.label || `${kind === 'videoinput' ? 'Camera' : 'Microphone'} ${i + 1}` })));
    if (current) sel.value = current;
    sel.disabled = !opts.length;
  };
  fill($('#camSel'), 'videoinput', stream?.getVideoTracks()[0]?.getSettings().deviceId);
  fill($('#micSel'), 'audioinput', stream?.getAudioTracks()[0]?.getSettings().deviceId);
}

function setBadge(cls, text) { const b = $('#checkBadge'); b.className = 'badge ' + (cls || 'untested'); b.textContent = text; }

$('#checkStart').addEventListener('click', startCheck);
$('#checkStop').addEventListener('click', () => { stopCheck(); setBadge(device.mic && device.camera ? 'live' : 'off', device.mic && device.camera ? 'Camera & mic OK' : 'Not checked'); });
$('#camSel').addEventListener('change', startCheck);
$('#micSel').addEventListener('change', startCheck);
summary();

$('#vdoOpen').addEventListener('click', () => {
  stopCheck(); // free the camera before VDO.Ninja asks for it
  const w = window.open(S.vdo.push, 'dz-vdo');
  if (w) w.opener = null;
  else toast('Your browser blocked the new tab. Allow pop-ups for this page.', 'bad');
});

// last, once everything above exists
let startView = 'show';
try { startView = sessionStorage.getItem('dz-host-view') || 'show'; } catch {}
setView(startView);


/* ---------- private call with Vienna ---------- */

const call = createCall(conn, 'host', {
  getState: () => S, note,
  onProblem: (kind, text, diag) => autoHelp('urgent', kind, text, diag),
});
call.onPhase(p => {
  const b = $('#callBtn');
  b.textContent = p === 'idle' ? 'Call Vienna' : p === 'active' ? 'In call' : 'Calling…';
  b.classList.toggle('on', p !== 'idle');
  if (p !== 'idle') stopCheck(); // one camera user at a time
});
$('#callBtn').addEventListener('click', async () => {
  try { await call.start(); } catch (e) { toast(e.message, 'bad'); }
});

/* ---------- HELP: three levels, sent with the facts Vienna needs ---------- */

function diagnostics() {
  const nc = navigator.connection || {};
  const ua = navigator.userAgent;
  return {
    browser: /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : 'other',
    online: navigator.onLine, linkMs: link.rtt || 0, reconnects, network: nc.effectiveType || '', downlinkMbps: nc.downlink || 0,
    camera: device.camera, mic: device.mic, vdo: !!checks.vdo, headphones: !!checks.headphones,
    inCall: call.phase, screen: `${screen.width}×${screen.height}`, view: $('#view-check').hidden ? 'show' : 'check',
  };
}
const lastAuto = {};
function autoHelp(level, kind, text, extra = {}) {
  const now = Date.now();
  if (lastAuto[kind] && now - lastAuto[kind] < 60000) return; // at most one per minute per kind from here
  lastAuto[kind] = now;
  const send = () => conn.send({ t: 'help.raise', level, kind, text, auto: true, diag: { ...diagnostics(), ...extra } }).catch(() => {});
  if (conn.open) send(); else setTimeout(send, 3000);
}
window.addEventListener('error', e => autoHelp('normal', 'page-error', 'Georgie\'s dashboard hit a script error', { error: String(e.message).slice(0, 120) }));

const dlg = $('#helpDlg');
function openHelp() { dlg.hidden = false; $('#helpText').focus(); }
function closeHelp() { dlg.hidden = true; $('#helpForm').reset(); }
$('#helpOpen').addEventListener('click', openHelp);
$('#helpClose').addEventListener('click', closeHelp);
dlg.addEventListener('click', e => { if (e.target === dlg) closeHelp(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !dlg.hidden) closeHelp(); });
$$('#quickHelp button').forEach(b => b.addEventListener('click', () => { $('#helpText').value = b.textContent; }));
$('#helpForm').addEventListener('submit', async e => {
  e.preventDefault();
  const level = new FormData(e.target).get('level') || 'normal';
  const alsoCall = $('#helpCall').checked;
  try {
    await conn.send({ t: 'help.raise', level, text: $('#helpText').value, diag: diagnostics() });
    closeHelp();
    toast(level === 'critical' ? 'Critical help sent. Vienna is alerted.' : 'Help request sent to Vienna.', 'ok');
    if (alsoCall) call.start().catch(err => toast(err.message, 'bad'));
  } catch (err) { toast(err.message === 'Not connected to the studio' ? 'No link to Vienna right now. Use your phone: message Andrej directly.' : err.message, 'bad'); }
});

const LEVEL = { normal: 'Normal', urgent: 'Urgent', critical: 'Critical' };
function renderHelp() {
  const open = (S.help || []).filter(x => x.status !== 'resolved' && !x.auto);
  const box = $('#helpState');
  box.hidden = !open.length;
  if (!open.length) return;
  const x = open[0];
  box.className = 'card helpstate ' + x.level;
  box.replaceChildren(
    h('div', { class: 'card-h' }, h('h2', { text: `Help requested // ${LEVEL[x.level]}` }),
      h('div', { class: 'aside' }, h('span', { class: 'badge ' + (x.status === 'ack' ? 'live' : 'manual'), text: x.status === 'ack' ? 'Andrej has seen it' : 'Waiting for Andrej' }))),
    h('div', { class: 'card-b row' }, h('span', { class: 'grow', text: x.text || 'No details given' }),
      h('button', { type: 'button', class: 'b sm quiet', text: 'Withdraw', onclick: () => conn.send({ t: 'help.cancel', hid: x.hid }).catch(err => toast(err.message, 'bad')) })));
}

/* ---------- guided assistance pushed by Andrej ---------- */

const GUIDES = {
  camera: ['Camera', ['Close other apps that use the camera (Zoom, Teams, FaceTime, Photo Booth).', 'Open Pre-show check and press Start check. Pick your camera in the list.', 'If the browser asks, allow the camera. If it was blocked: click the camera icon in the address bar and choose Allow.', 'Still black? Reload this page.'], 'check'],
  audio: ['Sound', ['Put your headphones on and check they are the selected output on your computer.', 'Open Pre-show check: when you speak, the microphone level should move.', 'Pick the right microphone in the list. Make sure the mic is not muted on the headset itself.', 'In VDO.Ninja, check the same microphone is chosen.'], 'check'],
  vdo: ['VDO.Ninja', ['Go back to your VDO.Ninja tab. If it is gone: Pre-show check → Open studio link.', 'Allow camera and microphone and press Start.', 'Keep that tab open and in front for a few seconds while it connects.'], 'check'],
  network: ['Internet', ['Pause anything that uploads or streams (cloud backup, Netflix, other calls).', 'Move closer to the Wi-Fi, or plug in the Ethernet cable.', 'Turn off any VPN.'], null],
  reload: ['Reload', ['Andrej asks you to reload this page. Your login stays, nothing is lost.'], 'reload'],
  hold: ['Hold', ['Stay where you are and keep smiling: you may be on air.', 'Andrej is fixing something in Vienna. Wait for his cue in the chat or on the call.'], null],
};
function assistCard({ guide, text }) {
  $('.assist')?.remove();
  const [title, steps, action] = GUIDES[guide] || ['From Andrej', [], null];
  const box = h('div', { class: 'assist', role: 'alertdialog', 'aria-modal': 'false', 'aria-label': 'Guidance from Andrej' },
    h('div', {},
      h('span', { class: 'label', text: 'Guidance from Andrej' }),
      h('h2', { class: 'display', text: title }),
      text ? h('p', { class: 'cue', text }) : null,
      steps.length ? h('ol', { class: 'steps' }, ...steps.map(t => h('li', { text: t }))) : null,
      h('div', { class: 'row end mt' },
        action === 'check' ? h('button', { type: 'button', class: 'b', text: 'Open pre-show check', onclick: () => { setView('check'); } }) : null,
        action === 'reload' ? h('button', { type: 'button', class: 'b primary', text: 'Reload now', onclick: () => location.reload() }) : null,
        h('button', { type: 'button', class: 'b quiet', text: 'Still broken', onclick: () => {
          conn.send({ t: 'help.raise', level: 'urgent', text: `Still broken after the ${title} guide`, diag: diagnostics() }).catch(() => {});
          box.remove(); toast('Vienna knows it is still broken.', 'ok');
        } }),
        h('button', { type: 'button', class: 'b primary', text: 'Done, it works', onclick: () => {
          conn.send({ t: 'chat.send', text: `✓ ${title}: fixed` }).catch(() => {});
          box.remove();
        } }))));
  document.body.append(box);
  box.querySelector('.b.primary')?.focus();
}


/* ---------- rehearsal checks asked for by Vienna ---------- */

function checkCard(items) {
  $('.assist')?.remove();
  setView('show');
  const steps = [];
  const line = (title, text, button) => { const res = h('span', { class: 'res' }); steps.push(h('li', {}, h('div', {}, h('strong', { text: title }), h('span', { class: 'hint', text })), res, button)); return res; };
  if (items.includes('camera')) {
    const btn = h('button', { type: 'button', class: 'b sm primary', text: 'Test now' });
    const res = line('Camera & microphone', 'Your browser asks for permission: allow it. Then say a few words.', btn);
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = 'Say something…'; stopCheck();
      const r = await testDevices({ ms: 7000 });
      device.camera = r.camera.ok; device.mic = r.mic.ok; device.cameraLabel = r.camera.detail; device.micLabel = r.mic.detail; report();
      await conn.send({ t: 'check.result', check: 'camera', ok: r.camera.ok, detail: r.camera.detail }).catch(() => {});
      await conn.send({ t: 'check.result', check: 'mic', ok: r.mic.ok, detail: r.mic.detail }).catch(() => {});
      res.textContent = `${r.camera.ok ? '✓' : '✗'} camera  ${r.mic.ok ? '✓' : '✗'} mic`; res.className = 'res ' + (r.camera.ok && r.mic.ok ? 'ok' : 'bad');
      btn.textContent = 'Test again'; btn.disabled = false;
      if (!r.camera.ok || !r.mic.ok) res.title = [r.camera.detail, r.mic.detail].join(' · ');
    });
  }
  if (items.includes('playback')) {
    const wrap = h('span', { class: 'row' });
    const res = line('Sound on your headphones', 'Press play: you should hear two soft notes.', wrap);
    const answer = ok => { conn.send({ t: 'check.result', check: 'playback', ok, detail: ok ? 'tone heard' : 'tone NOT heard' }).catch(() => {}); res.textContent = ok ? '✓ heard' : '✗ not heard'; res.className = 'res ' + (ok ? 'ok' : 'bad'); draw(); };
    const draw = asked => wrap.replaceChildren(...(asked ? [h('span', { class: 'hint', text: 'Heard it?' }), h('button', { type: 'button', class: 'b sm primary', text: 'Yes', onclick: () => answer(true) }), h('button', { type: 'button', class: 'b sm danger', text: 'No', onclick: () => answer(false) })]
      : [h('button', { type: 'button', class: 'b sm primary', text: 'Play tone', onclick: async () => { await playTone(); draw(true); } })]));
    draw(false);
  }
  if (items.includes('help')) {
    const btn = h('button', { type: 'button', class: 'b sm primary', text: 'Send test HELP' });
    const res = line('HELP button', 'Sends a test request to Vienna. Andrej answers it with "Seen".', btn);
    btn.addEventListener('click', async () => {
      try { await conn.send({ t: 'help.raise', level: 'normal', kind: 'test', text: 'Rehearsal test from Melbourne', diag: diagnostics() }); res.textContent = '✓ sent, waiting for Seen'; res.className = 'res ok'; btn.disabled = true; }
      catch (e) { res.textContent = '✗ ' + e.message; res.className = 'res bad'; }
    });
  }
  if (items.includes('screen')) {
    const btn = h('button', { type: 'button', class: 'b sm primary', text: call.phase === 'idle' ? 'Call Vienna' : 'In call' });
    line('Screen sharing', 'In the call window press "Share screen", pick a window, then "Stop sharing" after a few seconds.', btn);
    btn.addEventListener('click', () => { if (call.phase === 'idle') call.start().catch(e => toast(e.message, 'bad')); });
  }
  const box = h('div', { class: 'assist check-card', role: 'dialog', 'aria-label': 'Rehearsal check from Vienna' },
    h('div', {},
      h('span', { class: 'label', text: 'Rehearsal check from Vienna' }),
      h('h2', { class: 'display', text: 'Quick checks' }),
      h('p', { class: 'hint', text: 'Nothing is recorded. Vienna only sees whether each check worked.' }),
      h('ol', { class: 'checksteps' }, ...steps),
      h('div', { class: 'row end mt' }, h('button', { type: 'button', class: 'b primary', text: 'Done', onclick: () => box.remove() }))));
  document.body.append(box);
}
