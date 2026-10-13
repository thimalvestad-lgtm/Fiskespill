// Rod, reel, fly line and fly, seen from the angler's eyes.
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

function bezier(a, b, c, t, out) {
  const u = 1 - t;
  return out.set(
    u * u * a.x + 2 * u * t * b.x + t * t * c.x,
    u * u * a.y + 2 * u * t * b.y + t * t * c.y,
    u * u * a.z + 2 * u * t * b.z + t * t * c.z,
  );
}

export class Tackle {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.mode = 'idle';
    this.angle = 0.5; // rod elevation, radians above horizontal
    this.angleVel = 0;
    this.bend = 0;
    this.pull = new THREE.Vector3(0, -1, 0);
    this.aimDir = new THREE.Vector3(0, 0, -1);
    this.tip = new THREE.Vector3();
    this.base = new THREE.Vector3();
    this.flyPos = new THREE.Vector3();
    this.spool = 0;
    this.time = 0;

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
      const c = i / (LINE_PTS - 1) < 0.78 ? fl : ld;
      colors.push(c.r, c.g, c.b);
    }
    this.lineGeo.setColors(colors);
    this.lineMat = new LineMaterial({ linewidth: 2.2, vertexColors: true, transparent: true, opacity: 0.95, worldUnits: false });
    this.line = new Line2(this.lineGeo, this.lineMat);
    this.line.frustumCulled = false;
    this.line.renderOrder = 12;
    this.scene.add(this.line);

    // Flies.
    this.flies = {
      dry: this.makeDry(),
      nymph: this.makeIndicator(),
      drydropper: this.makeDry(),
    };
    for (const f of Object.values(this.flies)) {
      f.visible = false;
      this.scene.add(f);
    }
    this.flyType = 'dry';
    this.flyScale = 1;
  }

  makeDry() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.003, 0.02, 6), new THREE.MeshStandardMaterial({ color: '#7a5a34' }));
    body.rotation.x = Math.PI / 2;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.004, 0.022, 6), new THREE.MeshBasicMaterial({ color: '#fbfaf2' }));
    post.position.y = 0.013;
    const hackle = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.0025, 4, 12), new THREE.MeshStandardMaterial({ color: '#9b7a52' }));
    hackle.rotation.x = Math.PI / 2;
    hackle.position.y = 0.004;
    g.add(body, post, hackle);
    // A little enlargement so the fly can be followed at 20 m, like your eye would.
    g.userData.base = 4;
    return g;
  }

  makeIndicator() {
    const g = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), new THREE.MeshBasicMaterial({ color: '#ff6e2e' }));
    ball.position.y = 0.006;
    g.add(ball);
    g.userData.base = 3.2;
    return g;
  }

  setFly(type, size) {
    this.flyType = type;
    this.flyScale = { small: 0.8, medium: 1, large: 1.3 }[size] || 1;
  }

  resize(w, h) {
    this.lineMat.resolution.set(w, h);
  }

  // --- Commands --------------------------------------------------------------

  startCast(target, onLand) {
    this.mode = 'cast';
    this.castT = 0;
    this.target = target.clone();
    this.onLand = onLand;
    this.landed = false;
  }

  setDrift(fly, entry, belly) {
    this.mode = 'drift';
    this.flyPos.copy(fly);
    this.entry = entry;
    this.belly = belly;
  }

  setFight(fishPos, tension) {
    this.mode = 'fight';
    this.fishPos = fishPos;
    this.tension = tension;
  }

  idle() {
    this.mode = 'idle';
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

    // Rod angle and loading for each mode.
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
      targetAngle = 0.3;
    } else if (this.mode === 'fight') {
      // Rod held up and out to the side, so you can watch it load.
      targetAngle = 0.62;
      targetBend = clamp(0.15 + this.tension.value * 0.75, 0.15, 1.35);
    }
    if (this.mode !== 'cast') {
      // Springy rod movement.
      const acc = (targetAngle - this.angle) * 60 - this.angleVel * 10;
      this.angleVel += acc * dt;
      this.angle += this.angleVel * dt;
    }
    this.bend = lerp(this.bend, targetBend, Math.min(1, dt * (this.mode === 'fight' ? 10 : 5)));

    // Rod direction: towards the aim, raised by the rod angle; tilted slightly right.
    const side = new THREE.Vector3().crossVectors(this.aimDir, UP).normalize();
    this.sideTilt = lerp(this.sideTilt || 0.06, this.mode === 'fight' ? 0.45 : 0.06, Math.min(1, dt * 3));
    const dir = this.aimDir.clone().multiplyScalar(Math.cos(this.angle)).addScaledVector(UP, Math.sin(this.angle)).addScaledVector(side, this.sideTilt).normalize();

    // Where the line pulls the tip.
    if (this.mode === 'fight' && this.fishPos) pullTo.copy(this.fishPos);
    else if (this.mode === 'drift' && this.entry) pullTo.copy(this.entry);
    else pullTo.copy(this.base).addScaledVector(dir, ROD_LEN).add(new THREE.Vector3(0, -2, 0));
    this.rodDir = dir;
    this.buildRod(dir, pullTo, whip);

    // Handle and reel at the butt.
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
    // Rings of a tapered tube.
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

  updateLine(dt) {
    const tip = this.tip;
    const L = this.linePts;
    const tmp = new THREE.Vector3();
    const set = (i, v) => { L[i * 3] = v.x; L[i * 3 + 1] = v.y; L[i * 3 + 2] = v.z; };
    const fly = this.flies[this.flyType];
    for (const f of Object.values(this.flies)) f.visible = f === fly;
    let flyVisible = true;

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
        // Back cast: the line flies up and behind.
        const k = ease(clamp(t / 0.55, 0, 1));
        const start = tip.clone().add(new THREE.Vector3(0, -1.2, 0));
        fly = start.lerp(back, k);
        ctrl = tip.clone().lerp(fly, 0.5).add(new THREE.Vector3(0, 0.6 * k, 0));
      } else if (t < 1.65) {
        // Forward cast: a loop unrolls towards the target.
        const k = clamp((t - 0.65) / 1.0, 0, 1);
        const over = tip.clone().addScaledVector(this.aimDir, dist * 0.35).add(new THREE.Vector3(0, 2.6, 0));
        const above = T.clone().add(new THREE.Vector3(0, 0.5, 0));
        const e = ease(k);
        fly = bezier(back, over, above, e, new THREE.Vector3());
        const front = tip.clone().lerp(fly, 0.55);
        ctrl = front.add(new THREE.Vector3(0, 0.9 * (1 - e) + 0.25, 0));
      } else {
        // Settling onto the water.
        const k = clamp((t - 1.65) / 0.35, 0, 1);
        fly = T.clone().add(new THREE.Vector3(0, 0.5 * (1 - k), 0));
        ctrl = tip.clone().lerp(fly, 0.5).add(new THREE.Vector3(0, 0.25 * (1 - k) - 0.6 * k, 0));
        if (k >= 1 && !this.landed) {
          this.landed = true;
          this.onLand && this.onLand();
        }
      }
      for (let i = 0; i < LINE_PTS; i++) {
        const v = bezier(tip, ctrl, fly, i / (LINE_PTS - 1), tmp);
        if (v.y < 0.01) v.y = 0.01;
        set(i, v);
      }
      this.flyPos.copy(fly);
    } else if (this.mode === 'drift') {
      // Tip down to where the line meets the water, then a belly to the fly.
      const E = this.entry, F = this.flyPos;
      const half = Math.floor(LINE_PTS * 0.22);
      const c1 = tip.clone().lerp(E, 0.5).add(new THREE.Vector3(0, -0.3, 0));
      for (let i = 0; i <= half; i++) {
        const v = bezier(tip, c1, E, i / half, tmp);
        if (v.y < 0.012) v.y = 0.012;
        set(i, v);
      }
      const c2 = E.clone().lerp(F, 0.5).add(this.belly);
      for (let i = half + 1; i < LINE_PTS; i++) {
        const v = bezier(E, c2, F, (i - half) / (LINE_PTS - 1 - half), tmp);
        v.y = 0.012;
        set(i, v);
      }
    } else if (this.mode === 'fight' || this.mode === 'hooked') {
      const F = this.fishPos || this.flyPos;
      const sag = (1 - clamp(this.tension.value * 1.6, 0, 1)) * 1.2;
      const c = tip.clone().lerp(F, 0.5).add(new THREE.Vector3(0, -sag, 0));
      for (let i = 0; i < LINE_PTS; i++) {
        const v = bezier(tip, c, F, i / (LINE_PTS - 1), tmp);
        if (v.y < 0.012 && i < LINE_PTS - 4) v.y = 0.012;
        set(i, v);
      }
      flyVisible = false;
    } else if (this.mode === 'hidden') {
      for (let i = 0; i < LINE_PTS; i++) set(i, tip);
      flyVisible = false;
    }
    this.lineGeo.setPositions(L);
    fly.visible = flyVisible && !this.hideFly;
    fly.position.copy(this.flyPos);
    // Enlarge the fly with distance, the way your eye follows it on the water.
    const camDist = this.camera.position.distanceTo(this.flyPos);
    fly.scale.setScalar(fly.userData.base * this.flyScale * clamp(camDist / 7, 0.45, 1.6));
    if (this.mode === 'drift') {
      fly.position.y = 0.004 + Math.sin(this.time * 5) * 0.003 - (this.dip || 0);
      fly.rotation.y = Math.atan2(this.aimDir.x, this.aimDir.z);
    }
  }
}
