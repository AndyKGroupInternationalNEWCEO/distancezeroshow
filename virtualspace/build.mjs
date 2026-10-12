// Builds the public Virtual Space (virtualspace.distancezeroshow.com) from the approved studio page.
// ALLOWLIST ONLY: files are copied by name, so nothing private (Director Studio, production tools, avatars,
// renders, credentials) can end up in the deployment by accident. Output: virtualspace/dist/
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'virtualspace', 'dist');
const SITE = 'https://distancezeroshow.com/';
const HOST = 'https://virtualspace.distancezeroshow.com/';
const T = 'assets/vendor/three-0.170.0/';
const FILES = [
  'virtual-studio/main.js', 'virtual-studio/set.js', 'virtual-studio/screens.js', 'virtual-studio/views.js', 'virtual-studio/details.js',
  'virtual-studio/sound.js', 'virtual-studio/panels.js', 'virtual-studio/chords.js', 'virtual-studio/schedule.js',
  'virtual-studio/grandpiano.js', 'virtual-studio/onair.js', 'assets/video/dz-logo-reveal.mp4', 'assets/video/dz-master-studio.mp4',
  T + 'three.module.min.js', T + 'LICENSE.txt',
  ...['controls/OrbitControls.js', 'geometries/RoundedBoxGeometry.js', 'lights/RectAreaLightUniformsLib.js', 'lights/RectAreaLightTexturesLib.js',
    'objects/Reflector.js', 'postprocessing/EffectComposer.js', 'postprocessing/RenderPass.js', 'postprocessing/ShaderPass.js', 'postprocessing/MaskPass.js',
    'postprocessing/Pass.js', 'postprocessing/UnrealBloomPass.js', 'postprocessing/OutputPass.js', 'shaders/CopyShader.js',
    'shaders/LuminosityHighPassShader.js', 'shaders/OutputShader.js'].map(f => T + 'addons/' + f),
  'assets/fonts/archivo-latin.woff2', 'assets/fonts/archivo-latin-ext.woff2',
  'assets/andrej.webp', 'assets/georgie.webp', 'assets/studio-still.jpg', 'assets/keyvisual.jpg', 'assets/favicon.svg', 'assets/apple-touch-icon.png',
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
fs.writeFileSync(path.join(OUT, 'index.html'), html);

// Content Security Policy: our own files only; the two inline scripts (import map, boot) allowed by hash
const hashes = [...html.matchAll(/<script(?: type="(?:importmap|module)")?>([\s\S]*?)<\/script>/g)]
  .map(m => `'sha256-${crypto.createHash('sha256').update(m[1]).digest('base64')}'`);
const csp = [
  "default-src 'self'", `script-src 'self' ${hashes.join(' ')}`, "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
  "font-src 'self'", "connect-src 'self'", "media-src 'self' https://distancezeroshow.com", // the soundtrack streams from the main site
  "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'",
].join('; ');
const vercel = {
  cleanUrls: true,
  trailingSlash: false,
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
fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n`);
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
