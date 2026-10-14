// Tools, melee weapons and carried lights.

// Disassembly recovers a rolled share of each part, rounded down.
local salvage = [0.5, 0.6, 0.7, 0.8, 0.9, 1];
local yield(item, count) = { item: item, count: count, fractions: salvage, rounding: 'floor' };
local disassembly(timeGameMinutes, yields) = { timeGameMinutes: timeGameMinutes, skill: 'crafting', yields: yields };

local melee(type, damage, reach, cooldownSimSeconds, stamina, impulse, wearPerHit) = {
  melee: {
    damage: damage,
    reach: reach,
    cooldownSimSeconds: cooldownSimSeconds,
    stamina: stamina,
    impulse: impulse,
    wearPerHit: wearPerHit,
    type: type,
  },
};

// A battery beam: an LED light whose cone is shaped by `beam` and which drains AA batteries.
local batteryBeam(radius, seenFrom, intensity, beam, chargePerGameHour) = {
  radius: radius,
  seenFrom: seenFrom,
  color: '#fff1d8',
  intensity: intensity,
  beam: beam,
  power: { battery: 'aa_battery', chargePerGameHour: chargePerGameHour },
};

local burns(ignition, douse, sprint, stow, drop, relight) = {
  ignition: ignition,
  douse: douse,
  sprint: sprint,
  stow: stow,
  drop: drop,
  relight: relight,
};

local meleeClasses = [
  { id: 'blunt', damageVariance: 0.05, headDamageMultiplier: 1.7, limbDamageMultiplier: 1, speedMultiplier: 0.85 },
  { id: 'cut', damageVariance: 0.18, headDamageMultiplier: 1, limbDamageMultiplier: 2.5, speedMultiplier: 1 },
  { id: 'pierce', damageVariance: 0.4, headDamageMultiplier: 1, limbDamageMultiplier: 1, speedMultiplier: 1.15 },
];

