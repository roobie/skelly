{
  layouts: [{
    id: 'testHouse', demo: true,
    lootContext: { usage: ['Residential'], tier: 'Tier1' },
    bounds: { x0: -6, z0: -7, x1: 17, z1: 6 },
    ground: 20.5, terrain: [],
    buildings: [
      { template: 'test_house_charging', position: [-4.5, 20.5, -2.5], rotation: 0 },
      { template: 'test_house_home', position: [4, 20.5, -4.5], rotation: 0 },
      { template: 'test_house_shed', position: [-5, 20.5, -7], rotation: 0 },
      { template: 'test_house_garden_wall', position: [-2, 20.5, 4.5], rotation: 0 },
      { template: 'test_house_path', position: [-4, 20.5, -1], rotation: 0 },
      { template: 'test_house_step', position: [3, 20.5, -1.5], rotation: 0 },
      { template: 'test_house_outdoor_stock', position: [2, 20.5, 0.5], rotation: 0 },
      { template: 'test_house_sign', position: [-2, 20.5, 0.5], rotation: 0 },
    ],
    player: { position: [-4, 21, -0.5], bearing: 90 },
    vehicles: [{ blueprint: 'hatchback', placementKey: 'testHouse.parked-hatchback', position: [0, 21, -8], facing: 'e' }],
    fixturePiles: [
      [5, 21, -1], [5, 21, -0.5], [5, 21, 0],
      [5.5, 21, -1], [5.5, 21, -0.5], [5.5, 21, 0],
      [6, 21, -1], [6, 21, -0.5], [6, 21, 0],
    ],
    shamblers: [], woodlands: [], tracks: [],
  }],
}
