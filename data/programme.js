/* DISTANCE // ZERO programme: turns data/programme-2027.json into one entry per broadcast date.
   Shared by the homepage calendar and the tests (works as a browser global and as a Node module). */
(function (root) {
  const pad = n => String(n).padStart(2, '0');
  const iso = d => d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  const day = s => new Date(s + 'T00:00:00Z');

  /* the UTC instant of a wall-clock time in a time zone (daylight saving included) */
  function zoned(tz, date, time) {
    const [y, mo, d] = date.split('-').map(Number), [h, mi] = time.split(':').map(Number);
    const guess = Date.UTC(y, mo - 1, d, h, mi);
    const off = at => { const p = {}; new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
      .formatToParts(new Date(at)).forEach(x => { p[x.type] = +x.value; }); return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute) - at; };
    let t = guess - off(guess); t = guess - off(t);
    return new Date(t);
  }

  /* "Fri 29 Jan, 20:00" style parts of an instant in a zone */
  function local(at, tz) {
    const p = {}; new Intl.DateTimeFormat(/^Australia\//.test(tz) ? 'en-AU' : 'en-GB', { timeZone: tz, hourCycle: 'h23', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })
      .formatToParts(at).forEach(x => { p[x.type] = x.value; });
    return { weekday: p.weekday, day: p.day, month: p.month, time: p.hour + ':' + p.minute, zone: p.timeZoneName };
  }

  const TIME = /^([01]\d|2[0-3]):[0-5]\d$/, LINK = /^https:\/\/[^\s]+$/;

  function build(data) {
    const out = [], specials = {}, eps = data.episodes || {};
    (data.specials || []).forEach(s => { specials[s.date] = s; });
    const byDay = {}; Object.entries(data.formats).forEach(([k, f]) => { byDay[f.weekday] = k; });
    const dates = new Set(Object.keys(specials));
    for (let d = day(data.regularFrom), end = day(data.until); d <= end; d.setUTCDate(d.getUTCDate() + 1)) if (byDay[d.getUTCDay()] != null) dates.add(iso(d));
    [...dates].sort().forEach(date => {
      const sp = specials[date], format = sp ? sp.format : byDay[day(date).getUTCDay()], f = data.formats[format], ep = Object.assign({}, sp, eps[date]);
      const e = { date, format, name: sp && sp.name || f.name, where: f.where, title: ep.title || '', details: [].concat(ep.details || []).filter(x => typeof x === 'string' && x.trim()), note: typeof ep.note === 'string' ? ep.note : '', special: !!sp, cancelled: ep.cancelled === true };
      /* only well-formed, confirmed values ever reach the page */
      if (ep.time && TIME.test(ep.time)) {
        e.start = zoned(data.timezone, date, ep.time);
        e.minutes = Number(ep.minutes) > 0 ? Number(ep.minutes) : 120;
        e.vienna = local(e.start, data.timezone);
        e.melbourne = local(e.start, data.secondTimezone);
      }
      if (ep.watchUrl && LINK.test(ep.watchUrl)) e.watchUrl = ep.watchUrl;
      if (ep.recordingUrl && LINK.test(ep.recordingUrl)) e.recordingUrl = ep.recordingUrl;
      e.calendar = ep.calendar === true && !!e.start && !e.cancelled;
      e.announced = !!(e.title || e.details.length || e.start);
      out.push(e);
    });
    return out;
  }

  /* .ics for one broadcast (only for entries with a confirmed time) */
  function ics(e, url) {
    if (!e.start) return null;
    const f = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const x = s => String(s).replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
    const end = new Date(e.start.getTime() + e.minutes * 60000);
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DISTANCE ZERO//Programme//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
      'UID:' + e.date + '-' + e.format + '@distancezeroshow.com', 'DTSTAMP:' + f(new Date()), 'DTSTART:' + f(e.start), 'DTEND:' + f(end),
      'SUMMARY:' + x('DISTANCE // ZERO — ' + e.name + (e.title ? ': ' + e.title : '')),
      'DESCRIPTION:' + x(e.details.concat(e.note || [], e.watchUrl || url).join('\n\n')), 'URL:' + (e.watchUrl || url), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n') + '\r\n';
  }

  /* schema.org Events for search engines: announced, not cancelled broadcasts only (date alone until the time is confirmed) */
  function schema(all, url) {
    return all.filter(e => e.announced && !e.cancelled).map(e => {
      const ev = { '@context': 'https://schema.org', '@type': 'Event', name: 'DISTANCE // ZERO — ' + e.name + (e.title ? ': ' + e.title : ''),
        startDate: e.start ? e.start.toISOString() : e.date, eventStatus: 'https://schema.org/EventScheduled',
        eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode', location: { '@type': 'VirtualLocation', url: e.watchUrl || url + '#p-' + e.date },
        image: url + 'assets/keyvisual.jpg', isAccessibleForFree: true, organizer: { '@type': 'Organization', name: 'DISTANCE // ZERO', url } };
      const text = e.details.concat(e.note || []).join(' ');
      if (text) ev.description = text;
      if (e.start) ev.endDate = new Date(e.start.getTime() + e.minutes * 60000).toISOString();
      return ev;
    });
  }

  const api = { build, ics, schema, zoned, local };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.DZProgramme = api;
})(typeof self !== 'undefined' ? self : this);
