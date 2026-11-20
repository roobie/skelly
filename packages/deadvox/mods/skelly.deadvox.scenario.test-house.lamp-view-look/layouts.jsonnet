local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
{
  layouts: [layout + {
    id: 'testHouseLampView',
    player: { position: [3, 21, -26], bearing: 180 },
    showroom: layout.showroom + { slots: [] },
    buildings: layout.buildings + [
      { template: 'lamp_view_rooms', position: [0, 20.5, -22], rotation: 0 },
      { template: 'lamp_view_spill', position: [10, 20.5, -27], rotation: 0 },
    ],
  }],
}
