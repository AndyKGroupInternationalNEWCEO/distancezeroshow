// SHOW CONTROL — the broadcast: three monitors (CAMERA 01 ANDY'K · PROGRAM · CAMERA 02 GEORGIE), the SHOW CLOCK
// with GO (segment + its linked cues in one deliberate action), the break flow with RETURN TO LIVE, the read-only
// rundown, the LIVE SHOW SCRIPT with teleprompter, and the side panels: audio, video, graphics, talkback, more.
// The script is edited only in REHEARSAL; nothing here changes it.
import { $, $$, h, hms, act, toast, segmentTimes, clock, zonedToday } from '../common.js';
import { createMonitors, createClock, createScript, createBreakMonitors, syncClock, serverNow, cueLine } from '../showpanels.js';
import { showClock, mmss } from '../clock.js';
import { nextSteps, renderSteps } from '../steps.js';
import { createLibrary } from './media.js';
import * as guestPanel from './guest.js';
import * as preshowPanel from './preshow.js';

let mons, clk, script, brk, lib;
const two = n => String(n).padStart(2, '0');

export function init(ctx) {
  mons = createMonitors($('#showMons'));
  clk = createClock($('#showClock'));
  script = createScript($('#liveScript'), { me: "ANDY'K", role: 'director', conn: ctx.conn });
  brk = createBreakMonitors($('#breakMons'), { call: { get phase() { return ctx.call?.phase; }, streams: () => ctx.call?.streams?.(), micOn: () => ctx.call?.micOn?.() }, role: 'director', onReturn: btn => returnToLive(ctx, btn) });
  lib = createLibrary(ctx, { mode: 'show', audioList: $('#jaList'), videoList: $('#vvList'), filter: $('#jaFilter'), catSel: $('#vvCat'), loopBox: $('#vvLoop'),
    audioStop: $('#jaStop'), videoStop: $('#vvStop'), videoPreview: $('#vvPrev'), audioBadge: $('#jaAir'), videoBadge: $('#vvAir') });

  const rd = (action, extra) => ctx.conn.send({ t: 'rundown', action, ...extra });
  $('#goBtn').addEventListener('click', e => go(ctx, e.currentTarget));
  $('#advance').addEventListener('click', e => act(e.currentTarget, () => rd('next')));
  $('#prev').addEventListener('click', e => act(e.currentTarget, () => rd('prev')));
  $('#refire').addEventListener('click', e => act(e.currentTarget, async () => showResult(await ctx.conn.send({ t: 'cue.fire' })), 'Cues fired'));
  $('#resetShow').addEventListener('click', e => { if (confirmTwice(e.currentTarget, 'Reset? Click again')) act(e.currentTarget, () => rd('reset'), 'Show clock reset'); });

  // side panels: one visible at a time, so the workspace never needs scrolling
  const tabs = $$('#sideTabs [role=tab]');
  const pick = p => {
    for (const t of tabs) t.setAttribute('aria-selected', String(t.dataset.p === p));
    for (const el of $$('.sidep')) el.hidden = el.dataset.p !== p;
    if (p === 'talk') $('#dotTalk').hidden = true;
    try { localStorage.setItem('dz-side', p); } catch {}
  };
  tabs.forEach(t => t.addEventListener('click', () => pick(t.dataset.p)));
  let first = 'plan'; try { first = localStorage.getItem('dz-side') || 'plan'; } catch {}
  pick(first);
  ctx.showSide = pick;

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
  $('#gCredits').addEventListener('click', e => act(e.currentTarget, () => gfx('credits', { on: !ctx.S.gfx.credits })));
  $('#gPartner').addEventListener('click', e => act(e.currentTarget, () => gfx('partner'), 'Partner line on air for 10 s'));
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

function showResult(r) {
  const res = r?.result || r || {}, ul = $('#cueResult');
  const rows = [...(res.done || []).map(t => h('li', { class: 'ok', text: t })), ...(res.skipped || []).map(t => h('li', { class: 'warn', text: t }))];
  ul.hidden = !rows.length; ul.replaceChildren(...rows);
}

// GO: the next segment with its cues (scene, video, jingle). Into a break: the microphones are muted first.
// During a break the button is RETURN TO LIVE and needs a second click.
function go(ctx, btn) {
  const S = ctx.S; if (!S) return;
  if (S.brk?.active) return returnToLive(ctx, btn);
  const r = S.rundown, nx = r.segments[r.index + 1];
  if (!nx) return toast('This is the last segment', 'warn');
  act(btn, async () => showResult(await ctx.conn.send({ t: 'cue.go', index: r.index + 1 })));
}
function returnToLive(ctx, btn) {
  if (!confirmTwice(btn, 'CONFIRM: RETURN TO LIVE')) return;
  act(btn, async () => showResult(await ctx.conn.send({ t: 'break.return', confirm: true })), 'Back on air');
}

export function step(ctx, dir) {
  if (dir > 0) return go(ctx, $('#goBtn'));
  const btn = $('#prev');
  if (!btn.disabled) act(btn, () => ctx.conn.send({ t: 'rundown', action: 'prev' }));
}

function confirmTwice(btn, label) {
  if (btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = btn.dataset.label; return true; }
  btn.dataset.armed = '1'; btn.dataset.label = btn.textContent; btn.textContent = label;
  setTimeout(() => { if (btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = btn.dataset.label; } }, 3000);
  return false;
}

export function frame(f) { mons?.frame(f); }
export function guestSnap(m) { mons?.snapshot(m.img, m.at); }

export function render(ctx) {
  const S = ctx.S, r = S.rundown;
  syncClock(S);
  const badge = $('#roBadge');
  badge.className = 'badge ' + (r.sample ? 'sample' : 'live');
  badge.textContent = r.episode?.id || (r.sample ? 'Sample rundown' : 'Rundown');
  const lb = $('#lockBadge');
  lb.textContent = r.locked ? 'SCRIPT LOCKED — READY FOR BROADCAST' : r.lockAt ? `Script locks ${clock('vie', r.lockAt, false)} Vienna` : 'No start time';
  lb.className = 'badge ' + (r.locked ? 'lock' : 'off');
  $('#epLine').textContent = [r.title, r.episode?.date && `${r.episode.date} ${r.episode.start} Vienna`].filter(Boolean).join(' · ');
  const nx = r.segments[r.index + 1], b = S.brk || {};
  const goBtn = $('#goBtn');
  if (!goBtn.dataset.armed) {
    goBtn.firstChild.textContent = b.active ? 'RETURN TO LIVE ' : r.index < 0 ? `GO — START SHOW: 01 ${r.segments[0]?.title || ''} ` : nx ? `GO — ${two(r.index + 2)} ${nx.title} ` : 'LAST SEGMENT ';
  }
  goBtn.classList.toggle('danger', !!b.active); goBtn.classList.toggle('primary', !b.active);
  goBtn.disabled = !b.active && r.index >= 0 && !nx;
  const c = nx?.cues || {};
  $('#goHint').textContent = b.active ? `Returns to ${b.next || 'the next segment'}: scene, microphones on, return jingle. Only when you confirm.`
    : nx ? [cueLine(S, { cues: { ...c, returnJingle: '', returnVideo: '' } }), nx.kind === 'BREAK' && 'Microphones muted for the break.'].filter(Boolean).join('  ·  ') : '';
  $('#prev').disabled = r.index <= 0 || !!b.active;
  $('#advance').disabled = !nx || !!b.active;
  $('#refire').disabled = r.index < 0;
  if (ctx.unread && ctx.ws === 'show' && $('.sidep[data-p=talk]').hidden) $('#dotTalk').hidden = false;
  script.render(S);
  lib.render();
  guestPanel.render(ctx);
  preshowPanel.render(ctx);
  tick(ctx);
  renderRundown(ctx);
  renderSide(ctx);
}

function renderRundown(ctx) {
  const S = ctx.S, r = S.rundown;
  if (!ctx.differs('ro', [r.segments.map(s => [s.id, s.title, s.kind, s.minutes, s.cues]), r.index, r.showStartedAt, S.brk?.active, Math.floor(Date.now() / 30000)])) return;
  const times = segmentTimes(S);
  $('#ro').replaceChildren(...r.segments.map((s, i) => h('li', { class: i < r.index ? 'done' : i === r.index ? 'cur' : i === r.index + 1 ? 'nxt' : '' },
    h('span', { class: 'r' },
      h('span', { class: 'i', text: two(i + 1) }),
      h('span', { class: 't vie', text: clock('vie', times[i], false) }),
      h('span', { class: 't mel alt', text: clock('mel', times[i], false) }),
      h('span', { class: 'ti', text: s.title }),
      h('span', { class: 'k', text: s.kind }),
      h('span', { class: 'm', text: s.minutes + "'" }),
      i !== r.index && !S.brk?.active ? h('button', { type: 'button', class: 'b xs quiet', text: 'GO', title: 'Jump to this segment and fire its cues (click twice)', onclick: e => {
        if (confirmTwice(e.currentTarget, 'GO?')) act(e.currentTarget, async () => showResult(await ctx.conn.send({ t: 'cue.go', index: i })));
      } }) : null),
    cueLine(S, s) ? h('span', { class: 'cueline', text: cueLine(S, s) }) : null)));
  const total = r.segments.reduce((a, s) => a + s.minutes, 0);
  $('#roTotal').replaceChildren(h('span', { text: `${r.segments.length} segments · Vienna / Melbourne` }), h('span', { text: `${total} min` }));
}

function renderSide(ctx) {
  const S = ctx.S, o = S.obs;
  /* graphics */
  const g = S.gfx;
  for (const [id, on] of [['#gBug', g.bug], ['#gClocks', g.clocks], ['#gIdent', g.ident], ['#gCredits', !!g.credits], ['#gPartner', !!g.partner]]) { $(id).classList.toggle('on', on); $(id).setAttribute('aria-pressed', String(on)); }
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
  const S = ctx.S;
  clk.tick(S); brk.tick(S); mons.update(S);
  // 1 · 2 · 3 and the one button to press now blinks (GO, RETURN TO LIVE, ADMIT GUEST or TAKE GUEST ON AIR)
  const st = nextSteps(S, 'director', serverNow());
  renderSteps($('#dSteps'), st);
  $('#goBtn').classList.toggle('due', st.due === 'go' || st.due === 'return');
  for (const b of $$('#gsBody [data-step]')) b.classList.toggle('due', b.dataset.step === st.due);
  $('#sideTabs [data-p=guest]').classList.toggle('due', st.due === 'admit' || st.due === 'onair');
}
