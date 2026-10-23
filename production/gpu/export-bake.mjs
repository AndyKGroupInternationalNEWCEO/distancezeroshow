// Exports the places (the building, the reception, the street: buildStreet's group with its furniture and lights)
// for the light bake in Cycles (bake.py): production/gpu/cache-bake/places.glb. Every mesh that can take a light map
// is named bkL<n> (inside the doors) or bkS<n> (outside) and carries in its extras where it is and how many vertices
// it has, so that the page can find it again and swap in the baked one (spaces.js). Runs on the pod
// (workhorse.sh run), never on the Mac.
//   node virtual-studio/vienna/dev-page.mjs && node production/gpu/export-bake.mjs
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from '../../virtual-studio/vienna/serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'production', 'gpu', 'cache-bake');
fs.mkdirSync(OUT, { recursive: true });
const server = createServer(ROOT);
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;
const port = 9600 + Math.floor(Math.random() * 300);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dz-bake-'));
const chrome = spawn(process.env.CHROME || 'google-chrome', ['--headless=new', ...(process.env.CHROME_ARGS || '').split(' ').filter(Boolean), `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`, '--no-first-run', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
let page;
for (let i = 0; i < 50 && !page; i++) { await new Promise(r => setTimeout(r, 200)); try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); } catch {} }
const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise(r => { ws.onopen = r; });
let seq = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise(r => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const run = async src => { const r = await send('Runtime.evaluate', { expression: src, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text); return r.result.result.value; };
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate', { url: BASE + 'melbourne-dev.html' });
await run(`(async () => { for (let i = 0; i < 600; i++) { if (window.__studio?.ext?.spaces) return; await new Promise(r => setTimeout(r, 100)); } throw new Error('no studio'); })()`);

const out = await run(`(async () => {
  const a = window.__studio, THREE = await import('three'), { FZ } = await import('./virtual-studio/building.js');
  const { GLTFExporter } = await import('./production/blender/vendor/GLTFExporter.js');
  const st = await a.ext.spaces.place(); a.director.go('reception', { instant: true });
  await new Promise(r => setTimeout(r, 4000));
  const g = st.group; g.visible = true; g.updateMatrixWorld(true);
  // what Cycles cannot take: additive glows, mirrors, shader-only parts (hidden for the export only)
  const hidden = [];
  g.traverse(o => { const mat = [].concat(o.material || [])[0]; if (o.isReflector || (mat && (mat.blending === THREE.AdditiveBlending || mat.isShaderMaterial || mat.isRawShaderMaterial))) { if (o.visible) { o.visible = false; hidden.push(o); } } if (o.isMesh && mat?.map?.isCanvasTexture) mat.map.needsUpdate = true; });
  const ok = img => img && (img instanceof HTMLImageElement || img instanceof HTMLCanvasElement || img instanceof ImageBitmap);
  const slots = ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'bumpMap', 'alphaMap', 'lightMap', 'clearcoatMap', 'clearcoatRoughnessMap', 'clearcoatNormalMap', 'envMap'];
  const emptied = [];
  g.traverse(o => { for (const mat of [].concat(o.material || [])) for (const k of slots) { const t = mat[k]; if (t && (k === 'envMap' || !ok(t.image))) { emptied.push([mat, k, t]); mat[k] = null; } } });
  // the meshes that take a light map: solid, lit (not MeshBasic), not instanced; named and described
  const names = [], c = new THREE.Vector3(), box = new THREE.Box3(); let n = 0;
  g.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || !o.visible || !o.geometry?.attributes?.position) return;
    const mat = [].concat(o.material)[0];
    if (!mat || mat.isMeshBasicMaterial || mat.transparent || mat.isMeshPhysicalMaterial && mat.transmission > 0) return;
    box.setFromObject(o).getCenter(c);
    o.name = (c.z < FZ - 0.1 ? 'bkL' : 'bkS') + (n++);
    o.userData.bk = { c: [+c.x.toFixed(3), +c.y.toFixed(3), +c.z.toFixed(3)], n: o.geometry.attributes.position.count };
    names.push(o.name);
  });
  const glb = await new GLTFExporter().parseAsync(g, { binary: true, onlyVisible: true, maxTextureSize: 1024 });
  hidden.forEach(o => { o.visible = true; }); emptied.forEach(([mat, k, t]) => { mat[k] = t; });
  const bytes = new Uint8Array(glb); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { glb: btoa(s), names, fz: FZ };
})()`);
fs.writeFileSync(path.join(OUT, 'places.glb'), Buffer.from(out.glb, 'base64'));
fs.writeFileSync(path.join(OUT, 'places.json'), JSON.stringify({ fz: out.fz, names: out.names }));
console.log('wrote cache-bake/places.glb', (fs.statSync(path.join(OUT, 'places.glb')).size / 1e6).toFixed(1), 'MB,', out.names.length, 'meshes to bake');
chrome.kill(); server.close(); fs.rmSync(profile, { recursive: true, force: true }); process.exit(0);
