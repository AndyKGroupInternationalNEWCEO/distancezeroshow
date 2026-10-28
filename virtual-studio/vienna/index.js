// Vienna Piano Stage, wired into the studio page: the stage (stage.js), the lift controller (lift.js), cameras P1–P5
// as studio viewpoints, the lighting modes, the cinematic lift sequence, the main LED wall's display source, and the
// stage's control panel. Passed to start() as `extend` (see main.js); the public studio page does not load it.
import * as THREE from 'three';
import { VIEWS } from '../views.js';
import { AMBER, ICE } from '../screens.js';
import { createLift } from './lift.js';
import { buildStage } from './stage.js';
import { LIFT, CAMS, STUDIO_PIANO_VIEW, PIANO, platformTop, at } from './layout.js';
import { cineRobot } from '../set.js';
import { OPENING } from './opening.js';
import { createShow } from './show.js';
import { concertLook } from './concert-look.js';
import { createKeyPlayer } from './keys.js';
import { PARTS as TRANSCRIBED } from './piano-parts.js';
import { SCORES } from './score-parts.js';
import { SHEETS } from './sheets.js';
import { REPERTOIRE } from './repertoire.js';
import { ARRANGEMENTS, ARRANGEMENT_PARTS, ARRANGEMENT_SHEETS } from './arrangements.js';

const WARM = '#ffd9b0', WHITE = '#fff4e8', TUNGSTEN = '#ffb46b';
// lighting modes: each group's [level, colour, (moving heads) pattern | (under) pulse], the haze in the beams, and the
// stage's architectural LEDs (`frame`)
export const MODES = {
  'WARM PIANO': { perimeter: [0.8, WARM], moving: [0.25, WARM, 'center'], accent: [0.45, AMBER], spot: [0.55, TUNGSTEN], under: [0.2, AMBER, 0], haze: 0.35, frame: 0.8 },
  CINEMATIC: { perimeter: [0.3, WARM], moving: [0.55, ICE, 'sweep'], accent: [0.9, ICE], spot: [0.85, TUNGSTEN], under: [0.35, ICE, 0], haze: 1, frame: 0.5 },
  PERFORMANCE: { perimeter: [1, WHITE], moving: [1, AMBER, 'fast'], accent: [1, AMBER], spot: [1, TUNGSTEN], under: [0.8, AMBER, 1], haze: 0.8, frame: 1.2 },
  BLACKOUT: { perimeter: [0, WARM], moving: [0, WARM, 'center'], accent: [0, AMBER], spot: [0, TUNGSTEN], under: [0, AMBER, 0], haze: 0, frame: 0.06 },
  'LIFT REVEAL': { perimeter: [0.12, WARM], moving: [0.7, ICE, 'track'], accent: [0.3, AMBER], spot: [0, TUNGSTEN], under: [1, AMBER, 1], haze: 1, frame: 0.4 },
};
const GROUPS = ['perimeter', 'moving', 'accent', 'spot', 'under'];
// what the studio's LED wall can show. The Melbourne stage and the media player are later phases
export const SOURCES = [
  ['main', 'Main studio'], ['vienna', 'Vienna piano live'], ['melbourne', 'Melbourne DJ live', 'Phase 2'],
  ['selected', 'Selected camera'], ['media', 'Media / graphics', 'Phase 3'], ['off', 'Off'],
];

