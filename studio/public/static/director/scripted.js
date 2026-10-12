// REHEARSAL → SCRIPT: the only place where the episode script is written. Episodes are copies of the show's master
// (SUNDAY_MASTER_SCRIPT / FRIDAY_MASTER_SCRIPT); the master itself is never changed. Every change saves itself
// (SAVING... / ALL CHANGES SAVED / UNSAVED CHANGES / SAVE FAILED). Imports (pasted text or PDF) are shown for review
// and replace nothing until confirmed. 180 minutes before the start the server locks the script for broadcast.
import { $, h, act, toast, clock, fill } from '../common.js';
import { plan, mmss } from '../clock.js';
import { serverNow } from '../showpanels.js';

const KINDS = ['TALK', 'MUSIC', 'GUEST', 'VT', 'BREAK', 'AD'];
const LEAD = { andrej: 'Andrej leads', georgie: 'Georgie leads', both: 'Both' };
const two = n => String(n).padStart(2, '0');
const until = ms => { const m = Math.max(0, Math.floor(ms / 60000)), d = Math.floor(m / 1440), hh = Math.floor(m / 60) % 24; return d ? `${d} d ${hh} h` : hh ? `${hh} h ${m % 60} min` : `${m % 60} min`; };
let sel = '', dirty = null, timer = 0, saveState = '', lastSig = '', review = null;

export function init(ctx) {
  const send = m => ctx.conn.send(m);
  $('#seNew').addEventListener('click', e => act(e.currentTarget, async () => {
    await send({ t: 'episode.new', format: $('#seNewFormat').value, date: $('#seNewDate').value, start: $('#seNewStart').value });
    sel = '';
  }, 'New episode created from the master script'));
  $('#seOpen').addEventListener('click', e => { const id = $('#seEpisodes').value; if (id) act(e.currentTarget, () => send({ t: 'episode.open', episode: id }), 'Episode opened'); });
  for (const id of ['#seTitle', '#seDate', '#seStart']) $(id).addEventListener('change', () => act(null, async () => {
    setSave('SAVING...');
    try { await send({ t: 'episode.meta', title: $('#seTitle').value, date: $('#seDate').value, start: $('#seStart').value }); setSave('ALL CHANGES SAVED'); }
    catch (err) { setSave('SAVE FAILED'); lastSig = ''; throw err; }
  }));
  $('#seRestore').addEventListener('click', e => { if (confirmTwice(e.currentTarget, 'Restore? Click again')) act(e.currentTarget, () => send({ t: 'script.restore' }), 'Last saved version restored'); });
  $('#seAdd').addEventListener('click', e => act(e.currentTarget, async () => {
    const r = ctx.S.rundown, i = r.segments.findIndex(s => s.id === sel);
    const res = await send({ t: 'rundown', action: 'add', index: i >= 0 ? i : null });
    const idx = res?.result?.index ?? res?.index;
    setTimeout(() => { sel = ctx.S.rundown.segments[idx]?.id || sel; lastSig = ''; render(ctx); }, 150);
  }));
  // import: paste or PDF → review → apply only what was confirmed
  $('#sePasteGo').addEventListener('click', e => act(e.currentTarget, async () => {
    const text = $('#sePaste').value; if (!text.trim()) throw new Error('Paste the script text first');
    const r = await send({ t: 'script.parse', text });
    showReview(ctx, r.result || r);
  }));
  $('#sePdf').addEventListener('change', e => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    act(null, async () => {
      const res = await fetch('/script/import-pdf', { method: 'POST', body: f, headers: { 'Content-Type': 'application/pdf' }, credentials: 'same-origin' });
      const j = await res.json().catch(() => ({ ok: false, error: 'The studio could not read this PDF' }));
      if (!j.ok) throw new Error(j.error || 'PDF import failed');
      $('#sePaste').value = j.text;
      showReview(ctx, j);
    });
  });
  $('#seImportCancel').addEventListener('click', () => { review = null; $('#seReview').hidden = true; });
  $('#seImportApply').addEventListener('click', e => {
    if (!review) return;
    const parts = review.segments.filter((_, i) => $(`#seRv${i}`)?.checked).map(p => ({ segmentId: p.segmentId, text: p.text }));
    if (!parts.length) return toast('Nothing selected', 'warn');
    act(e.currentTarget, async () => {
      await send({ t: 'script.import', parts, confirm: true });
      review = null; $('#seReview').hidden = true; $('#sePaste').value = ''; lastSig = '';
    }, 'Imported. The previous text is kept as a version.');
  });
  // templates (whole rundowns under a name) moved here from Show Control: editing belongs to Rehearsal
  const rd = (action, extra) => send({ t: 'rundown', action, ...extra });
  $('#tplSave').addEventListener('click', e => act(e.currentTarget, async () => { await rd('saveTemplate', { name: $('#tplName').value.trim() || ctx.S.rundown.title }); $('#tplName').value = ''; }, 'Template saved'));
  $('#tplLoad').addEventListener('click', e => { const id = $('#tplPick').value; if (id && confirmTwice(e.currentTarget, 'Replace? Click again')) act(e.currentTarget, () => rd('loadTemplate', { template: id }), 'Template loaded'); });
  $('#tplDel').addEventListener('click', e => { const id = $('#tplPick').value; if (id && confirmTwice(e.currentTarget, 'Delete? Click again')) act(e.currentTarget, () => rd('deleteTemplate', { template: id }), 'Template deleted'); });
  $('#seForm').addEventListener('focusout', () => setTimeout(() => { if (!dirty && !ctx.focusedIn($('#seForm'))) render(ctx); }, 50));
  window.addEventListener('beforeunload', e => { if (dirty) { flush(ctx); e.preventDefault(); } });
}

