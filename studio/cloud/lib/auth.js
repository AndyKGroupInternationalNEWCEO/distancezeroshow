// Stage 2a prototype sign-in (BROADCAST-WEB.md). Test accounts only: generated on the first start into data/
// (git-ignored) with random passwords, never written in code. Supabase Auth replaces this before anything goes online.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// the official identities (Andy, 28 Oct 2026). Studio users only: info@distancezeroshow.com is the infrastructure
// account and never signs in here. In production these become invitation-only Supabase Auth users.
export const ACCOUNTS = [
  { login: 'andrejkneisl@distancezeroshow.com', name: 'Andrej Kneisl', role: 'director', title: 'Director · Owner / Administrator' },
  { login: 'georgiewalker@distancezeroshow.com', name: 'Georgie Walker', role: 'host', title: 'Co-Host' },
];
const hash = (pw, salt) => crypto.scryptSync(String(pw), salt, 32);

export function createAuth({ dataDir, now = () => Date.now(), ttlMs = 12 * 3600e3, maxTries = 5 }) {
  const file = path.join(dataDir, 'test-users.json');
  let users, created = null;
  try {
    users = JSON.parse(fs.readFileSync(file, 'utf8'));
    // accounts from an older list (e.g. before the official addresses) are not carried over: new test passwords
    if (ACCOUNTS.map(a => a.login).sort().join() !== Object.keys(users).sort().join()) throw new Error('other accounts');
  }
  catch {
    users = {}; created = {};
    for (const a of ACCOUNTS) {
      const pw = crypto.randomBytes(12).toString('base64url'), salt = crypto.randomBytes(16).toString('hex');
      users[a.login] = { ...a, salt, hash: hash(pw, salt).toString('hex') }; created[a.login] = pw;
    }
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(users, null, 2), { mode: 0o600 });
  }
  const sessions = new Map(), tries = new Map();

  function login(name, pw, ip = '') {
    const recent = (tries.get(ip) || []).filter(t => now() - t < 60e3);
    if (recent.length >= maxTries) return { status: 429, error: 'Too many attempts. Wait a minute.' };
    const u = users[String(name || '').trim().toLowerCase()];
    // the same work for an unknown name, so the answer time does not tell which names exist
    const got = hash(pw ?? '', u?.salt || 'unknown-user');
    if (!u || !crypto.timingSafeEqual(got, Buffer.from(u.hash, 'hex'))) { recent.push(now()); tries.set(ip, recent); return { status: 401, error: 'Wrong name or password' }; }
    tries.delete(ip);
    const sid = crypto.randomBytes(32).toString('base64url');
    const user = { login: u.login, name: u.name, role: u.role, title: u.title };
    sessions.set(sid, { ...user, expires: now() + ttlMs });
    return { sid, user };
  }
  function session(sid) {
    const s = sid ? sessions.get(sid) : null;
    if (!s) return null;
    if (s.expires < now()) { sessions.delete(sid); return null; }
    return s;
  }
  return { created, login, session, logout: sid => sessions.delete(sid) };
}
