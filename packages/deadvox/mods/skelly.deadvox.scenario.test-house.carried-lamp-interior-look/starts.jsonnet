local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
local lamp = import '../skelly.deadvox.scenario.test-house.carried-lamp/carried-lamp.libsonnet';
// Noon outside, so the back room is dark only because the partition walls off the doorway.
{ starts: [lamp.start('carriedlampinterior', 'testHouseCarriedLampInterior', kit.day.noonGameTimeOfDay, [-18, 42, 40])] }
