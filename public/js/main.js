// Ward 13 — client entry: menu, networking, first-person controls, HUD & minigames.
import * as THREE from 'three';
import { generateLevel, moveCircle, hasLOS, inRoom, FLOOR, DOOR, EXIT, BARR, WALL } from '/shared/levelgen.js';
import { PLAYER, NOISE, ITEMS, WEAPONS, MONSTERS, LEVELS, CELL } from '/shared/config.js';
import { World } from './world.js';
import { buildAvatar, buildMonster, buildFlashlightMesh, buildWeaponMesh, glowSprite, mat } from './models.js';
import { Sound } from './audio.js';

const $ = (id) => document.getElementById(id);
const sound = new Sound();
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };

// ======================================================================= renderer
const canvasEl = $('game');
const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.autoClear = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 90);
camera.rotation.order = 'YXZ';
scene.add(camera);
scene.add(new THREE.HemisphereLight(0x51697a, 0x101418, 0.55));

// flashlight
const flash = new THREE.SpotLight(0xfff1d6, 55, 32, 0.55, 0.55, 1.4);
flash.position.set(0.22, -0.2, 0.05);
camera.add(flash); camera.add(flash.target); flash.target.position.set(0.05, -0.15, -6);
// remote flashlight pool (fixed count so shaders never recompile)
const remoteSpots = [];
for (let i = 0; i < 3; i++) { const s = new THREE.SpotLight(0xfff1d6, 0, 22, 0.5, 0.6, 1.5); scene.add(s); scene.add(s.target); remoteSpots.push(s); }

// first-person view model rendered in a separate pass (never clips into walls)
const viewScene = new THREE.Scene();
viewScene.add(new THREE.AmbientLight(0x8899aa, 0.5));
const vDir = new THREE.DirectionalLight(0xffeedd, 0.6); vDir.position.set(1, 2, 1); viewScene.add(vDir);
const viewRig = new THREE.Group(); viewScene.add(viewRig);
const vmFlash = buildFlashlightMesh(); vmFlash.position.set(0.26, -0.27, -0.45); viewRig.add(vmFlash);
const vmHand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.22), new THREE.MeshStandardMaterial({ color: 0xf2c79b, roughness: 0.7 })); vmHand.position.set(0, -0.03, 0.12); vmFlash.add(vmHand);
const vmSleeve = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.3), new THREE.MeshStandardMaterial({ color: 0x3b7dd8, roughness: 0.8 })); vmSleeve.position.set(0, -0.03, 0.36); vmFlash.add(vmSleeve);
let vmWeapon = null, vmWeaponName = null;

// ======================================================================= state
const S = {
  phase: 'menu', me: null, code: null, hostId: null, roster: new Map(),
  level: null, world: null, li: 0, tasks: [], notes: [null, null, null], taken: new Set(), searched: new Set(),
  exitOpen: false, callEnd: 0, levelStart: 0, totalStart: 0,
  inv: {}, quest: {}, weapons: {}, equipped: null, hp: 100, down: false, hidden: null,
  remotes: new Map(), monsters: new Map(), explored: null, mapOpen: false, chatOpen: false,
  skill: null, keypad: null, hold: null, target: null, prevTasksDone: new Set(),
};
const P = { x: 0, z: 0, y: 0, vy: 0, vx: 0, vz: 0, kx: 0, kz: 0, yaw: 0, pitch: 0, crouch: false, sprint: false, moving: false, stamina: 100, battery: 100, flash: true, noise: 0, noiseSpike: 0, noiseSpikeT: 0, energyT: 0, pillsT: 0, bob: 0, stepAcc: 0, attackCd: 0, swingT: 0, shake: 0, eye: PLAYER.eye };
const keys = new Set();
let locked = false, sendT = 0, t = 0;

// ======================================================================= menu & character preview
const SHIRTS = ['#3b7dd8', '#d83b3b', '#3bb06a', '#e0a030', '#8a4fd8', '#e8e8e8', '#2a2a2a', '#e06aa8'];
const SKINS = ['#f2c79b', '#e0ac7e', '#c68642', '#8d5524', '#f5cd30'];
const look = { gender: store.get('w13g') || 'male', shirt: store.get('w13s') || SHIRTS[0], skin: store.get('w13k') || SKINS[0] };
$('nameIn').value = store.get('w13n') || '';

const menuScene = new THREE.Scene();
menuScene.background = new THREE.Color(0x05090b);
menuScene.fog = new THREE.Fog(0x05090b, 6, 16);
const menuCam = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 50);
menuScene.add(new THREE.HemisphereLight(0x5a7a8a, 0x101010, 0.6));
const mSpot = new THREE.SpotLight(0xdff2ff, 60, 20, 0.5, 0.6, 1.2); mSpot.position.set(1.5, 5, 3); menuScene.add(mSpot); menuScene.add(mSpot.target);
const mRed = new THREE.PointLight(0xff3030, 6, 8, 1.5); mRed.position.set(-3, 1.5, -2); menuScene.add(mRed);
const mFloor = new THREE.Mesh(new THREE.CircleGeometry(6, 40), new THREE.MeshStandardMaterial({ color: 0x1d2a2f, roughness: 0.5 })); mFloor.rotation.x = -Math.PI / 2; menuScene.add(mFloor);
let menuAvatar = null;
const menuMonsters = [];
['lop', 'grin', 'mumbles'].forEach((k, i) => { const m = buildMonster(k); m.group.position.set(-2.6 + i * 1.6, 0, -3.4); m.group.rotation.y = 0.25 - i * 0.12; m.group.scale.setScalar(0.95); menuScene.add(m.group); menuMonsters.push(m); });
function rebuildMenuAvatar() {
  if (menuAvatar) menuScene.remove(menuAvatar.group);
  menuAvatar = buildAvatar({ ...look, name: '' });
  menuAvatar.beam.visible = false;
  menuAvatar.group.position.set(0.9, 0, 0.6);
  menuScene.add(menuAvatar.group);
  vmHand.material.color.set(look.skin); vmSleeve.material.color.set(look.shirt);
}
function renderSwatches() {
  const mk = (el, list, key) => { el.innerHTML = ''; list.forEach((c) => { const b = document.createElement('div'); b.className = 'sw' + (look[key] === c ? ' sel' : ''); b.style.background = c; b.onclick = () => { look[key] = c; store.set(key === 'shirt' ? 'w13s' : 'w13k', c); renderSwatches(); rebuildMenuAvatar(); }; el.appendChild(b); }); };
  mk($('shirtSw'), SHIRTS, 'shirt'); mk($('skinSw'), SKINS, 'skin');
  document.querySelectorAll('.gbtn').forEach((b) => b.classList.toggle('sel', b.dataset.g === look.gender));
}
document.querySelectorAll('.gbtn').forEach((b) => (b.onclick = () => { look.gender = b.dataset.g; store.set('w13g', look.gender); renderSwatches(); rebuildMenuAvatar(); }));
renderSwatches(); rebuildMenuAvatar();
$('bestiary').innerHTML = Object.values(MONSTERS).map((m) => `<div class="beast"><b>${m.name}</b>${m.desc}</div>`).join('');

// ======================================================================= networking
const socket = window.io();

$('playBtn').onclick = () => {
  sound.init();
  const name = $('nameIn').value.trim(); store.set('w13n', name);
  $('playBtn').disabled = true; $('joinErr').textContent = '';
  socket.emit('join', { name, gender: look.gender, shirt: look.shirt, skin: look.skin, room: $('roomIn').value.trim() }, (res) => {
    $('playBtn').disabled = false;
    if (!res || res.error) { $('joinErr').textContent = res ? res.error : 'Could not join'; return; }
    S.me = res.id; S.code = res.code;
    $('joinPanel').classList.add('hidden'); $('lobbyPanel').classList.remove('hidden');
    $('roomCode').textContent = res.code;
    if (S.phase === 'menu') S.phase = 'lobby';
    renderLobby(S.lastLobby);
  });
};
$('roomIn').addEventListener('input', (e) => (e.target.value = e.target.value.toUpperCase()));
$('startBtn').onclick = () => { sound.init(); socket.emit('start'); };

