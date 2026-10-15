// Life along the river: songbirds in the trees, a dipper on the rocks,
// swallows over the water, the odd passing flock, and a deer on the far bank.
import * as THREE from 'three';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const mat = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });

const PALETTES = {
  chaffinch: { back: '#7a6a5a', belly: '#d08a6a', head: '#6f8296', wing: '#3d3a36' },
  wagtail: { back: '#4a4a4a', belly: '#f2f2ee', head: '#1e1e1e', wing: '#2a2a2a' },
  tit: { back: '#7d8a4a', belly: '#e8cf4a', head: '#1d2a44', wing: '#6a86a8' },
  dipper: { back: '#3a2c24', belly: '#f4f1ea', head: '#5a3a28', wing: '#2e2420' },
  swallow: { back: '#1e2a4a', belly: '#efe6dc', head: '#8a2a20', wing: '#1a2238' },
};

function makeBird(kind, scale = 1) {
  const c = PALETTES[kind];
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), mat(c.back));
  body.scale.set(0.85, 0.8, 1.35);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), mat(c.belly));
  belly.scale.set(0.8, 0.7, 1.1);
  belly.position.set(0, -0.012, -0.008);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), mat(c.head));
  head.position.set(0, 0.03, -0.05);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.026, 5), mat('#2b2420'));
  beak.rotation.x = -Math.PI / 2;
  beak.position.set(0, 0.028, -0.082);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, kind === 'swallow' || kind === 'wagtail' ? 0.09 : 0.055), mat(c.wing));
  tail.position.set(0, 0.008, 0.07);
  tail.rotation.x = -0.25;
  const wingGeo = new THREE.BoxGeometry(kind === 'swallow' ? 0.13 : 0.085, 0.006, 0.045);
  wingGeo.translate(kind === 'swallow' ? 0.065 : 0.043, 0, 0);
  const wl = new THREE.Mesh(wingGeo, mat(c.wing));
  const wr = new THREE.Mesh(wingGeo, mat(c.wing));
  wl.position.set(0.02, 0.012, 0);
  wr.position.set(-0.02, 0.012, 0);
  wr.rotation.y = Math.PI;
  g.add(body, belly, head, beak, tail, wl, wr);
  g.userData = { head, wl, wr };
  g.scale.setScalar(scale);
  return g;
}

function makeDeer() {
  const g = new THREE.Group();
  const coat = mat('#8a5a34'), dark = mat('#4a3020'), light = mat('#e8dcc4');
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.62, 4, 10), coat);
  body.rotation.x = Math.PI / 2;
  body.position.y = 0.95;
  const rump = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), light);
  rump.position.set(0, 0.98, 0.45);
  const neckPivot = new THREE.Group();
  neckPivot.position.set(0, 1.08, -0.38);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.5, 8), coat);
  neck.position.set(0, 0.2, -0.06);
  neck.rotation.x = -0.35;
  const head = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.2, 4, 8), coat);
  head.rotation.x = Math.PI / 2 - 0.3;
  head.position.set(0, 0.46, -0.2);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), dark);
  nose.position.set(0, 0.4, -0.35);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.13, 5), coat);
    ear.position.set(s * 0.07, 0.58, -0.14);
    ear.rotation.z = -s * 0.6;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 5, 4), dark);
    eye.position.set(s * 0.06, 0.5, -0.27);
    neckPivot.add(ear, eye);
  }
  neckPivot.add(neck, head, nose);
  const legs = [];
  for (const [x, z] of [[-0.12, -0.32], [0.12, -0.32], [-0.12, 0.34], [0.12, 0.34]]) {
    const hip = new THREE.Group();
    hip.position.set(x, 0.85, z);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.025, 0.85, 6), coat);
    leg.position.y = -0.42;
    const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.06, 6), dark);
    hoof.position.y = -0.84;
    hip.add(leg, hoof);
    legs.push(hip);
    g.add(hip);
  }
  const tailM = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 5), light);
  tailM.position.set(0, 1.02, 0.56);
  tailM.rotation.x = 0.6;
  g.add(body, rump, neckPivot, tailM);
  g.userData = { neck: neckPivot, legs };
  return g;
}

