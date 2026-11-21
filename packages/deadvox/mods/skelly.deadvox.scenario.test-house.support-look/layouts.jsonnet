local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
// The look's whole prop: a free-standing plank post on a concrete pad, holding a short beam run and a short floor
// at its top, one layer above the tester's eye. Both runs reach out from the post top within the timber span, so
// support holds them until the post breaks under them; the eye-height post cell below them is the one to break.
local empty = '.....';
local postRow = ['..p..', empty, empty, empty, empty];
{
  templates: [{
    id: 'test_house_support_post',
    lootContext: { usage: ['Residential'], tier: 'Tier1' },
    size: [5, 7, 5],
    palette: { '.': 'air', k: 'concrete', p: 'plank_wall', f: 'plank_floor' },
    layers: [
      ['kkkkk', 'kkkkk', 'kkkkk', 'kkkkk', 'kkkkk'],
      postRow,
      postRow,
      postRow,
      postRow,
      ['..ppp', '..f..', '..f..', empty, empty],
      [empty, empty, empty, empty, empty],
    ],
  }],
  layouts: [layout + {
    id: 'testHouseSupportLook',
    buildings: layout.buildings + [
      { template: 'test_house_support_post', position: [-12, 20.5, 14], rotation: 0 },
    ],
    // Standing south of the post in its column, facing north, so the eye-height aim meets the post under the floor
    // run; an empty slot row lets the bearing apply.
    player: { position: [-10.75, 21, 15.5], bearing: 0 },
    showroom: layout.showroom + { slots: [] },
  }],
}
