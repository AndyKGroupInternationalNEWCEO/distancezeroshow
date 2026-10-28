// A stand-in for the Vienna Mac's engine (Stage 2a, test data): pushes a made-up studio state to the prototype every
// 3 s, walking through the Saturday segments. It talks to nothing else: no OBS, no MIDI, no studio.
//   node cloud/fake-engine.js [--stop-after 30]    (stops sending after N seconds, so the page shows "Mac offline")
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { engineToken } from './server.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const token = engineToken(path.join(HERE, 'data'));
const url = `http://127.0.0.1:${Number(process.env.PORT) || 4760}/engine/heartbeat`;
const stopAfter = Number(process.argv[process.argv.indexOf('--stop-after') + 1]) || 0;
const SEGS = ['PRE-SHOW', 'OPENING VIDEO — PIANO SESSIONS', 'HOST WELCOME', 'CINEMATIC STUDIO TRANSITION', 'PIANO PERFORMANCE — LIVE STAGE', 'ALBUM INTRODUCTION'];
let i = 0;
const started = Date.now();
const timer = setInterval(async () => {
  if (stopAfter && Date.now() - started > stopAfter * 1000) { clearInterval(timer); console.log('fake engine: stopped (the page should show Mac offline within 10 s)'); return; }
  const state = { show: 'SATURDAY — PIANO SESSIONS (test)', segment: SEGS[i % SEGS.length], segmentIndex: i % SEGS.length, segmentCount: 10,
    obs: true, streaming: false, recording: false, rehearsal: true, guest: '', host: true, midi: ['Minilab3 MIDI (test)'] };
  i++;
  try { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(state) }); if (r.status !== 204) console.log('fake engine:', r.status); }
  catch (e) { console.log('fake engine: prototype not reachable', e.message); }
}, 3000);
