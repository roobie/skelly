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
      { template: 'test_house_showroom', position: [-12.5, 20.5, -3], rotation: 0 },
      // Behind the house, clear of the showroom deck; its doorway opens north.
      { template: 'test_house_reading_booth', position: [0, 20.5, -11.5], rotation: 0 },
    ],
    // On the showroom deck, on the path's line to the house door; the bearing applies only while the slot row is empty,
    // since spawn faces the newest slot.
    player: { position: [-6.25, 21.5, -0.5], bearing: 90 },
    showroom: {
      row: [-12, 21.5, -1],
      facing: 's',
      spacing: 1,
      capacity: 3,
      // A feature's test prop goes here, never in the house, garage or hall. Oldest first: past capacity, the first
      // entry leaves.
      slots: [
        { furniture: 'flimsy_wood_door' },
        { furniture: 'bedroll' },
        { furniture: 'grinding_wheel', fixed: true },
      ],
      focusDistance: 1,
      // South of the lot, clear of the range and beyond the startup ring; debug only (`docs/test-house.md`, "Showroom").
      catalogue: { position: [-23, 21, 80], width: 50, spacing: 2, floor: 'concrete', blend: 4 },
    },
    bays: bays,
    vehicles: [{ blueprint: 'hatchback', placementKey: 'testHouse.parked-hatchback' } + bays[0]],
    repairStock: 'test_house_garage',
    shamblers: [], woodlands: [], tracks: [],
  }],
}
