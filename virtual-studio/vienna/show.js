// D//0 — PIANO SESSIONS: the show simulation. Short opening (official ident) → long opening (official piano theme)
// → live piano performance, with the between-songs ident by hand as often as wanted → closing → show ended, on the
// stage's own lift, lights and cameras.
//
// The audio is the clock: each segment's time is its <audio> element's currentTime, so pausing, resuming or seeking
// can never pull picture and sound apart (the lift freezes with the show while paused). The camera and lighting
// script is built from the measured recordings (piano-show-map.js, made by audio-map.mjs), not from guessed times.
// Only one recording ever plays: starting one stops every other first. Between songs and the closing are started by
// hand (the closing ends the show: SHOW ENDED once its recording has died away).
// Local simulation only: nothing is sent anywhere. The audio plays in the page, so an OBS browser source with
// "Control audio via OBS" picks it up when the show is broadcast later.
import { SHOW } from './piano-show-config.js';
import { AUDIO_MAP } from './piano-show-map.js';

export const STATES = ['IDLE', 'PREPARING', 'OPENING', 'THEME', 'LIVE', 'SONG', 'BETWEEN', 'CLOSING', 'ENDED'];

// a song from the repertoire, performed live: calm cuts round the stage cameras, the keyboard (P2) every other shot so
// the keys playing the recording are seen; warm light (the operator can take over)
const SONG_SHOTS = { length: 12, cams: ['P2', 'P1', 'P6', 'P3', 'P2', 'P5'] };   // P6: the 4K high-speed, once a round

// the opening's script, from its measured onsets: under-light on the first accent; the lift sets off so the platform
// arrives on the biggest moment (the onset with the loudest 5 s after it, once the lift has had time to rise); the
// cameras follow it up, cut on the accents after it, and the last accent before the tail gets the wide shot
export function openingScript(map, rise) {
  const on = map.onsets, D = map.duration;
  const last = [...on].reverse().find(o => o.t < D - 3) || { t: D - 4 };
  const cands = on.filter(o => o.t >= rise + 0.5 && o.t <= last.t - 6);
  const arrival = (cands.length ? cands.reduce((a, b) => (b.after > a.after ? b : a)) : { t: Math.min(D - 6, rise + 1) }).t;
  const liftAt = Math.max(0, arrival - rise);
  const follow = on.find(o => o.t > liftAt + 0.5 && o.t < arrival)?.t ?? liftAt + 2;
  const accent = on[0]?.t ?? 2;
  const cues = [
    { t: 0, lights: 'LIFT REVEAL', hold: ['under', 'spot'], cut: 'P4', say: 'opening · lights down' },
    { t: Math.min(accent, liftAt), release: 'under', say: 'under-platform light' },
    { t: liftAt, lift: 'up', say: 'lift rising' },
    { t: follow, cut: 'P5' },
    { t: arrival, lights: 'PERFORMANCE', release: 'all', set: { spot: 1 }, cut: 'P1', say: 'platform up · performance spot' },
  ];
  // after the arrival: a cut on each accent before the last one (the first of them also brings the lights down to
  // CINEMATIC), and one in the middle of any stretch longer than 9 s; side and keyboard shots in turn
  const after = on.filter(o => o.t > arrival + 1 && o.t < last.t).map(o => o.t), times = [];
  let prev = arrival;
  for (const t of [...after, last.t]) { if (t - prev > 9) times.push({ t: +((prev + t) / 2).toFixed(2) }); if (t !== last.t) times.push({ t, accent: true }); prev = t; }
  times.forEach((c, i) => cues.push({ t: c.t, cut: ['P3', 'P2'][i % 2], lights: c.t === after[0] ? 'CINEMATIC' : undefined }));
  cues.push({ t: last.t, cut: 'P4', lights: 'PERFORMANCE', set: { spot: 1 }, say: 'final accent' });
  cues.push({ t: Math.max(last.t + 1, D - 2.5), lights: 'CINEMATIC', release: 'all' });
  return { duration: D, arrival, liftAt, cues: cues.sort((a, b) => a.t - b.t) };
}

