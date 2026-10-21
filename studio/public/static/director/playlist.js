// PLAYLIST (Show Control → Playlist): the show's album with PLAY / PAUSE / STOP / NEXT, TALK (mic open, music under
// the voice) and each track's Song Information for the host. Saturday adds the Vienna Piano Stage: its segments
// (opening → piano theme → live, between songs, closing), cameras P1–P5 and lighting. Everything shown is what the
// players report (OBS, the stage page), never what was last pressed.
import { $, h, act, fill, hms } from '../common.js';

let sig = '', open = null;
const two = n => String(n).padStart(2, '0');
const send = (ctx, m, ok) => btn => act(btn, () => ctx.conn.send(m), ok);

export function init(ctx) {
  $('#plBody').addEventListener('click', e => {
    const b = e.target.closest('[data-pl]'); if (!b) return;
    const S = ctx.S, P = S.playlist; if (!P) return;
    const a = b.dataset.pl, i = b.dataset.i != null ? Number(b.dataset.i) : undefined;
    if (a === 'info') { open = open === i ? null : i; sig = ''; return render(ctx); }
    if (a === 'talk') return send(ctx, { t: 'playlist', action: 'talk', on: !P.talk }, P.talk ? 'Mic closed, music back up' : 'Mic open, music under the voice')(b);
    if (a === 'continuous') return send(ctx, { t: 'playlist', action: 'continuous', on: !P.continuous })(b);
    if (a === 'stage') return send(ctx, { t: 'stage', cmd: b.dataset.cmd, cam: b.dataset.cam, mode: b.dataset.mode, lift: b.dataset.lift })(b);
    send(ctx, { t: 'playlist', action: a, index: i })(b);
  });
}

function stageCard(ctx) {
  const st = ctx.S.stage || {}, r = st.report;
  const b = (text, cmd, extra = {}, cls = 'b sm') => h('button', { type: 'button', class: cls, text, disabled: !st.connected, dataset: { pl: 'stage', cmd, ...extra } });
  const warn = !st.connected ? 'The stage page is not connected. In OBS: the "Piano Stage" browser source (Saturday collection), or open it with the link below.'
    : st.pages > 1 ? `${st.pages} stage pages are connected: only the OBS one is driven. Close the other one (a browser tab plays its sound out of this Mac's speakers).`
    : !r?.obs ? 'Connected page is NOT the OBS browser source (a browser tab): its sound plays out of this Mac\'s speakers. For the show use OBS.' : '';
  return h('div', { class: 'pl-stage' },
    h('div', { class: 'row' }, h('span', { class: 'label', text: 'Vienna Piano Stage' }),
      h('span', { class: 'badge ' + (st.connected ? (r?.obs ? 'live' : 'warn') : 'off'), text: st.connected ? (r?.obs ? 'CONNECTED · OBS' : 'CONNECTED · BROWSER') : 'NOT CONNECTED' })),
    warn ? h('p', { class: 'why', text: warn }) : null,
    r ? h('p', { class: 'pl-now' }, h('b', { text: ({ LIVE: 'LIVE PIANO', SONG: 'SONG', BETWEEN: 'BETWEEN SONGS', ENDED: 'SHOW ENDED' }[r.state] || r.state) + (r.paused ? ' · PAUSED' : '') }),
      ` ${r.label}${r.duration ? ` · ${hms(r.time * 1000)} / ${hms(r.duration * 1000)}` : ''} · CAM ${r.program} · ${r.mode} · lift ${r.lift}`) : null,
    r ? h('p', { class: 'hint', text: `Keys: ${r.keys === 'still' ? 'still — no approved, time-synchronised piano part (nothing is faked)' : r.keys}${r.say ? ' · ' + r.say : ''}` }) : null,
    h('div', { class: 'row wrap mt' }, b('Opening', 'start', {}, 'b sm primary'), b('Live piano', 'live'), b('Between songs', 'between'), b('Return to live', 'return-live'),
      b('Closing', 'closing'), b('Stop show', 'stop', {}, 'b sm quiet')),
    h('div', { class: 'row wrap mt' }, h('span', { class: 'label', text: 'Cameras' }), ...['P1', 'P2', 'P3', 'P4', 'P5'].map(k => {
      const x = b(k, 'cam', { cam: k }); if (r?.program === k) x.classList.add('on'); return x; })),
    h('div', { class: 'row wrap mt' }, h('span', { class: 'label', text: 'Light' }), ...['WARM PIANO', 'CINEMATIC', 'PERFORMANCE'].map(m => {
      const x = b(m.toLowerCase(), 'mode', { mode: m }); if (r?.mode === m) x.classList.add('on'); return x; })),
    h('p', { class: 'hint mt', text: 'A camera or light pressed here holds until the next stage segment; the show\'s own camera and light script runs again after it.' }));
}

