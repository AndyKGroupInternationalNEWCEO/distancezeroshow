// Smoke test of the main page and the score on the grand's desk (runs on the RunPod pod: workhorse.sh run)
import fs from 'node:fs';
const src = fs.readFileSync(new URL('./shows-test.mjs', import.meta.url), 'utf8');
const start = src.indexOf('\nconst W = '), end = src.indexOf("check('no errors'");
const body = `
const S = '__studio.ext';
await run(\`\${S}.showCommand('live')\`); await sleep(1500);
await run(\`(() => { \${S}.pickSong('zwischenlandung/official-piano-version'); \${S}.performSong(); })()\`);
await sleep(6000);
const r = await run(\`(() => { let shown = 0; __studio.studio.piano.traverse(o => { if (o.isMesh && o.geometry?.parameters?.width === 0.21 && o.visible && o.material.map) shown++; }); return { shown, seg: \${S}.show.segment, song: \${S}.show.song?.id }; })()\`);
check('the score is on the desk while the song plays', r.shown === 2 && r.seg === 'song', r);
await run(\`\${S}.pickCamera('P2')\`); await sleep(3000); await shot('sheet-p2');
await run(\`\${S}.pickCamera('P3')\`); await sleep(3000); await shot('sheet-p3');
`;
fs.writeFileSync(new URL('./sheet-test.gen.mjs', import.meta.url), src.slice(0, start) + body + src.slice(end).replace("'shows-test'", "'sheet-test'"));
await import('./sheet-test.gen.mjs');