export class Wildlife {
  constructor(world, audio) {
    this.world = world;
    this.audio = audio;
    this.scene = world.scene;
    this.time = 0;
    this.perched = [];
    this.flyers = [];
    this.flock = null;
    this.flockT = rand(40, 90);
    this.deer = null;
    this.deerT = rand(25, 60);

    // Songbirds in the trees nearest the river.
    const trees = (world.treeSpots || []).filter((t) => {
      const { cx, hw } = world.channel(t.z);
      return Math.abs(t.x - cx) - hw < 16;
    });
    this.perches = trees.map((t) => {
      const { cx } = world.channel(t.z);
      const toRiver = Math.sign(cx - t.x);
      // A branch on the river side of the tree.
      return new THREE.Vector3(t.x + toRiver * t.h * (t.conifer ? 0.12 : 0.28), t.y + t.h * (t.conifer ? 0.45 : 0.6), t.z);
    });
    const kinds = ['chaffinch', 'wagtail', 'tit', 'chaffinch', 'tit', 'chaffinch', 'wagtail', 'tit', 'chaffinch', 'tit'];
    for (let i = 0; i < Math.min(10, this.perches.length); i++) {
      const b = makeBird(kinds[i], 1.6);
      const perch = this.perches[Math.floor(Math.random() * this.perches.length)];
      b.position.copy(perch);
      this.scene.add(b);
      this.perched.push({ mesh: b, state: 'sit', perch, t: rand(2, 10), look: 0, flap: 0 });
    }

    // Dippers bobbing on midstream rocks.
    for (const r of world.rocks.filter((r) => r.r > 0.5).slice(0, 3)) {
      const b = makeBird('dipper', 1.5);
      b.position.set(r.x + rand(-0.2, 0.2), r.r * 0.55, r.z + rand(-0.2, 0.2));
      b.rotation.y = rand(0, 6);
      this.scene.add(b);
      this.perched.push({ mesh: b, state: 'dipper', perch: b.position.clone(), t: rand(1, 4), look: 0, flap: 0, dipper: true });
    }

    // Swallows hawking insects low over the water.
    for (let i = 0; i < 3; i++) {
      const b = makeBird('swallow', 1.4);
      this.scene.add(b);
      this.flyers.push({ mesh: b, ph: rand(0, 6), r: rand(6, 14), h: rand(0.6, 2.2), sp: rand(0.35, 0.6), c: null });
    }
  }

