// Builds each show's own OBS scene collection from studio/shows/<show>.json: `npm run obs-setup -- sunday friday`.
// Safe by design:
//   - backs up OBS's scene collections (the files on disk) to data/obs-backups/<time>/ before anything else
//   - only ADDS new collections; an existing collection with the same name is never touched (it stops instead)
//   - refuses while OBS is streaming or recording, never starts either
//   - goes back to the collection that was open before
// Media files that are not there yet keep their slot (empty source with the planned name), to be filled in later.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Obs } from './lib/obs.js';
import { loadConfig } from './server.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DZ = path.resolve(ROOT, '..', '..');                       // ~/DISTANCE-ZERO: media paths in the presets are relative to it
for (const f of ['.env.local', '.env']) { try { process.loadEnvFile(path.join(ROOT, f)); break; } catch {} }
const config = loadConfig();
const wanted = process.argv.slice(2).filter(a => !a.startsWith('-'));
if (!wanted.length) { console.log('Usage: npm run obs-setup -- sunday friday'); process.exit(1); }
const shows = wanted.map(id => JSON.parse(fs.readFileSync(path.join(ROOT, 'shows', id + '.json'), 'utf8')));

const secrets = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'secrets.json'), 'utf8'));
const overlayUrl = `http://127.0.0.1:${config.director.port}/overlay?key=${secrets.overlayKey}`;
const vdoBase = config.vdoNinja?.base || 'https://vdo.ninja/';
const vdoView = vdoBase + '?' + new URLSearchParams({ view: secrets.vdoStream, password: secrets.vdoPassword, cleanoutput: '' }).toString().replace(/=(&|$)/g, '$1');

// the camera: reuse the device of an existing OBS camera source, so the right camera is picked straight away
const OBS_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'obs-studio', 'basic', 'scenes');
function existingCamera() {
  for (const f of fs.existsSync(OBS_DIR) ? fs.readdirSync(OBS_DIR).filter(x => x.endsWith('.json')) : []) {
    try {
      const s = JSON.parse(fs.readFileSync(path.join(OBS_DIR, f), 'utf8')).sources?.find(x => /av_capture|macos-avcapture/.test(x.versioned_id || x.id));
      if (s) return { kind: s.versioned_id || s.id, settings: s.settings || {} };
    } catch {}
  }
  return { kind: 'av_capture_input_v2', settings: {} };
}

const media = (rel, o = {}) => ({
  kind: 'ffmpeg_source',
  settings: { is_local_file: true, local_file: rel ? path.join(DZ, rel) : '', looping: !!o.loop, restart_on_activate: !!o.restart,
    close_when_inactive: false, hw_decode: true, clear_on_media_end: !o.loop },
});
function inputFor(name, src, cam) {
  switch (src.kind) {
    case 'camera': return { kind: cam.kind, settings: cam.settings };
    case 'vdo': return { kind: 'browser_source', settings: { url: vdoView, width: 1920, height: 1080, reroute_audio: true, restart_when_active: false, shutdown: false } };
    case 'overlay': return { kind: 'browser_source', settings: { url: overlayUrl, width: 1920, height: 1080, shutdown: false } };
    case 'mic': return { kind: 'coreaudio_input_capture', settings: { device_id: 'default' } };
    case 'mixer': return { kind: 'coreaudio_input_capture', settings: { device_id: 'default' }, muted: true };   // muted until its device is chosen
    case 'media': case 'audio': return media(src.file, src);
    default: throw new Error(`${name}: unknown source kind ${src.kind}`);
  }
}

const obs = new Obs({ url: process.env.OBS_URL || config.obs.url, password: process.env.OBS_WEBSOCKET_PASSWORD || '', micPattern: config.emergency.micPattern, log: { log() {}, warn() {}, error() {} } });
const req = (t, d) => obs.request(t, d);
const say = (...a) => console.log(...a);
const timeout = setTimeout(() => { say('FAIL  no connection to OBS within 10 s (is OBS open with its WebSocket server on?)'); process.exit(1); }, 10000);

