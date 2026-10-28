// MIDI from the Mac's own devices: the Arturia keyboard and the DJ controller. Safari has no Web MIDI, so this studio
// (node, on the Mac) reads them and drives the rest itself:
//   - a keyboard's notes play the grand on the Vienna Piano Stage (its keys move and it sounds), the sustain pedal holds
//     them; a keyboard is any device whose name says so (Arturia, KeyLab, MiniLab, KeyStep, …) or one set to 'keys';
//   - every other press can be bound to a studio action by MIDI LEARN (press LEARN beside the action in the Director,
//     then the button, pad or key on the device). Bindings are kept in the studio's data folder.
// The devices are found by name and re-scanned every few seconds, so one can be plugged in or out during a show.
// Without the optional package @julusian/midi the studio runs as before, with MIDI off (the Director says so).
import fs from 'node:fs';
import path from 'node:path';

const KEYS = /arturia|keylab|minilab|keystep|microlab|astrolab|keyboard|piano|\bkeys?\b/i;
const DJ = /\bddj|\bdjm|pioneer|numark|mixtrack|hercules|inpulse|traktor|kontrol s\d|\bdj\b|rane|denon|prime|reloop|serato/i;
export const deviceKind = name => KEYS.test(name) ? 'keys' : DJ.test(name) ? 'dj' : 'other';

// what a binding may do (the Director lists these with LEARN buttons). GO is not among them: a stray pad must never
// fire the next segment on air.
export const ACTIONS = [
  ['play', 'PLAY / PAUSE (playlist)'], ['stop', 'STOP (playlist)'], ['next', 'NEXT track'], ['prev', 'PREVIOUS track'], ['talk', 'TALK (mic over the music)'],
  ['cam:P1', 'Piano camera P1'], ['cam:P2', 'Piano camera P2'], ['cam:P3', 'Piano camera P3'], ['cam:P4', 'Piano camera P4'], ['cam:P5', 'Piano camera P5'],
  ['mode:WARM PIANO', 'Piano light: warm'], ['mode:CINEMATIC', 'Piano light: cinematic'], ['mode:PERFORMANCE', 'Piano light: performance'],
];
const ACTION_IDS = new Set(ACTIONS.map(a => a[0]));

// raw bytes → one message ({ type: on|off|cc|pitch, ch, … }); clock, sysex and the rest are ignored
export function parse(bytes) {
  const [st = 0, a = 0, b = 0] = bytes || [];
  const type = st & 0xf0, ch = st & 0x0f;
  if (type === 0x90 && b > 0) return { type: 'on', ch, note: a, vel: +(b / 127).toFixed(3) };
  if (type === 0x80 || type === 0x90) return { type: 'off', ch, note: a };
  if (type === 0xb0) return { type: 'cc', ch, cc: a, value: +(b / 127).toFixed(3), raw: b };
  if (type === 0xe0) return { type: 'pitch', ch, value: +(((b << 7) | a) / 16383).toFixed(4) };
  return null;
}
// the control a message came from, the same for its press and its release: what a binding is keyed by
export const controlKey = (dev, m) => m.type === 'cc' ? `${dev}|cc|${m.ch}|${m.cc}` : m.type === 'on' || m.type === 'off' ? `${dev}|note|${m.ch}|${m.note}` : null;

