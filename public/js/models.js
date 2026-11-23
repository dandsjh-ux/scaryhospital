// Procedural low-poly models: hospital props, task stations, pickups,
// blocky player avatars and the creepy mascot monsters.
import * as THREE from 'three';
import { faceTex, lockerTex, posterTex, writingTex, screenTex, textTex, glowTex, labelTex } from './textures.js';

// ------------------------------------------------------------------ helpers
const matCache = new Map();
export function mat(color, o = {}) {
  const key = color + '|' + JSON.stringify(o);
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({
      color, roughness: o.r ?? 0.8, metalness: o.m ?? 0,
      emissive: o.e ?? 0x000000, emissiveIntensity: o.ei ?? 1,
      transparent: !!o.t, opacity: o.o ?? 1, depthWrite: !o.t,
      side: o.ds ? THREE.DoubleSide : THREE.FrontSide,
    }));
  }
  return matCache.get(key);
}
const texMatCache = new Map();
function texMat(key, make, o = {}) {
  if (!texMatCache.has(key)) {
    const m = o.basic
      ? new THREE.MeshBasicMaterial({ map: make(), transparent: !!o.t, depthWrite: !o.t, toneMapped: false })
      : new THREE.MeshStandardMaterial({ map: make(), roughness: o.r ?? 0.8, metalness: o.m ?? 0, transparent: !!o.t, depthWrite: !o.t, polygonOffset: !!o.t, polygonOffsetFactor: -2 });
    texMatCache.set(key, m);
  }
  return texMatCache.get(key);
}

function add(p, geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); p.add(m); return m;
}
const box = (p, w, h, d, mt, x, y, z, rx, ry, rz) => add(p, new THREE.BoxGeometry(w, h, d), mt, x, y, z, rx, ry, rz);
const cyl = (p, rt, rb, h, mt, x, y, z, rx, ry, rz, seg = 12) => add(p, new THREE.CylinderGeometry(rt, rb, h, seg), mt, x, y, z, rx, ry, rz);
const sph = (p, r, mt, x, y, z, sx = 1, sy = 1, sz = 1, seg = 16) => { const m = add(p, new THREE.SphereGeometry(r, seg, Math.max(8, (seg * 0.75) | 0)), mt, x, y, z); m.scale.set(sx, sy, sz); return m; };
const cap = (p, r, len, mt, x, y, z, rx, ry, rz) => add(p, new THREE.CapsuleGeometry(r, len, 4, 10), mt, x, y, z, rx, ry, rz);
const tor = (p, R, t, mt, x, y, z, rx, ry, rz, arc = Math.PI * 2) => add(p, new THREE.TorusGeometry(R, t, 8, 22, arc), mt, x, y, z, rx, ry, rz);
const cone = (p, r, h, mt, x, y, z, rx, ry, rz, seg = 8) => add(p, new THREE.ConeGeometry(r, h, seg), mt, x, y, z, rx, ry, rz);
const plane = (p, w, h, mt, x, y, z, rx, ry, rz) => add(p, new THREE.PlaneGeometry(w, h), mt, x, y, z, rx, ry, rz);

const M = {
  get metal() { return mat(0xa3abae, { r: 0.35, m: 0.7 }); },
  get dark() { return mat(0x2c3134, { r: 0.6, m: 0.4 }); },
  get white() { return mat(0xdfe5e6, { r: 0.55 }); },
  get sheet() { return mat(0xe6eae8, { r: 0.95 }); },
  get rubber() { return mat(0x141414, { r: 0.95 }); },
  get blue() { return mat(0x2e5d8c, { r: 0.45 }); },
  get wood() { return mat(0x6b5135, { r: 0.8 }); },
  get card() { return mat(0x9c7a4c, { r: 0.95 }); },
  get beige() { return mat(0x9c978a, { r: 0.6, m: 0.2 }); },
  get blood() { return mat(0x4a0505, { r: 0.4 }); },
  get teal() { return mat(0x3f7f8c, { r: 0.9 }); },
};

function wheel(p, x, y, z, r = 0.05) { cyl(p, r, r, 0.04, M.rubber, x, y, z, 0, 0, Math.PI / 2, 10); }

