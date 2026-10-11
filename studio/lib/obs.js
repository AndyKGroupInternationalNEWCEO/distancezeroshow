// OBS WebSocket v5 client (OBS Studio 28+ ships the server built in: Tools > WebSocket Server Settings).
// Runs inside the studio server on the Vienna Mac only. Browsers never talk to OBS directly, so the
// OBS password and OBS control never leave this machine.
import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import WebSocket from 'ws';

const OP = { Hello: 0, Identify: 1, Identified: 2, Event: 5, Request: 6, RequestResponse: 7 };
// General|Config|Scenes|Inputs|Transitions|Filters|Outputs|SceneItems|MediaInputs|Vendors|Ui + InputVolumeMeters
const EVENTS = 0x7ff | (1 << 16);

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
    // which audio sources "Mics off" mutes: the exact names in emergency.micInputs, or else names matching
    // emergency.micPattern. Never guessed from the device type: a DJ mixer is an input device too.
    this.micInputs = new Set(micInputs);
    this.micPattern = new RegExp(micPattern || 'mic', 'i');
    this.log = log;
    this.ws = null;
    this.pending = new Map();
    this.seq = 0;
    this.retryMs = 1000;
    this.stopped = false;
    this.state = this.blank('connecting');
  }

  blank(status, error = '') {
    return {
      connected: false, status, error, version: '',
      scenes: [], program: '', preview: '', studioMode: false,
      items: [], audio: [],
      stream: { active: false, reconnecting: false, timecode: '', congestion: 0, skipped: 0, total: 0 },
      record: { active: false, paused: false, timecode: '' },
      stats: { cpu: 0, fps: 0, renderSkipped: 0 },
    };
  }

  changed() { this.emit('state', this.state); }

  start() { this.stopped = false; this.connect(); }
  stop() {
    this.stopped = true;
    clearTimeout(this.retryTimer); clearInterval(this.pollTimer);
    if (this.ws) this.ws.terminate();
  }

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
    if (was) this.log.warn(`[obs] disconnected: ${error}`);
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
      this.state = { ...this.blank('connected'), connected: true, version };
      this.log.log(`[obs] connected (obs-websocket ${version})`);
      await this.refresh();
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
    await Promise.all([this.refreshScenes(), this.refreshAudio(), this.poll(), this.request('GetStudioModeEnabled').then(r => { this.state.studioMode = !!r.studioModeEnabled; })]);
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
    this.state.scenes = [...scenes].sort((a, b) => b.sceneIndex - a.sceneIndex).map(s => s.sceneName);
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

  async refreshAudio() {
    const { inputs = [] } = await this.request('GetInputList');
    const audio = [];
    await Promise.all(inputs.map(async (inp, i) => {
      try {
        const r = await this.request('GetInputMute', { inputName: inp.inputName });
        const kind = inp.unversionedInputKind || inp.inputKind || '';
        audio.push({ order: i, name: inp.inputName, kind, muted: !!r.inputMuted, mic: this.micInputs.size ? this.micInputs.has(inp.inputName) : this.micPattern.test(inp.inputName) });
      } catch { /* video-only input: no audio */ }
    }));
    const prev = new Map(this.state.audio.map(a => [a.name, a]));
    this.state.audio = audio.sort((a, b) => a.order - b.order).map(({ order, ...a }) => ({ ...a, db: prev.get(a.name)?.db || [-60, -60] }));
  }

  async poll() {
    const [s, r, st] = await Promise.all([
      this.request('GetStreamStatus'), this.request('GetRecordStatus'), this.request('GetStats').catch(() => ({})),
    ]);
    this.state.stream = {
      active: !!s.outputActive, reconnecting: !!s.outputReconnecting, timecode: s.outputTimecode || '',
      congestion: s.outputCongestion || 0, skipped: s.outputSkippedFrames || 0, total: s.outputTotalFrames || 0,
    };
    this.state.record = { active: !!r.outputActive, paused: !!r.outputPaused, timecode: r.outputTimecode || '' };
    this.state.stats = { cpu: st.cpuUsage || 0, fps: st.activeFps || 0, renderSkipped: st.renderSkippedFrames || 0 };
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
      case 'InputCreated': case 'InputRemoved': case 'InputNameChanged': await this.refreshAudio(); await this.refreshItems(); break;
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
  async setItem(id, enabled) {
    const it = this.state.items.find(i => i.id === id);
    if (!it) throw new Error('That source is not in the program scene any more');
    await this.request('SetSceneItemEnabled', { sceneName: this.state.program, sceneItemId: id, sceneItemEnabled: !!enabled });
  }
  async setMute(name, muted) {
    if (!this.state.audio.some(a => a.name === name)) throw new Error(`No audio source called "${name}"`);
    await this.request('SetInputMute', { inputName: name, inputMuted: !!muted });
  }
  async muteMics() {
    const mics = this.state.audio.filter(a => a.mic);
    if (!mics.length) throw new Error('No microphone sources found in OBS (see emergency.micPattern / micInputs in config.json)');
    await Promise.all(mics.map(a => this.request('SetInputMute', { inputName: a.name, inputMuted: true })));
    return mics.length;
  }
  async stream(on) { await this.request(on ? 'StartStream' : 'StopStream'); }
  async record(on) { await this.request(on ? 'StartRecord' : 'StopRecord'); }
}
