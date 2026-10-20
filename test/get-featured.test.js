// node --test test/
// GET FEATURED end to end against the local Supabase + Resend stand-in, over real HTTP: validation, spam, security,
// failure handling and retention.

const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../api/_lib/featured');
const handler = require('../api/get-featured');
const retention = require('../api/featured-retention');
const { createMockBackend } = require('./mock-backend');

const JPEG = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(2000, 7)]);
const NOW = Date.parse('2026-11-02T10:00:00Z');
const quiet = { error() {}, warn() {}, log() {} };

function good(over = {}) {
  return {
    full_name: 'Jane Example', artist_name: 'JX', city_country: 'Melbourne, Australia', genre: 'Melodic techno', email: 'Jane@Example.com',
    music_links: 'https://soundcloud.com/jx\nhttps://open.spotify.com/artist/1', social_links: 'https://instagram.com/jx',
    bio: 'Producer and DJ from Melbourne, playing warehouse parties and writing late-night melodic techno since 2019.',
    epk_url: '', photo: { data: 'data:image/jpeg;base64,' + JPEG.toString('base64') }, features: ['Guest DJ Mix', 'Live Interview'],
    consent_contact: true, consent_rights: true, website: '', started_at: NOW - 60000, ...over,
  };
}

function call(fn, { method = 'POST', headers = {}, body, deps } = {}) {
  return new Promise(resolve => {
    const res = { headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.code = c; return this; },
      send(b) { resolve({ code: this.code, headers: this.headers, body: b ? JSON.parse(b) : null }); } };
    const req = { method, body, socket: { remoteAddress: '203.0.113.9' },
      headers: { origin: 'https://distancezeroshow.com', 'content-type': 'application/json', 'user-agent': 'test', ...headers } };
    fn(req, res, deps);
  });
}

let mock, base, cfg;
test.before(async () => { mock = createMockBackend(); base = await mock.listen(); });
test.after(() => mock.close());
test.beforeEach(() => {
  mock.state.rows = []; mock.state.files.clear(); mock.state.outbox = []; mock.state.fail = {}; mock.state.clock = () => NOW;
  cfg = F.config({ DZ_SUPABASE_URL: base, DZ_SUPABASE_SECRET_KEY: 'test-service-key', DZ_RESEND_API_KEY: 'test-resend-key', DZ_RESEND_API_URL: base,
    DZ_MAIL_FROM: 'DISTANCE // ZERO <info@distancezeroshow.com>', DZ_TEAM_EMAIL: 'info@distancezeroshow.com', DZ_IP_HASH_SALT: 'salt' });
});
const post = (body, more = {}) => call(handler, { body, ...more, deps: { config: cfg, now: () => NOW, log: quiet, ...(more.deps || {}) } });

/* ---------- happy path ---------- */
test('valid submission is stored, photo kept private, team notified and artist confirmed', async () => {
  const r = await post(good());
  assert.equal(r.code, 201);
  assert.match(r.body.reference, /^D0-[0-9A-F]{8}$/);
  assert.equal(r.body.emailed, true);
  assert.deepEqual(Object.keys(r.body).sort(), ['emailed', 'ok', 'reference'], 'response carries no personal data');
  assert.equal(r.headers['cache-control'], 'no-store');

  assert.equal(mock.state.rows.length, 1);
  const row = mock.state.rows[0];
  assert.equal(row.email, 'jane@example.com');
  assert.deepEqual(row.music_links, ['https://soundcloud.com/jx', 'https://open.spotify.com/artist/1']);
  assert.deepEqual(row.preferred_features, ['Guest DJ Mix', 'Live Interview']);
  assert.equal(row.consent_version, F.CONSENT_VERSION);
  assert.ok(row.team_notified_at && row.confirmation_sent_at);
  assert.match(row.ip_hash, /^[0-9a-f]{64}$/); assert.ok(!JSON.stringify(row).includes('203.0.113.9'), 'raw IP is never stored');
  assert.equal(row.photo_path, '2026-11/' + row.reference + '.jpg');
  assert.equal(mock.state.files.get(row.photo_path).type, 'image/jpeg');

  const [team, artist] = mock.state.outbox;
  assert.deepEqual(team.to, ['info@distancezeroshow.com']); assert.equal(team.reply_to, 'jane@example.com');
  assert.match(team.text, /Press photo: http.*token=mock/);
  assert.deepEqual(artist.to, ['jane@example.com']); assert.match(artist.subject, new RegExp(row.reference));
  assert.match(artist.text, /no guaranteed airtime/i);
});

