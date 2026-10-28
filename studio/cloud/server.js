// Stage 2a local prototype of broadcast.distancezeroshow.com (BROADCAST-WEB.md): sign-in with the Andy / Georgie
// roles, the Show Planner, upcoming shows and the studio's state read only. Test data only: no Supabase, and there
// is no route that sends anything to the studio — the Mac's engine only pushes its state in (POST /engine/heartbeat).
//   node cloud/server.js            → http://127.0.0.1:4760   (prints the test passwords on the first start)
//   node cloud/fake-engine.js       → a stand-in for the Mac's engine, with test data
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAuth } from './lib/auth.js';
import { createEngineLink } from './lib/engine.js';
import { createPlanner } from './lib/planner.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(HERE, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const HEADERS = {
  'Content-Security-Policy': "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

// the engine's token: generated once into data/ (git-ignored); the fake engine (later the Mac's agent) reads it there
export function engineToken(dataDir) {
  const f = path.join(dataDir, 'engine-token');
  try { return fs.readFileSync(f, 'utf8').trim(); }
  catch { const t = crypto.randomBytes(32).toString('base64url'); fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(f, t, { mode: 0o600 }); return t; }
}

export function createCloud({ dataDir = path.join(HERE, 'data'), showsDir = path.join(HERE, '..', 'shows'), now, staleMs } = {}) {
  const auth = createAuth({ dataDir, now });
  const engine = createEngineLink({ token: engineToken(dataDir), now, staleMs });
  const planner = createPlanner({ dataDir, showsDir });

  const send = (res, status, body, extra = {}) => {
    const json = typeof body !== 'string';
    res.writeHead(status, { ...HEADERS, 'Content-Type': json ? 'application/json' : 'text/plain; charset=utf-8', ...extra });
    res.end(json ? JSON.stringify(body) : body);
  };
  const readBody = req => new Promise((resolve, reject) => {
    let size = 0; const parts = [];
    req.on('data', c => { size += c.length; if (size > 64 * 1024) { reject(Object.assign(new Error('Too large'), { status: 413 })); req.destroy(); } else parts.push(c); });
    req.on('end', () => { try { resolve(parts.length ? JSON.parse(Buffer.concat(parts)) : {}); } catch { reject(Object.assign(new Error('Bad JSON'), { status: 400 })); } });
  });
  const cookie = req => /(?:^|;\s*)dz_s=([A-Za-z0-9_-]+)/.exec(req.headers.cookie || '')?.[1] || null;
  // a change must come from this page: the same origin and the page's own header (no cross-site form can send it)
  const sameOrigin = req => req.headers['x-dz'] === '1' && (!req.headers.origin || req.headers.origin === `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`);

  async function api(req, res, p) {
    if (req.method === 'POST' && p === '/engine/heartbeat') {
      const ok = engine.heartbeat(req.headers.authorization, await readBody(req));
      return ok ? send(res, 204, '') : send(res, 401, { error: 'Not the studio engine' });
    }
    if (req.method !== 'GET' && !sameOrigin(req)) return send(res, 403, { error: 'Not from this page' });
    if (req.method === 'POST' && p === '/api/login') {
      const b = await readBody(req);
      const r = auth.login(b.login, b.password, req.socket.remoteAddress);
      if (r.error) return send(res, r.status, { error: r.error });
      const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
      return send(res, 200, { user: r.user }, { 'Set-Cookie': `dz_s=${r.sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure}` });
    }
    const sid = cookie(req), me = auth.session(sid);
    if (!me) return send(res, 401, { error: 'Sign in first' });
    if (req.method === 'POST' && p === '/api/logout') { auth.logout(sid); return send(res, 200, { ok: true }, { 'Set-Cookie': 'dz_s=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' }); }
    if (req.method === 'GET' && p === '/api/me') return send(res, 200, { user: { login: me.login, name: me.name, role: me.role } });
    if (req.method === 'GET' && p === '/api/engine') return send(res, 200, engine.view());
    if (req.method === 'GET' && p === '/api/formats') return send(res, 200, planner.formats());
    if (req.method === 'GET' && p === '/api/plans') return send(res, 200, planner.list());
    // planning: the director only (Georgie reads; more for her only with Andy's approval)
    const m = /^\/api\/plans(?:\/([a-f0-9]{12}))?$/.exec(p);
    if (m && ['POST', 'PATCH', 'DELETE'].includes(req.method)) {
      if (me.role !== 'director') return send(res, 403, { error: 'Only the director plans shows' });
      try {
        if (req.method === 'POST' && !m[1]) return send(res, 201, planner.create(await readBody(req)));
        if (req.method === 'PATCH' && m[1]) return send(res, 200, planner.update(m[1], await readBody(req)));
        if (req.method === 'DELETE' && m[1]) { planner.remove(m[1]); return send(res, 200, { ok: true }); }
      } catch (e) { return send(res, e.status || 400, { error: e.message }); }
    }
    return send(res, 404, { error: 'Not found' });
  }

  const handler = (req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    if (p.startsWith('/api/') || p.startsWith('/engine/')) return api(req, res, p).catch(e => send(res, e.status || 500, { error: e.status ? e.message : 'Server error' }));
    if (req.method !== 'GET') return send(res, 405, 'Method not allowed');
    const f = p === '/' ? 'index.html' : p.slice(1);
    if (!/^[a-z0-9-]+\.(html|js|css)$/.test(f)) return send(res, 404, 'Not found');
    fs.readFile(path.join(PUBLIC, f), (err, data) => err ? send(res, 404, 'Not found') : (res.writeHead(200, { ...HEADERS, 'Content-Type': TYPES[path.extname(f)] }), res.end(data)));
  };
  return { handler, auth, engine, planner };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cloud = createCloud();
  const port = Number(process.env.PORT) || 4760;
  http.createServer(cloud.handler).listen(port, '127.0.0.1', () => {
    console.log(`DISTANCE // ZERO Broadcast web — Stage 2a prototype (test data): http://127.0.0.1:${port}`);
    if (cloud.auth.created) console.log('Test accounts (shown once, saved hashed in cloud/data/test-users.json):\n' + Object.entries(cloud.auth.created).map(([u, pw]) => `  ${u}  ${pw}`).join('\n'));
  });
}
