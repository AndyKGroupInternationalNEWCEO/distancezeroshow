// The visitor's three buttons: STUDIO, PIANO, DJ ROOM, at the bottom of the page in place of the studio's control
// bar (which folds into "⋯" and then shows only what belongs to the space chosen). Each takes the visitor to its
// space and plays it as a show:
//   PIANO    the Piano Sessions: opening and theme, then four piano songs with the between-songs ident after each of
//            the first three, then the closing (show.js plays each recording; this runs the order)
//   DJ ROOM  the DJ show: opening 1 (the booth rides down into the club), four of DJ Andy'K's tracks with the Friday
//            transition jingle between them, then the Friday closing; the light follows each track (live-music.js)
// A second press pauses (PIANO, DJ ROOM) or moves on to the next studio shot (STUDIO). Only one space plays at a time:
// going to another stops the last. The press is also the gesture that lets Safari and the iPhone start the sound.
// On the edge, what is always there: CCTV, Backstage and AFTERSHOW (the studio once the show is over: the work light
// on, the wall's last card, and a slow walk round what the cameras never show). A show that ends goes there by itself.
// The Piano Stage's and the DJ Room's own panels are for the director: shown only with ?director in the address.
//   v: the Vienna Piano Stage (vienna/index.js) with the DJ Room as v.melbourne (melbourne/index.js, withVienna)
import { REPERTOIRE } from './vienna/repertoire.js';
import { liveMusic } from './melbourne/live-music.js';
import { VIEWS, ZONES } from './views.js';
import { applyProbe } from './melbourne/probes.js';

const SHOTS = ['studio', 'desk', 'wall', 'crane', 'floor'];
// AFTERSHOW: the views no show camera takes, walked slowly in turn
const AFTER = {
  aWide: { label: 'After the show', long: 'After the show · work light', pos: [9.2, 5.4, 9.4], target: [0, 1.0, -2.0], fov: 46, drift: 0.1 },
  aCams: { label: 'After the show', long: 'Behind the cameras', pos: [1.4, 1.75, 10.6], target: [0, 1.3, 3.0], fov: 44, drift: 0.08 },
  aTruss: { label: 'After the show', long: 'From the lighting truss', pos: [0.4, 7.4, 5.2], target: [0, 0, -1.2], fov: 62, drift: 0.05 },
};
const AFTER_TOUR = ['aWide', 'aCams', 'aTruss', 'securityLounge', 'backstage'];
// CCTV: the security monitor, switching by itself between the cameras of the studio, backstage, reception and entrance
const CCTV = ['security', 'securityLounge', 'secReception', 'secBuilding'];
// the building and its reception (building.js, the arrival's set): a place of its own, reached by a cut; loaded the
// first time it is asked for. The front faces +z at FZ = 34
const FZ = 34;
const PLACES = {
  // (within the orbit's 15 m: the camera is never further than that from what it looks at)
  building: { label: 'Building', long: 'The studio building · night', pos: [6.4, 1.6, FZ + 12.6], target: [0, 4.4, FZ], fov: 64, drift: 0.05, tally: 0, place: true },
  // the security cameras out there: one high in the lobby, one on a pole across the street at the entrance
  secReception: { label: 'Security', long: 'Security · reception', pos: [4.6, 3.3, FZ - 0.8], target: [-1.0, 0.6, FZ - 7.5], fov: 80, drift: 0, tally: 0, cctv: 'SEC 3 · RECEPTION', place: true },
  secBuilding: { label: 'Security', long: 'Security · entrance', pos: [-8.6, 5.4, FZ + 8.6], target: [0, 1.0, FZ + 1.0], fov: 70, drift: 0, tally: 0, cctv: 'SEC 4 · ENTRANCE', place: true },
  reception: { label: 'Reception', long: 'Reception · the way to backstage', pos: [-3.4, 1.65, FZ - 1.0], target: [0.9, 1.05, FZ - 7.6], fov: 56, drift: 0.04, tally: 0, place: true },
};
for (const [k, v] of Object.entries(PLACES)) VIEWS[k] ??= v;
for (const [k, v] of Object.entries(AFTER)) VIEWS[k] ??= { tally: 0, ...v };
const JINGLE = { between: 'assets/jingles/02-friday-dj-transition.m4a', end: 'assets/jingles/19-friday-show-closing.m4a' };
// the shows' cards (the jingle videos made for the broadcast, muted: the page plays the sound): full screen over the
// studio as an ident starts (STAY TUNED, the DJ transition) or as the closing ends (THANK YOU, the Friday closing)
const CARD = { psSoon: 'assets/video/shows/ps-starting-soon.mp4', psBetween: 'assets/video/shows/ps-stay-tuned.mp4', psEnd: 'assets/video/shows/ps-thank-you.mp4',
  djBetween: 'assets/video/shows/dj-transition.mp4', djEnd: 'assets/video/shows/dj-closing.mp4' };
