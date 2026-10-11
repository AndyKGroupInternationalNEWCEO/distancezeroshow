// Georgie's public link on its own (when the studio already runs via "npm start").
// Most days, use "npm run studio" instead: it starts the studio and this link together.
//
//   npm run tunnel        keep this terminal open; prints Georgie's private sign-in link, restarts the link if it drops
//
// Only the Host Dashboard port is ever tunnelled. The Director Studio and OBS stay on this Mac.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './server.js';
import { createStore } from './lib/store.js';
import { loadSecrets } from './lib/auth.js';
import { startTunnel, hasCloudflared } from './lib/tunnel.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
const port = Number(process.env.STUDIO_GUEST_PORT) || config.guest.port;
const dataDir = process.env.STUDIO_DATA_DIR || path.join(ROOT, 'data');
if (port === config.director.port) { console.error('Refusing: that is the Director Studio port. Only the host port may be tunnelled.'); process.exit(1); }
if (!hasCloudflared()) { console.error('cloudflared is not installed. Install it once with:  brew install cloudflared'); process.exit(1); }

try {
  const r = await fetch(`http://127.0.0.1:${port}/healthz`);
  if (!r.ok) throw new Error();
} catch { console.error(`The studio is not running on port ${port}. Start it first with:  npm start   (or use npm run studio for both)`); process.exit(1); }

const { hostCode } = loadSecrets(createStore(dataDir));
let shown = false;
const t = startTunnel({
  port, dataDir, verbose: !!process.env.TUNNEL_VERBOSE,
  onUrl(url, restarts) {
    shown = true;
    console.log(`
  ${restarts ? 'NEW LINK FOR GEORGIE (the old one no longer works)' : 'GEORGIE\'S PRIVATE LINK'} (send by Signal or iMessage, never in public):

    ${url}/login#code=${hostCode}

  Only the Host Dashboard is reachable through it. Keep this terminal open during the show.
  Ctrl+C closes the link. To lock everyone out: npm run rotate-codes
`);
  },
  onDown: msg => console.log('  ! ' + msg),
});
setTimeout(() => { if (!shown) console.error('No public address after 30 s. Check the internet connection, or run with TUNNEL_VERBOSE=1.'); }, 30000);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { t.stop(); console.log('Link closed.'); process.exit(0); });
