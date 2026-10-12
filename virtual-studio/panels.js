// The Virtual Space's panels: the music station (soundtrack, piano, DJ Andy'K) and the real broadcast schedule.
// Static content only; outgoing links open the official sites in a new tab.
import { NOTES, GENRES, progressions, voicing } from './chords.js';
import { SHOW, upcoming, onAirNow } from './schedule.js';

const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'text') el.textContent = v;
    else if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...kids.flat().filter(k => k !== null && k !== undefined && k !== false));
  return el;
};
const ext = (href, text, cls = 'plink') => h('a', { href, target: '_blank', rel: 'noopener', class: cls, text: text + ' ↗' });
const mmss = s => (isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '–:––');

/* DJ Andy'K: a curated selection, linked to the official site (no audio copied here) */
const ANDYK = 'https://www.djandykofficial.com';
const RELEASES = [
  { title: 'This Is Trance, Hear the Call', genre: 'Trance · feat. Aria Noir', note: 'A trance anthem built around one unpolished rehearsal take, in three interpretations.', path: '/this-is-trance-hear-the-call' },
  { title: 'Opus No. 1: Vienna', genre: 'Fortepiano · Orchestra · Progressive Trance', note: 'Four movements composed in Vienna: fortepiano and orchestra turned into progressive trance.', path: '/opus-no-1-vienna' },
  { title: 'Zwischenlandung', genre: 'Trance · feat. Robert Zigller', note: 'A German-language trance single about a brief airport encounter, including a piano version.', path: '/zwischenlandung' },
  { title: 'Euphoria Needs No Story', genre: 'Trance', note: 'Ten tracks, four voices, one continuous trance journey.', path: '/euphoria-needs-no-story' },
  { title: 'THE ALBUM — From Me, To…', genre: 'Six Trance Ballads', note: 'Six personal letters transformed into trance.', path: '/six-trance-ballads' },
  { title: 'Wavelength Traces', genre: 'Trance', note: 'Some connections fade. Their traces stay.', path: '/wavelength-traces' },
  { title: 'Human Stories', genre: 'House · Progressive House', note: 'A house album with emotional depth; four tracks also as piano versions.', path: '/human-stories' },
  { title: 'Until the Lights Come On', genre: 'ft. Livia Benttner', note: 'Letting someone close again, without asking one night to answer everything.', path: '/until-the-lights-come-on' },
];

// computer keyboard → semitone offset from the lowest key on screen (two octaves, tracker layout)
const KEYMAP = { z: 0, s: 1, x: 2, d: 3, c: 4, v: 5, g: 6, b: 7, h: 8, n: 9, j: 10, m: 11, q: 12, 2: 13, w: 14, 3: 15, e: 16, r: 17, 5: 18, t: 19, 6: 20, y: 21, 7: 22, u: 23, i: 24 };
const LABEL = Object.fromEntries(Object.entries(KEYMAP).map(([k, v]) => [v, k.toUpperCase()]));

