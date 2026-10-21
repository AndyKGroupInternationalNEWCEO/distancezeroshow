// The two weekly shows on the real studio server against the mock OBS: FRIDAY's DJ playlist (OBS Music Player),
// SATURDAY's Piano Sessions on the Vienna Piano Stage (a stand-in stage page over the real WebSocket), the stage page
// served from the Virtual Space worktree, and the show runbooks (PDF kept unchanged).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import WebSocket from 'ws';
import { startStudio, loadConfig } from '../server.js';
import { startMockObs } from './mock-obs.js';
import { heading, sectionsOf } from '../lib/runbook.js';

const quiet = { log() {}, warn() {} };
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
let mock, app, dataDir, dz, D, cookie;

// a stand-in ~/DISTANCE-ZERO: the album's original recordings next to it (../djandyk-landing/public/audio), no piano masters
function fakeDz() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dz-weekly-'));
  const root = path.join(base, 'DISTANCE-ZERO'), audio = path.join(base, 'djandyk-landing', 'public', 'audio');
  fs.mkdirSync(root, { recursive: true }); fs.mkdirSync(audio, { recursive: true });
  for (const t of ['deep-connection-intro', 'game', 'in-my-veins', 'perfume', 'midnight-drive', 'mask', 'stone']) fs.writeFileSync(path.join(audio, t + '.mp3'), 'ID3 fake ' + t);
  return root;
}
function client(base, { cookie: c, query = '', origin = base } = {}) {
  const ws = new WebSocket(base.replace('http', 'ws') + '/ws' + query, { headers: { Origin: origin, ...(c ? { Cookie: c } : {}) } });
  const msgs = [], waiters = []; let seq = 0;
  ws.on('message', raw => { const m = JSON.parse(raw); msgs.push(m); for (const w of [...waiters]) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(m); } });
  return {
    ws, msgs,
    opened: new Promise((res, rej) => { ws.once('open', res); ws.once('unexpected-response', (_, r) => rej(new Error('HTTP ' + r.statusCode))); ws.once('error', rej); }),
    next(pred, ms = 3000) {
      const hit = msgs.find(pred); if (hit) return Promise.resolve(hit);
      return new Promise((resolve, reject) => { const w = { pred, resolve }; waiters.push(w); setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); reject(new Error('timed out: ' + pred.toString().slice(0, 120))); }, ms); });
    },
    send(msg) { const id = 'w' + ++seq; ws.send(JSON.stringify({ ...msg, id })); return this.next(m => m.t === 'ack' && m.id === id, 9000); },
    raw(msg) { ws.send(JSON.stringify(msg)); },
    close() { ws.close(); },
  };
}
const until = async (fn, ms = 4000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise(r => setTimeout(r, 20)); } throw new Error('condition not met'); };
const reqs = (type, pred = () => true) => mock.log.filter(r => r.requestType === type && pred(r.requestData || {}));
const stateOf = async d => (await d.next(m => m.t === 'state' && m.s.playlist !== undefined)).s;
const fresh = async (d, pred) => { d.msgs.length = 0; return (await d.next(m => m.t === 'state' && pred(m.s), 5000)).s; };

