// Reflection probes rendered in Cycles on the GPU pod (production/gpu: export-probes.mjs → probes.py): 360° HDR
// pictures of the club, seen from over the DJ console and from the middle of the room. Each becomes the reflections
// (environment map) of the materials near it, in place of the studio's generic environment, so the console's
// lacquer and metal, the platform and the club's floor reflect the club's own LED walls and lights. No light is added
// and nothing is rendered twice: it is a texture, loaded once.
// Files: assets/probes/<name>.f16: raw half floats, RGB, 1024 × 512, row 0 at the top; equirectangular, its centre
// looking along +x (as three.js maps an equirectangular environment).
import * as THREE from 'three';

const W = 1024, H = 512;
const cache = new Map();

export async function loadProbe(renderer, name) {
  if (!cache.has(name)) cache.set(name, (async () => {
    const res = await fetch(new URL(`../../assets/probes/${name}.f16`, import.meta.url));
    if (!res.ok) throw new Error(`probe ${name}: ${res.status}`);
    const rgb = new Uint16Array(await res.arrayBuffer()), rgba = new Uint16Array(W * H * 4);
    const ONE = 0x3c00;   // half float 1.0
    for (let y = 0; y < H; y++) {                          // flipped: a DataTexture's row 0 is the bottom
      const src = (H - 1 - y) * W * 3, dst = y * W * 4;
      for (let x = 0; x < W; x++) { rgba[dst + x * 4] = rgb[src + x * 3]; rgba[dst + x * 4 + 1] = rgb[src + x * 3 + 1]; rgba[dst + x * 4 + 2] = rgb[src + x * 3 + 2]; rgba[dst + x * 4 + 3] = ONE; }
    }
    const tex = new THREE.DataTexture(rgba, W, H, THREE.RGBAFormat, THREE.HalfFloatType);
    tex.mapping = THREE.EquirectangularReflectionMapping; tex.colorSpace = THREE.LinearSRGBColorSpace;
    tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
    const pm = new THREE.PMREMGenerator(renderer), env = pm.fromEquirectangular(tex).texture;
    pm.dispose(); tex.dispose();
    return env;
  })());
  return cache.get(name);
}

// give every lit material under the objects in `targets` (or the materials listed) the probe as its reflections, at
// `intensity`. Materials the studio shares with the rest of the set (`shared`, e.g. studio.M) are copied for these
// objects first: the studio upstairs keeps its own reflections
export async function applyProbe(renderer, name, targets, { intensity = 1, shared = new Set() } = {}) {
  const env = await loadProbe(renderer, name), seen = new Set(), copies = new Map();
  const lit = m => m && (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial);
  const take = m => { if (!lit(m) || seen.has(m)) return m; seen.add(m); m.envMap = env; m.envMapIntensity = intensity; m.needsUpdate = true; return m; };
  const own = m => { if (!lit(m) || !shared.has(m)) return m; if (!copies.has(m)) copies.set(m, m.clone()); return copies.get(m); };
  for (const t of [].concat(targets)) {
    if (t?.isObject3D) t.traverse(o => { if (!o.material) return; o.material = Array.isArray(o.material) ? o.material.map(m => take(own(m))) : take(own(o.material)); });
    else take(t);
  }
  return [...seen];
}
