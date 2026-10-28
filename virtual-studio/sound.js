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
  { group: 'Signature', title: 'Three-Note Signature (B)', len: '3:25', file: 'music-three-note-signature-b.mp3' },];
for (const t of TRACKS) { t.src = SITE + t.file; t.set = 'dz'; }

// DJ Andy'K: his releases, streamed from djandykofficial.com (it sends Access-Control-Allow-Origin: *), not copied.
// Played through the same player, so the studio lights follow them too. set = the release's page there.
const ANDYK = 'https://www.djandykofficial.com/audio/';
export const ANDYK_TRACKS = {
  '/this-is-trance-hear-the-call': [['Official', 'this-is-trance-hear-the-call-official'], ['Live Rehearsal Room', 'this-is-trance-hear-the-call-live-rehearsal-room'],
    ['Techno Meets Trance', 'this-is-trance-hear-the-call-techno-meets-trance']],
  '/opus-no-1-vienna': [['I. Prologue', 'opus-no-1-vienna-i-prologue'], ['II. The Awakening', 'opus-no-1-vienna-ii-the-awakening'],
    ['III. The Final Movement', 'opus-no-1-vienna-iii-the-final-movement'], ['IV. Coda', 'opus-no-1-vienna-iv-coda']],
  '/zwischenlandung': [['Official', 'zwischenlandung-official'], ['Progressive Trance', 'zwischenlandung-progressive-trance'],
    ['Melodic Techno & Afro Beats', 'zwischenlandung-melodic-techno-afro-beats'], ['Piano', 'zwischenlandung-piano']],
  '/euphoria-needs-no-story': [['Euphoria (Intro)', 'euphoria-intro'], ['Euphoria Needs No Story', 'euphoria-needs-no-story'], ['Alive in the Afterglow', 'alive-in-the-afterglow'],
    ['Breathe Me Back to Life', 'breathe-me-back-to-life'], ['Even Silence Sounds Like You', 'even-silence-sounds-like-you'], ['I Kept the Storm', 'i-kept-the-storm'],
    ['Invisible North', 'invisible-north'], ['Temporary Immortals', 'temporary-immortals'], ['The Distance Learned to Dance', 'the-distance-learned-to-dance'],
    ['We Were Future Once', 'we-were-future-once'], ['After You Left', 'after-you-left']],
  '/six-trance-ballads': [['A Letter With No Address', 'a-letter-with-no-address'], ['I Arrived as Someone Else', 'i-arrived-as-someone-else'],
    ['If This Finds You', 'if-this-finds-you'], ['If Tomorrow Lets Me In', 'if-tomorrow-lets-me-in'], ['The Past Still Had My Voice', 'the-past-still-had-my-voice'],
    ['Whatever You Believe', 'whatever-you-believe']],
  '/wavelength-traces': [['Best Mistake I Ever Made', 'wt-best-mistake-i-ever-made'], ['Come Closer', 'wt-come-closer'], ['Feed the Crows', 'wt-feed-the-crows'],
    ['I Never Sent It', 'wt-i-never-sent-it'], ['Leave the Story Where It Stopped', 'wt-leave-the-story-where-it-stopped'], ['Never Took It Off', 'wt-never-took-it-off'],
    ['One More Song', 'wt-one-more-song'], ['Same Corner, Tuesday', 'wt-same-corner-tuesday'], ['Slow Down', 'wt-slow-down'], ['Something I Can Keep', 'wt-something-i-can-keep'],
    ['Static Silence', 'wt-static-silence'], ['Stay Right Here', 'wt-stay-right-here'], ['Still Alive', 'wt-still-alive']],
  '/human-stories': [['Intro', 'hs-intro'], ['Human Stories', 'human-stories-house'], ['Letters Never Sent', 'letters-never-sent'], ['Only Rivers Know', 'only-rivers-know'],
    ['Parallel Stories', 'parallel-stories'], ['Running From Yesterday', 'running-from-yesterday'], ['Someone I Used to Be', 'someone-i-used-to-be'],
    ['When Home Is Nowhere', 'when-home-is-nowhere'], ['Human Stories (Piano)', 'human-stories-piano'], ['Letters Never Sent (Piano)', 'letters-never-sent-piano'],
    ['Only Rivers Know (Piano)', 'only-rivers-know-piano'], ['Running From Yesterday (Piano)', 'running-from-yesterday-piano'], ['Outro', 'hs-outro']],
  '/until-the-lights-come-on': [['Until the Lights Come On', 'until-the-lights-come-on']],
};
for (const [set, list] of Object.entries(ANDYK_TRACKS))
  for (const [title, file] of list) TRACKS.push({ group: "DJ Andy'K", title, file: file + '.mp3', src: ANDYK + file + '.mp3', set, andyk: true });

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
    // iPhone and iPad: count as media playback, so the ring/silent switch does not mute the music (Safari 16.4+)
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
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
    for (const k of decks) k.audio.pause();                         // one source at a time: the soundtrack or the booth
    if (!mediaNode) { mediaNode = ctx.createMediaElementSource(audio); mediaNode.connect(musicGain); }
    index = (i + TRACKS.length) % TRACKS.length; failed = '';
    audio.src = TRACKS[index].src;
    musicGain.gain.cancelScheduledValues(ctx.currentTime);
    musicGain.gain.setValueAtTime(0, ctx.currentTime);
    musicGain.gain.linearRampToValueAtTime(musicLevel, ctx.currentTime + 1.2);
    return audio.play().catch(e => { failed = 'Playback was blocked or the track could not load.'; emit(); throw e; });
  }
  // the next track within the playlist, or else within the current track's own set (the show's soundtrack, or one release)
  const step = d => { const list = only || TRACKS.map((t, i) => i).filter(i => TRACKS[i].set === (TRACKS[index] || TRACKS[0]).set);
    const at = list.indexOf(index); return list[((at < 0 ? (d > 0 ? -1 : 0) : at) + d + list.length) % list.length]; };
  audio.addEventListener('ended', () => afterThis ? (h => { afterThis = null; h(); })(afterThis) : play(step(1)).catch(() => {}));
  audio.addEventListener('error', () => { failed = 'This track could not be loaded.'; emit(); });
  for (const ev of ['play', 'pause', 'loadedmetadata', 'durationchange']) audio.addEventListener(ev, emit);
  let lastTick = 0;
  audio.addEventListener('timeupdate', () => { const n = performance.now(); if (n - lastTick > 250) { lastTick = n; emit(); } });

  const state = () => ({ index, playing: !audio.paused && index >= 0, time: audio.currentTime || 0, duration: audio.duration || 0, failed });

  /* ---------- piano ---------- */
  // the recorded grand: Salamander Grand Piano (Alexander Holm, CC BY 3.0, assets/piano-samples), a note every minor
  // third, the others tuned from the nearest one (at most a semitone away), as tambien/Piano (MIT) plays it. Until
  // the recordings have loaded (or if they cannot), the additive voice below plays
  const SAMPLES = new URL('../assets/piano-samples/', import.meta.url), recorded = new Map();
  const NAMES = ['C', 'Ds', 'Fs', 'A'], STEP = [0, 3, 6, 9];
  let loading = null;
  function loadSamples() {
    if (loading) return loading;
    const notes = [21, 108]; for (let o = 1; o <= 7; o++) for (const s of STEP) notes.push(12 * (o + 1) + s);
    const name = m => (m === 21 ? 'A0' : m === 108 ? 'C8' : NAMES[STEP.indexOf(m % 12)] + (Math.floor(m / 12) - 1));
    loading = Promise.all(notes.map(m => fetch(new URL(name(m) + '.mp3', SAMPLES)).then(r => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
      .then(b => new Promise((ok, no) => ctx.decodeAudioData(b, ok, no))).then(buf => recorded.set(m, buf)).catch(() => {})));
    return loading;
  }
  function nearest(midi) {
    for (const d of [0, -1, 1, -2, 2]) if (recorded.has(midi - d)) return [recorded.get(midi - d), d];
    return null;
  }
  function sampled(midi, velocity, rec) {
    const [buf, d] = rec, t = ctx.currentTime, src = ctx.createBufferSource(), out = ctx.createGain(), tone = ctx.createBiquadFilter();
    src.buffer = buf; src.playbackRate.value = Math.pow(2, d / 12);
    // a soft touch is darker and quieter, a hard one brighter (one recorded layer, shaped by the velocity)
    tone.type = 'lowpass'; tone.Q.value = 0.3; tone.frequency.value = 1200 + 17000 * velocity * velocity;
    out.gain.value = 0.12 + 0.62 * Math.pow(velocity, 1.6);
    src.connect(tone).connect(out).connect(pianoBus); src.start(t);
    voices.set(midi, { out, oscs: [src] });
  }
  // additive voice: a few harmonics with a little inharmonicity, a bright hammer that mellows, natural decay
  const voices = new Map();
  const PARTIALS = [[1, 1], [2, 0.42], [3, 0.2], [4, 0.11], [5, 0.06], [6, 0.03]];
  function noteOn(midi, velocity = 0.8) {
    ensure(); loadSamples();
    if (voices.has(midi)) noteOff(midi, 0.03);
    if (voices.size > 40) noteOff(voices.keys().next().value, 0.05); // steal the oldest
    const rec = nearest(midi); if (rec) return sampled(midi, velocity, rec);
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

  /* ---------- the DJ booth: two decks into the mix, a channel fader each and a crossfader (both full in the middle) ---------- */
  const decks = [0, 1].map(() => { const a = new Audio(); a.crossOrigin = 'anonymous'; a.preload = 'none'; return { audio: a, index: -1, node: null, gain: null, vol: 0.85, cue: 0, failed: '' }; });
  let xf = 0.5;
  const side = d => (d === 0 ? Math.cos(xf * Math.PI / 2) : Math.sin(xf * Math.PI / 2)) * Math.SQRT2;   // both at full level in the middle
  const deckGain = d => { const k = decks[d]; if (k.gain) k.gain.gain.setTargetAtTime(k.vol * Math.min(1, side(d)), ctx.currentTime, 0.03); };
  const wire = d => { ensure(); const k = decks[d]; if (k.node) return; k.node = ctx.createMediaElementSource(k.audio); k.gain = ctx.createGain(); k.gain.gain.value = 0; k.node.connect(k.gain).connect(musicGain); deckGain(d); };
  decks.forEach(k => {
    for (const ev of ['play', 'pause', 'loadedmetadata', 'durationchange']) k.audio.addEventListener(ev, emit);
    k.audio.addEventListener('timeupdate', () => { const n = performance.now(); if (n - lastTick > 250) { lastTick = n; emit(); } });
    k.audio.addEventListener('ended', () => { k.audio.currentTime = k.cue; emit(); });   // back to its cue point, like a player at the end of a track
    k.audio.addEventListener('error', () => { k.failed = 'This track could not be loaded.'; emit(); });
  });
  const dj = {
    load(d, i) { const k = decks[d]; k.audio.pause(); k.index = i; k.cue = 0; k.failed = ''; k.audio.src = TRACKS[i].src; emit(); },
    play(d) {
      const k = decks[d]; if (k.index < 0) return Promise.resolve();
      wire(d); audio.pause();                                       // the soundtrack makes way for the booth
      musicGain.gain.cancelScheduledValues(ctx.currentTime); musicGain.gain.setTargetAtTime(musicLevel, ctx.currentTime, 0.05);
      return k.audio.play().catch(e => { k.failed = 'Playback was blocked or the track could not load.'; emit(); throw e; });
    },
    pause(d) { decks[d].audio.pause(); },
    toggle(d) { return decks[d].audio.paused ? dj.play(d) : (dj.pause(d), Promise.resolve()); },
    // CUE as on a club player: while playing, back to the cue point and stop; while stopped, the cue point is set here
    cue(d) { const k = decks[d]; if (!k.audio.paused) { k.audio.pause(); k.audio.currentTime = k.cue; } else k.cue = k.audio.currentTime || 0; emit(); },
    seek(d, f) { const a = decks[d].audio; if (a.duration) a.currentTime = f * a.duration; },
    volume(d, v) { decks[d].vol = v; if (ctx) deckGain(d); emit(); },
    crossfade(v) { xf = v; if (ctx) { deckGain(0); deckGain(1); } emit(); },
    deck(d) { const k = decks[d]; return { index: k.index, playing: !k.audio.paused, time: k.audio.currentTime || 0, duration: k.audio.duration || 0, vol: k.vol, failed: k.failed }; },
    get xf() { return xf; },
    stop() { for (const k of decks) k.audio.pause(); },
  };

  /* ---------- the on-air cue: a deep electronic whoop (300 -> 760 Hz in 0.42 s, with its 2nd and 3rd harmonics, softly
     saturated), one with each flash of the beacons in the last three seconds before air ---------- */
  const WHOOP = { f0: 300, f1: 760, T: 0.42 };
  let shaper = null;
  function beep(level = 0.55) {
    ensure();
    if (!shaper) {
      shaper = ctx.createWaveShaper(); const n = 1024, c = new Float32Array(n);
      for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(1.6 * x); }
      shaper.curve = c; shaper.connect(master);
    }
    const t = ctx.currentTime, { f0, f1, T } = WHOOP, g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level, t + 0.012); g.gain.setValueAtTime(level, t + T - 0.08); g.gain.linearRampToValueAtTime(0, t + T);
    g.connect(shaper);
    for (const [h, a] of [[1, 1], [2, 0.5], [3, 0.28]]) {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.frequency.setValueAtTime(f0 * h, t); o.frequency.linearRampToValueAtTime(f1 * h, t + T);
      og.gain.value = a * 0.45; o.connect(og).connect(g); o.start(t); o.stop(t + T + 0.02);
    }
  }

  /* ---------- levels for the lights ---------- */
  const bins = new Uint8Array(128), lv = { on: 0, bass: 0, mid: 0, high: 0, level: 0 };
  const band = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += bins[i]; return s / ((b - a) * 255); };
  function levels() {
    const active = !!ctx && ctx.state === 'running' && (state().playing || voices.size > 0 || decks.some(k => !k.audio.paused));
    if (!active) { lv.on = 0; lv.bass = lv.mid = lv.high = lv.level = 0; return lv; }
    analyser.getByteFrequencyData(bins);
    lv.on = 1; lv.bass = band(1, 6); lv.mid = band(6, 28); lv.high = band(28, 90); lv.level = band(1, 90);
    return lv;
  }

  return {
    tracks: TRACKS, play, noteOn, noteOff, chord, levels, bins, dj, beep,
    toggle() { if (index < 0) return play(0); if (audio.paused) { ensure(); for (const k of decks) k.audio.pause(); return audio.play(); } audio.pause(); return Promise.resolve(); },
    next() { return play(step(1)); }, prev() { return play(step(-1)); },
    seek(fraction) { if (audio.duration) audio.currentTime = fraction * audio.duration; },
    stop() { audio.pause(); dj.stop(); },
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
