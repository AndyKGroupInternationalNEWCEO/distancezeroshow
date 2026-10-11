// Private video/audio call between Andrej and Georgie (WebRTC), shared by both dashboards.
// The studio server only relays the call set-up; audio and video go browser to browser, encrypted
// (DTLS-SRTP), and never into OBS. A floating panel shows the other person, your own picture,
// and controls for microphone, camera, screen sharing and hang-up.
import { h, hms, toast } from './common.js';

const NAME = { director: 'Andrej', host: 'Georgie' };
const CITY = { director: 'Vienna', host: 'Melbourne' };
const DEFAULT_ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];

export function createCall(conn, me, { getState = () => null, onProblem = () => {}, note = null } = {}) {
  const peerRole = me === 'director' ? 'host' : 'director';
  let pc = null, cid = null, phase = 'idle', local = null, cam = null, screen = null, pending = [], startedAt = 0;
  let statsTimer = 0, clockTimer = 0, restarted = false, ringer = null, iAmCaller = false, peerScreen = false;
  const media = { mic: true, cam: true, screen: false };
  const listeners = new Set();

  /* ---------- panel ---------- */
  const remoteV = h('video', { class: 'rv', autoplay: true, playsinline: true });
  const localV = h('video', { class: 'lv', autoplay: true, playsinline: true, muted: true });
  localV.muted = true;
  const title = h('strong', { text: '' }), status = h('span', { class: 'cs', text: '' }), timer = h('span', { class: 'ct num', text: '' });
  const peerFlags = h('span', { class: 'pf', text: '' }), quality = h('span', { class: 'cq', text: '' });
  const btn = (label, cls, fn, aria) => h('button', { type: 'button', class: 'cb ' + cls, onclick: fn, 'aria-label': aria || label }, label);
  const bMic = btn('Mic', 'mic', () => toggle('mic'), 'Mute or unmute your microphone');
  const bCam = btn('Camera', 'cam', () => toggle('cam'), 'Turn your camera off or on');
  const bScr = btn('Share screen', 'scr', () => shareScreen(), 'Share your screen');
  const bBig = btn('⤢', 'big', () => panel.classList.toggle('large'), 'Larger video');
  const bSide = btn('⇆', 'big', () => panel.classList.toggle('left'), 'Move the call window to the other side');
  const bEnd = btn('Hang up', 'end', () => hangup());
  const bAccept = btn('Accept', 'accept', () => accept());
  const bDecline = btn('Decline', 'decline', () => decline());
  const stage = h('div', { class: 'stage' }, remoteV, localV, h('div', { class: 'waiting' }, h('span', { class: 'ring-dot' }), h('span', { class: 'wt', text: '' })));
  const panel = h('section', { class: 'callpanel', role: 'dialog', 'aria-label': `Private call with ${NAME[peerRole]}`, hidden: true },
    h('header', {}, h('div', {}, title, h('span', { class: 'meta' }, status, timer)), bSide, bBig),
    stage,
    h('div', { class: 'cinfo' }, peerFlags, quality),
    h('div', { class: 'ctrls inc' }, bMic, bCam, bScr, bEnd),
    h('div', { class: 'ctrls ringing' }, bDecline, bAccept));
  document.body.append(panel);

  function setPhase(p, text = '') {
    phase = p;
    panel.hidden = p === 'idle';
    panel.dataset.phase = p;
    title.textContent = p === 'ringing-in' ? `${NAME[peerRole]} is calling` : `${NAME[peerRole]} // ${CITY[peerRole]}`;
    status.textContent = text;
    panel.querySelector('.wt').textContent = p === 'ringing-in' ? 'Incoming private call' : p === 'calling' ? `Calling ${NAME[peerRole]}…` : p === 'connecting' ? 'Connecting…' : '';
    for (const f of listeners) f(p);
  }

  /* ---------- media ---------- */
  async function getLocal() {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } });
    } catch (e) {
      // no camera, or the camera is busy (e.g. in VDO.Ninja): fall back to an audio-only call
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        toast('Camera not available, the call is audio only. (' + e.name + ')', 'bad');
        return s;
      } catch (e2) {
        onProblem('call-media', e2.name === 'NotAllowedError' ? 'Microphone permission blocked for the call' : 'No microphone for the call: ' + e2.name, { error: e2.name });
        throw new Error(e2.name === 'NotAllowedError' ? 'Allow camera and microphone for this page in the browser, then try again.' : 'No microphone available: ' + e2.message);
      }
    }
  }

  function makePc() {
    const ice = getState()?.ice?.length ? getState().ice : DEFAULT_ICE;
    pc = new RTCPeerConnection({ iceServers: ice });
    for (const t of local.getTracks()) pc.addTrack(t, local);
    if (!local.getVideoTracks().length) pc.addTransceiver('video', { direction: 'recvonly' });
    pc.ontrack = e => { if (remoteV.srcObject !== e.streams[0]) remoteV.srcObject = e.streams[0] || new MediaStream([e.track]); };
    pc.onicecandidate = e => { if (e.candidate) conn.send({ t: 'call.signal', cid, candidate: e.candidate.toJSON() }).catch(() => {}); };
    pc.onconnectionstatechange = () => {
      const s = pc?.connectionState;
      if (!s) return;
      if (s === 'connected') { if (!startedAt) startedAt = Date.now(); setPhase('active', 'Connected'); restarted = false; }
      else if (s === 'disconnected') status.textContent = 'Connection unstable…';
      else if (s === 'failed') {
        if (iAmCaller && !restarted) { restarted = true; status.textContent = 'Reconnecting…'; pc.restartIce(); offer(); }
        else if (!iAmCaller && !restarted) { restarted = true; status.textContent = 'Reconnecting…'; }
        else {
          onProblem('call-failed', 'The private call could not connect (network blocks a direct connection)', { state: s });
          if (cid) conn.send({ t: 'call.end', cid, reason: 'network' }).catch(() => {});
          cleanup();
          note?.show({ level: 'warn', kind: 'call-drop', title: 'Call could not hold', text: 'The networks blocked the call. Try once more; if it fails again, use talkback and VDO.Ninja.',
            actions: [{ label: 'Call again', fn: () => start().catch(e => toast(e.message, 'bad')) }] });
        }
      }
    };
  }

  async function offer() {
    const o = await pc.createOffer();
    await pc.setLocalDescription(o);
    await conn.send({ t: 'call.signal', cid, sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
  }

  /* ---------- signalling ---------- */
  conn.on('call.ring', m => {
    if (phase !== 'idle') return;
    cid = m.cid; iAmCaller = false;
    setPhase('ringing-in', m.video ? 'Video call' : 'Audio call');
    ring(true);
  });
  conn.on('call.accepted', async m => {
    if (m.cid !== cid || phase !== 'calling') return;
    ring(false);
    setPhase('connecting', 'Connecting…');
    makePc();
    await offer().catch(e => toast(e.message, 'bad'));
  });
  conn.on('call.signal', async m => {
    if (m.cid !== cid || !pc) return;
    try {
      if (m.sdp) {
        await pc.setRemoteDescription(m.sdp);
        for (const c of pending.splice(0)) await pc.addIceCandidate(c).catch(() => {});
        if (m.sdp.type === 'offer') {
          await pc.setLocalDescription(await pc.createAnswer());
          await conn.send({ t: 'call.signal', cid, sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
        }
      } else if (m.candidate) {
        if (pc.remoteDescription) await pc.addIceCandidate(m.candidate).catch(() => {});
        else pending.push(m.candidate);
      }
    } catch (e) { toast('Call set-up error: ' + e.message, 'bad'); }
  });
  conn.on('call.peer', m => {
    if (m.cid !== cid) return;
    status.textContent = m.state === 'reconnecting' ? `${NAME[peerRole]}'s studio link is recovering… (call continues)` : 'Connected';
  });
  // our own studio connection came back: re-attach to the call (the media itself never stopped)
  conn.on('open', () => {
    if (!cid || phase === 'idle') return;
    if (phase === 'ringing-in' || phase === 'calling') { cleanup(); return; }
    conn.send({ t: 'call.resume', cid }).then(() => { status.textContent = 'Connected'; },
      () => { cleanup(); note?.show({ level: 'warn', kind: 'call-drop', title: 'Call ended', text: 'The call ended while the studio link was down.', actions: [{ label: 'Call again', fn: () => start().catch(e => toast(e.message, 'bad')) }] }); });
  });
  // reloading or closing the page ends the call cleanly instead of leaving it hanging for the grace period
  window.addEventListener('pagehide', () => { if (cid && phase !== 'idle') conn.send({ t: 'call.end', cid, reason: 'reload' }).catch(() => {}); });
  conn.on('call.media', m => {
    if (m.cid !== cid) return;
    peerScreen = !!m.screen;
    const f = [];
    if (!m.mic) f.push(`${NAME[peerRole]} is muted`);
    if (!m.cam && !m.screen) f.push('camera off');
    if (m.screen) f.push(`${NAME[peerRole]} is sharing the screen`);
    peerFlags.textContent = f.join(' // ');
    panel.classList.toggle('peer-screen', !!m.screen);
  });
  conn.on('call.end', m => {
    if (m.cid !== cid) return;
    // the studio sends a notification with the reason; a dropped call gets a "Call again" there
    if (!note && phase !== 'idle') toast('Call ended' + (m.reason && m.reason !== 'hung up' ? ': ' + m.reason : ''));
    cleanup();
  });

  /* ---------- actions ---------- */
  async function start() {
    if (phase !== 'idle') { panel.hidden = false; return; }
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) throw new Error('This browser cannot make calls. Use Chrome or Safari over https.');
    iAmCaller = true;
    setPhase('calling', 'Getting camera…');
    try {
      local = await getLocal(); cam = local.getVideoTracks()[0] || null;
      localV.srcObject = local;
      const r = await conn.send({ t: 'call.start', video: !!cam });
      cid = r.cid;
      setPhase('calling', 'Ringing…');
      ring(true, true);
    } catch (e) { cleanup(); throw e; }
  }
  async function accept() {
    if (phase !== 'ringing-in') return;
    ring(false);
    setPhase('connecting', 'Getting camera…');
    try {
      local = await getLocal(); cam = local.getVideoTracks()[0] || null;
      localV.srcObject = local;
      makePc(); // ready before the offer arrives
      await conn.send({ t: 'call.accept', cid });
      setPhase('connecting', 'Connecting…');
    } catch (e) { toast(e.message, 'bad'); conn.send({ t: 'call.decline', cid }).catch(() => {}); cleanup(); }
  }
  function decline() { if (cid) conn.send({ t: 'call.decline', cid }).catch(() => {}); cleanup(); }
  function hangup() { if (cid) conn.send({ t: 'call.end', cid }).catch(() => {}); cleanup(); }

  function toggle(kind) {
    if (!local) return;
    if (kind === 'mic') { media.mic = !media.mic; local.getAudioTracks().forEach(t => { t.enabled = media.mic; }); }
    if (kind === 'cam' && cam) { media.cam = !media.cam; cam.enabled = media.cam; }
    paintButtons(); sendMedia();
  }
  async function shareScreen() {
    if (!pc) return;
    const sender = pc.getSenders().find(s => s.track?.kind === 'video') || pc.getTransceivers().find(t => t.receiver.track.kind === 'video')?.sender;
    if (media.screen) return stopScreen(sender);
    if (!navigator.mediaDevices.getDisplayMedia) return toast('Screen sharing is not available in this browser.', 'bad');
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15 } }, audio: false });
      screen = s.getVideoTracks()[0];
      screen.onended = () => stopScreen(sender);
      if (sender) {
        if (sender.track || !cam) await sender.replaceTrack(screen);
        if (!cam) { // audio-only call: the video line was receive-only, so switch it on
          const tr = pc.getTransceivers().find(t => t.sender === sender);
          if (tr) { tr.direction = 'sendrecv'; await offer(); }
        }
      }
      localV.srcObject = new MediaStream([screen]);
      panel.classList.add('me-screen');
      media.screen = true; paintButtons(); sendMedia();
    } catch (e) { if (e.name !== 'NotAllowedError') toast('Screen sharing failed: ' + e.message, 'bad'); }
  }
  async function stopScreen(sender) {
    if (!media.screen) return;
    screen?.stop(); screen = null;
    if (sender) await sender.replaceTrack(cam || null).catch(() => {});
    localV.srcObject = local;
    panel.classList.remove('me-screen');
    media.screen = false; paintButtons(); sendMedia();
  }
  function sendMedia() { if (cid && phase !== 'idle') conn.send({ t: 'call.media', cid, ...media, cam: media.cam && !!cam }).catch(() => {}); }
  function paintButtons() {
    bMic.textContent = media.mic ? 'Mic' : 'Mic off'; bMic.classList.toggle('off', !media.mic);
    bCam.textContent = !cam ? 'No camera' : media.cam ? 'Camera' : 'Camera off'; bCam.classList.toggle('off', !media.cam || !cam); bCam.disabled = !cam;
    bScr.textContent = media.screen ? 'Stop sharing' : 'Share screen'; bScr.classList.toggle('on', media.screen);
  }

  /* ---------- quality: measured every 3 s, shown here and reported to Vienna ---------- */
  async function stats() {
    if (!pc || phase !== 'active') return;
    const r = await pc.getStats();
    let pair, rtt = 0, kbps = 0, fps = 0, lost = 0, route = '';
    r.forEach(s => { if (s.type === 'transport' && s.selectedCandidatePairId) pair = r.get(s.selectedCandidatePairId); });
    if (!pair) r.forEach(s => { if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') pair = s; });
    if (pair) {
      rtt = Math.round((pair.currentRoundTripTime || 0) * 1000);
      kbps = Math.round((pair.availableOutgoingBitrate || 0) / 1000);
      const lc = r.get(pair.localCandidateId), rc = r.get(pair.remoteCandidateId);
      route = lc?.candidateType === 'relay' || rc?.candidateType === 'relay' ? 'relay (TURN)' : lc?.candidateType === 'host' && rc?.candidateType === 'host' ? 'direct (same network)' : 'direct (peer-to-peer)';
    }
    r.forEach(s => { if (s.type === 'inbound-rtp' && s.kind === 'video') { fps = Math.round(s.framesPerSecond || 0); lost += s.packetsLost || 0; } if (s.type === 'inbound-rtp' && s.kind === 'audio') lost += s.packetsLost || 0; });
    quality.textContent = `${route} · ${rtt} ms · ${fps} fps${lost ? ' · lost ' + lost : ''}`;
    quality.className = 'cq ' + (rtt > 500 ? 'bad' : rtt > 250 ? 'warn' : 'ok');
    conn.send({ t: 'call.stats', cid, stats: { rtt, kbps, fps, lost, route, peerScreen } }).catch(() => {});
  }

  /* ---------- ringing tone (WebAudio, no files) ---------- */
  function ring(on, outgoing = false) {
    clearInterval(ringer); ringer = null;
    if (!on) return;
    const beep = () => {
      try {
        const ac = ring.ac ||= new AudioContext();
        const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
        o.frequency.value = outgoing ? 425 : 660; o.connect(g); g.connect(ac.destination);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(outgoing ? 0.05 : 0.12, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
        o.start(t); o.stop(t + 0.65);
      } catch {}
    };
    beep(); ringer = setInterval(beep, outgoing ? 3000 : 1500);
  }

  function cleanup() {
    ring(false);
    clearInterval(statsTimer); clearInterval(clockTimer);
    try { pc?.close(); } catch {}
    pc = null; cid = null; startedAt = 0; restarted = false; pending = []; peerScreen = false;
    screen?.stop(); screen = null;
    local?.getTracks().forEach(t => t.stop()); local = null; cam = null;
    remoteV.srcObject = null; localV.srcObject = null;
    Object.assign(media, { mic: true, cam: true, screen: false });
    peerFlags.textContent = ''; quality.textContent = ''; timer.textContent = '';
    panel.classList.remove('large', 'peer-screen', 'me-screen');
    paintButtons();
    setPhase('idle');
  }

  listeners.add(p => {
    if (p === 'active') {
      clearInterval(statsTimer); statsTimer = setInterval(() => stats().catch(() => {}), 3000);
      clearInterval(clockTimer); clockTimer = setInterval(() => { timer.textContent = startedAt ? ' · ' + hms(Date.now() - startedAt) : ''; }, 1000);
      sendMedia();
    }
  });
  paintButtons();

  return {
    start, hangup, accept,
    get phase() { return phase; },
    onPhase(f) { listeners.add(f); },
    pc: () => pc,
  };
}
