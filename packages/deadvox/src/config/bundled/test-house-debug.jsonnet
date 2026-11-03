local layout = (import '../../content/base/layouts-test-house.jsonnet').layouts[0];
{
  id: 'test-house-debug',
  version: '1',
  tier: 'scenario',
  product: false,
  dependencies: ['base'],
  overrides: [{ pack: 'base', entry: 'layouts:' + layout.id }],
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
    ],
  }],
}
