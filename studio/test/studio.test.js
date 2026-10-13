// End-to-end tests: the real studio server against the mock OBS, over real HTTP and WebSockets.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { startStudio, loadConfig } from '../server.js';
import { startMockObs } from './mock-obs.js';
import { showClock, plan } from '../public/static/clock.js';

const quiet = { log() {}, warn() {} };
let mock, app, dataDir, D, G, directorCookie, hostCookie;

function config(obsPort) {
  const c = loadConfig();
  c.director = { host: '127.0.0.1', port: 0 };
  c.guest = { host: '127.0.0.1', port: 0 };
  c.obs = { url: `ws://127.0.0.1:${obsPort}` };
  c.call = { ...c.call, graceMs: 400 };
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
    if (m.t === 'check.echo') ws.send(JSON.stringify({ t: 'check.echo', nonce: m.nonce }));
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
        setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); reject(new Error('timed out waiting for message: ' + pred.toString().slice(0, 140))); }, ms);
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
  { // the director code on the host port gives no session there, only a hand-over to the Director listener on this Mac
    const r = await login(G, app.secrets.directorCode);
    assert.equal(r.cookie, '', 'no director session on the host port');
    assert.match(r.body.next, /^http:\/\/127\.0\.0\.1:\d+\/handoff#t=/);
  }
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

/* ---------- Phase 1 redesign: gallery switcher, monitors, show tools ---------- */

test('preview bus without Studio Mode: CUT is a hard cut and puts the transition back, TAKE uses it', async () => {
  const d = client(D, { cookie: directorCookie });
  await d.opened;
  await d.send({ t: 'obs', action: 'program', scene: 'VIENNA' });
  assert.equal((await d.send({ t: 'obs', action: 'preview', scene: 'MELBOURNE' })).ok, true);
  assert.equal(mock.state.program, 'VIENNA', 'choosing a preview never touches the air');
  await d.next(m => m.t === 'state' && m.s.obs.previewScene === 'MELBOURNE');

  const from = mock.log.length;
  assert.equal(mock.state.transition, 'Überblende');
  assert.equal((await d.send({ t: 'obs', action: 'cut' })).ok, true);
  assert.equal(mock.state.program, 'MELBOURNE');
  const seq = mock.log.slice(from).filter(r => /^Set(CurrentSceneTransition|CurrentProgramScene)$/.test(r.requestType))
    .map(r => r.requestData.transitionName || r.requestData.sceneName);
  assert.deepEqual(seq, ['Schnitt', 'MELBOURNE', 'Überblende'], 'cut found by kind (German OBS), then the fade restored');
  assert.equal(mock.state.transition, 'Überblende');
  await d.next(m => m.t === 'state' && m.s.obs.previewScene === 'VIENNA' && m.s.obs.program === 'MELBOURNE');

  const from2 = mock.log.length;
  assert.equal((await d.send({ t: 'obs', action: 'auto' })).ok, true);
  assert.equal(mock.state.program, 'VIENNA');
  assert.ok(!mock.log.slice(from2).some(r => r.requestType === 'SetCurrentSceneTransition'), 'TAKE keeps the chosen transition');
  d.close();
});

test('transition choice and duration', async () => {
  const d = client(D, { cookie: directorCookie });
  await d.opened;
  await d.send({ t: 'obs', action: 'transition', name: 'Stinger // D//0' });
  assert.equal(mock.state.transition, 'Stinger // D//0');
  await d.next(m => m.t === 'state' && m.s.obs.transition === 'Stinger // D//0');
  assert.equal((await d.send({ t: 'obs', action: 'duration', ms: 800 })).ok, false, 'fixed-length transition');
  await d.send({ t: 'obs', action: 'transition', name: 'Überblende' });
  await d.next(m => m.t === 'state' && m.s.obs.transition === 'Überblende');
  assert.equal((await d.send({ t: 'obs', action: 'duration', ms: 500 })).ok, true);
  assert.equal(mock.state.duration, 500);
  assert.equal((await d.send({ t: 'obs', action: 'transition', name: 'Nope' })).ok, false);
  d.close();
});

test('monitors only on request; the preview bus goes to the director only', async () => {
  const d = client(D, { cookie: directorCookie }), hst = client(G, { cookie: hostCookie });
  await Promise.all([d.opened, hst.opened]);
  await new Promise(r => setTimeout(r, 400));
  assert.ok(!d.msgs.some(m => m.t === 'frame'), 'no screenshots unless a monitor is open');
  await d.send({ t: 'monitors', on: true });
  const f = await d.next(m => m.t === 'frame' && m.which === 'program');
  assert.match(f.img, /^data:image\//);
  assert.equal(f.scene, mock.state.program);
  await d.next(m => m.t === 'frame' && m.which === 'preview');
  // Georgie's dashboard shows CAMERA 01 · LIVE PROGRAM · CAMERA 02 (watch only), never the preview bus
  assert.equal((await hst.send({ t: 'monitors', on: true })).ok, true);
  await new Promise(r => setTimeout(r, 1200));
  assert.ok(hst.msgs.some(m => m.t === 'frame'));
  assert.ok(!hst.msgs.some(m => m.t === 'frame' && m.which === 'preview'));
  await hst.send({ t: 'monitors', on: false });
  await d.send({ t: 'monitors', on: false });
  d.close(); hst.close();
});

test('faders and the jingle cart', async () => {
  const d = client(D, { cookie: directorCookie });
  await d.opened;
  const { s } = await d.next(m => m.t === 'state' && m.s.obs.media.length);
  assert.deepEqual(s.obs.media.map(m => m.name), ['Jingle // D//0 Sting', 'Jingle // Ösi vs Aussie', 'Bed // Talk Underscore', 'Jingle Player', 'Video Player']);
  assert.equal((await d.send({ t: 'obs', action: 'volume', input: 'DJ Mixer', db: -6 })).ok, true);
  assert.equal(mock.inputs.find(i => i.inputName === 'DJ Mixer').volumeDb, -6);
  await d.next(m => m.t === 'state' && m.s.obs.audio.find(a => a.name === 'DJ Mixer').volumeDb === -6);
  await d.send({ t: 'obs', action: 'volume', input: 'DJ Mixer', db: 0 });
  assert.equal((await d.send({ t: 'obs', action: 'media', input: 'Jingle // D//0 Sting', media: 'play' })).ok, true);
  assert.ok(mock.state.media['Jingle // D//0 Sting']);
  await d.next(m => m.t === 'state' && m.s.obs.media.find(x => x.name === 'Jingle // D//0 Sting').state === 'playing');
  await d.send({ t: 'obs', action: 'media', input: 'Jingle // D//0 Sting', media: 'stop' });
  assert.equal(mock.state.media['Jingle // D//0 Sting'], undefined);
  assert.equal((await d.send({ t: 'obs', action: 'media', input: 'Mic // Andrej', media: 'play' })).ok, false);
  d.close();
});

test('rundown editing keeps the on-air segment and reaches Georgie', async () => {
  const d = client(D, { cookie: directorCookie }), hst = client(G, { cookie: hostCookie });
  await Promise.all([d.opened, hst.opened]);
  await d.send({ t: 'rundown', action: 'go', index: 2 });
  const onAir = (await d.next(m => m.t === 'state' && m.s.rundown.index === 2)).s.rundown.segments[2].id;
  const add = await d.send({ t: 'rundown', action: 'add', index: 0 });
  assert.equal(add.ok, true); assert.equal(add.result.index, 1);
  let st = (await d.next(m => m.t === 'state' && m.s.rundown.segments[1]?.title === 'New segment')).s.rundown;
  assert.equal(st.segments[st.index].id, onAir, 'inserting above does not change what is on air');
  assert.equal(st.sample, false, 'an edited rundown is no longer the sample');
  await d.send({ t: 'rundown', action: 'update', index: 1, fields: { title: 'Weather // Two Hemispheres', minutes: 3.5, lead: 'georgie', kind: 'talk', notes: 'Georgie: 30°C. Andrej: snow.' } });
  st = (await hst.next(m => m.t === 'state' && m.s.rundown.segments[1]?.title === 'Weather // Two Hemispheres')).s.rundown;
  assert.deepEqual([st.segments[1].minutes, st.segments[1].lead, st.segments[1].kind], [3.5, 'georgie', 'TALK']);
  await d.send({ t: 'rundown', action: 'move', index: 1, to: 5 });
  st = (await d.next(m => m.t === 'state' && m.s.rundown.segments[5]?.title === 'Weather // Two Hemispheres')).s.rundown;
  assert.equal(st.segments[st.index].id, onAir);
  await d.send({ t: 'rundown', action: 'remove', index: 5 });
  await d.send({ t: 'rundown', action: 'title', title: 'Episode 1 // 27 January 2027' });
  st = (await hst.next(m => m.t === 'state' && m.s.rundown.title === 'Episode 1 // 27 January 2027')).s.rundown;
  assert.ok(!st.segments.some(s => s.title === 'Weather // Two Hemispheres'));
  assert.equal((await hst.send({ t: 'rundown', action: 'add' })).ok, false);
  assert.equal((await d.send({ t: 'rundown', action: 'update', index: 99, fields: {} })).ok, false);
  d.close(); hst.close();
});

test('reminders and the played-tracks log stay with the director', async () => {
  const d = client(D, { cookie: directorCookie }), hst = client(G, { cookie: hostCookie });
  await Promise.all([d.opened, hst.opened]);
  assert.equal((await d.send({ t: 'reminder', action: 'add', text: 'Check the YouTube title', at: Date.now() + 60000 })).ok, true);
  const { s } = await d.next(m => m.t === 'state' && m.s.reminders.some(r => r.text === 'Check the YouTube title'));
  const r = s.reminders.find(x => x.text === 'Check the YouTube title');
  await d.send({ t: 'reminder', action: 'toggle', rid: r.id });
  await d.next(m => m.t === 'state' && m.s.reminders.find(x => x.id === r.id)?.done);
  await d.send({ t: 'reminder', action: 'remove', rid: r.id });
  await d.send({ t: 'music', artist: 'Georgie\'s pick', title: 'Track A' });
  await d.next(m => m.t === 'state' && m.s.musicLog[0]?.title === 'Track A');
  const hs = (await hst.next(m => m.t === 'state')).s;
  assert.equal(hs.reminders, undefined); assert.equal(hs.musicLog, undefined);
  assert.equal((await hst.send({ t: 'reminder', action: 'add', text: 'x' })).ok, false);
  assert.equal((await hst.send({ t: 'settings', micInputs: [] })).ok, false);
  d.close(); hst.close();
});

test('microphones tagged by hand drive Mics off; standby scene is a setting', async () => {
  const d = client(D, { cookie: directorCookie });
  await d.opened;
  await d.send({ t: 'settings', micInputs: ['Mic // Andrej'] });
  const { s } = await d.next(m => m.t === 'state' && m.s.settings.micMode === 'list');
  assert.deepEqual(s.obs.audio.filter(a => a.mic).map(a => a.name), ['Mic // Andrej']);
  await d.send({ t: 'emergency', action: 'mics' });
  assert.equal(mock.inputs.find(i => i.inputName === 'Mic // Andrej').muted, true);
  assert.equal(mock.inputs.find(i => i.inputName === 'VDO // Georgie').muted, false, 'untagged now');
  await d.send({ t: 'obs', action: 'mute', input: 'Mic // Andrej', muted: false });
  await d.send({ t: 'settings', micInputs: null });
  await d.next(m => m.t === 'state' && m.s.settings.micMode === 'pattern' && m.s.obs.audio.find(a => a.name === 'VDO // Georgie').mic);

  await d.send({ t: 'settings', standbyScene: 'CREDITS' });
  await d.next(m => m.t === 'state' && m.s.standby.scene === 'CREDITS' && m.s.standby.exists);
  await d.send({ t: 'emergency', action: 'standby' });
  assert.equal(mock.state.program, 'CREDITS');
  await d.send({ t: 'settings', standbyScene: '' });
  await d.next(m => m.t === 'state' && m.s.standby.scene === 'STANDBY');
  d.close();
});

test('event log records switching and emergencies for Technical Control', async () => {
  const d = client(D, { cookie: directorCookie });
  await d.opened;
  const hist = await d.next(m => m.t === 'log.history');
  assert.ok(hist.entries.some(e => /OBS connected/.test(e.text)));
  await d.send({ t: 'obs', action: 'preview', scene: 'GUEST' });
  await d.send({ t: 'obs', action: 'cut' });
  await d.next(m => m.t === 'log' && /CUT → GUEST/.test(m.entry.text));
  d.close();
});

/* ---------- Georgie link: calls, HELP, guidance ---------- */

test('private call: ring, accept, relay set-up only between the two people, hang up', async () => {
  const d = client(D, { cookie: directorCookie }), d2 = client(D, { cookie: directorCookie }), hst = client(G, { cookie: hostCookie });
  await Promise.all([d.opened, d2.opened, hst.opened]);
  const start = await hst.send({ t: 'call.start', video: true });
  assert.equal(start.ok, true, start.error);
  const cid = start.result.cid;
  await d.next(m => m.t === 'call.ring' && m.cid === cid && m.from === 'host');
  await d2.next(m => m.t === 'call.ring' && m.cid === cid);
  assert.equal((await hst.send({ t: 'call.start' })).ok, false, 'one call at a time');
  assert.equal((await hst.send({ t: 'call.accept', cid })).ok, false, 'cannot answer your own call');

  assert.equal((await d.send({ t: 'call.accept', cid })).ok, true);
  await hst.next(m => m.t === 'call.accepted' && m.cid === cid);
  await d2.next(m => m.t === 'call.end' && m.reason === 'answered in another window');

  const sdp = { type: 'offer', sdp: 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\n' };
  assert.equal((await hst.send({ t: 'call.signal', cid, sdp })).ok, true);
  assert.deepEqual((await d.next(m => m.t === 'call.signal' && m.sdp)).sdp, sdp);
  await d.send({ t: 'call.signal', cid, candidate: { candidate: 'candidate:1 1 udp 2122260223 192.0.2.1 54400 typ host', sdpMid: '0', sdpMLineIndex: 0 } });
  await hst.next(m => m.t === 'call.signal' && m.candidate?.sdpMid === '0');
  assert.equal((await d2.send({ t: 'call.signal', cid, sdp })).ok, false, 'a third window cannot inject into the call');
  assert.ok(!d2.msgs.some(m => m.t === 'call.signal'), 'nor listen to it');
  assert.equal((await hst.send({ t: 'call.signal', cid, sdp: { type: 'offer', sdp: 'x'.repeat(61000) } })).ok, false, 'oversized set-up message refused');

  await d.send({ t: 'call.media', cid, mic: false, cam: true, screen: true });
  const media = await hst.next(m => m.t === 'call.media');
  assert.deepEqual([media.mic, media.screen], [false, true]);
  const { s } = await d.next(m => m.t === 'state' && m.s.call?.phase === 'active');
  assert.equal(s.call.from, 'host');
  await d.send({ t: 'call.end', cid });
  await hst.next(m => m.t === 'call.end' && m.reason === 'hung up');
  await d.next(m => m.t === 'state' && m.s.call === null);
  d.close(); d2.close(); hst.close();
});

test('a call survives a short studio-connection drop, and ends if the side does not come back', async () => {
  const d = client(D, { cookie: directorCookie });
  await d.opened;
  await new Promise(r => setTimeout(r, 50));
  assert.match((await d.send({ t: 'call.start' })).error, /Georgie is not online/);
  const hst = client(G, { cookie: hostCookie });
  await hst.opened;
  const { result: { cid } } = await d.send({ t: 'call.start' });
  await hst.next(m => m.t === 'call.ring');
  await hst.send({ t: 'call.accept', cid });
  hst.close();
  await d.next(m => m.t === 'call.peer' && m.state === 'reconnecting');
  assert.ok(!d.msgs.some(m => m.t === 'call.end'), 'not ended straight away: the media is peer-to-peer');
  const back = client(G, { cookie: hostCookie });
  await back.opened;
  assert.equal((await back.send({ t: 'call.resume', cid })).ok, true);
  await d.next(m => m.t === 'call.peer' && m.state === 'back');
  assert.equal((await back.send({ t: 'call.signal', cid, candidate: { candidate: 'candidate:1 1 udp 1 192.0.2.1 1 typ host', sdpMid: '0', sdpMLineIndex: 0 } })).ok, true, 'signalling works again');
  back.close();
  await d.next(m => m.t === 'call.end' && m.reason === 'connection lost', 3000); // grace is 400 ms in the tests
  d.close();
});

test('HELP: three levels reach the director with diagnostics; Georgie sees the answer', async () => {
  const d = client(D, { cookie: directorCookie }), hst = client(G, { cookie: hostCookie });
  await Promise.all([d.opened, hst.opened]);
  const r = await hst.send({ t: 'help.raise', level: 'critical', text: 'No sound from Vienna', diag: { browser: 'Chrome', linkMs: 320, camera: true, junk: { deep: 1 } } });
  assert.equal(r.ok, true, r.error);
  const n = await d.next(m => m.t === 'help.new' && m.item.hid === r.result.hid);
  assert.equal(n.item.level, 'critical');
  assert.equal(n.item.diag.browser, 'Chrome');
  assert.equal(typeof n.item.diag.junk, 'string', 'nested objects are flattened to text');
  assert.equal((await d.send({ t: 'help.raise', level: 'normal', text: 'x' })).ok, false, 'the director does not raise help');
  assert.equal((await hst.send({ t: 'help.ack', hid: r.result.hid })).ok, false, 'Georgie cannot answer her own request');
  assert.equal((await hst.send({ t: 'help.raise', level: 'apocalyptic', text: 'y' })).ok, true);
  assert.equal((await d.next(m => m.t === 'help.new' && m.item.text === 'y')).item.level, 'normal', 'unknown levels become normal');

  await d.send({ t: 'help.ack', hid: r.result.hid });
  await hst.next(m => m.t === 'help.update' && m.item.status === 'ack');
  await hst.next(m => m.t === 'state' && m.s.help.find(x => x.hid === r.result.hid)?.status === 'ack');
  await d.send({ t: 'help.resolve', hid: r.result.hid });
  await hst.next(m => m.t === 'help.update' && m.item.status === 'resolved');
  const hs = (await hst.next(m => m.t === 'state')).s;
  assert.equal(hs.obs, undefined, 'still no OBS data for Georgie');
  for (const x of hs.help.filter(x => x.status !== 'resolved')) await hst.send({ t: 'help.cancel', hid: x.hid });
  d.close(); hst.close();
});

test('automatic requests: repeats fold together; dropping out while live raises a critical alert', async () => {
  const d = client(D, { cookie: directorCookie }), hst = client(G, { cookie: hostCookie });
  await Promise.all([d.opened, hst.opened]);
  const a = await hst.send({ t: 'help.raise', level: 'normal', kind: 'slow-link', auto: true, text: 'slow' });
  const b = await hst.send({ t: 'help.raise', level: 'urgent', kind: 'slow-link', auto: true, text: 'slower' });
  assert.equal(a.result.hid, b.result.hid);
  const rep = await d.next(m => m.t === 'help.new' && m.repeat);
  assert.equal(rep.item.count, 2); assert.equal(rep.item.level, 'urgent', 'escalates, never downgrades');
  await d.send({ t: 'help.resolve', hid: a.result.hid });

  if (!mock.state.stream) await d.send({ t: 'obs', action: 'stream', on: true, confirm: true });
  await d.next(m => m.t === 'state' && m.s.obs.stream.active);
  hst.close();
  const crit = await d.next(m => m.t === 'help.new' && m.item.kind === 'host-offline');
  assert.equal(crit.item.level, 'critical'); assert.equal(crit.item.by, 'studio');
  const back = client(G, { cookie: hostCookie });
  await back.opened;
  await d.next(m => m.t === 'state' && m.s.help.find(x => x.hid === crit.item.hid)?.status === 'resolved', 3000);
  await d.send({ t: 'obs', action: 'stream', on: false, confirm: true });
  d.close(); back.close();
});

test('guided assistance goes to Georgie only, from the director only', async () => {
  const d = client(D, { cookie: directorCookie }), hst = client(G, { cookie: hostCookie });
  await Promise.all([d.opened, hst.opened]);
  assert.equal((await d.send({ t: 'assist', guide: 'camera', text: 'Close FaceTime first' })).ok, true);
  const g = await hst.next(m => m.t === 'assist');
  assert.deepEqual([g.guide, g.text], ['camera', 'Close FaceTime first']);
  assert.equal((await d.send({ t: 'assist', guide: 'custom' })).ok, false, 'own instructions need text');
  assert.equal((await hst.send({ t: 'assist', guide: 'hold' })).ok, false);
  assert.ok(!d.msgs.some(m => m.t === 'assist'));
  d.close(); hst.close();
});


/* ---------- Phase 3: rehearsal mode, verified checks, recovery, notifications, report ---------- */

test('rehearsal never touches OBS and locks the stream and recording', async () => {
  const d = client(D, { cookie: directorCookie }), hst = client(G, { cookie: hostCookie });
  await Promise.all([d.opened, hst.opened]);
  if (mock.state.stream) await d.send({ t: 'obs', action: 'stream', on: false, confirm: true });
  if (mock.state.record) await d.send({ t: 'obs', action: 'record', on: false });
  const before = mock.log.length;
  assert.equal((await hst.send({ t: 'rehearsal.start' })).ok, false, 'Georgie cannot start a rehearsal');
  assert.equal((await d.send({ t: 'rehearsal.start' })).ok, true);
  await hst.next(m => m.t === 'state' && m.s.rehearsal.active);
  await new Promise(r => setTimeout(r, 300));
  const writes = mock.log.slice(before).map(r => r.requestType).filter(t => /^(Set|Start|Stop|Trigger|Toggle)/.test(t));
  assert.deepEqual(writes, [], 'starting a rehearsal sends no command to OBS');
  const s1 = await d.send({ t: 'obs', action: 'stream', on: true, confirm: true });
  assert.equal(s1.ok, false); assert.match(s1.error, /Rehearsal mode/);
  assert.equal((await d.send({ t: 'obs', action: 'record', on: true })).ok, false);
  assert.equal(mock.state.stream, false); assert.equal(mock.state.record, false);
  assert.equal((await d.send({ t: 'rehearsal.start' })).ok, false, 'one at a time');
  d.close(); hst.close();
});

test('checks pass only when verified; person checks need both people', async () => {
  const d = client(D, { cookie: directorCookie }), hst = client(G, { cookie: hostCookie });
  await Promise.all([d.opened, hst.opened]);
  assert.equal((await d.send({ t: 'rehearsal.check', check: 'auto' })).ok, true);
  const { s } = await d.next(m => m.t === 'state' && m.s.rehearsal.active && ['obs', 'director', 'host', 'safety'].every(k => m.s.rehearsal.checks[k].status === 'pass'));
  const ch = s.rehearsal.checks;
  assert.match(ch.obs.detail, /answered in \d+ ms/);
  assert.match(ch.host.detail, /Round trip \d+ ms on this Mac/);
  assert.equal(ch.tunnel.status, 'warn', 'no public link running is a warning, never a pass');
  for (const k of ['camera', 'mic', 'playback', 'call', 'screen', 'help']) assert.equal(ch[k].status, 'untested', `${k} is not passed without verification`);
  assert.equal((await d.send({ t: 'rehearsal.check', check: 'camera' })).ok, false, 'camera cannot be "auto-passed"');

  await hst.send({ t: 'check.result', check: 'camera', ok: true, detail: 'MacBook camera' });
  let c = (await d.next(m => m.t === 'state' && m.s.rehearsal.checks.camera.status === 'warn')).s.rehearsal.checks.camera;
  assert.match(c.detail, /waiting for Andrej/);
  await d.send({ t: 'check.result', check: 'camera', ok: true, detail: 'FaceTime HD' });
  await d.next(m => m.t === 'state' && m.s.rehearsal.checks.camera.status === 'pass');
  await hst.send({ t: 'check.result', check: 'mic', ok: false, detail: 'NotAllowedError' });
  await d.next(m => m.t === 'state' && m.s.rehearsal.checks.mic.status === 'fail');
  await d.next(m => m.t === 'notify' && /microphone is not working/.test(m.text));
  await hst.send({ t: 'check.result', check: 'mic', ok: true, detail: 'AirPods' });
  await d.send({ t: 'check.result', check: 'mic', ok: true, detail: 'Shure' });
  await d.next(m => m.t === 'state' && m.s.rehearsal.checks.mic.status === 'pass');
  assert.equal((await hst.send({ t: 'check.result', check: 'call', ok: true })).ok, true);
  assert.equal((await d.next(m => m.t === 'state')).s.rehearsal.checks.call.status, 'untested', 'a person cannot self-report the call as working');

  const askd = await d.send({ t: 'rehearsal.ask', items: ['camera', 'playback', 'help'] });
  assert.equal(askd.ok, true);
  assert.deepEqual((await hst.next(m => m.t === 'check.request')).items, ['camera', 'playback', 'help']);

  const h = await hst.send({ t: 'help.raise', level: 'normal', text: 'Rehearsal test', kind: 'test' });
  await d.next(m => m.t === 'state' && m.s.rehearsal.checks.help.status === 'warn');
  await d.send({ t: 'help.ack', hid: h.result.hid });
  await d.next(m => m.t === 'state' && m.s.rehearsal.checks.help.status === 'pass');

  const { result: { cid } } = await hst.send({ t: 'call.start' });
  await d.next(m => m.t === 'call.ring');
  await d.send({ t: 'call.accept', cid });
  await hst.send({ t: 'call.stats', cid, stats: { rtt: 42, fps: 30, route: 'direct (peer-to-peer)' } });
  await d.next(m => m.t === 'state' && m.s.rehearsal.checks.call.status === 'warn');
  await d.send({ t: 'call.stats', cid, stats: { rtt: 40, fps: 29, route: 'direct (peer-to-peer)', peerScreen: true } });
  const cs = (await d.next(m => m.t === 'state' && m.s.rehearsal.checks.call.status === 'pass' && m.s.rehearsal.checks.screen.status === 'pass')).s.rehearsal.checks;
  assert.match(cs.screen.detail, /Georgie → Vienna/);
  await d.send({ t: 'call.end', cid });
  d.close(); hst.close();
});

test('public link: measured from the internet side, full link only for the director', async () => {
  const d = client(D, { cookie: directorCookie }), hst = client(G, { cookie: hostCookie });
  await Promise.all([d.opened, hst.opened]);
  assert.match((await d.send({ t: 'tunnel.link' })).error, /No public link/);
  // stand-in for the launcher: the "public" address is the host port itself
  fs.writeFileSync(path.join(dataDir, 'tunnel.json'), JSON.stringify({ url: G, pid: process.pid }));
  const link = await d.send({ t: 'tunnel.link' });
  assert.equal(link.ok, true);
  assert.equal(link.result.link, `${G}/login#code=${app.secrets.hostCode}`);
  assert.equal((await hst.send({ t: 'tunnel.link' })).ok, false, 'Georgie cannot read the link or code');
  await d.send({ t: 'rehearsal.check', check: 'tunnel' });
  await d.next(m => m.t === 'state' && m.s.rehearsal.checks.tunnel.status === 'pass' && /answers from the internet/.test(m.s.rehearsal.checks.tunnel.detail));
  fs.unlinkSync(path.join(dataDir, 'tunnel.json'));
  await d.send({ t: 'rehearsal.check', check: 'tunnel' });
  await d.next(m => m.t === 'state' && m.s.rehearsal.checks.tunnel.status === 'warn');
  d.close(); hst.close();
});

test('notifications: Georgie and Andrej coming and going', async () => {
  await until(() => ![...app.studio.clients].some(c => c.role === 'host')); // earlier tests' windows have closed
  const d = client(D, { cookie: directorCookie });
  await d.opened;
  const hst = client(G, { cookie: hostCookie });
  await hst.opened;
  await d.next(m => m.t === 'notify' && m.kind === 'host-up' && /Georgie connected/.test(m.text));
  hst.close();
  await d.next(m => m.t === 'notify' && m.kind === 'host-down');
  const h2 = client(G, { cookie: hostCookie });
  await h2.opened;
  d.close();
  await h2.next(m => m.t === 'notify' && m.kind === 'director-down');
  const d2 = client(D, { cookie: directorCookie });
  await d2.opened;
  await h2.next(m => m.t === 'notify' && m.kind === 'director-up');
  h2.close(); d2.close();
});

test('report: interruptions, HELP, checks and outstanding issues; download for the director only', async () => {
  const d = client(D, { cookie: directorCookie });
  await d.opened;
  const end = await d.send({ t: 'rehearsal.end' });
  assert.equal(end.ok, true, end.error);
  const id = end.result.id;
  const { s } = await d.next(m => m.t === 'state' && !m.s.rehearsal.active && m.s.reports[0]?.id === id);
  assert.ok(s.reports[0].summary.passed >= 8);
  const json = await fetch(`${D}/reports/${id}.json`, { headers: { Cookie: directorCookie } });
  assert.equal(json.status, 200);
  assert.match(json.headers.get('content-disposition'), /attachment; filename="DISTANCE-ZERO-rehearsal-/);
  const r = await json.json();
  assert.equal(r.recordings, 'none');
  assert.ok(r.interruptions.some(i => i.what === 'Georgie\'s dashboard offline' && i.to), 'her drop and return are one closed interruption');
  assert.ok(r.interruptions.some(i => i.what === 'Director Studio offline'));
  assert.ok(r.help.some(h => h.text === 'Rehearsal test' && h.ackAt));
  assert.ok(r.outstanding.some(o => /Not tested: Audio playback/.test(o)), 'untested checks are listed as outstanding');
  assert.ok(r.outstanding.some(o => /headphones/.test(o)));
  assert.ok(r.checks.find(c => c.id === 'camera').status === 'pass');
  const html = await (await fetch(`${D}/reports/${id}.html`, { headers: { Cookie: directorCookie } })).text();
  assert.match(html, /Rehearsal report/); assert.match(html, /No audio or video was recorded/);
  assert.equal((await fetch(`${D}/reports/${id}.html`)).status, 401, 'needs the director session');
  assert.equal((await fetch(`${G}/reports/${id}.html`, { headers: { Cookie: hostCookie } })).status, 404, 'not on the host port');
  assert.equal((await fetch(`${D}/reports/..%2Fsecrets.json`, { headers: { Cookie: directorCookie } })).status, 404);
  assert.equal((await d.send({ t: 'obs', action: 'record', on: true })).ok, true, 'lock released after the rehearsal');
  await d.send({ t: 'obs', action: 'record', on: false });
  d.close();
});

test('a public link that changes address between two probes still warns "NEW link"', async () => {
  const { watchTunnel } = await import('../lib/tunnel.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dz-tunnel-'));
  const seen = [];
  fs.writeFileSync(path.join(dir, 'tunnel.json'), JSON.stringify({ url: G, pid: process.pid }));
  const w = watchTunnel({ dataDir: dir, every: 60000, onChange: st => seen.push(st) });
  await until(async () => (await w.check()).up);
  assert.equal(w.status.newAddress, false, 'the first address is not "new"');
  fs.writeFileSync(path.join(dir, 'tunnel.json'), JSON.stringify({ url: D, pid: process.pid })); // restarted elsewhere, never seen down
  const st = await w.check();
  assert.equal(st.up, true); assert.equal(st.newAddress, true);
  assert.ok(seen.at(-1).newAddress);
  w.stop(); fs.rmSync(dir, { recursive: true, force: true });
});

test('a rehearsal and its stream lock survive a studio restart', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dz-restart-'));
  const one = await startStudio({ config: config(mock.port), dataDir: dir, obsPassword: 'test-pass', log: quiet });
  await until(() => one.obs.state.connected);
  const base = `http://127.0.0.1:${one.director.port}`;
  const ck = (await login(base, one.secrets.directorCode)).cookie;
  const d = client(base, { cookie: ck });
  await d.opened;
  assert.equal((await d.send({ t: 'rehearsal.start' })).ok, true);
  d.close();
  await one.close();
  const two = await startStudio({ config: config(mock.port), dataDir: dir, obsPassword: 'test-pass', log: quiet });
  await until(() => two.obs.state.connected);
  const base2 = `http://127.0.0.1:${two.director.port}`;
  const d2 = client(base2, { cookie: ck });
  await d2.opened;
  const { s } = await d2.next(m => m.t === 'state');
  assert.equal(s.rehearsal.active, true, 'still rehearsing after the restart');
  const r = await d2.send({ t: 'obs', action: 'stream', on: true, confirm: true });
  assert.equal(r.ok, false); assert.match(r.error, /Rehearsal mode/);
  assert.equal(mock.state.stream, false);
  const end = await d2.send({ t: 'rehearsal.end' });
  assert.equal(end.ok, true);
  d2.close(); await two.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('rundown templates: save per episode, load only with the clock stopped, delete; host cannot touch them', async () => {
  const d = client(D, { cookie: directorCookie }), hst = client(G, { cookie: hostCookie });
  await Promise.all([d.opened, hst.opened]);
  await d.send({ t: 'rundown', action: 'reset' });
  await d.send({ t: 'rundown', action: 'title', title: 'Episode 001 — Opening night' });
  const saved = await d.send({ t: 'rundown', action: 'saveTemplate', name: 'Episode 001' });
  assert.equal(saved.ok, true);
  const st = await d.next(m => m.t === 'state' && m.s.templates?.some(t => t.name === 'Episode 001'));
  const tpl = st.s.templates.find(t => t.name === 'Episode 001');
  assert.equal(tpl.id, 'episode-001');
  assert.ok(tpl.segments > 0);
  assert.ok(fs.existsSync(path.join(dataDir, 'rundowns', 'episode-001.json')));
  // change the rundown, then bring the template back
  await d.send({ t: 'rundown', action: 'title', title: 'Something else' });
  const loaded = await d.send({ t: 'rundown', action: 'loadTemplate', template: 'episode-001' });
  assert.equal(loaded.ok, true, JSON.stringify(loaded));
  await d.next(m => m.t === 'state' && m.s.rundown.title === 'Episode 001 — Opening night' && !m.s.rundown.sample);
  // not while the show clock runs
  await d.send({ t: 'rundown', action: 'next' });
  const blocked = await d.send({ t: 'rundown', action: 'loadTemplate', template: 'episode-001' });
  assert.equal(blocked.ok, false);
  await d.send({ t: 'rundown', action: 'reset' });
  // ids are checked: no path tricks
  assert.equal((await d.send({ t: 'rundown', action: 'loadTemplate', template: '../secrets' })).ok, false);
  // the host has no access to templates
  assert.equal((await hst.send({ t: 'rundown', action: 'saveTemplate', name: 'x' })).ok, false);
  assert.equal((await d.send({ t: 'rundown', action: 'deleteTemplate', template: 'episode-001' })).ok, true);
  assert.ok(!fs.existsSync(path.join(dataDir, 'rundowns', 'episode-001.json')));
  d.close(); hst.close();
});

test('one sign-in page: the Director code on the public page hands over to this Mac with a one-time ticket', async () => {
  const codes = JSON.parse(fs.readFileSync(path.join(dataDir, 'secrets.json'), 'utf8'));
  const post = (base, p, body, headers = {}) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  // Georgie's code on the public page: her own session, no hand-over
  const hr = await post(G, '/login', { code: codes.hostCode });
  const hj = await hr.json();
  assert.equal(hj.ok, true); assert.equal(hj.next, undefined); assert.match(hr.headers.get('set-cookie') || '', /dz_host=/);
  // the Director code on the public page: no Director session there, a ticket for the local Director listener
  const dr = await post(G, '/login', { code: codes.directorCode });
  const dj = await dr.json();
  assert.equal(dj.role, 'director'); assert.equal(dr.headers.get('set-cookie'), null);
  const t = new URLSearchParams(new URL(dj.next).hash.slice(1)).get('t');
  assert.ok(new URL(dj.next).hostname === '127.0.0.1');
  // through a proxy (= from the internet) the hand-over is refused
  assert.equal((await post(D, '/handoff', { t }, { 'x-forwarded-for': '203.0.113.9' })).status, 403);
  const ok = await post(D, '/handoff', { t });
  assert.equal(ok.status, 200); assert.match(ok.headers.get('set-cookie') || '', /dz_director=/);
  assert.equal((await post(D, '/handoff', { t })).status, 401, 'a ticket works once');
  assert.equal((await post(D, '/handoff', { t: 'made-up' })).status, 401);
  // the host page never opens the Director Studio
  assert.equal((await post(G, '/handoff', { t })).status, 404);
});

test('show presets: SELECT SHOW loads OBS scene collection, rundown, mics, standby and graphics; kept on disk', async () => {
  const d = client(D, { cookie: directorCookie }), ov = client(D, { query: '?overlay=' + encodeURIComponent(app.secrets.overlayKey) });
  await Promise.all([d.opened, ov.opened]);
  await d.send({ t: 'rundown', action: 'reset' });
  const st0 = await d.next(m => m.t === 'state' && Array.isArray(m.s.shows));
  assert.deepEqual(st0.s.shows.map(x => x.id), ['sunday', 'friday']);
  // Sunday
  assert.equal((await d.send({ t: 'show.select', show: 'sunday' })).ok, true);
  const sun = await d.next(m => m.t === 'state' && m.s.showId === 'sunday');
  assert.equal(mock.state.collection, 'DZ — Sunday Show');
  assert.equal(sun.s.rundown.title, 'DISTANCE // ZERO — Sunday Show');
  assert.equal(sun.s.rundown.segments[0].title, 'SHOW STARTING SOON');
  assert.equal(sun.s.rundown.segments.reduce((a, x) => a + x.minutes, 0), 150, 'Sunday master: 150 minutes');
  assert.equal(sun.s.settings.micMode, 'list', 'the show\'s own microphone list');
  assert.equal(sun.s.settings.standbyScene, 'STANDBY');
  await ov.next(m => m.t === 'state' && m.s.gfx.tagline === 'Vienna // Melbourne' && m.s.gfx.clocks === true);
  // Friday: one host, its own rundown, collection and graphics
  assert.equal((await d.send({ t: 'show.select', show: 'friday' })).ok, true);
  const fri = await d.next(m => m.t === 'state' && m.s.showId === 'friday');
  assert.equal(mock.state.collection, "DJ Andy'K — Friday Show");
  assert.equal(fri.s.rundown.title, "DJ Andy'K — Friday DJ Show");
  assert.ok(fri.s.rundown.segments.every(x => x.lead === 'andrej'));
  assert.equal(fri.s.rundown.segments.reduce((a, x) => a + x.minutes, 0), 90, 'Friday master: 90 minutes');
  await ov.next(m => m.t === 'state' && m.s.gfx.tagline === "DJ Andy'K // Friday" && m.s.gfx.clocks === false);
  // kept across a restart: the choice is in state.json, the rundown in rundown.json
  await new Promise(r => setTimeout(r, 1200));
  assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'state.json'), 'utf8')).showId, 'friday');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'rundown.json'), 'utf8')).title, "DJ Andy'K — Friday DJ Show");
  // not while the show clock runs, and never while streaming
  await d.send({ t: 'rundown', action: 'next' });
  assert.equal((await d.send({ t: 'show.select', show: 'sunday' })).ok, false);
  await d.send({ t: 'rundown', action: 'reset' });
  assert.equal((await d.send({ t: 'show.select', show: 'nope' })).ok, false);
  // back to Sunday for the other tests
  await d.send({ t: 'show.select', show: 'sunday' });
  d.close(); ov.close();
});

