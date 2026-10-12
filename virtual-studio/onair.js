// The on-air simulation: full screen, broadcast graphics over the 3D studio and its camera director.
// Running order: the theme song (DISTANCE // ZERO) with the music visualiser on the LED wall and a countdown, then the
// opening video on the wall, then the show: the studio film on the wall, repeating, over the Three-Note Signature bed. Always labelled as a simulation; nothing is streamed or recorded.
import { VIEWS } from './views.js';

const VIDEO = { opening: 'assets/video/dz-logo-reveal.mp4', studio: 'assets/video/dz-master-studio.mp4' };
const FADE = 0.6;   // seconds: the studio film is a short clip, so each repeat dissolves into the next
// after the opening, the music bed under the studio: the two Three-Note Signature tracks (the soundtrack's own files,
// streamed from distancezeroshow.com), one after the other, below speech level. The studio film itself stays silent.
const BED = ['music-three-note-signature.mp3', 'music-three-note-signature-b.mp3'], BED_LEVEL = 0.42;
const THEME = 'music-distance-zero.mp3';   // the theme song, before the opening

// the approved D//0 logo (after the key visual), drawn from the same proportions as the 3D logo
const BUG = `<svg class="air-bug" viewBox="-8 -8 226 116" role="img" aria-label="D//0">
<defs><filter id="dzglow" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="1.8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
<g fill="rgba(255,255,255,.08)" stroke-width="2.6" stroke-linejoin="round" fill-rule="evenodd" filter="url(#dzglow)">
<path stroke="#f2a650" d="M0,100 L42,100 A42,42 0 0 0 84,58 L84,42 A42,42 0 0 0 42,0 L0,0 Z M24,78 L44,78 A20,20 0 0 0 64,58 L64,42 A20,20 0 0 0 44,22 L24,22 Z"/>
<path stroke="#f2a650" d="M82,100 L93,100 L122,0 L111,0 Z"/>
<path stroke="#a9c8ee" d="M99,100 L110,100 L139,0 L128,0 Z"/>
<path stroke="#a9c8ee" d="M172,100 L176,100 A34,34 0 0 0 210,66 L210,34 A34,34 0 0 0 176,0 L172,0 A34,34 0 0 0 138,34 L138,66 A34,34 0 0 0 172,100 Z M174,77 A11,11 0 0 0 185,66 L185,34 A11,11 0 0 0 174,23 A11,11 0 0 0 163,34 L163,66 A11,11 0 0 0 174,77 Z"/>
</g></svg>`;

const TICKER = ['SIMULATION — NOT A REAL BROADCAST', 'DISTANCE // ZERO', 'Vienna // Melbourne · 15,731 km',
  'First show Wednesday 27 January 2027 · 10:00 Vienna · 20:00 Melbourne', 'Then every third Sunday of the month', 'distancezeroshow.com'];

const LOWER = { andy: ["DJ ANDY'K", 'Andrej Kneisl · Vienna'], georgie: ['GEORGIE WALKER', 'Melbourne'], piano: ['THE GRAND PIANO', 'Melbourne side'],
  music: ['MUSIC STATION', 'Vienna side'], wall: ['DISTANCE // ZERO', 'Vienna // Melbourne · 15,731 km'] };

const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) k === 'text' ? (e.textContent = v) : k === 'html' ? (e.innerHTML = v) : e.setAttribute(k, v);
  e.append(...kids); return e;
};