// ------------------------------------------------------------------ props
export function buildProp(p) {
  const g = new THREE.Group();
  switch (p.type) {
    case 'bed': {
      box(g, 1.0, 0.1, 2.0, M.metal, 0, 0.48, 0);
      box(g, 0.95, 0.18, 1.9, mat(0xd5dde0, { r: 0.9 }), 0, 0.62, 0);
      box(g, 0.98, 0.09, 1.15, Math.random() < 0.5 ? M.teal : mat(0x8a96a8, { r: 0.95 }), 0, 0.74, 0.35, 0.03, 0, 0);
      box(g, 0.7, 0.12, 0.34, M.sheet, 0, 0.77, -0.72, -0.15, 0, 0);
      box(g, 1.05, 0.95, 0.06, mat(0x8e9aa0, { r: 0.4, m: 0.5 }), 0, 0.72, -1.0);
      box(g, 1.05, 0.5, 0.06, mat(0x8e9aa0, { r: 0.4, m: 0.5 }), 0, 0.55, 1.0);
      for (const s of [-1, 1]) { box(g, 0.03, 0.18, 1.1, M.metal, s * 0.52, 0.8, 0.05); for (const e of [-1, 1]) { cyl(g, 0.025, 0.025, 0.42, M.metal, s * 0.45, 0.23, e * 0.92); wheel(g, s * 0.45, 0.05, e * 0.92); } }
      if (Math.random() < 0.3) box(g, 0.4, 0.005, 0.5, M.blood, 0.1, 0.785, 0.4);
      break;
    }
    case 'gurney': case 'sheetgurney': {
      box(g, 0.75, 0.08, 1.95, M.metal, 0, 0.78, 0);
      box(g, 0.7, 0.08, 1.85, mat(0x5b7c8a, { r: 0.7 }), 0, 0.86, 0);
      for (const s of [-1, 1]) for (const e of [-1, 1]) { cyl(g, 0.02, 0.02, 0.74, M.metal, s * 0.32, 0.4, e * 0.85); wheel(g, s * 0.32, 0.05, e * 0.85); }
      box(g, 0.7, 0.03, 0.03, M.metal, 0, 0.25, 0.85); box(g, 0.7, 0.03, 0.03, M.metal, 0, 0.25, -0.85);
      if (p.type === 'sheetgurney') {
        sph(g, 0.3, M.sheet, 0, 0.98, 0.15, 1, 0.45, 2.6);
        sph(g, 0.17, M.sheet, 0, 1.0, -0.72, 1, 0.8, 1.1);
        sph(g, 0.08, M.sheet, -0.12, 0.97, 0.85, 1, 1, 1.3); sph(g, 0.08, M.sheet, 0.12, 0.97, 0.85, 1, 1, 1.3);
        box(g, 0.25, 0.005, 0.3, M.blood, 0.08, 1.06, 0.1);
        box(g, 0.06, 0.003, 0.06, mat(0xb8a9a0), 0.2, 0.9, 0.95); // toe tag
      }
      break;
    }
    case 'wheelchair': {
      const fr = mat(0x2a2d30, { r: 0.4, m: 0.6 });
      box(g, 0.48, 0.05, 0.45, mat(0x1d3a5c, { r: 0.8 }), 0, 0.5, 0.02);
      box(g, 0.48, 0.48, 0.04, mat(0x1d3a5c, { r: 0.8 }), 0, 0.78, -0.22, -0.12, 0, 0);
      for (const s of [-1, 1]) {
        tor(g, 0.28, 0.022, M.rubber, s * 0.29, 0.3, -0.05, 0, Math.PI / 2, 0);
        tor(g, 0.24, 0.008, fr, s * 0.31, 0.3, -0.05, 0, Math.PI / 2, 0);
        box(g, 0.03, 0.03, 0.45, fr, s * 0.26, 0.68, 0.0);
        cyl(g, 0.012, 0.012, 0.55, fr, s * 0.24, 0.35, 0.28, 0.3, 0, 0);
        wheel(g, s * 0.22, 0.06, 0.34, 0.06);
        box(g, 0.12, 0.02, 0.1, fr, s * 0.1, 0.12, 0.42);
      }
      break;
    }
    case 'ivstand': {
      cyl(g, 0.014, 0.014, 1.95, M.metal, 0, 0.98, 0);
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; box(g, 0.025, 0.025, 0.28, M.metal, Math.sin(a) * 0.13, 0.05, Math.cos(a) * 0.13, 0, a, 0); wheel(g, Math.sin(a) * 0.26, 0.03, Math.cos(a) * 0.26, 0.03); }
      box(g, 0.3, 0.015, 0.015, M.metal, 0, 1.92, 0);
      box(g, 0.13, 0.22, 0.04, mat(0xcfe6ee, { r: 0.2, t: true, o: 0.55 }), 0.12, 1.72, 0);
      cyl(g, 0.004, 0.004, 0.9, mat(0xcfe6ee, { r: 0.3, t: true, o: 0.6 }), 0.13, 1.17, 0.02);
      break;
    }
    case 'chairrow': case 'chairrow2': {
      const n = p.type === 'chairrow' ? 5 : 2, w = n * 0.6;
      const pl = mat(0x2e5d8c, { r: 0.4 });
      box(g, w, 0.06, 0.08, M.dark, 0, 0.36, -0.05);
      for (const s of [-1, 1]) { box(g, 0.05, 0.36, 0.05, M.dark, s * (w / 2 - 0.1), 0.18, -0.05); box(g, 0.05, 0.03, 0.5, M.dark, s * (w / 2 - 0.1), 0.02, -0.05); }
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + 0.3 + i * 0.6;
        box(g, 0.52, 0.06, 0.48, pl, x, 0.45, 0.04);
        box(g, 0.52, 0.5, 0.05, pl, x, 0.75, -0.23, -0.12, 0, 0);
      }
      break;
    }
    case 'chair': {
      const pl = mat(0x2e5d8c, { r: 0.4 });
      box(g, 0.48, 0.05, 0.45, pl, 0, 0.45, 0); box(g, 0.48, 0.45, 0.05, pl, 0, 0.72, -0.21, -0.1, 0, 0);
      for (const s of [-1, 1]) for (const e of [-1, 1]) cyl(g, 0.015, 0.015, 0.45, M.dark, s * 0.2, 0.22, e * 0.18);
      break;
    }
    case 'desk': {
      const top = mat(0x8a7b66, { r: 0.7 });
      box(g, 1.4, 0.05, 0.7, top, 0, 0.75, 0);
      box(g, 0.45, 0.72, 0.66, M.beige, -0.46, 0.36, 0);
      for (let i = 0; i < 3; i++) { box(g, 0.4, 0.005, 0.01, M.dark, -0.46, 0.2 + i * 0.22, 0.335); box(g, 0.12, 0.02, 0.02, M.metal, -0.46, 0.13 + i * 0.22, 0.34); }
      box(g, 0.04, 0.72, 0.66, M.beige, 0.68, 0.36, 0);
      box(g, 1.3, 0.4, 0.02, M.beige, 0.1, 0.52, -0.32);
      box(g, 0.45, 0.32, 0.04, M.dark, 0.2, 1.0, -0.15);
      box(g, 0.4, 0.27, 0.005, mat(0x0a1612, { r: 0.2, e: 0x0b2a24, ei: 0.6 }), 0.2, 1.0, -0.128);
      box(g, 0.06, 0.15, 0.06, M.dark, 0.2, 0.83, -0.15);
      box(g, 0.4, 0.02, 0.14, M.dark, 0.2, 0.785, 0.1);
      box(g, 0.21, 0.004, 0.29, M.sheet, -0.3, 0.778, 0.05, 0, 0.3, 0);
      break;
    }
    case 'filecabinet': {
      box(g, 0.5, 1.3, 0.58, mat(0x7f7d72, { r: 0.5, m: 0.3 }), 0, 0.65, 0);
      for (let i = 0; i < 4; i++) { box(g, 0.46, 0.005, 0.01, M.dark, 0, 0.32 * i + 0.32, 0.29); box(g, 0.14, 0.03, 0.03, M.metal, 0, 0.32 * i + 0.2, 0.3); }
      break;
    }
    case 'medcabinet': {
      box(g, 0.7, 0.8, 0.22, M.white, 0, 1.45, 0);
      box(g, 0.62, 0.72, 0.01, mat(0x9fc4cc, { r: 0.1, m: 0.2, t: true, o: 0.5 }), 0, 1.45, 0.112);
      box(g, 0.24, 0.07, 0.01, mat(0xc0201c), 0, 1.72, 0.12); box(g, 0.07, 0.24, 0.01, mat(0xc0201c), 0, 1.72, 0.12);
      for (let i = 0; i < 4; i++) cyl(g, 0.03, 0.03, 0.1, mat([0xe67e22, 0xffffff, 0x2980b9, 0x27ae60][i], { r: 0.4 }), -0.22 + i * 0.14, 1.3, 0.0);
      break;
    }
    case 'shelf': {
      for (const s of [-1, 1]) for (const e of [-1, 1]) box(g, 0.04, 2.0, 0.04, M.metal, s * 0.78, 1.0, e * 0.22);
      for (let i = 0; i < 4; i++) {
        box(g, 1.6, 0.03, 0.48, M.metal, 0, 0.1 + i * 0.6, 0);
        for (let k = 0; k < 3; k++) if (Math.random() < 0.7) {
          const w = 0.25 + Math.random() * 0.25, h = 0.15 + Math.random() * 0.3;
          box(g, w, h, 0.35, Math.random() < 0.6 ? M.card : M.white, -0.5 + k * 0.5 + (Math.random() - 0.5) * 0.1, 0.12 + i * 0.6 + h / 2, 0);
        }
      }
      break;
    }
    case 'crate': {
      box(g, 0.8, 0.6, 0.8, M.card, 0, 0.3, 0, 0, (Math.random() - 0.5) * 0.2, 0);
      box(g, 0.82, 0.08, 0.1, mat(0xb9a57a), 0, 0.6, 0);
      if (Math.random() < 0.5) box(g, 0.5, 0.35, 0.5, M.card, 0.05, 0.78, 0.05, 0, 0.5, 0);
      break;
    }
    case 'locker': {
      box(g, 0.95, 2.0, 0.58, mat(0x34536b, { r: 0.5, m: 0.4 }), 0, 1.0, 0);
      plane(g, 0.93, 1.96, texMat('locker', lockerTex, { r: 0.5, m: 0.3 }), 0, 1.0, 0.292);
      box(g, 0.97, 0.04, 0.6, M.dark, 0, 2.0, 0);
      break;
    }
    case 'vending': {
      box(g, 1.0, 1.9, 0.78, mat(0x6a1b1b, { r: 0.5, m: 0.3 }), 0, 0.95, 0);
      box(g, 0.62, 1.3, 0.02, mat(0x223344, { r: 0.1, e: 0x1a3550, ei: 0.8 }), -0.12, 1.15, 0.395);
      for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) box(g, 0.1, 0.16, 0.05, mat([0xd33, 0x3a3, 0xfc3, 0x39f][(r + c) % 4], { r: 0.4, e: [0x400, 0x040, 0x430, 0x024][(r + c) % 4] }), -0.38 + c * 0.17, 0.62 + r * 0.25, 0.37);
      box(g, 0.18, 0.5, 0.02, M.dark, 0.33, 1.2, 0.395);
      box(g, 0.5, 0.15, 0.02, M.rubber, -0.12, 0.28, 0.395);
      break;
    }
    case 'plant': {
      cyl(g, 0.2, 0.15, 0.4, mat(0x5a4636), 0, 0.2, 0);
      for (let i = 0; i < 7; i++) { const a = i * 0.9; cone(g, 0.06, 0.6, mat(0x5a5a2a, { r: 0.9 }), Math.sin(a) * 0.08, 0.6, Math.cos(a) * 0.08, Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5); }
      break;
    }
    case 'tv': {
      box(g, 1.0, 0.6, 0.06, M.rubber, 0, 2.25, 0);
      box(g, 0.92, 0.52, 0.005, mat(0x1d2a33, { r: 0.2, e: 0x22343f, ei: 0.7 }), 0, 2.25, 0.033);
      break;
    }
    case 'sink': {
      box(g, 0.55, 0.15, 0.45, M.white, 0, 0.85, 0); cyl(g, 0.08, 0.1, 0.78, M.white, 0, 0.39, -0.05);
      cyl(g, 0.015, 0.015, 0.15, M.metal, 0, 1.0, -0.15);
      box(g, 0.55, 0.7, 0.02, mat(0x8a9599, { r: 0.08, m: 0.9 }), 0, 1.55, -0.22);
      break;
    }
    case 'trash': cyl(g, 0.2, 0.17, 0.55, mat(0x5b6266, { r: 0.6, m: 0.3 }), 0, 0.275, 0); break;
    case 'wetsign': {
      const y = mat(0xf2c418, { r: 0.5 });
      box(g, 0.32, 0.65, 0.02, y, 0, 0.32, 0.1, 0.18, 0, 0); box(g, 0.32, 0.65, 0.02, y, 0, 0.32, -0.1, -0.18, 0, 0);
      break;
    }
    case 'cart': {
      for (let i = 0; i < 3; i++) box(g, 0.85, 0.03, 0.5, M.metal, 0, 0.15 + i * 0.4, 0);
      for (const s of [-1, 1]) for (const e of [-1, 1]) { cyl(g, 0.015, 0.015, 0.95, M.metal, s * 0.4, 0.5, e * 0.22); wheel(g, s * 0.4, 0.04, e * 0.22, 0.04); }
      for (let k = 0; k < 4; k++) cyl(g, 0.04, 0.04, 0.14, mat([0xffffff, 0xd33, 0x8cf, 0xfc6][k], { r: 0.3 }), -0.3 + k * 0.2, 0.62, 0);
      box(g, 0.3, 0.02, 0.2, M.metal, 0.2, 0.97, 0);
      break;
    }
    case 'opTable': {
      cyl(g, 0.2, 0.3, 0.8, M.metal, 0, 0.4, 0);
      box(g, 0.75, 0.1, 2.0, mat(0x2a3f45, { r: 0.6 }), 0, 0.85, 0);
      box(g, 0.3, 0.005, 0.5, M.blood, -0.1, 0.905, 0.2);
      cyl(g, 0.03, 0.03, 0.8, M.metal, 0, 2.8, 0);
      cyl(g, 0.45, 0.35, 0.15, M.white, 0, 2.35, 0);
      for (let i = 0; i < 5; i++) { const a = (i / 5) * 6.28; cyl(g, 0.07, 0.07, 0.02, mat(0x666655, { e: 0x111108 }), Math.sin(a) * 0.22, 2.27, Math.cos(a) * 0.22); }
      break;
    }
    case 'morguewall': {
      const st = mat(0x9aa2a5, { r: 0.3, m: 0.8 });
      box(g, 1.9, 2.2, 0.66, mat(0x6c7376, { r: 0.4, m: 0.6 }), 0, 1.1, 0);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) {
        box(g, 0.82, 0.6, 0.04, st, -0.45 + c * 0.9, 0.42 + r * 0.7, 0.34);
        box(g, 0.2, 0.04, 0.05, M.dark, -0.45 + c * 0.9, 0.55 + r * 0.7, 0.37);
        box(g, 0.12, 0.06, 0.005, M.sheet, -0.7 + c * 0.9, 0.62 + r * 0.7, 0.362);
      }
      break;
    }
    case 'tank': {
      cyl(g, 0.45, 0.45, 2.2, mat(0x6e5a44, { r: 0.7, m: 0.5 }), 0, 1.1, 0, 0, 0, 0, 16);
      cyl(g, 0.08, 0.08, 1.2, M.dark, 0.2, 2.6, 0);
      cyl(g, 0.06, 0.06, 0.9, M.dark, 0, 1.6, 0.45, Math.PI / 2, 0, 0);
      tor(g, 0.46, 0.02, M.dark, 0, 0.4, 0, Math.PI / 2, 0, 0); tor(g, 0.46, 0.02, M.dark, 0, 1.8, 0, Math.PI / 2, 0, 0);
      cyl(g, 0.12, 0.12, 0.02, mat(0xe0e0d0), 0.0, 1.3, 0.455, Math.PI / 2, 0, 0);
      break;
    }
    case 'toolbox': {
      box(g, 0.65, 0.35, 0.4, mat(0xa82323, { r: 0.5, m: 0.4 }), 0, 0.175, 0);
      box(g, 0.4, 0.04, 0.04, M.dark, 0, 0.4, 0);
      box(g, 0.66, 0.02, 0.41, M.dark, 0, 0.3, 0);
      break;
    }
    case 'poster': {
      plane(g, 0.75, 1.03, texMat('poster' + (p.variant || 0), () => posterTex(p.variant || 0), { r: 0.9 }), 0, 1.6, 0.02);
      break;
    }
    case 'writing': {
      plane(g, 1.8, 0.56, texMat('writing' + (p.variant || 0), () => writingTex(p.variant || 0), { r: 0.9, t: true }), 0, 1.55, 0.02);
      break;
    }
    default: box(g, 0.5, 0.5, 0.5, M.card, 0, 0.25, 0);
  }
  return g;
}

