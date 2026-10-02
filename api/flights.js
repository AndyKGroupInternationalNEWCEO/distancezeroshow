// Real flight data for the DISTANCE // ZERO airport boards.
// Source: AirLabs Schedules API (airport departure/arrival boards, ~10 h ahead), key in the AIRLABS_KEY env var.
// Only flights to or from one-stop connection hubs between Vienna and Melbourne are kept, so every row is a real
// flight that can connect towards the other city. The response is cached at the edge so visitor traffic never
// multiplies API usage. Without a key, or if the source fails, it answers { available: false } and the page keeps
// showing the show's own D//0 rows. No airline logos: the source does not license them, rows carry name + code.

const HUBS = {
  DXB: 'DUBAI', DOH: 'DOHA', AUH: 'ABU DHABI', IST: 'ISTANBUL', SIN: 'SINGAPORE', BKK: 'BANGKOK', HKG: 'HONG KONG',
  KUL: 'KUALA LUMPUR', DEL: 'DELHI', BOM: 'MUMBAI', ICN: 'SEOUL', NRT: 'TOKYO', HND: 'TOKYO', PVG: 'SHANGHAI',
  PEK: 'BEIJING', PKX: 'BEIJING', CAN: 'GUANGZHOU', TPE: 'TAIPEI', SGN: 'HO CHI MINH', CMB: 'COLOMBO', BAH: 'BAHRAIN', MCT: 'MUSCAT',
};
const AIRLINES = {
  EK: 'EMIRATES', QR: 'QATAR AIRWAYS', EY: 'ETIHAD', TK: 'TURKISH AIRLINES', SQ: 'SINGAPORE AIRLINES', TG: 'THAI AIRWAYS',
  CX: 'CATHAY PACIFIC', MH: 'MALAYSIA AIRLINES', AI: 'AIR INDIA', QF: 'QANTAS', VA: 'VIRGIN AUSTRALIA', JQ: 'JETSTAR',
  OS: 'AUSTRIAN', LH: 'LUFTHANSA', FZ: 'FLYDUBAI', PC: 'PEGASUS', W6: 'WIZZ AIR', NH: 'ANA', JL: 'JAPAN AIRLINES',
  KE: 'KOREAN AIR', OZ: 'ASIANA', CA: 'AIR CHINA', MU: 'CHINA EASTERN', CZ: 'CHINA SOUTHERN', CI: 'CHINA AIRLINES',
  BR: 'EVA AIR', VN: 'VIETNAM AIRLINES', GA: 'GARUDA INDONESIA', TR: 'SCOOT', D7: 'AIRASIA X', UL: 'SRILANKAN',
  GF: 'GULF AIR', WY: 'OMAN AIR', HU: 'HAINAN AIRLINES', '6E': 'INDIGO', MS: 'EGYPTAIR', LX: 'SWISS',
};
let memo = null; // per warm instance


function status(f, kind, now) {
  const delay = (kind === 'dep' ? f.dep_delayed : f.arr_delayed) || 0;
  if (f.status === 'cancelled') return 'CANCELLED';
  if (kind === 'dep') {
    if (f.status === 'active' || f.dep_actual_ts) return 'DEPARTED';
    const t = f.dep_estimated_ts || f.dep_time_ts;
    if (delay >= 15) return 'DELAYED';
    if (t - now < 20 * 60) return 'FINAL CALL';
    if (t - now < 50 * 60) return 'BOARDING';
    return 'ON TIME';
  }
  if (f.status === 'landed' || f.arr_actual_ts) return 'ARRIVED';
  if (f.status === 'active') return delay >= 15 ? 'DELAYED' : 'IN FLIGHT';
  return delay >= 15 ? 'DELAYED' : 'ON TIME';
}

// AirLabs times arrive as "YYYY-MM-DD HH:MM" strings (local and UTC); every plan returns those, not every plan the *_ts fields.
const utc = v => v ? Date.parse(v.replace(' ', 'T') + 'Z') / 1000 : 0;
const clock = v => v ? v.slice(11, 16) : '';
const FIELDS = 'airline_iata,flight_iata,cs_flight_iata,dep_iata,arr_iata,dep_time,dep_time_utc,dep_estimated,dep_estimated_utc,dep_actual_utc,arr_time,arr_time_utc,arr_estimated,arr_estimated_utc,arr_actual_utc,dep_delayed,arr_delayed,status';
const PAGES = Math.max(1, Math.min(10, +process.env.AIRLABS_PAGES || 6));

