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
const TZ = { VIE: 'Europe/Vienna', MEL: 'Australia/Melbourne' };
let memo = null; // per warm instance

const hm = (ts, tz) => ts ? new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ts * 1000)) : '';

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

async function board(key, airport, kind) {
  const q = new URLSearchParams({ api_key: key, [kind === 'dep' ? 'dep_iata' : 'arr_iata']: airport,
    _fields: 'airline_iata,flight_iata,cs_flight_iata,dep_iata,arr_iata,dep_time_ts,dep_estimated_ts,dep_actual_ts,arr_time_ts,arr_estimated_ts,arr_actual_ts,dep_delayed,arr_delayed,status' });
  const r = await fetch('https://airlabs.co/api/v9/schedules?' + q, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('source ' + r.status);
  const j = await r.json(); if (j.error) throw new Error(j.error.message || 'source error');
  const now = Date.now() / 1000, tz = TZ[airport];
  return (j.response || [])
    .filter(f => !f.cs_flight_iata) // operating flights only, no codeshare duplicates
    .filter(f => HUBS[kind === 'dep' ? f.arr_iata : f.dep_iata])
    .map(f => {
      const sched = kind === 'dep' ? f.dep_time_ts : f.arr_time_ts, est = kind === 'dep' ? (f.dep_estimated_ts || f.dep_actual_ts) : (f.arr_estimated_ts || f.arr_actual_ts);
      const hub = kind === 'dep' ? f.arr_iata : f.dep_iata, code = f.airline_iata || '';
      return { ts: sched, time: hm(sched, tz), est: est && est - sched >= 300 ? hm(est, tz) : '', flight: (f.flight_iata || '').replace(/^([A-Z0-9]{2})(\d+)/, '$1 $2'),
        airline: AIRLINES[code] || code, code, city: HUBS[hub], iata: hub, status: status(f, kind, now) };
    })
    .filter(f => f.ts && f.ts > now - 45 * 60) // recently departed/arrived stay a little while, like a real board
    .sort((a, b) => a.ts - b.ts)
    .slice(0, 12)
    .map(({ ts, ...f }) => f);
}

module.exports = async function handler(req, res) {
  const key = process.env.AIRLABS_KEY;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (!key) { res.setHeader('Cache-Control', 'public, s-maxage=300'); return res.status(200).send(JSON.stringify({ available: false, reason: 'no-key' })); }
  if (memo && Date.now() - memo.at < 18 * 60 * 1000) { res.setHeader('Cache-Control', 'public, s-maxage=1200, stale-while-revalidate=600'); return res.status(200).send(memo.body); }
  try {
    const [vd, va, md, ma] = await Promise.all([board(key, 'VIE', 'dep'), board(key, 'VIE', 'arr'), board(key, 'MEL', 'dep'), board(key, 'MEL', 'arr')]);
    const body = JSON.stringify({ available: true, updated: new Date().toISOString(), source: 'AirLabs', vie: { dep: vd, arr: va }, mel: { dep: md, arr: ma } });
    memo = { at: Date.now(), body };
    res.setHeader('Cache-Control', 'public, s-maxage=1200, stale-while-revalidate=600');
    return res.status(200).send(body);
  } catch (e) {
    res.setHeader('Cache-Control', 'public, s-maxage=120');
    return res.status(200).send(memo ? memo.body : JSON.stringify({ available: false, reason: 'source' }));
  }
}
