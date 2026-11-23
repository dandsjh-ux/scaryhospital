// Deterministic hospital level generator + collision helpers.
// The server and every client run generateLevel(levelIndex, seed) and get the
// exact same layout, so only the seed has to travel over the network.

import { CELL, BLOCK, CORR, LEVELS, LOOT_WEIGHTS } from './config.js';

export const FLOOR = 0, WALL = 1, DOOR = 2, EXIT = 3, BARR = 4;

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// [width (local x), depth (local z), collides]
export const PROP_SIZES = {
  bed: [1.05, 2.1, 1], gurney: [0.8, 2.0, 1], sheetgurney: [0.8, 2.0, 1], desk: [1.4, 0.7, 1],
  filecabinet: [0.55, 0.6, 1], shelf: [1.6, 0.5, 1], crate: [0.8, 0.8, 1], locker: [0.95, 0.6, 1],
  vending: [1.0, 0.8, 1], chairrow: [3.0, 0.65, 1], chairrow2: [1.2, 0.65, 1], sink: [0.6, 0.5, 0],
  medcabinet: [0.7, 0.25, 0], plant: [0.5, 0.5, 1], ivstand: [0.5, 0.5, 0], wheelchair: [0.7, 0.9, 1],
  opTable: [0.9, 2.1, 1], labbench: [1.8, 0.85, 1], xray: [1.6, 1.1, 1], morguewall: [1.9, 0.7, 1],
  generator: [1.5, 1.0, 1], tank: [1.0, 1.0, 1], toolbox: [0.7, 0.45, 1], terminal: [1.4, 0.7, 1],
  fusebox: [0.6, 0.2, 0], breaker: [0.6, 0.2, 0], cardreader: [0.4, 0.12, 0], keypad: [0.4, 0.12, 0],
  tv: [1.0, 0.12, 0], trash: [0.4, 0.4, 0], wetsign: [0.5, 0.4, 0], chair: [0.55, 0.55, 0],
  cart: [0.9, 0.55, 1], exitpanel: [0.4, 0.12, 0], writing: [1.8, 0.05, 0], poster: [0.8, 0.05, 0],
};

// [type, min, max, flag]
const RECIPES = {
  ward:     { wall: [['bed', 2, 3], ['ivstand', 1, 2], ['medcabinet', 0, 1, 'search'], ['chair', 0, 1], ['poster', 0, 1]], center: [] },
  office:   { wall: [['desk', 1, 2, 'search'], ['filecabinet', 1, 2, 'search'], ['plant', 0, 1], ['poster', 0, 1]], center: [['chair', 1, 1]] },
  storage:  { wall: [['shelf', 2, 3], ['crate', 1, 2, 'search'], ['cart', 0, 1, 'search']], center: [['crate', 0, 1]] },
  waiting:  { wall: [['chairrow', 2, 3], ['vending', 0, 1], ['plant', 1, 2], ['tv', 0, 1], ['poster', 0, 1]], center: [] },
  restroom: { wall: [['sink', 2, 3], ['trash', 1, 1], ['medcabinet', 0, 1, 'search']], center: [] },
  surgery:  { wall: [['medcabinet', 1, 1, 'search'], ['cart', 1, 1, 'search'], ['ivstand', 1, 2]], center: [['opTable', 1, 1]] },
  lab:      { wall: [['shelf', 1, 2], ['medcabinet', 1, 1, 'search'], ['filecabinet', 0, 1, 'search']], center: [['cart', 0, 1, 'search']] },
  morgue:   { wall: [['morguewall', 1, 2, 'search'], ['sheetgurney', 0, 1]], center: [['sheetgurney', 1, 1]] },
  boiler:   { wall: [['tank', 1, 2], ['toolbox', 1, 2, 'search'], ['shelf', 0, 1]], center: [] },
  xrayroom: { wall: [['desk', 1, 1, 'search'], ['filecabinet', 1, 2, 'search'], ['poster', 0, 1]], center: [] },
};

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function cellCenter(x, y) { return { x: (x + 0.5) * CELL, z: (y + 0.5) * CELL }; }

export function isWalkableT(t, exitOpen) { return t === FLOOR || t === DOOR || (t === EXIT && exitOpen); }

export function solidAt(level, cx, cy, exitOpen) {
  if (cx < 0 || cy < 0 || cx >= level.W || cy >= level.H) return true;
  return !isWalkableT(level.grid[cy * level.W + cx], exitOpen);
}

