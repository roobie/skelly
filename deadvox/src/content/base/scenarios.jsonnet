local look = import 'gauntlet-look.jsonnet';
local service = look.templates[0];
local ground = service.access.storeys[0].floor - 1;
local cells = function(marker) [
  [x, y, z]
  for y in std.range(0, service.size[1] - 1)
  for z in std.range(0, service.size[2] - 1)
  for x in std.range(0, service.size[0] - 1)
  if std.substr(service.layers[y][z], x, 1) == marker
];
local lowest = function(points)
  assert std.length(points) > 0 : 'Prototype service needs its portal markers';
  [std.foldl(std.min, [p[axis] for p in points], points[0][axis]) for axis in std.range(0, 2)];
local hatch = lowest(cells('T'));
local ladder = lowest(cells('H'));
{
  scenarios: [{
    id: 'gauntlet', kind: 'gauntlet',
    body: 'player', compression: 'player',
    serviceTemplate: service.id,
    portal: {
      hatch: 'T', ladder: 'H',
      upper: [hatch[0] + 4, ground + 1, hatch[2] + 1],
      lower: [hatch[0], ladder[1], hatch[2] + 1],
    },
    city: {
      blocksX: 1, blocksZ: 1,
      street: 12, blockX: 72, blockZ: 64,
      pad: 2, gap: 2, blend: 24,
      templates: ['small_house', 'shed', 'workshop_hall'],
    },
  }],
}
