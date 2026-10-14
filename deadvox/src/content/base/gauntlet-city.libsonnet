local building = function(storeys)
  local roof = storeys * 8;
  local cell = function(x, y, z)
    if y == 0 then '='
    else if x == 16 && z >= 10 && z <= 11 && y < roof then 'H'
    else if x >= 16 then '.'
    else if y % 8 == 0 then if z >= 2 || y == roof then 'p' else '.'
    else if z == 2 && x >= 7 && x <= 8 && y <= 4 then 'D'
    else if (z == 2 || z == 15) && x >= 5 && x <= 10 && y % 8 >= 3 && y % 8 <= 5 then 'g'
    else if z < 2 then '.'
    else if x == 0 || x == 15 || z == 2 || z == 15 then '#'
    else if x == 13 && z == 13 && y % 8 == 1 then 'Z'
    else '.';
{
  id: 'gauntlet_city_' + std.toString(storeys),
  lootContext: { usage: ['Residential'], tier: 'Tier1' },
  size: [18, roof + 1, 16],
  palette: {
    '.': 'air', '=': 'concrete', p: 'planks', '#': 'brick', g: 'air',
    D: { furniture: 'wood_door' }, H: { furniture: 'ladder', facing: 'e' },
    Z: { spawn: 'shambler', chance: 0.8 },
  },
  layers: [
    [std.join('', [cell(x, y, z) for x in std.range(0, 17)]) for z in std.range(0, 15)]
    for y in std.range(0, roof)
  ],
  access: {
    ground: 'floor_0', entrance: [8, 1, 8],
    storeys: [{ id: 'floor_' + std.toString(i), floor: i * 8 + 1 } for i in std.range(0, storeys - 1)],
    stairs: [
      {
        from: 'floor_' + std.toString(i), to: 'floor_' + std.toString(i + 1),
        lower: [if i % 2 == 0 then 2 else 11, i * 8 + 1, if i % 2 == 0 then 6 else 12],
        upper: [if i % 2 == 0 then 11 else 2, (i + 1) * 8 + 1, if i % 2 == 0 then 6 else 12],
        width: 2, block: 'planks',
      }
      for i in std.range(0, storeys - 2)
    ],
  },
};
{
  furniture: [{
    id: 'gauntlet_car_wreck', name: 'Placeholder car wreck',
    size: [5, 2, 10], color: '#785e4b',
    shape: [
      { position: [0, 0.4, 0], size: [5, 0.7, 10] },
      { position: [0.4, 1.1, 2.6], size: [4.2, 0.9, 4.6] },
      { position: [0, 0, 1.2], size: [0.6, 1.2, 1.8] },
      { position: [4.4, 0, 1.2], size: [0.6, 1.2, 1.8] },
      { position: [0, 0, 7], size: [0.6, 1.2, 1.8] },
      { position: [4.4, 0, 7], size: [0.6, 1.2, 1.8] },
    ],
  }],
  templates: [building(1), building(2), building(3), {
    id: 'gauntlet_car_wreck', size: [5, 3, 10],
    lootContext: { usage: [], tier: 'Tier1' },
    palette: { '=': 'concrete', W: { furniture: 'gauntlet_car_wreck' } },
    layers: [[std.repeat(if y == 0 then '=' else 'W', 5) for _ in std.range(0, 9)] for y in std.range(0, 2)],
  }],
}
