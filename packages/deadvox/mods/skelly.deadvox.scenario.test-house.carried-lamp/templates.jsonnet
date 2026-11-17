local kit = import 'tools/jsonnet/lib/authored-site-kit.libsonnet';
// A windowless room: the west doorway lets the sky into the front room, and the partition keeps it out of the back.
local walls = [
  'bbbbbbbbbbbb',
  'b..........b',
  'b..........b',
  '...........b',
  '...........b',
  '...........b',
  'b..........b',
  'bbbbbbbb..bb',
  'b..........b',
  'b..........b',
  'b..........b',
  'b..........b',
  'b..........b',
  'b..........b',
  'b..........b',
  'bbbbbbbbbbbb',
];
local lintel = [
  'bbbbbbbbbbbb',
  'b..........b',
  'b..........b',
  'b..........b',
  'b..........b',
  'b..........b',
  'b..........b',
  'bbbbbbbbbbbb',
  'b..........b',
  'b..........b',
  'b..........b',
  'b..........b',
  'b..........b',
  'b..........b',
  'b..........b',
  'bbbbbbbbbbbb',
];
local slab(block) = [std.join('', [block for _ in std.range(1, 12)]) for _ in std.range(1, 16)];
local room = {
  id: 'test_house_carried_lamp_room', size: [12, 8, 16],
  lootContext: { usage: ['Residential'], tier: 'Tier1' },
  palette: { '.': 'air', b: 'brick', k: 'concrete' },
  layers: [slab('k'), walls, walls, walls, walls, lintel, lintel, slab('b')],
};
{ templates: [room + { ownership: kit.piece(room).ownership }] }
