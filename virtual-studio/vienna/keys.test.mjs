// node --test virtual-studio/vienna/keys.test.mjs — the key player against a stand-in keyboard (test notes only)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createKeyPlayer, validatePart } from './keys.js';

const keyboard = () => { const d = new Map(); return { d, press(n, x) { if (x) d.set(n, x); else d.delete(n); } }; };
const part = notes => ({ song: 'test/only', kind: 'piano-part', source: 'unit test', approved: { by: 'test', on: '2026-10-19' }, notes });

test('refuses a part that is not approved or has bad notes', () => {
  assert.ok(validatePart({ ...part([{ t: 0, d: 1, m: 60 }]), approved: null }).includes('not approved'));
  assert.ok(validatePart(part([{ t: 0, d: 1, m: 120 }])).length);
  assert.ok(validatePart(part([{ t: -1, d: 1, m: 60 }])).length);
  const kb = keyboard(), p = createKeyPlayer(kb);
  assert.ok(p.load({ ...part([{ t: 0, d: 1, m: 60 }]), approved: null }).length);
  p.update(0.5); assert.equal(kb.d.size, 0);
});

test('a chord goes down together, holds for its length, comes back up', () => {
  const kb = keyboard(), p = createKeyPlayer(kb);
  assert.deepEqual(p.load(part([{ t: 1, d: 0.5, m: 57 }, { t: 1, d: 0.5, m: 60 }, { t: 1, d: 0.5, m: 64 }])), []);
  p.update(0.9); assert.equal(kb.d.size, 0);
  p.update(1.2); assert.deepEqual([...kb.d.keys()].sort(), [57, 60, 64]);
  p.update(1.49); assert.equal(kb.d.size, 3);
  p.update(1.7); assert.equal(kb.d.size, 0);
});

test('state depends only on the time: seeking back and forth gives the same keys', () => {
  const kb = keyboard(), p = createKeyPlayer(kb);
  p.load(part([{ t: 2, d: 3, m: 48 }, { t: 4, d: 0.2, m: 72 }]));
  p.update(4.1); const a = new Map(kb.d);
  p.update(0.5); assert.equal(kb.d.size, 0);
  p.update(4.1); assert.deepEqual(kb.d, a);
  assert.deepEqual([...a.keys()].sort(), [48, 72]);
});

test('offset shifts the whole part against the recording', () => {
  const kb = keyboard(), p = createKeyPlayer(kb);
  p.load({ ...part([{ t: 0, d: 1, m: 60 }]), offset: 10 });
  p.update(0.5); assert.equal(kb.d.size, 0);
  p.update(10.5); assert.ok(kb.d.has(60));
});