socket.on('disconnect', () => { toast('Disconnected from server — refresh to rejoin', 'bad'); });

socket.on('lobby', (d) => { S.lastLobby = d; renderLobby(d); });
function renderLobby(d) {
  if (!d) return;
  S.hostId = d.hostId; S.code = d.code;
  for (const p of d.players) S.roster.set(p.id, p);
  for (const id of [...S.roster.keys()]) if (!d.players.find((p) => p.id === id)) { S.roster.delete(id); removeRemote(id); }
  $('lobbyList').innerHTML = d.players.map((p) => `<li><span class="dot" style="background:${p.shirt}"></span>${escapeHtml(p.name)} <span class="dim small">${p.gender === 'female' ? '♀' : '♂'}</span>${p.id === d.hostId ? '<span class="host">HOST</span>' : ''}</li>`).join('');
  const amHost = d.hostId === S.me;
  $('startBtn').classList.toggle('hidden', !amHost || d.phase !== 'lobby');
  $('waitHost').classList.toggle('hidden', amHost || d.phase !== 'lobby');
  if (d.phase === 'lobby' && (S.phase === 'game' || S.phase === 'victory')) backToLobby();
}

socket.on('level', onLevel);
socket.on('snap', onSnap);
socket.on('toast', (d) => toast(d.text, d.kind));
socket.on('chat', (d) => addChat(d.name, d.text));
socket.on('inv', (d) => { S.inv = d.inv; S.quest = d.quest; S.weapons = d.weapons; S.equipped = d.equipped; S.hp = d.hp; renderInventory(); });
socket.on('taken', (d) => { S.taken.add(d.id); S.world?.removePickup(d.id); if (d.by === S.me) sound.pickup(); });
socket.on('searched', (d) => { S.searched.add(d.id); if (d.by === S.me) sound.pickup(); });
socket.on('notes', (d) => { S.notes = d; renderObjectives(); });
socket.on('tasks', (d) => { S.tasks = d; refreshStations(); renderObjectives(); });
socket.on('exit', () => { S.exitOpen = true; S.callEnd = 0; S.world?.setExitOpen(true); sound.ding(); refreshStations(); });
socket.on('sfx', (d) => { if (d.s === 'alarm') sound.alarm(); else if (d.s === 'task') sound.task(); else if (d.s === 'buzz') sound.buzz(); });
socket.on('effect', (d) => applyEffect(d.item));
socket.on('hit', (d) => {
  P.kx = d.kx * 9; P.kz = d.kz * 9; P.shake = 0.5; sound.hurt();
  flashFx('dmgFx', 0.9);
  cancelMinigames();
});
socket.on('hidden', (d) => enterLocker(d.id));
socket.on('pulled', (d) => { exitLocker(false); P.x = d.x; P.z = d.z; toast('It dragged you out of the locker!', 'bad'); });
socket.on('revived', () => { S.down = false; toast('You were revived!', 'good'); });
socket.on('afx', (d) => {
  if (d.id === S.me) return;
  const r = S.remotes.get(d.id); if (!r) return;
  const s = sound.spatial(r.x, r.z, 30); if (!s) return;
  if (d.w === 'crowbar') sound.swing(); else if (d.w === 'extinguisher') { sound.spray(); spawnSpray(r.x, 1.3, r.z, -Math.sin(r.ry), -Math.cos(r.ry)); } else sound.dart();
  if (d.hit) sound.smack();
});
socket.on('mev', (d) => {
  const m = S.monsters.get(d.id); if (!m) return;
  const pitch = { lop: 1.1, grin: 0.8, mumbles: 1.3, matron: 0.65 }[m.kind] || 1;
  if (d.ev === 'wake') { sound.growl(m.x, m.z, pitch * 1.2); }
  else if (d.ev === 'chase') {
    sound.growl(m.x, m.z, pitch);
    if (d.target === S.me) { sound.sting(); toast(`${MONSTERS[m.kind].name} has spotted you — RUN!`, 'bad'); }
  } else if (d.ev === 'shriek') { sound.shriek(m.x, m.z); toast('A shriek echoes through the halls… the others are coming.', 'warn'); }
  else if (d.ev === 'attack') sound.growl(m.x, m.z, pitch * 1.4);
  else if (d.ev === 'stun') sound.whimper(m.x, m.z);
});
socket.on('levelComplete', (d) => {
  cancelMinigames(); if (S.hidden) exitLocker(true);
  const next = LEVELS[d.li + 1];
  showCard(d.last ? 'YOU MADE IT OUT' : 'FLOOR CLEARED', `${LEVELS[d.li].name} · ${fmtTime(d.time)}`,
    d.last ? '<p>The ambulance tears out of the bay…</p>' : `<p>The doors shut. The cables groan.</p><p>Next: <b>${next.name}</b> — ${next.subtitle}</p>`, 7800);
  sound.ding();
});
socket.on('fail', () => { cancelMinigames(); showCard('CAUGHT', 'Everyone went down', '<p>The night shift starts over on this floor…</p>', 4900, true); sound.sting(); });
socket.on('victory', (d) => {
  S.phase = 'victory';
  showCard('YOU ESCAPED', `Total time ${fmtTime(d.total)}`, '<p>Ward 13 fades in the rear window.<br/>Somewhere behind you, something is still sitting in the waiting room.</p><p class="dim">Returning to the lobby…</p>', 13500);
});

// ======================================================================= level setup
function onLevel(d) {
  sound.init();
  cancelMinigames();
  if (S.world) { S.world.dispose(); S.world = null; }
  for (const id of [...S.remotes.keys()]) removeRemote(id);
  for (const m of S.monsters.values()) scene.remove(m.model.group);
  S.monsters.clear();
  for (const r of d.roster || []) S.roster.set(r.id, r);

  S.li = d.li; S.level = generateLevel(d.li, d.seed);
  S.world = new World(scene, S.level);
  S.taken = new Set(d.taken); S.searched = new Set(d.searched);
  for (const id of S.taken) S.world.removePickup(id);
  S.tasks = d.tasks; S.notes = d.notes; S.exitOpen = d.exitOpen; S.world.setExitOpen(d.exitOpen);
  S.callEnd = d.callRemaining >= 0 ? performance.now() + d.callRemaining : 0;
  S.levelStart = performance.now() - d.elapsed; S.totalStart = performance.now() - d.totalElapsed;
  S.prevTasksDone = new Set(d.tasks.filter((x) => x.done).map((x) => x.id));
  for (const m of d.monsters) {
    const model = buildMonster(m.kind); model.group.visible = false; scene.add(model.group);
    S.monsters.set(m.id, { id: m.id, kind: m.kind, model, x: 0, z: 0, ry: 0, tx: 0, tz: 0, tr: 0, st: 0, target: '', speed: 0, stepAcc: 0, init: false });
  }
  const sp = d.spawns[S.me] || S.level.spawnPoints[0];
  P.x = sp.x; P.z = sp.z; P.y = 0; P.vy = 0; P.vx = P.vz = P.kx = P.kz = 0; P.yaw = d.yaw; P.pitch = 0; P.crouch = false; P.stamina = 100;
  S.down = false; S.hidden = null; $('lockerView').classList.add('hidden');
  S.explored = new Uint8Array(S.level.W * S.level.H);
  refreshStations(); renderObjectives(); renderInventory();
  S.phase = 'game';
  $('menu').classList.add('hidden'); $('hud').classList.remove('hidden');
  const def = S.level.def;
  const kinds = [...new Set(d.monsters.map((m) => MONSTERS[m.kind].name))].join(', ');
  showCard(def.name.toUpperCase(), `Floor ${d.li + 1} of ${LEVELS.length} · ${def.subtitle}`,
    `<ul>${def.tasks.map((x) => `<li>${x.label}</li>`).join('')}</ul><p class="dim">On this floor: ${kinds}. They're dozing in the waiting room… for now.</p><p class="dim small">Click to lock the mouse. <kbd>M</kbd> map · <kbd>F</kbd> flashlight · <kbd>C</kbd> crouch</p>`, 6500);
  if (!locked && !touch.on) $('pause').classList.remove('hidden');
}

