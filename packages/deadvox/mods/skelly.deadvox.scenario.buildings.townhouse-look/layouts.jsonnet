// The townhouse look's fixture site: every briefed townhouse kind along two streets, brick on the near one and
// concrete on the far one, fronts to the street, so one walk compares each kind's facade, rooms and drainage in
// both styles without waiting on the city pool to roll them.
local kinds = ['gauntlet_city_1', 'gauntlet_city_2', 'gauntlet_city_3', 'gauntlet_city_cellar'];
local row(style, z) = [
  { template: kinds[i], style: style, position: [-40 + 20 * i, 21, z], rotation: 0 }
  for i in std.range(0, std.length(kinds) - 1)
];
{
  layouts: [{
    id: 'townhouseLook',
    demo: true,
    lootContext: { usage: [], tier: 'Tier1' },
    bounds: { x0: -44, z0: -14, x1: 44, z1: 46 },
    ground: 21,
    terrain: [],
    tracks: [
      { points: [[-41, -5], [41, -5]], width: 6, surface: 'asphalt' },
      { points: [[-41, 21], [41, 21]], width: 6, surface: 'asphalt' },
    ],
    buildings: row('brick_townhouse', 0) + row('concrete_townhouse', 26),
    player: { position: [-31.5, 21.5, -6], bearing: 180 },
    actors: [],
    woodlands: [],
  }],
}