export function vienna({ renderer, scene, camera, controls, director, studio, quality, reducedMotion, sound }) {
  const stage = buildStage({ studio, scene });
  const lift = createLift(LIFT);

  /* ----- light state: eased towards the mode (plus any per-group override from the sequence) ----- */
  let mode = 'WARM PIANO', override = {}, masterGoal = 1;
  const L = { haze: 0, frame: 0, master: 1 };   // master: an overall fader (the Piano Show's closing takes it down slowly)
  for (const g of GROUPS) L[g] = { level: 0, color: new THREE.Color(), pattern: 'center', pulse: 0 };
  const goalColor = new THREE.Color();
  function easeLights(dt) {
    const m = MODES[mode], k = 1 - Math.exp(-dt * 2.2);
    L.master += (masterGoal - L.master) * (1 - Math.exp(-dt * 0.7));
    for (const g of GROUPS) {
      const [level, color, extra] = m[g], s = L[g];
      s.level += ((override[g] ?? level) * L.master - s.level) * k;
      s.color.lerp(goalColor.set(color), k);
      if (g === 'moving') s.pattern = extra;
      if (g === 'under') s.pulse += (extra - s.pulse) * k;
    }
    L.haze += (m.haze * L.master - L.haze) * k;
    L.frame += (m.frame * L.master - L.frame) * k;
  }

  /* ----- cameras P1–P5: studio viewpoints whose position rides with the lift ----- */
  const keys = Object.keys(CAMS);
  const id = k => 'v' + k;
  const STUDIO_IN = 10.8;   // m from the studio's centre (0, 1): a camera stays this far inside its wall
  const eased = Object.fromEntries(keys.map(k => [k, 0]));   // each camera's own view of the lift height (P5 lags)
  let t = 0;
  const shot = (k, h, pos = new THREE.Vector3(), target = new THREE.Vector3()) => {
    const c = CAMS[k], top = platformTop(h), d = reducedMotion ? 0 : c.drift || 0;
    pos.set(c.pos[0] + Math.sin(t * 0.13) * d, c.pos[1] + c.rise * h + Math.sin(t * 0.09) * d * 0.35, c.pos[2] + Math.cos(t * 0.11) * d * 0.6);
    target.set(c.target[0], c.targetRise !== undefined ? c.target[1] + c.targetRise * h : top + c.target[1], c.target[2]);
    // the cinematic lens: a longer focal length, the camera stepped back so the shot keeps the same framing (as the
    // 4K high-speed camera's look: compressed, calm, the grand standing out of the room)
    if (c.lens) pos.sub(target).multiplyScalar(Math.tan((c.fov * Math.PI) / 360) / Math.tan((c.fov * c.lens * Math.PI) / 360)).add(target);
    // but never out through the studio's wall: stepped back that far (P5 went to 12.6 m from the studio's centre, the
    // wall is at 11.8) the wall filled half the picture. The camera stops on its line to the grand, 10.8 m out
    const out = Math.hypot(pos.x, pos.z - 1);
    if (out > STUDIO_IN) {
      let lo = 0, hi = 1;   // the share of the way from the target to the camera that stays inside
      for (let i = 0; i < 20; i++) { const m = (lo + hi) / 2, x = target.x + (pos.x - target.x) * m, z = target.z + (pos.z - target.z) * m; if (Math.hypot(x, z - 1) > STUDIO_IN) hi = m; else lo = m; }
      pos.sub(target).multiplyScalar(lo).add(target);
    }
    return { pos, target };
  };
  for (const k of keys) {
    const c = CAMS[k], s = shot(k, 0);
    // solo: the studio goes down round the stage, as on the studio's own piano shot (main.js), not quite as far
    VIEWS[id(k)] = { label: c.label, long: c.long, pos: s.pos.toArray(), target: s.target.toArray(), fov: c.fov * (c.lens || 1), drift: 0, tally: 0, cam: c.name, free: true, vienna: k, solo: 0.6, ...(k === 'P6' ? { slow: 0.3 } : {}) };
  }
  // CAM P6, the 4K high-speed camera, is the studio's motion-control robot (set.js) here too: on its own track beside
  // the stage, on the side away from the studio cameras, on a camera tower that rides up with the lift. Its programme:
  // along the keys from the bass end, up over the hands, the pianist's profile, over the lid, low on the hands
  const P = (along, across, y) => { const [x, z] = at(along, across); return [x, y, z]; };
  const pianoMoves = [
    [1.0, 0.1, P(1.4, -1.05, 0.85), P(0.95, 0.3, 0.72)],
    [1.2, 0.4, P(1.7, -1.1, 1.6), P(1.0, 0, 0.75)],
    [1.1, 1.0, P(2.3, -1.2, 1.35), P(1.55, 0, 1.2)],
    [1.3, -0.8, P(0.2, -1.3, 1.9), P(-0.4, 0.2, 0.9)],
    [1.0, -0.2, P(1.25, -1.05, 0.55), P(1.05, 0.2, 0.8)],
  ];
  // (should the robot fail, P6 stays the fixed camera it was)
  let robot = null;
  try { robot = cineRobot(studio.M, { moves: pianoMoves, at: P(1.2, -2.8, 0), rotY: PIANO.rotY - Math.PI / 2, rail: 3.2, parkX: -1.4, park: P(0, 0, 0.9), base: () => platformTop(lift.height) });
    robot.group.userData.equipment = '4K camera robot · Piano Stage'; scene.add(robot.group); } catch (e) { console.error('piano robot:', e); robot = null; }
  let robotK = 1;
  // the studio's own piano shot (key 9) follows the grand up as well; with the lift down it is exactly as before
  const studioPiano = { pos: [...VIEWS.piano.pos], target: [...VIEWS.piano.target] };
  const pianoShot = (h, pos = new THREE.Vector3(), target = new THREE.Vector3()) => {
    pos.set(studioPiano.pos[0], studioPiano.pos[1] + STUDIO_PIANO_VIEW.rise * h, studioPiano.pos[2]);
    target.set(studioPiano.target[0], studioPiano.target[1] + platformTop(h), studioPiano.target[2]);
    return { pos, target };
  };

  /* ----- the stage's programme camera (what "Vienna piano live" shows), and cuts ----- */
  let program = 'P1';
  const cut = (k, { instant = false } = {}) => {
    program = k;
    director.setAuto(false);
    director.go(id(k), { instant });
  };

  /* ----- the cinematic opening, on the jingle's clock (opening.js): lights down, under-platform light, the lift sets
     off so the platform arrives on the jingle's hit, cameras follow it up, performance spot, final frame ----- */
  let seq = null;
  const history = [];   // what the opening did and when (seconds into it): shown in the panel's message line, read by tests
  const say = text => { ui.msg.textContent = text; if (seq && text) history.push({ t: +seq.t.toFixed(2), text, view: director.current, h: +lift.height.toFixed(2) }); };
  // how long a full rise takes, from the lift's own motion profile: the lift sets off this long before the hit
  const RISE = (() => { const l = createLift(LIFT); l.command('up'); let s = 0; while (l.state !== 'ELEVATED' && s < 60) { l.step(1 / 60); s += 1 / 60; } return s; })();
  const jingle = new URLSearchParams(location.search).get('jingle') || (OPENING.audio && new URL(`../../${OPENING.audio}`, import.meta.url).href);
  const cueTime = c => (c.at || 0) + ({ lift: Math.max(0, OPENING.hit - RISE), hit: OPENING.hit, end: OPENING.duration }[c.from] ?? 0);
  const cues = OPENING.cues.map(c => ({ ...c, time: cueTime(c) })).sort((a, b) => a.time - b.time);
  function cinematic() {
    if (seq) return say('Cinematic opening already running');
    if (show.segment || show.state === 'PREPARING') return say('The Piano Show is running: STOP SHOW first');
    if (lift.state !== 'LOWERED') return say('Lower the platform first (DOWN or RESET)');
    seq = { t: 0, next: 0, cams: true, lights: true, audio: null, clock: 'internal' };
    history.length = 0;
    // the jingle, if it is there: its clock drives the opening once it plays; until then (or without it) our own clock
    if (jingle) {
      const a = new Audio(jingle); a.preload = 'auto';
      a.addEventListener('playing', () => { if (seq?.audio === a) seq.clock = 'jingle'; });
      a.play().catch(() => {});
      seq.audio = a;
    }
    runSequence(0);
  }
  function fire(c) {
    if (c.lights && seq.lights) mode = c.lights;
    if (c.hold) for (const g of c.hold) override[g] = 0;
    if (c.release === 'all') override = {}; else if (c.release) delete override[c.release];
    if (c.set) Object.assign(override, c.set);
    if (c.cut && seq.cams) cut(c.cut, { instant: true });
    if (c.lift) lift.command(c.lift);
    if (c.say) say('Cinematic: ' + c.say);
  }
  function runSequence(dt) {
    if (!seq) return;
    const a = seq.audio;
    seq.t = seq.clock === 'jingle' && a && !a.paused ? Math.max(seq.t, a.currentTime) : seq.t + dt;
    while (seq && seq.next < cues.length && seq.t >= cues[seq.next].time) fire(cues[seq.next++]);
    if (seq && seq.next >= cues.length) { seq.audio = null; seq = null; }   // the jingle plays out on its own
  }
  function abortSequence(why) { if (!seq) return; seq.audio?.pause(); seq = null; override = {}; say(why); }

  /* ----- the Piano Show (show.js): official opening → piano theme → live; it drives the same cuts, lights and lift ----- */
  let frozen = false;   // the lift holds still while the show is paused
  // LIFT HOLD: the lift stays where it is, whatever plays. The Piano Show plays, lights and cuts as usual but never
  // moves it; the lift's buttons and the cinematic sequence are refused until the director releases the hold
  let liftHold = false;
  const show = createShow({ rise: RISE, api: {
    cut: k => cut(k, { instant: true }),
    lights(m, c = {}) {
      if (m) mode = m;
      if (c.release === 'all') override = {}; else if (c.release) delete override[c.release];
      if (c.hold) for (const g of c.hold) override[g] = 0;
      if (c.set) Object.assign(override, c.set);
      if (c.master !== undefined) masterGoal = c.master;
    },
    lift: c => liftHold ? { ok: false, reason: 'Lift hold' } : lift.command(c),
    liftState: () => lift.state,
    liftHeld: () => liftHold,
    freezeLift: on => { frozen = on; },
    say: text => say(text),
  } });
  function showCommand(name) {
    if (name !== 'pause' && name !== 'video') abortSequence('Cinematic sequence cancelled');
    show.command(name);
  }

  /* ----- commands (the panel's buttons) ----- */
  function command(name) {
    if (liftHold && name !== 'stop') return say('Lift hold: the lift stays where it is (release the hold first)');
    if (name === 'cinematic') return cinematic();
    // the lift's own buttons always work, also during the Piano Show (which then leaves the lift to the operator)
    show.manual('lift'); frozen = false;
    if (name === 'stop' || name === 'reset') abortSequence(name === 'stop' ? 'Stopped: sequence cancelled' : 'Reset: sequence cancelled');
    const r = lift.command(name);
    if (!r.ok) say(r.reason);
    else if (name === 'reset') { mode = 'WARM PIANO'; override = {}; say('Reset: platform returning to the deck'); }
    else if (name !== 'stop') say('');
  }
  function setLiftHold(on) {
    liftHold = !!on;
    if (liftHold) { abortSequence('Lift hold: sequence cancelled'); if (lift.moving) lift.command('stop'); }
    say(liftHold ? `Lift hold on: the lift stays ${lift.moving ? 'where it stops' : 'where it is'}` : 'Lift hold off: the lift answers its buttons and the show again');
  }
  function setMode(name) {
    mode = name; masterGoal = 1;
    show.manual('lights');
    if (seq) { seq.lights = false; override = {}; }   // the operator has the lights now; the lift carries on
  }
  function pickCamera(k) {
    if (seq) seq.cams = false;     // the operator has the cameras now
    show.manual('cams');
    program = k;
    director.setAuto(false);
    director.go(id(k));
  }

  /* ----- the main LED wall's source: the studio's own programme, a live picture rendered from a camera, or black ----- */
  let source = 'main';
  const wallMat = (() => { let m = null; studio.root.traverse(o => { if (o.isMesh && o.material?.emissiveMap === studio.wall.texture) m = o.material; }); return m; })();
  const WALL_ASPECT = 2048 / 860;
  const feed = {
    // the live picture on the studio's LED wall (the DJ Room, the Piano Stage): at the wall's own resolution (2048 × 860,
    // as its canvas) on desktops and broadcast, with 4× MSAA; lighter on phones and tablets
    rt: new THREE.WebGLRenderTarget(quality.mobile ? 1024 : 2048, quality.mobile ? 430 : 860, { type: THREE.HalfFloatType, samples: quality.mobile ? 0 : 4 }),
    cam: new THREE.PerspectiveCamera(40, WALL_ASPECT, 0.05, 80),
    at: 0,
    black: new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1),
  };
  feed.black.needsUpdate = true;
  feed.rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
  // the wall's own texture is drawn mirrored (it is seen from inside the curve): the feed the same way
  feed.rt.texture.wrapS = THREE.RepeatWrapping; feed.rt.texture.repeat.x = -1;
  feed.black.wrapS = THREE.RepeatWrapping;
  let reflectors = null;
  const feedShot = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  function renderFeed(t) {
    if (!wallMat) return;
    if (source === 'main') { wallMat.emissiveMap = studio.wall.texture; return; }
    if (source === 'off') { wallMat.emissiveMap = feed.black; return; }
    if (t - feed.at < 1 / 15) return;                     // 15 pictures a second: a wall seen across the room, and a whole extra render each
    feed.at = t;
    const extra = sources[source];
    if (extra && !extra.wanted()) return;                 // a later stage's feed renders only while its picture is seen
    if (extra) extra.shot(feed.cam);
    else if (source === 'vienna') {
      shot(program, eased[program], feedShot.pos, feedShot.target);
      feed.cam.position.copy(feedShot.pos); feed.cam.lookAt(feedShot.target);
      // the shot is framed for 16:9: the wall is wider, so keep the height and show more at the sides
      feed.cam.fov = CAMS[program].fov * (CAMS[program].lens || 1);
    } else {                                              // 'selected': the operator's own camera
      feed.cam.position.copy(camera.position); feed.cam.quaternion.copy(camera.quaternion); feed.cam.fov = camera.fov;
    }
    feed.cam.updateProjectionMatrix();
    // no picture of a picture: while the feed renders, the wall shows its own programme (never the feed itself), the
    // mirror floor is left out and the shadow maps are not redrawn
    reflectors ??= (() => { const r = []; scene.traverse(o => { if (o.isReflector) r.push(o); }); return r; })();
    const shown = reflectors.map(o => o.visible), auto = renderer.shadowMap.autoUpdate, before = renderer.getRenderTarget();
    reflectors.forEach(o => { o.visible = false; }); renderer.shadowMap.autoUpdate = false;
    wallMat.emissiveMap = studio.wall.texture;
    extra?.before?.(feed.cam);
    renderer.setRenderTarget(feed.rt); renderer.render(scene, feed.cam);
    extra?.after?.(renderer, feed.rt);
    renderer.setRenderTarget(before);
    reflectors.forEach((o, i) => { o.visible = shown[i]; }); renderer.shadowMap.autoUpdate = auto;
    wallMat.emissiveMap = feed.rt.texture;
  }
  function setSource(name) { source = name; feed.at = -1; if (wallMat && name === 'main') wallMat.emissiveMap = studio.wall.texture; }
  // a later stage on the same page (the Melbourne DJ room) adds its own live feed for the wall:
  // { shot(cam): pose the feed camera, wanted(): render now?, before(cam) / after(renderer, target): around the render }
  const sources = {};
  function addSource(name, provider) {
    sources[name] = provider;
    const b = document.querySelector(`.vz [data-src="${name}"]`); if (b) { b.disabled = false; b.removeAttribute('title'); }
  }

  /* ----- only draw the stage while it can be seen ----- */
  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4();
  const visible = () => {
    if (source === 'vienna') return true;
    camera.updateMatrixWorld();
    pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    return frustum.setFromProjectionMatrix(pv).intersectsBox(stage.bounds);
  };

  /* ----- the panel ----- */
  // the optional front key light on the grand (?key=1 to start with it on): a real light, so it is added or taken out of
  // the scene once (every material recompiles: choose it before going on air), not dimmed to zero at a cost
  const setKey = on => { stage.keyLight(on); say(on ? 'Key light on' : 'Key light off'); };
  // the concert look, the Piano Sessions' look (concert-look.js): on unless ?look=studio; the panel switches it
  const look = concertLook({ renderer, scene, stage });
  if (new URLSearchParams(location.search).get('look') === 'concert') look.set(true);   // the studio look by default: everything is seen in it

  /* ----- the repertoire (DJ Andy'K's song library, repertoire.js) and the grand's keys (keys.js) ----- */
  // the parts transcribed from the recordings (piano-parts.js): the keys follow the one that belongs to what plays,
  // a repertoire song or a Piano Sessions recording ('sessions/opening' …). Unapproved parts play only with
  // ?keys=preview, for DJ Andy'K to watch before he signs them off
  // where a song has its sheet music (score-parts.js), the keys play the score on the desk; the others their transcription
  const PARTS = { ...TRANSCRIBED };
  for (const [id, s] of Object.entries(SCORES)) if (s.approved) PARTS[id] = s;
  // DJ Andy'K's piano arrangements of his songs (arrangements.js): no recording, the grand plays their notes itself
  Object.assign(PARTS, ARRANGEMENT_PARTS);
  const SONGS = [...REPERTOIRE, ...ARRANGEMENTS], PAGES = { ...SHEETS, ...ARRANGEMENT_SHEETS };
  const keyPlayer = createKeyPlayer(studio.piano.userData.keyboard);
  const preview = new URLSearchParams(location.search).get('keys') === 'preview';
  const parts = {}, loading = new Map();   // id → the loaded part (once fetched)
  const usable = id => PARTS[id] && (PARTS[id].approved || preview);
  const fetchPart = id => {
    if (!usable(id)) return null;
    if (!loading.has(id)) loading.set(id, fetch(new URL('../../' + PARTS[id].file, import.meta.url)).then(r => r.ok ? r.json() : null)
      .then(p => { if (p) parts[id] = { ...p, approved: PARTS[id].approved || { by: 'preview', on: 'unapproved' } }; return parts[id]; }).catch(() => null));
    return loading.get(id);
  };
  const partInfo = id => usable(id) ? { kind: 'piano-part', source: PARTS[id].source + (PARTS[id].approved ? '' : ' (preview, not yet approved)') } : null;
  let keysFor = null, sheetShown = '';   // the id whose part the key player holds
  let picked = REPERTOIRE.find(s => s.piano) || REPERTOIRE[0];
  const pickSong = id => { picked = SONGS.find(s => s.id === id) || picked; ui.song(picked, partInfo(picked.id)); };
  const performSong = () => { abortSequence('Cinematic sequence cancelled'); fetchPart(picked.id); show.playSong(picked); };
  const setLook = v => { look.set(v); say(v ? 'Concert look on' : 'Studio look'); };
  const seekSong = f => show.seek(f * show.duration);
  const ui = panel({ setLiftHold, command, setMode, pickCamera, setSource, setKey, setLook, showCommand, video: show.video, pickSong, performSong, seekSong });
  ui.song(picked, partInfo(picked.id));

  // a piano arrangement has no recording: its notes sound on the grand's own piano (sound.js), on the show's clock. Each
  // note starts as the clock passes it and stops at its end; a pause, a jump or the song's end lets every note go
  let heard = { part: null, i: 0, t: 0 }; const ringing = new Map();   // midi → when it stops (s)
  const hush = () => { for (const m of ringing.keys()) sound?.noteOff?.(m, 0.2); ringing.clear(); };
  function voice(part) {
    const t = show.time;
    if (!part || !sound || show.paused) { if (ringing.size) hush(); if (!part) heard.part = null; return; }
    if (heard.part !== part || t < heard.t - 0.05 || t - heard.t > 1) {   // a new song, or a jump: from here on
      hush(); const n = part.notes; let lo = 0, hi = n.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (n[mid].t < t) lo = mid + 1; else hi = mid; }
      heard = { part, i: lo, t };
    }
    const n = part.notes;
    for (; heard.i < n.length && n[heard.i].t <= t; heard.i++) { const x = n[heard.i]; sound.noteOn(x.m, Math.max(0.2, x.v ?? 0.7)); ringing.set(x.m, Math.max(ringing.get(x.m) || 0, x.t + x.d)); }
    for (const [m, end] of ringing) if (end <= t) { sound.noteOff(m); ringing.delete(m); }
    heard.t = t;
  }

  /* ----- per frame ----- */
  let settle = null, wasFlying = false, liftSeg = null, liftT = 0;
  const want = { pos: new THREE.Vector3(), target: new THREE.Vector3() }, offset = new THREE.Vector3();
  function update(dt) {
    t += dt;
    runSequence(dt);
    show.update(dt);
    // the keys: the part of what plays now, set from its recording's clock
    const playing = show.segment === 'song' ? show.song?.id : show.segment ? 'sessions/' + show.segment : null;
    if (playing !== keysFor) { keysFor = playing; keyPlayer.load(parts[playing] || null); if (!parts[playing]) fetchPart(playing)?.then(p => { if (p && keysFor === playing) keyPlayer.load(p); }); }
    if (keyPlayer.part) keyPlayer.update(show.time);
    voice(playing && show.song?.notesOnly && show.segment === 'song' ? keyPlayer.part : null);
    // the score on the desk: the song's pages a spread at a time, turned on through the song (the cover page first)
    const pages = show.segment === 'song' ? PAGES[show.song?.id] : null;
    let spread = null;
    if (pages && show.duration) { const n = Math.ceil(pages.length / 2), k = Math.min(n - 1, Math.floor((show.time / show.duration) * n)); spread = [pages[2 * k], pages[2 * k + 1]]; }
    const key = spread ? spread.join() : '';
    if (key !== sheetShown) { sheetShown = key; studio.piano.userData.sheet?.show(spread); }
    // while a show segment plays on its recording's clock, the lift moves by what that clock moved (frames that come
    // late, or are cut short by main.js's 0.1 s limit, cannot leave the platform behind the music); otherwise by dt
    const seg = show.segment, onAudio = seg && show.clock === 'audio' && !show.paused;
    const step = onAudio && seg === liftSeg && show.time >= liftT && show.time - liftT < 0.5 ? show.time - liftT : dt;
    liftSeg = seg; liftT = show.time;
    const h = frozen ? lift.height : lift.step(step);
    // the robot flies its programme on P6, in the shot's slow motion; parked otherwise
    if (robot) {
      robot.active = director.current === id('P6');
      robotK += ((VIEWS[director.current]?.slow ?? 1) - robotK) * (1 - Math.exp(-dt * 2.5));
      try { robot.update(dt * robotK); } catch (e) { console.error('piano robot:', e); robot = null; }
    }
    for (const k of keys) {
      const lag = CAMS[k].lag;
      eased[k] = lag && !reducedMotion ? eased[k] + (h - eased[k]) * (1 - Math.exp(-dt / lag * 2)) : h;
      const s = shot(k, eased[k], want.pos, want.target), v = VIEWS[id(k)];
      s.pos.toArray(v.pos); s.target.toArray(v.target);
    }
    { const s = pianoShot(h, want.pos, want.target); s.pos.toArray(VIEWS.piano.pos); s.target.toArray(VIEWS.piano.target); }
    easeLights(dt);

    // the shot follows the lift; arriving from a flight it settles onto the moving shot instead of jumping. The studio's
    // piano shot only while the grand is up (down, it keeps its own slow drift as before)
    const k = VIEWS[director.current]?.vienna || (director.current === 'piano' && (h > 0.001 || lift.moving) ? 'piano' : null);
    if (k && director.flying) wasFlying = true;
    else if (k) {
      if (k === 'piano') pianoShot(h, want.pos, want.target);
      else if (k === 'P6' && robot) { want.pos.copy(robot.shot.pos); want.target.copy(robot.shot.target); }   // the robot's lens
      else shot(k, eased[k], want.pos, want.target);
      if (wasFlying || !settle) { offset.copy(camera.position).sub(want.pos); settle = k; wasFlying = false; }
      offset.multiplyScalar(Math.exp(-dt * 3));
      camera.position.copy(want.pos).add(offset);
      controls.target.copy(want.target);
    } else { settle = null; wasFlying = false; }

    const seen = visible();
    stage.root.visible = seen;
    const active = !!VIEWS[director.current]?.vienna || h > 0.001 || lift.moving || !!seq || show.state !== 'IDLE';
    look.update(dt, !!VIEWS[director.current]?.vienna, L.frame);
    stage.update(t, dt, h, L, seen, active);   // the grand and the studio's piano lights always; the rig only while seen
    renderFeed(t);
    ui.show({ hold: liftHold, look: look.on, state: lift.state, h, mode, view: VIEWS[director.current]?.vienna || null, program, source, seq: seq && `${seq.t.toFixed(1)} / ${OPENING.duration} s · ${seq.clock === 'jingle' ? 'jingle' : 'own clock'}`, key: stage.key,
      show: { state: show.state, paused: show.paused, label: show.label, t: show.time, d: show.duration, clock: show.clock, video: show.videoShown } });
  }

  // what the LED wall shows right now: the studio's own programme, the live feed, or black
  const wallShows = () => !wallMat ? 'none' : wallMat.emissiveMap === studio.wall.texture ? 'studio' : wallMat.emissiveMap === feed.rt.texture ? 'feed' : wallMat.emissiveMap === feed.black ? 'black' : 'other';
  return { update, stage, lift, command, setLiftHold, get liftHold() { return liftHold; }, setMode, pickCamera, setSource, addSource, setKey, setLook, look, show, keyPlayer, pickSong, performSong, get picked() { return picked; }, showCommand, get frozen() { return frozen; }, opening: { cues, rise: RISE, get clock() { return seq?.clock; } }, wallShows, history, lights: L, feedTarget: feed.rt, wallMaterial: wallMat,
    get mode() { return mode; }, get source() { return source; }, get program() { return program; }, get running() { return !!seq; } };
}

