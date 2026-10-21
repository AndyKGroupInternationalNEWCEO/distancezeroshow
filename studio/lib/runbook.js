// SHOW RUNBOOKS: one PDF script per show (Friday DJ show, Saturday Piano Sessions, Sunday…), kept in data/runbooks/
// exactly as uploaded (byte for byte; its SHA-256 is recorded and checked). For use on air the studio reads it, without
// changing it, with the free poppler tools (brew install poppler):
//   pdftotext  the text of every page → the sections (headings such as "01 / OPENING" or "A / ARRIVAL") and their words
//   pdftoppm   a picture of every page → the page as it looks in the PDF, in the Director Studio
// The Director's own notes to a section are stored apart from it (data/runbooks/<show>.notes.json).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';

const MAX = 25 * 1024 * 1024;
const run = (cmd, args) => new Promise((res, rej) => execFile(cmd, args, { maxBuffer: 30 * 1024 * 1024, timeout: 60000 }, (e, out) => (e ? rej(e) : res(String(out)))));
const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');
const str = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, max);

// the headings of a page: "NN / TITLE" (a numbered part of the show) and "X / TITLE" or "WORD WORD / Title" (a
// step inside it); running headers and footers (with "//" or "•", or a page count "01 / 04") are not headings
const UP = 'A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ';
const furniture = l => /\/\/|•/.test(l) || /(^|\s)\d{2}\s*\/\s*\d{2}$/.test(l) || /^\d{1,3}$/.test(l);   // running headers, footers, page numbers
export function heading(raw) {
  const l = raw.trim();
  if (!l || l.length > 70 || furniture(l)) return null;
  let m = /^(\d{2})\s*\/\s*(\S.*)$/.exec(l);
  if (m) return { level: 1, title: `${m[1]} / ${m[2]}` };
  m = new RegExp(`^([${UP}0-9][${UP}0-9 &’'()\\-]{0,40})\\s+\\/\\s+(\\S.*)$`).exec(l);
  if (m && new RegExp(`^[${UP}0-9 &’'()\\-—]+$`).test(m[2].replace(/[.,:]/g, ''))) return { level: 2, title: `${m[1]} / ${m[2]}` };
  return null;
}
// every section with its page and its words (up to the next heading, across a page break). Only the running headers and
// footers are left out: lines that come back on several pages (page numbers aside). A spoken line that names
// "DISTANCE // ZERO" stays — the script must be complete, word for word.
export function sectionsOf(pages) {
  const norm = l => l.trim().replace(/\s+/g, ' ').replace(/\d+/g, '#');
  const seen = new Map();
  pages.forEach(t => { for (const k of new Set(t.split('\n').map(norm).filter(Boolean))) seen.set(k, (seen.get(k) || 0) + 1); });
  const running = l => pages.length > 1 && (seen.get(norm(l)) || 0) >= Math.max(2, Math.ceil(pages.length / 2));
  const out = [];
  pages.forEach((t, i) => {
    for (const raw of t.split('\n')) {
      const hd = heading(raw);
      if (hd) { out.push({ page: i + 1, ...hd, key: `${i + 1}:${hd.title}`, lines: [] }); continue; }
      if (out.length && !running(raw) && !/^\d{1,3}$/.test(raw.trim())) out.at(-1).lines.push(raw.replace(/\s+$/, ''));
    }
  });
  return out.map(({ lines, ...s }) => ({ ...s, text: lines.join('\n').replace(/^\s*\n|\n\s*$/g, '').replace(/\n{3,}/g, '\n\n').replace(/^ {2,}/gm, '') }));
}

