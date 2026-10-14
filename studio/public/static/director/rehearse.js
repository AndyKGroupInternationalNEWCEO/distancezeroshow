// REHEARSAL — private run-through with Georgie: big start/end control, a PASS/WARNING/FAILED board,
// the guided pre-show check, the call, headphones, Georgie's link, recovery instructions, timeline, reports.
// Starting or ending a rehearsal never touches OBS; the server keeps stream and recording locked meanwhile.
import { $, h, act, toast, clock, countdown, nextShow, hms } from '../common.js';
import { testDevices, playTone } from '../checks.js';
import * as scripted from './scripted.js';
import { createLibrary, stopPreview } from './media.js';

let rlib = null;

const WORD = { pass: 'PASS', warn: 'WARNING', fail: 'FAILED', untested: 'NOT TESTED', running: 'CHECKING' };
const CHECKS = [
  ['obs', 'OBS connection', 'auto'], ['director', 'Director Studio connection', 'auto'], ['host', 'Host Dashboard connection', 'auto'],
  ['tunnel', 'Georgie\'s public link', 'auto'], ['camera', 'Camera permission', 'person'], ['mic', 'Microphone permission', 'person'],
  ['playback', 'Audio playback', 'person'], ['call', 'Private call connectivity', 'call'], ['screen', 'Screen sharing', 'call'],
  ['help', 'HELP notification test', 'help'], ['safety', 'Broadcast safety', 'auto'],
];
let busyDevices = false, toneAsk = false;

export function init(ctx) {
  // sub-views: run-through & checks · script editor · media library (preview only, never on air)
  const tabs = [...document.querySelectorAll('#rhTabs [role=tab]')];
  const pick = p => {
    for (const t of tabs) t.setAttribute('aria-selected', String(t.dataset.rp === p));
    for (const el of document.querySelectorAll('.rhp')) el.hidden = el.dataset.rp !== p;
    if (p !== 'media') stopPreview();
    try { localStorage.setItem('dz-rh', p); } catch {}
  };
  tabs.forEach(t => t.addEventListener('click', () => pick(t.dataset.rp)));
  let first = 'run'; try { first = localStorage.getItem('dz-rh') || 'run'; } catch {}
  pick(first);
  ctx.rehearsePick = pick;
  scripted.init(ctx);
  rlib = createLibrary(ctx, { mode: 'rehearse', audioList: $('#rmAudio'), videoList: $('#rmVideo'), filter: $('#rmFilter'), catSel: $('#rmCat'),
    audioStop: $('#rmStop'), videoStop: $('#rmVStop'), videoPreview: $('#rmPrev') });
  const send = (t, extra) => ctx.conn.send({ t, ...extra });
  $('#rhToggle').addEventListener('click', e => {
    const on = ctx.S?.rehearsal?.active;
    if (on && !confirmTwice(e.currentTarget, 'End & write report?')) return;
    act(e.currentTarget, async () => {
      const r = await send(on ? 'rehearsal.end' : 'rehearsal.start');
      if (on && r?.id) toast('Rehearsal ended. Report ready below.', 'ok');
    });
  });
  $('#rhAuto').addEventListener('click', e => act(e.currentTarget, () => send('rehearsal.check', { check: 'auto' })));
  $('#rhAsk').addEventListener('click', e => act(e.currentTarget, () => send('rehearsal.ask', { items: ['camera', 'playback', 'help'] }), 'Georgie sees the check steps on her screen'));
  $('#rhCall').addEventListener('click', () => ctx.callStart());
  $('#rhMyPhones').addEventListener('change', e => act(null, () => send('rehearsal.headphones', { on: e.target.checked })));
  $('#rhCopy').addEventListener('click', e => act(e.currentTarget, async () => {
    const { link, up } = await send('tunnel.link');
    try { await navigator.clipboard.writeText(link); $('#rhCopied').textContent = up ? 'Copied. Paste it into Signal or iMessage for Georgie.' : 'Copied, but the link is not answering yet.'; }
    catch { $('#rhCopied').textContent = 'Copy blocked by the browser. Use the link the launcher put on your clipboard.'; }
    setTimeout(() => { $('#rhCopied').textContent = ''; }, 8000);
  }));
}

function confirmTwice(btn, label) {
  if (btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = btn.dataset.label; return true; }
  btn.dataset.armed = '1'; btn.dataset.label = btn.textContent; btn.textContent = label;
  setTimeout(() => { if (btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = btn.dataset.label; } }, 3500);
  return false;
}

