// Surface detail for the polish pass, all generated in code (no image downloads): micro-roughness, leather
// grain, brushed metal, vent grilles, panel joints, and soft contact shadows under furniture and equipment.
import * as THREE from 'three';

const cache = new Map();
const once = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}
function tex(c, repeat = 1, srgb = false) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// deterministic noise, so every visit looks the same
function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646; }

// smooth value noise in a tileable square, values 0..1
function valueNoise(size, cells, seed) {
  const r = rng(seed), g = [];
  for (let i = 0; i < cells * cells; i++) g.push(r());
  const at = (x, y) => g[((y + cells) % cells) * cells + ((x + cells) % cells)];
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = (x / size) * cells, fy = (y / size) * cells, ix = Math.floor(fx), iy = Math.floor(fy);
    const sx = fx - ix, sy = fy - iy, ux = sx * sx * (3 - 2 * sx), uy = sy * sy * (3 - 2 * sy);
    const a = at(ix, iy), b = at(ix + 1, iy), c = at(ix, iy + 1), d = at(ix + 1, iy + 1);
    out[y * size + x] = a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }
  return out;
}
function fbm(size, seed) {
  const o = new Float32Array(size * size);
  [[4, 0.5], [12, 0.3], [40, 0.2]].forEach(([cells, w], i) => { const n = valueNoise(size, cells, seed + i * 31); for (let k = 0; k < o.length; k++) o[k] += n[k] * w; });
  return o;
}
function grayCanvas(size, values, lo, hi) {
  const [c, x] = canvas(size);
  const img = x.createImageData(size, size);
  for (let i = 0; i < values.length; i++) {
    const v = Math.round(255 * (lo + (hi - lo) * values[i]));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return [c, x];
}

/* micro-roughness: breaks up the perfectly even CG sheen on painted metal and plastics (multiplies roughness) */
export function roughnessNoise(repeat = 2) {
  const base = once('rough', () => {
    const [c, x] = grayCanvas(256, fbm(256, 7), 0.72, 1);
    // a few faint scuffs and wipe marks
    const r = rng(99);
    x.strokeStyle = 'rgba(255,255,255,0.18)'; x.lineWidth = 1;
    for (let i = 0; i < 40; i++) { const px = r() * 256, py = r() * 256; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (r() - 0.5) * 60, py + (r() - 0.5) * 12); x.stroke(); }
    return c;
  });
  return tex(base, repeat);
}

/* leather: a normal map made from a fine grain height field */
export function leatherNormal(repeat = 3) {
  const base = once('leather', () => {
    const s = 256, h = fbm(s, 21), fine = valueNoise(s, 90, 5);
    for (let i = 0; i < h.length; i++) h[i] = h[i] * 0.4 + fine[i] * 0.6;
    const [c, x] = canvas(s);
    const img = x.createImageData(s, s);
    const H = (px, py) => h[((py + s) % s) * s + ((px + s) % s)];
    for (let y = 0; y < s; y++) for (let px = 0; px < s; px++) {
      const dx = (H(px + 1, y) - H(px - 1, y)) * 2.2, dy = (H(px, y + 1) - H(px, y - 1)) * 2.2;
      const n = new THREE.Vector3(-dx, -dy, 1).normalize(), i = (y * s + px) * 4;
      img.data[i] = (n.x * 0.5 + 0.5) * 255; img.data[i + 1] = (n.y * 0.5 + 0.5) * 255; img.data[i + 2] = (n.z * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return c;
  });
  return tex(base, repeat);
}

/* brushed metal: fine directional streaks, used as a roughness map (with anisotropy on the material) */
export function brushed(repeat = 1) {
  const base = once('brushed', () => {
    const s = 256, [c, x] = canvas(s), r = rng(3);
    x.fillStyle = '#b8b8b8'; x.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      const v = 150 + Math.floor(r() * 105), y = r() * s;
      x.fillStyle = `rgba(${v},${v},${v},0.35)`;
      x.fillRect(0, y, s, 0.6 + r() * 1.2);
    }
    return c;
  });
  return tex(base, repeat);
}

/* vent grille: slots as a colour map (dark slots on the panel colour) */
export function ventTexture() {
  return once('vent', () => {
    const s = 256, [c, x] = canvas(s);
    x.fillStyle = '#5a5d63'; x.fillRect(0, 0, s, s);
    x.fillStyle = '#060607';
    for (let row = 0; row < 7; row++) for (let col = 0; col < 3; col++) {
      const px = 22 + col * 76, py = 18 + row * 33;
      x.beginPath(); x.roundRect(px, py, 60, 12, 6); x.fill();
    }
    return tex(c, 1, true);
  });
}

/* wall panels: faint joints every panel width, as a colour map that multiplies the wall colour */
export function panelJoints(cols = 1, rows = 1) {
  const base = once('panels', () => {
    const s = 256, [c, x] = canvas(s);
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, s, s);
    x.fillStyle = '#7c7c7c'; x.fillRect(0, 0, s, 2); x.fillRect(0, 0, 2, s);
    return c;
  });
  const t = tex(base);
  t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(cols, rows);
  return t;
}

