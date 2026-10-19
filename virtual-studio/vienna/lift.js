// The piano lift's controller: a state machine over a simple motion profile (accelerate, cruise, brake), the way a
// stage lift's drive moves. No three.js: the 3D stage reads `height` every frame, the tests drive it directly.
//
// States: LOWERED, RAISING, ELEVATED, LOWERING, STOPPED. Commands: up, down, stop, reset.
// A command against the current movement is refused (the operator stops first); STOP brakes, it never halts dead.

export const STATES = ['LOWERED', 'RAISING', 'ELEVATED', 'LOWERING', 'STOPPED'];
const EPS = 0.002;

export function createLift({ travel, vmax, accel }) {
  let h = 0, v = 0, goal = null, state = 'LOWERED';
  const listeners = new Set();

  const set = s => { if (s === state) return; const from = state; state = s; for (const f of listeners) f(s, from); };
  const refuse = reason => ({ ok: false, reason });

  function moveTo(to) {
    goal = to;
    set(to > h ? 'RAISING' : 'LOWERING');
    return { ok: true };
  }

  const commands = {
    up() {
      if (state === 'ELEVATED') return refuse('Already elevated');
      if (state === 'RAISING' && goal !== null) return { ok: true };
      if (state === 'LOWERING' && goal !== null) return refuse('Lowering: press STOP first');
      return moveTo(travel);
    },
    down() {
      if (state === 'LOWERED') return refuse('Already lowered');
      if (state === 'LOWERING' && goal !== null) return { ok: true };
      if (state === 'RAISING' && goal !== null) return refuse('Raising: press STOP first');
      return moveTo(0);
    },
    stop() {
      if (goal === null && v === 0) return { ok: true };
      goal = null;                                    // brake; the state settles once the platform stands
      return { ok: true };
    },
    // back to the bottom from wherever it is, including while moving up (it brakes, then comes down)
    reset() {
      if (state === 'LOWERED') return { ok: true };
      return moveTo(0);
    },
  };

  function step(dt) {
    if (goal === null) {
      // braking (or standing)
      if (v !== 0) { const dv = accel * dt; v = Math.abs(v) <= dv ? 0 : v - Math.sign(v) * dv; }
    } else {
      const d = goal - h, dir = Math.sign(d);
      const brake = (v * v) / (2 * accel);
      if (v !== 0 && Math.sign(v) !== dir) {
        const dv = accel * dt; v = Math.abs(v) <= dv ? 0 : v - Math.sign(v) * dv;   // moving the wrong way: brake first
      } else if (Math.abs(d) <= brake + Math.abs(v) * dt) {
        // inside the braking distance: decelerate so it arrives at (almost) zero speed; never below a creep speed
        const need = (v * v) / (2 * Math.max(Math.abs(d), 1e-4));
        v -= Math.sign(v) * Math.min(need, accel * 1.5) * dt;
        if (Math.sign(v) !== dir || Math.abs(v) < 0.01) v = dir * 0.01;
      } else {
        v = clamp(v + dir * accel * dt, -vmax, vmax);
      }
    }
    h += v * dt;
    if (goal !== null && (Math.abs(goal - h) < EPS || Math.sign(goal - h) !== Math.sign(goal - (h - v * dt)))) { h = goal; v = 0; goal = null; }
    if (h <= 0) { h = 0; if (v < 0) v = 0; }
    if (h >= travel) { h = travel; if (v > 0) v = 0; }
    if (goal === null && v === 0) set(h <= EPS ? 'LOWERED' : h >= travel - EPS ? 'ELEVATED' : 'STOPPED');
    return h;
  }

  return {
    command(name) {
      const c = commands[String(name).toLowerCase()];
      return c ? c() : refuse(`Unknown command ${name}`);
    },
    step,
    get height() { return h; },
    get speed() { return v; },
    get state() { return state; },
    get moving() { return v !== 0 || goal !== null; },
    get travel() { return travel; },
    on(f) { listeners.add(f); return () => listeners.delete(f); },
  };
}

function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
