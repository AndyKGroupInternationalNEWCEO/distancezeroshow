// MIDI (lib/midi.js) without hardware: a fake backend delivers the bytes a keyboard and a DJ controller would send.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMidi, parse, deviceKind, controlKey } from '../lib/midi.js';

function fakeBackend(names) {
  const inputs = [];
  class Input { constructor() { inputs.push(this); } getPortCount() { return names.length; } getPortName(i) { return names[i]; } ignoreTypes() {} on(_e, f) { this.f = f; } openPort(i) { this.name = names[i]; } closePort() {} }
  return { lib: { Input }, send: (name, bytes) => inputs.find(i => i.name === name)?.f?.(0, bytes) };
}
const tick = () => new Promise(r => setTimeout(r, 20));

test('parse: notes, note-off as velocity 0, CC and pitch', () => {
  assert.deepEqual(parse([0x90, 60, 127]), { type: 'on', ch: 0, note: 60, vel: 1 });
  assert.deepEqual(parse([0x91, 60, 0]), { type: 'off', ch: 1, note: 60 });
  assert.deepEqual(parse([0xb0, 64, 127]), { type: 'cc', ch: 0, cc: 64, value: 1, raw: 127 });
  assert.equal(parse([0xf8]), null);
  assert.equal(deviceKind('Arturia KeyLab 61 mk3'), 'keys');
  assert.equal(deviceKind('DDJ-FLX4'), 'dj');
  assert.equal(controlKey('X', { type: 'off', ch: 2, note: 11 }), 'X|note|2|11');
});

test('a keyboard plays the grand; the sustain pedal goes along', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dz-midi-'));
  const fb = fakeBackend(['Arturia KeyLab 61']), keys = [];
  const m = createMidi({ dataDir: dir, backend: fb.lib, onKeys: k => keys.push(k), scanMs: 60000 });
  await tick();
  assert.equal(m.view().status, 'on');
  assert.deepEqual(m.view().devices, [{ name: 'Arturia KeyLab 61', kind: 'keys' }]);
  fb.send('Arturia KeyLab 61', [0x90, 60, 100]); fb.send('Arturia KeyLab 61', [0xb0, 64, 127]); fb.send('Arturia KeyLab 61', [0x80, 60, 0]);
  assert.deepEqual(keys, [{ note: 60, vel: 0.787 }, { sustain: true }, { note: 60, vel: 0 }]);
  m.close();
});

test('MIDI LEARN binds the next press; it fires on press only and survives a restart; GO cannot be bound', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dz-midi-'));
  const fb = fakeBackend(['DDJ-FLX4']), acts = [];
  let m = createMidi({ dataDir: dir, backend: fb.lib, onAction: a => acts.push(a), scanMs: 60000 });
  await tick();
  assert.throws(() => m.learn('go'), /No such MIDI action/);
  m.learn('play');
  fb.send('DDJ-FLX4', [0x90, 0x0b, 127]);              // deck 1 PLAY: learned, not fired
  assert.equal(m.view().learning, null);
  assert.equal(m.view().bindings['DDJ-FLX4|note|0|11'], 'play');
  fb.send('DDJ-FLX4', [0x80, 0x0b, 0]); fb.send('DDJ-FLX4', [0x90, 0x0b, 127]); fb.send('DDJ-FLX4', [0x80, 0x0b, 0]);
  assert.deepEqual(acts, ['play']);
  m.learn('talk'); fb.send('DDJ-FLX4', [0xb0, 20, 127]);  // a CC button
  fb.send('DDJ-FLX4', [0xb0, 20, 0]); fb.send('DDJ-FLX4', [0xb0, 20, 127]); fb.send('DDJ-FLX4', [0xb0, 20, 127]);
  assert.deepEqual(acts, ['play', 'talk'], 'a held CC button fires once');
  m.close();
  m = createMidi({ dataDir: dir, backend: fb.lib, onAction: a => acts.push(a), scanMs: 60000 }); await tick();
  assert.equal(m.view().bindings['DDJ-FLX4|note|0|11'], 'play');
  m.close();
});

test('without the package MIDI is off and nothing breaks', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dz-midi-'));
  const m = createMidi({ dataDir: dir, backend: { Input: class { constructor() { throw new Error('no ALSA'); } } }, scanMs: 60000, log: () => {} });
  await tick();
  assert.equal(m.view().status, 'error');
  m.close();
});