/* ---------- the stage's control panel (built here, so the studio page only has to load this module) ---------- */
function panel({ setLiftHold, command, setMode, pickCamera, setSource, setKey, setLook, showCommand, video, pickSong, performSong, seekSong }) {
  // the song list: the piano repertoire first, then every album of the library
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const songOptions = () => {
    const groups = [['Piano repertoire', REPERTOIRE.filter(s => s.piano)]];
    for (const s of REPERTOIRE) { let g = groups.find(x => x[0] === s.album); if (!g) groups.push(g = [s.album, []]); g[1].push(s); }
    return groups.map(([name, list]) => `<optgroup label="${esc(name)}">${list.map(s => `<option value="${esc(s.id)}">${esc(s.title)}</option>`).join('')}</optgroup>`).join('');
  };
  const css = `
  .vz{position:fixed;left:var(--gut,16px);top:calc(env(safe-area-inset-top,0px) + 74px);z-index:6;width:min(300px,calc(100vw - 32px));
    max-height:calc(100vh - 200px);overflow:auto;border:1px solid var(--line);background:var(--glass);backdrop-filter:blur(14px) saturate(120%);
    -webkit-backdrop-filter:blur(14px);border-radius:14px;padding:12px 14px 14px;font-size:.78rem;color:var(--chrome)}
  .vz h2{font-stretch:125%;font-weight:600;font-size:.72rem;letter-spacing:.2em;text-transform:uppercase;color:var(--amber);display:flex;align-items:center;gap:8px;margin:0}
  .vz h2 button{margin-left:auto;background:none;border:0;color:var(--dim);cursor:pointer;font-size:.9rem;padding:2px 6px}
  .vz.min .body{display:none}
  .vz h3{font-stretch:112%;font-weight:500;font-size:.6rem;letter-spacing:.22em;text-transform:uppercase;color:var(--dim);margin:12px 0 6px}
  .vz .row{display:flex;flex-wrap:wrap;gap:5px}
  .vz button.b{border:1px solid var(--line);background:rgba(255,255,255,.04);border-radius:8px;padding:6px 9px;cursor:pointer;font-size:.7rem;
    letter-spacing:.08em;text-transform:uppercase;color:var(--chrome-hi)}
  .vz button.b:hover{border-color:rgba(242,166,80,.6)}
  .vz button.b[aria-pressed="true"]{background:linear-gradient(100deg,var(--amber),var(--champagne));color:#120c06;border-color:transparent}
  .vz button.b:disabled{opacity:.38;cursor:not-allowed}
  .vz button.stop{border-color:rgba(255,74,61,.6);color:#ffb3ad}
  .vz .state{display:flex;justify-content:space-between;align-items:baseline;margin-top:10px;font-variant-numeric:tabular-nums}
  .vz .state b{font-stretch:125%;letter-spacing:.14em;color:var(--chrome-hi);font-weight:600}
  .vz .bar{height:4px;border-radius:2px;background:rgba(255,255,255,.1);margin:6px 0 2px;overflow:hidden}
  .vz .bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--amber),var(--champagne))}
  .vz .msg{min-height:1.2em;margin-top:8px;color:var(--champagne);font-size:.7rem}
  .vz small{color:var(--dim);font-size:.6rem;letter-spacing:.1em}
  .vz .show-h{margin-top:4px;color:var(--champagne)}
  .vz select.vz-songs{width:100%;margin:2px 0 6px;background:rgba(255,255,255,.05);color:var(--chrome-hi);border:1px solid var(--line);border-radius:8px;padding:6px;font:inherit;font-size:.72rem}
  .vz .vz-songinfo{font-size:.68rem;line-height:1.5;margin:4px 0 8px;color:var(--chrome)}
  .vz .vz-songinfo .ch{display:inline-block;border:1px solid rgba(242,166,80,.45);border-radius:6px;padding:1px 6px;margin:2px 3px 0 0;color:var(--chrome-hi)}
  .vz .vz-songinfo a{color:var(--amber)}
  .vz .vz-songinfo .warn{color:#ffb3ad}
  .vz .row.show{margin:8px 0 4px}
  .vz .bar.seek{cursor:pointer;height:8px}
  .vz [data-k="showState"].live{color:var(--red)}
  body.obs .vz{display:none}`;
  const el = document.createElement('section');
  el.className = 'vz'; el.setAttribute('aria-label', 'Vienna piano stage controls');
  const btn = (attr, val, text, extra = '') => `<button class="b" type="button" data-${attr}="${val}" ${extra}>${text}</button>`;
  el.innerHTML = `<style>${css}</style>
    <h2>Vienna piano stage <button type="button" class="min-btn" aria-label="Minimise" aria-expanded="true">–</button></h2>
    <div class="body">
      <h3 class="show-h">D//0 — Piano Sessions <small>simulation · local only</small></h3>
      <div class="state"><b data-k="showState">READY</b><span data-k="showTime"></span></div>
      <div class="bar"><i data-k="showBar"></i></div>
      <small data-k="showLabel"></small>
      <div class="row show">${btn('show', 'start', 'Start piano show')}${btn('show', 'pause', 'Pause')}${btn('show', 'stop', 'Stop show')}${btn('show', 'restart', 'Restart opening')}${btn('show', 'skip', 'Skip to long theme')}${btn('show', 'live', 'Go live — piano')}${video ? btn('show', 'video', 'Video / 3D') : ''}</div>
      <div class="row show">${btn('show', 'between', 'Play between songs')}${btn('show', 'between-stop', 'Stop between songs')}${btn('show', 'return-live', 'Return to live piano')}</div>
      <div class="row show">${btn('show', 'closing', 'Start closing')}${btn('show', 'closing-stop', 'Stop closing')}${btn('show', 'closing-restart', 'Restart closing')}</div>
      <h3>Repertoire <small>DJ Andy'K song library · original recordings</small></h3>
      <select class="vz-songs" aria-label="Song">${songOptions()}</select>
      <div class="row show">${btn('song', 'perform', 'Perform song')}${btn('show', 'song-stop', 'Stop song')}</div>
      <div class="vz-songinfo" data-k="songInfo"></div>
      <div class="state"><b data-k="state">LOWERED</b><span data-k="h">0.00 m</span></div>
      <div class="bar"><i data-k="bar"></i></div>
      <small data-k="seq"></small>
      <h3>Piano lift</h3>
      <div class="row">${btn('cmd', 'up', 'Up')}${btn('cmd', 'stop', 'Stop')}${btn('cmd', 'down', 'Down')}${btn('cmd', 'reset', 'Reset')}${btn('cmd', 'cinematic', 'Cinematic')}${btn('hold', '1', 'Lift hold')}</div>
      <h3>Cameras</h3>
      <div class="row">${Object.entries(CAMS).map(([k, c]) => btn('cam', k, k, `title="${c.long}"`)).join('')}</div>
      <h3>Lighting</h3>
      <div class="row">${Object.keys(MODES).map(m => btn('mode', m, m.toLowerCase())).join('')}</div>
      <h3>Look <small>(test)</small></h3>
      <div class="row">${btn('look', 'studio', 'Studio')}${btn('look', 'concert', 'Concert')}</div>
      <h3>Piano key light <small>(real light: costs frame time)</small></h3>
      <div class="row">${btn('key', 'on', 'On')}${btn('key', 'off', 'Off')}</div>
      <h3>Main display <small>(a live feed renders the scene again)</small></h3>
      <div class="row">${SOURCES.map(([k, label, later]) => btn('src', k, label, later ? `disabled title="${later}"` : '')).join('')}</div>
      <p class="msg" data-k="msg" role="status" aria-live="polite"></p>
      <small>Development preview · simulation only, nothing is broadcast</small>
    </div>`;
  el.querySelector('[data-cmd="stop"]').className = 'b stop';
  document.body.append(el);
  if (innerWidth < 700) { el.classList.add('min'); const m = el.querySelector('.min-btn'); m.textContent = '+'; m.setAttribute('aria-expanded', 'false'); }   // phones: folded until asked for
  const q = k => el.querySelector(`[data-k="${k}"]`);
  el.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.classList.contains('min-btn')) { const min = el.classList.toggle('min'); b.setAttribute('aria-expanded', String(!min)); b.textContent = min ? '+' : '–'; return; }
    if (b.dataset.song) performSong();
    else if (b.dataset.show) showCommand(b.dataset.show);
    else if (b.dataset.hold) setLiftHold(b.getAttribute('aria-pressed') !== 'true');
    else if (b.dataset.cmd) command(b.dataset.cmd);
    else if (b.dataset.cam) pickCamera(b.dataset.cam);
    else if (b.dataset.mode) setMode(b.dataset.mode);
    else if (b.dataset.src) setSource(b.dataset.src);
    else if (b.dataset.key) setKey(b.dataset.key === 'on');
    else if (b.dataset.look) setLook(b.dataset.look === 'concert');
  });
  // keys used by the studio page stay with it: the panel is used with the pointer
  el.addEventListener('keydown', e => e.stopPropagation());
  // during a song the show's time bar is a seek bar: a click jumps the recording (and the keys) there
  const showBar = q('showBar').parentElement;
  showBar.addEventListener('click', e => { if (!showBar.classList.contains('seek')) return; const r = showBar.getBoundingClientRect(); seekSong(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))); });
  const songSel = el.querySelector('.vz-songs');
  songSel.addEventListener('change', () => pickSong(songSel.value));
  let last = '';
  const press = (sel, on) => { for (const b of el.querySelectorAll(sel)) b.setAttribute('aria-pressed', String(on(b))); };
  return {
    // what the library has for the chosen song: key, tempo, its main chord progression, the song sheet or score; and
    // whether the keys can play it (only from an approved piano part: none yet)
    song(s, part) {
      songSel.value = s.id;
      const row = (k, v) => `<div><small>${k}</small> ${v}</div>`;
      q('songInfo').innerHTML = [
        row('Album', esc(s.album)),
        row('Key · tempo', `${s.key ? esc(s.key) : '— (not in the library)'} · ${s.bpm ? s.bpm + ' BPM' : '— BPM'}`),
        row('Chords', s.chords ? s.chords.split(/\s*[–—-]\s*/).map(c => `<span class="ch">${esc(c)}</span>`).join('') + '<br><small>the song\'s main progression from the library — not timed to the recording</small>' : '— (not in the library)'),
        row('Notation', s.sheet ? `<a href="${esc(s.sheet)}" target="_blank" rel="noopener">Song sheet (PDF)</a>` : s.score ? `<a href="${esc(s.score)}" target="_blank" rel="noopener">Score (PDF)</a> <small>(not yet timed to the recording)</small>` : '— (no song sheet)'),
        row('Recording', s.audio ? `<a href="${esc(s.audio)}" target="_blank" rel="noopener">original (MP3)</a>` : '<span class="warn">missing — please provide the original recording</span>'),
        row('Keys', part ? `play the approved ${esc(part.kind)} (${esc(part.source)})` : '<span class="warn">still — no approved piano part for this song yet</span>'),
      ].join('');
    },
    msg: q('msg'),
    show(s) {
      const sh = s.show, mmss = x => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, '0')}`;
      const key = [s.hold, s.look, s.state, s.h.toFixed(2), s.mode, s.view, s.program, s.source, s.seq, s.key, sh.state, sh.paused, Math.floor(sh.t * 4), sh.clock, sh.video].join('|');
      if (key === last) return;
      last = key;
      q('showState').textContent = ({ BETWEEN: 'BETWEEN SONGS', ENDED: 'SHOW ENDED', LIVE: 'LIVE PIANO', SONG: 'LIVE PIANO · SONG' }[sh.state] || sh.state) + (sh.paused ? ' · PAUSED' : '');
      q('showState').classList.toggle('live', sh.state === 'LIVE');
      q('showTime').textContent = sh.d ? `${mmss(sh.t)} / ${mmss(sh.d)} · −${mmss(Math.max(0, sh.d - sh.t))}` : '';
      showBar.classList.toggle('seek', sh.state === 'SONG'); showBar.title = sh.state === 'SONG' ? 'Click to jump within the song' : '';
      q('showBar').style.width = sh.d ? `${(sh.t / sh.d) * 100}%` : sh.state === 'LIVE' ? '100%' : '0';
      q('showLabel').textContent = sh.label + (sh.d ? ` · ${sh.clock}` : '');
      el.querySelector('[data-show="pause"]').textContent = sh.paused ? 'Resume' : 'Pause';
      press('[data-show="start"]', () => sh.state !== 'IDLE' && sh.state !== 'LIVE');
      press('[data-show="live"]', () => sh.state === 'LIVE');
      press('[data-show="between"]', () => sh.state === 'BETWEEN');
      press('[data-show="closing"]', () => sh.state === 'CLOSING');
      press('[data-show="video"]', () => sh.video);
      q('state').textContent = s.state; q('seq').textContent = s.seq ? 'Opening ' + s.seq : '';
      q('h').textContent = `+${s.h.toFixed(2)} m`;
      q('bar').style.width = `${(s.h / LIFT.travel) * 100}%`;
      press('[data-cam]', b => b.dataset.cam === s.view);
      press('[data-mode]', b => b.dataset.mode === s.mode);
      press('[data-src]', b => b.dataset.src === s.source);
      press('[data-cmd="cinematic"]', () => !!s.seq);
      press('[data-hold]', () => s.hold);
      press('[data-key]', b => (b.dataset.key === 'on') === s.key);
      press('[data-look]', b => (b.dataset.look === 'concert') === s.look);
      for (const b of el.querySelectorAll('[data-cam]')) b.textContent = b.dataset.cam + (b.dataset.cam === s.program ? ' ●' : '');
    },
  };
}