export function buildBarricade(vertical) {
  // pile of beds/chairs across a 2-cell corridor; corridor axis is z if vertical
  const g = new THREE.Group();
  const b1 = buildProp({ type: 'bed' }); b1.rotation.set(0.0, Math.PI / 2 + 0.2, 0.35); b1.position.set(0.3, 0.4, 0); g.add(b1);
  const b2 = buildProp({ type: 'gurney' }); b2.rotation.set(-0.3, Math.PI / 2 - 0.15, -0.5); b2.position.set(-0.6, 0.6, 0.2); g.add(b2);
  const c1 = buildProp({ type: 'chair' }); c1.rotation.set(0.8, 0.5, 0.3); c1.position.set(1.2, 0.9, 0.3); g.add(c1);
  const c2 = buildProp({ type: 'wheelchair' }); c2.rotation.set(0, 2.5, 1.2); c2.position.set(-1.3, 0.4, -0.4); g.add(c2);
  const c3 = buildProp({ type: 'crate' }); c3.position.set(1.4, 0, -0.5); g.add(c3);
  for (let i = 0; i < 3; i++) box(g, 4.0, 0.2, 0.05, M.wood, 0, 0.8 + i * 0.6, 0.55, 0, 0, (i - 1) * 0.15);
  box(g, 4.0, 0.08, 0.01, mat(0xf2c418, { r: 0.5, e: 0x2a2000 }), 0, 1.3, 0.62, 0, 0, 0.05);
  box(g, 4.0, 0.08, 0.01, mat(0xf2c418, { r: 0.5, e: 0x2a2000 }), 0, 1.6, 0.62, 0, 0, -0.08);
  if (vertical) g.rotation.y = 0; else g.rotation.y = Math.PI / 2;
  return g;
}

