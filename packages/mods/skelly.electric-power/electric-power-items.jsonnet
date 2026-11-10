// Carried battery power: the cells and what burns them.

// Disassembly recovers a rolled share of each part, rounded down.
local salvage = [0.5, 0.6, 0.7, 0.8, 0.9, 1];
local yield(item, count) = { item: item, count: count, fractions: salvage, rounding: 'floor' };
local disassembly(timeGameMinutes, yields) = { timeGameMinutes: timeGameMinutes, skill: 'crafting', yields: yields };

local lights = import 'tools/jsonnet/lib/lights.libsonnet';
local batteryBeam = lights.batteryBeam;

(import 'tools/jsonnet/lib/item-policy.libsonnet').itemPack({
  items: [
    {
      id: 'rechargeable_aa_battery',
      name: 'Rechargeable AA battery',
      description: 'A rechargeable AA cell.',
      category: 'battery',
      model: 'aa_battery',
      size: [1, 1],
      stack: 10,
      battery: { capacity: 1, rechargeable: { microjoulesPerCharge: 7200000000 } },
    },
    {
      id: 'aa_battery',
      name: 'AA battery',
      category: 'battery',
      model: 'aa_battery',
      size: [1, 1],
      stack: 10,
      battery: { capacity: 1 },
    },
    {
      id: 'portable_radio',
      name: 'Portable radio',
      category: 'misc',
      model: 'portable_radio',
      size: [2, 2],
      description: 'A battered handheld radio. Its battery and metal casing can be salvaged.',
      salvageTimeGameMinutes: 5,
      salvage: [{ item: 'scrap_metal', count: 1 }, { item: 'aa_battery', count: 1 }],
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
        intensity=4.5,
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
        intensity: 0.62,
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
  ],
  recipes: [
    {
      id: 'make_headlamp_strap',
      category: 'lighting',
      tags: ['textile'],
      searchTerms: [],
      consumeFitted: true,
      result: { item: 'headlamp', count: 1 },
      timeGameMinutes: 10,
      skills: { crafting: 0 },
      qualities: {},
      components: [
        [{ item: 'flashlight', count: 1 }],
        [{ item: 'cloth_strip', count: 1 }],
        [{ item: 'duct_tape', count: 1 }],
      ],
    },
    {
      id: 'repair_flashlight',
      category: 'repair_electrical',
      tags: ['electrical'],
      searchTerms: [],
      kind: 'repair',
      result: { item: 'flashlight', count: 1 },
      repair: { skill: 'mechanics', amount: 0.2, perSkill: 0.1 },
      timeGameMinutes: 14,
      skills: { mechanics: 0 },
      qualities: { screwing: 1 },
      components: [[{ item: 'fuse', count: 1 }], [{ item: 'electrical_tape', count: 1 }]],
    },
  ],
})
