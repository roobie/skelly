local start = (import '../skelly.deadvox.scenario.test-house.item-light-look/starts.jsonnet').starts[0];
{
  starts: [start + {
    id: 'itemvehiclelightlook',
    site: 'testHouseItemVehicleLightLook',
  }],
}
