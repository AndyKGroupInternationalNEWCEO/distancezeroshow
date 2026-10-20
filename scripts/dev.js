// Local preview of the site, close to Vercel: clean URLs, the vercel.json rewrites and headers, and /api/* functions
// with Vercel's req.body / res.status().send() helpers.
//   node scripts/dev.js          real env vars only (without them GET FEATURED answers "not open yet", as in production)
//   node scripts/dev.js --no-env like production before the env vars are set (ignores .env.local)
//   node scripts/dev.js --mock   GET FEATURED runs against an in-memory Supabase + Resend stand-in; emails are printed here
// Not deployed (scripts/ is in .vercelignore).

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 4321;
const MOCK = process.argv.includes('--mock');
const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4',
  '.wav': 'audio/wav', '.ics': 'text/calendar; charset=utf-8', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.bin': 'application/octet-stream' };

const toRe = src => new RegExp('^' + src.replace(/\(\.\*\)/g, '(.*)').replace(/\(\(\?!([^)]*)\)\.\*\)/g, '((?!$1).*)') + '$');

function headersFor(p) {
  const h = {};
  vercel.headers.forEach(rule => { if (toRe(rule.source).test(p)) rule.headers.forEach(x => { h[x.key] = x.value; }); });
  return h;
}

/* real credentials for local testing: .env.local (git-ignored via .env*), KEY=value per line; values are never printed */
function loadEnvLocal() {
  const f = path.join(ROOT, '.env.local');
  if (!fs.existsSync(f)) return [];
  const names = [];
  fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach(line => {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line); if (!m || line.trim().startsWith('#')) return;
    if (process.env[m[1]] == null) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2'); names.push(m[1]);
  });
  return names;
}

async function main() {
  let mock = null;
  if (!MOCK && !process.argv.includes('--no-env')) { const n = loadEnvLocal(); if (n.length) console.log('loaded from .env.local: ' + n.join(', ')); }
  if (MOCK) {
    const { createMockBackend } = require('../test/mock-backend');
    mock = createMockBackend();
    const base = await mock.listen();
    Object.assign(process.env, { DZ_SUPABASE_URL: base, DZ_SUPABASE_SECRET_KEY: 'test-service-key', DZ_SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key', CRON_SECRET: 'local-cron-secret', DZ_RESEND_API_KEY: 'test-resend-key', DZ_RESEND_API_URL: base,
      DZ_MAIL_FROM: 'DISTANCE // ZERO <info@distancezeroshow.com>', DZ_TEAM_EMAIL: 'info@distancezeroshow.com', DZ_IP_HASH_SALT: 'local-preview' });
    setInterval(() => { while (mock.state.outbox.length) { const m = mock.state.outbox.shift();
      console.log(`\n[mock email] to ${m.to.join(', ')}\nsubject: ${m.subject}\n${m.text}\n`); } }, 500).unref();
  }
  process.env.DZ_ALLOWED_ORIGINS = [process.env.DZ_ALLOWED_ORIGINS, `http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`].filter(Boolean).join(',');

  http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://localhost');
    let p = decodeURIComponent(u.pathname);
    vercel.rewrites.forEach(r => { if (r.source === p) p = r.destination; });
    Object.entries(headersFor(p)).forEach(([k, v]) => res.setHeader(k, v));

    if (p.startsWith('/api/')) {
      const file = path.join(ROOT, 'api', path.basename(p) + '.js');
      if (!fs.existsSync(file) || path.basename(p).startsWith('_')) { res.statusCode = 404; return res.end('not found'); }
      const chunks = []; let size = 0;
      for await (const c of req) { size += c.length; if (size > 4.5 * 1024 * 1024) { res.statusCode = 413; return res.end('payload too large'); } chunks.push(c); }
      const raw = Buffer.concat(chunks).toString('utf8');
      req.body = /application\/json/.test(req.headers['content-type'] || '') ? (() => { try { return JSON.parse(raw); } catch (e) { return raw; } })() : raw;
      req.headers['x-forwarded-for'] = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      res.status = c => { res.statusCode = c; return res; };
      res.send = b => res.end(b);
      res.json = o => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
      try { await require(file)(req, res); } catch (e) { console.error(e); if (!res.headersSent) { res.statusCode = 500; res.end('error'); } }
      return;
    }

    let f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || /\/(\.|test\/|scripts\/|supabase\/|studio\/|api\/)/.test(p)) { res.statusCode = 404; return res.end('not found'); }
    if (p.endsWith('/')) f = path.join(f, 'index.html');
    else if (!path.extname(f) && fs.existsSync(f + '.html')) f += '.html';
    fs.stat(f, (err, st) => {
      if (err || !st.isFile()) { res.statusCode = 404; return res.end('not found'); }
      res.setHeader('Content-Type', TYPES[path.extname(f)] || 'application/octet-stream');
      const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
      if (range) { const s = Number(range[1] || 0), e = range[2] ? Number(range[2]) : st.size - 1;
        res.writeHead(206, { 'Content-Range': `bytes ${s}-${e}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': e - s + 1 }); return fs.createReadStream(f, { start: s, end: e }).pipe(res); }
      res.setHeader('Content-Length', st.size); fs.createReadStream(f).pipe(res);
    });
  }).listen(PORT, () => console.log(`DISTANCE // ZERO local preview: http://localhost:${PORT}  ${MOCK ? '(GET FEATURED: local mock backend)' : '(GET FEATURED: real env vars only)'}`));
}

main();