// ------------------------------------------------------------------ stations
function led(color = 0xff2222) { return new THREE.MeshBasicMaterial({ color, toneMapped: false }); }

export function buildStation(st, task, style) {
  const g = new THREE.Group();
  const leds = [];
  let screen = null, lever = null, glowMat = null, button = null;
  const setLeds = (n, col) => leds.forEach((l, i) => l.color.setHex(i < n ? col : 0x330808));
  switch (st.kind) {
    case 'fusebox': {
      box(g, 0.6, 0.8, 0.18, mat(0x7b8285, { r: 0.4, m: 0.6 }), 0, 1.4, 0);
      box(g, 0.58, 0.22, 0.01, mat(0xf2c418, { r: 0.5 }), 0, 1.66, 0.095);
      plane(g, 0.5, 0.12, texMat('fuseLabel', () => textTex('⚡ FUSES', { bg: '#f2c418', fg: '#111', glow: false, font: 'bold 70px Rubik' }), { r: 0.6 }), 0, 1.66, 0.102);
      const per = task.per || 4;
      for (let i = 0; i < per; i++) {
        const m = led(0x330808); leds.push(m);
        const x = -0.2 + (i * 0.4) / Math.max(1, per - 1);
        box(g, 0.08, 0.2, 0.04, mat(0x222222), x, 1.35, 0.1);
        add(g, new THREE.BoxGeometry(0.05, 0.05, 0.02), m, x, 1.35, 0.125);
      }
      break;
    }
    case 'terminal': {
      const d = buildProp({ type: 'desk' }); g.add(d);
      screen = new THREE.MeshBasicMaterial({ map: screenTex('SYSTEM\nERROR'), toneMapped: false });
      box(g, 0.62, 0.42, 0.05, M.dark, -0.2, 1.08, -0.05);
      plane(g, 0.56, 0.36, screen, -0.2, 1.08, -0.02);
      leds.push(led()); add(g, new THREE.BoxGeometry(0.04, 0.04, 0.02), leds[0], 0.08, 0.86, -0.04);
      break;
    }
    case 'cardreader': {
      box(g, 0.24, 0.36, 0.08, M.dark, 0, 1.3, 0);
      box(g, 0.16, 0.03, 0.03, M.rubber, 0, 1.35, 0.05);
      leds.push(led()); add(g, new THREE.BoxGeometry(0.05, 0.05, 0.02), leds[0], 0, 1.2, 0.05);
      plane(g, 0.9, 0.22, texMat('secSign', () => textTex('SECURITY', { bg: '#1d2c4a', fg: '#e6eefc', glow: false, font: 'bold 72px Rubik' }), { r: 0.6 }), 0, 2.2, 0.0);
      break;
    }
    case 'labbench': {
      box(g, 1.8, 0.88, 0.8, M.white, 0, 0.44, 0);
      box(g, 1.84, 0.05, 0.84, mat(0x1d1f20, { r: 0.3 }), 0, 0.9, 0);
      glowMat = new THREE.MeshBasicMaterial({ color: 0x225533, toneMapped: false });
      for (let i = 0; i < 5; i++) { cyl(g, 0.05, 0.06, 0.2, mat(0xd8f0f0, { r: 0.1, t: true, o: 0.35 }), -0.6 + i * 0.25, 1.03, 0.1); add(g, new THREE.CylinderGeometry(0.045, 0.055, 0.1, 10), glowMat, -0.6 + i * 0.25, 0.98, 0.1); }
      box(g, 0.25, 0.4, 0.25, M.dark, 0.6, 1.12, -0.1);
      leds.push(led()); add(g, new THREE.BoxGeometry(0.05, 0.05, 0.02), leds[0], 0.6, 1.2, 0.03);
      break;
    }
    case 'breaker': {
      box(g, 0.6, 0.9, 0.18, mat(0x5f6b70, { r: 0.4, m: 0.6 }), 0, 1.4, 0);
      plane(g, 0.5, 0.12, texMat('brkLabel', () => textTex('DANGER 480V', { bg: '#b01c1c', fg: '#fff', glow: false, font: 'bold 56px Rubik' }), { r: 0.6 }), 0, 1.75, 0.095);
      lever = new THREE.Group(); lever.position.set(0, 1.35, 0.1); g.add(lever);
      box(lever, 0.05, 0.35, 0.05, M.dark, 0, -0.15, 0.03);
      box(lever, 0.18, 0.06, 0.06, mat(0xc0201c), 0, -0.32, 0.05);
      lever.rotation.x = 0.6;
      leds.push(led()); add(g, new THREE.BoxGeometry(0.05, 0.05, 0.02), leds[0], 0.2, 1.6, 0.1);
      break;
    }
    case 'xray': {
      box(g, 1.5, 0.7, 1.0, mat(0xd0d6d8, { r: 0.4 }), 0, 0.35, 0);
      tor(g, 0.7, 0.08, mat(0xe0e4e4, { r: 0.4 }), 0, 1.25, -0.1, 0, 0, 0, Math.PI);
      box(g, 0.6, 0.5, 0.08, M.dark, 0, 1.95, -0.1);
      screen = new THREE.MeshBasicMaterial({ map: screenTex('INSERT\nFILE', '#ffb030', '#140c02'), toneMapped: false });
      plane(g, 0.55, 0.42, screen, 0, 1.95, -0.055);
      leds.push(led()); add(g, new THREE.BoxGeometry(0.05, 0.05, 0.02), leds[0], 0.6, 0.6, 0.51);
      break;
    }
    case 'generator': {
      box(g, 1.4, 0.9, 0.9, mat(0xc9a227, { r: 0.55, m: 0.3 }), 0, 0.55, 0);
      box(g, 1.5, 0.1, 1.0, M.dark, 0, 0.05, 0);
      for (const s of [-1, 1]) box(g, 0.05, 1.0, 0.95, M.dark, s * 0.72, 0.55, 0);
      cyl(g, 0.06, 0.06, 0.6, M.dark, 0.5, 1.2, -0.3);
      box(g, 0.5, 0.35, 0.02, M.dark, -0.3, 0.7, 0.46);
      cyl(g, 0.1, 0.1, 0.1, M.dark, 0.35, 1.05, 0.2);
      leds.push(led()); add(g, new THREE.BoxGeometry(0.06, 0.06, 0.02), leds[0], -0.4, 0.75, 0.475);
      break;
    }
    case 'keypad': {
      box(g, 0.32, 0.45, 0.08, mat(0x2b2f30, { r: 0.4, m: 0.6 }), 0, 1.35, 0);
      screen = new THREE.MeshBasicMaterial({ map: screenTex('_ _ _', '#40ff60', '#031004'), toneMapped: false });
      plane(g, 0.24, 0.1, screen, 0, 1.5, 0.042);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) box(g, 0.05, 0.04, 0.02, mat(0x8a8f90, { r: 0.4 }), -0.07 + c * 0.07, 1.4 - r * 0.06, 0.045);
      leds.push(led()); add(g, new THREE.BoxGeometry(0.04, 0.04, 0.02), leds[0], 0.11, 1.52, 0.045);
      plane(g, 1.2, 0.25, texMat('kpSign', () => textTex('GARAGE CONTROL', { bg: '#222', fg: '#f2c418', glow: false, font: 'bold 52px Rubik' }), { r: 0.6 }), 0, 2.1, 0.0);
      break;
    }
    case 'exitpanel': {
      if (style === 'garage') {
        box(g, 0.4, 0.55, 0.12, mat(0xf2c418, { r: 0.5 }), 0, 1.3, 0);
        button = led(0x660000); add(g, new THREE.CylinderGeometry(0.08, 0.08, 0.05, 16), button, 0, 1.3, 0.08, Math.PI / 2, 0, 0);
      } else {
        box(g, 0.32, 0.6, 0.06, mat(0xa3abae, { r: 0.25, m: 0.9 }), 0, 1.3, 0);
        button = led(0x332200);
        add(g, new THREE.CylinderGeometry(0.05, 0.05, 0.03, 16), button, 0, 1.38, 0.04, Math.PI / 2, 0, 0);
        add(g, new THREE.CylinderGeometry(0.05, 0.05, 0.03, 16), mat(0x555555), 0, 1.22, 0.04, Math.PI / 2, 0, 0);
      }
      leds.push(led()); add(g, new THREE.BoxGeometry(0.05, 0.05, 0.02), leds[0], 0.1, 1.52, 0.05);
      break;
    }
  }
  g.position.set(st.x, 0, st.z); g.rotation.y = st.ry;
  let t = 0;
  return {
    group: g,
    set(fraction, done, extra = {}) {
      if (st.kind === 'fusebox') setLeds(Math.round(fraction * leds.length), 0x33ff66);
      else leds.forEach((l) => l.color.setHex(done ? 0x33ff66 : extra.active ? 0xffaa00 : 0xff2222));
      if (screen && done && !this._done) {
        screen.map.dispose();
        screen.map = st.kind === 'keypad' ? screenTex('OPEN', '#40ff60', '#031004') : screenTex(st.kind === 'xray' ? 'SCAN OK' : 'ONLINE', '#40ff70', '#031008');
        screen.needsUpdate = true;
      }
      if (lever) lever.rotation.x = done ? -0.6 : 0.6;
      if (glowMat) glowMat.color.setHex(done ? 0x55ff99 : 0x225533);
      if (button) button.color.setHex(extra.active ? 0xffaa00 : done ? 0x33ff66 : style === 'garage' ? 0x660000 : 0x332200);
      this._done = done;
    },
    update(dt) {
      t += dt;
      if (st.kind === 'generator' && this._done) g.children.forEach((c) => (c.position.x += Math.sin(t * 60) * 0.0006));
    },
  };
}

