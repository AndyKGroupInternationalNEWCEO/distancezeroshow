// Melbourne Underground DJ Room: the numbers it is built from, in the studio's own coordinates (metres, y up, the
// studio cameras at +z, Melbourne on the right at +x). No three.js here, so tests and drawings read the same values.
//
// Two levels. Upper: the main studio; on the Melbourne side, where the studio's small music station stood (set.js:
// (5.4, 0, 0.1), turned −0.95; it steps aside on the two-level page), an opening in the floor: the DJ lift's platform
// and glass round it. Lower: the club under it, LED walls all round, moving heads, lasers, haze and smoke. THE one DJ
// booth stands on the DJ lift's platform and goes down into the club and back up with it (DJ_LIFT). The Vienna Piano
// Stage and its lift are not touched.

export const BOOTH = { x: 5.4, z: 0.1, rotY: -0.95 };   // the studio's music station, as set.js places it

// the frame of the Melbourne side: along = the studio booth's length, across = + towards the studio cameras
const AL = [Math.cos(BOOTH.rotY), -Math.sin(BOOTH.rotY)], AC = [Math.sin(BOOTH.rotY), Math.cos(BOOTH.rotY)];
export const at = (along, across) => [+(BOOTH.x + along * AL[0] + across * AC[0]).toFixed(3), +(BOOTH.z + along * AL[1] + across * AC[1]).toFixed(3)];
export const xyz = (along, across, y) => { const [x, z] = at(along, across); return [x, y, z]; };
// studio x, z → the Melbourne frame's [along, across]
export const toFrame = (x, z) => { const dx = x - BOOTH.x, dz = z - BOOTH.z; return [dx * AL[0] + dz * AL[1], dx * AC[0] + dz * AC[1]]; };

// the glass in the studio floor: panes on a steel grid, in front of the studio booth (which stays on solid floor)
export const GLASS = {
  along: 0, across: 2.25,   // its centre
  w: 6.4, d: 3.6,           // along × across
  pane: 0.8,                // grid spacing
  beam: 0.06,               // steel T-section width
  slab: 0.4,                // the studio floor's thickness
};
// the club under the studio, in the same frame
export const ROOM = {
  along: 0, across: 1.4,    // its centre
  w: 13.0, d: 10.0,         // along × across
  floor: -5.2,              // 4.8 m clear: room for the truss, the lasers and the LED walls' height
  ceiling: -0.4,            // the underside of the studio floor's slab
};
// the club's booth: under the glass, facing the room's front (+across), the DJ behind it
export const CLUB_BOOTH = {
  along: 0, across: 2.0,    // its centre
  riser: 0.3,               // the DJ stands on a riser
  w: 3.4, d: 0.9, top: 1.02, // the console: width, depth, height of the work top above the riser
};
// THE DJ LIFT: the one DJ booth (booth.js) stands on its own rectangular platform. Up, the platform's top is flush
// with the studio floor and the booth is in the studio; down, it stands on the club's floor and the same booth is the
// club's. Its own mechanism (four guide rails, two three-stage telescopic rams from a pit under the club floor), not
// the Vienna piano lift's. h: how far the platform has gone down (0 … travel)
export const DJ_LIFT = {
  along: 0, across: 1.45,   // the platform's centre: under the booth's riser (booth.js: riser centred 0.55 behind the console)
  w: 5.0, d: 2.8,           // along × across (the riser is 4.8 × 2.6)
  thick: 0.14,
  rest: 0.02,               // down: the top 2 cm proud of the club floor (a stage plate, no pit in the club floor)
  vmax: 0.36, accel: 0.16,  // a full move about 17 s
  rail: 0.1,                // the guide rails' section, just outside the platform's corners
};
DJ_LIFT.travel = -ROOM.floor - DJ_LIFT.rest;
// the platform's top (y) for a depth h
export const liftTop = h => -h;
// the opening in the studio floor and the club's ceiling: the glass and the platform together, as a polygon
// [along, across] (anticlockwise seen from above): the platform reaches 0.4 m behind the glass
export const OPENING = (() => {
  const g = { a0: GLASS.along - GLASS.w / 2, a1: GLASS.along + GLASS.w / 2, c0: GLASS.across - GLASS.d / 2, c1: GLASS.across + GLASS.d / 2 };
  const p = { a0: DJ_LIFT.along - DJ_LIFT.w / 2, a1: DJ_LIFT.along + DJ_LIFT.w / 2, c0: DJ_LIFT.across - DJ_LIFT.d / 2 };
  return [[g.a0, g.c1], [g.a1, g.c1], [g.a1, g.c0], [p.a1, g.c0], [p.a1, p.c0], [p.a0, p.c0], [p.a0, g.c0], [g.a0, g.c0]];
})();
// the studio's on-air beacon on the Melbourne side, moved off the opening to just in front of it
export const BEACON = xyz(-0.89, 4.35, 0);
// the platform's footprint [along0, along1, across0, across1]
export const LIFT_RECT = [DJ_LIFT.along - DJ_LIFT.w / 2, DJ_LIFT.along + DJ_LIFT.w / 2, DJ_LIFT.across - DJ_LIFT.d / 2, DJ_LIFT.across + DJ_LIFT.d / 2];

