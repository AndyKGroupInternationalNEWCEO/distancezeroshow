// NEXT STEPS 1 · 2 · 3: one recommendation at a time, and the right button marked as due.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextSteps } from '../public/static/steps.js';

const segs = [{ title: 'OPENING', kind: 'TALK', lead: 'both', minutes: 2 }, { title: 'NEWS', kind: 'TALK', lead: 'georgie', minutes: 5 },
  { title: 'GUEST TALK', kind: 'GUEST', lead: 'andrej', minutes: 10 }, { title: 'BREAK', kind: 'BREAK', lead: 'both', minutes: 3 }, { title: 'END', kind: 'TALK', lead: 'both', minutes: 2 }];
const now = 1e12, at = (index, segAgo) => ({ segments: segs, index, showStartedAt: now - 900e3, segmentStartedAt: now - segAgo * 1000 });
const guest = { name: 'Mia', status: 'waiting', online: true };

test('GO blinks only in the last 15 s before the start', () => {
  assert.equal(nextSteps({ rundown: { segments: segs, index: -1, episode: { startAt: now + 600e3 } } }, 'director', now).due, '');
  assert.equal(nextSteps({ rundown: { segments: segs, index: -1, episode: { startAt: now + 10e3 } } }, 'director', now).due, 'go');
});

test('the guest comes first when their segment is next: ADMIT, then GO, then TAKE GUEST ON AIR', () => {
  const a = nextSteps({ rundown: at(1, 200), guest }, 'director', now);
  assert.equal(a.due, 'admit'); assert.equal(a.steps.length, 3); assert.equal(a.steps.filter(s => s.due).length, 1);
  assert.equal(nextSteps({ rundown: at(1, 290), guest: { ...guest, status: 'backstage' } }, 'director', now).due, 'go');
  assert.equal(nextSteps({ rundown: at(2, 20), guest: { ...guest, status: 'backstage' } }, 'director', now).due, 'onair');
});

test('a break: RETURN TO LIVE becomes due 15 s before the end; Georgie never gets a button', () => {
  const brk = { active: true, startedAt: now - 170e3, planned: 180 };
  assert.equal(nextSteps({ rundown: at(3, 170), brk }, 'director', now).due, 'return');
  const h = nextSteps({ rundown: at(3, 170), brk }, 'host', now);
  assert.equal(h.due, ''); assert.match(h.steps[1].text, /05 END/);
});

test('the guest page follows the guest status', () => {
  assert.equal(nextSteps({ guest: { status: 'waiting' } }, 'guest').due, 'check');
  assert.equal(nextSteps({ guest: { status: 'waiting', check: { camera: true, mic: true } } }, 'guest').due, '');
  assert.equal(nextSteps({ guest: { status: 'backstage' } }, 'guest').due, 'open');
});
