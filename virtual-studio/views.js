// Camera direction: named viewpoints, smooth flights between them, a slow cinematic drift while the viewer
// is idle, and an automatic tour that cuts between viewpoints like a TV director.
import * as THREE from 'three';

// tally: which studio camera would be "taking" this shot (1-3 pedestals, 4 the jib)
export const VIEWS = {
  studio: { label: 'Studio', long: 'Wide shot', pos: [0, 3.0, 11.4], target: [0, 1.75, -3], fov: 42, drift: 0.32, tally: 2 },
  desk: { label: 'Desk', long: 'Three-shot', pos: [0, 1.6, 3.9], target: [0, 1.12, -1.75], fov: 36, drift: 0.14, tally: 2 },
  andy: { label: "Andy'K", long: "DJ Andy'K · Andrej Kneisl · Vienna", pos: [-0.35, 1.12, 1.75], target: [-0.95, 0.8, -1.45], fov: 30, drift: 0.07, tally: 3 },
  georgie: { label: 'Georgie', long: 'Georgie Walker · Melbourne', pos: [0.35, 1.12, 1.75], target: [0.95, 0.8, -1.45], fov: 30, drift: 0.07, tally: 1 },
  wall: { label: 'Video wall', long: 'LED wall and logo', pos: [0, 2.1, 1.9], target: [0, 3.25, -7], fov: 50, drift: 0.12, tally: 4 },
  crane: { label: 'Crane', long: 'High angle', pos: [7.4, 6.6, 7.6], target: [0, 1.0, -2.2], fov: 40, drift: 0.18, tally: 2 },
  floor: { label: 'Floor', long: 'Behind camera 3', pos: [5.2, 1.9, 7.4], target: [-0.2, 1.15, -2.2], fov: 34, drift: 0.08, tally: 3 },
  music: { label: 'Music', long: 'Music station', pos: [-2.5, 1.85, 3.1], target: [-5.4, 1.0, 0.1], fov: 38, drift: 0.12, tally: 1 },
  piano: { label: 'Piano', long: 'Grand piano', pos: [2.2, 2.0, 3.8], target: [5.1, 0.5, -0.1], fov: 40, drift: 0.1, tally: 3 },
  guest: { label: 'Guest', long: 'Special guest · camera 5', pos: [0, 1.12, 1.75], target: [0, 0.8, -1.45], fov: 30, drift: 0.07, tally: 5 },
  // the 4K high-speed camera on the motion-control robot: its own moves, the studio in slow motion (slow = time scale)
  // the backstage lounge behind the LED wall (not part of the tour, never "on air")
  backstage: { label: 'Backstage', long: 'Backstage lounge · no entry', pos: [-3.0, 1.75, -7.55], target: [0.7, 0.75, -10.2], fov: 60, drift: 0.05, tally: 0, lounge: true },
  // security cameras: never on air, shown as their own recording (black-and-white CCTV look, see main.js)
  security: { label: 'Security', long: 'Security · studio', pos: [-10.95, 6.4, -3.2], target: [0, 0.8, -1], fov: 72, drift: 0, tally: 0, cctv: 'SEC 1 · STUDIO' },
  securityLounge: { label: 'Security', long: 'Security · backstage', pos: [-3.18, 2.66, -10.9], target: [2.6, 1.0, -8.6], fov: 80, drift: 0, tally: 0, cctv: 'SEC 2 · BACKSTAGE', lounge: true },
  // the robot itself at work, seen from the Melbourne side (real time: these robots move fast; H again)
  robot: { label: '4K slow-mo', long: '4K camera robot · at work', pos: [4.4, 1.85, 5.4], target: [0, 1.0, 2.0], fov: 46, drift: 0.05, tally: 0 },
  slowmo: { label: '4K slow-mo', long: '4K robot camera · slow motion', pos: [0, 0.45, 2.3], target: [0, 1.05, -1.9], fov: 40, drift: 0.04, tally: 6, slow: 0.2 },
};
export const ORDER = Object.keys(VIEWS);
const TOUR = ['studio', 'desk', 'andy', 'georgie', 'guest', 'crane', 'wall', 'slowmo', 'floor', 'music', 'piano'];
const HOLD = 8.5;

// the backstage lounge's box (behind the LED wall, see LOUNGE in set.js)
export const inLounge = p => p.z < -7.35 && Math.abs(p.x) < 3.5 && p.y < 3;
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const ROOM_CENTER = new THREE.Vector3(0, 0, 1), ROOM_R = 11.8;

