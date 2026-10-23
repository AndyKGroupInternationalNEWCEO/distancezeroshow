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
const PLAYERS = process.argv.includes('--players');   // add the media players to EXISTING show collections (nothing else changes)
const KEYING = process.argv.includes('--keying');     // add background removal to EXISTING show collections (nothing else changes)
const PRESHOW = process.argv.includes('--preshow');   // add the PRE-SHOW scene to EXISTING show collections (nothing else changes)
const MEDIA = process.argv.includes('--media');       // point EXISTING media sources at the files the preset names now (nothing else changes)
if (!wanted.length) { console.log('Usage: npm run obs-setup -- sunday friday'); process.exit(1); }
const shows = wanted.map(id => JSON.parse(fs.readFileSync(path.join(ROOT, 'shows', id + '.json'), 'utf8')));

const secrets = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'secrets.json'), 'utf8'));
const overlayUrl = `http://127.0.0.1:${config.director.port}/overlay?key=${secrets.overlayKey}`;
// the Vienna Piano Stage from this studio (lib/stage.js): the fixed 1920 × 1080 broadcast picture, never ?obs=1
const stageUrl = `http://127.0.0.1:${config.director.port}/piano-stage/?quality=broadcast&phone=1&stagekey=${secrets.overlayKey}`;
const player = { is_local_file: true, local_file: '', looping: false, restart_on_activate: false, close_when_inactive: false, clear_on_media_end: true, hw_decode: true };
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
  muted: !!o.muted,   // picture-only backgrounds: their own sound never reaches the program
});
function inputFor(name, src, cam) {
  switch (src.kind) {
    case 'camera': return { kind: cam.kind, settings: cam.settings };
    case 'vdo': return { kind: 'browser_source', settings: { url: vdoView, width: 1920, height: 1080, reroute_audio: true, restart_when_active: false, shutdown: false } };
    case 'guest': return { kind: 'browser_source', muted: true, settings: { url: 'about:blank', width: 1280, height: 720, reroute_audio: true, restart_when_active: false, shutdown: false } };
    case 'virtualspace': return { kind: 'browser_source', settings: { url: 'https://virtualspace.distancezeroshow.com/?obs=1&play=video', width: 1920, height: 1080,
      fps_custom: true, fps: 30, reroute_audio: true, restart_when_active: true, shutdown: false } };   // sound through the OBS mixer, reloaded on every cut to it
    case 'overlay': return { kind: 'browser_source', settings: { url: overlayUrl, width: 1920, height: 1080, shutdown: false } };
    // its sound only through the OBS mixer (never also out of the Mac's speakers), not reloaded on a cut, kept running
    // off air so the piano does not restart; the frame rate the 3D stage was measured at
    case 'stage': return { kind: 'browser_source', settings: { url: stageUrl, width: 1920, height: 1080, fps_custom: true, fps: 30, reroute_audio: true,
      restart_when_active: false, shutdown: false } };
    case 'player': return { kind: 'ffmpeg_source', settings: player };
    case 'mic': return { kind: 'coreaudio_input_capture', settings: { device_id: 'default' } };
    case 'mixer': return { kind: 'coreaudio_input_capture', settings: { device_id: 'default' }, muted: true };   // muted until its device is chosen
    case 'media': case 'audio': return media(src.file, src);
    default: throw new Error(`${name}: unknown source kind ${src.kind}`);
  }
}

const obs = new Obs({ url: process.env.OBS_URL || config.obs.url, password: process.env.OBS_WEBSOCKET_PASSWORD || '', micPattern: config.emergency.micPattern, log: { log() {}, warn() {}, error() {} } });
const req = (t, d) => obs.request(t, d);
const say = (...a) => console.log(...a);
// switching or creating a collection makes OBS reload everything: it can take longer than one request may wait
async function switchTo(type, name) {
  await req(type, { sceneCollectionName: name }).catch(e => { if (!/did not answer/.test(e.message)) throw e; });
  for (let i = 0; i < 40; i++) {
    const c = await req('GetSceneCollectionList').catch(() => null);
    if (c?.currentSceneCollectionName === name) { await new Promise(r => setTimeout(r, 1500)); return; }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`OBS did not open the collection "${name}"`);
}
const timeout = setTimeout(() => { say('FAIL  no connection to OBS within 10 s (is OBS open with its WebSocket server on?)'); process.exit(1); }, 10000);

