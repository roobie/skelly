local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
{
  layouts: [layout + {
    id: 'testHouseLampCube',
    player: { position: [3.2, 21, -19.25], bearing: 90 },
    showroom: layout.showroom + { slots: [] },
    buildings: layout.buildings + [{ template: 'test_house_lamp_cube_room', position: [0, 20.5, -22], rotation: 0 }],
  }],
}
