// MIDI controllers in the Virtual Space (Web MIDI: Chromium browsers and Firefox; Safari, on the Mac and the iPhone,
// has none). Each space has its own list of models: at the Piano keyboards, in the DJ Room DJ controllers and mixers
// (never a piano profile). A model is listed only with what is verified about it; anything else is set up by MIDI
// Learn: press LEARN beside an action, then move the control. Learned controls are kept in this browser only, per
// space and device. Nothing is sent anywhere: the page only listens.
//   midi({ space, piano: { noteOn, noteOff }, dj: (action, value) => {} }) → { open(), close(), listen(), state }
// At the Piano every input is heard unless one is chosen: a MiniLab 3 shows several ports (Minilab3 MIDI, DIN THRU,
// MCU/HUI, ALV) and its keys play on one of them only. listen() asks for MIDI from the visitor's click (PLAY PIANO)
//   space(): 'studio' | 'piano' | 'dj' (the space the visitor is in: MIDI works only at the Piano and in the DJ Room)
export const PROFILES = {
  piano: [
    // the keys send notes with velocity on any class-compliant keyboard; the octave buttons shift them on the keyboard
    // itself. Its knobs and faders (CC 74 71 76 77 93 18 19 16, CC 82 83 85 17, factory) have nothing to play at the
    // grand. The port name is matched loosely: the exact name is still to be checked on the device
    { id: 'minilab3', name: 'Arturia MiniLab 3', match: /mini\s*lab\s*(3|iii|mk\s*3)/i, info: 'Keys play the grand with their velocity, the octave buttons on the MiniLab shift them. Sustain pedal: CC 64 (MIDI standard), or learn it below.' },
    { id: 'keyboard', name: 'Other MIDI keyboard', match: null, info: 'Keys play the grand with their velocity. Sustain pedal: CC 64 (MIDI standard), or learn it below.' },
  ],
  dj: [
    // no DJ controller's factory messages are verified yet: each is set up by MIDI Learn
    { id: 'learn', name: 'Other DJ controller or mixer (MIDI Learn)', match: null, info: 'Learn each control once: press LEARN beside an action, then press or move the control on your controller.' },
  ],
};
// what can be learned, per space (jogs: relative, 1–63 forward, 65–127 back; faders and knobs: absolute 0–127)
const ACTIONS = {
  piano: [['sustain', 'Sustain pedal']],
  dj: [
    ['play1', 'Deck 2 · Play'], ['cue1', 'Deck 2 · Cue'], ['jog1', 'Deck 2 · Jog'],
    ['play2', 'Deck 3 · Play'], ['cue2', 'Deck 3 · Cue'], ['jog2', 'Deck 3 · Jog'],
    ...[1, 2].flatMap(c => [[`tempo${c}`, `Deck ${c + 1} · Tempo fader`], ...'abcd'.split('').map(p => [`hot${p}${c}`, `Deck ${c + 1} · Hot cue ${p.toUpperCase()}`]), [`loopin${c}`, `Deck ${c + 1} · Loop in`], [`loopout${c}`, `Deck ${c + 1} · Loop out`]]),
    ['fader1', 'Channel 2 · Fader'], ['fader2', 'Channel 3 · Fader'], ['xfader', 'Crossfader'],
    ...[1, 2].flatMap(c => ['trim', 'hi', 'mid', 'low', 'filter'].map(k => [`${k}${c}`, `Channel ${c + 1} · ${k === 'hi' ? 'High' : k[0].toUpperCase() + k.slice(1)}`])),
  ],
};

