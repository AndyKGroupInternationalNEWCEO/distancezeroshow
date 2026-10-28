// Melbourne Underground DJ Room: the wiring. The room and its booth (room.js, booth.js), its lighting presets and
// effects (lasers, haze, smoke, a safe strobe), the LED walls' visual presets and the track on them, the tempo clock
// that the lights and visuals run on, cameras DJ1–DJ6 with an automatic sequence, THE DJ LIFT (the one DJ booth on
// its own platform, from the main studio down into the club and back: djlift.js) with its DJ TRANSITION, and a
// control panel. The Vienna Piano Stage is not touched:
// `withVienna` puts both on the same page, each with its own controls.
//
// Not audio: nothing here plays, mixes or listens to sound. The lights follow a tempo clock (BPM, set by hand or by
// the Broadcast Studio later), not the music itself; music, microphones and the mix stay with the Broadcast Studio
// and OBS.
import * as THREE from 'three';
import { VIEWS, ZONES } from '../views.js';
import { AMBER, ICE } from '../screens.js';
import { buildRoom, LED_PRESETS } from './room.js';
import { buildBooth } from './booth.js';
import { buildDjLift } from './djlift.js';
import { buildClubFx } from './clubfx.js';
import { buildCover } from './cover.js';
import { createDjShow, DJ_OPENING, DJ_OPENING_SHORT } from './djshow.js';
import { applyProbe, loadProbe } from './probes.js';
import { createLift } from '../vienna/lift.js';
import { spaces } from '../spaces.js';
import { securityCam, cineRobot } from '../set.js';
import { CAMS, LIFT_CAMS, CLUB_BOOTH, DJ_LIFT, BEACON, CAM3, STUDIO_SHOTS, ROOM, BOOTH, inClub, inShaft, keepInClub, xyz } from './layout.js';

const GOLD = AMBER, SILVER = ICE, WHITE = '#fff4e8', WARM = '#ffd9b0', VIOLET = '#8a5cff', MAGENTA = '#ff3fa4', CYAN = '#3fd8ff';
// each group: [level, colour, (heads) pattern | pulse]. Gold, silver and black by default; club colours in the
// performance. `effects` are the presets' own suggestion for lasers, haze and strobe (the panel can override each)
export const MODES = {
  OPENING:     { spot: [0.6, SILVER, 'up'], wash: [0.35, GOLD, 'center'], strips: [0.5, GOLD], accent: [0.8, GOLD], booth: [0.9, GOLD], led: 0.55, preset: 'LOGO', lasers: [0, SILVER, 0], haze: 0.7, strobe: 0, disco: 0.7 },
  PERFORMANCE: { spot: [1, WHITE, 'beat', 1], wash: [0.8, VIOLET, 'sweep'], strips: [1, MAGENTA], accent: [0.7, GOLD], booth: [1, GOLD], led: 1, preset: 'PULSE', lasers: [0.9, CYAN, 1], haze: 0.85, strobe: 0, disco: 0.35 },
  BREAKDOWN:   { spot: [0.45, SILVER, 'sweep'], wash: [0.5, '#3b5bff', 'fan'], strips: [0.45, SILVER], accent: [0.5, SILVER], booth: [0.8, SILVER], led: 0.6, preset: 'WAVES', lasers: [0.45, SILVER, 0], haze: 1, strobe: 0, disco: 1 },
  // BUILD-UP: the performance light rising over 16 bars, lasers scanning, the strobe creeping in at the end;
  // DROP: everything at once on the drop, a fog burst, a short capped strobe, the laser tunnel, the LED pulse
  'BUILD-UP':  { spot: [0.8, WHITE, 'sweep'], wash: [0.6, '#3b5bff', 'fan'], strips: [0.8, CYAN], accent: [0.5, SILVER], booth: [0.9, SILVER], led: 0.8, preset: 'TUNNEL', lasers: [0.8, CYAN, 1], laserPattern: 'scan', haze: 0.9, strobe: 0, disco: 0.25, ramp: 16 },
  DROP:        { spot: [1, WHITE, 'beat', 1], wash: [1, MAGENTA, 'sweep'], strips: [1, MAGENTA], accent: [1, GOLD], booth: [1, GOLD], led: 1, preset: 'PULSE', lasers: [1, '#40ff8a', 1], laserPattern: 'tunnel', haze: 1, strobe: 0, disco: 0.2, drop: true },
  CLOSING:     { spot: [0.35, WARM, 'center'], wash: [0.4, GOLD, 'center'], strips: [0.35, GOLD], accent: [0.6, GOLD], booth: [0.8, GOLD], led: 0.45, preset: 'TRACK', lasers: [0, GOLD, 0], haze: 0.5, strobe: 0, disco: 0.8 },
  BLACKOUT:    { spot: [0, WHITE, 'center'], wash: [0, WHITE, 'center'], strips: [0, GOLD], accent: [0, GOLD], booth: [0.06, GOLD], led: 0, preset: 'OFF', lasers: [0, WHITE, 0], haze: 0, strobe: 0, disco: 0 },
};
const GROUPS = ['spot', 'wash', 'strips', 'accent', 'booth', 'lasers'];
export const STROBE_MAX = 0.6;
// how strongly the Cycles probes show in the console, the platform and the club floor (the club stays dark)
const PROBE = { booth: 1.0, floor: 0.8 };   // the strobe's level is capped here, and it never flashes more than 3 times a second

