// Calm notification cards (top right): one short line per event, merged when repeated, silent unless the
// studio marks it critical. Info disappears after a few seconds; critical stays until dismissed.
import { h } from './common.js';

const TITLE = {
  'host-up': 'Georgie connected', 'host-down': 'Georgie disconnected', 'director-up': 'Vienna connected', 'director-down': 'Vienna reconnecting',
  'call-start': 'Private call', 'call-end': 'Private call', 'call-drop': 'Call dropped', help: 'HELP', 'obs-up': 'OBS', 'obs-down': 'OBS',
  'tunnel-up': 'Public link', 'tunnel-down': 'Public link', device: 'Camera / microphone', playback: 'Audio playback', safety: 'Broadcast safety',
  rehearsal: 'Rehearsal', link: 'Connection',
};
const LIFE = { info: 5000, ok: 5000, warn: 9000, critical: 0 };

export function notifier() {
  const box = h('div', { class: 'notes', 'aria-live': 'polite', 'aria-label': 'Notifications' });
  document.body.append(box);
  const open = new Map();
  function beep() {
    try {
      const ac = beep.ac ||= new AudioContext();
      [660, 523].forEach((f, i) => {
        const t = ac.currentTime + i * 0.18, o = ac.createOscillator(), g = ac.createGain();
        o.frequency.value = f; o.connect(g); g.connect(ac.destination);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.1, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
        o.start(t); o.stop(t + 0.18);
      });
    } catch {}
  }
  function show({ level = 'info', kind = '', title, text, actions = [], sound = false, key }) {
    key ||= kind + '|' + text;
    const prev = open.get(key);
    if (prev) { prev.count++; prev.countEl.textContent = '×' + prev.count; prev.restart(); return; } // its own timer, not this call's
    const countEl = h('span', { class: 'n-count' });
    const card = h('div', { class: 'note ' + level, role: level === 'critical' ? 'alert' : 'status' },
      h('div', { class: 'n-head' }, h('span', { class: 'n-title', text: title || TITLE[kind] || 'Studio' }), countEl,
        h('time', { text: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) }),
        h('button', { type: 'button', class: 'n-x', 'aria-label': 'Dismiss', text: '×', onclick: () => close() })),
      h('p', { text }),
      actions.length ? h('div', { class: 'n-actions' }, ...actions.map(a => h('button', { type: 'button', class: 'b sm', text: a.label, onclick: () => { a.fn(); close(); } }))) : null);
    const entry = { card, count: 1, countEl, timer: 0 };
    function close() { clearTimeout(entry.timer); open.delete(key); card.classList.add('out'); setTimeout(() => card.remove(), 250); }
    entry.restart = () => { clearTimeout(entry.timer); if (LIFE[level]) entry.timer = setTimeout(close, LIFE[level] + (actions.length ? 6000 : 0)); };
    entry.close = close;
    open.set(key, entry);
    box.prepend(card);
    while (box.children.length > 4) box.lastChild.remove();
    entry.restart();
    if (sound) beep();
    return entry;
  }
  return { show };
}
