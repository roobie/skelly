// The town house look's fixture site: a street with the detached town house in both its styles, fronts to
// the street, so one walk compares the facades.
{
  layouts: [{
    id: 'townHouseLook',
    demo: true,
    lootContext: { usage: [], tier: 'Tier1' },
    bounds: { x0: -16, z0: -14, x1: 16, z1: 14 },
    ground: 21,
    terrain: [],
    tracks: [{ points: [[-13, -5], [13, -5]], width: 6, surface: 'asphalt' }],
    buildings: [
      { template: 'gauntlet_city_villa', style: 'villa_brick', position: [-11, 21, 0], rotation: 0 },
      { template: 'gauntlet_city_villa', style: 'villa_rendered', position: [1, 21, 0], rotation: 0 },
    ],
    player: { position: [-0.5, 21.5, -6], bearing: 180 },
    actors: [],
    woodlands: [],
  }],
}
