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
  }],
  layouts: [layout + {
    id: 'testHouseFallDropLook',
    buildings: layout.buildings + [
      { template: 'test_house_fall_drop', position: [-12, 20.5, 14], rotation: 0 },
    ],
    player: { position: [-10.75, 23, 14.75], bearing: 270 },
    showroom: layout.showroom + { slots: [] },
  }],
}
