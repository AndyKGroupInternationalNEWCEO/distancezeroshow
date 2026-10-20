// POST /api/get-featured — stores one artist submission, then notifies the team and confirms receipt to the artist.
// Order: origin + size checks, validation, spam checks, rate limits, private photo upload, database row, emails.
// The submission counts once it is in the database; a failed email is recorded on the row and never loses the submission.
// Without the env vars listed in config() it answers 503 and stores nothing: the page then says submissions are not open yet.

const F = require('./_lib/featured');

const MAX_BODY = 4.4 * 1024 * 1024; // Vercel's request limit is 4.5 MB; a 3 MB photo is ~4 MB as base64

function send(res, code, obj) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(code).send(JSON.stringify(obj));
}

module.exports = async function handler(req, res, deps = {}) {
  const c = deps.config || F.config();
  const log = deps.log || console;
  const now = deps.now ? deps.now() : Date.now();

  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { error: 'method' }); }
  if (!F.originAllowed(req.headers.origin, c.origins)) return send(res, 403, { error: 'origin' });
  if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) return send(res, 415, { error: 'type' });
  if (Number(req.headers['content-length'] || 0) > MAX_BODY) return send(res, 413, { error: 'size', fields: { photo: 'The press photo must be 3 MB or smaller.' } });
  if (c.missing.length) { log.error('get-featured: not configured, missing ' + c.missing.join(', ')); return send(res, 503, { error: 'not_configured' }); }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  const v = F.validate(body, now);
  if (v.spam) { log.warn('get-featured: dropped (' + v.spam + ')'); return send(res, 201, { ok: true, reference: F.reference() }); }
  if (!v.ok) return send(res, 400, { error: 'invalid', fields: v.errors });
  const d = v.data;

  const store = deps.db || F.db(c);
  const ipHash = F.hashIp(F.clientIp(req) || 'unknown', c.salt);
  const hourAgo = new Date(now - 3600e3).toISOString(), dayAgo = new Date(now - 86400e3).toISOString();
  try {
    const [byIp, byEmail] = await Promise.all([
      store.count(`ip_hash=eq.${ipHash}&created_at=gte.${encodeURIComponent(hourAgo)}`),
      store.count(`email=eq.${encodeURIComponent(d.email)}&created_at=gte.${encodeURIComponent(dayAgo)}`),
    ]);
    if (byEmail >= F.PER_EMAIL_PER_DAY) return send(res, 429, { error: 'duplicate' });
    if (byIp >= F.PER_IP_PER_HOUR) return send(res, 429, { error: 'rate' });
  } catch (e) { log.error('get-featured: rate check failed', e.message); return send(res, 500, { error: 'server' }); }

  const ref = F.reference(), stamp = new Date(now).toISOString();
  let photoPath = null;
  try {
    if (d.photo) { photoPath = `${stamp.slice(0, 7)}/${ref}.${d.photo.ext}`; await store.upload(photoPath, d.photo.buf, d.photo.type); }
  } catch (e) { log.error('get-featured: photo upload failed', e.message); return send(res, 500, { error: 'server' }); }

  let row;
  try {
    row = await store.insert({
      reference: ref, full_name: d.full_name, artist_name: d.artist_name, city_country: d.city_country, genre: d.genre, email: d.email,
      music_links: d.music_links, social_links: d.social_links, bio: d.bio, epk_url: d.epk_url, photo_path: photoPath,
      preferred_features: d.features, consent_contact_at: stamp, consent_rights_at: stamp, consent_version: F.CONSENT_VERSION,
      ip_hash: ipHash, user_agent: String(req.headers['user-agent'] || '').slice(0, 300),
    });
  } catch (e) {
    log.error('get-featured: insert failed', e.message);
    if (photoPath) await store.removeFiles([photoPath]).catch(() => {});
    return send(res, 500, { error: 'server' });
  }

  const mail = deps.sendMail || F.sendMail;
  const patch = {};
  try {
    const photoUrl = photoPath ? await store.signedUrl(photoPath, 7 * 86400).catch(() => null) : null;
    await mail(c, { to: c.notifyTo.split(',').map(x => x.trim()), ...F.teamMail(row, d, photoUrl, c.reviewUrl) }, ref + '-team');
    patch.team_notified_at = new Date().toISOString();
  } catch (e) { log.error('get-featured: team email failed for ' + ref, e.message); }
  try {
    await mail(c, { to: [d.email], reply_to: c.notifyTo.split(',')[0].trim(), ...F.applicantMail(row, d) }, ref + '-artist');
    patch.confirmation_sent_at = new Date().toISOString();
  } catch (e) { log.error('get-featured: confirmation email failed for ' + ref, e.message); }
  if (Object.keys(patch).length) await store.update(`reference=eq.${ref}`, patch).catch(e => log.error('get-featured: status update failed', e.message));

  return send(res, 201, { ok: true, reference: ref, emailed: !!patch.confirmation_sent_at });
};