// Media players for the studio's JINGLES // AUDIO and VIDEOS // VISUALS libraries: the studio loads the chosen file
// into them and plays it. Jingle Player sits in the sound scene (live in every shot); Video Player sits in a new VT
// scene and on top of OPENING / BREAK / CREDITS (below the graphics); empty, it is transparent.
async function addPlayers(show, existing) {
  const name = show.obs.sceneCollection;
  if (!existing.includes(name)) { say(`SKIP  "${name}" does not exist (run obs-setup without --players first)`); return; }
  await switchTo('SetCurrentSceneCollection', name);
  const inputs = new Set((await req('GetInputList')).inputs.map(i => i.inputName));
  const scenes = new Set((await req('GetSceneList')).scenes.map(s => s.sceneName));
  const done = [];
  // the show's playlist player (Friday: Music Player), next to the jingles, so the album is live in every scene
  const mp = show.playlist?.player;
  if (mp && mp !== 'stage' && !inputs.has(mp)) { await req('CreateInput', { sceneName: 'AUDIO // ALL', inputName: mp, inputKind: 'ffmpeg_source', inputSettings: player }); done.push(mp); }
  if (!inputs.has('Jingle Player')) { await req('CreateInput', { sceneName: 'AUDIO // ALL', inputName: 'Jingle Player', inputKind: 'ffmpeg_source', inputSettings: player }); done.push('Jingle Player'); }
  // SOUND FX pads: a separate player, so an effect never cuts the jingle
  if (!inputs.has('FX Player')) { await req('CreateInput', { sceneName: 'AUDIO // ALL', inputName: 'FX Player', inputKind: 'ffmpeg_source', inputSettings: player }); done.push('FX Player'); }
  const full = { positionX: 0, positionY: 0, alignment: 5, boundsType: 'OBS_BOUNDS_SCALE_INNER', boundsAlignment: 0, boundsWidth: 1920, boundsHeight: 1080 };
  const place = async (scene, created) => {
    const items = (await req('GetSceneItemList', { sceneName: scene })).sceneItems;
    let it = items.find(i => i.sourceName === 'Video Player');
    if (it && !created) return;
    const id = it ? it.sceneItemId : (await req('CreateSceneItem', { sceneName: scene, sourceName: 'Video Player' })).sceneItemId;
    await req('SetSceneItemTransform', { sceneName: scene, sceneItemId: id, sceneItemTransform: full });
    const ov = (await req('GetSceneItemList', { sceneName: scene })).sceneItems.find(i => i.sourceName === 'D//0 Overlay');
    if (ov) await req('SetSceneItemIndex', { sceneName: scene, sceneItemId: id, sceneItemIndex: ov.sceneItemIndex });   // just below the graphics
    done.push(`Video Player in ${scene}`);
  };
  if (!scenes.has('VT')) {
    await req('CreateScene', { sceneName: 'VT' });
    if (!inputs.has('Video Player')) { await req('CreateInput', { sceneName: 'VT', inputName: 'Video Player', inputKind: 'ffmpeg_source', inputSettings: player }); inputs.add('Video Player'); await place('VT', true); }
    await req('CreateSceneItem', { sceneName: 'VT', sourceName: 'D//0 Overlay' }).catch(() => {});
    await req('CreateSceneItem', { sceneName: 'VT', sourceName: 'AUDIO // ALL' });
    done.push('scene VT');
  }
  // every show scene: a cue card (SPECIAL GUEST, COMING UP NEXT…) plays over the shot under the graphics, then clears itself
  for (const sc of scenes) if (sc !== 'VT' && !sc.startsWith('AUDIO //')) await place(sc, false);
  // THIRD SEAT: the existing GUEST scene gets the guest in the centre — ANDY'K | GUEST | GEORGIE. The guest source starts
  // HIDDEN and MUTED; only TAKE GUEST ON AIR in the studio shows and unmutes it. Its VDO.Ninja address is set per invitation.
  if (scenes.has('GUEST')) {
    const items = (await req('GetSceneItemList', { sceneName: 'GUEST' })).sceneItems;
    if (!items.some(i => i.sourceName === 'VDO // Guest')) {
      const box = (x) => ({ positionX: x, positionY: 300, alignment: 5, boundsType: 'OBS_BOUNDS_SCALE_INNER', boundsAlignment: 0, boundsWidth: 592, boundsHeight: 333 });
      const settings = { url: 'about:blank', width: 1280, height: 720, reroute_audio: true, restart_when_active: false, shutdown: false };
      const id = inputs.has('VDO // Guest')
        ? (await req('CreateSceneItem', { sceneName: 'GUEST', sourceName: 'VDO // Guest', sceneItemEnabled: false })).sceneItemId
        : (await req('CreateInput', { sceneName: 'GUEST', inputName: 'VDO // Guest', inputKind: 'browser_source', inputSettings: settings, sceneItemEnabled: false })).sceneItemId;
      await req('SetInputMute', { inputName: 'VDO // Guest', inputMuted: true });
      await req('SetSceneItemTransform', { sceneName: 'GUEST', sceneItemId: id, sceneItemTransform: box(664) });
      for (const [src, x] of [['Cam // Andrej', 40], ['VDO // Georgie', 1288]]) {
        const it = items.find(i => i.sourceName === src);
        if (it) await req('SetSceneItemTransform', { sceneName: 'GUEST', sceneItemId: it.sceneItemId, sceneItemTransform: box(x) });
      }
      const ov = (await req('GetSceneItemList', { sceneName: 'GUEST' })).sceneItems.find(i => i.sourceName === 'D//0 Overlay');
      if (ov) await req('SetSceneItemIndex', { sceneName: 'GUEST', sceneItemId: id, sceneItemIndex: ov.sceneItemIndex });
      done.push('guest seat in GUEST (ANDY\'K | GUEST | GEORGIE, guest hidden and muted)');
    }
  }
  say(done.length ? `OK    "${name}": added ${done.join(', ')}` : `OK    "${name}": players already there, nothing changed`);
}

