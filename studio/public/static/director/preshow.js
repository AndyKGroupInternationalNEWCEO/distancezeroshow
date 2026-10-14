// PRE-SHOW (Show Control → Video). The Virtual Space page as a clean OBS picture in the PRE-SHOW scene: each button
// loads its address into the "Virtual Space" browser source, reloads it and puts PRE-SHOW on program (two clicks).
// LIVE 3D counts down to the episode's start; VIDEO is the finished 90 s opening that ends on the D//0 logo.
import { $, h, act, fill, clock } from '../common.js';

let sig = '';
function confirmTwice(btn, label) {
  if (btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = btn.dataset.label; return true; }
  btn.dataset.armed = '1'; btn.dataset.label = btn.textContent; btn.textContent = label;
  setTimeout(() => { if (btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = btn.dataset.label; } }, 3000);
  return false;
}

export function render(ctx) {
  const S = ctx.S, at = S.rundown?.episode?.startAt || 0;
  const scene = (S.obs.scenes || []).some(x => (x.name || x) === 'PRE-SHOW');
  const s = JSON.stringify([scene, S.obs.connected, S.obs.program, at, S.brk?.active]);
  if (s === sig) return; sig = s;
  const badge = $('#psBadge');
  badge.textContent = S.obs.program === 'PRE-SHOW' ? 'ON PROGRAM' : scene ? 'Ready' : 'No PRE-SHOW scene';
  badge.className = 'badge ' + (S.obs.program === 'PRE-SHOW' ? 'bad' : scene ? 'live' : 'off');
  const off = !scene || !S.obs.connected || !!S.brk?.active;
  const b = (text, mode, title) => h('button', { type: 'button', class: 'b primary', text, title, disabled: off,
    onclick: e => { if (confirmTwice(e.currentTarget, 'CONFIRM: PRE-SHOW ON PROGRAM')) act(e.currentTarget, () => ctx.conn.send({ t: 'preshow', mode, confirm: true }), 'PRE-SHOW on program'); } });
  const why = !S.obs.connected ? 'OBS is not connected.' : !scene ? 'This OBS show has no PRE-SHOW scene: run obs-setup -- sunday --preshow.'
    : S.brk?.active ? 'PRE-SHOW is off during a break: return to live first.' : '';
  fill($('#psBody'),
    h('div', { class: 'row' },
      b('Live 3D studio', 'live', 'The real-time Virtual Space studio. Heavy for this Mac: if it stutters, use Play video.'),
      b('Play video', 'video', 'The finished 90 s opening with sound')),
    why ? h('p', { class: 'why', text: why }) : null,
    h('p', { class: 'hint mt', text: at > Date.now()
      ? `Live 3D counts down to the episode start, ${clock('vie', at, false)} Vienna: the opening starts exactly then.`
      : 'Live 3D without a countdown (the episode has no start time ahead).' }),
    h('p', { class: 'hint', text: 'Video: cut to the cameras on the D//0 logo at 88.5–90 s. Live 3D: cut when it feels right. Use the stinger through the logo.' }));
}
