// OPUS V · the instruments built for the room (approved by the owner 29 Oct 2026, "daj ich tam"): those that have no
// licensed professional 3D model (bassoon, timpani, concert bass drum, hand cymbals, triangle) and the percussionist's
// trap table, built to real instruments' dimensions. Metres; each stands on y = 0 with its front (the audience's side)
// towards −z and its player, where it has one, on the +z side. orchestra.js places them.
//   Bassoon: Heckel-system, 1.34 m tall; maple with a deep red-brown finish, nickel-silver keywork, ivory-white bell ring.
//   Timpani: a professional set of four, 32″ / 29″ / 26″ / 23″ (81 / 74 / 66 / 58 cm), polished copper bowls, Dresden-
//     style pedal, tension rods with T-handles, chrome counterhoops, calfskin-coloured heads, tripod base on casters.
//   Concert bass drum: 36″ × 22″ (91 × 56 cm), black lacquered maple shell, wooden hoops, 2 × 16 tension rods, in a
//     tilting suspended frame stand on casters.
//   Hand cymbals: a pair of 18″ (46 cm) B20 bronze cymbals with leather straps, on a padded cymbal cradle.
//   Triangle: 8″ (20 cm) steel, 10 mm rod, on a clip from a stand arm, with its beater; the percussionist's trap table.
import * as THREE from 'three';