// Background removal (the free OBS Background Removal plugin, royshil/obs-backgroundremoval): each person is cut out of
// their camera and stands in front of the show's own background video (show.keying.background) instead of their room.
// Settings from the rehearsals of 13 and 15 Oct: Robust Video Matting on CoreML (cleaner hair and edges than MediaPipe),
// mask every 2nd frame with temporal smoothing (three keyed people on an 8 GB M2), edges pulled in by 1 px against halos.
// The mask keeps running when the camera is not on air: started on a cut, it needs 5–10 s and the person would be missing.
// A scene that shows a keyed camera without that background gets it at the very bottom, full frame.
const KEY_FILTER = 'D//0 Background Removal';
const keySettings = { model_select: 'models/rvm_mobilenetv3_fp32.with_runtime_opt.ort', useGPU: 'coreml', numThreads: 1, mask_every_x_frames: 2,
  enable_threshold: true, threshold: 0.5, contour_filter: 0.05, smooth_contour: 0.5, feather: 0.02, mask_expansion: -1,
  temporal_smooth_factor: 0.55, enable_image_similarity: true, blur_background: 0, stop_when_source_is_inactive: false };
// Andrej's own camera (the Mac's camera): full 1080p, and a grade towards the studio's dark, cool look with a little sharpening
const CAM = 'Cam // Andrej';
const camFilters = [['D//0 Studio Look', 'color_filter_v2', { contrast: 0.08, saturation: -0.12, gamma: -0.05, brightness: -0.02 }],
  ['D//0 Sharpen', 'sharpness_filter', { sharpness: 0.12 }]];
