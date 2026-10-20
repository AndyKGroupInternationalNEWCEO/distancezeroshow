// node --test test/*.test.js
// Advertise on the show: email to the team, nothing stored, spam and abuse checks.

const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../api/_lib/featured');
const handler = require('../api/advertise');
const { createMockBackend } = require('./mock-backend');

const NOW = Date.parse('2026-11-02T10:00:00Z');
const quiet = { error() {}, warn() {}, log() {} };
let mock, base;
test.before(async () => { mock = createMockBackend(); base = await mock.listen(); });
test.after(() => mock.close());
test.beforeEach(() => { mock.state.outbox = []; mock.state.fail = {}; mock.state.requests = []; handler._reset(); });

const cfg = (over = {}) => F.config({ DZ_RESEND_API_KEY: 'test-resend-key', DZ_RESEND_API_URL: base, DZ_MAIL_FROM: 'DISTANCE // ZERO <info@distancezeroshow.com>',
  DZ_TEAM_EMAIL: 'info@distancezeroshow.com', DZ_IP_HASH_SALT: 'salt', ...over });
const good = (over = {}) => ({ company: 'Example Records', name: 'Sam Example', email: 'Sam@Example.com', website: 'https://example.com',
  type: 'Segment partner', budget: 'EUR 250 to 1,000', message: 'We would love to present Behind the Track.', fax: '', started_at: NOW - 20000, ...over });

function call(body, { headers = {}, method = 'POST', config = cfg() } = {}) {
  return new Promise(resolve => {
    const res = { headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.code = c; return this; },
      send(b) { resolve({ code: this.code, body: JSON.parse(b) }); } };
    handler({ method, body, socket: {}, headers: { origin: 'https://distancezeroshow.com', 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.5', ...headers } },
      res, { config, now: () => NOW, log: quiet });
  });
}

test('a request reaches the team inbox with Reply-To set to the sender; nothing is stored, no mail to the sender', async () => {
  const r = await call(good());
  assert.equal(r.code, 200); assert.deepEqual(r.body, { ok: true });
  assert.equal(mock.state.outbox.length, 1);
  const m = mock.state.outbox[0];
  assert.deepEqual(m.to, ['info@distancezeroshow.com']); assert.equal(m.reply_to, 'sam@example.com');
  assert.match(m.subject, /^Advertising: Example Records \/ Segment partner \(EUR 250 to 1,000\)$/);
  assert.match(m.text, /Behind the Track/);
  assert.ok(!mock.state.requests.some(q => q.path.startsWith('/rest/')), 'no database');
});

test('required fields, email format, website link and message length', async () => {
  assert.ok((await call(good({ company: ' ' }))).body.fields.company);
  assert.ok((await call(good({ email: 'nope' }))).body.fields.email);
  assert.ok((await call(good({ website: 'javascript:alert(1)' }))).body.fields.website);
  assert.ok((await call(good({ message: 'x'.repeat(3001) }))).body.fields.message);
  assert.equal(mock.state.outbox.length, 0);
});

test('unknown option values fall back to safe defaults', async () => {
  await call(good({ type: '<b>hack</b>', budget: 'a million' }));
  assert.match(mock.state.outbox[0].subject, /Something else \(Let's have a yarn\)/);
});

test('HTML in fields is escaped', async () => {
  await call(good({ company: '<img src=x onerror=alert(1)>', message: '<script>alert(1)</script>' }));
  const h = mock.state.outbox[0].html;
  assert.ok(!h.includes('<script>') && !h.includes('<img src=x')); assert.ok(h.includes('&lt;script&gt;'));
});

test('honeypot and bot-fast submissions: quiet success, no email', async () => {
  assert.equal((await call(good({ fax: 'x' }))).code, 200);
  assert.equal((await call(good({ started_at: NOW - 500 }))).code, 200);
  assert.equal(mock.state.outbox.length, 0);
});

test('at most 5 per IP per hour', async () => {
  for (let i = 0; i < 5; i++) assert.equal((await call(good())).code, 200);
  assert.equal((await call(good())).code, 429);
  assert.equal((await call(good(), { headers: { 'x-forwarded-for': '198.51.100.2' } })).code, 200);
});

test('origin, method and type checks', async () => {
  assert.equal((await call(good(), { headers: { origin: 'https://evil.example' } })).code, 403);
  assert.equal((await call(good(), { method: 'GET' })).code, 405);
  assert.equal((await call(good(), { headers: { 'content-type': 'text/plain' } })).code, 415);
});

test('not configured: 503 (the page then opens the mail app); email down: 502', async () => {
  assert.equal((await call(good(), { config: F.config({}) })).code, 503);
  mock.state.fail.email = true;
  assert.equal((await call(good())).code, 502);
});
