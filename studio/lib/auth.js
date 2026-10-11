// Access codes, signed session cookies and login throttling.
// Codes live in studio/data/secrets.json (owner-only). Nothing secret is ever sent to the browser except
// the session cookie, which is HttpOnly and SameSite=Strict.
import crypto from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I: codes may be read out loud
function code(groups = 5) {
  const bytes = crypto.randomBytes(groups * 4);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += ALPHABET[bytes[i] % ALPHABET.length] + ((i % 4 === 3 && i < bytes.length - 1) ? '-' : '');
  return s;
}

export function loadSecrets(store, { rotate = false } = {}) {
  let s = store.read('secrets.json');
  if (!s || rotate) {
    const keep = s || {};
    s = {
      directorCode: code(),
      hostCode: code(),
      overlayKey: crypto.randomBytes(24).toString('base64url'),
      cookieSecret: crypto.randomBytes(32).toString('hex'),
      // VDO.Ninja ids stay stable across code rotation so OBS browser sources keep working
      vdoStream: keep.vdoStream || 'dz' + crypto.randomBytes(6).toString('hex'),
      vdoPassword: keep.vdoPassword || crypto.randomBytes(9).toString('base64url'),
      createdAt: new Date().toISOString(),
    };
    store.write('secrets.json', s);
  }
  return s;
}

const norm = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export function sameSecret(a, b) {
  const x = crypto.createHash('sha256').update(String(a ?? '')).digest();
  const y = crypto.createHash('sha256').update(String(b ?? '')).digest();
  return crypto.timingSafeEqual(x, y) && a != null && b != null && String(a).length > 0;
}
export const codeMatches = (given, expected) => sameSecret(norm(given), norm(expected));

const MAX_AGE = 30 * 24 * 3600; // seconds
export function makeSession(secret, role) {
  const body = role + '.' + Math.floor(Date.now() / 1000);
  return body + '.' + crypto.createHmac('sha256', secret).update(body).digest('base64url');
}
export function checkSession(secret, value, role) {
  const parts = String(value || '').split('.');
  if (parts.length !== 3 || parts[0] !== role) return false;
  const body = parts[0] + '.' + parts[1];
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  if (!sameSecret(sig, parts[2])) return false;
  const age = Date.now() / 1000 - Number(parts[1]);
  return age >= 0 && age < MAX_AGE;
}
export function cookieHeader(name, value, { secure, clear = false } = {}) {
  return `${name}=${clear ? '' : value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : MAX_AGE}${secure ? '; Secure' : ''}`;
}
export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/* fixed-window limiter, keyed by client address */
export function limiter(max, windowMs) {
  const hits = new Map();
  return key => {
    const now = Date.now();
    let h = hits.get(key);
    if (!h || now > h.reset) { h = { n: 0, reset: now + windowMs }; hits.set(key, h); }
    if (hits.size > 5000) for (const [k, v] of hits) if (now > v.reset) hits.delete(k);
    return ++h.n <= max;
  };
}