export function midi({ space, piano, dj, djAudio }) {
  const supported = typeof navigator !== 'undefined' && !!navigator.requestMIDIAccess;
  let access = null, learning = null, held = new Set(), sustain = false, refused = false;
  // what came in, for the card's diagnostics (clock and active sensing are not counted)
  const heard = { n: 0, last: null, port: '', note: null };
  const sustained = new Set();
  const store = (sp, dev) => `dz-midi:${sp}:${dev || 'any'}`;
  const read = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  // the chosen device and model per space (remembered); the learned controls per space and device
  const conf = sp => read(store(sp, 'conf')) || {};
  const setConf = (sp, c) => write(store(sp, 'conf'), { ...conf(sp), ...c });
  const maps = (sp, dev) => read(store(sp, dev)) || {};

  const card = document.createElement('div'); card.className = 'sp-info sp-midi'; card.hidden = true; card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', 'MIDI');
  document.body.appendChild(card);
  const style = document.createElement('style');
  style.textContent = `.sp-midi .fldm{display:flex;flex-direction:column;gap:4px;margin:0 0 10px;font-size:.7rem;letter-spacing:.08em}
  .sp-midi select{font:inherit;color:#f6f8fb;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.3);border-radius:10px;padding:6px 8px}
  .sp-midi select option{background:#15171c}
  .sp-midi .learn{max-height:38vh;overflow:auto;margin:0 0 8px;padding:0;list-style:none}
  .sp-midi .learn li{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 0;border-top:1px solid rgba(255,255,255,.1);font-size:.72rem}
  .sp-midi .learn small{opacity:.65;margin-left:6px} .sp-midi .learn .b{min-height:30px;padding:0 10px;font-size:.58rem}
  .sp-midi .learn .b[aria-pressed=true]{border-color:var(--acc)}
  .sp-midi .st{font-size:.7rem;opacity:.85}
  .sp-midi .diag{margin:0 0 10px;padding:6px 8px;border:1px solid rgba(255,255,255,.18);border-radius:10px;font-size:.66rem;line-height:1.5}
  .sp-midi .diag b{display:block;font-size:.6rem;letter-spacing:.08em;opacity:.7}`;
  document.head.appendChild(style);

  const inputs = () => (access ? [...access.inputs.values()] : []);
  // the Piano hears every input unless one is chosen ('all', null here); the DJ Room one device (its learned controls)
  const everyInput = sp => sp === 'piano' && (conf(sp).device || 'all') === 'all';
  const deviceOf = sp => { if (everyInput(sp)) return null; const c = conf(sp), all = inputs(); return all.find(i => i.id === c.device) || all.find(i => PROFILES[sp]?.some(p => p.match?.test(i.name))) || all[0] || null; };
  const heardFrom = (sp, port) => (everyInput(sp) ? true : port.id === deviceOf(sp)?.id);
  const profileOf = (sp, dev) => { const list = PROFILES[sp] || [], c = conf(sp), named = dev ? [dev] : inputs();
    return list.find(p => p.id === c.profile) || list.find(p => named.some(i => p.match?.test(i.name))) || list[list.length - 1]; };
  const describe = m => (m ? `${m.t === 'cc' ? 'CC' : 'Note'} ${m.n} · ch ${m.c + 1}` : '—');

  // the diagnostics: whether MIDI is allowed, the inputs, and the last message that came in (updated as it arrives)
  const diag = document.createElement('div'); diag.className = 'diag'; diag.setAttribute('aria-live', 'polite');
  const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  const noteName = n => NAMES[n % 12] + (Math.floor(n / 12) - 1);
  function updDiag() {
    if (space() !== 'piano') return;
    const lines = [['Web MIDI', supported ? 'supported' : 'not in this browser'], ['Access', access ? 'allowed' : refused ? 'blocked' : 'not asked yet']];
    if (access) {
      const ins = inputs();
      lines.push(['Inputs', ins.length ? ins.map(i => `${i.name}${i.state === 'connected' ? '' : ' (' + i.state + ')'}${heardFrom('piano', i) ? '' : ' (not heard)'}`).join(' · ') : 'none']);
      lines.push(['Messages', heard.n ? `${heard.n} · last: ${heard.last} · from ${heard.port}` : 'none yet: press a key']);
      if (heard.note) lines.push(['Grand', heard.note]);
    }
    diag.innerHTML = '<b>DIAGNOSTICS</b>';
    for (const [k, t] of lines) { const d = document.createElement('div'); d.textContent = `${k}: ${t}`; diag.append(d); }
  }
  function describeMsg(data) {
    const [st, d1 = 0, d2 = 0] = data, type = st & 0xf0, ch = (st & 0x0f) + 1;
    const hex = [...data].map(b => b.toString(16).padStart(2, '0')).join(' ');
    const what = type === 0x90 && d2 > 0 ? `Note On ${noteName(d1)} (${d1}) vel ${d2}` : type === 0x80 || type === 0x90 ? `Note Off ${noteName(d1)} (${d1})`
      : type === 0xb0 ? `CC ${d1} = ${d2}${d1 === 64 ? ' (sustain)' : ''}` : type === 0xe0 ? 'Pitch bend' : type === 0xd0 || type === 0xa0 ? 'Aftertouch' : 'Other';
    return `${what} · ch ${ch} · [${hex}]`;
  }

  function render() {
    const sp = space(); card.innerHTML = '';
    const x = document.createElement('button'); x.className = 'x'; x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.textContent = '×'; x.onclick = close; card.append(x);
    const head = document.createElement('b'); head.textContent = sp === 'dj' ? 'MIDI · DJ controller' : 'MIDI · Keyboard'; card.append(head);
    const p = text => { const e = document.createElement('p'); e.textContent = text; card.append(e); return e; };
    if (sp !== 'piano' && sp !== 'dj') { p('MIDI devices play the grand at the Piano and the console in the DJ Room.'); return; }
    if (sp === 'dj' && djAudio) outputsUi();
    if (sp === 'piano') card.append(diag);
    if (!supported) { p('This browser does not support MIDI devices (Web MIDI). Safari, on the Mac and the iPhone, has none; Chromium-based browsers and Firefox do.'); return; }
    if (!access && refused) { p('MIDI is blocked for this page. In Chrome: the icon left of the address → Site settings → MIDI device control → Allow, then reload.'); card.append(btn('Try again', () => connect(true))); return; }
    if (!access) { p('Connect your controller, then allow this page to use MIDI devices. It only listens; nothing is sent.'); const b = btn('Use MIDI devices', () => connect(true)); card.append(b); return; }
    const all = inputs();
    if (!all.length) { p('No MIDI device found. Connect one: it appears here.'); return; }
    const dev = deviceOf(sp), prof = profileOf(sp, dev);
    card.append(select('Device', [...(sp === 'piano' ? [['all', 'All MIDI inputs']] : []), ...all.map(i => [i.id, i.name])], dev?.id || 'all', v => { setConf(sp, { device: v }); render(); }));
    card.append(select(sp === 'dj' ? 'DJ controller or mixer' : 'Keyboard model', PROFILES[sp].map(q => [q.id, q.name]), prof.id, v => { setConf(sp, { profile: v }); render(); }));
    p(prof.info).className = 'st';
    const learned = maps(sp, dev?.name), ul = document.createElement('ul'); ul.className = 'learn';
    for (const [id, label] of ACTIONS[sp]) {
      const li = document.createElement('li'), span = document.createElement('span'); span.textContent = label;
      const sm = document.createElement('small'); sm.textContent = learning === id ? 'move the control…' : describe(Object.values(learned).includes(id) ? keyToMsg(Object.keys(learned).find(k => learned[k] === id)) : null); span.append(sm);
      const lb = btn(learning === id ? 'Cancel' : 'Learn', () => { learning = learning === id ? null : id; render(); }); lb.setAttribute('aria-pressed', String(learning === id));
      li.append(span, lb); ul.append(li);
    }
    card.append(ul);
    card.append(btn('Clear learned controls', () => { write(store(sp, dev?.name), {}); render(); }));
    updDiag();
  }
  // the DJ Room's PHONES (the CUE mix) and BOOTH (the master's send) to other audio outputs of this computer
  let outTok = 0;
  function outputsUi() {
    const box = document.createElement('div'); card.append(box); const tok = ++outTok;
    if (!djAudio.supported) { const e = document.createElement('p'); e.className = 'st'; e.textContent = 'PHONES and BOOTH outputs: this browser cannot send sound to a second output (Safari). Use Chrome or Edge for headphone cueing.'; box.append(e); return; }
    djAudio.list().then(list => {
      if (tok !== outTok) return;
      const opts = [['', 'Off'], ...list.map(o => [o.id, o.label])], cur = djAudio.current;
      for (const [which, label] of [['phones', 'PHONES (CUE) output'], ['booth', 'BOOTH output']])
        box.append(select(label, opts, cur[which], v => djAudio.set(which, v).then(render, () => render())));
    });
  }
  function btn(label, fn) { const b = document.createElement('button'); b.type = 'button'; b.className = 'b'; b.textContent = label; b.onclick = fn; return b; }
  function select(label, opts, value, fn) {
    const l = document.createElement('label'); l.className = 'fldm'; const s = document.createElement('span'); s.textContent = label;
    const sel = document.createElement('select'); for (const [v, t] of opts) { const o = document.createElement('option'); o.value = v; o.textContent = t; o.selected = v === value; sel.append(o); }
    sel.onchange = () => fn(sel.value); l.append(s, sel); return l;
  }
  const msgKey = (t, c, n) => `${t}:${c}:${n}`;
  const keyToMsg = k => { if (!k) return null; const [t, c, n] = k.split(':'); return { t, c: +c, n: +n }; };

  function onMessage(e) {
    const sp = space(); if (sp !== 'piano' && sp !== 'dj') return;
    const port = e.currentTarget || e.target; if (!e.data?.length || e.data[0] >= 0xf8) return;   // (clock, active sensing)
    if (!heardFrom(sp, port)) return;
    const dev = deviceOf(sp); if (!dev && sp !== 'piano') return;
    const [st, d1, d2 = 0] = e.data, type = st & 0xf0, ch = st & 0x0f;
    if (sp === 'piano') { heard.n++; heard.last = describeMsg(e.data); heard.port = port.name; }
    const on = type === 0x90 && d2 > 0, off = type === 0x80 || (type === 0x90 && d2 === 0), cc = type === 0xb0;
    if (learning && (on || cc)) {
      const m = maps(sp, dev?.name); for (const k of Object.keys(m)) if (m[k] === learning) delete m[k];
      m[msgKey(cc ? 'cc' : 'note', ch, d1)] = learning; write(store(sp, dev?.name), m); learning = null; render(); return;
    }
    const act = maps(sp, dev?.name)[msgKey(cc ? 'cc' : 'note', ch, d1)];
    if (sp === 'piano') {
      if (act === 'sustain' || (cc && d1 === 64 && !act)) { pedal(d2 >= 64); heard.note = `sustain ${d2 >= 64 ? 'down' : 'up'}`; return updDiag(); }
      if (act) return updDiag();
      if (on) { held.add(d1); sustained.delete(d1); piano.noteOn(d1, d2 / 127); heard.note = `plays ${noteName(d1)} at velocity ${d2}`; }
      else if (off) { held.delete(d1); if (sustain) sustained.add(d1); else piano.noteOff(d1); heard.note = `releases ${noteName(d1)}${sustain ? ' (held by the pedal)' : ''}`; }
      return updDiag();
    }
    if (!act) return;
    if (/^(play|cue|hot|loop)/.test(act)) { if (on || (cc && d2 > 0)) dj(act, 1); return; }
    if (/^jog/.test(act)) { if (cc) dj(act, d2 < 64 ? d2 : d2 - 128); return; }
    if (cc) dj(act, d2 / 127);
  }
  function pedal(down) {
    sustain = down;
    if (!down) { for (const n of sustained) if (!held.has(n)) piano.noteOff(n); sustained.clear(); }
  }
  function wire() { for (const i of inputs()) i.onmidimessage = onMessage; }
  // a device unplugged with keys down or the pedal held: its notes stop
  function releaseAll() { for (const n of new Set([...held, ...sustained])) piano.noteOff(n); held.clear(); sustained.clear(); sustain = false; }
  let asking = null;
  function connect(ask) {
    if (!supported || access) return Promise.resolve(access);
    return asking ||= navigator.requestMIDIAccess({ sysex: false }).then(a => {
      access = a; refused = false;
      wire();
      // a device plugged in: listened to at once, and the choice of model offered where it can play
      access.onstatechange = e => {
        wire();
        if (e.port.type === 'input' && e.port.state === 'disconnected') releaseAll();
        if (e.port.type === 'input' && e.port.state === 'connected' && ['piano', 'dj'].includes(space())) open(); else if (!card.hidden) render();
      };
      render(); return access;
    }, () => { access = null; refused = true; if (ask) open(); return null; }).finally(() => { asking = null; });
  }
  // from the visitor's click (PLAY PIANO): MIDI is asked for (Chrome shows its prompt once), and the card opens only
  // when something is in the way: blocked, or no device connected
  function listen() {
    if (!supported) return Promise.resolve(null);
    return connect(true).then(a => { if (a && !inputs().length && space() === 'piano') open(); return a; });
  }
  // already allowed earlier: listen from the start (without asking again)
  navigator.permissions?.query?.({ name: 'midi' }).then(s => { if (s.state === 'granted') connect(false); }).catch(() => {});
  function open() { learning = null; render(); card.hidden = false; }
  function close() { learning = null; card.hidden = true; }
  addEventListener('keydown', e => { if (e.key === 'Escape' && !card.hidden) close(); });
  return { open, close, listen, get supported() { return supported; }, get state() { return { access: !!access, refused, inputs: inputs().map(i => i.name), heard: { ...heard } }; } };
}
