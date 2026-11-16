local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
local air = '................';
local partition = 'pWWWWpBBBBp....p';
local room = [air, air, air, partition, air, air, air, air, air];
{
  templates: [{
    id: 'test_house_window_look',
    lootContext: { usage: ['Residential'], tier: 'Tier1' },
    size: [16, 6, 9],
    palette: {
      '.': 'air', p: 'plank_wall', f: 'plank_floor',
      W: { furniture: 'clear_hinged_window', facing: 'n', fixed: true },
      B: { furniture: 'broken_hinged_window', facing: 'n', fixed: true },
      G: { groundLoot: { kind: 'fixed', items: [{ item: 'glass_shards', count: 2 }] } },
    },
    layers: [
      ['ffffffffffffffff', 'ffffffffffffffff', 'ffffffffffffffff',
       'ffffffffffffffff', 'ffffffffffffffff', 'ffffffffffffffff',
       'ffffffffffffffff', 'ffffffffffffffff', 'ffffffffffffffff'],
      [air, air, air, partition, air, air, '.......G........', air, air],
      room, room, room, room,
    ],
  }],
  layouts: [layout + {
    id: 'testHouseWindowLook',
    buildings: layout.buildings + [
      { template: 'test_house_window_look', position: [-12, 20.5, 14], rotation: 0 },
    ],
    player: { position: [-10.5, 21, 16.75], bearing: 0 },
    showroom: layout.showroom + { slots: [] },
  }],
}