local items = [
  {
    id: 'compass',
    name: 'Compass',
    category: 'tool',
    weight: 120,
    size: [1, 2],
    description: 'A small electronic compass with an illuminated heading display. Prototype: battery use is not yet modeled.',
    heldDisplay: 'compass',
  },
  {
    id: 'crowbar',
    name: 'Crowbar',
    category: 'tool',
    weight: 1500,
    size: [1, 5],
    description: 'Pries open doors and crates. Also a weapon.',
    model: 'crowbar',
    tool: { qualities: { prying: 3, hammering: 1 } },
    weapon: melee('blunt', damage=14, reach=0.6, cooldownSimSeconds=1.1, stamina=8, impulse=8, wearPerHit=0.015),
  },
  {
    id: 'hammer',
    name: 'Hammer',
    category: 'tool',
    weight: 700,
    size: [1, 3],
    model: 'hammer',
    tool: { qualities: { hammering: 2 } },
    weapon: melee('blunt', damage=10, reach=0.4, cooldownSimSeconds=0.8, stamina=5, impulse=6, wearPerHit=0.012),
  },
  {
    id: 'kitchen_knife',
    name: 'Kitchen knife',
    category: 'tool',
    weight: 150,
    size: [1, 3],
    model: 'kitchen_knife',
    tool: { qualities: { cutting: 2 } },
    weapon: melee('cut', damage=8, reach=0.25, cooldownSimSeconds=0.5, stamina=3, impulse=3.5, wearPerHit=0.025),
  },
  {
    id: 'kabar',
    name: 'Kabar',
    category: 'tool',
    weight: 300,
    size: [1, 3],
    model: 'kabar',
    tool: { qualities: { cutting: 2 } },
    weapon: melee('cut', damage=9, reach=0.3, cooldownSimSeconds=0.55, stamina=3.5, impulse=4, wearPerHit=0.025),
  },
  {
    id: 'machete',
    name: 'Machete',
    category: 'tool',
    weight: 550,
    size: [1, 4],
    model: 'machete',
    tool: { qualities: { cutting: 2 } },
    weapon: melee('cut', damage=11, reach=0.45, cooldownSimSeconds=0.75, stamina=5, impulse=4.5, wearPerHit=0.02),
  },
  {
    id: 'can_opener',
    name: 'Can opener',
    category: 'tool',
    weight: 100,
    size: [1, 1],
    tool: { qualities: { opening: 1 } },
  },
  {
    id: 'baseball_bat',
    name: 'Baseball bat',
    category: 'weapon',
    weight: 900,
    size: [1, 6],
    model: 'baseball_bat',
    twoHanded: true,
    weapon: melee('blunt', damage=15, reach=0.8, cooldownSimSeconds=1.2, stamina=9, impulse=10, wearPerHit=0.01),
  },
  {
    id: 'steel_pipe',
    name: 'Steel pipe',
    category: 'weapon',
    weight: 1800,
    size: [1, 6],
    model: 'steel_pipe',
    weapon: melee('blunt', damage=13, reach=0.6, cooldownSimSeconds=1.2, stamina=9, impulse=8, wearPerHit=0.015),
  },
  {
    id: 'flashlight',
    name: 'Flashlight',
    category: 'light',
    weight: 250,
    size: [1, 2],
    description: 'Lets you see. Lets them see you.',
    model: 'flashlight',
    light: batteryBeam(
      radius=20,
      seenFrom=40,
      intensity=5,
      beam={ angleDegrees: 60, penumbra: 0.6 },
      chargePerGameHour=0.25,
    ),
  },
  {
    id: 'headlamp',
    name: 'Headlamp',
    category: 'light',
    weight: 180,
    size: [1, 2],
    description: 'A battery-powered beam worn on the head, leaving both hands free.',
    wearable: { slot: 'head', encumbrance: 0 },
    light: batteryBeam(
      radius=12,
      seenFrom=30,
      intensity=2.5,
      beam={ angleDegrees: 24, penumbra: 0.35 },
      chargePerGameHour=0.2,
    ),
  },
  {
    id: 'torch',
    name: 'Torch',
    category: 'light',
    weight: 350,
    size: [1, 4],
    description: 'Rags and wax wrapped tightly around a stick.',
    disassembly: disassembly(10, [yield('stick', 1), yield('rag', 2), yield('wax', 1)]),
    light: {
      radius: 6,
      seenFrom: 60,
      color: '#ffb36b',
      intensity: 5,
      burnTimeGameHours: 4,
      burning: burns('firestarter', douse=true, sprint='stay', stow='refuse', drop='douse', relight=true),
    },
  },
  {
    id: 'candle',
    name: 'Candle',
    category: 'light',
    weight: 150,
    size: [1, 1],
    description: 'A wax candle with a rag wick.',
    disassembly: disassembly(5, [yield('wax', 2), yield('rag', 1)]),
    light: {
      radius: 3,
      seenFrom: 15,
      color: '#ffd28a',
      intensity: 1,
      burnTimeGameHours: 6,
      burning: burns('firestarter', douse=true, sprint='douse', stow='douse', drop='douse', relight=true),
    },
  },
  {
    id: 'glowstick',
    name: 'Glowstick',
    category: 'light',
    weight: 30,
    size: [1, 2],
    description: 'A sealed chemical light.',
    model: 'glowstick',
    light: {
      radius: 2,
      seenFrom: 15,
      color: '#62ff81',
      intensity: 1,
      emissive: 0.8,
      burnTimeGameHours: 8,
      burning: burns('snap', douse=false, sprint='stay', stow='stay', drop='stay', relight=false),
    },
  },
  {
    id: 'lighter',
    name: 'Lighter',
    category: 'light',
    weight: 20,
    size: [1, 1],
    light: { radius: 2, seenFrom: 10, color: '#ffd28a', intensity: 0.7, fuelPerGameHour: 10 },
    igniter: { capacity: 100, perIgnition: 1 },
  },
  {
    id: 'matches',
    name: 'Box of matches',
    category: 'light',
    weight: 20,
    size: [1, 1],
    igniter: { capacity: 10, perIgnition: 1 },
  },
];

local itemIds = [item.id for item in items];
local classIds = [meleeClass.id for meleeClass in meleeClasses];
assert std.length(std.set(itemIds)) == std.length(itemIds) : 'item ids must be unique';
assert std.all([std.member(classIds, item.weapon.melee.type) for item in items if std.objectHas(item, 'weapon')])
       : 'every melee weapon must name a melee class defined here';

{
  models: [
    { id: 'flashlight', file: 'assets/models/flashlight.glb', grip: { at: [0.085, 0, 0] }, anchors: { lens: [0.199, 0, 0] } },
    { id: 'glowstick', file: 'assets/models/glowstick.glb', emissiveMaterial: 'chemical-light tube' },
  ],
  meleeClasses: meleeClasses,
  items: items,
}
