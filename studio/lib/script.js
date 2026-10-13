// Show scripts: helpers for the episode script that lives inside the rundown (one script per episode, copied from the
// show's master: SUNDAY_MASTER_SCRIPT / FRIDAY_MASTER_SCRIPT in studio/shows/*.json; the master is never edited).
// Times are Europe/Vienna; the script locks exactly 180 minutes before the scheduled start (server clock).
export const LOCK_MINUTES = 180;
export const TZ = 'Europe/Vienna';

const str = (v, max = 4000) => String(v ?? '').slice(0, max);

// the instant of a wall-clock time in a time zone (DST-safe)
export function zoned(tz, y, mo, d, h, mi) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
    .formatToParts(guess).filter(x => x.type !== 'literal').map(x => [x.type, +x.value]));
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  const t = guess - (asUtc - guess);
  // second pass for times right at a DST change
  const p2 = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
    .formatToParts(t).filter(x => x.type !== 'literal').map(x => [x.type, +x.value]));
  return t - (Date.UTC(p2.year, p2.month - 1, p2.day, p2.hour, p2.minute) - Date.UTC(y, mo - 1, d, h, mi));
}
export function startInstant(date, time) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str(date, 10)), t = /^(\d{1,2}):(\d{2})$/.exec(str(time, 5));
  if (!m || !t) return null;
  return zoned(TZ, +m[1], +m[2], +m[3], +t[1], +t[2]);
}
export const lockAt = ep => (ep?.startAt ? ep.startAt - LOCK_MINUTES * 60000 : null);
export const isLocked = (ep, now = Date.now()) => { const l = lockAt(ep); return l != null && now >= l; };

// script fields of a segment (spoken text and talking points for the teleprompter; everything else is cues and notes)
export function cleanScript(s = {}) {
  const q = Array.isArray(s.questions) ? s.questions.map(x => str(x, 400)).filter(Boolean).slice(0, 40) : [];
  const c = s.cues || {};
  return {
    script: str(s.script, 20000), talkingPoints: str(s.talkingPoints, 6000),
    presenters: str(s.presenters, 120), guest: { name: str(s.guest?.name, 120), details: str(s.guest?.details, 2000) }, questions: q,
    cues: { jingle: str(c.jingle, 4), video: str(c.video, 4), scene: str(c.scene, 120), mode: c.mode === 'loop' ? 'loop' : 'once',
      audioMode: ['wav', 'video', 'both'].includes(c.audioMode) ? c.audioMode : 'wav', music: str(c.music, 300),
      // breaks only: what plays when the Director returns to live (WELCOME BACK), instead of the next segment's own jingle/video
      returnJingle: str(c.returnJingle, 4), returnVideo: str(c.returnVideo, 4),
      // when the cue's video is missing or fails: this one instead (partner break: the break card)
      fallbackVideo: str(c.fallbackVideo, 4), fallbackMode: c.fallbackMode === 'once' ? 'once' : 'loop' },
    director: str(s.director, 4000), closing: str(s.closing, 2000),
  };
}

export { speakerLines } from '../public/static/lines.js';

// split a plain-text script (from a PDF or pasted) into the episode's segments by their titles; nothing is applied here
export function splitBySegments(text, segments) {
  const key = s => s.toUpperCase().normalize('NFKD').replace(/[^A-Z0-9]+/g, ' ').trim();
  const titles = segments.map(s => ({ id: s.id, title: s.title, k: key(s.title) }));
  const parts = new Map(), order = [];
  let cur = null, intro = [];
  for (const raw of str(text, 400000).split(/\r?\n/)) {
    const k = key(raw);
    const hit = k && titles.find(t => t.k && (k === t.k || (k.length <= t.k.length + 18 && k.includes(t.k))));
    if (hit && !parts.has(hit.id)) { cur = hit.id; parts.set(cur, []); order.push(cur); continue; }
    (cur ? parts.get(cur) : intro).push(raw.replace(/\s+$/, ''));
  }
  const tidy = a => a.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return {
    segments: order.map(id => ({ segmentId: id, title: titles.find(t => t.id === id).title, text: tidy(parts.get(id)) })),
    unassigned: tidy(intro),
    missing: titles.filter(t => !parts.has(t.id)).map(t => t.title),
  };
}

