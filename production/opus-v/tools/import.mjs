// OPUS V · instrument import: the licensed Sketchfab models (glTF zips the owner downloads with his own account) into
// the Virtual Space. Each zip is recognised by the Sketchfab model id in its license.txt (its file name does not
// matter), checked against models/manifest.json (the licence must be the one approved), reduced for the web (welded,
// simplified to its triangle budget, textures 1024 px WebP) and written to assets/opus-v/instruments/<id>.glb, with
// index.json carrying what the room needs and the credits (title, author, licence, source).
//   cd production/opus-v/tools && node import.mjs            (looks in ../models and in ~/Downloads)
// Then build and deploy as usual: orchestra.js loads whatever index.json lists. Nothing in a zip is ever run.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, textureCompress, getBounds } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(HERE, '../../..');
const MODELS = process.env.MODELS || path.join(HERE, '../models');
const OUT = process.env.OUT || path.join(REPO, 'assets/opus-v/instruments');
const WORK = path.join(HERE, '.work');
const manifest = JSON.parse(fs.readFileSync(path.join(HERE, '../models/manifest.json'), 'utf8'));
const LIC = { 'CC0': /CC0|publicdomain\/zero/i, 'CC BY 4.0': /CC-BY-4\.0|licenses\/by\/4\.0/i };
fs.mkdirSync(OUT, { recursive: true });

// every zip in the models folder and in Downloads, read in memory
const dirs = [MODELS, ...(process.env.NO_DOWNLOADS ? [] : [path.join(os.homedir(), 'Downloads')])].filter(d => fs.existsSync(d));
const zips = dirs.flatMap(d => fs.readdirSync(d).filter(f => f.toLowerCase().endsWith('.zip')).map(f => path.join(d, f)));
const found = new Map();   // uid → { zip, files, license }
for (const z of zips) {
  let files; try { if (fs.statSync(z).size > 600e6) continue; files = unzipSync(new Uint8Array(fs.readFileSync(z))); } catch { continue; }
  const licName = Object.keys(files).find(n => /(^|\/)license\.txt$/i.test(n)); if (!licName) continue;
  const license = new TextDecoder().decode(files[licName]);
  const m = manifest.models.find(e => license.includes(e.uid)); if (!m) continue;
  if (!found.has(m.uid) || fs.statSync(z).mtimeMs > fs.statSync(found.get(m.uid).zip).mtimeMs) found.set(m.uid, { zip: z, files, license });
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;
const index = [], report = [];
const field = (lic, k) => (lic.match(new RegExp(`\\*\\s*${k}:\\s*(.+)`, 'i')) || [])[1]?.trim();
for (const m of manifest.models) {
  const f = found.get(m.uid);
  if (!f) { report.push(['missing', m.id, `https://sketchfab.com/3d-models/${m.uid}`]); continue; }
  if (m.approved === false) { report.push(['waiting for approval', m.id, path.basename(f.zip)]); continue; }
  const licType = field(f.license, 'license type') || '';
  if (!LIC[m.licence]?.test(licType)) { report.push(['licence differs, not used', m.id, licType]); continue; }
  // the glTF and its files, written out to a work folder (paths kept inside it)
  const dir = path.join(WORK, m.id); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  for (const [name, data] of Object.entries(f.files)) {
    const p = path.resolve(dir, name); if (!p.startsWith(dir + path.sep) || name.endsWith('/')) continue;
    fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data);
  }
  const gltf = Object.keys(f.files).find(n => /\.(gltf|glb)$/i.test(n)); if (!gltf) { report.push(['no glTF in the zip', m.id, path.basename(f.zip)]); continue; }
  const doc = await io.read(path.join(dir, gltf));
  let tris = 0; for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  const ratio = Math.min(1, m.faces / Math.max(1, tris));
  await doc.transform(dedup(), weld(), ...(ratio < 0.98 ? [simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.0008, lockBorder: true })] : []), prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }));
  let after = 0; for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) after += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  const b = getBounds(doc.getRoot().listScenes()[0]);
  await io.write(path.join(OUT, m.id + '.glb'), doc);
  const author = field(f.license, 'author') || m.author, source = field(f.license, 'source') || `https://sketchfab.com/3d-models/${m.uid}`;
  index.push({ id: m.id, file: m.id + '.glb', places: m.places, length: m.length, front: m.front, title: field(f.license, 'title') || m.title,
    author: author.replace(/\s*\(https?:[^)]*\)\s*$/, ''), authorUrl: (author.match(/\((https?:[^)]*)\)/) || [])[1] || '', licence: m.licence, licenceUrl: (licType.match(/\((https?:[^)]*)\)/) || [])[1] || '', source });
  report.push(['imported', m.id, `${Math.round(tris)} → ${Math.round(after)} triangles, ${(fs.statSync(path.join(OUT, m.id + '.glb')).size / 1e6).toFixed(1)} MB, size ${b.max.map((v, i) => (v - b.min[i]).toFixed(2)).join(' × ')}`]);
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ updated: new Date().toISOString(), models: index }, null, 1));
fs.rmSync(WORK, { recursive: true, force: true });
for (const [what, id, info] of report) console.log(`${what.padEnd(22)} ${id.padEnd(12)} ${info}`);
console.log(`\n${index.length} of ${manifest.models.length} in the room. Missing ones: download from the link shown, glTF, into ${MODELS}`);
