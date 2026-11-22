local houses = import 'rural-house.jsonnet';
local plots = import 'rural-plot.jsonnet';
local named(rows, id) = std.filter(function(row) row.id == id, rows)[0];
local shell = named(houses.mapPieces, 'rural_flat_house_shell');
local roof = named(houses.mapPieces, 'rural_flat_house_roof');
local house = named(houses.mapAssemblies, 'rural_flat_roof_house');
local plot = named(plots.mapAssemblies, 'rural_plot_privy');
local condition = { mean: 0.4, spread: 0.12, paneThreshold: 0.65 };
// Only the west front wall is breached. The unchanged back plan remains the intact
// shell's own plan, so changing a partition cannot silently fork its damaged twin.
local fronts = [
  ['..................', '.sssssss..sssssss.', '.s..............s.', '................s.', '................s.', '................s.', '................s.'],
  ['..................', '.######b..b######.', '.#..............#.', '................#.', '................#.', '................#.', '................#.'],
  ['..................', '.##...#b..b#...##.', '.#..............#.', '..................', '..................', '..................', '................#.'],
  ['..................', '.##...#b..b#...##.', '.#..............#.', '..................', '..................', '..................', '................#.'],
  ['..................', '.##...#bbbb#...##.', '.#..............#.', '..................', '..................', '..................', '................#.'],
  ['..................', '.##fff#bbbb#fff##.', '.#..............#.', '................f.', '................f.', '................f.', '................#.'],
];
local claims = [
  ['.......RRRR.......', '.SSSSSSS..SSSSSSS.', '.S......RR......S.', '.A......RRRRRR..S.', '.A......RRRRRR..S.', '.A..RRRRRR..RR..S.', '.A..RRRRRR..RR..S.'],
  ['.......RRRR.......', '.SSSSSSS..SSSSSSS.', '.S......RR......S.', '.A......RRRRRR..S.', '.A......RRRRRR..S.', '.A..RRRRRR..RR..S.', '.A..RRRRRR..RR..S.'],
  ['.......RRRR.......', '.SS...SS..SS...SS.', '.S......RR......S.', '........RRRRRR....', '........RRRRRR....', '....RRRRRR..RR....', '.A..RRRRRR..RR..S.'],
  ['.......RRRR.......', '.SS...SS..SS...SS.', '.S......RR......S.', '........RRRRRR....', '........RRRRRR....', '....RRRRRR..RR....', '.A..RRRRRR..RR..S.'],
  ['.......RRRR.......', '.SS...SSSSSS...SS.', '.S......RR......S.', '........RRRRRR....', '........RRRRRR....', '....RRRRRR..RR....', '.A..RRRRRR..RR..S.'],
  ['.......RRRR.......', '.SSSSSSSSSSSSSSSS.', '.S......RR......S.', '.A......RRRRRR..S.', '.A......RRRRRR..S.', '.A..RRRRRR..RR..S.', '.A..RRRRRR..RR..S.'],
];
local breachedShell = shell + {
  id: 'rural_flat_house_breached_shell',
  aftermath: ['broken'],
  layers: [fronts[y] + shell.layers[y][7:] for y in std.range(0, 5)],
  ownership: { layers: [claims[y] + shell.ownership.layers[y][7:] for y in std.range(0, 5)] },
};
// The missing west window has its own air owner; it is not a zero-condition frame.
local absentWindow = {
  id: 'rural_flat_house_absent_west_window',
  size: [1, 3, 3], style: shell.style, lootContext: shell.lootContext,
  palette: { '.': { role: 'opening', material: 'opening' } },
  layers: [['.', '.', '.'] for _ in [1, 2, 3]],
  ownership: { layers: [['A', 'A', 'A'] for _ in [1, 2, 3]] },
  anchors: {}, ports: [], aftermath: ['broken'],
};
// The roof opening meets the missing wall, rather than leaving a floating slab
// above it. Everything beyond the west front strip stays owned by the intact roof.
local roofFronts = [
  ['cccccccccccccccccc', 'crrrrrrrrrrrrrrrrc', 'crrrrrrrrrrrrrrrrc', '....rrrrrrrrrrrrrc', '....rrrrrrrrrrrrrc', '....rrrrrrrrrrrrrc', '....rrrrrrHrrrrrrc'],
  ['..................', '.################.', '.#uuuuuuuuuuuuuu#.', '....uuuuuuuuuuuu#.', '....uuuuuuuuuuuu#.', '....uuuuuuuuuuuu#.', '....uuuuuuHuuuuu#.'],
  ['..................', '.kkkkkkkkkkkkkkkk.', '.k..............k.', '................k.', '................k.', '................k.', '..........H.....k.'],
];
local roofClaims = [
  ['SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS', 'AAAASSSSSSSSSSSSSS', 'AAAASSSSSSSSSSSSSS', 'AAAASSSSSSSSSSSSSS', 'AAAASSSSSSSSSSSSSS'],
  ['..................', '.SSSSSSSSSSSSSSSS.', '.SSSSSSSSSSSSSSSS.', '.AAASSSSSSSSSSSSS.', '.AAASSSSSSSSSSSSS.', '.AAASSSSSSSSSSSSS.', '.AAASSSSSSSSSSSSS.'],
  ['..................', '.SSSSSSSSSSSSSSSS.', '.SAAAAAAAAAAAAAAS.', '.AAAAAAAAAAAAAAAS.', '.AAAAAAAAAAAAAAAS.', '.AAAAAAAAAAAAAAAS.', '.AAAAAAAAASAAAAAS.'],
];
local breachedRoof = roof + {
  id: 'rural_flat_house_breached_roof', aftermath: ['broken'],
  layers: [roofFronts[y] + roof.layers[y][7:] for y in [0, 1, 2]] + [roof.layers[3]],
  ownership: { layers: [roofClaims[y] + roof.ownership.layers[y][7:] for y in [0, 1, 2]] + [roof.ownership.layers[3]] },
};
local only(kind, id) = [{ ref: { kind: kind, id: id }, weight: 1 }];
local breachedHouse = house + {
  id: 'rural_flat_roof_house_breached',
  condition: condition,
  slots: [
    part + (if part.id == 'shell' then { choices: only('piece', breachedShell.id) }
            else if part.id == 'roof' then { choices: only('piece', breachedRoof.id) }
            else if part.id == 'west_front' then { choices: only('piece', absentWindow.id) }
            else {})
    for part in house.slots
  ],
};
{
  mapPieces: [breachedShell, breachedRoof, absentWindow],
  mapAssemblies: [breachedHouse, plot + {
    id: 'rural_plot_privy_breached',
    slots: [part + (if part.id == 'house' then { choices: only('assembly', breachedHouse.id) } else {}) for part in plot.slots],
  }],
}