const asset = p => new URL('../' + p, import.meta.url).href;
// a song's cover: its album's artwork from djandykofficial.com (assets/covers, 192 px)
const cover = s => s && asset('assets/covers/' + s.id.split('/')[0] + '.jpg');
// in the DJ set, every 1–2 minutes a look from further off: down through the glass, the studio and the stage, the crane
const WIDE = ['mDJ6', 'djwide', 'crane'];
// the show's cards play on the studio's LED wall, seen from in front of the desk with the wall filling the picture
// (the hanging logo flies up out of the way, as in the studio's own simulation)
const CARD_VIEW = 'onWall';
VIEWS[CARD_VIEW] ??= { label: 'LED wall', long: 'The LED wall · on air', pos: [0, 1.95, 5.6], target: [0, 2.55, -6], fov: 50, drift: 0.05, tally: 2 };
const pick = (list, n) => [...list].sort(() => Math.random() - 0.5).slice(0, n);

const ICON = {
  studio: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6 33c8-5 28-5 36 0"/><path d="M9 33v6m30-6v6"/><rect x="15" y="9" width="13" height="9" rx="1.5"/><path d="M28 12l6-3v9l-6-3"/><path d="M21.5 18v8m-5 0h10"/></svg>',
  piano: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M7 30h34v-3c0-6-4-9-10-9-3 0-4-6-11-6-7 0-13 6-13 12z"/><path d="M7 30v4h34v-4"/><path d="M12 34v6m24-6v6"/><path d="M13 30v-3m4 3v-3m4 3v-3m4 3v-3m4 3v-3m4 3v-3"/></svg>',
  dj: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="17" cy="27" r="9"/><circle cx="17" cy="27" r="2"/><path d="M30 18h11v18H30z"/><path d="M33 23h5m-5 4h5m-5 4h5"/><path d="M9 16a15 12 0 0 1 30 0"/><rect x="6" y="15" width="5" height="8" rx="2"/><rect x="37" y="15" width="5" height="8" rx="2"/></svg>',
  after: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M30 8a16 16 0 1 0 10 26A13 13 0 0 1 30 8z"/><path d="M14 40h20"/></svg>',
  building: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 40V12h20v28M28 20h12v20"/><path d="M13 18h3m4 0h3m-10 6h3m4 0h3m-10 6h3m4 0h3M33 26h3m-3 6h3"/><path d="M4 40h40"/></svg>',
  reception: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6 30h36v10H6z"/><path d="M10 30v-4h28v4"/><circle cx="24" cy="14" r="5"/><path d="M16 26c1-4 4-6 8-6s7 2 8 6"/></svg>',
  cctv: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 14l26 8-3 8-26-8z"/><path d="M34 22l6 2"/><path d="M14 24l-2 10H6"/></svg>',
  backstage: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M12 40V8h20l4 4v28"/><path d="M8 40h32"/><circle cx="28" cy="25" r="1.5"/></svg>',
};

