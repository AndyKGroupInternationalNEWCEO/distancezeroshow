// Vienna Piano Stage: the numbers the stage is built from, in the studio's own coordinates (metres, y up, the
// studio cameras at +z looking at the LED wall at -z, Vienna on the left at -x). No three.js here, so the drawings
// (drawings.mjs) and the tests (lift.test.mjs) read the same values the 3D stage uses.
//
// Measured from the existing set (set.js): the room is a circle of radius 12.6 m about (0, 0, 1), 8.4 m high, open
// at the front; the existing grand stands inside it at (-5.3, 0, 0.3); the security camera hangs at
// (-11.15, 6.5, -3.3) on the Vienna-side wall. The stage is an annex beyond that wall, reached through an opening
// cut in it; the wall above the opening (and the security camera on it) stays.

export const ROOM = { R: 12.6, Z: 1, H: 8.4 };

// the opening in the Vienna-side wall: from z0 to z1 along the wall, up to the lintel
export const PORTAL = { z0: -6.0, z1: 4.0, h: 5.8 };

// the annex: a box from the room's wall out to x0, between z0 and z1, with its own higher ceiling
export const ANNEX = { x0: -22.0, z0: -6.6, z1: 4.6, h: 10.0 };

// the stage deck the platform is let into, and its circular well (the lift stands on the studio floor in the well)
export const DECK = { x0: -21.6, x1: -11.6, z0: -6.2, z1: 4.2, h: 0.45 };

// the lift: platform centre, its size, how far it travels and how it moves
export const LIFT = {
  x: -16.2, z: -0.9,
  r: 2.2,            // platform radius (4.4 m: a 2.74 m grand and its bench, with a 25 cm margin all round)
  well: 2.32,        // radius of the well in the deck (12 cm running clearance)
  thick: 0.12,       // platform thickness
  travel: 3.5,       // m above the deck at the top
  vmax: 0.32,        // m/s
  accel: 0.18,       // m/s²
  stages: 3,         // scissor stages
  arm: 2.4,          // scissor arm length, pin to pin
  packs: 0.85,       // the two scissor packs at ±z of the lift's centre
};

// platform top above the studio floor, for a lift height h (0 … travel)
export const platformTop = h => DECK.h + h;

// the grand on the platform: keyboard towards +z, its long side (open lid) to the studio (+x), the pianist on the
// keyboard's +z side. The piano's own origin is the front of the keyboard; this offset centres piano and bench
export const PIANO_ON_PLATFORM = { z: 0.96 };

// virtual cameras. Positions follow the platform: `rise` is how much of the lift's height the camera rides up with
// (1 = on the platform's rig, 0 = on the floor). Targets ride fully, offset above the platform top
export const CAMS = {
  P1: { name: 'CAM P1', label: 'Main front', long: 'Vienna · main front 4K', pos: [-8.7, 2.4, 1.3], rise: 0.85, target: [-16.2, 0.95, -0.9], fov: 34 },
  P2: { name: 'CAM P2', label: 'Keyboard top', long: 'Vienna · keyboard top', pos: [-16.2, 2.35, 0.62], rise: 1, target: [-16.2, 0.72, 0.1], fov: 34 },
  P3: { name: 'CAM P3', label: 'Side cinematic', long: 'Vienna · side cinematic', pos: [-13.5, 1.75, 2.15], rise: 1, target: [-16.0, 0.85, -0.35], fov: 30 },
  P4: { name: 'CAM P4', label: 'Lift reveal', long: 'Vienna · lift reveal wide', pos: [-10.6, 2.2, 4.0], rise: 0, target: [-16.2, 2.4, -1.0], fov: 48, fixedTarget: true },
  P5: { name: 'CAM P5', label: 'Elevated tracking', long: 'Vienna · elevated tracking', pos: [-12.4, 1.7, -4.6], rise: 1, target: [-16.0, 0.9, -0.6], fov: 36, lag: 1.6 },
};

// the light rig: positions of the fixtures (aim points are on the platform and follow it)
export const RIG = {
  perimeter: { n: 8, r: 5.6, y: 8.6 },                 // ring truss over the platform
  moving: [[-13.6, 9.2, -3.4], [-13.6, 9.2, 1.6], [-18.8, 9.2, -3.4], [-18.8, 9.2, 1.6]],
  accent: [[-20.6, 1.0, -4.6], [-20.6, 1.0, 2.8], [-20.9, 6.2, -2.6], [-20.9, 6.2, 0.8]],   // low floor backlights, high back rims
  spot: [-11.8, 9.0, -0.9],                            // the performance spot, front of house, high
};
