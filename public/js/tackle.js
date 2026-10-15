// Rod, reel, fly line and flies, seen from the angler's eyes.
// While the fly drifts, the line is a simple physical rope: it hangs from the
// rod tip, floats on the water, gets pushed by the current, and drags the fly
// when the belly pulls tight.
import * as THREE from 'three';
import { Line2 } from '../vendor/lines/Line2.js';
import { LineGeometry } from '../vendor/lines/LineGeometry.js';
import { LineMaterial } from '../vendor/lines/LineMaterial.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const UP = new THREE.Vector3(0, 1, 0);

const GUIDE_AT = [0.13, 0.22, 0.31, 0.4, 0.49, 0.58, 0.67, 0.76, 0.84, 0.92, 1];
const SEGS = 16;
const SIDES = 6;
const LINE_PTS = 56;
const RENDER_PTS = 166; // the line is drawn as a smooth curve through the sim points
const WATER_Y = 0.012;

function bezier(a, b, c, t, out) {
  const u = 1 - t;
  return out.set(
    u * u * a.x + 2 * u * t * b.x + t * t * c.x,
    u * u * a.y + 2 * u * t * b.y + t * t * c.y,
    u * u * a.z + 2 * u * t * b.z + t * t * c.z,
  );
}

// A disc of radiating hackle fibres, drawn once to a texture.
let hackleTex = null;
function hackleTexture() {
  if (hackleTex) return hackleTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.translate(64, 64);
  for (let i = 0; i < 70; i++) {
    const a = (i / 70) * Math.PI * 2 + Math.random() * 0.05;
    g.strokeStyle = i % 3 ? '#7a5634' : '#a07b52';
    g.lineWidth = 2.2;
    g.beginPath();
    g.moveTo(Math.cos(a) * 10, Math.sin(a) * 10);
    g.lineTo(Math.cos(a) * (52 + Math.random() * 10), Math.sin(a) * (52 + Math.random() * 10));
    g.stroke();
  }
  hackleTex = new THREE.CanvasTexture(c);
  return hackleTex;
}

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...extra });

// --- Fly models (cartoon, about life size; scaled up with distance) ----------

function hackleDisc(r) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 20), new THREE.MeshBasicMaterial({ map: hackleTexture(), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

function buildDry(id) {
  const g = new THREE.Group();
  if (id === 'hopper') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.009, 0.034), mat('#f2cf3c'));
    body.position.y = 0.004;
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.002, 0.03), mat('#b48a52'));
    wing.position.set(0, 0.0095, 0.004);
    const legMat = mat('#d9473a');
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.024, 4), legMat);
      leg.position.set(s * 0.009, 0.004, 0.01);
      leg.rotation.set(1.2, 0, s * 0.5);
      g.add(leg);
    }
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0022, 6, 4), mat('#2d2a22'));
    eye.position.set(0.004, 0.008, -0.016);
    g.add(body, wing, eye);
  } else if (id === 'caddis') {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.0032, 0.016, 4, 8), mat('#7d8a49'));
    body.rotation.x = Math.PI / 2;
    body.position.y = 0.002;
    const wing = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.03, 4), mat('#cfae74'));
    wing.rotation.x = -Math.PI / 2 + 0.12;
    wing.rotation.y = Math.PI / 4;
    wing.scale.set(1, 1, 0.55);
    wing.position.set(0, 0.006, 0.006);
    const hk = hackleDisc(0.009);
    hk.position.set(0, 0.002, -0.009);
    g.add(body, wing, hk);
  } else if (id === 'wulff') {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.003, 0.012, 4, 8), mat('#3e5a3a'));
    body.rotation.x = Math.PI / 2;
    body.position.y = 0.002;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0034, 0.0034, 0.004, 8), mat('#c8323a'));
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.002;
    const wingMat = new THREE.MeshBasicMaterial({ color: '#fdfcf6' });
    for (const s2 of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.016, 6), wingMat);
      w.position.set(s2 * 0.004, 0.011, -0.006);
      w.rotation.z = -s2 * 0.35;
      g.add(w);
    }
    const hk = hackleDisc(0.011);
    hk.rotation.x = 0;
    hk.position.set(0, 0.004, -0.004);
    g.add(body, band, hk);
  } else if (id === 'cdc') {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.0025, 0.011, 4, 8), mat('#7b8a4e'));
    body.rotation.x = Math.PI / 2 + 0.3;
    body.position.y = -0.001;
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(0.0065, 1), mat('#9ca3a8'));
    puff.scale.set(1, 1.2, 1.3);
    puff.position.set(0, 0.006, -0.004);
    g.add(body, puff);
  } else {
    // Parachute Adams: grey body, tail, white post, hackle wound flat around the post.
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.0026, 0.012, 4, 8), mat('#8b8f92'));
    body.rotation.x = Math.PI / 2;
    body.position.y = 0.001;
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.003, 0.014, 5), mat('#8a6a45'));
    tail.rotation.x = Math.PI / 2;
    tail.position.set(0, 0.002, 0.014);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0028, 0.016, 8), new THREE.MeshBasicMaterial({ color: '#fdfcf6' }));
    post.position.set(0, 0.009, -0.004);
    const hk = hackleDisc(0.011);
    hk.position.set(0, 0.003, -0.004);
    g.add(body, tail, post, hk);
  }
  return g;
}

