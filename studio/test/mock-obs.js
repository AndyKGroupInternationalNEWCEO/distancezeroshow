// A stand-in for OBS Studio's built-in WebSocket server (protocol v5, with password auth).
// Used by the automated tests, and for rehearsing the Director Studio without OBS: `npm run mock-obs`.
// It speaks the real protocol, so the studio server cannot tell it apart from OBS for the requests it uses.
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { WebSocketServer } from 'ws';

const sha = s => crypto.createHash('sha256').update(s).digest('base64');

export function startMockObs({ port = 4455, host = '127.0.0.1', password = 'mock-password', meters = true } = {}) {
  const scenes = ['STANDBY', 'OPENING', 'VIENNA', 'MELBOURNE', 'SPLIT // BOTH', 'GUEST', 'MUSIC', 'CREDITS'];
  const items = Object.fromEntries(scenes.map((s, si) => [s, [
    { sceneItemId: 1, sourceName: 'Cam // Andrej', inputKind: 'av_capture_input_v2', sceneItemEnabled: true, sceneItemIndex: 0 },
    { sceneItemId: 2, sourceName: 'VDO // Georgie', inputKind: 'browser_source', sceneItemEnabled: si !== 2, sceneItemIndex: 1 },
    { sceneItemId: 3, sourceName: 'D//0 Overlay', inputKind: 'browser_source', sceneItemEnabled: true, sceneItemIndex: 2 },
    { sceneItemId: 4, sourceName: 'Studio Loop', inputKind: 'ffmpeg_source', sceneItemEnabled: si < 2, sceneItemIndex: 3 },
  ]]));
  items.GUEST.push({ sceneItemId: 6, sourceName: 'VDO // Guest', inputKind: 'browser_source', sceneItemEnabled: false, sceneItemIndex: 5 });
  items.STANDBY.push({ sceneItemId: 5, sourceName: 'Video Player', inputKind: 'ffmpeg_source', sceneItemEnabled: true, sceneItemIndex: 4 });
  // the break card and VT scenes: no cameras, only the Video Player under the overlay (like obs-setup --players)
  for (const s of ['BREAK', 'VT']) {
    scenes.push(s);
    items[s] = [
      { sceneItemId: 1, sourceName: 'Video Player', inputKind: 'ffmpeg_source', sceneItemEnabled: true, sceneItemIndex: 0 },
      { sceneItemId: 2, sourceName: 'D//0 Overlay', inputKind: 'browser_source', sceneItemEnabled: true, sceneItemIndex: 1 },
    ];
  }
  const inputs = [
    { inputName: 'Mic // Andrej', inputKind: 'coreaudio_input_capture', audio: true, muted: false },
    { inputName: 'VDO // Georgie', inputKind: 'browser_source', audio: true, muted: false },
    { inputName: 'DJ Mixer', inputKind: 'coreaudio_input_capture', audio: true, muted: false, notMic: true },
    { inputName: 'Desktop Audio', inputKind: 'coreaudio_output_capture', audio: true, muted: true },
    { inputName: 'Cam // Andrej', inputKind: 'av_capture_input_v2', audio: false },
    { inputName: 'Jingle // D//0 Sting', inputKind: 'ffmpeg_source', audio: true, muted: false, media: 6200 },
    { inputName: 'Jingle // Ösi vs Aussie', inputKind: 'ffmpeg_source', audio: true, muted: false, media: 9800 },
    { inputName: 'Bed // Talk Underscore', inputKind: 'ffmpeg_source', audio: true, muted: false, media: 182000 },
    { inputName: 'VDO // Guest', inputKind: 'browser_source', audio: true, muted: true, settings: {} },
    { inputName: 'Jingle Player', inputKind: 'ffmpeg_source', audio: true, muted: false, media: 5000, settings: {} },
    { inputName: 'Video Player', inputKind: 'ffmpeg_source', audio: true, muted: false, media: 30000, settings: {} },
  ];
  for (const i of inputs) if (i.audio) i.volumeDb = 0;
  // German names on purpose: the real Vienna OBS runs in German, and the studio must find "Cut" by kind
  const transitions = [
    { transitionName: 'Schnitt', transitionKind: 'cut_transition', transitionFixed: true, transitionConfigurable: false },
    { transitionName: 'Überblende', transitionKind: 'fade_transition', transitionFixed: false, transitionConfigurable: true },
    { transitionName: 'Stinger // D//0', transitionKind: 'obs_stinger_transition', transitionFixed: true, transitionConfigurable: true },
  ];
  const st = { collection: 'Unbenannt', collections: ['Unbenannt', 'DZ — Sunday Show', "DJ Andy'K — Friday Show"], program: 'STANDBY', preview: 'OPENING', studioMode: false, stream: false, record: false, streamStart: 0, recordStart: 0,
    transition: 'Überblende', duration: 300, media: {} };
  const PALETTE = { STANDBY: ['#1b1e24', '#07080a'], OPENING: ['#3a2a16', '#07080a'], VIENNA: ['#4a3016', '#111317'], MELBOURNE: ['#1d2c40', '#0b1018'],
    'SPLIT // BOTH': ['#3a2a16', '#1d2c40'], GUEST: ['#2a2230', '#0b0b10'], MUSIC: ['#16302a', '#07080a'], CREDITS: ['#202020', '#000'] };
  const esc = t => String(t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  function frame(scene) {
    const [a, b] = PALETTE[scene] || ['#222', '#000'];
    const t = new Date().toISOString().slice(11, 22);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>`
      + `<rect width="640" height="360" fill="url(#g)"/><circle cx="${320 + 180 * Math.sin(Date.now() / 900)}" cy="180" r="90" fill="#f2a650" opacity=".08"/>`
      + `<text x="32" y="56" fill="#8a9099" font-family="Helvetica" font-size="14" letter-spacing="4">MOCK OBS // SCENE</text>`
      + `<text x="32" y="200" fill="#f3f5f8" font-family="Helvetica" font-weight="bold" font-size="54">${esc(scene)}</text>`
      + `<text x="32" y="330" fill="#a9c8ee" font-family="Menlo" font-size="16">${t}</text></svg>`;
    return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
  }
  const mediaStatus = i => {
    const m = st.media[i.inputName];
    if (!m) return { mediaState: 'OBS_MEDIA_STATE_STOPPED', mediaDuration: i.media, mediaCursor: 0 };
    const cur = Date.now() - m.start;
    if (cur >= i.media) { delete st.media[i.inputName]; return { mediaState: 'OBS_MEDIA_STATE_ENDED', mediaDuration: i.media, mediaCursor: i.media }; }
    return { mediaState: 'OBS_MEDIA_STATE_PLAYING', mediaDuration: i.media, mediaCursor: cur };
  };
  const log = []; // every request the studio sent, for assertions
  const wss = new WebSocketServer({ port, host });
  const clients = new Set();

  const tc = start => {
    if (!start) return '00:00:00.000';
    const s = Math.floor((Date.now() - start) / 1000);
    return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.000`;
  };
  const event = (eventType, eventData) => { for (const c of clients) if (c.identified) c.ws.send(JSON.stringify({ op: 5, d: { eventType, eventIntent: 0, eventData } })); };

  const handlers = {
    GetVersion: () => ({ obsVersion: '31.0.0-mock', obsWebSocketVersion: '5.5.0-mock' }),
    GetSceneCollectionList: () => ({ currentSceneCollectionName: st.collection, sceneCollections: st.collections }),
    SetCurrentSceneCollection: d => {
      if (!st.collections.includes(d.sceneCollectionName)) throw [600, 'No scene collection'];
      st.collection = d.sceneCollectionName; event('CurrentSceneCollectionChanged', { sceneCollectionName: st.collection }); return {};
    },
    GetSceneList: () => ({ currentProgramSceneName: st.program, currentPreviewSceneName: st.studioMode ? st.preview : null,
      scenes: scenes.map((sceneName, i) => ({ sceneName, sceneIndex: scenes.length - 1 - i })) }),
    GetStudioModeEnabled: () => ({ studioModeEnabled: st.studioMode }),
    SetStudioModeEnabled: d => { st.studioMode = !!d.studioModeEnabled; event('StudioModeStateChanged', { studioModeEnabled: st.studioMode }); return {}; },
    SetCurrentProgramScene: d => {
      if (!scenes.includes(d.sceneName)) throw [600, 'No source was found by the name of `' + d.sceneName + '`.'];
      st.program = d.sceneName; event('CurrentProgramSceneChanged', { sceneName: st.program }); return {};
    },
    SetCurrentPreviewScene: d => {
      if (!st.studioMode) throw [506, 'Studio mode is not active.'];
      if (!scenes.includes(d.sceneName)) throw [600, 'No such scene'];
      st.preview = d.sceneName; event('CurrentPreviewSceneChanged', { sceneName: st.preview }); return {};
    },
    TriggerStudioModeTransition: () => {
      if (!st.studioMode) throw [506, 'Studio mode is not active.'];
      [st.program, st.preview] = [st.preview, st.program];
      event('CurrentProgramSceneChanged', { sceneName: st.program }); event('CurrentPreviewSceneChanged', { sceneName: st.preview }); return {};
    },
    GetSceneItemList: d => {
      if (!items[d.sceneName]) throw [600, 'No such scene'];
      return { sceneItems: items[d.sceneName].map(i => ({ ...i, isGroup: false, sourceType: 'OBS_SOURCE_TYPE_INPUT' })) };
    },
    SetSceneItemEnabled: d => {
      const it = items[d.sceneName]?.find(i => i.sceneItemId === d.sceneItemId);
      if (!it) throw [600, 'No such scene item'];
      it.sceneItemEnabled = !!d.sceneItemEnabled;
      event('SceneItemEnableStateChanged', { sceneName: d.sceneName, sceneItemId: it.sceneItemId, sceneItemEnabled: it.sceneItemEnabled }); return {};
    },
    GetInputList: () => ({ inputs: inputs.map(i => ({ inputName: i.inputName, inputKind: i.inputKind, unversionedInputKind: i.inputKind })) }),
    GetInputMute: d => {
      const i = inputs.find(x => x.inputName === d.inputName);
      if (!i) throw [600, 'No such input'];
      if (!i.audio) throw [604, 'The specified input does not support audio.'];
      return { inputMuted: i.muted };
    },
    SetInputMute: d => {
      const i = inputs.find(x => x.inputName === d.inputName && x.audio);
      if (!i) throw [600, 'No such audio input'];
      i.muted = !!d.inputMuted; event('InputMuteStateChanged', { inputName: i.inputName, inputMuted: i.muted }); return {};
    },
    GetSceneTransitionList: () => {
      const cur = transitions.find(t => t.transitionName === st.transition);
      return { currentSceneTransitionName: cur.transitionName, currentSceneTransitionKind: cur.transitionKind, transitions };
    },
    GetCurrentSceneTransition: () => {
      const cur = transitions.find(t => t.transitionName === st.transition);
      return { ...cur, transitionDuration: cur.transitionFixed ? null : st.duration };
    },
    SetCurrentSceneTransition: d => {
      if (!transitions.some(t => t.transitionName === d.transitionName)) throw [600, 'No such transition'];
      st.transition = d.transitionName; event('CurrentSceneTransitionChanged', { transitionName: st.transition }); return {};
    },
    SetCurrentSceneTransitionDuration: d => { st.duration = d.transitionDuration; event('CurrentSceneTransitionDurationChanged', { transitionDuration: st.duration }); return {}; },
    GetSourceScreenshot: d => {
      if (!scenes.includes(d.sourceName) && !inputs.some(i => i.inputName === d.sourceName)) throw [600, 'No such source'];
      return { imageData: frame(d.sourceName) };
    },
    GetInputVolume: d => {
      const i = inputs.find(x => x.inputName === d.inputName && x.audio);
      if (!i) throw [604, 'The specified input does not support audio.'];
      return { inputVolumeDb: i.volumeDb, inputVolumeMul: Math.pow(10, i.volumeDb / 20) };
    },
    SetInputVolume: d => {
      const i = inputs.find(x => x.inputName === d.inputName && x.audio);
      if (!i) throw [600, 'No such audio input'];
      i.volumeDb = d.inputVolumeDb; event('InputVolumeChanged', { inputName: i.inputName, inputVolumeDb: i.volumeDb, inputVolumeMul: 0 }); return {};
    },
    GetMediaInputStatus: d => {
      const i = inputs.find(x => x.inputName === d.inputName && x.media);
      if (!i) throw [604, 'Not a media input'];
      return mediaStatus(i);
    },
    SetInputSettings: d => {
      const i = inputs.find(x => x.inputName === d.inputName);
      if (!i) throw [600, 'No such input'];
      i.settings = { ...(i.settings || {}), ...d.inputSettings }; return {};
    },
    TriggerMediaInputAction: d => {
      const i = inputs.find(x => x.inputName === d.inputName && x.media);
      if (!i) throw [604, 'Not a media input'];
      if (/RESTART|PLAY$/.test(d.mediaAction)) { st.media[i.inputName] = { start: Date.now() }; event('MediaInputPlaybackStarted', { inputName: i.inputName }); }
      else { delete st.media[i.inputName]; event('MediaInputPlaybackEnded', { inputName: i.inputName }); }
      return {};
    },
    GetStreamStatus: () => ({ outputActive: st.stream, outputReconnecting: false, outputTimecode: tc(st.streamStart), outputDuration: 0,
      outputCongestion: st.stream ? 0.02 : 0, outputBytes: 0, outputSkippedFrames: 0, outputTotalFrames: st.stream ? 1000 : 0 }),
    GetRecordStatus: () => ({ outputActive: st.record, outputPaused: false, outputTimecode: tc(st.recordStart), outputDuration: 0, outputBytes: 0 }),
    GetStats: () => ({ cpuUsage: 7.4 + Math.random() * 2, memoryUsage: 512.4, activeFps: 60, renderSkippedFrames: 3, renderTotalFrames: 108000, outputSkippedFrames: 0,
      outputTotalFrames: 108000, availableDiskSpace: 412000, averageFrameRenderTime: 2.1 }),
    StartStream: () => { if (st.stream) throw [500, 'Stream already active']; st.stream = true; st.streamStart = Date.now(); event('StreamStateChanged', { outputActive: true, outputState: 'OBS_WEBSOCKET_OUTPUT_STARTED' }); return {}; },
    StopStream: () => { if (!st.stream) throw [501, 'Stream not active']; st.stream = false; st.streamStart = 0; event('StreamStateChanged', { outputActive: false, outputState: 'OBS_WEBSOCKET_OUTPUT_STOPPED' }); return {}; },
    StartRecord: () => { st.record = true; st.recordStart = Date.now(); event('RecordStateChanged', { outputActive: true, outputState: 'OBS_WEBSOCKET_OUTPUT_STARTED' }); return {}; },
    StopRecord: () => { st.record = false; st.recordStart = 0; event('RecordStateChanged', { outputActive: false, outputState: 'OBS_WEBSOCKET_OUTPUT_STOPPED' }); return {}; },
  };

  wss.on('connection', ws => {
    const c = { ws, identified: false };
    clients.add(c);
    const salt = crypto.randomBytes(16).toString('base64'), challenge = crypto.randomBytes(16).toString('base64');
    ws.send(JSON.stringify({ op: 0, d: { obsWebSocketVersion: '5.5.0-mock', rpcVersion: 1, ...(password ? { authentication: { challenge, salt } } : {}) } }));
    ws.on('message', raw => {
      const { op, d } = JSON.parse(raw);
      if (op === 1) {
        if (password && d.authentication !== sha(sha(password + salt) + challenge)) return ws.close(4009, 'Authentication failed.');
        c.identified = true; c.events = d.eventSubscriptions || 0;
        return ws.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));
      }
      if (op === 6 && c.identified) {
        log.push({ requestType: d.requestType, requestData: d.requestData });
        let status = { result: true, code: 100 }, responseData;
        try {
          const fn = handlers[d.requestType];
          if (!fn) throw [204, 'Unknown request type'];
          responseData = fn(d.requestData || {});
        } catch (e) { status = { result: false, code: e[0] || 500, comment: e[1] || String(e) }; }
        ws.send(JSON.stringify({ op: 7, d: { requestType: d.requestType, requestId: d.requestId, requestStatus: status, responseData } }));
      }
    });
    ws.on('close', () => clients.delete(c));
  });

  // fake programme audio so the meters move during a rehearsal
  const meterTimer = meters ? setInterval(() => {
    const t = Date.now() / 1000;
    const lvl = (base, speed) => Math.max(0, Math.min(1, base * (0.55 + 0.45 * Math.sin(t * speed)) * (0.7 + Math.random() * 0.3)));
    const data = { inputs: inputs.filter(i => i.audio).map(i => {
      const m = i.muted || (i.media && !st.media[i.inputName]) ? 0 : i.inputName.startsWith('Mic') ? lvl(0.35, 3.1) : i.inputName.startsWith('VDO') ? lvl(0.25, 2.3) : i.inputName === 'DJ Mixer' ? lvl(0.7, 1.7) : lvl(0.1, 1);
      return { inputName: i.inputName, inputLevelsMul: [[m * 0.8, m, m], [m * 0.75, m * 0.95, m]] };
    }) };
    for (const c of clients) if (c.identified && (c.events & (1 << 16))) c.ws.send(JSON.stringify({ op: 5, d: { eventType: 'InputVolumeMeters', eventIntent: 1 << 16, eventData: data } }));
  }, 60) : null;

  return {
    state: st, scenes, items, inputs, transitions, log,
    ready: new Promise(r => wss.on('listening', r)),
    get port() { return wss.address().port; },
    close: () => new Promise(r => { clearInterval(meterTimer); for (const c of clients) c.ws.terminate(); wss.close(r); }),
  };
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const password = process.env.OBS_WEBSOCKET_PASSWORD || 'mock-password';
  const m = startMockObs({ password, port: Number(process.env.MOCK_OBS_PORT) || 4455 });
  await m.ready;
  console.log(`Mock OBS listening on ws://127.0.0.1:${m.port}  password: ${password === 'mock-password' ? 'mock-password' : '(from OBS_WEBSOCKET_PASSWORD)'}`);
  console.log('Start the studio with the same password, e.g.  OBS_WEBSOCKET_PASSWORD=mock-password npm start');
}
