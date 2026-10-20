// Local stand-in for the parts of Supabase (PostgREST + Storage) and Resend that /api/get-featured uses.
// For tests and the local preview only: it lives in memory and is never deployed (test/ is in .vercelignore).
// It checks the same auth headers as the real services, so a missing key fails here too.

const http = require('http');
const crypto = require('crypto');

function createMockBackend({ key = 'test-service-key', resendKey = 'test-resend-key', publishableKey = 'test-publishable-key' } = {}) {
  const state = { rows: [], files: new Map(), outbox: [], fail: {}, requests: [], heartbeat: null, clock: () => Date.now() }; // clock = the database's now()

  const match = (row, params) => {
    for (const [col, expr] of params) {
      if (['select', 'limit'].includes(col)) continue;
      const v = row[col], i = expr.indexOf('.'), op = expr.slice(0, i), arg = expr.slice(i + 1);
      if (op === 'eq' && String(v) !== arg) return false;
      if (op === 'gte' && !(v >= arg)) return false;
      if (op === 'lt' && !(v < arg)) return false;
      if (op === 'in' && !arg.replace(/^\(|\)$/g, '').split(',').includes(String(v))) return false;
      if (op === 'not' && arg === 'is.null' && v == null) return false;
    }
    return true;
  };

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks), u = new URL(req.url, 'http://x'), params = [...u.searchParams.entries()];
      state.requests.push({ method: req.method, path: u.pathname });
      const json = (code, obj, headers = {}) => { res.writeHead(code, { 'Content-Type': 'application/json', ...headers }); res.end(obj === undefined ? '' : JSON.stringify(obj)); };

      if (u.pathname === '/emails') {
        if (req.headers.authorization !== 'Bearer ' + resendKey) return json(401, { message: 'bad key' });
        if (state.fail.email) return json(500, { message: 'mock email failure' });
        const m = JSON.parse(body); state.outbox.push(m); return json(200, { id: crypto.randomUUID() });
      }
      if (u.pathname === '/rest/v1/rpc/dz_keepalive' && req.method === 'POST') {
        /* like the real grant: only the publishable (anon) key may run it */
        if (req.headers.apikey !== publishableKey) return json(401, { message: 'bad key' });
        if (state.fail.keepalive) { state.fail.keepalive--; return json(503, { message: 'mock: project paused' }); }
        state.heartbeat = { last_ping: new Date(state.clock()).toISOString(), pings: (state.heartbeat ? state.heartbeat.pings : 0) + 1 };
        return json(200, state.heartbeat.last_ping);
      }
      if (req.headers.apikey !== key || req.headers.authorization !== 'Bearer ' + key) return json(401, { message: 'bad key' });

      if (u.pathname === '/rest/v1/featured_submissions') {
        const hits = state.rows.filter(r => match(r, params));
        if (req.method === 'HEAD' || req.method === 'GET') {
          if (state.fail.count) return json(500, { message: 'mock db failure' });
          const limit = Number(u.searchParams.get('limit')) || hits.length;
          return json(200, req.method === 'GET' ? hits.slice(0, limit) : undefined, { 'Content-Range': `0-${Math.max(0, hits.length - 1)}/${hits.length}` });
        }
        if (req.method === 'POST') {
          if (state.fail.insert) return json(500, { message: 'mock insert failure' });
          const now = new Date(state.clock());
          const row = { id: crypto.randomUUID(), created_at: now.toISOString(), status: 'new', reviewer: null, review_notes: null, reviewed_at: null,
            team_notified_at: null, confirmation_sent_at: null, retain_until: new Date(now.getTime() + 365 * 86400e3).toISOString(), ...JSON.parse(body) };
          state.rows.push(row); return json(201, [row]);
        }
        if (req.method === 'PATCH') { const p = JSON.parse(body); hits.forEach(r => Object.assign(r, p)); return json(204); }
        if (req.method === 'DELETE') { state.rows = state.rows.filter(r => !hits.includes(r)); return json(200, hits.map(r => ({ id: r.id, photo_path: r.photo_path }))); }
      }
      let m;
      if ((m = /^\/storage\/v1\/object\/sign\/featured-press\/(.+)$/.exec(u.pathname)) && req.method === 'POST') {
        if (!state.files.has(m[1])) return json(404, { message: 'not found' });
        return json(200, { signedURL: `/object/sign/featured-press/${m[1]}?token=mock` });
      }
      if (u.pathname === '/storage/v1/object/featured-press' && req.method === 'DELETE') {
        JSON.parse(body).prefixes.forEach(p => state.files.delete(p)); return json(200, []);
      }
      if ((m = /^\/storage\/v1\/object\/featured-press\/(.+)$/.exec(u.pathname)) && req.method === 'POST') {
        if (state.fail.upload) return json(500, { message: 'mock upload failure' });
        if (state.files.has(m[1])) return json(409, { message: 'exists' });
        state.files.set(m[1], { type: req.headers['content-type'], size: body.length }); return json(200, { Key: m[1] });
      }
      json(404, { message: 'mock: no route ' + req.method + ' ' + u.pathname });
    });
  });

  return {
    state, server,
    listen: (port = 0) => new Promise(r => server.listen(port, '127.0.0.1', () => r('http://127.0.0.1:' + server.address().port))),
    close: () => new Promise(r => server.close(r)),
  };
}

module.exports = { createMockBackend };
