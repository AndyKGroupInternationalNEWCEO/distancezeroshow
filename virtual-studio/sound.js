// Sound for the Virtual Space: the DISTANCE // ZERO soundtrack (the main website's 8 tracks, streamed from
// distancezeroshow.com, not copied) and a playable Web Audio piano. Both feed one analyser that drives the
// studio lighting. Nothing makes a sound until the visitor clicks: the AudioContext is created on first use.

const SITE = 'https://distancezeroshow.com/assets/';
export const TRACKS = [
  { group: 'Show', title: 'DISTANCE // ZERO — Opening', len: '0:35', file: 'music-opening.mp3' },
  { group: 'Show', title: 'DISTANCE // ZERO', len: '1:34', file: 'music-distance-zero.mp3' },
  { group: 'Show', title: 'January', len: '1:54', file: 'music-january.mp3' },
  { group: 'Austrian versions', title: 'Eine Frequenz', len: '0:34', file: 'music-at-eine-frequenz.mp3' },
  { group: 'Austrian versions', title: 'DISTANCE // ZERO (AT)', len: '1:56', file: 'music-at-distance-zero.mp3' },
  { group: 'Austrian versions', title: 'Jänner', len: '1:52', file: 'music-at-jaenner.mp3' },
  { group: 'Signature', title: 'Three-Note Signature', len: '3:32', file: 'music-three-note-signature.mp3' },
  { group: 'Signature', title: 'Three-Note Signature (B)', len: '3:25', file: 'music-three-note-signature-b.mp3' },
];

// a short, soft room: noise with an exponential tail
function impulse(ctx, seconds) {
  const n = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2); }
  return buf;
}

