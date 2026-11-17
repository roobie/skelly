local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
local lamp = import '../skelly.deadvox.scenario.test-house.carried-lamp/carried-lamp.libsonnet';
// The tester stands in the sunlit doorway facing into the room, where the camera's daylight adaptation is strong.
{ starts: [lamp.start('carriedlampdoorway', 'testHouseCarriedLampDoorway', kit.day.noonGameTimeOfDay, [-21, 42, 32])] }
