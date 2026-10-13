// A small map of the beat: where you stand, where you're looking, and the
// fish you've spotted. Tap a figure on the bank to walk there.

export class Minimap {
  constructor(canvas, river, onStand) {
    this.canvas = canvas;
    this.river = river;
    this.onStand = onStand;
    this.ctx = canvas.getContext('2d');
    canvas.addEventListener('click', (e) => {
      const r = canvas.getBoundingClientRect();
      const x = (e.clientX - r.left) / this.s, y = (e.clientY - r.top) / this.s - this.oy;
      let best = null, bd = 60;
      for (const st of river.stands) {
        const d = Math.hypot(st.x - x, st.y - y);
        if (d < bd) { bd = d; best = st; }
      }
      if (best) onStand(best);
    });
  }

  draw({ stand, cam, yaw, aim, fish, walking }) {
    const c = this.canvas, g = this.ctx;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = c.clientWidth, h = c.clientHeight;
    if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    this.s = w / 600;
    this.oy = 0;
    g.setTransform(dpr * this.s, 0, 0, dpr * this.s, 0, 0);
    g.clearRect(0, 0, 600, 900);
    g.fillStyle = 'rgba(70,95,60,0.85)';
    g.fillRect(0, 0, 600, 900);
    // River.
    const ch = this.river.channel;
    g.beginPath();
    ch.forEach((p, i) => (i ? g.lineTo(p.x - p.w / 2, p.y) : g.moveTo(p.x - p.w / 2, p.y)));
    for (let i = ch.length - 1; i >= 0; i--) g.lineTo(ch[i].x + ch[i].w / 2, ch[i].y);
    g.closePath();
    const grad = g.createLinearGradient(0, 0, 0, 900);
    grad.addColorStop(0, '#8fbcb0');
    grad.addColorStop(0.62, '#4f8a8a');
    grad.addColorStop(0.75, '#2d5f68');
    grad.addColorStop(1, '#5d9690');
    g.fillStyle = grad;
    g.fill();
    g.fillStyle = 'rgba(180,180,170,0.9)';
    for (const r of this.river.rocks) {
      g.beginPath();
      g.arc(r.x, r.y, Math.max(6, r.r), 0, 7);
      g.fill();
    }
    // Spotted fish.
    for (const f of fish) {
      if (!f.spotted || f.hidden) continue;
      const m = { x: f.pos.x * 10 + 300, y: f.pos.z * 10 + 450 };
      g.fillStyle = '#ffd27a';
      g.beginPath();
      g.ellipse(m.x, m.y, 7, 16, 0, 0, 7);
      g.fill();
    }
    if (aim) {
      g.strokeStyle = '#ffd27a';
      g.lineWidth = 6;
      g.beginPath();
      g.arc(aim.x * 10 + 300, aim.z * 10 + 450, 14, 0, 7);
      g.stroke();
    }
    // Stands.
    for (const st of this.river.stands) {
      const here = stand && st.id === stand.id;
      g.fillStyle = here ? '#fff4d6' : 'rgba(255,244,214,0.55)';
      g.beginPath();
      g.arc(st.x, st.y, here ? 20 : 16, 0, 7);
      g.fill();
      if (!here) {
        g.strokeStyle = 'rgba(40,50,35,0.8)';
        g.lineWidth = 4;
        g.stroke();
      }
    }
    // You, and where you're looking.
    const px = cam.x * 10 + 300, py = cam.z * 10 + 450;
    g.fillStyle = 'rgba(255,240,200,0.25)';
    g.beginPath();
    g.moveTo(px, py);
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const L = 260, spread = 0.5;
    g.lineTo(px + (fx * Math.cos(spread) - fz * Math.sin(spread)) * L, py + (fz * Math.cos(spread) + fx * Math.sin(spread)) * L);
    g.lineTo(px + (fx * Math.cos(-spread) - fz * Math.sin(-spread)) * L, py + (fz * Math.cos(-spread) + fx * Math.sin(-spread)) * L);
    g.closePath();
    g.fill();
    g.fillStyle = walking ? '#ffe9a8' : '#e8613a';
    g.beginPath();
    g.arc(px, py, 14, 0, 7);
    g.fill();
  }
}
