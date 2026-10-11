// End-to-end tests: the real studio server against the mock OBS, over real HTTP and WebSockets.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { startStudio, loadConfig } from '../server.js';
import { startMockObs } from './mock-obs.js';

const quiet = { log() {}, warn() {} };
let mock, app, dataDir, D, G, directorCookie, hostCookie;

function config(obsPort) {
  const c = loadConfig();
  c.director = { host: '127.0.0.1', port: 0 };
  c.guest = { host: '127.0.0.1', port: 0 };
  c.obs = { url: `ws://127.0.0.1:${obsPort}` };
  return c;
}

async function login(base, code) {
  const r = await fetch(base + '/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
  return { status: r.status, cookie: (r.headers.get('set-cookie') || '').split(';')[0], body: await r.json() };
}

function client(base, { cookie, origin = base, query = '' } = {}) {
  const url = base.replace('http', 'ws') + '/ws' + query;
  const ws = new WebSocket(url, { headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}) } });
  const msgs = [], waiters = [];
  let seq = 0;
  ws.on('message', raw => {
    const m = JSON.parse(raw);
    msgs.push(m);
    for (const w of [...waiters]) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(m); }
  });
  return {
    ws, msgs,
    opened: new Promise((res, rej) => { ws.once('open', res); ws.once('unexpected-response', (_, r) => rej(new Error('HTTP ' + r.statusCode))); ws.once('error', rej); }),
    next(pred, ms = 3000) {
      const hit = msgs.find(pred);
      if (hit) return Promise.resolve(hit);
      return new Promise((resolve, reject) => {
        const w = { pred, resolve };
        waiters.push(w);
        setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); reject(new Error('timed out waiting for message')); }, ms);
      });
    },
    fresh(pred, ms) { msgs.length = 0; return this.next(pred, ms); },
    send(msg) {
      const id = 't' + ++seq;
      ws.send(JSON.stringify({ ...msg, id }));
      return this.next(m => m.t === 'ack' && m.id === id);
    },
    close() { ws.close(); },
  };
}
const until = async (fn, ms = 3000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return true; await new Promise(r => setTimeout(r, 20)); }
  throw new Error('condition not met');
};

before(async () => {
  mock = startMockObs({ port: 0, password: 'test-pass', meters: true });
  await mock.ready;
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dz-studio-test-'));
  app = await startStudio({ config: config(mock.port), dataDir, obsPassword: 'test-pass', log: quiet });
  D = `http://127.0.0.1:${app.director.port}`;
  G = `http://127.0.0.1:${app.guest.port}`;
  await until(() => app.obs.state.connected);
  directorCookie = (await login(D, app.secrets.directorCode)).cookie;
  hostCookie = (await login(G, app.secrets.hostCode)).cookie;
});
after(async () => {
  await app.close();
  await mock.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('pages require sign-in; each port only accepts its own code', async () => {
  for (const base of [D, G]) {
    const r = await fetch(base + '/', { redirect: 'manual' });
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('location'), '/login');
  }
  assert.equal((await login(D, 'WRONG-CODE')).status, 401);
  assert.equal((await login(G, app.secrets.directorCode)).status, 401, 'director code must not work on the host port');
  assert.equal((await login(D, app.secrets.hostCode)).status, 401, 'host code must not work on the director port');
  const ok = await login(G, app.secrets.hostCode.toLowerCase().replace(/-/g, ' '));
  assert.equal(ok.status, 200, 'codes are forgiving about case and separators');
  const page = await fetch(G + '/', { headers: { Cookie: hostCookie } });
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Host Dashboard/);
  assert.doesNotMatch(html, /director\.js/);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(page.headers.get('referrer-policy'), 'no-referrer');
  assert.match(ok.cookie, /^dz_host=/);
});

test('a host cookie is useless on the director port', async () => {
  const r = await fetch(D + '/', { redirect: 'manual', headers: { Cookie: hostCookie.replace('dz_host', 'dz_director') } });
  assert.equal(r.status, 302);
});

