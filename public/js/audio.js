// Procedural nature sounds with the Web Audio API: no sound files needed.

export class Ambience {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.8;
    this.birdTimer = null;
    this.state = { riverLevel: 0.6, riverBright: 0.6, rain: false, part: 'morning', wind: 0.5 };
  }

  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? this.volume : 0;
    // A gentle compressor keeps splashes from jumping out.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);

    this.noise = this.makeNoise(4, 'brown');
    this.white = this.makeNoise(2, 'white');

    // River: deep rumble and a brighter babbling layer.
    this.riverLow = this.loop(this.noise, { type: 'lowpass', freq: 500, q: 0.4 }, 0.5);
    this.riverHigh = this.loop(this.white, { type: 'bandpass', freq: 1800, q: 0.6 }, 0.05);
    this.babble();

    // Wind through leaves.
    this.wind = this.loop(this.white, { type: 'bandpass', freq: 600, q: 0.5 }, 0.0);
    this.gusts();

    // Rain (only on drizzly days).
    this.rain = this.loop(this.white, { type: 'highpass', freq: 3500, q: 0.3 }, 0.0);

    this.apply();
    this.scheduleBird();
  }

  makeNoise(seconds, color) {
    const ctx = this.ctx;
    const len = ctx.sampleRate * seconds;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (color === 'brown') {
          last = (last + 0.02 * w) / 1.02;
          d[i] = last * 3.5;
        } else d[i] = w;
      }
    }
    return buf;
  }

  loop(buffer, filter, gain) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.loopStart = Math.random();
    const f = ctx.createBiquadFilter();
    f.type = filter.type;
    f.frequency.value = filter.freq;
    f.Q.value = filter.q;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(this.master);
    src.start(0, Math.random() * buffer.duration);
    return { src, filter: f, gain: g };
  }

  babble() {
    // Slowly wander the bright layer so the river never sounds like a static hiss.
    const tick = () => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const s = this.state;
      const f = 1200 + Math.random() * 1400 * s.riverBright;
      this.riverHigh.filter.frequency.setTargetAtTime(f, t, 0.6);
      this.riverHigh.gain.gain.setTargetAtTime(s.riverLevel * s.riverBright * (0.05 + Math.random() * 0.07), t, 0.5);
      setTimeout(tick, 600 + Math.random() * 900);
    };
    tick();
  }

  gusts() {
    const tick = () => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const g = this.state.wind * (0.015 + Math.random() * 0.05);
      this.wind.gain.gain.setTargetAtTime(g, t, 1.8);
      this.wind.filter.frequency.setTargetAtTime(400 + Math.random() * 500, t, 2);
      setTimeout(tick, 2500 + Math.random() * 4000);
    };
    tick();
  }

  set(partial) {
    Object.assign(this.state, partial);
    this.apply();
  }

  apply() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.state;
    this.riverLow.gain.gain.setTargetAtTime(0.25 + s.riverLevel * 0.45, t, 1.5);
    this.riverLow.filter.frequency.setTargetAtTime(300 + s.riverBright * 600, t, 1.5);
    const r = typeof s.rain === 'number' ? s.rain : s.rain ? 0.45 : 0;
    this.rain.gain.gain.setTargetAtTime(r * 0.09, t, 2.5);
    this.rain.filter.frequency.setTargetAtTime(3800 - r * 1800, t, 2.5);
    if (r > 0.05 && !this.patterTimer) this.patter();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.ctx) this.master.gain.setTargetAtTime(on ? this.volume : 0, this.ctx.currentTime, 0.3);
  }

  // Individual drops ticking on leaves and water.
  patter() {
    const r = typeof this.state.rain === 'number' ? this.state.rain : this.state.rain ? 0.45 : 0;
    if (r <= 0.05 || !this.ctx) { this.patterTimer = null; return; }
    if (this.enabled && this.ctx.state === 'running') {
      const t = this.ctx.currentTime;
      const n = 1 + Math.floor(r * 4);
      for (let i = 0; i < n; i++) this.tone(t + Math.random() * 0.1, 2500 + Math.random() * 3000, 1500, 0.015, 0.006 + r * 0.008, Math.random() * 1.6 - 0.8, 'sine');
    }
    this.patterTimer = setTimeout(() => this.patter(), 60 + Math.random() * 120);
  }

  // --- Birds -------------------------------------------------------------

  scheduleBird() {
    const part = this.state.part;
    const busy = { dawn: 1.6, morning: 1.3, midday: 0.6, afternoon: 0.7, evening: 1.1, dusk: 0.5 }[part] ?? 1;
    const wait = (3000 + Math.random() * 9000) / busy;
    this.birdTimer = setTimeout(() => {
      if (this.enabled && this.ctx && this.ctx.state === 'running') this.bird();
      this.scheduleBird();
    }, wait);
  }

  tone(t, f0, f1, dur, gain, pan = 0, type = 'sine') {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.02, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) {
      p.pan.value = pan;
      o.connect(g).connect(p).connect(this.master);
    } else o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // A song from a particular bird you can see: panned and scaled by distance.
  birdAt(pan, vol = 1) {
    if (!this.ctx || !this.enabled || this.ctx.state !== 'running') return;
    this.bird(pan, vol);
  }

  bird(panOverride, volMul = 1) {
    const t = this.ctx.currentTime + 0.05;
    const pan = panOverride ?? Math.random() * 1.6 - 0.8;
    const v = (0.025 + Math.random() * 0.03) * volMul;
    const part = this.state.part;
    const r = Math.random();
    if ((part === 'evening' || part === 'dusk') && r < 0.55) {
      // Blackbird-like: slow, fluting phrase.
      let tt = t;
      const notes = 3 + Math.floor(Math.random() * 4);
      let f = 1300 + Math.random() * 600;
      for (let i = 0; i < notes; i++) {
        const nf = f * (0.85 + Math.random() * 0.4);
        const d = 0.12 + Math.random() * 0.22;
        this.tone(tt, f, nf, d, v * 1.1, pan);
        tt += d + 0.03;
        f = nf;
      }
    } else if (r < 0.35) {
      // Chaffinch-like: an accelerating run of chips.
      let tt = t;
      const n = 6 + Math.floor(Math.random() * 6);
      for (let i = 0; i < n; i++) {
        const f = 3600 - i * 120 + Math.random() * 200;
        this.tone(tt, f, f * 0.8, 0.05, v, pan);
        tt += 0.11 - i * 0.006;
      }
      this.tone(tt + 0.04, 2600, 4200, 0.18, v * 1.2, pan);
    } else if (r < 0.65) {
      // A soft two-note whistle.
      const f = 2400 + Math.random() * 1200;
      this.tone(t, f, f * 1.05, 0.22, v, pan);
      this.tone(t + 0.3, f * 0.82, f * 0.8, 0.28, v, pan);
    } else if (r < 0.85) {
      // A wren-style trill.
      let tt = t;
      const base = 4200 + Math.random() * 1500;
      for (let i = 0; i < 14; i++) {
        this.tone(tt, base, base * 0.7, 0.035, v * 0.8, pan, 'triangle');
        tt += 0.045;
      }
    } else {
      // A dipper's sharp "zit" calls over the water.
      for (let i = 0; i < 3; i++) this.tone(t + i * 0.18, 5200, 4400, 0.04, v * 0.9, pan);
    }
  }

  // --- Effects -----------------------------------------------------------

  burst(dur, filter, gain, freq) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq[0], t);
    f.frequency.exponentialRampToValueAtTime(freq[1], t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  cast() {
    this.burst(0.45, 'bandpass', 0.12, [500, 2200]);
  }

  plop() {
    this.burst(0.12, 'lowpass', 0.06, [1400, 300]);
  }

  splash(big = 1) {
    this.burst(0.5 + 0.3 * big, 'lowpass', 0.18 * big + 0.05, [3000, 400]);
  }

  click(pitch = 1800, vol = 0.03) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(t, pitch, pitch * 0.83, 0.025, vol, 0, 'square');
  }

  // A fish rising: a soft sip for a small trout, a deep splash for a big one.
  // size runs from about 0.2 (25 cm) to 1.5 (60 cm+).
  rise(size, vol = 1, pan = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const v = vol * (0.5 + size * 0.6);
    this.burst(0.12 + size * 0.3, 'lowpass', 0.035 * v * (0.6 + size), [2200 - size * 600, 260]);
    this.tone(t, 420 - size * 120, 880 - size * 300, 0.06 + size * 0.04, 0.03 * v, pan, 'sine');
    if (size > 0.7) {
      // The heavy "bloop" of a big fish turning down.
      this.tone(t + 0.02, 160, 70, 0.22, 0.05 * v * size, pan, 'sine');
      this.burst(0.35 + size * 0.2, 'bandpass', 0.03 * v, [900, 300]);
    }
  }

  // A fish surging up from below before it jumps: a rising, swelling swirl.
  surge() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.burst(0.9, 'bandpass', 0.07, [300, 1400]);
    this.tone(t, 110, 240, 0.8, 0.05, 0, 'sine');
  }

  // A trout sipping something off the surface.
  sip(vol = 1, pan = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.burst(0.18, 'bandpass', 0.05 * vol, [1200, 350]);
    this.tone(t, 380, 820, 0.07, 0.035 * vol, pan, 'sine');
  }

  scream() {
    // A fish taking line off the reel.
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 10; i++) this.tone(t + i * 0.03, 2300, 2200, 0.02, 0.02, 0, 'square');
  }

  chime() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [523, 659, 784, 1046].forEach((f, i) => this.tone(t + i * 0.12, f, f, 0.9, 0.05, 0, 'sine'));
  }

  snap() {
    this.burst(0.08, 'highpass', 0.15, [3000, 2000]);
  }
}
