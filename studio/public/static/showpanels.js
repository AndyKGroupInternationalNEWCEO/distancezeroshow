// SHOW panels shared by the Director's SHOW workspace, Andrej's HOST mode and Georgie's Host dashboard:
// the three monitors (CAMERA 01 ANDY'K · PROGRAM · CAMERA 02 GEORGIE), the SHOW CLOCK, the LIVE SHOW SCRIPT
// with its teleprompter, and the private notes. Everything here only reads the show; nothing edits the script.
import { $, h, clock, fill } from './common.js';
import { showClock, mmss } from './clock.js';
import { speakerLines, techLines } from './lines.js';

const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
// server time: every state carries the server clock, so every screen counts from the same second
let skew = 0;
export const serverNow = () => Date.now() + skew;
export function syncClock(S) { if (S?.now) skew = S.now - Date.now(); }

const isFriday = S => (S.rundown?.episode?.format || S.showId) === 'friday';
const two = n => String(n).padStart(2, '0');
export function cueTitle(S, id) {
  if (!id) return '';
  const m = S.media ? [...S.media.audio, ...S.media.video].find(x => x.id === id) : S.cueTitles?.[id];
  return m ? `${id} — ${m.title}${m.available ? '' : ' (NOT AVAILABLE)'}` : id;
}

/* ---------- three monitors ---------- */
export function createMonitors(root, { programLabel = 'PROGRAM' } = {}) {
  const tiles = {};
  const make = (which, label) => {
    const img = h('img', { alt: '', hidden: true }), chip = h('span', { class: 'mchip', text: '—' }), msg = h('p', { class: 'mmsg', text: '' });
    const el = h('figure', { class: 'mon3-tile', dataset: { which } }, h('figcaption', {}, h('b', { text: label }), chip), h('div', { class: 'mpic' }, img, msg));
    tiles[which] = { el, img, chip, msg, at: 0, missing: false };
    return el;
  };
  // ANDY'K | GUEST | GEORGIE, then the LIVE PROGRAM (the actual OBS output) on its own
  fill(root, make('camA', "ANDY'K"), make('guest', 'GUEST'), make('camB', 'GEORGIE'), make('program', programLabel));
  let snap = null;
  return {
    // the guest's still preview from the waiting room (Director only), until the guest sends into OBS
    snapshot(img, at) { snap = { img, at }; },
    frame(f) {
      const t = tiles[f.which]; if (!t) return;
      if (f.img) { t.img.src = f.img; t.at = Date.now(); t.missing = false; } else t.missing = !!f.missing;
    },
    update(S) {
      const obsUp = S.obs ? S.obs.connected : S.tally?.obs;
      const onAir = S.obs ? S.obs.stream.active : S.tally?.onAir;
      for (const [which, t] of Object.entries(tiles)) {
        const fresh = Date.now() - t.at < 4000;
        let chip = '', msg = '', cls = 'off';
        const g = S.guest;
        if (which === 'guest') {
          const sentIn = g && ['backstage', 'onair'].includes(g.status);
          if (isFriday(S)) { chip = 'NOT USED'; msg = 'FRIDAY DJ SHOW — NO GUEST SEAT'; }
          else if (!g) { chip = 'NO GUEST'; msg = 'No guest invited'; }
          else if (!sentIn) {
            const fresh2 = snap && Date.now() - snap.at < 10000;
            chip = g.online ? 'WAITING ROOM' : 'INVITED'; cls = 'warn';
            msg = fresh2 ? '' : g.online ? `${g.name} is in the waiting room${S.media ? ' — no still preview shared' : ''}` : `${g.name} has not joined yet`;
            if (fresh2) { t.img.src = snap.img; t.img.hidden = false; } else t.img.hidden = true;
            t.chip.textContent = 'PREVIEW · ' + chip; t.chip.className = 'mchip warn'; t.msg.textContent = msg; t.msg.hidden = !msg;
            continue;
          }
          else if (!obsUp) { chip = 'OBS OFFLINE'; msg = 'No picture: OBS is not connected'; }
          else if (t.missing) { chip = 'NO SOURCE'; msg = 'No "VDO // Guest" seat in this OBS show'; }
          else if (!fresh) { chip = 'NO PICTURE'; msg = `Waiting for ${g.name}'s studio camera`; }
          else { chip = g.status === 'onair' ? 'ON AIR' : 'BACKSTAGE — NOT ON AIR'; cls = g.status === 'onair' ? 'air' : 'ok'; }
        }
        else if (which === 'camB' && isFriday(S)) { chip = 'NOT USED'; msg = 'FRIDAY DJ SHOW — ONE CAMERA ONLY'; }
        else if (!obsUp) { chip = 'OBS OFFLINE'; msg = 'No picture: OBS is not connected'; }
        else if (t.missing) { chip = 'NO SOURCE'; msg = which === 'camA' ? 'No "Cam // Andrej" source in this OBS show' : which === 'camB' ? 'No "VDO // Georgie" source in this OBS show' : 'No program picture'; }
        else if (!fresh) { chip = t.at ? 'NO PICTURE' : 'WAITING'; msg = t.at ? 'Picture stopped — check the source in OBS' : 'Waiting for the first picture…'; }
        else if (which === 'program') { chip = onAir ? 'ON AIR' : 'OFF AIR'; cls = onAir ? 'air' : 'ok'; }
        else if (which === 'camB' && S.presence && !S.presence.host) { chip = 'GEORGIE OFFLINE'; cls = 'warn'; msg = ''; }
        else { chip = 'LIVE FEED'; cls = 'ok'; }
        t.chip.textContent = chip; t.chip.className = 'mchip ' + cls;
        t.msg.textContent = msg; t.msg.hidden = !msg;
        t.img.hidden = !(fresh && !((which === 'camB' || which === 'guest') && isFriday(S)));
      }
    },
  };
}

