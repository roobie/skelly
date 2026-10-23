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
      { template: 'test_house_home', position: [4, 20.5, -4.5], rotation: 0 },
      { template: 'test_house_shed', position: [-5, 20.5, -7], rotation: 0 },
      { template: 'test_house_garage', position: [-22, 20.5, -12], rotation: 0 },
      { template: 'test_house_garage_ladder', position: [-22.5, 20.5, -8.5], rotation: 0 },
      { template: 'test_house_garden_wall', position: [-2, 20.5, 4.5], rotation: 0 },
      { template: 'test_house_path', position: [-4, 20.5, -1], rotation: 0 },
      { template: 'test_house_step', position: [3, 20.5, -1.5], rotation: 0 },
      { template: 'test_house_outdoor_stock', position: [2, 20.5, 0.5], rotation: 0 },
      { template: 'test_house_sign', position: [-2, 20.5, 0.5], rotation: 0 },
      { template: 'test_house_loose_wardrobe', position: [-2, 20.5, -3], rotation: 0 },
      // East of both bays' drive-out lanes.
      { template: 'test_house_showroom', position: [-12.5, 20.5, 0], rotation: 0 },
    ],
    // On the showroom deck; the bearing applies only while the slot row is empty, since spawn faces the newest slot.
    player: { position: [-3.25, 21.5, 4.25], bearing: 0 },
    showroom: {
      row: [-11.5, 21.5, 2.5],
      facing: 's',
      spacing: 1,
      capacity: 4,
      // A feature's test prop goes here, never in the house, garage or hall. Oldest first: past capacity, the first
      // entry leaves.
      slots: [
        { furniture: 'flimsy_wood_door' },
        { furniture: 'bedroll' },
        { furniture: 'grinding_wheel', fixed: true },
      ],
      focusDistance: 1,
      // South of the lot and clear of the range; debug only (`docs/test-house.md`, "Showroom").
      catalogue: { position: [-23, 21, 12], width: 50, spacing: 2, floor: 'concrete', blend: 4 },
    },
    bays: bays,
    vehicles: [{ blueprint: 'hatchback', placementKey: 'testHouse.parked-hatchback' } + bays[0]],
    repairStock: 'test_house_garage',
    shamblers: [], woodlands: [], tracks: [],
  }],
}