export function createPanels({ sound, el, onMusicStart }) {
  const { panel, title, tabs, body, close, musicBtn, liveBtn } = el;
  let current = null, tab = 'soundtrack', timer = 0, base = 48; // C3
  const pressed = new Set();

  function open(which, wantTab) {
    current = which;
    if (wantTab) tab = wantTab;
    panel.hidden = false;
    document.body.classList.add('panel-open');
    musicBtn.setAttribute('aria-expanded', String(which === 'station'));
    liveBtn.setAttribute('aria-expanded', String(which === 'schedule'));
    render();
    close.focus({ preventScroll: true });
  }
  function hide() {
    current = null; panel.hidden = true; document.body.classList.remove('panel-open');
    document.body.dataset.piano = 'off';
    musicBtn.setAttribute('aria-expanded', 'false'); liveBtn.setAttribute('aria-expanded', 'false');
    clearInterval(timer);
    for (const m of pressed) sound.noteOff(m); pressed.clear();
  }
  close.addEventListener('click', hide);
  addEventListener('keydown', e => { if (e.key === 'Escape' && current) hide(); });
  musicBtn.addEventListener('click', () => (current === 'station' ? hide() : open('station')));
  liveBtn.addEventListener('click', () => (current === 'schedule' ? hide() : open('schedule')));

  function render() {
    clearInterval(timer);
    document.body.dataset.piano = current === 'station' && tab === 'piano' ? 'on' : 'off';
    if (current === 'station') {
      title.textContent = 'Music station';
      tabs.hidden = false;
      tabs.replaceChildren(...[['soundtrack', 'Soundtrack'], ['piano', 'Piano'], ['andyk', "DJ Andy'K"]].map(([id, label]) =>
        h('button', { type: 'button', role: 'tab', class: 'tab', 'aria-selected': String(tab === id), text: label, onclick: () => { tab = id; render(); } })));
      body.replaceChildren(tab === 'soundtrack' ? soundtrack() : tab === 'piano' ? piano() : andyk());
    } else {
      title.textContent = 'Broadcast schedule';
      tabs.hidden = true;
      body.replaceChildren(schedule());
      timer = setInterval(() => { if (current === 'schedule') body.replaceChildren(schedule()); }, 1000);
    }
  }

  /* ---------- soundtrack ---------- */
  function soundtrack() {
    const now = h('div', { class: 'now' }), list = h('ol', { class: 'tracks' });
    const bar = h('input', { type: 'range', min: 0, max: 1000, value: 0, class: 'seek', 'aria-label': 'Position in the track', oninput: e => sound.seek(e.target.value / 1000) });
    const play = h('button', { type: 'button', class: 'pbtn main', onclick: () => sound.toggle().then(started).catch(() => {}) });
    const prev = h('button', { type: 'button', class: 'pbtn', 'aria-label': 'Previous track', text: '⏮', onclick: () => sound.prev().then(started).catch(() => {}) });
    const next = h('button', { type: 'button', class: 'pbtn', 'aria-label': 'Next track', text: '⏭', onclick: () => sound.next().then(started).catch(() => {}) });
    const name = h('b'), time = h('span', { class: 'mono' }), err = h('p', { class: 'perr', role: 'alert' });
    let group = '';
    sound.tracks.forEach((t, i) => {
      if (t.group !== group) { group = t.group; list.append(h('li', { class: 'grp', text: group })); }
      list.append(h('li', {}, h('button', { type: 'button', class: 'trk', 'data-i': i, onclick: () => sound.play(i).then(started).catch(() => {}) },
        h('span', { text: t.title }), h('span', { class: 'mono', text: t.len }))));
    });
    const update = s => {
      const t = sound.tracks[s.index];
      name.textContent = t ? t.title : 'Press play to start the soundtrack';
      time.textContent = t ? `${mmss(s.time)} / ${mmss(s.duration)}` : '';
      bar.value = s.duration ? Math.round((s.time / s.duration) * 1000) : 0; bar.disabled = !t;
      play.textContent = s.playing ? '❚❚' : '▶'; play.setAttribute('aria-label', s.playing ? 'Pause' : 'Play');
      list.querySelectorAll('.trk').forEach(b => b.classList.toggle('cur', +b.dataset.i === s.index));
      err.textContent = s.failed;
    };
    const off = sound.onChange(update); update(sound.state);
    const root = h('div', { class: 'pane' },
      h('p', { class: 'pnote', text: 'The soundtrack of DISTANCE // ZERO, streamed from distancezeroshow.com. The studio lights follow the music.' }),
      now, list);
    now.append(name, time, bar, h('div', { class: 'ctl' }, prev, play, next), err);
    new MutationObserver((_, obs) => { if (!root.isConnected) { off(); obs.disconnect(); } }).observe(body, { childList: true });
    return root;
  }
  function started() { onMusicStart?.(); }

  /* ---------- piano ---------- */
  function piano() {
    const keys = h('div', { class: 'keys', role: 'group', 'aria-label': 'Piano keyboard, two octaves' });
    const whites = [], blacks = [];
    for (let s = 0; s < 25; s++) {
      const pc = (base + s) % 12, black = [1, 3, 6, 8, 10].includes(pc), midi = base + s;
      const k = h('button', { type: 'button', class: 'key ' + (black ? 'black' : 'white'), 'data-m': midi, 'aria-label': NOTES[pc] + Math.floor(midi / 12 - 1) },
        h('span', { class: 'lab', text: LABEL[s] || '' }));
      (black ? blacks : whites).push([k, s]);
    }
    whites.forEach(([k]) => keys.append(k));
    const W = whites.length;
    blacks.forEach(([k, s]) => { const left = whites.filter(([, ws]) => ws < s).length; k.style.left = `calc(${(left / W) * 100}% - ${(0.62 / W) * 50}%)`; k.style.width = `${(0.62 / W) * 100}%`; keys.append(k); });
    const down = m => { if (pressed.has(m)) return; pressed.add(m); sound.noteOn(m, 0.78); mark(m, true); };
    const up = m => { if (!pressed.has(m)) return; pressed.delete(m); sound.noteOff(m); mark(m, false); };
    const mark = (m, on) => keys.querySelector(`[data-m="${m}"]`)?.classList.toggle('down', on);
    let dragging = false;
    keys.addEventListener('pointerdown', e => { const k = e.target.closest('.key'); if (!k) return; e.preventDefault(); dragging = true; keys.setPointerCapture?.(e.pointerId); down(+k.dataset.m); });
    keys.addEventListener('pointermove', e => {
      if (!dragging) return;
      const k = document.elementFromPoint(e.clientX, e.clientY)?.closest('.key'); const m = k ? +k.dataset.m : null;
      for (const p of [...pressed]) if (p !== m) up(p);
      if (m !== null) down(m);
    });
    const release = () => { dragging = false; for (const p of [...pressed]) up(p); };
    keys.addEventListener('pointerup', release); keys.addEventListener('pointercancel', release); keys.addEventListener('lostpointercapture', release);
    keys.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.key')) { e.preventDefault(); const m = +e.target.closest('.key').dataset.m; down(m); setTimeout(() => up(m), 300); } });

    const oct = h('div', { class: 'oct' },
      h('button', { type: 'button', class: 'pbtn sm', text: '− Octave', disabled: base <= 24, onclick: () => { base -= 12; render(); } }),
      h('span', { class: 'mono', text: `${NOTES[base % 12]}${base / 12 - 1} – ${NOTES[(base + 24) % 12]}${(base + 24) / 12 - 1}` }),
      h('button', { type: 'button', class: 'pbtn sm', text: 'Octave +', disabled: base >= 72, onclick: () => { base += 12; render(); } }));

    // chords, from the Music Lab logic
    const st = piano.chords ||= { key: 'A', mode: 'minor', genre: 'trance' };
    const sel = (label, value, options, set) => h('label', { class: 'fld' }, h('span', { text: label }),
      h('select', { onchange: e => { set(e.target.value); render(); } }, ...options.map(([v, t]) => h('option', { value: v, selected: v === value, text: t }))));
    const rows = progressions(st.key, st.mode, st.genre).map(row => h('div', { class: 'prog' }, ...row.map(c =>
      h('button', { type: 'button', class: 'chip', title: c.notes.join(' · '), onclick: () => {
        const v = voicing(c); sound.chord(v); v.forEach(m => mark(m, true)); setTimeout(() => v.forEach(m => mark(m, false)), 900);
      } }, h('b', { text: c.name }), h('span', { text: c.roman })))));

    return h('div', { class: 'pane' },
      h('p', { class: 'pnote', text: 'Play with the mouse or a finger, or on your keyboard: Z to M is the lower octave, Q to U the upper one. The studio lights listen.' }),
      keys, oct,
      h('div', { class: 'chords' },
        h('div', { class: 'row3' },
          sel('Key', st.key, NOTES.map(n => [n, n]), v => { st.key = v; }),
          sel('Mode', st.mode, [['major', 'Major'], ['minor', 'Minor']], v => { st.mode = v; }),
          sel('Feel', st.genre, GENRES.map(g => [g, g[0].toUpperCase() + g.slice(1)]), v => { st.genre = v; })),
        ...rows,
        h('p', { class: 'pnote sm' }, 'Progressions from ', ext('https://lab.djandykofficial.com/chord-generator', "Andy'K Music Lab"))));
  }
  // computer keyboard, only while the piano tab is open
  const typing = t => /input|select|textarea/i.test(t.tagName);
  addEventListener('keydown', e => {
    if (document.body.dataset.piano !== 'on' || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
    const s = KEYMAP[e.key.toLowerCase()]; if (s === undefined) return;
    e.preventDefault(); if (e.repeat) return;
    const m = base + s; if (pressed.has(m)) return; pressed.add(m); sound.noteOn(m, 0.8);
    body.querySelector(`[data-m="${m}"]`)?.classList.add('down');
  });
  addEventListener('keyup', e => {
    const s = KEYMAP[e.key.toLowerCase()]; if (s === undefined) return;
    const m = base + s; if (!pressed.has(m)) return; pressed.delete(m); sound.noteOff(m);
    body.querySelector(`[data-m="${m}"]`)?.classList.remove('down');
  });

  /* ---------- DJ Andy'K ---------- */
  function andyk() {
    return h('div', { class: 'pane' },
      h('p', { class: 'pnote' }, h('b', { text: "DJ Andy'K" }), ' is Andrej Kneisl, producer and DJ from Vienna and co-host of DISTANCE // ZERO with Georgie Walker in Melbourne. A selection of his releases:'),
      h('ul', { class: 'rel' }, ...RELEASES.map(r => h('li', {},
        h('a', { href: ANDYK + r.path, target: '_blank', rel: 'noopener', class: 'relcard' },
          h('b', { text: r.title }), h('span', { class: 'g', text: r.genre }), h('span', { class: 'n', text: r.note }), h('span', { class: 'go', text: 'Listen on djandykofficial.com ↗' }))))),
      h('p', { class: 'pnote sm' }, ext(ANDYK, "All music by DJ Andy'K")));
  }

  /* ---------- the real schedule ---------- */
  function schedule() {
    const now = Date.now(), live = onAirNow(now), next = upcoming(now, 3);
    const fmt = (t, tz, o) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, ...o }).format(new Date(t));
    const day = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }, hm = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
    const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const when = t => h('div', { class: 'when' },
      h('div', {}, h('span', { class: 'city v', text: 'Vienna' }), h('span', { text: `${fmt(t, 'Europe/Vienna', day)} · ${fmt(t, 'Europe/Vienna', hm)}` })),
      h('div', {}, h('span', { class: 'city m', text: 'Melbourne' }), h('span', { text: `${fmt(t, 'Australia/Melbourne', day)} · ${fmt(t, 'Australia/Melbourne', hm)}` })),
      here !== 'Europe/Vienna' && here !== 'Australia/Melbourne' ? h('div', {}, h('span', { class: 'city', text: 'Your time' }), h('span', { text: `${fmt(t, here, day)} · ${fmt(t, here, hm)}` })) : null);
    const d = Math.max(0, next[0] - now);
    const count = live ? null : h('p', { class: 'cdown mono', role: 'timer', text: `${Math.floor(d / 864e5)} d  ${String(Math.floor(d / 36e5) % 24).padStart(2, '0')} h  ${String(Math.floor(d / 6e4) % 60).padStart(2, '0')} m  ${String(Math.floor(d / 1e3) % 60).padStart(2, '0')} s` });
    return h('div', { class: 'pane' },
      live
        ? h('div', { class: 'real on' }, h('p', { class: 'badge', text: 'On air now · the real show' }), h('p', { text: 'DISTANCE // ZERO is broadcasting right now. Watch it on the official live page.' }), ext(SHOW.livePage, 'Watch the real show', 'pbtn main wide'))
        : h('div', { class: 'real' }, h('p', { class: 'badge', text: next[0] === new Date(SHOW.launch).getTime() ? 'First real show' : 'Next real show' }), when(next[0]), count),
      h('p', { class: 'grp', text: 'After that' }), ...next.slice(1, 3).map(when),
      h('p', { class: 'pnote' }, 'Then every third Sunday of the month, 10:00 Vienna, 120 minutes.'),
      h('div', { class: 'ctl left' }, ext(SHOW.livePage, 'Official live page', 'pbtn'), h('a', { href: SHOW.calendar, class: 'pbtn', text: '+ Add to calendar' })),
      h('div', { class: 'simnote' }, h('b', { text: 'Not the same thing: ' }), '“Simulate on air” in this studio plays a full-screen simulation on this page. It is a simulation, not the show, and nothing is broadcast.'));
  }

  return { open, close: hide, get current() { return current; } };
}
