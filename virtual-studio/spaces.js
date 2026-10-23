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
import * as THREE from 'three';
import { REPERTOIRE } from './vienna/repertoire.js';
import { liveMusic } from './melbourne/live-music.js';
import { VIEWS, ZONES } from './views.js';
import { applyProbe } from './melbourne/probes.js';
import { inClub } from './melbourne/layout.js';

const SHOTS = ['studio', 'desk', 'wall', 'crane', 'floor'];
// AFTERSHOW: the views no show camera takes, walked slowly in turn
const AFTER = {
  aWide: { label: 'After the show', long: 'After the show · work light', pos: [9.2, 5.4, 9.4], target: [0, 1.0, -2.0], fov: 46, drift: 0.1 },
  aCams: { label: 'After the show', long: 'Behind the cameras', pos: [1.4, 1.75, 10.6], target: [0, 1.3, 3.0], fov: 44, drift: 0.08 },
  aTruss: { label: 'After the show', long: 'From the lighting truss', pos: [0.4, 7.4, 5.2], target: [0, 0, -1.2], fov: 62, drift: 0.05 },
};
const AFTER_TOUR = ['aWide', 'aCams', 'aTruss', 'securityLounge', 'backstage'];
// CCTV: the security monitor, switching by itself between the cameras of the studio, backstage, reception and entrance
const CCTV = ['security', 'secClub', 'securityLounge', 'secReception', 'secBuilding'];
// the building and its reception (building.js, the arrival's set): a place of its own, reached by a cut; loaded the
// first time it is asked for. The front faces +z at FZ = 34
const FZ = 34;
// the reception's and the street's furniture: scanned models from Poly Haven (CC0, 1k textures, assets/models),
// each fitted to its real size (`size`: the longest side, or `height`) and stood on the floor
const PROPS = [
  { id: 'sofa_03', at: [-4.35, FZ - 4.9], rot: Math.PI / 2, size: 2.2 },
  { id: 'modern_arm_chair_01', at: [-2.1, FZ - 3.7], rot: -Math.PI / 2 - 0.35, height: 0.82 },
  { id: 'modern_arm_chair_01', at: [-2.1, FZ - 6.1], rot: -Math.PI / 2 + 0.35, height: 0.82 },
  { id: 'modern_coffee_table_01', at: [-3.2, FZ - 4.9], rot: Math.PI / 2, size: 1.1 },
  { id: 'potted_plant_02', at: [-4.4, FZ - 0.8], height: 1.5 },
  { id: 'potted_plant_02', at: [4.4, FZ - 0.8], rot: 1.2, height: 1.5 },
  { id: 'potted_plant_04', at: [3.0, FZ - 8.7], height: 1.15 },
  { id: 'potted_plant_04', at: [-4.4, FZ - 8.9], rot: 2, height: 1.15 },
  { id: 'ceramic_vase_03', at: [-3.2, FZ - 4.9], y: 0.42, height: 0.32 },
  { id: 'modern_ceiling_lamp_01', at: [0.1, FZ - 7.6], hang: 3.58, height: 0.55 },
  { id: 'modern_ceiling_lamp_01', at: [1.7, FZ - 7.6], hang: 3.58, height: 0.55 },
  { id: 'street_lamp_01', at: [-7.2, FZ + 4.1], rot: Math.PI / 2, height: 5.2 },
  { id: 'planter_box_02', at: [-3.4, FZ + 1.0], size: 1.5 },
  { id: 'planter_box_02', at: [3.4, FZ + 1.0], size: 1.5 },
  { id: 'modular_street_seating', at: [-5.6, FZ + 2.6], size: 2.6 },
];const PLACES = {
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
const BREAK = 12;   // s of the transition jingle between two tracks (then 2.5 s fading out)
// the shows' cards (the jingle videos made for the broadcast, muted: the page plays the sound): full screen over the
// studio as an ident starts (STAY TUNED, the DJ transition) or as the closing ends (THANK YOU, the Friday closing)
// (the Piano Sessions' cards: shared-assets/videos/piano-sessions, PS_01–PS_05; WE'LL BE RIGHT BACK and INTERMISSION
// loop while the show is paused, as the Friday ones do)
const CARD = { psSoon: 'assets/video/shows/ps-starting-soon.mp4', psBetween: 'assets/video/shows/ps-stay-tuned.mp4', psEnd: 'assets/video/shows/ps-thank-you.mp4',
  psBack: 'assets/video/shows/ps-right-back.mp4', psInter: 'assets/video/shows/ps-intermission.mp4',
  djOpen: 'assets/video/shows/dj-opening.mp4', djBetween: 'assets/video/shows/dj-stay-tuned.mp4', djEnd: 'assets/video/shows/dj-closing.mp4',
  // the Friday cards (shared-assets/videos/friday, FR_01–FR_04): STARTING SOON before the opening film, WE'LL BE RIGHT BACK
  // while the show is paused, INTERMISSION (from ⋯ Video), STAY TUNED in the short break between two tracks; the Friday
  // DJ transition film (DZ_09) stays in ⋯ Video
  djSoon: 'assets/video/shows/dj-starting-soon.mp4', djBack: 'assets/video/shows/dj-right-back.mp4', djInter: 'assets/video/shows/dj-intermission.mp4',
  djTransition: 'assets/video/shows/dj-transition.mp4' };
const asset = p => new URL('../' + p, import.meta.url).href;
// a song's cover: its album's artwork from djandykofficial.com (assets/covers, 192 px)
const cover = s => s && asset('assets/covers/' + s.id.split('/')[0] + '.jpg');
// in the DJ set, every 1–2 minutes a look from further off, always with the DJ in it: down through the lit glass
// floor, the club's master wide (the studio's own wide shots showed an empty studio over the closed shaft)
const WIDE = ['mDJ6', 'mDJ1', 'mDJ6'];
// the DJ's library by genre: the album's genre on djandykofficial.com, and a version named in a track's title wins
const ALBUM_GENRES = {
  'wavelength-traces': ['Trance'], 'remembers-the-shape': ['Trance', 'Progressive'], 'six-trance-ballads': ['Trance'],
  'before-i-forget': ['Trance', 'Progressive'], 'borrowed-sunshine': ['Trance', 'Progressive'], 'euphoria-needs-no-story': ['Trance'],
  'this-is-trance-hear-the-call': ['Trance'], 'four-elements': ['Trance', 'Progressive'], 'little-boy-little-girl': ['Trance'],
  'no-translation': ['Tech House', 'Progressive', 'Melodic'], 'do-not-disturb': ['House', 'Tech House'], 'back-to-eurodance': ['Eurodance'],
  'when-later-becomes-never': ['Progressive', 'House'], 'human-stories': ['House', 'Progressive'], 'deep-connections': ['House', 'Progressive'],
  'until-the-lights-come-on': ['Trance'], 'where-the-world-turns-gold': ['Trance'], 'zwischenlandung': ['Progressive'],
  'turn-the-attitude-into-gratitude': ['Melodic', 'House'], 'silence-for-crazy-bitches': ['Trance'],
};
const TITLE_GENRES = [[/techno|tribal/i, 'Techno'], [/trance/i, 'Trance'], [/tech house/i, 'Tech House'], [/house/i, 'House'], [/progressive/i, 'Progressive'], [/eurodance/i, 'Eurodance'], [/melodic/i, 'Melodic']];
const genresOf = s => { const t = TITLE_GENRES.filter(([re]) => re.test(s.title)).map(([, g]) => g); return t.length ? t : ALBUM_GENRES[s.id.split('/')[0]] || []; };
export const GENRES = ['Trance', 'Progressive', 'House', 'Tech House', 'Techno', 'Melodic', 'Eurodance'];
// DJ Andy'K's own voice drops (DR / SOU, clean, club, echo, fast): by hand only (⋯ FX drops), never by themselves
const FX = [['dr-clean', 'DR · Clean'], ['dr-club', 'DR · Club'], ['dr-echo', 'DR · Echo'], ['dr-fast', 'DR · Fast'],
  ['sou-clean', 'SOU · Clean'], ['sou-club', 'SOU · Club'], ['sou-echo', 'SOU · Echo'], ['sou-fast', 'SOU · Fast'], ['short', 'Short']];
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
  places: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 42s13-12.5 13-22a13 13 0 0 0-26 0c0 9.5 13 22 13 22z"/><circle cx="24" cy="20" r="4.5"/></svg>',
  cctv: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 14l26 8-3 8-26-8z"/><path d="M34 22l6 2"/><path d="M14 24l-2 10H6"/></svg>',
  backstage: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M12 40V8h20l4 4v28"/><path d="M8 40h32"/><circle cx="28" cy="25" r="1.5"/></svg>',
};

