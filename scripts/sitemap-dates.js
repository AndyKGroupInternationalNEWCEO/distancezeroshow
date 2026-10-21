// Sets every <lastmod> in sitemap.xml to the date of the last commit that changed that page (CI, before the build).
// Usage: node scripts/sitemap-dates.js [live-sitemap.xml]  — prints the URLs whose date differs from the live sitemap.
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

/* which files make up each page; the homepage (EN and DE) also shows the programme */
const HOME = ['index.html', 'data/programme-2027.json', 'data/programme.js'];
const files = path => path === '/' || path === '/de' ? HOME : [path.slice(1) + '.html'];
const lastCommit = list => execFileSync('git', ['log', '-1', '--format=%cs', '--', ...list], { encoding: 'utf8' }).trim();

const map = xml => Object.fromEntries([...xml.matchAll(/<loc>([^<]+)<\/loc>[\s\S]*?<lastmod>([^<]+)<\/lastmod>/g)].map(m => [m[1], m[2]]));
let xml = fs.readFileSync('sitemap.xml', 'utf8');
xml = xml.replace(/(<loc>([^<]+)<\/loc>[\s\S]*?<lastmod>)([^<]+)(<\/lastmod>)/g, (all, a, loc, old, b) => a + (lastCommit(files(new URL(loc).pathname)) || old) + b);
fs.writeFileSync('sitemap.xml', xml);

const live = process.argv[2] && fs.existsSync(process.argv[2]) ? map(fs.readFileSync(process.argv[2], 'utf8')) : {};
Object.entries(map(xml)).filter(([loc, d]) => live[loc] !== d).forEach(([loc]) => console.log(loc));
