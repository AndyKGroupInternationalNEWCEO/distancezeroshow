// Offline render of the empty-studio opening: frame-exact, 1920x1080, 30 fps, through headless Chrome and ffmpeg.
//   node production/empty-opening/render.mjs                          the whole opening -> out/empty-opening-1080p30.mp4 (silent)
//   node production/empty-opening/render.mjs --stills 22.8,24.5       single frames -> out/still-<t>.png
//   node production/empty-opening/render.mjs --from 15 --to 30        a part only
//   node production/empty-opening/render.mjs --query view=assistant   extra page parameters (review views)
//   node production/empty-opening/render.mjs --query cut=arrival      the arrival cut -> out/arrival-1080p30.mp4 (+ out/arrival-steps.json)
// Needs Google Chrome and ffmpeg. The audio is laid on afterwards by mix.sh (the opening itself renders silent).
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..', '..'), OUT = join(HERE, 'out');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const query = arg('query', ''), arrival = /(^|&)cut=arrival/.test(query);
// --blur K: K exposures per frame over half the frame's time (a 180° shutter), averaged: a real camera's motion blur
const FPS = 30, from = +arg('from', 0), to = +arg('to', arrival ? 130 : 90), stills = arg('stills', ''), K = +arg('blur', 1);
mkdirSync(OUT, { recursive: true });

// static server for the repository (the page imports ../../assets and ../../virtual-studio)
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.bin': 'application/octet-stream', '.fbx': 'application/octet-stream' };
const server = createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try { const b = await readFile(join(ROOT, p)); res.writeHead(200, { 'Content-Type': types[extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
}).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const port = server.address().port;

const cdpPort = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'dz-render-'))}`, '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--no-first-run',
  '--window-size=1920,1080', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws;
for (let i = 0; i < 60 && !ws; i++) {
  try { const page = (await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json()).find(t => t.type === 'page'); ws = new WebSocket(page.webSocketDebuggerUrl); }
  catch { await sleep(250); }
}
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0; const pending = new Map();
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') console.error('page error:', m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
});
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description); return r.result.result.value; };

await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false, screenWidth: 1920, screenHeight: 1080 });
async function load() {
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/production/empty-opening/index.html?render${query ? '&' + query : ''}` });
  await sleep(500);
  for (let i = 0; i < 240 && !(await evaluate('!!window.openingReady').catch(() => false)); i++) await sleep(500);
}
await load();
// one frame as a PNG, straight from the canvas (frame-exact: the page draws exactly time t), with its mean brightness
const shoot = async t => {
  const r = await evaluate(`(async () => { await opening.seek(${t}); const cv = document.querySelector('#c');
    const m = document.createElement('canvas'); m.width = 96; m.height = 54; const x = m.getContext('2d'); x.drawImage(cv, 0, 0, 96, 54);
    const d = x.getImageData(0, 0, 96, 54).data; let l = 0; for (let i = 0; i < d.length; i += 4) l += d[i] + d[i + 1] + d[i + 2];
    const b = await new Promise(r => cv.toBlob(r, 'image/png'));
    const a = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < a.length; i += 32768) s += String.fromCharCode(...a.subarray(i, i + 32768));
    return [btoa(s), l / (d.length / 4 * 3)]; })()`);
  return { png: Buffer.from(r[0], 'base64'), lum: r[1] };
};
// headless Chrome on the Mac now and then stops drawing and hands back black frames from then on. A frame that falls to
// black from a lit one (outside the opening's own black start) reloads the page, warms up for 2 s and is taken again
let lastLum = -1;
async function grab(t) {
  let f = await shoot(t);
  // (the arrival goes dark on purpose through the backstage door, into the black the opening starts in: not a fault)
  const darkOnPurpose = arrival && t > 18 && t < 27.5;
  for (let tries = 0; t > 2 && !darkOnPurpose && lastLum > 3 && f.lum < 0.5 && tries < 3; tries++) {
    console.log(`black frame at ${t.toFixed(2)} s: reloading`);
    await load();
    for (let u = Math.max(0, t - 2); u < t; u += 1 / FPS) await evaluate(`opening.seek(${u})`);
    f = await shoot(t);
  }
  lastLum = f.lum;
  return f.png;
}

if (stills) {
  if (arrival) console.log('arrival timing', JSON.stringify(await evaluate('opening.arrival.info')));
  if (arrival) for (const r of [[3.6, 7], [11, 15], [15, 19.5]]) console.log('soles below ground', r, JSON.stringify(await evaluate(`opening.arrival.soles(Array.from({length: 40}, (_, i) => ${r[0]} + i * ${(r[1] - r[0]) / 40}))`)));
  // walk up to each still from 2 s before, so damping and the actors' state are as in the clip
  for (const t of stills.split(',').map(Number)) {
    for (let u = Math.max(0, t - 2); u < t; u += 1 / FPS) await evaluate(`opening.seek(${u})`);
    const file = join(OUT, `still-${t.toFixed(2)}${query ? '-' + query.replace(/[^a-z0-9]+/gi, '_') : ''}.png`);
    writeFileSync(file, await grab(t)); console.log('still', file);
    if (arrival && t < 22) console.log('  heads in frame:', JSON.stringify(await evaluate('opening.arrival.headsInFrame(opening.camera)')));
  }
} else {
  const full = from === 0 && to === (arrival ? 130 : 90), stem = arrival ? 'arrival' : 'empty-opening';
  const name = join(OUT, (full ? `${stem}-1080p30` : `${stem}-${from}-${to}`) + (K > 1 ? `-blur${K}` : '') + '.mp4');
  // the footsteps' timing, for the mix
  if (arrival) writeFileSync(join(OUT, 'arrival-steps.json'), JSON.stringify(await evaluate('opening.arrival.footsteps()')));
  const blurFilter = K > 1 ? ['-vf', `tmix=frames=${K},select='eq(mod(n,${K}),${K - 1})',setpts=N/(${FPS}*TB)`, '-r', String(FPS)] : [];
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS * K), '-c:v', 'png', '-i', '-', ...blurFilter,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', name], { stdio: ['pipe', 'inherit', 'inherit'] });
  const n = Math.round((to - from) * FPS), t0 = Date.now();
  for (let f = 0; f < n; f++) for (let k = 0; k < K; k++) {
    const png = await grab(from + f / FPS + (K > 1 ? (k / K) * 0.5 / FPS : 0));
    if (!ff.stdin.write(png)) await new Promise(r => ff.stdin.once('drain', r));
    if (f % 150 === 0) console.log(`frame ${f}/${n}  ${((Date.now() - t0) / 1000 / (f + 1)).toFixed(2)} s/frame`);
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r));
  console.log('video', name);
}
ws.close(); chrome.kill(); server.close();