export function render(ctx) {
  const S = ctx.S, P = S.playlist, card = $('#plCard');
  card.hidden = !P;
  $('#plTab').hidden = !P;
  if (!P) return;
  const s = JSON.stringify([P, S.stage, S.obs.connected, open, S.showId]);
  if (s === sig) return; sig = s;
  const badge = $('#plBadge');
  badge.textContent = P.status === 'playing' ? 'PLAYING' : P.status === 'paused' ? 'PAUSED' : P.playerReady ? 'Ready' : 'Player not ready';
  badge.className = 'badge ' + (P.status === 'playing' ? 'live' : P.playerReady ? 'off' : 'bad');
  const cur = P.tracks[P.index], next = P.tracks[P.index + 1];
  const tb = (text, a, extra = {}) => h('button', { type: 'button', class: 'b' + (extra.cls ? ' ' + extra.cls : ''), text, dataset: { pl: a }, disabled: extra.disabled || false, title: extra.title || null });
  const pos = P.position;
  const fillBar = h('i'); fillBar.style.width = `${pos?.d ? Math.min(100, (pos.t / pos.d) * 100) : 0}%`;   // CSSOM: the CSP allows no style attributes
  fill($('#plBody'),
    h('p', { class: 'hint', text: `${P.album?.title || ''} — ${P.version === 'piano' ? 'piano arrangements, played by the Vienna Piano Stage' : `original recordings, OBS ${P.player}`}` }),
    !P.playerReady ? h('p', { class: 'why', text: P.viaStage ? 'The Vienna Piano Stage page is not connected.' : `OBS has no "${P.player}" in this show yet: npm run obs-setup -- ${S.showId} --players (asks nothing else of OBS).` }) : null,
    h('div', { class: 'pl-now' },
      h('b', { text: cur ? `${two(cur.n)} ${cur.title}` : 'No track cued' }),
      pos ? h('span', { class: 'num', text: ` ${hms(pos.t * 1000)} / ${hms(pos.d * 1000)}` }) : null,
      h('div', { class: 'pl-bar' }, fillBar)),
    h('div', { class: 'row transport' },
      tb('▶ PLAY', 'play', { cls: 'primary', disabled: !P.playerReady || P.status === 'playing' || (cur ? !cur.available : !P.tracks[0]?.available), title: cur && !cur.available ? cur.missing : null }),
      tb('❚❚ PAUSE', 'pause', { disabled: P.status !== 'playing' }),
      tb('■ STOP', 'stop', { disabled: P.status === 'stopped' }),
      tb(P.viaStage ? '⏭ NEXT' : `⏭ NEXT (fade ${P.fadeMs / 1000} s)`, 'next', { disabled: !next, title: next ? `${two(next.n)} ${next.title}${next.available ? '' : ' — ' + next.missing}` : 'Last track' })),
    h('div', { class: 'row mt' },
      h('button', { type: 'button', class: 'b' + (P.talk ? ' danger' : ''), dataset: { pl: 'talk' }, 'aria-pressed': String(!!P.talk), text: P.talk ? '● TALK — mic open, music under the voice' : 'TALK (mic open, music down)' }),
      P.viaStage ? null : h('label', { class: 'checks' }, h('input', { type: 'checkbox', dataset: { pl: 'continuous' }, checked: P.continuous || null }), ' Continuous')),
    h('p', { class: 'hint', text: P.viaStage ? 'A track starts only when you press PLAY. The microphone is independent of the music; only TALK opens it.' : 'The microphone is independent of the music; only TALK opens it. The DJ Mixer input stays separate for a set mixed on the hardware.' }),
    h('ol', { class: 'lib pl-list' }, ...P.tracks.map((t, i) => h('li', { class: (i === P.index ? 'cur' : '') + (t.available ? '' : ' na') },
      h('div', { class: 'row' },
        h('span', { class: 'num', text: two(t.n) }),
        h('b', { class: 'grow', text: t.title }),
        h('span', { class: 'hint', text: `${t.key} · ${t.bpm} BPM · ${hms(t.seconds * 1000)}` }),
        h('button', { type: 'button', class: 'b xs quiet', text: 'INFO', dataset: { pl: 'info', i }, 'aria-expanded': String(open === i) }),
        h('button', { type: 'button', class: 'b xs', text: 'CUE', dataset: { pl: 'select', i } }),
        h('button', { type: 'button', class: 'b xs primary', text: '▶', title: t.available ? 'Play this track' : t.missing, disabled: !t.available || !P.playerReady, dataset: { pl: 'play', i } })),
      !t.available ? h('p', { class: 'why', text: `${t.missing}${t.expected ? ' · expected: ' + t.expected : ''}` }) : null,
      open === i || (open == null && i === P.index) ? h('p', { class: 'pl-story' }, h('span', { class: 'label', text: 'Song Information' }), ' ', t.story) : null))),
    P.viaStage ? stageCard(ctx) : null);
}