export function melbourne({ renderer, scene, camera, controls, director, studio, quality, reducedMotion }) {
  // the director keeps cameras above the studio floor; down here the club's walls, floor and ceiling are the limits
  // (a camera dragged or zoomed hard against a wall stays in, rather than being thrown up into the studio)
  let inside = false;
  const ours = () => !director.flying && (!director.current || (!!VIEWS[director.current]?.melbourne && VIEWS[director.current].pos[1] < 0));
  ZONES.push({
    has: p => inClub(p) || inShaft(p) || (inside && ours()),
    keep(p, target) { inside = !inShaft(p) || inClub(p); if (inside) { keepInClub(p); keepInClub(target, 0.1); } },
  });
  const room = buildRoom({ studio, scene, quality });
  // the club's security camera, high in a corner over the floor, watching the booth (in the CCTV round: SEC 5)
  const secAnim = [], secPos = xyz(-6.0, 6.0, ROOM.ceiling - 0.35), secAim = xyz(CLUB_BOOTH.along, CLUB_BOOTH.across, ROOM.floor + 1.0);
  const secCam = securityCam(studio.M, secAnim); secCam.position.set(...secPos); secCam.lookAt(...secAim); scene.add(secCam);
  VIEWS.secClub = { label: 'Security', long: 'Security · DJ room', pos: new THREE.Vector3(...secAim).sub(new THREE.Vector3(...secPos)).setLength(0.3).add(new THREE.Vector3(...secPos)).toArray(), target: secAim, fov: 78, drift: 0, tally: 0, cctv: 'SEC 5 · DJ ROOM', melbourne: 'secClub', free: true };
  // THE one DJ booth, on the DJ lift's platform: it rides with it, up in the studio or down in the club. The studio's
  // own small music station steps aside on this page (it is not deleted: the public studio page keeps it)
  const djLift = buildDjLift({ M: studio.M, frame: room.frame });
  const club = buildClubFx({ room: room.room, M: studio.M, lite: !quality?.reflections });
  // the shaft cover: closes the opening upstairs once the booth is down, clears it before the booth comes up
  const cover = buildCover({ M: studio.M, frame: room.frame, glass: room.glass });
  const booth = buildBooth({ M: studio.M, parent: djLift.platform, at: [CLUB_BOOTH.along - DJ_LIFT.along, 0, CLUB_BOOTH.across - DJ_LIFT.across], floor: 0 });
  if (studio.music) studio.music.visible = false;
  // the studio's on-air beacon on this side stood where the lift's opening now is: it moves just in front of it, on
  // solid floor (found by its place in set.js: (2.75, 0, 0.9))
  // the studio's camera 3, its contact shadow and its cable move clear of the booth (CAM3); it aims at Andy'K as before
  const cam3 = studio.cams[2]?.group, from3 = cam3?.position.clone();
  if (cam3) {
    const d = new THREE.Vector3(...CAM3).sub(from3);
    studio.root.traverse(o => {
      if (!o.isMesh || o.parent !== studio.root) return;
      const near = Math.hypot(o.position.x - from3.x, o.position.z - from3.z) < 1e-3 && o.position.y < 0.01;   // its contact shadow
      const tube = o.geometry?.type === 'TubeGeometry' && o.geometry.parameters.path?.getPoint(0).distanceTo(new THREE.Vector3(from3.x, 0.02, from3.z)) < 1e-3;   // its cable
      if (near) o.position.add(d); else if (tube) o.position.add(d);
    });
    const yaw = cam3.rotation.y, aim = new THREE.Vector3(from3.x + Math.sin(yaw) * 6, 0, from3.z + Math.cos(yaw) * 6);   // where it looked
    cam3.position.set(...CAM3); cam3.rotation.y = Math.atan2(aim.x - CAM3[0], aim.z - CAM3[2]);
  }
  Object.assign(VIEWS.floor, STUDIO_SHOTS.floor);
  VIEWS.djwide = { ...STUDIO_SHOTS.djwide, tally: 2 };
  studio.root.traverse(o => { if (o.isGroup && o.parent === studio.root && Math.abs(o.position.x - 2.75) < 1e-3 && Math.abs(o.position.z - 0.9) < 1e-3 && o.position.y === 0) o.position.set(...BEACON); });
  // the drive: the Vienna lift's controller (its own instance). Its height is the depth: 0 = up in the studio
  const drive = createLift(DJ_LIFT);
  const LIFT_STATE = { LOWERED: 'UP', RAISING: 'DESCENDING', ELEVATED: 'DOWN', LOWERING: 'ASCENDING', STOPPED: 'STOPPED' };
  const REASON = { 'Already elevated': 'Already down', 'Already lowered': 'Already up', 'Lowering: press STOP first': 'Going up: press STOP first', 'Raising: press STOP first': 'Going down: press STOP first' };
  let liftHold = false;
  const liftState = () => LIFT_STATE[drive.state];
  // UP / DOWN / STOP / RESET (back up). HOLD: the lift stays where it is until the director releases it
  function liftCommand(cmd, { quiet = false } = {}) {
    const name = { down: 'up', up: 'down', stop: 'stop', reset: 'reset' }[cmd];
    if (!name) return { ok: false, reason: 'No such lift command' };
    if (liftHold && cmd !== 'stop') { if (!quiet) say('DJ lift hold: the lift stays where it is (release the hold first)'); return { ok: false, reason: 'Lift hold' }; }
    // interlock: the lift moves only while the shaft cover is fully open
    if (cmd !== 'stop' && booth.arms.state !== 'STOWED') { if (!quiet) say('Monitor arms out: the lift waits until they are stowed'); return { ok: false, reason: 'Arms not stowed' }; }
    if (cmd !== 'stop' && cover.state !== 'OPEN') { if (!quiet) say('Shaft cover ' + cover.state.toLowerCase() + ': the lift waits until it is open'); return { ok: false, reason: 'Cover not open' }; }
    if (cmd === 'stop' || cmd === 'reset') seq = null;
    const r = drive.command(name);
    if (!r.ok) { r.reason = REASON[r.reason] || r.reason; if (!quiet) say('DJ lift: ' + r.reason); }
    else if (!quiet) say('DJ lift: ' + cmd.toUpperCase());
    return r;
  }

  /* ----- reflections rendered in Cycles (GPU pod): the console and its platform reflect the club from over the
  console, the club's floor from the middle of the room. Loaded once; until then the studio's own environment ----- */
  const shared = new Set(Object.values(studio.M).filter(m => m?.isMaterial));
  // the console and platform swap between two probes on the way: up in the studio (dj-booth-up), down in the club
  // (dj-booth). Both are the same kind of texture, so the swap is a texture change, never a shader rebuild on air
  let probesReady = null, boothMats = [], boothEnv = { up: null, down: null }, boothShows = null;
  const probes = Promise.all([
    applyProbe(renderer, 'dj-booth', [booth.group, djLift.platform], { intensity: PROBE.booth, shared }),
    loadProbe(renderer, 'dj-booth-up'), loadProbe(renderer, 'dj-booth'),
    applyProbe(renderer, 'dj-club', [room.floorMaterial, club.mirrorMat], { intensity: PROBE.floor, shared }),
  ]).then(([mats, up, down, floor]) => { boothMats = mats; boothEnv = { up, down }; boothShows = 'down'; probesReady = { booth: mats.length, floor: floor.length }; return probesReady; })
    .catch(e => { console.warn('DJ room probes:', e.message); probesReady = false; });

  /* ----- light state: eased towards the preset, with the effects the operator set on top ----- */
  let mode = 'OPENING';
  const fx = { lasers: null, laserLevel: 1, haze: null, strobe: 0, preset: null, disco: null, discoSpeed: 1 };   // null: follow the preset
  let modeBeat = 0, dropUntil = -1;   // the beat the mode was taken on (BUILD-UP's ramp); DROP's strobe until this beat
  const L = { disco: { level: 0, speed: 1 }, fogFloor: { level: 0 }, led: { level: 0 }, haze: { level: 0 }, strobe: { level: 0 }, screens: { level: 1 }, pads: { level: 1 }, meters: { level: 1 }, preset: 'LOGO', track: null, smokeRequest: 0 };
  for (const g of GROUPS) L[g] = { level: 0, color: new THREE.Color(), pattern: 'center', pulse: 0 };
  const goal = new THREE.Color();
  let master = 0;   // the room as a whole: 1 while the DJ Room is the environment, a glow through the glass otherwise
  function ease(dt) {
    const m = MODES[mode], k = 1 - Math.exp(-dt * (m.drop && beat < modeBeat + 2 ? 8 : 2.0));   // the drop lands at once
    const ramp = m.ramp ? Math.min(1, 0.3 + 0.7 * (beat - modeBeat) / (4 * m.ramp)) : 1;
    // while an opening plays, its recording leads the light (djshow.js music(), measured on the pod): each group rises
    // and falls with its band of the music, fast, on top of the section's level
    const mu = L.music, kMu = 1 - Math.exp(-dt * 14);
    const BAND = { spot: 'low', strips: 'low', wash: 'mid', accent: 'mid', lasers: 'high' };
    for (const g of GROUPS) {
      const [level, color, extra, pulse] = m[g];
      let lvl = level;
      if (g === 'lasers') { lvl = fx.lasers === null ? level : fx.lasers ? Math.max(level, 0.8) : 0; lvl *= fx.laserLevel; }
      const follow = mu && BAND[g];
      if (follow) lvl *= 0.3 + 0.7 * Math.min(1, mu[BAND[g]] * 1.15);
      L[g].level += (lvl * ramp * master - L[g].level) * (follow ? Math.max(k, kMu) : k);
      L[g].color.lerp(goal.set(color), k);
      if (g === 'spot' || g === 'wash') { L[g].pattern = extra; L[g].pulse = pulse || 0; }
      if (g === 'lasers') { L[g].pulse = extra; L[g].pattern = m.laserPattern || 'fan'; }
    }
    L.led.level += (m.led * Math.max(master, 0.25) * (mu ? 0.45 + 0.55 * mu.low : 1) - L.led.level) * (mu ? Math.max(k, kMu) : k);
    L.haze.level += ((fx.haze ?? m.haze) * master - L.haze.level) * k;
    // the strobe: the operator's level; BUILD-UP's last four bars creep in; DROP's two bars (all capped, ≤ 3 flashes/s)
    let auto = m.ramp && ramp > 0.8 ? 0.25 * (ramp - 0.8) / 0.2 : beat < dropUntil ? STROBE_MAX : 0;
    // the recording's big hits flash the strobe in the loud sections (capped like every strobe here)
    if (mu?.hit && (m.drop || mode === 'PERFORMANCE' || m.ramp)) auto = Math.max(auto, STROBE_MAX * mu.hit);
    L.strobe.level = Math.min(STROBE_MAX, Math.max(fx.strobe, auto)) * master;
    L.disco.level += ((fx.disco === null ? m.disco ?? 0 : fx.disco ? 1 : 0) * master - L.disco.level) * k; L.disco.speed = fx.discoSpeed;
    L.fogFloor.level = Math.max(0, L.fogFloor.level - dt / 14);   // the ground fog fades over about 14 s
    L.preset = fx.preset || m.preset;
    for (const g of ['screens', 'pads', 'meters']) L[g].level = Math.max(0.2, L.booth.level);
  }

  /* ----- the studio's wall upstairs: linked to the Vienna stage's wall routing by withVienna ----- */
  const wallBox = wallOf(studio), overlay = wallOverlay(L);
  const wall = { auto: true, setSource: null, getSource: null, texture: null, set(name) { wall.setSource?.(name); } };
  const desk = deskMonitors(studio);
  desk.apply = () => { const want = desk.on && wallLive() && !!wall.texture; if (want === desk.shown) return; desk.shown = want; if (want) desk.show(wall.texture); else desk.hide(); };

  /* ----- the tempo clock ----- */
  let bpm = 128, beat = 0;

  // CAM 4K HS is the studio's motion-control robot (set.js) here too: on its own track on the club floor in front of the
  // booth (out of DJ2's picture: under it, and parked at the end of its rails). Its programme over the console with the
  // booth down: low across the left deck, up over the mixer, across the right deck, up to the DJ, low hero on the DJ
  const Y0 = ROOM.floor + CLUB_BOOTH.riser + CLUB_BOOTH.top;
  const djMoves = [
    [1.0, -1.1, xyz(-1.0, 2.75, Y0 + 0.25), xyz(-0.6, 2.0, Y0 + 0.05)],
    [1.2, 0, xyz(0, 2.85, Y0 + 0.6), xyz(0, 1.9, Y0)],
    [1.0, 1.1, xyz(1.0, 2.75, Y0 + 0.25), xyz(0.6, 2.0, Y0 + 0.05)],
    [1.3, 0.5, xyz(0.5, 3.0, Y0 + 0.95), xyz(0, 1.6, Y0 + 0.55)],
    [1.1, -0.4, xyz(-0.3, 2.9, Y0 - 0.2), xyz(0, 1.6, Y0 + 0.7)],
  ];
  // (should the robot fail, HS stays the fixed camera it was)
  let robot = null;
  try { robot = cineRobot(studio.M, { moves: djMoves, at: xyz(0, 4.3, ROOM.floor), rotY: BOOTH.rotY, rail: 5.6, parkX: -2.5, park: xyz(0, 2.0, Y0) });
    robot.group.userData.equipment = '4K camera robot · DJ Room'; room.root.add(robot.group); } catch (e) { console.error('DJ robot:', e); robot = null; }

  /* ----- cameras DJ1–DJ6, and the transition camera ----- */
  const keys = Object.keys(CAMS), id = k => 'm' + k;
  for (const k of keys) { const c = CAMS[k]; VIEWS[id(k)] = { label: c.label, long: c.long, pos: [...c.pos], target: [...c.target], fov: c.fov, drift: reducedMotion ? 0 : c.drift, tally: 0, cam: c.name, free: true, melbourne: k }; }
  // the DJ transition's cameras: fixed positions, aimed every frame at the booth as it moves (update below)
  // the shaft closing: from DJ6's place in the studio, down at the glass floor over the shaft, lit by the club below,
  // while the cover slides in and rises flush (3 s of the arrival, below)
  VIEWS.mCover = { label: 'Glass floor', long: '4K · Upper studio · the shaft closing', pos: [...CAMS.DJ6.pos], target: xyz(0, DJ_LIFT.across, 0), fov: 44, drift: 0, tally: 0, cam: CAMS.DJ6.name };
  for (const [k, c] of Object.entries(LIFT_CAMS)) VIEWS['mLift' + k] = { label: c.label, long: c.long, pos: [...c.pos], target: xyz(c.look[0], c.look[1], 1), fov: c.fov, drift: 0, tally: 0, cam: c.name, free: true, melbourne: 'lift' };
  let program = null, auto = false, autoNext = 0, autoI = 0, seq = null, env = 'studio';
  let show = 'ended', shown = 'DJ2';   // the DJ room camera the studio's LED wall shows (follows every cut down here; the operator can pick it alone)
  // a camera that is not yet in the club (or one on the glass, DJ6) cuts: a flight would pass through the floor
  const below = k => CAMS[k].pos[1] < 0;
  const cut = (k, { instant = false } = {}) => { program = k; shown = k; director.setAuto(false); director.go(id(k), { instant: instant || below(k) !== inClub(camera.position) }); };
  // calm cuts, every 8 bars, each with the DJ in it (the 4K high-speed once a round, the look through the lit glass floor twice)
  const AUTO = ['DJ1', 'DJ2', 'DJ6', 'DJ3', 'DJ5', 'DJ2', 'DJ4', 'HS', 'DJ6', 'DJ1', 'DJ3'];
  VIEWS[id('HS')].slow = 0.3;   // slow motion: the club's effects move at this rate on that shot (below), the music and the lift do not
  const liftView = k => { program = 'lift'; director.setAuto(false); director.go('mLift' + k, { instant: true }); };

  /* ----- DJ TRANSITION: the booth goes down into the club on its lift (or back up), the cameras with it ----- */
  // down: platform light and the opening look → the lift sets off → from the studio, through the glass (DJ6), from the
  // club floor as it comes down → at the bottom PERFORMANCE, DJ1, then DJ2. Up: the closing look, from the club floor,
  // then from the studio as it arrives. The lift itself does the moving; the cameras only watch it
  function transition(dir = 'down') {
    if (liftHold) return say('DJ lift hold: no transition until the director releases it');
    const s = liftState();
    if (drive.moving) return say('The DJ lift is moving: STOP first');
    if (dir === 'down' && s === 'DOWN') { env = 'djroom'; cut('DJ1', { instant: true }); return say('The booth is already down'); }
    if (dir === 'up' && s === 'UP') return say('The booth is already up');
    auto = false; seq = { dir, t: 0, step: 0 };
    if (dir === 'down') { env = 'djroom'; mode = 'OPENING'; fx.preset = null; liftView('top'); if (wall.auto && show !== 'live') api.setShow('live'); say('DJ transition: the booth goes down'); }
    else { mode = 'CLOSING'; fx.preset = null; liftView('low'); say('DJ transition: the booth goes up'); }
  }
  // the cover: CLOSE only over a lift standing down; OPEN whenever it is not open (never while the lift moves: it is
  // locked then anyway, the lift only moves while the cover is open)
  function coverCommand(cmd, { quiet = false } = {}) {
    if (liftHold) { if (!quiet) say('DJ lift hold: the shaft cover stays where it is'); return { ok: false, reason: 'Lift hold' }; }
    if (cmd === 'close' && (liftState() !== 'DOWN' || drive.moving)) { if (!quiet) say('The shaft cover closes only once the booth is down'); return { ok: false, reason: 'Lift not down' }; }
    const r = cover.command(cmd); if (!quiet && r.ok) say('Shaft cover: ' + cmd); return r;
  }
  // the monitor arms: out only with the booth standing down in the club; in at any time (the lift waits for them)
  function armsCommand(cmd, { quiet = false } = {}) {
    if (liftHold) { if (!quiet) say('DJ lift hold: the monitor arms stay where they are'); return { ok: false, reason: 'Lift hold' }; }
    if (cmd === 'deploy' && (liftState() !== 'DOWN' || drive.moving)) { if (!quiet) say('The monitor arms come out only once the booth is down'); return { ok: false, reason: 'Lift not down' }; }
    const r = booth.arms.command(cmd); if (!quiet && r.ok) say('Monitor arms: ' + cmd); return r;
  }
  function runSequence(dt) {
    if (!seq) return;
    seq.t += dt;
    const h = drive.height, s = liftState();
    if (seq.dir === 'down') {
      if (seq.step === 0 && seq.t >= 2.5) { seq.step = 1; if (!liftCommand('down', { quiet: true }).ok) { seq = null; return; } }
      else if (seq.step === 1 && h >= 1.3) { seq.step = 2; if (!seq.own) cut('DJ6', { instant: true }); }
      else if (seq.step === 2 && h >= 3.3) { seq.step = 3; if (!seq.own) liftView('low'); }
      else if (seq.step === 3 && s === 'DOWN') { seq.step = 4; seq.floorAt = seq.t + 2.4; seq.end = seq.t + 5.6; if (opening?.state !== 'PLAYING') { mode = 'PERFORMANCE'; modeBeat = beat; }   // (an opening's own script has the light)
        if (!seq.own) cut('DJ1', { instant: true }); coverCommand('close', { quiet: true }); armsCommand('deploy', { quiet: true }); say('DJ room: the booth is down · PERFORMANCE · cover closing, monitor arms out'); }
      else if (seq.step === 4 && seq.t >= seq.floorAt) { seq.step = 5; if (!seq.own) director.go('mCover', { instant: true }); }   // the cover's last 3 s: it slides in, rises flush, locks
      else if (seq.step === 5 && seq.t >= seq.end) { const own = seq.own, then = seq.then; seq = null; if (!own) cut(then || 'DJ2', { instant: true }); }
    } else {
      if (seq.step === 0 && booth.arms.state !== 'STOWED') { if (booth.arms.state !== 'STOWING') armsCommand('retract', { quiet: true }); seq.t = 0; return; }   // the arms in first,
      if (seq.step === 0 && cover.state !== 'OPEN') { if (cover.state !== 'OPENING') coverCommand('open', { quiet: true }); seq.t = 0; return; }   // then the cover clears
      if (seq.step === 0 && seq.t >= 1.5) { seq.step = 1; if (!liftCommand('up', { quiet: true }).ok) { seq = null; return; } }
      else if (seq.step === 1 && h <= 2.2) { seq.step = 2; if (!seq.own) liftView('top'); }
      else if (seq.step === 2 && s === 'UP') { seq = null; env = 'studio'; say('The booth is up in the studio'); }
    }
  }

  /* ----- environments: the main studio (the room glows through the glass) or the DJ room ----- */
  function setEnv(name, { transition = true } = {}) {
    if (name === 'djroom') {
      env = 'djroom';
      if (transition && liftState() === 'UP' && !liftHold) return transition('down');
      cut('DJ1', { instant: true });
      if (wall.auto && show !== 'live') api.setShow('live');
      say('Environment: DJ room');
    } else if (name === 'studio') {
      env = 'studio'; auto = false; program = null;
      director.go('studio', { instant: inClub(camera.position) || inShaft(camera.position) }); say('Environment: main studio');
    }
  }

  /* ----- the DJ Room's opening (djshow.js): the official show song, the booth landing in the club on its first entry ----- */
  const showApi = {
    mode: m => api.setMode(m), led: p => { fx.preset = p; },
    view: v => { env = 'studio'; director.setAuto(false); director.go(v, { instant: true }); program = null; },
    liftView: k => liftView(k), transition: d => transition(d), show: st => api.setShow(st),
    auto: on => { auto = !!on; autoNext = beat; }, cam: k => { env = 'djroom'; cut(k, { instant: true }); },
    tempo: b => { bpm = b; }, say: text => say(text),
    liftReady: () => liftState() === 'UP' && cover.state === 'OPEN' && booth.arms.state === 'STOWED',
  };
  // opening 2 (the official show song, 5:49) and opening 1 (the short one, 1:39); `opening` is the one last started
  const openings = { big: createDjShow({ url: new URL('../../' + DJ_OPENING.audio, import.meta.url).href, api: showApi, script: DJ_OPENING }),
    short: createDjShow({ url: new URL('../../' + DJ_OPENING_SHORT.audio, import.meta.url).href, api: showApi, script: DJ_OPENING_SHORT }) };
  let opening = openings.big;

  /* ----- what the room shows; and culling ----- */
  const frustum = new THREE.Frustum(), pm = new THREE.Matrix4();
  let t = 0, ui = null, platformLight = 0;
  const aimAt = new THREE.Vector3();
  const say = text => { if (ui) ui.msg.textContent = text; };
  function update(dt) {
    t += dt; beat += dt * bpm / 60;
    // the DJ lift: one step of its drive, the platform (and the booth on it) where it is
    const h = drive.step(dt);
    djLift.pose(h);
    cover.update(dt);
    // the console's reflections: the studio's while it is up there, the club's once it is down in it
    const where = h > DJ_LIFT.travel * 0.55 ? 'down' : 'up';
    if (boothShows && where !== boothShows) { boothShows = where; for (const m of boothMats) m.envMap = boothEnv[where]; }
    runSequence(dt);
    openings.big.update(); openings.short.update();
    // the playing opening's music (null otherwise): the light follows it (ease), the pulses take its kick (room.js),
    // and the mixer's meters show its level, as a console's meters show what plays
    for (const f of secAnim) f(t);
    L.music = opening.music() || musicSource?.(dt) || null;
    // the opening plays on the booth as a track does: deck 2 loaded with it, its time, its tempo, the platter turning,
    // channel 2's fader up (the DJ set's own tracks take the decks over: spaces.js)
    const os = !musicSource && (opening.state === 'PLAYING' || opening.state === 'PAUSED') ? opening.state : 'IDLE';
    if (os !== openingOnDeck || (os === 'PLAYING' && Math.abs(booth.gear.decks[1].data.position + (performance.now() / 1000 - booth.gear.decks[1].data.at) - opening.time) > 0.5)) {
      openingOnDeck = os;
      if (os === 'IDLE') { if (!musicSource) booth.gear.setDeck(1, { state: 'stop', position: 0 }); }
      else {
        booth.gear.setDeck(1, { title: opening.title, artist: "DJ Andy'K", bpm: opening.bpm, state: os === 'PLAYING' ? 'play' : 'pause', position: opening.time, duration: opening.duration, pitch: 0 });
        booth.gear.setMixer({ ch: [0, 1, 2, 3].map(i => ({ fader: i === 1 ? 0.85 : 0, trim: 0.55, hi: 0.5, mid: 0.5, low: 0.5, filter: 0.5 })), xfader: 0.25, master: 0.8 });
      }
    }
    // the meters: the real left / right peaks of what plays (live-music.js) where there are some; for the openings'
    // recordings (measured maps, no live signal) the level the map gives
    if (L.music?.vu) booth.gear.setLevels({ ch: L.music.chv, master: L.music.vu });   // each channel's own meter, master L / R
    else if (L.music) { const lv = Math.min(1, 0.15 + 0.85 * Math.max(L.music.low, L.music.mid)); const ch = [0, 0, 0, 0]; ch[musicSource ? musicCh : 1] = lv; booth.gear.setLevels({ ch, master: [lv, lv * 0.97] }); }
    // the room's master: full in the DJ room, a soft glow up through the glass while the main studio is the room
    // (and full while the studio's wall shows the DJ room live: the show is on down there). During the way down it
    // comes up with the booth
    const want = seq?.dir === 'down' ? 0.35 + 0.65 * (h / DJ_LIFT.travel) : env === 'djroom' || wallLive() ? 1 : 0.35;
    master += (want - master) * (1 - Math.exp(-dt * 1.2));
    ease(dt);
    platformLight += ((seq || drive.moving ? 1 : liftState() === 'DOWN' ? 0.45 * master : 0.3) - platformLight) * (1 - Math.exp(-dt * 2));
    djLift.light(platformLight);
    // the transition's cameras look at the booth wherever it is
    if (VIEWS[director.current]?.melbourne === 'lift' && !director.flying) {
      const v = VIEWS[director.current];
      booth.group.getWorldPosition(aimAt); aimAt.y += 1.0;
      camera.position.set(...v.pos); controls.target.copy(aimAt); camera.lookAt(aimAt);
    }
    // another stage's shot taken from down here (a Vienna camera, a studio view): a cut, never a flight through the floor
    if (director.flying && inClub(camera.position) && !VIEWS[director.current]?.melbourne) director.go(director.current, { instant: true });
    if (!inClub(camera.position) && !inShaft(camera.position) && !ours()) inside = false;
    if (auto && !seq && beat >= autoNext) { autoNext = beat + 32; const k = AUTO[autoI++ % AUTO.length]; if (env === 'djroom') cut(k); else shown = k; }
    camera.updateMatrixWorld(); pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pm);
    desk.apply();
    const seen = frustum.intersectsBox(room.bounds) || feedWanted();
    room.root.visible = seen;
    // the 4K high-speed shot: the effects' own movement slowed (lasers, heads, fog, jogs), eased in and out like the studio's
    fxK += ((VIEWS[director.current]?.slow ?? 1) - fxK) * (1 - Math.exp(-dt * 2.5)); const fdt = dt * fxK; fxT += fdt;
    if (seen) { room.face(camera); room.update(fxT, fdt, L, beat); booth.update(fxT, fdt, L, beat); club.update(fxT, fdt, L); }
    // the 4K high-speed shot is the robot's lens, flying its programme in the shot's slow motion; parked otherwise
    if (robot) { robot.active = director.current === id('HS'); try { robot.update(fdt); } catch (e) { console.error('DJ robot:', e); robot = null; } }
    if (robot && director.current === id('HS') && !director.flying) { camera.position.copy(robot.shot.pos); controls.target.copy(robot.shot.target); camera.lookAt(controls.target); }
    ui?.show({ cover: cover.state, lift: liftState(), hold: liftHold, mode, env, program, auto, bpm, beat, fx, preset: L.preset, track: L.track, view: VIEWS[director.current]?.melbourne || null, show, wall: wallName(), wallAuto: wall.auto, desk: desk.on });
  }

  /* ----- the controls (the panel uses these; the Broadcast Studio's bridge will use the same) ----- */
  let musicSource = null, musicCh = 0, fxK = 1, fxT = 0, openingOnDeck = 'IDLE';   // another recording the light follows (the DJ show's tracks: spaces.js, live-music.js)
  const api = {
    update, room, booth, club, L, MODES,
    setMusicSource(fn, ch = 0) { musicSource = fn || null; musicCh = ch; },
    // the visitor took the camera elsewhere (CCTV, backstage …): a transition on its way leaves the cameras alone
    releaseCameras() { if (seq) seq.own = true; },
    get mode() { return mode; }, get env() { return env; }, get program() { return program; }, get auto() { return auto; }, get bpm() { return bpm; }, get beat() { return beat; },
    get travelling() { return !!seq; },
    setEnv,
    pickCamera(k) {
      if (!CAMS[k]) return say('No such camera');
      // a club camera with the booth not down: the booth goes down first (its lift cameras ride with it), then the cut
      // to the camera picked. (Before, the cut came at once: an empty, dark club with the console still up in the studio)
      if (below(k) && (liftState() !== 'DOWN' || drive.moving) && !liftHold) { if (!seq) transition('down'); if (seq?.dir === 'down') { seq.then = k; return say('DJ room: ' + CAMS[k].name + ' once the booth is down'); } }
      seq = null; auto = false; env = 'djroom'; cut(k); say('DJ room: ' + CAMS[k].name);
    },
    setAuto(on) { auto = !!on; autoNext = beat; say(auto ? 'Automatic camera sequence on (8 bars a shot)' : 'Automatic camera sequence off'); },
    // the DJ lift: 'down' / 'up' (the DJ TRANSITION with its cameras and light), or the bare lift commands
    transition, liftCommand, coverCommand, armsCommand, cover,
    // the DJ Room's opening: 'start' | 'pause' (pause / resume) | 'stop' | 'seek' (seconds)
    // which: 'big' (opening 2, default) or 'short' (opening 1); the other one stops when one starts
    djOpening(cmd, t, which) { if (cmd === 'start') { const other = which === 'short' ? openings.big : openings.short; other.stop(); opening = which === 'short' ? openings.short : openings.big; } const r = cmd === 'start' ? opening.start() : cmd === 'pause' ? opening.pause() : cmd === 'stop' ? opening.stop() : cmd === 'seek' ? opening.seek(t) : { ok: false, reason: 'No such command' }; if (!r.ok) say('DJ opening: ' + r.reason); else if (cmd !== 'seek') say('DJ opening: ' + cmd); return r; },
    get opening() { return opening; }, openings,
    setSfx(on, volume) { cover.sound.set(on, volume); booth.arms.sound.set(on, volume); say(on ? 'Set sounds on' : 'Set sounds off'); },
    setLiftHold(on) { liftHold = !!on; if (liftHold) { seq = null; if (drive.moving) drive.command('stop'); } say(liftHold ? 'DJ lift hold on: the lift stays where it is' : 'DJ lift hold off'); },
    get lift() { return { state: liftState(), depth: drive.height, speed: -drive.speed, moving: drive.moving, hold: liftHold, travel: DJ_LIFT.travel }; },
    djLift, get probes() { return probesReady; }, get boothReflects() { return boothShows; }, probesLoaded: () => probes,
    setMode(m) {
      if (!MODES[m]) return say('No such lighting preset');
      mode = m; fx.preset = null; modeBeat = beat;
      if (MODES[m].drop) { dropUntil = beat + 8; api.fog(3); }
      say('Lighting: ' + m);
    },
    // D//0 DISCO ZERO: on, off or with the preset (null); its speed (1 = about two turns a minute)
    disco(on, speed) { fx.disco = on === null || on === undefined ? null : !!on; if (speed !== undefined) fx.discoSpeed = Math.max(0, Math.min(3, +speed)); say(`Disco ball ${fx.disco === null ? 'with the preset' : fx.disco ? 'on' : 'off'}`); },
    // a FOG burst: the machines puff for `seconds`, then ground fog spreads and fades (HAZE is the steady air: haze())
    fog(seconds = 3) { L.smokeRequest = Math.max(0.5, Math.min(8, +seconds)); L.fogFloor.level = Math.min(1, L.fogFloor.level + 0.35 + seconds * 0.12); say('Fog burst: ' + L.smokeRequest + ' s'); },
    setLed(p) { if (!LED_PRESETS.includes(p)) return say('No such LED preset'); fx.preset = p; say('LED walls: ' + p); },
    lasers(on, level) { fx.lasers = on === null ? null : !!on; if (level !== undefined) fx.laserLevel = Math.max(0, Math.min(1, +level)); say(`Lasers ${fx.lasers === null ? 'with the preset' : fx.lasers ? 'on' : 'off'} · ${Math.round(fx.laserLevel * 100)} %`); },
    haze(density) { fx.haze = density === null ? null : Math.max(0, Math.min(1, +density)); say(`Haze ${fx.haze === null ? 'with the preset' : Math.round(fx.haze * 100) + ' %'}`); },
    smoke(seconds = 2.5) { api.fog(seconds); },
    strobe(level) { fx.strobe = Math.max(0, Math.min(STROBE_MAX, +level)); say(fx.strobe ? `Strobe ${Math.round((fx.strobe / STROBE_MAX) * 100)} % (max 3 flashes a second)` : 'Strobe off'); },
    setTrack(tr) { L.track = tr?.title ? { title: String(tr.title).slice(0, 60), artist: String(tr.artist || '').slice(0, 60) } : null; say(L.track ? 'Track: ' + L.track.title : 'Track cleared'); },
    // THE GEAR (gear.js), from the Broadcast Studio's data only: decks 1–4, the mixer, the meters, the talkback mic.
    // A deck that plays with a BPM sets the light's tempo clock; its title goes to the LED walls
    setDeck(n, d = {}) {
      if (!booth.gear.setDeck(n - 1, d)) return say('No such deck');
      const o = booth.gear.decks[n - 1].data;
      if (o.state === 'play' && o.bpm) bpm = Math.max(60, Math.min(200, o.bpm * (1 + o.pitch)));
      if (o.state === 'play' && o.title) L.track = { title: o.title.slice(0, 60), artist: (o.artist || '').slice(0, 60) };
      say(`Deck ${n}: ${o.state}${o.title ? ' · ' + o.title : ''}`);
    },
    setMixer: d => booth.gear.setMixer(d),
    setLevels: d => booth.gear.setLevels(d),
    setMic(on) { booth.gear.setMic(on); say(on ? 'Talkback mic ON' : 'Talkback mic off'); },
    setTempo(b) { const v = +b; if (!(v >= 60 && v <= 200)) return say('Tempo: 60–200 BPM'); bpm = v; say(`Tempo ${bpm} BPM`); },
    // the studio's LED wall upstairs: 'djroom' (this room live, from the camera it shows), 'main' (the studio's own
    // programme) or 'off'; `auto`: the wall follows the show (setShow)
    setWall(w) { const name = { djroom: 'melbourne', main: 'main', off: 'off' }[w]; if (!name) return say('No such wall source'); wall.set(name); say('Studio wall: ' + w); },
    // the DJ show's state as the Broadcast Studio runs it: live ⇒ the wall shows the room; a break or the end ⇒ the
    // studio's own programme again (only while the wall follows the show)
    setShow(state) { if (!['live', 'break', 'ended'].includes(state)) return say('No such show state'); show = state; if (wall.auto) wall.set(state === 'live' ? 'melbourne' : 'main'); say('DJ show: ' + state); },
    setWallAuto(on) { wall.auto = !!on; say(wall.auto ? 'Studio wall follows the DJ show' : 'Studio wall by hand'); },
    showOnWall(k) { if (!CAMS[k]) return say('No such camera'); shown = k; say('Studio wall: ' + CAMS[k].name); },
    setDeskMonitors(on) { desk.on = !!on; desk.apply(); say(desk.on ? 'Presenter monitors: DJ room live' : 'Presenter monitors off'); },
    feed: { shot: c => feedShot(c), wanted: () => feedWanted(), before: c => feedBefore(c), after: (r, rt) => overlay.render(r, rt) },
    linkWall(set, get, texture) { wall.setSource = set; wall.getSource = get; wall.texture = texture; },
    report() { return { opening: { state: opening.state, time: +opening.time.toFixed(2), duration: opening.duration }, gear: booth.gear.report(), cover: cover.state, arms: booth.arms.state, lift: liftState(), liftDepth: +drive.height.toFixed(3), liftHold, env, mode, program, auto, show, wall: wallName(), wallAuto: wall.auto, shown, deskMonitors: desk.on, bpm, preset: L.preset, track: L.track, lasers: fx.lasers, laserLevel: fx.laserLevel, haze: fx.haze, strobe: fx.strobe, travelling: !!seq, view: director.current }; },
  };
  ui = panel(api);
  return api;

  /* ----- the studio's LED wall (and the presenters' desk monitors) showing this room live ----- */
  // The picture is rendered by the Vienna stage's wall routing (vienna/index.js, source 'melbourne'): the same render
  // target, the same rule against a picture of a picture. It is a picture only: no sound goes with it.
  function wallName() { const s = wall.getSource?.(); return s === 'melbourne' ? 'djroom' : s || 'main'; }
  function wallLive() { return wall.getSource?.() === 'melbourne'; }
  // worth a render only while someone upstairs can see the wall or a desk monitor (never from down here)
  function feedWanted() {
    if (!wallLive() || inClub(camera.position) || inShaft(camera.position)) return false;
    camera.updateMatrixWorld(); pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pm);
    return frustum.intersectsBox(wallBox) || (desk.on && desk.screens.some(m => frustum.intersectsObject(m)));
  }
  function feedShot(c) {
    const v = VIEWS[id(shown)];
    c.position.set(...v.pos); c.lookAt(...v.target); c.fov = v.fov;
  }
  function feedBefore(c) { room.root.visible = true; room.face(c); room.update(fxT, 0, L, beat); booth.update(fxT, 0, L, beat); club.update(fxT, 0, L); }
}

