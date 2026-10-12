// OBS WebSocket v5 client (OBS Studio 28+ ships the server built in: Tools > WebSocket Server Settings).
// Runs inside the studio server on the Vienna Mac only. Browsers never talk to OBS directly, so the
// OBS password and OBS control never leave this machine.
import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import WebSocket from 'ws';

const OP = { Hello: 0, Identify: 1, Identified: 2, Event: 5, Request: 6, RequestResponse: 7 };
// General|Config|Scenes|Inputs|Transitions|Filters|Outputs|SceneItems|MediaInputs|Vendors|Ui + InputVolumeMeters
const EVENTS = 0x7ff | (1 << 16);
const MEDIA_KINDS = new Set(['ffmpeg_source', 'vlc_source']);
const MEDIA = { play: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART', stop: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP', pause: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE', resume: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY' };

const sha = s => crypto.createHash('sha256').update(s).digest('base64');
const db = mul => (mul > 0 ? Math.max(-60, 20 * Math.log10(mul)) : -60);

export function isLoopbackUrl(url) {
  try {
    const h = new URL(url).hostname.replace(/^\[|\]$/g, '');
    return h === 'localhost' || h === '::1' || /^127\./.test(h);
  } catch { return false; }
}

export class Obs extends EventEmitter {
  constructor({ url, password = '', micPattern = 'mic', micInputs = [], log = console } = {}) {
    super();
    this.url = url;
    this.password = password;
    // which audio sources count as microphones ("Mics off", the mic strip in Live Control): an explicit list
    // set in Technical Control or emergency.micInputs, or else names matching emergency.micPattern.
    // Never guessed from the device type: a DJ mixer is an input device too.
    this.micPattern = new RegExp(micPattern || 'mic', 'i');
    this.setMicList(micInputs);
    this.log = log;
    this.ws = null;
    this.pending = new Map();
    this.seq = 0;
    this.retryMs = 1000;
    this.stopped = false;
    this.connectedAt = 0;
    this.state = this.blank('connecting');
  }

  blank(status, error = '') {
    return {
      connected: false, status, error, version: '', obsVersion: '', since: 0,
      scenes: [], program: '', preview: '', studioMode: false,
      items: [], audio: [], media: [],
      transitions: [], transition: '', transitionKind: '', transitionDuration: 0, transitioning: false,
      stream: { active: false, reconnecting: false, timecode: '', congestion: 0, skipped: 0, total: 0, bytes: 0 },
      record: { active: false, paused: false, timecode: '', bytes: 0 },
      stats: { cpu: 0, fps: 0, renderSkipped: 0, renderTotal: 0, outputSkipped: 0, outputTotal: 0, memory: 0, disk: 0, frameMs: 0, latency: 0 },
    };
  }

  changed() { this.emit('state', this.state); }

  start() { this.stopped = false; this.connect(); }
  stop() {
    this.stopped = true;
    clearTimeout(this.retryTimer); clearInterval(this.pollTimer);
    if (this.ws) this.ws.terminate();
  }
  reconnect() {
    clearTimeout(this.retryTimer);
    this.retryMs = 1000;
    if (this.ws) this.ws.terminate(); else this.connect();
  }

  setMicList(list) {
    this.micInputs = new Set((list || []).filter(Boolean));
    if (this.state) { for (const a of this.state.audio) a.mic = this.isMic(a.name); this.changed(); }
  }
  isMic(name) { return this.micInputs.size ? this.micInputs.has(name) : this.micPattern.test(name); }