test('director port refuses anything that came through a tunnel or proxy', async () => {
  const r = await fetch(D + '/login', { headers: { 'X-Forwarded-For': '203.0.113.9' } });
  assert.equal(r.status, 403);
  const ws = new WebSocket(D.replace('http', 'ws') + '/ws', { headers: { Origin: D, Cookie: directorCookie, 'CF-Connecting-IP': '203.0.113.9' } });
  await assert.rejects(new Promise((res, rej) => { ws.once('open', res); ws.once('unexpected-response', (_, r) => rej(new Error('HTTP ' + r.statusCode))); }), /403/);
});

test('the host port has no overlay and no director page', async () => {
  assert.equal((await fetch(G + '/overlay')).status, 404);
  assert.equal((await fetch(G + '/director.html')).status, 404);
  assert.equal((await fetch(G + '/static/../server.js')).status, 404);
});

test('websocket rejects missing cookies and foreign origins', async () => {
  await assert.rejects(client(D).opened, /401/);
  await assert.rejects(client(D, { cookie: directorCookie, origin: 'https://evil.example' }).opened, /403/);
  await assert.rejects(client(G, { cookie: directorCookie }).opened, /401/);
});

test('director sees OBS and switches scenes in OBS', async () => {
  const d = client(D, { cookie: directorCookie });
  await d.opened;
  const { s } = await d.next(m => m.t === 'state' && m.s.obs.connected);
  assert.deepEqual(s.obs.scenes.slice(0, 3), ['STANDBY', 'OPENING', 'VIENNA']);
  assert.equal(s.obs.program, 'STANDBY');
  assert.ok(s.obs.audio.some(a => a.name === 'Mic // Andrej' && a.mic));
  assert.ok(!s.obs.audio.some(a => a.name === 'Cam // Andrej'), 'video-only sources are not in the mixer');

  const ack = await d.send({ t: 'obs', action: 'program', scene: 'VIENNA' });
  assert.equal(ack.ok, true, ack.error);
  assert.equal(mock.state.program, 'VIENNA');
  await d.next(m => m.t === 'state' && m.s.obs.program === 'VIENNA' && m.s.obs.items.length === 4);

  const bad = await d.send({ t: 'obs', action: 'program', scene: 'NOPE' });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /no scene called "NOPE"/);
  d.close();
});

test('director toggles sources, mutes audio and gets meters', async () => {
  const d = client(D, { cookie: directorCookie });
  await d.opened;
  await d.next(m => m.t === 'meters' && m.m['Mic // Andrej']);
  const { s } = await d.next(m => m.t === 'state' && m.s.obs.items.length);
  const item = s.obs.items.find(i => i.name === 'VDO // Georgie');
  assert.equal((await d.send({ t: 'obs', action: 'item', itemId: item.id, enabled: !item.enabled })).ok, true);
  assert.equal(mock.items[s.obs.program].find(i => i.sceneItemId === item.id).sceneItemEnabled, !item.enabled);
  assert.equal((await d.send({ t: 'obs', action: 'mute', input: 'DJ Mixer', muted: true })).ok, true);
  await d.next(m => m.t === 'state' && m.s.obs.audio.find(a => a.name === 'DJ Mixer')?.muted);
  await d.send({ t: 'obs', action: 'mute', input: 'DJ Mixer', muted: false });
  d.close();
});

test('studio mode: preview then take', async () => {
  mock.state.studioMode = true;
  await app.obs.refresh();
  const d = client(D, { cookie: directorCookie });
  await d.opened;
  assert.equal((await d.send({ t: 'obs', action: 'preview', scene: 'GUEST' })).ok, true);
  assert.equal(mock.state.preview, 'GUEST');
  assert.equal((await d.send({ t: 'obs', action: 'take' })).ok, true);
  assert.equal(mock.state.program, 'GUEST');
  mock.state.studioMode = false;
  await app.obs.refresh();
  d.close();
});

