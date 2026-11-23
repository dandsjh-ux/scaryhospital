// Shared game configuration (used by both the Node server and the browser client).
// Tweak numbers here to tune difficulty and level length.

export const CELL = 2;          // metres per grid cell
export const WALL_H = 3.2;      // wall / ceiling height
export const BLOCK = 11;        // cells per building block (rooms live inside blocks)
export const CORR = 2;          // corridor width in cells
export const MAX_PLAYERS = 6;

export const PLAYER = {
  walk: 3.4,
  sprint: 5.6,
  crouch: 1.7,
  radius: 0.32,
  eye: 1.62,
  crouchEye: 1.05,
  staminaDrain: 26,   // per second while sprinting
  staminaRegen: 15,
  maxHp: 100,
  batteryDrain: 0.85, // % per second while the flashlight is on
};

// Noise radius (metres) a player emits. Monsters multiply this by their hearing.
export const NOISE = {
  idle: 0,
  crouch: 1.4,
  walk: 6.5,
  sprint: 14,
  search: 6,
  task: 7,
  jump: 7,
  fail: 18,
};

export const ITEMS = {
  bandage:     { name: 'Bandage',        kind: 'consumable', heal: 25, max: 3, color: 0xf2efe6, key: '1', icon: '🩹' },
  medkit:      { name: 'Medkit',         kind: 'consumable', heal: 65, max: 2, color: 0xd8332f, key: '2', icon: '⛑️' },
  battery:     { name: 'Battery',        kind: 'consumable', battery: 60, max: 3, color: 0x3fbf5f, key: '3', icon: '🔋' },
  energy:      { name: 'Energy Drink',   kind: 'consumable', duration: 20, max: 2, color: 0x2aa8ff, key: '4', icon: '🥤' },
  pills:       { name: 'Hush Pills',     kind: 'consumable', duration: 30, max: 2, color: 0xb37bff, key: '5', icon: '💊' },
  adrenaline:  { name: 'Adrenaline',     kind: 'passive', max: 1, color: 0xffd43b, icon: '💉' },
  fuse:        { name: 'Fuse',           kind: 'quest', color: 0xffb02e, icon: '🔌' },
  keycard:     { name: 'Staff Keycard',  kind: 'quest', color: 0x4fc3f7, icon: '💳' },
  vial:        { name: 'Sedative Vial',  kind: 'quest', color: 0x7cff9e, icon: '🧪' },
  patientfile: { name: 'Patient File #0413', kind: 'quest', color: 0xe8d9a8, icon: '📁' },
  gascan:      { name: 'Gas Can',        kind: 'quest', color: 0xd63a2a, icon: '⛽' },
  note:        { name: 'Code Note',      kind: 'quest', color: 0xfff7c2, icon: '📝' },
};

export const WEAPONS = {
  crowbar:      { name: 'Crowbar',           uses: 6, stun: 4.5, range: 2.6, arc: 0.85, cooldown: 0.7, icon: '🔧' },
  extinguisher: { name: 'Fire Extinguisher', uses: 3, stun: 6,   range: 5.5, arc: 0.55, cooldown: 1.2, icon: '🧯' },
  tranq:        { name: 'Tranq Pistol',      uses: 2, stun: 15,  range: 30,  arc: 0,    cooldown: 1.0, icon: '🔫' },
};

// fov in degrees, speeds in m/s, sight/hearing ranges in metres.
export const MONSTERS = {
  lop:     { name: 'Lop',     desc: 'Floppy ears. Hears every footstep.',            patrol: 1.6, chase: 4.3, sight: 12, fov: 110, hearing: 1.5, dmg: 30, radius: 0.45 },
  grin:    { name: 'Grin',    desc: 'All teeth. Terrifyingly fast once it sees you.', patrol: 1.8, chase: 5.0, sight: 9,  fov: 90,  hearing: 1.0, dmg: 40, radius: 0.45 },
  mumbles: { name: 'Mumbles', desc: 'Wrapped in bandages. Sees far and shrieks for the others.', patrol: 1.3, chase: 3.8, sight: 17, fov: 120, hearing: 0.8, dmg: 25, radius: 0.45, shriek: true },
  matron:  { name: 'Matron',  desc: 'The head nurse. Tall and relentless.',          patrol: 2.0, chase: 4.7, sight: 14, fov: 100, hearing: 1.2, dmg: 45, radius: 0.5 },
};

