// DISTANCE // ZERO Studio server. Runs on the Vienna broadcast Mac.
//
//   Director listener  127.0.0.1:4747  Director Studio + OBS overlay. Never tunnel or expose this port.
//   Guest listener     127.0.0.1:4748  Host Dashboard only. This is the one port that may be shared with
//                                      Melbourne through a tunnel (see README). It has no route to OBS control.
//
// Usage: npm start | npm run codes | npm run rotate-codes | npm run rotate-overlay
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createStore } from './lib/store.js';
import { loadSecrets, codeMatches, sameSecret, makeSession, checkSession, cookieHeader, parseCookies, limiter } from './lib/auth.js';
import { Obs, isLoopbackUrl } from './lib/obs.js';
import { createStudio } from './lib/studio.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const SITE_ASSETS = path.join(ROOT, '..', 'assets'); // the website's own font and favicon, read-only

function merge(a, b) {
  for (const [k, v] of Object.entries(b || {})) a[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(a[k] || {}, v) : v;
  return a;
}
export function loadConfig(dir = ROOT) {
  const base = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));
  const local = path.join(dir, 'config.local.json');
  return fs.existsSync(local) ? merge(base, JSON.parse(fs.readFileSync(local, 'utf8'))) : base;
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json' };

export async function startStudio({ config = loadConfig(), dataDir = path.join(ROOT, 'data'), obsPassword = process.env.OBS_WEBSOCKET_PASSWORD || '',
  rotate = false, log = console } = {}) {
  if (!isLoopbackUrl(config.obs.url) && !config.obs.allowRemote) {
    throw new Error(`obs.url ${config.obs.url} is not on this machine. OBS control stays local; set obs.allowRemote only if you know why.`);
  }
  const store = createStore(dataDir);
  const secrets = loadSecrets(store, { rotate });
  const obs = new Obs({ url: config.obs.url, password: obsPassword, micPattern: config.emergency.micPattern, micInputs: config.emergency.micInputs, log });
  const studio = createStudio({ config, store, secrets, obs, sampleRundownPath: path.join(ROOT, 'rundown.sample.json'), log });

  const loginLimit = limiter(10, 10 * 60 * 1000);
  // one sign-in page for both people: the Director code typed on the PUBLIC page does not open the Director Studio
  // there. It creates a one-time ticket (60 s) that only the Director listener on this Mac (127.0.0.1) accepts, so
  // the Director Studio still works on the Vienna Mac only.
  const tickets = new Map();
  const newTicket = () => { const t = crypto.randomBytes(24).toString('base64url'); tickets.set(t, Date.now() + 60000); return t; };
  const useTicket = t => { const exp = tickets.get(t); tickets.delete(t); for (const [k, e] of tickets) if (e < Date.now()) tickets.delete(k); return !!exp && exp >= Date.now(); };
  const director = listener('director', config.director);
  const guest = listener('host', config.guest);
  await Promise.all([director.ready, guest.ready]);
  obs.start();

  function listener(role, { host, port }) {
    const cookie = role === 'director' ? 'dz_director' : 'dz_host';
    const roleCode = role === 'director' ? secrets.directorCode : secrets.hostCode;
    const page = role === 'director' ? 'director.html' : 'host.html';
    const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 }); // call set-up messages can exceed 16 KB

    // the LAST x-forwarded-for entry is the one our own proxy (Tailscale) added; earlier ones can be forged by the visitor,
    // which would let them dodge the sign-in attempt limit
    const clientIp = req => String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',').pop().trim();
    // behind Cloudflare (x-forwarded-proto) or Tailscale Funnel (always https on *.ts.net): cookies are marked Secure
    const viaHttps = req => req.headers['x-forwarded-proto'] === 'https' || /\.ts\.net(:\d+)?$/i.test(String(req.headers.host || ''));
    const authed = req => checkSession(secrets.cookieSecret, parseCookies(req.headers.cookie)[cookie], role);
    const safeHost = req => String(req.headers['x-forwarded-host'] || req.headers.host || '').replace(/[^a-zA-Z0-9.:\-\[\]]/g, '');

    function headers(req, type) {
      const h = safeHost(req);
      return {
        'Content-Type': type,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'X-Frame-Options': 'DENY',
        'Cross-Origin-Opener-Policy': 'same-origin',
        // both sides may use camera, microphone and screen sharing for the private call
        'Permissions-Policy': 'camera=(self), microphone=(self), display-capture=(self), geolocation=()',
        'Content-Security-Policy': `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; media-src 'self' blob: mediastream:; connect-src 'self' ws://${h} wss://${h}; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'`,
      };
    }
    function send(req, res, status, type, body, extra = {}) { res.writeHead(status, { ...headers(req, type), ...extra }); res.end(body); }
    function file(req, res, abs) {
      fs.readFile(abs, (err, buf) => {
        if (err) return send(req, res, 404, 'text/plain; charset=utf-8', 'Not found');
        send(req, res, 200, TYPES[path.extname(abs)] || 'application/octet-stream', buf);
      });
    }
    function within(base, rel) {
      const abs = path.resolve(base, '.' + path.posix.normalize('/' + rel));
      return abs.startsWith(base + path.sep) ? abs : null;
    }

    // anything arriving through a proxy or tunnel carries forwarding headers; the director port must never be reachable that way
    const proxied = req => !!(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.headers['x-forwarded-host'] || req.headers.forwarded);
    const server = http.createServer((req, res) => {
      if (role === 'director' && proxied(req)) return send(req, res, 403, 'text/plain; charset=utf-8', 'The Director Studio only answers on the Vienna Mac itself. Do not tunnel this port; tunnel the host port instead.');
      const url = new URL(req.url, 'http://x');
      const p = url.pathname;
      if (req.method === 'GET' && p === '/healthz') return send(req, res, 200, 'text/plain; charset=utf-8', 'ok');
      if (req.method === 'GET' && p.startsWith('/static/')) {
        const abs = within(path.join(PUBLIC, 'static'), p.slice(8));
        return abs ? file(req, res, abs) : send(req, res, 404, 'text/plain', 'Not found');
      }
      if (req.method === 'GET' && /^\/fonts\/archivo-latin(-ext)?\.woff2$/.test(p)) return file(req, res, path.join(SITE_ASSETS, p));
      if (req.method === 'GET' && p === '/favicon.svg') return file(req, res, path.join(SITE_ASSETS, 'favicon.svg'));
      if (req.method === 'GET' && p === '/login') return file(req, res, path.join(PUBLIC, 'login.html'));
      if (req.method === 'POST' && p === '/login') return login(req, res);
      if (role === 'director' && !proxied(req) && req.method === 'GET' && p === '/handoff') return file(req, res, path.join(PUBLIC, 'handoff.html'));
      if (role === 'director' && !proxied(req) && req.method === 'POST' && p === '/handoff') {
        let body = '';
        req.on('data', c => { body += c; if (body.length > 512) req.destroy(); });
        req.on('end', () => {
          let t = ''; try { t = String(JSON.parse(body).t || ''); } catch {}
          if (!useTicket(t)) return send(req, res, 401, 'application/json', JSON.stringify({ ok: false, error: 'This sign-in link expired. Sign in again.' }));
          log.log('[auth] director signed in on this Mac (from the public sign-in page)');
          send(req, res, 200, 'application/json', JSON.stringify({ ok: true }), { 'Set-Cookie': cookieHeader(cookie, makeSession(secrets.cookieSecret, 'director'), { secure: false }) });
        });
        return;
      }
      if (req.method === 'POST' && p === '/logout') {
        return send(req, res, 303, 'text/plain', '', { Location: '/login', 'Set-Cookie': cookieHeader(cookie, '', { clear: true, secure: viaHttps(req) }) });
      }
      // rehearsal reports: director only, local only, offered as a download
      const rep = role === 'director' && req.method === 'GET' && p.match(/^\/reports\/([0-9a-z-]{8,40})\.(html|json)$/);
      if (rep) {
        if (!authed(req)) return send(req, res, 401, 'text/plain; charset=utf-8', 'Sign in first');
        const r = studio.report(rep[1]);
        if (!r) return send(req, res, 404, 'text/plain; charset=utf-8', 'No such report');
        const name = `DISTANCE-ZERO-rehearsal-${rep[1]}.${rep[2]}`;
        return send(req, res, 200, rep[2] === 'html' ? 'text/html; charset=utf-8' : 'application/json', rep[2] === 'html' ? studio.renderReport(r) : JSON.stringify(r, null, 2),
          { 'Content-Disposition': `attachment; filename="${name}"` });
      }
      if (req.method === 'GET' && p === '/') {
        return authed(req) ? file(req, res, path.join(PUBLIC, page)) : send(req, res, 302, 'text/plain', '', { Location: '/login' });
      }
      // the OBS browser source authenticates its WebSocket with the overlay key, so the page itself is public on this local port
      if (role === 'director' && req.method === 'GET' && p === '/overlay') return file(req, res, path.join(PUBLIC, 'overlay.html'));
      send(req, res, 404, 'text/plain; charset=utf-8', 'Not found');
    });

    function login(req, res) {
      if (!loginLimit(clientIp(req))) return send(req, res, 429, 'application/json', JSON.stringify({ ok: false, error: 'Too many attempts. Wait ten minutes.' }));
      let body = '';
      req.on('data', c => { body += c; if (body.length > 2048) req.destroy(); });
      req.on('end', () => {
        let given = '';
        try { given = JSON.parse(body).code; } catch { given = new URLSearchParams(body).get('code'); }
        if (role === 'host' && codeMatches(given, secrets.directorCode)) {
          log.log(`[auth] director code on the public sign-in page from ${clientIp(req)}: handed over to the Vienna Mac`);
          return send(req, res, 200, 'application/json', JSON.stringify({ ok: true, role: 'director',
            next: `http://127.0.0.1:${config.director.port}/handoff#t=${newTicket()}` }));
        }
        if (!codeMatches(given, roleCode)) {
          log.warn(`[auth] failed ${role} login from ${clientIp(req)}`);
          return send(req, res, 401, 'application/json', JSON.stringify({ ok: false, error: 'That access code is not right.' }));
        }
        log.log(`[auth] ${role} signed in from ${clientIp(req)}`);
        send(req, res, 200, 'application/json', JSON.stringify({ ok: true, role }),
          { 'Set-Cookie': cookieHeader(cookie, makeSession(secrets.cookieSecret, role), { secure: viaHttps(req) }) });
      });
    }

    server.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url, 'http://x');
      const reject = code => { socket.write(`HTTP/1.1 ${code} No\r\nConnection: close\r\n\r\n`); socket.destroy(); };
      if (url.pathname !== '/ws') return reject(404);
      if (role === 'director' && proxied(req)) return reject(403);
      // only pages served by this listener may open its socket (blocks cross-site WebSocket hijacking)
      let originHost = '';
      try { originHost = new URL(req.headers.origin).host; } catch {}
      if (!originHost || (originHost !== req.headers.host && originHost !== req.headers['x-forwarded-host'])) return reject(403);
      let as = null;
      if (authed(req)) as = role;
      else if (role === 'director' && url.searchParams.has('overlay') && sameSecret(url.searchParams.get('overlay'), secrets.overlayKey)) as = 'overlay';
      if (!as) return reject(401);
      wss.handleUpgrade(req, socket, head, ws => {
        const alive = { ok: true };
        ws.on('pong', () => { alive.ok = true; });
        const hb = setInterval(() => { if (!alive.ok) return ws.terminate(); alive.ok = false; ws.ping(); }, 15000);
        ws.on('close', () => clearInterval(hb));
        studio.connect(ws, as, { remote: proxied(req) });
      });
    });

    const ready = new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => { server.off('error', reject); resolve(); });
    });
    return { server, wss, ready, get port() { return server.address().port; }, host };
  }

  const urls = () => ({
    director: `http://${config.director.host}:${director.port}/login#code=${secrets.directorCode}`,
    host: `http://${config.guest.host}:${guest.port}/login#code=${secrets.hostCode}`,
    overlay: `http://${config.director.host}:${director.port}/overlay?key=${secrets.overlayKey}`,
  });

  async function close() {
    obs.stop();
    studio.stop();
    // disconnect everyone first: their goodbyes change state (presence, rehearsal timeline) and must be saved too
    for (const l of [director, guest]) for (const c of l.wss.clients) c.terminate();
    await new Promise(r => setTimeout(r, 50));
    studio.flush();
    for (const l of [director, guest]) await new Promise(r => l.server.close(r));
  }
  return { director, guest, obs, studio, secrets, urls, close };
}