test('stream start/stop needs explicit confirmation; recording toggles', async () => {
  const d = client(D, { cookie: directorCookie });
  await d.opened;
  const no = await d.send({ t: 'obs', action: 'stream', on: true });
  assert.equal(no.ok, false);
  assert.equal(mock.state.stream, false);
  assert.equal((await d.send({ t: 'obs', action: 'stream', on: true, confirm: true })).ok, true);
  assert.equal(mock.state.stream, true);
  await d.next(m => m.t === 'state' && m.s.obs.stream.active);
  assert.equal((await d.send({ t: 'obs', action: 'record', on: true })).ok, true);
  assert.equal(mock.state.record, true);
  await d.send({ t: 'obs', action: 'record', on: false });
  d.close();
});

test('host gets rundown and tally but no OBS data, and every control is refused', async () => {
  const hst = client(G, { cookie: hostCookie });
  await hst.opened;
  const { s } = await hst.next(m => m.t === 'state');
  assert.equal(s.obs, undefined);
  assert.equal(s.overlayKey, undefined);
  assert.equal(s.vdo.view, undefined, 'host does not get the OBS view link');
  assert.ok(s.vdo.push.startsWith('https://vdo.ninja/?push='));
  assert.equal(typeof s.tally.onAir, 'boolean');
  assert.ok(s.rundown.segments.length > 5);

  const before = mock.log.length;
  for (const msg of [
    { t: 'obs', action: 'program', scene: 'VIENNA' },
    { t: 'obs', action: 'stream', on: false, confirm: true },
    { t: 'emergency', action: 'standby' },
    { t: 'emergency', action: 'endStream', confirm: true },
    { t: 'rundown', action: 'next' },
    { t: 'gfx', action: 'lower', on: true, title: 'x' },
    { t: 'note', text: 'x' },
    { t: 'music', title: 'x' },
  ]) {
    const ack = await hst.send(msg);
    assert.equal(ack.ok, false, `host must not be allowed: ${JSON.stringify(msg)}`);
    assert.match(ack.error, /Not allowed/);
  }
  const sent = mock.log.slice(before).map(r => r.requestType);
  assert.ok(!sent.some(t => /^(Set|Start|Stop|Trigger)/.test(t)), 'no OBS write reached OBS from the host: ' + sent.join(','));
  hst.close();
});

test('private chat between director and host, persisted on disk', async () => {
  const d = client(D, { cookie: directorCookie }), hst = client(G, { cookie: hostCookie });
  await Promise.all([d.opened, hst.opened]);
  await hst.next(m => m.t === 'chat.history');
  assert.equal((await hst.send({ t: 'chat.send', text: 'G\'day Vienna <script>alert(1)</script>' })).ok, true);
  const got = await d.next(m => m.t === 'chat' && m.msg.from === 'host');
  assert.equal(got.msg.text, 'G\'day Vienna <script>alert(1)</script>', 'stored verbatim; the page renders it as text');
  await d.send({ t: 'chat.send', text: 'Servus Melbourne' });
  const back = await hst.next(m => m.t === 'chat' && m.msg.from === 'director');
  assert.equal(back.msg.text, 'Servus Melbourne');
  assert.equal((await d.send({ t: 'chat.send', text: '   ' })).ok, false);
  await hst.send({ t: 'chat.read', upTo: back.msg.id });
  await d.next(m => m.t === 'state' && m.s.read.host === back.msg.id);
  app.studio.flush();
  const onDisk = JSON.parse(fs.readFileSync(path.join(dataDir, 'chat.json'), 'utf8'));
  assert.ok(onDisk.some(m => m.text === 'Servus Melbourne'));
  assert.equal((fs.statSync(path.join(dataDir, 'chat.json')).mode & 0o077), 0, 'chat file is owner-only');
  d.close(); hst.close();
});