function confirmTwice(btn, label) {
  if (btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = btn.dataset.label; return true; }
  btn.dataset.armed = '1'; btn.dataset.label = btn.textContent; btn.textContent = label;
  setTimeout(() => { if (btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = btn.dataset.label; } }, 3000);
  return false;
}
function setSave(t) {
  saveState = t; const el = $('#seSave'); if (!el) return;
  el.textContent = t; el.className = 'savestate ' + ({ 'SAVING...': 'saving', 'ALL CHANGES SAVED': 'ok', 'UNSAVED CHANGES': 'warn', 'SAVE FAILED': 'bad' }[t] || '');
}

function showReview(ctx, r) {
  review = r;
  const segs = ctx.S.rundown.segments;
  $('#seReview').hidden = false;
  fill($('#seReviewBody'), 
    h('p', { class: 'hint', text: `Found ${r.segments.length} of ${segs.length} segment titles. Nothing is replaced until you press APPLY SELECTED; the current text is kept as a version.` }),
    h('ul', { class: 'rv-list' }, ...r.segments.map((p, i) => {
      const cur = segs.find(s => s.id === p.segmentId);
      const cb = h('input', { type: 'checkbox', id: `seRv${i}` }); cb.checked = true;
      return h('li', {}, h('label', {}, cb, h('b', { text: p.title })),
        h('p', { class: 'rv-new', text: p.text.slice(0, 280) + (p.text.length > 280 ? '…' : '') || '(empty)' }),
        h('p', { class: 'hint', text: cur?.script ? `Replaces the current spoken script (${cur.script.length} characters)` : 'This segment has no spoken script yet' }));
    })),
    r.missing?.length ? h('p', { class: 'warn', text: 'Not found in the import (left unchanged): ' + r.missing.join(' · ') }) : null,
    r.unassigned ? h('details', {}, h('summary', { text: 'Text before the first segment title (not imported)' }), h('pre', { class: 'pre', text: r.unassigned.slice(0, 3000) })) : null);
}

// collect the editor form into the fields the server accepts
function fields() {
  const v = id => $('#' + id)?.value ?? '';
  return {
    title: v('sfTitle'), kind: v('sfKind'), minutes: v('sfMinutes'), lead: v('sfLead'), presenters: v('sfPresenters'),
    script: v('sfScript'), talkingPoints: v('sfPoints'), guest: { name: v('sfGuest'), details: v('sfGuestDetails') },
    questions: v('sfQuestions').split('\n').map(x => x.trim()).filter(Boolean),
    cues: { scene: v('sfScene'), jingle: v('sfJingle'), video: v('sfVideo'), mode: v('sfMode'), audioMode: v('sfAudio'), music: v('sfMusic'),
      returnJingle: v('sfRetJingle'), returnVideo: v('sfRetVideo') },
    director: v('sfDirector'), closing: v('sfClosing'), notes: v('sfNotes'),
  };
}
async function flush(ctx) {
  clearTimeout(timer);
  if (!dirty) return;
  const job = dirty; dirty = null;
  setSave('SAVING...');
  try { await ctx.conn.send({ t: 'script.update', segmentId: job.id, fields: job.fields }); if (!dirty) setSave('ALL CHANGES SAVED'); }
  catch (e) { dirty ||= job; setSave('SAVE FAILED'); toast(e.message || 'Save failed', 'bad'); }
}
function changed(ctx) {
  dirty = { id: sel, fields: fields() };
  setSave('UNSAVED CHANGES');
  clearTimeout(timer); timer = setTimeout(() => flush(ctx), 900);
}

