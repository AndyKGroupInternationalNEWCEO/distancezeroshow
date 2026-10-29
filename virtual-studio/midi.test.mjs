// midi.js without a browser (node virtual-studio/midi.test.mjs): a fake Web MIDI port and a minimal DOM. Checks the
// models per space (no piano profile in the DJ Room), notes and the sustain pedal at the Piano, MIDI Learn in the
// DJ Room (a learned control works, others do nothing), and that nothing reacts outside the Piano and the DJ Room.
// The MiniLab 3 shows four ports, its keys on 'Minilab3 MIDI' only: listed here with DIN THRU first (the port the
// first version picked, so the keys were never heard). Also: PLAY PIANO asks for MIDI, a refusal, the diagnostics.
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
const mini = ['Minilab3 DIN THRU', 'Minilab3 MCU/HUI', 'Minilab3 MIDI', 'Minilab3 ALV'].map(port), keys = mini[2];
const devices = [...mini, port('DDJ Controller')];
let asked = 0, allow = true, perm = 'granted', lastAccess = null;
Object.defineProperty(globalThis, 'navigator', { value: {
  requestMIDIAccess: async () => { asked++; if (!allow) throw new Error('SecurityError'); return (lastAccess = { inputs: new Map(devices.map(d => [d.id, d])), onstatechange: null }); },
  permissions: { query: async () => ({ state: perm }) } } });

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
ok('PIANO: all MIDI inputs are heard, and the MiniLab 3 model is chosen', select(0)?.children.find(o => o.selected)?.textContent === 'All MIDI inputs' && select(1)?.children.find(o => o.selected)?.textContent === 'Arturia MiniLab 3');
const diagText = () => card.all().find(e => e.className === 'diag')?.children.map(c => c.textContent).join('\n') || '';
ok('the diagnostics: access allowed, the four MiniLab ports, no message yet', /Access: allowed/.test(diagText()) && /Minilab3 MIDI/.test(diagText()) && /none yet/.test(diagText()));
send(keys, 0x90, 60, 100);
ok('a key on the MiniLab\'s MIDI port (not the first port listed) is heard', played.length === 1 && played[0][1] === 60);
ok('the diagnostics show it: Note On C4 vel 100, its bytes and its port', /Messages: 1 · last: Note On C4 \(60\) vel 100 · ch 1 · \[90 3c 64\] · from Minilab3 MIDI/.test(diagText()) && /Grand: plays C4 at velocity 100/.test(diagText()));
send(keys, 0x80, 60, 0);
ok('a key plays the grand with its velocity, and stops', JSON.stringify(played) === JSON.stringify([['on', 60, 0.79], ['off', 60]]));
played.length = 0; send(keys, 0x90, 61, 64); send(keys, 0x90, 61, 0);
ok('Note On with velocity 0 is a Note Off', JSON.stringify(played) === JSON.stringify([['on', 61, 0.5], ['off', 61]]));
played.length = 0; const n0 = (diagText().match(/Messages: (\d+)/) || [])[1]; send(keys, 0xf8); send(keys, 0xfe);
ok('MIDI clock and active sensing play nothing and are not counted', played.length === 0 && (diagText().match(/Messages: (\d+)/) || [])[1] === n0);
send(keys, 0x92, 48, 127); send(keys, 0x82, 48, 0);
ok('a key on another MIDI channel plays too', JSON.stringify(played) === JSON.stringify([['on', 48, 1], ['off', 48]]));
played.length = 0;
send(keys, 0xb0, 64, 127); send(keys, 0x90, 62, 90); send(keys, 0x80, 62, 0);
ok('sustain pedal down (CC 64): the note rings on after its key is released', played.length === 1 && played[0][0] === 'on');
send(keys, 0xb0, 64, 0);
ok('pedal up: the note stops', played.at(-1)[0] === 'off' && played.at(-1)[1] === 62);
played.length = 0; send(keys, 0xb0, 64, 127); send(keys, 0x90, 67, 80);
keys.state = 'disconnected'; lastAccess.onstatechange({ port: keys }); keys.state = 'connected';
ok('unplugged with a key down and the pedal held: the note stops', played.at(-1)?.[0] === 'off' && played.at(-1)?.[1] === 67);
played.length = 0;
{ const s = select(0); s.value = keys.id; s.onchange(); }   // one input chosen: only that one
send(mini[0], 0x90, 64, 100); send(devices.at(-1), 0x90, 64, 100);
ok('a chosen device: the other inputs are not heard', played.length === 0);
send(keys, 0x90, 64, 100); send(keys, 0x80, 64, 0);
ok('… and the chosen one is', played.length === 2);
{ const s = select(0); s.value = 'all'; s.onchange(); }
played.length = 0;
{ const row = card.all().find(e => e.tag === 'li' && e.children[0].textContent.startsWith('Sustain pedal')); row.children[1].onclick(); }
send(keys, 0xb0, 66, 127); send(keys, 0xb0, 66, 127);   // a pedal on CC 66 learned as the sustain (all inputs heard), then pressed
send(keys, 0x90, 65, 90); send(keys, 0x80, 65, 0);
ok('all inputs: a learned sustain pedal (CC 66) holds the note', played.length === 1);
send(keys, 0xb0, 66, 0);
ok('… and lets it go', played.at(-1)?.[0] === 'off' && played.at(-1)?.[1] === 65);
played.length = 0;

