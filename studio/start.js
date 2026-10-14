// One-step start for show and rehearsal days:  npm run studio   (or double-click "Start DISTANCE ZERO Studio.command")
//   1. starts the studio server (Director Studio on this Mac, Host Dashboard port for Georgie)
//   2. starts Georgie's public link (Cloudflare quick tunnel to the HOST port only) and restarts it if it drops
//   3. opens the Director Studio in your browser, signed in
//   4. puts Georgie's private link on the clipboard, ready to paste into Signal or iMessage
// It never starts OBS streaming or recording and never switches scenes. Ctrl+C stops the studio and the link.
//   --no-tunnel   local only (no link for Melbourne)      --no-open   don't open the browser
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startStudio, loadConfig } from './server.js';
import { startTunnel, hasCloudflared, tailscaleCli, tailscaleState, startFunnel } from './lib/tunnel.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
for (const f of ['.env.local', '.env']) { try { process.loadEnvFile(path.join(ROOT, f)); break; } catch {} }
const args = new Set(process.argv.slice(2));
const A = '\x1b[38;5;215m', I = '\x1b[38;5;153m', G = '\x1b[32m', R = '\x1b[31m', D = '\x1b[2m', B = '\x1b[1m', X = '\x1b[0m';
const line = (n, label, text) => console.log(`  ${D}${n}${X}  ${B}${label.padEnd(10)}${X} ${text}`);
const quiet = { log() {}, warn: (...a) => { if (process.env.STUDIO_VERBOSE) console.warn(...a); } };

// overrides for rehearsing the launcher itself (automated tests): other ports, data folder, OBS address, no clipboard
const env = process.env;
const config = loadConfig();
if (env.STUDIO_DIRECTOR_PORT) config.director.port = Number(env.STUDIO_DIRECTOR_PORT);
if (env.STUDIO_GUEST_PORT) config.guest.port = Number(env.STUDIO_GUEST_PORT);
if (env.STUDIO_OBS_URL) config.obs.url = env.STUDIO_OBS_URL;
const dataDir = env.STUDIO_DATA_DIR || path.join(ROOT, 'data');

function copy(text) {
  if (env.STUDIO_NO_CLIPBOARD) return Promise.resolve(false);
  return new Promise(resolve => {
    const p = spawn('pbcopy');
    p.on('error', () => resolve(false));
    p.on('close', code => resolve(code === 0));
    p.stdin.end(text);
  });
}

console.log(`\n  ${B}D//0${X}  ${A}DISTANCE${X} // ${I}ZERO${X}  ${D}studio${X}\n  ${D}────────────────────────────────────────────────────────────${X}`);

let app;
try {
  app = await startStudio({ config, dataDir, log: quiet });
} catch (e) {
  console.error(`\n  ${R}Could not start:${X} ${e.code === 'EADDRINUSE' ? 'the studio is already running (another Terminal window?). Close it first.' : e.message}\n`);
  process.exit(1);
}
const u = app.urls();
const directorUrl = u.director; // contains the director code after '#': never sent to any server or log

/* 1 — OBS: only connects; reports what it finds */
const obsLine = () => {
  const o = app.obs.state;
  return o.connected ? `${G}connected${X} ${D}(nothing is switched, streamed or recorded by starting the studio)${X}`
    : o.status === 'auth-failed' || o.status === 'auth-required' ? `${R}password problem${X}: ${o.error}`
    : `${A}not running${X}. Open OBS when you need it; the studio connects by itself.`;
};
await new Promise(r => setTimeout(r, 1500));
line(1, 'OBS', obsLine());

/* 2 — Director Studio */
if (!args.has('--no-open')) execFile('open', [directorUrl], () => {});
line(2, 'Director', `${args.has('--no-open') ? 'open' : 'opened in your browser'}: ${D}http://127.0.0.1:${app.director.port}${X}  ${D}(npm run codes shows the sign-in link)${X}`);

/* 3 — Georgie's public link: Tailscale Funnel (stable address) when it is set up, else a Cloudflare quick tunnel */
let tunnel = null;
const announce = stable => async (url, restarts) => {
  const link = `${url}/login#code=${app.secrets.hostCode}`;
  const copied = await copy(link);
  if (restarts && !stable) console.log(`\n  ${A}${B}NEW LINK FOR GEORGIE${X} ${A}(the public link restarted, the old one no longer works)${X}`);
  line(3, 'Georgie', `${G}${stable ? 'her permanent link is ready' : 'public link ready'}${X}${copied ? ` and ${B}copied to your clipboard${X}${stable ? '' : ': paste it into Signal or iMessage for Georgie'}` : ''}.`);
  console.log(`              ${D}${url}/login#code=•••• (private: send only to Georgie${stable ? '; it stays the same for every show' : ''})${X}`);
};
const ts = args.has('--cloudflare') ? '' : tailscaleCli();
const tsState = ts ? tailscaleState(ts) : null;
if (args.has('--no-tunnel')) line(3, 'Georgie', `${D}no public link (--no-tunnel). Local test: http://127.0.0.1:${app.guest.port}${X}`);
else if (ts && tsState.running) {
  line(3, 'Georgie', `${D}starting her permanent link (Tailscale)…${X}`);
  tunnel = startFunnel({
    cli: ts, port: app.guest.port, dataDir, verbose: !!process.env.TUNNEL_VERBOSE,
    onUrl: announce(true),
    onApproval(url) { line(3, 'Georgie', `${A}one-time step:${X} switch on Tailscale Funnel for this Mac in the browser: ${url}`); },
    onDown(msg) { console.log(`  ${R}!${X}  ${msg}`); },
  });
}
else if (!hasCloudflared()) line(3, 'Georgie', `${R}no public link:${X} ${ts ? 'Tailscale is installed but not signed in (open the Tailscale app and sign in).' : 'install Tailscale once (see START-HERE.md).'}`);
else {
  if (ts) line(3, 'Georgie', `${A}Tailscale is installed but not signed in${X} (${tsState.state}): using a temporary Cloudflare link for now.`);
  line(3, 'Georgie', `${D}starting her secure public link…${X}`);
  tunnel = startTunnel({
    port: app.guest.port, dataDir, verbose: !!process.env.TUNNEL_VERBOSE,
    onUrl: announce(false),
    onDown(msg) { console.log(`  ${R}!${X}  ${msg}`); },
  });
}

console.log(`\n  ${D}Keep this window open. Ctrl+C stops the studio${tunnel ? ' and Georgie\'s link' : ''}. OBS keeps running.${X}\n`);

let quitting = false;
async function quit() {
  if (quitting) return;
  quitting = true;
  console.log(`\n  ${D}Stopping…${X}`);
  tunnel?.stop();
  await app.close();
  console.log('  Studio stopped. OBS was not changed.\n');
  process.exit(0);
}
process.on('SIGINT', quit);
process.on('SIGTERM', quit);
