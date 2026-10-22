import fs from 'node:fs';
const src = fs.readFileSync(new URL('./shows-test.mjs', import.meta.url), 'utf8');
const start = src.indexOf('\nconst W = '), end = src.indexOf("check('no errors'");
const body = `
await run("__studio.ext.command('up')"); await sleep(9000);
await run("__studio.ext.pickCamera('P6')"); await sleep(4000); await shot('hs-piano');
check('piano 4K HS: slow motion on', await run("__studio.director.current === 'vP6' && document.body.classList.contains('slowmo')"), await run('__studio.director.current'));
await run("__studio.ext.pickCamera('P2')"); await sleep(3500); await shot('keys-p2');
await run("__studio.ext.melbourne.transition('down')"); await run("(async () => { for (let i = 0; i < 600 && (__studio.ext.melbourne.travelling || __studio.ext.melbourne.lift.state !== 'DOWN'); i++) await new Promise(r => setTimeout(r, 100)); })()");
await run("__studio.ext.melbourne.setMode('PERFORMANCE')"); await run("__studio.ext.melbourne.pickCamera('HS')"); await sleep(4000); await shot('hs-dj');
check('DJ 4K HS: in the club', await run("__studio.director.current === 'mHS' && __studio.camera.position.y < 0"), await run('[__studio.director.current, __studio.camera.position.y]'));
await click('.spaces .min'); await sleep(600); await shot('minimised');
check('minimise hides the controls', await run("document.body.classList.contains('sp-min') && !document.querySelector('.spaces [data-space=dj]').offsetParent && !!document.querySelector('.spaces .min').offsetParent"), {});
await click('.spaces .min'); await sleep(400);
check('and brings them back', await run("!!document.querySelector('.spaces [data-space=dj]').offsetParent"), {});
`;
fs.writeFileSync(new URL('./hs-test.gen.mjs', import.meta.url), src.slice(0, start) + body + src.slice(end));
await import('./hs-test.gen.mjs');
