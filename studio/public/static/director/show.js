// SHOW CONTROL — production: on air now, the editable rundown, graphics, jingles, music,
// talkback with Georgie, instructions and the director's own reminders.
import { $, $$, h, hms, act, toast, segmentTimes, segmentTimer, clock, zonedToday } from '../common.js';

const KINDS = ['TALK', 'MUSIC', 'GUEST', 'VT', 'BREAK', 'AD'];
const LEAD = { andrej: 'Andrej leads', georgie: 'Georgie leads', both: 'Both' };
let openRow = -1, editDirty = false;

export function init(ctx) {
  const rd = (action, extra) => ctx.conn.send({ t: 'rundown', action, ...extra });
  $('#advance').addEventListener('click', e => act(e.currentTarget, () => rd('next')));
  $('#prev').addEventListener('click', e => act(e.currentTarget, () => rd('prev')));
  $('#resetShow').addEventListener('click', e => { if (confirmTwice(e.currentTarget, 'Reset? Click again')) act(e.currentTarget, () => rd('reset'), 'Show clock reset'); });
  $('#reload').addEventListener('click', e => act(e.currentTarget, () => rd('reload'), 'Rundown reloaded from file'));
  $('#roAdd').addEventListener('click', e => act(e.currentTarget, async () => {
    const r = await rd('add', { index: openRow >= 0 ? openRow : null });
    openRow = r.index; editDirty = false;
  }));
  $('#roTitle').addEventListener('change', e => act(null, () => rd('title', { title: e.target.value }), 'Title saved'));

  const note = $('#note');
  note.addEventListener('input', () => { note.dataset.dirty = '1'; });
  const flash = () => { $('#noteSaved').classList.add('show'); setTimeout(() => $('#noteSaved').classList.remove('show'), 1600); };
  $('#noteSend').addEventListener('click', e => act(e.currentTarget, async () => { await ctx.conn.send({ t: 'note', text: note.value }); delete note.dataset.dirty; flash(); }));
  $('#noteClear').addEventListener('click', e => act(e.currentTarget, async () => { note.value = ''; await ctx.conn.send({ t: 'note', text: '' }); delete note.dataset.dirty; flash(); }));

  $('#mSet').addEventListener('click', e => act(e.currentTarget, () => ctx.conn.send({ t: 'music', artist: $('#mArtist').value, title: $('#mTitle').value, label: $('#mLabel').value })));
  $('#mClear').addEventListener('click', e => { for (const id of ['#mArtist', '#mTitle', '#mLabel']) $(id).value = ''; act(e.currentTarget, () => ctx.conn.send({ t: 'music' })); });

  const gfx = (action, extra) => ctx.conn.send({ t: 'gfx', action, ...extra });
  $('#gBug').addEventListener('click', e => act(e.currentTarget, () => gfx('bug', { on: !ctx.S.gfx.bug })));
  $('#gClocks').addEventListener('click', e => act(e.currentTarget, () => gfx('clocks', { on: !ctx.S.gfx.clocks })));
  $('#gIdent').addEventListener('click', e => act(e.currentTarget, () => gfx('ident', { on: !ctx.S.gfx.ident })));
  const lower = on => gfx('lower', { on, title: $('#ltTitle').value, subtitle: $('#ltSub').value, side: $('#ltSide').value });
  $('#ltShow').addEventListener('click', e => { if (!$('#ltTitle').value.trim()) return toast('Type a name for the lower third first', 'bad'); act(e.currentTarget, () => lower(true)); });
  $('#ltHide').addEventListener('click', e => act(e.currentTarget, () => lower(false)));
  $('#gClear').addEventListener('click', e => act(e.currentTarget, () => gfx('clear')));
  $$('#presets button').forEach(b => b.addEventListener('click', () => { $('#ltTitle').value = b.dataset.t; $('#ltSub').value = b.dataset.s; $('#ltSide').value = b.dataset.side; }));

  $('#remForm').addEventListener('submit', e => {
    e.preventDefault();
    const text = $('#remText').value, at = $('#remAt').value;
    act(null, async () => {
      await ctx.conn.send({ t: 'reminder', action: 'add', text, at: at ? zonedToday('Europe/Vienna', at) : null });
      $('#remText').value = ''; $('#remAt').value = '';
    });
  });
}

