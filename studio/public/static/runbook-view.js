// SHOW RUNBOOK reader: the show's PDF script as it looks (a picture of each page, made from the PDF) with its sections
// for navigation, the words of the chosen section, and the Director's own notes to it. The PDF itself is never changed;
// "Open PDF" shows the original file. Used in Show Control → Runbook and in its own window (/runbook-view).
import { h, act, fill, toast } from './common.js';

export function createRunbook(root, { conn, show: getShow }) {
  let data = null, loadedSig = '', at = 0, pg = 1, show = '';
  const el = { head: h('div', { class: 'rb-head' }), nav: h('ol', { class: 'rb-nav' }), page: h('div', { class: 'rb-page' }), side: h('div', { class: 'rb-side' }) };
  fill(root, el.head, h('div', { class: 'rb-body' }, el.nav, h('div', { class: 'rb-main' }, el.page, el.side)));

  const upload = h('input', { type: 'file', accept: 'application/pdf,.pdf', hidden: true });
  upload.addEventListener('change', async () => {
    const f = upload.files[0]; upload.value = ''; if (!f) return;
    await act(null, async () => {
      const r = await fetch(`/runbook/upload?show=${encodeURIComponent(show)}&name=${encodeURIComponent(f.name)}`, { method: 'POST', body: f, headers: { 'Content-Type': 'application/pdf' } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || 'Upload failed');
      loadedSig = ''; await load(true);
    }, 'Runbook added — the PDF is kept exactly as it is');
  });
  root.append(upload);

  async function load(force = false) {
    if (!show) return;
    const r = await conn.send({ t: 'runbook.get', show }).catch(e => { toast(e.message, 'bad'); return undefined; });
    if (r === undefined) return;
    data = r || null;
    if (data && (force || !data.sections.some((s, i) => i === at))) at = 0;
    draw();
  }
  // the words of one section (worked out by the studio when the PDF was added: up to the next heading)
  const words = i => data.sections[i]?.text || '';
  function go(i) { if (!data?.sections[i]) return; at = i; draw(); }

  function draw() {
    const pick = h('button', { type: 'button', class: 'b sm', text: data ? 'Replace PDF' : 'Add runbook PDF', onclick: () => upload.click() });
    if (!data) {
      fill(el.head, h('div', { class: 'row' }, h('b', { class: 'grow', text: 'No runbook for this show yet' }), pick));
      fill(el.nav); fill(el.page, h('p', { class: 'hint', text: 'Add the show\'s PDF scenario. It is kept unchanged; the studio only reads its text and pictures of its pages for this view.' })); fill(el.side);
      return;
    }
    const s = data.sections[at];
    fill(el.head, h('div', { class: 'row wrap' },
      h('b', { class: 'grow', text: data.name }),
      h('span', { class: 'badge ' + (data.intact ? 'live' : 'bad'), text: data.intact ? `${data.pages} pages · unchanged` : 'FILE CHANGED ON DISK' , title: 'SHA-256 ' + data.sha256 }),
      h('a', { class: 'b sm quiet', href: `/runbook/${show}.pdf`, target: '_blank', rel: 'noopener', text: 'Open PDF' }),
      h('a', { class: 'b sm quiet', href: `/runbook-view?show=${show}`, target: 'dz-runbook-' + show, rel: 'noopener', text: '⧉ Window' }),
      pick));
    fill(el.nav, ...(data.sections.length ? data.sections.map((x, i) => h('li', { class: (i === at ? 'cur ' : '') + 'l' + x.level },
      h('button', { type: 'button', text: x.title, title: 'Page ' + x.page, onclick: () => go(i) }), data.notes[x.key] ? h('i', { class: 'dot', title: 'Has a note' }) : null))
      : [h('li', { class: 'hint', text: 'No section headings found: use the page buttons.' })]),
      h('li', { class: 'pages' }, ...Array.from({ length: data.pages }, (_, p) => h('button', { type: 'button', class: 'b xs quiet', text: String(p + 1), onclick: () => {
        const i = data.sections.findIndex(x => x.page === p + 1); if (i >= 0) go(i); else { at = -1; pg = p + 1; draw(); } } }))));
    const page = s ? s.page : pg;
    fill(el.page, h('img', { src: `/runbook/${show}/page/${page}.png?v=${data.uploadedAt}`, alt: `Runbook page ${page}`, loading: 'lazy' }));
    const note = h('textarea', { class: 'in', rows: '5', maxlength: '6000', placeholder: 'Your note to this part (only in the studio; the PDF is not changed)' });
    note.value = (s && data.notes[s.key]) || '';
    const save = h('button', { type: 'button', class: 'b sm primary', text: 'Save note', disabled: !s, onclick: e => act(e.currentTarget, async () => {
      await conn.send({ t: 'runbook.note', show, key: s.key, text: note.value });
      if (note.value.trim()) data.notes[s.key] = note.value; else delete data.notes[s.key];
    }, 'Note saved') });
    fill(el.side,
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'b sm', text: '◀ Previous', disabled: !(at > 0), onclick: () => go(at - 1) }),
        h('span', { class: 'grow hint', text: s ? `Page ${s.page} · ${at + 1} / ${data.sections.length}` : `Page ${page}` }),
        h('button', { type: 'button', class: 'b sm', text: 'Next ▶', disabled: !(at >= 0 && at < data.sections.length - 1), onclick: () => go(at + 1) })),
      s ? h('h3', { class: 'rb-title', text: s.title }) : null,
      h('pre', { class: 'rb-text', text: s ? words(at) : (data.text[page - 1] || '') }),
      h('span', { class: 'label', text: 'Host notes' }), note, h('div', { class: 'row end mt' }, save));
  }

  return {
    // called with the studio state: loads when the show or its runbook changes
    update(S) {
      const want = getShow(S) || '';
      const sum = S.runbooks?.[want] || null;
      const sig = want + '|' + (sum?.uploadedAt || 0);
      if (sig === loadedSig) return;
      loadedSig = sig; show = want;
      if (!sum) { data = null; draw(); return; }
      load(true);
    },
    reload: () => { loadedSig = ''; },
  };
}