function backToLobby() {
  S.phase = 'lobby';
  if (S.world) { S.world.dispose(); S.world = null; }
  for (const id of [...S.remotes.keys()]) removeRemote(id);
  for (const m of S.monsters.values()) scene.remove(m.model.group);
  S.monsters.clear();
  $('hud').classList.add('hidden'); $('menu').classList.remove('hidden'); $('pause').classList.add('hidden');
  $('card').classList.add('hidden'); $('downed').classList.add('hidden'); $('lockerView').classList.add('hidden');
  document.exitPointerLock?.();
}

// ======================================================================= snapshots
function onSnap(d) {
  if (S.phase !== 'game') return;
  const seen = new Set();
  for (const [id, x, z, ry, fl, hp, eq] of d.p) {
    if (id === S.me) {
      S.hp = hp;
      const down = !!(fl & 4);
      if (down && !S.down) { S.down = true; cancelMinigames(); if (S.hidden) exitLocker(true); }
      else if (!down && S.down) S.down = false;
      if (!(fl & 8) && S.hidden && performance.now() - (S.hiddenAt || 0) > 800) exitLocker(true);
      continue;
    }
    seen.add(id);
    let r = S.remotes.get(id);
    if (!r) {
      const info = S.roster.get(id) || { name: '?', gender: 'male', shirt: '#888', skin: '#f2c79b' };
      const av = buildAvatar(info); scene.add(av.group);
      r = { id, av, x, z, ry, tx: x, tz: z, tr: ry, fl: 0, hp, speed: 0 };
      S.remotes.set(id, r);
    }
    r.tx = x; r.tz = z; r.tr = ry; r.fl = fl; r.hp = hp; r.eq = eq;
  }
  for (const id of [...S.remotes.keys()]) if (!seen.has(id)) removeRemote(id);
  for (const [id, x, z, ry, st, target] of d.m) {
    const m = S.monsters.get(id); if (!m) continue;
    if (!m.init) { m.x = x; m.z = z; m.ry = ry; m.init = true; m.model.group.visible = true; }
    m.tx = x; m.tz = z; m.tr = ry; m.st = st; m.target = target;
  }
  if (d.c >= 0) S.callEnd = performance.now() + d.c; else if (!S.exitOpen) S.callEnd = 0;
}
function removeRemote(id) { const r = S.remotes.get(id); if (r) { scene.remove(r.av.group); S.remotes.delete(id); } }

// ======================================================================= input
canvasEl.addEventListener('click', () => { if (S.phase === 'game' && !S.keypad) requestLock(); });
$('pause').addEventListener('click', () => requestLock());
function requestLock() {
  sound.init();
  if (touch.on) { $('pause').classList.add('hidden'); return; }
  const p = canvasEl.requestPointerLock?.(); if (p && p.catch) p.catch(() => {});
}
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvasEl;
  $('pause').classList.toggle('hidden', locked || touch.on || S.phase !== 'game' || !!S.keypad || S.chatOpen);
  if (!locked) keys.clear();
});
function applyLook(dx, dy, sens) {
  P.yaw -= dx * sens; P.pitch -= dy * sens;
  P.pitch = Math.max(-1.45, Math.min(1.45, P.pitch));
  if (S.hidden) { const base = S.hiddenYaw; let d = P.yaw - base; d = Math.max(-0.7, Math.min(0.7, d)); P.yaw = base + d; P.pitch = Math.max(-0.4, Math.min(0.4, P.pitch)); }
}
document.addEventListener('mousemove', (e) => { if (locked) applyLook(e.movementX, e.movementY, 0.0022); });
document.addEventListener('mousedown', (e) => { if (locked && e.button === 0 && S.phase === 'game') attack(); });

// ---------------------------------------------------------------- touch controls
// Left side of the screen = floating joystick, right side = drag to look,
// on-screen buttons replay the same key codes the keyboard uses.
const touch = { on: false, stickId: null, lookId: null, ox: 0, oy: 0, lx: 0, ly: 0, mx: 0, my: 0, mag: 0, sprint: false };
function enableTouch() {
  if (touch.on) return;
  touch.on = true; document.body.classList.add('touch'); $('pause').classList.add('hidden');
}
if (window.matchMedia?.('(pointer: coarse)').matches) enableTouch();
window.addEventListener('touchstart', enableTouch, { passive: true, once: true });
{
  const layer = $('touchLayer'), stick = $('stick'), knob = $('knob'), R = 60;
  const resetStick = () => { touch.stickId = null; touch.mx = touch.my = touch.mag = 0; stick.classList.remove('on'); knob.style.transform = ''; };
  layer.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    e.preventDefault(); sound.init();
    try { layer.setPointerCapture(e.pointerId); } catch {}
    if (e.clientX < innerWidth * 0.45 && touch.stickId === null) {
      touch.stickId = e.pointerId; touch.ox = e.clientX; touch.oy = e.clientY;
      stick.style.left = e.clientX + 'px'; stick.style.top = e.clientY + 'px'; stick.classList.add('on');
    } else if (touch.lookId === null) { touch.lookId = e.pointerId; touch.lx = e.clientX; touch.ly = e.clientY; }
  });
  layer.addEventListener('pointermove', (e) => {
    if (e.pointerId === touch.stickId) {
      let dx = e.clientX - touch.ox, dy = e.clientY - touch.oy; const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      touch.mx = dx / R; touch.my = dy / R; touch.mag = Math.min(1, d / R);
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    } else if (e.pointerId === touch.lookId) {
      applyLook(e.clientX - touch.lx, e.clientY - touch.ly, 0.0055);
      touch.lx = e.clientX; touch.ly = e.clientY;
    }
  });
  const end = (e) => {
    if (e.pointerId === touch.stickId) { resetStick(); touch.sprint = false; $('tSprint').classList.remove('active'); }
    if (e.pointerId === touch.lookId) touch.lookId = null;
  };
  layer.addEventListener('pointerup', end); layer.addEventListener('pointercancel', end);

  const fire = (type, code) => document.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
  document.querySelectorAll('#touchUI [data-key]').forEach((b) => {
    const code = b.dataset.key; let down = false;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); sound.init(); down = true; b.classList.add('active'); fire('keydown', code); });
    const up = () => { if (!down) return; down = false; b.classList.remove('active'); fire('keyup', code); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
  });
  const tap = (id, fn) => $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); sound.init(); fn(); });
  tap('tAttack', () => attack());
  tap('tCrouch', () => { P.crouch = !P.crouch; });
  tap('tSprint', () => { touch.sprint = !touch.sprint; });
  tap('tFull', () => { const d = document; if (d.fullscreenElement) d.exitFullscreen?.(); else d.documentElement.requestFullscreen?.().catch(() => {}); });
  $('inventory').addEventListener('pointerdown', (e) => {
    const slot = e.target.closest('[data-item]'); if (!slot) return;
    e.preventDefault();
    const item = slot.dataset.item; if ((S.inv[item] || 0) > 0 && !S.down) socket.emit('use', { item });
  });
}