  connect() {
    if (this.stopped) return;
    let ws;
    try { ws = new WebSocket(this.url, 'obswebsocket.json', { handshakeTimeout: 4000 }); }
    catch (e) { return this.fail('offline', `Bad OBS address ${this.url}: ${e.message}`); }
    this.ws = ws;
    ws.on('message', raw => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      this.onMessage(m).catch(e => this.log.warn('[obs]', e.message));
    });
    ws.on('error', e => { this.lastError = e.code === 'ECONNREFUSED' ? 'OBS is not running, or its WebSocket server is off' : e.message; });
    ws.on('close', code => {
      clearInterval(this.pollTimer);
      for (const p of this.pending.values()) p.reject(new Error('OBS connection closed'));
      this.pending.clear();
      if (ws !== this.ws) return;
      if (code === 4009) this.fail('auth-failed', 'OBS rejected the password. Check OBS_WEBSOCKET_PASSWORD in studio/.env.local', 10000);
      else if (code === 4010) this.fail('offline', 'OBS WebSocket version is not supported (needs OBS 28 or newer)', 10000);
      else if (this.state.status !== 'auth-required') this.fail('offline', this.lastError || 'OBS connection lost');
      this.lastError = '';
    });
  }

  fail(status, error, wait) {
    const was = this.state.connected;
    this.state = this.blank(status, error);
    this.changed();
    if (was) { this.log.warn(`[obs] disconnected: ${error}`); this.emit('link', false, error); }
    if (this.stopped) return;
    const ms = wait || this.retryMs;
    this.retryMs = Math.min(this.retryMs * 1.6, 5000);
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.connect(), ms);
  }

  send(op, d) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ op, d })); }

  async onMessage({ op, d }) {
    if (op === OP.Hello) {
      const identify = { rpcVersion: 1, eventSubscriptions: EVENTS };
      if (d.authentication) {
        if (!this.password) {
          this.state = this.blank('auth-required', 'OBS asks for a password. Put it in studio/.env.local as OBS_WEBSOCKET_PASSWORD and restart.');
          this.changed();
          this.ws.close();
          clearTimeout(this.retryTimer);
          this.retryTimer = setTimeout(() => this.connect(), 15000);
          return;
        }
        identify.authentication = sha(sha(this.password + d.authentication.salt) + d.authentication.challenge);
      }
      this.state.version = d.obsWebSocketVersion || '';
      this.send(OP.Identify, identify);
    } else if (op === OP.Identified) {
      this.retryMs = 1000;
      const version = this.state.version;
      this.state = { ...this.blank('connected'), connected: true, version, since: Date.now() };
      this.log.log(`[obs] connected (obs-websocket ${version})`);
      await this.refresh();
      this.emit('link', true);
      this.pollTimer = setInterval(() => this.poll().catch(() => {}), 1000);
    } else if (op === OP.RequestResponse) {
      const p = this.pending.get(d.requestId);
      if (!p) return;
      this.pending.delete(d.requestId);
      clearTimeout(p.timer);
      if (d.requestStatus?.result) p.resolve(d.responseData || {});
      else p.reject(Object.assign(new Error(d.requestStatus?.comment || `${d.requestType} failed (code ${d.requestStatus?.code})`), { code: d.requestStatus?.code }));
    } else if (op === OP.Event) {
      await this.onEvent(d.eventType, d.eventData || {});
    }
  }

  request(requestType, requestData) {
    if (!this.state.connected) return Promise.reject(new Error('OBS is not connected'));
    const requestId = 'r' + ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error(`OBS did not answer ${requestType}`)); }, 5000);
      this.pending.set(requestId, { resolve, reject, timer });
      this.send(OP.Request, { requestType, requestId, requestData });
    });
  }

  /* ---------- reading state ---------- */

  async refresh() {
    await Promise.all([
      this.refreshScenes(), this.refreshInputs(), this.refreshTransitions(), this.poll(),
      this.request('GetStudioModeEnabled').then(r => { this.state.studioMode = !!r.studioModeEnabled; }),
      this.request('GetVersion').then(r => { this.state.obsVersion = r.obsVersion || ''; }).catch(() => {}),
    ]);
    await this.refreshItems();
    this.changed();
  }

  async refreshScenes() {
    const r = await this.request('GetSceneList');
    this.setScenes(r.scenes || []);
    this.state.program = r.currentProgramSceneName || '';
    this.state.preview = r.currentPreviewSceneName || '';
  }

  setScenes(scenes) {
    // OBS lists scenes bottom-up; show them in the same order as the OBS Scenes dock
    // the show collections' helper scene with all sound sources (AUDIO // ALL) is nested in every scene, never a shot of its own
    this.state.scenes = [...scenes].sort((a, b) => b.sceneIndex - a.sceneIndex).map(s => s.sceneName).filter(n => !/^AUDIO \/\//.test(n));
  }

  async refreshTransitions() {
    try {
      const r = await this.request('GetSceneTransitionList');
      this.state.transitions = (r.transitions || []).map(t => ({ name: t.transitionName, kind: t.transitionKind, fixed: !!t.transitionFixed }));
      this.state.transition = r.currentSceneTransitionName || '';
      this.state.transitionKind = r.currentSceneTransitionKind || '';
      const c = await this.request('GetCurrentSceneTransition').catch(() => ({}));
      this.state.transitionDuration = c.transitionDuration ?? 0;
    } catch (e) { this.log.warn('[obs] transitions:', e.message); }
  }

  async refreshItems() {
    const scene = this.state.program;
    if (!scene) { this.state.items = []; return; }
    try {
      const r = await this.request('GetSceneItemList', { sceneName: scene });
      if (scene !== this.state.program) return;
      this.state.items = (r.sceneItems || []).sort((a, b) => b.sceneItemIndex - a.sceneItemIndex).map(i => ({
        id: i.sceneItemId, name: i.sourceName, enabled: !!i.sceneItemEnabled, kind: i.inputKind || (i.isGroup ? 'group' : 'scene'),
      }));
    } catch (e) { this.state.items = []; this.log.warn('[obs] scene items:', e.message); }
  }

  /* audio sources (anything OBS reports a mute state for) and media sources (jingles, beds, videos) */
  async refreshInputs() {
    const { inputs = [] } = await this.request('GetInputList');
    const audio = [], media = [];
    await Promise.all(inputs.map(async (inp, i) => {
      const kind = inp.unversionedInputKind || inp.inputKind || '';
      if (MEDIA_KINDS.has(kind)) {
        const m = await this.request('GetMediaInputStatus', { inputName: inp.inputName }).catch(() => ({}));
        media.push({ order: i, name: inp.inputName, kind, state: shortMedia(m.mediaState), duration: m.mediaDuration || 0, cursor: m.mediaCursor || 0 });
      }
      try {
        const r = await this.request('GetInputMute', { inputName: inp.inputName });
        const v = await this.request('GetInputVolume', { inputName: inp.inputName }).catch(() => ({}));
        audio.push({ order: i, name: inp.inputName, kind, muted: !!r.inputMuted, volumeDb: round(v.inputVolumeDb ?? 0) });
      } catch { /* video-only input: no audio */ }
    }));
    const prev = new Map(this.state.audio.map(a => [a.name, a]));
    this.state.audio = audio.sort((a, b) => a.order - b.order).map(({ order, ...a }) => ({ ...a, mic: this.isMic(a.name), db: prev.get(a.name)?.db || [-60, -60] }));
    this.state.media = media.sort((a, b) => a.order - b.order).map(({ order, ...m }) => m);
  }

  async poll() {
    const t0 = Date.now();
    const [s, r, st] = await Promise.all([
      this.request('GetStreamStatus'), this.request('GetRecordStatus'), this.request('GetStats').catch(() => ({})),
    ]);
    this.state.stream = {
      active: !!s.outputActive, reconnecting: !!s.outputReconnecting, timecode: s.outputTimecode || '',
      congestion: s.outputCongestion || 0, skipped: s.outputSkippedFrames || 0, total: s.outputTotalFrames || 0, bytes: s.outputBytes || 0,
    };
    this.state.record = { active: !!r.outputActive, paused: !!r.outputPaused, timecode: r.outputTimecode || '', bytes: r.outputBytes || 0 };
    this.state.stats = {
      cpu: st.cpuUsage || 0, fps: st.activeFps || 0, renderSkipped: st.renderSkippedFrames || 0, renderTotal: st.renderTotalFrames || 0,
      outputSkipped: st.outputSkippedFrames || 0, outputTotal: st.outputTotalFrames || 0, memory: st.memoryUsage || 0,
      disk: st.availableDiskSpace || 0, frameMs: st.averageFrameRenderTime || 0, latency: Date.now() - t0,
    };
    // playing media: keep the cart's progress bars moving
    await Promise.all(this.state.media.filter(m => m.state === 'playing').map(async m => {
      const x = await this.request('GetMediaInputStatus', { inputName: m.name }).catch(() => null);
      if (x) Object.assign(m, { state: shortMedia(x.mediaState), duration: x.mediaDuration || 0, cursor: x.mediaCursor || 0 });
    }));
    this.changed();
  }

  async onEvent(type, d) {
    const s = this.state;
    switch (type) {
      case 'CurrentProgramSceneChanged': s.program = d.sceneName; await this.refreshItems(); break;
      case 'CurrentPreviewSceneChanged': s.preview = d.sceneName; break;
      case 'StudioModeStateChanged': s.studioMode = !!d.studioModeEnabled; if (!s.studioMode) s.preview = ''; else await this.refreshScenes(); break;
      case 'SceneListChanged': this.setScenes(d.scenes || []); break;
      case 'SceneCreated': case 'SceneRemoved': case 'SceneNameChanged': await this.refreshScenes(); await this.refreshItems(); break;
      case 'SceneItemEnableStateChanged': {
        if (d.sceneName !== s.program) return;
        const it = s.items.find(i => i.id === d.sceneItemId);
        if (it) it.enabled = !!d.sceneItemEnabled;
        break;
      }
      case 'SceneItemCreated': case 'SceneItemRemoved': case 'SceneItemListReindexed':
        if (d.sceneName === s.program) await this.refreshItems(); break;
      case 'InputMuteStateChanged': {
        const a = s.audio.find(x => x.name === d.inputName);
        if (a) a.muted = !!d.inputMuted;
        break;
      }
      case 'InputVolumeChanged': {
        const a = s.audio.find(x => x.name === d.inputName);
        if (a) a.volumeDb = round(d.inputVolumeDb);
        break;
      }
      case 'InputCreated': case 'InputRemoved': case 'InputNameChanged': await this.refreshInputs(); await this.refreshItems(); break;
      case 'CurrentSceneTransitionChanged': case 'SceneTransitionCreated': case 'SceneTransitionRemoved': case 'SceneTransitionNameChanged':
        await this.refreshTransitions(); break;
      case 'CurrentSceneTransitionDurationChanged': s.transitionDuration = d.transitionDuration ?? s.transitionDuration; break;
      case 'SceneTransitionStarted': s.transitioning = true; break;
      case 'SceneTransitionEnded': case 'SceneTransitionVideoEnded': s.transitioning = false; break;
      case 'MediaInputPlaybackStarted': case 'MediaInputPlaybackEnded': case 'MediaInputActionTriggered': {
        const m = s.media.find(x => x.name === d.inputName);
        if (!m) return;
        const x = await this.request('GetMediaInputStatus', { inputName: m.name }).catch(() => null);
        if (x) Object.assign(m, { state: shortMedia(x.mediaState), duration: x.mediaDuration || 0, cursor: x.mediaCursor || 0 });
        break;
      }
      case 'StreamStateChanged': s.stream.active = !!d.outputActive; s.stream.state = d.outputState; break;
      case 'RecordStateChanged': s.record.active = !!d.outputActive; s.record.paused = d.outputState === 'OBS_WEBSOCKET_OUTPUT_PAUSED'; break;
      case 'ExitStarted': s.error = 'OBS is closing'; break;
      case 'InputVolumeMeters': {
        const m = {};
        for (const inp of d.inputs || []) {
          const ch = (inp.inputLevelsMul || []).slice(0, 2).map(c => Math.round(db(c[1]) * 10) / 10);
          if (ch.length === 1) ch.push(ch[0]);
          m[inp.inputName] = ch.length ? ch : [-60, -60];
        }
        for (const a of s.audio) a.db = m[a.name] || [-60, -60];
        this.emit('meters', m);
        return;
      }
      default: return;
    }
    this.changed();
  }

  /* ---------- control (director only; the hub enforces that) ---------- */

  hasScene(name) { return this.state.scenes.includes(name); }
  requireScene(name) { if (!this.hasScene(name)) throw new Error(`OBS has no scene called "${name}"`); }

  async setProgram(name) { this.requireScene(name); await this.request('SetCurrentProgramScene', { sceneName: name }); }
  async setPreview(name) {
    if (!this.state.studioMode) throw new Error('Studio Mode is off in OBS');
    this.requireScene(name);
    await this.request('SetCurrentPreviewScene', { sceneName: name });
  }
  async take() {
    if (!this.state.studioMode) throw new Error('Studio Mode is off in OBS');
    await this.request('TriggerStudioModeTransition');
  }

  /* A hard cut whatever transition is selected: briefly select OBS's built-in Cut transition, switch, and put the
     operator's transition back. Found by kind, so it works in every OBS language ("Cut", "Schnitt", …). */
  async cut(switchFn) {
    const cut = this.state.transitions.find(t => t.kind === 'cut_transition');
    const current = this.state.transition;
    if (!cut || this.state.transitionKind === 'cut_transition') return switchFn();
    await this.request('SetCurrentSceneTransition', { transitionName: cut.name });
    try { await switchFn(); }
    finally { await this.request('SetCurrentSceneTransition', { transitionName: current }).catch(e => this.log.warn('[obs] restore transition:', e.message)); }
  }
  // reload a browser source (the overlay page fails to load if OBS started before the studio, and never retries)
  async refreshBrowser(name) {
    if (!(await this.request('GetInputList', { inputKind: 'browser_source' })).inputs.some(i => i.inputName === name)) return false;
    await this.request('PressInputPropertiesButton', { inputName: name, propertyName: 'refreshnocache' });
    return true;
  }
  // scene collections: each show has its own (sources, scenes, layout); switching reloads OBS's whole scene setup
  async sceneCollections() { const r = await this.request('GetSceneCollectionList'); return { current: r.currentSceneCollectionName, all: r.sceneCollections || [] }; }
  async setSceneCollection(name) {
    if (this.state.stream.active || this.state.record.active) throw new Error('Not while streaming or recording');
    // loading a whole collection can take OBS longer than one request may wait: then check until it is really open
    await this.request('SetCurrentSceneCollection', { sceneCollectionName: name }).catch(e => { if (!/did not answer/.test(e.message)) throw e; });
    for (let i = 0; i < 40; i++) {
      const c = await this.request('GetSceneCollectionList').catch(() => null);
      if (c?.currentSceneCollectionName === name) break;
      if (i === 39) throw new Error(`OBS did not open the scene collection "${name}"`);
      await new Promise(r => setTimeout(r, 500));
    }
    setTimeout(() => this.refresh().catch(() => {}), 1500);      // OBS loads the collection, then the studio reads it again
  }
  async setTransition(name) {
    if (!this.state.transitions.some(t => t.name === name)) throw new Error(`OBS has no transition called "${name}"`);
    await this.request('SetCurrentSceneTransition', { transitionName: name });
  }
  async setTransitionDuration(ms) {
    const t = this.state.transitions.find(x => x.name === this.state.transition);
    if (t?.fixed) throw new Error(`${t.name} has a fixed length`);
    await this.request('SetCurrentSceneTransitionDuration', { transitionDuration: Math.round(Math.max(50, Math.min(20000, ms))) });
    this.state.transitionDuration = Math.round(Math.max(50, Math.min(20000, ms)));
    this.changed();
  }

  async screenshot(scene, width = 640) {
    const r = await this.request('GetSourceScreenshot', { sourceName: scene, imageFormat: 'jpg', imageWidth: width, imageCompressionQuality: 62 });
    return r.imageData;
  }

  async setItem(id, enabled) {
    const it = this.state.items.find(i => i.id === id);
    if (!it) throw new Error('That source is not in the program scene any more');
    await this.request('SetSceneItemEnabled', { sceneName: this.state.program, sceneItemId: id, sceneItemEnabled: !!enabled });
  }
  requireAudio(name) { if (!this.state.audio.some(a => a.name === name)) throw new Error(`No audio source called "${name}"`); }
  async setMute(name, muted) { this.requireAudio(name); await this.request('SetInputMute', { inputName: name, inputMuted: !!muted }); }
  async setVolume(name, volumeDb) {
    this.requireAudio(name);
    const v = Math.max(-100, Math.min(26, Number(volumeDb) || 0));
    await this.request('SetInputVolume', { inputName: name, inputVolumeDb: v });
  }
  async media(name, action) {
    if (!this.state.media.some(m => m.name === name)) throw new Error(`No media source called "${name}"`);
    if (!MEDIA[action]) throw new Error('Unknown media action');
    await this.request('TriggerMediaInputAction', { inputName: name, mediaAction: MEDIA[action] });
  }
  async muteMics() {
    const mics = this.state.audio.filter(a => a.mic);
    if (!mics.length) throw new Error('No microphone sources tagged. Tag them in Technical Control → Audio sources.');
    await Promise.all(mics.map(a => this.request('SetInputMute', { inputName: a.name, inputMuted: true })));
    return mics.length;
  }
  async stream(on) { await this.request(on ? 'StartStream' : 'StopStream'); }
  async record(on) { await this.request(on ? 'StartRecord' : 'StopRecord'); }
}

function round(v) { return Math.round((Number(v) || 0) * 10) / 10; }
function shortMedia(s = '') {
  return ({ OBS_MEDIA_STATE_PLAYING: 'playing', OBS_MEDIA_STATE_PAUSED: 'paused', OBS_MEDIA_STATE_STOPPED: 'stopped', OBS_MEDIA_STATE_ENDED: 'ended',
    OBS_MEDIA_STATE_OPENING: 'opening', OBS_MEDIA_STATE_BUFFERING: 'buffering', OBS_MEDIA_STATE_ERROR: 'error' })[s] || 'idle';
}