const mats = () => {
  const noise = (w, h, f) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); f(x, w, h); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
  // hammered copper: a field of small dents as a bump map
  const hammer = noise(512, 512, (x, w, h) => { x.fillStyle = '#808080'; x.fillRect(0, 0, w, h); for (let i = 0; i < 2600; i++) { const px = Math.random() * w, py = Math.random() * h, r = 4 + Math.random() * 7, g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(40,40,40,0.5)'); g.addColorStop(1, 'rgba(128,128,128,0)'); x.fillStyle = g; x.fillRect(px - r, py - r, 2 * r, 2 * r); } });
  // wood grain (maple) for the bassoon and the drum hoops
  const grain = noise(256, 1024, (x, w, h) => { x.fillStyle = '#7a7a7a'; x.fillRect(0, 0, w, h); for (let i = 0; i < 160; i++) { x.strokeStyle = `rgba(0,0,0,${0.04 + Math.random() * 0.08})`; x.lineWidth = 1 + Math.random() * 3; x.beginPath(); let px = Math.random() * w; x.moveTo(px, 0); for (let y = 0; y <= h; y += 32) { px += (Math.random() - 0.5) * 6; x.lineTo(px, y); } x.stroke(); } });
  // lathe lines on the cymbals
  const lathe = noise(1024, 16, (x, w, h) => { for (let i = 0; i < w; i++) { const v = 110 + Math.random() * 40; x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(i, 0, 1, h); } });
  // calfskin
  const skin = noise(512, 512, (x, w, h) => { x.fillStyle = '#e9dcc2'; x.fillRect(0, 0, w, h); for (let i = 0; i < 9000; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '120,95,60' : '255,250,235'},${Math.random() * 0.06})`; const s = 1 + Math.random() * 6; x.fillRect(Math.random() * w, Math.random() * h, s, s); } });
  skin.colorSpace = THREE.SRGBColorSpace;
  return {
    copper: new THREE.MeshPhysicalMaterial({ color: 0xc27a4e, metalness: 1, roughness: 0.22, bumpMap: hammer, bumpScale: 0.6, clearcoat: 0.5, clearcoatRoughness: 0.15 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xe6e9ed, metalness: 1, roughness: 0.08 }),
    nickel: new THREE.MeshStandardMaterial({ color: 0xd8d6cf, metalness: 1, roughness: 0.16 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xbfc3c8, metalness: 1, roughness: 0.28 }),
    black: new THREE.MeshPhysicalMaterial({ color: 0x0d0d0f, metalness: 0.2, roughness: 0.35, clearcoat: 0.6 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 }),
    head: new THREE.MeshStandardMaterial({ map: skin, roughness: 0.75, side: THREE.DoubleSide }),
    maple: new THREE.MeshPhysicalMaterial({ color: 0x6e2c16, roughness: 0.32, roughnessMap: grain, clearcoat: 0.9, clearcoatRoughness: 0.12, sheen: 0.2 }),
    lacquer: new THREE.MeshPhysicalMaterial({ color: 0x0b0a0a, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 }),
    hoopWood: new THREE.MeshPhysicalMaterial({ color: 0x3b2414, roughness: 0.35, roughnessMap: grain, clearcoat: 0.7 }),
    ivory: new THREE.MeshPhysicalMaterial({ color: 0xece4d2, roughness: 0.3, clearcoat: 0.4 }),
    bronze: new THREE.MeshPhysicalMaterial({ color: 0xc9a25a, metalness: 1, roughness: 0.3, roughnessMap: lathe, clearcoat: 0.3 }),
    leather: new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.7 }),
    felt: new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 1 }),
    cork: new THREE.MeshStandardMaterial({ color: 0x9a7650, roughness: 0.9 }),
  };
};

const tube = (pts, r, mat, seg = 48) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), seg, r, 12), mat);
const cyl = (r0, r1, h, mat, seg = 32) => new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), mat);
const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };
const shade = g => { g.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; }); return g; };

export function proposals() {
  const M = mats();

  /* ---------- timpani: one drum of a given head diameter (inches) ---------- */
  function timpano(inch) {
    const g = new THREE.Group(), R = inch * 0.0254 / 2;
    const top = 0.66 + (32 - inch) * 0.012;   // playing height: the small drums stand a little higher
    const depth = R * 1.05;                   // a deep, parabolic Dresden bowl
    // the bowl: a lathe profile from its foot to the rim, with a rolled lip
    const prof = [];
    for (let i = 0; i <= 24; i++) { const u = i / 24, r = R * Math.pow(u, 0.55) * 0.995; prof.push(new THREE.Vector2(Math.max(0.04, r), top - depth * (1 - u) - 0.012)); }
    prof.push(new THREE.Vector2(R + 0.004, top - 0.008), new THREE.Vector2(R + 0.006, top - 0.002));
    const bowl = new THREE.Mesh(new THREE.LatheGeometry(prof, 96), M.copper); g.add(bowl);
    const headM = new THREE.Mesh(new THREE.CircleGeometry(R + 0.002, 96).rotateX(-Math.PI / 2), M.head); headM.position.y = top + 0.001; g.add(headM);
    // the counterhoop: a chrome ring standing a little above the bowl's lip
    g.add(at(new THREE.Mesh(new THREE.TorusGeometry(R + 0.012, 0.009, 12, 120).rotateX(Math.PI / 2), M.chrome), 0, top + 0.006, 0));
    // tension rods (8, or 6 on the smallest) with T-handles, down to brackets on the bowl
    const n = inch <= 23 ? 6 : 8;
    for (let i = 0; i < n; i++) {
      const a = (i + 0.5) / n * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), r = R + 0.03;
      g.add(tube([[c * r, top + 0.02, s * r], [c * r, top - 0.11, s * r]], 0.005, M.chrome, 4));
      g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.012).rotateY(-a), M.chrome), c * r, top + 0.03, s * r));     // T-handle
      g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.03).rotateY(-a), M.chrome), c * (R - 0.004), top - 0.12, s * (R - 0.004)));   // bracket
    }
    // the base: a ring under the bowl, three struts up to the bowl's shoulder, three legs on casters, the pedal at the front
    const baseY = 0.16, footR = R * 0.82;
    g.add(at(new THREE.Mesh(new THREE.TorusGeometry(footR * 0.62, 0.016, 10, 64).rotateX(Math.PI / 2), M.black), 0, baseY, 0));
    for (let i = 0; i < 3; i++) {
      const a = Math.PI / 2 + i * Math.PI * 2 / 3 + Math.PI / 3, c = Math.cos(a), s = Math.sin(a);
      g.add(tube([[c * footR * 0.62, baseY, s * footR * 0.62], [c * R * 0.86, top - depth * 0.42, s * R * 0.86], [c * (R - 0.01), top - 0.07, s * (R - 0.01)]], 0.012, M.chrome, 16));
      g.add(tube([[c * footR * 0.62, baseY, s * footR * 0.62], [c * footR * 1.02, 0.07, s * footR * 1.02]], 0.02, M.black, 8));
      g.add(at(cyl(0.035, 0.035, 0.03, M.rubber, 20).rotateZ(Math.PI / 2), c * footR * 1.05, 0.035, s * footR * 1.05));       // caster
    }
    const pedal = new THREE.Group(); pedal.position.set(0, 0.07, -footR * 0.9); pedal.rotation.x = 0.35; g.add(pedal);
    pedal.add(new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.025, 0.3), M.black));
    pedal.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.006, 0.26), M.rubber), 0, 0.015, 0));
    g.add(tube([[0, 0.1, -footR * 0.75], [0, baseY + 0.05, -footR * 0.5], [0, top - depth * 0.95, 0]], 0.012, M.chrome, 16));   // pedal rod up to the spider
    g.add(at(cyl(0.03, 0.03, 0.012, M.chrome), 0.08, top - 0.09, -R - 0.03));   // the tuning gauge's housing on the rim
    g.userData = { name: `Timpano ${inch}″`, size: `head ${Math.round(inch * 2.54)} cm · playing height ${Math.round(top * 100)} cm` };
    return shade(g);
  }
  // the set of four in the classic German arc round the player (the largest on his right: +x, as he faces −z), its pedals
  // turned to him; for a timpanist standing or on a stool about 0.7 m behind the set's middle (+z)
  function timpani() {
    const g = new THREE.Group();
    [[32, 0.62, 0.05], [29, 0.2, -0.34], [26, -0.22, -0.36], [23, -0.6, 0.02]].forEach(([inch, x, z]) => { const d = timpano(inch); d.position.set(x * 1.12, 0, z); d.rotation.y = Math.PI + Math.atan2(x * 1.12, 1.1 - z) * 0.6; g.add(d); });
    // a pair of felt mallets on the 29″
    for (const s of [-1, 1]) { const m = new THREE.Group(); m.add(tube([[0, 0, 0], [0.36, 0, 0]], 0.0045, M.maple, 2)); m.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.019, 16, 12), M.felt), 0.37, 0, 0)); m.position.set(0.22 + s * 0.04, 0.733, -0.2); m.rotation.y = 0.4 + s * 0.12; g.add(m); }
    g.userData = { name: 'Timpani · set of four', size: '32″ · 29″ · 26″ · 23″ (81 · 74 · 66 · 58 cm)' };
    return shade(g);
  }

  /* ---------- concert bass drum 36″ × 22″ in a tilting suspended frame ---------- */
  function bassDrum() {
    const g = new THREE.Group(), R = 0.457, D = 0.56, cy = 1.0;
    const drum = new THREE.Group(); drum.position.y = cy; drum.rotation.y = Math.PI / 2 - 0.35; drum.rotation.z = 0.22; g.add(drum);   // axis across, tilted
    drum.add(cyl(R, R, D - 0.06, M.lacquer, 96).rotateZ(Math.PI / 2));
    for (const s of [-1, 1]) {
      drum.add(at(new THREE.Mesh(new THREE.CircleGeometry(R - 0.005, 96).rotateY(s * Math.PI / 2), M.head), s * (D / 2 - 0.015), 0, 0));
      drum.add(at(new THREE.Mesh(new THREE.TorusGeometry(R + 0.012, 0.022, 12, 120).rotateY(Math.PI / 2), M.hoopWood), s * (D / 2 - 0.02), 0, 0));   // wooden hoop
      for (let i = 0; i < 16; i++) {   // tension rods to the lugs on the shell
        const a = i / 16 * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
        drum.add(tube([[s * (D / 2 - 0.01), c * (R + 0.03), sn * (R + 0.03)], [s * (D / 2 - 0.12), c * (R + 0.012), sn * (R + 0.012)]], 0.0045, M.chrome, 2));
        drum.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.024, 0.024), M.chrome), s * (D / 2 - 0.13), c * (R + 0.008), sn * (R + 0.008)));
      }
    }
    // the suspension ring: a steel hoop round the drum, hung from the frame by elastic cords
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R + 0.13, 0.014, 12, 120), M.chrome); drum.add(ring); ring.rotation.y = Math.PI / 2;
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; drum.add(tube([[0, Math.cos(a) * (R + 0.04), Math.sin(a) * (R + 0.04)], [0, Math.cos(a) * (R + 0.12), Math.sin(a) * (R + 0.12)]], 0.005, M.rubber, 2)); }
    // the frame: the ring pivots on two arms of a yoke over a four-legged base on casters
    const yoke = R + 0.15;
    for (const s of [-1, 1]) g.add(tube([[s * yoke * Math.cos(0.35), cy, s * yoke * Math.sin(0.35)], [s * (yoke + 0.03) * Math.cos(0.35), 0.35, s * (yoke + 0.03) * Math.sin(0.35)], [s * 0.18 * Math.cos(0.35), 0.18, s * 0.18 * Math.sin(0.35)]], 0.017, M.chrome, 20));
    for (const s of [-1, 1]) g.add(at(cyl(0.035, 0.035, 0.05, M.black, 20).rotateZ(Math.PI / 2).rotateY(-0.35), s * yoke * Math.cos(0.35), cy, s * yoke * Math.sin(0.35)));   // tilt knobs
    g.add(at(cyl(0.03, 0.03, 0.2, M.chrome, 20), 0, 0.12, 0));
    for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2, c = Math.cos(a) * 0.42, s = Math.sin(a) * 0.42; g.add(tube([[0, 0.13, 0], [c, 0.06, s]], 0.016, M.chrome, 4)); g.add(at(cyl(0.032, 0.032, 0.028, M.rubber, 20).rotateZ(Math.PI / 2), c, 0.032, s)); }
    // a pair of beaters on a holder
    for (const s of [-1, 1]) { const b = new THREE.Group(); b.add(tube([[0, 0, 0], [0, 0.38, 0]], 0.007, M.hoopWood, 2)); b.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.045, 20, 16).scale(1, 0.8, 1), M.felt), 0, 0.4, 0)); b.position.set(-0.2 + s * 0.03, 0.2, -0.25); b.rotation.z = 0.1; g.add(b); }
    g.userData = { name: 'Concert bass drum', size: '36″ × 22″ (91 × 56 cm) · tilting suspended frame' };
    return shade(g);
  }

  /* ---------- hand cymbals 18″ on a cradle; the triangle; the trap table ---------- */
  function cymbal(inch = 18) {
    const R = inch * 0.0254 / 2, prof = [];
    // the bell (Ø 12 cm), then the bow down to the edge (a gentle taper), as a thin shell
    for (let i = 0; i <= 30; i++) { const u = i / 30, r = 0.004 + u * R, y = u < 0.13 ? 0.035 * (1 - Math.pow(u / 0.13, 2)) + 0.01 : 0.01 * (1 - (u - 0.13) / 0.87); prof.push(new THREE.Vector2(r, y)); }
    for (let i = 30; i >= 0; i--) { const p = prof[i]; prof.push(new THREE.Vector2(p.x, p.y - 0.0016)); }
    const c = new THREE.Group(); c.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 128), M.bronze));
    const strap = tube([[-0.035, 0.045, 0], [0, 0.085, 0], [0.035, 0.045, 0]], 0.009, M.leather, 12); strap.scale.z = 2.2; c.add(strap);
    c.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.01, 8, 24).rotateX(Math.PI / 2), M.leather), 0, 0.046, 0));   // the pad
    return c;
  }
  function cymbals() {
    const g = new THREE.Group();
    // a cymbal cradle: two padded forks on a tripod, the pair standing on edge in it, face to the audience
    g.add(at(cyl(0.012, 0.012, 0.62, M.chrome), 0, 0.37, 0));
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; g.add(tube([[0, 0.12, 0], [Math.cos(a) * 0.32, 0.01, Math.sin(a) * 0.32]], 0.009, M.chrome, 2)); }
    g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.12), M.felt), 0, 0.69, 0));
    for (const s of [-1, 1]) {
      g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, 0.12), M.felt), s * 0.16, 0.74, 0));
      const c = cymbal(18); c.rotation.x = -Math.PI / 2 + 0.08 * s; c.position.set(s * 0.03, 0.70 + 0.229, s * 0.022); g.add(c);
    }
    g.userData = { name: 'Hand cymbals · pair', size: '18″ (46 cm) B20 bronze · leather straps · cymbal cradle' };
    return shade(g);
  }
  function triangle() {
    const g = new THREE.Group(), side = 0.2, r = 0.005, k = 0.022;
    // an equilateral triangle of 10 mm steel with rounded corners, open at one corner, hung point-up from a clip
    const h = side * Math.sqrt(3) / 2, A = [0, h, 0], B = [-side / 2, 0, 0], C = [side / 2, 0, 0];
    const lerp = (p, q, t) => p.map((v, i) => v + (q[i] - v) * t);
    const pts = [lerp(A, C, 0.06), lerp(A, C, k), A, lerp(A, B, k), lerp(A, B, 1 - k), B, lerp(B, C, k), lerp(B, C, 1 - k), C, lerp(C, A, k), lerp(C, A, 0.94 - 0.06)];
    const tri = tube(pts, r, M.steel, 200); const tg = new THREE.Group(); tg.add(tri);
    tg.position.set(0, 1.12 - h - 0.06, 0); g.add(tg);
    // the clip and its nylon loops, from a stand arm over a music stand's column
    g.add(at(cyl(0.012, 0.014, 1.2, M.chrome), -0.18, 0.6, 0));
    g.add(tube([[-0.18, 1.2, 0], [0, 1.22, 0]], 0.008, M.chrome, 4));
    g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.02), M.black), 0, 1.19, 0));
    for (const s of [-1, 1]) g.add(tube([[0, 1.17, 0], [s * 0.004, 1.12 - 0.06 + 0.004, 0]], 0.0012, M.rubber, 2));
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; g.add(tube([[-0.18, 0.12, 0], [-0.18 + Math.cos(a) * 0.26, 0.01, Math.sin(a) * 0.26]], 0.008, M.chrome, 2)); }
    // the beater: a steel rod 20 cm with a grip
    const b = new THREE.Group(); b.add(tube([[0, 0, 0], [0.2, 0, 0]], 0.0028, M.steel, 2)); b.add(at(cyl(0.007, 0.007, 0.06, M.rubber, 12).rotateZ(Math.PI / 2), 0.02, 0, 0));
    b.position.set(0.06, 1.0, -0.03); b.rotation.z = -0.5; g.add(b);
    g.userData = { name: 'Triangle', size: '8″ (20 cm) steel, 10 mm rod · on a clip · beater' };
    return shade(g);
  }
  // the percussionist's trap table: black felt top 90 × 45 cm at 90 cm, sticks and the snare's place beside it
  function trapTable() {
    const g = new THREE.Group();
    g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.45), M.felt), 0, 0.9, 0));
    g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.02, 0.47), M.black), 0, 0.875, 0));
    for (const s of [-1, 1]) { g.add(at(cyl(0.014, 0.014, 0.86, M.chrome), s * 0.36, 0.44, 0)); g.add(tube([[s * 0.36, 0.02, -0.2], [s * 0.36, 0.02, 0.2]], 0.012, M.chrome, 2)); }
    for (const z of [-0.08, 0.06]) g.add(at(cyl(0.007, 0.006, 0.4, M.maple, 12).rotateZ(Math.PI / 2), 0.1, 0.927, z));   // a pair of snare sticks
    g.userData = { name: 'Trap table', size: '90 × 45 cm, 90 cm high, black felt' };
    return shade(g);
  }

  /* ---------- bassoon, Heckel system, 1.34 m ---------- */
  function bassoon() {
    const g = new THREE.Group(), bore = (r0, r1, h, mat = M.maple) => cyl(r1, r0, h, mat, 40);
    // the boot joint: the U-bend at the bottom (an oval block), 51 cm, with its nickel cap
    const boot = new THREE.Group(); g.add(boot);
    const b = bore(0.04, 0.04, 0.51); b.scale.z = 0.62; b.position.set(0, 0.255 + 0.05, 0); boot.add(b);
    boot.add(at(new THREE.Mesh(new THREE.CapsuleGeometry(0.041, 0.02, 6, 24).scale(1, 0.6, 0.64), M.nickel), 0, 0.055, 0));
    // the wing (tenor) joint from the boot's front bore, 50 cm, narrow (the bocal at its top); the long (bass) joint from
    // the back bore, 48 cm showing; the bell joint on top of the long joint, 36 cm, with its ivory-white ring
    const xW = -0.016, xL = 0.02;
    g.add(at(bore(0.019, 0.023, 0.5), xW, 0.5 + 0.25, -0.004));
    g.add(at(bore(0.026, 0.029, 0.48), xL, 0.5 + 0.24, 0.004));
    g.add(at(bore(0.029, 0.033, 0.36), xL, 0.98 + 0.18, 0.004));   // (its top at 1.34 m)
    g.add(at(cyl(0.036, 0.035, 0.045, M.ivory, 40), xL, 1.34 - 0.022, 0.004));
    // nickel-silver ferrules at the joints
    for (const [x, y, r] of [[0, 0.52, 0.042], [xL, 0.98, 0.031], [xW, 1.0, 0.021]]) g.add(at(new THREE.Mesh(new THREE.TorusGeometry(r, 0.004, 8, 40).rotateX(Math.PI / 2), M.nickel), x, y, xW === x ? -0.004 : 0.004));
    // the bocal: a thin silver S-curve from the wing joint's top, ~30 cm, to the double reed
    g.add(tube([[xW, 1.0, -0.004], [xW, 1.07, -0.02], [xW - 0.02, 1.11, -0.1], [xW - 0.03, 1.08, -0.22], [xW - 0.03, 1.04, -0.29]], 0.0035, M.nickel, 40));
    g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.004, 0.05), M.cork), xW - 0.03, 1.035, -0.32));
    // keywork: long rods along the joints, key cups and touches on the front (−z) and the thumb side
    for (const [x, y0, y1, z] of [[xW + 0.02, 0.62, 1.0, -0.018], [xL - 0.03, 0.62, 1.15, -0.02], [0.03, 0.14, 0.75, -0.028], [-0.035, 0.18, 0.7, -0.024], [0.03, 0.2, 0.68, 0.028]]) g.add(tube([[x, y0, z], [x, y1, z]], 0.0026, M.nickel, 2));
    for (const [x, y, z, r] of [[0, 0.3, -0.03, 0.009], [0.012, 0.42, -0.03, 0.009], [-0.012, 0.5, -0.03, 0.008], [xW, 0.78, -0.024, 0.007], [xW, 0.86, -0.024, 0.007], [xL, 0.95, -0.031, 0.01], [xL, 1.08, -0.031, 0.011], [0.02, 0.36, 0.029, 0.008], [-0.01, 0.6, 0.029, 0.01]])
      g.add(at(cyl(r, r, 0.004, M.nickel, 20).rotateX(Math.PI / 2), x, y, z));
    // the bassoon on its stand: a slim tripod with a cup for the boot and a hook for the bell
    g.add(at(cyl(0.008, 0.009, 1.1, M.black), 0.06, 0.56, 0.07));
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.05, 32, 1, true), M.black), 0, 0.035, 0));
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + 0.5; g.add(tube([[0.06, 0.08, 0.07], [0.06 + Math.cos(a) * 0.24, 0.005, 0.07 + Math.sin(a) * 0.24]], 0.007, M.black, 2)); }
    g.add(tube([[0.06, 1.1, 0.07], [0.04, 1.12, 0.03], [xL + 0.03, 1.1, 0.004]], 0.005, M.black, 8));
    g.userData = { name: 'Bassoon', size: 'Heckel system · 1.34 m · on a bassoon stand' };
    return shade(g);
  }

  return { timpani, timpano, bassDrum, cymbals, triangle, trapTable, bassoon, materials: M };
}
