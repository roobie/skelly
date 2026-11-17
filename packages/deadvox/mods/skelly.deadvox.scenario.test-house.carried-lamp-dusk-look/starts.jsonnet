local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
local lamp = import '../skelly.deadvox.scenario.test-house.carried-lamp/carried-lamp.libsonnet';
// Just after sunset, while the sky still lights the ground.
{
  starts: [
    lamp.start('carriedlampdusk', 'testHouseCarriedLampOutdoors', '19:45', [-32, 42, 29]) + kit.notSiteDefault,
  ],
}
