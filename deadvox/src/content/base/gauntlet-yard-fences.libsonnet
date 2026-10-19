local context = { usage: ['Medical'], tier: 'Tier1' };
local front = {
  id: 'medical_front_fence', size: [21, 6, 1], lootContext: context,
  palette: { '.': { ground: true }, f: 'chain_link' },
  layers: [['.....................']] + [['ffffffff.....ffffffff'] for y in std.range(1, 5)],
};
local east = {
  id: 'medical_east_fence', size: [23, 6, 1], lootContext: context,
  palette: front.palette,
  layers: [['.......................']] + [['ffffff...ffffffffffffff'] for y in std.range(1, 5)],
};
{
  front: front,
  east: east,
  west: east + {
    id: 'medical_west_fence',
    layers: [['.......................']] + [['ffffffffffffff...ffffff'] for y in std.range(1, 5)],
  },
}
