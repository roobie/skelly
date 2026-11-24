local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
local empty = '.......';
{
  templates: [{
    id: 'test_house_actor_breach',
    lootContext: { usage: ['Residential'], tier: 'Tier1' },
    size: [7, 4, 5],
    palette: { '.': 'air', k: 'concrete', t: 'plank_wall', m: 'brick' },
    layers: [
      ['kkkkkkk', 'kkkkkkk', 'kkkkkkk', 'kkkkkkk', 'kkkkkkk'],
      [empty, '..t.m..', empty, empty, empty],
      [empty, '..t.m..', empty, empty, empty],
      [empty, '..t.m..', empty, empty, empty],
    ],
  }],
  layouts: [layout + {
    id: 'testHouseActorBreachLook',
    buildings: layout.buildings + [{ template: 'test_house_actor_breach', position: [-12, 20.5, 14], rotation: 0 }],
    actors: [
      { type: 'shambler', position: [-10.75, 21, 15.5], chance: 1 },
      { type: 'brute_shambler', position: [-8.75, 21, 15.5], chance: 1 },
    ],
    player: { position: [-10, 21, 13.5], bearing: 0 },
    showroom: layout.showroom + { slots: [] },
  }],
}
