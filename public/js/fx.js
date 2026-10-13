// Little things that make the river feel alive: rings, splashes, insects,
// rain, mist, and the aiming marker.
import * as THREE from 'three';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function softTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.soft = softTexture();

    // Rise rings.
    const ringGeo = new THREE.RingGeometry(0.9, 1, 40);
    ringGeo.rotateX(-Math.PI / 2);
    this.rings = [];
    for (let i = 0; i < 48; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#f4f8f4', transparent: true, opacity: 0, depthWrite: false }));
      m.visible = false;
      m.renderOrder = 11;
      scene.add(m);
      this.rings.push({ m, age: 0, life: 1, size: 1 });
    }

    // Splash droplets.
    this.dropN = 300;
    this.drops = Array.from({ length: this.dropN }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0 }));
    this.dropGeo = new THREE.BufferGeometry();
    this.dropGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.dropN * 3), 3));
    this.dropPts = new THREE.Points(this.dropGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 0.05, transparent: true, opacity: 0.85, map: this.soft, depthWrite: false }));
    this.dropPts.frustumCulled = false;
    this.dropPts.renderOrder = 12;
    scene.add(this.dropPts);

    // Hatching insects over the water.
    this.bugN = 220;
    this.bugs = Array.from({ length: this.bugN }, () => ({ p: new THREE.Vector3(), ph: Math.random() * 10, s: 0.5 + Math.random() }));
    this.bugGeo = new THREE.BufferGeometry();
    this.bugGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.bugN * 3), 3));
    this.bugMat = new THREE.PointsMaterial({ color: '#f6efd8', size: 0.045, transparent: true, opacity: 0, map: this.soft, depthWrite: false });
    this.bugPts = new THREE.Points(this.bugGeo, this.bugMat);
    this.bugPts.frustumCulled = false;
    scene.add(this.bugPts);
    this.bugAmount = 0;

    // Rain streaks around the camera.
    this.rainN = 500;
    const rp = new Float32Array(this.rainN * 6);
    this.rainGeo = new THREE.BufferGeometry();
    this.rainGeo.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.rainMat = new THREE.LineBasicMaterial({ color: '#d6e0e6', transparent: true, opacity: 0, depthWrite: false });
    this.rain = new THREE.LineSegments(this.rainGeo, this.rainMat);
    this.rain.frustumCulled = false;
    this.rainDrops = Array.from({ length: this.rainN }, () => new THREE.Vector3((Math.random() - 0.5) * 40, Math.random() * 14, (Math.random() - 0.5) * 40));
    scene.add(this.rain);
    this.rainOn = false;

    // Morning mist lying on the water.
    this.mist = [];
    for (let i = 0; i < 18; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.soft, color: '#eef1f2', transparent: true, opacity: 0, depthWrite: false, fog: true }));
      s.scale.set(18 + Math.random() * 14, 3 + Math.random() * 2, 1);
      s.userData = { x: (Math.random() - 0.5) * 30, z: -45 + Math.random() * 90, v: 0.2 + Math.random() * 0.4 };
      scene.add(s);
      this.mist.push(s);
    }
    this.mistAmount = 0;

    // Aim marker on the water.
    const aimGeo = new THREE.RingGeometry(0.32, 0.4, 40);
    aimGeo.rotateX(-Math.PI / 2);
    this.aim = new THREE.Mesh(aimGeo, new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.85, depthWrite: false }));
    this.aim.renderOrder = 13;
    this.aim.visible = false;
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.07, 16).rotateX(-Math.PI / 2), this.aim.material);
    this.aim.add(dot);
    this.hover = new THREE.Mesh(aimGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false }));
    this.hover.renderOrder = 13;
    this.hover.visible = false;
    scene.add(this.aim, this.hover);

    // Markers over fish you have spotted.
    const mGeo = new THREE.RingGeometry(0.2, 0.25, 6);
    mGeo.rotateX(-Math.PI / 2);
    this.markGeo = mGeo;
    this.marks = new Map();
    this.time = 0;
  }

  ring(x, z, size = 0.8, life = 2.2) {
    const r = this.rings.find((q) => !q.m.visible) || this.rings[0];
    r.m.visible = true;
    r.m.position.set(x, 0.015, z);
    r.age = 0;
    r.life = life;
    r.size = size;
    return r;
  }

  splash(x, y, z, count = 20, power = 1) {
    let n = 0;
    for (const d of this.drops) {
      if (d.life > 0) continue;
      d.p.set(x + (Math.random() - 0.5) * 0.1, y + 0.02, z + (Math.random() - 0.5) * 0.1);
      const a = Math.random() * Math.PI * 2;
      const s = (0.4 + Math.random() * 1.1) * power;
      d.v.set(Math.cos(a) * s * 0.6, (1.2 + Math.random() * 1.8) * power, Math.sin(a) * s * 0.6);
      d.life = 1.2;
      if (++n >= count) break;
    }
  }

  setAim(p) {
    if (!p) { this.aim.visible = false; return; }
    this.aim.visible = true;
    this.aim.position.set(p.x, 0.02, p.z);
  }

  setHover(p) {
    if (!p) { this.hover.visible = false; return; }
    this.hover.visible = true;
    this.hover.position.set(p.x, 0.02, p.z);
  }

  mark(fish) {
    if (this.marks.has(fish.id)) return;
    const m = new THREE.Mesh(this.markGeo, new THREE.MeshBasicMaterial({ color: '#ffe3a1', transparent: true, opacity: 0.0, depthWrite: false }));
    m.renderOrder = 13;
    this.scene.add(m);
    this.marks.set(fish.id, { m, fish, age: 0 });
  }

  clearMarks() {
    for (const { m } of this.marks.values()) {
      this.scene.remove(m);
      m.material.dispose();
    }
    this.marks.clear();
  }

  update(dt, camPos, { hatch, rain, mist, minute }) {
    this.time += dt;
    const t = this.time;
    for (const r of this.rings) {
      if (!r.m.visible) continue;
      r.age += dt;
      const k = r.age / r.life;
      if (k >= 1) { r.m.visible = false; continue; }
      const s = 0.05 + Math.pow(k, 0.55) * r.size;
      r.m.scale.set(s, 1, s);
      r.m.material.opacity = (1 - k) * 0.55;
    }

    // Droplets.
    const dp = this.dropGeo.attributes.position;
    for (let i = 0; i < this.dropN; i++) {
      const d = this.drops[i];
      if (d.life > 0) {
        d.life -= dt;
        d.v.y -= 9.8 * dt;
        d.p.addScaledVector(d.v, dt);
        if (d.p.y < 0) d.life = 0;
        dp.setXYZ(i, d.p.x, d.p.y, d.p.z);
      } else dp.setXYZ(i, 0, -50, 0);
    }
    dp.needsUpdate = true;

    // Insects drifting and fluttering near you.
    this.bugAmount += ((hatch ? 1 : 0) - this.bugAmount) * Math.min(1, dt * 0.5);
    this.bugMat.opacity = this.bugAmount * 0.9;
    this.bugPts.visible = this.bugAmount > 0.02;
    if (this.bugPts.visible) {
      const bp = this.bugGeo.attributes.position;
      for (let i = 0; i < this.bugN; i++) {
        const b = this.bugs[i];
        if (b.p.lengthSq() === 0 || b.p.distanceTo(camPos) > 32) {
          b.p.set(camPos.x + (Math.random() - 0.5) * 50, 0.2 + Math.random() * 2.5, camPos.z + (Math.random() - 0.5) * 50);
        }
        b.p.x += Math.sin(t * 1.3 + b.ph) * dt * 0.4;
        b.p.y += Math.sin(t * 2.1 + b.ph * 2) * dt * 0.35 + dt * 0.05;
        b.p.z += (0.25 + Math.cos(t * 0.9 + b.ph) * 0.3) * dt;
        if (b.p.y > 3.5) b.p.y = 0.15;
        bp.setXYZ(i, b.p.x, b.p.y, b.p.z);
      }
      bp.needsUpdate = true;
      this.bugMat.color.set(minute > 1200 ? '#ffe9a8' : '#f6efd8');
    }

    // Rain.
    this.rainMat.opacity += ((rain ? 0.35 : 0) - this.rainMat.opacity) * Math.min(1, dt);
    this.rain.visible = this.rainMat.opacity > 0.01;
    if (this.rain.visible) {
      const rp = this.rainGeo.attributes.position;
      for (let i = 0; i < this.rainN; i++) {
        const d = this.rainDrops[i];
        d.y -= dt * 9;
        if (d.y < 0) {
          d.set((Math.random() - 0.5) * 40, 12 + Math.random() * 3, (Math.random() - 0.5) * 40);
          if (Math.random() < 0.15) this.ring(camPos.x + d.x * 0.6, camPos.z + d.z * 0.6, 0.12, 0.5);
        }
        rp.setXYZ(i * 2, camPos.x + d.x, d.y, camPos.z + d.z);
        rp.setXYZ(i * 2 + 1, camPos.x + d.x - 0.03, d.y + 0.35, camPos.z + d.z);
      }
      rp.needsUpdate = true;
    }

    // Mist.
    this.mistAmount += (mist - this.mistAmount) * Math.min(1, dt * 0.3);
    for (const s of this.mist) {
      s.userData.x += s.userData.v * dt;
      if (s.userData.x > 25) s.userData.x = -25;
      s.position.set(s.userData.x, 0.9 + Math.sin(t * 0.2 + s.userData.z) * 0.2, s.userData.z);
      s.material.opacity = this.mistAmount * 0.35;
      s.visible = this.mistAmount > 0.02;
    }

    // Aim marker pulse.
    if (this.aim.visible) {
      const s = 1 + Math.sin(t * 4) * 0.08;
      this.aim.scale.set(s, 1, s);
    }

    // Spotted fish markers float above their fish.
    for (const mk of this.marks.values()) {
      const f = mk.fish;
      mk.age += dt;
      const show = !f.hidden && f.state !== 'hooked' && f.state !== 'released';
      mk.m.visible = show;
      mk.m.position.set(f.pos.x, 0.03, f.pos.z);
      mk.m.rotation.y = t * 0.3;
      mk.m.material.opacity = clamp(mk.age, 0, 1) * (0.3 + Math.sin(t * 2 + f.id) * 0.08);
    }
  }
}
