// SOUND FX (Show Control → Audio): one pad per effect, each with its own volume, and one STOP. Pressed by hand only;
// they play through the OBS FX Player, so they never cut the jingle or the video. Missing files show NOT AVAILABLE.
import { $, h, act } from '../common.js';

let sig = '';
export function init(ctx) {
  $('#fxStop').addEventListener('click', e => act(e.currentTarget, () => ctx.conn.send({ t: 'fx.stop' }), 'Sound FX stopped'));
}

export function render(ctx) {
  const S = ctx.S, list = S.media?.fx || [], on = S.mediaAir?.fx;
  const badge = $('#fxAir');
  badge.textContent = !S.obs.connected ? 'OBS NOT CONNECTED' : on ? `ON AIR ${on.id}` : 'Ready';
  badge.className = 'badge ' + (on ? 'live' : 'off');
  const s = JSON.stringify([list, on?.id, S.obs.connected, S.fxVol, S.showId]);
  if (s === sig || ctx.focusedIn($('#fxPads'))) return; sig = s;
  $('#fxPads').replaceChildren(...list.map(x => {
    const vol = S.fxVol?.[x.id] ?? 80;
    const range = h('input', { type: 'range', min: '0', max: '100', step: '5', 'aria-label': `${x.title} volume` }); range.value = vol;
    const pct = h('span', { class: 'fxv num', text: vol + ' %' });
    range.addEventListener('input', () => { pct.textContent = range.value + ' %'; });
    range.addEventListener('change', () => { act(null, () => ctx.conn.send({ t: 'fx.volume', fx: x.id, volume: Number(range.value) })); range.blur(); });
    return h('div', { class: 'fxpad' + (on?.id === x.id ? ' air' : '') + (x.forShow ? '' : ' other') },
      h('button', { type: 'button', class: 'b fxbtn', disabled: !x.available || !S.obs.connected, title: x.available ? 'Play on air' : `No file yet: add it to shared-assets/jingles/FX`,
        onclick: e => act(e.currentTarget, () => ctx.conn.send({ t: 'fx.play', fx: x.id })) },
        h('b', { text: x.title }), h('small', { text: x.available ? `${x.id}${x.duration ? ' · ' + x.duration + ' s' : ''}` : `${x.id} · NOT AVAILABLE` })),
      h('div', { class: 'fxvol' }, range, pct));
  }));
}
