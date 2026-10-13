// Paints a trout side-on for the catch card.

export function drawTrout(canvas, fish) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const brown = fish.species === 'brown';
  const len = W * 0.82;
  const x0 = (W - len) / 2, cy = H / 2 + 6;
  const depth = len * (brown ? 0.21 : 0.22) * (fish.length > 50 ? 1.08 : 1);
  const seed = fish.length * 13 + fish.weightG;
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);

  const body = new Path2D();
  body.moveTo(x0, cy);
  body.bezierCurveTo(x0 + len * 0.1, cy - depth * 0.62, x0 + len * 0.45, cy - depth * 0.62, x0 + len * 0.82, cy - depth * 0.18);
  body.lineTo(x0 + len * 0.86, cy - depth * 0.12);
  body.lineTo(x0 + len * 0.86, cy + depth * 0.12);
  body.lineTo(x0 + len * 0.82, cy + depth * 0.18);
  body.bezierCurveTo(x0 + len * 0.45, cy + depth * 0.55, x0 + len * 0.12, cy + depth * 0.5, x0, cy);
  body.closePath();

  // Tail.
  ctx.fillStyle = brown ? '#7a6436' : '#6f7a62';
  ctx.beginPath();
  ctx.moveTo(x0 + len * 0.85, cy);
  ctx.quadraticCurveTo(x0 + len * 0.95, cy - depth * 0.55, x0 + len, cy - depth * 0.6);
  ctx.quadraticCurveTo(x0 + len * 0.96, cy, x0 + len, cy + depth * 0.6);
  ctx.quadraticCurveTo(x0 + len * 0.95, cy + depth * 0.55, x0 + len * 0.85, cy);
  ctx.fill();
  // Fins.
  const fin = (x, y, w, h) => {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + w * 0.3, y + h, x + w, y + h * 0.9);
    ctx.quadraticCurveTo(x + w * 0.7, y, x, y);
    ctx.fill();
  };
  ctx.fillStyle = brown ? '#8a7442' : '#7e8670';
  fin(x0 + len * 0.36, cy - depth * 0.48, len * 0.12, -depth * 0.35);
  fin(x0 + len * 0.66, cy - depth * 0.33, len * 0.05, -depth * 0.18);
  ctx.fillStyle = brown ? '#c9a56a' : '#d9c8c0';
  fin(x0 + len * 0.22, cy + depth * 0.32, len * 0.08, depth * 0.25);
  fin(x0 + len * 0.45, cy + depth * 0.4, len * 0.07, depth * 0.22);
  fin(x0 + len * 0.62, cy + depth * 0.3, len * 0.07, depth * 0.2);

  // Body colours.
  const g = ctx.createLinearGradient(0, cy - depth * 0.6, 0, cy + depth * 0.55);
  if (brown) {
    g.addColorStop(0, '#4d3f22');
    g.addColorStop(0.35, '#9a7a3c');
    g.addColorStop(0.65, '#d4b064');
    g.addColorStop(1, '#f1e4b8');
  } else {
    g.addColorStop(0, '#3f5238');
    g.addColorStop(0.35, '#8e9a80');
    g.addColorStop(0.55, '#d7dad0');
    g.addColorStop(1, '#f4f2ea');
  }
  ctx.fillStyle = g;
  ctx.fill(body);
  ctx.save();
  ctx.clip(body);
  if (!brown) {
    // Pink lateral band.
    const band = ctx.createLinearGradient(0, cy - depth * 0.12, 0, cy + depth * 0.18);
    band.addColorStop(0, 'rgba(214,120,140,0)');
    band.addColorStop(0.5, 'rgba(214,120,140,0.75)');
    band.addColorStop(1, 'rgba(214,120,140,0)');
    ctx.fillStyle = band;
    ctx.fillRect(x0, cy - depth * 0.15, len, depth * 0.35);
  }
  // Spots.
  const n = brown ? 70 : 110;
  for (let i = 0; i < n; i++) {
    const px = x0 + len * (0.12 + r() * 0.72);
    const py = cy - depth * 0.5 + r() * depth * (brown ? 0.75 : 0.6);
    if (brown) {
      const red = r() < 0.28 && py > cy - depth * 0.15;
      if (red) {
        ctx.fillStyle = 'rgba(245,235,215,0.8)';
        ctx.beginPath(); ctx.arc(px, py, 6, 0, 7); ctx.fill();
        ctx.fillStyle = '#b8402f';
      } else ctx.fillStyle = 'rgba(40,28,15,0.85)';
      ctx.beginPath(); ctx.arc(px, py, red ? 3.6 : 2.4 + r() * 2.4, 0, 7); ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(30,35,25,0.8)';
      ctx.beginPath(); ctx.arc(px, py, 1.2 + r() * 1.6, 0, 7); ctx.fill();
    }
  }
  // Soft highlight.
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.ellipse(x0 + len * 0.4, cy - depth * 0.25, len * 0.3, depth * 0.08, -0.04, 0, 7);
  ctx.fill();
  ctx.restore();
  // Gill and eye.
  ctx.strokeStyle = 'rgba(40,30,20,0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x0 + len * 0.1, cy, depth * 0.33, -0.9, 0.9);
  ctx.stroke();
  ctx.fillStyle = '#f1e3b5';
  ctx.beginPath(); ctx.arc(x0 + len * 0.045, cy - depth * 0.1, 5.5, 0, 7); ctx.fill();
  ctx.fillStyle = '#1b1712';
  ctx.beginPath(); ctx.arc(x0 + len * 0.046, cy - depth * 0.1, 3.4, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(40,30,20,0.5)';
  ctx.beginPath();
  ctx.moveTo(x0 + 2, cy + 2);
  ctx.lineTo(x0 + len * 0.06, cy + depth * 0.08);
  ctx.stroke();
}
