// The real DISTANCE // ZERO broadcast schedule, the same rules as the main website (distancezeroshow.com):
// first show 27 January 2027, 10:00 Vienna; then every third Sunday of the month, 10:00 Vienna, 120 minutes.
// Keep in step with DZ.launch / DZ.schedule in the main site's index.html.

export const SHOW = {
  launch: '2027-01-27T10:00:00+01:00',
  schedule: { nth: 3, weekday: 0, hour: 10, minute: 0, tz: 'Europe/Vienna', minutes: 120 },
  livePage: 'https://distancezeroshow.com/#live',
  calendar: 'https://distancezeroshow.com/distance-zero.ics',
};

// the instant a wall-clock time in a time zone happens
function zoned(tz, y, mo, d, h, mi) {
  const guess = Date.UTC(y, mo, d, h, mi);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
    .formatToParts(guess).map(x => [x.type, +x.value]));
  return guess - (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - guess);
}

// the next `count` broadcasts that have not ended yet (start times, ms)
export function upcoming(now = Date.now(), count = 3) {
  const L = new Date(SHOW.launch).getTime(), S = SHOW.schedule, len = S.minutes * 6e4, out = [];
  if (now < L + len) out.push(L);
  const v = new Date(L);
  for (let k = 0; k < 48 && out.length < count; k++) {
    const y = v.getUTCFullYear(), mo = v.getUTCMonth() + k, first = new Date(Date.UTC(y, mo, 1)).getUTCDay();
    const day = 1 + (S.weekday - first + 7) % 7 + (S.nth - 1) * 7, t = zoned(S.tz, y, mo, day, S.hour, S.minute);
    if (t > L && now < t + len && !out.includes(t)) out.push(t);
  }
  return out.slice(0, count);
}

// is a scheduled broadcast running right now?
export function onAirNow(now = Date.now()) {
  const next = upcoming(now, 1)[0];
  return next !== undefined && now >= next && now < next + SHOW.schedule.minutes * 6e4;
}
