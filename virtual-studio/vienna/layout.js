// Vienna Piano Stage: the numbers the stage is built from, in the studio's own coordinates (metres, y up, the
// studio cameras at +z looking at the LED wall at -z, Vienna on the left at -x). No three.js here, so the drawings
// (drawings.mjs) and the tests read the same values the 3D stage uses.
//
// The stage is the studio's existing piano area: the grand stays exactly where set.js puts it, and a round lift
// platform let into the floor under it raises it. Measured from the set: the grand at (-5.3, 0, 0.3), turned
// π/2 − 0.38 and mirrored (keyboard towards the studio, open lid towards the cameras); the room a circle of
// radius 12.6 m about (0, 0, 1), 8.4 m high; the studio's lighting truss a ring of 5.5 m about (0, 6.9, -1.4).

export const ROOM = { R: 12.6, Z: 1, H: 8.4 };
export const PIANO = { x: -5.3, z: 0.3, rotY: Math.PI / 2 - 0.38, len: 2.74, width: 1.58 };   // as set.js places it

// the middle of grand and bench (the piano's origin is the front of its keyboard; the pair is centred 0.96 m
// behind it along the piano's length): the lift's centre
const CENTRE_BACK = 0.96;
export const STAGE = {
  x: +(PIANO.x - CENTRE_BACK * Math.sin(PIANO.rotY)).toFixed(3),
  z: +(PIANO.z - CENTRE_BACK * Math.cos(PIANO.rotY)).toFixed(3),
};

// the lift: a round platform flush with the studio floor when down (the grand then stands exactly where it always
// has), a scissor lift in a pit below it
export const LIFT = {
  r: 2.2,            // platform radius (4.4 m: the 2.74 m grand and its bench with a 25 cm margin all round)
  pit: 2.3,          // radius of the pit opening in the floor (10 cm running clearance)
  depth: 0.5,        // pit depth: the collapsed lift fits below the floor
  thick: 0.08,       // platform thickness
  travel: 3.5,       // m above the floor at the top
  vmax: 0.32,        // m/s
  accel: 0.18,       // m/s²
  stages: 3,         // scissor stages
  arm: 2.4,          // scissor arm length, pin to pin
  packs: 0.85,       // the two scissor packs, either side of the lift's centre
};

// platform top (and the grand's feet) above the studio floor, for a lift height h (0 … travel)
export const platformTop = h => h;

// a point given relative to the stage centre in the piano's own frame (along: + towards the keyboard and pianist;
// across: + towards the open lid, which faces the studio cameras), in studio x, z
const AL = [Math.sin(PIANO.rotY), Math.cos(PIANO.rotY)], AC = [-Math.cos(PIANO.rotY), Math.sin(PIANO.rotY)];
export const at = (along, across) => [+(STAGE.x + along * AL[0] + across * AC[0]).toFixed(3), +(STAGE.z + along * AL[1] + across * AC[1]).toFixed(3)];
const xyz = (along, across, y) => { const [x, z] = at(along, across); return [x, y, z]; };

// virtual cameras. `rise` is how much of the lift's height the camera rides up with (1 = on a rig that follows the
// platform, 0 = on the floor). Targets are given above the platform top and ride with it, or by `targetRise` of the
// lift's height. `drift`: metres of slow camera movement (a slow dolly and crane), so no shot is a still
export const CAMS = {
  P1: { name: 'CAM P1', label: 'Main front', long: 'Vienna · main front 4K', pos: xyz(-0.3, 6.0, 2.2), rise: 0.75, target: [STAGE.x, 1.2, STAGE.z], fov: 36, drift: 0.28 },
  P2: { name: 'CAM P2', label: 'Keyboard top', long: 'Vienna · keyboard top', pos: xyz(1.66, 0, 2.55), rise: 1, target: xyz(1.04, 0, 0.72), fov: 40, drift: 0.04 },
  P3: { name: 'CAM P3', label: 'Side cinematic', long: 'Vienna · side cinematic', pos: xyz(3.1, -1.9, 1.75), rise: 1, target: xyz(0.6, 0.3, 0.85), fov: 32, drift: 0.18 },
  P4: { name: 'CAM P4', label: 'Lift reveal', long: 'Vienna · lift reveal wide', pos: [-0.8, 3.0, 7.2], rise: 0, target: [STAGE.x, 1.7, STAGE.z], targetRise: 0.5, fov: 44, drift: 0.12 },
  P5: { name: 'CAM P5', label: 'Elevated tracking', long: 'Vienna · elevated tracking', pos: xyz(-3.4, 3.9, 1.4), rise: 1, target: xyz(0, 0, 0.9), fov: 38, lag: 1.6, drift: 0.2 },
};
// the studio's own piano shot (views.js `piano`, key 9) rides along too, so it keeps the grand in frame
export const STUDIO_PIANO_VIEW = { rise: 0.7 };

// the light rig round the grand, hung under the studio ceiling (aim points are on the platform and follow it)
export const RIG = {
  perimeter: { n: 8, r: 2.7, y: 7.9 },                                   // a small ring truss over the platform
  moving: [0, 1, 2, 3].map(i => { const a = Math.PI / 4 + (i * Math.PI) / 2; return [+(STAGE.x + Math.cos(a) * 2.0).toFixed(3), 7.75, +(STAGE.z + Math.sin(a) * 2.0).toFixed(3)]; }),
  // two floor backlights behind the grand, two high back rims (behind = away from the studio cameras)
  accent: [xyz(-1.2, -2.7, 0.25), xyz(1.2, -2.7, 0.25), xyz(-1.8, -3.0, 5.2), xyz(1.8, -3.0, 5.2)],
  spot: [-1.9, 7.6, 3.4],                                                // the performance spot, front of house, high
};