export function createMidi({ dataDir, onKeys, onAction, onEvent, log = () => {}, scanMs = 3000, backend = null }) {
  const FILE = path.join(dataDir, 'midi.json');
  let cfg = { bindings: {}, kinds: {} };
  try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch {}
  const save = () => { try { fs.writeFileSync(FILE + '.tmp', JSON.stringify(cfg, null, 2)); fs.renameSync(FILE + '.tmp', FILE); } catch (e) { log('warn', 'MIDI: could not save the bindings: ' + e.message); } };
  const open = new Map();           // device name → input
  let lib = backend, status = 'starting', learning = null, last = null;
  const prevCc = new Map();   // a CC control's last value (its rising edge fires a binding)
  const kindOf = name => cfg.kinds[name] || deviceKind(name);

  function handle(dev, bytes) {
    const m = parse(bytes); if (!m) return;
    const key = controlKey(dev, m);
    last = { dev, ...m, at: Date.now() };
    if (learning && key && (m.type === 'on' || (m.type === 'cc' && m.raw > 0))) {
      // the next press is bound to the action waiting for it (a control has one action; an action may have several controls)
      cfg.bindings[key] = learning; save();
      log('ok', `MIDI LEARN: ${dev} ${m.type === 'cc' ? 'CC ' + m.cc : 'note ' + m.note} → ${learning}`);
      const a = learning; learning = null; onEvent?.({ learned: { key, action: a } }); return;
    }
    const was = m.type === 'cc' ? (prevCc.get(key) || 0) : 0;
    if (m.type === 'cc') prevCc.set(key, m.raw);
    const bound = key && cfg.bindings[key];
    if (bound) {
      // a note fires on its press; a CC button (0/127) on its rising edge, so holding it never repeats the action
      if (m.type === 'on' || (m.type === 'cc' && m.raw >= 64 && was < 64)) onAction?.(bound, { dev, m });
      return;
    }
    if (kindOf(dev) === 'keys' && ['on', 'off'].includes(m.type)) return onKeys?.(m.type === 'on' ? { note: m.note, vel: m.vel } : { note: m.note, vel: 0 });
    if (kindOf(dev) === 'keys' && m.type === 'cc' && m.cc === 64) return onKeys?.({ sustain: m.raw >= 64 });
    onEvent?.({ unbound: { dev, ...m } });
  }

  async function scan() {
    if (!lib) {
      try { lib = (await import('@julusian/midi')).default; }
      catch { status = 'off'; log('warn', 'MIDI is off: the package @julusian/midi is not installed (npm install in studio/).'); return; }
    }
    let names = [];
    try { const probe = new lib.Input(); for (let i = 0; i < probe.getPortCount(); i++) names.push(probe.getPortName(i)); probe.closePort?.(); }
    catch (e) { status = 'error'; log('warn', 'MIDI: the devices could not be listed: ' + e.message); return; }
    status = 'on';
    let changed = false;
    names.forEach((name, i) => {
      if (open.has(name)) return;
      try {
        const input = new lib.Input();
        input.ignoreTypes(true, true, true);   // no sysex, clock or active sensing
        input.on('message', (_dt, bytes) => handle(name, bytes));
        input.openPort(i);
        open.set(name, input); changed = true;
        log('ok', `MIDI: ${name} connected (${kindOf(name) === 'keys' ? 'keyboard → the grand' : kindOf(name) === 'dj' ? 'DJ controller' : 'MIDI device'})`);
      } catch (e) { log('warn', `MIDI: ${name} could not be opened: ${e.message}`); }
    });
    for (const [name, input] of open) if (!names.includes(name)) { try { input.closePort(); } catch {} open.delete(name); changed = true; log('warn', `MIDI: ${name} disconnected`); }
    if (changed) onEvent?.({ devices: true });
  }
  scan();
  const timer = setInterval(scan, scanMs);

  return {
    handle,   // for tests and for a bridge that delivers bytes from elsewhere
    view: () => ({ status, devices: [...open.keys()].map(name => ({ name, kind: kindOf(name) })), learning, bindings: cfg.bindings, kinds: cfg.kinds, actions: ACTIONS, last }),
    learn(action) { if (action && !ACTION_IDS.has(action)) throw new Error('No such MIDI action'); learning = action || null; },
    unbind(key) { delete cfg.bindings[key]; save(); },
    setKind(name, kind) { if (!['keys', 'dj', 'other', ''].includes(kind)) throw new Error('No such device kind'); if (kind) cfg.kinds[name] = kind; else delete cfg.kinds[name]; save(); },
    close() { clearInterval(timer); for (const input of open.values()) { try { input.closePort(); } catch {} } open.clear(); },
  };
}
