// Host Dashboard (Georgie, Melbourne). Read-only show information, private talkback, and a local
// camera/mic check. This page has no OBS or broadcast controls, and the server refuses them for this role anyway.
import { $, $$, h, hms, connect, checkSignedIn, runClocks, segmentTimes, segmentTimer, clock, day, nextShow, countdown, toast, chatPanel, titleBadge } from './common.js';

let S = null, link = { state: 'connecting' }, everOpen = false, lastNote = null, roKey = '';

const conn = connect({ onStatus: st => {
  link = st;
  if (st.state === 'open') { everOpen = true; report(); }
  else if (!everOpen && st.state === 'closed') checkSignedIn();
  renderStatus();
} });
conn.on('state', ({ s }) => { S = s; render(); });
conn.on('alert', ({ text }) => alertBox(text));
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
  if (!ok) { strip.className = 'strip bad'; strip.textContent = everOpen ? 'Lost the link to Vienna. Reconnecting… Keep your VDO.Ninja tab open; your camera is not affected.' : 'Connecting to the Vienna studio…'; }
  else if (t?.onAir) { strip.className = 'strip live'; strip.textContent = '● On air // Vienna is streaming to YouTube. Everything you say can be heard.'; }
  else if (t && !t.obs) { strip.className = 'strip warn'; strip.textContent = 'Off air // Vienna\'s broadcast software is not connected yet.'; }
  else { strip.className = 'strip off'; strip.textContent = 'Off air // not streaming' + (t?.recording ? ' // Vienna is recording' : ''); }
  const air = $('#tallyAir');
  air.className = 'tally' + (t?.onAir ? ' on' : t?.recording ? ' rec on' : '');
  air.querySelector('span').textContent = t?.onAir ? 'ON AIR' : t?.recording ? 'REC' : 'OFF AIR';
}

const LEAD = { andrej: 'Andrej leads', georgie: 'You lead', both: 'Both of you' };
function render() {
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
    s.notes || s.lead !== 'both' ? h('div', { class: 'read' }, h('span', { class: 'lead ' + s.lead, text: LEAD[s.lead] }), s.notes ? h('p', { text: s.notes }) : null) : null)));
  const total = r.segments.reduce((a, s) => a + s.minutes, 0);
  $('#roTotal').replaceChildren(h('span', { text: 'Times in Melbourne, then Vienna' }), h('span', { text: `${total} min` }));
}

function tick() {
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
