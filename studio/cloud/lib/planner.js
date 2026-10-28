// Show Planner (Stage 2a, test data): upcoming episodes of the three formats. The director plans, the host reads.
// The formats' segment titles, kinds and lengths come from shows/*.json (read only); scripts and cues stay on the Mac.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const FORMATS = ['friday', 'saturday', 'sunday'];
const STATUS = ['planned', 'ready', 'cancelled'];
const DAY = { friday: 5, saturday: 6, sunday: 0 };
const START = { friday: '21:00', saturday: '20:00', sunday: '20:00' };
const str = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

export function createPlanner({ dataDir, showsDir, today = () => new Date() }) {
  const formats = Object.fromEntries(FORMATS.map(id => {
    const j = JSON.parse(fs.readFileSync(path.join(showsDir, id + '.json'), 'utf8'));
    const segs = j.rundown.segments || j.rundown;
    return [id, { id, name: j.name, segments: segs.map(s => ({ title: s.title, kind: s.kind, minutes: Number(s.minutes) || 0 })) }];
  }));
  const file = path.join(dataDir, 'plans.json');
  const save = () => { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify(plans, null, 2)); fs.renameSync(file + '.tmp', file); };
  const next = (dow) => { const d = new Date(today()); d.setDate(d.getDate() + ((dow - d.getDay() + 7) % 7 || 7)); return d.toISOString().slice(0, 10); };
  let plans;
  try { plans = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch {
    // the first start: one test episode of each format in the coming week
    plans = FORMATS.map(f => blank(f, next(DAY[f]), START[f], `${formats[f].name} (test episode)`)); save();
  }
  function blank(format, date, start, title) {
    return { id: crypto.randomBytes(6).toString('hex'), format, date, start, title, status: 'planned', notes: '', test: true,
      segments: formats[format].segments.map(s => ({ ...s })) };
  }
  function check(p) {
    if (!FORMATS.includes(p.format)) throw new Error('No such show format');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date) || Number.isNaN(Date.parse(p.date))) throw new Error('Date must be YYYY-MM-DD');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(p.start)) throw new Error('Start must be HH:MM');
    if (!STATUS.includes(p.status)) throw new Error('No such status');
    if (!Array.isArray(p.segments) || p.segments.length > 60) throw new Error('Segments: a list of at most 60');
    return p;
  }
  const segment = s => ({ title: str(s?.title, 120) || 'Segment', kind: str(s?.kind, 12) || 'TALK', minutes: Math.max(0, Math.min(240, Math.round((Number(s?.minutes) || 0) * 2) / 2)) });
  const find = id => { const p = plans.find(x => x.id === id); if (!p) throw new Error('No such episode'); return p; };

  return {
    formats: () => formats,
    list: () => [...plans].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)),
    create(b) {
      const f = FORMATS.includes(b?.format) ? b.format : null; if (!f) throw new Error('No such show format');
      const p = check(blank(f, str(b.date, 10), str(b.start, 5) || START[f], str(b.title, 120) || formats[f].name));
      plans.push(p); save(); return p;
    },
    update(id, b) {
      const p = find(id);
      const n = check({ ...p,
        ...(b.title != null && { title: str(b.title, 120) || p.title }), ...(b.date != null && { date: str(b.date, 10) }),
        ...(b.start != null && { start: str(b.start, 5) }), ...(b.status != null && { status: str(b.status, 12) }),
        ...(b.notes != null && { notes: str(b.notes, 2000) }), ...(Array.isArray(b.segments) && { segments: b.segments.map(segment) }) });
      Object.assign(p, n); save(); return p;
    },
    remove(id) { find(id); plans = plans.filter(x => x.id !== id); save(); },
  };
}