async function addKeying(show, existing) {
  const name = show.obs.sceneCollection;
  if (!show.keying) { say(`SKIP  "${name}": no keying in shows/${show.id}.json`); return; }
  if (existing && !existing.includes(name)) { say(`SKIP  "${name}" does not exist (run obs-setup without --keying first)`); return; }
  if (existing) await switchTo('SetCurrentSceneCollection', name);
  const kinds = await req('GetSourceFilterKindList').then(r => r.sourceFilterKinds).catch(() => null);
  if (kinds && !kinds.includes('background_removal')) throw new Error('the OBS Background Removal plugin is not installed: nothing was changed');
  const inputs = new Set((await req('GetInputList')).inputs.map(i => i.inputName));
  const bg = show.keying.background, keyed = show.keying.sources.filter(s => inputs.has(s));
  if (!inputs.has(bg)) throw new Error(`"${name}": background "${bg}" is missing: nothing was changed`);
  const done = [];
  for (const src of keyed) {
    const filters = (await req('GetSourceFilterList', { sourceName: src })).filters;
    if (filters.some(f => f.filterName === KEY_FILTER)) {
      const f = filters.find(f => f.filterName === KEY_FILTER);
      if (Object.entries(keySettings).every(([k, v]) => f.filterSettings[k] === v)) continue;
      await req('SetSourceFilterSettings', { sourceName: src, filterName: KEY_FILTER, filterSettings: keySettings });
      done.push(`background removal settings on ${src}`); continue;
    }
    await req('CreateSourceFilter', { sourceName: src, filterName: KEY_FILTER, filterKind: 'background_removal', filterSettings: keySettings });
    done.push(`background removal on ${src}`);
  }
  if (keyed.includes(CAM)) {
    const cur = (await req('GetInputSettings', { inputName: CAM })).inputSettings;
    if (cur.preset !== 'AVCaptureSessionPreset1920x1080') {
      await req('SetInputSettings', { inputName: CAM, inputSettings: { use_preset: true, preset: 'AVCaptureSessionPreset1920x1080' } });
      done.push(`${CAM} at 1920x1080`);
    }
    const have = new Set((await req('GetSourceFilterList', { sourceName: CAM })).filters.map(f => f.filterName));
    for (const [fname, kind, settings] of camFilters) {
      if (have.has(fname)) await req('SetSourceFilterSettings', { sourceName: CAM, filterName: fname, filterSettings: settings });
      else { await req('CreateSourceFilter', { sourceName: CAM, filterName: fname, filterKind: kind, filterSettings: settings }); done.push(`${fname} on ${CAM}`); }
    }
  }
  const full = { positionX: 0, positionY: 0, alignment: 5, boundsType: 'OBS_BOUNDS_SCALE_INNER', boundsAlignment: 0, boundsWidth: 1920, boundsHeight: 1080 };
  for (const { sceneName } of (await req('GetSceneList')).scenes) {
    if (sceneName === 'VT' || sceneName.startsWith('AUDIO //')) continue;
    const items = (await req('GetSceneItemList', { sceneName })).sceneItems;
    if (!items.some(i => keyed.includes(i.sourceName)) || items.some(i => i.sourceName === bg)) continue;
    const id = (await req('CreateSceneItem', { sceneName, sourceName: bg })).sceneItemId;
    await req('SetSceneItemTransform', { sceneName, sceneItemId: id, sceneItemTransform: full });
    await req('SetSceneItemIndex', { sceneName, sceneItemId: id, sceneItemIndex: 0 });
    done.push(`${bg} behind ${sceneName}`);
  }
  say(done.length ? `OK    "${name}": added ${done.join(', ')}` : `OK    "${name}": background removal already there, nothing changed`);
}

