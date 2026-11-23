# Ward 13

A multiplayer, first-person, Roblox-style survival horror game built with **three.js** and **socket.io**.
You and up to 5 friends are trapped in a hospital overnight. The hospital's mascots — creepy plush animals — are awake, and they're hunting you.

- **3 floors**: Ward A (ground floor) → Surgical Wing → The Morgue (basement)
- **Stealth**: monsters see and hear you. Sprinting is loud, crouching is quiet, and your flashlight makes you easier to spot. Hide in lockers — but if a monster sees you climb in, it will drag you out.
- **Mini tasks** on every floor: collect fuses, vials or gas cans; timing skill-checks on terminals and breakers; search drawers for keycards and files; find code notes and crack a keypad.
- **Escape**: once the tasks are done, call the elevator (or open the ambulance bay) and survive until it arrives. The noise draws every monster to you.
- **Stick**: everyone starts with one. Unlimited swings, but a hit only dazes a monster for 2.5 s, and it shrugs off another stick hit for 4 s after getting up.
- **Better weapons are rare** (crowbar, fire extinguisher, tranq pistol), hidden in far-away cabinets, and they only stun.
- **Power-ups**: bandages, medkits, batteries, energy drinks (unlimited sprint), Hush Pills (silent footsteps) and Adrenaline (auto-revive).
- **Male / female** blocky avatars with shirt and skin colours.
- **Getting back up**: teammates can revive you, or hold E for 8 s to patch yourself up (once per floor, within 45 s of going down).
- **Objective map**: a minimap in the corner and a full map (M) marking every task station, the exit, downed teammates and any quest items you've already seen, with a checklist and distances.
- **Touch controls** for tablets and phones: joystick, drag-to-look and on-screen buttons.

Everything (models, textures, sounds) is generated in code, so there are no asset files to manage.

## Run locally

```bash
npm install
npm start
```

Open http://localhost:3000. To test multiplayer locally, open a second browser window and type the same room code.

## Deploy: GitHub → Render

1. Create an empty repository on GitHub, then from this folder:
   ```bash
   git init
   git add .
   git commit -m "Ward 13"
   git branch -M main
   git remote add origin https://github.com/<you>/ward-13.git
   git push -u origin main
   ```
2. On https://dashboard.render.com choose **New → Blueprint**, pick the repository, and Render reads `render.yaml` automatically.
   Or choose **New → Web Service** and set:
   - Runtime: **Node**
   - Build command: `npm install`
   - Start command: `npm start`
   - Health check path: `/healthz`
3. Open the `https://<name>.onrender.com` URL and share it, plus a room code, with friends.

Notes:
- Render's free plan supports the WebSockets the game uses. Free services sleep when idle, so the first visit after a while can take ~30–50 s to wake up.
- Game state lives in server memory. A redeploy or restart ends any games in progress.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move |
| Mouse | Look (click the game to lock the mouse) |
| Shift | Sprint |
| C | Crouch (toggle) |
| Space | Jump |
| E | Interact / hold to search, use items, revive |
| F | Flashlight |
| Left click / R | Attack (on tablets: the red ATTACK button) |
| Q | Switch weapon |
| 1–5 | Bandage, medkit, battery, energy drink, Hush Pills |
| M | Objective map |
| T / Enter | Chat |

## Tuning

All balance numbers are in `shared/config.js`:

- **Level length**: `blocksX` / `blocksY` (map size), `floorItems`, task counts, and the escape `wait` time per floor.
- **Weapons**: `WEAPONS` (stun time, range, cooldown, uses; the stick's `immune` window).
- **Monsters**: speed, sight, field of view, hearing and damage per monster, plus `speedMult` per floor.
- **Self-revive**: `SELF_REVIVE` (hold time, health, uses per floor, bleed-out window).
- **Difficulty**: monster wake-up delay (`spawnMonsters` in `server.js`), loot weights, weapon placement, locker and barricade counts.

## Project layout

```
server.js            Express + socket.io server: rooms, monster AI, items, tasks, level flow
shared/config.js     Balance and level definitions (shared by server and browser)
shared/levelgen.js   Seeded hospital generator + collision (identical on server and client)
public/index.html    UI shell
public/style.css     UI styles
public/js/main.js    Client: menu, networking, first-person controls, HUD, mini-games
public/js/world.js   Builds the 3D level, lighting and doors
public/js/models.js  Props, stations, pickups, avatars and monsters
public/js/textures.js Procedural canvas textures
public/js/audio.js   Procedural WebAudio sounds
render.yaml          Render blueprint
```
