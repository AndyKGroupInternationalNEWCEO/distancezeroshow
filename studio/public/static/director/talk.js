// Director side of talking to Georgie: the private call, HELP requests (banner in every workspace,
// alert sounds by level), and guided assistance pushed to her screen.
import { $, $$, h, act, toast, clock } from '../common.js';
import { createCall } from '../call.js';

const LEVEL = { normal: 'Normal', urgent: 'Urgent', critical: 'Critical' };
const ORDER = { critical: 0, urgent: 1, normal: 2 };
let call, alarm = 0, heard = new Set();

export function init(ctx) {
  call = createCall(ctx.conn, 'director', { getState: () => ctx.S });
  call.onPhase(p => {
    for (const b of [$('#callBtn'), $('#callBtn2')]) {
      b.textContent = p === 'idle' ? 'Call Georgie' : p === 'active' ? 'In call' : p === 'ringing-in' ? 'Georgie calling' : 'Calling…';
      b.classList.toggle('on', p !== 'idle');
    }
  });
  const start = () => call.start().catch(e => toast(e.message, 'bad'));
  $('#callBtn').addEventListener('click', start);
  $('#callBtn2').addEventListener('click', start);
  ctx.callStart = start;

  ctx.conn.on('help.new', ({ item, repeat }) => {
    if (!repeat || item.level !== 'normal') chime(item.level);
    if (!repeat) toast(`HELP ${LEVEL[item.level]}: ${item.text || item.kind}`, item.level === 'normal' ? '' : 'bad');
  });

  $('#guideSend').addEventListener('click', e => {
    const guide = $('#guideSel').value, text = $('#guideText').value;
    act(e.currentTarget, async () => { await ctx.conn.send({ t: 'assist', guide, text }); $('#guideText').value = ''; }, 'Guide sent to Georgie');
  });
}

/* sounds: a soft chime for normal, two for urgent, a repeating alarm for critical until someone presses Seen */
function chime(level) {
  try {
    const ac = chime.ac ||= new AudioContext();
    const notes = level === 'critical' ? [880, 660, 880, 660] : level === 'urgent' ? [740, 740] : [620];
    notes.forEach((f, i) => {
      const t = ac.currentTime + i * 0.22, o = ac.createOscillator(), g = ac.createGain();
      o.type = level === 'critical' ? 'square' : 'sine'; o.frequency.value = f; o.connect(g); g.connect(ac.destination);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(level === 'critical' ? 0.08 : 0.12, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.start(t); o.stop(t + 0.22);
    });
  } catch {}
}

const age = t => { const s = Math.floor((Date.now() - t) / 1000); return s < 60 ? s + ' s ago' : Math.floor(s / 60) + ' min ago'; };
function diagLine(d = {}) {
  const yes = v => (v ? '✓' : '✗');
  const parts = [];
  if (d.browser) parts.push(d.browser);
  if (d.linkMs) parts.push(`link ${d.linkMs} ms`);
  if ('camera' in d) parts.push(`cam ${yes(d.camera)}`);
  if ('mic' in d) parts.push(`mic ${yes(d.mic)}`);
  if ('vdo' in d) parts.push(`VDO ${yes(d.vdo)}`);
  if (d.network) parts.push(`${d.network}${d.downlinkMbps ? ' ' + d.downlinkMbps + ' Mb/s' : ''}`);
  if (d.reconnects) parts.push(`${d.reconnects} reconnects`);
  if (d.error) parts.push(`error ${d.error}`);
  if (d.inCall && d.inCall !== 'idle') parts.push(`call ${d.inCall}`);
  return parts.join(' · ');
}

export function render(ctx) {
  const S = ctx.S;
  for (const b of [$('#callBtn'), $('#callBtn2')]) b.disabled = !S.presence.host && call.phase === 'idle';

  const open = (S.help || []).filter(x => x.status !== 'resolved').sort((a, b) => ORDER[a.level] - ORDER[b.level] || b.at - a.at);
  const send = (t, hid) => act(null, () => ctx.conn.send({ t, hid }));

  /* banner above every workspace */
  const bar = $('#helpBar');
  if (ctx.differs('helpbar', [open, Math.floor(Date.now() / 15000)])) {
    bar.replaceChildren(...open.slice(0, 3).map(x => h('div', { class: `hb ${x.level} ${x.status}` },
      h('span', { class: 'lv', text: (x.auto ? 'AUTO ' : '') + LEVEL[x.level].toUpperCase() }),
      h('div', { class: 'tx' }, h('strong', { text: x.text || x.kind }), h('span', { text: `${x.by === 'studio' ? 'Studio' : 'Georgie'} · ${age(x.at)}${x.count > 1 ? ' · ×' + x.count : ''}${x.status === 'ack' ? ' · seen' : ''}${diagLine(x.diag) ? ' · ' + diagLine(x.diag) : ''}` })),
      x.status === 'open' ? h('button', { type: 'button', class: 'b sm', text: 'Seen', onclick: () => send('help.ack', x.hid) }) : null,
      h('button', { type: 'button', class: 'b sm', text: 'Call', disabled: !S.presence.host || call.phase !== 'idle', onclick: () => ctx.callStart() }),
      h('button', { type: 'button', class: 'b sm', text: 'Guide', onclick: () => { location.hash = 'show'; $('#guideSel').focus(); } }),
      h('button', { type: 'button', class: 'b sm quiet', text: 'Resolved', onclick: () => send('help.resolve', x.hid) }))),
    open.length > 3 ? h('div', { class: 'hb more', text: `+ ${open.length - 3} more in Show Control` }) : '');
  }

  /* critical: keep sounding until acknowledged */
  const ringing = open.some(x => x.level === 'critical' && x.status === 'open');
  if (ringing && !alarm) alarm = setInterval(() => chime('critical'), 4000);
  if (!ringing && alarm) { clearInterval(alarm); alarm = 0; }
  // a request that was already open when this window opened still makes one sound
  for (const x of open) if (!heard.has(x.hid)) { heard.add(x.hid); if (x.status === 'open' && Date.now() - x.at > 3000) chime(x.level); }

  /* history in Show Control */
  if (ctx.differs('helplist', [S.help, Math.floor(Date.now() / 30000)])) {
    const list = (S.help || []).slice(0, 8);
    $('#helpList').replaceChildren(...(list.length ? list.map(x => h('li', { class: `${x.level} ${x.status}` },
      h('span', { class: 'lv', text: LEVEL[x.level] }),
      h('span', { class: 'tx' }, x.text || x.kind, h('small', { text: `${clock('vie', x.at, false)} · ${x.auto ? 'automatic · ' : ''}${x.status === 'resolved' ? (x.note || 'resolved') : x.status === 'ack' ? 'seen' : 'open'}` })),
      x.status !== 'resolved' ? h('button', { type: 'button', class: 'b sm quiet', text: 'Resolved', onclick: () => send('help.resolve', x.hid) }) : null))
      : [h('li', { class: 'empty', text: 'No help requests. Georgie has a HELP button on her dashboard.' })]));
  }
}
