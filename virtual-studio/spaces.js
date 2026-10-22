// The visitor's three buttons: STUDIO, PIANO, DJ ROOM, at the bottom of the page in place of the studio's control
// bar (which folds into "⋯" and then shows only what belongs to the space chosen). Each takes the visitor to its
// space and plays it as a show:
//   PIANO    the Piano Sessions: opening and theme, then four piano songs with the between-songs ident after each of
//            the first three, then the closing (show.js plays each recording; this runs the order)
//   DJ ROOM  the DJ show: opening 1 (the booth rides down into the club), four of DJ Andy'K's tracks with the Friday
//            transition jingle between them, then the Friday closing; the light follows each track (live-music.js)
// A second press pauses (PIANO, DJ ROOM) or moves on to the next studio shot (STUDIO). Only one space plays at a time:
// going to another stops the last. The press is also the gesture that lets Safari and the iPhone start the sound.
// On the edge, the views that are always there: CCTV and Backstage.
// The Piano Stage's and the DJ Room's own panels are for the director: shown only with ?director in the address.
//   v: the Vienna Piano Stage (vienna/index.js) with the DJ Room as v.melbourne (melbourne/index.js, withVienna)
import { REPERTOIRE } from './vienna/repertoire.js';
import { liveMusic } from './melbourne/live-music.js';

const SHOTS = ['studio', 'desk', 'wall', 'crane', 'floor'];
const JINGLE = { between: 'assets/jingles/02-friday-dj-transition.m4a', end: 'assets/jingles/19-friday-show-closing.m4a' };
const asset = p => new URL('../' + p, import.meta.url).href;
const pick = (list, n) => [...list].sort(() => Math.random() - 0.5).slice(0, n);

const ICON = {
  studio: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6 33c8-5 28-5 36 0"/><path d="M9 33v6m30-6v6"/><rect x="15" y="9" width="13" height="9" rx="1.5"/><path d="M28 12l6-3v9l-6-3"/><path d="M21.5 18v8m-5 0h10"/></svg>',
  piano: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M7 30h34v-3c0-6-4-9-10-9-3 0-4-6-11-6-7 0-13 6-13 12z"/><path d="M7 30v4h34v-4"/><path d="M12 34v6m24-6v6"/><path d="M13 30v-3m4 3v-3m4 3v-3m4 3v-3m4 3v-3m4 3v-3"/></svg>',
  dj: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="17" cy="27" r="9"/><circle cx="17" cy="27" r="2"/><path d="M30 18h11v18H30z"/><path d="M33 23h5m-5 4h5m-5 4h5"/><path d="M9 14a15 15 0 0 1 30 0"/><rect x="6" y="13" width="5" height="8" rx="2"/><rect x="37" y="13" width="5" height="8" rx="2"/></svg>',
  cctv: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 14l26 8-3 8-26-8z"/><path d="M34 22l6 2"/><path d="M14 24l-2 10H6"/></svg>',
  backstage: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M12 40V8h20l4 4v28"/><path d="M8 40h32"/><circle cx="28" cy="25" r="1.5"/></svg>',
};