test('EPK link alone is enough, no photo needed', async () => {
  const r = await post(good({ photo: null, epk_url: 'https://dropbox.com/epk' }));
  assert.equal(r.code, 201); assert.equal(mock.state.rows[0].photo_path, null); assert.equal(mock.state.rows[0].epk_url, 'https://dropbox.com/epk');
});

/* ---------- validation ---------- */
test('missing required fields come back per field', async () => {
  const r = await post(good({ full_name: ' ', genre: '', email: 'nope', music_links: '', bio: 'short', features: [], consent_contact: false, consent_rights: 'yes', photo: null }));
  assert.equal(r.code, 400);
  for (const k of ['full_name', 'genre', 'email', 'music_links', 'bio', 'features', 'consent_contact', 'consent_rights', 'press']) assert.ok(r.body.fields[k], k);
  assert.equal(mock.state.rows.length, 0); assert.equal(mock.state.outbox.length, 0);
});

test('links must be http(s): javascript:, data:, credentials and junk are refused', async () => {
  for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'ftp://x.com/a', 'https://user:pw@evil.com', 'soundcloud', 'https://localhost']) {
    const r = await post(good({ music_links: bad }));
    assert.equal(r.code, 400, bad); assert.ok(r.body.fields.music_links, bad);
  }
  assert.equal((await post(good({ social_links: Array(6).fill('https://x.com/a').map((x, i) => x + i).join('\n') }))).body.fields.social_links, 'Up to 5 links, please.');
});

test('field length limits are enforced', async () => {
  const r = await post(good({ artist_name: 'x'.repeat(121), bio: 'y'.repeat(3001) }));
  assert.equal(r.code, 400); assert.ok(r.body.fields.artist_name); assert.ok(r.body.fields.bio);
});

test('unknown feature values are refused', async () => {
  const r = await post(good({ features: ['Guest DJ Mix', 'Paid Premium Slot'] }));
  assert.equal(r.code, 400); assert.ok(r.body.fields.features);
});

test('photo: type is checked from the bytes, size limited to 3 MB', async () => {
  const fake = Buffer.from('<svg onload=alert(1)>').toString('base64');
  let r = await post(good({ photo: { data: 'data:image/jpeg;base64,' + fake } }));
  assert.equal(r.code, 400); assert.match(r.body.fields.photo, /JPG, PNG or WebP/);
  const big = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF]), Buffer.alloc(F.PHOTO_MAX)]).toString('base64');
  r = await post(good({ photo: { data: big } }));
  assert.equal(r.code, 400); assert.match(r.body.fields.photo, /3 MB/);
  r = await post(good({ photo: { data: '!!!notbase64' } }));
  assert.equal(r.code, 400);
});

test('control and bidi characters are stripped, text is normalised', () => {
  assert.equal(F.clean('  Ja\u0000ne‮  \n Doe '), 'Jane Doe');
  assert.equal(F.clean('a\r\n\r\n\r\n\r\nb', true), 'a\n\nb');
});

test('biography stuffed with links is refused', async () => {
  const r = await post(good({ bio: 'Listen: https://a.com https://b.com https://c.com https://d.com — the best electronic music on the planet, honestly.' }));
  assert.equal(r.code, 400); assert.ok(r.body.fields.bio);
});

/* ---------- spam ---------- */
test('honeypot and too-fast submissions get a quiet success but nothing is stored or sent', async () => {
  for (const over of [{ website: 'http://spam.biz' }, { started_at: NOW - 1000 }, { started_at: 'x' }, { started_at: NOW - 2 * 86400e3 }]) {
    const r = await post(good(over));
    assert.equal(r.code, 201); assert.ok(r.body.reference);
  }
  assert.equal(mock.state.rows.length, 0); assert.equal(mock.state.outbox.length, 0); assert.equal(mock.state.files.size, 0);
});

test('one submission per email per day', async () => {
  assert.equal((await post(good())).code, 201);
  const r = await post(good({ email: 'JANE@example.com' }), { headers: { 'x-forwarded-for': '198.51.100.1' } });
  assert.equal(r.code, 429); assert.equal(r.body.error, 'duplicate'); assert.equal(mock.state.rows.length, 1);
});

test('at most 3 submissions per IP per hour', async () => {
  for (let i = 0; i < 3; i++) assert.equal((await post(good({ email: `a${i}@example.com` }))).code, 201);
  const r = await post(good({ email: 'a9@example.com' }));
  assert.equal(r.code, 429); assert.equal(r.body.error, 'rate');
  assert.equal((await post(good({ email: 'b@example.com' }), { headers: { 'x-forwarded-for': '198.51.100.7' } })).code, 201, 'other IPs are not affected');
});

