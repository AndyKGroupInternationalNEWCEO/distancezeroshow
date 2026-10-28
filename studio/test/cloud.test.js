// Stage 2a prototype (cloud/): sign-in, roles, the engine link (push only, offline after silence) and the absence of
// any route that could reach OBS. A temp data folder each run: no real accounts, no studio data.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createCloud, engineToken } from '../cloud/server.js';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dz-cloud-'));
let clock = Date.now();
const cloud = createCloud({ dataDir, now: () => clock, staleMs: 10000 });
const server = http.createServer(cloud.handler);
await new Promise(r => server.listen(0, '127.0.0.1', r));
const B = `http://127.0.0.1:${server.address().port}`;
const ANDY = 'andrejkneisl@distancezeroshow.com', GEORGIE = 'georgiewalker@distancezeroshow.com';
test.after(() => { server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

async function req(method, p, { body, cookie, headers = {} } = {}) {
  const r = await fetch(B + p, { method, headers: { 'Content-Type': 'application/json', 'X-DZ': '1', ...(cookie && { Cookie: cookie }), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, headers: r.headers };
}
async function signIn(login) {
  const r = await req('POST', '/api/login', { body: { login, password: cloud.auth.created[login] } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const c = r.headers.get('set-cookie');
  assert.match(c, /HttpOnly/); assert.match(c, /SameSite=Strict/);
  return c.split(';')[0];
}

test('test accounts are generated, stored hashed, never in plain text', () => {
  const saved = fs.readFileSync(path.join(dataDir, 'test-users.json'), 'utf8');
  for (const pw of Object.values(cloud.auth.created)) assert.ok(!saved.includes(pw));
  assert.deepEqual(Object.keys(cloud.auth.created).sort(), [ANDY, GEORGIE].sort());
});

test('the official addresses sign in (any letter case) with their roles; the infrastructure account is no studio user', async () => {
  const r = await req('POST', '/api/login', { body: { login: ANDY.toUpperCase(), password: cloud.auth.created[ANDY] } });
  assert.equal(r.status, 200); assert.equal(r.json.user.role, 'director'); assert.match(r.json.user.title, /Owner/);
  const g = await req('POST', '/api/login', { body: { login: GEORGIE, password: cloud.auth.created[GEORGIE] } });
  assert.equal(g.json.user.role, 'host'); assert.equal(g.json.user.title, 'Co-Host');
  assert.equal((await req('POST', '/api/login', { body: { login: 'info@distancezeroshow.com', password: cloud.auth.created[ANDY] } })).status, 401);
  clock += 61e3;   // that refusal counts towards the lockout; the next test starts with a clean minute
});

test('sign-in: wrong password refused, five failures lock the address for a minute, nothing without a session', async () => {
  assert.equal((await req('GET', '/api/plans')).status, 401);
  assert.equal((await req('GET', '/api/engine')).status, 401);
  for (let i = 0; i < 5; i++) assert.equal((await req('POST', '/api/login', { body: { login: ANDY, password: 'nope' } })).status, 401);
  assert.equal((await req('POST', '/api/login', { body: { login: ANDY, password: cloud.auth.created[ANDY] } })).status, 429);
  clock += 61e3;
  await signIn(ANDY);
});

test('a change without the page header or from another origin is refused', async () => {
  const c = await signIn(ANDY);
  assert.equal((await req('POST', '/api/plans', { cookie: c, headers: { 'X-DZ': '' }, body: { format: 'friday', date: '2030-01-04', start: '21:00' } })).status, 403);
  assert.equal((await req('POST', '/api/plans', { cookie: c, headers: { Origin: 'https://evil.example' }, body: { format: 'friday', date: '2030-01-04', start: '21:00' } })).status, 403);
});

test('roles: Andy plans; Georgie reads the planner but cannot change it', async () => {
  const a = await signIn(ANDY), g = await signIn(GEORGIE);
  const plans = (await req('GET', '/api/plans', { cookie: g })).json;
  assert.deepEqual(plans.map(p => p.format).sort(), ['friday', 'saturday', 'sunday'], 'one test episode of each format');
  assert.ok(plans.every(p => p.test && p.segments.length > 0));
  const made = await req('POST', '/api/plans', { cookie: a, body: { format: 'saturday', date: '2030-01-05', start: '20:00' } });
  assert.equal(made.status, 201); assert.equal(made.json.segments.length, 10, 'Saturday has its ten segments');
  const ed = await req('PATCH', `/api/plans/${made.json.id}`, { cookie: a, body: { title: 'Piano Sessions #2', status: 'ready', segments: [{ title: 'Opening', kind: 'VT', minutes: 1.5 }] } });
  assert.equal(ed.status, 200); assert.equal(ed.json.title, 'Piano Sessions #2'); assert.equal(ed.json.segments.length, 1);
  assert.equal((await req('PATCH', `/api/plans/${made.json.id}`, { cookie: a, body: { start: '25:00' } })).status, 400);
  for (const [m, p, body] of [['POST', '/api/plans', { format: 'sunday', date: '2030-01-06', start: '20:00' }], ['PATCH', `/api/plans/${made.json.id}`, { title: 'x' }], ['DELETE', `/api/plans/${made.json.id}`]]) {
    assert.equal((await req(m, p, { cookie: g, body })).status, 403, `${m} ${p} as Georgie`);
  }
  assert.equal((await req('DELETE', `/api/plans/${made.json.id}`, { cookie: a })).status, 200);
});

test('the Mac link: only the engine token may report; unknown fields are dropped; silence means offline', async () => {
  const c = await signIn(GEORGIE);
  assert.equal((await req('GET', '/api/engine', { cookie: c })).json.online, false, 'no report yet');
  assert.equal((await req('POST', '/engine/heartbeat', { headers: { Authorization: 'Bearer wrong' }, body: { obs: true } })).status, 401);
  const token = engineToken(dataDir);
  const ok = await req('POST', '/engine/heartbeat', { headers: { Authorization: `Bearer ${token}` }, body: { show: 'TEST', obs: true, streaming: false, obsPassword: 'secret', cmd: 'stream' } });
  assert.equal(ok.status, 204);
  let v = (await req('GET', '/api/engine', { cookie: c })).json;
  assert.equal(v.online, true); assert.deepEqual(v.state, { show: 'TEST', obs: true, streaming: false });
  clock += 11e3;
  v = (await req('GET', '/api/engine', { cookie: c })).json;
  assert.equal(v.online, false, 'offline after 10 s without a report'); assert.equal(v.state.show, 'TEST', 'the last state stays visible');
});

test('no route can reach OBS or the studio: control-like paths answer 404, also for the director', async () => {
  const c = await signIn(ANDY);
  for (const p of ['/api/command', '/api/obs', '/api/stream', '/api/golive', '/engine/command', '/api/engine'])
    assert.ok([404, 405].includes((await req('POST', p, { cookie: c, body: { action: 'stream', on: true } })).status), p);
});

test('every answer carries the security headers; static files only from public/', async () => {
  const r = await fetch(B + '/');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.equal(r.headers.get('cache-control'), 'no-store');
  for (const p of ['/../server.js', '/%2e%2e/server.js', '/data/test-users.json', '/lib/auth.js']) assert.equal((await fetch(B + p)).status, 404, p);
});
