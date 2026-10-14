// SHOW CLOCK — one calculation for the server and every dashboard, so all screens agree to the second.
// Planned times come from the episode's segment minutes; actual times from when the Director started the show
// and each segment. Nothing here moves the show on: segments change only when the Director confirms.
export const ON_TIME_SEC = 30;   // within ±30 s of the plan counts as ON TIME

export function plan(segments) {
  let t = 0;
  return segments.map(s => { const start = t; t += (Number(s.minutes) || 0) * 60; return { start, end: t }; });
}

export function showClock(segments, pos, now = Date.now()) {
  const tl = plan(segments), total = tl.at(-1)?.end || 0;
  const i = pos?.index ?? -1, seg = segments[i];
  if (!pos?.showStartedAt || !seg) return { running: false, total, next: segments[i + 1] ? { index: i + 1, title: segments[i + 1].title } : null };
  const elapsed = Math.max(0, Math.floor((now - pos.showStartedAt) / 1000));
  const segElapsed = Math.max(0, Math.floor((now - (pos.segmentStartedAt || now)) / 1000));
  const planned = tl[i].end - tl[i].start;
  const remaining = planned - segElapsed;                       // below zero = overrun
  const startedLate = Math.round(((pos.segmentStartedAt || now) - pos.showStartedAt) / 1000) - tl[i].start;
  const deviation = startedLate + Math.max(0, -remaining);      // seconds behind the plan (negative: ahead)
  const status = Math.abs(deviation) < ON_TIME_SEC ? 'ON TIME' : deviation > 0 ? 'BEHIND SCHEDULE' : 'AHEAD OF SCHEDULE';
  const n = segments[i + 1];
  return {
    running: true, total, elapsed, index: i, title: seg.title, kind: seg.kind,
    planned, segElapsed, remaining, overrun: Math.max(0, -remaining),
    plannedStart: tl[i].start, plannedEnd: tl[i].end,
    deviation, status, label: status === 'ON TIME' ? 'ON TIME' : `${mmss(Math.abs(deviation))} ${status}`,
    next: n ? { index: i + 1, title: n.title, kind: n.kind, minutes: n.minutes } : null,
  };
}

export function mmss(sec) {
  const s = Math.abs(Math.round(sec)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, r = s % 60;
  return (sec < 0 ? '−' : '') + (h ? `${h}:${String(m).padStart(2, '0')}` : String(m).padStart(2, '0')) + ':' + String(r).padStart(2, '0');
}
