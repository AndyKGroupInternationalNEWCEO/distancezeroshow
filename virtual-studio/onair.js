// The on-air simulation: full screen, broadcast graphics over the 3D studio and its camera director.
// Running order: the theme song (DISTANCE // ZERO) with the music visualiser on the LED wall and a countdown, then the
// logo video on the wall over the short opener (DISTANCE // ZERO — Opening, 0:35), then the show: the studio film on
// the wall, repeating, over the Three-Note Signature bed. The show's other wall videos (each with its linked jingle) and
// jingles can be played from the Videos and Jingles menus at any time. Always labelled as a simulation; nothing is streamed or recorded.
import { VIEWS } from './views.js';

const VIDEO = { opening: 'assets/video/dz-logo-reveal.mp4', studio: 'assets/video/dz-master-studio.mp4' };
const FADE = 0.6;   // seconds: the studio film is a short clip, so each repeat dissolves into the next
// after the opening, the music bed under the studio: the two Three-Note Signature tracks (the soundtrack's own files,
// streamed from distancezeroshow.com), one after the other, below speech level. The studio film itself stays silent.
const BED = ['music-three-note-signature.mp3', 'music-three-note-signature-b.mp3'], BED_LEVEL = 0.42;
const THEME = 'music-distance-zero.mp3';   // the theme song, before the opening
const OPENER = 'music-opening.mp3';        // under the logo video (which plays without its own sting), then the bed

// the show's jingles and wall videos (silent; loops repeat until another is picked), web versions made by
// virtualspace/show-media.sh from the masters
const JINGLES = [
  ['01-friday-live-opening', 'Friday live opening'], ['02-friday-dj-transition', 'Friday DJ transition'], ['04-short-break', 'Short break'],
  ['05-welcome-back', 'Welcome back'], ['06-next-segment', 'Next segment'], ['07-end-of-show', 'End of show'],
  ['08-world-premiere', 'World premiere'], ['09-special-guest', 'Special guest'], ['10-live-music-session', 'Live music session'],
  ['11-technical-break', 'Technical break'], ['12-coming-up-next', 'Coming up next'], ['13-live-chat-is-open', 'Live chat is open'],
  ['14-calling-lines-are-open', 'Calling lines are open'], ['15-this-is-georgie-walker', 'This is Georgie Walker'],
  ['16-this-is-andrej-kneisl', 'This is Andrej Kneisl'], ['18-show-starting-soon', 'Show starting soon'],
  ['19-friday-show-closing', 'Friday show closing'], ['21-sunday-show-opening', 'Sunday show opening'],
].map(([id, title]) => ({ id: id.slice(0, 2), src: `assets/jingles/${id}.m4a`, title }));
// each video starts together with its linked jingle, as one cue in the Broadcast Studio (its media catalog's
// linkedAudio); Please stand by (20) and Thank you for watching have none here. The two closings run on as the studio's
// sequences: Sunday V14 (with 07 END OF SHOW until its own 21 exists) -> official end credits V23 -> Thank you for
// watching V17; Friday V15 + 19 -> Friday official end credits V24
const CLIPS = [
  ['the-show-starts-soon', 'The show starts soon', '18'], ['friday-live-opening', 'Friday live opening', '01'], ['special-guest', 'Special guest', '09'],
  ['world-premiere', 'World premiere', '08'], ['coming-up-next', 'Coming up next', '12'], ['friday-dj-transition', 'Friday DJ transition', '02'],
  ['live-music-session-loop', 'Live music session', '10', true], ['live-chat-is-open-loop', 'Live chat is open', '13', true],
  ['calling-lines-are-open-loop', 'Calling lines are open', '14', true], ['well-be-right-back', "We'll be right back", '04'],
  ['partner-spot-andyk-music-lab', "Partner spot · Andy'K Music Lab"],
  ['please-stand-by', 'Please stand by'], ['we-are-back', 'We are back', '05'],
  ['sunday-show-closing', 'Sunday show closing', '07', false, ['official-end-credits', 'thank-you-for-watching']],
  ['friday-closing', 'Friday closing', '19', false, ['friday-official-end-credits']],
  ['official-end-credits', 'End credits · Sunday'], ['friday-official-end-credits', 'End credits · Friday'],
  ['thank-you-for-watching', 'Thank you for watching'], ['this-broadcast-has-ended', 'This broadcast has ended', '07'],
].map(([id, title, jingle, loop, then = []]) => ({ id, src: `assets/show/${id}.mp4`, title, loop: !!loop, jingle: JINGLES.find(j => j.id === jingle) || null, then }));