// PRE-SHOW: the Virtual Space page (live 3D studio or the opening video) in its own scene, from shows/<show>.json.
// The studio's PRE-SHOW buttons set the page's address, reload it and put the scene on program.
async function addPreshow(show, existing, cam) {
  const name = show.obs.sceneCollection, sc = show.scenes.find(s => s.name === 'PRE-SHOW');
  if (!sc) { say(`SKIP  "${name}": no PRE-SHOW scene in shows/${show.id}.json`); return; }
  if (!existing.includes(name)) { say(`SKIP  "${name}" does not exist (run obs-setup without --preshow first)`); return; }
  await switchTo('SetCurrentSceneCollection', name);
  if ((await req('GetSceneList')).scenes.some(s => s.sceneName === sc.name)) { say(`OK    "${name}": PRE-SHOW already there, nothing changed`); return; }
  const inputs = new Set((await req('GetInputList')).inputs.map(i => i.inputName));
  await req('CreateScene', { sceneName: sc.name });
  for (const [src, box] of sc.items) {
    let id;
    if (inputs.has(src)) id = (await req('CreateSceneItem', { sceneName: sc.name, sourceName: src })).sceneItemId;
    else {
      const def = inputFor(src, show.sources[src], cam);
      id = (await req('CreateInput', { sceneName: sc.name, inputName: src, inputKind: def.kind, inputSettings: def.settings })).sceneItemId;
      if (def.muted) await req('SetInputMute', { inputName: src, inputMuted: true });
    }
    await req('SetSceneItemTransform', { sceneName: sc.name, sceneItemId: id, sceneItemTransform: {
      positionX: box.x, positionY: box.y, alignment: 5, boundsType: 'OBS_BOUNDS_SCALE_INNER', boundsAlignment: 0, boundsWidth: box.w, boundsHeight: box.h } });
  }
  await req('CreateSceneItem', { sceneName: sc.name, sourceName: 'AUDIO // ALL', sceneItemEnabled: true }).catch(() => {});
  say(`OK    "${name}": added scene PRE-SHOW (${sc.items.map(i => i[0]).join(', ')})`);
}

