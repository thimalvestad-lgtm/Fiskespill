// Trout in the river: a simple 3D model and the behaviours the game needs
// (holding in a lie, rising, inspecting a fly, taking, fighting, bolting).
import * as THREE from 'three';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);

const PROFILE = [[0, 0], [0.02, 0.035], [0.06, 0.065], [0.15, 0.095], [0.3, 0.11], [0.5, 0.1], [0.68, 0.07], [0.82, 0.04], [0.92, 0.025], [1, 0.02]];
const COLORS = {
  brown: { back: '#1f1c12', flank: '#7d6534', belly: '#e9dcae' },
  rainbow: { back: '#1d2619', flank: '#9aa394', belly: '#f0efe8', band: '#c97d8c' },
};

function bodyGeometry(species) {
  const pts = PROFILE.map(([t, r]) => new THREE.Vector2(r, t));
  const g = new THREE.LatheGeometry(pts, 14);
  // Lathe runs along +y; lay it along -z (head forward) and flatten the sides.
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, -0.5);
  g.scale(0.68, 1, 1);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = COLORS[species];
  const back = new THREE.Color(c.back), flank = new THREE.Color(c.flank), belly = new THREE.Color(c.belly);
  const band = c.band ? new THREE.Color(c.band) : null;
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = clamp((y + 0.1) / 0.2, 0, 1);
    tmp.copy(belly).lerp(flank, Math.min(1, t * 1.6)).lerp(back, Math.max(0, (t - 0.55) / 0.45));
    if (band && Math.abs(y - 0.005) < 0.03) tmp.lerp(band, 0.6);
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function tailGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(0.16, 0.085);
  s.quadraticCurveTo(0.12, 0, 0.16, -0.085);
  s.lineTo(0, 0);
  const g = new THREE.ShapeGeometry(s);
  // Into the vertical plane, pointing backwards (+z).
  g.rotateY(-Math.PI / 2);
  return g;
}

function finGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(-0.05, 0.06);
  s.lineTo(0.06, 0.035);
  s.lineTo(0.08, 0);
  const g = new THREE.ShapeGeometry(s);
  g.rotateY(-Math.PI / 2);
  return g;
}

const geoCache = {};
const shadowGeo = new THREE.CircleGeometry(1, 16);
shadowGeo.rotateX(-Math.PI / 2);

let nextId = 1;

