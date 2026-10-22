// The DJ Room's light following a recording as it plays, for the tracks of the DJ show simulation (spaces.js): the
// page's own <audio> goes through an analyser (Web Audio), and each frame gives what the openings' measured map gives
// (djshow.js music()): low / mid / high energy, the kick, a hit. Levels adapt to each track (a slow running peak).
// Needs the recording served with CORS (djandykofficial.com and this site both are).
export function liveMusic() {
  let ctx = null, an = null, bins = null;
  const peak = { low: 0.2, mid: 0.2, high: 0.2 }, wired = new WeakSet();
  let lowAvg = 0, kick = 0, hit = 0, last = 0;
  // the element to follow (call it from the visitor's click: browsers start audio contexts on a gesture only)
  function follow(audio) {
    if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return false; ctx = new C(); an = ctx.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = 0.5; an.connect(ctx.destination); bins = new Uint8Array(an.frequencyBinCount); }
    if (ctx.state === 'suspended') ctx.resume();
    if (!wired.has(audio)) { try { ctx.createMediaElementSource(audio).connect(an); wired.add(audio); } catch { return false; } }
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
    return { ...out, kick, hit };
  }
  return { follow, read };
}
