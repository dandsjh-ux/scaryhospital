// Fully procedural WebAudio: ambience, footsteps, monster growls, UI sounds.
export class Sound {
  constructor() { this.ctx = null; this.listener = { x: 0, z: 0, yaw: 0 }; this.danger = 0; }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 0.8; this.master.connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0); let last = 0;
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = this.brown.getChannelData(0);
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; d[i] = w; last = (last + 0.02 * w) / 1.02; b[i] = last * 3.5; }
    this.startAmbient();
  }

  setListener(x, z, yaw) { this.listener.x = x; this.listener.z = z; this.listener.yaw = yaw; }

  spatial(x, z, maxDist = 40) {
    const L = this.listener; const dx = x - L.x, dz = z - L.z; const d = Math.hypot(dx, dz);
    if (d > maxDist) return null;
    const rx = Math.cos(L.yaw), rz = -Math.sin(L.yaw);
    const pan = d > 0.01 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) * 0.85 : 0;
    const vol = 1 / (1 + (d * d) / 30);
    return { pan, vol, d };
  }

  out(vol, pan = 0) {
    const g = this.ctx.createGain(); g.gain.value = vol;
    if (this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(this.master); }
    else g.connect(this.master);
    return g;
  }

  startAmbient() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.brown; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
    const g = ctx.createGain(); g.gain.value = 0.12;
    src.connect(lp); lp.connect(g); g.connect(this.master); src.start();
    for (const [f, v] of [[60, 0.018], [120, 0.009], [180.5, 0.004]]) {
      const o = ctx.createOscillator(); o.frequency.value = f; const og = ctx.createGain(); og.gain.value = v; o.connect(og); og.connect(this.master); o.start();
    }
    // danger drone (heartbeat + low tension), gain driven by setDanger
    this.dangerGain = ctx.createGain(); this.dangerGain.gain.value = 0; this.dangerGain.connect(this.master);
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 43;
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 43.7;
    const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 180;
    o1.connect(dl); o2.connect(dl); dl.connect(this.dangerGain); o1.start(); o2.start();
    this.nextCreak = ctx.currentTime + 6; this.nextBeat = 0;
  }

  setDanger(v) { this.danger = v; }

  tick() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.dangerGain.gain.setTargetAtTime(this.danger * 0.22, t, 0.3);
    if (this.danger > 0.15 && t > this.nextBeat) {
      this.nextBeat = t + 1.05 - this.danger * 0.55;
      this.thump(0.5 * this.danger, 55); setTimeout(() => this.thump(0.35 * this.danger, 50), 180);
    }
    if (t > this.nextCreak) {
      this.nextCreak = t + 7 + Math.random() * 14;
      const a = Math.random() * Math.PI * 2, r = 12 + Math.random() * 20;
      const r2 = Math.random();
      if (r2 < 0.4) this.creak(this.listener.x + Math.cos(a) * r, this.listener.z + Math.sin(a) * r);
      else if (r2 < 0.7) this.distantBang(this.listener.x + Math.cos(a) * r, this.listener.z + Math.sin(a) * r);
      else this.whimper(this.listener.x + Math.cos(a) * r, this.listener.z + Math.sin(a) * r);
    }
  }

  // ---------- primitives
  burst({ dur = 0.1, type = 'bandpass', freq = 800, q = 1, vol = 0.3, pan = 0, attack = 0.005, sweep = null }) {
    if (!this.ctx) return; const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.out(1, pan));
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }
  tone({ f = 440, f2 = null, dur = 0.2, type = 'sine', vol = 0.2, pan = 0, attack = 0.01, delay = 0 }) {
    if (!this.ctx) return; const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.out(1, pan)); o.start(t); o.stop(t + dur + 0.05);
  }
  thump(vol = 0.4, f = 60) { this.tone({ f: f * 1.6, f2: f, dur: 0.18, vol, attack: 0.004 }); }

  // ---------- game sounds
  step(vol = 0.12, crouch = false) { this.burst({ dur: crouch ? 0.06 : 0.09, type: 'lowpass', freq: crouch ? 500 : 900, vol: vol * (crouch ? 0.4 : 1) }); this.tone({ f: 90, f2: 60, dur: 0.07, vol: vol * 0.5 }); }
  monsterStep(x, z, heavy = 1) { const s = this.spatial(x, z, 30); if (!s) return; this.burst({ dur: 0.12, type: 'lowpass', freq: 350, vol: 0.5 * s.vol * heavy, pan: s.pan }); this.tone({ f: 70, f2: 45, dur: 0.12, vol: 0.35 * s.vol * heavy, pan: s.pan }); }
  growl(x, z, pitch = 1) {
    const s = this.spatial(x, z, 45); if (!s || !this.ctx) return; const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(85 * pitch, t); o.frequency.linearRampToValueAtTime(55 * pitch, t + 1.3);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 11; const lg = ctx.createGain(); lg.gain.value = 18 * pitch; lfo.connect(lg); lg.connect(o.frequency);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.7 * s.vol, t + 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    o.connect(f); f.connect(g); g.connect(this.out(1, s.pan)); o.start(t); lfo.start(t); o.stop(t + 1.5); lfo.stop(t + 1.5);
    this.burst({ dur: 1.0, type: 'bandpass', freq: 400 * pitch, q: 2, vol: 0.25 * s.vol, pan: s.pan, attack: 0.05 });
  }
  shriek(x, z) {
    const s = this.spatial(x, z, 60); if (!s || !this.ctx) return; const ctx = this.ctx, t = ctx.currentTime;
    for (const det of [0, 7, -5]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(700 + det * 10, t); o.frequency.exponentialRampToValueAtTime(1500 + det * 20, t + 0.4); o.frequency.exponentialRampToValueAtTime(900, t + 1.3);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 23 + det; const lg = ctx.createGain(); lg.gain.value = 60; lfo.connect(lg); lg.connect(o.frequency);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 1.5;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35 * Math.max(0.25, s.vol), t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      o.connect(f); f.connect(g); g.connect(this.out(1, s.pan)); o.start(t); lfo.start(t); o.stop(t + 1.5); lfo.stop(t + 1.5);
    }
  }
  sting() { this.tone({ f: 110, f2: 55, dur: 1.4, type: 'sawtooth', vol: 0.25 }); this.tone({ f: 1661, dur: 0.9, type: 'square', vol: 0.05 }); this.tone({ f: 1760, dur: 0.9, type: 'square', vol: 0.05 }); this.burst({ dur: 0.5, type: 'highpass', freq: 3000, vol: 0.15 }); }
  hurt() { this.burst({ dur: 0.3, type: 'lowpass', freq: 1200, vol: 0.6 }); this.thump(0.7, 50); this.tone({ f: 300, f2: 120, dur: 0.35, type: 'sawtooth', vol: 0.12 }); }
  pickup() { this.tone({ f: 880, dur: 0.12, vol: 0.12 }); this.tone({ f: 1320, dur: 0.18, vol: 0.12, delay: 0.08 }); }
  task() { [523, 659, 784, 1046].forEach((f, i) => this.tone({ f, dur: 0.3, vol: 0.12, delay: i * 0.1, type: 'triangle' })); }
  ding() { this.tone({ f: 1318, dur: 1.6, vol: 0.2 }); this.tone({ f: 1046, dur: 1.8, vol: 0.18, delay: 0.35 }); }
  alarm() { for (let i = 0; i < 4; i++) this.tone({ f: i % 2 ? 620 : 820, dur: 0.28, type: 'square', vol: 0.07, delay: i * 0.3 }); }
  buzz() { this.tone({ f: 110, dur: 0.6, type: 'square', vol: 0.15 }); }
  click() { this.tone({ f: 2000, f2: 1200, dur: 0.03, type: 'square', vol: 0.06 }); }
  locker() { this.burst({ dur: 0.25, type: 'bandpass', freq: 1800, q: 6, vol: 0.35 }); this.thump(0.3, 90); }
  rummage() { for (let i = 0; i < 3; i++) setTimeout(() => this.burst({ dur: 0.12, type: 'bandpass', freq: 1200 + Math.random() * 1500, q: 2, vol: 0.12 }), i * 140); }
  swing() { this.burst({ dur: 0.25, type: 'bandpass', freq: 600, sweep: 2400, q: 1.5, vol: 0.3 }); }
  smack() { this.thump(0.8, 70); this.burst({ dur: 0.12, type: 'bandpass', freq: 2500, q: 3, vol: 0.4 }); }
  spray() { this.burst({ dur: 1.0, type: 'highpass', freq: 2500, vol: 0.35, attack: 0.03 }); }
  dart() { this.burst({ dur: 0.08, type: 'bandpass', freq: 3000, q: 1, vol: 0.5 }); this.tone({ f: 200, f2: 80, dur: 0.1, vol: 0.2 }); }
  skillOk() { this.tone({ f: 1046, dur: 0.12, vol: 0.12, type: 'triangle' }); }
  skillFail() { this.burst({ dur: 0.35, type: 'bandpass', freq: 900, q: 4, vol: 0.5 }); this.tone({ f: 150, dur: 0.3, type: 'square', vol: 0.12 }); }
  creak(x, z) { const s = this.spatial(x, z, 50); if (!s) return; this.tone({ f: 180 + Math.random() * 120, f2: 140, dur: 0.8, type: 'sawtooth', vol: 0.04 * (0.4 + s.vol), pan: s.pan, attack: 0.2 }); }
  distantBang(x, z) { const s = this.spatial(x, z, 50); if (!s) return; this.burst({ dur: 0.5, type: 'lowpass', freq: 300, vol: 0.25 * (0.3 + s.vol), pan: s.pan }); }
  whimper(x, z) { const s = this.spatial(x, z, 50); if (!s) return; this.tone({ f: 520, f2: 380, dur: 1.2, type: 'triangle', vol: 0.03 * (0.4 + s.vol), pan: s.pan, attack: 0.3 }); }
}
