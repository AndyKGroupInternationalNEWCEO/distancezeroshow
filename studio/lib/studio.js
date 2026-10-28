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
import { createViewerChat } from './viewerchat.js';
import { createPlaylist } from './playlist.js';
import { createRunbooks } from './runbook.js';

// the build of the pages this server serves: when it changes after an update, open pages reload by themselves (outside a call)
// measured again every 5 s, so a page update needs no studio restart
let buildAt = 0, buildHash = '';
function BUILD_NOW() {
  if (Date.now() - buildAt < 5000) return buildHash;
  const h = crypto.createHash('sha1'), walk = d => { for (const f of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else h.update(f.name + fs.statSync(p).mtimeMs); } };
  try { walk(new URL('../public', import.meta.url).pathname); } catch {}
  buildAt = Date.now(); buildHash = h.digest('hex').slice(0, 10);
  return buildHash;
}
import { watchTunnel } from './tunnel.js';
import { cleanScript, isLocked, lockAt, startInstant, splitBySegments, renderHtml, LOCK_MINUTES } from './script.js';
import { createMidi } from './midi.js';

const ROLES = ['director', 'host', 'overlay', 'guest', 'stage'];
// Georgie's complete permission list. Calls and help requests are hers to make; nothing here reaches OBS.
const HOST_ACTIONS = new Set(['ping', 'chat.send', 'chat.read', 'host.status', 'vchat.say',
  'call.start', 'call.accept', 'call.decline', 'call.signal', 'call.end', 'call.media', 'call.stats', 'call.resume', 'help.raise', 'help.cancel',
  'check.echo', 'check.result', 'notes.set', 'monitors',  // monitors: watching the camera/program pictures only
  'fx.play', 'fx.stop']);  // SOUND FX pads, like the Director's
const OVERLAY_ACTIONS = new Set(['ping']);
// the Vienna Piano Stage page (OBS browser source): it reports what it does and answers commands, nothing else
const STAGE_ACTIONS = new Set(['ping', 'stage.report', 'stage.ack']);
const FORMATS = { sunday: 'DZ-SUN', friday: 'DJ-FRI', saturday: 'DZ-SAT' };
// an invited guest: their own waiting room only. No script, chat, notes, OBS, call or break conversation.
const GUEST_ACTIONS = new Set(['ping', 'guest.check', 'guest.snapshot', 'monitors', 'fx.play']);  // fx.play: only while on air
const CHAT_KEEP = 1000;
const LOG_KEEP = 200;
const LEADS = ['andrej', 'georgie', 'both'];
const str = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);