// the studio's wall upstairs and its box (taken before anything is routed to it)
function wallOf(studio) {
  let mesh = null; studio.root.traverse(o => { if (o.isMesh && o.material?.emissiveMap === studio.wall.texture) mesh = o; });
  return mesh ? new THREE.Box3().setFromObject(mesh) : new THREE.Box3();
}

// the presenters' slim desk monitors (set.js): dark until the DJ room is live, then its picture (centre of the wide
// feed, the right way round: the feed texture is drawn mirrored for the curved wall)
function deskMonitors(studio) {
  const screens = [];
  studio.root.traverse(o => { const p = o.geometry?.parameters; if (o.isMesh && p && p.width === 0.32 && p.height === 0.19 && o.material?.color?.getHex() === 0x1a2230) screens.push(o); });
  const geo = screens[0]?.geometry, live = geo?.clone(), mat = new THREE.MeshBasicMaterial({ toneMapped: false });
  if (live) {
    const span = (0.32 / 0.19) / (2048 / 860), uv = live.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, 0.5 + (0.5 - uv.getX(i)) * span);   // mirrored back, cropped to the monitor
  }
  const own = screens.map(m => m.material);
  return {
    screens, on: true, shown: false,
    show(texture) { if (!live) return; mat.map = texture; mat.needsUpdate = true; screens.forEach(m => { m.geometry = live; m.material = mat; }); },
    hide() { screens.forEach((m, i) => { m.geometry = geo; m.material = own[i]; }); },
  };
}

