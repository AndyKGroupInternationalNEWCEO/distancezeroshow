// The studio's media library: JINGLES // AUDIO (the master WAV jingles) and VIDEOS // VISUALS (the show's MP4 cards),
// described in media/catalog.json. Files live in ~/DISTANCE-ZERO/shared-assets. Audio files are matched by TITLE
// ("05 — WELCOME BACK 🟤_master.wav" → 05 WELCOME BACK), because file numbers and catalog numbers can differ.
// An entry without a file is reported as not available; nothing is ever faked.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const norm = s => String(s).normalize('NFKD').toUpperCase().replace(/_MASTER\.WAV$/, '').replace(/^\d+\s*[—–-]\s*/, '')
  .replace(/\((X|FINAL VERSION|NO MASTER)\)/g, '').replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

function duration(file) {
  try { return Math.round(Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8', timeout: 5000 })) * 10) / 10 || 0; }
  catch { return 0; }
}

export function createMedia({ root, dzRoot }) {
  const catalogFile = path.join(root, 'media', 'catalog.json');
  let lib = { audio: [], video: [], fx: [] }, scannedAt = 0;

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
      const abs = f ? path.join(dir, f) : '';
      return { ...a, type: 'audio', file: abs, fileName: f || '', available: !!f, duration: f ? duration(abs) : 0,
        numberMismatch: !!f && !f.startsWith(a.id) };
    });
    const video = cat.video.map(v => {
      const abs = v.file ? path.join(dzRoot, v.file) : '';
      const ok = !!abs && fs.existsSync(abs);
      return { ...v, type: 'video', file: ok ? abs : '', fileName: ok ? path.basename(abs) : '', available: ok, duration: ok ? duration(abs) : 0 };
    });
    // SOUND FX: short effects for the pads; a file matches by title or by starting with the FX number ("FX2 laugh.wav")
    const fxDir = cat.fxDir ? path.join(dzRoot, cat.fxDir) : '';
    const fxFiles = fxDir && fs.existsSync(fxDir) ? fs.readdirSync(fxDir).filter(f => /\.(wav|mp3|m4a|aiff?)$/i.test(f)) : [];
    const fx = (cat.fx || []).map(a => {
      const want = norm(a.title), base = f => norm(f.replace(/\.[a-z0-9]+$/i, ''));
      const f = fxFiles.find(x => new RegExp(`^${a.id}\\b`, 'i').test(x)) || fxFiles.find(x => base(x) === want);
      const abs = f ? path.join(fxDir, f) : '';
      return { ...a, type: 'fx', file: abs, fileName: f || '', available: !!f, duration: f ? duration(abs) : 0 };
    });
    lib = { audio, video, fx, unmatchedFiles: files.filter(f => !used.has(f)) };
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