// a preset's media file changed (a new background render, a sharper loop): only the file of each EXISTING media source
// is updated, with the preset's loop setting and hardware decoding; scenes, layout and filters stay as they are
async function syncMedia(show, existing) {
  const name = show.obs.sceneCollection;
  if (!existing.includes(name)) { say(`SKIP  "${name}" does not exist`); return; }
  await switchTo('SetCurrentSceneCollection', name);
  const inputs = new Set((await req('GetInputList')).inputs.map(i => i.inputName));
  const done = [];
  for (const [src, o] of Object.entries(show.sources)) {
    if (o.kind !== 'media' || !o.file || !inputs.has(src)) continue;
    const file = path.join(DZ, o.file);
    if (!fs.existsSync(file)) { say(`WARN  "${src}": ${o.file} not found, left as it is`); continue; }
    const cur = (await req('GetInputSettings', { inputName: src })).inputSettings;
    if (cur.local_file === file) continue;
    await req('SetInputSettings', { inputName: src, inputSettings: { is_local_file: true, local_file: file, looping: !!o.loop, hw_decode: true }, overlay: true });
    done.push(`${src} → ${path.basename(file)}`);
  }
  say(done.length ? `OK    "${name}": ${done.join(', ')}` : `OK    "${name}": media files already up to date`);
}

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
    if (PLAYERS || KEYING || PRESHOW || MEDIA) {
      for (const show of shows) {
        if (MEDIA) await syncMedia(show, before.sceneCollections);
        if (PLAYERS) await addPlayers(show, before.sceneCollections);
        if (PRESHOW) await addPreshow(show, before.sceneCollections, cam);
        if (KEYING) await addKeying(show, before.sceneCollections);
      }
      await switchTo('SetCurrentSceneCollection', before.currentSceneCollectionName);
      say(`OK    back to the collection that was open before: "${before.currentSceneCollectionName}"`);
      obs.stop(); process.exit(0);
    }
    for (const show of shows) {
      const name = show.obs.sceneCollection;
      if (before.sceneCollections.includes(name)) {
        // only an EMPTY collection (one blank scene, no sources: left over from an interrupted run) is finished;
        // anything with content is left exactly as it is
        await switchTo('SetCurrentSceneCollection', name);
        const sc = (await req('GetSceneList')).scenes, ins = (await req('GetInputList')).inputs;
        const empty = sc.length === 1 && !ins.some(i => i.inputKind !== 'coreaudio_input_capture' && i.inputKind !== 'coreaudio_output_capture')
          && !(await req('GetSceneItemList', { sceneName: sc[0].sceneName })).sceneItems.length;
        if (!empty) { say(`SKIP  "${name}" already exists with content: left exactly as it is`); continue; }
        say(`      "${name}" exists but is empty (interrupted run): finishing it`);
      } else await switchTo('CreateSceneCollection', name);                       // OBS creates it and switches to it
      const defaults = (await req('GetSceneList')).scenes.map(s => s.sceneName);
      // a hidden helper scene with every sound source (mic, DJ mixer, jingles, beds), nested in each show scene,
      // so they are live in every shot and the studio's jingle cart can play them
      const AUDIO = 'AUDIO // ALL';
      await req('CreateScene', { sceneName: AUDIO });
      const made = new Set(), missing = [];
      // OBS gives every new collection its global "Mic/Aux" input: that becomes "Mic // Andrej", so the voice is never doubled
      const globalMic = (await req('GetInputList', { inputKind: 'coreaudio_input_capture' })).inputs[0]?.inputName;
      if (globalMic && show.sources['Mic // Andrej']) { await req('SetInputName', { inputName: globalMic, newInputName: 'Mic // Andrej' }); made.add('Mic // Andrej'); }
      const global = new Set(globalMic ? ['Mic // Andrej'] : []);
      const add = async (scene, src, enabled = true) => {
        if (global.has(src)) return null;                              // a global input is live in every scene already
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
          const id = await add(sc.name, src, src !== 'VDO // Guest');   // the guest seat starts hidden
          if (id == null) continue;
          await req('SetSceneItemTransform', { sceneName: sc.name, sceneItemId: id, sceneItemTransform: {
            positionX: box.x, positionY: box.y, alignment: 5, boundsType: 'OBS_BOUNDS_SCALE_INNER', boundsAlignment: 0, boundsWidth: box.w, boundsHeight: box.h } });
        }
        await req('CreateSceneItem', { sceneName: sc.name, sourceName: AUDIO, sceneItemEnabled: true });
      }
      if (show.keying) await addKeying(show);
      await req('SetCurrentProgramScene', { sceneName: show.obs.standbyScene });
      for (const s of defaults) if (!show.scenes.some(x => x.name === s) && s !== AUDIO) await req('RemoveScene', { sceneName: s }).catch(() => {});
      say(`OK    "${name}": ${show.scenes.length} scenes (${show.scenes.map(s => s.name).join(', ')}), ${made.size} sources`);
      if (missing.length) say(`      slots waiting for a file (fill in later in OBS or in shows/${show.id}.json): ${missing.join(', ')}`);
      const notes = Object.entries(show.sources).filter(([, s]) => s.note && s.kind !== 'audio').map(([n, s]) => `${n}: ${s.note}`);
      if (notes.length) say('      to do once: ' + notes.join(' · '));
    }
    await switchTo('SetCurrentSceneCollection', before.currentSceneCollectionName);
    say(`OK    back to the collection that was open before: "${before.currentSceneCollectionName}"`);
    obs.stop(); process.exit(0);
  } catch (e) { say('FAIL  ' + e.message); obs.stop(); process.exit(1); }
});
obs.start();
