local base = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
local kit = import 'tools/jsonnet/lib/authored-site-kit.libsonnet';
local context = { usage: ['Residential'], tier: 'Tier1' };
local wall = [
  'bbbbb..bbb', 'b........b', 'b........b', 'b..bbbbbbb',
  'b........b', 'b........b', 'bbbbb..bbb', 'b........b',
  'b........b', 'b........b', 'b........b', 'b........b',
  'b........b', 'bbbbbbbbbb',
];
local modules = [
  'bbbbb..bbb', 'b........b', 'b........b', 'b..bbbbbbb',
  'b........b', 'b........b', 'bbbbb..bbb', 'b........b',
  'b........b', 'b........b', 'b........b', 'b.MM.....b',
  'b.MM.....b', 'bbbbbbbbbb',
];
local templates = [
  {
    id: 'instrument_fixture_deck', size: [32, 1, 12], lootContext: context,
    palette: { k: 'concrete' },
    layers: [[
      'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
      'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
      'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
      'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
      'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
      'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
    ]],
  },
  {
    id: 'instrument_fixture_dark_room', size: [10, 7, 14], lootContext: context,
    palette: { b: 'brick', k: 'concrete', '.': 'air', M: { furniture: 'instrument_fixture_fresh', facing: 'n', fixed: true } },
    layers: [
      ['kkkkkkkkkk' for _ in std.range(1, 14)],
      modules, modules, modules, modules, wall,
      ['bbbbbbbbbb' for _ in std.range(1, 14)],
    ],
  },
];
local row = [
  { id: 'fresh', x: -11 }, { id: 'worn', x: -9.5 }, { id: 'badly_damaged', x: -8 },
  { id: 'off', x: -5 }, { id: 'empty', x: -3.5 }, { id: 'ruined', x: -2 }, { id: 'failed', x: -6.5 },
];
local layout = base + {
  id: 'plantInstrumentsLook',
  terrain: [], water: [],
  player: { position: [-6, 21, -1.5], bearing: 180 },
  buildings: [
    { template: 'instrument_fixture_deck', position: [-12, 20.5, -3], rotation: 0 },
    { template: 'instrument_fixture_dark_room', position: [6, 20.5, -3], rotation: 0 },
  ],
  showroom: base.showroom + {
    capacity: 7,
    slots: [
      {
        furniture: 'instrument_fixture_' + entry.id, fixed: true,
        placement: { position: [entry.x, 21, 0], facing: 'n' },
      } + (if entry.id == 'ruined' then { wear: 1 } else {})
      for entry in row
    ],
  },
};
{
  templates: [template + { ownership: kit.piece(template).ownership } for template in templates],
  layouts: [layout, layout + { id: 'plantInstrumentsDarkLook', player: { position: [7.5, 21, 1], bearing: 180 }, showroom+: { slots: [] } }],
}
