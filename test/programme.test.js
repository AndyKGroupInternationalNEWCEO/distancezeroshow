// node --test test/
// Programme 2027: dates generated from data/programme-2027.json, time zones, and that nothing unconfirmed is shown.

const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../data/programme.js');
const DATA = require('../data/programme-2027.json');
const clone = () => JSON.parse(JSON.stringify(DATA));

test('January: the confirmed opening week only; from February the week of the third Friday, never weekly', () => {
  const all = P.build(DATA);
  assert.equal(all[0].date, '2027-01-27'); assert.equal(all[0].name, 'OPENING SHOW — REHEARSAL'); assert.ok(all[0].special);
  assert.deepEqual(all.filter(e => e.date < '2027-02-01').map(e => e.date), ['2027-01-27', '2027-01-29', '2027-01-30', '2027-01-31']);
  assert.ok(!all.some(e => e.date >= '2027-01-13' && e.date <= '2027-01-17'), 'no regular week in January');
  const regular = all.filter(e => e.date >= '2027-02-01');
  assert.equal(regular.length, 33, '11 months × Friday, Saturday, Sunday');
  const wd = { dj: 5, piano: 6, main: 0 };
  regular.forEach(e => assert.equal(new Date(e.date + 'T00:00:00Z').getUTCDay(), wd[e.format], e.date));
  // every Friday show is the third Friday of its month (15th–21st), Saturday and Sunday follow it
  regular.filter(e => e.format === 'dj').forEach(e => { const d = +e.date.slice(8); assert.ok(d >= 15 && d <= 21, e.date); });
  assert.equal(new Set(all.map(e => e.date)).size, all.length, 'no duplicate dates');
  assert.equal(all.filter(e => e.special).length, 1, 'only the named opening rehearsal is a special');
  assert.ok(!all.some(e => e.rehearsal), 'rehearsals are not in the public programme');
});

test('the approved examples: February, March, May and August 2027', () => {
  const w = (y, m) => P.productionWeek(y, m);
  assert.deepEqual(w(2027, 2), { rehearsal: '2027-02-17', friday: '2027-02-19', saturday: '2027-02-20', sunday: '2027-02-21' });
  assert.deepEqual(w(2027, 3), { rehearsal: '2027-03-17', friday: '2027-03-19', saturday: '2027-03-20', sunday: '2027-03-21' });
  assert.deepEqual(w(2027, 5), { rehearsal: '2027-05-19', friday: '2027-05-21', saturday: '2027-05-22', sunday: '2027-05-23' }, 'May starts on a Saturday');
  assert.deepEqual(w(2027, 8), { rehearsal: '2027-08-18', friday: '2027-08-20', saturday: '2027-08-21', sunday: '2027-08-22' }, 'August starts on a Sunday');
  // the whole week always stays inside its month, every year
  for (let y = 2027; y <= 2035; y++) for (let m = 1; m <= 12; m++) {
    const x = w(y, m); for (const d of Object.values(x)) assert.equal(+d.slice(5, 7), m, `${y}-${m}`);
  }
  const withR = P.build(DATA, { rehearsals: true }).filter(e => e.rehearsal);
  assert.equal(withR.length, 11); assert.ok(withR.every(e => new Date(e.date + 'T00:00:00Z').getUTCDay() === 3));
});

test('first confirmed topics, everything else unannounced', () => {
  const all = P.build(DATA), by = Object.fromEntries(all.map(e => [e.date, e]));
  assert.equal(by['2027-01-29'].title, 'DJ Andy’K presents: DEEP CONNECTIONS (Official Version)'); assert.equal(by['2027-01-29'].name, 'DJ SHOW');
  assert.equal(by['2027-01-29'].details.length, 3); assert.match(by['2027-01-29'].note, /^Next evening: .*Piano Edition\.$/);
  assert.equal(by['2027-01-30'].title, 'DJ Andy’K presents: DEEP CONNECTIONS (Piano Edition)'); assert.equal(by['2027-01-30'].name, 'PIANO SESSIONS');
  assert.equal(by['2027-01-30'].details.length, 5); assert.equal(by['2027-01-30'].note, 'No original electronic recordings will be played during the piano concert.');
  assert.deepEqual(by['2027-01-31'].details, ['The format follows the 27 January opening.'], 'a single string still works');
  for (const d of ['2027-01-29', '2027-01-30']) { const e = by[d]; assert.ok(!e.start && !e.watchUrl && !e.recordingUrl && !e.calendar, d + ': time TBA, no links'); }
  assert.equal(by['2027-01-31'].title, 'Main Show'); assert.equal(by['2027-01-31'].name, 'DISTANCE // ZERO MAIN SHOW');
  const rest = all.filter(e => !['2027-01-27', '2027-01-29', '2027-01-30', '2027-01-31'].includes(e.date));
  rest.forEach(e => { assert.equal(e.announced, false, e.date); assert.equal(e.title, ''); });
});

