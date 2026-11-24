local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
local empty = '.........';
{
  templates: [{
    id: 'test_house_blast_range',
    lootContext: { usage: ['Residential'], tier: 'Tier1' },
    size: [9, 5, 7],
    palette: {
      '.': 'air', k: 'concrete', t: 'plank_wall', m: 'concrete', C: { furniture: 'crate' },
    },
    layers: [
      ['kkkkkkkkk', 'kkkkkkkkk', 'kkkkkkkkk', 'kkkkkkkkk', 'kkkkkkkkk', 'kkkkkkkkk', 'kkkkkkkkk'],
      [empty, empty, '...t.m...', '...t.mCC.', '...t.mCC.', empty, empty],
      [empty, empty, '...t.m...', '...t.mCC.', '...t.mCC.', empty, empty],
      [empty, empty, '...t.m...', '...t.m...', '...t.m...', empty, empty],
      [empty, empty, empty, empty, empty, empty, empty],
    ],
  }],
  layouts: [layout + {
    id: 'testHouseBlastLook',
    buildings: layout.buildings + [
      { template: 'test_house_blast_range', position: [-12, 20.5, 14], rotation: 0 },
    ],
    player: { position: [-10.75, 21, 16], bearing: 0 },
    showroom: layout.showroom + { slots: [] },
  }],
}
