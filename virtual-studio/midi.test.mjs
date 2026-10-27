// midi.js without a browser (node virtual-studio/midi.test.mjs): a fake Web MIDI port and a minimal DOM. Checks the
// models per space (no piano profile in the DJ Room), notes and the sustain pedal at the Piano, MIDI Learn in the
// DJ Room (a learned control works, others do nothing), and that nothing reacts outside the Piano and the DJ Room.
import assert from 'node:assert/strict';

class El {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.style = {}; this.dataset = {}; this.hidden = false; this.textContent = ''; this.className = ''; }
  append(...c) { this.children.push(...c); } appendChild(c) { this.children.push(c); return c; }
  setAttribute(k, v) { this.attrs[k] = v; }
  set innerHTML(v) { this.children = []; }
  all() { return this.children.flatMap(c => [c, ...(c.all ? c.all() : [])]); }
  querySelector(sel) { return this.all().find(e => e.tag === sel) || null; }
}
const store = new Map();
globalThis.document = { createElement: t => new El(t), head: new El('head'), body: new El('body') };
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
globalThis.addEventListener = () => {};
const port = name => ({ id: 'in-' + name, name, type: 'input', state: 'connected', onmidimessage: null });
const devices = [port('Minilab3 MIDI'), port('DDJ Controller')];
Object.defineProperty(globalThis, 'navigator', { value: { requestMIDIAccess: async () => ({ inputs: new Map(devices.map(d => [d.id, d])), onstatechange: null }), permissions: { query: async () => ({ state: 'granted' }) } } });

const { midi, PROFILES } = await import('./midi.js');
const results = []; const ok = (name, cond) => { results.push(cond); console.log((cond ? '✔ ' : '✘ ') + name); };
ok('the DJ Room lists no piano model', PROFILES.dj.every(p => !PROFILES.piano.some(q => q.id === p.id)) && PROFILES.dj.every(p => !/keyboard|minilab/i.test(p.name)));
ok('the MiniLab 3 is recognised by its port name', PROFILES.piano[0].match.test('Minilab3 MIDI') && PROFILES.piano[0].match.test('Arturia MiniLab mk3') && !PROFILES.piano[0].match.test('MiniLab mkII'));

let space = 'piano'; const played = [], djDone = [];
const ui = midi({ space: () => space, piano: { noteOn: (n, v) => played.push(['on', n, +v.toFixed(2)]), noteOff: n => played.push(['off', n]) }, dj: (a, v) => djDone.push([a, +v.toFixed(3)]) });
await new Promise(r => setTimeout(r, 20));   // (the permission query and the access)
const send = (dev, ...data) => dev.onmidimessage?.({ target: dev, data });
const card = document.body.children.find(e => e.className === 'sp-info sp-midi');
const find = text => card.all().find(e => e.tag === 'button' && e.textContent === text);
const select = n => card.all().filter(e => e.tag === 'select')[n];

ui.open();
ok('PIANO: the MiniLab is the device and its model is chosen', select(0)?.children.find(o => o.selected)?.textContent === 'Minilab3 MIDI' && select(1)?.children.find(o => o.selected)?.textContent === 'Arturia MiniLab 3');
send(devices[0], 0x90, 60, 100); send(devices[0], 0x80, 60, 0);
ok('a key plays the grand with its velocity, and stops', JSON.stringify(played) === JSON.stringify([['on', 60, 0.79], ['off', 60]]));
played.length = 0;
send(devices[0], 0xb0, 64, 127); send(devices[0], 0x90, 62, 90); send(devices[0], 0x80, 62, 0);
ok('sustain pedal down (CC 64): the note rings on after its key is released', played.length === 1 && played[0][0] === 'on');
send(devices[0], 0xb0, 64, 0);
ok('pedal up: the note stops', played.at(-1)[0] === 'off' && played.at(-1)[1] === 62);
played.length = 0; send(devices[1], 0x90, 64, 100);
ok('another device than the chosen one is not heard', played.length === 0);

space = 'dj'; ui.open();
ok('DJ ROOM: its own list (DJ controller or mixer), not the piano models', select(1)?.children.every(o => !/MiniLab|keyboard/i.test(o.textContent)));
{ const s = select(0); s.value = devices[1].id; s.onchange(); }   // the DJ controller as the device
send(devices[1], 0x90, 11, 127);
ok('before learning, a control does nothing', djDone.length === 0);
const learnRow = card.all().find(e => e.tag === 'li' && e.children[0].textContent.startsWith('Deck 2 · Play'));
learnRow.children[1].onclick(); send(devices[1], 0x90, 11, 127);
ok('LEARN Deck 2 · Play, then the pad: it is learned (not played)', djDone.length === 0);
send(devices[1], 0x90, 11, 127);
ok('the learned pad plays deck 2', JSON.stringify(djDone) === JSON.stringify([['play1', 1]]));
const xfRow = card.all().find(e => e.tag === 'li' && e.children[0].textContent.startsWith('Crossfader'));
xfRow.children[1].onclick(); send(devices[1], 0xb0, 31, 10); send(devices[1], 0xb0, 31, 127);
ok('a learned crossfader moves the crossfader (0…1)', JSON.stringify(djDone.at(-1)) === JSON.stringify(['xfader', 1]));
const jogRow = card.all().find(e => e.tag === 'li' && e.children[0].textContent.startsWith('Deck 3 · Jog'));
jogRow.children[1].onclick(); send(devices[1], 0xb0, 34, 1); send(devices[1], 0xb0, 34, 127);
ok('a learned jog turns back on 127 (relative)', JSON.stringify(djDone.at(-1)) === JSON.stringify(['jog2', -1]));
const before = djDone.length; send(devices[1], 0xb0, 64, 127);
ok('in the DJ Room CC 64 is no sustain and nothing unlearned reacts', djDone.length === before && played.length === 0);

space = 'studio'; djDone.length = 0; played.length = 0;
send(devices[1], 0x90, 11, 127); send(devices[0], 0x90, 60, 100);
ok('in the STUDIO nothing reacts to MIDI', djDone.length === 0 && played.length === 0);
console.log(`${results.filter(Boolean).length}/${results.length}`);
process.exit(results.every(Boolean) ? 0 : 1);