export class Fish {
  constructor(world, spot, { length, species, offset }) {
    this.id = nextId++;
    this.world = world;
    this.spot = spot;
    this.length = length; // cm
    this.species = species;
    this.weightG = Math.round(0.0115 * length ** 3 * (species === 'rainbow' ? 1.05 : 1));
    this.home = new THREE.Vector3(spot.w.x + offset.x, 0, spot.w.z + offset.z);
    const bed = -world.heightAt(this.home.x, this.home.z);
    this.depth = Math.max(0.25, bed);
    this.home.y = -Math.max(0.18, this.depth - 0.18);
    this.pos = this.home.clone();
    this.yaw = 0;
    this.state = 'hold';
    this.t = 0;
    this.phase = Math.random() * 10;
    this.vis = 0;
    this.spotted = false;
    this.hidden = false;
    this.returnAt = 0;
    this.nextRise = 5 + Math.random() * 20;
    this.wary = 0;

    const L = length / 100;
    if (!geoCache[species]) geoCache[species] = { body: bodyGeometry(species), tail: tailGeometry(), fin: finGeometry() };
    const geos = geoCache[species];
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.1, transparent: true, opacity: 0.5, depthWrite: false, emissive: new THREE.Color(species === 'brown' ? '#e6cf8a' : '#e9e6dc'), emissiveIntensity: 0 });
    this.flash = 0;
    this.nextFlash = 4 + Math.random() * 14;
    this.finMat = new THREE.MeshStandardMaterial({ color: species === 'brown' ? '#6d5a33' : '#6f7766', side: THREE.DoubleSide, transparent: true, opacity: 0.5, depthWrite: false });
    this.group = new THREE.Group();
    this.body = new THREE.Mesh(geos.body, this.mat);
    this.tail = new THREE.Mesh(geos.tail, this.finMat);
    this.tail.position.set(0, 0, 0.47);
    const dorsal = new THREE.Mesh(geos.fin, this.finMat);
    dorsal.position.set(0, 0.095, -0.08);
    this.group.add(this.body, this.tail, dorsal);
    this.group.scale.setScalar(L);
    this.shadowMat = new THREE.MeshBasicMaterial({ color: '#0b1410', transparent: true, opacity: 0.2, depthWrite: false });
    this.shadow = new THREE.Mesh(shadowGeo, this.shadowMat);
    this.shadow.scale.set(L * 0.09, 1, L * 0.42);
    world.scene.add(this.group, this.shadow);
    this.faceCurrent(true);
    this.place();
  }

  get kg() {
    return this.weightG / 1000;
  }

  dispose() {
    this.world.scene.remove(this.group, this.shadow);
    this.mat.dispose();
    this.finMat.dispose();
    this.shadowMat.dispose();
  }

  // Trout hold facing into the current.
  faceCurrent(instant) {
    const f = this.world.flowAt(this.pos.x, this.pos.z);
    const target = Math.atan2(f.vx, f.vz);
    this.turnTo(target, instant ? 1 : 0.05);
  }

  turnTo(target, k) {
    let d = target - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * k;
  }

  faceTowards(x, z, k) {
    // Mesh forward is -z, so a yaw of θ faces (-sin θ, -cos θ).
    this.turnTo(Math.atan2(-(x - this.pos.x), -(z - this.pos.z)), k);
  }

  place() {
    this.group.position.copy(this.pos);
    this.group.rotation.set(this.pitch || 0, this.yaw, this.roll || 0, 'YXZ');
    const bed = this.world.heightAt(this.pos.x, this.pos.z);
    this.shadow.position.set(this.pos.x + (this.world.sunDir ? -this.world.sunDir.x * 0.3 : 0), Math.min(bed + 0.03, -0.02), this.pos.z);
    this.shadow.rotation.y = this.yaw;
  }

  // --- Behaviours -------------------------------------------------------------

  rise(onSurface) {
    if (this.state !== 'hold') return;
    this.state = 'rise';
    this.t = 0;
    this.onSurface = onSurface;
  }

  approach(fly, surface, willTake, onDone) {
    this.state = 'approach';
    this.t = 0;
    this.fly = fly; // a Vector3 that keeps moving with the drift
    this.surface = surface;
    this.willTake = willTake;
    this.onDone = onDone;
    this.startPos = this.pos.clone();
  }

  spook(fromX, fromZ) {
    if (this.state === 'hooked' || this.hidden) return;
    this.state = 'spooked';
    this.t = 0;
    const dx = this.pos.x - fromX, dz = this.pos.z - fromZ;
    const len = Math.hypot(dx, dz) || 1;
    this.flee = new THREE.Vector3(dx / len, 0, dz / len);
  }

  hide(untilMinute) {
    this.hidden = true;
    this.returnAt = untilMinute;
    this.state = 'gone';
  }

  // Back from hiding: the fish swims in from downstream and settles into its lie.
  returnHome() {
    this.hidden = false;
    this.state = 'returning';
    this.fadeIn = 0;
    const f = this.world.flowAt(this.home.x, this.home.z);
    const sp = Math.hypot(f.vx, f.vz) || 1;
    this.pos.set(this.home.x + (f.vx / sp) * 2.5, this.home.y - 0.15, this.home.z + (f.vz / sp) * 2.5);
    if (!this.world.inWater(this.pos.x, this.pos.z)) this.pos.copy(this.home);
    this.pitch = 0;
    this.roll = 0;
    this.faceCurrent(true);
  }

  update(dt, ctx) {
    this.t += dt;
    const time = ctx.time;
    let tailSpeed = 7, tailAmp = 0.25;
    switch (this.state) {
      case 'hold': {
        // Holding steady with tiny drifts, and now and then a sideways dart
        // to grab a nymph: the flank flashes as the fish turns.
        this.nextFlash -= dt;
        if (this.nextFlash <= 0) {
          this.nextFlash = 6 + Math.random() * 16;
          this.flash = 1;
          this.dart = (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.25);
        }
        const sway = Math.sin(time * 0.6 + this.phase) * 0.12 + (this.dart || 0) * this.flash;
        const target = this.home.clone().add(new THREE.Vector3(sway, Math.sin(time * 0.4 + this.phase) * 0.04, Math.cos(time * 0.33 + this.phase) * 0.1));
        this.pos.lerp(target, Math.min(1, dt * 2));
        this.faceCurrent(false);
        this.pitch = lerp(this.pitch || 0, 0, dt * 3);
        break;
      }
      case 'rise': {
        const T = 1.9;
        const k = this.t / T;
        const up = k < 0.4 ? ease(k / 0.4) : k < 0.55 ? 1 : 1 - ease((k - 0.55) / 0.45);
        this.pos.y = lerp(this.home.y, -0.06, up);
        this.pitch = k < 0.4 ? 0.5 : k < 0.6 ? 0.1 : -0.3 * (1 - k);
        if (k >= 0.4 && !this.rose) {
          this.rose = true;
          this.onSurface && this.onSurface(this);
        }
        if (k >= 1) {
          this.state = 'hold';
          this.rose = false;
        }
        tailSpeed = 10;
        break;
      }
      case 'approach': {
        const T = this.surface ? 1.0 : 0.7;
        const k = Math.min(1, this.t / T);
        const tx = this.fly.x, tz = this.fly.z;
        const ty = this.surface ? -0.05 : Math.max(this.home.y, -0.55);
        const stopShort = this.willTake ? 0 : 0.28;
        const e = ease(k);
        this.pos.x = lerp(this.startPos.x, tx, e);
        this.pos.z = lerp(this.startPos.z, tz + stopShort, e);
        this.pos.y = lerp(this.startPos.y, ty - (this.willTake ? 0 : 0.12), e);
        this.faceTowards(tx, tz - 2, 0.15);
        this.pitch = this.surface ? 0.45 * (1 - k * 0.5) : 0.15;
        tailSpeed = 12;
        if (k >= 1) {
          const done = this.onDone;
          this.onDone = null;
          if (this.willTake) {
            this.state = 'taking';
            this.t = 0;
          } else {
            this.state = 'returning';
            this.t = 0;
          }
          done && done(this);
        }
        break;
      }
      case 'taking':
        // Hanging on to the fly while the angler reacts.
        this.pos.x = lerp(this.pos.x, this.fly.x, dt * 4);
        this.pos.z = lerp(this.pos.z, this.fly.z, dt * 4);
        this.pos.y = lerp(this.pos.y, this.surface ? -0.12 : this.pos.y, dt * 3);
        tailSpeed = 9;
        break;
      case 'returning': {
        this.pos.lerp(this.home, Math.min(1, dt * (this.fadeIn !== undefined && this.fadeIn < 1 ? 0.6 : 1.6)));
        this.faceCurrent(false);
        this.pitch = lerp(this.pitch || 0, -0.2, dt * 4);
        if (this.pos.distanceTo(this.home) < 0.05) this.state = 'hold';
        break;
      }
      case 'spooked': {
        const sp = 4.5 * (1 - Math.min(1, this.t / 1.6));
        this.pos.addScaledVector(this.flee, sp * dt);
        this.pos.y = lerp(this.pos.y, -this.depth * 0.9, dt * 2);
        this.faceTowards(this.pos.x + this.flee.x, this.pos.z + this.flee.z, 0.3);
        tailSpeed = 22;
        tailAmp = 0.45;
        if (this.t > 1.6) this.hide(ctx.minute + 40 + Math.random() * 40);
        break;
      }
      case 'hooked':
        tailSpeed = this.running ? 22 : 12;
        tailAmp = 0.4;
        break;
      case 'released': {
        // Swims off into deeper water and fades.
        const dir = new THREE.Vector3(this.home.x - this.pos.x, 0, this.home.z - this.pos.z);
        if (dir.length() > 0.1) dir.normalize();
        this.pos.addScaledVector(dir, dt * 1.6);
        this.pos.y = lerp(this.pos.y, this.home.y, dt * 1.5);
        this.faceTowards(this.home.x, this.home.z, 0.1);
        tailSpeed = 14;
        if (this.t > 2.5) this.hide(ctx.minute + 90);
        break;
      }
      case 'gone':
        if (ctx.minute >= this.returnAt) this.returnHome();
        break;
    }

    this.flash = Math.max(0, this.flash - dt * 1.4);
    this.mat.emissiveIntensity = this.flash * 0.9;
    this.roll = this.state === 'hold' ? this.flash * 0.7 * Math.sign(this.dart || 1) : this.roll;

    // Swimming motion.
    this.tail.rotation.y = Math.sin(time * tailSpeed + this.phase) * tailAmp;
    this.body.rotation.y = Math.sin(time * tailSpeed + this.phase + 1.2) * tailAmp * 0.12;
    this.place();

    // How visible is the fish? Fading in near the surface.
    const surfaceBoost = clamp(1 - (-this.pos.y) / 0.6, 0, 1);
    let opacity = this.hidden ? 0 : clamp(0.22 + this.vis * 0.8 + surfaceBoost * 0.5, 0, 0.97);
    if (this.state === 'spooked') opacity *= 1 - clamp((this.t - 0.8) / 0.8, 0, 1);
    if (this.fadeIn !== undefined && this.fadeIn < 1) {
      this.fadeIn = Math.min(1, this.fadeIn + dt / 2.5);
      opacity *= this.fadeIn;
    }
    if (this.state === 'released') opacity *= 1 - clamp((this.t - 1.5) / 1, 0, 1);
    this.mat.opacity = opacity;
    this.finMat.opacity = opacity * 0.8;
    this.group.visible = opacity > 0.01;
    this.shadowMat.opacity = this.hidden ? 0 : (0.12 + (ctx.sun ?? 0.5) * 0.35) * clamp(1 - this.depth * 0.25, 0.3, 1) * (this.pos.y > -0.02 ? 0 : 1);
  }

  // How easy this fish is to see from the bank right now, 0..1.
  computeVisibility(ctx) {
    if (this.hidden) return 0;
    const sec = this.spot.section;
    const surface = sec === 'riffle' ? 0.35 : sec === 'boulders' ? 0.6 : 1;
    const clarity = ctx.clarity === 'tinged' ? 0.45 : 1;
    const depth = Math.exp(-Math.max(0, -this.pos.y) * 0.75);
    const dist = clamp(1 - (ctx.distance - 8) / 30, 0.2, 1);
    const polar = ctx.polarized ? 1.35 : 0.75;
    return clamp(surface * clarity * ctx.light * depth * dist * 1.25 * polar + this.flash * 0.45, 0, 1);
  }
}