export function spaces(v, ctx) {
  const m = v.melbourne, director = ctx.director;
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
  .spaces .sp small{font-weight:400;font-size:.6rem;letter-spacing:.08em;text-transform:none;color:var(--dim,#8a9099);min-height:1.1em;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .spaces .sp .art{width:38px;height:38px;border-radius:6px;object-fit:cover;box-shadow:0 0 0 1px rgba(255,255,255,.18)}
  .spaces .sp .art[hidden]{display:none}
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
  body.dz-public .vz,body.dz-public .mz{display:none}
  .sp-card{display:none}
  .dock:not(.more-open) .sp-row{display:none}
  /* minimised: only a small button to bring the controls back; nothing else over the picture */
  body.sp-min .dock .row,body.sp-min .dock .pop,body.sp-min .dock .fine,body.sp-min .edge,body.sp-min .spaces > :not(.min){display:none!important}
  body.sp-min .spaces .min{transform:rotate(180deg);opacity:.55}
  body.sp-min .spaces .min:hover{opacity:1}
  body[data-space=piano] .dock .row.ctrl:not(.sp-row),body[data-space=dj] .dock .row.ctrl:not(.sp-row){display:none}
  body:not([data-space=piano]) .sp-row[data-for=piano],body:not([data-space=dj]) .sp-row[data-for=dj]{display:none}
  .spaces .small{align-self:center;width:auto;height:44px;padding:0 14px;border-radius:22px;font-size:.6rem;letter-spacing:.16em;flex-direction:row}`;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  const bar = document.createElement('div'); bar.className = 'spaces'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Spaces');
  const button = (key, label) => `<button class="sp ${key}" type="button" data-space="${key}" aria-pressed="false">${ICON[key]}<img class="art" alt="" hidden><span>${label}</span><small></small></button>`;
  bar.innerHTML = button('studio', 'Studio') + button('piano', 'Piano') + button('dj', 'DJ Room')
    + '<button class="sp more" type="button" aria-expanded="false" aria-label="More controls" title="More for this space">⋯</button>'
    + '<button class="sp small" type="button" data-global="programme" title="The programme, as on distancezeroshow.com">Programme</button>'
    + '<button class="sp small" type="button" data-global="info" title="How the Virtual Space works">Info</button>'
    + '<button class="sp more min" type="button" aria-label="Hide the controls" title="Hide the controls (to watch)">▾</button>';
  dock.insertBefore(bar, ctrl);
  const btn = k => bar.querySelector(`[data-space="${k}"]`), more = bar.querySelector('.more');
  more.addEventListener('click', () => { const open = dock.classList.toggle('more-open'); more.setAttribute('aria-expanded', String(open)); });
  const minBtn = bar.querySelector('.min');
  minBtn.addEventListener('click', () => { const min = document.body.classList.toggle('sp-min'); minBtn.setAttribute('aria-label', min ? 'Show the controls' : 'Hide the controls'); minBtn.title = min ? 'Show the controls' : 'Hide the controls (to watch)'; });
  // PROGRAMME: the whole programme wherever the visitor is (the dates button under ⋯ shows the space's own); INFO: how it works
  const liveBtn = document.getElementById('liveBtn');
  let programmeAll = false;
  liveBtn?.addEventListener('click', () => { document.body.dataset.programme = programmeAll ? 'all' : ''; programmeAll = false; }, true);
  bar.querySelector('[data-global=programme]').addEventListener('click', () => { programmeAll = true; liveBtn?.click(); });
  bar.querySelector('[data-global=info]').addEventListener('click', () => window.open('how-it-works', '_blank', 'noopener'));

  // the edge: views that are always there, whatever plays
  const edge = document.createElement('nav'); edge.className = 'edge'; edge.setAttribute('aria-label', 'Always on');
  edge.innerHTML = [['building', 'building', 'Building'], ['reception', 'reception', 'Reception'], ['backstage', 'backstage', 'Backstage'], ['security', 'cctv', 'CCTV'], ['after', 'after', 'Aftershow']]
    .map(([view, icon, label]) => `<button class="eb" type="button" data-view-edge="${view}" aria-pressed="false">${ICON[icon]}<span>${label}</span></button>`).join('');
  document.body.appendChild(edge);
  edge.addEventListener('click', e => {
    const b = e.target.closest('[data-view-edge]'); if (!b) return;
    wallHold = false;
    if (b.dataset.viewEdge === 'after') { cctv.stop(); return afterShow.on ? afterShow.stop() : afterShow.start(); }
    if (b.dataset.viewEdge === 'security') { afterShow.stop(); m.releaseCameras(); return cctv.on ? cctv.stop() : cctv.start(); }
    cctv.stop();
    afterShow.stop(); director.setAuto(false); m.releaseCameras();
    const view = b.dataset.viewEdge;
    if (PLACES[view]) return place().then(() => director.go(view, { instant: true }));
    // a cut, never a walk: the walk backstage is for the studio's own BACKSTAGE door, not for these buttons
    director.go(view, { instant: true });
  });

  /* ----- the building and the reception: built the first time, shown only while the camera is out there ----- */
  ZONES.push({ has: p => p.z > 18, keep(p) { p.y = Math.max(0.25, p.y); } });
  // the backstage lounge's reflections, rendered in Cycles (as the studio's): its own room in the lacquer and glass
  applyProbe(ctx.renderer, 'backstage', [ctx.studio.lounge.group], { shared: new Set(Object.values(ctx.studio.M).filter(x => x?.isMaterial)) }).catch(() => {});
  let street = null;
  const place = () => (street ??= (async () => {
    const [{ buildStreet }, { RGBELoader }, THREE] = await Promise.all([import('./building.js'), import('three/addons/loaders/RGBELoader.js'), import('three')]);
    const hdr = await new RGBELoader().setDataType(THREE.FloatType).loadAsync(asset('assets/cc0/modern_buildings_night_1k.hdr'));
    const px = hdr.image.data; for (let i = 0; i < px.length; i++) if ((i & 3) !== 3) px[i] = Math.min(px[i], 1.6);   // as the arrival: lamps as glints
    const pm = new THREE.PMREMGenerator(ctx.renderer), env = pm.fromEquirectangular(hdr).texture; hdr.dispose(); pm.dispose();
    const st = buildStreet(env, { cc0: asset('assets/cc0/'), furnish: true }); ctx.scene.add(st.group); await st.ready;
    // the reflections rendered in Cycles (production/gpu, cache-places): inside the doors the reception's, outside the
    // street's. Without the files the materials keep their own environment
    const lobby = [], street = [], at = new THREE.Vector3();
    st.group.traverse(o => { if (o.isMesh && !o.isReflector) (o.getWorldPosition(at).z < FZ - 0.1 ? lobby : street).push(o); });
    applyProbe(ctx.renderer, 'street', street).then(() => applyProbe(ctx.renderer, 'reception', lobby)).catch(() => {});
    return st;
  })());
  const outside = () => ctx.camera.position.z > 15;
  let shownOut = null, studioFog = null;

  /* ----- CCTV: the cameras in turn, cut, every 6 s ----- */
  const cctv = {
    on: false, i: 0, next: 0,
    start() { this.on = true; this.i = 0; director.setAuto(false); place(); this.step(); },
    stop() { this.on = false; },
    step() {
      const view = CCTV[this.i++ % CCTV.length];
      if (VIEWS[view].place && !street) return this.step();   // the building still loading: the next camera
      (VIEWS[view].place ? place() : Promise.resolve()).then(() => { if (this.on) director.go(view, { instant: true }); });
      this.next = performance.now() + 6000;
    },
    update() { if (this.on && performance.now() > this.next) this.step(); },
  };

  /* ----- AFTERSHOW ----- */
  const afterShow = {
    on: false, i: 0, next: 0,
    start() { stopPiano(); stopDj(); cctv.stop(); ended = null; this.on = true; this.i = 0; this.next = 0; ctx.setAfterShow?.(true); director.setAuto(false); this.step(); },
    stop() { if (!this.on) return; this.on = false; ctx.setAfterShow?.(false); },
    step() { director.go(AFTER_TOUR[this.i++ % AFTER_TOUR.length]); this.next = performance.now() + 9000; },
    update() { if (this.on && performance.now() > this.next) this.step(); },
  };
  let ended = null;   // when a show ended: AFTERSHOW follows a few seconds later

  /* ----- the cards: one video element, full screen, faded in and out ----- */
  const cardEl = document.createElement('video');
  Object.assign(cardEl, { muted: true, playsInline: true, preload: 'auto', className: 'sp-card' });
  document.body.appendChild(cardEl);
  let cardOf = null;   // which card shows (so each plays once per moment)
  // the card on the LED wall (the wall's own video programme, as the studio's simulation uses), the camera on the wall,
  // the logo up; while it plays the shot stays on the wall. A show's closing card stays on its last frame
  let wallBefore = null, onWall = false, wallHold = false;   // wallHold: the camera stays on the wall (until the visitor picks one)
  function card(name, { manual = false } = {}) {
    if (cardOf === name && !manual) return; cardOf = name;
    cardEl.src = asset(CARD[name]); cardEl.currentTime = 0; cardEl.play().catch(() => {});
    if (!onWall) { wallBefore = v.source; onWall = true; }
    v.setSource('main'); ctx.studio.wall.film(() => [[cardEl, 1]]); ctx.studio.wall.set('film'); ctx.studio.liftLogo(true);
    director.setAuto(false); director.go(CARD_VIEW, { instant: true }); wallHold = true;
    cardEl.onended = () => { if (manual || !name.endsWith('End')) wallOff(); };
  }
  function wallOff() {
    if (!onWall) return; onWall = false;
    ctx.studio.wall.set('idle'); ctx.studio.liftLogo(false); if (wallBefore && wallBefore !== 'main') v.setSource(wallBefore);
  }
  const cardOff = () => { cardOf = null; cardEl.pause(); wallOff(); };

  /* ----- the Piano Sessions, in show order ----- */
  const PIANO_SONGS = REPERTOIRE.filter(s => s.piano && s.audio && s.audioOk);
  let piano = null;   // { steps, i }
  const pianoPlaying = () => !['IDLE', 'ENDED'].includes(v.show.state);
  function pianoNext() {
    if (piano?.soon && !piano.held && performance.now() > piano.soonUntil) beginPiano();
    if (!piano || piano.soon || v.show.state !== 'LIVE' || v.show.paused) return;
    const step = piano.steps[piano.i++];
    if (!step) { piano = null; return; }
    if (step.song) { v.pickSong(step.song.id); v.performSong(); }
    else v.showCommand(step.cmd);
  }
  function startPiano() {
    const songs = pick(PIANO_SONGS, 4);
    // (the song player gets its first song now, so that it can be unlocked: a player without a source cannot be)
    const sp = v.show.audio?.song; if (sp && !sp.src) sp.src = songs[0].audio;
    unlockAll(pianoPlayers());
    piano = { i: 0, steps: songs.flatMap((s, k) => (k < songs.length - 1 ? [{ song: s }, { cmd: 'between' }] : [{ song: s }])).concat({ cmd: 'closing' }) };
    // first STARTING SOON over the studio (the card's length), then the openings
    if (pianoPlaying()) v.showCommand('stop');
    piano.soon = true; card('psSoon', { manual: true });
    cardEl.addEventListener('ended', () => { if (piano?.soon) beginPiano(); }, { once: true });
    piano.soonUntil = performance.now() + 14000;   // (in case the card cannot play)
  }
  function beginPiano() { if (!piano?.soon) return; piano.soon = false; v.showCommand(v.show.state === 'IDLE' || v.show.state === 'ENDED' ? 'start' : 'restart'); }
  const stopPiano = () => { piano = null; cardOff(); if (pianoPlaying()) v.showCommand('stop'); };   // (also ends a STARTING SOON)

  /* ----- the DJ show, in show order ----- */
  const DJ_TRACKS = REPERTOIRE.filter(s => !s.piano && s.audio && s.audioOk && s.bpm);
  const live = liveMusic();
  const track = new Audio(), jingle = new Audio();
  track.crossOrigin = 'anonymous'; track.preload = 'auto'; jingle.preload = 'auto';
  let dj = null;   // { steps, i, el (what plays now), paused }
  // Safari (and the iPhone) let a page start a sound only from the visitor's click, element by element. So in that click
  // every player the show will use later is started muted and paused at once: the openings, the idents, the songs, the
  // DJ tracks and jingles. Later they may play on their own, on the show's clock
  function unlockAll(list) {
    for (const a of list) {
      if (!a || a.dataset?.unlocked) continue;
      if (a.dataset) a.dataset.unlocked = '1';
      // play and pause in the same moment: that is enough for Safari, and nothing is left to pause a player the show
      // starts a moment later
      const was = a.muted; a.muted = true;
      a.play()?.catch?.(() => {}); a.pause(); a.muted = was;
    }
  }
  const pianoPlayers = () => Object.values(v.show.audio || {});
  const djPlayers = () => [m.openings?.big?.audio, m.openings?.short?.audio];
  // in the visitor's click: both players unlocked for Safari (played and paused at once), the analyser started
  function unlock() {
    unlockAll(djPlayers());
    for (const a of [track, jingle]) { if (!a.src) a.src = a === jingle ? asset(JINGLE.between) : DJ_TRACKS[0].audio; a.muted = true; a.play().then(() => { a.pause(); a.muted = false; }).catch(() => { a.muted = false; }); }
    live.follow(track);
  }
  function djStep() {
    const step = dj.steps[dj.i++];
    if (!step) { m.setShow('ended'); m.setAuto(false); m.setMusicSource(null); dj.over = true; dj.el = null; dj.done = true; return; }
    if (step.opening) {
      dj.el = null;
      // the opening starts with the booth up in the studio: after an earlier show it rides back up first
      if (m.lift.state !== 'UP' || m.env === 'djroom' || m.travelling) { dj.waitUp = true; if (!m.travelling) m.transition('up'); }
      else m.djOpening('start', undefined, 'short');
      return;
    }
    m.djOpening('stop');
    if (step.track) {
      const s = step.track;
      // the set plays in the club: the booth goes down if it is not there yet (an opening cut short, a jump)
      if (m.env !== 'djroom' && !m.travelling) { if (m.lift.state === 'DOWN') m.setEnv('djroom', { transition: false }); else m.transition('down'); }
      track.src = s.audio; track.currentTime = 0; dj.el = track; track.play().catch(() => {});
      m.setTempo(s.bpm); m.setMode('PERFORMANCE'); m.setShow('live'); m.setAuto(true);
      m.setTrack({ title: s.title, artist: "DJ Andy'K" });
      // the booth plays it: decks 2 and 3 in turn (by the mixer), its channel's fader up, the crossfader to its side
      const deck = dj.deck = dj.deck === 1 ? 2 : 1, other = deck === 1 ? 2 : 1;
      m.setDeck(deck + 1, { title: s.title, artist: "DJ Andy'K", bpm: s.bpm, key: s.key || '', state: 'play', position: 0, duration: s.seconds || 0, pitch: 0 });
      m.setDeck(other + 1, { state: 'stop', position: 0 });
      const ch = [0, 1, 2, 3].map(i => ({ fader: i === deck ? 0.85 : 0, low: 0.5, mid: 0.5, hi: 0.5, filter: 0.5, trim: 0.55 }));
      m.setMixer({ ch, xfader: deck === 1 ? 0.25 : 0.75, master: 0.8 });
      m.setMusicSource(dt => live.read(dt), deck);
      dj.wideAt = performance.now() + 60000;
    } else {
      jingle.src = asset(JINGLE[step.jingle]); jingle.currentTime = 0; dj.el = jingle; jingle.play().catch(() => {});
      m.setMusicSource(null); m.setTrack(null);
      if (dj.deck) m.setDeck(dj.deck + 1, { state: 'pause' });
      if (step.jingle === 'end') { m.setMode('CLOSING'); m.setAuto(false); m.pickCamera('DJ2'); } else { m.setMode('BREAKDOWN'); m.setShow('break'); }
    }
  }
  function djNext() {
    if (!dj || dj.paused || dj.done) return;
    if (dj.el === track && performance.now() > dj.wideAt) { dj.wideAt = performance.now() + 60000 + Math.random() * 60000; director.go(WIDE[(dj.wideI = (dj.wideI || 0) + 1) % WIDE.length]); }
    if (dj.waitUp) { if (!m.travelling && m.lift.state === 'UP') { dj.waitUp = false; m.djOpening('start', undefined, 'short'); } return; }
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
    if (dj.el === track && dj.deck) m.setDeck(dj.deck + 1, { state: dj.paused ? 'pause' : 'play', position: track.currentTime });
  }
  function stopDj() {
    if (dj) { cardOff(); track.pause(); jingle.pause(); for (const n of [2, 3]) m.setDeck(n, { state: 'stop', position: 0 }); dj = null; m.setMusicSource(null); m.setTrack(null); m.setAuto(false); }
    if (['PLAYING', 'PAUSED'].includes(m.opening.state)) m.djOpening('stop');
  }

  /* ----- ⋯ at the Piano Stage and in the DJ Room: the space's own controls ----- */
  // each: a button, or a menu of buttons opening above the bar (one at a time, like the studio's Camera and Light)
  const CONTROLS = {
    piano: [
      [() => (piano || pianoPlaying() ? 'Finish Piano show' : 'Simulate Piano show'), () => (piano || pianoPlaying() ? finish('piano') : simulate('piano'))],
      ['Camera', [['P1 Main front', () => v.pickCamera('P1')], ['P2 Keyboard', () => v.pickCamera('P2')], ['P3 Side', () => v.pickCamera('P3')], ['P4 Lift reveal', () => v.pickCamera('P4')], ['P5 Tracking', () => v.pickCamera('P5')], ['4K high-speed', () => v.pickCamera('P6')]]],
      ['Light', [['Warm piano', () => v.setMode('WARM PIANO')], ['Cinematic', () => v.setMode('CINEMATIC')], ['Performance', () => v.setMode('PERFORMANCE')], ['Concert look', () => v.setLook(true)], ['Studio look', () => v.setLook(false)], ['Key light on', () => v.setKey(true)], ['Key light off', () => v.setKey(false)]]],
      ['Effects', [['Lift up', () => v.command('up')], ['Lift down', () => v.command('down')], ['Cinematic rise', () => v.command('cinematic')]]],
      ['Video', [['Stay tuned', () => card('psBetween', { manual: true })], ['Thank you', () => card('psEnd', { manual: true })]]],
      ['Jingles', [['Between songs', () => v.showCommand('between')], ['Closing', () => v.showCommand('closing')]]],
      ['♪ Piano', () => document.getElementById('musicBtn')?.click()],
    ],
    dj: [
      [() => (dj && !dj.done ? 'Finish DJ show' : 'Simulate DJ show'), () => (dj && !dj.done ? finish('dj') : simulate('dj'))],
      ['Camera', [...['DJ1', 'DJ2', 'DJ3', 'DJ4', 'DJ5', 'DJ6'].map(k => [k, () => m.pickCamera(k)]), ['4K high-speed', () => m.pickCamera('HS')]]],
      ['Light', [['Opening', 'OPENING'], ['Performance', 'PERFORMANCE'], ['Breakdown', 'BREAKDOWN'], ['Build-up', 'BUILD-UP'], ['Drop', 'DROP'], ['Closing', 'CLOSING']].map(([l, k]) => [l, () => m.setMode(k)])],
      ['Effects', [['Lasers on', () => m.lasers(true)], ['Lasers off', () => m.lasers(false)], ['Fog burst', () => m.fog(3)], ['Disco ball', () => m.disco(discoOn = !discoOn)], ['Strobe', () => m.strobe(m.report().strobe ? 0 : 1)]]],
      ['Video', [['DJ transition', () => card('djBetween', { manual: true })], ['Friday closing', () => card('djEnd', { manual: true })]]],
      ['Jingles', [['DJ transition', () => playJingle('between')], ['Friday closing', () => playJingle('end')]]],
      ['♪ DJ booth', () => document.getElementById('musicBtn')?.click()],
    ],
  };
  function simulate(space) {
    afterShow.stop(); cctv.stop(); ended = null; active = space; document.body.dataset.space = space;
    if (space === 'piano') { stopDj(); if (m.env === 'djroom') m.setEnv('studio', { transition: false }); startPiano(); }
    else { stopPiano(); unlock(); stopDj(); startDj(); }
    closeMenus(); show();
  }
  // FINISH: the show ends cleanly and the space is put back at rest, ready for the next one: the music and the cards
  // stop, the Piano Stage's lift goes down, the DJ booth rides back up into the studio, the light returns to the
  // studio's, and the camera to the wide studio shot
  function finish(space) {
    afterShow.stop(); cctv.stop(); ended = null;
    if (space === 'piano') { stopPiano(); if (v.lift.state !== 'LOWERED' && !v.liftHold) v.command('reset'); director.setAuto(false); director.go('studio'); }
    else { stopDj(); m.setShow('ended'); m.setMode('CLOSING'); if (m.lift.state !== 'UP' || m.env === 'djroom') { if (!m.travelling) m.transition('up'); } else director.go('studio'); }
    closeMenus(); show();
  }
  function playJingle(which) { stopDj(); jingle.src = asset(JINGLE[which]); jingle.currentTime = 0; jingle.play().catch(() => {}); }
  let discoOn = false;
  const pops = [], dynamic = [];   // (menu labels that follow the state: Simulate / Finish)
  const closeMenus = () => { pops.forEach(p => { p.hidden = true; }); dock.querySelectorAll('.sp-row [aria-expanded]').forEach(b => b.setAttribute('aria-expanded', 'false')); };
  for (const [space, items] of Object.entries(CONTROLS)) {
    const row = document.createElement('div'); row.className = 'row ctrl sp-row'; row.dataset.for = space;
    for (const [label, what] of items) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'b' + (Array.isArray(what) ? ' mbtn' : '');
      b.textContent = typeof label === 'function' ? label() : label;
      if (typeof label === 'function') dynamic.push([b, label]);
      if (Array.isArray(what)) {
        const pop = document.createElement('div'); pop.className = 'pop'; pop.hidden = true; pop.setAttribute('role', 'group'); pop.setAttribute('aria-label', label);
        for (const [l, fn] of what) { const x = document.createElement('button'); x.type = 'button'; x.className = 'b'; x.textContent = l; x.addEventListener('click', () => { if (label === 'Camera') wallHold = false; fn(); closeMenus(); }); pop.appendChild(x); }
        dock.insertBefore(pop, ctrl); pops.push(pop);
        b.setAttribute('aria-expanded', 'false'); b.insertAdjacentHTML('beforeend', '<i class="chev" aria-hidden="true"></i>');
        b.addEventListener('click', () => { const open = pop.hidden; closeMenus(); pop.hidden = !open; b.setAttribute('aria-expanded', String(open)); });
      } else b.addEventListener('click', () => { closeMenus(); what(); });
      row.appendChild(b);
    }
    dock.insertBefore(row, ctrl.nextSibling);
  }
  more.addEventListener('click', closeMenus);

  /* ----- the buttons ----- */
  let active = 'studio', shot = 0;
  const go = {
    studio() {
      // the studio's own simulation (onair.js) starts at once; pressed again it ends
      const air = ctx.air;
      if (active === 'studio' && air?.isOpen) return air.close();
      stopPiano(); stopDj(); shot = 0;
      if (air && !air.isOpen) air.open();
      if (v.lift.state !== 'LOWERED' && !v.liftHold) v.command('reset');
      // the booth down in the club: it rides back up and the transition ends on the studio
      if (m.lift.state !== 'UP' || m.env === 'djroom') { if (!m.travelling) m.transition('up'); }
      else { director.setAuto(false); director.go('studio'); }
    },
    piano() {
      if (active === 'piano' && piano?.soon) { piano.held = !piano.held; if (piano.held) cardEl.pause(); else { cardEl.play().catch(() => {}); piano.soonUntil = performance.now() + 14000; } return; }
      if (active === 'piano' && pianoPlaying()) return v.showCommand('pause');
      stopDj();
      if (m.env === 'djroom') m.setEnv('studio', { transition: false });
      startPiano();
    },
    dj() {
      if (active === 'dj' && dj && !dj.done) return pauseDj();
      stopPiano(); unlock();
      startDj();
    },
  };
  // SIMULATE ON AIR at the Piano Stage or in the DJ Room: that space's show from its opening (not the studio's own
  // simulation, which would take the wall and the light away from it)
  document.getElementById('onair')?.addEventListener('click', e => {
    if (active !== 'piano' && active !== 'dj') return;
    e.stopImmediatePropagation();
    afterShow.stop(); ended = null;
    if (active === 'piano') { stopDj(); if (m.env === 'djroom') m.setEnv('studio', { transition: false }); startPiano(); }
    else { stopPiano(); unlock(); stopDj(); startDj(); }
    dock.classList.remove('more-open'); more.setAttribute('aria-expanded', 'false'); show();
  }, true);
  bar.addEventListener('click', e => {
    const b = e.target.closest('.sp[data-space]'); if (!b) return;   // (not body[data-space]: ⋯, Programme and Info are in this bar too)
    afterShow.stop(); cctv.stop(); ended = null;
    go[b.dataset.space](); active = b.dataset.space; document.body.dataset.space = active; show();
  });
  document.body.dataset.space = active;

  // ⋯ speaks the space's language: at the Piano Stage only the piano's things, in the DJ Room only the DJ's
  const LABELS = {
    studio: { onair: 'Simulate on air', music: '♪ Music station', live: 'Show schedule' },
    piano: { onair: 'Simulate Piano show', music: '♪ Piano', live: 'Piano Sessions dates' },
    dj: { onair: 'Simulate DJ show', music: '♪ DJ booth', live: 'DJ Show dates' },
  };
  const ui = { onair: document.querySelector('#onair span'), music: document.getElementById('musicBtn'), live: document.getElementById('liveBtn') };
  let labelled = null;
  function relabel() {
    if (labelled === active) return; labelled = active;
    const l = LABELS[active];
    if (ui.onair && !document.body.classList.contains('sim')) ui.onair.textContent = l.onair;
    if (ui.music) ui.music.textContent = l.music;
    if (ui.live) ui.live.textContent = l.live;
  }
  relabel();

  // the shows move on, and the buttons say what plays (the director's panels and the Broadcast bridge can change it too)
  function show() {
    pianoNext(); djNext(); afterShow.update(); cctv.update(); relabel();
    for (const [b, f] of dynamic) { const t = f(); if (b.textContent !== t) b.textContent = t; }
    // the cards, by what the shows are doing
    const P = v.show;
    if (active === 'piano' && P.state === 'BETWEEN') card('psBetween');
    else if (active === 'piano' && P.state === 'CLOSING' && P.duration && P.time > P.duration - 11.4) card('psEnd');
    else if (active === 'dj' && dj?.el === jingle && dj.steps[dj.i - 1]?.jingle === 'between') card('djBetween');
    else if (active === 'dj' && dj?.el === jingle && dj.steps[dj.i - 1]?.jingle === 'end' && jingle.duration && jingle.currentTime > jingle.duration - 8.4) card('djEnd');
    // a between card belongs to its ident: once the ident is over it can come again at the next one
    if (cardOf === 'psBetween' && P.state !== 'BETWEEN') cardOf = null;
    if (cardOf === 'djBetween' && dj?.el !== jingle) cardOf = null;
    if (cardOf?.endsWith('End') && afterShow.on) cardOff();
    // while a card plays the camera stays on the wall (the show's own cuts wait)
    if (onWall && wallHold && !cardEl.paused && !cardEl.ended && director.current !== CARD_VIEW && !afterShow.on) director.go(CARD_VIEW, { instant: true });
    // paused with the show
    const held = (active === 'piano' && (P.paused || !!piano?.held)) || !!dj?.paused;
    if (onWall && !cardEl.ended && held !== cardEl.paused) { if (held) cardEl.pause(); else cardEl.play().catch(() => {}); }
    // the building only while the camera is out there (its lights and wet street cost nothing in the studio then)
    if (street && outside() !== shownOut) {
      shownOut = outside(); street.then(st => { st.group.visible = shownOut; });
      // the studio's haze is the studio's: out on the street the night is clear enough to see the building
      if (ctx.scene.fog) { studioFog ??= ctx.scene.fog.density; ctx.scene.fog.density = shownOut ? 0.004 : studioFog; }
    }
    // a show that has run to its end hands over to AFTERSHOW
    const over = (active === 'piano' && v.show.state === 'ENDED' && !piano) || (active === 'dj' && dj?.over);
    if (over && !afterShow.on) { ended ??= performance.now(); if (performance.now() - ended > 6000) afterShow.start(); }
    for (const k of ['studio', 'piano', 'dj']) btn(k).setAttribute('aria-pressed', String(k === active));
    for (const b of edge.querySelectorAll('[data-view-edge]')) b.setAttribute('aria-pressed', String(b.dataset.viewEdge === 'after' ? afterShow.on : b.dataset.viewEdge === 'security' ? cctv.on : director.current === b.dataset.viewEdge));
    const p = v.show;
    const pianoLabel = piano?.soon ? (piano.held ? 'Paused · tap to play' : 'Starting soon') : p.state === 'SONG' ? '♪ ' + (p.song?.title || '') : p.state === 'BETWEEN' ? 'Between songs' : p.state === 'CLOSING' ? 'Closing' : p.state === 'ENDED' ? 'Play again' : 'Piano Sessions';
    const djLabel = !dj || dj.done ? 'Play again' : dj.paused ? 'Paused · tap to play' : !dj.el ? 'Opening' : dj.el === track ? '♪ ' + (dj.steps[dj.i - 1]?.track?.title || '') : dj.i >= dj.steps.length ? 'Closing' : 'Next track';
    btn('studio').querySelector('small').textContent = ctx.air?.isOpen ? 'On air · tap to end' : 'Simulate on air';
    btn('piano').querySelector('small').textContent = active !== 'piano' ? 'Piano show' : p.paused ? 'Paused · tap to play' : pianoLabel;
    btn('dj').querySelector('small').textContent = active !== 'dj' ? 'DJ show' : djLabel;
    // the cover of what plays, in place of the icon
    const djSong = dj?.el === track ? dj.steps[dj.i - 1]?.track : null, pianoSong = v.show.state === 'SONG' ? v.show.song : null;
    for (const [k, song] of [['dj', active === 'dj' && djSong], ['piano', active === 'piano' && pianoSong]]) {
      const img = btn(k).querySelector('.art'), svg = btn(k).querySelector('svg'), src = song ? cover(song) : '';
      if (img.dataset.src !== src) { img.dataset.src = src; if (src) img.src = src; img.hidden = !src; svg.style.display = src ? 'none' : ''; }
    }
  }
  show();
  return { update: show, get active() { return active; }, get piano() { return piano; }, get dj() { return dj; }, afterShow, place };
}
