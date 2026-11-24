local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
// A crate at the outer edge has a raised plank floor below it and open air beyond it, so one push shows the landing.
{
  templates: [{
    id: 'test_house_furniture_push',
    lootContext: { usage: ['Residential'], tier: 'Tier1' },
    size: [5, 5, 4],
    palette: { '.': 'air', p: 'plank_floor', C: { furniture: 'crate' } },
    layers: [
      ['.....', '.....', '.....', '.....'],
      ['pp...', 'pp...', '.....', '.....'],
      ['CC...', 'CC...', '.....', '.....'],
      ['CC...', 'CC...', '.....', '.....'],
      ['.....', '.....', '.....', '.....'],
    ],
  }],
  layouts: [layout + {
    id: 'testHouseFurniturePushLook',
    buildings: layout.buildings + [
      { template: 'test_house_furniture_push', position: [-12, 20.5, 14], rotation: 0 },
    ],
    player: { position: [-10.75, 21, 16], bearing: 0 },
    showroom: layout.showroom + { slots: [] },
  }],
}