async function fetchBoard(key, airport, kind) {
  const rows = [];
  for (let page = 0, offset = 0; page < PAGES; page++) {
    const q = new URLSearchParams({ api_key: key, [kind === 'dep' ? 'dep_iata' : 'arr_iata']: airport, _fields: FIELDS, limit: '1000', offset: String(offset) });
    const r = await fetch('https://airlabs.co/api/v9/schedules?' + q, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('source ' + r.status);
    const j = await r.json(); if (j.error) throw new Error(j.error.message || 'source error');
    const got = j.response || []; rows.push(...got);
    if (!j.request || !j.request.has_more || !got.length) break;
    offset += got.length;
  }
  return rows;
}

function status(f, kind, now) {
  const delay = (kind === 'dep' ? f.dep_delayed : f.arr_delayed) || 0;
  if (f.status === 'cancelled') return 'CANCELLED';
  if (kind === 'dep') {
    if (f.status === 'active' || f.status === 'landed' || f.dep_actual_utc) return 'DEPARTED';
    const t = utc(f.dep_estimated_utc) || utc(f.dep_time_utc);
    if (delay >= 15) return 'DELAYED';
    if (t - now < 20 * 60) return 'FINAL CALL';
    if (t - now < 50 * 60) return 'BOARDING';
    return 'ON TIME';
  }
  if (f.status === 'landed' || f.arr_actual_utc) return 'ARRIVED';
  if (f.status === 'active') return delay >= 15 ? 'DELAYED' : 'IN FLIGHT';
  return delay >= 15 ? 'DELAYED' : 'ON TIME';
}

async function board(key, airport, kind) {
  const now = Date.now() / 1000, dep = kind === 'dep';
  return (await fetchBoard(key, airport, kind))
    .filter(f => !f.cs_flight_iata) // operating flights only, no codeshare duplicates
    .filter(f => HUBS[dep ? f.arr_iata : f.dep_iata])
    .map(f => {
      const sched = dep ? f.dep_time : f.arr_time, est = dep ? f.dep_estimated : f.arr_estimated;
      const ts = utc(dep ? f.dep_time_utc : f.arr_time_utc), ets = utc(dep ? f.dep_estimated_utc : f.arr_estimated_utc);
      const hub = dep ? f.arr_iata : f.dep_iata, code = f.airline_iata || (f.flight_iata || '').slice(0, 2);
      return { ts, time: clock(sched), est: ets && ets - ts >= 300 ? clock(est) : '', flight: (f.flight_iata || '').replace(/^([A-Z0-9]{2})(\d+)/, '$1 $2'),
        airline: AIRLINES[code] || code, code, city: HUBS[hub], iata: hub, status: status(f, kind, now) };
    })
    .filter(f => f.ts && f.ts > now - 45 * 60) // just departed / landed stay a little while, like a real board
    .sort((a, b) => a.ts - b.ts)
    .slice(0, 12)
    .map(({ ts, ...f }) => f);
}

module.exports = async function handler(req, res) {
  const key = process.env.AIRLABS_KEY;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (!key) { res.setHeader('Cache-Control', 'public, s-maxage=300'); return res.status(200).send(JSON.stringify({ available: false, reason: 'no-key' })); }
  const TTL = Math.max(5, +process.env.AIRLABS_TTL_MIN || 20);
  if (memo && Date.now() - memo.at < (TTL - 2) * 60 * 1000) { res.setHeader('Cache-Control', 'public, s-maxage=' + TTL * 60 + ', stale-while-revalidate=600'); return res.status(200).send(memo.body); }
  try {
    const [vd, va, md, ma] = await Promise.all([board(key, 'VIE', 'dep'), board(key, 'VIE', 'arr'), board(key, 'MEL', 'dep'), board(key, 'MEL', 'arr')]);
    const body = JSON.stringify({ available: true, updated: new Date().toISOString(), source: 'AirLabs', vie: { dep: vd, arr: va }, mel: { dep: md, arr: ma } });
    memo = { at: Date.now(), body };
    res.setHeader('Cache-Control', 'public, s-maxage=' + TTL * 60 + ', stale-while-revalidate=600');
    return res.status(200).send(body);
  } catch (e) {
    res.setHeader('Cache-Control', 'public, s-maxage=120');
    return res.status(200).send(memo ? memo.body : JSON.stringify({ available: false, reason: 'source' }));
  }
}
