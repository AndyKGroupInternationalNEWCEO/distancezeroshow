// Melbourne Underground DJ Room: the numbers it is built from, in the studio's own coordinates (metres, y up, the
// studio cameras at +z, Melbourne on the right at +x). No three.js here, so tests and drawings read the same values.
//
// Two levels. Upper: the main studio, unchanged, except that on the Melbourne side, in front of the studio's own DJ
// booth (set.js: the music station at (5.4, 0, 0.1), turned −0.95), a section of the floor is glass. Lower: a club
// under it, with its own booth below the glass, LED walls all round, moving heads, lasers, haze and smoke. Nothing
// rises or descends: the room is architecture, the transition is a camera that travels from the studio through the
// glass into the club. The Vienna Piano Stage and its lift are not touched.

export const BOOTH = { x: 5.4, z: 0.1, rotY: -0.95 };   // the studio's music station, as set.js places it

// the frame of the Melbourne side: along = the studio booth's length, across = + towards the studio cameras
const AL = [Math.cos(BOOTH.rotY), -Math.sin(BOOTH.rotY)], AC = [Math.sin(BOOTH.rotY), Math.cos(BOOTH.rotY)];
export const at = (along, across) => [+(BOOTH.x + along * AL[0] + across * AC[0]).toFixed(3), +(BOOTH.z + along * AL[1] + across * AC[1]).toFixed(3)];
export const xyz = (along, across, y) => { const [x, z] = at(along, across); return [x, y, z]; };

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
// the DJ's two near-field monitors on stands either side of the console, turned in to the DJ's head
export const MONITORS = { along: 2.05, across: -0.2, height: 1.35, toe: 0.5 };

// the cameras DJ1–DJ6 (the tally reads CAM DJ1…), separate from the Piano Stage's P1–P5. Positions and targets in
// studio metres (y: height above the studio floor; the club's floor is at ROOM.floor)
const F = ROOM.floor, B = CLUB_BOOTH;
export const CAMS = {
  DJ1: { name: 'CAM DJ1', label: 'Master wide', long: 'DJ room · master wide', pos: xyz(-4.9, 6.0, F + 3.4), target: xyz(0.3, 0.4, F + 1.5), fov: 62, drift: 0.22 },
  DJ2: { name: 'CAM DJ2', label: 'Front booth', long: 'DJ room · front booth', pos: xyz(0.15, B.across + 3.4, F + 1.75), target: xyz(0, B.across, F + B.riser + 1.25), fov: 40, drift: 0.12 },
  DJ3: { name: 'CAM DJ3', label: 'Side cinematic', long: 'DJ room · side cinematic', pos: xyz(4.4, B.across + 1.6, F + 1.9), target: xyz(-0.4, B.across - 0.3, F + B.riser + 1.15), fov: 36, drift: 0.16 },
  DJ4: { name: 'CAM DJ4', label: 'Equipment', long: 'DJ room · equipment close-up', pos: xyz(-0.9, B.across + 0.95, F + B.riser + 1.62), target: xyz(0.15, B.across - 0.05, F + B.riser + B.top), fov: 34, drift: 0.04 },
  DJ5: { name: 'CAM DJ5', label: 'Overhead', long: 'DJ room · overhead', pos: xyz(0.05, B.across + 0.35, F + 4.4), target: xyz(0, B.across - 0.1, F + B.riser + 0.8), fov: 52, drift: 0.05 },
  DJ6: { name: 'CAM DJ6', label: 'Glass floor', long: 'Upper studio · through the glass floor', pos: xyz(-1.0, GLASS.across + 3.6, 3.1), target: xyz(0, GLASS.across - 0.4, F + 1.2), fov: 50, drift: 0.12 },
};
// the transition: from the upper studio, over the glass, through it and down into the club (camera keyframes, s)
export const DESCENT = [
  { t: 0, pos: xyz(-2.2, 7.5, 2.6), target: xyz(0, GLASS.across, 0) },
  { t: 3.5, pos: xyz(-0.6, GLASS.across + 1.4, 2.2), target: xyz(0, GLASS.across - 0.2, F + 1.0) },
  { t: 6.5, pos: xyz(0, GLASS.across + 0.4, -0.2), target: xyz(0, B.across, F + 1.2) },
  { t: 9.5, pos: xyz(0.1, B.across + 3.6, F + 2.2), target: xyz(0, B.across, F + B.riser + 1.2) },
];
