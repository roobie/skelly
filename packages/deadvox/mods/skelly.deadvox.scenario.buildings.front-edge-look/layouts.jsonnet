// The front-edge look's fixture site: a country road with the rotated witness, a hall whose declared front is south,
// turned so that front faces the road, beside a north-front hall standing at no turn. Both doorways must read on the
// road side: same road, same brief, fronts declared by each building and turned by the placement alone.
{
  layouts: [{
    id: 'frontEdgeLook',
    demo: true,
    lootContext: { usage: [], tier: 'Tier1' },
    bounds: { x0: -28, z0: -14, x1: 16, z1: 12 },
    ground: 21,
    terrain: [],
    tracks: [{ points: [[-25, -8], [13, -8]], width: 6, surface: 'asphalt' }],
    buildings: [
      { template: 'front_hall_south', position: [-20, 21, 0], rotation: 180 },
      { template: 'front_hall_north', position: [-15, 21, 0], rotation: 0 },
    ],
    player: { position: [-17, 21.5, -4], bearing: 180 },
    actors: [],
    woodlands: [],
  }],
}
