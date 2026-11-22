local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
// Placement picking by play: the room in the build-kit look stands again with nothing built that picking builds —
// the doorway's leaf carries no boards, the wall gap stays open and the window frame bare — while one occupied spot
// (the shelf) and the stock crate stand where a ghost must read refused. Every built piece of the build-kit look
// stays there; this room is the same shell with its openings waiting.
local air = '..........';
local wall = {
  low: 'p...DDpppp',
  frame: 'p...DDp==p',
  open: 'p...DDp..p',
};
{
  templates: [{
    id: 'test_house_placement',
    lootContext: { usage: ['Residential'], tier: 'Tier1' },
    size: [10, 5, 7],
    palette: {
      '.': 'air',
      f: 'plank_floor',
      p: 'plank_wall',
      '=': 'window_frame',
      // Unboarded, so boarding starts from its hold ring and the ghost draws on the face that faces the player.
      D: { furniture: 'improvised_wood_door', facing: 's' },
      // The occupied spot: a shelf stands where a wall or floor ghost must read refused.
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
    id: 'testHousePlacementLook',
    buildings: layout.buildings + [
      { template: 'test_house_placement', position: [-12, 20.5, 14], rotation: 0 },
    ],
    // In the room, in metres where its cells are half-metre blocks, facing the doorway, the wall gap and the
    // occupied shelf; an empty slot row lets the bearing apply.
    player: { position: [-10.25, 21, 15.75], bearing: 0 },
    showroom: layout.showroom + { slots: [] },
  }],
}
