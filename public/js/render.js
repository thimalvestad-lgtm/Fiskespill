// Canvas renderer for the river. Everything is drawn in a 600 x 900 map
// space, scaled to fit the canvas.

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function seeded(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

// Light tint over the scene through the day: [minute, r, g, b, alpha].
const LIGHT = [
  [330, 40, 50, 100, 0.45],
  [380, 255, 160, 130, 0.2],
  [480, 255, 225, 190, 0.06],
  [660, 255, 255, 255, 0],
  [960, 255, 220, 150, 0.05],
  [1110, 255, 165, 90, 0.17],
  [1230, 150, 90, 150, 0.26],
  [1320, 25, 35, 80, 0.5],
];

export class RiverRenderer {
  constructor(canvas, river) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.river = river;
    this.W = river.size.w;
    this.H = river.size.h;
    this.time = 0;
    this.buildGeometry();
    this.particles = [];
    const rnd = seeded(7);
    for (let i = 0; i < 520; i++) this.particles.push(this.newParticle(rnd, true));
    this.rnd = Math.random;
    this.mist = Array.from({ length: 7 }, (_, i) => ({ x: Math.random() * 600, y: 560 + Math.random() * 340, r: 90 + Math.random() * 80, v: 3 + Math.random() * 5, i }));
    this.bugs = Array.from({ length: 40 }, () => ({ x: Math.random() * 600, y: Math.random() * 900, p: Math.random() * 6 }));
    this.resize();
  }

  // --- Geometry ------------------------------------------------------------

  at(y) {
    const pts = this.river.channel;
    if (y <= pts[0].y) return { x: pts[0].x, w: pts[0].w };
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (y <= b.y) {
        const t = (y - a.y) / (b.y - a.y);
        const s = (1 - Math.cos(t * Math.PI)) / 2;
        return { x: lerp(a.x, b.x, s), w: lerp(a.w, b.w, s) };
      }
    }
    const l = pts[pts.length - 1];
    return { x: l.x, w: l.w };
  }

  section(y) {
    const secs = this.river.sections;
    for (const s of secs) if (y < s.to) return s;
    return secs[secs.length - 1];
  }

  speedAt(y) {
    // Blend section speeds so the riffle eases into the pool.
    const secs = this.river.sections;
    for (let i = 0; i < secs.length; i++) {
      const s = secs[i];
      if (y < s.to) {
        const next = secs[i + 1];
        if (next && y > s.to - 40) return lerp(s.speed, next.speed, (y - (s.to - 40)) / 40);
        return s.speed;
      }
    }
    return secs[secs.length - 1].speed;
  }

  buildGeometry() {
    this.left = [];
    this.right = [];
    for (let y = -60; y <= 960; y += 6) {
      const c = this.at(y);
      this.left.push([c.x - c.w / 2 + Math.sin(y * 0.05) * 3 + Math.sin(y * 0.013) * 5, y]);
      this.right.push([c.x + c.w / 2 + Math.sin(y * 0.043 + 1) * 3 + Math.sin(y * 0.017) * 5, y]);
    }
    const rnd = seeded(42);
    this.trees = [];
    for (let i = 0; i < 70; i++) {
      const y = -40 + rnd() * 980;
      const c = this.at(y);
      const side = rnd() < 0.5 ? -1 : 1;
      const gap = 45 + rnd() * 160;
      const x = c.x + side * (c.w / 2 + gap);
      if (x < -60 || x > 660) continue;
      this.trees.push({ x, y, r: 18 + rnd() * 26, hue: rnd(), phase: rnd() * 6 });
    }
    this.trees.sort((a, b) => a.y - b.y);
    this.pebbles = [];
    for (let i = 0; i < 420; i++) {
      const y = rnd() * 330;
      const c = this.at(y);
      this.pebbles.push({ x: c.x + (rnd() - 0.5) * c.w * 0.9, y, r: 1.5 + rnd() * 4, s: rnd() });
    }
    this.tufts = [];
    for (let i = 0; i < 500; i++) {
      const x = rnd() * 640 - 20, y = rnd() * 940 - 20;
      const c = this.at(y);
      if (Math.abs(x - c.x) < c.w / 2 + 16) continue;
      this.tufts.push({ x, y, s: rnd(), f: rnd() < 0.06 });
    }
  }

  riverPath(ctx, inset = 0) {
    ctx.beginPath();
    this.left.forEach(([x, y], i) => (i ? ctx.lineTo(x + inset, y) : ctx.moveTo(x + inset, y)));
    for (let i = this.right.length - 1; i >= 0; i--) ctx.lineTo(this.right[i][0] - inset, this.right[i][1]);
    ctx.closePath();
  }

  newParticle(rnd, anywhere) {
    return {
      y: anywhere ? -40 + rnd() * 980 : -40 - rnd() * 30,
      u: (rnd() * 2 - 1) * 0.92,
      k: 0.7 + rnd() * 0.6,
      a: rnd(),
    };
  }

  // --- Sizing ---------------------------------------------------------------

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    this.cw = Math.max(1, rect.width);
    this.ch = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.cw * dpr);
    this.canvas.height = Math.round(this.ch * dpr);
    this.dpr = dpr;
    // Fit the whole beat, centred.
    this.scale = Math.min(this.cw / this.W, this.ch / this.H);
    this.ox = (this.cw - this.W * this.scale) / 2;
    this.oy = (this.ch - this.H * this.scale) / 2;
    this.buildStatic();
  }

  toMap(px, py) {
    return { x: (px - this.ox) / this.scale, y: (py - this.oy) / this.scale };
  }

  toScreen(x, y) {
    return { x: this.ox + x * this.scale, y: this.oy + y * this.scale };
  }

  applyTransform(ctx) {
    ctx.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, this.dpr * this.ox, this.dpr * this.oy);
  }

  // Ground, riverbed and rocks don't move, so draw them once.
  buildStatic() {
    const c = document.createElement('canvas');
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#5d7d45';
    ctx.fillRect(0, 0, c.width, c.height);
    this.applyTransform(ctx);
    const ext = { x0: -this.ox / this.scale, y0: -this.oy / this.scale, x1: (this.cw - this.ox) / this.scale, y1: (this.ch - this.oy) / this.scale };

    // Meadow with soft variation.
    const g = ctx.createLinearGradient(0, ext.y0, 0, ext.y1);
    g.addColorStop(0, '#59784a');
    g.addColorStop(0.5, '#68864d');
    g.addColorStop(1, '#5a7a47');
    ctx.fillStyle = g;
    ctx.fillRect(ext.x0, ext.y0, ext.x1 - ext.x0, ext.y1 - ext.y0);
    const rnd = seeded(3);
    for (let i = 0; i < 160; i++) {
      const x = ext.x0 + rnd() * (ext.x1 - ext.x0), y = ext.y0 + rnd() * (ext.y1 - ext.y0);
      const r = 30 + rnd() * 90;
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      const light = rnd() < 0.5;
      rg.addColorStop(0, light ? 'rgba(150,170,90,0.18)' : 'rgba(40,70,40,0.16)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (const t of this.tufts) {
      ctx.strokeStyle = t.s < 0.5 ? 'rgba(45,75,35,0.55)' : 'rgba(140,165,85,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = -1; k <= 1; k++) {
        ctx.moveTo(t.x, t.y);
        ctx.lineTo(t.x + k * 2.5, t.y - 5 - t.s * 3);
      }
      ctx.stroke();
      if (t.f) {
        ctx.fillStyle = t.s < 0.3 ? '#f3efe1' : t.s < 0.6 ? '#e8cf5a' : '#c9a3d8';
        ctx.beginPath();
        ctx.arc(t.x, t.y - 6, 1.6, 0, 7);
        ctx.fill();
      }
    }

    // Gravel and stony margins.
    ctx.save();
    this.riverPath(ctx);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#a99c7c';
    ctx.lineWidth = 30;
    ctx.stroke();
    ctx.strokeStyle = '#c4b590';
    ctx.lineWidth = 18;
    ctx.stroke();
    ctx.restore();
    for (let i = 0; i < 700; i++) {
      const y = -40 + rnd() * 980;
      const cc = this.at(y);
      const side = rnd() < 0.5 ? -1 : 1;
      const x = cc.x + side * (cc.w / 2 + 2 + rnd() * 12);
      ctx.fillStyle = `rgba(${120 + rnd() * 80 | 0},${110 + rnd() * 70 | 0},${90 + rnd() * 60 | 0},0.7)`;
      ctx.beginPath();
      ctx.ellipse(x, y, 1.5 + rnd() * 2.5, 1 + rnd() * 2, rnd() * 3, 0, 7);
      ctx.fill();
    }

    // Undercut bank: overhanging grass and a dark hollow on the outside bend.
    const ub = this.river.spots.find((s) => s.type === 'bank');
    if (ub) {
      for (let y = ub.y - 50; y < ub.y + 50; y += 3) {
        const cc = this.at(y);
        const edge = cc.x + cc.w / 2;
        ctx.fillStyle = 'rgba(70,95,45,0.9)';
        ctx.beginPath();
        ctx.ellipse(edge - 4, y, 9, 4, 0, 0, 7);
        ctx.fill();
      }
    }

    // Water body.
    ctx.save();
    this.riverPath(ctx);
    ctx.clip();
    const wg = ctx.createLinearGradient(0, -40, 0, 940);
    wg.addColorStop(0.0, '#7fb0a2');
    wg.addColorStop(0.28, '#6ea69c');
    wg.addColorStop(0.33, '#3f7b7c');
    wg.addColorStop(0.45, '#4b8786');
    wg.addColorStop(0.6, '#467f80');
    wg.addColorStop(0.67, '#24555f');
    wg.addColorStop(0.8, '#2f6469');
    wg.addColorStop(0.93, '#4f8a85');
    wg.addColorStop(1, '#6aa197');
    ctx.fillStyle = wg;
    ctx.fillRect(-60, -60, 720, 1020);
    // Riffle cobbles seen through shallow water.
    for (const p of this.pebbles) {
      ctx.fillStyle = p.s < 0.5 ? 'rgba(150,140,110,0.22)' : 'rgba(60,80,70,0.2)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.r, p.r * 0.7, p.s * 3, 0, 7);
      ctx.fill();
    }
    // Shallow, lighter margins.
    this.riverPath(ctx);
    ctx.strokeStyle = 'rgba(190,200,160,0.28)';
    ctx.lineWidth = 22;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(190,200,160,0.18)';
    ctx.lineWidth = 46;
    ctx.stroke();
    // Deep hollow at the undercut bank.
    if (ub) {
      const rg = ctx.createRadialGradient(ub.x + 8, ub.y, 2, ub.x + 8, ub.y, 50);
      rg.addColorStop(0, 'rgba(15,40,45,0.6)');
      rg.addColorStop(1, 'rgba(15,40,45,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(ub.x - 60, ub.y - 60, 120, 120);
    }
    // Deep green slot below the riffle, and the deep heart of the pool.
    for (const id of ['dropoff', 'pool-head']) {
      const s = this.river.spots.find((x) => x.id === id);
      if (!s) continue;
      const rg = ctx.createRadialGradient(s.x, s.y + 10, 4, s.x, s.y + 10, 70);
      rg.addColorStop(0, 'rgba(15,45,50,0.45)');
      rg.addColorStop(1, 'rgba(15,45,50,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(s.x - 80, s.y - 70, 160, 160);
    }
    // Rock shadows under water.
    for (const r of this.river.rocks) {
      ctx.fillStyle = 'rgba(20,40,40,0.35)';
      ctx.beginPath();
      ctx.ellipse(r.x + 3, r.y + r.r * 0.6, r.r * 1.1, r.r * 1.4, 0, 0, 7);
      ctx.fill();
    }
    ctx.restore();

    // Rocks.
    for (const r of this.river.rocks) {
      const rg = ctx.createRadialGradient(r.x - r.r * 0.35, r.y - r.r * 0.4, r.r * 0.1, r.x, r.y, r.r);
      rg.addColorStop(0, '#b9b7ae');
      rg.addColorStop(0.6, '#8b8a82');
      rg.addColorStop(1, '#5d5f5a');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, r.r, r.r * 0.86, 0.3, 0, 7);
      ctx.fill();
      if (r.r > 10) {
        ctx.fillStyle = 'rgba(95,120,60,0.45)';
        ctx.beginPath();
        ctx.ellipse(r.x + r.r * 0.25, r.y + r.r * 0.2, r.r * 0.45, r.r * 0.3, 0.4, 0, 7);
        ctx.fill();
      }
    }

    this.staticLayer = c;
  }

  // --- Frame ------------------------------------------------------------------

  draw(dt, scene) {
    this.time += dt;
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.staticLayer, 0, 0);
    this.applyTransform(ctx);

    ctx.save();
    this.riverPath(ctx);
    ctx.clip();
    this.drawFlow(ctx, dt);
    this.drawFoam(ctx);
    this.drawRises(ctx, scene);
    if (scene.rain) this.drawRainRings(ctx);
    ctx.restore();

    this.drawRockWater(ctx);
    this.drawTrees(ctx, scene);
    this.drawSpots(ctx, scene);
    this.drawAngler(ctx, scene);
    if (scene.hatch) this.drawBugs(ctx, scene);
    if (scene.mist > 0) this.drawMist(ctx, dt, scene.mist);
    this.drawLight(ctx, scene);
    if (scene.rain) this.drawRain(ctx);
  }

  drawFlow(ctx, dt) {
    const rocks = this.river.rocks;
    ctx.lineCap = 'round';
    for (const p of this.particles) {
      const sp = this.speedAt(p.y);
      p.y += dt * (12 + sp * 70) * p.k;
      if (p.y > 950) Object.assign(p, this.newParticle(Math.random, false));
      const c = this.at(p.y);
      const x = c.x + p.u * c.w / 2;
      // Slack water behind rocks: skip and slow.
      let hidden = false;
      for (const r of rocks) {
        const dx = x - r.x, dy = p.y - r.y;
        if (Math.abs(dx) < r.r * 1.1 && dy > -r.r && dy < r.r * 3.2) { hidden = true; break; }
      }
      if (hidden) continue;
      const sec = this.section(p.y);
      const len = 3 + sp * 9 * p.k;
      const edge = 1 - Math.abs(p.u) * 0.6;
      const alpha = (sec.id === 'flat' ? 0.1 : sec.id === 'riffle' ? 0.32 : 0.24) * edge * (0.5 + p.a * 0.5);
      ctx.strokeStyle = `rgba(235,245,240,${alpha})`;
      ctx.lineWidth = sec.id === 'riffle' ? 1.3 : 1;
      ctx.beginPath();
      const wob = Math.sin(this.time * 2 + p.a * 20) * (sec.id === 'riffle' ? 1.2 : 0.4);
      ctx.moveTo(x + wob, p.y);
      ctx.lineTo(x + wob, p.y - len);
      ctx.stroke();
    }
    // Glints on the riffle.
    const t = this.time;
    for (let i = 0; i < 26; i++) {
      const y = ((i * 37 + t * 60) % 300);
      const c = this.at(y);
      const x = c.x + Math.sin(i * 12.9) * c.w * 0.42;
      const a = 0.25 + 0.25 * Math.sin(t * 5 + i);
      ctx.fillStyle = `rgba(255,255,250,${a})`;
      ctx.fillRect(x, y, 2.2, 1.2);
    }
  }

  drawFoam(ctx) {
    const t = this.time;
    // Foam slowly circling in the eddy.
    const e = this.river.spots.find((s) => s.id === 'foam-eddy');
    if (e) {
      for (let i = 0; i < 34; i++) {
        const a = t * 0.12 + i * 0.37;
        const r = 18 + (i % 5) * 7;
        const x = e.x + 6 + Math.cos(a) * r * 1.2;
        const y = e.y + Math.sin(a) * r * 0.8;
        ctx.fillStyle = `rgba(245,245,235,${0.25 + (i % 3) * 0.1})`;
        ctx.beginPath();
        ctx.ellipse(x, y, 2 + (i % 4), 1.4 + (i % 3), a, 0, 7);
        ctx.fill();
      }
    }
    // Foam line down the seam beside the boulder and on into the pool head.
    const lines = [
      { x0: 262, y0: 375, x1: 248, y1: 440 },
      { x0: 280, y0: 585, x1: 255, y1: 700 },
    ];
    for (const l of lines) {
      for (let i = 0; i < 16; i++) {
        const f = ((i / 16 + t * 0.05) % 1);
        const x = lerp(l.x0, l.x1, f) + Math.sin(f * 9 + t) * 3;
        const y = lerp(l.y0, l.y1, f);
        ctx.fillStyle = `rgba(245,245,235,${0.35 * (1 - Math.abs(f - 0.5) * 1.6)})`;
        ctx.beginPath();
        ctx.ellipse(x, y, 2.2, 1.5, 0, 0, 7);
        ctx.fill();
      }
    }
  }

  drawRockWater(ctx) {
    const t = this.time;
    for (const r of this.river.rocks) {
      const sp = this.speedAt(r.y);
      if (sp < 0.4) continue;
      // Pillow of white water on the upstream side.
      ctx.strokeStyle = `rgba(250,252,248,${0.45 + 0.15 * Math.sin(t * 6 + r.x)})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(r.x, r.y + 1, r.r + 2.5, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      // V-wake downstream.
      ctx.strokeStyle = 'rgba(240,248,245,0.3)';
      ctx.lineWidth = 1;
      const wob = Math.sin(t * 3 + r.y) * 1.5;
      ctx.beginPath();
      ctx.moveTo(r.x - r.r * 0.9, r.y + r.r * 0.3);
      ctx.quadraticCurveTo(r.x - r.r * 1.1 + wob, r.y + r.r * 2, r.x - r.r * 0.6, r.y + r.r * 3.4);
      ctx.moveTo(r.x + r.r * 0.9, r.y + r.r * 0.3);
      ctx.quadraticCurveTo(r.x + r.r * 1.1 - wob, r.y + r.r * 2, r.x + r.r * 0.6, r.y + r.r * 3.4);
      ctx.stroke();
    }
  }

  drawRises(ctx, scene) {
    for (const r of scene.rises) {
      const k = r.age / r.life;
      if (k >= 1) continue;
      ctx.strokeStyle = `rgba(240,250,250,${0.55 * (1 - k)})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(r.x, r.y + k * 6 * r.drift, 2 + k * r.size, (2 + k * r.size) * 0.75, 0, 0, 7);
      ctx.stroke();
      if (k > 0.25) {
        ctx.strokeStyle = `rgba(240,250,250,${0.3 * (1 - k)})`;
        ctx.beginPath();
        ctx.ellipse(r.x, r.y + k * 6 * r.drift, 1 + k * r.size * 0.55, (1 + k * r.size * 0.55) * 0.75, 0, 0, 7);
        ctx.stroke();
      }
    }
    for (const s of scene.splashes) {
      const k = s.age / s.life;
      if (k >= 1) continue;
      ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - k)})`;
      for (let i = 0; i < 8; i++) {
        const a = i * 0.785 + s.x;
        const d = 3 + k * 12 * s.size;
        ctx.beginPath();
        ctx.arc(s.x + Math.cos(a) * d, s.y + Math.sin(a) * d * 0.7, 1.4 * (1 - k) + 0.4, 0, 7);
        ctx.fill();
      }
      ctx.strokeStyle = `rgba(255,255,255,${0.6 * (1 - k)})`;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, 3 + k * 16 * s.size, (3 + k * 16 * s.size) * 0.7, 0, 0, 7);
      ctx.stroke();
    }
  }

  drawRainRings(ctx) {
    const t = this.time;
    for (let i = 0; i < 40; i++) {
      const seed = Math.floor(t * 1.4 + i * 0.37);
      const r = seeded(seed * 97 + i * 13 + 1);
      r();
      const y = r() * 900;
      const c = this.at(y);
      const x = c.x + (r() - 0.5) * c.w;
      const k = (t * 1.4 + i * 0.37) % 1;
      ctx.strokeStyle = `rgba(230,240,240,${0.35 * (1 - k)})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(x, y, 1 + k * 5, 0, 7);
      ctx.stroke();
    }
  }

  drawTrees(ctx, scene) {
    const t = this.time;
    const wind = scene.wind ?? 0.5;
    for (const tr of this.trees) {
      ctx.fillStyle = 'rgba(25,40,25,0.28)';
      ctx.beginPath();
      ctx.ellipse(tr.x + tr.r * 0.45, tr.y + tr.r * 0.5, tr.r * 1.05, tr.r * 0.85, 0.4, 0, 7);
      ctx.fill();
    }
    for (const tr of this.trees) {
      const sx = Math.sin(t * 0.7 + tr.phase) * 1.4 * wind;
      const sy = Math.cos(t * 0.55 + tr.phase) * 0.8 * wind;
      const dark = tr.hue < 0.4 ? '#2f4f2d' : tr.hue < 0.75 ? '#38593a' : '#44612f';
      const mid = tr.hue < 0.4 ? '#3f6a3a' : tr.hue < 0.75 ? '#4c7444' : '#5c7e3c';
      const lite = tr.hue < 0.4 ? '#5d8a4f' : tr.hue < 0.75 ? '#6c9356' : '#86a24e';
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.arc(tr.x + sx * 0.5, tr.y + sy * 0.5, tr.r, 0, 7);
      ctx.fill();
      ctx.fillStyle = mid;
      for (let k = 0; k < 5; k++) {
        const a = k * 1.26 + tr.phase;
        ctx.beginPath();
        ctx.arc(tr.x + Math.cos(a) * tr.r * 0.45 + sx, tr.y + Math.sin(a) * tr.r * 0.45 + sy, tr.r * 0.55, 0, 7);
        ctx.fill();
      }
      ctx.fillStyle = lite;
      ctx.beginPath();
      ctx.arc(tr.x - tr.r * 0.3 + sx * 1.4, tr.y - tr.r * 0.3 + sy * 1.4, tr.r * 0.38, 0, 7);
      ctx.fill();
    }
  }

  drawSpots(ctx, scene) {
    const t = this.time;
    for (const s of this.river.spots) {
      const sel = s.id === scene.selectedId;
      const hov = s.id === scene.hoverId;
      if (scene.hideSpots && !sel) continue;
      const pulse = 0.5 + 0.5 * Math.sin(t * 1.6 + s.x);
      ctx.strokeStyle = sel ? 'rgba(255,240,190,0.95)' : `rgba(255,250,230,${hov ? 0.85 : 0.35 + pulse * 0.2})`;
      ctx.lineWidth = sel ? 2 : 1.3;
      ctx.setLineDash(sel ? [] : [3, 4]);
      ctx.beginPath();
      ctx.arc(s.x, s.y, sel ? 15 + pulse * 2 : 12, 0, 7);
      ctx.stroke();
      ctx.setLineDash([]);
      if (scene.fresh && scene.fresh[s.id] < 0.55 && !sel) {
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath();
        ctx.arc(s.x, s.y, 12, 0, 7);
        ctx.fill();
      }
      if (sel || hov) {
        ctx.font = '600 11px "Nunito", system-ui, sans-serif';
        const w = ctx.measureText(s.name).width + 14;
        const lx = clamp(s.x - w / 2, 4, 596 - w);
        const ly = s.y - 38;
        ctx.fillStyle = 'rgba(25,35,30,0.72)';
        roundRect(ctx, lx, ly, w, 18, 9);
        ctx.fill();
        ctx.fillStyle = '#f6f1e3';
        ctx.fillText(s.name, lx + 7, ly + 12.5);
      }
    }
  }

  drawAngler(ctx, scene) {
    const a = scene.angler;
    if (!a) return;
    // The line: a soft curve from rod tip to fly.
    if (scene.fly && scene.fly.visible) {
      const tipX = a.x + (scene.fly.x - a.x) * 0.25;
      const tipY = a.y + (scene.fly.y - a.y) * 0.25 - 4;
      ctx.strokeStyle = '#3b2a1a';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
      ctx.strokeStyle = scene.fly.tight ? 'rgba(250,235,160,0.95)' : 'rgba(245,230,170,0.75)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      const sag = scene.fly.tight ? 0 : 14;
      ctx.quadraticCurveTo((tipX + scene.fly.x) / 2 + sag * 0.3, (tipY + scene.fly.y) / 2 + sag, scene.fly.x, scene.fly.y);
      ctx.stroke();
      // Fly / indicator.
      if (!scene.fly.gone) {
        const bob = Math.sin(this.time * 6) * 0.6;
        if (scene.fly.kind === 'nymph') {
          ctx.fillStyle = '#ff7a3d';
          ctx.beginPath();
          ctx.arc(scene.fly.x, scene.fly.y + bob + (scene.fly.dip || 0), 2.6, 0, 7);
          ctx.fill();
        } else {
          ctx.fillStyle = '#fbf6e9';
          ctx.beginPath();
          ctx.arc(scene.fly.x, scene.fly.y + bob, 2.3, 0, 7);
          ctx.fill();
          ctx.fillStyle = '#c98b46';
          ctx.beginPath();
          ctx.arc(scene.fly.x, scene.fly.y + bob + 1.2, 1.3, 0, 7);
          ctx.fill();
        }
      }
    }
    // The angler, seen from above: shadow, body, hat.
    ctx.fillStyle = 'rgba(20,30,20,0.3)';
    ctx.beginPath();
    ctx.ellipse(a.x + 4, a.y + 5, 9, 6, 0.4, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#4e5b44';
    ctx.beginPath();
    ctx.ellipse(a.x, a.y, 8, 6, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#b89a62';
    ctx.beginPath();
    ctx.arc(a.x, a.y - 1, 4.6, 0, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(80,60,30,0.6)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(a.x, a.y - 1, 2.6, 0, 7);
    ctx.stroke();
  }

  drawBugs(ctx, scene) {
    const t = this.time;
    const glow = scene.minute > 1200;
    for (const b of this.bugs) {
      const x = b.x + Math.sin(t * 0.9 + b.p) * 18;
      const y = b.y + Math.cos(t * 0.7 + b.p * 2) * 10 - ((t * 6) % 30);
      const c = this.at(y);
      if (Math.abs(x - c.x) > c.w / 2 + 30) continue;
      ctx.fillStyle = glow ? `rgba(255,240,180,${0.4 + 0.4 * Math.sin(t * 3 + b.p)})` : 'rgba(255,255,240,0.6)';
      ctx.fillRect(x, y, 1.3, 1.3);
    }
  }

  drawMist(ctx, dt, amount) {
    for (const m of this.mist) {
      m.x += m.v * dt;
      if (m.x - m.r > 650) m.x = -m.r;
      const rg = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r);
      rg.addColorStop(0, `rgba(240,242,245,${0.22 * amount})`);
      rg.addColorStop(1, 'rgba(240,242,245,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(m.x - m.r, m.y - m.r, m.r * 2, m.r * 2);
    }
  }

  drawLight(ctx, scene) {
    const m = scene.minute;
    let a = LIGHT[0], b = LIGHT[LIGHT.length - 1];
    for (let i = 0; i < LIGHT.length - 1; i++) {
      if (m >= LIGHT[i][0] && m <= LIGHT[i + 1][0]) { a = LIGHT[i]; b = LIGHT[i + 1]; break; }
    }
    const k = b[0] === a[0] ? 0 : clamp((m - a[0]) / (b[0] - a[0]), 0, 1);
    const col = [1, 2, 3, 4].map((i) => lerp(a[i], b[i], k));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (col[3] > 0.005) {
      ctx.fillStyle = `rgba(${col[0] | 0},${col[1] | 0},${col[2] | 0},${col[3]})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    if (scene.overcast) {
      ctx.fillStyle = `rgba(120,130,140,${scene.overcast})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    // Soft vignette.
    const W = this.canvas.width, H = this.canvas.height;
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(10,20,15,0.35)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
    this.applyTransform(ctx);
  }

  drawRain(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const W = this.canvas.width, H = this.canvas.height;
    const t = this.time;
    ctx.strokeStyle = 'rgba(220,230,240,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 90; i++) {
      const x = ((i * 131.7 + t * 40) % W);
      const y = ((i * 97.3 + t * 520) % H);
      ctx.moveTo(x, y);
      ctx.lineTo(x - 3, y + 12);
    }
    ctx.stroke();
    this.applyTransform(ctx);
  }

  spotAt(px, py) {
    const p = this.toMap(px, py);
    let best = null, bd = 26;
    for (const s of this.river.spots) {
      const d = Math.hypot(s.x - p.x, s.y - p.y);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  // Where to stand to fish a spot: on the nearer bank, a little downstream.
  standFor(spot) {
    const y = spot.y + 46;
    const c = this.at(y);
    const leftBank = spot.x < this.at(spot.y).x;
    return { x: leftBank ? c.x - c.w / 2 - 10 : c.x + c.w / 2 + 10, y };
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
