// Builds the public Virtual Space (virtualspace.distancezeroshow.com) from the approved studio page.
// ALLOWLIST ONLY: files are copied by name, so nothing private (Director Studio, production tools, avatars,
// renders, credentials) can end up in the deployment by accident. Output: virtualspace/dist/
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { stagePage } from '../virtual-studio/vienna/dev-page.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'virtualspace', 'dist');
const SITE = 'https://distancezeroshow.com/';
const HOST = 'https://virtualspace.distancezeroshow.com/';
const T = 'assets/vendor/three-0.170.0/';
const FILES = [
  'virtual-studio/main.js', 'virtual-studio/set.js', 'virtual-studio/screens.js', 'virtual-studio/views.js', 'virtual-studio/details.js',
  'virtual-studio/sound.js', 'virtual-studio/panels.js', 'virtual-studio/chords.js', 'virtual-studio/schedule.js',
  'virtual-studio/grandpiano.js', 'virtual-studio/onair.js', 'virtual-studio/spaces.js', 'virtual-studio/building.js', 'assets/video/dz-logo-reveal.mp4', 'assets/video/dz-master-studio.mp4', 'assets/video/dz-preshow-2026-10-14b.mp4',
  T + 'three.module.min.js', T + 'LICENSE.txt',
  ...['controls/OrbitControls.js', 'geometries/RoundedBoxGeometry.js', 'lights/RectAreaLightUniformsLib.js', 'lights/RectAreaLightTexturesLib.js',
    'objects/Reflector.js', 'loaders/RGBELoader.js', 'postprocessing/EffectComposer.js', 'postprocessing/RenderPass.js', 'postprocessing/ShaderPass.js', 'postprocessing/MaskPass.js',
    'postprocessing/Pass.js', 'postprocessing/UnrealBloomPass.js', 'postprocessing/OutputPass.js', 'shaders/CopyShader.js',
    'postprocessing/GTAOPass.js', 'shaders/GTAOShader.js', 'shaders/PoissonDenoiseShader.js', 'math/SimplexNoise.js',
    'shaders/LuminosityHighPassShader.js', 'shaders/OutputShader.js'].map(f => T + 'addons/' + f),
  'assets/fonts/archivo-latin.woff2', 'assets/fonts/archivo-latin-ext.woff2',
  'assets/andrej.webp', 'assets/georgie.webp', 'assets/studio-still.jpg', 'assets/keyvisual.jpg', 
  // the page icons: the D//0 crystal logo, under a dated folder (assets are cached for a year: a new name is what reloads them)
  ...['favicon-32.png', 'favicon-48.png', 'apple-touch-icon-180.png', 'icon-192.png', 'icon-512.png', 'site.webmanifest'].map(f => 'assets/icons/2026-10-15/' + f),
  'assets/logo-do.webp', 'assets/logo-do-1k.webp', 'assets/sponsor-djandyk.webp',
  // the show's wall videos and jingles for the on-air simulation (made by virtualspace/show-media.sh): these two folders only
  ...['assets/show', 'assets/jingles'].flatMap(d => fs.readdirSync(path.join(ROOT, d)).filter(f => /\.(mp4|m4a)$/.test(f)).map(f => `${d}/${f}`)),
  // the Vienna Piano Stage (/piano-stage): its code and the Piano Sessions' four official recordings (git-ignored:
  // copied from the masters, see docs/vienna-stage/PIANO-SHOW.md). The songs stream from djandykofficial.com
  ...['index', 'layout', 'lift', 'stage', 'opening', 'show', 'piano-show-config', 'piano-show-map', 'concert-look', 'keys', 'repertoire', 'piano-parts'].map(f => `virtual-studio/vienna/${f}.js`),
  ...['opening', 'theme', 'between-songs', 'closing'].map(f => `assets/audio/piano-sessions/dz-piano-${f === 'opening' || f === 'closing' ? 'sessions-' + f : f}.wav`),
  // the shows' cards (the broadcast's jingle videos, spaces.js) and the building's CC0 surfaces and night sky (building.js)
  ...fs.readdirSync(path.join(ROOT, 'assets/video/shows')).filter(f => f.endsWith('.mp4')).map(f => `assets/video/shows/${f}`),
  ...fs.readdirSync(path.join(ROOT, 'assets/cc0')).map(f => `assets/cc0/${f}`),
  // the grand's piano parts, transcribed from the recordings (production/gpu/transcribe.py, import-parts.mjs)
  ...fs.readdirSync(path.join(ROOT, 'assets/piano-parts')).filter(f => f.endsWith('.json')).map(f => `assets/piano-parts/${f}`),
  // the Underground DJ Room (/dj-room: the studio with the Piano Stage and the DJ Room under it): its code and the
  // reflection probes rendered in Cycles (production/gpu)
  ...['index', 'layout', 'room', 'booth', 'gear', 'arms', 'djlift', 'cover', 'clubfx', 'probes', 'dj-audio-map', 'live-music'].map(f => `virtual-studio/melbourne/${f}.js`),
  ...['dj-booth', 'dj-booth-up', 'dj-club', 'studio', 'studio-piano'].map(f => `assets/probes/${f}.f16`),
  // the DJ Room's opening: the official show song (git-ignored: copied from the master, see virtual-studio/melbourne/djshow.js)
  'assets/audio/dj-room/dz-dj-room-opening.wav', 'assets/audio/dj-room/dz-dj-room-opening-short.wav',
  'virtual-studio/melbourne/djshow.js',
];

