// GET FEATURED: artist submissions for D//0 Artist Discovery.
// Pure validation and spam checks, plus thin REST clients for Supabase (database + private storage) and Resend (email).
// No dependencies: Vercel's Node runtime has fetch and crypto. Nothing here is ever sent back to the browser except
// field errors and a short reference, so applicants' personal data is never exposed.

const crypto = require('crypto');

const FEATURES = ['Music Showcase', 'Guest DJ Mix', 'Live Interview', 'Behind the Track', 'Live Performance'];
const CONSENT_VERSION = '2026-10-20';
const PHOTO_MAX = 3 * 1024 * 1024;
const MIN_FILL_MS = 5000, MAX_FILL_MS = 24 * 60 * 60 * 1000;
const PER_IP_PER_HOUR = 3, PER_EMAIL_PER_DAY = 1;
const ORIGINS = ['https://distancezeroshow.com', 'https://www.distancezeroshow.com'];
const BUCKET = 'featured-press';
const TABLE = 'featured_submissions';

const LIMITS = {
  full_name: [2, 120], artist_name: [1, 120], city_country: [2, 120], genre: [2, 80], email: [6, 254], bio: [50, 3000],
};
const LABELS = {
  full_name: 'Full name', artist_name: 'Artist / stage name', city_country: 'City / country', genre: 'Music genre', email: 'Email address',
  bio: 'Artist biography', music_links: 'Music / streaming links', social_links: 'Social media links', epk_url: 'Electronic press kit',
  photo: 'Press photo', press: 'Press photo / EPK', features: 'Preferred feature', consent_contact: 'Consent', consent_rights: 'Rights confirmation',
};

/* text: Unicode-normalised, control characters removed, whitespace collapsed (bio keeps its line breaks) */
function clean(v, multiline = false) {
  if (typeof v !== 'string') return '';
  let s = v.normalize('NFC').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g, '');
  s = multiline ? s.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n') : s.replace(/\s+/g, ' ');
  return s.trim();
}

function url(v) {
  const s = clean(v);
  if (!s || s.length > 500) return null;
  try { const u = new URL(s); return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname.includes('.') && !u.username && !u.password ? u.href : null; }
  catch (e) { return null; }
}

/* links arrive as an array or as one text field, one link per line */
function links(v, min, max) {
  const raw = (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[\n,]+/) : []).map(x => clean(String(x))).filter(Boolean);
  if (raw.length < min) return { error: min === 1 ? 'Add at least one link.' : `Add at least ${min} links.` };
  if (raw.length > max) return { error: `Up to ${max} links, please.` };
  const out = [];
  for (const r of raw) { const u = url(r); if (!u) return { error: 'Each link must be a full web address starting with https://' }; if (!out.includes(u)) out.push(u); }
  return { value: out };
}

function photo(p) {
  if (p == null || p === '') return { value: null };
  if (typeof p !== 'object' || typeof p.data !== 'string') return { error: 'The press photo could not be read. Please choose it again.' };
  const b64 = p.data.replace(/^data:[^;,]*;base64,/, '');
  if (!/^[A-Za-z0-9+/=\s]+$/.test(b64)) return { error: 'The press photo could not be read. Please choose it again.' };
  const buf = Buffer.from(b64, 'base64');
  if (!buf.length) return { error: 'The press photo is empty.' };
  if (buf.length > PHOTO_MAX) return { error: 'The press photo must be 3 MB or smaller.' };
  /* the type comes from the file's own bytes, never from what the browser claims */
  let type = null, ext = null;
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) { type = 'image/jpeg'; ext = 'jpg'; }
  else if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) { type = 'image/png'; ext = 'png'; }
  else if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') { type = 'image/webp'; ext = 'webp'; }
  if (!type) return { error: 'The press photo must be a JPG, PNG or WebP image.' };
  return { value: { buf, type, ext } };
}