// planned timeline: start/end of each segment in seconds from the show start
export function timeline(segments) {
  let t = 0;
  return segments.map(s => { const start = t; t += (Number(s.minutes) || 0) * 60; return { id: s.id, start, end: t }; });
}

const esc = s => str(s, 40000).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hms = sec => [Math.floor(sec / 3600), Math.floor(sec / 60) % 60, sec % 60].map(n => String(n).padStart(2, '0')).join(':');

// readable print/PDF version of an episode script
export function renderHtml(rundown, mediaTitle = id => id) {
  const ep = rundown.episode || {}, tl = timeline(rundown.segments);
  const rows = rundown.segments.map((s, i) => {
    const sc = cleanScript(s), t = tl[i];
    const cue = [sc.cues.scene && `OBS SCENE: ${esc(sc.cues.scene)}`, sc.cues.jingle && `JINGLE: ${esc(mediaTitle(sc.cues.jingle))}`,
      sc.cues.video && `VIDEO: ${esc(mediaTitle(sc.cues.video))}${sc.cues.mode === 'loop' ? ' (LOOP)' : ''}`, sc.cues.music && `MUSIC: ${esc(sc.cues.music)}`,
      sc.cues.returnJingle && `RETURN JINGLE: ${esc(mediaTitle(sc.cues.returnJingle))}`, sc.cues.returnVideo && `RETURN VIDEO: ${esc(mediaTitle(sc.cues.returnVideo))}`].filter(Boolean);
    return `<section><h2>SEGMENT ${String(i + 1).padStart(2, '0')} — ${esc(s.title)}</h2>
<p class="meta">PLANNED ${hms(t.start)}–${hms(t.end)} · ${s.minutes} MIN · ${esc(s.kind)}${sc.presenters ? ' · ' + esc(sc.presenters) : ''}</p>
${sc.guest.name ? `<p><b>GUEST:</b> ${esc(sc.guest.name)}${sc.guest.details ? ' — ' + esc(sc.guest.details) : ''}</p>` : ''}
${sc.script ? `<div class="spoken">${esc(sc.script).replace(/\n/g, '<br>')}</div>` : ''}
${sc.talkingPoints ? `<p><b>TALKING POINTS:</b><br>${esc(sc.talkingPoints).replace(/\n/g, '<br>')}</p>` : ''}
${sc.questions.length ? `<p><b>QUESTIONS:</b></p><ol>${sc.questions.map(q => `<li>${esc(q)}</li>`).join('')}</ol>` : ''}
${cue.length ? `<p class="cue">${cue.join(' · ')}</p>` : ''}
${sc.director ? `<p class="cue"><b>DIRECTOR:</b> ${esc(sc.director).replace(/\n/g, '<br>')}</p>` : ''}
${sc.closing ? `<p class="cue"><b>CLOSING:</b> ${esc(sc.closing)}</p>` : ''}</section>`;
  }).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(rundown.title)}</title><style>
body{font:11pt/1.45 -apple-system,Helvetica,Arial,sans-serif;color:#111;margin:18mm}h1{font-size:18pt;margin:0 0 4px}
.top{color:#555;margin-bottom:14px}h2{font-size:12.5pt;margin:18px 0 2px;border-top:1px solid #bbb;padding-top:10px}
.meta{color:#555;font-size:9pt;margin:0 0 6px;letter-spacing:.04em}.spoken{font-size:12pt;margin:6px 0}.cue{color:#7a4b00;font-size:9.5pt}
section{break-inside:avoid-page}</style></head><body>
<h1>${esc(rundown.title)}</h1><p class="top">EPISODE ${esc(ep.id || '—')} · ${esc((ep.format || '').toUpperCase())} · ${esc(ep.date || '')} ${esc(ep.start || '')} VIENNA · ${rundown.segments.length} SEGMENTS · ${Math.round(tl.at(-1)?.end / 60 || 0)} MIN</p>
${rows}</body></html>`;
}
