{
  layouts: [{
    id: 'miscBuildingSupportLook',
    demo: true,
    lootContext: { usage: [], tier: 'Tier1' },
    bounds: { x0: -19, z0: -12, x1: 32, z1: 14 },
    ground: 21,
    terrain: [],
    tracks: [{ points: [[-16, -5], [29, -5]], width: 6, surface: 'asphalt' }],
    buildings: [
      { template: 'village_shop', style: 'village_shop_render', position: [-14, 21, 0], rotation: 0 },
      { template: 'village_shop', style: 'village_shop_brick', position: [0, 21, 0], rotation: 0 },
      { template: 'condition_pavilion_intact', position: [12, 21, 0], rotation: 0 },
      { template: 'condition_pavilion_worn', position: [18, 21, 0], rotation: 0 },
      { template: 'condition_pavilion_nested', position: [24, 21, 0], rotation: 0 },
    ],
    player: { position: [10, 21.5, -2], bearing: 180 },
    actors: [],
    woodlands: [],
  }],
}