// ------------------------------------------------------------------ pickups
let _glow = null;
export function glowSprite(color, scale = 0.6, opacity = 0.6) {
  _glow ||= glowTex();
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: _glow, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(scale);
  return s;
}

export function buildItemMesh(item) {
  const g = new THREE.Group();
  switch (item) {
    case 'fuse': cyl(g, 0.04, 0.04, 0.16, mat(0xffb02e, { r: 0.2, t: true, o: 0.8, e: 0x553300 }), 0, 0, 0, 0, 0, Math.PI / 2); for (const s of [-1, 1]) cyl(g, 0.045, 0.045, 0.04, M.metal, s * 0.09, 0, 0, 0, 0, Math.PI / 2); break;
    case 'keycard': box(g, 0.14, 0.01, 0.09, mat(0x4fc3f7, { r: 0.3, e: 0x0a2a3a }), 0, 0, 0); box(g, 0.05, 0.012, 0.03, M.white, -0.03, 0, 0.01); break;
    case 'vial': cyl(g, 0.03, 0.03, 0.14, mat(0x7cff9e, { r: 0.1, t: true, o: 0.85, e: 0x1f6630 }), 0, 0, 0); cyl(g, 0.032, 0.032, 0.03, M.dark, 0, 0.08, 0); break;
    case 'patientfile': box(g, 0.24, 0.02, 0.32, mat(0xe8d9a8, { r: 0.9 }), 0, 0, 0); box(g, 0.1, 0.022, 0.03, mat(0xc0201c), 0.05, 0, -0.12); break;
    case 'gascan': box(g, 0.3, 0.36, 0.16, mat(0xd63a2a, { r: 0.4, m: 0.2 }), 0, 0.08, 0); box(g, 0.16, 0.04, 0.04, M.dark, 0, 0.29, 0); cyl(g, 0.03, 0.03, 0.12, M.dark, 0.12, 0.3, 0, 0, 0, -0.6); break;
    case 'note': box(g, 0.2, 0.005, 0.26, mat(0xfff7c2, { r: 0.9, e: 0x332f1a }), 0, 0, 0, 0, 0.3, 0); break;
    case 'bandage': cyl(g, 0.06, 0.06, 0.08, mat(0xf2efe6, { r: 0.9 }), 0, 0, 0, 0, 0, Math.PI / 2); break;
    case 'medkit': box(g, 0.3, 0.14, 0.2, M.white, 0, 0.02, 0); box(g, 0.12, 0.005, 0.04, mat(0xc0201c), 0, 0.093, 0); box(g, 0.04, 0.005, 0.12, mat(0xc0201c), 0, 0.093, 0); break;
    case 'battery': cyl(g, 0.035, 0.035, 0.14, mat(0x3fbf5f, { r: 0.3, m: 0.4 }), 0, 0, 0, 0, 0, Math.PI / 2); cyl(g, 0.036, 0.036, 0.04, M.dark, 0.06, 0, 0, 0, 0, Math.PI / 2); break;
    case 'energy': cyl(g, 0.04, 0.04, 0.14, mat(0x2aa8ff, { r: 0.3, m: 0.6 }), 0, 0.03, 0); break;
    case 'pills': cyl(g, 0.04, 0.04, 0.1, mat(0xe67e22, { r: 0.2, t: true, o: 0.85 }), 0, 0.02, 0); cyl(g, 0.042, 0.042, 0.03, M.white, 0, 0.085, 0); break;
    case 'adrenaline': cyl(g, 0.02, 0.02, 0.18, mat(0xffd43b, { r: 0.2, e: 0x332a00 }), 0, 0, 0, 0, 0, Math.PI / 2); cone(g, 0.008, 0.06, M.metal, 0.12, 0, 0, 0, 0, -Math.PI / 2); break;
    default: box(g, 0.1, 0.1, 0.1, M.white, 0, 0, 0);
  }
  return g;
}