before(async () => {
  mock = startMockObs({ port: 0, password: 'pw', meters: false });
  await mock.ready;
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dz-weekly-data-'));
  dz = fakeDz();
  const c = loadConfig();
  Object.assign(c, { director: { host: '127.0.0.1', port: 0 }, guest: { host: '127.0.0.1', port: 0 }, obs: { url: `ws://127.0.0.1:${mock.port}` }, viewerChat: null });
  app = await startStudio({ config: c, dataDir, obsPassword: 'pw', log: quiet, dzRoot: dz });
  D = `http://127.0.0.1:${app.director.port}`;
  await until(() => app.obs.state.connected);
  const r = await fetch(D + '/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: app.secrets.directorCode }) });
  cookie = (r.headers.get('set-cookie') || '').split(';')[0];
});
after(async () => { await app.close(); await mock.close(); });

test('FRIDAY playlist: the original album through the OBS Music Player — PLAY, PAUSE, resume, NEXT with a fade, STOP; the mic is never touched', async () => {
  const d = client(D, { cookie }); await d.opened;
  assert.equal((await d.send({ t: 'show.select', show: 'friday' })).ok, true);
  let S = await fresh(d, s => s.showId === 'friday' && s.playlist);
  assert.equal(S.playlist.tracks.length, 7, 'the whole album, the intro included');
  assert.equal(S.playlist.tracks[0].title, 'Deep Connection (Intro)');
  assert.ok(S.playlist.tracks.every(t => t.available), 'every original recording found');
  assert.match(S.playlist.tracks[1].story, /^Someone who always holds the winning hand/);
  const micBefore = reqs('SetInputMute').length;
  mock.log.length = 0;
  assert.equal((await d.send({ t: 'playlist', action: 'play', index: 1 })).ok, true);
  const load = reqs('SetInputSettings', x => x.inputName === 'Music Player').at(-1);
  assert.match(load.requestData.inputSettings.local_file, /djandyk-landing\/public\/audio\/game\.mp3$/);
  assert.equal(reqs('TriggerMediaInputAction', x => x.inputName === 'Music Player').at(-1).requestData.mediaAction, 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART');
  S = await fresh(d, s => s.playlist.status === 'playing');
  assert.equal(S.playlist.index, 1);
  // PAUSE holds, PLAY carries on from there (not from the top)
  assert.equal((await d.send({ t: 'playlist', action: 'pause' })).ok, true);
  await fresh(d, s => s.playlist.status === 'paused');
  assert.equal((await d.send({ t: 'playlist', action: 'play' })).ok, true);
  assert.equal(reqs('TriggerMediaInputAction', x => x.inputName === 'Music Player').at(-1).requestData.mediaAction, 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY');
  await fresh(d, s => s.playlist.status === 'playing');
  // NEXT: the running track fades down (several volume steps), stops, the next starts at full level
  mock.log.length = 0;
  const t0 = Date.now();
  assert.equal((await d.send({ t: 'playlist', action: 'next' })).ok, true);
  assert.ok(Date.now() - t0 >= 3500, 'the 4 s fade took its time');
  const vols = reqs('SetInputVolume', x => x.inputName === 'Music Player').map(r => r.requestData.inputVolumeDb);
  assert.ok(vols.length >= 12 && vols[11] <= -49, 'faded out: ' + vols.join(','));
  assert.equal(vols.at(-1), 0, 'the next track at the show level');
  assert.match(reqs('SetInputSettings', x => x.inputName === 'Music Player').at(-1).requestData.inputSettings.local_file, /in-my-veins\.mp3$/);
  S = await fresh(d, s => s.playlist.index === 2 && s.playlist.status === 'playing');
  assert.equal((await d.send({ t: 'playlist', action: 'stop' })).ok, true);
  await fresh(d, s => s.playlist.status === 'stopped');
  assert.equal(reqs('SetInputMute').length, 0, 'no playlist action touched a microphone');
  assert.equal(micBefore >= 0, true);
  d.close();
});

test('FRIDAY: TALK opens the mic and takes the music under the voice; CONTINUOUS plays on by itself, and without it a track just ends', async () => {
  const d = client(D, { cookie }); await d.opened;
  await d.send({ t: 'show.select', show: 'friday' });
  await d.send({ t: 'obs', action: 'mute', input: 'Mic // Andrej', muted: true });
  mock.log.length = 0;
  assert.equal((await d.send({ t: 'playlist', action: 'talk', on: true })).ok, true);
  assert.equal(mock.inputs.find(i => i.inputName === 'Mic // Andrej').muted, false);
  assert.equal(mock.inputs.find(i => i.inputName === 'Music Player').volumeDb, -14);
  assert.equal(mock.inputs.find(i => i.inputName === 'DJ Mixer').muted, false, 'only the show\'s own mic list; nothing else changed');
  assert.equal((await d.send({ t: 'playlist', action: 'talk', on: false })).ok, true);
  assert.equal(mock.inputs.find(i => i.inputName === 'Mic // Andrej').muted, true);
  assert.equal(mock.inputs.find(i => i.inputName === 'Music Player').volumeDb, 0);
  // the mock's tracks last 4 s: without CONTINUOUS the end is the end
  await d.send({ t: 'playlist', action: 'play', index: 5 });
  await fresh(d, s => s.playlist.status === 'playing' && s.playlist.index === 5);
  await until(() => app.studio.view('director').playlist.status === 'stopped', 9000);
  assert.equal(app.studio.view('director').playlist.index, 5);
  // with CONTINUOUS the next one follows by itself
  await d.send({ t: 'playlist', action: 'continuous', on: true });
  await d.send({ t: 'playlist', action: 'play', index: 5 });
  await until(() => app.studio.view('director').playlist.index === 6 && app.studio.view('director').playlist.status === 'playing', 9000);
  await d.send({ t: 'playlist', action: 'stop' });
  await d.send({ t: 'playlist', action: 'continuous', on: false });
  assert.equal((await d.send({ t: 'playlist', action: 'next' })).ok, false, 'the album ends with Stone');
  d.close();
});

test('SATURDAY playlist: piano arrangements without the intro; no piano master = no PLAY (the original is never used); the stage must be connected', async () => {
  const d = client(D, { cookie }); await d.opened;
  assert.equal((await d.send({ t: 'show.select', show: 'saturday' })).ok, true);
  assert.equal(mock.state.collection, 'DZ — Saturday Piano Sessions');
  const S = await fresh(d, s => s.showId === 'saturday' && s.playlist?.viaStage);
  assert.deepEqual(S.playlist.tracks.map(t => t.title), ['Game', 'In My Veins', 'Perfume', 'Midnight Drive', 'Mask', 'Stone']);
  assert.ok(S.playlist.tracks.every(t => !t.available && /PIANO MASTER MISSING/.test(t.missing)));
  assert.equal(S.rundown.segments[1].cues.stage, 'start');
  assert.equal(S.rundown.segments.at(-1).cues.stage, 'closing');
  mock.log.length = 0;
  const r = await d.send({ t: 'playlist', action: 'play', index: 0 });
  assert.equal(r.ok, false); assert.match(r.error, /PIANO MASTER MISSING.*original recording is never used/);
  assert.equal(reqs('SetInputSettings').length, 0, 'nothing loaded anywhere');
  assert.match((await d.send({ t: 'stage', cmd: 'start' })).error, /not connected/);
  assert.equal((await d.send({ t: 'playlist', action: 'continuous', on: true })).ok, false, 'never plays on by itself');
  d.close();
});

test('SATURDAY on the stage: PLAY / PAUSE / resume / STOP / NEXT go to the stage page; GO fires its segment; the master is served only with the key', async () => {
  // a delivered piano master for Game (and none for In My Veins)
  const master = path.join(dz, 'shared-assets', 'piano-sessions', 'deep-connections', '02-game-piano.wav');
  fs.mkdirSync(path.dirname(master), { recursive: true }); fs.writeFileSync(master, Buffer.alloc(4096, 7));
  const d = client(D, { cookie }); await d.opened;
  await d.send({ t: 'show.select', show: 'saturday' });
  // a wrong key gets no stage connection; the stage key does
  await assert.rejects(client(D, { query: '?stage=wrong' }).opened);
  const st = client(D, { query: '?stage=' + encodeURIComponent(app.secrets.overlayKey) }); await st.opened;
  let rep = { state: 'LIVE', paused: false, segment: null, label: 'Live piano performance', time: 0, duration: 0, song: null, program: 'P1', mode: 'WARM PIANO', lift: 'ELEVATED', keys: 'still', obs: true };
  const cmds = [];
  st.ws.on('message', raw => {
    const m = JSON.parse(raw); if (m.t !== 'stage.cmd') return;
    cmds.push(m);
    if (m.cmd === 'song') rep = { ...rep, state: 'SONG', segment: 'song', song: 'piano-sessions/' + m.track.id, label: 'Live piano · ' + m.track.title, duration: m.track.seconds, paused: false };
    if (m.cmd === 'pause') rep.paused = true;
    if (m.cmd === 'resume') rep.paused = false;
    if (m.cmd === 'song-stop' || m.cmd === 'live') rep = { ...rep, state: 'LIVE', segment: null, song: null, paused: false };
    if (m.cmd === 'start') rep = { ...rep, state: 'OPENING', segment: 'opening', label: 'Short opening · official ident' };
    st.raw({ t: 'stage.report', r: rep });
    st.raw({ t: 'stage.ack', ref: m.ref, error: '', say: '', r: rep });
  });
  st.raw({ t: 'stage.report', r: rep });
  // the stage page may only report and answer
  assert.equal((await st.send({ t: 'obs', action: 'program', scene: 'STANDBY' })).ok, false);
  assert.equal((await st.send({ t: 'playlist', action: 'play' })).ok, false);
  await d.send({ t: 'media.rescan' });   // rebuild: the delivered master is seen when the show is selected again
  await d.send({ t: 'show.select', show: 'saturday' });
  let S = await fresh(d, s => s.stage?.connected && s.stage.report?.obs);
  // select again so the playlist sees the new master
  assert.equal((await d.send({ t: 'show.select', show: 'friday' })).ok, true);
  assert.equal((await d.send({ t: 'show.select', show: 'saturday' })).ok, true);
  S = await fresh(d, s => s.playlist?.tracks?.[0]?.available === true);
  mock.log.length = 0;
  assert.equal((await d.send({ t: 'playlist', action: 'play', index: 0 })).ok, true);
  const song = cmds.find(c => c.cmd === 'song');
  assert.equal(song.track.id, 'game'); assert.equal(song.track.title, 'Game');
  assert.match(song.track.url, /^\/piano-stage\/master\/game\?k=/);
  // the master: byte for byte, only with the key, never through a proxy
  const got = Buffer.from(await (await fetch(D + song.track.url)).arrayBuffer());
  assert.deepEqual(got, fs.readFileSync(master));
  assert.equal((await fetch(D + '/piano-stage/master/game')).status, 403);
  assert.equal((await fetch(D + song.track.url, { headers: { 'X-Forwarded-For': '1.2.3.4' } })).status, 403);
  assert.equal((await fetch(D + '/piano-stage/master/in-my-veins?k=' + app.secrets.overlayKey)).status, 404, 'no master, no file');
  S = await fresh(d, s => s.playlist.status === 'playing');
  assert.equal((await d.send({ t: 'playlist', action: 'pause' })).ok, true);
  assert.equal(cmds.at(-1).cmd, 'pause');
  await fresh(d, s => s.playlist.status === 'paused');
  assert.equal((await d.send({ t: 'playlist', action: 'play' })).ok, true);
  assert.equal(cmds.at(-1).cmd, 'resume', 'PLAY after PAUSE carries on');
  assert.equal((await d.send({ t: 'playlist', action: 'stop' })).ok, true);
  assert.equal(cmds.at(-1).cmd, 'song-stop');
  const nx = await d.send({ t: 'playlist', action: 'next' });
  assert.equal(nx.ok, false); assert.match(nx.error, /In My Veins: PIANO MASTER MISSING/);
  assert.equal(reqs('SetInputSettings').length + reqs('TriggerMediaInputAction').length, 0, 'OBS players untouched: the stage plays the piano');
  assert.equal(reqs('SetInputMute').length, 0, 'the mic untouched');
  // the stage's own segments, cameras and lights from the Director
  assert.equal((await d.send({ t: 'stage', cmd: 'cam', cam: 'P2' })).ok, true); assert.equal(cmds.at(-1).cam, 'P2');
  assert.equal((await d.send({ t: 'stage', cmd: 'rm -rf' })).ok, false);
  // GO into the opening fires the stage's START with the scene
  await d.send({ t: 'rundown', action: 'reset' });
  const go = await d.send({ t: 'cue.go', index: 1 });
  assert.equal(go.ok, true, JSON.stringify(go));
  assert.equal(cmds.at(-1).cmd, 'start');
  assert.ok(go.result.done.some(x => /PIANO STAGE START/.test(x)), JSON.stringify(go.result));
  // (the mock OBS has the Sunday scenes only: the cue's scene is reported as missing, the stage still fires)
  assert.ok(go.result.skipped.some(x => /SCENE PIANO STAGE · CLEAN: not in this OBS collection/.test(x)));
  await d.send({ t: 'rundown', action: 'reset' });
  st.close();
  await until(async () => !(await fresh(d, () => true)).stage.connected);
  fs.rmSync(master);
  d.close();
});

test('the Vienna Piano Stage page: built from the worktree\'s studio.html (not ?obs=1), with the bridge; files read-only, nothing outside it', async () => {
  const root = path.resolve(process.cwd(), loadConfig().pianoStage.root);
  if (!fs.existsSync(path.join(root, 'studio.html'))) return;   // the worktree is not on this machine
  const before = sha(path.join(root, 'studio.html'));
  const r = await fetch(D + '/piano-stage/?quality=broadcast&stagekey=x');
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /extend: vienna/); assert.match(html, /noindex, nofollow/); assert.match(html, /\/static\/stage-bridge\.js/);
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.equal((await fetch(D + '/piano-stage/virtual-studio/vienna/keys.js')).status, 200, 'the stage\'s current local files');
  assert.equal((await fetch(D + '/piano-stage/../server.js')).status, 404);
  assert.equal((await fetch(D + '/piano-stage/%2e%2e/%2e%2e/broadcast-studio/studio/data/secrets.json')).status, 404);
  assert.equal((await fetch(D + '/piano-stage/.git/HEAD')).status, 404);
  assert.equal((await fetch(D + '/piano-stage/', { headers: { 'X-Forwarded-For': '1.2.3.4' } })).status, 403);
  assert.equal(sha(path.join(root, 'studio.html')), before, 'the worktree is not written');
});

test('SHOW RUNBOOKS: a PDF per show, stored unchanged, sections and pages for navigation, host notes kept apart', async () => {
  const pdfs = { friday: path.join(os.homedir(), 'Desktop/D0/Shows scarane /Dj /distance-zero-friday-dj-show-2027-01-29.pdf'),
    saturday: path.join(os.homedir(), 'Desktop/D0/Shows scarane /Piano/DISTANCE_ZERO_PIANO_SESSIONS_DEEP_CONNECTIONS_MASTER_RUNBOOK.pdf') };
  const d = client(D, { cookie }); await d.opened;
  // not a PDF, not signed in, not the Director
  assert.equal((await fetch(D + '/runbook/upload?show=friday', { method: 'POST', headers: { Cookie: cookie }, body: 'hello world, this is not a pdf at all, but long enough to be checked properly by the server' })).status, 422);
  assert.equal((await fetch(D + '/runbook/upload?show=friday', { method: 'POST', body: '%PDF-1.4' })).status, 403);
  assert.equal((await fetch(D + '/runbook/upload?show=nope', { method: 'POST', headers: { Cookie: cookie }, body: '%PDF-1.4' })).status, 404);
  for (const [show, file] of Object.entries(pdfs)) {
    if (!fs.existsSync(file)) continue;   // the show Mac has them; elsewhere this part is skipped
    const orig = sha(file);
    const r = await fetch(D + `/runbook/upload?show=${show}&name=${encodeURIComponent(path.basename(file))}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/pdf' }, body: fs.readFileSync(file) });
    const j = await r.json();
    assert.equal(j.ok, true, JSON.stringify(j));
    assert.equal(j.sha256, orig, 'stored byte for byte');
    assert.equal(sha(path.join(dataDir, 'runbooks', show + '.pdf')), orig);
    assert.equal(sha(file), orig, 'the original file is untouched');
    const v = (await d.send({ t: 'runbook.get', show })).result;
    assert.equal(v.intact, true);
    const titles = v.sections.map(s => s.title);
    if (show === 'friday') {
      assert.equal(v.pages, 4);
      for (const t of ['01 / OPENING', '02 / DJ SET STRUCTURE', '03 / LIVE HOST & CHAT', '04 / CLOSING & SATURDAY INVITATION', 'A / ARRIVAL', 'D / LANDING', 'SCHVÁLENÉ OUTRO / ČÍTAŤ DOSLOVA']) assert.ok(titles.includes(t), t + ' in ' + titles.join(' | '));
      const outro = v.sections.find(s => s.title === 'SCHVÁLENÉ OUTRO / ČÍTAŤ DOSLOVA').text;
      // the approved outro, read word for word: every line of it, also the ones naming DISTANCE // ZERO
      for (const l of [/Tonight, you experienced Deep Connections/, /Join me tomorrow for DISTANCE \/\/ ZERO Piano Sessions — Deep/, /Connections, reimagined\./,
        /Two nights\. One album\. Two completely different experiences\./, /I’m DJ Andy’K\. Thank you for being part of DISTANCE \/\/ ZERO\. Goodnight, and see you/]) assert.match(outro, l);
      assert.ok(!/29 JAN 2027 • DJ ANDY’K/.test(outro), 'the footer is not part of it');
    } else {
      assert.equal(v.pages, 7);
      for (const t of ['02 / SHOW FLOW & LIVE CUES', '03 / PRESENTER SCRIPT — OPENING', '01 / GAME', '06 / STONE', '07 / BROADCAST STUDIO — OPERATOR CHECKLIST']) assert.ok(titles.includes(t), t + ' in ' + titles.join(' | '));
    }
    assert.ok(!titles.some(t => /\/\/|•/.test(t)), 'running headers and footers are not sections');
    // the page pictures and the PDF itself, for the Director only
    const png = await fetch(D + `/runbook/${show}/page/1.png`, { headers: { Cookie: cookie } });
    assert.equal(png.status, 200); assert.equal(png.headers.get('content-type'), 'image/png');
    assert.equal((await fetch(D + `/runbook/${show}/page/1.png`)).status, 403);
    const back = Buffer.from(await (await fetch(D + `/runbook/${show}.pdf`, { headers: { Cookie: cookie } })).arrayBuffer());
    assert.equal(crypto.createHash('sha256').update(back).digest('hex'), orig, 'served as uploaded');
    assert.equal((await fetch(`http://127.0.0.1:${app.guest.port}/runbook/${show}.pdf`)).status, 404, 'never on Georgie\'s port');
    // a host note: kept apart, the PDF unchanged
    const key = v.sections[0].key;
    assert.equal((await d.send({ t: 'runbook.note', show, key, text: 'Breathe. Smile.' })).ok, true);
    assert.equal((await d.send({ t: 'runbook.get', show })).result.notes[key], 'Breathe. Smile.');
    assert.equal(sha(path.join(dataDir, 'runbooks', show + '.pdf')), orig);
    const S = await fresh(d, s => s.runbooks?.[show]);
    assert.equal(S.runbooks[show].intact, true);
  }
  d.close();
});

test('runbook headings: numbered parts and steps, never running headers or footers', () => {
  assert.deepEqual(heading('01 / OPENING'), { level: 1, title: '01 / OPENING' });
  assert.deepEqual(heading('  GO LIVE / ÚVOD'), { level: 2, title: 'GO LIVE / ÚVOD' });
  assert.equal(heading('DISTANCE // ZERO      /   FRIDAY DJ SHOW'), null);
  assert.equal(heading('29 JAN 2027 • DJ ANDY’K • DEEP CONNECTIONS          01 / 04'), null);
  assert.equal(heading('01 / 04'), null);
  assert.equal(heading('[AUDIO] Skontroluj zvuk setu / mikrofón'), null);
  // the running header (on every page) goes; a spoken line naming DISTANCE // ZERO stays
  const s = sectionsOf(['DISTANCE // ZERO header\n01 / OPENING\nHello there\nA / ARRIVAL\nMusic.\nJoin me for DISTANCE // ZERO tomorrow.\nfooter 01 / 02', 'DISTANCE // ZERO header\nmore music\n02 / END\nbye\nfooter 02 / 02']);
  assert.deepEqual(s.map(x => [x.page, x.title, x.text]), [[1, '01 / OPENING', 'Hello there'], [1, 'A / ARRIVAL', 'Music.\nJoin me for DISTANCE // ZERO tomorrow.\nmore music'], [2, '02 / END', 'bye']]);
});

test('the album data matches the official DJ Andy\'K album data word for word', () => {
  const official = path.join(os.homedir(), 'djandyk-landing', 'src', 'data', 'deep-connections-tracks.ts');
  if (!fs.existsSync(official)) return;
  const ts = fs.readFileSync(official, 'utf8');
  const album = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'shows', 'albums', 'deep-connections.json'), 'utf8'));
  const stories = [...ts.matchAll(/story:\s*\n?\s*"((?:[^"\\]|\\.)*)"/g)].map(m => JSON.parse('"' + m[1] + '"'));
  const titles = [...ts.matchAll(/^\s{6}title: "([^"]+)"/gm)].map(m => m[1]);
  const secs = [...ts.matchAll(/durationSeconds: (\d+)/g)].map(m => +m[1]);
  assert.deepEqual(album.tracks.map(t => t.title), titles);
  assert.deepEqual(album.tracks.map(t => t.story), stories);
  assert.deepEqual(album.tracks.map(t => t.seconds), secs);
});
