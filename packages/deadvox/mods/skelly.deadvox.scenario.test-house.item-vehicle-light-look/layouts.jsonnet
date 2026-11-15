local layout = (import '../skelly.deadvox.scenario.test-house.item-light-look/layouts.jsonnet').layouts[0];
{
  layouts: [layout + {
    id: 'testHouseItemVehicleLightLook',
    player: { position: [-17.5, 21, -2.8], bearing: 20 },
  }],
}