/* Andrej's own device checks, run in this browser */
async function myDevices(ctx, btn) {
  if (busyDevices) return;
  busyDevices = true;
  btn.textContent = 'Say something…';
  try {
    const r = await testDevices({ ms: 7000 });
    await ctx.conn.send({ t: 'check.result', check: 'camera', ok: r.camera.ok, detail: r.camera.detail });
    await ctx.conn.send({ t: 'check.result', check: 'mic', ok: r.mic.ok, detail: r.mic.detail });
    toast(`Camera ${r.camera.ok ? 'OK' : 'failed'} · Microphone ${r.mic.ok ? 'OK' : 'failed'}`, r.camera.ok && r.mic.ok ? 'ok' : 'bad');
  } catch (e) { toast(e.message, 'bad'); }
  finally { busyDevices = false; render(ctx); }
}
async function myTone(ctx) {
  await playTone();
  toneAsk = true; render(ctx, true);
}

export function render(ctx, force = false) {
  scripted.render(ctx); rlib?.render();
  const S = ctx.S, R = S.rehearsal || { active: false };
  const on = !!R.active;
  $('#dotRehearse').hidden = !on;
  $('#tab-rehearse').classList.toggle('live', on);
  $('#rhHero').classList.toggle('on', on);
  $('#rhTitle').textContent = on ? 'Rehearsal running' : 'Ready when you are';
  $('#rhSub').textContent = on ? 'Nothing goes on air. YouTube stream and OBS recording are locked until you end the rehearsal.'
    : 'Nothing goes on air. While the rehearsal runs, the YouTube stream and OBS recording are locked.';
  const btn = $('#rhToggle');
  if (!btn.dataset.armed) btn.textContent = on ? 'End rehearsal' : 'Start rehearsal';
  btn.classList.toggle('end', on);
  tick(ctx);

  /* ---------- board ---------- */
  const o = S.obs, link = ctx.link.state === 'open', hs = S.hostStatus, ch = R.checks || {};
  const hostIn = S.presence.host;
  const tile = (name, status, detail) => h('div', { class: 'tile ' + status }, h('span', { class: 'label', text: name }), h('strong', { text: WORD[status] }), h('span', { class: 'td', text: detail }));
  const part = (c, who) => c?.parts?.[who];
  const devH = [part(ch.camera, 'host'), part(ch.mic, 'host')];
  const tiles = [
    ['Vienna', !link ? 'fail' : !o.connected ? 'warn' : 'pass', !link ? 'Studio server not reachable' : o.connected ? `Studio and OBS connected · ${o.stats.fps.toFixed(0)} fps` : 'Studio OK · OBS offline (fine for a rehearsal)'],
    ['Melbourne', !hostIn ? 'fail' : (hs?.rtt || 0) > 1500 || S.tunnel?.running && !S.tunnel.up ? 'warn' : 'pass',
      !hostIn ? 'Georgie is offline' : `Georgie online${hs?.rtt ? ' · ' + hs.rtt + ' ms' : ''}${S.tunnel?.running ? (S.tunnel.up ? ' · public link up' : ' · public link DOWN') : ''}`],
    ['Georgie camera & mic', !on ? 'untested' : devH.some(p => p && !p.ok) ? 'fail' : devH.every(p => p?.ok) ? 'pass' : devH.some(Boolean) ? 'warn' : 'untested',
      !on ? 'Start the rehearsal to check' : devH.every(p => p?.ok) ? `${devH[0].detail} · ${devH[1].detail}` : devH.some(p => p && !p.ok) ? devH.filter(p => p && !p.ok).map(p => p.detail).join(' · ') : 'Ask Georgie to run her check'],
    ['Private call', S.call?.phase === 'active' ? (ch.call?.status === 'pass' ? 'pass' : 'warn') : on ? ch.call?.status || 'untested' : 'untested',
      S.call?.phase === 'active' ? (S.call.route ? `In call · ${S.call.route}` : 'In call, measuring…') : ch.call?.detail || 'Not tested yet'],
    ['HELP system', (S.help || []).some(x => x.status === 'open') ? 'warn' : on ? ch.help?.status || 'untested' : 'untested',
      (S.help || []).filter(x => x.status === 'open').length ? `${(S.help || []).filter(x => x.status === 'open').length} request(s) waiting for Seen` : ch.help?.detail || 'Not tested yet'],
    ['Broadcast safety', o.stream.active ? 'fail' : on ? (ch.safety?.status === 'untested' ? 'running' : ch.safety?.status) : (o.connected ? 'pass' : 'warn'),
      o.stream.active ? 'STREAM IS LIVE' : on ? ch.safety?.detail || 'Locked' : o.connected ? 'Not streaming. Lock starts with the rehearsal.' : 'OBS offline: nothing can stream'],
  ];
  if (force || ctx.differs('rhBoard', tiles)) $('#rhBoard').replaceChildren(...tiles.map(t => tile(...t)));

  /* ---------- checklist ---------- */
  const rows = CHECKS.map(([id, name, how]) => {
    const c = ch[id] || { status: 'untested', detail: '' };
    const actions = [];
    const b = (label, fn, cls = 'b sm') => h('button', { type: 'button', class: cls, text: label, disabled: !on, onclick: e => fn(e.currentTarget) });
    if (how === 'auto') actions.push(b('Check', btn => act(btn, () => ctx.conn.send({ t: 'rehearsal.check', check: id }))));
    if (id === 'camera' || id === 'mic') {
      actions.push(b(busyDevices ? 'Listening…' : 'Test mine', btn => myDevices(ctx, btn)));
      actions.push(b('Ask Georgie', btn => act(btn, () => ctx.conn.send({ t: 'rehearsal.ask', items: ['camera'] }), 'Asked Georgie'), 'b sm quiet'));
    }
    if (id === 'playback') {
      if (toneAsk) actions.push(h('span', { class: 'ask' }, 'Heard the tone? ',
        b('Yes', () => { toneAsk = false; act(null, () => ctx.conn.send({ t: 'check.result', check: 'playback', ok: true, detail: 'tone heard' })); }),
        b('No', () => { toneAsk = false; act(null, () => ctx.conn.send({ t: 'check.result', check: 'playback', ok: false, detail: 'tone NOT heard' })); }, 'b sm danger')));
      else actions.push(b('Play tone here', () => myTone(ctx)));
      actions.push(b('Ask Georgie', btn => act(btn, () => ctx.conn.send({ t: 'rehearsal.ask', items: ['playback'] }), 'Asked Georgie'), 'b sm quiet'));
    }
    if (id === 'call') actions.push(b(S.call ? 'In call' : 'Call Georgie', () => ctx.callStart()));
    if (id === 'screen') actions.push(b('Ask Georgie', btn => act(btn, () => ctx.conn.send({ t: 'rehearsal.ask', items: ['screen'] }), 'Asked Georgie'), 'b sm quiet'));
    if (id === 'help') actions.push(b('Ask Georgie', btn => act(btn, () => ctx.conn.send({ t: 'rehearsal.ask', items: ['help'] }), 'Asked Georgie'), 'b sm quiet'));
    return [id, name, c, actions];
  });
  const key = [ch, on, busyDevices, toneAsk, !!S.call];
  if (force || ctx.differs('rhChecks', key)) {
    $('#rhChecks').replaceChildren(...rows.map(([id, name, c, actions]) => h('li', { class: 'ck ' + c.status },
      h('span', { class: 'pill', text: WORD[c.status] || c.status }),
      h('div', { class: 'ck-t' }, h('strong', { text: name }), h('span', { text: c.detail || (on ? hint(id) : 'Start the rehearsal to run this check') })),
      h('time', { text: c.at ? clock('vie', c.at, false) : '' }),
      h('div', { class: 'ck-a' }, ...actions))));
    const done = Object.values(ch).filter(c => c.status === 'pass').length;
    $('#rhScore').textContent = on ? `${done} of ${CHECKS.length} passed` : '';
  }
  $('#rhAuto').disabled = $('#rhAsk').disabled = !on;
  $('#rhAsk').disabled = !on || !hostIn;

  /* ---------- call, headphones, link ---------- */
  const callB = $('#rhCallBadge');
  callB.className = 'badge ' + (S.call?.phase === 'active' ? 'live' : S.call ? 'manual' : 'off');
  callB.textContent = S.call?.phase === 'active' ? 'In call' : S.call ? 'Ringing' : hostIn ? 'Georgie online' : 'Georgie offline';
  $('#rhCall').disabled = !hostIn && !S.call;
  $('#rhCall').textContent = S.call ? 'Show call' : 'Call Georgie';
  $('#rhCallLine').textContent = S.call?.phase === 'active' && S.call.directorStats ? `Connected · ${S.call.route} · ${S.call.directorStats.rtt} ms · ${S.call.directorStats.fps} fps` : 'Private video call, browser to browser. Nothing goes into OBS.';
  const mine = $('#rhMyPhones'); mine.disabled = !on; if (document.activeElement !== mine) mine.checked = !!R.headphones;
  const her = $('#rhHerPhones'); const herOk = hs?.headphones && Date.now() - hs.at < 6 * 3600e3;
  her.className = 'light ' + (herOk ? 'ok' : 'warn'); her.textContent = herOk ? 'Georgie: headphones on' : 'Georgie: not confirmed';

  const t = S.tunnel, lb = $('#rhLinkBadge');
  lb.className = 'badge ' + (!t?.running ? 'off' : t.up ? 'live' : 'bad');
  lb.textContent = !t?.running ? 'Not running' : t.up ? 'Online' : 'Not answering';
  $('#rhLinkLine').textContent = !t?.running ? 'No public link. Start the studio with the launcher ("Start DISTANCE ZERO Studio", or npm run studio) to give Georgie a link.'
    : t.up ? `Answers from the internet in ${t.ms} ms, checked ${clock('vie', t.checkedAt, false)}.${t.restarts ? ` Restarted ${t.restarts}×: make sure Georgie has the newest link.` : ''}`
    : `Not answering: ${t.error}. The launcher restarts it by itself; then copy the NEW link for Georgie.`;
  $('#rhCopy').disabled = !t?.running;

  /* ---------- recovery: plain instructions for whatever is wrong right now ---------- */
  const steps = [];
  if (!link) steps.push(['Vienna studio not reachable', ['Is the launcher window ("DISTANCE // ZERO studio") still open? If not, double-click "Start DISTANCE ZERO Studio" again.', 'This page reconnects by itself. Georgie\'s page waits and reconnects too.', 'OBS is not affected.']]);
  if (!hostIn) steps.push(['Georgie is offline', ['Her page reconnects by itself within seconds when her internet returns.', 'Still offline after 30 s: phone or message her. Ask her to reload the page, or open the link again.', t?.running && !t.up ? 'Her public link is down too: see below.' : 'Check her public link status below.']]);
  if (t?.running && !t.up) steps.push(['Georgie\'s public link is down', ['The launcher restarts the link by itself (watch the launcher window).', 'When it is back, press "Copy Georgie\'s link" and send her the NEW link: the old address stops working after a restart.']]);
  if (!t?.running && on) steps.push(['No public link running', ['For Melbourne, start the studio with the launcher (it starts the link too), or run "npm run tunnel" in a second Terminal window.']]);
  if (!o.connected && on) steps.push(['OBS offline', ['Fine for a rehearsal: calls, HELP and checks work without OBS.', 'To include OBS: open it. The studio connects by itself and changes nothing in OBS.']]);
  const drop = (R.timeline || []).filter(e => e.kind === 'call-drop').at(-1);
  if (drop && Date.now() - drop.ts < 120000 && !S.call) steps.push(['The private call dropped', ['Press "Call Georgie" again.', 'If it fails twice, use the talkback chat and VDO.Ninja for video, and note it for the report.']]);
  const rec = $('#rhRecover');
  rec.hidden = !steps.length;
  if (force || ctx.differs('rhRecover', steps)) $('#rhRecoverBody').replaceChildren(...steps.map(([title, list]) => h('div', { class: 'rstep' }, h('strong', { text: title }), h('ol', {}, ...list.map(x => h('li', { text: x }))))));

  /* ---------- timeline + reports ---------- */
  if (ctx.differs('rhTl', R.timeline)) $('#rhTimeline').replaceChildren(...(R.timeline?.length ? [...R.timeline].reverse().map(e => h('li', {}, h('time', { text: clock('vie', e.ts) }), h('span', { class: e.level, text: e.text })))
    : [h('li', {}, h('span', { class: 'ok', text: on ? 'Nothing yet.' : 'The timeline starts with the rehearsal.' }))]));
  if (ctx.differs('rhReports', S.reports)) $('#rhReports').replaceChildren(...(S.reports?.length ? S.reports.map(r => h('li', {},
    h('div', {}, h('strong', { text: new Date(r.startedAt).toLocaleString('en-GB', { timeZone: 'Europe/Vienna', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }),
      h('span', { class: 'hint', text: ` · ${hms(r.endedAt - r.startedAt)} · ${r.summary.passed}/${r.summary.checks} passed · ${r.summary.interruptions} interruptions · ${r.summary.help} HELP · ${r.summary.outstanding} open` })),
    h('a', { class: 'b sm', href: `/reports/${r.id}.html`, download: '', text: 'Download' }),
    h('a', { class: 'b sm quiet', href: `/reports/${r.id}.json`, download: '', text: 'JSON' })))
    : [h('li', { class: 'empty', text: 'Reports appear here when a rehearsal ends.' })]));
}

function hint(id) {
  return { obs: 'Press Check', director: 'Press Check', host: 'Georgie needs her dashboard open', tunnel: 'Only needed for Melbourne', camera: 'Test yours here; ask Georgie for hers',
    mic: 'Speak during the test', playback: 'Each of you plays a tone and confirms hearing it', call: 'Start a call: verified when audio/video flows both ways',
    screen: 'During the call, press Share screen: verified when the other side receives it', help: 'Georgie sends a test HELP; you press Seen', safety: 'Press Check' }[id];
}

export function tick(ctx) {
  const S = ctx.S, R = S?.rehearsal;
  if (!S) return;
  $('#rhTimer').textContent = R?.active ? hms(Date.now() - R.startedAt) : '--:--';
  const at = nextShow(S.show);
  $('#rhShowLabel').textContent = Date.now() < at ? `Show starts in · ${clock('vie', at, false)} Vienna` : 'Show slot';
  $('#rhCountdown').textContent = Date.now() < at ? countdown(at - Date.now()) : 'NOW';
}
