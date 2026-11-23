// Builds the three.js scene for a generated level and runs its ambient effects
// (flickering fluorescent lights, alarm lighting, pickups, exit doors).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CELL, WALL_H } from '/shared/config.js';
import { WALL, DOOR, EXIT, BARR, FLOOR } from '/shared/levelgen.js';
import { wallTex, floorTex, ceilTex, steelTex, concreteTex, textTex, decalTex } from './textures.js';
import { buildProp, buildBarricade, buildStation, buildItemMesh, glowSprite, mat } from './models.js';
import { ITEMS } from '/shared/config.js';

const LIGHT_POOL = 8;

function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const groups = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.index ? o.geometry.clone() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.index) { const idx = []; for (let i = 0; i < g.attributes.position.count; i++) idx.push(i); g.setIndex(idx); }
    g.applyMatrix4(o.matrixWorld);
    if (!groups.has(o.material)) groups.set(o.material, []);
    groups.get(o.material).push(g);
    o.geometry.dispose();
  });
  const out = new THREE.Group();
  for (const [m, list] of groups) {
    const merged = mergeGeometries(list, false);
    list.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, m);
    mesh.matrixAutoUpdate = false;
    out.add(mesh);
  }
  return out;
}

export class World {
  constructor(scene, level) {
    this.scene = scene; this.level = level;
    const L = level, pal = L.def.palette;
    this.root = new THREE.Group(); scene.add(this.root);
    this.disposables = [];
    this.alarm = 0;
    this.exitOpen = false; this.exitT = 0;

    scene.fog = new THREE.FogExp2(pal.fog, pal.fogDensity);
    scene.background = new THREE.Color(pal.fog);

    const staticRoot = new THREE.Group();

    // --- floor & ceiling
    const fw = L.W * CELL, fh = L.H * CELL;
    const isBasement = L.def.exitStyle === 'garage';
    const fTex = isBasement ? concreteTex(pal.floor) : floorTex(pal);
    fTex.repeat.set(fw / 2, fh / 2);
    const floorMat = new THREE.MeshStandardMaterial({ map: fTex, roughness: isBasement ? 0.9 : 0.42, metalness: 0.05 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), floorMat);
    floor.rotation.x = -Math.PI / 2; floor.position.set(fw / 2, 0, fh / 2);
    this.root.add(floor);
    const cTex = ceilTex(pal); cTex.repeat.set(fw / 2, fh / 2);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), new THREE.MeshStandardMaterial({ map: cTex, roughness: 0.95 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.set(fw / 2, WALL_H, fh / 2);
    this.root.add(ceil);
    this.disposables.push(floor, ceil);

    // --- walls (instanced, 3 grime variants)
    const wallMats = [0, 1, 2].map((v) => new THREE.MeshStandardMaterial({ map: wallTex(pal, v), roughness: 0.85 }));
    const wallGeo = new THREE.BoxGeometry(CELL, WALL_H, CELL);
    const cells = [[], [], []];
    const I = (x, y) => y * L.W + x;
    const open = (x, y) => x >= 0 && y >= 0 && x < L.W && y < L.H && L.grid[I(x, y)] !== WALL;
    for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) {
      if (L.grid[I(x, y)] !== WALL) continue;
      let vis = false;
      for (let dy = -1; dy <= 1 && !vis; dy++) for (let dx = -1; dx <= 1; dx++) if (open(x + dx, y + dy)) { vis = true; break; }
      if (!vis) continue;
      const r = Math.random();
      cells[r < 0.72 ? 0 : r < 0.94 ? 1 : 2].push([x, y]);
    }
    const dummy = new THREE.Object3D();
    cells.forEach((list, v) => {
      const im = new THREE.InstancedMesh(wallGeo, wallMats[v], list.length);
      list.forEach(([x, y], i) => { dummy.position.set((x + 0.5) * CELL, WALL_H / 2, (y + 0.5) * CELL); dummy.rotation.y = (Math.floor(Math.random() * 4) * Math.PI) / 2; dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
      this.root.add(im); this.disposables.push(im);
    });

    // --- doorways: lintel + frame + swung-open double doors
    const lintelMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(pal.wallTop).multiplyScalar(0.85), roughness: 0.85 });
    const doorMat = mat(new THREE.Color(pal.accent).getHex(), { r: 0.55, m: 0.1 });
    const winMat = mat(0x0d1517, { r: 0.1, m: 0.3 });
    const frameMat = mat(0x6d777a, { r: 0.4, m: 0.6 });
    for (const d of L.doors) {
      const c = { x: (d.x + 0.5) * CELL, z: (d.y + 0.5) * CELL };
      const g = new THREE.Group(); g.position.set(c.x, 0, c.z);
      g.rotation.y = Math.atan2(d.dx, d.dy); // local +z points from room A toward B/corridor
      const lin = new THREE.Mesh(new THREE.BoxGeometry(CELL, WALL_H - 2.35, CELL), lintelMat); lin.position.y = 2.35 + (WALL_H - 2.35) / 2; g.add(lin);
      for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.35, CELL), frameMat); f.position.set(s * (CELL / 2 - 0.04), 1.175, 0); g.add(f); }
      if (!d.exit && !(L.spawnRoom.doors.includes(d))) {
        for (const s of [-1, 1]) {
          const hinge = new THREE.Group(); hinge.position.set(s * (CELL / 2 - 0.1), 0, -CELL / 2 + 0.1); g.add(hinge);
          hinge.rotation.y = s * (1.25 + Math.random() * 0.25);
          const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.3, 0.05), doorMat); leaf.position.set(-s * 0.45, 1.16, 0); hinge.add(leaf);
          const win = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.45, 0.06), winMat); win.position.set(-s * 0.45, 1.6, 0); hinge.add(win);
          const kick = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.25, 0.06), frameMat); kick.position.set(-s * 0.45, 0.14, 0); hinge.add(kick);
        }
      }
      staticRoot.add(g);
    }

    // --- elevator / garage rooms
    const steel = new THREE.MeshStandardMaterial({ map: steelTex(), roughness: 0.35, metalness: 0.75 });
    this.disposables.push({ material: steel });
    const cladRoom = (room, matl, floorMatl) => {
      for (let y = room.y0; y < room.y0 + room.h; y++) for (let x = room.x0; x < room.x0 + room.w; x++) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (L.grid[I(x + dx, y + dy)] !== WALL) continue;
          const p = new THREE.Mesh(new THREE.PlaneGeometry(CELL, WALL_H), matl);
          p.position.set((x + 0.5 + dx * 0.49) * CELL, WALL_H / 2, (y + 0.5 + dy * 0.49) * CELL);
          p.rotation.y = Math.atan2(-dx, -dy);
          staticRoot.add(p);
          if (matl === steel) { const rail = new THREE.Mesh(new THREE.BoxGeometry(CELL, 0.06, 0.06), frameMat); rail.position.set((x + 0.5 + dx * 0.46) * CELL, 0.95, (y + 0.5 + dy * 0.46) * CELL); rail.rotation.y = Math.atan2(-dx, -dy); staticRoot.add(rail); }
        }
      }
      const fp = new THREE.Mesh(new THREE.PlaneGeometry(room.w * CELL, room.h * CELL), floorMatl);
      fp.rotation.x = -Math.PI / 2; fp.position.set((room.x0 + room.w / 2) * CELL, 0.01, (room.y0 + room.h / 2) * CELL);
      staticRoot.add(fp);
    };
    const diamond = new THREE.MeshStandardMaterial({ map: steelTex('#5d6467'), roughness: 0.5, metalness: 0.7 });
    cladRoom(L.spawnRoom, steel, diamond);
    if (isBasement) {
      const conc = new THREE.MeshStandardMaterial({ map: concreteTex('#55574f', true), roughness: 0.95 });
      cladRoom(L.exitRoom, conc, new THREE.MeshStandardMaterial({ map: concreteTex('#3f413b'), roughness: 0.95 }));
      // ambulance
      const amb = new THREE.Group();
      const er = L.exitRoom; amb.position.set((er.x0 + er.w / 2) * CELL, 0, (er.y0 + er.h / 2) * CELL);
      const ed = L.exitDoor; amb.rotation.y = Math.atan2(ed.dx, ed.dy);
      const wm = mat(0xf2f2ee, { r: 0.4, m: 0.2 }), rm = mat(0xc0201c, { r: 0.4 });
      const b1 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 3.6), wm); b1.position.set(0, 1.45, -1.0); amb.add(b1);
      const b2 = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.5, 1.6), wm); b2.position.set(0, 1.1, 1.6); amb.add(b2);
      const st = new THREE.Mesh(new THREE.BoxGeometry(2.22, 0.25, 3.62), rm); st.position.set(0, 1.3, -1.0); amb.add(st);
      const ws = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.6, 0.05), mat(0x15212a, { r: 0.1, m: 0.5 })); ws.position.set(0, 1.5, 2.41); amb.add(ws);
      for (const s of [-1, 1]) for (const e of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 14), mat(0x111111)); w.rotation.z = Math.PI / 2; w.position.set(s * 1.05, 0.38, e * 1.3); amb.add(w); }
      this.ambLights = [new THREE.MeshBasicMaterial({ color: 0xff0000, toneMapped: false }), new THREE.MeshBasicMaterial({ color: 0x0044ff, toneMapped: false })];
      for (const s of [-1, 1]) { const lb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.3), this.ambLights[s < 0 ? 0 : 1]); lb.position.set(s * 0.5, 2.62, 0.6); amb.add(lb); }
      this.root.add(amb);
    } else cladRoom(L.exitRoom, steel, diamond);

    // --- exit doors (dynamic)
    this.exitDoors = [];
    const mkElevatorDoors = (d, openNow) => {
      const g = new THREE.Group();
      const c = { x: (d.x + 0.5) * CELL, z: (d.y + 0.5) * CELL };
      g.position.set(c.x + d.dx * 0.85, 0, c.z + d.dy * 0.85);
      g.rotation.y = Math.atan2(d.dx, d.dy);
      const panels = [];
      if (isBasement && d.exit) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(CELL, 2.35, 0.08), new THREE.MeshStandardMaterial({ map: textTex('', { bg: '#7a7d78', glow: false }), roughness: 0.6, metalness: 0.5 }));
        const stripes = new THREE.Mesh(new THREE.PlaneGeometry(CELL, 0.3), new THREE.MeshStandardMaterial({ color: 0xf2c418 }));
        stripes.position.set(0, -0.9, 0.045); p.add(stripes);
        for (let i = 0; i < 7; i++) { const rib = new THREE.Mesh(new THREE.BoxGeometry(CELL, 0.03, 0.1), frameMat); rib.position.set(0, -1.1 + i * 0.33, 0); p.add(rib); }
        p.position.y = 1.175; g.add(p); panels.push({ mesh: p, type: 'roll' });
      } else {
        for (const s of [-1, 1]) {
          const p = new THREE.Mesh(new THREE.BoxGeometry(CELL / 2, 2.35, 0.06), steel);
          p.position.set(s * CELL / 4, 1.175, 0); g.add(p); panels.push({ mesh: p, type: 'slide', s });
        }
        const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.22), new THREE.MeshBasicMaterial({ map: textTex(d.exit ? '▲ 13' : '▼ B', { bg: '#120800', fg: '#ffae2a', font: 'bold 80px monospace' }), toneMapped: false }));
        disp.position.set(0, 2.6, 0.05); g.add(disp);
      }
      this.root.add(g);
      const obj = { g, panels, open: openNow ? 1 : 0, target: openNow ? 1 : 0 };
      this.exitDoors.push(obj); return obj;
    };
    this.exitDoorObj = mkElevatorDoors(L.exitDoor, false);
    mkElevatorDoors(L.spawnRoom.doors[0], true);

    // --- props
    for (const p of L.props) {
      if (p.station) continue;
      const m = buildProp(p);
      m.position.set(p.x, 0, p.z); m.rotation.y = p.ry;
      staticRoot.add(m);
    }
    for (const b of L.barricades) {
      const [[x0, y0], [x1, y1]] = b.cells;
      const m = buildBarricade(b.vertical);
      m.position.set(((x0 + x1) / 2 + 0.5) * CELL, 0, ((y0 + y1) / 2 + 0.5) * CELL);
      staticRoot.add(m);
    }

    // --- decals
    const decalMats = {
      blood: new THREE.MeshStandardMaterial({ map: decalTex('blood'), transparent: true, depthWrite: false, roughness: 0.3, polygonOffset: true, polygonOffsetFactor: -4 }),
      drag: new THREE.MeshStandardMaterial({ map: decalTex('drag'), transparent: true, depthWrite: false, roughness: 0.3, polygonOffset: true, polygonOffsetFactor: -4 }),
      paper: new THREE.MeshStandardMaterial({ map: decalTex('paper'), transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -4 }),
    };
    for (const d of L.decals) {
      const s = d.type === 'drag' ? [0.9, 3 * d.s] : d.type === 'paper' ? [0.5, 0.5] : [d.s, d.s];
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s[0], s[1]), decalMats[d.type]);
      m.rotation.set(-Math.PI / 2, 0, d.ry); m.position.set(d.x, 0.012, d.z);
      staticRoot.add(m);
    }

    // --- hanging EXIT signs
    const exitSignMat = new THREE.MeshBasicMaterial({ map: textTex('EXIT', { bg: '#062a10', fg: '#4dff7a', font: 'bold 96px Rubik' }), toneMapped: false });
    const elevSignMat = new THREE.MeshBasicMaterial({ map: textTex(isBasement ? 'AMBULANCE BAY' : 'SERVICE ELEVATOR', { bg: '#2a0606', fg: '#ff5a4a', font: 'bold 54px Rubik' }), toneMapped: false });
    for (const s of L.signs) {
      const g = new THREE.Group(); g.position.set(s.x, 2.75, s.z); g.rotation.y = s.ry;
      const b = new THREE.Mesh(new THREE.BoxGeometry(s.exit ? 1.3 : 0.62, 0.26, 0.08), mat(0x1b1b1b)); g.add(b);
      for (const side of [1, -1]) { const pl = new THREE.Mesh(new THREE.PlaneGeometry(s.exit ? 1.24 : 0.56, 0.21), s.exit ? elevSignMat : exitSignMat); pl.position.z = side * 0.041; pl.rotation.y = side < 0 ? Math.PI : 0; g.add(pl); }
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.35), mat(0x333333)); rod.position.y = 0.3; g.add(rod);
      staticRoot.add(g);
    }

    this.root.add(mergeStatic(staticRoot));

    // --- light fixtures (instanced emissive panels) + pooled point lights
    const fixtures = L.lights;
    this.fixtures = fixtures;
    const fixGeo = new THREE.BoxGeometry(1.25, 0.05, 0.55);
    this.fixMesh = new THREE.InstancedMesh(fixGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), fixtures.length);
    fixtures.forEach((f, i) => {
      dummy.position.set(f.x, WALL_H - 0.03, f.z); dummy.rotation.set(0, f.room ? 0 : (Math.abs((f.x / CELL) % 1) < 0.01 ? Math.PI / 2 : 0), 0); dummy.updateMatrix();
      this.fixMesh.setMatrixAt(i, dummy.matrix);
      f.base = f.broken ? 0.06 : 1; f.level = f.base; f.seed = Math.random() * 100;
      this.fixMesh.setColorAt(i, new THREE.Color(f.broken ? 0x151515 : f.warm ? 0xffe2b0 : 0xe6f4ff));
    });
    this.root.add(this.fixMesh);
    this.lightColor = new THREE.Color(pal.light);
    this.pool = [];
    for (let i = 0; i < LIGHT_POOL; i++) {
      const pl = new THREE.PointLight(pal.light, 0, 13, 1.6);
      pl.userData = { fixture: null, cur: 0 };
      this.root.add(pl); this.pool.push(pl);
    }
    this.assignT = 0;

    // --- dynamic: stations, pickups, lockers
    this.stationObjs = new Map();
    for (const st of L.stations) {
      const task = L.def.tasks.find((t) => t.id === st.taskId);
      const s = buildStation(st, task, L.def.exitStyle);
      this.root.add(s.group); this.stationObjs.set(st.id, s);
    }
    this.pickupObjs = new Map();
    for (const pk of L.pickups) {
      const g = new THREE.Group(); g.position.set(pk.x, 0.12, pk.z);
      const m = buildItemMesh(pk.item); g.add(m);
      const quest = ITEMS[pk.item].kind === 'quest';
      const gl = glowSprite(ITEMS[pk.item].color, quest ? 1.1 : 0.7, quest ? 0.75 : 0.45); g.add(gl);
      g.userData = { mesh: m, phase: Math.random() * 6, glow: gl };
      this.root.add(g); this.pickupObjs.set(pk.id, g);
    }
  }

  setExitOpen(open) { this.exitOpen = open; this.exitDoorObj.target = open ? 1 : 0; }
  removePickup(id) { const g = this.pickupObjs.get(id); if (g) { this.root.remove(g); this.pickupObjs.delete(id); } }
  setStation(id, fraction, done, extra) { const s = this.stationObjs.get(id); if (s) s.set(fraction, done, extra); }

  update(dt, t, cam, alarm) {
    // exit doors
    for (const d of this.exitDoors) {
      d.open += Math.sign(d.target - d.open) * Math.min(Math.abs(d.target - d.open), dt * 0.7);
      for (const p of d.panels) {
        if (p.type === 'slide') p.mesh.position.x = p.s * (CELL / 4 + d.open * CELL * 0.47);
        else p.mesh.position.y = 1.175 + d.open * 2.2;
      }
    }
    if (this.ambLights) { const on = Math.floor(t * 4) % 2; this.ambLights[0].color.setHex(on ? 0xff1010 : 0x220000); this.ambLights[1].color.setHex(on ? 0x000820 : 0x1050ff); }
    // pickups
    for (const g of this.pickupObjs.values()) { const u = g.userData; u.mesh.rotation.y += dt * 1.2; u.mesh.position.y = 0.05 + Math.sin(t * 2 + u.phase) * 0.04; u.glow.material.opacity = 0.35 + Math.sin(t * 3 + u.phase) * 0.15; }
    for (const s of this.stationObjs.values()) s.update(dt);

    // fixture flicker
    this.alarm = THREE.MathUtils.lerp(this.alarm, alarm ? 1 : 0, Math.min(1, dt * 2));
    const pulse = 0.55 + 0.45 * Math.sin(t * 5);
    const col = new THREE.Color();
    let dirty = false;
    for (let i = 0; i < this.fixtures.length; i++) {
      const f = this.fixtures[i];
      let lv = f.base;
      if (!f.broken && f.flicker) {
        const n = Math.sin(t * 13 + f.seed) * Math.sin(t * 7.3 + f.seed * 2) + Math.sin(t * 31 + f.seed);
        lv = n > 1.1 ? 0.05 : n > 0.7 ? 0.5 : 1;
      }
      if (Math.abs(lv - f.level) > 0.01 || this.alarm > 0.01) {
        f.level = lv; dirty = true;
        if (f.broken) col.setHex(0x151515);
        else { col.setHex(f.warm ? 0xffe2b0 : 0xe6f4ff).multiplyScalar(lv); if (this.alarm > 0.01) col.lerp(new THREE.Color(0xff1a1a).multiplyScalar(pulse), this.alarm * 0.85); }
        this.fixMesh.setColorAt(i, col);
      }
    }
    if (dirty) this.fixMesh.instanceColor.needsUpdate = true;

    // assign pooled point lights to the nearest working fixtures
    this.assignT -= dt;
    if (this.assignT <= 0) {
      this.assignT = 0.25;
      const near = [];
      for (const f of this.fixtures) { if (f.broken) continue; const d = (f.x - cam.x) ** 2 + (f.z - cam.z) ** 2; if (d < 26 * 26) near.push([d, f]); }
      near.sort((a, b) => a[0] - b[0]);
      const want = new Set(near.slice(0, this.pool.length).map((n) => n[1]));
      const free = [];
      for (const pl of this.pool) { if (pl.userData.fixture && want.has(pl.userData.fixture)) want.delete(pl.userData.fixture); else free.push(pl); }
      for (const f of want) { const pl = free.pop(); if (!pl) break; pl.userData.fixture = f; pl.userData.cur = 0; pl.position.set(f.x, WALL_H - 0.35, f.z); }
      for (const pl of free) pl.userData.fixture = null;
    }
    for (const pl of this.pool) {
      const f = pl.userData.fixture;
      const target = f ? f.level * (f.warm ? 7 : 8) : 0;
      pl.userData.cur = THREE.MathUtils.lerp(pl.userData.cur, target, Math.min(1, dt * 12));
      pl.intensity = pl.userData.cur;
      pl.color.copy(this.lightColor);
      if (f && f.warm) pl.color.setHex(0xffd9a0);
      if (this.alarm > 0.01) pl.color.lerp(new THREE.Color(0xff2020), this.alarm * 0.85 * pulse);
    }
  }

  dispose() {
    this.scene.remove(this.root);
    // geometries are unique per level; materials/textures are small and partly cached, so keep them
    this.root.traverse((o) => { if (o.geometry && !o.isSprite) o.geometry.dispose(); });
  }
}
