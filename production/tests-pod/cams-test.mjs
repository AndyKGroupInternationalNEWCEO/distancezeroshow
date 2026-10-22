// Screenshots of the Piano Stage's cameras P1–P6 with the grand up (the longer lens) — on the pod
import fs from 'node:fs';
const src = fs.readFileSync(new URL('./shows-test.mjs', import.meta.url), 'utf8');
const start = src.indexOf('\nconst W = '), end = src.indexOf("check('no errors'");
const body = `
await run("__studio.ext.command('up')"); await sleep(12000);
for (const k of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']) { await run('__studio.ext.pickCamera(' + JSON.stringify(k) + ')'); await sleep(3500); await shot('cam-' + k); }
`;
fs.writeFileSync(new URL('./cams-test.gen.mjs', import.meta.url), src.slice(0, start) + body + src.slice(end).replace("'shows-test'", "'cams-test'"));
await import('./cams-test.gen.mjs');
