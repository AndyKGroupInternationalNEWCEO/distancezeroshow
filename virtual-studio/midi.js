// MIDI controllers in the Virtual Space (Web MIDI: Chromium browsers and Firefox; Safari, on the Mac and the iPhone,
// has none). Each space has its own list of models: at the Piano keyboards, in the DJ Room DJ controllers and mixers
// (never a piano profile). A model is listed only with what is verified about it; anything else is set up by MIDI
// Learn: press LEARN beside an action, then move the control. Learned controls are kept in this browser only, per
// space and device. Nothing is sent anywhere: the page only listens.
//   midi({ space, piano: { noteOn, noteOff }, dj: (action, value) => {} }) → { open(), close() }
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

export function midi({ space, piano, dj }) {
  const supported = typeof navigator !== 'undefined' && !!navigator.requestMIDIAccess;
  let access = null, learning = null, held = new Set(), sustain = false;
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
  .sp-midi .st{font-size:.7rem;opacity:.85}`;
  document.head.appendChild(style);

  const inputs = () => (access ? [...access.inputs.values()] : []);
  const deviceOf = sp => { const c = conf(sp), all = inputs(); return all.find(i => i.id === c.device) || all.find(i => PROFILES[sp]?.some(p => p.match?.test(i.name))) || all[0] || null; };
  const profileOf = (sp, dev) => { const list = PROFILES[sp] || [], c = conf(sp); return list.find(p => p.id === c.profile) || (dev && list.find(p => p.match?.test(dev.name))) || list[list.length - 1]; };
  const describe = m => (m ? `${m.t === 'cc' ? 'CC' : 'Note'} ${m.n} · ch ${m.c + 1}` : '—');

  function render() {
    const sp = space(); card.innerHTML = '';
    const x = document.createElement('button'); x.className = 'x'; x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.textContent = '×'; x.onclick = close; card.append(x);
    const head = document.createElement('b'); head.textContent = sp === 'dj' ? 'MIDI · DJ controller' : 'MIDI · Keyboard'; card.append(head);
    const p = text => { const e = document.createElement('p'); e.textContent = text; card.append(e); return e; };
    if (sp !== 'piano' && sp !== 'dj') { p('MIDI devices play the grand at the Piano and the console in the DJ Room.'); return; }
    if (!supported) { p('This browser does not support MIDI devices (Web MIDI). Safari, on the Mac and the iPhone, has none; Chromium-based browsers and Firefox do.'); return; }
    if (!access) { p('Connect your controller, then allow this page to use MIDI devices. It only listens; nothing is sent.'); const b = btn('Use MIDI devices', () => connect(true)); card.append(b); return; }
    const all = inputs();
    if (!all.length) { p('No MIDI device found. Connect one: it appears here.'); return; }
    const dev = deviceOf(sp), prof = profileOf(sp, dev);
    card.append(select('Device', all.map(i => [i.id, i.name]), dev?.id, v => { setConf(sp, { device: v }); render(); }));
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
    const dev = deviceOf(sp); if (!dev || e.target.id !== dev.id) return;
    const [st, d1, d2 = 0] = e.data, type = st & 0xf0, ch = st & 0x0f;
    const on = type === 0x90 && d2 > 0, off = type === 0x80 || (type === 0x90 && d2 === 0), cc = type === 0xb0;
    if (learning && (on || cc)) {
      const m = maps(sp, dev.name); for (const k of Object.keys(m)) if (m[k] === learning) delete m[k];
      m[msgKey(cc ? 'cc' : 'note', ch, d1)] = learning; write(store(sp, dev.name), m); learning = null; render(); return;
    }
    const act = maps(sp, dev.name)[msgKey(cc ? 'cc' : 'note', ch, d1)];
    if (sp === 'piano') {
      if (act === 'sustain' || (cc && d1 === 64 && !act)) return pedal(d2 >= 64);
      if (act) return;
      if (on) { held.add(d1); sustained.delete(d1); piano.noteOn(d1, d2 / 127); }
      else if (off) { held.delete(d1); if (sustain) sustained.add(d1); else piano.noteOff(d1); }
      return;
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
  async function connect(ask) {
    if (!supported || access) return;
    try {
      access = await navigator.requestMIDIAccess({ sysex: false });
      wire();
      // a device plugged in: listened to at once, and the choice of model offered where it can play
      access.onstatechange = e => { wire(); if (e.port.type === 'input' && e.port.state === 'connected' && ['piano', 'dj'].includes(space())) open(); else if (!card.hidden) render(); };
    } catch { access = null; if (ask) { render(); card.querySelector('p').textContent = 'MIDI was not allowed for this page. It can be allowed in the browser\'s site settings.'; } return; }
    render();
  }
  // already allowed earlier: listen from the start (without asking again)
  navigator.permissions?.query?.({ name: 'midi' }).then(s => { if (s.state === 'granted') connect(false); }).catch(() => {});
  function open() { learning = null; render(); card.hidden = false; }
  function close() { learning = null; card.hidden = true; }
  addEventListener('keydown', e => { if (e.key === 'Escape' && !card.hidden) close(); });
  return { open, close, get supported() { return supported; } };
}
