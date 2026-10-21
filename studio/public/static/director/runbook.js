// SHOW RUNBOOK (Show Control → Runbook): the PDF scenario of the selected show (or another show's, from the list),
// with section navigation and host notes. ⧉ Window opens the same reader on its own, for a second screen.
import { $, h } from '../common.js';
import { createRunbook } from '../runbook-view.js';

let rb, pickSig = '';
export function init(ctx) {
  rb = createRunbook($('#rbBody'), { conn: ctx.conn, show: S => $('#rbShow').value || S.showId });
  $('#rbShow').addEventListener('change', () => rb.update(ctx.S));
}

export function render(ctx) {
  const S = ctx.S, sel = $('#rbShow');
  const s = JSON.stringify([S.shows.map(x => x.id), S.showId]);
  if (s !== pickSig) {
    pickSig = s;
    sel.replaceChildren(...S.shows.map(x => h('option', { value: x.id, text: x.name })));
    sel.value = S.showId || S.shows[0]?.id || '';
  }
  const sum = S.runbooks?.[sel.value];
  const b = $('#rbBadge');
  b.textContent = sum ? `${sum.pages} pages · ${sum.sections} sections` : 'No PDF';
  b.className = 'badge ' + (sum ? (sum.intact ? 'live' : 'bad') : 'off');
  rb.update(S);
}
