// Procedural canvas textures — no image assets needed.
import * as THREE from 'three';

export function canvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

export function toTex(c, rx = 1, ry = 1) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 8;
  return t;
}

const rnd = (a, b) => a + Math.random() * (b - a);

function speckle(x, w, h, n, colors, size = 2) {
  for (let i = 0; i < n; i++) {
    x.fillStyle = colors[Math.floor(Math.random() * colors.length)];
    const s = Math.random() * size + 0.5;
    x.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
}

function grime(x, w, h, n, maxR, alpha, color = '0,0,0') {
  for (let i = 0; i < n; i++) {
    const cx = Math.random() * w, cy = Math.random() * h, r = rnd(maxR * 0.3, maxR);
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(${color},${alpha})`); g.addColorStop(1, `rgba(${color},0)`);
    x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
}

function drips(x, w, y0, len, n, alpha, color = '0,0,0') {
  for (let i = 0; i < n; i++) {
    const cx = Math.random() * w, l = rnd(len * 0.3, len), ww = rnd(2, 10);
    const g = x.createLinearGradient(0, y0, 0, y0 + l);
    g.addColorStop(0, `rgba(${color},${alpha})`); g.addColorStop(1, `rgba(${color},0)`);
    x.fillStyle = g; x.fillRect(cx, y0, ww, l);
  }
}

export function wallTex(pal, variant = 0) {
  const W = 256, H = 410;
  const [c, x] = canvas(W, H);
  x.fillStyle = pal.wallTop; x.fillRect(0, 0, W, H);
  speckle(x, W, H, 2500, ['rgba(0,0,0,0.05)', 'rgba(255,255,255,0.04)'], 2);
  const railY = Math.round(H * (1 - 1.0 / 3.2));
  x.fillStyle = pal.wallBottom; x.fillRect(0, railY, W, H - railY);
  speckle(x, W, H - railY, 1200, ['rgba(0,0,0,0.08)', 'rgba(255,255,255,0.03)'], 2);
  // handrail
  x.fillStyle = '#c8d0d2'; x.fillRect(0, railY - 14, W, 10);
  x.fillStyle = 'rgba(0,0,0,0.45)'; x.fillRect(0, railY - 4, W, 4);
  x.fillStyle = 'rgba(255,255,255,0.5)'; x.fillRect(0, railY - 14, W, 2);
  // baseboard
  x.fillStyle = '#121618'; x.fillRect(0, H - 14, W, 14);
  // panel seams
  x.fillStyle = 'rgba(0,0,0,0.22)'; x.fillRect(0, 0, 2, H); x.fillRect(W - 1, 0, 1, H);
  grime(x, W, H, 8 + variant * 6, 70, 0.10 + variant * 0.05);
  drips(x, W, 0, 140, 5 + variant * 6, 0.12);
  drips(x, W, railY, 70, 6, 0.12);
  if (variant === 2) {
    // blood smear / hand prints
    grime(x, W, H, 4, 30, 0.55, '90,6,6');
    for (let i = 0; i < 3; i++) {
      const hx = rnd(40, W - 40), hy = rnd(150, railY - 20);
      x.fillStyle = 'rgba(100,8,8,0.6)';
      x.beginPath(); x.ellipse(hx, hy, 12, 15, 0, 0, Math.PI * 2); x.fill();
      for (let f = 0; f < 4; f++) { x.beginPath(); x.ellipse(hx - 12 + f * 8, hy - 22, 3.5, 9, 0, 0, Math.PI * 2); x.fill(); }
    }
    drips(x, W, 160, 160, 6, 0.4, '90,6,6');
  }
  return toTex(c);
}

export function floorTex(pal) {
  const S = 512; const [c, x] = canvas(S, S);
  const n = 4, ts = S / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const v = rnd(-10, 10);
    x.fillStyle = pal.floor; x.fillRect(i * ts, j * ts, ts, ts);
    x.fillStyle = v > 0 ? `rgba(255,255,255,${v / 220})` : `rgba(0,0,0,${-v / 140})`;
    x.fillRect(i * ts, j * ts, ts, ts);
  }
  speckle(x, S, S, 9000, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.10)', 'rgba(60,80,90,0.15)'], 2.2);
  x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 2;
  for (let i = 0; i <= n; i++) { x.beginPath(); x.moveTo(i * ts, 0); x.lineTo(i * ts, S); x.stroke(); x.beginPath(); x.moveTo(0, i * ts); x.lineTo(S, i * ts); x.stroke(); }
  grime(x, S, S, 14, 90, 0.10);
  // scuff marks
  x.strokeStyle = 'rgba(0,0,0,0.18)'; x.lineWidth = 1.5;
  for (let i = 0; i < 25; i++) { const sx = rnd(0, S), sy = rnd(0, S); x.beginPath(); x.moveTo(sx, sy); x.quadraticCurveTo(sx + rnd(-30, 30), sy + rnd(-30, 30), sx + rnd(-60, 60), sy + rnd(-60, 60)); x.stroke(); }
  return toTex(c);
}

export function ceilTex(pal) {
  const S = 256; const [c, x] = canvas(S, S);
  x.fillStyle = pal.ceiling; x.fillRect(0, 0, S, S);
  speckle(x, S, S, 5000, ['rgba(0,0,0,0.10)', 'rgba(0,0,0,0.05)'], 1.6);
  x.strokeStyle = '#6d7372'; x.lineWidth = 4;
  for (let i = 0; i <= 3; i++) { x.beginPath(); x.moveTo((i * S) / 3, 0); x.lineTo((i * S) / 3, S); x.stroke(); x.beginPath(); x.moveTo(0, (i * S) / 3); x.lineTo(S, (i * S) / 3); x.stroke(); }
  grime(x, S, S, 3, 40, 0.25, '120,90,40');
  return toTex(c);
}

export function steelTex(tint = '#8d969a') {
  const W = 256, H = 256; const [c, x] = canvas(W, H);
  x.fillStyle = tint; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${rnd(0.02, 0.07)})`; x.fillRect(Math.random() * W, 0, 1, H); }
  grime(x, W, H, 4, 60, 0.12);
  return toTex(c);
}

export function concreteTex(base = '#6f726c', stripe = false) {
  const S = 512; const [c, x] = canvas(S, S);
  x.fillStyle = base; x.fillRect(0, 0, S, S);
  speckle(x, S, S, 14000, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.07)'], 2.5);
  grime(x, S, S, 18, 110, 0.14);
  x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 2;
  for (let i = 0; i < 6; i++) { x.beginPath(); let px = rnd(0, S), py = rnd(0, S); x.moveTo(px, py); for (let k = 0; k < 6; k++) { px += rnd(-30, 30); py += rnd(-30, 30); x.lineTo(px, py); } x.stroke(); }
  if (stripe) { x.fillStyle = '#c9a227'; x.fillRect(0, S * 0.45, S, 18); }
  return toTex(c);
}

export function textTex(text, opts = {}) {
  const { w = 512, h = 128, bg = '#0c4a1f', fg = '#7dff9a', font = 'bold 84px Rubik, sans-serif', glow = true, border = null } = opts;
  const [c, x] = canvas(w, h);
  if (bg) { x.fillStyle = bg; x.fillRect(0, 0, w, h); }
  if (border) { x.strokeStyle = border; x.lineWidth = 8; x.strokeRect(4, 4, w - 8, h - 8); }
  x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle';
  if (glow) { x.shadowColor = fg; x.shadowBlur = 18; }
  x.fillStyle = fg; x.fillText(text, w / 2, h / 2 + 4);
  const t = toTex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

const POSTERS = [
  { head: 'WASH YOUR HANDS', body: ['20 seconds.', 'Every time.', 'They can smell', 'what you touched.'], col: '#2f7f95' },
  { head: 'VISITING HOURS', body: ['9:00 AM – 5:00 PM', '', 'After dark, the', 'doors do not open.'], col: '#7a3a8c' },
  { head: 'QUIET PLEASE', body: ['Patients are', 'resting.', '', 'Do NOT wake them.'], col: '#3a6b3a' },
  { head: 'MEET OUR MASCOTS!', body: ['Lop, Grin & Mumbles', 'say GET WELL SOON!', '', ':)'], col: '#c47a1f', faces: true },
  { head: 'MISSING', body: ['Nurse J. Hale', 'Last seen: Ward 13', 'Night shift', 'If found call ext. 13'], col: '#8c2a2a' },
  { head: 'CODE BLUE', body: ['If you hear the', 'shriek, find a locker.', 'Hold your breath.', 'Wait.'], col: '#2a4c8c' },
];

export function posterTex(variant) {
  const P = POSTERS[variant % POSTERS.length];
  const W = 256, H = 352; const [c, x] = canvas(W, H);
  x.fillStyle = '#e9e4d6'; x.fillRect(0, 0, W, H);
  x.fillStyle = P.col; x.fillRect(0, 0, W, 70);
  x.fillStyle = '#fff'; x.font = 'bold 26px Rubik, sans-serif'; x.textAlign = 'center'; x.fillText(P.head, W / 2, 46);
  x.fillStyle = '#222'; x.font = '22px Rubik, sans-serif';
  P.body.forEach((l, i) => x.fillText(l, W / 2, 112 + i * 30));
  if (P.faces) {
    const cols = ['#6f9fd6', '#e89a2c', '#74c493'];
    cols.forEach((col, i) => { const cx = 55 + i * 73, cy = 290; x.fillStyle = col; x.beginPath(); x.arc(cx, cy, 28, 0, Math.PI * 2); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(cx - 9, cy - 4, 7, 0, 7); x.arc(cx + 9, cy - 4, 7, 0, 7); x.fill(); x.fillStyle = '#000'; x.beginPath(); x.arc(cx - 9, cy - 2, 4, 0, 7); x.arc(cx + 9, cy - 2, 4, 0, 7); x.fill(); x.strokeStyle = '#000'; x.lineWidth = 2; x.beginPath(); x.arc(cx, cy + 6, 9, 0.2, Math.PI - 0.2); x.stroke(); });
  }
  grime(x, W, H, 6, 60, 0.2, '80,60,30');
  // torn corner
  x.fillStyle = 'rgba(0,0,0,0)'; x.globalCompositeOperation = 'destination-out';
  x.beginPath(); x.moveTo(W, H); x.lineTo(W - 40, H); x.lineTo(W, H - 50); x.fill();
  x.globalCompositeOperation = 'source-over';
  return toTex(c);
}

const WRITING = ['THEY CAN HEAR YOU', "DON'T RUN", 'HIDE'];
export function writingTex(variant) {
  const W = 512, H = 160; const [c, x] = canvas(W, H);
  x.font = `${variant === 2 ? 110 : 64}px Creepster, cursive`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = 'rgba(110,8,8,0.9)';
  x.fillText(WRITING[variant % WRITING.length], W / 2, H / 2);
  drips(x, W, H / 2, 70, 14, 0.5, '110,8,8');
  const t = toTex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

export function decalTex(type) {
  const S = 128; const [c, x] = canvas(S, S);
  if (type === 'blood') {
    x.fillStyle = 'rgba(70,4,4,0.9)';
    x.beginPath(); x.arc(64, 64, 26, 0, Math.PI * 2); x.fill();
    for (let i = 0; i < 14; i++) { const a = Math.random() * 6.28, r = rnd(20, 56); x.beginPath(); x.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, rnd(2, 9), 0, 7); x.fill(); }
  } else if (type === 'drag') {
    for (let i = 0; i < 4; i++) { x.fillStyle = `rgba(70,4,4,${rnd(0.4, 0.8)})`; x.fillRect(30 + i * 18, 0, rnd(4, 9), S); }
  } else {
    x.fillStyle = '#ddd8c8'; x.fillRect(30, 20, 68, 88);
    x.fillStyle = 'rgba(0,0,0,0.35)'; for (let i = 0; i < 9; i++) x.fillRect(38, 32 + i * 8, rnd(30, 52), 2);
  }
  const t = toTex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

export function faceTex(gender, skin) {
  const S = 128; const [c, x] = canvas(S, S);
  x.fillStyle = skin; x.fillRect(0, 0, S, S);
  x.fillStyle = '#1a1a1a';
  x.beginPath(); x.ellipse(44, 58, 7, 11, 0, 0, Math.PI * 2); x.ellipse(84, 58, 7, 11, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#fff'; x.beginPath(); x.arc(46, 54, 2.5, 0, 7); x.arc(86, 54, 2.5, 0, 7); x.fill();
  x.strokeStyle = '#1a1a1a'; x.lineWidth = 4; x.lineCap = 'round';
  x.beginPath(); x.arc(64, 74, 20, 0.25 * Math.PI, 0.75 * Math.PI); x.stroke();
  if (gender === 'female') {
    x.lineWidth = 3;
    for (const ex of [44, 84]) { x.beginPath(); x.moveTo(ex - 7, 48); x.lineTo(ex - 12, 42); x.moveTo(ex + 7, 48); x.lineTo(ex + 12, 42); x.stroke(); }
    x.fillStyle = 'rgba(255,90,110,0.35)'; x.beginPath(); x.arc(30, 78, 9, 0, 7); x.arc(98, 78, 9, 0, 7); x.fill();
    x.strokeStyle = '#c0485a'; x.lineWidth = 4; x.beginPath(); x.arc(64, 74, 20, 0.3 * Math.PI, 0.7 * Math.PI); x.stroke();
  } else {
    x.lineWidth = 4; x.beginPath(); x.moveTo(34, 42); x.lineTo(54, 44); x.moveTo(74, 44); x.lineTo(94, 42); x.stroke();
  }
  return toTex(c);
}

export function glowTex() {
  const S = 64; const [c, x] = canvas(S, S);
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c); return t;
}

export function lockerTex() {
  const W = 128, H = 256; const [c, x] = canvas(W, H);
  x.fillStyle = '#3d5f7a'; x.fillRect(0, 0, W, H);
  speckle(x, W, H, 1500, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.05)'], 1.5);
  x.fillStyle = 'rgba(0,0,0,0.6)'; x.fillRect(W / 2 - 1, 0, 2, H);
  for (const ox of [10, W / 2 + 10]) {
    for (let i = 0; i < 6; i++) { x.fillRect(ox, 18 + i * 8, W / 2 - 20, 4); x.fillRect(ox, H - 70 + i * 8, W / 2 - 20, 4); }
  }
  x.fillStyle = '#c9cfd2'; x.fillRect(W / 2 - 10, H / 2 - 14, 4, 28); x.fillRect(W / 2 + 6, H / 2 - 14, 4, 28);
  grime(x, W, H, 5, 40, 0.18);
  return toTex(c);
}

export function screenTex(text, color = '#ff4040', bg = '#100404') {
  const W = 256, H = 160; const [c, x] = canvas(W, H);
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  x.fillStyle = color; x.font = 'bold 30px monospace'; x.textAlign = 'center';
  x.shadowColor = color; x.shadowBlur = 10;
  const lines = text.split('\n'); lines.forEach((l, i) => x.fillText(l, W / 2, H / 2 - (lines.length - 1) * 18 + i * 36 + 10));
  for (let y = 0; y < H; y += 4) { x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, y, W, 2); }
  const t = toTex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

export function labelTex(text, color = '#fff') {
  const [c, x] = canvas(256, 64);
  x.font = 'bold 34px Rubik, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = 'rgba(0,0,0,0.5)'; const w = Math.min(250, x.measureText(text).width + 24);
  x.beginPath(); x.roundRect(128 - w / 2, 8, w, 48, 12); x.fill();
  x.fillStyle = color; x.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