export function spaces(v, ctx) {
  const m = v.melbourne, director = ctx.director;
  const directorMode = new URLSearchParams(location.search).has('director');
  const dock = document.getElementById('dock'), ctrl = dock?.querySelector('.row.ctrl');
  if (!dock || !ctrl) return null;
  document.body.classList.toggle('dz-public', !directorMode);

  // every camera with the 4K look (as the high-speed ones): a longer lens, the camera stepped back along its line of
  // sight so the shot keeps its framing. As far as the room allows: in the studio within its round wall, in the club
  // within the club. The Piano Stage's cameras have theirs already (vienna/layout.js: lens), the security cameras,
  // the robot, the lift's own cameras and the places keep theirs
  const SKIP = /^(security|securityLounge|secClub|backstage|slowmo|robot|onWall|building|reception|secReception|secBuilding|v.*|mHS|mLift.*)$/;
  for (const [k, view] of Object.entries(VIEWS)) {
    if (SKIP.test(k) || view.lensed || !view.pos || !view.target || !view.fov) continue;
    const p = view.pos, t = view.target, club = !!view.melbourne;
    const ok = q => club ? inClub({ x: q[0], y: q[1], z: q[2] }) : Math.hypot(q[0], q[2] - 1) < 11.2 && q[1] > 0.4 && q[1] < 7.6;
    for (const lens of [0.75, 0.8, 0.85, 0.9, 0.95]) {
      const kf = Math.tan((view.fov * Math.PI) / 360) / Math.tan((view.fov * lens * Math.PI) / 360);
      const q = p.map((x, i) => t[i] + (x - t[i]) * kf);
      if (ok(q)) { view.pos = q; view.fov *= lens; break; }
    }
    view.lensed = true;
  }

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
  /* the shows' own on-air graphics (as the studio's simulation): above the controls, never in their way */
  /* the library: the space's songs or tracks, with covers, filtered by genre; a click plays one now */
  .sp-lib{display:flex;flex-direction:column;gap:10px}
  .sp-lib header{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
  .sp-lib header b{font:600 .66rem var(--wide,Arial);letter-spacing:.2em;text-transform:uppercase;width:100%;color:var(--dim,#8a9099)}
  .sp-lib .tab{font:500 .6rem var(--wide,Arial);letter-spacing:.12em;text-transform:uppercase;padding:6px 10px;border-radius:999px;border:1px solid var(--line,rgba(201,206,214,.16));background:none;color:var(--chrome,#c9ced6);cursor:pointer}
  .sp-lib .tab[aria-pressed=true]{border-color:var(--acc);color:var(--chrome-hi,#f3f5f8);background:rgba(var(--acc-rgb),.14)}
  .sp-lib ol{list-style:none;margin:0;padding:0;max-height:min(46vh,460px);overflow:auto}
  .sp-lib li button{display:flex;align-items:center;gap:12px;width:100%;padding:7px 8px;border:0;border-radius:10px;background:none;color:var(--chrome-hi,#f3f5f8);text-align:left;cursor:pointer;font:500 .8rem var(--wide,Arial)}
  .sp-lib li button:hover,.sp-lib li button[aria-current=true]{background:rgba(255,255,255,.07)}
  .sp-lib li img{width:40px;height:40px;border-radius:5px;object-fit:cover;flex:none}
  .sp-lib li span{display:flex;flex-direction:column;gap:2px;min-width:0}
  .sp-lib li small{color:var(--dim,#8a9099);font-size:.66rem;letter-spacing:.06em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  /* first person (the DJ's place, the pianist's): a cross in the middle, BACK, drag to look round, tap a control */
  .sp-pov{position:fixed;inset:0;z-index:6;pointer-events:none}
  body.sp-pov-on .dock:not(.more-open),body.sp-pov-on .dock .fine{opacity:0;pointer-events:none}
  body.sp-pov-on .dock.more-open .spaces{display:none}
  @keyframes sp-fade{0%,80%{opacity:1}100%{opacity:0}}
  body.sp-pov-on .sp-pov p{bottom:24px;animation:sp-fade 9s forwards}
  .sp-pov[hidden]{display:none}
  .sp-pov i{display:none}
  .sp-focus{position:fixed;z-index:6;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;pointer-events:none;border:2px solid rgba(var(--acc-rgb),.95);
    background:radial-gradient(circle,rgba(var(--acc-rgb),.18),rgba(var(--acc-rgb),0) 70%);box-shadow:0 0 14px rgba(var(--acc-rgb),.75),inset 0 0 8px rgba(255,255,255,.35);transition:left .12s,top .12s}
  .sp-focus[hidden]{display:none}
  .sp-pov i::before,.sp-pov i::after{content:"";position:absolute;background:rgba(243,245,248,.85);box-shadow:0 0 4px rgba(0,0,0,.8)}
  .sp-pov i::before{left:12px;top:0;width:2px;height:26px} .sp-pov i::after{top:12px;left:0;width:26px;height:2px}
  .sp-pov button{pointer-events:auto;position:absolute;top:calc(env(safe-area-inset-top,0px) + 74px);left:50%;transform:translateX(-50%);padding:8px 18px;border-radius:999px;
    background:rgba(8,9,12,.82);border:1px solid var(--line,rgba(201,206,214,.25));color:var(--chrome-hi,#f3f5f8);font:600 .7rem var(--wide,Arial);letter-spacing:.18em;cursor:pointer}
  .sp-pov p{position:absolute;bottom:calc(var(--dock-h,140px) + 14px);left:50%;transform:translateX(-50%);margin:0;padding:5px 12px;border-radius:6px;background:rgba(4,5,7,.7);
    color:var(--chrome,#c9ced6);font:500 .62rem var(--wide,Arial);letter-spacing:.14em;text-transform:uppercase;white-space:nowrap}
  /* the remote: a glass D-pad for first person (arrows move the cross, OK presses what is under it; held with an
     arrow it drags: a fader, a jog), BACK, HOME, MENU — as on a TV remote */
  .sp-pad{position:fixed;right:calc(var(--gut,16px) + 8px);bottom:calc(var(--dock-h,140px) + 18px);z-index:7;width:188px;height:236px;pointer-events:auto}
  .sp-pad[hidden]{display:none}
  .sp-pad .g{position:absolute;display:grid;place-items:center;color:#f3f5f8;cursor:pointer;user-select:none;-webkit-user-select:none;touch-action:none;
    background:linear-gradient(160deg,rgba(255,255,255,.22),rgba(255,255,255,.06) 45%,rgba(255,255,255,.03));border:1px solid rgba(255,255,255,.3);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 8px 26px rgba(0,0,0,.45);backdrop-filter:blur(14px) saturate(160%);-webkit-backdrop-filter:blur(14px) saturate(160%);
    font:600 .7rem var(--wide,Arial);letter-spacing:.12em}
  .sp-pad .g:active,.sp-pad .g.on{background:linear-gradient(160deg,rgba(var(--acc-rgb),.45),rgba(var(--acc-rgb),.12));border-color:rgba(var(--acc-rgb),.8)}
  .sp-pad .ring{left:14px;top:48px;width:160px;height:160px;border-radius:50%;cursor:default}
  .sp-pad .ok{left:59px;top:93px;width:70px;height:70px;border-radius:50%;font-size:.9rem;letter-spacing:.08em}
  .sp-pad .ar{width:44px;height:40px;border-radius:12px;background:none;border-color:transparent;box-shadow:none;font-size:1.1rem}
  .sp-pad .up{left:72px;top:52px} .sp-pad .dn{left:72px;top:164px} .sp-pad .lf{left:18px;top:108px;width:40px;height:44px} .sp-pad .rt{left:130px;top:108px;width:40px;height:44px}
  .sp-pad .sm{width:40px;height:40px;border-radius:50%;font-size:1rem}
  .sp-pad .home{left:8px;top:0} .sp-pad .menu{left:140px;top:0} .sp-pad .back{left:74px;top:0}
  /* glass: the space buttons, the edge, the remote */
  .spaces .sp,.edge .eb{background:linear-gradient(155deg,rgba(255,255,255,.16) 0%,rgba(255,255,255,.04) 38%,rgba(255,255,255,0) 60%,rgba(255,255,255,.06) 100%);border-color:rgba(255,255,255,.34);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.5),inset 0 -1px 0 rgba(255,255,255,.08),0 8px 24px rgba(0,0,0,.3);text-shadow:0 1px 2px rgba(0,0,0,.45);
    backdrop-filter:blur(22px) saturate(180%) brightness(1.05);-webkit-backdrop-filter:blur(22px) saturate(180%) brightness(1.05)}
  /* during a show the controls step out of the picture after a few seconds without the pointer moving (as a video
     player's do) and come back at once on any move, touch or key; the show's graphics then sit lower */
  .dock,.edge,.sp-pad{transition:opacity .6s ease}
  .dock,.edge{user-select:none;-webkit-user-select:none}   /* a drag over the picture never selects the buttons' labels */
  body.sp-idle .dock,body.sp-idle .edge{opacity:0;pointer-events:none}
  body.sp-idle canvas{cursor:none}
  body.sp-idle .sp-air .air-bottom{bottom:84px} body.sp-idle .sp-air .air-ticker{bottom:30px}
  .sp-air .air-bottom,.sp-air .air-ticker{transition:bottom .6s ease}
  /* ⋯ as a glass sheet of tiles: an icon over a short name, the space's own controls only */
  .dock.more-open .row.ctrl{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:6px;width:min(500px,calc(100vw - 32px));margin:0 auto 8px;padding:8px;border-radius:16px;
    background:linear-gradient(160deg,rgba(255,255,255,.07),rgba(255,255,255,.01) 60%);border:1px solid rgba(255,255,255,.28);box-shadow:inset 0 1px 0 rgba(255,255,255,.35),inset 0 0 30px rgba(255,255,255,.04),0 12px 34px rgba(0,0,0,.35);
    backdrop-filter:blur(22px) saturate(180%) brightness(1.05);-webkit-backdrop-filter:blur(22px) saturate(180%) brightness(1.05)}
  body[data-space=piano] .dock .row.ctrl:not(.sp-row),body[data-space=dj] .dock .row.ctrl:not(.sp-row){display:none!important}
  /* only the chosen space's sheet (these must win over the open sheet's grid above) */
  body:not([data-space=piano]) .dock.more-open .row.ctrl.sp-row[data-for=piano],body:not([data-space=dj]) .dock.more-open .row.ctrl.sp-row[data-for=dj]{display:none!important}
  .dock.more-open .row.ctrl .sep{display:none}
  .dock.more-open .row.ctrl > .b{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;height:56px;padding:5px 4px;border-radius:11px;text-align:center;
    background:linear-gradient(155deg,rgba(255,255,255,.16) 0%,rgba(255,255,255,.04) 38%,rgba(255,255,255,0) 60%,rgba(255,255,255,.06) 100%);border:1px solid rgba(255,255,255,.34);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.5),inset 0 -1px 0 rgba(255,255,255,.08),0 6px 18px rgba(0,0,0,.25);color:#f6f8fb;text-shadow:0 1px 2px rgba(0,0,0,.45);
    font-size:.5rem;letter-spacing:.08em;line-height:1.15;white-space:normal}
  .dock.more-open .row.ctrl > .b small{display:none} .dock.more-open .row.ctrl > .b .chev{display:none}
  .dock.more-open .row.ctrl > .b svg.ti{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;flex:none}
  .dock.more-open .row.ctrl > .b[aria-expanded=true]{border-color:var(--acc);background:linear-gradient(160deg,rgba(var(--acc-rgb),.32),rgba(var(--acc-rgb),.08))}
  /* the menus under a tile (Camera, Light, …) in the same glass: a sheet of small glass keys, as the tiles */
  .dock .pop{gap:6px;padding:8px;border-radius:16px;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));width:min(500px,calc(100vw - 32px));
    background:linear-gradient(160deg,rgba(255,255,255,.07),rgba(255,255,255,.01) 60%);border:1px solid rgba(255,255,255,.28);box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 12px 34px rgba(0,0,0,.35);
    backdrop-filter:blur(22px) saturate(180%) brightness(1.05);-webkit-backdrop-filter:blur(22px) saturate(180%) brightness(1.05)}
  .dock .pop[hidden]{display:none}
  .dock .pop .b{justify-content:center;text-align:center;min-height:40px;height:auto;padding:6px 8px;border-radius:11px;white-space:normal;line-height:1.2;
    font-size:.5rem;letter-spacing:.08em;color:#f6f8fb;text-shadow:0 1px 2px rgba(0,0,0,.45);
    background:linear-gradient(155deg,rgba(255,255,255,.16) 0%,rgba(255,255,255,.04) 38%,rgba(255,255,255,0) 60%,rgba(255,255,255,.06) 100%);border:1px solid rgba(255,255,255,.34);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.5),inset 0 -1px 0 rgba(255,255,255,.08),0 6px 18px rgba(0,0,0,.25)}
  .dock .pop .b:hover,.dock.more-open .row.ctrl > .b:hover{border-color:rgba(255,255,255,.55)}
  .dock .pop .b[aria-pressed=true]{border-color:var(--acc);background:linear-gradient(160deg,rgba(var(--acc-rgb),.32),rgba(var(--acc-rgb),.08))}
  .dock.more-open .row.ctrl > .b{overflow:hidden;letter-spacing:.05em!important;overflow-wrap:anywhere}
  /* the chosen control's colour is the space's own: Studio white, Piano gold, DJ Room ice blue (so it is always clear where one is) */
  body{--acc:#f3f5f8;--acc-rgb:243,245,248} body[data-space=piano]{--acc:#f2a650;--acc-rgb:242,166,80} body[data-space=dj]{--acc:#a9c8ee;--acc-rgb:169,200,238}
  /* ONE GLASS for everything clickable over the picture: the dock's buttons, the panels and their tabs and keys, the
     simulation's controls. Clear glass with a bright edge and a sheen, the picture blurred behind; the chosen one is
     tinted glass (not a solid white pill) */
  .dock{background:linear-gradient(rgba(4,5,7,0),rgba(4,5,7,.35) 60%)}
  .b,.tab,.pbtn,.air-b,.chip,.phead .x,.sp-info .x,.fld select{color:#f6f8fb;text-shadow:0 1px 2px rgba(0,0,0,.45);
    background:linear-gradient(155deg,rgba(255,255,255,.16) 0%,rgba(255,255,255,.04) 38%,rgba(255,255,255,0) 60%,rgba(255,255,255,.06) 100%);border:1px solid rgba(255,255,255,.34);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.5),inset 0 -1px 0 rgba(255,255,255,.08),0 6px 18px rgba(0,0,0,.25);
    backdrop-filter:blur(22px) saturate(180%) brightness(1.05);-webkit-backdrop-filter:blur(22px) saturate(180%) brightness(1.05)}
  .b:hover,.tab:hover,.pbtn:hover,.air-b:hover,.chip:hover{border-color:rgba(255,255,255,.55)}
  .b[aria-pressed="true"],.views .b[aria-pressed="true"],.looks .b[aria-pressed="true"],.tab[aria-selected="true"],.pbtn.main,.air-b[aria-pressed="true"]{
    color:#fff;border-color:var(--acc);background:linear-gradient(160deg,rgba(var(--acc-rgb),.36),rgba(var(--acc-rgb),.1) 55%,rgba(255,255,255,.05))}
  .looks .b[data-look="vienna"][aria-pressed="true"]{border-color:var(--amber,#f2a650);background:linear-gradient(160deg,rgba(242,166,80,.36),rgba(242,166,80,.1) 55%,rgba(255,255,255,.05))}
  .onair[aria-pressed="true"]{border-color:rgba(255,74,61,.7);background:linear-gradient(160deg,rgba(255,74,61,.34),rgba(255,74,61,.1) 55%,rgba(255,255,255,.05))}
  .panel,.air-ctl{--glass-sheet:1}
  .panel{background:linear-gradient(160deg,rgba(255,255,255,.08),rgba(255,255,255,.02) 60%),rgba(8,9,12,.45);border:1px solid rgba(255,255,255,.28);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 20px 50px rgba(0,0,0,.4);backdrop-filter:blur(24px) saturate(180%);-webkit-backdrop-filter:blur(24px) saturate(180%)}
  .now,.relcard,.trk{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.18)}
  .fld select option{background:#15171c;color:#f3f5f8}
  .sp-info{position:fixed;z-index:30;left:50%;top:50%;transform:translate(-50%,-50%);width:min(440px,calc(100vw - 32px));padding:18px 20px 14px;border-radius:18px;color:#f6f8fb;
    font-size:.8rem;line-height:1.5;text-shadow:0 1px 2px rgba(0,0,0,.45);
    background:linear-gradient(155deg,rgba(255,255,255,.16),rgba(255,255,255,.04) 45%,rgba(255,255,255,.03)),rgba(8,9,12,.35);border:1px solid rgba(255,255,255,.34);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.5),0 18px 50px rgba(0,0,0,.45);backdrop-filter:blur(24px) saturate(180%);-webkit-backdrop-filter:blur(24px) saturate(180%)}
  .sp-info[hidden]{display:none}
  .sp-info b{display:block;font-size:.66rem;letter-spacing:.2em;text-transform:uppercase;color:var(--acc);margin-bottom:8px}
  .sp-info p{margin:0 0 10px} .sp-info a{color:#f6f8fb} .sp-info .links{font-size:.7rem;letter-spacing:.06em} .sp-info .links a{text-decoration:none;border-bottom:1px solid rgba(255,255,255,.3)}
  .sp-info .dev{font-size:.62rem;letter-spacing:.08em;opacity:.7;margin:0}
  .sp-info .x{position:absolute;right:10px;top:10px;width:30px;height:30px;border-radius:50%;font-size:1rem;line-height:1;cursor:pointer}
  .edge:not(.open) .eb:not(.places){display:none}
  .edge.open .places{border-color:var(--acc)}
  .air.sp-air{z-index:4}
  .sp-air .air-l3{flex-direction:row;align-items:center;gap:14px}
  .sp-air .l3txt{display:flex;flex-direction:column;gap:4px;min-width:0}
  .sp-air .l3art{width:64px;height:64px;flex:none;border-radius:6px;object-fit:cover;box-shadow:0 0 0 1px rgba(255,255,255,.22),0 6px 18px rgba(0,0,0,.5)}
  .sp-air .l3art[hidden]{display:none}
  /* while the show's graphics are up the page's own header and shot label step aside (as in the studio's simulation) */
  body.sp-air-on .top,body.sp-air-on .shot,body.sp-air-on .hint{visibility:hidden} .sp-air .air-bottom{bottom:calc(var(--dock-h,140px) + 52px)} .sp-air .air-ticker{bottom:calc(var(--dock-h,140px) + 8px)}
  body.sp-min .sp-air .air-bottom{bottom:110px} body.sp-min .sp-air .air-ticker{bottom:66px}
  .dock:not(.more-open) .sp-row{display:none}
  /* minimised: only a small button to bring the controls back; nothing else over the picture */
  body.sp-min .dock .row,body.sp-min .dock .pop,body.sp-min .dock .fine,body.sp-min .edge,body.sp-min .spaces > :not(.min){display:none!important}
  body.sp-min .spaces .min{transform:rotate(180deg);opacity:.55}
  body.sp-min .spaces .min:hover{opacity:1}
  body[data-space=piano] .dock .row.ctrl:not(.sp-row),body[data-space=dj] .dock .row.ctrl:not(.sp-row){display:none}
  body:not([data-space=piano]) .sp-row[data-for=piano],body:not([data-space=dj]) .sp-row[data-for=dj]{display:none}
  .spaces .small{align-self:center;width:auto;height:44px;padding:0 14px;border-radius:22px;font-size:.6rem;letter-spacing:.16em;flex-direction:row}
  /* the first visit's guide: the buttons to know glow in turn, a small glass note beside them */
  @keyframes sp-glow{0%,100%{box-shadow:0 0 0 0 rgba(169,200,238,.0),inset 0 1px 0 rgba(255,255,255,.5)}50%{box-shadow:0 0 0 6px rgba(169,200,238,.35),0 0 26px rgba(169,200,238,.7),inset 0 1px 0 rgba(255,255,255,.5)}}
  .sp-guide-on{animation:sp-glow 1.4s ease-in-out infinite;border-color:var(--ice,#a9c8ee)!important}
  .sp-guide{position:fixed;z-index:30;max-width:250px;padding:12px 14px 10px;border-radius:14px;color:#f6f8fb;font-size:.8rem;line-height:1.4;
    background:linear-gradient(155deg,rgba(255,255,255,.18),rgba(255,255,255,.05) 45%,rgba(255,255,255,.03));border:1px solid rgba(255,255,255,.34);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.5),0 10px 30px rgba(0,0,0,.4);backdrop-filter:blur(22px) saturate(180%);-webkit-backdrop-filter:blur(22px) saturate(180%);
    text-shadow:0 1px 2px rgba(0,0,0,.45);transition:left .35s ease,top .35s ease}
  .sp-guide b{display:block;font-size:.62rem;letter-spacing:.16em;text-transform:uppercase;color:var(--ice,#a9c8ee);margin-bottom:4px}
  .sp-guide .gnav{display:flex;justify-content:space-between;align-items:center;margin-top:10px;gap:10px}
  .sp-guide button{font:inherit;font-size:.62rem;letter-spacing:.14em;text-transform:uppercase;color:#f6f8fb;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.3);border-radius:14px;padding:5px 12px;cursor:pointer}
  .sp-guide .skip{background:none;border-color:transparent;opacity:.7;padding:5px 0}
  .sp-guide .dots{opacity:.6;font-size:.62rem;letter-spacing:.2em}`;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  const bar = document.createElement('div'); bar.className = 'spaces'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Spaces');
  const button = (key, label) => `<button class="sp ${key}" type="button" data-space="${key}" aria-pressed="false">${ICON[key]}<img class="art" alt="" hidden><span>${label}</span><small></small></button>`;
  bar.innerHTML = button('studio', 'Studio') + button('piano', 'Piano') + button('dj', 'DJ Room')
    + '<button class="sp more" type="button" aria-expanded="false" aria-label="More controls" title="More for this space">⋯</button>'
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
  const openProgramme = () => { programmeAll = true; liveBtn?.click(); };
  // INFO: a glass card with what this page is, the legal pages and how it works (the page's footer keeps one line)
  const info = document.createElement('div'); info.className = 'sp-info'; info.hidden = true; info.setAttribute('role', 'dialog'); info.setAttribute('aria-label', 'Info');
  info.innerHTML = `<button class="x" type="button" aria-label="Close">×</button><b>Info</b>
    <p>A virtual set preview. “Simulate” plays a simulation of the show on this page; nothing is recorded or broadcast. First show 27 January 2027 · <a href="/">distancezeroshow.com</a></p>
    <p class="links"><a href="how-it-works" target="_blank" rel="noopener">How it works</a> · <a href="?guide">Guide</a></p>
    <p class="links"><a href="https://distancezeroshow.com/impressum#en">Impressum</a> · <a href="https://distancezeroshow.com/privacy#en">Privacy</a> · <a href="https://distancezeroshow.com/cookies#en">Cookies</a> · <a href="https://distancezeroshow.com/terms#en">Terms of use</a> · <a href="https://distancezeroshow.com/disclaimer#en">Disclaimer</a></p>
    <p class="dev">Developed by Andy'K Group International LTD</p>`;
  document.body.appendChild(info);
  info.querySelector('.x').addEventListener('click', () => { info.hidden = true; });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !info.hidden) info.hidden = true; });
  const openInfo = () => { info.hidden = !info.hidden; };

  // the edge: views that are always there, whatever plays
  const edge = document.createElement('nav'); edge.className = 'edge'; edge.setAttribute('aria-label', 'Always on');
  edge.innerHTML = [['building', 'building', 'Building'], ['reception', 'reception', 'Reception'], ['backstage', 'backstage', 'Backstage'], ['security', 'cctv', 'CCTV'], ['after', 'after', 'Aftershow']]
    .map(([view, icon, label]) => `<button class="eb" type="button" data-view-edge="${view}" aria-pressed="false">${ICON[icon]}<span>${label}</span></button>`).join('');
  // one PLACES button; the places unfold under it and fold away again after a choice
  edge.insertAdjacentHTML('afterbegin', `<button class="eb places" type="button" aria-expanded="false">${ICON.places}<span>Places</span></button>`);
  document.body.appendChild(edge);
  const placesBtn = edge.querySelector('.places');
  // FIRST VISIT: a short guide, three steps. The buttons to know glow in turn and a small glass note says what they do;
  // a tap on the glowing button (or NEXT) goes on, SKIP ends it. Shown once (?guide shows it again)
  (() => {
    let seen = false; try { seen = localStorage.getItem('dz-guide') === '1'; } catch {}
    if (seen && !/[?&]guide\b/.test(location.search)) return;
    const steps = [
      [() => [...bar.querySelectorAll('.sp[data-space]')], 'Pick a space', 'Studio, Piano or DJ Room: a tap takes you there and its show starts. Tap again to pause.'],
      [() => [more], 'More for this space', '⋯ opens the space\'s own controls: cameras, light, effects, music, the programme and info. ▾ hides everything to just watch.'],
      [() => [placesBtn], 'Places', 'The building, the reception, backstage, the CCTV cameras and the aftershow, whenever you like.'],
    ];
    const note = document.createElement('div'); note.className = 'sp-guide'; note.setAttribute('role', 'dialog'); note.setAttribute('aria-label', 'Guide');
    let i = -1, lit = [];
    const end = () => { lit.forEach(e => e.classList.remove('sp-guide-on')); note.remove(); removeEventListener('resize', place); try { localStorage.setItem('dz-guide', '1'); } catch {} };
    function place() {
      if (!lit.length) return;
      const r = lit.map(e => e.getBoundingClientRect()).reduce((a, b) => ({ left: Math.min(a.left, b.left), top: Math.min(a.top, b.top), right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom) }));
      const w = note.offsetWidth, h = note.offsetHeight, W = innerWidth, H = innerHeight;
      let x, y;
      if (r.top > H * 0.6) { x = (r.left + r.right) / 2 - w / 2; y = r.top - h - 14; }        // under the note: the dock
      else if (r.left > W * 0.5) { x = r.left - w - 14; y = r.top; }                           // left of it: the edge
      else { x = r.right + 14; y = r.top; }
      note.style.left = Math.max(16, Math.min(W - w - 16, x)) + 'px'; note.style.top = Math.max(16, Math.min(H - h - 16, y)) + 'px';
    }
    function step() {
      lit.forEach(e => { e.classList.remove('sp-guide-on'); e.removeEventListener('click', step); });
      if (++i >= steps.length) return end();
      const [els, title, text] = steps[i];
      lit = els(); lit.forEach(e => { e.classList.add('sp-guide-on'); e.addEventListener('click', step, { once: true }); });
      note.innerHTML = `<b>${title}</b>${text}<div class="gnav"><button class="skip" type="button">Skip</button><span class="dots">${steps.map((_, k) => k === i ? '●' : '○').join(' ')}</span><button class="next" type="button">${i === steps.length - 1 ? 'Got it' : 'Next'}</button></div>`;
      note.querySelector('.skip').onclick = () => { lit.forEach(e => e.removeEventListener('click', step)); end(); };
      note.querySelector('.next').onclick = step;
      requestAnimationFrame(place);
    }
    addEventListener('resize', place);
    setTimeout(() => { document.body.appendChild(note); step(); }, 1500);
  })();
  placesBtn.addEventListener('click', () => { const open = edge.classList.toggle('open'); placesBtn.setAttribute('aria-expanded', String(open)); });
  edge.addEventListener('click', e => {
    const b = e.target.closest('[data-view-edge]'); if (!b) return;
    edge.classList.remove('open'); placesBtn.setAttribute('aria-expanded', 'false');
    wallHold = false; exitPov();
    if (b.dataset.viewEdge === 'after') { cctv.stop(); return afterShow.on ? afterShow.stop() : afterShow.start(); }
    if (b.dataset.viewEdge === 'security') { afterShow.stop(); m.releaseCameras(); return cctv.on ? cctv.stop() : cctv.start(); }
    cctv.stop();
    afterShow.stop(); director.setAuto(false); m.releaseCameras();
    const view = b.dataset.viewEdge;
    if (PLACES[view]) return place().then(() => director.go(view, { instant: true }));
    // a cut, never a walk: the walk backstage is for the studio's own BACKSTAGE door, not for these buttons
    director.go(view, { instant: true });
  });

  /* ----- scanned furniture (Poly Haven, CC0): each model loaded once, fitted to its real size, stood on its floor ----- */
  let gltf = null; const modelCache = new Map();
  async function addProps(list, parent) {
    const THREE_ = THREE;
    gltf ??= import('three/addons/loaders/GLTFLoader.js').then(({ GLTFLoader }) => new GLTFLoader());
    const gl = await gltf;
    await Promise.all(list.map(async pr => {
      try {
        if (!modelCache.has(pr.id)) modelCache.set(pr.id, gl.loadAsync(asset(`assets/models/${pr.id}/${pr.id}.gltf`)));
        const o = (await modelCache.get(pr.id)).scene.clone(true);
        o.rotation.y = pr.rot || 0; o.updateMatrixWorld(true);
        const box = new THREE_.Box3().setFromObject(o), dim = box.getSize(new THREE_.Vector3());
        o.scale.multiplyScalar(pr.height ? pr.height / dim.y : pr.size / Math.max(dim.x, dim.z)); o.updateMatrixWorld(true);
        box.setFromObject(o); const c = box.getCenter(new THREE_.Vector3());
        o.position.x += pr.at[0] - c.x; o.position.z += pr.at[1] - c.z;
        o.position.y += pr.hang !== undefined ? pr.hang - box.max.y : (pr.y ?? 0.052) - box.min.y;
        o.traverse(x => { if (x.isMesh) { x.castShadow = x.receiveShadow = true; for (const mm of [].concat(x.material)) if (mm) mm.envMapIntensity = 0.8; } });
        parent.add(o);
      } catch (e) { console.warn('prop', pr.id, e.message); }
    }));
  }
  // the backstage lounge's plants and side table: loaded the first time someone looks in
  const LOUNGE_PROPS = [
    { id: 'potted_plant_01', at: [3.05, -7.8], height: 1.45 },
    { id: 'potted_plant_02', at: [-3.15, -10.85], rot: 0.8, height: 1.2 },
    { id: 'side_table_01', at: [-2.35, -9.55], y: 0.005, size: 0.5 },
  ];
  let loungeFurnished = false;
  const furnishLounge = () => { if (loungeFurnished) return; loungeFurnished = true; addProps(LOUNGE_PROPS, ctx.scene); };

  /* ----- the building and the reception: built the first time, shown only while the camera is out there ----- */
  ZONES.push({ has: p => p.z > 18, keep(p) { p.y = Math.max(0.25, p.y); } });
  // the backstage lounge's reflections, rendered in Cycles (as the studio's): its own room in the lacquer and glass
  applyProbe(ctx.renderer, 'backstage', [ctx.studio.lounge.group], { shared: new Set(Object.values(ctx.studio.M).filter(x => x?.isMaterial)) }).catch(() => {});
  let street = null;
  const place = () => (street ??= (async () => {
    const [{ buildStreet }, { RGBELoader }, THREE] = await Promise.all([import('./building.js'), import('three/addons/loaders/RGBELoader.js'), import('three')]);
    const hdr = await new RGBELoader().setDataType(THREE.FloatType).loadAsync(asset('assets/cc0/modern_buildings_night_1k.hdr'));
    const px = hdr.image.data; for (let i = 0; i < px.length; i++) if ((i & 3) !== 3) px[i] = Math.min(px[i], 1.6);   // as the arrival: lamps as glints
    const pm = new THREE.PMREMGenerator(ctx.renderer), env = pm.fromEquirectangular(hdr).texture; pm.dispose();
    hdr.mapping = THREE.EquirectangularReflectionMapping; const hdr0 = hdr;
    const st = buildStreet(env, { cc0: asset('assets/cc0/'), furnish: true }); ctx.scene.add(st.group); await st.ready;
    await addProps(PROPS, st.group);
    st.sky = hdr0;   // the night city, behind the building when the camera is out there
    // out there the studio, the club, the Piano Stage and the studio's mirror floor are behind the facade: they are
    // not drawn while a camera (also a reflection's) is outside, only restored for the next picture. Inside, the
    // building is hidden (below). Their shaders are compiled now, so the first look out does not stall
    const heavy = [ctx.studio.root, m.room?.root, v.stage?.root, ...ctx.scene.children.filter(o => o.isReflector)].filter(Boolean);
    let saved = null;
    const before = ctx.scene.onBeforeRender, after = ctx.scene.onAfterRender;
    ctx.scene.onBeforeRender = (r, s, cam, ...rest) => { before?.call(ctx.scene, r, s, cam, ...rest); if (!saved && cam.position.z > 15) { saved = heavy.map(o => o.visible); heavy.forEach(o => { o.visible = false; }); } };
    ctx.scene.onAfterRender = (...a) => { after?.call(ctx.scene, ...a); if (saved) { heavy.forEach((o, i) => { o.visible = saved[i]; }); saved = null; } };
    st.group.visible = true; ctx.renderer.compileAsync?.(ctx.scene, ctx.camera).catch(() => {});
    // the security cameras out there, where their views are: high in the lobby, on a pole across from the entrance
    const { securityCam } = await import('./set.js');
    for (const k of ['secReception', 'secBuilding']) {
      const view = VIEWS[k], cam = securityCam(ctx.studio.M, placeAnim), at2 = new THREE.Vector3(...view.target), from = new THREE.Vector3(...view.pos);
      cam.position.copy(from).addScaledVector(at2.clone().sub(from).normalize(), -0.3); cam.lookAt(at2); st.group.add(cam);
      if (k === 'secBuilding') { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, view.pos[1], 12), ctx.studio.M.graphite); pole.position.set(cam.position.x, view.pos[1] / 2, cam.position.z - 0.25); st.group.add(pole); }
    }
    // the reflections rendered in Cycles (production/gpu, cache-places): inside the doors the reception's, outside the
    // street's. Without the files the materials keep their own environment
    const lobby = [], street = [], at = new THREE.Vector3();
    st.group.traverse(o => { if (o.isMesh && !o.isReflector) (o.getWorldPosition(at).z < FZ - 0.1 ? lobby : street).push(o); });
    applyProbe(ctx.renderer, 'street', street).then(() => applyProbe(ctx.renderer, 'reception', lobby)).catch(() => {});
    return st;
  })());
  const placeAnim = [];   // the place's security cameras' REC lamps
  const outside = () => ctx.camera.position.z > 15;
  let shownOut = null, studioFog = null, studioBg = null;

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

  /* ----- the on-air graphics of the Piano and DJ shows: ON AIR, the logo, the lower third, camera, clocks, ticker ----- */
  const TICKER = ['SIMULATION — NOT A REAL BROADCAST', 'DISTANCE // ZERO', 'Vienna // Melbourne · 15,731 km', 'Opening Show Wednesday 27 January 2027',
    'Every Friday · DJ Show · Live from Melbourne Underground', 'Every Saturday · Piano Sessions · Live from Vienna', 'Every Sunday · The Live Show', 'distancezeroshow.com'];
  const gfx = document.createElement('div'); gfx.className = 'air sp-air'; gfx.hidden = true; gfx.setAttribute('aria-hidden', 'true');
  gfx.innerHTML = `<div class="air-gfx"><div class="air-top"><div class="air-onair"><i></i><b>ON AIR</b><small>Simulation</small></div><div><img class="air-bug" src="${asset('assets/logo-do.webp')}" alt="" width="327" height="160"></div></div>
    <div class="air-bottom"><div class="air-l3"><img class="l3art" alt="" hidden><div class="l3txt"><b></b><span></span></div></div><div class="air-meta"><span class="air-cam"></span><span class="air-clock">VIE <b class="v"></b> · MEL <b class="m"></b></span></div></div>
    <div class="air-ticker"><div class="air-track">${[0, 1].map(() => TICKER.map(t => `<span>${t}</span><i>//</i>`).join('')).join('')}</div></div></div>`;
  document.body.appendChild(gfx);
  const g = { art: gfx.querySelector('.l3art'), t: gfx.querySelector('.air-l3 b'), s: gfx.querySelector('.air-l3 span'), cam: gfx.querySelector('.air-cam'), v: gfx.querySelector('.v'), m: gfx.querySelector('.m') };
  const hm = tz => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
  function airGfx() {
    const P = v.show, pianoOn = active === 'piano' && (piano || pianoPlaying()), djOn = active === 'dj' && dj && !dj.done;
    gfx.hidden = !(pianoOn || djOn) || !!pov;
    document.body.classList.toggle('sp-air-on', !gfx.hidden);
    if (gfx.hidden) return;
    const djSong = dj?.el === track ? dj.steps[dj.i - 1]?.track : null;
    const [title, sub] = pianoOn
      ? (P.state === 'SONG' ? [P.song?.title || '', 'Piano Sessions · Live from Vienna'] : piano?.soon ? ['PIANO SESSIONS', 'Starting soon'] : ['PIANO SESSIONS', P.label || 'Live from Vienna'])
      : (djSong ? [djSong.title, "DJ Andy'K · DJ Show · Live from Melbourne Underground"] : ['DJ SHOW', !dj.el ? 'Opening · Live from Melbourne Underground' : 'Live from Melbourne Underground']);
    if (g.t.textContent !== title) g.t.textContent = title;
    if (g.s.textContent !== sub) g.s.textContent = sub;
    // the artwork of what plays, beside its title
    const song = pianoOn ? (P.state === 'SONG' ? P.song : null) : djSong, art = song ? cover(song) : '';
    if (g.art.dataset.src !== art) { g.art.dataset.src = art; if (art) g.art.src = art; g.art.hidden = !art; }
    const cam = VIEWS[director.current]?.cam || VIEWS[director.current]?.label || 'CAM'; if (g.cam.textContent !== cam) g.cam.textContent = cam;
    g.v.textContent = hm('Europe/Vienna'); g.m.textContent = hm('Australia/Melbourne');
  }

  /* ----- the cards: one video element, full screen, faded in and out ----- */
  const cardEl = document.createElement('video');
  Object.assign(cardEl, { muted: true, playsInline: true, preload: 'auto', className: 'sp-card' });
  document.body.appendChild(cardEl);
  let cardOf = null;   // which card shows (so each plays once per moment)
  // the card on the LED wall (the wall's own video programme, as the studio's simulation uses), the camera on the wall,
  // the logo up; while it plays the shot stays on the wall. A show's closing card stays on its last frame
  let wallBefore = null, onWall = false, wallHold = false, logoUp = false;   // logoUp: the hanging logo is up for a show (set in the loop)   // wallHold: the camera stays on the wall (until the visitor picks one)
  function card(name, { manual = false, loop = false } = {}) {
    if (cardOf === name && !manual) return; cardOf = name;
    cardEl.src = asset(CARD[name]); cardEl.loop = loop; cardEl.currentTime = 0; cardEl.play().catch(() => {});
    if (!onWall) { wallBefore = v.source; onWall = true; }
    v.setSource('main'); ctx.studio.wall.film(() => [[cardEl, 1]]); ctx.studio.wall.set('film');
    director.setAuto(false); director.go(CARD_VIEW, { instant: true }); wallHold = true;
    cardEl.onended = () => { if (manual || !name.endsWith('End')) wallOff(); };
  }
  function wallOff() {
    if (!onWall) return; onWall = false;
    ctx.studio.wall.set('idle'); if (wallBefore && wallBefore !== 'main') v.setSource(wallBefore);
  }
  const cardOff = () => { cardOf = null; cardEl.pause(); wallOff(); };

  /* ----- the Piano Sessions, in show order ----- */
  // (the album Opus No. 1: Vienna is not part of the Piano Sessions)
  const PIANO_SONGS = REPERTOIRE.filter(s => s.piano && s.audio && s.audioOk && !s.id.startsWith('opus-no-1-vienna/'));
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
  // the Piano Sessions' pause on the wall: WE'LL BE RIGHT BACK (the PIANO button) or INTERMISSION (⋯ Video) loops there
  // until the show goes on; then the main front camera
  function pausePiano({ hold } = {}) {
    if (!piano || piano.soon || !pianoPlaying()) return;
    v.showCommand('pause');
    if (v.show.paused && hold) { piano.hold = hold; card(hold, { manual: true, loop: true }); }
    else if (!v.show.paused && piano.hold) { piano.hold = null; cardOff(); wallHold = false; v.pickCamera('P1'); }
  }
  function pianoIntermission() {
    if (!piano || piano.soon || !pianoPlaying()) return;
    if (piano.hold === 'psInter') return pausePiano();
    if (v.show.paused) { piano.hold = 'psInter'; card('psInter', { manual: true, loop: true }); } else pausePiano({ hold: 'psInter' });
  }
  function beginPiano() { if (!piano?.soon) return; piano.soon = false; v.showCommand(v.show.state === 'IDLE' || v.show.state === 'ENDED' ? 'start' : 'restart'); }
  const stopPiano = () => { piano = null; cardOff(); if (pianoPlaying()) v.showCommand('stop'); };   // (also ends a STARTING SOON)

  /* ----- the DJ show, in show order ----- */
  const DJ_TRACKS = REPERTOIRE.filter(s => !s.piano && s.audio && s.audioOk && s.bpm);
  const live = liveMusic();
  const track = new Audio(), jingle = new Audio(), fxEl = new Audio();
  fxEl.preload = 'auto';
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
    unlockAll([...djPlayers(), fxEl]);
    for (const a of [track, jingle]) { if (!a.src) a.src = a === jingle ? asset(JINGLE.between) : DJ_TRACKS[0].audio; a.muted = true; a.play().then(() => { a.pause(); a.muted = false; }).catch(() => { a.muted = false; }); }
    live.follow(track);
  }
  function djStep() {
    const step = dj.steps[dj.i++];
    if (!step) {
      m.setShow('ended'); m.setAuto(false); m.setMusicSource(null); dj.over = true; dj.el = null; dj.done = true;
      // the show is over: the booth rides back up into the studio (and AFTERSHOW follows there)
      if ((m.lift.state !== 'UP' || m.env === 'djroom') && !m.travelling) m.transition('up');
      return;
    }
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
      m.setTempo(s.bpm); m.setMode('PERFORMANCE'); m.setShow('live'); m.setAuto(!pov);
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
      clearInterval(jingle._ramp); jingle.volume = 1; jingle.src = asset(JINGLE[step.jingle]); jingle.currentTime = 0; dj.el = jingle; jingle.play().catch(() => {});
      m.setMusicSource(null); m.setTrack(null);
      if (dj.deck) m.setDeck(dj.deck + 1, { state: 'pause' });
      if (step.jingle === 'end') { m.setMode('CLOSING'); m.setAuto(false); m.pickCamera('DJ2'); } else { m.setMode('BREAKDOWN'); m.setShow('break'); }
    }
  }
  function djNext() {
    if (!dj || dj.paused || dj.done) return;
    if (dj.el === track && !pov && performance.now() > dj.wideAt) { dj.wideAt = performance.now() + 60000 + Math.random() * 60000; director.go(WIDE[(dj.wideI = (dj.wideI || 0) + 1) % WIDE.length]); }
    if (dj.waitUp) { if (!m.travelling && m.lift.state === 'UP') { dj.waitUp = false; m.djOpening('start', undefined, 'short'); } return; }
    // between two tracks a short break, not the whole 80 s transition jingle: its first BREAK seconds, then it fades
    // out and the next track starts
    if (dj.fading) return;
    if (dj.el === jingle && dj.steps[dj.i - 1]?.jingle === 'between' && jingle.currentTime > BREAK) {
      const it = dj; it.fading = true;
      ramp(jingle, 0, 2500, () => { jingle.pause(); jingle.volume = 1; it.fading = false; if (dj === it && dj.el === jingle) djStep(); });
      return;
    }
    if (dj.soon) { if (performance.now() > dj.soonUntil) cardEl.onended?.(); return; }
    const op = m.opening.state;
    if (!dj.el ? (dj.i > 0 && (op === 'ENDED' || op === 'IDLE')) : dj.el.ended) djStep();
  }
  function startDj() {
    const tracks = pick(djGenre ? DJ_TRACKS.filter(s => genresOf(s).includes(djGenre)) : DJ_TRACKS, 4);
    dj = { i: 0, el: null, paused: false, steps: [{ opening: true }, ...tracks.flatMap((s, k) => (k < tracks.length - 1 ? [{ track: s }, { jingle: 'between' }] : [{ track: s }])), { jingle: 'end' }] };
    // first STARTING SOON on the studio's LED wall (once round its loop), then the show's opening film (FRIDAY LIVE
    // OPENING), then the booth's own opening
    const it = dj; it.soon = true; it.soonUntil = performance.now() + 15000;   // (in case the card cannot play)
    card('djSoon', { manual: true });
    cardEl.onended = () => {
      if (dj !== it || !it.soon) return; it.soon = false;
      card('djOpen', { manual: true });
      cardEl.onended = () => { wallOff(); cardOf = null; if (dj === it && dj.i === 0) { wallHold = false; djStep(); } };
    };
  }
  // the show's pause on the wall: WE'LL BE RIGHT BACK (the DJ ROOM button) or INTERMISSION (⋯ Video) loops there until
  // the show goes on; then back to the booth. (A pause from the console in first person shows no card)
  function holdCard(name) { dj.hold = name; card(name, { manual: true, loop: true }); }
  function intermission() {
    if (!dj || dj.done || dj.soon || !dj.el) return;
    if (dj.hold === 'djInter') return pauseDj();
    if (dj.paused) holdCard('djInter'); else pauseDj({ hold: 'djInter' });
  }
  function pauseDj({ hold } = {}) {
    if (!dj) return;
    dj.paused = !dj.paused;
    if (dj.soon) { if (!dj.paused) dj.soonUntil = performance.now() + 15000; return; }   // STARTING SOON just waits
    if (!dj.el) m.djOpening('pause');
    else if (dj.paused) dj.el.pause(); else dj.el.play().catch(() => {});
    if (dj.el === track && dj.deck) m.setDeck(dj.deck + 1, { state: dj.paused ? 'pause' : 'play', position: track.currentTime });
    if (dj.paused && hold && dj.el) holdCard(hold);
    else if (!dj.paused && dj.hold) { dj.hold = null; cardOff(); wallHold = false; if (dj.el === track) { m.pickCamera('DJ1'); m.setAuto(!pov); } }
  }
  function stopDj() {
    if (dj) { cardOff(); track.pause(); jingle.pause(); for (const n of [2, 3]) m.setDeck(n, { state: 'stop', position: 0 }); dj = null; m.setMusicSource(null); m.setTrack(null); m.setAuto(false); }
    if (['PLAYING', 'PAUSED'].includes(m.opening.state)) m.djOpening('stop');
  }

  /* ----- the library, as tabs of the music station (as its PIANO tab): SONGS at the Piano Stage, LIBRARY in the DJ
     Room; the piano songs or the DJ's tracks with their covers, filtered by genre; a click plays one now ----- */
  let libGenre = 'All';
  function libraryNode(kind) {
    const piano_ = kind === 'piano', all = piano_ ? PIANO_SONGS : DJ_TRACKS;
    const genres = piano_ ? [] : ['All', ...GENRES.filter(g => all.some(s => genresOf(s).includes(g)))];
    const list = piano_ || libGenre === 'All' ? all : all.filter(s => genresOf(s).includes(libGenre));
    const now = piano_ ? (v.show.state === 'SONG' ? v.show.song?.id : null) : dj?.el === track ? dj.steps[dj.i - 1]?.track?.id : null;
    const el = document.createElement('div'); el.className = 'sp-lib';
    el.innerHTML = `<header><b>${piano_ ? list.length + ' piano songs · tap one to play it' : list.length + ' tracks · tap one to play it'}</b>${genres.map(g => `<button class="tab" type="button" data-g="${g}" aria-pressed="${g === libGenre}">${g}</button>`).join('')}</header>
      <ol>${list.map(s => `<li><button type="button" data-id="${s.id}" aria-current="${s.id === now}"><img src="${cover(s)}" alt="" loading="lazy"><span>${s.title}<small>${s.album}${s.bpm ? ' · ' + s.bpm + ' BPM' : ''}${s.key ? ' · ' + s.key : ''}${piano_ ? '' : ' · ' + genresOf(s).join(', ')}</small></span></button></li>`).join('')}</ol>`;
    el.addEventListener('click', e => {
      const tab = e.target.closest('[data-g]'), row = e.target.closest('[data-id]');
      if (tab) { libGenre = tab.dataset.g; djGenre = libGenre === 'All' ? null : libGenre; ctx.panels?.refresh(); return; }
      if (!row) return;
      const s = all.find(x => x.id === row.dataset.id);
      if (s) (piano_ ? playSongNow : playTrackNow)(s);
      ctx.panels?.refresh();
    });
    return el;
  }
  ctx.panels?.addTab('songs', () => libraryNode('piano'));
  ctx.panels?.addTab('library', () => libraryNode('dj'));
  const openLibrary = kind => ctx.panels?.open('station', kind === 'piano' ? 'songs' : 'library');
  // a piano song now: the show goes to LIVE (the openings stop) and the song is next in its order
  function playSongNow(s) {
    afterShow.stop(); cctv.stop(); ended = null; active = 'piano'; document.body.dataset.space = 'piano';
    stopDj(); if (m.env === 'djroom') m.setEnv('studio', { transition: false });
    const sp = v.show.audio?.song; if (sp && !sp.src) sp.src = s.audio;
    unlockAll(pianoPlayers());
    if (!piano) piano = { i: 0, steps: [] };
    piano.soon = false; cardOff();
    piano.steps.splice(piano.i, 0, { song: s });
    v.showCommand('live');
  }
  // a volume ramp (an element's volume to `to` in `ms`)
  function ramp(el, to, ms, done) {
    clearInterval(el._ramp); const from = el.volume, t0 = performance.now();
    el._ramp = setInterval(() => { const k = Math.min(1, (performance.now() - t0) / ms); el.volume = Math.max(0, Math.min(1, from + (to - from) * k)); if (k >= 1) { clearInterval(el._ramp); done?.(); } }, 30);
  }
  // a mix, not a cut: the playing track goes on in a second player and fades out while the new one fades in
  function crossfade() {
    if (track.paused || !track.src) return false;
    const tail = new Audio(); tail.src = track.src; tail.currentTime = track.currentTime; tail.volume = track.volume; tail.play().catch(() => {});
    ramp(tail, 0, 3000, () => { tail.pause(); tail.removeAttribute('src'); tail.load(); });
    track.volume = 0; return true;
  }
  // a DJ track now: it plays at once (the opening or the track before it stops), the set goes on after it
  function playTrackNow(s) {
    afterShow.stop(); cctv.stop(); ended = null; active = 'dj'; document.body.dataset.space = 'dj';
    stopPiano(); unlock();
    if (!dj || dj.done) dj = { i: 0, el: null, paused: false, steps: [{ jingle: 'end' }] };
    if (['PLAYING', 'PAUSED'].includes(m.opening.state)) m.djOpening('stop');
    const mixing = dj.el === track && crossfade();
    if (!mixing) dj.el?.pause(); dj.waitUp = false; dj.paused = false;
    dj.steps.splice(dj.i, 0, { track: s }, { jingle: 'between' });
    djStep();
    if (mixing) ramp(track, 1, 2500);
  }

  /* ----- FIRST PERSON: standing at the DJ console / sitting at the grand. The camera is where the eyes are; drag to
     look round (left, right, up to the ceiling, down to the floor); a tap works the control under it: the decks'
     PLAY and CUE, a jog (drag: scrub), the channel faders and the crossfader (drag), the EQ knobs (drag); at the grand,
     its keys play. BACK returns to the camera before ----- */
  const povUi = document.createElement('div'); povUi.className = 'sp-pov'; povUi.hidden = true;
  povUi.innerHTML = '<i></i><p></p>'; document.body.appendChild(povUi);
  const pad = document.createElement('div'); pad.className = 'sp-pad'; pad.hidden = true; pad.setAttribute('aria-label', 'Remote');
  pad.innerHTML = `<div class="g ring"></div>
    <button class="g ar up" type="button" data-d="0,-1" aria-label="Up">▲</button><button class="g ar dn" type="button" data-d="0,1" aria-label="Down">▼</button>
    <button class="g ar lf" type="button" data-d="-1,0" aria-label="Left">◀</button><button class="g ar rt" type="button" data-d="1,0" aria-label="Right">▶</button>
    <button class="g ok" type="button" aria-label="OK">OK</button>
    <button class="g sm home" type="button" aria-label="Home" title="Back to the studio">⌂</button><button class="g sm back" type="button" aria-label="Back" title="Back">↩</button><button class="g sm menu" type="button" aria-label="Menu" title="⋯">≡</button>`;
  document.body.appendChild(pad);
  const ring = document.createElement('div'); ring.className = 'sp-focus'; ring.hidden = true; document.body.appendChild(ring);
  const canvas = ctx.renderer.domElement, ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let pov = null;   // { kind, eye, yaw, pitch, before, drag }
  // in first person the camera is fixed: nothing cuts away from it (the show's own cuts, the tour, a card), only
  // BACK / HOME on the remote leave it
  let povLeaving = false;
  { const go0 = director.go, auto0 = director.setAuto;
    director.go = (name, o) => (pov && name !== 'pov' && !povLeaving ? undefined : go0(name, o));
    director.setAuto = on => (pov && on ? undefined : auto0(on)); }
  function povEye(kind) {
    if (kind === 'dj') {
      const g = m.booth.gear.group; g.updateMatrixWorld(true);
      return { eye: g.localToWorld(new THREE.Vector3(0, 0.64, -0.74)), look: g.localToWorld(new THREE.Vector3(0, -0.06, 0.32)) };
    }
    const p = ctx.studio.piano; p.updateMatrixWorld(true);
    return { eye: p.localToWorld(new THREE.Vector3(0, 1.24, 0.72)), look: p.localToWorld(new THREE.Vector3(0, 0.84, -0.2)) };
  }
  // OVERHEAD: a 4K camera straight above the DJ booth, the whole console seen from the top (the DJ's side at the
  // bottom of the picture); fixed, it follows the booth when it rides up or down
  function overhead() {
    const g = m.booth.gear.group; g.updateMatrixWorld(true);
    VIEWS.djTop = { label: 'Overhead', long: '4K · DJ booth · overhead', pos: g.localToWorld(new THREE.Vector3(0, 1.9, -0.06)).toArray(), target: g.localToWorld(new THREE.Vector3(0, 0, 0.02)).toArray(), fov: 46, drift: 0, tally: 0 };
    m.releaseCameras?.(); director.setAuto(false); director.go('djTop', { instant: true }); topAt = g;
  }
  let topAt = null;
  function enterPov(kind) {
    try { enterPov_(kind); } catch (e) { console.error('first person:', e); }
  }
  function enterPov_(kind) {
    if (pov) exitPov();
    const { eye, look } = povEye(kind), d = look.clone().sub(eye).normalize();
    pov = { kind, eye, yaw: Math.atan2(d.x, d.z), pitch: Math.asin(d.y), before: director.current, drag: null };
    pov.yaw0 = pov.yaw; pov.pitch0 = pov.pitch;
    VIEWS.pov = { label: kind === 'dj' ? 'DJ' : 'Pianist', long: kind === 'dj' ? '4K · First person · at the DJ console' : '4K · First person · at the grand', pos: eye.toArray(), target: look.toArray(), fov: kind === 'dj' ? 62 : 58, drift: 0, tally: 0, cam: kind === 'dj' ? 'CAM 4K DJ' : 'CAM 4K PIANIST', free: true, melbourne: kind === 'dj' ? 'pov' : undefined };
    director.setAuto(false); director.go('pov', { instant: true }); ctx.controls.enabled = false;
    povUi.hidden = false; pad.hidden = false; document.body.classList.add('sp-pov-on'); m.setAuto(false);
    focusNote = 60; focusObj = kind === 'dj' ? targets().find(o => o.userData.ctl.act === 'play' && o.userData.ctl.deck === 1) || targets()[0] : null;
    povUi.querySelector('p').textContent = kind === 'dj' ? 'Drag the picture to look round · arrows: from control to control · OK presses (held with an arrow: moves a fader, a jog) · or tap them' : 'Drag the picture to look round · arrows: from key to key (up/down an octave) · OK plays · or tap the keys';
    closeMenus(); dock.classList.remove('more-open');
  }
  function exitPov() {
    if (!pov) return; const back = pov.before; pov = null; povUi.hidden = true; pad.hidden = true; stopMove(); okHit = null; document.body.classList.remove('sp-pov-on'); ctx.controls.enabled = true;
    povLeaving = true; director.go(back && back !== 'pov' ? back : (active === 'dj' ? 'mDJ2' : 'vP2'), { instant: true }); povLeaving = false;
  }
  // the remote, as on a TV: the arrows move the focus (a glass ring) from control to control (at the console: PLAY,
  // CUE, jogs, faders, crossfader, knobs, by where they are on screen; at the grand: a semitone left and right, an
  // octave up and down), OK presses the one in focus and, held with an arrow, drags it; keyboard arrows and Enter too
  let crossX = innerWidth / 2, crossY = innerHeight / 2, okHit = null, moveDir = null, moveTimer = 0, lastNav = 0, focusObj = null, focusNote = 60;
  const placeCross = () => {};
  const targets = () => { const t = []; m.booth.gear.group.traverse(o => { if (o.userData.ctl) t.push(o); }); return t; };
  const screenOf = (v3) => { const q = v3.clone().project(ctx.camera), r = canvas.getBoundingClientRect(); return { x: r.left + (q.x + 1) / 2 * r.width, y: r.top + (1 - q.y) / 2 * r.height, front: q.z < 1 }; };
  const focusPoint = () => {
    if (pov?.kind === 'piano') return ctx.studio.piano.userData.keyboard.keyWorld(focusNote);
    if (pov && !focusObj) { const t = targets(); focusObj = t.find(o => o.userData.ctl.act === 'play' && o.userData.ctl.deck === 1) || t[0] || null; }
    return focusObj?.getWorldPosition(new THREE.Vector3());
  };
  function navigate(dx, dy) {
    if (pov.kind === 'piano') { focusNote = Math.max(21, Math.min(108, focusNote + (dx ? (ctx.studio.piano.matrixWorld.determinant() < 0 ? -dx : dx) : -dy * 12))); return; }
    const all = targets(), here = screenOf(focusPoint() || new THREE.Vector3());
    let best = null, bestScore = Infinity;
    for (const o of all) {
      if (o === focusObj) continue;
      const p = screenOf(o.getWorldPosition(new THREE.Vector3())), vx = p.x - here.x, vy = p.y - here.y, len = Math.hypot(vx, vy) || 1, cos = (vx * dx + vy * dy) / len;
      if (cos < 0.35) continue;
      const score = len * (1 + 2.5 * (1 - cos)); if (score < bestScore) { bestScore = score; best = o; }
    }
    if (best) focusObj = best;
  }
  function stepCross() {
    if (!pov || !moveDir) return;
    const [dx, dy] = moveDir;
    if (okHit?.ctl) { act(okHit, 'move', dx * 7, dy * 7); return; }
    if (performance.now() - lastNav < 170) return; lastNav = performance.now(); navigate(dx, dy);
  }
  const startMove = d => { moveDir = d; lastNav = 0; stepCross(); clearInterval(moveTimer); moveTimer = setInterval(stepCross, 16); };
  const stopMove = () => { moveDir = null; clearInterval(moveTimer); };
  const okDown = () => { if (!pov) return; okHit = pov.kind === 'piano' ? { note: focusNote } : focusObj ? { ctl: focusObj.userData.ctl } : null; if (okHit) act(okHit, 'down'); pad.querySelector('.ok').classList.add('on'); };
  const okUp = () => { if (okHit) act(okHit, 'up'); okHit = null; pad.querySelector('.ok').classList.remove('on'); };
  // the ring follows its control on screen
  (function ringLoop() {
    requestAnimationFrame(ringLoop);
    if (!pov) { ring.hidden = true; return; }
    const p = focusPoint(); if (!p) { ring.hidden = true; return; }
    const s2 = screenOf(p); ring.hidden = !s2.front; ring.style.left = s2.x + 'px'; ring.style.top = s2.y + 'px';
  })();
  pad.addEventListener('pointerdown', e => {
    const b = e.target.closest('button'); if (!b) return; e.preventDefault(); b.setPointerCapture?.(e.pointerId);
    if (b.dataset.d) startMove(b.dataset.d.split(',').map(Number));
    else if (b.classList.contains('ok')) okDown();
  });
  pad.addEventListener('pointerup', e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.d) stopMove(); else if (b.classList.contains('ok')) okUp(); });
  pad.addEventListener('pointercancel', () => { stopMove(); okUp(); });
  pad.querySelector('.back').addEventListener('click', exitPov);
  pad.querySelector('.home').addEventListener('click', () => { if (!pov) return; pov.before = active === 'dj' ? (m.env === 'djroom' ? 'mDJ2' : 'studio') : active === 'piano' ? 'vP1' : 'studio'; exitPov(); });
  pad.querySelector('.menu').addEventListener('click', () => more.click());
  addEventListener('keydown', e => {
    if (!pov) return;
    if (!e.metaKey && !e.ctrlKey) e.stopImmediatePropagation();
    const d = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
    if (d) { e.preventDefault(); if (!moveDir) startMove(d); } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!okHit) okDown(); } else if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); exitPov(); }
  }, true);
  addEventListener('keyup', e => { if (!pov) return; if (e.key.startsWith('Arrow')) stopMove(); else if (e.key === 'Enter' || e.key === ' ') okUp(); }, true);
  const aim = () => { const c = Math.cos(pov.pitch); ctx.controls.target.copy(pov.eye).add(new THREE.Vector3(Math.sin(pov.yaw) * c, Math.sin(pov.pitch), Math.cos(pov.yaw) * c)); ctx.camera.position.copy(pov.eye); ctx.camera.lookAt(ctx.controls.target); VIEWS.pov.target = ctx.controls.target.toArray(); };
  const hit = e => hitAt(e.clientX, e.clientY);
  function hitAt(x, y) {
    const r = canvas.getBoundingClientRect(); ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, ctx.camera);
    const root = pov.kind === 'dj' ? m.booth.gear.group : ctx.studio.piano;
    for (const h of ray.intersectObject(root, true)) {
      if (pov.kind === 'piano' && h.object.isInstancedMesh) { const note = ctx.studio.piano.userData.keyboard.noteAt(h.object, h.instanceId); if (note) return { note }; }
      for (let o = h.object; o; o = o.parent) if (o.userData.ctl) return { ctl: o.userData.ctl, point: h.point };
    }
    return null;
  }
  // the decks: deck 2 and 3 (index 1, 2) are the set's; the deck that plays now is the set's current one
  const deckOn = () => (dj?.el === track ? dj.deck : -1);
  const chGain = ch => { const mx = m.booth.gear.mix, s = m.booth.gear.strips[ch]?.value; const side = ch < 2 ? 1 - mx.xfader : mx.xfader; return (s?.fader ?? 0.85) * Math.min(1, side * 2); };
  const applyVolume = () => { const d = deckOn(); if (d >= 0) track.volume = Math.max(0, Math.min(1, chGain(d))); };
  function act(h, phase, dx = 0, dy = 0) {
    if (h.note) { const kb = ctx.studio.piano.userData.keyboard; if (phase === 'down') { ctx.sound?.noteOn?.(h.note, 0.8); kb.press(h.note, 1); } else if (phase === 'up') { ctx.sound?.noteOff?.(h.note); kb.press(h.note, 0); } return; }
    const c = h.ctl, gear = m.booth.gear;
    if (c.act === 'play' && phase === 'up') {
      if (c.deck === deckOn()) pauseDj();
      else { const pool = djGenre ? DJ_TRACKS.filter(s => genresOf(s).includes(djGenre)) : DJ_TRACKS; if (dj && !dj.done) dj.deck = c.deck === 1 ? 2 : 1; playTrackNow(pick(pool, 1)[0]); }
    } else if (c.act === 'cue' && phase === 'up' && c.deck === deckOn()) { track.currentTime = 0; if (!dj.paused) pauseDj(); m.setDeck(c.deck + 1, { state: 'pause', position: 0 }); }
    else if (c.act === 'jog' && phase === 'move' && c.deck === deckOn()) { track.currentTime = Math.max(0, track.currentTime + dx * 0.02); m.setDeck(c.deck + 1, { position: track.currentTime }); }
    else if (c.act === 'fader' && phase === 'move') { const ch = gear.strips.map(s => ({ ...s.value })); ch[c.ch].fader = Math.max(0, Math.min(1, ch[c.ch].fader - dy * 0.006)); gear.setMixer({ ch }); applyVolume(); }
    else if (c.act === 'xfader' && phase === 'move') { gear.setMixer({ xfader: Math.max(0, Math.min(1, gear.mix.xfader + dx * 0.004)) }); applyVolume(); }
    else if (c.act === 'knob' && phase === 'move') { const ch = gear.strips.map(s => ({ ...s.value })); ch[c.ch][c.name] = Math.max(0, Math.min(1, ch[c.ch][c.name] - dy * 0.006)); gear.setMixer({ ch }); }
  }
  canvas.addEventListener('pointerdown', e => {
    if (!pov) return; e.stopImmediatePropagation(); canvas.setPointerCapture?.(e.pointerId);
    const h = hit(e); pov.drag = { x: e.clientX, y: e.clientY, h, moved: 0 };
    if (h) act(h, 'down');
  }, true);
  canvas.addEventListener('pointermove', e => {
    if (!pov?.drag) return; e.stopImmediatePropagation();
    const dx = e.clientX - pov.drag.x, dy = e.clientY - pov.drag.y; pov.drag.x = e.clientX; pov.drag.y = e.clientY; pov.drag.moved += Math.abs(dx) + Math.abs(dy);
    if (pov.drag.h?.ctl) act(pov.drag.h, 'move', dx, dy);   // on a control: the control moves
    else if (!pov.drag.h) {                                  // on the picture: the head turns (the eyes stay where they are)
      pov.yaw = Math.max(pov.yaw0 - 0.8, Math.min(pov.yaw0 + 0.8, pov.yaw + dx * 0.004 * (ctx.camera.matrixWorld.determinant() < 0 ? -1 : 1)));
      pov.pitch = Math.max(Math.max(-1.35, pov.pitch0 - 0.6), Math.min(Math.min(0.25, pov.pitch0 + 0.7), pov.pitch + dy * 0.004));
    }
  }, true);
  // the cross follows the pointer over the picture (it is the pointer here)
  const cross = povUi.querySelector('i');
  canvas.addEventListener('pointermove', e => { if (!pov) return; crossX = e.clientX; crossY = e.clientY; placeCross(); });
  canvas.addEventListener('pointerup', e => { if (!pov?.drag) return; e.stopImmediatePropagation(); if (pov.drag.h) act(pov.drag.h, 'up'); pov.drag = null; }, true);
  canvas.addEventListener('click', e => { if (pov) e.stopImmediatePropagation(); }, true);

  /* ----- ⋯ at the Piano Stage and in the DJ Room: the space's own controls ----- */
  // each: a button, or a menu of buttons opening above the bar (one at a time, like the studio's Camera and Light)
  const CONTROLS = {
    piano: [
      [() => (piano || pianoPlaying() ? 'Finish show' : 'Simulate show'), () => (piano || pianoPlaying() ? finish('piano') : simulate('piano'))],
      ['Camera', [['P1 Main front', () => v.pickCamera('P1')], ['P2 Keyboard', () => v.pickCamera('P2')], ['P3 Side', () => v.pickCamera('P3')], ['P4 Lift reveal', () => v.pickCamera('P4')], ['P5 Tracking', () => v.pickCamera('P5')], ['4K high-speed', () => v.pickCamera('P6')], ['4K pianist · first person', () => enterPov('piano')]]],
      ['Light', [['Warm piano', () => v.setMode('WARM PIANO')], ['Cinematic', () => v.setMode('CINEMATIC')], ['Performance', () => v.setMode('PERFORMANCE')], ['Studio look', () => v.setLook(false)], ['Concert look', () => v.setLook(true)]]],
      ['Effects', [['Lift up', () => v.command('up')], ['Lift down', () => v.command('down')], ['Cinematic rise', () => v.command('cinematic')]]],
      ['Video', [['Intermission', () => pianoIntermission()], ['Stay tuned', () => card('psBetween', { manual: true })], ['Thank you', () => card('psEnd', { manual: true })]]],
      ['Jingles', [['Between songs', () => v.showCommand('between')], ['Closing', () => v.showCommand('closing')]]],
      ['Songs', () => openLibrary('piano')],
      ['♪ Piano', () => document.getElementById('musicBtn')?.click()],
      ['Programme', () => openProgramme()], ['Info', () => openInfo()],
    ],
    dj: [
      [() => (dj && !dj.done ? 'Finish show' : 'Simulate show'), () => (dj && !dj.done ? finish('dj') : simulate('dj'))],
      ['Camera', [...['DJ1', 'DJ2', 'DJ3', 'DJ4', 'DJ5', 'DJ6'].map(k => [k, () => m.pickCamera(k)]), ['4K high-speed', () => m.pickCamera('HS')], ['4K DJ · first person', () => enterPov('dj')], ['4K overhead · the booth', () => overhead()]]],
      ['Light', [['Opening', 'OPENING'], ['Performance', 'PERFORMANCE'], ['Breakdown', 'BREAKDOWN'], ['Build-up', 'BUILD-UP'], ['Drop', 'DROP'], ['Closing', 'CLOSING']].map(([l, k]) => [l, () => m.setMode(k)])],
      ['Effects', [['Lasers on', () => m.lasers(true)], ['Lasers off', () => m.lasers(false)], ['Fog burst', () => m.fog(3)], ['Disco ball', () => m.disco(discoOn = !discoOn)], ['Strobe', () => m.strobe(m.report().strobe ? 0 : 1)]]],
      ['Video', [['Intermission', () => intermission()], ['Stay tuned', () => card('djBetween', { manual: true })], ['DJ transition', () => card('djTransition', { manual: true })], ['Friday closing', () => card('djEnd', { manual: true })]]],
      ['Jingles', [['DJ transition', () => playJingle('between')], ['Friday closing', () => playJingle('end')]]],
      ['Library', () => openLibrary('dj')],
      ['Genre', [['All genres', () => { djGenre = null; libGenre = 'All'; if (!dj || dj.done) simulate('dj'); }], ...GENRES.filter(g => DJ_TRACKS.some(s => genresOf(s).includes(g))).map(g => [g, () => { libGenre = g; setGenre(g); }])]],
      ['FX drops', FX.map(([id, l]) => [l, () => playFx(id)])],
      ['Next track', () => nextTrack()],
      ['♪ DJ booth', () => document.getElementById('musicBtn')?.click()],
      ['Programme', () => openProgramme()], ['Info', () => openInfo()],
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
  // a voice drop over the music, the track ducked under it
  function playFx(id) {
    fxEl.src = asset('assets/fx/' + id + '.mp3'); fxEl.currentTime = 0; fxEl.play().catch(() => {});
    if (!track.paused) { track.volume = 0.55; fxEl.onended = () => { track.volume = 1; }; }
  }
  // the set's genre: the next tracks come from it (now, if a set plays; otherwise the set starts with it)
  function setGenre(g) {
    djGenre = g;
    const pool = DJ_TRACKS.filter(s => genresOf(s).includes(g));
    if (!pool.length) return;
    if (dj && !dj.done) { const left = dj.steps.slice(dj.i); let k = 0; const songs = pick(pool, left.filter(x => x.track).length); for (const st of left) if (st.track) st.track = songs[k++] || st.track; }
    else simulate('dj');
  }
  function nextTrack() { if (dj?.el === track) { track.currentTime = Math.max(0, (track.duration || 1) - 0.2); } }
  function playJingle(which) { stopDj(); jingle.src = asset(JINGLE[which]); jingle.currentTime = 0; jingle.play().catch(() => {}); }
  let discoOn = false, djGenre = null;
  const pops = [], dynamic = [];   // (menu labels that follow the state: Simulate / Finish)
  // the tiles' icons, by what a control is called (line icons, as the space buttons)
  const P = d => `<svg class="ti" viewBox="0 0 48 48" aria-hidden="true">${d}</svg>`;
  const TILE_ICONS = [
    [/^(Simulate|Finish)/, P('<circle cx="24" cy="24" r="16"/><path d="M20 17l11 7-11 7z"/>')],
    [/^Camera/, P('<rect x="7" y="15" width="24" height="18" rx="3"/><path d="M31 21l10-5v16l-10-5"/>')],
    [/^Light/, P('<path d="M18 30a10 10 0 1 1 12 0v4H18z"/><path d="M19 39h10"/>')],
    [/^Effects/, P('<path d="M24 6l3 9 9 3-9 3-3 9-3-9-9-3 9-3z"/><path d="M37 30l1.5 4.5L43 36l-4.5 1.5L37 42l-1.5-4.5L31 36l4.5-1.5z"/>')],
    [/^Video/, P('<rect x="6" y="11" width="36" height="26" rx="3"/><path d="M21 19l9 5-9 5z"/>')],
    [/^Jingles/, P('<path d="M10 28V20h7l10-8v24l-10-8z"/><path d="M33 18a8 8 0 0 1 0 12M37 14a14 14 0 0 1 0 20"/>')],
    [/^(Songs|Library)/, P('<rect x="8" y="8" width="20" height="32" rx="2"/><rect x="31" y="8" width="9" height="32" rx="2"/><path d="M13 15h10M13 21h10"/>')],
    [/^Genre/, P('<path d="M8 12h32M14 24h20M20 36h8"/>')],
    [/^FX/, P('<path d="M16 16v16M10 24h12"/><path d="M28 16l10 16M38 16L28 32"/>')],
    [/^Next/, P('<path d="M12 14l14 10-14 10z"/><path d="M34 14v20"/>')],
    [/^♪|Music/, P('<path d="M18 34V12l20-4v22"/><circle cx="14" cy="34" r="4"/><circle cx="34" cy="30" r="4"/>')],
    [/^Programme|dates|schedule/i, P('<rect x="7" y="10" width="34" height="30" rx="3"/><path d="M7 18h34M15 6v8M33 6v8"/>')],
    [/^Info/, P('<circle cx="24" cy="24" r="16"/><path d="M24 22v10M24 16v.5"/>')],
    [/on air|Simulate on air/i, P('<circle cx="24" cy="24" r="5"/><path d="M14 14a14 14 0 0 0 0 20M34 14a14 14 0 0 1 0 20"/>')],
    [/Auto camera/i, P('<path d="M10 24a14 14 0 0 1 24-10M38 24a14 14 0 0 1-24 10"/><path d="M34 8v6h-6M14 40v-6h6"/>')],
  ];
  const tileIcon = text => TILE_ICONS.find(([re]) => re.test(text))?.[1] || '';
  // a tile: its icon, then its name in a span (so a name that changes, Simulate / Finish, keeps the icon)
  const setTile = (b, text) => { b.innerHTML = tileIcon(text) + '<span class="tl"></span>'; b.querySelector('.tl').textContent = text; };
  const closeMenus = () => { pops.forEach(p => { p.hidden = true; }); dock.querySelectorAll('.sp-row [aria-expanded]').forEach(b => b.setAttribute('aria-expanded', 'false')); };
  for (const [space, items] of Object.entries(CONTROLS)) {
    const row = document.createElement('div'); row.className = 'row ctrl sp-row'; row.dataset.for = space;
    for (const [label, what] of items) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'b' + (Array.isArray(what) ? ' mbtn' : '');
      setTile(b, typeof label === 'function' ? label() : label);
      if (typeof label === 'function') dynamic.push([b, label]);
      if (Array.isArray(what)) {
        const pop = document.createElement('div'); pop.className = 'pop'; pop.hidden = true; pop.setAttribute('role', 'group'); pop.setAttribute('aria-label', label);
        for (const [l, fn] of what) { const x = document.createElement('button'); x.type = 'button'; x.className = 'b'; x.textContent = l; x.addEventListener('click', () => { if (label === 'Camera') { wallHold = false; if (!/first person/.test(l)) exitPov(); } fn(); closeMenus(); }); pop.appendChild(x); }
        dock.insertBefore(pop, ctrl); pops.push(pop);
        b.setAttribute('aria-expanded', 'false'); b.insertAdjacentHTML('beforeend', '<i class="chev" aria-hidden="true"></i>');
        b.addEventListener('click', () => { const open = pop.hidden; closeMenus(); pop.hidden = !open; b.setAttribute('aria-expanded', String(open)); });
      } else b.addEventListener('click', () => { closeMenus(); what(); });
      row.appendChild(b);
    }
    dock.insertBefore(row, ctrl.nextSibling);
  }
  more.addEventListener('click', closeMenus);
  // the studio's own row (Simulate on air, Camera, Light, Auto camera, Music, Schedule) as tiles too, with Programme and Info
  for (const b of ctrl.querySelectorAll(':scope > .b')) { if (!b.querySelector('svg.ti')) b.insertAdjacentHTML('afterbegin', tileIcon(b.textContent.trim())); }
  for (const [label, fn] of [['Programme', openProgramme], ['Info', openInfo]]) { const b = document.createElement('button'); b.type = 'button'; b.className = 'b'; setTile(b, label); b.addEventListener('click', () => { closeMenus(); fn(); }); ctrl.appendChild(b); }

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
      if (active === 'piano' && pianoPlaying()) return pausePiano({ hold: 'psBack' });
      stopDj();
      if (m.env === 'djroom') m.setEnv('studio', { transition: false });
      startPiano();
    },
    dj() {
      if (active === 'dj' && dj && !dj.done) return pauseDj({ hold: 'djBack' });
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
    afterShow.stop(); cctv.stop(); ended = null; exitPov();
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
    if (ui.music) setTile(ui.music, l.music);
    if (ui.live) setTile(ui.live, l.live);
  }
  relabel();

  // the controls out of the picture while a show plays and the pointer rests; back on any move, touch or key
  let lastInput = performance.now();
  const wake = () => { lastInput = performance.now(); if (document.body.classList.contains('sp-idle')) document.body.classList.remove('sp-idle'); };
  for (const ev of ['pointermove', 'pointerdown', 'keydown', 'touchstart', 'wheel']) addEventListener(ev, wake, { passive: true, capture: true });
  function idleCheck() {
    const showing = !gfx.hidden || afterShow.on || cctv.on || ctx.air?.isOpen;
    const panelOpen = document.body.classList.contains('panel-open') || dock.classList.contains('more-open') || !!pov;
    document.body.classList.toggle('sp-idle', showing && !panelOpen && performance.now() - lastInput > 3000);
  }

  // the shows move on, and the buttons say what plays (the director's panels and the Broadcast bridge can change it too)
  function show() {
    pianoNext(); djNext(); afterShow.update(); cctv.update(); relabel(); airGfx(); idleCheck();
    if (!loungeFurnished && (ctx.camera.position.z < -6 || ['backstage', 'securityLounge'].includes(director.current))) furnishLounge();
    for (const f of placeAnim) f(performance.now() / 1000);
    for (const [b, f] of dynamic) { const t = f(), tl = b.querySelector('.tl'); if (tl.textContent !== t) { b.innerHTML = tileIcon(t) + '<span class="tl"></span>'; b.querySelector('.tl').textContent = t; } }
    // the cards, by what the shows are doing
    const P = v.show;
    if (dj?.hold || piano?.hold) { /* a pause card holds the wall */ }
    else if (active === 'piano' && P.state === 'BETWEEN') card('psBetween');
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
    if (onWall && !cardEl.ended && held !== cardEl.paused && !dj?.hold && !piano?.hold) { if (held) cardEl.pause(); else cardEl.play().catch(() => {}); }
    // the building only while the camera is out there (its lights and wet street cost nothing in the studio then)
    if (street && outside() !== shownOut) {
      shownOut = outside(); street.then(st => { st.group.visible = shownOut; if (st.sky) { studioBg ??= ctx.scene.background; ctx.scene.background = shownOut ? st.sky : studioBg; ctx.scene.backgroundIntensity = shownOut ? 0.55 : 1; } });
      // the studio's haze is the studio's: out on the street the night is clear enough to see the building
      if (ctx.scene.fog) { studioFog ??= ctx.scene.fog.density; ctx.scene.fog.density = shownOut ? 0.004 : studioFog; }
    }
    // a show that has run to its end hands over to AFTERSHOW
    const over = (active === 'piano' && v.show.state === 'ENDED' && !piano) || (active === 'dj' && dj?.over);
    if (over && !afterShow.on) { ended ??= performance.now(); if (performance.now() - ended > 6000) afterShow.start(); }
    // the hanging logo is up for the whole show, as in the studio's simulation, and comes down when it ends
    const wantLogo = onWall || (active === 'piano' && !!piano && v.show.state !== 'ENDED') || (active === 'dj' && !!dj && !dj.over && !dj.done);
    if (wantLogo !== logoUp) { logoUp = wantLogo; ctx.studio.liftLogo(wantLogo); }
    // at the grand in first person the stage's beams are off (the camera stands in the spot's light)
    if (v.stage?.rig) v.stage.rig.quiet = pov?.kind === 'piano';
    for (const k of ['studio', 'piano', 'dj']) btn(k).setAttribute('aria-pressed', String(k === active));
    for (const b of edge.querySelectorAll('[data-view-edge]')) b.setAttribute('aria-pressed', String(b.dataset.viewEdge === 'after' ? afterShow.on : b.dataset.viewEdge === 'security' ? cctv.on : director.current === b.dataset.viewEdge));
    const p = v.show;
    const pianoLabel = piano?.hold === 'psInter' ? 'Intermission · tap to play' : piano?.soon ? (piano.held ? 'Paused · tap to play' : 'Starting soon') : p.state === 'SONG' ? '♪ ' + (p.song?.title || '') : p.state === 'BETWEEN' ? 'Between songs' : p.state === 'CLOSING' ? 'Closing' : p.state === 'ENDED' ? 'Play again' : 'Piano Sessions';
    const djLabel = !dj || dj.done ? 'Play again' : dj.hold === 'djInter' ? 'Intermission · tap to play' : dj.paused ? 'Paused · tap to play' : dj.soon ? 'Starting soon' : !dj.el ? 'Opening' : dj.el === track ? '♪ ' + (dj.steps[dj.i - 1]?.track?.title || '') : dj.i >= dj.steps.length ? 'Closing' : 'Next track';
    btn('studio').querySelector('small').textContent = ctx.air?.isOpen ? 'On air · tap to end' : 'Simulate on air';
    btn('piano').querySelector('small').textContent = active !== 'piano' ? 'Piano show' : p.paused ? 'Paused · tap to play' : pianoLabel;
    btn('dj').querySelector('small').textContent = active !== 'dj' ? 'DJ show' : (djGenre && dj?.el === track ? djGenre + ' · ' : '') + djLabel;
    // the cover of what plays, in place of the icon
    const djSong = dj?.el === track ? dj.steps[dj.i - 1]?.track : null, pianoSong = v.show.state === 'SONG' ? v.show.song : null;
    for (const [k, song] of [['dj', active === 'dj' && djSong], ['piano', active === 'piano' && pianoSong]]) {
      const img = btn(k).querySelector('.art'), svg = btn(k).querySelector('svg'), src = song ? cover(song) : '';
      if (img.dataset.src !== src) { img.dataset.src = src; if (src) img.src = src; img.hidden = !src; svg.style.display = src ? 'none' : ''; }
    }
  }
  // the fixed cameras (the overhead, first person) are held every frame: the labels above run only a few times a
  // second, and between those the director's drift and the orbit controls moved the picture (it shook)
  const top = new THREE.Vector3(0, 1.9, -0.06), down = new THREE.Vector3(0, 0, 0.02), ahead = new THREE.Vector3();
  function hold() {
    if (topAt && director.current === 'djTop' && !director.flying) {   // the overhead camera stays over the booth
      ctx.camera.position.copy(topAt.localToWorld(top.set(0, 1.9, -0.06))); ctx.controls.target.copy(topAt.localToWorld(down.set(0, 0, 0.02))); ctx.camera.lookAt(ctx.controls.target);
    }
    if (pov && director.current === 'pov' && !director.flying) {
      const c = Math.cos(pov.pitch); ctx.camera.position.copy(pov.eye);
      ctx.controls.target.copy(pov.eye).add(ahead.set(Math.sin(pov.yaw) * c, Math.sin(pov.pitch), Math.cos(pov.yaw) * c)); ctx.camera.lookAt(ctx.controls.target);
    }
  }
  show();
  return { update: show, hold, get active() { return active; }, get piano() { return piano; }, get dj() { return dj; }, afterShow, place };
}
