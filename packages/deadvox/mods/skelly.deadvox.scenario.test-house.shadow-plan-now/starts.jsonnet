local start = (import '../skelly.deadvox.scenario.test-house.item-vehicle-light-look/starts.jsonnet').starts[0];
local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
{
  starts: [start + kit.notSiteDefault + {
    id: 'shadowplannow',
    site: 'testHouseItemVehicleLightLook',
  }],
}