/* ---------- SHOW CLOCK ---------- */
export function createClock(root) {
  const cell = (label, cls = '') => { const v = h('strong', { class: 'num', text: '--:--' }), l = h('span', { class: 'label', text: label }); return { el: h('div', { class: 'sc-cell ' + cls }, l, v), v, l }; };
  const c = { elapsed: cell('SHOW ELAPSED'), status: cell('SCHEDULE STATUS', 'status'), current: cell('CURRENT SEGMENT', 'wide'), remain: cell('SEGMENT REMAINING', 'big'), next: cell('NEXT SEGMENT', 'wide') };
  const planned = h('p', { class: 'sc-plan', text: '' }), banner = h('div', { class: 'sc-banner', hidden: true });
  fill(root, h('div', { class: 'sc-grid' }, ...Object.values(c).map(x => x.el)), banner, planned);
  return {
    tick(S) {
      const r = S.rundown, now = serverNow(), k = showClock(r.segments, r, now), b = S.brk || {};
      const ep = r.episode;
      if (!k.running) {
        c.elapsed.v.textContent = '00:00';
        c.current.v.textContent = 'SHOW NOT STARTED';
        const until = ep?.startAt ? Math.round((ep.startAt - now) / 1000) : null;
        c.remain.l.textContent = until != null && until > 0 ? 'SHOW STARTS IN' : 'SEGMENT REMAINING';
        c.remain.v.textContent = until != null && until > 0 ? mmss(until) : '--:--';
        c.remain.el.className = 'sc-cell big wide';
        c.next.v.textContent = r.segments[0] ? `01 ${r.segments[0].title}` : '—';
        c.status.v.textContent = 'NOT STARTED'; c.status.el.className = 'sc-cell status';
        banner.hidden = true;
        planned.textContent = ep?.startAt ? `Planned start ${clock('vie', ep.startAt, false)} Vienna · ${clock('mel', ep.startAt, false)} Melbourne` : 'No start time set for this episode';
        return;
      }
      c.elapsed.v.textContent = mmss(k.elapsed);
      c.current.v.textContent = `${two(k.index + 1)} ${k.title}`;
      c.next.v.textContent = k.next ? `${two(k.next.index + 1)} ${k.next.title}` : 'END OF SHOW';
      c.status.v.textContent = k.label;
      c.status.el.className = 'sc-cell status ' + (k.status === 'ON TIME' ? 'ok' : k.status === 'BEHIND SCHEDULE' ? 'bad' : 'warn');
      if (b.active) {
        const left = b.planned - Math.floor((now - b.startedAt) / 1000);
        c.remain.l.textContent = 'BREAK COUNTDOWN';
        c.remain.v.textContent = left >= 0 ? mmss(left) : '+' + mmss(-left);
        c.remain.el.className = 'sc-cell big wide brk' + (left < 0 ? ' over' : left <= 30 ? ' near' : '');
        banner.hidden = left > 0;
        banner.className = 'sc-banner' + (left < 0 ? ' over' : '');
        banner.textContent = left < 0 ? `BREAK COMPLETE — READY TO RETURN · OVERRUN ${mmss(-left)}` : 'BREAK COMPLETE — READY TO RETURN';
      } else {
        c.remain.l.textContent = k.remaining < 0 ? 'SEGMENT OVERRUN' : 'SEGMENT REMAINING';
        c.remain.v.textContent = k.remaining < 0 ? '+' + mmss(k.overrun) : mmss(k.remaining);
        c.remain.el.className = 'sc-cell big wide' + (k.remaining < 0 ? ' over' : k.remaining <= 60 ? ' near' : '');
        banner.hidden = true;
      }
      const base = ep?.startAt;
      planned.textContent = `Plan: show time ${mmss(k.plannedStart)} → ${mmss(k.plannedEnd)} · started at ${mmss(Math.round((r.segmentStartedAt - r.showStartedAt) / 1000))}`
        + (base ? ` · planned on air ${clock('vie', base + k.plannedStart * 1000, false)} Vienna / ${clock('mel', base + k.plannedStart * 1000, false)} Melbourne` : '');
    },
  };
}

