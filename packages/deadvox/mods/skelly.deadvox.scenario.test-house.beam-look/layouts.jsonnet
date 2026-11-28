local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
local palette = { '.': 'air', k: 'concrete', s: 'steel_beam_x', d: 'slab_deck', m: 'beam_look_marker' };
local narrowWall = [
  'k.....................k', 'k.....................k', 'k.....................k', 'k.....................k',
  'k.....................k', 'k.....................k', 'k.....................k',
];
local wideWall = [
  'k......................k', 'k......................k', 'k......................k', 'k......................k',
  'k......................k', 'k......................k', 'k......................k',
];
{
  templates: [{
    id: 'test_house_beam_limit',
    lootContext: { usage: ['Residential'], tier: 'Tier1' },
    size: [23, 9, 7],
    palette: palette,
    layers: [
      ['kkkkkkkkkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkkkkkkkkk',
       'kkkkkkkkkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkkkkkkkkk'],
      narrowWall, narrowWall, narrowWall, narrowWall, narrowWall, narrowWall,
      ['k.....................k', 'ksssssssssssssssssssssk', 'k.....................k', 'ksssssssssssssssssssssk',
       'k.....................k', 'ksssssssssssssssssssssk', 'k.....................k'],
      ['ddddddddddddddddddddddd', 'ddddddddddddddddddddddd', 'ddddddddddddddddddddddd', 'ddddddddddddddddddddddd',
       'ddddddddddddddddddddddd', 'ddddddddddddddddddddddd', 'ddddddddddddddddddddddd'],
    ],
  }, {
    id: 'test_house_beam_over_limit',
    lootContext: { usage: ['Residential'], tier: 'Tier1' },
    size: [24, 9, 7],
    palette: palette,
    layers: [
      ['kkkkkkkkkkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkkkkkkkkkk',
       'kkkkkkkkkkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkkkkkkkkkk'],
      wideWall, wideWall, wideWall, wideWall, wideWall, wideWall,
      ['k......................k', 'kssssssssssssssssssssssk', 'k......................k', 'mssssssssssssssssssssssk',
       'k......................k', 'kssssssssssssssssssssssk', 'k......................k'],
      ['dddddddddddddddddddddddd', 'dddddddddddddddddddddddd', 'dddddddddddddddddddddddd', 'dddddddddddddddddddddddd',
       'dddddddddddddddddddddddd', 'dddddddddddddddddddddddd', 'dddddddddddddddddddddddd'],
    ],
  }],
  layouts: [layout + {
    id: 'testHouseBeamLook',
    buildings: layout.buildings + [
      { template: 'test_house_beam_limit', position: [-14, 20.5, 14], rotation: 0 },
      { template: 'test_house_beam_over_limit', position: [1, 20.5, 14], rotation: 0 },
    ],
    // Flat ground gives the reviewer a clear, supported view of both full-width bays.
    terrain: [], water: [], woodlands: [],
    player: { position: [-0.75, 21, 33], bearing: 0 },
    showroom: layout.showroom + { slots: [] },
  }],
}
