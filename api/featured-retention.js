// Daily retention job for GET FEATURED (Vercel Cron, see vercel.json). Vercel sends "Authorization: Bearer $CRON_SECRET".
// 1. Deletes submissions whose retain_until has passed, together with their press photos.
// 2. Clears the hashed IP address 30 days after a submission (it is only needed for rate limiting).
// retain_until is set by the database: 12 months after submission, 6 months after a "declined" decision,
// 36 months once an artist is "featured" (see supabase/migrations).

const F = require('./_lib/featured');

module.exports = async function handler(req, res, deps = {}) {
  const c = deps.config || F.config();
  const secret = deps.cronSecret ?? process.env.CRON_SECRET;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (!secret || req.headers.authorization !== 'Bearer ' + secret) return res.status(401).send('{"error":"unauthorized"}');
  if (!c.supabaseUrl || !c.supabaseKey) return res.status(503).send('{"error":"not_configured"}');

  const store = deps.db || F.db(c), now = new Date(deps.now ? deps.now() : Date.now());
  try {
    /* photos first: if that fails the rows stay and the next run tries again, so no photo is ever orphaned */
    const gone = await store.list(`retain_until=lt.${encodeURIComponent(now.toISOString())}&limit=500`, 'id,photo_path');
    await store.removeFiles(gone.map(r => r.photo_path).filter(Boolean));
    if (gone.length) await store.remove(`id=in.(${gone.map(r => r.id).join(',')})`);
    await store.update(`ip_hash=not.is.null&created_at=lt.${encodeURIComponent(new Date(now - 30 * 86400e3).toISOString())}`, { ip_hash: null });
    return res.status(200).send(JSON.stringify({ ok: true, deleted: gone.length }));
  } catch (e) {
    (deps.log || console).error('featured-retention failed', e.message);
    return res.status(500).send('{"error":"server"}');
  }
};
