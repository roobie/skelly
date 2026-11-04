// Tools and carried lights.

// Disassembly recovers a rolled share of each part, rounded down.
local salvage = [0.5, 0.6, 0.7, 0.8, 0.9, 1];
local yield(item, count) = { item: item, count: count, fractions: salvage, rounding: 'floor' };
local disassembly(timeGameMinutes, yields) = { timeGameMinutes: timeGameMinutes, skill: 'crafting', yields: yields };

local lights = import 'tools/jsonnet/lib/lights.libsonnet';
local batteryBeam = lights.batteryBeam;

local items = [
  {
    id: 'scissor_jack',
    name: 'Scissor jack',
    category: 'tool',
    model: 'scissor_jack',
    size: [3, 2],
    description: 'A light screw jack from a car boot. It raises little, slowly.',
    tool: { qualities: { jacking: 1 } },
  },
  {
    id: 'bottle_jack',
    name: 'Bottle jack',
    category: 'tool',
    model: 'bottle_jack',
    size: [2, 3],
    description: 'A hydraulic jack with a short, strong ram.',
    tool: { qualities: { jacking: 2 } },
  },
  {
    id: 'engine_hoist',
    name: 'Engine hoist',
    category: 'tool',
    model: 'engine_hoist',
    size: [4, 6],
    description: 'A wheeled floor crane with a hydraulic boom. It takes two hands and a lot of room.',
    tool: { qualities: { jacking: 3 } },
  },
  {
    id: 'bear_trap',
    model: 'bear_trap',
    name: 'Bear trap',
    category: 'tool',
    size: [5, 5],
    description: 'Steel jaws on a spring. It shuts on whatever steps in it.',
    trap: {
      setSimSeconds: 4,
      disarmSimSeconds: 6,
      holdSimSeconds: 20,
      playerInjury: { region: 'leftLeg', damage: 25, kind: 'pierce' },
      actorLegDamage: 60,
    },
  },
  {
    id: 'flashlight',
    name: 'Flashlight',
    category: 'light',
    size: [1, 2],
    description: 'A battery-powered flashlight. Its light is visible to nearby zombies.',
    model: 'flashlight',
    light: lights.flashlight,
  },
  {
    id: 'headlamp',
    name: 'Headlamp',
    category: 'light',
    model: 'headlamp',
    size: [1, 2],
    description: 'A battery-powered beam worn on the head, leaving both hands free.',
    disassembly: disassembly(5, [yield('flashlight', 1), yield('cloth_strip', 1)]),
    wearable: { slot: 'head', encumbrance: 0 },
    figureModels: [{ model: 'headlamp', frame: 'head', pivot: [0, 0, 0], at: [0, 0.055, 0], turn: [0, 0, 0] }],
    light: batteryBeam(
      radius=12,
      seenFrom=30,
      intensity=2.5,
      beam={ angleDegrees: 48, penumbra: 0.5, decay: 1, spill: { enabled: false, radiusRatio: 1.5, intensity: 0.18 } },
      chargePerGameHour=0.2,
    ) + { wornSwitch: true },
  },
  {
    id: 'night_vision_goggles',
    name: 'Night-vision goggles',
    category: 'light',
    size: [2, 2],
    description: 'Battery-powered night-vision goggles with an infrared lamp.',
    model: 'night_vision_goggles',
    wearable: { slot: 'eyes', encumbrance: 0 },
    figureModels: [{ model: 'night_vision_goggles', frame: 'head', pivot: [0, 0, 0], at: [0, 0.04, 0], turn: [0, 180, 0] }],
    // The light stands in for the infrared lamp: wide, dim and seen only from close up.
    light: {
      radius: 14,
      seenFrom: 8,
      color: '#7dff86',
      intensity: 0.8,
      power: { battery: 'aa_battery', compatibleBatteries: ['rechargeable_aa_battery'], chargePerGameHour: 0.15, swapSimSeconds: 2 },
      wornSwitch: true,
      nightVision: {
        gain: 6,
        tint: '#8cff8f',
        grain: 0.08,
        edge: { darkening: 0.92, inner: 0.28, outer: 0.5 },
        flare: { strength: 0.15, distanceMetres: 3, blastIntensity: 40, recoverRealSeconds: 0.6, haloRadius: 0.12 },
      },
    },
  },
];

local itemIds = [item.id for item in items];
assert std.length(std.set(itemIds)) == std.length(itemIds) : 'item ids must be unique';

{
  items: items,
}