// the theme's script, from its measured sections: each section lit by its energy (the loudest loud one as the
// climax), cut into shots of that energy's length on that energy's cameras, each cut moved onto a measured onset when
// one is near; the closing quiet section ends on the main front camera
export function themeScript(map, shots = SHOW.shots) {
  const D = map.duration, cues = [], onsetT = map.onsets.map(o => o.t);
  const loud = map.sections.filter(s => s.energy === 'loud');
  const climax = loud.length ? loud.reduce((a, b) => (b.db > a.db ? b : a)) : null;
  let cam = null;
  const next = list => { const i = (list.indexOf(cam) + 1) % list.length; cam = list[i] === cam ? list[(i + 1) % list.length] : list[i]; return cam; };
  map.sections.forEach((s, si) => {
    const kind = shots[s.energy], last = si === map.sections.length - 1;
    const n = Math.max(1, Math.round((s.to - s.from) / kind.length));
    for (let i = 0; i < n; i++) {
      let t = s.from + ((s.to - s.from) * i) / n;
      const near = onsetT.find(o => Math.abs(o - t) <= shots.snap && o >= s.from && o < s.to);
      if (near !== undefined && i > 0) t = near;
      const c = { t: +t.toFixed(2), cut: last && i === 0 ? 'P1' : next(kind.cams) };
      if (i === 0) { c.lights = s === climax ? shots.climax.lights : kind.lights; c.release = 'all'; c.say = `theme · ${s === climax ? 'climax' : s.energy}`; }
      if (s === climax && i === 0) c.set = { spot: 1 };
      cues.push(c);
    }
  });
  return { duration: D, cues };
}

// between songs and closing: a cut on each measured accent at least `minShot` after the last cut (and a cut in the
// middle of any gap over twice that), cameras in turn, the last cut on `last`. Between songs: warm light, no lift.
// Closing: the light comes down in steps at every cut, to `dimTo` where the recording dies away
export function identScript(map, cfg, { dim = false } = {}) {
  const D = map.duration, times = [0];
  for (const o of map.onsets.map(o => o.t)) {
    if (o - times.at(-1) < cfg.minShot || D - o < cfg.minShot / 2) continue;
    if (o - times.at(-1) >= 2 * cfg.minShot) times.push(+((times.at(-1) + o) / 2).toFixed(2));
    times.push(o);
  }
  if (map.tail - times.at(-1) >= 2 * cfg.minShot) times.push(+((times.at(-1) + map.tail) / 2).toFixed(2));
  const cues = times.map((t, i) => ({ t, cut: i === times.length - 1 ? cfg.last : cfg.cams[i % cfg.cams.length] }));
  cues[0].release = 'all';
  if (dim) {
    cues[0].lights = 'CINEMATIC'; cues[0].master = 1; cues[0].say = 'closing';
    cues.forEach((c, i) => { if (i) c.master = +(1 - (1 - cfg.dimTo) * (c.t / map.tail)).toFixed(3); });
    Object.assign(cues.at(-1), { lights: 'WARM PIANO', set: { spot: 0.6 }, say: 'closing · last shot' });   // the grand in a soft light, the logo behind
    cues.push({ t: map.tail, master: cfg.dimTo, say: 'closing · dying away' });
  } else {
    Object.assign(cues[0], { lights: cfg.lights, master: 1, say: 'between songs' });
  }
  return { duration: D, cues };
}