test('episode scripts: copy of the master, private notes, versions, reviewed import, and the T−180 lock enforced by the server', async () => {
  const d = client(D, { cookie: directorCookie }), hst = client(G, { cookie: hostCookie });
  await Promise.all([d.opened, hst.opened]);
  await d.send({ t: 'rundown', action: 'reset' });
  // a new Sunday episode far in the future: editable
  const future = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const made = await d.send({ t: 'episode.new', format: 'sunday', date: future, start: '10:00' });
  assert.equal(made.ok, true, JSON.stringify(made));
  const st = await d.next(m => m.t === 'state' && m.s.rundown.episode?.date === future);
  const ep = st.s.rundown.episode, segs = st.s.rundown.segments;
  assert.match(ep.id, /^DZ-SUN-\d{8}$/); assert.equal(st.s.rundown.locked, false);
  assert.equal(segs.length, 14); assert.equal(segs[4].cues.jingle, '04'); assert.match(segs[2].script, /EPISODE-SPECIFIC/);
  // the master on disk is untouched by edits
  const master = fs.readFileSync(path.join(process.cwd(), 'shows', 'sunday.json'), 'utf8');
  const welcome = segs[2];
  assert.equal((await d.send({ t: 'script.update', segmentId: welcome.id, fields: { script: "ANDY'K: Servus Vienna!\nGEORGIE: G'day Melbourne!", director: 'Camera 1 first' } })).ok, true);
  assert.equal(fs.readFileSync(path.join(process.cwd(), 'shows', 'sunday.json'), 'utf8'), master, 'master never written');
  assert.match(fs.readFileSync(path.join(dataDir, 'episodes', ep.id + '.json'), 'utf8'), /Servus Vienna/);
  // Georgie sees the script but not the Director instructions; she cannot edit the script
  const hs = await hst.next(m => m.t === 'state' && m.s.rundown.segments[2]?.script?.includes('Servus'));
  assert.equal(hs.s.rundown.segments[2].director, undefined);
  assert.equal((await hst.send({ t: 'script.update', segmentId: welcome.id, fields: { script: 'x' } })).ok, false);
  // private notes: each sees only their own
  assert.equal((await d.send({ t: 'notes.set', segmentId: welcome.id, text: 'Andrej private' })).ok, true);
  assert.equal((await hst.send({ t: 'notes.set', segmentId: welcome.id, text: 'Georgie private' })).ok, true);
  const dn = await d.next(m => m.t === 'state' && m.s.myNotes?.[welcome.id] === 'Andrej private');
  assert.ok(!JSON.stringify(dn.s).includes('Georgie private'));
  const hn = await hst.next(m => m.t === 'state' && m.s.myNotes?.[welcome.id] === 'Georgie private');
  assert.ok(!JSON.stringify(hn.s).includes('Andrej private'));
  // import: parse gives a preview only; applying needs confirm
  const parsed = await d.send({ t: 'script.parse', text: 'WELCOME TO DISTANCE ZERO\nANDY\'K: Imported hello\nVIENNA × MELBOURNE\nGEORGIE: Imported story' });
  assert.equal(parsed.result.segments.length, 2);
  assert.equal((await d.send({ t: 'script.import', parts: parsed.result.segments })).ok, false, 'needs confirmation');
  assert.equal((await d.send({ t: 'script.import', parts: parsed.result.segments, confirm: true })).ok, true);
  await d.next(m => m.t === 'state' && m.s.rundown.segments[2].script.includes('Imported hello'));
  // version protection: the earlier text can be restored
  fs.mkdirSync(path.join(dataDir, 'episodes', ep.id + '.versions'), { recursive: true });
  const vfiles = fs.readdirSync(path.join(dataDir, 'episodes', ep.id + '.versions'));
  assert.ok(vfiles.length >= 1, 'a previous version was kept');
  assert.equal((await d.send({ t: 'script.restore' })).ok, true);
  // lock: a start time less than 180 minutes away is refused; an episode already inside the window is read-only
  const soon = new Date(Date.now() + 60 * 60000);
  const vienna = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Vienna', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(soon).split(' ');
  assert.equal((await d.send({ t: 'episode.meta', date: vienna[0], start: vienna[1] })).ok, false, 'cannot move the start into the lock window');
  // simulate an episode inside the window, written on disk (as after a restart), then opened
  const r = JSON.parse(fs.readFileSync(path.join(dataDir, 'episodes', ep.id + '.json'), 'utf8'));
  r.episode.id = 'DZ-SUN-LOCKTEST'; r.episode.date = vienna[0]; r.episode.start = vienna[1];
  fs.writeFileSync(path.join(dataDir, 'episodes', 'DZ-SUN-LOCKTEST.json'), JSON.stringify(r));
  { const o = await d.send({ t: 'episode.open', episode: 'DZ-SUN-LOCKTEST' }); assert.equal(o.ok, true, JSON.stringify(o)); }
  const lk = await d.next(m => m.t === 'state' && m.s.rundown.episode?.id === 'DZ-SUN-LOCKTEST');
  assert.equal(lk.s.rundown.locked, true);
  for (const m of [{ t: 'script.update', segmentId: lk.s.rundown.segments[2].id, fields: { script: 'late change' } }, { t: 'rundown', action: 'title', title: 'x' },
    { t: 'rundown', action: 'add' }, { t: 'script.restore' }, { t: 'episode.meta', title: 'x' }])
    assert.equal((await d.send(m)).ok, false, 'locked: ' + JSON.stringify(m));
  // still working while locked: reading, private notes, the segment advance
  assert.equal((await d.send({ t: 'notes.set', segmentId: 'x', text: 'still fine' })).ok, true);
  assert.equal((await d.send({ t: 'rundown', action: 'next' })).ok, true);
  await d.send({ t: 'rundown', action: 'reset' });
  // back to an editable future episode for the other tests
  await d.send({ t: 'episode.open', episode: ep.id });
  d.close(); hst.close();
});

