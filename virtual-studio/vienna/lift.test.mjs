// node --test virtual-studio/vienna/
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLift } from './lift.js';
import { LIFT } from './layout.js';

const run = (lift, seconds, dt = 1 / 60) => { for (let t = 0; t < seconds; t += dt) lift.step(dt); };
const fresh = () => createLift(LIFT);

test('starts lowered and refuses DOWN', () => {
  const l = fresh();
  assert.equal(l.state, 'LOWERED');
  assert.equal(l.command('down').ok, false);
});

test('UP raises to the full travel and settles ELEVATED, within speed limits', () => {
  const l = fresh(), seen = [];
  l.on(s => seen.push(s));
  assert.ok(l.command('up').ok);
  let vmax = 0, prev = 0, amax = 0;
  // (the last frame, where it settles from creep speed onto the stop, is the brake engaging and not counted)
  for (let t = 0; t < 20; t += 1 / 60) { l.step(1 / 60); vmax = Math.max(vmax, Math.abs(l.speed)); if (l.speed) amax = Math.max(amax, Math.abs(l.speed - prev) * 60); prev = l.speed; }
  assert.equal(l.state, 'ELEVATED');
  assert.equal(l.height, LIFT.travel);
  assert.ok(vmax <= LIFT.vmax + 1e-9, `speed ${vmax}`);
  assert.ok(amax <= LIFT.accel * 1.5 + 0.02, `accel ${amax}`);
  assert.deepEqual(seen, ['RAISING', 'ELEVATED']);
});

test('a full rise takes a cinematic 11 to 16 seconds', () => {
  const l = fresh(); l.command('up');
  let t = 0; while (l.state !== 'ELEVATED' && t < 60) { l.step(1 / 60); t += 1 / 60; }
  assert.ok(t > 11 && t < 16, `took ${t.toFixed(1)} s`);
});

test('a conflicting command is refused while moving', () => {
  const l = fresh(); l.command('up'); run(l, 2);
  const r = l.command('down');
  assert.equal(r.ok, false); assert.match(r.reason, /STOP/);
  assert.equal(l.state, 'RAISING');
});

test('STOP brakes smoothly to STOPPED part way, then DOWN lowers', () => {
  const l = fresh(); l.command('up'); run(l, 5);
  const h0 = l.height; l.command('stop');
  assert.equal(l.state, 'RAISING');               // still braking
  run(l, 3);
  assert.equal(l.state, 'STOPPED');
  assert.ok(l.height > h0 && l.height - h0 < 0.4, 'brakes over a short distance');
  assert.ok(l.command('down').ok); run(l, 20);
  assert.equal(l.state, 'LOWERED'); assert.equal(l.height, 0);
});

test('RESET while raising brakes, reverses and comes down', () => {
  const l = fresh(); l.command('up'); run(l, 6);
  assert.ok(l.command('reset').ok);
  assert.equal(l.state, 'LOWERING');
  run(l, 25);
  assert.equal(l.state, 'LOWERED'); assert.equal(l.height, 0);
});

test('never leaves its travel, at any frame rate', () => {
  for (const dt of [1 / 240, 1 / 30, 0.1]) {
    const l = fresh(); l.command('up');
    for (let t = 0; t < 30; t += dt) { l.step(dt); assert.ok(l.height >= 0 && l.height <= LIFT.travel); }
    assert.equal(l.state, 'ELEVATED');
  }
});
