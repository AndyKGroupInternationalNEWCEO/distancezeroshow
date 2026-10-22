// The DJ booth while music plays: the opening on deck 2 (title, time, turning platter, fader up, meters), screenshots
import fs from 'node:fs';
const src = fs.readFileSync(new URL('./shows-test.mjs', import.meta.url), 'utf8');
const start = src.indexOf('\nconst W = '), end = src.indexOf("check('no errors'");
const body = `
const S = '__studio.ext';
await run(\`\${S}.melbourne.djOpening('start', undefined, 'short')\`); await sleep(1500);
await run(\`\${S}.melbourne.djOpening('seek', 56)\`);
await run(\`(async () => { for (let i = 0; i < 900 && (\${S}.melbourne.travelling || \${S}.melbourne.lift.state !== 'DOWN'); i++) await new Promise(r => setTimeout(r, 100)); })()\`);
await run(\`\${S}.melbourne.pickCamera('DJ4')\`); await sleep(4000); await shot('booth-dj4');
await run(\`\${S}.melbourne.pickCamera('HS')\`); await sleep(3000); await shot('booth-hs');
const r = await run(\`(() => { const d = \${S}.melbourne.booth.gear.decks[1].data; return { state: d.state, title: d.title, dur: d.duration }; })()\`);
check('the opening plays on deck 2', r.state === 'play' && /Distance/.test(r.title), r);
`;
fs.writeFileSync(new URL('./booth-test.gen.mjs', import.meta.url), src.slice(0, start) + body + src.slice(end).replace("'shows-test'", "'booth-test'"));
await import('./booth-test.gen.mjs');