// the DJ's two near-field monitors on stands either side of the console, turned in to the DJ's head
export const MONITORS = { along: 2.05, across: -0.2, height: 1.35, toe: 0.5 };

// the cameras DJ1–DJ6 (the tally reads CAM DJ1…), separate from the Piano Stage's P1–P5. Positions and targets in
// studio metres (y: height above the studio floor; the club's floor is at ROOM.floor)
const F = ROOM.floor, B = CLUB_BOOTH;
export const CAMS = {
  DJ1: { name: 'CAM DJ1', label: 'Master wide', long: 'DJ room · master wide', pos: xyz(-4.9, 6.0, F + 3.4), target: xyz(0.3, 0.4, F + 1.5), fov: 62, drift: 0.22 },
  DJ2: { name: 'CAM DJ2', label: 'Front booth', long: 'DJ room · front booth', pos: xyz(0.15, B.across + 3.4, F + 1.75), target: xyz(0, B.across, F + B.riser + 1.25), fov: 40, drift: 0.12 },
  // (0.7 m further out than first built: the lift's front guide rail then stands beside the console, not across it)
  DJ3: { name: 'CAM DJ3', label: 'Side cinematic', long: 'DJ room · side cinematic', pos: xyz(4.4, B.across + 2.3, F + 1.9), target: xyz(-0.4, B.across - 0.3, F + B.riser + 1.15), fov: 36, drift: 0.16 },
  DJ4: { name: 'CAM DJ4', label: 'Equipment', long: 'DJ room · equipment close-up', pos: xyz(-0.9, B.across + 0.95, F + B.riser + 1.62), target: xyz(0.15, B.across - 0.05, F + B.riser + B.top), fov: 34, drift: 0.04 },
  // overhead: on the shaft's front edge, clear of the platform's path, looking steeply down at the console
  DJ5: { name: 'CAM DJ5', label: 'Overhead', long: 'DJ room · overhead', pos: xyz(0.05, B.across + 1.25, F + 4.1), target: xyz(0, B.across - 0.2, F + B.riser + 0.8), fov: 50, drift: 0.04 },
  DJ6: { name: 'CAM DJ6', label: 'Glass floor', long: 'Upper studio · through the glass floor', pos: xyz(-1.0, GLASS.across + 3.6, 3.1), target: xyz(0, GLASS.across - 0.4, F + 1.2), fov: 50, drift: 0.12 },
};
// the DJ transition's own cameras: they follow the moving platform (index.js aims them at the booth every frame)
export const LIFT_CAMS = {
  top: { name: 'CAM DJ6', label: 'Lift · studio', long: 'DJ lift · from the studio', pos: xyz(-3.4, 6.2, 2.4), look: [0, B.across - 0.2], fov: 44 },
  low: { name: 'CAM DJ1', label: 'Lift · club', long: 'DJ lift · from the club floor', pos: xyz(3.9, 5.6, F + 0.75), look: [0, B.across], fov: 46 },
};

// where a camera may be down here (the studio's director keeps every other camera above the studio floor): inside the
// club, clear of its walls, floor and ceiling; or in the glass's column on the way down (the transition)
const WALL_GAP = 0.35;
export function inClub(p) {
  const [al, ac] = toFrame(p.x, p.z);
  return p.y < ROOM.ceiling && Math.abs(al - ROOM.along) < ROOM.w / 2 && Math.abs(ac - ROOM.across) < ROOM.d / 2;
}
export function inShaft(p) {
  const [al, ac] = toFrame(p.x, p.z);
  return p.y < 0.35 && p.y >= ROOM.ceiling && Math.abs(al - GLASS.along) < GLASS.w / 2 && Math.abs(ac - GLASS.across) < GLASS.d / 2;
}
// a point (camera or target) kept inside the club, in place
export function keepInClub(p, gap = WALL_GAP) {
  const [al, ac] = toFrame(p.x, p.z);
  const a = Math.max(ROOM.along - ROOM.w / 2 + gap, Math.min(ROOM.along + ROOM.w / 2 - gap, al));
  const c = Math.max(ROOM.across - ROOM.d / 2 + gap, Math.min(ROOM.across + ROOM.d / 2 - gap, ac));
  if (a !== al || c !== ac) { const [x, z] = at(a, c); p.x = x; p.z = z; }
  p.y = Math.max(ROOM.floor + 0.3, Math.min(ROOM.ceiling - 0.25, p.y));
}
