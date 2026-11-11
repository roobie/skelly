local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
local amalgam = { type: 'amalgam', position: [-8, 21, 14] };
local debugHouse = layout + {
  showroom: layout.showroom + {
    catalogue: { position: [-160, 21, -60], width: 50, spacing: 2, floor: 'concrete', blend: 4 },
  },
  buildings: [
    building + (if building.template == 'test_house_garage'
                then { fixedLoot: import 'test-house-garage.libsonnet' }
                else {})
    for building in layout.buildings
  ] + [{
    template: 'test_house_range', position: [52.5, 21, -13.5], rotation: 0,
    lootContext: { usage: ['Residential', 'Hunting', 'Police', 'Military'], tier: 'Tier4', lowerTiers: true },
    fixedLoot: [{ at: [3, 1, 24], items: import 'test-house-rack.libsonnet' }],
  }],
  // One amalgam in the open south of the garden wall, to look at carving; the range rack's shotgun carves it.
  actors: layout.actors + [amalgam],
};
{
  templates: [import 'test-house-range.libsonnet'],
  layouts: [
    debugHouse,
    // The amalgam look's fixture site: the same house with the player standing east of the amalgam, facing it.
    debugHouse + {
      id: 'testHouseAmalgam',
      player: { position: [amalgam.position[0] + 7, 21, amalgam.position[2]], bearing: 270 },
    },
  ],
}
