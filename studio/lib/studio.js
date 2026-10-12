// The studio hub: one shared show state, three roles.
//   director  Andrej, on the Vienna Mac. Full control: OBS, rundown, graphics, notes, chat.
//   host      Georgie, remote. Reads rundown/notes/tally, chats with the director. Nothing else.
//   overlay   OBS browser source for on-air graphics. Read-only, graphics state only.
// Every client message is checked against its role here, on the server. The browser UI hiding a button
// is never the protection.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { debounced } from './store.js';
import { createTalk } from './talk.js';
import { createRehearsal } from './rehearsal.js';
import { watchTunnel } from './tunnel.js';

const ROLES = ['director', 'host', 'overlay'];
// Georgie's complete permission list. Calls and help requests are hers to make; nothing here reaches OBS.
const HOST_ACTIONS = new Set(['ping', 'chat.send', 'chat.read', 'host.status',
  'call.start', 'call.accept', 'call.decline', 'call.signal', 'call.end', 'call.media', 'call.stats', 'call.resume', 'help.raise', 'help.cancel',
  'check.echo', 'check.result']);
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
    help: saved.help || [],             // HELP requests from Georgie (and automatic ones)
    // a rehearsal survives a studio restart, and with it the stream/recording lock
    rehearsal: saved.rehearsal || { active: false },
    reports: saved.reports || [],
    showId: saved.showId || '',         // the selected show preset (Sunday / Friday), kept across restarts
  };
  let rundown = loadRundown();
  let chat = store.read('chat.json', []);
  let lastChatId = chat.at(-1)?.id || 0;
  // the event log survives a restart: kept in data/events.jsonl (last entries only), shown again on the next start
  const LOG_FILE = path.join(store.dir, 'events.jsonl');
  const events = (() => {
    try {
      const lines = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n').slice(-LOG_KEEP);
      fs.writeFileSync(LOG_FILE, lines.join('\n') + '\n');                         // trim the file at every start
      return lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    } catch { return []; }
  })();
  const saveState = debounced(() => store.writeSafe('state.json', state));
  const saveChat = debounced(() => store.writeSafe('chat.json', chat.slice(-CHAT_KEEP)));
  const saveRundown = () => store.write('rundown.json', rundown);

  /* show presets: studio/shows/*.json, one per show (Sunday // DISTANCE ZERO, Friday // DJ Andy'K). Selecting one sets
     the OBS scene collection, rundown, microphones, standby scene, transition and overlay graphics in one go. */
  const SHOWS_DIR = path.join(path.dirname(sampleRundownPath), 'shows');
  const shows = (() => {
    try { return fs.readdirSync(SHOWS_DIR).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(SHOWS_DIR, f), 'utf8'))).sort((a, b) => a.id.localeCompare(b.id)).reverse(); }
    catch { return []; }
  })();
  const showList = () => shows.map(x => ({ id: x.id, name: x.name, hosts: x.hosts, collection: x.obs?.sceneCollection || '' }));

  /* rundown templates: one saved rundown per episode, in data/rundowns/<name>.json */
  const TPL_DIR = path.join(store.dir, 'rundowns');
  const slug = t => str(t, 80).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'episode';
  const tplFile = id => { if (!/^[a-z0-9-]{1,60}$/.test(String(id))) throw new Error('No such template'); return path.join(TPL_DIR, id + '.json'); };
  function listTemplates() {
    try {
      return fs.readdirSync(TPL_DIR).filter(f => f.endsWith('.json')).map(f => {
        try {
          const t = JSON.parse(fs.readFileSync(path.join(TPL_DIR, f), 'utf8')), segs = Array.isArray(t.segments) ? t.segments : [];
          return { id: f.slice(0, -5), name: str(t.name, 80), title: str(t.title, 120), savedAt: Number(t.savedAt) || 0, segments: segs.length, minutes: segs.reduce((a, x) => a + (Number(x.minutes) || 0), 0) };
        } catch { return null; }
      }).filter(Boolean).sort((a, b) => b.savedAt - a.savedAt);
    } catch { return []; }
  }
  let templates = listTemplates();
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

  function logEvent(level, text, kind = '') {
    rehearsal?.record(kind, level, text);
    const entry = { ts: Date.now(), level, text: str(text, 300) };
    events.push(entry);
    if (events.length > LOG_KEEP) events.shift();
    fs.appendFile(LOG_FILE, JSON.stringify(entry) + '\n', () => {});              // best effort: never blocks the show
    for (const c of clients) if (c.role === 'director') c.send({ t: 'log', entry });
  }
  /* notifications: one short, calm message per event; sound only when asked for (critical issues) */
  const lastNote = new Map();
  function notify(level, kind, text, { to = ['director'], sound = false, quiet = false } = {}) {
    logEvent(level === 'critical' ? 'bad' : level === 'warn' ? 'warn' : 'ok', text, kind);
    // merge only true repeats: the same topic in the same state within a few seconds. A change of state
    // (disconnected → connected) is always shown, however quickly it follows.
    const topic = kind.split('-')[0], now = Date.now(), last = lastNote.get(topic);
    if (last && last.kind === kind && last.text === text && now - last.at < 8000) return;
    lastNote.set(topic, { kind, text, at: now });
    for (const c of clients) if (to.includes(c.role)) c.send({ t: 'notify', level, kind, text, sound, quiet, at: now });
  }
  let rehearsal = null;
  let wasOnAir = false;
  obs.on('state', st => { if (st.connected) wasOnAir = st.stream.active || st.record.active; });
  obs.on('link', (up, why) => {
    if (up) notify('ok', 'obs-up', `OBS connected (obs-websocket ${obs.state.version})`);
    if (up) setTimeout(() => obs.refreshBrowser('D//0 Overlay').catch(() => {}), 1500);   // the graphics page loads even if OBS started first
    else notify(wasOnAir ? 'critical' : 'warn', 'obs-down', `OBS disconnected: ${why}${wasOnAir ? '. It was streaming or recording: check OBS now.' : ''}`, { sound: wasOnAir });
  });
  const tunnel = watchTunnel({ dataDir: store.dir, onChange: (st, before) => {
    // a NEW address always warns, even when the restart happened between two probes (up → up, different address)
    if (st.newAddress) notify('warn', 'tunnel-up', 'Georgie\'s public link is back with a NEW address. Copy the new link and send it to her: the old one no longer works.');
    else if (st.up && !before.up) notify('ok', 'tunnel-up', 'Georgie\'s public link is online');
    if (st.up) logEvent('ok', 'Public link up', 'tunnel-up'); else if (before.up) logEvent('warn', 'Public link down', 'tunnel-down');
    else if (!st.up && before.up) notify([...clients].some(c => c.role === 'host' && c.remote) ? 'critical' : 'warn', 'tunnel-down', `Georgie's public link stopped answering: ${st.error || 'tunnel closed'}`, { sound: false });
    changed();
  } });
  let lastObsStatus = obs.state.status;
  obs.on('state', s => {
    if (s.status !== lastObsStatus && (s.status === 'auth-failed' || s.status === 'auth-required')) logEvent('bad', s.error);
    lastObsStatus = s.status;
  });

  rehearsal = createRehearsal({ state, clients, obs, store, tunnel, changed: () => changed(), notify });
  const talk = createTalk({ state, clients, obs, changed: () => changed(), logEvent, notify, hooks: rehearsal.hooks, graceMs: config.call?.graceMs });

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
        show: showView(), shows: showList(), showId: state.showId, rundown: rundownView(), templates, note: state.note, music: state.music, musicLog: state.musicLog, gfx: state.gfx,
        presence: presence(), hostStatus: state.hostStatus, read: state.read, reminders: state.reminders,
        obs: { ...rest, audio: audio.map(({ db, ...a }) => a), previewScene: previewScene() },
        standby: { scene: standbyScene(), exists: obs.hasScene(standbyScene()) },
        settings: {
          standbyScene: standbyScene(), micMode: obs.micInputs.size ? 'list' : 'pattern', micPattern: config.emergency.micPattern,
          obsUrl: config.obs.url, directorPort: config.director.port, guestPort: config.guest.port, dataDir: store.dir,
        },
        vdo: { view: vdo.view, push: vdo.push }, overlayKey: secrets.overlayKey,
        ...talk.view('director'), ice: config.call?.iceServers || [], ...rehearsal.view('director'),
      };
    }
    if (role === 'host') {
      return {
        show: showView(), rundown: rundownView(), note: state.note, music: state.music,
        presence: presence(), read: state.read,
        // tally only: Georgie sees whether the show is live, never anything she could act on
        tally: { obs: o.connected, onAir: o.stream.active, recording: o.record.active },
        vdo: { push: vdo.push },
        ...talk.view('host'), ice: config.call?.iceServers || [], ...rehearsal.view('host'),
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

  const count = role => [...clients].filter(c => c.role === role).length;
  function connect(ws, role, { remote = false } = {}) {
    if (!ROLES.includes(role)) throw new Error('unknown role');
    const client = {
      ws, role, remote, monitors: false,
      send(msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); },
    };
    clients.add(client);
    client.send({ t: 'hello', role });
    client.send({ t: 'state', s: view(role) });
    if (role !== 'overlay') client.send({ t: 'chat.history', msgs: chat.slice(-200) });
    if (role === 'director') client.send({ t: 'log.history', entries: events });
    if (role === 'host') {
      if (count('host') === 1) notify('ok', 'host-up', `Georgie connected${remote ? ' (via her public link)' : ' (on this Mac)'}`);
      talk.onConnect(client);
    }
    if (role === 'director' && count('director') === 1) { logEvent('ok', 'Director Studio connected', 'director-up'); notify('ok', 'director-up', 'Andrej is connected', { to: ['host'] }); }
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
      if (role === 'host' && !count('host')) notify('warn', 'host-down', 'Georgie disconnected. Her page reconnects by itself; if she is not back in 30 s, call her phone.');
      if (role === 'director' && !count('director')) { logEvent('warn', 'Director Studio disconnected', 'director-down'); notify('warn', 'director-down', 'Andrej\'s studio is reconnecting. Stay where you are.', { to: ['host'] }); }
      talk.onClose(client);
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
      case 'assist': return talk.handle(client, msg);
      case 'obs': return obsAction(msg);
      case 'rundown': return rundownAction(msg);
      case 'note': state.note = str(msg.text, 2000); changed(); return;
      case 'music': return musicAction(msg);
      case 'reminder': return reminderAction(msg);
      case 'settings': return settingsAction(msg);
      case 'gfx': return gfxAction(msg);
      case 'show.select': return selectShow(msg);
      case 'emergency': return emergency(msg);
      case 'tunnel.link': {
        // Georgie's full sign-in link, only on request, only for the director (to copy into Signal/iMessage)
        if (role !== 'director') throw new Error('Not allowed');
        const t = await tunnel.check();
        if (!t.running) throw new Error('No public link is running. Start it with the launcher or "npm run tunnel".');
        return { link: `${t.url}/login#code=${secrets.hostCode}`, up: t.up };
      }
      default:
        if (/^(call|help)\./.test(msg.t)) return talk.handle(client, msg);
        if (/^(rehearsal|check)\./.test(msg.t)) return rehearsal.handle(client, msg);
        throw new Error(`Unknown message ${msg.t}`);
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
        if (msg.on && rehearsal.active) throw new Error('Rehearsal mode: the YouTube stream is locked. End the rehearsal first.');
        await obs.stream(!!msg.on);
        logEvent(msg.on ? 'live' : 'ok', msg.on ? 'Stream started' : 'Stream stopped'); return;
      case 'record':
        if (msg.on && rehearsal.active) throw new Error('Rehearsal mode: OBS recording is locked. End the rehearsal first.');
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
      case 'saveTemplate': {
        const name = str(msg.name, 80) || rundown.title || 'Episode', id = slug(name);
        if (!fs.existsSync(tplFile(id)) && templates.length >= 100) throw new Error('Up to 100 templates. Delete an old one first.');
        fs.mkdirSync(TPL_DIR, { recursive: true, mode: 0o700 });
        fs.writeFileSync(tplFile(id), JSON.stringify({ name, title: rundown.title, savedAt: now, segments: segs }, null, 2), { mode: 0o600 });
        templates = listTemplates(); changed();
        return { template: id };
      }
      case 'loadTemplate': {
        if (p.showStartedAt) throw new Error('The show clock is running. Press Reset first, then load a template.');
        let t;
        try { t = JSON.parse(fs.readFileSync(tplFile(msg.template), 'utf8')); } catch { throw new Error('No such template'); }
        rundown = { title: str(t.title, 120) || str(t.name, 80), sample: false,
          segments: (t.segments || []).slice(0, 60).map(x => cleanSegment({ ...x, id: 'seg-' + crypto.randomBytes(4).toString('hex') }, 'seg')) };
        p.index = -1; p.segmentStartedAt = null;
        saveRundown();
        break;
      }
      case 'deleteTemplate': {
        try { fs.unlinkSync(tplFile(msg.template)); } catch { throw new Error('No such template'); }
        templates = listTemplates();
        break;
      }
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

  async function selectShow(msg) {
    const x = shows.find(s => s.id === msg.show);
    if (!x) throw new Error('No such show');
    const o = obs.state;
    if (o.stream.active || o.record.active) throw new Error('Not while streaming or recording. End them first.');
    if (state.pos.showStartedAt) throw new Error('The show clock is running. Press Reset first, then select the show.');
    const notes = [];
    // 1. OBS: the show's own scene collection (sources, scenes, layout). The studio never builds or deletes one here.
    if (o.connected && x.obs?.sceneCollection) {
      const c = await obs.sceneCollections().catch(() => null);
      if (!c) notes.push('OBS did not list its scene collections');
      else if (!c.all.includes(x.obs.sceneCollection)) notes.push(`OBS has no scene collection "${x.obs.sceneCollection}" yet (npm run obs-setup creates it)`);
      else if (c.current !== x.obs.sceneCollection) await obs.setSceneCollection(x.obs.sceneCollection);
      setTimeout(() => obs.refreshBrowser('D//0 Overlay').catch(() => {}), 4000);       // graphics of the newly loaded collection
      // start every show on its standby scene (OBS may reopen a collection on any scene, even the hidden sound scene)
      setTimeout(async () => { if (!obs.state.stream.active && !obs.state.record.active && obs.hasScene(x.obs.standbyScene)) await obs.setProgram(x.obs.standbyScene).catch(() => {}); }, 3500);
    } else if (!o.connected) notes.push('OBS is offline: its scene collection is switched the next time you select the show with OBS open');
    // 2. rundown, 3. microphones and standby scene, 4. overlay graphics
    rundown = { title: str(x.rundown?.title, 120), sample: false,
      segments: (x.rundown?.segments || []).slice(0, 60).map(seg => cleanSegment({ ...seg, id: 'seg-' + crypto.randomBytes(4).toString('hex') }, 'seg')) };
    state.pos.index = -1; state.pos.segmentStartedAt = null;
    saveRundown();
    state.settings.micInputs = (x.mics || []).map(n => str(n, 256));
    obs.setMicList(state.settings.micInputs);
    state.settings.standbyScene = str(x.obs?.standbyScene, 256);
    state.gfx = { ...state.gfx, tagline: str(x.overlay?.tagline, 60), clocks: !!x.overlay?.clocks, ident: false, lowerThird: { ...state.gfx.lowerThird, visible: false } };
    state.showId = x.id;
    // 5. transition: by kind, because OBS names them in its own language (Fade / Überblende)
    if (o.connected && x.obs?.transition) setTimeout(async () => {
      const t = obs.state.transitions.find(tr => tr.kind === x.obs.transition + '_transition');
      if (t) { await obs.setTransition(t.name).catch(() => {}); if (x.obs.transitionMs) await obs.setTransitionDuration(x.obs.transitionMs).catch(() => {}); }
    }, 2500);
    logEvent(notes.length ? 'warn' : 'ok', `Show selected: ${x.name}${notes.length ? ' — ' + notes.join('; ') : ''}`);
    changed();
    return { notes };
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
    stop() { clearInterval(monitorTimer); tunnel.stop(); },
    report(id) { return rehearsal.readReport(id); },
    renderReport: r => rehearsal.renderHtml(r),
  };
}
