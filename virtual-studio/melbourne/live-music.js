// The DJ Room's mixer, in Web Audio: the players' <audio> elements (spaces.js) each go into a channel of a
// four-channel mixer, as the console's mixer is laid out:
//   channel: TRIM → LOW / MID / HIGH (a DJ mixer's three-band EQ: a knob down to 0 kills its band, up to 1 adds 6 dB)
//            → FILTER (left of centre a low-pass closing, right a high-pass opening) → channel meter (pre-fader)
//            → channel FADER → CROSSFADER side (channels 1–2 on A, 3–4 on B) → MASTER
//   CUE:     each channel's CUE button sends it (pre-fader) to the PHONES bus, PHONES mixes cue and master
//   MASTER → the page's output, and the BOOTH send; PHONES and BOOTH can go to other audio outputs (setSinkId:
//            Chrome and Edge; Safari has no output choice, there they are not available)
//   MIC:     the microphone (asked for on TALK), echo cancellation on, a low cut, into the master only (never the
//            phones), and the music ducked under it while it is open (talk-over)
// The light follows the master as it plays: each frame gives what the openings' measured map gives (djshow.js
// music()): low / mid / high energy, the kick, a hit, plus the real meters (each channel, master left / right).
// Needs the recordings served with CORS (djandykofficial.com and this site both are).
export function liveMusic() {
  let ctx = null, an = null, bins = null, master = null, duck = null, vu = null, phones = null, booth = null, mic = null;
  const ch = [], wired = new Map();   // the channels; element → its source node
  const peak = { low: 0.2, mid: 0.2, high: 0.2 };
  let lowAvg = 0, kick = 0, hit = 0, last = 0;
  const mixState = { ch: [0, 1, 2, 3].map(() => ({ trim: 0.5, hi: 0.5, mid: 0.5, low: 0.5, filter: 0.5, fader: 0.85, cue: false })), xfader: 0.5, master: 0.8, booth: 0.6, phones: 0.6, cueMix: 0.5 };
  // ch 1 (the second strip) stays open as before for the show's single player until a mix is set
  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return false;
    ctx = new C();
    const f = (type, freq, q) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = freq; if (q) b.Q.value = q; return b; };
    const meter = () => { const a = ctx.createAnalyser(); a.fftSize = 1024; return { a, buf: new Float32Array(a.fftSize), level: 0 }; };
    master = ctx.createGain(); duck = ctx.createGain();
    an = ctx.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = 0.5; bins = new Uint8Array(an.frequencyBinCount);
    duck.connect(master).connect(an).connect(ctx.destination);
    const split = ctx.createChannelSplitter(2); master.connect(split);
    vu = [0, 1].map(i => { const m = meter(); split.connect(m.a, i); return m; });
    // PHONES: the cue bus and a share of the master; BOOTH: the master's send. Each to its own output when chosen
    const out = () => { const g = ctx.createGain(), dest = ctx.createMediaStreamDestination(), el = new Audio(); g.connect(dest); el.srcObject = dest.stream; return { g, el, id: '' }; };
    phones = out(); phones.cue = ctx.createGain(); phones.mst = ctx.createGain(); phones.cue.connect(phones.g); phones.mst.connect(phones.g); master.connect(phones.mst);
    booth = out(); master.connect(booth.g);
    for (let i = 0; i < 4; i++) {
      const c = { trim: ctx.createGain(), low: f('lowshelf', 120), mid: f('peaking', 1000, 0.7), hi: f('highshelf', 6000), lp: f('lowpass', 20000, 0.9), hp: f('highpass', 10, 0.9), fader: ctx.createGain(), xf: ctx.createGain(), cue: ctx.createGain(), meter: meter() };
      c.trim.connect(c.low).connect(c.mid).connect(c.hi).connect(c.lp).connect(c.hp);
      c.hp.connect(c.meter.a); c.hp.connect(c.cue).connect(phones.cue); c.hp.connect(c.fader).connect(c.xf).connect(duck);
      ch.push(c);
    }
    apply();
    return true;
  }
  // an element into a channel (wired once; moved between channels by reconnecting its source)
  function route(audio, i = 1) {
    if (!ensure()) return false;
    let src = wired.get(audio);
    if (!src) { try { src = ctx.createMediaElementSource(audio); wired.set(audio, src); } catch { return false; } }
    if (src.ch === i) return true;
    try { src.disconnect(); } catch {}
    src.connect(ch[i].trim); src.ch = i; return true;
  }
  // (as before: the element to follow, on the second strip, the one the show's player has always used)
  const follow = audio => route(audio, wired.get(audio)?.ch ?? 1);

  /* ----- the mixer's knobs and faders (0…1; EQ and filter 0.5 flat) ----- */
  const db = x => (x < 0.5 ? -26 * (1 - x / 0.5) : 6 * ((x - 0.5) / 0.5));
  function apply() {
    if (!ctx) return;
    const now = ctx.currentTime, set = (p, val) => p.setTargetAtTime(val, now, 0.03), m = mixState;
    m.ch.forEach((v, i) => {
      const c = ch[i];
      set(c.low.gain, db(v.low)); set(c.mid.gain, db(v.mid)); set(c.hi.gain, db(v.hi)); set(c.trim.gain, 0.5 + v.trim);
      const fl = v.filter, off = Math.abs(fl - 0.5) < 0.03;
      set(c.lp.frequency, off || fl > 0.5 ? 20000 : 200 * Math.pow(100, fl / 0.5));          // 200 Hz … 20 kHz
      set(c.hp.frequency, off || fl < 0.5 ? 10 : 20 * Math.pow(200, (fl - 0.5) / 0.5));      // 20 Hz … 4 kHz
      set(c.fader.gain, v.fader * v.fader);                                                     // a fader's curve: quiet at the bottom
      const side = i < 2 ? 1 - m.xfader : m.xfader;
      set(c.xf.gain, Math.min(1, side * 2));                                                    // the crossfader: full until past the middle
      set(c.cue.gain, v.cue ? 1 : 0);
    });
    set(master.gain, m.master * 1.25);
    set(booth.g.gain, m.booth * 1.25);
    set(phones.g.gain, m.phones * 1.25); set(phones.cue.gain, 1 - m.cueMix); set(phones.mst.gain, m.cueMix);
  }
  function mix(d = {}) {
    (d.ch || []).forEach((v, i) => { if (v && mixState.ch[i]) Object.assign(mixState.ch[i], v); });
    for (const k of ['xfader', 'master', 'booth', 'phones', 'cueMix']) if (k in d) mixState[k] = d[k];
    apply();
  }
  // (as before: the playing channel's knobs)
  const eq = (v, i = 1) => mix({ ch: Object.assign([], { [i]: v }) });

  /* ----- PHONES / BOOTH to another audio output (setSinkId) ----- */
  const outputsSupported = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
  async function outputs() {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    return (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audiooutput').map(d => ({ id: d.deviceId, label: d.label || 'Output ' + d.deviceId.slice(0, 6) }));
  }
  async function setOutput(which, id) {
    if (!outputsSupported || !ensure()) return false;
    const o = which === 'booth' ? booth : phones;
    o.id = id || '';
    if (!id) { o.el.pause(); return true; }
    await o.el.setSinkId(id); await o.el.play(); return true;
  }

  /* ----- MIC (TALK): asked for on the first press; off again on the next ----- */
  async function setMic(on) {
    if (!ensure()) return false;
    if (!on) { if (mic) { mic.stream.getTracks().forEach(t => t.stop()); mic.src.disconnect(); mic = null; } duck.gain.setTargetAtTime(1, ctx.currentTime, 0.15); return false; }
    if (mic) return true;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const src = ctx.createMediaStreamSource(stream), cut = ctx.createBiquadFilter(), g = ctx.createGain();
    cut.type = 'highpass'; cut.frequency.value = 100; g.gain.value = 1.2;
    src.connect(cut).connect(g).connect(master);           // the master only: never the phones (no howl in the DJ's ears)
    duck.gain.setTargetAtTime(0.35, ctx.currentTime, 0.15); // talk-over: the music down under the voice
    mic = { stream, src }; return true;
  }

  /* ----- what plays: the light's bands and the meters ----- */
  const band = (lo, hi) => { const hz = ctx.sampleRate / 2 / bins.length; let s = 0, n = 0; for (let i = Math.floor(lo / hz); i <= Math.min(bins.length - 1, hi / hz); i++) { s += bins[i]; n++; } return n ? s / n / 255 : 0; };
  // a meter's peak in dB, −48 … 0 dB onto 0 … 1, falling back as a mixer's do
  const level = (c, dt) => { c.a.getFloatTimeDomainData(c.buf); let pk = 0; for (const v of c.buf) pk = Math.max(pk, Math.abs(v));
    const l = pk > 0 ? Math.max(0, 1 + 20 * Math.log10(pk) / 48) : 0; c.level = Math.max(l, c.level - dt * 1.6); return c.level; };
  function read(dt) {
    if (!an) return null;
    an.getByteFrequencyData(bins);
    const raw = { low: band(30, 150), mid: band(150, 2000), high: band(2000, 10000) }, out = {};
    for (const k in raw) { peak[k] = Math.max(raw[k], peak[k] * Math.exp(-dt / 8)); out[k] = Math.min(1, raw[k] / (peak[k] + 1e-6)); }
    // the kick: the low band jumping above its own recent average
    const jump = raw.low - lowAvg; lowAvg += (raw.low - lowAvg) * Math.min(1, dt * 6);
    kick = Math.max(kick * Math.exp(-dt * 9), Math.min(1, Math.max(0, jump) * 9));
    const now = performance.now() / 1000;
    if (jump > 0.12 && now - last > 0.4) { hit = 1; last = now; } else hit = Math.max(0, hit - dt * 4);
    return { ...out, kick, hit, vu: vu.map(c => level(c, dt)), chv: ch.map(c => level(c.meter, dt)) };
  }

  // the overview a player's screen draws: the recording decoded once and its peaks in `n` slices (0 … 1)
  const overviews = new Map();
  function overview(url, n = 1200) {
    if (!ctx) return Promise.resolve(null);
    if (!overviews.has(url)) overviews.set(url, fetch(url).then(r => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
      .then(b => new Promise((ok, no) => ctx.decodeAudioData(b, ok, no))).then(buf => {
        const chs = [...Array(buf.numberOfChannels)].map((_, i) => buf.getChannelData(i)), step = Math.floor(buf.length / n), o = new Array(n).fill(0);
        for (let i = 0; i < n; i++) { let pk = 0; for (const d of chs) for (let j = i * step, e = j + step; j < e; j += 4) { const v = Math.abs(d[j]); if (v > pk) pk = v; } o[i] = pk; }
        const top = Math.max(...o) || 1; return o.map(v => v / top);
      }).catch(() => null));
    return overviews.get(url);
  }
  return { follow, route, read, eq, mix, overview, outputs, setOutput, setMic, outputsSupported, get micOn() { return !!mic; }, get output() { return { phones: phones?.id || '', booth: booth?.id || '' }; } };
}