// `api`: what the show drives on the stage (index.js): cut(cam), lights(mode, { hold, release, set, master }),
// lift(cmd), liftState(), liftHeld() (lift hold: the show never moves the lift), freezeLift(on), say(text)
export function createShow({ api, rise }) {
  const media = {
    opening: { cfg: SHOW.opening, map: AUDIO_MAP.opening, script: openingScript(AUDIO_MAP.opening, rise), state: 'OPENING', next: 'theme' },
    theme: { cfg: SHOW.theme, map: AUDIO_MAP.theme, script: themeScript(AUDIO_MAP.theme), state: 'THEME', next: 'live' },
    between: { cfg: SHOW.between, map: AUDIO_MAP.between, script: identScript(AUDIO_MAP.between, SHOW.between), state: 'BETWEEN', next: 'live' },
    closing: { cfg: SHOW.closing, map: AUDIO_MAP.closing, script: identScript(AUDIO_MAP.closing, SHOW.closing, { dim: true }), state: 'CLOSING', next: 'ended' },
  };
  // the song slot: one recording at a time from the repertoire (its original audio, from the song library)
  const songAudio = new Audio(); songAudio.preload = 'auto';
  const song = { cfg: { label: '' }, map: null, state: 'SONG', next: 'live', audio: songAudio, script: { cues: [] }, entry: null };
  songAudio.addEventListener('loadedmetadata', () => { song.duration = songAudio.duration; });
  songAudio.addEventListener('error', () => { song.failed = true; });
  for (const m of Object.values(media)) {
    const a = new Audio(new URL(`../../${m.cfg.audio}`, import.meta.url).href);
    a.preload = 'metadata';   // the masters are large WAVs: the browser streams each one when its segment starts
    a.addEventListener('loadedmetadata', () => {
      m.duration = a.duration;
      if (Math.abs(a.duration - m.map.duration) > 0.05) api.say(`${m.cfg.label}: the file is ${a.duration.toFixed(2)} s, the timing map ${m.map.duration} s — run audio-map.mjs`);
    });
    a.addEventListener('error', () => { m.failed = true; });
    m.audio = a;
  }

  media.song = song;

  /* the opening video slot (SHOW.opening.video): muted, over the 3D studio, kept on the opening audio's clock */
  let video = null, videoShown = false;
  if (SHOW.opening.video) {
    video = document.createElement('video');
    Object.assign(video, { muted: true, playsInline: true, preload: 'auto', src: new URL(`../../${SHOW.opening.video}`, import.meta.url).href });
    video.className = 'vz-video';
    const css = document.createElement('style');
    css.textContent = `.vz-video{position:fixed;inset:0;width:100%;height:100%;object-fit:cover;background:#000;z-index:4;opacity:0;pointer-events:none;transition:opacity ${SHOW.opening.videoFade}s ease}.vz-video.on{opacity:1}`;
    document.head.append(css); document.body.append(video);
  }
  const showVideo = on => { if (!video) return; videoShown = on; video.classList.toggle('on', on); if (!on) video.pause(); };

  let state = 'IDLE', seg = null, cue = 0, paused = false, t = 0, liftOwned = true, camsOwned = true, lightsOwned = true, pendingUp = false, then = null;
  // only one recording ever plays: every start goes through here first
  const stopAll = () => { for (const m of Object.values(media)) m.audio.pause(); if (video) video.pause(); };

  function fire(c) {
    if (lightsOwned && (c.lights || c.hold || c.release || c.set || c.master !== undefined)) api.lights(c.lights || null, c);
    if (c.cut && camsOwned) api.cut(c.cut);
    if (c.lift && liftOwned) api.lift(c.lift);
    if (c.say) api.say('Piano Show: ' + c.say);
  }
  function begin(name) {
    stopAll(); showVideo(false);
    const m = media[name];
    seg = name; state = m.state; cue = 0; t = 0; paused = false; camsOwned = true; lightsOwned = true; then = null;
    api.freezeLift(false);
    m.audio.currentTime = 0;
    if (!m.failed) m.audio.play().catch(() => { m.failed = true; api.say(`${m.cfg.label}: the browser would not play the audio — running on the show clock`); });
    if (name === 'opening' && video) { video.currentTime = 0; video.play().catch(() => {}); showVideo(true); }
    if (name === 'theme' && liftOwned && api.liftState() !== 'ELEVATED') ensureUp();
  }
  function ensureUp() {
    const s = api.liftState();
    if (s === 'ELEVATED' || s === 'RAISING') return;
    if (s === 'LOWERING') { api.lift('stop'); pendingUp = true; } else api.lift('up');
  }
  // live piano performance: no audio, the main front camera, warm light at full level; the lift stays where it is
  // (after the openings it is up), everything else is the operator's
  function live({ first = false } = {}) {
    stopAll(); showVideo(false);
    seg = null; state = 'LIVE'; paused = false; api.freezeLift(false);
    if (first && liftOwned) ensureUp();
    api.lights(SHOW.live.lights, { release: 'all', master: 1 }); api.cut(SHOW.live.camera);
    api.say('Piano Show: LIVE PIANO PERFORMANCE (simulation)');
  }
  function ended() {
    stopAll(); seg = null; state = 'ENDED'; paused = false; api.freezeLift(false);
    api.say('Piano Show: SHOW ENDED');   // the last shot and the soft light stay as the closing left them
  }
  // from the top: the platform must be down first (it is lowered if it is not), then the opening plays
  function start() {
    stopAll(); showVideo(false);
    liftOwned = true; seg = null; paused = false; api.freezeLift(false);
    if (api.liftState() === 'LOWERED' || api.liftHeld?.()) return begin('opening');   // (lift hold: the opening plays where the lift stands)
    state = 'PREPARING'; api.lift('reset'); then = 'opening';
    api.say('Piano Show: lowering the platform for the opening');
  }
  const running = () => state === 'OPENING' || state === 'THEME' || state === 'PREPARING';

  return {
    get state() { return state; },
    get paused() { return paused; },
    get segment() { return seg; },
    get time() { return t; },
    get duration() { return seg ? media[seg].duration || media[seg].map?.duration || media[seg].entry?.seconds || 0 : 0; },
    get song() { return song.entry; },
    get label() { return seg === 'song' ? 'Live piano · ' + song.entry.title : seg ? media[seg].cfg.label : { LIVE: SHOW.live.label, ENDED: SHOW.ended.label, PREPARING: 'Preparing the stage' }[state] || 'Ready'; },
    get clock() { return seg && !media[seg].failed ? 'audio' : 'show clock'; },
    get video() { return !!video; },
    get videoShown() { return videoShown; },
    scripts: Object.fromEntries(Object.entries(media).map(([k, m]) => [k, m.script])),
    audio: Object.fromEntries(Object.entries(media).map(([k, m]) => [k, m.audio])),
    command(name) {
      switch (name) {
        case 'start': if (running()) return api.say('Piano Show already running: STOP SHOW or RESTART OPENING'); return start();
        case 'restart': return start();
        case 'pause': {
          if (!seg) return;
          paused = !paused;
          const m = media[seg];
          if (paused) { m.audio.pause(); if (videoShown) video.pause(); api.freezeLift(true); api.say('Piano Show: paused'); }
          else { if (!m.failed) m.audio.play().catch(() => {}); if (videoShown) video.play().catch(() => {}); api.freezeLift(false); api.say('Piano Show: resumed'); }
          return;
        }
        case 'stop': stopAll(); showVideo(false); seg = null; state = 'IDLE'; paused = false; then = null; pendingUp = false; api.freezeLift(false); return api.say('Piano Show: stopped');
        case 'skip': { if (state === 'IDLE' || state === 'PREPARING' || state === 'ENDED') liftOwned = true; return begin('theme'); }
        case 'live': return live({ first: running() || state === 'IDLE' });
        case 'video': if (video && seg === 'opening') showVideo(!videoShown); return;
        // between songs: by hand only, as often as wanted; it never moves the lift
        case 'between': if (running()) return api.say('Between songs: wait for LIVE (or GO LIVE first)'); return begin('between');
        case 'between-stop': case 'return-live': return seg === 'between' || name === 'return-live' ? live() : undefined;
        case 'closing': case 'closing-restart': if (state === 'PREPARING') return api.say('Closing: the stage is still being prepared'); return begin('closing');
        case 'closing-stop': return seg === 'closing' ? live() : undefined;
        case 'song-stop': return seg === 'song' ? live() : undefined;
      }
    },
    // perform a song from the repertoire: its original recording, the stage cameras in turn, back to LIVE at its end.
    // A recording that cannot be loaded is reported (and nothing is put in its place)
    playSong(entry) {
      if (running()) return api.say('Perform a song from LIVE (the openings are still running)');
      if (!entry?.audio) return api.say(`${entry?.title || 'Song'}: no original recording listed in the song library — please provide it`);
      stopAll();
      song.entry = entry; song.failed = false; song.duration = entry.seconds || 0;
      song.cfg.label = entry.title;
      if (songAudio.src !== entry.audio) songAudio.src = entry.audio;
      song.script.cues = Array.from({ length: 400 }, (_, i) => ({ t: i * SONG_SHOTS.length, cut: SONG_SHOTS.cams[i % SONG_SHOTS.cams.length] }));
      Object.assign(song.script.cues[0], { lights: SHOW.live.lights, release: 'all', master: 1, say: 'song · ' + entry.title });
      begin('song');
    },
    // a jump within the song (the operator clicks the time bar): the recording moves, the keys and the next cut follow
    // its time. Only the song: the openings and idents run their scripts from the top
    seek(time) {
      if (seg !== 'song') return;
      const m = media.song, d = m.duration || 0;
      t = Math.max(0, d ? Math.min(time, d - 0.05) : time);
      if (!m.failed) m.audio.currentTime = t;
      cue = m.script.cues.findIndex(c => c.t > t); if (cue < 0) cue = m.script.cues.length;
    },
    // the operator takes a part over: the show stops driving it (cameras and lights until the next segment, the lift
    // for the rest of the show)
    manual(part) { if (part === 'lift') liftOwned = false; if (part === 'cams') camsOwned = false; if (part === 'lights') lightsOwned = false; },
    update(dt) {
      if (pendingUp && api.liftState() !== 'LOWERING' && api.liftState() !== 'RAISING') { pendingUp = false; if (liftOwned) api.lift('up'); }
      if (state === 'PREPARING') { if (api.liftState() === 'LOWERED') { const n = then; then = null; begin(n); } return; }
      if (!seg || paused) return;
      const m = media[seg];
      if (seg === 'song' && m.failed) { const e = m.entry; live(); api.say(`${e.title}: the original recording could not be loaded — please provide it (${e.audio})`); return; }
      t = m.failed ? t + dt : m.audio.currentTime;
      if (video && seg === 'opening' && videoShown && Math.abs(video.currentTime - t) > 0.12) video.currentTime = t;   // the video follows the audio
      const cues = m.script.cues;
      while (cue < cues.length && t >= cues[cue].t) fire(cues[cue++]);
      // the end: the recording has played out (the closing waits for its natural end, not a cut-off)
      if (m.audio.ended || (m.failed && t >= (m.duration || m.map?.duration))) {
        const next = m.next;
        if (next === 'theme') begin('theme'); else if (next === 'live') live({ first: seg === 'theme' }); else ended();
      }
    },
  };
}
