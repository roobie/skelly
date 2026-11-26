local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
{
  templates: [{
    id: 'test_house_fall_drop',
    lootContext: { usage: ['Residential'], tier: 'Tier1' },
    size: [5, 5, 4],
    palette: { '.': 'air', p: 'plank_floor', C: { furniture: 'fall_drop_look_crate' } },
    layers: [
      ['.....', '.....', '.....', '.....'],
      ['p....', '.....', '.....', '.....'],
      ['C....', '.....', '.....', '.....'],
      ['C....', '.....', '.....', '.....'],
      ['.....', '.....', '.....', '.....'],
    ],
  }],
  layouts: [layout + {
    id: 'testHouseFallDropLook',
    buildings: layout.buildings + [
      { template: 'test_house_fall_drop', position: [-12, 20.5, 14], rotation: 0 },
    ],
    player: { position: [-10.75, 21, 16], bearing: 0 },
    showroom: layout.showroom + { slots: [] },
  }],
}