document.addEventListener('keydown', (e) => {
  if (S.chatOpen) {
    if (e.code === 'Enter') { const v = $('chatIn').value.trim(); if (v) socket.emit('chat', { text: v }); closeChat(); e.preventDefault(); }
    else if (e.code === 'Escape') closeChat();
    return;
  }
  if (S.keypad) { keypadKey(e); return; }
  if (S.phase !== 'game') return;
  if (e.code === 'Tab') e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if (S.skill) {
    if (e.code === 'KeyE' || e.code === 'Space') skillPress();
    else if (e.code === 'Escape' || e.code === 'KeyQ') closeSkill(false, true);
    return;
  }
  switch (e.code) {
    case 'KeyE': onInteractDown(); break;
    case 'KeyF': if (!S.down) { P.flash = !P.flash; sound.click(); } break;
    case 'KeyC': P.crouch = !P.crouch; break;
    case 'KeyM': S.mapOpen = !S.mapOpen; $('mapOverlay').classList.toggle('hidden', !S.mapOpen); break;
    case 'KeyT': case 'Enter': openChat(); e.preventDefault(); break;
    case 'KeyQ': cycleWeapon(); break;
    case 'Space': if (P.y <= 0 && !S.down && !S.hidden) { P.vy = 4.3; } e.preventDefault(); break;
    case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': case 'Digit5': {
      const item = Object.keys(ITEMS).find((k) => ITEMS[k].key === e.code.slice(5));
      if (item && (S.inv[item] || 0) > 0 && !S.down) socket.emit('use', { item });
      break;
    }
  }
});
document.addEventListener('keyup', (e) => { keys.delete(e.code); if (e.code === 'KeyE') cancelHold(); });

function openChat() { S.chatOpen = true; $('chat').classList.add('open'); setTimeout(() => $('chatIn').focus(), 0); keys.clear(); }
function closeChat() { S.chatOpen = false; $('chatIn').value = ''; $('chatIn').blur(); $('chat').classList.remove('open'); if (S.phase === 'game' && !locked) requestLock(); }

function cycleWeapon() {
  const list = Object.keys(S.weapons); if (list.length < 2) return;
  const i = list.indexOf(S.equipped); socket.emit('equip', { w: list[(i + 1) % list.length] });
}

function attack() {
  if (S.down || S.hidden || S.skill || !S.equipped || P.attackCd > 0) return;
  const W = WEAPONS[S.equipped]; P.attackCd = W.cooldown; P.swingT = 0.35;
  socket.emit('attack', { ry: P.yaw });
  if (S.equipped === 'crowbar') sound.swing();
  else if (S.equipped === 'extinguisher') { sound.spray(); spawnSpray(P.x, P.eye - 0.3, P.z, -Math.sin(P.yaw), -Math.cos(P.yaw)); P.noiseSpike = NOISE.walk; P.noiseSpikeT = 1; }
  else { sound.dart(); }
}

function applyEffect(item) {
  if (item === 'battery') { P.battery = Math.min(100, P.battery + ITEMS.battery.battery); toast('🔋 Flashlight recharged'); }
  else if (item === 'energy') { P.energyT = ITEMS.energy.duration; P.stamina = 100; toast('🥤 Energy! Unlimited sprint for 20s', 'good'); }
  else if (item === 'pills') { P.pillsT = ITEMS.pills.duration; toast('💊 Hush Pills: your footsteps are silent for 30s', 'good'); }
  else { flashFx('healFx', 0.8); toast(`${ITEMS[item].icon} Patched up`, 'good'); }
}

// ======================================================================= interaction
function forward() { return { x: -Math.sin(P.yaw), z: -Math.cos(P.yaw) }; }
function taskOf(st) { return S.tasks.find((x) => x.id === st.taskId); }
function taskDef(id) { return S.level.def.tasks.find((x) => x.id === id); }
function othersDone() { return S.tasks.filter((x) => !taskDef(x.id).final).every((x) => x.done); }

function findTarget() {
  const L = S.level; if (!L) return null;
  if (S.hidden) return { type: 'unhide', label: 'Get out of the locker' };
  if (S.down || S.skill) return null;
  const f = forward();
  let best = null, bestScore = 1e9;
  const consider = (o, ax, az, ix, iz, range = 1.9) => {
    const dx = ax - P.x, dz = az - P.z, d = Math.hypot(dx, dz);
    const di = ix !== undefined ? Math.hypot(ix - P.x, iz - P.z) : d;
    if (d > 2.4 && di > range) return;
    const dot = d > 0.01 ? (dx * f.x + dz * f.z) / d : 1;
    if (dot < 0.45 && d > 0.8) return;
    const score = d * (2.2 - dot);
    if (score < bestScore) { bestScore = score; best = o; }
  };
  for (const pk of L.pickups) if (!S.taken.has(pk.id)) consider({ type: 'pickup', id: pk.id, label: `Pick up ${ITEMS[pk.item].name}` }, pk.x, pk.z);
  for (const s of L.searchables) if (!S.searched.has(s.id)) consider({ type: 'search', id: s.id, label: `Search ${searchName(s.kind)}`, hold: 1.4 }, s.x, s.z, s.ix, s.iz);
  for (const lk of L.lockers) consider({ type: 'hide', id: lk.id, label: 'Hide in locker' }, lk.x, lk.z, lk.ix, lk.iz);
  for (const st of L.stations) {
    const tk = taskOf(st); if (!tk) continue; const def = taskDef(tk.id);
    const sv = tk.stations[st.id] || 0;
    let o = null;
    if (def.type === 'deliver') {
      if (sv >= def.per) o = { type: 'info', label: `${def.short}: done ✔` };
      else { const have = S.quest[def.item] || 0; o = have ? { type: 'deposit', id: st.id, label: `Use ${ITEMS[def.item].name} (${have})`, hold: def.hold } : { type: 'info', label: `${def.short}: needs ${ITEMS[def.item].name} (${sv}/${def.per})` }; }
    } else if (def.type === 'skill') o = sv ? { type: 'info', label: `${def.short}: done ✔` } : { type: 'skill', id: st.id, label: st.kind === 'breaker' ? 'Reset breaker' : 'Reboot terminal', checks: def.checks };
    else if (def.type === 'code') o = sv ? { type: 'info', label: 'Keypad unlocked ✔' } : { type: 'code', id: st.id, label: 'Use keypad' };
    else if (def.type === 'call') {
      if (S.exitOpen) o = { type: 'info', label: 'GET INSIDE!' };
      else if (S.callEnd) o = { type: 'info', label: `Arriving in ${Math.ceil((S.callEnd - performance.now()) / 1000)}s…` };
      else if (!othersDone()) o = { type: 'info', label: '🔒 No power — finish the other tasks first' };
      else o = { type: 'call', id: st.id, label: L.def.exitStyle === 'garage' ? 'Open the bay door' : 'Call the elevator', hold: 1.0 };
    }
    if (o) consider(o, st.x, st.z, st.ix, st.iz, 2.1);
  }
  for (const r of S.remotes.values()) if (r.fl & 4) consider({ type: 'revive', id: r.id, label: `Revive ${S.roster.get(r.id)?.name || 'teammate'}`, hold: 4 }, r.x, r.z, r.x, r.z, 2.0);
  return best;
}
function searchName(k) { return { desk: 'desk drawers', filecabinet: 'file cabinet', medcabinet: 'medicine cabinet', crate: 'crate', cart: 'supply cart', morguewall: 'morgue drawers', toolbox: 'toolbox' }[k] || k; }

function onInteractDown() {
  const tg = S.target; if (!tg) return;
  if (tg.type === 'unhide') { exitLocker(true); return; }
  if (tg.hold) { S.hold = { key: tg.type + tg.id, tg, time: 0, total: tg.hold }; if (tg.type === 'search') sound.rummage(); return; }
  switch (tg.type) {
    case 'pickup': socket.emit('pickup', { id: tg.id }); break;
    case 'hide': socket.emit('hide', { id: tg.id }); break;
    case 'skill': openSkill(tg.id, tg.checks); break;
    case 'code': openKeypad(tg.id); break;
  }
}
function cancelHold() { S.hold = null; $('holdRing').style.display = 'none'; }
function completeHold(tg) {
  switch (tg.type) {
    case 'search': socket.emit('search', { id: tg.id }); break;
    case 'deposit': socket.emit('deposit', { id: tg.id }); break;
    case 'call': socket.emit('call', { id: tg.id }); break;
    case 'revive': socket.emit('revive', { id: tg.id }); break;
  }
}

