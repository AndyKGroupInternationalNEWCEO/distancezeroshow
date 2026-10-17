// LIVE CONTROL — the gallery: preview and program monitors, scene bus, CUT / TAKE, transition,
// microphones, both cities' links, stream and recording.
import { $, $$, h, hms, act, holdButton, segmentTimer } from '../common.js';

const frames = { program: { at: 0, scene: '' }, preview: { at: 0, scene: '' } };
const level = d => Math.max(0, Math.min(100, (d + 60) / 60 * 100)).toFixed(1) + '%';
// Georgie's camera/mic are proven by what really arrives: her video and voice in the private call, her sound in OBS.
// Her own check page cannot test them while VDO.Ninja or the call already uses her one camera and mic.
const heard = { obs: 0, call: 0 };
export function georgieProof(S, hs) {
  const st = S.call?.phase === 'active' ? S.call.directorStats : null, now = Date.now();
  if (st?.audio > 1) heard.call = now;
  return { camera: !!hs?.camera || st?.fps > 0, mic: !!hs?.mic || now - heard.call < 60000 || now - heard.obs < 60000 };
}

export function init(ctx) {
  $('#cutBtn').addEventListener('click', e => fire(e.currentTarget, ctx, 'cut'));
  $('#takeBtn').addEventListener('click', e => fire(e.currentTarget, ctx, 'auto'));
  $('#transDur').addEventListener('change', e => act(null, () => ctx.obs('duration', { ms: Number(e.target.value) })));
  $('#rbAdvance').addEventListener('click', e => act(e.currentTarget, () => ctx.conn.send({ t: 'rundown', action: 'next' })));
  holdButton($('#streamBtn'), 1500, () => act($('#streamBtn'), () => ctx.obs('stream', { on: !ctx.S.obs.stream.active, confirm: true }),
    ctx.S.obs.stream.active ? 'Stream stopped' : 'Stream starting'));
  $('#armBtn').addEventListener('click', e => act(e.currentTarget, () => ctx.obs('stream.arm', { on: !(ctx.S.streamArmedUntil > Date.now()) })));
  $('#recBtn').addEventListener('click', e => act(e.currentTarget, () => ctx.obs('record', { on: !ctx.S.obs.record.active })));
}

function fire(btn, ctx, action) {
  if (btn.disabled) return;
  btn.classList.remove('fired'); void btn.offsetWidth; btn.classList.add('fired');
  return act(btn, () => ctx.obs(action));
}

export function key(e, ctx) {
  const o = ctx.S.obs;
  if (/^[1-9]$/.test(e.key)) {
    const scene = o.scenes[+e.key - 1];
    if (scene && o.connected) { e.preventDefault(); act(null, () => ctx.obs('preview', { scene })); }
  } else if (e.key === 'c' || e.key === 'C') { e.preventDefault(); $('#cutBtn').click(); }
  else if (e.key === 't' || e.key === 'T') { e.preventDefault(); $('#takeBtn').click(); }
}