export function spaces(v, director) {
  const m = v.melbourne;
  const directorMode = new URLSearchParams(location.search).has('director');
  const dock = document.getElementById('dock'), ctrl = dock?.querySelector('.row.ctrl');
  if (!dock || !ctrl) return null;
  document.body.classList.toggle('dz-public', !directorMode);

  const css = `
  .spaces{display:flex;justify-content:center;align-items:stretch;gap:12px;margin:0 auto 8px}
  .spaces .sp{display:flex;flex-direction:column;align-items:center;gap:4px;width:156px;padding:10px 12px 9px;border-radius:16px;
    background:var(--glass,rgba(10,11,14,.58));border:1px solid var(--line,rgba(201,206,214,.16));color:var(--chrome-hi,#f3f5f8);
    font:600 .74rem/1.1 var(--wide,Arial,sans-serif);letter-spacing:.2em;text-transform:uppercase;cursor:pointer;backdrop-filter:blur(10px);
    transition:border-color .25s,background .25s,box-shadow .25s}
  .spaces .sp svg,.edge .eb svg{width:38px;height:38px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
  .spaces .sp small{font-weight:400;font-size:.6rem;letter-spacing:.08em;text-transform:none;color:var(--dim,#8a9099);min-height:1.1em}
  .spaces .sp:hover,.edge .eb:hover{border-color:rgba(243,245,248,.4)}
  .spaces .sp[aria-pressed=true]{--c:var(--chrome-hi,#f3f5f8);border-color:var(--c);box-shadow:0 0 22px -6px var(--c);background:rgba(255,255,255,.07)}
  .spaces .sp.piano[aria-pressed=true]{--c:var(--amber,#f2a650)} .spaces .sp.piano[aria-pressed=true] svg{stroke:var(--amber,#f2a650)}
  .spaces .sp.dj[aria-pressed=true]{--c:var(--ice,#a9c8ee)} .spaces .sp.dj[aria-pressed=true] svg{stroke:var(--ice,#a9c8ee)}
  .spaces .more{align-self:center;width:44px;height:44px;padding:0;border-radius:50%;font-size:1.1rem;letter-spacing:0}
  .dock:not(.more-open) .row.ctrl{display:none}
  body[data-space=piano] #viewMenuBtn,body[data-space=piano] #lookMenuBtn,body[data-space=piano] #auto,
  body[data-space=dj] #viewMenuBtn,body[data-space=dj] #lookMenuBtn,body[data-space=dj] #auto{display:none}
  .edge{position:fixed;left:var(--gut,16px);top:50%;transform:translateY(-50%);z-index:5;display:flex;flex-direction:column;gap:8px}
  .edge .eb{display:flex;flex-direction:column;align-items:center;gap:2px;width:72px;padding:8px 4px;border-radius:12px;cursor:pointer;
    background:var(--glass,rgba(10,11,14,.58));border:1px solid var(--line,rgba(201,206,214,.16));color:var(--chrome,#c9ced6);
    font:600 .56rem/1.1 var(--wide,Arial,sans-serif);letter-spacing:.14em;text-transform:uppercase;backdrop-filter:blur(10px)}
  .edge .eb svg{width:26px;height:26px}
  .edge .eb[aria-pressed=true]{border-color:var(--red,#ff4a3d);color:var(--chrome-hi,#f3f5f8)}
  body.obs .edge,body.panel-open .edge{display:none}
  body.dz-public .vz,body.dz-public .mz{display:none}`;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  const bar = document.createElement('div'); bar.className = 'spaces'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Spaces');
  const button = (key, label) => `<button class="sp ${key}" type="button" data-space="${key}" aria-pressed="false">${ICON[key]}<span>${label}</span><small></small></button>`;
  bar.innerHTML = button('studio', 'Studio') + button('piano', 'Piano') + button('dj', 'DJ Room')
    + '<button class="sp more" type="button" aria-expanded="false" aria-label="More controls" title="More for this space">⋯</button>';
  dock.insertBefore(bar, ctrl);
  const btn = k => bar.querySelector(`[data-space="${k}"]`), more = bar.querySelector('.more');
  more.addEventListener('click', () => { const open = dock.classList.toggle('more-open'); more.setAttribute('aria-expanded', String(open)); });

  // the edge: views that are always there, whatever plays
  const edge = document.createElement('nav'); edge.className = 'edge'; edge.setAttribute('aria-label', 'Always on');
  edge.innerHTML = [['security', 'cctv', 'CCTV'], ['backstage', 'backstage', 'Backstage']]
    .map(([view, icon, label]) => `<button class="eb" type="button" data-view-edge="${view}" aria-pressed="false">${ICON[icon]}<span>${label}</span></button>`).join('');
  document.body.appendChild(edge);
  edge.addEventListener('click', e => { const b = e.target.closest('[data-view-edge]'); if (!b) return; director.setAuto(false); director.go(b.dataset.viewEdge); });

  /* ----- the Piano Sessions, in show order ----- */
  const PIANO_SONGS = REPERTOIRE.filter(s => s.piano && s.audio && s.audioOk);
  let piano = null;   // { steps, i }
  const pianoPlaying = () => !['IDLE', 'ENDED'].includes(v.show.state);
  function pianoNext() {
    if (!piano || v.show.state !== 'LIVE' || v.show.paused) return;
    const step = piano.steps[piano.i++];
    if (!step) { piano = null; return; }
    if (step.song) { v.pickSong(step.song.id); v.performSong(); }
    else v.showCommand(step.cmd);
  }
  function startPiano() {
    const songs = pick(PIANO_SONGS, 4);
    piano = { i: 0, steps: songs.flatMap((s, k) => (k < songs.length - 1 ? [{ song: s }, { cmd: 'between' }] : [{ song: s }])).concat({ cmd: 'closing' }) };
    v.showCommand(v.show.state === 'IDLE' || v.show.state === 'ENDED' ? 'start' : 'restart');
  }
  const stopPiano = () => { piano = null; if (pianoPlaying()) v.showCommand('stop'); };

  /* ----- the DJ show, in show order ----- */
  const DJ_TRACKS = REPERTOIRE.filter(s => !s.piano && s.audio && s.audioOk && s.bpm);
  const live = liveMusic();
  const track = new Audio(), jingle = new Audio();
  track.crossOrigin = 'anonymous'; track.preload = 'auto'; jingle.preload = 'auto';
  let dj = null;   // { steps, i, el (what plays now), paused }
  // in the visitor's click: both players unlocked for Safari (played and paused at once), the analyser started
  function unlock() {
    for (const a of [track, jingle]) { if (!a.src) a.src = a === jingle ? asset(JINGLE.between) : DJ_TRACKS[0].audio; a.muted = true; a.play().then(() => { a.pause(); a.muted = false; }).catch(() => { a.muted = false; }); }
    live.follow(track);
  }
  function djStep() {
    const step = dj.steps[dj.i++];
    if (!step) { m.setShow('ended'); m.setAuto(false); m.setMusicSource(null); dj = null; return; }
    if (step.opening) { dj.el = null; m.djOpening('start', undefined, 'short'); return; }
    m.djOpening('stop');
    if (step.track) {
      const s = step.track;
      // the set plays in the club: the booth goes down if it is not there yet (an opening cut short, a jump)
      if (m.env !== 'djroom' && !m.travelling) { if (m.lift.state === 'DOWN') m.setEnv('djroom', { transition: false }); else m.transition('down'); }
      track.src = s.audio; track.currentTime = 0; dj.el = track; track.play().catch(() => {});
      m.setMusicSource(dt => live.read(dt)); m.setTempo(s.bpm); m.setMode('PERFORMANCE'); m.setShow('live'); m.setAuto(true);
      m.setTrack({ title: s.title, artist: "DJ Andy'K" });
    } else {
      jingle.src = asset(JINGLE[step.jingle]); jingle.currentTime = 0; dj.el = jingle; jingle.play().catch(() => {});
      m.setMusicSource(null); m.setTrack(null);
      if (step.jingle === 'end') { m.setMode('CLOSING'); m.setAuto(false); m.pickCamera('DJ2'); } else { m.setMode('BREAKDOWN'); m.setShow('break'); }
    }
  }
  function djNext() {
    if (!dj || dj.paused) return;
    const op = m.opening.state;
    if (!dj.el ? (dj.i > 0 && (op === 'ENDED' || op === 'IDLE')) : dj.el.ended) djStep();
  }
  function startDj() {
    const tracks = pick(DJ_TRACKS, 4);
    dj = { i: 0, el: null, paused: false, steps: [{ opening: true }, ...tracks.flatMap((s, k) => (k < tracks.length - 1 ? [{ track: s }, { jingle: 'between' }] : [{ track: s }])), { jingle: 'end' }] };
    djStep();
  }
  function pauseDj() {
    if (!dj) return;
    dj.paused = !dj.paused;
    if (!dj.el) m.djOpening('pause');
    else if (dj.paused) dj.el.pause(); else dj.el.play().catch(() => {});
  }
  function stopDj() {
    if (dj) { track.pause(); jingle.pause(); dj = null; m.setMusicSource(null); m.setTrack(null); m.setAuto(false); }
    if (['PLAYING', 'PAUSED'].includes(m.opening.state)) m.djOpening('stop');
  }

  /* ----- the buttons ----- */
  let active = 'studio', shot = 0;
  const go = {
    studio() {
      if (active === 'studio') { shot = (shot + 1) % SHOTS.length; director.setAuto(false); director.go(SHOTS[shot]); return; }
      stopPiano(); stopDj(); shot = 0;
      if (v.lift.state !== 'LOWERED' && !v.liftHold) v.command('reset');
      // the booth down in the club: it rides back up and the transition ends on the studio
      if (m.lift.state !== 'UP' || m.env === 'djroom') { if (!m.travelling) m.transition('up'); }
      else { director.setAuto(false); director.go('studio'); }
    },
    piano() {
      if (active === 'piano' && pianoPlaying()) return v.showCommand('pause');
      stopDj();
      if (m.env === 'djroom') m.setEnv('studio', { transition: false });
      startPiano();
    },
    dj() {
      if (active === 'dj' && dj) return pauseDj();
      stopPiano(); unlock();
      startDj();
    },
  };
  bar.addEventListener('click', e => {
    const b = e.target.closest('[data-space]'); if (!b) return;
    go[b.dataset.space](); active = b.dataset.space; document.body.dataset.space = active; show();
  });
  document.body.dataset.space = active;

  // the shows move on, and the buttons say what plays (the director's panels and the Broadcast bridge can change it too)
  function show() {
    pianoNext(); djNext();
    for (const k of ['studio', 'piano', 'dj']) btn(k).setAttribute('aria-pressed', String(k === active));
    for (const b of edge.querySelectorAll('[data-view-edge]')) b.setAttribute('aria-pressed', String(director.current === b.dataset.viewEdge));
    const p = v.show;
    const pianoLabel = p.state === 'SONG' ? '♪ ' + (p.song?.title || '') : p.state === 'BETWEEN' ? 'Between songs' : p.state === 'CLOSING' ? 'Closing' : p.state === 'ENDED' ? 'Play again' : 'Piano Sessions';
    const djLabel = !dj ? 'Play again' : dj.paused ? 'Paused · tap to play' : !dj.el ? 'Opening' : dj.el === track ? '♪ ' + (dj.steps[dj.i - 1]?.track?.title || '') : dj.i >= dj.steps.length ? 'Closing' : 'Next track';
    btn('studio').querySelector('small').textContent = active === 'studio' ? 'Next shot' : '';
    btn('piano').querySelector('small').textContent = active !== 'piano' ? 'Piano show' : p.paused ? 'Paused · tap to play' : pianoLabel;
    btn('dj').querySelector('small').textContent = active !== 'dj' ? 'DJ show' : djLabel;
  }
  show();
  return { update: show, get active() { return active; }, get piano() { return piano; }, get dj() { return dj; } };
}
