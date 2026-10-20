// node --test test/
// Programme 2027: dates generated from data/programme-2027.json, time zones, and that nothing unconfirmed is shown.

const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../data/programme.js');
const DATA = require('../data/programme-2027.json');
const clone = () => JSON.parse(JSON.stringify(DATA));

test('opening rehearsal on 27 January, then every Friday, Saturday and Sunday from 29 January to 31 December 2027', () => {
  const all = P.build(DATA);
  assert.equal(all[0].date, '2027-01-27'); assert.equal(all[0].name, 'OPENING SHOW — REHEARSAL'); assert.ok(all[0].special);
  const regular = all.slice(1);
  assert.equal(regular[0].date, '2027-01-29'); assert.equal(regular.at(-1).date, '2027-12-31');
  assert.equal(regular.length, 145);
  const wd = { dj: 5, piano: 6, main: 0 };
  regular.forEach(e => assert.equal(new Date(e.date + 'T00:00:00Z').getUTCDay(), wd[e.format], e.date));
  assert.equal(new Set(all.map(e => e.date)).size, all.length, 'no duplicate dates');
  assert.ok(!all.some(e => e.date === '2027-01-28'));
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
  Object.assign(d.episodes, { '2027-01-29': { time: '20:00' }, '2027-04-02': { time: '20:00' }, '2027-07-02': { time: '20:00' }, '2027-10-03': { time: '10:00' } });
  const by = Object.fromEntries(P.build(d).map(e => [e.date, e]));
  assert.deepEqual([by['2027-01-29'].vienna.time, by['2027-01-29'].vienna.zone], ['20:00', 'CET']);
  assert.deepEqual([by['2027-01-29'].melbourne.weekday, by['2027-01-29'].melbourne.time, by['2027-01-29'].melbourne.zone], ['Sat', '06:00', 'AEDT']);
  assert.equal(by['2027-01-29'].start.toISOString(), '2027-01-29T19:00:00.000Z');
  assert.equal(by['2027-04-02'].melbourne.time, '05:00', 'Vienna on CEST (28 Mar), Melbourne still AEDT until 4 Apr');
  assert.deepEqual([by['2027-07-02'].vienna.zone, by['2027-07-02'].melbourne.time, by['2027-07-02'].melbourne.zone], ['CEST', '04:00', 'AEST']);
  assert.deepEqual([by['2027-10-03'].melbourne.time, by['2027-10-03'].melbourne.zone], ['19:00', 'AEDT'], 'Melbourne back on AEDT from 3 Oct');
});

test('buttons appear only with valid data; malformed values are ignored', () => {
  const d = clone();
  Object.assign(d.episodes, {
    '2027-02-05': { time: '20:00', calendar: true, watchUrl: 'https://youtube.com/live/x', recordingUrl: 'https://youtube.com/watch?v=y' },
    '2027-02-06': { time: '8pm', calendar: true, watchUrl: 'javascript:alert(1)' },
    '2027-02-07': { time: '20:00', calendar: true, cancelled: true },
  });
  const by = Object.fromEntries(P.build(d).map(e => [e.date, e]));
  assert.ok(by['2027-02-05'].calendar); assert.equal(by['2027-02-05'].watchUrl, 'https://youtube.com/live/x'); assert.ok(by['2027-02-05'].recordingUrl);
  assert.equal(by['2027-02-06'].start, undefined); assert.equal(by['2027-02-06'].calendar, false); assert.equal(by['2027-02-06'].watchUrl, undefined);
  assert.equal(by['2027-02-07'].calendar, false); assert.ok(by['2027-02-07'].cancelled);

  const ics = P.ics(by['2027-02-05'], 'https://distancezeroshow.com/#programme');
  assert.match(ics, /DTSTART:20270205T190000Z\r\nDTEND:20270205T210000Z/);
  assert.match(ics, /SUMMARY:DISTANCE \/\/ ZERO — DJ SHOW/);
  assert.match(ics, /UID:2027-02-05-dj@distancezeroshow.com/);
});

test('data file stays editable by hand: valid JSON with the expected keys', () => {
  for (const k of ['timezone', 'secondTimezone', 'regularFrom', 'until', 'formats', 'episodes']) assert.ok(k in DATA, k);
  Object.keys(DATA.episodes).forEach(k => assert.match(k, /^2027-\d{2}-\d{2}$/));
});