export function render(ctx) {
  const S = ctx.S, o = S.obs, up = o.connected && ctx.link.state === 'open';
  const pvw = o.previewScene;

  /* monitors */
  $('#pgmName').textContent = o.program || '—';
  $('#pvwName').textContent = pvw || '—';
  $('#monPgm').classList.toggle('air', o.stream.active);
  $('#pgmHint').textContent = o.stream.active ? 'On air' : o.record.active ? 'Recording' : 'Live output';
  $('#pvwHint').textContent = o.studioMode ? 'Next on air // OBS Studio Mode' : 'Next on air';
  for (const [w, scene] of [['pgm', o.program], ['pvw', pvw]]) {
    const which = w === 'pgm' ? 'program' : 'preview';
    const ok = up && scene && frames[which].scene === scene;
    $(`#${w}Img`).hidden = !ok;
    $(`#${w}No`).hidden = ok;
    $(`#${w}No`).querySelector('span').textContent = !o.connected ? 'OBS not connected' : !scene ? 'No scene' : 'Waiting for picture…';
  }

  /* transition */
  const cur = o.transitions.find(t => t.name === o.transition);
  $('#cutBtn').disabled = $('#takeBtn').disabled = !up || !pvw;
  $('#takeSub').textContent = o.transition ? `${o.transition}${cur && !cur.fixed ? ' · ' + o.transitionDuration + ' ms' : ''}` : 'with transition';
  if (ctx.differs('trans', [o.transitions, o.transition, up])) {
    $('#transList').replaceChildren(...o.transitions.map(t => h('button', {
      type: 'button', class: 'chip', 'aria-pressed': String(t.name === o.transition), disabled: !up,
      onclick: e => act(e.currentTarget, () => ctx.obs('transition', { name: t.name })),
    }, t.name)));
  }
  const dur = $('#transDur');
  dur.disabled = !up || !cur || cur.fixed;
  if (document.activeElement !== dur) dur.value = cur && !cur.fixed ? o.transitionDuration : '';
  $('#pvwHint').title = o.studioMode ? 'OBS Studio Mode is on, so the preview is OBS\'s own.'
    : 'Studio Mode is off in OBS: the studio holds the preview and OBS shows only the program. CUT always cuts hard; TAKE uses the selected transition.';

  /* scene bus */
  const bb = $('#busBadge'); bb.className = 'badge ' + (up ? 'live' : 'off'); bb.textContent = up ? 'Live // OBS' : 'Not connected';
  if (ctx.differs('bus', [o.scenes, o.program, pvw, up, S.standby.scene])) {
    const bus = $('#sceneBus');
    if (!o.scenes.length) bus.replaceChildren(h('p', { class: 'empty', text: up ? 'OBS has no scenes' : 'Waiting for OBS…' }));
    else bus.replaceChildren(...o.scenes.map((name, i) => {
      const pgm = name === o.program, isPvw = name === pvw;
      return h('button', {
        type: 'button', class: `scene ${pgm ? 'pgm' : ''} ${isPvw && !pgm ? 'pvw' : ''} ${name === S.standby.scene ? 'sb' : ''}`, disabled: !up,
        'aria-label': `${name}${pgm ? ', on air' : isPvw ? ', on preview' : ''}`,
        onclick: e => { if (!pgm) act(e.currentTarget, () => ctx.obs('preview', { scene: name })); },
      }, h('span', { text: name }),
      h('span', { class: 'meta' }, i < 9 ? h('kbd', { text: String(i + 1) }) : h('span'),
        pgm ? h('span', { class: 'tag', text: 'ON AIR' }) : isPvw ? h('span', { class: 'tag', text: 'PREVIEW' }) : null));
    }));
  }

  /* microphones */
  const mics = o.audio.filter(a => a.mic);
  if (ctx.differs('mics', [mics, up])) {
    $('#micTiles').replaceChildren(...(mics.length ? mics.map(a => h('div', { class: 'mic ' + (a.muted ? 'muted' : 'live'), dataset: { input: a.name } },
      h('span', { class: 'nm', text: a.name, title: a.name }),
      h('div', { class: 'meter', 'aria-hidden': 'true' }, h('i'), h('i')),
      h('button', { type: 'button', disabled: !up, 'aria-pressed': String(a.muted), 'aria-label': `${a.name}: ${a.muted ? 'muted, unmute' : 'live, mute'}`,
        onclick: e => act(e.currentTarget, () => ctx.obs('mute', { input: a.name, muted: !a.muted })) }, a.muted ? 'MUTED' : 'ON AIR')))
      : [h('p', { class: 'empty', text: up ? 'No microphones tagged. Technical → Audio mixer → MIC.' : 'OBS not connected' })]));
  }

  /* links */
  const hs = S.hostStatus, fresh = hs && Date.now() - hs.at < 6 * 3600e3, proof = georgieProof(S, hs);
  const light = (text, cls) => h('span', { class: 'light ' + cls, text });
  $('#lightsVie').replaceChildren(
    light('Studio', ctx.link.state === 'open' ? 'ok' : 'bad'),
    light('OBS', o.connected ? 'ok' : o.status === 'connecting' ? 'warn' : 'bad'),
    light('Overlay', S.presence.overlay ? 'ok' : ''));
  $('#detailVie').textContent = o.connected ? `${o.stats.fps.toFixed(0)} fps · CPU ${o.stats.cpu.toFixed(0)}% · OBS ${o.stats.latency} ms` : (o.error || 'OBS offline');
  $('#lightsMel').replaceChildren(
    light('Georgie', S.presence.host ? 'ok' : ''),
    light('Camera', proof.camera ? 'ok' : !fresh ? '' : 'warn'),
    light('Mic', proof.mic ? 'ok' : !fresh ? '' : 'warn'),
    light('VDO', !fresh ? '' : hs.vdo ? 'ok' : 'warn'));
  $('#detailMel').textContent = S.presence.host ? (hs?.rtt ? `Dashboard link ${hs.rtt} ms` : 'Dashboard online') : 'Dashboard not open';

  /* output */
  $('#outStream').classList.toggle('on', o.stream.active);
  $('#streamTc').textContent = o.stream.active ? (o.stream.timecode || '').split('.')[0] || 'LIVE' : 'OFF';
  const sb = $('#streamBtn');
  sb.firstChild.textContent = o.stream.active ? 'End stream ' : 'Go live ';
  sb.classList.toggle('danger', o.stream.active);
  // GO LIVE: locked until UNLOCK (60 s). The reason is always written next to the button, not only a grey button.
  const armed = S.streamArmedUntil > Date.now(), rh = S.rehearsal?.active;
  const why = !up ? 'OBS is not connected — start OBS (Technical shows the connection).'
    : o.stream.active ? '' : rh ? 'Locked: a rehearsal is running. End it in Rehearsal to go live.'
    : !armed ? 'Locked against accidental starts. Press UNLOCK GO LIVE, then hold GO LIVE within 60 s.' : `Unlocked for ${Math.ceil((S.streamArmedUntil - Date.now()) / 1000)} s — hold GO LIVE to start the stream.`;
  sb.disabled = !up || (!o.stream.active && (!armed || rh));
  $('#armBtn').hidden = o.stream.active || !up;
  $('#armBtn').textContent = armed ? 'Lock again' : 'Unlock GO LIVE';
  $('#armBtn').classList.toggle('on', armed);
  $('#streamWhy').textContent = why;
  $('#outRec').classList.toggle('on', o.record.active);
  $('#recTc').textContent = o.record.active ? (o.record.timecode || '').split('.')[0] : 'OFF';
  $('#recBtn').textContent = o.record.active ? 'Stop' : 'Record';
  $('#recBtn').disabled = !up;
}