function buildIndicator() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: '#ff6e2e', roughness: 0.9, emissive: '#ff6e2e', emissiveIntensity: 0.25 });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.011, 12, 8), m);
  ball.position.y = 0.006;
  g.add(ball);
  // A yarn tuft on top.
  for (let i = 0; i < 4; i++) {
    const t = new THREE.Mesh(new THREE.SphereGeometry(0.005, 6, 4), m);
    t.position.set(Math.cos(i * 1.6) * 0.005, 0.016, Math.sin(i * 1.6) * 0.005);
    g.add(t);
  }
  return g;
}

function buildNymph(id) {
  const g = new THREE.Group();
  const col = { zebra: '#1d1d1f', pt: '#8a5a2e', stone: '#4e3a26', copper: '#c4682a', perdigon: '#5a3a7a' }[id] || '#8a5a2e';
  const bead = { zebra: '#d9dde0', pt: '#e2b543', stone: '#5f666b', copper: '#e2b543', perdigon: '#2d2f31' }[id] || '#e2b543';
  const len = { zebra: 0.012, pt: 0.016, stone: 0.026, copper: 0.017, perdigon: 0.015 }[id] || 0.016;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(len * 0.18, len, 4, 8), mat(col));
  body.rotation.x = Math.PI / 2;
  const b = new THREE.Mesh(new THREE.SphereGeometry(len * 0.24, 8, 6), mat(bead, { metalness: 0.6, roughness: 0.3 }));
  b.position.z = -len * 0.62;
  g.add(body, b);
  return g;
}

const NYMPH_OF = { 'dd-small': 'zebra', 'dd-medium': 'pt', 'dd-large': 'stone', 'dd-wulff': 'copper' };
const DRY_OF = { 'dd-small': 'adams', 'dd-medium': 'caddis', 'dd-large': 'hopper', 'dd-wulff': 'wulff' };

export class Tackle {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.mode = 'idle';
    this.angle = 0.5;
    this.angleVel = 0;
    this.bend = 0;
    this.aimDir = new THREE.Vector3(0, 0, -1);
    this.tip = new THREE.Vector3();
    this.base = new THREE.Vector3();
    this.flyPos = new THREE.Vector3();
    this.spool = 0;
    this.time = 0;
    this.depthM = 0.6;
    this.drag = 0;

    // Rod blank: a tapered tube rebuilt in place every frame.
    const verts = (SEGS + 1) * SIDES;
    this.rodGeo = new THREE.BufferGeometry();
    this.rodGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
    const idx = [];
    for (let i = 0; i < SEGS; i++) {
      for (let j = 0; j < SIDES; j++) {
        const a = i * SIDES + j, b = i * SIDES + ((j + 1) % SIDES), c = a + SIDES, d = b + SIDES;
        idx.push(a, c, b, b, c, d);
      }
    }
    this.rodGeo.setIndex(idx);
    this.rodLen = 2.75;
    this.rodMat = new THREE.MeshStandardMaterial({ color: '#3a2c22', roughness: 0.3, metalness: 0.25 });
    this.rod = new THREE.Mesh(this.rodGeo, this.rodMat);
    this.rod.frustumCulled = false;

    // A shaped cork grip and a metal reel seat.
    const gripProfile = [[0.012, 0], [0.016, 0.02], [0.019, 0.08], [0.0175, 0.17], [0.0135, 0.23], [0.011, 0.245]].map(([r, y]) => new THREE.Vector2(r, y));
    const gripGeo = new THREE.LatheGeometry(gripProfile, 14);
    gripGeo.translate(0, -0.12, 0);
    this.gripMat = new THREE.MeshStandardMaterial({ color: '#c49a62', roughness: 0.95 });
    this.handle = new THREE.Mesh(gripGeo, this.gripMat);
    const metal = new THREE.MeshStandardMaterial({ color: '#8e9296', roughness: 0.3, metalness: 0.85 });
    this.seat = new THREE.Mesh(new THREE.CylinderGeometry(0.0115, 0.0115, 0.075, 12), metal);

