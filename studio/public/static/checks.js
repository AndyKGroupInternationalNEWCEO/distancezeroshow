// Device checks that really test something, shared by both dashboards. Nothing is recorded or sent:
// only "worked / did not work" plus the device name goes to the studio.

/* opens camera + microphone, waits for a voice on the mic (up to `ms`), then closes everything again */
export async function testDevices({ ms = 7000, onLevel = () => {} } = {}) {
  const out = { camera: { ok: false, detail: '' }, mic: { ok: false, detail: '' } };
  if (!navigator.mediaDevices?.getUserMedia) {
    out.camera.detail = out.mic.detail = 'Browser cannot use devices here (needs Chrome/Safari over https)';
    return out;
  }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }); }
  catch (e) {
    // try each device on its own so one blocked device does not hide the other
    const one = async c => { try { const s = await navigator.mediaDevices.getUserMedia(c); return s; } catch (err) { return err; } };
    const v = await one({ video: true }), a = await one({ audio: true });
    if (v instanceof MediaStream) { out.camera = { ok: true, detail: label(v.getVideoTracks()[0]) }; v.getTracks().forEach(t => t.stop()); }
    else out.camera.detail = why(v);
    if (a instanceof MediaStream) stream = a; else { out.mic.detail = why(a); return out; }
  }
  const vt = stream.getVideoTracks()[0];
  if (vt && vt.readyState === 'live') out.camera = { ok: true, detail: label(vt) };
  const at = stream.getAudioTracks()[0];
  if (at) {
    const ac = new AudioContext(), an = ac.createAnalyser();
    an.fftSize = 1024;
    ac.createMediaStreamSource(stream).connect(an);
    const buf = new Float32Array(an.fftSize);
    let best = -60;
    const end = performance.now() + ms;
    while (performance.now() < end) {
      an.getFloatTimeDomainData(buf);
      let p = 0; for (const x of buf) p = Math.max(p, Math.abs(x));
      const db = p > 0 ? Math.max(-60, 20 * Math.log10(p)) : -60;
      best = Math.max(best, db); onLevel(db);
      if (best > -42) break; // a voice: proven
      await new Promise(r => setTimeout(r, 60));
    }
    ac.close().catch(() => {});
    out.mic = best > -42 ? { ok: true, detail: label(at) } : { ok: false, detail: `${label(at)}: no sound heard (peak ${Math.round(best)} dB). Muted, or the wrong microphone?` };
  }
  stream.getTracks().forEach(t => t.stop());
  return out;
}
const label = t => (t?.label || 'device').replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)$/i, '').slice(0, 60);
const why = e => (e?.name === 'NotAllowedError' ? 'Permission blocked in the browser' : e?.name === 'NotReadableError' ? 'In use by another app' : e?.name === 'NotFoundError' ? 'No device found' : (e?.name || 'Error'));

/* a short, pleasant two-note tone through the normal output (headphones) */
export function playTone() {
  return new Promise(resolve => {
    try {
      const ac = new AudioContext();
      [523.25, 783.99].forEach((f, i) => {
        const t = ac.currentTime + 0.05 + i * 0.45, o = ac.createOscillator(), g = ac.createGain();
        o.frequency.value = f; o.connect(g); g.connect(ac.destination);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
        o.start(t); o.stop(t + 0.42);
      });
      setTimeout(() => { ac.close().catch(() => {}); resolve(true); }, 1100);
    } catch { resolve(false); }
  });
}
