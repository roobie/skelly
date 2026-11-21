local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
// The look's whole prop: a free-standing plank post on a concrete pad, holding a short beam run and a short floor
// above the tester's eye. Both runs reach out from the post top within the timber span, so
// support holds them until the post breaks under them; the eye-height post cell below them is the one to break.
local empty = '......';
local postRow = ['..p...', empty, empty, empty, empty];
{
  templates: [{
    id: 'test_house_support_post',
    lootContext: { usage: ['Residential'], tier: 'Tier1' },
    size: [6, 8, 5],
    palette: {
      '.': 'air', k: 'concrete', p: 'plank_wall', f: 'plank_floor',
      C: { furniture: 'crate' },
      N: { groundLoot: { kind: 'fixed', items: [{ item: 'sample_note', count: 1 }] } },
    },
    layers: [
      ['kkkkkk', 'kkkkkk', 'kkkkkk', 'kkkkkk', 'kkkkkk'],
      ['..p.CC', '....CC', '..N...', empty, empty],
      ['..p.CC', '....CC', empty, empty, empty],
      postRow,
      postRow,
      postRow,
      ['..ppp.', '..f...', '..f...', empty, empty],
      [empty, empty, empty, empty, empty],
    ],
  }, {
    id: 'test_house_support_burial',
    lootContext: { usage: ['Residential'], tier: 'Tier1' },
    size: [5, 9, 5],
    palette: { '.': 'air', k: 'concrete', f: 'plank_floor' },
    layers: [
      ['kkkkk', 'kkkkk', 'kkkkk', 'kkkkk', 'kkkkk'],
      ['kkkkk', 'k...k', 'k...k', 'k...k', 'kkkkk'],
      ['.....', '.....', '.....', '.....', '.....'],
      ['.....', '.....', '.....', '.....', '.....'],
      ['.....', '.....', '.....', '.....', '.....'],
      ['.....', '.....', '.....', '.....', '.....'],
      ['.....', '.....', '.....', '.....', '.....'],
      ['.....', '.....', '.....', '.....', '.....'],
      ['.....', '.....', '..f..', '.....', '.....'],
    ],
  }],
  layouts: [layout + {
    id: 'testHouseSupportLook',
    buildings: layout.buildings + [
      { template: 'test_house_support_post', position: [-12, 20.5, 14], rotation: 0 },
    ],
    // Standing south of the post in its column, facing north, so the eye-height aim meets the post under the floor
    // run; an empty slot row lets the bearing apply.
    player: { position: [-10.75, 21, 16], bearing: 0 },
    showroom: layout.showroom + { slots: [] },
  }, layout + {
    id: 'testHouseSupportBuriedLook',
    buildings: layout.buildings + [
      { template: 'test_house_support_burial', position: [-12, 20.5, 14], rotation: 0 },
    ],
    player: { position: [-10.75, 21, 15.25], bearing: 0 },
    showroom: layout.showroom + { slots: [] },
  }],
}