test('script export to PDF and PDF import preview are Director-only and apply nothing', async () => {
  const hostTry = await fetch(G + '/script/print', { headers: { Cookie: hostCookie } });
  assert.notEqual(hostTry.status, 200);
  assert.equal((await fetch(D + '/script/print')).status, 403, 'needs a session');
  assert.equal((await fetch(D + '/script/print', { headers: { Cookie: directorCookie, 'X-Forwarded-For': '1.2.3.4' } })).status, 403, 'not through a proxy');
  const page = await (await fetch(D + '/script/print', { headers: { Cookie: directorCookie } })).text();
  assert.match(page, /SEGMENT 01 — /);
  const r = await fetch(D + '/script/export.pdf', { headers: { Cookie: directorCookie } });
  assert.equal(r.status, 200);
  const buf = Buffer.from(await r.arrayBuffer());
  if (r.headers.get('content-type') !== 'application/pdf') return; // no Chrome on this machine: printable page instead
  assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
  const imp = await fetch(D + '/script/import-pdf', { method: 'POST', headers: { Cookie: directorCookie, 'Content-Type': 'application/pdf' }, body: buf });
  const j = await imp.json();
  assert.equal(j.ok, true);
  assert.equal(j.missing.length, 0, 'every segment title is found again');
  const bad = await fetch(D + '/script/import-pdf', { method: 'POST', headers: { Cookie: directorCookie }, body: 'not a pdf' });
  assert.equal(bad.status, 422);
});