// lockers
function enterLocker(id) {
  const lk = S.level.lockers.find((l) => l.id === id); if (!lk) return;
  S.hidden = id; S.hiddenAt = performance.now();
  const fx = Math.sin(lk.ry), fz = Math.cos(lk.ry);
  P.x = lk.x + fx * 0.05; P.z = lk.z + fz * 0.05;
  S.hiddenYaw = Math.atan2(-fx, -fz) + Math.PI; P.yaw = S.hiddenYaw; P.pitch = 0;
  // camera faces out of the locker: forward (-sin yaw,-cos yaw) must equal (fx,fz)
  S.hiddenYaw = Math.atan2(-fx, -fz); P.yaw = S.hiddenYaw;
  P.crouch = false; sound.locker();
  $('lockerView').classList.remove('hidden');
  cancelHold();
}
function exitLocker(send) {
  const lk = S.level?.lockers.find((l) => l.id === S.hidden);
  if (send) socket.emit('unhide');
  if (lk) { P.x = lk.ix; P.z = lk.iz; }
  S.hidden = null; sound.locker();
  $('lockerView').classList.add('hidden');
}

// skill check minigame
function openSkill(id, checks) {
  S.skill = { id, need: checks, got: 0, angle: 0, speed: 3.4 + S.li * 0.5, zone: 0, size: 0.75 - S.li * 0.08 };
  newZone(); $('skillCheck').classList.remove('hidden');
}
function newZone() { const s = S.skill; s.zone = s.angle + 1.6 + Math.random() * 3.0; s.size = Math.max(0.42, s.size - 0.05); }
function skillPress() {
  const s = S.skill; if (!s) return;
  const a = ((s.angle - s.zone) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  if (a < s.size) {
    s.got++; sound.skillOk();
    if (s.got >= s.need) { socket.emit('skill', { id: s.id }); closeSkill(true); }
    else { s.speed *= 1.15; newZone(); }
  } else closeSkill(false);
}
function closeSkill(ok, quiet) {
  if (!S.skill) return;
  if (!ok && !quiet) { sound.skillFail(); P.noiseSpike = NOISE.fail; P.noiseSpikeT = 1.4; toast('CLANG! You fumbled it — that was loud.', 'bad'); }
  S.skill = null; $('skillCheck').classList.add('hidden');
}
function drawSkill(dt) {
  const s = S.skill; if (!s) return;
  s.angle += s.speed * dt;
  const c = $('skillCanvas'), x = c.getContext('2d'); const cx = 130, cy = 130, R = 100;
  x.clearRect(0, 0, 260, 260);
  x.lineWidth = 14; x.strokeStyle = 'rgba(255,255,255,0.15)'; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.stroke();
  x.strokeStyle = '#3fe07a'; x.beginPath(); x.arc(cx, cy, R, s.zone - Math.PI / 2, s.zone + s.size - Math.PI / 2); x.stroke();
  x.strokeStyle = '#fff'; x.lineWidth = 4; x.beginPath(); x.moveTo(cx, cy);
  x.lineTo(cx + Math.cos(s.angle - Math.PI / 2) * (R + 12), cy + Math.sin(s.angle - Math.PI / 2) * (R + 12)); x.stroke();
  x.fillStyle = '#fff'; x.font = 'bold 26px Rubik'; x.textAlign = 'center'; x.fillText(`${s.got}/${s.need}`, cx, cy + 9);
}

// keypad
function openKeypad(id) {
  S.keypad = { id, entry: '' }; document.exitPointerLock?.();
  $('keypad').classList.remove('hidden'); renderKeypad();
}
function renderKeypad() {
  const k = S.keypad; if (!k) return;
  $('kpDisplay').textContent = (k.entry + '___').slice(0, 3).split('').join(' ');
  $('kpNotes').textContent = 'Notes found: ' + S.notes.map((n) => (n === null ? '?' : n)).join(' ');
}
function keypadKey(e) {
  if (e.code === 'Escape') { closeKeypad(); return; }
  if (/^Digit\d$|^Numpad\d$/.test(e.code)) kpPress(e.code.slice(-1));
  else if (e.code === 'Backspace') { S.keypad.entry = S.keypad.entry.slice(0, -1); renderKeypad(); }
  else if (e.code === 'Enter' || e.code === 'NumpadEnter') kpPress('OK');
}
function kpPress(v) {
  const k = S.keypad; if (!k) return; sound.click();
  if (v === 'C') k.entry = '';
  else if (v === 'OK') {
    if (k.entry.length === 3) {
      socket.emit('code', { id: k.id, code: k.entry });
      const sent = k.entry; k.entry = '';
      setTimeout(() => { const tk = S.tasks.find((x) => x.id === 'code'); if (tk?.done) { closeKeypad(); } else if (S.keypad) { $('kpDisplay').classList.add('bad'); setTimeout(() => $('kpDisplay').classList.remove('bad'), 600); } }, 350);
      void sent;
    }
  } else if (k.entry.length < 3) k.entry += v;
  renderKeypad();
}
function closeKeypad() { S.keypad = null; $('keypad').classList.add('hidden'); requestLock(); }
{
  const grid = document.querySelector('.kpGrid');
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'OK'].forEach((v) => {
    const b = document.createElement('button'); b.textContent = v; if (v === 'OK') b.className = 'ok'; if (v === 'C') b.className = 'clr';
    b.onclick = () => kpPress(v); grid.appendChild(b);
  });
  $('kpClose').onclick = () => closeKeypad();
}
function cancelMinigames() { if (S.skill) closeSkill(false, true); if (S.keypad) { S.keypad = null; $('keypad').classList.add('hidden'); } cancelHold(); }

// ======================================================================= spray particles
const particles = [];
const puffTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
function spawnSpray(x, y, z, fx, fz) {
  for (let i = 0; i < 26; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, opacity: 0.8, depthWrite: false }));
    s.position.set(x + fx * 0.6, y, z + fz * 0.6); s.scale.setScalar(0.3);
    const sp = 5 + Math.random() * 4;
    s.userData = { vx: fx * sp + (Math.random() - 0.5) * 2.5, vy: (Math.random() - 0.4) * 1.5, vz: fz * sp + (Math.random() - 0.5) * 2.5, life: 0.9 + Math.random() * 0.5, delay: i * 0.02 };
    scene.add(s); particles.push(s);
  }
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const s = particles[i], u = s.userData;
    if (u.delay > 0) { u.delay -= dt; s.visible = false; continue; }
    s.visible = true; u.life -= dt;
    s.position.x += u.vx * dt; s.position.y += u.vy * dt; s.position.z += u.vz * dt;
    u.vx *= 0.92; u.vz *= 0.92; s.scale.multiplyScalar(1 + dt * 2.2); s.material.opacity = Math.max(0, u.life * 0.7);
    if (u.life <= 0) { scene.remove(s); s.material.dispose(); particles.splice(i, 1); }
  }
}