export function buildWeaponMesh(w) {
  const g = new THREE.Group();
  if (w === 'crowbar') { box(g, 0.035, 0.035, 0.7, mat(0xb02020, { r: 0.4, m: 0.6 }), 0, 0, -0.2); box(g, 0.03, 0.12, 0.035, mat(0xb02020, { r: 0.4, m: 0.6 }), 0, 0.05, -0.55, 0.4, 0, 0); }
  else if (w === 'extinguisher') { cyl(g, 0.09, 0.09, 0.42, mat(0xd42020, { r: 0.35, m: 0.3 }), 0, -0.05, -0.15); cyl(g, 0.03, 0.04, 0.08, M.dark, 0, 0.2, -0.15); box(g, 0.03, 0.03, 0.18, M.dark, 0, 0.22, -0.26); }
  else if (w === 'tranq') { box(g, 0.05, 0.08, 0.3, mat(0x2b2f33, { r: 0.4, m: 0.6 }), 0, 0, -0.2); box(g, 0.045, 0.14, 0.07, mat(0x3d2a1e, { r: 0.8 }), 0, -0.09, -0.08, -0.25, 0, 0); cyl(g, 0.018, 0.018, 0.2, M.dark, 0, 0.02, -0.4, Math.PI / 2, 0, 0); }
  return g;
}

export function buildFlashlightMesh() {
  const g = new THREE.Group();
  cyl(g, 0.028, 0.028, 0.2, mat(0x222326, { r: 0.4, m: 0.6 }), 0, 0, 0, Math.PI / 2, 0, 0);
  cyl(g, 0.04, 0.03, 0.06, mat(0x333539, { r: 0.4, m: 0.6 }), 0, 0, -0.12, Math.PI / 2, 0, 0);
  const lens = new THREE.MeshBasicMaterial({ color: 0xfff6d8, toneMapped: false });
  add(g, new THREE.CircleGeometry(0.035, 16), lens, 0, 0, -0.151, Math.PI, 0, 0);
  g.userData.lens = lens;
  return g;
}

// ------------------------------------------------------------------ avatars
const HAIR = ['#2b1d14', '#4a2f1b', '#7a4a22', '#c79a4a', '#1a1a1a', '#8a2b1b'];
function hashStr(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }

export function buildAvatar(info) {
  const { gender = 'male', shirt = '#3b7dd8', skin = '#f2c79b', name = '' } = info;
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const skinM = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.7 });
  const shirtM = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.75 });
  const pantsM = new THREE.MeshStandardMaterial({ color: gender === 'female' ? 0x30304a : 0x2d3a4f, roughness: 0.85 });
  const hairM = new THREE.MeshStandardMaterial({ color: HAIR[hashStr(name + gender) % HAIR.length], roughness: 0.9 });
  const shoeM = mat(0x161616, { r: 0.8 });

  const mkLimb = (x, y, m, len, w) => { const pivot = new THREE.Group(); pivot.position.set(x, y, 0); body.add(pivot); box(pivot, w, len, w, m, 0, -len / 2, 0); return pivot; };
  const legL = mkLimb(-0.2, 0.78, pantsM, 0.78, 0.38), legR = mkLimb(0.2, 0.78, pantsM, 0.78, 0.38);
  box(legL, 0.39, 0.1, 0.42, shoeM, 0, -0.74, 0.03); box(legR, 0.39, 0.1, 0.42, shoeM, 0, -0.74, 0.03);
  const torso = box(body, gender === 'female' ? 0.74 : 0.8, 0.78, 0.4, shirtM, 0, 1.17, 0);
  if (gender === 'female') box(body, 0.8, 0.28, 0.44, pantsM, 0, 0.72, 0); // skirt-ish hem
  box(body, 0.2, 0.2, 0.01, mat(0xffffff, { r: 0.6 }), 0.22, 1.36, 0.205); // name badge
  const armL = mkLimb(-0.58 + (gender === 'female' ? 0.03 : 0), 1.52, shirtM, 0.76, 0.36), armR = mkLimb(0.58 - (gender === 'female' ? 0.03 : 0), 1.52, shirtM, 0.76, 0.36);
  box(armL, 0.34, 0.2, 0.34, skinM, 0, -0.68, 0); box(armR, 0.34, 0.2, 0.34, skinM, 0, -0.68, 0);
  const head = new THREE.Group(); head.position.set(0, 1.56, 0); body.add(head);
  const faceM = new THREE.MeshStandardMaterial({ map: faceTex(gender, skin), roughness: 0.7 });
  const hm = [skinM, skinM, skinM, skinM, faceM, skinM];
  const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.46), hm); headMesh.position.y = 0.25; head.add(headMesh);
  if (gender === 'female') {
    box(head, 0.5, 0.14, 0.5, hairM, 0, 0.52, -0.01);
    box(head, 0.5, 0.62, 0.12, hairM, 0, 0.22, -0.23);
    box(head, 0.07, 0.42, 0.42, hairM, -0.25, 0.3, -0.03); box(head, 0.07, 0.42, 0.42, hairM, 0.25, 0.3, -0.03);
    box(head, 0.5, 0.1, 0.1, hairM, 0, 0.45, 0.22);
  } else {
    box(head, 0.5, 0.12, 0.5, hairM, 0, 0.52, -0.01);
    box(head, 0.5, 0.22, 0.1, hairM, 0, 0.38, -0.22);
    box(head, 0.5, 0.06, 0.08, hairM, 0, 0.45, 0.22);
  }
  // flashlight in right hand + beam cone for others to see
  const hand = new THREE.Group(); hand.position.set(0, -0.72, 0.12); armR.add(hand);
  const fl = buildFlashlightMesh(); fl.rotation.x = Math.PI / 2; fl.position.z = 0.05; hand.add(fl);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff1c8, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.ConeGeometry(1.1, 6, 20, 1, true), beamMat);
  beam.position.set(0, 0.25, 3.2); beam.rotation.x = -Math.PI / 2; head.add(beam);

  let label = null;
  if (name) {
    label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex(name), depthTest: true, transparent: true }));
    label.scale.set(1.2, 0.3, 1); label.position.y = 2.35; root.add(label);
  }
  let phase = 0;
  return {
    group: root, head, armR, beam, label, torso,
    animate(dt, s) {
      const speed = s.speed || 0;
      phase += dt * speed * 3.0;
      const sw = Math.sin(phase) * Math.min(1, speed / 3);
      if (s.down) {
        body.rotation.x = -Math.PI / 2; body.position.y = 0.25; body.position.z = 0;
        legL.rotation.x = legR.rotation.x = 0; armL.rotation.x = -0.3; armR.rotation.x = -2.6;
      } else {
        body.rotation.x = 0; body.position.z = 0;
        const crouch = s.crouch ? 1 : 0;
        body.position.y = THREE.MathUtils.lerp(body.position.y, crouch ? -0.45 : 0, Math.min(1, dt * 10));
        legL.rotation.x = sw * 0.8 - crouch * 0.9; legR.rotation.x = -sw * 0.8 - crouch * 0.9;
        armL.rotation.x = -sw * 0.7;
        armR.rotation.x = s.flash ? -1.35 + (s.pitch || 0) : sw * 0.7;
        body.rotation.y = 0;
      }
      head.rotation.x = s.down ? 0 : -(s.pitch || 0) * 0.5;
      beam.visible = !!s.flash && !s.down;
      fl.visible = !s.down;
    },
  };
}