export const LEVELS = [
  {
    name: 'Ward A',
    subtitle: 'Ground Floor',
    blocksX: 3, blocksY: 3,
    speedMult: 1.0,
    palette: { wallTop: '#9db2bb', wallBottom: '#2b5563', floor: '#8e9b9f', ceiling: '#c4cbcb', light: 0xd8ecff, fog: 0x060a0d, fogDensity: 0.058, accent: '#2f7f95' },
    roomTypes: ['ward', 'ward', 'office', 'storage', 'waiting', 'restroom', 'ward'],
    monsters: ['lop', 'grin'],
    extraMonsters: ['mumbles', 'lop'],
    floorItems: { fuse: 4, bandage: 3, battery: 3, energy: 1, pills: 1 },
    hiddenItems: [{ item: 'keycard', in: 'desk' }],
    weapons: ['crowbar'],
    lockers: 9,
    barricades: 3,
    brokenLights: 0.28,
    darkRooms: 0.2,
    exitStyle: 'elevator',
    tasks: [
      { id: 'fuses', type: 'deliver', item: 'fuse', per: 4, stations: 1, station: 'fusebox', hold: 2.0, label: 'Restore power: insert 4 fuses into the fuse box', short: 'Fuse box' },
      { id: 'terminal', type: 'skill', stations: 1, station: 'terminal', checks: 3, label: 'Reboot the nurse station terminal', short: 'Terminal' },
      { id: 'keycard', type: 'deliver', item: 'keycard', per: 1, stations: 1, station: 'cardreader', hold: 1.2, label: 'Find a staff keycard (search desk drawers) and swipe it at the card reader', short: 'Card reader' },
      { id: 'escape', type: 'call', station: 'exitpanel', wait: 45, final: true, label: 'Call the service elevator and survive until it arrives', short: 'Elevator' },
    ],
  },
  {
    name: 'Surgical Wing',
    subtitle: 'Second Floor',
    blocksX: 4, blocksY: 3,
    speedMult: 1.06,
    palette: { wallTop: '#a3b8ab', wallBottom: '#2f5a4a', floor: '#8a9a92', ceiling: '#c3cbc6', light: 0xdcfff0, fog: 0x050b08, fogDensity: 0.062, accent: '#3a9a6f' },
    roomTypes: ['surgery', 'lab', 'ward', 'office', 'storage', 'xrayroom', 'waiting', 'surgery'],
    monsters: ['lop', 'grin', 'mumbles'],
    extraMonsters: ['grin', 'lop'],
    floorItems: { vial: 4, bandage: 2, medkit: 1, battery: 3, energy: 1, pills: 1 },
    hiddenItems: [{ item: 'patientfile', in: 'filecabinet' }],
    weapons: ['extinguisher', 'crowbar'],
    lockers: 10,
    barricades: 4,
    brokenLights: 0.35,
    darkRooms: 0.25,
    exitStyle: 'elevator',
    tasks: [
      { id: 'vials', type: 'deliver', item: 'vial', per: 4, stations: 1, station: 'labbench', hold: 3.0, label: 'Collect 4 sedative vials and mix them at the lab bench', short: 'Lab bench' },
      { id: 'breakers', type: 'skill', stations: 3, station: 'breaker', checks: 2, label: 'Reset the 3 tripped circuit breakers', short: 'Breakers' },
      { id: 'file', type: 'deliver', item: 'patientfile', per: 1, stations: 1, station: 'xray', hold: 2.0, label: "Find patient #0413's file (search file cabinets) and scan it in X-Ray", short: 'X-Ray' },
      { id: 'escape', type: 'call', station: 'exitpanel', wait: 55, final: true, label: 'Call the bed elevator and survive until it arrives', short: 'Elevator' },
    ],
  },
  {
    name: 'The Morgue',
    subtitle: 'Basement',
    blocksX: 4, blocksY: 4,
    speedMult: 1.12,
    palette: { wallTop: '#8c8f88', wallBottom: '#4a4a44', floor: '#6f726c', ceiling: '#9a9c95', light: 0xffe6c4, fog: 0x070605, fogDensity: 0.066, accent: '#c9a227' },
    roomTypes: ['morgue', 'morgue', 'boiler', 'storage', 'office', 'boiler', 'ward'],
    monsters: ['lop', 'grin', 'mumbles', 'matron'],
    extraMonsters: ['grin', 'lop'],
    floorItems: { gascan: 3, note: 3, bandage: 2, medkit: 1, battery: 3, energy: 1, pills: 1 },
    hiddenItems: [],
    weapons: ['tranq', 'extinguisher'],
    lockers: 11,
    barricades: 5,
    brokenLights: 0.42,
    darkRooms: 0.3,
    exitStyle: 'garage',
    tasks: [
      { id: 'generators', type: 'deliver', item: 'gascan', per: 1, stations: 3, station: 'generator', hold: 3.0, label: 'Refuel the 3 backup generators with gas cans', short: 'Generators' },
      { id: 'code', type: 'code', stations: 1, station: 'keypad', label: 'Find the 3 code notes and unlock the security keypad', short: 'Keypad' },
      { id: 'escape', type: 'call', station: 'exitpanel', wait: 60, final: true, label: 'Open the ambulance bay door and ESCAPE', short: 'Ambulance bay' },
    ],
  },
];

export const LOOT_WEIGHTS = [
  ['none', 38], ['battery', 18], ['bandage', 18], ['energy', 7], ['medkit', 6], ['pills', 8], ['adrenaline', 4],
];