// ======================================================================= update: local player
function updatePlayer(dt) {
  const L = S.level;
  const busy = S.chatOpen || S.skill || S.keypad || S.down || S.hidden || S.mapOpen && false;
  const f = forward(), rt = { x: Math.cos(P.yaw), z: -Math.sin(P.yaw) };
  let ix = 0, iz = 0;
  if (!busy && locked) {
    if (keys.has('KeyW') || keys.has('ArrowUp')) { ix += f.x; iz += f.z; }
    if (keys.has('KeyS') || keys.has('ArrowDown')) { ix -= f.x; iz -= f.z; }
    if (keys.has('KeyD') || keys.has('ArrowRight')) { ix += rt.x; iz += rt.z; }
    if (keys.has('KeyA') || keys.has('ArrowLeft')) { ix -= rt.x; iz -= rt.z; }
  }
  if (!busy && touch.on && touch.mag > 0.18) { ix += f.x * -touch.my + rt.x * touch.mx; iz += f.z * -touch.my + rt.z * touch.mx; }
  const il = Math.hypot(ix, iz); if (il > 0) { ix /= il; iz /= il; }
  const wantSprint = keys.has('ShiftLeft') || keys.has('ShiftRight') || touch.sprint;
  P.moving = il > 0;
  if (S.hold) { ix = iz = 0; P.moving = false; }
  P.sprint = wantSprint && P.moving && !P.crouch && (P.stamina > 1 || P.energyT > 0);
  let speed = P.crouch ? PLAYER.crouch : P.sprint ? PLAYER.sprint * (P.energyT > 0 ? 1.12 : 1) : PLAYER.walk;
  if (S.hp < 30) speed *= 0.88;
  if (P.sprint && P.energyT <= 0) P.stamina = Math.max(0, P.stamina - PLAYER.staminaDrain * dt);
  else if (!P.sprint) P.stamina = Math.min(100, P.stamina + PLAYER.staminaRegen * dt * (P.moving ? 0.6 : 1));
  P.energyT = Math.max(0, P.energyT - dt); P.pillsT = Math.max(0, P.pillsT - dt);
  const acc = Math.min(1, dt * 12);
  P.vx += (ix * speed - P.vx) * acc; P.vz += (iz * speed - P.vz) * acc;
  P.kx *= Math.max(0, 1 - dt * 6); P.kz *= Math.max(0, 1 - dt * 6);
  if (!S.hidden && !S.down) moveCircle(L, P, (P.vx + P.kx) * dt, (P.vz + P.kz) * dt, PLAYER.radius, S.exitOpen, true);
  // jump
  const wasAir = P.y > 0;
  P.vy -= 13 * dt; P.y = Math.max(0, P.y + P.vy * dt);
  if (P.y === 0) { if (wasAir && P.vy < -3) { sound.step(0.25); P.noiseSpike = NOISE.jump; P.noiseSpikeT = 0.6; } P.vy = 0; }
  const hspeed = Math.hypot(P.vx, P.vz);
  // footsteps + noise
  P.stepAcc += hspeed * dt;
  const stride = P.sprint ? 2.3 : P.crouch ? 1.3 : 1.75;
  if (P.stepAcc > stride && P.y === 0) { P.stepAcc = 0; if (P.pillsT <= 0 || !P.crouch) sound.step(P.sprint ? 0.2 : 0.11 * (P.pillsT > 0 ? 0.3 : 1), P.crouch); }
  let n = 0;
  if (hspeed > 0.4) n = P.crouch ? NOISE.crouch : P.sprint ? NOISE.sprint : NOISE.walk;
  if (P.pillsT > 0) n *= 0.2;
  if (S.hold) n = Math.max(n, S.hold.tg.type === 'search' ? NOISE.search : NOISE.task);
  P.noiseSpikeT -= dt; if (P.noiseSpikeT > 0) n = Math.max(n, P.noiseSpike);
  if (S.hidden || S.down) n = 0;
  P.noise = n;
  // eye height & camera
  const eyeT = S.down ? 0.35 : S.hidden ? 1.55 : P.crouch ? PLAYER.crouchEye : PLAYER.eye;
  P.eye += (eyeT - P.eye) * Math.min(1, dt * 10);
  P.bob += hspeed * dt * (P.sprint ? 1.7 : 2.1);
  const bobY = Math.sin(P.bob * 2) * 0.045 * Math.min(1, hspeed / 3);
  P.shake = Math.max(0, P.shake - dt);
  const sh = P.shake * 0.08;
  camera.position.set(P.x + (Math.random() - 0.5) * sh, P.eye + P.y + bobY, P.z + (Math.random() - 0.5) * sh);
  camera.rotation.set(P.pitch + (Math.random() - 0.5) * sh, P.yaw, S.down ? 0.35 : Math.sin(P.bob) * 0.006 * hspeed);
  // flashlight & battery
  if (P.flash && !S.down) P.battery = Math.max(0, P.battery - PLAYER.batteryDrain * dt);
  const on = P.flash && P.battery > 0 && !S.down && !S.hidden;
  let fi = on ? 55 : 0;
  if (on && P.battery < 15 && Math.random() < 0.08) fi *= 0.2;
  if (on && P.battery < 6) fi *= 0.5;
  flash.intensity = fi;
  vmFlash.userData.lens.color.setHex(on ? 0xfff6d8 : 0x333333);
  // timers
  P.attackCd = Math.max(0, P.attackCd - dt);
  // hold interactions
  S.target = findTarget();
  if (S.hold) {
    if (!S.target || S.target.type + S.target.id !== S.hold.key || !keys.has('KeyE')) cancelHold();
    else {
      S.hold.time += dt;
      const fr = Math.min(1, S.hold.time / S.hold.total);
      $('holdRing').style.display = 'block'; $('holdArc').style.strokeDashoffset = String(157 * (1 - fr));
      if (fr >= 1) { const tg = S.hold.tg; cancelHold(); completeHold(tg); }
    }
  }
  // exploration for the map
  const cx = Math.floor(P.x / CELL), cz = Math.floor(P.z / CELL);
  for (let y = cz - 3; y <= cz + 3; y++) for (let x = cx - 3; x <= cx + 3; x++) if (x >= 0 && y >= 0 && x < L.W && y < L.H) S.explored[y * L.W + x] = 1;
  // network
  sendT -= dt;
  if (sendT <= 0) {
    sendT = 1 / 15;
    socket.emit('s', { x: +P.x.toFixed(2), z: +P.z.toFixed(2), ry: +P.yaw.toFixed(3), cr: P.crouch, sp: P.sprint, fl: on, mv: P.moving, n: +P.noise.toFixed(1) });
  }
  sound.setListener(P.x, P.z, P.yaw);
}

// ======================================================================= update: view model
function updateViewModel(dt) {
  viewRig.position.copy(camera.position); viewRig.quaternion.copy(camera.quaternion);
  const hs = Math.hypot(P.vx, P.vz);
  const bx = Math.cos(P.bob) * 0.012 * Math.min(1, hs / 3), by = Math.abs(Math.sin(P.bob)) * 0.016 * Math.min(1, hs / 3);
  const hideVm = S.hidden || S.down;
  vmFlash.visible = !hideVm;
  if (vmWeaponName !== S.equipped) {
    if (vmWeapon) viewRig.remove(vmWeapon);
    vmWeapon = S.equipped ? buildWeaponMesh(S.equipped) : null; vmWeaponName = S.equipped;
    if (vmWeapon) viewRig.add(vmWeapon);
  }
  if (vmWeapon) {
    vmFlash.position.set(-0.27 + bx, -0.28 - by, -0.45);
    vmWeapon.visible = !hideVm;
    P.swingT = Math.max(0, P.swingT - dt);
    const sw = P.swingT > 0 ? Math.sin((1 - P.swingT / 0.35) * Math.PI) : 0;
    vmWeapon.position.set(0.3 - bx - sw * 0.25, -0.3 - by + sw * 0.1, -0.45 - sw * 0.15);
    vmWeapon.rotation.set(-0.2 - sw * (S.equipped === 'crowbar' ? 1.4 : 0.2), 0.1 + sw * 0.6, sw * 0.3);
  } else vmFlash.position.set(0.26 + bx, -0.27 - by, -0.45);
}

