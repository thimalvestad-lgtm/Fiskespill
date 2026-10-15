// The 3D river: terrain, water, rocks, trees, sky and light.
// World units are metres. Map units from river.json are 0.1 m, with the map
// centre at the origin. Water flows towards +z, and the surface is at y = 0.
import * as THREE from 'three';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function hash(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
export function noise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
function fbm(x, z) {
  return noise(x, z) * 0.5 + noise(x * 2.1, z * 2.1) * 0.3 + noise(x * 4.3, z * 4.3) * 0.2;
}

// Keyframes along the river (map y): typical depth and current speed.
const DEPTH = [[-400, 0.35], [0, 0.35], [240, 0.4], [262, 0.8], [300, 1.2], [330, 0.85], [420, 0.9], [520, 0.85], [570, 1.2], [610, 1.9], [680, 1.5], [780, 1.1], [850, 0.6], [900, 0.45], [1300, 0.4]];
const SPEED = [[-400, 1.2], [240, 1.3], [300, 1.0], [560, 0.9], [600, 0.8], [650, 0.45], [800, 0.3], [870, 0.45], [930, 0.95], [1300, 1.0]];
function curve(keys, y) {
  if (y <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [y0, v0] = keys[i], [y1, v1] = keys[i + 1];
    if (y <= y1) return lerp(v0, v1, smooth(0, 1, (y - y0) / (y1 - y0)));
  }
  return keys[keys.length - 1][1];
}

// Sky colours through the day: [minute, top, horizon, sun colour, sun strength].
const SKY = [
  [300, '#1d2846', '#4a4f6e', '#ff9c6a', 0.1],
  [360, '#4f6a96', '#e8a989', '#ffb48a', 0.6],
  [450, '#6d93c4', '#d9d6c6', '#ffe2bf', 1.0],
  [660, '#5d8fd0', '#cfe0ea', '#fff6e8', 1.25],
  [960, '#6493cc', '#d6e0e0', '#fff0d8', 1.15],
  [1110, '#5f7fb4', '#f0c897', '#ffc887', 0.95],
  [1230, '#4a5a8c', '#e89a78', '#ff9a63', 0.5],
  [1320, '#1c2442', '#3d3f5e', '#c46a50', 0.12],
];

export class World {
  constructor(data) {
    this.data = data;
    this.river = data.river;
    this.scene = new THREE.Scene();
    this.time = 0;
    this.rocks = this.river.rocks.map((r) => ({ ...this.m2w(r.x, r.y), r: r.r * 0.1 * 1.15, mr: r }));
    this.spots = this.river.spots.map((s) => ({ ...s, w: this.m2w(s.x, s.y), depthM: parseFloat(s.depth) }));
    this.eddy = this.spots.find((s) => s.id === 'foam-eddy');
    this.undercut = this.spots.find((s) => s.type === 'bank');

    this.scene.fog = new THREE.Fog('#cfe0ea', 60, 240);
    this.buildLights();
    this.buildSky();
    this.buildTerrain();
    this.buildWater();
    this.buildRocks();
    this.buildTrees();
    this.buildGrass();
    this.buildHills();
  }

  // --- Coordinates & river shape ------------------------------------------------

  m2w(mx, my) {
    return { x: (mx - 300) * 0.1, z: (my - 450) * 0.1 };
  }
  w2m(x, z) {
    return { x: x * 10 + 300, y: z * 10 + 450 };
  }

  channel(z) {
    const my = z * 10 + 450;
    const pts = this.river.channel;
    let p;
    if (my <= pts[0].y) p = { x: pts[0].x, w: pts[0].w };
    else if (my >= pts[pts.length - 1].y) p = { x: pts[pts.length - 1].x, w: pts[pts.length - 1].w };
    else {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        if (my <= b.y) {
          const s = smooth(0, 1, (my - a.y) / (b.y - a.y));
          p = { x: lerp(a.x, b.x, s), w: lerp(a.w, b.w, s) };
          break;
        }
      }
    }
    const wob = Math.sin(z * 0.5) * 0.3 + Math.sin(z * 0.13) * 0.5;
    return { cx: (p.x - 300) * 0.1 + wob * 0.2, hw: (p.w * 0.1) / 2 + wob * 0.15 };
  }

  bedDepth(x, z) {
    const my = z * 10 + 450;
    let d = curve(DEPTH, my);
    for (const s of this.spots) {
      const dist2 = (x - s.w.x) ** 2 + (z - s.w.z) ** 2;
      d = Math.max(d, s.depthM * 1.1 * Math.exp(-dist2 / 8));
    }
    return d;
  }

  heightAt(x, z) {
    const { cx, hw } = this.channel(z);
    const sd = (x - cx) / hw;
    const ad = Math.abs(sd);
    const n = fbm(x * 0.18, z * 0.18);
    if (ad < 1) {
      let prof = Math.pow(1 - ad * ad, 0.55);
      // The undercut bank: deep right up to the grass.
      if (this.undercut && sd > 0) {
        const u = Math.exp(-((z - this.undercut.w.z) ** 2) / 16);
        prof = lerp(prof, Math.pow(1 - Math.pow(ad, 6), 0.5), u);
      }
      return -this.bedDepth(x, z) * prof + 0.1 + (n - 0.5) * 0.12;
    }
    const e = (ad - 1) * hw;
    let h = 0.1 + smooth(0, 2.5, e) * 0.7 + (n - 0.5) * 0.3 * smooth(0, 3, e);
    h += smooth(10, 70, e) * 9 * (0.4 + n);
    if (this.undercut && sd > 0) h += 0.35 * Math.exp(-((z - this.undercut.w.z) ** 2) / 20) * smooth(0, 0.6, e);
    return h;
  }

  inWater(x, z) {
    return this.heightAt(x, z) < -0.04;
  }

  // Current at a point: a direction along the channel and a speed in m/s.
  flowAt(x, z) {
    const my = z * 10 + 450;
    const { cx, hw } = this.channel(z);
    const ad = Math.min(1, Math.abs(x - cx) / hw);
    let speed = curve(SPEED, my) * (1 - 0.65 * ad * ad);
    for (const r of this.rocks) {
      const dx = x - r.x, dz = z - r.z;
      if (Math.abs(dx) < r.r * 1.15 && dz > -r.r * 0.4 && dz < r.r * 4) speed *= 0.15 + 0.85 * smooth(r.r * 0.8, r.r * 4, dz);
    }
    const ahead = this.channel(z + 1).cx - cx;
    let vx = ahead, vz = 1;
    const len = Math.hypot(vx, vz);
    vx /= len; vz /= len;
    // The back-eddy turns slowly the wrong way.
    if (this.eddy) {
      const ex = x - this.eddy.w.x, ez = z - this.eddy.w.z;
      const de = Math.hypot(ex, ez);
      if (de < 4) {
        const k = 1 - smooth(2.5, 4, de);
        const tx = -ez / (de || 1), tz = ex / (de || 1);
        vx = lerp(vx, tx, k); vz = lerp(vz, tz, k);
        speed = lerp(speed, 0.22, k);
      }
    }
    return { vx: vx * speed, vz: vz * speed, speed };
  }

  foamAt(x, z) {
    const my = z * 10 + 450;
    let f = my < 290 ? 0.35 + 0.25 * noise(x * 0.8, z * 0.3) : my < 560 ? 0.12 : 0.02;
    if (my > 575 && my < 650) {
      const { cx } = this.channel(z);
      f = Math.max(f, 0.35 * (1 - smooth(1, 3.5, Math.abs(x - cx))) * (1 - smooth(600, 650, my)));
    }
    for (const r of this.rocks) {
      const d = Math.hypot(x - r.x, (z - r.z) * 0.8) - r.r;
      if (d < 0.7) f = Math.max(f, 0.9 * (1 - d / 0.7) * clamp(curve(SPEED, r.mr.y), 0.3, 1));
      const dz = z - r.z;
      if (dz > 0 && dz < r.r * 5 && Math.abs(Math.abs(x - r.x) - r.r * (0.9 + dz * 0.05)) < 0.25) f = Math.max(f, 0.45 * (1 - dz / (r.r * 5)));
    }
    if (this.eddy) {
      const de = Math.hypot(x - this.eddy.w.x, z - this.eddy.w.z);
      if (de < 3) f = Math.max(f, 0.45 * (1 - de / 3));
    }
    return clamp(f, 0, 1);
  }

  // --- Building ----------------------------------------------------------------

  buildLights() {
    this.hemi = new THREE.HemisphereLight('#cfe0ff', '#4a5a35', 0.9);
    this.sun = new THREE.DirectionalLight('#fff6e8', 1.4);
    this.sun.position.set(30, 60, -20);
    this.scene.add(this.hemi, this.sun);
  }

  buildSky() {
    this.skyUniforms = {
      uTop: { value: new THREE.Color('#5d8fd0') },
      uHorizon: { value: new THREE.Color('#cfe0ea') },
      uSunDir: { value: new THREE.Vector3(0.3, 0.6, -0.4).normalize() },
      uSunColor: { value: new THREE.Color('#fff6e8') },
      uSun: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: this.skyUniforms,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 uTop, uHorizon, uSunColor, uSunDir; uniform float uSun; varying vec3 vDir;
        void main(){
          float h = clamp(vDir.y, -0.2, 1.0);
          vec3 c = mix(uHorizon, uTop, pow(max(h, 0.0), 0.55));
          float s = max(dot(normalize(vDir), uSunDir), 0.0);
          c += uSunColor * (pow(s, 600.0) * 3.0 + pow(s, 12.0) * 0.25) * uSun;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), mat);
    this.scene.add(this.sky);
  }

  buildTerrain() {
    const W = 150, D = 170, SX = 220, SZ = 250;
    const geo = new THREE.PlaneGeometry(W, D, SX, SZ);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const bedA = new THREE.Color('#a39678'), bedB = new THREE.Color('#79745d'), bedDeep = new THREE.Color('#4d5a4a');
    const grav = new THREE.Color('#a39a84'), gravB = new THREE.Color('#7f7a6b');
    const grassA = new THREE.Color('#4d6b37'), grassB = new THREE.Color('#6f8b45'), hill = new THREE.Color('#3b5233');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = this.heightAt(x, z);
      pos.setY(i, h);
      const n = noise(x * 0.7, z * 0.7);
      const n2 = noise(x * 0.09 + 5, z * 0.09);
      const { cx, hw } = this.channel(z);
      const e = (Math.abs(x - cx) / hw - 1) * hw;
      if (h < 0.0) {
        c.copy(bedA).lerp(bedB, n * 0.8).lerp(bedDeep, smooth(0.5, 2.2, -h) * 0.7);
      } else if (e < 1.6 + n2 * 1.5 && h < 0.7) {
        c.copy(grav).lerp(gravB, n * 0.8);
      } else {
        c.copy(grassA).lerp(grassB, n2 * 0.8 + n * 0.2).lerp(hill, smooth(15, 60, e));
      }
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    this.terrain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.scene.add(this.terrain);
  }

  buildWater() {
    const rows = [], COLS = 30;
    for (let z = -85; z <= 85; z += 0.5) rows.push(z);
    const n = rows.length * (COLS + 1);
    const pos = new Float32Array(n * 3), spd = new Float32Array(n), dep = new Float32Array(n), foam = new Float32Array(n), dir = new Float32Array(n * 2);
    let k = 0;
    for (const z of rows) {
      const { cx, hw } = this.channel(z);
      for (let j = 0; j <= COLS; j++) {
        const x = cx + (j / COLS * 2 - 1) * hw * 1.12;
        pos[k * 3] = x; pos[k * 3 + 1] = 0; pos[k * 3 + 2] = z;
        const f = this.flowAt(x, z);
        spd[k] = f.speed;
        dir[k * 2] = f.speed > 0.001 ? f.vx / f.speed : 0;
        dir[k * 2 + 1] = f.speed > 0.001 ? f.vz / f.speed : 1;
        dep[k] = Math.max(0, -this.heightAt(x, z));
        foam[k] = this.foamAt(x, z);
        k++;
      }
    }
    const idx = [];
    for (let r = 0; r < rows.length - 1; r++) {
      for (let j = 0; j < COLS; j++) {
        const a = r * (COLS + 1) + j, b = a + 1, c = a + COLS + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(spd, 1));
    geo.setAttribute('aDepth', new THREE.BufferAttribute(dep, 1));
    geo.setAttribute('aFoam', new THREE.BufferAttribute(foam, 1));
    geo.setAttribute('aDir', new THREE.BufferAttribute(dir, 2));
    geo.setIndex(idx);
    geo.computeBoundingSphere();

    this.waterUniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0.3, 0.6, -0.4).normalize() },
        uSunColor: { value: new THREE.Color('#fff6e8') },
        uSky: { value: new THREE.Color('#5d8fd0') },
        uHorizon: { value: new THREE.Color('#cfe0ea') },
        uShallow: { value: new THREE.Color('#5cc0d6') },
        uDeep: { value: new THREE.Color('#14608f') },
        uClarity: { value: 1 },
        uRain: { value: 0 },
        uLight: { value: 1 },
        uPolar: { value: 1 },
      },
    ]);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.waterUniforms,
      transparent: true,
      depthWrite: false,
      fog: true,
      vertexShader: `
        attribute float aSpeed; attribute float aDepth; attribute float aFoam; attribute vec2 aDir;
        varying vec3 vWorld; varying float vSpeed; varying float vDepth; varying float vFoam; varying vec2 vDir;
        uniform float uTime;
        #include <fog_pars_vertex>
        void main(){
          vec3 p = position;
          p.y += sin(p.z * 3.0 - uTime * 6.0 * aSpeed + p.x * 2.0) * 0.012 * aFoam;
          vec4 world = modelMatrix * vec4(p, 1.0);
          vWorld = world.xyz; vSpeed = aSpeed; vDepth = aDepth; vFoam = aFoam; vDir = aDir;
          vec4 mvPosition = viewMatrix * world;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform float uTime, uClarity, uRain, uLight, uPolar;
        uniform vec3 uSunDir, uSunColor, uSky, uHorizon, uShallow, uDeep;
        varying vec3 vWorld; varying float vSpeed; varying float vDepth; varying float vFoam; varying vec2 vDir;
        #include <fog_pars_fragment>
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        float waves(vec2 p, float chop){
          float v = n(p * 1.3) * 0.5 + n(p * 2.9 + 7.0) * 0.3 + n(p * 6.1 + 3.0) * 0.2 * chop;
          return v;
        }
        vec2 grad(vec2 p, float chop){
          float e = 0.06;
          float c = waves(p, chop);
          return vec2(waves(p + vec2(e,0.0), chop) - c, waves(p + vec2(0.0,e), chop) - c) / e;
        }
        void main(){
          vec2 dir = normalize(vDir + vec2(0.0001));
          vec2 side = vec2(dir.y, -dir.x);
          vec2 p = vWorld.xz;
          // Two-phase flow so fast and slow water can share one surface.
          float t = uTime * 0.3;
          float ph0 = fract(t), ph1 = fract(t + 0.5);
          float w = abs(ph0 - 0.5) * 2.0;
          float spd = vSpeed * 3.0;
          float chop = 0.4 + vFoam * 2.0;
          vec2 g0 = grad(p * 1.4 - dir * ph0 * spd, chop);
          vec2 g1 = grad(p * 1.4 - dir * ph1 * spd + vec2(3.7, 1.3), chop);
          vec2 g = mix(g0, g1, w);
          // Gentle wind ripples everywhere.
          g += grad(p * 2.6 + vec2(uTime * 0.3, uTime * 0.17), 1.0) * 0.25;
          float amp = 0.035 + vFoam * 0.12 + uRain * 0.04;
          vec2 gw = g;
          vec3 N = normalize(vec3(-gw.x * amp, 1.0, -gw.y * amp));
          vec3 V = normalize(cameraPosition - vWorld);
          float fres = (0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0)) * (1.0 - 0.88 * uPolar) * (1.0 + 0.35 * (1.0 - uPolar));
          vec3 R = reflect(-V, N);
          vec3 refl = mix(uHorizon, uSky, pow(clamp(R.y, 0.0, 1.0), 0.6));
          float depth = clamp(vDepth, 0.0, 3.0);
          vec3 body = mix(uShallow, uDeep, smoothstep(0.05, 1.7, depth));
          body = mix(body, vec3(0.30, 0.45, 0.42), (1.0 - uClarity) * 0.45);
          // Cartoon banding: a couple of soft steps in brightness.
          float lum = dot(body, vec3(0.3, 0.59, 0.11));
          body *= mix(1.0, floor(lum * 6.0 + 0.5) / max(lum * 6.0, 0.001), 0.25);
          body *= uLight;
          float spec = pow(max(dot(R, uSunDir), 0.0), 220.0) * 2.5 + pow(max(dot(R, uSunDir), 0.0), 18.0) * 0.08;
          // Surface patterns that travel with the current. Two phases blended
          // so places with different speeds never shear the pattern apart.
          float tp = uTime * 0.2;
          float q0 = fract(tp), q1 = fract(tp + 0.5);
          float qw = abs(q0 - 0.5) * 2.0;
          vec2 a0 = p - dir * q0 * vSpeed * 5.0;
          vec2 a1 = p - dir * q1 * vSpeed * 5.0 + vec2(7.3, 2.1);
          float fp = mix(n(a0 * vec2(3.2, 0.8)) * n(a0 * vec2(7.0, 1.8) + 4.0), n(a1 * vec2(3.2, 0.8)) * n(a1 * vec2(7.0, 1.8) + 4.0), qw);
          float foam = smoothstep(0.55 - vFoam * 0.4, 0.95, fp * 1.6) * smoothstep(0.02, 0.25, vFoam);
          vec3 col = mix(body, refl, fres) + uSunColor * spec * (1.0 - 0.75 * uPolar);
          // White streaks running with the current: the faster, the more.
          float sl = mix(n(a0 * vec2(5.0, 0.35)) * n(a0 * vec2(11.0, 0.8) + 3.0), n(a1 * vec2(5.0, 0.35)) * n(a1 * vec2(11.0, 0.8) + 3.0), qw);
          float streak = smoothstep(0.3, 0.48, sl) * smoothstep(0.25, 1.0, vSpeed) * 0.7;
          // Lazy little flecks drifting on slow water.
          float fl = mix(n(a0 * 9.0), n(a1 * 9.0), qw);
          float fleck = smoothstep(0.8, 0.9, fl) * 0.3;
          float white = clamp(foam * 0.85 + streak + fleck, 0.0, 1.0);
          col = mix(col, vec3(0.95, 0.98, 1.0) * (0.6 + 0.4 * uLight), white);
          foam = max(foam, white);
          float alpha = mix(0.3 - 0.12 * uPolar, 0.9 - 0.42 * uPolar, smoothstep(0.0, 1.9, depth));
          alpha = mix(alpha, 0.9, (1.0 - uClarity) * 0.8);
          alpha = max(alpha, max(fres * 0.95, foam));
          // Fade into the shore.
          alpha *= smoothstep(0.0, 0.08, vDepth);
          gl_FragColor = vec4(col, alpha);
          #include <fog_fragment>
        }`,
    });
    this.water = new THREE.Mesh(geo, mat);
    this.water.renderOrder = 10;
    this.scene.add(this.water);
  }

  buildRocks() {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: false });
    const group = new THREE.Group();
    const make = (x, z, r, seed, sink = 0.3) => {
      const geo = new THREE.IcosahedronGeometry(1, 3);
      const p = geo.attributes.position;
      const col = new Float32Array(p.count * 3);
      const c = new THREE.Color();
      for (let i = 0; i < p.count; i++) {
        const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
        const d = 1 + (noise(vx * 1.8 + seed, vz * 1.8 + vy) - 0.5) * 0.45 + (noise(vx * 5 + seed, vy * 5) - 0.5) * 0.12;
        p.setXYZ(i, vx * d, vy * d * (vy < 0 ? 0.6 : 0.8), vz * d * 1.15);
        const moss = vy > 0.35 ? smooth(0.35, 0.8, vy) * noise(vx * 4 + seed, vz * 4) : 0;
        c.set('#8a8a82').lerp(new THREE.Color('#5f615a'), noise(vx * 3 + seed, vz * 3 - seed)).lerp(new THREE.Color('#5d7040'), moss * 0.8);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat);
      m.scale.setScalar(r);
      m.rotation.y = seed;
      m.position.set(x, -r * sink + 0.05, z);
      group.add(m);
    };
    this.rocks.forEach((r, i) => make(r.x, r.z, r.r, i * 1.7, r.r > 1 ? 0.35 : 0.45));
    // Scattered stones on the bed and the gravel shore.
    let s = 11;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 70; i++) {
      const z = -48 + rnd() * 96;
      const { cx, hw } = this.channel(z);
      const side = rnd() < 0.5 ? -1 : 1;
      const x = cx + side * hw * (0.85 + rnd() * 0.35);
      const r = 0.12 + rnd() * 0.3;
      if (this.river.stands.some((st) => { const p = this.m2w(st.x, st.y); return Math.hypot(p.x - x, p.z - z) < 6; })) continue;
      make(x, z, r, i * 3.1, 0.2);
      group.children[group.children.length - 1].position.y = this.heightAt(x, z) + r * 0.2;
    }
    this.scene.add(group);
  }

  buildTrees() {
    let s = 5;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const stands = this.river.stands.map((st) => this.m2w(st.x, st.y));
    const spots = [];
    for (let i = 0; i < 900 && spots.length < 260; i++) {
      const z = -80 + rnd() * 160;
      const { cx, hw } = this.channel(z);
      const side = rnd() < 0.5 ? -1 : 1;
      const gap = 6 + Math.pow(rnd(), 1.2) * 50;
      const x = cx + side * (hw + gap);
      if (stands.some((st) => Math.hypot(st.x - x, st.z - z) < 9)) continue;
      const conifer = rnd() < 0.55;
      spots.push({ x, z, y: this.heightAt(x, z), h: (conifer ? 9 : 7) + rnd() * 8, conifer, c: rnd() });
    }
    const conifers = spots.filter((t) => t.conifer), birches = spots.filter((t) => !t.conifer);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();

    const trunkGeo = new THREE.CylinderGeometry(0.12, 0.2, 1, 6);
    trunkGeo.translate(0, 0.5, 0);
    const trunkC = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: '#4a3a2a' }), conifers.length);
    const trunkB = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: '#d9d4c7' }), birches.length);
    // Spruce: three stacked cones.
    const coneGeo = [];
    for (let k = 0; k < 3; k++) {
      const g = new THREE.ConeGeometry(1 - k * 0.25, 1.1 - k * 0.15, 8);
      g.translate(0, 0.35 + k * 0.42, 0);
      coneGeo.push(g);
    }
    const spruceGeo = mergeGeos(coneGeo);
    const spruce = new THREE.InstancedMesh(spruceGeo, new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), conifers.length);
    const blobGeo = mergeGeos([0, 1, 2].map((k) => {
      const g = new THREE.IcosahedronGeometry(0.62 - k * 0.08, 1);
      g.translate((k - 1) * 0.35, 0.55 + k * 0.28, (k % 2) * 0.3 - 0.15);
      return g;
    }));
    const birch = new THREE.InstancedMesh(blobGeo, new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), birches.length);
    conifers.forEach((t, i) => {
      q.setFromEuler(new THREE.Euler(0, t.c * 6, 0));
      m4.compose(p.set(t.x, t.y - 0.2, t.z), q, sc.set(1, t.h * 0.3, 1));
      trunkC.setMatrixAt(i, m4);
      m4.compose(p.set(t.x, t.y + t.h * 0.12, t.z), q, sc.set(t.h * 0.22, t.h, t.h * 0.22));
      spruce.setMatrixAt(i, m4);
      spruce.setColorAt(i, col.set('#2c4a32').lerp(new THREE.Color('#3d5f3a'), t.c));
    });
    birches.forEach((t, i) => {
      q.setFromEuler(new THREE.Euler(0, t.c * 6, 0));
      m4.compose(p.set(t.x, t.y - 0.2, t.z), q, sc.set(0.7, t.h * 0.55, 0.7));
      trunkB.setMatrixAt(i, m4);
      m4.compose(p.set(t.x, t.y + t.h * 0.35, t.z), q, sc.set(t.h * 0.42, t.h * 0.6, t.h * 0.42));
      birch.setMatrixAt(i, m4);
      birch.setColorAt(i, col.set('#5d8a40').lerp(new THREE.Color('#8aa64a'), t.c));
    });
    this.treeTops = [spruce, birch];
    this.scene.add(trunkC, trunkB, spruce, birch);
  }

  buildGrass() {
    // A clump of three crossed blades, swaying gently in the wind.
    const blade = new THREE.BufferGeometry();
    const v = [];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI;
      const cx = Math.cos(a) * 0.08, cz = Math.sin(a) * 0.08;
      v.push(-cx, 0, -cz, cx, 0, cz, 0, 1, 0);
    }
    blade.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    blade.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ color: '#ffffff', side: THREE.DoubleSide });
    this.grassTime = { value: 0 };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.grassTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
         float sway = sin(uTime * 1.6 + ip.x * 0.5 + ip.z * 0.3) * 0.12 + sin(uTime * 3.1 + ip.x) * 0.03;
         transformed.x += sway * position.y;
         transformed.z += sway * 0.6 * position.y;`,
      );
    };
    const N = 9000;
    const mesh = new THREE.InstancedMesh(blade, mat, N);
    let s = 9;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
    let i = 0;
    while (i < N) {
      const z = -70 + rnd() * 140;
      const { cx, hw } = this.channel(z);
      const side = rnd() < 0.5 ? -1 : 1;
      const e = 1.2 + Math.pow(rnd(), 1.8) * 30;
      const x = cx + side * (hw + e);
      const y = this.heightAt(x, z);
      q.setFromEuler(new THREE.Euler(0, rnd() * 6, 0));
      const hgt = 0.25 + rnd() * 0.45 + (this.undercut && Math.hypot(x - this.undercut.w.x, z - this.undercut.w.z) < 5 ? 0.4 : 0);
      m4.compose(p.set(x, y - 0.03, z), q, sc.set(1, hgt, 1));
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, col.set('#557a36').lerp(new THREE.Color('#9aae58'), rnd() * 0.7));
      i++;
    }
    this.scene.add(mesh);
  }

  buildHills() {
    // A valley of distant ridges, softened by the fog.
    const mat = new THREE.MeshLambertMaterial({ color: '#3d5a48', flatShading: true });
    let s = 21;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + rnd() * 0.2;
      const r = 170 + rnd() * 80;
      const h = 35 + rnd() * 70;
      const g = new THREE.ConeGeometry(50 + rnd() * 50, h, 7);
      const m = new THREE.Mesh(g, mat);
      m.position.set(Math.cos(a) * r * 0.8, h / 2 - 6, Math.sin(a) * r);
      m.rotation.y = rnd() * 3;
      this.scene.add(m);
    }
  }

  // --- Time & weather --------------------------------------------------------------

  setConditions(minute, weather, clarity) {
    let a = SKY[0], b = SKY[SKY.length - 1];
    for (let i = 0; i < SKY.length - 1; i++) {
      if (minute >= SKY[i][0] && minute <= SKY[i + 1][0]) { a = SKY[i]; b = SKY[i + 1]; break; }
    }
    const k = b[0] === a[0] ? 0 : clamp((minute - a[0]) / (b[0] - a[0]), 0, 1);
    const top = new THREE.Color(a[1]).lerp(new THREE.Color(b[1]), k);
    const hor = new THREE.Color(a[2]).lerp(new THREE.Color(b[2]), k);
    const sunC = new THREE.Color(a[3]).lerp(new THREE.Color(b[3]), k);
    let sunI = lerp(a[4], b[4], k);

    const grey = weather === 'overcast' ? 0.55 : weather === 'drizzle' ? 0.75 : 0;
    if (grey) {
      const g = new THREE.Color('#9aa3a8').multiplyScalar(0.4 + 0.6 * Math.min(1, sunI));
      top.lerp(g, grey);
      hor.lerp(g.clone().multiplyScalar(1.1), grey * 0.9);
      sunI *= 1 - grey * 0.7;
    }

    // Long Nordic summer day: sunrise ~05:00, sunset ~22:15.
    const dayT = clamp((minute - 300) / (1335 - 300), 0, 1);
    const elev = Math.sin(dayT * Math.PI) * 0.85 + 0.03;
    const az = lerp(-2.2, 2.2, dayT);
    const sunDir = new THREE.Vector3(Math.sin(az) * Math.cos(elev), Math.sin(elev), -Math.cos(az) * Math.cos(elev)).normalize();

    this.skyUniforms.uTop.value.copy(top);
    this.skyUniforms.uHorizon.value.copy(hor);
    this.skyUniforms.uSunDir.value.copy(sunDir);
    this.skyUniforms.uSunColor.value.copy(sunC);
    this.skyUniforms.uSun.value = grey ? 0.15 : Math.min(1, sunI);
    this.scene.fog.color.copy(hor);
    this.scene.fog.near = weather === 'drizzle' ? 25 : 50;
    this.scene.fog.far = weather === 'drizzle' ? 150 : 240;

    this.sun.color.copy(sunC);
    this.sun.intensity = 0.25 + sunI * 1.3;
    this.sun.position.copy(sunDir).multiplyScalar(100);
    const light = clamp(0.35 + sunI * 0.55 + grey * 0.25, 0.25, 1.1);
    this.hemi.intensity = 0.35 + light * 0.75;
    this.hemi.color.copy(top).lerp(new THREE.Color('#ffffff'), 0.4);

    const u = this.waterUniforms;
    u.uSunDir.value.copy(sunDir);
    u.uSunColor.value.copy(sunC).multiplyScalar(grey ? 0.2 : Math.min(1.2, sunI));
    u.uSky.value.copy(top);
    u.uHorizon.value.copy(hor);
    u.uClarity.value = clarity === 'tinged' ? 0.35 : 1;
    u.uRain.value = weather === 'drizzle' ? 1 : 0;
    u.uLight.value = clamp(0.45 + sunI * 0.5 + grey * 0.2, 0.3, 1.05);
    this.light = light;
    this.sunDir = sunDir;
  }

  setPolarized(on) {
    this.waterUniforms.uPolar.value = on ? 1 : 0;
  }

  update(dt) {
    this.time += dt;
    this.waterUniforms.uTime.value = this.time;
    this.grassTime.value = this.time;
  }
}

function mergeGeos(geos) {
  // Minimal merge for non-indexed copies of simple geometries.
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const total = parts.reduce((s, g) => s + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
  let o = 0;
  for (const g of parts) {
    g.computeVertexNormals();
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}
