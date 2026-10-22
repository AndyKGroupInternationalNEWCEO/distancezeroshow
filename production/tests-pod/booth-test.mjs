// The DJ booth while music plays: the opening on deck 2 (title, time, turning platter, fader up, meters), screenshots
import fs from 'node:fs';
const src = fs.readFileSync(new URL('./shows-test.mjs', import.meta.url), 'utf8');
const start = src.indexOf('\nconst W = '), end = src.indexOf("check('no errors'");
const body = `
const S = '__studio.ext';
await run(\`\${S}.melbourne.djOpening('start', undefined, 'short')\`); await sleep(4000);
await run(\`__studio.director.go('mLifttop', { instant: true })\`); await sleep(3000); await shot('booth-studio');
const r = await run(\`(() => { const d = \${S}.melbourne.booth.gear.decks[1].data; return { state: d.state, title: d.title, dur: d.duration, opening: \${S}.melbourne.opening.state }; })()\`);
check('the opening plays on deck 2', r.state === 'play' && /Distance/.test(r.title), r);
await run(\`\${S}.melbourne.djOpening('stop')\`);
await click('.spaces [data-space="dj"]'); await sleep(2000);
if (!(await run(\`document.getElementById('dock').classList.contains('more-open')\`))) await click('.spaces .more');
const items = await run(\`[...document.querySelectorAll('.sp-row .b')].filter(b => b.offsetParent).map(b => b.textContent.trim())\`);
check('DJ ⋯ has Library, FX drops, Next track', ['Library', 'FX drops', 'Next track'].every(w => items.some(i => i.startsWith(w))), items);
const lib = await run(\`(() => { const b = [...document.querySelectorAll('.sp-row .b')].find(x => x.offsetParent && x.textContent.startsWith('Library')); b.click(); return [...document.querySelectorAll('.pop:not([hidden]) .b')].map(x => x.textContent); })()\`);
console.log('  library:', JSON.stringify(lib)); await shot('library-menu');
check('the library lists the genres', lib.includes('Trance') && lib.includes('House'), lib);
`;
fs.writeFileSync(new URL('./booth-test.gen.mjs', import.meta.url), src.slice(0, start) + body + src.slice(end).replace("'shows-test'", "'booth-test'"));
await import('./booth-test.gen.mjs');
