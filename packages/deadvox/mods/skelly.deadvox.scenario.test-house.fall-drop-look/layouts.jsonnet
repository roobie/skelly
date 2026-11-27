local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
{
  templates: [{
    id: 'test_house_fall_drop',
    lootContext: { usage: ['Residential'], tier: 'Tier1' },
    size: [12, 8, 4],
    palette: {
      '.': 'air', p: 'plank_floor',
      C: { furniture: 'fall_drop_look_crate', items: [{ item: 'canned_beans', count: 1, placement: 'surface' }] },
    },
    layers: [
      ['............', '............', '............', '............'],
      ['..p.........', '.........p..', '............', '..p.........'],
      ['..p.........', '.........p..', '............', '..p.........'],
      ['..p.........', '.........p..', '............', '..p.........'],
      ['ppppp.......', 'ppppp....p..', 'ppppp.......', 'ppppp.......'],
      ['............', 'C........p..', '............', '............'],
      ['............', 'C........ppp', '............', '............'],
      ['............', '............', '............', '............'],
    ],
  }, {
    id: 'test_house_fall_drop_burial',
    lootContext: { usage: ['Residential'], tier: 'Tier1' },
    size: [5, 10, 5],
    palette: { '.': 'air', k: 'concrete', p: 'plank_floor' },
    layers: [
      ['kkkkk', 'kkkkk', 'kkkkk', 'kkkkk', 'kkkkk'],
      ['kkkkk', 'k...k', 'k...k', 'k...k', 'kkkkk'],
      ['.....', '.....', '.....', '.....', '.....'],
      ['.....', '.....', '.....', '.....', '.....'],
      ['.....', '.....', '.....', '.....', '.....'],
      ['.....', '.....', '.....', '.....', '.....'],
      ['.....', '.....', '.....', '.....', '.....'],
      ['.....', '.....', '.....', '.....', '.....'],
      ['.....', '.....', '..p..', '.....', '.....'],
      ['.....', '.....', '..p..', '.....', '.....'],
    ],
  }],
  layouts: [layout + {
    id: 'testHouseFallDropLook',
    buildings: layout.buildings + [
      { template: 'test_house_fall_drop', position: [-12, 20.5, 14], rotation: 0 },
      { template: 'test_house_fall_drop_burial', position: [-5, 20.5, 14], rotation: 0 },
    ],
    player: { position: [-10.75, 23, 14.75], bearing: 270 },
    showroom: layout.showroom + { slots: [] },
    actors: [{ type: 'shambler', position: [-3.75, 21, 15.25], chance: 1 }],
  }],
}
