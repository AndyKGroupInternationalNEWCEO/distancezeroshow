// The real DISTANCE // ZERO broadcast schedule, the same official rule as the main website (data/programme-2027.json),
// the Marketing Studio and the Broadcast Studio (Andy, 29 Oct 2026, final): the first broadcast (launch) on 27 January
// 2027, 10:00 Vienna (confirmed on the site); the opening week's shows on 29, 30 and 31 January; from February the THIRD
// FRIDAY of every month defines the production week: Friday, Saturday and Sunday shows. No weekly shows. Times are shown
// only where confirmed (the launch); the other dates say "time to be announced".

export const SHOW = {
  launch: '2027-01-27T10:00:00+01:00',
  minutes: 120,
  livePage: 'https://distancezeroshow.com/#live',
  calendar: 'https://distancezeroshow.com/distance-zero.ics',
};
const OPENING = ['2027-01-29', '2027-01-30', '2027-01-31'];
const pad = n => String(n).padStart(2, '0');

// the instant a wall-clock time in a time zone happens
function zoned(tz, y, mo, d, h, mi) {
  const guess = Date.UTC(y, mo, d, h, mi);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
    .formatToParts(guess).map(x => [x.type, +x.value]));
  return guess - (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - guess);
}
const dayStart = iso => zoned('Europe/Vienna', +iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10), 0, 0);

// the production week's show days of a month (m: 0-11): the third Friday (15th-21st) and the Saturday / Sunday after it
export function productionWeek(y, m) {
  const first = new Date(Date.UTC(y, m, 1)).getUTCDay(), fri = 1 + (5 - first + 7) % 7 + 14;
  return [0, 1, 2].map(n => { const d = new Date(Date.UTC(y, m, fri + n)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; });
}

// is this start a confirmed time (only the launch so far)?
export const isTimed = t => t === new Date(SHOW.launch).getTime();

// the next `count` broadcasts that have not ended yet: the launch at its time, every other show at 00:00 Vienna of its day
export function upcoming(now = Date.now(), count = 3) {
  const L = new Date(SHOW.launch).getTime(), out = [];
  if (now < L + SHOW.minutes * 6e4) out.push(L);
  const days = [...OPENING];
  for (let y = 2027, m = 1; days.length < 3 * 48; m === 11 ? (y++, m = 0) : m++) days.push(...productionWeek(y, m));
  for (const d of days) { if (out.length >= count) break; const t = dayStart(d); if (t > L && now < t + 864e5) out.push(t); }
  return out.slice(0, count);
}

// is a scheduled broadcast running right now? (only with a confirmed time)
export function onAirNow(now = Date.now()) {
  const next = upcoming(now, 1)[0];
  return next !== undefined && isTimed(next) && now >= next && now < next + SHOW.minutes * 6e4;
}
