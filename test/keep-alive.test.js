// node --test test/*.test.js
// Keep-alive: cron secret, least privilege (publishable key only), retry, failure alert.

const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../api/_lib/featured');
const handler = require('../api/keep-alive');
const { createMockBackend } = require('./mock-backend');

const quiet = { error() {}, warn() {}, log() {} };
let mock, base;
test.before(async () => { mock = createMockBackend(); base = await mock.listen(); });
test.after(() => mock.close());
test.beforeEach(() => { mock.state.fail = {}; mock.state.outbox = []; mock.state.heartbeat = null; });

const env = (over = {}) => F.config({ DZ_SUPABASE_URL: base, DZ_SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key', DZ_RESEND_API_KEY: 'test-resend-key',
  DZ_RESEND_API_URL: base, DZ_MAIL_FROM: 'DISTANCE // ZERO <info@distancezeroshow.com>', DZ_TEAM_EMAIL: 'info@distancezeroshow.com', ...over });

function call(auth, deps) {
  return new Promise(resolve => {
    const res = { headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.code = c; return this; },
      send(b) { resolve({ code: this.code, headers: this.headers, body: JSON.parse(b) }); } };
    handler({ method: 'GET', headers: auth ? { authorization: auth } : {} }, res, { cronSecret: 'cron-s3cret', log: quiet, wait: async () => {}, config: env(), ...deps });
  });
}

test('only Vercel Cron (Bearer CRON_SECRET) may trigger it', async () => {
  assert.equal((await call(null)).code, 401);
  assert.equal((await call('Bearer wrong')).code, 401);
  assert.equal((await call('Bearer ', { cronSecret: '' })).code, 401, 'no secret configured = closed');
  assert.equal(mock.state.heartbeat, null);
});

test('ping stamps the heartbeat using only the publishable key', async () => {
  const r = await call('Bearer cron-s3cret');
  assert.equal(r.code, 200); assert.equal(r.body.ok, true); assert.equal(r.body.attempt, 1);
  assert.equal(r.headers['cache-control'], 'no-store');
  assert.equal(mock.state.heartbeat.pings, 1);
  await call('Bearer cron-s3cret'); assert.equal(mock.state.heartbeat.pings, 2);
  assert.ok(!mock.state.requests.some(q => q.path.startsWith('/rest/v1/featured')), 'no table is touched');
});

test('a secret key in place of the publishable key is not used and not needed', async () => {
  const r = await call('Bearer cron-s3cret', { config: env({ DZ_SUPABASE_PUBLISHABLE_KEY: 'test-service-key' }) });
  assert.equal(r.code, 500, 'mock grants the function to the publishable key only');
});

test('one failure is retried; the second attempt succeeds without an alert', async () => {
  mock.state.fail.keepalive = 1;
  const r = await call('Bearer cron-s3cret');
  assert.equal(r.code, 200); assert.equal(r.body.attempt, 2); assert.equal(mock.state.outbox.length, 0);
});

test('Supabase unreachable twice: 500 for the Vercel cron log and one alert email to the team', async () => {
  mock.state.fail.keepalive = 2;
  const r = await call('Bearer cron-s3cret');
  assert.equal(r.code, 500); assert.equal(r.body.error, 'supabase_unreachable');
  assert.equal(mock.state.outbox.length, 1);
  assert.deepEqual(mock.state.outbox[0].to, ['info@distancezeroshow.com']);
  assert.match(mock.state.outbox[0].subject, /keep-alive failed/);
  assert.ok(!mock.state.outbox[0].text.includes('test-publishable-key'), 'no key in the alert');
});

test('not configured: 503, nothing sent', async () => {
  const r = await call('Bearer cron-s3cret', { config: F.config({}) });
  assert.equal(r.code, 503); assert.equal(mock.state.outbox.length, 0);
});