function resolveBox(pos, x0, z0, x1, z1, r) {
  const nx = Math.max(x0, Math.min(pos.x, x1)), nz = Math.max(z0, Math.min(pos.z, z1));
  const dx = pos.x - nx, dz = pos.z - nz; const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2); const push = (r - d) / d;
    pos.x += dx * push; pos.z += dz * push;
  } else {
    const l = pos.x - x0, rr = x1 - pos.x, t = pos.z - z0, b = z1 - pos.z; const m = Math.min(l, rr, t, b);
    if (m === l) pos.x = x0 - r; else if (m === rr) pos.x = x1 + r; else if (m === t) pos.z = z0 - r; else pos.z = z1 + r;
  }
}

// Move a circle through the grid (and optional prop colliders) with sliding.
export function moveCircle(level, pos, dx, dz, r, exitOpen, useColliders) {
  const dist = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(dist / (r * 0.7)));
  for (let s = 0; s < steps; s++) {
    pos.x += dx / steps; pos.z += dz / steps;
    for (let it = 0; it < 2; it++) {
      const cx0 = Math.floor((pos.x - r) / CELL), cx1 = Math.floor((pos.x + r) / CELL);
      const cy0 = Math.floor((pos.z - r) / CELL), cy1 = Math.floor((pos.z + r) / CELL);
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        if (solidAt(level, cx, cy, exitOpen)) resolveBox(pos, cx * CELL, cy * CELL, (cx + 1) * CELL, (cy + 1) * CELL, r);
        if (useColliders && cx >= 0 && cy >= 0 && cx < level.W && cy < level.H) {
          const b = level.colBuckets[cy * level.W + cx];
          if (b) for (const c of b) resolveBox(pos, c.x0, c.z0, c.x1, c.z1, r);
        }
      }
    }
  }
}

export function hasLOS(level, x0, z0, x1, z1, exitOpen) {
  const dx = x1 - x0, dz = z1 - z0, d = Math.hypot(dx, dz);
  const n = Math.ceil(d / 0.3);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (solidAt(level, Math.floor((x0 + dx * t) / CELL), Math.floor((z0 + dz * t) / CELL), exitOpen)) return false;
  }
  return true;
}