// what the wall's live picture carries: DJ Andy'K, the track, and the official D//0 artwork (assets/logo-do-1k.webp)
function wallOverlay(L) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 430;
  const x = c.getContext('2d'), tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const logo = new Image(); logo.src = new URL('../../assets/logo-do-1k.webp', import.meta.url).href;
  const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthTest: false })));
  let drawn = null;
  function draw() {
    const key = (L.track?.title || '') + '|' + (L.track?.artist || '') + '|' + logo.complete;
    if (key === drawn) return; drawn = key;
    x.clearRect(0, 0, 1024, 430);
    const g = x.createLinearGradient(0, 300, 0, 430); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.7)');
    x.fillStyle = g; x.fillRect(0, 300, 1024, 130);
    if (logo.complete && logo.naturalWidth) { const h = 44, w = h * logo.naturalWidth / logo.naturalHeight; x.drawImage(logo, 1024 - 32 - w, 24, w, h); }
    x.fillStyle = '#f2a650'; x.font = '700 15px Archivo, Arial, sans-serif'; x.fillText("DJ ANDY'K  ·  LIVE FROM THE DJ ROOM", 32, 368);
    if (L.track?.title) {
      x.fillStyle = '#f3f5f8'; x.font = '600 26px Archivo, Arial, sans-serif'; x.fillText(L.track.title, 32, 400);
      if (L.track.artist) { const w = x.measureText(L.track.title).width; x.fillStyle = 'rgba(243,245,248,0.7)'; x.font = '500 17px Archivo, Arial, sans-serif'; x.fillText('—  ' + L.track.artist, 32 + w + 16, 400); }
    }
    tex.needsUpdate = true;
  }
  return {
    render(renderer, target) {
      draw();
      const clear = renderer.autoClear; renderer.autoClear = false;
      renderer.setRenderTarget(target); renderer.render(scene, cam);
      renderer.autoClear = clear;
    },
  };
}