// `lens.fov` is the framing designed for a 16:9 screen; the page converts it for the actual screen shape
export function createDirector({ camera, lens, controls, reducedMotion, onView, onAuto }) {
  let current = 'studio', flight = null, auto = !reducedMotion, tourAt = 0, tourIndex = 0;
  let idleSince = performance.now(), drift = null;

  controls.addEventListener('start', () => {
    flight = null; drift = null;
    idleSince = Infinity;
    if (auto) setAuto(false);
    if (current) { current = null; onView(null); }
  });
  controls.addEventListener('end', () => { idleSince = performance.now(); });

  function setAuto(on) {
    auto = on;
    tourAt = performance.now() / 1000;
    onAuto(on);
  }

  function go(name, { instant = false } = {}) {
    const v = VIEWS[name];
    if (!v) return;
    current = name;
    drift = null;
    onView(name);
    const to = { pos: new THREE.Vector3(...v.pos), target: new THREE.Vector3(...v.target), fov: v.fov };
    if (instant || reducedMotion) {
      camera.position.copy(to.pos); controls.target.copy(to.target); lens.fov = to.fov;
      flight = null; idleSince = performance.now();
      return;
    }
    // into or out of the lounge: a cut, never a flight through the LED wall
    if (inLounge(camera.position) !== !!v.lounge) { camera.position.copy(to.pos); controls.target.copy(to.target); lens.fov = to.fov; flight = null; idleSince = performance.now(); return; }
    const from = { pos: camera.position.clone(), target: controls.target.clone(), fov: lens.fov };
    const dist = from.pos.distanceTo(to.pos);
    flight = { from, to, t: 0, dur: THREE.MathUtils.clamp(1.1 + dist * 0.09, 1.3, 2.6), lift: Math.min(1.4, dist * 0.1) };
  }

  function update(dt, now) {
    if (flight) {
      flight.t = Math.min(1, flight.t + dt / flight.dur);
      const k = ease(flight.t);
      camera.position.lerpVectors(flight.from.pos, flight.to.pos, k);
      camera.position.y += Math.sin(Math.PI * k) * flight.lift;
      controls.target.lerpVectors(flight.from.target, flight.to.target, k);
      lens.fov = THREE.MathUtils.lerp(flight.from.fov, flight.to.fov, k);
      if (flight.t >= 1) { flight = null; idleSince = performance.now(); }
    } else if (!reducedMotion && current && now - idleSince > 1500) {
      // slow cinematic drift around the framed subject, starting from wherever the camera is
      if (!drift) {
        const off = camera.position.clone().sub(controls.target);
        const s = new THREE.Spherical().setFromVector3(off);
        drift = { s, t: 0, amp: VIEWS[current].drift };
      }
      drift.t += dt;
      const s = drift.s.clone();
      s.theta += Math.sin(drift.t * 0.11) * drift.amp;
      s.phi += Math.sin(drift.t * 0.07) * drift.amp * 0.15;
      s.radius *= 1 - Math.sin(drift.t * 0.05) * 0.04;
      camera.position.setFromSpherical(s).add(controls.target);
    }
    if (auto && !flight && now / 1000 - tourAt > HOLD) {
      tourAt = now / 1000;
      tourIndex = (Math.max(0, TOUR.indexOf(current)) + 1) % TOUR.length;
      go(TOUR[tourIndex]);
    }
    const t = controls.target, p = camera.position;
    // in the lounge: stay within its walls
    if (inLounge(p)) {
      p.x = THREE.MathUtils.clamp(p.x, -3.3, 3.3); p.y = THREE.MathUtils.clamp(p.y, 0.4, 2.7); p.z = THREE.MathUtils.clamp(p.z, -11.0, -7.45);
      t.x = THREE.MathUtils.clamp(t.x, -3.4, 3.4); t.y = THREE.MathUtils.clamp(t.y, 0.2, 2.8); t.z = THREE.MathUtils.clamp(t.z, -11.15, -7.4);
      return;
    }
    // keep the camera inside the room and above the floor, and the target on the set
    t.x = THREE.MathUtils.clamp(t.x, -7, 7); t.y = THREE.MathUtils.clamp(t.y, 0.3, 5.2); t.z = THREE.MathUtils.clamp(t.z, -7.5, 4);
    if (p.y < 0.35) p.y = 0.35;
    if (p.y > 7.8) p.y = 7.8;
    const flat = new THREE.Vector2(p.x - ROOM_CENTER.x, p.z - ROOM_CENTER.z);
    if (flat.length() > ROOM_R) { flat.setLength(ROOM_R); p.x = ROOM_CENTER.x + flat.x; p.z = ROOM_CENTER.z + flat.y; }
  }

  return {
    go, update,
    get current() { return current; },
    get auto() { return auto; },
    setAuto(on) { setAuto(on); if (on && !flight) tourAt = performance.now() / 1000 - HOLD + 2; },
    tally() { return VIEWS[current]?.tally ?? 2; },
  };
}
