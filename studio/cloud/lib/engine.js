// The link to the studio on the Vienna Mac. In Stage 2a it goes one way only: the Mac's engine PUSHES its state here
// (with its own token); the cloud never sends anything back. Only the listed fields are kept, everything else is dropped.
import crypto from 'node:crypto';

const FIELDS = {
  show: 'text', segment: 'text', segmentIndex: 'num', segmentCount: 'num', obs: 'bool', streaming: 'bool', recording: 'bool',
  rehearsal: 'bool', guest: 'text', host: 'bool', midi: 'list',
};

export function createEngineLink({ token, now = () => Date.now(), staleMs = 10000 }) {
  const expected = Buffer.from(`Bearer ${token}`);
  let state = null, at = 0;
  function heartbeat(authorization, body) {
    const got = Buffer.from(String(authorization || ''));
    if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) return false;
    const s = {};
    for (const [k, type] of Object.entries(FIELDS)) {
      const v = body?.[k];
      if (type === 'text' && typeof v === 'string') s[k] = v.slice(0, 120);
      else if (type === 'num' && Number.isFinite(v)) s[k] = v;
      else if (type === 'bool' && typeof v === 'boolean') s[k] = v;
      else if (type === 'list' && Array.isArray(v)) s[k] = v.slice(0, 8).map(x => String(x).slice(0, 60));
    }
    state = s; at = now();
    return true;
  }
  // after staleMs without a heartbeat the Mac counts as offline; the last known state stays visible, marked as old
  const view = () => ({ online: !!state && now() - at < staleMs, lastSeen: at || null, state });
  return { heartbeat, view };
}
