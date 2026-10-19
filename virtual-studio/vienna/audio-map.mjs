// Measures the Piano Sessions audio and writes what the show is timed by: exact durations, onsets (accents) and
// loud / mid / quiet sections. The show (piano-show.js) builds its camera and lighting script from this map, so the
// script follows the music as recorded, not guessed times.
//   node virtual-studio/vienna/audio-map.mjs            → virtual-studio/vienna/piano-show-map.js
// Run again whenever a master changes. Reads 16-bit PCM WAV (the masters' format).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHOW } from './piano-show-config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const STEP = 0.5;   // seconds per loudness value

function readWav(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error(file + ': not a WAV file');
  let p = 12, fmt = null, data = null;
  while (p + 8 <= b.length) {
    const id = b.toString('ascii', p, p + 4), size = b.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { format: b.readUInt16LE(p + 8), channels: b.readUInt16LE(p + 10), rate: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) };
    if (id === 'data') { data = b.subarray(p + 8, p + 8 + size); break; }
    p += 8 + size + (size & 1);
  }
  if (!fmt || !data || fmt.format !== 1 || fmt.bits !== 16) throw new Error(file + ': expected 16-bit PCM');
  return { ...fmt, data, frames: data.length / (2 * fmt.channels) };
}

// loudness (RMS in dBFS, channels mixed) for every STEP seconds
function loudness(w) {
  const win = Math.round(w.rate * STEP), out = [];
  for (let i = 0; i + win <= w.frames; i += win) {
    let s = 0;
    for (let j = 0; j < win; j++) {
      let v = 0; const k = (i + j) * w.channels * 2;
      for (let c = 0; c < w.channels; c++) v += w.data.readInt16LE(k + c * 2);
      v /= 32768 * w.channels; s += v * v;
    }
    out.push(20 * Math.log10(Math.sqrt(s / win) + 1e-9));
  }
  return out;
}

// an onset: loud enough, and clearly above the average of the 1.5 s before it. `after`: the average loudness of the
// 5 s that follow (how big a moment it opens)
function onsets(db, { rise = 5, floor = -12 } = {}) {
  const back = Math.round(1.5 / STEP), ahead = Math.round(5 / STEP), out = [];
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  for (let i = back; i < db.length; i++) {
    const before = mean(db.slice(i - back, i));
    if (db[i] >= floor && db[i] - before >= rise && (!out.length || i * STEP - out.at(-1).t > 1))
      out.push({ t: +(i * STEP).toFixed(2), after: +mean(db.slice(i, i + ahead)).toFixed(1) });
  }
  return out;
}

// sections: loudness smoothed over 4 s, classed loud (> -10.5 dB), quiet (< -15 dB) or mid; runs under 6 s merge
// into the one before
function sections(db, duration) {
  const half = Math.round(2 / STEP);
  const smooth = db.map((_, i) => { const a = db.slice(Math.max(0, i - half), i + half + 1); return a.reduce((x, y) => x + y, 0) / a.length; });
  const cls = v => (v > -10.5 ? 'loud' : v < -15 ? 'quiet' : 'mid');
  const runs = [];
  smooth.forEach((v, i) => { const c = cls(v); if (runs.length && runs.at(-1).energy === c) runs.at(-1).to = (i + 1) * STEP; else runs.push({ from: i * STEP, to: (i + 1) * STEP, energy: c, sum: 0, n: 0 }); const r = runs.at(-1); r.sum += v; r.n++; });
  const merged = [];
  for (const r of runs) {
    if (merged.length && (r.to - r.from < 6 || merged.at(-1).energy === r.energy)) { const m = merged.at(-1); m.to = r.to; m.sum += r.sum; m.n += r.n; }
    else merged.push({ ...r });
  }
  if (merged.length > 1 && merged[0].to - merged[0].from < 6) { merged[1].from = 0; merged.shift(); }
  merged.at(-1).to = duration;
  return merged.map(r => ({ from: +r.from.toFixed(1), to: +r.to.toFixed(2), energy: r.energy, db: +(r.sum / r.n).toFixed(1) }));
}

// where the recording dies away for good: from here on it stays under -20 dB to the end
function tail(db, duration) {
  let i = db.length - 1;
  while (i > 0 && db[i] < -20) i--;
  return +Math.min(duration, (i + 1) * STEP).toFixed(2);
}

const map = {};
for (const [key, seg] of Object.entries({ opening: SHOW.opening, theme: SHOW.theme, between: SHOW.between, closing: SHOW.closing })) {
  const file = path.join(ROOT, seg.audio), w = readWav(file), db = loudness(w);
  const duration = +(w.frames / w.rate).toFixed(3);
  map[key] = { file: seg.audio, bytes: fs.statSync(file).size, duration, rate: w.rate, channels: w.channels, tail: tail(db, duration), onsets: onsets(db), sections: sections(db, duration) };
  console.log(`${key}: ${duration} s · dies away from ${map[key].tail} s · onsets ${map[key].onsets.map(o => `${o.t} (${o.after} dB)`).join(', ')}`);
  for (const s of map[key].sections) console.log(`   ${String(s.from).padStart(6)}–${String(s.to).padEnd(7)} ${s.energy.padEnd(5)} ${s.db} dB`);
}
fs.writeFileSync(path.join(ROOT, 'virtual-studio', 'vienna', 'piano-show-map.js'),
  `// GENERATED by audio-map.mjs from the Piano Sessions masters (${new Date().toISOString().slice(0, 10)}): do not edit, run it again.\n` +
  `export const AUDIO_MAP = ${JSON.stringify(map, null, 2)};\n`);
console.log('wrote virtual-studio/vienna/piano-show-map.js');