/* the on-air ribbon and monitor freshness: every 250 ms */
export function tick(ctx) {
  const r = ctx.S.rundown, t = segmentTimer(ctx.S), nxt = r.segments[r.index + 1];
  $('#rbNow').textContent = t ? t.seg.title : 'Show not started';
  const rem = $('#rbRem');
  rem.textContent = t ? hms(t.remaining) : '--:--';
  rem.className = 'rem num' + (t ? (t.remaining < 0 ? ' over' : t.remaining < 60000 ? ' near' : '') : '');
  $('#rbNext').replaceChildren(...(nxt ? ['Next ', h('b', { text: nxt.title })] : r.index >= 0 ? ['End of show'] : r.segments[0] ? ['First ', h('b', { text: r.segments[0].title })] : []));
  $('#rbAdvance').firstChild.textContent = r.index < 0 ? 'Start show ' : 'Next segment ';
  $('#rbAdvance').disabled = r.index >= 0 && !nxt;
  for (const [w, which] of [['pgm', 'program'], ['pvw', 'preview']]) {
    const age = Date.now() - frames[which].at;
    $(`#${w}Age`).textContent = frames[which].at && age > 2500 && ctx.S.obs.connected ? `picture ${Math.round(age / 1000)} s old` : '';
  }
}

export function frame({ which, scene, img }) {
  if (which !== 'program' && which !== 'preview') return;   // camera pictures belong to the SHOW monitors and the call window
  const el = $(which === 'program' ? '#pgmImg' : '#pvwImg');
  frames[which] = { at: Date.now(), scene };
  el.src = img;
  el.dataset.scene = scene;
  const name = $(which === 'program' ? '#pgmName' : '#pvwName').textContent;
  if (name === scene) { el.hidden = false; $(which === 'program' ? '#pgmNo' : '#pvwNo').hidden = true; }
}

export function meters(m) {
  const g = m['VDO // Georgie']; if (g && Math.max(...g) > -50) heard.obs = Date.now();
  for (const tile of $$('#micTiles .mic')) {
    const v = m[tile.dataset.input] || [-60, -60];
    const bars = tile.querySelectorAll('.meter i');
    bars[0].style.setProperty('--lv', level(v[0]));
    bars[1].style.setProperty('--lv', level(v[1]));
  }
}
