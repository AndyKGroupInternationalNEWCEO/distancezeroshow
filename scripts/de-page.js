// Writes de.html (served at /de) from index.html with the German <head>: lang, title, description, canonical, og:url and og:locale,
// so search engines see /de as its own page without running the script. The page's script still translates the body (LANG = /de).
// CI runs it before the build; de.html is generated, not committed. Locally /de keeps working through the vercel.json rewrite.
//   node scripts/de-page.js
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const de = key => JSON.parse('"' + html.match(new RegExp('"' + key + '": "((?:[^"\\\\]|\\\\.)*)"'))[1] + '"');
const attr = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const swap = (from, to) => { if (!html.includes(from)) throw new Error('de-page: not found in index.html: ' + from); html = html.replace(from, to); };

swap('<html lang="en-AU">', '<html lang="de-AT">');
html = html.replace(/<title>[^<]*<\/title>/, '<title>' + attr(de('__title')) + '</title>');
html = html.replace(/<meta name="description" content="[^"]*">/, '<meta name="description" content="' + attr(de('__desc')) + '">');
swap('<meta property="og:locale" content="en_AU">', '<meta property="og:locale" content="de_AT">');
swap('<meta property="og:url" content="https://distancezeroshow.com/">', '<meta property="og:url" content="https://distancezeroshow.com/de">');
swap('<link rel="canonical" href="https://distancezeroshow.com/">', '<link rel="canonical" href="https://distancezeroshow.com/de">');

fs.writeFileSync(path.join(ROOT, 'de.html'), html);
console.log('de.html written');
