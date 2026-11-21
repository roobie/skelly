local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
// The window covers side by side in one wall of a closed plank room, with a lamp lit inside and the spawn in the yard
// outside: bare glass, wooden boards, the sheet panel on battens, and a closed curtain on the room side. At night the
// lamp shows through the bare glass and through the curtain once it is opened, while boards and panel stay dark. The
// curtain hangs behind its glass, so it is aimed at and worked from the room, entered by its south door. The tools and
// stock for every cover stand in the yard. Placing by play waits for the spot-picking work, so the covers
// stand here already fitted.
local air = '.................';
local wall = 'ppppppppppppppppp';
local windows = 'pGGGpWWWpPPPpTTTp';
local side = 'p...............p';
local yard = {
  low: ['CC..KKK......BB..', 'CC..KKK......BB..', '....KKK......BB..', '.............BB..', air],
  high: ['CC...............', 'CC...............', air, air, air],
};
local room(north, door) = [north, side, side, side, side, side, door];
local window(furniture) = { furniture: 'clear_casement_window', facing: 'n', fixed: true } + furniture;
{
  templates: [{
    id: 'test_house_window_kit',
    lootContext: { usage: ['Residential'], tier: 'Tier1' },
    size: [17, 7, 12],
    palette: {
      '.': 'air',
      f: 'plank_floor',
      p: 'plank_wall',
      // A north-facing window's front is the yard, and its back, the latch side, is the room.
      G: window({}),
      W: window({ boarding: { type: 'wood_window_boarding', side: 'front' } }),
      P: window({ boarding: { type: 'sheet_window_panel', side: 'front' } }),
      T: window({ boarding: { type: 'window_curtain', side: 'back' } }),
      D: { furniture: 'improvised_wood_door', facing: 's' },
      C: {
        furniture: 'crate',
        facing: 's',
        items: [
          { item: 'hammer', placement: 'surface' },
          { item: 'hand_saw', placement: 'surface' },
          { item: 'nails', count: 100, placement: 'surface' },
          { item: 'rag', count: 6, placement: 'surface' },
          { item: 'rag', count: 6, placement: 'surface' },
          { item: 'nylon_cord', count: 2, placement: 'surface' },
        ],
      },
      K: { furniture: 'sheet_metal_stack', facing: 'n', items: [{ item: 'sheet_metal', count: 4 }] },
      B: { furniture: 'board_stack', facing: 'n', items: [{ item: 'wooden_plank', count: 18 }] },
    },
    layers: [
      ['fffffffffffffffff' for _ in std.range(1, 12)],
      yard.low + room(wall, 'p......DD.......p'),
      yard.high + room(windows, 'p......DD.......p'),
      [air for _ in std.range(1, 5)] + room(windows, 'p......DD.......p'),
      [air for _ in std.range(1, 5)] + room(windows, 'p......DD.......p'),
      [air for _ in std.range(1, 5)] + room(wall, wall),
      [air for _ in std.range(1, 5)] + ['fffffffffffffffff' for _ in std.range(1, 7)],
    ],
  }],
  layouts: [layout + {
    id: 'testHouseWindowKitLook',
    buildings: layout.buildings + [
      { template: 'test_house_window_kit', position: [-12, 20.5, 14], rotation: 0 },
    ],
    // In the yard, in metres where its cells are half-metre blocks, facing the four windows in the room's north wall;
    // an empty slot row lets the bearing apply.
    player: { position: [-7.75, 21, 15.75], bearing: 180 },
    showroom: layout.showroom + { slots: [] },
  }],
}