test('rundown, notes and music reach the host', async () => {
  const d = client(D, { cookie: directorCookie }), hst = client(G, { cookie: hostCookie });
  await Promise.all([d.opened, hst.opened]);
  await d.send({ t: 'rundown', action: 'reset' });
  assert.equal((await d.send({ t: 'rundown', action: 'next' })).ok, true);
  const st = await hst.next(m => m.t === 'state' && m.s.rundown.index === 0 && m.s.rundown.showStartedAt);
  assert.equal(st.s.rundown.segments[0].title, 'Opening Titles');
  await d.send({ t: 'rundown', action: 'go', index: 3 });
  await hst.next(m => m.t === 'state' && m.s.rundown.index === 3);
  await d.send({ t: 'note', text: 'Stretch two minutes' });
  await hst.next(m => m.t === 'state' && m.s.note === 'Stretch two minutes');
  await d.send({ t: 'music', artist: 'DJ Andy\'K', title: 'Three-Note Signature' });
  await hst.next(m => m.t === 'state' && m.s.music.title === 'Three-Note Signature');
  assert.equal((await d.send({ t: 'rundown', action: 'go', index: 99 })).ok, false);
  d.close(); hst.close();
});

test('emergency: standby scene, mics off (not the DJ mixer), end stream', async () => {
  const d = client(D, { cookie: directorCookie }), hst = client(G, { cookie: hostCookie });
  await Promise.all([d.opened, hst.opened]);
  await d.send({ t: 'obs', action: 'program', scene: 'MUSIC' });
  assert.equal((await d.send({ t: 'emergency', action: 'standby' })).ok, true);
  assert.equal(mock.state.program, 'STANDBY');
  await hst.next(m => m.t === 'alert');

  const r = await d.send({ t: 'emergency', action: 'mics' });
  assert.equal(r.ok, true);
  const muted = Object.fromEntries(mock.inputs.filter(i => i.audio).map(i => [i.inputName, i.muted]));
  assert.equal(muted['Mic // Andrej'], true);
  assert.equal(muted['VDO // Georgie'], true);
  assert.equal(muted['DJ Mixer'], false, 'music keeps playing');
  for (const n of ['Mic // Andrej', 'VDO // Georgie']) await d.send({ t: 'obs', action: 'mute', input: n, muted: false });

  if (!mock.state.stream) await d.send({ t: 'obs', action: 'stream', on: true, confirm: true });
  assert.equal((await d.send({ t: 'emergency', action: 'endStream' })).ok, false);
  assert.equal((await d.send({ t: 'emergency', action: 'endStream', confirm: true })).ok, true);
  assert.equal(mock.state.stream, false);
  d.close(); hst.close();
});

test('overlay: key required, graphics only', async () => {
  await assert.rejects(client(D, { query: '?overlay=wrong' }).opened, /401/);
  await assert.rejects(client(G, { query: '?overlay=' + app.secrets.overlayKey }).opened, /401/, 'overlay key does not work on the host port');
  const o = client(D, { query: '?overlay=' + encodeURIComponent(app.secrets.overlayKey) });
  await o.opened;
  const { s } = await o.next(m => m.t === 'state');
  assert.deepEqual(Object.keys(s).sort(), ['gfx', 'segment', 'show']);
  assert.equal((await o.send({ t: 'chat.send', text: 'hi' })).ok, false);
  const d = client(D, { cookie: directorCookie });
  await d.opened;
  await d.send({ t: 'gfx', action: 'lower', on: true, title: 'Georgie Walker', subtitle: 'Melbourne', side: 'melbourne' });
  const lt = await o.next(m => m.t === 'state' && m.s.gfx.lowerThird.visible);
  assert.equal(lt.s.gfx.lowerThird.title, 'Georgie Walker');
  await d.send({ t: 'gfx', action: 'clear' });
  o.close(); d.close();
});

test('wrong OBS password is reported, not retried in a tight loop', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dz-studio-test-'));
  const other = await startStudio({ config: config(mock.port), dataDir: dir, obsPassword: 'wrong', log: quiet });
  await until(() => other.obs.state.status === 'auth-failed');
  assert.match(other.obs.state.error, /password/);
  await other.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('OBS outside this machine is refused', async () => {
  const c = config(4455);
  c.obs.url = 'ws://192.168.1.20:4455';
  await assert.rejects(startStudio({ config: c, dataDir: os.tmpdir(), log: quiet }), /not on this machine/);
});