/* polished resin floor: colour variation (mottling, faint tile joints) and a separate roughness map with
   smudges, so reflections break up the way they do on a real studio floor */
export function floorMaps() {
  return once('floor', () => {
    const s = 512, n = fbm(s, 11), [c, x] = grayCanvas(s, n, 0.78, 0.98);
    x.fillStyle = 'rgba(70,70,70,0.9)'; x.fillRect(0, 0, s, 2); x.fillRect(0, 0, 2, s);
    const r2 = fbm(s, 41), [rc, rx] = grayCanvas(s, r2, 0.55, 1);
    const rr = rng(17);
    rx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 60; i++) {
      const px = rr() * s, py = rr() * s, rad = 20 + rr() * 70;
      const g = rx.createRadialGradient(px, py, 0, px, py, rad);
      g.addColorStop(0, 'rgba(60,60,60,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      rx.fillStyle = g; rx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    }
    rx.fillStyle = 'rgba(255,255,255,0.6)'; rx.fillRect(0, 0, s, 2); rx.fillRect(0, 0, 2, s);
    return { map: tex(c, 24, true), roughness: tex(rc, 24) };
  });
}

/* soft contact shadows: a blurred dark ellipse under an object, or a band under the curved desk */
const blobTex = () => once('blob', () => {
  const s = 128, [c, x] = canvas(s);
  const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.45, 'rgba(0,0,0,0.7)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(c);
});
export function contactShadow(w, d, opacity = 0.6) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: blobTex(), color: 0x000000, transparent: true, opacity, depthWrite: false, toneMapped: false }));
  m.renderOrder = 1;
  m.position.y = 0.003;
  return m;
}
export function arcShadow(r0, r1, span, opacity = 0.65) {
  const geo = new THREE.RingGeometry(r0, r1, 96, 1, -Math.PI / 2 - span, span * 2).rotateX(-Math.PI / 2);
  // RingGeometry lies in xy with angles from +x; after rotateX(-π/2) angle -π/2 points to +z, like the desk
  const mat = new THREE.ShaderMaterial({
    uniforms: { uR: { value: new THREE.Vector2(r0, r1) }, uSpan: { value: span }, uOpacity: { value: opacity } },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec2 uR; uniform float uSpan; uniform float uOpacity; varying vec2 vP;
      void main(){ float r = length(vP); float mid = (uR.x + uR.y) * 0.5, hw = (uR.y - uR.x) * 0.5;
        float a = atan(vP.x, vP.y); float ends = smoothstep(uSpan, uSpan * 0.86, abs(a));
        float k = (1.0 - smoothstep(0.0, hw, abs(r - mid))) * ends; gl_FragColor = vec4(0.0, 0.0, 0.0, k * uOpacity); }`,
    transparent: true, depthWrite: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 1;
  return m;
}

/* bend a flat piece (chair back) around the sitter: z moves back with the square of x */
export function bendX(geo, k) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) - k * p.getX(i) * p.getX(i));
  geo.computeVertexNormals();
  return geo;
}
