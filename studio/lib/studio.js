// The studio hub: one shared show state, three roles.
//   director  Andrej, on the Vienna Mac. Full control: OBS, rundown, graphics, notes, chat.
//   host      Georgie, remote. Reads rundown/notes/tally, chats with the director. Nothing else.
//   overlay   OBS browser source for on-air graphics. Read-only, graphics state only.
// Every client message is checked against its role here, on the server. The browser UI hiding a button
// is never the protection.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { debounced } from './store.js';

const ROLES = ['director', 'host', 'overlay'];
const HOST_ACTIONS = new Set(['ping', 'chat.send', 'chat.read', 'host.status']);
const OVERLAY_ACTIONS = new Set(['ping']);
const CHAT_KEEP = 1000;
const LOG_KEEP = 200;
const LEADS = ['andrej', 'georgie', 'both'];
const str = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);

export function createStudio({ config, store, secrets, obs, sampleRundownPath, log = console }) {
  const clients = new Set(); // { ws, role, send, monitors }
  const saved = store.read('state.json', {});
  const state = {
    pos: { index: -1, segmentStartedAt: null, showStartedAt: null, ...saved.pos },
    note: saved.note || '',
    music: { artist: '', title: '', label: '', updatedAt: null, ...saved.music },
    musicLog: saved.musicLog || [],
    gfx: { bug: true, clocks: false, ident: false, lowerThird: { visible: false, title: '', subtitle: '', side: 'vienna' }, ...saved.gfx },
    hostStatus: saved.hostStatus || null,
    read: { director: 0, host: 0, ...saved.read },
    preset: saved.preset || '',          // the preview bus when OBS Studio Mode is off
    reminders: saved.reminders || [],    // the director's own production reminders, never shown to the host
    settings: { standbyScene: '', micInputs: null, ...saved.settings },
  };
  let rundown = loadRundown();
  let chat = store.read('chat.json', []);
  let lastChatId = chat.at(-1)?.id || 0;
  const events = [];
  const saveState = debounced(() => store.write('state.json', state));
  const saveChat = debounced(() => store.write('chat.json', chat.slice(-CHAT_KEEP)));
  const saveRundown = () => store.write('rundown.json', rundown);
  const chatLimit = new Map(); // role -> timestamps
  if (Array.isArray(state.settings.micInputs)) obs.setMicList(state.settings.micInputs);

  function loadRundown() {
    let r = store.read('rundown.json');
    if (!r) {
      r = JSON.parse(fs.readFileSync(sampleRundownPath, 'utf8'));
      store.write('rundown.json', r);
    }
    r.title = str(r.title, 120);
    r.segments = (r.segments || []).map((s, i) => cleanSegment(s, 'seg' + i));
    return r;
  }
  function cleanSegment(s, fallbackId) {
    return {
      id: str(s.id, 40) || fallbackId, title: str(s.title, 80) || 'Untitled', kind: str(s.kind, 12).toUpperCase() || 'TALK',
      minutes: Math.max(0, Math.min(600, Math.round((Number(s.minutes) || 0) * 2) / 2)), lead: LEADS.includes(s.lead) ? s.lead : 'both',
      notes: str(s.notes, 2000),
    };
  }

  const vdo = (() => {
    const base = config.vdoNinja?.base || 'https://vdo.ninja/';
    const q = p => base + '?' + new URLSearchParams(p).toString().replace(/=(&|$)/g, '$1');
    return {
      push: q({ push: secrets.vdoStream, password: secrets.vdoPassword, label: 'Georgie Walker', webcam: '', quality: '0' }),
      view: q({ view: secrets.vdoStream, password: secrets.vdoPassword, cleanoutput: '' }),
    };
  })();

  /* ---------- event log (Technical Control) ---------- */

  function logEvent(level, text) {
    const entry = { ts: Date.now(), level, text: str(text, 300) };
    events.push(entry);
    if (events.length > LOG_KEEP) events.shift();
    for (const c of clients) if (c.role === 'director') c.send({ t: 'log', entry });
  }
  obs.on('link', (up, why) => logEvent(up ? 'ok' : 'bad', up ? `OBS connected (obs-websocket ${obs.state.version})` : `OBS disconnected: ${why}`));
  let lastObsStatus = obs.state.status;
  obs.on('state', s => {
    if (s.status !== lastObsStatus && (s.status === 'auth-failed' || s.status === 'auth-required')) logEvent('bad', s.error);
    lastObsStatus = s.status;
  });

  /* ---------- switcher: the preview bus ---------- */

  const standbyScene = () => state.settings.standbyScene || config.emergency.standbyScene;
  // In OBS Studio Mode the preview is OBS's own. Otherwise the studio keeps a preset scene, like a hardware
  // switcher's preview bus: pick it, then CUT or TAKE puts it on air.
  function previewScene() {
    const o = obs.state;
    if (o.studioMode) return o.preview;
    if (state.preset && o.scenes.includes(state.preset) && state.preset !== o.program) return state.preset;
    return o.scenes.find(s => s !== o.program) || '';
  }

  /* ---------- what each role is allowed to see ---------- */

  const presence = () => ({
    director: [...clients].filter(c => c.role === 'director').length,
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
        show: showView(), rundown: rundownView(), note: state.note, music: state.music, musicLog: state.musicLog, gfx: state.gfx,
        presence: presence(), hostStatus: state.hostStatus, read: state.read, reminders: state.reminders,
        obs: { ...rest, audio: audio.map(({ db, ...a }) => a), previewScene: previewScene() },
        standby: { scene: standbyScene(), exists: obs.hasScene(standbyScene()) },
        settings: {
          standbyScene: standbyScene(), micMode: obs.micInputs.size ? 'list' : 'pattern', micPattern: config.emergency.micPattern,
          obsUrl: config.obs.url, directorPort: config.director.port, guestPort: config.guest.port, dataDir: store.dir,
        },
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

  /* program and preview monitors: OBS screenshots of each scene, a few per second, only while someone watches */
  const busy = { program: false, preview: false };
  let tick = 0;
  const monitorTimer = setInterval(() => {
    const watchers = [...clients].filter(c => c.monitors);
    if (!watchers.length || !obs.state.connected) return;
    tick++;
    for (const which of tick % 2 ? ['program', 'preview'] : ['program']) {
      const scene = which === 'program' ? obs.state.program : previewScene();
      if (!scene || busy[which]) continue;
      busy[which] = true;
      obs.screenshot(scene, 640).then(img => {
        for (const c of watchers) c.send({ t: 'frame', which, scene, img });
      }).catch(() => {}).finally(() => { busy[which] = false; });
    }
  }, 280);

  function toRole(role, msg) { for (const c of clients) if (c.role === role) c.send(msg); }

  /* ---------- connections ---------- */

  function connect(ws, role) {
    if (!ROLES.includes(role)) throw new Error('unknown role');
    const client = {
      ws, role, monitors: false,
      send(msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); },
    };
    clients.add(client);
    client.send({ t: 'hello', role });
    client.send({ t: 'state', s: view(role) });
    if (role !== 'overlay') client.send({ t: 'chat.history', msgs: chat.slice(-200) });
    if (role === 'director') client.send({ t: 'log.history', entries: events });
    if (role === 'host') logEvent('ok', 'Georgie connected');
    if (role === 'overlay') logEvent('ok', 'Graphics overlay connected');
    broadcastState();
    ws.on('message', raw => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (!msg || typeof msg.t !== 'string') return;
      handle(client, msg).then(
        result => { if (msg.id) client.send({ t: 'ack', id: msg.id, ok: true, result }); },
        err => {
          log.warn(`[studio] ${role} ${msg.t}${msg.action ? '/' + msg.action : ''}: ${err.message}`);
          if (role === 'director') logEvent('warn', `${msg.t}${msg.action ? ' ' + msg.action : ''}: ${err.message}`);
          if (msg.id) client.send({ t: 'ack', id: msg.id, ok: false, error: err.message });
        },
      );
    });
    ws.on('close', () => {
      clients.delete(client);
      if (role === 'host') logEvent('warn', 'Georgie disconnected');
      if (role === 'overlay') logEvent('warn', 'Graphics overlay disconnected');
      broadcastState();
    });
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
          cameraLabel: str(s.cameraLabel, 80), micLabel: str(s.micLabel, 80), rtt: Math.max(0, Math.min(60000, Number(s.rtt) || 0)), at: Date.now(),
        };
        changed(); return;
      }
      case 'monitors': client.monitors = !!msg.on; return;
      case 'obs': return obsAction(msg);
      case 'rundown': return rundownAction(msg);
      case 'note': state.note = str(msg.text, 2000); changed(); return;
      case 'music': return musicAction(msg);
      case 'reminder': return reminderAction(msg);
      case 'settings': return settingsAction(msg);
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
    const was = obs.state.program;
    switch (msg.action) {
      case 'program': {
        const scene = str(msg.scene, 256);
        await obs.setProgram(scene);
        logEvent('ok', `Program → ${scene}`); return;
      }
      case 'preview': {
        const scene = str(msg.scene, 256);
        if (obs.state.studioMode) return obs.setPreview(scene);
        obs.requireScene(scene);
        state.preset = scene; changed(); return;
      }
      case 'cut': case 'auto': {
        const target = previewScene();
        if (!target) throw new Error('Nothing on preview');
        const go = obs.state.studioMode ? () => obs.take() : () => obs.setProgram(target);
        if (msg.action === 'cut') await obs.cut(go); else await go();
        if (!obs.state.studioMode) { state.preset = was; changed(); } // the old program waits on preview, like a hardware switcher
        logEvent('ok', `${msg.action === 'cut' ? 'CUT' : 'TAKE'} → ${target}`); return;
      }
      case 'take': return obs.take();
      case 'transition': return obs.setTransition(str(msg.name, 256));
      case 'duration': return obs.setTransitionDuration(Number(msg.ms));
      case 'item': return obs.setItem(Number(msg.itemId), !!msg.enabled);
      case 'mute': {
        await obs.setMute(str(msg.input, 256), !!msg.muted);
        logEvent('ok', `${msg.muted ? 'Muted' : 'Unmuted'} ${str(msg.input, 256)}`); return;
      }
      case 'volume': return obs.setVolume(str(msg.input, 256), msg.db);
      case 'media': {
        await obs.media(str(msg.input, 256), str(msg.media, 10));
        logEvent('ok', `Media ${str(msg.media, 10)}: ${str(msg.input, 256)}`); return;
      }
      case 'stream':
        if (msg.confirm !== true) throw new Error('Stream start/stop needs confirmation');
        await obs.stream(!!msg.on);
        logEvent(msg.on ? 'live' : 'ok', msg.on ? 'Stream started' : 'Stream stopped'); return;
      case 'record':
        await obs.record(!!msg.on);
        logEvent('ok', msg.on ? 'Recording started' : 'Recording stopped'); return;
      case 'refresh': return obs.refresh();
      case 'reconnect': logEvent('warn', 'OBS reconnect requested'); obs.reconnect(); return;
      default: throw new Error('Unknown OBS action');
    }
  }

  function rundownAction(msg) {
    const segs = rundown.segments, p = state.pos, now = Date.now();
    const go = i => {
      if (i < -1 || i >= segs.length) throw new Error('No such segment');
      p.index = i; p.segmentStartedAt = i >= 0 ? now : null;
      if (i >= 0 && !p.showStartedAt) p.showStartedAt = now;
    };
    const at = i => { const s = segs[Number(i)]; if (!s) throw new Error('No such segment'); return s; };
    // structural edits keep "on air now" pointing at the same segment
    const edit = fn => {
      const currentId = segs[p.index]?.id;
      fn();
      rundown.sample = false;
      if (currentId) {
        const i = segs.findIndex(s => s.id === currentId);
        if (i >= 0) p.index = i;
        else { p.index = Math.min(p.index, segs.length - 1); p.segmentStartedAt = p.index >= 0 ? now : null; }
      }
      saveRundown();
    };
    switch (msg.action) {
      case 'next': go(Math.min(p.index + 1, segs.length - 1)); break;
      case 'prev': go(Math.max(p.index - 1, 0)); break;
      case 'go': go(Number(msg.index)); break;
      case 'reset': p.index = -1; p.segmentStartedAt = null; p.showStartedAt = null; break;
      case 'notes': at(msg.index).notes = str(msg.notes, 2000); edit(() => {}); break;
      case 'update': {
        const s = at(msg.index), f = msg.fields || {};
        edit(() => Object.assign(s, cleanSegment({ ...s, ...f, id: s.id }, s.id)));
        break;
      }
      case 'add': {
        const i = msg.index == null ? segs.length - 1 : Number(msg.index);
        if (segs.length >= 60) throw new Error('A rundown can have up to 60 segments');
        edit(() => segs.splice(i + 1, 0, cleanSegment({ id: 'seg-' + crypto.randomBytes(4).toString('hex'), title: 'New segment', kind: 'TALK', minutes: 5, lead: 'both' })));
        return { index: i + 1 };
      }
      case 'remove': at(msg.index); edit(() => segs.splice(Number(msg.index), 1)); break;
      case 'move': {
        const from = Number(msg.index), to = Number(msg.to);
        at(from); if (to < 0 || to >= segs.length) throw new Error('Cannot move there');
        edit(() => segs.splice(to, 0, segs.splice(from, 1)[0]));
        break;
      }
      case 'title': edit(() => { rundown.title = str(msg.title, 120); }); break;
      case 'reload': rundown = loadRundown(); if (p.index >= rundown.segments.length) { p.index = -1; p.segmentStartedAt = null; } break;
      default: throw new Error('Unknown rundown action');
    }
    changed();
  }

  function musicAction(msg) {
    state.music = { artist: str(msg.artist, 120), title: str(msg.title, 160), label: str(msg.label, 120), updatedAt: Date.now() };
    if (state.music.artist || state.music.title) {
      state.musicLog.unshift({ ...state.music, segment: rundown.segments[state.pos.index]?.title || '' });
      state.musicLog = state.musicLog.slice(0, 60);
    }
    changed();
  }

  function reminderAction(msg) {
    const list = state.reminders;
    switch (msg.action) {
      case 'add': {
        const text = str(msg.text, 200);
        if (!text) throw new Error('Type a reminder first');
        if (list.length >= 50) throw new Error('Up to 50 reminders');
        const atTime = msg.at ? Number(new Date(msg.at)) : null;
        list.push({ id: crypto.randomBytes(4).toString('hex'), text, at: Number.isFinite(atTime) ? atTime : null, done: false });
        list.sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity));
        break;
      }
      case 'toggle': { const r = list.find(x => x.id === msg.rid); if (!r) throw new Error('No such reminder'); r.done = !r.done; break; }
      case 'remove': state.reminders = list.filter(x => x.id !== msg.rid); break;
      case 'clearDone': state.reminders = list.filter(x => !x.done); break;
      default: throw new Error('Unknown reminder action');
    }
    changed();
  }

  function settingsAction(msg) {
    if ('standbyScene' in msg) state.settings.standbyScene = str(msg.standbyScene, 256);
    if ('micInputs' in msg) {
      const list = Array.isArray(msg.micInputs) ? msg.micInputs.map(n => str(n, 256)).filter(Boolean).slice(0, 40) : null;
      state.settings.micInputs = list;
      obs.setMicList(list || config.emergency.micInputs || []);
    }
    logEvent('ok', 'Technical settings changed');
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
        const scene = standbyScene();
        if (!obs.hasScene(scene)) throw new Error(`Create a scene called "${scene}" in OBS first, or pick one in Technical Control`);
        await obs.cut(() => obs.setProgram(scene));
        state.gfx.lowerThird.visible = false; state.gfx.ident = false; changed();
        toRole('host', { t: 'alert', text: 'Vienna cut to the standby scene. Hold, Andrej will brief you in the chat.' });
        logEvent('bad', `EMERGENCY: cut to standby (${scene})`);
        return { scene };
      }
      case 'mics': { const n = await obs.muteMics(); logEvent('bad', `EMERGENCY: ${n} microphone(s) muted`); return { muted: n }; }
      case 'endStream':
        if (msg.confirm !== true) throw new Error('Needs confirmation');
        await obs.stream(false); logEvent('bad', 'EMERGENCY: stream ended'); return;
      default: throw new Error('Unknown emergency action');
    }
  }

  return {
    connect, view, vdo, clients,
    flush() { saveState.flush(); saveChat.flush(); },
    stop() { clearInterval(monitorTimer); },
  };
}