  update(dt, camera, ctx) {
    this.time += dt;
    const t = this.time;
    const cam = camera.position;
    const quiet = ctx.rain > 0.4 ? 0.3 : ctx.part === 'midday' || ctx.part === 'afternoon' ? 0.6 : 1;

    // --- Perched birds and dippers.
    for (const b of this.perched) {
      const m = b.mesh, u = m.userData;
      b.t -= dt;
      if (b.state === 'sit' || b.state === 'dipper') {
        // Look around, flick wings, sing now and then.
        if (Math.random() < dt * 0.8) b.look = rand(-1.2, 1.2);
        u.head.rotation.y = lerp(u.head.rotation.y, b.look, dt * 6);
        u.wl.rotation.z = u.wr.rotation.z = 0.05;
        if (b.dipper) {
          // The dipper's famous bobbing.
          m.position.y = b.perch.y + Math.max(0, Math.sin(t * 9 + b.perch.x)) * 0.03;
        }
        if (b.t <= 0) {
          const d = m.position.distanceTo(cam);
          if (Math.random() < 0.55 * quiet && d < 45) {
            const right = new THREE.Vector3(Math.cos(camera.rotation.y), 0, -Math.sin(camera.rotation.y));
            const pan = clamp(right.dot(m.position.clone().sub(cam).normalize()), -0.9, 0.9);
            this.audio.birdAt(pan, clamp(1.6 - d / 30, 0.3, 1.4));
            m.position.y += 0.02;
          }
          if (!b.dipper && Math.random() < 0.3) this.takeOff(b);
          b.t = rand(4, 12) / quiet;
        }
      } else if (b.state === 'fly') {
        b.f += dt / b.dur;
        const k = clamp(b.f, 0, 1);
        const p = b.from.clone().lerp(b.to, k);
        p.y += Math.sin(k * Math.PI) * b.arc;
        m.lookAt(p.x + (b.to.x - b.from.x), m.position.y, p.z + (b.to.z - b.from.z));
        m.rotateY(Math.PI);
        m.position.copy(p);
        const flap = Math.sin(t * 38) * 0.9;
        u.wl.rotation.z = flap;
        u.wr.rotation.z = flap;
        if (k >= 1) {
          b.state = 'sit';
          b.perch = b.to;
          b.t = rand(5, 14);
          u.wl.rotation.z = u.wr.rotation.z = 0.05;
        }
      }
    }

    // --- Swallows sweeping over the water near you.
    for (const s of this.flyers) {
      if (!s.c || s.c.distanceTo(cam) > 30) {
        const { cx } = this.world.channel(cam.z);
        s.c = new THREE.Vector3(lerp(cam.x, cx, 0.7), 0, cam.z + rand(-10, 4));
      }
      s.ph += dt * s.sp;
      const a = s.ph * 2;
      const x = s.c.x + Math.sin(a) * s.r, z = s.c.z + Math.sin(a * 2) * s.r * 0.45;
      const y = s.h + Math.sin(a * 3) * 0.4;
      const nx = s.c.x + Math.sin(a + 0.05) * s.r, nz = s.c.z + Math.sin((a + 0.05) * 2) * s.r * 0.45;
      s.mesh.position.set(x, y, z);
      s.mesh.lookAt(nx, y, nz);
      s.mesh.rotateY(Math.PI);
      s.mesh.rotation.z = Math.cos(a) * 0.5;
      const flap = Math.sin(t * 30 + s.ph * 10) * 0.8 * (Math.sin(t * 1.3 + s.ph) > 0 ? 1 : 0.15);
      s.mesh.userData.wl.rotation.z = flap;
      s.mesh.userData.wr.rotation.z = flap;
      s.mesh.visible = ctx.rain < 0.6;
    }

    // --- An occasional flock crossing high overhead.
    this.flockT -= dt;
    if (!this.flock && this.flockT <= 0) this.startFlock(cam);
    if (this.flock) {
      const f = this.flock;
      f.t += dt;
      f.birds.forEach((b, i) => {
        b.position.copy(f.start).addScaledVector(f.dir, f.t * 9).add(f.offsets[i]);
        const flap = Math.sin(t * 16 + i) * 0.7;
        b.userData.wl.rotation.z = flap;
        b.userData.wr.rotation.z = flap;
      });
      if (f.t > 22) {
        f.birds.forEach((b) => this.scene.remove(b));
        this.flock = null;
        this.flockT = rand(70, 160);
      }
    }

    // --- A deer wandering along the far bank.
    this.deerT -= dt;
    if (!this.deer && this.deerT <= 0) this.startDeer(cam, ctx);
    if (this.deer) this.updateDeer(dt);
  }

  takeOff(b) {
    const near = this.perches.filter((p) => p.distanceTo(b.perch) < 30 && p !== b.perch);
    if (!near.length) return;
    b.state = 'fly';
    b.from = b.mesh.position.clone();
    b.to = near[Math.floor(Math.random() * near.length)];
    b.f = 0;
    b.dur = clamp(b.from.distanceTo(b.to) / 7, 1, 4);
    b.arc = rand(0.5, 2);
  }

