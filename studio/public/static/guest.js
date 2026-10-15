// Guest page (THIRD SEAT). An invited guest joins with their private link: a waiting room with a camera and
// microphone check, an optional still preview for the studio, the program picture, and — once the Director admits
// them — the studio camera link. Nothing here can control the show; the server allows only these few messages.
import { $, connect, toast } from './common.js';
import { nextSteps, renderSteps } from './steps.js';
import { renderFxPads } from './fxpads.js';

const inv = new URLSearchParams(location.hash.slice(1)).get('invite');
if (inv) {
  history.replaceState(null, '', '/guest');          // the invitation never stays in the address bar
  const r = await fetch('/guest/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invite: inv }) }).catch(() => null);
  const j = await r?.json().catch(() => null);
  if (!j?.ok) { $('#gState').textContent = 'Invitation not valid'; $('#gLine').textContent = j?.error || 'Could not reach the studio.'; }
}

let S = null, stream = null, snapTimer = 0, meterRaf = 0;
const STATE = {
  invited: ['WAITING ROOM', 'You are in the waiting room. Check your camera and microphone; the studio will let you in.'],
  waiting: ['WAITING ROOM', 'You are in the waiting room. Check your camera and microphone; the studio will let you in.'],
  backstage: ['BACKSTAGE — NOT ON AIR', 'The studio let you in. Open the studio camera below. Viewers cannot see or hear you yet.'],
  onair: ['ON AIR', 'You are live. Viewers can see and hear you.'],
};
const conn = connect({ query: '?as=guest', onStatus: st => {
  if (st.state === 'open') conn.send({ t: 'monitors', on: true }).catch(() => {});
  if (st.state === 'closed' && !S) { $('#gState').textContent = 'Invitation not valid'; $('#gLine').textContent = 'Ask the studio for a new link.'; }
} });
conn.on('state', ({ s }) => { S = s; render(); });
conn.on('frame', f => { if (f.which === 'program' && f.img) { const i = $('#gProg'); i.src = f.img; i.hidden = false; $('#gProgMsg').hidden = true; } });

function render() {
  const g = S.guest, st = nextSteps(S, 'guest');
  renderSteps($('#gSteps'), st);
  renderFxPads($('#gFxPads'), $('#gFxCard'), S.fx, conn);
  $('#gStart').classList.toggle('due', st.due === 'check' && !stream);
  $('#gOpen').classList.toggle('due', st.due === 'open');
  if (!g) { $('#gState').textContent = 'Invitation ended'; $('#gLine').textContent = 'Thank you. You can close this page.'; stopCheck(); return; }
  const [t, line] = STATE[g.status] || STATE.waiting;
  $('#gState').textContent = t; $('#gLine').textContent = line;
  document.body.dataset.status = g.status;
  $('#gJoin').hidden = !g.push;
  const air = $('#gTally'); const me = g.status === 'onair';
  air.className = 'tally' + (me ? ' on' : ''); air.querySelector('span').textContent = me ? 'YOU ARE ON AIR' : 'YOU ARE OFF AIR';
}
$('#gOpen').addEventListener('click', () => { const w = S?.guest?.push && window.open(S.guest.push, 'dz-guest-cam'); if (w) w.opener = null; else toast('The browser blocked the new tab. Allow pop-ups and try again.', 'bad'); });

/* camera + microphone check: stays on this computer; only a small still picture is sent, and only if allowed */
$('#gStart').addEventListener('click', async () => {
  if (stream) return stopCheck();
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true });
  } catch (e) { $('#gCamInfo').textContent = 'Camera or microphone blocked: allow them in the browser and try again.'; report(false, false); return; }
  const v = $('#gVideo'); v.srcObject = stream; $('#gVideoMsg').hidden = true;
  $('#gStart').textContent = 'Stop check';
  const vt = stream.getVideoTracks()[0], st = vt?.getSettings() || {};
  $('#gCamInfo').textContent = `${vt?.label || 'Camera'} · ${st.width || '?'}×${st.height || '?'}`;
  const ac = new AudioContext(), an = ac.createAnalyser(); ac.createMediaStreamSource(stream).connect(an);
  const buf = new Float32Array(an.fftSize); let heard = false;
  const meter = () => { an.getFloatTimeDomainData(buf); let p = 0; for (const x of buf) p = Math.max(p, Math.abs(x));
    $('#gLvl i').style.setProperty('--lv', Math.min(100, p * 140) + '%'); if (p > 0.02 && !heard) { heard = true; report(true, true); } meterRaf = requestAnimationFrame(meter); };
  meter();
  report(!!vt, false);
  clearInterval(snapTimer); snapTimer = setInterval(snap, 3000);
});
function report(camera, mic) {
  const b = $('#gCheckBadge'); b.textContent = camera && mic ? 'Camera + microphone OK' : camera ? 'Camera OK · speak to test the microphone' : 'Not working';
  b.className = 'badge ' + (camera && mic ? 'live' : camera ? 'untested' : 'bad');
  conn.send({ t: 'guest.check', camera, mic }).catch(() => {});
}
function snap() {
  if (!stream || !$('#gShare').checked) return;
  const v = $('#gVideo'); if (!v.videoWidth) return;
  const c = document.createElement('canvas'); c.width = 320; c.height = Math.round(320 * v.videoHeight / v.videoWidth);
  c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
  conn.send({ t: 'guest.snapshot', img: c.toDataURL('image/jpeg', 0.6) }).catch(() => {});
}
function stopCheck() {
  clearInterval(snapTimer); cancelAnimationFrame(meterRaf);
  stream?.getTracks().forEach(t => t.stop()); stream = null;
  $('#gVideo').srcObject = null; $('#gVideoMsg').hidden = false; $('#gStart').textContent = 'Start check';
}