test('show clock: elapsed, remaining, overrun and ON TIME / AHEAD / BEHIND from the plan', () => {
  const segs = [{ title: 'A', minutes: 5 }, { title: 'B', minutes: 10 }, { title: 'C', minutes: 5 }];
  assert.deepEqual(plan(segs).map(x => x.end), [300, 900, 1200]);
  const t0 = 1_000_000_000_000;
  assert.equal(showClock(segs, { index: -1 }, t0).running, false);
  // B started exactly on plan, 2 min in
  let c = showClock(segs, { index: 1, showStartedAt: t0, segmentStartedAt: t0 + 300e3 }, t0 + 420e3);
  assert.equal(c.status, 'ON TIME'); assert.equal(c.remaining, 480); assert.equal(c.elapsed, 420); assert.equal(c.next.title, 'C');
  // B started 2:15 late
  c = showClock(segs, { index: 1, showStartedAt: t0, segmentStartedAt: t0 + 435e3 }, t0 + 440e3);
  assert.equal(c.label, '02:15 BEHIND SCHEDULE');
  // B started 1 min early
  c = showClock(segs, { index: 1, showStartedAt: t0, segmentStartedAt: t0 + 240e3 }, t0 + 250e3);
  assert.equal(c.status, 'AHEAD OF SCHEDULE');
  // B on time but running 40 s over
  c = showClock(segs, { index: 1, showStartedAt: t0, segmentStartedAt: t0 + 300e3 }, t0 + 940e3);
  assert.equal(c.overrun, 40); assert.equal(c.remaining, -40); assert.equal(c.status, 'BEHIND SCHEDULE');
});