export function step(ctx, dir) {
  const btn = $(dir > 0 ? '#advance' : '#prev');
  if (!btn.disabled) act(btn, () => ctx.conn.send({ t: 'rundown', action: dir > 0 ? 'next' : 'prev' }));
}

function confirmTwice(btn, label) {
  if (btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = btn.dataset.label; return true; }
  btn.dataset.armed = '1'; btn.dataset.label = btn.textContent; btn.textContent = label;
  setTimeout(() => { if (btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = btn.dataset.label; } }, 3000);
  return false;
}

export function render(ctx) {
  const S = ctx.S, r = S.rundown;
  const badge = $('#roBadge');
  badge.className = 'badge ' + (r.sample ? 'sample' : 'live');
  badge.textContent = r.sample ? 'Sample rundown' : 'Rundown';
  const roT = $('#roTitle'); if (document.activeElement !== roT) roT.value = r.title || '';
  const seg = r.segments[r.index], nxt = r.segments[r.index + 1];
  $('#ident').classList.toggle('idle', !seg);
  $('#segTitle').textContent = seg ? seg.title : 'Show not started';
  $('#segMeta').textContent = seg ? `${String(r.index + 1).padStart(2, '0')} // ${seg.kind} // ${LEAD[seg.lead]} // ${seg.minutes} min` : 'Take the first segment when you go live';
  $('#segNotes').hidden = !seg?.notes;
  $('#segNotes').textContent = seg?.notes || '';
  $('#nextTitle').textContent = nxt ? nxt.title : r.index >= 0 ? 'End of show' : (r.segments[0]?.title || '—');
  $('#nextMeta').textContent = nxt ? `${nxt.minutes} min // ${LEAD[nxt.lead]}` : '';
  $('#advance').firstChild.textContent = r.index < 0 ? 'Start show // first segment ' : nxt ? 'Take next segment ' : 'Last segment ';
  $('#advance').disabled = r.index >= 0 && !nxt;
  $('#prev').disabled = r.index <= 0;
  tick(ctx);
  renderRundown(ctx);
  renderSide(ctx);
}

