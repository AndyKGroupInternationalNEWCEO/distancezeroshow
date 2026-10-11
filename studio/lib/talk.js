// Director ↔ host communication beyond chat:
//   - private video/audio calls (WebRTC). This server only relays the call set-up (offer/answer/ICE) between
//     the two signed-in people; the audio and video go browser to browser, DTLS-SRTP encrypted, never via OBS.
//   - HELP requests from Georgie in three levels (normal, urgent, critical), raised by hand or automatically
//     by her dashboard, plus automatic requests raised here (her dashboard dropping while the show is live).
//   - guided assistance: Andrej pushes a step-by-step help card to Georgie's screen.
import crypto from 'node:crypto';

const LEVELS = ['normal', 'urgent', 'critical'];
const GUIDES = ['camera', 'audio', 'vdo', 'network', 'reload', 'hold', 'custom'];
const RING_MS = 45000;
const str = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
const other = role => (role === 'director' ? 'host' : 'director');
const NAME = { director: 'Andrej', host: 'Georgie' };

function cleanDiag(d) {
  const out = {};
  if (!d || typeof d !== 'object') return out;
  for (const [k, v] of Object.entries(d).slice(0, 24)) {
    const key = str(k, 32);
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = v;
    else if (typeof v === 'boolean') out[key] = v;
    else if (v != null) out[key] = str(v, 160);
  }
  return out;
}

