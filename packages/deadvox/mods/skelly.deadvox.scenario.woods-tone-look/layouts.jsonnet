{
  layouts: [{
    id: 'woodsToneLook',
    demo: true,
    lootContext: { usage: [], tier: 'Tier1' },
    bounds: { x0: -96, z0: -96, x1: 96, z1: 96 },
    ground: 21,
    terrain: [],
    buildings: [],
    tracks: [{ points: [[0, -24], [0, 24]], width: 2, surface: 'dirt' }],
    player: { position: [0, 21.5, 8], bearing: 0 },
    actors: [],
    woodlands: [
      { polygon: [[-96, -96], [48, -96], [48, 48], [-96, 48]], profile: 'woodland' },
      { polygon: [[-96, 0], [96, 0], [96, 96], [-96, 96]], profile: 'meadow' },
    ],
  }],
}