export function render(ctx) {
  const S = ctx.S; if (!S) return;
  const r = S.rundown, locked = r.locked || (r.lockAt && serverNow() >= r.lockAt);
  if (!r.segments.some(s => s.id === sel)) sel = r.segments[Math.max(0, r.index)]?.id || r.segments[0]?.id || '';
  // header: episode, times, lock — refreshed always (cheap)
  const ep = r.episode;
  const lk = $('#seLock');
  if (locked) { lk.textContent = 'SCRIPT LOCKED — READY FOR BROADCAST'; lk.className = 'badge lock'; }
  else if (r.lockAt) { lk.textContent = `Editable until ${new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Vienna', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(r.lockAt)} Vienna · locks in ${until(r.lockAt - serverNow())}`; lk.className = 'badge off'; }
  else { lk.textContent = 'No start time: set date and start'; lk.className = 'badge warn'; }
  $('#seMel').textContent = ep?.startAt ? `= ${clock('mel', ep.startAt, false)} Melbourne (${new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'short', day: 'numeric', month: 'short' }).format(ep.startAt)})` : '';
  $('#seVersions').textContent = S.versions ? `${S.versions} earlier version${S.versions > 1 ? 's' : ''}` : 'No earlier version yet';
  $('#seRestore').disabled = locked || !S.versions;
  $('#seExport').href = '/script/export.pdf'; $('#sePrint').href = '/script/print';
  if (!saveState && r.savedAt) setSave('ALL CHANGES SAVED');

  const sig = JSON.stringify([r.segments, r.title, ep, locked, sel, S.episodes, S.templates, S.obs.scenes?.length, S.media?.scannedAt]);
  if (sig === lastSig) return;
  // never rebuild the form under the cursor while typing: the autosave catches up first
  if (dirty || ctx.focusedIn($('#seForm'))) return;
  lastSig = sig;

  const focusKeep = (el, v) => { if (document.activeElement !== el) el.value = v; };
  focusKeep($('#seTitle'), r.title || ''); focusKeep($('#seDate'), ep?.date || ''); focusKeep($('#seStart'), ep?.start || '');
  for (const id of ['#seTitle', '#seDate', '#seStart', '#seAdd', '#sePasteGo', '#sePdfBtn']) $(id).disabled = locked;
  $('#sePdf').disabled = locked;
  $('#seEpLabel').textContent = ep ? `${ep.id} · ${ep.format.toUpperCase()} · from ${ep.master || 'master'}` : 'No episode: create one from the master script';
  const eps = S.episodes || [], pick = $('#seEpisodes');
  fill(pick, ...(eps.length ? eps.map(e => h('option', { value: e.id, text: `${e.id} · ${e.title || ''}${e.locked ? ' · LOCKED' : ''}` })) : [h('option', { value: '', text: 'No episodes yet' })]));
  if (ep && eps.some(e => e.id === ep.id)) pick.value = ep.id;
  const tl = S.templates || [], tp = $('#tplPick');
  fill(tp, ...(tl.length ? tl.map(t => h('option', { value: t.id, text: `${t.name} · ${t.segments} segments · ${t.minutes} min` })) : [h('option', { value: '', text: 'No saved templates' })]));

  // segment list
  const times = plan(r.segments);
  fill($('#seList'), ...r.segments.map((s, i) => h('li', { class: s.id === sel ? 'cur' : '' },
    h('button', { type: 'button', onclick: async () => { await flush(ctx); sel = s.id; lastSig = ''; render(ctx); } },
      h('span', { class: 'i num', text: two(i + 1) }), h('span', { class: 't num', text: mmss(times[i].start) }),
      h('span', { class: 'ti', text: s.title }), h('span', { class: 'k', text: s.kind }), h('span', { class: 'm', text: s.minutes + "'" }),
      s.script ? null : h('span', { class: 'flag', text: 'NO SCRIPT' })))));
  const total = times.at(-1)?.end || 0;
  $('#seTotal').textContent = `${r.segments.length} segments · ${Math.round(total / 60)} min`;

  // editor form
  const seg = r.segments.find(s => s.id === sel), i = r.segments.indexOf(seg);
  if (!seg) { fill($('#seForm'), h('p', { class: 'hint', text: 'No segment selected' })); return; }
  const c = seg.cues || {};
  const inp = (id, v, attrs = {}) => { const e = h('input', { class: 'in', id, ...attrs }); e.value = v ?? ''; return e; };
  const ta = (id, v, rows, attrs = {}) => { const e = h('textarea', { class: 'in', id, rows: String(rows), ...attrs }); e.value = v ?? ''; return e; };
  const select = (id, opts, v) => { const e = h('select', { class: 'in', id }, ...opts.map(([val, text]) => h('option', { value: val, text }))); e.value = v ?? ''; if (e.value !== (v ?? '')) { e.prepend(h('option', { value: v, text: v + ' (not found)' })); e.value = v; } return e; };
  const scenes = (S.obs.scenes || []).map(x => x.name || x);
  const audio = (S.media?.audio || []), video = (S.media?.video || []);
  const mediaOpts = list => [['', '— none —'], ...list.map(x => [x.id, `${x.id} — ${x.title}${x.available ? '' : ' (NOT AVAILABLE)'}`])];
  const field = (label, el, hint) => h('label', { class: 'field' }, h('span', { class: 'label', text: label }), el, hint ? h('span', { class: 'hint', text: hint }) : null);
  const form = h('div', { class: 'se-form' + (locked ? ' locked' : '') },
    h('div', { class: 'se-segh' }, h('strong', { text: `SEGMENT ${two(i + 1)}` }), h('span', { class: 'hint', text: `Planned ${mmss(times[i].start)}–${mmss(times[i].end)}` }), h('span', { class: 'grow' }),
      h('button', { type: 'button', class: 'b xs quiet', text: '↑', disabled: locked || i === 0, 'aria-label': 'Move up', onclick: e => act(e.currentTarget, () => ctx.conn.send({ t: 'rundown', action: 'move', index: i, to: i - 1 })) }),
      h('button', { type: 'button', class: 'b xs quiet', text: '↓', disabled: locked || i === r.segments.length - 1, 'aria-label': 'Move down', onclick: e => act(e.currentTarget, () => ctx.conn.send({ t: 'rundown', action: 'move', index: i, to: i + 1 })) }),
      h('button', { type: 'button', class: 'b xs danger', text: 'Delete', disabled: locked, onclick: e => { if (confirmTwice(e.currentTarget, 'Delete? Click again')) act(e.currentTarget, () => ctx.conn.send({ t: 'rundown', action: 'remove', index: i })); } })),
    h('div', { class: 'fields four' },
      field('Title', inp('sfTitle', seg.title, { maxlength: '80' })),
      field('Kind', select('sfKind', [...new Set([...KINDS, seg.kind])].map(k => [k, k]), seg.kind)),
      field('Minutes', inp('sfMinutes', seg.minutes, { type: 'number', min: '0', max: '600', step: '0.5' })),
      field('Lead', select('sfLead', Object.entries(LEAD), seg.lead))),
    field('Presenters', inp('sfPresenters', seg.presenters, { maxlength: '120', placeholder: "e.g. ANDY'K + GEORGIE" })),
    field('Spoken script — scripted dialogue', ta('sfScript', seg.script, 9, { maxlength: '20000', class: 'in mono' }),
      "Start a line with ANDY'K: or GEORGIE: for the speaker. Lines starting [DIRECTOR] are instructions: never in the teleprompter, never shown to Georgie."),
    field('Talking points — unscripted', ta('sfPoints', seg.talkingPoints, 3, { maxlength: '6000' })),
    h('div', { class: 'fields two' }, field('Guest', inp('sfGuest', seg.guest?.name, { maxlength: '120' })), field('Guest details', inp('sfGuestDetails', seg.guest?.details, { maxlength: '2000' }))),
    field('Questions — one per line', ta('sfQuestions', (seg.questions || []).join('\n'), 3)),
    h('fieldset', { class: 'cues-f' }, h('legend', { text: 'Cues — fired together by GO in Show Control' }),
      h('div', { class: 'fields three' },
        field('OBS scene', select('sfScene', [['', '— none —'], ...scenes.map(n => [n, n])], c.scene)),
        field('Jingle', select('sfJingle', mediaOpts(audio), c.jingle)),
        field('Video', select('sfVideo', mediaOpts(video), c.video))),
      h('div', { class: 'fields three' },
        field('Video mode', select('sfMode', [['once', 'Play once'], ['loop', 'Loop']], c.mode || 'once')),
        field('Sound', select('sfAudio', [['wav', 'Jingle WAV'], ['video', "Video's own sound"], ['both', 'Both (check for double audio)']], c.audioMode || 'wav')),
        field('Music', inp('sfMusic', c.music, { maxlength: '300', placeholder: 'Track or DJ set' }))),
      seg.kind === 'BREAK' ? h('div', { class: 'fields two' },
        field('Return jingle (RETURN TO LIVE)', select('sfRetJingle', mediaOpts(audio), c.returnJingle)),
        field('Return video', select('sfRetVideo', mediaOpts(video), c.returnVideo))) : null),
    field('Director instructions — only you see these', ta('sfDirector', seg.director, 3, { maxlength: '4000' })),
    h('div', { class: 'fields two' }, field('Closing line', inp('sfClosing', seg.closing, { maxlength: '2000' })), field('Notes (Georgie sees these)', inp('sfNotes', seg.notes, { maxlength: '2000' }))));
  for (const el of form.querySelectorAll('input, textarea, select')) {
    if (locked) el.disabled = true;
    else el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => changed(ctx));
  }
  fill($('#seForm'), form);
}
