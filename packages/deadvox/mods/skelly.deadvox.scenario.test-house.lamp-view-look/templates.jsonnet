local kit = import 'tools/jsonnet/lib/authored-site-kit.libsonnet';
local walls = [
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
local glazed = ['bbWWWbbbbbbbbbbb'] + walls[1:];
local floor = [
  'kkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkk',
  'kkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkk',
  'kkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkk',
];
local roof = [
  'bbbbbbbbbbbbbbbb', 'bbbbbbbbbbbbbbbb', 'bbbbbbbbbbbbbbbb', 'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbbb', 'bbbbbbbbbbbbbbbb', 'bbbbbbbbbbbbbbbb', 'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbbb', 'bbbbbbbbbbbbbbbb', 'bbbbbbbbbbbbbbbb', 'bbbbbbbbbbbbbbbb',
];
local room = {
  id: 'lamp_view_rooms', size: [16, 8, 12],
  lootContext: { usage: ['Residential'], tier: 'Tier1' },
  palette: {
    '.': 'air', b: 'brick', k: 'concrete',
    W: { furniture: 'clear_casement_window', facing: 'n', fixed: true },
  },
  layers: [floor, walls, glazed, glazed, glazed, walls, walls, roof],
};
local forecourtAir = [
  '................', '................', '................', '................', '................',
  '................', '................', '................', '................', '................',
];
local forecourtFloor = [
  'kkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkk',
  'kkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkk',
];
local spillWalls = forecourtAir + [
  'bbbbbbbbbb..bbbb',
  'b..............b', 'b..............b', 'b..............b', 'b..............b', 'b..............b',
  'b..............b', 'b..............b', 'b..............b', 'b..............b', 'b..............b',
  'bbbbbbbbbbbbbbbb',
];
local spillHead = forecourtAir + ['bbbbbbbbbbbbbbbb'] + spillWalls[11:];
local spillPedestal = spillWalls[:15] + ['b...b..........b'] + spillWalls[16:];
local spill = {
  id: 'lamp_view_spill', size: [16, 8, 22],
  lootContext: room.lootContext,
  palette: { '.': 'air', b: 'brick', k: 'concrete' },
  layers: [forecourtFloor + floor, spillPedestal, spillPedestal, spillWalls, spillWalls, spillHead, spillHead, forecourtAir + roof],
};
{ templates: [room + { ownership: kit.piece(room).ownership }, spill + { ownership: kit.piece(spill).ownership }] }
