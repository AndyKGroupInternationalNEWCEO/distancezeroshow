// JINGLES // AUDIO and VIDEOS // VISUALS — the show's media library, in SHOW and in REHEARSAL.
// PREVIEW plays the file in this browser only (the Director's headphones): it never reaches OBS or the program.
// PLAY / PLAY ON AIR (SHOW only) loads the file into the OBS Jingle Player / Video Player. Missing files are listed
// as NOT AVAILABLE and cannot be played; nothing is faked.
import { $, h, act, hms } from '../common.js';

let previewEl = null, previewId = '';
function preview(item, videoEl) {
  stopPreview();
  if (item.type === 'video' && videoEl) {
    videoEl.hidden = false; videoEl.src = '/media/' + encodeURIComponent(item.id); videoEl.play().catch(() => {});
    previewEl = videoEl;
  } else {
    previewEl = new Audio('/media/' + encodeURIComponent(item.id));
    previewEl.play().catch(() => {});
  }
  previewId = item.id;
  previewEl.onended = () => { previewId = ''; changed?.(); };
  changed?.();
}
export function stopPreview() {
  if (previewEl) { previewEl.pause(); if (previewEl.tagName === 'VIDEO') { previewEl.removeAttribute('src'); previewEl.load(); previewEl.hidden = true; } }
  previewEl = null; previewId = ''; changed?.();
}
let changed = null;

// mode: 'show' (preview + on air) or 'rehearse' (preview only)
export function createLibrary(ctx, { mode, audioList, videoList, filter, catSel, loopBox, audioStop, videoStop, videoPreview, audioBadge, videoBadge }) {
  const air = mode === 'show';
  const send = m => ctx.conn.send(m);
  if (audioStop) audioStop.addEventListener('click', e => air ? act(e.currentTarget, () => send({ t: 'media.stop', kind: 'audio' }), 'Jingle stopped') : stopPreview());
  if (videoStop) videoStop.addEventListener('click', e => air ? act(e.currentTarget, () => send({ t: 'media.stop', kind: 'video' }), 'Video stopped') : stopPreview());
  for (const el of [filter, catSel]) el?.addEventListener('change', () => render(true));
  const prevChanged = changed;
  changed = () => { prevChanged?.(); render(true); };

  function status(S, x) {
    const onAir = (x.type === 'audio' ? S.mediaAir?.audio : S.mediaAir?.video)?.id === x.id;
    if (!x.available) return ['off', x.type === 'video' ? 'VIDEO NOT AVAILABLE' : 'AUDIO NOT AVAILABLE'];
    if (onAir) return ['air', 'ON AIR'];
    if (previewId === x.id) return ['pv', 'PREVIEW'];
    return ['ok', 'READY' + (x.duration ? ' · ' + hms(x.duration * 1000) : '')];
  }
  function row(S, x) {
    const [cls, text] = status(S, x);
    const btns = [];
    btns.push(h('button', { type: 'button', class: 'b xs', text: previewId === x.id ? 'STOP PREVIEW' : 'PREVIEW', disabled: !x.available,
      onclick: () => previewId === x.id ? stopPreview() : preview(x, videoPreview) }));
    if (air) {
      btns.push(h('button', { type: 'button', class: 'b xs primary', text: x.type === 'video' ? 'PLAY ON AIR' : 'PLAY', disabled: !x.available || !ctx.S.obs.connected,
        title: x.available ? 'On air through OBS' : 'File not available',
        onclick: e => act(e.currentTarget, () => send({ t: 'media.air', media: x.id, loop: !!loopBox?.checked }), `${x.id} on air`) }));
    }
    const extra = [x.embeddedAudio ? 'VIDEO HAS ITS OWN SOUND' : '', x.linkedAudio ? `LINKED JINGLE ${x.linkedAudio}` : '', x.numberMismatch ? `FILE: ${x.fileName}` : ''].filter(Boolean).join(' · ');
    return h('li', { class: 'lib-row ' + cls + (x.forShow ? '' : ' other') },
      h('span', { class: 'lib-id num', text: x.id }),
      h('span', { class: 'lib-t' }, h('b', { text: x.title }), extra ? h('small', { text: extra }) : null),
      h('span', { class: 'lib-st ' + cls, text }), h('span', { class: 'lib-b' }, ...btns));
  }
  let sig = '';
  function render(force = false) {
    const S = ctx.S; if (!S?.media) return;
    const s = JSON.stringify([S.media.scannedAt, S.mediaAir, S.showId, S.obs.connected, previewId, filter?.value, catSel?.value, S.media.audio.length]);
    if (!force && s === sig) return; sig = s;
    const f = filter?.value || 'show';
    const want = x => f === 'all' || (f === 'show' ? x.forShow : x.shows.includes(f));
    const audio = S.media.audio.filter(want);
    const video = S.media.video.filter(x => !catSel?.value || x.category === catSel.value);
    audioList?.replaceChildren(...audio.map(x => row(S, x)));
    videoList?.replaceChildren(...video.map(x => row(S, x)));
    const a = S.mediaAir?.audio, v = S.mediaAir?.video;
    if (audioBadge) { audioBadge.textContent = air ? (!S.obs.connected ? 'PLAY OFF: OBS NOT CONNECTED' : a ? `ON AIR ${a.id}` : 'Nothing on air') : 'PREVIEW ONLY'; audioBadge.className = 'badge ' + (air && a ? 'live' : 'off'); }
    if (videoBadge) { videoBadge.textContent = air ? (!S.obs.connected ? 'PLAY OFF: OBS NOT CONNECTED' : v ? `ON AIR ${v.id}${v.loop ? ' LOOP' : ''}` : 'Nothing on air') : 'PREVIEW ONLY'; videoBadge.className = 'badge ' + (air && v ? 'live' : 'off'); }
  }
  return { render };
}
