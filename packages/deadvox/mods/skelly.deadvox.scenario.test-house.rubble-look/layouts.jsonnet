local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
// Rubble and brick share a reachable eye-height row so both world-work entries need no walk or setup.
local air = ['.....', '.....', '.....', '.....', '.....'];
{
  templates: [{
    id: 'test_house_rubble_heap',
    lootContext: { usage: ['Residential'], tier: 'Tier1' },
    size: [5, 6, 5],
    palette: { '.': 'air', k: 'concrete', r: 'masonry_rubble', b: 'brick' },
    layers: [
      ['kkkkk', 'kkkkk', 'kkkkk', 'kkkkk', 'kkkkk'],
      ['rrrrr', 'rr...', '.....', '.....', '.....'],
      ['rrrrr', 'r....', '.....', '.....', '.....'],
      ['rrrrr', '.....', '.....', '.....', '.....'],
      ['rrrbr', '.....', '.....', '.....', '.....'],
      air,
    ],
  }],
  layouts: [layout + {
    id: 'testHouseRubbleLook',
    buildings: layout.buildings + [
      { template: 'test_house_rubble_heap', position: [-12, 20.5, 14], rotation: 0 },
    ],
    // Standing south of the heap, facing its eye-height row; an empty slot row lets the bearing apply. A body
    // that spawns touching the heap is lifted clear of it, which puts the eye inside the heap's air.
    player: { position: [-10.75, 21, 15.5], bearing: 0 },
    showroom: layout.showroom + { slots: [] },
  }],
}
