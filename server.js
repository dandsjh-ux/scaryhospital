// Ward 13 — authoritative multiplayer server.
// Serves the static client and runs rooms, monster AI, items, tasks and level flow.

import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import { generateLevel, moveCircle, hasLOS, inRoom, cellCenter, FLOOR, DOOR, EXIT } from './shared/levelgen.js';
import { LEVELS, MONSTERS, ITEMS, WEAPONS, CELL, MAX_PLAYERS, SELF_REVIVE } from './shared/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use('/shared', express.static(path.join(__dirname, 'shared')));
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules', 'three')));
app.get('/healthz', (_req, res) => res.send('ok'));

const server = http.createServer(app);
const io = new Server(server);

const rooms = new Map();
const TICK_MS = 50;
const SNAP_MS = 66;

const r2 = (v) => Math.round(v * 100) / 100;
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const rand = (a, b) => a + Math.random() * (b - a);
const STATE_CODE = { dormant: 0, patrol: 1, investigate: 2, chase: 3, search: 4, stunned: 5 };

function randCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let s = '';
  do { s = ''; for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)]; } while (rooms.has(s));
  return s;
}

// ---------------------------------------------------------------- A* pathing
function astar(L, sx, sy, gx, gy, exitOpen) {
  const W = L.W, H = L.H, N = W * H;
  if (!L._g) { L._g = new Float32Array(N); L._came = new Int32Array(N); L._stamp = new Uint32Array(N); L._closed = new Uint32Array(N); L._run = 0; }
  const g = L._g, came = L._came, stamp = L._stamp, closed = L._closed; const run = ++L._run;
  const walk = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= H) return false; const t = L.grid[y * W + x]; return t === FLOOR || t === DOOR || (t === EXIT && exitOpen); };
  if (!walk(gx, gy) || !walk(sx, sy)) return null;
  const start = sy * W + sx, goal = gy * W + gx;
  const heap = []; // [f, idx]
  const push = (f, i) => { heap.push([f, i]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
  const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = c * 2 + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
  const h = (i) => { const dx = Math.abs((i % W) - gx), dy = Math.abs(((i / W) | 0) - gy); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
  g[start] = 0; stamp[start] = run; came[start] = -1; push(h(start), start);
  let iter = 0;
  while (heap.length && iter++ < 6000) {
    const [, cur] = pop();
    if (cur === goal) break;
    if (closed[cur] === run) continue; closed[cur] = run;
    const cx = cur % W, cy = (cur / W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cx + dx, ny = cy + dy;
      if (!walk(nx, ny)) continue;
      if (dx && dy && (!walk(cx + dx, cy) || !walk(cx, cy + dy))) continue;
      const ni = ny * W + nx; const cost = g[cur] + (dx && dy ? 1.414 : 1);
      if (stamp[ni] !== run || cost < g[ni]) { stamp[ni] = run; g[ni] = cost; came[ni] = cur; push(cost + h(ni), ni); }
    }
  }
  if (stamp[goal] !== run) return null;
  const path = []; let c = goal;
  while (c !== -1 && c !== start) { const cc = cellCenter(c % W, (c / W) | 0); path.push(cc); c = came[c]; }
  path.reverse();
  return path;
}

// ---------------------------------------------------------------- Game room
class Game {
  constructor(code, isPublic) {
    this.code = code; this.isPublic = isPublic;
    this.players = new Map(); this.hostId = null;
    this.phase = 'lobby'; this.li = 0; this.seed = 0; this.level = null;
    this.monsters = []; this.timers = [];
  }

  emit(ev, data) { io.to(this.code).emit(ev, data); }
  toast(p, text, kind = 'info') { p.socket.emit('toast', { text, kind }); }
  toastAll(text, kind = 'info') { this.emit('toast', { text, kind }); }
  later(ms, fn) { const t = setTimeout(() => { if (rooms.get(this.code) === this) fn(); }, ms); this.timers.push(t); }
  roster() { return [...this.players.values()].map((p) => ({ id: p.id, name: p.name, gender: p.gender, shirt: p.shirt, skin: p.skin })); }
  sendLobby() { this.emit('lobby', { code: this.code, hostId: this.hostId, phase: this.phase, players: this.roster(), li: this.li }); }

  addPlayer(socket, info) {
    const p = {
      id: socket.id, socket, ...info,
      x: 0, z: 0, ry: 0, cr: false, sp: false, fl: false, mv: false, noise: 0,
      hp: 100, down: false, hidden: null, inv: { bandage: 1, battery: 1 }, quest: {}, weapons: {}, equipped: null,
      selfRevives: SELF_REVIVE.perFloor, downAt: 0,
      lastAttack: 0, snapshot: null,
    };
    this.players.set(p.id, p);
    socket.join(this.code);
    socket.data.game = this;
    if (!this.hostId) this.hostId = p.id;
    this.sendLobby();
    if (this.phase === 'playing' || this.phase === 'transition') {
      this.placeAtSpawn(p, this.players.size - 1);
      p.snapshot = this.invSnapshot(p);
      socket.emit('level', this.levelPayload());
      this.sendInv(p);
      this.toastAll(`${p.name} joined the shift`);
    }
  }

  removePlayer(id) {
    const p = this.players.get(id); if (!p) return;
    this.players.delete(id);
    if (this.hostId === id) this.hostId = this.players.size ? this.players.keys().next().value : null;
    if (!this.players.size) { this.timers.forEach(clearTimeout); rooms.delete(this.code); return; }
    for (const m of this.monsters) if (m.target === id) { m.target = null; m.state = 'search'; m.searchT = 3; }
    this.toastAll(`${p.name} left`);
    this.sendLobby();
    this.checkFail();
  }

  invSnapshot(p) { return JSON.stringify({ inv: p.inv, weapons: p.weapons, equipped: p.equipped }); }
  sendInv(p) {
    p.socket.emit('inv', {
      inv: p.inv, quest: p.quest, weapons: p.weapons, equipped: p.equipped, hp: p.hp,
      selfRevives: p.selfRevives || 0, downFor: p.down ? Date.now() - p.downAt : 0,
    });
  }
  taskStatus() { return this.tasks.map((t) => ({ id: t.id, done: t.done, stations: t.stations })); }
  notesPayload() { const L = this.level; return [0, 1, 2].map((i) => (this.notes.has(i) ? L.code[i] : null)); }

  levelPayload() {
    const spawns = {}; for (const p of this.players.values()) spawns[p.id] = { x: p.x, z: p.z };
    return {
      li: this.li, seed: this.seed,
      taken: [...this.taken], searched: [...this.searched],
      tasks: this.taskStatus(), notes: this.notesPayload(),
      exitOpen: this.exitOpen, callRemaining: this.call ? Math.max(0, this.call.endsAt - Date.now()) : -1,
      elapsed: Date.now() - this.levelStart, totalElapsed: Date.now() - this.totalStart,
      monsters: this.monsters.map((m) => ({ id: m.id, kind: m.kind })),
      spawns, yaw: this.level.spawnYaw, roster: this.roster(),
    };
  }

  placeAtSpawn(p, i) { const sp = this.level.spawnPoints[i % this.level.spawnPoints.length]; p.x = sp.x; p.z = sp.z; p.ry = this.level.spawnYaw; }

  startGame() {
    this.totalStart = Date.now();
    for (const p of this.players.values()) { p.hp = 100; p.inv = { bandage: 1, battery: 1 }; p.weapons = {}; p.equipped = null; }
    this.startLevel(0, false);
  }

  startLevel(li, retry) {
    this.li = li;
    if (!retry) this.seed = (Math.random() * 1e9) | 0;
    const L = this.level = generateLevel(li, this.seed);
    this.patrolCells = L.walkCells.filter((k) => { const c = cellCenter(k % L.W, (k / L.W) | 0); return !inRoom(L.exitRoom, c.x, c.z) && !inRoom(L.spawnRoom, c.x, c.z); });
    this.taken = new Set(); this.searched = new Set(); this.notes = new Set();
    this.exitOpen = false; this.call = null; this.firstInExit = null; this.failAt = null; this.lastAlarm = 0;
    this.levelStart = Date.now(); this.phase = 'playing';
    this.tasks = L.def.tasks.map((t) => ({
      id: t.id, def: t, done: false,
      stations: Object.fromEntries(L.stations.filter((s) => s.taskId === t.id).map((s) => [s.id, 0])),
    }));
    this.spawnMonsters();
    let i = 0;
    for (const p of this.players.values()) {
      this.placeAtSpawn(p, i++);
      if (retry && p.snapshot) { const s = JSON.parse(p.snapshot); p.inv = s.inv; p.weapons = s.weapons; p.equipped = s.equipped; p.hp = 100; }
      else p.hp = p.down ? 50 : Math.max(p.hp, 50);
      p.down = false; p.hidden = null; p.quest = {}; p.noise = 0; p.selfRevives = SELF_REVIVE.perFloor;
      p.snapshot = this.invSnapshot(p);
    }
    this.emit('level', this.levelPayload());
    for (const p of this.players.values()) this.sendInv(p);
  }

  spawnMonsters() {
    const L = this.level, def = L.def;
    const kinds = [...def.monsters];
    const extra = Math.floor((this.players.size - 1) / 2);
    for (let i = 0; i < extra; i++) kinds.push(def.extraMonsters[i % def.extraMonsters.length]);
    const now = Date.now();
    const first = this.li === 0 ? 30 : 18, gap = this.li === 0 ? 16 : 11;
    this.monsters = kinds.map((kind, i) => {
      const s = L.monsterSpawns[i % L.monsterSpawns.length];
      return {
        id: i + 1, kind, def: MONSTERS[kind], x: s.x, z: s.z, ry: s.ry,
        state: 'dormant', wakeAt: now + (first + i * gap) * 1000,
        goal: null, path: null, pathGoal: null, pathTime: 0, target: null, lastKnown: null,
        lostT: 0, searchT: 0, investT: 0, stun: 0, recoil: 0, attackCd: 0, stuckT: 0, lockerTarget: null, stunBy: null,
      };
    });
  }

  // ------------------------------------------------------------ monster AI
  pickPatrolGoal() {
    const L = this.level;
    const alive = [...this.players.values()].filter((p) => !p.down);
    if (alive.length && Math.random() < 0.45) {
      const p = alive[Math.floor(Math.random() * alive.length)];
      for (let g = 0; g < 40; g++) {
        const k = this.patrolCells[Math.floor(Math.random() * this.patrolCells.length)];
        const c = cellCenter(k % L.W, (k / L.W) | 0);
        if (Math.hypot(c.x - p.x, c.z - p.z) < 16) return c;
      }
    }
    const k = this.patrolCells[Math.floor(Math.random() * this.patrolCells.length)];
    return cellCenter(k % L.W, (k / L.W) | 0);
  }

  steerPath(m, goal, now) {
    const L = this.level;
    if (!m.path || !m.pathGoal || Math.hypot(goal.x - m.pathGoal.x, goal.z - m.pathGoal.z) > 1.5 || now - m.pathTime > 1800) {
      m.path = astar(L, Math.floor(m.x / CELL), Math.floor(m.z / CELL), Math.floor(goal.x / CELL), Math.floor(goal.z / CELL), this.exitOpen);
      m.pathGoal = { x: goal.x, z: goal.z }; m.pathTime = now;
      if (!m.path) return null;
    }
    while (m.path.length && Math.hypot(m.path[0].x - m.x, m.path[0].z - m.z) < 0.4) m.path.shift();
    if (!m.path.length) return goal;
    // look one waypoint ahead if it is directly visible (smoother corners)
    if (m.path.length > 1 && hasLOS(L, m.x, m.z, m.path[1].x, m.path[1].z, this.exitOpen) && Math.hypot(m.path[0].x - m.x, m.path[0].z - m.z) < 1.2) m.path.shift();
    return m.path[0];
  }

  investigate(m, x, z, time = 14) {
    if (m.state === 'dormant' || m.state === 'stunned' || m.state === 'chase') return;
    m.state = 'investigate'; m.goal = { x, z }; m.investT = time; m.path = null;
  }

  updateMonster(m, dt, now) {
    const L = this.level, D = m.def, sm = L.def.speedMult;
    if (m.state === 'dormant') {
      if (now >= m.wakeAt) { m.state = 'patrol'; m.goal = null; this.emit('mev', { id: m.id, ev: 'wake' }); }
      return;
    }
    if (m.state === 'stunned') {
      m.stun -= dt;
      if (m.stun <= 0) { m.state = 'patrol'; if (m.stunBy) this.investigate(m, m.stunBy.x, m.stunBy.z, 10); }
      return;
    }
    m.attackCd = Math.max(0, m.attackCd - dt);
    if (m.recoil > 0) { m.recoil -= dt; return; }

    // --- perception
    let seen = null, seenD = 1e9, heard = null, heardD = 1e9;
    for (const p of this.players.values()) {
      if (p.down) continue;
      const dx = p.x - m.x, dz = p.z - m.z, d = Math.hypot(dx, dz);
      if (!p.hidden) {
        const tracking = m.state === 'chase' && m.target === p.id;
        const range = D.sight * (p.fl ? 1.5 : 1) * (p.cr ? 0.55 : 1) * (tracking ? 1.8 : 1);
        if (d < range) {
          const ang = Math.abs(angDiff(Math.atan2(dx, dz), m.ry));
          if (tracking || d < 2.0 || ang < (D.fov * Math.PI) / 360) {
            if (d < seenD && hasLOS(L, m.x, m.z, p.x, p.z, this.exitOpen)) { seen = p; seenD = d; }
          }
        }
      }
      const noise = p.hidden ? 0 : p.noise;
      if (noise > 0 && d < noise * D.hearing && d < heardD) { heard = p; heardD = d; }
    }

    // --- decide
    if (seen) {
      if (m.state !== 'chase' || m.target !== seen.id) {
        this.emit('mev', { id: m.id, ev: 'chase', target: seen.id });
        if (D.shriek) this.shriek(m, seen);
      }
      m.state = 'chase'; m.target = seen.id; m.lastKnown = { x: seen.x, z: seen.z }; m.lostT = 0;
    } else if (m.state === 'chase') {
      m.lostT += dt;
      const tp = this.players.get(m.target);
      if (tp && !tp.down && !tp.hidden && m.lostT < 1.8) m.lastKnown = { x: tp.x, z: tp.z };
      if (tp && tp.hidden && m.lockerTarget === tp.hidden) {
        const lk = L.lockers.find((l) => l.id === tp.hidden);
        m.lastKnown = { x: lk.ix, z: lk.iz }; m.lostT = 0;
        if (Math.hypot(lk.ix - m.x, lk.iz - m.z) < 1.4) this.pullOut(m, tp, lk);
      } else if (!tp || tp.down || m.lostT > 6 || (m.lostT > 1.8 && Math.hypot(m.lastKnown.x - m.x, m.lastKnown.z - m.z) < 0.9)) {
        m.state = 'search'; m.searchT = rand(4, 7); m.target = null; m.lockerTarget = null;
        this.emit('mev', { id: m.id, ev: 'lost' });
      }
    } else if (heard) {
      const g = { x: heard.x + rand(-1.5, 1.5), z: heard.z + rand(-1.5, 1.5) };
      if (m.state !== 'investigate') this.emit('mev', { id: m.id, ev: 'hear' });
      m.state = 'investigate'; m.goal = g; m.investT = 14;
    }

    // --- act
    let speed = D.patrol * sm, tgt = null;
    switch (m.state) {
      case 'chase': {
        speed = D.chase * sm;
        if (seen && seen.id === m.target) { tgt = { x: seen.x, z: seen.z }; m.path = null; }
        else tgt = this.steerPath(m, m.lastKnown, now) || m.lastKnown;
        if (seen && seen.id === m.target && seenD < 1.35 && m.attackCd <= 0) this.attack(m, seen);
        break;
      }
      case 'investigate': {
        speed = D.patrol * sm * 1.5;
        m.investT -= dt;
        if (Math.hypot(m.goal.x - m.x, m.goal.z - m.z) < 1.0 || m.investT <= 0) { m.state = 'search'; m.searchT = rand(3, 6); break; }
        tgt = this.steerPath(m, m.goal, now);
        if (!tgt) { m.state = 'search'; m.searchT = 2; }
        break;
      }
      case 'search': {
        m.searchT -= dt;
        m.ry += Math.sin(now / 500 + m.id) * dt * 1.6;
        if (m.searchT <= 0) { m.state = 'patrol'; m.goal = null; }
        break;
      }
      default: { // patrol
        if (!m.goal || Math.hypot(m.goal.x - m.x, m.goal.z - m.z) < 1.0) {
          if (m.goal) { m.goal = null; m.state = 'search'; m.searchT = rand(1.5, 3.5); break; }
          m.goal = this.pickPatrolGoal(); m.path = null;
        }
        tgt = this.steerPath(m, m.goal, now);
        if (!tgt) m.goal = null;
      }
    }

    if (tgt) {
      const dx = tgt.x - m.x, dz = tgt.z - m.z, d = Math.hypot(dx, dz);
      if (d > 0.05) {
        const want = Math.atan2(dx, dz);
        const turn = angDiff(want, m.ry);
        m.ry += Math.sign(turn) * Math.min(Math.abs(turn), 9 * dt);
        const step = Math.min(speed * dt, d);
        const ox = m.x, oz = m.z;
        moveCircle(L, m, (dx / d) * step, (dz / d) * step, 0.38, this.exitOpen, false);
        const moved = Math.hypot(m.x - ox, m.z - oz);
        if (moved < step * 0.3) { m.stuckT += dt; if (m.stuckT > 1.2) { m.stuckT = 0; m.path = null; if (m.state === 'patrol') m.goal = null; } }
        else m.stuckT = 0;
      }
    }
  }

  shriek(m, p) {
    this.emit('mev', { id: m.id, ev: 'shriek' });
    for (const o of this.monsters) if (o !== m && Math.hypot(o.x - m.x, o.z - m.z) < 32) this.investigate(o, p.x, p.z, 16);
  }

  attack(m, p) {
    const D = m.def;
    p.hp -= D.dmg; m.attackCd = 1.7; m.recoil = 0.9;
    const dx = p.x - m.x, dz = p.z - m.z, d = Math.hypot(dx, dz) || 1;
    p.socket.emit('hit', { dmg: D.dmg, kx: dx / d, kz: dz / d, by: m.kind });
    this.emit('mev', { id: m.id, ev: 'attack', target: p.id });
    if (p.hp <= 0) this.downPlayer(p, m);
    else this.sendInv(p);
  }

  pullOut(m, p, lk) {
    p.hidden = null; p.x = lk.ix; p.z = lk.iz;
    p.socket.emit('pulled', { x: lk.ix, z: lk.iz });
    m.lockerTarget = null; m.attackCd = 0;
    this.attack(m, p);
  }

  downPlayer(p, m) {
    if ((p.inv.adrenaline || 0) > 0) {
      p.inv.adrenaline--; p.hp = 40;
      this.toast(p, '💉 Adrenaline kicked in! RUN!', 'good');
      this.sendInv(p);
      return;
    }
    p.hp = 0; p.down = true; p.hidden = null; p.noise = 0; p.downAt = Date.now();
    if (m) { m.state = 'search'; m.searchT = 4; m.target = null; }
    for (const o of this.monsters) if (o.target === p.id) { o.target = null; o.state = 'search'; o.searchT = 3; }
    this.toastAll(`☠ ${p.name} is down! Hold E on them to revive.`, 'bad');
    this.sendInv(p);
    this.checkFail();
  }

  // A downed player can still get up by themselves until they bleed out.
  canSelfRevive(p, now = Date.now()) {
    return p.down && (p.selfRevives || 0) > 0 && now - p.downAt < SELF_REVIVE.bleedOut * 1000;
  }

  checkFail() {
    if (this.phase !== 'playing' || this.failAt) return;
    const now = Date.now();
    const list = [...this.players.values()];
    const alive = list.filter((p) => !p.down);
    if (list.length && !alive.length && !list.some((p) => this.canSelfRevive(p, now))) {
      this.failAt = now + 5000;
      this.emit('fail', { li: this.li });
    }
  }

  // ------------------------------------------------------------ tick
  tick(dt) {
    if (this.phase !== 'playing') return;
    const now = Date.now();
    for (const m of this.monsters) this.updateMonster(m, dt, now);
    this.checkFail(); // catches downed players bleeding out

    if (this.call && !this.exitOpen) {
      if (now >= this.call.endsAt) {
        this.exitOpen = true;
        const t = this.tasks.find((t) => t.def.final); t.done = true;
        for (const k in t.stations) t.stations[k] = 1;
        this.emit('exit', { open: true });
        this.emit('tasks', this.taskStatus());
        this.toastAll(this.level.def.exitStyle === 'garage' ? '🚑 The bay door is open — GET TO THE AMBULANCE!' : '🛗 The elevator has arrived — GET IN!', 'good');
      } else if (now - this.lastAlarm > 8000) {
        this.lastAlarm = now;
        const st = this.level.stations.find((s) => s.kind === 'exitpanel');
        const alive = [...this.players.values()].filter((p) => !p.down && !p.hidden);
        this.monsters.forEach((m, i) => {
          if (i % 2 === 0 || !alive.length || this.li < 2) this.investigate(m, st.ix + rand(-4, 4), st.iz + rand(-4, 4), 12);
          else { const p = alive[Math.floor(Math.random() * alive.length)]; this.investigate(m, p.x + rand(-3, 3), p.z + rand(-3, 3), 12); }
        });
        this.emit('sfx', { s: 'alarm' });
      }
    }

    if (this.exitOpen) {
      const alive = [...this.players.values()].filter((p) => !p.down);
      const inside = alive.filter((p) => inRoom(this.level.exitRoom, p.x, p.z));
      if (inside.length && !this.firstInExit) { this.firstInExit = now; this.toastAll('Someone reached the exit — everyone else has 20 seconds!', 'warn'); }
      if (alive.length && inside.length === alive.length) this.completeLevel();
      else if (this.firstInExit && inside.length && now - this.firstInExit > 20000) this.completeLevel();
    }

    if (this.failAt && now >= this.failAt) { this.failAt = null; this.startLevel(this.li, true); }
  }

  completeLevel() {
    if (this.phase !== 'playing') return;
    this.phase = 'transition';
    const now = Date.now();
    this.emit('levelComplete', { li: this.li, time: now - this.levelStart, total: now - this.totalStart, last: this.li >= LEVELS.length - 1 });
    this.later(8000, () => {
      if (this.li + 1 < LEVELS.length) this.startLevel(this.li + 1, false);
      else {
        this.phase = 'victory';
        this.emit('victory', { total: Date.now() - this.totalStart });
        this.later(14000, () => { this.phase = 'lobby'; this.monsters = []; this.sendLobby(); });
      }
    });
  }

  snap() {
    return {
      p: [...this.players.values()].map((p) => [p.id, r2(p.x), r2(p.z), r2(p.ry),
        (p.cr ? 1 : 0) | (p.fl ? 2 : 0) | (p.down ? 4 : 0) | (p.hidden ? 8 : 0) | (p.mv ? 16 : 0) | (p.sp ? 32 : 0),
        Math.max(0, Math.round(p.hp)), p.equipped || '']),
      m: this.monsters.map((m) => [m.id, r2(m.x), r2(m.z), r2(m.ry), STATE_CODE[m.state] ?? 1, m.state === 'chase' ? m.target : '']),
      c: this.call && !this.exitOpen ? Math.max(0, this.call.endsAt - Date.now()) : -1,
    };
  }

  // ------------------------------------------------------------ actions
  near(p, x, z, r = 3.2) { return Math.hypot(p.x - x, p.z - z) < Math.max(r, 3.2); }

  checkTask(task) {
    if (task.done) return;
    const def = task.def;
    const vals = Object.values(task.stations);
    const done = def.type === 'deliver' ? vals.every((v) => v >= def.per) : vals.every((v) => v >= 1);
    if (done) {
      task.done = true;
      this.toastAll(`✔ ${def.short} complete!`, 'good');
      this.emit('sfx', { s: 'task' });
      if (this.tasks.filter((t) => !t.def.final).every((t) => t.done)) {
        const fin = this.tasks.find((t) => t.def.final);
        this.toastAll(`All tasks done! ${fin.def.label}`, 'good');
      }
    }
    this.emit('tasks', this.taskStatus());
  }

  handle(p, ev, d) {
    const L = this.level;
    const playing = this.phase === 'playing';
    switch (ev) {
      case 's': {
        if (!playing || p.down) return;
        if (p.hidden) { if (Number.isFinite(d.ry)) p.ry = d.ry; return; }
        if (![d.x, d.z, d.ry].every(Number.isFinite)) return;
        p.x = d.x; p.z = d.z; p.ry = d.ry;
        p.cr = !!d.cr; p.sp = !!d.sp; p.fl = !!d.fl; p.mv = !!d.mv;
        p.noise = Math.max(0, Math.min(25, +d.n || 0));
        return;
      }
      case 'pickup': {
        if (!playing || p.down) return;
        const pk = L.pickups.find((x) => x.id === d.id);
        if (!pk || this.taken.has(pk.id) || !this.near(p, pk.x, pk.z, 2.8)) return;
        const it = ITEMS[pk.item];
        if (it.kind === 'consumable' || it.kind === 'passive') {
          const c = p.inv[pk.item] || 0;
          if (c >= it.max) return this.toast(p, `You can't carry more ${it.name}s`, 'warn');
          p.inv[pk.item] = c + 1;
          this.toast(p, `${it.icon} Picked up ${it.name}`);
        } else if (pk.item === 'note') {
          this.notes.add(pk.digit);
          this.emit('notes', this.notesPayload());
          this.toastAll(`📝 ${p.name} found a note: digit ${pk.digit + 1} of the code is ${L.code[pk.digit]}`, 'good');
        } else {
          p.quest[pk.item] = (p.quest[pk.item] || 0) + 1;
          this.toast(p, `${it.icon} Picked up ${it.name}`, 'good');
        }
        this.taken.add(pk.id);
        this.emit('taken', { id: pk.id, by: p.id });
        this.sendInv(p);
        return;
      }
      case 'search': {
        if (!playing || p.down) return;
        const s = L.searchables.find((x) => x.id === d.id);
        if (!s || this.searched.has(s.id) || !this.near(p, s.ix, s.iz, 2.6)) return;
        const loot = s.loot;
        if (loot.startsWith('weapon:')) {
          const w = loot.slice(7);
          p.weapons[w] = Math.max(p.weapons[w] || 0, WEAPONS[w].uses);
          p.equipped = w;
          this.toast(p, `${WEAPONS[w].icon} You found a ${WEAPONS[w].name}! (Left-click to use)`, 'good');
          this.emit('sfx', { s: 'weapon', id: p.id });
        } else if (loot !== 'none') {
          const it = ITEMS[loot];
          if (it.kind === 'quest') { p.quest[loot] = (p.quest[loot] || 0) + 1; this.toast(p, `${it.icon} Found the ${it.name}!`, 'good'); }
          else {
            const c = p.inv[loot] || 0;
            if (c >= it.max) return this.toast(p, `There's a ${it.name} here but your pockets are full`, 'warn');
            p.inv[loot] = c + 1; this.toast(p, `${it.icon} Found ${it.name}`);
          }
        } else this.toast(p, 'Nothing useful...');
        this.searched.add(s.id);
        this.emit('searched', { id: s.id, by: p.id });
        this.sendInv(p);
        return;
      }
      case 'deposit': {
        if (!playing || p.down) return;
        const st = L.stations.find((x) => x.id === d.id); if (!st) return;
        const task = this.tasks.find((t) => t.id === st.taskId);
        if (!task || task.done || task.def.type !== 'deliver' || !this.near(p, st.ix, st.iz, 2.8)) return;
        const item = task.def.item, have = p.quest[item] || 0;
        if (!have) return this.toast(p, `You need a ${ITEMS[item].name}`, 'warn');
        const need = task.def.per - task.stations[st.id];
        if (need <= 0) return this.toast(p, 'This one is already done');
        const n = Math.min(have, need);
        p.quest[item] -= n; task.stations[st.id] += n;
        const total = Object.values(task.stations).reduce((a, b) => a + b, 0), max = task.def.per * Object.keys(task.stations).length;
        this.toastAll(`${p.name} used ${n} ${ITEMS[item].name}${n > 1 ? 's' : ''} (${total}/${max})`);
        this.sendInv(p);
        this.checkTask(task);
        return;
      }
      case 'skill': {
        if (!playing || p.down) return;
        const st = L.stations.find((x) => x.id === d.id); if (!st) return;
        const task = this.tasks.find((t) => t.id === st.taskId);
        if (!task || task.done || task.def.type !== 'skill' || !this.near(p, st.ix, st.iz, 2.8)) return;
        task.stations[st.id] = 1;
        this.checkTask(task);
        return;
      }
      case 'code': {
        if (!playing || p.down) return;
        const st = L.stations.find((x) => x.id === d.id); if (!st) return;
        const task = this.tasks.find((t) => t.id === st.taskId);
        if (!task || task.done || task.def.type !== 'code' || !this.near(p, st.ix, st.iz, 3)) return;
        if (String(d.code) === L.code) { task.stations[st.id] = 1; this.checkTask(task); }
        else {
          this.toast(p, '✖ WRONG CODE — the alarm buzzes!', 'bad');
          this.emit('sfx', { s: 'buzz' });
          for (const m of this.monsters) if (Math.hypot(m.x - st.x, m.z - st.z) < 30) this.investigate(m, st.ix, st.iz, 12);
        }
        return;
      }
      case 'call': {
        if (!playing || p.down || this.call) return;
        const st = L.stations.find((x) => x.id === d.id); if (!st || st.kind !== 'exitpanel') return;
        if (!this.near(p, st.ix, st.iz, 3)) return;
        if (!this.tasks.filter((t) => !t.def.final).every((t) => t.done)) return this.toast(p, 'No power yet — finish the other tasks first', 'warn');
        const wait = this.tasks.find((t) => t.def.final).def.wait;
        this.call = { endsAt: Date.now() + wait * 1000 };
        this.lastAlarm = 0;
        this.toastAll(L.def.exitStyle === 'garage' ? `🚨 The bay door is opening... survive ${wait}s! The noise is drawing them in!` : `🛎 Elevator called — survive ${wait}s! The noise is drawing them in!`, 'warn');
        return;
      }
      case 'use': {
        if (!playing || p.down) return;
        const it = ITEMS[d.item];
        if (!it || it.kind !== 'consumable' || !(p.inv[d.item] > 0)) return;
        if (it.heal) {
          if (p.hp >= 100) return this.toast(p, 'Already at full health');
          p.hp = Math.min(100, p.hp + it.heal);
        }
        p.inv[d.item]--;
        p.socket.emit('effect', { item: d.item });
        this.sendInv(p);
        return;
      }
      case 'equip': {
        if (p.weapons[d.w] > 0) { p.equipped = d.w; this.sendInv(p); }
        return;
      }
      case 'attack': {
        if (!playing || p.down || p.hidden) return;
        const w = p.equipped; const W = WEAPONS[w];
        if (!W || !(p.weapons[w] > 0)) return;
        const now = Date.now();
        if (now - p.lastAttack < W.cooldown * 1000 - 80) return;
        p.lastAttack = now;
        const ry = Number.isFinite(d.ry) ? d.ry : p.ry;
        const fx = -Math.sin(ry), fz = -Math.cos(ry);
        const hits = [];
        for (const m of this.monsters) {
          if (m.state === 'dormant') continue;
          const dx = m.x - p.x, dz = m.z - p.z, dist = Math.hypot(dx, dz);
          if (dist > W.range + 0.5) continue;
          if (!hasLOS(L, p.x, p.z, m.x, m.z, this.exitOpen)) continue;
          if (w === 'tranq') {
            const along = dx * fx + dz * fz, perp = Math.abs(dx * fz - dz * fx);
            if (along > 0 && perp < 0.9) hits.push({ m, d: along });
          } else if (dist < 1.0 || (dx * fx + dz * fz) / dist > Math.cos(W.arc)) hits.push({ m, d: dist });
        }
        hits.sort((a, b) => a.d - b.d);
        const affected = w === 'extinguisher' ? hits : hits.slice(0, 1);
        for (const { m } of affected) {
          m.state = 'stunned'; m.stun = W.stun; m.target = null; m.path = null; m.lockerTarget = null;
          m.stunBy = { x: p.x, z: p.z };
          this.emit('mev', { id: m.id, ev: 'stun' });
        }
        if (w !== 'crowbar' || affected.length) p.weapons[w]--;
        this.emit('afx', { id: p.id, w, hit: affected.length > 0 });
        if (p.weapons[w] <= 0) {
          delete p.weapons[w];
          p.equipped = Object.keys(p.weapons)[0] || null;
          this.toast(p, w === 'crowbar' ? 'Your crowbar snapped!' : `Your ${W.name} is empty`, 'warn');
        }
        if (affected.length) this.toast(p, affected.length > 1 ? `Stunned ${affected.length} monsters!` : `Stunned ${affected[0].m.def.name}!`, 'good');
        this.sendInv(p);
        return;
      }
      case 'hide': {
        if (!playing || p.down || p.hidden) return;
        const lk = L.lockers.find((l) => l.id === d.id);
        if (!lk || !this.near(p, lk.ix, lk.iz, 2.4)) return;
        if ([...this.players.values()].some((o) => o.hidden === lk.id)) return this.toast(p, 'Someone is already hiding in there', 'warn');
        p.hidden = lk.id;
        for (const m of this.monsters) {
          if (m.state === 'chase' && m.target === p.id && Math.hypot(m.x - p.x, m.z - p.z) < 10 && hasLOS(L, m.x, m.z, p.x, p.z, this.exitOpen)) m.lockerTarget = lk.id;
        }
        p.socket.emit('hidden', { id: lk.id });
        return;
      }
      case 'unhide': {
        if (!p.hidden) return;
        const lk = L.lockers.find((l) => l.id === p.hidden);
        p.hidden = null; if (lk) { p.x = lk.ix; p.z = lk.iz; }
        return;
      }
      case 'revive': {
        if (!playing || p.down) return;
        const t = this.players.get(d.id);
        if (!t || !t.down || !this.near(p, t.x, t.z, 2.8)) return;
        t.down = false; t.hp = 35;
        t.socket.emit('revived', {});
        this.toastAll(`✚ ${p.name} revived ${t.name}`, 'good');
        this.sendInv(t);
        return;
      }
      case 'selfrevive': {
        // the client holds E for SELF_REVIVE.hold seconds; the server checks the timing
        if (!playing || this.failAt || !this.canSelfRevive(p)) return;
        if (Date.now() - p.downAt < SELF_REVIVE.hold * 1000 - 500) return;
        p.selfRevives--; p.down = false; p.hp = SELF_REVIVE.hp;
        p.socket.emit('revived', { self: true });
        this.toastAll(`✚ ${p.name} patched themselves up`, 'good');
        this.sendInv(p);
        return;
      }
      case 'chat': {
        const text = String(d.text || '').slice(0, 140).trim();
        if (text) this.emit('chat', { name: p.name, text });
        return;
      }
      case 'start': {
        if (p.id !== this.hostId || this.phase !== 'lobby') return;
        this.startGame();
        return;
      }
    }
  }
}

// ---------------------------------------------------------------- sockets
io.on('connection', (socket) => {
  socket.on('join', (data = {}, ack) => {
    if (socket.data.game) return;
    const name = String(data.name || '').replace(/[^\w \-.]/g, '').trim().slice(0, 16) || 'Patient' + Math.floor(Math.random() * 900 + 100);
    const gender = data.gender === 'female' ? 'female' : 'male';
    const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(v) ? v : d);
    const info = { name, gender, shirt: hex(data.shirt, '#3b7dd8'), skin: hex(data.skin, '#f2c79b') };
    const code = String(data.room || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    let game;
    if (code) {
      game = rooms.get(code);
      if (!game) { game = new Game(code, false); rooms.set(code, game); }
    } else {
      game = [...rooms.values()].find((g) => g.isPublic && g.players.size < MAX_PLAYERS && g.phase !== 'victory');
      if (!game) { game = new Game(randCode(), true); rooms.set(game.code, game); }
    }
    if (game.players.size >= MAX_PLAYERS) return typeof ack === 'function' && ack({ error: 'That room is full (6 players max).' });
    game.addPlayer(socket, info);
    if (typeof ack === 'function') ack({ ok: true, code: game.code, id: socket.id });
  });

  for (const ev of ['s', 'pickup', 'search', 'deposit', 'skill', 'code', 'call', 'use', 'equip', 'attack', 'hide', 'unhide', 'revive', 'selfrevive', 'chat', 'start']) {
    socket.on(ev, (d) => {
      const game = socket.data.game; if (!game) return;
      const p = game.players.get(socket.id); if (!p) return;
      try { game.handle(p, ev, d || {}); } catch (e) { console.error('handler error', ev, e); }
    });
  }

  socket.on('disconnect', () => { const game = socket.data.game; if (game) game.removePlayer(socket.id); });
});

let last = Date.now();
setInterval(() => {
  const now = Date.now(); const dt = Math.min(0.1, (now - last) / 1000); last = now;
  for (const g of rooms.values()) { try { g.tick(dt); } catch (e) { console.error('tick error', e); } }
}, TICK_MS);
setInterval(() => { for (const g of rooms.values()) if (g.phase === 'playing' || g.phase === 'transition') io.to(g.code).volatile.emit('snap', g.snap()); }, SNAP_MS);

server.listen(PORT, () => console.log(`Ward 13 server running on http://localhost:${PORT}`));
