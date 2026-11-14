local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
local booth = std.filter(function(t) t.id == 'test_house_reading_booth',
  (import '../skelly.deadvox.scenario.test-house/templates-test-house.jsonnet').templates)[0];
local walls = [
  'bbbbb..b', 'b......b', 'b......b', 'b..bbbbb',
  'b......b', 'b......b', 'bbbbb..b', 'b......b', 'b......b',
  'b......b', 'b......b', 'bbbbbbbb',
];
local lamps = [
  'bbbbb..b', 'bL....Lb', 'b......b', 'b..bbbbb',
  'b......b', 'b......b', 'bbbbb..b', 'b......b', 'b......b',
  'b......b', 'b......b', 'bbbbbbbb',
];
{
  templates: [
    local template = {
      id: 'test_house_item_light_booth', size: booth.size, lootContext: booth.lootContext,
      palette: { '.': 'air', k: 'concrete', b: 'brick', L: { furniture: 'electric_lamp', fixed: true } },
      layers: [booth.layers[0], lamps, lamps, lamps, walls, walls, booth.layers[6]],
    };
    template + { ownership: (import 'tools/jsonnet/lib/authored-site-kit.libsonnet').piece(template).ownership },
  ],
  layouts: [layout + {
    buildings: [
      if b.template == 'test_house_reading_booth' then b + { template: 'test_house_item_light_booth' } else b
      for b in layout.buildings
    ],
    id: 'testHouseItemLightLook',
    player: { position: [2.5, 21, -10.75], bearing: 180 },
    showroom: layout.showroom + { slots: [] },
  }],
}