space = 'dj'; ui.open();
ok('DJ ROOM: its own list (DJ controller or mixer), not the piano models', select(1)?.children.every(o => !/MiniLab|keyboard/i.test(o.textContent)));
const ddj = devices.at(-1);
{ const s = select(0); s.value = ddj.id; s.onchange(); }   // the DJ controller as the device
send(ddj, 0x90, 11, 127);
ok('before learning, a control does nothing', djDone.length === 0);
const learnRow = card.all().find(e => e.tag === 'li' && e.children[0].textContent.startsWith('Deck 2 · Play'));
learnRow.children[1].onclick(); send(ddj, 0x90, 11, 127);
ok('LEARN Deck 2 · Play, then the pad: it is learned (not played)', djDone.length === 0);
send(ddj, 0x90, 11, 127);
ok('the learned pad plays deck 2', JSON.stringify(djDone) === JSON.stringify([['play1', 1]]));
const xfRow = card.all().find(e => e.tag === 'li' && e.children[0].textContent.startsWith('Crossfader'));
xfRow.children[1].onclick(); send(ddj, 0xb0, 31, 10); send(ddj, 0xb0, 31, 127);
ok('a learned crossfader moves the crossfader (0…1)', JSON.stringify(djDone.at(-1)) === JSON.stringify(['xfader', 1]));
const jogRow = card.all().find(e => e.tag === 'li' && e.children[0].textContent.startsWith('Deck 3 · Jog'));
jogRow.children[1].onclick(); send(ddj, 0xb0, 34, 1); send(ddj, 0xb0, 34, 127);
ok('a learned jog turns back on 127 (relative)', JSON.stringify(djDone.at(-1)) === JSON.stringify(['jog2', -1]));
const before = djDone.length; send(ddj, 0xb0, 64, 127);
ok('in the DJ Room CC 64 is no sustain and nothing unlearned reacts', djDone.length === before && played.length === 0);

space = 'studio'; djDone.length = 0; played.length = 0;
send(ddj, 0x90, 11, 127); send(keys, 0x90, 60, 100);
ok('in the STUDIO nothing reacts to MIDI', djDone.length === 0 && played.length === 0);
// PLAY PIANO before MIDI was ever allowed: listen() asks (from the click), and a refusal opens the card with the way out
perm = 'prompt'; space = 'piano';
const before2 = asked; const ui2 = midi({ space: () => space, piano: { noteOn: () => {}, noteOff: () => {} }, dj: () => {} });
await new Promise(r => setTimeout(r, 20));
ok('not allowed yet: nothing is asked before PLAY PIANO', asked === before2);
await ui2.listen();
ok('PLAY PIANO asks for MIDI, and the keys are heard', asked === before2 + 1 && ui2.state.access && ui2.state.inputs.includes('Minilab3 MIDI'));
allow = false; const ui3 = midi({ space: () => space, piano: { noteOn: () => {}, noteOff: () => {} }, dj: () => {} });
await ui3.listen();
const card3 = document.body.children.filter(e => e.className === 'sp-info sp-midi').at(-1);
ok('MIDI refused: the card opens and says how to allow it', !card3.hidden && ui3.state.refused && card3.all().some(e => /Site settings → MIDI device control/.test(e.textContent)));
console.log(`${results.filter(Boolean).length}/${results.length}`);
process.exit(results.every(Boolean) ? 0 : 1);
