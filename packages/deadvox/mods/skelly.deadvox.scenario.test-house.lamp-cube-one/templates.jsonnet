local kit = import 'tools/jsonnet/lib/authored-site-kit.libsonnet';
local walls = [
  'bbbbbbbbbbbbbbbb',
  'b.......b......b',
  'b.......b......b',
  'b.......b......b',
  'b.......b......b',
  'b.......D......b',
  'b.......D......b',
  'b.......b......b',
  'b.......b......b',
  'b.......b......b',
  'b.......b......b',
  'bbbbbbbbbbbbbbbb',
];
local lintel = [
  'bbbbbbbbbbbbbbbb',
  'b.......b......b',
  'b.......b......b',
  'b.......b......b',
  'b.......b......b',
  'b.......b......b',
  'b.......b......b',
  'b.......b......b',
  'b.......b......b',
  'b.......b......b',
  'b.......b......b',
  'bbbbbbbbbbbbbbbb',
];
local strips = [
  'bbbbbbbbbbbbbbbb',
  'b.......b......b',
  'b.......b......b',
  'b..II...b..II..b',
  'b.......b......b',
  'b.......b......b',
  'b.......b......b',
  'b.......b......b',
  'b..II...b..II..b',
  'b.......b......b',
  'b.......b......b',
  'bbbbbbbbbbbbbbbb',
];
local raw = {
  id: 'test_house_lamp_cube_room', size: [16, 8, 12],
  lootContext: { usage: ['Residential'], tier: 'Tier1' },
  palette: {
    '.': 'air', b: 'brick', k: 'concrete',
    D: { furniture: 'wood_door', facing: 'e' },
    I: { furniture: 'lab_fixture', fixed: true },
  },
  layers: [
    ['kkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkk',
     'kkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkk',
     'kkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkk'],
    walls, walls, walls, walls, lintel, strips,
    ['bbbbbbbbbbbbbbbb', 'bbbbbbbbbbbbbbbb', 'bbbbbbbbbbbbbbbb', 'bbbbbbbbbbbbbbbb',
     'bbbbbbbbbbbbbbbb', 'bbbbbbbbbbbbbbbb', 'bbbbbbbbbbbbbbbb', 'bbbbbbbbbbbbbbbb',
     'bbbbbbbbbbbbbbbb', 'bbbbbbbbbbbbbbbb', 'bbbbbbbbbbbbbbbb', 'bbbbbbbbbbbbbbbb'],
  ],
};
local dark = raw + { layers: [[std.strReplace(row, 'I', '.') for row in layer] for layer in raw.layers] };
{
  templates: [
    dark + { ownership: kit.piece(dark).ownership },
    raw + { id: 'test_house_lamp_cube_strips', ownership: kit.piece(raw).ownership },
  ],
}