/* returns { ok, data, errors, spam } — spam is set for honeypot / timing hits, which get a quiet fake-success reply */
function validate(body, now = Date.now()) {
  const errors = {}, data = {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, errors: { form: 'The form could not be read.' } };

  if (clean(body.website) !== '') return { ok: false, spam: 'honeypot' };
  const started = Number(body.started_at);
  if (!Number.isFinite(started) || now - started < MIN_FILL_MS || now - started > MAX_FILL_MS) return { ok: false, spam: 'timing' };

  for (const [k, [min, max]] of Object.entries(LIMITS)) {
    const v = clean(body[k], k === 'bio');
    if (!v) errors[k] = `${LABELS[k]} is required.`;
    else if (v.length < min) errors[k] = k === 'bio' ? `Tell us a little more (at least ${min} characters).` : `${LABELS[k]} is too short.`;
    else if (v.length > max) errors[k] = `${LABELS[k]} must be ${max} characters or fewer.`;
    data[k] = v;
  }
  if (!errors.email) {
    data.email = data.email.toLowerCase();
    if (!/^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i.test(data.email) || data.email.includes('..')) errors.email = 'That email address does not look right.';
  }
  if (!errors.bio && (data.bio.match(/https?:\/\//gi) || []).length > 3) errors.bio = 'Please put links in the link fields, not in the biography.';

  const m = links(body.music_links, 1, 5); if (m.error) errors.music_links = m.error; else data.music_links = m.value;
  const s = links(body.social_links, 0, 5); if (s.error) errors.social_links = s.error; else data.social_links = s.value;

  data.epk_url = null;
  if (clean(body.epk_url)) { data.epk_url = url(body.epk_url); if (!data.epk_url) errors.epk_url = 'The press kit link must be a full web address starting with https://'; }
  const p = photo(body.photo); if (p.error) errors.photo = p.error; else data.photo = p.value;
  if (!errors.photo && !errors.epk_url && !data.photo && !data.epk_url) errors.press = 'Add a press photo or a link to your electronic press kit.';

  const f = Array.isArray(body.features) ? body.features : typeof body.features === 'string' ? [body.features] : [];
  data.features = FEATURES.filter(x => f.includes(x));
  if (!data.features.length || data.features.length !== new Set(f).size) errors.features = 'Choose at least one preferred feature.';

  if (body.consent_contact !== true) errors.consent_contact = 'Please agree so we can contact you about your submission.';
  if (body.consent_rights !== true) errors.consent_rights = 'Please confirm you have the right to send us this material.';

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data };
}

function originAllowed(origin, extra = '') {
  if (!origin) return false;
  const list = ORIGINS.concat(extra.split(',').map(x => x.trim()).filter(Boolean));
  return list.includes(origin);
}

function clientIp(req) {
  const f = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return f || String(req.headers['x-real-ip'] || '') || (req.socket && req.socket.remoteAddress) || '';
}
const hashIp = (ip, salt) => crypto.createHmac('sha256', salt).update(ip).digest('hex');
const reference = () => 'D0-' + crypto.randomBytes(4).toString('hex').toUpperCase();

function config(env = process.env) {
  const c = {
    supabaseUrl: (env.DZ_SUPABASE_URL || '').replace(/\/+$/, ''), supabaseKey: env.DZ_SUPABASE_SECRET_KEY || '',
    resendKey: env.DZ_RESEND_API_KEY || '', from: env.DZ_MAIL_FROM || '', notifyTo: env.DZ_TEAM_EMAIL || '',
    salt: env.DZ_IP_HASH_SALT || '', origins: env.DZ_ALLOWED_ORIGINS || '', reviewUrl: env.DZ_REVIEW_URL || '',
    resendUrl: env.DZ_RESEND_API_URL || 'https://api.resend.com', publishableKey: env.DZ_SUPABASE_PUBLISHABLE_KEY || '',
  };
  c.missing = [['DZ_SUPABASE_URL', c.supabaseUrl], ['DZ_SUPABASE_SECRET_KEY', c.supabaseKey], ['DZ_RESEND_API_KEY', c.resendKey],
    ['DZ_MAIL_FROM', c.from], ['DZ_TEAM_EMAIL', c.notifyTo], ['DZ_IP_HASH_SALT', c.salt]].filter(([, v]) => !v).map(([k]) => k);
  return c;
}

/* ---------- Supabase REST (service key, server side only) ---------- */
function db(c) {
  const h = { apikey: c.supabaseKey, Authorization: 'Bearer ' + c.supabaseKey };
  const req = async (path, opt = {}) => {
    const r = await fetch(c.supabaseUrl + path, { ...opt, headers: { ...h, ...(opt.headers || {}) }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error('supabase ' + r.status + ' ' + (await r.text()).slice(0, 200));
    return r;
  };
  return {
    async count(filter) {
      const r = await req(`/rest/v1/${TABLE}?select=id&${filter}`, { method: 'HEAD', headers: { Prefer: 'count=exact' } });
      return Number(String(r.headers.get('content-range') || '').split('/')[1]) || 0;
    },
    async list(filter, cols) {
      return (await req(`/rest/v1/${TABLE}?select=${cols}&${filter}`)).json();
    },
    async insert(row) {
      const r = await req(`/rest/v1/${TABLE}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(row) });
      return (await r.json())[0];
    },
    async update(filter, patch) {
      await req(`/rest/v1/${TABLE}?${filter}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(patch) });
    },
    async remove(filter) {
      const r = await req(`/rest/v1/${TABLE}?${filter}&select=id,photo_path`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
      return r.json();
    },
    async upload(path, buf, type) {
      await req(`/storage/v1/object/${BUCKET}/${path}`, { method: 'POST', headers: { 'Content-Type': type, 'x-upsert': 'false' }, body: buf });
    },
    async removeFiles(paths) {
      if (!paths.length) return;
      await req(`/storage/v1/object/${BUCKET}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: paths }) });
    },
    async signedUrl(path, seconds) {
      const r = await req(`/storage/v1/object/sign/${BUCKET}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: seconds }) });
      const j = await r.json(); return j.signedURL ? c.supabaseUrl + '/storage/v1' + j.signedURL : null;
    },
  };
}

/* ---------- email ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

async function sendMail(c, msg, key) {
  const r = await fetch(c.resendUrl + '/emails', {
    method: 'POST', signal: AbortSignal.timeout(10000),
    headers: { Authorization: 'Bearer ' + c.resendKey, 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify({ from: c.from, ...msg }),
  });
  if (!r.ok) throw new Error('resend ' + r.status + ' ' + (await r.text()).slice(0, 200));
}

const shell = inner => `<div style="background:#07080a;padding:32px 20px;font-family:Helvetica,Arial,sans-serif;color:#c9ced6;line-height:1.6">
<div style="max-width:560px;margin:0 auto;border-top:1px solid #f2a650">
<p style="font-size:11px;letter-spacing:.24em;color:#8a9099;margin:24px 0 8px">D//0 ARTIST DISCOVERY</p>${inner}
<p style="font-size:11px;letter-spacing:.2em;color:#8a9099;margin-top:32px">DISTANCE // ZERO — VIENNA // MELBOURNE</p></div></div>`;

function teamMail(row, d, photoUrl, reviewUrl) {
  const rows = [['Reference', row.reference], ['Full name', d.full_name], ['Artist / stage name', d.artist_name], ['City / country', d.city_country],
    ['Genre', d.genre], ['Email', d.email], ['Preferred feature', d.features.join(', ')], ['Music links', d.music_links.join('\n')],
    ['Social links', d.social_links.join('\n') || '-'], ['EPK', d.epk_url || '-'], ['Press photo', photoUrl ? 'Attached (link valid 7 days)' : '-']];
  const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n') + `\n\nBiography:\n${d.bio}\n` + (photoUrl ? `\nPress photo: ${photoUrl}\n` : '') +
    `\nReview: set status in the featured_submissions table${reviewUrl ? ' (' + reviewUrl + ')' : ''}.`;
  const html = shell(`<h1 style="font-size:20px;color:#f3f5f8;letter-spacing:.06em;margin:0 0 16px">New submission: ${esc(d.artist_name)}</h1>
<table style="width:100%;border-collapse:collapse;font-size:14px">${rows.map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#8a9099;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0;color:#f3f5f8">${esc(v).replace(/\n/g, '<br>')}</td></tr>`).join('')}</table>
<p style="margin-top:20px;color:#8a9099;font-size:12px;letter-spacing:.2em">BIOGRAPHY</p><p style="white-space:pre-wrap;color:#f3f5f8">${esc(d.bio)}</p>
${photoUrl ? `<p><a href="${esc(photoUrl)}" style="color:#f2a650">Open press photo</a> (link valid 7 days)</p>` : ''}
<p style="color:#8a9099;font-size:13px">Review: set the status in the <b>featured_submissions</b> table${reviewUrl ? ` — <a href="${esc(reviewUrl)}" style="color:#f2a650">open</a>` : ''}. Do not forward this email outside the team.</p>`);
  return { subject: `GET FEATURED ${row.reference}: ${d.artist_name} (${d.genre})`, text, html, reply_to: d.email };
}

function applicantMail(row, d) {
  const text = `Hi ${d.full_name},\n\nthank you for introducing yourself to DISTANCE // ZERO. We have received your submission as ${d.artist_name}.\n\nReference: ${row.reference}\n\n` +
    `Every submission is listened to and reviewed by our editorial team. If your music is a fit for the show, we will contact you at this address about a possible feature. There is no guaranteed airtime and we cannot reply to every submission individually.\n\n` +
    `To correct or withdraw your submission, or to have your data deleted, reply to this email with your reference.\n\nDISTANCE // ZERO\nVienna // Melbourne\nhttps://distancezeroshow.com/get-featured`;
  const html = shell(`<h1 style="font-size:22px;color:#f3f5f8;letter-spacing:.06em;margin:0 0 16px">YOUR SOUND. OUR STAGE.</h1>
<p>Hi ${esc(d.full_name)},</p><p>thank you for introducing yourself to DISTANCE // ZERO. We have received your submission as <b style="color:#f3f5f8">${esc(d.artist_name)}</b>.</p>
<p style="font-size:12px;letter-spacing:.2em;color:#8a9099">REFERENCE <span style="color:#f2a650">${esc(row.reference)}</span></p>
<p>Every submission is listened to and reviewed by our editorial team. If your music is a fit for the show, we will contact you at this address about a possible feature. There is no guaranteed airtime and we cannot reply to every submission individually.</p>
<p>To correct or withdraw your submission, or to have your data deleted, reply to this email with your reference.</p>`);
  return { subject: `We received your submission (${row.reference}) — DISTANCE // ZERO`, text, html };
}

module.exports = {
  FEATURES, CONSENT_VERSION, PHOTO_MAX, PER_IP_PER_HOUR, PER_EMAIL_PER_DAY, BUCKET, TABLE,
  clean, url, links, photo, validate, originAllowed, clientIp, hashIp, reference, config, db, sendMail, teamMail, applicantMail, esc,
};