// ------------------------------------------------------------------ monsters
export function buildMonster(kind) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const head = new THREE.Group(); body.add(head);
  const limbs = {};
  const mkLimb = (name, x, y, z) => { const p = new THREE.Group(); p.position.set(x, y, z); body.add(p); limbs[name] = p; return p; };
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.2, emissive: 0x000000 });
  const eyeWhite = mat(0xf4f1ea, { r: 0.3 });
  const glows = [];
  let hip = 0.55, height = 2;

  const eye = (parent, x, y, z, r, lidMat, lidTilt = 0, pupilScale = 0.62) => {
    sph(parent, r, eyeWhite, x, y, z, 1, 1.1, 0.55);
    sph(parent, r * pupilScale, pupilMat, x, y - r * 0.08, z + r * 0.42, 1, 1.1, 0.4);
    if (lidMat) {
      const lid = add(parent, new THREE.SphereGeometry(r * 1.08, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), lidMat, x, y, z, -0.15, 0, lidTilt);
      lid.scale.set(1, 1.1, 0.62);
    }
    const gs = glowSprite(0xffd9a0, r * 3.2, 0.35); gs.position.set(x, y, z + r * 0.7); parent.add(gs); glows.push(gs);
  };

  if (kind === 'lop') {
    const fur = mat(0x6f9fd6, { r: 1 }), belly = mat(0xa9c8ee, { r: 1 }), dark = mat(0x23324a, { r: 0.8 }), aid = mat(0xe4c08f, { r: 0.8 });
    hip = 0.55; height = 2.05;
    sph(body, 0.55, fur, 0, 1.0, 0, 1, 1.12, 0.9); sph(body, 0.38, belly, 0, 0.95, 0.3, 1, 1.2, 0.5);
    for (let i = 0; i < 5; i++) box(body, 0.1, 0.015, 0.02, dark, 0, 0.75 + i * 0.1, 0.5, 0, 0, 0.3 * (i % 2 ? 1 : -1));
    head.position.set(0, 1.62, 0);
    sph(head, 0.52, fur, 0, 0.2, 0, 1.1, 0.95, 1);
    eye(head, -0.21, 0.26, 0.38, 0.17, fur, 0.25); eye(head, 0.21, 0.26, 0.38, 0.17, fur, -0.25);
    sph(head, 0.17, belly, 0, 0.04, 0.42, 1.2, 0.8, 0.8); sph(head, 0.05, dark, 0, 0.1, 0.56);
    tor(head, 0.07, 0.015, dark, 0, -0.06, 0.53, 0, 0, Math.PI, Math.PI);
    for (const s of [-1, 1]) cap(head, 0.12, 0.7, fur, s * 0.5, 0.0, -0.05, 0, 0, s * 0.25);
    box(head, 0.18, 0.06, 0.01, aid, 0.3, 0.45, 0.42, 0, 0, 0.5);
    const aL = mkLimb('armL', -0.55, 1.3, 0), aR = mkLimb('armR', 0.55, 1.3, 0);
    cap(aL, 0.12, 0.5, fur, 0, -0.35, 0); cap(aR, 0.12, 0.5, fur, 0, -0.35, 0);
    box(aR, 0.26, 0.08, 0.26, aid, 0, -0.3, 0);
    const lL = mkLimb('legL', -0.26, hip, 0.05), lR = mkLimb('legR', 0.26, hip, 0.05);
    cap(lL, 0.16, 0.3, fur, 0, -0.32, 0); cap(lR, 0.16, 0.3, fur, 0, -0.32, 0);
    box(lL, 0.3, 0.08, 0.2, aid, 0, -0.3, 0.12, 0.2, 0, 0);
  } else if (kind === 'grin') {
    const fur = mat(0xe8962e, { r: 1 }), belly = mat(0xf6c56a, { r: 1 }), maw = mat(0x2a0306, { r: 0.6 }), tooth = mat(0xf2ead2, { r: 0.4 }), tongue = mat(0xc0406a, { r: 0.5 });
    hip = 0.55; height = 2.25;
    sph(body, 0.6, fur, 0, 1.0, 0, 1, 1.08, 0.95); sph(body, 0.4, belly, 0, 0.95, 0.33, 1, 1.15, 0.5);
    head.position.set(0, 1.65, 0);
    sph(head, 0.64, fur, 0, 0.3, 0, 1, 0.98, 0.95);
    sph(head, 0.44, maw, 0, 0.22, 0.32, 1, 0.92, 0.75);
    sph(head, 0.12, tongue, 0, 0.08, 0.5, 1.4, 0.7, 1);
    const n = 18;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2; const r = 0.4;
      const tx = Math.cos(a) * r, ty = 0.22 + Math.sin(a) * r * 0.9;
      const t = cone(head, 0.045, 0.16, tooth, tx, ty, 0.6, 0, 0, a + Math.PI / 2);
      t.rotation.set(0, 0, a + Math.PI / 2); t.position.z = 0.6 - Math.abs(Math.sin(a)) * 0.02;
    }
    eye(head, -0.24, 0.72, 0.36, 0.13, null); eye(head, 0.24, 0.72, 0.36, 0.13, null);
    for (const s of [-1, 1]) { cap(head, 0.13, 0.3, fur, s * 0.32, 0.98, -0.05, 0, 0, -s * 0.35); box(head, 0.2, 0.04, 0.04, mat(0x6b3a10), s * 0.24, 0.88, 0.45, 0, 0, s * 0.35); }
    const aL = mkLimb('armL', -0.6, 1.3, 0), aR = mkLimb('armR', 0.6, 1.3, 0);
    cap(aL, 0.11, 0.7, fur, 0, -0.45, 0); cap(aR, 0.11, 0.7, fur, 0, -0.45, 0);
    for (const a of [aL, aR]) for (let k = -1; k <= 1; k++) cone(a, 0.025, 0.12, tooth, k * 0.05, -0.92, 0.04, Math.PI, 0, 0);
    const lL = mkLimb('legL', -0.28, hip, 0.05), lR = mkLimb('legR', 0.28, hip, 0.05);
    cap(lL, 0.16, 0.3, fur, 0, -0.32, 0); cap(lR, 0.16, 0.3, fur, 0, -0.32, 0);
  } else if (kind === 'mumbles') {
    const fur = mat(0x74c493, { r: 1 }), band = mat(0xe9e4d6, { r: 0.95 }), dark = mat(0x1f3a2a, { r: 0.8 }), stain = mat(0x7a4a30, { r: 0.9 });
    hip = 0.5; height = 1.95;
    sph(body, 0.52, fur, 0, 0.92, 0, 1, 1.15, 0.9);
    tor(body, 0.5, 0.06, band, 0, 1.0, 0, Math.PI / 2 + 0.2, 0, 0); tor(body, 0.48, 0.06, band, 0, 0.82, 0, Math.PI / 2 - 0.15, 0, 0);
    head.position.set(0, 1.5, 0);
    sph(head, 0.5, fur, 0, 0.22, 0, 1.08, 0.95, 1);
    for (const s of [-1, 1]) cone(head, 0.16, 0.38, fur, s * 0.3, 0.68, 0, 0, 0, -s * 0.35);
    eye(head, 0.2, 0.26, 0.38, 0.17, fur, -0.3);
    tor(head, 0.5, 0.07, band, 0, 0.25, 0, 0.3, 0.6, 0.2);
    tor(head, 0.51, 0.065, band, 0, 0.35, 0, -0.5, -0.2, 0.9);
    tor(head, 0.5, 0.06, band, 0, 0.12, 0, 1.4, 0, 0.1);
    sph(head, 0.06, stain, -0.22, 0.27, 0.45, 1, 1, 0.3);
    tor(head, 0.07, 0.015, dark, 0, 0.02, 0.5, 0, 0, Math.PI, Math.PI);
    sph(head, 0.04, mat(0xd78ca0), 0, 0.12, 0.52);
    const aL = mkLimb('armL', -0.52, 1.2, 0), aR = mkLimb('armR', 0.52, 1.2, 0);
    cap(aL, 0.11, 0.5, fur, 0, -0.33, 0); cap(aR, 0.11, 0.5, fur, 0, -0.33, 0);
    cyl(aL, 0.13, 0.13, 0.4, band, 0, -0.3, 0); cyl(aR, 0.13, 0.13, 0.25, band, 0, -0.45, 0);
    const lL = mkLimb('legL', -0.25, hip, 0.05), lR = mkLimb('legR', 0.25, hip, 0.05);
    cap(lL, 0.15, 0.28, fur, 0, -0.3, 0); cap(lR, 0.15, 0.28, fur, 0, -0.3, 0);
    cyl(lR, 0.17, 0.17, 0.2, band, 0, -0.3, 0);
    const tail = cap(body, 0.06, 0.6, fur, 0, 0.7, -0.5, -0.9, 0, 0); tail.name = 'tail';
  } else if (kind === 'matron') {
    const wool = mat(0xe3ded3, { r: 1 }), face = mat(0x2b2424, { r: 0.8 }), dress = mat(0xd9c3c3, { r: 0.9 }), apron = mat(0xf0eeea, { r: 0.9 }), red = mat(0xb01c1c), leg = mat(0x2b2424, { r: 0.8 });
    hip = 1.05; height = 2.75;
    cap(body, 0.34, 0.75, dress, 0, 1.55, 0);
    sph(body, 0.42, dress, 0, 1.15, 0, 1, 0.6, 0.85);
    box(body, 0.45, 0.8, 0.02, apron, 0, 1.35, 0.33);
    box(body, 0.12, 0.04, 0.01, red, 0, 1.6, 0.345); box(body, 0.04, 0.12, 0.01, red, 0, 1.6, 0.345);
    cyl(body, 0.08, 0.1, 0.35, face, 0, 2.15, 0.02);
    head.position.set(0, 2.3, 0.05);
    sph(head, 0.24, face, 0, 0.1, 0.06, 0.85, 1.05, 1.15);
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; sph(head, 0.15, wool, Math.cos(a) * 0.17, 0.25 + Math.sin(a) * 0.06, -0.05 + Math.sin(a) * 0.12); }
    for (const s of [-1, 1]) sph(head, 0.1, face, s * 0.3, 0.12, -0.02, 1.6, 0.6, 0.8);
    box(head, 0.3, 0.13, 0.2, apron, 0, 0.42, 0.02, -0.2, 0, 0);
    box(head, 0.07, 0.02, 0.01, red, 0, 0.44, 0.13, -0.2, 0, 0); box(head, 0.02, 0.07, 0.01, red, 0, 0.44, 0.13, -0.2, 0, 0);
    eye(head, -0.09, 0.14, 0.24, 0.06, null, 0, 0.75); eye(head, 0.09, 0.14, 0.24, 0.06, null, 0, 0.75);
    const aL = mkLimb('armL', -0.42, 1.85, 0), aR = mkLimb('armR', 0.42, 1.85, 0);
    cap(aL, 0.07, 1.15, face, 0, -0.65, 0); cap(aR, 0.07, 1.15, face, 0, -0.65, 0);
    for (const a of [aL, aR]) for (let k = -1; k <= 1; k++) cone(a, 0.018, 0.16, mat(0xddd8c8), k * 0.035, -1.35, 0.02, Math.PI, 0, 0);
    const lL = mkLimb('legL', -0.16, hip, 0), lR = mkLimb('legR', 0.16, hip, 0);
    cap(lL, 0.08, 0.85, leg, 0, -0.52, 0); cap(lR, 0.08, 0.85, leg, 0, -0.52, 0);
  }

  let phase = Math.random() * 10, lean = 0, twitchT = 2 + Math.random() * 4, twitch = 0;
  const tail = body.getObjectByName('tail');
  return {
    group: root, height, pupilMat, glows,
    update(dt, t, st, speed) {
      // st: 0 dormant, 1 patrol, 2 investigate, 3 chase, 4 search, 5 stunned
      const chasing = st === 3;
      phase += dt * (speed * 3.4);
      const amt = Math.min(1, speed / 2.2);
      const sw = Math.sin(phase) * amt;
      const L = limbs;
      body.rotation.z = 0;
      if (st === 0) { // sitting in the waiting room
        L.legL.rotation.x = L.legR.rotation.x = -1.45;
        L.armL.rotation.x = L.armR.rotation.x = -0.5;
        L.armL.rotation.z = 0.15; L.armR.rotation.z = -0.15;
        body.position.y = -0.05; lean = 0.05;
        head.rotation.z = Math.sin(t * 0.3) * 0.08 + 0.18; head.rotation.y = 0;
      } else {
        body.position.y = Math.abs(Math.sin(phase)) * 0.07 * amt;
        L.legL.rotation.x = sw * 0.75; L.legR.rotation.x = -sw * 0.75;
        L.armL.rotation.z = 0.08; L.armR.rotation.z = -0.08;
        if (chasing) { L.armL.rotation.x = -1.25 + sw * 0.35; L.armR.rotation.x = -1.25 - sw * 0.35; }
        else { L.armL.rotation.x = -sw * 0.5; L.armR.rotation.x = sw * 0.5; }
        lean = THREE.MathUtils.lerp(lean, chasing ? 0.3 : 0.05, Math.min(1, dt * 6));
        head.rotation.z = Math.sin(t * 0.8) * 0.06;
        head.rotation.y = st === 4 ? Math.sin(t * 1.8) * 0.9 : st === 2 ? Math.sin(t * 1.1) * 0.4 : 0;
        if (st === 5) { body.rotation.z = Math.sin(t * 9) * 0.18; head.rotation.y = Math.sin(t * 5) * 0.6; lean = 0.4; }
      }
      // creepy head twitch
      twitchT -= dt; if (twitchT <= 0) { twitch = (Math.random() - 0.5) * 1.2; twitchT = 1.5 + Math.random() * 5; }
      twitch *= Math.max(0, 1 - dt * 8);
      head.rotation.z += twitch;
      body.rotation.x = lean;
      if (tail) tail.rotation.z = Math.sin(t * 2) * 0.4;
      const gc = chasing ? 0xff1a1a : st === 5 ? 0x222222 : st === 2 ? 0xffaa33 : 0xffd9a0;
      for (const gsp of glows) { gsp.material.color.setHex(gc); gsp.material.opacity = chasing ? 1 : st === 5 ? 0.05 : 0.38; }
      pupilMat.emissive.setHex(chasing ? 0xff0000 : 0x000000);
      pupilMat.emissiveIntensity = chasing ? 2.5 : 0;
    },
  };
}
