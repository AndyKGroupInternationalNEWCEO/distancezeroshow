// OPUS V on the LIVE site, in a real browser (headless Chrome with software WebGL on GitHub's free runners:
// .github/workflows/opus-live.yml; nothing runs on the owner's computer, no paid pod). Everything is done through the
// page's own buttons: the OPUS V Room button, the ⋯ row's Camera, Configuration, Instruments and Close. The page's
// state is read through its ?e2e hook (studio.html) to check what the pictures show.
//   node production/tests-pod/opus-live.mjs        (CHROME, CHROME_ARGS, OUT, URL from the environment)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
const URL0 = process.env.URL || 'https://virtualspace.distancezeroshow.com/?e2e';
const OUT = process.env.OUT || path.join(path.dirname(new URL(import.meta.url).pathname), 'opus-live');
fs.mkdirSync(OUT, { recursive: true });
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dz-live-'));
const port = 9000 + Math.floor(Math.random() * 400);
const chrome = spawn(process.env.CHROME || '/usr/bin/google-chrome', [...(process.env.CHROME_ARGS ? process.env.CHROME_ARGS.split(' ') : []), '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`,
  '--no-first-run', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--window-size=1600,900', 'about:blank'], { stdio: 'ignore' });
let page; for (let i = 0; i < 100 && !page; i++) { await new Promise(r => setTimeout(r, 300)); try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); } catch {} }
const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise(r => { ws.onopen = r; });
let seq = 0; const pending = new Map(), problems = [];
const send = (method, params = {}) => new Promise(r => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
ws.onmessage = e => { const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') problems.push(m.params.exceptionDetails.exception?.description?.split('\n')[0] || m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') problems.push('error: ' + m.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 300));
};
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false, screenWidth: 1600, screenHeight: 900 });
const run = async src => { const r = await send('Runtime.evaluate', { expression: src, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text); return r.result.result.value; };
const shot = async n => { fs.writeFileSync(path.join(OUT, n + '.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64')); console.log('  shot', n); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const W = (cond, ms = 60000) => run(`(async () => { const t0 = Date.now(); while (Date.now() - t0 < ${ms}) { try { if (${cond}) return true; } catch {} await new Promise(r => setTimeout(r, 250)); } return false; })()`);
const results = []; const check = (name, ok, s) => { results.push({ name, ok, s }); console.log((ok ? '✔ ' : '✘ ') + name + (s === undefined ? '' : '  ' + JSON.stringify(s))); };
// a frame takes a while in software WebGL: wait for some frames to be drawn before a picture
const frames = n => run(`new Promise(r => { let k = 0; const f = () => (++k >= ${n} ? r(k) : requestAnimationFrame(f)); requestAnimationFrame(f); })`);
// a button of the ⋯ row (or its menu) by its text, clicked as a visitor would
const tile = (text, within = '.sp-row[data-for=opus]') => run(`(() => { const b = [...document.querySelectorAll('${within} button')].find(b => b.textContent.trim().replace(/^✓ /, '').startsWith(${JSON.stringify(text)})); if (!b) return false; b.click(); return true; })()`);
const menu = async (group, item) => { const a = await tile(group); await sleep(300); const b = await run(`(() => { const b = [...document.querySelectorAll('.pop:not([hidden]) button')].find(b => b.textContent.trim().replace(/^✓ /, '').startsWith(${JSON.stringify(item)})); if (!b) return false; b.click(); return true; })()`); return a && b; };
const O = 'window.__studio.ext.orchestra';
const state = () => run(`(() => { const o = ${O}, d = window.__studio.director; return { open: +o.open.toFixed(2), config: o.config, slots: o.slots().length, sets: o.group.getObjectByName('opus-v-quartet').visible + '/' + o.group.getObjectByName('opus-v-chamber').visible, view: d.current, flying: d.flying }; })()`);

const t0 = Date.now();
await send('Page.navigate', { url: URL0 });
const started = await W(`!!window.__studio?.ext?.orchestra && !!document.querySelector('.spaces .sp.opus')`, 1500000);
check('the LIVE page starts (software WebGL) in ' + Math.round((Date.now() - t0) / 1000) + ' s', started);
if (!started) { await shot('0-failed'); fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ results, problems }, null, 1)); process.exit(1); }
await sleep(5000); await frames(5);
// whatever greets a first visit (the guide, an opening): out of the way
await run(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
await run(`(() => { window.__studio.director.setAuto(false); })()`);
await shot('0-start');

/* the wall from the studio, closed */
const look = (name, pos, target, fov) => run(`(async () => { const { VIEWS } = await import('/virtual-studio/views.js'); VIEWS.${name} = { label: '${name}', long: '${name}', pos: ${JSON.stringify(pos)}, target: ${JSON.stringify(target)}, fov: ${fov}, drift: 0, tally: 0, free: true }; window.__studio.director.go('${name}', { instant: true }); })()`);
await look('chkWall', [-3.5, 2.6, 4.5], [-12.4, 2.0, -1.1], 55); await frames(6); await shot('1-wall-closed');
check('closed at the start', (await state()).open === 0, await state());

/* OPUS V Room: the main button, the cinematic and the opening wall */
await run(`document.querySelector('.spaces .sp.opus').click()`);
check('OPUS V Room opens the wall', await W(`${O}.open > 0.3`, 600000), await state());
await frames(4); await shot('2-opening');
check('the wall opens fully', await W(`${O}.open >= 1`, 900000), await state());
await W(`!window.__studio.director.flying`, 300000); await frames(6); await shot('3-open-cinematic-end');

const SCOPE = process.env.SCOPE || 'all';
if (SCOPE === 'ov3') {   // one picture: the orchestra from OV3, wide
  check('Configuration → Chamber orchestra (immediate)', await menu('Configuration', 'Chamber orchestra · immediate'));
  check('orchestra shown', await W(`${O}.progress === 1 && ${O}.group.getObjectByName('opus-v-chamber').visible`, 60000), await state());
  await menu('Camera', 'OV3'); await W(`!window.__studio.director.flying`, 300000); await frames(8); await shot('ov3-orchestra-wide');
  await menu('Camera', 'OV1'); await W(`!window.__studio.director.flying`, 300000); await frames(6); await shot('ov1-orchestra');
  check('no errors on the page', problems.length === 0, problems);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ url: URL0, results, problems }, null, 1));
  console.log(`${results.filter(r => r.ok).length} / ${results.length} passed`); chrome.kill(); process.exit(results.every(r => r.ok) ? 0 : 1);
}
if (SCOPE === 'transform') {
  // the transforming room: the quartet, the cinematic change with its shot, the orchestra, the immediate change back
  const cam = async (item, tag, n = 6) => { await menu('Camera', item); await W(`!window.__studio.director.flying`, 300000); await frames(n); await shot(tag); };
  const id = `window.__studio.director.current`;
  check('quartet at the start', (await state()).config === 'quartet', await state());
  await cam('OV3', 't1-quartet-OV3'); await cam('OV1', 't1-quartet-OV1'); await cam('OV2', 't1-quartet-OV2'); await cam('OV4', 't1-quartet-OV4', 12);
  check('Configuration → Chamber orchestra (cinematic)', await menu('Configuration', 'Chamber orchestra · 28'));
  check('the transformation shot is on', await W(`${id} === 'oXF'`, 120000), await state());
  for (const [p, tag] of [[0.12, 'a-canopy'], [0.3, 'b-walls'], [0.55, 'c-risers'], [0.85, 'd-trusses']]) { await W(`${O}.progress >= ${p}`, 1800000); await frames(2); await shot('t2-change-' + tag); }
  check('the change completes in the orchestra', await W(`${O}.progress === 1 && !${O}.changing`, 1800000), await run(`({ p: ${O}.progress, config: ${O}.config, chamber: ${O}.group.getObjectByName('opus-v-chamber').visible })`));
  check('then onto OV3', await W(`${id} === 'oOV3'`, 300000), await state());
  await W(`!window.__studio.director.flying`, 300000); await frames(6); await shot('t3-orchestra-OV3');
  await cam('OV1', 't3-orchestra-OV1'); await cam('OV2', 't3-orchestra-OV2'); await cam('OV4', 't3-orchestra-OV4', 12); await cam('CCTV', 't3-orchestra-CCTV');
  check('Configuration → String quartet (immediate)', await menu('Configuration', 'String quartet · immediate'));
  check('quartet at once', await W(`${O}.progress === 0 && ${O}.group.getObjectByName('opus-v-quartet').visible`, 60000), await state());
  await cam('OV3', 't4-quartet-immediate-OV3');
  check('missing instruments listed', true, await run(`({ quartet: ${O}.missing('quartet'), chamber: ${O}.missing('chamber') })`));
  check('Close the room', await tile('Close the room'));
  check('the wall closes fully', await W(`${O}.open <= 0`, 3600000), await state());
  await look('chkWall', [-3.5, 2.6, 4.5], [-12.4, 2.0, -1.1], 55); await frames(6); await shot('t5-wall-closed-again');
  check('no errors on the page', problems.length === 0, problems);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ url: URL0, at: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000), results, problems }, null, 1));
  console.log(`${results.filter(r => r.ok).length} / ${results.length} passed`); chrome.kill(); process.exit(results.every(r => r.ok) ? 0 : 1);
}
if (SCOPE === 'instruments') {
  check('Configuration → Chamber orchestra', await menu('Configuration', 'Chamber orchestra'));
  check('Chamber orchestra shown', await W(`${O}.config === 'chamber' && ${O}.group.getObjectByName('opus-v-chamber').visible`, 300000), await state());
  for (const cam of ['OV1', 'OV3', 'OV4']) { await menu('Camera', cam); await W(`window.__studio.director.current === 'o${cam}' && !window.__studio.director.flying`, 300000); await frames(cam === 'OV4' ? 12 : 6); await shot('7-chamber-' + cam); }
  // close-ups of the built instruments, from the room's own frame
  const near = async (tag, from, at, fov) => { await run(`(async () => { const { VIEWS } = await import('/virtual-studio/views.js'); const o = ${O}, f = o.toWorld(new (await import('three')).Vector3(...${JSON.stringify(from)})), t = o.toWorld(new (await import('three')).Vector3(...${JSON.stringify(at)})); VIEWS.chkNear = { label: 'n', long: 'n', pos: f.toArray(), target: t.toArray(), fov: ${fov}, drift: 0, tally: 0, free: true }; window.__studio.director.go('chkNear', { instant: true }); })()`); await frames(8); await shot('8-' + tag); };
  await near('timpani', [1.4, 2.2, 4.9], [1.7, 0.9, 7.2], 45);
  await near('percussion', [-1.3, 2.3, 4.9], [-1.6, 1.0, 7.4], 50);
  await near('bassoon', [-0.6, 1.6, 4.4], [-1.9, 0.9, 5.9], 40);
  await near('back-riser-wide', [0, 2.6, 3.4], [0, 1.0, 7.6], 70);
  check('Close the room', await tile('Close the room'));
  check('the wall closes fully', await W(`${O}.open <= 0`, 3600000), await state());
  await look('chkWall', [-3.5, 2.6, 4.5], [-12.4, 2.0, -1.1], 55); await frames(6); await shot('9-wall-closed-again');
  check('no errors on the page', problems.length === 0, problems);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ url: URL0, at: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000), results, problems }, null, 1));
  console.log(`${results.filter(r => r.ok).length} / ${results.length} passed`); chrome.kill(); process.exit(results.every(r => r.ok) ? 0 : 1);
}
/* both configurations, every camera, through the ⋯ row */
for (const [cfg, label, n] of [['quartet', 'String quartet', 4], ['chamber', 'Chamber orchestra', 28], ['quartet', 'String quartet', 4]]) {
  check(`Configuration → ${label}`, await menu('Configuration', label));
  const ok = await W(`${O}.config === '${cfg}' && window.__studio.ext.orchestra.group.getObjectByName('opus-v-${cfg}').visible`, 300000);
  const s = await state(); check(`${label}: ${n} places shown`, ok && s.slots === n && s.sets === (cfg === 'quartet' ? 'true/false' : 'false/true'), s);
  if (results.filter(r => r.name.startsWith('Configuration → ' + label)).length > 1) continue;   // (the second quartet: the switch back only)
  for (const [cam, item] of [['OV1', 'OV1'], ['OV2', 'OV2'], ['OV3', 'OV3'], ['OV4', 'OV4'], ['CCTV', 'CCTV']]) {
    const clicked = await menu('Camera', item);
    const id = cam === 'CCTV' ? 'secOpus' : 'o' + cam;
    const there = await W(`window.__studio.director.current === '${id}' && !window.__studio.director.flying`, 300000);
    const inRoom = await run(`${O}.has(window.__studio.camera.position)`);
    await frames(cam === 'OV4' ? 12 : 6); await shot(`4-${cfg}-${cam}`);
    const where = await run(`(() => { const p = window.__studio.ext.orchestra.group.worldToLocal(window.__studio.camera.position.clone()); return p.toArray().map(v => +v.toFixed(2)); })()`);
    check(`${label} · ${cam}: on, camera in the room`, clicked && there && inRoom, { ...(await state()), camRoomXYZ: where });
  }
}

/* the information cards (English), then the room closed again */
check('Instruments cards open', await tile('Instruments') && await W(`!document.querySelector('.sp-instr').hidden`, 20000));
const cards = await run(`[...document.querySelectorAll('.sp-instr summary')].map(s => s.firstChild.textContent.trim())`);
check('13 instrument cards', cards.length === 13, cards);
await frames(2); await shot('5-instrument-cards');
await run(`document.querySelector('.sp-instr .x').click()`);
check('Close the room', await tile('Close the room'));
check('the wall closes fully', await W(`${O}.open <= 0`, 900000), await state());
await look('chkWall', [-3.5, 2.6, 4.5], [-12.4, 2.0, -1.1], 55); await frames(6); await shot('6-wall-closed-again');

check('no errors on the page', problems.length === 0, problems);
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ url: URL0, at: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000), results, problems }, null, 1));
console.log(`${results.filter(r => r.ok).length} / ${results.length} passed`);
chrome.kill(); process.exit(results.every(r => r.ok) ? 0 : 1);
