// Small JSON store for the studio's private data (studio/data, never committed).
// Writes are atomic (temp file + rename) and owner-only, so a crash mid-write never leaves half a file.
import fs from 'node:fs';
import path from 'node:path';

export function createStore(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = name => path.join(dir, name);
  return {
    dir,
    read(name, fallback = null) {
      try { return JSON.parse(fs.readFileSync(file(name), 'utf8')); }
      catch (e) { if (e.code !== 'ENOENT') console.warn(`[store] ${name} unreadable, using defaults: ${e.message}`); return fallback; }
    },
    write(name, value) {
      const tmp = file(name) + '.' + process.pid + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, file(name));
    },
    /* for timed background saves: a failed save is reported, never a crash in the middle of a show */
    writeSafe(name, value) {
      try { this.write(name, value); } catch (e) { console.warn(`[store] could not save ${name}: ${e.message}`); }
    },
  };
}

/* coalesces bursts of changes (meters, chat) into one write per interval */
export function debounced(fn, ms = 400) {
  let t = null;
  const run = () => { t = null; fn(); };
  const call = () => { if (!t) t = setTimeout(run, ms); };
  call.flush = () => { if (t) { clearTimeout(t); run(); } };
  return call;
}
