// PLAYLIST: the show's album, played from the Broadcast Studio with PLAY / PAUSE / STOP / NEXT.
//   FRIDAY   the original recordings, through OBS's "Music Player" media source (in AUDIO // ALL, so it is live in
//            every scene). NEXT fades the running track out first (the preset's fadeMs), then starts the next one.
//            CONTINUOUS (off by default) starts the next track by itself when one ends.
//   SATURDAY the piano arrangements, played by the Vienna Piano Stage page (OBS browser source "Piano Stage") on its
//            own song slot, so the stage's cameras and lights run with the music. A track without a delivered piano
//            master cannot be played: the original recording is never put in its place. A track never starts by itself.
// The microphone is never touched by a playlist action. TALK is the one deliberate exception: it opens the show's
// microphones and takes the music down under the voice (duckDb); TALK again closes them and brings the music back.
import fs from 'node:fs';
import path from 'node:path';

const str = (v, max) => String(v ?? '').slice(0, max);

export function loadAlbum(showsDir, id) {
  if (!/^[a-z0-9-]{1,60}$/.test(String(id))) return null;
  try { return JSON.parse(fs.readFileSync(path.join(showsDir, 'albums', id + '.json'), 'utf8')); } catch { return null; }
}

export function createPlaylist({ showsDir, dzRoot, obs, state, stage, logEvent, changed }) {
  state.playlist ||= {};
  const P = state.playlist;          // { show, index, status, continuous, talk }
  let preset = null, album = null, tracks = [];
  let fading = false, quietUntil = 0;   // our own stop / restart also makes OBS report "ended": not a track ending by itself
  const own = () => { quietUntil = Date.now() + 1500; };

  // the tracks of the show, with what can really be played: a file that exists, of the version this show plays
  function build(show) {
    preset = show?.playlist || null;
    album = preset ? loadAlbum(showsDir, preset.album) : null;
    const version = preset?.version === 'piano' ? 'piano' : 'original';
    tracks = (album?.tracks || []).filter(t => !(preset.skipIntro && t.intro)).map(t => {
      const rel = version === 'piano' ? t.piano : t.original;
      const abs = rel ? path.resolve(dzRoot, rel) : '';
      const ok = !!abs && fs.existsSync(abs);
      return { n: t.n, id: t.id, title: t.title, key: t.key || '', bpm: t.bpm || 0, seconds: t.seconds || 0, story: t.story || '',
        file: ok ? abs : '', available: ok,
        missing: ok ? '' : version === 'piano' ? 'PIANO MASTER MISSING — not delivered yet' : 'RECORDING NOT FOUND',
        expected: rel || '' };
    });
    if (P.show !== show?.id) Object.assign(P, { show: show?.id || '', index: -1, status: 'stopped', continuous: false, talk: false });
  }
  const player = () => preset?.player || '';
  const viaStage = () => player() === 'stage';
  const musicInput = () => (viaStage() ? preset.stageInput || 'Piano Stage' : player());
  const cur = () => tracks[P.index] || null;

  /* ---------- what is playing, from the real players (OBS media state, the stage's own report) ---------- */
  function liveStatus() {
    if (!preset) return 'stopped';
    if (viaStage()) {
      const r = stage.report();
      const t = cur();
      if (!r || !t) return 'stopped';
      if (r.state === 'SONG' && r.song === 'piano-sessions/' + t.id) return r.paused ? 'paused' : 'playing';
      return 'stopped';
    }
    const m = obs.state.media.find(x => x.name === player());
    return !m ? 'stopped' : m.state === 'playing' ? 'playing' : m.state === 'paused' ? 'paused' : 'stopped';
  }

  function requireReady() {
    if (!preset) throw new Error('This show has no playlist');
    if (viaStage()) { if (!stage.connected()) throw new Error('The Vienna Piano Stage page is not connected (OBS browser source "Piano Stage")'); return; }
    if (!obs.state.connected) throw new Error('OBS is not connected');
    if (!obs.state.media.some(m => m.name === player())) throw new Error(`OBS has no "${player()}" in this show (npm run obs-setup -- ${P.show} --players)`);
  }
  const level = () => (P.talk ? Number(preset.duckDb ?? -14) : Number(preset.levelDb ?? 0));

  async function playIndex(i) {
    const t = tracks[i];
    if (!t) throw new Error('No such track');
    if (!t.available) throw new Error(`${String(t.n).padStart(2, '0')} ${t.title}: ${t.missing}${viaStage() ? '. The original recording is never used in the Piano Sessions.' : ''}`);
    requireReady();
    if (viaStage()) {
      const r = await stage.send({ cmd: 'song', track: { id: t.id, title: t.title, album: album.title, seconds: t.seconds, url: stage.masterUrl(t.id) } });
      if (r.error) throw new Error(r.error);
      // the stage says so if it would not start the song (the openings are still running, for example)
      if (r.r?.state !== 'SONG') throw new Error(`The stage did not start the song: ${r.say || r.r?.state || 'no answer'}`);
    } else {
      own();
      await obs.setVolume(player(), level()).catch(() => {});
      await obs.playFile(player(), t.file, false);
    }
    P.index = i; P.status = 'playing'; P.at = Date.now();
    logEvent('ok', `PLAYLIST ▶ ${String(t.n).padStart(2, '0')} ${t.title}`);
    changed();
  }

  // NEXT on Friday: the running track fades out over fadeMs, then the next one starts at the show's level
  async function fadeOut(ms) {
    const from = level(), steps = 12;
    fading = true;
    try {
      for (let s = 1; s <= steps; s++) {
        await obs.setVolume(player(), from + (-50 - from) * (s / steps)).catch(() => {});
        await new Promise(r => setTimeout(r, ms / steps));
      }
      own(); await obs.stopFile(player());
    } finally { fading = false; }
  }

  async function action(msg) {
    switch (msg.action) {
      case 'select': {                                   // cue a track up; nothing plays
        const i = Number(msg.index); if (!tracks[i]) throw new Error('No such track');
        P.index = i; changed(); return;
      }
      case 'play': {
        const i = msg.index == null ? Math.max(0, P.index) : Number(msg.index);
        if (i === P.index && liveStatus() === 'paused') {              // PLAY after PAUSE: carry on where it was
          requireReady();
          if (viaStage()) { const r = await stage.send({ cmd: 'resume' }); if (r.error) throw new Error(r.error); }
          else await obs.media(player(), 'resume');
          P.status = 'playing'; logEvent('ok', `PLAYLIST ▶ resumed ${cur().title}`); changed(); return;
        }
        return playIndex(i);
      }
      case 'pause': {
        requireReady();
        if (liveStatus() !== 'playing') throw new Error('Nothing is playing');
        if (viaStage()) { const r = await stage.send({ cmd: 'pause' }); if (r.error) throw new Error(r.error); }
        else await obs.media(player(), 'pause');
        P.status = 'paused'; logEvent('ok', `PLAYLIST ❚❚ ${cur()?.title || ''}`); changed(); return;
      }
      case 'stop': {
        requireReady();
        if (viaStage()) { const r = await stage.send({ cmd: 'song-stop' }); if (r.error) throw new Error(r.error); }
        else { own(); await obs.stopFile(player()); }
        P.status = 'stopped'; logEvent('ok', `PLAYLIST ■ ${cur()?.title || ''}`); changed(); return;
      }
      case 'next': {
        const i = P.index + 1;
        if (!tracks[i]) throw new Error('That was the last track of the album');
        if (!tracks[i].available) { P.index = i; changed(); throw new Error(`${String(tracks[i].n).padStart(2, '0')} ${tracks[i].title}: ${tracks[i].missing}`); }
        if (!viaStage() && liveStatus() === 'playing' && msg.fade !== false) { requireReady(); await fadeOut(Number(preset.fadeMs) || 3000); }
        return playIndex(i);
      }
      case 'prev': {
        const i = Math.max(0, P.index - 1); if (!tracks[i]) throw new Error('No such track');
        P.index = i; changed(); return;
      }
      case 'continuous':
        if (viaStage()) throw new Error('In the Piano Sessions every track starts only when you press PLAY');
        P.continuous = !!msg.on; changed(); return;
      case 'talk': {
        // the one link between microphone and music, and only on purpose: TALK opens the show's microphones and
        // takes the music under the voice; TALK off closes them and brings the music back up
        if (!obs.state.connected) throw new Error('OBS is not connected');
        const on = !!msg.on, mics = (msg.mics || []).filter(n => obs.state.audio.some(a => a.name === n));
        if (!mics.length) throw new Error('No microphone of this show is in OBS');
        for (const n of mics) await obs.setMute(n, !on);
        P.talk = on;
        if (obs.state.audio.some(a => a.name === musicInput())) await obs.setVolume(musicInput(), level());
        logEvent('ok', on ? `TALK: ${mics.join(', ')} open, music at ${level()} dB` : `MUSIC: ${mics.join(', ')} closed, music at ${level()} dB`);
        changed(); return;
      }
      default: throw new Error('Unknown playlist action');
    }
  }

  // Friday: a track that ends by itself (not a STOP, not the fade of NEXT)
  obs.on('media.ended', name => {
    if (!preset || viaStage() || name !== player() || fading || Date.now() < quietUntil) return;
    if (P.status !== 'playing') return;
    const next = P.index + 1;
    if (P.continuous && tracks[next]?.available) playIndex(next).catch(e => logEvent('warn', `PLAYLIST continuous: ${e.message}`));
    else { P.status = 'stopped'; changed(); }
  });

  return {
    build, action,
    get preset() { return preset; },
    // the piano master the stage page may load: only a delivered file of this show's playlist
    stageFile(id) { return viaStage() ? tracks.find(t => t.id === id && t.available)?.file || null : null; },
    view() {
      if (!preset) return null;
      const status = liveStatus();
      const m = !viaStage() && obs.state.media.find(x => x.name === player());
      const r = viaStage() ? stage.report() : null;
      return {
        album: album ? { title: album.title, artist: album.artist } : null, version: preset.version, player: player(), viaStage: viaStage(),
        index: P.index, status, continuous: !!P.continuous, talk: !!P.talk, fadeMs: Number(preset.fadeMs) || 3000,
        position: status === 'stopped' ? null : viaStage() ? { t: r?.time || 0, d: r?.duration || 0 } : { t: (m?.cursor || 0) / 1000, d: (m?.duration || 0) / 1000 },
        playerReady: viaStage() ? stage.connected() : !!obs.state.connected && obs.state.media.some(x => x.name === player()),
        tracks: tracks.map(({ file, ...t }) => t),
      };
    },
  };
}