// clear the previous build but keep .vercel (the link to the Vercel project)
fs.mkdirSync(OUT, { recursive: true });
for (const e of fs.readdirSync(OUT)) if (e !== '.vercel') fs.rmSync(path.join(OUT, e), { recursive: true, force: true });
for (const f of FILES) {
  const src = path.join(ROOT, f), dst = path.join(OUT, f);
  if (!fs.existsSync(src)) throw new Error('missing ' + f);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

// the page: the approved studio.html, with links back to the main site and its own canonical address
let html = fs.readFileSync(path.join(ROOT, 'studio.html'), 'utf8');
html = html
  .replace('<link rel="canonical" href="https://distancezeroshow.com/studio">', `<link rel="canonical" href="${HOST}">`)
  .replace('<meta property="og:url" content="https://distancezeroshow.com/studio">', `<meta property="og:url" content="${HOST}">`)
  .replace(/href="\/"/g, `href="${SITE}"`)
  .replace('>distancezeroshow.com</a></p>', '>distancezeroshow.com</a></p>');
if (/href="\/"/.test(html)) throw new Error('relative home link left');
// structured data for search engines (not a script that runs, so the Content Security Policy is not involved)
const ld = { '@context': 'https://schema.org', '@type': 'WebApplication', name: 'DISTANCE // ZERO — Virtual Studio', url: HOST, applicationCategory: 'EntertainmentApplication',
  operatingSystem: 'Any (web browser with WebGL 2)', offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' }, inLanguage: 'en',
  description: html.match(/<meta name="description" content="([^"]*)"/)[1].replace(/&#39;/g, "'"),
  image: 'https://distancezeroshow.com/assets/keyvisual.jpg', isPartOf: { '@type': 'WebSite', name: 'DISTANCE // ZERO', url: SITE },
  creator: { '@type': 'Organization', name: "Andy'K Group International LTD" } };
html = html.replace('</head>', `<script type="application/ld+json">${JSON.stringify(ld)}</script>\n</head>`);
// the page at the main address: the whole studio on one page, the Vienna Piano Stage and the Underground DJ Room under
// it included; the studio's own title and indexing kept (stagePage marks its pages noindex). /piano-stage and
// /dj-room, their earlier addresses, redirect here
const page = stagePage(html, 'Virtual Studio — DISTANCE // ZERO', { melbourne: true })
  .replace('<meta name="robots" content="noindex, nofollow">', '<meta name="robots" content="index, follow, max-image-preview:large">');