export function createOnAir({ studio, director, sound, live, onStart, onEnd, reducedMotion, looks }) {
  let fresh = true, bedOn = false, ownMusic = false;
  let el = null, isOpen = false, music = false, part = 'opening', raf = 0, volume = 0.8, muted = false, autoBefore = true, returnFocus = null;
  let a, b, cur, prev = null, fadeT = 1;          // two video players: the dissolve between repeats needs both
  const ui = {};

  function build() {
    const vid = () => { const v = h('video', { playsinline: '', preload: 'auto', 'aria-hidden': 'true', disablepictureinpicture: '' }); v.playsInline = true; return v; };
    a = vid(); b = vid();
    for (const v of [a, b]) v.addEventListener('ended', () => { if (v === cur && part === 'opening') roll('studio'); });
    // tell the wall when a new video frame is ready, so it redraws in step with the video (no judder)
    const watch = v => { if (!v.requestVideoFrameCallback) return; const cb = () => { fresh = true; v.requestVideoFrameCallback(cb); }; v.requestVideoFrameCallback(cb); };
    watch(a); watch(b);
    const fmt = tz => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const vie = fmt('Europe/Vienna'), mel = fmt('Australia/Melbourne');
    ui.vie = h('b', { text: '--:--' }); ui.mel = h('b', { text: '--:--' });
    ui.clock = () => { const d = new Date(); ui.vie.textContent = vie.format(d); ui.mel.textContent = mel.format(d); };
    ui.l3title = h('b', { text: 'DISTANCE // ZERO' }); ui.l3sub = h('span', { text: 'Opening' });
    ui.cam = h('span', { class: 'air-cam', text: 'CAM 4' });
    const track = h('div', { class: 'air-track' });
    for (let k = 0; k < 2; k++) for (const t of TICKER) track.append(h('span', { text: t }), h('i', { text: '//' }));
    ui.replay = h('button', { type: 'button', class: 'air-b', text: 'Skip to opening' });
    ui.replay.addEventListener('click', () => { if (music) looks.set('broadcast'); opening(); });
    ui.restart = h('button', { type: 'button', class: 'air-b', text: 'From the start' });
    ui.restart.addEventListener('click', () => { if (music) looks.set('broadcast'); start(); });
    // the studio's lighting looks; Music hands the wall back to the music visualiser, the others keep the video
    ui.looks = Object.fromEntries([['broadcast', 'Studio'], ['vienna', 'Vienna'], ['melbourne', 'Melbourne'], ['music', 'Music']].map(([id, label]) =>
      [id, h('button', { type: 'button', class: 'air-b', 'aria-pressed': 'false', text: label })]));
    for (const [id, btn] of Object.entries(ui.looks)) btn.addEventListener('click', () => looks.set(id));
    ui.mute = h('button', { type: 'button', class: 'air-b air-sound', 'aria-pressed': 'false' });
    ui.mute.addEventListener('click', () => { muted = !muted; applySound(); });
    ui.vol = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(volume), class: 'air-vol', 'aria-label': 'Volume' });
    ui.vol.addEventListener('input', () => { volume = +ui.vol.value; muted = volume === 0; applySound(); });
    ui.exit = h('button', { type: 'button', class: 'air-exit', text: 'Exit simulation' });
    ui.exit.addEventListener('click', close);

    el = h('div', { class: 'air', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'On-air simulation. Not a real broadcast.', hidden: '' },
      h('div', { class: 'air-gfx', 'aria-hidden': 'true' },
        h('div', { class: 'air-top' },
          h('div', { class: 'air-onair' }, h('i'), h('b', { text: 'ON AIR' }), h('small', { text: 'Simulation' })),
          h('div', { html: BUG })),
        h('div', { class: 'air-bottom' }, h('div', { class: 'air-l3' }, ui.l3title, ui.l3sub),
          h('div', { class: 'air-meta' }, ui.cam, h('span', { class: 'air-clock' }, 'VIE ', ui.vie, ' · MEL ', ui.mel))),
        h('div', { class: 'air-ticker' }, track)),
      h('p', { class: 'air-notice', text: 'SIMULATION — NOT A REAL BROADCAST' }),
      h('div', { class: 'air-ctl' },
        h('div', { class: 'air-srcs', role: 'group', 'aria-label': 'Look' }, ...Object.values(ui.looks), ui.replay, ui.restart),
        h('div', { class: 'air-snd' }, ui.mute, ui.vol),
        ui.exit));
    document.body.append(el);
    // the players sit behind the 3D canvas, full size: hidden by the studio but "visible" to the browser. Safari and
    // iPhone pause a muted video they consider invisible (power saving), which stopped the studio film
    ui.src = h('div', { class: 'air-src', 'aria-hidden': 'true', hidden: '' }, a, b);
    document.body.prepend(ui.src);
    el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); close(); } });
    // the wall draws whichever player is current, and the outgoing one while they dissolve
    const rvfc = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
    studio.wall.film(() => [[prev, 1 - fadeT], [cur, prev ? fadeT : 1]], () => { if (!rvfc || prev) return true; const f = fresh; fresh = false; return f; });
  }

  // the opening plays with its own sound; from then on the films are silent and the music bed plays
  const filmSound = () => !muted && part === 'opening';
  const tracks = file => sound.tracks.findIndex(t => t.file === file);
  function applySound() {
    for (const v of [a, b]) v.muted = !filmSound();
    if (cur) cur.volume = filmSound() ? volume : 0;
    if (bedOn || part === 'theme') sound.level(muted ? 0 : (part === 'theme' ? 0.85 : BED_LEVEL) * volume / 0.8);
    ui.mute.setAttribute('aria-pressed', String(muted));
    ui.mute.textContent = muted ? 'Sound off' : 'Sound on';
    ui.mute.setAttribute('aria-label', muted ? 'Sound is off. Turn sound on' : 'Sound is on. Turn sound off');
    if (!muted && ui.vol.value === '0') { volume = 0.8; ui.vol.value = '0.8'; }
  }

  function lower(title, sub) { ui.l3title.textContent = title; ui.l3sub.textContent = sub; }

  // put a video on the wall: the opening once, then the studio film as the background
  function roll(which) {
    const was = part; part = which; lastT = -1;
    const next = cur === a ? b : a;
    if (!next.currentSrc.endsWith(VIDEO[which])) next.src = VIDEO[which];   // same clip: no reload, just back to the start
    else if (next.currentTime > 0.05) next.currentTime = 0;
    next.muted = which !== 'opening' || muted; next.volume = next.muted ? 0 : volume;
    if (cur) { prev = cur; fadeT = 0; }
    cur = next;
    cur.play().catch(() => { muted = true; applySound(); cur.play().catch(() => {}); });   // a browser that refuses sound still shows the picture
    if (which === 'opening') { director.setAuto(false); director.go('wall'); }
    else if (was === 'opening') { director.setAuto(true); startBed(); applySound(); }   // then the cameras cut round the studio, over the music bed
    shot(director.current);
  }

  // 1. the theme song: visualiser on the wall, cameras touring, a countdown to the show in the caption
  function start() {
    stopBed(); prev?.pause(); prev = null; fadeT = 1; cur?.pause(); cur = null;
    const i = tracks(THEME);
    if (i < 0) return opening();
    part = 'theme'; fresh = true; lastT = -1;
    studio.wall.set('wave'); director.setAuto(true);
    sound.playlist(null); sound.after(() => opening()); applySound();
    sound.play(i).catch(() => opening());                        // no theme (blocked or offline): straight to the opening
    ui.replay.hidden = false;
    lower('DISTANCE // ZERO', 'The show starts soon');
  }
  // 2. the opening video on the wall, with its own sound
  function opening() {
    sound.after(null); if (part === 'theme') sound.stop();
    prev?.pause(); prev = null; fadeT = 1; cur?.pause(); cur = null;
    ui.replay.hidden = true;
    if (!music) studio.wall.set('film');
    roll('opening');
  }

  function startBed() {
    if (ownMusic) return;                                         // the visitor's own track keeps playing instead
    const ids = BED.map(tracks).filter(i => i >= 0);
    if (!ids.length) return;
    sound.after(null);
    bedOn = true; sound.playlist(ids); sound.level(muted ? 0 : BED_LEVEL * volume / 0.8);
    sound.play(ids[0]).catch(() => {});
  }
  function stopBed() { sound.after(null); if (!bedOn && part !== 'theme') return; bedOn = false; sound.stop(); sound.playlist(null); sound.level(0.85); }

  // a part that does not get going within a few seconds is skipped, so the simulation never hangs on one screen
  let lastProgress = 0, lastT = -1;
  function watchdog(now) {
    if (music) { lastProgress = now; return; }
    const t = part === 'theme' ? sound.state.time : cur ? cur.currentTime : 0;
    if (t !== lastT) { lastT = t; lastProgress = now; return; }
    if (now - lastProgress < (part === 'theme' ? 8000 : 6000)) return;
    lastProgress = now;
    if (part === 'theme') opening();
    else if (part === 'opening') roll('studio');
    else if (part === 'studio') cur?.play().catch(() => studio.wall.set('wave'));   // still stuck: the wall shows the visualiser
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    ui.clock();
    watchdog(now);
    if (part === 'theme' && !music) {                             // countdown to the show while the theme plays
      const st = sound.state, left = Math.max(0, Math.ceil((st.duration || 94) - st.time));
      const txt = `The show starts in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      if (ui.l3sub.textContent !== txt) ui.l3sub.textContent = txt;
    }
    if (prev) {                                                   // dissolve between two players, sound included
      fadeT = Math.min(1, fadeT + 1 / 60 / FADE);
      if (filmSound()) { cur.volume = volume * fadeT; prev.volume = volume * (1 - fadeT); }
      if (fadeT >= 1) { prev.pause(); prev.currentTime = 0; prev = null; }   // parked at the start, ready for the next repeat
    }
    if (!music && part === 'studio' && cur?.duration && !prev && cur.duration - cur.currentTime < FADE) roll('studio');
  }

  // called whenever the studio's look changes: Music shows the visualiser on the wall (as outside the simulation),
  // every other look shows the video, which carries on where it was
  function look(name) {
    for (const [id, btn] of Object.entries(ui.looks || {})) btn.setAttribute('aria-pressed', String(id === name));
    if (!isOpen || (name === 'music') === music) return;
    music = name === 'music';
    if (part === 'theme') { if (!music) lower('DISTANCE // ZERO', 'The show starts soon'); return; }   // the wall is the visualiser anyway
    if (music) { prev?.pause(); prev = null; fadeT = 1; cur?.pause(); studio.wall.set('wave'); lower('MUSIC', 'DISTANCE // ZERO · music'); }
    else { studio.wall.set('film'); cur?.play().catch(() => {}); shot(director.current); }
  }

  function shot(name) {
    if (!isOpen) return;
    const n = name ? VIEWS[name]?.tally : 0;
    ui.cam.textContent = n === 4 ? 'JIB' : n ? `CAM ${n}` : 'PGM';
    if (music || part === 'theme') return;
    if (part === 'opening') return lower('DISTANCE // ZERO', 'Opening');
    lower(...(LOWER[name] || ['DISTANCE // ZERO', 'Live from the virtual studio · simulation']));
  }

  function open() {
    if (isOpen) return;
    if (!el) build();
    isOpen = true; returnFocus = document.activeElement;
    autoBefore = director.auto;
    // the simulation is a show: it takes over the sound (a soundtrack track that was playing makes way for the theme)
    ownMusic = false; muted = false;
    el.hidden = false; document.body.classList.add('air-on');
    el.classList.toggle('still', !!reducedMotion);
    applySound();
    try { if (document.fullscreenEnabled && !document.fullscreenElement) document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {}); } catch {}
    onStart?.();
    music = false;
    if (looks.get() === 'music') looks.set('broadcast');      // the simulation always opens with video 1
    look(looks.get());
    studio.liftLogo(true);                                        // fly the hanging logo up, clear of the video
    // Safari only lets a video start with sound from a click: start both players now, during the click, and pause
    // them at once, so the opening and the studio film can start later on their own, sound included
    ui.src.hidden = false;
    for (const [v, src] of [[a, VIDEO.opening], [b, VIDEO.studio]]) {
      v.src = src; v.muted = false;
      v.play().catch(() => {}); v.pause();                         // the call during the click is what unlocks it
    }
    start();
    cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
    ui.exit.focus({ preventScroll: true });
    if (live) live.textContent = 'On-air simulation opened. This is a simulation, not a real broadcast. Press Escape or Exit simulation to return to the studio.';
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    cancelAnimationFrame(raf);
    for (const v of [a, b]) { v.pause(); v.removeAttribute('src'); v.load(); }
    ui.src.hidden = true;
    stopBed();
    cur = prev = null;
    el.hidden = true; document.body.classList.remove('air-on');
    try { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch {}
    studio.liftLogo(false);
    director.setAuto(autoBefore);
    onEnd?.();                                                    // back to studio preview lighting and the idle wall
    returnFocus?.focus?.({ preventScroll: true });
    if (live) live.textContent = 'Simulation ended. Back in the 3D studio.';
  }

  return { open, close, shot, look, get isOpen() { return isOpen; } };
}
