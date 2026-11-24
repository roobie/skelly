local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
local empty = '.......';
{
  templates: [{
    id: 'test_house_actor_breach',
    lootContext: { usage: ['Residential'], tier: 'Tier1' },
    size: [7, 5, 5],
    palette: { '.': 'air', k: 'concrete', t: 'plank_wall', m: 'brick' },
    layers: [
      ['kkkkkkk', 'kkkkkkk', 'kkkkkkk', 'kkkkkkk', 'kkkkkkk'],
      [empty, empty, 'ttt.mmm', empty, empty],
      [empty, empty, 'ttt.mmm', empty, empty],
      [empty, empty, 'ttt.mmm', empty, empty],
      [empty, empty, 'ttt....', empty, empty],
    ],
  }],
  layouts: [layout + {
    id: 'testHouseActorBreachLook',
    buildings: layout.buildings + [{ template: 'test_house_actor_breach', position: [-12, 20.5, 14], rotation: 0 }],
    actors: [
      { type: 'shambler', position: [-11.25, 21, 16], chance: 1 },
      { type: 'brute_shambler', position: [-9.25, 21, 16], chance: 1 },
    ],
    player: { position: [-10.25, 21, 14.25], bearing: 0 },
    showroom: layout.showroom + { slots: [] },
  }],
}
