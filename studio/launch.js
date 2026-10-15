// The DISTANCE // ZERO launcher behind the one icon (DISTANCE ZERO.app):
//   1. opens OBS if it is not running (plain start: never streaming, recording or the virtual camera)
//   2. uses the studio if it already runs, otherwise starts it in the background (start.js, with Georgie's link)
//   3. opens the Director Studio in the browser, signed in
//   4. waits for the connections and prints READY, or what is wrong and the next step
// Clicking again never starts a second OBS or a second studio. Output: first line READY or CHECK, then the details.
import fs from 'node:fs';
import path from 'node:path';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './server.js';
import { createStore } from './lib/store.js';
import { loadSecrets } from './lib/auth.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
const dataDir = env.STUDIO_DATA_DIR || path.join(ROOT, 'data');
const config = loadConfig();
if (env.STUDIO_DIRECTOR_PORT) config.director.port = Number(env.STUDIO_DIRECTOR_PORT);
const base = `http://127.0.0.1:${config.director.port}`;
const secrets = loadSecrets(createStore(dataDir));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = async (p, headers = {}) => { try { const r = await fetch(base + p, { headers, signal: AbortSignal.timeout(2000) }); return r.ok ? r : null; } catch { return null; } };
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const notes = [], problems = [];

/* 1 — OBS */
const obsRunning = () => { try { execFileSync('pgrep', ['-x', 'OBS'], { stdio: 'ignore' }); return true; } catch { return false; } };
let obsStarted = false;
if (env.STUDIO_NO_OBS) notes.push('OBS: not opened (test run)');
else if (obsRunning()) notes.push('OBS: already open, used as it is');
else {
  try { execFileSync('open', ['-a', 'OBS'], { stdio: 'ignore' }); obsStarted = true; notes.push('OBS: opened'); }
  catch { problems.push('OBS is not installed in Applications → install OBS Studio, then click the icon again.'); }
}

/* 2 — the studio: reused when it answers; started once otherwise (a lock stops two quick clicks from starting two) */
let started = false;
if (await get('/healthz')) notes.push('Studio: already running, used as it is');
else {
  const lock = path.join(dataDir, 'launcher.lock');
  let mine = false;
  try { fs.writeFileSync(lock, String(process.pid), { flag: 'wx' }); mine = true; }
  catch { const st = fs.statSync(lock, { throwIfNoEntry: false }); if (st && Date.now() - st.mtimeMs > 30000) { fs.writeFileSync(lock, String(process.pid)); mine = true; } }
  if (mine) {
    const out = fs.openSync(path.join(dataDir, 'launcher.log'), 'a');
    const child = spawn(process.execPath, [path.join(ROOT, 'start.js'), '--no-open', ...(env.STUDIO_NO_TUNNEL ? ['--no-tunnel'] : [])],
      { cwd: ROOT, detached: true, stdio: ['ignore', out, out], env });
    child.unref(); started = true;
  }
  for (let i = 0; i < 240 && !(await get('/healthz')); i++) await sleep(250);   // up to 60 s: the first start measures every media file
  if (mine) fs.rmSync(lock, { force: true });
  if (await get('/healthz')) notes.push(started ? 'Studio: started' : 'Studio: started by the other click');
  else problems.push(`The studio did not start → open the studio folder and double-click "Start DISTANCE ZERO Studio" to see the reason (log: data/launcher.log).`);
}

/* 3 — Director Studio, signed in (the code stays after '#': never sent to a server) */
const studioUp = !!(await get('/healthz'));
if (studioUp && !env.STUDIO_NO_BROWSER) execFile('open', [`${base}/login#code=${secrets.directorCode}`], () => {});

/* 4 — connections */
if (studioUp) {
  let o = null;
  for (let i = 0; i < (obsStarted ? 120 : 40); i++) {      // a freshly opened OBS needs a few seconds for its WebSocket
    const r = await get('/launcher/status', { 'x-dz-code': secrets.directorCode });
    o = r ? (await r.json()).obs : null;
    if (o?.connected || o?.status === 'auth-failed') break;
    await sleep(250);
  }
  if (env.STUDIO_NO_OBS) {}
  else if (o?.connected) {
    notes.push(`OBS: connected${o.collection ? ` (${o.collection})` : ''}`);
    if (o.streaming) problems.push('OBS is already STREAMING (started before, not by the launcher) → check it is meant to be live.');
    if (o.recording) problems.push('OBS is already RECORDING (started before, not by the launcher) → stop it in OBS if it is not wanted.');
  }
  else if (o?.status === 'auth-failed' || o?.status === 'auth-required') problems.push('OBS refuses the studio\'s password → in OBS: Tools → WebSocket Server Settings: the password must match studio/.env.local.');
  else problems.push('OBS does not answer the studio → in OBS: Tools → WebSocket Server Settings → tick "Enable WebSocket server", port 4455. The studio connects by itself.');

  // Georgie's link: written by the studio's starter (Tailscale: the same link every show)
  let t = null;
  for (let i = 0; i < (started ? 40 : 1); i++) {
    try { t = JSON.parse(fs.readFileSync(path.join(dataDir, 'tunnel.json'), 'utf8')); } catch { t = null; }
    if (t?.url && alive(t.pid)) break; t = null; await sleep(250);
  }
  if (env.STUDIO_NO_TUNNEL) {}
  else if (t) notes.push(`Georgie's link: ready${t.stable ? ' (her permanent link)' : ' (NEW link: copy it in Rehearsal → Copy Georgie\'s link)'}`);
  else problems.push('Georgie\'s link is not running → open the Tailscale app and sign in, then click the icon again.');
}

console.log(problems.length ? 'CHECK' : 'READY');
console.log((problems.length ? problems.map(p => '• ' + p).join('\n') + '\n\n' : '') + notes.join('\n'));
console.log('\nNothing was streamed, recorded or switched.');
process.exit(0);