obs.on('link', async up => {
  if (!up) return;
  clearTimeout(timeout);
  try {
    const st = await req('GetStreamStatus'), rec = await req('GetRecordStatus');
    if (st.outputActive || rec.outputActive) throw new Error('OBS is streaming or recording: nothing was changed');
    // 1. backup of every scene collection file
    const stamp = new Date().toISOString().replace(/[:.]/g, '-'), backup = path.join(ROOT, 'data', 'obs-backups', stamp);
    fs.mkdirSync(backup, { recursive: true, mode: 0o700 });
    for (const f of fs.readdirSync(OBS_DIR)) if (f.endsWith('.json')) fs.copyFileSync(path.join(OBS_DIR, f), path.join(backup, f));
    say(`OK    backup of OBS scene collections: data/obs-backups/${stamp}/`);
    const before = await req('GetSceneCollectionList');
    const cam = existingCamera();
    for (const show of shows) {
      const name = show.obs.sceneCollection;
      if (before.sceneCollections.includes(name)) { say(`SKIP  "${name}" already exists: left exactly as it is`); continue; }
      await req('CreateSceneCollection', { sceneCollectionName: name });           // OBS creates it and switches to it
      await new Promise(r => setTimeout(r, 2500));
      const defaults = (await req('GetSceneList')).scenes.map(s => s.sceneName);
      // a hidden helper scene with every sound source (mic, DJ mixer, jingles, beds), nested in each show scene,
      // so they are live in every shot and the studio's jingle cart can play them
      const AUDIO = 'AUDIO // ALL';
      await req('CreateScene', { sceneName: AUDIO });
      const made = new Set(), missing = [];
      const add = async (scene, src, enabled = true) => {
        if (made.has(src)) return (await req('CreateSceneItem', { sceneName: scene, sourceName: src, sceneItemEnabled: enabled })).sceneItemId;
        const def = inputFor(src, show.sources[src], cam);
        const r = await req('CreateInput', { sceneName: scene, inputName: src, inputKind: def.kind, inputSettings: def.settings, sceneItemEnabled: enabled });
        made.add(src);
        if (def.muted) await req('SetInputMute', { inputName: src, inputMuted: true });
        const file = show.sources[src].file;
        if (file !== undefined && (!file || !fs.existsSync(path.join(DZ, file)))) missing.push(src);
        return r.sceneItemId;
      };
      for (const src of show.audioOnly || []) await add(AUDIO, src);
      for (const sc of show.scenes) {
        await req('CreateScene', { sceneName: sc.name });
        for (const [src, box] of sc.items) {
          const id = await add(sc.name, src);
          await req('SetSceneItemTransform', { sceneName: sc.name, sceneItemId: id, sceneItemTransform: {
            positionX: box.x, positionY: box.y, alignment: 5, boundsType: 'OBS_BOUNDS_SCALE_INNER', boundsAlignment: 0, boundsWidth: box.w, boundsHeight: box.h } });
        }
        await req('CreateSceneItem', { sceneName: sc.name, sourceName: AUDIO, sceneItemEnabled: true });
      }
      await req('SetCurrentProgramScene', { sceneName: show.obs.standbyScene });
      for (const s of defaults) if (!show.scenes.some(x => x.name === s) && s !== AUDIO) await req('RemoveScene', { sceneName: s }).catch(() => {});
      say(`OK    "${name}": ${show.scenes.length} scenes (${show.scenes.map(s => s.name).join(', ')}), ${made.size} sources`);
      if (missing.length) say(`      slots waiting for a file (fill in later in OBS or in shows/${show.id}.json): ${missing.join(', ')}`);
      const notes = Object.entries(show.sources).filter(([, s]) => s.note && s.kind !== 'audio').map(([n, s]) => `${n}: ${s.note}`);
      if (notes.length) say('      to do once: ' + notes.join(' · '));
    }
    await req('SetCurrentSceneCollection', { sceneCollectionName: before.currentSceneCollectionName });
    say(`OK    back to the collection that was open before: "${before.currentSceneCollectionName}"`);
    obs.stop(); process.exit(0);
  } catch (e) { say('FAIL  ' + e.message); obs.stop(); process.exit(1); }
});
obs.start();