export function createSound() {
  let ctx = null, master, analyser, pianoBus, musicGain, mediaNode = null;
  const listeners = new Set(), emit = () => listeners.forEach(f => f(state()));
  const audio = new Audio();
  audio.crossOrigin = 'anonymous'; // the main site sends Access-Control-Allow-Origin: *, so the lights can "hear" it
  audio.preload = 'none';
  let index = -1, failed = '', only = null, musicLevel = 0.85, afterThis = null;   // afterThis: run once when the current track ends, instead of the next track   // only: a playlist the player keeps to (the on-air simulation's music bed)

  function ensure() {
    if (ctx) { if (ctx.state !== 'running') ctx.resume().catch(() => {}); return ctx; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3;
    analyser = ctx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.78;
    master.connect(comp).connect(analyser).connect(ctx.destination);
    pianoBus = ctx.createGain(); pianoBus.gain.value = 0.75;
    const verb = ctx.createConvolver(), wet = ctx.createGain();
    verb.buffer = impulse(ctx, 2.0); wet.gain.value = 0.2;
    pianoBus.connect(master); pianoBus.connect(verb).connect(wet).connect(master);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.85; musicGain.connect(master);
    return ctx;
  }

  /* ---------- soundtrack ---------- */
  function play(i) {
    ensure();
    if (!mediaNode) { mediaNode = ctx.createMediaElementSource(audio); mediaNode.connect(musicGain); }
    index = (i + TRACKS.length) % TRACKS.length; failed = '';
    audio.src = SITE + TRACKS[index].file;
    musicGain.gain.cancelScheduledValues(ctx.currentTime);
    musicGain.gain.setValueAtTime(0, ctx.currentTime);
    musicGain.gain.linearRampToValueAtTime(musicLevel, ctx.currentTime + 1.2);
    return audio.play().catch(e => { failed = 'Playback was blocked or the track could not load.'; emit(); throw e; });
  }
  audio.addEventListener('ended', () => afterThis ? (h => { afterThis = null; h(); })(afterThis) : play(only ? only[(only.indexOf(index) + 1) % only.length] : index + 1).catch(() => {}));
  audio.addEventListener('error', () => { failed = 'This track could not be loaded from distancezeroshow.com.'; emit(); });
  for (const ev of ['play', 'pause', 'loadedmetadata', 'durationchange']) audio.addEventListener(ev, emit);
  let lastTick = 0;
  audio.addEventListener('timeupdate', () => { const n = performance.now(); if (n - lastTick > 250) { lastTick = n; emit(); } });

  const state = () => ({ index, playing: !audio.paused && index >= 0, time: audio.currentTime || 0, duration: audio.duration || 0, failed });

  /* ---------- piano ---------- */
  // additive voice: a few harmonics with a little inharmonicity, a bright hammer that mellows, natural decay
  const voices = new Map();
  const PARTIALS = [[1, 1], [2, 0.42], [3, 0.2], [4, 0.11], [5, 0.06], [6, 0.03]];
  function noteOn(midi, velocity = 0.8) {
    ensure();
    if (voices.has(midi)) noteOff(midi, 0.03);
    if (voices.size > 18) noteOff(voices.keys().next().value, 0.05); // steal the oldest
    const t = ctx.currentTime, f = 440 * Math.pow(2, (midi - 69) / 12);
    const out = ctx.createGain(), tone = ctx.createBiquadFilter();
    tone.type = 'lowpass'; tone.Q.value = 0.4;
    tone.frequency.setValueAtTime(Math.min(16000, f * (6 + velocity * 10)), t);
    tone.frequency.setTargetAtTime(Math.min(9000, f * 2.6), t + 0.01, 0.35);       // the hammer's brightness fades
    const decay = Math.max(0.6, 3.4 - (midi - 36) * 0.045);                      // low notes ring longer
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(0.3 * velocity, t + 0.005);
    out.gain.setTargetAtTime(0.18 * velocity, t + 0.005, 0.09);                     // quick initial drop
    out.gain.setTargetAtTime(0.0001, t + 0.12, decay / 3.2);                         // then the long ring
    const oscs = PARTIALS.map(([h, a], k) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = k === 0 ? 'triangle' : 'sine';
      o.frequency.value = f * h * (1 + 0.0004 * h * h);                               // slight stretch, like real strings
      o.detune.value = (k % 2 ? 1 : -1) * 1.5;
      g.gain.value = a * (k ? 0.5 + velocity * 0.5 : 1);
      o.connect(g).connect(tone); o.start(t); o.stop(t + decay * 2 + 0.2);
      return o;
    });
    tone.connect(out).connect(pianoBus);
    voices.set(midi, { out, oscs });
  }
  function noteOff(midi, release = 0.35) {
    const v = voices.get(midi); if (!v || !ctx) return;
    voices.delete(midi);
    const t = ctx.currentTime;
    if (v.out.gain.cancelAndHoldAtTime) v.out.gain.cancelAndHoldAtTime(t); else v.out.gain.cancelScheduledValues(t);
    v.out.gain.setTargetAtTime(0.0001, t, release / 3);
    for (const o of v.oscs) { try { o.stop(t + release * 2); } catch {} }
  }
  function chord(midis, ms = 1400) {
    midis.forEach((m, i) => setTimeout(() => noteOn(m, 0.62), i * 18)); // a gentle, human roll
    setTimeout(() => midis.forEach(m => noteOff(m, 0.6)), ms);
  }

  /* ---------- levels for the lights ---------- */
  const bins = new Uint8Array(128), lv = { on: 0, bass: 0, mid: 0, high: 0, level: 0 };
  const band = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += bins[i]; return s / ((b - a) * 255); };
  function levels() {
    const active = !!ctx && ctx.state === 'running' && (state().playing || voices.size > 0);
    if (!active) { lv.on = 0; lv.bass = lv.mid = lv.high = lv.level = 0; return lv; }
    analyser.getByteFrequencyData(bins);
    lv.on = 1; lv.bass = band(1, 6); lv.mid = band(6, 28); lv.high = band(28, 90); lv.level = band(1, 90);
    return lv;
  }

  return {
    tracks: TRACKS, play, noteOn, noteOff, chord, levels, bins,
    toggle() { if (index < 0) return play(0); if (audio.paused) { ensure(); return audio.play(); } audio.pause(); return Promise.resolve(); },
    next() { return play(index + 1); }, prev() { return play(index - 1); },
    seek(fraction) { if (audio.duration) audio.currentTime = fraction * audio.duration; },
    stop() { audio.pause(); },
    // keep to these tracks (indexes into TRACKS), one after another; null = the whole soundtrack again
    playlist(list) { only = list; },
    // when the current track ends, do this instead of playing the next one (null = back to normal)
    after(fn) { afterThis = fn; },
    // overall music level (0.85 normally); a music bed under talk sits lower
    level(v) { musicLevel = v; if (ctx) { musicGain.gain.cancelScheduledValues(ctx.currentTime); musicGain.gain.setTargetAtTime(v, ctx.currentTime, 0.2); } },
    get state() { return state(); },
    onChange(f) { listeners.add(f); return () => listeners.delete(f); },
  };
}
