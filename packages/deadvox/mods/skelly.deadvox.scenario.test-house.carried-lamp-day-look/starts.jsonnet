local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
local lamp = import '../skelly.deadvox.scenario.test-house.carried-lamp/carried-lamp.libsonnet';
{ starts: [lamp.start('carriedlampday', 'testHouseCarriedLampOutdoors', kit.day.noonGameTimeOfDay, [-32, 42, 29])] }