// the shots the on-air camera menu offers (backstage and the security cameras are never on air)
const AIR_SHOTS = ['studio', 'desk', 'andy', 'georgie', 'guest', 'wall', 'crane', 'floor', 'music', 'piano', 'slowmo'];
const LOOK_NAMES = { broadcast: 'Studio', vienna: 'Vienna', melbourne: 'Melbourne', music: 'Music' };

// the official D//0 logo artwork, as on the website and on the hanging logo
const BUG = '<img class="air-bug" src="assets/logo-do.webp" alt="D//0" width="327" height="160">';

const TICKER = ['SIMULATION — NOT A REAL BROADCAST', 'DISTANCE // ZERO', 'Vienna // Melbourne · 15,731 km',
  'First show Wednesday 27 January 2027 · 10:00 Vienna · 20:00 Melbourne', 'Then every third Sunday of the month', 'distancezeroshow.com'];

const LOWER = { andy: ["DJ ANDY'K", 'Andrej Kneisl · Vienna'], georgie: ['GEORGIE WALKER', 'Melbourne'], piano: ['THE GRAND PIANO', 'Melbourne side'],
  music: ['MUSIC STATION', 'Vienna side'], guest: ['SPECIAL GUEST', 'Live at the DISTANCE // ZERO desk'], wall: ['DISTANCE // ZERO', 'Vienna // Melbourne · 15,731 km'] };

const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) k === 'text' ? (e.textContent = v) : k === 'html' ? (e.innerHTML = v) : e.setAttribute(k, v);
  e.append(...kids); return e;
};