export function createRunbooks({ dir }) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const ok = id => { if (!/^[a-z0-9-]{1,30}$/.test(String(id))) throw new Error('No such show'); return id; };
  const pdf = id => path.join(dir, ok(id) + '.pdf');
  const metaFile = id => path.join(dir, ok(id) + '.json');
  const notesFile = id => path.join(dir, ok(id) + '.notes.json');
  const pagesDir = id => path.join(dir, ok(id) + '.pages');
  const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };

  function meta(id) {
    const m = readJson(metaFile(id), null);
    if (!m) return null;
    // the stored file must still be the uploaded one
    let intact = false; try { intact = sha256(fs.readFileSync(pdf(id))) === m.sha256; } catch {}
    return { ...m, intact };
  }

  async function upload(id, buf, name = '') {
    ok(id);
    if (!Buffer.isBuffer(buf) || buf.length < 100 || buf.length > MAX) throw new Error('A runbook must be a PDF of at most 25 MB');
    if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error('This file is not a PDF');
    const tmp = pdf(id) + '.tmp';
    fs.writeFileSync(tmp, buf, { mode: 0o600 });
    let pages = 0;
    try {
      const info = await run('pdfinfo', [tmp]);
      pages = Number(/^Pages:\s+(\d+)/m.exec(info)?.[1]) || 0;
      if (!pages || pages > 200) throw new Error('The PDF has no readable pages');
    } catch (e) {
      fs.rmSync(tmp, { force: true });
      throw new Error(/ENOENT/.test(e.message) ? 'Runbooks need the poppler tools (brew install poppler)' : e.message.startsWith('The PDF') ? e.message : 'This PDF could not be read');
    }
    // text and a picture of each page, from the uploaded file itself
    const text = [];
    for (let p = 1; p <= pages; p++) text.push((await run('pdftotext', ['-layout', '-enc', 'UTF-8', '-f', String(p), '-l', String(p), tmp, '-'])).replace(/\f/g, '').replace(/\s+$/, ''));
    const pd = pagesDir(id) + '.tmp';
    fs.rmSync(pd, { recursive: true, force: true }); fs.mkdirSync(pd, { mode: 0o700 });
    await run('pdftoppm', ['-png', '-r', '110', tmp, path.join(pd, 'p')]);
    const files = fs.readdirSync(pd).filter(f => /^p-\d+\.png$/.test(f)).sort((a, b) => parseInt(a.slice(2)) - parseInt(b.slice(2)));
    files.forEach((f, i) => fs.renameSync(path.join(pd, f), path.join(pd, `${i + 1}.png`)));
    const sections = sectionsOf(text);
    // the uploaded file becomes the runbook only once all of that worked
    fs.renameSync(tmp, pdf(id));
    fs.rmSync(pagesDir(id), { recursive: true, force: true }); fs.renameSync(pd, pagesDir(id));
    const m = { show: id, name: str(path.basename(name || 'runbook.pdf'), 160), size: buf.length, sha256: sha256(buf), pages, uploadedAt: Date.now(), sections, text };
    fs.writeFileSync(metaFile(id), JSON.stringify(m), { mode: 0o600 });
    return meta(id);
  }

  function remove(id) {
    for (const f of [pdf(id), metaFile(id)]) fs.rmSync(f, { force: true });
    fs.rmSync(pagesDir(id), { recursive: true, force: true });
    // the notes stay: a new version of the same runbook keeps them where its headings are the same
  }

  return {
    upload, remove, meta,
    // what the Director Studio shows: the outline and the words of each page (the PDF and its pages are separate files)
    view(id) {
      const m = meta(id); if (!m) return null;
      return { show: m.show, name: m.name, size: m.size, sha256: m.sha256, pages: m.pages, uploadedAt: m.uploadedAt, intact: m.intact,
        sections: m.sections, text: m.text, notes: readJson(notesFile(id), {}) };
    },
    summary(id) { const m = meta(id); return m ? { name: m.name, pages: m.pages, uploadedAt: m.uploadedAt, sections: m.sections.length, intact: m.intact, sha256: m.sha256 } : null; },
    pdfPath(id) { return meta(id) ? pdf(id) : null; },
    pagePath(id, n) { const f = path.join(pagesDir(id), `${Number(n)}.png`); return /^\d{1,3}$/.test(String(n)) && fs.existsSync(f) ? f : null; },
    setNote(id, key, text) {
      const all = readJson(notesFile(id), {});
      const k = str(key, 200); if (!k) throw new Error('No section');
      const t = str(text, 6000);
      if (t) all[k] = t; else delete all[k];
      fs.writeFileSync(notesFile(id) + '.tmp', JSON.stringify(all), { mode: 0o600 }); fs.renameSync(notesFile(id) + '.tmp', notesFile(id));
      return all;
    },
  };
}
