// The studio hub: one shared show state, three roles.
//   director  Andrej, on the Vienna Mac. Full control: OBS, rundown, graphics, notes, chat.
//   host      Georgie, remote. Reads rundown/notes/tally, chats with the director. Nothing else.
//   overlay   OBS browser source for on-air graphics. Read-only, graphics state only.
// Every client message is checked against its role here, on the server. The browser UI hiding a button
// is never the protection.
import fs from 'node:fs';
import { debounced } from './store.js';

const ROLES = ['director', 'host', 'overlay'];
const HOST_ACTIONS = new Set(['ping', 'chat.send', 'chat.read', 'host.status']);
const OVERLAY_ACTIONS = new Set(['ping']);
const CHAT_KEEP = 1000;
const str = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);

export function createStudio({ config, store, secrets, obs, sampleRundownPath, log = console }) {
  const clients = new Set(); // { ws, role, send }
  const saved = store.read('state.json', {});
  const state = {
    pos: { index: -1, segmentStartedAt: null, showStartedAt: null, ...saved.pos },
    note: saved.note || '',
    music: { artist: '', title: '', label: '', updatedAt: null, ...saved.music },
    gfx: { bug: true, clocks: false, ident: false, lowerThird: { visible: false, title: '', subtitle: '', side: 'vienna' }, ...saved.gfx },
    hostStatus: saved.hostStatus || null,
    read: { director: 0, host: 0, ...saved.read },
  };
  let rundown = loadRundown();
  let chat = store.read('chat.json', []);
  let lastChatId = chat.at(-1)?.id || 0;
  const saveState = debounced(() => store.write('state.json', state));
  const saveChat = debounced(() => store.write('chat.json', chat.slice(-CHAT_KEEP)));
  const saveRundown = () => store.write('rundown.json', rundown);
  const chatLimit = new Map(); // role -> timestamps

  function loadRundown() {
    let r = store.read('rundown.json');
    if (!r) {
      r = JSON.parse(fs.readFileSync(sampleRundownPath, 'utf8'));
      store.write('rundown.json', r);
    }
    r.segments = (r.segments || []).map((s, i) => ({
      id: str(s.id, 40) || 'seg' + i, title: str(s.title, 80) || 'Untitled', kind: str(s.kind, 12).toUpperCase() || 'TALK',
      minutes: Math.max(0, Math.min(600, Number(s.minutes) || 0)), lead: ['andrej', 'georgie', 'both'].includes(s.lead) ? s.lead : 'both',
      notes: str(s.notes, 2000),
    }));
    return r;
  }

  const vdo = (() => {
    const base = config.vdoNinja?.base || 'https://vdo.ninja/';
    const q = p => base + '?' + new URLSearchParams(p).toString().replace(/=(&|$)/g, '$1');
    return {
      push: q({ push: secrets.vdoStream, password: secrets.vdoPassword, label: 'Georgie Walker', webcam: '', quality: '0' }),
      view: q({ view: secrets.vdoStream, password: secrets.vdoPassword, cleanoutput: '' }),
    };
  })();

  /* ---------- what each role is allowed to see ---------- */

  const presence = () => ({
    director: [...clients].some(c => c.role === 'director'),
    host: [...clients].some(c => c.role === 'host'),
    overlay: [...clients].filter(c => c.role === 'overlay').length,
  });
  const rundownView = () => ({ title: rundown.title, sample: !!rundown.sample, segments: rundown.segments, ...state.pos });
  const showView = () => ({ title: config.show.title, launch: config.show.launch, schedule: config.show.schedule });

  function view(role) {
    const o = obs.state;
    if (role === 'director') {
      const { audio, ...rest } = o;
      return {
        show: showView(), rundown: rundownView(), note: state.note, music: state.music, gfx: state.gfx,
        presence: presence(), hostStatus: state.hostStatus, read: state.read,
        obs: { ...rest, audio: audio.map(({ db, ...a }) => a) },
        standby: { scene: config.emergency.standbyScene, exists: obs.hasScene(config.emergency.standbyScene) },
        vdo: { view: vdo.view, push: vdo.push }, overlayKey: secrets.overlayKey,
      };
    }
    if (role === 'host') {
      return {
        show: showView(), rundown: rundownView(), note: state.note, music: state.music,
        presence: presence(), read: state.read,
        // tally only: Georgie sees whether the show is live, never anything she could act on
        tally: { obs: o.connected, onAir: o.stream.active, recording: o.record.active },
        vdo: { push: vdo.push },
      };
    }
    const seg = rundown.segments[state.pos.index];
    return { show: showView(), gfx: state.gfx, segment: seg ? { title: seg.title, kind: seg.kind } : null };
  }

  /* ---------- fan-out ---------- */

  const broadcastState = debounced(() => {
    const cache = {};
    for (const c of clients) c.send({ t: 'state', s: cache[c.role] ??= view(c.role) });
  }, 25);
  const changed = () => { broadcastState(); saveState(); };

  let lastMeters = 0;
  obs.on('state', () => broadcastState());
  obs.on('meters', m => {
    const now = Date.now();
    if (now - lastMeters < 66) return; // ~15 fps is plenty for a meter
    lastMeters = now;
    for (const c of clients) if (c.role === 'director') c.send({ t: 'meters', m });
  });

  function toRole(role, msg) { for (const c of clients) if (c.role === role) c.send(msg); }

  /* ---------- connections ---------- */

  function connect(ws, role) {
    if (!ROLES.includes(role)) throw new Error('unknown role');
    const client = {
      ws, role,
      send(msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); },
    };
    clients.add(client);
    client.send({ t: 'hello', role });
    client.send({ t: 'state', s: view(role) });
    if (role !== 'overlay') client.send({ t: 'chat.history', msgs: chat.slice(-200) });
    broadcastState();
    ws.on('message', raw => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (!msg || typeof msg.t !== 'string') return;
      handle(client, msg).then(
        result => { if (msg.id) client.send({ t: 'ack', id: msg.id, ok: true, result }); },
        err => {
          log.warn(`[studio] ${role} ${msg.t}${msg.action ? '/' + msg.action : ''}: ${err.message}`);
          if (msg.id) client.send({ t: 'ack', id: msg.id, ok: false, error: err.message });
        },
      );
    });
    ws.on('close', () => { clients.delete(client); broadcastState(); });
  }

  /* ---------- messages ---------- */

  async function handle(client, msg) {
    const { role } = client;
    if (role === 'host' && !HOST_ACTIONS.has(msg.t)) throw new Error('Not allowed for the host role');
    if (role === 'overlay' && !OVERLAY_ACTIONS.has(msg.t)) throw new Error('Not allowed for the overlay role');

    switch (msg.t) {
      case 'ping': client.send({ t: 'pong', ts: msg.ts }); return;
      case 'chat.send': return chatSend(role, msg.text);
      case 'chat.read': {
        state.read[role] = Math.max(state.read[role] || 0, Number(msg.upTo) || 0);
        changed(); return;
      }
      case 'host.status': {
        const s = msg.status || {};
        state.hostStatus = {
          camera: !!s.camera, mic: !!s.mic, headphones: !!s.headphones, wired: !!s.wired, light: !!s.light, vdo: !!s.vdo,
          cameraLabel: str(s.cameraLabel, 80), micLabel: str(s.micLabel, 80), at: Date.now(),
        };
        changed(); return;
      }
      case 'obs': return obsAction(msg);
      case 'rundown': return rundownAction(msg);
      case 'note': state.note = str(msg.text, 2000); changed(); return;
      case 'music': {
        state.music = { artist: str(msg.artist, 120), title: str(msg.title, 160), label: str(msg.label, 120), updatedAt: Date.now() };
        changed(); return;
      }
      case 'gfx': return gfxAction(msg);
      case 'emergency': return emergency(msg);
      default: throw new Error(`Unknown message ${msg.t}`);
    }
  }

  function chatSend(role, text) {
    text = str(text, 1000);
    if (!text) throw new Error('Empty message');
    const now = Date.now();
    const recent = (chatLimit.get(role) || []).filter(t => now - t < 10000);
    if (recent.length >= 12) throw new Error('Slow down a little');
    recent.push(now); chatLimit.set(role, recent);
    // ids only ever grow, even for two messages in the same millisecond: read receipts compare them
    lastChatId = Math.max(lastChatId + 1, now * 1000);
    const msg = { id: lastChatId, from: role, text, ts: now };
    chat.push(msg);
    if (chat.length > CHAT_KEEP * 1.2) chat = chat.slice(-CHAT_KEEP);
    state.read[role] = msg.id; // you have read your own message
    saveChat(); changed();
    for (const c of clients) if (c.role !== 'overlay') c.send({ t: 'chat', msg });
    return { id: msg.id };
  }

  async function obsAction(msg) {
    switch (msg.action) {
      case 'program': return obs.setProgram(str(msg.scene, 256));
      case 'preview': return obs.setPreview(str(msg.scene, 256));
      case 'take': return obs.take();
      case 'item': return obs.setItem(Number(msg.itemId), !!msg.enabled);
      case 'mute': return obs.setMute(str(msg.input, 256), !!msg.muted);
      case 'stream':
        if (msg.confirm !== true) throw new Error('Stream start/stop needs confirmation');
        return obs.stream(!!msg.on);
      case 'record': return obs.record(!!msg.on);
      case 'refresh': return obs.refresh();
      default: throw new Error('Unknown OBS action');
    }
  }

  function rundownAction(msg) {
    const n = rundown.segments.length, p = state.pos, now = Date.now();
    const go = i => {
      if (i < -1 || i >= n) throw new Error('No such segment');
      p.index = i; p.segmentStartedAt = i >= 0 ? now : null;
      if (i >= 0 && !p.showStartedAt) p.showStartedAt = now;
    };
    switch (msg.action) {
      case 'next': go(Math.min(p.index + 1, n - 1)); break;
      case 'prev': go(Math.max(p.index - 1, 0)); break;
      case 'go': go(Number(msg.index)); break;
      case 'reset': p.index = -1; p.segmentStartedAt = null; p.showStartedAt = null; break;
      case 'notes': {
        const seg = rundown.segments[Number(msg.index)];
        if (!seg) throw new Error('No such segment');
        seg.notes = str(msg.notes, 2000); saveRundown(); break;
      }
      case 'reload': rundown = loadRundown(); if (p.index >= rundown.segments.length) go(-1); break;
      default: throw new Error('Unknown rundown action');
    }
    changed();
  }

  function gfxAction(msg) {
    const g = state.gfx;
    switch (msg.action) {
      case 'bug': g.bug = !!msg.on; break;
      case 'clocks': g.clocks = !!msg.on; break;
      case 'ident': g.ident = !!msg.on; break;
      case 'lower': g.lowerThird = {
        visible: !!msg.on, title: str(msg.title, 80), subtitle: str(msg.subtitle, 120), side: msg.side === 'melbourne' ? 'melbourne' : 'vienna',
      }; break;
      case 'clear': g.clocks = false; g.ident = false; g.lowerThird = { ...g.lowerThird, visible: false }; break;
      default: throw new Error('Unknown graphics action');
    }
    changed();
  }

  async function emergency(msg) {
    switch (msg.action) {
      case 'standby': {
        const scene = config.emergency.standbyScene;
        if (!obs.hasScene(scene)) throw new Error(`Create a scene called "${scene}" in OBS first (emergency.standbyScene in config.json)`);
        await obs.setProgram(scene);
        state.gfx.lowerThird.visible = false; state.gfx.ident = false; changed();
        toRole('host', { t: 'alert', text: 'Vienna cut to the standby scene. Hold, Andrej will brief you in the chat.' });
        return { scene };
      }
      case 'mics': return { muted: await obs.muteMics() };
      case 'endStream':
        if (msg.confirm !== true) throw new Error('Needs confirmation');
        await obs.stream(false); return;
      default: throw new Error('Unknown emergency action');
    }
  }

  return { connect, view, vdo, flush() { saveState.flush(); saveChat.flush(); }, clients };
}
