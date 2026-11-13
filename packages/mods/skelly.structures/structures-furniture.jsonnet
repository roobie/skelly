local shape = import 'tools/jsonnet/lib/furniture-shape.libsonnet';
local breach = import 'tools/jsonnet/lib/furniture-breach.libsonnet';
local detail = import 'tools/jsonnet/lib/door-detail.libsonnet';
local woodDoor = {
  id: 'wood_door',
  name: 'Burglary-safe wooden door',
  size: [2, 4, 1],
  color: '#7a5534',
  material: 'wood',
  breach: { minimumStrength: 4.5, durability: 150 },
  door: {
    handlingSimSeconds: 0.6,
    methods: {
      pry: {
        quality: 'prying', level: 3, skill: 'mechanics',
        timeSimSeconds: 15, fastestTimeSimSeconds: 7.5,
        strikeIntervalSimSeconds: 0.5, strikeSound: 'lock_pry',
      },
      hammer: {
        quality: 'hammering', level: 3, skill: 'mechanics',
        timeSimSeconds: 4, fastestTimeSimSeconds: 2.5,
        strikeIntervalSimSeconds: 0.8, strikeSound: 'lock_hammer',
      },
    },
    detail: detail.panelled,
  },
};
local flimsyPry = woodDoor.door.methods.pry + {
  level: 1, timeSimSeconds: 6, fastestTimeSimSeconds: 3,
};
local flimsyToWoodPryRatio = flimsyPry.timeSimSeconds / woodDoor.door.methods.pry.timeSimSeconds;
// A whole piece taken apart recovers a skill-rolled share of its wood and nails; a pry bar saves more nails.
local recovered = [0.5, 0.6, 0.7, 0.8, 0.9, 1];
local pryBonus = { quality: 'prying', bonusByLevel: [0.1, 0.2] };
local takeApart(minutes, offcuts, nails) = {
  takeApart: {
    yield: {
      timeGameMinutes: minutes,
      skill: 'crafting',
      yields: [
        { item: 'wood_offcut', count: offcuts, fractions: recovered, rounding: 'floor' },
        { item: 'nails', count: nails, fractions: recovered, rounding: 'floor', toolModifier: pryBonus },
      ],
    },
  },
};
local rail = function(x) { position: [x, 0, 0.55], size: [0.12, 1, 0.12] };
local rung = function(y) { position: [0.1, y, 0.6], size: [1.8, 0.08, 0.08] };
local basics = shape.colliding({
  furniture: [
    {
      id: 'rug',
      name: 'Rug',
      size: [4, 1, 2],
      color: '#7a2f2f',
      solid: false,
      cover: true,
      shape: [{ position: [0.05, 0, 0.05], size: [3.9, 0.06, 1.9] }],
    },
    {
      id: 'bedroll',
      name: 'Bedroll',
      size: [2, 1, 4],
      color: '#5b5f3c',
      solid: false,
      cover: true,
      rest: { quality: 0.3, sleep: true },
      shape: [
        { position: [0.1, 0, 0.1], size: [1.8, 0.08, 3.8] },
        { position: [0.3, 0.08, 0.2], size: [1.4, 0.1, 0.7], color: '#c9c3a8' },
      ],
    },
    {
      id: 'tarp',
      name: 'Tarp',
      size: [3, 1, 2],
      color: '#3d5a6c',
      solid: false,
      cover: true,
      shape: [{ position: [0.05, 0, 0.05], size: [2.9, 0.04, 1.9] }],
    },
    {
      id: 'kitchen_cupboard',
      name: 'Kitchen cupboard',
      size: [2, 2, 1],
      color: '#8a6a48',
      wear: { from: 0, to: 0.5 },
      appearance: { kind: 'cabinet', surface: 'wood' },
      container: { pockets: [{ grid: [8, 6], handlingSimSeconds: 1.0 }] },
    },
    {
      id: 'counter',
      name: 'Kitchen counter',
      size: [2, 2, 1],
      color: '#b8b2a6',
      appearance: { kind: 'drawers', surface: 'plastic' },
      container: { pockets: [{ grid: [8, 5], handlingSimSeconds: 1.0 }] },
    },
    {
      id: 'wardrobe',
      name: 'Wardrobe',
      size: [2, 4, 1],
      color: '#6e5037',
      wear: { from: 0, to: 0.4 },
      appearance: { kind: 'cabinet', surface: 'wood' },
      container: { pockets: [{ grid: [9, 18], handlingSimSeconds: 1.2 }] },
    },
    {
      id: 'desk',
      name: 'Desk',
      size: [3, 2, 2],
      color: '#7a5c3e',
      shape: [
        { position: [0, 1.7, 0], size: [3, 0.2, 2], color: '#8a6a48' },
        { position: [0.05, 0, 0.1], size: [1, 1.7, 1.85] },
        { position: [0.1, 1.2, 0], size: [0.9, 0.42, 0.1], color: '#6a4e33' },
        { position: [0.1, 0.65, 0], size: [0.9, 0.42, 0.1], color: '#6a4e33' },
        { position: [0.1, 0.1, 0], size: [0.9, 0.42, 0.1], color: '#6a4e33' },
        { position: [0.45, 1.38, 0], size: [0.2, 0.06, 0.1], color: '#2c2a28' },
        { position: [0.45, 0.83, 0], size: [0.2, 0.06, 0.1], color: '#2c2a28' },
        { position: [0.45, 0.28, 0], size: [0.2, 0.06, 0.1], color: '#2c2a28' },
        { position: [2.75, 0, 0.1], size: [0.2, 1.7, 1.85] },
        { position: [1.05, 0.9, 1.75], size: [1.7, 0.8, 0.1] },
      ],
      container: { pockets: [{ grid: [5, 3], handlingSimSeconds: 1.0 }] },
    },
    {
      id: 'shelf',
      name: 'Shelf',
      size: [2, 4, 1],
      color: '#8d7355',
      shape: [
        { position: [0, 0, 0], size: [0.12, 4, 1] },
        { position: [1.88, 0, 0], size: [0.12, 4, 1] },
        { position: [0.12, 0, 0.88], size: [1.76, 3.9, 0.12] },
        { position: [0, 3.88, 0], size: [2, 0.12, 1] },
        { position: [0.12, 0.1, 0], size: [1.76, 0.1, 0.88] },
        { position: [0.12, 1.0, 0], size: [1.76, 0.1, 0.88] },
        { position: [0.12, 1.9, 0], size: [1.76, 0.1, 0.88] },
        { position: [0.12, 2.8, 0], size: [1.76, 0.1, 0.88] },
      ],
      container: { pockets: [{ grid: [9, 18], handlingSimSeconds: 0.8 }] },
    } + takeApart(20, 6, 12),
    {
      id: 'workbench',
      name: 'Workbench',
      size: [3, 2, 2],
      color: '#98734f',
      shape: [
        { position: [0.1, 0, 0.1], size: [0.2, 1.6, 0.2] },
        { position: [2.7, 0, 0.1], size: [0.2, 1.6, 0.2] },
        { position: [0.1, 0, 1.7], size: [0.2, 1.6, 0.2] },
        { position: [2.7, 0, 1.7], size: [0.2, 1.6, 0.2] },
        { position: [0.3, 1.3, 0.1], size: [2.4, 0.25, 0.1] },
        { position: [0.3, 1.3, 1.8], size: [2.4, 0.25, 0.1] },
        { position: [0.3, 0.5, 0.3], size: [2.4, 0.1, 1.4] },
        { position: [0, 1.6, 0], size: [3, 0.3, 2] },
        { position: [2.4, 1.9, 0.1], size: [0.4, 0.1, 0.4] },
      ],
      workstation: {
        id: 'workbench',
        qualities: { hammering: 1, sawing: 1 },
        workFactorBonus: 0.2,
      },
    },
    {
      id: 'grinding_wheel',
      name: 'Grinding wheel',
      size: [2, 2, 2],
      color: '#4d5a4a',
      material: 'steel',
      shape: [
        { position: [0.4, 0, 0.4], size: [1.2, 0.1, 1.2], color: '#2f3331' },
        { position: [0.85, 0.1, 0.85], size: [0.3, 1.3, 0.3], color: '#2f3331' },
        { position: [0.6, 1.4, 0.75], size: [0.8, 0.4, 0.5] },
        { position: [0.45, 1.3, 0.65], size: [0.15, 0.7, 0.7], color: '#8a857c' },
        { position: [1.4, 1.3, 0.65], size: [0.15, 0.7, 0.7], color: '#8a857c' },
      ],
      workstation: {
        id: 'grinding_wheel',
        qualities: { sharpening: 1 },
        workFactorBonus: 0.2,
      },
    },
    {
      id: 'crate',
      name: 'Crate',
      size: [2, 2, 2],
      color: '#9a7b4f',
      wear: { from: 0.1, to: 0.6 },
      shape: [
        { position: [0.1, 0.05, 0.1], size: [1.8, 1.79, 1.8] },
        { position: [0, 0, 0], size: [0.2, 1.84, 0.2] },
        { position: [1.8, 0, 0], size: [0.2, 1.84, 0.2] },
        { position: [0, 0, 1.8], size: [0.2, 1.84, 0.2] },
        { position: [1.8, 0, 1.8], size: [0.2, 1.84, 0.2] },
        { position: [0.2, 0.1, 0], size: [1.6, 0.5, 0.1] },
        { position: [0.2, 0.72, 0], size: [1.6, 0.5, 0.1] },
        { position: [0.2, 1.34, 0], size: [1.6, 0.5, 0.1] },
        { position: [0.2, 0.1, 1.9], size: [1.6, 0.5, 0.1] },
        { position: [0.2, 0.72, 1.9], size: [1.6, 0.5, 0.1] },
        { position: [0.2, 1.34, 1.9], size: [1.6, 0.5, 0.1] },
        { position: [0, 0.1, 0.2], size: [0.1, 0.5, 1.6] },
        { position: [0, 0.72, 0.2], size: [0.1, 0.5, 1.6] },
        { position: [0, 1.34, 0.2], size: [0.1, 0.5, 1.6] },
        { position: [1.9, 0.1, 0.2], size: [0.1, 0.5, 1.6] },
        { position: [1.9, 0.72, 0.2], size: [0.1, 0.5, 1.6] },
        { position: [1.9, 1.34, 0.2], size: [0.1, 0.5, 1.6] },
        { position: [0, 1.84, 0], size: [2, 0.16, 2] },
      ],
      container: { pockets: [{ grid: [10, 10], handlingSimSeconds: 1.2 }] },
    } + takeApart(15, 4, 16),
    {
      id: 'wood_stove', name: 'Wood stove', size: [2, 3, 2], color: '#343536', material: 'steel',
      shape: [
        { position: [0.2, 0.25, 0.2], size: [1.6, 1.5, 1.6] },
        { position: [0.3, 0, 0.3], size: [0.2, 0.25, 0.2] },
        { position: [1.5, 0, 0.3], size: [0.2, 0.25, 0.2] },
        { position: [0.3, 0, 1.5], size: [0.2, 0.25, 0.2] },
        { position: [1.5, 0, 1.5], size: [0.2, 0.25, 0.2] },
        { position: [0.65, 1.75, 0.6], size: [0.7, 1.25, 0.7] },
        { position: [0.45, 0.55, 0.12], size: [1.1, 0.9, 0.08], color: '#17191a' },
        { position: [1.4, 0.8, 0.04], size: [0.12, 0.35, 0.08], color: '#a5a09a' },
      ],
    },
    {
      id: 'bed',
      name: 'Bed',
      size: [2, 1, 4],
      color: '#6f7f95',
      shape: [
        { position: [0.05, 0, 0.05], size: [0.12, 0.2, 0.12], color: '#5e4630' },
        { position: [1.83, 0, 0.05], size: [0.12, 0.2, 0.12], color: '#5e4630' },
        { position: [0.05, 0, 3.83], size: [0.12, 0.2, 0.12], color: '#5e4630' },
        { position: [1.83, 0, 3.83], size: [0.12, 0.2, 0.12], color: '#5e4630' },
        { position: [0.05, 0.2, 0.05], size: [1.9, 0.15, 3.83], color: '#7a5a3e' },
        { position: [0.04, 0.2, 3.88], size: [1.92, 0.8, 0.12], color: '#6a4d34' },
        { position: [0.04, 0.2, 0], size: [1.92, 0.4, 0.1], color: '#6a4d34' },
        { position: [0.1, 0.35, 0.1], size: [1.8, 0.22, 3.78], color: '#d9d4c6' },
        { position: [0.08, 0.57, 0.1], size: [1.84, 0.1, 2.5], color: '#6f7f95' },
        { position: [0.2, 0.57, 3.2], size: [0.75, 0.14, 0.6], color: '#ece9df' },
        { position: [1.05, 0.57, 3.2], size: [0.75, 0.14, 0.6], color: '#ece9df' },
      ],
      rest: { quality: 1, sleep: true },
    },
    {
      id: 'chair',
      name: 'Chair',
      size: [1, 2, 1],
      color: '#8b7355',
      wear: { from: 0, to: 0.7 },
      shape: [
        { position: [0.12, 0, 0.12], size: [0.16, 0.92, 0.16] },
        { position: [0.72, 0, 0.12], size: [0.16, 0.92, 0.16] },
        { position: [0.12, 0, 0.72], size: [0.16, 0.92, 0.16] },
        { position: [0.72, 0, 0.72], size: [0.16, 0.92, 0.16] },
        { position: [0.06, 0.9, 0.06], size: [0.88, 0.18, 0.88] },
        { position: [0.06, 1.06, 0.83], size: [0.88, 0.88, 0.11] },
      ],
      rest: { quality: 1 },
    } + takeApart(10, 3, 6),
    {
      id: 'sofa',
      name: 'Sofa',
      size: [4, 2, 2],
      color: '#66776d',
      wear: { from: 0.1, to: 0.7 },
      shape: [
        { position: [0.45, 0, 0], size: [3.1, 0.3, 2] },
        { position: [0.45, 0.3, 0], size: [1.52, 0.6, 1.5] },
        { position: [2.03, 0.3, 0], size: [1.52, 0.6, 1.5] },
        { position: [0.45, 0.3, 1.5], size: [3.1, 1.45, 0.5] },
        { position: [0, 0, 0], size: [0.45, 1.2, 2] },
        { position: [3.55, 0, 0], size: [0.45, 1.2, 2] },
      ],
      rest: { quality: 0.5, sleep: true },
    },
    woodDoor,
    woodDoor + {
      id: 'flimsy_wood_door', name: 'Flimsy wooden door',
      breach: { minimumStrength: 3.5, durability: 60 },
      door: woodDoor.door + {
        methods: woodDoor.door.methods + {
          pry: flimsyPry,
          hammer: woodDoor.door.methods.hammer + {
            timeSimSeconds: woodDoor.door.methods.hammer.timeSimSeconds * flimsyToWoodPryRatio,
            fastestTimeSimSeconds: woodDoor.door.methods.hammer.fastestTimeSimSeconds * flimsyToWoodPryRatio,
          },
        },
        // An interior door turns on a knob rather than a lever.
        detail: detail.panelled + {
          handle: { kind: 'knob', fromFreeEdge: 0.08, along: 0.48, length: 0.06, thickness: 0.02 },
        },
      },
    },
    woodDoor + {
      id: 'steel_armoury_door', name: 'Steel armoury door', color: '#626a70', material: 'steel',
      breach: { minimumStrength: 9, durability: 300 },
      door: woodDoor.door + {
        methods: {
          hammer: woodDoor.door.methods.hammer + { timeSimSeconds: 12, fastestTimeSimSeconds: 7 },
          cut: {
            quality: 'flame_cutting', level: 1, skill: 'mechanics',
            timeSimSeconds: 90, fastestTimeSimSeconds: 45,
            strikeIntervalSimSeconds: 1, strikeSound: 'lock_pry', fuel: 1,
          },
        },
        detail: detail.flush,
      },
    },
  ],
});
// Ladders and roof hatches (`packages/deadvox/DESIGN.md`, "Ladders and hatches"). A ladder is stacked one piece per
// layer, so one piece serves any height. A ladder up a roof edge reaches the roof's layer, so the climb ends with the
// feet level with the roof; one under a hatch ends below it, and the climber steps up through the open hatch.
local unshaped = [
  {
    id: 'ladder',
    name: 'Ladder',
    // Two cells wide, so the climber's body fits between its rails and up through a hatch.
    size: [2, 1, 1],
    color: '#7d7a72',
    solid: false,
    shape: [rail(0.1), rail(1.78), rung(0.2), rung(0.7)],
    climbable: { speedMetresPerSimSecond: 1.5 },
  },
  {
    id: 'roof_hatch',
    name: 'Roof hatch',
    // Deep enough along the ladder's facing for the climber's body, which the ladder holds on its centre line.
    size: [2, 1, 3],
    color: '#8d969a',
    material: 'steel',
    breach: { minimumStrength: 9, durability: 300 },
    door: { methods: {}, handlingSimSeconds: 0.8, hatch: true, detail: detail.hatch },
  },
  {
    id: 'key_box',
    name: 'Key box',
    size: [1, 1, 1],
    color: '#666666',
    appearance: { kind: 'door', surface: 'painted-metal' },
    container: { pockets: [{ name: 'Inside', grid: [2, 1], handlingSimSeconds: 0.2 }] },
  },
];
{
  furnitureMaterials: [
    {
      id: 'plastic', drops: { default: 'item_drop_wood' }, blowSound: 'door_bash',
      damaged: [
        { from: 0.01, tint: '#4a4a44', strength: 0.15 },
        { from: 0.4, tint: '#4a4a44', strength: 0.35 },
        { from: 0.75, tint: '#e8e4d0', strength: 0.4 },
      ],
    },
  ],
  furniture: breach.breakable(basics.furniture + unshaped),
}
