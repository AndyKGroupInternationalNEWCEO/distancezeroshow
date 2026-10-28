// Stage 2a prototype sign-in (BROADCAST-WEB.md). Test accounts only: generated on the first start into data/
// (git-ignored) with random passwords, never written in code. Supabase Auth replaces this before anything goes online.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const ACCOUNTS = [{ login: 'andy', name: 'Andy', role: 'director' }, { login: 'georgie', name: 'Georgie', role: 'host' }];
const hash = (pw, salt) => crypto.scryptSync(String(pw), salt, 32);

export function createAuth({ dataDir, now = () => Date.now(), ttlMs = 12 * 3600e3, maxTries = 5 }) {
  const file = path.join(dataDir, 'test-users.json');
  let users, created = null;
  try { users = JSON.parse(fs.readFileSync(file, 'utf8')); }
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
    sessions.set(sid, { login: u.login, name: u.name, role: u.role, expires: now() + ttlMs });
    return { sid, user: { login: u.login, name: u.name, role: u.role } };
  }
  function session(sid) {
    const s = sid ? sessions.get(sid) : null;
    if (!s) return null;
    if (s.expires < now()) { sessions.delete(sid); return null; }
    return s;
  }
  return { created, login, session, logout: sid => sessions.delete(sid) };
}