function renderRundown(ctx) {
  const S = ctx.S, r = S.rundown;
  if ((ctx.focusedIn($('#ro')) || editDirty) || !ctx.differs('ro', [r, openRow])) return;
  const times = segmentTimes(S);
  const rd = (action, extra) => ctx.conn.send({ t: 'rundown', action, ...extra });
  $('#ro').replaceChildren(...r.segments.map((s, i) => {
    const li = h('li', { class: [i < r.index ? 'done' : i === r.index ? 'cur' : i === r.index + 1 ? 'nxt' : '', openRow === i ? 'open' : ''].join(' ') },
      h('button', { type: 'button', class: 'r', 'aria-expanded': String(openRow === i), onclick: () => { openRow = openRow === i ? -1 : i; editDirty = false; renderRundown(ctx); } },
        h('span', { class: 'i', text: String(i + 1).padStart(2, '0') }),
        h('span', { class: 't vie', text: clock('vie', times[i], false) }),
        h('span', { class: 't mel alt', text: clock('mel', times[i], false) }),
        h('span', { class: 'ti', text: s.title }),
        h('span', { class: 'k', text: s.kind }),
        h('span', { class: 'm', text: s.minutes + "'" })));
    if (openRow !== i) return li;

    const f = {
      title: h('input', { class: 'in', maxlength: '80', 'aria-label': 'Segment title' }),
      kind: h('select', { class: 'in', 'aria-label': 'Kind' }, ...[...new Set([...KINDS, s.kind])].map(k => h('option', { value: k, text: k }))),
      minutes: h('input', { class: 'in', type: 'number', min: '0', max: '600', step: '0.5', 'aria-label': 'Minutes' }),
      lead: h('select', { class: 'in', 'aria-label': 'Lead' }, ...Object.entries(LEAD).map(([v, t]) => h('option', { value: v, text: t }))),
      notes: h('textarea', { class: 'in', rows: '3', maxlength: '2000', 'aria-label': 'Notes, also shown to Georgie' }),
    };
    f.title.value = s.title; f.kind.value = s.kind; f.minutes.value = s.minutes; f.lead.value = s.lead; f.notes.value = s.notes;
    for (const el of Object.values(f)) el.addEventListener('input', () => { editDirty = true; });
    const save = () => act(null, async () => {
      await rd('update', { index: i, fields: { title: f.title.value, kind: f.kind.value, minutes: f.minutes.value, lead: f.lead.value, notes: f.notes.value } });
      editDirty = false; ctx.differs('ro', null);
    }, 'Segment saved');
    const del = h('button', { type: 'button', class: 'b sm danger', text: 'Delete' });
    del.addEventListener('click', () => { if (confirmTwice(del, 'Delete? Click again')) act(del, async () => { await rd('remove', { index: i }); openRow = -1; editDirty = false; }); });
    li.append(h('div', { class: 'edit' },
      h('div', { class: 'fields three' }, h('label', { class: 'field' }, h('span', { class: 'label', text: 'Title' }), f.title),
        h('label', { class: 'field' }, h('span', { class: 'label', text: 'Kind' }), f.kind),
        h('label', { class: 'field' }, h('span', { class: 'label', text: 'Minutes' }), f.minutes)),
      h('label', { class: 'field' }, h('span', { class: 'label', text: 'Lead' }), f.lead),
      h('label', { class: 'field' }, h('span', { class: 'label', text: 'Notes (Georgie sees these)' }), f.notes),
      h('div', { class: 'tools' },
        h('button', { type: 'button', class: 'b sm primary', text: 'Save', onclick: save }),
        h('button', { type: 'button', class: 'b sm', text: i === r.index ? 'Restart segment' : 'Take now', onclick: e => act(e.currentTarget, () => rd('go', { index: i })) }),
        h('button', { type: 'button', class: 'b sm quiet', text: '↑', 'aria-label': 'Move up', disabled: i === 0, onclick: e => act(e.currentTarget, async () => { await rd('move', { index: i, to: i - 1 }); openRow = i - 1; editDirty = false; }) }),
        h('button', { type: 'button', class: 'b sm quiet', text: '↓', 'aria-label': 'Move down', disabled: i === r.segments.length - 1, onclick: e => act(e.currentTarget, async () => { await rd('move', { index: i, to: i + 1 }); openRow = i + 1; editDirty = false; }) }),
        h('span', { class: 'grow' }), del)));
    return li;
  }));
  const total = r.segments.reduce((a, s) => a + s.minutes, 0), slot = S.show.schedule.minutes;
  $('#roTotal').replaceChildren(h('span', { text: `${r.segments.length} segments // Vienna and Melbourne times` }),
    h('span', { class: total > slot ? 'bad' : '', text: `${total} of ${slot} min${total > slot ? ' // over the slot' : ''}` }));
}

