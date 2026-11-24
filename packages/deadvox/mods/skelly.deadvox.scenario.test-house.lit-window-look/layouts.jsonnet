local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
// A closed plank room with one bare window in its north wall, a lamp lit inside by the start, and a shambler in the
// yard in view of the window. The player stands in the yard facing the window, so each cover fitted over it changes
// whether the shambler is drawn to the lamp. The door at the far end of the room lets the curtain be reached from
// its own face. Placing a cover waits for the spot-picking work, so the player fits it with the kit at their feet.
local air = '.................';
local wall = 'ppppppppppppppppp';
local windows = 'pppppppGGGppppppp';
local side = 'p...............p';
local door = 'p......DD.......p';
local yard = {
  low: [air, '.....z...........', air, air, air],
  high: [air, air, air, air, air],
};
local room(north, south=door) = [north, side, side, side, side, side, south];
{
  templates: [{
    id: 'test_house_lit_window',
    lootContext: { usage: ['Residential'], tier: 'Tier1' },
    size: [17, 7, 12],
    palette: {
      '.': 'air',
      f: 'plank_floor',
      p: 'plank_wall',
      // A north-facing window's front is the yard, and its back, the latch side, is the room.
      G: { furniture: 'clear_casement_window', facing: 'n', fixed: true },
      D: { furniture: 'improvised_wood_door', facing: 's' },
      z: { spawn: 'shambler' },
    },
    layers: [
      ['fffffffffffffffff' for _ in std.range(1, 12)],
      yard.low + room(wall),
      yard.high + room(windows),
      [air for _ in std.range(1, 5)] + room(windows),
      [air for _ in std.range(1, 5)] + room(windows),
      [air for _ in std.range(1, 5)] + room(wall, wall),
      [air for _ in std.range(1, 5)] + ['fffffffffffffffff' for _ in std.range(1, 7)],
    ],
  }],
  layouts: [layout + {
    id: 'testHouseLitWindowLook',
    buildings: layout.buildings + [
      { template: 'test_house_lit_window', position: [-12, 20.5, 14], rotation: 0 },
    ],
    // In the yard, in metres where its cells are half-metre blocks, facing the window in the room's north wall.
    player: { position: [-7.75, 21, 15.75], bearing: 180 },
    showroom: layout.showroom + { slots: [] },
  }],
}
