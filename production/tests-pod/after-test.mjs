// AFTERSHOW: the edge button, the work light, the wall's card, the tour's views (screenshots of each)
import fs from 'node:fs';
const src = fs.readFileSync(new URL('./shows-test.mjs', import.meta.url), 'utf8');
const start = src.indexOf('\nconst W = '), end = src.indexOf("check('no errors'");
const body = `
const S = '__studio.ext';
await click('.edge [data-view-edge="after"]'); await sleep(4000);
const a = await run(\`({ on: \${S}.spaces.afterShow.on, wall: __studio.studio.wall.program, view: __studio.director.current })\`);
check('AFTERSHOW: on, the wall says the show has ended', a.on && a.wall === 'ended', a);
for (const v of ['aWide', 'aCams', 'aTruss', 'aWallEnd', 'aFloor', 'securityLounge', 'backstage']) { await run(\`__studio.director.go('\${v}', { instant: true })\`); await sleep(2500); await shot('after-' + v); }
for (const pl of ['building', 'reception']) {
  await click('.edge [data-view-edge="' + pl + '"]'); await sleep(9000);
  const r = await run(\`({ view: __studio.director.current, z: +__studio.camera.position.z.toFixed(1) })\`);
  check(pl + ': the camera is out there', r.view === pl && r.z > 20, r); await shot('place-' + pl);
}
await click('.edge [data-view-edge="backstage"]'); await sleep(3000);
check('back to backstage from the reception', await run(\`__studio.director.current === 'backstage' && __studio.camera.position.z < 0\`), {});
await click('.edge [data-view-edge="security"]'); const seen = [];
for (let k = 0; k < 5; k++) { await sleep(6200); seen.push(await run(\`__studio.director.current\`)); if (k === 2) await shot('cctv-reception'); if (k === 3) await shot('cctv-entrance'); }
check('CCTV switches by itself: studio, backstage, reception, entrance', ['securityLounge', 'secReception', 'secBuilding'].every(v => seen.includes(v)), seen);
await click('.spaces [data-space="studio"]'); await sleep(1500);
const b = await run(\`({ on: \${S}.spaces.afterShow.on, wall: __studio.studio.wall.program })\`);
check('STUDIO ends AFTERSHOW', !b.on && b.wall !== 'ended', b);
`;
fs.writeFileSync(new URL('./after-test.gen.mjs', import.meta.url), src.slice(0, start) + body + src.slice(end).replace("'shows-test'", "'after-test'"));
await import('./after-test.gen.mjs');