test('linked cues and breaks: GO fires scene + video + jingle; a break mutes the mics; only RETURN TO LIVE brings them back', async () => {
  const d = client(D, { cookie: directorCookie }), hst = client(G, { cookie: hostCookie });
  await Promise.all([d.opened, hst.opened]);
  await d.send({ t: 'rundown', action: 'reset' });
  const mic = () => mock.inputs.find(i => i.inputName === 'Mic // Andrej');
  mic().muted = false; mock.inputs.find(i => i.inputName === 'VDO // Georgie').muted = false;
  await d.send({ t: 'obs', action: 'refresh' });
  // the host can see the clock but never fire cues or end a break
  assert.equal((await hst.send({ t: 'cue.go' })).ok, false);
  assert.equal((await hst.send({ t: 'break.return', confirm: true })).ok, false);
  // GO 01: SHOW STARTING SOON — STANDBY, the STARTING SOON card looping, jingle 18 (not available: reported, nothing faked)
  const g1 = await d.send({ t: 'cue.go', index: 0 });
  assert.equal(g1.ok, true, JSON.stringify(g1));
  assert.equal(mock.state.program, 'STANDBY');
  // into BREAK 01 (index 4): microphones muted first, BREAK scene, break loop
  const g = await d.send({ t: 'cue.go', index: 4 });
  assert.equal(g.ok, true, JSON.stringify(g));
  assert.equal(mock.state.program, 'BREAK');
  assert.equal(mic().muted, true, 'Mic // Andrej muted for the break');
  assert.equal(mock.inputs.find(i => i.inputName === 'VDO // Georgie').muted, true);
  assert.match(mock.inputs.find(i => i.inputName === 'Video Player').settings.local_file || '', /DZ_02/);
  const bs = await d.next(m => m.t === 'state' && m.s.brk?.active);
  assert.deepEqual(bs.s.brk.muted.sort(), ['Mic // Andrej', 'VDO // Georgie']);
  assert.deepEqual(bs.s.brk.isolation.micsLive, []);
  assert.deepEqual(bs.s.brk.isolation.camsOnAir, []);
  const hb = await hst.next(m => m.t === 'state' && m.s.brk?.active);
  assert.equal(hb.s.brk.next, 'MUSIC & STORIES'); assert.equal(hb.s.brk.isolation, undefined, 'no OBS details for the host');
  // nothing moves on by itself, and the normal NEXT is refused during a break
  assert.equal((await d.send({ t: 'rundown', action: 'next' })).ok, false);
  assert.equal((await d.send({ t: 'cue.go' })).ok, false);
  assert.equal((await d.send({ t: 'break.return' })).ok, false, 'needs confirmation');
  // RETURN TO LIVE: next scene, mics back on, WELCOME BACK jingle
  const r = await d.send({ t: 'break.return', confirm: true });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(mock.state.program, 'MUSIC'); assert.equal(mic().muted, false);
  assert.match(mock.inputs.find(i => i.inputName === 'Jingle Player').settings.local_file || '', /WELCOME BACK/i);
  const after = await d.next(m => m.t === 'state' && !m.s.brk?.active && m.s.rundown.index === 5);
  assert.equal(after.s.rundown.segments[after.s.rundown.index].title, 'MUSIC & STORIES');
  await d.send({ t: 'rundown', action: 'reset' });
  d.close(); hst.close();
});

