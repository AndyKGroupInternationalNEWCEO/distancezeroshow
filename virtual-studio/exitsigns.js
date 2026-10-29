// The main studio's green EXIT signs (virtual: part of the studio's light modes, not a building's safety lighting): one
// over the backstage door, and the two exits in the back wall behind the cameras, each over a flush dark door with a
// push bar. Lit in CLEANING MODE / after the show, dark in SHOW MODE (setLevel 0 … 1, eased by the caller).
import * as THREE from 'three';

function signTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 200; const x = c.getContext('2d');
  x.fillStyle = '#0a8f3c'; x.fillRect(0, 0, 512, 200);
  x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 8; x.strokeRect(10, 10, 492, 180);
  // the running figure and the door, as the ISO 7010 sign draws them (simplified)
  x.fillStyle = '#ffffff';
  x.fillRect(36, 40, 70, 120); x.fillStyle = '#0a8f3c'; x.fillRect(46, 50, 50, 100); x.fillStyle = '#ffffff';
  x.beginPath(); x.arc(150, 58, 14, 0, Math.PI * 2); x.fill();
  x.lineCap = 'round'; x.strokeStyle = '#ffffff'; x.lineWidth = 14;
  for (const [a, b, c2, d] of [[148, 76, 136, 118], [136, 118, 160, 150], [136, 118, 110, 140], [146, 84, 170, 102], [146, 84, 122, 96]]) { x.beginPath(); x.moveTo(a, b); x.lineTo(c2, d); x.stroke(); }
  x.font = '700 96px Archivo, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('EXIT', 340, 104);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

export function exitSigns({ M, root, doorFrame, doorH = 2.2 }) {
  const face = new THREE.MeshBasicMaterial({ map: signTexture(), toneMapped: false, color: new THREE.Color(0.08, 0.08, 0.08) });
  const body = new THREE.MeshStandardMaterial({ color: 0xd8dadd, metalness: 0.2, roughness: 0.5 });
  const sign = () => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.17, 0.05), body));
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.15), face); f.position.z = 0.026; g.add(f);
    return g;
  };
  // over the backstage door (the door's own frame: above its on-air beacon)
  if (doorFrame) { const s = sign(); s.position.set(0, doorH + 0.62, 0.12); doorFrame.add(s); }
  // the back wall's two exits (the room's wall: a circle of 12.6 m about (0, 1)), turned to the studio's centre
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x15161a, metalness: 0.5, roughness: 0.45 });
  for (const sx of [-1, 1]) {
    const x = sx * 6.5, z = 1 + Math.sqrt(12.55 * 12.55 - x * x), g = new THREE.Group();
    g.position.set(x, 0, z); g.lookAt(0, 0, 1); root.add(g);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.2, 0.06), doorMat); door.position.set(0, 1.1, 0); g.add(door);
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.008, 2.18, 0.062), M.seam || doorMat); seam.position.set(0, 1.1, 0.001); g.add(seam);
    for (const dx of [-0.4, 0.4]) { const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.62, 12).rotateZ(Math.PI / 2), M.brushed || doorMat); bar.position.set(dx, 1.0, 0.07); g.add(bar); }
    const s = sign(); s.position.set(0, 2.5, 0.05); g.add(s);
  }
  return { setLevel(k) { face.color.setScalar(0.08 + 1.25 * Math.max(0, Math.min(1, k))); } };
}
