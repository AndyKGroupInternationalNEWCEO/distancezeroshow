// Bridge between the Vienna Piano Stage page (served by the studio at /piano-stage/) and the Broadcast Studio.
// Loaded only into that page. It uses the stage's own controls (window.__studio.ext: the Piano Show, cameras P1–P5,
// lighting modes, the lift) and adds nothing to the 3D scene.
//   - Commands come from the studio over its WebSocket (the stage key in ?stagekey=…), one at a time, and each is
//     answered with what the stage said.
//   - Twice a second the stage reports what it is doing, so the Director sees the real state, not an assumed one.
//   - A song plays the piano master the studio names (its URL), on the show's own song slot. Its keys move only if the
//     stage itself has an approved piano part for it (keys.js, docs/vienna-stage/SCORE-IMPORT.md); the bridge never
//     loads one, so without an approved part they stay still.
const q = new URLSearchParams(location.search);
const KEY = q.get('stagekey') || '';
const SHOW_CMDS = new Set(['start', 'stop', 'restart', 'skip', 'live', 'between', 'between-stop', 'return-live', 'closing', 'closing-stop', 'closing-restart', 'song-stop']);
const CAMS = new Set(['P1', 'P2', 'P3', 'P4', 'P5']);
const MODES = new Set(['WARM PIANO', 'CINEMATIC', 'PERFORMANCE', 'BLACKOUT', 'LIFT REVEAL']);
const LIFT = new Set(['up', 'down', 'stop', 'reset']);

if (KEY) {
  document.body.classList.add('dz-stage');
  start();
}

async function start() {
  // the stage is ready once the studio page has built it (window.__studio is set on 127.0.0.1 only)
  let ext = null;
  for (let i = 0; i < 1200 && !ext; i++) { ext = window.__studio?.ext; if (!ext) await new Promise(r => setTimeout(r, 100)); }
  if (!ext) return console.error('[stage-bridge] the Vienna Piano Stage did not start');
  // the Piano Sessions' picture: the stage's cameras, never the studio's own auto tour
  window.__studio.director.setAuto(false);
  ext.pickCamera('P1');
  const msg = () => document.querySelector('.vz [data-k="msg"]')?.textContent || '';
  const audio = () => { const s = ext.show; const a = s.segment ? s.audio[s.segment] : null; return a ? { paused: a.paused, muted: a.muted, volume: a.volume, error: a.error ? a.error.code : 0 } : null; };
  const report = () => ({
    state: ext.show.state, paused: ext.show.paused, segment: ext.show.segment, label: ext.show.label, clock: ext.show.clock,
    time: +ext.show.time.toFixed(2), duration: +(ext.show.duration || 0).toFixed(2), song: ext.show.song?.id || null,
    program: ext.program, view: window.__studio.director.current, mode: ext.mode, lift: ext.lift.state, height: +ext.lift.height.toFixed(2),
    keys: ext.keyPlayer.part ? 'approved part' : 'still', audio: audio(), say: msg(),
    obs: /\bOBS\//.test(navigator.userAgent), visible: document.visibilityState,
  });

  function run(c) {
    switch (c.cmd) {
      case 'song': {
        const t = c.track || {};
        if (!t.url || !t.id) throw new Error('No piano master for this track');
        // the show's song slot plays exactly this file; nothing is loaded into the keys here
        ext.show.playSong({ id: 'piano-sessions/' + t.id, title: t.title, album: t.album || '', audio: new URL(t.url, location.href).href, seconds: t.seconds || 0 });
        return;
      }
      case 'pause': if (ext.show.segment && !ext.show.paused) ext.showCommand('pause'); return;
      case 'resume': if (ext.show.segment && ext.show.paused) ext.showCommand('pause'); return;
      case 'seek': if (ext.show.segment !== 'song' || !(Number(c.time) >= 0)) throw new Error('Seek works within a song only'); ext.show.seek(Number(c.time)); return;
      case 'cam': if (!CAMS.has(c.cam)) throw new Error('No such camera'); ext.pickCamera(c.cam); return;
      case 'mode': if (!MODES.has(c.mode)) throw new Error('No such lighting mode'); ext.setMode(c.mode); return;
      case 'lift': if (!LIFT.has(c.lift)) throw new Error('No such lift command'); ext.command(c.lift); return;
      default:
        if (!SHOW_CMDS.has(c.cmd)) throw new Error('Unknown stage command');
        ext.showCommand(c.cmd);
    }
  }

  let ws = null, timer = 0, wait = 1000;
  function connect() {
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?stage=${encodeURIComponent(KEY)}`);
    ws.onopen = () => { wait = 1000; send({ t: 'stage.report', r: report() }); clearInterval(timer); timer = setInterval(() => send({ t: 'stage.report', r: report() }), 500); };
    ws.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t !== 'stage.cmd') return;
      let error = '';
      try { run(m); } catch (err) { error = err.message || String(err); }
      // the stage's own answer (it refuses a song while the openings run, for example) comes back with the report
      setTimeout(() => send({ t: 'stage.ack', ref: m.ref, error, say: msg(), r: report() }), 120);
    };
    ws.onclose = () => { clearInterval(timer); setTimeout(connect, wait); wait = Math.min(wait * 2, 8000); };
  }
  const send = m => { if (ws?.readyState === 1) ws.send(JSON.stringify(m)); };
  connect();
}