function renderSide(ctx) {
  const S = ctx.S, o = S.obs;
  /* graphics */
  const g = S.gfx;
  for (const [id, on] of [['#gBug', g.bug], ['#gClocks', g.clocks], ['#gIdent', g.ident]]) { $(id).classList.toggle('on', on); $(id).setAttribute('aria-pressed', String(on)); }
  $('#ltShow').classList.toggle('on', g.lowerThird.visible);
  $('#ltShow').textContent = g.lowerThird.visible ? 'Update' : 'Show';
  const gb = $('#gfxBadge');
  gb.className = 'badge ' + (S.presence.overlay ? 'live' : 'off');
  gb.textContent = S.presence.overlay ? `Overlay live ×${S.presence.overlay}` : 'Overlay not in OBS';
  if (ctx.differs('ltInit', 1)) { $('#ltTitle').value = g.lowerThird.title; $('#ltSub').value = g.lowerThird.subtitle; $('#ltSide').value = g.lowerThird.side; }

  /* jingles */
  const cb = $('#cartBadge'); cb.className = 'badge ' + (o.connected ? 'live' : 'off'); cb.textContent = o.connected ? `${o.media.length} in OBS` : 'Not connected';
  if (ctx.differs('cart', [o.media.map(m => [m.name, m.state, m.duration]), o.connected])) {
    $('#cart').replaceChildren(...(o.media.length ? o.media.map(m => {
      const playing = m.state === 'playing';
      return h('button', { type: 'button', class: 'cartbtn' + (playing ? ' playing' : ''), disabled: !o.connected, dataset: { name: m.name },
        'aria-label': `${m.name}: ${playing ? 'stop' : 'play'}`,
        onclick: e => act(e.currentTarget, () => ctx.obs('media', { input: m.name, media: playing ? 'stop' : 'play' })) },
        h('span', { class: 'nm', text: m.name }),
        h('span', { class: 'st', text: playing ? '■ STOP' : `▶ ${m.duration ? hms(m.duration) : 'PLAY'}` }),
        h('span', { class: 'pr' }));
    }) : [h('p', { class: 'empty', text: o.connected ? 'No media sources in OBS. Add jingles as Media Sources.' : 'OBS not connected' })]));
  }
  for (const btn of $$('#cart .cartbtn')) {
    const m = o.media.find(x => x.name === btn.dataset.name);
    if (m) btn.querySelector('.pr').style.width = m.state === 'playing' && m.duration ? Math.min(100, m.cursor / m.duration * 100) + '%' : '0';
  }

  /* music */
  const m = S.music;
  $('#mNow').textContent = m.title || m.artist ? `On air: ${m.artist}${m.artist && m.title ? ' — ' : ''}${m.title}${m.label ? ' [' + m.label + ']' : ''}` : 'Nothing set';
  if (ctx.differs('musicInit', 1)) { $('#mArtist').value = m.artist; $('#mTitle').value = m.title; $('#mLabel').value = m.label; }
  if (ctx.differs('playlog', S.musicLog)) {
    $('#playlog').replaceChildren(...(S.musicLog.length ? S.musicLog.map(x => h('li', {}, h('time', { text: clock('vie', x.updatedAt, false) }),
      h('span', {}, `${x.artist}${x.artist && x.title ? ' — ' : ''}${x.title}`))) : [h('li', { class: 'empty', text: 'Tracks you set appear here' })]));
  }

  /* talkback + instruction */
  const hb = $('#hostBadge'); hb.className = 'badge ' + (S.presence.host ? 'live' : 'off'); hb.textContent = S.presence.host ? 'Georgie online' : 'Offline';
  const note = $('#note');
  if (document.activeElement !== note && !note.dataset.dirty) note.value = S.note;

  /* reminders */
  if (ctx.differs('rem', [S.reminders, Math.floor(Date.now() / 30000)])) {
    const now = Date.now();
    $('#remList').replaceChildren(...(S.reminders.length ? S.reminders.map(x => {
      const due = !x.done && x.at && x.at - now < 5 * 60e3;
      const cb = h('input', { type: 'checkbox', 'aria-label': 'Done' }); cb.checked = x.done;
      cb.addEventListener('change', () => act(null, () => ctx.conn.send({ t: 'reminder', action: 'toggle', rid: x.id })));
      return h('li', { class: (x.done ? 'done' : '') + (due ? ' due' : '') }, cb,
        h('span', { class: 'tx' }, x.text, x.at ? h('time', { text: `${clock('vie', x.at, false)} Vienna${due && x.at > now ? ' // soon' : due ? ' // due' : ''}` }) : null),
        h('button', { type: 'button', class: 'x', 'aria-label': 'Remove reminder', text: '×', onclick: () => act(null, () => ctx.conn.send({ t: 'reminder', action: 'remove', rid: x.id })) }));
    }) : [h('li', { class: 'empty', text: 'Nothing yet. Add what you must not forget tonight.' })]));
  }
}

/* timers: every 250 ms */
export function tick(ctx) {
  const S = ctx.S, r = S.rundown, t = segmentTimer(S);
  const set = (id, text, cls = '') => { const d = $(id); d.className = cls; d.querySelector('strong').textContent = text; };
  if (!t) { set('#tElapsed', '--:--'); set('#tRemain', '--:--'); set('#tOver', '--:--'); $('#segProgress i').style.width = '0'; return; }
  set('#tElapsed', hms(t.elapsed));
  set('#tRemain', hms(t.remaining), t.remaining < 0 ? 'over' : t.remaining < 60000 ? 'near' : '');
  // planned show time to the end of this segment vs. actual: positive = running late
  const planned = r.segments.slice(0, r.index + 1).reduce((a, s) => a + s.minutes, 0) * 6e4;
  const drift = (Date.now() - r.showStartedAt) - planned + Math.max(0, t.remaining);
  set('#tOver', hms(drift, { sign: true }), drift > 60000 ? 'over' : drift < -60000 ? 'near' : '');
  const p = $('#segProgress');
  p.classList.toggle('over', t.remaining < 0);
  p.firstChild.style.width = (t.ratio * 100).toFixed(2) + '%';
}