export function generateLevel(li, seed) {
  const def = LEVELS[li];
  const R = mulberry32(((seed >>> 0) ^ Math.imul(li + 1, 0x9E3779B1)) >>> 0);
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

  const nx = def.blocksX, ny = def.blocksY, S = BLOCK + CORR;
  const W = nx * S + CORR + 2, H = ny * S + CORR + 2;
  const grid = new Uint8Array(W * H).fill(WALL);
  const region = new Int16Array(W * H).fill(-1);
  const I = (x, y) => y * W + x;
  const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

  // ---- corridors -------------------------------------------------------
  const vCorr = new Uint8Array(W), hCorr = new Uint8Array(H);
  for (let i = 0; i <= nx; i++) {
    const x0 = 1 + i * S;
    for (let x = x0; x < x0 + CORR; x++) { vCorr[x] = 1; for (let y = 1; y < H - 1; y++) { grid[I(x, y)] = FLOOR; region[I(x, y)] = 0; } }
  }
  for (let j = 0; j <= ny; j++) {
    const y0 = 1 + j * S;
    for (let y = y0; y < y0 + CORR; y++) { hCorr[y] = 1; for (let x = 1; x < W - 1; x++) { grid[I(x, y)] = FLOOR; region[I(x, y)] = 0; } }
  }
  const isIntersection = (x, y) => vCorr[x] && hCorr[y];

  // ---- rooms -----------------------------------------------------------
  const rooms = [];
  const addRoom = (x0, y0, w, h, bx, by) => {
    const room = { id: rooms.length + 1, x0, y0, w, h, bx, by, type: null, doors: [], dark: false };
    rooms.push(room);
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { grid[I(x, y)] = FLOOR; region[I(x, y)] = room.id; }
    return room;
  };
  for (let by = 0; by < ny; by++) for (let bx = 0; bx < nx; bx++) {
    const ox = 1 + bx * S + CORR, oy = 1 + by * S + CORR;
    const a = ox + 1, b = ox + 6, c = oy + 1, d = oy + 6;
    const r = R();
    if (r < 0.07) addRoom(a, c, 9, 9, bx, by);
    else if (r < 0.19) { addRoom(a, c, 9, 4, bx, by); addRoom(a, d, 4, 4, bx, by); addRoom(b, d, 4, 4, bx, by); }
    else if (r < 0.31) { addRoom(a, c, 4, 4, bx, by); addRoom(b, c, 4, 4, bx, by); addRoom(a, d, 9, 4, bx, by); }
    else if (r < 0.41) { addRoom(a, c, 4, 9, bx, by); addRoom(b, c, 4, 4, bx, by); addRoom(b, d, 4, 4, bx, by); }
    else if (r < 0.51) { addRoom(a, c, 4, 4, bx, by); addRoom(a, d, 4, 4, bx, by); addRoom(b, c, 4, 9, bx, by); }
    else if (r < 0.58) { addRoom(a, c, 9, 4, bx, by); addRoom(a, d, 9, 4, bx, by); }
    else { addRoom(a, c, 4, 4, bx, by); addRoom(b, c, 4, 4, bx, by); addRoom(a, d, 4, 4, bx, by); addRoom(b, d, 4, 4, bx, by); }
  }
  const roomById = (id) => rooms[id - 1];

  // ---- doors -----------------------------------------------------------
  const doors = [];
  const candidates = (room) => {
    const out = [];
    for (let y = room.y0; y < room.y0 + room.h; y++) for (let x = room.x0; x < room.x0 + room.w; x++) {
      for (const [dx, dy] of DIRS) {
        const wx = x + dx, wy = y + dy;
        if (!inb(wx, wy) || grid[I(wx, wy)] !== WALL) continue;
        const tx = wx + dx, ty = wy + dy;
        if (!inb(tx, ty) || grid[I(tx, ty)] !== FLOOR) continue;
        const reg = region[I(tx, ty)];
        if (reg < 0 || reg === room.id) continue;
        out.push({ x: wx, y: wy, dx, dy, target: reg });
      }
    }
    return out;
  };
  const canDoor = (c) => {
    const px = c.dy, py = c.dx;
    return grid[I(c.x, c.y)] === WALL && grid[I(c.x + px, c.y + py)] === WALL && grid[I(c.x - px, c.y - py)] === WALL;
  };
  const makeDoor = (c, room) => {
    grid[I(c.x, c.y)] = DOOR;
    const door = { x: c.x, y: c.y, dx: c.dx, dy: c.dy, a: room.id, b: c.target, exit: false };
    doors.push(door); room.doors.push(door); if (c.target > 0) roomById(c.target).doors.push(door);
    return door;
  };
  for (const room of rooms) {
    const cands = shuffle(candidates(room).filter((c) => c.target === 0));
    const want = room.w * room.h > 16 && R() < 0.6 ? 2 : 1;
    let made = 0;
    for (const c of cands) { if (made >= want) break; if (canDoor(c)) { makeDoor(c, room); made++; } }
  }
  for (const room of rooms) {
    const cands = candidates(room).filter((c) => c.target > room.id);
    const byTarget = {};
    for (const c of cands) (byTarget[c.target] ||= []).push(c);
    for (const t in byTarget) {
      if (R() < 0.35) { const list = shuffle(byTarget[t]); const c = list.find(canDoor); if (c) makeDoor(c, room); }
    }
  }
  const removeDoor = (door) => {
    grid[I(door.x, door.y)] = WALL;
    doors.splice(doors.indexOf(door), 1);
    for (const id of [door.a, door.b]) if (id > 0) { const rr = roomById(id); rr.doors.splice(rr.doors.indexOf(door), 1); }
  };
  const stripInternal = (room) => { for (const d of [...room.doors]) if (d.a > 0 && d.b > 0) removeDoor(d); };

  // ---- spawn room ------------------------------------------------------
  const corners = [[0, 0], [nx - 1, 0], [0, ny - 1], [nx - 1, ny - 1]];
  const [cbx, cby] = pick(corners);
  let spawnRoom = pick(rooms.filter((r) => r.bx === cbx && r.by === cby && r.w === 4 && r.h === 4) .concat([]))
    || pick(rooms.filter((r) => r.w === 4 && r.h === 4)) || rooms[0];
  stripInternal(spawnRoom);
  while (spawnRoom.doors.length > 1) removeDoor(spawnRoom.doors[spawnRoom.doors.length - 1]);
  const roomCenterCell = (r) => [r.x0 + (r.w >> 1), r.y0 + (r.h >> 1)];

  const bfs = (sx, sy) => {
    const dist = new Int32Array(W * H).fill(-1);
    const q = new Int32Array(W * H); let qh = 0, qt = 0;
    dist[I(sx, sy)] = 0; q[qt++] = I(sx, sy);
    while (qh < qt) {
      const cur = q[qh++]; const cx = cur % W, cy = (cur / W) | 0;
      for (const [dx, dy] of DIRS) {
        const x = cx + dx, y = cy + dy; if (!inb(x, y)) continue;
        const k = I(x, y); if (dist[k] >= 0) continue;
        const t = grid[k]; if (t !== FLOOR && t !== DOOR) continue;
        dist[k] = dist[cur] + 1; q[qt++] = k;
      }
    }
    return dist;
  };
  const [scx, scy] = roomCenterCell(spawnRoom);
  const countWalk = () => { let n = 0; for (let k = 0; k < W * H; k++) if (grid[k] === FLOOR || grid[k] === DOOR) n++; return n; };

  // ---- barricades (block some corridor segments, keep everything reachable) ---
  const barricades = [];
  const nearDoor = (x, y) => { for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) if (inb(xx, yy) && grid[I(xx, yy)] === DOOR) return true; return false; };
  const barCands = [];
  for (let i = 0; i <= nx; i++) for (let j = 0; j < ny; j++) barCands.push({ v: true, x: 1 + i * S, y: 1 + j * S + CORR + ri(3, 7) });
  for (let j = 0; j <= ny; j++) for (let i = 0; i < nx; i++) barCands.push({ v: false, x: 1 + i * S + CORR + ri(3, 7), y: 1 + j * S });
  shuffle(barCands);
  for (const b of barCands) {
    if (barricades.length >= def.barricades) break;
    const cells = b.v ? [[b.x, b.y], [b.x + 1, b.y]] : [[b.x, b.y], [b.x, b.y + 1]];
    if (cells.some(([x, y]) => grid[I(x, y)] !== FLOOR || nearDoor(x, y))) continue;
    const before = countWalk();
    for (const [x, y] of cells) grid[I(x, y)] = BARR;
    const dist = bfs(scx, scy); let reach = 0; for (let k = 0; k < W * H; k++) if (dist[k] >= 0) reach++;
    if (reach !== before - 2) { for (const [x, y] of cells) grid[I(x, y)] = FLOOR; continue; }
    barricades.push({ cells, vertical: b.v });
  }

  const dist = bfs(scx, scy);
  const roomDist = (r) => { const [x, y] = roomCenterCell(r); return dist[I(x, y)]; };

  // ---- exit room (farthest small room) ------------------------------------
  let exitRoom = null, best = -1;
  for (const r of rooms) {
    if (r === spawnRoom || r.w !== 4 || r.h !== 4) continue;
    if (!r.doors.some((d) => d.b === 0)) continue;
    const dd = roomDist(r); if (dd > best) { best = dd; exitRoom = r; }
  }
  stripInternal(exitRoom);
  while (exitRoom.doors.length > 1) removeDoor(exitRoom.doors[exitRoom.doors.length - 1]);
  const exitDoor = exitRoom.doors[0];
  exitDoor.exit = true;
  grid[I(exitDoor.x, exitDoor.y)] = EXIT;

  // ---- monster room ----------------------------------------------------
  const others = rooms.filter((r) => r !== spawnRoom && r !== exitRoom);
  const byDist = [...others].sort((a, b) => roomDist(b) - roomDist(a));
  const far = byDist.slice(0, Math.max(2, Math.ceil(byDist.length * 0.35)));
  // random keys are drawn up-front: calling R() inside a comparator would make the
  // result depend on the JS engine's sort algorithm and break server/client determinism
  const farKey = new Map(far.map((r) => [r, r.w * r.h + (R() - 0.5) * 4]));
  far.sort((a, b) => farKey.get(b) - farKey.get(a) || a.id - b.id);
  const monsterRoom = far[0];
  monsterRoom.type = 'waiting';
  spawnRoom.type = 'elevator'; exitRoom.type = def.exitStyle === 'garage' ? 'garage' : 'elevator';

  const typeless = shuffle(others.filter((r) => r !== monsterRoom));
  typeless.forEach((r, i) => {
    r.type = i < 3 ? (li === 1 && i === 2 ? 'xrayroom' : 'office') : pick(def.roomTypes);
    r.dark = R() < def.darkRooms;
  });

  // ---- placement helpers ---------------------------------------------------
  const used = new Uint8Array(W * H), clear = new Uint8Array(W * H);
  const markClear = (x, y) => { if (inb(x, y)) clear[I(x, y)] = 1; };
  for (const d of doors) for (const s of [-1, 1]) {
    const cx = d.x + d.dx * s, cy = d.y + d.dy * s;
    markClear(cx, cy); markClear(cx + d.dy, cy + d.dx); markClear(cx - d.dy, cy - d.dx);
  }
  for (const r of [spawnRoom, exitRoom]) for (let y = r.y0; y < r.y0 + r.h; y++) for (let x = r.x0; x < r.x0 + r.w; x++) clear[I(x, y)] = 1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (isIntersection(x, y)) clear[I(x, y)] = 1;
  for (const b of barricades) for (const [x, y] of b.cells) for (const [dx, dy] of DIRS) markClear(x + dx, y + dy);

  const props = [], colliders = [];
  const footprint = (type, ry) => {
    const [w, d, col] = PROP_SIZES[type];
    const rot90 = Math.abs(Math.sin(ry)) > 0.5;
    return { ex: rot90 ? d : w, ez: rot90 ? w : d, col };
  };
  const tryPlace = (type, x, z, ry, regionId, extra = {}, ignoreClear = false) => {
    const { ex, ez, col } = footprint(type, ry);
    const x0 = x - ex / 2, x1 = x + ex / 2, z0 = z - ez / 2, z1 = z + ez / 2;
    const cx0 = Math.floor((x0 + 0.05) / CELL), cx1 = Math.floor((x1 - 0.05) / CELL);
    const cy0 = Math.floor((z0 + 0.05) / CELL), cy1 = Math.floor((z1 - 0.05) / CELL);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      if (!inb(cx, cy)) return null;
      const k = I(cx, cy);
      if (grid[k] !== FLOOR || region[k] !== regionId || used[k] || (!ignoreClear && clear[k])) return null;
    }
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) used[I(cx, cy)] = 1;
    const p = { type, x, z, ry, ...extra };
    props.push(p);
    if (col) colliders.push({ x0, z0, x1, z1 });
    return p;
  };
  const wallSlots = (cells) => {
    const out = [];
    for (const [x, y] of cells) for (const [dx, dy] of DIRS) if (inb(x + dx, y + dy) && grid[I(x + dx, y + dy)] === WALL) out.push({ x, y, dx, dy });
    return shuffle(out);
  };
  const placeOnWall = (type, slot, regionId, extra) => {
    const [, d] = PROP_SIZES[type];
    const c = cellCenter(slot.x, slot.y);
    const off = CELL / 2 - d / 2 - 0.03;
    const ry = Math.atan2(-slot.dx, -slot.dy);
    return tryPlace(type, c.x + slot.dx * off, c.z + slot.dy * off, ry, regionId, extra);
  };
  const placeWallAny = (type, slots, regionId, extra) => {
    for (let i = 0; i < slots.length; i++) {
      const p = placeOnWall(type, slots[i], regionId, extra);
      if (p) { slots.splice(i, 1); return p; }
    }
    return null;
  };
  const roomCells = (r) => { const out = []; for (let y = r.y0; y < r.y0 + r.h; y++) for (let x = r.x0; x < r.x0 + r.w; x++) out.push([x, y]); return out; };
  const facing = (p) => ({ x: Math.sin(p.ry), z: Math.cos(p.ry) });
  const interactPoint = (p, extraDist = 0.65) => {
    const f = facing(p); const [, d] = PROP_SIZES[p.type];
    return { ix: p.x + f.x * (d / 2 + extraDist), iz: p.z + f.z * (d / 2 + extraDist) };
  };

  // ---- stations (tasks) ------------------------------------------------
  const stations = [];
  const roomSlots = new Map();
  for (const r of rooms) roomSlots.set(r.id, wallSlots(roomCells(r)));
  const stationRooms = new Set();
  let stN = 0;
  for (const task of def.tasks) {
    if (task.final) continue;
    for (let s = 0; s < (task.stations || 1); s++) {
      const cands = shuffle(others.filter((r) => !stationRooms.has(r.id) && r !== monsterRoom));
      let placed = null;
      for (const r of cands) {
        const p = placeWallAny(task.station, roomSlots.get(r.id), r.id, { station: true });
        if (p) { placed = p; stationRooms.add(r.id); break; }
      }
      if (!placed) continue;
      const st = { id: 'st' + (stN++), kind: task.station, taskId: task.id, x: placed.x, z: placed.z, ry: placed.ry, ...interactPoint(placed, 0.7) };
      placed.stationId = st.id;
      stations.push(st);
    }
  }
  // exit panel next to the exit door, facing the corridor
  {
    const d = exitDoor; const px = d.dy, py = d.dx;
    let side = 1;
    const wx = d.x + px * side, wy = d.y + py * side;
    const c = cellCenter(wx, wy);
    const x = c.x + d.dx * (CELL / 2 + 0.07), z = c.z + d.dy * (CELL / 2 + 0.07);
    const ry = Math.atan2(d.dx, d.dy);
    const p = { type: 'exitpanel', x, z, ry, station: true, stationId: 'st' + stN };
    props.push(p);
    const task = def.tasks.find((t) => t.final);
    stations.push({ id: 'st' + (stN++), kind: 'exitpanel', taskId: task.id, x, z, ry, ix: x + d.dx * 0.9, iz: z + d.dy * 0.9 });
  }

  // ---- monster waiting room (they sit in chairs at the start) ---------------
  const seats = [];
  {
    const slots = roomSlots.get(monsterRoom.id);
    for (let k = 0; k < 3; k++) {
      const p = placeWallAny('chairrow', slots, monsterRoom.id, {});
      if (!p) break;
      const f = facing(p); const rx = Math.cos(p.ry), rz = -Math.sin(p.ry);
      for (let s = 0; s < 5; s++) {
        const o = -1.2 + s * 0.6;
        seats.push({ x: p.x + rx * o + f.x * 0.05, z: p.z + rz * o + f.z * 0.05, ry: p.ry });
      }
    }
    while (seats.length < 6) {
      const [x, y] = pick(roomCells(monsterRoom)); const c = cellCenter(x, y);
      seats.push({ x: c.x, z: c.z, ry: R() * Math.PI * 2, floor: true });
    }
    // spread the chosen seats so the monsters are not shoulder to shoulder
    const spread = [];
    for (let i = 0; i < seats.length; i += 2) spread.push(seats[i]);
    for (let i = 1; i < seats.length; i += 2) spread.push(seats[i]);
    seats.splice(0, seats.length, ...spread);
  }

  // ---- room furniture --------------------------------------------------
  const searchables = [];
  let sN = 0;
  const addSearch = (p) => {
    if (!p) return;
    p.searchId = 's' + (sN++);
    searchables.push({ id: p.searchId, kind: p.type, x: p.x, z: p.z, ry: p.ry, ...interactPoint(p, 0.6), loot: 'none' });
  };
  for (const r of rooms) {
    const recipe = RECIPES[r.type]; if (!recipe) continue;
    const slots = roomSlots.get(r.id);
    const scale = Math.max(1, Math.round((r.w * r.h) / 16));
    for (const [type, mn, mx, flag] of recipe.wall) {
      const n = ri(mn, mx) * (type === 'poster' ? 1 : scale);
      for (let k = 0; k < n; k++) {
        const extra = {};
        if (type === 'poster') extra.variant = ri(0, 5);
        const p = placeWallAny(type, slots, r.id, extra);
        if (p && flag === 'search') addSearch(p);
      }
    }
    for (const [type, mn, mx, flag] of recipe.center) {
      const n = ri(mn, mx);
      for (let k = 0; k < n; k++) {
        const col = PROP_SIZES[type][2];
        const ry = col ? pick([0, Math.PI / 2]) : R() * Math.PI * 2;
        const cx = (r.x0 + r.w / 2) * CELL + (k ? (R() - 0.5) * 2 : 0), cz = (r.y0 + r.h / 2) * CELL + (k ? (R() - 0.5) * 2 : 0);
        const p = tryPlace(type, cx, cz, ry, r.id, {});
        if (p && flag === 'search') addSearch(p);
      }
    }
  }

  // ---- corridor clutter + lockers ------------------------------------------
  const corridorCells = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (region[I(x, y)] === 0 && grid[I(x, y)] === FLOOR && !clear[I(x, y)]) corridorCells.push([x, y]);
  const corridorSlots = wallSlots(corridorCells);
  const lockers = [];
  let lN = 0;
  const addLocker = (p) => {
    if (!p) return false;
    p.lockerId = 'L' + (lN++);
    lockers.push({ id: p.lockerId, x: p.x, z: p.z, ry: p.ry, ...interactPoint(p, 0.55) });
    return true;
  };
  const roomLockers = Math.ceil(def.lockers / 2);
  const lockerRooms = shuffle(others.filter((r) => r !== monsterRoom));
  for (let k = 0, placed = 0; k < lockerRooms.length && placed < roomLockers; k++) {
    if (addLocker(placeWallAny('locker', roomSlots.get(lockerRooms[k].id), lockerRooms[k].id, {}))) placed++;
  }
  for (let k = lockers.length, guard = 0; k < def.lockers && guard < 400; guard++) {
    if (!corridorSlots.length) break;
    const slot = corridorSlots[Math.floor(R() * corridorSlots.length)];
    if (addLocker(placeOnWall('locker', slot, 0, {}))) { corridorSlots.splice(corridorSlots.indexOf(slot), 1); k++; }
  }
  const clutter = ['wheelchair', 'gurney', 'chairrow2', 'ivstand', 'trash', 'wetsign', 'cart', 'wheelchair', 'gurney', 'poster', 'poster'];
  for (const slot of corridorSlots) {
    if (R() > 0.075) continue;
    const type = pick(clutter);
    const extra = type === 'poster' ? { variant: ri(0, 5) } : {};
    const p = placeOnWall(type, slot, 0, extra);
    if (p && type === 'cart') addSearch(p);
  }
  // creepy writing on a few corridor walls
  for (let k = 0, g = 0; k < 3 && g < 60; g++) {
    const slot = corridorSlots[Math.floor(R() * corridorSlots.length)];
    if (slot && placeOnWall('writing', slot, 0, { variant: k })) k++;
  }

  // ---- floor pickups -----------------------------------------------------
  const pickups = [];
  let pN = 0;
  const freeCellIn = (r) => {
    const cells = shuffle(roomCells(r).filter(([x, y]) => !used[I(x, y)]));
    return cells[0] || null;
  };
  const questRooms = shuffle(others.filter((r) => r !== monsterRoom));
  let qIdx = 0;
  let noteDigit = 0;
  for (const [item, count] of Object.entries(def.floorItems)) {
    for (let k = 0; k < count; k++) {
      let cell = null;
      if (['fuse', 'vial', 'gascan', 'note'].includes(item)) {
        for (let g = 0; g < questRooms.length && !cell; g++) { cell = freeCellIn(questRooms[qIdx % questRooms.length]); qIdx++; }
      } else {
        if (R() < 0.5) cell = freeCellIn(pick(others));
        if (!cell) cell = pick(corridorCells.filter(([x, y]) => !used[I(x, y)]));
      }
      if (!cell) continue;
      used[I(cell[0], cell[1])] = 1;
      const c = cellCenter(cell[0], cell[1]);
      const pk = { id: 'p' + (pN++), item, x: c.x + (R() - 0.5) * 0.9, z: c.z + (R() - 0.5) * 0.9 };
      if (item === 'note') pk.digit = noteDigit++;
      pickups.push(pk);
    }
  }

  // ---- searchable loot ---------------------------------------------------
  const sDist = (s) => { const k = I(Math.floor(s.ix / CELL), Math.floor(s.iz / CELL)); return dist[k] >= 0 ? dist[k] : 0; };
  for (const h of def.hiddenItems) {
    let cands = searchables.filter((s) => s.kind === h.in && s.loot === 'none');
    if (!cands.length) cands = searchables.filter((s) => s.loot === 'none');
    if (cands.length) pick(cands).loot = h.item;
  }
  for (const w of def.weapons) {
    const cands = searchables.filter((s) => s.loot === 'none').sort((a, b) => sDist(b) - sDist(a));
    const top = cands.slice(0, Math.max(1, Math.ceil(cands.length * 0.6)));
    if (top.length) pick(top).loot = 'weapon:' + w;
  }
  const totalW = LOOT_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  for (const s of searchables) {
    if (s.loot !== 'none') continue;
    let roll = R() * totalW;
    for (const [item, w] of LOOT_WEIGHTS) { roll -= w; if (roll <= 0) { s.loot = item; break; } }
  }

  // ---- lights ------------------------------------------------------------
  const lights = [];
  const lightKeys = new Set();
  const addLight = (x, z, opts) => {
    const key = Math.round(x * 2) + ',' + Math.round(z * 2); if (lightKeys.has(key)) return; lightKeys.add(key);
    lights.push({ x, z, broken: R() < def.brokenLights, flicker: R() < 0.16, ...opts });
  };
  for (let i = 0; i <= nx; i++) { const x0 = 1 + i * S; for (let y = 2; y < H - 2; y += 3) if (grid[I(x0, y)] === FLOOR) addLight((x0 + 1) * CELL, (y + 0.5) * CELL, {}); }
  for (let j = 0; j <= ny; j++) { const y0 = 1 + j * S; for (let x = 2; x < W - 2; x += 3) if (grid[I(x, y0)] === FLOOR && !vCorr[x]) addLight((x + 0.5) * CELL, (y0 + 1) * CELL, {}); }
  for (const r of rooms) {
    const lx = r.w > 4 ? [r.x0 + r.w * 0.25, r.x0 + r.w * 0.75] : [r.x0 + r.w / 2];
    const lz = r.h > 4 ? [r.y0 + r.h * 0.25, r.y0 + r.h * 0.75] : [r.y0 + r.h / 2];
    for (const a of lx) for (const b of lz) {
      const isEl = r === spawnRoom || r === exitRoom;
      lights.push({ x: a * CELL, z: b * CELL, room: r.id, broken: !isEl && (r.dark || R() < def.brokenLights * 0.5), flicker: !isEl && R() < 0.2, warm: r.type === 'office' });
    }
  }

  // ---- decals & signs ----------------------------------------------------
  const decals = [];
  for (let k = 0; k < 16; k++) {
    const [x, y] = pick(corridorCells.concat(...others.map(roomCells)));
    const c = cellCenter(x, y);
    decals.push({ type: R() < 0.55 ? 'blood' : 'drag', x: c.x + (R() - 0.5) * 1.5, z: c.z + (R() - 0.5) * 1.5, ry: R() * Math.PI * 2, s: 0.6 + R() * 1.2 });
  }
  for (let k = 0; k < 40; k++) {
    const [x, y] = pick(corridorCells.concat(...others.map(roomCells)));
    const c = cellCenter(x, y);
    decals.push({ type: 'paper', x: c.x + (R() - 0.5) * 1.8, z: c.z + (R() - 0.5) * 1.8, ry: R() * Math.PI * 2, s: 1 });
  }
  const signs = [];
  {
    const d = exitDoor; const c = cellCenter(d.x + d.dx, d.y + d.dy);
    signs.push({ x: c.x, z: c.z, ry: Math.atan2(d.dx, d.dy), exit: true });
  }
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) {
    if (R() < 0.35) signs.push({ x: (1 + i * S + 1) * CELL, z: (1 + j * S + 1) * CELL, ry: pick([0, Math.PI / 2]), exit: false });
  }

  // ---- spawn points ------------------------------------------------------
  const spc = { x: (spawnRoom.x0 + spawnRoom.w / 2) * CELL, z: (spawnRoom.y0 + spawnRoom.h / 2) * CELL };
  const sd = spawnRoom.doors[0];
  const spawnYaw = Math.atan2(-sd.dx, -sd.dy); // camera yaw facing the door (forward = -sin,-cos)
  const spawnPoints = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    spawnPoints.push({ x: spc.x + Math.cos(a) * 1.6, z: spc.z + Math.sin(a) * 1.6 });
  }

  // ---- monster spawns ----------------------------------------------------
  const monsterSpawns = seats.slice(0, 6);

  // ---- code for the keypad ------------------------------------------------
  const code = String(ri(1, 9)) + String(ri(0, 9)) + String(ri(0, 9));

  // ---- collider buckets (client-side player collision) ---------------------
  const colBuckets = new Array(W * H);
  for (const c of colliders) {
    for (let cy = Math.floor(c.z0 / CELL); cy <= Math.floor(c.z1 / CELL); cy++)
      for (let cx = Math.floor(c.x0 / CELL); cx <= Math.floor(c.x1 / CELL); cx++) {
        if (!inb(cx, cy)) continue; (colBuckets[I(cx, cy)] ||= []).push(c);
      }
  }

  const walkCells = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (grid[I(x, y)] === FLOOR) walkCells.push(I(x, y));

  return {
    li, seed, def, W, H, grid, region, rooms, doors, barricades, spawnRoom, exitRoom, exitDoor, monsterRoom,
    stations, pickups, searchables, lockers, props, colliders, colBuckets, lights, decals, signs,
    spawnPoints, spawnYaw, monsterSpawns, code, walkCells, dist,
  };
}

export function inRoom(room, x, z) {
  return x >= room.x0 * CELL && x <= (room.x0 + room.w) * CELL && z >= room.y0 * CELL && z <= (room.y0 + room.h) * CELL;
}