export function createStudio({ config, store, secrets, obs, media = null, sampleRundownPath, dzRoot = path.resolve(path.dirname(sampleRundownPath), '..', '..'), log = console }) {
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
    showId: saved.showId || '',
    // a running break: when it started, which microphones the studio muted for it (they come back on RETURN TO LIVE only)
    brk: saved.brk || { active: false },
    // THIRD SEAT: one invited guest at a time. Status: invited → waiting (online) → backstage (ADMIT) → onair (TAKE ON AIR)
    guest: saved.guest || null,
    fxVol: saved.fxVol || {},            // SOUND FX: each pad's own volume, 0–100 %
    mediaAir: saved.mediaAir || { audio: null, video: null },   // what the studio last put on air through the OBS players         // the selected show preset (Sunday / Friday), kept across restarts
  };
  state.gfx.partner = null;            // a partner line never survives a restart
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
  /* the rundown IS the active episode script. Every save also goes to data/episodes/<id>.json; before a changed
     version replaces the file, the previous one is kept in data/episodes/<id>.versions/ (at most one per minute, last 40) */
  const EP_DIR = path.join(store.dir, 'episodes');
  let lastVersionAt = 0;
  function saveRundown() {
    rundown.savedAt = Date.now();
    store.write('rundown.json', rundown);                                   // throws on failure: the client shows SAVE FAILED
    const ep = rundown.episode; if (!ep?.id) return;
    fs.mkdirSync(EP_DIR, { recursive: true, mode: 0o700 });
    const file = path.join(EP_DIR, ep.id + '.json'), body = JSON.stringify(rundown, null, 2);
    if (fs.existsSync(file)) {
      const old = fs.readFileSync(file, 'utf8');
      const strip = t => t.replace(/"savedAt": \d+,?/, '');
      if (strip(old) !== strip(body) && Date.now() - lastVersionAt > 60000) {
        const vdir = path.join(EP_DIR, ep.id + '.versions'); fs.mkdirSync(vdir, { recursive: true, mode: 0o700 });
        fs.writeFileSync(path.join(vdir, Date.now() + '.json'), old, { mode: 0o600 });
        lastVersionAt = Date.now();
        const all = fs.readdirSync(vdir).sort(); for (const f of all.slice(0, Math.max(0, all.length - 40))) fs.rmSync(path.join(vdir, f));
      }
    }
    const tmp = file + '.tmp'; fs.writeFileSync(tmp, body, { mode: 0o600 }); fs.renameSync(tmp, file);
  }
  const locked = () => isLocked(rundown.episode);
  // the production freeze: enforced here, on the server clock, for every way in (no unlock action exists)
  function assertEditable() {
    if (locked()) throw new Error('SCRIPT LOCKED — READY FOR BROADCAST. Editing is disabled from 180 minutes before the start.');
  }
  function episodeList() {
    try {
      return fs.readdirSync(EP_DIR).filter(f => f.endsWith('.json')).map(f => {
        try { const r = JSON.parse(fs.readFileSync(path.join(EP_DIR, f), 'utf8')); const e = cleanEpisode(r.episode);
          return e && { id: e.id, title: str(r.title, 120), format: e.format, date: e.date, start: e.start, locked: isLocked(e), savedAt: r.savedAt || 0 }; }
        catch { return null; }
      }).filter(Boolean).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.savedAt - a.savedAt);
    } catch { return []; }
  }
  function versionCount() { try { return fs.readdirSync(path.join(EP_DIR, rundown.episode.id + '.versions')).length; } catch { return 0; } }
  // a new episode = a copy of the show's master script (the master in studio/shows is never written)
  function episodeFromMaster(fmt, { date = '', start = '', title = '' } = {}) {
    const x = shows.find(s => s.id === fmt); if (!x) throw new Error('No such show format');
    const tag = FORMATS[fmt] || 'DZ-SUN', d = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
    let id = d ? `${tag}-${d.replace(/-/g, '')}` : `${tag}-DRAFT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
    for (let n = 2; fs.existsSync(path.join(EP_DIR, id + '.json')); n++) id = id.replace(/(-\d+)?$/, '') + '-' + n;
    return { title: str(title, 120) || str(x.rundown?.title, 120), sample: false,
      episode: cleanEpisode({ id, format: fmt, master: x.rundown?.master || '', date: d, start: /^\d{1,2}:\d{2}$/.test(start) ? start : (x.obs?.defaultStart || '') }),
      segments: (x.rundown?.segments || []).slice(0, 60).map(seg => cleanSegment({ ...seg, id: 'seg-' + crypto.randomBytes(4).toString('hex') }, 'seg')) };
  }
  // personal notes: Andrej's and Georgie's are separate files, each only ever sent to its owner
  const NOTE_FILE = who => path.join(store.dir, `notes-${who}.json`);
  const readNotes = who => { try { return JSON.parse(fs.readFileSync(NOTE_FILE(who), 'utf8')); } catch { return {}; } };
  const notesFor = who => (rundown.episode?.id && readNotes(who)[rundown.episode.id]) || {};

  /* show presets: studio/shows/*.json, one per show (Sunday // DISTANCE ZERO, Friday // DJ Andy'K). Selecting one sets
     the OBS scene collection, rundown, microphones, standby scene, transition and overlay graphics in one go. */
  const SHOWS_DIR = path.join(path.dirname(sampleRundownPath), 'shows');
  const shows = (() => {
    try { return fs.readdirSync(SHOWS_DIR).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(SHOWS_DIR, f), 'utf8'))).sort((a, b) => a.id.localeCompare(b.id)).reverse(); }
    catch { return []; }
  })();
  // the show selected here and the scene collection open in OBS must match; a mismatch is shown, never fixed silently
  function showCheck() {
    const x = shows.find(s => s.id === state.showId), want = x?.obs?.sceneCollection || '', have = obs.state.collection || '';
    return { want, have, ok: !want || !obs.state.connected || !have || want === have };
  }
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
    r.episode = cleanEpisode(r.episode);
    return r;
  }
  function cleanSegment(s, fallbackId) {
    return {
      id: str(s.id, 40) || fallbackId, title: str(s.title, 80) || 'Untitled', kind: str(s.kind, 12).toUpperCase() || 'TALK',
      minutes: Math.max(0, Math.min(600, Math.round((Number(s.minutes) || 0) * 2) / 2)), lead: LEADS.includes(s.lead) ? s.lead : 'both',
      notes: str(s.notes, 2000),
      ...cleanScript(s),
    };
  }
  function cleanEpisode(e) {
    if (!e || !e.id) return null;
    const startAt = startInstant(e.date, e.start);
    return { id: str(e.id, 40), format: FORMATS[e.format] ? e.format : 'sunday', master: str(e.master, 40), date: str(e.date, 10), start: str(e.start, 5), startAt };
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
    // nothing plays unless Andrej starts it: OBS starts every media source in a showing scene when it loads (the jingles and
    // beds sit in AUDIO // ALL, inside every show scene), so on connect they are stopped. The silent background loops stay,
    // and nothing is touched while streaming or recording.
    if (up) setTimeout(async () => {
      const o = obs.state;
      if (!o.connected || o.stream.active || o.record.active) return;
      const keep = new Set(['Video Player', 'Studio Loop']);
      const stopped = [];
      for (const m of o.media || []) if (!keep.has(m.name)) { await obs.stopFile(m.name).catch(() => {}); stopped.push(m.name); }
      state.mediaAir.audio = null; state.mediaAir.fx = null; bedOn = null;   // the bed starts again if a loop is running
      if (stopped.length) logEvent('ok', `OBS opened: stopped ${stopped.length} sounds that start by themselves (${stopped.join(', ')})`);
      changed();
    }, 2500);
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
  // the website's live chat, read in the studio; Andrej and Georgie answer under their reserved names
  const vchat = config.viewerChat?.url && config.viewerChat?.key
    ? createViewerChat({ ...config.viewerChat, log: (level, text) => logEvent(level, text), onChange: () => changed() }) : null;
  const talk = createTalk({ state, clients, obs, changed: () => changed(), logEvent, notify, hooks: rehearsal.hooks, graceMs: config.call?.graceMs });

  /* ---------- VIENNA PIANO STAGE (Saturday): the stage page in OBS, driven from here ----------
     The page (/piano-stage/, see lib/stage.js) connects with the stage key and reports twice a second. Commands go to
     ONE page only: the OBS browser source if there is one (its browser says "OBS/"), otherwise the newest. A second
     page (a preview tab in Chrome) is reported, because its sound would play out of this Mac's speakers. */
  const stageClients = () => [...clients].filter(c => c.role === 'stage');
  const stageTarget = () => { const l = stageClients(); return l.filter(c => c.report?.obs).at(-1) || l.at(-1) || null; };
  const stageWait = new Map();
  let stageSeq = 0;
  const stage = {
    connected: () => !!stageTarget(),
    report: () => stageTarget()?.report || null,
    masterUrl: id => `/piano-stage/master/${encodeURIComponent(id)}?k=${secrets.overlayKey}`,
    send(cmd) {
      const c = stageTarget();
      if (!c) return Promise.reject(new Error('The Vienna Piano Stage page is not connected (OBS browser source "Piano Stage")'));
      const ref = 's' + ++stageSeq;
      c.send({ t: 'stage.cmd', ref, ...cmd });
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { stageWait.delete(ref); reject(new Error('The Vienna Piano Stage did not answer')); }, 4000);
        stageWait.set(ref, r => { clearTimeout(timer); resolve(r); });
      });
    },
  };
  const stageView = () => {
    const l = stageClients(), t = stageTarget();
    return { connected: !!t, pages: l.length, obsPages: l.filter(c => c.report?.obs).length, report: t?.report || null, available: !!config.pianoStage?.root };
  };
  const playlist = createPlaylist({ showsDir: SHOWS_DIR, dzRoot, obs, state, stage, logEvent, changed: () => changed() });
  const currentShow = () => shows.find(s => s.id === state.showId) || null;
  playlist.build(currentShow());

  /* ---------- MIDI (lib/midi.js): the Mac's keyboard plays the grand on the stage; learned controls fire actions ----------
     A note goes straight to the stage page (no answer awaited: a key must sound at once); a learned control runs the
     same action as its button in the Director. */
  const stageNote = n => { const c = stageTarget(); if (c) c.send({ t: 'stage.cmd', cmd: 'note', ...n }); };
  async function midiAction(a) {
    const [k, arg] = a.split(':');
    const mics = currentShow()?.mics || [];
    if (k === 'play') return playlist.action({ action: playlist.view()?.status === 'playing' ? 'pause' : 'play', mics });
    if (k === 'talk') return playlist.action({ action: 'talk', on: !playlist.view()?.talk, mics });
    if (['stop', 'next', 'prev'].includes(k)) return playlist.action({ action: k, mics });
    if (k === 'cam') return stageAction({ cmd: 'cam', cam: arg });
    if (k === 'mode') return stageAction({ cmd: 'mode', mode: arg });
  }
  const midi = config.midi?.enabled === false ? null : createMidi({
    dataDir: store.dir, log: (level, text) => logEvent(level, text), onKeys: stageNote,
    onAction: a => midiAction(a).catch(e => logEvent('warn', `MIDI ${a}: ${e.message}`)),
    onEvent: e => { for (const c of clients) if (c.role === 'director') c.send({ t: 'midi', e, v: midi.view() }); },
  });
  // what the director may tell the stage directly (show segments, cameras, lighting, lift)
  const STAGE_CMDS = new Set(['start', 'stop', 'restart', 'skip', 'live', 'between', 'between-stop', 'return-live', 'closing', 'closing-stop', 'closing-restart', 'cam', 'mode', 'lift', 'seek', 'transition']);
  async function stageAction(msg) {
    if (!STAGE_CMDS.has(msg.cmd)) throw new Error('Unknown stage command');
    const r = await stage.send({ cmd: msg.cmd, cam: str(msg.cam, 4), mode: str(msg.mode, 20), lift: str(msg.lift, 8), time: Math.max(0, Number(msg.time) || 0) });
    if (r.error) throw new Error(r.error);
    logEvent('ok', `PIANO STAGE ${msg.cmd}${msg.cam ? ' ' + msg.cam : ''}${msg.mode ? ' ' + msg.mode : ''}${msg.lift ? ' ' + msg.lift : ''} → ${r.r?.label || r.r?.state || ''}`);
    return { state: r.r?.state, say: r.say };
  }

  /* ---------- SHOW RUNBOOKS: a PDF script per show (lib/runbook.js) ---------- */
  const runbooks = createRunbooks({ dir: path.join(store.dir, 'runbooks') });
  const runbookList = () => Object.fromEntries(shows.map(s => [s.id, runbooks.summary(s.id)]));

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
  const scriptState = () => ({ episode: rundown.episode, locked: locked(), lockAt: lockAt(rundown.episode), lockMinutes: LOCK_MINUTES, savedAt: rundown.savedAt || 0 });
  const rundownView = () => ({ title: rundown.title, sample: !!rundown.sample, segments: rundown.segments, ...state.pos, ...scriptState() });
  // Georgie: the script and cues, never the Director's own instructions
  const spokenOnly = t => String(t || '').split('\n').filter(l => !/^\s*\[(DIRECTOR|CUE|TECH)[^\]]*\]/i.test(l)).join('\n');
  const hostRundownView = () => ({ ...rundownView(), segments: rundown.segments.map(({ director, ...seg }) => ({ ...seg, script: spokenOnly(seg.script) })) });
  // titles of the jingles and videos the script refers to (Georgie sees the cues by name, never the files)
  function cueTitles() {
    const out = {};
    for (const seg of rundown.segments) for (const k of ['jingle', 'video', 'returnJingle', 'returnVideo', 'loopAfter']) {
      const id = seg.cues?.[k]; const m = id && media?.get(id);
      if (m) out[id] = { title: m.title, available: m.available };
    }
    return out;
  }
  // the SOUND FX pads as Georgie and an on-air guest see them: names and whether they can play, never files
  const fxPads = () => (media?.view(state.showId).fx || []).filter(x => x.forShow).map(x => ({ id: x.id, title: x.title, available: x.available && obs.state.connected }));
  const showView = () => ({ title: config.show.title, launch: config.show.launch, schedule: config.show.schedule });

  function view(role) {
    const o = obs.state;
    if (role === 'director') {
      const { audio, ...rest } = o;
      return {
        show: showView(), shows: showList(), showId: state.showId, media: media?.view(state.showId) || null, mediaAir: state.mediaAir, fxVol: state.fxVol, rundown: rundownView(), now: Date.now(), brk: breakView('director'), showCheck: showCheck(), streamArmedUntil: state.streamArmedUntil || 0, guest: guestView('director'), credits: creditsView(), episodes: episodeList(), versions: versionCount(), myNotes: notesFor('andrej'), templates, note: state.note, music: state.music, musicLog: state.musicLog, gfx: state.gfx,
        presence: presence(), hostStatus: state.hostStatus, read: state.read, reminders: state.reminders,
        obs: { ...rest, audio: audio.map(({ db, ...a }) => a), previewScene: previewScene() },
        standby: { scene: standbyScene(), exists: obs.hasScene(standbyScene()) },
        settings: {
          standbyScene: standbyScene(), micMode: obs.micInputs.size ? 'list' : 'pattern', micPattern: config.emergency.micPattern,
          obsUrl: config.obs.url, directorPort: config.director.port, guestPort: config.guest.port, dataDir: store.dir,
        },
        vdo: { view: vdo.view, push: vdo.push }, overlayKey: secrets.overlayKey,
        playlist: playlist.view(), stage: stageView(), runbooks: runbookList(), showMics: currentShow()?.mics || [],
        ...talk.view('director'), ice: config.call?.iceServers || [], ...rehearsal.view('director'), build: BUILD_NOW(), viewerChat: vchat?.view() || null,
      };
    }
    if (role === 'host') {
      return {
        show: showView(), rundown: hostRundownView(), now: Date.now(), brk: breakView('host'), guest: guestView('host'), cueTitles: cueTitles(), myNotes: notesFor('georgie'), note: state.note, music: state.music,
        presence: presence(), read: state.read,
        // tally only: Georgie sees whether the show is live, never anything she could act on
        tally: { obs: o.connected, onAir: o.stream.active, recording: o.record.active },
        fx: fxPads(), fxAir: state.mediaAir.fx || null,
        vdo: { push: vdo.push },
        ...talk.view('host'), ice: config.call?.iceServers || [], ...rehearsal.view('host'), build: BUILD_NOW(), viewerChat: vchat?.view() || null,
        showRunning: !!state.pos.showStartedAt,   // her page answers Andrej's call by itself while a show or rehearsal runs
      };
    }
    if (role === 'guest') {
      const g = state.guest;
      return { show: { title: config.show.title }, now: Date.now(),
        guest: g ? { name: g.name, status: g.status, check: g.check || null, push: ['backstage', 'onair'].includes(g.status) ? guestLinks(g).push : '' } : null,
        fx: g?.status === 'onair' ? fxPads() : [],
        tally: { onAir: obs.state.stream.active },
        // backstage and on air the guest READS the viewer chat (to react on air); only the hosts answer
        viewerChat: vchat && ['backstage', 'onair'].includes(g?.status) ? { ...vchat.view(), readOnly: true } : null,
        segment: rundown.segments[state.pos.index] ? { title: rundown.segments[state.pos.index].title } : null };
    }
    if (role === 'stage') return { now: Date.now() };
    const seg = rundown.segments[state.pos.index];
    return { show: showView(), roll: state.gfx.credits ? creditRoll() : null, gfx: state.gfx, segment: seg ? { title: seg.title, kind: seg.kind } : null };
  }

  /* ---------- fan-out ---------- */

  const broadcastState = debounced(() => {
    const cache = {};
    for (const c of clients) if (c.role !== 'stage') c.send({ t: 'state', s: cache[c.role] ??= view(c.role) });
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

  /* monitors: OBS screenshots, a few per second, only while someone watches.
     'live' (Live Control): program and preview. 'show' (SHOW and the Host dashboard): CAMERA 01 ANDY'K, PROGRAM,
     CAMERA 02 GEORGIE — the real camera sources in OBS; a source this show does not have is reported, never faked. */
  const CAMS = { camA: 'Cam // Andrej', camB: 'VDO // Georgie' };
  const busy = {};
  let tick = 0;
  const monitorTimer = setInterval(() => {
    const watchers = [...clients].filter(c => c.monitors);
    if (!watchers.length || !obs.state.connected) return;
    tick++;
    const live = watchers.filter(c => c.monitors === 'live'), show = watchers.filter(c => c.monitors === 'show');
    const jobs = [];
    if (!live.length && !show.length) jobs.push(['program', obs.state.program, watchers, 480]);   // only guests watching
    if (live.length) for (const which of tick % 2 ? ['program', 'preview'] : ['program']) jobs.push([which, which === 'program' ? obs.state.program : previewScene(), live, 640]);
    if (live.length && !show.length && talk.call?.phase === 'active' && tick % 3 === 2) jobs.push(['camB', CAMS.camB, live, 480]);   // Georgie in the call window
    if (show.length) {
      if (!live.length) jobs.push(['program', obs.state.program, show, 800]);   // the big monitor in the middle
      if (tick % 3 === 0) jobs.push(['camA', CAMS.camA, show, 480]);
      if (tick % 3 === 1) jobs.push(['camB', CAMS.camB, show, 480]);
      if (tick % 3 === 2 && ['backstage', 'onair'].includes(state.guest?.status)) jobs.push(['guest', 'VDO // Guest', show, 480]);
    }
    for (const [which, source, to, width] of jobs) {
      if (!source || busy[which]) continue;
      busy[which] = true;
      // the program picture goes to every watcher; the Live monitors share it with SHOW watchers
      const targets = which === 'program' ? watchers : to;
      obs.screenshot(source, width).then(img => {
        const now = Date.now();
        for (const c of targets) {
          // Georgie's pictures travel over her internet link next to her camera: at most about one per second each
          if (c.role === 'guest' && which !== 'program') continue;   // a guest sees the program only
          if (c.role === 'host' || c.role === 'guest') { c.lastFrame ||= {}; if (now - (c.lastFrame[which] || 0) < 900) continue; c.lastFrame[which] = now; }
          c.send({ t: 'frame', which, scene: source, img });
        }
      }).catch(e => {
        for (const c of targets) c.send({ t: 'frame', which, scene: source, img: null, missing: /600|No source|not found/i.test(String(e.message || e)) });
      }).finally(() => { busy[which] = false; });
    }
  }, 280);

  function toRole(role, msg) { for (const c of clients) if (c.role === role) c.send(msg); }

  /* ---------- connections ---------- */

  const count = role => [...clients].filter(c => c.role === role).length;
  function connect(ws, role, { remote = false, guestId = '' } = {}) {
    if (!ROLES.includes(role)) throw new Error('unknown role');
    const client = {
      ws, role, remote, monitors: false, guestId,
      send(msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); },
    };
    clients.add(client);
    if (role === 'guest') guestPresence(true);
    client.send({ t: 'hello', role });
    client.send({ t: 'state', s: view(role) });
    if (role === 'director' || role === 'host') client.send({ t: 'chat.history', msgs: chat.slice(-200) });
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
          if (msg.id) client.send({ t: 'ack', id: msg.id, ok: false, error: err.message, ...(err.check ? { check: err.check } : {}) });
        },
      );
    });
    ws.on('close', () => {
      clients.delete(client);
      if (role === 'host' && !count('host')) notify('warn', 'host-down', 'Georgie disconnected. Her page reconnects by itself; if she is not back in 30 s, call her phone.');
      if (role === 'director' && !count('director')) { logEvent('warn', 'Director Studio disconnected', 'director-down'); notify('warn', 'director-down', 'Andrej\'s studio is reconnecting. Stay where you are.', { to: ['host'] }); }
      talk.onClose(client);
      if (role === 'overlay') logEvent('warn', 'Graphics overlay disconnected');
      if (role === 'stage' && client.report) notify(obs.state.stream.active ? 'critical' : 'warn', 'stage-down', 'The Vienna Piano Stage page disconnected (it reconnects by itself; in OBS: Piano Stage → Refresh)', { sound: obs.state.stream.active });
      if (role === 'guest') guestPresence(false);
      broadcastState();
    });
  }

  /* ---------- messages ---------- */

  async function handle(client, msg) {
    const { role } = client;
    if (role === 'host' && !HOST_ACTIONS.has(msg.t)) throw new Error('Not allowed for the host role');
    if (role === 'overlay' && !OVERLAY_ACTIONS.has(msg.t)) throw new Error('Not allowed for the overlay role');
    if (role === 'guest' && !GUEST_ACTIONS.has(msg.t)) throw new Error('Not allowed for a guest');
    if (role === 'stage' && !STAGE_ACTIONS.has(msg.t)) throw new Error('Not allowed for the stage page');

    switch (msg.t) {
      case 'ping': client.send({ t: 'pong', ts: msg.ts }); return;
      case 'chat.send': return chatSend(role, msg.text);
      case 'vchat.say': if (!vchat) throw new Error('The viewer chat is not set up'); vchat.say(role === 'host' ? 'Georgie' : 'Andrej', msg.text); return;
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
        if (state.hostStatus.vdo || state.hostStatus.camera) talk.autoResolve('camera-check', state.hostStatus.camera ? 'camera works' : 'she is in VDO.Ninja');
        changed(); return;
      }
      case 'monitors': client.monitors = role === 'guest' ? (msg.on ? 'program' : false) : msg.on === 'show' || (role === 'host' && msg.on) ? 'show' : msg.on ? 'live' : false; return;
      case 'assist': return talk.handle(client, msg);
      case 'obs': return obsAction(msg);
      case 'rundown': return rundownAction(msg);
      case 'note': state.note = str(msg.text, 2000); changed(); return;
      case 'music': return musicAction(msg);
      case 'reminder': return reminderAction(msg);
      case 'settings': return settingsAction(msg);
      case 'gfx': return gfxAction(msg);
      case 'show.check': return switchCheck(str(msg.show, 30));
      case 'show.select': return selectShow(msg);
      case 'episode.new': return episodeNew(msg);
      case 'episode.open': return episodeOpen(msg);
      case 'episode.meta': return episodeMeta(msg);
      case 'script.update': return scriptUpdate(msg);
      case 'script.restore': return scriptRestore();
      case 'script.parse': return { ...splitBySegments(str(msg.text, 400000), rundown.segments) };
      case 'script.import': return scriptImport(msg);
      case 'notes.set': return notesSet(client, msg);
      case 'media.air': return mediaAir(msg);
      case 'media.stop': return mediaStop(msg);
      case 'fx.play': return fxPlay(msg, client);
      case 'fx.stop': return fxStop();
      case 'fx.volume': state.fxVol[str(msg.fx, 4)] = Math.max(0, Math.min(100, Math.round(Number(msg.volume) || 0))); changed(); return;
      case 'media.rescan': media?.scan(); changed(); return;
      case 'cue.go': return cueGo(msg);
      case 'credits': return creditsAction(msg);
      case 'preshow': return preshow(msg);
      case 'guest.invite': return guestInvite(msg);
      case 'guest.admit': return guestAdmit();
      case 'guest.waiting': return guestBack();
      case 'guest.onair': return guestOnAir(msg);
      case 'guest.offair': return guestOffAir();
      case 'guest.end': return guestEnd();
      case 'guest.check': {
        const g = state.guest; if (!g || client.guestId !== g.id) throw new Error('This invitation has ended');
        g.check = { camera: !!msg.camera, mic: !!msg.mic, at: Date.now() }; changed(); return;
      }
      case 'guest.snapshot': {
        // a still picture from the guest's camera check, for the Director's preview only (kept in memory, never saved)
        const g = state.guest; if (!g || client.guestId !== g.id) throw new Error('This invitation has ended');
        const img = String(msg.img || '');
        if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(img) || img.length > 60000) throw new Error('Bad picture');
        guestSnap = { img, at: Date.now() }; toRole('director', { t: 'guest.snap', img, at: guestSnap.at }); return;
      }
      case 'cue.fire': return cueFire(msg);
      case 'stage.report': {
        if (role !== 'stage') throw new Error('Not allowed');
        // the stage page's own state; only numbers, short words and its last message are kept
        const r = msg.r || {};
        const was = client.report;
        client.report = { state: str(r.state, 20), paused: !!r.paused, segment: str(r.segment, 20), label: str(r.label, 120), clock: str(r.clock, 20),
          time: Math.max(0, Number(r.time) || 0), duration: Math.max(0, Number(r.duration) || 0), song: r.song ? str(r.song, 80) : null,
          program: str(r.program, 4), view: str(r.view, 20), mode: str(r.mode, 20), lift: str(r.lift, 12), height: Number(r.height) || 0,
          keys: str(r.keys, 20), say: str(r.say, 240), obs: !!r.obs, audio: r.audio ? { paused: !!r.audio.paused, muted: !!r.audio.muted, error: Number(r.audio.error) || 0 } : null, at: Date.now() };
        if (!was) logEvent('ok', `Vienna Piano Stage connected${client.report.obs ? ' (OBS browser source)' : ' (a browser page, not OBS)'}`);
        // the Director sees every change of segment, song, camera, light, lift or message, and the time once a second
        const sig = x => x && JSON.stringify({ ...x, time: Math.floor(x.time), height: Math.round(x.height * 4), at: 0 });
        if (sig(was) !== sig(client.report)) broadcastState();
        return;
      }
      case 'stage.ack': { if (role !== 'stage') throw new Error('Not allowed'); const w = stageWait.get(str(msg.ref, 20)); if (w) { stageWait.delete(str(msg.ref, 20)); w({ error: str(msg.error, 240), say: str(msg.say, 240), r: msg.r || null }); } return; }
      case 'stage': return stageAction(msg);
      case 'playlist': return playlist.action({ ...msg, mics: currentShow()?.mics || [] });
      case 'midi': {
        if (role !== 'director') throw new Error('Not allowed');
        if (!midi) throw new Error('MIDI is turned off in config.json');
        if (msg.action === 'learn') midi.learn(str(msg.what, 40));
        else if (msg.action === 'unbind') midi.unbind(str(msg.key, 200));
        else if (msg.action === 'kind') midi.setKind(str(msg.name, 120), str(msg.kind, 8));
        return midi.view();
      }
      case 'runbook.get': return runbooks.view(str(msg.show, 30) || state.showId);
      case 'runbook.note': runbooks.setNote(str(msg.show, 30) || state.showId, msg.key, msg.text); return { savedAt: Date.now() };
      case 'runbook.remove': {
        if (msg.confirm !== true) throw new Error('Needs confirmation');
        runbooks.remove(str(msg.show, 30)); logEvent('ok', `Runbook removed: ${str(msg.show, 30)}`); changed(); return;
      }
      case 'break.return': return breakReturn(msg);
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
      case 'stream.arm':
        // GO LIVE is locked until it is unlocked on purpose, and locks itself again after 60 seconds
        state.streamArmedUntil = msg.on ? Date.now() + 60000 : 0; changed(); return { until: state.streamArmedUntil };
      case 'stream':
        if (msg.confirm !== true) throw new Error('Stream start/stop needs confirmation');
        if (msg.on && rehearsal.active) throw new Error('Rehearsal mode: the YouTube stream is locked. End the rehearsal first.');
        if (msg.on && !(state.streamArmedUntil > Date.now())) throw new Error('GO LIVE is locked. Unlock it first (Live Control → UNLOCK GO LIVE), then hold GO LIVE.');
        await obs.stream(!!msg.on);
        state.streamArmedUntil = 0;
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
      assertEditable();
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
    if (state.brk.active && ['next', 'prev', 'go'].includes(msg.action)) throw new Error('A break is running: use RETURN TO LIVE');
    switch (msg.action) {
      case 'next': go(Math.min(p.index + 1, segs.length - 1)); break;
      case 'prev': go(Math.max(p.index - 1, 0)); break;
      case 'go': go(Number(msg.index)); break;
      case 'reset':
        if (state.brk.active) logEvent('warn', `Show reset during a break: ${state.brk.muted.join(', ') || 'no microphones'} stay muted until you unmute them`);
        p.index = -1; p.segmentStartedAt = null; p.showStartedAt = null; state.brk = { active: false }; break;
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
        assertEditable();
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
      case 'reload': assertEditable(); rundown = loadRundown(); if (p.index >= rundown.segments.length) { p.index = -1; p.segmentStartedAt = null; } break;
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

  /* JINGLES // AUDIO and VIDEOS // VISUALS on air: one deliberate Director action loads the file into the show's
     Jingle Player / Video Player in OBS. A video with its own sound never gets the separate WAV on top unless asked. */
  async function mediaAir(msg) {
    const item = media?.get(str(msg.media, 4));
    if (!item) throw new Error('No such media');
    if (!item.available) throw new Error(`${item.id} — ${item.title}: ${item.type === 'video' ? 'VIDEO' : 'AUDIO'} NOT AVAILABLE`);
    if (!obs.state.connected) throw new Error('OBS is not connected');
    if (item.type === 'audio') {
      await obs.playFile('Jingle Player', item.file, false);
      state.mediaAir.audio = { id: item.id, title: item.title, at: Date.now() };
    } else {
      const scene = str(msg.scene, 256);
      resetAfter();
      const vp = (obs.state.audio || []).find(a => a.name === 'Video Player');
      if (vp?.muted) await obs.setMute('Video Player', false).catch(() => {});   // after a muted background loop
      await obs.playFile('Video Player', item.file, !!msg.loop);
      state.mediaAir.video = { id: item.id, title: item.title, at: Date.now(), loop: !!msg.loop, embeddedAudio: !!item.embeddedAudio };
      // the picture: the given scene, or VT when the program scene has no Video Player
      const target = scene || (obs.state.items.some(i => i.name === 'Video Player') ? '' : 'VT');
      if (target) await obs.setProgram(target);
      if (msg.withAudio && item.linkedAudio) {
        if (item.embeddedAudio && msg.audioMode !== 'both') throw new Error('This video has its own sound: the linked jingle was not added (choose "both" to play both)');
        const a = media.get(item.linkedAudio);
        if (a?.available) { await obs.playFile('Jingle Player', a.file, false); state.mediaAir.audio = { id: a.id, title: a.title, at: Date.now() }; }
      }
    }
    logEvent('ok', `On air: ${item.id} — ${item.title}`);
    changed();
  }
  async function mediaStop(msg) {
    const kinds = msg.kind === 'audio' ? ['audio'] : msg.kind === 'video' ? ['video'] : ['audio', 'video'];
    if (kinds.includes('video')) resetAfter();
    for (const k of kinds) { await obs.stopFile(k === 'audio' ? 'Jingle Player' : 'Video Player'); state.mediaAir[k] = null; }
    logEvent('ok', `Stopped: ${kinds.join(' + ')}`);
    changed();
  }

  /* SOUND FX: short effects (call ring, laugh, applause…) on their own OBS FX Player, only by hand. They never stop the
     jingle or the video, and they do nothing else: the call ring does not answer a call or put a caller on air. */
  const FX_GAP = 1500;   // Georgie and the guest: one effect at a time, not a stream of them
  async function fxPlay(msg, client = {}) {
    const who = client.role || 'director';
    if (who === 'guest' && state.guest?.status !== 'onair') throw new Error('Sound effects work only while you are on air');
    if (who !== 'director') {
      if (Date.now() - (client.fxAt || 0) < FX_GAP) throw new Error('One moment: the last effect is still playing');
      client.fxAt = Date.now();
    }
    const fx = media?.get(str(msg.fx, 4));
    if (!fx || fx.type !== 'fx') throw new Error('No such sound effect');
    if (!fx.available) throw new Error(`${fx.id} — ${fx.title}: FILE NOT AVAILABLE`);
    if (!obs.state.connected) throw new Error('OBS is not connected');
    if (!hasInput('FX Player')) throw new Error('OBS has no FX Player yet (npm run obs-setup -- sunday friday --players)');
    const vol = state.fxVol[fx.id] ?? 80;
    if ((obs.state.audio || []).some(a => a.name === 'FX Player')) await obs.setVolume('FX Player', vol > 0 ? 20 * Math.log10(vol / 100) : -100);
    await obs.playFile('FX Player', fx.file, false);
    state.mediaAir.fx = { id: fx.id, title: fx.title, at: Date.now() };
    logEvent('ok', `Sound FX: ${fx.id} — ${fx.title} (${vol} %)${who === 'director' ? '' : who === 'host' ? ' · by Georgie' : ' · by the guest'}`);
    changed();
  }
  async function fxStop() {
    await obs.stopFile('FX Player'); state.mediaAir.fx = null; changed();
  }

  /* ---------- SHOW CLOCK, linked cues and breaks ----------
     One deliberate Director action moves to a segment and fires its cues together: OBS scene, video (once or loop),
     jingle. A video with its own sound never gets the WAV on top unless the cue says "both". Nothing advances by
     itself: a break that reaches zero shows BREAK COMPLETE — READY TO RETURN and waits for RETURN TO LIVE. */
  const hasInput = n => obs.state.media.some(m => m.name === n);
  // after the cue's video: the next videos of the sequence, then a background loop, or back to the planned shot
  let videoQueue = [], afterLoop = null, afterScene = '';
  const resetAfter = () => { videoQueue = []; afterLoop = null; afterScene = ''; };
  // one video into the Video Player. A background loop plays without sound; a video with its own sound stops the
  // running jingle, so the two never play on top of each other.
  async function startVideo(v, { loop = false, background = false } = {}) {
    const vp = (obs.state.audio || []).find(a => a.name === 'Video Player');
    if (vp && vp.muted !== background) await obs.setMute('Video Player', background).catch(() => {});
    let note = '';
    if (!background && v.embeddedAudio && state.mediaAir.audio && hasInput('Jingle Player')) {
      note = `JINGLE ${state.mediaAir.audio.id} stopped: the video carries its own sound`;
      await obs.stopFile('Jingle Player'); state.mediaAir.audio = null;
    }
    await obs.playFile('Video Player', v.file, loop, { keep: !loop && (videoQueue.length > 0 || !!afterLoop) });
    state.mediaAir.video = { id: v.id, title: v.title, at: Date.now(), loop, background, embeddedAudio: !!v.embeddedAudio };
    return note;
  }
  // MUSIC UNDER THE LOOP: whenever the silent background loop runs, the Three-Note Signature bed plays quietly under it;
  // any other video, a break, a stop or no video at all stops it again. Checked twice a second, so every path is covered.
  const BED = 'Bed // Three-Note Signature', BED_DB = -18;
  let bedOn = null;
  const bedTimer = setInterval(async () => {
    if (!obs.state.connected || !hasInput(BED)) { bedOn = null; return; }
    const want = !!state.mediaAir.video?.background;
    if (want === bedOn) return;
    bedOn = want;
    try {
      if (want) { await obs.setVolume(BED, BED_DB).catch(() => {}); await obs.request('TriggerMediaInputAction', { inputName: BED, mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART' }); }
      else await obs.stopFile(BED);
      logEvent('ok', `Music under the loop: Three-Note Signature ${want ? 'on' : 'off'}`);
    } catch (e) { bedOn = null; }
  }, 500);
  bedTimer.unref?.();

  // nothing plays unless Andrej starts it, also after a scene change: OBS restarts the sounds inside AUDIO // ALL whenever a
  // scene with it comes on (program, or preview in Studio Mode). A start within 2 s of a scene change is OBS's, not
  // Andrej's: it is stopped. A sound he plays by hand in OBS later keeps playing.
  const SELF_STARTERS = new Set(['Jingle // D//0 Opening', 'Jingle // slot 2', 'Jingle // slot 3', 'Music // DISTANCE ZERO Theme', 'Bed // Three-Note Signature B', BED]);
  let sceneAt = 0;
  obs.on('scene.changed', () => { sceneAt = Date.now(); });
  obs.on('media.started', async name => {
    if (!SELF_STARTERS.has(name) || Date.now() - sceneAt > 2000) return;
    if (name === BED && bedOn) return;                       // the music under the loop is the studio's own
    await obs.stopFile(name).catch(() => {});
    logEvent('ok', `Stopped ${name}: OBS started it by itself after a scene change`);
  });

  obs.on('media.ended', async name => {
    if (name !== 'Video Player' || state.mediaAir.video?.loop) return;
    try {
      if (videoQueue.length) {
        const v = videoQueue.shift();
        const note = await startVideo(v);
        logEvent('ok', `Next in sequence: ${v.id} — ${v.title}`); if (note) logEvent('ok', note);
      } else if (afterLoop) {
        const v = afterLoop; afterLoop = null;
        await startVideo(v, { loop: true, background: true });
        logEvent('ok', `Background loop: ${v.id} — ${v.title} (no sound) until the next GO`);
      } else if (afterScene) {
        const sc = afterScene; afterScene = ''; state.mediaAir.video = null;
        // only while the video is still on program: a scene Andrej cut to by hand stays
        if (obs.state.program !== 'VT') logEvent('ok', `Video ended: ${obs.state.program} stays (cut by hand), ${sc} not taken`);
        else if (obs.hasScene(sc)) { await obs.setProgram(sc); logEvent('ok', `Video ended: back to ${sc}`); }
      } else if (state.mediaAir.video) state.mediaAir.video = null;
      changed();
    } catch (e) { resetAfter(); logEvent('warn', `Sequence stopped: ${e.message}`); }
  });
  async function sceneHas(scene, src) {
    try { return (await obs.request('GetSceneItemList', { sceneName: scene })).sceneItems.some(i => i.sourceName === src); } catch { return false; }
  }
  async function fireCues(c) {
    c = { ...c };
    if (!obs.state.connected) throw new Error('OBS is not connected');
    const done = [], skipped = [];
    let vid = c.video ? media?.get(c.video) : null; const wav = c.jingle ? media?.get(c.jingle) : null;
    if (c.fallbackVideo && (!vid || !vid.available)) {
      const fb = media?.get(c.fallbackVideo);
      if (fb?.available) { skipped.push(`${vid ? vid.id + ' — ' + vid.title : c.video || 'Planned video'} NOT AVAILABLE: fallback ${fb.id} — ${fb.title} plays instead`); vid = fb; c = { ...c, video: fb.id, mode: c.fallbackMode }; }
    }
    if (c.video && !vid) skipped.push(`${c.video}: not in the media library`);
    if (c.jingle && !wav) skipped.push(`${c.jingle}: not in the media library`);
    let scene = c.scene;
    if (scene && !obs.hasScene(scene)) { skipped.push(`SCENE ${scene}: not in this OBS collection`); scene = ''; }
    const playVideo = vid?.available && hasInput('Video Player');
    if (vid && !vid.available) skipped.push(`${vid.id} — ${vid.title}: VIDEO NOT AVAILABLE`);
    else if (vid && !playVideo) skipped.push(`${vid.id}: OBS has no Video Player yet (npm run obs-setup -- --players)`);
    // the picture: the cue's scene if it shows the Video Player, otherwise the VT scene for the video; when the video
    // ends there, the planned shot follows by itself
    resetAfter();
    if (playVideo && scene && !(await sceneHas(scene, 'Video Player'))) { if (obs.hasScene('VT')) { skipped.push(`SCENE ${scene} has no Video Player: the video plays in VT, then ${scene}`); afterScene = scene; scene = 'VT'; } }
    // a sequence: the videos that follow this one, each played once when the previous one ends; then the background loop
    const next = (c.thenVideos || []).map(id => media?.get(id)).filter(x => { if (x?.available) return true; skipped.push(`THEN ${x ? x.id + ' — ' + x.title : 'video'}: NOT AVAILABLE, left out`); return false; });
    const bg = c.loopAfter ? media?.get(c.loopAfter) : null;
    if (c.loopAfter && !bg?.available) skipped.push(`LOOP ${bg ? bg.id + ' — ' + bg.title : c.loopAfter}: NOT AVAILABLE, the shot below shows after the video`);
    if (playVideo) {
      const loop = c.mode === 'loop';
      videoQueue = loop ? [] : next;
      afterLoop = !loop && bg?.available ? bg : null;
      if (afterLoop) afterScene = '';
      const note = await startVideo(vid, { loop });
      if (note) done.push(note);
      done.push(`VIDEO ${vid.id} — ${vid.title}${loop ? ' (LOOP)' : ''}${videoQueue.length ? ' → ' + videoQueue.map(x => x.id).join(' → ') : ''}${afterLoop ? ` → ${afterLoop.id} LOOP (no sound)` : ''}`);
    }
    // a segment without a video of its own: the previous one (an opening, a loop) must not stay over the cameras
    if (!c.video && state.mediaAir.video && hasInput('Video Player')) {
      const id = state.mediaAir.video.id; state.mediaAir.video = null;
      await obs.stopFile('Video Player'); done.push(`VIDEO ${id} stopped`);
    }
    if (scene) { await obs.setProgram(scene); done.push(`SCENE ${scene}`); }
    // Saturday: the Vienna Piano Stage's own segment (opening → piano theme → live, between songs, closing)
    if (c.stage) {
      if (!stage.connected()) skipped.push(`PIANO STAGE ${c.stage}: the stage page is not connected`);
      else {
        const r = await stage.send({ cmd: c.stage }).catch(e => ({ error: e.message }));
        if (r.error) skipped.push(`PIANO STAGE ${c.stage}: ${r.error}`); else done.push(`PIANO STAGE ${c.stage.toUpperCase()} → ${r.r?.label || r.r?.state || ''}`);
      }
    }
    if (wav) {
      const videoSound = playVideo && vid.embeddedAudio;
      if (c.audioMode === 'video' || (videoSound && c.audioMode !== 'both')) skipped.push(`${wav.id} — ${wav.title}: not played, the video carries the sound`);
      else if (!wav.available) skipped.push(`${wav.id} — ${wav.title}: AUDIO NOT AVAILABLE`);
      else if (!hasInput('Jingle Player')) skipped.push(`${wav.id}: OBS has no Jingle Player yet (npm run obs-setup -- --players)`);
      else {
        await obs.playFile('Jingle Player', wav.file, false);
        state.mediaAir.audio = { id: wav.id, title: wav.title, at: Date.now() };
        done.push(`JINGLE ${wav.id} — ${wav.title}`);
      }
    }
    return { done, skipped };
  }
  function moveTo(i) {
    const p = state.pos, now = Date.now();
    if (!rundown.segments[i]) throw new Error('No such segment');
    p.index = i; p.segmentStartedAt = now;
    if (!p.showStartedAt) p.showStartedAt = now;
  }
  // GO: the next segment (or a chosen one) with its cues. Into a BREAK: the broadcast microphones are muted first.
  async function cueGo(msg) {
    if (state.brk.active) throw new Error('A break is running: use RETURN TO LIVE');
    const i = msg.index == null ? state.pos.index + 1 : Number(msg.index);
    const seg = rundown.segments[i]; if (!seg) throw new Error('No such segment');
    const c = cleanScript(seg).cues;
    let muted = [];
    if (seg.kind === 'BREAK') {
      if (!obs.state.connected) throw new Error('OBS is not connected: the microphones cannot be muted for the break');
      muted = obs.state.audio.filter(a => a.mic && !a.muted).map(a => a.name);
      for (const n of muted) await obs.setMute(n, true);
    }
    const r = obs.state.connected ? await fireCues(c) : { done: [], skipped: ['OBS is not connected: cues not fired'] };
    moveTo(i);
    if (seg.kind === 'BREAK') {
      state.brk = { active: true, index: i, startedAt: state.pos.segmentStartedAt, muted, returnJingle: c.returnJingle, returnVideo: c.returnVideo };
      toRole('host', { t: 'alert', text: `${seg.title}: you are OFF AIR. Backstage call only, the public sees the break.` });
      logEvent('ok', `BREAK started: ${seg.title} · microphones muted: ${muted.join(', ') || 'none were live'}`);
    } else logEvent('ok', `GO ${String(i + 1).padStart(2, '0')} ${seg.title}${r.done.length ? ' · ' + r.done.join(' · ') : ''}`);
    for (const x of r.skipped) logEvent('warn', x);
    changed();
    return r;
  }
  // fire the cues of the current (or a chosen) segment again, without moving the show on
  async function cueFire(msg) {
    const seg = rundown.segments[msg.index == null ? state.pos.index : Number(msg.index)]; if (!seg) throw new Error('No such segment');
    const r = await fireCues(cleanScript(seg).cues);
    for (const x of r.skipped) logEvent('warn', x);
    changed(); return r;
  }
  // RETURN TO LIVE: only on the Director's confirmation. The break loop stops, the next segment's scene comes up,
  // the muted microphones come back, then the return jingle (WELCOME BACK) — or the next segment's own cue.
  async function breakReturn(msg) {
    if (msg.confirm !== true) throw new Error('Needs confirmation');
    const b = state.brk; if (!b.active) throw new Error('No break is running');
    const i = b.index + 1, seg = rundown.segments[i];
    if (!seg) throw new Error('There is no segment after this break');
    if (!obs.state.connected) throw new Error('OBS is not connected');
    const nc = cleanScript(seg).cues;
    resetAfter();
    if (state.mediaAir.video) { state.mediaAir.video = null; await obs.stopFile('Video Player'); }
    const r = await fireCues({ ...nc, jingle: b.returnJingle || nc.jingle, video: b.returnVideo || nc.video, mode: b.returnVideo ? 'once' : nc.mode });
    const back = [];
    for (const n of b.muted || []) { try { await obs.setMute(n, false); back.push(n); } catch (e) { r.skipped.push(`${n}: could not unmute (${e.message})`); } }
    moveTo(i);
    state.brk = { active: false, lastReturnAt: Date.now() };
    toRole('host', { t: 'alert', text: `BACK ON AIR: ${seg.title}` });
    logEvent('ok', `RETURN TO LIVE: ${seg.title} · microphones on: ${back.join(', ') || 'none'}`);
    for (const x of r.skipped) logEvent('warn', x);
    changed();
    return r;
  }
  // what a break shows on the dashboards; the Director also gets the isolation check (what could still reach the stream)
  function breakView(role) {
    const b = state.brk;
    if (!b.active) return { active: false };
    const seg = rundown.segments[b.index], next = rundown.segments[b.index + 1];
    const out = { active: true, index: b.index, title: seg?.title || 'BREAK', startedAt: b.startedAt, planned: (Number(seg?.minutes) || 0) * 60, next: next?.title || '' };
    if (role !== 'director') return out;
    const a = obs.state.audio || [];
    return { ...out, muted: b.muted || [], isolation: {
      obs: obs.state.connected,
      micsLive: a.filter(x => x.mic && !x.muted).map(x => x.name),
      micsTagged: a.filter(x => x.mic).length,
      camsOnAir: (obs.state.items || []).filter(x => x.enabled && /^(Cam|VDO) \/\//.test(x.name)).map(x => x.name),
      otherLive: a.filter(x => !x.mic && !x.muted && /mixer|aux|input_capture/i.test(x.name + ' ' + x.kind)).map(x => x.name),
    } };
  }

  /* ---------- PRE-SHOW: the Virtual Space page as a clean OBS picture ----------
     LIVE 3D plays the real-time studio (with a countdown to the episode's start, if it has one: the opening song loops
     until 3 s before, the beacons flash three times and the opening starts on time). VIDEO plays the finished 90 s
     opening, which ends on a clean D//0 logo at 88.5–90 s: cut to the cameras there (stinger through the logo). */
  const PRESHOW_SCENE = 'PRE-SHOW', PRESHOW_SRC = 'Virtual Space';
  const viennaIso = ms => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Vienna', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset' }).formatToParts(new Date(ms)).map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${p.timeZoneName.replace('GMT', '') || '+00:00'}`;
  };
  function preshowUrl(mode) {
    const u = new URL(config.virtualSpace?.url || 'https://virtualspace.distancezeroshow.com/');
    u.searchParams.set('obs', '1'); u.searchParams.set('play', mode);
    const at = rundown.episode?.startAt;
    if (mode === 'live' && at > Date.now()) u.searchParams.set('start', viennaIso(at));
    return u.toString();
  }
  async function preshow(msg) {
    const mode = msg.mode === 'video' ? 'video' : msg.mode === 'live' ? 'live' : null;
    if (!mode) throw new Error('Choose LIVE 3D or VIDEO');
    if (msg.confirm !== true) throw new Error('PRE-SHOW goes to program: it needs confirmation');
    if (state.brk?.active) throw new Error('A break is running: return to live first');
    obs.requireScene(PRESHOW_SCENE);
    const url = preshowUrl(mode);
    await obs.request('SetInputSettings', { inputName: PRESHOW_SRC, inputSettings: { url } });
    await obs.request('PressInputPropertiesButton', { inputName: PRESHOW_SRC, propertyName: 'refreshnocache' });
    await obs.setProgram(PRESHOW_SCENE);
    logEvent('ok', `PRE-SHOW on program: ${mode === 'live' ? 'live 3D studio' : 'opening video'}`);
    return { url };
  }

  /* ---------- THIRD SEAT: the invited guest ----------
     INVITE gives one private link (valid 24 h, one guest at a time). The guest checks camera and microphone in a
     waiting room and may send a still preview. ADMIT GUEST lets them send their camera through VDO.Ninja into OBS,
     where "VDO // Guest" stays HIDDEN and MUTED. Only TAKE GUEST ON AIR (a separate, confirmed action) shows and
     unmutes it. A new invitation gets a new VDO.Ninja stream, so old links stop working. */
  let guestSnap = null;
  const GUEST_SRC = 'VDO // Guest';
  const guestLinks = g => {
    const base = config.vdoNinja?.base || 'https://vdo.ninja/';
    const q = p => base + '?' + new URLSearchParams(p).toString().replace(/=(&|$)/g, '$1');
    return { push: q({ push: g.vdoStream, password: g.vdoPassword, label: g.name || 'Guest', webcam: '', quality: '0' }),
      view: q({ view: g.vdoStream, password: g.vdoPassword, cleanoutput: '' }) };
  };
  const guestActive = () => { const g = state.guest; return g && g.expiresAt > Date.now() ? g : null; };
  function guestView(role) {
    const g = guestActive(); if (!g) return null;
    const v = { name: g.name, status: g.status, online: [...clients].some(c => c.role === 'guest'), check: g.check || null };
    return role === 'director' ? { ...v, expiresAt: g.expiresAt, snapAt: guestSnap?.at || 0, seat: obs.hasScene('GUEST') } : v;
  }
  function guestPresence(on) {
    const g = state.guest; if (!g) return;
    if (on && g.status === 'invited') g.status = 'waiting';
    logEvent(on ? 'ok' : 'warn', `Guest ${g.name || ''} ${on ? 'joined the waiting room' : 'left'}`.replace('  ', ' '));
    if (on) notify('ok', 'guest-up', `${g.name || 'The guest'} is in the waiting room`, { to: ['director'] });
    changed();
  }
  // the OBS guest source: hidden + muted, unless on air; pointed at this invitation's VDO.Ninja stream
  async function guestObs({ onAir = false, url = null } = {}) {
    if (!obs.state.connected) { if (onAir) throw new Error('OBS is not connected'); return false; }
    let ok = true;
    if (url != null) await obs.request('SetInputSettings', { inputName: GUEST_SRC, inputSettings: { url } }).catch(() => { ok = false; });
    await obs.request('SetInputMute', { inputName: GUEST_SRC, inputMuted: !onAir }).catch(() => { ok = false; });
    const items = await obs.request('GetSceneItemList', { sceneName: 'GUEST' }).then(r => r.sceneItems).catch(() => []);
    const it = items.find(i => i.sourceName === GUEST_SRC);
    if (it) await obs.request('SetSceneItemEnabled', { sceneName: 'GUEST', sceneItemId: it.sceneItemId, sceneItemEnabled: !!onAir });
    else ok = false;
    if (onAir && !ok) throw new Error('OBS has no "VDO // Guest" seat in the GUEST scene yet (npm run obs-setup -- sunday --players)');
    return ok;
  }
  function closeGuests() { for (const c of clients) if (c.role === 'guest') try { c.ws.close(4001, 'invitation ended'); } catch {} }
  async function guestInvite(msg) {
    if (state.guest?.status === 'onair') throw new Error('The current guest is on air. Take them off air first.');
    closeGuests(); guestSnap = null;
    const token = crypto.randomBytes(24).toString('base64url');
    state.guest = { id: crypto.randomBytes(6).toString('hex'), name: str(msg.name, 60) || 'Guest', status: 'invited',
      tokenHash: crypto.createHash('sha256').update(token).digest('hex'), createdAt: Date.now(), expiresAt: Date.now() + 24 * 3600e3,
      vdoStream: 'dzg' + crypto.randomBytes(6).toString('hex'), vdoPassword: crypto.randomBytes(9).toString('base64url'), check: null };
    await guestObs({ url: 'about:blank' }).catch(() => {});
    logEvent('ok', `Guest invitation created for ${state.guest.name} (valid 24 h)`);
    changed();
    const t = await tunnel.check().catch(() => ({}));
    const path_ = `/guest#invite=${token}`;
    return { link: t.running ? t.url + path_ : null, path: path_, up: !!t.up, local: `http://${config.guest.host}:${config.guest.port}${path_}` };
  }
  function guestJoin(token) {
    const g = guestActive(); if (!g) return null;
    const h = crypto.createHash('sha256').update(String(token || '')).digest('hex');
    return h.length === g.tokenHash.length && crypto.timingSafeEqual(Buffer.from(h), Buffer.from(g.tokenHash)) ? g.id : null;
  }
  const guestValid = id => !!id && guestActive()?.id === id;
  async function guestAdmit() {
    const g = guestActive(); if (!g) throw new Error('No guest invited');
    if (g.status === 'onair') throw new Error('The guest is already on air');
    // the seat in OBS: this invitation's stream, still hidden and muted
    const ok = await guestObs({ url: guestLinks(g).view });
    g.status = 'backstage';
    logEvent('ok', `Guest ${g.name} admitted backstage (not on air)${ok ? '' : ' — OBS guest seat not found, add it with obs-setup --players'}`);
    changed(); return { obs: ok };
  }
  async function guestBack() {
    const g = guestActive(); if (!g) throw new Error('No guest invited');
    if (g.status === 'onair') await guestObs({ onAir: false });
    g.status = 'waiting'; await guestObs({ url: 'about:blank' }).catch(() => {});
    logEvent('ok', `Guest ${g.name} sent back to the waiting room`); changed();
  }
  async function guestOnAir(msg) {
    if (msg.confirm !== true) throw new Error('Needs confirmation');
    const g = guestActive(); if (!g) throw new Error('No guest invited');
    if (g.status !== 'backstage') throw new Error('Admit the guest backstage first');
    if (state.brk.active) throw new Error('A break is running: return to live first');
    await guestObs({ onAir: true });
    g.status = 'onair';
    if (state.settings.micInputs && !state.settings.micInputs.includes(GUEST_SRC)) { state.settings.micInputs.push(GUEST_SRC); obs.setMicList(state.settings.micInputs); }
    logEvent('ok', `Guest ${g.name} ON AIR (seat shown, sound on)`); changed();
  }
  async function guestOffAir() {
    const g = guestActive(); if (!g) throw new Error('No guest invited');
    await guestObs({ onAir: false });
    if (g.status === 'onair') g.status = 'backstage';
    logEvent('ok', `Guest ${g.name} off air (seat hidden, sound off)`); changed();
  }
  async function guestEnd() {
    const g = state.guest; if (!g) return;
    await guestObs({ onAir: false, url: 'about:blank' }).catch(() => {});
    state.guest = null; guestSnap = null; closeGuests();
    logEvent('ok', `Guest invitation ended (${g.name})`); changed();
  }

  /* ---------- episodes and their scripts (editing in REHEARSAL; the server enforces the T−180 lock) ---------- */
  function episodeNew(msg) {
    if (state.pos.showStartedAt) throw new Error('The show clock is running. Press Reset first.');
    if (locked()) throw new Error('The current episode is locked for broadcast. A new episode can be prepared after the show.');
    rundown = episodeFromMaster(FORMATS[msg.format] ? msg.format : 'sunday', { date: str(msg.date, 10), start: str(msg.start, 5), title: str(msg.title, 120) });
    state.pos.index = -1; state.pos.segmentStartedAt = null;
    saveRundown(); logEvent('ok', `New episode ${rundown.episode.id} from ${rundown.episode.master}`); changed();
    return { id: rundown.episode.id };
  }
  function episodeOpen(msg) {
    if (state.pos.showStartedAt) throw new Error('The show clock is running. Press Reset first.');
    const id = str(msg.episode, 40); if (!/^[A-Z0-9-]{3,40}$/.test(id)) throw new Error('No such episode');
    let r; try { r = JSON.parse(fs.readFileSync(path.join(EP_DIR, id + '.json'), 'utf8')); } catch { throw new Error('No such episode'); }
    r.segments = (r.segments || []).map((x, i) => cleanSegment(x, 'seg' + i)); r.episode = cleanEpisode(r.episode); r.title = str(r.title, 120);
    rundown = r; state.pos.index = -1; state.pos.segmentStartedAt = null;
    store.write('rundown.json', rundown); logEvent('ok', `Episode opened: ${id}`); changed();
  }
  function episodeMeta(msg) {
    assertEditable();
    const ep = rundown.episode; if (!ep) throw new Error('Create an episode from the master script first');
    const date = 'date' in msg ? str(msg.date, 10) : ep.date, start = 'start' in msg ? str(msg.start, 5) : ep.start;
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Date: YYYY-MM-DD');
    if (start && !/^\d{1,2}:\d{2}$/.test(start)) throw new Error('Start: HH:MM (Vienna)');
    const next = cleanEpisode({ ...ep, date, start });
    if (isLocked(next)) throw new Error('That start time would lock the script immediately (it is less than 180 minutes away)');
    rundown.episode = next;
    if ('title' in msg) rundown.title = str(msg.title, 120);
    saveRundown(); changed();
  }
  const SCRIPT_FIELDS = ['script', 'talkingPoints', 'presenters', 'guest', 'questions', 'cues', 'director', 'closing'];
  function scriptUpdate(msg) {
    assertEditable();
    const seg = rundown.segments.find(x => x.id === str(msg.segmentId, 40)); if (!seg) throw new Error('No such segment');
    const f = msg.fields || {}, patch = {};
    for (const k of SCRIPT_FIELDS) if (k in f) patch[k] = f[k];
    for (const k of ['title', 'kind', 'minutes', 'lead', 'notes']) if (k in f) patch[k] = f[k];
    Object.assign(seg, cleanSegment({ ...seg, ...patch, id: seg.id }, seg.id));
    rundown.sample = false;
    saveRundown(); changed();
    return { savedAt: rundown.savedAt };
  }
  function scriptRestore() {
    assertEditable();
    const vdir = path.join(EP_DIR, (rundown.episode?.id || '-') + '.versions');
    let files = []; try { files = fs.readdirSync(vdir).filter(f => f.endsWith('.json')).sort(); } catch {}
    if (!files.length) throw new Error('No earlier version saved yet');
    const prev = JSON.parse(fs.readFileSync(path.join(vdir, files.at(-1)), 'utf8'));
    fs.rmSync(path.join(vdir, files.at(-1)));                               // restoring consumes it, so a second restore goes one further back
    prev.segments = prev.segments.map((x, i) => cleanSegment(x, 'seg' + i)); prev.episode = cleanEpisode(prev.episode);
    rundown = prev; lastVersionAt = Date.now();
    saveRundown(); logEvent('warn', `Script restored to the version of ${new Date(prev.savedAt || Date.now()).toLocaleString('en-GB')}`); changed();
  }
  // apply a reviewed import (PDF or pasted text): only the segments the Director confirmed, never silently
  function scriptImport(msg) {
    assertEditable();
    if (msg.confirm !== true) throw new Error('Review the import first, then confirm it');
    const parts = Array.isArray(msg.parts) ? msg.parts : [];
    let n = 0;
    for (const part of parts) {
      const seg = rundown.segments.find(x => x.id === str(part.segmentId, 40)); if (!seg) continue;
      seg.script = str(part.text, 20000); n++;
    }
    if (!n) throw new Error('Nothing to import');
    rundown.sample = false;
    saveRundown(); logEvent('ok', `Script imported into ${n} segment${n > 1 ? 's' : ''}`); changed();
    return { segments: n };
  }
  // private notes: each account writes only its own file; never part of the locked script
  function notesSet(client, msg) {
    const who = client.role === 'host' ? 'georgie' : 'andrej', ep = rundown.episode?.id || 'no-episode';
    const all = readNotes(who), mine = all[ep] || (all[ep] = {});
    mine[str(msg.segmentId, 40) || '_episode'] = str(msg.text, 6000);
    fs.writeFileSync(NOTE_FILE(who) + '.tmp', JSON.stringify(all), { mode: 0o600 }); fs.renameSync(NOTE_FILE(who) + '.tmp', NOTE_FILE(who));
    client.send({ t: 'state', s: view(client.role) });
    return { savedAt: Date.now() };
  }

  /* SWITCHING SHOWS: what still runs in the current show, each with why it stops the switch and what ends it.
     fix: true  → "END <SHOW> & SWITCH" ends it (show clock and break, playlist, stage song, jingle/video, guest seat)
     fix: false → never ended by the switch: the YouTube stream and the OBS recording are ended by hand only. */
  function switchCheck(to) {
    const x = shows.find(s => s.id === to); if (!x) throw new Error('No such show');
    const from = currentShow(), o = obs.state, out = [];
    const add = (id, title, text, fix) => out.push({ id, title, text, fix });
    if (to === state.showId) return { from: from?.id || '', fromName: from?.name || '', to, toName: x.name, blockers: [] };
    if (o.stream.active) add('stream', 'The YouTube stream is LIVE', 'Viewers are watching. The switch never ends the stream: end it yourself in Live Control → Broadcast (END STREAM, hold), then switch.', false);
    if (o.record.active) add('record', 'OBS is recording', 'The switch never stops the recording: stop it in Live Control → Broadcast (Record), then switch.', false);
    if (state.brk.active) add('break', 'A break is running', `Break "${rundown.segments[state.pos.index]?.title || ''}" is on. Ending the show ends the break${state.brk.muted?.length ? `; ${state.brk.muted.join(', ')} stay muted until you unmute them` : ''}.`, true);
    if (state.pos.showStartedAt) {
      const seg = rundown.segments[state.pos.index];
      add('clock', 'The show timer is running', `${from?.name || 'The show'} is at ${seg ? `${String(state.pos.index + 1).padStart(2, '0')} ${seg.title}` : 'its start'}, started ${new Date(state.pos.showStartedAt).toLocaleTimeString('en-GB', { timeZone: 'Europe/Vienna', hour: '2-digit', minute: '2-digit' })} Vienna. Ending it resets the timer; the script, its notes and the episode stay saved.`, true);
    }
    const pl = playlist.view();
    if (pl && ['playing', 'paused'].includes(pl.status)) add('music', pl.status === 'playing' ? 'Music is playing' : 'A track is paused', `${pl.tracks[pl.index]?.title || 'The playlist'} (${pl.viaStage ? 'Vienna Piano Stage' : pl.player}). Ending the show stops it.`, true);
    const sr = stage.report();
    if (sr && ['OPENING', 'THEME', 'BETWEEN', 'CLOSING'].includes(sr.state)) add('stage', 'The Piano Stage is playing', `${sr.label || sr.state}. Ending the show stops the stage's sound.`, true);
    if (state.mediaAir.video || state.mediaAir.audio) add('media', 'A video or jingle is on air', `${[state.mediaAir.video?.title, state.mediaAir.audio?.title].filter(Boolean).join(' + ')}. Ending the show stops it.`, true);
    const g = guestActive();
    if (g && g.status === 'onair') add('guest', `Guest ${g.name} is ON AIR`, 'Ending the show takes the guest off air (back to the waiting room; the invitation stays).', true);
    if (o.transitioning) add('transition', 'OBS is in a transition', 'Wait a second until the transition has finished, then switch.', false);
    if (rundown.episode?.format !== x.id && locked()) add('locked', 'This episode is locked for broadcast', `${rundown.episode?.id || 'The episode'} stays saved exactly as it is; ${x.name} opens its own episode. Use this only when ${from?.name || 'this show'} is over or not today.`, true);
    return { from: from?.id || '', fromName: from?.name || '', to, toName: x.name, blockers: out };
  }

  // END <SHOW> & SWITCH: ends only what switchCheck marks fix: true; the stream and the recording are never touched
  async function endForSwitch(blockers) {
    const ids = new Set(blockers.map(b => b.id));
    if (ids.has('music')) await playlist.action({ action: 'stop' }).catch(e => logEvent('warn', `Switch: playlist stop — ${e.message}`));
    if (ids.has('stage')) await stage.send({ cmd: 'stop' }).catch(e => logEvent('warn', `Switch: Piano Stage stop — ${e.message}`));
    if (ids.has('media')) await mediaStop({}).catch(e => logEvent('warn', `Switch: media stop — ${e.message}`));
    if (ids.has('guest')) await guestOffAir().catch(e => logEvent('warn', `Switch: guest off air — ${e.message}`));
    if (ids.has('clock') || ids.has('break')) {
      if (state.brk.active) logEvent('warn', `Show ended during a break: ${state.brk.muted?.join(', ') || 'no microphones'} stay muted until you unmute them`);
      const p = state.pos; p.index = -1; p.segmentStartedAt = null; p.showStartedAt = null; state.brk = { active: false };
    }
    logEvent('ok', `Show ended for the switch: ${blockers.map(b => b.title).join(' · ')}`);
  }

  async function selectShow(msg) {
    const x = shows.find(s => s.id === msg.show);
    if (!x) throw new Error('No such show');
    const o = obs.state;
    const chk = switchCheck(x.id);
    if (chk.blockers.length) {
      const hard = chk.blockers.filter(b => !b.fix);
      if (hard.length || msg.end !== true) {
        const e = new Error(`${chk.fromName || 'The current show'} is still active: ${chk.blockers.map(b => b.title).join(' · ')}`);
        e.check = chk; throw e;
      }
      await endForSwitch(chk.blockers);
    }
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
    // the episode: stays if it already belongs to this show; otherwise the latest episode of this show, or a new copy
    // of its master script. A locked episode is never swapped out.
    if (rundown.episode?.format !== x.id) {
      // a locked episode stays saved as it is (episodes/<id>.json); the switch opens another one only after END & SWITCH
      const latest = episodeList().find(e => e.format === x.id && !e.locked);
      if (latest) episodeOpen({ episode: latest.id });
      else { rundown = episodeFromMaster(x.id); saveRundown(); }
      state.pos.index = -1; state.pos.segmentStartedAt = null;
    }
    state.settings.micInputs = (x.mics || []).map(n => str(n, 256));
    obs.setMicList(state.settings.micInputs);
    state.settings.standbyScene = str(x.obs?.standbyScene, 256);
    state.gfx = { ...state.gfx, tagline: str(x.overlay?.tagline, 60), clocks: !!x.overlay?.clocks, ident: false, lowerThird: { ...state.gfx.lowerThird, visible: false } };
    state.showId = x.id;
    playlist.build(x);
    // 5. transition: by kind, because OBS names them in its own language (Fade / Überblende)
    if (o.connected && x.obs?.transition) setTimeout(async () => {
      const t = obs.state.transitions.find(tr => tr.kind === x.obs.transition + '_transition');
      if (t) { await obs.setTransition(t.name).catch(() => {}); if (x.obs.transitionMs) await obs.setTransitionDuration(x.obs.transitionMs).catch(() => {}); }
    }, 2500);
    logEvent(notes.length ? 'warn' : 'ok', `Show selected: ${x.name}${notes.length ? ' — ' + notes.join('; ') : ''}`);
    changed();
    return { notes };
  }

  /* ---------- CREDITS AND PARTNERS ----------
     The permanent base (hosts, creators, partners) is kept in data/credits.json and used for every show; guests and
     extra names of one episode are kept with that episode. End credits and short partner lines go to the overlay. */
  const CREDITS_BASE = {
    hosts: [{ name: "DJ Andy'K — Andrej Kneisl", role: 'Host · Vienna' }, { name: 'Georgie Walker', role: 'Host · Melbourne' }],
    partners: [
      { name: "Andy'K Group", role: 'Technology partner — virtual show system' },
      { name: "Andy'K Music Lab", role: 'Music preparation and mastering' },
      { name: "Andy'K Records", role: 'Artwork, logos and visual identity' },
      { name: "DJ Andy'K", role: 'Official track and music for DISTANCE // ZERO' },
    ],
  };
  let credits = store.read('credits.json', null) || CREDITS_BASE;
  const parseLines = t => String(t || '').split('\n').map(l => l.trim()).filter(Boolean).slice(0, 60)
    .map(l => { const m = /^(.*?)\s+[—–]\s+(.*)$/.exec(l) || /^(.*?)\s+-\s+(.*)$/.exec(l); return { name: str(m ? m[1] : l, 100), role: str(m ? m[2] : '', 160) }; });
  function creditsAction(msg) {
    if (msg.action === 'base') {
      credits = { hosts: parseLines(msg.hosts), partners: parseLines(msg.partners) };
      store.write('credits.json', credits); logEvent('ok', 'Permanent credits and partners saved');
    } else if (msg.action === 'episode') {
      assertEditable();
      rundown.credits = { guests: parseLines(msg.guests), extra: parseLines(msg.extra) };
      saveRundown();
    } else throw new Error('Unknown credits action');
    changed();
  }
  const creditsView = () => ({ base: credits, episode: rundown.credits || { guests: [], extra: [] } });
  // what the end credits show: hosts, guests of this episode, creators and partners, extra names of this episode
  const creditRoll = () => {
    const ep = rundown.credits || {};
    return [['HOSTS', credits.hosts], ['GUESTS', ep.guests || []], ['CREATED WITH', withLogos(credits.partners)], ['THANK YOU', ep.extra || []]]
      .map(([t, l]) => [t, confirmed(l)]).filter(([, l]) => l?.length).map(([title, list]) => ({ title, list }));
  };
  // partner logos (white versions for the dark picture), matched by name; a partner without one shows its name only
  const partnerLogo = name => /group/i.test(name) ? '/static/brand/partners/group.png' : /music lab/i.test(name) ? '/static/brand/partners/music-lab.png'
    : /records/i.test(name) ? '/static/brand/partners/records.png' : '';
  const withLogos = l => l.map(p => ({ ...p, logo: partnerLogo(p.name) }));
  // a name still in [brackets] is a placeholder: never shown on air
  const confirmed = l => (l || []).filter(p => !/^\[/.test(p.name));
  let partnerTimer = 0;

  function gfxAction(msg) {
    const g = state.gfx;
    switch (msg.action) {
      case 'bug': g.bug = !!msg.on; break;
      case 'clocks': g.clocks = !!msg.on; break;
      case 'ident': g.ident = !!msg.on; break;
      case 'lower': g.lowerThird = {
        visible: !!msg.on, title: str(msg.title, 80), subtitle: str(msg.subtitle, 120), side: msg.side === 'melbourne' ? 'melbourne' : 'vienna',
      }; break;
      case 'credits': g.credits = !!msg.on; break;
      case 'partner': {
        // one partner line for 10 seconds; each press shows the next partner
        const list = confirmed(credits.partners); if (!list.length) throw new Error('No partners saved (Rehearsal → Script editor → Credits)');
        g.partnerIndex = msg.index != null ? Number(msg.index) % list.length : ((g.partnerIndex ?? -1) + 1) % list.length;
        g.partner = { ...list[g.partnerIndex], logo: partnerLogo(list[g.partnerIndex].name), at: Date.now() };
        clearTimeout(partnerTimer); partnerTimer = setTimeout(() => { g.partner = null; changed(); }, 10000);
        break;
      }
      case 'clear': g.clocks = false; g.ident = false; g.credits = false; g.partner = null; g.lowerThird = { ...g.lowerThird, visible: false }; break;
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
    stop() { clearInterval(monitorTimer); clearInterval(bedTimer); vchat?.stop(); tunnel.stop(); midi?.close(); },
    report(id) { return rehearsal.readReport(id); },
    renderReport: r => rehearsal.renderHtml(r),
    // script import / export for the HTTP routes (Director only)
    parseScript: text => splitBySegments(text, rundown.segments),
    scriptHtml: () => renderHtml(rundown, id => { const m = media?.get(id); return m ? `${m.id} — ${m.title}${m.available ? '' : ' (NOT AVAILABLE)'}` : id; }),
    scriptName: () => (rundown.episode?.id || 'DISTANCE-ZERO-script'),
    guestJoin, guestValid,
    runbooks, showIds: () => shows.map(s => s.id),
    runbookUploaded: (id, m) => { logEvent('ok', `Runbook for ${id}: ${m.name} (${m.pages} pages, ${m.sections.length} sections) — kept unchanged, SHA-256 ${m.sha256.slice(0, 12)}…`); changed(); },
    pianoMaster: id => playlist.stageFile(id),
  };
}
