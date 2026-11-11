local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
// The zigzag keeps the sky out of the room, so what lights it is its fixtures; through the zigzag is open noon.
local zigzag = [
  'bbbbbbbbb..bbb',
  'b............b',
  'b............b',
  'b....bbbbbbbbb',
  'b............b',
  'b............b',
  'bbbbbbbbb..bbb',
];
local open = 'b............b';
local room(fixtures) = zigzag + [open, open, open, open, open, open, fixtures, open, open, 'bbbbbbbbbbbbbb'];
local solid(block) = [std.join('', [block for _ in std.range(1, 14)]) for _ in std.range(1, 17)];
local lamp = room('b..L.........b');
local walls = room(open);
local tower = [['k'] for _ in std.range(1, 16)];
{
  templates: [{
    id: 'test_house_light_look',
    lootContext: { usage: ['Residential'], tier: 'Tier1' },
    size: [14, 8, 17],
    palette: {
      '.': 'air', k: 'concrete', b: 'brick',
      L: { furniture: 'electric_lamp', fixed: true },
      I: { furniture: 'lab_fixture', fixed: true },
    },
    layers: [solid('k'), lamp, lamp, lamp, walls, walls, room('b........II..b'), solid('b')],
  }, {
    id: 'test_house_sun_shadow_tower',
    lootContext: { usage: ['Residential'], tier: 'Tier1' },
    size: [1, 16, 1],
    palette: { k: 'concrete' },
    layers: tower,
  }],
  layouts: [layout + {
    id: 'testHouseLightLook',
    buildings: layout.buildings + [
      { template: 'test_house_light_look', position: [-6, 20.5, 8], rotation: 0 },
      { template: 'test_house_sun_shadow_tower', position: [27, 20.5, 12], rotation: 0 },
    ],
    actors: [{ type: 'shambler', position: [1, 21, 25.5], chance: 1 }],
    // An empty slot row lets the bearing apply, so the look opens facing both fixtures.
    showroom: layout.showroom + { slots: [] },
    player: { position: [1, 21, 27], bearing: 180 },
  }],
}