    // The reel: frame, backplate, spool with ports and wound line, handle.
    this.reel = new THREE.Group();
    this.reelFrameMat = new THREE.MeshStandardMaterial({ color: '#b9b4a6', roughness: 0.3, metalness: 0.8 });
    this.reelSpoolMat = new THREE.MeshStandardMaterial({ color: '#8a8578', roughness: 0.35, metalness: 0.7 });
    this.reelLineMat = new THREE.MeshStandardMaterial({ color: '#f0a23a', roughness: 0.7 });
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.043, 0.0055, 8, 36), this.reelFrameMat);
    frame.rotation.y = Math.PI / 2;
    const back = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.043, 0.004, 32), this.reelFrameMat);
    back.rotation.z = Math.PI / 2;
    back.position.x = -0.013;
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.06, 0.012), this.reelFrameMat);
    foot.position.set(0, 0, 0.05);
    this.spoolMesh = new THREE.Group();
    const spoolFace = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.004, 32), this.reelSpoolMat);
    spoolFace.rotation.z = Math.PI / 2;
    spoolFace.position.x = 0.012;
    const wound = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.02, 28), this.reelLineMat);
    wound.rotation.z = Math.PI / 2;
    const portMat = new THREE.MeshStandardMaterial({ color: '#1b1d1f', roughness: 0.6 });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const port = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.005, 14), portMat);
      port.rotation.z = Math.PI / 2;
      port.position.set(0.0125, Math.cos(a) * 0.022, Math.sin(a) * 0.022);
      this.spoolMesh.add(port);
    }
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.006, 0.02, 10), new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 0.5 }));
    knob.rotation.z = Math.PI / 2;
    knob.position.set(0.023, 0.026, 0);
    this.spoolMesh.add(spoolFace, wound, knob);
    this.reel.add(frame, back, foot, this.spoolMesh);
    this.scene.add(this.rod, this.handle, this.seat, this.reel);

    // Line guides: snake guides along the blank, a big stripping guide, a tip-top.
    this.guides = GUIDE_AT.map((f, i) => {
      const r = i === 0 ? 0.012 : f === 1 ? 0.003 : lerp(0.0065, 0.0036, f);
      const g = new THREE.Mesh(new THREE.TorusGeometry(r, i === 0 ? 0.0016 : 0.0011, 6, 16), metal);
      g.userData.r = r;
      this.scene.add(g);
      return g;
    });
    this.guidePts = GUIDE_AT.map(() => new THREE.Vector3());

    // The fly line running from the reel up through the guides.
    this.rodLineGeo = new LineGeometry();
    this.rodLinePts = new Float32Array((GUIDE_AT.length + 1) * 3);
    this.rodLineGeo.setPositions(this.rodLinePts);
    this.rodLineMat = new LineMaterial({ color: '#f0a23a', linewidth: 1.6, worldUnits: false });
    this.rodLine = new Line2(this.rodLineGeo, this.rodLineMat);
    this.rodLine.frustumCulled = false;
    this.scene.add(this.rodLine);

    // Fly line + leader.
    this.lineGeo = new LineGeometry();
    this.linePts = new Float32Array(LINE_PTS * 3);
    this.lineGeo.setPositions(this.linePts);
    const colors = [];
    const fl = new THREE.Color('#ecd877'), ld = new THREE.Color('#d9e2dc');
    this.renderPts = new Float32Array(RENDER_PTS * 3);
    this.lineGeo.setPositions(this.renderPts);
    for (let i = 0; i < RENDER_PTS; i++) {
      const c = i / (RENDER_PTS - 1) < 0.8 ? fl : ld;
      colors.push(c.r, c.g, c.b);
    }
    this.lineGeo.setColors(colors);
    this.lineColors = colors;
    this.curvePts = Array.from({ length: LINE_PTS }, () => new THREE.Vector3());
    this.curve = new THREE.CatmullRomCurve3(this.curvePts, false, 'centripetal');
    this.lineMat = new LineMaterial({ linewidth: 2.4, vertexColors: true, transparent: true, opacity: 0.95, worldUnits: false });
    this.line = new Line2(this.lineGeo, this.lineMat);
    this.line.frustumCulled = false;
    this.line.renderOrder = 12;
    this.scene.add(this.line);

    // The tippet down to a nymph, under the water.
    this.subGeo = new LineGeometry();
    this.subGeo.setPositions([0, 0, 0, 0, 0, 0]);
    this.subMat = new LineMaterial({ color: '#e8f0ee', linewidth: 1, transparent: true, opacity: 0.55 });
    this.subLine = new Line2(this.subGeo, this.subMat);
    this.subLine.frustumCulled = false;
    this.scene.add(this.subLine);

    // A meniscus ring where the fly sits on the surface.
    const mg = new THREE.RingGeometry(0.7, 1, 24);
    mg.rotateX(-Math.PI / 2);
    this.meniscus = new THREE.Mesh(mg, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false }));
    this.meniscus.renderOrder = 12;
    this.scene.add(this.meniscus);

    this.surfaceFly = null;
    this.subFly = null;
    this.sim = null;
  }

  setFly(fly) {
    for (const o of [this.surfaceFly, this.subFly]) if (o) this.scene.remove(o);
    this.flyInfo = fly;
    if (fly.type === 'dry') {
      this.surfaceFly = buildDry(fly.id);
      this.subFly = null;
    } else if (fly.type === 'nymph') {
      this.surfaceFly = buildIndicator();
      this.subFly = buildNymph(fly.id);
    } else {
      this.surfaceFly = buildDry(DRY_OF[fly.id]);
      this.subFly = buildNymph(NYMPH_OF[fly.id]);
    }
    this.scene.add(this.surfaceFly);
    if (this.subFly) {
      this.subFly.renderOrder = 1;
      this.scene.add(this.subFly);
    }
    this.flyType = fly.type;
  }

  // Colours and size of the chosen rod, reel and line.
  setGear(info) {
    this.rodLen = info.rod.lengthFt * 0.3048;
    this.rodMat.color.set(info.rod.blank);
    this.gripMat.color.set(info.rod.grip);
    this.reelFrameMat.color.set(info.reel.frame);
    this.reelSpoolMat.color.set(info.reel.spool);
    this.reelLineMat.color.set(info.line.color);
    this.rodLineMat.color.set(info.line.color);
    const fl = new THREE.Color(info.line.color), ld = new THREE.Color('#d9e2dc');
    const c = [];
    for (let i = 0; i < RENDER_PTS; i++) {
      const k = i / (RENDER_PTS - 1) < 0.8 ? fl : ld;
      c.push(k.r, k.g, k.b);
    }
    this.lineGeo.setColors(c);
  }

  setDepth(m) {
    this.depthM = m;
  }

  resize(w, h) {
    this.lineMat.resolution.set(w, h);
    this.rodLineMat.resolution.set(w, h);
    this.subMat.resolution.set(w, h);
  }

  // --- Commands --------------------------------------------------------------

  // Delivery. From a false cast (fromFalse) it starts on the forward stroke,
  // with the fly unrolling from wherever it is in the air.
  startCast(target, onLand, fromFalse = false) {
    this.mode = 'cast';
    this.castT = fromFalse ? 0.6 : 0;
    this.castFrom = fromFalse ? this.flyPos.clone() : null;
    this.target = target.clone();
    this.onLand = onLand;
    this.landed = false;
    this.sim = null;
  }

  // False casting: the rod swings back and forth and the line flies above
  // the water, a little longer with each forward stroke. phase runs 0..1 per
  // stroke pair: 0 is the forward stop, 0.5 the back stop.
  startFalse() {
    this.mode = 'false';
    this.falsePhase = 0;
    this.carry = 3;
    this.sim = null;
  }

  startDrift(flowAt) {
    // The cast has laid the line out: from the rod tip down to the water near
    // your feet, then along the surface to the fly. From here it's a rope.
    const F = this.flyPos.clone().setY(WATER_Y);
    const foot = this.camera.position.clone().setY(WATER_Y);
    const E = foot.clone().lerp(F, Math.min(0.5, 2.2 / Math.max(2.5, foot.distanceTo(F))));
    const hang = this.tip.distanceTo(E), lay = E.distanceTo(F);
    const total = hang + lay;
    const P = [], prev = [];
    for (let i = 0; i < LINE_PTS; i++) {
      const d = (i / (LINE_PTS - 1)) * total;
      const v = d <= hang ? this.tip.clone().lerp(E, d / hang) : E.clone().lerp(F, (d - hang) / lay);
      if (d > hang) {
        // A little natural wiggle in the line as it lands.
        const k = (d - hang) / lay;
        v.x += Math.sin(k * 9) * 0.12 * (1 - k);
      }
      if (v.y < WATER_Y) v.y = WATER_Y;
      P.push(v);
      prev.push(v.clone());
    }
    this.sim = { P, prev, seg: (total / (LINE_PTS - 1)) * 1.01, flowAt, rockSide: new Map() };
    for (let k = 0; k < 6; k++) this.collideRocks(P, prev);
    this.mode = 'drift';
    this.drag = 0;
    this.flyPos.copy(P[LINE_PTS - 1]);
  }

  // A mend: a flick of the rod lifts the belly off the water and throws it
  // upstream. The line then falls back under gravity in soft curves, and
  // the fly (and the last bit of leader) stays where it is.
  mend(strength = 1) {
    if (!this.sim) return;
    this.pendingMend = strength;
    this.mended = 0.9;
  }

  // Pointers into the sim for spook checks: where the line lies on the water.
  linePoints() {
    if (this.sim) return this.sim.P;
    const out = [];
    for (let i = 0; i < LINE_PTS; i++) out.push(new THREE.Vector3(this.linePts[i * 3], this.linePts[i * 3 + 1], this.linePts[i * 3 + 2]));
    return out;
  }

  setFight(fishPos, tension) {
    this.mode = 'fight';
    this.fishPos = fishPos;
    this.tension = tension;
    this.sim = null;
  }

  idle() {
    this.mode = 'idle';
    this.sim = null;
  }

  // --- Per frame ---------------------------------------------------------------

  update(dt, aimPoint) {
    this.time += dt;
    const cam = this.camera;
    this.base.set(0.27, -0.27, -0.68).applyMatrix4(cam.matrixWorld);
    const camPos = cam.position;
    if (aimPoint) {
      this.aimDir.set(aimPoint.x - camPos.x, 0, aimPoint.z - camPos.z);
      if (this.aimDir.lengthSq() > 0.01) this.aimDir.normalize();
    } else {
      cam.getWorldDirection(this.aimDir);
      this.aimDir.y = 0;
      this.aimDir.normalize();
    }

    let targetAngle = 0.32, targetBend = 0.05, whip = 0;
    const pullTo = new THREE.Vector3();
    if (this.mode === 'cast') {
      this.castT += dt;
      const t = this.castT;
      if (t < 0.45) targetAngle = lerp(0.55, 1.85, ease(t / 0.45));
      else if (t < 0.6) targetAngle = 1.85;
      else if (t < 0.85) targetAngle = lerp(1.85, 0.32, ease((t - 0.6) / 0.25));
      else targetAngle = lerp(0.32, 0.22, clamp((t - 0.85) / 0.8, 0, 1));
      this.angle = targetAngle;
      whip = t < 0.45 ? 0.35 : t > 0.6 && t < 0.9 ? -0.6 : 0;
    } else if (this.mode === 'false') {
      const ph = this.falsePhase;
      const x = (1 - Math.cos(ph * Math.PI * 2)) / 2;
      targetAngle = lerp(0.5, 1.85, x);
      this.angle = targetAngle;
      whip = Math.sin(ph * Math.PI * 2) * (ph < 0.5 ? 0.35 : 0.6);
      targetBend = 0.08 + Math.abs(Math.sin(ph * Math.PI * 2)) * 0.12;
    } else if (this.mode === 'drift') {
      // Rod tip low, pointing at the fly as it drifts, raised briefly to mend.
      targetAngle = this.mended > 0.45 ? 0.6 : -0.12;
      targetBend = 0.04 + this.drag * 0.12;
    } else if (this.mode === 'fight') {
      // Bowing drops the rod tip towards the fish.
      targetAngle = this.bowing ? 0.05 : 0.62;
      targetBend = clamp(0.15 + this.tension.value * 0.75, 0.15, 1.35) * (this.bowing ? 0.4 : 1);
    }
    if (this.mended > 0) this.mended -= dt;
    if (this.mode !== 'cast' && this.mode !== 'false') {
      const acc = (targetAngle - this.angle) * 60 - this.angleVel * 10;
      this.angleVel += acc * dt;
      this.angle += this.angleVel * dt;
    }
    this.bend = lerp(this.bend, targetBend, Math.min(1, dt * (this.mode === 'fight' ? 10 : 5)));

    const side = new THREE.Vector3().crossVectors(this.aimDir, UP).normalize();
    const tilt = this.mode === 'fight' ? 0.4 - (this.rodSide || 0) * 0.75 : 0.06;
    this.sideTilt = lerp(this.sideTilt || 0.06, tilt, Math.min(1, dt * 4));
    const dir = this.aimDir.clone().multiplyScalar(Math.cos(this.angle)).addScaledVector(UP, Math.sin(this.angle)).addScaledVector(side, this.sideTilt).normalize();

    if (this.mode === 'fight' && this.fishPos) pullTo.copy(this.fishPos);
    else if (this.mode === 'drift' && this.sim) pullTo.copy(this.sim.P[4]);
    else pullTo.copy(this.base).addScaledVector(dir, this.rodLen).add(new THREE.Vector3(0, -2, 0));
    this.rodDir = dir;
    this.buildRod(dir, pullTo, whip);

    this.handle.position.copy(this.base).addScaledVector(dir, -0.02);
    this.handle.quaternion.setFromUnitVectors(UP, dir);
    this.seat.position.copy(this.base).addScaledVector(dir, -0.18);
    this.seat.quaternion.setFromUnitVectors(UP, dir);
    const down = new THREE.Vector3().crossVectors(dir, side).normalize();
    this.down = down;
    // The reel hangs under the rod, spool axis across it.
    const rx = side.clone(), ry = dir.clone(), rz = new THREE.Vector3().crossVectors(rx, ry);
    this.reel.position.copy(this.base).addScaledVector(dir, -0.18).addScaledVector(down, 0.062);
    this.reel.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(rx, ry, rz));
    this.spoolMesh.rotation.x = this.spool;
    this.placeGuides(side);

    this.updateLine(dt);
  }

  buildRod(dir, pullTo, whip) {
    const pos = this.rodGeo.attributes.position;
    const pts = [];
    const p = this.base.clone();
    pts.push(p.clone());
    const segLen = this.rodLen / SEGS;
    const pullDir = new THREE.Vector3();
    const whipDir = new THREE.Vector3().copy(this.aimDir).multiplyScalar(-1).addScaledVector(UP, 0.2).normalize();
    for (let i = 0; i < SEGS; i++) {
      const k = (i + 1) / SEGS;
      pullDir.subVectors(pullTo, p).normalize();
      const d = dir.clone().multiplyScalar(1 - this.bend * k * k).addScaledVector(pullDir, this.bend * k * k * 1.15);
      if (whip) d.addScaledVector(whipDir, whip * k * k);
      d.normalize();
      p.addScaledVector(d, segLen);
      pts.push(p.clone());
    }
    this.tip.copy(p);
    this.rodPts = pts;
    const t = new THREE.Vector3(), n = new THREE.Vector3(), b = new THREE.Vector3();
    for (let i = 0; i <= SEGS; i++) {
      const a = pts[Math.max(0, i - 1)], c = pts[Math.min(SEGS, i + 1)];
      t.subVectors(c, a).normalize();
      n.crossVectors(t, UP);
      if (n.lengthSq() < 1e-4) n.set(1, 0, 0);
      n.normalize();
      b.crossVectors(t, n).normalize();
      const r = lerp(0.0075, 0.0018, i / SEGS);
      for (let j = 0; j < SIDES; j++) {
        const ang = (j / SIDES) * Math.PI * 2;
        const ca = Math.cos(ang) * r, sa = Math.sin(ang) * r;
        pos.setXYZ(i * SIDES + j, pts[i].x + n.x * ca + b.x * sa, pts[i].y + n.y * ca + b.y * sa, pts[i].z + n.z * ca + b.z * sa);
      }
    }
    pos.needsUpdate = true;
    this.rodGeo.computeVertexNormals();
  }

  // Guides sit under the blank along its bend; the line threads through them.
  placeGuides(side) {
    const pts = this.rodPts;
    const t = new THREE.Vector3(), dn = new THREE.Vector3();
    const Z = new THREE.Vector3(0, 0, 1);
    GUIDE_AT.forEach((f, i) => {
      const x = f * SEGS;
      const i0 = Math.min(SEGS - 1, Math.floor(x)), k = x - i0;
      const p = pts[i0].clone().lerp(pts[i0 + 1], k);
      t.subVectors(pts[i0 + 1], pts[i0]).normalize();
      dn.crossVectors(t, side).normalize();
      const g = this.guides[i];
      const blankR = lerp(0.0075, 0.0018, f);
      const off = f === 1 ? 0 : blankR + g.userData.r + 0.004;
      g.position.copy(p).addScaledVector(dn, off);
      g.quaternion.setFromUnitVectors(Z, t);
      this.guidePts[i].copy(g.position);
    });
    // Reel → stripping guide → … → tip-top.
    const L = this.rodLinePts;
    const start = this.reel.position.clone().addScaledVector(this.down, -0.03);
    L[0] = start.x; L[1] = start.y; L[2] = start.z;
    this.guidePts.forEach((q, i) => { L[(i + 1) * 3] = q.x; L[(i + 1) * 3 + 1] = q.y; L[(i + 1) * 3 + 2] = q.z; });
    this.rodLineGeo.setPositions(L);
  }

  // Boulders are solid. Line lying on the water is pushed around a rock's
  // waterline, always to the same side once it has touched it, so the line
  // wraps around the rock instead of cutting through; line in the air drapes
  // over the top.
  collideRocks(P, prev) {
    const rocks = this.rocks;
    if (!rocks) return;
    const n = P.length;
    const a = P[0], b = P[n - 1];
    let ux = b.x - a.x, uz = b.z - a.z;
    const ul = Math.hypot(ux, uz) || 1;
    ux /= ul; uz /= ul;
    const nx = -uz, nz = ux;
    const sides = this.sim ? this.sim.rockSide : new Map();
    for (const r of rocks) {
      // Quick reject: is the rock anywhere near the line's chord?
      const rx = r.x - a.x, rz = r.z - a.z;
      const along = rx * ux + rz * uz, across = rx * nx + rz * nz;
      if (along < -r.R - 1 || along > ul + r.R + 3 || Math.abs(across) > r.R + 4) continue;
      for (let i = 1; i < n; i++) {
        const p = P[i];
        const dx = p.x - r.x, dz = p.z - r.z;
        const d = Math.hypot(dx, dz);
        if (d >= r.R) continue;
        const h = r.cy + r.V * Math.sqrt(1 - (d / r.R) ** 2);
        if (p.y >= h) continue;
        if (p.y > WATER_Y + 0.08 && h - p.y < 0.4) {
          // In the air over the rock: rest on its top.
          prev[i].y += h + 0.01 - p.y;
          p.y = h + 0.01;
          continue;
        }
        if (d > r.rw + 0.04) continue;
        let side = sides.get(r);
        if (side === undefined) {
          side = Math.sign(across) || 1;
          sides.set(r, side);
        }
        let ox = (d > 1e-4 ? dx / d : -side * nx) - side * nx * 1.2;
        let oz = (d > 1e-4 ? dz / d : -side * nz) - side * nz * 1.2;
        const ol = Math.hypot(ox, oz) || 1;
        ox /= ol; oz /= ol;
        const tx = r.x + ox * (r.rw + 0.05), tz = r.z + oz * (r.rw + 0.05);
        prev[i].x += tx - p.x; prev[i].z += tz - p.z;
        p.x = tx; p.z = tz;
      }
    }
  }

  // One step of the rope: gravity in the air, floating and drifting on the
  // water, and segment lengths that can bunch up but not stretch.
  stepSim(dt) {
    const { P, prev, flowAt } = this.sim;
    const n = LINE_PTS;
    // Strip in slack as the fly comes back towards you, like an angler would,
    // so only a little loose line lies on the water.
    const total = this.sim.seg * (n - 1);
    const dNow = this.tip.distanceTo(P[n - 1]);
    const coming = this.sim.lastD !== undefined && dNow < this.sim.lastD;
    this.sim.lastD = dNow;
    const want = dNow * 1.3 + 1.5;
    if (coming && total > want && this.mended <= 0) this.sim.seg = Math.max(want, total - dt * 0.6) / (n - 1);
    const seg = this.sim.seg;
    const steps = 3;
    const h = dt / steps;
    let dragSum = 0;
    for (let s = 0; s < steps; s++) {
      P[0].copy(this.tip);
      if (this.pendingMend && s === 0) {
        this.pendingMendStrength = this.pendingMend;
        this.pendingMend = false;
        for (let i = 2; i < n; i++) {
          const u = i / (n - 1);
          // Strongest in the middle of the line, nothing near the fly.
          const k = u < 0.82 ? Math.sin(Math.PI * Math.min(1, u / 0.82)) : 0;
          if (k <= 0) continue;
          const f = flowAt(P[i].x, P[i].z);
          const sp = Math.hypot(f.vx, f.vz) || 1;
          const m = this.pendingMendStrength;
          const vx = (-f.vx / sp) * 1.5 * k * m, vz = (-f.vz / sp) * 1.5 * k * m, vy = 2.0 * k * Math.min(1.2, m);
          prev[i].set(P[i].x - vx * h, Math.max(WATER_Y, P[i].y) - vy * h, P[i].z - vz * h);
          if (P[i].y < WATER_Y + 0.002) P[i].y = WATER_Y + 0.003;
        }
      }
      for (let i = 1; i < n; i++) {
        const p = P[i], q = prev[i];
        let vx = (p.x - q.x) * 0.985, vy = (p.y - q.y) * 0.985, vz = (p.z - q.z) * 0.985;
        q.copy(p);
        if (p.y > WATER_Y + 0.001) {
          vy -= 9.8 * h * h;
        } else {
          // Floating: the current carries it, the surface holds it up.
          const f = flowAt(p.x, p.z);
          const k = i === n - 1 ? 0.55 : 0.18;
          vx = lerp(vx, f.vx * h, k);
          vz = lerp(vz, f.vz * h, k);
          vy = Math.max(0, vy);
        }
        p.x += vx; p.y += vy; p.z += vz;
        if (p.y < WATER_Y) p.y = WATER_Y;
      }
      const fly = P[n - 1];
      const before = fly.clone();
      for (let it = 0; it < 12; it++) {
        P[0].copy(this.tip);
        for (let i = 0; i < n - 1; i++) {
          const a = P[i], b = P[i + 1];
          const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d <= seg || d === 0) continue;
          const diff = (d - seg) / d;
          // The tip is fixed; the fly is light and gets towed.
          const wa = i === 0 ? 0 : 0.5;
          // While mending, the fly is held still: the line moves, not the fly.
          const flyW = this.mended > 0 ? 0.08 : 0.75;
          const wb = i === 0 ? 1 : i + 1 === n - 1 ? flyW : 0.5;
          a.x += dx * diff * wa; a.y += dy * diff * wa; a.z += dz * diff * wa;
          b.x -= dx * diff * wb; b.y -= dy * diff * wb; b.z -= dz * diff * wb;
          if (a.y < WATER_Y) a.y = WATER_Y;
          if (b.y < WATER_Y) b.y = WATER_Y;
        }
      }
      // A little stiffness so slack line lies in curves instead of sharp kinks.
      const minGap = seg * 1.55;
      for (let i = 1; i < n - 3; i++) {
        const a = P[i], c = P[i + 2];
        const dx = c.x - a.x, dz = c.z - a.z, dy = c.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d >= minGap || d === 0) continue;
        const push = ((minGap - d) / d) * 0.25;
        a.x -= dx * push; a.z -= dz * push;
        c.x += dx * push; c.z += dz * push;
      }
      this.collideRocks(P, prev);
      if (this.mended > 0) fly.copy(before).lerp(fly, 0.15);
      dragSum += Math.hypot(fly.x - before.x, fly.z - before.z) / h;
    }
    // How fast the line is pulling the fly against the current (m/s), 0..1.
    const dragV = dragSum / steps;
    this.drag = lerp(this.drag, clamp((dragV - 0.07) / 0.35, 0, 1), Math.min(1, dt * 4));
    this.flyPos.copy(P[n - 1]);
  }

  updateLine(dt) {
    const tip = this.tip;
    const L = this.linePts;
    const tmp = new THREE.Vector3();
    const set = (i, v) => { L[i * 3] = v.x; L[i * 3 + 1] = v.y; L[i * 3 + 2] = v.z; };
    let flyVisible = true, onWater = false;

    if (this.mode === 'idle') {
      // Fly hooked in the keeper by the handle, line running back along the rod.
      const end = this.base.clone().addScaledVector(this.rodDir, 0.25);
      const ctrl = tip.clone().lerp(end, 0.5).add(new THREE.Vector3(0, -0.12, 0));
      for (let i = 0; i < LINE_PTS; i++) set(i, bezier(tip, ctrl, end, i / (LINE_PTS - 1), tmp));
      this.flyPos.copy(end);
      flyVisible = false;
    } else if (this.mode === 'false') {
      // The fly trails the rod a beat behind, so the loop unrolls back and
      // then forward over the water.
      const ph = this.falsePhase - 0.13;
      const x = ease((1 - Math.cos(ph * Math.PI * 2)) / 2);
      const c = this.carry;
      const front = tip.clone().addScaledVector(this.aimDir, c * 0.92).setY(Math.max(1.1, tip.y - 0.5 - c * 0.02));
      const back = tip.clone().addScaledVector(this.aimDir, -c * 0.85).setY(tip.y + 0.15);
      const fly = front.lerp(back, x);
      const loop = Math.abs(Math.sin(ph * Math.PI * 2));
      const ctrl = tip.clone().lerp(fly, 0.5).add(new THREE.Vector3(0, 0.35 + 0.9 * loop, 0));
      for (let i = 0; i < LINE_PTS; i++) set(i, bezier(tip, ctrl, fly, i / (LINE_PTS - 1), tmp));
      this.flyPos.copy(fly);
    } else if (this.mode === 'cast') {
      const t = this.castT;
      const T = this.target;
      const dist = Math.hypot(T.x - tip.x, T.z - tip.z);
      const back = tip.clone().addScaledVector(this.aimDir, -Math.min(9, dist * 0.55)).add(new THREE.Vector3(0, 1.6, 0));
      let fly, ctrl;
      if (t < 0.6) {
        const k = ease(clamp(t / 0.55, 0, 1));
        const start = this.base.clone().addScaledVector(this.rodDir, 0.25);
        fly = start.lerp(back, k);
        ctrl = tip.clone().lerp(fly, 0.5).add(new THREE.Vector3(0, 0.6 * k, 0));
      } else if (t < 1.65) {
        const k = clamp((t - 0.65) / 1.0, 0, 1);
        const over = tip.clone().addScaledVector(this.aimDir, dist * 0.35).add(new THREE.Vector3(0, 2.6, 0));
        const above = T.clone().add(new THREE.Vector3(0, 0.5, 0));
        const e = ease(k);
        fly = bezier(this.castFrom || back, over, above, e, new THREE.Vector3());
        ctrl = tip.clone().lerp(fly, 0.55).add(new THREE.Vector3(0, 0.9 * (1 - e) + 0.25, 0));
      } else {
        // Settling onto the water, line lying out straight towards the fly.
        const k = clamp((t - 1.65) / 0.35, 0, 1);
        fly = T.clone().add(new THREE.Vector3(0, 0.5 * (1 - k), 0));
        // The line falls to the water, starting from near your feet.
        const lowCtrl = this.camera.position.clone().lerp(fly, 0.3).setY(0);
        ctrl = tip.clone().lerp(fly, 0.4).add(new THREE.Vector3(0, 0.25, 0)).lerp(lowCtrl, ease(k));
        if (k >= 1 && !this.landed) {
          this.landed = true;
          this.onLand && this.onLand();
        }
      }
      for (let i = 0; i < LINE_PTS; i++) {
        const v = bezier(tip, ctrl, fly, i / (LINE_PTS - 1), tmp);
        if (v.y < WATER_Y) v.y = WATER_Y;
        set(i, v);
      }
      this.flyPos.copy(fly);
    } else if (this.mode === 'drift' && this.sim) {
      this.stepSim(dt);
      this.sim.P.forEach((p, i) => set(i, p));
      onWater = true;
    } else if (this.mode === 'fight') {
      const F = this.fishPos || this.flyPos;
      const sag = (1 - clamp(this.tension.value * 1.6, 0, 1)) * 1.2;
      const c = tip.clone().lerp(F, 0.5).add(new THREE.Vector3(0, -sag, 0));
      for (let i = 0; i < LINE_PTS; i++) {
        const v = bezier(tip, c, F, i / (LINE_PTS - 1), tmp);
        if (v.y < WATER_Y && i < LINE_PTS - 4) v.y = WATER_Y;
        set(i, v);
      }
      flyVisible = false;
    } else if (this.mode === 'hidden') {
      for (let i = 0; i < LINE_PTS; i++) set(i, tip);
      flyVisible = false;
    }
    // Draw a smooth curve through the line's points.
    for (let i = 0; i < LINE_PTS; i++) this.curvePts[i].set(L[i * 3], L[i * 3 + 1], L[i * 3 + 2]);
    const R = this.renderPts;
    for (let i = 0; i < RENDER_PTS; i++) {
      this.curve.getPoint(i / (RENDER_PTS - 1), tmp);
      R[i * 3] = tmp.x; R[i * 3 + 1] = Math.max(tmp.y, WATER_Y * 0.8); R[i * 3 + 2] = tmp.z;
    }
    this.lineGeo.setPositions(R);

    // Flies.
    const sf = this.surfaceFly;
    if (!sf) return;
    const camDist = this.camera.position.distanceTo(this.flyPos);
    const scale = clamp(camDist / 4, 1, 4.5) * 1.8;
    sf.visible = flyVisible && !this.hideFly;
    sf.position.copy(this.flyPos);
    sf.scale.setScalar(scale);
    this.meniscus.visible = sf.visible && onWater;
    this.subLine.visible = false;
    if (this.subFly) this.subFly.visible = false;
    if (onWater) {
      const bob = Math.sin(this.time * 5) * 0.003 + Math.sin(this.time * 8.3) * 0.0015;
      sf.position.y = 0.006 + bob - (this.dip || 0);
      // Face down the line, the way a fly sits on a drifting leader.
      const prev = this.sim.P[LINE_PTS - 2];
      sf.rotation.set(0, Math.atan2(prev.x - this.flyPos.x, prev.z - this.flyPos.z) + Math.PI, Math.sin(this.time * 3) * 0.08);
      this.meniscus.position.set(this.flyPos.x, 0.014, this.flyPos.z);
      const ms = 0.022 * scale * (1 + Math.sin(this.time * 5) * 0.08);
      this.meniscus.scale.set(ms, 1, ms);
      if (this.subFly && !this.hideFly) {
        // The nymph trails a little behind and below the surface fly.
        const f = this.sim.flowAt(this.flyPos.x, this.flyPos.z);
        const sp = Math.hypot(f.vx, f.vz) || 1;
        const depth = this.depthM;
        const nx = this.flyPos.x - (f.vx / sp) * depth * 0.35;
        const nz = this.flyPos.z - (f.vz / sp) * depth * 0.35;
        this.subFly.visible = true;
        this.subFly.position.set(nx, -depth, nz);
        this.subFly.rotation.y = Math.atan2(f.vx, f.vz) + Math.PI;
        this.subFly.scale.setScalar(scale * 0.9);
        this.subLine.visible = true;
        this.subGeo.setPositions([this.flyPos.x, 0.005, this.flyPos.z, nx, -depth, nz]);
      }
    } else {
      sf.rotation.set(0, 0, 0);
    }
  }
}