// ======================================================================= update: remote players & monsters
const tmpV = new THREE.Vector3();
function lerpAngle(a, b, k) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * k; }
function updateRemotes(dt) {
  const k = 1 - Math.exp(-dt * 12);
  const lit = [];
  for (const r of S.remotes.values()) {
    const ox = r.x, oz = r.z;
    r.x += (r.tx - r.x) * k; r.z += (r.tz - r.z) * k; r.ry = lerpAngle(r.ry, r.tr, k);
    r.speed = THREE.MathUtils.lerp(r.speed, Math.hypot(r.x - ox, r.z - oz) / Math.max(dt, 1e-4), 0.2);
    const hidden = !!(r.fl & 8), down = !!(r.fl & 4), fl = !!(r.fl & 2);
    r.av.group.visible = !hidden;
    r.av.group.position.set(r.x, 0, r.z); r.av.group.rotation.y = r.ry + Math.PI;
    r.av.animate(dt, { speed: r.speed, crouch: !!(r.fl & 1), down, flash: fl });
    if (fl && !hidden && !down) lit.push(r);
  }
  lit.sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z));
  remoteSpots.forEach((s, i) => {
    const r = lit[i];
    if (!r) { s.intensity = 0; return; }
    s.intensity = 35; s.position.set(r.x, 1.5, r.z);
    s.target.position.set(r.x - Math.sin(r.ry) * 6, 1.0, r.z - Math.cos(r.ry) * 6);
  });
}

function updateMonsters(dt) {
  const k = 1 - Math.exp(-dt * 10);
  let danger = 0, seenMe = false, sus = false;
  for (const m of S.monsters.values()) {
    if (!m.init) continue;
    const ox = m.x, oz = m.z;
    m.x += (m.tx - m.x) * k; m.z += (m.tz - m.z) * k; m.ry = lerpAngle(m.ry, m.tr, k);
    const sp = Math.hypot(m.x - ox, m.z - oz) / Math.max(dt, 1e-4);
    m.speed = THREE.MathUtils.lerp(m.speed, sp, 0.25);
    m.model.group.position.set(m.x, 0, m.z); m.model.group.rotation.y = m.ry;
    m.model.update(dt, t, m.st, m.speed);
    m.stepAcc += m.speed * dt;
    if (m.stepAcc > (m.kind === 'matron' ? 1.6 : 1.1)) { m.stepAcc = 0; sound.monsterStep(m.x, m.z, m.kind === 'matron' ? 1.4 : m.st === 3 ? 1.2 : 0.8); }
    const d = Math.hypot(m.x - P.x, m.z - P.z);
    if (m.st === 3 && m.target === S.me) { seenMe = true; danger = 1; }
    else if (m.st !== 0 && m.st !== 5 && d < 14) { danger = Math.max(danger, (14 - d) / 14 * 0.55); if (m.st === 2) sus = true; }
  }
  sound.setDanger(S.down ? 0 : danger);
  $('dangerFx').style.opacity = seenMe ? String(0.55 + Math.sin(t * 8) * 0.25) : String(danger * 0.25);
  const eye = $('eyeIcon');
  eye.className = seenMe ? 'seen' : sus ? 'sus' : P.flash && P.battery > 0 ? 'lit' : '';
  $('stealthTxt').textContent = S.hidden ? 'HIDDEN' : seenMe ? 'SPOTTED' : sus ? 'SUSPICIOUS' : '';
  $('stealthTxt').style.color = seenMe ? 'var(--bad)' : sus ? 'var(--warn)' : 'var(--good)';
}

