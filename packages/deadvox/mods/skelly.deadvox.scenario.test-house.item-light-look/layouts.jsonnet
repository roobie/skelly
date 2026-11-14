local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
{
  layouts: [layout + {
    id: 'testHouseItemLightLook',
    player: { position: [2.5, 21, -10.75], bearing: 180 },
    showroom: layout.showroom + { slots: [] },
  }],
}