/* ---------- request security ---------- */
test('only POST, only JSON, only from the site', async () => {
  assert.equal((await post(good(), { method: 'GET' })).code, 405);
  assert.equal((await post(good(), { headers: { origin: 'https://evil.example' } })).code, 403);
  assert.equal((await post(good(), { headers: { origin: '' } })).code, 403);
  assert.equal((await post(good(), { headers: { 'content-type': 'text/plain' } })).code, 415);
  assert.equal((await post(good(), { headers: { 'content-length': String(5 * 1024 * 1024) } })).code, 413);
  assert.equal((await post('{not json')).code, 400);
  assert.equal((await post([1, 2])).code, 400);
  assert.equal(mock.state.rows.length, 0);
});

test('extra origins (preview / local) only via DZ_ALLOWED_ORIGINS', () => {
  assert.ok(F.originAllowed('https://distancezeroshow.com'));
  assert.ok(!F.originAllowed('http://localhost:4321'));
  assert.ok(F.originAllowed('http://localhost:4321', 'http://localhost:4321'));
});

test('HTML in fields is escaped in the team email', async () => {
  await post(good({ artist_name: '<img src=x onerror=alert(1)>', bio: '<script>alert(1)</script> I make music in Vienna and have done so for a long while.' }));
  const team = mock.state.outbox[0];
  assert.ok(!team.html.includes('<script>') && !team.html.includes('<img src=x'));
  assert.ok(team.html.includes('&lt;script&gt;'));
});

/* ---------- configuration and failures ---------- */
test('without credentials it refuses honestly (503) and stores nothing', async () => {
  const r = await post(good(), { deps: { config: F.config({}) } });
  assert.equal(r.code, 503); assert.equal(r.body.error, 'not_configured');
  assert.deepEqual(F.config({}).missing, ['DZ_SUPABASE_URL', 'DZ_SUPABASE_SECRET_KEY', 'DZ_RESEND_API_KEY', 'DZ_MAIL_FROM', 'DZ_TEAM_EMAIL', 'DZ_IP_HASH_SALT']);
});

test('wrong service key: 500, nothing half-saved', async () => {
  const r = await post(good(), { deps: { config: { ...cfg, supabaseKey: 'wrong' } } });
  assert.equal(r.code, 500); assert.equal(mock.state.rows.length, 0);
});

test('database insert fails: 500 and the uploaded photo is removed again', async () => {
  mock.state.fail.insert = true;
  const r = await post(good());
  assert.equal(r.code, 500); assert.equal(r.body.error, 'server');
  assert.equal(mock.state.files.size, 0); assert.equal(mock.state.outbox.length, 0);
});

test('photo upload fails: 500, no row', async () => {
  mock.state.fail.upload = true;
  assert.equal((await post(good())).code, 500); assert.equal(mock.state.rows.length, 0);
});

test('email service down: submission is still saved, row shows it was not notified', async () => {
  mock.state.fail.email = true;
  const r = await post(good());
  assert.equal(r.code, 201); assert.equal(r.body.emailed, false);
  assert.equal(mock.state.rows.length, 1); assert.equal(mock.state.rows[0].team_notified_at, null); assert.equal(mock.state.rows[0].confirmation_sent_at, null);
});

/* ---------- retention ---------- */
test('retention job: needs the cron secret, deletes expired rows with their photos, clears old IP hashes', async () => {
  const deps = { config: cfg, cronSecret: 's3cret', now: () => NOW, log: quiet };
  assert.equal((await call(retention, { method: 'GET', deps })).code, 401);
  assert.equal((await call(retention, { method: 'GET', headers: { authorization: 'Bearer nope' }, deps })).code, 401);
  assert.equal((await call(retention, { method: 'GET', headers: { authorization: 'Bearer x' }, deps: { ...deps, cronSecret: '' } })).code, 401, 'no secret configured = closed');

  await post(good()); await post(good({ email: 'b@example.com' }));
  const [old, fresh] = mock.state.rows;
  old.retain_until = new Date(NOW - 1000).toISOString();
  fresh.created_at = new Date(NOW - 40 * 86400e3).toISOString();
  const r = await call(retention, { method: 'GET', headers: { authorization: 'Bearer s3cret' }, deps });
  assert.equal(r.code, 200); assert.equal(r.body.deleted, 1);
  assert.deepEqual(mock.state.rows.map(x => x.id), [fresh.id]);
  assert.ok(!mock.state.files.has(old.photo_path)); assert.ok(mock.state.files.has(fresh.photo_path));
  assert.equal(fresh.ip_hash, null);
});
