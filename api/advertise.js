// POST /api/advertise — "Advertise on the show" form: emails the request to the team (DZ_TEAM_EMAIL) through Resend,
// with Reply-To set to the sender so the team can answer straight from the inbox. Nothing is stored.
// No confirmation email goes to the sender: without stored rate limits that would let anyone send mail to any address.
// Spam: same origin check, honeypot ("fax") and minimum fill time as GET FEATURED, plus a per-instance limit per IP.
// Without DZ_RESEND_API_KEY / DZ_MAIL_FROM / DZ_TEAM_EMAIL it answers 503 and the page falls back to the visitor's mail app.

const F = require('./_lib/featured');

const TYPES = ['Presenting partner', 'Segment partner', 'On-air spot', 'In the studio', 'Something else'];
const BUDGETS = ["Let's have a yarn", 'Under EUR 250', 'EUR 250 to 1,000', 'EUR 1,000 to 5,000', 'Over EUR 5,000'];
const PER_IP_PER_HOUR = 5;
const hits = new Map(); // ip hash -> timestamps, per warm instance

function send(res, code, obj) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(code).send(JSON.stringify(obj));
}

function validate(b, now) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { errors: { form: 'The form could not be read.' } };
  if (F.clean(b.fax) !== '') return { spam: 'honeypot' };
  const started = Number(b.started_at);
  if (!Number.isFinite(started) || now - started < 3000 || now - started > 86400e3) return { spam: 'timing' };
  const d = {
    company: F.clean(b.company), name: F.clean(b.name), email: F.clean(b.email).toLowerCase(), website: F.clean(b.website),
    type: TYPES.includes(b.type) ? b.type : TYPES[4], budget: BUDGETS.includes(b.budget) ? b.budget : BUDGETS[0], message: F.clean(b.message, true),
  };
  const errors = {};
  if (!d.company) errors.company = 'Company is required.'; else if (d.company.length > 120) errors.company = 'Company must be 120 characters or fewer.';
  if (!d.name) errors.name = 'Your name is required.'; else if (d.name.length > 120) errors.name = 'Name must be 120 characters or fewer.';
  if (!/^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i.test(d.email) || d.email.length > 254) errors.email = 'That email address does not look right.';
  if (d.website) { d.website = F.url(d.website); if (!d.website) errors.website = 'The website must be a full address starting with https://'; }
  if (d.message.length > 3000) errors.message = 'Message must be 3000 characters or fewer.';
  if ((d.message.match(/https?:\/\//gi) || []).length > 3) errors.message = 'Please keep links to a minimum.';
  return Object.keys(errors).length ? { errors } : { data: d };
}

function mail(d) {
  const rows = [['Company', d.company], ['Name', d.name], ['Email', d.email], ['Website', d.website || '-'], ['Interested in', d.type], ['Budget per episode', d.budget]];
  const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n') + `\n\nMessage:\n${d.message || '-'}\n\nReply to this email to answer ${d.name} directly.`;
  const html = `<div style="background:#07080a;padding:32px 20px;font-family:Helvetica,Arial,sans-serif;color:#c9ced6;line-height:1.6"><div style="max-width:560px;margin:0 auto;border-top:1px solid #f2a650">
<p style="font-size:11px;letter-spacing:.24em;color:#8a9099;margin:24px 0 8px">ADVERTISE ON THE SHOW</p>
<h1 style="font-size:20px;color:#f3f5f8;letter-spacing:.06em;margin:0 0 16px">${F.esc(d.company)}: ${F.esc(d.type)}</h1>
<table style="width:100%;border-collapse:collapse;font-size:14px">${rows.map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#8a9099;white-space:nowrap;vertical-align:top">${F.esc(k)}</td><td style="padding:6px 0;color:#f3f5f8">${F.esc(v)}</td></tr>`).join('')}</table>
<p style="margin-top:20px;color:#8a9099;font-size:12px;letter-spacing:.2em">MESSAGE</p><p style="white-space:pre-wrap;color:#f3f5f8">${F.esc(d.message || '-')}</p>
<p style="color:#8a9099;font-size:13px">Reply to this email to answer ${F.esc(d.name)} directly.</p>
<p style="font-size:11px;letter-spacing:.2em;color:#8a9099;margin-top:32px">DISTANCE // ZERO — VIENNA // MELBOURNE</p></div></div>`;
  return { subject: `Advertising: ${d.company} / ${d.type} (${d.budget})`, text, html, reply_to: d.email };
}

module.exports = async function handler(req, res, deps = {}) {
  const c = deps.config || F.config();
  const log = deps.log || console;
  const now = deps.now ? deps.now() : Date.now();

  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { error: 'method' }); }
  if (!F.originAllowed(req.headers.origin, c.origins)) return send(res, 403, { error: 'origin' });
  if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) return send(res, 415, { error: 'type' });
  if (Number(req.headers['content-length'] || 0) > 64 * 1024) return send(res, 413, { error: 'size' });
  if (!c.resendKey || !c.from || !c.notifyTo) { log.error('advertise: not configured'); return send(res, 503, { error: 'not_configured' }); }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  const v = validate(body, now);
  if (v.spam) { log.warn('advertise: dropped (' + v.spam + ')'); return send(res, 200, { ok: true }); }
  if (v.errors) return send(res, 400, { error: 'invalid', fields: v.errors });

  const ip = F.hashIp(F.clientIp(req) || 'unknown', c.salt || 'advertise');
  const recent = (hits.get(ip) || []).filter(t => now - t < 3600e3);
  if (recent.length >= PER_IP_PER_HOUR) return send(res, 429, { error: 'rate' });
  recent.push(now); hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();

  try {
    await (deps.sendMail || F.sendMail)(c, { to: c.notifyTo.split(',').map(x => x.trim()), ...mail(v.data) }, 'adv-' + ip.slice(0, 16) + '-' + Math.floor(now / 60000));
  } catch (e) { log.error('advertise: email failed', e.message); return send(res, 502, { error: 'email' }); }
  return send(res, 200, { ok: true });
};

module.exports._reset = () => hits.clear();