test('no times, no buttons until the data has them', () => {
  P.build(DATA).forEach(e => {
    assert.equal(e.start, undefined, e.date); assert.equal(e.calendar, false);
    assert.equal(e.watchUrl, undefined); assert.equal(e.recordingUrl, undefined);
    assert.equal(P.ics(e, 'https://distancezeroshow.com/'), null);
  });
});

test('a confirmed Vienna time gives the right Melbourne time, across both daylight-saving changes', () => {
  const d = clone();
  Object.assign(d.episodes, { '2027-01-29': { time: '20:00' }, '2027-04-16': { time: '20:00' }, '2027-07-16': { time: '20:00' }, '2027-10-17': { time: '10:00' } });
  const by = Object.fromEntries(P.build(d).map(e => [e.date, e]));
  assert.deepEqual([by['2027-01-29'].vienna.time, by['2027-01-29'].vienna.zone], ['20:00', 'CET']);
  assert.deepEqual([by['2027-01-29'].melbourne.weekday, by['2027-01-29'].melbourne.time, by['2027-01-29'].melbourne.zone], ['Sat', '06:00', 'AEDT']);
  assert.equal(by['2027-01-29'].start.toISOString(), '2027-01-29T19:00:00.000Z');
  assert.deepEqual([by['2027-04-16'].vienna.zone, by['2027-04-16'].melbourne.time, by['2027-04-16'].melbourne.zone], ['CEST', '04:00', 'AEST'], 'both switched (28 Mar / 4 Apr)');
  assert.deepEqual([by['2027-07-16'].vienna.zone, by['2027-07-16'].melbourne.time, by['2027-07-16'].melbourne.zone], ['CEST', '04:00', 'AEST']);
  assert.deepEqual([by['2027-10-17'].melbourne.time, by['2027-10-17'].melbourne.zone], ['19:00', 'AEDT'], 'Melbourne back on AEDT from 3 Oct, Vienna still CEST');
});

test('buttons appear only with valid data; malformed values are ignored', () => {
  const d = clone();
  Object.assign(d.episodes, {
    '2027-02-19': { time: '20:00', calendar: true, watchUrl: 'https://youtube.com/live/x', recordingUrl: 'https://youtube.com/watch?v=y' },
    '2027-02-20': { time: '8pm', calendar: true, watchUrl: 'javascript:alert(1)' },
    '2027-02-21': { time: '20:00', calendar: true, cancelled: true },
  });
  const by = Object.fromEntries(P.build(d).map(e => [e.date, e]));
  assert.ok(by['2027-02-19'].calendar); assert.equal(by['2027-02-19'].watchUrl, 'https://youtube.com/live/x'); assert.ok(by['2027-02-19'].recordingUrl);
  assert.equal(by['2027-02-20'].start, undefined); assert.equal(by['2027-02-20'].calendar, false); assert.equal(by['2027-02-20'].watchUrl, undefined);
  assert.equal(by['2027-02-21'].calendar, false); assert.ok(by['2027-02-21'].cancelled);

  const ics = P.ics(by['2027-02-19'], 'https://distancezeroshow.com/#programme');
  assert.match(ics, /DTSTART:20270219T190000Z\r\nDTEND:20270219T210000Z/);
  assert.match(ics, /SUMMARY:DISTANCE \/\/ ZERO — DJ SHOW/);
  assert.match(ics, /UID:2027-02-19-dj@distancezeroshow.com/);
});

test('data file stays editable by hand: valid JSON with the expected keys', () => {
  for (const k of ['timezone', 'secondTimezone', 'monthlyFrom', 'rule', 'until', 'formats', 'episodes']) assert.ok(k in DATA, k);
  assert.ok(!('regularFrom' in DATA), 'no weekly generator any more');
  Object.keys(DATA.episodes).forEach(k => assert.match(k, /^2027-\d{2}-\d{2}$/));
});

test('search engines get one Event per announced, not cancelled broadcast', () => {
  const url = 'https://distancezeroshow.com/', ld = P.schema(P.build(DATA), url);
  assert.deepEqual(ld.map(e => e.startDate), ['2027-01-27', '2027-01-29', '2027-01-30', '2027-01-31'], 'date only while the time is TBA');
  ld.shift();
  assert.equal(ld[0].name, 'DISTANCE // ZERO — DJ SHOW: DJ Andy’K presents: DEEP CONNECTIONS (Official Version)');
  assert.equal(ld[0].location.url, url + '#p-2027-01-29'); assert.ok(!ld[0].endDate);
  const d = clone(); Object.assign(d.episodes['2027-01-29'], { time: '20:00', minutes: 90 }); d.episodes['2027-01-30'].cancelled = true;
  const timed = P.schema(P.build(d), url);
  assert.equal(timed.length, 3);
  assert.equal(timed[1].startDate, '2027-01-29T19:00:00.000Z'); assert.equal(timed[1].endDate, '2027-01-29T20:30:00.000Z');
});