if (!page.includes('content="index, follow')) throw new Error('the main page lost its indexing');
fs.writeFileSync(path.join(OUT, 'index.html'), page);
// the "How it works" page (linked in the footer), a static page of its own
fs.copyFileSync(path.join(ROOT, 'virtualspace', 'how-it-works.html'), path.join(OUT, 'how-it-works.html'));
fs.copyFileSync(path.join(ROOT, 'virtualspace', 'dj-manual.html'), path.join(OUT, 'dj-manual.html'));
// /favicon.ico, which browsers also ask for on their own (Safari keeps the old one otherwise); not under /assets, so not cached for a year
fs.copyFileSync(path.join(ROOT, 'virtualspace', 'favicon.ico'), path.join(OUT, 'favicon.ico'));   // the DJ booth's own manual

// Content Security Policy: our own files only; the inline scripts of the pages (import map, boot) allowed by hash
const hashes = [...new Set([page].flatMap(page => [...page.matchAll(/<script(?: type="(?:importmap|module)")?>([\s\S]*?)<\/script>/g)]
  .map(m => `'sha256-${crypto.createHash('sha256').update(m[1]).digest('base64')}'`)))];
const csp = [
  "default-src 'self'", `script-src 'self' ${hashes.join(' ')}`, "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
  "font-src 'self'", "connect-src 'self' https://distancezeroshow.com", "media-src 'self' https://distancezeroshow.com https://www.djandykofficial.com", // the soundtrack streams from the main site, DJ Andy'K's releases from his
  "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'",
].join('; ');
// studio.distancezeroshow.com is only a door: this project's free HTTPS certificate answers for it and sends
// every request, path and all, to the Broadcast Studio's host address (Tailscale). The #code part of Georgie's
// link stays in her browser and comes along. Temporary (307), so the target can change without browsers caching it.
const STUDIO_HOST = 'studio.distancezeroshow.com', STUDIO_TARGET = 'https://macbook-air-von-andrej.tailff4ac2.ts.net';
const vercel = {
  cleanUrls: true,
  trailingSlash: false,
  redirects: [
    { source: '/', has: [{ type: 'host', value: STUDIO_HOST }], destination: STUDIO_TARGET + '/', permanent: false },   // the bare address too
    { source: '/:path*', has: [{ type: 'host', value: STUDIO_HOST }], destination: STUDIO_TARGET + '/:path*', permanent: false },
    // the earlier addresses of the Piano Stage and the DJ Room: the main page has both now
    ...['/piano-stage', '/dj-room'].map(source => ({ source, destination: '/', permanent: false })),
  ],
  headers: [
    { source: '/assets/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    { source: '/virtual-studio/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=300, must-revalidate' }] },
    { source: '/(.*)', headers: [
      { key: 'Content-Security-Policy', value: csp },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), display-capture=()' },
      { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
    ] },
  ],
};
fs.writeFileSync(path.join(OUT, 'vercel.json'), JSON.stringify(vercel, null, 2) + '\n');
fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${HOST}sitemap.xml\n`);
// the two public pages, for search engines
const today = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`
  + [['', '1.0'], ['how-it-works', '0.6'], ['dj-manual', '0.5']].map(([p, pr]) => `  <url><loc>${HOST}${p}</loc><lastmod>${today}</lastmod><priority>${pr}</priority></url>\n`).join('') + '</urlset>\n');
// never upload env files or link metadata (the Vercel CLI may create them next to the build)
fs.writeFileSync(path.join(OUT, '.vercelignore'), '.env*\n.gitignore\n.vercel\n');
for (const f of ['.env.local', '.gitignore']) fs.rmSync(path.join(OUT, f), { force: true });

// inventory, so a reviewer can see exactly what is public
const list = [];
const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name === '.vercel' || e.name === '.vercelignore') continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else list.push([path.relative(OUT, p), fs.statSync(p).size]); } };
walk(OUT);
const total = list.reduce((a, [, s]) => a + s, 0);
console.log(list.map(([f, s]) => `${(s / 1024).toFixed(0).padStart(6)} KB  ${f}`).join('\n'));
console.log(`${list.length} files, ${(total / 1e6).toFixed(2)} MB`);
