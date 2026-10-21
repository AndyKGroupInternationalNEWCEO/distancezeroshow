// Exports the two-level studio (melbourne-dev.html: the studio, the Vienna Piano Stage, the DJ room with the booth
// down, PERFORMANCE light) for Blender + Cycles on the GPU pod: production/gpu/cache/scene.glb and probes.json (where
// the reflection probes are rendered: probes.py). Runs the live page in headless Chrome on this Mac (light work: one
// page load and one glTF export); the rendering is the pod's.
//   node virtual-studio/vienna/dev-page.mjs && node production/gpu/export-probes.mjs [up]   (up: the booth up in the studio)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from '../../virtual-studio/vienna/serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// the booth's place: 'down' (in the club, default) or 'up' (in the studio): cache/ or cache-up/
const STATE = process.argv[2] === 'up' ? 'up' : 'down';
const OUT = path.join(ROOT, 'production', 'gpu', STATE === 'up' ? 'cache-up' : 'cache');
fs.mkdirSync(OUT, { recursive: true });
const server = createServer(ROOT);
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;
const port = 9600 + Math.floor(Math.random() * 300);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`,
  `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'dz-probe-'))}`, '--use-angle=metal', '--no-first-run', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
let page;
for (let i = 0; i < 50 && !page; i++) { await new Promise(r => setTimeout(r, 200)); try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); } catch {} }
const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise(r => { ws.onopen = r; });
let seq = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise(r => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const run = async src => { const r = await send('Runtime.evaluate', { expression: src, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text); return r.result.result.value; };
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate', { url: BASE + 'melbourne-dev.html' });
await run(`(async () => { for (let i = 0; i < 300; i++) { if (window.__studio) return; await new Promise(r => setTimeout(r, 100)); } throw new Error('no studio'); })()`);

const out = await run(`(async () => {
  const a = window.__studio, m = a.ext.melbourne, THREE = await import('three');
  const L = await import('./virtual-studio/melbourne/layout.js');
  const { GLTFExporter } = await import('./production/blender/vendor/GLTFExporter.js');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // the booth down, the club in its performance light
  const up = ${JSON.stringify(STATE === 'up')};
  if (!up) { m.transition('down'); for (let i = 0; i < 600 && (m.travelling || m.lift.state !== 'DOWN'); i++) await sleep(100); m.setMode('PERFORMANCE'); m.setEnv('djroom', { transition: false }); }
  m.setWall('main'); await sleep(4000);
  // what Cycles cannot take from the real-time picture: additive glows standing in for light in the air (beams, haze,
  // smoke, light pools, lasers), the floor's real-time mirror, shader-only parts. Hidden for the export only
  const hidden = [], bad = [];
  a.scene.traverse(o => {
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    if (o.isReflector || (mat && (mat.blending === THREE.AdditiveBlending || mat.isShaderMaterial || mat.isRawShaderMaterial))) { if (o.visible) { o.visible = false; hidden.push(o); } }
    if (o.isMesh && mat?.map?.isCanvasTexture) mat.map.needsUpdate = true;
    o.updateMatrix(); if (o.visible && !o.matrix.elements.every(Number.isFinite)) { o.visible = false; hidden.push(o); bad.push(o.name || o.type); }
  });
  // texture slots glTF cannot carry (render targets, data textures): emptied for the export, put back after
  const ok = img => img && (img instanceof HTMLImageElement || img instanceof HTMLCanvasElement || img instanceof ImageBitmap || (typeof OffscreenCanvas !== 'undefined' && img instanceof OffscreenCanvas));
  const slots = ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'bumpMap', 'alphaMap', 'lightMap', 'clearcoatMap', 'clearcoatRoughnessMap', 'clearcoatNormalMap', 'specularColorMap', 'specularIntensityMap', 'sheenColorMap', 'transmissionMap', 'iridescenceMap', 'thicknessMap', 'anisotropyMap'];
  const emptied = [];
  a.scene.traverse(o => { for (const mat of [].concat(o.material || [])) for (const k of slots) { const t = mat[k]; if (t && !ok(t.image)) { emptied.push([mat, k, t]); mat[k] = null; } } });
  // the probes: where the live scene will use a rendered reflection (studio metres)
  const b = new THREE.Vector3(); m.booth.group.getWorldPosition(b);
  const [cx, cz] = L.at(L.ROOM.along, L.ROOM.across);
  const over = L.xyz(L.CLUB_BOOTH.along, L.CLUB_BOOTH.across, b.y + L.CLUB_BOOTH.riser + L.CLUB_BOOTH.top + 0.35);   // just over the console's work top
  const probes = up ? { 'booth-up': over } : {
    booth: over,
    club: [cx, L.ROOM.floor + 2.4, cz],                                // the middle of the club (the disco ball hangs here)
  };
  const glb = await new GLTFExporter().parseAsync(a.scene, { binary: true, onlyVisible: true, maxTextureSize: 1024 });
  hidden.forEach(o => { o.visible = true; }); emptied.forEach(([mat, k, t]) => { mat[k] = t; });
  const bytes = new Uint8Array(glb); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { glb: btoa(s), probes, room: L.ROOM, bad };
})()`);
fs.writeFileSync(path.join(OUT, 'scene.glb'), Buffer.from(out.glb, 'base64'));
fs.writeFileSync(path.join(OUT, 'probes.json'), JSON.stringify({ probes: out.probes, room: out.room }, null, 1));
console.log('wrote ' + path.relative(ROOT, OUT) + '/scene.glb (' + (fs.statSync(path.join(OUT, 'scene.glb')).size / 1e6).toFixed(1) + ' MB), probes.json', out.probes, 'left out (not finite):', out.bad);
chrome.kill(); server.close(); process.exit(0);
