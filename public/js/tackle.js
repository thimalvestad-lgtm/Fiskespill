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

const ROD_LEN = 2.75; // 9 ft
const SEGS = 16;
const SIDES = 6;
const LINE_PTS = 56;
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
  const col = { zebra: '#1d1d1f', pt: '#8a5a2e', stone: '#4e3a26' }[id] || '#8a5a2e';
  const bead = { zebra: '#d9dde0', pt: '#e2b543', stone: '#5f666b' }[id] || '#e2b543';
  const len = { zebra: 0.012, pt: 0.016, stone: 0.026 }[id] || 0.016;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(len * 0.18, len, 4, 8), mat(col));
  body.rotation.x = Math.PI / 2;
  const b = new THREE.Mesh(new THREE.SphereGeometry(len * 0.24, 8, 6), mat(bead, { metalness: 0.6, roughness: 0.3 }));
  b.position.z = -len * 0.62;
  g.add(body, b);
  return g;
}

const NYMPH_OF = { 'dd-small': 'zebra', 'dd-medium': 'pt', 'dd-large': 'stone' };
const DRY_OF = { 'dd-small': 'adams', 'dd-medium': 'caddis', 'dd-large': 'hopper' };

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
    this.rod = new THREE.Mesh(this.rodGeo, new THREE.MeshStandardMaterial({ color: '#3a2c22', roughness: 0.35, metalness: 0.2 }));
    this.rod.frustumCulled = false;
    this.handle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.019, 0.24, 10), new THREE.MeshStandardMaterial({ color: '#c49a62', roughness: 0.9 }));
    this.reel = new THREE.Group();
    const reelBody = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.028, 22), new THREE.MeshStandardMaterial({ color: '#2b2f33', roughness: 0.35, metalness: 0.7 }));
    reelBody.rotation.z = Math.PI / 2;
    this.spoolMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.03, 6), new THREE.MeshStandardMaterial({ color: '#d7c06a', roughness: 0.6 }));
    this.spoolMesh.rotation.z = Math.PI / 2;
    this.reel.add(reelBody, this.spoolMesh);
    this.scene.add(this.rod, this.handle, this.reel);

    // Fly line + leader.
    this.lineGeo = new LineGeometry();
    this.linePts = new Float32Array(LINE_PTS * 3);
    this.lineGeo.setPositions(this.linePts);
    const colors = [];
    const fl = new THREE.Color('#ecd877'), ld = new THREE.Color('#d9e2dc');
    for (let i = 0; i < LINE_PTS; i++) {
      const c = i / (LINE_PTS - 1) < 0.8 ? fl : ld;
      colors.push(c.r, c.g, c.b);
    }
    this.lineGeo.setColors(colors);
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

  setDepth(m) {
    this.depthM = m;
  }

  resize(w, h) {
    this.lineMat.resolution.set(w, h);
    this.subMat.resolution.set(w, h);
  }

  // --- Commands --------------------------------------------------------------

  startCast(target, onLand) {
    this.mode = 'cast';
    this.castT = 0;
    this.target = target.clone();
    this.onLand = onLand;
    this.landed = false;
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
    this.sim = { P, prev, seg: (total / (LINE_PTS - 1)) * 1.01, flowAt };
    this.mode = 'drift';
    this.drag = 0;
    this.flyPos.copy(P[LINE_PTS - 1]);
  }

  // Lift the belly of the line and lay it back upstream.
  mend() {
    if (!this.sim) return;
    const { P, prev, flowAt } = this.sim;
    const n = LINE_PTS;
    for (let i = 3; i < n - 3; i++) {
      const k = Math.sin(Math.PI * (i / (n - 1))) * (1 - Math.pow(i / (n - 1), 6));
      const f = flowAt(P[i].x, P[i].z);
      const sp = Math.hypot(f.vx, f.vz) || 1;
      P[i].x -= (f.vx / sp) * 1.6 * k;
      P[i].z -= (f.vz / sp) * 1.6 * k;
      P[i].y += 0.25 * k;
      prev[i].copy(P[i]);
    }
    this.mended = 0.6;
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
    this.base.set(0.3, -0.38, -0.4).applyMatrix4(cam.matrixWorld);
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
    } else if (this.mode === 'drift') {
      targetAngle = this.mended > 0 ? 0.75 : 0.3;
      targetBend = 0.04 + this.drag * 0.12;
    } else if (this.mode === 'fight') {
      targetAngle = 0.62;
      targetBend = clamp(0.15 + this.tension.value * 0.75, 0.15, 1.35);
    }
    if (this.mended > 0) this.mended -= dt;
    if (this.mode !== 'cast') {
      const acc = (targetAngle - this.angle) * 60 - this.angleVel * 10;
      this.angleVel += acc * dt;
      this.angle += this.angleVel * dt;
    }
    this.bend = lerp(this.bend, targetBend, Math.min(1, dt * (this.mode === 'fight' ? 10 : 5)));

    const side = new THREE.Vector3().crossVectors(this.aimDir, UP).normalize();
    this.sideTilt = lerp(this.sideTilt || 0.06, this.mode === 'fight' ? 0.45 : 0.06, Math.min(1, dt * 3));
    const dir = this.aimDir.clone().multiplyScalar(Math.cos(this.angle)).addScaledVector(UP, Math.sin(this.angle)).addScaledVector(side, this.sideTilt).normalize();

    if (this.mode === 'fight' && this.fishPos) pullTo.copy(this.fishPos);
    else if (this.mode === 'drift' && this.sim) pullTo.copy(this.sim.P[4]);
    else pullTo.copy(this.base).addScaledVector(dir, ROD_LEN).add(new THREE.Vector3(0, -2, 0));
    this.rodDir = dir;
    this.buildRod(dir, pullTo, whip);

    this.handle.position.copy(this.base).addScaledVector(dir, -0.04);
    this.handle.quaternion.setFromUnitVectors(UP, dir);
    const down = new THREE.Vector3().crossVectors(dir, side).normalize();
    this.reel.position.copy(this.base).addScaledVector(dir, -0.17).addScaledVector(down, -0.055);
    this.reel.quaternion.setFromUnitVectors(UP, dir);
    this.spoolMesh.rotation.y = this.spool;

    this.updateLine(dt);
  }

  buildRod(dir, pullTo, whip) {
    const pos = this.rodGeo.attributes.position;
    const pts = [];
    const p = this.base.clone();
    pts.push(p.clone());
    const segLen = ROD_LEN / SEGS;
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

  // One step of the rope: gravity in the air, floating and drifting on the
  // water, and segment lengths that can bunch up but not stretch.
  stepSim(dt) {
    const { P, prev, seg, flowAt } = this.sim;
    const n = LINE_PTS;
    const steps = 3;
    const h = dt / steps;
    let dragSum = 0;
    for (let s = 0; s < steps; s++) {
      P[0].copy(this.tip);
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
          const wb = i === 0 ? 1 : i + 1 === n - 1 ? 0.75 : 0.5;
          a.x += dx * diff * wa; a.y += dy * diff * wa; a.z += dz * diff * wa;
          b.x -= dx * diff * wb; b.y -= dy * diff * wb; b.z -= dz * diff * wb;
          if (a.y < WATER_Y) a.y = WATER_Y;
          if (b.y < WATER_Y) b.y = WATER_Y;
        }
      }
      dragSum += Math.hypot(fly.x - before.x, fly.z - before.z) / h;
    }
    // How fast the line is pulling the fly against the current (m/s), 0..1.
    const dragV = dragSum / steps;
    this.drag = lerp(this.drag, clamp((dragV - 0.04) / 0.3, 0, 1), Math.min(1, dt * 4));
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
        fly = bezier(back, over, above, e, new THREE.Vector3());
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
    this.lineGeo.setPositions(L);

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
