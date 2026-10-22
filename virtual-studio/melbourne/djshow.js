// The DJ Room's opening: "Distance Zero (official show song + DJ Room opening)", the official master (5:49, 48 kHz,
// 16-bit). Its script is timed by the recording itself (measured from the master, 2026-10-21: loudness per second,
// the biggest jumps, the kick's tempo 140 BPM all through): the booth sets off in the studio so that it lands in the
// club exactly on the first big entry (1:00), the light follows the sections, and the drops land on 2:47, 4:10 and
// 4:52. The audio element is the clock: pause, resume and a jump keep picture, lift and light on it.
//
// This recording is the show's opening media: the page plays it (it reaches OBS with the page's sound, like the Piano
// Show's openings). While it plays, the Broadcast Studio's Audio Director keeps every other music source silent.
// With LIFT HOLD on, it plays without moving the lift (the lift cues are refused, everything else runs).
import { DJ_AUDIO_MAP } from './dj-audio-map.js';

export const DJ_OPENING = {
  audio: 'assets/audio/dj-room/dz-dj-room-opening.wav', map: 'big',
  duration: 348.76, bpm: 140,
  lift: 60.0,   // the booth lands in the club here (the transition takes 19.0 s: 2.5 s of light, 16.5 s of travel)
  cues: [
    { t: 0, mode: 'OPENING', led: 'LOGO', view: 'djwide', say: 'intro: the studio, the booth up' },
    { t: 14, view: 'floor' },
    { t: 27, liftView: 'top', say: 'the booth in the studio' },
    { t: 41.0, transition: 'down', say: 'the booth sets off (lands on 1:00)' },
    { t: 60.0, mode: 'PERFORMANCE', show: 'live', led: 'PULSE', say: 'first entry: the booth is down' },
    { t: 64, auto: true },
    { t: 70, mode: 'BREAKDOWN' }, { t: 74, mode: 'PERFORMANCE' },
    { t: 98, mode: 'BREAKDOWN', led: 'WAVES' }, { t: 126, mode: 'PERFORMANCE', led: 'PULSE' },
    { t: 146, mode: 'BUILD-UP', say: 'build-up to the drop' },
    { t: 167, mode: 'DROP', cam: 'DJ1', say: 'DROP (2:47)' },
    { t: 182, mode: 'PERFORMANCE' }, { t: 208, led: 'TUNNEL' },
    { t: 236, mode: 'BREAKDOWN', led: 'WAVES' },
    { t: 250, mode: 'DROP', cam: 'DJ1', say: 'second drop (4:10)' },
    { t: 278, mode: 'PERFORMANCE', led: 'PULSE' }, { t: 284, mode: 'BUILD-UP' },
    { t: 292, mode: 'DROP', cam: 'DJ3', say: 'third drop (4:52)' },
    { t: 306, mode: 'BREAKDOWN' }, { t: 318, mode: 'PERFORMANCE' },
    { t: 332, mode: 'DROP', cam: 'DJ1', say: 'finale (5:32)' },
    { t: 346, mode: 'CLOSING', auto: false, cam: 'DJ2', say: 'closing' },
  ],
};

// Opening 1, the short one: "Distance // Zero (opening)", 1:39. Measured 2026-10-21: the big entry at 0:54 (+5 dB),
// the end fading from 1:36. The booth sets off at 0:35 and lands on 0:54; DROP there, CLOSING light as it fades
export const DJ_OPENING_SHORT = {
  audio: 'assets/audio/dj-room/dz-dj-room-opening-short.wav', map: 'short',
  duration: 99.16, bpm: null, lift: 54.0,
  cues: [
    { t: 0, mode: 'OPENING', led: 'LOGO', view: 'djwide', say: 'short opening: the studio, the booth up' },
    { t: 12, liftView: 'top' },
    { t: 35.0, transition: 'down', say: 'the booth sets off (lands on 0:54)' },
    { t: 54.0, mode: 'DROP', show: 'live', led: 'PULSE', cam: 'DJ1', say: 'the entry: the booth is down' },
    { t: 62, auto: true }, { t: 70, mode: 'PERFORMANCE' }, { t: 80, mode: 'BREAKDOWN' }, { t: 88, mode: 'PERFORMANCE' },
    { t: 95, mode: 'CLOSING', auto: false, cam: 'DJ2' },
  ],
};

