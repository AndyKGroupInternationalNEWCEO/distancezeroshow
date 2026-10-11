// Remote access for Georgie: a free Cloudflare quick tunnel (no account) to the HOST port only.
// The Director Studio port is never tunnelled (and refuses tunnelled requests anyway); OBS stays local.
//
//   npm run tunnel        start the tunnel (keep this terminal open), prints Georgie's private sign-in link
//
// The address changes every time. Send the printed link to Georgie through a private channel only.
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './server.js';
import { createStore } from './lib/store.js';
import { loadSecrets } from './lib/auth.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
const port = Number(process.env.STUDIO_GUEST_PORT) || config.guest.port;
const dataDir = process.env.STUDIO_DATA_DIR || path.join(ROOT, 'data');
if (port === config.director.port) { console.error('Refusing: that is the Director Studio port. Only the host port may be tunnelled.'); process.exit(1); }

try { execFileSync('cloudflared', ['--version'], { stdio: 'ignore' }); }
catch { console.error('cloudflared is not installed. Install it once with:  brew install cloudflared'); process.exit(1); }

try {
  const r = await fetch(`http://127.0.0.1:${port}/healthz`);
  if (!r.ok) throw new Error();
} catch { console.error(`The studio is not running on port ${port}. Start it first with:  npm start`); process.exit(1); }

const { hostCode } = loadSecrets(createStore(dataDir));
const cf = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`], { stdio: ['ignore', 'pipe', 'pipe'] });
let shown = false;
const scan = buf => {
  const m = String(buf).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (!m || shown) return;
  shown = true;
  console.log(`
  GEORGIE'S PRIVATE LINK (send by Signal or iMessage, never in public):

    ${m[0]}/login#code=${hostCode}

  Only the Host Dashboard is reachable through it. Keep this terminal open during the show.
  Ctrl+C closes the tunnel. Next start gives a new address. To lock everyone out: npm run rotate-codes
`);
};
cf.stdout.on('data', scan);
cf.stderr.on('data', buf => { scan(buf); if (process.env.TUNNEL_VERBOSE) process.stderr.write(buf); });
cf.on('exit', code => { console.log(`Tunnel closed${code ? ' (cloudflared exit ' + code + ')' : ''}.`); process.exit(code || 0); });
setTimeout(() => { if (!shown) console.error('No tunnel address after 30 s. Check the internet connection, or run with TUNNEL_VERBOSE=1.'); }, 30000);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => cf.kill('SIGTERM'));
