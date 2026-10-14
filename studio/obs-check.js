// Read-only integration check against the real OBS: `npm run obs-check`.
// Uses the studio's own OBS client, but blocks every request that is not a Get… request, so it can never
// switch scenes, stream, record, mute or change settings. Reports scenes, program/preview (with a
// screenshot each, the same as the Live Control monitors), audio sources, mic tagging and live levels.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Obs } from './lib/obs.js';
import { loadConfig } from './server.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
for (const f of ['.env.local', '.env']) { try { process.loadEnvFile(path.join(ROOT, f)); break; } catch {} }
const config = loadConfig();
const LISTEN_MS = Number(process.env.OBS_CHECK_MS) || 8000;

const quiet = { log() {}, warn() {}, error() {} };
const obs = new Obs({ url: process.env.OBS_URL || config.obs.url, password: process.env.OBS_WEBSOCKET_PASSWORD || '', micPattern: config.emergency.micPattern, micInputs: config.emergency.micInputs, log: quiet });
const sent = [];
const request = obs.request.bind(obs);
obs.request = (type, data) => {
  if (!/^Get/.test(type)) return Promise.reject(new Error(`obs-check is read-only: blocked ${type}`));
  sent.push(type);
  return request(type, data);
};

const peak = {};
obs.on('meters', m => { for (const [n, [l, r]] of Object.entries(m)) peak[n] = Math.max(peak[n] ?? -60, l, r); });

const out = [];
const line = (ok, what, detail = '') => out.push(`${ok === true ? 'PASS' : ok === false ? 'FAIL' : 'INFO'}  ${what}${detail ? ' — ' + detail : ''}`);
const done = code => { obs.stop(); console.log(out.join('\n')); console.log(`\n${sent.length} requests sent, all read-only (${[...new Set(sent)].sort().join(', ')})`); process.exit(code); };

const timeout = setTimeout(() => {
  line(false, 'Connect to OBS', obs.state.error || 'no answer within 10 s (is OBS open with its WebSocket server on?)');
  done(1);
}, 10000);

obs.on('link', async up => {
  if (!up) return;
  clearTimeout(timeout);
  const s = obs.state;
  line(true, 'Connect to OBS', `OBS ${s.obsVersion}, obs-websocket ${s.version}`);

  const raw = await obs.request('GetSceneList');
  line(raw.scenes.length === s.scenes.length && raw.scenes.every(x => s.scenes.includes(x.sceneName)), 'All scenes detected', `${s.scenes.length}: ${s.scenes.join(' | ')}`);

  line(!!s.program, 'Program scene', s.program || 'none');
  line('info', 'Studio Mode', s.studioMode ? `on — preview: ${s.preview || 'none'}` : 'off in OBS: no separate preview, TAKE needs Studio Mode (CUT works without it)');
  for (const [label, scene] of [['Program monitor', s.program], ['Preview monitor', s.studioMode ? s.preview : '']]) {
    if (!scene) continue;
    try {
      const shot = await obs.screenshot(scene, 320);
      line(/^data:image\//.test(shot) && shot.length > 200, `${label} image`, `${scene}: ${Math.round(shot.length / 1024)} KB screenshot`);
    } catch (e) { line(false, `${label} image`, `${scene}: ${e.message}`); }
  }
  line('info', 'Transitions', `${s.transitions.map(t => t.name + (t.kind === 'cut_transition' ? ' (cut)' : '')).join(', ')}; selected: ${s.transition} ${s.transitionDuration} ms`);
  line(!!s.transitions.find(t => t.kind === 'cut_transition'), 'Cut transition available for CUT');
  line(!s.stream.active && !s.record.active ? true : 'info', 'Stream / record', `stream ${s.stream.active ? 'ON' : 'off'}, record ${s.record.active ? 'ON' : 'off'}`);

  // levels: listen for a few seconds
  await new Promise(r => setTimeout(r, LISTEN_MS));
  line(s.audio.length > 0, 'Audio sources detected', String(s.audio.length));
  for (const a of s.audio) {
    const p = peak[a.name];
    line('info', `  ${a.mic ? 'MIC ' : '    '} ${a.name}`, `${a.kind}, ${a.muted ? 'MUTED' : 'live'}, fader ${a.volumeDb} dB, peak ${p === undefined ? 'no meter data' : p.toFixed(1) + ' dBFS'}`);
  }
  const mics = s.audio.filter(a => a.mic);
  line(mics.length > 0, 'Microphones tagged for "Mics off"', mics.map(a => a.name).join(', ') || 'none: set them in Technical Control');
  line(Object.keys(peak).length > 0, 'Live level meters arriving', `${Object.keys(peak).length} sources reported levels in ${LISTEN_MS / 1000} s`);
  const heard = mics.filter(a => (peak[a.name] ?? -60) > -50);
  line(heard.length ? true : 'info', 'Mic signal', heard.length ? `heard on ${heard.map(a => a.name).join(', ')}` : 'no mic above -50 dBFS (speak into the mic while the check runs)');
  done(0);
});

obs.start();
