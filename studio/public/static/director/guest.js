// GUEST // THIRD SEAT (Show Control). One private link per guest. ADMIT GUEST and TAKE GUEST ON AIR are two separate
// actions: admitted, the guest sends into OBS but the "VDO // Guest" seat stays hidden and muted; only TAKE GUEST ON AIR
// (two clicks) shows and unmutes it. The guest never gets Director controls, scripts, credentials or break talk.
import { $, h, act, toast, fill, clock } from '../common.js';

let lastLink = null, sig = '';
const send = (ctx, t, extra) => ctx.conn.send({ t, ...extra });
function confirmTwice(btn, label) {
  if (btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = btn.dataset.label; return true; }
  btn.dataset.armed = '1'; btn.dataset.label = btn.textContent; btn.textContent = label;
  setTimeout(() => { if (btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = btn.dataset.label; } }, 3000);
  return false;
}
async function copy(text) { try { await navigator.clipboard.writeText(text); toast('Guest link copied. Send it privately (Signal, iMessage, email).', 'ok'); } catch { toast('Copy blocked by the browser: select the link and copy it.', 'warn'); } }

export function render(ctx) {
  const S = ctx.S, g = S.guest, a = (S.obs.audio || []).find(x => x.name === 'VDO // Guest');
  const s = JSON.stringify([g, a?.muted, S.obs.connected, !!lastLink, S.obs.scenes?.length, S.showId, S.brk?.active]);
  if (s === sig || ctx.focusedIn($('#gsBody'))) return; sig = s;
  const badge = $('#gsBadge');
  const word = { invited: 'INVITED', waiting: 'WAITING ROOM', backstage: 'BACKSTAGE — NOT ON AIR', onair: 'ON AIR' };
  badge.textContent = g ? word[g.status] || g.status : 'No guest';
  badge.className = 'badge ' + (!g ? 'off' : g.status === 'onair' ? 'bad' : g.status === 'backstage' ? 'live' : 'untested');
  $('#dotGuest').hidden = !(g && g.online && ['invited', 'waiting'].includes(g.status));
  const seat = (S.obs.scenes || []).some(x => (x.name || x) === 'GUEST');
  const b = (text, cls, fn, extra = {}) => h('button', { type: 'button', class: 'b sm ' + cls, text, onclick: fn, ...extra });
  if (!g) {
    lastLink = null;
    const name = h('input', { class: 'in', maxlength: '60', placeholder: 'Guest name', 'aria-label': 'Guest name' });
    fill($('#gsBody'),
      seat ? null : h('p', { class: 'warn', text: 'This OBS show has no GUEST scene (Friday has no guest seat).' }),
      h('div', { class: 'row' }, name, b('Invite guest', 'primary', e => act(e.currentTarget, async () => {
        const r = await send(ctx, 'guest.invite', { name: name.value });
        const res = r.result || r; lastLink = res.link || null;
        if (res.link) copy(res.link); else toast('Invitation created, but Georgie\'s public link is not running: start it to send the guest a link.', 'warn');
        sig = '';
      }))),
      h('p', { class: 'hint mt', text: 'One private link, valid 24 hours, no account needed. The guest waits in a waiting room until you admit them.' }));
    return;
  }
  const muted = a ? a.muted : null;
  fill($('#gsBody'),
    h('div', { class: 'gs-who' }, h('strong', { text: g.name }), h('span', { class: 'hint', text: g.online ? 'online' : 'not connected' }),
      h('span', { class: 'hint', text: `link valid until ${clock('vie', g.expiresAt, false)} Vienna` })),
    lastLink ? h('div', { class: 'row mt' }, h('input', { class: 'in sm grow', value: lastLink, readonly: true, 'aria-label': 'Guest link' }), b('Copy', 'quiet', () => copy(lastLink))) : null,
    h('ul', { class: 'gs-checks' },
      h('li', { class: g.check?.camera ? 'ok' : '', text: `Camera: ${g.check?.camera ? 'working' : 'not checked'}` }),
      h('li', { class: g.check?.mic ? 'ok' : '', text: `Microphone: ${g.check?.mic ? 'heard' : 'not checked'}` }),
      h('li', { class: muted === false ? (g.status === 'onair' ? 'air' : 'bad') : 'ok', text: muted == null ? 'OBS guest seat: not found (run obs-setup --players)' : `Guest sound in OBS: ${muted ? 'OFF (muted)' : 'ON'}` })),
    h('div', { class: 'gs-steps' },
      h('div', { class: 'gs-step' + (['invited', 'waiting'].includes(g.status) ? '' : ' done') }, h('span', { class: 'label', text: '1 · Preview' }), h('p', { class: 'hint', text: 'Still preview on the GUEST monitor, if the guest shares it.' })),
      h('div', { class: 'gs-step' + (['invited', 'waiting'].includes(g.status) ? ' cur' : g.status === 'onair' || g.status === 'backstage' ? ' done' : '') }, h('span', { class: 'label', text: '2 · Admit backstage' }),
        ['invited', 'waiting'].includes(g.status) ? b('ADMIT GUEST', 'primary', e => act(e.currentTarget, () => send(ctx, 'guest.admit'), 'Guest admitted backstage — not on air'), { disabled: !g.online }) : null,
        g.status === 'backstage' ? b('Back to waiting room', 'quiet', e => act(e.currentTarget, () => send(ctx, 'guest.waiting'))) : null),
      h('div', { class: 'gs-step' + (['backstage', 'onair'].includes(g.status) ? ' cur' : '') }, h('span', { class: 'label', text: '3 · On air' }),
        g.status === 'onair' ? b('TAKE GUEST OFF AIR', 'danger', e => act(e.currentTarget, () => send(ctx, 'guest.offair'), 'Guest off air'))
          : b('TAKE GUEST ON AIR', 'danger', e => { if (confirmTwice(e.currentTarget, 'CONFIRM: GUEST ON AIR')) act(e.currentTarget, () => send(ctx, 'guest.onair', { confirm: true }), 'Guest on air'); },
            { disabled: g.status !== 'backstage' || !!S.brk?.active || !seat, title: g.status !== 'backstage' ? 'Admit the guest first' : '' }))),
    // why a step is not available, in words
    (() => { const why = ['invited', 'waiting'].includes(g.status) && !g.online ? `ADMIT waits for ${g.name} to open the link.`
      : g.status !== 'backstage' && g.status !== 'onair' ? 'TAKE GUEST ON AIR needs ADMIT first.'
      : S.brk?.active ? 'TAKE GUEST ON AIR is off during a break: return to live first.'
      : !seat ? 'This OBS show has no GUEST scene.' : muted == null ? 'OBS has no guest seat yet: run obs-setup --players.' : '';
      return why ? h('p', { class: 'why', text: why }) : null; })(),
    h('p', { class: 'hint mt', text: 'On air shows and unmutes the guest seat in the GUEST scene. Cut to GUEST with GO or Live Control.' }),
    h('div', { class: 'row mt' }, h('span', { class: 'grow' }),
      b('End invitation', 'quiet', e => { if (confirmTwice(e.currentTarget, 'End? Click again')) act(e.currentTarget, async () => { await send(ctx, 'guest.end'); lastLink = null; }, 'Invitation ended'); })));
}
