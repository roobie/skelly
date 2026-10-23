// Bay 1 holds the parked hatchback; bay 2 stays empty floor for vehicle part work.
local bays = [
  { position: [-19, 21, -7], facing: 'e' },
  { position: [-14, 21, -7], facing: 'e' },
];
{
  layouts: [{
    id: 'testHouse', demo: true,
    lootContext: { usage: ['Residential'], tier: 'Tier1' },
    bounds: { x0: -23, z0: -13, x1: 17, z1: 6 },
    ground: 20.5, terrain: [],
    buildings: [
      { template: 'test_house_charging', position: [-4.5, 20.5, -2.5], rotation: 0 },
      { template: 'test_house_home', position: [4, 20.5, -4.5], rotation: 0 },
      { template: 'test_house_shed', position: [-5, 20.5, -7], rotation: 0 },
      { template: 'test_house_garage', position: [-22, 20.5, -12], rotation: 0 },
      { template: 'test_house_garden_wall', position: [-2, 20.5, 4.5], rotation: 0 },
      { template: 'test_house_path', position: [-4, 20.5, -1], rotation: 0 },
      { template: 'test_house_step', position: [3, 20.5, -1.5], rotation: 0 },
      { template: 'test_house_outdoor_stock', position: [2, 20.5, 0.5], rotation: 0 },
      { template: 'test_house_sign', position: [-2, 20.5, 0.5], rotation: 0 },
    ],
    player: { position: [-4, 21, -0.5], bearing: 90 },
    bays: bays,
    vehicles: [{ blueprint: 'hatchback', placementKey: 'testHouse.parked-hatchback' } + bays[0]],
    repairStock: 'test_house_garage',
    shamblers: [], woodlands: [], tracks: [],
  }],
}
