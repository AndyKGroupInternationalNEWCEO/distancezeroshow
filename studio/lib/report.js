// Rehearsal report as one self-contained HTML file (opens offline, prints cleanly). Text only:
// the studio never records the private call's audio or video.
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (t, tz) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(t);
const hm = (t, tz = 'Europe/Vienna') => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(t);
export const duration = ms => { const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; return (h ? h + ' h ' : '') + m + ' min ' + (s % 60) + ' s'; };
const LABEL = { pass: 'PASS', warn: 'WARNING', fail: 'FAILED', untested: 'NOT TESTED', running: 'RUNNING' };

export function renderReportHtml(r) {
  const rows = (items, cells) => items.map(i => `<tr>${cells(i).map(c => `<td>${c}</td>`).join('')}</tr>`).join('');
  const sum = r.summary;
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>DISTANCE // ZERO — Rehearsal report ${esc(fmt(r.startedAt, 'Europe/Vienna'))}</title>
<style>
:root{--ink:#111317;--dim:#5c626b;--line:#d9dce1;--amber:#c97d2f;--ice:#4f78a8;--red:#c3262e;--green:#1f9a6e;--warn:#b98a12}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 "Helvetica Neue",Helvetica,Arial,sans-serif;color:var(--ink);background:#fff}
main{max-width:980px;margin:0 auto;padding:40px 32px 60px}
header{border-bottom:3px solid;border-image:linear-gradient(90deg,var(--amber),var(--ice)) 1;padding-bottom:18px;margin-bottom:26px}
.mark{font-weight:900;font-size:32px;letter-spacing:.02em}.kicker{letter-spacing:.24em;text-transform:uppercase;font-size:11px;color:var(--dim)}
h1{font-size:26px;margin:6px 0 4px;letter-spacing:.02em;text-transform:uppercase}
h2{font-size:12px;letter-spacing:.24em;text-transform:uppercase;color:var(--dim);margin:34px 0 10px;border-bottom:1px solid var(--line);padding-bottom:6px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);border:1px solid var(--line)}
.grid div{background:#fff;padding:12px 14px}.grid b{display:block;font-size:22px;font-weight:300}.grid span{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim)}
table{width:100%;border-collapse:collapse}
.cks td:nth-child(1){width:96px}.cks td:nth-child(2){width:210px}.cks td:nth-child(4){width:80px}td{padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
.st{font-weight:800;font-size:11px;letter-spacing:.14em;white-space:nowrap}.pass{color:var(--green)}.warn{color:var(--warn)}.fail{color:var(--red)}.untested{color:var(--dim)}
.critical{color:var(--red);font-weight:700}.urgent{color:var(--amber);font-weight:700}.normal{color:var(--ice);font-weight:700}
.empty{color:var(--dim);font-style:italic}.mono{font-family:Menlo,monospace;font-size:13px;white-space:nowrap}
ul{margin:0;padding-left:20px}li{margin:4px 0}
footer{margin-top:40px;font-size:12px;color:var(--dim)}
@media print{main{padding:0}h2{break-after:avoid}tr{break-inside:avoid}}
</style></head><body><main>
<header><div class="mark">D//0</div><div class="kicker">DISTANCE // ZERO // Vienna — Melbourne</div>
<h1>Rehearsal report</h1>
<div>${esc(fmt(r.startedAt, 'Europe/Vienna'))} Vienna · ${esc(fmt(r.startedAt, 'Australia/Melbourne'))} Melbourne</div></header>

<div class="grid">
<div><span>Duration</span><b>${esc(duration(r.endedAt - r.startedAt))}</b></div>
<div><span>Interruptions</span><b>${sum.interruptions}</b></div>
<div><span>HELP requests</span><b>${sum.help}</b></div>
<div><span>Checks passed</span><b>${sum.passed} / ${sum.checks}</b></div>
</div>

<h2>Outstanding issues</h2>
${r.outstanding.length ? `<ul>${r.outstanding.map(o => `<li>${esc(o)}</li>`).join('')}</ul>` : '<p class="empty">None. Everything that was checked passed.</p>'}

<h2>Pre-show checks</h2>
<table class="cks">${rows(r.checks, c => [`<span class="st ${esc(c.status)}">${LABEL[c.status] || esc(c.status)}</span>`, `<b>${esc(c.name)}</b>`, esc(c.detail || ''), `<span class="mono">${c.at ? esc(hm(c.at)) : '—'}</span>`])}</table>

<h2>Connection interruptions</h2>
${r.interruptions.length ? `<table>${rows(r.interruptions, i => [`<b>${esc(i.what)}</b>`, `<span class="mono">${esc(hm(i.from))} → ${i.to ? esc(hm(i.to)) : 'not restored'}</span>`, i.to ? esc(duration(i.to - i.from)) : '<span class="fail">open at the end</span>'])}</table>` : '<p class="empty">No interruptions recorded.</p>'}

<h2>HELP requests</h2>
${r.help.length ? `<table>${rows(r.help, h => [`<span class="${esc(h.level)}">${esc(h.level.toUpperCase())}</span>${h.auto ? ' <span class="kicker">auto</span>' : ''}`, esc(h.text || h.kind), `<span class="mono">${esc(hm(h.at))}</span>`, h.ackAt ? `seen after ${esc(duration(h.ackAt - h.at))}` : h.status === 'resolved' ? esc(h.note || 'resolved') : '<span class="fail">not answered</span>'])}</table>` : '<p class="empty">No HELP requests.</p>'}

<h2>Technical warnings</h2>
${r.warnings.length ? `<table>${rows(r.warnings, w => [`<span class="mono">${esc(hm(w.ts))}</span>`, `<span class="${w.level === 'bad' || w.level === 'critical' ? 'fail' : 'warn'}">${esc(w.text)}</span>`])}</table>` : '<p class="empty">No warnings.</p>'}

<h2>Private call</h2>
<p>${r.call.connected ? `Connected ${r.call.count} time(s), ${esc(r.call.route || 'route unknown')}${r.call.rtt ? `, round trip ${r.call.rtt} ms` : ''}${r.call.screen ? ', screen sharing tested' : ''}.` : 'No private call was connected during this rehearsal.'}</p>

<h2>Timeline</h2>
<table>${rows(r.timeline, t => [`<span class="mono">${esc(hm(t.ts))}</span>`, `<span class="${t.level === 'bad' || t.level === 'critical' ? 'fail' : t.level === 'warn' ? 'warn' : ''}">${esc(t.text)}</span>`])}</table>

<footer>Generated ${esc(fmt(r.generatedAt, 'Europe/Vienna'))} by DISTANCE // ZERO Director Studio. No audio or video was recorded; this report contains text only.
Rehearsal mode keeps the YouTube stream and OBS recording locked.</footer>
</main></body></html>`;
}
