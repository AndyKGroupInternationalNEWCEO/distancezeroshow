// GET /api/keep-alive — Vercel Cron, once a day (vercel.json). Keeps the DISTANCE // ZERO Supabase project (Free plan) awake.
// Same idea as A.D.A.M.'s keep-alive, with less privilege: it uses the PUBLISHABLE key and can only run dz_keepalive(),
// which stamps one heartbeat row (supabase/migrations/20261020120100_keepalive.sql). No secret database key is involved.
// Vercel sends "Authorization: Bearer $CRON_SECRET"; anything else gets 401. One retry; if Supabase still does not answer,
// the reply is 500 (shown as a failed run in Vercel's Cron logs) and the team gets an alert email when Resend is set up.

const F = require('./_lib/featured');

module.exports = async function handler(req, res, deps = {}) {
  const c = deps.config || F.config();
  const secret = deps.cronSecret ?? process.env.CRON_SECRET;
  const log = deps.log || console;
  const wait = deps.wait || (ms => new Promise(r => setTimeout(r, ms)));
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (!secret || req.headers.authorization !== 'Bearer ' + secret) return res.status(401).send('{"error":"unauthorized"}');
  if (!c.supabaseUrl || !c.publishableKey) { log.error('keep-alive: DZ_SUPABASE_URL or DZ_SUPABASE_PUBLISHABLE_KEY missing'); return res.status(503).send('{"error":"not_configured"}'); }

  const ping = async () => {
    const r = await fetch(c.supabaseUrl + '/rest/v1/rpc/dz_keepalive', {
      method: 'POST', signal: AbortSignal.timeout(10000), body: '{}',
      headers: { apikey: c.publishableKey, Authorization: 'Bearer ' + c.publishableKey, 'Content-Type': 'application/json' },
    });
    if (!r.ok) throw new Error('supabase ' + r.status + ' ' + (await r.text()).slice(0, 160));
    return r.json();
  };

  let last;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try { const at = await ping(); return res.status(200).send(JSON.stringify({ ok: true, lastPing: at, attempt })); }
    catch (e) { last = e; log.error(`keep-alive: attempt ${attempt} failed`, e.message); if (attempt === 1) await wait(3000); }
  }

  if (c.resendKey && c.from && c.notifyTo) {
    const day = new Date().toISOString().slice(0, 10);
    await F.sendMail(c, { to: c.notifyTo.split(',').map(x => x.trim()), subject: 'DISTANCE // ZERO: Supabase keep-alive failed',
      text: `The daily keep-alive could not reach the DISTANCE // ZERO Supabase project (${c.supabaseUrl}).\n\nError: ${last.message}\n\n` +
        `Check the project in the Supabase dashboard: if it shows "Paused", press Restore. If it is running, check DZ_SUPABASE_URL and DZ_SUPABASE_PUBLISHABLE_KEY in Vercel.` },
      'keepalive-' + day).catch(e => log.error('keep-alive: alert email failed', e.message));
  }
  return res.status(500).send(JSON.stringify({ ok: false, error: 'supabase_unreachable' }));
};
