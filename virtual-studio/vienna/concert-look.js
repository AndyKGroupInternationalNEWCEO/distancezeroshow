// The concert look for the Vienna Piano Stage (the Piano Sessions' look: on by default on the stage page, ?look=studio
// or the panel for the studio look): the same studio, the same grand
// and lift, lit and framed as an intimate concert. Nothing is rebuilt and no wall or stage is added:
//   · the grand's lacquer reflects warm softbox strips of its own (an environment map: costs nothing per frame), and
//     the optional front key light is on;
//   · behind the grand, between the studio's own vertical light lines, a soft gold and warm-white glow in depth
//     (one see-through surface, only on the stage's own camera shots);
//   · P1 and P5 frame the grand closer and lower, so the instrument, not the lift, fills the picture.
// Off, everything is as before (the BEFORE of the comparison).
import * as THREE from 'three';
import { CAMS, STAGE, PIANO, RIG, at } from './layout.js';

const xyz = (along, across, y) => { const [x, z] = at(along, across); return [x, y, z]; };
// the camera and key-light values of the look; `before` keeps the studio's own, to switch back
const LOOK = {
  P1: { pos: xyz(-0.2, 5.0, 2.0), target: [STAGE.x, 1.15, STAGE.z], fov: 30 },
  P5: { pos: xyz(-3.05, 3.5, 1.1), target: xyz(0.15, 0, 0.85), fov: 38 },   // (wider than the first test: the lid's tail was cut)
  key: { level: 700 },
};
const before = { P1: { ...CAMS.P1 }, P5: { ...CAMS.P5 }, key: { level: RIG.key.level } };

// the lacquer's own reflections: a dark room with tall warm softbox strips all round at eye height and a soft
// overhead panel, as a photographer lights a black instrument (the highlights draw its curves)
function softboxes(renderer) {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20), new THREE.MeshBasicMaterial({ color: 0x050403, side: THREE.BackSide })));
  const panel = (w, h, color, k, pos) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(0, 0, 0); env.add(m);
  };
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    panel(0.7, 5, i % 2 ? 0xfff0dc : 0xffdcae, i % 2 ? 1.7 : 1.0, [Math.cos(a) * 8, 0.6, Math.sin(a) * 8]);   // tall strips, warm white and a little gold
  }
  panel(6, 3, 0xfff0dc, 1.2, [0, 8, 0]);                       // the overhead panel, soft
  panel(10, 0.5, 0xffd8a8, 1.0, [0, -1.2, 8]);                 // a low line along the front: a highlight on the rim
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(env, 0.035).texture; pm.dispose();
  return tex;
}

// the glow in depth behind the grand: soft vertical columns, gold and warm white, fading up and down, on a curved
// surface round the stage on the side away from the studio cameras
function depthGlow() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
  const x = c.getContext('2d');
  for (let i = 0; i < 9; i++) {
    const cx = (i + 0.5) * (1024 / 9), w = 5 + (i % 3) * 3, g = x.createLinearGradient(cx - w * 2, 0, cx + w * 2, 0);
    const col = i % 2 ? '255,206,140' : '255,238,214';
    g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(0.5, `rgba(${col},${0.6 + 0.2 * (i % 3) / 2})`); g.addColorStop(1, `rgba(${col},0)`);
    x.fillStyle = g; x.fillRect(cx - w * 2, 0, w * 4, 256);
  }
  x.globalCompositeOperation = 'destination-in';
  const v = x.createLinearGradient(0, 0, 0, 256);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.45, 'rgba(0,0,0,0.85)'); v.addColorStop(0.75, 'rgba(0,0,0,0.35)'); v.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = v; x.fillRect(0, 0, 1024, 256);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  // a 150° arc of radius 5.2 round the stage, centred on the side away from the cameras, 0.3–7.6 m high
  // the grand's "behind" (−across, away from the cameras) as a cylinder angle (x = r sin θ, z = r cos θ)
  const back = Math.atan2(Math.cos(PIANO.rotY), -Math.sin(PIANO.rotY));
  const span = (150 * Math.PI) / 180;
  const geo = new THREE.CylinderGeometry(5.2, 5.2, 7.3, 64, 1, true, back - span / 2, span);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.position.set(STAGE.x, 3.95, STAGE.z); m.renderOrder = 1;
  return m;
}

export function concertLook({ renderer, scene, stage }) {
  let on = false, glowK = 0, env = null;
  const glow = depthGlow(); glow.visible = false; scene.add(glow);
  const apply = which => {
    for (const k of ['P1', 'P5']) Object.assign(CAMS[k], which[k]);
    RIG.key.level = which.key.level;
  };
  return {
    get on() { return on; },
    set(v) {
      on = !!v;
      apply(on ? LOOK : before);
      if (on) env ??= softboxes(renderer);
      stage.lacquerLook(on ? env : null, 1.0);
      stage.keyLight(on);
    },
    // `stageShot`: a Vienna camera is on air; `frame`: the stage's LED level (follows the lighting mode and the dimmer)
    update(dt, stageShot, frame) {
      glowK += ((on && stageShot ? 1 : 0) - glowK) * Math.min(1, dt * 1.5);
      glow.visible = glowK > 0.01;
      glow.material.opacity = 0.5 * glowK * Math.min(1, frame / 0.8);
    },
  };
}
