// The studio's media library: JINGLES // AUDIO (the master WAV jingles) and VIDEOS // VISUALS (the show's MP4 cards),
// described in media/catalog.json. Files live in ~/DISTANCE-ZERO/shared-assets. Audio files are matched by TITLE
// ("05 — WELCOME BACK 🟤_master.wav" → 05 WELCOME BACK), because file numbers and catalog numbers can differ.
// An entry without a file is reported as not available; nothing is ever faked.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const norm = s => String(s).normalize('NFKD').toUpperCase().replace(/_MASTER\.WAV$/, '').replace(/^\d+\s*[—–-]\s*/, '')
  .replace(/\((X|FINAL VERSION|NO MASTER)\)/g, '').replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

// durations are measured once per file version (path + size + time) and remembered in data/media-durations.json,
// so a start does not wait for ffprobe on every file. A file still being written (no readable duration) is not ready.
let probe = null, cache = {}, cacheFile = '';
function hasProbe() {
  if (probe === null) { try { execFileSync('ffprobe', ['-version'], { stdio: 'ignore', timeout: 5000 }); probe = true; } catch { probe = false; } }
  return probe;
}
function duration(file) {
  let st; try { st = fs.statSync(file); } catch { return 0; }
  const key = `${file}|${st.size}|${st.mtimeMs}`;
  if (cache[key] !== undefined) return cache[key];
  if (!hasProbe()) return 0;
  let d = 0;
  try { d = Math.round(Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] })) * 10) / 10 || 0; }
  catch {}
  if (d > 0) cache[key] = d;            // an unreadable file (still being written) is measured again next time
  return d;
}
const ready = (abs, d) => !!abs && (!hasProbe() || d > 0);

export function createMedia({ root, dzRoot }) {
  const catalogFile = path.join(root, 'media', 'catalog.json');
  let lib = { audio: [], video: [], fx: [] }, scannedAt = 0;
  cacheFile = path.join(root, 'data', 'media-durations.json');
  try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch { cache = {}; }

  function scan() {
    const cat = JSON.parse(fs.readFileSync(catalogFile, 'utf8'));
    const dir = path.join(dzRoot, cat.audioDir);
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /\.wav$/i.test(f)) : [];
    const used = new Set();
    const audio = cat.audio.map(a => {
      const want = norm(a.title);
      // exact title first, then a file title that is the start of the catalog title ("THIS IS ANDREJ KNEISL" → "… / DJ ANDY'K")
      const f = files.find(x => !used.has(x) && norm(x) === want) || files.find(x => !used.has(x) && norm(x).length > 6 && want.startsWith(norm(x)));
      if (f) used.add(f);
      const abs = f ? path.join(dir, f) : '', d = f ? duration(abs) : 0;
      return { ...a, type: 'audio', file: abs, fileName: f || '', available: ready(abs, d), duration: d,
        numberMismatch: !!f && !f.startsWith(a.id) };
    });
    const video = cat.video.map(v => {
      const abs = v.file ? path.join(dzRoot, v.file) : '';
      const d = abs && fs.existsSync(abs) ? duration(abs) : 0, ok = !!abs && fs.existsSync(abs) && ready(abs, d);
      return { ...v, type: 'video', file: ok ? abs : '', fileName: ok ? path.basename(abs) : '', available: ok, duration: d };
    });
    // SOUND FX: short effects for the pads; a file matches by title or by starting with the FX number ("FX2 laugh.wav")
    const fxDir = cat.fxDir ? path.join(dzRoot, cat.fxDir) : '';
    const fxFiles = fxDir && fs.existsSync(fxDir) ? fs.readdirSync(fxDir).filter(f => /\.(wav|mp3|m4a|aiff?)$/i.test(f)) : [];
    const fx = (cat.fx || []).map(a => {
      const want = norm(a.title), base = f => norm(f.replace(/\.[a-z0-9]+$/i, ''));
      const f = fxFiles.find(x => new RegExp(`^${a.id}\\b`, 'i').test(x)) || fxFiles.find(x => base(x) === want);
      const abs = f ? path.join(fxDir, f) : '';
      const d = f ? duration(abs) : 0;
      return { ...a, type: 'fx', file: abs, fileName: f || '', available: ready(abs, d), duration: d };
    });
    lib = { audio, video, fx, unmatchedFiles: files.filter(f => !used.has(f)) };
    try { fs.writeFileSync(cacheFile, JSON.stringify(cache)); } catch {}
    scannedAt = Date.now();
    return lib;
  }
  scan();

  return {
    scan,
    get lib() { return lib; },
    // what the browser may see: never full paths
    view(showId = '') {
      const pick = x => ({ id: x.id, title: x.title, type: x.type, category: x.category || '', shows: x.shows, available: x.available,
        duration: x.duration, embeddedAudio: !!x.embeddedAudio, linkedAudio: x.linkedAudio || null, fileName: x.fileName,
        forShow: !showId || x.shows.includes(showId) });
      return { audio: lib.audio.map(pick), video: lib.video.map(pick), fx: (lib.fx || []).map(pick), scannedAt, unmatched: lib.unmatchedFiles };
    },
    get(id) { return lib.audio.find(x => x.id === id) || lib.video.find(x => x.id === id) || (lib.fx || []).find(x => x.id === id) || null; },
  };
}