// `api`: what the opening drives in the DJ Room (index.js): mode, led, view (a studio view), liftView, transition,
// show, auto, cam (a cut that keeps the automatic sequence), tempo, say, liftReady() (booth up, cover open, arms in)
export function createDjShow({ api, url, script = DJ_OPENING }) {
  const S = script;
  // the music map (dj-audio-map.js): the levels at the recording's current time, for the light to follow
  const M = DJ_AUDIO_MAP[S.map], bytes = b => Uint8Array.from(atob(b), c => c.charCodeAt(0));
  const band = M && { low: bytes(M.low), mid: bytes(M.mid), high: bytes(M.high), kick: bytes(M.kick) };
  const at = (a, fps, t) => (a[Math.max(0, Math.min(a.length - 1, Math.round(t * fps)))] || 0) / 255;
  const audio = new Audio(); audio.preload = 'metadata'; audio.src = url; audio.crossOrigin = 'anonymous';
  let state = 'IDLE', next = 0, error = null;
  audio.addEventListener('ended', () => { if (state !== 'IDLE') { state = 'ENDED'; api.say('DJ opening: ended'); } });
  audio.addEventListener('error', () => { error = 'the recording could not be loaded'; if (state === 'PLAYING') { state = 'IDLE'; api.say('DJ opening: ' + error); } });
  function fire(c) {
    if (c.mode) api.mode(c.mode);
    if (c.led) api.led(c.led);
    if (c.view) api.view(c.view);
    if (c.liftView) api.liftView(c.liftView);
    if (c.transition) api.transition(c.transition);
    if (c.show) api.show(c.show);
    if (c.auto !== undefined) api.auto(c.auto);
    if (c.cam) api.cam(c.cam);
    if (c.say) api.say('DJ opening: ' + c.say);
  }
  // after a jump: the state the script has reached at `t` (light, LEDs), without re-running moves or cuts
  function catchUp(t) {
    let mode = null, led = null; for (const c of S.cues) { if (c.t > t) break; mode = c.mode || mode; led = c.led || led; }
    if (mode) api.mode(mode); if (led) api.led(led);
    next = S.cues.findIndex(c => c.t > t); if (next < 0) next = S.cues.length;
  }
  return {
    // what the music is doing now: low / mid / high energy, the kick, and `hit` (0…1, fading 0.25 s after a big hit)
    music() {
      if (!band || (state !== 'PLAYING' && state !== 'PAUSED')) return null;
      const t = audio.currentTime, h = M.hits.reduce((x, ht) => (ht <= t && t - ht < 0.25 ? Math.max(x, 1 - (t - ht) / 0.25) : x), 0);
      return { low: at(band.low, M.fps, t), mid: at(band.mid, M.fps, t), high: at(band.high, M.fps, t), kick: at(band.kick, M.kickFps, t), hit: h };
    },
    get state() { return state; }, get time() { return audio.currentTime; }, get duration() { return S.duration; }, get error() { return error; }, audio,
    start() {
      if (!api.liftReady()) return { ok: false, reason: 'The booth must be up in the studio (cover open, arms in): Return ↑ first' };
      audio.currentTime = 0; next = 0; error = null; state = 'PLAYING'; if (S.bpm) api.tempo(S.bpm);
      audio.play().catch(e => { error = e.message; state = 'IDLE'; api.say('DJ opening: the browser would not play the audio'); });
      return { ok: true };
    },
    pause() { if (state === 'PLAYING') { audio.pause(); state = 'PAUSED'; } else if (state === 'PAUSED') { audio.play(); state = 'PLAYING'; } return { ok: true }; },
    stop() { audio.pause(); state = 'IDLE'; api.auto(false); return { ok: true }; },
    seek(t) { if (state === 'IDLE' || state === 'ENDED') return { ok: false, reason: 'not playing' }; audio.currentTime = Math.max(0, Math.min(S.duration - 0.1, +t)); catchUp(audio.currentTime); return { ok: true }; },
    update() {
      if (state !== 'PLAYING') return;
      const t = audio.currentTime;
      while (next < S.cues.length && S.cues[next].t <= t) fire(S.cues[next++]);
    },
  };
}