/* ---------- CLI ---------- */

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const f of ['.env.local', '.env']) { try { process.loadEnvFile(path.join(ROOT, f)); break; } catch {} }
  const args = new Set(process.argv.slice(2));
  const config = loadConfig();
  if (args.has('--rotate-overlay')) {
    const s = loadSecrets(createStore(path.join(ROOT, 'data')), { rotateOverlay: true });
    console.log('New OBS overlay key. The Director and Host access codes did NOT change; nobody is signed out.\n');
    console.log('Update the URL of the overlay Browser Source in OBS to (a running studio picks the key up after a restart):');
    console.log(`OBS overlay    http://${config.director.host}:${config.director.port}/overlay?key=${s.overlayKey}\n`);
    process.exit(0);
  }
  if (args.has('--show-codes') || args.has('--rotate-codes')) {
    const s = loadSecrets(createStore(path.join(ROOT, 'data')), { rotate: args.has('--rotate-codes') });
    if (args.has('--rotate-codes')) console.log('New codes created. Everyone signed in before is signed out.\n');
    console.log(`Director code  ${s.directorCode}\nHost code      ${s.hostCode}\n`);
    console.log(`Director login http://${config.director.host}:${config.director.port}/login#code=${s.directorCode}`);
    console.log(`Host login     <host address>/login#code=${s.hostCode}`);
    console.log(`OBS overlay    http://${config.director.host}:${config.director.port}/overlay?key=${s.overlayKey}`);
    process.exit(0);
  }
  try {
    const app = await startStudio({ config });
    const u = app.urls();
    console.log(`
  DISTANCE // ZERO  STUDIO
  ────────────────────────────────────────────────────────────
  Director Studio   ${u.director}
  Host Dashboard    ${u.host}   (local test; share via tunnel, see README)
  OBS overlay       ${u.overlay}
  OBS WebSocket     ${config.obs.url}  ${process.env.OBS_WEBSOCKET_PASSWORD ? '(password set)' : '(no password set)'}
  ────────────────────────────────────────────────────────────
  Codes are private. Send Georgie her link through a private channel (Signal, iMessage), never in public.
`);
    let quitting = false;
    const quit = async () => { if (quitting) return; quitting = true; await app.close(); process.exit(0); };
    process.on('SIGINT', quit); process.on('SIGTERM', quit);
  } catch (e) {
    console.error(e.code === 'EADDRINUSE' ? `Port already in use (${e.address}:${e.port}). Is the studio already running?` : e.message);
    process.exit(1);
  }
}
