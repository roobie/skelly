// The gauntlet wreck look's fixture site: a flat street with the wreck templates parked in a row on its
// north side, so the look link's start stands on the asphalt facing whole cars of different kinds. The
// templates are the gauntlet city's own street-wreck templates, so the look shows the cars exactly as the
// streets draw them; a layout keeps the arrangement fixed, where the city's seeded street-prop draw does not.
{
  layouts: [{
    id: 'gauntletStreetWrecks',
    demo: true,
    lootContext: { usage: [], tier: 'Tier1' },
    bounds: { x0: -28, z0: -10, x1: 28, z1: 10 },
    ground: 21,
    terrain: [],
    // One street, east to west, wide enough to stand on; the wrecks park against its north side.
    tracks: [{ points: [[-26, -1.5], [26, -1.5]], width: 8, surface: 'asphalt' }],
    buildings: [
      // Quarter-turned, so each car shows its flank to the player: a stripped muscle car, an intact
      // hatchback and police car, and a front-stripped box van, the four shapes a look must tell apart.
      { template: 'gauntlet_car_wreck_muscle_car_doors', position: [-13.5, 21, -4.5], rotation: 90 },
      { template: 'gauntlet_car_wreck_hatchback_intact', position: [-7, 21, -4.5], rotation: 90 },
      { template: 'gauntlet_car_wreck_police_car_intact', position: [-1.5, 21, -4.5], rotation: 90 },
      { template: 'gauntlet_car_wreck_box_van_front', position: [5, 21, -5], rotation: 90 },
    ],
    player: { position: [-1, 21.5, 1.5], bearing: 0 },
    actors: [],
    woodlands: [],
  }],
}