export function createOnAir({ studio, director, sound, live, onStart, onEnd, reducedMotion, looks }) {
  let fresh = true, bedOn = false, ownMusic = false, openerOn = false, clip = null;
  const jingle = new Audio(); jingle.preload = 'none';
  let el = null, isOpen = false, music = false, part = 'opening', raf = 0, volume = 0.8, muted = false, autoBefore = true, returnFocus = null;
  let queue = [];                                  // the videos still to come in a closing sequence
  let a, b, cur, prev = null, fadeT = 1;          // two video players: the dissolve between repeats needs both
  const ui = {};

  function build() {
    const vid = () => { const v = h('video', { playsinline: '', preload: 'auto', 'aria-hidden': 'true', disablepictureinpicture: '' }); v.playsInline = true; return v; };
    a = vid(); b = vid();
    for (const v of [a, b]) v.addEventListener('ended', () => { if (v !== cur || (part !== 'opening' && part !== 'clip')) return; if (part === 'clip' && queue.length) playClip(queue.shift(), true); else roll('studio'); });
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
    ui.mute = h('button', { type: 'button', class: 'air-b air-sound', 'aria-pressed': 'false' });
    ui.mute.addEventListener('click', () => { muted = !muted; applySound(); });
    ui.vol = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(volume), class: 'air-vol', 'aria-label': 'Volume' });
    ui.vol.addEventListener('input', () => { volume = +ui.vol.value; muted = volume === 0; applySound(); });
    // the menus (camera, light, videos, jingles): one list open at a time, above the controls
    ui.pick = h('div', { class: 'air-pick', role: 'group', hidden: '' });
    ui.menus = [];
    const menu = (label, items) => {
      const btn = h('button', { type: 'button', class: 'air-b air-menu', 'aria-expanded': 'false' }, h('small', { text: label }), h('b'), h('i', { class: 'chev', 'aria-hidden': 'true' }));
      ui.menus.push(btn);
      btn.addEventListener('click', () => {
        const open = ui.pick.hidden || ui.pick.dataset.list !== label;
        closePick();
        if (!open) return;
        btn.setAttribute('aria-expanded', 'true'); ui.pick.hidden = false;
        ui.pick.dataset.list = label; ui.pick.setAttribute('aria-label', label);
        ui.pick.replaceChildren(...items().map(it => {
          const b = h('button', { type: 'button', class: 'air-b', text: it.title });
          if (it.on != null) b.setAttribute('aria-pressed', String(it.on));
          b.addEventListener('click', () => { it.run(); closePick(); btn.focus(); });
          return b;
        }));
        (ui.pick.querySelector('[aria-pressed="true"]') || ui.pick.querySelector('button'))?.focus();
      });
      return btn;
    };
    ui.camMenu = menu('Camera', () => [{ title: 'Auto cameras', on: director.auto, run: () => { director.setAuto(true); camLabel(); } },
      ...AIR_SHOTS.map(v => ({ title: VIEWS[v].label, on: !director.auto && director.current === v, run: () => { director.setAuto(false); director.go(v); } }))]);
    ui.lookMenu = menu('Light', () => Object.entries(LOOK_NAMES).map(([id, title]) => ({ title, on: looks.get() === id, run: () => looks.set(id) })));
    ui.clips = menu('Videos', () => [{ title: 'Studio film', on: part === 'studio', run: () => roll('studio') },
      ...CLIPS.map(it => ({ title: it.title + (it.loop ? ' · loop' : '') + (it.jingle ? ' ♪' : '') + (it.then.length ? ' → credits' : ''), on: part === 'clip' && clip === it, run: () => playClip(it) }))]);
    ui.jingles = menu('Jingles', () => [...JINGLES.map(it => ({ title: it.title, run: () => playJingle(it) })), { title: 'Stop jingle', run: stopJingle }]);
    ui.clips.querySelector('b').textContent = 'Studio film'; ui.jingles.querySelector('b').textContent = '—';
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
      ui.pick,
      h('div', { class: 'air-ctl' },
        h('div', { class: 'air-srcs', role: 'group', 'aria-label': 'Show controls' }, ...ui.menus, ui.replay, ui.restart),
        h('div', { class: 'air-snd' }, ui.mute, ui.vol),
        ui.exit));
    document.body.append(el);
    // the players sit behind the 3D canvas, full size: hidden by the studio but "visible" to the browser. Safari and
    // iPhone pause a muted video they consider invisible (power saving), which stopped the studio film
    ui.src = h('div', { class: 'air-src', 'aria-hidden': 'true', hidden: '' }, a, b);
    document.body.prepend(ui.src);
    el.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (!ui.pick.hidden) { const btn = ui.menus.find(o => o.getAttribute('aria-expanded') === 'true'); closePick(); btn?.focus(); }   // focus back in the dialog: the next Escape ends it
      else close();
    });
    jingle.addEventListener('ended', () => { ui.jingles.querySelector('b').textContent = '—'; applySound(); });
    // the wall draws whichever player is current, and the outgoing one while they dissolve
    const rvfc = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
    studio.wall.film(() => [[prev, 1 - fadeT], [cur, prev ? fadeT : 1]], () => { if (!rvfc || prev) return true; const f = fresh; fresh = false; return f; });
  }

  // the wall videos are silent: the opener, the bed and the jingles carry the sound
  const filmSound = () => false;
  const tracks = file => sound.tracks.findIndex(t => t.file === file);
  function applySound() {
    for (const v of [a, b]) v.muted = !filmSound();
    if (cur) cur.volume = filmSound() ? volume : 0;
    const duck = jingle.paused ? 1 : 0.15;                       // a jingle plays over the music, which dips under it
    if (bedOn || openerOn || part === 'theme') sound.level(muted ? 0 : (bedOn ? BED_LEVEL : 0.85) * duck * volume / 0.8);
    jingle.volume = muted ? 0 : Math.min(1, volume / 0.8);
    ui.mute.setAttribute('aria-pressed', String(muted));
    ui.mute.textContent = muted ? 'Sound off' : 'Sound on';
    ui.mute.setAttribute('aria-label', muted ? 'Sound is off. Turn sound on' : 'Sound is on. Turn sound off');
    if (!muted && ui.vol.value === '0') { volume = 0.8; ui.vol.value = '0.8'; }
  }

  function lower(title, sub) { ui.l3title.textContent = title; ui.l3sub.textContent = sub; }

  // put a video on the wall: the opening once, then the studio film as the background
  function roll(which, src = VIDEO[which], loop = false) {
    const was = part; part = which; lastT = -1;
    if (which !== 'clip') { clip = null; queue = []; ui.clips.querySelector('b').textContent = which === 'opening' ? 'Opening' : 'Studio film'; }
    const next = cur === a ? b : a;
    if (!next.currentSrc.endsWith(src)) next.src = src;           // same clip: no reload, just back to the start
    else if (next.currentTime > 0.05) next.currentTime = 0;
    next.loop = loop;
    next.muted = true; next.volume = 0;
    if (cur) { prev = cur; fadeT = 0; }
    cur = next;
    cur.play().catch(() => { muted = true; applySound(); cur.play().catch(() => {}); });   // a browser that refuses sound still shows the picture
    if (which === 'opening' || which === 'clip') { director.setAuto(false); director.go('wall'); }   // the wall in full
    else if (was === 'opening' || was === 'clip') { director.setAuto(true); if (!openerOn) startBed(); applySound(); }   // the cameras cut round the studio; the bed follows the opener
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
    startOpener();
  }
  // the short opener under the logo video; when it ends, the music bed takes over
  function startOpener() {
    const i = tracks(OPENER);
    if (ownMusic || i < 0) return;
    openerOn = true; sound.playlist(null);
    sound.after(() => { openerOn = false; startBed(); applySound(); });
    applySound();
    sound.play(i).catch(() => { openerOn = false; sound.after(null); if (part !== 'opening') startBed(); });
  }

  // one of the show's other wall videos; a single one returns to the studio film when it ends, a loop repeats
  function playClip(it, next = false) {
    if (!next) queue = it.then.map(id => CLIPS.find(c => c.id === id)).filter(Boolean);
    if (music) looks.set('broadcast');
    if (part === 'theme') { sound.after(null); sound.stop(); }
    if (part === 'theme' || part === 'opening') { director.setAuto(true); if (!bedOn && !openerOn) startBed(); }
    clip = it; studio.wall.set('film');
    roll('clip', it.src, it.loop);
    lower('DISTANCE // ZERO', it.title);
    ui.clips.querySelector('b').textContent = it.title;
    if (it.jingle) playJingle(it.jingle);
  }
  function camLabel() { ui.camMenu.querySelector('b').textContent = director.auto ? 'Auto' : VIEWS[director.current]?.label || 'Free'; }
  function closePick() {
    ui.pick.hidden = true;
    for (const o of ui.menus) o.setAttribute('aria-expanded', 'false');
  }
  function playJingle(it) {
    ui.jingles.querySelector('b').textContent = it.title;
    jingle.src = it.src; jingle.currentTime = 0;
    jingle.play().then(applySound).catch(() => {});
    applySound();
  }
  function stopJingle() { jingle.pause(); ui.jingles.querySelector('b').textContent = '—'; applySound(); }

  function startBed() {
    if (ownMusic) return;                                         // the visitor's own track keeps playing instead
    const ids = BED.map(tracks).filter(i => i >= 0);
    if (!ids.length) return;
    sound.after(null);
    bedOn = true; sound.playlist(ids); sound.level(muted ? 0 : BED_LEVEL * volume / 0.8);
    sound.play(ids[0]).catch(() => {});
  }
  function stopBed() { sound.after(null); if (!bedOn && !openerOn && part !== 'theme') return; bedOn = false; openerOn = false; sound.stop(); sound.playlist(null); sound.level(0.85); }

  // a part that does not get going within a few seconds is skipped, so the simulation never hangs on one screen
  let lastProgress = 0, lastT = -1;
  function watchdog(now) {
    if (music) { lastProgress = now; return; }
    const t = part === 'theme' ? sound.state.time : cur ? cur.currentTime : 0;
    if (t !== lastT) { lastT = t; lastProgress = now; return; }
    if (now - lastProgress < (part === 'theme' ? 8000 : 6000)) return;
    lastProgress = now;
    if (part === 'theme') opening();
    else if (part === 'opening' || part === 'clip') roll('studio');
    else if (part === 'studio') cur?.play().catch(() => studio.wall.set('wave'));   // still stuck: the wall shows the visualiser
  }

  let lastNow = 0;
  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.1, lastNow ? (now - lastNow) / 1000 : 1 / 60); lastNow = now;   // real frame time: the dissolve lasts FADE on any machine
    ui.clock();
    watchdog(now);
    if (part === 'theme' && !music) {                             // countdown to the show while the theme plays
      const st = sound.state, left = Math.max(0, Math.ceil((st.duration || 94) - st.time));
      const txt = `The show starts in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      if (ui.l3sub.textContent !== txt) ui.l3sub.textContent = txt;
    }
    if (prev) {                                                   // dissolve between two players, sound included
      fadeT = Math.min(1, fadeT + dt / FADE);
      if (filmSound()) { cur.volume = volume * fadeT; prev.volume = volume * (1 - fadeT); }
      if (fadeT >= 1) { prev.pause(); prev.currentTime = 0; prev = null; }   // parked at the start, ready for the next repeat
    }
    if (!music && part === 'studio' && cur?.duration && !prev && cur.duration - cur.currentTime < FADE) roll('studio');
  }

  // called whenever the studio's look changes: Music shows the visualiser on the wall (as outside the simulation),
  // every other look shows the video, which carries on where it was
  function look(name) {
    if (ui.lookMenu) ui.lookMenu.querySelector('b').textContent = LOOK_NAMES[name] || name;
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
    camLabel();
    if (music || part === 'theme') return;
    if (part === 'opening') return lower('DISTANCE // ZERO', 'Opening');
    if (part === 'clip' && clip) return lower('DISTANCE // ZERO', clip.title);
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
    stopBed(); stopJingle();
    closePick();
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
