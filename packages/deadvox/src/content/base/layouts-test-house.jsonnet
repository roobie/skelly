// Bay 1 holds the parked hatchback; bay 2 stays empty floor for vehicle part work.
local bays = [
  { position: [-19, 21, -7], facing: 'e' },
  { position: [-14, 21, -7], facing: 'e' },
];
local liquidRecoveryStock = [
  {
    item: 'oil_lamp', placement: 'surface',
    craftedLiquids: [{ liquid: 'lamp_fuel', volumeMicrolitres: 400000 }],
    // Provenance is the recovery input; the independent reservoir is not part of it.
    liquidContents: { kind: 'empty' },
  },
  {
    item: 'lamp_oil', placement: 'surface',
    liquidContents: { kind: 'filled', liquid: 'lamp_fuel', volumeMicrolitres: 500000 },
  },
  { item: 'lamp_oil', placement: 'surface', liquidContents: { kind: 'empty' } },
];
{
  layouts: [{
    id: 'testHouse', demo: true,
    lootContext: { usage: ['Residential'], tier: 'Tier1' },
    weatheringProfile: 'proper',
    bounds: { x0: -240, z0: -80, x1: 270, z1: 340 },
    ground: 20.5,
    terrain: [
      { kind: 'hill', centre: [-48, -25], radii: [30, 24], rise: 5 },
      { kind: 'hill', centre: [40, -12], radii: [25, 24], rise: 3 },
      { kind: 'hill', centre: [-60, 38], radii: [45, 32], rise: 5 },
      { kind: 'basin', centre: [30, 115], radii: [190, 95], depth: 9 },
      { kind: 'ridge', points: [[-200, 210], [-90, 235], [60, 230], [225, 205]], width: 70, rise: 26 },
      { kind: 'hill', centre: [115, 235], radii: [65, 48], rise: 36 },
    ],
    water: [{
      level: 19.5, shore: 2,
      polygon: [[-165, 115], [-120, 35], [25, 20], [165, 35], [225, 115], [165, 195], [25, 215], [-120, 195]],
    }],
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
    player: { position: [-7.5, 21.5, -0.5], bearing: 90 },
    showroom: {
      row: [-12, 21.5, -1],
      facing: 's',
      spacing: 1,
      capacity: 3,
      // A feature's test prop goes here, never in the house, garage or hall. Oldest first: past capacity, the first
      // entry leaves.
      slots: [
        {
          furniture: 'crate',
          items: [
            { item: item, count: 1, placement: 'surface' }
            for item in [
              'hand_saw', 'screwdriver', 'copper_wire', 'small_spring', 'hinge_set', 'fastener_pack', 'taped_flashlight_mount', 'scrap_foregrip',
              'camp_craft_book', 'workshop_notes', 'cloth_strip', 'cloth_strip', 'flashlight', 'aa_battery', 'baseball_bat', 'hammer',
              'nails', 'nails', 'nails', 'nails', 'nails', 'nails', 'nails', 'nails', 'nails', 'nails', 'nails', 'nails',
              'stick', 'kitchen_knife', 'nylon_cord',
            ]
          ] + [
            { item: 'paperback', count: 4 },
            { item: 'duct_tape', count: 2 },
          ],
        },
        {
          furniture: 'shelf',
          placement: { position: [-6.5, 21.5, 0.5], facing: 'n' },
          items: [
            { item: 'sledgehammer', count: 1 },
            { item: 'paperback', count: 1 },
          ],
        },
        { furniture: 'workbench', items: liquidRecoveryStock },
      ],
      focusDistance: 1,
      // West of the haven, clear of the lake and beyond the startup ring; debug only (`docs/test-house.md`, "Showroom").
      catalogue: { position: [-160, 21, -60], width: 50, spacing: 2, floor: 'concrete', blend: 4 },
    },
    bays: bays,
    vehicles: [{ blueprint: 'hatchback', placementKey: 'testHouse.parked-hatchback' } + bays[0]],
    repairStock: 'test_house_garage',
    handlingRange: { beside: { x0: -23, z0: -13, x1: 17, z1: 6 }, floor: 21 },
    shamblers: [],
    woodlands: [{ polygon: [[-85, -65], [-32, -65], [-28, -18], [-26, 45], [-80, 65]], density: 0.95 }],
    tracks: [
      { points: [[-4, -0.5], [3.5, -0.5]], width: 1, surface: 'dressed_stone' },
      { points: [[6, 6], [6, 12], [12, 25]], width: 1, surface: 'dressed_stone' },
    ],
  }],
}
