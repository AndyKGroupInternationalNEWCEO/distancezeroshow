// The piano arrangements of DJ Andy'K's songs (djandyk-landing/piano-reference/sheet-music/batch: the solo piano
// arrangement of every song, REVIEW DRAFT, 2026-10-22) for the Piano Stage: the grand plays each one with its own piano
// sound from the notes (no piano recording of these exists), the pages lie on its desk.
//   1. the notes: production/gpu/arrangement-notes.sh <out-dir>   (score-parts.py on a small copy of each song's folder:
//      the score is rebuilt exactly as the batch wrote it, every note timed on the beat grid it was written on)
//   2. node virtual-studio/vienna/arrangements-import.mjs <out-dir> [path/to/djandyk-landing]
// Writes assets/piano-parts/<album>__<slug>--piano.score.json, assets/sheets/<album>__<slug>--piano/p-N.jpg (the PDF's
// pages, as the other scores: 794 px wide) and virtual-studio/vienna/arrangements.js. The songs that have a piano
// recording (the Piano Sessions) keep their own parts and pages and are left out here. Nothing is sent anywhere.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { REPERTOIRE } from './repertoire.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const [NOTES, LIB = path.join(os.homedir(), 'djandyk-landing')] = process.argv.slice(2);
if (!NOTES || !fs.existsSync(NOTES)) throw new Error('usage: arrangements-import.mjs <notes-dir> [djandyk-landing]');
const BATCH = path.join(LIB, 'piano-reference', 'sheet-music', 'batch');
const tracks = JSON.parse(fs.readFileSync(path.join(BATCH, 'tracks.json'), 'utf8'));
const recorded = new Set(REPERTOIRE.filter(s => s.piano && s.audio).map(s => s.id));
const sheetsInfo = JSON.parse(fs.readFileSync(path.join(LIB, 'src', 'data', 'artist-piano-sheets.json'), 'utf8'));
const toCheck = new Map(sheetsInfo.flatMap(a => a.tracks.map(t => [`${a.slug}/${t.slug}`, { bars: t.bars, flagged: t.flagged }])));
const SOURCE = "DJ Andy'K's solo piano arrangement (review draft, 2026-10-22): melody and chord voicings from the song, played from the score on the desk (no piano recording)";
const APPROVED = { by: "DJ Andy'K", on: '2026-10-28', note: 'review draft: played as it stands, its marked bars still to check' };

const list = [], parts = {}, sheets = {};
for (const t of tracks) {
  const base = `${t.album}--${t.slug}`, id = `${t.album}/${t.slug}`;
  if (recorded.has(id)) continue;   // a Piano Sessions song: its own part and pages stay
  const nf = path.join(NOTES, base + '.json');
  if (!fs.existsSync(nf)) { console.warn('no notes for', base); continue; }
  const got = JSON.parse(fs.readFileSync(nf, 'utf8'))[base];
  if (!got?.same_score) throw new Error(base + ': the score was not reproduced exactly');
  // a pickup before the beat grid's first beat (t < 0): the whole arrangement moves so that it starts at 0 (no recording
  // to stay in step with, so nothing is clipped)
  const lead = Math.min(0, ...got.notes.map(n => n.t));
  const notes = got.notes.map(n => ({ ...n, t: +(n.t - lead).toFixed(4) }));
  const end = notes.reduce((x, n) => Math.max(x, n.t + n.d), 0), seconds = Math.ceil(end + 1.5);
  const aid = `${id}--piano`, file = `${t.album}__${t.slug}--piano`;
  // the notes, in the format the keys read (keys.js)
  fs.writeFileSync(path.join(ROOT, 'assets', 'piano-parts', file + '.score.json'),
    JSON.stringify({ song: aid, kind: 'piano-part', source: SOURCE, offset: 0, duration: seconds, notes }));
  // the pages
  const pdf = path.join(BATCH, 'out2', `${base}--solo-piano-arrangement--REVIEW-DRAFT.pdf`);
  if (!fs.existsSync(pdf)) throw new Error('no PDF for ' + base);
  const dir = path.join(ROOT, 'assets', 'sheets', file);
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  execFileSync('pdftoppm', ['-jpeg', '-jpegopt', 'quality=80', '-scale-to-x', '794', '-scale-to-y', '-1', pdf, path.join(dir, 'p')]);
  const pages = fs.readdirSync(dir).filter(f => f.endsWith('.jpg')).sort((a, b) => parseInt(a.slice(2)) - parseInt(b.slice(2)));
  sheets[aid] = pages.map(f => `assets/sheets/${file}/${f}`);
  parts[aid] = { file: `assets/piano-parts/${file}.score.json`, notes: notes.length, bars: got.bars, source: SOURCE, approved: APPROVED, check: toCheck.get(id) || null };
  list.push({ id: aid, album: t.albumTitle, title: `${t.title} (Piano arrangement)`, n: t.n, key: t.key || null, bpm: t.bpm || null, chords: t.chords || null,
    seconds, piano: true, arrangement: true, notesOnly: true, audio: null });
  console.log(aid, notes.length, 'notes', pages.length, 'pages', seconds + ' s');
}
// a cover for an album the Virtual Space had none for (192 px, as the others)
for (const album of new Set(tracks.map(t => t.album))) {
  const out = path.join(ROOT, 'assets', 'covers', album + '.jpg');
  const src = path.join(LIB, 'public', 'releases', album + '-cover.png');
  if (!fs.existsSync(out) && fs.existsSync(src)) execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '80', '-Z', '192', src, '--out', out], { stdio: 'ignore' });
}
fs.writeFileSync(path.join(ROOT, 'virtual-studio', 'vienna', 'arrangements.js'),
  `// GENERATED by virtual-studio/vienna/arrangements-import.mjs: DJ Andy'K's piano arrangements of his songs (review draft,\n` +
  `// 2026-10-22). No piano recording exists of them: the grand plays each from its notes with its own piano sound, the\n` +
  `// pages lie on its desk. Added to the Songs list on 2026-10-28 on DJ Andy'K's word, as drafts ("check": bars to check).\n` +
  `export const ARRANGEMENTS = ${JSON.stringify(list, null, 1)};\n` +
  `export const ARRANGEMENT_PARTS = ${JSON.stringify(parts, null, 1)};\n` +
  `export const ARRANGEMENT_SHEETS = ${JSON.stringify(sheets, null, 1)};\n`);
console.log(list.length, 'arrangements');