/* ---------- LIVE SHOW SCRIPT + teleprompter ---------- */
// me: "ANDY'K" or "GEORGIE" — the lines of that speaker are highlighted
export function createScript(root, { me, role, conn }) {
  const KEY = 'dz-prompter-' + role;
  const cfg = { size: 34, speed: 30, ...store.get(KEY, {}) };
  let playing = false, segKey = '', last = 0, carry = 0;

  const head = h('div', { class: 'ls-head' });
  const cues = h('div', { class: 'ls-cues' });
  const director = h('div', { class: 'ls-dir', hidden: true });
  const reading = h('span', { class: 'ls-speaker', text: '' });
  const body = h('div', { class: 'prompter', tabindex: '0', 'aria-label': 'Teleprompter' });
  const sizeL = h('span', { class: 'num', text: '' }), speedL = h('span', { class: 'num', text: '' });
  const playB = h('button', { type: 'button', class: 'b sm primary', text: 'PLAY' });
  const btn = (text, fn, label) => h('button', { type: 'button', class: 'b sm quiet', text, 'aria-label': label || text, onclick: fn });
  const bar = h('div', { class: 'pr-bar' },
    h('span', { class: 'label', text: 'TELEPROMPTER' }), reading, h('span', { class: 'grow' }),
    btn('A−', () => setCfg({ size: Math.max(18, cfg.size - 4) }), 'Smaller text'), sizeL, btn('A+', () => setCfg({ size: Math.min(96, cfg.size + 4) }), 'Larger text'),
    btn('−', () => setCfg({ speed: Math.max(5, cfg.speed - 5) }), 'Slower'), speedL, btn('+', () => setCfg({ speed: Math.min(200, cfg.speed + 5) }), 'Faster'),
    playB, btn('TOP', () => { body.scrollTop = 0; }), btn('⤢', () => (document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen?.())?.catch?.(() => {}), 'Full screen'));
  const points = h('div', { class: 'ls-more' });
  const notes = h('textarea', { class: 'in', rows: '3', maxlength: '4000', placeholder: 'My private notes for this segment. Only you see them.', 'aria-label': 'My private notes' });
  const notesState = h('span', { class: 'hint', text: '' });
  fill(root, head, cues, director, h('div', { class: 'pr-wrap' }, bar, body),
    h('div', { class: 'ls-foot' }, points, h('div', { class: 'ls-notes' }, h('div', { class: 'row' }, h('span', { class: 'label grow', text: 'MY NOTES — PRIVATE' }), notesState), notes)));

  function setCfg(p) { Object.assign(cfg, p); store.set(KEY, cfg); apply(); }
  function apply() { body.style.fontSize = cfg.size + 'px'; sizeL.textContent = cfg.size; speedL.textContent = cfg.speed; playB.textContent = playing ? 'PAUSE' : 'PLAY'; playB.classList.toggle('on', playing); }
  playB.addEventListener('click', () => { playing = !playing; last = 0; apply(); });
  body.addEventListener('keydown', e => { if (e.key === ' ') { e.preventDefault(); playB.click(); } });
  apply();

  // smooth scrolling while PLAY is on; scrolling by hand (wheel, drag, keys) always works and simply moves the position
  function frame(t) {
    if (playing && last) {
      carry += cfg.speed * (t - last) / 1000;
      const px = Math.floor(carry); carry -= px;
      if (px) body.scrollTop += px;
      if (body.scrollTop + body.clientHeight >= body.scrollHeight - 1) { playing = false; apply(); }
    }
    last = t;
    markReading();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  function markReading() {
    const y = body.getBoundingClientRect().top + body.clientHeight * 0.3;
    let cur = null;
    for (const el of body.children) { if (el.getBoundingClientRect().top <= y) cur = el; else break; }
    for (const el of body.querySelectorAll('.reading')) if (el !== cur) el.classList.remove('reading');
    if (cur && !cur.classList.contains('reading')) cur.classList.add('reading');
    const who = cur?.dataset.speaker || '';
    reading.textContent = who ? `SPEAKING: ${who}` : '';
    reading.className = 'ls-speaker' + (who && (who === me || who === 'BOTH') ? ' me' : '');
  }

  let noteTimer = 0, noteSeg = '';
  notes.addEventListener('input', () => {
    notesState.textContent = 'UNSAVED CHANGES';
    clearTimeout(noteTimer);
    const seg = noteSeg, text = notes.value;
    noteTimer = setTimeout(async () => {
      notesState.textContent = 'SAVING...';
      try { await conn.send({ t: 'notes.set', segmentId: seg, text }); notesState.textContent = 'ALL CHANGES SAVED'; }
      catch { notesState.textContent = 'SAVE FAILED'; }
    }, 700);
  });

  return {
    render(S) {
      const r = S.rundown, i = r.index >= 0 ? r.index : 0, seg = r.segments[i], nx = r.segments[i + 1];
      if (!seg) { fill(head, h('strong', { text: 'No script loaded' })); fill(body, ); return; }
      const key = seg.id + '|' + seg.script;
      fill(head, 
        h('span', { class: 'label', text: r.index < 0 ? 'FIRST SEGMENT — SHOW NOT STARTED' : 'NOW' }),
        h('strong', { class: 'ls-title', text: `${two(i + 1)} ${seg.title}` }),
        h('span', { class: 'hint', text: [seg.kind, seg.minutes + ' MIN', seg.presenters].filter(Boolean).join(' · ') }),
        r.locked ? h('span', { class: 'badge lock', text: 'SCRIPT LOCKED — READY FOR BROADCAST' }) : null);
      const c = seg.cues || {}, nc = nx?.cues || {};
      const cue = (label, text) => text ? h('span', { class: 'cue-pill' }, h('b', { text: label }), text) : null;
      fill(cues, 
        cue('MUSIC', c.music), cue('JINGLE', cueTitle(S, c.jingle)), cue('VIDEO', cueTitle(S, c.video) + (c.video && c.mode === 'loop' ? ' (LOOP)' : '')),
        nx ? cue('NEXT', `${two(i + 2)} ${nx.title}`) : cue('NEXT', 'END OF SHOW'),
        nx && (nc.jingle || nc.video || nc.music) ? cue('NEXT CUE', [nc.music, cueTitle(S, nc.jingle), cueTitle(S, nc.video)].filter(Boolean).join(' · ')) : null);
      // Director instructions: the Director's own box, never in the teleprompter, never for Georgie
      const dl = role === 'director' ? [seg.director, ...techLines(seg.script)].filter(Boolean) : [];
      director.hidden = !dl.length;
      fill(director, h('b', { text: 'DIRECTOR' }), ...dl.map(t => h('p', { text: t })));
      if (key !== segKey) {
        const fresh = segKey.split('|')[0] !== seg.id;
        segKey = key;
        const lines = speakerLines(seg.script);
        fill(body, ...(lines.some(l => l.text) ? lines.map(l => l.text
          ? h('p', { class: 'pl' + (l.speaker && (l.speaker === me || l.speaker === 'BOTH') ? ' mine' : ''), dataset: { speaker: l.speaker } },
            l.speaker ? h('b', { class: 'who', text: l.speaker + ': ' }) : null, l.text)
          : h('p', { class: 'gap' }))
          : [h('p', { class: 'pl empty', text: 'No spoken script for this segment. Talking points below.' })]));
        if (fresh) { body.scrollTop = 0; playing = false; apply(); }   // a new segment starts at the top, paused — never on its own
      }
      fill(points, 
        seg.talkingPoints ? h('div', {}, h('span', { class: 'label', text: 'TALKING POINTS — NOT SCRIPTED' }), h('p', { class: 'pre', text: seg.talkingPoints })) : null,
        seg.guest?.name ? h('div', {}, h('span', { class: 'label', text: 'GUEST' }), h('p', { text: seg.guest.name + (seg.guest.details ? ' — ' + seg.guest.details : '') })) : null,
        seg.questions?.length ? h('div', {}, h('span', { class: 'label', text: 'QUESTIONS' }), h('ol', {}, ...seg.questions.map(q => h('li', { text: q })))) : null,
        seg.closing ? h('div', {}, h('span', { class: 'label', text: 'CLOSING' }), h('p', { text: seg.closing })) : null);
      if (noteSeg !== seg.id) { noteSeg = seg.id; notes.value = S.myNotes?.[seg.id] || ''; notesState.textContent = ''; }
      else if (document.activeElement !== notes && notesState.textContent !== 'UNSAVED CHANGES') notes.value = S.myNotes?.[seg.id] || '';
    },
  };
}

/* ---------- BREAK MONITORS: backstage, never on air ---------- */
// The two private cameras come from the private call (browser to browser, never in OBS).
export function createBreakMonitors(root, { call, role, onReturn }) {
  const vMe = h('video', { autoplay: true, playsinline: true, muted: true }), vPeer = h('video', { autoplay: true, playsinline: true, muted: true });
  vMe.muted = vPeer.muted = true;  // the call itself plays the sound; these are pictures only
  const lMe = h('span', { class: 'hint' }), lPeer = h('span', { class: 'hint' });
  const left = h('strong', { class: 'num bm-count', text: '--:--' }), info = h('p', { class: 'bm-info' }), iso = h('ul', { class: 'bm-iso' });
  const mic = h('span', { class: 'mchip' });
  const ret = role === 'director' ? h('button', { type: 'button', class: 'b danger bm-return', text: 'RETURN TO LIVE' }) : null;
  const names = role === 'director' ? ["ANDY'K (YOU)", 'GEORGIE'] : ['GEORGIE (YOU)', "ANDY'K"];
  fill(root, 
    h('div', { class: 'bm-head' }, h('b', { class: 'bm-tag', text: 'BACKSTAGE — NOT ON AIR' }), mic, h('span', { class: 'grow' }), left),
    h('div', { class: 'bm-cams' }, h('figure', {}, h('figcaption', { text: names[0] }), vMe, lMe), h('figure', {}, h('figcaption', { text: names[1] }), vPeer, lPeer)),
    info, iso, ret);
  if (ret) ret.addEventListener('click', () => onReturn(ret));
  return {
    tick(S) {
      const b = S.brk || {};
      root.hidden = !b.active;
      if (!b.active) return;
      const now = serverNow(), l = b.planned - Math.floor((now - b.startedAt) / 1000);
      left.textContent = l >= 0 ? mmss(l) : '+' + mmss(-l);
      left.className = 'num bm-count' + (l < 0 ? ' over' : '');
      const st = call?.streams?.() || {};
      if (vMe.srcObject !== (st.local || null)) vMe.srcObject = st.local || null;
      if (vPeer.srcObject !== (st.remote || null)) vPeer.srcObject = st.remote || null;
      const inCall = call?.phase === 'active';
      lMe.textContent = st.local ? '' : 'Camera not shared — start the private call';
      lPeer.textContent = inCall ? '' : 'Not in the private call';
      mic.textContent = inCall ? (call.micOn?.() ? 'PRIVATE MIC ON — BACKSTAGE ONLY' : 'PRIVATE MIC MUTED') : 'PRIVATE CALL NOT CONNECTED';
      mic.className = 'mchip ' + (inCall ? 'ok' : 'warn');
      const nextT = b.next ? `NEXT: ${b.next}` : '';
      info.textContent = `${b.title} · ${l > 0 ? 'Break running' : 'BREAK COMPLETE — READY TO RETURN'}${nextT ? ' · ' + nextT : ''}`;
      if (role === 'director' && b.isolation) {
        const x = b.isolation, rows = [];
        rows.push([x.micsLive.length ? 'bad' : 'ok', x.micsLive.length ? `ON AIR MICROPHONES STILL OPEN: ${x.micsLive.join(', ')}` : `Broadcast microphones muted (${b.muted.length ? b.muted.join(', ') : 'all were already off'})`]);
        if (!x.micsTagged) rows.push(['bad', 'No microphone sources tagged in OBS: check Technical → Audio sources']);
        rows.push([x.camsOnAir.length ? 'bad' : 'ok', x.camsOnAir.length ? `CAMERAS IN THE PROGRAM: ${x.camsOnAir.join(', ')}` : 'No camera in the program picture']);
        if (x.otherLive.length) rows.push(['warn', `Also live in OBS: ${x.otherLive.join(', ')} — mute it if a voice can reach it`]);
        rows.push(['ok', 'Private call: browser to browser, never routed into OBS or the recording']);
        fill(iso, ...rows.map(([c, t]) => h('li', { class: c, text: t })));
      } else fill(iso, );
    },
  };
}
