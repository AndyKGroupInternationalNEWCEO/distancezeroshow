// VIENNA PIANO STAGE in OBS: the stage page of the Virtual Space worktree (branch feature/vienna-piano-stage, with
// whatever is in it locally, committed or not) served by this studio on the Director port, so OBS can show it as a
// browser source and the Broadcast Studio can drive it (PLAY / PAUSE / STOP / NEXT, show segments, cameras P1–P5,
// lighting) through the small bridge script added to the page.
//
// Nothing in the worktree is written. The page is put together in memory from its studio.html with the same three
// changes as virtual-studio/vienna/dev-page.mjs makes (title, noindex, the stage module), plus:
//   - the bridge (/static/stage-bridge.js), which only talks to this studio;
//   - a clean-picture stylesheet: the studio page's own controls and the stage's panel are hidden.
// The page is NOT opened with ?obs=1: that mode starts the Virtual Space's on-air simulation, which plays its own theme
// song, music bed and graphics, and would put a second sound under the piano. ?quality=broadcast gives the fixed
// 1920 × 1080 picture without it.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SWAPS = [
  ['<title>Virtual Studio — DISTANCE // ZERO</title>', '<title>Vienna Piano Stage (Broadcast Studio) — DISTANCE // ZERO</title>'],
  ['<meta name="robots" content="index, follow, max-image-preview:large">', '<meta name="robots" content="noindex, nofollow">'],
  ['    const app = await start({\n      canvas, quality: tier(), progress,',
    "    const { vienna } = await import('./virtual-studio/vienna/index.js');\n    const app = await start({\n      canvas, quality: tier(), progress, extend: vienna,"],
];
// the picture OBS takes: the 3D stage only (no page controls, captions, hints or the stage's own panel)
const CLEAN = `<style id="dz-stage-clean">
body.dz-stage .skip, body.dz-stage header.top, body.dz-stage .cctv-hud, body.dz-stage .shot, body.dz-stage .count, body.dz-stage .hint,
body.dz-stage nav.dock, body.dz-stage .panel, body.dz-stage .vz, body.dz-stage .loader.done { display: none !important; }
body.dz-stage { cursor: none; }
</style>`;

const finish = html => html.replace('</head>', `${CLEAN}\n</head>`).replace('</body>', '<script type="module" src="/static/stage-bridge.js"></script>\n</body>');

export function createStagePage({ root }) {
  const base = path.resolve(root);
  return {
    root: base,
    get exists() { return fs.existsSync(path.join(base, 'studio.html')) && fs.existsSync(path.join(base, 'virtual-studio', 'vienna', 'index.js')); },
    // the page, built fresh on every load (a change in the worktree shows after a reload of the browser source).
    // The worktree's own stagePage() (virtual-studio/vienna/dev-page.mjs) when it has one, so the two never drift;
    // otherwise the same swaps here
    async html() {
      let html = fs.readFileSync(path.join(base, 'studio.html'), 'utf8');
      const own = await import(pathToFileURL(path.join(base, 'virtual-studio', 'vienna', 'dev-page.mjs')).href).then(m => m.stagePage).catch(() => null);
      if (typeof own === 'function') return finish(own(html, 'Vienna Piano Stage (Broadcast Studio) — DISTANCE // ZERO'));
      for (const [from, to] of SWAPS) {
        if (!html.includes(from)) throw new Error('The Virtual Space studio.html changed and no longer matches the stage page (looked for: ' + from.slice(0, 60) + '…). Update lib/stage.js like virtual-studio/vienna/dev-page.mjs.');
        html = html.replace(from, to);
      }
      return finish(html);
    },
    // a file of the worktree (scripts, models, textures, the show's audio), read-only; never outside it, never git data
    file(rel) {
      const clean = path.posix.normalize('/' + decodeURIComponent(rel));
      if (/(^|\/)\.(?!well-known)/.test(clean)) return null;
      const abs = path.resolve(base, '.' + clean);
      if (!abs.startsWith(base + path.sep)) return null;
      try { return fs.statSync(abs).isFile() ? abs : null; } catch { return null; }
    },
  };
}

export const STAGE_TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.css': 'text/css; charset=utf-8', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.mp4': 'video/mp4', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.bin': 'application/octet-stream', '.ktx2': 'application/octet-stream',
  '.glb': 'model/gltf-binary', '.hdr': 'application/octet-stream', '.webmanifest': 'application/manifest+json',
};