// the Vienna Piano Stage and the DJ room on one page: Vienna's controls stay exactly as they are (window.__studio.ext
// is Vienna's), the DJ room is ext.melbourne
export function withVienna(vienna) {
  return ctx => {
    const v = vienna(ctx), m = melbourne(ctx), u = v.update;
    v.melbourne = m;
    v.addSource('melbourne', m.feed); m.linkWall(v.setSource, () => v.source, v.feedTarget.texture);
    // the visitor's three buttons (STUDIO / PIANO / DJ ROOM); their labels follow what plays, a few times a second
    const sp = spaces(v, ctx); let spNext = 0;
    v.update = (dt, t) => { u(dt, t); m.update(dt, t); if (sp && t > spNext) { spNext = t + 0.25; sp.update(); } sp?.hold(); };
    v.spaces = sp;
    return v;
  };
}

/* ---------- the panel: right side, folded on narrow screens ---------- */
function panel(api) {
  const css = `
  .mz{position:fixed;top:72px;right:16px;z-index:6;width:300px;max-height:calc(100vh - 170px);overflow:auto;background:rgba(8,9,12,.86);border:1px solid var(--line,#2a2c31);border-radius:14px;padding:12px 14px;color:var(--chrome,#b9bcc2);font:12px/1.4 Archivo,Arial,sans-serif;backdrop-filter:blur(8px)}
  .mz h2{margin:0 0 6px;font-size:.78rem;letter-spacing:.18em;color:#a9c8ee;display:flex;justify-content:space-between;align-items:center}
  .mz h3{margin:10px 0 4px;font-size:.66rem;letter-spacing:.14em;text-transform:uppercase;color:var(--chrome-hi,#e8e9ec)}
  .mz .row{display:flex;flex-wrap:wrap;gap:4px}
  .mz .b{background:rgba(255,255,255,.05);border:1px solid var(--line,#2a2c31);color:var(--chrome-hi,#e8e9ec);border-radius:8px;padding:5px 8px;font:inherit;font-size:.68rem;cursor:pointer}
  .mz .b[aria-pressed=true]{border-color:#a9c8ee;background:rgba(169,200,238,.16)}
  .mz input[type=range]{width:100%}
  .mz label{display:block;font-size:.66rem;margin-top:4px}
  .mz input[type=text],.mz input[type=number]{width:100%;box-sizing:border-box;background:rgba(255,255,255,.05);border:1px solid var(--line,#2a2c31);color:var(--chrome-hi,#e8e9ec);border-radius:6px;padding:4px 6px;font:inherit;font-size:.7rem;margin:2px 0}
  .mz .msg{min-height:1.3em;color:#a9c8ee;font-size:.68rem;margin:8px 0 0}
  .mz.min .body{display:none}
  .mz .min-btn{background:none;border:0;color:inherit;font-size:1rem;cursor:pointer}
  body.obs .mz,body.dz-stage .mz{display:none}`;
  const el = document.createElement('section'); el.className = 'mz'; el.setAttribute('aria-label', 'Melbourne underground DJ room controls');
  const btn = (attr, val, text) => `<button class="b" type="button" data-${attr}="${val}">${text}</button>`;
  el.innerHTML = `<style>${css}</style>
    <h2>DJ room — Melbourne <button type="button" class="min-btn" aria-label="Minimise" aria-expanded="true">–</button></h2>
    <div class="body">
      <h3>Environment</h3>
      <div class="row">${btn('env', 'studio', 'Main studio')}${btn('env', 'djroom', 'DJ room')}</div>
      <h3>DJ lift <small data-k="lift"></small></h3>
      <div class="row">${btn('travel', 'down', 'Transition ↓')}${btn('travel', 'up', 'Return ↑')}${btn('lift', 'down', 'Down')}${btn('lift', 'up', 'Up')}${btn('lift', 'stop', 'Stop')}${btn('lifthold', '1', 'Hold')}</div>
      <div class="row">${btn('cover', 'close', 'Cover close')}${btn('cover', 'open', 'Cover open')}${btn('arms', 'deploy', 'Arms out')}${btn('arms', 'retract', 'Arms in')}</div>
      <h3>DJ opening <small>(official show song)</small></h3>
      <div class="row">${btn('opening', 'short', 'Opening 1 ▶')}${btn('opening', 'start', 'Opening 2 ▶')}${btn('opening', 'pause', 'Pause')}${btn('opening', 'stop', 'Stop')}</div>
      <h3>DJ show</h3>
      <div class="row">${btn('show', 'live', 'Live')}${btn('show', 'break', 'Break')}${btn('show', 'ended', 'Ended')}</div>
      <h3>Studio wall upstairs</h3>
      <div class="row">${btn('wall', 'djroom', 'DJ room live')}${btn('wall', 'main', 'Main studio')}${btn('wall', 'off', 'Off')}${btn('wallauto', '1', 'Follow show')}${btn('desk', '1', 'Desk monitors')}</div>
      <h3>Cameras</h3>
      <div class="row">${Object.entries(CAMS).map(([k, c]) => `<button class="b" type="button" data-cam="${k}" title="${c.long}">${k}</button>`).join('')}${btn('auto', '1', 'Auto')}</div>
      <h3>Lighting</h3>
      <div class="row">${Object.keys(MODES).map(m => btn('mode', m, m.toLowerCase())).join('')}</div>
      <h3>LED walls</h3>
      <div class="row">${LED_PRESETS.map(p => btn('led', p, p.toLowerCase())).join('')}</div>
      <label>Track title<input type="text" data-k="title" maxlength="60" placeholder="(from the Broadcast Studio)"></label>
      <label>Artist<input type="text" data-k="artist" maxlength="60" placeholder="DJ Andy'K"></label>
      <div class="row">${btn('track', 'set', 'Show track')}${btn('track', 'clear', 'Clear')}</div>
      <h3>Effects</h3>
      <div class="row">${btn('lasers', 'preset', 'Lasers: preset')}${btn('lasers', 'on', 'On')}${btn('lasers', 'off', 'Off')}</div>
      <label>Laser intensity <input type="range" min="0" max="1" step="0.05" value="1" data-k="laserLevel"></label>
      <label>Haze density <input type="range" min="0" max="1" step="0.05" value="0.7" data-k="haze"></label>
      <div class="row">${btn('haze', 'preset', 'Haze: preset')}${btn('smoke', '1', 'Fog burst')}</div>
      <div class="row">${btn('disco', 'preset', 'Disco ball: preset')}${btn('disco', 'on', 'On')}${btn('disco', 'off', 'Off')}</div>
      <label>Strobe (capped, max 3 flashes/s) <input type="range" min="0" max="${STROBE_MAX}" step="0.05" value="0" data-k="strobe"></label>
      <label>Tempo clock (BPM — not audio-reactive) <input type="number" min="60" max="200" step="1" value="128" data-k="bpm"></label>
      <p class="msg" data-k="msg" role="status" aria-live="polite"></p>
      <small>Development preview · visual only: no audio is played or mixed here</small>
    </div>`;
  document.body.append(el);
  if (innerWidth < 700) el.classList.add('min');
  const q = k => el.querySelector(`[data-k="${k}"]`);
  el.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.classList.contains('min-btn')) { const min = el.classList.toggle('min'); b.setAttribute('aria-expanded', String(!min)); b.textContent = min ? '+' : '–'; return; }
    const d = b.dataset;
    if (d.env) api.setEnv(d.env);
    else if (d.travel) api.transition(d.travel);
    else if (d.lift) api.liftCommand(d.lift);
    else if (d.cover) api.coverCommand(d.cover);
    else if (d.arms) api.armsCommand(d.arms);
    else if (d.lifthold) api.setLiftHold(!api.lift.hold);
    else if (d.cam) { if (api.env !== 'djroom') api.setEnv('djroom', { transition: false }); api.pickCamera(d.cam); }
    else if (d.auto) api.setAuto(!api.auto);
    else if (d.show) api.setShow(d.show);
    else if (d.opening) api.djOpening(d.opening === 'short' ? 'start' : d.opening, undefined, d.opening === 'short' ? 'short' : 'big');
    else if (d.wall) api.setWall(d.wall);
    else if (d.wallauto) api.setWallAuto(!api.report().wallAuto);
    else if (d.desk) api.setDeskMonitors(!api.report().deskMonitors);
    else if (d.mode) api.setMode(d.mode);
    else if (d.led) api.setLed(d.led);
    else if (d.track) api.setTrack(d.track === 'set' ? { title: q('title').value, artist: q('artist').value } : null);
    else if (d.lasers) api.lasers(d.lasers === 'preset' ? null : d.lasers === 'on');
    else if (d.haze) api.haze(null);
    else if (d.smoke) api.fog(3);
    else if (d.disco) api.disco(d.disco === 'preset' ? null : d.disco === 'on');
  });
  el.addEventListener('input', e => {
    const k = e.target.dataset.k;
    if (k === 'laserLevel') api.lasers(api.report().lasers, e.target.value);
    else if (k === 'haze') api.haze(e.target.value);
    else if (k === 'strobe') api.strobe(e.target.value);
  });
  el.addEventListener('change', e => { if (e.target.dataset.k === 'bpm') api.setTempo(e.target.value); });
  el.addEventListener('keydown', e => e.stopPropagation());   // the studio's keys stay with the studio
  let last = '';
  const press = (sel, on) => { for (const b of el.querySelectorAll(sel)) b.setAttribute('aria-pressed', String(on(b))); };
  const liftLabel = q('lift');
  return {
    msg: q('msg'),
    show(s) {
      liftLabel.textContent = s.lift + ' · cover ' + s.cover;
      const key = [s.lift, s.hold, s.mode, s.env, s.program, s.auto, s.preset, s.fx.lasers, s.fx.haze === null, s.view, s.show, s.wall, s.wallAuto, s.desk].join('|');
      if (key === last) return; last = key;
      press('[data-env]', b => b.dataset.env === s.env);
      press('[data-cam]', b => b.dataset.cam === s.view);
      press('[data-auto]', () => s.auto);
      press('[data-lifthold]', () => s.hold);
      press('[data-show]', b => b.dataset.show === s.show);
      press('[data-wall]', b => b.dataset.wall === s.wall);
      press('[data-wallauto]', () => s.wallAuto);
      press('[data-desk]', () => s.desk);
      press('[data-mode]', b => b.dataset.mode === s.mode);
      press('[data-led]', b => b.dataset.led === s.preset);
      press('[data-lasers]', b => (b.dataset.lasers === 'preset' && s.fx.lasers === null) || (b.dataset.lasers === 'on' && s.fx.lasers === true) || (b.dataset.lasers === 'off' && s.fx.lasers === false));
      press('[data-haze]', () => s.fx.haze === null);
    },
  };
}