export function createTalk({ state, clients, obs, changed, logEvent }) {
  state.help ??= [];
  let call = null; // { cid, from, caller, callee, phase: 'ringing'|'active', startedAt, ringTimer }
  const helpLimit = [];

  const toRole = (role, msg) => { for (const c of clients) if (c.role === role) c.send(msg); };
  const peerOf = client => (client === call?.caller ? call.callee : client === call?.callee ? call.caller : null);

  function endCall(reason, by) {
    if (!call) return;
    const c = call; call = null;
    clearTimeout(c.ringTimer);
    const msg = { t: 'call.end', cid: c.cid, reason };
    c.caller?.send(msg);
    if (c.callee) c.callee.send(msg); else toRole(other(c.from), msg);
    const secs = c.startedAt ? Math.round((Date.now() - c.startedAt) / 1000) : 0;
    logEvent(reason === 'connection lost' ? 'warn' : 'ok', `Call ${c.phase === 'active' ? `ended after ${secs} s` : 'not answered'} (${reason}${by ? ', ' + NAME[by] : ''})`);
    changed();
  }

  function raiseHelp({ level, text, auto = false, kind = '', diag = {}, by = 'host' }) {
    const now = Date.now();
    // automatic requests of the same kind are folded together, so a flapping link cannot flood the director
    if (auto && kind) {
      const same = state.help.find(h => h.auto && h.kind === kind && h.status !== 'resolved' && now - h.at < 120000);
      if (same) {
        same.count = (same.count || 1) + 1; same.at = now; same.diag = diag;
        if (LEVELS.indexOf(level) > LEVELS.indexOf(same.level)) same.level = level;
        toRole('director', { t: 'help.new', item: same, repeat: true });
        changed();
        return same;
      }
    }
    const item = { hid: crypto.randomBytes(5).toString('hex'), level, text, auto, kind, diag, by, at: now, status: 'open', count: 1 };
    state.help.unshift(item);
    state.help = state.help.slice(0, 60);
    toRole('director', { t: 'help.new', item });
    logEvent(level === 'normal' ? 'warn' : 'bad', `HELP ${level.toUpperCase()}${auto ? ' (automatic)' : ''}: ${text || kind}`);
    changed();
    return item;
  }

  async function handle(client, msg) {
    const { role } = client;
    switch (msg.t) {
      /* ----- calls ----- */
      case 'call.start': {
        if (call) throw new Error('A call is already running');
        if (![...clients].some(c => c.role === other(role))) throw new Error(`${NAME[other(role)]} is not online`);
        call = { cid: crypto.randomBytes(6).toString('hex'), from: role, caller: client, callee: null, phase: 'ringing', startedAt: 0, video: msg.video !== false };
        call.ringTimer = setTimeout(() => endCall('no answer'), RING_MS);
        toRole(other(role), { t: 'call.ring', cid: call.cid, from: role, video: call.video });
        logEvent('ok', `${NAME[role]} is calling ${NAME[other(role)]}`);
        changed();
        return { cid: call.cid };
      }
      case 'call.accept': {
        if (!call || call.cid !== msg.cid || call.phase !== 'ringing') throw new Error('That call is no longer ringing');
        if (role === call.from) throw new Error('You cannot answer your own call');
        clearTimeout(call.ringTimer);
        call.callee = client; call.phase = 'active'; call.startedAt = Date.now();
        call.caller.send({ t: 'call.accepted', cid: call.cid });
        for (const c of clients) if (c.role === role && c !== client) c.send({ t: 'call.end', cid: call.cid, reason: 'answered in another window' });
        logEvent('ok', 'Call connected');
        changed();
        return;
      }
      case 'call.decline': {
        if (!call || call.cid !== msg.cid) return;
        if (call.phase === 'ringing' && role !== call.from) return endCall('declined', role);
        return;
      }
      case 'call.end': {
        if (!call || call.cid !== msg.cid) return;
        if (client !== call.caller && client !== call.callee) throw new Error('Not your call');
        return endCall('hung up', role);
      }
      case 'call.signal': {
        if (!call || call.cid !== msg.cid || call.phase !== 'active') throw new Error('No active call');
        const peer = peerOf(client);
        if (!peer) throw new Error('Not your call');
        const out = { t: 'call.signal', cid: call.cid };
        if (msg.sdp) {
          if (!['offer', 'answer'].includes(msg.sdp.type) || typeof msg.sdp.sdp !== 'string' || msg.sdp.sdp.length > 60000) throw new Error('Bad session description');
          out.sdp = { type: msg.sdp.type, sdp: msg.sdp.sdp };
        }
        if (msg.candidate) {
          const c = msg.candidate;
          if (typeof c.candidate !== 'string' || c.candidate.length > 1000) throw new Error('Bad ICE candidate');
          out.candidate = { candidate: c.candidate, sdpMid: c.sdpMid == null ? null : str(c.sdpMid, 64), sdpMLineIndex: Number.isInteger(c.sdpMLineIndex) ? c.sdpMLineIndex : null };
        }
        if (!out.sdp && !out.candidate) throw new Error('Nothing to send');
        peer.send(out);
        return;
      }
      case 'call.media': {
        if (!call || call.cid !== msg.cid || call.phase !== 'active') return;
        const peer = peerOf(client);
        if (!peer) throw new Error('Not your call');
        const m = { mic: !!msg.mic, cam: !!msg.cam, screen: !!msg.screen };
        peer.send({ t: 'call.media', cid: call.cid, ...m });
        if (m.screen !== !!call[role + 'Screen']) { call[role + 'Screen'] = m.screen; logEvent('ok', `${NAME[role]} ${m.screen ? 'started' : 'stopped'} screen sharing`); }
        return;
      }
      case 'call.stats': {
        // each side reports what it measures, so the director sees the call quality in one place
        if (!call || call.cid !== msg.cid || call.phase !== 'active') return;
        call[role + 'Stats'] = cleanDiag(msg.stats);
        call.route = str(msg.stats?.route, 40) || call.route;
        changed();
        return;
      }

      /* ----- help ----- */
      case 'help.raise': {
        if (role !== 'host') throw new Error('Only the host raises help requests');
        const now = Date.now();
        while (helpLimit.length && now - helpLimit[0] > 60000) helpLimit.shift();
        if (helpLimit.length >= 10) throw new Error('Too many requests in a minute. Andrej has been notified already.');
        helpLimit.push(now);
        const level = LEVELS.includes(msg.level) ? msg.level : 'normal';
        const item = raiseHelp({ level, text: str(msg.text, 300), auto: !!msg.auto, kind: str(msg.kind, 40), diag: cleanDiag(msg.diag) });
        return { hid: item.hid };
      }
      case 'help.cancel': {
        if (role !== 'host') throw new Error('Not allowed');
        const h = state.help.find(x => x.hid === msg.hid);
        if (!h || h.status === 'resolved') return;
        h.status = 'resolved'; h.resolvedAt = Date.now(); h.note = 'withdrawn by Georgie';
        toRole('director', { t: 'help.update', item: h });
        logEvent('ok', `HELP withdrawn: ${h.text || h.kind}`);
        changed();
        return;
      }
      case 'help.ack': case 'help.resolve': {
        if (role !== 'director') throw new Error('Only the director answers help requests');
        const h = state.help.find(x => x.hid === msg.hid);
        if (!h) throw new Error('No such help request');
        if (msg.t === 'help.ack' && h.status === 'open') { h.status = 'ack'; h.ackAt = Date.now(); }
        if (msg.t === 'help.resolve') { h.status = 'resolved'; h.resolvedAt = Date.now(); }
        toRole('host', { t: 'help.update', item: h });
        logEvent('ok', `HELP ${msg.t === 'help.ack' ? 'seen' : 'resolved'}: ${h.text || h.kind}`);
        changed();
        return;
      }
      case 'assist': {
        if (role !== 'director') throw new Error('Only the director sends guidance');
        const guide = GUIDES.includes(msg.guide) ? msg.guide : 'custom';
        const text = str(msg.text, 600);
        if (guide === 'custom' && !text) throw new Error('Type the guidance first');
        if (![...clients].some(c => c.role === 'host')) throw new Error('Georgie is not online');
        toRole('host', { t: 'assist', guide, text, at: Date.now() });
        logEvent('ok', `Guidance sent to Georgie: ${guide}`);
        return;
      }
      default: throw new Error(`Unknown message ${msg.t}`);
    }
  }

  function onConnect(client) {
    if (client.role !== 'host') return;
    // she is back: close the automatic "dashboard dropped" request
    for (const h of state.help) if (h.auto && h.kind === 'host-offline' && h.status !== 'resolved') {
      h.status = 'resolved'; h.resolvedAt = Date.now(); h.note = 'Georgie reconnected';
      toRole('director', { t: 'help.update', item: h });
    }
  }

  function onClose(client) {
    if (call && (client === call.caller || client === call.callee)) endCall('connection lost');
    if (client.role === 'host' && ![...clients].some(c => c.role === 'host') && obs.state.stream.active) {
      raiseHelp({ level: 'critical', text: 'Georgie\'s dashboard disconnected while the show is live', auto: true, kind: 'host-offline', by: 'studio' });
    }
  }

  function view(role) {
    const c = call && { cid: call.cid, from: call.from, phase: call.phase, startedAt: call.startedAt, video: call.video,
      ...(role === 'director' ? { route: call.route || '', directorStats: call.directorStats || null, hostStats: call.hostStats || null } : {}) };
    return { call: c || null, help: role === 'director' ? state.help.slice(0, 30) : state.help.filter(h => h.by === 'host').slice(0, 10) };
  }

  return { handle, onConnect, onClose, view, raiseHelp, get call() { return call; } };
}