  startFlock(cam) {
    const dir = new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1)).normalize();
    const start = cam.clone().addScaledVector(dir, -90).setY(rand(18, 30));
    const birds = [], offsets = [];
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    for (let i = 0; i < 7; i++) {
      const b = makeBird('wagtail', 3);
      const row = Math.ceil(i / 2), s = i % 2 ? 1 : -1;
      offsets.push(side.clone().multiplyScalar(s * row * 1.6).addScaledVector(dir, -row * 1.4));
      this.scene.add(b);
      b.lookAt(start.clone().add(dir));
      b.rotateY(Math.PI);
      birds.push(b);
    }
    this.flock = { birds, offsets, dir, start, t: 0 };
  }

  // The deer walks along the bank across the river from you, stops to drink,
  // and wanders off again.
  startDeer(cam, ctx) {
    const w = this.world;
    const { cx, hw } = w.channel(cam.z);
    const side = cam.x < cx ? 1 : -1; // the far bank
    const zs = cam.z - 34, ze = cam.z + 34;
    const path = [];
    for (let i = 0; i <= 20; i++) {
      const z = lerp(zs, ze, i / 20);
      const c = w.channel(z);
      path.push(new THREE.Vector3(c.cx + side * (c.hw + 3.5 + Math.sin(i) * 0.8), 0, z));
    }
    if (Math.random() < 0.5) path.reverse();
    const mesh = makeDeer();
    this.scene.add(mesh);
    this.deer = { mesh, path, i: 0, k: 0, state: 'walk', t: 0, drinkAt: Math.floor(rand(7, 13)), side, drank: false };
    this.deerT = rand(160, 320) * (ctx.part === 'dawn' || ctx.part === 'dusk' || ctx.part === 'evening' ? 0.6 : 1.3);
  }

  updateDeer(dt) {
    const d = this.deer;
    const m = d.mesh, u = m.userData, w = this.world;
    d.t += dt;
    let moving = false;
    if (d.state === 'walk') {
      const a = d.path[d.i], b = d.path[d.i + 1];
      if (!b) {
        this.scene.remove(m);
        this.deer = null;
        return;
      }
      const seg = a.distanceTo(b);
      d.k += (dt * 0.9) / seg;
      if (d.k >= 1) {
        d.k = 0;
        d.i++;
        if (d.i === d.drinkAt && !d.drank) {
          d.state = 'toWater';
          d.from = m.position.clone();
          const c = w.channel(m.position.z);
          d.water = new THREE.Vector3(c.cx + d.side * (c.hw + 0.4), 0, m.position.z);
          d.f = 0;
        }
      }
      const p = a.clone().lerp(b, d.k);
      p.y = w.heightAt(p.x, p.z);
      m.position.copy(p);
      m.rotation.y = Math.atan2(-(b.x - a.x), -(b.z - a.z));
      u.neck.rotation.x = lerp(u.neck.rotation.x, Math.sin(d.t * 0.7) * 0.15, dt * 2);
      moving = true;
    } else if (d.state === 'toWater' || d.state === 'fromWater') {
      d.f += dt * 0.5;
      const k = clamp(d.f, 0, 1);
      const [from, to] = d.state === 'toWater' ? [d.from, d.water] : [d.water, d.from];
      const p = from.clone().lerp(to, k);
      p.y = w.heightAt(p.x, p.z);
      m.position.copy(p);
      m.rotation.y = Math.atan2(-(to.x - from.x), -(to.z - from.z));
      moving = true;
      if (k >= 1) {
        if (d.state === 'toWater') { d.state = 'drink'; d.t = 0; }
        else { d.state = 'walk'; d.drank = true; }
      }
    } else if (d.state === 'drink') {
      // Head down to the water, the occasional look up.
      const up = Math.sin(d.t * 0.8) > 0.85;
      u.neck.rotation.x = lerp(u.neck.rotation.x, up ? 0 : 1.15, dt * 2.5);
      if (d.t > 9) { d.state = 'fromWater'; d.f = 0; }
    }
    u.legs.forEach((leg, i) => {
      leg.rotation.x = moving ? Math.sin(d.t * 5.5 + (i % 2 ? 0 : Math.PI) + (i > 1 ? Math.PI / 2 : 0)) * 0.45 : lerp(leg.rotation.x, 0, dt * 4);
    });
  }
}