test('host view: spoken script without [DIRECTOR] lines, cue titles by name, monitors are watch-only', async () => {
  const d = client(D, { cookie: directorCookie }), hst = client(G, { cookie: hostCookie });
  await Promise.all([d.opened, hst.opened]);
  const st = await d.next(m => m.t === 'state');
  const seg = st.s.rundown.segments[2];
  assert.equal((await d.send({ t: 'script.update', segmentId: seg.id, fields: { script: "ANDY'K: Hello\n[DIRECTOR] Camera 2 now\nGEORGIE: Hi" } })).ok, true);
  const hs = await hst.next(m => m.t === 'state' && m.s.rundown.segments[2]?.script?.includes('Hello'));
  assert.ok(!hs.s.rundown.segments[2].script.includes('[DIRECTOR]'));
  assert.equal(hs.s.media, undefined, 'no media files for the host');
  assert.equal((await hst.send({ t: 'monitors', on: 'live' })).ok, true);
  const frame = await hst.next(m => m.t === 'frame');
  assert.ok(['program', 'camA', 'camB'].includes(frame.which), 'never the preview bus');
  await hst.send({ t: 'monitors', on: false });
  d.close(); hst.close();
});

test('third seat: invitation, waiting room, ADMIT and TAKE ON AIR as separate steps; guest audio muted until on air; no access beyond the waiting room', async () => {
  const d = client(D, { cookie: directorCookie }), hst = client(G, { cookie: hostCookie });
  await Promise.all([d.opened, hst.opened]);
  const seat = () => mock.inputs.find(i => i.inputName === 'VDO // Guest'), item = () => mock.items.GUEST.find(i => i.sourceName === 'VDO // Guest');
  assert.equal((await hst.send({ t: 'guest.invite', name: 'X' })).ok, false, 'Georgie cannot invite');
  const inv = await d.send({ t: 'guest.invite', name: 'Ada Guest' });
  assert.equal(inv.ok, true, JSON.stringify(inv));
  const token = new URLSearchParams(inv.result.path.split('#')[1]).get('invite');
  assert.ok(token.length > 20);
  // the guest page is public; joining needs the invitation
  assert.equal((await fetch(G + '/guest')).status, 200);
  assert.equal((await fetch(D + '/guest/join', { method: 'POST', body: JSON.stringify({ invite: token }) })).status, 404, 'not on the director port');
  assert.equal((await fetch(G + '/guest/join', { method: 'POST', body: JSON.stringify({ invite: 'wrong' }) })).status, 401);
  const j = await fetch(G + '/guest/join', { method: 'POST', body: JSON.stringify({ invite: token }) });
  assert.equal(j.status, 200);
  const gc = (j.headers.get('set-cookie') || '').split(';')[0];
  assert.match(gc, /^dz_guest=guest-[0-9a-f]{12}\./);
  assert.equal((await fetch(G + '/', { headers: { Cookie: gc }, redirect: 'manual' })).status, 302, 'a guest cookie does not open the host dashboard');
  const gu = client(G, { cookie: gc }); await gu.opened;
  const gs = await gu.next(m => m.t === 'state');
  assert.equal(gs.s.guest.status, 'waiting'); assert.equal(gs.s.guest.push, '', 'no studio camera link before ADMIT');
  for (const k of ['rundown', 'obs', 'myNotes', 'media', 'vdo', 'ice', 'brk']) assert.equal(gs.s[k], undefined, 'guest view has no ' + k);
  assert.ok(!gu.msgs.some(m => m.t === 'chat.history'), 'no talkback history');
  for (const m of [{ t: 'rundown', action: 'next' }, { t: 'chat.send', text: 'hi' }, { t: 'call.start' }, { t: 'obs', action: 'program', scene: 'GUEST' },
    { t: 'guest.admit' }, { t: 'guest.onair', confirm: true }, { t: 'notes.set', segmentId: 'x', text: 'x' }, { t: 'emergency', action: 'mics' }])
    assert.equal((await gu.send(m)).ok, false, 'guest refused: ' + m.t);
  // still preview: to the Director only
  const img = 'data:image/jpeg;base64,' + Buffer.from('fakejpeg').toString('base64');
  assert.equal((await gu.send({ t: 'guest.snapshot', img })).ok, true);
  await d.next(m => m.t === 'guest.snap' && m.img === img);
  await new Promise(r => setTimeout(r, 200));
  assert.ok(!hst.msgs.some(m => m.t === 'guest.snap'), 'Georgie never gets the preview');
  // ON AIR is refused before ADMIT; ADMIT alone keeps the seat hidden and muted
  assert.equal((await d.send({ t: 'guest.onair', confirm: true })).ok, false);
  assert.equal((await d.send({ t: 'guest.admit' })).ok, true);
  assert.match(seat().settings.url, /vdo\.ninja\/\?view=dzg/);
  assert.equal(seat().muted, true); assert.equal(item().sceneItemEnabled, false);
  const gb = await gu.next(m => m.t === 'state' && m.s.guest?.status === 'backstage');
  assert.match(gb.s.guest.push, /push=dzg/);
  // TAKE GUEST ON AIR: confirmed only; then shown and unmuted
  assert.equal((await d.send({ t: 'guest.onair' })).ok, false, 'needs confirmation');
  assert.equal(seat().muted, true);
  assert.equal((await d.send({ t: 'guest.onair', confirm: true })).ok, true);
  assert.equal(seat().muted, false); assert.equal(item().sceneItemEnabled, true);
  await gu.next(m => m.t === 'state' && m.s.guest?.status === 'onair');
  assert.equal((await d.send({ t: 'guest.offair' })).ok, true);
  assert.equal(seat().muted, true); assert.equal(item().sceneItemEnabled, false);
  // ending the invitation disconnects the guest and the old cookie stops working
  assert.equal((await d.send({ t: 'guest.end' })).ok, true);
  await new Promise(r => gu.ws.readyState === 3 ? r() : gu.ws.once('close', r));
  await assert.rejects(client(G, { cookie: gc }).opened, /401/);
  assert.ok([401, 429].includes((await fetch(G + '/guest/join', { method: 'POST', body: JSON.stringify({ invite: token }) })).status), 'old link dead (or the sign-in limit stops it)');
  d.close(); hst.close();
});

test('the guest page never runs on Georgie\'s session, even in a browser where she is signed in', async () => {
  await assert.rejects(client(G, { cookie: hostCookie, query: '?as=guest' }).opened, /401/);
});
