// The fixed-lamp look's site: the base test-house plus one lit hut south-east of the showroom deck. The hut holds
// the power trio — generator, main breaker, lamp — behind two south windows: the west one clear, the east one
// boarded, so the lamp is visible and a lure through one cover and not the other. Two shamblers wait on the deck,
// one before each window; the one with the clear view is drawn in, the one behind the boards is not. The player
// stands behind the lamp with the breaker in reach: flipping it ends the lure.
local base = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];

local deck = [std.join('', ['f' for _ in std.range(1, 16)]) for _ in std.range(1, 16)];
local wall = '..pppppppppppp..';
local room = '..p..........p..';
local doorway = '..p.............';
local southClear = '..p.WWWp.BBB.p..';
local deckEdge = '................';
local shamblers = '.....z.....z....';
local roof = '..ffffffffffff..';
local hutFloorFurniture = [
  deckEdge,
  deckEdge,
  wall,
  '..p.UU.....J.p..',
  '..p.UU.......p..',
  room,
  '..p.....L....p..',
  doorway,
  doorway,
  room,
  room,
  room,
  southClear,
  deckEdge,
  shamblers,
  deckEdge,
];
local hutUpper = [
  deckEdge,
  deckEdge,
  wall,
  '..p.UU.....J.p..',
  '..p.UU.......p..',
  room,
  '..p.....L....p..',
  doorway,
  doorway,
  room,
  room,
  room,
  southClear,
  deckEdge,
  deckEdge,
  deckEdge,
];
local hutLampTop = [
  deckEdge,
  deckEdge,
  wall,
  room,
  room,
  room,
  '..p.....L....p..',
  doorway,
  doorway,
  room,
  room,
  room,
  southClear,
  deckEdge,
  deckEdge,
  deckEdge,
];
local hutHeader = [
  deckEdge,
  deckEdge,
  wall,
  room,
  room,
  room,
  room,
  room,
  room,
  room,
  room,
  room,
  wall,
  deckEdge,
  deckEdge,
  deckEdge,
];
local hutRoof = [
  deckEdge,
  deckEdge,
  roof,
  roof,
  roof,
  roof,
  roof,
  roof,
  roof,
  roof,
  roof,
  roof,
  roof,
  deckEdge,
  deckEdge,
  deckEdge,
];

{
  templates: [{
    id: 'test_house_fixed_lamp_look',
    lootContext: { usage: ['Residential'], tier: 'Tier1' },
    size: [16, 6, 16],
    palette: {
      '.': 'air', f: 'plank_floor', p: 'plank_wall',
      W: { furniture: 'clear_casement_window', facing: 's', fixed: true },
      B: {
        furniture: 'broken_casement_window', facing: 's', fixed: true,
        boarding: { side: 'front', type: 'wood_window_boarding' },
      },
      L: { furniture: 'electric_lamp', fixed: true },
      J: { furniture: 'main_breaker', fixed: true },
      U: { furniture: 'fuel_generator', fixed: true },
      z: { spawn: 'shambler' },
    },
    layers: [deck, hutFloorFurniture, hutUpper, hutLampTop, hutHeader, hutRoof],
  }],
  layouts: [base + {
    id: 'testHouseFixedLampLook',
    buildings: base.buildings + [
      { template: 'test_house_fixed_lamp_look', position: [-12, 20.5, 14], rotation: 0 },
    ],
    player: { position: [-6, 21, 16.5], bearing: 180 },
    showroom: base.showroom + { slots: [] },
  }],
}
