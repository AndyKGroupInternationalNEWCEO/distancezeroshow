// The DJ Room's light following a recording as it plays, for the tracks of the DJ show simulation (spaces.js): the
// page's own <audio> goes through an analyser (Web Audio), and each frame gives what the openings' measured map gives
// (djshow.js music()): low / mid / high energy, the kick, a hit. Levels adapt to each track (a slow running peak).
// Needs the recording served with CORS (djandykofficial.com and this site both are).
// The playing channel's EQ is in the chain too (eq(): trim, hi, mid, low, filter, as the mixer's knobs, 0…1 with 0.5
// flat): a three-band EQ as a DJ mixer's (a knob down to 0 kills its band, up to 1 adds 6 dB), and one filter knob
// (left of centre a low-pass closing, right a high-pass opening). The light then follows what the EQ lets through.
export function liveMusic() {
  let ctx = null, an = null, bins = null, chain = null, vu = null;
  const peak = { low: 0.2, mid: 0.2, high: 0.2 }, wired = new WeakSet();
  let lowAvg = 0, kick = 0, hit = 0, last = 0;
  // the element to follow (call it from the visitor's click: browsers start audio contexts on a gesture only)
  function follow(audio) {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return false; ctx = new C(); an = ctx.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = 0.5; an.connect(ctx.destination); bins = new Uint8Array(an.frequencyBinCount);
      const f = (type, freq, q) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = freq; if (q) b.Q.value = q; return b; };
      chain = { trim: ctx.createGain(), low: f('lowshelf', 120), mid: f('peaking', 1000, 0.7), hi: f('highshelf', 6000), lp: f('lowpass', 20000, 0.9), hp: f('highpass', 10, 0.9) };
      chain.trim.connect(chain.low).connect(chain.mid).connect(chain.hi).connect(chain.lp).connect(chain.hp).connect(an);
      // the meters: left and right after the EQ and the channel's fader (the player's volume), as a mixer's meters
      const split = ctx.createChannelSplitter(2); chain.hp.connect(split);
      vu = [0, 1].map(i => { const a = ctx.createAnalyser(); a.fftSize = 1024; split.connect(a, i); return { a, buf: new Float32Array(a.fftSize), level: 0 }; });
      eq(last_);
    }
    if (ctx.state === 'suspended') ctx.resume();
    if (!wired.has(audio)) { try { ctx.createMediaElementSource(audio).connect(chain.trim); wired.add(audio); } catch { return false; } }
    return true;
  }
  const band = (lo, hi) => { const hz = ctx.sampleRate / 2 / bins.length; let s = 0, n = 0; for (let i = Math.floor(lo / hz); i <= Math.min(bins.length - 1, hi / hz); i++) { s += bins[i]; n++; } return n ? s / n / 255 : 0; };
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
    // the meters: each side's peak in dB, −48 … 0 dB onto 0 … 1, falling back as a mixer's do
    const levels = vu.map(c => { c.a.getFloatTimeDomainData(c.buf); let pk = 0; for (const v of c.buf) pk = Math.max(pk, Math.abs(v));
      const l = pk > 0 ? Math.max(0, 1 + 20 * Math.log10(pk) / 48) : 0; c.level = Math.max(l, c.level - dt * 1.6); return c.level; });
    return { ...out, kick, hit, vu: levels };
  }
  // the overview a player's screen draws: the recording decoded once and its peaks in `n` slices (0 … 1)
  const overviews = new Map();
  function overview(url, n = 1200) {
    if (!ctx) return Promise.resolve(null);
    if (!overviews.has(url)) overviews.set(url, fetch(url).then(r => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
      .then(b => new Promise((ok, no) => ctx.decodeAudioData(b, ok, no))).then(buf => {
        const ch = [...Array(buf.numberOfChannels)].map((_, i) => buf.getChannelData(i)), step = Math.floor(buf.length / n), out = new Array(n).fill(0);
        for (let i = 0; i < n; i++) { let pk = 0; for (const d of ch) for (let j = i * step, e = j + step; j < e; j += 4) { const v = Math.abs(d[j]); if (v > pk) pk = v; } out[i] = pk; }
        const top = Math.max(...out) || 1; return out.map(v => v / top);
      }).catch(() => null));
    return overviews.get(url);
  }
  // the knobs (0…1, 0.5 flat): the bands −26 dB (killed) … +6 dB, trim ×0.5 … ×1.5, the filter's sweep
  let last_ = { trim: 0.5, hi: 0.5, mid: 0.5, low: 0.5, filter: 0.5 };
  function eq(v) {
    last_ = { ...last_, ...v };
    if (!chain) return;
    const db = x => (x < 0.5 ? -26 * (1 - x / 0.5) : 6 * ((x - 0.5) / 0.5)), now = ctx.currentTime, set = (p, val) => p.setTargetAtTime(val, now, 0.03);
    set(chain.low.gain, db(last_.low)); set(chain.mid.gain, db(last_.mid)); set(chain.hi.gain, db(last_.hi));
    set(chain.trim.gain, 0.5 + last_.trim);
    const fl = last_.filter, off = Math.abs(fl - 0.5) < 0.03;
    set(chain.lp.frequency, off || fl > 0.5 ? 20000 : 200 * Math.pow(100, fl / 0.5));          // 200 Hz … 20 kHz
    set(chain.hp.frequency, off || fl < 0.5 ? 10 : 20 * Math.pow(200, (fl - 0.5) / 0.5));      // 20 Hz … 4 kHz
  }
  return { follow, read, eq, overview };
}
