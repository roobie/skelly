local layout = (import '../skelly.deadvox.scenario.test-house.lamp-cube-one/layouts.jsonnet').layouts[0];
{
  layouts: [layout + {
    id: 'testHouseLampCubeMany',
    buildings: [
      building + (if building.template == 'test_house_lamp_cube_room' then { template: 'test_house_lamp_cube_strips' } else {})
      for building in layout.buildings
    ],
  }],
}
