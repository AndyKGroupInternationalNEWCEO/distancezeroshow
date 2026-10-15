// The arrival's sound, made here (no library sounds): the night street (distant city, a fine drizzle), the footsteps
// exactly where the feet land (out/arrival-steps.json, written by render.mjs), the glass doors sliding apart, then
// the lounge's quiet room tone and its door, out to silence where the opening starts.
//   node production/empty-opening/arrival-sfx.mjs   ->  out/arrival-sfx.wav (48 kHz stereo, 25 s)
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'out');
const SR = 48000, LEN = 25, OUTSIDE = 11, N = SR * LEN;
const L = new Float32Array(N), R = new Float32Array(N);
let seed = 12345;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
const smooth = u => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const lp = k => { let y = 0; return x => (y += k * (x - y)); };                     // one-pole low-pass
const hp = k => { const f = lp(k); return x => x - f(x); };

// beds: the street (city rumble + drizzle) until the cut, then the lounge's room tone; up from and out to silence
const rumbleL = lp(0.004), rumbleR = lp(0.004), rainL = hp(0.25), rainR = hp(0.25), roomL = lp(0.02), roomR = lp(0.02);
for (let i = 0; i < N; i++) {
  const t = i / SR, out = t < OUTSIDE, fadeIn = smooth(t / 1.4), fadeOut = 1 - smooth((t - (LEN - 2.2)) / 2.0);
  const street = out ? 1 : 0, room = out ? 0 : 1;
  const city = 0.5 * street, drizzle = 0.035 * street * (0.8 + 0.2 * Math.sin(t * 0.7));
  L[i] += (rumbleL(rnd()) * 6 * city + rainL(rnd()) * drizzle + roomL(rnd()) * 0.35 * room * 0.3) * fadeIn * fadeOut;
  R[i] += (rumbleR(rnd()) * 6 * city + rainR(rnd()) * drizzle + roomR(rnd()) * 0.35 * room * 0.3) * fadeIn * fadeOut;
}

// one footstep: heel and toe, each a short burst; on the street hard and a little wet, in the lounge muffled
function step(t0, where, pan, gain) {
  const street = where === 'street', f1 = street ? hp(0.18) : lp(0.08), body = lp(street ? 0.03 : 0.015);
  for (const [dt, g] of [[0, 1], [0.075, 0.55]]) {
    const s0 = Math.round((t0 + dt) * SR), n = Math.round(SR * (street ? 0.06 : 0.09));
    for (let k = 0; k < n && s0 + k < N; k++) {
      const env = Math.exp(-k / (SR * (street ? 0.012 : 0.02))) * Math.min(1, k / 48);
      const x = rnd(), v = (f1(x) * (street ? 0.9 : 0.6) + body(x) * 3.2) * env * g * gain;
      if (s0 + k >= 0) { L[s0 + k] += v * (1 - pan); R[s0 + k] += v * (1 + pan); }
    }
  }
  if (street) {   // the splash of a wet slab under the sole
    const s0 = Math.round((t0 + 0.02) * SR), f = hp(0.4);
    for (let k = 0; k < SR * 0.12 && s0 + k < N; k++) { const v = f(rnd()) * 0.05 * Math.exp(-k / (SR * 0.04)) * gain; L[s0 + k] += v; R[s0 + k] += v; }
  }
}
const steps = JSON.parse(readFileSync(join(OUT, 'arrival-steps.json'), 'utf8'));
for (const [t, where, who] of steps) step(t, where, who === 'andy' ? -0.25 : 0.25, where === 'street' ? 0.55 : 0.75);

// a swell of filtered noise: the glass doors gliding apart, the lounge door swinging
function swell(t0, dur, gain, k) {
  const f = lp(k), g = lp(k);
  for (let i = Math.round(t0 * SR); i < Math.min(N, Math.round((t0 + dur) * SR)); i++) {
    const u = (i / SR - t0) / dur, env = Math.sin(Math.PI * u) ** 2;
    L[i] += f(rnd()) * gain * env; R[i] += g(rnd()) * gain * env;
  }
}
swell(5.4, 1.6, 0.5, 0.05);     // the doors slide open as they come
swell(8.2, 1.4, 0.3, 0.05);     // and close behind the camera
swell(21.4, 1.4, 0.35, 0.03);   // the backstage door swings as the camera reaches it

// 16-bit WAV, peak-normalised to -6 dBFS
let peak = 0; for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const k = 0.5 / peak, buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) { buf.writeInt16LE(Math.round(L[i] * k * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(R[i] * k * 32767), 46 + i * 4); }
writeFileSync(join(OUT, 'arrival-sfx.wav'), buf);
console.log(join(OUT, 'arrival-sfx.wav'), `${steps.length} steps`);
