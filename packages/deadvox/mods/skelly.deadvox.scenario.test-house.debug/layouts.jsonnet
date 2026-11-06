local layout = (import '../skelly.deadvox.residual/layouts-test-house.jsonnet').layouts[0];
{
  templates: [import 'test-house-range.libsonnet'],
  layouts: [layout + {
    showroom: layout.showroom + {
      catalogue: {
        furniture: import 'test-house-catalogue.libsonnet',
        position: [-160, 21, -60], width: 50, spacing: 2, floor: 'concrete', blend: 4,
      },
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
  }],
}