// ======================================================================= HUD
function fmtTime(ms) { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function toast(text, kind = 'info') {
  const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = text;
  const box = $('toasts'); box.appendChild(el);
  while (box.children.length > 5) box.firstChild.remove();
  setTimeout(() => el.remove(), 4200);
}
function addChat(name, text) {
  const el = document.createElement('div'); const b = document.createElement('b'); b.textContent = name + ': '; el.appendChild(b); el.appendChild(document.createTextNode(text));
  const log = $('chatLog'); log.appendChild(el); while (log.children.length > 7) log.firstChild.remove();
  setTimeout(() => el.remove(), 20000);
}
let cardTimer = null;
function showCard(title, sub, body, ms, bad = false) {
  $('cardTitle').textContent = title; $('cardTitle').classList.toggle('bad', bad);
  $('cardSub').textContent = sub; $('cardBody').innerHTML = body;
  $('card').classList.remove('hidden');
  clearTimeout(cardTimer); cardTimer = setTimeout(() => $('card').classList.add('hidden'), ms);
}
$('card').addEventListener('click', () => { if (S.phase === 'game') { $('card').classList.add('hidden'); requestLock(); } });
function flashFx(id, v) { const el = $(id); el.style.transition = 'none'; el.style.opacity = v; requestAnimationFrame(() => { el.style.transition = 'opacity 0.9s'; el.style.opacity = 0; }); }

function refreshStations() {
  if (!S.world || !S.level) return;
  for (const st of S.level.stations) {
    const tk = taskOf(st); if (!tk) continue; const def = taskDef(tk.id); const v = tk.stations[st.id] || 0;
    const done = def.type === 'deliver' ? v >= def.per : def.type === 'call' ? S.exitOpen : v >= 1;
    S.world.setStation(st.id, def.type === 'deliver' ? v / def.per : done ? 1 : 0, done, { active: def.type === 'call' && !!S.callEnd });
  }
  for (const tk of S.tasks) if (tk.done && !S.prevTasksDone.has(tk.id)) { S.prevTasksDone.add(tk.id); }
}

function renderObjectives() {
  if (!S.level) return;
  const def = S.level.def;
  $('lvlName').innerHTML = `${escapeHtml(def.name)}<small>FLOOR ${S.li + 1}/${LEVELS.length}</small>`;
  const rows = def.tasks.map((td) => {
    const tk = S.tasks.find((x) => x.id === td.id) || { stations: {}, done: false };
    const vals = Object.values(tk.stations);
    let sub = '', cls = tk.done ? 'done' : '';
    if (td.type === 'deliver') {
      const tot = vals.reduce((a, b) => a + b, 0), max = td.per * Math.max(1, vals.length);
      sub = `${tot}/${max}` + ((S.quest[td.item] || 0) ? ` · you carry ${S.quest[td.item]} ${ITEMS[td.item].icon}` : '');
    } else if (td.type === 'skill') sub = `${vals.filter((v) => v).length}/${vals.length}`;
    else if (td.type === 'code') sub = 'Code: ' + S.notes.map((n) => (n === null ? '_' : n)).join(' ');
    else if (td.type === 'call') {
      if (!othersDone() && !tk.done) { cls = 'locked'; sub = 'Locked until the other tasks are done'; }
      else if (S.exitOpen) { const ins = countInExit(); sub = `GET IN! ${ins.inside}/${ins.alive} inside`; }
      else if (S.callEnd) sub = `Arriving in ${Math.max(0, Math.ceil((S.callEnd - performance.now()) / 1000))}s — SURVIVE`;
      else sub = 'Find the panel next to the doors';
    }
    return `<li class="${cls}"><span class="ck">${tk.done ? '✔' : cls === 'locked' ? '🔒' : '◻'}</span><span>${escapeHtml(td.label)}${sub && !tk.done ? `<span class="sub">${escapeHtml(sub)}</span>` : ''}</span></li>`;
  });
  $('objectives').innerHTML = rows.join('');
}
function countInExit() {
  const room = S.level.exitRoom; let inside = 0, alive = 0;
  if (!S.down) { alive++; if (inRoom(room, P.x, P.z)) inside++; }
  for (const r of S.remotes.values()) if (!(r.fl & 4)) { alive++; if (inRoom(room, r.x, r.z)) inside++; }
  return { inside, alive };
}

function renderInventory() {
  const slots = ['bandage', 'medkit', 'battery', 'energy', 'pills'].map((k) => {
    const n = S.inv[k] || 0; const it = ITEMS[k];
    return `<div class="slot ${n ? '' : 'empty'}" data-item="${k}" title="${it.name}"><span class="k">${it.key}</span>${it.icon}<span class="n">${n || ''}</span></div>`;
  });
  if (S.inv.adrenaline) slots.push(`<div class="slot" title="Adrenaline (auto-revive)">💉<span class="n">${S.inv.adrenaline}</span></div>`);
  for (const [k, n] of Object.entries(S.quest || {})) if (n > 0) slots.push(`<div class="slot quest" title="${ITEMS[k].name}">${ITEMS[k].icon}<span class="n">${n}</span></div>`);
  $('inventory').innerHTML = slots.join('');
  const w = S.equipped ? WEAPONS[S.equipped] : null;
  const others = Object.keys(S.weapons || {}).filter((k) => k !== S.equipped);
  $('weapon').innerHTML = w ? `<b>${w.icon} ${w.name}</b>${S.weapons[S.equipped]} use${S.weapons[S.equipped] > 1 ? 's' : ''} left · <kbd>LMB</kbd>${others.length ? `<br/><span class="dim small"><kbd>Q</kbd> switch to ${others.map((o) => WEAPONS[o].name).join(', ')}</span>` : ''}` : '<span class="dim">No weapon — search cabinets & crates</span>';
  renderObjectives();
}

let hudT = 0;
function updateHUD(dt) {
  $('hpFill').style.width = S.hp + '%'; $('stFill').style.width = P.stamina + '%'; $('btFill').style.width = P.battery + '%';
  $('noiseBar').firstElementChild.style.width = Math.min(100, (P.noise / NOISE.sprint) * 100) + '%';
  const tg = S.target;
  const pr = $('prompt');
  if (tg && !S.hold) { pr.style.display = 'block'; pr.innerHTML = tg.type === 'info' ? escapeHtml(tg.label) : `<kbd>E</kbd> ${tg.hold ? 'Hold to ' : ''}${escapeHtml(tg.label)}`; }
  else pr.style.display = 'none';
  $('crosshair').classList.toggle('active', !!tg && tg.type !== 'info');
  $('downed').classList.toggle('hidden', !S.down);
  if (touch.on) {
    if (touch.sprint && P.stamina <= 1 && P.energyT <= 0) touch.sprint = false;
    $('tSprint').classList.toggle('active', touch.sprint);
    $('tCrouch').classList.toggle('active', P.crouch);
    $('tAttack').style.opacity = S.equipped ? 1 : 0.35;
  }
  const cb = $('callBanner');
  if (S.callEnd && !S.exitOpen) { cb.style.display = 'block'; cb.textContent = `${S.level.def.exitStyle === 'garage' ? 'BAY DOOR OPENING' : 'ELEVATOR ARRIVING'} — ${Math.max(0, Math.ceil((S.callEnd - performance.now()) / 1000))}s`; }
  else if (S.exitOpen) { cb.style.display = 'block'; cb.textContent = S.level.def.exitStyle === 'garage' ? 'BAY DOOR OPEN — GET TO THE AMBULANCE!' : 'ELEVATOR HERE — GET IN!'; }
  else cb.style.display = 'none';
  hudT -= dt;
  if (hudT <= 0) {
    hudT = 0.25;
    $('timer').textContent = `Floor time ${fmtTime(performance.now() - S.levelStart)} · Total ${fmtTime(performance.now() - S.totalStart)}`;
    const fx = [];
    if (P.energyT > 0) fx.push(`🥤 ${Math.ceil(P.energyT)}s`);
    if (P.pillsT > 0) fx.push(`💊 silent ${Math.ceil(P.pillsT)}s`);
    if (P.crouch) fx.push('crouching');
    $('effects').innerHTML = fx.map((f) => `<span>${f}</span>`).join('');
    const team = [...S.roster.values()].filter((p) => p.id === S.me || S.remotes.has(p.id));
    $('team').innerHTML = team.map((p) => {
      const me = p.id === S.me; const r = S.remotes.get(p.id);
      const hp = me ? S.hp : r?.hp ?? 100; const down = me ? S.down : r && r.fl & 4;
      const hid = me ? S.hidden : r && r.fl & 8;
      return `<div class="mate ${down ? 'down' : ''}"><span>${escapeHtml(p.name)}${me ? ' (you)' : ''}${down ? ' ☠' : hid ? ' 🚪' : ''}</span><div class="hpb"><i style="width:${hp}%"></i></div></div>`;
    }).join('');
    if (S.callEnd || S.exitOpen) renderObjectives();
  }
  if (S.mapOpen) drawMap();
  drawSkill(dt);
}

function drawMap() {
  const L = S.level; const c = $('mapCanvas'), x = c.getContext('2d');
  const s = Math.floor(640 / Math.max(L.W, L.H)); const ox = (640 - L.W * s) / 2, oy = (640 - L.H * s) / 2;
  x.fillStyle = '#050a0c'; x.fillRect(0, 0, 640, 640);
  for (let y = 0; y < L.H; y++) for (let xx = 0; xx < L.W; xx++) {
    const k = y * L.W + xx; if (!S.explored[k]) continue;
    const tt = L.grid[k];
    x.fillStyle = tt === WALL ? '#1b272b' : tt === BARR ? '#6b4a1a' : tt === EXIT ? '#c43' : tt === DOOR ? '#7a9aa0' : L.region[k] > 0 ? '#3d4d52' : '#506066';
    x.fillRect(ox + xx * s, oy + y * s, s, s);
  }
  const dot = (wx, wz, col, r) => { x.fillStyle = col; x.beginPath(); x.arc(ox + (wx / CELL) * s, oy + (wz / CELL) * s, r, 0, 7); x.fill(); };
  for (const st of L.stations) {
    const k = Math.floor(st.iz / CELL) * L.W + Math.floor(st.ix / CELL); if (!S.explored[k]) continue;
    const tk = taskOf(st); dot(st.x, st.z, tk?.done ? '#3fe07a' : '#ffc34d', s * 0.7);
  }
  for (const lk of L.lockers) { const k = Math.floor(lk.iz / CELL) * L.W + Math.floor(lk.ix / CELL); if (S.explored[k]) dot(lk.x, lk.z, '#5fa0d6', s * 0.35); }
  for (const r of S.remotes.values()) dot(r.x, r.z, r.fl & 4 ? '#f44' : '#5fd0e6', s * 0.6);
  const px = ox + (P.x / CELL) * s, pz = oy + (P.z / CELL) * s; const f = forward();
  x.fillStyle = '#fff'; x.beginPath(); x.moveTo(px + f.x * s * 1.4, pz + f.z * s * 1.4); x.lineTo(px - f.z * s * 0.7, pz + f.x * s * 0.7); x.lineTo(px + f.z * s * 0.7, pz - f.x * s * 0.7); x.fill();
  x.fillStyle = '#9ab'; x.font = '13px Rubik'; x.fillText('● task  ● locker  ● teammate', 10, 630);
}

// ======================================================================= main loop
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta()); t += dt;
  renderer.clear();
  if (S.phase === 'game' && S.world) {
    updatePlayer(dt);
    updateRemotes(dt);
    updateMonsters(dt);
    updateParticles(dt);
    S.world.update(dt, t, { x: P.x, z: P.z }, !!S.callEnd && !S.exitOpen);
    updateHUD(dt);
    sound.tick();
    renderer.render(scene, camera);
    updateViewModel(dt);
    renderer.clearDepth();
    renderer.render(viewScene, camera);
  } else {
    const a = t * 0.25;
    menuCam.position.set(Math.sin(a) * 0.6 + 0.2, 1.6, 5.2); menuCam.lookAt(-0.1, 1.0, -0.5);
    mSpot.target.position.set(0.9, 0.8, 0.6);
    mRed.intensity = 4 + Math.sin(t * 3) * 2 + (Math.random() < 0.03 ? -4 : 0);
    if (menuAvatar) { menuAvatar.group.rotation.y = Math.sin(t * 0.6) * 0.5 - 0.3; menuAvatar.animate(dt, { speed: 0, flash: false }); }
    menuMonsters.forEach((m, i) => m.update(dt, t + i, 0, 0));
    renderer.render(menuScene, menuCam);
  }
}
frame();

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = menuCam.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix(); menuCam.updateProjectionMatrix();
});
// debug handle for testing in the console
if (new URLSearchParams(location.search).has("debug")) window.__w13 = { S, P, scene, camera, socket };
