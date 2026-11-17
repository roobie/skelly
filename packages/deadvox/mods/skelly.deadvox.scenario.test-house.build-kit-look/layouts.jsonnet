local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
// The build kit staged as already built, on the lot's open ground: a plank floor, a plank wall with a walk-through gap,
// an improvised door boarded on the room side, a bare window-frame opening (sill, gap, lintel) waiting for a cover,
// and a shelf, with the tools and stock beside the spawn. Placing by play waits for the spot-picking work, so every
// piece stands here ready to look at, open, refuse and take apart.
local air = '..........';
local wall = {
  low: 'p...DDpppp',
  frame: 'p...DDp==p',
  open: 'p...DDp..p',
};
{
  templates: [{
    id: 'test_house_build_kit',
    lootContext: { usage: ['Residential'], tier: 'Tier1' },
    size: [10, 5, 7],
    palette: {
      '.': 'air',
      f: 'plank_floor',
      p: 'plank_wall',
      '=': 'window_frame',
      // Boards on the front, the room side; their side stays explicit for the look, while the three-cell wall gap keeps the room walk-through.
      D: {
        furniture: 'improvised_wood_door',
        facing: 's',
        boarding: { type: 'wood_door_boarding', side: 'front' },
      },
      S: { furniture: 'shelf', facing: 's' },
      C: {
        furniture: 'crate',
        facing: 's',
        items: [
          { item: 'hammer', placement: 'surface' },
          { item: 'hand_saw', placement: 'surface' },
          { item: 'repair_kit', placement: 'surface' },
          { item: 'nails', count: 100, placement: 'surface' },
          { item: 'hinge_set', count: 2, placement: 'surface' },
        ],
      },
      B: { furniture: 'board_stack', facing: 'n', items: [{ item: 'wooden_plank', count: 18 }] },
    },
    layers: [
      ['ffffffffff' for _ in std.range(1, 7)],
      [wall.low, air, '.......BB.', '.......BB.', '.......BB.', '....CC.BB.', 'SS..CC....'],
      [wall.frame, air, air, air, air, '....CC....', 'SS..CC....'],
      [wall.open, air, air, air, air, air, 'SS........'],
      [wall.frame, air, air, air, air, air, 'SS........'],
    ],
  }],
  layouts: [layout + {
    id: 'testHouseBuildKitLook',
    buildings: layout.buildings + [
      { template: 'test_house_build_kit', position: [-12, 20.5, 14], rotation: 0 },
    ],
    // In the room, in metres where its cells are half-metre blocks, facing the boarded door and the window opening
    // in the north wall; an empty slot row lets the bearing apply.
    player: { position: [-10.25, 21, 15.75], bearing: 0 },
    showroom: layout.showroom + { slots: [] },
  }],
}
